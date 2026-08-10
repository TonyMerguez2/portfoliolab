"""
Les événements à venir d'un portefeuille : résultats, dividendes, macro.

⚠️ **Ce que la source sait, et ce qu'elle ignore.** Relevé sur de vrais titres
avant d'écrire une ligne :

- une **action** — AAPL, MSFT, TSLA — donne sa prochaine date de résultats, ses
  estimations d'EPS, ses vingt-cinq derniers trimestres avec le pourcentage de
  surprise, sa date de détachement et sa date de versement ;
- un **ETF** — ESE.PA, ETZ.PA, PAEJ.PA, CW8.PA — ne donne **rien** : calendrier
  vide, zéro versement recensé. Ce n'est pas une panne, c'est l'absence de
  publication de ce type pour ces instruments chez le fournisseur ;
- une **crypto** ne donne rien non plus, et c'est normal : il n'y a ni résultats
  trimestriels ni dividende.

Un portefeuille intégralement composé d'ETF ou de crypto rend donc une liste
vide. C'est une réponse juste, et l'appelant reçoit `sans_donnees` pour pouvoir
le dire plutôt que d'afficher un cadre muet.

⚠️ **Rien n'est inventé ici.** L'onglet qui précédait affichait « Résultats
trimestriels » pour chaque ligne du portefeuille, avec un « J+3, J+6, J+9 »
calculé depuis l'indice de la liste — des dates qui ne venaient de nulle part.
Une date absente vaut mieux qu'une date fausse.
"""

from __future__ import annotations

import json
import logging
import math
import os
import time
from dataclasses import asdict, dataclass
from datetime import date, datetime
from typing import Any, Literal

import yfinance as yf

logger = logging.getLogger(__name__)

Nature = Literal["resultats", "dividende", "economique"]


@dataclass
class Evenement:
    """Un événement daté, tel que l'interface le consomme."""
    nature: Nature
    date: str
    libelle: str
    ticker: str | None = None
    """Position dans la journée, quand la source la donne."""
    moment: str | None = None
    """Jours d'ici là. Négatif pour un événement passé, absent des listes « à venir »."""
    jours: int | None = None
    montant: float | None = None
    devise: str | None = None
    """Rendement du versement, en pourcentage du cours."""
    rendement: float | None = None
    eps_estime: float | None = None


# ── Calendrier macroéconomique ───────────────────────────────────────────────
#
# ⚠️ **Vide, et délibérément vide.**
#
# Les dates de réunion du FOMC, de publication de l'IPC et du PCE sont annoncées
# un an à l'avance par la Fed, le BLS et le BEA — donc parfaitement inscriptibles
# ici. Mais je ne les connais pas de mémoire avec certitude, et les inventer
# serait précisément la faute que ce fichier refuse : une date fausse est pire
# qu'une date absente, d'autant qu'un calendrier économique ne sert qu'à préparer
# une échéance.
#
# À remplir depuis les sources officielles :
#   FOMC  https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
#   IPC   https://www.bls.gov/schedule/news_release/cpi.htm
#   PCE   https://www.bea.gov/news/schedule
#
# Format : (date ISO, libellé, zone, heure locale de publication ou None).
# `PEREMPTION` est la dernière date couverte : au-delà, la route cesse d'annoncer
# des événements macro plutôt que de laisser croire qu'il n'y en a plus.
CALENDRIER_MACRO: list[tuple[str, str, str, str | None]] = []
PEREMPTION_MACRO: str | None = None


# ── Cache disque ─────────────────────────────────────────────────────────────
#
# ⚠️ Sur disque, et non en mémoire. Le rechargement automatique d'uvicorn vide
# tout état de processus à chaque sauvegarde de fichier : un cache en mémoire
# disparaissait alors dix fois par heure de travail, et chaque disparition
# relançait une rafale d'appels au fournisseur — qui limite le débit. Le défaut a
# déjà été vécu sur le cache des fiches de titres.
_FICHIER = "cache_evenements.json"
_VERSION = 1
_TTL = 6 * 3600
_TTL_ECHEC = 900
_memoire: dict[str, dict] = {}
_mtime: float | None = None


def _charger() -> dict[str, dict]:
    """Le cache, relu du disque si un autre processus l'a réécrit."""
    global _memoire, _mtime
    try:
        m = os.path.getmtime(_FICHIER)
    except OSError:
        return _memoire
    if _mtime == m:
        return _memoire
    try:
        with open(_FICHIER, encoding="utf-8") as f:
            brut = json.load(f)
        # Une version ancienne est **périmée**, pas jetée : ses dates restent
        # utiles le temps d'un nouvel appel, et les jeter provoquerait la rafale
        # que ce cache existe pour éviter.
        _memoire = {
            k: (v if v.get("version") == _VERSION else {**v, "echeance": 0})
            for k, v in brut.items()
        }
        _mtime = m
    except (OSError, ValueError) as e:
        logger.warning("cache événements illisible (%s)", e)
    return _memoire


def _ecrire() -> None:
    """Écriture atomique : un lecteur ne doit jamais voir un fichier à moitié écrit."""
    global _mtime
    tmp = f"{_FICHIER}.{os.getpid()}.tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(_memoire, f)
        os.replace(tmp, _FICHIER)
        _mtime = os.path.getmtime(_FICHIER)
    except OSError as e:
        logger.warning("cache événements non écrit (%s)", e)
        try:
            os.remove(tmp)
        except OSError:
            pass


def _nombre(v: Any) -> float | None:
    """Un flottant utilisable, ou rien. `NaN` compte pour rien."""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) or math.isinf(f) else f


def _jour(v: Any) -> str | None:
    """Une date ISO à partir de ce que le fournisseur rend : date, datetime, liste."""
    if isinstance(v, (list, tuple)):
        # `Earnings Date` arrive parfois en fourchette de deux dates : la première
        # est l'échéance annoncée, la seconde la borne haute de l'estimation.
        return _jour(v[0]) if v else None
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, str) and len(v) >= 10:
        return v[:10]
    return None


def trimestre(iso: str) -> str:
    """Le libellé « T3 2026 » d'une date de publication.

    ⚠️ Le trimestre **publié** est celui qui précède : une société qui annonce fin
    octobre rend compte de juillet à septembre. Nommer le trimestre courant aurait
    fait annoncer des résultats non encore vécus.
    """
    d = date.fromisoformat(iso)
    t = (d.month - 1) // 3          # 0..3, trimestre en cours
    return f"T{t if t else 4} {d.year if t else d.year - 1}"


def _fiche(ticker: str) -> dict:
    """Ce que le fournisseur dit d'un titre, mis en cache."""
    cache = _charger()
    e = cache.get(ticker)
    if e and e.get("echeance", 0) > time.time() and e.get("version") == _VERSION:
        return e

    fiche: dict = {"version": _VERSION, "abouti": False}
    try:
        t = yf.Ticker(ticker)
        cal = t.calendar or {}
        if isinstance(cal, dict) and cal:
            fiche["resultats"] = _jour(cal.get("Earnings Date"))
            fiche["eps_estime"] = _nombre(cal.get("Earnings Average"))
            fiche["detachement"] = _jour(cal.get("Ex-Dividend Date"))
            fiche["versement"] = _jour(cal.get("Dividend Date"))
        info = t.info or {}
        fiche["dividende"] = _nombre(info.get("lastDividendValue")) \
            or _nombre(info.get("dividendRate"))
        fiche["cours"] = _nombre(info.get("regularMarketPrice")) \
            or _nombre(info.get("previousClose"))
        fiche["devise"] = info.get("currency")
        fiche["abouti"] = True
    except Exception as e:                                     # pragma: no cover
        # ⚠️ L'échec est **distingué** de l'absence, et gardé moins longtemps. Les
        # confondre ferait retenir « ce titre n'a pas d'événements » pendant six
        # heures pour une simple limitation de débit.
        logger.info("événements indisponibles pour %s (%s)", ticker, type(e).__name__)

    fiche["echeance"] = time.time() + (_TTL if fiche["abouti"] else _TTL_ECHEC)
    cache[ticker] = fiche
    _ecrire()
    return fiche


def evenements_du_portefeuille(
    tickers: list[str], aujourdhui: date | None = None,
) -> dict:
    """
    Les événements à venir des titres donnés, du plus proche au plus lointain.

    Rend aussi `sans_donnees` : les titres pour lesquels la source ne publie rien.
    C'est ce qui permet à l'interface de dire « ces lignes ne publient pas de
    résultats » au lieu d'afficher un cadre vide sans explication.
    """
    ref = aujourdhui or date.today()
    evs: list[Evenement] = []
    sans: list[str] = []

    for tk in tickers:
        f = _fiche(tk)
        trouve = False

        jr = f.get("resultats")
        if jr and jr >= ref.isoformat():
            evs.append(Evenement(
                nature="resultats", date=jr, ticker=tk,
                libelle=f"Résultats {trimestre(jr)}",
                jours=(date.fromisoformat(jr) - ref).days,
                eps_estime=f.get("eps_estime"),
            ))
            trouve = True

        jd = f.get("detachement")
        if jd and jd >= ref.isoformat():
            montant = f.get("dividende")
            cours = f.get("cours")
            evs.append(Evenement(
                nature="dividende", date=jd, ticker=tk,
                libelle="Détachement du dividende",
                jours=(date.fromisoformat(jd) - ref).days,
                montant=montant, devise=f.get("devise"),
                # Le rendement du seul versement, non le rendement annuel : c'est
                # ce que ce détachement retire du cours, et non ce que le titre
                # rapporte sur un an.
                rendement=(montant / cours * 100) if montant and cours else None,
            ))
            trouve = True

        if not trouve:
            sans.append(tk)

    for iso, libelle, zone, heure in CALENDRIER_MACRO:
        if iso >= ref.isoformat():
            evs.append(Evenement(
                nature="economique", date=iso, libelle=libelle, ticker=zone,
                moment=heure, jours=(date.fromisoformat(iso) - ref).days,
            ))

    evs.sort(key=lambda e: (e.date, e.ticker or ""))
    return {
        "evenements": [asdict(e) for e in evs],
        "sans_donnees": sans,
        "peremption_macro": PEREMPTION_MACRO,
    }
