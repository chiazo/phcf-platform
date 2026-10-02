import { Link, NavLink, useLocation } from "react-router-dom";
import AdminStatusButton from "./AdminStatusButton";
import { isAdmin } from "../lib/pocketbase";
import ActionMenu from "../components/ActionMenu";

const ADMIN_LINKS = [
  { label: "Work Formulas", to: "/work-formula" },
  { label: "Legacy Snapshots", to: "/legacy-snapshots" },
  { label: "Admin User Access", to: "/admin" },
];

interface Props {
  currUser: any;
  title: string;
  backLabel?: string;
  backTo?: string;
  showBack?: boolean;
  signedInLabel?: string;
  handleLogout: () => void;
  handleRequestBox?: () => void;
  handleToggleMove?: () => void;
  handleAddBox?: () => void;
  moveMode?: boolean;
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
  handleToggleMove,
  handleAddBox,
  moveMode = false,
  children,
}: Props) {
  const { pathname } = useLocation();
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

              <ActionMenu
                label="Admin"
                active={ADMIN_LINKS.some((l) => pathname.startsWith(l.to))}
                items={ADMIN_LINKS}
              />
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

      {(handleRequestBox || (isAdmin() && (handleToggleMove || handleAddBox))) && (
        <div className="header-below-actions">
          {handleRequestBox && (
            <button
              className="secondary header-action-button"
              onClick={handleRequestBox}
              type="button"
            >
              Request a Box
            </button>
          )}

          {handleAddBox && isAdmin() && (
            <button
              className="secondary header-action-button"
              onClick={handleAddBox}
              type="button"
            >
              + Add Box
            </button>
          )}

          {handleToggleMove && isAdmin() && (
            <button className="secondary" onClick={handleToggleMove} type="button">
              {moveMode ? "Hide Move Buttons" : "Show Move Buttons"}
            </button>
          )}
        </div>
      )}
    </>
  );
}
