"""
Simulation engine module – orchestrates all sub-engines to run retirement simulations.
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


class SimulationConfig(BaseModel):
    """Master configuration - aggregates every sub-engine config."""

    initial_portfolio: PortfolioModel
    scenario_config: ScenarioConfig
    strategy_config: StrategyConfig
    tax_config: TaxConfig
    report_config: ReportConfig = ReportConfig()
    simulation_years: int
    num_simulations: int = 1


class SimulationResult(BaseModel):
    """Aggregate result across all simulation runs."""

    config: SimulationConfig
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


# ------------------------------------------------------------------ #
# Engine ABC & concrete implementation
# ------------------------------------------------------------------ #


class SimulationEngine(ABC):
    @abstractmethod
    def run_simulation(self, config: SimulationConfig) -> SimulationResult:
        """
        Run the simulation with the given configuration.

        :param config: The configuration for the simulation.
        :return: The result of the simulation.
        """
        pass

    def _apply_returns(
        self,
        portfolio: PortfolioModel,
        market_data: MarketData,
        rebalance: bool = False,
    ) -> PortfolioModel:
        """Apply market returns to the portfolio and return the new value."""
        stock_new = portfolio.stocks_value * (1 + market_data.stock_return)
        bond_new = portfolio.bonds_value * (1 + market_data.bond_return)
        cash_new = portfolio.cash_value  # (TODO: add cash return)
        if rebalance:
            return PortfolioModel(
                portfolio_value=stock_new + bond_new + cash_new,
                allocation=portfolio.allocation,
            )
        else:
            return PortfolioModel.from_values(stock_new, bond_new, cash_new)


class SimpleSimulationEngine(SimulationEngine):
    """
    Straightforward loop-based simulation engine.

    For each simulation run:
      1. Generate a market scenario.
      2. For each year, apply the strategy then compute taxes.
      3. Build a report.
    """

    def run_simulation(self, config: SimulationConfig) -> SimulationResult:
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
            for md in scenario.get_market_data():
                # 1. Strategy: apply returns & withdraw
                new_portfolio = self._apply_returns(portfolio, md, rebalance=False)
                strategy_result = strategy_engine.execute_strategy(
                    new_portfolio, md, config.strategy_config
                )

                # 2. Tax: compute taxes on withdrawal
                tax_result = tax_engine.calculate_tax(
                    gross_income=strategy_result.gross_withdrawal,
                    wealth=strategy_result.portfolio_after.portfolio_value,
                )

                # 3. Record the year
                yearly_records.append(
                    YearRecord(
                        year=md.year_index + 1,
                        portfolio_value=strategy_result.portfolio_after.portfolio_value,
                        gross_income=strategy_result.gross_withdrawal,
                        net_income=tax_result.net_income,
                        capital_gains_tax=tax_result.capital_gains_tax,
                        wealth_tax=tax_result.wealth_tax,
                        inflation_rate=md.inflation_rate,
                        real_portfolio_value=strategy_result.portfolio_after.portfolio_value
                        / md.cumulative_inflation,
                        real_gross_income=strategy_result.gross_withdrawal
                        / md.cumulative_inflation,
                        real_net_income=tax_result.net_income / md.cumulative_inflation,
                        real_capital_gains_tax=tax_result.capital_gains_tax
                        / md.cumulative_inflation,
                        real_wealth_tax=tax_result.wealth_tax / md.cumulative_inflation,
                    )
                )

                # 5. Update portfolio state for next year
                portfolio = strategy_result.portfolio_after

            report = ReportEngine.generate_report(
                yearly_records, config.strategy_config.minimum_withdrawal
            )
            reports.append(report)

        return SimulationResult(config=config, reports=reports)
