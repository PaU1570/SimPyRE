import { BrowserRouter, Routes, Route } from "react-router-dom";
import SimulationPage from "@/pages/SimulationPage";
import ResultsPage from "@/pages/ResultsPage";

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        {/* ── Header ───────────────────────────────────────── */}
        <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-7xl items-center px-4 lg:px-6">
            <span className="text-lg font-bold tracking-tight text-primary-700">
              SimPyRE
            </span>
            <span className="ml-2 text-xs text-gray-400">
              Retirement Simulator
            </span>
          </div>
        </header>

        {/* ── Main content ─────────────────────────────────── */}
        <div className="mx-auto max-w-7xl">
          <Routes>
            <Route path="/" element={<SimulationPage />} />
            <Route path="/results" element={<ResultsPage />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
