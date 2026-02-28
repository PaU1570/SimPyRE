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
  randomize_start: boolean;
  cash_return: number;
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
  cash_return: number;
}

export type ScenarioConfig =
  | HistoricalScenarioConfig
  | MonteCarloScenarioConfig;

// ── Strategy ──────────────────────────────────────────────────────

export type StrategyType = "fixed_swr" | "constant_dollar" | "hebeler_autopilot_ii";

export interface FixedSWRStrategyConfig {
  strategy_type: "fixed_swr";
  withdrawal_rate: number;
  minimum_withdrawal: number;
}

export interface ConstantDollarStrategyConfig {
  strategy_type: "constant_dollar";
  withdrawal_amount: number;
}

export interface HebelerAutopilotIIConfig {
  strategy_type: "hebeler_autopilot_ii";
  initial_withdrawal_rate: number;
  previous_withdrawal_weight: number;
  payout_horizon: number;
  minimum_withdrawal: number;
}

export type StrategyConfig = FixedSWRStrategyConfig | ConstantDollarStrategyConfig | HebelerAutopilotIIConfig;

// ── Tax ───────────────────────────────────────────────────────────

export interface TaxConfig {
  country: string;
  region: string;
  adjust_brackets_with_inflation: boolean;
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
  rebalance: boolean;
  scenario_config: ScenarioConfig;
  strategy_config: StrategyConfig;
  tax_config: TaxConfig;
  report_config?: ReportConfig;
  simulation_years: number;
  num_simulations: number;
}

// ── Accumulation config (maps to AccumulationConfig) ─────────────

export interface AccumulationConfigPayload {
  monthly_savings: number;
  annual_increase: number;
  target_value: number;
  initial_portfolio: PortfolioModel;
  rebalance: boolean;
  scenario_config: ScenarioConfig;
  tax_config: TaxConfig;
  report_config?: ReportConfig;
  simulation_years: number;
  num_simulations: number;
}

// ── Combined config (maps to CombinedConfig) ─────────────────────

export interface CombinedConfigPayload {
  accumulation_config: AccumulationConfigPayload;
  withdrawal_config: SimulationConfigPayload;
  scenario_config: ScenarioConfig;
  num_simulations: number;
}

// ── Response types ───────────────────────────────────────────────

export interface YearRecord {
  year: number;
  portfolio_value: number;
  // withdrawal fields
  gross_income: number;
  net_income: number;
  // accumulation fields
  contribution: number;
  real_contribution: number;
  // tax
  capital_gains_tax: number;
  wealth_tax: number;
  // market
  inflation_rate: number;
  real_portfolio_value: number;
  real_gross_income: number;
  real_net_income: number;
  real_capital_gains_tax: number;
  real_wealth_tax: number;
  stock_return: number;
  bond_return: number;
  cash_return: number;
}

export type SimulationMode = "withdrawal" | "accumulation" | "combined";

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
  median_time_to_target?: number | null;
}

export interface SimulationResponse {
  summary: SimulationSummary;
  reports: SimulationReport[];
}

export interface CombinedSummary extends SimulationSummary {
  accumulation_years: number;
  retirement_years: number;
}

export interface CombinedResponse {
  summary: CombinedSummary;
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
