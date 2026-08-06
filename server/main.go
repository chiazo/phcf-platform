package main

import (
	"database/sql"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

// boardRoles mirrors models/enums.ts MemberRole — every role other than
// ROLE_INVALID / PENDING counts as "on the board."
var boardRoles = map[string]bool{
	"PRESIDENT":      true,
	"VICE_PRESIDENT": true,
	"SECRETARY":      true,
	"TREASURER":      true,
}

type workFormulaCriteria struct {
	// "" (any), "GENERAL", "ASSOCIATE", "ALUMNI", "PENDING"
	MemberType string `json:"memberType"`
	// "" (any), "board", "non_board"
	BoardStatus string `json:"boardStatus"`
	// "" (any), "shared", "individual", "unassigned"
	BoxSharing string `json:"boxSharing"`
	// if set, overrides all other criteria and matches only this one member
	MemberId string `json:"memberId"`
}

type bulkUpdateWorkFormulaForm struct {
	Criteria          workFormulaCriteria `json:"criteria"`
	WorkHoursRequired *int                `json:"workHoursRequired"`
	OpenHoursRequired *int                `json:"openHoursRequired"`
	// Preview=true returns the matching members without writing anything —
	// lets the admin UI show "this will affect 7 members" before applying.
	Preview bool `json:"preview"`
}

type memberInfoSubset struct {
	Role       string `json:"role"`
	MemberType string `json:"memberType"`
}

func main() {
	app := pocketbase.New()

	app.OnBootstrap().BindFunc(func(e *core.BootstrapEvent) error {
		if err := e.Next(); err != nil {
			return err
		}

		return ensureAppCollections(app)
	})

	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		e.Router.POST("/api/app/login", appLogin(app))
		e.Router.GET("/api/app/admin/users", listAdminUsers(app))
		e.Router.POST("/api/app/admin/users/{id}/promote", promoteAdminUser(app))
		e.Router.POST("/api/app/admin/users/{id}/demote", demoteAdminUser(app))
		e.Router.POST("/api/app/admin/work-formula/bulk-update", bulkUpdateWorkFormula(app))
		e.Router.GET("/api/app/admin/export/members", exportMembersCSV(app))

		return e.Next()
	})

	app.OnRecordUpdateRequest("work_formula").BindFunc(func(e *core.RecordRequestEvent) error {
		if e.Auth != nil && (e.Auth.IsSuperuser() ||
			(e.Auth.Collection().Name == "users" && e.Auth.GetBool("is_admin"))) {
			return e.Next() // admins can change anything
		}

		original := e.Record.Original()
		if e.Record.GetFloat("work_hours_required") != original.GetFloat("work_hours_required") {
			return e.ForbiddenError("Only admins can change work_hours_required.", nil)
		}
		if e.Record.GetFloat("open_hours_required") != original.GetFloat("open_hours_required") {
			return e.ForbiddenError("Only admins can change open_hours_required.", nil)
		}

		return e.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
	_ = os.Args
}

func ensureAppCollections(app core.App) error {
	if err := ensureUsersCollectionRules(app); err != nil {
		return err
	}

	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return err
	}

	// member_snapshot.member_id is a plain TextField (not a relation), so
	// there's no circular dependency between member_snapshot and member —
	// everything can be created in a single pass.
	snapshotCollection, err := ensureMemberSnapshotCollection(app, users.Id)
	if err != nil {
		return err
	}

	memberCollection, err := ensureMemberCollection(app, users.Id, snapshotCollection.Id)
	if err != nil {
		return err
	}

	if _, err := ensureBoxesCollection(app, memberCollection.Id); err != nil {
		return err
	}

	if _, err := ensureWorkFormulaCollection(app, memberCollection.Id); err != nil {
		return err
	}

	if _, err := ensureRequirementUpdateRequestCollection(app, users.Id, snapshotCollection.Id); err != nil {
		return err
	}

	_, err = ensureLegacySnapshotCollection(app, users.Id)
	return err
}

func ensureUsersCollectionRules(app core.App) error {
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return err
	}

	ownRecordRule := "id = @request.auth.id"
	users.CreateRule = types.Pointer("")
	users.ListRule = types.Pointer(ownRecordRule)
	users.ViewRule = types.Pointer(ownRecordRule)
	users.UpdateRule = types.Pointer(ownRecordRule)
	if users.Fields.GetByName("is_admin") == nil {
		users.Fields.Add(&core.BoolField{Name: "is_admin"})
	}

	return app.Save(users)
}

type appLoginForm struct {
	Email    string `json:"email" form:"email"`
	Password string `json:"password" form:"password"`
}

func appLogin(app core.App) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		form := appLoginForm{}
		if err := e.BindBody(&form); err != nil {
			return e.BadRequestError("Could not read login data.", err)
		}

		email := strings.TrimSpace(form.Email)
		if email == "" || form.Password == "" {
			return e.BadRequestError("Email and password are required.", nil)
		}

		user, userErr := app.FindAuthRecordByEmail("users", email)
		if userErr == nil && user.ValidatePassword(form.Password) {
			if user.GetBool("is_admin") {
				superuser, err := syncSuperuserForLogin(app, user, form.Password)
				if err != nil {
					return e.InternalServerError("Could not prepare admin login.", err)
				}

				return apis.RecordAuthResponse(e, superuser, core.MFAMethodPassword, map[string]any{
					"admin": true,
				})
			}

			return apis.RecordAuthResponse(e, user, core.MFAMethodPassword, nil)
		}

		if userErr != nil && !errors.Is(userErr, sql.ErrNoRows) {
			return e.InternalServerError("Could not check user login.", userErr)
		}

		superuser, superuserErr := app.FindAuthRecordByEmail(core.CollectionNameSuperusers, email)
		if superuserErr == nil && superuser.ValidatePassword(form.Password) {
			if _, err := syncUserForSuperuserLogin(app, superuser, form.Password); err != nil {
				return e.InternalServerError("Could not prepare app admin account.", err)
			}

			return apis.RecordAuthResponse(e, superuser, core.MFAMethodPassword, map[string]any{
				"admin": true,
			})
		}

		if superuserErr != nil && !errors.Is(superuserErr, sql.ErrNoRows) {
			return e.InternalServerError("Could not check admin login.", superuserErr)
		}

		return e.BadRequestError("Failed to authenticate.", errors.New("invalid login credentials"))
	}
}

func listAdminUsers(app core.App) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		if err := requireAppAdmin(e); err != nil {
			return err
		}

		records := []*core.Record{}
		if err := app.RecordQuery("users").OrderBy("email ASC").All(&records); err != nil {
			return e.InternalServerError("Could not load users.", err)
		}

		items := make([]map[string]any, 0, len(records))
		for _, record := range records {
			items = append(items, map[string]any{
				"id":            record.Id,
				"email":         record.Email(),
				"name":          record.GetString("name"),
				"is_admin":      record.GetBool("is_admin"),
				"is_superuser":  hasSuperuserWithEmail(app, record.Email()),
				"collection_id": record.Collection().Id,
			})
		}

		return e.JSON(http.StatusOK, map[string]any{"items": items})
	}
}

func promoteAdminUser(app core.App) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		if err := requireAppAdmin(e); err != nil {
			return err
		}

		record, err := app.FindRecordById("users", e.Request.PathValue("id"))
		if err != nil {
			return e.NotFoundError("User not found.", err)
		}

		record.Set("is_admin", true)
		if err := app.Save(record); err != nil {
			return e.BadRequestError("Could not promote user.", err)
		}

		return e.JSON(http.StatusOK, map[string]any{
			"id":            record.Id,
			"email":         record.Email(),
			"name":          record.GetString("name"),
			"is_admin":      record.GetBool("is_admin"),
			"is_superuser":  hasSuperuserWithEmail(app, record.Email()),
			"collection_id": record.Collection().Id,
		})
	}
}

func demoteAdminUser(app core.App) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		if err := requireAppAdmin(e); err != nil {
			return err
		}

		record, err := app.FindRecordById("users", e.Request.PathValue("id"))
		if err != nil {
			return e.NotFoundError("User not found.", err)
		}
		if e.Auth != nil && strings.EqualFold(e.Auth.Email(), record.Email()) {
			return e.BadRequestError("Admins cannot demote their own account.", nil)
		}

		superuser, superuserErr := app.FindAuthRecordByEmail(core.CollectionNameSuperusers, record.Email())
		if superuserErr == nil {
			count, countErr := app.CountRecords(core.CollectionNameSuperusers)
			if countErr != nil {
				return e.InternalServerError("Could not check existing superusers.", countErr)
			}
			if count <= 1 {
				return e.BadRequestError("At least one superuser must remain.", nil)
			}
		} else if !errors.Is(superuserErr, sql.ErrNoRows) {
			return e.InternalServerError("Could not check superuser status.", superuserErr)
		}

		record.Set("is_admin", false)
		if err := app.Save(record); err != nil {
			return e.BadRequestError("Could not demote user.", err)
		}

		if superuserErr == nil {
			if deleteErr := app.Delete(superuser); deleteErr != nil {
				return e.BadRequestError("User was demoted, but the superuser account could not be removed.", deleteErr)
			}
		}

		return e.JSON(http.StatusOK, map[string]any{
			"id":            record.Id,
			"email":         record.Email(),
			"name":          record.GetString("name"),
			"is_admin":      record.GetBool("is_admin"),
			"is_superuser":  false,
			"collection_id": record.Collection().Id,
		})
	}
}

func bulkUpdateWorkFormula(app core.App) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		if err := requireAppAdmin(e); err != nil {
			return err
		}

		form := bulkUpdateWorkFormulaForm{}
		if err := e.BindBody(&form); err != nil {
			return e.BadRequestError("Could not read request data.", err)
		}

		if !form.Preview && (form.WorkHoursRequired == nil || form.OpenHoursRequired == nil) {
			return e.BadRequestError("workHoursRequired and openHoursRequired are required.", nil)
		}

		// box_id -> member ids in that box, so we can classify each member as
		// shared / individual / unassigned.
		boxSizeByMember := map[string]int{}
		boxes := []*core.Record{}
		if err := app.RecordQuery("boxes").All(&boxes); err != nil {
			return e.InternalServerError("Could not load boxes.", err)
		}
		for _, box := range boxes {
			members := box.GetStringSlice("box_members")
			for _, memberId := range members {
				boxSizeByMember[memberId] = len(members)
			}
		}

		members := []*core.Record{}
		if err := app.RecordQuery("member").All(&members); err != nil {
			return e.InternalServerError("Could not load members.", err)
		}

		matched := make([]*core.Record, 0, len(members))

		for _, member := range members {
			if form.Criteria.MemberId != "" {
				if member.Id == form.Criteria.MemberId {
					matched = append(matched, member)
				}
				continue
			}

			snapshotId := member.GetString("member_snapshot_id")
			if snapshotId == "" {
				continue
			}
			snapshot, err := app.FindRecordById("member_snapshot", snapshotId)
			if err != nil {
				continue
			}

			var info memberInfoSubset
			if err := snapshot.UnmarshalJSONField("member_info", &info); err != nil {
				continue
			}

			if form.Criteria.MemberType != "" && info.MemberType != form.Criteria.MemberType {
				continue
			}

			if form.Criteria.BoardStatus != "" {
				onBoard := boardRoles[info.Role]
				if form.Criteria.BoardStatus == "board" && !onBoard {
					continue
				}
				if form.Criteria.BoardStatus == "non_board" && onBoard {
					continue
				}
			}

			if form.Criteria.BoxSharing != "" {
				size, hasBox := boxSizeByMember[member.Id]
				switch form.Criteria.BoxSharing {
				case "shared":
					if !hasBox || size <= 1 {
						continue
					}
				case "individual":
					if !hasBox || size != 1 {
						continue
					}
				case "unassigned":
					if hasBox {
						continue
					}
				default:
					continue
				}
			}

			matched = append(matched, member)
		}

		if form.Preview {
			ids := make([]string, 0, len(matched))
			for _, m := range matched {
				ids = append(ids, m.Id)
			}
			return e.JSON(http.StatusOK, map[string]any{
				"matchedCount": len(matched),
				"memberIds":    ids,
			})
		}

		workFormulaCollection, err := app.FindCollectionByNameOrId("work_formula")
		if err != nil {
			return e.InternalServerError("Could not load work_formula collection.", err)
		}

		updatedIds := make([]string, 0, len(matched))
		now := time.Now()

		for _, member := range matched {
			wf, err := app.FindFirstRecordByFilter(
				"work_formula",
				"member_id = {:id}",
				dbx.Params{"id": member.Id},
			)
			if err != nil {
				if !errors.Is(err, sql.ErrNoRows) {
					return e.InternalServerError("Could not load work formula for member "+member.Id+".", err)
				}
				wf = core.NewRecord(workFormulaCollection)
				wf.Set("member_id", member.Id)
				wf.Set("work_hours_completed", 0)
				wf.Set("open_hours_completed", 0)
				wf.Set("created_at", now)
			}

			wf.Set("work_hours_required", *form.WorkHoursRequired)
			wf.Set("open_hours_required", *form.OpenHoursRequired)
			wf.Set("modified_at", now)

			if err := app.Save(wf); err != nil {
				return e.InternalServerError("Could not save work formula for member "+member.Id+".", err)
			}
			updatedIds = append(updatedIds, member.Id)
		}

		return e.JSON(http.StatusOK, map[string]any{
			"updatedCount": len(updatedIds),
			"memberIds":    updatedIds,
		})
	}
}

func requireAppAdmin(e *core.RequestEvent) error {
	if e.Auth == nil {
		return e.UnauthorizedError("Admin login is required.", nil)
	}
	if e.Auth.IsSuperuser() {
		return nil
	}
	if e.Auth.Collection().Name == "users" && e.Auth.GetBool("is_admin") {
		return nil
	}

	return e.ForbiddenError("Admin access is required.", nil)
}

func syncSuperuserForLogin(app core.App, user *core.Record, password string) (*core.Record, error) {
	superuser, err := app.FindAuthRecordByEmail(core.CollectionNameSuperusers, user.Email())
	if err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			return nil, err
		}

		collection, err := app.FindCollectionByNameOrId(core.CollectionNameSuperusers)
		if err != nil {
			return nil, err
		}
		superuser = core.NewRecord(collection)
		superuser.SetEmail(user.Email())
	}

	superuser.SetPassword(password)
	superuser.SetVerified(true)
	if err := app.Save(superuser); err != nil {
		return nil, err
	}

	return superuser, nil
}

func syncUserForSuperuserLogin(app core.App, superuser *core.Record, password string) (*core.Record, error) {
	user, err := app.FindAuthRecordByEmail("users", superuser.Email())
	if err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			return nil, err
		}

		collection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return nil, err
		}
		user = core.NewRecord(collection)
		user.SetEmail(superuser.Email())
		user.SetEmailVisibility(true)
	}

	user.Set("is_admin", true)
	user.SetPassword(password)
	user.SetVerified(true)
	if err := app.Save(user); err != nil {
		return nil, err
	}

	return user, nil
}

func hasSuperuserWithEmail(app core.App, email string) bool {
	if email == "" {
		return false
	}
	_, err := app.FindAuthRecordByEmail(core.CollectionNameSuperusers, email)
	return err == nil
}

func ensureMemberSnapshotCollection(app core.App, usersCollectionId string) (*core.Collection, error) {
	if existing, err := app.FindCollectionByNameOrId("member_snapshot"); err == nil {
		if err := configureMemberSnapshotCollection(app, existing, usersCollectionId); err != nil {
			return nil, err
		}
		if err := app.Save(existing); err != nil {
			return nil, err
		}
		return existing, nil
	}

	collection := core.NewBaseCollection("member_snapshot")
	if err := configureMemberSnapshotCollection(app, collection, usersCollectionId); err != nil {
		return nil, err
	}

	if err := app.Save(collection); err != nil {
		return nil, err
	}

	return collection, nil
}

func configureMemberSnapshotCollection(app core.App, collection *core.Collection, usersCollectionId string) error {
	authenticatedRule := "@request.auth.id != ''"
	ownerRule := "user_id = @request.auth.id || @request.auth.is_admin = true"

	collection.ListRule = types.Pointer(authenticatedRule)
	collection.ViewRule = types.Pointer(authenticatedRule)
	collection.CreateRule = types.Pointer(ownerRule)
	collection.UpdateRule = types.Pointer(ownerRule)
	collection.DeleteRule = types.Pointer(ownerRule)

	if err := addTimeAttributeFields(app, collection); err != nil {
		return err
	}

	addFieldIfMissing(collection, &core.RelationField{
		Name:         "user_id",
		CollectionId: usersCollectionId,
		Required:     true,
	})

	// Plain string, not a relation — avoids a circular dependency with
	// `member` (which points back at this collection via
	// member_snapshot_id), so member_snapshot and member can both be
	// created in a single pass.
	addFieldIfMissing(collection, &core.TextField{
		Name: "member_id",
	})

	addFieldIfMissing(collection, &core.TextField{
		Name: "updated_by",
	})

	addFieldIfMissing(collection, &core.NumberField{
		Name: "meeting_exemption",
	})

	addFieldIfMissing(collection, &core.TextField{
		Name: "notes",
	})

	addFieldIfMissing(collection, &core.JSONField{
		Name:     "personal_info",
		Required: true,
	})

	addFieldIfMissing(collection, &core.JSONField{
		Name:     "member_info",
		Required: true,
	})

	addFieldIfMissing(collection, &core.JSONField{
		Name:     "box_info",
		Required: true,
	})

	return nil
}

func ensureMemberCollection(app core.App, usersCollectionId string, snapshotCollectionId string) (*core.Collection, error) {
	if existing, err := app.FindCollectionByNameOrId("member"); err == nil {
		if err := configureMemberCollection(app, existing, usersCollectionId, snapshotCollectionId); err != nil {
			return nil, err
		}
		if err := app.Save(existing); err != nil {
			return nil, err
		}
		return existing, nil
	}

	collection := core.NewBaseCollection("member")
	if err := configureMemberCollection(app, collection, usersCollectionId, snapshotCollectionId); err != nil {
		return nil, err
	}

	if err := app.Save(collection); err != nil {
		return nil, err
	}

	return collection, nil
}

func configureMemberCollection(app core.App, collection *core.Collection, usersCollectionId string, snapshotCollectionId string) error {
	authenticatedRule := "@request.auth.id != ''"
	ownerRule := "user_id = @request.auth.id || @request.auth.is_admin = true"

	collection.ListRule = types.Pointer(ownerRule)
	collection.ViewRule = types.Pointer(ownerRule)
	collection.CreateRule = types.Pointer(authenticatedRule)
	collection.UpdateRule = types.Pointer(ownerRule)
	collection.DeleteRule = types.Pointer(ownerRule)

	if err := addTimeAttributeFields(app, collection); err != nil {
		return err
	}

	addFieldIfMissing(collection, &core.RelationField{
		Name:         "user_id",
		CollectionId: usersCollectionId,
		Required:     true,
	})

	addFieldIfMissing(collection, &core.RelationField{
		Name:         "member_snapshot_id",
		CollectionId: snapshotCollectionId,
		Required:     true,
	})

	return nil
}

// ensureBoxesCollection ports the schema originally captured by the
// auto-generated 1784314870_created_boxes.go / 1784315056_updated_boxes.go
// migrations into the same idempotent find-or-create pattern used above.
func ensureBoxesCollection(app core.App, memberCollectionId string) (*core.Collection, error) {
	log.Println("ensureBoxesCollection running")

	if existing, err := app.FindCollectionByNameOrId("boxes"); err == nil {
		if err := configureBoxesCollection(app, existing, memberCollectionId); err != nil {
			return nil, err
		}
		if err := app.Save(existing); err != nil {
			return nil, err
		}

		return existing, nil
	}

	collection := core.NewBaseCollection("boxes")
	if err := configureBoxesCollection(app, collection, memberCollectionId); err != nil {
		return nil, err
	}

	if err := app.Save(collection); err != nil {
		return nil, err
	}

	return collection, nil
}

func configureBoxesCollection(app core.App, collection *core.Collection, memberCollectionId string) error {
	authenticatedRule := "@request.auth.id != ''"

	collection.ListRule = types.Pointer(authenticatedRule)
	collection.ViewRule = types.Pointer(authenticatedRule)
	collection.CreateRule = types.Pointer(authenticatedRule)
	collection.UpdateRule = types.Pointer(authenticatedRule)
	collection.DeleteRule = types.Pointer(authenticatedRule)

	if err := addTimeAttributeFields(app, collection); err != nil {
		return err
	}

	addFieldIfMissing(collection, &core.TextField{Name: "box_state"})
	addFieldIfMissing(collection, &core.NumberField{Name: "box_number"})
	addFieldIfMissing(collection, &core.TextField{Name: "box_name"})
	addFieldIfMissing(collection, &core.TextField{Name: "updated_by"})
	addFieldIfMissing(collection, &core.RelationField{
		Name:         "box_members",
		CollectionId: memberCollectionId,
		MaxSelect:    5,
	})
	addFieldIfMissing(collection, &core.JSONField{Name: "waitlist"})
	addFieldIfMissing(collection, &core.TextField{Name: "notes"})

	return nil
}

// ensureWorkFormulaCollection creates/updates the work_formula collection,
// tracking each member's required vs. completed work and open hours.
func ensureWorkFormulaCollection(app core.App, memberCollectionId string) (*core.Collection, error) {
	log.Println("ensureWorkFormulaCollection running")

	if existing, err := app.FindCollectionByNameOrId("work_formula"); err == nil {
		if err := configureWorkFormulaCollection(app, existing, memberCollectionId); err != nil {
			return nil, err
		}
		if err := app.Save(existing); err != nil {
			return nil, err
		}

		return existing, nil
	}

	collection := core.NewBaseCollection("work_formula")
	if err := configureWorkFormulaCollection(app, collection, memberCollectionId); err != nil {
		return nil, err
	}

	if err := app.Save(collection); err != nil {
		return nil, err
	}

	return collection, nil
}

func configureWorkFormulaCollection(app core.App, collection *core.Collection, memberCollectionId string) error {
	// Any authenticated member can view/update their own row; admins can
	// view/update all rows. Which specific fields a non-admin may change is
	// enforced separately by the OnRecordUpdateRequest hook in main(),
	// since PocketBase rules can't restrict individual fields.
	ownRowOrAdminRule := "@request.auth.id != '' && (member_id.user_id = @request.auth.id || @request.auth.is_admin = true)"
	adminRule := "@request.auth.id != '' && @request.auth.is_admin = true"

	collection.ListRule = types.Pointer(ownRowOrAdminRule)
	collection.ViewRule = types.Pointer(ownRowOrAdminRule)
	collection.CreateRule = types.Pointer(adminRule)
	collection.UpdateRule = types.Pointer(ownRowOrAdminRule)
	collection.DeleteRule = types.Pointer(adminRule)

	if err := addTimeAttributeFields(app, collection); err != nil {
		return err
	}

	addFieldIfMissing(collection, &core.RelationField{
		Name:         "member_id",
		CollectionId: memberCollectionId,
		Required:     true,
	})
	addFieldIfMissing(collection, &core.NumberField{Name: "work_hours_required", OnlyInt: true})
	addFieldIfMissing(collection, &core.NumberField{Name: "work_hours_completed", OnlyInt: true})
	addFieldIfMissing(collection, &core.NumberField{Name: "open_hours_required", OnlyInt: true})
	addFieldIfMissing(collection, &core.NumberField{Name: "open_hours_completed", OnlyInt: true})

	return nil
}

// ensureRequirementUpdateRequestCollection tracks member-submitted requests
// (e.g. "I completed 3 work hours on this date") awaiting admin approval,
// separate from the work_formula rows themselves.
func ensureRequirementUpdateRequestCollection(app core.App, usersCollectionId string, snapshotCollectionId string) (*core.Collection, error) {
	log.Println("ensureRequirementUpdateRequestCollection running")

	if existing, err := app.FindCollectionByNameOrId("requirement_update_request"); err == nil {
		if err := configureRequirementUpdateRequestCollection(app, existing, usersCollectionId, snapshotCollectionId); err != nil {
			return nil, err
		}
		if err := app.Save(existing); err != nil {
			return nil, err
		}

		return existing, nil
	}

	collection := core.NewBaseCollection("requirement_update_request")
	if err := configureRequirementUpdateRequestCollection(app, collection, usersCollectionId, snapshotCollectionId); err != nil {
		return nil, err
	}

	if err := app.Save(collection); err != nil {
		return nil, err
	}

	return collection, nil
}

func configureRequirementUpdateRequestCollection(app core.App, collection *core.Collection, usersCollectionId string, snapshotCollectionId string) error {
	ownerOrAdminRule := "user_id = @request.auth.id || @request.auth.is_admin = true"
	adminRule := "@request.auth.id != '' && @request.auth.is_admin = true"

	collection.ListRule = types.Pointer(ownerOrAdminRule)
	collection.ViewRule = types.Pointer(ownerOrAdminRule)
	collection.CreateRule = types.Pointer(`user_id = @request.auth.id && status = "PENDING"`)
	collection.UpdateRule = types.Pointer(adminRule)
	collection.DeleteRule = types.Pointer(adminRule)

	if err := addTimeAttributeFields(app, collection); err != nil {
		return err
	}

	addFieldIfMissing(collection, &core.RelationField{
		Name:         "user_id",
		CollectionId: usersCollectionId,
		Required:     true,
	})
	addFieldIfMissing(collection, &core.TextField{Name: "member_id", Required: true})
	addFieldIfMissing(collection, &core.RelationField{
		Name:         "member_snapshot_id",
		CollectionId: snapshotCollectionId,
		Required:     true,
	})
	addFieldIfMissing(collection, &core.TextField{Name: "request_type", Required: true})
	addFieldIfMissing(collection, &core.NumberField{Name: "quantity"})
	addFieldIfMissing(collection, &core.TextField{Name: "payment_type"})
	addFieldIfMissing(collection, &core.NumberField{Name: "occurred_at", OnlyInt: true})
	addFieldIfMissing(collection, &core.TextField{Name: "notes"})
	addFieldIfMissing(collection, &core.TextField{Name: "status", Required: true})
	addFieldIfMissing(collection, &core.TextField{Name: "reviewed_by"})
	addFieldIfMissing(collection, &core.NumberField{Name: "reviewed_at", OnlyInt: true})
	addFieldIfMissing(collection, &core.TextField{Name: "admin_notes"})

	return nil
}

// legacy snapshot collection functions
func ensureLegacySnapshotCollection(app core.App, usersCollectionId string) (*core.Collection, error) {
	if existing, err := app.FindCollectionByNameOrId("legacy_snapshots"); err == nil {
		if err := configureLegacySnapshotCollection(app, existing, usersCollectionId); err != nil {
			return nil, err
		}
		if err := app.Save(existing); err != nil {
			return nil, err
		}

		return existing, nil
	}

	collection := core.NewBaseCollection("legacy_snapshots")
	if err := configureLegacySnapshotCollection(app, collection, usersCollectionId); err != nil {
		return nil, err
	}

	if err := app.Save(collection); err != nil {
		return nil, err
	}

	return collection, nil
}

func configureLegacySnapshotCollection(app core.App, collection *core.Collection, usersCollectionId string) error {
	adminRule := "@request.auth.id != '' && @request.auth.is_admin = true"

	collection.ListRule = types.Pointer(adminRule)
	collection.ViewRule = types.Pointer(adminRule)
	collection.CreateRule = types.Pointer(adminRule)
	collection.UpdateRule = types.Pointer(adminRule)
	collection.DeleteRule = types.Pointer(adminRule)

	if err := addTimeAttributeFields(app, collection); err != nil {
		return err
	}

	addFieldIfMissing(collection, &core.RelationField{
		Name:         "user_id",
		CollectionId: usersCollectionId,
		Required:     true,
	})

	addFieldIfMissing(collection, &core.TextField{
		Name: "member_id",
	})

	addFieldIfMissing(collection, &core.TextField{
		Name: "updated_by",
	})

	addFieldIfMissing(collection, &core.TextField{
		Name: "notes",
	})

	addFieldIfMissing(collection, &core.JSONField{
		Name:     "personal_info",
		Required: true,
	})

	addFieldIfMissing(collection, &core.JSONField{
		Name:     "member_info",
		Required: true,
	})

	addFieldIfMissing(collection, &core.JSONField{
		Name:     "box_info",
		Required: true,
	})

	return nil
}

func addFieldIfMissing(collection *core.Collection, field core.Field) {
	existing := collection.Fields.GetByName(field.GetName())

	if existing == nil {
		collection.Fields.Add(field)
		return
	}

	if existing.Type() != field.Type() {
		collection.Fields.RemoveByName(field.GetName())
		collection.Fields.Add(field)
	}
}

func addTimeAttributeFields(app core.App, collection *core.Collection) error {
	// created_at used to be stored as a NumberField (unix timestamp).
	// PocketBase rejects changing an existing field's type in place (it
	// reuses the same field id when Add() matches by name, and type changes
	// on an existing id are blocked), so remove the old field first and add
	// the DateField fresh - this drops and recreates the underlying column.
	if existing := collection.Fields.GetByName("created_at"); existing == nil {
		collection.Fields.Add(&core.DateField{Name: "created_at"})
	} else if _, isDateField := existing.(*core.DateField); !isDateField {
		collection.Fields.RemoveByName("created_at")
		collection.Fields.Add(&core.DateField{Name: "created_at"})
	}

	if existing := collection.Fields.GetByName("modified_at"); existing == nil {
		collection.Fields.Add(&core.DateField{Name: "modified_at"})
	} else if _, isDateField := existing.(*core.DateField); !isDateField {
		collection.Fields.RemoveByName("modified_at")
		collection.Fields.Add(&core.DateField{Name: "modified_at"})
	}

	// Push the field change to the database right away.
	return app.Save(collection)
}
