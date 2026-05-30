"use client";
import { useState } from "react";
import { useMonteCarlo } from "@/hooks/useMonteCarlo";
import MonteCarloChart from "@/components/charts/MonteCarloChart";
import type { AssetInput, Period } from "@/types";

interface Props {
  assets: AssetInput[];
  period: Period;
  locale: string;
  t: (key: string) => string;
}

function fmt(v: number) { return `€${Math.round(v).toLocaleString("fr-FR")}`; }
function fmtPct(v: number) { return `${(v * 100).toFixed(1)}%`; }

function RobustnessScore({ score, label, color, reasons }: { score: number; label: string; color: string; reasons: string[] }) {
  const c = color === "green" ? "text-emerald-600" : color === "amber" ? "text-amber-500" : "text-red-500";
  const bg = color === "green" ? "bg-emerald-50 border-emerald-200" : color === "amber" ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";
  const bar = color === "green" ? "bg-emerald-500" : color === "amber" ? "bg-amber-400" : "bg-red-500";
  return (
    <div className={`p-4 rounded-xl border ${bg}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-0.5">Score de robustesse</p>
          <p className={`text-3xl font-bold tabular-nums ${c}`}>{score}<span className="text-lg text-slate-400">/100</span></p>
        </div>
        <div className={`text-sm font-bold px-3 py-1.5 rounded-lg ${c} ${bg} border`}>{label}</div>
      </div>
      <div className="w-full h-2 bg-white rounded-full overflow-hidden mb-3">
        <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${score}%` }}/>
      </div>
      {reasons.length > 0 ? (
        <div className="space-y-1">
          {reasons.map((r, i) => <div key={i} className="flex items-center gap-1.5 text-xs text-slate-600"><span className="text-amber-500">⚠</span>{r}</div>)}
        </div>
      ) : (
        <p className="text-xs text-emerald-600">✓ Aucun facteur de risque majeur détecté</p>
      )}
    </div>
  );
}

function GoalPanel({ goal, horizon }: { goal: NonNullable<ReturnType<typeof useMonteCarlo>["data"]>["goal_analysis"]; horizon: number }) {
  if (!goal) return null;
  const pct = goal.probability_of_reaching * 100;
  const color = pct >= 70 ? "text-emerald-600" : pct >= 40 ? "text-amber-500" : "text-red-500";
  const bg = pct >= 70 ? "bg-emerald-50 border-emerald-200" : pct >= 40 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";
  return (
    <div className={`p-4 rounded-xl border ${bg} space-y-3`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Objectif : {fmt(goal.target_value)}</p>
        <span className={`text-2xl font-bold tabular-nums ${color}`}>{pct.toFixed(0)}%</span>
      </div>
      <p className="text-xs text-slate-600">de probabilité d'atteindre cet objectif dans {horizon} ans</p>
      <div className="grid grid-cols-3 gap-2 text-xs">
        {[
          { label: "Pessimiste", reached: goal.reached_by_p5, years: goal.years_to_reach_pessimistic },
          { label: "Médian", reached: goal.reached_by_p50, years: goal.years_to_reach_median },
          { label: "Optimiste", reached: goal.reached_by_p95, years: goal.years_to_reach_optimistic },
        ].map(({ label, reached, years }) => (
          <div key={label} className={`p-2 rounded-lg text-center ${reached ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
            <p className="text-slate-500 mb-1">{label}</p>
            <p className={`font-bold ${reached ? "text-emerald-600" : "text-red-500"}`}>
              {reached ? (years ? `${years} ans` : "✓") : "✗"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProbabilityTable({ p50, p5, p95, initial }: { p50: number; p5: number; p95: number; initial: number }) {
  const targets = [
    initial * 1.5,
    initial * 2,
    initial * 5,
    initial * 10,
    initial * 20,
    initial * 50,
  ].filter(t => t > 0);

  const rows = targets.map(target => {
    const reachedP5 = p5 >= target;
    const reachedP50 = p50 >= target;
    const reachedP95 = p95 >= target;
    return { target, reachedP5, reachedP50, reachedP95 };
  });

  return (
    <div>
      <p className="text-sm font-semibold text-slate-700 mb-3">Probabilité d'atteindre différents seuils</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs font-semibold text-slate-400 uppercase tracking-widest border-b border-slate-100">
              <th className="pb-2 text-left">Objectif</th>
              <th className="pb-2 text-center">Pessimiste (P5)</th>
              <th className="pb-2 text-center">Médian (P50)</th>
              <th className="pb-2 text-center">Optimiste (P95)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map(({ target, reachedP5, reachedP50, reachedP95 }) => (
              <tr key={target} className="hover:bg-slate-50 transition-colors">
                <td className="py-2.5 font-medium text-slate-700">{fmt(target)}</td>
                <td className="py-2.5 text-center">
                  <span className={`text-xs font-bold ${reachedP5 ? "text-emerald-600" : "text-red-400"}`}>
                    {reachedP5 ? "✓ Atteint" : "✗ Non"}
                  </span>
                </td>
                <td className="py-2.5 text-center">
                  <span className={`text-xs font-bold ${reachedP50 ? "text-emerald-600" : "text-red-400"}`}>
                    {reachedP50 ? "✓ Atteint" : "✗ Non"}
                  </span>
                </td>
                <td className="py-2.5 text-center">
                  <span className={`text-xs font-bold ${reachedP95 ? "text-emerald-600" : "text-red-400"}`}>
                    {reachedP95 ? "✓ Atteint" : "✗ Non"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 mt-2">Basé sur les scénarios P5 (pessimiste), P50 (médian) et P95 (optimiste) à l'horizon choisi.</p>
    </div>
  );
}

export default function MonteCarloPanel({ assets, period, locale }: Props) {
  const { data, isLoading, error, run } = useMonteCarlo();
  const [horizon, setHorizon] = useState(10);
  const [initialInvestment, setInitialInvestment] = useState(10000);
  const [targetValue, setTargetValue] = useState<number | undefined>(undefined);
  const [targetInput, setTargetInput] = useState("");

  const handleRun = () => {
    run({ assets, period, horizon_years: horizon, n_simulations: 500, initial_investment: initialInvestment, target_value: targetValue, lang: locale });
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Horizon — {horizon} ans</label>
          <input type="range" min={1} max={30} step={1} value={horizon} onChange={e => setHorizon(Number(e.target.value))} className="w-full accent-indigo-600"/>
          <div className="flex justify-between text-xs text-slate-400 mt-0.5"><span>1</span><span>30 ans</span></div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Capital initial</label>
          <select value={initialInvestment} onChange={e => setInitialInvestment(Number(e.target.value))}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
            {[1000,5000,10000,25000,50000,100000].map(v => <option key={v} value={v}>€{v.toLocaleString("fr-FR")}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Objectif financier (optionnel)</label>
          <input type="number" placeholder="ex: 100000" value={targetInput}
            onChange={e => { setTargetInput(e.target.value); setTargetValue(e.target.value ? Number(e.target.value) : undefined); }}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
        </div>
        <div className="flex items-end">
          <button onClick={handleRun} disabled={isLoading || assets.length === 0}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors flex items-center justify-center gap-2">
            {isLoading ? (
              <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Simulation…</>
            ) : (
              <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>Lancer</>
            )}
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">{error}</div>}

      {!data && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"/>
            </svg>
          </div>
          <p className="text-slate-600 font-medium mb-1">Simulation Monte Carlo</p>
          <p className="text-slate-400 text-sm max-w-sm">500 trajectoires simulées via Mouvement Brownien Géométrique. Définissez un objectif pour calculer vos probabilités de succès.</p>
        </div>
      )}

      {data && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Valeur médiane", value: fmt(data.final_values_p50), sub: `dans ${horizon} ans`, color: "text-indigo-600" },
              { label: "Scénario optimiste", value: fmt(data.final_values_p95), sub: "P95", color: "text-emerald-600" },
              { label: "Scénario pessimiste", value: fmt(data.final_values_p5), sub: "P5", color: "text-red-500" },
              { label: "Probabilité de perte", value: fmtPct(data.probability_of_loss), sub: "sur l'horizon", color: data.probability_of_loss > 0.2 ? "text-red-500" : "text-emerald-600" },
            ].map(c => (
              <div key={c.label} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-xs font-medium text-slate-500 mb-1">{c.label}</p>
                <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
                <p className="text-xs text-slate-400 mt-0.5">{c.sub}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <RobustnessScore score={data.robustness_score} label={data.robustness_label} color={data.robustness_color} reasons={data.robustness_reasons}/>
            {data.goal_analysis ? (
              <GoalPanel goal={data.goal_analysis} horizon={horizon}/>
            ) : (
              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex flex-col items-center justify-center text-center min-h-32">
                <p className="text-slate-400 text-sm">💡 Définissez un objectif financier pour calculer vos probabilités de succès</p>
              </div>
            )}
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-700 mb-4">Projection sur {horizon} ans — 500 scénarios simulés</p>
            <MonteCarloChart data={data} horizonYears={horizon}/>
            <div className="flex flex-wrap gap-3 text-xs text-slate-500 mt-3">
              {[
                { color: "#10b981", dash: true, label: "Optimiste (P95)" },
                { color: "#4f46e5", dash: false, label: "Médian (P50)" },
                { color: "#ef4444", dash: true, label: "Pessimiste (P5)" },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <div className="w-5 h-0.5 flex-shrink-0" style={{ backgroundColor: item.color, opacity: item.dash ? 0.7 : 1 }}/>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <ProbabilityTable p50={data.final_values_p50} p5={data.final_values_p5} p95={data.final_values_p95} initial={initialInvestment}/>

          <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl space-y-2">
            <p className="text-xs font-semibold text-indigo-700 uppercase tracking-widest mb-2">💬 Analyse automatique</p>
            <p className="text-sm text-slate-700 leading-relaxed">
              Pour un investissement de <strong>{fmt(data.initial_investment)}</strong>, la valeur médiane estimée dans <strong>{horizon} ans</strong> est de <strong className="text-indigo-600">{fmt(data.final_values_p50)}</strong> — soit une multiplication par <strong>{(data.final_values_p50 / data.initial_investment).toFixed(1)}x</strong>.
            </p>
            <p className="text-sm text-slate-700 leading-relaxed">
              Dans les 5% meilleurs scénarios, le portefeuille pourrait atteindre <strong className="text-emerald-600">{fmt(data.final_values_p95)}</strong>. Dans les 5% pires scénarios, il terminerait autour de <strong className="text-red-500">{fmt(data.final_values_p5)}</strong>.
            </p>
            <p className="text-sm text-slate-700 leading-relaxed">
              La probabilité de perte est de <strong>{fmtPct(data.probability_of_loss)}</strong> — {data.probability_of_loss < 0.05 ? "très faible, ce qui suggère un profil de risque bien maîtrisé sur cet horizon." : data.probability_of_loss < 0.20 ? "modérée, typique d'un portefeuille actions sur cet horizon." : "élevée, envisagez un horizon plus long ou une allocation plus défensive."}
            </p>
            {data.goal_analysis && (
              <p className="text-sm text-slate-700 leading-relaxed">
                L'objectif de <strong>{fmt(data.goal_analysis.target_value)}</strong> a <strong className={data.goal_analysis.probability_of_reaching >= 0.5 ? "text-emerald-600" : "text-amber-500"}>{fmtPct(data.goal_analysis.probability_of_reaching)} de chances</strong> d'être atteint dans {horizon} ans.
                {data.goal_analysis.years_to_reach_median && ` Le scénario médian l'atteindrait en ${data.goal_analysis.years_to_reach_median} ans.`}
              </p>
            )}
          </div>

          <p className="text-xs text-slate-400 italic border-t border-slate-100 pt-3">
            ⚠ Projections basées sur les rendements historiques (GBM). Ne constituent pas un conseil en investissement. Les performances passées ne préjugent pas des performances futures.
          </p>
        </div>
      )}
    </div>
  );
}
