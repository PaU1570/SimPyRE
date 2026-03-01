"""
Tests for simulation_engine – focused on the multi-strategy comparison
features added to WithdrawalConfig, WithdrawalResult, and
WithdrawalSimulationEngine.
"""

import pytest

from src.models.portfolio_model import Allocation, PortfolioModel
from src.models.scenario_model import ScenarioModel, MarketData
from src.report_engine.report_engine import SimulationReport, YearRecord
from src.simulation_engine.simulation_engine import (
    WithdrawalConfig,
    WithdrawalResult,
    WithdrawalSimulationEngine,
    AccumulationConfig,
    AccumulationResult,
    AccumulationSimulationEngine,
)
from src.strategy_engine.strategy_engine import (
    FixedSWRStrategyConfig,
    ConstantDollarStrategyConfig,
    HebelerAutopilotIIConfig,
    CashBufferStrategyConfig,
    StrategyType,
)
from src.tax_engine.tax_engine import TaxConfig


# ── Fixtures / helpers ────────────────────────────────────────────


def _base_portfolio() -> dict:
    return {
        "portfolio_value": 1_000_000,
        "allocation": {"stocks": 0.6, "bonds": 0.3, "cash": 0.1},
    }


def _mc_scenario(years: int = 5) -> dict:
    """A deterministic Monte-Carlo scenario config for reproducibility."""
    return {
        "scenario_type": "monte_carlo",
        "scenario_years": years,
        "mean_stock_return": 0.07,
        "std_stock_return": 0.0,  # zero std → deterministic
        "mean_bond_return": 0.03,
        "std_bond_return": 0.0,
        "mean_inflation": 0.02,
        "std_inflation": 0.0,
        "cash_return": 0.01,
    }


def _tax_none() -> dict:
    return {"country": "none", "region": "", "adjust_brackets_with_inflation": True}


def _fixed_swr(rate: float = 0.04, min_wd: float = 0) -> dict:
    return {
        "strategy_type": "fixed_swr",
        "withdrawal_rate": rate,
        "minimum_withdrawal": min_wd,
        "maximum_withdrawal": float("inf"),
    }


def _constant_dollar(amount: float = 40_000) -> dict:
    return {
        "strategy_type": "constant_dollar",
        "withdrawal_amount": amount,
    }


# ================================================================== #
# WithdrawalConfig model-validator tests
# ================================================================== #


class TestWithdrawalConfigNormalization:
    """strategy_config (singular) → strategy_configs (plural)."""

    def test_singular_key_is_converted(self):
        """Passing `strategy_config` should populate `strategy_configs`."""
        cfg = WithdrawalConfig(
            initial_portfolio=_base_portfolio(),
            rebalance=True,
            scenario_config=_mc_scenario(3),
            strategy_config=_fixed_swr(),
            tax_config=_tax_none(),
            simulation_years=3,
            num_simulations=1,
        )
        assert len(cfg.strategy_configs) == 1
        assert cfg.strategy_configs[0].strategy_type == StrategyType.FIXED_SWR

    def test_plural_key_takes_precedence(self):
        """When both keys exist, strategy_configs wins."""
        cfg = WithdrawalConfig(
            initial_portfolio=_base_portfolio(),
            rebalance=True,
            scenario_config=_mc_scenario(3),
            strategy_config=_fixed_swr(0.05),
            strategy_configs=[_fixed_swr(0.03), _constant_dollar(50_000)],
            tax_config=_tax_none(),
            simulation_years=3,
            num_simulations=1,
        )
        assert len(cfg.strategy_configs) == 2
        assert cfg.strategy_configs[0].withdrawal_rate == 0.03

    def test_plural_key_alone(self):
        """Direct plural key should work."""
        cfg = WithdrawalConfig(
            initial_portfolio=_base_portfolio(),
            rebalance=True,
            scenario_config=_mc_scenario(3),
            strategy_configs=[_fixed_swr(), _constant_dollar()],
            tax_config=_tax_none(),
            simulation_years=3,
            num_simulations=1,
        )
        assert len(cfg.strategy_configs) == 2

    def test_strategy_config_property(self):
        """The backward-compat .strategy_config property returns first."""
        cfg = WithdrawalConfig(
            initial_portfolio=_base_portfolio(),
            rebalance=True,
            scenario_config=_mc_scenario(3),
            strategy_configs=[_constant_dollar(50_000), _fixed_swr(0.04)],
            tax_config=_tax_none(),
            simulation_years=3,
            num_simulations=1,
        )
        assert cfg.strategy_config.strategy_type == StrategyType.CONSTANT_DOLLAR


# ================================================================== #
# WithdrawalResult tests
# ================================================================== #


def _make_report(goal: bool, final_value: float = 500_000) -> SimulationReport:
    """Minimal SimulationReport."""
    return SimulationReport(
        yearly_records=[
            YearRecord(
                year=1,
                portfolio_value=final_value,
                real_portfolio_value=final_value,
                goal_achieved=goal,
            )
        ],
        goal_achieved=goal,
        final_portfolio_value=final_value,
        final_real_portfolio_value=final_value,
    )


class TestWithdrawalResult:
    def _make_config(self, num_strategies: int = 1) -> WithdrawalConfig:
        strategies = [_fixed_swr(0.04)] * num_strategies
        return WithdrawalConfig(
            initial_portfolio=_base_portfolio(),
            rebalance=True,
            scenario_config=_mc_scenario(3),
            strategy_configs=strategies,
            tax_config=_tax_none(),
            simulation_years=3,
            num_simulations=2,
        )

    def test_reports_property_returns_first_strategy(self):
        config = self._make_config(2)
        r1 = [_make_report(True), _make_report(True)]
        r2 = [_make_report(False), _make_report(False)]
        result = WithdrawalResult(config=config, all_strategy_reports=[r1, r2])
        assert result.reports == r1

    def test_reports_empty_when_no_strategies(self):
        config = self._make_config(1)
        result = WithdrawalResult(config=config, all_strategy_reports=[])
        assert result.reports == []

    def test_success_rate_all_succeed(self):
        config = self._make_config(1)
        reports = [_make_report(True), _make_report(True), _make_report(True)]
        result = WithdrawalResult(config=config, all_strategy_reports=[reports])
        assert result.success_rate == 1.0

    def test_success_rate_mixed(self):
        config = self._make_config(1)
        reports = [_make_report(True), _make_report(False)]
        result = WithdrawalResult(config=config, all_strategy_reports=[reports])
        assert result.success_rate == 0.5

    def test_success_rate_for_specific_strategy(self):
        config = self._make_config(2)
        r1 = [_make_report(True), _make_report(True)]
        r2 = [_make_report(True), _make_report(False)]
        result = WithdrawalResult(config=config, all_strategy_reports=[r1, r2])
        assert result.success_rate_for(0) == 1.0
        assert result.success_rate_for(1) == 0.5

    def test_summary_single_strategy(self):
        config = self._make_config(1)
        reports = [_make_report(True), _make_report(False)]
        result = WithdrawalResult(config=config, all_strategy_reports=[reports])
        s = result.summary()
        assert s["num_simulations"] == 2
        assert s["success_rate"] == 0.5
        assert s["simulation_years"] == 3
        assert "strategy_summaries" not in s

    def test_summary_multi_strategy_includes_summaries(self):
        config = self._make_config(2)
        r1 = [_make_report(True), _make_report(True)]
        r2 = [_make_report(True), _make_report(False)]
        result = WithdrawalResult(config=config, all_strategy_reports=[r1, r2])
        s = result.summary()
        assert "strategy_summaries" in s
        assert len(s["strategy_summaries"]) == 2
        assert s["strategy_summaries"][0]["strategy_index"] == 0
        assert s["strategy_summaries"][0]["success_rate"] == 1.0
        assert s["strategy_summaries"][1]["strategy_index"] == 1
        assert s["strategy_summaries"][1]["success_rate"] == 0.5
        assert (
            s["strategy_summaries"][0]["strategy_type"] == StrategyType.FIXED_SWR.value
        )


# ================================================================== #
# WithdrawalSimulationEngine – integration tests
# ================================================================== #


class TestWithdrawalSimulationEngine:
    """Integration tests that run the engine end-to-end."""

    def test_single_strategy(self):
        config = WithdrawalConfig(
            initial_portfolio=_base_portfolio(),
            rebalance=True,
            scenario_config=_mc_scenario(5),
            strategy_config=_fixed_swr(0.04),
            tax_config=_tax_none(),
            simulation_years=5,
            num_simulations=2,
        )
        engine = WithdrawalSimulationEngine()
        result = engine.run_simulation(config)

        assert len(result.all_strategy_reports) == 1
        assert len(result.reports) == 2
        for report in result.reports:
            assert len(report.yearly_records) == 5

    def test_multi_strategy_returns_reports_per_strategy(self):
        config = WithdrawalConfig(
            initial_portfolio=_base_portfolio(),
            rebalance=True,
            scenario_config=_mc_scenario(5),
            strategy_configs=[_fixed_swr(0.04), _constant_dollar(40_000)],
            tax_config=_tax_none(),
            simulation_years=5,
            num_simulations=3,
        )
        engine = WithdrawalSimulationEngine()
        result = engine.run_simulation(config)

        # Two strategies → two lists of reports
        assert len(result.all_strategy_reports) == 2
        assert len(result.all_strategy_reports[0]) == 3
        assert len(result.all_strategy_reports[1]) == 3

    def test_multi_strategy_shares_scenarios(self):
        """All strategies in the same run should see the same market data.

        With zero-std Monte-Carlo *and* a single simulation, each strategy
        gets identical market scenarios, so year-1 portfolio pre-withdrawal
        should be identical.
        """
        config = WithdrawalConfig(
            initial_portfolio=_base_portfolio(),
            rebalance=True,
            scenario_config=_mc_scenario(3),
            strategy_configs=[_fixed_swr(0.04), _constant_dollar(40_000)],
            tax_config=_tax_none(),
            simulation_years=3,
            num_simulations=1,
        )
        engine = WithdrawalSimulationEngine()
        result = engine.run_simulation(config)

        # Year 1 market returns are the same for both strategies
        r0_year1 = result.all_strategy_reports[0][0].yearly_records[0]
        r1_year1 = result.all_strategy_reports[1][0].yearly_records[0]
        assert r0_year1.stock_return == r1_year1.stock_return
        assert r0_year1.bond_return == r1_year1.bond_return
        assert r0_year1.inflation_rate == r1_year1.inflation_rate

    def test_multi_strategy_different_outcomes(self):
        """Different strategies should produce different portfolio values."""
        config = WithdrawalConfig(
            initial_portfolio=_base_portfolio(),
            rebalance=True,
            scenario_config=_mc_scenario(5),
            strategy_configs=[_fixed_swr(0.02), _fixed_swr(0.08)],
            tax_config=_tax_none(),
            simulation_years=5,
            num_simulations=1,
        )
        engine = WithdrawalSimulationEngine()
        result = engine.run_simulation(config)

        # Lower SWR should leave a higher final portfolio
        final_low_swr = result.all_strategy_reports[0][0].final_portfolio_value
        final_high_swr = result.all_strategy_reports[1][0].final_portfolio_value
        assert final_low_swr > final_high_swr

    def test_summary_with_strategy_summaries(self):
        config = WithdrawalConfig(
            initial_portfolio=_base_portfolio(),
            rebalance=True,
            scenario_config=_mc_scenario(5),
            strategy_configs=[_fixed_swr(0.04), _constant_dollar(40_000)],
            tax_config=_tax_none(),
            simulation_years=5,
            num_simulations=2,
        )
        engine = WithdrawalSimulationEngine()
        result = engine.run_simulation(config)
        summary = result.summary()

        assert "strategy_summaries" in summary
        assert len(summary["strategy_summaries"]) == 2
        for ss in summary["strategy_summaries"]:
            assert "strategy_index" in ss
            assert "strategy_type" in ss
            assert "success_rate" in ss
            assert "num_simulations" in ss
            assert ss["num_simulations"] == 2

    def test_three_strategies(self):
        config = WithdrawalConfig(
            initial_portfolio=_base_portfolio(),
            rebalance=True,
            scenario_config=_mc_scenario(5),
            strategy_configs=[
                _fixed_swr(0.04),
                _constant_dollar(40_000),
                _fixed_swr(0.06),
            ],
            tax_config=_tax_none(),
            simulation_years=5,
            num_simulations=2,
        )
        engine = WithdrawalSimulationEngine()
        result = engine.run_simulation(config)

        assert len(result.all_strategy_reports) == 3
        for i, reports in enumerate(result.all_strategy_reports):
            assert len(reports) == 2, f"Strategy {i} should have 2 runs"

    def test_each_strategy_has_correct_year_count(self):
        years = 10
        config = WithdrawalConfig(
            initial_portfolio=_base_portfolio(),
            rebalance=True,
            scenario_config=_mc_scenario(years),
            strategy_configs=[_fixed_swr(0.04), _constant_dollar(40_000)],
            tax_config=_tax_none(),
            simulation_years=years,
            num_simulations=1,
        )
        engine = WithdrawalSimulationEngine()
        result = engine.run_simulation(config)

        for si, reports in enumerate(result.all_strategy_reports):
            for ri, report in enumerate(reports):
                assert (
                    len(report.yearly_records) == years
                ), f"Strategy {si}, run {ri}: expected {years} year records"

    def test_backward_compat_reports_property(self):
        """result.reports should return the first strategy's reports."""
        config = WithdrawalConfig(
            initial_portfolio=_base_portfolio(),
            rebalance=True,
            scenario_config=_mc_scenario(3),
            strategy_configs=[_fixed_swr(0.04), _constant_dollar(40_000)],
            tax_config=_tax_none(),
            simulation_years=3,
            num_simulations=2,
        )
        engine = WithdrawalSimulationEngine()
        result = engine.run_simulation(config)

        assert result.reports == result.all_strategy_reports[0]


# ================================================================== #
# AccumulationSimulationEngine – smoke tests
# ================================================================== #


class TestAccumulationSimulationEngine:
    """Quick smoke tests to make sure accumulation still works."""

    def test_basic_accumulation(self):
        config = AccumulationConfig(
            monthly_savings=1000,
            annual_increase=0.02,
            target_value=500_000,
            initial_portfolio=_base_portfolio(),
            rebalance=True,
            scenario_config=_mc_scenario(10),
            tax_config=_tax_none(),
            simulation_years=10,
            num_simulations=2,
        )
        engine = AccumulationSimulationEngine()
        result = engine.run_simulation(config)

        assert len(result.reports) == 2
        for report in result.reports:
            assert len(report.yearly_records) == 10


# ================================================================== #
# Cash Buffer – negative portfolio regression tests
# ================================================================== #


def _cash_buffer(
    subsistence: float = 20_000,
    standard: float = 40_000,
    maximum: float = 60_000,
    buffer_target: float = 50_000,
) -> dict:
    return {
        "strategy_type": "cash_buffer",
        "withdrawal_rate_buffer": 0.01,
        "subsistence_withdrawal": subsistence,
        "standard_withdrawal": standard,
        "maximum_withdrawal": maximum,
        "buffer_target": buffer_target,
    }


class TestCashBufferNegativePortfolio:
    """Regression tests for 'total portfolio value cannot be less than 0'."""

    def test_extreme_mc_return_does_not_crash(self):
        """Monte Carlo can produce returns < -100%.

        The simulation must not crash when `_apply_returns` computes
        a negative component value.
        """
        # stock_return = -1.05 means stocks lose 105 % → component goes negative.
        # With zero std this is deterministic.
        config = WithdrawalConfig(
            initial_portfolio=_base_portfolio(),
            rebalance=False,  # rebalance=False triggers from_values path
            scenario_config={
                "scenario_type": "monte_carlo",
                "scenario_years": 3,
                "mean_stock_return": -1.05,  # impossible in reality
                "std_stock_return": 0.0,
                "mean_bond_return": 0.03,
                "std_bond_return": 0.0,
                "mean_inflation": 0.02,
                "std_inflation": 0.0,
                "cash_return": 0.01,
            },
            strategy_configs=[_cash_buffer()],
            tax_config=_tax_none(),
            simulation_years=3,
            num_simulations=1,
        )
        engine = WithdrawalSimulationEngine()
        # Before fix: raises "total portfolio value cannot be less than 0"
        result = engine.run_simulation(config)
        # Portfolio should be clamped at 0, not negative
        for report in result.reports:
            for yr in report.yearly_records:
                assert yr.portfolio_value >= 0

    def test_extreme_mc_return_with_rebalance(self):
        """Same scenario with rebalance=True should also handle gracefully."""
        config = WithdrawalConfig(
            initial_portfolio=_base_portfolio(),
            rebalance=True,
            scenario_config={
                "scenario_type": "monte_carlo",
                "scenario_years": 3,
                "mean_stock_return": -1.05,
                "std_stock_return": 0.0,
                "mean_bond_return": 0.03,
                "std_bond_return": 0.0,
                "mean_inflation": 0.02,
                "std_inflation": 0.0,
                "cash_return": 0.01,
            },
            strategy_configs=[_cash_buffer()],
            tax_config=_tax_none(),
            simulation_years=3,
            num_simulations=1,
        )
        engine = WithdrawalSimulationEngine()
        result = engine.run_simulation(config)
        for report in result.reports:
            for yr in report.yearly_records:
                assert yr.portfolio_value >= 0

    def test_cash_buffer_many_bad_years(self):
        """Several years of terrible returns should drain the portfolio
        to zero without crashing."""
        config = WithdrawalConfig(
            initial_portfolio={
                "portfolio_value": 200_000,
                "allocation": {"stocks": 0.6, "bonds": 0.3, "cash": 0.1},
            },
            rebalance=False,
            scenario_config={
                "scenario_type": "monte_carlo",
                "scenario_years": 20,
                "mean_stock_return": -0.30,
                "std_stock_return": 0.0,
                "mean_bond_return": -0.10,
                "std_bond_return": 0.0,
                "mean_inflation": 0.05,
                "std_inflation": 0.0,
                "cash_return": 0.01,
            },
            strategy_configs=[
                _cash_buffer(
                    subsistence=30_000,
                    standard=50_000,
                    maximum=70_000,
                    buffer_target=60_000,
                )
            ],
            tax_config=_tax_none(),
            simulation_years=20,
            num_simulations=1,
        )
        engine = WithdrawalSimulationEngine()
        result = engine.run_simulation(config)
        for report in result.reports:
            for yr in report.yearly_records:
                assert yr.portfolio_value >= 0

    def test_fixed_swr_extreme_return_no_crash(self):
        """Other strategies should also survive extreme returns."""
        config = WithdrawalConfig(
            initial_portfolio=_base_portfolio(),
            rebalance=False,
            scenario_config={
                "scenario_type": "monte_carlo",
                "scenario_years": 3,
                "mean_stock_return": -1.10,
                "std_stock_return": 0.0,
                "mean_bond_return": -1.10,
                "std_bond_return": 0.0,
                "mean_inflation": 0.02,
                "std_inflation": 0.0,
                "cash_return": 0.01,
            },
            strategy_configs=[_fixed_swr(0.04)],
            tax_config=_tax_none(),
            simulation_years=3,
            num_simulations=1,
        )
        engine = WithdrawalSimulationEngine()
        result = engine.run_simulation(config)
        for report in result.reports:
            for yr in report.yearly_records:
                assert yr.portfolio_value >= 0
