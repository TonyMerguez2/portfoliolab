"use client";
import { ResponsiveContainer, LineChart, AreaChart, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ReferenceDot } from "recharts";

interface DataPoint { date: string; [key: string]: number | string; }

interface Props {
  portfolioData: DataPoint[];
  benchmarkData: DataPoint[];
  benchmarkName: string;
  portfolioLabel: string;
  drawdownData?: { date: string; drawdown: number }[];
}

export default function GrowthChart({ portfolioData, benchmarkData, benchmarkName, portfolioLabel, drawdownData }: Props) {
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
    if (drawdownData.length <= 300) return drawdownData;
    const step = Math.ceil(drawdownData.length / 300);
    return drawdownData.filter((_,i) => i % step === 0 || i === drawdownData.length - 1);
  })();

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }); }
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

  return (
    <div className="w-full h-full flex flex-col">
      {/* Performance chart — 75% height */}
      <div style={{flex: "0 0 75%"}}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={sampled} margin={{top:4,right:16,bottom:0,left:8}} syncId="chart">
            <defs>
              <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.25}/>
                <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
            <XAxis dataKey="date" tickFormatter={formatDate} tick={{fontSize:10,fill:"#94a3b8"}} tickLine={false} axisLine={false} interval="preserveStartEnd" hide={!!drawdownSampled.length}/>
            <YAxis tickFormatter={formatYAxis} tick={{fontSize:10,fill:"#94a3b8"}} tickLine={false} axisLine={false} width={48}/>
            <Tooltip content={<CustomTooltip/>}/>
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
            <AreaChart data={drawdownSampled} margin={{top:0,right:16,bottom:4,left:8}} syncId="chart">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{fontSize:10,fill:"#94a3b8"}} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
              <YAxis tickFormatter={(v) => `${v.toFixed(1)}%`} tick={{fontSize:10,fill:"#94a3b8"}} tickLine={false} axisLine={false} width={48} domain={["auto", 0]}/>
              <Tooltip content={<DrawdownTooltip/>}/>
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
                      <rect x={cx+10} y={cy-11} width={62} height={22} rx={5} fill="white" stroke="#ef4444" strokeWidth={1.5}/>
                      <text x={cx+41} y={cy+5} textAnchor="middle" fill="#dc2626" fontSize={12} fontWeight="bold">{minPoint.drawdown.toFixed(1)}%</text>
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
