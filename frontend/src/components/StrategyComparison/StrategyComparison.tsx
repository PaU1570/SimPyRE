/**
 * Strategy Comparison Panel
 *
 * Shown when the user runs a multi-strategy simulation.
 * Displays:
 *  1. A comparison summary table (success rate, median final portfolio, etc.)
 *  2. Overlay median-portfolio chart across strategies
 *  3. Overlay median-income chart across strategies
 */

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import type {
  SimulationResponse,
} from "@/types/simulation";

// ── Strategy labels & colours ────────────────────────────────────

const STRATEGY_LABELS: Record<string, string> = {
  fixed_swr: "Fixed SWR",
  constant_dollar: "Constant Dollar",
  hebeler_autopilot_ii: "Hebeler Autopilot II",
  cash_buffer: "Cash Buffer",
};

const STRATEGY_COLORS = [
  "#2563eb", // blue
  "#d97706", // amber
  "#059669", // emerald
  "#7c3aed", // purple
];

/** Normalise strategy type strings from the backend.
 *  Handles both `"fixed_swr"` and legacy `"StrategyType.FIXED_SWR"` formats.
 */
function normalizeStrategyType(raw: string): string {
  return raw.replace(/^StrategyType\./i, "").toLowerCase();
}

function strategyLabel(raw: string): string {
  return STRATEGY_LABELS[normalizeStrategyType(raw)] ?? raw;
}

// ── Props ────────────────────────────────────────────────────────

interface StrategyComparisonProps {
  data: SimulationResponse;
  /** Called when the user clicks a strategy to inspect its full reports. */
  onSelectStrategy?: (index: number) => void;
}

// ── Component ────────────────────────────────────────────────────

export default function StrategyComparison({
  data,
  onSelectStrategy,
}: StrategyComparisonProps) {
  const [realMode, setRealMode] = useState(false);

  const summaries = data.summary.strategy_summaries ?? [];
  const allReports = data.all_strategy_reports ?? [];

  if (summaries.length < 2 || allReports.length < 2) return null;

  // ── Build comparison data ──────────────────────────────────

  // Per-strategy percentile data
  const maxYears = Math.max(
    ...allReports.flat().map((r) => r.yearly_records.length),
  );

  // Build overlay chart data: { year, s0_median, s1_median, … }
  const overlayPortfolio: Array<Record<string, number>> = [];
  const overlayIncome: Array<Record<string, number>> = [];

  for (let y = 0; y < maxYears; y++) {
    const row: Record<string, number> = { year: y + 1 };
    const incRow: Record<string, number> = { year: y + 1 };

    for (let si = 0; si < allReports.length; si++) {
      const reports = allReports[si]!;
      const vals = reports
        .map((r) => r.yearly_records[y]?.portfolio_value)
        .filter((v): v is number => v !== undefined)
        .sort((a, b) => a - b);
      const realVals = reports
        .map((r) => r.yearly_records[y]?.real_portfolio_value)
        .filter((v): v is number => v !== undefined)
        .sort((a, b) => a - b);
      const grossVals = reports
        .map((r) => r.yearly_records[y]?.gross_income)
        .filter((v): v is number => v !== undefined)
        .sort((a, b) => a - b);
      const netVals = reports
        .map((r) => r.yearly_records[y]?.net_income)
        .filter((v): v is number => v !== undefined)
        .sort((a, b) => a - b);
      const rGrossVals = reports
        .map((r) => r.yearly_records[y]?.real_gross_income)
        .filter((v): v is number => v !== undefined)
        .sort((a, b) => a - b);
      const rNetVals = reports
        .map((r) => r.yearly_records[y]?.real_net_income)
        .filter((v): v is number => v !== undefined)
        .sort((a, b) => a - b);

      if (vals.length > 0) {
        row[`s${si}_median`] = pctile(vals, 0.5);
        row[`s${si}_median_real`] = pctile(realVals, 0.5);
        row[`s${si}_p25`] = pctile(vals, 0.25);
        row[`s${si}_p75`] = pctile(vals, 0.75);
        row[`s${si}_p25_real`] = pctile(realVals, 0.25);
        row[`s${si}_p75_real`] = pctile(realVals, 0.75);
      }
      if (grossVals.length > 0) {
        incRow[`s${si}_gross`] = pctile(grossVals, 0.5);
        incRow[`s${si}_net`] = pctile(netVals, 0.5);
        incRow[`s${si}_rgross`] = pctile(rGrossVals, 0.5);
        incRow[`s${si}_rnet`] = pctile(rNetVals, 0.5);
      }
    }

    overlayPortfolio.push(row);
    overlayIncome.push(incRow);
  }

  // Per-strategy summary stats
  const strategyStats = summaries.map((s, i) => {
    const reports = allReports[i] ?? [];
    const finalVals = reports.map((r) => r.final_portfolio_value).sort((a, b) => a - b);
    const finalValsReal = reports.map((r) => r.final_real_portfolio_value).sort((a, b) => a - b);
    const allNet = reports.flatMap((r) =>
      r.yearly_records.map((y) => y.net_income),
    );
    const allRealNet = reports.flatMap((r) =>
      r.yearly_records.map((y) => y.real_net_income),
    );
    return {
      index: i,
      label: strategyLabel(s.strategy_type),
      type: s.strategy_type,
      color: STRATEGY_COLORS[i % STRATEGY_COLORS.length]!,
      successRate: s.success_rate,
      medianFinal: pctile(finalVals, 0.5),
      medianFinalReal: pctile(finalValsReal, 0.5),
      medianNet: pctile(allNet.sort((a, b) => a - b), 0.5),
      medianRealNet: pctile(allRealNet.sort((a, b) => a - b), 0.5),
    };
  });

  // Success-rate bar chart data
  const successBarData = strategyStats.map((s) => ({
    name: s.label,
    successRate: s.successRate * 100,
    color: s.color,
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">
          Strategy Comparison
        </h2>
        <Toggle value={realMode} onChange={setRealMode} />
      </div>

      {/* ── Summary Table ────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2 pr-4 font-medium">Strategy</th>
              <th className="py-2 pr-4 font-medium text-right">Success Rate</th>
              <th className="py-2 pr-4 font-medium text-right">
                Median Final Portfolio
              </th>
              <th className="py-2 pr-4 font-medium text-right">
                Median Net Income
              </th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {strategyStats.map((s) => (
              <tr
                key={s.index}
                className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => onSelectStrategy?.(s.index)}
              >
                <td className="py-2 pr-4 font-medium" style={{ color: s.color }}>
                  <span
                    className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  {s.label}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  <span
                    className={
                      s.successRate >= 0.9
                        ? "text-green-600"
                        : s.successRate >= 0.7
                          ? "text-yellow-600"
                          : "text-red-600"
                    }
                  >
                    {(s.successRate * 100).toFixed(1)}%
                  </span>
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {fmtEur(realMode ? s.medianFinalReal : s.medianFinal)}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {fmtEur(realMode ? s.medianRealNet : s.medianNet)}
                </td>
                <td className="py-2 text-right">
                  {onSelectStrategy && (
                    <button
                      className="text-[10px] text-primary-600 hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectStrategy(s.index);
                      }}
                    >
                      Details →
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Success Rate Bar Chart ───────────────────────────── */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">
          Success Rate
        </h3>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={successBarData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              type="number"
              domain={[0, 100]}
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => `${v}%`}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={130}
              tick={{ fontSize: 10 }}
            />
            <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, "Success Rate"]} />
            <Bar dataKey="successRate" name="Success Rate" barSize={20}>
              {successBarData.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Median Portfolio Overlay ─────────────────────────── */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">
          Median Portfolio Value {realMode ? "(Real)" : "(Nominal)"}
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={overlayPortfolio}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="year"
              tick={{ fontSize: 11 }}
              label={{
                value: "Year",
                position: "insideBottom",
                offset: -4,
                fontSize: 12,
              }}
            />
            <YAxis tickFormatter={fmtEurShort} tick={{ fontSize: 11 }} width={70} />
            <Tooltip
              content={
                <ComparisonTooltip
                  strategies={strategyStats}
                  suffix="median"
                  realMode={realMode}
                />
              }
            />
            <Legend verticalAlign="top" height={30} />
            {strategyStats.map((s) => (
              <Line
                key={s.index}
                dataKey={realMode ? `s${s.index}_median_real` : `s${s.index}_median`}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                name={s.label}
                type="monotone"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Median Income Overlay ────────────────────────────── */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">
          Median Net Income {realMode ? "(Real)" : "(Nominal)"}
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={overlayIncome}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="year"
              tick={{ fontSize: 11 }}
              label={{
                value: "Year",
                position: "insideBottom",
                offset: -4,
                fontSize: 12,
              }}
            />
            <YAxis tickFormatter={fmtEurShort} tick={{ fontSize: 11 }} width={70} />
            <Tooltip
              content={
                <ComparisonTooltip
                  strategies={strategyStats}
                  suffix="rnet"
                  nominalSuffix="net"
                  realMode={realMode}
                />
              }
            />
            <Legend verticalAlign="top" height={30} />
            {strategyStats.map((s) => (
              <Line
                key={s.index}
                dataKey={realMode ? `s${s.index}_rnet` : `s${s.index}_net`}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                name={s.label}
                type="monotone"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────

function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-gray-300 bg-gray-50 text-xs font-medium">
      <button
        onClick={() => onChange(false)}
        className={`px-3 py-1 rounded-l-md transition-colors ${
          !value ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
        }`}
      >
        Nominal
      </button>
      <button
        onClick={() => onChange(true)}
        className={`px-3 py-1 rounded-r-md transition-colors ${
          value ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
        }`}
      >
        Real
      </button>
    </div>
  );
}

/** Custom tooltip for overlay comparison charts. */
function ComparisonTooltip({
  active,
  payload,
  label,
  strategies,
  suffix,
  nominalSuffix,
  realMode,
}: {
  active?: boolean;
  payload?: Array<{ payload?: Record<string, number> }>;
  label?: number;
  strategies: Array<{ index: number; label: string; color: string }>;
  suffix: string;
  nominalSuffix?: string;
  realMode: boolean;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload ?? {};
  const suf = realMode ? suffix : (nominalSuffix ?? suffix);

  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-gray-700">Year {label}</p>
      {strategies.map((s) => (
        <div key={s.index} className="flex justify-between gap-4">
          <span style={{ color: s.color }}>{s.label}</span>
          <span className="tabular-nums font-medium">
            {fmtEur(row[`s${s.index}_${suf}`] ?? 0)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

function pctile(sorted: number[], p: number): number {
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

function fmtEurShort(n: number): string {
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `€${(n / 1_000).toFixed(0)}k`;
  return `€${n.toFixed(0)}`;
}
