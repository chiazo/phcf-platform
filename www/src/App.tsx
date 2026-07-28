import { Routes, Route } from "react-router-dom";

import WorkFormulaPage from "./pages/WorkFormulaPage";
import BoxInfoPage from "./pages/BoxInfoPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import LoginPage from "./pages/LoginPage";
import MembersPage from "./pages/MembersPage";
import MemberSnapshotPage from "./pages/MemberSnapshotPage";
import RegisterPage from "./pages/RegisterPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

export default function App() {
  return (
    <main>
      <Routes>
        <Route path="/" element={<MembersPage />} />
        <Route path="/work-formula" element={<WorkFormulaPage />} />
        <Route path="/box-info" element={<BoxInfoPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/snapshot/:id" element={<MemberSnapshotPage />} />
      </Routes>
    </main>
  );
}
