import { Navigate, Routes, Route } from "react-router-dom";
import type { ReactNode } from "react";

import AdminPage from "./pages/AdminPage";
import WorkFormulaPage from "./pages/WorkFormulaPage";
import BoxInfoPage from "./pages/BoxInfoPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import LoginPage from "./pages/LoginPage";
import MembersPage from "./pages/MembersPage";
import MemberSnapshotPage from "./pages/MemberSnapshotPage";
import LegacySnapshotPage from "./pages/LegacySnapshotPage";
import RegisterPage from "./pages/RegisterPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import { isAdmin, isLoggedIn } from "./lib/pocketbase";

function RequireAdmin({ children }: { children: ReactNode }) {
  if (!isLoggedIn()) {
    return <Navigate replace to="/login" />;
  }

  if (!isAdmin()) {
    return <Navigate replace to="/" />;
  }

  return children;
}

export default function App() {
  return (
    <main>
      <Routes>
        <Route path="/" element={<MembersPage />} />
        <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
        <Route path="/work-formula" element={<RequireAdmin><WorkFormulaPage /></RequireAdmin>} />
        <Route path="/box-info" element={<BoxInfoPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/snapshot/:id" element={<MemberSnapshotPage />} />
        <Route path="/legacy-snapshots" element={<RequireAdmin><LegacySnapshotPage /></RequireAdmin>} />
      </Routes>
    </main>
  );
}
