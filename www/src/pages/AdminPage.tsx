import SearchIcon from "@mui/icons-material/Search";
import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import InputAdornment from "@mui/material/InputAdornment";
import InputLabel from "@mui/material/InputLabel";
import OutlinedInput from "@mui/material/OutlinedInput";
import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import AdminStatusButton from "../components/AdminStatusButton";
import Header from "../components/Header";
import {
  AdminUser,
  currentUser,
  demoteUserFromAdmin,
  isAdmin,
  isLoggedIn,
  listAdminUsers,
  logout,
  promoteUserToAdmin,
} from "../lib/pocketbase";

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(isLoggedIn());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const searchInputId = useId();

  useEffect(() => {
    document.title = "PHCF Platform";

    if (!isAuthenticated || !isAdmin()) {
      setUsers([]);
      return;
    }

    refreshUsers();
  }, [isAuthenticated]);

  function refreshUsers() {
    listAdminUsers()
      .then((res) => {
        setUsers(res.items);
        setLoadError(null);
      })
      .catch((err) => {
        console.error("admin users fetch error:", err);
        setLoadError("Could not load users.");
        setUsers([]);
      });
  }

  function handleLogout() {
    logout();
    setIsAuthenticated(false);
  }

  async function updateAdminStatus(user: AdminUser, makeAdmin: boolean) {
    setBusyUserId(user.id);
    setLoadError(null);

    try {
      const updated = makeAdmin
        ? await promoteUserToAdmin(user.id)
        : await demoteUserFromAdmin(user.id);
      setUsers((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (err) {
      console.error("admin update error:", err);
      setLoadError("Could not update that user.");
    } finally {
      setBusyUserId(null);
    }
  }

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;

    return users.filter((user) => {
      const name = user.name?.toLowerCase() ?? "";
      const email = user.email.toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [query, users]);

  if (!isAuthenticated) {
    return (
      <section className="auth-panel">
        <h1>Admin</h1>
        <p>Log in as an admin to manage user access.</p>
        <Link className="button-link" to="/login">
          Log in
        </Link>
      </section>
    );
  }

  if (!isAdmin()) {
    return (
      <section className="auth-panel">
        <Link to="/">← Back to Home</Link>
        <h1>Admin</h1>
        <p className="error">Admin access is required.</p>
      </section>
    );
  }

  return (
    <>
      <Header
        currUser={currentUser()}
        title="Admin"
        backLabel="← Back to Home"
        handleLogout={handleLogout}
      />

      {loadError && <p className="error">{loadError}</p>}

      <section>
        <h2>User Access</h2>
        <p className="muted">
          Click "Make admin" to give this user admin access to this app (for
          board members only).
        </p>
        <p className="muted">
          For board members transitioning to regular members, click "No longer a
          board member" to remove their admin access.
        </p>
        <Box sx={{ display: "flex", flexWrap: "wrap", mb: 2 }}>
          <FormControl fullWidth>
            <InputLabel htmlFor={`${searchInputId}-input`}>Search</InputLabel>
            <OutlinedInput
              id={`${searchInputId}-input`}
              label="Search"
              onChange={(e) => setQuery(e.target.value)}
              startAdornment={
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              }
              value={query}
            />
          </FormControl>
        </Box>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Admin</th>
              <th>Superuser</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => {
              const isSelf = currentUser()?.email === user.email;
              return (
                <tr key={user.id}>
                  <td>{user.name || "—"}</td>
                  <td>{user.email}</td>
                  <td>{user.is_admin ? "Yes" : "No"}</td>
                  <td>
                    {user.is_superuser
                      ? "Yes"
                      : user.is_admin
                        ? "On next login"
                        : "No"}
                  </td>
                  <td>
                    {user.is_admin ? (
                      <button
                        className="secondary"
                        disabled={busyUserId === user.id || isSelf}
                        onClick={() => updateAdminStatus(user, false)}
                        type="button"
                      >
                        No longer a board member
                      </button>
                    ) : (
                      <button
                        disabled={busyUserId === user.id}
                        onClick={() => updateAdminStatus(user, true)}
                        type="button"
                      >
                        Make admin
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredUsers.length === 0 && (
              <tr>
                <td className="muted" colSpan={5}>
                  No users match that search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
