import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminWorkFormulaMatrix from "../components/AdminWorkFormulaMatrix";
import AdminServiceHourRates from "../components/AdminServiceHourRates";

import {
  currentUser,
  isAdmin,
  isLoggedIn,
  listWorkFormulas,
  logout,
} from "../lib/pocketbase";
import AdminStatusButton from "../components/AdminStatusButton";

function getMemberLabel(workFormula: Record<string, any>) {
  return workFormula.member_name || workFormula.member_id || "—";
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

    listWorkFormulas()
      .then((res) => {
        setAllFormulas(res.items);
        setLoadError(null);
      })
      .catch((err) => {
        console.error("WF fetch error:", err);
        console.error("WF error data:", err?.data);
        setLoadError("Could not load formulas.");
        setAllFormulas([]);
      });
  }, [isAuthenticated]);

  function refetchFormulas() {
    listWorkFormulas()
      .then((res) => {
        setAllFormulas(res.items);
        setLoadError(null);
      })
      .catch((err) => {
        console.error("WF refetch error:", err);
        setLoadError("Could not load formulas.");
      });
  }

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
      <div className="page-header">
        <div>
          <h1>Work Formula Info</h1>
          <p className="muted signed-in-line">
            Signed in as {currentUser()?.email}
            <AdminStatusButton />
          </p>
          <div id="navigation-buttons">
            <Link className="button-link secondary" to="/">
              ← Back to Home
            </Link>
            <Link className="button-link secondary" to="/box-info">
              Box Info
            </Link>
            <Link className="button-link secondary" to="/legacy-snapshots">
              Legacy Snapshots
            </Link>
            <Link className="button-link secondary" to="/admin">
              Admin access
            </Link>
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
                        <td>{getMemberLabel(wf)}</td>
                        <td>{wf.work_hours_required}</td>
                        <td>{wf.work_hours_completed}</td>
                        <td>{wf.open_hours_required}</td>
                        <td>{wf.open_hours_completed}</td>
                        <td>{wf.created_at}</td>
                        <td>{wf.modified_at}</td>
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
