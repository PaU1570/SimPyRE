from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator

from pydantic import BaseModel, field_validator, ValidationInfo


@dataclass(frozen=True)
class MarketData:
    """Single-year market data point."""

    year_index: int
    stock_return: float
    bond_return: float
    inflation_rate: float
    cumulative_inflation: float


class ScenarioModel(BaseModel):
    """Model representing a simulation scenario, containing market data about stocks and bonds."""

    scenario_years: int
    stock_returns: list[
        float
    ]  # Annual returns for stocks, as percentages (e.g., 0.07 for 7%)
    bond_returns: list[
        float
    ]  # Annual returns for bonds, as percentages (e.g., 0.03 for 3%)
    inflation_rates: list[
        float
    ]  # Annual inflation rates, as percentages (e.g., 0.02 for 2%)

    @field_validator("stock_returns", "bond_returns", "inflation_rates")
    @classmethod
    def validate_list_length(cls, v: list[float], info: ValidationInfo) -> list[float]:
        scenario_years = info.data.get("scenario_years")
        if scenario_years is not None and len(v) != scenario_years:
            raise ValueError(
                f"{info.field_name} must have length equal to scenario_years ({scenario_years}), got {len(v)}"
            )
        return v

    def get_market_data(self) -> Iterator[MarketData]:
        """Yield per-year MarketData for every year in the scenario."""
        cumulative_inflation = 1.0
        for i in range(self.scenario_years):
            cumulative_inflation *= 1 + self.inflation_rates[i]
            yield MarketData(
                year_index=i,
                stock_return=self.stock_returns[i],
                bond_return=self.bond_returns[i],
                inflation_rate=self.inflation_rates[i],
                cumulative_inflation=cumulative_inflation,
            )
