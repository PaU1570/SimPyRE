"""
Tests for the /api/simulate endpoint – focused on multi-strategy comparison
behaviour and response shape.
"""

import pytest
from fastapi.testclient import TestClient

from src.api.routes import app

client = TestClient(app)


# ── Helpers ───────────────────────────────────────────────────────


def _base_payload(**overrides) -> dict:
    """Minimal valid simulation payload."""
    payload = {
        "initial_portfolio": {
            "portfolio_value": 1_000_000,
            "allocation": {"stocks": 0.6, "bonds": 0.3, "cash": 0.1},
        },
        "rebalance": True,
        "scenario_config": {
            "scenario_type": "monte_carlo",
            "scenario_years": 5,
            "mean_stock_return": 0.07,
            "std_stock_return": 0.0,
            "mean_bond_return": 0.03,
            "std_bond_return": 0.0,
            "mean_inflation": 0.02,
            "std_inflation": 0.0,
            "cash_return": 0.01,
        },
        "strategy_config": {
            "strategy_type": "fixed_swr",
            "withdrawal_rate": 0.04,
            "minimum_withdrawal": 0,
            "maximum_withdrawal": 1e18,
        },
        "tax_config": {
            "country": "none",
            "region": "",
            "adjust_brackets_with_inflation": True,
        },
        "simulation_years": 5,
        "num_simulations": 2,
    }
    payload.update(overrides)
    return payload


# ================================================================== #
# Health check
# ================================================================== #


def test_health():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


# ================================================================== #
# Single-strategy simulation
# ================================================================== #


class TestSingleStrategy:
    def test_returns_200(self):
        resp = client.post("/api/simulate", json=_base_payload())
        assert resp.status_code == 200

    def test_response_has_summary_and_reports(self):
        data = client.post("/api/simulate", json=_base_payload()).json()
        assert "summary" in data
        assert "reports" in data
        assert data["summary"]["num_simulations"] == 2

    def test_no_all_strategy_reports_for_single(self):
        """Single strategy should NOT include all_strategy_reports."""
        data = client.post("/api/simulate", json=_base_payload()).json()
        assert "all_strategy_reports" not in data

    def test_no_strategy_summaries_for_single(self):
        data = client.post("/api/simulate", json=_base_payload()).json()
        assert "strategy_summaries" not in data["summary"]

    def test_reports_have_yearly_records(self):
        data = client.post("/api/simulate", json=_base_payload()).json()
        for report in data["reports"]:
            assert "yearly_records" in report
            assert len(report["yearly_records"]) == 5


# ================================================================== #
# Multi-strategy simulation
# ================================================================== #


class TestMultiStrategy:
    @staticmethod
    def _multi_payload(num_sims: int = 2) -> dict:
        return _base_payload(
            strategy_configs=[
                {
                    "strategy_type": "fixed_swr",
                    "withdrawal_rate": 0.04,
                    "minimum_withdrawal": 0,
                    "maximum_withdrawal": 1e18,
                },
                {
                    "strategy_type": "constant_dollar",
                    "withdrawal_amount": 40_000,
                },
            ],
            num_simulations=num_sims,
        )

    def test_returns_200(self):
        # Remove singular key if present
        payload = self._multi_payload()
        payload.pop("strategy_config", None)
        resp = client.post("/api/simulate", json=payload)
        assert resp.status_code == 200

    def test_includes_all_strategy_reports(self):
        payload = self._multi_payload()
        payload.pop("strategy_config", None)
        data = client.post("/api/simulate", json=payload).json()
        assert "all_strategy_reports" in data
        assert len(data["all_strategy_reports"]) == 2

    def test_each_strategy_has_correct_num_runs(self):
        payload = self._multi_payload(num_sims=3)
        payload.pop("strategy_config", None)
        data = client.post("/api/simulate", json=payload).json()
        for strategy_reports in data["all_strategy_reports"]:
            assert len(strategy_reports) == 3

    def test_strategy_summaries_in_summary(self):
        payload = self._multi_payload()
        payload.pop("strategy_config", None)
        data = client.post("/api/simulate", json=payload).json()
        assert "strategy_summaries" in data["summary"]
        summaries = data["summary"]["strategy_summaries"]
        assert len(summaries) == 2
        assert summaries[0]["strategy_type"] == "fixed_swr"
        assert summaries[1]["strategy_type"] == "constant_dollar"

    def test_strategy_summaries_have_required_fields(self):
        payload = self._multi_payload()
        payload.pop("strategy_config", None)
        data = client.post("/api/simulate", json=payload).json()
        for ss in data["summary"]["strategy_summaries"]:
            assert "strategy_index" in ss
            assert "strategy_type" in ss
            assert "success_rate" in ss
            assert "num_simulations" in ss
            assert 0 <= ss["success_rate"] <= 1

    def test_reports_are_first_strategy(self):
        """The top-level `reports` should match the first strategy's reports."""
        payload = self._multi_payload()
        payload.pop("strategy_config", None)
        data = client.post("/api/simulate", json=payload).json()
        assert data["reports"] == data["all_strategy_reports"][0]

    def test_shared_market_data_across_strategies(self):
        """Same scenario → same market returns in year 1 for all strategies."""
        payload = self._multi_payload(num_sims=1)
        payload.pop("strategy_config", None)
        data = client.post("/api/simulate", json=payload).json()
        yr1_s0 = data["all_strategy_reports"][0][0]["yearly_records"][0]
        yr1_s1 = data["all_strategy_reports"][1][0]["yearly_records"][0]
        assert yr1_s0["stock_return"] == yr1_s1["stock_return"]
        assert yr1_s0["bond_return"] == yr1_s1["bond_return"]
        assert yr1_s0["inflation_rate"] == yr1_s1["inflation_rate"]

    def test_three_strategies(self):
        payload = _base_payload(
            strategy_configs=[
                {
                    "strategy_type": "fixed_swr",
                    "withdrawal_rate": 0.04,
                    "minimum_withdrawal": 0,
                    "maximum_withdrawal": 1e18,
                },
                {
                    "strategy_type": "constant_dollar",
                    "withdrawal_amount": 40_000,
                },
                {
                    "strategy_type": "fixed_swr",
                    "withdrawal_rate": 0.06,
                    "minimum_withdrawal": 0,
                    "maximum_withdrawal": 1e18,
                },
            ],
            num_simulations=1,
        )
        payload.pop("strategy_config", None)
        data = client.post("/api/simulate", json=payload).json()
        assert len(data["all_strategy_reports"]) == 3
        assert len(data["summary"]["strategy_summaries"]) == 3


# ================================================================== #
# Backward compatibility
# ================================================================== #


class TestBackwardCompat:
    def test_singular_strategy_config_still_works(self):
        """Passing `strategy_config` (singular) should still work."""
        payload = _base_payload()
        assert "strategy_config" in payload
        resp = client.post("/api/simulate", json=payload)
        assert resp.status_code == 200

    def test_both_keys_prefers_plural(self):
        """When both strategy_config and strategy_configs exist, plural wins."""
        payload = _base_payload(
            strategy_configs=[
                {
                    "strategy_type": "constant_dollar",
                    "withdrawal_amount": 50_000,
                },
                {
                    "strategy_type": "fixed_swr",
                    "withdrawal_rate": 0.03,
                    "minimum_withdrawal": 0,
                    "maximum_withdrawal": 1e18,
                },
            ],
        )
        data = client.post("/api/simulate", json=payload).json()
        assert "all_strategy_reports" in data
        assert (
            data["summary"]["strategy_summaries"][0]["strategy_type"]
            == "constant_dollar"
        )


# ================================================================== #
# Validation
# ================================================================== #


class TestValidation:
    def test_validate_endpoint_single_strategy(self):
        resp = client.post("/api/validate", json=_base_payload())
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is True

    def test_validate_endpoint_multi_strategy(self):
        payload = _base_payload(
            strategy_configs=[
                {
                    "strategy_type": "fixed_swr",
                    "withdrawal_rate": 0.04,
                    "minimum_withdrawal": 0,
                    "maximum_withdrawal": 1e18,
                },
                {
                    "strategy_type": "constant_dollar",
                    "withdrawal_amount": 40_000,
                },
            ],
        )
        payload.pop("strategy_config", None)
        resp = client.post("/api/validate", json=payload)
        assert resp.status_code == 200
        assert resp.json()["valid"] is True

    def test_invalid_payload_returns_422(self):
        resp = client.post("/api/simulate", json={"invalid": True})
        assert resp.status_code == 422
