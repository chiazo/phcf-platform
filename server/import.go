package main

import (
	"crypto/rand"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// -----------------------------------------------------------------------------
// Import configuration
// -----------------------------------------------------------------------------

// Change this whenever the current year's meeting requirement changes.
const meetingsRequired = 12

const (
	defaultMemberState = "ACTIVE"

	statusBoard        = "Board"
	statusGoodStanding = "Good Standing"
	statusNotMet       = "-"

	temporaryPasswordLength = 24
)

// -----------------------------------------------------------------------------
// CSV column names
// -----------------------------------------------------------------------------

const (
	colFirstName              = "First Name"
	colLastName               = "Last Name"
	colLastNameInitial        = "Last Name Initial"
	colPronouns               = "Pronouns"
	colEmail                  = "Email Address"
	colStatus                 = "Status for 2026 & Exemptions"
	colServiceHoursPercentage = "Service Hours Percentage Required"
	colMeetingExemption       = "Meeting Exemption"
	colDuesPaidDate           = "Dues Paid: Date"
	colAmountPaid             = "Amount Paid"
	colPaymentType            = "Payment Type"
	colOrientationDate        = "Orientation Date"
	colListserv               = "Listserv"
	colSecondaryEmail         = "Secondary Email Address"
	colPhone                  = "Phone Number"
	colSecondaryPhone         = "Secondary Phone Number"
	colStreetAddress          = "Street Address"
	colZipCode                = "Zip Code"
	colJoinDate               = "Join Date"
	colJoinYear               = "Join Year"
	colMemberType             = "Member Type"
	colBoxWaitingList         = "Box Waiting List"
	colBoxWaitingListNumber   = "Box Waiting List Number"
	colWaitlistJoinDate       = "Waitlist Join Date"
	colBoxNumber              = "Box Number"
	colBoxChangeRequestLetter = "Box Change Request Letter"
	colSharingBox             = "Sharing Box"
	colOnLeave                = "On Leave"
	colTillByMay1             = "Till by May 1"
	colNotes                  = "Notes"

	// Optional column. It does not currently exist in the export, but the
	// importer accepts it if it is added to a CSV.
	colMemberState = "Member State"
)

// -----------------------------------------------------------------------------
// Import models
// -----------------------------------------------------------------------------

type memberImportRow struct {
	RowNumber int

	FirstName        string
	LastName         string
	Pronouns         string
	Email            string
	Status           string
	MeetingExemption int

	DuesPaidAt  int64
	AmountPaid  float64
	PaymentType string

	OrientationDate int64

	OnMailingList  bool
	SecondaryEmail string

	PrimaryPhone   string
	SecondaryPhone string

	StreetAddress string
	ZipCode       string

	JoinDate string
	JoinYear string

	MemberType  string
	MemberState string

	BoxWaitingList   bool
	WaitlistPosition string
	WaitlistJoinDate int64

	BoxNumber string

	Notes string
}

type importBox struct {
	BoxNumber string

	MemberIDs []string

	Waitlist []WaitlistEntry
}

type importSummary struct {
	RowsRead int

	UsersCreated int
	UsersUpdated int

	MembersCreated int
	MembersUpdated int

	SnapshotsCreated int
	SnapshotsUpdated int

	BoxesCreated int
	BoxesUpdated int

	Errors []string
}

// -----------------------------------------------------------------------------
// Route
// -----------------------------------------------------------------------------
func runImportCLI(app core.App, args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("CSV file is required")
	}

	dryRun := false
	csvPath := ""

	for _, arg := range args {
		if arg == "--dry-run" {
			dryRun = true
		} else if csvPath == "" {
			csvPath = arg
		} else {
			return fmt.Errorf("unexpected argument: %s", arg)
		}
	}

	if csvPath == "" {
		return fmt.Errorf("CSV file is required")
	}

	return importMembersFromCSV(app, csvPath, dryRun)
}

func importMembersFromCSV(app core.App, csvPath string, dryRun bool) error {
	file, err := os.Open(csvPath)
	if err != nil {
		return fmt.Errorf("open CSV: %w", err)
	}
	defer file.Close()

	rows, err := readMemberCSV(file)
	if err != nil {
		return fmt.Errorf("read CSV: %w", err)
	}

	if len(rows) == 0 {
		return fmt.Errorf("CSV contains no member rows")
	}

	if err := validateImportRows(rows); err != nil {
		return fmt.Errorf("CSV validation failed: %w", err)
	}

	plan, err := buildImportPlan(app, rows)
	if err != nil {
		return fmt.Errorf("could not prepare import: %w", err)
	}

	if dryRun {
		fmt.Printf("DRY RUN\n")
		fmt.Printf("Rows: %d\n", plan.summary.RowsRead)
		fmt.Printf("Users: %d created, %d updated\n",
			plan.summary.UsersCreated,
			plan.summary.UsersUpdated,
		)
		fmt.Printf("Members: %d created, %d updated\n",
			plan.summary.MembersCreated,
			plan.summary.MembersUpdated,
		)
		fmt.Printf("Snapshots: %d created, %d updated\n",
			plan.summary.SnapshotsCreated,
			plan.summary.SnapshotsUpdated,
		)
		fmt.Printf("Boxes: %d created, %d updated\n",
			plan.summary.BoxesCreated,
			plan.summary.BoxesUpdated,
		)

		for _, change := range plan.changes {
			fmt.Println(change)
		}

		return nil
	}

	if err := executeImportPlan(app, plan); err != nil {
		return fmt.Errorf("execute import: %w", err)
	}

	fmt.Printf("Import complete.\n")
	fmt.Printf("Rows: %d\n", plan.summary.RowsRead)
	fmt.Printf("Users: %d created, %d updated\n",
		plan.summary.UsersCreated,
		plan.summary.UsersUpdated,
	)
	fmt.Printf("Members: %d created, %d updated\n",
		plan.summary.MembersCreated,
		plan.summary.MembersUpdated,
	)
	fmt.Printf("Snapshots: %d created, %d updated\n",
		plan.summary.SnapshotsCreated,
		plan.summary.SnapshotsUpdated,
	)
	fmt.Printf("Boxes: %d created, %d updated\n",
		plan.summary.BoxesCreated,
		plan.summary.BoxesUpdated,
	)

	return nil
}

// importMembersCSV handles a multipart/form-data CSV upload.
//
// Expected form fields:
//
//	file=<CSV file>
//	dry_run=true|false
//
// Example:
//
//	POST /api/admin/import-members
//
// The route must be registered from main.go:
//
//	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
//	    se.Router.POST("/api/admin/import-members", importMembersCSV(app))
//	    return se.Next()
//	})

func importMembersCSV(app core.App) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		if err := requireAppAdmin(e); err != nil {
			return err
		}

		dryRun := parseBoolQueryOrForm(e.Request, "dry_run")

		file, _, err := e.Request.FormFile("file")
		if err != nil {
			return e.BadRequestError(
				"Missing CSV file. Upload it using the form field 'file'.",
				err,
			)
		}
		defer file.Close()

		rows, err := readMemberCSV(file)
		if err != nil {
			return e.BadRequestError("Could not read CSV.", err)
		}

		if len(rows) == 0 {
			return e.BadRequestError("CSV contains no member rows.", nil)
		}

		summary := importSummary{
			RowsRead: len(rows),
		}

		// Validate everything before making any writes.
		if err := validateImportRows(rows); err != nil {
			return e.BadRequestError("CSV validation failed.", err)
		}

		// Resolve all existing records and prepare the import plan.
		plan, err := buildImportPlan(app, rows)
		if err != nil {
			return e.InternalServerError(
				"Could not prepare import.",
				err,
			)
		}

		summary = plan.summary

		if dryRun {
			return e.JSON(http.StatusOK, map[string]any{
				"dry_run":           true,
				"meetings_required": meetingsRequired,
				"summary":           summary,
				"changes":           plan.changes,
			})
		}

		if err := executeImportPlan(app, plan); err != nil {
			return e.InternalServerError(
				"Import failed.",
				err,
			)
		}

		return e.JSON(http.StatusOK, map[string]any{
			"dry_run":           false,
			"meetings_required": meetingsRequired,
			"summary":           summary,
		})
	}
}

// -----------------------------------------------------------------------------
// CSV parsing
// -----------------------------------------------------------------------------

func readMemberCSV(r io.Reader) ([]memberImportRow, error) {
	reader := csv.NewReader(r)

	reader.FieldsPerRecord = -1
	reader.TrimLeadingSpace = true
	reader.ReuseRecord = false

	header, err := reader.Read()
	if err != nil {
		return nil, err
	}

	normalizeCSVHeader(header)

	columnIndex := make(map[string]int)

	for i, name := range header {
		name = strings.TrimSpace(name)

		if name == "" {
			continue
		}

		columnIndex[name] = i
	}

	requiredColumns := []string{
		colFirstName,
		colLastName,
		colPronouns,
		colEmail,
		colStatus,
		colMeetingExemption,
		colDuesPaidDate,
		colAmountPaid,
		colPaymentType,
		colOrientationDate,
		colListserv,
		colSecondaryEmail,
		colPhone,
		colSecondaryPhone,
		colStreetAddress,
		colZipCode,
		colJoinDate,
		colJoinYear,
		colMemberType,
		colBoxWaitingList,
		colBoxWaitingListNumber,
		colWaitlistJoinDate,
		colBoxNumber,
		colNotes,
	}

	for _, required := range requiredColumns {
		if _, ok := columnIndex[required]; !ok {
			return nil, fmt.Errorf(
				"missing required CSV column %q",
				required,
			)
		}
	}

	var rows []memberImportRow

	for rowNumber := 2; ; rowNumber++ {
		record, err := reader.Read()

		if errors.Is(err, io.EOF) {
			break
		}

		if err != nil {
			return nil, fmt.Errorf(
				"CSV row %d: %w",
				rowNumber,
				err,
			)
		}

		if isEmptyCSVRow(record) {
			continue
		}

		get := func(column string) string {
			index, ok := columnIndex[column]
			if !ok || index >= len(record) {
				return ""
			}

			return strings.TrimSpace(record[index])
		}

		meetingExemption, err := parseInt(
			get(colMeetingExemption),
			fmt.Sprintf("row %d: %s", rowNumber, colMeetingExemption),
		)
		if err != nil {
			return nil, err
		}

		duesPaidAt, err := parseCSVDate(
			get(colDuesPaidDate),
			fmt.Sprintf("row %d: %s", rowNumber, colDuesPaidDate),
		)
		if err != nil {
			return nil, err
		}

		amountPaid, err := parseMoney(
			get(colAmountPaid),
			fmt.Sprintf("row %d: %s", rowNumber, colAmountPaid),
		)
		if err != nil {
			return nil, err
		}

		orientationDate, err := parseCSVDate(
			get(colOrientationDate),
			fmt.Sprintf("row %d: %s", rowNumber, colOrientationDate),
		)
		if err != nil {
			return nil, err
		}

		onMailingList, err := parseYesNo(
			get(colListserv),
			fmt.Sprintf("row %d: %s", rowNumber, colListserv),
		)
		if err != nil {
			return nil, err
		}

		boxWaitingList, err := parseYesNo(
			get(colBoxWaitingList),
			fmt.Sprintf("row %d: %s", rowNumber, colBoxWaitingList),
		)
		if err != nil {
			return nil, err
		}

		waitlistJoinDate, err := parseCSVDate(
			get(colWaitlistJoinDate),
			fmt.Sprintf("row %d: %s", rowNumber, colWaitlistJoinDate),
		)
		if err != nil {
			return nil, err
		}

		memberState := strings.ToUpper(get(colMemberState))
		if memberState == "" {
			memberState = defaultMemberState
		}

		rows = append(rows, memberImportRow{
			RowNumber: rowNumber,

			FirstName: get(colFirstName),
			LastName:  get(colLastName),
			Pronouns:  get(colPronouns),
			Email:     strings.ToLower(get(colEmail)),
			Status:    normalizeStatus(get(colStatus)),

			MeetingExemption: meetingExemption,

			DuesPaidAt:  duesPaidAt,
			AmountPaid:  amountPaid,
			PaymentType: strings.ToUpper(get(colPaymentType)),

			OrientationDate: orientationDate,

			OnMailingList:  onMailingList,
			SecondaryEmail: get(colSecondaryEmail),

			PrimaryPhone:   get(colPhone),
			SecondaryPhone: get(colSecondaryPhone),

			StreetAddress: get(colStreetAddress),
			ZipCode:       get(colZipCode),

			JoinDate: get(colJoinDate),
			JoinYear: get(colJoinYear),

			MemberType:  strings.ToUpper(get(colMemberType)),
			MemberState: memberState,

			BoxWaitingList:   boxWaitingList,
			WaitlistPosition: get(colBoxWaitingListNumber),
			WaitlistJoinDate: waitlistJoinDate,

			BoxNumber: get(colBoxNumber),

			Notes: get(colNotes),
		})
	}

	return rows, nil
}

func normalizeCSVHeader(header []string) {
	for i := range header {
		header[i] = strings.TrimSpace(
			strings.TrimPrefix(header[i], "\ufeff"),
		)
	}
}

func isEmptyCSVRow(record []string) bool {
	for _, value := range record {
		if strings.TrimSpace(value) != "" {
			return false
		}
	}

	return true
}

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

func validateImportRows(rows []memberImportRow) error {
	seenEmails := make(map[string]int)

	for _, row := range rows {
		if row.FirstName == "" {
			return fmt.Errorf(
				"row %d: First Name is required",
				row.RowNumber,
			)
		}

		if row.LastName == "" {
			return fmt.Errorf(
				"row %d: Last Name is required",
				row.RowNumber,
			)
		}

		if row.Email == "" {
			return fmt.Errorf(
				"row %d: Email Address is required",
				row.RowNumber,
			)
		}

		if !strings.Contains(row.Email, "@") {
			return fmt.Errorf(
				"row %d: invalid email address %q",
				row.RowNumber,
				row.Email,
			)
		}

		if previousRow, exists := seenEmails[row.Email]; exists {
			return fmt.Errorf(
				"rows %d and %d both contain email %q",
				previousRow,
				row.RowNumber,
				row.Email,
			)
		}

		seenEmails[row.Email] = row.RowNumber

		switch row.Status {
		case statusBoard, statusGoodStanding, statusNotMet, "":
		default:
			return fmt.Errorf(
				"row %d: unsupported status %q; expected %q, %q, or %q",
				row.RowNumber,
				row.Status,
				statusGoodStanding,
				statusBoard,
				statusNotMet,
			)
		}

		switch row.MemberState {
		case "ACTIVE", "INACTIVE", "PENDING":
		default:
			return fmt.Errorf(
				"row %d: unsupported Member State %q; expected ACTIVE, INACTIVE, or PENDING",
				row.RowNumber,
				row.MemberState,
			)
		}

		if row.MemberType == "" {
			return fmt.Errorf(
				"row %d: Member Type is required",
				row.RowNumber,
			)
		}

		if row.BoxWaitingList {
			if row.BoxNumber == "" {
				return fmt.Errorf(
					"row %d: a waitlisted member must have a Box Number",
					row.RowNumber,
				)
			}

			if row.WaitlistPosition == "" {
				return fmt.Errorf(
					"row %d: a waitlisted member must have a Box Waiting List Number",
					row.RowNumber,
				)
			}

			position, err := strconv.Atoi(row.WaitlistPosition)
			if err != nil || position <= 0 {
				return fmt.Errorf(
					"row %d: invalid Box Waiting List Number %q",
					row.RowNumber,
					row.WaitlistPosition,
				)
			}

			if row.WaitlistJoinDate == 0 {
				return fmt.Errorf(
					"row %d: a waitlisted member must have a Waitlist Join Date",
					row.RowNumber,
				)
			}
		}

		if row.BoxNumber != "" {
			if _, err := strconv.Atoi(row.BoxNumber); err != nil {
				return fmt.Errorf(
					"row %d: invalid Box Number %q",
					row.RowNumber,
					row.BoxNumber,
				)
			}
		}
	}

	return nil
}

// -----------------------------------------------------------------------------
// Import plan
// -----------------------------------------------------------------------------

type importPlan struct {
	rows []memberImportRow

	people []personImportPlan
	boxes  []boxImportPlan

	summary importSummary
	changes []string
}

type personImportPlan struct {
	row memberImportRow

	user     *core.Record
	member   *core.Record
	snapshot *core.Record

	userExists     bool
	memberExists   bool
	snapshotExists bool

	userPayload     map[string]any
	memberPayload   map[string]any
	snapshotPayload map[string]any
}

type boxImportPlan struct {
	boxNumber string
	existing  *core.Record

	memberEmails []string
	waitlistRows []memberImportRow
}

func buildImportPlan(
	app core.App,
	rows []memberImportRow,
) (*importPlan, error) {
	plan := &importPlan{
		rows: rows,
		summary: importSummary{
			RowsRead: len(rows),
		},
	}

	memberByEmail := make(map[string]*core.Record)
	snapshotByMemberID := make(map[string]*core.Record)

	// Load existing users.
	users, err := loadAllUsers(app)
	if err != nil {
		return nil, fmt.Errorf("load users: %w", err)
	}

	// Load all members.
	members := []*core.Record{}
	if err := app.RecordQuery("member").All(&members); err != nil {
		return nil, fmt.Errorf("load members: %w", err)
	}

	memberByUserID := make(map[string]*core.Record)

	for _, member := range members {
		memberByUserID[member.GetString("user_id")] = member
	}

	// Load all snapshots.
	snapshots := []*core.Record{}
	if err := app.RecordQuery("member_snapshot").All(&snapshots); err != nil {
		return nil, fmt.Errorf("load member snapshots: %w", err)
	}

	for _, snapshot := range snapshots {
		memberID := snapshot.GetString("member_id")
		if memberID != "" {
			snapshotByMemberID[memberID] = snapshot
		}
	}

	// Match existing members to emails through their users.
	for _, user := range users {
		member, ok := memberByUserID[user.Id]
		if !ok {
			continue
		}

		email := strings.ToLower(strings.TrimSpace(
			user.GetString("email"),
		))

		if email != "" {
			memberByEmail[email] = member
		}
	}

	// Existing boxes, keyed by box number.
	existingBoxes, err := loadBoxesByNumber(app)
	if err != nil {
		return nil, fmt.Errorf("load boxes: %w", err)
	}

	// Keep the member ID for every imported email so boxes can be built after
	// users/members are resolved.
	memberIDByEmail := make(map[string]string)

	for _, row := range rows {
		user := users[row.Email]
		member := memberByEmail[row.Email]

		// A user may exist without a member record. In that case we create
		// the missing member instead of creating another user.
		if user == nil {
			plan.summary.UsersCreated++
		} else {
			plan.summary.UsersUpdated++
		}

		if member == nil {
			plan.summary.MembersCreated++
		} else {
			plan.summary.MembersUpdated++
		}

		snapshot := (*core.Record)(nil)

		if member != nil {
			snapshot = snapshotByMemberID[member.Id]
		}

		if snapshot == nil && member != nil {
			// Older data may only have member_snapshot_id on member.
			snapshotID := member.GetString("member_snapshot_id")
			if snapshotID != "" {
				snapshot, _ = app.FindRecordById(
					"member_snapshot",
					snapshotID,
				)
			}
		}

		if snapshot == nil {
			plan.summary.SnapshotsCreated++
		} else {
			plan.summary.SnapshotsUpdated++
		}

		userPayload := buildUserPayload(row)
		memberPayload := buildMemberPayload(row)
		snapshotPayload := buildSnapshotPayload(row)

		personPlan := personImportPlan{
			row: row,

			user:     user,
			member:   member,
			snapshot: snapshot,

			userExists:     user != nil,
			memberExists:   member != nil,
			snapshotExists: snapshot != nil,

			userPayload:     userPayload,
			memberPayload:   memberPayload,
			snapshotPayload: snapshotPayload,
		}

		plan.people = append(plan.people, personPlan)

		if user != nil {
			memberIDByEmail[row.Email] = memberID(member)
		} else {
			// The member ID does not exist yet. It will be populated after
			// creation during execution. Boxes are rebuilt in a second phase.
			memberIDByEmail[row.Email] = ""
		}

		plan.changes = append(
			plan.changes,
			describePersonChange(row, user, member, snapshot),
		)
	}

	// Build the box grouping using existing member IDs where available.
	boxesByNumber := make(map[string]*boxImportPlan)

	for _, row := range rows {
		if row.BoxNumber == "" {
			continue
		}

		boxPlan, ok := boxesByNumber[row.BoxNumber]
		if !ok {
			boxPlan = &boxImportPlan{
				boxNumber: row.BoxNumber,
				existing:  existingBoxes[row.BoxNumber],
			}

			boxesByNumber[row.BoxNumber] = boxPlan
		}

		boxPlan.memberEmails = append(
			boxPlan.memberEmails,
			row.Email,
		)

		if row.BoxWaitingList {
			boxPlan.waitlistRows = append(
				boxPlan.waitlistRows,
				row,
			)
		}
	}

	for _, boxPlan := range boxesByNumber {
		if boxPlan.existing == nil {
			plan.summary.BoxesCreated++
		} else {
			plan.summary.BoxesUpdated++
		}

		plan.boxes = append(plan.boxes, *boxPlan)

		plan.changes = append(
			plan.changes,
			describeBoxChange(*boxPlan),
		)
	}

	return plan, nil
}

// -----------------------------------------------------------------------------
// Payload builders
// -----------------------------------------------------------------------------

func buildUserPayload(row memberImportRow) map[string]any {
	// The password is only used for newly-created users. Existing users are
	// never given a new password.
	return map[string]any{
		"email": row.Email,
		"name":  strings.TrimSpace(row.FirstName + " " + row.LastName),
	}
}

func buildMemberPayload(row memberImportRow) map[string]any {
	return map[string]any{
		"created_at": parseJoinDateForPocketBase(row.JoinDate),
	}
}

func buildSnapshotPayload(row memberImportRow) map[string]any {
	memberInfo := map[string]any{
		"memberType":  row.MemberType,
		"memberState": row.MemberState,

		"orientationDate": row.OrientationDate,

		"requirements": map[string]any{
			"meetingsCompleted": 0,
			"meetingsRequired":  meetingsRequired,
		},

		"dues": map[string]any{
			"amountPaid":  row.AmountPaid,
			"duesPaidAt":  row.DuesPaidAt,
			"paymentType": row.PaymentType,
		},
	}

	// Board status is represented by the role.
	//
	// Good Standing is represented by category.
	//
	// "-" intentionally leaves both unset because it means requirements are
	// not yet met and the member has no board role.
	switch row.Status {
	case statusBoard:
		memberInfo["role"] = "BOARD"

	case statusGoodStanding:
		memberInfo["category"] = "GOOD_STANDING"

	case statusNotMet, "":
		// Intentionally no role/category.

	default:
		// Validation catches this before we get here.
	}

	personalInfo := map[string]any{
		"firstName": row.FirstName,
		"lastName":  row.LastName,
		"pronouns":  row.Pronouns,

		"address": map[string]any{
			"line1":   row.StreetAddress,
			"zipCode": row.ZipCode,
		},

		"emailInfo": map[string]any{
			"primaryEmail":   row.Email,
			"secondaryEmail": row.SecondaryEmail,
			"onMailingList":  row.OnMailingList,
		},

		"phoneInfo": map[string]any{
			"primaryPhoneNumber":   row.PrimaryPhone,
			"secondaryPhoneNumber": row.SecondaryPhone,
		},
	}

	return map[string]any{
		"personal_info": personalInfo,
		"member_info":   memberInfo,
		"box_info": map[string]any{
			"boxId":      nil,
			"assignedAt": 0,
		},
		"meeting_exemption": row.MeetingExemption,
		"notes":             row.Notes,
		"updated_by":        "CSV import",
	}
}

// -----------------------------------------------------------------------------
// Import execution
// -----------------------------------------------------------------------------

func executeImportPlan(
	app core.App,
	plan *importPlan,
) error {
	return app.RunInTransaction(func(txApp core.App) error {
		// memberIDsByEmail gets populated as records are created/found.
		memberIDsByEmail := make(map[string]string)

		for i := range plan.people {
			person := &plan.people[i]

			user, err := upsertUser(
				txApp,
				person,
			)
			if err != nil {
				return fmt.Errorf(
					"row %d (%s): user: %w",
					person.row.RowNumber,
					person.row.Email,
					err,
				)
			}

			person.user = user

			member, err := upsertMember(
				txApp,
				person,
			)
			if err != nil {
				return fmt.Errorf(
					"row %d (%s): member: %w",
					person.row.RowNumber,
					person.row.Email,
					err,
				)
			}

			person.member = member
			memberIDsByEmail[person.row.Email] = member.Id

			snapshot, err := upsertSnapshot(
				txApp,
				person,
			)
			if err != nil {
				return fmt.Errorf(
					"row %d (%s): snapshot: %w",
					person.row.RowNumber,
					person.row.Email,
					err,
				)
			}

			person.snapshot = snapshot
		}

		// Reconstruct boxes after all members have IDs.
		for _, boxPlan := range plan.boxes {
			boxNumber := boxPlan.boxNumber

			memberIDs := []string{}

			waitlist := []WaitlistEntry{}

			for _, person := range plan.people {
				if person.row.BoxNumber != boxNumber {
					continue
				}

				if person.member == nil {
					return fmt.Errorf(
						"box %s: member for %s was not created",
						boxNumber,
						person.row.Email,
					)
				}

				memberIDs = appendUniqueString(
					memberIDs,
					person.member.Id,
				)

				if person.row.BoxWaitingList {
					position, err := strconv.Atoi(
						person.row.WaitlistPosition,
					)
					if err != nil {
						return fmt.Errorf(
							"box %s: invalid waitlist position for %s",
							boxNumber,
							person.row.Email,
						)
					}

					waitlist = append(
						waitlist,
						WaitlistEntry{
							MemberID: person.member.Id,
							JoinDate: person.row.WaitlistJoinDate,
							Position: position,
						},
					)
				}
			}

			// Sort by position so the JSON is deterministic.
			sortWaitlist(waitlist)

			if err := upsertBox(
				txApp,
				boxPlan.existing,
				boxNumber,
				memberIDs,
				waitlist,
			); err != nil {
				return fmt.Errorf(
					"box %s: %w",
					boxNumber,
					err,
				)
			}
		}

		return nil
	})
}

func upsertUser(
	app core.App,
	person *personImportPlan,
) (*core.Record, error) {
	if person.user != nil {
		// Update name/email from the CSV, but deliberately do not touch the
		// password of an existing user.
		person.user.Set("email", person.row.Email)
		person.user.Set(
			"name",
			strings.TrimSpace(
				person.row.FirstName+" "+person.row.LastName,
			),
		)

		if err := app.Save(person.user); err != nil {
			return nil, err
		}

		return person.user, nil
	}

	collection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return nil, err
	}

	user := core.NewRecord(collection)

	user.Set("email", person.row.Email)
	user.Set(
		"name",
		strings.TrimSpace(
			person.row.FirstName+" "+person.row.LastName,
		),
	)

	temporaryPassword, err := generateTemporaryPassword(
		temporaryPasswordLength,
	)
	if err != nil {
		return nil, fmt.Errorf(
			"generate temporary password: %w",
			err,
		)
	}

	user.Set("password", temporaryPassword)
	user.Set("passwordConfirm", temporaryPassword)

	if err := app.Save(user); err != nil {
		return nil, err
	}

	return user, nil
}

func upsertMember(
	app core.App,
	person *personImportPlan,
) (*core.Record, error) {
	if person.member != nil {
		person.member.Set(
			"member_snapshot_id",
			person.member.GetString("member_snapshot_id"),
		)

		// Update created_at because Join Date is the authoritative value
		// coming from the CSV.
		if joinDate := parseJoinDateForPocketBase(person.row.JoinDate); joinDate != "" {
			person.member.Set("created_at", joinDate)
		}

		if err := app.Save(person.member); err != nil {
			return nil, err
		}

		return person.member, nil
	}

	collection, err := app.FindCollectionByNameOrId("member")
	if err != nil {
		return nil, err
	}

	member := core.NewRecord(collection)

	member.Set("user_id", person.user.Id)

	if joinDate := parseJoinDateForPocketBase(person.row.JoinDate); joinDate != "" {
		member.Set("created_at", joinDate)
	}

	// member_snapshot_id is required by your schema, so the snapshot must
	// be created before the member. The execution path therefore handles
	// this through createMemberWithSnapshot.
	//
	// This function is only reached for new members and is replaced below
	// by the two-phase helper.
	return createMemberAndSnapshot(app, member, person)
}

func createMemberAndSnapshot(
	app core.App,
	member *core.Record,
	person *personImportPlan,
) (*core.Record, error) {
	snapshotCollection, err := app.FindCollectionByNameOrId(
		"member_snapshot",
	)
	if err != nil {
		return nil, err
	}

	snapshot := core.NewRecord(snapshotCollection)

	snapshot.Set("user_id", person.user.Id)

	for key, value := range person.snapshotPayload {
		snapshot.Set(key, value)
	}

	if err := app.Save(snapshot); err != nil {
		return nil, err
	}

	member.Set("member_snapshot_id", snapshot.Id)

	if err := app.Save(member); err != nil {
		return nil, err
	}

	snapshot.Set("member_id", member.Id)

	if err := app.Save(snapshot); err != nil {
		return nil, err
	}

	person.snapshot = snapshot

	return member, nil
}

func upsertSnapshot(
	app core.App,
	person *personImportPlan,
) (*core.Record, error) {
	// Existing snapshot.
	if person.snapshot != nil {
		for key, value := range person.snapshotPayload {
			person.snapshot.Set(key, value)
		}

		person.snapshot.Set("user_id", person.user.Id)
		person.snapshot.Set("member_id", person.member.Id)

		if err := app.Save(person.snapshot); err != nil {
			return nil, err
		}

		// Keep the member relation synchronized.
		person.member.Set(
			"member_snapshot_id",
			person.snapshot.Id,
		)

		if err := app.Save(person.member); err != nil {
			return nil, err
		}

		return person.snapshot, nil
	}

	// New snapshot.
	snapshotCollection, err := app.FindCollectionByNameOrId(
		"member_snapshot",
	)
	if err != nil {
		return nil, err
	}

	snapshot := core.NewRecord(snapshotCollection)

	snapshot.Set("user_id", person.user.Id)
	snapshot.Set("member_id", person.member.Id)

	for key, value := range person.snapshotPayload {
		snapshot.Set(key, value)
	}

	if err := app.Save(snapshot); err != nil {
		return nil, err
	}

	person.member.Set("member_snapshot_id", snapshot.Id)

	if err := app.Save(person.member); err != nil {
		return nil, err
	}

	return snapshot, nil
}

func upsertBox(
	app core.App,
	existing *core.Record,
	boxNumber string,
	memberIDs []string,
	waitlist []WaitlistEntry,
) error {
	var box *core.Record

	if existing != nil {
		box = existing
	} else {
		collection, err := app.FindCollectionByNameOrId("boxes")
		if err != nil {
			return err
		}

		box = core.NewRecord(collection)
	}

	box.Set("box_number", parseBoxNumber(boxNumber))
	box.Set("box_members", memberIDs)
	box.Set("waitlist", waitlist)

	// The imported CSV does not contain a box name, so intentionally leave
	// it blank rather than inventing one.
	box.Set("box_name", "")

	if len(memberIDs) > 0 {
		box.Set("box_state", "ASSIGNED")
	} else {
		box.Set("box_state", "UNASSIGNED")
	}

	box.Set("updated_by", "CSV import")

	if err := app.Save(box); err != nil {
		return err
	}

	return nil
}

// -----------------------------------------------------------------------------
// Existing record lookup
// -----------------------------------------------------------------------------

func loadAllUsers(
	app core.App,
) (map[string]*core.Record, error) {
	records := []*core.Record{}

	if err := app.RecordQuery("users").All(&records); err != nil {
		return nil, err
	}

	users := make(map[string]*core.Record, len(records))

	for _, user := range records {
		email := strings.ToLower(strings.TrimSpace(
			user.GetString("email"),
		))

		if email == "" {
			continue
		}

		users[email] = user
	}

	return users, nil
}

func loadBoxesByNumber(
	app core.App,
) (map[string]*core.Record, error) {
	records := []*core.Record{}

	if err := app.RecordQuery("boxes").All(&records); err != nil {
		return nil, err
	}

	boxes := make(map[string]*core.Record)

	for _, box := range records {
		number := box.GetFloat("box_number")

		if number == 0 {
			continue
		}

		boxes[strconv.Itoa(int(number))] = box
	}

	return boxes, nil
}

// -----------------------------------------------------------------------------
// Date / number / boolean parsing
// -----------------------------------------------------------------------------

func parseCSVDate(
	value string,
	context string,
) (int64, error) {
	value = strings.TrimSpace(value)

	if value == "" {
		return 0, nil
	}

	layouts := []string{
		"1/2/2006",
		"01/02/2006",
		"2006-01-02",
		"1/2/06",
		"01/02/06",
	}

	for _, layout := range layouts {
		if parsed, err := time.ParseInLocation(
			layout,
			value,
			time.UTC,
		); err == nil {
			return parsed.Unix(), nil
		}
	}

	return 0, fmt.Errorf(
		"%s: invalid date %q; expected M/D/YYYY or YYYY-MM-DD",
		context,
		value,
	)
}

func parseMoney(
	value string,
	context string,
) (float64, error) {
	value = strings.TrimSpace(value)

	if value == "" {
		return 0, nil
	}

	value = strings.ReplaceAll(value, "$", "")
	value = strings.ReplaceAll(value, ",", "")
	value = strings.TrimSpace(value)

	result, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return 0, fmt.Errorf(
			"%s: invalid money value %q",
			context,
			value,
		)
	}

	return result, nil
}

func parseInt(
	value string,
	context string,
) (int, error) {
	value = strings.TrimSpace(value)

	if value == "" {
		return 0, nil
	}

	result, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf(
			"%s: invalid integer %q",
			context,
			value,
		)
	}

	return result, nil
}

func parseYesNo(
	value string,
	context string,
) (bool, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "":
		return false, nil

	case "yes", "y", "true", "1":
		return true, nil

	case "no", "n", "false", "0":
		return false, nil

	default:
		return false, fmt.Errorf(
			"%s: expected Yes or No, got %q",
			context,
			value,
		)
	}
}

func parseBoolQueryOrForm(
	request *http.Request,
	name string,
) bool {
	value := request.URL.Query().Get(name)

	if value == "" {
		value = request.FormValue(name)
	}

	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return false
	}

	return parsed
}

func parseJoinDateForPocketBase(
	value string,
) string {
	value = strings.TrimSpace(value)

	if value == "" {
		return ""
	}

	timestamp, err := parseCSVDate(
		value,
		"Join Date",
	)
	if err != nil {
		return ""
	}

	return time.Unix(timestamp, 0).
		UTC().
		Format("2006-01-02 15:04:05.000Z")
}

func parseBoxNumber(value string) int {
	result, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil {
		return 0
	}

	return result
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

func generateTemporaryPassword(length int) (string, error) {
	const alphabet = "abcdefghijklmnopqrstuvwxyz" +
		"ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
		"0123456789"

	bytes := make([]byte, length)

	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}

	for i := range bytes {
		bytes[i] = alphabet[int(bytes[i])%len(alphabet)]
	}

	return string(bytes), nil
}

func memberID(member *core.Record) string {
	if member == nil {
		return ""
	}

	return member.Id
}

func appendUniqueString(
	values []string,
	value string,
) []string {
	for _, existing := range values {
		if existing == value {
			return values
		}
	}

	return append(values, value)
}

func sortWaitlist(entries []WaitlistEntry) {
	for i := 0; i < len(entries); i++ {
		for j := i + 1; j < len(entries); j++ {
			if entries[j].Position < entries[i].Position {
				entries[i], entries[j] = entries[j], entries[i]
			}
		}
	}
}

// -----------------------------------------------------------------------------
// Dry-run descriptions
// -----------------------------------------------------------------------------

func describePersonChange(
	row memberImportRow,
	user *core.Record,
	member *core.Record,
	snapshot *core.Record,
) string {
	var action string

	switch {
	case user == nil:
		action = "CREATE"
	case member == nil:
		action = "CREATE MEMBER"
	case snapshot == nil:
		action = "CREATE SNAPSHOT"
	default:
		action = "UPDATE"
	}

	return fmt.Sprintf(
		"%s row %d: %s %s <%s>",
		action,
		row.RowNumber,
		row.FirstName,
		row.LastName,
		row.Email,
	)
}

func describeBoxChange(box boxImportPlan) string {
	action := "CREATE"

	if box.existing != nil {
		action = "UPDATE"
	}

	return fmt.Sprintf(
		"%s box #%s: %d member(s), %d waitlisted",
		action,
		box.boxNumber,
		len(box.memberEmails),
		len(box.waitlistRows),
	)
}

func normalizeStatus(value string) string {
	value = strings.TrimSpace(value)

	switch value {
	case "", "-", "—", "–":
		return statusNotMet
	case "Board", "board":
		return statusBoard
	case "Good Standing", "good standing":
		return statusGoodStanding
	default:
		return value
	}
}
