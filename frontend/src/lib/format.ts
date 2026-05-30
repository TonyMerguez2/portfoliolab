// ─── Number formatting ────────────────────────

export function fmtPct(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function fmtPctSigned(value: number, decimals = 1): string {
  const pct = value * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(decimals)}%`;
}

export function fmtCurrency(value: number, currency = "€"): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  })
    .format(value)
    .replace("EUR", currency);
}

export function fmtRatio(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

export function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Color helpers ────────────────────────────

export function returnColor(value: number): string {
  if (value > 0) return "text-emerald-600";
  if (value < 0) return "text-red-500";
  return "text-slate-500";
}

export function sharpeColor(value: number): string {
  if (value > 1) return "text-emerald-600";
  if (value > 0.5) return "text-amber-500";
  return "text-red-500";
}

export function correlationColor(value: number): string {
  // For heatmap: from teal (low) to coral (high)
  const abs = Math.abs(value);
  if (abs > 0.8) return "#D85A30"; // coral-600
  if (abs > 0.6) return "#EF9F27"; // amber-400
  if (abs > 0.4) return "#FAC775"; // amber-200
  if (abs > 0.2) return "#9FE1CB"; // teal-100
  return "#1D9E75"; // teal-400
}

// ─── Metrics labels ───────────────────────────

export const METRIC_LABELS: Record<string, string> = {
  total_return: "Total Return",
  cagr: "CAGR",
  annualized_volatility: "Volatility",
  max_drawdown: "Max Drawdown",
  sharpe_ratio: "Sharpe Ratio",
  sortino_ratio: "Sortino Ratio",
  calmar_ratio: "Calmar Ratio",
  var_95_historical: "VaR 95% (hist.)",
  var_95_parametric: "VaR 95% (param.)",
  best_day: "Best Day",
  worst_day: "Worst Day",
  positive_days_pct: "% Positive Days",
};
