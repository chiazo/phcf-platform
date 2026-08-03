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

	_, err = ensureLegacySnapshotCollection(app)
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

		if err := configureMemberSnapshotCollection(app, existing, users.Id); err != nil {
			return nil, err
		}
		if err := configureMemberSnapshotCollection(app, existing, users.Id); err != nil {
			return nil, err
		}
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
	if err := configureMemberSnapshotCollection(app, collection, users.Id); err != nil {
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

// legacy snapshot collection functions
func ensureLegacySnapshotCollection(app core.App) (*core.Collection, error) {
	existing, err := app.FindCollectionByNameOrId("legacy_snapshot")
	if err == nil {
		users, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return nil, err
		}

		if err := configureLegacySnapshotCollection(app, existing, users.Id); err != nil {
			return nil, err
		}
		if err := app.Save(existing); err != nil {
			return nil, err
		}

		return existing, nil
	}

	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return nil, err
	}

	collection := core.NewBaseCollection("legacy_snapshot")
	if err := configureLegacySnapshotCollection(app, collection, users.Id); err != nil {
		return nil, err
	}

	if err := app.Save(collection); err != nil {
		return nil, err
	}

	return collection, nil
}

func configureLegacySnapshotCollection(app core.App, collection *core.Collection, usersCollectionId string) error {
	authenticatedRule := "@request.auth.id != ''"
	// ownerRule := "user_id = @request.auth.id"

	collection.ListRule = types.Pointer(authenticatedRule)
	collection.ViewRule = types.Pointer(authenticatedRule)
	collection.CreateRule = types.Pointer(authenticatedRule)
	collection.UpdateRule = types.Pointer(authenticatedRule)
	collection.DeleteRule = types.Pointer(authenticatedRule)
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

// member collection functions
func ensureMemberCollection(app core.App, snapshotCollectionId string) error {
	if existing, err := app.FindCollectionByNameOrId("member"); err == nil {
		users, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		if err := configureMemberCollection(app, existing, users.Id, snapshotCollectionId); err != nil {
			return err
		}
		return app.Save(existing)
	}

	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return err
	}

	collection := core.NewBaseCollection("member")
	if err := configureMemberCollection(app, collection, users.Id, snapshotCollectionId); err != nil {
		return err
	}

	return app.Save(collection)
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
// No access rules were ever configured on this collection (dashboard
// defaults to superuser-only), so none are set here either.
func ensureBoxesCollection(app core.App) (*core.Collection, error) {
	log.Println("ensureBoxesCollection running")

	if existing, err := app.FindCollectionByNameOrId("boxes"); err == nil {
		if err := configureBoxesCollection(app, existing); err != nil {
			return nil, err
		}
		if err := app.Save(existing); err != nil {
			return nil, err
		}

		return existing, nil
	}

	collection := core.NewBaseCollection("boxes")
	if err := configureBoxesCollection(app, collection); err != nil {
		return nil, err
	}

	if err := app.Save(collection); err != nil {
		return nil, err
	}

	return collection, nil
}

func configureBoxesCollection(app core.App, collection *core.Collection) error {
	authenticatedRule := `
        @request.auth.id != ''
    `

	collection.ListRule = types.Pointer(authenticatedRule)
	collection.ViewRule = types.Pointer(authenticatedRule)
	collection.CreateRule = types.Pointer(authenticatedRule)
	collection.UpdateRule = types.Pointer(authenticatedRule)
	collection.DeleteRule = types.Pointer(authenticatedRule)

	// log.Println("work_formula rules updated")
	if err := addTimeAttributeFields(app, collection); err != nil {
		return err
	}
	addFieldIfMissing(collection, &core.NumberField{Name: "box_state"})
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
	memberOfBoxRule := "@request.auth.id != '' && " +
		"@collection.member_snapshot.user_id ?= @request.auth.id && " +
		"@collection.member_snapshot.member_id ?= box_member_s " + "|| @request.auth.is_admin = true"

	log.Println("work_formula rules updated")
	if err := addTimeAttributeFields(app, collection); err != nil {
		return err
	}
	addFieldIfMissing(collection, &core.NumberField{Name: "box_state"})
	addFieldIfMissing(collection, &core.TextField{Name: "updated_by"})
	addFieldIfMissing(collection, &core.JSONField{Name: "box_member_s"})
	addFieldIfMissing(collection, &core.JSONField{Name: "waitlist_list"})
	addFieldIfMissing(collection, &core.TextField{Name: "notes"})

	return nil
}

// ensureWorkFormulaCollection creates/updates the work_formula collection,
// tracking each member's required vs. completed work and open hours.
func ensureWorkFormulaCollection(app core.App) (*core.Collection, error) {
	// log.Println("ensureWorkFormulaCollection running")

	if existing, err := app.FindCollectionByNameOrId("work_formula"); err == nil {
		if err := configureWorkFormulaCollection(app, existing); err != nil {
			return nil, err
		}
		if err := app.Save(existing); err != nil {
			return nil, err
		}

		return existing, nil
	}

	collection := core.NewBaseCollection("work_formula")
	if err := configureWorkFormulaCollection(app, collection); err != nil {
		return nil, err
	}

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
	// authenticatedRule := "@request.auth.id != ''"

	collection.ListRule = types.Pointer(authenticatedRule)
	collection.ViewRule = types.Pointer(authenticatedRule)
	collection.CreateRule = types.Pointer(authenticatedRule)
	collection.UpdateRule = types.Pointer(authenticatedRule)
	collection.DeleteRule = types.Pointer(authenticatedRule)
	if err := addTimeAttributeFields(app, collection); err != nil {
		return err
	}
	addFieldIfMissing(collection, &core.TextField{Name: "member_id"})
	addFieldIfMissing(collection, &core.TextField{Name: "volunteer_activity"})
	addFieldIfMissing(collection, &core.NumberField{Name: "volunteer_date", OnlyInt: true})
	addFieldIfMissing(collection, &core.NumberField{Name: "volunteer_hours", OnlyInt: true})
	addFieldIfMissing(collection, &core.NumberField{Name: "work_hours_required", OnlyInt: true})
	addFieldIfMissing(collection, &core.NumberField{Name: "work_hours_completed", OnlyInt: true})
	addFieldIfMissing(collection, &core.NumberField{Name: "open_hours_required", OnlyInt: true})
	addFieldIfMissing(collection, &core.NumberField{Name: "open_hours_completed", OnlyInt: true})

	return nil
}

func addFieldIfMissing(collection *core.Collection, field core.Field) {
	if collection.Fields.GetByName(field.GetName()) == nil {
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

	// if collection.Fields.GetByName("modified_at") == nil {
	//  collection.Fields.Add(
	//      &core.NumberField{
	//          Name:    "modified_at",
	//          OnlyInt: true,
	//      },
	//  )
	// }

	// Push the field change to the database right away.
	return app.Save(collection)
}
