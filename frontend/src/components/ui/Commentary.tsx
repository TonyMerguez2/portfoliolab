"use client";

import type { Commentary } from "@/types";

const COMMENTARY_ICONS: Record<keyof Commentary, string> = {
  overall: "📈",
  risk: "⚡",
  diversification: "🔀",
  vs_benchmark: "🏁",
  sharpe_interpretation: "⚖️",
  drawdown_note: "📉",
};

const COMMENTARY_LABELS: Record<keyof Commentary, string> = {
  overall: "Overall Performance",
  risk: "Risk Assessment",
  diversification: "Diversification",
  vs_benchmark: "vs. Benchmark",
  sharpe_interpretation: "Sharpe Ratio",
  drawdown_note: "Drawdown",
};

interface Props {
  commentary: Commentary;
}

export default function CommentaryPanel({ commentary }: Props) {
  const keys = Object.keys(commentary) as (keyof Commentary)[];

  return (
    <div className="space-y-3">
      {keys.map((key) => (
        <div
          key={key}
          className="flex gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100"
        >
          <span className="text-lg flex-shrink-0 mt-0.5" aria-hidden>
            {COMMENTARY_ICONS[key]}
          </span>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">
              {COMMENTARY_LABELS[key]}
            </p>
            <p className="text-sm text-slate-700 leading-relaxed">
              {commentary[key]}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
