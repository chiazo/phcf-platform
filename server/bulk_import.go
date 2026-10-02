package main

import (
	"database/sql"
	"encoding/csv"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// ---------------------------------------------------------------------------
// Shared types and helpers
// ---------------------------------------------------------------------------

type bulkImportRow struct {
	Row     int    `json:"row"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Status  string `json:"status"` // update | unchanged | unmatched | invalid
	Message string `json:"message,omitempty"`
	Before  string `json:"before,omitempty"`
	After   string `json:"after,omitempty"`
}

type bulkImportResult struct {
	Preview   bool            `json:"preview"`
	Updated   int             `json:"updated"`
	Unchanged int             `json:"unchanged"`
	Unmatched int             `json:"unmatched"`
	Invalid   int             `json:"invalid"`
	Rows      []bulkImportRow `json:"rows"`
}

func (r *bulkImportResult) add(row bulkImportRow) {
	switch row.Status {
	case "update":
		r.Updated++
	case "unchanged":
		r.Unchanged++
	case "unmatched":
		r.Unmatched++
	case "invalid":
		r.Invalid++
	}
	r.Rows = append(r.Rows, row)
}

type bulkCSVTable struct {
	headers map[string]int
	rows    [][]string
}

func readBulkCSV(e *core.RequestEvent) (*bulkCSVTable, error) {
	file, _, err := e.Request.FormFile("file")
	if err != nil {
		return nil, errors.New("Attach a CSV file.")
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.FieldsPerRecord = -1
	reader.TrimLeadingSpace = true

	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("Could not read the CSV: %v", err)
	}
	if len(records) < 2 {
		return nil, errors.New("The CSV needs a header row and at least one data row.")
	}

	table := &bulkCSVTable{headers: map[string]int{}, rows: records[1:]}
	for i, h := range records[0] {
		h = strings.TrimPrefix(h, "\ufeff") // Excel adds a BOM
		table.headers[strings.ToLower(strings.TrimSpace(h))] = i
	}

	return table, nil
}

// col returns the index of the first header that matches one of the aliases,
// or -1 if none do.
func (t *bulkCSVTable) col(aliases ...string) int {
	for _, alias := range aliases {
		if i, ok := t.headers[alias]; ok {
			return i
		}
	}
	return -1
}

func bulkCell(row []string, idx int) string {
	if idx < 0 || idx >= len(row) {
		return ""
	}
	return strings.TrimSpace(row[idx])
}

func parseBulkNumber(s string) (float64, error) {
	s = strings.NewReplacer("$", "", ",", "").Replace(strings.TrimSpace(s))
	if s == "" {
		return 0, errors.New("missing value")
	}

	n, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0, err
	}
	if math.IsNaN(n) || math.IsInf(n, 0) {
		return 0, errors.New("not a number")
	}

	return n, nil
}

func parseBulkDate(s string) (int64, error) {
	for _, layout := range []string{"2006-01-02", "1/2/2006", "1/2/06"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.Unix(), nil
		}
	}
	return 0, fmt.Errorf("Unrecognized date %q (use YYYY-MM-DD or M/D/YYYY).", s)
}

func bulkReviewerName(e *core.RequestEvent) string {
	if e.Auth == nil {
		return "admin"
	}
	if name := e.Auth.GetString("name"); name != "" {
		return name
	}
	return e.Auth.Email()
}

// ---------------------------------------------------------------------------
// Email -> member lookup
// ---------------------------------------------------------------------------

type bulkMemberLookup struct {
	byEmail   map[string]*core.Record // lowercase email -> member
	snapshots map[string]*core.Record // snapshot id -> snapshot
}

func buildBulkMemberLookup(app core.App) (*bulkMemberLookup, error) {
	members := []*core.Record{}
	if err := app.RecordQuery("member").All(&members); err != nil {
		return nil, err
	}

	users := []*core.Record{}
	if err := app.RecordQuery("users").All(&users); err != nil {
		return nil, err
	}

	snapshotRecords := []*core.Record{}
	if err := app.RecordQuery("member_snapshot").All(&snapshotRecords); err != nil {
		return nil, err
	}

	lookup := &bulkMemberLookup{
		byEmail:   map[string]*core.Record{},
		snapshots: map[string]*core.Record{},
	}

	for _, s := range snapshotRecords {
		lookup.snapshots[s.Id] = s
	}

	memberByUser := map[string]*core.Record{}
	for _, m := range members {
		memberByUser[m.GetString("user_id")] = m
	}

	// Primary match: the login email on the user account
	for _, u := range users {
		if m, ok := memberByUser[u.Id]; ok {
			lookup.byEmail[strings.ToLower(strings.TrimSpace(u.Email()))] = m
		}
	}

	// Fallback: the contact email on the member's current snapshot, for
	// people who signed up to signup.com or PayPal with a different address
	for _, m := range members {
		snapshot := lookup.snapshots[m.GetString("member_snapshot_id")]
		if snapshot == nil {
			continue
		}

		var personal PersonalInfo
		if err := snapshot.UnmarshalJSONField("personal_info", &personal); err != nil {
			continue
		}

		email := strings.ToLower(strings.TrimSpace(personal.EmailInfo.PrimaryEmail))
		if email == "" {
			continue
		}
		if _, exists := lookup.byEmail[email]; !exists {
			lookup.byEmail[email] = m
		}
	}

	return lookup, nil
}

func (l *bulkMemberLookup) name(member *core.Record) string {
	snapshot := l.snapshots[member.GetString("member_snapshot_id")]
	if snapshot == nil {
		return ""
	}

	var personal PersonalInfo
	if err := snapshot.UnmarshalJSONField("personal_info", &personal); err != nil {
		return ""
	}

	return strings.TrimSpace(personal.FirstName + " " + personal.LastName)
}

// ---------------------------------------------------------------------------
// Open hours import (e.g. a signup.com export)
//
// Columns: Email, Open Hours Completed
// Rows with the same email are added together; the total REPLACES the
// member's open_hours_completed, so re-importing the same file is harmless.
// ---------------------------------------------------------------------------

func importOpenHoursCSV(app core.App) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		if err := requireAppAdmin(e); err != nil {
			return err
		}

		table, err := readBulkCSV(e)
		if err != nil {
			return e.BadRequestError(err.Error(), nil)
		}

		emailCol := table.col("email", "email address", "e-mail")
		hoursCol := table.col("open hours completed", "open hours", "hours")
		if emailCol < 0 || hoursCol < 0 {
			return e.BadRequestError(`The CSV needs "Email" and "Open Hours Completed" columns.`, nil)
		}

		// Preview unless the client explicitly asks to apply
		preview := e.Request.FormValue("preview") != "false"
		result := &bulkImportResult{Preview: preview}

		lookup, err := buildBulkMemberLookup(app)
		if err != nil {
			return e.InternalServerError("Could not load members.", err)
		}

		workFormulaCollection, err := app.FindCollectionByNameOrId("work_formula")
		if err != nil {
			return e.InternalServerError("Could not load work_formula collection.", err)
		}

		type total struct {
			row   int
			hours float64
		}
		totals := map[string]*total{}
		order := []string{}

		for i, row := range table.rows {
			line := i + 2 // header is line 1
			email := strings.ToLower(bulkCell(row, emailCol))
			rawHours := bulkCell(row, hoursCol)

			if email == "" && rawHours == "" {
				continue // blank line
			}
			if email == "" {
				result.add(bulkImportRow{Row: line, Status: "invalid", Message: "Missing email."})
				continue
			}

			hours, err := parseBulkNumber(rawHours)
			if err != nil || hours < 0 || hours != math.Trunc(hours) {
				result.add(bulkImportRow{
					Row:     line,
					Email:   email,
					Status:  "invalid",
					Message: "Open hours must be a whole number (0 or more).",
				})
				continue
			}

			if t, ok := totals[email]; ok {
				t.hours += hours
			} else {
				totals[email] = &total{row: line, hours: hours}
				order = append(order, email)
			}
		}

		now := time.Now()

		for _, email := range order {
			t := totals[email]
			row := bulkImportRow{Row: t.row, Email: email}

			member := lookup.byEmail[email]
			if member == nil {
				row.Status = "unmatched"
				row.Message = "No member with this email."
				result.add(row)
				continue
			}
			row.Name = lookup.name(member)

			wf, err := app.FindFirstRecordByFilter(
				"work_formula",
				"member_id = {:id}",
				dbx.Params{"id": member.Id},
			)
			if err != nil && !errors.Is(err, sql.ErrNoRows) {
				return e.InternalServerError("Could not load work formula for "+email+".", err)
			}

			current := 0
			if wf != nil {
				current = wf.GetInt("open_hours_completed")
			}
			next := int(t.hours)

			row.Before = strconv.Itoa(current)
			row.After = strconv.Itoa(next)

			if wf != nil && current == next {
				row.Status = "unchanged"
				result.add(row)
				continue
			}

			row.Status = "update"

			if !preview {
				if wf == nil {
					wf = core.NewRecord(workFormulaCollection)
					wf.Set("member_id", member.Id)
					wf.Set("work_hours_required", 0)
					wf.Set("work_hours_completed", 0)
					wf.Set("open_hours_required", 0)
					wf.Set("created_at", now)
				}
				wf.Set("open_hours_completed", next)
				wf.Set("modified_at", now)

				if err := app.Save(wf); err != nil {
					row.Status = "invalid"
					row.Message = "Could not save: " + err.Error()
				}
			}

			result.add(row)
		}

		return e.JSON(http.StatusOK, result)
	}
}

// ---------------------------------------------------------------------------
// Dues import (e.g. a PayPal / Venmo export)
//
// Columns: Email, Amount Paid, Payment Type (optional), Date Paid (optional)
// Rows with the same email are added together; the total REPLACES the
// member's amountPaid. Applying creates a NEW member_snapshot (so history is
// kept) and points the member at it, the same way approved requests do.
// ---------------------------------------------------------------------------

func importDuesCSV(app core.App) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		if err := requireAppAdmin(e); err != nil {
			return err
		}

		table, err := readBulkCSV(e)
		if err != nil {
			return e.BadRequestError(err.Error(), nil)
		}

		emailCol := table.col("email", "email address", "e-mail")
		amountCol := table.col("amount paid", "amount", "amount to add")
		typeCol := table.col("payment type", "type", "method")
		dateCol := table.col("dues paid: date", "date paid", "paid at", "date")
		if emailCol < 0 || amountCol < 0 {
			return e.BadRequestError(`The CSV needs "Email" and "Amount Paid" columns.`, nil)
		}

		preview := e.Request.FormValue("preview") != "false"
		result := &bulkImportResult{Preview: preview}

		lookup, err := buildBulkMemberLookup(app)
		if err != nil {
			return e.InternalServerError("Could not load members.", err)
		}

		type total struct {
			row         int
			amount      float64
			paidAt      int64
			paymentType string
		}
		totals := map[string]*total{}
		order := []string{}

		for i, row := range table.rows {
			line := i + 2
			email := strings.ToLower(bulkCell(row, emailCol))
			rawAmount := bulkCell(row, amountCol)

			if email == "" && rawAmount == "" {
				continue
			}
			if email == "" {
				result.add(bulkImportRow{Row: line, Status: "invalid", Message: "Missing email."})
				continue
			}

			amount, err := parseBulkNumber(rawAmount)
			if err != nil || amount < 0 {
				result.add(bulkImportRow{
					Row:     line,
					Email:   email,
					Status:  "invalid",
					Message: "Amount Paid must be a number (0 or more).",
				})
				continue
			}

			var paidAt int64
			if rawDate := bulkCell(row, dateCol); rawDate != "" {
				paidAt, err = parseBulkDate(rawDate)
				if err != nil {
					result.add(bulkImportRow{
						Row:     line,
						Email:   email,
						Status:  "invalid",
						Message: err.Error(),
					})
					continue
				}
			}

			paymentType := strings.ToLower(bulkCell(row, typeCol))

			if t, ok := totals[email]; ok {
				t.amount += amount
				if paidAt > t.paidAt {
					t.paidAt = paidAt
				}
				if paymentType != "" {
					t.paymentType = paymentType
				}
			} else {
				totals[email] = &total{
					row:         line,
					amount:      amount,
					paidAt:      paidAt,
					paymentType: paymentType,
				}
				order = append(order, email)
			}
		}

		reviewer := bulkReviewerName(e)

		for _, email := range order {
			t := totals[email]
			row := bulkImportRow{Row: t.row, Email: email}

			member := lookup.byEmail[email]
			if member == nil {
				row.Status = "unmatched"
				row.Message = "No member with this email."
				result.add(row)
				continue
			}
			row.Name = lookup.name(member)

			snapshot := lookup.snapshots[member.GetString("member_snapshot_id")]
			if snapshot == nil {
				row.Status = "invalid"
				row.Message = "Member has no current snapshot."
				result.add(row)
				continue
			}

			var info MemberInfo
			if err := snapshot.UnmarshalJSONField("member_info", &info); err != nil {
				row.Status = "invalid"
				row.Message = "Could not read the member's current dues."
				result.add(row)
				continue
			}

			amount := math.Round(t.amount*100) / 100
			paymentType := t.paymentType
			if paymentType == "" {
				paymentType = info.Dues.PaymentType
			}
			paidAt := t.paidAt
			if paidAt == 0 {
				paidAt = info.Dues.DuesPaidAt
			}

			row.Before = fmt.Sprintf("$%.2f", info.Dues.AmountPaid)
			row.After = fmt.Sprintf("$%.2f", amount)

			if info.Dues.AmountPaid == amount &&
				info.Dues.PaymentType == paymentType &&
				info.Dues.DuesPaidAt == paidAt {
				row.Status = "unchanged"
				result.add(row)
				continue
			}

			row.Status = "update"

			if !preview {
				err := app.RunInTransaction(func(txApp core.App) error {
					return applyImportedDues(txApp, member, snapshot, amount, paymentType, paidAt, reviewer)
				})
				if err != nil {
					row.Status = "invalid"
					row.Message = "Could not save: " + err.Error()
				}
			}

			result.add(row)
		}

		return e.JSON(http.StatusOK, result)
	}
}

func applyImportedDues(
	app core.App,
	member *core.Record,
	snapshot *core.Record,
	amount float64,
	paymentType string,
	paidAt int64,
	reviewer string,
) error {
	var info map[string]any
	if err := snapshot.UnmarshalJSONField("member_info", &info); err != nil {
		return err
	}
	if info == nil {
		info = map[string]any{}
	}

	dues, _ := info["dues"].(map[string]any)
	if dues == nil {
		dues = map[string]any{}
	}

	dues["amountPaid"] = amount
	if paymentType != "" {
		dues["paymentType"] = paymentType
	}
	if paidAt != 0 {
		dues["duesPaidAt"] = paidAt
	}
	// Same rule as approving an Amount Paid request: any payment completes dues
	if amount > 0 {
		dues["dueState"] = "COMPLETE"
	}
	info["dues"] = dues

	collection, err := app.FindCollectionByNameOrId("member_snapshot")
	if err != nil {
		return err
	}

	now := time.Now()
	next := core.NewRecord(collection)
	next.Set("user_id", snapshot.GetString("user_id"))
	next.Set("member_id", member.Id)
	next.Set("updated_by", reviewer)
	next.Set("notes", "Dues imported from CSV.")
	next.Set("personal_info", snapshot.Get("personal_info"))
	next.Set("member_info", info)
	next.Set("box_info", snapshot.Get("box_info"))
	next.Set("meeting_exemption", snapshot.GetInt("meeting_exemption"))
	next.Set("created_at", now)
	next.Set("modified_at", now)

	if err := app.Save(next); err != nil {
		return err
	}

	member.Set("member_snapshot_id", next.Id)
	return app.Save(member)
}
