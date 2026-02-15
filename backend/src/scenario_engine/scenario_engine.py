"""
Scenario engine module - generates market scenarios for simulations.

Stitching strategies for historical data
-----------------------------------------

The two parameters that control stitching are:

  ``chunk_years``  - the block size (number of consecutive years per chunk).
  ``shuffle``      - whether the order of blocks is randomised.

Together they span a spectrum of strategies:

+--------------+---------+---------------------------------------------------+
| chunk_years  | shuffle | Strategy & justification                          |
+==============+=========+===================================================+
| len(data)    | False   | **Full-cycle**: use the entire dataset and cycle  |
|              |         | it.  Preserves the complete temporal structure     |
|              |         | (multi-year bull/bear sequences).  Best for        |
|              |         | "what if history repeats exactly?" analysis.       |
+--------------+---------+---------------------------------------------------+
| len(data)    | True    | Same as full-cycle (only one block exists).        |
+--------------+---------+---------------------------------------------------+
| n (e.g. 10)  | False   | **Sequential blocks**: cut into n-year chunks and  |
|              |         | cycle them in order.  Useful for stress-testing    |
|              |         | specific historical sub-periods without            |
|              |         | randomisation.                                     |
+--------------+---------+---------------------------------------------------+
| n (e.g. 10)  | True    | **Simple Block bootstrap**: cut into               |
|              |         | n-year blocks and stitch in random order.          |
+--------------+---------+---------------------------------------------------+
| 1            | True    | **i.i.d. bootstrap**: every year is independently  |
|              |         | sampled.  Maximum randomisation but destroys all   |
|              |         | temporal correlation.  Produces the widest spread  |
|              |         | of outcomes.                                       |
+--------------+---------+---------------------------------------------------+
| 1            | False   | Cycle one year at a time in original order - same  |
|              |         | as full-cycle.                                     |
+--------------+---------+---------------------------------------------------+

The *default* is ``chunk_years=1, shuffle=True`` (classic i.i.d. bootstrap)
because it is the most conservative assumption for Monte-Carlo-style runs
over historical data: it makes no claim about regime persistence and
provides the broadest distribution of outcomes.
"""

from abc import ABC, abstractmethod
from enum import Enum
import random
from typing import Annotated, Generic, Literal, TypeVar, Union

from pydantic import BaseModel, Discriminator, Field, Tag, model_validator

from src.models.scenario_model import ScenarioModel
from src.scenario_engine.historical_data_loader import load_historical_dataset


class ScenarioType(str, Enum):
    """Enumeration of scenario types."""

    HISTORICAL = "historical"
    MONTE_CARLO = "monte_carlo"


class _ScenarioConfigBase(BaseModel):
    """Fields shared by every scenario configuration."""

    model_config = {"extra": "forbid"}

    scenario_years: int


class HistoricalScenarioConfig(_ScenarioConfigBase):
    """
    Configuration for historical-data scenarios.

    Parameters
    ----------
    country : str
        Selects which data files to load (currently only ``"spain"``).
    chunk_years : int | None
        Block size used when stitching historical data.
        - ``0`` or ``None`` → full-cycle mode (use entire dataset).
        - ``1`` → classic i.i.d. bootstrap (each year sampled independently).
        - ``n > 1`` → block bootstrap with *n*-year blocks.
    shuffle : bool
        Whether blocks are placed in random order (``True``) or cycled
        in their original chronological order (``False``).
    """

    scenario_type: Literal[ScenarioType.HISTORICAL] = ScenarioType.HISTORICAL
    country: str = "spain"
    chunk_years: int | None = 1
    shuffle: bool = True

    @model_validator(mode="after")
    def _validate_chunk_years(self) -> "HistoricalScenarioConfig":
        if self.chunk_years is not None and self.chunk_years < 0:
            raise ValueError("chunk_years must be >= 0 (0 means full-cycle)")
        return self


class MonteCarloScenarioConfig(_ScenarioConfigBase):
    """
    Configuration for Monte Carlo scenarios.

    All distribution parameters default to long-run global equity/bond
    averages expressed as decimals.
    """

    scenario_type: Literal[ScenarioType.MONTE_CARLO] = ScenarioType.MONTE_CARLO
    mean_stock_return: float = 0.07
    std_stock_return: float = 0.15
    mean_bond_return: float = 0.03
    std_bond_return: float = 0.05
    mean_inflation: float = 0.025
    std_inflation: float = 0.01


# ------------------------------------------------------------------ #
# Discriminated union  –  use this as the type annotation everywhere
# ------------------------------------------------------------------ #

ScenarioConfig = Annotated[
    Union[
        Annotated[HistoricalScenarioConfig, Tag("historical")],
        Annotated[MonteCarloScenarioConfig, Tag("monte_carlo")],
    ],
    Discriminator("scenario_type"),
]
"""
A ``ScenarioConfig`` is either a ``HistoricalScenarioConfig`` or a
``MonteCarloScenarioConfig``, discriminated on the ``scenario_type`` field.

Pydantic will automatically pick the right subclass when deserializing
from a dict / JSON based on the value of ``scenario_type``.
"""

_ConfigT = TypeVar("_ConfigT", bound=_ScenarioConfigBase)


class ScenarioEngine(ABC, Generic[_ConfigT]):
    """Abstract base class for scenario generation engines."""

    @abstractmethod
    def generate_scenario(self, config: _ConfigT) -> ScenarioModel:
        """
        Generate a market scenario based on the given configuration.

        :param config: The scenario configuration.
        :return: A ScenarioModel containing yearly market data.
        """
        pass


class HistoricalScenarioEngine(ScenarioEngine):
    """
    Generates scenarios from real historical data files.

    Data is loaded once per country (cached) and then *stitched* into a
    sequence of the requested length using the block-bootstrap approach
    controlled by ``chunk_years`` and ``shuffle`` in ScenarioConfig.

    Design decisions
    ~~~~~~~~~~~~~~~~
    * **Data loaded lazily & cached** - avoids reading JSON on every
      simulation run while keeping startup fast.
    * **Stitching preserves cross-asset alignment** - stocks, bonds, and
      inflation for the same calendar year always travel together inside a
      block, so intra-year correlations are never broken.
    * **Blocks wrap around** - if the dataset isn't evenly divisible by
      ``chunk_years``, the last block is shorter; it is still included.
      When more blocks are needed than available, blocks are either cycled
      (shuffle=False) or drawn with replacement (shuffle=True).
    """

    def generate_scenario(self, config: HistoricalScenarioConfig) -> ScenarioModel:
        dataset = load_historical_dataset(config.country)
        n_data = len(dataset)

        # Resolve effective chunk size: 0 / None → full dataset
        chunk = config.chunk_years if config.chunk_years else n_data

        # Slice the dataset into blocks
        blocks: list[list[int]] = []  # each block is a list of indices into the dataset
        for start in range(0, n_data, chunk):
            end = min(start + chunk, n_data)
            blocks.append(list(range(start, end)))

        # Assemble indices for the requested number of years
        indices: list[int] = []
        if config.shuffle:
            # Draw blocks with replacement until we have enough years
            while len(indices) < config.scenario_years:
                block = random.choice(blocks)
                indices.extend(block)
        else:
            # Cycle blocks in order
            block_idx = 0
            while len(indices) < config.scenario_years:
                indices.extend(blocks[block_idx % len(blocks)])
                block_idx += 1

        # Trim to exact length
        indices = indices[: config.scenario_years]

        return ScenarioModel(
            scenario_years=config.scenario_years,
            stock_returns=[dataset.stock_returns[i] for i in indices],
            bond_returns=[dataset.bond_returns[i] for i in indices],
            inflation_rates=[dataset.inflation_rates[i] for i in indices],
        )


class MonteCarloScenarioEngine(ScenarioEngine):
    """
    Generates a scenario using Monte Carlo sampling from normal distributions.
    """

    def generate_scenario(self, config: MonteCarloScenarioConfig) -> ScenarioModel:
        stock_returns = [
            random.gauss(config.mean_stock_return, config.std_stock_return)
            for _ in range(config.scenario_years)
        ]
        bond_returns = [
            random.gauss(config.mean_bond_return, config.std_bond_return)
            for _ in range(config.scenario_years)
        ]
        inflation_rates = [
            random.gauss(config.mean_inflation, config.std_inflation)
            for _ in range(config.scenario_years)
        ]
        return ScenarioModel(
            scenario_years=config.scenario_years,
            stock_returns=stock_returns,
            bond_returns=bond_returns,
            inflation_rates=inflation_rates,
        )


class ScenarioEngineFactory:
    """Factory to create the appropriate ScenarioEngine based on config."""

    @staticmethod
    def create_scenario_engine(config: ScenarioConfig) -> ScenarioEngine:
        """
        Return the engine matching the concrete config type.

        Because ``ScenarioConfig`` is a Pydantic discriminated union,
        ``config`` is already the right subclass — we just dispatch on
        ``isinstance``.
        """
        if isinstance(config, HistoricalScenarioConfig):
            return HistoricalScenarioEngine()
        elif isinstance(config, MonteCarloScenarioConfig):
            return MonteCarloScenarioEngine()
        else:
            raise ValueError(f"Unknown scenario config type: {type(config).__name__}")
