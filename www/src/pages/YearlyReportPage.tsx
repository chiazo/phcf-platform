import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import Header from "../components/Header";
import RolloverModal from "../components/RolloverModal";
import { downloadCsv } from "../lib/csv";
import {
    currentUser,
    isAdmin,
    listLegacyYearRows,
    logout,
} from "../lib/pocketbase";

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

function fullName(row: Record<string, any>): string {
    const p = row.personal_info ?? {};
    return `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim();
}

// One row per member per year (the final snapshot), totalled by year
function summarize(rows: Array<Record<string, any>>): YearSummary[] {
    const byYear = new Map<number, YearSummary>();

    for (const row of rows) {
        const year = toNumber(row.year);
        if (!year) continue;

        const summary = byYear.get(year) ?? {
            year,
            members: 0,
            good: 0,
            notGood: 0,
            inactive: 0,
            dues: 0,
            workHours: 0,
            openHours: 0,
        };

        summary.members += 1;
        if (row.standing === "GOOD_STANDING") summary.good += 1;
        else if (row.standing === "INACTIVE") summary.inactive += 1;
        else summary.notGood += 1;

        summary.dues += toNumber(row.member_info?.dues?.amountPaid);
        summary.workHours += toNumber(row.hours?.work_hours_completed);
        summary.openHours += toNumber(row.hours?.open_hours_completed);

        byYear.set(year, summary);
    }

    return Array.from(byYear.values()).sort((a, b) => b.year - a.year);
}

export default function YearlyReportPage() {
    const navigate = useNavigate();
    const [rows, setRows] = useState<Array<Record<string, any>>>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedYear, setSelectedYear] = useState<number | null>(null);
    const [showRollover, setShowRollover] = useState(false);

    async function load() {
        setLoading(true);
        setError(null);
        try {
            setRows(await listLegacyYearRows());
        } catch (err) {
            console.error("yearly report load error:", err);
            setError("Could not load the yearly data.");
            setRows([]);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        document.title = "PHCF Platform";
        load();
    }, []);

    const summaries = useMemo(() => summarize(rows), [rows]);

    const yearRows = useMemo(
        () =>
            rows
                .filter((r) => toNumber(r.year) === selectedYear)
                .sort((a, b) =>
                    fullName(a).toLowerCase().localeCompare(fullName(b).toLowerCase()),
                ),
        [rows, selectedYear],
    );

    function handleLogout() {
        logout();
        navigate("/");
    }

    function exportYear() {
        if (selectedYear === null) return;

        downloadCsv(
            `members-${selectedYear}.csv`,
            [
                "Full Name",
                "Email",
                "Standing",
                "Dues Status",
                "Amount Paid",
                "Payment Type",
                "Date Paid",
                "Meetings Required",
                "Meetings Completed",
                "Work Hours Required",
                "Work Hours Completed",
                "Open Hours Required",
                "Open Hours Completed",
            ],
            yearRows.map((r) => [
                fullName(r),
                r.personal_info?.emailInfo?.primaryEmail ?? "",
                STANDING_LABEL[r.standing] ?? r.standing ?? "",
                r.member_info?.dues?.dueState ?? "",
                toNumber(r.member_info?.dues?.amountPaid),
                String(r.member_info?.dues?.paymentType ?? "").toUpperCase(),
                formatDatePaid(r.member_info?.dues?.duesPaidAt),
                toNumber(r.member_info?.requirements?.meetingsRequired),
                toNumber(r.member_info?.requirements?.meetingsCompleted),
                toNumber(r.hours?.work_hours_required),
                toNumber(r.hours?.work_hours_completed),
                toNumber(r.hours?.open_hours_required),
                toNumber(r.hours?.open_hours_completed),
            ]),
        );
    }

    if (!isAdmin()) {
        return <p className="muted">Admin access is required.</p>;
    }

    return (
        <>
            <Header
                currUser={currentUser()}
                title="Yearly Reports"
                handleLogout={handleLogout}
            />

            <div className="button-row">
                <button type="button" onClick={() => setShowRollover(true)}>
                    Restart Year
                </button>
            </div>

            {error && <p className="error">{error}</p>}
            {loading && <p className="muted">Loading…</p>}

            {!loading && !error && summaries.length === 0 && (
                <p className="muted">
                    No archived years yet. Use Year rollover to archive the current year.
                </p>
            )}

            {summaries.length > 0 && (
                <div className="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Year</th>
                                <th>Members</th>
                                <th>Good standing</th>
                                <th>Not in good standing</th>
                                <th>Inactive</th>
                                <th>Dues collected</th>
                                <th>Work hours</th>
                                <th>Open hours</th>
                            </tr>
                        </thead>
                        <tbody>
                            {summaries.map((s) => (
                                <tr
                                    key={s.year}
                                    className={selectedYear === s.year ? "current-user-box" : ""}
                                    style={{ cursor: "pointer" }}
                                    onClick={() =>
                                        setSelectedYear(selectedYear === s.year ? null : s.year)
                                    }
                                >
                                    <td>
                                        <strong>{s.year}</strong>
                                    </td>
                                    <td>{s.members}</td>
                                    <td>{s.good}</td>
                                    <td>{s.notGood}</td>
                                    <td>{s.inactive}</td>
                                    <td>{money(s.dues)}</td>
                                    <td>{s.workHours}</td>
                                    <td>{s.openHours}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {selectedYear !== null && (
                <>
                    <div className="request-table-header">
                        <h2>{selectedYear} roster</h2>
                        <div className="bulk-action-row">
                            <button type="button" className="secondary" onClick={exportYear}>
                                Export {selectedYear} CSV
                            </button>
                        </div>
                    </div>

                    <div className="table-wrapper">
                        <table>
                            <thead>
                                <tr>
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
                                {yearRows.map((r) => (
                                    <tr key={r.id}>
                                        <td>{fullName(r) || "—"}</td>
                                        <td>{r.personal_info?.emailInfo?.primaryEmail || "—"}</td>
                                        <td>{STANDING_LABEL[r.standing] ?? r.standing ?? "—"}</td>
                                        <td>{money(toNumber(r.member_info?.dues?.amountPaid))}</td>
                                        <td>
                                            {String(
                                                r.member_info?.dues?.paymentType ?? "",
                                            ).toUpperCase() || "—"}
                                        </td>
                                        <td>
                                            {formatDatePaid(r.member_info?.dues?.duesPaidAt) || "—"}
                                        </td>
                                        <td>
                                            {toNumber(r.member_info?.requirements?.meetingsCompleted)}{" "}
                                            / {toNumber(r.member_info?.requirements?.meetingsRequired)}
                                        </td>
                                        <td>
                                            {toNumber(r.hours?.work_hours_completed)} /{" "}
                                            {toNumber(r.hours?.work_hours_required)}
                                        </td>
                                        <td>
                                            {toNumber(r.hours?.open_hours_completed)} /{" "}
                                            {toNumber(r.hours?.open_hours_required)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {showRollover && (
                <RolloverModal onClose={() => setShowRollover(false)} onDone={load} />
            )}
        </>
    );
}
