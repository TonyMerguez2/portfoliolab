"""
La volatilité **mesurée** d'un portefeuille, depuis sa propre courbe de valeur.

⚠️ **Mesurée, et non déduite d'un profil.** Le service d'analyse sait produire une
volatilité *cible* à partir d'un horizon et d'une tolérance — 20 % d'actions la première
année, cinq points par an ensuite. C'est un objectif d'allocation, pas une observation :
s'en servir pour une projection ferait passer une intention pour une mesure. Ici on
prend la suite des valeurs quotidiennes réellement atteintes par le portefeuille et on
en calcule l'écart type.

⚠️ **Un échantillon trop court n'est pas une mesure.** Une volatilité calculée sur trois
semaines dépend surtout du hasard de ces trois semaines. Sous `JOURS_MINIMAUX`, cette
fonction rend `None` : la projection perd alors son intervalle et sa probabilité, ce qui
est le comportement voulu — voir `services/projection.py`.

⚠️ **La volatilité du passé n'est pas celle de demain.** Ce module ne prétend qu'à une
chose : dire de combien ce portefeuille a bougé. L'employer dans une projection suppose
que la dispersion se maintienne, ce qui est une hypothèse, et l'écran doit le dire.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta

import numpy as np
import yfinance as yf

from app.services.portfolio_history import courbe_portefeuille

logger = logging.getLogger(__name__)

#: Le nombre de séances en dessous duquel on refuse de conclure.
#:
#: Soixante, soit environ trois mois. Sur vingt séances, l'écart type d'un portefeuille
#: d'actions se trompe couramment d'un tiers ; sur soixante, l'ordre de grandeur tient.
#: Ce n'est pas un seuil de rigueur statistique, c'est un seuil d'honnêteté d'affichage.
JOURS_MINIMAUX = 60

#: Séances par an, pour annualiser.
SEANCES_PAR_AN = 252


def volatilite_mesuree(
    transactions: list, aujourdhui: date | None = None,
) -> tuple[float | None, str, int]:
    """
    L'écart type annualisé de la valeur du portefeuille, en pourcentage.

    Rend `(volatilite, source, nombre_de_seances)`. `source` vaut « mesuree »,
    « echantillon_court » ou « indisponible » — trois cas que l'écran doit distinguer,
    parce que « je n'ai pas pu » et « je n'ai pas assez » ne se corrigent pas pareil.
    """
    if not transactions:
        return (None, "indisponible", 0)

    debut = min(t.executed_at.date() if hasattr(t.executed_at, "date") else t.executed_at
                for t in transactions)
    tickers = sorted({t.ticker for t in transactions})
    try:
        brut = yf.download(tickers, start=debut - timedelta(days=7),
                           progress=False, auto_adjust=True, threads=True)["Close"]
    except Exception as exc:                                   # pragma: no cover
        logger.warning("volatilité : téléchargement impossible (%s)", type(exc).__name__)
        return (None, "indisponible", 0)
    if brut is None or len(brut) == 0:                         # pragma: no cover
        return (None, "indisponible", 0)
    if len(tickers) == 1:
        brut = brut.to_frame(tickers[0])

    cours: dict[str, dict] = {}
    for tk in tickers:
        if tk in brut:
            serie = brut[tk].dropna()
            cours[tk] = {i.date(): float(v) for i, v in serie.items()}
    if not cours:                                              # pragma: no cover
        return (None, "indisponible", 0)

    calendrier = sorted({j for m in cours.values() for j in m})
    courbe = courbe_portefeuille(
        [{"ticker": t.ticker, "side": t.side, "quantity": t.quantity,
          "unit_price": t.unit_price, "fees": t.fees or 0.0,
          "executed_at": t.executed_at} for t in transactions],
        cours, calendrier)

    # ⚠️ **On lit `ret`, pas `value`, et c'est tout le sujet.** Mon premier jet dérivait
    # la courbe de valeur : elle contient les versements, et sur un portefeuille jeune
    # ils dominent tout — un apport de 800 € sur 3 500 € ressemble à une hausse de 23 %.
    # Résultat mesuré sur un vrai portefeuille de trois ETF larges : **140,69 % de
    # volatilité annualisée**, et un intervalle de projection montant à 4,85 milliards
    # d'euros. Le service de courbe calcule déjà, pour chaque séance,
    # `(valeur − flux) / valeur_veille − 1` : le flux y est neutralisé par construction.
    #
    # Aucun filtre de valeurs extrêmes n'est appliqué. J'en avais posé un — écarter le
    # centile le plus élevé — pour compenser le défaut ci-dessus ; il écartait en réalité
    # de vraies séances de marché et sous-estimait la dispersion. Le bon remède était de
    # lire la bonne colonne.
    points = courbe.get("points", [])
    rendements = np.asarray(
        [p["ret"] for p in points[1:] if p.get("ret") is not None], dtype=float)
    rendements = rendements[np.isfinite(rendements)]
    if len(rendements) < JOURS_MINIMAUX:
        return (None, "echantillon_court", len(rendements))

    sigma = float(np.std(rendements, ddof=1) * np.sqrt(SEANCES_PAR_AN) * 100.0)
    return (round(sigma, 2), "mesuree", len(rendements))
