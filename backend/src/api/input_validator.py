"""
Input validation – converts raw user input (dict) into validated configs.
"""

from src.simulation_engine.simulation_engine import (
    WithdrawalConfig,
    AccumulationConfig,
    CombinedConfig,
)


class InputValidator:
    """Validates and converts raw configuration dictionaries."""

    @staticmethod
    def validate_config(raw: dict) -> WithdrawalConfig:
        """
        Parse and validate a raw dictionary into a WithdrawalConfig.

        Raises pydantic.ValidationError when the input is invalid.

        :param raw: Dictionary (e.g. from JSON) with withdrawal parameters.
        :return: A fully validated WithdrawalConfig instance.
        """
        return WithdrawalConfig.model_validate(raw)

    @staticmethod
    def validate_accumulation_config(raw: dict) -> AccumulationConfig:
        """
        Parse and validate a raw dictionary into an AccumulationConfig.

        Raises pydantic.ValidationError when the input is invalid.

        :param raw: Dictionary (e.g. from JSON) with accumulation parameters.
        :return: A fully validated AccumulationConfig instance.
        """
        return AccumulationConfig.model_validate(raw)

    @staticmethod
    def validate_combined_config(raw: dict) -> CombinedConfig:
        """
        Parse and validate a raw dictionary into a CombinedConfig.

        Raises pydantic.ValidationError when the input is invalid.

        :param raw: Dictionary (e.g. from JSON) with combined parameters.
        :return: A fully validated CombinedConfig instance.
        """
        return CombinedConfig.model_validate(raw)
