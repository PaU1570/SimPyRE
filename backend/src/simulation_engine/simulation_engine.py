"""Simulation engine module - orchestrates all sub-engines to run simulations.

Contains the ABC *SimulationEngine* and three concrete implementations:

* **WithdrawalSimulationEngine** – retirement drawdown simulations.
* **AccumulationSimulationEngine** – savings / portfolio-growth simulations.
* **CombinedSimulationEngine** – accumulation *then* withdrawal (full path).

The base class centralises portfolio helpers, scenario generation,
year-record construction, and report generation so that the concrete
engines only contain mode-specific logic.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from pydantic import BaseModel, model_validator

from src.models.portfolio_model import Allocation, PortfolioModel
from src.models.scenario_model import ScenarioModel, MarketData
from src.scenario_engine.scenario_engine import (
    ScenarioConfig,
    ScenarioEngineFactory,
)
from src.strategy_engine.strategy_engine import (
    StrategyConfig,
    StrategyEngine,
    StrategyEngineFactory,
)
from src.tax_engine.tax_engine import TaxConfig, TaxEngine, TaxEngineFactory
from src.report_engine.report_engine import (
    ReportConfig,
    ReportEngine,
    SimulationReport,
    YearRecord,
)


# ------------------------------------------------------------------ #
# Configuration & Result models
# ------------------------------------------------------------------ #


class WithdrawalConfig(BaseModel):
    """Configuration for withdrawal-based retirement simulations.

    Accepts either ``strategy_config`` (a single strategy) or
    ``strategy_configs`` (a list of strategies to compare on the
    **same** generated scenarios).  When both are provided
    ``strategy_configs`` wins.
    """

    initial_portfolio: PortfolioModel
    rebalance: bool
    scenario_config: ScenarioConfig
    strategy_configs: list[StrategyConfig]
    tax_config: TaxConfig
    report_config: ReportConfig = ReportConfig()
    simulation_years: int
    num_simulations: int = 1

    @model_validator(mode="before")
    @classmethod
    def _normalize_strategy_configs(cls, values):
        """Accept the legacy ``strategy_config`` (singular) key."""
        if isinstance(values, dict):
            if "strategy_config" in values:
                if "strategy_configs" not in values:
                    values["strategy_configs"] = [values.pop("strategy_config")]
                else:
                    values.pop("strategy_config")
        return values

    @property
    def strategy_config(self) -> StrategyConfig:
        """First (or only) strategy config – backward-compatibility helper."""
        return self.strategy_configs[0]


class AccumulationConfig(BaseModel):
    """Configuration for savings-accumulation simulations."""

    monthly_savings: float  # in today's money
    annual_increase: float  # nominal annual increase (e.g. 0.02 = 2%)
    target_value: float = (
        0.0  # target portfolio value in today's money (real); 0 = no target
    )
    initial_portfolio: PortfolioModel
    rebalance: bool
    scenario_config: ScenarioConfig
    tax_config: TaxConfig
    report_config: ReportConfig = ReportConfig()
    simulation_years: int
    num_simulations: int = 1


class CombinedConfig(BaseModel):
    """Configuration for combined accumulation + withdrawal simulations (full path to retirement)."""

    accumulation_config: AccumulationConfig
    withdrawal_config: WithdrawalConfig
    scenario_config: ScenarioConfig  # shared scenario config for both phases
    report_config: ReportConfig = ReportConfig()
    num_simulations: int = 1


class WithdrawalResult(BaseModel):
    """Aggregate result across all simulation runs.

    When multiple strategies are compared the per-strategy reports live in
    ``all_strategy_reports`` (a list-of-lists, one inner list per strategy).
    The ``reports`` property returns the first strategy's reports for
    backward compatibility.
    """

    config: WithdrawalConfig
    all_strategy_reports: list[list[SimulationReport]]

    class Config:
        arbitrary_types_allowed = True

    # -- backward-compatible convenience properties ---------------- #

    @property
    def reports(self) -> list[SimulationReport]:
        """Reports for the first (or only) strategy."""
        return self.all_strategy_reports[0] if self.all_strategy_reports else []

    @property
    def success_rate(self) -> float:
        """Success rate for the first (or only) strategy."""
        if not self.reports:
            return 0.0
        return sum(1 for r in self.reports if r.goal_achieved) / len(self.reports)

    def success_rate_for(self, strategy_index: int) -> float:
        """Success rate for a specific strategy by index."""
        reports = self.all_strategy_reports[strategy_index]
        if not reports:
            return 0.0
        return sum(1 for r in reports if r.goal_achieved) / len(reports)

    def summary(self) -> dict:
        result: dict = {
            "num_simulations": len(self.reports),
            "success_rate": self.success_rate,
            "simulation_years": self.config.simulation_years,
        }
        if len(self.all_strategy_reports) > 1:
            result["strategy_summaries"] = [
                {
                    "strategy_index": i,
                    "strategy_type": self.config.strategy_configs[
                        i
                    ].strategy_type.value,
                    "success_rate": self.success_rate_for(i),
                    "num_simulations": len(reports),
                }
                for i, reports in enumerate(self.all_strategy_reports)
            ]
        return result


class AccumulationResult(BaseModel):
    """Aggregate result across all accumulation simulation runs."""

    config: AccumulationConfig
    reports: list[SimulationReport]

    class Config:
        arbitrary_types_allowed = True

    @property
    def success_rate(self) -> float:
        """Fraction of runs where the target value was reached."""
        if self.config.target_value <= 0:
            return 1.0
        if not self.reports:
            return 0.0
        return sum(1 for r in self.reports if r.goal_achieved) / len(self.reports)

    @property
    def median_time_to_target(self) -> float | None:
        """Median years to reach the target across runs that hit it, or None."""
        times = [
            r.years_to_target for r in self.reports if r.years_to_target is not None
        ]
        if not times:
            return None
        times.sort()
        mid = len(times) // 2
        if len(times) % 2 == 1:
            return float(times[mid])
        return (times[mid - 1] + times[mid]) / 2.0

    def summary(self) -> dict:
        return {
            "num_simulations": len(self.reports),
            "success_rate": self.success_rate,
            "simulation_years": self.config.simulation_years,
            "median_time_to_target": self.median_time_to_target,
        }


class CombinedResult(BaseModel):
    """Result for combined accumulation + withdrawal simulations."""

    accumulation_result: AccumulationResult
    withdrawal_result: WithdrawalResult
    reports: list[SimulationReport]


# ------------------------------------------------------------------ #
# Engine ABC & concrete implementations
# ------------------------------------------------------------------ #


class SimulationEngine(ABC):
    """Base class for all simulation engines.

    Provides shared helpers so concrete engines only need to contain
    mode-specific logic (withdrawal / accumulation / combined).
    """

    @abstractmethod
    def run_simulation(
        self, config
    ) -> WithdrawalResult | AccumulationResult | CombinedResult:
        """Run the simulation with the given configuration."""
        ...

    # -- portfolio helpers ----------------------------------------- #

    @staticmethod
    def _clone_portfolio(portfolio: PortfolioModel) -> PortfolioModel:
        """Create a fresh copy of *portfolio* (avoids accidental mutation)."""
        return PortfolioModel(
            portfolio_value=portfolio.portfolio_value,
            allocation=Allocation(**portfolio.allocation.model_dump()),
        )

    @staticmethod
    def _apply_returns(
        portfolio: PortfolioModel,
        market_data: MarketData,
        rebalance: bool,
    ) -> PortfolioModel:
        """Apply one year of market returns and optionally rebalance.

        Individual components are clamped to zero so that
        unrealistic Monte-Carlo returns (< -100 %) cannot produce
        negative asset values.
        """
        stock_new = max(0.0, portfolio.stocks_value * (1 + market_data.stock_return))
        bond_new = max(0.0, portfolio.bonds_value * (1 + market_data.bond_return))
        cash_new = max(0.0, portfolio.cash_value * (1 + market_data.cash_return))
        if rebalance:
            return PortfolioModel(
                portfolio_value=max(0.0, stock_new + bond_new + cash_new),
                allocation=portfolio.allocation,
            )
        return PortfolioModel.from_values(stock_new, bond_new, cash_new)

    # -- scenario helpers ------------------------------------------ #

    @staticmethod
    def _generate_scenario(scenario_config: ScenarioConfig) -> ScenarioModel:
        """Create a scenario engine and generate one scenario."""
        engine = ScenarioEngineFactory.create_scenario_engine(scenario_config)
        return engine.generate_scenario(scenario_config)

    # -- record / report helpers ----------------------------------- #

    @staticmethod
    def _combined_return(md: MarketData, allocation: Allocation) -> float:
        """Weighted portfolio return for one year."""
        return (
            md.stock_return * allocation.stocks
            + md.bond_return * allocation.bonds
            + md.cash_return * allocation.cash
        )

    @staticmethod
    def _build_year_record(
        *,
        year: int,
        portfolio: PortfolioModel,
        md: MarketData,
        gross_income: float = 0.0,
        net_income: float = 0.0,
        contribution: float = 0.0,
        capital_gains_tax: float = 0.0,
        wealth_tax: float = 0.0,
        goal_achieved: bool = False,
    ) -> YearRecord:
        """Construct a *YearRecord*, computing all derived (real / return) fields."""
        alloc = portfolio.allocation
        ci = md.cumulative_inflation
        return YearRecord(
            year=year,
            portfolio_value=round(portfolio.portfolio_value, 2),
            portfolio_allocation=alloc.model_dump(),
            contribution=round(contribution, 2),
            real_contribution=round(contribution / ci, 2),
            gross_income=round(gross_income, 2),
            net_income=round(net_income, 2),
            capital_gains_tax=round(capital_gains_tax, 2),
            wealth_tax=round(wealth_tax, 2),
            inflation_rate=round(md.inflation_rate, 4),
            real_portfolio_value=round(portfolio.portfolio_value / ci, 2),
            real_gross_income=round(gross_income / ci, 2),
            real_net_income=round(net_income / ci, 2),
            real_capital_gains_tax=round(capital_gains_tax / ci, 2),
            real_wealth_tax=round(wealth_tax / ci, 2),
            stock_return=round(md.stock_return, 4),
            bond_return=round(md.bond_return, 4),
            cash_return=round(md.cash_return, 4),
            combined_return=round(SimulationEngine._combined_return(md, alloc), 4),
            goal_achieved=goal_achieved,
        )

    @staticmethod
    def _generate_report(
        yearly_records: list[YearRecord], goal_achieved: bool
    ) -> SimulationReport:
        """Convenience wrapper around :pyclass:`ReportEngine`."""
        return ReportEngine.generate_report(
            yearly_records=yearly_records, goal_achieved=goal_achieved
        )


class WithdrawalSimulationEngine(SimulationEngine):
    """Withdrawal (retirement drawdown) simulation engine.

    Supports comparing multiple withdrawal strategies on the **same**
    generated scenarios when ``strategy_configs`` has more than one entry.
    """

    def run_simulation(self, config: WithdrawalConfig) -> WithdrawalResult:
        # Pre-create one strategy engine per config and the shared tax engine
        strategy_engines = [
            StrategyEngineFactory.create_strategy_engine(sc)
            for sc in config.strategy_configs
        ]
        tax_engine = TaxEngineFactory.create_tax_engine(config.tax_config)

        all_strategy_reports: list[list[SimulationReport]] = [
            [] for _ in config.strategy_configs
        ]

        for _ in range(config.num_simulations):
            # Each simulation run shares the same scenario across strategies
            scenario = self._generate_scenario(config.scenario_config)

            for i, (strategy_config, strategy_engine) in enumerate(
                zip(config.strategy_configs, strategy_engines)
            ):
                report = self._simulate_withdrawal_run(
                    scenario=scenario,
                    config=config,
                    strategy_config=strategy_config,
                    strategy_engine=strategy_engine,
                    tax_engine=tax_engine,
                )
                all_strategy_reports[i].append(report)

        return WithdrawalResult(
            config=config, all_strategy_reports=all_strategy_reports
        )

    # -- single-run inner loop ------------------------------------- #

    def _simulate_withdrawal_run(
        self,
        scenario: ScenarioModel,
        config: WithdrawalConfig,
        strategy_config: StrategyConfig,
        strategy_engine: StrategyEngine,
        tax_engine: TaxEngine,
    ) -> SimulationReport:
        """Run a single withdrawal simulation against a pre-generated scenario."""
        portfolio = self._clone_portfolio(config.initial_portfolio)
        yearly_records: list[YearRecord] = []
        market_data_history: list[MarketData] = []

        for md in scenario.get_market_data():
            market_data_history.append(md)

            # 1. Apply returns & execute withdrawal strategy
            new_portfolio = self._apply_returns(
                portfolio, md, rebalance=config.rebalance
            )
            strategy_result = strategy_engine.execute_strategy(
                portfolio_before_returns=portfolio,
                portfolio_after_returns=new_portfolio,
                market_data_to_date=market_data_history,
                config=strategy_config,
            )

            # 2. Tax on withdrawal
            tax_result = tax_engine.calculate_tax(
                gross_income=strategy_result.gross_withdrawal,
                wealth=strategy_result.portfolio_after.portfolio_value,
                deduct_wealth_tax_from_gross_income=False,
            )

            # 3. Update portfolio; deduct wealth tax separately
            portfolio = strategy_result.portfolio_after
            portfolio.portfolio_value = max(
                0.0, portfolio.portfolio_value - tax_result.wealth_tax
            )

            # 4. Record the year
            yearly_records.append(
                self._build_year_record(
                    year=md.year_index + 1,
                    portfolio=portfolio,
                    md=md,
                    gross_income=strategy_result.gross_withdrawal,
                    net_income=tax_result.net_income,
                    capital_gains_tax=tax_result.capital_gains_tax,
                    wealth_tax=tax_result.wealth_tax,
                    goal_achieved=(
                        strategy_result.gross_withdrawal + 1e-3
                        >= strategy_config.target_withdrawal * md.cumulative_inflation
                    ),
                )
            )

        goal_achieved = all(r.goal_achieved for r in yearly_records)
        return self._generate_report(yearly_records, goal_achieved)


class AccumulationSimulationEngine(SimulationEngine):
    """Accumulation (savings growth) simulation engine."""

    def run_simulation(self, config: AccumulationConfig) -> AccumulationResult:
        tax_engine = TaxEngineFactory.create_tax_engine(config.tax_config)
        reports: list[SimulationReport] = []

        for _ in range(config.num_simulations):
            scenario = self._generate_scenario(config.scenario_config)
            report, years_to_target = self._simulate_accumulation_run(
                scenario=scenario, config=config, tax_engine=tax_engine
            )
            report.years_to_target = years_to_target
            reports.append(report)

        return AccumulationResult(config=config, reports=reports)

    # -- single-run inner loop ------------------------------------- #

    def _simulate_accumulation_run(
        self,
        scenario: ScenarioModel,
        config: AccumulationConfig,
        tax_engine: TaxEngine,
    ) -> tuple[SimulationReport, int | None]:
        """Run a single accumulation simulation. Returns *(report, years_to_target)*."""
        portfolio = self._clone_portfolio(config.initial_portfolio)
        yearly_records: list[YearRecord] = []
        years_to_target: int | None = None

        for md in scenario.get_market_data():
            # 1. Apply market returns
            portfolio = self._apply_returns(portfolio, md, rebalance=config.rebalance)

            # 2. Compute this year's contribution
            nominal_annual_savings = (
                config.monthly_savings
                * 12
                * (1 + config.annual_increase) ** md.year_index
            )

            # 3. Add contribution to portfolio
            portfolio = PortfolioModel(
                portfolio_value=portfolio.portfolio_value + nominal_annual_savings,
                allocation=portfolio.allocation,
            )

            # 4. Wealth tax (no capital-gains withdrawal)
            tax_result = tax_engine.calculate_tax(
                gross_income=0.0,
                wealth=portfolio.portfolio_value,
            )
            portfolio = PortfolioModel(
                portfolio_value=max(
                    0.0, portfolio.portfolio_value - tax_result.wealth_tax
                ),
                allocation=portfolio.allocation,
            )

            # Track first year target is reached (in real terms)
            if (
                years_to_target is None
                and config.target_value > 0
                and portfolio.portfolio_value / md.cumulative_inflation
                >= config.target_value
            ):
                years_to_target = md.year_index + 1

            # 5. Record the year
            yearly_records.append(
                self._build_year_record(
                    year=md.year_index + 1,
                    portfolio=portfolio,
                    md=md,
                    contribution=nominal_annual_savings,
                    capital_gains_tax=tax_result.capital_gains_tax,
                    wealth_tax=tax_result.wealth_tax,
                    goal_achieved=(
                        portfolio.portfolio_value + 1e-3
                        >= config.target_value * md.cumulative_inflation
                    ),
                )
            )

        goal_achieved = any(r.goal_achieved for r in yearly_records)
        return self._generate_report(yearly_records, goal_achieved), years_to_target


class CombinedSimulationEngine(SimulationEngine):
    """Combined simulation engine for full path from accumulation to withdrawal."""

    def run_simulation(self, config: CombinedConfig) -> CombinedResult:
        strategy_config = config.withdrawal_config.strategy_config
        strategy_engine = StrategyEngineFactory.create_strategy_engine(strategy_config)
        tax_engine_acc = TaxEngineFactory.create_tax_engine(
            config.accumulation_config.tax_config
        )
        tax_engine_wd = TaxEngineFactory.create_tax_engine(
            config.withdrawal_config.tax_config
        )

        reports: list[SimulationReport] = []

        for _ in range(config.num_simulations):
            scenario = self._generate_scenario(config.scenario_config)
            portfolio = self._clone_portfolio(
                config.accumulation_config.initial_portfolio
            )

            yearly_records: list[YearRecord] = []
            market_data_history: list[MarketData] = []

            for md in scenario.get_market_data():
                market_data_history.append(md)
                is_accumulation = (
                    md.year_index < config.accumulation_config.simulation_years
                )

                # 1. Apply market returns
                new_portfolio = self._apply_returns(
                    portfolio, md, rebalance=config.accumulation_config.rebalance
                )

                nominal_annual_savings = 0.0
                strategy_result = None
                tax_result = None

                if is_accumulation:
                    # Contribution
                    nominal_annual_savings = (
                        config.accumulation_config.monthly_savings
                        * 12
                        * (1 + config.accumulation_config.annual_increase)
                        ** md.year_index
                    )
                    new_portfolio = PortfolioModel(
                        portfolio_value=new_portfolio.portfolio_value
                        + nominal_annual_savings,
                        allocation=new_portfolio.allocation,
                    )
                    tax_result = tax_engine_acc.calculate_tax(
                        gross_income=0.0,
                        wealth=new_portfolio.portfolio_value,
                    )
                    new_portfolio = PortfolioModel(
                        portfolio_value=max(
                            0.0, new_portfolio.portfolio_value - tax_result.wealth_tax
                        ),
                        allocation=new_portfolio.allocation,
                    )
                    portfolio = new_portfolio
                else:
                    strategy_result = strategy_engine.execute_strategy(
                        portfolio_before_returns=portfolio,
                        portfolio_after_returns=new_portfolio,
                        market_data_to_date=market_data_history,
                        config=strategy_config,
                    )
                    tax_result = tax_engine_wd.calculate_tax(
                        gross_income=strategy_result.gross_withdrawal,
                        wealth=strategy_result.portfolio_after.portfolio_value,
                        deduct_wealth_tax_from_gross_income=False,
                    )
                    portfolio = strategy_result.portfolio_after
                    portfolio.portfolio_value = max(
                        0.0, portfolio.portfolio_value - tax_result.wealth_tax
                    )

                # 3. Record the year
                yearly_records.append(
                    self._build_year_record(
                        year=md.year_index + 1,
                        portfolio=portfolio,
                        md=md,
                        contribution=nominal_annual_savings,
                        gross_income=(
                            strategy_result.gross_withdrawal if strategy_result else 0.0
                        ),
                        net_income=(tax_result.net_income if tax_result else 0.0),
                        capital_gains_tax=(
                            tax_result.capital_gains_tax if tax_result else 0.0
                        ),
                        wealth_tax=(tax_result.wealth_tax if tax_result else 0.0),
                        goal_achieved=(
                            True
                            if is_accumulation
                            else (
                                strategy_result.gross_withdrawal + 1e-3
                                >= strategy_config.target_withdrawal
                                * md.cumulative_inflation
                                if strategy_result
                                else False
                            )
                        ),
                    )
                )

            goal_achieved = all(r.goal_achieved for r in yearly_records)
            reports.append(self._generate_report(yearly_records, goal_achieved))

        return CombinedResult(
            accumulation_result=AccumulationResult(
                config=config.accumulation_config, reports=[]
            ),
            withdrawal_result=WithdrawalResult(
                config=config.withdrawal_config, all_strategy_reports=[]
            ),
            reports=reports,
        )
