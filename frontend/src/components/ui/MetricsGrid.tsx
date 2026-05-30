"use client";

import type { PerformanceMetrics, BenchmarkComparison } from "@/types";
import { fmtPct, fmtPctSigned, fmtRatio, returnColor, sharpeColor } from "@/lib/format";

interface Props {
  portfolio: PerformanceMetrics;
  benchmark: BenchmarkComparison;
}

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  tooltip?: string;
}

function MetricCard({ label, value, sub, color = "text-slate-900", tooltip }: MetricCardProps) {
  return (
    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 hover:border-slate-200 transition-colors"
         title={tooltip}>
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function MetricsGrid({ portfolio: p, benchmark: b }: Props) {
  const excessReturn = b.excess_return;

  return (
    <div className="space-y-4">
      {/* Performance row */}
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
          Performance
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <MetricCard
            label="Total Return"
            value={fmtPctSigned(p.total_return)}
            color={returnColor(p.total_return)}
            tooltip="Total portfolio return over the selected period"
          />
          <MetricCard
            label="CAGR"
            value={fmtPctSigned(p.cagr)}
            sub="annualized"
            color={returnColor(p.cagr)}
            tooltip="Compound Annual Growth Rate"
          />
          <MetricCard
            label="vs. Benchmark"
            value={fmtPctSigned(excessReturn)}
            sub={`vs. ${b.name}`}
            color={returnColor(excessReturn)}
            tooltip="Annualized excess return over benchmark (alpha)"
          />
        </div>
      </div>

      {/* Risk row */}
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
          Risk
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <MetricCard
            label="Volatility"
            value={fmtPct(p.annualized_volatility)}
            sub="annualized"
            tooltip="Annualized standard deviation of daily returns"
          />
          <MetricCard
            label="Max Drawdown"
            value={fmtPctSigned(p.max_drawdown)}
            color="text-red-500"
            tooltip="Largest peak-to-trough decline over the period"
          />
          <MetricCard
            label="VaR 95%"
            value={fmtPctSigned(p.var_95_historical)}
            sub="historical, daily"
            color="text-orange-500"
            tooltip="Value at Risk: worst 5% of daily returns"
          />
        </div>
      </div>

      {/* Risk-adjusted row */}
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
          Risk-Adjusted
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <MetricCard
            label="Sharpe Ratio"
            value={fmtRatio(p.sharpe_ratio)}
            color={sharpeColor(p.sharpe_ratio)}
            tooltip="(Return − Risk-free rate) / Volatility"
          />
          <MetricCard
            label="Sortino Ratio"
            value={fmtRatio(p.sortino_ratio)}
            color={sharpeColor(p.sortino_ratio)}
            tooltip="Like Sharpe but only penalizes downside deviation"
          />
          <MetricCard
            label="Calmar Ratio"
            value={fmtRatio(p.calmar_ratio)}
            tooltip="CAGR / |Max Drawdown|"
          />
        </div>
      </div>

      {/* Stats row */}
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
          Statistics
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <MetricCard
            label="Best Day"
            value={fmtPctSigned(p.best_day)}
            color="text-emerald-600"
          />
          <MetricCard
            label="Worst Day"
            value={fmtPctSigned(p.worst_day)}
            color="text-red-500"
          />
          <MetricCard
            label="Positive Days"
            value={fmtPct(p.positive_days_pct)}
            tooltip="% of trading days with positive returns"
          />
        </div>
      </div>
    </div>
  );
}
