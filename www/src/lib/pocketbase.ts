import PocketBase from "pocketbase";

import { config } from "./config";

import { DueState, MemberType } from "../models/enums";
import MemberSnapshot from "../models/MemberSnapshot";

export const pb = new PocketBase(config.pbUrl);

export interface WorkFormulaCriteria {
  memberType?: MemberType | "";
  boardStatus?: "board" | "non_board" | "";
  boxSharing?: "shared" | "individual" | "unassigned" | "";
  memberId?: string;
}

export interface ServiceHourRate {
  id: string;
  category: string;
  percentage: number;
}

export interface WorkFormulaPreviewResult {
  matchedCount: number;
  memberIds: string[];
}

export interface WorkFormulaBulkUpdateResult {
  updatedCount: number;
  memberIds: string[];
}

export async function exportMembersCSV() {
  pb.autoCancellation(false);

  const response = await fetch(`${config.pbUrl}/api/app/admin/export/members`, {
    headers: {
      Authorization: pb.authStore.token,
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return await response.blob();
}

export async function previewWorkFormulaBulkUpdate(
  criteria: WorkFormulaCriteria,
) {
  pb.autoCancellation(false);
  return await pb.send<WorkFormulaPreviewResult>(
    "/api/app/admin/work-formula/bulk-update",
    {
      method: "POST",
      body: { criteria, preview: true },
    },
  );
}

export async function listServiceHourRates() {
  pb.autoCancellation(false);
  return await pb
    .collection("service_hour_rates")
    .getFullList<ServiceHourRate>({
      sort: "category",
    });
}

export async function updateServiceHourRate(id: string, percentage: number) {
  pb.autoCancellation(false);
  return await pb.collection("service_hour_rates").update(id, { percentage });
}

export async function applyWorkFormulaBulkUpdate(
  criteria: WorkFormulaCriteria,
  workHoursRequired: number,
  openHoursRequired: number,
) {
  pb.autoCancellation(false);
  return await pb.send<WorkFormulaBulkUpdateResult>(
    "/api/app/admin/work-formula/bulk-update",
    {
      method: "POST",
      body: {
        criteria,
        workHoursRequired,
        openHoursRequired,
        preview: false,
      },
    },
  );
}

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

export const RequirementUpdateRequestType = {
  AMOUNT_PAID: "AMOUNT_PAID",
  MEETING_HOURS: "MEETING_HOURS",
  SERVICE_HOURS: "SERVICE_HOURS",
  PROFILE_UPDATE: "PROFILE_UPDATE",
} as const;

export type RequirementUpdateRequestType =
  (typeof RequirementUpdateRequestType)[keyof typeof RequirementUpdateRequestType];

export interface RequirementUpdateRequestInput {
  userId: string;
  memberId: string;
  memberSnapshotId: string;
  requestType: RequirementUpdateRequestType;
  quantity: number;
  paymentType?: string;
  occurredAt: number;
  activity?: string;
  projectLeader?: string;
  notes?: string;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function escapePocketBaseString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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
  const now = new Date().toISOString();
  const member = await pb.collection("member").create({
    user_id: user.id,
    member_snapshot_id: snapshot.id,
    created_at: now,
    modified_at: now,
  });

  const updatedSnapshot = await pb
    .collection("member_snapshot")
    .update(snapshot.id, {
      member_id: member.id,
    });

  return { user, snapshot: updatedSnapshot };
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

export async function correspondingWorkFormulas(
  allMembers: Array<Record<string, any>>,
) {
  pb.autoCancellation(false);

  //gets all of the member_ids of all of the members
  const memberIds = allMembers.map((m) => m.member_id).filter(Boolean);

  //if there are no ids then every member has no work formula
  if (memberIds.length === 0) {
    return {
      items: allMembers.map(() => null) as Array<Record<string, any> | null>,
    };
  }

  //Defines the filter for the work formulas in the list
  const filter = memberIds.map((id) => `member_id = "${id}"`).join(" || ");

  //looks for the work formulas belonging to the members defined in the filter variable
  const workFormulas = await pb
    .collection("work_formula")
    .getFullList({ filter });
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

export async function getCurrentUserMemberSnapshot() {
  pb.autoCancellation(false);

  const appUser = await getCurrentAppUserRecord();
  if (!appUser) {
    return null;
  }

  return await getMemberSnapshotForUserId(appUser.id);
}

export async function getOrCreateCurrentUserMemberSnapshot() {
  pb.autoCancellation(false);

  const existingSnapshot = await getCurrentUserMemberSnapshot();
  if (existingSnapshot) {
    return existingSnapshot;
  }

  const appUser = await getCurrentAppUserRecord();
  if (!appUser) {
    throw new Error("No app user account found for this admin.");
  }

  const nowInSeconds = Math.floor(Date.now() / 1000);
  const nameParts = String(appUser.name || "")
    .trim()
    .split(/\s+/);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ");
  const now = new Date().toISOString();
  const snapshot = await pb.collection("member_snapshot").create({
    user_id: appUser.id,
    updated_by: currentUser()?.name || currentUser()?.email || "Admin",
    notes: "Created for admin self-service snapshot editing.",
    created_at: now,
    modified_at: now,
    personal_info: {
      firstName,
      lastName,
      pronouns: "",
      address: {
        line1: "",
        city: "",
        zipCode: "",
      },
      emailInfo: {
        primaryEmail: appUser.email || currentUser()?.email || "",
        onMailingList: false,
      },
      phoneInfo: {
        primaryPhoneNumber: "",
      },
    },
    member_info: {
      orientationDate: nowInSeconds,
      memberState: "ACTIVE",
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
        volunteerInterests: [],
      },
    },
    box_info: {
      boxState: "UNASSIGNED",
      boxId: "",
      changeRequester: appUser.name || appUser.email || "",
      waitlistInfo: {
        joinedWaitlistAt: nowInSeconds,
        waitlistNumber: 0,
      },
    },
  });

  const member = await pb.collection("member").create({
    user_id: appUser.id,
    member_snapshot_id: snapshot.id,
    created_at: now,
    modified_at: now,
  });

  try {
    return await pb.collection("member_snapshot").update(snapshot.id, {
      member_id: member.id,
    });
  } catch (err: any) {
    if (err?.status !== 400) {
      throw err;
    }

    return snapshot;
  }
}

async function getCurrentAppUserRecord() {
  const user = currentUser();
  if (!user) {
    return null;
  }

  if (user.collectionName === "users") {
    return user;
  }

  if (!user.email) {
    return null;
  }

  return await pb
    .collection("users")
    .getFirstListItem(`email = "${escapePocketBaseString(user.email)}"`);
}

async function getMemberSnapshotForUserId(userId: string) {
  try {
    const member = await pb
      .collection("member")
      .getFirstListItem(`user_id = "${escapePocketBaseString(userId)}"`);
    return await pb
      .collection("member_snapshot")
      .getOne(member.member_snapshot_id);
  } catch (err: any) {
    if (err?.status === 404) {
      return null;
    }

    throw err;
  }
}

export async function getSingleMember(name: string) {
  pb.autoCancellation(false);
  return await pb
    .collection("member_snapshot")
    .getFirstListItem(`personal_info.firstName = "${name}"`);
}

export interface VolunteerInterest {
  id: string;
  label: string;
  emoji: string;
  sort_order: number;
  active: boolean;
}

export async function listVolunteerInterests() {
  pb.autoCancellation(false);
  return await pb
    .collection("volunteer_interests")
    .getFullList<VolunteerInterest>({
      filter: "active = true",
      sort: "sort_order",
    });
}

export async function updatePronouns(
  oldMemberInfo: MemberSnapshot | null,
  newRecord: string,
) {
  pb.autoCancellation(false);

  if (oldMemberInfo) {
    //find the member through the member_id on the member_snapshot table
    const currentMemberSnapshot = await pb
      .collection("member_snapshot")
      .getFirstListItem(`member_id = "${oldMemberInfo.memberId}"`);

    // update the info in the member table
    const record = await pb
      .collection("member_snapshot")
      .update(`${currentMemberSnapshot.id}`, {
        personal_info: newRecord,
      });
  }
}

export async function newFormUpdate(
  oldMemberInfo: MemberSnapshot | null,
  newPersonalData: string,
  newMemberData: string,
  timestamp: number,
) {
  pb.autoCancellation(false);

  const author = await pb
    .collection("users")
    .getFirstListItem(`email = "${currentUser()?.email}"`);

  //find the member through the member_id on the member_snapshot table
  const currentMemberSnapshot = await pb
    .collection("member_snapshot")
    .getFirstListItem(`member_id = "${oldMemberInfo?.memberId}"`);

  const now = new Date().toISOString();
  const snapshot = await pb.collection("member_snapshot").create({
    user_id: currentMemberSnapshot?.user_id,
    member_id: oldMemberInfo?.memberId,
    updated_by: author?.name,
    notes: "Update needs approval by an admin.",
    personal_info: newPersonalData,
    member_info: newMemberData,
    box_info: oldMemberInfo?.boxInfo,
    created_at: now,
    modified_at: now,
  });

  const newRequestUpdateRecord = await pb
    .collection("requirement_update_request")
    .create({
      user_id: snapshot.user_id,
      member_id: snapshot.member_id,
      member_snapshot_id: snapshot.id,
      request_type: RequirementUpdateRequestType.PROFILE_UPDATE,
      quantity: 0,
      payment_type: "",
      occurred_at: timestamp,
      notes: "",
      status: "PENDING",
      reviewed_by: "",
      reviewed_at: 0,
      admin_notes: "",
      created_at: now,
      modified_at: now,
    });
}

export async function updateMemberSnapshotDirect(
  oldMemberInfo: MemberSnapshot | null,
  newPersonalData: Record<string, any>,
  newMemberData: Record<string, any>,
) {
  pb.autoCancellation(false);

  if (!oldMemberInfo?.id) {
    throw new Error("No member snapshot selected.");
  }

  return await pb.collection("member_snapshot").update(oldMemberInfo.id, {
    updated_by: currentUser()?.name || currentUser()?.email || "Admin",
    notes: "Updated directly by an admin.",
    personal_info: newPersonalData,
    member_info: newMemberData,
  });
}

export async function listApprovalUpdates() {
  // fetch a paginated records list
  const resultList = await pb.collection("member_snapshot").getList(1, 50, {
    filter: 'notes = "Update needs approval by an admin." ',
  });

  return resultList;
}

export async function submitRequirementUpdateRequest(
  input: RequirementUpdateRequestInput,
) {
  pb.autoCancellation(false);
  const now = new Date().toISOString();

  return await pb.collection("requirement_update_request").create({
    user_id: input.userId,
    member_id: input.memberId,
    member_snapshot_id: input.memberSnapshotId,
    request_type: input.requestType,
    quantity: input.quantity,
    payment_type: input.paymentType ?? "",
    occurred_at: input.occurredAt,

    activity: input.activity ?? "",
    project_leader: input.projectLeader ?? "",

    notes: input.notes ?? "",
    status: "PENDING",
    reviewed_by: "",
    reviewed_at: 0,
    admin_notes: "",
    created_at: now,
    modified_at: now,
  });
}

export async function listPendingRequirementUpdateRequests() {
  pb.autoCancellation(false);

  return await pb.collection("requirement_update_request").getList(1, 50, {
    filter: 'status = "PENDING"',
    sort: "-created_at",
    expand: "user_id",
  });
}

export async function listMyRequirementUpdateRequests() {
  pb.autoCancellation(false);

  return await pb.collection("requirement_update_request").getList(1, 50, {
    sort: "-created_at",
  });
}

export async function denyRequirementUpdateRequest(
  request: Record<string, any>,
  adminNotes = "",
) {
  pb.autoCancellation(false);

  return await pb.collection("requirement_update_request").update(request.id, {
    status: "DENIED",
    reviewed_by: currentUser()?.name || currentUser()?.email || "",
    reviewed_at: new Date().toISOString(),
    modified_at: new Date().toISOString(),
    admin_notes: adminNotes,
  });
}

export async function approveRequirementUpdateRequest(
  request: Record<string, any>,
) {
  pb.autoCancellation(false);

  const quantity = toNumber(request.quantity);
  if (quantity <= 0) {
    throw new Error("Request quantity must be greater than zero.");
  }

  const currentMember = await pb
    .collection("member")
    .getFirstListItem(`user_id = "${request.user_id}"`);
  const currentSnapshot = await pb
    .collection("member_snapshot")
    .getOne(currentMember.member_snapshot_id);
  const memberInfo = cloneJson(currentSnapshot.member_info ?? {});
  const dues = cloneJson(memberInfo.dues ?? {});
  const requirements = cloneJson(memberInfo.requirements ?? {});

  memberInfo.dues = dues;
  memberInfo.requirements = requirements;

  if (request.request_type === RequirementUpdateRequestType.AMOUNT_PAID) {
    dues.amountPaid = toNumber(dues.amountPaid) + quantity;
    if (request.payment_type) {
      dues.paymentType = request.payment_type;
    }
    if (request.occurred_at) {
      dues.duesPaidAt = request.occurred_at;
    }
    dues.dueState = DueState.COMPLETE;
  }

  if (request.request_type === RequirementUpdateRequestType.MEETING_HOURS) {
    requirements.meetingsCompleted =
      toNumber(requirements.meetingsCompleted) + quantity;
  }

  if (request.request_type === RequirementUpdateRequestType.SERVICE_HOURS) {
    const serviceRequirements = Array.isArray(requirements.serviceRequirements)
      ? [...requirements.serviceRequirements]
      : [];

    serviceRequirements.push({
      workFormulaId: "Submitted Service Hours",
      hoursCompleted: quantity,
      completedAt: request.occurred_at,
      notes: request.notes ?? "",
    });

    requirements.serviceRequirements = serviceRequirements;

    await updateWorkFormulaHours(request.member_id, quantity);
  }

  const reviewer = currentUser()?.name || currentUser()?.email || "";
  const newSnapshot = await createApprovedRequirementSnapshot({
    currentMember,
    currentSnapshot,
    memberInfo,
    reviewer,
    request,
  });

  await pb.collection("member").update(currentMember.id, {
    member_snapshot_id: newSnapshot.id,
  });

  return await pb.collection("requirement_update_request").update(request.id, {
    status: "APPROVED",
    reviewed_by: reviewer,
    reviewed_at: new Date().toISOString(),
    modified_at: new Date().toISOString(),
  });
}

async function createApprovedRequirementSnapshot({
  currentMember,
  currentSnapshot,
  memberInfo,
  reviewer,
  request,
}: {
  currentMember: Record<string, any>;
  currentSnapshot: Record<string, any>;
  memberInfo: Record<string, any>;
  reviewer: string;
  request: Record<string, any>;
}) {
  const candidateMemberIds = [
    currentSnapshot.member_id,
    currentMember.id,
  ].filter(Boolean);
  const uniqueMemberIds = Array.from(new Set(candidateMemberIds));
  let lastError: unknown;

  for (const memberId of uniqueMemberIds) {
    try {
      const now = new Date().toISOString();

      return await pb.collection("member_snapshot").create({
        user_id: currentSnapshot.user_id,
        member_id: memberId,
        updated_by: reviewer,
        notes: `Approved ${formatRequirementRequestType(request.request_type)} request.`,
        personal_info: currentSnapshot.personal_info,
        member_info: memberInfo,
        box_info: currentSnapshot.box_info,
        created_at: now,
        modified_at: now,
      });
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError ?? new Error("Could not create approved member snapshot.");
}

async function updateWorkFormulaHours(memberId: string, hoursToAdd: number) {
  try {
    const workFormula = await pb
      .collection("work_formula")
      .getFirstListItem(`member_id = "${memberId}"`);

    await pb.collection("work_formula").update(workFormula.id, {
      work_hours_completed:
        toNumber(workFormula.work_hours_completed) + hoursToAdd,
      modified_at: new Date().toISOString(),
    });
  } catch (err: any) {
    if (err?.status === 404) {
      return;
    }

    throw err;
  }
}

function formatRequirementRequestType(type: string) {
  return type.toLowerCase().replace(/_/g, " ");
}

//gets the full list of boxes from the boxes collection
type WaitlistName = {
  member_id: string;
  position: number;
  name: string;
};

type BoxWithNames = Record<string, any> & {
  box_members_names: string[];
  waitlist_names: WaitlistName[];
};

export async function listBoxes(): Promise<{ items: BoxWithNames[] }> {
  pb.autoCancellation(false);

  const res = await pb.collection("boxes").getList(1, 50, {
    expand: "box_members.user_id",
  });

  // waitlist is JSON containing:
  // {
  //   member_id: string,
  //   join_date: number,
  //   position: number
  // }
  const allWaitlistIds = Array.from(
    new Set(
      res.items.flatMap((box) =>
        Array.isArray(box.waitlist)
          ? box.waitlist.map((entry: any) => entry.member_id)
          : [],
      ),
    ),
  );

  const waitlistMembersById: Record<string, any> = {};

  if (allWaitlistIds.length > 0) {
    const filter = allWaitlistIds.map((id) => `id = "${id}"`).join(" || ");

    const waitlistMembers = await pb.collection("member").getFullList({
      filter,
      expand: "user_id",
    });

    for (const member of waitlistMembers) {
      waitlistMembersById[member.id] = member;
    }
  }

  const items: BoxWithNames[] = res.items.map((box) => {
    const expandedMembers = (box.expand?.box_members ?? []) as Array<
      Record<string, any>
    >;

    const box_members_names = expandedMembers.map(
      (member) => member.expand?.user_id?.name ?? "(unknown member)",
    );

    const waitlist_names = (
      Array.isArray(box.waitlist) ? box.waitlist : []
    ).map((entry: any) => ({
      member_id: entry.member_id,
      position: entry.position,
      name:
        waitlistMembersById[entry.member_id]?.expand?.user_id?.name ?? " — ",
    }));

    return {
      ...box,
      box_members_names,
      waitlist_names,
    };
  });

  return { ...res, items };
}

export async function removeMemberFromWaitlist(memberId: string) {
  pb.autoCancellation(false);

  if (!memberId) {
    throw new Error("Member ID is required.");
  }

  const boxes = await pb.collection("boxes").getFullList({
    filter: `waitlist ~ "${memberId}"`,
  });

  if (boxes.length === 0) {
    throw new Error("Member is not on a box waitlist.");
  }

  const box = boxes[0];

  const waitlist = Array.isArray(box.waitlist) ? box.waitlist : [];

  const updatedWaitlist = waitlist.filter((entry: any) => {
    // Current waitlist format:
    // { member_id, position, join_date }
    if (typeof entry === "string") {
      return entry !== memberId;
    }

    return entry?.member_id !== memberId;
  });

  // Re-number remaining entries so positions stay contiguous.
  const renumberedWaitlist = updatedWaitlist.map(
    (entry: any, index: number) => {
      if (typeof entry === "string") {
        return entry;
      }

      return {
        ...entry,
        position: index + 1,
      };
    },
  );

  return await pb.collection("boxes").update(box.id, {
    waitlist: renumberedWaitlist,
    notes: "Member removed from box waitlist.",
  });
}

export async function removeMemberFromBox(memberId: string) {
  pb.autoCancellation(false);

  const boxes = await pb.collection("boxes").getFullList();

  const box = boxes.find((box) => {
    const members = Array.isArray(box.box_members) ? box.box_members : [];

    const waitlist = Array.isArray(box.waitlist) ? box.waitlist : [];

    return (
      members.includes(memberId) ||
      waitlist.some((entry: any) => entry.member_id === memberId)
    );
  });

  if (!box) {
    throw new Error("Member is not assigned to or waiting for a box.");
  }

  const members = Array.isArray(box.box_members) ? box.box_members : [];

  const waitlist = Array.isArray(box.waitlist) ? box.waitlist : [];

  const updatedMembers = members.filter((id: string) => id !== memberId);

  const updatedWaitlist = waitlist
    .filter((entry: any) => entry.member_id !== memberId)
    .map((entry: any, index: number) => ({
      ...entry,
      position: index + 1,
    }));

  return await pb.collection("boxes").update(box.id, {
    box_members: updatedMembers,
    waitlist: updatedWaitlist,
    box_state: updatedMembers.length === 0 ? "UNASSIGNED" : "ASSIGNED",
    updated_by: "admin",
  });
}

// Adds the currently logged-in user's member_id to a box waitlist, choosing
// the box in this priority order:
//   1. any box with zero members (box_members is empty)
//   2. any box with an empty waitlist (waitlist is empty)
//   3. the box with the shortest waitlist
// The chosen box's notes are flagged for admin review and the change is
// persisted back to the boxes collection.
export async function addToBoxWaitlist(
  allBoxes: Record<string, any>[],
  memberId?: string,
  selectedBoxId?: string,
) {
  pb.autoCancellation(false);

  const user = currentUser();

  if (!user) {
    throw new Error("No logged in user found.");
  }

  if (!allBoxes || allBoxes.length === 0) {
    throw new Error("No boxes available to join.");
  }

  // Resolve the logged-in user's member record if no member was supplied.
  if (!memberId) {
    const member = await pb
      .collection("member")
      .getFirstListItem(`user_id = "${user.id}"`);

    if (!member) {
      throw new Error(
        "Your account does not have an associated member record.",
      );
    }

    memberId = member.id;
  }

  // Don't add someone who already has a box.
  const existingBox = allBoxes.find(
    (box) =>
      Array.isArray(box.box_members) && box.box_members.includes(memberId),
  );

  if (existingBox) {
    throw new Error("Member already has a box.");
  }

  // Don't add someone who is already on a waitlist.
  const existingWaitlistBox = allBoxes.find(
    (box) =>
      Array.isArray(box.waitlist) &&
      box.waitlist.some((entry: any) => entry.member_id === memberId),
  );

  if (existingWaitlistBox) {
    throw new Error("Member is already on a box waitlist.");
  }

  /*
   * ADMIN SELECTED A SPECIFIC BOX
   *
   * If a specific box was selected:
   * - empty box -> assign directly
   * - occupied box -> add to that box's waitlist
   */
  if (selectedBoxId) {
    const targetBox = allBoxes.find((box) => box.id === selectedBoxId);

    if (!targetBox) {
      throw new Error("Selected box could not be found.");
    }

    const boxMembers = Array.isArray(targetBox.box_members)
      ? targetBox.box_members
      : [];

    const waitlist = Array.isArray(targetBox.waitlist)
      ? targetBox.waitlist
      : [];

    // Empty box → assign directly.
    if (boxMembers.length === 0) {
      return await pb.collection("boxes").update(targetBox.id, {
        box_members: [memberId],
        notes: "Member assigned to box.",
      });
    }

    // Occupied box → add to waitlist.
    const updatedWaitlist = [
      ...waitlist,
      {
        member_id: memberId,
        join_date: Math.floor(Date.now() / 1000),
        position: waitlist.length + 1,
      },
    ];

    return await pb.collection("boxes").update(targetBox.id, {
      waitlist: updatedWaitlist,
      notes: "Member added to box waitlist.",
    });
  }

  /*
   * NO SPECIFIC BOX SELECTED
   *
   * This is the regular member flow:
   * - find an empty box -> assign directly
   * - otherwise -> shortest waitlist
   */

  const emptyBox = allBoxes.find((box) => countEntries(box.box_members) === 0);

  // Empty box exists → assign directly.
  if (emptyBox) {
    return await pb.collection("boxes").update(emptyBox.id, {
      box_members: [memberId],
      notes: "Member assigned to box.",
    });
  }

  // No empty boxes → find the shortest waitlist.
  const targetBox = allBoxes.reduce((shortest, box) =>
    countEntries(box.waitlist) < countEntries(shortest.waitlist)
      ? box
      : shortest,
  );

  if (!targetBox) {
    throw new Error("No suitable box found.");
  }

  const currentWaitlist = Array.isArray(targetBox.waitlist)
    ? targetBox.waitlist
    : [];

  const updatedWaitlist = [
    ...currentWaitlist,
    {
      member_id: memberId,
      join_date: Math.floor(Date.now() / 1000),
      position: currentWaitlist.length + 1,
    },
  ];

  return await pb.collection("boxes").update(targetBox.id, {
    waitlist: updatedWaitlist,
    notes: "Member added to box waitlist.",
  });
}

export async function listMembersForBoxRequest() {
  pb.autoCancellation(false);

  return await pb.collection("member").getFullList({
    sort: "created_at",
    expand: "user_id",
    fields: "id,user_id,expand.user_id.name,expand.user_id.email",
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

export async function deleteRequest(currentSnapshot: Record<string, any>) {
  pb.autoCancellation(false);
  await pb.collection("member_snapshot").update(`${currentSnapshot.id}`, {
    notes: "Recently Denied",
  });
}

export async function acceptRequest(currentSnapshot: Record<string, any>) {
  pb.autoCancellation(false);
  //find the user with that id from the currentSnapshot's user_id
  const currentUser = await pb
    .collection("users")
    .getFirstListItem(`id = "${currentSnapshot.user_id}"`);

  //use the id from currentUser and find the member with that user_id
  const currentMember = await pb
    .collection("member")
    .getFirstListItem(`user_id = "${currentUser.id}"`);

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
): Promise<Record<string, any> | null> {
  pb.autoCancellation(false);
  try {
    return await pb
      .collection("work_formula")
      .getFirstListItem(`member_id = "${memberSnapshot.member_id}"`);
  } catch (err: any) {
    if (err?.status === 404) {
      return null; // no work_formula row exists yet for this member — expected
    }
    throw err;
  }
}

// gets the full list of legacy snapshots from the legacy_snapshots collection
export async function listLegacySnapshots() {
  pb.autoCancellation(false);
  return await pb.collection("legacy_snapshots").getList(1, 50);
}

export async function getMemberUpdateSnapshot(memberSnapshotId: string) {
  pb.autoCancellation(false);
  return await pb.collection("member_snapshot").getOne(memberSnapshotId);
}

export async function updateAcceptRequest(
  currentSnapshot: Record<string, any>,
) {
  pb.autoCancellation(false);
  //find the user with that id from the currentSnapshot's user_id
  const currentUser = await pb
    .collection("users")
    .getFirstListItem(`id = "${currentSnapshot.user_id}"`);

  //use the id from currentUser and find the member with that user_id
  const currentMember = await pb
    .collection("member")
    .getFirstListItem(`user_id = "${currentUser.id}"`);

  //update the currentSnapshot id to the currentMember's member_snapshot_id
  await pb.collection("member").update(`${currentMember.id}`, {
    member_snapshot_id: `${currentSnapshot.id}`,
  });

  await pb.collection("member_snapshot").update(`${currentSnapshot.id}`, {
    notes: "Recently Updated",
  });
}

export async function updateDenyRequest(currentSnapshot: Record<string, any>) {
  pb.autoCancellation(false);
  await pb.collection("member_snapshot").update(`${currentSnapshot.id}`, {
    notes: "Recently Denied",
  });
}
