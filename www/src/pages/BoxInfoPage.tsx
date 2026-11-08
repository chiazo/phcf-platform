import { useEffect, useState, Fragment } from "react";
import { Link } from "react-router-dom";

import {
  currentUser,
  isAdmin,
  isLoggedIn,
  listBoxes,
  memberDisplayName,
  listMembersForBoxRequest,
  setBoxCapacity,
  addToBoxWaitlist,
  removeMemberFromBox,
  removeMemberFromWaitlist,
  assignWaitlistedMemberToBox,
  listBoxWaitlist,
  hasRoom,
  boxCapacity,
  countEntries,
  moveMemberToBox,
  swapMembers,
  logout, createBox, deleteBox, updateBoxName
} from "../lib/pocketbase";
import Header from "../components/Header";

export default function BoxInfoPage() {
  const [allBoxes, setAllBoxes] = useState<Array<Record<string, any>>>([]);
  const [waitlist, setWaitlist] = useState<Array<Record<string, any>>>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(isLoggedIn());
  const currUser = currentUser();

  // User box request settings
  const [memberRequestOpen, setMemberRequestOpen] = useState(false);
  const [memberWants, setMemberWants] = useState<"HALF" | "WHOLE">("HALF");
  const [memberRequesting, setMemberRequesting] = useState(false);

  // Admin request modal
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [members, setMembers] = useState<Array<Record<string, any>>>([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [requestingBox, setRequestingBox] = useState(false);

  // Prevent duplicate remove requests
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  // Handle box swaps
  const [moveTarget, setMoveTarget] = useState<{
    memberId: string;
    name: string;
    fromBoxId: string;
  } | null>(null);
  const [requestWants, setRequestWants] = useState<"HALF" | "WHOLE">("HALF");
  const [swapWith, setSwapWith] = useState("");
  const [moveToBoxId, setMoveToBoxId] = useState("");
  const [moving, setMoving] = useState(false);
  const [showMoveButtons, setShowMoveButtons] = useState(false);

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
    hasRoom
  );

  const hasFullyEmptyBox = allBoxes.some(
    (b: any) => countEntries(b.box_members) === 0,
  );

  const unavailableMemberIds = new Set<string>([
    ...(requestWants === "WHOLE"
      ? allBoxes
        .filter((box: any) => boxCapacity(box) === 1)
        .flatMap((box: any) => box.box_members ?? [])
      : allBoxes.flatMap((box: any) => box.box_members ?? [])),
    ...waitlist.map((e: any) => e.member_id),
  ]);


  async function handleToggleCapacity(box: Record<string, any>) {
    if (!isAdmin()) return;

    setActionError(null);
    setActionNotice(null);

    try {
      await setBoxCapacity(box.id, boxCapacity(box) === 2 ? 1 : 2);
      setActionNotice(`Box ${box.box_number} capacity updated.`);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not change capacity.",
      );
    } finally {
      await refreshSafely();
    }
  }

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
    const [res, waitlistRes] = await Promise.all([
      listBoxes(),
      listBoxWaitlist(),
    ]);
    const currUserName = currUser?.name || "no-name";

    setWaitlist(waitlistRes);
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
      setWaitlist([]);
      return;
    }

    refreshBoxes().catch((err) => {
      console.error("box fetch error:", err);
      setActionError("Could not load boxes.");
      setAllBoxes([]);
      setWaitlist([]);
    });
  }, [isAuthenticated]);

  function handleLogout() {
    logout();
    setIsAuthenticated(false);
  }

  async function handleMoveBox() {
    if (!isAdmin() || !moveTarget || (!moveToBoxId && !swapWith)) return;

    setMoving(true);
    setActionError(null);
    setActionNotice(null);

    try {
      if (swapWith) {
        // swapWith is "boxId:memberId"
        const [otherBoxId, otherMemberId] = swapWith.split(":");
        const otherBox = allBoxes.find((b: any) => b.id === otherBoxId);
        const otherName =
          otherBox?.box_members_names?.[
          (otherBox.box_members ?? []).indexOf(otherMemberId)
          ] || "another member";

        await swapMembers(
          moveTarget.memberId,
          moveTarget.fromBoxId,
          otherMemberId,
          otherBoxId,
        );
        setActionNotice(`${moveTarget.name} and ${otherName} swapped boxes.`);
      } else {
        const box = await moveMemberToBox(
          moveTarget.memberId,
          moveTarget.fromBoxId,
          moveToBoxId,
        );
        setActionNotice(
          box?.box_name
            ? `${moveTarget.name} was moved to ${box.box_name} (Box ${box.box_number}).`
            : `${moveTarget.name} was moved.`,
        );
      }

      setMoveTarget(null);
      setMoveToBoxId("");
      setSwapWith("");
    } catch (err) {
      console.error("move box error:", err);
      setActionError(
        err instanceof Error ? err.message : "Could not move member.",
      );
    } finally {
      await refreshSafely();
      setMoving(false);
    }
  }

  async function handleRequestBox() {
    setActionError(null);

    // --------------------------------------------------
    // Regular member: request a box for themselves
    // --------------------------------------------------
    if (!isAdmin()) {
      setMemberWants("HALF");
      setMemberRequestOpen(true);
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
      setActionError("Could not load members.");
    }
  }

  const [addBoxOpen, setAddBoxOpen] = useState(false);
  const [newBoxName, setNewBoxName] = useState("");
  const [newBoxNumber, setNewBoxNumber] = useState("");
  const [addBoxError, setAddBoxError] = useState<string | null>(null);
  const [savingBox, setSavingBox] = useState(false);
  const [decommissioningBoxId, setDecommissioningBoxId] = useState<
    string | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [requestingMemberId, setRequestingMemberId] = useState<string | null>(
    null,
  );
  const [editingBox, setEditingBox] = useState<any | null>(null);
  const isEditingBox = editingBox !== null;

  async function handleSaveBox() {
    if (!isAdmin()) return;

    const name = newBoxName.trim();
    const number = Number(newBoxNumber);

    if (!name) {
      setAddBoxError("Enter a box name.");
      return;
    }

    if (
      !isEditingBox &&
      (!Number.isInteger(number) || number <= 0)
    ) {
      setAddBoxError("Enter a positive whole box number.");
      return;
    }

    setSavingBox(true);
    setAddBoxError(null);
    setActionError(null);
    setActionNotice(null);

    try {
      if (editingBox) {
        await updateBoxName(editingBox.id, name);

        setActionNotice(
          `Box ${editingBox.box_number} was renamed to ${name}.`,
        );
      } else {
        await createBox(name, number);

        setActionNotice(`${name} (Box ${number}) was added.`);
      }

      setAddBoxOpen(false);
      setEditingBox(null);
      setNewBoxName("");
      setNewBoxNumber("");
    } catch (err) {
      console.error("save box error:", err);

      setAddBoxError(
        err instanceof Error ? err.message : "Could not save box.",
      );
    } finally {
      await refreshSafely();
      setSavingBox(false);
    }
  }

  const handleRenameBox = (box: any) => {
    setEditingBox(box);
    setNewBoxName(box.box_name);
    setNewBoxNumber(String(box.box_number));
    setAddBoxError("");
    setAddBoxOpen(true);
  };

  async function handleDecommissionBox(box: Record<string, any>) {
    if (!isAdmin()) return;

    const label = `${box.box_name} (Box ${box.box_number})`;
    if (
      !window.confirm(
        `Permanently remove ${label}? This deletes the box and can't be undone.`,
      ))
      return;

    setDecommissioningBoxId(box.id);
    setActionError(null);
    setActionNotice(null);

    try {
      await deleteBox(box.id);
      setActionNotice(
        `${label} was permanently removed.`,
      );
    } catch (err) {
      console.error("decommission box error:", err);
      setActionError(
        err instanceof Error ? err.message : "Could not decommission box.",
      );
    } finally {
      await refreshSafely();
      setDecommissioningBoxId(null);
    }
  }

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
      await refreshSafely();
      setRequestingMemberId(null);
    }
  }

  async function handleMemberRequestBox() {
    setMemberRequesting(true);
    setActionError(null);
    setActionNotice(null);

    try {
      // memberId omitted: the function resolves the logged-in member itself
      const result = await addToBoxWaitlist(allBoxes, undefined, memberWants);

      // A box record has box_members; a waitlist record does not
      setActionNotice(
        result.box_members
          ? `You were assigned to ${result.box_name} (Box ${result.box_number}).`
          : memberWants === "WHOLE"
            ? "You were added to the waitlist for a whole box."
            : "You were added to the end of the waitlist.",
      );
      setMemberRequestOpen(false);
    } catch (err) {
      console.error("member request box error:", err);
      setActionError(
        err instanceof Error ? err.message : "Could not request a box.",
      );
      setMemberRequestOpen(false);
    } finally {
      await refreshSafely();
      setMemberRequesting(false);
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
      // CHANGED: pass the half/whole choice
      const box = await addToBoxWaitlist(allBoxes, selectedMemberId, requestWants);
      const selectedMember = members.find((m) => m.id === selectedMemberId);
      const selectedName =
        memberDisplayName(selectedMember) || selectedMemberId;
      const openBox = allBoxes.find((b: any) => hasRoom(b));
      setActionNotice(
        box.box_members?.includes(selectedMemberId)
          ? `${selectedName} was assigned to ${box.box_name} (Box ${box.box_number}).`
          : requestWants === "WHOLE"
            ? // CHANGED: whole requests always join the queue
            `${selectedName} was added to the end of the waitlist for a whole box.`
            : openBox
              ? `${openBox.box_name} (Box ${openBox.box_number}) is open, but others are already waiting. ${selectedName} was added to the end of the waitlist.`
              : `No empty box available. ${selectedName} was added to the end of the waitlist.`,
      );

      setRequestModalOpen(false);
      setSelectedMemberId("");
      setRequestWants("HALF"); // CHANGED: reset the selector
    } catch (err) {
      console.error("admin request box error:", err);
      setActionError(
        err instanceof Error ? err.message : "Could not request a box.",
      );
    } finally {
      await refreshSafely();
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
    setActionError(null);

    try {
      await removeMemberFromBox(memberId, boxId);
    } catch (err) {
      console.error("remove from box error:", err);
      setActionError(
        err instanceof Error ? err.message : "Could not remove member.",
      );
    } finally {
      await refreshSafely();
      setRemovingMemberId(null);
    }
  }

  async function handleRemoveFromWaitlist(memberId: string) {
    if (!isAdmin()) return;

    if (!window.confirm("Remove this member from the waitlist?")) return;

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
        handleToggleMove={() => setShowMoveButtons((v) => !v)}
        handleAddBox={() => {
          setEditingBox(null);
          setNewBoxName("");
          setNewBoxNumber("");
          setAddBoxOpen(true);
        }}
        moveMode={showMoveButtons}
      />


      {actionError && <p className="error">{actionError}</p>}
      {actionNotice && <p className="muted">{actionNotice}</p>}

      {allBoxes.length === 0 && !actionError ? (
        <p className="muted">No boxes found.</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Box Name</th>
                {isAdmin() && <th>Edit Name</th>}
                <th>Box Number</th>
                <th>Capacity</th>
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

                    {isAdmin() && (
                      <td>
                        <button
                          type="button"
                          className="box-action-rename-button"
                          onClick={() => handleRenameBox(box)}
                        >
                          Rename
                        </button>
                      </td>
                    )}

                    <td>{box.box_number}</td>

                    <td>
                      <span className="badge">
                        {boxMembers.length}/{boxCapacity(box)}
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
                              <Fragment key={`box-member-${memberId}`}>
                                {showMoveButtons && (
                                  <button
                                    type="button"
                                    className="box-action-button move-button"
                                    onClick={() => {
                                      setMoveToBoxId("");
                                      setSwapWith("");
                                      setMoveTarget({
                                        memberId,
                                        name: memberName,
                                        fromBoxId: box.id,
                                      });
                                    }}
                                  >
                                    {`Move ${memberName.split(" ")[0]} ${memberName.split(" ").at(-1)?.[0] ?? ""}.`}
                                  </button>
                                )}

                                <button
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

                              </Fragment>
                            );
                          })}

                          <button
                            type="button"
                            className="box-action-button"
                            onClick={() => handleToggleCapacity(box)}
                          >
                            {boxCapacity(box) === 2 ? "Reduce Capacity to 1" : "Allow Sharing"}
                          </button>

                          {boxMembers.length === 0 && (
                            <button
                              type="button"
                              className="box-action-button box-action-danger"
                              disabled={decommissioningBoxId === box.id}
                              onClick={() => handleDecommissionBox(box)}
                            >
                              {decommissioningBoxId === box.id ? "Removing box..." : "Permanently Remove Box"}
                            </button>
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
          <table>
            <thead>
              <tr>
                <th>Waitlist Rank</th>
                <th>Member</th>
                <th>Wants</th>
                <th>Current Box</th>
                <th>Join Date</th>
                {isAdmin() && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {waitlist.map((entry, index) => {
                const wantsWhole = entry.wants === "WHOLE";
                const currentBox = allBoxes.find((b: any) =>
                  (b.box_members ?? []).includes(entry.member_id),
                );

                return (
                  <tr key={entry.id}>
                    <td>{index + 1}</td>
                    <td>{formatName(entry.name)}</td>
                    <td>{wantsWhole ? "Whole Box" : "Half Box"}</td>
                    <td>{currentBox ? `Box ${currentBox.box_number}` : "—"}</td>
                    <td>{formatJoinDate(entry.join_date)}</td>

                    {isAdmin() && (
                      <td>
                        <button
                          type="button"
                          className="box-action-button"
                          disabled={removingMemberId === entry.member_id}
                          onClick={() => handleRemoveFromWaitlist(entry.member_id)}
                        >
                          {removingMemberId === entry.member_id
                            ? "Removing..."
                            : "Remove"}
                        </button>

                        <button
                          type="button"
                          className="box-action-button"
                          disabled={
                            (wantsWhole ? !hasFullyEmptyBox : !hasEmptyBox) ||
                            requestingMemberId !== null ||
                            removingMemberId === entry.member_id
                          }
                          title={
                            wantsWhole && !hasFullyEmptyBox
                              ? "No completely empty box available"
                              : !wantsWhole && !hasEmptyBox
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

      {/* =========================================================
          Normal User: Request Box Modal
          ========================================================= */}
      {memberRequestOpen && (
        <div
          className="modal modal-open"
          onClick={() => !memberRequesting && setMemberRequestOpen(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Request a Box</h2>

            <select
              value={memberWants}
              onChange={(e) => setMemberWants(e.target.value as "HALF" | "WHOLE")}
            >
              <option value="HALF">Half Box (Share)</option>
              <option value="WHOLE">Whole Box</option>
            </select>

            <p>
              {memberWants === "WHOLE"
                ? "You'll be added to the waitlist for a whole box. If you currently share a box, you keep it until a whole box is assigned to you."
                : "If a box has an open slot and nobody is waiting, you'll be assigned right away. Otherwise you'll be added to the end of the waitlist."}
            </p>

            <div className="button-row">
              <button
                type="button"
                className="secondary"
                onClick={() => setMemberRequestOpen(false)}
                disabled={memberRequesting}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleMemberRequestBox}
                disabled={memberRequesting}
              >
                {memberRequesting ? "Requesting..." : "Request Box"}
              </button>
            </div>
          </div>
        </div>
      )}

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

            <select
              value={requestWants}
              onChange={(e) => {
                setRequestWants(e.target.value as "HALF" | "WHOLE");
                setSelectedMemberId("");
              }}
            >
              <option value="HALF">Half Box (Share)</option>
              <option value="WHOLE">Whole Box</option>
            </select>

            <p>Select the member. If no box is open or others are waiting, they’ll be added to the end of the waitlist.</p>

            <select
              value={selectedMemberId}
              onChange={(e) => setSelectedMemberId(e.target.value)}
            >
              <option value="">Select a member...</option>

              {members
                .filter((member) => !unavailableMemberIds.has(member.id))
                .map((member) => {
                  return (
                    <option key={member.id} value={member.id}>
                      {memberDisplayName(member) || member.id}
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
                  setRequestWants("HALF");
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


      {/* =========================================================
    Admin: Add / Rename Box Modal
    ========================================================= */}
      {addBoxOpen && (
        <div className="modal modal-open" onClick={() => setAddBoxOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{isEditingBox ? "Rename Box" : "Add a Box"}</h2>

            {addBoxError && <p className="error">{addBoxError}</p>}

            <label>
              Box Name
              <input
                type="text"
                value={newBoxName}
                onChange={(e) => setNewBoxName(e.target.value)}
                disabled={savingBox}
              />
            </label>

            {!isEditingBox && (
              <label>
                Box Number
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={newBoxNumber}
                  onChange={(e) => setNewBoxNumber(e.target.value)}
                  disabled={savingBox}
                />
              </label>
            )}

            <div className="button-row">
              <button
                type="button"
                className="secondary"
                onClick={() => setAddBoxOpen(false)}
                disabled={savingBox}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSaveBox}
                disabled={savingBox}
              >
                {savingBox
                  ? isEditingBox
                    ? "Saving..."
                    : "Adding..."
                  : isEditingBox
                    ? "Save Changes"
                    : "Add Box"}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* =========================================================
          Admin: Move Boxes Modal
          ========================================================= */}
      {moveTarget && (
        <div className="modal modal-open" onClick={() => setMoveTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Move {moveTarget.name}</h2>

            <p>
              Select an open box, or swap with a member in another box. The
              waitlist is not affected.
            </p>

            <select
              value={moveToBoxId}
              onChange={(e) => {
                setMoveToBoxId(e.target.value);
                setSwapWith("");
              }}
            >
              <option value="">Move to an open box...</option>

              {allBoxes
                .filter(
                  (b: any) =>
                    b.id !== moveTarget.fromBoxId &&
                    hasRoom(b),
                )
                .map((b: any) => (
                  <option key={b.id} value={b.id}>
                    {b.box_name} (Box {b.box_number}) ·{" "}
                    {countEntries(b.box_members)}/{boxCapacity(b)}
                  </option>
                ))}
            </select>

            <select
              value={swapWith}
              onChange={(e) => {
                setSwapWith(e.target.value);
                setMoveToBoxId("");
              }}
            >
              <option value="">Or swap with a member...</option>

              {allBoxes
                .filter((b: any) => b.id !== moveTarget.fromBoxId)
                .flatMap((b: any) =>
                  (b.box_members ?? []).map((id: string, i: number) => (
                    <option key={`${b.id}:${id}`} value={`${b.id}:${id}`}>
                      {b.box_members_names?.[i] || id} · {b.box_name} (Box{" "}
                      {b.box_number})
                    </option>
                  )),
                )}
            </select>

            <div className="button-row">
              <button
                type="button"
                className="secondary"
                onClick={() => setMoveTarget(null)}
                disabled={moving}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleMoveBox}
                disabled={(!moveToBoxId && !swapWith) || moving}
              >
                {moving ? "Working..." : swapWith ? "Swap" : "Move"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
