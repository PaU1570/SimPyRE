"""
Input validation – converts raw user input (dict) into a validated SimulationConfig.
"""

from src.simulation_engine.simulation_engine import SimulationConfig


class InputValidator:
    """Validates and converts raw configuration dictionaries."""

    @staticmethod
    def validate_config(raw: dict) -> SimulationConfig:
        """
        Parse and validate a raw dictionary into a SimulationConfig.

        Raises pydantic.ValidationError when the input is invalid.

        :param raw: Dictionary (e.g. from JSON) with simulation parameters.
        :return: A fully validated SimulationConfig instance.
        """
        return SimulationConfig.model_validate(raw)
