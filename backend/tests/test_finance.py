"""
Unit tests for financial computation engine.
Run with: pytest tests/ -v
"""
import numpy as np
import pandas as pd
import pytest

from app.utils.finance import (
    total_return,
    cagr,
    annualized_volatility,
    max_drawdown,
    sharpe_ratio,
    sortino_ratio,
    var_historical,
    portfolio_returns,
    growth_curve,
    drawdown_series,
)


@pytest.fixture
def flat_returns() -> pd.Series:
    """Constant 0.1% daily return."""
    return pd.Series([0.001] * 252)


@pytest.fixture
def zero_returns() -> pd.Series:
    return pd.Series([0.0] * 252)


@pytest.fixture
def sample_returns() -> pd.Series:
    rng = np.random.default_rng(42)
    return pd.Series(rng.normal(0.0004, 0.01, 1260))  # 5 years


# ─── Total return ─────────────────────────────

def test_total_return_positive(flat_returns):
    r = total_return(flat_returns)
    # (1.001)^252 - 1 ≈ 28.4%
    assert abs(r - ((1.001 ** 252) - 1)) < 1e-6


def test_total_return_zero(zero_returns):
    assert total_return(zero_returns) == pytest.approx(0.0, abs=1e-9)


# ─── CAGR ─────────────────────────────────────

def test_cagr_flat(flat_returns):
    c = cagr(flat_returns)
    # With 252 trading days, CAGR ≈ total return for exactly 1 year
    expected = (1.001 ** 252) - 1
    assert abs(c - expected) < 1e-6


def test_cagr_positive(sample_returns):
    c = cagr(sample_returns)
    assert isinstance(c, float)


# ─── Volatility ───────────────────────────────

def test_volatility_scaling(flat_returns):
    # Constant returns → zero volatility
    const = pd.Series([0.005] * 252)
    assert annualized_volatility(const) == pytest.approx(0.0, abs=1e-9)


def test_volatility_positive(sample_returns):
    v = annualized_volatility(sample_returns)
    assert v > 0


# ─── Max Drawdown ─────────────────────────────

def test_max_drawdown_zero_for_monotone():
    # Strictly increasing returns → no drawdown
    increasing = pd.Series([0.01] * 100)
    assert max_drawdown(increasing) == pytest.approx(0.0, abs=1e-6)


def test_max_drawdown_negative(sample_returns):
    mdd = max_drawdown(sample_returns)
    assert mdd <= 0


def test_max_drawdown_simple():
    # +10 % puis −20 % : le cumulé passe de 1,10 à 0,88.
    r = pd.Series([0.10, -0.20])
    # Sommet = 1,10, creux = 0,88 → (0,88 − 1,10) / 1,10 = −0,20.
    #
    # ⚠️ **Ce test attendait −0,1818 et se contredisait lui-même.** Son propre
    # commentaire posait la division par 1,10 — qui donne −0,20 — mais la valeur
    # affirmée correspond à une division par 1,21. Vérifié à part : 0,88 / 1,10
    # = 0,80, soit une chute de vingt pour cent exactement. C'est le test qui
    # avait tort, pas `max_drawdown`, dont l'implémentation est la forme
    # canonique — cumul, maximum courant, écart relatif.
    mdd = max_drawdown(r)
    assert abs(mdd - (-0.20)) < 1e-9


# ─── Sharpe ───────────────────────────────────

def test_sharpe_positive_for_good_returns(flat_returns):
    s = sharpe_ratio(flat_returns, risk_free_rate=0.0)
    assert s > 0


def test_sharpe_zero_for_constant_rf():
    # Return equals risk-free → excess return = 0 → Sharpe ≈ 0
    rf_daily = 0.035 / 252
    returns = pd.Series([rf_daily] * 252)
    s = sharpe_ratio(returns, risk_free_rate=0.035)
    assert abs(s) < 1e-6


# ─── VaR ──────────────────────────────────────

def test_var_historical_negative(sample_returns):
    v = var_historical(sample_returns)
    assert v < 0  # VaR is a loss


def test_var_historical_at_1(sample_returns):
    # 100% confidence → worst day
    v = var_historical(sample_returns, confidence=1.0)
    assert abs(v - sample_returns.min()) < 1e-9


# ─── Portfolio returns ────────────────────────

def test_portfolio_returns_single_asset():
    returns = pd.DataFrame({"A": [0.01, 0.02, -0.01]})
    weights = {"A": 1.0}
    p = portfolio_returns(returns, weights)
    pd.testing.assert_series_equal(p, returns["A"], check_names=False)


def test_portfolio_returns_equal_weights():
    returns = pd.DataFrame({
        "A": [0.02, 0.0, -0.02],
        "B": [0.0, 0.04, 0.02],
    })
    weights = {"A": 0.5, "B": 0.5}
    p = portfolio_returns(returns, weights)
    expected = pd.Series([0.01, 0.02, 0.0])
    # ⚠️ **On compare les Series, pas leurs `.values`.** L'appel passait deux
    # `ndarray` à `assert_series_equal`, qui exige des Series et refuse avant même
    # de regarder les nombres — « Expected type Series, found ndarray ». Les
    # valeurs, elles, étaient égales depuis le début : le test échouait sur sa
    # propre forme, pas sur le résultat de `portfolio_returns`.
    pd.testing.assert_series_equal(p, expected, check_exact=False, atol=1e-9)


# ─── Growth curve ─────────────────────────────

def test_growth_curve_initial_value():
    returns = pd.Series([0.0, 0.0, 0.0], index=pd.date_range("2020-01-01", periods=3))
    curve = growth_curve(returns, initial=10_000.0)
    assert all(abs(v - 10_000.0) < 1e-6 for v in curve.values)


def test_growth_curve_positive_return():
    returns = pd.Series([0.10], index=pd.date_range("2020-01-01", periods=1))
    curve = growth_curve(returns, initial=10_000.0)
    assert abs(curve.iloc[0] - 11_000.0) < 1e-6
