// ============================================================
// App.jsx — Root component
// Sets up React Router v6 with two routes:
//   /receptionist → Receptionist screen (staff)
//   /display      → TV display screen (waiting hall)
// ============================================================

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Receptionist from "./Receptionist";
import Display from "./Display";

export default function App() {
  return (
    // BrowserRouter enables URL-based navigation
    <BrowserRouter>
      <Routes>
        {/* Default route: redirect / to /receptionist */}
        <Route path="/" element={<Navigate to="/receptionist" replace />} />

        {/* Staff screen */}
        <Route path="/receptionist" element={<Receptionist />} />

        {/* TV display screen */}
        <Route path="/display" element={<Display />} />
      </Routes>
    </BrowserRouter>
  );
}