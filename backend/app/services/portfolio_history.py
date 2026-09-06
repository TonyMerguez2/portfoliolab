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

from datetime import date, datetime, timezone
from typing import Iterable


def _sans_fuseau(v: datetime) -> datetime:
    """
    Ramène un horodatage à UTC sans fuseau.

    Les dates d'exécution viennent de la base et sont naïves ; les horodatages
    des barres viennent de yfinance et portent un fuseau. Python refuse de
    comparer les deux, et ce refus tombait au milieu d'une boucle.
    """
    if v.tzinfo is not None:
        return v.astimezone(timezone.utc).replace(tzinfo=None)
    return v


def courbe_intraday(
    transactions: list[dict],
    cours: dict[str, dict[datetime, float]],
    instants: Iterable[datetime],
    depuis: datetime | None = None,
) -> list[dict]:
    """
    La valeur du portefeuille au fil d'une séance, aux barres intraday.

    Pendant que `courbe_portefeuille` avance de clôture en clôture, celle-ci
    avance de barre en barre. Elle existe parce que la fenêtre « 24 h » n'avait
    que deux clôtures à montrer — la veille et le jour — soit un segment de
    droite là où on attend une journée.

    ⚠️ **`instants` est l'union des horodatages, pas leur intersection.** C'est
    tout l'enjeu : deux titres ne cotent pas aux mêmes instants, et un fonds peu
    traité saute des créneaux entiers. En n'gardant que les instants communs, on
    perdait l'essentiel de la séance — mesuré à 4 points sur les 24 attendus, et
    ce sur trois fonds d'une même place. Ici chaque titre garde son dernier cours
    connu tant qu'il n'en imprime pas de nouveau, et la courbe réagit donc à ceux
    qui cotent sans attendre les autres.

    Le report ne va **qu'en avant**, comme celui de `_cours_du_jour` : tant qu'un
    titre détenu n'a pas imprimé un premier cours, l'instant est passé plutôt que
    valorisé sur une supposition. C'est pour cela que `depuis` existe — la marche
    lit toute la plage pour se constituer des bases, et ne rend que la fin.
    """
    ops = sorted(transactions, key=lambda t: _sans_fuseau(t["executed_at"]))
    borne = _sans_fuseau(depuis) if depuis is not None else None

    i = 0
    quantites: dict[str, float] = {}
    dernier: dict[str, float] = {}
    investi = 0.0
    points: list[dict] = []

    for ts in instants:
        nu = _sans_fuseau(ts)

        while i < len(ops) and _sans_fuseau(ops[i]["executed_at"]) <= nu:
            t = ops[i]
            signe = 1.0 if str(t["side"]).upper() == "BUY" else -1.0
            quantites[t["ticker"]] = quantites.get(t["ticker"], 0.0) + signe * float(t["quantity"])
            # Le capital engagé, cumulé comme dans `courbe_portefeuille` : c'est
            # lui qui permet à l'affichage de retirer les versements de la courbe.
            # Sans cela, un renforcement fait un mur que l'échelle doit contenir,
            # et les mouvements de marché deviennent invisibles à côté.
            investi += signe * float(t["quantity"]) * float(t["unit_price"]) + float(t.get("fees") or 0.0)
            i += 1

        for tk, barres in cours.items():
            p = barres.get(ts)
            if p is not None:
                dernier[tk] = p

        detenus = {tk: q for tk, q in quantites.items() if abs(q) > 1e-9}
        if not detenus or any(tk not in dernier for tk in detenus):
            continue
        if borne is not None and nu < borne:
            continue

        valeur = sum(q * dernier[tk] for tk, q in detenus.items())
        points.append({"date": ts.isoformat(), "value": round(valeur, 2),
                       "invested": round(investi, 2)})

    return points


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
        return {"points": [], "twr_pct": None, "pnl_eur": None, "start": None, "sans_cours": []}

    deltas, flux = _quantites_et_flux(transactions)
    debut = min(deltas)
    jours = [j for j in jours if j >= debut]
    if not jours:
        return {"points": [], "twr_pct": None, "pnl_eur": None,
                "start": debut.isoformat(), "sans_cours": []}

    quantites: dict[str, float] = {}
    dernier: dict[str, float] = {}
    investi = 0.0
    facteur = 1.0          # produit des (1 + rendement) de chaque sous-période
    valeur_veille: float | None = None
    points: list[dict] = []
    # Titres détenus dont aucun cours n'a pu être établi. Leur absence rend la
    # courbe fausse, pas seulement incomplète : l'appelant doit pouvoir le
    # savoir plutôt que d'afficher une perte inventée.
    sans_cours: set[str] = set()

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
                # Un titre détenu sans cours connu ne vaut pas zéro : il vaut
                # une valeur qu'on ignore. L'omettre de la somme produisait une
                # courbe muette et fausse — sur un téléchargement partiel, un
                # portefeuille de 5 134 € s'affichait à 1 568 €, soit une perte
                # de 3 392 € qui n'existait pas.
                sans_cours.add(ticker)
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
        "points":     points,
        "start":      debut.isoformat(),
        "twr_pct":    round((facteur - 1.0) * 100, 4),
        "pnl_eur":    round(valeur_finale - investi, 4),
        "invested":   round(investi, 4),
        "sans_cours": sorted(sans_cours),
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
    Gain de l'épargnant sur une fenêtre : en euros, et rapporté au capital
    engagé.

    Le TWR répond à « comment mes fonds se sont-ils comportés ? ». Celui-ci
    répond à « qu'a rapporté mon argent ? », qui est la question que l'on se
    pose devant son relevé.

    Le pourcentage rapporte le gain au capital réellement déployé — valeur de
    début plus versements. C'est le calcul que fait l'épargnant de tête :
    175 € gagnés sur 4 960 € versés font 3,5 %. La méthode de Dietz, qui
    pondère chaque versement par son temps de présence, donnerait ici 8,4 % :
    plus juste comme *taux*, mais incomparable au repère et étranger à ce
    qu'on lit sur son relevé. Elle reste calculée, sous son propre nom.
    """
    fenetre = [p for p in points if p["date"] >= depuis]
    avant = [p for p in points if p["date"] < depuis]
    # Deux bornes suffisent, et la veille en est une : une fenêtre d'un seul
    # point se mesure très bien dès lors qu'on sait ce que valait le
    # portefeuille juste avant. Exiger deux points *dans* la fenêtre rendait
    # zéro sur 24 heures — le cas le plus fréquent, puisqu'une journée ne
    # compte qu'une séance.
    if not fenetre or (len(fenetre) < 2 and not avant):
        return {"gain_eur": 0.0, "gain_pct": 0.0 if fenetre else None}

    # La valeur de départ est celle d'avant la fenêtre ; à défaut, le
    # portefeuille commence ici et vaut zéro.
    v_debut = avant[-1]["value"] if avant else 0.0
    v_fin = fenetre[-1]["value"]

    # Tous les flux de la fenêtre comptent, y compris ceux de son premier jour.
    #
    # Ils étaient exclus quand une veille existait, pour éviter de compter le
    # capital initial comme un gain. Mais `v_debut` est la clôture de la
    # veille : elle ne peut pas contenir un versement du lendemain. Les
    # retrancher deux fois était impossible, les oublier une fois l'était — un
    # dépôt le premier jour de la fenêtre passait alors pour de la performance.
    flux = fenetre

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

    gain = v_fin - v_debut - total_flux
    # Capital engagé : ce qu'on a mis sur la table. Le repère est mesuré sur la
    # même base, sans quoi les deux pourcentages ne se compareraient pas.
    engage = v_debut + total_flux
    # Base pondérée par le temps de présence, pour le taux au sens de Dietz.
    base_dietz = v_debut + flux_pondere
    return {
        "gain_eur":  round(gain, 4),
        "gain_pct":  round(gain / engage * 100, 4) if engage > 1e-9 else None,
        "taux_pct":  round(gain / base_dietz * 100, 4) if base_dietz > 1e-9 else None,
    }


def gains_par_ligne(
    transactions: list[dict],
    cours: dict[str, dict[date, float]],
    jours: Iterable[date],
    depuis: str,
) -> dict[str, dict]:
    """
    Le gain de l'épargnant sur la fenêtre, **ligne par ligne** — la même mesure que
    `dietz_sur_fenetre`, découpée par titre. La somme des lignes est le gain du portefeuille.

    ⚠️ **Pourquoi cette fonction existe : les cartes annonçaient +615 € sur six mois pour un
    portefeuille qui n'a gagné que +318 € depuis février.** Chaque carte appliquait la hausse du
    cours sur six mois à la quantité détenue *aujourd'hui* — dont l'essentiel a été acheté en
    mai, juin et juillet, à des prix déjà montés. La hausse de mars à mai était comptée comme un
    gain sur des parts qu'on ne possédait pas encore. Mesuré sur ESE.PA : +444 € affichés, +234 €
    réels. Le bandeau, qui additionne les cartes, héritait du même chiffre, et le sélecteur de
    période, calculé ici, en disait un autre.

    ⚠️ **Même base que le gain du portefeuille, au jour près.** `depuis` est le premier jour de
    *mesure* ; la valeur d'ouverture est celle du dernier jour du calendrier qui le précède, et
    les opérations de ce jour-là — ou d'avant — sont dans cette valeur, pas dans les flux. C'est
    exactement le découpage de `dietz_sur_fenetre` : les deux ne peuvent se sommer qu'à cette
    condition, et un test le vérifie.

    ⚠️ **Sans veille, la ligne commence à zéro** et toutes ses opérations sont des flux : c'est le
    cas de « Max », et le gain vaut alors valeur moins capital versé — la plus-value que la page
    connaît déjà. Une ligne dont un cours manque à l'une des deux bornes est omise plutôt que
    chiffrée à zéro.
    """
    jours = sorted(jours)
    fenetre = [j for j in jours if j.isoformat() >= depuis]
    if not fenetre:
        return {}
    avant = [j for j in jours if j.isoformat() < depuis]
    base = avant[-1] if avant else None
    fin = fenetre[-1]

    def cours_le(ticker: str, jour: date) -> float | None:
        serie = cours.get(ticker, {})
        anterieurs = [j for j in serie if j <= jour]
        return serie[max(anterieurs)] if anterieurs else None

    lignes: dict[str, dict[str, float]] = {}
    for t in transactions:
        d = t["executed_at"]
        if hasattr(d, "date"):
            d = d.date()
        q = float(t["quantity"])
        prix = float(t["unit_price"])
        frais = float(t.get("fees") or 0.0)
        signe = 1.0 if str(t["side"]).upper() == "BUY" else -1.0
        e = lignes.setdefault(t["ticker"], {"q_debut": 0.0, "q_fin": 0.0, "flux": 0.0})
        e["q_fin"] += signe * q
        if base is not None and d <= base:
            e["q_debut"] += signe * q
        else:
            e["flux"] += signe * q * prix + frais

    resultat: dict[str, dict] = {}
    for ticker, e in lignes.items():
        if abs(e["q_fin"]) < 1e-9:
            continue
        p_fin = cours_le(ticker, fin)
        if p_fin is None:
            continue
        v_debut = 0.0
        if base is not None and abs(e["q_debut"]) > 1e-9:
            p_debut = cours_le(ticker, base)
            if p_debut is None:
                continue
            v_debut = e["q_debut"] * p_debut
        v_fin = e["q_fin"] * p_fin
        gain = v_fin - v_debut - e["flux"]
        engage = v_debut + e["flux"]
        resultat[ticker] = {
            "gain_eur": round(gain, 4),
            "gain_pct": round(gain / engage * 100, 4) if engage > 1e-9 else None,
            "value":    round(v_fin, 4),
        }
    return resultat


def simuler_benchmark(
    points: list[dict],
    cours_repere: dict[date, float],
    depuis: str,
) -> dict:
    """
    Rejoue les mêmes versements, aux mêmes dates, sur un indice.

    Comparer deux pourcentages ne dit pas grand-chose quand les versements sont
    étalés : « mes fonds ont fait +9 %, l'indice +8 % » laisse ouvert ce que
    l'épargnant aurait réellement eu. Rejouer ses flux répond en euros, sur le
    même calendrier et avec le même étalement — la seule comparaison qui parle.

    Sur une fenêtre courte, le capital déjà présent compte autant que les
    versements de la période. Ne rejouer que les flux internes revenait à
    n'avoir rien à comparer dès qu'aucune opération n'était passée : sur
    24 heures, ou sur un mois sans versement, `verse` valait zéro, la fonction
    renonçait, et le bloc disparaissait de l'écran. La valeur d'ouverture est
    donc convertie en parts de l'indice à sa date, comme si elle y avait été
    placée la veille.

    La base est la même que celle de `dietz_sur_fenetre` — valeur d'ouverture
    plus versements — sans quoi les deux nombres affichés côte à côte ne se
    compareraient pas.
    """
    fenetre = [p for p in points if p["date"] >= depuis]
    if not fenetre:
        return {"value": None, "gain_eur": None, "gain_pct": None}
    avant = [p for p in points if p["date"] < depuis]

    def cours_le(jour: date) -> float | None:
        p = cours_repere.get(jour)
        if p is not None:
            return p
        # Dernière cotation connue avant ce jour : les places ne cotent pas les
        # mêmes jours fériés, et un versement un lundi férié à New York reste
        # un versement.
        anterieurs = [d for d in cours_repere if d <= jour]
        return cours_repere[max(anterieurs)] if anterieurs else None

    quantite = 0.0
    verse = 0.0

    # Le capital d'ouverture, placé sur l'indice à la veille de la fenêtre.
    # Sur la fenêtre complète il n'y a pas de veille : le portefeuille commence
    # là, `avant` est vide, et le calcul se réduit à l'ancien.
    if avant:
        v_debut = avant[-1]["value"] or 0.0
        prix_debut = cours_le(date.fromisoformat(avant[-1]["date"]))
        if v_debut > 0 and prix_debut:
            quantite += v_debut / prix_debut
            verse += v_debut

    for p in fenetre:
        f = p.get("flow", 0.0)
        if not f:
            continue
        prix = cours_le(date.fromisoformat(p["date"]))
        if not prix:
            continue
        quantite += f / prix
        verse += f

    prix_fin = cours_le(date.fromisoformat(fenetre[-1]["date"]))
    if not prix_fin or verse <= 0:
        return {"value": None, "gain_eur": None, "gain_pct": None}

    valeur = quantite * prix_fin
    return {
        "value":    round(valeur, 4),
        "gain_eur": round(valeur - verse, 4),
        "gain_pct": round((valeur / verse - 1.0) * 100, 4),
    }
