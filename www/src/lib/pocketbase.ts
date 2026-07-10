import PocketBase from "pocketbase";

import { config } from "./config";

export const pb = new PocketBase(config.pbUrl);

export async function listMemberSnapshots() {
  pb.autoCancellation(false);
  //gets the full list of all of the records in the memver collection
  const member_records = await pb.collection("member").getFullList();

  //gets all of the snapshotIds of all of the members
  const snapshotIds = member_records
    .map((r) => r.member_snapshot_id)
    .filter(Boolean);

  //if there are no ids then return any empty list
  if (snapshotIds.length === 0) {
    return { items: [] as Array<Record<string, any>> };
  }

  //Defines the filter for the members in the list 
  const filter = snapshotIds.map((id) => `id = "${id}"`).join(" || ");

  //looks for any members with ids defined in the filter variable 
  //gives back at least 1 member and at most 50 members
  return await pb.collection("member_snapshot").getList(1, 50, { filter });
}

//gets the member of the given id
export async function getMemberSnapshot(id: string) {
  pb.autoCancellation(false);
  const res = await pb.collection("member_snapshot").getList(1, 1, {
    filter: `id = "${id}"`,
  });

  return res.items?.[0] ?? null;
}

export async function getSingleMember(name: string) {
  pb.autoCancellation(false);
  return await pb.collection("member_snapshot").getFirstListItem(
    `personal_info.firstName = "${name}"`
  );
}

