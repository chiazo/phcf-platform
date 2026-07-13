import { Routes, Route } from "react-router-dom";

import MembersPage from "./pages/MembersPage";
import MemberSnapshotPage from "./pages/MemberSnapshotPage";

export default function App() {
  return (
    <main>
      <Routes>
        <Route path="/" element={<MembersPage />} />
        <Route path="/snapshot/:id" element={<MemberSnapshotPage />} />
      </Routes>
    </main>
  );
}
