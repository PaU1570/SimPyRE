/**
 * Tests for SimulationPage strategy comparison integration.
 *
 * Verifies:
 * - Shows comparison panel when multi-strategy data is present
 * - Shows strategy selector tabs
 * - Overview tab hides individual charts/results
 * - Clicking a strategy tab shows that strategy's results
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// We need to mock the hooks and heavy components
const mockRun = vi.fn();
const mockLoad = vi.fn();

// Track hook state so we can update it
let simData: unknown = null;
let simLoading = false;
let simError: string | null = null;

vi.mock("@/hooks/useSimulation", () => ({
  useSimulation: () => ({
    data: simData,
    loading: simLoading,
    error: simError,
    run: mockRun,
  }),
  useTaxRegions: () => ({ regions: null, load: mockLoad }),
  useCountries: () => ({ countries: null, load: mockLoad }),
}));

// Mock recharts to avoid SVG rendering issues in jsdom
vi.mock("recharts", () => {
  const MockComponent = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
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
    ComposedChart: MockComponent,
    Area: () => null,
    ReferenceLine: () => null,
  };
});

// Must import after mocks are set
import SimulationPage from "@/pages/SimulationPage";
import type { SimulationResponse, YearRecord, SimulationReport } from "@/types/simulation";

function makeYearRecord(year: number): YearRecord {
  return {
    year,
    portfolio_value: 1_000_000 - year * 30_000,
    portfolio_allocation: { stocks: 0.6, bonds: 0.3, cash: 0.1 },
    gross_income: 40_000,
    net_income: 35_000,
    contribution: 0,
    real_contribution: 0,
    capital_gains_tax: 3_000,
    wealth_tax: 2_000,
    inflation_rate: 0.02,
    real_portfolio_value: 980_000 - year * 30_000,
    real_gross_income: 39_200,
    real_net_income: 34_300,
    real_capital_gains_tax: 2_940,
    real_wealth_tax: 1_960,
    stock_return: 0.07,
    bond_return: 0.03,
    cash_return: 0.01,
    combined_return: 0.05,
    goal_achieved: true,
  };
}

function makeReport(goal: boolean): SimulationReport {
  const records = [makeYearRecord(1), makeYearRecord(2), makeYearRecord(3)];
  return {
    goal_achieved: goal,
    final_portfolio_value: records[2]!.portfolio_value,
    final_real_portfolio_value: records[2]!.real_portfolio_value,
    yearly_records: records,
  };
}

function multiStrategyData(): SimulationResponse {
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

function singleStrategyData(): SimulationResponse {
  return {
    summary: {
      num_simulations: 2,
      success_rate: 1.0,
      simulation_years: 3,
    },
    reports: [makeReport(true), makeReport(true)],
  };
}

describe("SimulationPage", () => {
  beforeEach(() => {
    simData = null;
    simLoading = false;
    simError = null;
    vi.clearAllMocks();
  });

  it("shows empty state when no data", () => {
    render(<SimulationPage />);
    expect(screen.getByText(/Configure your simulation/)).toBeInTheDocument();
  });

  it("shows loading state", () => {
    simLoading = true;
    render(<SimulationPage />);
    expect(screen.getByText("Running simulation…")).toBeInTheDocument();
  });

  it("shows error state", () => {
    simError = "Something went wrong";
    render(<SimulationPage />);
    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
  });

  describe("single strategy results", () => {
    it("shows results panel", () => {
      simData = singleStrategyData();
      render(<SimulationPage />);
      expect(screen.getByText("Results Summary")).toBeInTheDocument();
    });

    it("does not show strategy comparison or tabs", () => {
      simData = singleStrategyData();
      render(<SimulationPage />);
      expect(screen.queryByText("Strategy Comparison")).not.toBeInTheDocument();
      expect(screen.queryByText("Overview")).not.toBeInTheDocument();
    });
  });

  describe("multi-strategy results", () => {
    it("shows the Strategy Comparison panel", () => {
      simData = multiStrategyData();
      render(<SimulationPage />);
      expect(screen.getByText("Strategy Comparison")).toBeInTheDocument();
    });

    it("shows Overview and strategy tabs", () => {
      simData = multiStrategyData();
      render(<SimulationPage />);
      expect(screen.getByRole("button", { name: "Overview" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Fixed SWR" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Constant Dollar" })).toBeInTheDocument();
    });

    it("hides individual results in Overview mode", () => {
      simData = multiStrategyData();
      render(<SimulationPage />);
      // In overview mode, ResultsPanel and individual charts are hidden
      expect(screen.queryByText("Results Summary")).not.toBeInTheDocument();
    });

    it("shows combined year-by-year table in Overview mode", () => {
      simData = multiStrategyData();
      render(<SimulationPage />);
      expect(
        screen.getByText("Year-by-Year Breakdown (All Strategies)"),
      ).toBeInTheDocument();
    });

    it("hides comparison panel when a strategy is selected", () => {
      simData = multiStrategyData();
      render(<SimulationPage />);
      expect(screen.getByText("Strategy Comparison")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Fixed SWR" }));
      expect(screen.queryByText("Strategy Comparison")).not.toBeInTheDocument();
    });

    it("shows individual results when a strategy tab is clicked", () => {
      simData = multiStrategyData();
      render(<SimulationPage />);
      fireEvent.click(screen.getByRole("button", { name: "Fixed SWR" }));
      expect(screen.getByText("Results Summary")).toBeInTheDocument();
    });

    it("returns to overview when Overview tab is clicked", () => {
      simData = multiStrategyData();
      render(<SimulationPage />);
      // Click into a strategy
      fireEvent.click(screen.getByRole("button", { name: "Fixed SWR" }));
      expect(screen.getByText("Results Summary")).toBeInTheDocument();
      // Click back to overview
      fireEvent.click(screen.getByRole("button", { name: "Overview" }));
      expect(screen.queryByText("Results Summary")).not.toBeInTheDocument();
    });
  });
});
