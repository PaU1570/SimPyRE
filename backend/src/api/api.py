"""
Public API for SimPyRE – the thin entry-point for any front-end or CLI.
"""

from __future__ import annotations

from src.api.input_validator import InputValidator
from src.simulation_engine.simulation_engine import (
    AccumulationConfig,
    AccumulationResult,
    AccumulationSimulationEngine,
    CombinedConfig,
    CombinedResult,
    CombinedSimulationEngine,
    WithdrawalConfig,
    SimulationEngine,
    WithdrawalResult,
    WithdrawalSimulationEngine,
)


class SimPyREAPI:
    """
    High-level API façade.

    Usage::

        api = SimPyREAPI()
        result = api.run({...})        # dict in → WithdrawalResult out
        print(result.summary())
    """

    def __init__(self, engine: SimulationEngine | None = None):
        self._engine = engine or WithdrawalSimulationEngine()
        self._accumulation_engine = AccumulationSimulationEngine()
        self._combined_engine = CombinedSimulationEngine()

    # ------------------------------------------------------------------ #
    # Public interface
    # ------------------------------------------------------------------ #
    def validate(self, raw_config: dict) -> WithdrawalConfig:
        """Validate raw input and return a typed WithdrawalConfig."""
        return InputValidator.validate_config(raw_config)

    def run(self, raw_config: dict) -> WithdrawalResult:
        """Validate input, run the simulation, and return results."""
        config = self.validate(raw_config)
        return self._engine.run_simulation(config)

    def validate_accumulation(self, raw_config: dict) -> AccumulationConfig:
        """Validate raw input and return a typed AccumulationConfig."""
        return InputValidator.validate_accumulation_config(raw_config)

    def run_accumulation(self, raw_config: dict) -> AccumulationResult:
        """Validate input, run the accumulation simulation, and return results."""
        config = self.validate_accumulation(raw_config)
        return self._accumulation_engine.run_simulation(config)

    def validate_combined(self, raw_config: dict) -> CombinedConfig:
        """Validate raw input and return a typed CombinedConfig."""
        return InputValidator.validate_combined_config(raw_config)

    def run_combined(self, raw_config: dict) -> CombinedResult:
        """Validate input, run the combined simulation, and return results."""
        config = self.validate_combined(raw_config)
        return self._combined_engine.run_simulation(config)
