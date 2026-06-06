"use client";
import { useState, useRef, useEffect } from "react";

const ETF_LIST = [
  { ticker: "^GSPC", name: "S&P 500", color: "#f59e0b" },
  { ticker: "^FCHI", name: "CAC 40", color: "#10b981" },
  { ticker: "^GDAXI", name: "DAX 40", color: "#6366f1" },
  { ticker: "^IXIC", name: "NASDAQ", color: "#ec4899" },
  { ticker: "^FTSE", name: "FTSE 100", color: "#0ea5e9" },
  { ticker: "^N225", name: "Nikkei 225", color: "#f97316" },
];
import { ResponsiveContainer, LineChart, AreaChart, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ReferenceDot, ReferenceArea, Customized } from "recharts";

interface DataPoint { date: string; [key: string]: number | string; }

interface Props {
  portfolioData: DataPoint[];
  benchmarkData: DataPoint[];
  benchmarkName: string;
  portfolioLabel: string;
  drawdownData?: { date: string; drawdown: number; drawdown_eur: number }[];
  benchmarkDrawdownData?: { date: string; drawdown: number }[];
  onRemoveBenchmark?: () => void;
  portfolioColor?: string;
  onExitFullscreen?: () => void;
}

export default function GrowthChart({ portfolioData, benchmarkData, benchmarkName, portfolioLabel, drawdownData, benchmarkDrawdownData, onRemoveBenchmark, onExitFullscreen, portfolioColor = "#4f46e5" }: Props) {
  const [hoverRow, setHoverRow] = useState<Record<string, any> | null>(null);
  const [hoverPerfs, setHoverPerfs] = useState<Record<string, number> | null>(null);
  const [periodFilter, setPeriodFilter] = useState<"1M"|"3M"|"6M"|"1A"|"3A"|"Max">("Max");
  const [extraSeries, setExtraSeries] = useState<{ticker: string, name: string, color: string, data: {date:string,value:number}[]}[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [savedPortfolios, setSavedPortfolios] = useState<any[]>([]);

  useEffect(() => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    fetch(`${API_URL}/api/v1/portfolios`)
      .then(r => r.json())
      .then(setSavedPortfolios)
      .catch(() => {});
  }, []);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    setTimeout(() => window.dispatchEvent(new Event("resize")), 100);
  }, [fullscreen]);
  const [showShare, setShowShare] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) setShowShare(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const [loadingTicker, setLoadingTicker] = useState<string|null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (extraSeries.length === 0) return;
    const reload = async () => {
      const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      const startDate = portfolioData.length > 0 ? portfolioData[0].date : null;
      const updated = await Promise.all(extraSeries.map(async s => {
        const savedP = savedPortfolios.find((p: any) => p.id === s.ticker);
        if (savedP) return s; // les portefeuilles sauvegardés gardent leurs données
        const url = startDate
          ? `${API_URL}/api/v1/compare?ticker=${s.ticker}&period=Max&start=${startDate}`
          : `${API_URL}/api/v1/compare?ticker=${s.ticker}&period=Max`;
        const res = await fetch(url);
        const json = await res.json();
        if (!json.data?.length) return s;
        return {...s, data: json.data};
      }));
      setExtraSeries(updated);
    };
    reload();
  }, [periodFilter]);

  const addSeries = async (etf: {ticker:string, name:string, color:string}) => {
    if (extraSeries.length >= 3) return;
    if (extraSeries.find(s => s.ticker === etf.ticker)) return;
    setLoadingTicker(etf.ticker);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      const savedP = savedPortfolios.find((p: any) => p.id === etf.ticker);
      let data: any[] = [];
      if (savedP) {
        const res = await fetch(`${API_URL}/api/v1/backtest`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            assets: savedP.assets,
            period: "max",
            benchmark: null,
            risk_free_rate: 0.035,
          }),
        });
        const json = await res.json();
        data = json.portfolio_growth || [];
      } else {
        const startDate = portfolioData.length > 0 ? portfolioData[0].date : null;
        const url = startDate
          ? `${API_URL}/api/v1/compare?ticker=${etf.ticker}&period=Max&start=${startDate}`
          : `${API_URL}/api/v1/compare?ticker=${etf.ticker}&period=Max`;
        const res = await fetch(url);
        const json = await res.json();
        data = json.data || [];
      }
      if (data.length > 0) {
        setExtraSeries(prev => [...prev, {...etf, data}]);
      }
    } finally {
      setLoadingTicker(null);
      setShowDropdown(false);
    }
  };

  const removeSeries = (ticker: string) => {
    setExtraSeries(prev => prev.filter(s => s.ticker !== ticker));
  };
  const sampled = (() => {
    const merged: Record<string, DataPoint> = {};
    portfolioData.forEach(p => { merged[p.date] = { ...merged[p.date], date: p.date, [portfolioLabel]: p.value }; });
    benchmarkData.forEach(p => { merged[p.date] = { ...merged[p.date], date: p.date, [benchmarkName]: p.value }; });
    const arr = Object.values(merged).sort((a,b) => a.date < b.date ? -1 : 1);
    if (arr.length <= 300) return arr;
    const step = Math.ceil(arr.length / 300);
    return arr.filter((_,i) => i % step === 0 || i === arr.length - 1);
  })();

  const bmDrawdownSampled = (() => {
    if (!benchmarkDrawdownData || benchmarkDrawdownData.length === 0) return [];
    const months = {"1M":1,"3M":3,"6M":6,"1A":12,"3A":36,"Max":999}[periodFilter] || 999;
    let filtered = benchmarkDrawdownData;
    if (periodFilter !== "Max") {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - months);
      const cutoffStr = cutoff.toISOString().slice(0,10);
      filtered = benchmarkDrawdownData.filter(p => p.date >= cutoffStr);
    }
    if (filtered.length <= 300) return filtered;
    const step = Math.ceil(filtered.length / 300);
    return filtered.filter((_,i) => i % step === 0 || i === filtered.length - 1);
  })();

  const drawdownSampled = (() => {
    if (!drawdownData || drawdownData.length === 0) return [];
    const months = {"1M":1,"3M":3,"6M":6,"1A":12,"3A":36,"Max":0}[periodFilter] || 0;
    let filtered = drawdownData;
    if (periodFilter !== "Max") {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - months);
      const cutoffStr = cutoff.toISOString().slice(0,10);
      filtered = drawdownData.filter(p => p.date >= cutoffStr);
    }
    if (filtered.length <= 300) return filtered;
    const step = Math.ceil(filtered.length / 300);
    return filtered.filter((_,i) => i % step === 0 || i === filtered.length - 1);
  })();

  const formatDate = (d: string) => {
    try {
      const months = {"1M":1,"3M":3,"6M":6,"1A":12,"3A":36,"Max":0}[periodFilter] || 0;
      const date = new Date(d);
      if (months <= 3) return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
      if (months <= 12) return date.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
      if (months <= 60) return date.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
      return date.getFullYear().toString();
    }
    catch { return d; }
  };

  const formatYAxis = (v: number) => {
    if (!v || isNaN(v)) return "";
    return new Intl.NumberFormat("fr-FR", {minimumFractionDigits:2, maximumFractionDigits:2}).format(v) + " EUR";
  };
  const formatYAxisShort = (v: number) => {
    if (!v || isNaN(v)) return "";
    return new Intl.NumberFormat("fr-FR", {minimumFractionDigits:2, maximumFractionDigits:2}).format(v);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    useEffect(() => {
      if (active && payload?.length) {
        const perfs: Record<string, number> = {};
        const firstVal = displayedData.length > 0 ? (displayedData[0][portfolioLabel] as number) : 10000;
        const ptfPayload = payload.find((p:any) => p.dataKey === portfolioLabel);
        if (ptfPayload && firstVal) perfs[portfolioLabel] = ((ptfPayload.value - firstVal) / firstVal * 100);
        const bFirst = displayedData.length > 0 ? (displayedData[0][benchmarkName] as number) : null;
        const bmPayload = payload.find((p:any) => p.dataKey === benchmarkName);
        if (bmPayload && bFirst) perfs[benchmarkName] = ((bmPayload.value - bFirst) / bFirst * 100);
        extraSeries.forEach((s:any) => {
          const sp = payload.find((p:any) => p.dataKey === s.ticker);
          if (sp) perfs[s.ticker] = ((sp.value - 10000) / 10000 * 100);
        });
        setHoverPerfs(perfs);
      } else {
        setHoverPerfs(null);
      }
    }, [active, payload]);
    if (!active || !payload?.length) return null;
    const ptfPayload = payload.find((p:any) => p.dataKey === portfolioLabel);
    const bmPayload = payload.find((p:any) => p.dataKey === benchmarkName);
    const ptfVal = ptfPayload?.value;
    const bmVal = bmPayload?.value;

    const firstVal = displayedData.length > 0 ? (displayedData[0][portfolioLabel] as number) : 10000;
    const ptfPct = ptfVal ? ((ptfVal - firstVal) / firstVal * 100) : null;

    const bFirstPoint = benchmarkData.length > 0 ? benchmarkData.find(p => p.date >= (displayedData[0]?.date as string || "")) : null;
    const bFirst = bFirstPoint?.value || bmVal;
    const bmPct = bmVal && bFirst ? ((bmVal - bFirst) / bFirst * 100) : null;
    const alpha = ptfPct !== null && bmPct !== null ? ptfPct - bmPct : null;

    const ddPoint = (() => {
      if (!drawdownData?.length) return null;
      const exact = drawdownData.find(p => p.date === label);
      if (exact) return exact;
      // Trouver le point le plus proche
      const sorted = [...drawdownData].sort((a,b) => Math.abs(new Date(a.date).getTime() - new Date(label).getTime()) - Math.abs(new Date(b.date).getTime() - new Date(label).getTime()));
      return sorted[0] || null;
    })();

  return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs min-w-[180px]">
        <p className="text-slate-400 font-medium mb-2">{new Date(label).toLocaleDateString('fr-FR', {day:'numeric', month:'short', year:'numeric'})}</p>
        {ptfVal && <div className="flex justify-between mb-1">
          <span className="text-indigo-500 font-semibold">Portefeuille</span>
          <span className="font-bold text-indigo-500">{formatYAxis(ptfVal)}</span>
        </div>}
        {bmVal && <div className="flex justify-between mb-1">
          <span className="text-amber-500 font-semibold">{benchmarkName}</span>
          <span className="font-bold text-amber-500">{formatYAxis(bmVal)}</span>
        </div>}
        {extraSeries.map(s => {
          const sPayload = payload.find((p:any) => p.dataKey === s.ticker);
          const sVal = sPayload?.value;
          if (!sVal) return null;
          return (
            <div key={s.ticker} className="flex justify-between mb-1">
              <span className="font-semibold" style={{color: s.color}}>{s.name}</span>
              <span className="font-bold" style={{color: s.color}}>{formatYAxis(sVal)}</span>
            </div>
          );
        })}
        {ptfPct !== null && <div className="flex justify-between border-t border-slate-100 pt-2 mb-1">
          <span className="text-slate-500">Perf. ptf</span>
          <span className={`font-semibold ${ptfPct >= 0 ? "text-emerald-500" : "text-red-500"}`}>{ptfPct >= 0 ? "+" : ""}{ptfPct.toFixed(1)}%</span>
        </div>}
        {bmPct !== null && <div className="flex justify-between mb-1">
          <span className="text-slate-500">Perf. idx</span>
          <span className={`font-medium ${bmPct >= 0 ? "text-emerald-500" : "text-red-400"}`}>{bmPct >= 0 ? "+" : ""}{bmPct.toFixed(1)}%</span>
        </div>}
        {alpha !== null && <div className="flex justify-between mb-1">
          <span className="text-slate-500">Alpha</span>
          <span className={`font-bold ${alpha >= 0 ? "text-emerald-500" : "text-red-500"}`}>{alpha >= 0 ? "+" : ""}{alpha.toFixed(1)}%</span>
        </div>}
        {ddPoint && <div className="flex justify-between border-t border-slate-100 pt-2 mt-1">
          <span className="text-slate-500">Drawdown</span>
          <span className="font-medium text-red-500">{ddPoint.drawdown.toFixed(1)}%</span>
        </div>}
      </div>
    );
  };

  const DrawdownTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-2 text-xs">
        <span className="font-bold text-red-500">{payload[0]?.value.toFixed(1)}%</span>
      </div>
    );
  };

  const mergedDrawdown = (() => {
    if (!drawdownSampled.length) return drawdownSampled;
    if (!bmDrawdownSampled.length) return drawdownSampled;
    const bmMap: Record<string, number> = {};
    bmDrawdownSampled.forEach(p => { bmMap[p.date] = p.drawdown; });
    return drawdownSampled.map(p => ({
      ...p,
      bmDrawdown: bmMap[p.date] !== undefined ? bmMap[p.date] : null,
    }));
  })();

  const displayedData = (() => {
    const months = {"1M":1,"3M":3,"6M":6,"1A":12,"3A":36,"Max":0}[periodFilter] || 0;
    const allMerged: Record<string, any> = {};
    portfolioData.forEach(p => { allMerged[p.date] = { ...allMerged[p.date], date: p.date, [portfolioLabel]: p.value }; });
    const ptfDates = Object.values(allMerged).filter((p:any) => p[portfolioLabel] !== undefined).sort((a:any,b:any) => a.date < b.date ? -1 : 1);
    const cutoffDate = ptfDates.length > 0 ? ptfDates[0].date : null;
    extraSeries.forEach(s => {
      const filtered = cutoffDate ? s.data.filter((p:any) => p.date >= cutoffDate) : s.data;
      const firstVal = filtered.length > 0 ? filtered[0].value : null;
      filtered.forEach((p:any) => {
        const normalized = firstVal ? Math.round(p.value / firstVal * 10000 * 100) / 100 : p.value;
        allMerged[p.date] = { ...allMerged[p.date], date: p.date, [s.ticker]: normalized };
      });
    });
    benchmarkData.forEach(p => { allMerged[p.date] = { ...allMerged[p.date], date: p.date, [benchmarkName]: p.value }; });
    const all = Object.values(allMerged).sort((a,b) => a.date < b.date ? -1 : 1);
    // Garder seulement les dates où le portefeuille existe
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = cutoff.toISOString().slice(0,10);
    const filtered = months === 0 ? all : all.filter((p:any) => p.date >= cutoffStr);
    if (filtered.length <= 300) return filtered;
    const step = Math.ceil(filtered.length / 300);
    return filtered.filter((_:any, i:number) => i % step === 0 || i === filtered.length - 1);
  })();
  const lastPortfolioValue = displayedData.length > 0 ? (displayedData[displayedData.length-1][portfolioLabel] as number) : null;
  const lastBenchmarkValue = displayedData.length > 0 ? (displayedData[displayedData.length-1][benchmarkName] as number) : null;

  const CustomYAxisTick = (props: any) => {
    const { x, y, payload } = props;
    const v = payload.value;
    const fmt = new Intl.NumberFormat("fr-FR", {minimumFractionDigits:2, maximumFractionDigits:2}).format(v);
    const isPortfolio = lastPortfolioValue !== null && Math.abs(v - lastPortfolioValue) < Math.abs(lastPortfolioValue * 0.003);
    const isBenchmark = lastBenchmarkValue !== null && Math.abs(v - lastBenchmarkValue) < Math.abs(lastBenchmarkValue * 0.003);
    if (isPortfolio) {
      return (
        <g>
          <rect x={x} y={y-10} width={70} height={20} rx={3} fill="#4f46e5"/>
          <text x={x+35} y={y+5} textAnchor="middle" fill="white" fontSize={10} fontWeight="600">{fmt}</text>
        </g>
      );
    }
    if (isBenchmark) {
      return (
        <g>
          <rect x={x} y={y-10} width={70} height={20} rx={3} fill="#f59e0b"/>
          <text x={x+35} y={y+5} textAnchor="middle" fill="white" fontSize={10} fontWeight="600">{fmt}</text>
        </g>
      );
    }
    return <text x={x+4} y={y+4} fill="#94a3b8" fontSize={10} textAnchor="start">{fmt}</text>;
  };


  const hoveredPoint = hoverRow;
  const lastPoint = displayedData.length > 0 ? displayedData[displayedData.length-1] : null;
  const firstPoint = displayedData.length > 0 ? displayedData[0] : null;

  const initialValue = firstPoint ? (firstPoint[portfolioLabel] as number) : 10000;
  const currentValue = hoveredPoint ? (hoveredPoint[portfolioLabel] as number) ?? initialValue : (lastPoint ? (lastPoint[portfolioLabel] as number) : initialValue);
  const lastPtfVal = lastPoint ? (lastPoint[portfolioLabel] as number) ?? initialValue : initialValue;
  const perfPct = hoverPerfs?.[portfolioLabel] ?? ((lastPtfVal - initialValue) / initialValue) * 100;

  const bmInitial = firstPoint ? (firstPoint[benchmarkName] as number) ?? null : null;
  const bmCurrentVal = hoveredPoint ? (hoveredPoint[benchmarkName] as number) ?? null : (lastPoint ? (lastPoint[benchmarkName] as number) ?? null : null);
  const bmLastVal = lastPoint ? (lastPoint[benchmarkName] as number) ?? null : null;
  const bmPerfPct = hoverPerfs?.[benchmarkName] ?? (bmInitial && bmLastVal ? ((bmLastVal - bmInitial) / bmInitial * 100) : null);

  const extraPerfMap: Record<string, number|null> = {};
  extraSeries.forEach((s:any) => {
    const cur = hoveredPoint ? (hoveredPoint[s.ticker] as number) ?? null : (lastPoint ? (lastPoint[s.ticker] as number) ?? null : null);
    const lastVal = lastPoint ? (lastPoint[s.ticker] as number) ?? null : null;
    extraPerfMap[s.ticker] = hoverPerfs?.[s.ticker] ?? (lastVal != null ? ((lastVal - 10000) / 10000 * 100) : null);
  });

  // Perf du jour = dernier point vs avant-dernier
  const todayPerfPtf = (() => {
    if (sampled.length < 2) return null;
    const last = sampled[sampled.length-1][portfolioLabel] as number;
    const prev = sampled[sampled.length-2][portfolioLabel] as number;
    return prev ? ((last - prev) / prev * 100) : null;
  })();
  const todayPerfBm = (() => {
    if (benchmarkData.length < 2) return null;
    const last = benchmarkData[benchmarkData.length-1].value as number;
    const prev = benchmarkData[benchmarkData.length-2].value as number;
    return prev ? ((last - prev) / prev * 100) : null;
  })();

  const xAxisLabelMap = (() => {
    const map: Record<string, {label: string, bold: boolean}> = {};
    if (!displayedData.length) return map;
    const allDates = displayedData.map((p:any) => p.date as string);
    const months = {"1M":1,"3M":3,"6M":6,"1A":12,"3A":36,"Max":999}[periodFilter] || 999;
    const N = 10;
    const indices: number[] = [];
    for (let i = 0; i < N; i++) {
      indices.push(Math.round(i * (allDates.length - 1) / (N - 1)));
    }
    indices.forEach((idx, i) => {
      const d = allDates[idx];
      const date = new Date(d);
      const prevDate = i > 0 ? new Date(allDates[indices[i-1]]) : null;
      const isNewYear = prevDate && date.getFullYear() !== prevDate.getFullYear();
      let label = "";
      let bold = false;
      if (isNewYear) {
        label = date.getFullYear().toString();
        bold = true;
      } else {
        label = date.toLocaleDateString("fr-FR", {day:"numeric", month:"short"});
      }
      map[d] = {label, bold};
    });
    return map;
  })();

  return (
    <div ref={chartRef} className={fullscreen ? "fixed inset-0 z-50 bg-white flex flex-col p-4" : "w-full h-full flex flex-col"}>
      {/* Header TradingView style */}
      <div className="flex items-center justify-between px-1 pb-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{backgroundColor: portfolioColor}}>{portfolioLabel.charAt(0).toUpperCase()}</div>
            <div>
              <div className="text-sm font-semibold text-slate-700">{portfolioLabel}</div>
              <div className={`text-xs font-bold tabular-nums ${perfPct >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                {perfPct >= 0 ? "+" : ""}{perfPct.toFixed(1)}%
                {todayPerfPtf !== null && <span className="ml-1 text-slate-400 font-normal">({todayPerfPtf >= 0 ? "+" : ""}{todayPerfPtf.toFixed(2)}% auj.)</span>}
              </div>
            </div>
          </div>
          {benchmarkData.length > 0 && (() => {
            const bmPerf = bmPerfPct;
            return (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-white text-xs font-bold relative">
                  {benchmarkName.charAt(0)}
                  {onRemoveBenchmark && <button onClick={onRemoveBenchmark} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-500 text-white text-xs flex items-center justify-center hover:bg-red-500">×</button>}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-700">{benchmarkName}</div>
                  <div className={`text-xs font-bold tabular-nums ${bmPerf !== null && bmPerf >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {bmPerf !== null ? `${bmPerf >= 0 ? "+" : ""}${bmPerf.toFixed(1)}%` : ""}
                    {todayPerfBm !== null && <span className="ml-1 text-slate-400 font-normal">({todayPerfBm >= 0 ? "+" : ""}{todayPerfBm.toFixed(2)}% auj.)</span>}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Courbes supplémentaires */}
          {extraSeries.map(s => {
            const sPerf = extraPerfMap[s.ticker] ?? null;
            return (
              <div key={s.ticker} className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold relative" style={{backgroundColor: s.color}}>
                  {s.name.charAt(0)}
                  <button onClick={() => removeSeries(s.ticker)} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-500 text-white text-xs flex items-center justify-center hover:bg-red-500">×</button>
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-700">{s.name}</div>
                  <div className={`text-xs font-bold tabular-nums ${sPerf !== null && sPerf >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {sPerf !== null ? `${sPerf >= 0 ? "+" : ""}${sPerf.toFixed(1)}%` : ""}
                    {s.data.length >= 2 && (() => {
                      const todayP = ((s.data[s.data.length-1].value - s.data[s.data.length-2].value) / s.data[s.data.length-2].value * 100);
                      return <span className="ml-1 text-slate-400 font-normal">({todayP >= 0 ? "+" : ""}{todayP.toFixed(2)}% auj.)</span>;
                    })()}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Bouton + */}
          {(1 + (benchmarkData.length > 0 ? 1 : 0) + extraSeries.length) < 4 && (
            <div className="relative" ref={dropdownRef}>
              <button onClick={() => setShowDropdown(v => !v)} className="w-8 h-8 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:border-indigo-400 hover:text-indigo-500 text-lg font-light">+</button>
              {showDropdown && (
                <div className="absolute top-10 left-0 z-50 bg-white border border-slate-200 rounded-xl shadow-xl w-52 py-2">
                  <div className="px-3 py-1 text-xs text-slate-400 font-semibold uppercase">Indices</div>
                  {ETF_LIST.filter(e => e.ticker !== benchmarkName && !extraSeries.find(s => s.ticker === e.ticker)).map(etf => (
                    <button key={etf.ticker} onClick={() => addSeries(etf)} disabled={!!loadingTicker}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-sm text-slate-700">
                      <div className="w-3 h-3 rounded-full" style={{backgroundColor: etf.color}}/>
                      {loadingTicker === etf.ticker ? "Chargement..." : etf.name}
                    </button>
                  ))}
                  <div className="px-3 py-1 mt-1 text-xs text-slate-400 font-semibold uppercase border-t border-slate-100">Mes portefeuilles</div>
                  {savedPortfolios.length === 0 
                    ? <div className="px-3 py-2 text-xs text-slate-400 italic">Aucun portefeuille enregistré</div>
                    : savedPortfolios.filter(p => !extraSeries.find(s => s.ticker === p.id)).map(p => (
                      <button key={p.id} onClick={() => addSeries({ticker: p.id, name: p.name, color: p.color})} disabled={!!loadingTicker}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-sm text-slate-700">
                        <div className="w-3 h-3 rounded-full" style={{backgroundColor: p.color}}/>
                        {loadingTicker === p.id ? "Chargement..." : p.name}
                      </button>
                    ))
                  }
                </div>
              )}
            </div>
          )}


        </div>
        <div className="flex items-center gap-1">
        <div className="relative" ref={shareRef}>
          <button onClick={() => setShowShare(v => !v)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="Partager">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
            </svg>
          </button>
          {showShare && (
            <div className="absolute right-0 top-9 z-50 bg-white border border-slate-200 rounded-xl shadow-xl w-48 py-2">
              <button onClick={async () => {
                try {
                  const html2canvas = (await import("html2canvas")).default;
                  const canvas = await html2canvas(chartRef.current!);
                  const link = document.createElement("a");
                  link.download = "quantfolio-chart.png";
                  link.href = canvas.toDataURL();
                  link.click();
                } catch(e) { alert("Erreur téléchargement"); }
                setShowShare(false);
              }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-sm text-slate-700">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                Télécharger image
              </button>
              <button onClick={() => {
                const url = encodeURIComponent(window.location.href);
                const text = encodeURIComponent("Mon analyse de portefeuille sur Quantfolio");
                window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, "_blank");
                setShowShare(false);
              }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-sm text-slate-700">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.912-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                Partager sur X
              </button>
              <button onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                setShowShare(false);
              }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-sm text-slate-700">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                Copier le lien
              </button>
            </div>
          )}
        </div>
        <button onClick={() => { if (fullscreen && onExitFullscreen) onExitFullscreen(); setFullscreen(v => !v); }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title={fullscreen ? "Réduire" : "Plein écran"}>
          {fullscreen ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 9L4 4m0 0h5m-5 0v5M15 9l5-5m0 0h-5m5 0v5M9 15l-5 5m0 0h5m-5 0v-5M15 15l5 5m0 0h-5m5 0v-5"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5M20 8V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5M20 16v4m0 0h-4m4 0l-5-5"/>
            </svg>
          )}
        </button>
        </div>
      </div>
      {/* Performance chart — 75% height */}
      <div style={{flex: "1 1 0", minHeight: 0, overflow: "visible"}}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={displayedData} margin={{top:4,right:0,bottom:0,left:4}} syncId="chart"
            onMouseMove={(e: any) => {
              if (e?.activePayload?.length) {
                const ptfPayload = e.activePayload.find((p:any) => p.dataKey === portfolioLabel);
                const bmPayload = e.activePayload.find((p:any) => p.dataKey === benchmarkName);
                const val = ptfPayload?.value ?? e.activePayload[0].value;
                const date = e.activeLabel || "";
                const extraValues: Record<string, number> = {};
                // Chercher dans displayedData (pas sampled qui est downsampleé)
                const hoveredPoint = displayedData.find((p:any) => p.date === date) 
                  || displayedData.reduce((closest:any, p:any) => 
                    Math.abs(new Date(p.date).getTime() - new Date(date).getTime()) < Math.abs(new Date(closest.date).getTime() - new Date(date).getTime()) ? p : closest
                  , displayedData[0]);
                extraSeries.forEach((s:any) => {
                  const v = hoveredPoint?.[s.ticker];
                  if (v != null) extraValues[s.ticker] = v as number;
                });
                const bmFromPoint = hoveredPoint?.[benchmarkName] as number ?? bmPayload?.value ?? null;
                setHoverRow({value: val, bValue: bmFromPoint, date, extraValues});
              }
            }}
            onMouseLeave={() => setHoverRow(null)}>
            <defs>
              <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={portfolioColor} stopOpacity={0.5}/>
                <stop offset="60%" stopColor={portfolioColor} stopOpacity={0.15}/>
                <stop offset="100%" stopColor={portfolioColor} stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="benchmarkGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.4}/>
                <stop offset="60%" stopColor="#f59e0b" stopOpacity={0.1}/>
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0}/>
              </linearGradient>
            </defs>
            {extraSeries.map(s => (
              <defs key={`grad-${s.ticker}`}>
                <linearGradient id={`grad-${s.ticker}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.4}/>
                  <stop offset="60%" stopColor={s.color} stopOpacity={0.1}/>
                  <stop offset="100%" stopColor={s.color} stopOpacity={0}/>
                </linearGradient>
              </defs>
            ))}
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
            <XAxis dataKey="date" tickLine={false} axisLine={false} padding={{left:0, right:0}} ticks={Object.keys(xAxisLabelMap)}
              tick={(props: any) => {
                const { x, y, payload } = props;
                const entry = xAxisLabelMap[payload.value];
                if (!entry) return null;
                const ticks = Object.keys(xAxisLabelMap);
                const isFirst = ticks.indexOf(payload.value) === 0;
                const isLast = ticks.indexOf(payload.value) === ticks.length - 1;
                const anchor = isFirst ? "start" : isLast ? "end" : "middle";
                return <text x={x} y={y+12} textAnchor={anchor} fill={entry.bold ? "#1e293b" : "#94a3b8"} fontSize={10} fontWeight={entry.bold ? "700" : "400"}>{entry.label}</text>;
              }}/>
            <YAxis orientation="right" tickFormatter={formatYAxisShort} tick={{fontSize:10,fill:"#94a3b8"}} tickLine={false} axisLine={false} width={70} tickCount={8} domain={["auto","auto"]}/>
            <Tooltip content={<CustomTooltip/>} wrapperStyle={{zIndex: 10}}/>


            

            <Customized component={(props: any) => {
              const { yAxisMap, xAxisMap } = props;
              const yAxis = yAxisMap && (yAxisMap[0] || Object.values(yAxisMap)[0]);
              if (!yAxis || !displayedData.length) return null;
              const ptfVal = displayedData[displayedData.length-1][portfolioLabel] as number;
              const bmVal = displayedData[displayedData.length-1][benchmarkName] as number;
              const fmt = (v: number) => new Intl.NumberFormat("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
              const ptfY = yAxis.scale(ptfVal);
              const bmY = bmVal ? yAxis.scale(bmVal) : null;
              const x = yAxis.x;
              const ptfTxt = fmt(ptfVal);
              const bmTxt = fmt(bmVal);
              const charW = 5.5;
              const pad = 6;
              const ptfW = ptfTxt.length * charW + pad * 2;
              const bmW = bmTxt.length * charW + pad * 2;
              return (
                <g>
                  <rect x={x+2} y={ptfY-10} width={ptfW} height={20} rx={3} fill="#4f46e5"/>
                  <text x={x+2+ptfW/2} y={ptfY} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={10} fontWeight="600">{ptfTxt}</text>
                  {bmY !== null && <rect x={x+2} y={bmY-10} width={bmW} height={20} rx={3} fill="#f59e0b"/>}
                  {bmY !== null && <text x={x+2+bmW/2} y={bmY} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={10} fontWeight="600">{bmTxt}</text>}
                  {extraSeries.map(s => {
                    const sLastVal = displayedData.length > 0 ? displayedData[displayedData.length-1][s.ticker] as number : null;
                    if (!sLastVal) return null;
                    const sY = yAxis.scale(sLastVal);
                    const sTxt = fmt(sLastVal);
                    const sW = sTxt.length * charW + pad * 2;
                    return (
                      <g key={s.ticker}>
                        <rect x={x+2} y={sY-10} width={sW} height={20} rx={3} fill={s.color}/>
                        <text x={x+2+sW/2} y={sY} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={10} fontWeight="600">{sTxt}</text>
                      </g>
                    );
                  })}
                </g>
              );
            }}/>
            <Area type="monotone" dataKey={portfolioLabel} stroke={portfolioColor} strokeWidth={2} fill="url(#portfolioGradient)" activeDot={{r:4, strokeWidth:2, stroke:"white"}} dot={false}/>
            {extraSeries.map(s => (
              <Area key={s.ticker} type="monotone" dataKey={s.ticker} stroke={s.color} strokeWidth={2} fill={`url(#grad-${s.ticker})`} dot={false} activeDot={{r:4, strokeWidth:2, stroke:"white"}} connectNulls={true}/>
            ))}
            {benchmarkData.length > 0 && <Area type="monotone" dataKey={benchmarkName} stroke="#f59e0b" strokeWidth={2} fill="url(#benchmarkGradient)" activeDot={{r:4, strokeWidth:2, stroke:"white"}} dot={false}/>}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Période stats — style TradingView */}


      {/* Période stats — style TradingView */}
      <div className="flex justify-center gap-6 py-2">
        {([
          {key:"1M", label:"1M"},
          {key:"3M", label:"3M"},
          {key:"6M", label:"6M"},
          {key:"1A", label:"1A"},
          {key:"3A", label:"3A"},
          {key:"Max", label:"Max"},
        ] as const).map(({key, label}) => {
          const months = {"1M":1,"3M":3,"6M":6,"1A":12,"3A":36,"Max":0}[key] || 0;
          const cutoff = new Date();
          if (months) cutoff.setMonth(cutoff.getMonth() - months);
          const cutoffStr = cutoff.toISOString().slice(0,10);
          const pts = key === "Max" ? portfolioData : portfolioData.filter(p => p.date >= cutoffStr);
          const first = pts[0]?.value;
          const last = pts[pts.length-1]?.value;
          const pct = first && last ? ((last-first)/first*100) : null;
          return (
            <div key={key} className="relative pb-1 cursor-pointer text-center min-w-[40px]" onClick={() => setPeriodFilter(key)}>
              <div className={`text-xs font-semibold ${periodFilter === key ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"}`}>{label}</div>
              {pct !== null && <div className={`text-xs font-bold tabular-nums ${pct >= 0 ? "text-emerald-500" : "text-red-500"}`}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</div>}
              {periodFilter === key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded"/>}
            </div>
          );
        })}
      </div>

      {/* Drawdown chart — 25% height */}
      {drawdownSampled.length > 0 && (
        <div style={{height: "100px", overflow: "visible", position: "relative"}}>
          <span style={{position:"absolute", bottom:20, left:"50%", transform:"translateX(-50%)", fontSize:10, color:"#94a3b8", zIndex:10, pointerEvents:"none", letterSpacing:"0.05em"}}>DRAWDOWN</span>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={drawdownSampled} margin={{top:0,right:0,bottom:16,left:4}} syncId="chart"
              onMouseMove={(e: any) => {
                if (e?.activeLabel) {
                  const match = sampled.find((p:any) => p.date === e.activeLabel);
                  if (match && match[portfolioLabel]) {
                    setHoverRow({date: e.activeLabel});
                  }
                }
              }}
              onMouseLeave={() => setHoverRow(null)}>
              <defs>
                <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fca5a5" stopOpacity={0.1}/>
                  <stop offset="50%" stopColor="#ef4444" stopOpacity={0.5}/>
                  <stop offset="100%" stopColor="#b91c1c" stopOpacity={0.9}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
              <XAxis dataKey="date" hide/>
              <YAxis orientation="right" dataKey="drawdown_eur" tickFormatter={(v) => new Intl.NumberFormat("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(v)} tick={{fontSize:10,fill:"#94a3b8"}} tickLine={false} axisLine={false} width={70} domain={["auto", 0]}/>

              <Tooltip content={() => null} wrapperStyle={{display:"none"}}/>
              <ReferenceLine y={0} stroke="#e2e8f0" strokeWidth={1}/>
              <Area type="monotone" dataKey="drawdown_eur" stroke="#ef4444" fill="url(#ddGrad)" strokeWidth={1.5} dot={false}/>


              {(() => {
                if (!drawdownSampled.length) return null;
return null;
              })()}
            <Customized component={(props: any) => {
              const { yAxisMap } = props;
              const yAxis = yAxisMap && (yAxisMap[0] || Object.values(yAxisMap)[0]);
              if (!yAxis || !drawdownSampled.length) return null;
              const lastPt = drawdownSampled[drawdownSampled.length-1];
              const val = lastPt.drawdown_eur;
              const y = yAxis.scale(val);
              const x = yAxis.x;
              const fmt = new Intl.NumberFormat("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(val);
              const w = fmt.length * 5.5 + 12;
              return (
                <g>
                  <rect x={x+2} y={y-10} width={w} height={20} rx={3} fill="#ef4444"/>
                  <text x={x+2+w/2} y={y} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={10} fontWeight="600">{fmt}</text>
                </g>
              );
            }}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

    </div>
  );
}
