"""
Report engine module – generates simulation reports.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import TYPE_CHECKING

from pydantic import BaseModel

if TYPE_CHECKING:
    from src.simulation_engine.simulation_engine import SimulationConfig


class OutputFormat(str, Enum):
    TXT = "txt"
    CSV = "csv"


class ReportConfig(BaseModel):
    """Configuration for report generation."""

    output_format: OutputFormat = OutputFormat.TXT
    include_yearly_breakdown: bool = True


@dataclass
class YearRecord:
    """One year of simulation data."""

    year: int
    portfolio_value: float
    gross_income: float
    net_income: float
    capital_gains_tax: float
    wealth_tax: float
    inflation_rate: float
    real_portfolio_value: float  # portfolio value in year-0 dollars
    real_gross_income: float  # gross income in year-0 dollars
    real_net_income: float  # net income in year-0 dollars
    real_capital_gains_tax: float  # capital gains tax in year-0 dollars
    real_wealth_tax: float  # wealth tax in year-0 dollars

    @property
    def total_tax(self) -> float:
        return self.capital_gains_tax + self.wealth_tax


@dataclass
class SimulationReport:
    """Full report for a single simulation run."""

    yearly_records: list[YearRecord] = field(default_factory=list)
    goal_achieved: bool = False
    final_portfolio_value: float = 0.0
    final_real_portfolio_value: float = 0.0

    # ------------------------------------------------------------------ #
    # Output methods
    # ------------------------------------------------------------------ #
    def to_txt(self) -> str:
        """Human-readable text summary."""
        lines: list[str] = []
        lines.append("=" * 72)
        lines.append("SIMULATION REPORT")
        lines.append("=" * 72)
        lines.append(f"Goal achieved   : {'Yes' if self.goal_achieved else 'No'}")
        lines.append(f"Final portfolio : {self.final_portfolio_value:>14,.2f}")
        lines.append(f"Final (real)    : {self.final_real_portfolio_value:>14,.2f}")
        lines.append("")

        if self.yearly_records:
            header = (
                f"{'Year':>5}  {'Portfolio':>14}  {'Gross Inc':>12}  "
                f"{'Net Inc':>12}  {'Tax':>12}  {'Inflation':>9}  {'Real Port':>14} "
                f"{'Real Gross':>14}  {'Real Net':>14}  {'Real Tax':>14}"
            )
            lines.append(header)
            lines.append("-" * len(header))
            for r in self.yearly_records:
                lines.append(
                    f"{r.year:>5}  {r.portfolio_value:>14,.2f}  {r.gross_income:>12,.2f}  "
                    f"{r.net_income:>12,.2f}  {r.total_tax:>12,.2f}  "
                    f"{r.inflation_rate:>8.2%}  {r.real_portfolio_value:>14,.2f}  "
                    f"{r.real_gross_income:>14,.2f}  {r.real_net_income:>14,.2f}  {r.total_tax:>14,.2f}"
                )
        lines.append("=" * 72)
        return "\n".join(lines)

    def to_csv(self) -> str:
        """CSV representation of yearly records."""
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(
            [
                "year",
                "portfolio_value",
                "gross_income",
                "net_income",
                "capital_gains_tax",
                "wealth_tax",
                "inflation_rate",
                "real_portfolio_value",
                "real_gross_income",
                "real_net_income",
                "real_capital_gains_tax",
                "real_wealth_tax",
            ]
        )
        for r in self.yearly_records:
            writer.writerow(
                [
                    r.year,
                    r.portfolio_value,
                    r.gross_income,
                    r.net_income,
                    r.capital_gains_tax,
                    r.wealth_tax,
                    r.inflation_rate,
                    r.real_portfolio_value,
                    r.real_gross_income,
                    r.real_net_income,
                    r.real_capital_gains_tax,
                    r.real_wealth_tax,
                ]
            )
        return output.getvalue()

    def to_dict(self) -> dict:
        """Dictionary representation suitable for JSON serialisation."""
        return {
            "goal_achieved": self.goal_achieved,
            "final_portfolio_value": self.final_portfolio_value,
            "final_real_portfolio_value": self.final_real_portfolio_value,
            "yearly_records": [asdict(r) for r in self.yearly_records],
        }


class ReportEngine:
    """Builds a SimulationReport from yearly records."""

    @staticmethod
    def generate_report(
        yearly_records: list[YearRecord],
        target_income: float,
    ) -> SimulationReport:
        """
        Construct a SimulationReport.

        :param yearly_records: list of per-year records produced by the simulation loop.
        :param target_income: the net income goal the user was targeting, in year-0 money.
        :return: A populated SimulationReport.
        """
        if not yearly_records:
            return SimulationReport()

        final = yearly_records[-1]
        # Goal is achieved if the portfolio never ran out (final value > 0)
        # and every year the net income met or exceeded the target.
        goal_achieved = final.portfolio_value > 0 and all(
            r.real_net_income >= (target_income - 1e-3) for r in yearly_records
        )

        return SimulationReport(
            yearly_records=yearly_records,
            goal_achieved=goal_achieved,
            final_portfolio_value=final.portfolio_value,
            final_real_portfolio_value=final.real_portfolio_value,
        )
