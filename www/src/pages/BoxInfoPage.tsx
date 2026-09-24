import { useEffect, useState, useMemo } from "react";
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
  assignWaitlistedMemberToBox,
  countEntries,
  logout,
} from "../lib/pocketbase";
import Header from "../components/Header";

export default function BoxInfoPage() {
  const [allBoxes, setAllBoxes] = useState<Array<Record<string, any>>>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(isLoggedIn());
  const [loadError, setLoadError] = useState<string | null>(null);
  const currUser = currentUser();

  // Admin request modal
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [members, setMembers] = useState<Array<Record<string, any>>>([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [requestingBox, setRequestingBox] = useState(false);

  // Prevent duplicate remove requests
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  type WaitlistRow = {
    member_id: string;
    join_date?: number;
    position: number;
    name: string;
    box_ids: string[];
  };

  const formatName = (fullName: string) => {
    const parts = fullName.trim().split(" ");
    if (parts.length < 2) return fullName;
    return `${parts[0]} ${parts.at(-1)?.[0] ?? ""}.`;
  };

  const formatJoinDate = (joinDate?: number) => {
    if (!joinDate) return "-";

    // Treat small values as Unix seconds, larger ones as milliseconds
    const ms = joinDate < 1e12 ? joinDate * 1000 : joinDate;

    return new Date(ms).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const hasEmptyBox = allBoxes.some(
    (b: any) => countEntries(b.box_members) < 2,
  );

  const unavailableMemberIds = new Set<string>(
    allBoxes.flatMap((box: any) => [
      ...(box.box_members ?? []),
      ...(box.waitlist ?? []).map((e: any) => e.member_id),
    ]),
  );

  const waitlist: WaitlistRow[] = useMemo(() => {
    // Everyone who currently holds a box
    const boxHolders = new Set<string>(
      (allBoxes ?? []).flatMap((box: any) =>
        Array.isArray(box.box_members) ? box.box_members : [],
      ),
    );

    const rows = (allBoxes ?? [])
      .flatMap((box: any) =>
        (box.waitlist ?? []).map((entry: any, index: number) => ({
          ...entry,
          box_id: box.id,
          name: box.waitlist_names?.[index]?.name || entry.member_id,
        })),
      )
      // Skip anyone who already has a box
      .filter((row: any) => !boxHolders.has(row.member_id))
      .sort(
        (a: any, b: any) =>
          (a.join_date ?? Infinity) - (b.join_date ?? Infinity),
      );

    const byMember = new Map<string, WaitlistRow>();
    for (const row of rows) {
      const existing = byMember.get(row.member_id);
      if (existing) {
        existing.box_ids.push(row.box_id);
      } else {
        byMember.set(row.member_id, { ...row, box_ids: [row.box_id] });
      }
    }

    return Array.from(byMember.values());
  }, [allBoxes]);

  async function refreshSafely() {
    try {
      await refreshBoxes();
    } catch (err) {
      console.error("refresh error:", err);
      setActionError(
        "The change may have gone through, but the page could not refresh. Reload to see the latest data.",
      );
    }
  }

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
      setRequestModalOpen(true);
    } catch (err) {
      console.error("member fetch error:", err);
      setLoadError("Could not load members.");
    }
  }

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [requestingMemberId, setRequestingMemberId] = useState<string | null>(
    null,
  );

  async function handleAssignBoxFromTable(
    memberId: string,
    name: string,
    index: number,
  ) {
    if (!isAdmin()) return;

    const message =
      index > 0
        ? `Assign a box to ${name}? This skips ${index} member${index === 1 ? "" : "s"} who joined the waitlist earlier.`
        : `Assign a box to ${name}?`;

    if (!window.confirm(message)) return;

    setRequestingMemberId(memberId);
    setActionError(null);
    setActionNotice(null);

    try {
      const box = await assignWaitlistedMemberToBox(memberId);
      setActionNotice(
        box?.box_name
          ? `${name} was assigned to ${box.box_name} (Box ${box.box_number}).`
          : `Box assigned to ${name}.`,
      );
    } catch (err) {
      console.error("assign box error:", err);
      setActionError(
        err instanceof Error ? err.message : "Could not assign a box.",
      );
    } finally {
      await refreshBoxes();
      setRequestingMemberId(null);
    }
  }

  async function handleAdminRequestBox() {
    if (!selectedMemberId) {
      setActionError("Please select a member.");
      return;
    }

    setRequestingBox(true);
    setActionError(null);
    setActionNotice(null);

    try {
      const box = await addToBoxWaitlist(allBoxes, selectedMemberId);
      const selectedMember = members.find((m) => m.id === selectedMemberId);
      const selectedName =
        selectedMember?.expand?.user_id?.name ||
        selectedMember?.expand?.user_id?.email ||
        selectedMemberId;
      const openBox = allBoxes.find(
        (b: any) => countEntries(b.box_members) < 2,
      );
      setActionNotice(
        box.box_members?.includes(selectedMemberId)
          ? `${selectedName} was assigned to ${box.box_name} (Box ${box.box_number}).`
          : openBox
            ? `${openBox.box_name} (Box ${openBox.box_number}) is open, but others are already waiting. ${selectedName} was added to the end of the waitlist.`
            : `No empty box available. ${selectedName} was added to the end of the waitlist.`,
      );

      setRequestModalOpen(false);
      setSelectedMemberId("");
    } catch (err) {
      console.error("admin request box error:", err);
      setActionError(
        err instanceof Error ? err.message : "Could not request a box.",
      );
    } finally {
      await refreshBoxes();
      setRequestingBox(false);
    }
  }

  async function handleRemoveFromBox(memberId: string, boxId: string) {
    if (!isAdmin()) return;

    const confirmed = window.confirm(
      "Remove this member from their current box?",
    );

    if (!confirmed) return;

    setRemovingMemberId(memberId);
    setLoadError(null);

    try {
      await removeMemberFromBox(memberId, boxId);
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

    if (!window.confirm("Remove this member from the box waitlist?")) return;

    setRemovingMemberId(memberId);
    setActionError(null);
    setActionNotice(null);

    try {
      await removeMemberFromWaitlist(memberId);
      setActionNotice("Member removed from the waitlist.");
    } catch (err) {
      console.error("remove from waitlist error:", err);
      setActionError(
        err instanceof Error
          ? err.message
          : "Could not remove member from waitlist.",
      );
    } finally {
      await refreshSafely();
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
      <Header
        currUser={currUser}
        title="Box Info"
        handleLogout={handleLogout}
        handleRequestBox={handleRequestBox}
      />

      {loadError && <p className="error">{loadError}</p>}
      {actionError && <p className="error">{actionError}</p>}
      {actionNotice && <p className="muted">{actionNotice}</p>}

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
                        {boxMembers.length}/2
                        {/* {boxMembers.length === 0 ? "UNASSIGNED" : "ASSIGNED"} */}
                      </span>
                    </td>

                    <td>
                      {box.box_members_names?.length
                        ? box.box_members_names.join(", ")
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
                                onClick={() =>
                                  handleRemoveFromBox(memberId, box.id)
                                }
                              >
                                {isRemoving
                                  ? "Removing..."
                                  : `Remove ${memberName.split(" ")[0]} ${memberName.split(" ").at(-1)?.[0] ?? ""}.`}
                              </button>
                            );
                          })}

                          {boxMembers.length === 0 && (
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
      <br></br>
      {waitlist.length === 0 ? (
        <p className="muted">No one is on the waitlist currently!</p>
      ) : (
        <div className="table-wrapper">
          <table className="waitlist-table">
            <thead>
              <tr>
                <th>Waitlist Rank</th>
                <th>Member</th>
                <th>Join Date</th>
                {isAdmin() && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {waitlist.map((entry, index) => {
                return (
                  <tr key={`waitlist-${entry.member_id}`}>
                    <td>{index + 1}</td>
                    <td>{formatName(entry.name)}</td>
                    <td>{formatJoinDate(entry.join_date)}</td>

                    {isAdmin() && (
                      <td>
                        <button
                          type="button"
                          className="box-action-button"
                          disabled={removingMemberId === entry.member_id}
                          onClick={() =>
                            handleRemoveFromWaitlist(entry.member_id)
                          }
                        >
                          {removingMemberId === entry.member_id
                            ? "Removing..."
                            : "Remove"}
                        </button>

                        <button
                          type="button"
                          className="box-action-button"
                          disabled={
                            !hasEmptyBox ||
                            requestingMemberId !== null ||
                            removingMemberId === entry.member_id
                          }
                          title={
                            !hasEmptyBox
                              ? "No empty boxes available"
                              : undefined
                          }
                          onClick={() =>
                            handleAssignBoxFromTable(
                              entry.member_id,
                              formatName(entry.name),
                              index,
                            )
                          }
                        >
                          {requestingMemberId === entry.member_id
                            ? "Assigning..."
                            : "Assign Box"}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* {waitlist.map(
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
                          )} */}

      {/* =========================================================
          Admin: Request Box Modal
          ========================================================= */}
      {requestModalOpen && (
        <div
          className="modal modal-open"
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

              {members
                .filter((member) => !unavailableMemberIds.has(member.id))
                .map((member) => {
                  const user = member.expand?.user_id;

                  return (
                    <option key={member.id} value={member.id}>
                      {user?.name || user?.email || member.id}
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
