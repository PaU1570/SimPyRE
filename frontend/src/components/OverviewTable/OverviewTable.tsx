/**
 * OverviewTable – Combined year-by-year breakdown across all strategies.
 *
 * Shows median portfolio value, net income, and success status per year
 * for every strategy in a single scrollable table.
 */

import { Fragment, useState } from "react";
import type { SimulationReport, StrategySummary } from "@/types/simulation";

// ── Shared constants ─────────────────────────────────────────────

const STRATEGY_LABELS: Record<string, string> = {
  fixed_swr: "Fixed SWR",
  constant_dollar: "Constant Dollar",
  hebeler_autopilot_ii: "Hebeler Autopilot II",
  cash_buffer: "Cash Buffer",
};

const STRATEGY_COLORS = ["#2563eb", "#d97706", "#059669", "#7c3aed"];

function normalizeStrategyType(raw: string): string {
  return raw.replace(/^StrategyType\./i, "").toLowerCase();
}

function strategyLabel(raw: string): string {
  return STRATEGY_LABELS[normalizeStrategyType(raw)] ?? raw;
}

// ── Props ────────────────────────────────────────────────────────

interface OverviewTableProps {
  allReports: SimulationReport[][];
  summaries: StrategySummary[];
}

// ── Component ────────────────────────────────────────────────────

export default function OverviewTable({ allReports, summaries }: OverviewTableProps) {
  const [realMode, setRealMode] = useState(false);
  // null = show medians across all runs; number = inspect that specific run
  const [selectedRun, setSelectedRun] = useState<number | null>(null);

  const numStrategies = summaries.length;
  const numRuns = Math.max(0, ...allReports.map((r) => r.length));
  const maxYears = Math.max(0, ...allReports.flat().map((r) => r.yearly_records.length));
  if (numStrategies === 0 || maxYears === 0) return null;

  // Build row data – either medians or a specific run
  type YearRow = {
    year: number;
    strategies: Array<{
      portfolio: number;
      netIncome: number;
      grossIncome: number;
      /** For median mode: fraction of runs still OK. For single-run: 1 or 0. */
      successPct: number;
    }>;
  };

  const rows: YearRow[] = [];
  for (let y = 0; y < maxYears; y++) {
    const stratData = [];
    for (let si = 0; si < numStrategies; si++) {
      const reports = allReports[si] ?? [];

      if (selectedRun != null) {
        // Single-run mode
        const rec = reports[selectedRun]?.yearly_records[y];
        stratData.push({
          portfolio: rec ? (realMode ? rec.real_portfolio_value : rec.portfolio_value) : 0,
          netIncome: rec ? (realMode ? rec.real_net_income : rec.net_income) : 0,
          grossIncome: rec ? (realMode ? rec.real_gross_income : rec.gross_income) : 0,
          successPct: rec?.goal_achieved ? 1 : 0,
        });
      } else {
        // Median mode
        const portfolioVals = reports
          .map((r) => (realMode ? r.yearly_records[y]?.real_portfolio_value : r.yearly_records[y]?.portfolio_value))
          .filter((v): v is number => v !== undefined)
          .sort((a, b) => a - b);
        const grossVals = reports
          .map((r) => (realMode ? r.yearly_records[y]?.real_gross_income : r.yearly_records[y]?.gross_income))
          .filter((v): v is number => v !== undefined)
          .sort((a, b) => a - b);
        const netVals = reports
          .map((r) => (realMode ? r.yearly_records[y]?.real_net_income : r.yearly_records[y]?.net_income))
          .filter((v): v is number => v !== undefined)
          .sort((a, b) => a - b);
        const successCount = reports.filter(
          (r) => r.yearly_records[y]?.goal_achieved ?? true,
        ).length;

        stratData.push({
          portfolio: pctile(portfolioVals, 0.5),
          netIncome: pctile(netVals, 0.5),
          grossIncome: pctile(grossVals, 0.5),
          successPct: reports.length > 0 ? successCount / reports.length : 1,
        });
      }
    }
    rows.push({ year: y + 1, strategies: stratData });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-700">
          Year-by-Year Breakdown (All Strategies)
        </h3>
        <div className="flex items-center gap-2">
          {/* Run selector */}
          <div className="flex items-center gap-1">
            <label htmlFor="overview-run" className="text-xs text-gray-500">
              Inspect run:
            </label>
            <select
              id="overview-run"
              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
              value={selectedRun ?? "median"}
              onChange={(e) => {
                const v = e.target.value;
                setSelectedRun(v === "median" ? null : Number(v));
              }}
            >
              <option value="median">Median (all runs)</option>
              {Array.from({ length: numRuns }, (_, i) => {
                // Show ✓/✗ based on first strategy's outcome for quick scanning
                const firstReport = allReports[0]?.[i];
                const marker = firstReport ? (firstReport.goal_achieved ? " ✓" : " ✗") : "";
                return (
                  <option key={i} value={i}>
                    Run {i + 1}{marker}
                  </option>
                );
              })}
            </select>
          </div>
          <button
            onClick={() => setRealMode((v) => !v)}
            className="inline-flex items-center rounded-md border border-gray-300 bg-gray-50 px-3 py-1 text-xs font-medium transition-colors hover:bg-gray-100"
          >
            {realMode ? "Show nominal" : "Show real"}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto overflow-y-auto max-h-[480px] rounded-lg border border-gray-200">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 sticky top-0 z-10">
            {/* Strategy group header */}
            <tr className="border-b border-gray-200">
              <th rowSpan={2} className="px-3 py-2 text-left font-medium text-gray-600 align-bottom">
                Year
              </th>
              {summaries.map((s, i) => (
                <th
                  key={i}
                  colSpan={3}
                  className="px-3 py-2 text-center font-semibold border-l border-gray-200"
                  style={{ color: STRATEGY_COLORS[i % STRATEGY_COLORS.length] }}
                >
                  {strategyLabel(s.strategy_type)}
                </th>
              ))}
            </tr>
            {/* Sub-column headers */}
            <tr className="border-b border-gray-200 text-gray-500">
              {summaries.map((_, i) => (
                <Fragment key={i}>
                  <th className="px-3 py-1.5 text-right font-medium border-l border-gray-200">
                    Portfolio
                  </th>
                  <th className="px-3 py-1.5 text-right font-medium">
                    Net Inc.
                  </th>
                  <th className="px-3 py-1.5 text-right font-medium">
                    {selectedRun != null ? "OK" : "OK %"}
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr
                key={row.year}
                id={`overview-yr-${row.year}`}
                className="hover:bg-gray-50/50"
              >
                <td className="px-3 py-1.5 tabular-nums font-medium text-gray-700">
                  {row.year}
                </td>
                {row.strategies.map((sd, si) => (
                  <Fragment key={si}>
                    <td className="px-3 py-1.5 text-right tabular-nums border-l border-gray-100">
                      {fmtEur(sd.portfolio)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {fmtEur(sd.netIncome)}
                    </td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${sd.successPct >= 0.9 ? "text-green-600" : sd.successPct >= 0.7 ? "text-yellow-600" : "text-red-600"}`}>
                      {selectedRun != null
                        ? (sd.successPct >= 1 ? "✓" : "✗")
                        : `${(sd.successPct * 100).toFixed(0)}%`}
                    </td>
                  </Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

function pctile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.ceil(sorted.length * p) - 1);
  return sorted[idx] ?? 0;
}

function fmtEur(n: number): string {
  return n.toLocaleString("en", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}
