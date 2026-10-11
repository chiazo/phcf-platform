package main

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// ---------------------------------------------------------------------------
// Yearly rollover
//
//	action "archive": copy every member's snapshots, hours and requests for the
//	                  year into legacy_snapshots. Nothing is changed or deleted.
//	                  Safe to repeat.
//	action "reset":   archive, then start fresh. Members in good standing carry
//	                  over with dues, meetings and completed hours zeroed;
//	                  everyone else becomes INACTIVE. Requests and old snapshots
//	                  are removed from the live tables (they stay in legacy).
//
// Both support preview (the default). "reset" takes a database backup first
// and runs one transaction per member, so a failure leaves that member as it
// was and the others unaffected.
// ---------------------------------------------------------------------------

const (
	standingGood     = "GOOD_STANDING"
	standingNotGood  = "NOT_IN_GOOD_STANDING"
	standingInactive = "INACTIVE"
)

type rolloverForm struct {
	Action     string   `json:"action"` // "archive" | "reset"
	Year       int      `json:"year"`
	Preview    *bool    `json:"preview"` // anything but an explicit false previews
	KeepActive []string `json:"keepActive"`
}

type rolloverRow struct {
	MemberID string   `json:"memberId"`
	Name     string   `json:"name"`
	Email    string   `json:"email"`
	Standing string   `json:"standing"`
	Reasons  []string `json:"reasons,omitempty"`
}

type rolloverResult struct {
	Preview          bool          `json:"preview"`
	Action           string        `json:"action"`
	Year             int           `json:"year"`
	Total            int           `json:"total"`
	CarryOver        []rolloverRow `json:"carryOver"`
	Inactive         []rolloverRow `json:"inactive"`
	AlreadyInactive  int           `json:"alreadyInactive"`
	LegacyRows       int           `json:"legacyRows"`
	RequestsRemoved  int           `json:"requestsRemoved"`
	SnapshotsRemoved int           `json:"snapshotsRemoved"`
	Warnings         []string      `json:"warnings"`
	Failures         []string      `json:"failures"`
	Backup           string        `json:"backup,omitempty"`
}

type rolloverInfo struct {
	MemberState string `json:"memberState"`
	Dues        struct {
		AmountPaid float64 `json:"amountPaid"`
		DueState   string  `json:"dueState"`
	} `json:"dues"`
	Requirements struct {
		MeetingsCompleted float64 `json:"meetingsCompleted"`
		MeetingsRequired  float64 `json:"meetingsRequired"`
	} `json:"requirements"`
}

type rolloverMember struct {
	member   *core.Record
	snapshot *core.Record // current snapshot
	formula  *core.Record // newest work_formula row, may be nil
	name     string
	email    string
	standing string
	reasons  []string
}

func (m *rolloverMember) label() string {
	if m.name != "" {
		return m.name
	}
	return m.member.Id
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

func rolloverHandler(app core.App) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		if err := requireAppAdmin(e); err != nil {
			return err
		}

		form := rolloverForm{}
		if err := e.BindBody(&form); err != nil {
			return e.BadRequestError("Could not read request data.", err)
		}
		if form.Action != "archive" && form.Action != "reset" {
			return e.BadRequestError(`action must be "archive" or "reset".`, nil)
		}
		if form.Year < 2000 || form.Year > 2100 {
			return e.BadRequestError("Enter a valid year.", nil)
		}

		preview := form.Preview == nil || *form.Preview
		reviewer := bulkReviewerName(e)

		blocked, err := rolloverBlockedReason(app, form.Year)
		if err != nil {
			return e.InternalServerError("Could not check earlier rollovers.", err)
		}
		if blocked != "" {
			return e.BadRequestError(blocked, nil)
		}

		members, skipped, err := loadRolloverMembers(app)
		if err != nil {
			return e.InternalServerError("Could not load members.", err)
		}

		boxHolders, err := rolloverBoxHolders(app)
		if err != nil {
			return e.InternalServerError("Could not load boxes.", err)
		}

		keep := make(map[string]bool, len(form.KeepActive))
		for _, id := range form.KeepActive {
			keep[id] = true
		}

		result := &rolloverResult{
			Preview:   preview,
			Action:    form.Action,
			Year:      form.Year,
			Total:     len(members),
			CarryOver: []rolloverRow{},
			Inactive:  []rolloverRow{},
			Warnings:  []string{},
			Failures:  []string{},
		}

		for _, id := range skipped {
			result.Warnings = append(result.Warnings,
				"Member "+id+" has no readable current snapshot and was left alone.")
		}

		carry := make(map[string]bool, len(members))
		inactiveWithBox := 0

		for _, m := range members {
			row := rolloverRow{
				MemberID: m.member.Id,
				Name:     m.name,
				Email:    m.email,
				Standing: m.standing,
				Reasons:  m.reasons,
			}

			switch {
			case m.standing == standingInactive:
				result.AlreadyInactive++
			case m.standing == standingGood || keep[m.member.Id]:
				carry[m.member.Id] = true
				result.CarryOver = append(result.CarryOver, row)
			default:
				result.Inactive = append(result.Inactive, row)
				if boxHolders[m.member.Id] {
					inactiveWithBox++
				}
			}
		}

		if form.Action == "reset" && inactiveWithBox > 0 {
			result.Warnings = append(result.Warnings, fmt.Sprintf(
				"%d member(s) who would become inactive still hold a box. Boxes are not changed by the rollover.",
				inactiveWithBox,
			))
		}

		// -------------------------------------------------------------------
		// Preview: count what would happen, change nothing
		// -------------------------------------------------------------------
		if preview {
			pending := 0

			for _, m := range members {
				versions, requests, err := gatherRolloverData(app, m)
				if err != nil {
					return e.InternalServerError("Could not read "+m.label()+"'s data.", err)
				}

				result.LegacyRows += len(versions)

				if form.Action == "reset" {
					result.SnapshotsRemoved += len(versions)
					result.RequestsRemoved += len(requests)
				}
				for _, r := range requests {
					if r.GetString("status") == "PENDING" {
						pending++
					}
				}
			}

			if form.Action == "reset" && pending > 0 {
				result.Warnings = append(result.Warnings, fmt.Sprintf(
					"%d pending request(s) will be closed. They are saved in Legacy as EXPIRED.",
					pending,
				))
			}

			return e.JSON(http.StatusOK, result)
		}

		// -------------------------------------------------------------------
		// Apply
		// -------------------------------------------------------------------
		if form.Action == "reset" {
			name := fmt.Sprintf(
				"pre_rollover_%d_%s.zip",
				form.Year,
				time.Now().UTC().Format("20060102_150405"),
			)
			if err := app.CreateBackup(context.Background(), name); err != nil {
				return e.InternalServerError("Could not create a backup, so nothing was changed.", err)
			}
			result.Backup = name
		}

		for _, m := range members {
			written, removedSnapshots, removedRequests := 0, 0, 0

			err := app.RunInTransaction(func(tx core.App) error {
				legacy, err := tx.FindCollectionByNameOrId("legacy_snapshots")
				if err != nil {
					return err
				}

				versions, requests, err := gatherRolloverData(tx, m)
				if err != nil {
					return err
				}

				written, err = archiveRolloverMember(tx, legacy, m, versions, requests, form.Year, reviewer)
				if err != nil {
					return err
				}

				if form.Action == "reset" {
					if err := resetRolloverMember(tx, m, versions, requests, carry[m.member.Id], form.Year, reviewer); err != nil {
						return err
					}
					removedSnapshots = len(versions)
					removedRequests = len(requests)
				}

				return nil
			})
			if err != nil {
				result.Failures = append(result.Failures, fmt.Sprintf("%s: %v", m.label(), err))
				continue
			}

			result.LegacyRows += written
			result.SnapshotsRemoved += removedSnapshots
			result.RequestsRemoved += removedRequests
		}

		return e.JSON(http.StatusOK, result)
	}
}

// rolloverBlockedReason stops a year from being archived or reset twice, which
// would file the fresh snapshots under the old year.
func rolloverBlockedReason(app core.App, year int) (string, error) {
	fresh, err := app.FindRecordsByFilter(
		"member_snapshot",
		"notes = {:carried} || notes = {:inactive}",
		"",
		1,
		0,
		dbx.Params{
			"carried":  fmt.Sprintf("Carried over from %d.", year),
			"inactive": fmt.Sprintf("Marked inactive after %d.", year),
		},
	)
	if err != nil {
		return "", err
	}
	if len(fresh) > 0 {
		return fmt.Sprintf("%d has already been rolled over.", year), nil
	}

	later, err := app.FindRecordsByFilter(
		"legacy_snapshots",
		"year > {:year}",
		"",
		1,
		0,
		dbx.Params{"year": year},
	)
	if err != nil {
		return "", err
	}
	if len(later) > 0 {
		return fmt.Sprintf("A later year than %d has already been archived.", year), nil
	}

	return "", nil
}

// ---------------------------------------------------------------------------
// Loading and classifying members
// ---------------------------------------------------------------------------

func loadRolloverMembers(app core.App) ([]*rolloverMember, []string, error) {
	members := []*core.Record{}
	if err := app.RecordQuery("member").All(&members); err != nil {
		return nil, nil, err
	}

	out := make([]*rolloverMember, 0, len(members))
	skipped := []string{}

	for _, member := range members {
		snapshot, err := app.FindRecordById("member_snapshot", member.GetString("member_snapshot_id"))
		if err != nil {
			skipped = append(skipped, member.Id)
			continue
		}

		formula, err := newestWorkFormula(app, member.Id)
		if err != nil {
			return nil, nil, err
		}

		m := &rolloverMember{member: member, snapshot: snapshot, formula: formula}

		var personal PersonalInfo
		if err := snapshot.UnmarshalJSONField("personal_info", &personal); err == nil {
			m.name = strings.TrimSpace(personal.FirstName + " " + personal.LastName)
			m.email = personal.EmailInfo.PrimaryEmail
		}

		classifyRolloverMember(m)
		out = append(out, m)
	}

	sort.Slice(out, func(i, j int) bool {
		return strings.ToLower(out[i].name) < strings.ToLower(out[j].name)
	})

	return out, skipped, nil
}

func newestWorkFormula(app core.App, memberID string) (*core.Record, error) {
	formulas, err := app.FindRecordsByFilter(
		"work_formula",
		"member_id = {:id}",
		"-created_at",
		1,
		0,
		dbx.Params{"id": memberID},
	)
	if err != nil || len(formulas) == 0 {
		return nil, err
	}
	return formulas[0], nil
}

// Good standing means every requirement is met, the same rule as the
// "All requirements" column in the members table.
func classifyRolloverMember(m *rolloverMember) {
	var info rolloverInfo
	if err := m.snapshot.UnmarshalJSONField("member_info", &info); err != nil {
		m.standing = standingNotGood
		m.reasons = []string{"could not read member info"}
		return
	}

	if info.MemberState == "INACTIVE" {
		m.standing = standingInactive
		return
	}

	if state := info.Dues.DueState; state != "COMPLETE" && state != "PAID" {
		m.reasons = append(m.reasons, "dues not complete")
	}

	if info.Requirements.MeetingsCompleted < info.Requirements.MeetingsRequired {
		m.reasons = append(m.reasons, fmt.Sprintf(
			"meetings %.0f of %.0f",
			info.Requirements.MeetingsCompleted,
			info.Requirements.MeetingsRequired,
		))
	}

	switch {
	case m.formula == nil:
		m.reasons = append(m.reasons, "no work formula row")
	case !rolloverHoursMet(m.formula):
		m.reasons = append(m.reasons, "work/open hours not met")
	}

	if len(m.reasons) == 0 {
		m.standing = standingGood
	} else {
		m.standing = standingNotGood
	}
}

// Open hours can cover work hours, but not the other way round.
func rolloverHoursMet(f *core.Record) bool {
	workRequired, workDone := f.GetInt("work_hours_required"), f.GetInt("work_hours_completed")
	openRequired, openDone := f.GetInt("open_hours_required"), f.GetInt("open_hours_completed")

	spare := openDone - openRequired
	if spare < 0 {
		spare = 0
	}

	return openDone >= openRequired && workDone+spare >= workRequired
}

func rolloverBoxHolders(app core.App) (map[string]bool, error) {
	boxes := []*core.Record{}
	if err := app.RecordQuery("boxes").All(&boxes); err != nil {
		return nil, err
	}

	holders := map[string]bool{}
	for _, box := range boxes {
		for _, id := range box.GetStringSlice("box_members") {
			holders[id] = true
		}
	}

	return holders, nil
}

// ---------------------------------------------------------------------------
// Archive and reset, one member at a time
// ---------------------------------------------------------------------------

func gatherRolloverData(app core.App, m *rolloverMember) ([]*core.Record, []*core.Record, error) {
	versions, err := app.FindRecordsByFilter(
		"member_snapshot",
		"member_id = {:member} || id = {:current}",
		"created_at",
		0,
		0,
		dbx.Params{"member": m.member.Id, "current": m.snapshot.Id},
	)
	if err != nil {
		return nil, nil, err
	}

	requests, err := app.FindRecordsByFilter(
		"requirement_update_request",
		"user_id = {:user}",
		"created_at",
		0,
		0,
		dbx.Params{"user": m.member.GetString("user_id")},
	)
	if err != nil {
		return nil, nil, err
	}

	return versions, requests, nil
}

func rolloverRequestsPayload(requests []*core.Record) []map[string]any {
	out := make([]map[string]any, 0, len(requests))

	for _, r := range requests {
		status := r.GetString("status")
		if status == "PENDING" {
			status = "EXPIRED" // closed by the rollover
		}

		out = append(out, map[string]any{
			"request_type":   r.GetString("request_type"),
			"quantity":       r.GetFloat("quantity"),
			"payment_type":   r.GetString("payment_type"),
			"activity":       r.GetString("activity"),
			"project_leader": r.GetString("project_leader"),
			"occurred_at":    r.GetInt("occurred_at"),
			"status":         status,
			"reviewed_by":    r.GetString("reviewed_by"),
			"notes":          r.GetString("notes"),
			"admin_notes":    r.GetString("admin_notes"),
			"created_at":     r.GetString("created_at"),
		})
	}

	return out
}

func rolloverHoursPayload(f *core.Record) map[string]any {
	if f == nil {
		return nil
	}

	return map[string]any{
		"work_hours_required":  f.GetInt("work_hours_required"),
		"work_hours_completed": f.GetInt("work_hours_completed"),
		"open_hours_required":  f.GetInt("open_hours_required"),
		"open_hours_completed": f.GetInt("open_hours_completed"),
	}
}

// archiveRolloverMember writes every snapshot version into legacy_snapshots.
// The version that was current is marked is_final and carries the year's
// standing, hours and requests. Re-running refreshes the same rows instead of
// duplicating them.
func archiveRolloverMember(
	app core.App,
	legacy *core.Collection,
	m *rolloverMember,
	versions []*core.Record,
	requests []*core.Record,
	year int,
	archivedBy string,
) (int, error) {
	existing, err := app.FindRecordsByFilter(
		"legacy_snapshots",
		"year = {:year} && member_id = {:member}",
		"",
		0,
		0,
		dbx.Params{"year": year, "member": m.member.Id},
	)
	if err != nil {
		return 0, err
	}

	bySource := make(map[string]*core.Record, len(existing))
	for _, r := range existing {
		bySource[r.GetString("source_snapshot_id")] = r
	}

	now := time.Now()
	written := 0

	for _, v := range versions {
		rec := bySource[v.Id]
		if rec == nil {
			rec = core.NewRecord(legacy)
		}

		isFinal := v.Id == m.snapshot.Id

		userID := v.GetString("user_id")
		if userID == "" {
			userID = m.member.GetString("user_id")
		}

		rec.Set("user_id", userID)
		rec.Set("member_id", m.member.Id)
		rec.Set("updated_by", v.GetString("updated_by"))
		rec.Set("notes", v.GetString("notes"))
		rec.Set("personal_info", v.Get("personal_info"))
		rec.Set("member_info", v.Get("member_info"))
		rec.Set("box_info", v.Get("box_info"))
		rec.Set("created_at", v.GetDateTime("created_at"))
		rec.Set("modified_at", v.GetDateTime("modified_at"))
		rec.Set("year", year)
		rec.Set("is_final", isFinal)
		rec.Set("source_snapshot_id", v.Id)
		rec.Set("archived_by", archivedBy)
		rec.Set("archived_at", now)

		if isFinal {
			rec.Set("standing", m.standing)
			rec.Set("hours", rolloverHoursPayload(m.formula))
			rec.Set("requests", rolloverRequestsPayload(requests))
		} else {
			rec.Set("standing", "")
			rec.Set("hours", nil)
			rec.Set("requests", nil)
		}

		if err := app.Save(rec); err != nil {
			return written, fmt.Errorf("could not archive snapshot %s: %w", v.Id, err)
		}
		written++
	}

	return written, nil
}

// resetRolloverMember starts the member's new year: one fresh snapshot, hours
// zeroed, and the old requests and snapshot versions removed (they were just
// archived in the same transaction).
func resetRolloverMember(
	app core.App,
	m *rolloverMember,
	versions []*core.Record,
	requests []*core.Record,
	carry bool,
	year int,
	reviewer string,
) error {
	var info map[string]any
	if err := m.snapshot.UnmarshalJSONField("member_info", &info); err != nil {
		return err
	}
	if info == nil {
		info = map[string]any{}
	}

	if !carry {
		info["memberState"] = "INACTIVE"
	}

	info["dues"] = map[string]any{
		"amountPaid":  0,
		"dueState":    "UNPAID",
		"paymentType": "",
		"duesPaidAt":  0,
	}

	requirements, _ := info["requirements"].(map[string]any)
	if requirements == nil {
		requirements = map[string]any{}
	}
	requirements["meetingsCompleted"] = 0
	requirements["serviceRequirements"] = []any{}
	info["requirements"] = requirements

	collection, err := app.FindCollectionByNameOrId("member_snapshot")
	if err != nil {
		return err
	}

	note := fmt.Sprintf("Carried over from %d.", year)
	if !carry {
		note = fmt.Sprintf("Marked inactive after %d.", year)
	}

	userID := m.snapshot.GetString("user_id")
	if userID == "" {
		userID = m.member.GetString("user_id")
	}

	now := time.Now()
	next := core.NewRecord(collection)
	next.Set("user_id", userID)
	next.Set("member_id", m.member.Id)
	next.Set("updated_by", reviewer)
	next.Set("notes", note)
	next.Set("personal_info", m.snapshot.Get("personal_info"))
	next.Set("member_info", info)
	next.Set("box_info", m.snapshot.Get("box_info"))
	next.Set("meeting_exemption", 0)
	next.Set("created_at", now)
	next.Set("modified_at", now)

	if err := app.Save(next); err != nil {
		return err
	}

	m.member.Set("member_snapshot_id", next.Id)
	if err := app.Save(m.member); err != nil {
		return err
	}

	if m.formula != nil {
		m.formula.Set("work_hours_completed", 0)
		m.formula.Set("open_hours_completed", 0)
		m.formula.Set("modified_at", now)
		if err := app.Save(m.formula); err != nil {
			return err
		}
	}

	// Requests point at snapshots, so they go first
	for _, r := range requests {
		if err := app.Delete(r); err != nil {
			return err
		}
	}
	for _, v := range versions {
		if err := app.Delete(v); err != nil {
			return err
		}
	}

	return nil
}
