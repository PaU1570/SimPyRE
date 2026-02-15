"""
Public API for SimPyRE – the thin entry-point for any front-end or CLI.
"""

from __future__ import annotations

from src.api.input_validator import InputValidator
from src.simulation_engine.simulation_engine import (
    SimulationConfig,
    SimulationEngine,
    SimulationResult,
    SimpleSimulationEngine,
)


class SimPyREAPI:
    """
    High-level API façade.

    Usage::

        api = SimPyREAPI()
        result = api.run({...})        # dict in → SimulationResult out
        print(result.summary())
    """

    def __init__(self, engine: SimulationEngine | None = None):
        self._engine = engine or SimpleSimulationEngine()

    # ------------------------------------------------------------------ #
    # Public interface
    # ------------------------------------------------------------------ #
    def validate(self, raw_config: dict) -> SimulationConfig:
        """Validate raw input and return a typed SimulationConfig."""
        return InputValidator.validate_config(raw_config)

    def run(self, raw_config: dict) -> SimulationResult:
        """Validate input, run the simulation, and return results."""
        config = self.validate(raw_config)
        return self._engine.run_simulation(config)
