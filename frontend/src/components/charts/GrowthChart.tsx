"use client";
import { useState } from "react";
import { ResponsiveContainer, LineChart, AreaChart, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ReferenceDot, ReferenceArea } from "recharts";

interface DataPoint { date: string; [key: string]: number | string; }

interface Props {
  portfolioData: DataPoint[];
  benchmarkData: DataPoint[];
  benchmarkName: string;
  portfolioLabel: string;
  drawdownData?: { date: string; drawdown: number }[];
  benchmarkDrawdownData?: { date: string; drawdown: number }[];
}

export default function GrowthChart({ portfolioData, benchmarkData, benchmarkName, portfolioLabel, drawdownData, benchmarkDrawdownData }: Props) {
  const [hoverData, setHoverData] = useState<{value: number, bValue: number, date: string} | null>(null);
  const [periodFilter, setPeriodFilter] = useState<"1M"|"3M"|"6M"|"1A"|"3A"|"Max">("Max");
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
    const months = {"1M":1,"3M":3,"6M":6,"1A":12,"3A":36,"Max":0}[periodFilter] || 0;
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
      if (months <= 3) return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
      if (months <= 12) return new Date(d).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
      return new Date(d).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
    }
    catch { return d; }
  };

  const formatYAxis = (v: number) => {
    if (v >= 10000) return `€${(v/1000).toFixed(0)}k`;
    return `€${v.toFixed(0)}`;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
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
        {bmVal && <div className="flex justify-between mb-2">
          <span className="text-amber-500 font-semibold">{benchmarkName}</span>
          <span className="font-bold text-amber-500">{formatYAxis(bmVal)}</span>
        </div>}
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
    benchmarkData.forEach(p => { allMerged[p.date] = { ...allMerged[p.date], date: p.date, [benchmarkName]: p.value }; });
    const all = Object.values(allMerged).sort((a,b) => a.date < b.date ? -1 : 1);
    if (periodFilter === "Max") return sampled;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = cutoff.toISOString().slice(0,10);
    const filtered = all.filter((p:any) => p.date >= cutoffStr);
    if (filtered.length <= 300) return filtered;
    const step = Math.ceil(filtered.length / 300);
    return filtered.filter((_:any, i:number) => i % step === 0 || i === filtered.length - 1);
  })();
  const initialValue = displayedData.length > 0 ? (displayedData[0][portfolioLabel] as number) : 10000;
  const currentValue = hoverData ? hoverData.value : (sampled.length > 0 ? (sampled[sampled.length-1][portfolioLabel] as number) : 10000);
  const perfPct = ((currentValue - initialValue) / initialValue) * 100;

  return (
    <div className="w-full h-full flex flex-col">
      {/* Badge performance flottant */}
      <div className="flex items-center justify-between px-1 pb-2">
        <div className="flex items-center gap-3">
          <div>
            <span className={`text-2xl font-bold tabular-nums ${perfPct >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {perfPct >= 0 ? "+" : ""}{perfPct.toFixed(1)}%
            </span>
            <div className="text-xs text-slate-400 mt-0.5">
              {formatYAxis(initialValue)} → <span className="font-semibold text-slate-600">{formatYAxis(currentValue)}</span>
            </div>
          </div>
          {hoverData && (() => {
            const bPoint = benchmarkData.find(p => p.date === hoverData.date);
            if (!bPoint) return null;
            const firstDisplayedDate = displayedData.length > 0 ? displayedData[0].date as string : null;
            const bInitialPoint = firstDisplayedDate ? benchmarkData.find(p => p.date >= firstDisplayedDate) : benchmarkData[0];
            if (!bInitialPoint) return null;
            const bInitial = bInitialPoint.value;
            const bPct = ((bPoint.value - bInitial) / bInitial) * 100;
            return (
              <span className="text-sm font-medium text-slate-400 tabular-nums">
                vs {benchmarkName} {bPct >= 0 ? "+" : ""}{bPct.toFixed(1)}%
              </span>
            );
          })()}
          {hoverData && (
            <span className="text-xs text-slate-400">{new Date(hoverData.date).toLocaleDateString("fr-FR", {month:"short", year:"numeric"})}</span>
          )}
        </div>
        <div className="flex gap-1">
          {([
            {key:"1M", label:"1M", title:"Dernier mois"},
            {key:"3M", label:"3M", title:"3 derniers mois"},
            {key:"6M", label:"6M", title:"6 derniers mois"},
            {key:"1A", label:"1A", title:"Dernière année"},
            {key:"3A", label:"3A", title:"3 dernières années"},
            {key:"Max", label:"Max", title:"Période complète"},
          ] as const).map(({key, label, title}) => (
            <div key={key} className="relative group">
              <button onClick={() => setPeriodFilter(key)}
                className={`text-xs px-2 py-0.5 rounded-lg transition-colors ${periodFilter === key ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-600 border border-slate-200 hover:border-slate-300"}`}>
                {label}
              </button>
              <div className="absolute bottom-full right-0 mb-1 px-2 py-1 bg-slate-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                {title}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Performance chart — 75% height */}
      <div style={{flex: "0 0 72%"}}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={displayedData} margin={{top:4,right:16,bottom:0,left:8}} syncId="chart"
            onMouseMove={(e: any) => {
              if (e?.activePayload?.[0]) {
                const val = e.activePayload[0].value;
                const date = e.activeLabel;
                setHoverData({value: val, date});
              }
            }}
            onMouseLeave={() => setHoverData(null)}>
            <defs>
              <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.25}/>
                <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="benchmarkGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15}/>
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
            <XAxis dataKey="date" tickFormatter={formatDate} tick={{fontSize:10,fill:"#94a3b8"}} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
            <YAxis tickFormatter={formatYAxis} tick={{fontSize:10,fill:"#94a3b8"}} tickLine={false} axisLine={false} width={48}/>
            <Tooltip content={<CustomTooltip/>} wrapperStyle={{zIndex: 10}}/>

            <Legend formatter={(value) => <span className="text-xs text-slate-400">{value}</span>} iconSize={8}/>
            <ReferenceLine y={10000} stroke="#e2e8f0" strokeDasharray="4 4"/>

            <Area type="monotone" dataKey={portfolioLabel} stroke="#4f46e5" strokeWidth={2} fill="url(#portfolioGradient)" dot={false} activeDot={{r:4}}/>
            {benchmarkData.length > 0 && <Area type="monotone" dataKey={benchmarkName} stroke="#f59e0b" strokeWidth={2} fill="url(#benchmarkGradient)" dot={false} activeDot={{r:4}}/>}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Drawdown chart — 25% height */}
      {drawdownSampled.length > 0 && (
        <div style={{flex: "0 0 25%"}}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={drawdownSampled} margin={{top:0,right:16,bottom:4,left:8}} syncId="chart"
              onMouseMove={(e: any) => {
                if (e?.activeLabel) {
                  const match = sampled.find((p:any) => p.date === e.activeLabel);
                  if (match && match[portfolioLabel]) {
                    setHoverData({value: match[portfolioLabel] as number, bValue: match[benchmarkName] as number || 0, date: e.activeLabel});
                  }
                }
              }}
              onMouseLeave={() => setHoverData(null)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{fontSize:10,fill:"#94a3b8"}} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
              <YAxis tickFormatter={(v) => `${v.toFixed(1)}%`} tick={{fontSize:10,fill:"#94a3b8"}} tickLine={false} axisLine={false} width={48} domain={["auto", 0]}/>

              <Tooltip content={() => null} wrapperStyle={{display:"none"}}/>
              <ReferenceLine y={0} stroke="#64748b" strokeWidth={1.5}/>
              <Area type="monotone" dataKey="drawdown" stroke="#ef4444" fill="#fee2e2" strokeWidth={1.5} dot={false}/>


              {(() => {
                if (!drawdownSampled.length) return null;
                const minPoint = drawdownSampled.reduce((min, p) => p.drawdown < min.drawdown ? p : min, drawdownSampled[0]);
                const CustomDot = (props: any) => {
                  const { cx, cy } = props;
                  if (!cx || !cy) return null;
                  return (
                    <g>
                      <circle cx={cx} cy={cy} r={12} fill="#ef4444" opacity={0.15}>
                        <animate attributeName="r" values="8;14;8" dur="2s" repeatCount="indefinite"/>
                        <animate attributeName="opacity" values="0.3;0.05;0.3" dur="2s" repeatCount="indefinite"/>
                      </circle>
                      <circle cx={cx} cy={cy} r={5} fill="#ef4444" stroke="white" strokeWidth={2}/>

                    </g>
                  );
                };
                return <ReferenceDot x={minPoint.date} y={minPoint.drawdown} r={0} shape={<CustomDot/>}/>;
              })()}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

    </div>
  );
}
