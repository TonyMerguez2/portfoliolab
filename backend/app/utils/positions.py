"""
Calcul des positions à partir des transactions (méthode du coût moyen pondéré).

Règles PRU :
- BUY  → nouveau_PRU = (qty_avant × PRU_avant + qty × prix + frais) / (qty_avant + qty)
- SELL → PRU inchangé, quantité réduite
"""
from __future__ import annotations

from datetime import datetime


def compute_positions(transactions: list) -> dict[str, dict]:
    """
    Construit les positions nettes à partir d'une liste de Transaction ORM.

    Retourne { ticker: { quantity, avg_cost, invested } } pour qty > 0 seulement.
    Les transactions doivent couvrir un seul portfolio (pas de filtre interne).
    """
    positions: dict[str, dict] = {}

    for tx in sorted(transactions, key=lambda t: (t.executed_at, t.id)):
        ticker = tx.ticker
        if ticker not in positions:
            positions[ticker] = {"quantity": 0.0, "avg_cost": 0.0}

        pos = positions[ticker]

        if tx.side == "BUY":
            prev_qty   = pos["quantity"]
            prev_pru   = pos["avg_cost"]
            buy_total  = tx.quantity * tx.unit_price + (tx.fees or 0.0)
            new_qty    = prev_qty + tx.quantity
            pos["avg_cost"] = (prev_qty * prev_pru + buy_total) / new_qty if new_qty else 0.0
            pos["quantity"] = new_qty
        else:  # SELL
            pos["quantity"] -= tx.quantity

    return {
        ticker: {**pos, "invested": round(pos["quantity"] * pos["avg_cost"], 6)}
        for ticker, pos in positions.items()
        if pos["quantity"] > 1e-9
    }


def quantity_held_at(transactions: list, ticker: str, at_date: datetime) -> float:
    """Quantité nette détenue d'un ticker à une date donnée (incluse)."""
    held = 0.0
    for tx in sorted(transactions, key=lambda t: (t.executed_at, t.id)):
        if tx.ticker == ticker and tx.executed_at <= at_date:
            held += tx.quantity if tx.side == "BUY" else -tx.quantity
    return held


def check_sell_feasible(
    transactions: list,
    ticker: str,
    quantity: float,
    at_date: datetime,
) -> tuple[bool, str]:
    """
    Vérifie qu'un SELL de `quantity` à `at_date` est couvert par les BUY antérieurs.
    Retourne (ok, message_erreur).
    """
    held = quantity_held_at(transactions, ticker, at_date)
    if held < quantity - 1e-9:
        return False, (
            f"Quantité insuffisante : vous détenez {held:.4f} {ticker} "
            f"à cette date, impossible de vendre {quantity:.4f}."
        )
    return True, ""


def check_delete_feasible(
    transactions: list,
    tx_id: int,
) -> tuple[bool, str]:
    """
    Vérifie que supprimer la transaction `tx_id` ne met pas la position en négatif
    à une date ultérieure (uniquement pertinent pour les BUY).
    Retourne (ok, message_erreur).
    """
    tx_to_del = next((t for t in transactions if t.id == tx_id), None)
    if tx_to_del is None or tx_to_del.side != "BUY":
        return True, ""

    ticker    = tx_to_del.ticker
    remaining = sorted(
        [t for t in transactions if t.id != tx_id and t.ticker == ticker],
        key=lambda t: (t.executed_at, t.id),
    )

    held = 0.0
    for tx in remaining:
        if tx.side == "BUY":
            held += tx.quantity
        else:
            held -= tx.quantity
            if held < -1e-9:
                return False, (
                    f"Suppression impossible : une vente de {tx.quantity} {ticker} "
                    f"le {tx.executed_at.date()} deviendrait non couverte "
                    f"(position résultante : {held:.4f})."
                )
    return True, ""


def fetch_current_prices_sync(tickers: list[str]) -> dict[str, float]:
    """
    La même chose, sans boucle d'événements.

    ⚠️ **Pour les routes qui redeviennent synchrones.** Une route `async def` s'exécute *sur*
    la boucle d'événements ; tout appel bloquant qu'elle contient — et yfinance en est un —
    la retient. Mesuré sur le serveur : le même téléchargement prenait 0,3 s dans un
    processus nu et de 40 à 90 s sous uvicorn, le processus passant tout son temps dans
    `curl_cffi`. Une route `def` est confiée par FastAPI à un fil d'exécution séparé, où
    bloquer ne gêne personne. Voir `get_history`.
    """
    if not tickers:
        return {}
    from concurrent.futures import ThreadPoolExecutor
    import yfinance as yf

    def _un(ticker: str) -> tuple[str, float] | None:
        try:
            price = yf.Ticker(ticker).fast_info.get("lastPrice")
            return (ticker, float(price)) if price and price > 0 else None
        except Exception:
            return None

    with ThreadPoolExecutor(max_workers=min(8, len(tickers))) as pool:
        obtenus = list(pool.map(_un, tickers))
    return dict(p for p in obtenus if p)


async def fetch_current_prices(tickers: list[str]) -> dict[str, float]:
    """
    Récupère le dernier prix disponible pour chaque ticker via yfinance.
    Utilise fast_info pour minimiser les appels réseau.
    Silencieux en cas d'échec individuel (ticker inconnu, hors marché, etc.).

    Les tickers sont interrogés de front. La version précédente ouvrait bien
    quatre fils, mais ne leur soumettait qu'une seule tâche qui bouclait sur
    les tickers : les trois autres ouvriers n'ont jamais rien fait, et chaque
    aller-retour attendait le précédent. Mesuré à environ 300 ms par ticker en
    série — le premier prix du lot avait donc vieilli d'autant quand le
    dernier arrivait.

    Le plafond de huit borne les requêtes simultanées : yfinance est une porte
    non officielle, et la marteler fait bien plus de dégâts qu'un dixième de
    seconde gagné.
    """
    if not tickers:
        return {}

    import asyncio
    from concurrent.futures import ThreadPoolExecutor
    import yfinance as yf

    def _un(ticker: str) -> tuple[str, float] | None:
        try:
            price = yf.Ticker(ticker).fast_info.last_price
            return (ticker, float(price)) if price and price > 0 else None
        except Exception:
            return None

    loop = asyncio.get_running_loop()
    with ThreadPoolExecutor(max_workers=min(8, len(tickers))) as pool:
        obtenus = await asyncio.gather(
            *(loop.run_in_executor(pool, _un, t) for t in tickers)
        )
    return dict(p for p in obtenus if p)
