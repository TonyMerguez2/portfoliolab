"""
Trajectoire d'un portefeuille réel, déduite de ses transactions.

`/portfolio-history` répond à une autre question : « qu'aurait valu un
achat-conservation à ces pondérations ? ». Appliqué à un portefeuille construit
par versements successifs, il remonte à la création du plus ancien fonds et
compte comme performance ce qui n'est qu'un historique d'indice — un PEA ouvert
en février affichait ainsi +371 % « sur tout l'historique ».

Ici la courbe part de la première transaction et suit les quantités réellement
détenues jour après jour.

La performance est mesurée en TWR (rendement pondéré dans le temps). Sur un
portefeuille alimenté régulièrement, le rapport brut entre valeur finale et
valeur initiale compte les versements comme des gains : verser 100 € sur un
portefeuille de 100 € le ferait apparaître à +100 % sans qu'aucun titre n'ait
bougé. Le TWR neutralise les flux et ne mesure que le rendement des actifs.
"""

from __future__ import annotations

from datetime import date
from typing import Iterable


def _quantites_et_flux(
    transactions: list[dict],
) -> tuple[dict[date, dict[str, float]], dict[date, float]]:
    """
    Variations de quantité et flux de trésorerie, par date d'exécution.

    Un flux est ce qui entre ou sort de la poche de l'épargnant : un achat le
    creuse du prix payé et des frais, une vente le renfloue du produit net.
    """
    deltas: dict[date, dict[str, float]] = {}
    flux: dict[date, float] = {}

    for t in transactions:
        d = t["executed_at"]
        if hasattr(d, "date"):
            d = d.date()
        q = float(t["quantity"])
        p = float(t["unit_price"])
        f = float(t.get("fees") or 0.0)
        signe = 1.0 if str(t["side"]).upper() == "BUY" else -1.0

        deltas.setdefault(d, {}).setdefault(t["ticker"], 0.0)
        deltas[d][t["ticker"]] += signe * q
        # Les frais pèsent dans les deux sens : ils sortent de la poche.
        flux[d] = flux.get(d, 0.0) + signe * q * p + f

    return deltas, flux


def _cours_du_jour(
    cours: dict[str, dict[date, float]], ticker: str, jour: date, dernier: dict[str, float]
) -> float | None:
    """
    Le cours du jour, à défaut le dernier connu.

    Un jour férié parisien n'annule pas la détention. Reporter le dernier cours
    vaut mieux que trouer la courbe — mais seulement en avant : avant la
    première cotation connue, on ne sait rien et on ne suppose rien.
    """
    p = cours.get(ticker, {}).get(jour)
    if p is not None:
        dernier[ticker] = p
        return p
    return dernier.get(ticker)


def courbe_portefeuille(
    transactions: list[dict],
    cours: dict[str, dict[date, float]],
    jours: Iterable[date],
) -> dict:
    """
    Valeur, capital investi et TWR jour par jour.

    `transactions` porte au minimum ticker, side, quantity, unit_price, fees et
    executed_at. `cours` donne les clôtures par ticker et par jour. `jours` est
    le calendrier retenu, croissant.
    """
    if not transactions:
        return {"points": [], "twr_pct": None, "pnl_eur": None, "start": None}

    deltas, flux = _quantites_et_flux(transactions)
    debut = min(deltas)
    jours = [j for j in jours if j >= debut]
    if not jours:
        return {"points": [], "twr_pct": None, "pnl_eur": None, "start": debut.isoformat()}

    quantites: dict[str, float] = {}
    dernier: dict[str, float] = {}
    investi = 0.0
    facteur = 1.0          # produit des (1 + rendement) de chaque sous-période
    valeur_veille: float | None = None
    points: list[dict] = []

    for jour in jours:
        # Les opérations du jour prennent effet avant la valorisation du soir.
        for ticker, dq in deltas.get(jour, {}).items():
            quantites[ticker] = quantites.get(ticker, 0.0) + dq
        f = flux.get(jour, 0.0)
        investi += f

        valeur = 0.0
        for ticker, q in quantites.items():
            if abs(q) < 1e-12:
                continue
            p = _cours_du_jour(cours, ticker, jour, dernier)
            if p is None:
                continue
            valeur += q * p

        # Rendement de la journée, flux neutralisé. Le premier jour n'a pas de
        # veille : le versement initial constitue la base, il ne rapporte rien.
        r_jour = 0.0
        if valeur_veille is not None and valeur_veille > 1e-9:
            r_jour = (valeur - f) / valeur_veille - 1.0
            facteur *= 1.0 + r_jour
        valeur_veille = valeur

        points.append({
            "date":     jour.isoformat(),
            "value":    round(valeur, 4),
            "invested": round(investi, 4),
            # Conservé pour rechaîner le TWR sur une fenêtre plus courte : le
            # recalculer depuis les valeurs de début et de fin recompterait les
            # versements de la période comme performance.
            "ret":      r_jour,
            # Flux du jour, retenu pour mesurer le rendement de l'épargnant sur
            # une fenêtre : un versement de la veille n'a pas travaillé autant
            # qu'un versement du premier jour.
            "flow":     round(f, 4),
        })

    valeur_finale = points[-1]["value"]
    return {
        "points":   points,
        "start":    debut.isoformat(),
        "twr_pct":  round((facteur - 1.0) * 100, 4),
        "pnl_eur":  round(valeur_finale - investi, 4),
        "invested": round(investi, 4),
    }


def twr_sur_fenetre(points: list[dict], depuis: str) -> float | None:
    """
    TWR restreint aux points à partir de `depuis`, en rechaînant les rendements
    quotidiens.

    Le calculer depuis les valeurs de début et de fin compterait les versements
    de la fenêtre comme performance — c'est précisément l'erreur qu'on corrige.
    """
    fenetre = [p for p in points if p["date"] >= depuis]
    if len(fenetre) < 2:
        return 0.0 if fenetre else None
    facteur = 1.0
    # Le premier point sert de base : son rendement appartient à la veille.
    for p in fenetre[1:]:
        facteur *= 1.0 + p.get("ret", 0.0)
    return round((facteur - 1.0) * 100, 4)


def dietz_sur_fenetre(points: list[dict], depuis: str) -> dict:
    """
    Rendement de l'épargnant sur une fenêtre, méthode de Dietz modifiée.

    Le TWR répond à « comment mes fonds se sont-ils comportés ? ». Celui-ci
    répond à « qu'a rapporté mon argent ? », qui est la question que l'on se
    pose devant son relevé — et les deux diffèrent d'autant plus que les
    versements sont récents.

    Chaque versement est pondéré par la fraction de la période où il a
    travaillé : verser la veille de la clôture ne peut pas peser autant que
    verser le premier jour.
    """
    fenetre = [p for p in points if p["date"] >= depuis]
    if len(fenetre) < 2:
        return {"gain_eur": 0.0, "gain_pct": 0.0 if fenetre else None}

    # La valeur de départ est celle d'avant la fenêtre ; à défaut, le
    # portefeuille commence ici et vaut zéro.
    avant = [p for p in points if p["date"] < depuis]
    v_debut = avant[-1]["value"] if avant else 0.0
    v_fin = fenetre[-1]["value"]

    # Les flux du premier jour de la fenêtre en font partie s'il n'y a pas de
    # veille : sinon le capital initial serait compté comme un gain.
    flux = fenetre if not avant else fenetre[1:]

    # Pondération par le temps réellement écoulé, et non par le rang du point.
    # Les deux coïncident sur un calendrier quotidien, mais divergent dès qu'il
    # comporte des trous — un pont de plusieurs jours y compterait pour un.
    d0 = date.fromisoformat(fenetre[0]["date"])
    d1 = date.fromisoformat(fenetre[-1]["date"])
    duree = (d1 - d0).days or 1

    total_flux = 0.0
    flux_pondere = 0.0
    for p in flux:
        f = p.get("flow", 0.0)
        if not f:
            continue
        ecoule = (date.fromisoformat(p["date"]) - d0).days
        total_flux += f
        flux_pondere += f * max(0.0, (duree - ecoule) / duree)

    base = v_debut + flux_pondere
    gain = v_fin - v_debut - total_flux
    return {
        "gain_eur": round(gain, 4),
        "gain_pct": round(gain / base * 100, 4) if base > 1e-9 else None,
    }
