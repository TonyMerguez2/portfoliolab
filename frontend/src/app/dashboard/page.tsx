"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useBacktest } from "@/hooks/useBacktest";
import { useTranslation, LOCALE_LABELS, type Locale } from "@/hooks/useTranslation";
import { fmtDate, fmtPctSigned, fmtPct, fmtRatio, returnColor, sharpeColor } from "@/lib/format";
import type { BacktestRequest, Period, Benchmark } from "@/types";
import GrowthChart from "@/components/charts/GrowthChart";
import DrawdownChart from "@/components/charts/DrawdownChart";
import { AllocationPie, MonthlyReturnsChart, CorrelationHeatmap } from "@/components/charts";
import MetricTooltip from "@/components/ui/MetricTooltip";
import ScoreCard from "@/components/ui/ScoreCard";
import MonteCarloPanel from "@/components/ui/MonteCarloPanel";

const DEFAULT_ASSETS = [
  { ticker: "AAPL", weight: 30 },
  { ticker: "MSFT", weight: 30 },
  { ticker: "CW8.PA", weight: 40 },
];

const TABS = ["overview","charts","assets","correlation","markowitz","frontier","commentary","projections"] as const;
type Tab = typeof TABS[number];

function MetricCard({ label, value, sub, color="text-slate-900", metric, locale }: {
  label:string; value:string; sub?:string; color?:string; metric?:string; locale?:string;
}) {
  return (
    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 hover:border-slate-200 transition-colors">
      <div className="flex items-center gap-0.5 mb-1">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {metric && locale && <MetricTooltip metric={metric} lang={locale}/>}
      </div>
      <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function DashboardContent() {
  const { data, isLoading, error, run } = useBacktest();
  const { t, locale, setLocale } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [period, setPeriod] = useState<Period>("5y");
  const [benchmark, setBenchmark] = useState<Benchmark>("^GSPC");
  const [riskFreeRate, setRiskFreeRate] = useState(3.5);
  const [showTickerHelp, setShowTickerHelp] = useState(false);

  const getInitialAssets = () => {
    try {
      const raw = searchParams.get("assets");
      if (raw) {
        const parsed = JSON.parse(decodeURIComponent(raw));
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((a: any) => ({ ticker: a.ticker, weight: a.weight }));
        }
      }
    } catch {}
    return DEFAULT_ASSETS;
  };

  const [assets, setAssets] = useState(getInitialAssets);

  const totalWeight = assets.reduce((s,a) => s+(a.weight||0), 0);
  const isBalanced = Math.abs(totalWeight-100) < 0.01;

  const addAsset = () => setAssets(p => [...p, { ticker:"", weight:0 }]);
  const removeAsset = (i:number) => setAssets(p => p.filter((_,idx) => idx!==i));
  const updateAsset = (i:number, field:"ticker"|"weight", value:string|number) =>
    setAssets(p => p.map((a,idx) => idx===i ? {...a, [field]: field==="ticker" ? String(value).toUpperCase() : Number(value)} : a));
  const equalizeWeights = () => {
    const n = assets.length;
    const w = Math.floor(10000/n)/100;
    const last = +(100-w*(n-1)).toFixed(2);
    setAssets(p => p.map((a,i) => ({...a, weight: i===n-1 ? last : w})));
  };
  const handleSubmit = () => {
    if (!isBalanced || assets.some(a => !a.ticker)) return;
    run({ assets: assets.filter(a => a.ticker), period, benchmark, risk_free_rate: riskFreeRate/100, lang: locale });
    setActiveTab("overview");
  };

  const periods: Period[] = ["1y","3y","5y","10y","max"];
  const benchmarks: {value:Benchmark, key:string}[] = [
    {value:"^GSPC", key:"^GSPC"}, {value:"URTH", key:"URTH"},
    {value:"^NDX", key:"^NDX"}, {value:"^FCHI", key:"^FCHI"},
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/build")} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
                </svg>
              </div>
              <span className="font-bold text-slate-900 text-base tracking-tight">Quantfolio</span>
            </button>
            <span className="text-slate-300">|</span>
            <span className="text-xs text-slate-400 hidden sm:block">Analyse</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/build")} className="text-xs text-slate-500 hover:text-indigo-600 border border-slate-200 hover:border-indigo-300 px-3 py-1.5 rounded-lg transition-colors">
              ← Modifier le portefeuille
            </button>
            <select value={locale} onChange={e => setLocale(e.target.value as Locale)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {(Object.entries(LOCALE_LABELS) as [Locale,string][]).map(([v,l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <aside className="lg:col-span-1 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{t("builder.title")}</h2>
                  <p className="text-sm text-slate-500 mt-0.5">{t("builder.subtitle")}</p>
                </div>
                <button onClick={equalizeWeights} className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 rounded-lg px-3 py-1.5 transition-colors">
                  {t("builder.equalize")}
                </button>
              </div>
              <div className="space-y-2 mb-4">
                <div className="grid grid-cols-12 gap-2 text-xs text-slate-400 font-medium px-1 mb-1">
                  <span className="col-span-5">{t("builder.ticker")}</span>
                  <span className="col-span-5">{t("builder.weight")}</span>
                  <span className="col-span-2"/>
                </div>
                {assets.map((asset,i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <input className="col-span-5 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase placeholder:text-slate-300"
                      placeholder="AAPL" value={asset.ticker} onChange={e => updateAsset(i,"ticker",e.target.value)}/>
                    <input type="number" min={0} max={100} step={0.1}
                      className="col-span-5 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={asset.weight} onChange={e => updateAsset(i,"weight",e.target.value)}/>
                    <button onClick={() => removeAsset(i)} disabled={assets.length===1}
                      className="col-span-2 flex items-center justify-center text-slate-300 hover:text-red-400 disabled:opacity-20 transition-colors h-9 rounded-lg">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mb-2">
                <button onClick={addAsset} disabled={assets.length>=20}
                  className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 disabled:opacity-40">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                  </svg>
                  {t("builder.addAsset")}
                </button>
                <span className={`text-sm font-semibold tabular-nums ${isBalanced?"text-emerald-600":totalWeight>100?"text-red-500":"text-amber-500"}`}>
                  {totalWeight.toFixed(1)}% / 100%
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full mb-6 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${isBalanced?"bg-emerald-500":totalWeight>100?"bg-red-400":"bg-amber-400"}`}
                  style={{width:`${Math.min(totalWeight,100)}%`}}/>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">{t("builder.period")}</label>
                  <select value={period} onChange={e => setPeriod(e.target.value as Period)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                    {periods.map(v => <option key={v} value={v}>{t(`builder.periodLabel.${v}`)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">{t("builder.benchmark")}</label>
                  <select value={benchmark} onChange={e => setBenchmark(e.target.value as Benchmark)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                    {benchmarks.map(({value,key}) => <option key={value} value={value}>{t(`builder.benchmarkLabel.${key}`)}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">{t("builder.riskFreeRate")} — {riskFreeRate.toFixed(1)}%</label>
                  <input type="range" min={0} max={10} step={0.1} value={riskFreeRate}
                    onChange={e => setRiskFreeRate(Number(e.target.value))} className="w-full accent-indigo-600"/>
                  <div className="flex justify-between text-xs text-slate-400 mt-0.5"><span>0%</span><span>10%</span></div>
                </div>
              </div>
              <button onClick={handleSubmit} disabled={!isBalanced||isLoading||assets.some(a=>!a.ticker)}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold rounded-xl py-3 text-sm transition-colors flex items-center justify-center gap-2">
                {isLoading ? (
                  <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>{t("builder.running")}</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/>
                  </svg>{t("builder.runBacktest")}</>
                )}
              </button>
              {!isBalanced && <p className="text-xs text-red-500 text-center mt-2">{t("builder.weightsError")}</p>}
            </div>
            {data && (
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm text-sm">
                {[[t("meta.period"),`${data.actual_period_years.toFixed(1)} ${t("meta.years")}`],[t("meta.from"),fmtDate(data.period_start)],[t("meta.to"),fmtDate(data.period_end)]].map(([label,value]) => (
                  <div key={label} className="flex justify-between text-slate-500 mb-1 last:mb-0">
                    <span>{label}</span><span className="font-medium text-slate-700">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </aside>

          <div className="lg:col-span-2">
            {error && <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700 text-sm mb-4"><strong>Error: </strong>{error}</div>}
            {isLoading && !data && (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 flex flex-col items-center justify-center shadow-sm text-center">
                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"/>
                <p className="text-slate-600 font-medium">{t("loading.title")}</p>
                <p className="text-slate-400 text-sm mt-1">{t("loading.subtitle")}</p>
              </div>
            )}
            {!isLoading && !data && !error && (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 flex flex-col items-center justify-center shadow-sm text-center">
                <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                  </svg>
                </div>
                <h2 className="text-slate-700 font-semibold text-lg mb-2">{t("empty.title")}</h2>
                <p className="text-slate-400 text-sm max-w-xs leading-relaxed">{t("empty.subtitle")}</p>
              </div>
            )}
            {data && (
              <div className="space-y-4">
                {data.score && <ScoreCard score={data.score as any} locale={locale}/>}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="flex border-b border-slate-200 overflow-x-auto">
                    {TABS.map(tab => (
                      <button key={tab} onClick={() => setActiveTab(tab)}
                        className={`px-5 py-3.5 text-sm font-medium transition-colors whitespace-nowrap ${activeTab===tab?"text-indigo-600 border-b-2 border-indigo-600 -mb-px":"text-slate-500 hover:text-slate-700"}`}>
                        {t(`tabs.${tab}`)}
                      </button>
                    ))}
                  </div>
                  <div className="p-6">
                    {activeTab==="overview" && (
                      <div className="space-y-4">
                        {[
                          {key:"performance", cards:[
                            {label:t("metrics.totalReturn"), value:fmtPctSigned(data.portfolio.total_return), color:returnColor(data.portfolio.total_return), metric:"totalReturn", locale},
                            {label:t("metrics.cagr"), value:fmtPctSigned(data.portfolio.cagr), sub:t("metrics.cagrSub"), color:returnColor(data.portfolio.cagr), metric:"cagr", locale},
                            {label:t("metrics.vsBenchmark"), value:fmtPctSigned(data.benchmark.excess_return), sub:`vs. ${data.benchmark.name}`, color:returnColor(data.benchmark.excess_return)},
                          ]},
                          {key:"risk", cards:[
                            {label:t("metrics.volatility"), value:fmtPct(data.portfolio.annualized_volatility), sub:t("metrics.volatilitySub"), metric:"volatility", locale},
                            {label:t("metrics.maxDrawdown"), value:fmtPctSigned(data.portfolio.max_drawdown), color:"text-red-500", metric:"maxDrawdown", locale},
                            {label:t("metrics.var95"), value:fmtPctSigned(data.portfolio.var_95_historical), sub:t("metrics.var95Sub"), color:"text-orange-500", metric:"var95", locale},
                          ]},
                          {key:"riskAdjusted", cards:[
                            {label:t("metrics.sharpe"), value:fmtRatio(data.portfolio.sharpe_ratio), color:sharpeColor(data.portfolio.sharpe_ratio), metric:"sharpe", locale},
                            {label:t("metrics.sortino"), value:fmtRatio(data.portfolio.sortino_ratio), color:sharpeColor(data.portfolio.sortino_ratio), metric:"sortino", locale},
                            {label:t("metrics.calmar"), value:fmtRatio(data.portfolio.calmar_ratio), metric:"calmar", locale},
                          ]},
                          {key:"statistics", cards:[
                            {label:t("metrics.bestDay"), value:fmtPctSigned(data.portfolio.best_day), color:"text-emerald-600"},
                            {label:t("metrics.worstDay"), value:fmtPctSigned(data.portfolio.worst_day), color:"text-red-500"},
                            {label:t("metrics.positiveDays"), value:fmtPct(data.portfolio.positive_days_pct)},
                          ]},
                        ].map(({key,cards}) => (
                          <div key={key}>
                            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">{t(`metrics.${key}`)}</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {cards.map(c => <MetricCard key={c.label} {...c}/>)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {activeTab==="charts" && (
                      <div className="space-y-8">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-700 mb-4">{t("charts.growthTitle")}</h3>
                          <GrowthChart portfolioData={data.portfolio_growth} benchmarkData={data.benchmark_growth} benchmarkName={data.benchmark.name} portfolioLabel={t("charts.portfolio")}/>
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-slate-700 mb-4">{t("charts.drawdownTitle")}</h3>
                          <DrawdownChart data={data.drawdown_series}/>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <div>
                            <h3 className="text-sm font-semibold text-slate-700 mb-4">{t("charts.allocationTitle")}</h3>
                            <AllocationPie assets={data.assets}/>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-slate-700 mb-4">{t("charts.monthlyTitle")}</h3>
                            <MonthlyReturnsChart data={data.monthly_returns}/>
                          </div>
                        </div>
                      </div>
                    )}
                    {activeTab==="assets" && (
                      <div className="space-y-6">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs font-semibold text-slate-400 uppercase tracking-widest border-b border-slate-100">
                                {["ticker","weight","totalReturn","cagr","volatility","sharpe","contribution"].map(k => (
                                  <th key={k} className="pb-3 pr-4 last:pr-0 last:text-right text-right first:text-left">{t(`assets.${k}`)}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {data.assets.map(a => (
                                <tr key={a.ticker} className="hover:bg-slate-50 transition-colors">
                                  <td className="py-3 pr-4 font-mono font-bold text-indigo-600">{a.ticker}</td>
                                  <td className="py-3 pr-4 text-right tabular-nums">{a.weight.toFixed(1)}%</td>
                                  <td className={`py-3 pr-4 text-right tabular-nums font-medium ${returnColor(a.total_return)}`}>{(a.total_return*100).toFixed(1)}%</td>
                                  <td className={`py-3 pr-4 text-right tabular-nums ${returnColor(a.cagr)}`}>{(a.cagr*100).toFixed(1)}%</td>
                                  <td className="py-3 pr-4 text-right tabular-nums text-slate-600">{(a.volatility*100).toFixed(1)}%</td>
                                  <td className={`py-3 pr-4 text-right tabular-nums font-medium ${sharpeColor(a.sharpe)}`}>{a.sharpe.toFixed(2)}</td>
                                  <td className={`py-3 text-right tabular-nums ${returnColor(a.contribution_to_return)}`}>{(a.contribution_to_return*100).toFixed(1)}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {data.risk_contribution && (
                          <div>
                            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Contribution au risque</h3>
                            <div className="space-y-3">
                              {Object.entries((data.risk_contribution as any).assets)
                                .sort((a:any, b:any) => b[1].rel_risk_contribution - a[1].rel_risk_contribution)
                                .map(([ticker, info]: [string, any]) => (
                                <div key={ticker}>
                                  <div className="flex items-center justify-between text-xs mb-1.5">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono font-bold text-indigo-600">{ticker}</span>
                                      <span className="text-slate-400">Poids : {(info.weight*100).toFixed(1)}%</span>
                                    </div>
                                    <span className={`font-semibold tabular-nums ${info.rel_risk_contribution > info.weight ? "text-red-500" : "text-emerald-600"}`}>
                                      {(info.rel_risk_contribution*100).toFixed(1)}% du risque
                                    </span>
                                  </div>
                                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all ${info.rel_risk_contribution > info.weight ? "bg-red-400" : "bg-emerald-400"}`}
                                      style={{width: `${Math.min(info.rel_risk_contribution*100, 100)}%`}}/>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <p className="text-xs text-slate-400 mt-3">
                              Rouge = contribution au risque supérieure au poids · Vert = contribution inférieure au poids
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                    {activeTab==="correlation" && (
                      <div className="space-y-4">
                        <p className="text-sm text-slate-500">{t("correlation.description")}</p>
                        <CorrelationHeatmap data={data.correlation}/>
                      </div>
                    )}
                    {activeTab==="markowitz" && data.markowitz && (
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* Max Sharpe */}
                          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-4">
                              <span className="text-lg">🎯</span>
                              <div>
                                <h3 className="text-sm font-bold text-indigo-900">Portefeuille Optimal</h3>
                                <p className="text-xs text-indigo-600">Sharpe maximum</p>
                              </div>
                            </div>
                            <div className="space-y-2 mb-4">
                              {Object.entries((data.markowitz as any).max_sharpe.weights)
                                .sort((a:any,b:any) => b[1]-a[1])
                                .map(([ticker, w]:any) => (
                                <div key={ticker}>
                                  <div className="flex justify-between text-xs mb-1">
                                    <span className="font-mono font-bold text-indigo-700">{ticker}</span>
                                    <span className="font-semibold">{(w*100).toFixed(1)}%</span>
                                  </div>
                                  <div className="w-full h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-500 rounded-full" style={{width:`${w*100}%`}}/>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-indigo-200">
                              <div className="text-center">
                                <p className="text-xs text-indigo-500">Rendement</p>
                                <p className="text-sm font-bold text-indigo-800">{((data.markowitz as any).max_sharpe.expected_return*100).toFixed(1)}%</p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs text-indigo-500">Volatilité</p>
                                <p className="text-sm font-bold text-indigo-800">{((data.markowitz as any).max_sharpe.expected_volatility*100).toFixed(1)}%</p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs text-indigo-500">Sharpe</p>
                                <p className="text-sm font-bold text-indigo-800">{(data.markowitz as any).max_sharpe.sharpe_ratio.toFixed(2)}</p>
                              </div>
                            </div>
                          </div>

                          {/* Min Variance */}
                          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-4">
                              <span className="text-lg">🛡️</span>
                              <div>
                                <h3 className="text-sm font-bold text-emerald-900">Portefeuille Défensif</h3>
                                <p className="text-xs text-emerald-600">Variance minimale</p>
                              </div>
                            </div>
                            <div className="space-y-2 mb-4">
                              {Object.entries((data.markowitz as any).min_variance.weights)
                                .sort((a:any,b:any) => b[1]-a[1])
                                .map(([ticker, w]:any) => (
                                <div key={ticker}>
                                  <div className="flex justify-between text-xs mb-1">
                                    <span className="font-mono font-bold text-emerald-700">{ticker}</span>
                                    <span className="font-semibold">{(w*100).toFixed(1)}%</span>
                                  </div>
                                  <div className="w-full h-1.5 bg-emerald-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 rounded-full" style={{width:`${w*100}%`}}/>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-emerald-200">
                              <div className="text-center">
                                <p className="text-xs text-emerald-500">Rendement</p>
                                <p className="text-sm font-bold text-emerald-800">{((data.markowitz as any).min_variance.expected_return*100).toFixed(1)}%</p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs text-emerald-500">Volatilité</p>
                                <p className="text-sm font-bold text-emerald-800">{((data.markowitz as any).min_variance.expected_volatility*100).toFixed(1)}%</p>
                              </div>
                            </div>
                          </div>
                        </div>
                        <p className="text-xs text-slate-400 text-center">
                          Optimisation basée sur les données historiques · Les performances passées ne préjugent pas des performances futures
                        </p>
                      </div>
                    )}

                    {activeTab==="frontier" && data.efficient_frontier && (
                      <div className="space-y-4">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-700 mb-1">Frontière Efficiente</h3>
                          <p className="text-xs text-slate-400 mb-4">Chaque point représente un portefeuille optimal pour un niveau de risque donné</p>
                          <div style={{height: 380}}>
                            {(() => {
                              const { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Label } = require("recharts");
                              const ef = data.efficient_frontier as any;
                              const frontierData = ef.frontier.map((p:any) => ({
                                x: +(p.volatility*100).toFixed(2),
                                y: +(p.return*100).toFixed(2),
                                sharpe: p.sharpe,
                              }));
                              const msPoint = [{
                                x: +(ef.max_sharpe.volatility*100).toFixed(2),
                                y: +(ef.max_sharpe.return*100).toFixed(2),
                              }];
                              const mvPoint = [{
                                x: +(ef.min_variance.volatility*100).toFixed(2),
                                y: +(ef.min_variance.return*100).toFixed(2),
                              }];
                              const assetsData = ef.assets.map((a:any) => ({
                                x: +(a.volatility*100).toFixed(2),
                                y: +(a.return*100).toFixed(2),
                                name: a.ticker,
                              }));
                              return (
                                <ResponsiveContainer width="100%" height="100%">
                                  <ScatterChart margin={{top:20,right:30,bottom:30,left:30}}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                                    <XAxis type="number" dataKey="x" name="Volatilité" domain={["auto","auto"]} tickFormatter={(v:number) => `${v.toFixed(0)}%`}>
                                      <Label value="Volatilité annualisée" offset={-10} position="insideBottom" style={{fontSize:11,fill:"#94a3b8"}}/>
                                    </XAxis>
                                    <YAxis type="number" dataKey="y" name="Rendement" domain={["auto","auto"]} tickFormatter={(v:number) => `${v.toFixed(0)}%`}>
                                      <Label value="Rendement attendu" angle={-90} position="insideLeft" style={{fontSize:11,fill:"#94a3b8"}}/>
                                    </YAxis>
                                    <Tooltip cursor={{strokeDasharray:"3 3"}} content={({payload}:any) => {
                                      if (!payload?.length) return null;
                                      const d = payload[0]?.payload;
                                      return (
                                        <div className="bg-white border border-slate-200 rounded-lg p-2 text-xs shadow">
                                          <p>Volatilité : <strong>{d.x}%</strong></p>
                                          <p>Rendement : <strong>{d.y}%</strong></p>
                                          {d.sharpe && <p>Sharpe : <strong>{d.sharpe?.toFixed(2)}</strong></p>}
                                          {d.name && <p>Actif : <strong>{d.name}</strong></p>}
                                        </div>
                                      );
                                    }}/>
                                    <Scatter name="Frontière" data={frontierData} fill="#6366f1" opacity={0.6} r={3}/>
                                    <Scatter name="Sharpe Max" data={msPoint} fill="#f59e0b" r={8} shape="star"/>
                                    <Scatter name="Min Variance" data={mvPoint} fill="#10b981" r={8}/>
                                    <Scatter name="Actifs" data={assetsData} fill="#ef4444" r={6} shape="diamond"/>
                                  </ScatterChart>
                                </ResponsiveContainer>
                              );
                            })()}
                          </div>
                          <div className="flex items-center justify-center gap-6 mt-2 text-xs text-slate-500">
                            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-indigo-400"/><span>Frontière efficiente</span></div>
                            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-amber-400"/><span>🎯 Sharpe max</span></div>
                            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-emerald-400"/><span>🛡️ Variance min</span></div>
                            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-red-400"/><span>Actifs individuels</span></div>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeTab==="commentary" && (
                      <div className="space-y-3">
                        {(Object.keys(data.commentary) as (keyof typeof data.commentary)[]).map(key => (
                          <div key={key} className="flex gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100">
                            <span className="text-lg flex-shrink-0 mt-0.5">
                              {{"overall":"📈","risk":"⚡","diversification":"🔀","vs_benchmark":"🏁","sharpe_interpretation":"⚖️","drawdown_note":"📉"}[key]}
                            </span>
                            <div>
                              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">{t(`commentary.${key}`)}</p>
                              <p className="text-sm text-slate-700 leading-relaxed">{data.commentary[key]}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {activeTab==="projections" && (
                      <MonteCarloPanel assets={assets} period={period} locale={locale} t={t}/>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"/></div>}>
      <DashboardContent/>
    </Suspense>
  );
}
