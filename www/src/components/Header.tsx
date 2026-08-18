import { Link, NavLink } from "react-router-dom";
import AdminStatusButton from "./AdminStatusButton";
import { isAdmin } from "../lib/pocketbase";

interface Props {
  currUser: any;
  title: string;
  backLabel?: string;
  backTo?: string;
  showBack?: boolean;
  signedInLabel?: string;
  handleLogout: () => void;
  handleRequestBox?: () => void;
  children?: React.ReactNode;
}

export default function Header({
  currUser,
  title,
  backLabel = "← Back to Members",
  backTo = "/",
  showBack = true,
  signedInLabel,
  handleLogout,
  handleRequestBox,
  children,
}: Props) {
  return (
    <>
      <header className="page-header">
        <div className="page-header-title">
          <h1>{title}</h1>

          <p className="muted signed-in-line">
            Signed in as {signedInLabel ?? currUser?.email}
            <AdminStatusButton />
          </p>
        </div>

        <nav className="page-header-actions">
          {showBack && (
            <Link className="button-link secondary" to={backTo}>
              {backLabel}
            </Link>
          )}

          {isAdmin() && (
            <>
              <NavLink
                to="/box-info"
                className={({ isActive }) =>
                  `button-link secondary${isActive ? " active-page" : ""}`
                }
              >
                Box Info
              </NavLink>

              <NavLink
                to="/work-formula"
                className={({ isActive }) =>
                  `button-link secondary${isActive ? " active-page" : ""}`
                }
              >
                Work Formulas
              </NavLink>

              <NavLink
                to="/legacy-snapshots"
                className={({ isActive }) =>
                  `button-link secondary${isActive ? " active-page" : ""}`
                }
              >
                Legacy Snapshots
              </NavLink>

              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `button-link secondary${isActive ? " active-page" : ""}`
                }
              >
                Admin access
              </NavLink>
            </>
          )}

          {children}

          <button
            className="secondary page-logout-button"
            onClick={handleLogout}
            type="button"
          >
            Log out
          </button>
        </nav>
      </header>

      {handleRequestBox && (
        <div className="header-below-actions">
          <button
            className="secondary"
            onClick={handleRequestBox}
            type="button"
          >
            Request a Box
          </button>
        </div>
      )}
    </>
  );
}
