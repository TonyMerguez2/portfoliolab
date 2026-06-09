"""
PortfolioLab API — FastAPI application entry point.
"""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import os
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.api.routes.backtest import router as backtest_router
from app.api.routes.portfolios import router as portfolios_router
from app.api.routes.auth import router as auth_router
from app.models.user import User

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Portfolio backtesting engine — computes performance, risk, "
        "and diversification metrics from historical market data."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — allow Next.js dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(backtest_router)
app.include_router(portfolios_router)
app.include_router(auth_router)
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/health", tags=["System"])
async def health() -> dict:
    return {"status": "ok", "version": settings.app_version}
