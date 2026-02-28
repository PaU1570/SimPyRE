import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import SimulationPage from "@/pages/SimulationPage";
import AccumulationPage from "@/pages/AccumulationPage";
import CombinedPage from "@/pages/CombinedPage";
import ResultsPage from "@/pages/ResultsPage";

const navLinkCls = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
    isActive
      ? "bg-primary-100 text-primary-700"
      : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
  }`;

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        {/* ── Header ───────────────────────────────────────── */}
        <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 lg:px-6">
            <span className="text-lg font-bold tracking-tight text-primary-700">
              SimPyRE
            </span>
            <nav className="flex items-center gap-1">
              <NavLink to="/accumulation" className={navLinkCls}>
                Accumulation
              </NavLink>
              <NavLink to="/" end className={navLinkCls}>
                Retirement
              </NavLink>
              <NavLink to="/combined" className={navLinkCls}>
                Full Plan
              </NavLink>
            </nav>
          </div>
        </header>

        {/* ── Main content ─────────────────────────────────── */}
        <div className="mx-auto max-w-7xl">
          <Routes>
            <Route path="/" element={<SimulationPage />} />
            <Route path="/accumulation" element={<AccumulationPage />} />
            <Route path="/combined" element={<CombinedPage />} />
            <Route path="/results" element={<ResultsPage />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
