import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { isAdmin, isLoggedIn } from "./lib/pocketbase";
import AdminPage from "./pages/AdminPage";
import BoxInfoPage from "./pages/BoxInfoPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import LegacySnapshotPage from "./pages/LegacySnapshotPage";
import LoginPage from "./pages/LoginPage";
import MemberSnapshotPage from "./pages/MemberSnapshotPage";
import MembersPage from "./pages/MembersPage";
import RegisterPage from "./pages/RegisterPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import WorkFormulaPage from "./pages/WorkFormulaPage";
import YearlyReportPage from "./pages/YearlyReportPage";

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
        <Route path="/yearly" element={<YearlyReportPage />} />
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
