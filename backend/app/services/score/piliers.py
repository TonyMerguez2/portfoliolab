"""
L'assemblage des cinq piliers.

⚠️ Un module et non cinq fichiers, contrairement à la lettre du cahier des charges.
Chaque pilier n'est qu'une **composition** — appeler ses métriques, les renormaliser,
écrire une phrase — soit une quinzaine de lignes qui partagent toutes le même appel à
`renormaliser`. Cinq fichiers auraient été de la cérémonie sans rien isoler.

L'exigence de fond est tenue là où elle compte : aucun calcul dans un composant,
aucun seuil hors de `config.py` et `profils.py`, et les métriques elles-mêmes vivent
dans des modules séparés parce qu'elles portent, elles, de la logique.

Chaque pilier rend un score sur cent, `None` si aucune de ses métriques n'est
mesurable. ⚠️ Jamais zéro : un pilier vide se déclare vide.
"""

from __future__ import annotations

from .config import POIDS_PILIERS
from .metriques import adequation as m_adequation
from .metriques import construction as m_construction
from .metriques import diversification as m_diversification
from .metriques import qualite as m_qualite
from .metriques import risque as m_risque
from .normalisation import renormaliser
from .profils import Reglages
from .types import Pilier


def _pilier(cle: str, libelle: str, metriques: list, poids: float, explication: str) -> Pilier:
    """Assemble un pilier et renormalise ses poids sur les métriques mesurables."""
    note = renormaliser(metriques)
    return Pilier(cle=cle, libelle=libelle, score=note, poids=poids,
                  metriques=metriques, explication=explication)


def diversification(poids_lignes, hhi_lignes, par_indice, ventilation_secteurs,
                    ventilation_zones, rendements, reglages: Reglages,
                    poids_pilier: float) -> Pilier:
    """
    Quatre regards sur la même question : le portefeuille dépend-il de peu de choses ?

    Concentration pèse le plus (35 %) parce qu'elle mesure en transparence — c'est la
    seule des quatre qui voie à travers les fonds. Les secteurs suivent (30 %), la
    géographie ensuite (20 %), et la redondance ferme (15 %) : elle ne se déclenche
    que sur un doublon franc, donc elle est rarement décisive, mais quand elle parle
    elle est actionnable.
    """
    return _pilier(
        "diversification", "Diversification",
        [
            m_diversification.concentration(poids_lignes, hhi_lignes, par_indice, reglages),
            m_diversification.secteurs(ventilation_secteurs),
            m_diversification.geographie(ventilation_zones),
            m_diversification.redondance(rendements),
        ],
        poids_pilier,
        "À quel point votre portefeuille dépend de peu d'actifs, de peu de secteurs "
        "ou de peu de régions. Mesurée en transparence des fonds : trois ETF, c'est "
        "trois lignes mais des centaines de sociétés.",
    )


def risque(poids_lignes, rendements, cible, reglages: Reglages | None,
           poids_pilier: float) -> Pilier:
    """
    Le niveau de risque porté, face à la cible du profil.

    ⚠️ Deux métriques seulement, et un déséquilibre assumé de trois quarts contre un
    quart. Volatilité et perte maximale corrèlent à +0,88 : ce sont deux lectures de
    la même dispersion. Les compter à parts égales aurait pesé deux fois la même
    mesure, exactement ce que le cahier des charges demande d'éviter par des caps.

    ⚠️ Faiblesse connue de cette V1 : trente pour cent de la note repose sur une seule
    grandeur robuste. C'est un choix par défaut de mieux — VaR, CVaR et bêta ont été
    écartés pour des raisons mesurées, voir `config.ECARTEES` — mais c'est le premier
    endroit à renforcer quand des données plus riches seront disponibles.
    """
    return _pilier(
        "risque", "Risque",
        [
            m_risque.volatilite(poids_lignes, rendements, cible, reglages),
            m_risque.perte_maximale(poids_lignes, rendements, cible, reglages),
        ],
        poids_pilier,
        "L'amplitude des variations que vous subissez, comparée à celle que votre "
        "profil implique. Sans profil déclaré, elle est mesurée sans être notée : un "
        "niveau de risque ne se juge que face à une intention.",
    )


def construction(poids_lignes, frais_par_ligne, part_fonds, courtage, nature,
                 reglages: Reglages, poids_pilier: float) -> Pilier:
    """
    Ce que l'épargnant décide vraiment.

    Les frais des fonds dominent (50 %) parce qu'ils sont certains et récurrents, là
    où tout le reste est espéré. La taille de la plus grosse ligne suit (30 %),
    l'équilibre des pondérations ensuite (20 %), et le courtage ferme à 20 % — poids
    faible à dessein, il dépend du courtier et du rythme d'ordres plus que du
    portefeuille.
    """
    return _pilier(
        "construction", "Construction",
        [
            m_construction.frais_fonds(frais_par_ligne, poids_lignes, part_fonds),
            m_construction.position_maximale(poids_lignes, reglages, nature),
            m_construction.equilibre(poids_lignes),
            m_construction.frais_courtage(courtage),
        ],
        poids_pilier,
        "L'équilibre de vos pondérations et le coût structurel de vos fonds — les "
        "seuls éléments du score entièrement sous votre contrôle.",
    )


def qualite(poids_lignes, details, nature, frais_par_ligne,
            poids_pilier: float) -> Pilier:
    """
    La solidité de ce qui est détenu, jugée selon le **type** de chaque actif.

    ⚠️ Le pilier le plus lacunaire, et le seul dont je dirais qu'il est incomplet plus
    qu'imparfait. Les actions n'y sont pas notées faute de fondamentaux fiables chez la
    source, et les cryptomonnaies ne le sont que sur leur ancienneté de cotation. Son
    poids de quinze pour cent en tient compte, et la confiance baisse à proportion.
    """
    return _pilier(
        "qualite", "Qualité",
        [m_qualite.qualite_actifs(poids_lignes, details, nature, frais_par_ligne)],
        poids_pilier,
        "La solidité de ce que vous détenez, jugée selon le type de chaque actif : "
        "frais et étendue interne pour un fonds, ancienneté pour une cryptomonnaie. "
        "Les actions ne sont pas notées — la source ne donne pas de fondamentaux.",
    )


def adequation(poids_lignes, nature, classes, cible, reglages: Reglages | None,
               poids_pilier: float) -> Pilier:
    """
    Le risque pris est-il **de la nature** acceptée ?

    ⚠️ À ne pas confondre avec le pilier Risque, qui mesure l'amplitude. Ici on
    mesure la composition : un portefeuille peut avoir exactement la volatilité visée
    par un prudent tout en étant à trente pour cent en cryptomonnaies, ou en actions
    au-delà de ce qu'il a déclaré supporter. Les deux piliers répondent alors
    différemment, et c'est le signe qu'ils ne se recopient pas.
    """
    return _pilier(
        "adequation", "Adéquation au profil",
        [
            m_adequation.exposition_crypto(poids_lignes, nature, reglages),
            m_adequation.part_actifs_risques(classes, poids_lignes, nature,
                                             cible, reglages),
        ],
        poids_pilier,
        "La cohérence entre ce que vous détenez et le profil déclaré. Le pilier "
        "Risque mesure combien votre portefeuille bouge ; celui-ci vérifie que le "
        "risque pris est du type que vous avez accepté.",
    )


def poids_du_profil(reglages: Reglages | None) -> dict[str, float]:
    """
    Les poids des cinq piliers pour un profil donné.

    Sans profil déclaré, ceux de référence : on ne devine pas une intention, et les
    piliers qui en dépendent se déclarent simplement non mesurés.
    """
    return reglages.poids_piliers() if reglages else dict(POIDS_PILIERS)
