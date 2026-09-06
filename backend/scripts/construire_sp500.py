"""Constitue la table des composants du S&P 500, pour la carte de chaleur.

Écrit `app/data/sp500.json` : ticker → { nom, secteur, actions }.

    backend/venv/bin/python3 backend/scripts/construire_sp500.py

⚠️ **Ce script existe parce que la moitié des données ne se récupère pas par
lots, et l'autre moitié si.** Mesuré avant d'écrire une ligne, sur trente
titres : `yf.download` rend les cours de trente tickers en **1,2 seconde**,
tandis que `fast_info` et `.info` sont un aller-retour HTTP **par titre** — une
demi-seconde chacun, soit plus de quatre minutes pour cinq cents. Une carte qui
irait chercher secteur et capitalisation à chaque affichage serait donc hors
d'usage.

⚠️ **Or ce qui est lent est précisément ce qui ne bouge pas.** Un secteur GICS
ne change jamais ; un nombre d'actions en circulation change quelques fois par
an, au gré des rachats et des émissions. Ces deux-là se relèvent donc **une
fois** et se rangent ici. La capitalisation, elle, ne se range pas : elle se
recalcule à l'affichage — actions × cours — et suit donc le marché à la seconde
sans un appel de plus.

⚠️ **La liste vient de Wikipédia et non du fournisseur, faute de mieux.** FMP
publie bien un point d'entrée `sp500-constituent`, mais il répond **402** avec
la clé du projet : il n'est pas compris dans l'abonnement. Vérifié aussi pour
les cotations groupées — `batch-quote` et `quote` multi-symboles sont tous deux
restreints. Wikipédia rend les 503 lignes en trois dixièmes de seconde, avec le
nom et le secteur GICS, ce qui économise au passage les cinq cents appels
`.info` qu'il aurait fallu pour les secteurs seuls.

⚠️ **Le tableau est daté, et c'est assumé.** Un composant entre ou sort de
l'indice quelques fois par an. Relancer ce script suffit ; entre deux passages,
un titre sorti reste affiché et un titre entré manque. C'est un décalage de
semaines sur une composition, pas une erreur de cours.
"""

from __future__ import annotations

import io
import json
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd
import yfinance as yf

SOURCE = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
SORTIE = Path(__file__).resolve().parent.parent / "app" / "data" / "sp500.json"

# ⚠️ Sans en-tête d'agent, Wikipédia répond 403 — constaté. `pandas.read_html`
# ne permet pas d'en poser un, d'où la récupération à la main avant l'analyse.
AGENT = {"User-Agent": "Mozilla/5.0 (compatible; PortfolioLab/1.0)"}


def constituants() -> list[dict]:
    """Le tableau de Wikipédia : ticker, nom, secteur GICS."""
    requete = urllib.request.Request(SOURCE, headers=AGENT)
    html = urllib.request.urlopen(requete, timeout=30).read().decode()
    table = pd.read_html(io.StringIO(html))[0]
    lignes = []
    for _, r in table.iterrows():
        # ⚠️ Wikipédia écrit les actions de catégorie avec un point — « BRK.B »,
        # « BF.B » — là où Yahoo attend un tiret. Deux titres sur cinq cents, et
        # ils manquent en silence : `yf.download` rend simplement une colonne
        # vide, sans lever.
        ticker = str(r["Symbol"]).strip().replace(".", "-")
        lignes.append({
            "ticker": ticker,
            "nom": str(r["Security"]).strip(),
            "secteur": str(r["GICS Sector"]).strip(),
        })
    return lignes


def actions_en_circulation(tickers: list[str]) -> dict[str, float]:
    """Le nombre d'actions de chaque titre, relevé un par un et en parallèle."""
    resultat: dict[str, float] = {}

    def une(t: str) -> None:
        try:
            n = yf.Ticker(t).fast_info.shares
            if n:
                resultat[t] = float(n)
        except Exception:
            # Un titre sans nombre d'actions sera simplement absent de la carte :
            # mieux vaut une tuile manquante qu'une tuile dimensionnée au hasard.
            pass

    # ⚠️ Douze fils et non davantage. À vingt, Yahoo commence à rendre des
    # réponses vides sans erreur — le titre paraît alors dépourvu d'actions, et
    # le défaut se lit comme une donnée manquante plutôt que comme un
    # étranglement.
    with ThreadPoolExecutor(max_workers=12) as pool:
        list(pool.map(une, tickers))
    return resultat


def main() -> int:
    t0 = time.time()
    lignes = constituants()
    print(f"Wikipédia : {len(lignes)} composants, {len({l['secteur'] for l in lignes})} secteurs")

    tickers = [l["ticker"] for l in lignes]
    actions = actions_en_circulation(tickers)
    print(f"Actions en circulation : {len(actions)}/{len(tickers)} relevées en {time.time() - t0:.0f}s")

    table = {}
    manquants = []
    for l in lignes:
        n = actions.get(l["ticker"])
        if n is None:
            manquants.append(l["ticker"])
            continue
        table[l["ticker"]] = {"nom": l["nom"], "secteur": l["secteur"], "actions": n}

    if manquants:
        print(f"Sans nombre d'actions, donc écartés ({len(manquants)}) : {', '.join(manquants)}")

    SORTIE.parent.mkdir(parents=True, exist_ok=True)
    SORTIE.write_text(json.dumps(table, ensure_ascii=False, indent=1, sort_keys=True))
    print(f"Écrit {SORTIE} — {len(table)} titres, {SORTIE.stat().st_size // 1024} Ko")
    return 0


if __name__ == "__main__":
    sys.exit(main())
