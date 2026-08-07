package main

import (
	"database/sql"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

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

	snapshotCollection, err := ensureMemberSnapshotCollection(app)
	if err != nil {
		return err
	}

	if err := ensureMemberCollection(app, snapshotCollection.Id); err != nil {
		return err
	}

	if _, err := ensureBoxesCollection(app); err != nil {
		return err
	}
	if _, err := ensureWorkFormulaCollection(app); err != nil {
		return err
	}
	if _, err := ensureRequirementUpdateRequestCollection(app, snapshotCollection.Id); err != nil {
		return err
	}

	_, err = ensureLegacySnapshotCollection(app, snapshotCollection.Id)
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

func ensureMemberSnapshotCollection(app core.App) (*core.Collection, error) {
	existing, err := app.FindCollectionByNameOrId("member_snapshot")
	if err == nil {
		users, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return nil, err
		}

		configureMemberSnapshotCollection(existing, users.Id)
		if err := app.Save(existing); err != nil {
			return nil, err
		}

		return existing, nil
	}

	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return nil, err
	}

	collection := core.NewBaseCollection("member_snapshot")
	configureMemberSnapshotCollection(collection, users.Id)

	if err := app.Save(collection); err != nil {
		return nil, err
	}

	return collection, nil
}

func configureMemberSnapshotCollection(collection *core.Collection, usersCollectionId string) {
	authenticatedRule := "@request.auth.id != ''"
	ownerRule := "user_id = @request.auth.id || @request.auth.is_admin = true"

	collection.ListRule = types.Pointer(authenticatedRule)
	collection.ViewRule = types.Pointer(authenticatedRule)
	collection.CreateRule = types.Pointer(ownerRule)
	collection.UpdateRule = types.Pointer(ownerRule)
	collection.DeleteRule = types.Pointer(ownerRule)
	addTimeAttributeFields(collection)

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

}

func ensureMemberCollection(app core.App, snapshotCollectionId string) error {
	if existing, err := app.FindCollectionByNameOrId("member"); err == nil {
		users, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		configureMemberCollection(existing, users.Id, snapshotCollectionId)
		return app.Save(existing)
	}

	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return err
	}

	collection := core.NewBaseCollection("member")
	configureMemberCollection(collection, users.Id, snapshotCollectionId)

	return app.Save(collection)
}

func configureMemberCollection(collection *core.Collection, usersCollectionId string, snapshotCollectionId string) {
	authenticatedRule := "@request.auth.id != ''"
	ownerRule := "user_id = @request.auth.id || @request.auth.is_admin = true"

	collection.ListRule = types.Pointer(ownerRule)
	collection.ViewRule = types.Pointer(ownerRule)
	collection.CreateRule = types.Pointer(authenticatedRule)
	collection.UpdateRule = types.Pointer(ownerRule)
	collection.DeleteRule = types.Pointer(ownerRule)

	addTimeAttributeFields(collection)

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
}

// ensureBoxesCollection ports the schema originally captured by the
// auto-generated 1784314870_created_boxes.go / 1784315056_updated_boxes.go
// migrations into the same idempotent find-or-create pattern used above.
func ensureBoxesCollection(app core.App) (*core.Collection, error) {
	log.Println("ensureBoxesCollection running")

	if existing, err := app.FindCollectionByNameOrId("boxes"); err == nil {
		configureBoxesCollection(existing)
		if err := app.Save(existing); err != nil {
			return nil, err
		}

		return existing, nil
	}

	collection := core.NewBaseCollection("boxes")
	configureBoxesCollection(collection)

	if err := app.Save(collection); err != nil {
		return nil, err
	}

	return collection, nil
}

func configureBoxesCollection(collection *core.Collection) {
	authenticatedRule := "@request.auth.id != ''"
	// memberOfBoxRule := "@request.auth.id != '' && " +
	// 	"@collection.member_snapshot.user_id ?= @request.auth.id && " +
	// 	"@collection.member_snapshot.member_id ?= box_member_s " + "|| @request.auth.is_admin = true"
	// ownerRule := "user_id = @request.auth.id || @request.auth.is_admin = true"
	collection.ListRule = types.Pointer(authenticatedRule)
	collection.ViewRule = types.Pointer(authenticatedRule)

	// collection.ListRule = types.Pointer(authenticatedRule)
	// collection.ViewRule = types.Pointer(authenticatedRule)
	collection.CreateRule = types.Pointer(authenticatedRule)
	collection.UpdateRule = types.Pointer(authenticatedRule) // i think this should be opened for all users to add themselves for waitlisting
	collection.DeleteRule = types.Pointer(authenticatedRule)

	addTimeAttributeFields(collection)
	addFieldIfMissing(collection, &core.TextField{Name: "box_state"})
	addFieldIfMissing(collection, &core.TextField{Name: "updated_by"})
	addFieldIfMissing(collection, &core.JSONField{Name: "box_member_s"})
	addFieldIfMissing(collection, &core.JSONField{Name: "waitlist_list"})
	addFieldIfMissing(collection, &core.TextField{Name: "notes"})
	// Superusers always bypass API rules entirely (see PocketBase docs), so
	// they can already list/view/edit every box without any rule needed
	// here. This rule only governs everyone else: a regular authenticated
	// user may list/view a box only if there's a member_snapshot they own
	// (user_id = them) whose member_id shows up in that box's
	// box_member_s list. @collection.* is used because boxes has no direct
	// relation field to member_snapshot — both conditions reference the
	// same @collection.member_snapshot alias, so they constrain the same
	// joined row rather than being independent checks.
	//
	// NOTE: this assumes box_member_s is a JSON array of member_id strings
	// (e.g. ["m_123", "m_456"]). If it's structured differently (e.g. an
	// array of objects), this filter will need to change accordingly.

	// create/update/delete stay unset (nil = superuser-only): editing box
	// assignments is an administrative action, not self-service.

	// collection.Fields.Add(
	//  &core.NumberField{Name: "box_state"},
	//  &core.TextField{Name: "updated_by"},
	//  &core.JSONField{Name: "box_member_s"},
	//  &core.JSONField{Name: "waitlist_list"},
	//  &core.TextField{Name: "notes"},
	// )
}

// ensureWorkFormulaCollection creates/updates the work_formula collection,
// tracking each member's required vs. completed work and open hours.
func ensureWorkFormulaCollection(app core.App) (*core.Collection, error) {
	log.Println("ensureWorkFormulaCollection running")

	if existing, err := app.FindCollectionByNameOrId("work_formula"); err == nil {
		configureWorkFormulaCollection(existing)
		if err := app.Save(existing); err != nil {
			return nil, err
		}

		return existing, nil
	}

	collection := core.NewBaseCollection("work_formula")
	configureWorkFormulaCollection(collection)

	if err := app.Save(collection); err != nil {
		return nil, err
	}

	return collection, nil
}

func configureWorkFormulaCollection(collection *core.Collection) {
	// WF rules
	memberOfWFRule := "@request.auth.id != '' && " +
		"@collection.member_snapshot.user_id ?= @request.auth.id && " +
		"@collection.member_snapshot.member_id ?= member_id " + "|| @request.auth.is_admin = true"
	adminRule := "@request.auth.id != '' && @request.auth.is_admin = true"

	collection.ListRule = types.Pointer(memberOfWFRule)
	collection.ViewRule = types.Pointer(memberOfWFRule)
	// collection.CreateRule = types.Pointer(authenticatedRule)
	collection.UpdateRule = types.Pointer(adminRule)
	// collection.DeleteRule = types.Pointer(authenticatedRule)
	addTimeAttributeFields(collection)
	addFieldIfMissing(collection, &core.TextField{Name: "member_id"})
	addFieldIfMissing(collection, &core.TextField{Name: "volunteer_activity"})
	addFieldIfMissing(collection, &core.NumberField{Name: "volunteer_date", OnlyInt: true})
	addFieldIfMissing(collection, &core.NumberField{Name: "volunteer_hours", OnlyInt: true})
	addFieldIfMissing(collection, &core.NumberField{Name: "work_hours_required", OnlyInt: true})
	addFieldIfMissing(collection, &core.NumberField{Name: "work_hours_completed", OnlyInt: true})
	addFieldIfMissing(collection, &core.NumberField{Name: "open_hours_required", OnlyInt: true})
	addFieldIfMissing(collection, &core.NumberField{Name: "open_hours_completed", OnlyInt: true})
	addFieldIfMissing(collection, &core.NumberField{Name: "created_at", OnlyInt: true})
	addFieldIfMissing(collection, &core.NumberField{Name: "modified_at", OnlyInt: true})
}

func ensureRequirementUpdateRequestCollection(app core.App, snapshotCollectionId string) (*core.Collection, error) {
	log.Println("ensureRequirementUpdateRequestCollection running")

	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return nil, err
	}

	if existing, err := app.FindCollectionByNameOrId("requirement_update_request"); err == nil {
		configureRequirementUpdateRequestCollection(existing, users.Id, snapshotCollectionId)
		if err := app.Save(existing); err != nil {
			return nil, err
		}

		return existing, nil
	}

	collection := core.NewBaseCollection("requirement_update_request")
	configureRequirementUpdateRequestCollection(collection, users.Id, snapshotCollectionId)

	if err := app.Save(collection); err != nil {
		return nil, err
	}

	return collection, nil
}

func configureRequirementUpdateRequestCollection(collection *core.Collection, usersCollectionId string, snapshotCollectionId string) {
	ownerOrAdminRule := "user_id = @request.auth.id || @request.auth.is_admin = true"
	adminRule := "@request.auth.id != '' && @request.auth.is_admin = true"

	collection.ListRule = types.Pointer(ownerOrAdminRule)
	collection.ViewRule = types.Pointer(ownerOrAdminRule)
	collection.CreateRule = types.Pointer("user_id = @request.auth.id && status = \"PENDING\"")
	collection.UpdateRule = types.Pointer(adminRule)
	collection.DeleteRule = types.Pointer(adminRule)

	addTimeAttributeFields(collection)
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
}

func addFieldIfMissing(collection *core.Collection, field core.Field) {
	if collection.Fields.GetByName(field.GetName()) == nil {
		collection.Fields.Add(field)
	}
}

func addTimeAttributeFields(collection *core.Collection) {
	if collection.Fields.GetByName("created_at") == nil {
		collection.Fields.Add(
			&core.NumberField{
				Name:    "created_at",
				OnlyInt: true,
			},
		)
	}

	if collection.Fields.GetByName("modified_at") == nil {
		collection.Fields.Add(
			&core.NumberField{
				Name:    "modified_at",
				OnlyInt: true,
			},
		)
	}
}

// legacy snapshot
// ensureLegacySnapshotCollection mirrors the idempotent find-or-create
// pattern used by ensureBoxesCollection: look up the collection by name,
// and only create it if it doesn't already exist.
func ensureLegacySnapshotCollection(app core.App, usersCollectionId string) (*core.Collection, error) {
	log.Println("ensureLegacySnapshotCollection running")

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

	addTimeAttributeFields(collection)

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
