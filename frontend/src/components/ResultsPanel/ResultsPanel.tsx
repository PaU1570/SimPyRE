import { useState } from "react";
import type { SimulationResponse } from "@/types/simulation";

interface ResultsPanelProps {
  data: SimulationResponse;
}

export default function ResultsPanel({ data }: ResultsPanelProps) {
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

  // ── Yearly income (flatten all years across all runs) ─────
  const allGross = reports.flatMap((r) => r.yearly_records.map((y) => y.gross_income));
  const allNet = reports.flatMap((r) => r.yearly_records.map((y) => y.net_income));
  const allRealGross = reports.flatMap((r) => r.yearly_records.map((y) => y.real_gross_income));
  const allRealNet = reports.flatMap((r) => r.yearly_records.map((y) => y.real_net_income));

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
        <SimpleCard label="Years" value={String(summary.simulation_years)} />
      </div>

      {/* Row 2 – Final portfolio */}
      <div className="grid grid-cols-3 gap-3">
        <ValueCard label="Median final" value={realMode ? medianFinalReal : medianFinal} />
        <ValueCard label="10th pctile" value={realMode ? p10FinalReal : p10Final} />
        <ValueCard label="90th pctile" value={realMode ? p90FinalReal : p90Final} />
      </div>

      {/* Row 3 – Yearly income (gross / net) */}
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
