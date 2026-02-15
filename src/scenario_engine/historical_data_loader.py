"""
Historical data loader - reads JSON files from the data/ directory and
produces aligned annual arrays for stocks, bonds, and inflation.

Design decisions
----------------
* **Country as the routing key**: Different countries have different bond
  markets, inflation histories, and even different stock index preferences.
  Routing by country keeps the data registry explicit and extensible.

* **Bond yields → annual averages**: The bond JSON is monthly yields
  (not total-return).  We average the 12 monthly yields to get a single
  annual figure that represents the approximate income return from holding
  a 10-year government bond that year.  This is a common simplification
  in long-horizon retirement planning tools and avoids needing duration /
  convexity modelling.

* **Intersection of years**: The three datasets span different periods
  (stocks 1979-2024, bonds 1970-2025, inflation 1960-2024).  We align
  them on the *intersection* of available years so every index position
  represents the same calendar year.  This guarantees that cross-asset
  correlations in the historical record are preserved.

* **Returns stored as decimals (0.07 not 7%)**: All source files use
  percentages; we divide by 100 on load so the rest of the codebase
  works with decimals consistently.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from functools import lru_cache

DATA_ROOT = os.path.join(os.path.dirname(__file__), os.pardir, os.pardir, "data", "historical")

# ---------------------------------------------------------------------------
# Country → file registry
# ---------------------------------------------------------------------------
# For each country we map to (stocks_file, bonds_file, inflation_key).
# `inflation_key` is the key inside consumer_price_index.json → data.
_COUNTRY_REGISTRY: dict[str, dict] = {
    "spain": {
        "stocks": "stocks/msci_world_eur.json",        # MSCI World EUR
        "bonds": "bonds/euro_gov.json",                  # Euro 10Y gov yield
        "inflation_key": "spain",                        # key in CPI JSON
    },
}

INFLATION_FILE = "inflation/consumer_price_index.json"


@dataclass(frozen=True)
class HistoricalDataset:
    """Aligned annual arrays – every list has the same length and index."""
    start_year: int
    end_year: int
    years: list[int]
    stock_returns: list[float]   # decimal, e.g. 0.07
    bond_returns: list[float]    # decimal
    inflation_rates: list[float]  # decimal

    def __len__(self) -> int:
        return len(self.years)


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------

def _read_json(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _load_stock_returns(file: str) -> dict[int, float]:
    """Return {year: decimal_return} from a stocks JSON."""
    data = _read_json(os.path.join(DATA_ROOT, file))
    return {entry["year"]: entry["return"] / 100.0 for entry in data["data"]}


def _load_bond_yields_annual(file: str) -> dict[int, float]:
    """
    Average monthly bond yields into annual yields (decimal).

    Each monthly record looks like {"date": "1970-01-31", "return": 7.75}.
    We extract the year from the date, average all months within that year,
    and divide by 100 to get a decimal.
    """
    data = _read_json(os.path.join(DATA_ROOT, file))
    yearly_sums: dict[int, list[float]] = {}
    for entry in data["data"]:
        year = int(entry["date"][:4])
        yearly_sums.setdefault(year, []).append(entry["return"])

    return {
        year: (sum(vals) / len(vals)) / 100.0
        for year, vals in yearly_sums.items()
        # Only keep full years (12 months) to avoid partial-year bias
        if len(vals) == 12
    }


def _load_inflation(country_key: str) -> dict[int, float]:
    """Return {year: decimal_inflation} for the given country key in the CPI JSON."""
    data = _read_json(os.path.join(DATA_ROOT, INFLATION_FILE))
    country_data = data["data"].get(country_key)
    if country_data is None:
        raise ValueError(
            f"No inflation data for country key '{country_key}'. "
            f"Available: {list(data['data'].keys())}"
        )
    return {entry["year"]: entry["indicator"] / 100.0 for entry in country_data}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

@lru_cache(maxsize=8)
def load_historical_dataset(country: str) -> HistoricalDataset:
    """
    Load and align historical data for a country.

    Raises ValueError if the country is unknown or data files are missing.
    """
    country_lower = country.lower()
    if country_lower not in _COUNTRY_REGISTRY:
        raise ValueError(
            f"Unknown country '{country}'. Supported: {list(_COUNTRY_REGISTRY.keys())}"
        )
    reg = _COUNTRY_REGISTRY[country_lower]

    stocks = _load_stock_returns(reg["stocks"])
    bonds = _load_bond_yields_annual(reg["bonds"])
    inflation = _load_inflation(reg["inflation_key"])

    # Intersect years
    common_years = sorted(set(stocks) & set(bonds) & set(inflation))
    if not common_years:
        raise ValueError("No overlapping years across stocks, bonds, and inflation data.")

    return HistoricalDataset(
        start_year=common_years[0],
        end_year=common_years[-1],
        years=common_years,
        stock_returns=[stocks[y] for y in common_years],
        bond_returns=[bonds[y] for y in common_years],
        inflation_rates=[inflation[y] for y in common_years],
    )
