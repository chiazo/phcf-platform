import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  currentUser,
  isAdmin,
  isLoggedIn,
  listLegacyYearRows,
  logout,
} from "../lib/pocketbase";
import { config } from "../lib/config";

import Box from "@mui/material/Box";
import OutlinedInput from "@mui/material/OutlinedInput";
import InputLabel from "@mui/material/InputLabel";
import InputAdornment from "@mui/material/InputAdornment";
import FormControl from "@mui/material/FormControl";
import SearchIcon from "@mui/icons-material/Search";

import Header from "../components/Header";
import RolloverModal from "../components/RolloverModal";

const STANDING_LABEL: Record<string, string> = {
  GOOD_STANDING: "Good standing",
  NOT_IN_GOOD_STANDING: "Not in good standing",
  INACTIVE: "Inactive",
};

interface YearSummary {
  year: number;
  members: number;
  good: number;
  notGood: number;
  inactive: number;
  unknown: number; // rows archived before standing was recorded
  dues: number;
  workHours: number;
  openHours: number;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatDatePaid(unixSeconds: unknown): string {
  const seconds = toNumber(unixSeconds);
  if (seconds <= 0) return "";
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function yearLabel(year: number): string {
  return year === 0 ? "Earlier (no year)" : String(year);
}

function fullName(row: Record<string, any>): string {
  const p = row.personal_info ?? {};
  return `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim();
}

// One row per member per year (the final snapshot), totalled by year
function summarize(rows: Array<Record<string, any>>): YearSummary[] {
  const byYear = new Map<number, YearSummary>();

  for (const row of rows) {
    const year = toNumber(row.year);

    const summary = byYear.get(year) ?? {
      year,
      members: 0,
      good: 0,
      notGood: 0,
      inactive: 0,
      unknown: 0,
      dues: 0,
      workHours: 0,
      openHours: 0,
    };

    summary.members += 1;
    if (row.standing === "GOOD_STANDING") summary.good += 1;
    else if (row.standing === "INACTIVE") summary.inactive += 1;
    else if (row.standing === "NOT_IN_GOOD_STANDING") summary.notGood += 1;
    else summary.unknown += 1;

    summary.dues += toNumber(row.member_info?.dues?.amountPaid);
    summary.workHours += toNumber(row.hours?.work_hours_completed);
    summary.openHours += toNumber(row.hours?.open_hours_completed);

    byYear.set(year, summary);
  }

  return Array.from(byYear.values()).sort((a, b) => b.year - a.year);
}

export default function LegacySnapshotPage() {
  const [rows, setRows] = useState<Array<Record<string, any>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [showRollover, setShowRollover] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(isLoggedIn());
  const outlinedAmountId = useId();

  async function load() {
    setLoading(true);
    setError(null);

    try {
      setRows(await listLegacyYearRows());
    } catch (err) {
      console.error("legacy fetch error:", err);
      setError("Could not load the legacy data.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    document.title = "PHCF Platform";

    if (!isAuthenticated || !isAdmin()) {
      setRows([]);
      setLoading(false);
      return;
    }

    load();
  }, [isAuthenticated]);

  const summaries = useMemo(() => summarize(rows), [rows]);

  // The roster shows once a year is picked or something is typed in search.
  // With no year picked, search looks across every year.
  const rosterRows = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rows
      .filter((r) => selectedYear === null || toNumber(r.year) === selectedYear)
      .filter((r) => {
        if (!q) return true;
        const email = String(
          r.personal_info?.emailInfo?.primaryEmail ?? "",
        ).toLowerCase();
        return fullName(r).toLowerCase().includes(q) || email.includes(q);
      })
      .sort(
        (a, b) =>
          toNumber(b.year) - toNumber(a.year) ||
          fullName(a).toLowerCase().localeCompare(fullName(b).toLowerCase()),
      );
  }, [rows, selectedYear, query]);

  function handleLogout() {
    logout();
    setIsAuthenticated(false);
  }

  if (!isAuthenticated) {
    return (
      <section className="auth-panel">
        <h1>PHCF Members</h1>

        <p>Register or log in.</p>

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

  if (!isAdmin()) {
    return (
      <section className="auth-panel">
        <Link to="/">← Back to Home</Link>

        <h1>Legacy Snapshots</h1>

        <p className="error">Admin access is required.</p>
      </section>
    );
  }

  const dash = (s: YearSummary, value: number) =>
    s.unknown === s.members ? "—" : value;

  return (
    <>
      <Header
        currUser={currentUser()}
        title="Legacy Snapshots"
        backLabel="← Back to Home"
        handleLogout={handleLogout}
      />

      <Box sx={{ p: 3, display: "flex", alignItems: "center", gap: 2 }}>
        <FormControl sx={{ flex: 1 }}>
          <InputLabel htmlFor={`${outlinedAmountId}-input`}>
            Search all years by name or email
          </InputLabel>

          <OutlinedInput
            id={`${outlinedAmountId}-input`}
            sx={{ backgroundColor: "white" }}
            startAdornment={
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            }
            label="Search all years by name or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </FormControl>

      </Box>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading…</p>}

      {!loading && !error && summaries.length === 0 && (
        <p className="muted">
          Nothing archived yet. Use "Restart Year" to archive the current year.
        </p>
      )}
     
        <>
          <h2>
            {selectedYear === null
              ? "Search Results"
              : `${yearLabel(selectedYear)} roster`}{" "}
            <span className="muted">({rosterRows.length})</span>
          </h2>

          {rosterRows.length === 0 ? (
            <p className="muted">No matching members.</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Member</th>
                    <th>Email</th>
                    <th>Standing</th>
                    <th>Dues paid</th>
                    <th>Payment type</th>
                    <th>Date paid</th>
                    <th>Meetings</th>
                    <th>Work hours</th>
                    <th>Open hours</th>
                  </tr>
                </thead>
                <tbody>
                  {rosterRows.map((r) => (
                    <tr key={r.id}>
                      <td>{toNumber(r.year) || "—"}</td>
                      <td>{fullName(r) || "—"}</td>
                      <td>{r.personal_info?.emailInfo?.primaryEmail || "—"}</td>
                      <td>{STANDING_LABEL[r.standing] ?? "—"}</td>
                      <td>
                        {money(toNumber(r.member_info?.dues?.amountPaid))}
                      </td>
                      <td>
                        {String(
                          r.member_info?.dues?.paymentType ?? "",
                        ).toUpperCase() || "—"}
                      </td>
                      <td>
                        {formatDatePaid(r.member_info?.dues?.duesPaidAt) ||
                          "—"}
                      </td>
                      <td>
                        {toNumber(
                          r.member_info?.requirements?.meetingsCompleted,
                        )}{" "}
                        /{" "}
                        {toNumber(r.member_info?.requirements?.meetingsRequired)}
                      </td>
                      <td>
                        {r.hours
                          ? `${toNumber(r.hours.work_hours_completed)} / ${toNumber(r.hours.work_hours_required)}`
                          : "—"}
                      </td>
                      <td>
                        {r.hours
                          ? `${toNumber(r.hours.open_hours_completed)} / ${toNumber(r.hours.open_hours_required)}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      

      {showRollover && (
        <RolloverModal onClose={() => setShowRollover(false)} onDone={load} />
      )}
    </>
  );
}
