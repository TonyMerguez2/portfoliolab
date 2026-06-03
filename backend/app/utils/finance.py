"""
Financial computation engine.

All formulas are documented in docs/FORMULAS.md.
This module is pure functional — no I/O, no side effects.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats
from scipy.optimize import minimize

TRADING_DAYS = 252


# ──────────────────────────────────────────────
# Portfolio returns
# ──────────────────────────────────────────────

def portfolio_returns(
    returns: pd.DataFrame,
    weights: dict[str, float],
) -> pd.Series:
    """
    Compute daily portfolio returns from asset returns and weights.

    Parameters
    ----------
    returns : pd.DataFrame
        Daily simple returns, columns = tickers.
    weights : dict
        {ticker: weight_as_fraction} — must sum to 1.0.
    """
    w = pd.Series(weights)
    # Align tickers
    common = returns.columns.intersection(w.index)
    w = w[common] / w[common].sum()   # renormalize to handle missing assets
    return (returns[common] * w).sum(axis=1)


# ──────────────────────────────────────────────
# Core metrics
# ──────────────────────────────────────────────

def total_return(returns: pd.Series) -> float:
    """Cumulative total return: ∏(1+r) - 1."""
    return float((1 + returns).prod() - 1)


def cagr(returns: pd.Series) -> float:
    """
    Compound Annual Growth Rate.
    CAGR = (1 + R_total)^(252/T) - 1
    """
    n_days = len(returns)
    if n_days == 0:
        return 0.0
    cum = (1 + returns).prod()
    years = n_days / TRADING_DAYS
    return float(cum ** (1 / years) - 1)


def annualized_volatility(returns: pd.Series) -> float:
    """σ_annual = σ_daily × √252."""
    return float(returns.std() * np.sqrt(TRADING_DAYS))


def max_drawdown(returns: pd.Series) -> float:
    """
    Maximum peak-to-trough decline.
    Returns a negative float (e.g. -0.32 = -32%).
    """
    cumulative = (1 + returns).cumprod()
    rolling_max = cumulative.cummax()
    drawdown = (cumulative - rolling_max) / rolling_max
    return float(drawdown.min())


def drawdown_series(returns: pd.Series) -> pd.Series:
    """Full drawdown time series (negative values)."""
    cumulative = (1 + returns).cumprod()
    rolling_max = cumulative.cummax()
    return (cumulative - rolling_max) / rolling_max


def sharpe_ratio(returns: pd.Series, risk_free_rate: float = 0.035) -> float:
    """
    Annualized Sharpe ratio.
    S = (E[r_p - r_f]) / σ × √252
    """
    daily_rf = risk_free_rate / TRADING_DAYS
    excess = returns - daily_rf
    if excess.std() == 0:
        return 0.0
    return float(excess.mean() / excess.std() * np.sqrt(TRADING_DAYS))


def sortino_ratio(returns: pd.Series, risk_free_rate: float = 0.035) -> float:
    """
    Sortino ratio — uses downside deviation only.
    """
    daily_rf = risk_free_rate / TRADING_DAYS
    excess = returns - daily_rf
    downside = excess[excess < 0]
    if len(downside) == 0 or downside.std() == 0:
        return 0.0
    downside_vol = np.sqrt((downside ** 2).mean()) * np.sqrt(TRADING_DAYS)
    ann_excess = excess.mean() * TRADING_DAYS
    return float(ann_excess / downside_vol)


def calmar_ratio(returns: pd.Series) -> float:
    """Calmar = CAGR / |MDD|"""
    mdd = max_drawdown(returns)
    if mdd == 0:
        return 0.0
    return float(cagr(returns) / abs(mdd))


def var_historical(returns: pd.Series, confidence: float = 0.95) -> float:
    """
    Historical VaR at given confidence level.
    Returns negative float (daily loss).
    """
    return float(np.percentile(returns, (1 - confidence) * 100))


def var_parametric(returns: pd.Series, confidence: float = 0.95) -> float:
    """
    Parametric (Gaussian) VaR.
    VaR = -(μ + z_α × σ)
    """
    mu = returns.mean()
    sigma = returns.std()
    z = stats.norm.ppf(1 - confidence)
    return float(mu + z * sigma)


def monthly_returns(returns: pd.Series) -> pd.Series:
    """Aggregate daily returns to monthly."""
    return (1 + returns).resample("ME").prod() - 1


def growth_curve(
    returns: pd.Series,
    initial: float = 10_000.0,
) -> pd.Series:
    """
    Portfolio value over time starting from `initial`.
    Returns a pd.Series indexed by date.
    """
    cumulative = (1 + returns).cumprod()
    return cumulative * initial


# ──────────────────────────────────────────────
# Correlation matrix
# ──────────────────────────────────────────────

def correlation_matrix(returns: pd.DataFrame) -> pd.DataFrame:
    """Pairwise Pearson correlation of all assets."""
    return returns.corr()


# ──────────────────────────────────────────────
# Full metrics bundle
# ──────────────────────────────────────────────

def compute_all_metrics(
    returns: pd.Series,
    risk_free_rate: float = 0.035,
) -> dict:
    """
    Compute all scalar performance metrics for a return series.
    Returns a dict matching PerformanceMetrics schema.
    """
    return {
        "total_return": total_return(returns),
        "cagr": cagr(returns),
        "annualized_volatility": annualized_volatility(returns),
        "max_drawdown": max_drawdown(returns),
        "sharpe_ratio": sharpe_ratio(returns, risk_free_rate),
        "sortino_ratio": sortino_ratio(returns, risk_free_rate),
        "calmar_ratio": calmar_ratio(returns),
        "var_95_historical": var_historical(returns),
        "var_95_parametric": var_parametric(returns),
        "best_day": float(returns.max()),
        "worst_day": float(returns.min()),
        "positive_days_pct": float((returns > 0).mean()),
    }


# ──────────────────────────────────────────────
# Efficient Frontier (Markowitz)
# ──────────────────────────────────────────────

def efficient_frontier(
    returns: pd.DataFrame,
    risk_free_rate: float = 0.035,
    n_portfolios: int = 200,
) -> dict:
    """
    Compute the efficient frontier via mean-variance optimization.

    Parameters
    ----------
    returns : pd.DataFrame
        Daily asset returns.
    risk_free_rate : float
        Annual risk-free rate.
    n_portfolios : int
        Number of points on the frontier.

    Returns
    -------
    dict with keys: frontier, max_sharpe, min_variance
    """
    n = len(returns.columns)
    tickers = list(returns.columns)

    # Annualized expected returns and covariance
    mu = returns.mean() * TRADING_DAYS          # shape (n,)
    cov = returns.cov() * TRADING_DAYS          # shape (n, n)

    def portfolio_stats(w: np.ndarray) -> tuple[float, float]:
        w = np.array(w)
        ret = float(np.dot(w, mu))
        vol = float(np.sqrt(w @ cov.values @ w))
        return ret, vol

    def neg_sharpe(w: np.ndarray) -> float:
        ret, vol = portfolio_stats(w)
        return -(ret - risk_free_rate) / vol if vol > 0 else 0.0

    def portfolio_vol(w: np.ndarray) -> float:
        return portfolio_stats(w)[1]

    constraints = [{"type": "eq", "fun": lambda w: np.sum(w) - 1}]
    bounds = [(0, 1)] * n
    w0 = np.ones(n) / n

    # Max Sharpe
    res_sharpe = minimize(
        neg_sharpe, w0,
        method="SLSQP",
        bounds=bounds,
        constraints=constraints,
        options={"maxiter": 1000, "ftol": 1e-9},
    )
    w_max_sharpe = res_sharpe.x
    r_ms, v_ms = portfolio_stats(w_max_sharpe)

    # Min Variance
    res_minvol = minimize(
        portfolio_vol, w0,
        method="SLSQP",
        bounds=bounds,
        constraints=constraints,
        options={"maxiter": 1000, "ftol": 1e-9},
    )
    w_min_vol = res_minvol.x
    r_mv, v_mv = portfolio_stats(w_min_vol)

    # Frontier: sweep target returns
    target_returns = np.linspace(
        float(mu.min()) * 0.8,
        float(mu.max()) * 1.2,
        n_portfolios,
    )

    frontier = []
    for target in target_returns:
        cons = constraints + [
            {"type": "eq", "fun": lambda w, t=target: np.dot(w, mu) - t}
        ]
        res = minimize(
            portfolio_vol, w0,
            method="SLSQP",
            bounds=bounds,
            constraints=cons,
            options={"maxiter": 500},
        )
        if res.success:
            r, v = portfolio_stats(res.x)
            s = (r - risk_free_rate) / v if v > 0 else 0
            frontier.append({
                "volatility": v,
                "expected_return": r,
                "sharpe": s,
                "weights": {t: float(w) for t, w in zip(tickers, res.x)},
            })

    def _fmt_portfolio(w: np.ndarray, r: float, v: float) -> dict:
        s = (r - risk_free_rate) / v if v > 0 else 0
        return {
            "volatility": v,
            "expected_return": r,
            "sharpe": s,
            "weights": {t: float(wi) for t, wi in zip(tickers, w)},
        }

    # Individual assets for scatter
    individual = []
    for i, t in enumerate(tickers):
        w_single = np.zeros(n)
        w_single[i] = 1.0
        r, v = portfolio_stats(w_single)
        individual.append({"ticker": t, "volatility": v, "expected_return": r})

    return {
        "frontier": frontier,
        "max_sharpe_portfolio": _fmt_portfolio(w_max_sharpe, r_ms, v_ms),
        "min_variance_portfolio": _fmt_portfolio(w_min_vol, r_mv, v_mv),
        "individual_assets": individual,
    }


# ──────────────────────────────────────────────
# Monte Carlo
# ──────────────────────────────────────────────

def monte_carlo(
    portfolio_returns_series: pd.Series,
    horizon_years: int = 5,
    n_simulations: int = 500,
    initial_investment: float = 10_000.0,
) -> dict:
    """
    Project portfolio using Geometric Brownian Motion.

    Parameters estimated from historical portfolio returns.
    """
    log_returns = np.log(1 + portfolio_returns_series)
    mu_daily = float(log_returns.mean())
    sigma_daily = float(log_returns.std())

    n_days = horizon_years * TRADING_DAYS
    dt = 1  # 1 trading day

    # Simulate: shape (n_simulations, n_days)
    rng = np.random.default_rng(42)
    Z = rng.standard_normal((n_simulations, n_days))
    drift = (mu_daily - 0.5 * sigma_daily ** 2) * dt
    diffusion = sigma_daily * np.sqrt(dt) * Z

    log_paths = np.cumsum(drift + diffusion, axis=1)
    # Prepend zeros (initial value)
    log_paths = np.hstack([np.zeros((n_simulations, 1)), log_paths])

    # Convert to portfolio value
    paths = initial_investment * np.exp(log_paths)   # shape (n_sims, n_days+1)

    # Percentile bands
    percentile_levels = [5, 25, 50, 75, 95]
    percentiles = {}
    for p in percentile_levels:
        key = f"p{p}"
        series = np.percentile(paths, p, axis=0)
        percentiles[key] = [float(v) for v in series]

    # Final values distribution
    final_values = paths[:, -1]

    return {
        "percentiles": percentiles,
        "n_days": n_days,
        "probability_of_loss": float((final_values < initial_investment).mean()),
        "expected_final_value": float(np.mean(final_values)),
        "initial_investment": initial_investment,
    }


def monte_carlo_advanced(
    portfolio_returns_series: pd.Series,
    horizon_years: int = 10,
    n_simulations: int = 500,
    initial_investment: float = 10_000.0,
    target_value: float | None = None,
    volatility: float | None = None,
    max_dd: float | None = None,
    sharpe: float | None = None,
) -> dict:
    """
    Advanced Monte Carlo with goal tracking, robustness score, and distribution analysis.
    """
    log_returns = np.log(1 + portfolio_returns_series)
    mu_daily = float(log_returns.mean())
    sigma_daily = float(log_returns.std())

    n_days = horizon_years * TRADING_DAYS
    dt = 1

    rng = np.random.default_rng(42)
    Z = rng.standard_normal((n_simulations, n_days))
    drift = (mu_daily - 0.5 * sigma_daily ** 2) * dt
    diffusion = sigma_daily * np.sqrt(dt) * Z
    log_paths = np.cumsum(drift + diffusion, axis=1)
    log_paths = np.hstack([np.zeros((n_simulations, 1)), log_paths])
    paths = initial_investment * np.exp(log_paths)

    final_values = paths[:, -1]
    percentile_levels = [5, 25, 50, 75, 95]
    percentiles = {}
    for p in percentile_levels:
        key = f"p{p}"
        series = np.percentile(paths, p, axis=0)
        percentiles[key] = [float(v) for v in series]

    # ── Goal analysis ──────────────────────────────────────────────
    goal_analysis = None
    if target_value is not None and target_value > 0:
        prob_reach = float((final_values >= target_value).mean())
        p5_final = float(np.percentile(final_values, 5))
        p50_final = float(np.percentile(final_values, 50))
        p95_final = float(np.percentile(final_values, 95))

        # Time to reach goal for each percentile
        def years_to_reach(percentile_paths: np.ndarray, target: float) -> float | None:
            for day_idx in range(percentile_paths.shape[0]):
                if percentile_paths[day_idx] >= target:
                    return round(day_idx / TRADING_DAYS, 1)
            return None

        p5_path = np.percentile(paths, 5, axis=0)
        p50_path = np.percentile(paths, 50, axis=0)
        p95_path = np.percentile(paths, 95, axis=0)

        goal_analysis = {
            "target_value": target_value,
            "probability_of_reaching": prob_reach,
            "reached_by_p5": p5_final >= target_value,
            "reached_by_p50": p50_final >= target_value,
            "reached_by_p95": p95_final >= target_value,
            "years_to_reach_optimistic": years_to_reach(p95_path, target_value),
            "years_to_reach_median": years_to_reach(p50_path, target_value),
            "years_to_reach_pessimistic": years_to_reach(p5_path, target_value),
        }

    # ── Final value distribution (histogram) ──────────────────────
    hist_counts, hist_edges = np.histogram(final_values, bins=30)
    distribution = [
        {
            "range_min": round(float(hist_edges[i]), 0),
            "range_max": round(float(hist_edges[i+1]), 0),
            "count": int(hist_counts[i]),
            "pct": round(float(hist_counts[i]) / n_simulations * 100, 1),
        }
        for i in range(len(hist_counts))
    ]

    # ── Cumulative probability curve ───────────────────────────────
    sorted_finals = np.sort(final_values)
    cum_probs = np.linspace(0, 1, len(sorted_finals))
    # Sample 50 points
    idx = np.linspace(0, len(sorted_finals)-1, 50, dtype=int)
    cumulative_curve = [
        {"value": round(float(sorted_finals[i]), 0), "probability": round(float(1 - cum_probs[i]), 3)}
        for i in idx
    ]

    # ── Robustness score ───────────────────────────────────────────
    score = 100.0
    reasons = []

    prob_loss = float((final_values < initial_investment).mean())
    if prob_loss > 0.3:
        score -= 30
        reasons.append("Probabilité de perte élevée")
    elif prob_loss > 0.15:
        score -= 15
        reasons.append("Probabilité de perte modérée")
    elif prob_loss > 0.05:
        score -= 5

    ann_vol = volatility if volatility else sigma_daily * np.sqrt(TRADING_DAYS)
    if ann_vol > 0.30:
        score -= 25
        reasons.append("Volatilité très élevée (>30%)")
    elif ann_vol > 0.20:
        score -= 15
        reasons.append("Volatilité élevée (>20%)")
    elif ann_vol > 0.15:
        score -= 8

    if max_dd is not None:
        mdd_abs = abs(max_dd)
        if mdd_abs > 0.50:
            score -= 20
            reasons.append("Drawdown historique extrême (>50%)")
        elif mdd_abs > 0.30:
            score -= 12
            reasons.append("Drawdown historique sévère (>30%)")
        elif mdd_abs > 0.20:
            score -= 6

    p5_f = float(np.percentile(final_values, 5))
    p95_f = float(np.percentile(final_values, 95))
    dispersion_ratio = (p95_f - p5_f) / float(np.median(final_values)) if float(np.median(final_values)) > 0 else 10
    if dispersion_ratio > 5:
        score -= 15
        reasons.append("Dispersion très large des scénarios")
    elif dispersion_ratio > 3:
        score -= 8

    if sharpe is not None:
        if sharpe < 0:
            score -= 15
            reasons.append("Ratio de Sharpe négatif")
        elif sharpe < 0.5:
            score -= 8
        elif sharpe > 1.5:
            score += 5

    score = max(0, min(100, round(score)))

    if score >= 70:
        robustness_label = "Robuste"
        robustness_color = "green"
    elif score >= 40:
        robustness_label = "Modéré"
        robustness_color = "amber"
    else:
        robustness_label = "Fragile"
        robustness_color = "red"

    return {
        "percentiles": percentiles,
        "n_days": n_days,
        "probability_of_loss": prob_loss,
        "expected_final_value": float(np.mean(final_values)),
        "initial_investment": initial_investment,
        "final_values_p5": p5_f,
        "final_values_p50": float(np.median(final_values)),
        "final_values_p95": p95_f,
        "goal_analysis": goal_analysis,
        "distribution": distribution,
        "cumulative_curve": cumulative_curve,
        "robustness_score": score,
        "robustness_label": robustness_label,
        "robustness_color": robustness_color,
        "robustness_reasons": reasons,
        "annualized_return": float((mu_daily * TRADING_DAYS)),
        "annualized_volatility": float(sigma_daily * np.sqrt(TRADING_DAYS)),
    }


def compute_risk_contribution(returns_df, weights: list[float]) -> dict:
    """
    Compute risk contribution of each asset to portfolio volatility.
    Returns absolute and relative contributions.
    """
    import numpy as np

    w = np.array(weights)
    # Covariance matrix annualisée
    cov = returns_df.cov() * 252

    # Volatilité du portefeuille
    port_var = w @ cov.values @ w
    port_vol = np.sqrt(port_var)

    # Contribution marginale au risque
    marginal = cov.values @ w

    # Contribution absolue au risque
    abs_contrib = w * marginal

    # Contribution relative au risque (%)
    rel_contrib = abs_contrib / port_var

    tickers = returns_df.columns.tolist()
    result = {}
    for i, ticker in enumerate(tickers):
        result[ticker] = {
            "weight": float(w[i]),
            "abs_risk_contribution": float(abs_contrib[i]),
            "rel_risk_contribution": float(rel_contrib[i]),
            "marginal_risk": float(marginal[i]),
        }

    return {
        "portfolio_volatility": float(port_vol),
        "assets": result,
    }
