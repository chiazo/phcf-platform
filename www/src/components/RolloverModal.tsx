import { useState } from "react";

import { runRollover } from "../lib/pocketbase";
import type { RolloverAction, RolloverResult } from "../lib/pocketbase";

const COPY: Record<RolloverAction, { label: string; what: string }> = {
  archive: {
    label: "Archive only",
    what: "Copies every member's snapshots, hours and requests for this year into Legacy. Nothing is changed or deleted, and it's safe to repeat.",
  },
  reset: {
    label: "Archive and start fresh",
    what: "Archives the year, then starts fresh. Members in good standing carry over with dues, meetings, meeting exemptions and completed hours reset to zero. Everyone else becomes INACTIVE. A database backup will be made first.",
  },
};

export default function RolloverModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [action, setAction] = useState<RolloverAction>("archive");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [result, setResult] = useState<RolloverResult | null>(null);
  const [keepActive, setKeepActive] = useState<Set<string>>(new Set());
  const [confirmYear, setConfirmYear] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const yearNumber = Number(year);
  const validYear =
    Number.isInteger(yearNumber) && yearNumber >= 2000 && yearNumber <= 2100;
  const applied = result !== null && !result.preview;

  function clearResult() {
    setResult(null);
    setError(null);
    setConfirmYear("");
  }

  async function run(preview: boolean) {
    setBusy(true);
    setError(null);

    try {
      const res = await runRollover(
        action,
        yearNumber,
        preview,
        Array.from(keepActive),
      );
      setResult(res);
      if (!preview) onDone();
    } catch (err: any) {
      console.error("rollover error:", err);
      setError(err?.message || "Could not run the rollover.");
    } finally {
      setBusy(false);
    }
  }

  function toggleKeep(memberId: string) {
    setKeepActive((current) => {
      const next = new Set(current);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  }

  const stillInactive =
    result?.inactive.filter((r) => !keepActive.has(r.memberId)) ?? [];
  const carryCount =
    (result?.carryOver.length ?? 0) +
    ((result?.inactive.length ?? 0) - stillInactive.length);

  const confirmed = action === "archive" || confirmYear === year;

  return (
    <div className="modal modal-open" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Year Rollover</h2>

        <label>
          Year to archive
          <input
            type="number"
            min="2000"
            max="2100"
            value={year}
            disabled={busy || applied}
            onChange={(e) => {
              setYear(e.target.value);
              clearResult();
            }}
          />
        </label>

        <label>
          What to do
          <select
            value={action}
            disabled={busy || applied}
            onChange={(e) => {
              setAction(e.target.value as RolloverAction);
              clearResult();
            }}
          >
            <option value="archive">{COPY.archive.label}</option>
            <option value="reset">{COPY.reset.label}</option>
          </select>
        </label>

        <p className="muted">{COPY[action].what}</p>

        {error && <p className="error">{error}</p>}

        {result && (
          <>
            <p role="status" style={{ textAlign: "left" }}>
              {applied ? "Done. " : "Preview: "}
              {result.total} members. {result.legacyRows} legacy{" "}
              {result.legacyRows === 1 ? "row" : "rows"}
              {action === "reset" && (
                <>
                  , {result.snapshotsRemoved} old snapshots and{" "}
                  {result.requestsRemoved} requests{" "}
                  {applied ? "removed" : "will be removed"}
                </>
              )}
              .
              {action === "reset" && (
                <>
                  {" "}
                  <strong>{carryCount}</strong>{" "}
                  {applied ? "carried over" : "carry over"},{" "}
                  <strong>{stillInactive.length}</strong>{" "}
                  {applied ? "became" : "become"} inactive
                  {result.alreadyInactive > 0 &&
                    `, ${result.alreadyInactive} already inactive`}
                  .
                </>
              )}
            </p>

            {result.backup && (
              <p className="muted">Backup saved as {result.backup}.</p>
            )}

            {result.warnings.map((w) => (
              <p key={w} className="muted">
                ⚠️ {w}
              </p>
            ))}

            {result.failures.length > 0 && (
              <div className="error">
                <p>These members could not be processed and were left as they were:</p>
                <ul>
                  {result.failures.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}

            {action === "reset" && result.inactive.length > 0 && !applied && (
              <>
                <p>
                  <strong>Not in good standing.</strong> They become inactive
                  unless you tick Keep active.
                </p>
                <div className="modal-table-wrapper always-visible-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Keep active</th>
                        <th>Member</th>
                        <th>Missing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.inactive.map((r) => (
                        <tr key={r.memberId}>
                          <td>
                            <input
                              type="checkbox"
                              checked={keepActive.has(r.memberId)}
                              onChange={() => toggleKeep(r.memberId)}
                            />
                          </td>
                          <td>
                            {r.name || "—"}
                            <br />
                            <span className="muted">{r.email}</span>
                          </td>
                          <td>{r.reasons?.join(", ") || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {action === "reset" && result.carryOver.length > 0 && (
              <details>
                <summary>
                  {result.carryOver.length} in good standing (carry over)
                </summary>
                <ul>
                  {result.carryOver.map((r) => (
                    <li key={r.memberId}>{r.name || r.memberId}</li>
                  ))}
                </ul>
              </details>
            )}

            {action === "reset" && result.preview && (
              <label>
                Type {year} to confirm
                <input
                  value={confirmYear}
                  onChange={(e) => setConfirmYear(e.target.value)}
                />
              </label>
            )}
          </>
        )}

        <div className="button-row">
          <button
            type="button"
            className="secondary"
            onClick={onClose}
            disabled={busy}
          >
            {applied ? "Close" : "Cancel"}
          </button>

          {!applied && (
            <button
              type="button"
              className="secondary"
              onClick={() => run(true)}
              disabled={!validYear || busy}
            >
              {busy && !result ? "Checking..." : "Preview"}
            </button>
          )}

          {result?.preview && (
            <button
              type="button"
              onClick={() => run(false)}
              disabled={busy || !confirmed}
            >
              {busy ? "Working..." : COPY[action].label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
