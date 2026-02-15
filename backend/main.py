"""
Entry-point for running the SimPyRE backend.

    cd backend
    python -m uvicorn main:app --reload --port 8000
"""

from src.api.routes import app  # noqa: F401
