import { useEffect, useState } from "react";
import ConfigForm from "@/components/ConfigForm";
import ResultsPanel from "@/components/ResultsPanel";
import Charts from "@/components/Charts";
import YearlyTable from "@/components/YearlyTable";
import {
  useSimulation,
  useTaxRegions,
  useCountries,
} from "@/hooks/useSimulation";

/**
 * Main simulation page – side-by-side layout.
 * Left: configuration form. Right: results (summary, charts, table).
 */
export default function SimulationPage() {
  const sim = useSimulation();
  const tax = useTaxRegions();
  const ctry = useCountries();

  // Load reference data on mount
  useEffect(() => {
    tax.load();
    ctry.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Which simulation run to inspect in the table (for multi-run)
  const [selectedRun, setSelectedRun] = useState(0);
  const report = sim.data?.reports[selectedRun];

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col lg:flex-row gap-6 p-4 lg:p-6">
      {/* ── Left panel: Config Form ──────────────────────────── */}
      <aside className="w-full lg:w-[380px] shrink-0">
        <div className="sticky top-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-gray-800">
            Simulation Config
          </h2>
          <ConfigForm
            onSubmit={sim.run}
            loading={sim.loading}
            taxRegions={tax.regions}
            countries={ctry.countries}
          />
        </div>
      </aside>

      {/* ── Right panel: Results ──────────────────────────────── */}
      <main className="flex-1 min-w-0 space-y-6">
        {/* Loading state */}
        {sim.loading && (
          <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-white p-12 shadow-sm">
            <div className="flex items-center gap-3 text-gray-500">
              <Spinner />
              <span>Running simulation…</span>
            </div>
          </div>
        )}

        {/* Error state */}
        {sim.error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
            <strong>Error:</strong> {sim.error}
          </div>
        )}

        {/* Empty state */}
        {!sim.data && !sim.loading && !sim.error && (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white p-16 text-gray-400 shadow-sm">
            <p className="text-center text-sm">
              Configure your simulation on the left and press{" "}
              <span className="font-semibold text-primary-600">
                Run Simulation
              </span>{" "}
              to see results here.
            </p>
          </div>
        )}

        {/* Results */}
        {sim.data && (
          <>
            {/* Summary cards */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <ResultsPanel data={sim.data} />
            </div>

            {/* Charts */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <Charts reports={sim.data.reports} />
            </div>

            {/* Run selector + yearly table */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
              {sim.data.reports.length > 1 && (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-gray-600">
                    Inspect run:
                  </label>
                  <select
                    className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
                    value={selectedRun}
                    onChange={(e) => setSelectedRun(Number(e.target.value))}
                  >
                    {sim.data.reports.map((r, i) => (
                      <option key={i} value={i}>
                        Run {i + 1}
                        {r.goal_achieved ? " ✓" : " ✗"}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {report && <YearlyTable records={report.yearly_records} />}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ── Spinner ──────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="h-5 w-5 animate-spin text-primary-600"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}
