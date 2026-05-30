"use client";

import { useState, useCallback } from "react";
import type { AssetInput, BacktestRequest, Benchmark, Period } from "@/types";
import { PERIOD_LABELS, BENCHMARK_LABELS } from "@/types";

interface Props {
  onSubmit: (req: BacktestRequest) => void;
  isLoading: boolean;
}

const DEFAULT_ASSETS: AssetInput[] = [
  { ticker: "AAPL", weight: 30 },
  { ticker: "MSFT", weight: 30 },
  { ticker: "CW8.PA", weight: 40 },
];

export default function PortfolioBuilder({ onSubmit, isLoading }: Props) {
  const [assets, setAssets] = useState<AssetInput[]>(DEFAULT_ASSETS);
  const [period, setPeriod] = useState<Period>("5y");
  const [benchmark, setBenchmark] = useState<Benchmark>("^GSPC");
  const [riskFreeRate, setRiskFreeRate] = useState(3.5);

  const totalWeight = assets.reduce((s, a) => s + (a.weight || 0), 0);
  const isBalanced = Math.abs(totalWeight - 100) < 0.01;

  const addAsset = () =>
    setAssets((prev) => [...prev, { ticker: "", weight: 0 }]);

  const removeAsset = (i: number) =>
    setAssets((prev) => prev.filter((_, idx) => idx !== i));

  const updateAsset = useCallback(
    (i: number, field: keyof AssetInput, value: string | number) => {
      setAssets((prev) =>
        prev.map((a, idx) =>
          idx === i
            ? { ...a, [field]: field === "ticker" ? String(value).toUpperCase() : Number(value) }
            : a,
        ),
      );
    },
    [],
  );

  const equalizeWeights = () => {
    const n = assets.length;
    if (n === 0) return;
    const w = Math.floor(10000 / n) / 100;
    const last = 100 - w * (n - 1);
    setAssets((prev) =>
      prev.map((a, i) => ({ ...a, weight: i === n - 1 ? last : w })),
    );
  };

  const handleSubmit = () => {
    if (!isBalanced || assets.some((a) => !a.ticker)) return;
    onSubmit({
      assets: assets.filter((a) => a.ticker),
      period,
      benchmark,
      risk_free_rate: riskFreeRate / 100,
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Portfolio Builder</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Add assets and allocate weights
          </p>
        </div>
        <button
          onClick={equalizeWeights}
          className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 rounded-lg px-3 py-1.5 transition-colors"
        >
          Equalize weights
        </button>
      </div>

      {/* Asset rows */}
      <div className="space-y-2 mb-4">
        <div className="grid grid-cols-12 gap-2 text-xs text-slate-400 font-medium px-1 mb-1">
          <span className="col-span-5">Ticker</span>
          <span className="col-span-5">Weight (%)</span>
          <span className="col-span-2" />
        </div>

        {assets.map((asset, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <input
              className="col-span-5 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                         placeholder:text-slate-300 uppercase"
              placeholder="AAPL"
              value={asset.ticker}
              onChange={(e) => updateAsset(i, "ticker", e.target.value)}
            />
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              className="col-span-5 border border-slate-200 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              value={asset.weight}
              onChange={(e) => updateAsset(i, "weight", e.target.value)}
            />
            <button
              onClick={() => removeAsset(i)}
              disabled={assets.length === 1}
              className="col-span-2 flex items-center justify-center text-slate-300 hover:text-red-400
                         disabled:opacity-20 transition-colors h-9 rounded-lg border border-transparent
                         hover:border-red-100"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Add asset + weight indicator */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={addAsset}
          disabled={assets.length >= 20}
          className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800
                     disabled:opacity-40 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 4v16m8-8H4" />
          </svg>
          Add asset
        </button>

        <span
          className={`text-sm font-semibold tabular-nums ${
            isBalanced
              ? "text-emerald-600"
              : totalWeight > 100
                ? "text-red-500"
                : "text-amber-500"
          }`}
        >
          {totalWeight.toFixed(1)}% / 100%
        </span>
      </div>

      {/* Weight progress bar */}
      <div className="w-full h-1.5 bg-slate-100 rounded-full mb-6 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isBalanced ? "bg-emerald-500" : totalWeight > 100 ? "bg-red-400" : "bg-amber-400"
          }`}
          style={{ width: `${Math.min(totalWeight, 100)}%` }}
        />
      </div>

      {/* Settings */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Period */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">
            Period
          </label>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        {/* Benchmark */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">
            Benchmark
          </label>
          <select
            value={benchmark}
            onChange={(e) => setBenchmark(e.target.value as Benchmark)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            {(Object.entries(BENCHMARK_LABELS) as [Benchmark, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        {/* Risk-free rate */}
        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-500 mb-1.5">
            Risk-Free Rate — {riskFreeRate.toFixed(1)}%
          </label>
          <input
            type="range"
            min={0}
            max={10}
            step={0.1}
            value={riskFreeRate}
            onChange={(e) => setRiskFreeRate(Number(e.target.value))}
            className="w-full accent-indigo-600"
          />
          <div className="flex justify-between text-xs text-slate-400 mt-0.5">
            <span>0%</span>
            <span>10%</span>
          </div>
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!isBalanced || isLoading || assets.some((a) => !a.ticker)}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40
                   text-white font-semibold rounded-xl py-3 text-sm transition-colors
                   flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10"
                      stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Fetching data & computing…
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Run Backtest
          </>
        )}
      </button>

      {!isBalanced && (
        <p className="text-xs text-red-500 text-center mt-2">
          Weights must sum to exactly 100%
        </p>
      )}
    </div>
  );
}
