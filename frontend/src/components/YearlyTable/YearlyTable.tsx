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
  ReferenceLine,
} from "recharts";
import type { YearRecord, SimulationMode } from "@/types/simulation";

interface YearlyTableProps {
  records: YearRecord[];
  mode?: SimulationMode;
  accumulationYears?: number;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtEur(n: number): string {
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `€${(n / 1_000).toFixed(0)}k`;
  return `€${n.toFixed(0)}`;
}

function fmtEurFull(n: number): string {
  return n.toLocaleString("en", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

export default function YearlyTable({ records, mode = "withdrawal", accumulationYears }: YearlyTableProps) {
  const [expanded, setExpanded] = useState(false);
  const [realMode, setRealMode] = useState(false);
  const display = expanded ? records : records.slice(0, 10);

  // Build chart data for this simulation's market returns
  const marketChartData = records.map((r) => ({
    year: r.year,
    stock: r.stock_return,
    bond: r.bond_return,
    cash: r.cash_return,
    combined: r.combined_return,
    inflation: r.inflation_rate,
    real_stock: r.stock_return - r.inflation_rate,
    real_bond: r.bond_return - r.inflation_rate,
    real_cash: r.cash_return - r.inflation_rate,
    real_combined: r.combined_return - r.inflation_rate,
  }));

  const pfx = realMode ? "real_" : "";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">
          Year-by-Year Breakdown
        </h3>
        <button
          onClick={() => setRealMode((v) => !v)}
          className="inline-flex items-center rounded-md border border-gray-300 bg-gray-50 px-3 py-1 text-xs font-medium transition-colors hover:bg-gray-100"
        >
          {realMode ? "Show nominal" : "Show real"}
        </button>
      </div>

      {/* ── Market Returns Chart ──────────────────────────────── */}
      <div>
        <h4 className="mb-1 text-xs font-medium text-gray-500">
          Market Returns{realMode ? " (Real)" : ""}
        </h4>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={marketChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="year" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={fmtPct} tick={{ fontSize: 10 }} width={50} />
            <Tooltip
              formatter={(v: number, name: string) => [fmtPct(v), name]}
              labelFormatter={(l) => `Year ${l}`}
              contentStyle={{ fontSize: 11 }}
            />
            <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey={`${pfx}combined`} stroke="#10b981" strokeWidth={2} dot={false} name="Combined" type="monotone" />
            <Line dataKey={`${pfx}stock`} stroke="#3b82f6" strokeWidth={1.5} dot={false} name="Stocks" type="monotone" />
            <Line dataKey={`${pfx}bond`} stroke="#f59e0b" strokeWidth={1.5} dot={false} name="Bonds" type="monotone" />
            <Line dataKey={`${pfx}cash`} stroke="#8b5cf6" strokeWidth={1.5} dot={false} name="Cash" type="monotone" />
            {!realMode && (
              <Line dataKey="inflation" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="6 3" dot={false} name="Inflation" type="monotone" />
            )}
            {accumulationYears != null && (
              <ReferenceLine x={accumulationYears} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="6 3" />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Portfolio Value Chart ─────────────────────────────── */}
      <div>
        <h4 className="mb-1 text-xs font-medium text-gray-500">
          Portfolio Value{realMode ? " (Real)" : ""}
        </h4>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={records}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="year" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={fmtEur} tick={{ fontSize: 10 }} width={60} />
            <Tooltip
              formatter={(v: number, name: string) => [fmtEurFull(v), name]}
              labelFormatter={(l) => `Year ${l}`}
              contentStyle={{ fontSize: 11 }}
            />
            <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey={realMode ? "real_portfolio_value" : "portfolio_value"} stroke="#2563eb" strokeWidth={1.5} dot={false} name="Portfolio" type="monotone" />
            {!realMode && (
              <Line dataKey="real_portfolio_value" stroke="#16a34a" strokeWidth={1.5} strokeDasharray="6 3" dot={false} name="Real Portfolio" type="monotone" />
            )}
            {accumulationYears != null && (
              <ReferenceLine x={accumulationYears} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="6 3" />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Income / Contribution Chart ────────────────────── */}
      <div>
        <h4 className="mb-1 text-xs font-medium text-gray-500">
          {mode === "accumulation" ? "Yearly Contribution" : mode === "combined" ? "Yearly Cash Flow" : "Yearly Income"}{realMode ? " (Real)" : ""}
        </h4>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={records}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="year" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={fmtEur} tick={{ fontSize: 10 }} width={60} />
            <Tooltip
              formatter={(v: number, name: string) => [fmtEurFull(v), name]}
              labelFormatter={(l) => `Year ${l}`}
              contentStyle={{ fontSize: 11 }}
            />
            <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 11 }} />
            {(mode === "accumulation" || mode === "combined") && (
              <Line dataKey={realMode ? "real_contribution" : "contribution"} stroke="#2563eb" strokeWidth={1.5} dot={false} name="Contribution" type="monotone" />
            )}
            {(mode === "withdrawal" || mode === "combined") && (
              <Line dataKey={realMode ? "real_gross_income" : "gross_income"} stroke="#d97706" strokeWidth={1.5} dot={false} name="Gross" type="monotone" />
            )}
            {(mode === "withdrawal" || mode === "combined") && (
              <Line dataKey={realMode ? "real_net_income" : "net_income"} stroke="#16a34a" strokeWidth={1.5} dot={false} name="Net" type="monotone" />
            )}
            {accumulationYears != null && (
              <ReferenceLine x={accumulationYears} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="6 3" />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <Th>Year</Th>
              <Th>Portfolio</Th>
              <Th>Allocation</Th>
              <Th>Return</Th>
              <Th>Inflation</Th>
              {(mode === "accumulation" || mode === "combined") && (
                <Th>Contribution</Th>
              )}
              {(mode === "withdrawal" || mode === "combined") && (
                <Th>Gross Inc.</Th>
              )}
              {(mode === "withdrawal" || mode === "combined") && (
                <Th>Net Inc.</Th>
              )}
              {(mode === "withdrawal" || mode === "combined") && (
                <Th>CG Tax</Th>
              )}
              <Th>Wealth Tax</Th>
              {!realMode && <Th>Real Portfolio</Th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {display.map((r) => (
              <tr key={r.year} className={r.goal_achieved ? "hover:bg-gray-50/50" : "bg-red-50 hover:bg-red-100"}>
                <Td>{r.year}</Td>
                <Td>{eur(realMode ? r.real_portfolio_value : r.portfolio_value)}</Td>
                <Td>
                  <div className="flex flex-col leading-tight">
                    {Object.entries(r.portfolio_allocation)
                      .filter(([, v]) => v > 0)
                      .map(([k, v]) => {
                        const abs = v * (realMode ? r.real_portfolio_value : r.portfolio_value);
                        return (
                          <span key={k}>
                            {k[0]!.toUpperCase() + k.slice(1)} {(v * 100).toFixed(0)}%{" "}
                            <span className="text-gray-400">{fmtEur(abs)}</span>
                          </span>
                        );
                      })}
                  </div>
                </Td>
                <Td>{pct(r.combined_return)}</Td>
                <Td>{pct(r.inflation_rate)}</Td>
                {(mode === "accumulation" || mode === "combined") && (
                  <Td>{eur(realMode ? r.real_contribution : r.contribution)}</Td>
                )}
                {(mode === "withdrawal" || mode === "combined") && (
                  <Td>{eur(realMode ? r.real_gross_income : r.gross_income)}</Td>
                )}
                {(mode === "withdrawal" || mode === "combined") && (
                  <Td>{eur(realMode ? r.real_net_income : r.net_income)}</Td>
                )}
                {(mode === "withdrawal" || mode === "combined") && (
                  <Td>{eur(realMode ? r.real_capital_gains_tax : r.capital_gains_tax)} ({taxPct(realMode ? r.real_capital_gains_tax : r.capital_gains_tax, realMode ? r.real_gross_income : r.gross_income)})</Td>
                )}
                <Td>{eur(realMode ? r.real_wealth_tax : r.wealth_tax)} ({taxPct(realMode ? r.real_wealth_tax : r.wealth_tax, realMode ? r.real_portfolio_value : r.portfolio_value)})</Td>
                {!realMode && <Td>{eur(r.real_portfolio_value)}</Td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {records.length > 10 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-medium text-primary-600 hover:text-primary-800"
        >
          {expanded
            ? "Show less"
            : `Show all ${records.length} years`}
        </button>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-medium">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-1.5 tabular-nums">{children}</td>;
}

function eur(n: number): string {
  return n.toLocaleString("en", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "EUR",
  });
}

function pct(n: number): string {
  return (n * 100).toFixed(2) + "%";
}

function taxPct(tax: number, gross: number): string {
  if (gross === 0) return "0%";
  return ((tax / gross) * 100).toFixed(1) + "%";
}
