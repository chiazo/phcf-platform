package main

import (
	"crypto/rand"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
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

// A box holds at most this many members.
const maxMembersPerBox = 2

const (
	defaultMemberState = "ACTIVE"

	statusBoard        = "Board"
	statusGoodStanding = "Good Standing"
	statusEmeritus     = "Emeritus"
	statusSenior       = "Senior"
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

	colWorkHoursRequired  = "Work Hours Required"
	colWorkHoursCompleted = "Work Hours Completed"
	colOpenHoursRequired  = "Open Hours Required"
	colOpenHoursCompleted = "Open Hours Completed"

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

	WorkHoursRequired  *int
	WorkHoursCompleted *int
	OpenHoursRequired  *int
	OpenHoursCompleted *int
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

		fmt.Printf("\nValues found in the CSV:\n%s\n\n", summarizeValues(rows))

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
				"values":            summarizeValues(rows),
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

	var missing []string

	for _, required := range requiredColumns {
		if _, ok := columnIndex[required]; !ok {
			missing = append(missing, fmt.Sprintf("%q", required))
		}
	}

	if len(missing) > 0 {
		return nil, fmt.Errorf(
			"missing required CSV column(s): %s",
			strings.Join(missing, ", "),
		)
	}

	var rows []memberImportRow

	// Problems are collected so one run reports every bad row, instead of
	// stopping at the first one.
	var parseErrs []string

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
			parseErrs = append(parseErrs, err.Error())
			continue
		}

		duesPaidAt, err := parseCSVDate(
			get(colDuesPaidDate),
			fmt.Sprintf("row %d: %s", rowNumber, colDuesPaidDate),
		)
		if err != nil {
			parseErrs = append(parseErrs, err.Error())
			continue
		}

		amountPaid, err := parseMoney(
			get(colAmountPaid),
			fmt.Sprintf("row %d: %s", rowNumber, colAmountPaid),
		)
		if err != nil {
			parseErrs = append(parseErrs, err.Error())
			continue
		}

		orientationDate, err := parseCSVDate(
			get(colOrientationDate),
			fmt.Sprintf("row %d: %s", rowNumber, colOrientationDate),
		)
		if err != nil {
			parseErrs = append(parseErrs, err.Error())
			continue
		}

		onMailingList, err := parseYesNo(
			get(colListserv),
			fmt.Sprintf("row %d: %s", rowNumber, colListserv),
		)
		if err != nil {
			parseErrs = append(parseErrs, err.Error())
			continue
		}

		boxWaitingList, err := parseYesNo(
			get(colBoxWaitingList),
			fmt.Sprintf("row %d: %s", rowNumber, colBoxWaitingList),
		)
		if err != nil {
			parseErrs = append(parseErrs, err.Error())
			continue
		}

		waitlistJoinDate, err := parseCSVDate(
			get(colWaitlistJoinDate),
			fmt.Sprintf("row %d: %s", rowNumber, colWaitlistJoinDate),
		)
		if err != nil {
			parseErrs = append(parseErrs, err.Error())
			continue
		}

		memberState := strings.ToUpper(get(colMemberState))
		if memberState == "" {
			memberState = defaultMemberState
		}

		workHoursRequired, err := parseNullableInt(
			get(colWorkHoursRequired),
			fmt.Sprintf("row %d: %s", rowNumber, colWorkHoursRequired),
		)
		if err != nil {
			parseErrs = append(parseErrs, err.Error())
			continue
		}

		workHoursCompleted, err := parseNullableInt(
			get(colWorkHoursCompleted),
			fmt.Sprintf("row %d: %s", rowNumber, colWorkHoursCompleted),
		)
		if err != nil {
			parseErrs = append(parseErrs, err.Error())
			continue
		}

		openHoursRequired, err := parseNullableInt(
			get(colOpenHoursRequired),
			fmt.Sprintf("row %d: %s", rowNumber, colOpenHoursRequired),
		)
		if err != nil {
			parseErrs = append(parseErrs, err.Error())
			continue
		}

		openHoursCompleted, err := parseNullableInt(
			get(colOpenHoursCompleted),
			fmt.Sprintf("row %d: %s", rowNumber, colOpenHoursCompleted),
		)
		if err != nil {
			parseErrs = append(parseErrs, err.Error())
			continue
		}

		rows = append(rows, memberImportRow{
			RowNumber: rowNumber,

			FirstName: get(colFirstName),
			LastName:  get(colLastName),
			Pronouns:  get(colPronouns),
			Email:     strings.ToLower(get(colEmail)),
			Status:    normalizeStatus(get(colStatus)),

			MeetingExemption: meetingExemption,

			DuesPaidAt: duesPaidAt,
			AmountPaid: amountPaid,
			// Must match the PaymentType values the frontend uses. The
			// request form writes lowercase ("cash", "venmo"); if your
			// PaymentType enum is lowercase too, change this to ToLower.
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

			Notes:              get(colNotes),
			WorkHoursRequired:  workHoursRequired,
			WorkHoursCompleted: workHoursCompleted,
			OpenHoursRequired:  openHoursRequired,
			OpenHoursCompleted: openHoursCompleted,
		})
	}

	if len(parseErrs) > 0 {
		return nil, errors.New("\n  " + strings.Join(parseErrs, "\n  "))
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

// validateImportRows checks every row and reports all of the problems at once.
func validateImportRows(rows []memberImportRow) error {
	var problems []string

	add := func(rowNumber int, format string, args ...any) {
		problems = append(
			problems,
			fmt.Sprintf("row %d: ", rowNumber)+fmt.Sprintf(format, args...),
		)
	}

	seenEmails := make(map[string]int)
	boxRows := make(map[string][]int)

	for _, row := range rows {
		if row.FirstName == "" {
			add(row.RowNumber, "First Name is required")
		}

		if row.LastName == "" {
			add(row.RowNumber, "Last Name is required")
		}

		if row.Email == "" {
			if row.Status != statusEmeritus {
				add(row.RowNumber, "Email Address is required")
			}
		} else if !strings.Contains(row.Email, "@") {
			add(row.RowNumber, "invalid email address %q", row.Email)
		} else {
			if previousRow, exists := seenEmails[row.Email]; exists {
				add(
					row.RowNumber,
					"email %q is also on row %d",
					row.Email,
					previousRow,
				)
			}

			seenEmails[row.Email] = row.RowNumber
		}

		switch row.Status {
		case statusBoard, statusGoodStanding, statusEmeritus, statusSenior, statusNotMet, "":
		default:
			add(
				row.RowNumber,
				"unsupported status %q (expected %q, %q, %q, %q, or %q; empty is also allowed)",
				row.Status,
				statusGoodStanding,
				statusEmeritus,
				statusSenior,
				statusBoard,
				statusNotMet,
			)
		}

		switch row.MemberState {
		case "ACTIVE", "INACTIVE", "PENDING":
		default:
			add(
				row.RowNumber,
				"unsupported Member State %q (expected ACTIVE, INACTIVE, or PENDING)",
				row.MemberState,
			)
		}

		if row.MemberType == "" {
			add(row.RowNumber, "Member Type is required")
		}

		if row.BoxNumber != "" {
			if _, err := strconv.Atoi(row.BoxNumber); err != nil {
				add(row.RowNumber, "invalid Box Number %q", row.BoxNumber)
			} else if !row.BoxWaitingList {
				boxRows[row.BoxNumber] = append(
					boxRows[row.BoxNumber],
					row.RowNumber,
				)
			}
		}
	}

	for boxNumber, rowNumbers := range boxRows {
		if len(rowNumbers) > maxMembersPerBox {
			problems = append(problems, fmt.Sprintf(
				"box %s has %d members (rows %v); the limit is %d",
				boxNumber,
				len(rowNumbers),
				rowNumbers,
				maxMembersPerBox,
			))
		}
	}

	if len(problems) > 0 {
		sort.SliceStable(problems, func(i, j int) bool {
			rowNumber := func(problem string) int {
				var n int
				_, _ = fmt.Sscanf(problem, "row %d:", &n)
				return n
			}

			return rowNumber(problems[i]) < rowNumber(problems[j])
		})
		return errors.New("\n  " + strings.Join(problems, "\n  "))
	}

	return nil
}

// summarizeValues lists the distinct values found in the columns that feed
// enums, so unexpected spellings are easy to spot in a dry run.
func summarizeValues(rows []memberImportRow) string {
	counts := func(label string, get func(memberImportRow) string) string {
		seen := map[string]int{}

		for _, row := range rows {
			seen[get(row)]++
		}

		parts := []string{}

		for value, n := range seen {
			if value == "" {
				value = "(blank)"
			}

			parts = append(parts, fmt.Sprintf("%s=%d", value, n))
		}

		sort.Strings(parts)

		return fmt.Sprintf("%-13s %s", label+":", strings.Join(parts, ", "))
	}

	return strings.Join([]string{
		counts("Status", func(r memberImportRow) string { return r.Status }),
		counts("Member Type", func(r memberImportRow) string { return r.MemberType }),
		counts("Payment Type", func(r memberImportRow) string { return r.PaymentType }),
		counts("Member State", func(r memberImportRow) string { return r.MemberState }),
	}, "\n")
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

func parseNullableInt(
	value string,
	context string,
) (*int, error) {
	value = strings.TrimSpace(value)

	if value == "" || value == "-" || value == "—" {
		return nil, nil
	}

	result, err := strconv.Atoi(value)
	if err != nil {
		return nil, fmt.Errorf(
			"%s: invalid integer %q",
			context,
			value,
		)
	}

	return &result, nil
}

func sortWaitlistRows(rows []memberImportRow) {
	sort.SliceStable(rows, func(i, j int) bool {
		a, b := rows[i], rows[j]

		aPosition, aErr := strconv.Atoi(
			strings.TrimSpace(a.WaitlistPosition),
		)
		bPosition, bErr := strconv.Atoi(
			strings.TrimSpace(b.WaitlistPosition),
		)

		aHasPosition := aErr == nil && aPosition > 0
		bHasPosition := bErr == nil && bPosition > 0

		if aHasPosition != bHasPosition {
			return aHasPosition
		}

		if aHasPosition && aPosition != bPosition {
			return aPosition < bPosition
		}

		aHasDate := a.WaitlistJoinDate > 0
		bHasDate := b.WaitlistJoinDate > 0

		if aHasDate != bHasDate {
			return aHasDate
		}

		if aHasDate && a.WaitlistJoinDate != b.WaitlistJoinDate {
			return a.WaitlistJoinDate < b.WaitlistJoinDate
		}

		aLast := strings.ToLower(strings.TrimSpace(a.LastName))
		bLast := strings.ToLower(strings.TrimSpace(b.LastName))

		if aLast != bLast {
			return aLast < bLast
		}

		aFirst := strings.ToLower(strings.TrimSpace(a.FirstName))
		bFirst := strings.ToLower(strings.TrimSpace(b.FirstName))

		if aFirst != bFirst {
			return aFirst < bFirst
		}

		return strings.ToLower(a.Email) < strings.ToLower(b.Email)
	})
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
			// The member's current snapshot is the one it points at. A member
			// can have many older versions, so don't pick one by member_id.
			if snapshotID := member.GetString("member_snapshot_id"); snapshotID != "" {
				snapshot, _ = app.FindRecordById(
					"member_snapshot",
					snapshotID,
				)
			}

			if snapshot == nil {
				snapshot = snapshotByMemberID[member.Id]
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

		if row.BoxWaitingList && row.BoxNumber == "" {
			plan.changes = append(plan.changes, fmt.Sprintf(
				"WAITLIST row %d: %s has no box and joins the shortest waitlist",
				row.RowNumber,
				row.Email,
			))
		}
	}

	// Build the box grouping using existing member IDs where available.
	boxesByNumber := make(map[string]*boxImportPlan)

	for _, row := range rows {
		if row.BoxWaitingList || row.BoxNumber == "" {
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
	// Same rule as approving a payment: any payment completes dues. The
	// DueState values are COMPLETE, PENDING and UNPAID. There is no "PAID".
	dueState := "UNPAID"
	if row.AmountPaid > 0 || row.DuesPaidAt > 0 {
		dueState = "COMPLETE"
	}

	// The spreadsheet only says "Board", not which board role someone holds.
	// "BOARD" has to be listed in boardRoles (main.go) and in the frontend
	// MemberRole enum. Everyone else gets the same "no role" value that
	// registration uses.
	role := "ROLE_INVALID"
	if row.Status == statusBoard {
		role = "BOARD"
	}

	memberInfo := map[string]any{
		"memberType":  row.MemberType,
		"memberState": row.MemberState,
		"role":        role,

		"orientationDate": row.OrientationDate,

		"requirements": map[string]any{
			"meetingsCompleted": 0,
			"meetingsRequired":  meetingsRequired,
		},

		"dues": map[string]any{
			"amountPaid":  row.AmountPaid,
			"dueState":    dueState,
			"duesPaidAt":  row.DuesPaidAt,
			"paymentType": row.PaymentType,
		},
	}

	// Good Standing is represented by category.
	//
	// "-" intentionally leaves it unset because it means requirements are
	// not yet met.
	if row.Status == statusGoodStanding {
		memberInfo["category"] = "GOOD_STANDING"
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

		// Waitlisted members with no box of their own. Their entry is parked
		// on the box with the shortest waitlist, the same way a member
		// joining the waitlist in the app is placed.
		//
		// Note: this appends. Run the import once, on a fresh load, rather
		// than repeatedly.
		// Collect every imported waitlisted member. Box Number does not make
		// them an assigned member when Box Waiting List is true.
		var waitlistedRows []memberImportRow

		for _, person := range plan.people {
			if person.row.BoxWaitingList &&
				person.row.BoxNumber == "" {
				waitlistedRows = append(waitlistedRows, person.row)
			}
		}

		sortWaitlistRows(waitlistedRows)

		if len(waitlistedRows) > 0 {
			boxes := []*core.Record{}
			if err := txApp.RecordQuery("boxes").All(&boxes); err != nil {
				return fmt.Errorf("load boxes for waitlist: %w", err)
			}

			if len(boxes) == 0 {
				return fmt.Errorf(
					"%d members are waitlisted but no boxes exist yet; add a box first",
					len(waitlistedRows),
				)
			}

			// Resolve imported waitlisted member IDs.
			importedWaitlistIDs := make(map[string]bool)

			for _, person := range plan.people {
				if person.row.BoxWaitingList && person.member != nil {
					importedWaitlistIDs[person.member.Id] = true
				}
			}

			// Remove these members from existing queues before adding them again,
			// so re-running the import doesn't duplicate their entries.
			for _, box := range boxes {
				var entries []WaitlistEntry
				if err := box.UnmarshalJSONField("waitlist", &entries); err != nil {
					return fmt.Errorf(
						"box %s: read waitlist: %w",
						box.Id,
						err,
					)
				}

				kept := make([]WaitlistEntry, 0, len(entries))
				for _, entry := range entries {
					if !importedWaitlistIDs[entry.MemberID] {
						kept = append(kept, entry)
					}
				}

				box.Set("waitlist", kept)
				if err := txApp.Save(box); err != nil {
					return fmt.Errorf(
						"box %s: update waitlist: %w",
						box.Id,
						err,
					)
				}
			}

			// Add the imported rows in the chosen order, putting each person
			// on the currently shortest queue.
			for _, row := range waitlistedRows {
				var person *personImportPlan
				for i := range plan.people {
					if plan.people[i].row.Email == row.Email {
						person = &plan.people[i]
						break
					}
				}

				if person == nil || person.member == nil {
					return fmt.Errorf(
						"waitlisted member %s was not created",
						row.Email,
					)
				}

				target := boxes[0]
				for _, box := range boxes[1:] {
					if waitlistLength(box) < waitlistLength(target) {
						target = box
					}
				}

				var entries []WaitlistEntry
				if err := target.UnmarshalJSONField("waitlist", &entries); err != nil {
					return fmt.Errorf(
						"box %s: read waitlist: %w",
						target.Id,
						err,
					)
				}

				// Position is assigned from the resulting order. The source
				// number is used to sort people, not retained as a potentially
				// duplicate or missing queue position.
				maxPosition := 0
				for _, entry := range entries {
					if entry.Position > maxPosition {
						maxPosition = entry.Position
					}
				}

				entries = append(entries, WaitlistEntry{
					MemberID: person.member.Id,
					JoinDate: row.WaitlistJoinDate,
					Position: maxPosition + 1,
				})

				sortWaitlist(entries)
				target.Set("waitlist", entries)

				if err := txApp.Save(target); err != nil {
					return fmt.Errorf(
						"%s: could not add to the waitlist: %w",
						row.Email,
						err,
					)
				}
			}
		}

		return nil
	})
}

func waitlistLength(box *core.Record) int {
	var entries []WaitlistEntry
	_ = box.UnmarshalJSONField("waitlist", &entries)

	return len(entries)
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
	user.Set("emailVisibility", true)
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

	// member_snapshot_id is required by the schema, so the snapshot has to be
	// created before the member is saved. createMemberAndSnapshot does both.
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

	now := time.Now()
	snapshot.Set("created_at", now)
	snapshot.Set("modified_at", now)

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
		person.snapshot.Set("modified_at", time.Now())

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

	now := time.Now()
	snapshot.Set("created_at", now)
	snapshot.Set("modified_at", now)

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

		// The imported CSV does not contain a box name, so leave a new box
		// unnamed rather than inventing one. Existing boxes keep their name.
		box.Set("box_name", "")
	}

	box.Set("box_number", parseBoxNumber(boxNumber))
	box.Set("box_members", memberIDs)

	// An empty imported waitlist means "no waitlist data to replace",
	// not "clear the existing waitlist".
	if len(waitlist) > 0 || existing == nil {
		box.Set("waitlist", waitlist)
	}

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
	case "Emeritus", "emeritus":
		return statusEmeritus
	case "Good Standing", "good standing":
		return statusGoodStanding
	case "Senior", "senior":
		return statusSenior
	default:
		return value
	}
}
