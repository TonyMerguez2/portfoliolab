"use client";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from "recharts";
import type { TimeSeriesPoint } from "@/types";

interface Props {
  portfolioData: TimeSeriesPoint[];
  benchmarkData: TimeSeriesPoint[];
  benchmarkName: string;
  portfolioLabel?: string;
}

function formatYAxis(value: number): string { return `€${(value/1000).toFixed(0)}k`; }
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", { year:"numeric", month:"short" });
}
function subsample<T>(arr: T[], maxPoints=500): T[] {
  if (arr.length<=maxPoints) return arr;
  const step = Math.ceil(arr.length/maxPoints);
  return arr.filter((_,i) => i%step===0 || i===arr.length-1);
}

export default function GrowthChart({ portfolioData, benchmarkData, benchmarkName, portfolioLabel="Portfolio" }: Props) {
  const portfolioMap = new Map(portfolioData.map(p => [p.date, p.value]));
  const benchmarkMap = new Map(benchmarkData.map(p => [p.date, p.value]));
  const allDates = Array.from(new Set([...portfolioData.map(p => p.date), ...benchmarkData.map(p => p.date)])).sort();
  const merged = allDates.map(date => ({ date, [portfolioLabel]: portfolioMap.get(date), [benchmarkName]: benchmarkMap.get(date) }));
  const sampled = subsample(merged);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-sm">
        <p className="text-slate-500 text-xs mb-2">{formatDate(label)}</p>
        {payload.map((entry: any) => (
          <div key={entry.name} className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{backgroundColor:entry.color}}/>
            <span className="text-slate-600">{entry.name}:</span>
            <span className="font-semibold tabular-nums">€{(entry.value as number).toLocaleString("fr-FR",{maximumFractionDigits:0})}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={sampled} margin={{top:4,right:16,bottom:4,left:8}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
          <XAxis dataKey="date" tickFormatter={formatDate} tick={{fontSize:11,fill:"#94a3b8"}} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
          <YAxis tickFormatter={formatYAxis} tick={{fontSize:11,fill:"#94a3b8"}} tickLine={false} axisLine={false} width={52}/>
          <Tooltip content={<CustomTooltip/>}/>
          <Legend formatter={(value) => <span className="text-sm text-slate-600">{value}</span>}/>
          <ReferenceLine y={10000} stroke="#e2e8f0" strokeDasharray="4 4"/>
          <Line type="monotone" dataKey={portfolioLabel} stroke="#4f46e5" strokeWidth={2} dot={false} activeDot={{r:4}}/>
          <Line type="monotone" dataKey={benchmarkName} stroke="#94a3b8" strokeWidth={1.5} dot={false} strokeDasharray="4 4" activeDot={{r:3}}/>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
