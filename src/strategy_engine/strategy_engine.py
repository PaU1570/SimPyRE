"""
Strategy engine module - defines withdrawal strategies and portfolio rebalancing.
"""

from abc import ABC, abstractmethod
from enum import Enum

from pydantic import BaseModel

from src.models.portfolio_model import Allocation, PortfolioModel
from src.models.scenario_model import MarketData


class StrategyType(str, Enum):
    """Enumeration of supported withdrawal strategies."""
    FIXED_SWR = "fixed_swr"


class StrategyConfig(BaseModel):
    """Configuration for a withdrawal strategy."""
    strategy_type: StrategyType
    # For FIXED_SWR:
    withdrawal_rate: float = 0.04  # e.g., 4% SWR


class StrategyResult(BaseModel):
    """Outcome of applying a strategy for a single year."""
    gross_withdrawal: float
    portfolio_before: PortfolioModel
    portfolio_after: PortfolioModel


class StrategyEngine(ABC):
    """Abstract base class for withdrawal-strategy engines."""

    @abstractmethod
    def execute_strategy(
        self,
        portfolio: PortfolioModel,
        market_data: MarketData,
        config: StrategyConfig,
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
        config: StrategyConfig,
    ) -> StrategyResult:
        portfolio_before = portfolio.portfolio_value

        # Fixed-rate withdrawal on the grown portfolio
        withdrawal = portfolio_before * config.withdrawal_rate
        portfolio_after = max(0.0, portfolio_before - withdrawal)

        return StrategyResult(
            gross_withdrawal=withdrawal,
            portfolio_before=PortfolioModel(
                portfolio_value=portfolio_before, allocation=portfolio.allocation),
            portfolio_after=PortfolioModel(
                portfolio_value=portfolio_after, allocation=portfolio.allocation),  # keep same allocation
        )


class StrategyEngineFactory:
    """Factory to create a StrategyEngine from a StrategyConfig."""

    @staticmethod
    def create_strategy_engine(config: StrategyConfig) -> StrategyEngine:
        if config.strategy_type == StrategyType.FIXED_SWR:
            return FixedSWRStrategy()
        else:
            raise ValueError(f"Unknown strategy type: {config.strategy_type}")
