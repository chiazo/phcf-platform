import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { currentUser, isAdmin, isLoggedIn, listWorkFormulas, logout } from "../lib/pocketbase";
import AdminStatusButton from "../components/AdminStatusButton";

export default function WorkFormulaPage() {
  const [allFormulas, setAllFormulas] = useState<Array<Record<string, any>>>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(isLoggedIn());
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Work Formula Info";

    if (!isAuthenticated) {
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
        setLoadError("Could not load formulas.");
        setAllFormulas([]);
      });
  }, [isAuthenticated]);

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

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Work Formula Info</h1>
          <p className="muted signed-in-line">
            Signed in as {currentUser()?.email}
            <AdminStatusButton />
          </p>
        </div>
        <div id='navigation-buttons'>
            <Link className="button-link secondary" to="/">
                ← Back to Members
            </Link>
            <Link className="button-link secondary" to="/box-info">
                Box Info
            </Link>
            {isAdmin() && (
                <Link className="button-link secondary" to="/admin">
                    Admin access
                </Link>
            )}
            <button className="secondary" onClick={handleLogout} type="button">
                Log out
            </button>
        </div>
      </div>

      {loadError && <p className="error">{loadError}</p>}

      {allFormulas.length === 0 && !loadError ? (
        <p className="muted">No Work Formulas found.</p>
      ) : (
        <table>
          <thead>
            <tr>
              {/* <th>ID</th> */}
              <th>Member ID</th>
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
                <td>{wf.member_id}</td>
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
      )}
    </>
  );
}
