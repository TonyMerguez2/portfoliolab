"use client";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

interface Props { metric: string; lang?: string; }

type Level = "intermediate" | "advanced";

const INTERMEDIATE: Record<string, Record<string, { title: string; definition: string; importance: string; interpretation: string; example: string }>> = {
  totalReturn: {
    fr: { title: "Rendement Total", definition: "La variation totale de la valeur de votre portefeuille sur toute la période analysée.", importance: "C'est la mesure la plus directe de ce qu'a rapporté votre investissement.", interpretation: "Un rendement de +50% signifie que 10 000 € sont devenus 15 000 €.", example: "10 000 € investis → 14 500 € = +45% de rendement total." },
    en: { title: "Total Return", definition: "The total change in value of your portfolio over the entire analysis period.", importance: "The most direct measure of what your investment returned.", interpretation: "+50% return means €10,000 became €15,000.", example: "€10,000 invested → €14,500 = +45% total return." },
  },
  cagr: {
    fr: { title: "TCAC", definition: "Le rendement annuel moyen en supposant que les gains sont réinvestis chaque année.", importance: "Permet de comparer des investissements sur des durées différentes.", interpretation: "TCAC de 10% = croissance moyenne de 10% par an.", example: "10 000 € × 1,1⁵ = 16 105 € en 5 ans à 10% de TCAC." },
    en: { title: "CAGR", definition: "Average annual return assuming gains are reinvested each year.", importance: "Allows fair comparison across different time periods.", interpretation: "10% CAGR = 10% average growth per year.", example: "€10,000 × 1.1⁵ = €16,105 over 5 years at 10% CAGR." },
  },
  volatility: {
    fr: { title: "Volatilité", definition: "Amplitude des fluctuations quotidiennes du portefeuille, en % annuel.", importance: "Indique le niveau de risque et d'incertitude.", interpretation: "< 10% : faible | 10–20% : modéré | > 25% : élevé", example: "Volatilité 15% : le portefeuille peut varier de ±15% autour de sa tendance annuelle." },
    en: { title: "Volatility", definition: "Amplitude of daily portfolio fluctuations, as annual %.", importance: "Indicates risk and uncertainty level.", interpretation: "< 10%: low | 10–20%: moderate | > 25%: high", example: "15% volatility: portfolio can vary ±15% around annual trend." },
  },
  maxDrawdown: {
    fr: { title: "Drawdown Maximum", definition: "La plus grande baisse entre un pic et un creux sur toute la période.", importance: "Le pire scénario que vous auriez vécu comme investisseur.", interpretation: "MDD -30% : le portefeuille avait perdu 30% depuis son sommet.", example: "100 000 € → 70 000 € = MDD -30%. Besoin de +43% pour récupérer." },
    en: { title: "Maximum Drawdown", definition: "Largest decline between a peak and a trough over the period.", importance: "The worst scenario you would have experienced as an investor.", interpretation: "MDD -30%: portfolio once lost 30% from its peak.", example: "€100,000 → €70,000 = MDD -30%. Needs +43% to recover." },
  },
  sharpe: {
    fr: { title: "Ratio de Sharpe", definition: "Rendement obtenu par unité de risque, au-delà du taux sans risque.", importance: "Indique si le rendement compense vraiment le risque pris.", interpretation: "< 0.5 : faible | 0.5–1 : acceptable | 1–2 : bon | > 2 : excellent", example: "Sharpe 1.2 : pour 1% de risque, vous obtenez 1.2% de rendement supplémentaire." },
    en: { title: "Sharpe Ratio", definition: "Return per unit of risk taken, above risk-free rate.", importance: "Whether return truly compensates for risk.", interpretation: "< 0.5: poor | 0.5–1: ok | 1–2: good | > 2: excellent", example: "Sharpe 1.2: for 1% risk, you get 1.2% extra return." },
  },
  sortino: {
    fr: { title: "Ratio de Sortino", definition: "Comme le Sharpe, mais ne pénalise que la volatilité à la baisse.", importance: "Plus juste pour les portefeuilles avec des rendements asymétriques.", interpretation: "Sortino élevé : monte souvent, baisse peu.", example: "Un fonds régulier avec rares chutes aura un Sortino bien supérieur au Sharpe." },
    en: { title: "Sortino Ratio", definition: "Like Sharpe, but only penalizes downside volatility.", importance: "Fairer for asymmetric return portfolios.", interpretation: "High Sortino: rises often, falls little.", example: "A steady fund with rare drops has Sortino much higher than Sharpe." },
  },
  calmar: {
    fr: { title: "Ratio de Calmar", definition: "Rapport entre le TCAC et la valeur absolue du drawdown maximum.", importance: "Mesure le rendement par rapport au pire risque subi.", interpretation: "Calmar > 1 : bon. Le rendement annuel dépasse le pire drawdown.", example: "TCAC 15% / MDD 20% = Calmar 0.75 | TCAC 20% / MDD 15% = Calmar 1.33" },
    en: { title: "Calmar Ratio", definition: "CAGR divided by absolute maximum drawdown.", importance: "Return relative to worst risk experienced.", interpretation: "Calmar > 1 is good: annual return exceeds worst drawdown.", example: "15% CAGR / 20% MDD = 0.75 | 20% CAGR / 15% MDD = 1.33" },
  },
  var95: {
    fr: { title: "VaR 95%", definition: "La perte maximale quotidienne dans 95% des cas.", importance: "Idée concrète du risque de perte sur une journée normale.", interpretation: "VaR -1.5% : 95% du temps, perte quotidienne < 1.5%.", example: "Sur 100 jours, 5 jours la perte pourra dépasser la VaR." },
    en: { title: "VaR 95%", definition: "Maximum daily loss in 95% of cases.", importance: "Concrete loss risk on a normal trading day.", interpretation: "VaR -1.5%: 95% of days, loss under 1.5%.", example: "Over 100 days, 5 days loss may exceed VaR." },
  },
};

const ADVANCED: Record<string, { title: string; formula: string; formula_explained: string; context: string; limits: string }> = {
  totalReturn: {
    title: "Total Return",
    formula: "R_total = ∏(1 + rₜ) − 1",
    formula_explained: "Produit cumulatif des rendements journaliers (1 + r₁) × (1 + r₂) × … × (1 + rₙ) − 1",
    context: "Équivalent au rendement buy-and-hold avec réinvestissement des dividendes. Utilise les prix ajustés pour neutraliser les splits et dividendes.",
    limits: "Ne tient pas compte de la durée — un +100% sur 10 ans est moins impressionnant que sur 2 ans.",
  },
  cagr: {
    title: "CAGR — Compound Annual Growth Rate",
    formula: "CAGR = (Vₙ / V₀)^(1/n) − 1",
    formula_explained: "Vₙ = valeur finale, V₀ = valeur initiale, n = nombre d'années (jours / 252)",
    context: "Taux de croissance géométrique annualisé. Suppose un réinvestissement continu des gains. Standard CFA Level 1.",
    limits: "Lisse la volatilité — deux portefeuilles avec le même CAGR peuvent avoir des trajectoires très différentes.",
  },
  volatility: {
    title: "Volatilité Annualisée",
    formula: "σ_annual = σ_daily × √252",
    formula_explained: "σ_daily = écart-type des rendements journaliers. Mis à l'échelle annuelle par √252 (jours de trading).",
    context: "Mesure de dispersion des rendements. Basée sur l'hypothèse de i.i.d. des rendements journaliers. Utilisée dans le modèle Black-Scholes.",
    limits: "Symétrique — ne distingue pas hausse et baisse. Sous-estime le risque des distributions leptokurtiques (queues épaisses).",
  },
  maxDrawdown: {
    title: "Maximum Drawdown",
    formula: "MDD = min(Wₜ − Mₜ) / Mₜ",
    formula_explained: "Wₜ = valeur cumulée, Mₜ = max(Wₛ) pour s ≤ t (high-water mark). MDD = minimum du ratio drawdown sur toute la série.",
    context: "Métrique clé en risk management. Utilisée par les hedge funds pour définir les stop-loss et les limites de levier.",
    limits: "Sensible à la fréquence des données. Un MDD sur données journalières sera toujours supérieur au MDD mensuel.",
  },
  sharpe: {
    title: "Sharpe Ratio (1966)",
    formula: "S = (R_p − R_f) / σ_p",
    formula_explained: "R_p = rendement annualisé, R_f = taux sans risque, σ_p = volatilité annualisée. Calculé sur les excès de rendement journaliers × √252.",
    context: "Fondement de la Modern Portfolio Theory. Utilisé pour comparer des fonds sur une base risque-ajustée. Hypothèse de normalité des rendements.",
    limits: "Pénalise la volatilité haussière. Biaisé par l'autocorrélation des rendements (hedge funds). Remplacé par Sortino pour les distributions asymétriques.",
  },
  sortino: {
    title: "Sortino Ratio (1994)",
    formula: "Sortino = (R_p − R_f) / σ_down",
    formula_explained: "σ_down = √(252/T × Σ min(rₜ − R_f/252, 0)²) — écart-type des seuls rendements négatifs.",
    context: "Développé par Frank Sortino. Préféré au Sharpe pour les stratégies avec options ou rendements asymétriques (private equity, crypto).",
    limits: "Moins standard que le Sharpe — comparaisons inter-fonds plus difficiles. Sensible au choix du taux cible (MAR).",
  },
  calmar: {
    title: "Calmar Ratio (1991)",
    formula: "Calmar = CAGR / |MDD|",
    formula_explained: "CAGR annualisé divisé par la valeur absolue du Maximum Drawdown sur la même période.",
    context: "Créé par Terry Young (California Managed Accounts Reports). Standard dans l'évaluation des CTA et fonds alternatifs. Horizon recommandé : 36 mois.",
    limits: "Très sensible à un seul événement de drawdown. Favorise mécaniquement les stratégies récentes sans drawdown significatif.",
  },
  var95: {
    title: "Value at Risk — VaR 95%",
    formula: "VaR_hist = Percentile(r, 5%) | VaR_param = −(μ + z₀.₀₅ × σ)",
    formula_explained: "Historique : 5ème percentile des rendements observés. Paramétrique : μ = moyenne, σ = vol, z₀.₀₅ = −1.645 (quantile normal).",
    context: "Métrique réglementaire Bâle III. Horizon journalier standard. La VaR paramétrique suppose la normalité — inadaptée aux crypto et small caps.",
    limits: "Ne dit rien sur l'amplitude des pertes au-delà du seuil (tail risk). Expected Shortfall (CVaR) = moyenne des pertes > VaR, plus robuste.",
  },
};

export default function MetricTooltip({ metric, lang = "en" }: Props) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<Level>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("portfoliolab-tooltip-level") as Level) ?? "intermediate";
    }
    return "intermediate";
  });
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  const inter = INTERMEDIATE[metric]?.[lang] ?? INTERMEDIATE[metric]?.["en"];
  const adv = ADVANCED[metric];

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const tooltipWidth = 320;
      const tooltipHeight = 420;
      let left = rect.right + 8;
      if (left + tooltipWidth > window.innerWidth - 16) {
        left = rect.left - tooltipWidth - 8;
      }
      const top = rect.bottom + tooltipHeight > window.innerHeight
        ? rect.top + window.scrollY - tooltipHeight
        : rect.top + window.scrollY - 8;
      setCoords({ top, left });
    }
    setOpen(p => !p);
  };

  const switchLevel = (l: Level) => {
    setLevel(l);
    localStorage.setItem("portfoliolab-tooltip-level", l);
  };

  if (!inter && !adv) return null;

  return (
    <span className="relative inline-block ml-1">
      <button ref={btnRef} onClick={handleOpen}
        className="w-4 h-4 rounded-full bg-slate-200 hover:bg-indigo-200 text-slate-500 hover:text-indigo-600
                   text-xs font-bold inline-flex items-center justify-center transition-colors leading-none">
        ?
      </button>
      {open && typeof window !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}/>
          <div className="fixed z-50 w-80 bg-white border border-slate-200 rounded-xl shadow-xl text-left overflow-hidden"
               style={{ top: coords.top, left: coords.left }}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100">
              <p className="text-sm font-bold text-slate-800">
                {inter?.title}
              </p>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 text-lg leading-none ml-2">×</button>
            </div>

            {/* Level toggle */}
            <div className="flex gap-1 px-4 py-2 bg-slate-50 border-b border-slate-100">
              {(["intermediate", "advanced"] as Level[]).map(l => (
                <button key={l} onClick={() => switchLevel(l)}
                  className={`flex-1 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    level === l ? "bg-indigo-600 text-white" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200"
                  }`}>
                  {l === "intermediate" ? "📘 Intermédiaire" : "🔬 Avancé"}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="p-4 space-y-3">
              {level === "intermediate" && inter && (
                <>
                  <div>
                    <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-1">Définition</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{inter.definition}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-1">Importance</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{inter.importance}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-1">Interprétation</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{inter.interpretation}</p>
                  </div>
                  <div className="bg-indigo-50 rounded-lg p-2.5">
                    <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-1">Exemple</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{inter.example}</p>
                  </div>
                </>
              )}
              {level === "advanced" && adv && (
                <>
                  <div className="bg-slate-900 rounded-lg p-3">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Formule</p>
                    <p className="text-sm font-mono text-emerald-400 leading-relaxed">{adv.formula}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-1">Notation</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{adv.formula_explained}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-1">Contexte quant</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{adv.context}</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-2.5">
                    <p className="text-xs font-semibold text-amber-600 uppercase tracking-widest mb-1">⚠ Limites</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{adv.limits}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </span>
  );
}
