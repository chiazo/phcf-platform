import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  currentUser,
  isAdmin,
  isLoggedIn,
  listBoxes,
  addToBoxWaitlist,
  logout,
} from "../lib/pocketbase";
import AdminStatusButton from "../components/AdminStatusButton";

export default function BoxInfoPage() {
  const [allBoxes, setAllBoxes] = useState<Array<Record<string, any>>>([]);
  const [allBoxMembers, setBoxMembers] = useState<Array<Record<string, any>>>(
    [],
  );
  const [boxWaitlist, setBoxWaitlist] = useState<Array<Record<string, any>>>(
    [],
  );
  const [isAuthenticated, setIsAuthenticated] = useState(isLoggedIn());
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "PHCF Platform";

    if (!isAuthenticated) {
      setAllBoxes([]);
      return;
    }

    listBoxes()
      .then((res) => {
        setAllBoxes(res.items);
        console.log("yow", res.items);
        setLoadError(null);
      })
      .catch((err) => {
        console.error("box fetch error:", err);
        setLoadError("Could not load boxes.");
        setAllBoxes([]);
      });
  }, [isAuthenticated]);

  function handleLogout() {
    logout();
    setIsAuthenticated(false);
  }

  function handleRequestBox() {
    addToBoxWaitlist(allBoxes);
  }

  // box_members / waitlist are stored as free-form JSON on each box
  // record, so we render a count rather than assuming a specific shape.
  function countEntries(value: unknown): number {
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === "object") return Object.keys(value).length;
    return 0;
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
      <div className="page-header">
        <div>
          <h1>Box Info</h1>
          <p className="muted signed-in-line">
            Signed in as {currentUser()?.email}
            <AdminStatusButton />
          </p>
          <div id="navigation-buttons">
            <Link className="button-link secondary" to="/">
              ← Back to Members
            </Link>
            {isAdmin() && (
              <>
                <Link className="button-link secondary" to="/work-formula">
                  Work Formulas
                </Link>
                <Link className="button-link secondary" to="/admin">
                  Admin access
                </Link>
              </>
            )}
            <button
              id="requestBoxButton"
              className="secondary"
              onClick={handleRequestBox}
              type="button"
            >
              Request a Box
            </button>
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

      {allBoxes.length === 0 && !loadError ? (
        <p className="muted">No boxes found.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Box Name</th>
              <th>Box ID</th>
              <th>Status</th>
              <th>Members</th>
              <th>Waitlist</th>
              <th>Updated By</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {allBoxes.map((box) => (
              <tr key={box.id}>
                <td>{box.box_name}</td>
                <td>{box.id}</td>
                <td>
                  <span className="badge">{box.box_state ?? "—"}</span>
                </td>
                <td>{box.box_members_names.join(", ")}</td>
                <td>{box.waitlist_names.join(", ")}</td>
                <td>{box.updated_by || "—"}</td>
                <td className="muted">{box.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
