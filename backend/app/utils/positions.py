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


async def fetch_current_prices(tickers: list[str]) -> dict[str, float]:
    """
    Récupère le dernier prix disponible pour chaque ticker via yfinance.
    Utilise fast_info pour minimiser les appels réseau.
    Silencieux en cas d'échec individuel (ticker inconnu, hors marché, etc.).
    """
    if not tickers:
        return {}

    import asyncio
    from concurrent.futures import ThreadPoolExecutor
    import yfinance as yf

    def _fetch() -> dict[str, float]:
        prices: dict[str, float] = {}
        for ticker in tickers:
            try:
                info  = yf.Ticker(ticker).fast_info
                price = info.last_price
                if price and price > 0:
                    prices[ticker] = float(price)
            except Exception:
                pass
        return prices

    loop = asyncio.get_running_loop()
    with ThreadPoolExecutor(max_workers=4) as pool:
        return await loop.run_in_executor(pool, _fetch)
