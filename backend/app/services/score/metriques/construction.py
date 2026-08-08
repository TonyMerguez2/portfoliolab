"""
Les métriques du pilier Construction : ce que l'épargnant décide vraiment.

Contrairement au risque de marché, tout ce qui est mesuré ici est entièrement sous
son contrôle — la taille de ses lignes, leur équilibre, et le coût structurel de ses
fonds.
"""

from __future__ import annotations

from app.services.analyse import herfindahl

from ..normalisation import note_decroissante
from ..profils import Reglages
from ..types import Metrique

# Repères du marché pour les frais courants d'un fonds, en pourcentage par an.
# 0,10 % est le niveau d'un tracker large, 1 % celui d'un fonds actif. Au-delà, zéro.
TER_BON, TER_MAUVAIS = 0.10, 1.00

# Repères d'un courtier au détail, en pourcentage des montants achetés.
COURTAGE_BON, COURTAGE_MAUVAIS = 0.10, 1.00


# Facteur appliqué au plafond de position pour une ligne qui est un **fonds**.
#
# ⚠️ Un plafond unique était faux. Soixante-dix pour cent sur un tracker S&P 500 et
# soixante-dix pour cent sur une action unique ne portent pas le même risque : le
# premier détient six cents sociétés en garde séparée, le second une entreprise. Le
# plafond du profil valait 0 sur 100 au premier, ce qui tirait tout le pilier
# Construction à 54 pour un portefeuille parfaitement bâti.
#
# Deux et demi : à 25 % de plafond, un fonds est toléré jusqu'à 62 %. Ce qui reste
# mesuré est le risque **produit** — fermeture, défaut de l'émetteur, erreur de
# réplication — qui existe mais ne se compare pas à celui d'un titre isolé.
TOLERANCE_FONDS = 2.5


def position_maximale(poids: dict[str, float], reglages: Reglages,
                      nature: dict[str, str] | None = None) -> Metrique:
    """
    Le poids de la plus grosse ligne, face au plafond du profil.

    ⚠️ C'est ici que le profil mord le plus visiblement. Le même portefeuille à 35 %
    sur une ligne est un défaut de construction pour un prudent — dont le plafond est
    quinze — et une position assumée pour un dynamique, dont le plafond est quarante.
    La note tombe à zéro au double du plafond : il faut vraiment y aller.

    Cette métrique est **volontairement redondante en apparence** avec la concentration
    du pilier Diversification, et ne l'est pas en réalité. La concentration mesure les
    actifs en transparence — un ETF monde à cent pour cent n'y est pas concentré. Ici
    on mesure la **ligne**, parce qu'une ligne unique est un risque de construction :
    une erreur de saisie, un produit fermé, un émetteur en défaut.
    """
    total = sum(w for w in poids.values() if w > 0)
    if total <= 0:
        return Metrique(
            cle="position_max", libelle="Taille de la plus grosse ligne",
            score=None, statut="indisponible", poids=30.0,
            lecture="aucune position", couverture=0.0,
            explication="Le poids de votre plus grosse ligne, face au plafond de votre profil.",
        )

    part = max(poids.values()) / total * 100.0
    ligne = max(poids, key=lambda t: poids[t])
    # Le plafond dépend de la nature de la ligne : un fonds est un ensemble déjà
    # réparti, un titre isolé ne l'est pas.
    est_fonds = (nature or {}).get(ligne) == "fonds"
    plafond = reglages.position_max * (TOLERANCE_FONDS if est_fonds else 1.0)
    # Cent tant qu'on est sous le plafond, puis chute jusqu'au double du plafond.
    depassement = max(0.0, part - plafond)
    note = note_decroissante(depassement, 0.0, plafond)

    return Metrique(
        cle="position_max",
        libelle="Taille de la plus grosse ligne",
        score=note,
        statut="disponible",
        poids=30.0,
        valeur=round(part, 1),
        lecture=(f"{ligne} pèse {part:.0f} %, plafond {plafond:.0f} %"
                 + (" (fonds)" if est_fonds else "")),
        couverture=1.0,
        explication=(
            f"Le poids de votre plus grosse ligne. Un profil "
            f"{reglages.libelle.lower()} tolère {reglages.position_max:.0f} % ; "
            f"au-delà la note baisse, et s'annule au double. Distinct de la "
            f"concentration : ici c'est le risque de la **ligne** — produit fermé, "
            f"émetteur en défaut — non celui des actifs qu'elle contient."
        ),
    )


def equilibre(poids: dict[str, float]) -> Metrique:
    """
    L'équilibre des pondérations, indépendamment du nombre de lignes.

    L'inverse de l'indice de Herfindahl rapporté au nombre de lignes détenues : à
    poids égaux il vaut un, et il tombe quand une ligne écrase les autres. Un
    portefeuille de trois lignes équipondérées est parfaitement équilibré, même s'il
    n'est pas diversifié.

    ⚠️ C'est le **seul** endroit du moteur où une mesure est rapportée au portefeuille
    lui-même et non à une échelle absolue. Ailleurs c'était un défaut — un portefeuille
    d'une seule ligne atteignait son propre idéal et décrochait la moyenne. Ici c'est
    l'intention : la question est « ces lignes sont-elles réparties », pas « y en a-t-il
    assez », qui est déjà posée deux fois ailleurs.
    """
    actifs = [w for w in poids.values() if w > 0]
    if len(actifs) < 2:
        # Une ligne unique ne peut pas être déséquilibrée : la question ne se pose pas.
        return Metrique(
            cle="equilibre", libelle="Équilibre des pondérations",
            score=None, statut="indisponible", poids=0.0,
            lecture="une seule ligne : sans objet", couverture=0.0,
            explication="L'équilibre de vos pondérations, indépendamment du nombre de lignes.",
        )

    lignes_eq = 1.0 / herfindahl(actifs)
    part = lignes_eq / len(actifs)
    # Un portefeuille équipondéré vaut cent ; à la moitié du parfait, zéro. Le seuil
    # bas est large : 0,5 correspond déjà à un déséquilibre marqué.
    note = note_decroissante(part, 1.0, 0.5)

    return Metrique(
        cle="equilibre",
        libelle="Équilibre des pondérations",
        score=note,
        statut="disponible",
        poids=20.0,
        valeur=round(part, 3),
        lecture=f"{lignes_eq:.1f} lignes effectives sur {len(actifs)} détenues",
        couverture=1.0,
        explication=(
            "À poids égaux, vos lignes effectives égalent vos lignes détenues. "
            "L'écart mesure à quel point une ligne écrase les autres — un jugement sur "
            "la répartition, non sur le nombre, qui est mesuré ailleurs."
        ),
    )


def frais_fonds(frais_par_ligne: dict[str, float] | None,
                poids: dict[str, float], part_fonds: float | None) -> Metrique:
    """
    Les frais courants des fonds, pondérés par les poids.

    ⚠️ Le facteur le plus prédictif du résultat relatif d'un portefeuille de fonds sur
    vingt ans, et le seul qui soit **certain** : les rendements sont espérés, les frais
    sont prélevés. C'est pourquoi il pèse la moitié de ce pilier.

    ⚠️ Trois absences de natures différentes, à ne pas confondre.

    Sans aucun fonds détenu, la question ne se pose pas : un titre ou une crypto en
    direct ne supportent aucun frais courant. La métrique est alors hors de la moyenne
    et hors de la confiance — la compter manquante suggérerait une saisie impossible.

    Avec des fonds mais moins de soixante pour cent de TER connus, on ne note pas : si
    la ligne la plus chère est celle dont le chiffre manque, la note serait flatteuse.

    Et un TER nul est **refusé**. La source annonce `0.0` pour certains fonds — relevé
    sur deux ETF dont les frais réels valent 0,14 % et 0,19 %. Sans ce refus, les frais
    s'affichaient à 0,00 % avec une note de cent : la note la plus flatteuse possible,
    sur un chiffre inventé.
    """
    sans_fonds = part_fonds is not None and part_fonds <= 0
    total = sum(w for w in poids.values() if w > 0)

    cumul = couvert = 0.0
    for ticker, w in poids.items():
        ter = (frais_par_ligne or {}).get(ticker)
        if ter is None or ter <= 0:
            continue
        cumul += w * ter
        couvert += w

    # La couverture se mesure sur la part **en fonds**, non sur le portefeuille : un
    # portefeuille moitié actions moitié fonds dont tous les TER sont connus est
    # couvert à cent pour cent, pas à cinquante.
    base = part_fonds if part_fonds else total
    couverture = (couvert / base) if base > 0 else 0.0

    valeur = (cumul / couvert) if (couvert > 0 and couverture >= 0.60 and not sans_fonds) else None

    return Metrique(
        cle="frais_fonds",
        libelle="Frais courants des fonds",
        score=note_decroissante(valeur, TER_BON, TER_MAUVAIS) if valeur is not None else None,
        statut=("indisponible" if valeur is None
                else "disponible" if couverture >= 0.999 else "partiel"),
        # Poids nul sans fonds : la métrique sort du pilier au lieu de le pénaliser.
        poids=0.0 if sans_fonds else 50.0,
        valeur=round(valeur, 3) if valeur is not None else None,
        lecture=("sans objet — aucun fonds détenu" if sans_fonds
                 else f"{valeur:.2f} % par an" if valeur is not None
                 else "frais des fonds inconnus"),
        couverture=couverture if not sans_fonds else 0.0,
        explication=(
            f"Les frais courants de vos fonds, prélevés chaque année sur l'encours. "
            f"{TER_BON:.2f} % vaut cent, {TER_MAUVAIS:.2f} % vaut zéro. Souvent "
            f"indisponibles pour les ETF européens : le chiffre figure sur le document "
            f"d'information clé de chaque fonds et peut être saisi à la main."
        ),
    )


def frais_courtage(courtage: float | None) -> Metrique:
    """
    Les commissions réellement payées, en pourcentage des montants achetés.

    ⚠️ Poids **délibérément faible**, et le cahier des charges a raison de l'exiger.
    Ces frais dépendent surtout du courtier et du rythme de passage d'ordres, pas de la
    qualité de construction du portefeuille : quelqu'un qui a acheté une fois paiera
    peu, quelqu'un qui arbitre chaque mois paiera plus, à portefeuille identique.

    Ils pesaient un septième de la note dans la version précédente, ce qui était trop.
    Ils restent mesurés parce qu'ils sont réels, et parce qu'ils viennent des écritures
    saisies — donc de la seule donnée de coût dont on soit certain.
    """
    return Metrique(
        cle="frais_courtage",
        libelle="Frais de courtage payés",
        score=(note_decroissante(courtage, COURTAGE_BON, COURTAGE_MAUVAIS)
               if courtage is not None else None),
        statut="disponible" if courtage is not None else "indisponible",
        poids=20.0,
        valeur=round(courtage, 3) if courtage is not None else None,
        lecture=(f"{courtage:.2f} % des montants achetés" if courtage is not None
                 else "aucun ordre saisi"),
        couverture=1.0 if courtage is not None else 0.0,
        explication=(
            "Les commissions que vous avez saisies, rapportées aux montants achetés. "
            "Un coût ponctuel par ordre, distinct du prélèvement annuel des fonds. "
            "Son poids est faible à dessein : il dépend surtout de votre courtier et de "
            "votre rythme d'ordres, non de la construction du portefeuille."
        ),
    )
