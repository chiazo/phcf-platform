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
	ownerRule := "user_id = @request.auth.id"

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
// No access rules were ever configured on this collection (dashboard
// defaults to superuser-only), so none are set here either.
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
	authenticatedRule := `
		@request.auth.id != ''
	`

	collection.ListRule = types.Pointer(authenticatedRule)
	collection.ViewRule = types.Pointer(authenticatedRule)
	collection.CreateRule = types.Pointer(authenticatedRule)
	collection.UpdateRule = types.Pointer(authenticatedRule)
	collection.DeleteRule = types.Pointer(authenticatedRule)

	log.Println("work_formula rules updated")
	addTimeAttributeFields(collection)
	addFieldIfMissing(collection, &core.NumberField{Name: "box_state"})
	addFieldIfMissing(collection, &core.TextField{Name: "updated_by"})
	addFieldIfMissing(collection, &core.JSONField{Name: "box_member_s"})
	addFieldIfMissing(collection, &core.JSONField{Name: "waitlist_list"})
	addFieldIfMissing(collection, &core.TextField{Name: "notes"})
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
	authenticatedRule := "@request.auth.id != ''"

	collection.ListRule = types.Pointer(authenticatedRule)
	collection.ViewRule = types.Pointer(authenticatedRule)
	collection.CreateRule = types.Pointer(authenticatedRule)
	collection.UpdateRule = types.Pointer(authenticatedRule)
	collection.DeleteRule = types.Pointer(authenticatedRule)
	addTimeAttributeFields(collection)
	addFieldIfMissing(collection, &core.TextField{Name: "member_id"})
	addFieldIfMissing(collection, &core.NumberField{Name: "work_hours_required", OnlyInt: true})
	addFieldIfMissing(collection, &core.NumberField{Name: "work_hours_completed", OnlyInt: true})
	addFieldIfMissing(collection, &core.NumberField{Name: "open_hours_required", OnlyInt: true})
	addFieldIfMissing(collection, &core.NumberField{Name: "open_hours_completed", OnlyInt: true})
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
