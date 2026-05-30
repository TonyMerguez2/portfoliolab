// ─────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────

export type Period = "1y" | "3y" | "5y" | "10y" | "max";
export type Benchmark = "^GSPC" | "URTH" | "^NDX" | "^FCHI";

// ─────────────────────────────────────────────
// Request shapes
// ─────────────────────────────────────────────

export interface AssetInput {
  ticker: string;
  weight: number; // percentage 0-100
}

export interface BacktestRequest {
  assets: AssetInput[];
  period: Period;
  benchmark: Benchmark;
  risk_free_rate: number;
  lang?: string;
}

// ─────────────────────────────────────────────
// Response sub-types
// ─────────────────────────────────────────────

export interface PerformanceMetrics {
  total_return: number;
  cagr: number;
  annualized_volatility: number;
  max_drawdown: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  calmar_ratio: number;
  var_95_historical: number;
  var_95_parametric: number;
  best_day: number;
  worst_day: number;
  positive_days_pct: number;
}

export interface AssetMetrics {
  ticker: string;
  weight: number;
  total_return: number;
  cagr: number;
  volatility: number;
  sharpe: number;
  contribution_to_return: number;
}

export interface TimeSeriesPoint {
  date: string;
  value: number;
}

export interface DrawdownPoint {
  date: string;
  drawdown: number; // negative %
}

export interface MonthlyReturn {
  period: string;
  return_value: number; // in %
}

export interface CorrelationMatrix {
  tickers: string[];
  matrix: number[][];
}

export interface Commentary {
  overall: string;
  risk: string;
  diversification: string;
  vs_benchmark: string;
  sharpe_interpretation: string;
  drawdown_note: string;
}

export interface BenchmarkComparison {
  ticker: string;
  name: string;
  performance: PerformanceMetrics;
  excess_return: number;
  tracking_error: number;
  information_ratio: number;
}

// ─────────────────────────────────────────────
// Main response
// ─────────────────────────────────────────────

export interface BacktestResponse {
  period_start: string;
  period_end: string;
  actual_period_years: number;
  tickers_used: string[];
  tickers_failed: string[];

  portfolio: PerformanceMetrics;
  assets: AssetMetrics[];
  benchmark: BenchmarkComparison;

  portfolio_growth: TimeSeriesPoint[];
  benchmark_growth: TimeSeriesPoint[];
  drawdown_series: DrawdownPoint[];
  monthly_returns: MonthlyReturn[];

  correlation: CorrelationMatrix;
  commentary: Commentary;
}

// ─────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────

export const PERIOD_LABELS: Record<Period, string> = {
  "1y": "1 Year",
  "3y": "3 Years",
  "5y": "5 Years",
  "10y": "10 Years",
  max: "Max Available",
};

export const BENCHMARK_LABELS: Record<Benchmark, string> = {
  "^GSPC": "S&P 500",
  URTH: "MSCI World",
  "^NDX": "Nasdaq 100",
  "^FCHI": "CAC 40",
};
