import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { currentUser, isAdmin, isLoggedIn, listBoxes, addToBoxWaitlist, logout } from "../lib/pocketbase";
import AdminStatusButton from "../components/AdminStatusButton";

export default function BoxInfoPage() {
  const [allBoxes, setAllBoxes] = useState<Array<Record<string, any>>>([]);
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

  function handleRequestBox(){
    console.log('box requested')
    console.log(listBoxes)
    addToBoxWaitlist(allBoxes)
    console.log('request processed')


    // GET the boxes collection from pocketbase, 
    // check if any boxes have no members, 
      // if yes, add current logged user to waitlist for that box AND set box notes to admin review requested;
      // if no, check all waitlists and return the first 0 length waitlist, add user to waitlist for that box AND set box notes to admin review requested;
        // if no 0 length waitlist, find the shortest waitlist, add user to waitlist for that box AND set box notes to admin review requested;
  }

  // box_member_s / waitlist_list are stored as free-form JSON on each box
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
        </div>
        <div id="navigation-buttons">
          <Link className="button-link secondary" to="/">
            ← Back to Home
          </Link>
          <Link className="button-link secondary" to="/work-formula">
            Work Formulas
          </Link>
          {isAdmin() && (
            <>
              <Link className="button-link secondary" to="/legacy-snapshots">
                Legacy Snapshots
              </Link>
              <Link className="button-link secondary" to="/admin">
                Admin access
              </Link>
            </>
          )}
          <button className="secondary" onClick={handleLogout} type="button">
            Log out
          </button>
        </div>
      </div>

      {loadError && <p className="error">{loadError}</p>}

      {allBoxes.length === 0 && !loadError ? (
        <p className="muted">No boxes found.</p>
      ) : (
        <table>
          <thead>
            <tr>
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
                <td>{box.id}</td>
                <td>
                  <span className="badge">{box.box_state ?? "—"}</span>
                </td>
                <td>{countEntries(box.box_member_s)}</td>
                <td>{countEntries(box.waitlist_list)}</td>
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

