"""
Les types du NOVAC Portfolio Score.

⚠️ Une métrique porte trois choses inséparables : sa **valeur brute**, sa **note**,
et son **statut**. Les séparer serait la porte ouverte au défaut que ce moteur
existe pour éviter — une note affichée sans qu'on sache si elle repose sur une
mesure, sur une mesure partielle, ou sur rien.

Le vocabulaire est en français comme tout le code de ce projet, y compris les
statuts. Le cahier des charges les nommait `available / partial / unavailable` ;
mélanger deux langues dans les clés d'une même réponse d'API aurait coûté plus en
confusion qu'il n'aurait rapporté en fidélité littérale.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

# ── Statut d'une mesure ───────────────────────────────────────────────────────
#
# `partiel` n'est pas un aveu de faiblesse mais une information utile : une
# ventilation sectorielle connue sur 70 % du portefeuille se mesure, à condition de
# dire qu'il en manque 30. C'est ce statut qui alimente l'indice de confiance.
Statut = Literal["disponible", "partiel", "indisponible"]

Profil = Literal["prudent", "equilibre", "dynamique"]


@dataclass
class Metrique:
    """
    Une mesure élémentaire, notée sur cent.

    `score` vaut `None` quand la grandeur n'est pas calculable. ⚠️ Jamais zéro : un
    zéro se lit comme une mauvaise note, et une donnée absente n'en est pas une.
    C'est la règle qui a le plus coûté à établir dans ce projet — une ventilation
    sectorielle illisible faisait afficher « diversification 0 » et envoyait corriger
    une concentration qui n'existait pas.

    `couverture` est la part du portefeuille sur laquelle la mesure repose, entre 0
    et 1. Elle sert deux fois : à décider si la mesure vaut la peine d'être notée, et
    à pondérer l'indice de confiance — des données manquantes sur une ligne à 55 %
    ne pèsent pas comme sur une ligne à 2 %.
    """

    cle: str
    libelle: str
    score: float | None
    statut: Statut
    poids: float
    # Renseigné par la renormalisation du pilier, pas par la métrique elle-même :
    # une métrique ne peut pas savoir quelles autres sont disponibles à côté d'elle.
    poids_effectif: float = 0.0
    valeur: float | None = None
    lecture: str = ""
    explication: str = ""
    couverture: float = 1.0


@dataclass
class Pilier:
    """
    Un groupe de métriques, noté sur cent.

    Le score du pilier est la moyenne de ses métriques disponibles, pondérée par
    leurs **poids effectifs** — voir `normalisation.renormaliser`. `None` quand
    aucune métrique n'est mesurable : un pilier vide ne vaut pas zéro.
    """

    cle: str
    libelle: str
    score: float | None
    poids: float
    metriques: list[Metrique] = field(default_factory=list)
    poids_effectif: float = 0.0
    explication: str = ""


@dataclass
class Insight:
    """
    Un constat **déterministe**, calculé et non rédigé.

    ⚠️ Chaque insight cite la mesure qui le fonde. Sans elle, un constat n'est
    qu'une opinion, et le lecteur ne peut ni le vérifier ni le contester. Aucun de
    ces textes ne sort d'un modèle de langage : la logique financière ne doit pas
    dépendre d'une génération.
    """

    ton: Literal["fort", "attention", "info"]
    titre: str
    detail: str


@dataclass
class Resultat:
    """Le score complet, tel que la route le rend."""

    score: int | None
    libelle: str | None
    profil: Profil | None
    confiance: int
    piliers: list[Pilier] = field(default_factory=list)
    points_forts: list[Insight] = field(default_factory=list)
    points_attention: list[Insight] = field(default_factory=list)
    donnees_manquantes: list[str] = field(default_factory=list)
    calcule_le: str = ""
    version_methodologie: str = ""
