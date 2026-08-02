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


def facteurs_de_risque(
    poids: dict[str, float],
    rendements: pd.DataFrame | None,
    rendements_marche: pd.Series | None = None,
    jours_liquidation: float | None = None,
    secteurs: list[dict] | None = None,
    zones: list[dict] | None = None,
) -> dict[str, dict]:
    """
    Les six facteurs affichés, chacun avec sa valeur brute et son score.

    `rendements` porte une colonne par ligne détenue. Les facteurs qui en
    dépendent valent `None` quand l'historique manque — un portefeuille créé
    hier n'a pas de volatilité, et en inventer une serait pire que de l'omettre.
    """
    out: dict[str, dict] = {}
    n = len([w for w in poids.values() if w > 0])

    # ── Concentration : nombre de lignes équivalentes ────────────────────────
    #
    # L'inverse de l'indice de Herfindahl se lit directement : un portefeuille
    # à 70/20/10 pèse comme 1,9 ligne équipondérée.
    #
    # L'échelle est absolue — huit lignes équivalentes valent cent, une seule
    # vaut zéro. La rapporter au nombre de lignes détenues, comme on l'a
    # d'abord écrit, flattait tout le monde : un portefeuille d'une seule ligne
    # atteignait alors son propre idéal et décrochait la moyenne.
    hhi = herfindahl(poids.values())
    lignes_eq = 1.0 / hhi if hhi > 0 else 0.0
    out["concentration"] = {
        "valeur": round(hhi, 4),
        "libelle": f"{lignes_eq:.1f} ligne{'s' if lignes_eq >= 2 else ''} équivalente{'s' if lignes_eq >= 2 else ''}",
        "score": round(_score_decroissant(lignes_eq, 8.0, 1.0), 0),
    }

    # ── Corrélation moyenne entre lignes ─────────────────────────────────────
    corr = None
    if rendements is not None and rendements.shape[1] >= 2 and len(rendements) >= 20:
        m = rendements.corr().to_numpy()
        haut = m[np.triu_indices_from(m, k=1)]
        haut = haut[~np.isnan(haut)]
        if haut.size:
            corr = float(np.mean(haut))
    out["correlation"] = {
        "valeur": round(corr, 3) if corr is not None else None,
        "libelle": f"{corr:.2f} en moyenne" if corr is not None else "Historique insuffisant",
        # Zéro de corrélation vaut cent, corrélation parfaite vaut zéro.
        "score": round(_score_decroissant(corr, 0.0, 1.0), 0) if corr is not None else None,
    }

    # ── Diversification, en transparence ─────────────────────────────────────
    #
    # Compter les lignes calomnie un portefeuille de fonds : trois ETF, c'est
    # trois lignes mais des centaines de sociétés réparties sur onze secteurs
    # et plusieurs continents. La diversification se mesure donc sur ce qui est
    # réellement détenu — la ventilation sectorielle et géographique obtenue en
    # transparence — et non sur le nombre d'enveloppes qui les portent.
    #
    # La concentration des lignes reste mesurée à part : détenir 80 % d'un seul
    # produit est un risque en soi, quelle que soit sa composition interne.
    composantes: list[float] = []
    detail: list[str] = []

    if secteurs:
        n_sect = 1.0 / herfindahl([x["part"] for x in secteurs])
        composantes.append(_score_decroissant(n_sect, 8.0, 1.0))
        detail.append(f"{n_sect:.1f} secteurs")
    if zones:
        n_zones = 1.0 / herfindahl([x["part"] for x in zones])
        composantes.append(_score_decroissant(n_zones, 4.0, 1.0))
        detail.append(f"{n_zones:.1f} zones")   # abrégé : la colonne fait 134 px
    if corr is not None:
        composantes.append(out["correlation"]["score"])
    if not composantes:
        composantes.append(out["concentration"]["score"])
        detail.append(f"{n} ligne{'s' if n > 1 else ''}")

    out["diversification"] = {
        "valeur": n,
        "libelle": " · ".join(detail) if detail else f"{n} ligne{'s' if n > 1 else ''}",
        "score": round(sum(composantes) / len(composantes), 0),
    }

    # ── Volatilité annualisée du portefeuille ────────────────────────────────
    vol = None
    if rendements is not None and len(rendements) >= 20:
        w = np.array([poids.get(c, 0.0) for c in rendements.columns], dtype=float)
        if w.sum() > 0:
            w = w / w.sum()
            serie = (rendements * w).sum(axis=1)
            vol = float(serie.std() * math.sqrt(252) * 100)
    out["volatilite"] = {
        "valeur": round(vol, 2) if vol is not None else None,
        "libelle": f"{vol:.1f} % par an" if vol is not None else "Historique insuffisant",
        # 8 % est calme, 35 % est agité : les repères d'un portefeuille actions.
        "score": round(_score_decroissant(vol, 8.0, 35.0), 0) if vol is not None else None,
    }

    # ── Sensibilité au marché : bêta contre l'indice de référence ────────────
    beta = None
    if (rendements is not None and rendements_marche is not None
            and len(rendements) >= 20):
        w = np.array([poids.get(c, 0.0) for c in rendements.columns], dtype=float)
        if w.sum() > 0:
            w = w / w.sum()
            pf = (rendements * w).sum(axis=1)
            commun = pf.index.intersection(rendements_marche.index)
            if len(commun) >= 20:
                a, b = pf.loc[commun], rendements_marche.loc[commun]
                var = float(b.var())
                if var > 0:
                    beta = float(a.cov(b) / var)
    out["sensibilite_marche"] = {
        "valeur": round(beta, 2) if beta is not None else None,
        "libelle": f"bêta {beta:.2f}" if beta is not None else "Historique insuffisant",
        # Un bêta de 1 suit le marché ; on s'éloigne du score haut dans les deux
        # sens, un portefeuille deux fois plus nerveux comme un portefeuille
        # inerte s'écartant de la référence.
        "score": round(_score_decroissant(abs(beta - 1.0), 0.0, 1.0), 0) if beta is not None else None,
    }

    # ── Liquidité : jours nécessaires pour sortir des positions ──────────────
    out["liquidite"] = {
        "valeur": round(jours_liquidation, 2) if jours_liquidation is not None else None,
        "libelle": (
            "moins d'une séance" if jours_liquidation is not None and jours_liquidation < 1
            else f"{jours_liquidation:.1f} séances" if jours_liquidation is not None
            else "Volumes indisponibles"
        ),
        "score": round(_score_decroissant(jours_liquidation, 0.1, 5.0), 0) if jours_liquidation is not None else None,
    }

    return out


def score_global(facteurs: dict[str, dict]) -> int | None:
    """
    Moyenne des facteurs renseignés.

    Les facteurs manquants sont ignorés plutôt que comptés à zéro : un
    portefeuille sans historique n'est pas un mauvais portefeuille.
    """
    scores = [f["score"] for f in facteurs.values() if f.get("score") is not None]
    return int(round(sum(scores) / len(scores))) if scores else None


BANDES = [
    (80, "Très bon"),
    (60, "Bon"),
    (40, "Moyen"),
    (20, "Faible"),
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

    # Corrélation
    corr = facteurs.get("correlation", {})
    if corr.get("valeur") is not None:
        v = corr["valeur"]
        if v >= 0.8:
            out.append({
                "ton": "attention",
                "titre": f"Vos lignes évoluent ensemble (corrélation {v:.2f})",
                "detail": "Elles montent et baissent de concert : la diversification "
                          "apparente ne réduit pas beaucoup le risque.",
            })
        elif v <= 0.4:
            out.append({
                "ton": "favorable",
                "titre": f"Lignes peu corrélées (corrélation {v:.2f})",
                "detail": "Leurs mouvements se compensent en partie, ce qui amortit "
                          "les à-coups.",
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

    # Devises
    devises = expositions.get("devises") or []
    hors_euro = sum(d["part"] for d in devises if d["libelle"] != "EUR")
    if hors_euro >= 30:
        out.append({
            "ton": "info",
            "titre": f"{hors_euro:.0f} % de votre portefeuille est hors euro",
            "detail": "Le taux de change pèse alors sur la performance, dans un "
                      "sens comme dans l'autre.",
        })

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


def exposition_secteurs(details: dict[str, dict], poids: dict[str, float]) -> list[dict]:
    """
    Ventilation sectorielle, en transparence des fonds.

    Un ETF n'a pas de secteur : il en a des centaines. Sa ventilation interne
    est répartie au prorata de son poids dans le portefeuille — sans quoi un
    portefeuille de trois ETF n'aurait aucune exposition sectorielle, ce qui
    est faux.
    """
    cumul: dict[str, float] = {}
    for ticker, w in poids.items():
        d = details.get(ticker) or {}
        interne = d.get("secteurs") or {}
        if interne:
            for cle, part in interne.items():
                cumul[_joli_secteur(cle)] = cumul.get(_joli_secteur(cle), 0.0) + w * part
        elif d.get("secteur"):
            nom = d["secteur"]
            cumul[nom] = cumul.get(nom, 0.0) + w
    return agreger_exposition([{"libelle": k, "part": v} for k, v in cumul.items()])


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


def exposition_zones(details: dict[str, dict], poids: dict[str, float]) -> list[dict]:
    """
    Ventilation géographique.

    Le pays d'une action est une donnée ; la zone d'un fonds se lit dans son
    mandat. Un fonds dont l'indice n'est pas reconnu est rangé sous « Non
    déterminé » plutôt que réparti au hasard.
    """
    cumul: dict[str, float] = {}
    for ticker, w in poids.items():
        d = details.get(ticker) or {}
        zone = d.get("pays") or zone_du_fonds(d.get("nom"))
        cle = zone or "Non déterminé"
        cumul[cle] = cumul.get(cle, 0.0) + w
    return agreger_exposition([{"libelle": k, "part": v} for k, v in cumul.items()], seuil_autres=0.5)


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
