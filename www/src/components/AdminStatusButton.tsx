import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import PersonIcon from "@mui/icons-material/Person";

import { isAdmin } from "../lib/pocketbase";

export default function AdminStatusButton() {
  if (isAdmin()) {
    return (
      <span className="admin-status active">
        <AdminPanelSettingsIcon fontSize="inherit" />
        Admin
      </span>
    );
  }

  return (
    <span className="admin-status">
      <PersonIcon fontSize="inherit" />
      Member
    </span>
  );
}
