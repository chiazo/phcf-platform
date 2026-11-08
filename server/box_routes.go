package main

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type boxRequestBody struct {
	Wants string `json:"wants"`
}

type boxOverviewBox struct {
	ID              string   `json:"id"`
	BoxName         string   `json:"box_name"`
	BoxNumber       int      `json:"box_number"`
	BoxState        string   `json:"box_state"`
	Capacity        int      `json:"capacity"`
	BoxMembers      []string `json:"box_members"`
	BoxMembersNames []string `json:"box_members_names"`
	Notes           string   `json:"notes"`
	UpdatedBy       string   `json:"updated_by"`
}

type boxOverviewWaitlistEntry struct {
	ID       string `json:"id"`
	MemberID string `json:"member_id"`
	Queue    int    `json:"queue"`
	JoinDate int64  `json:"join_date"`
	Wants    string `json:"wants"`
	Name     string `json:"name"`
}

type boxOverviewResponse struct {
	Boxes    []boxOverviewBox           `json:"boxes"`
	Waitlist []boxOverviewWaitlistEntry `json:"waitlist"`
}

var (
	errBoxMemberNotFound = errors.New(
		"Your account does not have an associated member record.",
	)
	errBoxAlreadyAssigned = errors.New(
		"Member already has a box.",
	)
	errBoxAlreadyWaiting = errors.New(
		"Member is already on the waitlist.",
	)
	errInvalidBoxRequest = errors.New(
		"Invalid box request. Choose HALF or WHOLE.",
	)
)

func handleBoxRequest(e *core.RequestEvent) error {
	var body boxRequestBody

	if err := e.BindBody(&body); err != nil {
		return e.BadRequestError("Invalid request body.", err)
	}

	body.Wants = strings.ToUpper(strings.TrimSpace(body.Wants))

	if body.Wants != "HALF" && body.Wants != "WHOLE" {
		return e.BadRequestError("Choose HALF or WHOLE.", errInvalidBoxRequest)
	}

	// The member identity comes exclusively from the authenticated account.
	userID := e.Auth.Id
	requesterName := strings.TrimSpace(e.Auth.GetString("name"))

	if requesterName == "" {
		requesterName = e.Auth.GetString("email")
	}

	var result map[string]any

	err := e.App.RunInTransaction(func(txApp core.App) error {
		// Resolve the member record from the authenticated user.
		member, err := txApp.FindFirstRecordByFilter(
			"member",
			"user_id = {:userId}",
			dbx.Params{"userId": userID},
		)
		if err != nil {
			return errBoxMemberNotFound
		}

		memberID := member.Id

		// Fetch fresh box and waitlist records inside the transaction.
		boxes, err := txApp.FindRecordsByFilter(
			"boxes",
			"",
			"box_number",
			0,
			0,
		)
		if err != nil {
			return fmt.Errorf("load boxes: %w", err)
		}

		waitlist, err := txApp.FindRecordsByFilter(
			"box_waitlist",
			"",
			"queue,join_date",
			0,
			0,
		)
		if err != nil {
			return fmt.Errorf("load waitlist: %w", err)
		}

		// Find whether this member currently has a box.
		var existingBox *core.Record

		for _, box := range boxes {
			for _, assignedMemberID := range box.GetStringSlice("box_members") {
				if assignedMemberID == memberID {
					existingBox = box
					break
				}
			}

			if existingBox != nil {
				break
			}
		}

		// A member already assigned to a box may only request a WHOLE box.
		if existingBox != nil && body.Wants != "WHOLE" {
			return errBoxAlreadyAssigned
		}

		// A member may only have one waitlist entry.
		for _, entry := range waitlist {
			if entry.GetString("member_id") == memberID {
				return errBoxAlreadyWaiting
			}
		}

		// HALF requests can be assigned immediately only if:
		//   - a box has room
		//   - nobody is currently waiting
		//
		// WHOLE requests always enter the queue.
		if body.Wants == "HALF" && len(waitlist) == 0 {
			var target *core.Record

			for _, box := range boxes {
				if boxHasRoom(box) {
					target = box
					break
				}
			}

			if target != nil {
				members := target.GetStringSlice("box_members")
				members = append(members, memberID)

				target.Set("box_members", members)
				target.Set("notes", "Member assigned to box.")
				target.Set("box_state", "ASSIGNED")
				target.Set("updated_by", requesterName)

				if err := txApp.Save(target); err != nil {
					return fmt.Errorf("assign member to box: %w", err)
				}

				result = map[string]any{
					"status":    "assigned",
					"boxId":     target.Id,
					"boxName":   target.GetString("box_name"),
					"boxNumber": target.GetInt("box_number"),
				}

				return nil
			}
		}

		// Otherwise, add the member to the end of the global queue.
		nextQueue := 1

		for _, entry := range waitlist {
			queue := entry.GetInt("queue")
			if queue >= nextQueue {
				nextQueue = queue + 1
			}
		}

		collection, err := txApp.FindCollectionByNameOrId("box_waitlist")
		if err != nil {
			return fmt.Errorf("find waitlist collection: %w", err)
		}

		entry := core.NewRecord(collection)
		entry.Set("member_id", memberID)
		entry.Set("queue", nextQueue)
		entry.Set("join_date", time.Now().Unix())
		entry.Set("wants", body.Wants)

		if err := txApp.Save(entry); err != nil {
			return fmt.Errorf("create waitlist entry: %w", err)
		}

		result = map[string]any{
			"status": "waitlisted",
			"queue":  nextQueue,
			"wants":  body.Wants,
		}

		return nil
	})

	if err != nil {
		switch {
		case errors.Is(err, errBoxMemberNotFound),
			errors.Is(err, errBoxAlreadyAssigned),
			errors.Is(err, errBoxAlreadyWaiting),
			errors.Is(err, errInvalidBoxRequest):
			return e.BadRequestError(err.Error(), err)

		default:
			return e.InternalServerError("Could not process your box request.", err)
		}
	}

	return e.JSON(http.StatusOK, result)
}

func isBoxAdmin(auth *core.Record) bool {
	return auth != nil &&
		(auth.IsSuperuser() || auth.GetBool("is_admin"))
}

// Resolves a member's name without exposing their user or snapshot record.
func getBoxMemberName(
	app core.App,
	memberID string,
	showFullName bool,
) string {
	member, err := app.FindRecordById("member", memberID)
	if err != nil {
		return " — "
	}

	snapshotID := member.GetString("member_snapshot_id")
	if snapshotID != "" {
		snapshot, err := app.FindRecordById("member_snapshot", snapshotID)
		if err == nil {
			personalInfo, ok := snapshot.Get("personal_info").(map[string]any)
			if ok {
				firstName := strings.TrimSpace(fmt.Sprint(personalInfo["firstName"]))
				lastName := strings.TrimSpace(fmt.Sprint(personalInfo["lastName"]))

				// fmt.Sprint(nil) returns "<nil>", so normalize absent fields.
				if personalInfo["firstName"] == nil {
					firstName = ""
				}
				if personalInfo["lastName"] == nil {
					lastName = ""
				}

				if firstName != "" {
					if showFullName && lastName != "" {
						return firstName + " " + lastName
					}

					if lastName != "" {
						return firstName + " " + string([]rune(lastName)[0]) + "."
					}

					return firstName
				}
			}
		}
	}

	// Fallback to the associated user's display name.
	userID := member.GetString("user_id")
	if userID != "" {
		user, err := app.FindRecordById("users", userID)
		if err == nil {
			name := strings.TrimSpace(user.GetString("name"))
			if name != "" {
				if showFullName {
					return name
				}

				parts := strings.Fields(name)
				if len(parts) > 1 {
					return parts[0] + " " + string([]rune(parts[len(parts)-1])[0]) + "."
				}

				return parts[0]
			}
		}
	}

	return " — "
}

func boxCapacity(record *core.Record) int {
	capacity := record.GetInt("capacity")
	if capacity <= 0 {
		return 2
	}

	return capacity
}

func boxHasRoom(record *core.Record) bool {
	return len(record.GetStringSlice("box_members")) < boxCapacity(record)
}

func handleBoxOverview(e *core.RequestEvent) error {
	showFullNames := isBoxAdmin(e.Auth)

	boxes, err := e.App.FindRecordsByFilter(
		"boxes",
		"",
		"box_number",
		0,
		0,
	)
	if err != nil {
		return e.InternalServerError("Could not load boxes.", err)
	}

	waitlist, err := e.App.FindRecordsByFilter(
		"box_waitlist",
		"",
		"queue,join_date",
		0,
		0,
	)
	if err != nil {
		return e.InternalServerError("Could not load the waitlist.", err)
	}

	response := boxOverviewResponse{
		Boxes:    make([]boxOverviewBox, 0, len(boxes)),
		Waitlist: make([]boxOverviewWaitlistEntry, 0, len(waitlist)),
	}

	for _, box := range boxes {
		memberIDs := box.GetStringSlice("box_members")
		memberNames := make([]string, 0, len(memberIDs))

		for _, memberID := range memberIDs {
			memberNames = append(
				memberNames,
				getBoxMemberName(e.App, memberID, showFullNames),
			)
		}

		response.Boxes = append(response.Boxes, boxOverviewBox{
			ID:              box.Id,
			BoxName:         box.GetString("box_name"),
			BoxNumber:       box.GetInt("box_number"),
			BoxState:        box.GetString("box_state"),
			Capacity:        boxCapacity(box),
			BoxMembers:      memberIDs,
			BoxMembersNames: memberNames,
			Notes:           box.GetString("notes"),
			UpdatedBy:       box.GetString("updated_by"),
		})
	}

	for _, entry := range waitlist {
		memberID := entry.GetString("member_id")

		response.Waitlist = append(response.Waitlist, boxOverviewWaitlistEntry{
			ID:       entry.Id,
			MemberID: memberID,
			Queue:    entry.GetInt("queue"),
			JoinDate: int64(entry.GetInt("join_date")),
			Wants:    entry.GetString("wants"),
			Name:     getBoxMemberName(e.App, memberID, showFullNames),
		})
	}

	return e.JSON(http.StatusOK, response)
}
