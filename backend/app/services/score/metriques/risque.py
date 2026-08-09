"""
Les métriques du pilier Risque : le **niveau** de risque porté, face à une cible.

⚠️ Ce pilier ne note que si un profil est déclaré, et c'est le principe qui le rend
défendable. Juger une volatilité dans l'absolu revient à décréter qu'un portefeuille
prudent vaut mieux qu'un portefeuille de long terme — un arbitrage qui appartient à
l'épargnant. L'échelle absolue qui vivait ici plafonnait un portefeuille cent pour
cent actions à soixante-douze, pour un choix parfaitement légitime.

⚠️ Volatilité et perte maximale forment un **sous-groupe plafonné**, pas deux voix
égales. Mesuré sur des portefeuilles construits, leurs notes corrèlent à +0,88 : ce
sont deux lectures de la même dispersion, et la cible de perte est elle-même dérivée
de la cible de volatilité par un facteur 2,5. Les compter à parts égales aurait pesé
deux fois la même mesure — le défaut que le cahier des charges demande justement
d'éviter. D'où trois quarts contre un quart, et non moitié-moitié.
"""

from __future__ import annotations

import math

import numpy as np

from app.services.analyse import VOL_ACTIONS, VOL_CRYPTO, VOL_OBLIGATIONS

from ..normalisation import note_decroissante
from ..profils import Reglages
from ..types import Metrique


def _serie_portefeuille(poids: dict[str, float], rendements):
    """La série de rendements du portefeuille, pondérée par les poids."""
    if rendements is None or len(rendements) < 20:
        return None
    w = np.array([poids.get(c, 0.0) for c in rendements.columns], dtype=float)
    if w.sum() <= 0:
        return None
    return (rendements * (w / w.sum())).sum(axis=1)


def _ecart_asymetrique(mesure: float, cible: float, indulgence: float) -> float:
    """
    L'écart à une cible, compté plus doucement en dessous qu'au-dessus.

    Dépasser sa cible expose à vendre dans la baisse ; rester en dessous ne coûte
    qu'un manque à gagner. Les deux sont des écarts au projet déclaré, pas de même
    gravité, et une pénalité symétrique les confondrait.

    L'indulgence dépend du profil : un prudent est presque totalement excusé d'être
    trop prudent, un dynamique un peu moins.
    """
    ecart = mesure - cible
    return ecart if ecart > 0 else -ecart * indulgence


def volatilite_structurelle(classes: list[dict] | None, poids: dict[str, float],
                            nature: dict[str, str]) -> float | None:
    """
    La volatilité que l'**allocation** implique, indépendamment de l'année écoulée.

    Somme des volatilités de référence par classe, pondérées par les parts détenues.
    Les constantes viennent de `analyse.py`, où elles servent déjà à calculer la cible
    du profil : les réutiliser garantit que la mesure et sa cible parlent la même
    langue.

    Rend `None` si la composition par classes est inconnue — on ne devine pas une
    allocation.
    """
    total_poids = sum(w for w in poids.values() if w > 0)
    part_crypto = (sum(poids.get(t, 0.0) for t, g in nature.items() if g == "crypto")
                   / total_poids * 100.0) if total_poids > 0 else 0.0

    total = sum(x["part"] for x in (classes or []))
    if total <= 0 and part_crypto <= 0:
        return None

    part = {x.get("libelle"): x["part"] / total * 100.0 for x in (classes or [])} if total > 0 else {}
    actions = part.get("Actions", 0.0)
    obligations = part.get("Obligations", 0.0)
    # La crypto est rangée sous « Autres » par la ventilation : on la reprend de la
    # nature des lignes, seule source qui la nomme, et on la retire des « Autres ».
    autres = max(0.0, part.get("Autres", 0.0) - part_crypto)

    # Les liquidités ne bougent pas ; « Autres » est traité comme des actions, faute de
    # mieux, ce qui est le choix prudent — se tromper vers le bas serait flatteur.
    risquees = actions + autres
    vol = (risquees / 100 * VOL_ACTIONS
           + obligations / 100 * VOL_OBLIGATIONS
           + part_crypto / 100 * VOL_CRYPTO)
    return vol if vol > 0 else None


def volatilite(
    poids: dict[str, float], rendements, cible: dict | None, reglages: Reglages | None,
    classes: list[dict] | None = None, nature: dict[str, str] | None = None,
) -> Metrique:
    """
    L'amplitude annualisée des variations, comparée à la cible du profil.

    ⚠️ La mesure la plus **reproductible** de tout le moteur, et c'est pourquoi elle
    porte le pilier. L'erreur type d'un écart-type estimé sur deux cent cinquante
    séances vaut environ σ/√500, soit un demi-point pour une volatilité de onze pour
    cent. À comparer au ratio de Sharpe, écarté parce qu'il vaut 0,53 ± 1,00 sur la
    même fenêtre.

    Elle est mesurée dans la devise réellement détenue, donc sans le biais qui a
    disqualifié le bêta : aucun repère extérieur, aucun décalage de clôture.
    """
    serie = _serie_portefeuille(poids, rendements)
    realisee = float(serie.std() * math.sqrt(252) * 100) if serie is not None else None
    structurelle = volatilite_structurelle(classes, poids, nature or {})

    # ⚠️ **La plus forte des deux**, et cette règle vient d'une mesure.
    #
    # La volatilité réalisée seule dépend du régime de marché autant que du
    # portefeuille. Mesuré sur un vrai PEA investi à cent pour cent en actions : 11,1 %
    # réalisés sur une année calme, contre 16 % qu'implique son allocation. Le pilier
    # Risque notait 96 et le score global 83 ; à structure identique mais année agitée,
    # le même portefeuille tombait à 62. **Huit points de score pour la seule météo**,
    # alors que rien n'avait changé dans la construction — contraire à l'esprit d'un
    # score qui juge la construction.
    #
    # J'ai d'abord proposé une moyenne des deux, puis une moyenne relevée. Les deux sont
    # **pires** : à volatilité réalisée très basse, la moyenne se rapproche de la cible
    # et se trouve donc mieux notée qu'un portefeuille réellement à la cible. Amplitude
    # mesurée sur six régimes : 21 points pour la réalisée seule, 22 pour la moyenne
    # relevée, **13 pour la plus forte**.
    #
    # Elle a un coût, et il faut le connaître : un portefeuille qui réduit réellement sa
    # volatilité — couverture de change, facteur peu volatil, corrélations favorables —
    # n'en reçoit pas le crédit, puisque la structure plafonne par le bas. C'est le sens
    # de l'erreur que je choisis : sous-estimer un risque est flatteur, le surestimer ne
    # l'est pas.
    vol = (max(realisee, structurelle) if (realisee is not None and structurelle is not None)
           else realisee)
    vol_cible = cible["volatilite"] if cible else None

    note = None
    if vol is not None and vol_cible is not None and reglages is not None:
        # La largeur de la bande de pénalité dépend du profil : un prudent qui double
        # sa cible doit s'effondrer, un dynamique a plus de marge.
        largeur = max(1.0, vol_cible * reglages.largeur_penalite_vol)
        note = note_decroissante(
            _ecart_asymetrique(vol, vol_cible, reglages.indulgence_sous_cible), 0.0, largeur)

    return Metrique(
        cle="volatilite",
        libelle="Volatilité annualisée",
        score=note,
        statut="disponible" if note is not None else "indisponible",
        poids=75.0,
        valeur=round(vol, 2) if vol is not None else None,
        lecture=(
            (f"{vol:.1f} % par an, pour {vol_cible:.0f} % visés"
             # Quand la structure prend le dessus, on le dit : le chiffre affiché n'est
             # pas celui qui a été vécu, et le lecteur doit savoir d'où il vient.
             + (f" — {realisee:.1f} % réalisés, {structurelle:.0f} % impliqués par "
                f"l'allocation"
                if (realisee is not None and structurelle is not None
                    and structurelle > realisee + 0.1) else ""))
            if vol is not None and vol_cible is not None
            else f"{vol:.1f} % par an — profil non déclaré" if vol is not None
            else "historique insuffisant"),
        couverture=1.0 if note is not None else 0.0,
        explication=(
            "L'amplitude annualisée de vos variations, comparée à la cible de votre "
            "profil. Rester en deçà coûte moins de points que la dépasser : un manque "
            "à gagner n'est pas un risque de vendre dans la baisse. Sans profil "
            "déclaré, elle est mesurée sans être notée — un niveau de risque ne se "
            "juge que face à une intention."
        ),
    )


def perte_maximale(
    poids: dict[str, float], rendements, cible: dict | None, reglages: Reglages | None,
) -> Metrique:
    """
    La pire baisse subie, du sommet au point bas.

    Le chiffre le plus lisible du moteur : « votre portefeuille a perdu 6,4 % entre
    son sommet et son point bas » se comprend sans formation financière, là où une
    volatilité annualisée demande une traduction. C'est la phrase qui prépare quelqu'un
    à traverser une baisse.

    ⚠️ Son poids est **volontairement réduit à un quart** du pilier. Elle corrèle à
    +0,88 avec la volatilité, et ne retient qu'un unique épisode — celui qui s'est
    trouvé dans la fenêtre d'observation. La volatilité, elle, agrège deux cent
    cinquante séances. Deux mesures de la même dispersion, dont une bien plus fragile.

    Seul le **dépassement** de la cible coûte des points : subir moins que le creux
    attendu n'est pas un écart au projet.
    """
    serie = _serie_portefeuille(poids, rendements)
    perte = None
    if serie is not None and len(serie) >= 60:
        from app.utils.finance import max_drawdown
        perte = float(max_drawdown(serie)) * 100

    perte_cible = cible["perte"] if cible else None
    note = None
    if perte is not None and perte_cible is not None and reglages is not None:
        largeur = max(1.0, perte_cible * reglages.largeur_penalite_vol * 0.7)
        note = note_decroissante(max(0.0, abs(perte) - perte_cible), 0.0, largeur)

    return Metrique(
        cle="perte_max",
        libelle="Perte maximale subie",
        score=note,
        statut="disponible" if note is not None else "indisponible",
        poids=25.0,
        valeur=round(perte, 2) if perte is not None else None,
        lecture=(f"{perte:.1f} %, pour {perte_cible:.0f} % attendus au pire"
                 if perte is not None and perte_cible is not None
                 else f"{perte:.1f} % au plus bas — profil non déclaré" if perte is not None
                 else "historique insuffisant"),
        couverture=1.0 if note is not None else 0.0,
        explication=(
            "La pire baisse subie, du sommet au point bas, comparée au creux attendu "
            "pour votre profil. Son poids est réduit : elle suit la volatilité de très "
            "près et ne retient qu'un seul épisode, celui qui s'est trouvé dans la "
            "fenêtre observée."
        ),
    )
