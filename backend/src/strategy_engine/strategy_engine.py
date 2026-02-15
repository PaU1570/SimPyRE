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


class _StrategyConfigBase(BaseModel):
    """Fields shared by every strategy configuration.

    Parameters
    ----------
    minimum_withdrawal: float
        The minimum withdrawal amount (in year-0 money).
    """

    model_config = {"extra": "forbid"}
    minimum_withdrawal: float


class FixedSWRStrategyConfig(_StrategyConfigBase):
    """Configuration for a fixed safe withdrawal rate (SWR) strategy.

    This strategy withdraws a fixed percentage of the initial portfolio value every year.

    Parameters
    ----------
    withdrawal_rate: float
        The fixed withdrawal rate (e.g., 0.04 for 4% SWR).
    """

    strategy_type: Literal[StrategyType.FIXED_SWR] = StrategyType.FIXED_SWR
    withdrawal_rate: float = 0.04  # e.g., 4% SWR


class ConstantDollarStrategyConfig(_StrategyConfigBase):
    """Configuration for a constant-dollar withdrawal strategy.

    This strategy withdraws a fixed dollar amount (adjusted for inflation) every year.

    Parameters
    ----------
    withdrawal_amount: float
        The fixed withdrawal amount in year-0 dollars.
    """

    strategy_type: Literal[StrategyType.CONSTANT_DOLLAR] = StrategyType.CONSTANT_DOLLAR
    withdrawal_amount: float


# ------------------------------------------------------------------ #
# Discriminated union  –  use this as the type annotation everywhere
# ------------------------------------------------------------------ #
StrategyConfig = Annotated[
    Union[
        Annotated[FixedSWRStrategyConfig, Tag("fixed_swr")],
        Annotated[ConstantDollarStrategyConfig, Tag("constant_dollar")],
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
        market_data: MarketData,
        config: _ConfigT,
    ) -> StrategyResult:
        """
        Apply market returns and withdrawal logic for a single year.

        1. Determine the withdrawal amount.
        2. Deduct the withdrawal and return the result.

        :param portfolio: Current portfolio state (mutated in place).
        :param market_data: Market data for the current year.
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
    For simplicity here, the rate is applied to the current portfolio value
    each year.
    """

    def execute_strategy(
        self,
        portfolio: PortfolioModel,
        market_data: MarketData,
        config: FixedSWRStrategyConfig,
    ) -> StrategyResult:
        portfolio_before = portfolio.portfolio_value

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


class StrategyEngineFactory:
    """Factory to create a StrategyEngine from a StrategyConfig."""

    @staticmethod
    def create_strategy_engine(config: StrategyConfig) -> StrategyEngine:
        if config.strategy_type == StrategyType.FIXED_SWR:
            return FixedSWRStrategy()
        else:
            raise ValueError(f"Unknown strategy type: {config.strategy_type}")
