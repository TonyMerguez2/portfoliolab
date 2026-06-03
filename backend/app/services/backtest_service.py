"""
Backtest orchestration service.
Coordinates data fetching, computation, and response assembly.
"""
from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from app.models.schemas import (
    BacktestRequest,
    BacktestResponse,
    PerformanceMetrics,
    AssetMetrics,
    TimeSeriesPoint,
    DrawdownPoint,
    MonthlyReturn,
    CorrelationMatrix,
    BenchmarkComparison,
    Commentary,
    EfficientFrontierRequest,
    EfficientFrontierResponse,
    MonteCarloRequest,
    MonteCarloResponse,
)
from app.services.data_service import (
    fetch_prices,
    compute_returns,
    BENCHMARK_NAMES,
)
from app.services.commentary_service import generate_commentary, compute_portfolio_score
from app.utils import finance as fin

logger = logging.getLogger(__name__)


def run_backtest(req: BacktestRequest) -> BacktestResponse:
    """
    Main backtest entry point.

    1. Fetch price data for all assets + benchmark
    2. Compute portfolio returns
    3. Compute all metrics
    4. Build response
    """
    # ── 1. Fetch data ──────────────────────────────────────────────
    all_tickers = [a.ticker for a in req.assets] + [req.benchmark.value]
    prices_all, successful, failed = fetch_prices(all_tickers, req.period)

    benchmark_ticker = req.benchmark.value
    asset_tickers = [t for t in [a.ticker for a in req.assets] if t in successful]

    if not asset_tickers:
        raise ValueError("No asset data could be fetched. Please check tickers.")

    # ── 2. Compute returns ─────────────────────────────────────────
    returns_all = compute_returns(prices_all)

    # Normalize weights to fractions (0-1) for available assets only
    available_assets = [a for a in req.assets if a.ticker in asset_tickers]
    total_weight = sum(a.weight for a in available_assets)
    weights_frac = {
        a.ticker: a.weight / total_weight
        for a in available_assets
    }

    portfolio_ret = fin.portfolio_returns(returns_all[asset_tickers], weights_frac)

    # ── 3. Benchmark returns ───────────────────────────────────────
    benchmark_ret: pd.Series | None = None
    if benchmark_ticker in returns_all.columns:
        benchmark_ret = returns_all[benchmark_ticker]

    # ── 4. Portfolio metrics ───────────────────────────────────────
    portfolio_metrics_dict = fin.compute_all_metrics(portfolio_ret, req.risk_free_rate)
    portfolio_metrics = PerformanceMetrics(**portfolio_metrics_dict)

    # ── 5. Individual asset metrics ────────────────────────────────
    asset_metrics_list: list[AssetMetrics] = []
    for ticker, weight in weights_frac.items():
        if ticker not in returns_all.columns:
            continue
        ar = returns_all[ticker]
        m = fin.compute_all_metrics(ar, req.risk_free_rate)
        asset_metrics_list.append(AssetMetrics(
            ticker=ticker,
            weight=weight * 100,
            total_return=m["total_return"],
            cagr=m["cagr"],
            volatility=m["annualized_volatility"],
            sharpe=m["sharpe_ratio"],
            contribution_to_return=weight * m["total_return"],
        ))

    # ── 6. Benchmark metrics ───────────────────────────────────────
    if benchmark_ret is not None:
        bm_dict = fin.compute_all_metrics(benchmark_ret, req.risk_free_rate)
        bm_metrics = PerformanceMetrics(**bm_dict)

        excess_return = portfolio_metrics.cagr - bm_metrics.cagr
        # Tracking error = std(portfolio - benchmark) * sqrt(252)
        aligned = pd.concat([portfolio_ret, benchmark_ret], axis=1).dropna()
        diff = aligned.iloc[:, 0] - aligned.iloc[:, 1]
        tracking_error = float(diff.std() * np.sqrt(fin.TRADING_DAYS))
        info_ratio = (
            excess_return / tracking_error if tracking_error > 0 else 0.0
        )

        benchmark_comparison = BenchmarkComparison(
            ticker=benchmark_ticker,
            name=BENCHMARK_NAMES.get(benchmark_ticker, benchmark_ticker),
            performance=bm_metrics,
            excess_return=excess_return,
            tracking_error=tracking_error,
            information_ratio=info_ratio,
        )
    else:
        # Fallback with zeros if benchmark data unavailable
        zero_metrics = PerformanceMetrics(
            total_return=0, cagr=0, annualized_volatility=0,
            max_drawdown=0, sharpe_ratio=0, sortino_ratio=0,
            calmar_ratio=0, var_95_historical=0, var_95_parametric=0,
            best_day=0, worst_day=0, positive_days_pct=0,
        )
        benchmark_comparison = BenchmarkComparison(
            ticker=benchmark_ticker,
            name=BENCHMARK_NAMES.get(benchmark_ticker, benchmark_ticker),
            performance=zero_metrics,
            excess_return=0, tracking_error=0, information_ratio=0,
        )

    # ── 7. Time series ─────────────────────────────────────────────
    portfolio_growth = fin.growth_curve(portfolio_ret)
    portfolio_growth_pts = [
        TimeSeriesPoint(date=str(d.date()), value=round(v, 2))
        for d, v in portfolio_growth.items()
    ]

    bm_growth_pts: list[TimeSeriesPoint] = []
    if benchmark_ret is not None:
        bm_growth = fin.growth_curve(benchmark_ret)
        bm_growth_pts = [
            TimeSeriesPoint(date=str(d.date()), value=round(v, 2))
            for d, v in bm_growth.items()
        ]

    dd_series = fin.drawdown_series(portfolio_ret)
    drawdown_pts = [
        DrawdownPoint(date=str(d.date()), drawdown=round(v * 100, 2))
        for d, v in dd_series.items()
    ]

    monthly_ret = fin.monthly_returns(portfolio_ret)
    monthly_ret_pts = [
        MonthlyReturn(
            period=str(d.to_period("M")),
            return_value=round(float(v) * 100, 2),
        )
        for d, v in monthly_ret.items()
    ]

    # ── 8. Correlation matrix ──────────────────────────────────────
    if len(asset_tickers) > 1:
        corr_df = fin.correlation_matrix(returns_all[asset_tickers])
        corr_matrix = CorrelationMatrix(
            tickers=list(corr_df.columns),
            matrix=[[round(v, 3) for v in row] for row in corr_df.values],
        )
        # Average off-diagonal correlation
        mask = np.ones(corr_df.shape, dtype=bool)
        np.fill_diagonal(mask, False)
        avg_corr = float(corr_df.values[mask].mean())
    else:
        corr_matrix = CorrelationMatrix(tickers=asset_tickers, matrix=[[1.0]])
        avg_corr = 1.0

    # ── 9. Commentary ──────────────────────────────────────────────
    commentary_dict = generate_commentary(
        portfolio=portfolio_metrics,
        benchmark=benchmark_comparison,
        n_assets=len(asset_tickers),
        avg_correlation=avg_corr,
        lang=req.lang,
    )
    commentary = Commentary(**commentary_dict)

    # ── 10. Assemble response ──────────────────────────────────────
    dates = portfolio_ret.index
    return BacktestResponse(
        period_start=str(dates[0].date()),
        period_end=str(dates[-1].date()),
        actual_period_years=round(len(dates) / fin.TRADING_DAYS, 2),
        tickers_used=asset_tickers,
        tickers_failed=failed,
        portfolio=portfolio_metrics,
        assets=asset_metrics_list,
        benchmark=benchmark_comparison,
        portfolio_growth=portfolio_growth_pts,
        benchmark_growth=bm_growth_pts,
        drawdown_series=drawdown_pts,
        monthly_returns=monthly_ret_pts,
        correlation=corr_matrix,
        risk_contribution=fin.compute_risk_contribution(
            returns_df=returns_all[asset_tickers],
            weights=[next(a.weight for a in req.assets if a.ticker == t) / 100 for t in asset_tickers],
        ),
        score=compute_portfolio_score(
            portfolio=portfolio_metrics,
            benchmark=benchmark_comparison,
            avg_correlation=avg_corr,
            n_assets=len(asset_tickers),
        ),
        commentary=commentary,
    )


def run_efficient_frontier(req: EfficientFrontierRequest) -> EfficientFrontierResponse:
    """Compute the Markowitz efficient frontier."""
    tickers = [t.upper() for t in req.tickers]
    prices, successful, _ = fetch_prices(tickers, req.period)
    returns = compute_returns(prices[successful])

    result = fin.efficient_frontier(returns, req.risk_free_rate, req.n_portfolios)

    from app.models.schemas import EfficientFrontierPoint
    def _to_point(d: dict) -> EfficientFrontierPoint:
        return EfficientFrontierPoint(**d)

    return EfficientFrontierResponse(
        frontier=[_to_point(p) for p in result["frontier"]],
        max_sharpe_portfolio=_to_point(result["max_sharpe_portfolio"]),
        min_variance_portfolio=_to_point(result["min_variance_portfolio"]),
        individual_assets=result["individual_assets"],
    )


def run_monte_carlo(req: MonteCarloRequest) -> MonteCarloResponse:
    """Run Monte Carlo portfolio simulations."""
    tickers = [a.ticker for a in req.assets]
    prices, successful, _ = fetch_prices(tickers, req.period)
    returns_all = compute_returns(prices[successful])

    available = [a for a in req.assets if a.ticker in successful]
    total_w = sum(a.weight for a in available)
    weights_frac = {a.ticker: a.weight / total_w for a in available}

    portfolio_ret = fin.portfolio_returns(returns_all[[a.ticker for a in available]], weights_frac)

    result = fin.monte_carlo(
        portfolio_ret,
        horizon_years=req.horizon_years,
        n_simulations=req.n_simulations,
        initial_investment=req.initial_investment,
    )

    # Convert percentile arrays to TimeSeriesPoint lists
    n_days = result["n_days"]
    percentile_ts: dict[str, list[TimeSeriesPoint]] = {}
    for key, values in result["percentiles"].items():
        pts = [
            TimeSeriesPoint(date=f"Day {i}", value=round(v, 2))
            for i, v in enumerate(values)
        ]
        percentile_ts[key] = pts

    return MonteCarloResponse(
        percentiles=percentile_ts,
        final_values={
            k: round(v[-1].value, 2)
            for k, v in percentile_ts.items()
        },
        probability_of_loss=result["probability_of_loss"],
        expected_final_value=result["expected_final_value"],
        initial_investment=result["initial_investment"],
    )


def run_monte_carlo_advanced(req: MonteCarloRequest, target_value: float | None = None) -> dict:
    """Advanced Monte Carlo with goal tracking and robustness score."""
    tickers = [a.ticker for a in req.assets]
    prices, successful, _ = fetch_prices(tickers, req.period)
    returns_all = compute_returns(prices[successful])

    available = [a for a in req.assets if a.ticker in successful]
    total_w = sum(a.weight for a in available)
    weights_frac = {a.ticker: a.weight / total_w for a in available}

    portfolio_ret = fin.portfolio_returns(returns_all[[a.ticker for a in available]], weights_frac)

    metrics = fin.compute_all_metrics(portfolio_ret)

    result = fin.monte_carlo_advanced(
        portfolio_ret,
        horizon_years=req.horizon_years,
        n_simulations=req.n_simulations,
        initial_investment=req.initial_investment,
        target_value=target_value,
        volatility=metrics["annualized_volatility"],
        max_dd=metrics["max_drawdown"],
        sharpe=metrics["sharpe_ratio"],
    )
    return result
