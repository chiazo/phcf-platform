import PocketBase from "pocketbase";

import { config } from "./config";

import {MemberType, DueState, MemberState, PaymentType, MemberRole} from "../models/enums";
import MemberSnapshot from "../models/MemberSnapshot";


export const pb = new PocketBase(config.pbUrl);


export interface RegisterFarmMemberInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  pronouns?: string;
  orientationDate: string;
  phone?: string;
  addressLine1?: string;
  city?: string;
  zipCode?: string;
  onMailingList: boolean;
  volunteerInterests?: string[];
}

export function currentUser() {
  return pb.authStore.record;
}

export function isLoggedIn() {
  return pb.authStore.isValid;
}

export function isAdmin() {
  const record = currentUser();
  return (
    record?.collectionName === "_superusers" ||
    record?.is_admin === true ||
    record?.is_admin === "true"
  );
}

export async function login(email: string, password: string) {
  pb.autoCancellation(false);
  const response = await pb.send("/api/app/login", {
    method: "POST",
    body: { email, password },
  });

  pb.authStore.save(response.token, response.record);
  return response;
}

export async function requestPasswordReset(email: string) {
  pb.autoCancellation(false);
  return await pb.collection("users").requestPasswordReset(email);
}

export async function confirmPasswordReset(
  token: string,
  password: string,
  passwordConfirm: string,
) {
  pb.autoCancellation(false);
  return await pb
    .collection("users")
    .confirmPasswordReset(token, password, passwordConfirm);
}

export function logout() {
  pb.authStore.clear();
}

export interface AdminUser {
  id: string;
  email: string;
  name?: string;
  is_admin: boolean;
  is_superuser: boolean;
}

export async function listAdminUsers() {
  pb.autoCancellation(false);
  return await pb.send<{ items: AdminUser[] }>("/api/app/admin/users", {
    method: "GET",
  });
}

export async function promoteUserToAdmin(id: string) {
  pb.autoCancellation(false);
  return await pb.send<AdminUser>(`/api/app/admin/users/${id}/promote`, {
    method: "POST",
  });
}

export async function demoteUserFromAdmin(id: string) {
  pb.autoCancellation(false);
  return await pb.send<AdminUser>(`/api/app/admin/users/${id}/demote`, {
    method: "POST",
  });
}

export async function registerFarmMember(input: RegisterFarmMemberInput) {
  pb.autoCancellation(false);

  const name = `${input.firstName} ${input.lastName}`.trim();

  const user = await pb.collection("users").create({
    email: input.email,
    emailVisibility: true,
    password: input.password,
    passwordConfirm: input.password,
    name,
  });

  await login(input.email, input.password);

  const nowInSeconds = Math.floor(Date.now() / 1000);
  const orientationDateMs = new Date(
    `${input.orientationDate}T00:00:00`,
  ).getTime();

  if (Number.isNaN(orientationDateMs)) {
    throw new Error("Invalid orientation date");
  }

  const orientationDateInSeconds = Math.floor(orientationDateMs / 1000);
  const snapshot = await pb.collection("member_snapshot").create({
    user_id: user.id,
    member_id: user.id,
    updated_by: name || input.email,
    notes: "Created from member registration.",
    personal_info: {
      firstName: input.firstName,
      lastName: input.lastName,
      pronouns: input.pronouns ?? "",
      address: {
        line1: input.addressLine1 ?? "",
        city: input.city ?? "",
        zipCode: input.zipCode ?? "",
      },
      emailInfo: {
        primaryEmail: input.email,
        onMailingList: input.onMailingList,
      },
      phoneInfo: {
        primaryPhoneNumber: input.phone ?? "",
      },
    },
    member_info: {
      orientationDate: orientationDateInSeconds,
      memberState: "PENDING",
      role: "ROLE_INVALID",
      memberType: "GENERAL",
      dues: {
        amountPaid: 0,
        dueState: "UNPAID",
        paymentType: "",
        duesPaidAt: 0,
      },
      requirements: {
        meetingsCompleted: 0,
        meetingsRequired: 0,
        serviceHoursRequired: 0,
        serviceRequirements: [],
        volunteerInterests: input.volunteerInterests ?? [],
      },
    },
    box_info: {
      boxState: "UNASSIGNED",
      boxId: "",
      changeRequester: name || input.email,
      waitlistInfo: {
        joinedWaitlistAt: nowInSeconds,
        waitlistNumber: 0,
      },
    },
  });

  await pb.collection("member").create({
    user_id: user.id,
    member_snapshot_id: snapshot.id,
  });

  return { user, snapshot };
}

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
  return await pb
    .collection("member_snapshot")
    .getFirstListItem(`personal_info.firstName = "${name}"`);
}

export async function updatePronouns (oldMemberInfo :MemberSnapshot | null, newRecord: string){
   pb.autoCancellation(false);
  
  if (oldMemberInfo){
    //find the member through the member_id on the member_snapshot table
    const currentMemberSnapshot = await pb.collection("member_snapshot").getFirstListItem(
    `member_id = "${oldMemberInfo.memberId}"`
  );

    // update the info in the member table
    const record = await pb.collection('member_snapshot').update(`${currentMemberSnapshot.id}`, {
    personal_info : newRecord,
    }); 

  }
}

export async function newFormUpdate (oldMemberInfo: MemberSnapshot | null,  newPersonalData: string, newMemberData: string){
   pb.autoCancellation(false);

   const author = await pb.collection("users").getFirstListItem(
    `email = "${currentUser()?.email}"`
   )

  //find the member through the member_id on the member_snapshot table
  const currentMemberSnapshot = await pb.collection("member_snapshot").getFirstListItem(
  `member_id = "${oldMemberInfo?.memberId}"`)

  const snapshot = await pb.collection("member_snapshot").create({
    user_id: currentMemberSnapshot?.user_id,
    member_id: oldMemberInfo?.memberId,
    updated_by: author?.name,
    notes: "Update needs approval by an admin.",
    personal_info: newPersonalData,
    member_info: newMemberData,
    box_info: oldMemberInfo?.boxInfo,
  });
}

export async function listApprovalUpdates() {

  // fetch a paginated records list
  const resultList = await pb.collection('member_snapshot').getList(1, 50, {
      filter: 'notes = "Update needs approval by an admin." ',
  });

  return resultList
}

//gets the full list of boxes from the boxes collection
export async function listBoxes() {
  pb.autoCancellation(false);
  return await pb.collection("boxes").getList(1, 50);
}

// Adds the currently logged-in user's member_id to a box waitlist, choosing
// the box in this priority order:
//   1. any box with zero members (box_member_s is empty)
//   2. any box with an empty waitlist (waitlist_list is empty)
//   3. the box with the shortest waitlist
// The chosen box's notes are flagged for admin review and the change is
// persisted back to the boxes collection.
export async function addToBoxWaitlist(allBoxes: Record<string, any>[]) {
  pb.autoCancellation(false);

  const user = currentUser();
  if (!user) {
    throw new Error("No logged in user found.");
  }
  if (!allBoxes || allBoxes.length === 0) {
    throw new Error("No boxes available to join.");
  }

  console.log('user',user)

  if (user.collectionName == '_superusers'){
    console.log('user.email',user.email)
  }

  // member_id isn't guaranteed to equal the auth user's id, so resolve it
  // via that user's member_snapshot, same as acceptRequest/updatePronouns do.
  const memberSnapshotID = await pb
    .collection("member_snapshot")
    .getFirstListItem(`member_id = "${user.id}"`);

  // const memberId = memberSnapshot.member_id;
  console.log('memberSnapshotID',memberSnapshotID)
  if (!memberSnapshotID) {
    throw new Error("Current user has no associated member_id.");
  }

  // 1. Prefer a box with no members at all.
  let targetBox = allBoxes.find(
    (box) => countEntries(box.box_member_s) === 0,
  );

  // 2. Otherwise, prefer a box with an empty waitlist.
  if (!targetBox) {
    targetBox = allBoxes.find(
      (box) => countEntries(box.waitlist_list) === 0,
    );
  }

  // 3. Otherwise, fall back to the box with the shortest waitlist.
  if (!targetBox) {
    targetBox = allBoxes.reduce((shortest, box) =>
      countEntries(box.waitlist_list) < countEntries(shortest.waitlist_list)
        ? box
        : shortest,
    );
  }

  const updatedWaitlist = [...(targetBox.waitlist_list ?? []), memberSnapshotID.member_id];
  console.log('updatedWaitlist',updatedWaitlist)
  console.log('targetBox.id',targetBox.id) //<- this is correct but isnt adding onto the found box
  // Persist the change to PocketBase.
  return await pb.collection("boxes").update(`${targetBox.id}`, {
    waitlist_list: updatedWaitlist,
    notes: "Update needs approval by an admin.",
  });
}

function countEntries(list: unknown[] | undefined | null): number {
  return list?.length ?? 0;
}

//gets the full list of work formulas from their collection
export async function listWorkFormulas() {
  pb.autoCancellation(false);
  return await pb.collection("work_formula").getList(1, 50);
}

export async function deleteRequest(currentSnapshot: Record<string, any>){
  pb.autoCancellation(false);
  await pb.collection("member_snapshot").update(`${currentSnapshot.id}`, {
    notes: "Recently Denied"
  })
}

export async function acceptRequest(currentSnapshot: Record<string, any>){
  pb.autoCancellation(false);
  //find the user with that id from the currentSnapshot's user_id
  const currentUser = await pb.collection("users").getFirstListItem(
    `id = "${currentSnapshot.user_id}"`
  )

  //use the id from currentUser and find the member with that user_id
  const currentMember = await pb.collection("member").getFirstListItem(
    `user_id = "${currentUser.id}"`
  )

  //update the currentSnapshot id to the currentMember's member_snapshot_id
  await pb.collection("member").update(`${currentMember.id}`, {
    member_snapshot_id: `${currentSnapshot.id}`
  })

  await pb.collection("member_snapshot").update(`${currentSnapshot.id}`, {
    notes: "Recently Updated"
  })
}

export async function getMemberWorkFormula(memberSnapshot: Record <string, any>){
  pb.autoCancellation(false);
  return await pb
    .collection("work_formula")
    .getFirstListItem(`member_id = "${memberSnapshot.member_id}"`);
}

// gets the full list of legacy snapshots from the legacy_snapshots collection
export async function listLegacySnapshots() {
  pb.autoCancellation(false);
  return await pb.collection("legacy_snapshot").getList(1, 50);
}
