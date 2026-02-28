"""Simulation engine module - orchestrates all sub-engines to run simulations.

Contains the ABC *SimulationEngine* and two concrete implementations:

* **WithdrawalSimulationEngine** - retirement drawdown simulations.
* **AccumulationSimulationEngine** - savings / portfolio-growth simulations.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from pydantic import BaseModel

from src.models.portfolio_model import Allocation, PortfolioModel
from src.models.scenario_model import ScenarioModel, MarketData
from src.scenario_engine.scenario_engine import (
    ScenarioConfig,
    ScenarioEngineFactory,
)
from src.strategy_engine.strategy_engine import (
    StrategyConfig,
    StrategyEngineFactory,
)
from src.tax_engine.tax_engine import TaxConfig, TaxEngineFactory
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
    """Configuration for withdrawal-based retirement simulations."""

    initial_portfolio: PortfolioModel
    rebalance: bool
    scenario_config: ScenarioConfig
    strategy_config: StrategyConfig
    tax_config: TaxConfig
    report_config: ReportConfig = ReportConfig()
    simulation_years: int
    num_simulations: int = 1


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
    """Aggregate result across all simulation runs."""

    config: WithdrawalConfig
    reports: list[SimulationReport]

    class Config:
        arbitrary_types_allowed = True

    @property
    def success_rate(self) -> float:
        """Fraction of simulations where the goal was achieved."""
        if not self.reports:
            return 0.0
        return sum(1 for r in self.reports if r.goal_achieved) / len(self.reports)

    def summary(self) -> dict:
        return {
            "num_simulations": len(self.reports),
            "success_rate": self.success_rate,
            "simulation_years": self.config.simulation_years,
        }


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
# Engine ABC & concrete implementation
# ------------------------------------------------------------------ #


class SimulationEngine(ABC):
    """Base class for all simulation engines."""

    @abstractmethod
    def run_simulation(
        self, config
    ) -> WithdrawalResult | AccumulationResult | CombinedResult:
        """Run the simulation with the given configuration."""
        ...

    @staticmethod
    def _apply_returns(
        portfolio: PortfolioModel,
        market_data: MarketData,
        rebalance: bool,
    ) -> PortfolioModel:
        """Apply market returns to the portfolio and return the new value."""
        stock_new = portfolio.stocks_value * (1 + market_data.stock_return)
        bond_new = portfolio.bonds_value * (1 + market_data.bond_return)
        cash_new = portfolio.cash_value * (1 + market_data.cash_return)
        if rebalance:
            return PortfolioModel(
                portfolio_value=stock_new + bond_new + cash_new,
                allocation=portfolio.allocation,
            )
        else:
            return PortfolioModel.from_values(stock_new, bond_new, cash_new)


class WithdrawalSimulationEngine(SimulationEngine):
    """
    Withdrawal (retirement drawdown) simulation engine.

    For each simulation run:
      1. Generate a market scenario.
      2. For each year, apply the strategy then compute taxes.
      3. Build a report.
    """

    def run_simulation(self, config: WithdrawalConfig) -> WithdrawalResult:
        # Resolve sub-engines
        scenario_engine = ScenarioEngineFactory.create_scenario_engine(
            config.scenario_config
        )
        strategy_engine = StrategyEngineFactory.create_strategy_engine(
            config.strategy_config
        )
        tax_engine = TaxEngineFactory.create_tax_engine(config.tax_config)

        reports: list[SimulationReport] = []

        for _ in range(config.num_simulations):
            scenario: ScenarioModel = scenario_engine.generate_scenario(
                config.scenario_config
            )

            portfolio = PortfolioModel(
                portfolio_value=config.initial_portfolio.portfolio_value,
                allocation=Allocation(
                    **config.initial_portfolio.allocation.model_dump()
                ),
            )

            yearly_records: list[YearRecord] = []
            market_data_history: list[MarketData] = []
            for md in scenario.get_market_data():
                market_data_history.append(md)
                # 1. Strategy: apply returns & withdraw
                new_portfolio = self._apply_returns(
                    portfolio, md, rebalance=config.rebalance
                )
                strategy_result = strategy_engine.execute_strategy(
                    new_portfolio, market_data_history, config.strategy_config
                )

                # 2. Tax: compute taxes on withdrawal
                tax_result = tax_engine.calculate_tax(
                    gross_income=strategy_result.gross_withdrawal,
                    wealth=strategy_result.portfolio_after.portfolio_value,
                )

                # 3. Update portfolio state for next year
                # taxes are taken from gross income (includin wealth tax), so the new portfolio value is after all deductions
                portfolio = strategy_result.portfolio_after

                # 4. Record the year
                yearly_records.append(
                    YearRecord(
                        year=md.year_index + 1,
                        portfolio_value=portfolio.portfolio_value,
                        gross_income=strategy_result.gross_withdrawal,
                        net_income=tax_result.net_income,
                        capital_gains_tax=tax_result.capital_gains_tax,
                        wealth_tax=tax_result.wealth_tax,
                        inflation_rate=md.inflation_rate,
                        real_portfolio_value=portfolio.portfolio_value
                        / md.cumulative_inflation,
                        real_gross_income=strategy_result.gross_withdrawal
                        / md.cumulative_inflation,
                        real_net_income=tax_result.net_income / md.cumulative_inflation,
                        real_capital_gains_tax=tax_result.capital_gains_tax
                        / md.cumulative_inflation,
                        real_wealth_tax=tax_result.wealth_tax / md.cumulative_inflation,
                        stock_return=md.stock_return,
                        bond_return=md.bond_return,
                        cash_return=md.cash_return,
                    )
                )
            goal_achieved = portfolio.portfolio_value > 0 and all(
                r.real_gross_income >= (config.strategy_config.target_withdrawal - 1e-3)
                for r in yearly_records
            )
            report = ReportEngine.generate_report(
                yearly_records=yearly_records, goal_achieved=goal_achieved
            )
            reports.append(report)

        return WithdrawalResult(config=config, reports=reports)


class AccumulationSimulationEngine(SimulationEngine):
    """
    Accumulation (savings growth) simulation engine.

    For each simulation run:
      1. Generate a market scenario.
      2. For each year:
         a. Apply market returns to the current portfolio.
         b. Compute the annual contribution (monthly_savings × 12),
            adjusted for real annual increase and cumulative inflation.
         c. Add the contribution to the portfolio.
         d. Compute and deduct wealth tax.
      3. Build a report.
    """

    def run_simulation(self, config: AccumulationConfig) -> AccumulationResult:
        scenario_engine = ScenarioEngineFactory.create_scenario_engine(
            config.scenario_config
        )
        tax_engine = TaxEngineFactory.create_tax_engine(config.tax_config)

        reports: list[SimulationReport] = []

        for _ in range(config.num_simulations):
            scenario: ScenarioModel = scenario_engine.generate_scenario(
                config.scenario_config
            )

            portfolio = PortfolioModel(
                portfolio_value=config.initial_portfolio.portfolio_value,
                allocation=Allocation(
                    **config.initial_portfolio.allocation.model_dump()
                ),
            )

            yearly_records: list[YearRecord] = []
            years_to_target: int | None = None
            for md in scenario.get_market_data():
                # 1. Apply market returns
                portfolio = self._apply_returns(
                    portfolio, md, rebalance=config.rebalance
                )

                # 2. Compute this year's contribution
                #    monthly_savings grows at the nominal annual_increase rate;
                #    inflation is already captured by the simulated scenario.
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

                # Deduct wealth tax from portfolio
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
                    YearRecord(
                        year=md.year_index + 1,
                        portfolio_value=portfolio.portfolio_value,
                        contribution=nominal_annual_savings,
                        real_contribution=nominal_annual_savings
                        / md.cumulative_inflation,
                        capital_gains_tax=tax_result.capital_gains_tax,
                        wealth_tax=tax_result.wealth_tax,
                        inflation_rate=md.inflation_rate,
                        real_portfolio_value=portfolio.portfolio_value
                        / md.cumulative_inflation,
                        real_capital_gains_tax=tax_result.capital_gains_tax
                        / md.cumulative_inflation,
                        real_wealth_tax=tax_result.wealth_tax / md.cumulative_inflation,
                        stock_return=md.stock_return,
                        bond_return=md.bond_return,
                        cash_return=md.cash_return,
                    )
                )

            goal_achieved = (
                yearly_records[-1].real_portfolio_value >= config.target_value
            )
            report = ReportEngine.generate_report(
                yearly_records=yearly_records, goal_achieved=goal_achieved
            )
            report.years_to_target = years_to_target
            reports.append(report)

        return AccumulationResult(config=config, reports=reports)


class CombinedSimulationEngine(SimulationEngine):
    """Combined simulation engine for full path from accumulation to withdrawal."""

    def __init__(
        self,
        accumulation_engine: AccumulationSimulationEngine | None = None,
        withdrawal_engine: WithdrawalSimulationEngine | None = None,
    ):
        self._accumulation_engine = (
            accumulation_engine or AccumulationSimulationEngine()
        )
        self._withdrawal_engine = withdrawal_engine or WithdrawalSimulationEngine()

    def run_simulation(self, config: CombinedConfig) -> CombinedResult:
        scenario_engine = ScenarioEngineFactory.create_scenario_engine(
            config.scenario_config
        )
        tax_egine_acc = TaxEngineFactory.create_tax_engine(
            config.accumulation_config.tax_config
        )
        tax_engine_wd = TaxEngineFactory.create_tax_engine(
            config.withdrawal_config.tax_config
        )
        strategy_engine = StrategyEngineFactory.create_strategy_engine(
            config.withdrawal_config.strategy_config
        )

        reports: list[SimulationReport] = []

        for _ in range(config.num_simulations):
            scenario: ScenarioModel = scenario_engine.generate_scenario(
                config.scenario_config
            )

            portfolio = PortfolioModel(
                portfolio_value=config.accumulation_config.initial_portfolio.portfolio_value,
                allocation=Allocation(
                    **config.accumulation_config.initial_portfolio.allocation.model_dump()
                ),
            )

            yearly_records: list[YearRecord] = []
            market_data_history: list[MarketData] = []
            for md in scenario.get_market_data():
                market_data_history.append(md)
                phase = (
                    "accumulation"
                    if md.year_index < config.accumulation_config.simulation_years
                    else "withdrawal"
                )

                # 1. Apply market returns
                portfolio = self._apply_returns(
                    portfolio, md, rebalance=config.accumulation_config.rebalance
                )
                # 2. Contribute or withdraw, depending on the phase
                nominal_annual_savings = 0.0
                strategy_result = None
                tax_result = None
                if phase == "accumulation":
                    # Compute this year's contribution
                    nominal_annual_savings = (
                        config.accumulation_config.monthly_savings
                        * 12
                        * (1 + config.accumulation_config.annual_increase)
                        ** md.year_index
                    )
                    portfolio = PortfolioModel(
                        portfolio_value=portfolio.portfolio_value
                        + nominal_annual_savings,
                        allocation=portfolio.allocation,
                    )
                    tax_result = tax_egine_acc.calculate_tax(
                        gross_income=0.0,
                        wealth=portfolio.portfolio_value,
                    )
                    # Deduct wealth tax from portfolio
                    portfolio = PortfolioModel(
                        portfolio_value=max(
                            0.0, portfolio.portfolio_value - tax_result.wealth_tax
                        ),
                        allocation=portfolio.allocation,
                    )
                else:
                    strategy_result = strategy_engine.execute_strategy(
                        portfolio,
                        market_data_history,
                        config.withdrawal_config.strategy_config,
                    )
                    tax_result = tax_engine_wd.calculate_tax(
                        gross_income=strategy_result.gross_withdrawal,
                        wealth=strategy_result.portfolio_after.portfolio_value,
                    )
                    portfolio = strategy_result.portfolio_after

                # 3. Record the year
                yearly_records.append(
                    YearRecord(
                        year=md.year_index + 1,
                        portfolio_value=portfolio.portfolio_value,
                        contribution=nominal_annual_savings,
                        real_contribution=nominal_annual_savings
                        / md.cumulative_inflation,
                        gross_income=(
                            strategy_result.gross_withdrawal if strategy_result else 0.0
                        ),
                        net_income=tax_result.net_income if tax_result else 0.0,
                        capital_gains_tax=(
                            tax_result.capital_gains_tax if tax_result else 0.0
                        ),
                        wealth_tax=tax_result.wealth_tax if tax_result else 0.0,
                        inflation_rate=md.inflation_rate,
                        real_portfolio_value=portfolio.portfolio_value
                        / md.cumulative_inflation,
                        real_gross_income=(
                            strategy_result.gross_withdrawal / md.cumulative_inflation
                            if strategy_result
                            else 0.0
                        ),
                        real_net_income=(
                            tax_result.net_income / md.cumulative_inflation
                            if tax_result
                            else 0.0
                        ),
                        real_capital_gains_tax=(
                            tax_result.capital_gains_tax / md.cumulative_inflation
                            if tax_result
                            else 0.0
                        ),
                        real_wealth_tax=(
                            tax_result.wealth_tax / md.cumulative_inflation
                            if tax_result
                            else 0.0
                        ),
                        stock_return=md.stock_return,
                        bond_return=md.bond_return,
                        cash_return=md.cash_return,
                    )
                )

            goal_achieved = portfolio.portfolio_value > 0 and all(
                r.real_gross_income
                >= (config.withdrawal_config.strategy_config.target_withdrawal - 1e-3)
                for r in yearly_records[config.accumulation_config.simulation_years :]
            )
            report = ReportEngine.generate_report(
                yearly_records=yearly_records, goal_achieved=goal_achieved
            )
            reports.append(report)

        return CombinedResult(
            accumulation_result=AccumulationResult(
                config=config.accumulation_config, reports=[]
            ),
            withdrawal_result=WithdrawalResult(
                config=config.withdrawal_config, reports=[]
            ),
            reports=reports,
        )
