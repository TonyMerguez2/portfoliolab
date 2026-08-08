"""
Analyse d'un portefeuille : facteurs de risque, exposition, observations.

Tous les indicateurs sont ramenés sur une échelle de 0 à 100 où *cent vaut
mieux que zéro*, y compris ceux dont la grandeur sous-jacente est un défaut :
une volatilité de 30 % donne un score bas. Sans cette convention, une jauge à
80 signifierait tantôt une qualité, tantôt un danger, et le lecteur devrait se
souvenir de laquelle.

La valeur brute est conservée à côté de chaque score. C'est elle qui est
vraie ; le score n'est qu'une mise en forme, et l'afficher seul reviendrait à
demander de croire un chiffre sans le montrer.

⚠️ **Ce qui note, et ce qui a été retiré.**

Six facteurs notent : `concentration`, `diversification`, `redondance`, `frais`,
`frais_courtage`, `volatilite`. Un seul reste affiché sans noter, `perte_max`,
parce qu'il dit le risque mieux qu'aucun autre à qui regarde son épargne.

Sept facteurs ont été retirés après avoir été mesurés sur des portefeuilles
types aux propriétés connues. Le détail vit à côté de chacun, mais le principe
est unique : **un facteur qui se trompe ou qui ne varie pas ne doit pas entrer
dans une moyenne.** Trois se trompaient — la devise lisait la place de cotation
et non l'exposition, le bêta était biaisé vers zéro par le décalage horaire, la
géographie comptait des étiquettes. Deux ne variaient pas — la liquidité valait
cent partout, le Sharpe était du bruit. Deux comptaient double — la corrélation
moyenne doublait la redondance, la perte maximale doublait la volatilité à 0,88
de corrélation.

Le nombre de facteurs a donc baissé, et c'est le but : la note portait huit
entrées dont trois fausses, elle en porte six dont aucune.
"""

from __future__ import annotations

import math
from typing import Iterable

import numpy as np
import pandas as pd


# ── Conversions en score ──────────────────────────────────────────────────────

def _score_decroissant(valeur: float, bon: float, mauvais: float) -> float:
    """
    Cent quand `valeur` vaut `bon`, zéro quand elle vaut `mauvais`.

    Interpolation linéaire bornée, `bon` pouvant être inférieur ou supérieur à
    `mauvais` selon le sens de la grandeur.
    """
    if mauvais == bon:
        return 50.0
    t = (valeur - bon) / (mauvais - bon)
    return float(max(0.0, min(100.0, 100.0 * (1.0 - t))))


# Sociétés équivalentes visées par le facteur de concentration.
#
# ⚠️ Vingt, et non quatre. La cible portait sur le nombre de **lignes** du
# portefeuille, fonds compris ; elle porte désormais sur le nombre de **sociétés
# détenues en direct**. Le seuil change donc de nature.
#
# Quatre était un compromis pour ne pas punir un portefeuille de trois ETF — une
# objection qui disparaît maintenant que les fonds sortent du calcul. Le seuil
# pertinent pour éteindre le risque propre à une société se situe autour de vingt
# titres : c'est l'ordre de grandeur constant de la littérature sur la
# diversification naïve, et il se vérifie à la main — vingt lignes équipondérées
# plafonnent la perte liée à une faillite unique à cinq pour cent du portefeuille.
CIBLE_SOCIETES = 20.0

# Secteurs équivalents visés par la diversification.
#
# Huit sur les onze que compte la classification : atteindre onze demanderait une
# équipondération sectorielle parfaite, que personne ne détient et qu'aucun indice
# large ne produit. Repère mesuré : un ETF MSCI World pèse 5,5 secteurs
# équivalents, un PEA à trois zones 5,2 — la cible doit donc rester au-dessus
# sans être hors d'atteinte.
CIBLE_SECTEURS = 8.0

# Part du portefeuille dont les frais doivent être connus pour que la moyenne
# vaille la peine d'être annoncée. Voir `_frais_ponderes`.
COUVERTURE_FRAIS_MIN = 60.0

# Part du portefeuille dont le secteur ou la zone doit être connu pour que la
# diversification vaille la peine d'être notée.
COUVERTURE_TRANSPARENCE_MIN = 60.0

# Étiquette des parts dont la catégorie n'a pas pu être établie. Elle est écartée
# des comptages : une inconnue n'est pas une catégorie.
LIBELLE_INCONNU = "Non déterminé"


def herfindahl(poids: Iterable[float]) -> float:
    """
    Indice de concentration, entre 1/n (parfaitement réparti) et 1 (tout sur une
    ligne). Les poids sont normalisés : ils arrivent en pourcentage.
    """
    p = np.asarray([w for w in poids if w > 0], dtype=float)
    if p.size == 0:
        return 1.0
    p = p / p.sum()
    return float(np.sum(p ** 2))


TOLERANCES = ("prudent", "equilibre", "dynamique")

# Volatilité annualisée de référence, en pourcentage, par grande classe.
# Ordres de grandeur de long terme : actions mondiales autour de seize, emprunts
# d'État de duration moyenne autour de cinq.
VOL_ACTIONS, VOL_OBLIGATIONS = 16.0, 5.0

# Part d'actions que chaque tolérance déclare pouvoir supporter.
PLAFOND_ACTIONS = {"prudent": 35.0, "equilibre": 65.0, "dynamique": 100.0}

# Rapport entre volatilité annuelle et pire creux attendu.
#
# ⚠️ Un ordre de grandeur calibré sur les crises réelles, pas un théorème : un
# portefeuille d'actions à seize pour cent de volatilité a perdu 34 % en 2020 et
# 55 % en 2008. Deux et demi place la cible à quarante pour cent, ce qui couvre le
# cas courant sans prétendre borner le pire.
RAPPORT_PERTE = 2.5


def profil_cible(horizon_annees: int | None, tolerance: str | None) -> dict | None:
    """
    La part d'actions visée, et la volatilité et la perte qui en découlent.

    ⚠️ C'est ce qui rend le risque **notable**. Sans cible, la volatilité n'est
    qu'un niveau : la juger dans l'absolu revenait à décréter qu'un portefeuille
    prudent vaut mieux qu'un portefeuille de long terme, un arbitrage qui
    appartient à l'épargnant. Avec une cible, la question devient vérifiable — le
    portefeuille correspond-il à ce qui a été déclaré ?

    Un seul facteur en dépend désormais, la volatilité. Le bêta et la perte
    maximale en dépendaient aussi ; le premier a été supprimé pour biais de
    mesure, la seconde ne note plus car elle doublait la volatilité. La cible de
    perte reste calculée : elle sert à **situer** la perte maximale affichée, pas
    à la noter.

    Deux entrées, parce qu'elles disent deux choses différentes. L'horizon dit ce
    qu'on peut se **permettre** : un creux de trois ans ne compte pas quand on
    investit sur vingt. La tolérance dit ce qu'on peut **supporter**, ce qui n'est
    pas la même chose et se mesure au fait de vendre ou non dans la baisse. Le
    plus contraignant des deux gagne — se savoir capable d'attendre ne sert à rien
    si l'on vend au premier creux.

    Rend `None` si le profil n'est pas renseigné : on ne devine pas l'intention de
    quelqu'un, et les trois facteurs redeviennent alors indicatifs.
    """
    if horizon_annees is None or tolerance not in PLAFOND_ACTIONS:
        return None
    try:
        horizon = float(horizon_annees)
    except (TypeError, ValueError):
        return None
    if horizon <= 0:
        return None
    # Vingt pour cent d'actions dès la première année, puis cinq points par année
    # d'horizon : la part plafonne à cent au bout de seize ans.
    part = min(PLAFOND_ACTIONS[tolerance], 20.0 + 5.0 * horizon)
    part = max(0.0, min(100.0, part))
    vol = part / 100 * VOL_ACTIONS + (1 - part / 100) * VOL_OBLIGATIONS
    return {
        "part_actions": round(part, 1),
        "volatilite": round(vol, 2),
        "perte": round(vol * RAPPORT_PERTE, 2),
        "horizon_annees": int(horizon),
        "tolerance": tolerance,
    }


def _ecart_asymetrique(mesure: float, cible: float, indulgence: float = 0.5) -> float:
    """
    L'écart à une cible, compté plus doucement en dessous qu'au-dessus.

    Dépasser sa cible de risque expose à vendre dans la baisse ; rester en dessous
    ne coûte qu'un manque à gagner. Les deux sont des écarts au projet déclaré,
    mais pas de même gravité, et une pénalité symétrique les confondrait.
    """
    ecart = mesure - cible
    return ecart if ecart > 0 else -ecart * indulgence


def _frais_ponderes(
    frais_par_ligne: dict[str, float] | None,
    poids: dict[str, float],
) -> float | None:
    """
    La moyenne des frais, pondérée par les poids, en pourcentage par an.

    ⚠️ Rendue seulement si les lignes dont on connaît les frais pèsent au moins
    `COUVERTURE_FRAIS_MIN` du portefeuille. Moyenner sur un tiers des lignes
    donnerait un chiffre qui a l'air d'un chiffre : si la ligne la plus chère est
    précisément celle dont le TER manque, la note serait flatteuse et fausse.
    Mieux vaut ne rien annoncer.
    """
    if not frais_par_ligne:
        return None
    cumul = couvert = 0.0
    for ticker, w in poids.items():
        ter = frais_par_ligne.get(ticker)
        if ter is None:
            continue
        cumul += w * ter
        couvert += w
    if couvert < COUVERTURE_FRAIS_MIN:
        return None
    return cumul / couvert


def facteurs_de_risque(
    poids: dict[str, float],
    rendements: pd.DataFrame | None,
    secteurs: list[dict] | None = None,
    zones: list[dict] | None = None,
    types_lignes: dict[str, str] | None = None,
    frais_par_ligne: dict[str, float] | None = None,
    cible: dict | None = None,
    courtage: float | None = None,
) -> dict[str, dict]:
    """
    Les facteurs affichés, chacun avec sa valeur brute et son score.

    `rendements` porte une colonne par ligne détenue. Les facteurs qui en
    dépendent valent `None` quand l'historique manque — un portefeuille créé
    hier n'a pas de volatilité, et en inventer une serait pire que de l'omettre.

    `types_lignes` associe à chaque ticker `"action"` ou `"fonds"`, pour les lignes
    dont on a pu l'établir. Il sert à la concentration, qui ne compte que les
    sociétés détenues en direct : une ligne dont on ignore la nature en est écartée
    plutôt que supposée, et sous soixante pour cent du portefeuille identifié le
    facteur ne note pas.
    """
    out: dict[str, dict] = {}

    # ── Concentration : le risque propre à une société ───────────────────────
    #
    # ⚠️ Ce facteur comptait les **lignes du portefeuille**, fonds compris. Il
    # comptait donc des enveloppes, et l'enveloppe ne porte pas le risque : le
    # contenu le porte. Trois mesures l'ont disqualifié sous cette forme.
    #
    # Un ETF MSCI World à cent pour cent obtenait **0** — l'allocation la plus
    # recommandée qui existe, mille cinq cents sociétés, notée comme un portefeuille
    # d'une seule action. Quatre ETF World identiques à vingt-cinq pour cent
    # obtenaient **100**, pour exactement la même exposition économique : découper
    # un investissement en quatre enveloppes faisait gagner vingt-cinq points de
    # score global, alors que cela ne coûte que des frais d'ordre. Et sur ce même
    # cas la redondance donnait **0** quand la concentration donnait 100 : deux
    # facteurs de la même note affirmaient l'inverse du même fait.
    #
    # Ce qui reste vrai, et qu'aucun autre facteur ne voit : le risque qu'une
    # **société** disparaisse. Une entreprise peut valoir zéro, une industrie
    # presque jamais. Et ce risque est invisible en transparence sectorielle —
    # cent pour cent d'Apple et cent pour cent d'un fonds sectoriel technologique
    # affichent tous deux « Technologie 100 % », l'un détenant une entreprise et
    # l'autre soixante-cinq.
    #
    # On mesure donc la somme des carrés des poids des seules **actions détenues en
    # direct**, en part du portefeuille entier. Un fonds compte pour ce qu'il est :
    # un ensemble déjà réparti, dont aucune société ne pèse assez pour compter. Ce
    # n'est pas la diversification sous un autre nom — mesuré sur neuf portefeuilles
    # types, les deux notes ne corrèlent qu'à 0,60, là où la perte maximale a été
    # retirée du score à 0,88. Dix actions d'un même secteur donnent 47 ici et 0 en
    # diversification : deux vérités différentes sur le même portefeuille.
    total_poids = sum(w for w in poids.values() if w > 0)
    part_typee = sum(poids.get(t, 0.0) for t in (types_lignes or {}))
    societes_eq: float | None = None
    if total_poids > 0 and part_typee >= COUVERTURE_TRANSPARENCE_MIN:
        carres = sum(
            (poids[t] / total_poids) ** 2
            for t, genre in (types_lignes or {}).items()
            if genre == "action" and poids.get(t, 0.0) > 0
        )
        # ⚠️ Aucune action en direct : le facteur ne note **pas**, il ne donne pas
        # cent.
        #
        # « Aucune société dont la faillite emporterait une part du portefeuille »
        # est vrai, et j'ai d'abord rendu la note pleine pour cette raison. Mais la
        # majorité des épargnants ne détiennent que des fonds : le facteur aurait
        # alors valu cent pour la plupart des portefeuilles, ajoutant une constante
        # à la moyenne sans rien en dire — c'est précisément le motif pour lequel la
        # liquidité a été retirée du score. Sur un vrai PEA, cela gonflait la note de
        # 83 à 86 sans qu'aucune information la soutienne.
        #
        # La question « quel risque si une de vos sociétés disparaît » ne se pose pas
        # à qui n'en détient aucune. Ne pas s'appliquer n'est pas réussir, et la
        # couverture affichée — « 5 sur 7 mesurés » — le dit au lecteur.
        societes_eq = (1.0 / carres) if carres > 0 else float("inf")
    out["concentration"] = {
        "valeur": (None if societes_eq is None
                   else None if societes_eq == float("inf")
                   else round(societes_eq, 2)),
        "libelle": (
            "Composition indéterminée" if societes_eq is None
            else "aucune action détenue en direct" if societes_eq == float("inf")
            else f"{societes_eq:.1f} société{'s' if societes_eq >= 2 else ''} équivalente"
                 f"{'s' if societes_eq >= 2 else ''}"
        ),
        "score": (
            None if societes_eq is None or societes_eq == float("inf")
            else round(_score_decroissant(societes_eq, CIBLE_SOCIETES, 1.0), 0)
        ),
    }

    # ── Redondance : deux lignes qui n'en font qu'une ─────────────────────────
    #
    # ⚠️ La corrélation **moyenne** vivait ici comme facteur séparé, mesurée et
    # affichée sans noter. Elle a été retirée : elle sortait de la même matrice
    # que la redondance ci-dessous, donc elle occupait une deuxième ligne à
    # l'écran pour un seul calcul, et sa lecture n'était pas actionnable — 0,85
    # entre lignes d'actions est une propriété de la classe d'actifs, pas un
    # défaut. La corrélation *maximale*, elle, se corrige : on vend l'un des deux
    # doublons.
    #
    # La corrélation **maximale** entre deux lignes, et non la moyenne. Deux
    # trackers sur le même indice se détectent ainsi, alors qu'une moyenne les
    # noyait dans l'ensemble. En dessous de 0,80 il n'y a pas de doublon ; à 0,97
    # les deux lignes sont interchangeables et l'une des deux ne sert à rien.
    #
    # ⚠️ Angle mort connu et mesuré : deux trackers du même indice cotés sur des
    # **places différentes** ne sont pas détectés. ESE.PA (Paris) et VOO (New
    # York) suivent tous deux le S&P 500, et leur corrélation quotidienne mesurée
    # sur un an ne vaut que 0,607 — 0,792 en pas hebdomadaire — parce que les
    # clôtures sont décalées de quatre heures et demie et que l'euro-dollar
    # s'interpose. Aucun seuil ne rattrape cela sans devenir aveugle aux vrais
    # doublons. Le cas reste rare — un PEA ne contient que des lignes
    # européennes — mais il est réel dans un compte-titres, et il vaut mieux le
    # savoir écrit ici que le croire couvert.
    #
    # C'est aussi pourquoi ce facteur garde sa note à cent la plupart du temps :
    # cent est le **constat juste** qu'aucun doublon n'existe, pas l'artefact
    # d'une échelle mal choisie. C'est ce qui le distingue de la liquidité, qui a
    # été retirée pour la raison inverse.
    redondance = None
    if rendements is not None and rendements.shape[1] >= 2 and len(rendements) >= 20:
        m = rendements.corr().to_numpy()
        haut = m[np.triu_indices_from(m, k=1)]
        haut = haut[~np.isnan(haut)]
        if haut.size:
            redondance = float(np.max(haut))
    out["redondance"] = {
        "valeur": round(redondance, 3) if redondance is not None else None,
        "libelle": (f"{redondance:.2f} au plus entre deux lignes" if redondance is not None
                    else "Historique insuffisant"),
        "score": round(_score_decroissant(redondance, 0.80, 0.97), 0) if redondance is not None else None,
    }

    # ── Diversification, en transparence sectorielle ─────────────────────────
    #
    # Compter les lignes calomnie un portefeuille de fonds : trois ETF, c'est
    # trois lignes mais des centaines de sociétés réparties sur onze secteurs. La
    # diversification se mesure donc sur ce qui est réellement détenu — la
    # ventilation sectorielle obtenue en transparence — et non sur le nombre
    # d'enveloppes qui les portent.
    #
    # La concentration des lignes reste mesurée à part : détenir 80 % d'un seul
    # produit est un risque en soi, quelle que soit sa composition interne.
    #
    # ⚠️ La composante **géographique a été retirée**, et c'est le correctif le
    # plus important de cet audit.
    #
    # Elle comptait des étiquettes de zone, pas une dispersion. Or la zone d'un
    # fonds se déduit de l'indice cité dans son nom : un ETF MSCI World reçoit
    # l'étiquette « Monde développé », **une** étiquette, donc une seule zone
    # équivalente, donc zéro sur cent. Mesuré : un unique ETF MSCI World — 23
    # pays, quelque 1 500 sociétés, l'allocation la plus recommandée qui existe —
    # obtenait 0 en géographie et 32 en diversification, quand un PEA à trois
    # lignes obtenait 28 et 44. Le score récompensait le portefeuille le moins
    # diversifié des deux.
    #
    # Ce n'est pas rattrapable ici : une vraie transparence géographique demande
    # les poids par pays de chaque fonds, et le fournisseur de cours ne les publie
    # pas — `funds_data` n'expose que `sector_weightings` et `asset_classes`,
    # vérifié. Les secteurs, eux, sont une transparence réelle. La ventilation par
    # zone reste affichée comme exposition, car « 70 % États-Unis » est une
    # information juste sur les mandats détenus ; elle ne note simplement plus.
    #
    # ⚠️ Les parts non identifiées sont **écartées**, pas comptées comme une
    # catégorie de plus.
    #
    # Observé sur un vrai portefeuille : la lecture des fonds a échoué le temps
    # d'un appel, tout s'est rangé sous « Non déterminé », et le facteur a compté
    # une seule catégorie — donc zéro sur cent, affiché comme « ce qui pèse le
    # plus ». Le score envoyait corriger une concentration qui n'existait pas : la
    # vérité était « on ne sait pas », et une inconnue n'est pas une mauvaise note.
    #
    # Ce qui reste est renormalisé sur la part connue, et n'est retenu que si cette
    # part couvre assez du portefeuille — même règle que pour les frais.
    #
    # ⚠️ Sans transparence exploitable, la diversification n'est **pas mesurée**.
    # Elle retombait sur la concentration des lignes, ce qui affichait « 29 » comme
    # s'il s'agissait d'une diversification alors qu'on n'en savait rien. Une note
    # inventée sur un ratage réseau est pire qu'une case vide, d'autant qu'elle
    # entre dans la moyenne.
    secteurs_connus = [x for x in (secteurs or []) if x.get("libelle") != LIBELLE_INCONNU]
    part_connue = sum(x["part"] for x in secteurs_connus)
    secteurs_eq = None
    if secteurs_connus and part_connue >= COUVERTURE_TRANSPARENCE_MIN:
        secteurs_eq = 1.0 / herfindahl([x["part"] for x in secteurs_connus])
    out["diversification"] = {
        "valeur": round(secteurs_eq, 2) if secteurs_eq is not None else None,
        "libelle": (f"{secteurs_eq:.1f} secteurs équivalents" if secteurs_eq is not None
                    else "Transparence indisponible"),
        "score": (round(_score_decroissant(secteurs_eq, CIBLE_SECTEURS, 1.0), 0)
                  if secteurs_eq is not None else None),
    }

    # ── Géographie : l'écart aux poids du marché mondial ─────────────────────
    #
    # Voir la longue note au-dessus de `POIDS_MARCHE_MONDIAL`. En bref : compter des
    # étiquettes de zone donnait zéro à un ETF MSCI World, le fonds le plus
    # diversifié qui existe. On mesure donc la **distance au portefeuille de
    # marché**, qui est par arithmétique le plus diversifié possible.
    #
    # Même garde-fou de couverture que les secteurs : sous soixante pour cent du
    # portefeuille situé, on ne note pas. Sans lui, un ratage de lecture sur la
    # ligne principale ferait juger la géographie sur ce qui reste.
    regions, part_situee = regions_du_portefeuille(zones)
    ecart = ecart_au_marche(regions) if regions else None
    if part_situee < COUVERTURE_TRANSPARENCE_MIN:
        ecart = None
    out["geographie"] = {
        "valeur": round(ecart, 1) if ecart is not None else None,
        "libelle": (
            "conforme au marché mondial" if ecart is not None and ecart < 5
            else f"{ecart:.0f} points d'écart au marché mondial" if ecart is not None
            else "Zones indéterminées"
        ),
        "score": (round(_score_decroissant(ecart, 0.0, ECART_MARCHE_MAX), 0)
                  if ecart is not None else None),
    }

    # ── Volatilité annualisée du portefeuille ────────────────────────────────
    vol = None
    if rendements is not None and len(rendements) >= 20:
        w = np.array([poids.get(c, 0.0) for c in rendements.columns], dtype=float)
        if w.sum() > 0:
            w = w / w.sum()
            serie = (rendements * w).sum(axis=1)
            vol = float(serie.std() * math.sqrt(252) * 100)
    # ⚠️ Notée **seulement** s'il existe un profil. Sans cible, l'échelle absolue
    # d'origine — huit pour cent calme, trente-cinq agité — faisait de l'idéal
    # implicite un fonds équilibré : un portefeuille cent pour cent actions
    # plafonnait à soixante-douze pour un choix parfaitement légitime. C'est un
    # niveau de risque, et un niveau ne se juge que par rapport à une intention.
    #
    # Avec un profil, la question devient vérifiable : le portefeuille tient-il ce
    # qui a été déclaré ? La cible vient de `profil_cible`, et l'écart est compté
    # plus doucement en dessous qu'au-dessus.
    vol_cible = cible["volatilite"] if cible else None
    out["volatilite"] = {
        "valeur": round(vol, 2) if vol is not None else None,
        "libelle": (
            f"{vol:.1f} % par an, pour {vol_cible:.0f} % visés"
            if vol is not None and vol_cible is not None
            else f"{vol:.1f} % par an" if vol is not None
            else "Historique insuffisant"
        ),
        # ⚠️ Aucune note sans cible, plutôt qu'une note qui ne compte pas.
        #
        # L'échelle absolue de repli — huit pour cent calme, trente-cinq agité —
        # affichait encore un chiffre, disons 89, à côté de la mention
        # « indicatif ». Or c'est précisément l'échelle dont la note du dessus
        # explique qu'elle est fausse : elle fait de l'idéal implicite un fonds
        # équilibré et plafonne un portefeuille cent pour cent actions. Montrer une
        # note qu'on sait mal calibrée en comptant sur une mention en petits
        # caractères pour la désamorcer, c'est publier le chiffre et se dédouaner
        # dans la note de bas de page ; le lecteur retient le chiffre.
        #
        # La valeur brute, elle, reste juste et reste affichée : « 11,0 % par an ».
        "score": (
            round(_score_decroissant(_ecart_asymetrique(vol, vol_cible), 0.0, vol_cible * 0.75), 0)
            if vol is not None and vol_cible is not None
            else None
        ),
        "compte": cible is not None,
    }

    # ── Sensibilité au marché : facteur RETIRÉ ───────────────────────────────
    #
    # ⚠️ Le bêta contre un indice de référence a été supprimé, pas rétrogradé : il
    # ne mesurait pas ce qu'il annonçait.
    #
    # Le bêta se calculait sur des rendements **quotidiens** contre SPY, coté à New
    # York. Or une ligne cotée à Paris clôture quatre heures et demie plus tôt : le
    # rendement du jour ne recouvre pas la même séance, et la covariance est biaisée
    # vers zéro. L'euro-dollar s'y ajoute pour un fonds non couvert.
    #
    # Mesuré sur un an, ESE.PA et VOO — qui suivent tous deux le S&P 500, le même
    # indice, à la virgule près :
    #
    #     ESE.PA (Paris)     bêta quotidien 0,54   bêta hebdomadaire 0,73
    #     VOO    (New York)  bêta quotidien 0,99   bêta hebdomadaire 1,00
    #
    # Le facteur annonçait donc un bêta de 0,56 pour un PEA investi à cent pour
    # cent en actions — une lecture « défensive » d'un portefeuille qui ne l'est
    # pas. Pire, il en tirait une note de 91 sur 100 en le comparant à une cible de
    # 65 % d'actions : il **certifiait la conformité au profil d'un portefeuille qui
    # s'en écartait de trente-cinq points**. Un facteur qui se trompe dans le sens
    # flatteur est plus nuisible qu'un facteur absent.
    #
    # Passer en pas hebdomadaire réduirait le biais sans le supprimer (0,73 au lieu
    # de 1,00) au prix des trois quarts des observations. Et le bêta était de toute
    # façon redondant : 0,73 de corrélation avec la volatilité sur les
    # portefeuilles types, laquelle se mesure sans repère extérieur ni décalage
    # horaire. Il n'y avait rien à sauver.

    # ── Frais courants du portefeuille ───────────────────────────────────────
    #
    # Le facteur le plus prédictif du résultat relatif d'un portefeuille de fonds
    # sur vingt ans, et le seul qui soit connu d'avance : les frais sont certains
    # là où les rendements sont espérés. Ils manquaient.
    #
    # Repères du marché : 0,10 % par an pour un tracker large, 1 % pour un fonds
    # actif. Au-delà, la note tombe à zéro.
    frais = _frais_ponderes(frais_par_ligne, poids)
    out["frais"] = {
        "valeur": round(frais, 3) if frais is not None else None,
        "libelle": (f"{frais:.2f} % par an" if frais is not None
                    else "Frais des fonds inconnus"),
        "score": round(_score_decroissant(frais, 0.10, 1.00), 0) if frais is not None else None,
    }

    # ── Frais de courtage réellement payés ───────────────────────────────────
    #
    # ⚠️ Distincts des frais courants ci-dessus, et il fallait les distinguer :
    # un TER est un prélèvement **annuel** sur l'encours, une commission de
    # courtage est un coût **ponctuel** sur chaque ordre. Les additionner ou les
    # ranger sous un même facteur mélangerait deux grandeurs qui ne se comparent
    # pas.
    #
    # Ils viennent des écritures, donc de ce que l'épargnant a saisi lui-même :
    # c'est la seule donnée de coût réellement disponible ici, là où le TER des
    # ETF européens manque presque toujours chez le fournisseur de cours. Ne pas
    # s'en servir laissait un « Frais — » devant quelqu'un qui les avait pourtant
    # renseignés.
    #
    # Repères d'un courtier au détail : un dixième de pour cent par ordre est très
    # bon, un pour cent est cher.
    out["frais_courtage"] = {
        "valeur": round(courtage, 3) if courtage is not None else None,
        "libelle": (f"{courtage:.2f} % des montants achetés" if courtage is not None
                    else "Aucun frais saisi"),
        "score": round(_score_decroissant(courtage, 0.10, 1.00), 0) if courtage is not None else None,
    }

    # ── Efficacité du risque : facteur RETIRÉ ────────────────────────────────
    #
    # ⚠️ Le ratio de Sharpe a été supprimé. Il était déjà mesuré sans noter, pour
    # une raison chiffrée : simulé sur deux mille portefeuilles dont le Sharpe vrai
    # vaut 0,50, la mesure sur un an ressort à 0,53 ± 1,00, et dans quatre-vingt-dix
    # pour cent des cas entre −1,05 et +2,24. À cinq ans l'écart-type tombe
    # seulement à 0,45.
    #
    # Le garder affiché supposait qu'un lecteur averti saurait en faire quelque
    # chose. C'était se raconter une histoire : la valeur affichée est à moitié du
    # bruit de tirage, et rien à l'écran ne pouvait dire *quelle* moitié. Un chiffre
    # que personne ne peut interpréter n'informe pas, il encombre — et il invite à
    # comparer deux portefeuilles sur une différence qui n'existe pas.

    # ── Perte maximale subie sur la fenêtre ──────────────────────────────────
    #
    # Le seul indicateur conservé sans noter, et le seul qui le mérite : « votre
    # portefeuille a perdu 6,4 % entre son sommet et son point bas » se comprend
    # sans formation financière, là où une volatilité annualisée demande une
    # traduction. C'est la phrase qui prépare quelqu'un à traverser une baisse.
    #
    # ⚠️ Il **notait** dès qu'un profil existait ; il ne note plus. Mesuré sur les
    # portefeuilles types, son score corrèle à +0,88 avec celui de la volatilité —
    # ce qui est mécanique, les deux étant deux lectures de la même dispersion, la
    # cible de perte étant elle-même dérivée de la volatilité cible par un simple
    # facteur 2,5. Les faire compter tous les deux revenait à peser deux fois la
    # même mesure dans la moyenne, exactement le défaut corrigé plus tôt sur la
    # corrélation. La volatilité garde la note, parce qu'elle s'estime beaucoup plus
    # précisément — ±0,5 point sur un an de séances — quand la perte maximale ne
    # retient qu'un unique épisode, celui qui s'est trouvé dans la fenêtre.
    perte = None
    if rendements is not None and len(rendements) >= 60:
        w = np.array([poids.get(c, 0.0) for c in rendements.columns], dtype=float)
        if w.sum() > 0:
            w = w / w.sum()
            serie = (rendements * w).sum(axis=1)
            from app.utils.finance import max_drawdown
            perte = float(max_drawdown(serie)) * 100
    # La cible reste **affichée** à côté de la mesure, même sans noter : « 6,4 %,
    # pour 30 % attendus au pire » situe le chiffre, ce que « 6,4 % » seul ne fait
    # pas.
    perte_cible = cible["perte"] if cible else None
    out["perte_max"] = {
        "valeur": round(perte, 2) if perte is not None else None,
        "libelle": (
            f"{perte:.1f} %, pour {perte_cible:.0f} % attendus au pire"
            if perte is not None and perte_cible is not None
            else f"{perte:.1f} % au plus bas" if perte is not None
            else "Historique insuffisant"
        ),
        # Aucune note : la valeur suffit, et une note qui doublerait la volatilité
        # à 0,88 de corrélation donnerait au lecteur l'impression de deux
        # confirmations là où il n'y a qu'une mesure.
        "score": None,
        "compte": False,
    }

    # ── Concentration de devise : facteur RETIRÉ ──────────────────────────────
    #
    # ⚠️ Supprimé parce qu'il lisait la **place de cotation** et non l'exposition.
    #
    # La devise venait de `info["currency"]`, qui donne la monnaie dans laquelle le
    # titre est **coté**. Pour une action, c'est la bonne donnée. Pour un fonds,
    # c'est l'emballage : un ETF S&P 500 éligible au PEA est coté en euros à Paris
    # tout en portant cent pour cent de risque dollar, non couvert.
    #
    # Mesuré sur deux portefeuilles à l'exposition économique **identique** — le
    # même indice, le S&P 500 :
    #
    #     ESE.PA, coté à Paris     → « 0 % hors euro »   → note 100
    #     VOO,    coté à New York  → « 100 % hors euro » → note 0
    #
    # Cent points d'écart pour une différence sans contenu économique. Et c'était le
    # deuxième facteur le plus influent du score, avec un écart-type de 41,6 sur les
    # portefeuilles types : il déplaçait la note plus que la diversification.
    # Affiché, il annonçait « 0 % hors euro » à quelqu'un exposé à soixante-dix pour
    # cent de dollars — une phrase fausse, pas une approximation.
    #
    # Le rendre juste demanderait les poids par devise des sous-jacents de chaque
    # fonds : le fournisseur ne les publie pas. Le déduire de la ventilation
    # géographique reviendrait à recopier une exposition déjà mesurée ailleurs, avec
    # une correspondance zone-devise inventée. Il n'y a pas de version honnête de ce
    # facteur avec les données disponibles, donc il n'y en a plus.

    # ── Répartition par classe d'actifs : facteur RETIRÉ ─────────────────────
    #
    # ⚠️ Supprimé : c'était une **exposition déguisée en facteur**. Il ne notait
    # pas, il n'apportait rien que la ventilation par classes n'affiche déjà en
    # graphique, et il occupait une ligne dont la note valait zéro pour un
    # portefeuille cent pour cent actions — un choix parfaitement tenable à trente
    # ans d'horizon. Un zéro à l'écran se lit comme un reproche, quelle que soit la
    # mention « indicatif » posée à côté.

    # ── Liquidité : facteur RETIRÉ ───────────────────────────────────────────
    #
    # ⚠️ Supprimé : constant par construction. Pour une position de particulier il
    # vaut cent quoi qu'il arrive — cent neuf titres contre dix mille de volume
    # quotidien donnent 0,01 séance, donc la note maximale, et il faudrait détenir
    # un dixième du volume d'une séance pour perdre le premier point. Il avait déjà
    # été sorti de la moyenne pour cette raison ; le garder affiché revenait à
    # montrer « moins d'une séance » à tout le monde, tout le temps.
    #
    # C'est le contre-exemple de la redondance, gardée bien qu'elle vaille cent la
    # plupart du temps : là, cent est un constat sur le portefeuille ; ici, cent
    # était une propriété de l'échelle.

    for cle, f in out.items():
        f.setdefault("compte", True)

    return out


def score_global(facteurs: dict[str, dict]) -> int | None:
    """
    Moyenne des facteurs renseignés **et notants**.

    Les facteurs manquants sont ignorés plutôt que comptés à zéro : un
    portefeuille sans historique n'est pas un mauvais portefeuille.

    ⚠️ Un facteur peut être mesuré sans compter, s'il est marqué
    `compte: False` — c'est le cas de la perte maximale, affichée parce qu'elle
    parle mieux que tout autre chiffre, écartée de la moyenne parce qu'elle
    double la volatilité. L'absence de la clé vaut `True`, pour qu'un facteur
    nouveau compte par défaut plutôt que d'être oublié en silence.
    """
    scores = [
        f["score"] for f in facteurs.values()
        if f.get("score") is not None and f.get("compte", True)
    ]
    return int(round(sum(scores) / len(scores))) if scores else None


# Les cinq bandes qualitatives.
#
# ⚠️ Les seuils ne sont **pas** cinq tranches égales de vingt points, et ils l'ont
# été à tort. Rien n'impose que la traduction d'une note en jugement soit linéaire,
# et mesurée sur des portefeuilles construits, la version régulière tassait les
# libellés en haut :
#
#     marché mondial complet   95  ─┐
#     1 ETF monde seul         86   │ tous « Très bon »
#     PEA à trois ETF          84   │
#     60/40 monde-obligations  84  ─┘
#     2 ETF World en doublon   68  ─┐ tous « Bon »
#     10 mégacaps américaines  60  ─┘
#     100 % ETF Nasdaq         43     « Moyen »
#     1 seule action           18     « Très faible »
#
# La bande « Faible » restait vide, et « Très bon » réunissait le portefeuille
# optimal et des portefeuilles à manques réels — celui à 84 n'a aucune exposition
# aux marchés émergents et des frais inconnus.
#
# Les seuils sont donc ancrés sur ce que le mot doit vouloir dire, non sur une
# division arithmétique. « Très bon » signifie « aucun manque nommable » : atteindre
# 88 demande une couverture mondiale émergents compris, des frais connus et bas, et
# une volatilité conforme au profil déclaré. C'est atteignable — le portefeuille de
# marché obtient 95 — mais cela demande d'avoir tout fait.
#
# ⚠️ Ces valeurs sont **dupliquées** dans `AnalyseView.tsx`, qui en tire ses
# couleurs. Le libellé, lui, vient d'ici : le serveur le calcule et le rend. À
# modifier des deux côtés.
BANDES = [
    (88, "Très bon"),
    (70, "Bon"),
    (50, "Moyen"),
    (30, "Faible"),
    (0,  "Très faible"),
]


def bande(score: int | None) -> str | None:
    """Le libellé qualitatif d'un score."""
    if score is None:
        return None
    for seuil, nom in BANDES:
        if score >= seuil:
            return nom
    return BANDES[-1][1]


# ── Observations ──────────────────────────────────────────────────────────────

def observations(
    poids: dict[str, float],
    facteurs: dict[str, dict],
    expositions: dict[str, list[dict]],
) -> list[dict]:
    """
    Ce que les chiffres disent, en français.

    Chaque observation cite la mesure qui la fonde : sans elle, un constat n'est
    qu'une opinion, et le lecteur ne peut ni la vérifier ni la contester.
    """
    out: list[dict] = []
    if not poids:
        return out

    tries = sorted(poids.items(), key=lambda kv: kv[1], reverse=True)

    # Concentration
    premier, part = tries[0]
    if part >= 50:
        out.append({
            "ton": "alerte",
            "titre": f"{premier} pèse {part:.1f} % du portefeuille",
            "detail": "Une baisse de 10 % de cette seule ligne coûterait "
                      f"{part / 10:.1f} % de la valeur totale.",
        })
    elif len(tries) >= 3:
        trois = sum(w for _, w in tries[:3])
        if trois >= 70:
            out.append({
                "ton": "attention",
                "titre": f"Vos trois premières lignes font {trois:.0f} %",
                "detail": "La performance du portefeuille dépend surtout d'elles.",
            })

    # Redondance
    #
    # ⚠️ Fondée sur la corrélation **maximale** et non plus sur la moyenne. Le
    # constat d'origine — « vos lignes évoluent ensemble » — se déclenchait à 0,80
    # de moyenne, ce qu'un portefeuille d'actions atteint par nature : il
    # reprochait la classe d'actifs à qui l'avait choisie. La corrélation maximale
    # désigne au contraire deux lignes précises, et le conseil devient exécutable.
    red = facteurs.get("redondance", {})
    if red.get("valeur") is not None and red["valeur"] >= 0.95:
        out.append({
            "ton": "attention",
            "titre": f"Deux de vos lignes font le même pari (corrélation {red['valeur']:.2f})",
            "detail": "À ce niveau elles sont interchangeables : l'une des deux "
                      "n'ajoute ni rendement attendu ni amortissement.",
        })

    # Volatilité
    vol = facteurs.get("volatilite", {})
    if vol.get("valeur") is not None:
        v = vol["valeur"]
        if v >= 25:
            out.append({
                "ton": "attention",
                "titre": f"Volatilité élevée : {v:.0f} % par an",
                "detail": "Des variations de cet ordre sont normales pour ce "
                          "portefeuille ; il faut pouvoir les traverser sans vendre.",
            })

    # Exposition sectorielle
    secteurs = expositions.get("secteurs") or []
    if secteurs and secteurs[0]["part"] >= 35:
        s = secteurs[0]
        out.append({
            "ton": "attention",
            "titre": f"{s['libelle']} représente {s['part']:.0f} % de vos actions",
            "detail": "En transparence de vos fonds. Un retournement du secteur "
                      "pèserait à proportion.",
        })

    # ⚠️ L'observation sur les devises a été retirée avec le facteur du même nom.
    # Elle sommait les parts dont la devise **de cotation** n'était pas l'euro, et
    # annonçait donc « 0 % hors euro » à un portefeuille de trackers S&P 500 cotés
    # à Paris — exposé en réalité à cent pour cent au dollar. Une observation fausse
    # est plus coûteuse qu'une observation absente : elle rassure.

    return out


# ── Exposition ────────────────────────────────────────────────────────────────

# Les intitulés de secteurs arrivent en anglais et en minuscules à souligner.
SECTEURS_FR = {
    "technology": "Technologie",
    "financial_services": "Finance",
    "consumer_cyclical": "Consommation discrétionnaire",
    "consumer_defensive": "Consommation de base",
    "healthcare": "Santé",
    "industrials": "Industrie",
    "communication_services": "Communication",
    "energy": "Énergie",
    "utilities": "Services aux collectivités",
    "realestate": "Immobilier",
    "basic_materials": "Matériaux",
}


# Les classes d'actifs arrivent sous leur nom d'API.
CLASSES_FR = {
    "stockPosition":       "Actions",
    "bondPosition":        "Obligations",
    "cashPosition":        "Liquidités",
    "preferredPosition":   "Actions préférentielles",
    "convertiblePosition": "Convertibles",
    "otherPosition":       "Autres",
}


def _joli_secteur(cle: str) -> str:
    return SECTEURS_FR.get(cle, cle.replace("_", " ").capitalize())


def _joli(cle: str) -> str:
    """Traduit une clé technique, ou la rend telle quelle si on ne la connaît pas."""
    return CLASSES_FR.get(cle, SECTEURS_FR.get(cle, cle))


def agreger_exposition(
    lignes: list[dict],
    seuil_autres: float = 3.0,
    maximum: int = 6,
) -> list[dict]:
    """
    Regroupe des parts en une liste triée, les miettes réunies sous « Autres ».

    Sans regroupement, une ventilation sectorielle en transparence de fonds
    produit une quinzaine d'entrées dont la moitié sous un pour cent : la liste
    devient illisible et masque les trois qui comptent.
    """
    total = sum(l["part"] for l in lignes)
    if total <= 0:
        return []
    normalisees = [{"libelle": l["libelle"], "part": l["part"] / total * 100} for l in lignes]
    normalisees.sort(key=lambda l: l["part"], reverse=True)

    gardees = [l for l in normalisees[:maximum] if l["part"] >= seuil_autres]
    reste = sum(l["part"] for l in normalisees if l not in gardees)
    if reste > 0.05:
        gardees.append({"libelle": "Autres", "part": reste})
    return [{"libelle": l["libelle"], "part": round(l["part"], 1)} for l in gardees]


def ventilation_secteurs(details: dict[str, dict], poids: dict[str, float]) -> list[dict]:
    """
    Ventilation sectorielle **complète**, en transparence des fonds.

    Un ETF n'a pas de secteur : il en a des centaines. Sa ventilation interne
    est répartie au prorata de son poids dans le portefeuille — sans quoi un
    portefeuille de trois ETF n'aurait aucune exposition sectorielle, ce qui
    est faux.

    ⚠️ Non regroupée, et c'est tout l'intérêt. C'est cette liste que le facteur de
    diversification doit mesurer ; `exposition_secteurs` en produit une version
    abrégée pour le graphique, qui ne convient pas au calcul. Voir la note là-bas.

    ⚠️ Les parts en **pourcentage du portefeuille**, et la part non identifiée
    rendue explicitement sous `LIBELLE_INCONNU`.

    La version précédente normalisait à cent sur les seuls titres dont le secteur
    était connu. La liste sommait donc toujours à cent, et le contrôle de couverture
    du facteur — « au moins 60 % du portefeuille doit être transparent » — ne pouvait
    jamais se déclencher : une diversification calculée sur 30 % du portefeuille
    s'affichait comme celle du portefeuille entier. Le garde-fou existait dans le
    code sans jamais s'appliquer aux secteurs ; seules les zones le déclenchaient,
    parce qu'elles portaient une étiquette « Non déterminé » explicite.
    """
    cumul: dict[str, float] = {}
    couvert = 0.0
    for ticker, w in poids.items():
        d = details.get(ticker) or {}
        interne = d.get("secteurs") or {}
        if interne:
            # Les poids internes d'un fonds somment à un, mais rien ne le garantit :
            # on compte ce qui est réellement ventilé plutôt que de le supposer.
            for cle, part in interne.items():
                cumul[_joli_secteur(cle)] = cumul.get(_joli_secteur(cle), 0.0) + w * part
                couvert += w * part
        elif d.get("secteur"):
            nom = d["secteur"]
            cumul[nom] = cumul.get(nom, 0.0) + w
            couvert += w
    if not cumul:
        return []
    total = sum(poids.values())
    sortie = [{"libelle": k, "part": v} for k, v in cumul.items()]
    inconnu = total - couvert
    if inconnu > 0.05:
        sortie.append({"libelle": LIBELLE_INCONNU, "part": inconnu})
    return sortie


def exposition_secteurs(details: dict[str, dict], poids: dict[str, float]) -> list[dict]:
    """
    La même ventilation, abrégée pour l'affichage.

    ⚠️ **À ne pas passer au facteur de diversification.** `agreger_exposition`
    plafonne à six entrées et réunit le reste sous « Autres », ce qui est bon pour
    une colonne de 134 px et faux pour un indice de concentration : « Autres » y
    compte comme *un* secteur alors qu'il en contient plusieurs.

    Mesuré sur onze secteurs équipondérés — la meilleure diversification
    sectorielle possible : l'agrégation garde six lignes à 9,1 % et verse les cinq
    dernières dans un « Autres » à 45,5 %, qui devient du coup le plus gros poste.
    Le nombre de secteurs équivalents tombe de 11,00 à 3,90, et la note de 100 à
    **41**. Le portefeuille sectoriellement parfait ne pouvait donc pas dépasser 41,
    et ce plafond était invisible : rien dans le chiffre ne disait qu'il venait de la
    mise en forme.
    """
    return agreger_exposition(ventilation_secteurs(details, poids))


def exposition_simple(details: dict[str, dict], poids: dict[str, float], champ: str) -> list[dict]:
    """Ventilation par un attribut direct — devise, classe d'actif."""
    cumul: dict[str, float] = {}
    for ticker, w in poids.items():
        d = details.get(ticker) or {}
        valeur = d.get(champ)
        if isinstance(valeur, dict):
            for cle, part in valeur.items():
                nom = _joli(cle)
                cumul[nom] = cumul.get(nom, 0.0) + w * part
        elif valeur:
            cumul[valeur] = cumul.get(valeur, 0.0) + w
    return agreger_exposition([{"libelle": k, "part": v} for k, v in cumul.items()])


# ── Géographie ────────────────────────────────────────────────────────────────

# Zone couverte, déduite de l'indice suivi.
#
# yfinance annonce `region: US` pour un ETF Stoxx Europe 600 comme pour un ETF
# S&P 500 : c'est la place de cotation, pas l'exposition. L'afficher serait
# faux. L'indice, lui, dit la zone sans ambiguïté — un fonds S&P 500 est
# américain par mandat, ce n'est pas une estimation mais le contrat du fonds.
#
# L'ordre compte : les motifs les plus précis passent devant.
ZONES = [
    ("msci emerging latin", "Amérique latine"),
    ("amerique latine",     "Amérique latine"),
    ("emerging asia",       "Asie émergente"),
    ("asie emergente",      "Asie émergente"),
    ("asia pacific",        "Asie-Pacifique"),
    ("asie pacifique",      "Asie-Pacifique"),
    ("msci india",          "Inde"),
    ("msci china",          "Chine"),
    ("topix",               "Japon"),
    ("japon",               "Japon"),
    ("japan",               "Japon"),
    ("emerging",            "Marchés émergents"),
    ("emergent",            "Marchés émergents"),
    ("stoxx europe",        "Europe"),
    ("euro stoxx",          "Zone euro"),
    ("msci europe",         "Europe"),
    ("cac 40",              "France"),
    ("msci world",          "Monde développé"),
    ("pea monde",           "Monde développé"),
    ("s&p 500",             "États-Unis"),
    ("s&p500",              "États-Unis"),
    ("nasdaq",              "États-Unis"),
    ("msci usa",            "États-Unis"),
    ("s&p us",              "États-Unis"),
]


def zone_du_fonds(nom: str | None) -> str | None:
    """La zone géographique d'un fonds, d'après l'indice cité dans son nom."""
    if not nom:
        return None
    n = nom.lower().replace("é", "e").replace("è", "e")
    for motif, zone in ZONES:
        if motif in n:
            return zone
    return None


def ventilation_zones(details: dict[str, dict], poids: dict[str, float]) -> list[dict]:
    """
    Ventilation géographique **complète**, en pourcentage du portefeuille.

    Le pays d'une action est une donnée ; la zone d'un fonds se lit dans son
    mandat. Un fonds dont l'indice n'est pas reconnu est rangé sous « Non
    déterminé » plutôt que réparti au hasard.

    ⚠️ Non regroupée : c'est elle que mesure le facteur `geographie`.
    `exposition_zones` en donne une version abrégée pour le graphique, qui plafonne
    à six entrées plus « Autres » et ne convient donc pas au calcul.
    """
    cumul: dict[str, float] = {}
    for ticker, w in poids.items():
        d = details.get(ticker) or {}
        zone = d.get("pays") or zone_du_fonds(d.get("nom"))
        cle = zone or LIBELLE_INCONNU
        cumul[cle] = cumul.get(cle, 0.0) + w
    return [{"libelle": k, "part": v} for k, v in cumul.items()]


def exposition_zones(details: dict[str, dict], poids: dict[str, float]) -> list[dict]:
    """La même ventilation, abrégée pour l'affichage."""
    return agreger_exposition(ventilation_zones(details, poids), seuil_autres=0.5)


# ── Géographie : l'écart au marché mondial ────────────────────────────────────
#
# ⚠️ Ce facteur remplace un comptage de zones qui était faux.
#
# L'ancien calcul comptait des **étiquettes** : la zone d'un fonds se déduisant de
# l'indice cité dans son nom, un ETF MSCI World recevait « Monde développé », soit
# une étiquette, donc une zone équivalente, donc zéro sur cent — pour un fonds
# détenant 23 pays et quelque 1 500 sociétés. Mesuré avant correction : 0 pour un
# ETF monde contre 28 pour un PEA à trois lignes. Le score récompensait le moins
# diversifié des deux.
#
# La bonne question n'est pas « combien de zones ? » mais « à quelle distance de la
# répartition du marché mondial ? ». Le portefeuille de marché est, par définition
# arithmétique et non par préférence, le portefeuille le plus diversifié qui
# existe : s'en écarter réduit la diversification, quel que soit le profil de
# l'épargnant. C'est ce qui distingue ce facteur d'un niveau de risque — la
# volatilité demande une intention déclarée, un écart au marché non.

# Les quatre régions de référence, et leur poids dans le marché mondial coté.
#
# ⚠️ Ordres de grandeur repris de la composition du MSCI ACWI, pas des valeurs
# exactes : elles dérivent de quelques points par an au gré des marchés. C'est
# assumé et sans conséquence — l'échelle du score court jusqu'à cinquante points
# d'écart, donc deux points de dérive sur une référence en déplacent la note de
# quatre centièmes. Les garder ici, nommées et datées, vaut mieux que de les
# recalculer à partir de cours qu'on n'a pas.
POIDS_MARCHE_MONDIAL = {
    "Amérique du Nord":         66.0,
    "Europe":                   14.0,
    "Asie-Pacifique développée": 9.0,
    "Marchés émergents":        11.0,
}

# Comment chaque étiquette de zone se répartit sur les régions de référence.
#
# ⚠️ C'est ici que se joue la correction. « Monde développé » ne vaut pas *une*
# région : il se **décompose**, aux poids du MSCI World, ce qui le rapproche
# naturellement du marché mondial et lui vaut donc une note haute. Une étiquette
# nationale, elle, se concentre sur une seule région et s'en écarte.
DECOMPOSITION_ZONE: dict[str, dict[str, float]] = {
    # Fonds mondiaux : la décomposition est celle de l'indice, hors émergents.
    "Monde développé":   {"Amérique du Nord": 0.74, "Europe": 0.16,
                          "Asie-Pacifique développée": 0.10},
    # Fonds régionaux, d'après l'étiquette déduite du mandat.
    "États-Unis":        {"Amérique du Nord": 1.0},
    "Europe":            {"Europe": 1.0},
    "Zone euro":         {"Europe": 1.0},
    "France":            {"Europe": 1.0},
    "Japon":             {"Asie-Pacifique développée": 1.0},
    "Asie-Pacifique":    {"Asie-Pacifique développée": 1.0},
    "Marchés émergents": {"Marchés émergents": 1.0},
    "Asie émergente":    {"Marchés émergents": 1.0},
    "Amérique latine":   {"Marchés émergents": 1.0},
    "Chine":             {"Marchés émergents": 1.0},
    "Inde":              {"Marchés émergents": 1.0},
}

# Les pays tels que le fournisseur de cours les nomme, pour les **actions**.
#
# ⚠️ En anglais, parce que c'est ce que rend `info["country"]` — alors que les zones
# de fonds sont en français, déduites du nom du mandat. Les deux vocabulaires
# arrivent mélangés dans la même ventilation, et une correspondance qui n'en
# couvrirait qu'un rangerait la moitié du portefeuille en « non déterminé ».
#
# La Corée du Sud est classée en émergents : c'est le classement du MSCI, et il
# décide de la composition des indices que les épargnants achètent réellement.
PAYS_VERS_REGION = {
    "United States": "Amérique du Nord", "Canada": "Amérique du Nord",
    "France": "Europe", "Germany": "Europe", "United Kingdom": "Europe",
    "Switzerland": "Europe", "Netherlands": "Europe", "Spain": "Europe",
    "Italy": "Europe", "Sweden": "Europe", "Denmark": "Europe",
    "Norway": "Europe", "Finland": "Europe", "Belgium": "Europe",
    "Ireland": "Europe", "Austria": "Europe", "Portugal": "Europe",
    "Luxembourg": "Europe", "Jersey": "Europe", "Israel": "Europe",
    "Japan": "Asie-Pacifique développée", "Australia": "Asie-Pacifique développée",
    "Hong Kong": "Asie-Pacifique développée", "Singapore": "Asie-Pacifique développée",
    "New Zealand": "Asie-Pacifique développée",
    "China": "Marchés émergents", "Taiwan": "Marchés émergents",
    "India": "Marchés émergents", "South Korea": "Marchés émergents",
    "Brazil": "Marchés émergents", "Mexico": "Marchés émergents",
    "South Africa": "Marchés émergents", "Indonesia": "Marchés émergents",
    "Thailand": "Marchés émergents", "Malaysia": "Marchés émergents",
    "Turkey": "Marchés émergents", "Poland": "Marchés émergents",
    "Chile": "Marchés émergents", "Argentina": "Marchés émergents",
    "Philippines": "Marchés émergents", "Vietnam": "Marchés émergents",
    "Saudi Arabia": "Marchés émergents",
    "United Arab Emirates": "Marchés émergents", "Qatar": "Marchés émergents",
}

# Écart, en points, au-delà duquel la note tombe à zéro.
#
# Repères calculés sur la table ci-dessus : un ETF monde donne 0, un portefeuille
# entièrement américain 34, un portefeuille entièrement français 86. Cinquante
# place donc le zéro entre les deux — au-delà de la concentration sur le plus gros
# marché du monde, en deçà de la concentration sur un seul pays européen.
ECART_MARCHE_MAX = 50.0


def regions_du_portefeuille(zones: list[dict] | None) -> tuple[dict[str, float], float]:
    """
    Répartit une ventilation par zone sur les quatre régions de référence.

    Rend les parts par région, **renormalisées sur la part reconnue**, et cette
    part reconnue en pourcentage du portefeuille. Une étiquette qu'on ne sait pas
    situer est écartée plutôt que rangée au hasard : c'est la même règle que pour
    les secteurs, et pour la même raison — une inconnue n'est pas une catégorie.
    """
    cumul: dict[str, float] = {}
    reconnu = 0.0
    for entree in zones or []:
        libelle = entree.get("libelle")
        part = float(entree.get("part") or 0.0)
        if not libelle or part <= 0 or libelle == LIBELLE_INCONNU:
            continue
        repartition = DECOMPOSITION_ZONE.get(libelle)
        if repartition is None:
            region = PAYS_VERS_REGION.get(libelle)
            if region is None:
                continue
            repartition = {region: 1.0}
        for region, poids_region in repartition.items():
            cumul[region] = cumul.get(region, 0.0) + part * poids_region
        reconnu += part
    if reconnu <= 0:
        return {}, 0.0
    return {r: v / reconnu * 100.0 for r, v in cumul.items()}, reconnu


def ecart_au_marche(regions: dict[str, float]) -> float:
    """
    L'écart entre une répartition régionale et celle du marché mondial, en points.

    C'est la moitié de la somme des écarts absolus — la distance de variation
    totale. Elle se lit directement : « il faudrait déplacer tant pour cent du
    portefeuille pour rejoindre le marché ». Zéro pour un tracker mondial, et
    d'autant plus grande que le portefeuille se concentre.

    La moitié, parce que tout ce qui manque à une région se retrouve en trop dans
    une autre : sans elle, chaque écart serait compté deux fois.
    """
    total = 0.0
    for region, reference in POIDS_MARCHE_MONDIAL.items():
        total += abs(regions.get(region, 0.0) - reference)
    # Une région absente de la table de référence — il n'y en a pas aujourd'hui,
    # mais une étiquette ajoutée plus tard pourrait en produire — compte comme un
    # écart plein plutôt que d'être ignorée en silence.
    for region, part in regions.items():
        if region not in POIDS_MARCHE_MONDIAL:
            total += abs(part)
    return total / 2.0


# ── Projection ────────────────────────────────────────────────────────────────

def projection(
    valeur: float,
    rendement_quotidien: float,
    volatilite_quotidienne: float,
    jours: int = 252,
    tirages: int = 2000,
    graine: int = 12345,
) -> dict:
    """
    Distribution de la valeur à un an, par tirages aléatoires.

    Le portefeuille est projeté **tel qu'il est** : aucun versement futur n'est
    supposé. En ajouter un ferait monter la courbe sans que le portefeuille y
    soit pour rien, et le lecteur prendrait son propre effort d'épargne pour
    une performance.
    
    Les tirages suivent un mouvement brownien géométrique calibré sur
    l'historique récent. C'est un modèle : il suppose des rendements
    indépendants et une volatilité constante, ce que les marchés ne respectent
    ni l'un ni l'autre. Il donne un ordre de grandeur de dispersion, pas une
    prévision.
    """
    if valeur <= 0 or volatilite_quotidienne <= 0:
        return {"median": None, "p10": None, "p90": None, "trajectoire": []}

    r = np.random.default_rng(graine)
    # Correction d'Itô : sans le terme en −σ²/2, l'espérance de l'exponentielle
    # dépasse le rendement visé et la projection dérive vers le haut.
    derive = rendement_quotidien - 0.5 * volatilite_quotidienne ** 2
    chocs = r.normal(derive, volatilite_quotidienne, (tirages, jours))
    chemins = valeur * np.exp(np.cumsum(chocs, axis=1))

    quantiles = np.percentile(chemins, [10, 50, 90], axis=0)
    # Une trajectoire allégée : cinquante points suffisent à dessiner un cône.
    pas = max(1, jours // 50)
    idx = list(range(0, jours, pas)) + [jours - 1]
    return {
        "median": round(float(quantiles[1, -1]), 2),
        "p10":    round(float(quantiles[0, -1]), 2),
        "p90":    round(float(quantiles[2, -1]), 2),
        "trajectoire": [
            {
                "jour": int(i) + 1,
                "p10":  round(float(quantiles[0, i]), 2),
                "median": round(float(quantiles[1, i]), 2),
                "p90":  round(float(quantiles[2, i]), 2),
            }
            for i in idx
        ],
    }
