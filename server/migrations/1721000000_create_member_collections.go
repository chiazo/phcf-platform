package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		// -----------------------------------------------------------------
		// member_snapshot
		// Mirrors the old Mongoose MemberSnapshotSchema (api/schemas/userSchemaModel.js),
		// flattened into JSON sub-objects since SQLite/PocketBase doesn't have
		// native nested documents the way Mongo does.
		// -----------------------------------------------------------------
		snapshot := core.NewBaseCollection("member_snapshot")

		// dev-friendly rules — tighten these before deploying anywhere real
		snapshot.ListRule = nil
		snapshot.ViewRule = nil
		snapshot.CreateRule = nil
		snapshot.UpdateRule = nil
		snapshot.DeleteRule = nil

		snapshot.Fields.Add(
			&core.TextField{
				Name: "updated_by",
				Max:  255,
			},
			&core.TextField{
				Name: "notes",
				Max:  5000,
			},
			// personal_info: { first_name, last_name, pronouns, address, email_info, phone_info }
			&core.JSONField{
				Name:    "personal_info",
				MaxSize: 65535,
			},
			// member_info: { member_state, role, member_type, orientation_date, dues, requirements }
			&core.JSONField{
				Name:    "member_info",
				MaxSize: 65535,
			},
			// box_info: { box_state, box_id, change_requester, waitlist_info }
			&core.JSONField{
				Name:    "box_info",
				MaxSize: 65535,
			},
			// time_attr: { created_at, modified_at }
			&core.JSONField{
				Name:    "time_attr",
				MaxSize: 65535,
			},
		)

		if err := app.Save(snapshot); err != nil {
			return err
		}

		// -----------------------------------------------------------------
		// member
		// Frontend (www/src/lib/pocketbase.ts) reads member_snapshot_id off
		// each record to look up the matching member_snapshot record.
		// -----------------------------------------------------------------
		member := core.NewBaseCollection("member")

		member.ListRule = nil
		member.ViewRule = nil
		member.CreateRule = nil
		member.UpdateRule = nil
		member.DeleteRule = nil

		member.Fields.Add(
			&core.RelationField{
				Name:          "member_snapshot_id",
				CollectionId:  snapshot.Id,
				MaxSelect:     1,
				CascadeDelete: false,
			},
		)

		if err := app.Save(member); err != nil {
			return err
		}

		return nil
	}, func(app core.App) error {
		// down: remove both collections (member first, since it relates to member_snapshot)
		if member, err := app.FindCollectionByNameOrId("member"); err == nil {
			if err := app.Delete(member); err != nil {
				return err
			}
		}

		if snapshot, err := app.FindCollectionByNameOrId("member_snapshot"); err == nil {
			if err := app.Delete(snapshot); err != nil {
				return err
			}
		}

		return nil
	})
}
