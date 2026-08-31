import { useState } from "react";

import { MemberType, MemberRole } from "../models/enums";
import {
  previewWorkFormulaBulkUpdate,
  applyWorkFormulaBulkUpdate,
  WorkFormulaCriteria,
} from "../lib/pocketbase";

interface Props {
  members: Array<Record<string, any>>; // from allFormulas, for the member override dropdown
  onApplied: () => void; // re-fetch the formula list after a successful apply
}

export default function AdminWorkFormulaMatrix({ members, onApplied }: Props) {
  const [memberType, setMemberType] = useState<string>("");
  const [boardStatus, setBoardStatus] = useState<string>("");
  const [boxSharing, setBoxSharing] = useState<string>("");
  const [memberId, setMemberId] = useState<string>("");

  const [workHoursRequired, setWorkHoursRequired] = useState("");
  const [openHoursRequired, setOpenHoursRequired] = useState("");

  const [matchedCount, setMatchedCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function buildCriteria(): WorkFormulaCriteria {
    if (memberId) {
      return { memberId };
    }
    return {
      memberType: memberType as WorkFormulaCriteria["memberType"],
      boardStatus: boardStatus as WorkFormulaCriteria["boardStatus"],
      boxSharing: boxSharing as WorkFormulaCriteria["boxSharing"],
    };
  }

  async function handlePreview() {
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await previewWorkFormulaBulkUpdate(buildCriteria());
      setMatchedCount(res.matchedCount);
    } catch (err) {
      console.error("Preview error:", err);
      setError("Could not preview matching members.");
      setMatchedCount(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleApply() {
    const workHours = Number(workHoursRequired);
    const openHours = Number(openHoursRequired);

    if (!Number.isFinite(workHours) || !Number.isFinite(openHours)) {
      setError("Enter valid numbers for both hour fields.");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await applyWorkFormulaBulkUpdate(
        buildCriteria(),
        workHours,
        openHours,
      );
      setSuccessMsg(`Updated ${res.updatedCount} member(s).`);
      setMatchedCount(null);
      onApplied();
    } catch (err) {
      console.error("Apply error:", err);
      setError("Could not apply the update.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-formula-matrix">
      <h2>Update Work Formula Requirements</h2>

      <div className="matrix-row">
        <label>
          Member Type
          <select
            value={memberType}
            onChange={(e) => {
              setMemberType(e.target.value);
              setMemberId("");
              setMatchedCount(null);
            }}
            disabled={!!memberId}
          >
            <option value="">Any</option>
            {Object.values(MemberType).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label>
          Board Status
          <select
            value={boardStatus}
            onChange={(e) => {
              setBoardStatus(e.target.value);
              setMemberId("");
              setMatchedCount(null);
            }}
            disabled={!!memberId}
          >
            <option value="">Any</option>
            <option value="board">On Board</option>
            <option value="non_board">Not on Board</option>
          </select>
        </label>

        <label>
          Box Sharing
          <select
            value={boxSharing}
            onChange={(e) => {
              setBoxSharing(e.target.value);
              setMemberId("");
              setMatchedCount(null);
            }}
            disabled={!!memberId}
          >
            <option value="">Any</option>
            <option value="shared">Shares a Box</option>
            <option value="individual">Individual Box</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </label>

        <label>
          Specific Member (overrides filters above)
          <select
            value={memberId}
            onChange={(e) => {
              setMemberId(e.target.value);
              setMatchedCount(null);
            }}
          >
            <option value="">— None —</option>
            {members.map((wf) => (
              <option key={wf.id} value={wf.member_id}>
                {wf.member_name || wf.member_id || "—"}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="matrix-row">
        <label>
          Work Hours Required
          <input
            type="number"
            min="0"
            value={workHoursRequired}
            onChange={(e) => setWorkHoursRequired(e.target.value)}
          />
        </label>

        <label>
          Open Hours Required
          <input
            type="number"
            min="0"
            value={openHoursRequired}
            onChange={(e) => setOpenHoursRequired(e.target.value)}
          />
        </label>
      </div>

      <div className="button-row">
        <button type="button" onClick={handlePreview} disabled={busy}>
          Preview Matching Members
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={busy || matchedCount === null}
        >
          {matchedCount !== null
            ? `Apply to ${matchedCount} Member${matchedCount === 1 ? "" : "s"}`
            : "Apply"}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {successMsg && <p className="muted">{successMsg}</p>}
    </section>
  );
}
