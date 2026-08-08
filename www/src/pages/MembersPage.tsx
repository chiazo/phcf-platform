import { useEffect, useMemo, useState, useId } from "react";
import { Link } from "react-router-dom";

import {
  currentUser,
  isAdmin,
  isLoggedIn,
  listMemberSnapshots,
  logout,
  listApprovalUpdates,
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

function MemberPersonalView({ member }: { member: Record<string, any> }) {
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

export default function MembersPage() {
  //holds all of the members fetched from the server
  const [allMembers, setAllMembers] = useState<Array<Record<string, any>>>([]);
  const [approvedMembers, setApprovedMembers] = useState<
    Array<Record<string, any>>
  >([]);
  const [query, setQuery] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(isLoggedIn());
  const outlinedAmountId = useId();

  function refreshApprovedMembers() {
    return listApprovalUpdates()
      .then((res) => {
        setApprovedMembers(res.items);
      })
      .catch((err) => {
        console.error("member fetch error:", err);
        setApprovedMembers([]);
      });
  }

  function refreshAllMembers() {
    return listMemberSnapshots()
      .then((res) => setAllMembers(res.items))
      .catch((err) => {
        console.error("member fetch error:", err);
        setAllMembers([]);
      });
  }

  function refreshMembers() {
    if (isAdmin()) {
      return Promise.all([refreshApprovedMembers(), refreshAllMembers()]);
    }

    setApprovedMembers([]);
    return refreshAllMembers();
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

  const signedInUser = currentUser();
  const signedInEmail = signedInUser?.email ?? "";
  const signedInName = String(signedInUser?.name ?? "").trim();
  const signedInLabel = signedInName
    ? `${signedInName} (${signedInEmail})`
    : signedInEmail;
  const currentIsAdmin = isAdmin();
  const currentMember = allMembers[0];

  if (!isAuthenticated) {
    return (
      <section className="auth-panel home-panel">
        <h1 className="home-title">
          <span className="home-title-name">Prospect Heights Community Farm</span>
          <span className="home-title-subtitle">Membership Platform</span>
        </h1>
        <p className="home-blurb">
          Welcome new and returning members! Check your membership standin, track your work/volunteer hours, and
          request to join a box waitlist on our platform. New members: you may
          register after attending your first general meeting.
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
              </>
            )}
          </div>
        </div>
        <button className="secondary" onClick={handleLogout} type="button">
          Log out
        </button>
      </div>

      {currentIsAdmin ? (
        <>
          <Box sx={{ display: "flex", flexWrap: "wrap", bgcolor: "primary" }}>
            <div>
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
            </div>
          </Box>

          <MemberTable members={items} />

          <ModalTable members={approvedMembers} onActionComplete={refreshMembers} />
        </>
      ) : currentMember ? (
        <MemberPersonalView member={currentMember} />
      ) : (
        <p className="muted">No member snapshot found.</p>
      )}

      <br />
      {currentIsAdmin && (
        <a
          className="fab"
          href={`${config.pbUrl}/_/`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open DB View →
        </a>
      )}
    </>
  );
}
