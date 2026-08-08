"""
Les métriques du pilier Diversification.

⚠️ Regroupées par pilier plutôt qu'un fichier par métrique. Elles partagent leurs
entrées — les mêmes ventilations, les mêmes poids — et une aide de lecture ; les
éclater en quatre modules aurait multiplié les imports croisés sans rien isoler. Le
principe du cahier des charges est respecté là où il compte : aucun calcul dans un
composant, aucun seuil hors de `config.py` et `profils.py`.
"""

from __future__ import annotations

import numpy as np

# ⚠️ Les seuils calibrés — cible sectorielle, écart maximal au marché — restent dans
# `analyse.py`, où ils sont documentés et tenus par des tests. Les recopier ici aurait
# donné deux calibrations du même arbitrage, et l'une aurait vieilli.
from app.services.analyse import (
    CIBLE_SECTEURS, ECART_MARCHE_MAX, LIBELLE_INCONNU, ecart_au_marche, herfindahl,
    regions_du_portefeuille,
)

from ..normalisation import note_decroissante, statut_pour
from ..profils import Reglages
from ..types import Metrique


def concentration(
    poids: dict[str, float],
    hhi_lignes: dict[str, float] | None,
    par_indice: set[str] | None,
    reglages: Reglages,
) -> Metrique:
    """
    Le risque qu'un **actif** disparaisse, en transparence des fonds.

    La formule exacte de la concentration en transparence : si la ligne i pèse Wᵢ et
    détient l'actif j à wᵢⱼ, la part de cet actif vaut Wᵢ·wᵢⱼ, donc

        HHI du portefeuille = Σᵢ Σⱼ (Wᵢ·wᵢⱼ)² = Σᵢ Wᵢ² · HHIᵢ

    où HHIᵢ est la concentration **interne** de la ligne — 1 pour un titre ou une
    crypto détenus en direct, l'indice de Herfindahl de la composition publiée pour un
    fonds. Actions et fonds passent ainsi par un seul calcul.

    ⚠️ Ce facteur a compté les **lignes du portefeuille** avant de compter les actifs,
    et c'était faux : il mesurait l'enveloppe, qui ne porte pas le risque. Un ETF MSCI
    World à cent pour cent obtenait 0 — mille cinq cents sociétés notées comme une
    action unique — et quatre exemplaires du même fonds obtenaient 100, pour la même
    exposition. Découper un investissement en quatre enveloppes faisait gagner
    vingt-cinq points de score global.

    ⚠️ Ce n'est pas la diversification sous un autre nom. Mesuré sur neuf
    portefeuilles types, les deux notes ne corrèlent qu'à 0,60 — le seuil auquel la
    perte maximale a été écartée était 0,88. Dix actions d'un même secteur donnent 47
    ici et 0 en diversification sectorielle : deux vérités différentes.

    Le nombre d'actifs visé dépend du profil : un prudent vise vingt-cinq, un
    dynamique quinze.
    """
    total = sum(w for w in poids.values() if w > 0)
    lu = sum(poids.get(t, 0.0) for t in (hhi_lignes or {}) if poids.get(t, 0.0) > 0)
    couverture = (lu / total) if total > 0 else 0.0

    actifs_eq: float | None = None
    if total > 0 and couverture >= 0.60:
        # Renormalisé sur la part **lue**, non sur le portefeuille entier : sinon une
        # ligne dont la composition manque abaisserait tous les carrés et gonflerait
        # le nombre d'actifs — ne pas savoir aurait amélioré la note.
        carres = sum((poids[t] / lu) ** 2 * h
                     for t, h in (hhi_lignes or {}).items() if poids.get(t, 0.0) > 0)
        actifs_eq = (1.0 / carres) if carres > 0 else None

    via_indice = bool(par_indice)
    if actifs_eq is None:
        lecture = ("composition des fonds non publiée" if not lu
                   else f"transparence sur {couverture * 100:.0f} % seulement")
    elif actifs_eq < 1.05:
        lecture = "un seul actif"
    else:
        chiffre = f"{actifs_eq:.1f}" if actifs_eq < 10 else f"{actifs_eq:.0f}"
        lecture = f"{chiffre} actifs équivalents"
        if via_indice:
            # Le chiffre vient d'un ETF physique suivant le même indice, parce que le
            # fonds détenu est synthétique et n'a aucune composition à publier. La
            # grandeur est la bonne ; laisser croire qu'on a lu le fonds serait faux.
            lecture += " — composition de l'indice"

    return Metrique(
        cle="concentration",
        libelle="Concentration des actifs",
        score=(note_decroissante(actifs_eq, reglages.actifs_cibles, 1.0)
               if actifs_eq is not None else None),
        statut=statut_pour(couverture, actifs_eq is not None),
        poids=35.0,
        valeur=round(actifs_eq, 2) if actifs_eq is not None else None,
        lecture=lecture,
        couverture=couverture,
        explication=(
            f"Le nombre d'actifs équipondérés auquel équivaut votre portefeuille, en "
            f"transparence des fonds. {reglages.actifs_cibles:.0f} vaut cent pour un "
            f"profil {reglages.libelle.lower()}, un seul vaut zéro. Un fonds compte "
            f"pour ce qu'il contient, pas pour une ligne."
        ),
    )


def secteurs(ventilation: list[dict] | None) -> Metrique:
    """
    La répartition sectorielle, en transparence des fonds.

    Compter les lignes calomnie un portefeuille de fonds : trois ETF, c'est trois
    lignes mais des centaines de sociétés sur onze secteurs. On mesure donc le nombre
    de secteurs équivalents réellement détenus.

    ⚠️ Deux pièges déjà tombés, tous deux dans la **donnée** passée au calcul et non
    dans la formule — l'endroit le plus dangereux, puisque le chiffre est faux alors
    que le calcul est juste.

    La ventilation d'affichage plafonne à six secteurs plus un « Autres » qui compte
    pour **un** : sur onze secteurs équipondérés, « Autres » en regroupait cinq et
    devenait le plus gros poste, le compte tombait de 11,00 à 3,90, et la note de 100
    à 41. La meilleure diversification possible ne pouvait pas dépasser 41.

    Et la ventilation se normalisait à cent sur les seules lignes transparentes : elle
    sommait donc toujours à cent, et une diversification calculée sur 30 % du
    portefeuille s'affichait comme celle du portefeuille entier.
    """
    connus = [x for x in (ventilation or []) if x.get("libelle") != LIBELLE_INCONNU]
    total = sum(x["part"] for x in (ventilation or []))
    part_connue = sum(x["part"] for x in connus)
    couverture = (part_connue / total) if total > 0 else 0.0

    eq: float | None = None
    if connus and couverture >= 0.60:
        eq = 1.0 / herfindahl([x["part"] for x in connus])

    return Metrique(
        cle="secteurs",
        libelle="Diversification sectorielle",
        score=note_decroissante(eq, CIBLE_SECTEURS, 1.0) if eq is not None else None,
        statut=statut_pour(couverture, eq is not None),
        poids=30.0,
        valeur=round(eq, 2) if eq is not None else None,
        lecture=(f"{eq:.1f} secteurs équivalents" if eq is not None
                 else "transparence sectorielle indisponible"),
        couverture=couverture,
        explication=(
            f"Mesurée sur les secteurs réellement détenus, fonds compris. "
            f"{CIBLE_SECTEURS:.0f} secteurs équivalents valent cent, un seul vaut "
            f"zéro. Le marché mondial lui-même en pèse environ sept : la technologie "
            f"y occupe un quart, et ce n'est pas un défaut de votre construction."
        ),
    )


def geographie(ventilation: list[dict] | None) -> Metrique:
    """
    L'écart à la répartition du marché mondial, en points de portefeuille.

    ⚠️ Cette métrique a compté des **étiquettes** de zone avant de mesurer un écart,
    et c'était le pire défaut du score. La zone d'un fonds se déduisant de l'indice
    cité dans son nom, un ETF MSCI World recevait « Monde développé » — une étiquette,
    donc une zone, donc zéro sur cent — pour vingt-trois pays et quelque mille cinq
    cents sociétés. Le score récompensait le portefeuille le moins diversifié.

    La bonne question n'est pas « combien de zones ? » mais « à quelle distance du
    marché mondial ? ». Le portefeuille de marché est le plus diversifié qui existe
    par **arithmétique** et non par préférence : s'en écarter concentre, quel que soit
    le profil. C'est ce qui distingue cette métrique d'un niveau de risque — la
    volatilité demande une intention déclarée, un écart au marché non.

    La lecture est directe : « il faudrait déplacer tant pour cent du portefeuille
    pour rejoindre le marché ».
    """
    regions, part_situee = regions_du_portefeuille(ventilation)
    total = sum(x["part"] for x in (ventilation or []))
    couverture = (part_situee / total) if total > 0 else 0.0

    ecart = ecart_au_marche(regions) if regions and couverture >= 0.60 else None

    return Metrique(
        cle="geographie",
        libelle="Répartition géographique",
        score=note_decroissante(ecart, 0.0, ECART_MARCHE_MAX) if ecart is not None else None,
        statut=statut_pour(couverture, ecart is not None),
        poids=20.0,
        valeur=round(ecart, 1) if ecart is not None else None,
        lecture=("conforme au marché mondial" if ecart is not None and ecart < 5
                 else f"{ecart:.0f} points d'écart au marché mondial" if ecart is not None
                 else "zones indéterminées"),
        couverture=couverture,
        explication=(
            "Votre distance à la répartition du marché mondial coté, en points de "
            "portefeuille : combien il faudrait déplacer pour la rejoindre. Un ETF "
            "monde en est proche, un portefeuille d'un seul pays très loin."
        ),
    )


def redondance(rendements) -> Metrique:
    """
    Deux lignes qui n'en font qu'une.

    La corrélation **maximale** entre deux lignes, et non la moyenne. Deux trackers
    sur le même indice se détectent ainsi, alors qu'une moyenne les noyait. En dessous
    de 0,80 il n'y a pas de doublon ; à 0,97 les deux lignes sont interchangeables.

    ⚠️ La corrélation *moyenne* a été écartée du score pour une raison mesurée : 0,85
    entre lignes d'actions est une propriété de la classe d'actifs, pas un défaut de
    construction, et la noter coûtait dix-sept points à un portefeuille bien bâti. Le
    maximum, lui, désigne deux lignes précises et se corrige — on vend l'une des deux.

    ⚠️ Angle mort connu : deux trackers du même indice cotés sur des **places
    différentes** ne sont pas détectés. ESE.PA et VOO suivent tous deux le S&P 500 et
    leur corrélation quotidienne mesurée ne vaut que 0,607 — les clôtures sont
    décalées de quatre heures et demie et l'euro-dollar s'interpose. Aucun seuil ne
    rattrape cela sans devenir aveugle aux vrais doublons.
    """
    valeur: float | None = None
    if rendements is not None and rendements.shape[1] >= 2 and len(rendements) >= 20:
        m = rendements.corr().to_numpy()
        haut = m[np.triu_indices_from(m, k=1)]
        haut = haut[~np.isnan(haut)]
        if haut.size:
            valeur = float(np.max(haut))

    # Une seule ligne ne peut pas être redondante : la question ne se pose pas, elle
    # n'est pas sans réponse. Couverture nulle, donc hors moyenne et hors confiance.
    une_seule = rendements is not None and rendements.shape[1] < 2

    return Metrique(
        cle="redondance",
        libelle="Redondance entre lignes",
        score=note_decroissante(valeur, 0.80, 0.97) if valeur is not None else None,
        statut="disponible" if valeur is not None else "indisponible",
        poids=0.0 if une_seule else 15.0,
        valeur=round(valeur, 3) if valeur is not None else None,
        lecture=(f"{valeur:.2f} au plus entre deux lignes" if valeur is not None
                 else "une seule ligne : sans objet" if une_seule
                 else "historique insuffisant"),
        couverture=1.0 if valeur is not None else 0.0,
        explication=(
            "La corrélation la plus forte entre deux de vos lignes. Au-delà de 0,95 "
            "elles font le même pari et l'une des deux n'apporte rien. C'est le "
            "maximum et non la moyenne : une moyenne élevée décrit la classe "
            "d'actifs, un maximum élevé désigne deux lignes à arbitrer."
        ),
    )
