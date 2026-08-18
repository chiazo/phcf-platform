import { useEffect, useMemo, useState, useId } from "react";
import { Link } from "react-router-dom";

import {
  currentUser,
  isAdmin,
  isLoggedIn,
  listLegacySnapshots,
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
import MemberTable from "../components/MemberTable";

export default function LegacySnapshotPage() {
  const [allSnapshots, setAllSnapshots] = useState<Array<Record<string, any>>>(
    [],
  );
  const [query, setQuery] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(isLoggedIn());
  const outlinedAmountId = useId();

  useEffect(() => {
    document.title = "PHCF Platform";

    if (!isAuthenticated || !isAdmin()) {
      setAllSnapshots([]);
      return;
    }

    listLegacySnapshots()
      .then((res) => setAllSnapshots(res.items))
      .catch((err) => {
        console.error("member fetch error:", err);
        setAllSnapshots([]);
      });
  }, [isAuthenticated]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allSnapshots;

    return allSnapshots.filter((record) => {
      const firstName = record.personal_info?.firstName?.toLowerCase() ?? "";
      const lastName = record.personal_info?.lastName?.toLowerCase() ?? "";

      return firstName.includes(q) || lastName.includes(q);
    });
  }, [allSnapshots, query]);

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

  return (
    <>
      <Header
        currUser={currentUser()}
        title="Legacy Snapshots"
        backLabel="← Back to Home"
        handleLogout={handleLogout}
      />

      <Box sx={{ display: "flex", flexWrap: "wrap" }}>
        <div>
          <FormControl fullWidth sx={{ m: 1 }}>
            <InputLabel htmlFor={`${outlinedAmountId}-input`}>
              Search
            </InputLabel>

            <OutlinedInput
              id={`${outlinedAmountId}-input`}
              startAdornment={
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              }
              label="Search"
              onChange={(e) => setQuery(e.target.value)}
            />
          </FormControl>
        </div>
      </Box>

      <MemberTable members={items} />

      <br />

      <a
        className="fab"
        href={`${config.pbUrl}/_/`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open DB View →
      </a>
    </>
  );
}
