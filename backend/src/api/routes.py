"""
FastAPI routes – HTTP layer for SimPyRE.

All heavy lifting is delegated to the existing SimPyREAPI façade;
this module only handles serialisation, error mapping, and CORS.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import ValidationError

from src.api.api import SimPyREAPI
from src.scenario_engine.historical_data_loader import (
    _COUNTRY_REGISTRY,
    load_historical_dataset,
)
from src.tax_engine.tax_engine import TaxEngine

# ------------------------------------------------------------------ #
# App & middleware
# ------------------------------------------------------------------ #

app = FastAPI(
    title="SimPyRE",
    description="Retirement simulation engine API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_api = SimPyREAPI()

# ------------------------------------------------------------------ #
# Static frontend (production build)
# ------------------------------------------------------------------ #

_STATIC_DIR = Path(__file__).resolve().parent.parent.parent / "static"


# ------------------------------------------------------------------ #
# Routes
# ------------------------------------------------------------------ #


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/validate")
def validate_config(payload: dict[str, Any]) -> dict[str, Any]:
    """Validate a simulation configuration without running it."""
    try:
        config = _api.validate(payload)
        return {"valid": True, "config": config.model_dump(mode="json")}
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors())


@app.post("/api/simulate")
def run_simulation(payload: dict[str, Any]) -> dict[str, Any]:
    """Run a full simulation and return results."""
    try:
        result = _api.run(payload)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    # Build a JSON-friendly response
    return {
        "summary": result.summary(),
        "reports": [r.to_dict() for r in result.reports],
    }


@app.get("/api/tax-regions")
def get_tax_regions() -> dict[str, Any]:
    """Return available tax countries/regions from the JSON file."""
    import json
    import os

    path = os.path.join(
        os.path.dirname(__file__),
        os.pardir,
        "tax_engine",
        "tax_regions.json",
    )
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Simplify: return {country: [region_names]}
    result: dict[str, list[str]] = {}
    for country_key, country_data in data.items():
        regions = country_data.get("regions", {})
        result[country_key] = list(regions.keys())
    return result


@app.get("/api/scenarios/countries")
def get_available_countries() -> dict[str, Any]:
    """Return available countries for historical scenarios with data ranges."""
    countries: dict[str, Any] = {}
    for key in _COUNTRY_REGISTRY:
        try:
            ds = load_historical_dataset(key)
            countries[key] = {
                "start_year": ds.start_year,
                "end_year": ds.end_year,
                "num_years": len(ds),
            }
        except Exception:
            countries[key] = {"error": "data not available"}
    return countries


# ------------------------------------------------------------------ #
# Serve frontend SPA (must be registered LAST)
# ------------------------------------------------------------------ #

if _STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=_STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str) -> FileResponse:
        """Serve index.html for any non-API route (SPA client-side routing)."""
        file = _STATIC_DIR / full_path
        if file.is_file():
            return FileResponse(file)
        return FileResponse(_STATIC_DIR / "index.html")
