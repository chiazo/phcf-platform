import { useState } from "react";

import { importMembersData } from "../lib/pocketbase";
import type { ImportKind, ImportResult } from "../lib/pocketbase";

const COPY: Record<ImportKind,
  { title: string; columns: string; note: string; before: string }
> = {
  dues: {
    title: "Import Dues",
    columns: "Email, Amount Paid, Payment Type (optional), Date Paid (optional)",
    note: "Rows with the same email are added together, and the total replaces the member's current Amount Paid. Re-importing the same file changes nothing.",
    before: "Amount Paid",
  },
  hours: {
    title: "Import Open Hours",
    columns: "Email, Open Hours Completed",
    note: "Whole numbers only. Rows with the same email are added together, and the total replaces the member's current Open Hours Completed. Re-importing the same file changes nothing.",
    before: "Open Hours",
  },
};

const STATUS_LABEL: Record<string, string> = {
  update: "Will update",
  unmatched: "No matching member",
  invalid: "Problem",
};

export default function BulkImportModal({
  kind,
  onClose,
  onApplied,
}: {
  kind: ImportKind;
  onClose: () => void;
  onApplied: () => void;
}) {
  const copy = COPY[kind];
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(preview: boolean) {
    if (!file) return;

    setBusy(true);
    setError(null);

    try {
      const res = await importMembersData(kind, file, preview);
      setResult(res);
      if (!preview) onApplied();
    } catch (err: any) {
      console.error("import error:", err);
      setError(err?.message || "Could not import the file.");
    } finally {
      setBusy(false);
    }
  }

  const applied = result !== null && !result.preview;
  const shownRows = result?.rows.filter((r) => r.status !== "unchanged") ?? [];

  return (
    <div className="modal modal-open" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>{copy.title}</h2>

        <p className="muted">
          Columns: {copy.columns}. Members are matched by email.
        </p>
        <p className="muted">{copy.note}</p>

        <input
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
            setError(null);
          }}
        />

        {error && <p className="error">{error}</p>}

        {result && (
          <>
            <p role="status">
              {applied ? "Imported: " : "Preview: "}
              <strong>{result.updated}</strong>{" "}
              {applied ? "updated" : "will update"}, {result.unchanged}{" "}
              unchanged, {result.unmatched} unmatched, {result.invalid}{" "}
              {result.invalid === 1 ? "problem" : "problems"}.
            </p>

            {shownRows.length > 0 && (
              <div className="modal-table-wrapper always-visible-table">
                <table>
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Member</th>
                      <th>{copy.before}</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownRows.map((r) => (
                      <tr key={`${r.row}-${r.email}`}>
                        <td>{r.row}</td>
                        <td>
                          {r.name || "—"}
                          <br />
                          <span className="muted">{r.email}</span>
                        </td>
                        <td>
                          {r.status === "update"
                            ? `${r.before} → ${r.after}`
                            : "—"}
                        </td>
                        <td>
                          {applied && r.status === "update"
                            ? "Updated"
                            : (STATUS_LABEL[r.status] ?? r.status)}
                          {r.message && (
                            <>
                              <br />
                              <span className="muted">{r.message}</span>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
            {applied ? "Done" : "Cancel"}
          </button>

          {!applied && (
            <button
              type="button"
              className="secondary"
              onClick={() => run(true)}
              disabled={!file || busy}
            >
              {busy && !result ? "Checking..." : "Preview"}
            </button>
          )}

          {result?.preview && result.updated > 0 && (
            <button type="button" onClick={() => run(false)} disabled={busy}>
              {busy
                ? "Importing..."
                : `Apply ${result.updated} change${result.updated === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
