package main

import (
	"log"
	"os"

	"github.com/pocketbase/pocketbase"
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

	_, err = ensureWorkFormulaCollection(app)
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

	return app.Save(users)
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
	ownerRule := "user_id = @request.auth.id"

	collection.ListRule = types.Pointer(authenticatedRule)
	collection.ViewRule = types.Pointer(authenticatedRule)
	collection.CreateRule = types.Pointer(ownerRule)
	collection.UpdateRule = types.Pointer(ownerRule)
	collection.DeleteRule = types.Pointer(ownerRule)
	collection.Fields.Add(
		&core.RelationField{
			Name:         "user_id",
			CollectionId: usersCollectionId,
			Required:     true,
		},
		&core.TextField{Name: "member_id"},
		&core.TextField{Name: "updated_by"},
		&core.TextField{Name: "notes"},
		&core.JSONField{Name: "personal_info", Required: true},
		&core.JSONField{Name: "member_info", Required: true},
		&core.JSONField{Name: "box_info", Required: true},
	)
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
	ownerRule := "user_id = @request.auth.id"

	collection.ListRule = types.Pointer(authenticatedRule)
	collection.ViewRule = types.Pointer(authenticatedRule)
	collection.CreateRule = types.Pointer(ownerRule)
	collection.UpdateRule = types.Pointer(ownerRule)
	collection.DeleteRule = types.Pointer(ownerRule)

	collection.Fields.Add(
		&core.RelationField{
			Name:         "user_id",
			CollectionId: usersCollectionId,
			Required:     true,
		},
		&core.RelationField{
			Name:         "member_snapshot_id",
			CollectionId: snapshotCollectionId,
			Required:     true,
		},
	)
}

// ensureBoxesCollection ports the schema originally captured by the
// auto-generated 1784314870_created_boxes.go / 1784315056_updated_boxes.go
// migrations into the same idempotent find-or-create pattern used above.
func ensureBoxesCollection(app core.App) (*core.Collection, error) {
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
		"@collection.member_snapshot.member_id ?= box_member_s"

	collection.ListRule = types.Pointer(memberOfBoxRule)
	collection.ViewRule = types.Pointer(memberOfBoxRule)
	// create/update/delete stay unset (nil = superuser-only): editing box
	// assignments is an administrative action, not self-service.

	collection.Fields.Add(
		&core.NumberField{Name: "box_state"},
		&core.TextField{Name: "updated_by"},
		&core.JSONField{Name: "box_member_s"},
		&core.JSONField{Name: "waitlist_list"},
		&core.TextField{Name: "notes"},
	)
}

// ensureWorkFormulaCollection creates/updates the work_formula collection,
// tracking each member's required vs. completed work and open hours.
func ensureWorkFormulaCollection(app core.App) (*core.Collection, error) {
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
	collection.Fields.Add(
		&core.TextField{Name: "member_id"},
		&core.NumberField{Name: "work_hours_required", OnlyInt: true},
		&core.NumberField{Name: "work_hours_completed", OnlyInt: true},
		&core.NumberField{Name: "open_hours_required", OnlyInt: true},
		&core.NumberField{Name: "open_hours_completed", OnlyInt: true},
	)
}
