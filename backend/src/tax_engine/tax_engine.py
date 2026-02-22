"""
Tax calculation engine module.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pydantic import BaseModel
import json
import os

import logging

logger = logging.getLogger(__name__)


class TaxConfig(BaseModel):
    """Configuration for tax calculations."""

    country: str
    region: str
    adjust_brackets_with_inflation: bool = False


@dataclass
class TaxResult:
    """Result of tax calculations."""

    wealth: float
    gross_income: float
    net_income: float
    capital_gains_tax: float
    wealth_tax: float

    @property
    def total_tax(self) -> float:
        return self.capital_gains_tax + self.wealth_tax

    @property
    def effective_tax_rate(self) -> float:
        if self.gross_income == 0:
            return 0.0
        return self.total_tax / self.gross_income


class TaxEngine(ABC):
    """
    Abstract base class for tax calculation engines.
    """

    TAX_REGIONS_FILE: str = "tax_regions.json"

    @abstractmethod
    def calculate_tax(
        self,
        gross_income: float,
        wealth: float,
        cumulative_inflation: float | None = None,
    ) -> TaxResult:
        """
        Calculate the tax for a given amount and tax rate.

        :param gross_income: The gross income to calculate tax on.
        :param wealth: The wealth to calculate tax on.
        :param cumulative_inflation: Optional cumulative inflation factor to adjust brackets. Only used if ``adjust_brackets_with_inflation`` is True in config.
        :return: The calculated tax result.
        """
        pass

    def calculate_reverse_tax(
        self,
        net_income: float,
        wealth: float,
        tolerance: float = 1e-2,
        max_iter: int = 100,
        cumulative_inflation: float | None = None,
    ) -> TaxResult:
        """
        Calculate the reverse tax for a given net income and tax rate.

        :param net_income: The net income to calculate reverse tax on.
        :param wealth: The wealth to calculate tax on.
        :return: The calculated reverse tax result.
        """
        # Initial guess for gross income
        gross_income = net_income / (
            1 - 0.3
        )  # Assume an initial effective tax rate of 30%
        iteration = 0

        while iteration < max_iter:
            tax_result = self.calculate_tax(gross_income, wealth, cumulative_inflation)
            if abs(tax_result.net_income - net_income) <= tolerance:
                logger.debug(f"Converged after {iteration} iterations.")
                return tax_result
            gross_income += (net_income - tax_result.net_income) / (
                1 - tax_result.effective_tax_rate
            )
            iteration += 1

        raise RuntimeError(
            "Reverse tax calculation did not converge within the maximum number of iterations."
        )

    def _load_tax_region_from_file(self, country: str) -> dict:
        with open(
            os.path.join(os.path.dirname(__file__), self.TAX_REGIONS_FILE), "r"
        ) as file:
            data = json.load(file)
            if country in data:
                return data[country]
            else:
                raise ValueError(f"Country '{country}' not found in tax regions file.")

    def _calculate_progressive_tax(
        self, taxable_amount: float, brackets: list[tuple[float, float]]
    ) -> float:
        if taxable_amount <= 0:
            return 0.0

        total_tax = 0.0
        remaining_amount = taxable_amount
        previous_bracket = 0.0

        for bracket, rate in brackets:
            if remaining_amount <= 0:
                break

            bracket_size = min(bracket - previous_bracket, remaining_amount)
            total_tax += bracket_size * rate
            remaining_amount -= bracket_size
            previous_bracket = bracket

        return total_tax

    def _adjust_brackets_for_inflation(
        self, brackets: list[tuple[float, float]], cumulative_inflation: float
    ) -> list[tuple[float, float]]:
        if cumulative_inflation is None:
            raise ValueError(
                "Cumulative inflation must be provided to adjust brackets."
            )
        adjusted_brackets = []
        for bracket, rate in brackets:
            adjusted_bracket = (
                bracket * cumulative_inflation
                if bracket != float("inf")
                else float("inf")
            )
            adjusted_brackets.append((adjusted_bracket, rate))
        return adjusted_brackets


class NoTaxEngine(TaxEngine):
    """
    A no-op tax engine that applies zero tax. Useful for testing or tax-free scenarios.
    """

    def calculate_tax(
        self,
        gross_income: float,
        wealth: float,
        cumulative_inflation: float | None = None,
    ) -> TaxResult:
        return TaxResult(
            wealth=wealth,
            gross_income=gross_income,
            net_income=gross_income,
            capital_gains_tax=0.0,
            wealth_tax=0.0,
        )


class SpainTaxEngine(TaxEngine):
    """
    Concrete implementation of TaxEngine for Spain.
    """

    _config: TaxConfig
    capital_gains_brackets: list[tuple[float, float]]
    wealth_tax_brackets: list[tuple[float, float]]
    wealth_tax_exemptions: dict[str, float]
    wealth_tax_cap: dict[str, float]

    def __init__(self, config: TaxConfig):
        self._config = config
        self.region = config.region
        tax_regions = self._load_tax_region_from_file(self._config.country).get(
            "regions", {}
        )
        if self.region in tax_regions:
            region_data = tax_regions[self.region]
            self.capital_gains_brackets = [
                (float("inf") if b["bracket"] is None else b["bracket"], b["rate"])
                for b in region_data["capital_gains_brackets"]
            ]
            self.wealth_tax_brackets = [
                (float("inf") if b["bracket"] is None else b["bracket"], b["rate"])
                for b in region_data["wealth_tax_brackets"]
            ]
            self.wealth_tax_exemptions = region_data["wealth_tax_exemptions"]
            self.wealth_tax_cap = region_data["wealth_tax_cap"]
        else:
            raise ValueError(
                f"Region '{self.region}' for country '{self._config.country}' not found in tax regions file."
            )

    def calculate_tax(
        self,
        gross_income: float,
        wealth: float,
        cumulative_inflation: float | None = None,
    ) -> TaxResult:
        # Adjust brackets for inflation if configured
        if (
            self._config.adjust_brackets_with_inflation
            and cumulative_inflation is not None
        ):
            capital_gains_brackets = self._adjust_brackets_for_inflation(
                self.capital_gains_brackets, cumulative_inflation
            )
            wealth_tax_brackets = self._adjust_brackets_for_inflation(
                self.wealth_tax_brackets, cumulative_inflation
            )
            wealth_tax_exemptions = {
                key: value * cumulative_inflation
                for key, value in self.wealth_tax_exemptions.items()
            }
        else:
            capital_gains_brackets = self.capital_gains_brackets
            wealth_tax_brackets = self.wealth_tax_brackets
            wealth_tax_exemptions = self.wealth_tax_exemptions

        # Capital gains tax
        taxable_income = gross_income
        capital_gains_tax = self._calculate_progressive_tax(
            taxable_income, capital_gains_brackets
        )
        # Wealth tax
        taxable_wealth = max(
            0.0, wealth - wealth_tax_exemptions.get("personal_allowance", 0.0)
        )
        wealth_tax = self._calculate_progressive_tax(
            taxable_wealth, wealth_tax_brackets
        )

        # Apply wealth tax cap if applicable
        total_tax = capital_gains_tax + wealth_tax
        max_tax = taxable_income * self.wealth_tax_cap.get("pct_of_taxable_income", 1.0)
        if total_tax > max_tax:
            # Adjust wealth tax to not exceed cap, up to maximum discount.
            wealth_tax = max(
                max_tax - capital_gains_tax,
                wealth_tax * (1 - self.wealth_tax_cap.get("discount_limit_pct", 0.0)),
            )

        net_income = gross_income - capital_gains_tax - wealth_tax

        return TaxResult(
            wealth=wealth,
            gross_income=gross_income,
            net_income=net_income,
            capital_gains_tax=capital_gains_tax,
            wealth_tax=wealth_tax,
        )


class TaxEngineFactory:
    """
    Factory class to create TaxEngine instances based on config.
    """

    @staticmethod
    def create_tax_engine(config: TaxConfig) -> TaxEngine:
        if config.country.lower() == "spain":
            engine = SpainTaxEngine(config)
            return engine
        elif config.country.lower() == "none":
            return NoTaxEngine()
        else:
            raise ValueError(
                f"Tax engine for country '{config.country}' is not implemented."
            )
