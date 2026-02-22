"""
Strategy engine module - defines withdrawal strategies and portfolio rebalancing.
"""

from abc import ABC, abstractmethod
from enum import Enum
from typing import Annotated, Generic, Literal, Tuple, TypeVar, Union

from pydantic import BaseModel, Field, Tag

from src.models.portfolio_model import Allocation, PortfolioModel
from src.models.scenario_model import MarketData


class StrategyType(str, Enum):
    """Enumeration of supported withdrawal strategies."""

    FIXED_SWR = "fixed_swr"
    CONSTANT_DOLLAR = "constant_dollar"
    HEBELER_AUTOPILOT_II = "hebeler_autopilot_ii"


class _StrategyConfigBase(BaseModel):
    """Fields shared by every strategy configuration.

    Parameters
    ----------
    target_withdrawal: float
        The target withdrawal amount in year-0 money (used for reporting and minimum withdrawal logic).
    """

    model_config = {"extra": "forbid"}

    @property
    def target_withdrawal(self) -> float:
        """The target withdrawal amount in year-0 money (used for reporting and minimum withdrawal logic)."""
        raise NotImplementedError("Must be implemented by subclasses")


class FixedSWRStrategyConfig(_StrategyConfigBase):
    """Configuration for a fixed safe withdrawal rate (SWR) strategy.

    This strategy withdraws a fixed percentage of the initial portfolio value every year.

    Parameters
    ----------
    withdrawal_rate: float
        The fixed withdrawal rate (e.g., 0.04 for 4% SWR).
    minimum_withdrawal: float
        The minimum withdrawal amount (in year-0 money).
    """

    strategy_type: Literal[StrategyType.FIXED_SWR] = StrategyType.FIXED_SWR
    withdrawal_rate: float = 0.04  # e.g., 4% SWR
    minimum_withdrawal: float = 0.0  # Minimum withdrawal in year-0 money

    @property
    def target_withdrawal(self) -> float:
        return self.minimum_withdrawal


class ConstantDollarStrategyConfig(_StrategyConfigBase):
    """Configuration for a constant-dollar withdrawal strategy.

    This strategy withdraws a fixed dollar amount (adjusted for inflation) every year.

    Parameters
    ----------
    withdrawal_amount: float
        The fixed withdrawal amount in year-0 money.
    """

    strategy_type: Literal[StrategyType.CONSTANT_DOLLAR] = StrategyType.CONSTANT_DOLLAR
    withdrawal_amount: float

    @property
    def target_withdrawal(self) -> float:
        return self.withdrawal_amount


class HebelerAutopilotIIConfig(_StrategyConfigBase):
    """Configuration for Hebeler's Autopilot II strategy.

    This strategy adjusts withdrawals based on portfolio performance, with the aim of providing more stability in withdrawals over time.

    Parameters
    ----------
    initial_withdrawal_rate: float
        The withdrawal rate on the first year.
    previous_withdrawal_weight: float
        For the following years, take this percent of the previous year's withdrawal rate plus the rest determined by the PMT formula.
    payout_horizon: int
        The number of years over which the remaining portfolio should be drawn down (used in the PMT formula).
    minimum_withdrawal: float
        The minimum withdrawal amount in year-0 money.
    """

    strategy_type: Literal[StrategyType.HEBELER_AUTOPILOT_II] = (
        StrategyType.HEBELER_AUTOPILOT_II
    )
    initial_withdrawal_rate: float
    previous_withdrawal_weight: float = 0.75
    payout_horizon: int = 50
    minimum_withdrawal: float = 0.0

    @property
    def target_withdrawal(self) -> float:
        return self.minimum_withdrawal


# ------------------------------------------------------------------ #
# Discriminated union  –  use this as the type annotation everywhere
# ------------------------------------------------------------------ #
StrategyConfig = Annotated[
    Union[
        Annotated[FixedSWRStrategyConfig, Tag("fixed_swr")],
        Annotated[ConstantDollarStrategyConfig, Tag("constant_dollar")],
        Annotated[HebelerAutopilotIIConfig, Tag("hebeler_autopilot_ii")],
    ],
    Field(discriminator="strategy_type"),
]
"""
A ``StrategyConfig`` is one of the available strategy configs, discriminated on the `strategy_type` field.

Pydantic will automatically pick the right subclass when deserializing
from a dict / JSON based on the value of ``strategy_type``.
"""


class StrategyResult(BaseModel):
    """Outcome of applying a strategy for a single year."""

    gross_withdrawal: float
    portfolio_before: PortfolioModel
    portfolio_after: PortfolioModel


_ConfigT = TypeVar("_ConfigT", bound=_StrategyConfigBase)


class StrategyEngine(ABC, Generic[_ConfigT]):
    """Abstract base class for withdrawal-strategy engines."""

    @abstractmethod
    def execute_strategy(
        self,
        portfolio: PortfolioModel,
        market_data_to_date: list[MarketData],
        config: _ConfigT,
    ) -> StrategyResult:
        """
        Apply market returns and withdrawal logic for a single year.

        1. Determine the withdrawal amount.
        2. Deduct the withdrawal and return the result.

        :param portfolio: Current portfolio state (mutated in place).
        :param market_data_to_date: Market data for all years up to and including the current year.
        :param config: Strategy configuration.
        :return: StrategyResult summarising what happened.
        """
        pass

    def _apply_minimum_withdrawal(
        self,
        portfolio_value: float,
        withdrawal: float,
        minimum_withdrawal: float,
    ) -> Tuple[float, float]:
        """Ensure the withdrawal is at least the minimum specified."""
        if withdrawal < minimum_withdrawal:
            withdrawal = min(
                minimum_withdrawal, portfolio_value
            )  # can't withdraw more than the portfolio value
        portfolio_value = max(0.0, portfolio_value - withdrawal)
        return withdrawal, portfolio_value


class FixedSWRStrategy(StrategyEngine):
    """
    Fixed Safe Withdrawal Rate strategy.

    Withdraws a fixed percentage of the *initial* portfolio every year
    (inflation-adjusted withdrawals are handled by the simulation engine).
    """

    def execute_strategy(
        self,
        portfolio: PortfolioModel,
        market_data_to_date: list[MarketData],
        config: FixedSWRStrategyConfig,
    ) -> StrategyResult:
        portfolio_before = portfolio.portfolio_value
        market_data = market_data_to_date[-1]  # current year's market data
        # Fixed-rate withdrawal on the grown portfolio
        withdrawal = portfolio_before * config.withdrawal_rate
        withdrawal, portfolio_after = self._apply_minimum_withdrawal(
            portfolio_before,
            withdrawal,
            config.minimum_withdrawal
            * market_data.cumulative_inflation,  # adjust minimum withdrawal for inflation
        )

        return StrategyResult(
            gross_withdrawal=withdrawal,
            portfolio_before=PortfolioModel(
                portfolio_value=portfolio_before, allocation=portfolio.allocation
            ),
            portfolio_after=PortfolioModel(
                portfolio_value=portfolio_after, allocation=portfolio.allocation
            ),  # keep same allocation
        )


class ConstantDollarStrategy(StrategyEngine):
    """
    Constant-Dollar Withdrawal strategy.

    Withdraws a fixed dollar amount (adjusted for inflation) every year.
    Minimum withdrawal is not applied to this strategy since we always withdraw the same amount.
    """

    def execute_strategy(
        self,
        portfolio: PortfolioModel,
        market_data_to_date: list[MarketData],
        config: ConstantDollarStrategyConfig,
    ) -> StrategyResult:
        portfolio_before = portfolio.portfolio_value
        market_data = market_data_to_date[-1]  # current year's market data

        # Inflation-adjusted constant-dollar withdrawal
        withdrawal, portfolio_after = self._apply_minimum_withdrawal(
            portfolio_before,
            config.withdrawal_amount
            * market_data.cumulative_inflation,  # adjust for inflation
            config.withdrawal_amount
            * market_data.cumulative_inflation,  # minimum withdrawal is the same as the constant dollar amount
        )

        return StrategyResult(
            gross_withdrawal=withdrawal,
            portfolio_before=PortfolioModel(
                portfolio_value=portfolio_before, allocation=portfolio.allocation
            ),
            portfolio_after=PortfolioModel(
                portfolio_value=portfolio_after, allocation=portfolio.allocation
            ),  # keep same allocation
        )


class HebelerAutopilotII(StrategyEngine):
    """
    Hebeler's Autopilot II strategy.

    Combines the previous year's withdrawal with the PMT formula to determine the current year's withdrawal.
    """

    _previous_withdrawals_cache: list[float] = (
        []
    )  # cache to store previously calculated withdrawals. resets when the strategy is called with market data for year 1 (i.e. len(market_data_to_date) == 1)

    def execute_strategy(
        self,
        portfolio: PortfolioModel,
        market_data_to_date: list[MarketData],
        config: HebelerAutopilotIIConfig,
    ) -> StrategyResult:
        market_data = market_data_to_date[-1]  # current year's market data
        if len(market_data_to_date) == 1:
            # first year; use initial withdrawal rate and clean cache
            withdrawal = portfolio.portfolio_value * config.initial_withdrawal_rate
            self._previous_withdrawals_cache = [withdrawal]
        else:
            # subsequent years; combine previous withdrawal with PMT formula
            previous_withdrawal = self._previous_withdrawals_cache[-1]
            market_data = market_data_to_date[-1]  # current year's market data
            years_remaning = config.payout_horizon - len(market_data_to_date) + 1
            # use the average return so far as the interest rate in the PMT formula
            pmt_i = sum(
                md.stock_return * portfolio.allocation.stocks
                + md.bond_return * portfolio.allocation.bonds
                + md.cash_return * portfolio.allocation.cash
                for md in market_data_to_date
            ) / len(market_data_to_date)
            pmt_withdrawal = (portfolio.portfolio_value * pmt_i) / (
                1 - (1 / ((1 + pmt_i) ** years_remaning))
            )
            withdrawal = (
                config.previous_withdrawal_weight
                * previous_withdrawal
                * (1 + market_data.inflation_rate)
                + (1 - config.previous_withdrawal_weight) * pmt_withdrawal
            )
            withdrawal = min(
                withdrawal, previous_withdrawal * (1 + market_data.inflation_rate)
            )

        portfolio_before = portfolio.portfolio_value
        self._previous_withdrawals_cache.append(
            withdrawal
        )  # store the withdrawal for the next year's calculation before applying minimum withdrawal logic
        withdrawal, portfolio_after = self._apply_minimum_withdrawal(
            portfolio_before,
            withdrawal,
            config.minimum_withdrawal
            * market_data.cumulative_inflation,  # adjust minimum withdrawal for inflation
        )
        return StrategyResult(
            gross_withdrawal=withdrawal,
            portfolio_before=PortfolioModel(
                portfolio_value=portfolio_before, allocation=portfolio.allocation
            ),
            portfolio_after=PortfolioModel(
                portfolio_value=portfolio_after, allocation=portfolio.allocation
            ),  # keep same allocation
        )


class StrategyEngineFactory:
    """Factory to create a StrategyEngine from a StrategyConfig."""

    _STRATEGY_ENGINE_MAP = {
        StrategyType.FIXED_SWR: FixedSWRStrategy,
        StrategyType.CONSTANT_DOLLAR: ConstantDollarStrategy,
        StrategyType.HEBELER_AUTOPILOT_II: HebelerAutopilotII,
    }

    @staticmethod
    def create_strategy_engine(config: StrategyConfig) -> StrategyEngine:
        if config.strategy_type in StrategyEngineFactory._STRATEGY_ENGINE_MAP:
            engine_cls = StrategyEngineFactory._STRATEGY_ENGINE_MAP[
                config.strategy_type
            ]
            return engine_cls()
        else:
            raise ValueError(f"Unknown strategy type: {config.strategy_type}")
