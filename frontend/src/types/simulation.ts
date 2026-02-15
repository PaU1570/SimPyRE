/* ------------------------------------------------------------------ *
 * TypeScript interfaces that mirror the backend Pydantic models.
 * ------------------------------------------------------------------ */

// ── Portfolio ──────────────────────────────────────────────────────

export interface Allocation {
  stocks: number;
  bonds: number;
  cash: number;
}

export interface PortfolioModel {
  portfolio_value: number;
  allocation: Allocation;
}

// ── Scenario ──────────────────────────────────────────────────────

export type ScenarioType = "historical" | "monte_carlo";

export interface HistoricalScenarioConfig {
  scenario_type: "historical";
  scenario_years: number;
  country: string;
  chunk_years: number | null;
  shuffle: boolean;
}

export interface MonteCarloScenarioConfig {
  scenario_type: "monte_carlo";
  scenario_years: number;
  mean_stock_return: number;
  std_stock_return: number;
  mean_bond_return: number;
  std_bond_return: number;
  mean_inflation: number;
  std_inflation: number;
}

export type ScenarioConfig =
  | HistoricalScenarioConfig
  | MonteCarloScenarioConfig;

// ── Strategy ──────────────────────────────────────────────────────

export type StrategyType = "fixed_swr";

export interface StrategyConfig {
  strategy_type: StrategyType;
  withdrawal_rate: number;
  minimum_withdrawal: number;
}

// ── Tax ───────────────────────────────────────────────────────────

export interface TaxConfig {
  country: string;
  region: string;
}

// ── Report ────────────────────────────────────────────────────────

export type OutputFormat = "txt" | "csv";

export interface ReportConfig {
  output_format: OutputFormat;
  include_yearly_breakdown: boolean;
}

// ── Master config (maps to SimulationConfig) ─────────────────────

export interface SimulationConfigPayload {
  initial_portfolio: PortfolioModel;
  scenario_config: ScenarioConfig;
  strategy_config: StrategyConfig;
  tax_config: TaxConfig;
  report_config?: ReportConfig;
  simulation_years: number;
  num_simulations: number;
  target_income: number;
}

// ── Response types ───────────────────────────────────────────────

export interface YearRecord {
  year: number;
  portfolio_value: number;
  gross_income: number;
  net_income: number;
  capital_gains_tax: number;
  wealth_tax: number;
  inflation_rate: number;
  real_portfolio_value: number;
}

export interface SimulationReport {
  goal_achieved: boolean;
  final_portfolio_value: number;
  final_real_portfolio_value: number;
  yearly_records: YearRecord[];
}

export interface SimulationSummary {
  num_simulations: number;
  success_rate: number;
  simulation_years: number;
}

export interface SimulationResponse {
  summary: SimulationSummary;
  reports: SimulationReport[];
}

export interface TaxRegionsResponse {
  [country: string]: string[];
}

export interface CountryInfo {
  start_year: number;
  end_year: number;
  num_years: number;
  error?: string;
}

export interface CountriesResponse {
  [country: string]: CountryInfo;
}

export interface ValidationResponse {
  valid: boolean;
  config: SimulationConfigPayload;
}
