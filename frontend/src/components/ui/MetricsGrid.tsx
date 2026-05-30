"use client";
import type { PerformanceMetrics, BenchmarkComparison } from "@/types";
import { fmtPct, fmtPctSigned, fmtRatio, returnColor, sharpeColor } from "@/lib/format";
import MetricTooltip from "@/components/ui/MetricTooltip";

interface Props {
  portfolio: PerformanceMetrics;
  benchmark: BenchmarkComparison;
  t: (key: string) => string;
  locale: string;
}

function MetricCard({ label, value, sub, color = "text-slate-900", tooltip, metric, locale }: {
  label: string; value: string; sub?: string; color?: string; tooltip?: string; metric?: string; locale?: string;
}) {
  return (
    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 hover:border-slate-200 transition-colors" title={tooltip}>
      <div className="flex items-center gap-0.5 mb-1">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {metric && locale && <MetricTooltip metric={metric} lang={locale} />}
      </div>
      <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function MetricsGrid({ portfolio: p, benchmark: b, t, locale }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">{t("metrics.performance")}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <MetricCard label={t("metrics.totalReturn")} value={fmtPctSigned(p.total_return)} color={returnColor(p.total_return)} metric="totalReturn" locale={locale} />
          <MetricCard label={t("metrics.cagr")} value={fmtPctSigned(p.cagr)} sub={t("metrics.cagrSub")} color={returnColor(p.cagr)} metric="cagr" locale={locale} />
          <MetricCard label={t("metrics.vsBenchmark")} value={fmtPctSigned(b.excess_return)} sub={`vs. ${b.name}`} color={returnColor(b.excess_return)} />
        </div>
      </div>
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">{t("metrics.risk")}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <MetricCard label={t("metrics.volatility")} value={fmtPct(p.annualized_volatility)} sub={t("metrics.volatilitySub")} metric="volatility" locale={locale} />
          <MetricCard label={t("metrics.maxDrawdown")} value={fmtPctSigned(p.max_drawdown)} color="text-red-500" metric="maxDrawdown" locale={locale} />
          <MetricCard label={t("metrics.var95")} value={fmtPctSigned(p.var_95_historical)} sub={t("metrics.var95Sub")} color="text-orange-500" metric="var95" locale={locale} />
        </div>
      </div>
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">{t("metrics.riskAdjusted")}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <MetricCard label={t("metrics.sharpe")} value={fmtRatio(p.sharpe_ratio)} color={sharpeColor(p.sharpe_ratio)} metric="sharpe" locale={locale} />
          <MetricCard label={t("metrics.sortino")} value={fmtRatio(p.sortino_ratio)} color={sharpeColor(p.sortino_ratio)} metric="sortino" locale={locale} />
          <MetricCard label={t("metrics.calmar")} value={fmtRatio(p.calmar_ratio)} metric="calmar" locale={locale} />
        </div>
      </div>
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">{t("metrics.statistics")}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <MetricCard label={t("metrics.bestDay")} value={fmtPctSigned(p.best_day)} color="text-emerald-600" />
          <MetricCard label={t("metrics.worstDay")} value={fmtPctSigned(p.worst_day)} color="text-red-500" />
          <MetricCard label={t("metrics.positiveDays")} value={fmtPct(p.positive_days_pct)} />
        </div>
      </div>
    </div>
  );
}
