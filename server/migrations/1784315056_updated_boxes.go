package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_112659458")
		if err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(1, []byte(`{
			"help": "",
			"hidden": false,
			"id": "number3669560851",
			"max": null,
			"min": null,
			"name": "box_state",
			"onlyInt": false,
			"presentable": false,
			"required": false,
			"system": false,
			"type": "number"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(2, []byte(`{
			"autogeneratePattern": "",
			"help": "",
			"hidden": false,
			"id": "text385774305",
			"max": 0,
			"min": 0,
			"name": "updated_by",
			"pattern": "",
			"presentable": false,
			"primaryKey": false,
			"required": false,
			"system": false,
			"type": "text"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(3, []byte(`{
			"help": "",
			"hidden": false,
			"id": "json1589586270",
			"maxSize": 0,
			"name": "box_member_s",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "json"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(4, []byte(`{
			"help": "",
			"hidden": false,
			"id": "json1211146809",
			"maxSize": 0,
			"name": "waitlist_list",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "json"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(5, []byte(`{
			"autogeneratePattern": "",
			"help": "",
			"hidden": false,
			"id": "text18589324",
			"max": 0,
			"min": 0,
			"name": "notes",
			"pattern": "",
			"presentable": false,
			"primaryKey": false,
			"required": false,
			"system": false,
			"type": "text"
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_112659458")
		if err != nil {
			return err
		}

		// remove field
		collection.Fields.RemoveById("number3669560851")

		// remove field
		collection.Fields.RemoveById("text385774305")

		// remove field
		collection.Fields.RemoveById("json1589586270")

		// remove field
		collection.Fields.RemoveById("json1211146809")

		// remove field
		collection.Fields.RemoveById("text18589324")

		return app.Save(collection)
	})
}
