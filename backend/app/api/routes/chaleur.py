"""La carte de chaleur : une route, une période, cinq cents titres."""

from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.concurrency import run_in_threadpool

from app.services.chaleur import PERIODES, carte

router = APIRouter(prefix="/api/v1", tags=["Chaleur"])


@router.get("/chaleur")
async def lire_chaleur(
    periode: str = Query("1j", description="1j, 1s, 1m, 3m, aaj ou 1a"),
) -> dict:
    """
    Les composants du S&P 500 avec leur secteur, leur capitalisation et leur
    variation sur la période demandée.

    ⚠️ **Passée au pool de fils, parce que le calcul est bloquant.** `yf.download`
    est un appel réseau synchrone d'une dizaine de secondes quand le cache est
    froid. Appelé directement dans la coroutine, il bloquerait la boucle
    d'événements — donc **toutes** les requêtes du serveur, pas seulement
    celle-ci. Le cache chaud, lui, rend en une fraction de milliseconde.
    """
    return await run_in_threadpool(carte, periode)


@router.get("/chaleur/periodes")
async def lire_periodes() -> list[str]:
    """Les périodes acceptées, pour que le sélecteur de l'interface n'en invente pas."""
    return list(PERIODES.keys())
