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
  Area,
  ComposedChart,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import type { SimulationReport } from "@/types/simulation";

interface ChartsProps {
  reports: SimulationReport[];
}

// ── Toggle Button ────────────────────────────────────────────────

function Toggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-gray-300 bg-gray-50 text-xs font-medium">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1 transition-colors first:rounded-l-md last:rounded-r-md ${
            value === opt.value
              ? "bg-blue-600 text-white"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

/** Build percentile bands per year. */
function buildBands(reports: SimulationReport[]) {
  if (reports.length === 0) return [];

  const maxYears = Math.max(...reports.map((r) => r.yearly_records.length));
  const data: Array<{
    year: number;
    // nominal portfolio
    p10: number;
    p25: number;
    median: number;
    p75: number;
    p90: number;
    // real portfolio
    p10_real: number;
    p25_real: number;
    median_real: number;
    p75_real: number;
    p90_real: number;
    // income (nominal)
    gross_p10: number;
    gross_p25: number;
    gross_median: number;
    gross_p75: number;
    gross_p90: number;
    net_p10: number;
    net_p25: number;
    net_median: number;
    net_p75: number;
    net_p90: number;
    // income (real)
    rgross_p10: number;
    rgross_p25: number;
    rgross_median: number;
    rgross_p75: number;
    rgross_p90: number;
    rnet_p10: number;
    rnet_p25: number;
    rnet_median: number;
    rnet_p75: number;
    rnet_p90: number;
  }> = [];

  for (let y = 0; y < maxYears; y++) {
    const vals = reports.map((r) => r.yearly_records[y]?.portfolio_value).filter((v): v is number => v !== undefined).sort((a, b) => a - b);
    const realVals = reports.map((r) => r.yearly_records[y]?.real_portfolio_value).filter((v): v is number => v !== undefined).sort((a, b) => a - b);
    const grossVals = reports.map((r) => r.yearly_records[y]?.gross_income).filter((v): v is number => v !== undefined).sort((a, b) => a - b);
    const netVals = reports.map((r) => r.yearly_records[y]?.net_income).filter((v): v is number => v !== undefined).sort((a, b) => a - b);
    const rGrossVals = reports.map((r) => r.yearly_records[y]?.real_gross_income).filter((v): v is number => v !== undefined).sort((a, b) => a - b);
    const rNetVals = reports.map((r) => r.yearly_records[y]?.real_net_income).filter((v): v is number => v !== undefined).sort((a, b) => a - b);

    if (vals.length === 0) continue;

    data.push({
      year: y + 1,
      p10: pctile(vals, 0.1),
      p25: pctile(vals, 0.25),
      median: pctile(vals, 0.5),
      p75: pctile(vals, 0.75),
      p90: pctile(vals, 0.9),
      p10_real: pctile(realVals, 0.1),
      p25_real: pctile(realVals, 0.25),
      median_real: pctile(realVals, 0.5),
      p75_real: pctile(realVals, 0.75),
      p90_real: pctile(realVals, 0.9),
      gross_p10: pctile(grossVals, 0.1),
      gross_p25: pctile(grossVals, 0.25),
      gross_median: pctile(grossVals, 0.5),
      gross_p75: pctile(grossVals, 0.75),
      gross_p90: pctile(grossVals, 0.9),
      net_p10: pctile(netVals, 0.1),
      net_p25: pctile(netVals, 0.25),
      net_median: pctile(netVals, 0.5),
      net_p75: pctile(netVals, 0.75),
      net_p90: pctile(netVals, 0.9),
      rgross_p10: pctile(rGrossVals, 0.1),
      rgross_p25: pctile(rGrossVals, 0.25),
      rgross_median: pctile(rGrossVals, 0.5),
      rgross_p75: pctile(rGrossVals, 0.75),
      rgross_p90: pctile(rGrossVals, 0.9),
      rnet_p10: pctile(rNetVals, 0.1),
      rnet_p25: pctile(rNetVals, 0.25),
      rnet_median: pctile(rNetVals, 0.5),
      rnet_p75: pctile(rNetVals, 0.75),
      rnet_p90: pctile(rNetVals, 0.9),
    });
  }
  return data;
}

/** Build histogram with €5k bins up to €100k, then one overflow bin. */
function buildHistogram5k(values: number[]) {
  return buildHistogram(values, 5_000, 100_000);
}

/** Build histogram with €250k bins up to €10M, then one overflow bin. */
function buildHistogram250k(values: number[]) {
  return buildHistogram(values, 250_000, 10_000_000);
}

function buildHistogram(values: number[], binWidth: number, maxBin: number) {
  if (values.length === 0) return [];

  const numBins = maxBin / binWidth;

  type Bin = { binStart: number; binEnd: number; count: number; label: string };
  const bins: Bin[] = Array.from({ length: numBins }, (_, i) => ({
    binStart: i * binWidth,
    binEnd: (i + 1) * binWidth,
    count: 0,
    label: fmtEur(i * binWidth),
  }));

  // overflow bin
  bins.push({ binStart: maxBin, binEnd: Infinity, count: 0, label: `>${fmtEur(maxBin)}` });

  for (const v of values) {
    if (v >= maxBin) {
      bins[numBins]!.count++;
    } else {
      const idx = Math.max(0, Math.min(numBins - 1, Math.floor(v / binWidth)));
      bins[idx]!.count++;
    }
  }

  return bins;
}

function pctile(sorted: number[], p: number): number {
  const idx = Math.max(0, Math.ceil(sorted.length * p) - 1);
  return sorted[idx] ?? 0;
}

function fmtEur(n: number): string {
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `€${(n / 1_000).toFixed(0)}k`;
  return `€${n.toFixed(0)}`;
}

function fmtEurFull(n: number): string {
  return n.toLocaleString("en", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

/** Custom tooltip that shows Median first, then p75/p25, then p90/p10.
 *  Reads values from the underlying data row (payload[0].payload) so it
 *  works with stacked-area dataKeys that differ from the original keys. */
function FanTooltipContent({
  active,
  payload,
  label,
  medianKey,
  p75Key,
  p25Key,
  p90Key,
  p10Key,
}: {
  active?: boolean;
  payload?: Array<{ payload?: Record<string, number> }>;
  label?: number;
  medianKey: string;
  p75Key: string;
  p25Key: string;
  p90Key: string;
  p10Key: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  // The full data row is available on any payload entry
  const row: Record<string, number> = payload[0]?.payload ?? {};
  const rows: Array<{ label: string; value: number; color: string }> = [
    { label: "Median", value: row[medianKey] ?? 0, color: "#2563eb" },
    { label: "p90", value: row[p90Key] ?? 0, color: "#93c5fd" },
    { label: "p75", value: row[p75Key] ?? 0, color: "#60a5fa" },
    { label: "p25", value: row[p25Key] ?? 0, color: "#60a5fa" },
    { label: "p10", value: row[p10Key] ?? 0, color: "#93c5fd" },
  ];

  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-gray-700">Year {label}</p>
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between gap-4">
          <span style={{ color: r.color }}>{r.label}</span>
          <span className="tabular-nums font-medium">{fmtEurFull(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Shared fan chart using stacked areas (no white masks, grid stays visible). */
function PortfolioFanChart({
  data,
  medianKey,
  p75Key,
  p25Key,
  p90Key,
  p10Key,
  accentColor = "#2563eb",
  lightFill = "#bfdbfe",
  darkFill = "#60a5fa",
}: {
  data: Array<Record<string, number>>;
  medianKey: string;
  p75Key: string;
  p25Key: string;
  p90Key: string;
  p10Key: string;
  accentColor?: string;
  lightFill?: string;
  darkFill?: string;
}) {
  // Compute stacked band heights so we don't need white masks
  const stackedData = data.map((d) => ({
    ...d,
    _base: d[p10Key] ?? 0,
    _band_lo: (d[p25Key] ?? 0) - (d[p10Key] ?? 0),
    _band_mid: (d[p75Key] ?? 0) - (d[p25Key] ?? 0),
    _band_hi: (d[p90Key] ?? 0) - (d[p75Key] ?? 0),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={stackedData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="year" tick={{ fontSize: 11 }} label={{ value: "Year", position: "insideBottom", offset: -4, fontSize: 12 }} />
        <YAxis tickFormatter={fmtEur} tick={{ fontSize: 11 }} width={70} />
        <Tooltip content={<FanTooltipContent medianKey={medianKey} p75Key={p75Key} p25Key={p25Key} p90Key={p90Key} p10Key={p10Key} />} />
        <Legend verticalAlign="top" height={30} />

        {/* Invisible base (0 → p10) — activeDot so p10 gets a hover marker */}
        <Area dataKey="_base" stackId="fan" stroke="none" fill="transparent" name="_base" type="monotone" legendType="none" activeDot={{ r: 3, fill: lightFill, stroke: "white", strokeWidth: 1 }} />

        {/* Light band (p10 → p25) */}
        <Area dataKey="_band_lo" stackId="fan" stroke="none" fill={lightFill} fillOpacity={0.45} name="p10–p90" type="monotone" legendType="square" />

        {/* Darker band (p25 → p75) */}
        <Area dataKey="_band_mid" stackId="fan" stroke="none" fill={darkFill} fillOpacity={0.4} name="p25–p75" type="monotone" legendType="square" />

        {/* Light band (p75 → p90) — same colour as p10–p25, hidden legend */}
        <Area dataKey="_band_hi" stackId="fan" stroke="none" fill={lightFill} fillOpacity={0.45} name="_band_hi" type="monotone" legendType="none" />

        {/* Median line (not stacked) */}
        <Line dataKey={medianKey} stroke={accentColor} strokeWidth={2} dot={false} name="Median" type="monotone" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Reusable histogram tooltip formatter. */
function histTooltipLabel(_: unknown, payload: Array<{ payload?: { binStart?: number; binEnd?: number } }>) {
  const p = payload[0]?.payload;
  if (!p) return "";
  if (p.binEnd === Infinity) return `${fmtEur(p.binStart ?? 0)}+`;
  return `${fmtEur(p.binStart ?? 0)} – ${fmtEur(p.binEnd ?? 0)}`;
}
const histTooltipValue = (v: number) => [v, "Count"] as [number, string];

// ── Component ────────────────────────────────────────────────────

export default function Charts({ reports }: ChartsProps) {
  const [portfolioMode, setPortfolioMode] = useState<"nominal" | "real">("nominal");
  const [incomeMode, setIncomeMode] = useState<"gross" | "net">("gross");
  const [incomeRealNom, setIncomeRealNom] = useState<"nominal" | "real">("nominal");
  const [portfolioHistMode, setPortfolioHistMode] = useState<"nominal" | "real">("real");
  const [incomeHistMode, setIncomeHistMode] = useState<"gross" | "net">("net");
  const [incomeHistRealNom, setIncomeHistRealNom] = useState<"nominal" | "real">("real");

  const bands = buildBands(reports);

  if (bands.length === 0) return null;

  // ── Fan chart keys based on toggle ─────────────────────────
  const fanKeys =
    portfolioMode === "nominal"
      ? { medianKey: "median", p75Key: "p75", p25Key: "p25", p90Key: "p90", p10Key: "p10" }
      : { medianKey: "median_real", p75Key: "p75_real", p25Key: "p25_real", p90Key: "p90_real", p10Key: "p10_real" };

  const prefix = incomeRealNom === "real" ? (incomeMode === "gross" ? "rgross" : "rnet") : (incomeMode === "gross" ? "gross" : "net");
  const incomeKeys = {
    medianKey: `${prefix}_median`,
    p75Key: `${prefix}_p75`,
    p25Key: `${prefix}_p25`,
    p90Key: `${prefix}_p90`,
    p10Key: `${prefix}_p10`,
  };

  const incomeColor = incomeMode === "gross" ? "#d97706" : "#16a34a";

  // ── Histogram data (real values, €5k bins) ─────────────────
  const finalNominal = reports.map((r) => r.final_portfolio_value);
  const finalReal = reports.map((r) => r.final_real_portfolio_value);
  const allGross = reports.flatMap((r) => r.yearly_records.map((y) => y.gross_income));
  const allNet = reports.flatMap((r) => r.yearly_records.map((y) => y.net_income));
  const allRealGross = reports.flatMap((r) => r.yearly_records.map((y) => y.real_gross_income));
  const allRealNet = reports.flatMap((r) => r.yearly_records.map((y) => y.real_net_income));

  const histPortfolio = buildHistogram250k(portfolioHistMode === "nominal" ? finalNominal : finalReal);
  const incomeHistValues =
    incomeHistRealNom === "real"
      ? (incomeHistMode === "gross" ? allRealGross : allRealNet)
      : (incomeHistMode === "gross" ? allGross : allNet);
  const histIncome = buildHistogram5k(incomeHistValues);

  const portfolioHistColor = portfolioHistMode === "nominal" ? "#60a5fa" : "#4ade80";
  const incomeHistColor = incomeHistMode === "gross" ? "#fbbf24" : "#4ade80";

  return (
    <div className="space-y-6">
      {/* ── Portfolio Fan Chart (toggled) ─────────────────────── */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">
            Portfolio Value – {portfolioMode === "nominal" ? "Nominal" : "Real (inflation-adj.)"}
          </h3>
          <Toggle
            options={[
              { value: "nominal" as const, label: "Nominal" },
              { value: "real" as const, label: "Real" },
            ]}
            value={portfolioMode}
            onChange={setPortfolioMode}
          />
        </div>
        <PortfolioFanChart data={bands} {...fanKeys} />
      </div>

      {/* ── Median Portfolio: Nominal vs Real ─────────────────── */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">
          Median Portfolio: Nominal vs Real
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={bands}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} label={{ value: "Year", position: "insideBottom", offset: -4, fontSize: 12 }} />
            <YAxis tickFormatter={fmtEur} tick={{ fontSize: 11 }} width={70} />
            <Tooltip formatter={(v: number) => fmtEurFull(v)} />
            <Legend verticalAlign="top" height={30} />

            <Line dataKey="median" stroke="#2563eb" strokeWidth={2} dot={false} name="Nominal" type="monotone" />
            <Line dataKey="median_real" stroke="#16a34a" strokeWidth={2} strokeDasharray="6 3" dot={false} name="Real (inflation-adj.)" type="monotone" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Income Over Time (toggled gross/net) ──────────────── */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">
            Income Over Time – {incomeMode === "gross" ? "Gross" : "Net"}{incomeRealNom === "real" ? " (Real)" : ""}
          </h3>
          <div className="flex gap-2">
            <Toggle
              options={[
                { value: "gross" as const, label: "Gross" },
                { value: "net" as const, label: "Net" },
              ]}
              value={incomeMode}
              onChange={setIncomeMode}
            />
            <Toggle
              options={[
                { value: "nominal" as const, label: "Nominal" },
                { value: "real" as const, label: "Real" },
              ]}
              value={incomeRealNom}
              onChange={setIncomeRealNom}
            />
          </div>
        </div>
        <PortfolioFanChart
          data={bands}
          {...incomeKeys}
          accentColor={incomeColor}
          lightFill={incomeMode === "gross" ? "#fde68a" : "#bbf7d0"}
          darkFill={incomeMode === "gross" ? "#f59e0b" : "#4ade80"}
        />
      </div>

      {/* ── Histogram: Final Portfolio Value ───────────────────── */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">
            Distribution of Final Portfolio Value – {portfolioHistMode === "nominal" ? "Nominal" : "Real"}
          </h3>
          <Toggle
            options={[
              { value: "nominal" as const, label: "Nominal" },
              { value: "real" as const, label: "Real" },
            ]}
            value={portfolioHistMode}
            onChange={setPortfolioHistMode}
          />
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={histPortfolio}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={3} angle={-30} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip labelFormatter={histTooltipLabel} formatter={histTooltipValue} />
            <Bar dataKey="count" name="Simulations">
              {histPortfolio.map((_, i) => (
                <Cell key={i} fill={portfolioHistColor} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Histogram: Yearly Income ──────────────────────────── */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">
            Distribution of Yearly Income – {incomeHistMode === "gross" ? "Gross" : "Net"}{incomeHistRealNom === "real" ? " (Real)" : ""}
          </h3>
          <div className="flex gap-2">
            <Toggle
              options={[
                { value: "gross" as const, label: "Gross" },
                { value: "net" as const, label: "Net" },
              ]}
              value={incomeHistMode}
              onChange={setIncomeHistMode}
            />
            <Toggle
              options={[
                { value: "nominal" as const, label: "Nominal" },
                { value: "real" as const, label: "Real" },
              ]}
              value={incomeHistRealNom}
              onChange={setIncomeHistRealNom}
            />
          </div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={histIncome}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={3} angle={-30} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip labelFormatter={histTooltipLabel} formatter={histTooltipValue} />
            <Bar dataKey="count" name="Year-runs">
              {histIncome.map((_, i) => (
                <Cell key={i} fill={incomeHistColor} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
