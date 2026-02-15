import pytest

from src.tax_engine.tax_engine import TaxConfig, TaxEngine, SpainTaxEngine, TaxResult


def test_spain_tax_engine_initialization():
    engine = SpainTaxEngine(region="biscay")
    assert engine.country == "spain"
    assert engine.region == "biscay"
    assert isinstance(engine.capital_gains_brackets, list)
    assert isinstance(engine.wealth_tax_brackets, list)
    assert isinstance(engine.wealth_tax_exemptions, dict)
    assert isinstance(engine.wealth_tax_cap, dict)
