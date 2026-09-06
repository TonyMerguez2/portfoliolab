"""Les capitalisations boursières d'un lot de titres : une route, un cache partagé."""

from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.concurrency import run_in_threadpool

from app.services.capitalisations import capitalisations

router = APIRouter(prefix="/api/v1", tags=["Capitalisations"])


@router.get("/capitalisations")
async def lire_capitalisations(
    tickers: str = Query("", description="Tickers séparés par des virgules"),
) -> dict[str, float]:
    """
    Les capitalisations connues pour ces tickers, en devise de cotation.

    ⚠️ **Passée au pool de fils, parce que combler un absent est bloquant.** Les tickers déjà
    en cache rendent en microsecondes ; les autres demandent un aller-retour à Yahoo. Appelée
    directement dans la coroutine, cette attente bloquerait **toutes** les requêtes du serveur,
    pas seulement celle-ci — même arbitrage que la carte de chaleur.

    ⚠️ **Un ticker sans capitalisation est absent de la réponse, il n'y figure pas à zéro.**
    Un indice ou un fonds n'en a pas au sens strict ; les mettre à zéro les classerait au
    dernier rang comme s'ils ne valaient rien.
    """
    if not tickers:
        return {}
    return await run_in_threadpool(capitalisations, tickers.split(","))
