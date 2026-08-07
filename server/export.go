package main

import (
	"encoding/csv"
	"fmt"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// resolveServiceHourCategory applies the same board-overrides-category
// precedence as the original spreadsheet formula: role determines Board
// status regardless of what's stored in member_info.category.
func resolveServiceHourCategory(role string, category string) string {
	if boardRoles[role] {
		return "BOARD"
	}
	if category == "" {
		return "GOOD_STANDING"
	}
	return category
}

func loadServiceHourRates(app core.App) (map[string]float64, error) {
	records := []*core.Record{}
	if err := app.RecordQuery("service_hour_rates").All(&records); err != nil {
		return nil, err
	}

	rates := make(map[string]float64, len(records))
	for _, r := range records {
		rates[r.GetString("category")] = r.GetFloat("percentage")
	}
	return rates, nil
}

type PersonalInfo struct {
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Pronouns  string `json:"pronouns"`

	Address struct {
		Line1   string `json:"line1"`
		ZipCode string `json:"zipCode"`
	} `json:"address"`

	EmailInfo struct {
		PrimaryEmail   string `json:"primaryEmail"`
		SecondaryEmail string `json:"secondaryEmail"`
		OnMailingList  bool   `json:"onMailingList"`
	} `json:"emailInfo"`

	PhoneInfo struct {
		PrimaryPhoneNumber   string `json:"primaryPhoneNumber"`
		SecondaryPhoneNumber string `json:"secondaryPhoneNumber"`
	} `json:"phoneInfo"`
}

type MemberInfo struct {
	OrientationDate int64  `json:"orientationDate"`
	MemberType      string `json:"memberType"`

	Dues struct {
		DuesPaidAt  int64   `json:"duesPaidAt"`
		AmountPaid  float64 `json:"amountPaid"`
		PaymentType string  `json:"paymentType"`
	} `json:"dues"`

	Requirements struct {
		ServiceHoursRequired int `json:"serviceHoursRequired"`
	} `json:"requirements"`
}

type BoxInfo struct {
	BoxState string `json:"boxState"`
	BoxId    string `json:"boxId"`

	WaitlistInfo struct {
		WaitlistNumber   int   `json:"waitlistNumber"`
		JoinedWaitlistAt int64 `json:"joinedWaitlistAt"`
	} `json:"waitlistInfo"`
}

type ExportPersonalInfo struct {
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Pronouns  string `json:"pronouns"`

	Address struct {
		Line1   string `json:"line1"`
		ZipCode string `json:"zipCode"`
	} `json:"address"`

	EmailInfo struct {
		PrimaryEmail   string `json:"primaryEmail"`
		SecondaryEmail string `json:"secondaryEmail"`
		OnMailingList  bool   `json:"onMailingList"`
	} `json:"emailInfo"`

	PhoneInfo struct {
		PrimaryPhoneNumber   string `json:"primaryPhoneNumber"`
		SecondaryPhoneNumber string `json:"secondaryPhoneNumber"`
	} `json:"phoneInfo"`
}

type ExportMemberInfo struct {
	OrientationDate int64  `json:"orientationDate"`
	MemberType      string `json:"memberType"`
	Role            string `json:"role"`
	Category        string `json:"category"`

	Dues struct {
		DuesPaidAt  int64   `json:"duesPaidAt"`
		AmountPaid  float64 `json:"amountPaid"`
		PaymentType string  `json:"paymentType"`
	} `json:"dues"`

	Requirements struct {
		ServiceHoursRequired int `json:"serviceHoursRequired"`
	} `json:"requirements"`
}

type ExportBoxInfo struct {
	BoxState string `json:"boxState"`
	BoxId    string `json:"boxId"`

	WaitlistInfo struct {
		WaitlistNumber   int   `json:"waitlistNumber"`
		JoinedWaitlistAt int64 `json:"joinedWaitlistAt"`
	} `json:"waitlistInfo"`
}

func exportMembersCSV(app core.App) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {

		if err := requireAppAdmin(e); err != nil {
			return err
		}

		e.Response.Header().Set(
			"Content-Disposition",
			`attachment; filename="members-2026.csv"`,
		)

		e.Response.Header().Set(
			"Content-Type",
			"text/csv",
		)

		writer := csv.NewWriter(e.Response)
		defer writer.Flush()

		// CSV columns
		writer.Write([]string{
			"First Name",
			"Last Name",
			"Last Name Initial",
			"Pronouns",
			"Email Address",
			"Status for 2026 & Exemptions",
			"Service Hours Percentage Required",
			"Meeting Exemption",
			"Dues Paid: Date",
			"Amount Paid",
			"Payment Type",
			"Orientation Date",
			"Listserv",
			"Secondary Email Address",
			"Phone Number",
			"Secondary Phone Number",
			"Street Address",
			"Zip Code",
			"Join Date",
			"Join Year",
			"Member Type",
			"Box Waiting List",
			"Box Waiting List Number",
			"Waitlist Join Date",
			"Box Number",
			"Box Change Request Letter",
			"Sharing Box",
			"On Leave",
			"Till by May 1",
			"Notes",
		})

		// Load members
		members := []*core.Record{}
		if err := app.RecordQuery("member").All(&members); err != nil {
			return e.InternalServerError("Could not load members.", err)
		}

		// Load snapshots once
		snapshots := map[string]*core.Record{}

		snapshotRecords := []*core.Record{}
		if err := app.RecordQuery("member_snapshot").All(&snapshotRecords); err != nil {
			return e.InternalServerError("Could not load snapshots.", err)
		}

		for _, snapshot := range snapshotRecords {
			snapshots[snapshot.Id] = snapshot
		}

		serviceHourRates, err := loadServiceHourRates(app)
		if err != nil {
			return e.InternalServerError("Could not load service hour rates.", err)
		}

		for _, member := range members {

			snapshotID := member.GetString("member_snapshot_id")

			snapshot, ok := snapshots[snapshotID]
			if !ok {
				continue
			}

			var personal ExportPersonalInfo
			var memberInfo ExportMemberInfo
			var boxInfo ExportBoxInfo

			if err := snapshot.UnmarshalJSONField(
				"personal_info",
				&personal,
			); err != nil {
				continue
			}

			if err := snapshot.UnmarshalJSONField(
				"member_info",
				&memberInfo,
			); err != nil {
				continue
			}

			if err := snapshot.UnmarshalJSONField(
				"box_info",
				&boxInfo,
			); err != nil {
				continue
			}

			// Service Hours Percentage Required
			category := resolveServiceHourCategory(memberInfo.Role, memberInfo.Category)
			serviceHourPercentage := serviceHourRates[category] // 0 if category has no configured rate yet

			writer.Write([]string{

				// First Name
				personal.FirstName,

				// Last Name
				personal.LastName,

				// Last Name Initial
				lastInitial(personal.LastName),

				// Pronouns
				personal.Pronouns,

				// Email
				personal.EmailInfo.PrimaryEmail,

				// Status for 2026 & Exemptions
				// TODO: add mapping later
				"",

				// Service Hours Percentage Required
				fmt.Sprintf("%.2f%%", serviceHourPercentage),

				// Meeting Exemption
				fmt.Sprintf(
					"%d",
					snapshot.GetInt("meeting_exemption"),
				),

				// Dues Paid Date
				formatUnixMDY(memberInfo.Dues.DuesPaidAt),

				// Amount Paid
				fmt.Sprintf("$%.2f", memberInfo.Dues.AmountPaid),

				// Payment Type
				memberInfo.Dues.PaymentType,

				// Orientation Date
				formatUnix(memberInfo.OrientationDate),

				// Listserv
				boolToYesNo(
					personal.EmailInfo.OnMailingList,
				),

				// Secondary Email
				personal.EmailInfo.SecondaryEmail,

				// Phone
				personal.PhoneInfo.PrimaryPhoneNumber,

				// Secondary Phone
				personal.PhoneInfo.SecondaryPhoneNumber,

				// Street Address
				personal.Address.Line1,

				// Zip
				personal.Address.ZipCode,

				// Join Date
				formatPocketBaseDate(
					member.GetString("join_date"),
				),

				// Join Year
				member.GetString("join_year"),

				// Member Type
				memberInfo.MemberType,

				// Box Waiting List
				boolToYesNo(
					boxInfo.BoxState == "WAITLIST",
				),

				// Box Waiting List Number
				fmt.Sprintf(
					"%d",
					boxInfo.WaitlistInfo.WaitlistNumber,
				),

				// Waitlist Join Date
				formatUnix(
					boxInfo.WaitlistInfo.JoinedWaitlistAt,
				),

				// Box Number
				boxInfo.BoxId,

				// Box Change Request Letter
				"",

				// Sharing Box
				"",

				// On Leave
				"",

				// Till by May 1
				"",

				// Notes
				snapshot.GetString("notes"),
			})
		}

		return nil
	}
}

func formatUnix(ts int64) string {
	if ts == 0 {
		return ""
	}

	return time.Unix(ts, 0).Format("2006-01-02")
}

func formatUnixMDY(ts int64) string {
	if ts == 0 {
		return ""
	}
	return time.Unix(ts, 0).Format("1/2/2006")
}

func formatPocketBaseDate(value string) string {
	if value == "" {
		return ""
	}

	// PocketBase dates are already usually ISO strings.
	// Keep only the date portion for CSV.
	if len(value) >= 10 {
		return value[:10]
	}

	return value
}

func boolToYesNo(value bool) string {
	if value {
		return "Yes"
	}

	return "No"
}

func lastInitial(last string) string {
	if last == "" {
		return ""
	}

	runes := []rune(last)

	return string(runes[0])
}

func formatPBDateValue(value string) string {
	if value == "" {
		return ""
	}

	// PocketBase created_at is ISO formatted:
	// 2026-08-06 15:04:05.123Z
	if len(value) >= 10 {
		return value[:10]
	}

	return value
}

func formatPBYearValue(value string) string {
	if value == "" {
		return ""
	}

	if len(value) >= 4 {
		return value[:4]
	}

	return value
}
