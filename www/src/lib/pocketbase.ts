import PocketBase from "pocketbase";

import { config } from "./config";

import {
  MemberType,
  DueState,
  MemberState,
  PaymentType,
  MemberRole,
} from "../models/enums";
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
    created_at: new Date(), ////add fresh date pull here
    modified_at: new Date(),
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

export async function correspondingWorkFormulas(allMembers: Array<Record<string, any>>) {
  pb.autoCancellation(false);

  //gets all of the member_ids of all of the members
  const memberIds = allMembers
    .map((m) => m.member_id)
    .filter(Boolean);

  //if there are no ids then every member has no work formula
  if (memberIds.length === 0) {
    return { items: allMembers.map(() => null) as Array<Record<string, any> | null> };
  }

  //Defines the filter for the work formulas in the list
  const filter = memberIds.map((id) => `member_id = "${id}"`).join(" || ");

  //looks for the work formulas belonging to the members defined in the filter variable
  const workFormulas = await pb.collection("work_formula").getFullList({ filter });
  const workFormulaByMemberId = new Map(
    workFormulas.map((formula) => [formula.member_id, formula]),
  );

  //corresponds each member (by position) to its work formula, or null if it has none
  return {
    items: allMembers.map(
      (member) => workFormulaByMemberId.get(member.member_id) ?? null,
    ),
  };
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

export async function updatePronouns(
  oldMemberInfo: MemberSnapshot | null,
  newRecord: string,
) {
  pb.autoCancellation(false);

  if (!oldMemberInfo) return;

  //find the member through the member_id on the member_snapshot table
  const currentMemberSnapshot = await pb
    .collection("member_snapshot")
    .getFirstListItem(`member_id = "${oldMemberInfo.memberId}"`);

  // keep created_at history, if not already set
  const createdAt = currentMemberSnapshot.created_at ?? new Date();

  const record = await pb
    .collection("member_snapshot")
    .update(`${currentMemberSnapshot.id}`, {
      personal_info: newRecord,
      created_at: createdAt,
      modified_at: new Date(),
    });

    console.log("new member snapshot record:",record)
}

export async function newFormUpdate(
  oldMemberInfo: MemberSnapshot | null,
  newPersonalData: string,
  newMemberData: string,
) {
  pb.autoCancellation(false);

  if (!oldMemberInfo?.id) {
    throw new Error("newFormUpdate: missing snapshot id, cannot update");
  }

  const snapshot = await pb
    .collection("member_snapshot")
    .update(oldMemberInfo.id, {
      updated_by: oldMemberInfo.fullName,
      notes: "Update needs approval by an admin.",
      personal_info: newPersonalData,
      member_info: newMemberData,
      box_info: oldMemberInfo.boxInfo,
    });

  console.log(snapshot);
}

export async function listApprovalUpdates() {
  // fetch a paginated records list
  const resultList = await pb.collection("member_snapshot").getList(1, 50, {
    filter: 'notes = "Update needs approval by an admin." ',
  });

  return resultList;
}

export async function typeCheckUser() {
  const signedInUser = pb.authStore.record;

  const userMemberSnapshot = await pb
    .collection("member_snapshot")
    .getList(1, 1, {
      filter: `personal_info.emailInfo.primaryEmail = "${signedInUser?.email}" || personal_info.emailInfo.secondaryEmail = "${signedInUser?.email}"`,
    });

  return userMemberSnapshot.items[0].member_info.memberType;
}

//gets the full list of boxes from the boxes collection
// .member_snapshot.member_id ?= box_members"

export async function listBoxes(userId?: string) {
  pb.autoCancellation(false);

  if (isAdmin()) {
    return await pb.collection("boxes").getList(1, 50);
  }

  const targetUserId = userId ?? currentUser()?.id;

  if (!targetUserId) {
    return { items: [], page: 1, perPage: 50, totalItems: 0, totalPages: 0 };
  }

  return await pb.collection("boxes").getList(1, 50, {
    filter: pb.filter("box_members.user_id ?= {:userId}", {
      userId: targetUserId,
    }),
  });
}

//gets the full list of work formulas from their collection
export async function listWorkFormulas(userId?: string) {
  pb.autoCancellation(false);

  if (isAdmin()) {
    return await pb.collection("work_formula").getList(1, 50, {
      expand: "member_id.user_id",
    });
  }

  const targetUserId = userId ?? currentUser()?.id;

  if (!targetUserId) {
    return { items: [], page: 1, perPage: 50, totalItems: 0, totalPages: 0 };
  }

  return await pb.collection("work_formula").getList(1, 50, {
    filter: pb.filter("member_id.user_id = {:userId}", {
      userId: targetUserId,
    }),
    expand: "member_id.user_id",
  });
}


export async function deleteRequest(currentSnapshot: Record<string, any>) {
  pb.autoCancellation(false);
  await pb.collection("member_snapshot").update(`${currentSnapshot.id}`, {
    notes: "Recently Denied",
  });
}

export async function acceptRequest(currentSnapshot: Record<string, any>) {
  pb.autoCancellation(false);
  //find the user with that id from the currentSnapshot's user_id
  const requestingUser = await pb
    .collection("users")
    .getFirstListItem(`id = "${currentSnapshot.user_id}"`);

  //use the id from requestingUser and find the member with that user_id
  const currentMember = await pb
    .collection("member")
    .getFirstListItem(`user_id = "${requestingUser.id}"`);

  //update the currentSnapshot id to the currentMember's member_snapshot_id
  await pb.collection("member").update(`${currentMember.id}`, {
    member_snapshot_id: `${currentSnapshot.id}`,
  });

  await pb.collection("member_snapshot").update(`${currentSnapshot.id}`, {
    notes: "Recently Updated",
  });
}

export async function getMemberWorkFormula(
  memberSnapshot: Record<string, any>,
) {
  pb.autoCancellation(false);
  return await pb
    .collection("work_formula")
    .getFirstListItem(`member_id = "${memberSnapshot.member_id}"`);
}

// gets the full list of legacy snapshots from the legacy_snapshots collection
export async function listLegacySnapshots() {
  pb.autoCancellation(false);
  return await pb.collection("legacy_snapshots").getList(1, 50);
}