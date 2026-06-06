"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useBacktest } from "@/hooks/useBacktest";
import { useTranslation, LOCALE_LABELS, type Locale } from "@/hooks/useTranslation";
import { fmtDate, fmtPctSigned, fmtPct, fmtRatio, returnColor, sharpeColor } from "@/lib/format";
import type { Period, Benchmark } from "@/types";
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

type ChartView = "performance"|"montecarlo"|"monthly"|"correlation"|"frontier";

const CHART_VIEWS: {key: ChartView, label: string}[] = [
  {key:"performance", label:"Performance"},
  {key:"montecarlo", label:"Monte Carlo"},
  {key:"monthly", label:"Mensuel"},
  {key:"correlation", label:"Corrélation"},
  {key:"frontier", label:"Frontière"},
];

function MetricCard({ label, value, sub, color="text-slate-900 dark:text-slate-100", metric, locale, dark }: {
  label:string; value:string; sub?:string; color?:string; metric?:string; locale?:string; dark?:boolean;
}) {
  return (
    <div className={`rounded-xl p-4 border transition-colors ${dark ? "bg-slate-800 border-slate-700 hover:border-slate-600" : "bg-slate-50 border-slate-100 hover:border-slate-200"}`}>
      <div className="flex items-center gap-0.5 mb-1">
        <p className={`text-xs font-medium ${dark ? "text-slate-400" : "text-slate-500"}`}>{label}</p>
        {metric && locale && <MetricTooltip metric={metric} lang={locale}/>}
      </div>
      <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className={`text-xs mt-0.5 ${dark ? "text-slate-500" : "text-slate-400"}`}>{sub}</p>}
    </div>
  );
}

function DashboardContent() {
  const { data, isLoading, error, run } = useBacktest();
  const { t, locale, setLocale } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [chartView, setChartView] = useState<ChartView>("performance");
  const [hideBenchmark, setHideBenchmark] = useState(false);
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [period, setPeriod] = useState<Period>("5y");
  const [benchmark, setBenchmark] = useState<string>("^GSPC");
  const [riskFreeRate, setRiskFreeRate] = useState(3.5);
  const [dark, setDark] = useState(false);
  const [openSection, setOpenSection] = useState<string|null>("performance");

  const getInitialAssets = () => {
    try {
      const raw = searchParams.get("assets");
      if (raw) {
        const parsed = JSON.parse(decodeURIComponent(raw));
        if (Array.isArray(parsed) && parsed.length > 0)
          return parsed.map((a: any) => ({ ticker: a.ticker, weight: a.weight }));
      }
    } catch {}
    return DEFAULT_ASSETS;
  };

  const [assets, setAssets] = useState(getInitialAssets);

  useEffect(() => {
    if (dark) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [dark]);

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
    setHideBenchmark(false);
    setHideBenchmark(false);
    run({ assets: assets.filter(a => a.ticker), period, start_date: period === "custom" ? customStartDate : undefined, benchmark: benchmark === "none" ? null : benchmark as Benchmark, risk_free_rate: riskFreeRate/100, lang: locale });
  };

  const bg = dark ? "bg-[#0f1117]" : "bg-slate-50";
  const bgCard = dark ? "bg-[#1e2130] border-slate-700" : "bg-white border-slate-200";
  const textPrimary = dark ? "text-slate-100" : "text-slate-900";
  const textSecondary = dark ? "text-slate-400" : "text-slate-500";
  const borderColor = dark ? "border-slate-700" : "border-slate-200";

  const periods: {value: Period, label: string}[] = [{value:"1y",label:"1A"},{value:"3y",label:"3A"},{value:"5y",label:"5A"},{value:"10y",label:"10A"},{value:"max",label:"Max"}];
  const benchmarks: {value:Benchmark|"none", label:string}[] = [
    {value:"none", label:"Sans benchmark"},
    {value:"^GSPC", label:"S&P 500"},
    {value:"URTH", label:"MSCI World"},
    {value:"^NDX", label:"Nasdaq"},
    {value:"^FCHI", label:"CAC 40"},
  ];

  const toggleSection = (key: string) => setOpenSection(p => p === key ? null : key);

  return (
    <div className={`min-h-screen ${bg} transition-colors duration-300`}>
      {/* Nav */}
      <header className={`${bgCard} border-b sticky top-0 z-20 transition-colors duration-300`}>
        <div className="max-w-screen-2xl mx-auto px-4 h-13 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/build")} className="flex items-center gap-2 hover:opacity-80">
              <img src="/logo.png" alt="Quantfolio" className="w-7 h-7 object-contain"/>
              <span className={`font-bold text-base tracking-tight ${textPrimary}`}>Quantfolio</span>
            </button>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${dark ? "border-slate-600 text-slate-400" : "border-slate-200 text-slate-400"}`}>Analyse</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => router.push("/build")}
              className={`text-xs border px-3 py-1.5 rounded-lg transition-colors ${dark ? "border-slate-600 text-slate-400 hover:border-slate-500" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
              ← Modifier
            </button>
            <select value={locale} onChange={e => setLocale(e.target.value as Locale)}
              className={`text-xs border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${dark ? "bg-slate-800 border-slate-600 text-slate-300" : "bg-white border-slate-200"}`}>
              {(Object.entries(LOCALE_LABELS) as [Locale,string][]).map(([v,l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <button onClick={() => setDark(d => !d)}
              className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors ${dark ? "border-slate-600 bg-slate-800 text-yellow-400" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"}`}>
              {dark ? "☀️" : "🌙"}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-screen-2xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* LEFT — Builder compact */}
          <aside className="lg:col-span-1 space-y-4">
            <div className={`${bgCard} border rounded-2xl p-4 shadow-sm`}>
              <div className="flex items-center justify-between mb-3">
                <h2 className={`text-sm font-semibold ${textPrimary}`}>Portefeuille</h2>
                <button onClick={() => router.push("/build")} className="text-xs text-indigo-500 hover:text-indigo-400">Modifier</button>
              </div>
              {(() => {
                const COLORS = ["#6366f1","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444","#ec4899","#84cc16"];
                return (
                  <div className="space-y-2 mb-3">
                    {assets.map((asset,i) => (
                      <div key={i} className={`flex items-center gap-2 p-2 rounded-xl border ${dark ? "border-slate-700 bg-slate-700/50" : "border-slate-100 bg-slate-50"}`}>
                        <div className="w-1.5 h-8 rounded-full flex-shrink-0" style={{backgroundColor: COLORS[i % COLORS.length]}}/>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-mono font-bold ${dark ? "text-slate-200" : "text-slate-800"}`}>{asset.ticker}</p>
                        </div>
                        <span className={`text-xs font-semibold tabular-nums ${dark ? "text-slate-300" : "text-slate-700"}`}>{asset.weight}%</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
              <div className="flex items-center justify-end mb-2">
                <span className={`text-xs font-semibold ${isBalanced?"text-emerald-500":"text-amber-500"}`}>
                  {totalWeight.toFixed(1)}% / 100%
                </span>
              </div>
              <div className={`w-full h-1 rounded-full mb-3 overflow-hidden ${dark ? "bg-slate-700" : "bg-slate-100"}`}>
                <div className={`h-full rounded-full transition-all ${isBalanced?"bg-emerald-500":totalWeight>100?"bg-red-400":"bg-amber-400"}`}
                  style={{width:`${Math.min(totalWeight,100)}%`}}/>
              </div>

              {/* Période & Benchmark */}
              <div className="space-y-2 mb-3">
                <div className="space-y-1.5">
                  <div className="flex gap-1 flex-wrap">
                    {periods.map(({value, label}) => (
                      <button key={value} onClick={() => setPeriod(value)}
                        className={`px-2 py-1 text-xs rounded-lg border transition-colors ${period === value ? "bg-indigo-600 text-white border-indigo-600" : dark ? "bg-slate-700 border-slate-600 text-slate-300 hover:border-indigo-400" : "bg-white border-slate-200 text-slate-600 hover:border-indigo-400"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`text-xs font-medium ${dark ? "text-slate-400" : "text-slate-500"}`}>Depuis</span>
                    <select
                      value={customStartDate ? new Date(customStartDate).getMonth() + 1 : ""}
                      onChange={e => {
                        const y = customStartDate ? new Date(customStartDate).getFullYear() : new Date().getFullYear();
                        const m = e.target.value;
                        if (m) { const d = `${y}-${String(m).padStart(2,"0")}-01`; setCustomStartDate(d); setPeriod("custom"); }
                      }}
                      className={`flex-1 border rounded-lg px-2 py-1 text-xs focus:outline-none transition-colors appearance-none cursor-pointer ${period === "custom" ? "bg-indigo-600 text-white border-indigo-600" : dark ? "bg-slate-700 border-slate-600 text-slate-300" : "bg-white border-slate-200 text-slate-600 hover:border-indigo-400"}`}>
                      <option value="">Mois</option>
                      {["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"].map((m,i) => (
                        <option key={i} value={i+1}>{m}</option>
                      ))}
                    </select>
                    <select
                      value={customStartDate ? new Date(customStartDate).getFullYear() : ""}
                      onChange={e => {
                        const m = customStartDate ? new Date(customStartDate).getMonth() + 1 : 1;
                        const y = e.target.value;
                        if (y) { const d = `${y}-${String(m).padStart(2,"0")}-01`; setCustomStartDate(d); setPeriod("custom"); }
                      }}
                      className={`flex-1 border rounded-lg px-2 py-1 text-xs focus:outline-none transition-colors appearance-none cursor-pointer ${period === "custom" ? "bg-indigo-600 text-white border-indigo-600" : dark ? "bg-slate-700 border-slate-600 text-slate-300" : "bg-white border-slate-200 text-slate-600 hover:border-indigo-400"}`}>
                      <option value="">Année</option>
                      {Array.from({length: new Date().getFullYear() - 1990 + 1}, (_,i) => new Date().getFullYear() - i).map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <p className={`text-xs mb-1 ${textSecondary}`}>Taux sans risque — {riskFreeRate.toFixed(1)}%</p>
                  <input type="range" min={0} max={10} step={0.1} value={riskFreeRate}
                    onChange={e => setRiskFreeRate(Number(e.target.value))} className="w-full accent-indigo-600"/>
                </div>
              </div>

              <button onClick={handleSubmit} disabled={!isBalanced||isLoading||assets.some(a=>!a.ticker)}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors flex items-center justify-center gap-2">
                {isLoading ? (
                  <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>Calcul...</>
                ) : "Lancer l'analyse"}
              </button>
            </div>

            {/* Score compact */}
            {data?.score && (
              <div className={`${bgCard} border rounded-2xl p-4 shadow-sm`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className={`text-xs font-semibold uppercase tracking-widest ${textSecondary}`}>Score Global</p>
                    <div className="flex items-end gap-1 mt-0.5">
                      <span className={`text-4xl font-bold ${(data.score as any).global_score >= 80 ? "text-emerald-500" : (data.score as any).global_score >= 65 ? "text-indigo-500" : (data.score as any).global_score >= 50 ? "text-amber-500" : "text-red-500"}`}>
                        {(data.score as any).global_score}
                      </span>
                      <span className={`text-sm mb-1 ${textSecondary}`}>/100</span>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold px-3 py-1 rounded-lg border ${(data.score as any).global_score >= 65 ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-amber-50 text-amber-700 border-amber-200"} ${dark ? "!bg-opacity-20" : ""}`}>
                    {locale === "fr" ? (data.score as any).profile : (data.score as any).profile_en}
                  </span>
                </div>
                <div className={`w-full h-2 rounded-full overflow-hidden ${dark ? "bg-slate-700" : "bg-slate-100"}`}>
                  <div className={`h-full rounded-full ${(data.score as any).global_score >= 80 ? "bg-emerald-500" : (data.score as any).global_score >= 65 ? "bg-indigo-500" : "bg-amber-500"}`}
                    style={{width:`${(data.score as any).global_score}%`}}/>
                </div>
                <div className="mt-3 space-y-1.5">
                  {Object.entries((data.score as any).scores).map(([key, val]: [string, any]) => (
                    <div key={key} className="flex items-center gap-2">
                      <div className={`w-full h-1 rounded-full overflow-hidden ${dark ? "bg-slate-700" : "bg-slate-100"}`}>
                        <div className={`h-full rounded-full ${val >= 20 ? "bg-emerald-400" : val >= 13 ? "bg-indigo-400" : "bg-amber-400"}`}
                          style={{width:`${(val/25)*100}%`}}/>
                      </div>
                      <span className={`text-xs w-6 text-right tabular-nums ${textSecondary}`}>{val}</span>
                    </div>
                  ))}
                </div>
                <p className={`text-xs mt-3 leading-relaxed ${textSecondary}`}>
                  {locale === "fr" ? (data.score as any).synthesis : (data.score as any).synthesis_en}
                </p>
              </div>
            )}

            {data && (
              <div className={`${bgCard} border rounded-2xl p-4 shadow-sm text-xs ${textSecondary}`}>
                <div className="flex justify-between mb-1"><span>Période</span><span className={`font-medium ${textPrimary}`}>{data.actual_period_years.toFixed(1)} ans</span></div>
                <div className="flex justify-between mb-1"><span>Du</span><span className={`font-medium ${textPrimary}`}>{fmtDate(data.period_start)}</span></div>
                <div className="flex justify-between"><span>Au</span><span className={`font-medium ${textPrimary}`}>{fmtDate(data.period_end)}</span></div>
              </div>
            )}
          </aside>

          {/* RIGHT — Graphique + Analyse */}
          <div className="lg:col-span-3 space-y-4">
            {error && <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700 text-sm"><strong>Erreur : </strong>{error}</div>}

            {isLoading && !data && (
              <div className={`${bgCard} border rounded-2xl p-16 flex flex-col items-center justify-center shadow-sm text-center`}>
                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"/>
                <p className={`font-medium ${textPrimary}`}>Analyse en cours...</p>
                <p className={`text-sm mt-1 ${textSecondary}`}>Récupération des données et calculs quantitatifs</p>
              </div>
            )}

            {!isLoading && !data && !error && (
              <div className={`${bgCard} border rounded-2xl p-16 flex flex-col items-center justify-center shadow-sm text-center`}>
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${dark ? "bg-slate-700" : "bg-indigo-50"}`}>
                  <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                  </svg>
                </div>
                <h2 className={`font-semibold text-lg mb-2 ${textPrimary}`}>Configurez votre portefeuille</h2>
                <p className={`text-sm max-w-xs leading-relaxed ${textSecondary}`}>Ajustez les actifs et les poids à gauche puis lancez l'analyse</p>
              </div>
            )}

            {data && (
              <>
                {/* Graphique central */}
                <div className={`${bgCard} border rounded-2xl shadow-sm overflow-hidden`}>
                  {/* Switcher */}
                  <div className={`flex gap-1 p-3 border-b overflow-x-auto ${borderColor}`}>
                    {CHART_VIEWS.map(({key, label}) => (
                      <button key={key} onClick={() => setChartView(key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                          chartView === key
                            ? "bg-indigo-600 text-white"
                            : dark ? "text-slate-400 hover:text-slate-200 hover:bg-slate-700" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Graphique */}
                  <div style={{height: "500px", padding: "16px", boxSizing: "border-box"}}>
                    {chartView === "performance" && (
                      <GrowthChart
                        portfolioData={data.portfolio_growth}
                        benchmarkData={hideBenchmark ? [] : (data.benchmark_growth || [])}
                        benchmarkName={data.benchmark?.name || ""}
                        portfolioLabel="Portefeuille"
                        drawdownData={data.drawdown_series}
                        benchmarkDrawdownData={(data as any).benchmark_drawdown_series}
                        onRemoveBenchmark={() => setHideBenchmark(true)}
                        onRemoveBenchmark={() => setHideBenchmark(true)}
                      />
                    )}
                    {chartView === "drawdown" && <DrawdownChart data={data.drawdown_series}/>}
                    {chartView === "montecarlo" && (
                      <MonteCarloPanel assets={assets} period={period} locale={locale} t={t}/>
                    )}
                    {chartView === "monthly" && <MonthlyReturnsChart data={data.monthly_returns}/>}
                    {chartView === "correlation" && <CorrelationHeatmap data={data.correlation}/>}
                    {chartView === "frontier" && data.efficient_frontier && (() => {
                      const { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Label } = require("recharts");
                      const ef = data.efficient_frontier as any;
                      const frontierData = ef.frontier.map((p:any) => ({ x: +(p.volatility*100).toFixed(2), y: +(p.return*100).toFixed(2), sharpe: p.sharpe }));
                      const msPoint = [{ x: +(ef.max_sharpe.volatility*100).toFixed(2), y: +(ef.max_sharpe.return*100).toFixed(2) }];
                      const mvPoint = [{ x: +(ef.min_variance.volatility*100).toFixed(2), y: +(ef.min_variance.return*100).toFixed(2) }];
                      const assetsData = ef.assets.map((a:any) => ({ x: +(a.volatility*100).toFixed(2), y: +(a.return*100).toFixed(2), name: a.ticker }));
                      return (
                        <ResponsiveContainer width="100%" height="100%">
                          <ScatterChart margin={{top:20,right:30,bottom:30,left:30}}>
                            <CartesianGrid strokeDasharray="3 3" stroke={dark ? "#2a2d3e" : "#f1f5f9"}/>
                            <XAxis type="number" dataKey="x" name="Volatilité" domain={["auto","auto"]} tick={{fill: dark ? "#64748b" : "#94a3b8", fontSize:11}} tickFormatter={(v:number) => `${v.toFixed(0)}%`}>
                              <Label value="Volatilité annualisée" offset={-10} position="insideBottom" style={{fontSize:11,fill: dark ? "#64748b" : "#94a3b8"}}/>
                            </XAxis>
                            <YAxis type="number" dataKey="y" name="Rendement" domain={["auto","auto"]} tick={{fill: dark ? "#64748b" : "#94a3b8", fontSize:11}} tickFormatter={(v:number) => `${v.toFixed(0)}%`}>
                              <Label value="Rendement attendu" angle={-90} position="insideLeft" style={{fontSize:11,fill: dark ? "#64748b" : "#94a3b8"}}/>
                            </YAxis>
                            <Tooltip content={({payload}:any) => {
                              if (!payload?.length) return null;
                              const d = payload[0]?.payload;
                              return (
                                <div className={`border rounded-lg p-2 text-xs shadow ${dark ? "bg-slate-800 border-slate-600 text-slate-200" : "bg-white border-slate-200"}`}>
                                  <p>Vol: <strong>{d.x}%</strong></p>
                                  <p>Rdt: <strong>{d.y}%</strong></p>
                                  {d.sharpe && <p>Sharpe: <strong>{d.sharpe?.toFixed(2)}</strong></p>}
                                  {d.name && <p>Actif: <strong>{d.name}</strong></p>}
                                </div>
                              );
                            }}/>
                            <Scatter data={frontierData} fill="#6366f1" opacity={0.7} r={3}/>
                            <Scatter data={msPoint} fill="#f59e0b" r={8}/>
                            <Scatter data={mvPoint} fill="#10b981" r={8}/>
                            <Scatter data={assetsData} fill="#ef4444" r={6} shape="diamond"/>
                          </ScatterChart>
                        </ResponsiveContainer>
                      );
                    })()}
                  </div>
                </div>

                {/* Analyse détaillée — Accordéons */}
                <div className="space-y-2">
                  {/* Performance */}
                  <div className={`${bgCard} border rounded-2xl overflow-hidden shadow-sm`}>
                    <button onClick={() => toggleSection("performance")}
                      className={`w-full flex items-center justify-between px-5 py-4 text-left transition-colors ${dark ? "hover:bg-slate-700" : "hover:bg-slate-50"}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                          <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
                          </svg>
                        </div>
                        <div>
                          <p className={`text-sm font-semibold ${textPrimary}`}>Performance</p>
                          <p className={`text-xs ${textSecondary}`}>Rendement total, CAGR, comparaison benchmark</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-bold ${returnColor(data.portfolio.total_return)}`}>{fmtPctSigned(data.portfolio.total_return)}</span>
                        <svg className={`w-4 h-4 ${textSecondary} transition-transform ${openSection==="performance" ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                        </svg>
                      </div>
                    </button>
                    {openSection === "performance" && (
                      <div className={`px-5 pb-5 border-t ${borderColor}`}>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-4">
                          <MetricCard label="Rendement Total" value={fmtPctSigned(data.portfolio.total_return)} color={returnColor(data.portfolio.total_return)} metric="totalReturn" locale={locale} dark={dark}/>
                          <MetricCard label="TCAC" value={fmtPctSigned(data.portfolio.cagr)} sub="annualisé" color={returnColor(data.portfolio.cagr)} metric="cagr" locale={locale} dark={dark}/>
                          {data.benchmark && <MetricCard label="vs Benchmark" value={fmtPctSigned(data.benchmark.excess_return)} sub={`vs ${data.benchmark.name}`} color={returnColor(data.benchmark.excess_return)} dark={dark}/>}
                          <MetricCard label="Meilleure journée" value={fmtPctSigned(data.portfolio.best_day)} color="text-emerald-500" dark={dark}/>
                          <MetricCard label="Pire journée" value={fmtPctSigned(data.portfolio.worst_day)} color="text-red-500" dark={dark}/>
                          <MetricCard label="Jours positifs" value={fmtPct(data.portfolio.positive_days_pct)} dark={dark}/>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Risque */}
                  <div className={`${bgCard} border rounded-2xl overflow-hidden shadow-sm`}>
                    <button onClick={() => toggleSection("risk")}
                      className={`w-full flex items-center justify-between px-5 py-4 text-left transition-colors ${dark ? "hover:bg-slate-700" : "hover:bg-slate-50"}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                          <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                          </svg>
                        </div>
                        <div>
                          <p className={`text-sm font-semibold ${textPrimary}`}>Risque</p>
                          <p className={`text-xs ${textSecondary}`}>Volatilité, drawdown, VaR</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-red-500">{fmtPctSigned(data.portfolio.max_drawdown)}</span>
                        <svg className={`w-4 h-4 ${textSecondary} transition-transform ${openSection==="risk" ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                        </svg>
                      </div>
                    </button>
                    {openSection === "risk" && (
                      <div className={`px-5 pb-5 border-t ${borderColor}`}>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-4">
                          <MetricCard label="Volatilité" value={fmtPct(data.portfolio.annualized_volatility)} sub="annualisée" metric="volatility" locale={locale} dark={dark}/>
                          <MetricCard label="Drawdown Max" value={fmtPctSigned(data.portfolio.max_drawdown)} color="text-red-500" metric="maxDrawdown" locale={locale} dark={dark}/>
                          <MetricCard label="VaR 95%" value={fmtPctSigned(data.portfolio.var_95_historical)} sub="historique" color="text-orange-500" metric="var95" locale={locale} dark={dark}/>
                          <MetricCard label="Sharpe" value={fmtRatio(data.portfolio.sharpe_ratio)} color={sharpeColor(data.portfolio.sharpe_ratio)} metric="sharpe" locale={locale} dark={dark}/>
                          <MetricCard label="Sortino" value={fmtRatio(data.portfolio.sortino_ratio)} color={sharpeColor(data.portfolio.sortino_ratio)} metric="sortino" locale={locale} dark={dark}/>
                          <MetricCard label="Calmar" value={fmtRatio(data.portfolio.calmar_ratio)} metric="calmar" locale={locale} dark={dark}/>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Contribution au risque */}
                  {data.risk_contribution && (
                    <div className={`${bgCard} border rounded-2xl overflow-hidden shadow-sm`}>
                      <button onClick={() => toggleSection("riskcontrib")}
                        className={`w-full flex items-center justify-between px-5 py-4 text-left transition-colors ${dark ? "hover:bg-slate-700" : "hover:bg-slate-50"}`}>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                            <svg className="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                            </svg>
                          </div>
                          <div>
                            <p className={`text-sm font-semibold ${textPrimary}`}>Contribution au risque</p>
                            <p className={`text-xs ${textSecondary}`}>Part de chaque actif dans la volatilité totale</p>
                          </div>
                        </div>
                        <svg className={`w-4 h-4 ${textSecondary} transition-transform ${openSection==="riskcontrib" ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                        </svg>
                      </button>
                      {openSection === "riskcontrib" && (
                        <div className={`px-5 pb-5 border-t ${borderColor}`}>
                          <div className="space-y-3 pt-4">
                            {Object.entries((data.risk_contribution as any).assets)
                              .sort((a:any,b:any) => b[1].rel_risk_contribution - a[1].rel_risk_contribution)
                              .map(([ticker, info]: [string, any]) => (
                              <div key={ticker}>
                                <div className="flex items-center justify-between text-xs mb-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-indigo-500">{ticker}</span>
                                    <span className={textSecondary}>Poids : {(info.weight*100).toFixed(1)}%</span>
                                  </div>
                                  <span className={`font-semibold ${info.rel_risk_contribution > info.weight ? "text-red-500" : "text-emerald-500"}`}>
                                    {(info.rel_risk_contribution*100).toFixed(1)}% du risque
                                  </span>
                                </div>
                                <div className={`w-full h-2 rounded-full overflow-hidden ${dark ? "bg-slate-700" : "bg-slate-100"}`}>
                                  <div className={`h-full rounded-full ${info.rel_risk_contribution > info.weight ? "bg-red-400" : "bg-emerald-400"}`}
                                    style={{width:`${Math.min(info.rel_risk_contribution*100,100)}%`}}/>
                                </div>
                              </div>
                            ))}
                            <p className={`text-xs mt-1 ${textSecondary}`}>Rouge = contribution supérieure au poids · Vert = contribution inférieure</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Markowitz */}
                  {data.markowitz && (
                    <div className={`${bgCard} border rounded-2xl overflow-hidden shadow-sm`}>
                      <button onClick={() => toggleSection("markowitz")}
                        className={`w-full flex items-center justify-between px-5 py-4 text-left transition-colors ${dark ? "hover:bg-slate-700" : "hover:bg-slate-50"}`}>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                            <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"/>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"/>
                            </svg>
                          </div>
                          <div>
                            <p className={`text-sm font-semibold ${textPrimary}`}>Optimisation Markowitz</p>
                            <p className={`text-xs ${textSecondary}`}>Allocation optimale — Sharpe max et variance min</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-indigo-500">Sharpe {(data.markowitz as any).max_sharpe.sharpe_ratio.toFixed(2)}</span>
                          <svg className={`w-4 h-4 ${textSecondary} transition-transform ${openSection==="markowitz" ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                          </svg>
                        </div>
                      </button>
                      {openSection === "markowitz" && (
                        <div className={`px-5 pb-5 border-t ${borderColor}`}>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                            <div className={`rounded-xl p-4 border ${dark ? "bg-indigo-900/20 border-indigo-800" : "bg-indigo-50 border-indigo-200"}`}>
                              <p className="text-xs font-bold text-indigo-600 mb-3">Sharpe Maximum</p>
                              <div className="space-y-2 mb-3">
                                {Object.entries((data.markowitz as any).max_sharpe.weights).sort((a:any,b:any)=>b[1]-a[1]).map(([ticker,w]:any) => (
                                  <div key={ticker}>
                                    <div className="flex justify-between text-xs mb-1">
                                      <span className="font-mono font-bold text-indigo-600">{ticker}</span>
                                      <span className="font-semibold">{(w*100).toFixed(1)}%</span>
                                    </div>
                                    <div className={`w-full h-1.5 rounded-full overflow-hidden ${dark ? "bg-indigo-900" : "bg-indigo-100"}`}>
                                      <div className="h-full bg-indigo-500 rounded-full" style={{width:`${w*100}%`}}/>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div className="grid grid-cols-3 gap-1 text-center text-xs pt-2 border-t border-indigo-200">
                                <div><p className="text-indigo-400">Rdt</p><p className="font-bold text-indigo-600">{((data.markowitz as any).max_sharpe.expected_return*100).toFixed(1)}%</p></div>
                                <div><p className="text-indigo-400">Vol</p><p className="font-bold text-indigo-600">{((data.markowitz as any).max_sharpe.expected_volatility*100).toFixed(1)}%</p></div>
                                <div><p className="text-indigo-400">Sharpe</p><p className="font-bold text-indigo-600">{(data.markowitz as any).max_sharpe.sharpe_ratio.toFixed(2)}</p></div>
                              </div>
                            </div>
                            <div className={`rounded-xl p-4 border ${dark ? "bg-emerald-900/20 border-emerald-800" : "bg-emerald-50 border-emerald-200"}`}>
                              <p className="text-xs font-bold text-emerald-600 mb-3">Variance Minimale</p>
                              <div className="space-y-2 mb-3">
                                {Object.entries((data.markowitz as any).min_variance.weights).sort((a:any,b:any)=>b[1]-a[1]).map(([ticker,w]:any) => (
                                  <div key={ticker}>
                                    <div className="flex justify-between text-xs mb-1">
                                      <span className="font-mono font-bold text-emerald-600">{ticker}</span>
                                      <span className="font-semibold">{(w*100).toFixed(1)}%</span>
                                    </div>
                                    <div className={`w-full h-1.5 rounded-full overflow-hidden ${dark ? "bg-emerald-900" : "bg-emerald-100"}`}>
                                      <div className="h-full bg-emerald-500 rounded-full" style={{width:`${w*100}%`}}/>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div className="grid grid-cols-2 gap-1 text-center text-xs pt-2 border-t border-emerald-200">
                                <div><p className="text-emerald-400">Rdt</p><p className="font-bold text-emerald-600">{((data.markowitz as any).min_variance.expected_return*100).toFixed(1)}%</p></div>
                                <div><p className="text-emerald-400">Vol</p><p className="font-bold text-emerald-600">{((data.markowitz as any).min_variance.expected_volatility*100).toFixed(1)}%</p></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Commentaires */}
                  <div className={`${bgCard} border rounded-2xl overflow-hidden shadow-sm`}>
                    <button onClick={() => toggleSection("commentary")}
                      className={`w-full flex items-center justify-between px-5 py-4 text-left transition-colors ${dark ? "hover:bg-slate-700" : "hover:bg-slate-50"}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                          <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                          </svg>
                        </div>
                        <div>
                          <p className={`text-sm font-semibold ${textPrimary}`}>Analyse automatique</p>
                          <p className={`text-xs ${textSecondary}`}>Commentaires générés sur la performance et le risque</p>
                        </div>
                      </div>
                      <svg className={`w-4 h-4 ${textSecondary} transition-transform ${openSection==="commentary" ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                      </svg>
                    </button>
                    {openSection === "commentary" && (
                      <div className={`px-5 pb-5 border-t ${borderColor}`}>
                        <div className="space-y-3 pt-4">
                          {(Object.keys(data.commentary) as (keyof typeof data.commentary)[]).map(key => (
                            <div key={key} className={`flex gap-3 p-3 rounded-xl border ${dark ? "bg-slate-700 border-slate-600" : "bg-slate-50 border-slate-100"}`}>
                              <div>
                                <p className={`text-xs font-semibold uppercase tracking-widest mb-1 ${dark ? "text-slate-400" : "text-slate-400"}`}>{t(`commentary.${key}`)}</p>
                                <p className={`text-sm leading-relaxed ${textPrimary}`}>{data.commentary[key]}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Projections Monte Carlo */}
                  <div className={`${bgCard} border rounded-2xl overflow-hidden shadow-sm`}>
                    <button onClick={() => toggleSection("montecarlo")}
                      className={`w-full flex items-center justify-between px-5 py-4 text-left transition-colors ${dark ? "hover:bg-slate-700" : "hover:bg-slate-50"}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                          <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/>
                          </svg>
                        </div>
                        <div>
                          <p className={`text-sm font-semibold ${textPrimary}`}>Projections Monte Carlo</p>
                          <p className={`text-xs ${textSecondary}`}>500 simulations — probabilité d'atteindre vos objectifs</p>
                        </div>
                      </div>
                      <svg className={`w-4 h-4 ${textSecondary} transition-transform ${openSection==="montecarlo" ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                      </svg>
                    </button>
                    {openSection === "montecarlo" && (
                      <div className={`px-5 pb-5 border-t ${borderColor}`}>
                        <div className="pt-4">
                          <MonteCarloPanel assets={assets} period={period} locale={locale} t={t}/>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actifs détaillés */}
                  <div className={`${bgCard} border rounded-2xl overflow-hidden shadow-sm`}>
                    <button onClick={() => toggleSection("assets")}
                      className={`w-full flex items-center justify-between px-5 py-4 text-left transition-colors ${dark ? "hover:bg-slate-700" : "hover:bg-slate-50"}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                          <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                          </svg>
                        </div>
                        <div>
                          <p className={`text-sm font-semibold ${textPrimary}`}>Détail par actif</p>
                          <p className={`text-xs ${textSecondary}`}>Performance individuelle de chaque actif</p>
                        </div>
                      </div>
                      <svg className={`w-4 h-4 ${textSecondary} transition-transform ${openSection==="assets" ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                      </svg>
                    </button>
                    {openSection === "assets" && (
                      <div className={`px-5 pb-5 border-t ${borderColor}`}>
                        <div className="overflow-x-auto pt-4">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className={`text-left text-xs font-semibold uppercase tracking-widest border-b ${dark ? "text-slate-500 border-slate-700" : "text-slate-400 border-slate-100"}`}>
                                {["Ticker","Poids","Rendement","TCAC","Vol","Sharpe","Contribution"].map(k => (
                                  <th key={k} className="pb-3 pr-4 last:pr-0 last:text-right text-right first:text-left">{k}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className={`divide-y ${dark ? "divide-slate-700" : "divide-slate-50"}`}>
                              {data.assets.map(a => (
                                <tr key={a.ticker} className={`transition-colors ${dark ? "hover:bg-slate-700" : "hover:bg-slate-50"}`}>
                                  <td className="py-3 pr-4 font-mono font-bold text-indigo-500">{a.ticker}</td>
                                  <td className={`py-3 pr-4 text-right tabular-nums ${textSecondary}`}>{a.weight.toFixed(1)}%</td>
                                  <td className={`py-3 pr-4 text-right tabular-nums font-medium ${returnColor(a.total_return)}`}>{(a.total_return*100).toFixed(1)}%</td>
                                  <td className={`py-3 pr-4 text-right tabular-nums ${returnColor(a.cagr)}`}>{(a.cagr*100).toFixed(1)}%</td>
                                  <td className={`py-3 pr-4 text-right tabular-nums ${textSecondary}`}>{(a.volatility*100).toFixed(1)}%</td>
                                  <td className={`py-3 pr-4 text-right tabular-nums font-medium ${sharpeColor(a.sharpe)}`}>{a.sharpe.toFixed(2)}</td>
                                  <td className={`py-3 text-right tabular-nums ${returnColor(a.contribution_to_return)}`}>{(a.contribution_to_return*100).toFixed(1)}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
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
