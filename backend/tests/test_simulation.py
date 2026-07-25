"""
Unit tests for the Monte Carlo simulation engines.
Run with: pytest tests/test_simulation.py -v

All fixtures are synthetic so the tests stay deterministic and offline.
"""
import numpy as np
import pandas as pd
import pytest
from scipy import stats

from app.utils.finance import (
    TRADING_DAYS,
    block_bootstrap_log_paths,
    draw_parameter_posterior,
    gbm_log_paths,
    monte_carlo_advanced,
    multivariate_log_paths,
    portfolio_returns,
)


@pytest.fixture
def skewed_returns() -> pd.Series:
    """Simple returns with pronounced negative skew and fat tails."""
    rng = np.random.default_rng(42)
    # Student-t gives fat tails; the shift makes the left tail heavier.
    raw = rng.standard_t(4, size=1260) * 0.008 - 0.0015 * rng.chisquare(1, size=1260)
    return pd.Series(raw + 0.0009)


@pytest.fixture
def two_asset_returns() -> pd.DataFrame:
    """Two assets with a known correlation of 0.6 and different drifts."""
    rng = np.random.default_rng(7)
    n = 1260
    z1 = rng.standard_normal(n)
    z2 = 0.6 * z1 + np.sqrt(1 - 0.6 ** 2) * rng.standard_normal(n)
    return pd.DataFrame({
        "WINNER": 0.0008 + 0.012 * z1,
        "LOSER": -0.0004 + 0.010 * z2,
    })


# ─── GBM drift: regression test for the Itô double-count ──────────

def test_gbm_median_matches_log_drift(skewed_returns):
    """
    The median of a GBM path must be S0 * exp(mu_log * T).

    mu is estimated as mean(log(1+r)), i.e. already in log space. Subtracting
    an Itô correction on top of it would bias the median low by exp(0.5 s^2 T).
    """
    log_returns = np.log1p(skewed_returns)
    n_days = 5 * TRADING_DAYS

    paths = gbm_log_paths(log_returns, n_days, 20_000, np.random.default_rng(1))
    simulated_median = np.median(np.exp(paths[:, -1]))
    expected_median = np.exp(log_returns.mean() * n_days)

    assert simulated_median == pytest.approx(expected_median, rel=0.03)


def test_gbm_discards_higher_moments(skewed_returns):
    """GBM increments are Gaussian by construction: no skew, no excess kurtosis."""
    log_returns = np.log1p(skewed_returns)
    paths = gbm_log_paths(log_returns, 252, 2000, np.random.default_rng(1))
    increments = np.diff(paths, axis=1).ravel()

    assert stats.skew(increments) == pytest.approx(0.0, abs=0.05)
    assert stats.kurtosis(increments) == pytest.approx(0.0, abs=0.05)


# ─── Block bootstrap ──────────────────────────────────────────────

def test_bootstrap_preserves_skew_and_kurtosis(skewed_returns):
    """The whole point of resampling: higher moments survive."""
    log_returns = np.log1p(skewed_returns)
    paths = block_bootstrap_log_paths(log_returns, 252, 2000, np.random.default_rng(1), 21)
    increments = np.diff(paths, axis=1).ravel()

    assert stats.skew(increments) == pytest.approx(stats.skew(log_returns), abs=0.15)
    assert stats.kurtosis(increments) == pytest.approx(stats.kurtosis(log_returns), rel=0.15)


def test_bootstrap_only_draws_observed_values(skewed_returns):
    """Every simulated increment must be an actual historical observation."""
    log_returns = np.log1p(skewed_returns)
    paths = block_bootstrap_log_paths(log_returns, 60, 200, np.random.default_rng(1), 21)
    increments = np.diff(paths, axis=1).ravel()

    assert np.isin(np.round(increments, 12), np.round(log_returns.to_numpy(), 12)).all()


def test_bootstrap_preserves_drift(skewed_returns):
    """Resampling is unbiased, so the drift should match history."""
    log_returns = np.log1p(skewed_returns)
    n_days = 5 * TRADING_DAYS
    paths = block_bootstrap_log_paths(log_returns, n_days, 8000, np.random.default_rng(1), 21)

    assert np.mean(paths[:, -1]) == pytest.approx(log_returns.mean() * n_days, rel=0.05)


# ─── Parameter uncertainty ────────────────────────────────────────

def test_posterior_is_centred_on_the_estimates(skewed_returns):
    log_returns = np.log1p(skewed_returns)
    mu, sigma = draw_parameter_posterior(log_returns, 20_000, np.random.default_rng(1))

    assert mu.mean() == pytest.approx(log_returns.mean(), rel=0.05)
    assert sigma.mean() == pytest.approx(log_returns.std(), rel=0.02)
    # Spread of the drift draws must match the analytical standard error.
    assert mu.std() == pytest.approx(log_returns.std() / np.sqrt(log_returns.size), rel=0.05)


def test_parameter_uncertainty_widens_bands_without_moving_median(skewed_returns):
    log_returns = np.log1p(skewed_returns)
    n_days = 10 * TRADING_DAYS

    fixed = np.exp(gbm_log_paths(log_returns, n_days, 8000, np.random.default_rng(3))[:, -1])
    drawn = np.exp(gbm_log_paths(log_returns, n_days, 8000, np.random.default_rng(3), True)[:, -1])

    width_fixed = np.percentile(fixed, 95) / np.percentile(fixed, 5)
    width_drawn = np.percentile(drawn, 95) / np.percentile(drawn, 5)

    assert width_drawn > 3 * width_fixed
    assert np.median(drawn) == pytest.approx(np.median(fixed), rel=0.15)


def test_parameter_uncertainty_matches_analytical_variance(skewed_returns):
    """
    Var(log S_T) = T^2 * Var(mu) + T * sigma^2.

    The drift term grows as T^2 and dominates at long horizons — the reason
    fixed-parameter bands understate the real uncertainty.
    """
    log_returns = np.log1p(skewed_returns)
    years, n_days = 10, 10 * TRADING_DAYS
    sigma, n_obs = log_returns.std(), log_returns.size

    paths = gbm_log_paths(log_returns, n_days, 20_000, np.random.default_rng(5), True)
    simulated_var = np.var(paths[:, -1])
    expected_var = n_days ** 2 * (sigma ** 2 / n_obs) + n_days * sigma ** 2

    assert simulated_var == pytest.approx(expected_var, rel=0.10)


# ─── Multivariate / Cholesky ──────────────────────────────────────

def test_cholesky_reproduces_correlation(two_asset_returns):
    weights = {"WINNER": 0.5, "LOSER": 0.5}
    rng = np.random.default_rng(11)

    log_df = np.log1p(two_asset_returns)
    target = log_df.corr().to_numpy()[0, 1]

    # Rebuild the increments the way multivariate_log_paths does.
    cov = log_df.cov().to_numpy()
    L = np.linalg.cholesky(cov)
    Z = rng.standard_normal((4000, 252, 2))
    increments = (Z @ L.T).reshape(-1, 2)

    assert np.corrcoef(increments.T)[0, 1] == pytest.approx(target, abs=0.02)
    # Sanity: the fixture really is correlated, so this is a meaningful check.
    assert target > 0.4


def test_multivariate_daily_matches_aggregated_model(two_asset_returns):
    """
    Daily rebalancing is exactly what the aggregated models assume, so the two
    routes must agree.
    """
    weights = {"WINNER": 0.5, "LOSER": 0.5}
    n_days = 5 * TRADING_DAYS

    aggregated = np.log1p(portfolio_returns(two_asset_returns, weights))
    agg_final = np.exp(gbm_log_paths(aggregated, n_days, 8000, np.random.default_rng(9))[:, -1])
    mv_final = np.exp(multivariate_log_paths(
        two_asset_returns, weights, n_days, 8000, np.random.default_rng(9), "daily"
    )[:, -1])

    assert np.median(mv_final) == pytest.approx(np.median(agg_final), rel=0.05)
    assert np.log(mv_final).std() == pytest.approx(np.log(agg_final).std(), rel=0.05)


def test_buy_and_hold_beats_rebalancing_with_divergent_drifts(two_asset_returns):
    """
    With one asset drifting up and the other down, rebalancing keeps buying the
    loser. Buy-and-hold lets the loser shrink away, so it must end higher.
    """
    weights = {"WINNER": 0.5, "LOSER": 0.5}
    n_days = 10 * TRADING_DAYS

    medians = {}
    for policy in ("daily", "annual", "none"):
        final = np.exp(multivariate_log_paths(
            two_asset_returns, weights, n_days, 4000, np.random.default_rng(13), policy
        )[:, -1])
        medians[policy] = np.median(final)

    assert medians["none"] > medians["annual"] > medians["daily"]


def test_multivariate_rejects_unknown_policy(two_asset_returns):
    with pytest.raises(ValueError, match="rebalance"):
        multivariate_log_paths(
            two_asset_returns, {"WINNER": 1.0}, 100, 10, np.random.default_rng(1), "monthly"
        )


# ─── End-to-end result payload ────────────────────────────────────

@pytest.mark.parametrize("model", ["gbm", "bootstrap"])
def test_monte_carlo_advanced_payload(skewed_returns, model):
    result = monte_carlo_advanced(
        skewed_returns,
        horizon_years=5,
        n_simulations=1000,
        initial_investment=10_000.0,
        model=model,
    )

    assert result["model"] == model
    assert result["n_observations"] == len(skewed_returns)
    assert 0.0 <= result["probability_of_loss"] <= 1.0
    assert result["final_values_p5"] < result["final_values_p50"] < result["final_values_p95"]
    assert result["final_values_p1"] <= result["final_values_p5"]
    assert result["expected_shortfall_5"] <= result["final_values_p5"]
    assert 0 <= result["robustness_score"] <= 100
    assert len(result["percentiles"]["p50"]) == 5 * TRADING_DAYS + 1


def test_histogram_bins_are_log_spaced_and_populated(skewed_returns):
    """
    Linear bins collapse a lognormal spread into the first bucket. Log spacing
    keeps the distribution readable, which matters most once parameter
    uncertainty stretches it over orders of magnitude.
    """
    result = monte_carlo_advanced(
        skewed_returns,
        horizon_years=10,
        n_simulations=2000,
        initial_investment=10_000.0,
        model="bootstrap",
        parameter_uncertainty=True,
    )
    bins = result["distribution"]
    populated = [b for b in bins if b["count"] > 0]

    assert len(populated) > len(bins) // 2
    assert max(b["pct"] for b in bins) < 40  # no single bucket swallows everything

    widths = [b["range_max"] - b["range_min"] for b in bins]
    assert widths[-1] > widths[0]  # geometric spacing => widening buckets


def test_unknown_model_is_rejected(skewed_returns):
    with pytest.raises(ValueError, match="model"):
        monte_carlo_advanced(skewed_returns, horizon_years=1, n_simulations=100, model="garch")
