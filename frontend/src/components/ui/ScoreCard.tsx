"use client";

interface ScoreData {
  global_score: number;
  scores: Record<string, number>;
  profile: string;
  profile_en: string;
  profile_emoji: string;
  profile_desc: string;
  profile_desc_en: string;
  synthesis: string;
  synthesis_en: string;
}

interface Props {
  score: ScoreData;
  locale: string;
}

const SCORE_LABELS: Record<string, Record<string, string>> = {
  performance: { fr: "Performance", en: "Performance", es: "Rendimiento", de: "Performance", zh: "业绩" },
  risk: { fr: "Risque", en: "Risk", es: "Riesgo", de: "Risiko", zh: "风险" },
  risk_adjusted: { fr: "Rendement ajusté", en: "Risk-adjusted", es: "Ajustado", de: "Risikoadjustiert", zh: "风险调整" },
  diversification: { fr: "Diversification", en: "Diversification", es: "Diversificación", de: "Diversifikation", zh: "分散化" },
};

function scoreColor(score: number, max: number): string {
  const pct = score / max;
  if (pct >= 0.8) return "bg-emerald-500";
  if (pct >= 0.6) return "bg-indigo-500";
  if (pct >= 0.4) return "bg-amber-400";
  return "bg-red-400";
}

function globalColor(score: number): string {
  if (score >= 80) return "text-emerald-600";
  if (score >= 65) return "text-indigo-600";
  if (score >= 50) return "text-amber-500";
  return "text-red-500";
}

export default function ScoreCard({ score, locale }: Props) {
  const lang = locale in SCORE_LABELS.performance ? locale : "en";
  const synthesis = locale === "fr" ? score.synthesis : score.synthesis_en;
  const profileDesc = locale === "fr" ? score.profile_desc : score.profile_desc_en;
  const profileName = locale === "fr" ? score.profile : score.profile_en;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">
              Score Global
            </p>
            <div className="flex items-end gap-2">
              <span className={`text-5xl font-bold tabular-nums ${globalColor(score.global_score)}`}>
                {score.global_score}
              </span>
              <span className="text-xl text-slate-300 mb-1">/100</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl mb-1">{score.profile_emoji}</div>
            <span className={`text-sm font-bold px-3 py-1.5 rounded-lg ${
              score.global_score >= 80 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
              score.global_score >= 65 ? "bg-indigo-50 text-indigo-700 border border-indigo-200" :
              score.global_score >= 50 ? "bg-amber-50 text-amber-700 border border-amber-200" :
              "bg-red-50 text-red-700 border border-red-200"
            }`}>
              {profileName}
            </span>
          </div>
        </div>

        {/* Global progress bar */}
        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${globalColor(score.global_score).replace("text-", "bg-")}`}
            style={{ width: `${score.global_score}%` }}
          />
        </div>
      </div>

      {/* Sub-scores */}
      <div className="p-5 border-b border-slate-100">
        <div className="space-y-3">
          {Object.entries(score.scores).map(([key, val]) => (
            <div key={key}>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="font-medium text-slate-600">
                  {SCORE_LABELS[key]?.[lang] ?? key}
                </span>
                <span className="font-bold tabular-nums text-slate-700">{val}/25</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${scoreColor(val, 25)}`}
                  style={{ width: `${(val / 25) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Profile */}
      <div className="p-5 border-b border-slate-100 bg-slate-50">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
          Profil Investisseur
        </p>
        <p className="text-sm text-slate-600 leading-relaxed">{profileDesc}</p>
      </div>

      {/* Synthesis */}
      <div className="p-5">
        <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-2">
          💬 Synthèse
        </p>
        <p className="text-sm text-slate-700 leading-relaxed">{synthesis}</p>
      </div>
    </div>
  );
}
