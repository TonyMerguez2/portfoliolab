"""
Pydantic models — request/response schemas for the API.
"""
from __future__ import annotations
from enum import Enum
from pydantic import BaseModel, Field, model_validator


# ──────────────────────────────────────────────
# Enums
# ──────────────────────────────────────────────

class Period(str, Enum):
    ONE_YEAR = "1y"
    THREE_YEARS = "3y"
    FIVE_YEARS = "5y"
    TEN_YEARS = "10y"
    MAX = "max"


class Benchmark(str, Enum):
    SP500 = "^GSPC"
    MSCI_WORLD = "URTH"
    NASDAQ100 = "^NDX"
    CAC40 = "^FCHI"


# ──────────────────────────────────────────────
# Requests
# ──────────────────────────────────────────────

class AssetInput(BaseModel):
    ticker: str = Field(..., min_length=1, max_length=20, examples=["AAPL"])
    weight: float = Field(..., gt=0, le=100, description="Weight in percent (0-100)")

    @model_validator(mode="after")
    def normalize_ticker(self) -> "AssetInput":
        self.ticker = self.ticker.upper().strip()
        return self


class BacktestRequest(BaseModel):
    assets: list[AssetInput] = Field(..., min_length=1, max_length=20)
    period: Period = Period.FIVE_YEARS
    benchmark: Benchmark | None = Benchmark.SP500
    risk_free_rate: float = Field(
        default=0.035, ge=0, le=0.20,
        description="Annual risk-free rate (e.g. 0.035 = 3.5%)"
    )

    lang: str = "en"
    @model_validator(mode="after")
    def weights_must_sum_to_100(self) -> "BacktestRequest":
        total = sum(a.weight for a in self.assets)
        if abs(total - 100.0) > 0.01:
            raise ValueError(
                f"Asset weights must sum to 100% (currently {total:.2f}%)"
            )
        return self


class EfficientFrontierRequest(BaseModel):
    tickers: list[str] = Field(..., min_length=2, max_length=15)
    period: Period = Period.FIVE_YEARS
    risk_free_rate: float = 0.035
    n_portfolios: int = Field(default=200, ge=50, le=500)


class MonteCarloRequest(BaseModel):
    assets: list[AssetInput]
    period: Period = Period.FIVE_YEARS
    horizon_years: int = Field(default=5, ge=1, le=30)
    n_simulations: int = Field(default=500, ge=100, le=2000)
    initial_investment: float = Field(default=10_000.0, gt=0)


# ──────────────────────────────────────────────
# Response sub-models
# ──────────────────────────────────────────────

class PerformanceMetrics(BaseModel):
    total_return: float              # e.g. 0.487 = 48.7%
    cagr: float                      # Compound Annual Growth Rate
    annualized_volatility: float
    max_drawdown: float              # negative, e.g. -0.32
    sharpe_ratio: float
    sortino_ratio: float
    calmar_ratio: float
    var_95_historical: float         # daily VaR at 95%
    var_95_parametric: float
    best_day: float
    worst_day: float
    positive_days_pct: float         # % of days with positive return


class AssetMetrics(BaseModel):
    ticker: str
    weight: float
    total_return: float
    cagr: float
    volatility: float
    sharpe: float
    contribution_to_return: float    # weight × return


class TimeSeriesPoint(BaseModel):
    date: str                        # ISO format "2020-01-15"
    value: float


class DrawdownPoint(BaseModel):
    date: str
    drawdown: float                  # negative percentage
    drawdown_eur: float = 0.0        # drawdown in EUR


class MonthlyReturn(BaseModel):
    period: str                      # "2023-01"
    return_value: float


class CorrelationMatrix(BaseModel):
    tickers: list[str]
    matrix: list[list[float]]        # NxN matrix


class Commentary(BaseModel):
    overall: str
    risk: str
    diversification: str
    vs_benchmark: str
    sharpe_interpretation: str
    drawdown_note: str


class BenchmarkComparison(BaseModel):
    ticker: str
    name: str
    performance: PerformanceMetrics
    excess_return: float             # portfolio CAGR − benchmark CAGR
    tracking_error: float
    information_ratio: float


# ──────────────────────────────────────────────
# Main response
# ──────────────────────────────────────────────

class BacktestResponse(BaseModel):
    # Metadata
    period_start: str
    period_end: str
    actual_period_years: float
    tickers_used: list[str]
    tickers_failed: list[str]        # tickers that couldn't be fetched

    # Portfolio metrics
    portfolio: PerformanceMetrics
    assets: list[AssetMetrics]

    # Benchmark
    benchmark: BenchmarkComparison | None = None

    # Time series
    portfolio_growth: list[TimeSeriesPoint]    # normalized to 10,000
    benchmark_growth: list[TimeSeriesPoint] = []
    benchmark_drawdown_series: list[dict] = []
    drawdown_series: list[DrawdownPoint]
    monthly_returns: list[MonthlyReturn]

    # Matrix
    correlation: CorrelationMatrix

    # Commentary
    commentary: Commentary
    score: dict | None = None
    risk_contribution: dict | None = None
    markowitz: dict | None = None
    efficient_frontier: dict | None = None


class EfficientFrontierPoint(BaseModel):
    volatility: float
    expected_return: float
    sharpe: float
    weights: dict[str, float]


class EfficientFrontierResponse(BaseModel):
    frontier: list[EfficientFrontierPoint]
    max_sharpe_portfolio: EfficientFrontierPoint
    min_variance_portfolio: EfficientFrontierPoint
    individual_assets: list[dict]


class MonteCarloResponse(BaseModel):
    percentiles: dict[str, list[TimeSeriesPoint]]  # p5, p25, p50, p75, p95
    final_values: dict[str, float]                  # distribution of final values
    probability_of_loss: float
    expected_final_value: float
    initial_investment: float


class TickerValidation(BaseModel):
    ticker: str
    valid: bool
    name: str | None = None
    currency: str | None = None
    asset_type: str | None = None
    error: str | None = None
