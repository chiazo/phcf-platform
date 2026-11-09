import PocketBase from "pocketbase";

import { config } from "./config";

import { DueState, MemberType, MemberState } from '../models/enums';
import MemberSnapshot from "../models/MemberSnapshot";
import MemberInfo from '../models/MemberInfo';

export const pb = new PocketBase(config.pbUrl);

export interface WorkFormulaCriteria {
  memberType?: MemberType | "";
  boardStatus?: "board" | "non_board" | "";
  boxSharing?: "shared" | "individual" | "unassigned" | "";
  memberId?: string;
}

export type ImportKind = "dues" | "hours";

export interface ImportRowResult {
  row: number;
  email: string;
  name: string;
  status: "update" | "unchanged" | "unmatched" | "invalid";
  message?: string;
  before?: string;
  after?: string;
}

export interface ImportResult {
  preview: boolean;
  updated: number;
  unchanged: number;
  unmatched: number;
  invalid: number;
  rows: ImportRowResult[];
}

type BoxWithNames = Record<string, any> & {
  box_members_names: string[];
};

type WaitlistWithNames = Record<string, any> & {
  name: string;
};

interface BoxOverview {
  boxes: BoxWithNames[];
  waitlist: WaitlistWithNames[];
}

export async function getBoxOverview(): Promise<BoxOverview> {
  pb.autoCancellation(false);

  return await pb.send<BoxOverview>("/api/app/box-overview", {
    method: "GET",
  });
}

export async function listBoxes() {
  const overview = await getBoxOverview();
  return { items: overview.boxes };
}

export async function listBoxWaitlist() {
  const overview = await getBoxOverview();
  return overview.waitlist;
}

export async function addToBoxWaitlist(
  _allBoxes: Record<string, any>[],
  _memberId?: string,
  wants: "HALF" | "WHOLE" = "HALF",
) {
  pb.autoCancellation(false);

  return await pb.send("/api/app/boxes/request", {
    method: "POST",
    body: { wants },
  });
}

export async function importMembersData(
  kind: ImportKind,
  file: File,
  preview: boolean,
) {
  pb.autoCancellation(false);

  const body = new FormData();
  body.append("file", file);
  body.append("preview", String(preview));

  return await pb.send<ImportResult>(`/api/app/admin/import/${kind}`, {
    method: "POST",
    body,
  });
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
  meetings: number
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
        meetings,
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

export type RolloverAction = "archive" | "reset";

export interface RolloverRow {
  memberId: string;
  name: string;
  email: string;
  standing: string;
  reasons?: string[];
}

export interface RolloverResult {
  preview: boolean;
  action: RolloverAction;
  year: number;
  total: number;
  carryOver: RolloverRow[];
  inactive: RolloverRow[];
  alreadyInactive: number;
  legacyRows: number;
  requestsRemoved: number;
  snapshotsRemoved: number;
  warnings: string[];
  failures: string[];
  backup?: string;
}

export async function runRollover(
  action: RolloverAction,
  year: number,
  preview: boolean,
  keepActive: string[] = [],
) {
  pb.autoCancellation(false);
  return await pb.send<RolloverResult>("/api/app/admin/rollover", {
    method: "POST",
    body: { action, year, preview, keepActive },
  });
}

export async function listLegacyYearRows() {
  pb.autoCancellation(false);
  return await pb
    .collection("legacy_snapshots")
    .getFullList({ filter: "is_final = true || year = 0", sort: "-year" });
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

export function memberDisplayName(member?: Record<string, any>) {
  const user = member?.expand?.user_id;
  const info = member?.expand?.member_snapshot_id?.personal_info;
  const snapshotName = `${info?.firstName ?? ""} ${info?.lastName ?? ""}`.trim();

  return user?.name || snapshotName || user?.email || "";
}

export async function registerFarmMember(input: RegisterFarmMemberInput) {
  pb.autoCancellation(false);

  const name = `${input.firstName} ${input.lastName}`.trim();
  const email = input.email.trim().toLowerCase();

  // Validate before creating anything, so a bad value can't leave a half-made account
  const orientationDateMs = new Date(
    `${input.orientationDate}T00:00:00`,
  ).getTime();
  if (Number.isNaN(orientationDateMs)) {
    throw new Error("Invalid orientation date");
  }
  const orientationDateInSeconds = Math.floor(orientationDateMs / 1000);
  const nowInSeconds = Math.floor(Date.now() / 1000);

  // 1. The login account (or the one left from a registration that failed halfway)
  let user: Record<string, any>;
  try {
    user = await pb.collection("users").create({
      email,
      emailVisibility: true,
      password: input.password,
      passwordConfirm: input.password,
      name,
    });
    await login(email, input.password);
  } catch (err: any) {
    if (!err?.response?.data?.email) throw err;

    try {
      await login(email, input.password);
    } catch {
      throw new Error("EMAIL_TAKEN");
    }
    if (currentUser()?.collectionName !== "users") {
      throw new Error("EMAIL_TAKEN");
    }
    user = currentUser() as Record<string, any>;
  }

  // 2. Already registered? Finish any step an earlier attempt didn't reach.
  const existingMember = await pb
    .collection("member")
    .getFirstListItem(pb.filter("user_id = {:id}", { id: user.id }))
    .catch((err: any) => (err?.status === 404 ? null : Promise.reject(err)));

  if (existingMember) {
    const current = await pb
      .collection("member_snapshot")
      .getOne(existingMember.member_snapshot_id)
      .catch(() => null);

    if (current && !current.member_id) {
      await pb
        .collection("member_snapshot")
        .update(current.id, { member_id: existingMember.id });
    }

    return { user, snapshot: current };
  }

  // 3. Snapshot, always from the details just submitted
  const snapshot = await pb.collection("member_snapshot").create({
    user_id: user.id,
    updated_by: name || email,
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
        primaryEmail: email,
        onMailingList: input.onMailingList,
      },
      phoneInfo: {
        primaryPhoneNumber: input.phone ?? "",
      },
    },
    member_info: {
      orientationDate: orientationDateInSeconds,
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
        volunteerInterests: input.volunteerInterests ?? [],
      },
    },
    box_info: {
      boxState: "UNASSIGNED",
      boxId: "",
      changeRequester: name || email,
      waitlistInfo: {
        joinedWaitlistAt: nowInSeconds,
        waitlistNumber: 0,
      },
    },
  });

  // 4. Member record, then link the snapshot back to it
  const now = new Date().toISOString();
  const member = await pb.collection("member").create({
    user_id: user.id,
    member_snapshot_id: snapshot.id,
    created_at: now,
    modified_at: now,
  });

  const updatedSnapshot = await pb
    .collection("member_snapshot")
    .update(snapshot.id, { member_id: member.id });

  return { user, snapshot: updatedSnapshot };
}


export async function listMemberSnapshots() {
  pb.autoCancellation(false);

  // Get all member records.
  const memberRecords = await pb.collection("member").getFullList();

  // Get unique, non-empty snapshot IDs.
  const snapshotIds = [
    ...new Set(
      memberRecords
        .map((record) => record.member_snapshot_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];

  if (snapshotIds.length === 0) {
    return { items: [] as Array<Record<string, any>> };
  }

  // Fetch snapshots in batches to avoid excessively long filters.
  const batchSize = 50;
  const snapshots: Array<Record<string, any>> = [];

  for (let i = 0; i < snapshotIds.length; i += batchSize) {
    const batch = snapshotIds.slice(i, i + batchSize);

    const filter = batch
      .map((id) => `id = "${id}"`)
      .join(" || ");

    try {
      const result = await pb
        .collection("member_snapshot")
        .getList(1, batchSize, { filter });

      snapshots.push(...result.items);
    } catch (error: any) {
      console.error("Snapshot batch fetch failed:", {
        batchStart: i,
        batchSize: batch.length,
        status: error?.status,
        response: error?.response,
        message: error?.message,
      });

      throw error;
    }
  }

  return { items: snapshots };
}


export async function correspondingWorkFormulas(
  allMembers: Array<Record<string, any>>,
) {
  pb.autoCancellation(false);

  const workFormulas = await pb
    .collection("work_formula")
    .getFullList();

  const workFormulaByMemberId = new Map(
    workFormulas.map((formula) => [formula.member_id, formula]),
  );

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
        onMailingList: true,
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
  pronouns: string,
) {
  pb.autoCancellation(false);
  if (!oldMemberInfo?.memberId) return;

  const member = await pb.collection("member").getOne(oldMemberInfo.memberId);
  const current = await pb
    .collection("member_snapshot")
    .getOne(member.member_snapshot_id);

  await pb.collection("member_snapshot").update(current.id, {
    personal_info: { ...current.personal_info, pronouns },
  });
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

  return snapshot;
}

export async function getLastApprovedSnapshot(memberId: string, excludeId: string) {
  try {
    return await pb.collection("member_snapshot").getFirstListItem(
      pb.filter(
        'member_id = {:memberId} && id != {:excludeId} && notes != "Update needs approval by an admin."',
        { memberId, excludeId },
      ),
      { sort: "-created_at" },
    );
  } catch {
    return null; // no baseline found
  }
}

export async function getLatestPendingSnapshot(memberId: string, authorName: string) {
  try {
    return await pb.collection("member_snapshot").getFirstListItem(
      pb.filter(
        'member_id = {:memberId} && updated_by = {:authorName} && notes = "Update needs approval by an admin."',
        { memberId, authorName },
      ),
      { sort: "-created_at" },
    );
  } catch {
    return null;
  }
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
      .getFirstListItem(pb.filter("member_id = {:id}", { id: memberId }), {
        sort: "-created_at",
      });

    await pb.collection("work_formula").update(workFormula.id, {
      work_hours_completed:
        toNumber(workFormula.work_hours_completed) + hoursToAdd,
      modified_at: new Date().toISOString(),
    });
  } catch (err: any) {
    if (err?.status !== 404) throw err;

    // New members have no row yet, so create one instead of dropping the hours
    const now = new Date().toISOString();
    await pb.collection("work_formula").create({
      member_id: memberId,
      work_hours_required: 0,
      work_hours_completed: hoursToAdd,
      open_hours_required: 0,
      open_hours_completed: 0,
      created_at: now,
      modified_at: now,
    });
  }
}

function formatRequirementRequestType(type: string) {
  return type.toLowerCase().replace(/_/g, " ");
}


export async function removeMemberFromWaitlist(memberId: string) {
  pb.autoCancellation(false);

  if (!memberId) throw new Error("Member ID is required.");

  const entry = await pb
    .collection("box_waitlist")
    .getFirstListItem(pb.filter("member_id = {:memberId}", { memberId }))
    .catch(() => null);

  if (!entry) throw new Error("Member is not on the waitlist.");

  await pb.collection("box_waitlist").delete(entry.id);
}

export async function removeMemberFromBox(memberId: string, boxId?: string) {
  pb.autoCancellation(false);

  const boxes = await pb.collection("boxes").getFullList();

  const box = boxes.find(
    (b: any) =>
      (!boxId || b.id === boxId) &&
      Array.isArray(b.box_members) &&
      b.box_members.includes(memberId),
  );

  if (!box) throw new Error("Member is not assigned to a box.");

  const updatedMembers = box.box_members.filter(
    (id: string) => id !== memberId,
  );

  return await pb.collection("boxes").update(box.id, {
    box_members: updatedMembers,
    ...(updatedMembers.length === 0 ? { capacity: 2 } : {}),
    box_state: updatedMembers.length === 0 ? "UNASSIGNED" : "ASSIGNED",
    updated_by: "admin",
  });
}

export async function assignWaitlistedMemberToBox(memberId: string) {
  pb.autoCancellation(false);

  if (!memberId) throw new Error("Member ID is required.");

  const entry = await pb
    .collection("box_waitlist")
    .getFirstListItem(pb.filter("member_id = {:memberId}", { memberId }))
    .catch(() => null);

  if (!entry) throw new Error("Member is not on the waitlist.");

  const wantsWhole = entry.wants === "WHOLE";
  const boxes = await pb.collection("boxes").getFullList();

  const currentBox = boxes.find(
    (b: any) =>
      Array.isArray(b.box_members) && b.box_members.includes(memberId),
  );

  if (currentBox && !wantsWhole) {
    throw new Error("Member already has a box.");
  }

  // Whole seekers need a box with nobody in it
  const openBoxes = wantsWhole
    ? boxes.filter((b: any) => countEntries(b.box_members) === 0)
    : boxes.filter(hasRoom);

  if (openBoxes.length === 0) {
    throw new Error(
      wantsWhole
        ? "No completely empty box is available right now."
        : "No empty boxes are available right now.",
    );
  }

  const target = openBoxes[0];

  const assignedBox = await pb.collection("boxes").update(target.id, {
    box_members: wantsWhole
      ? [memberId]
      : [...(target.box_members ?? []), memberId],
    ...(wantsWhole ? { capacity: 1 } : {}),
    notes: "Member assigned to box.",
    box_state: "ASSIGNED",
    updated_by: "admin",
  });

  // Whole seeker leaves the box they were sharing
  if (currentBox) {
    const remaining = currentBox.box_members.filter(
      (id: string) => id !== memberId,
    );
    await pb.collection("boxes").update(currentBox.id, {
      box_members: remaining,
      ...(remaining.length === 0 ? { capacity: 2 } : {}),
      box_state: remaining.length === 0 ? "UNASSIGNED" : "ASSIGNED",
      notes: "Member moved to a whole box.",
      updated_by: "admin",
    });
  }

  try {
    await pb.collection("box_waitlist").delete(entry.id);
  } catch {
    throw new Error(
      "Box assigned, but the waitlist entry could not be removed. Remove it manually.",
    );
  }

  return assignedBox;
}

export async function moveMemberToBox(
  memberId: string,
  fromBoxId: string,
  toBoxId: string,
) {
  pb.autoCancellation(false);

  if (fromBoxId === toBoxId) throw new Error("Choose a different box.");

  // Fresh reads, not the React state
  const from = await pb.collection("boxes").getOne(fromBoxId);
  const to = await pb.collection("boxes").getOne(toBoxId);

  if (!hasRoom(to)) {
    throw new Error("That box is full.");
  }

  if (!(from.box_members ?? []).includes(memberId)) {
    throw new Error("Member is not in that box.");
  }
  if (countEntries(to.box_members) >= 2) {
    throw new Error("That box is full.");
  }

  // Add to the new box first, so a failure never leaves them with no box
  const box = await pb.collection("boxes").update(to.id, {
    box_members: [...(to.box_members ?? []), memberId],
    notes: "Member moved to box.",
    box_state: "ASSIGNED",
    updated_by: "admin",
  });

  const remaining = (from.box_members ?? []).filter(
    (id: string) => id !== memberId,
  );

  try {
    await pb.collection("boxes").update(from.id, {
      box_members: remaining,
      ...(remaining.length === 0 ? { capacity: 2 } : {}),
      notes: "Member moved to another box.",
      box_state: remaining.length === 0 ? "UNASSIGNED" : "ASSIGNED",
      updated_by: "admin",
    });
  } catch (err) {
    throw new Error(
      "Member was added to the new box, but could not be removed from the old one. Remove them manually.",
    );
  }

  return box;
}

export async function swapMembers(
  memberId: string,
  boxId: string,
  otherMemberId: string,
  otherBoxId: string,
) {
  pb.autoCancellation(false);

  if (boxId === otherBoxId) {
    throw new Error("Choose a member in a different box.");
  }

  // Fresh reads, not the React state
  const a = await pb.collection("boxes").getOne(boxId);
  const b = await pb.collection("boxes").getOne(otherBoxId);

  const aMembers: string[] = a.box_members ?? [];
  const bMembers: string[] = b.box_members ?? [];

  if (!aMembers.includes(memberId) || !bMembers.includes(otherMemberId)) {
    throw new Error(
      "Members are no longer in those boxes. Refresh and try again.",
    );
  }
  if (aMembers.includes(otherMemberId) || bMembers.includes(memberId)) {
    throw new Error("One of these members is already in both boxes.");
  }

  const swapIn = (members: string[], out: string, inn: string) =>
    members.map((id) => (id === out ? inn : id));

  await pb.collection("boxes").update(a.id, {
    box_members: swapIn(aMembers, memberId, otherMemberId),
    notes: "Members swapped between boxes.",
    updated_by: "admin",
  });

  try {
    await pb.collection("boxes").update(b.id, {
      box_members: swapIn(bMembers, otherMemberId, memberId),
      notes: "Members swapped between boxes.",
      updated_by: "admin",
    });
  } catch (err) {
    // Two separate writes, so undo the first one if the second fails
    let rolledBack = true;
    try {
      await pb.collection("boxes").update(a.id, { box_members: aMembers });
    } catch {
      rolledBack = false;
    }
    throw new Error(
      rolledBack
        ? "Could not complete the swap. No changes were made."
        : "The swap only partly went through. Check both boxes and fix them manually.",
    );
  }
}

export async function listMembersForBoxRequest() {
  pb.autoCancellation(false);

  return await pb.collection("member").getFullList({
    sort: "created_at",
    expand: "user_id,member_snapshot_id",
    fields:
      "id,user_id,member_snapshot_id,expand.user_id.name,expand.user_id.email,expand.member_snapshot_id.personal_info",
  });
}

export const countEntries = (value: unknown): number =>
  Array.isArray(value) ? value.length : 0;

//gets the full list of work formulas from their collection
export async function listWorkFormulas() {
  pb.autoCancellation(false);

  return await pb.collection("work_formula").getList(1, 500, {
    expand: "member_id,member_id.user_id,member_id.member_snapshot_id",
    sort: "created_at",
  });
}

export const HOURS_REQUIRED = { NONE: 10, HALF: 15, WHOLE: 20 };

export const boxCapacity = (box: Record<string, any>) =>
  Number(box.capacity) || 2;

export const hasRoom = (box: Record<string, any>) =>
  countEntries(box.box_members) < boxCapacity(box);

export function hoursRequiredFor(
  memberId: string,
  boxes: Record<string, any>[],
  waitlist: Record<string, any>[],
) {
  const box = boxes.find((b) => (b.box_members ?? []).includes(memberId));
  if (!box) return HOURS_REQUIRED.NONE;
  if (boxCapacity(box) === 1) return HOURS_REQUIRED.WHOLE;
  if (countEntries(box.box_members) >= 2) return HOURS_REQUIRED.HALF;

  // Alone in a shareable box: stays at half while anyone else is waiting
  return waitlist.some((e) => e.member_id !== memberId)
    ? HOURS_REQUIRED.HALF
    : HOURS_REQUIRED.WHOLE;
}

export async function setBoxCapacity(boxId: string, capacity: 1 | 2) {
  pb.autoCancellation(false);

  const box = await pb.collection("boxes").getOne(boxId);
  if (capacity < countEntries(box.box_members)) {
    throw new Error("This box has more members than that capacity.");
  }

  return await pb.collection("boxes").update(boxId, {
    capacity,
    notes: "Box capacity changed.",
    updated_by: "admin",
  });
}

export async function createBox(boxName: string, boxNumber: number) {
  pb.autoCancellation(false);

  const existing = await pb
    .collection("boxes")
    .getFirstListItem(pb.filter("box_number = {:n}", { n: boxNumber }))
    .catch((err: any) => {
      if (err?.status === 404) return null;
      throw err;
    });

  if (existing) throw new Error(`Box ${boxNumber} already exists.`);

  const now = new Date().toISOString();

  return await pb.collection("boxes").create({
    box_name: boxName,
    box_number: boxNumber,
    box_state: "UNASSIGNED",
    capacity: 2,
    box_members: [],
    notes: "Box added by an admin.",
    updated_by: currentUser()?.name || currentUser()?.email || "admin",
    created_at: now,
    modified_at: now,
  });
}

export async function deleteBox(boxId: string) {
  pb.autoCancellation(false);

  const box = await pb.collection("boxes").getOne(boxId);

  if (countEntries(box.box_members) > 0) {
    throw new Error(
      "Remove or move the members out of this box before decommissioning it.",
    );
  }

  await pb.collection("boxes").delete(boxId);

  return { movedWaitlist: 0 };
}

export async function deleteMember(
  memberId: string,
  { deleteUser = false }: { deleteUser?: boolean } = {},
) {
  pb.autoCancellation(false);

  if (!isAdmin()) throw new Error("Admin access is required.");
  if (!memberId) throw new Error("Member ID is required.");

  // Fresh reads, not React state
  const member = await pb.collection("member").getOne(memberId);
  const userId: string = member.user_id;

  if (userId === currentUser()?.id) {
    throw new Error("You can't delete your own member record.");
  }

  // 1. Take them out of any box (and reopen a whole box they emptied)
  const boxes = await pb.collection("boxes").getFullList({
    filter: pb.filter("box_members ~ {:id}", { id: memberId }),
  });
  for (const box of boxes) {
    const remaining = (box.box_members ?? []).filter(
      (id: string) => id !== memberId,
    );
    await pb.collection("boxes").update(box.id, {
      box_members: remaining,
      ...(remaining.length === 0 ? { capacity: 2 } : {}),
      box_state: remaining.length === 0 ? "UNASSIGNED" : "ASSIGNED",
      notes: "Member deleted.",
      updated_by: currentUser()?.name || currentUser()?.email || "admin",
    });
  }

  // 2. Waitlist entry (the cascade would also do this; explicit is clearer)
  const waiting = await pb.collection("box_waitlist").getFullList({
    filter: pb.filter("member_id = {:id}", { id: memberId }),
  });
  for (const entry of waiting) {
    await pb.collection("box_waitlist").delete(entry.id);
  }

  // 3. Hours
  const formulas = await pb.collection("work_formula").getFullList({
    filter: pb.filter("member_id = {:id}", { id: memberId }),
  });
  for (const formula of formulas) {
    await pb.collection("work_formula").delete(formula.id);
  }

  // 4. Requests (they point at snapshots, so they go first)
  const requests = await pb.collection("requirement_update_request").getFullList({
    filter: pb.filter("member_id = {:id}", { id: memberId }),
  });
  for (const request of requests) {
    await pb.collection("requirement_update_request").delete(request.id);
  }

  // 5. The member record, which points at its current snapshot
  await pb.collection("member").delete(memberId);

  // 6. Snapshots: every version, including pending ones
  const snapshots = await pb.collection("member_snapshot").getFullList({
    filter: pb.filter("member_id = {:id}", { id: memberId }),
  });
  for (const snapshot of snapshots) {
    await pb.collection("member_snapshot").delete(snapshot.id);
  }

  // 7. Optionally the login account
  if (deleteUser) {
    await pb.collection("users").delete(userId);
  }

  return {
    boxes: boxes.length,
    snapshots: snapshots.length,
    requests: requests.length,
  };
}


export async function updateBoxName(
  boxId: string,
  boxName: string,
) {
  pb.autoCancellation(false);

  const name = boxName.trim();

  if (!name) {
    throw new Error("Enter a box name.");
  }

  return await pb.collection("boxes").update(boxId, {
    box_name: name,
    updated_by:
      currentUser()?.name || currentUser()?.email || "admin",
    modified_at: new Date().toISOString(),
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
  return await pb.collection("legacy_snapshots").getList(1, 50, { filter: "is_final = true || year = 0", sort: "-year" })
}

export async function getMemberUpdateSnapshot(memberSnapshotId: string) {
  pb.autoCancellation(false);
  return await pb.collection("member_snapshot").getOne(memberSnapshotId);
}

export async function updateAcceptRequest(request: Record<string, any>) {
  pb.autoCancellation(false);

  const snapshotId = request.member_snapshot_id;

  const requester = await pb.collection("users").getOne(request.user_id);

  const member = await pb
    .collection("member")
    .getFirstListItem(pb.filter("user_id = {:uid}", { uid: requester.id }));

  // point the member at the approved snapshot
  await pb.collection("member").update(member.id, {
    member_snapshot_id: snapshotId,
  });

  await pb.collection("member_snapshot").update(snapshotId, {
    notes: "Recently Updated",
  });

  // close out the request so it leaves the pending list
  await pb.collection("requirement_update_request").update(request.id, {
    status: "APPROVED",
    reviewed_by: currentUser()?.name ?? "",
    reviewed_at: new Date().toISOString()
  });
}

export async function updateDenyRequest(request: Record<string, any>) {
  pb.autoCancellation(false);

  await pb.collection("member_snapshot").update(request.member_snapshot_id, {
    notes: "Recently Denied",
  });
}
