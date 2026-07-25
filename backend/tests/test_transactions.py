"""
Tests rapides du moteur de calcul des positions (compute_positions).

Exécution : python -m pytest backend/tests/test_transactions.py -v
             (depuis la racine du repo, ou : cd backend && python -m pytest tests/ -v)

Ces tests vérifient la logique pure de positions.py sans base de données.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime
from types import SimpleNamespace

from app.utils.positions import (
    compute_positions,
    check_sell_feasible,
    check_delete_feasible,
)


def tx(id, ticker, side, qty, price, fees=0.0, date="2024-01-01"):
    """Fabrique un objet transaction léger (sans ORM)."""
    return SimpleNamespace(
        id=id, ticker=ticker, side=side,
        quantity=qty, unit_price=price, fees=fees,
        executed_at=datetime.fromisoformat(date),
    )


# ── Cas 1 : achat simple ──────────────────────────────────────────────────────
def test_single_buy():
    txs = [tx(1, "AAPL", "BUY", 10, 150.0)]
    pos = compute_positions(txs)
    assert "AAPL" in pos
    assert pos["AAPL"]["quantity"]  == 10.0
    assert pos["AAPL"]["avg_cost"]  == 150.0
    assert pos["AAPL"]["invested"]  == 1500.0


# ── Cas 2 : deux achats — PRU moyen pondéré ──────────────────────────────────
def test_two_buys_pru():
    txs = [
        tx(1, "AAPL", "BUY", 10, 100.0, date="2024-01-01"),  # 10 × 100 = 1000
        tx(2, "AAPL", "BUY", 5,  160.0, date="2024-01-02"),  # 5  × 160 =  800
    ]
    pos = compute_positions(txs)
    # PRU = (10×100 + 5×160) / 15 = 1800/15 = 120.0
    assert pos["AAPL"]["quantity"] == 15.0
    assert abs(pos["AAPL"]["avg_cost"] - 120.0) < 1e-6
    assert abs(pos["AAPL"]["invested"] - 1800.0) < 1e-4


# ── Cas 3 : frais intégrés dans le PRU ───────────────────────────────────────
def test_buy_with_fees():
    txs = [tx(1, "AAPL", "BUY", 10, 100.0, fees=10.0)]
    pos = compute_positions(txs)
    # PRU = (10×100 + 10) / 10 = 1010/10 = 101.0
    assert abs(pos["AAPL"]["avg_cost"] - 101.0) < 1e-6


# ── Cas 4 : vente partielle — PRU inchangé, quantité réduite ─────────────────
def test_partial_sell_pru_unchanged():
    txs = [
        tx(1, "AAPL", "BUY",  10, 100.0, date="2024-01-01"),
        tx(2, "AAPL", "SELL",  4, 130.0, date="2024-01-02"),
    ]
    pos = compute_positions(txs)
    assert pos["AAPL"]["quantity"] == 6.0
    assert abs(pos["AAPL"]["avg_cost"] - 100.0) < 1e-6  # PRU inchangé
    assert abs(pos["AAPL"]["invested"] - 600.0) < 1e-4


# ── Cas 5 : vente totale — position exclue du résultat ───────────────────────
def test_full_sell_removed():
    txs = [
        tx(1, "AAPL", "BUY",  5, 100.0, date="2024-01-01"),
        tx(2, "AAPL", "SELL", 5, 120.0, date="2024-01-02"),
    ]
    pos = compute_positions(txs)
    assert "AAPL" not in pos


# ── Cas 6 : vente > quantité détenue → refus 400 ─────────────────────────────
def test_sell_exceeds_holdings():
    txs = [tx(1, "AAPL", "BUY", 5, 100.0, date="2024-01-01")]
    ok, msg = check_sell_feasible(txs, "AAPL", 10.0, datetime(2024, 1, 2))
    assert not ok
    assert "5" in msg or "insuffisante" in msg.lower()


def test_sell_feasible():
    txs = [tx(1, "AAPL", "BUY", 10, 100.0, date="2024-01-01")]
    ok, msg = check_sell_feasible(txs, "AAPL", 5.0, datetime(2024, 1, 2))
    assert ok


# ── Cas 7 : suppression BUY qui casserait un SELL futur → refus 400 ──────────
def test_delete_buy_breaks_sell():
    txs = [
        tx(1, "AAPL", "BUY",  10, 100.0, date="2024-01-01"),
        tx(2, "AAPL", "SELL",  8, 120.0, date="2024-01-02"),
    ]
    # Supprimer le BUY de 10 laisserait un SELL de 8 sans couverture
    ok, msg = check_delete_feasible(txs, tx_id=1)
    assert not ok
    assert "non couverte" in msg or "impossible" in msg.lower()


def test_delete_buy_no_sell():
    txs = [tx(1, "AAPL", "BUY", 10, 100.0)]
    ok, _ = check_delete_feasible(txs, tx_id=1)
    assert ok


def test_delete_sell_always_ok():
    # Supprimer un SELL ne peut pas rendre une position négative
    txs = [
        tx(1, "AAPL", "BUY",  10, 100.0, date="2024-01-01"),
        tx(2, "AAPL", "SELL",  5, 120.0, date="2024-01-02"),
    ]
    ok, _ = check_delete_feasible(txs, tx_id=2)
    assert ok


# ── Cas 8 : plusieurs tickers indépendants ───────────────────────────────────
def test_multiple_tickers():
    txs = [
        tx(1, "AAPL",   "BUY", 10, 150.0),
        tx(2, "BTC-USD","BUY",  1, 40000.0),
        tx(3, "AAPL",   "SELL", 3, 180.0),
    ]
    pos = compute_positions(txs)
    assert pos["AAPL"]["quantity"]    == 7.0
    assert pos["BTC-USD"]["quantity"] == 1.0
    assert abs(pos["BTC-USD"]["avg_cost"] - 40000.0) < 1e-4
