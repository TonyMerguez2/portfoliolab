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
from app.services.rankings import start_preload
from app.api.routes.backtest import router as backtest_router
from app.api.routes.portfolios import router as portfolios_router
from app.api.routes.auth import router as auth_router
from app.api.routes.ticker import router as ticker_router
from app.api.routes.transactions import router as transactions_router
from app.api.routes.objectifs import router as objectifs_router
from app.api.routes.comptes import constantes as comptes_constantes, router as comptes_router
from app.models.user import User
# Import pour que SQLAlchemy enregistre le modèle Transaction avant create_all
from app.core.database import Transaction  # noqa: F401

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

# CORS — le serveur de développement Next, sur cette machine ou sur le réseau
# local.
#
# La liste nommée ne couvre que « localhost », ce qui suffit tant qu'on ouvre le
# site là où il tourne. Depuis un autre appareil, l'origine devient l'adresse IP
# de la machine hôte, et le navigateur refuse la réponse.
#
# L'expression ci-dessous n'ouvre que les trois plages réservées aux réseaux
# privés — celles qu'aucun routeur ne route vers l'extérieur. Une origine
# publique reste refusée, et l'exposition ne dépasse donc pas le réseau auquel
# la machine est déjà connectée.
_ORIGINES_RESEAU_LOCAL = (
    r"^http://("
    r"192\.168\.\d{1,3}\.\d{1,3}"
    r"|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
    r"|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}"
    r"):\d+$"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_origin_regex=_ORIGINES_RESEAU_LOCAL,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(backtest_router)
app.include_router(portfolios_router)
app.include_router(auth_router)
app.include_router(ticker_router)
app.include_router(transactions_router)
app.include_router(objectifs_router)
app.include_router(comptes_router)
app.include_router(comptes_constantes)
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.on_event("startup")
async def on_startup() -> None:
    start_preload()


@app.get("/health", tags=["System"])
async def health() -> dict:
    return {"status": "ok", "version": settings.app_version}
