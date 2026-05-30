"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import type { AssetMetrics, MonthlyReturn, CorrelationMatrix } from "@/types";

// ─── Allocation Pie ──────────────────────────────────────────

const PIE_COLORS = [
  "#4f46e5", "#06b6d4", "#10b981", "#f59e0b",
  "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6",
  "#f97316", "#6366f1",
];

export function AllocationPie({ assets }: { assets: AssetMetrics[] }) {
  const data = assets.map((a) => ({ name: a.ticker, value: a.weight }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow p-2 text-sm">
        <span className="font-semibold">{payload[0].name}</span>
        <span className="ml-2 text-slate-500">{payload[0].value.toFixed(1)}%</span>
      </div>
    );
  };

  return (
    <div className="w-full h-52">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
            label={({ name, value }) => `${name} ${value.toFixed(0)}%`}
            labelLine={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Monthly Returns Histogram ───────────────────────────────

export function MonthlyReturnsChart({ data }: { data: MonthlyReturn[] }) {
  const formatted = data.map((d) => ({
    ...d,
    fill: d.return_value >= 0 ? "#10b981" : "#ef4444",
  }));

  const last24 = formatted.slice(-24);

  return (
    <div className="w-full h-52">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={last24} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="period"
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            interval={3}
          />
          <YAxis
            tickFormatter={(v) => `${v.toFixed(0)}%`}
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip
            formatter={(v: number) => [`${v.toFixed(2)}%`, "Return"]}
            contentStyle={{
              border: "1px solid #e2e8f0",
              borderRadius: "0.5rem",
              fontSize: 13,
            }}
          />
          <ReferenceLine y={0} stroke="#e2e8f0" />
          <Bar dataKey="return_value" radius={[2, 2, 0, 0]}>
            {last24.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Correlation Heatmap ──────────────────────────────────────

function cellColor(value: number): string {
  // Blue (negative) to white (0) to coral (positive)
  if (value >= 0.9) return "#7c3aed";
  if (value >= 0.7) return "#a78bfa";
  if (value >= 0.5) return "#c4b5fd";
  if (value >= 0.3) return "#ddd6fe";
  if (value >= 0.1) return "#ede9fe";
  if (value >= -0.1) return "#f8fafc";
  if (value >= -0.3) return "#dcfce7";
  return "#bbf7d0";
}

function textColor(value: number): string {
  const abs = Math.abs(value);
  return abs > 0.5 ? "#1e1b4b" : "#64748b";
}

export function CorrelationHeatmap({ data }: { data: CorrelationMatrix }) {
  const { tickers, matrix } = data;
  const n = tickers.length;

  if (n === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead>
          <tr>
            <th className="w-16" />
            {tickers.map((t) => (
              <th
                key={t}
                className="text-center font-semibold text-slate-500 pb-2 px-1"
              >
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tickers.map((rowTicker, i) => (
            <tr key={rowTicker}>
              <td className="font-semibold text-slate-500 pr-2 text-right">
                {rowTicker}
              </td>
              {matrix[i].map((val, j) => (
                <td
                  key={j}
                  className="text-center font-mono rounded-sm p-1.5"
                  style={{
                    backgroundColor: cellColor(val),
                    color: textColor(val),
                    minWidth: 52,
                  }}
                >
                  {val.toFixed(2)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
