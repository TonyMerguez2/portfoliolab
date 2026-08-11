"""
Les taux de change, relevés chez le fournisseur.

⚠️ **Séparé de `devises.py` à dessein.** Ce dernier est pur : une liste, un symbole, une
règle de conversion, et des tests qui tournent sans réseau. Ici on appelle un fournisseur,
donc on peut échouer, être lent, et rendre `None`. Mélanger les deux aurait rendu la partie
qui compte — la conversion jour par jour — dépendante du réseau pour être testée.

⚠️ **Un taux affiché sans sa date n'est pas un taux.** Le fournisseur rend le dernier cours
connu, qui peut avoir un ou trois jours quand le marché des changes est fermé. La date
accompagne donc la valeur, et l'écran l'affiche.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

from app.services.devises import DEVISES, devise

logger = logging.getLogger(__name__)

#: Un taux de change vaut quelques heures : l'afficher à la minute n'apporte rien, et
#: chaque appel coûte une requête réseau sur le chemin d'une page de réglages.
_TTL = 6 * 3600
_TTL_ECHEC = 600


@dataclass(frozen=True)
class Taux:
    """Le prix d'un dollar dans une devise, à une date."""

    code: str
    valeur: float
    date: str


def taux_courants() -> dict[str, Taux]:
    """
    Le dernier taux connu de chaque devise de la liste, le dollar excepté.

    Rend un dictionnaire éventuellement **partiel** : une paire indisponible est absente
    plutôt que remplacée par une valeur inventée. L'écran affiche alors la devise sans son
    taux, ce qui est exact, au lieu d'un chiffre faux.
    """
    from app.services.evenements import _charger, _ecrire, _VERSION

    cle = "change:taux_courants"
    cache = _charger()
    e = cache.get(cle)
    if e and e.get("echeance", 0) > time.time() and e.get("version") == _VERSION:
        return {c: Taux(**t) for c, t in (e.get("resultat") or {}).items()}

    paires = {d.paire_depuis_usd: d.code for d in DEVISES if d.paire_depuis_usd}
    resultat: dict[str, dict] = {}
    try:
        import yfinance as yf

        brut = yf.download(list(paires), period="5d", progress=False,
                           auto_adjust=True, timeout=10)
        if not brut.empty:
            fermeture = brut["Close"] if "Close" in brut else brut
            for paire, code in paires.items():
                if paire not in fermeture:
                    continue
                serie = fermeture[paire].dropna()
                if serie.empty:
                    continue
                valeur = float(serie.iloc[-1])
                if valeur <= 0:
                    continue
                resultat[code] = {
                    "code": code,
                    # Arrondi au dix-millième : un taux de change s'écrit ainsi, et quatre
                    # décimales suffisent à tout montant qu'affiche ce site.
                    "valeur": round(valeur, 4),
                    "date": str(serie.index[-1])[:10],
                }
    except Exception as exc:  # réseau, format, paire retirée
        logger.warning("taux de change indisponibles : %s", exc)

    cache[cle] = {"version": _VERSION, "resultat": resultat,
                  "echeance": time.time() + (_TTL if resultat else _TTL_ECHEC)}
    _ecrire()
    return {c: Taux(**t) for c, t in resultat.items()}


def formuler(code: str, taux: Taux | None) -> str | None:
    """
    « 1 $ = 0,8612 € », prêt à afficher — ou `None` si le taux manque.

    ⚠️ Le sens est écrit en clair parce qu'il est la seule chose qu'on puisse vérifier d'un
    coup d'œil. Une paire inversée donne un nombre plausible : 1,16 au lieu de 0,86 se lit
    aussi bien, et fausse tout ce qui en dépend.
    """
    if taux is None:
        return None
    d = devise(code)
    valeur = f"{taux.valeur:,.4f}".replace(",", " ").replace(".", ",")
    return f"1 $ = {valeur} {d.symbole}"
