// ─────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────

export type Period = "1y" | "3y" | "5y" | "10y" | "max" | "custom";
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
  start_date?: string;
  benchmark?: Benchmark | null;
  risk_free_rate: number;
  lang?: string;
}

export type SimulationModel = "gbm" | "bootstrap" | "multivariate";
export type RebalancePolicy = "daily" | "annual" | "none";
export type DriftSource = "historical" | "explicit" | "risk_premium";

export interface MonteCarloRequest {
  assets: AssetInput[];
  period: Period;
  horizon_years: number;
  n_simulations: number;
  initial_investment: number;
  simulation_model: SimulationModel;
  block_size?: number;
  parameter_uncertainty?: boolean;
  rebalance?: RebalancePolicy;
  drift_source?: DriftSource;
  expected_return?: number | null;
  equity_risk_premium?: number;
}

// ─────────────────────────────────────────────
// Monte Carlo (advanced) response
// ─────────────────────────────────────────────

export interface MonteCarloGoal {
  target_value: number;
  probability_of_reaching: number;
  reached_by_p5: boolean;
  reached_by_p50: boolean;
  reached_by_p95: boolean;
  years_to_reach_optimistic: number | null;
  years_to_reach_median: number | null;
  years_to_reach_pessimistic: number | null;
}

export interface MonteCarloBin {
  range_min: number;
  range_max: number;
  count: number;
  pct: number;
}

export interface MonteCarloResult {
  percentiles: Record<"p5" | "p25" | "p50" | "p75" | "p95", number[]>;
  n_days: number;
  probability_of_loss: number;
  expected_final_value: number;
  initial_investment: number;
  final_values_p5: number;
  final_values_p50: number;
  final_values_p95: number;
  goal_analysis: MonteCarloGoal | null;
  distribution: MonteCarloBin[];
  robustness_score: number;
  robustness_label: string;
  robustness_color: "green" | "amber" | "red";
  robustness_reasons: string[];
  annualized_return: number;
  annualized_volatility: number;
  model: SimulationModel;
  rebalance: RebalancePolicy;
  parameter_uncertainty: boolean;
  drift_source: DriftSource;
  historical_annualized_return: number;
  expected_return_low: number;
  expected_return_high: number;
  betas: Record<string, number>;
  sample_paths: number[][];
  path_time_index: number[];
  n_observations: number;
  drift_std_error: number;
  final_values_p1: number;
  expected_shortfall_5: number;
  sample_skew: number;
  sample_excess_kurtosis: number;
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
  [key: string]: any;
  date: string;
  value: number;
}

export interface DrawdownPoint {
  date: string;
  drawdown: number; // negative %
  drawdown_eur: number;
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
  score?: any;
  efficient_frontier?: any[];
  risk_contribution?: any;
  markowitz?: any;
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
  custom: "Custom",
};

export const BENCHMARK_LABELS: Record<Benchmark, string> = {
  "^GSPC": "S&P 500",
  URTH: "MSCI World",
  "^NDX": "Nasdaq 100",
  "^FCHI": "CAC 40",
};
