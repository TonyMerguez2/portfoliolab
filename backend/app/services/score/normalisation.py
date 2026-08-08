"""
Conversion en note, et renormalisation des poids sur ce qui est mesurable.

Deux idées, et la seconde est la plus importante du moteur.
"""

from __future__ import annotations

from .config import COUVERTURE_MIN
from .types import Metrique, Statut


def note_decroissante(valeur: float, bon: float, mauvais: float) -> float:
    """
    Cent quand `valeur` vaut `bon`, zéro quand elle vaut `mauvais`.

    Interpolation linéaire bornée, `bon` pouvant être supérieur ou inférieur à
    `mauvais` selon le sens de la grandeur — un nombre d'actifs se lit à l'endroit,
    une volatilité à l'envers.

    ⚠️ Linéaire, et c'est un choix. Une courbe en S ou une exponentielle donnerait
    l'apparence d'une modélisation sans en avoir la substance : rien dans les données
    ne justifie une forme particulière, et une droite entre deux repères défendables
    est plus facile à contester — donc plus honnête.
    """
    if mauvais == bon:
        return 50.0
    t = (valeur - bon) / (mauvais - bon)
    return float(max(0.0, min(100.0, 100.0 * (1.0 - t))))


def statut_pour(couverture: float, mesurable: bool) -> Statut:
    """
    Le statut d'une mesure, d'après la part du portefeuille qu'elle couvre.

    `partiel` existe parce que « mesuré sur 70 % du portefeuille » est une
    information utile, et différente de « mesuré » comme de « non mesuré ». Sous
    `COUVERTURE_MIN`, la mesure devient `indisponible` : moyenner sur un tiers du
    portefeuille produit un chiffre qui a l'air d'un chiffre.
    """
    if not mesurable or couverture <= 0:
        return "indisponible"
    if couverture < COUVERTURE_MIN:
        return "indisponible"
    return "disponible" if couverture >= 0.999 else "partiel"


def renormaliser(metriques: list[Metrique]) -> float | None:
    """
    La note d'un groupe, et les poids effectifs de chaque métrique.

    ⚠️ **Une donnée absente ne vaut pas zéro ; son poids se répartit sur les autres.**

    C'est la règle qui distingue ce moteur d'un score naïf, et elle vient d'un dégât
    réel : un facteur non mesuré compté zéro faisait chuter la note d'un portefeuille
    dont on savait seulement moins de choses. Un portefeuille créé hier n'a pas de
    volatilité ; ce n'est pas une volatilité nulle, et encore moins une faute.

    L'exemple du cahier des charges, vérifié par un test : trois métriques à 40, 30 et
    30 %, celle du milieu indisponible — les deux autres deviennent 57,14 et 42,86 %.

    Rend `None` si aucune métrique n'est mesurable. Un pilier vide se déclare vide, il
    ne vaut pas zéro non plus.

    ⚠️ Effet de bord assumé : `poids_effectif` est écrit sur les métriques reçues. La
    valeur ne peut pas être calculée par la métrique elle-même, qui ignore lesquelles
    de ses voisines ont abouti.
    """
    disponibles = [m for m in metriques if m.score is not None and m.poids > 0]
    total = sum(m.poids for m in disponibles)

    for m in metriques:
        m.poids_effectif = (m.poids / total * 100.0) if (total > 0 and m in disponibles) else 0.0

    if not disponibles or total <= 0:
        return None
    return sum(m.score * m.poids for m in disponibles) / total


def arrondir(note: float | None) -> int | None:
    """
    Une note entière.

    ⚠️ Aucune décimale, jamais. « Diversification 73,48273 » afficherait une
    précision que le calcul n'a pas : les repères sont des ordres de grandeur
    défendables, pas des constantes physiques. Le faux signal de précision est une
    forme de malhonnêteté discrète.
    """
    return None if note is None else int(round(note))
