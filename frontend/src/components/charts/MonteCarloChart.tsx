"use client";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import type { MonteCarloResult } from "@/hooks/useMonteCarlo";

interface Props {
  data: MonteCarloResult;
  horizonYears: number;
}

function formatYAxis(value: number): string {
  if (value >= 1000000) return `€${(value/1000000).toFixed(1)}M`;
  return `€${(value/1000).toFixed(0)}k`;
}

const LINES = [
  { key: "p95", color: "#10b981", dash: "4 4", label: "Optimiste (P95)" },
  { key: "p75", color: "#6ee7b7", dash: "2 2", label: "Favorable (P75)" },
  { key: "p50", color: "#4f46e5", dash: undefined, label: "Médian (P50)" },
  { key: "p25", color: "#fca5a5", dash: "2 2", label: "Défavorable (P25)" },
  { key: "p5",  color: "#ef4444", dash: "4 4", label: "Pessimiste (P5)" },
];

export default function MonteCarloChart({ data, horizonYears }: Props) {
  const maxLen = Math.max(...LINES.map(l => (data.percentiles[l.key] ?? []).length));
  if (maxLen === 0) return <div className="h-72 flex items-center justify-center text-slate-400 text-sm">Pas de données</div>;

  const chartData = Array.from({ length: maxLen }, (_, i) => {
    const year = (i / (maxLen - 1)) * horizonYears;
    const point: Record<string, number | string> = { year: year.toFixed(1) };
    LINES.forEach(l => {
      const arr = data.percentiles[l.key];
      if (arr) {
        const val = arr[i];
        point[l.key] = typeof val === "object" ? Math.round((val as any).value ?? val) : Math.round(Number(val));
      }
    });
    return point;
  });

  const step = Math.max(1, Math.floor(maxLen / 6));
  const tickYears = new Set(Array.from({ length: 7 }, (_, i) => (i * horizonYears / 6).toFixed(1)));

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-sm min-w-48">
        <p className="text-slate-500 text-xs mb-2 font-medium">An {payload[0]?.payload?.year}</p>
        {[...payload].reverse().map((entry: any) => {
          const lineInfo = LINES.find(l => l.key === entry.dataKey);
          return (
            <div key={entry.dataKey} className="flex items-center justify-between gap-4 mb-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }}/>
                <span className="text-slate-500 text-xs">{lineInfo?.label}</span>
              </div>
              <span className="font-semibold tabular-nums text-xs">€{(entry.value as number).toLocaleString("fr-FR")}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
          <XAxis dataKey="year"
            tickFormatter={v => tickYears.has(v) ? `An ${parseFloat(v).toFixed(0)}` : ""}
            tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false}/>
          <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={60}/>
          <Tooltip content={<CustomTooltip/>}/>
          {LINES.map(l => (
            <Line key={l.key} type="monotone" dataKey={l.key} stroke={l.color}
              strokeWidth={l.key === "p50" ? 2.5 : 1.5} dot={false}
              strokeDasharray={l.dash} activeDot={l.key === "p50" ? { r: 4 } : false}/>
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
