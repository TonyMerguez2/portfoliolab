"""
Le backtest de l'allocation d'un portefeuille, bien avant qu'il n'existe.

⚠️ **Pourquoi remonter plus loin que les ETF détenus.** Les fonds européens sont récents :
sur un vrai PEA, l'histoire commune des trois lignes commence en mai 2014 et ne contient
aucune crise majeure — d'où un rendement mesuré de 13 % par an, qui n'est pas une attente
raisonnable. En substituant à chaque ligne un fonds plus ancien suivant **le même marché**,
la fenêtre remonte à octobre 2001 : 24,8 ans, la crise de 2008, celle de 2020 et l'année
2022 comprises. Le même portefeuille y rend 9,50 % par an — et a perdu 57,5 % dans son pire
épisode.

⚠️ **C'est une simulation, pas l'histoire de l'épargnant.** Il ne détenait pas cette
allocation en 2008. Ce calcul répond à « qu'aurait fait cette répartition », ce qui est
utile pour formuler une attente, et n'est pas « ce que j'ai gagné ». L'écran doit dire
lequel des deux il montre.

⚠️ **Trois hypothèses explicites**, sans quoi le chiffre n'est pas interprétable :
rééquilibrage **mensuel** aux poids cibles, dividendes réinvestis (les substituts sont des
fonds, pas des indices de prix), et rendements **libellés en dollars** — un épargnant en
euros a touché autre chose selon le change.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

#: À chaque marché, un fonds à longue histoire qui le suit.
#:
#: ⚠️ **Le même marché, pas le même fonds.** SPY n'est pas ESE.PA : frais différents,
#: devise différente, réplication différente. Ce qui est substitué est l'exposition — le
#: S&P 500 reste le S&P 500 — et c'est la seule chose dont on ait besoin pour juger d'un
#: ordre de grandeur sur vingt-cinq ans. Les substitutions employées sont rendues à
#: l'appelant, pour que l'écran puisse les nommer plutôt que de les taire.
#:
#: Les dates d'ouverture, relevées : SPY 1993, IEV et EZU 2000, EPP 2001, AAXJ 2008,
#: VGK 2005, ACWI 2008. On retient le plus ancien de chaque marché.
SUBSTITUTS: dict[str, str] = {
    # Grands indices américains
    "ESE.PA": "SPY", "CSPX.AS": "SPY", "SXR8.DE": "SPY", "IVV": "SPY", "VOO": "SPY",
    "CW8.PA": "ACWI", "IWDA.AS": "ACWI", "EUNL.DE": "ACWI",
    # Europe
    "ETZ.PA": "IEV", "EXSA.DE": "IEV", "MEUD.PA": "IEV", "VGK": "IEV",
    # Asie-Pacifique hors Japon, et émergents
    "PAEJ.PA": "EPP", "AAXJ": "EPP", "VPL": "EPP",
    "AEEM.PA": "EEM", "IEMA.AS": "EEM",
}

#: Sous cette durée, un backtest ne contient aucune crise et ne vaut pas une attente.
ANNEES_MINIMALES = 10

#: Séances par an, pour annualiser.
SEANCES_PAR_AN = 252


@dataclass(frozen=True)
class Backtest:
    """Ce qu'aurait fait cette répartition, et à quel prix."""

    rendement: float
    volatilite: float
    #: Le pire recul du sommet au creux, en pourcentage — négatif.
    #:
    #: ⚠️ Affiché avec le rendement, jamais séparément. Neuf et demi pour cent par an
    #: obtenus au prix d'un recul de 57 % n'est pas la même proposition que neuf et demi
    #: pour cent tranquilles, et c'est le second chiffre qui dit si l'épargnant aurait
    #: tenu.
    pire_recul: float
    annees: float
    debut: str
    fin: str
    #: `{ticker d'origine: substitut}`, pour les seules lignes substituées.
    substitutions: dict[str, str]
    #: La part de l'allocation effectivement couverte, en pourcentage.
    couverture: float


def serie_rebalancee(
    cours: list[dict[str, float]], poids: dict[str, float], mois: list[int],
) -> list[float]:
    """
    La valeur d'un portefeuille rééquilibré mensuellement, base 1.

    `cours` est une liste de relevés `{ticker: prix}` par séance, `mois` le numéro de mois
    de chaque séance — c'est lui qui déclenche le rééquilibrage.

    ⚠️ **Rééquilibrage mensuel, et non des poids constants au jour le jour.** Des poids
    constants supposent un rééquilibrage continu, ce que personne ne fait, et cela ajoute
    un gain de rééquilibrage qui n'existe pas. Une fois par mois est réaliste et se dit.
    """
    if not cours or not poids:
        return []
    total = sum(poids.values()) or 1.0
    cible = {t: w / total for t, w in poids.items()}
    parts = {t: cible[t] / cours[0][t] for t in cible if cours[0].get(t)}
    suite = [1.0]
    mois_courant = mois[0]
    for i in range(1, len(cours)):
        valeur = sum(parts.get(t, 0.0) * cours[i][t] for t in cible if cours[i].get(t))
        if mois[i] != mois_courant:
            parts = {t: cible[t] * valeur / cours[i][t]
                     for t in cible if cours[i].get(t)}
            mois_courant = mois[i]
        suite.append(valeur)
    return suite


def pire_recul(suite: list[float]) -> float:
    """
    Le plus fort recul du sommet au creux, en pourcentage négatif.

    ⚠️ Mesuré sur les sommets **glissants** et non depuis le premier point : un
    portefeuille qui triple puis perd la moitié a reculé de cinquante pour cent, même s'il
    reste au-dessus de son point de départ.
    """
    if len(suite) < 2:
        return 0.0
    sommet, pire = suite[0], 0.0
    for v in suite:
        sommet = max(sommet, v)
        if sommet > 0:
            pire = min(pire, v / sommet - 1.0)
    return round(pire * 100, 2)


def annualiser_suite(suite: list[float], annees: float) -> float | None:
    """Le rendement annuel équivalent d'une suite base 1."""
    if len(suite) < 2 or annees <= 0 or suite[0] <= 0 or suite[-1] <= 0:
        return None
    return round(((suite[-1] / suite[0]) ** (1 / annees) - 1) * 100, 2)
