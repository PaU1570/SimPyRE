import { useState } from "react";
import type { YearRecord } from "@/types/simulation";

interface YearlyTableProps {
  records: YearRecord[];
}

export default function YearlyTable({ records }: YearlyTableProps) {
  const [expanded, setExpanded] = useState(false);
  const [realMode, setRealMode] = useState(false);
  const display = expanded ? records : records.slice(0, 10);

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

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <Th>Year</Th>
              <Th>Portfolio</Th>
              <Th>Gross Inc.</Th>
              <Th>Net Inc.</Th>
              <Th>CG Tax</Th>
              <Th>Wealth Tax</Th>
              <Th>Inflation</Th>
              {!realMode && <Th>Real Portfolio</Th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {display.map((r) => (
              <tr key={r.year} className="hover:bg-gray-50/50">
                <Td>{r.year}</Td>
                <Td>{eur(realMode ? r.real_portfolio_value : r.portfolio_value)}</Td>
                <Td>{eur(realMode ? r.real_gross_income : r.gross_income)}</Td>
                <Td>{eur(realMode ? r.real_net_income : r.net_income)}</Td>
                <Td>{eur(realMode ? r.real_capital_gains_tax : r.capital_gains_tax)}</Td>
                <Td>{eur(realMode ? r.real_wealth_tax : r.wealth_tax)}</Td>
                <Td>{pct(r.inflation_rate)}</Td>
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
