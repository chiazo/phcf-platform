package main

import (
	"log"
	"os"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"github.com/pocketbase/pocketbase/tools/osutils"
	"github.com/pocketbase/pocketbase/tools/types"

	// registers this app's migrations (side-effect import — required for
	// the migration files' init() functions to run)
	_ "app/migrations"
)

func main() {
	app := pocketbase.New()

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		// auto-generate a migration file whenever a collection is changed
		// via the Dashboard/API — only while running with `go run`
		Automigrate: osutils.IsProbablyGoRun(),
	})

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

	return ensureMemberCollection(app, snapshotCollection.Id)
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
		return existing, nil
	}

	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return nil, err
	}

	authenticatedRule := "@request.auth.id != ''"
	ownerRule := "user_id = @request.auth.id"

	collection := core.NewBaseCollection("member_snapshot")
	collection.ListRule = types.Pointer(authenticatedRule)
	collection.ViewRule = types.Pointer(authenticatedRule)
	collection.CreateRule = types.Pointer(ownerRule)
	collection.UpdateRule = types.Pointer(ownerRule)
	collection.DeleteRule = types.Pointer(ownerRule)

	collection.Fields.Add(
		&core.RelationField{
			Name:         "user_id",
			CollectionId: users.Id,
			Required:     true,
		},
		&core.TextField{Name: "member_id"},
		&core.TextField{Name: "updated_by"},
		&core.TextField{Name: "notes"},
		&core.JSONField{Name: "personal_info", Required: true},
		&core.JSONField{Name: "member_info", Required: true},
		&core.JSONField{Name: "box_info", Required: true},
	)

	if err := app.Save(collection); err != nil {
		return nil, err
	}

	return collection, nil
}

func ensureMemberCollection(app core.App, snapshotCollectionId string) error {
	if _, err := app.FindCollectionByNameOrId("member"); err == nil {
		return nil
	}

	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return err
	}

	authenticatedRule := "@request.auth.id != ''"
	ownerRule := "user_id = @request.auth.id"

	collection := core.NewBaseCollection("member")
	collection.ListRule = types.Pointer(authenticatedRule)
	collection.ViewRule = types.Pointer(authenticatedRule)
	collection.CreateRule = types.Pointer(ownerRule)
	collection.UpdateRule = types.Pointer(ownerRule)
	collection.DeleteRule = types.Pointer(ownerRule)

	collection.Fields.Add(
		&core.RelationField{
			Name:         "user_id",
			CollectionId: users.Id,
			Required:     true,
		},
		&core.RelationField{
			Name:         "member_snapshot_id",
			CollectionId: snapshotCollectionId,
			Required:     true,
		},
	)

	return app.Save(collection)
}
