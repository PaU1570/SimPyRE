"""
Strategy engine module - defines withdrawal strategies and portfolio rebalancing.
"""

from abc import ABC, abstractmethod
from enum import Enum
from typing import Annotated, Generic, Literal, Tuple, TypeVar, Union

from pydantic import BaseModel, Field, Tag, model_validator

from src.models.portfolio_model import Allocation, PortfolioModel
from src.models.scenario_model import MarketData


class StrategyType(str, Enum):
    """Enumeration of supported withdrawal strategies."""

    FIXED_SWR = "fixed_swr"
    CONSTANT_DOLLAR = "constant_dollar"
    HEBELER_AUTOPILOT_II = "hebeler_autopilot_ii"
    CASH_BUFFER = "cash_buffer"


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
    maximum_withdrawal: float
        The maximum withdrawal amount (in year-0 money). This is used to prevent excessive withdrawals.
    """

    strategy_type: Literal[StrategyType.FIXED_SWR] = StrategyType.FIXED_SWR
    withdrawal_rate: float = 0.04
    minimum_withdrawal: float = 0.0
    maximum_withdrawal: float = float("inf")

    @property
    def target_withdrawal(self) -> float:
        return self.minimum_withdrawal

    @model_validator(mode="before")
    @classmethod
    def set_default_maximum_withdrawal(cls, values: dict) -> dict:
        """If maximum_withdrawal is missing or null, set it to infinity."""
        if values.get("maximum_withdrawal") is None:
            values["maximum_withdrawal"] = float("inf")
        return values

    @model_validator(mode="after")
    def validate_withdrawal_rate(self) -> "FixedSWRStrategyConfig":
        if self.withdrawal_rate < 0 or self.withdrawal_rate > 1:
            raise ValueError("withdrawal_rate must be between 0 and 1")
        return self

    @model_validator(mode="after")
    def validate_withdrawal_amounts(self) -> "FixedSWRStrategyConfig":
        if self.minimum_withdrawal < 0:
            raise ValueError("minimum_withdrawal must be non-negative")
        if self.maximum_withdrawal < 0:
            raise ValueError("maximum_withdrawal must be non-negative")
        if self.minimum_withdrawal > self.maximum_withdrawal:
            raise ValueError(
                "minimum_withdrawal cannot be greater than maximum_withdrawal"
            )
        return self


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


class CashBufferStrategyConfig(_StrategyConfigBase):
    """Configuration for a Cash Buffer strategy.

    This strategy will use excess returns in good years to build up a cash buffer, which can be drawn down in bad years to avoid realizing losses in the portfolio.

    Parameters
    ----------
    withdrawal_rate_buffer: float
        The withdrawal rate buffer (e.g., 0.01 for 1%). The amount withdrawn from the portfolio will be the difference between returns and inflation, minus this buffer.
    subsistence_withdrawal: float
        The minimum withdrawal amount (in year-0 money) required for subsistence. This is the absolute minimum withdrawal that the strategy will try to meet even in bad years, using the cash buffer if necessary.
    standard_withdrawal: float
        The target withdrawal amount (in year-0 money) in a normal year. This is the withdrawal amount that will always be spent in good years.
    maximum_withdrawal: float
        The maximum withdrawal amount (in year-0 money) that might be spent. Anything above this will always be added to the cash buffer.
    buffer_target: float
        The target size of the cash buffer (in year-0 money). If 0, the buffer target is treated as infinite (i.e. everything above ``standard_withdrawal`` goes to the buffer).
    """

    strategy_type: Literal[StrategyType.CASH_BUFFER] = StrategyType.CASH_BUFFER
    withdrawal_rate_buffer: float = 0.01
    subsistence_withdrawal: float
    standard_withdrawal: float
    maximum_withdrawal: float
    buffer_target: float

    @property
    def target_withdrawal(self) -> float:
        return self.subsistence_withdrawal

    @model_validator(mode="after")
    def validate_withdrawal_ordering(self) -> "CashBufferStrategyConfig":
        if not (
            self.subsistence_withdrawal
            <= self.standard_withdrawal
            <= self.maximum_withdrawal
        ):
            raise ValueError(
                "Withdrawal amounts must satisfy: subsistence_withdrawal <= standard_withdrawal <= maximum_withdrawal"
            )
        return self


# ------------------------------------------------------------------ #
# Discriminated union  –  use this as the type annotation everywhere
# ------------------------------------------------------------------ #
StrategyConfig = Annotated[
    Union[
        Annotated[FixedSWRStrategyConfig, Tag(StrategyType.FIXED_SWR)],
        Annotated[ConstantDollarStrategyConfig, Tag(StrategyType.CONSTANT_DOLLAR)],
        Annotated[HebelerAutopilotIIConfig, Tag(StrategyType.HEBELER_AUTOPILOT_II)],
        Annotated[CashBufferStrategyConfig, Tag(StrategyType.CASH_BUFFER)],
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
        portfolio_before_returns: PortfolioModel,
        portfolio_after_returns: PortfolioModel,
        market_data_to_date: list[MarketData],
        config: _ConfigT,
    ) -> StrategyResult:
        """
        Apply market returns and withdrawal logic for a single year.

        1. Determine the withdrawal amount.
        2. Deduct the withdrawal and return the result.

        :param portfolio_before_returns: Portfolio state before applying returns.
        :param portfolio_after_returns: Portfolio state after applying returns.
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
        """Ensure the withdrawal is at least the minimum specified, if possible."""
        if withdrawal < minimum_withdrawal:
            withdrawal = min(
                minimum_withdrawal, portfolio_value
            )  # can't withdraw more than the portfolio value
        if withdrawal > portfolio_value:
            withdrawal = portfolio_value  # can't withdraw more than the portfolio value
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
        portfolio_before_returns: PortfolioModel,  # not used for this strategy
        portfolio_after_returns: PortfolioModel,
        market_data_to_date: list[MarketData],
        config: FixedSWRStrategyConfig,
    ) -> StrategyResult:
        portfolio_before_withdrawal = portfolio_after_returns.portfolio_value
        market_data = market_data_to_date[-1]  # current year's market data
        # Fixed-rate withdrawal on the grown portfolio
        withdrawal = min(
            portfolio_before_withdrawal * config.withdrawal_rate,
            config.maximum_withdrawal * market_data.cumulative_inflation,
        )
        withdrawal, portfolio_after = self._apply_minimum_withdrawal(
            portfolio_before_withdrawal,
            withdrawal,
            config.minimum_withdrawal
            * market_data.cumulative_inflation,  # adjust minimum withdrawal for inflation
        )

        return StrategyResult(
            gross_withdrawal=withdrawal,
            portfolio_before=PortfolioModel(
                portfolio_value=portfolio_before_withdrawal,
                allocation=portfolio_after_returns.allocation,
            ),
            portfolio_after=PortfolioModel(
                portfolio_value=portfolio_after,
                allocation=portfolio_after_returns.allocation,
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
        portfolio_before_returns: PortfolioModel,  # not used for this strategy
        portfolio_after_returns: PortfolioModel,
        market_data_to_date: list[MarketData],
        config: ConstantDollarStrategyConfig,
    ) -> StrategyResult:
        portfolio_before_withdrawal = portfolio_after_returns.portfolio_value
        market_data = market_data_to_date[-1]  # current year's market data

        # Inflation-adjusted constant-dollar withdrawal
        withdrawal, portfolio_after = self._apply_minimum_withdrawal(
            portfolio_before_withdrawal,
            config.withdrawal_amount
            * market_data.cumulative_inflation,  # adjust for inflation
            config.withdrawal_amount
            * market_data.cumulative_inflation,  # minimum withdrawal is the same as the constant dollar amount
        )

        return StrategyResult(
            gross_withdrawal=withdrawal,
            portfolio_before=PortfolioModel(
                portfolio_value=portfolio_before_withdrawal,
                allocation=portfolio_after_returns.allocation,
            ),
            portfolio_after=PortfolioModel(
                portfolio_value=portfolio_after,
                allocation=portfolio_after_returns.allocation,
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
        portfolio_before_returns: PortfolioModel,  # not used for this strategy
        portfolio_after_returns: PortfolioModel,
        market_data_to_date: list[MarketData],
        config: HebelerAutopilotIIConfig,
    ) -> StrategyResult:
        market_data = market_data_to_date[-1]  # current year's market data
        if len(market_data_to_date) == 1:
            # first year; use initial withdrawal rate and clean cache
            withdrawal = (
                portfolio_after_returns.portfolio_value * config.initial_withdrawal_rate
            )
            self._previous_withdrawals_cache = [withdrawal]
        else:
            # subsequent years; combine previous withdrawal with PMT formula
            previous_withdrawal = self._previous_withdrawals_cache[-1]
            market_data = market_data_to_date[-1]  # current year's market data
            years_remaning = config.payout_horizon - len(market_data_to_date) + 1
            # use the average return so far as the interest rate in the PMT formula
            pmt_i = sum(
                md.stock_return * portfolio_after_returns.allocation.stocks
                + md.bond_return * portfolio_after_returns.allocation.bonds
                + md.cash_return * portfolio_after_returns.allocation.cash
                for md in market_data_to_date
            ) / len(market_data_to_date)
            pmt_withdrawal = (portfolio_after_returns.portfolio_value * pmt_i) / (
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

        portfolio_before_withdrawal = portfolio_after_returns.portfolio_value
        self._previous_withdrawals_cache.append(
            withdrawal
        )  # store the withdrawal for the next year's calculation before applying minimum withdrawal logic
        withdrawal, portfolio_after = self._apply_minimum_withdrawal(
            portfolio_before_withdrawal,
            withdrawal,
            config.minimum_withdrawal
            * market_data.cumulative_inflation,  # adjust minimum withdrawal for inflation
        )
        return StrategyResult(
            gross_withdrawal=withdrawal,
            portfolio_before=PortfolioModel(
                portfolio_value=portfolio_before_withdrawal,
                allocation=portfolio_after_returns.allocation,
            ),
            portfolio_after=PortfolioModel(
                portfolio_value=portfolio_after,
                allocation=portfolio_after_returns.allocation,
            ),  # keep same allocation
        )


class CashBufferStrategy(StrategyEngine):
    """
    Class Buffer strategy.

    The amount withdrawn from the portfolio will be the difference between returns and inflation, minus the buffer (if positive). The minimum withdrawal will always be
    considered to be spent. Any amount above the maximum withdrawal will always be added to the cash buffer. The rest will be split between being spent and added to the buffer,
    based on how far the current buffer amount is from the target buffer amount.
    If the amount withdrawn is not enough to meet the standard withdrawal, the strategy will draw from the buffer to try to meet it. The amount withdrawn will be between the subsistence withdrawal and standard withdrawal,
    depending on how close the buffer is to the target.
    If the cash buffer is not enough, the strategy will withdraw from the portfolio as a last resort, but only up to the subsistence withdrawal amount.
    """

    def execute_strategy(
        self,
        portfolio_before_returns: PortfolioModel,
        portfolio_after_returns: PortfolioModel,  # not used for this strategy
        market_data_to_date: list[MarketData],
        config: CashBufferStrategyConfig,
    ) -> StrategyResult:
        # 1. Determine real returns
        market_data = market_data_to_date[-1]  # current year's market data
        real_returns = {
            "stocks": market_data.stock_return - market_data.inflation_rate,
            "bonds": market_data.bond_return - market_data.inflation_rate,
            "cash": market_data.cash_return - market_data.inflation_rate,
        }

        # 2. Determine available excess amount for withdrawal and/or buffer contribution
        excess_amount_stocks = max(
            0,
            portfolio_before_returns.stocks_value
            * (real_returns["stocks"] - config.withdrawal_rate_buffer),
        )
        excess_amount_bonds = max(
            0,
            portfolio_before_returns.bonds_value
            * (real_returns["bonds"] - config.withdrawal_rate_buffer),
        )
        excess_amount = excess_amount_stocks + excess_amount_bonds
        # adjust withdrawal and buffer thresholds for inflation
        standard_withdrawal = (
            config.standard_withdrawal * market_data.cumulative_inflation
        )
        subsistence_withdrawal = (
            config.subsistence_withdrawal * market_data.cumulative_inflation
        )
        maximum_withdrawal = (
            config.maximum_withdrawal * market_data.cumulative_inflation
        )
        buffer_target = (
            config.buffer_target * market_data.cumulative_inflation
            if config.buffer_target > 0
            else float("inf")
        )
        withdrawn_amount = 0.0
        portfolio_cash = portfolio_after_returns.cash_value
        portfolio_stocks = portfolio_after_returns.stocks_value - excess_amount_stocks
        portfolio_bonds = portfolio_after_returns.bonds_value - excess_amount_bonds
        if excess_amount >= standard_withdrawal:
            # we can meet the standard withdrawal with excess returns alone
            withdrawn_amount = standard_withdrawal
            # check if there is anything left for extra withdrawal/buffer contribution
            excess_amount -= standard_withdrawal
            if excess_amount > 0:
                to_be_distributed = min(
                    excess_amount, maximum_withdrawal - standard_withdrawal
                )
                portfolio_cash += (
                    excess_amount - to_be_distributed
                )  # anything above the maximum withdrawal goes to the buffer
                buffer_weight = self._get_cash_buffer_fullness(
                    current_buffer=portfolio_cash, buffer_target=buffer_target
                )
                withdrawn_amount += to_be_distributed * buffer_weight
                portfolio_cash += to_be_distributed * (1 - buffer_weight)
        elif excess_amount >= subsistence_withdrawal:
            # we can meet the subsistence withdrawal with excess returns, try to use the buffer to top up to the standard withdrawal
            withdrawn_amount = excess_amount
            buffer_weight = self._get_cash_buffer_fullness(
                current_buffer=portfolio_cash, buffer_target=buffer_target
            )
            extra_withdrawn = min(
                buffer_weight * (standard_withdrawal - excess_amount), portfolio_cash
            )
            withdrawn_amount += extra_withdrawn
            portfolio_cash -= extra_withdrawn
        else:
            # excess returns are not enough to meet standard withdrawal, try to use cash buffer first
            withdrawal_shortfall = subsistence_withdrawal - excess_amount
            if portfolio_before_returns.cash_value >= withdrawal_shortfall:
                # we can meet the subsistence withdrawal by drawing from the buffer
                # depending on how full the buffer is, we can withdraw up to the standard withdrawal
                withdrawn_amount = subsistence_withdrawal
                portfolio_cash -= withdrawal_shortfall
                buffer_weight = self._get_cash_buffer_fullness(
                    current_buffer=portfolio_cash, buffer_target=buffer_target
                )
                extra_withdrawn = min(
                    buffer_weight * (standard_withdrawal - subsistence_withdrawal),
                    portfolio_cash,
                )
                withdrawn_amount += extra_withdrawn
                portfolio_cash -= extra_withdrawn

            else:
                # cash buffer is not enough, withdraw whatever is left in the buffer and the rest from the portfolio, but only up to the subsistence withdrawal amount
                withdrawn_amount = portfolio_before_returns.cash_value + excess_amount
                portfolio_cash = 0.0
                drawn_from_portfolio = min(
                    portfolio_stocks + portfolio_bonds,
                    subsistence_withdrawal - withdrawn_amount,
                )
                withdrawn_amount += drawn_from_portfolio
                # # draw preferentially from assets with the lowest loss
                # if market_data.bond_return > market_data.stock_return:
                #     # draw from bonds first
                #     drawn_from_bonds = min(portfolio_bonds, drawn_from_portfolio)
                #     portfolio_bonds -= drawn_from_bonds
                #     drawn_from_stocks = drawn_from_portfolio - drawn_from_bonds
                #     portfolio_stocks -= drawn_from_stocks
                # else:
                #     # draw from stocks first
                #     drawn_from_stocks = min(portfolio_stocks, drawn_from_portfolio)
                #     portfolio_stocks -= drawn_from_stocks
                #     drawn_from_bonds = drawn_from_portfolio - drawn_from_stocks
                #     portfolio_bonds -= drawn_from_bonds
                # withdraw while maintining the same allocation ratio between stocks and bonds
                total_portfolio = portfolio_stocks + portfolio_bonds
                if total_portfolio > 0:
                    stocks_weight = portfolio_stocks / total_portfolio
                    bonds_weight = portfolio_bonds / total_portfolio
                    drawn_from_stocks = drawn_from_portfolio * stocks_weight
                    drawn_from_bonds = drawn_from_portfolio * bonds_weight
                else:
                    drawn_from_stocks = 0.0
                    drawn_from_bonds = 0.0
                portfolio_stocks -= drawn_from_stocks
                portfolio_bonds -= drawn_from_bonds

        return StrategyResult(
            gross_withdrawal=withdrawn_amount,
            portfolio_before=portfolio_before_returns,
            portfolio_after=PortfolioModel.from_values(
                stocks_value=max(0.0, portfolio_stocks),
                bonds_value=max(0.0, portfolio_bonds),
                cash_value=max(0.0, portfolio_cash),
            ),
        )

    def _get_cash_buffer_fullness(
        self, current_buffer: float, buffer_target: float
    ) -> float:
        """Get how full the buffer is in percentage terms. Used to determine how to split excess returns or buffer shortfall."""
        if current_buffer >= buffer_target:
            return 1.0
        elif current_buffer <= 0:
            return 0.0
        else:
            return current_buffer / buffer_target


class StrategyEngineFactory:
    """Factory to create a StrategyEngine from a StrategyConfig."""

    _STRATEGY_ENGINE_MAP = {
        StrategyType.FIXED_SWR: FixedSWRStrategy,
        StrategyType.CONSTANT_DOLLAR: ConstantDollarStrategy,
        StrategyType.HEBELER_AUTOPILOT_II: HebelerAutopilotII,
        StrategyType.CASH_BUFFER: CashBufferStrategy,
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
