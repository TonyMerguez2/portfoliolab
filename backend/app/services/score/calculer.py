"""
Le point d'entrée du NOVAC Portfolio Score.

⚠️ Sans profil déclaré, les piliers **structurels** notent quand même, les piliers
**relatifs au profil** se taisent. La distinction n'est pas de commodité.

Diversification et Construction se jugent sans connaître l'intention de personne : un
portefeuille à quatre-vingt-dix pour cent sur une ligne est mal construit pour
n'importe qui, et une ligne sur un seul secteur est peu diversifiée quel que soit
l'horizon. Ces piliers appliquent donc les seuils de l'équilibré comme repères
neutres, ce qui est indiqué à l'écran.

Risque et Adéquation, eux, n'ont aucun sens dans l'absolu. Juger une volatilité de
dix-huit pour cent sans savoir ce que l'épargnant peut supporter revient à décréter
son projet à sa place — l'échelle absolue qui vivait dans l'ancien score plafonnait un
portefeuille cent pour cent actions à soixante-douze, pour un choix parfaitement
légitime. Ils se déclarent donc non mesurés, la note se calcule sur le reste, et
l'indice de confiance en porte la trace.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone

from . import piliers as assemblage
from .config import VERSION_METHODOLOGIE, bande
from .confiance import confiance, manquantes
from .insights import produire
from .normalisation import arrondir
from .profils import PROFILS, reglages
from .types import Pilier, Resultat


@dataclass
class Entrees:
    """
    Tout ce dont le moteur a besoin, rassemblé.

    ⚠️ Une structure plutôt que quinze paramètres positionnels. Le calcul consomme des
    entrées de natures très différentes — des poids, des séries, des ventilations, des
    compositions — et une signature à quinze arguments s'appelle mal, se relit mal, et
    finit par se tromper d'ordre.

    Chaque champ est optionnel : le moteur doit produire un score utile même quand la
    moitié des données manque, c'est sa raison d'être.
    """

    # Poids des lignes, en pourcentage du portefeuille.
    poids: dict[str, float] = field(default_factory=dict)
    # Une colonne de rendements quotidiens par ligne détenue.
    rendements: object | None = None
    # Fiches par ticker : frais, composition interne, ancienneté.
    details: dict[str, dict] = field(default_factory=dict)
    # `actif` | `crypto` | `fonds` par ticker, pour les lignes dont on le sait.
    nature: dict[str, str] = field(default_factory=dict)
    # Ventilations **complètes**, non celles des graphiques : voir `metriques.secteurs`.
    ventilation_secteurs: list[dict] | None = None
    ventilation_zones: list[dict] | None = None
    classes: list[dict] | None = None
    # Concentration interne par ligne, et lignes dont elle vient de l'indice suivi.
    hhi_lignes: dict[str, float] = field(default_factory=dict)
    hhi_par_indice: set[str] = field(default_factory=set)
    frais_par_ligne: dict[str, float] = field(default_factory=dict)
    part_fonds: float | None = None
    courtage: float | None = None
    profil: str | None = None
    # Cibles dérivées de l'horizon et de la tolérance, via `analyse.profil_cible`.
    cible: dict | None = None
    historique_jours: int | None = None


def calculer(entrees: Entrees) -> Resultat:
    """
    Le score complet : cinq piliers, une confiance, des insights.

    Le score final est la moyenne des piliers **mesurables**, pondérée par leurs poids
    renormalisés. Un pilier sans aucune métrique ne compte pas et ne vaut pas zéro —
    la même règle qu'à l'intérieur des piliers, pour la même raison.
    """
    regl = reglages(entrees.profil)
    # Repères neutres pour les piliers structurels quand le profil manque. L'écran le
    # dit : « seuils de référence, profil non déclaré ».
    structurel = regl or PROFILS["equilibre"]
    poids_p = assemblage.poids_du_profil(regl)

    liste: list[Pilier] = [
        assemblage.diversification(
            entrees.poids, entrees.hhi_lignes, entrees.hhi_par_indice,
            entrees.ventilation_secteurs, entrees.ventilation_zones,
            entrees.rendements, structurel, poids_p["diversification"]),
        assemblage.risque(
            entrees.poids, entrees.rendements, entrees.cible, regl,
            entrees.classes, entrees.nature, poids_p["risque"]),
        assemblage.construction(
            entrees.poids, entrees.frais_par_ligne, entrees.part_fonds,
            entrees.courtage, entrees.nature, structurel, poids_p["construction"]),
        assemblage.qualite(
            entrees.poids, entrees.details, entrees.nature, entrees.frais_par_ligne,
            poids_p["qualite"]),
        assemblage.adequation(
            entrees.poids, entrees.nature, entrees.classes, entrees.cible, regl,
            poids_p["adequation"]),
    ]

    # ── Le score final ────────────────────────────────────────────────────────
    mesurables = [p for p in liste if p.score is not None and p.poids > 0]
    total = sum(p.poids for p in mesurables)
    for p in liste:
        p.poids_effectif = (p.poids / total * 100.0) if (total > 0 and p in mesurables) else 0.0

    note = (sum(p.score * p.poids for p in mesurables) / total) if total > 0 else None

    forts, attention = produire(entrees, liste, regl)

    return Resultat(
        score=arrondir(note),
        libelle=bande(arrondir(note)),
        profil=regl.cle if regl else None,
        confiance=confiance(liste, entrees.historique_jours),
        piliers=liste,
        points_forts=forts,
        points_attention=attention,
        donnees_manquantes=manquantes(liste),
        calcule_le=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        version_methodologie=VERSION_METHODOLOGIE,
    )


def en_dict(resultat: Resultat) -> dict:
    """
    Le résultat sous forme sérialisable, telle que la route le rend.

    ⚠️ Les notes sont **arrondies à l'entier** ici et nulle part ailleurs. Une
    décimale afficherait une précision que le calcul n'a pas : les repères sont des
    ordres de grandeur défendables, pas des constantes. « Diversification 73,48273 »
    est un faux signal de précision, donc une forme de malhonnêteté discrète.
    """
    return {
        "score": resultat.score,
        "libelle": resultat.libelle,
        "profil": resultat.profil,
        "confiance": resultat.confiance,
        "piliers": [
            {
                "cle": p.cle,
                "libelle": p.libelle,
                "score": arrondir(p.score),
                "poids": round(p.poids, 1),
                "poids_effectif": round(p.poids_effectif, 1),
                "explication": p.explication,
                "metriques": [
                    {
                        "cle": m.cle,
                        "libelle": m.libelle,
                        "score": arrondir(m.score),
                        "statut": m.statut,
                        "poids": round(m.poids, 1),
                        "poids_effectif": round(m.poids_effectif, 1),
                        "valeur": m.valeur,
                        "lecture": m.lecture,
                        "explication": m.explication,
                        "couverture": round(m.couverture, 3),
                    }
                    for m in p.metriques
                ],
            }
            for p in resultat.piliers
        ],
        "points_forts": [{"ton": i.ton, "titre": i.titre, "detail": i.detail}
                         for i in resultat.points_forts],
        "points_attention": [{"ton": i.ton, "titre": i.titre, "detail": i.detail}
                             for i in resultat.points_attention],
        "donnees_manquantes": resultat.donnees_manquantes,
        "calcule_le": resultat.calcule_le,
        "version_methodologie": resultat.version_methodologie,
    }
