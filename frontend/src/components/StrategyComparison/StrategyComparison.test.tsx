/**
 * Tests for the StrategyComparison component.
 *
 * Verifies:
 * - Renders nothing when fewer than 2 strategies
 * - Shows summary table with strategy names
 * - Shows success rate, final portfolio, and income columns
 * - Calls onSelectStrategy when a row is clicked
 * - Renders charts (checks headings)
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import StrategyComparison from "@/components/StrategyComparison";
import type { SimulationResponse, SimulationReport, YearRecord } from "@/types/simulation";

// ── Helpers ──────────────────────────────────────────────────────

function makeYearRecord(overrides: Partial<YearRecord> = {}): YearRecord {
  return {
    year: 1,
    portfolio_value: 1_000_000,
    portfolio_allocation: { stocks: 0.6, bonds: 0.3, cash: 0.1 },
    gross_income: 40_000,
    net_income: 35_000,
    contribution: 0,
    real_contribution: 0,
    capital_gains_tax: 3_000,
    wealth_tax: 2_000,
    inflation_rate: 0.02,
    real_portfolio_value: 980_000,
    real_gross_income: 39_200,
    real_net_income: 34_300,
    real_capital_gains_tax: 2_940,
    real_wealth_tax: 1_960,
    stock_return: 0.07,
    bond_return: 0.03,
    cash_return: 0.01,
    combined_return: 0.05,
    goal_achieved: true,
    ...overrides,
  };
}

function makeReport(goal: boolean = true, numYears: number = 3): SimulationReport {
  const records = Array.from({ length: numYears }, (_, i) =>
    makeYearRecord({
      year: i + 1,
      portfolio_value: 1_000_000 - i * 30_000,
      real_portfolio_value: 980_000 - i * 30_000,
    }),
  );
  return {
    goal_achieved: goal,
    final_portfolio_value: records[records.length - 1]!.portfolio_value,
    final_real_portfolio_value: records[records.length - 1]!.real_portfolio_value,
    yearly_records: records,
  };
}

function makeMultiStrategyResponse(): SimulationResponse {
  return {
    summary: {
      num_simulations: 2,
      success_rate: 0.75,
      simulation_years: 3,
      strategy_summaries: [
        { strategy_index: 0, strategy_type: "fixed_swr", success_rate: 1.0, num_simulations: 2 },
        { strategy_index: 1, strategy_type: "constant_dollar", success_rate: 0.5, num_simulations: 2 },
      ],
    },
    reports: [makeReport(true), makeReport(true)],
    all_strategy_reports: [
      [makeReport(true), makeReport(true)],
      [makeReport(true), makeReport(false)],
    ],
  };
}

// ── Tests ────────────────────────────────────────────────────────

// Mock recharts to avoid needing a real DOM with SVG rendering
vi.mock("recharts", () => {
  const MockComponent = ({ children, ...props }: Record<string, unknown>) => (
    <div data-testid="recharts-mock" {...props}>
      {children as React.ReactNode}
    </div>
  );
  return {
    ResponsiveContainer: MockComponent,
    LineChart: MockComponent,
    Line: () => null,
    BarChart: MockComponent,
    Bar: () => null,
    Cell: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
  };
});

describe("StrategyComparison", () => {
  it("renders nothing when only 1 strategy", () => {
    const data: SimulationResponse = {
      summary: { num_simulations: 2, success_rate: 1.0, simulation_years: 3 },
      reports: [makeReport(true)],
    };
    const { container } = render(<StrategyComparison data={data} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when strategy_summaries is missing", () => {
    const data: SimulationResponse = {
      summary: { num_simulations: 2, success_rate: 1.0, simulation_years: 3 },
      reports: [makeReport(true)],
      all_strategy_reports: [[makeReport(true)], [makeReport(true)]],
    };
    const { container } = render(<StrategyComparison data={data} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders the comparison heading", () => {
    render(<StrategyComparison data={makeMultiStrategyResponse()} />);
    expect(screen.getByText("Strategy Comparison")).toBeInTheDocument();
  });

  it("shows strategy names in the summary table", () => {
    render(<StrategyComparison data={makeMultiStrategyResponse()} />);
    expect(screen.getByText("Fixed SWR")).toBeInTheDocument();
    expect(screen.getByText("Constant Dollar")).toBeInTheDocument();
  });

  it("normalises legacy StrategyType.FIXED_SWR format to proper names", () => {
    const data = makeMultiStrategyResponse();
    data.summary.strategy_summaries![0]!.strategy_type = "StrategyType.FIXED_SWR";
    data.summary.strategy_summaries![1]!.strategy_type = "StrategyType.CONSTANT_DOLLAR";
    render(<StrategyComparison data={data} />);
    expect(screen.getByText("Fixed SWR")).toBeInTheDocument();
    expect(screen.getByText("Constant Dollar")).toBeInTheDocument();
  });

  it("shows success rates in the summary table", () => {
    render(<StrategyComparison data={makeMultiStrategyResponse()} />);
    expect(screen.getByText("100.0%")).toBeInTheDocument();
    expect(screen.getByText("50.0%")).toBeInTheDocument();
  });

  it("shows chart section headings", () => {
    render(<StrategyComparison data={makeMultiStrategyResponse()} />);
    // These texts appear in both table headers and chart headings
    expect(screen.getAllByText("Success Rate").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Median Portfolio Value/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Median Net Income/).length).toBeGreaterThanOrEqual(1);
  });

  it("has Nominal/Real toggle", () => {
    render(<StrategyComparison data={makeMultiStrategyResponse()} />);
    expect(screen.getByText("Nominal")).toBeInTheDocument();
    expect(screen.getByText("Real")).toBeInTheDocument();
  });

  it("calls onSelectStrategy when a row is clicked", () => {
    const onSelect = vi.fn();
    render(
      <StrategyComparison
        data={makeMultiStrategyResponse()}
        onSelectStrategy={onSelect}
      />,
    );
    const row = screen.getByText("Fixed SWR").closest("tr")!;
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it("calls onSelectStrategy with correct index for second strategy", () => {
    const onSelect = vi.fn();
    render(
      <StrategyComparison
        data={makeMultiStrategyResponse()}
        onSelectStrategy={onSelect}
      />,
    );
    const row = screen.getByText("Constant Dollar").closest("tr")!;
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("shows Details links when onSelectStrategy is provided", () => {
    render(
      <StrategyComparison
        data={makeMultiStrategyResponse()}
        onSelectStrategy={vi.fn()}
      />,
    );
    const links = screen.getAllByText("Details →");
    expect(links.length).toBe(2);
  });
});
