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

    # Simulate: shape (n_simulations, n_days)
    # mu_daily is the mean of log-returns, i.e. already the log drift — no Itô
    # correction here (see gbm_log_paths).
    rng = np.random.default_rng(42)
    Z = rng.standard_normal((n_simulations, n_days))
    diffusion = sigma_daily * Z

    log_paths = np.cumsum(mu_daily + diffusion, axis=1)
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


# ──────────────────────────────────────────────
# Simulation engines — path generators
# ──────────────────────────────────────────────

def draw_parameter_posterior(
    log_returns: pd.Series,
    n_simulations: int,
    rng: np.random.Generator,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Sample (mu, sigma) from their joint posterior under a Jeffreys prior.

    mu and sigma are *estimates* from a finite sample, not known constants.
    With ~5 years of daily data the standard error on the annualised drift is
    around ±12 points, which dominates the spread of the simulated paths.
    Holding them fixed produces confidence bands that look far tighter than
    the evidence supports.

    Standard Normal-Inverse-Chi-Square result:
        sigma^2 | data ~ (n-1) s^2 / chi2(n-1)
        mu | sigma^2, data ~ N(xbar, sigma^2 / n)
    """
    values = log_returns.to_numpy(dtype=np.float64)
    n_obs = values.size
    if n_obs < 3:
        mu = np.full(n_simulations, float(values.mean()) if n_obs else 0.0)
        sigma = np.full(n_simulations, float(values.std()) if n_obs else 0.0)
        return mu, sigma

    xbar = float(values.mean())
    s2 = float(values.var(ddof=1))

    sigma2 = (n_obs - 1) * s2 / rng.chisquare(n_obs - 1, size=n_simulations)
    sigma = np.sqrt(sigma2)
    mu = rng.normal(xbar, np.sqrt(sigma2 / n_obs))
    return mu, sigma


def gbm_log_paths(
    log_returns: pd.Series,
    n_days: int,
    n_simulations: int,
    rng: np.random.Generator,
    parameter_uncertainty: bool = False,
) -> np.ndarray:
    """
    Geometric Brownian Motion increments.

    Fits (mu, sigma) to the historical log-returns and assumes i.i.d. Gaussian
    increments. Fast and analytically tractable, but it discards fat tails,
    skew and volatility clustering.

    With ``parameter_uncertainty`` each trajectory draws its own (mu, sigma)
    from the posterior, so the bands widen to reflect estimation error.
    """
    Z = rng.standard_normal((n_simulations, n_days))

    if parameter_uncertainty:
        mu, sigma = draw_parameter_posterior(log_returns, n_simulations, rng)
        return np.cumsum(mu[:, None] + sigma[:, None] * Z, axis=1)

    mu_daily = float(log_returns.mean())
    sigma_daily = float(log_returns.std())

    # mu_daily is already estimated in log space, so it *is* the log drift.
    # The Itô term -0.5*sigma^2 converts an arithmetic drift into a log drift;
    # applying it here as well would double-count the correction and bias the
    # median down by exp(0.5*sigma^2*T).
    return np.cumsum(mu_daily + sigma_daily * Z, axis=1)


def block_bootstrap_log_paths(
    log_returns: pd.Series,
    n_days: int,
    n_simulations: int,
    rng: np.random.Generator,
    block_size: int = 21,
    parameter_uncertainty: bool = False,
) -> np.ndarray:
    """
    Circular block bootstrap on the realised log-returns.

    Rather than assuming a distribution, this resamples contiguous blocks of
    actual history. Because whole blocks are drawn, the resampled series keeps
    the properties an i.i.d. draw destroys: fat tails, negative skew and
    volatility clustering (a crash day is followed by the days that actually
    followed it).

    The block wraps around the end of the series (circular), so every
    observation is equally likely to be drawn — a plain block bootstrap
    under-samples the tails of the window.
    """
    values = log_returns.to_numpy(dtype=np.float64)
    n_obs = values.size
    if n_obs == 0:
        return np.zeros((n_simulations, n_days))

    block = int(max(1, min(block_size, n_obs)))
    n_blocks = int(np.ceil(n_days / block))

    starts = rng.integers(0, n_obs, size=(n_simulations, n_blocks), dtype=np.int64)
    offsets = np.arange(block, dtype=np.int64)
    idx = (starts[:, :, None] + offsets[None, None, :]) % n_obs
    idx = idx.reshape(n_simulations, n_blocks * block)[:, :n_days]

    sampled = values[idx]

    if parameter_uncertainty:
        # Resampling captures the shape of the return distribution but still
        # anchors every path to the one historical mean. Re-centre each path on
        # a drift drawn from the posterior so estimation error is represented
        # too, leaving the resampled shape (tails, clustering) untouched.
        mu, _ = draw_parameter_posterior(log_returns, n_simulations, rng)
        sampled = sampled + (mu[:, None] - float(values.mean()))

    return np.cumsum(sampled, axis=1)


def multivariate_log_paths(
    returns_df: pd.DataFrame,
    weights: dict[str, float],
    n_days: int,
    n_simulations: int,
    rng: np.random.Generator,
    rebalance: str = "daily",
    parameter_uncertainty: bool = False,
) -> np.ndarray:
    """
    Simulate each asset separately, correlated via a Cholesky factor.

    The aggregated approaches collapse the portfolio into one series before
    simulating, which silently assumes the weights are restored every single
    day. Simulating assets individually makes the rebalancing policy explicit:

    - ``"daily"``   — weights reset every day (matches the aggregated models)
    - ``"none"``    — buy and hold; winners grow into the portfolio and it
                      drifts away from its target allocation
    - ``"annual"``  — reset once per year

    Correlation is imposed with the Cholesky factor L of the covariance matrix:
    if Z is i.i.d. standard normal then ``L @ Z`` has covariance ``L L' = Sigma``.
    """
    tickers = [t for t in returns_df.columns if t in weights]
    if not tickers:
        raise ValueError("No asset with a weight to simulate")

    w = np.array([weights[t] for t in tickers], dtype=np.float64)
    w = w / w.sum()

    log_df = np.log1p(returns_df[tickers]).dropna()
    if log_df.empty:
        raise ValueError("No overlapping return history to simulate")

    mu = log_df.mean().to_numpy(dtype=np.float64)          # (k,)
    cov = log_df.cov().to_numpy(dtype=np.float64)          # (k, k)
    k = len(tickers)
    n_obs = len(log_df)

    # Nearest-PSD guard: sample covariance can be numerically indefinite when
    # assets are nearly collinear or history is short.
    try:
        L = np.linalg.cholesky(cov)
    except np.linalg.LinAlgError:
        eigvals, eigvecs = np.linalg.eigh(cov)
        eigvals = np.clip(eigvals, 1e-12, None)
        L = np.linalg.cholesky(eigvecs @ np.diag(eigvals) @ eigvecs.T)

    # (n_sims, n_days, k) correlated log-return increments
    Z = rng.standard_normal((n_simulations, n_days, k))
    increments = Z @ L.T + mu

    if parameter_uncertainty:
        # Drift is the badly-estimated parameter; give each path its own draw
        # from N(mu_hat, Sigma / n) — the multivariate analogue of the
        # univariate posterior, keeping the cross-asset correlation.
        drift_shift = (rng.standard_normal((n_simulations, k)) @ L.T) / np.sqrt(n_obs)
        increments = increments + drift_shift[:, None, :]

    if rebalance == "daily":
        # Weights restored every day: the portfolio earns the weighted mean of
        # the assets' simple returns on each step.
        port_simple = np.expm1(increments) @ w
        port_value = np.cumprod(1.0 + port_simple, axis=1)
    else:
        asset_paths = np.exp(np.cumsum(increments, axis=1))  # (n_sims, n_days, k), starts ~1

        if rebalance == "none":
            # Buy and hold: each sleeve compounds on its own from day zero.
            port_value = asset_paths @ w
        elif rebalance == "annual":
            period = TRADING_DAYS
            port_value = np.empty((n_simulations, n_days))
            level = np.ones(n_simulations)
            for start in range(0, n_days, period):
                end = min(start + period, n_days)
                # Growth of each asset since the start of this segment.
                base = asset_paths[:, start - 1, :] if start > 0 else np.ones((n_simulations, k))
                growth = asset_paths[:, start:end, :] / base[:, None, :]
                port_value[:, start:end] = level[:, None] * (growth @ w)
                level = port_value[:, end - 1]
        else:
            raise ValueError(f"Unknown rebalance policy: {rebalance!r}")

    return np.log(np.maximum(port_value, 1e-12))


def _build_log_paths(
    log_returns: pd.Series,
    n_days: int,
    n_simulations: int,
    rng: np.random.Generator,
    model: str,
    block_size: int,
    parameter_uncertainty: bool = False,
    returns_df: pd.DataFrame | None = None,
    weights: dict[str, float] | None = None,
    rebalance: str = "daily",
) -> np.ndarray:
    """Dispatch to the requested path generator."""
    if model == "multivariate":
        if returns_df is None or weights is None:
            raise ValueError("Multivariate simulation requires per-asset returns and weights")
        return multivariate_log_paths(
            returns_df, weights, n_days, n_simulations, rng, rebalance, parameter_uncertainty
        )
    if model == "bootstrap":
        return block_bootstrap_log_paths(
            log_returns, n_days, n_simulations, rng, block_size, parameter_uncertainty
        )
    if model == "gbm":
        return gbm_log_paths(
            log_returns, n_days, n_simulations, rng, parameter_uncertainty
        )
    raise ValueError(f"Unknown simulation model: {model!r}")


def monte_carlo_advanced(
    portfolio_returns_series: pd.Series,
    horizon_years: int = 10,
    n_simulations: int = 500,
    initial_investment: float = 10_000.0,
    target_value: float | None = None,
    volatility: float | None = None,
    max_dd: float | None = None,
    sharpe: float | None = None,
    model: str = "gbm",
    block_size: int = 21,
    parameter_uncertainty: bool = False,
    returns_df: pd.DataFrame | None = None,
    weights: dict[str, float] | None = None,
    rebalance: str = "daily",
    seed: int = 42,
) -> dict:
    """
    Advanced Monte Carlo with goal tracking, robustness score, and distribution analysis.

    ``model`` selects the path generator: ``"gbm"`` (Gaussian i.i.d.) or
    ``"bootstrap"`` (circular block bootstrap on realised returns).
    """
    log_returns = np.log(1 + portfolio_returns_series).dropna()
    mu_daily = float(log_returns.mean())
    sigma_daily = float(log_returns.std())

    n_days = horizon_years * TRADING_DAYS

    rng = np.random.default_rng(seed)
    log_paths = _build_log_paths(
        log_returns, n_days, n_simulations, rng, model, block_size,
        parameter_uncertainty, returns_df, weights, rebalance,
    )
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
    # Log-spaced bins: final values are lognormal and, once parameter
    # uncertainty is on, span several orders of magnitude. Linear bins would
    # pile ~everything into the first bucket and show nothing.
    positive = final_values[final_values > 0]
    if positive.size:
        edges = np.geomspace(positive.min(), positive.max(), 31)
    else:
        edges = np.linspace(0, 1, 31)
    hist_counts, hist_edges = np.histogram(final_values, bins=edges)
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
        "model": model,
        "rebalance": rebalance if model == "multivariate" else "daily",
        "parameter_uncertainty": parameter_uncertainty,
        "n_observations": int(log_returns.size),
        # Standard error of the annualised drift. Usually large relative to the
        # drift itself, which is precisely why it is worth surfacing.
        "drift_std_error": float(
            sigma_daily * TRADING_DAYS / np.sqrt(log_returns.size)
        ) if log_returns.size else 0.0,
        # Tail diagnostics — this is where a bootstrap and a Gaussian GBM
        # disagree most, so surface them rather than only the central bands.
        "final_values_p1": float(np.percentile(final_values, 1)),
        "expected_shortfall_5": float(final_values[final_values <= p5_f].mean())
            if np.any(final_values <= p5_f) else p5_f,
        "sample_skew": float(stats.skew(log_returns)),
        "sample_excess_kurtosis": float(stats.kurtosis(log_returns)),
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


def optimize_markowitz(returns_df, risk_free_rate: float = 0.035) -> dict:
    """
    Markowitz mean-variance optimization.
    Finds weights that maximize the Sharpe ratio.
    """
    import numpy as np
    from scipy.optimize import minimize

    n = returns_df.shape[1]
    tickers = returns_df.columns.tolist()

    mu = returns_df.mean() * 252
    cov = returns_df.cov() * 252

    def neg_sharpe(w):
        ret = w @ mu.values
        vol = np.sqrt(w @ cov.values @ w)
        return -(ret - risk_free_rate) / vol

    def portfolio_vol(w):
        return np.sqrt(w @ cov.values @ w)

    def portfolio_ret(w):
        return w @ mu.values

    constraints = [{"type": "eq", "fun": lambda w: np.sum(w) - 1}]
    bounds = [(0.0, 1.0)] * n
    w0 = np.ones(n) / n

    res = minimize(neg_sharpe, w0, method="SLSQP", bounds=bounds, constraints=constraints,
                   options={"maxiter": 1000, "ftol": 1e-9})

    w_opt = res.x
    opt_ret = portfolio_ret(w_opt)
    opt_vol = portfolio_vol(w_opt)
    opt_sharpe = (opt_ret - risk_free_rate) / opt_vol

    res_mv = minimize(portfolio_vol, w0, method="SLSQP", bounds=bounds, constraints=constraints)
    w_mv = res_mv.x
    mv_ret = portfolio_ret(w_mv)
    mv_vol = portfolio_vol(w_mv)

    return {
        "max_sharpe": {
            "weights": {tickers[i]: round(float(w_opt[i]), 4) for i in range(n)},
            "expected_return": round(float(opt_ret), 4),
            "expected_volatility": round(float(opt_vol), 4),
            "sharpe_ratio": round(float(opt_sharpe), 4),
        },
        "min_variance": {
            "weights": {tickers[i]: round(float(w_mv[i]), 4) for i in range(n)},
            "expected_return": round(float(mv_ret), 4),
            "expected_volatility": round(float(mv_vol), 4),
        },
    }


def compute_efficient_frontier(returns_df, risk_free_rate: float = 0.035, n_points: int = 50) -> dict:
    import numpy as np
    from scipy.optimize import minimize

    n = returns_df.shape[1]
    tickers = returns_df.columns.tolist()
    mu = returns_df.mean() * 252
    cov = returns_df.cov() * 252

    def portfolio_vol(w):
        return np.sqrt(w @ cov.values @ w)

    def portfolio_ret(w):
        return w @ mu.values

    def neg_sharpe(w):
        ret = portfolio_ret(w)
        vol = portfolio_vol(w)
        return -(ret - risk_free_rate) / vol

    bounds = [(0.0, 1.0)] * n
    w0 = np.ones(n) / n
    constraints_sum = {"type": "eq", "fun": lambda w: np.sum(w) - 1}

    res_mv = minimize(portfolio_vol, w0, method="SLSQP", bounds=bounds, constraints=constraints_sum)
    w_mv = res_mv.x
    mv_ret = portfolio_ret(w_mv)
    mv_vol = portfolio_vol(w_mv)

    res_ms = minimize(neg_sharpe, w0, method="SLSQP", bounds=bounds, constraints=constraints_sum)
    w_ms = res_ms.x
    ms_ret = portfolio_ret(w_ms)
    ms_vol = portfolio_vol(w_ms)
    ms_sharpe = (ms_ret - risk_free_rate) / ms_vol

    ret_min = mv_ret
    ret_max = float(mu.max()) * 1.05
    target_returns = np.linspace(ret_min, ret_max, n_points)

    frontier = []
    for target in target_returns:
        constraints = [
            constraints_sum,
            {"type": "eq", "fun": lambda w, t=target: portfolio_ret(w) - t},
        ]
        res = minimize(portfolio_vol, w0, method="SLSQP", bounds=bounds, constraints=constraints)
        if res.success:
            vol = portfolio_vol(res.x)
            sharpe = (target - risk_free_rate) / vol
            frontier.append({
                "return": round(float(target), 4),
                "volatility": round(float(vol), 4),
                "sharpe": round(float(sharpe), 4),
            })

    assets_pts = []
    for i, ticker in enumerate(tickers):
        w = np.zeros(n)
        w[i] = 1.0
        assets_pts.append({
            "ticker": ticker,
            "return": round(float(mu.iloc[i]), 4),
            "volatility": round(float(np.sqrt(cov.values[i, i])), 4),
        })

    return {
        "frontier": frontier,
        "max_sharpe": {
            "return": round(float(ms_ret), 4),
            "volatility": round(float(ms_vol), 4),
            "sharpe": round(float(ms_sharpe), 4),
            "weights": {tickers[i]: round(float(w_ms[i]), 4) for i in range(n)},
        },
        "min_variance": {
            "return": round(float(mv_ret), 4),
            "volatility": round(float(mv_vol), 4),
            "weights": {tickers[i]: round(float(w_mv[i]), 4) for i in range(n)},
        },
        "assets": assets_pts,
        "risk_free_rate": risk_free_rate,
    }
