import type { FormEvent } from "react";
import { useEffect, useId, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { config } from "../lib/config";
import { useVolunteerInterests } from "../lib/form";
import {
  approveRequirementUpdateRequest,
  correspondingWorkFormulas,
  currentUser,
  denyRequirementUpdateRequest,
  exportMembersCSV,
  getCurrentUserMemberSnapshot,
  getMemberUpdateSnapshot,
  getOrCreateCurrentUserMemberSnapshot,
  isLoggedIn,
  listApprovalUpdates,
  listMemberSnapshots,
  listMyRequirementUpdateRequests,
  listPendingRequirementUpdateRequests,
  logout,
  RequirementUpdateRequestType,
  submitRequirementUpdateRequest,
  updateAcceptRequest,
  updateDenyRequest,
} from "../lib/pocketbase";

import SearchIcon from "@mui/icons-material/Search";
import AssignmentIcon from "@mui/icons-material/Assignment";
import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import InputLabel from "@mui/material/InputLabel";
import OutlinedInput from "@mui/material/OutlinedInput";
import Tooltip from "@mui/material/Tooltip";

import Header from "../components/Header";
import MemberInfo from "../components/MemberInfo";
import MemberTable from "../components/MemberTable";
import { DueState } from "../models/enums";
import { isAdmin } from "../lib/pocketbase";

type AdminView = "members" | "requests" | "member-progress";

const ADMIN_VIEWS: Array<{ id: AdminView; label: string }> = [
  { id: "members", label: "All Members" },
  { id: "requests", label: "Requirement Update Requests" },
  { id: "member-progress", label: "My Progress" },
];

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function yesNo(value: boolean) {
  return value ? "YES" : "NO";
}

function requirementIcon(value: boolean) {
  return value ? "✅" : "⚠️";
}

function formatDateFromSeconds(value: unknown) {
  const seconds = toNumber(value);
  if (!seconds) return "—";

  return new Date(seconds * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatList(values: unknown) {
  return Array.isArray(values) && values.length ? values.join(", ") : "—";
}

function formatRequestType(type: string) {
  return type
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getRequestMemberLabel(request: Record<string, any>) {
  const requester = request.expand?.user_id;
  return requester?.name || requester?.email || request.member_id || "—";
}

function formatDateFromInput(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 0;

  return Math.floor(date.getTime() / 1000);
}

function todayInputValue() {
  return new Date().toISOString().split("T")[0];
}

function MemberPersonalView({
  member,
  requests,
  onRequestSubmitted,
  isAdmin,
}: {
  member: Record<string, any>;
  requests: Array<Record<string, any>>;
  onRequestSubmitted?: () => void;
  isAdmin: boolean;
}) {
  const { interests: volunteerInterestOptions } = useVolunteerInterests();

  const personalInfo = member.personal_info ?? {};
  const memberInfo = member.member_info ?? {};
  const dues = memberInfo.dues ?? {};
  const requirements = memberInfo.requirements ?? {};
  const serviceRequirements = requirements.serviceRequirements ?? [];
  const address = personalInfo.address ?? {};
  const emailInfo = personalInfo.emailInfo ?? {};
  const phoneInfo = personalInfo.phoneInfo ?? {};
  const dueStatus = dues.dueState ?? "—";
  const duesPaid = dueStatus === DueState.COMPLETE;
  const meetingsRequired = toNumber(requirements.meetingsRequired);
  const meetingsCompleted = toNumber(requirements.meetingsCompleted);
  const meetingsMet = meetingsCompleted >= meetingsRequired;
  const serviceHoursRequired = toNumber(requirements.serviceHoursRequired);
  const serviceHoursCompleted = serviceRequirements.reduce(
    (sum: number, service: any) => sum + toNumber(service.hoursCompleted),
    0,
  );
  const serviceHoursMet = serviceHoursCompleted >= serviceHoursRequired;
  const allRequirementsMet = duesPaid && meetingsMet && serviceHoursMet;

  const firstName = personalInfo.firstName ?? "";
  const lastName = personalInfo.lastName ?? "";
  const fullName = `${firstName} ${lastName}`.trim() || "—";
  const [requestType, setRequestType] = useState<RequirementUpdateRequestType>(
    RequirementUpdateRequestType.AMOUNT_PAID,
  );
  const [quantity, setQuantity] = useState("");
  const [paymentType, setPaymentType] = useState("cash");
  const [occurredAt, setOccurredAt] = useState(todayInputValue());
  const [requestNotes, setRequestNotes] = useState("");
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const [activity, setActivity] = useState("");
  const [projectLeader, setProjectLeader] = useState("");

  async function handleRequirementRequestSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setRequestMessage(null);

    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setRequestMessage("Enter an amount greater than zero.");
      return;
    }

    const occurredAtSeconds = formatDateFromInput(occurredAt);
    if (!occurredAtSeconds) {
      setRequestMessage("Enter a valid date.");
      return;
    }

    try {
      await submitRequirementUpdateRequest({
        userId: member.user_id || currentUser()?.id || "",
        memberId: member.member_id || currentUser()?.id || "",
        memberSnapshotId: member.id,
        requestType,
        quantity: parsedQuantity,
        paymentType:
          requestType === RequirementUpdateRequestType.AMOUNT_PAID
            ? paymentType
            : "",
        occurredAt: occurredAtSeconds,
        activity:
          requestType === RequirementUpdateRequestType.SERVICE_HOURS
            ? activity
            : "",
        projectLeader:
          requestType === RequirementUpdateRequestType.SERVICE_HOURS
            ? projectLeader
            : "",
        notes: requestNotes,
      });

      setQuantity("");
      setActivity("");
      setProjectLeader("");
      setRequestNotes("");
      setRequestMessage("Request submitted for admin approval.");
      onRequestSubmitted?.();
    } catch (err) {
      console.error("requirement request error:", err);
      setRequestMessage("Could not submit request. Please try again.");
    }
  }

  return (
    <>
      <section>
        <h2>Membership Requirements</h2>
        <table>
          <tbody>
            <tr>
              <th>Dues Status</th>
              <td>
                {dueStatus} {requirementIcon(duesPaid)}
              </td>
            </tr>
            <tr>
              <th>Meetings Completed</th>
              <td>
                {meetingsCompleted} / {meetingsRequired}{" "}
                {requirementIcon(meetingsMet)}
              </td>
            </tr>
            <tr>
              <th>Service Hours Completed</th>
              <td>
                {serviceHoursCompleted} / {serviceHoursRequired}{" "}
                {requirementIcon(serviceHoursMet)}
              </td>
            </tr>
            <tr>
              <th>All Member Requirements Met</th>
              <td>{yesNo(allRequirementsMet)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Submit Membership Requirement Progress</h2>

        <p className="muted">
          Use this form to submit membership requirement progress for admin
          approval. For Work Hours, please submit each activity or shift
          separately.
        </p>

        {requestMessage && (
          <p role="status" className="muted">
            {requestMessage}
          </p>
        )}

        <form className="form-grid" onSubmit={handleRequirementRequestSubmit}>
          <label>
            Update Type
            <select
              value={requestType}
              onChange={(event) => {
                setRequestType(
                  event.target.value as RequirementUpdateRequestType,
                );
                setActivity("");
                setProjectLeader("");
              }}
            >
              <option value={RequirementUpdateRequestType.AMOUNT_PAID}>
                Amount Paid
              </option>
              <option value={RequirementUpdateRequestType.SERVICE_HOURS}>
                Work Hours
              </option>
              <option value={RequirementUpdateRequestType.MEETING_HOURS}>
                Meeting Hours
              </option>
            </select>
          </label>

          {requestType === RequirementUpdateRequestType.SERVICE_HOURS && (
            <>
              <p className="form-description">
                <b>Work Hours:</b> These include work days, plant sale shifts,
                snow shoveling, opening the garden for school visits, and other
                approved activities. Please submit each activity or shift
                separately.
              </p>

              <p className="form-description">
                Please submit all Work Hours completed so we know how much time
                garden maintenance takes. Remember that at least 60% of your
                total Service Hours must be Open Hours.
              </p>

              <label>
                How many hours are you submitting?
                <input
                  min="0"
                  step="0.25"
                  type="number"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  required
                />
              </label>

              <label>
                What date did you volunteer these hours?
                <input
                  type="date"
                  value={occurredAt}
                  onChange={(event) => setOccurredAt(event.target.value)}
                  required
                />
              </label>

              <label>
                For what activity are you submitting Work Hours?
                <select
                  value={activity}
                  onChange={(event) => setActivity(event.target.value)}
                  required
                >
                  <option value="">Select an activity</option>

                  {volunteerInterestOptions.map((option) => (
                    <option key={option.id} value={option.label}>
                      {option.emoji} {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <p className="form-description">
                <b>Reminder:</b> Open Hour shifts and Compost Team shifts should
                not be submitted through this form.
              </p>

              <label>
                Who led this project?
                <input
                  type="text"
                  value={projectLeader}
                  onChange={(event) => setProjectLeader(event.target.value)}
                  placeholder="First and last name"
                  required={false}
                />
              </label>

              <p className="form-description">
                If you led the project yourself, enter "Self-led" and include
                the name of another volunteer who was present in the notes
                below.
              </p>
            </>
          )}

          {requestType === RequirementUpdateRequestType.MEETING_HOURS && (
            <>
              <p className="form-description">
                Submit the number of qualifying meeting hours you completed.
              </p>

              <label>
                How many meeting hours are you submitting?
                <input
                  min="0"
                  step="0.25"
                  type="number"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  required
                />
              </label>

              <label>
                What date did you attend the meeting?
                <input
                  type="date"
                  value={occurredAt}
                  onChange={(event) => setOccurredAt(event.target.value)}
                  required
                />
              </label>
            </>
          )}

          {requestType === RequirementUpdateRequestType.AMOUNT_PAID && (
            <>
              <p className="form-description">
                Submit a payment toward your membership dues. The payment will
                be reviewed and applied to your membership record by an admin.
              </p>

              <label>
                Amount to Add
                <input
                  min="0"
                  step="0.01"
                  type="number"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  required
                />
              </label>

              <label>
                Payment Type
                <select
                  value={paymentType}
                  onChange={(event) => setPaymentType(event.target.value)}
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="check">Check</option>
                  <option value="venmo">Venmo</option>
                  <option value="paypal">PayPal</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label>
                Date paid
                <input
                  type="date"
                  value={occurredAt}
                  onChange={(event) => setOccurredAt(event.target.value)}
                  required
                />
              </label>
            </>
          )}

          <label>
            Notes
            <input
              value={requestNotes}
              onChange={(event) => setRequestNotes(event.target.value)}
              placeholder="Optional details"
            />
          </label>

          <button type="submit">Submit for approval</button>
        </form>
      </section>

      <MemberRequirementRequestStatusTable requests={requests} />

      <section>
        <h2>My Info</h2>
        <table>
          <tbody>
            <tr>
              <th>Full Name</th>
              <td>{fullName}</td>
            </tr>
            <tr>
              <th>Pronouns</th>
              <td>{personalInfo.pronouns || "—"}</td>
            </tr>
            <tr>
              <th>Email</th>
              <td>{emailInfo.primaryEmail || "—"}</td>
            </tr>
            <tr>
              <th>Phone</th>
              <td>{phoneInfo.primaryPhoneNumber || "—"}</td>
            </tr>
            <tr>
              <th>Address</th>
              <td>
                {[address.line1, address.city, address.zipCode]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </td>
            </tr>
            <tr>
              <th>Mailing List</th>
              <td>{emailInfo.onMailingList ? "Yes" : "No"}</td>
            </tr>
            <tr>
              <th>Member Type</th>
              <td>{memberInfo.memberType || "—"}</td>
            </tr>
            <tr>
              <th>Status</th>
              <td>{memberInfo.memberState || "—"}</td>
            </tr>
            <tr>
              <th>Orientation</th>
              <td>{formatDateFromSeconds(memberInfo.orientationDate)}</td>
            </tr>
            <tr>
              <th>Volunteer Interests</th>
              <td>
                <div className="volunteer-interest-list">
                  {requirements.volunteerInterests?.map((interest: string) => {
                    const option = volunteerInterestOptions.find(
                      (option) => option.label === interest,
                    );

                    return (
                      <div className="checkbox-row" key={interest}>
                        {option?.emoji} {interest}
                      </div>
                    );
                  })}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <p style={{ textAlign: "center" }}>
          <Link className="button-link secondary" to={`/snapshot/${member.id}`}>
            Edit{!isAdmin && " (Admin Approval Needed)"}
          </Link>
        </p>
      </section>
    </>
  );
}

function MemberRequirementRequestStatusTable({
  requests,
}: {
  requests: Array<Record<string, any>>;
}) {
  if (requests.length === 0) {
    return (
      <section>
        <h2>My Submitted Progress</h2>
        <p className="muted">No submitted progress requests yet.</p>
      </section>
    );
  }

  return (
    <section>
      <h2>My Submitted Progress</h2>
      <div className="modal-table-wrapper always-visible-table">
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Amount/Hours</th>
              <th>Status</th>
              <th>Date</th>
              <th>Notes</th>
              <th>Reviewed By</th>
            </tr>
          </thead>
          <tbody className="submitted-progress">
            {requests.map((request) => (
              <tr key={request.id}>
                <td>{formatRequestType(request.request_type)}</td>
                <td>{request.quantity}</td>
                <td>{request.status}</td>
                <td>{formatDateFromSeconds(request.occurred_at)}</td>
                <td>{request.notes || "—"}</td>
                <td>{request.reviewed_by || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RequirementUpdateRequestTable({
  requests,
  onActionComplete,
}: {
  requests: Array<Record<string, any>>;
  onActionComplete: () => void;
}) {
  const [currentMemberUpdateRequest, setCurrentMemberUpdateRequest] = useState<
    Record<string, any>
  >({});

  const serviceHourRequests = requests.filter(
    (request) =>
      request.request_type === RequirementUpdateRequestType.SERVICE_HOURS,
  );

  const meetingHourRequests = requests.filter(
    (request) =>
      request.request_type === RequirementUpdateRequestType.MEETING_HOURS,
  );

  const paymentRequests = requests.filter(
    (request) =>
      request.request_type === RequirementUpdateRequestType.AMOUNT_PAID,
  );

  const profileUpdateRequests = requests.filter(
    (request) =>
      request.request_type === RequirementUpdateRequestType.PROFILE_UPDATE,
  );

  async function handleApprove(request: Record<string, any>) {
    await approveRequirementUpdateRequest(request);
    if (request.request_type === RequirementUpdateRequestType.PROFILE_UPDATE) {
      updateAcceptRequest(request);
    }
    onActionComplete();
  }

  async function handleDeny(request: Record<string, any>) {
    await denyRequirementUpdateRequest(request);
    if (request.request_type === RequirementUpdateRequestType.PROFILE_UPDATE) {
      updateDenyRequest(request);
    }
    onActionComplete();
  }

  async function handleApproveAll(
    requestsToApprove: Array<Record<string, any>>,
  ) {
    try {
      await Promise.all(
        requestsToApprove.map((request) =>
          approveRequirementUpdateRequest(request),
        ),
      );
      onActionComplete();
    } catch (err) {
      console.error("bulk approve error:", err);
    }
  }

  async function handleDenyAll(requestsToDeny: Array<Record<string, any>>) {
    try {
      await Promise.all(
        requestsToDeny.map((request) => denyRequirementUpdateRequest(request)),
      );
      onActionComplete();
    } catch (err) {
      console.error("bulk deny error:", err);
    }
  }

  function displayModal(request: Record<string, any>) {
    getMemberUpdateSnapshot(request.member_snapshot_id)
      .then((memberSnapshot) => {
        setCurrentMemberUpdateRequest(memberSnapshot);
      })
      .catch((err) => {
        console.error("Error fetching member snapshot:", err);
      });
  }

  if (requests.length === 0) {
    return (
      <section>
        <h2>Membership Requirement Update Requests</h2>
        <p className="muted">No pending requirement updates.</p>
      </section>
    );
  }

  return (
    <>
      <section>
        <h2>Membership Requirement Update Requests</h2>

        {serviceHourRequests.length > 0 && (
          <section>
            <div className="request-table-header">
              <h3>Work Hour Requests</h3>

              <div className="bulk-action-row">
                <button
                  className="bulk-action-button approve-action"
                  onClick={() => handleApproveAll(serviceHourRequests)}
                  type="button"
                >
                  Approve All
                </button>

                <button
                  className="bulk-action-button deny-action"
                  onClick={() => handleDenyAll(serviceHourRequests)}
                  type="button"
                >
                  Deny All
                </button>
              </div>
            </div>

            <div className="modal-table-wrapper always-visible-table">
              <table>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Hours</th>
                    <th>Activity</th>
                    <th>Date</th>
                    <th>Project Leader</th>
                    <th>Notes</th>
                    <th></th>
                    <th></th>
                  </tr>
                </thead>

                <tbody>
                  {serviceHourRequests.map((request) => (
                    <tr key={request.id}>
                      <td>{getRequestMemberLabel(request)}</td>
                      <td>{request.quantity}</td>
                      <td>{request.activity || "—"}</td>
                      <td>{formatDateFromSeconds(request.occurred_at)}</td>
                      <td>{request.project_leader || "—"}</td>
                      <td>{request.notes || "—"}</td>
                      <td>
                        <button
                          className="icon-action approve-action"
                          onClick={() => handleApprove(request)}
                          type="button"
                          title="Approve"
                        >
                          ✓
                        </button>
                      </td>
                      <td>
                        <button
                          className="icon-action deny-action"
                          onClick={() => handleDeny(request)}
                          type="button"
                          title="Deny"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {meetingHourRequests.length > 0 && (
          <section>
            <div className="request-table-header">
              <h3>Meeting Hour Requests</h3>

              <div className="bulk-action-row">
                <button
                  className="bulk-action-button approve-action"
                  onClick={() => handleApproveAll(meetingHourRequests)}
                  type="button"
                >
                  Approve All
                </button>

                <button
                  className="bulk-action-button deny-action"
                  onClick={() => handleDenyAll(meetingHourRequests)}
                  type="button"
                >
                  Deny All
                </button>
              </div>
            </div>

            <div className="modal-table-wrapper always-visible-table">
              <table>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Hours</th>
                    <th>Date</th>
                    <th>Notes</th>
                    <th></th>
                    <th></th>
                  </tr>
                </thead>

                <tbody>
                  {meetingHourRequests.map((request) => (
                    <tr key={request.id}>
                      <td>{getRequestMemberLabel(request)}</td>
                      <td>{request.quantity}</td>
                      <td>{formatDateFromSeconds(request.occurred_at)}</td>
                      <td>{request.notes || "—"}</td>
                      <td>
                        <button
                          className="icon-action approve-action"
                          onClick={() => handleApprove(request)}
                          type="button"
                          title="Approve"
                        >
                          ✓
                        </button>
                      </td>
                      <td>
                        <button
                          className="icon-action deny-action"
                          onClick={() => handleDeny(request)}
                          type="button"
                          title="Deny"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {paymentRequests.length > 0 && (
          <section>
            <div className="request-table-header">
              <h3>Payment Requests</h3>

              <div className="bulk-action-row">
                <button
                  className="bulk-action-button approve-action"
                  onClick={() => handleApproveAll(paymentRequests)}
                  type="button"
                >
                  Approve All
                </button>

                <button
                  className="bulk-action-button deny-action"
                  onClick={() => handleDenyAll(paymentRequests)}
                  type="button"
                >
                  Deny All
                </button>
              </div>
            </div>

            <div className="modal-table-wrapper always-visible-table">
              <table>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Amount</th>
                    <th>Payment Type</th>
                    <th>Date</th>
                    <th>Notes</th>
                    <th></th>
                    <th></th>
                  </tr>
                </thead>

                <tbody>
                  {paymentRequests.map((request) => (
                    <tr key={request.id}>
                      <td>{getRequestMemberLabel(request)}</td>
                      <td>{request.quantity}</td>
                      <td>{request.payment_type || "—"}</td>
                      <td>{formatDateFromSeconds(request.occurred_at)}</td>
                      <td>{request.notes || "—"}</td>
                      <td>
                        <button
                          className="icon-action approve-action"
                          onClick={() => handleApprove(request)}
                          type="button"
                          title="Approve"
                        >
                          ✓
                        </button>
                      </td>
                      <td>
                        <button
                          className="icon-action deny-action"
                          onClick={() => handleDeny(request)}
                          type="button"
                          title="Deny"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {profileUpdateRequests.length > 0 && (
          <section>
            <h3>Profile Update Requests</h3>

            <div className="modal-table-wrapper always-visible-table">
              <table>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Date</th>
                    <th>Notes</th>
                    <th>Details</th>
                    <th></th>
                    <th></th>
                  </tr>
                </thead>

                <tbody>
                  {profileUpdateRequests.map((request) => (
                    <tr key={request.id}>
                      <td>{getRequestMemberLabel(request)}</td>
                      <td>{formatDateFromSeconds(request.occurred_at)}</td>
                      <td>{request.notes || "—"}</td>
                      <td>
                        <Tooltip
                          title="View proposed changes"
                          onClick={() => displayModal(request)}
                        >
                          <IconButton>
                            <AssignmentIcon />
                          </IconButton>
                        </Tooltip>
                      </td>
                      <td>
                        <button
                          className="icon-action approve-action"
                          onClick={() => handleApprove(request)}
                          type="button"
                          title="Approve"
                        >
                          ✓
                        </button>
                      </td>
                      <td>
                        <button
                          className="icon-action deny-action"
                          onClick={() => handleDeny(request)}
                          type="button"
                          title="Deny"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </section>

      <MemberInfo
        member={currentMemberUpdateRequest}
        onActionComplete={onActionComplete}
      />
    </>
  );
}

export default function MembersPage() {
  const navigate = useNavigate();
  //holds all of the members fetched from the server
  const [allMembers, setAllMembers] = useState<Array<Record<string, any>>>([]);
  const [approvedMembers, setApprovedMembers] = useState<
    Array<Record<string, any>>
  >([]);
  const [requirementUpdateRequests, setRequirementUpdateRequests] = useState<
    Array<Record<string, any>>
  >([]);
  const [myRequirementUpdateRequests, setMyRequirementUpdateRequests] =
    useState<Array<Record<string, any>>>([]);
  const [adminSnapshot, setAdminSnapshot] = useState<Record<
    string,
    any
  > | null>(null);
  const [query, setQuery] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(isLoggedIn());
  const outlinedAmountId = useId();
  const [workFormulas, setAllFormulas] = useState<Array<Record<string, any>>>(
    [],
  );
  const [selectedView, setSelectedView] = useState<AdminView>("members");

  async function handleMyProgressClick() {
    try {
      const snapshot =
        adminSnapshot ?? (await getOrCreateCurrentUserMemberSnapshot());

      setAdminSnapshot(snapshot);
      setSelectedView("member-progress");
    } catch (err) {
      console.error("admin snapshot create/fetch error:", err);
    }
  }

  async function refreshApprovedMembers() {
    try {
      const res = await listApprovalUpdates();
      setApprovedMembers(res.items);
    } catch (err) {
      console.error("member fetch error:", err);
      setApprovedMembers([]);
    }
  }

  async function memberWorkFormulas(members: Array<Record<string, any>>) {
    try {
      const res = await correspondingWorkFormulas(members);
      return setAllFormulas(res.items);
    } catch (err) {
      console.error("work formula fetch error:", err);
      setAllMembers([]);
    }
  }

  async function handleExportMembers() {
    try {
      const blob = await exportMembersCSV();

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      const today = new Date().toISOString().slice(0, 10);

      link.href = url;
      link.download = `members-${today}.csv`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("CSV export failed:", err);
    }
  }

  function refreshAllMembers() {
    return listMemberSnapshots()
      .then(async (res) => {
        setAllMembers(res.items);

        await memberWorkFormulas(res.items);
      })
      .catch((err) => {
        console.error("member fetch error:", err);
        setAllMembers([]);
        setAllFormulas([]);
      });
  }

  function refreshMyRequirementUpdateRequests() {
    return listMyRequirementUpdateRequests()
      .then((res) => setMyRequirementUpdateRequests(res.items))
      .catch((err) => {
        console.error("my requirement update request fetch error:", err);
        setMyRequirementUpdateRequests([]);
      });
  }

  function refreshRequirementUpdateRequests() {
    return listPendingRequirementUpdateRequests()
      .then((res) => setRequirementUpdateRequests(res.items))
      .catch((err) => {
        console.error("requirement update request fetch error:", err);
        setRequirementUpdateRequests([]);
      });
  }

  function refreshAdminSnapshot() {
    return getCurrentUserMemberSnapshot()
      .then((snapshot) => setAdminSnapshot(snapshot ?? null))
      .catch((err) => {
        console.error("admin snapshot fetch error:", err);
        setAdminSnapshot(null);
      });
  }

  function refreshMembers() {
    if (isAdmin()) {
      return Promise.all([
        refreshApprovedMembers(),
        refreshAllMembers(),
        refreshRequirementUpdateRequests(),
        refreshMyRequirementUpdateRequests(),
        refreshAdminSnapshot(),
      ]);
    }

    setApprovedMembers([]);
    setRequirementUpdateRequests([]);
    setAdminSnapshot(null);

    return Promise.all([
      refreshAllMembers(),
      refreshMyRequirementUpdateRequests(),
    ]);
  }

  //listMemberSnapshots is a GET Request
  //gives back at least 1 member and at most 50 members
  useEffect(() => {
    document.title = "PHCF Platform";

    if (!isAuthenticated) {
      setAllMembers([]);
      return;
    }

    refreshMembers();
  }, [isAuthenticated]);

  //filters the already-loaded members as the user types, so the table
  //updates immediately without waiting on a network request
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allMembers;

    return allMembers.filter((record) => {
      const firstName = record.personal_info?.firstName?.toLowerCase() ?? "";
      const lastName = record.personal_info?.lastName?.toLowerCase() ?? "";
      return firstName.includes(q) || lastName.includes(q);
    });
  }, [allMembers, query]);

  function handleLogout() {
    logout();
    setIsAuthenticated(false);
  }

  async function handleMySnapshotClick() {
    if (adminSnapshot?.id) {
      navigate(`/snapshot/${adminSnapshot.id}`);
      return;
    }

    try {
      const snapshot = await getOrCreateCurrentUserMemberSnapshot();
      setAdminSnapshot(snapshot);
      navigate(`/snapshot/${snapshot.id}`);
    } catch (err) {
      console.error("admin snapshot create/fetch error:", err);
    }
  }

  const signedInUser = currentUser();
  const signedInEmail = signedInUser?.email ?? "";
  const signedInName = String(signedInUser?.name ?? "").trim();
  const currentIsAdmin = isAdmin();
  const adminSnapshotName = currentIsAdmin
    ? [
        adminSnapshot?.personal_info?.firstName,
        adminSnapshot?.personal_info?.lastName,
      ]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .join(" ")
    : "";
  const displayName = adminSnapshotName || signedInName;
  const signedInLabel = displayName
    ? `${displayName} (${signedInEmail})`
    : signedInEmail;
  const currentMember = allMembers[0];

  if (!isAuthenticated) {
    return (
      <section className="auth-panel home-panel">
        <h1 className="home-title">
          <span className="home-title-name">
            Prospect Heights Community Farm
          </span>
          <span className="home-title-subtitle">Membership Platform</span>
        </h1>
        <p className="home-blurb">
          Welcome new and returning members! Check your membership standing,
          track your work/volunteer hours, and request to join a box waitlist on
          our platform. New members: you may register after attending your first
          general meeting.
        </p>
        <div className="button-row">
          <Link className="button-link" to="/register">
            Register
          </Link>
          <Link className="button-link" to="/login">
            Log in
          </Link>
        </div>
      </section>
    );
  }

  return (
    <>
      <Header
        currUser={currentUser()}
        title="PHCF Membership Platform"
        showBack={false}
        signedInLabel={signedInLabel}
        handleLogout={handleLogout}
      >
        <Link className="button-link secondary" to="/box-info">
          Box Info
        </Link>

        {currentIsAdmin && (
          <button
            className="secondary"
            onClick={handleMySnapshotClick}
            type="button"
          >
            My Info
          </button>
        )}
      </Header>

      {currentIsAdmin ? (
        <>
          <nav className="admin-view-nav">
            {ADMIN_VIEWS.map((view) => (
              <button
                key={view.id}
                type="button"
                className={
                  "admin-view-nav-item" +
                  (selectedView === view.id ? " active" : "")
                }
                onClick={() => {
                  if (view.id === "member-progress") {
                    handleMyProgressClick();
                  } else {
                    setSelectedView(view.id);
                  }
                }}
              >
                {view.label}
              </button>
            ))}
          </nav>

          {selectedView === "members" && (
            <>
              {/* Search */}
              <Box
                sx={{ display: "flex", flexWrap: "wrap", bgcolor: "primary" }}
              >
                <Box sx={{ width: "100%", p: 3 }}>
                  <FormControl fullWidth>
                    <InputLabel htmlFor={`${outlinedAmountId}-input`}>
                      Search
                    </InputLabel>
                    <OutlinedInput
                      id={`${outlinedAmountId}-input`}
                      sx={{ backgroundColor: "white" }}
                      startAdornment={
                        <InputAdornment position="start">
                          <SearchIcon />
                        </InputAdornment>
                      }
                      label="Search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </FormControl>
                </Box>
              </Box>

              <MemberTable members={items} work_formulas={workFormulas} />
            </>
          )}

          {selectedView === "requests" && (
            <RequirementUpdateRequestTable
              requests={requirementUpdateRequests}
              onActionComplete={refreshMembers}
            />
          )}

          {selectedView === "member-progress" && adminSnapshot && (
            <MemberPersonalView
              member={adminSnapshot}
              requests={myRequirementUpdateRequests}
              onRequestSubmitted={refreshMembers}
              isAdmin={currentIsAdmin}
            />
          )}
        </>
      ) : currentMember ? (
        <MemberPersonalView
          member={currentMember}
          requests={myRequirementUpdateRequests}
          onRequestSubmitted={refreshMembers}
          isAdmin={currentIsAdmin}
        />
      ) : (
        <p className="muted">No member snapshot found.</p>
      )}

      <br />
      {currentIsAdmin && (
        <div className="fab-container">
          <button className="fab" onClick={handleExportMembers} type="button">
            Export Members CSV →
          </button>

          <a
            className="fab"
            href={`${config.pbUrl}/_/`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open DB View →
          </a>
        </div>
      )}
    </>
  );
}
