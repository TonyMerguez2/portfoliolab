"""
La carte de chaleur du S&P 500 : une variation et une taille par composant.

⚠️ **Tout le dessin de ce module vient d'une asymétrie mesurée.** Sur trente
titres, `yf.download` rend les cours en **1,2 seconde** pour l'ensemble ; en
face, `fast_info` et `.info` coûtent un aller-retour HTTP **par titre**, une
demi-seconde chacun. Autrement dit : ce qui change tout le temps — le cours — se
récupère par lots, et ce qui ne change presque jamais — le secteur, le nombre
d'actions — ne se récupère qu'un par un.

D'où le partage : le secteur et le nombre d'actions sont relevés hors ligne et
rangés dans `app/data/sp500.json` (voir `scripts/construire_sp500.py`), et ce
module ne fait plus qu'**un** appel groupé par rafraîchissement. La
capitalisation n'est pas lue, elle se calcule — actions × dernier cours — donc
elle suit le marché sans un appel de plus.

⚠️ **Un cache de soixante secondes, côté serveur et non côté visiteur.** La
fraîcheur demandée est « la carte respire pendant la séance ». Sans cache
partagé, dix visiteurs feraient dix appels groupés de cinq cents titres et
Yahoo finirait par étrangler la source. Avec, le coût est d'un appel par minute
quel que soit le nombre de visiteurs.

⚠️ **Périmé ne veut pas dire « fais attendre », et c'est le défaut que ce module
a eu.** Le cache expirait au bout d'une minute et le recalcul se faisait
*pendant* que le visiteur attendait : mesuré, **11,0 secondes à froid contre
0,002 à chaud**. Autrement dit, un visiteur par minute payait onze secondes, et
chaque changement de période les payait aussi. On rend désormais la valeur
périmée **immédiatement** et le rafraîchissement part derrière — la carte
affichée peut avoir soixante-dix secondes, ce qui ne se voit pas, au lieu de ne
pas s'afficher du tout pendant onze.

⚠️ **Un seul recalcul à la fois par période.** Sans cela, dix requêtes arrivant
sur un cache périmé lanceraient dix téléchargements de cinq cents titres — la
charge que le cache existe précisément pour éviter.

⚠️ **Le cache est indexé par période, parce que ce sont des séries
différentes.** Un même rafraîchissement ne sert pas « 1 jour » et « 1 an » : ce
ne sont pas les mêmes cours téléchargés.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from pathlib import Path
from typing import Any

import yfinance as yf

logger = logging.getLogger(__name__)

TABLE = Path(__file__).resolve().parent.parent / "data" / "sp500.json"

DUREE_CACHE = 60  # secondes

# Période demandée → (période yfinance, comparer au tout premier cours ?).
#
# ⚠️ **« 1 jour » se calcule sur deux clôtures, pas sur une fenêtre.** Les autres
# périodes comparent le premier et le dernier cours de la fenêtre rendue ; pour
# la séance, il faut la clôture précédente, et une fenêtre de cinq jours est le
# plus court qui traverse à coup sûr un week-end et un jour férié.
PERIODES: dict[str, tuple[str, bool]] = {
    "1j":  ("5d",  False),
    "1s":  ("5d",  True),
    "1m":  ("1mo", True),
    "3m":  ("3mo", True),
    "aaj": ("ytd", True),
    "1a":  ("1y",  True),
}

_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_verrou = threading.Lock()
_verrous_periode: dict[str, threading.Lock] = {}
_en_cours: set[str] = set()
_table: dict[str, dict] | None = None


def _charger_table() -> dict[str, dict]:
    """La table des composants, lue une fois pour la vie du processus."""
    global _table
    if _table is None:
        try:
            _table = json.loads(TABLE.read_text())
        except FileNotFoundError:
            logger.error("Table S&P 500 absente : lancer scripts/construire_sp500.py")
            _table = {}
    return _table


def _calculer(periode: str) -> dict[str, Any]:
    table = _charger_table()
    if not table:
        return {"periode": periode, "horodatage": int(time.time()), "titres": [], "sansDonnees": True}

    tickers = list(table.keys())
    fenetre, depuis_le_debut = PERIODES[periode]

    cours = yf.download(
        tickers, period=fenetre, interval="1d",
        progress=False, auto_adjust=True, threads=True,
    )
    # ⚠️ `yf.download` rend des colonnes en niveaux (« Close », ticker). Avec un
    # seul ticker il aplatit, mais on en demande toujours plusieurs centaines.
    cloture = cours["Close"]

    titres = []
    for t in tickers:
        if t not in cloture.columns:
            continue
        serie = cloture[t].dropna()
        if len(serie) < 2:
            continue
        dernier = float(serie.iloc[-1])
        reference = float(serie.iloc[0] if depuis_le_debut else serie.iloc[-2])
        if reference <= 0:
            continue
        fiche = table[t]
        titres.append({
            "ticker": t,
            "nom": fiche["nom"],
            "secteur": fiche["secteur"],
            # La capitalisation suit le cours du jour : elle n'est pas figée dans
            # la table, seul le nombre d'actions l'est.
            "capitalisation": fiche["actions"] * dernier,
            "variation": (dernier / reference - 1) * 100,
            "cours": dernier,
        })

    return {
        "periode": periode,
        "horodatage": int(time.time()),
        "titres": titres,
        "sansDonnees": not titres,
    }


def _ranger(periode: str, resultat: dict[str, Any]) -> None:
    with _verrou:
        _cache[periode] = (time.time(), resultat)


def _verrou_de(periode: str) -> threading.Lock:
    with _verrou:
        return _verrous_periode.setdefault(periode, threading.Lock())


def _rafraichir_en_fond(periode: str) -> None:
    """Recalcule derrière le dos du visiteur, au plus un fil à la fois par période."""
    with _verrou:
        if periode in _en_cours:
            return
        _en_cours.add(periode)

    def tache() -> None:
        try:
            _ranger(periode, _calculer(periode))
        except Exception:
            # L'ancienne valeur reste en place : une coupure passagère chez le
            # fournisseur ne doit pas vider la carte.
            logger.exception("Carte de chaleur : rafraîchissement échoué (%s)", periode)
        finally:
            with _verrou:
                _en_cours.discard(periode)

    threading.Thread(target=tache, daemon=True, name=f"chaleur-{periode}").start()


def carte(periode: str = "1j") -> dict[str, Any]:
    """La carte pour une période. Ne bloque que si rien n'a jamais été calculé."""
    if periode not in PERIODES:
        periode = "1j"

    with _verrou:
        connu = _cache.get(periode)

    if connu:
        if time.time() - connu[0] >= DUREE_CACHE:
            _rafraichir_en_fond(periode)
        return connu[1]

    # ⚠️ Premier appel pour cette période : il faut bien attendre le calcul. Le
    # verrou par période évite que dix requêtes simultanées lancent dix
    # téléchargements ; les neuf autres attendent, puis lisent le cache.
    with _verrou_de(periode):
        with _verrou:
            connu = _cache.get(periode)
        if connu:
            return connu[1]
        try:
            resultat = _calculer(periode)
        except Exception:
            logger.exception("Carte de chaleur : premier calcul échoué (%s)", periode)
            return {"periode": periode, "horodatage": int(time.time()), "titres": [], "sansDonnees": True}
        _ranger(periode, resultat)
        return resultat
