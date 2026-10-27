import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminWorkFormulaMatrix from "../components/AdminWorkFormulaMatrix";
import AdminServiceHourRates from "../components/AdminServiceHourRates";

import {
  currentUser,
  isAdmin,
  isLoggedIn,

  listMemberSnapshots,
  listWorkFormulas,
  logout,
} from "../lib/pocketbase";
import Header from "../components/Header";

const formatTimestamp = (value?: string) => {
  if (!value) return "-";

  // PocketBase uses a space instead of "T", which Safari can't parse
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

function getMemberLabel(workFormula: Record<string, any>) {
  const snapshot = workFormula.expand?.member_id?.expand?.member_snapshot_id;

  const firstName = snapshot?.personal_info?.firstName ?? "";
  const lastName = snapshot?.personal_info?.lastName ?? "";

  const name = `${firstName} ${lastName}`.trim();

  return name || workFormula.member_id || "—";
}

type AdminView = "matrix" | "rates" | "table";

const ADMIN_VIEWS: Array<{ id: AdminView; label: string }> = [
  { id: "matrix", label: "Update Requirements" },
  { id: "rates", label: "Service Hour Rates" },
  { id: "table", label: "All Existing Work" },
];

export default function WorkFormulaPage() {
  
  const [allFormulas, setAllFormulas] = useState<Array<Record<string, any>>>(
    [],
  );
  const [isAuthenticated, setIsAuthenticated] = useState(isLoggedIn());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedView, setSelectedView] = useState<AdminView>("matrix");

  useEffect(() => {
    document.title = "PHCF Platform";

    if (!isAuthenticated || !isAdmin()) {
      setAllFormulas([]);
      return;
    }

    fetchFormulasWithMemberNames().catch((err) => {
      console.error("WF fetch error:", err);
      console.error("WF error data:", err?.data);
      setLoadError("Could not load formulas.");
      setAllFormulas([]);
    });
  }, [isAuthenticated]);

  const refetchFormulas = async () => {
    try {
      await fetchFormulasWithMemberNames();
    } catch (err: any) {
      console.error("WF fetch error:", err);
      console.error("WF error data:", err?.data);
      setLoadError("Could not load formulas.");
    }
  };
  
  const fetchFormulasWithMemberNames = async () => {
    const [membersRes, formulasRes] = await Promise.all([
      listMemberSnapshots(),
      listWorkFormulas(),
    ]);

    const formulasByMemberId = new Map(
      formulasRes.items.map((formula) => [formula.member_id, formula]),
    );

    const merged = membersRes.items.map((member) => {
      const formula = formulasByMemberId.get(member.member_id);

      const firstName = member.personal_info?.firstName ?? "";
      const lastName = member.personal_info?.lastName ?? "";
      const fullName = [firstName, lastName].filter(Boolean).join(" ");

      return {
        ...(formula ?? {
          id: `missing-${member.member_id}`,
          work_hours_completed: 0,
          open_hours_completed: 0,
          work_hours_required: 0,
          open_hours_required: 0,
        }),
        member_id: member.member_id,
        fullName: fullName || member.member_id,
      };
    });

    setAllFormulas(merged);
    setLoadError(null);
  };

  function handleLogout() {
    logout();
    setIsAuthenticated(false);
  }

  if (!isAuthenticated) {
    return (
      <section className="auth-panel">
        <h1>Work Formula Info</h1>
        <p>Register or log in to view available work formulas.</p>
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
        <h1>Work Formula Info</h1>
        <p className="error">Admin access is required.</p>
      </section>
    );
  }

  return (
    <>
      <Header
        currUser={currentUser()}
        title="Work Formula Info"
        backLabel="← Back to Home"
        handleLogout={handleLogout}
      />

      {loadError && <p className="error">{loadError}</p>}

      <div className="wf-admin-layout">
        <nav className="wf-admin-nav">
          {ADMIN_VIEWS.map((view) => (
            <button
              key={view.id}
              type="button"
              className={
                "wf-admin-nav-item" +
                (selectedView === view.id ? " active" : "")
              }
              onClick={() => setSelectedView(view.id)}
            >
              {view.label}
            </button>
          ))}
        </nav>

        <div className="wf-admin-content">
          {selectedView === "matrix" && (
            <AdminWorkFormulaMatrix
              members={allFormulas}
              onApplied={refetchFormulas}
            />
          )}

          {selectedView === "rates" && <AdminServiceHourRates />}

          {selectedView === "table" &&
            (allFormulas.length === 0 && !loadError ? (
              <p className="muted">No Work Formulas found.</p>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Work Hours Required</th>
                      <th>Work Hours Completed</th>
                      <th>Open Hours Required</th>
                      <th>Open Hours Completed</th>
                      <th>Created At</th>
                      <th>Modified At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allFormulas.map((wf) => (
                      <tr key={wf.id}>
                        <td>
                          {getMemberLabel(wf)}
                          <small style={{ display: "block" }}>
                            <br></br>({wf.id})
                          </small>
                        </td>
                        <td>{wf.work_hours_required}</td>
                        <td>{wf.work_hours_completed}</td>
                        <td>{wf.open_hours_required}</td>
                        <td>{wf.open_hours_completed}</td>
                        <td>{formatTimestamp(wf.created_at)}</td>
                        <td>{formatTimestamp(wf.modified_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
        </div>
      </div>
    </>
  );
}
