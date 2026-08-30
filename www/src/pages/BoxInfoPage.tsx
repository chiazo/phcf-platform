import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  currentUser,
  isAdmin,
  isLoggedIn,
  listBoxes,
  listMembersForBoxRequest,
  addToBoxWaitlist,
  removeMemberFromBox,
  removeMemberFromWaitlist,
  logout,
} from "../lib/pocketbase";
import AdminStatusButton from "../components/AdminStatusButton";

export default function BoxInfoPage() {
  const [allBoxes, setAllBoxes] = useState<Array<Record<string, any>>>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(isLoggedIn());
  const [loadError, setLoadError] = useState<string | null>(null);
  const currUser = currentUser();

  // Admin request modal
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [members, setMembers] = useState<Array<Record<string, any>>>([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [selectedBox, setSelectedBox] = useState("");
  const [requestingBox, setRequestingBox] = useState(false);

  // Prevent duplicate remove requests
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  async function refreshBoxes() {
    const res = await listBoxes();
    const currUserName = currUser?.name || "no-name";

    setAllBoxes(
      [...res.items].sort((a, b) => {
        const aHasUser = a.box_members_names.includes(currUserName);
        const bHasUser = b.box_members_names.includes(currUserName);

        return Number(bHasUser) - Number(aHasUser);
      }),
    );
  }

  useEffect(() => {
    document.title = "PHCF Platform";

    if (!isAuthenticated) {
      setAllBoxes([]);
      return;
    }

    refreshBoxes().catch((err) => {
      console.error("box fetch error:", err);
      setLoadError("Could not load boxes.");
      setAllBoxes([]);
    });
  }, [isAuthenticated]);

  function handleLogout() {
    logout();
    setIsAuthenticated(false);
  }

  async function handleRequestBox() {
    setLoadError(null);

    // --------------------------------------------------
    // Regular member: request a box for themselves
    // --------------------------------------------------
    if (!isAdmin()) {
      try {
        await addToBoxWaitlist(allBoxes);
        await refreshBoxes();
      } catch (err) {
        console.error("request box error:", err);
        setLoadError(
          err instanceof Error ? err.message : "Could not request a box.",
        );
      }

      return;
    }

    // --------------------------------------------------
    // Admin: choose which member should request a box
    // --------------------------------------------------
    try {
      const memberRecords = await listMembersForBoxRequest();

      setMembers(memberRecords);
      setSelectedMemberId("");
      setSelectedBox("");
      setRequestModalOpen(true);
    } catch (err) {
      console.error("member fetch error:", err);
      setLoadError("Could not load members.");
    }
  }

  async function handleAdminRequestBox() {
    if (!selectedMemberId) {
      setLoadError("Please select a member.");
      return;
    }

    if (!selectedBox) {
      setLoadError("Please select a box.");
      return;
    }

    setRequestingBox(true);
    setLoadError(null);

    try {
      await addToBoxWaitlist(allBoxes, selectedMemberId, selectedBox);

      await refreshBoxes();

      setRequestModalOpen(false);
      setSelectedMemberId("");
      setSelectedBox("");
    } catch (err) {
      console.error("admin request box error:", err);
      setLoadError(
        err instanceof Error ? err.message : "Could not request a box.",
      );
    } finally {
      setRequestingBox(false);
    }
  }

  async function handleRemoveFromBox(memberId: string) {
    if (!isAdmin()) return;

    const confirmed = window.confirm(
      "Remove this member from their current box?",
    );

    if (!confirmed) return;

    setRemovingMemberId(memberId);
    setLoadError(null);

    try {
      await removeMemberFromBox(memberId);
      await refreshBoxes();
    } catch (err) {
      console.error("remove from box error:", err);
      setLoadError(
        err instanceof Error ? err.message : "Could not remove member.",
      );
    } finally {
      setRemovingMemberId(null);
    }
  }

  async function handleRemoveFromWaitlist(memberId: string) {
    if (!isAdmin()) return;

    const confirmed = window.confirm(
      "Remove this member from the box waitlist?",
    );

    if (!confirmed) return;

    setRemovingMemberId(memberId);
    setLoadError(null);

    try {
      await removeMemberFromWaitlist(memberId);
      await refreshBoxes();
    } catch (err) {
      console.error("remove from waitlist error:", err);
      setLoadError(
        err instanceof Error
          ? err.message
          : "Could not remove member from waitlist.",
      );
    } finally {
      setRemovingMemberId(null);
    }
  }

  if (!isAuthenticated) {
    return (
      <section className="auth-panel">
        <h1>Box Info</h1>

        <p>Register or log in to view box assignments.</p>

        <div className="button-row">
          <Link className="button-link" to="/register">
            Register
          </Link>

          <Link className="button-link secondary" to="/login">
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
          <h1>Box Info</h1>

          <p className="muted signed-in-line">
            Signed in as {currUser?.email}
            <AdminStatusButton />
          </p>

          <div id="navigation-buttons">
            <Link className="button-link secondary" to="/">
              ← Back to Members
            </Link>

            {isAdmin() && (
              <>
                <Link className="button-link secondary" to="/work-formula">
                  Work Formulas
                </Link>

                <Link className="button-link secondary" to="/admin">
                  Admin access
                </Link>
              </>
            )}

            <button
              id="requestBoxButton"
              className="secondary"
              onClick={handleRequestBox}
              type="button"
            >
              Request a Box
            </button>
          </div>
        </div>

        <button
          className="secondary page-logout-button"
          onClick={handleLogout}
          type="button"
        >
          Log out
        </button>
      </div>

      {loadError && <p className="error">{loadError}</p>}

      {allBoxes.length === 0 && !loadError ? (
        <p className="muted">No boxes found.</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Box Name</th>
                <th>Box Number</th>
                <th>Status</th>
                <th>Members</th>
                <th>Waitlist</th>
                <th>Updated By</th>
                {/* <th>Notes</th> */}
                {isAdmin() && <th>Actions</th>}
              </tr>
            </thead>

            <tbody>
              {allBoxes.map((box) => {
                const boxMembers = Array.isArray(box.box_members)
                  ? box.box_members
                  : [];

                const waitlist = Array.isArray(box.waitlist)
                  ? box.waitlist
                  : [];

                const isCurrentUserBox = box.box_members_names.includes(
                  currUser?.name,
                );
                return (
                  <tr
                    key={box.id}
                    className={isCurrentUserBox ? "current-user-box" : ""}
                  >
                    <td>{box.box_name || "—"}</td>

                    <td>{box.box_number}</td>

                    <td>
                      <span className="badge">
                        {boxMembers.length === 0 ? "UNASSIGNED" : "ASSIGNED"}
                      </span>
                    </td>

                    <td>
                      {box.box_members_names?.length
                        ? box.box_members_names.join(", ")
                        : "—"}
                    </td>

                    <td>
                      {box.waitlist_names?.length
                        ? box.waitlist_names
                            .map((entry: { name: string }) => entry.name)
                            .join(", ")
                        : "—"}
                    </td>

                    <td>{box.updated_by || "—"}</td>

                    {isAdmin() && (
                      <td>
                        <div className="button-row">
                          {boxMembers.map((memberId: string, index: number) => {
                            const isRemoving = removingMemberId === memberId;
                            const memberName =
                              box.box_members_names?.[index] || memberId;

                            return (
                              <button
                                key={`remove-box-${memberId}`}
                                type="button"
                                className="box-action-button"
                                disabled={isRemoving}
                                onClick={() => handleRemoveFromBox(memberId)}
                              >
                                {isRemoving
                                  ? "Removing..."
                                  : `Remove ${memberName.split(" ")[0]} ${memberName.split(" ").at(-1)?.[0] ?? ""}.`}
                              </button>
                            );
                          })}

                          {waitlist.map(
                            (
                              entry: {
                                member_id: string;
                                join_date?: number;
                                position: number;
                              },
                              index: number,
                            ) => {
                              const isRemoving =
                                removingMemberId === entry.member_id;
                              const memberName =
                                box.waitlist_names?.[index]?.name ||
                                entry.member_id;

                              return (
                                <button
                                  key={`remove-waitlist-${entry.member_id}`}
                                  type="button"
                                  className="box-action-button"
                                  disabled={isRemoving}
                                  onClick={() =>
                                    handleRemoveFromWaitlist(entry.member_id)
                                  }
                                >
                                  {isRemoving
                                    ? "Removing..."
                                    : `Remove ${memberName.split(" ")[0]} ${memberName.split(" ").at(-1)?.[0] ?? ""}.`}
                                </button>
                              );
                            },
                          )}

                          {boxMembers.length === 0 && waitlist.length === 0 && (
                            <span className="muted">No actions</span>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* =========================================================
          Admin: Request Box Modal
          ========================================================= */}
      {requestModalOpen && (
        <div
          className="modal"
          style={{ display: "block" }}
          onClick={() => setRequestModalOpen(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Request a Box</h2>

            <p>Select the member who should be added to the waitlist.</p>

            <select
              value={selectedMemberId}
              onChange={(e) => setSelectedMemberId(e.target.value)}
            >
              <option value="">Select a member...</option>

              {members.map((member) => {
                const user = member.expand?.user_id;

                return (
                  <option key={member.id} value={member.id}>
                    {user?.name || user?.email || member.id}
                  </option>
                );
              })}
            </select>
            <p>Select the box you'd like to add them to.</p>

            <select
              value={selectedBox}
              onChange={(e) => setSelectedBox(e.target.value)}
            >
              <option value="">Select a box...</option>

              {allBoxes.map((box) => {
                return (
                  <option key={box.id} value={box.id}>
                    Box #{box.box_number} - {box.box_name}
                  </option>
                );
              })}
            </select>

            <div className="button-row">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setRequestModalOpen(false);
                  setSelectedMemberId("");
                }}
                disabled={requestingBox}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleAdminRequestBox}
                disabled={!selectedMemberId || requestingBox}
              >
                {requestingBox ? "Requesting..." : "Request Box"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
