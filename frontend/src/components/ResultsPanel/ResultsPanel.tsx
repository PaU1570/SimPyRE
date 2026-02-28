import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";
import type { SimulationResponse, CombinedResponse, SimulationMode } from "@/types/simulation";

interface ResultsPanelProps {
  data: SimulationResponse | CombinedResponse;
  mode?: SimulationMode;
  accumulationYears?: number;
}

export default function ResultsPanel({ data, mode = "withdrawal", accumulationYears }: ResultsPanelProps) {
  const [realMode, setRealMode] = useState(false);
  const { summary, reports } = data;
  const successPct = (summary.success_rate * 100).toFixed(1);

  // ── Portfolio final values ────────────────────────────────
  const finalValues = reports.map((r) => r.final_portfolio_value);
  const realFinalValues = reports.map((r) => r.final_real_portfolio_value);

  const medianFinal = pctile(finalValues, 0.5);
  const p10Final = pctile(finalValues, 0.1);
  const p90Final = pctile(finalValues, 0.9);
  const medianFinalReal = pctile(realFinalValues, 0.5);
  const p10FinalReal = pctile(realFinalValues, 0.1);
  const p90FinalReal = pctile(realFinalValues, 0.9);

  // ── Portfolio at retirement (combined only) ───────────────
  const retirementValues = mode === "combined" && accumulationYears != null
    ? reports.map((r) => r.yearly_records[accumulationYears - 1]?.portfolio_value ?? 0)
    : [];
  const retirementRealValues = mode === "combined" && accumulationYears != null
    ? reports.map((r) => r.yearly_records[accumulationYears - 1]?.real_portfolio_value ?? 0)
    : [];

  // ── Yearly income / contribution ──────────────────────────
  // For combined: only withdrawal-phase income (not cash flow)
  const allGross = reports.flatMap((r) => {
    if (mode === "accumulation") return r.yearly_records.map((y) => y.contribution);
    if (mode === "combined" && accumulationYears != null)
      return r.yearly_records.slice(accumulationYears).map((y) => y.gross_income);
    return r.yearly_records.map((y) => y.gross_income);
  });
  const allNet = reports.flatMap((r) => {
    if (mode === "accumulation") return r.yearly_records.map((y) => y.contribution);
    if (mode === "combined" && accumulationYears != null)
      return r.yearly_records.slice(accumulationYears).map((y) => y.net_income);
    return r.yearly_records.map((y) => y.net_income);
  });
  const allRealGross = reports.flatMap((r) => {
    if (mode === "accumulation") return r.yearly_records.map((y) => y.real_contribution);
    if (mode === "combined" && accumulationYears != null)
      return r.yearly_records.slice(accumulationYears).map((y) => y.real_gross_income);
    return r.yearly_records.map((y) => y.real_gross_income);
  });
  const allRealNet = reports.flatMap((r) => {
    if (mode === "accumulation") return r.yearly_records.map((y) => y.real_contribution);
    if (mode === "combined" && accumulationYears != null)
      return r.yearly_records.slice(accumulationYears).map((y) => y.real_net_income);
    return r.yearly_records.map((y) => y.real_net_income);
  });

  const grossMedian = pctile(allGross, 0.5);
  const grossP10 = pctile(allGross, 0.1);
  const grossP90 = pctile(allGross, 0.9);
  const netMedian = pctile(allNet, 0.5);
  const netP10 = pctile(allNet, 0.1);
  const netP90 = pctile(allNet, 0.9);
  const rGrossMedian = pctile(allRealGross, 0.5);
  const rGrossP10 = pctile(allRealGross, 0.1);
  const rGrossP90 = pctile(allRealGross, 0.9);
  const rNetMedian = pctile(allRealNet, 0.5);
  const rNetP10 = pctile(allRealNet, 0.1);
  const rNetP90 = pctile(allRealNet, 0.9);

  // ── Failure analysis ──────────────────────────────────────
  // For failed simulations, find the year the portfolio first hit ~0
  const failedReports = reports.filter((r) => !r.goal_achieved);
  const failureYears = failedReports.map((r) => {
    const idx = r.yearly_records.findIndex((y) => y.portfolio_value < 1);
    return idx >= 0 ? r.yearly_records[idx]!.year : r.yearly_records.length;
  });
  const sortedFailureYears = [...failureYears].sort((a, b) => a - b);
  const earliestFailure = sortedFailureYears[0] ?? null;
  const medianFailure = sortedFailureYears.length > 0 ? pctile(sortedFailureYears, 0.5) : null;

  // Build failure histogram (1-year bins)
  const failureHist = (() => {
    if (sortedFailureYears.length === 0) return [];
    const minY = sortedFailureYears[0]!;
    const maxY = sortedFailureYears[sortedFailureYears.length - 1]!;
    const bins: Array<{ year: number; count: number }> = [];
    for (let y = minY; y <= maxY; y++) {
      bins.push({ year: y, count: sortedFailureYears.filter((v) => v === y).length });
    }
    return bins;
  })();

  const successColor =
    summary.success_rate >= 0.9
      ? "text-green-600"
      : summary.success_rate >= 0.7
        ? "text-yellow-600"
        : "text-red-600";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Results Summary</h2>
        <Toggle value={realMode} onChange={setRealMode} />
      </div>

      {/* Row 1 – Meta */}
      <div className="grid grid-cols-3 gap-3">
        <SimpleCard
          label="Success rate"
          value={`${successPct}%`}
          valueClass={successColor}
        />
        <SimpleCard label="Simulations" value={String(summary.num_simulations)} />
        {mode === "accumulation" && summary.median_time_to_target != null ? (
          <SimpleCard label="Median yrs to target" value={String(summary.median_time_to_target)} />
        ) : mode === "combined" && "accumulation_years" in summary ? (
          <SimpleCard label="Years" value={`${(summary as { accumulation_years: number }).accumulation_years} + ${(summary as { retirement_years: number }).retirement_years}`} />
        ) : (
          <SimpleCard label="Years" value={String(summary.simulation_years)} />
        )}
      </div>

      {/* Row 2 – Final portfolio */}
      <div className="grid grid-cols-3 gap-3">
        <ValueCard label="Median final portfolio" value={realMode ? medianFinalReal : medianFinal} />
        <ValueCard label="10th pctile final" value={realMode ? p10FinalReal : p10Final} />
        <ValueCard label="90th pctile final" value={realMode ? p90FinalReal : p90Final} />
      </div>

      {/* Row 2b – Portfolio at retirement (combined only) */}
      {mode === "combined" && retirementValues.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <ValueCard
            label="Median portfolio at retirement"
            value={realMode ? pctile(retirementRealValues, 0.5) : pctile(retirementValues, 0.5)}
          />
          <ValueCard
            label="10th pctile at retirement"
            value={realMode ? pctile(retirementRealValues, 0.1) : pctile(retirementValues, 0.1)}
          />
          <ValueCard
            label="90th pctile at retirement"
            value={realMode ? pctile(retirementRealValues, 0.9) : pctile(retirementValues, 0.9)}
          />
        </div>
      )}

      {/* Row 3 – Yearly income / contribution */}
      {mode === "accumulation" ? (
        <div className="grid grid-cols-3 gap-3">
          <ValueCard label="Median yearly contribution" value={realMode ? rGrossMedian : grossMedian} />
          <ValueCard label="10th pctile contribution" value={realMode ? rGrossP10 : grossP10} />
          <ValueCard label="90th pctile contribution" value={realMode ? rGrossP90 : grossP90} />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <IncomeCard
            label="Median yearly income"
            gross={realMode ? rGrossMedian : grossMedian}
            net={realMode ? rNetMedian : netMedian}
          />
          <IncomeCard
            label="10th pctile income"
            gross={realMode ? rGrossP10 : grossP10}
            net={realMode ? rNetP10 : netP10}
          />
          <IncomeCard
            label="90th pctile income"
            gross={realMode ? rGrossP90 : grossP90}
            net={realMode ? rNetP90 : netP90}
          />
        </div>
      )}

      {/* Row 4 – Failure analysis */}
      {failedReports.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <SimpleCard
              label="Failed simulations"
              value={String(failedReports.length)}
              valueClass="text-red-600"
            />
            <SimpleCard
              label="Earliest failure"
              value={earliestFailure != null ? `Year ${earliestFailure}` : "–"}
              valueClass="text-red-600"
            />
            <SimpleCard
              label="Median failure year"
              value={medianFailure != null ? `Year ${medianFailure}` : "–"}
              valueClass="text-red-600"
            />
          </div>

          {/* Failure year histogram */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700">
              Distribution of Failure Year
            </h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={failureHist}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 10 }}
                  label={{ value: "Year", position: "insideBottom", offset: -4, fontSize: 11 }}
                />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  labelFormatter={(l) => `Year ${l}`}
                  formatter={(v: number) => [v, "Simulations"] as [number, string]}
                />
                <Bar dataKey="count" name="Failed sims">
                  {failureHist.map((_, i) => (
                    <Cell key={i} fill="#f87171" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

// ── Toggle ───────────────────────────────────────────────────────

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

// ── Card components ──────────────────────────────────────────────

function SimpleCard({
  label,
  value,
  valueClass = "text-gray-900",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}

/** Single-value portfolio card. */
function ValueCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-gray-900">{fmt(value)}</p>
    </div>
  );
}

/** Shows gross + net income in the same box. */
function IncomeCard({
  label,
  gross,
  net,
}: {
  label: string;
  gross: number;
  net: number;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <div className="mt-1 space-y-0.5">
        <p className="text-sm font-semibold">
          <span className="text-amber-600">{fmt(gross)}</span>
          <span className="ml-1 text-[10px] font-normal text-gray-400">gross</span>
        </p>
        <p className="text-sm font-semibold">
          <span className="text-green-600">{fmt(net)}</span>
          <span className="ml-1 text-[10px] font-normal text-gray-400">net</span>
        </p>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

function pctile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil(sorted.length * p) - 1);
  return sorted[idx] ?? 0;
}

function fmt(n: number): string {
  return n.toLocaleString("en", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "EUR",
  });
}
