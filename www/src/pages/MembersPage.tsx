import { useEffect, useMemo, useState, useId } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  currentUser,
  getCurrentUserMemberSnapshot,
  getOrCreateCurrentUserMemberSnapshot,
  isAdmin,
  isLoggedIn,
  listMemberSnapshots,
  logout,
  listApprovalUpdates,
  listPendingRequirementUpdateRequests,
  listMyRequirementUpdateRequests,
  submitRequirementUpdateRequest,
  approveRequirementUpdateRequest,
  denyRequirementUpdateRequest,
  RequirementUpdateRequestType,
  correspondingWorkFormulas,
  exportMembersCSV,
} from "../lib/pocketbase";
import { config } from "../lib/config";

import Box from "@mui/material/Box";
import OutlinedInput from "@mui/material/OutlinedInput";
import InputLabel from "@mui/material/InputLabel";
import InputAdornment from "@mui/material/InputAdornment";
import FormControl from "@mui/material/FormControl";
import SearchIcon from "@mui/icons-material/Search";

import AdminStatusButton from "../components/AdminStatusButton";
import MemberTable from "../components/MemberTable";
import ModalTable from "../components/ModalTable";

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
  return type.toLowerCase().replace(/_/g, " ");
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

function getRequestMemberLabel(request: Record<string, any>) {
  const requester = request.expand?.user_id;
  return requester?.name || requester?.email || request.member_id || "—";
}

function todayInputValue() {
  return new Date().toISOString().split("T")[0];
}

function MemberPersonalView({
  member,
  requests,
  onRequestSubmitted,
}: {
  member: Record<string, any>;
  requests: Array<Record<string, any>>;
  onRequestSubmitted?: () => void;
}) {
  const personalInfo = member.personal_info ?? {};
  const memberInfo = member.member_info ?? {};
  const dues = memberInfo.dues ?? {};
  const requirements = memberInfo.requirements ?? {};
  const serviceRequirements = requirements.serviceRequirements ?? [];
  const address = personalInfo.address ?? {};
  const emailInfo = personalInfo.emailInfo ?? {};
  const phoneInfo = personalInfo.phoneInfo ?? {};

  const dueStatus = dues.dueState ?? "—";
  const duesPaid = dueStatus === "PAID" || dueStatus === "COMPLETE";
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
        notes: requestNotes,
      });

      setQuantity("");
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
        {requestMessage && (
          <p role="status" className="muted">
            {requestMessage}
          </p>
        )}
        <form className="form-grid" onSubmit={handleRequirementRequestSubmit}>
          <label>
            Update type
            <select
              value={requestType}
              onChange={(event) =>
                setRequestType(
                  event.target.value as RequirementUpdateRequestType,
                )
              }
            >
              <option value={RequirementUpdateRequestType.AMOUNT_PAID}>
                Amount paid
              </option>
              <option value={RequirementUpdateRequestType.SERVICE_HOURS}>
                Service hours
              </option>
              <option value={RequirementUpdateRequestType.MEETING_HOURS}>
                Meeting hours
              </option>
            </select>
          </label>
          <label>
            {requestType === RequirementUpdateRequestType.AMOUNT_PAID
              ? "Amount to add"
              : "Hours to add"}
            <input
              min="0"
              step="0.25"
              type="number"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              required
            />
          </label>
          {requestType === RequirementUpdateRequestType.AMOUNT_PAID && (
            <label>
              Payment type
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
          )}
          <label>
            Date completed or paid
            <input
              type="date"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
              required
            />
          </label>
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
              <td>{formatList(requirements.volunteerInterests)}</td>
            </tr>
          </tbody>
        </table>
        <p>
          <Link className="button-link secondary" to={`/snapshot/${member.id}`}>
            Edit (admin approval needed)
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
          <tbody>
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
  async function handleApprove(request: Record<string, any>) {
    await approveRequirementUpdateRequest(request);
    onActionComplete();
  }

  async function handleDeny(request: Record<string, any>) {
    await denyRequirementUpdateRequest(request);
    onActionComplete();
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
    <section>
      <h2>Membership Requirement Update Requests</h2>
      <div className="modal-table-wrapper always-visible-table">
        <table>
          <thead>
            <tr>
              <th>Member</th>
              <th>Type</th>
              <th>Amount/Hours</th>
              <th>Payment Type</th>
              <th>Date</th>
              <th>Notes</th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id}>
                <td>{getRequestMemberLabel(request)}</td>
                <td>{formatRequestType(request.request_type)}</td>
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
  const [adminSnapshot, setAdminSnapshot] = useState<Record<
    string,
    any
  > | null>(null);

  async function refreshApprovedMembers() {
    try {
      const res = await listApprovalUpdates();
      setApprovedMembers(res.items);;
    } catch (err) {
      console.error("member fetch error:", err);
      setApprovedMembers([]);
    }
  }

   async function memberWorkFormulas(members: Array<Record<string, any>>){
   try {
      const res = await correspondingWorkFormulas(members);
      return setAllFormulas(res.items);
    } catch (err) {
      console.error("work formula fetch error:", err);
      setAllMembers([]);
    }
  }

  function refreshAllMembers() {
    return listMemberSnapshots()
      .then((res) => {
        setAllMembers(res.items)
        memberWorkFormulas(res.items)
        console.log(workFormulas)
      })
      .catch((err) => {
        console.error("member fetch error:", err);
        setAllMembers([]);
      });
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
      .then((res) => setAllMembers(res.items))
      .catch((err) => {
        console.error("requirement update request fetch error:", err);
        setRequirementUpdateRequests([]);
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

  function refreshMyRequirementUpdateRequests() {
    return listMyRequirementUpdateRequests()
      .then((res) => setMyRequirementUpdateRequests(res.items))
      .catch((err) => {
        console.error("my requirement update request fetch error:", err);
        setMyRequirementUpdateRequests([]);
      });
  }

  function refreshMembers() {
    if (isAdmin()) {
      return Promise.all([
        refreshApprovedMembers(),
        refreshAllMembers(),
        refreshRequirementUpdateRequests(),
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
      <div className="page-header">
        <div>
          <h1>PHCF Membership Platform</h1>
          <p className="muted signed-in-line">
            Signed in as {signedInLabel}
            <AdminStatusButton />
          </p>
          <div id="navigation-buttons">
            <Link className="button-link secondary" to="/box-info">
              Box Info
            </Link>
            {currentIsAdmin && (
              <>
                <Link className="button-link secondary" to="/work-formula">
                  Work Formulas
                </Link>
                <Link className="button-link secondary" to="/legacy-snapshots">
                  Legacy Snapshots
                </Link>
                <Link className="button-link secondary" to="/admin">
                  Admin access
                </Link>
                <button
                  className="secondary"
                  onClick={handleMySnapshotClick}
                  type="button"
                >
                  My Info
                </button>
              </>
            )}
          </div>
          {!currentIsAdmin && (
            <p className="muted">
              Welcome! Check your membership status and log requirements if
              needed. An admin will approve and update your info as soon as
              possible.
            </p>
          )}
        </div>
        <button
          className="secondary page-logout-button"
          onClick={handleLogout}
          type="button"
        >
          Log out
        </button>
      </div>

      {currentIsAdmin ? (
        <>
          <Box sx={{ display: "flex", flexWrap: "wrap", bgcolor: "primary" }}>
            <Box sx={{ width: { xs: "100%", sm: 420, md: 560 } }}>
              <FormControl fullWidth sx={{ m: 1 }}>
                <InputLabel htmlFor={`${outlinedAmountId}-input`}>
                  Search
                </InputLabel>
                <OutlinedInput
                  id={`${outlinedAmountId}-input`}
                  startAdornment={
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  }
                  label="Search"
                  onChange={(e) => setQuery(e.target.value)}
                />
              </FormControl>
            </Box>
          </Box>

          <MemberTable members={items} work_formulas={workFormulas} />

          <RequirementUpdateRequestTable
            requests={requirementUpdateRequests}
            onActionComplete={refreshMembers}
          />

          <ModalTable
            members={approvedMembers}
            onActionComplete={refreshMembers}
          />
        </>
      ) : currentMember ? (
        <MemberPersonalView
          member={currentMember}
          requests={myRequirementUpdateRequests}
          onRequestSubmitted={refreshMembers}
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
