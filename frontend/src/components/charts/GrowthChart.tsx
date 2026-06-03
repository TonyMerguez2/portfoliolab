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
}

export default function GrowthChart({ portfolioData, benchmarkData, benchmarkName, portfolioLabel, drawdownData }: Props) {
  const [hoverData, setHoverData] = useState<{value: number, date: string} | null>(null);
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
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs">
        <p className="text-slate-400 mb-1.5">{formatDate(label)}</p>
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex items-center gap-2 mb-0.5">
            <div className="w-2 h-2 rounded-full" style={{backgroundColor: p.color}}/>
            <span className="text-slate-600">{p.dataKey}</span>
            <span className="font-bold text-slate-800 ml-auto">{formatYAxis(p.value)}</span>
          </div>
        ))}
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
          <span className={`text-2xl font-bold tabular-nums ${perfPct >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {perfPct >= 0 ? "+" : ""}{perfPct.toFixed(1)}%
          </span>
          {hoverData && (
            <span className="text-xs text-slate-400">{new Date(hoverData.date).toLocaleDateString("fr-FR", {month:"short", year:"numeric"})}</span>
          )}
        </div>
        <div className="flex gap-1">
          {(["1M","3M","6M","1A","3A","Max"] as const).map(p => (
            <button key={p} onClick={() => setPeriodFilter(p)}
              className={`text-xs px-2 py-0.5 rounded-lg transition-colors ${periodFilter === p ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-600 border border-slate-200 hover:border-slate-300"}`}>
              {p}
            </button>
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
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
            <XAxis dataKey="date" tickFormatter={formatDate} tick={{fontSize:10,fill:"#94a3b8"}} tickLine={false} axisLine={false} interval="preserveStartEnd" hide={!!drawdownSampled.length}/>
            <YAxis tickFormatter={formatYAxis} tick={{fontSize:10,fill:"#94a3b8"}} tickLine={false} axisLine={false} width={48}/>
            <Tooltip content={<CustomTooltip/>} wrapperStyle={{zIndex: 10}}/>
            <Legend formatter={(value) => <span className="text-xs text-slate-500">{value}</span>}/>
            <ReferenceLine y={10000} stroke="#e2e8f0" strokeDasharray="4 4"/>

            <Area type="monotone" dataKey={portfolioLabel} stroke="#4f46e5" strokeWidth={2} fill="url(#portfolioGradient)" dot={false} activeDot={{r:4}}/>
            <Line type="monotone" dataKey={benchmarkName} stroke="#94a3b8" strokeWidth={1.5} dot={false} strokeDasharray="4 4" activeDot={{r:3}}/>
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
                    setHoverData({value: match[portfolioLabel] as number, date: e.activeLabel});
                  }
                }
              }}
              onMouseLeave={() => setHoverData(null)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{fontSize:10,fill:"#94a3b8"}} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
              <YAxis tickFormatter={(v) => `${v.toFixed(1)}%`} tick={{fontSize:10,fill:"#94a3b8"}} tickLine={false} axisLine={false} width={48} domain={["auto", 0]}/>
              <Tooltip content={<DrawdownTooltip/>} position={{y: 5}} wrapperStyle={{zIndex: 10}}/>
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
