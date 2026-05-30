"""
API routes — v1.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    BacktestRequest,
    BacktestResponse,
    EfficientFrontierRequest,
    EfficientFrontierResponse,
    MonteCarloRequest,
    MonteCarloResponse,
    TickerValidation,
)
from app.services.backtest_service import (
    run_backtest,
    run_efficient_frontier,
    run_monte_carlo,
)
from app.services.data_service import validate_ticker, BENCHMARK_NAMES

router = APIRouter(prefix="/api/v1")
logger = logging.getLogger(__name__)


@router.post("/backtest", response_model=BacktestResponse, tags=["Backtest"])
async def backtest(req: BacktestRequest) -> BacktestResponse:
    """
    Run a full portfolio backtest.

    - Fetches historical price data for all assets and the chosen benchmark
    - Computes performance, risk, and diversification metrics
    - Returns time series, correlation matrix, and automated commentary
    """
    try:
        return run_backtest(req)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Backtest error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal computation error")


@router.get(
    "/validate-ticker/{ticker}",
    response_model=TickerValidation,
    tags=["Utilities"],
)
async def check_ticker(ticker: str) -> TickerValidation:
    """Validate a ticker symbol against Yahoo Finance."""
    result = validate_ticker(ticker)
    return TickerValidation(**result)


@router.get("/benchmarks", tags=["Utilities"])
async def get_benchmarks() -> list[dict]:
    """List available benchmark indices."""
    return [
        {"ticker": ticker, "name": name}
        for ticker, name in BENCHMARK_NAMES.items()
    ]


@router.post(
    "/efficient-frontier",
    response_model=EfficientFrontierResponse,
    tags=["Advanced"],
)
async def efficient_frontier(req: EfficientFrontierRequest) -> EfficientFrontierResponse:
    """
    Compute the Markowitz efficient frontier for a set of assets.

    Returns the frontier curve, max-Sharpe portfolio, and minimum-variance portfolio.
    """
    try:
        return run_efficient_frontier(req)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Frontier error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Optimization failed")


@router.post(
    "/monte-carlo",
    response_model=MonteCarloResponse,
    tags=["Advanced"],
)
async def monte_carlo(req: MonteCarloRequest) -> MonteCarloResponse:
    """
    Run Monte Carlo simulations (Geometric Brownian Motion) on the portfolio.

    Returns percentile bands (P5–P95) over the projection horizon.
    """
    try:
        return run_monte_carlo(req)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Monte Carlo error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Simulation failed")


@router.post("/monte-carlo-advanced", tags=["Advanced"])
async def monte_carlo_advanced(
    req: MonteCarloRequest,
    target: float | None = None,
) -> dict:
    """
    Advanced Monte Carlo with goal tracking, robustness score, and distribution analysis.
    """
    try:
        from app.services.backtest_service import run_monte_carlo_advanced
        return run_monte_carlo_advanced(req, target_value=target)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Advanced Monte Carlo error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Simulation failed")
