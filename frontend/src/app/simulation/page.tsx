"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useApp } from "@/lib/AppContext";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { fmtCurrency, fmtPct } from "@/lib/format";
import type {
  AssetInput,
  DriftSource,
  MonteCarloResult,
  Period,
  RebalancePolicy,
  SimulationModel,
} from "@/types";
import AssetHeroCard from "@/components/AssetHeroCard";

const SimulationChart = dynamic(() => import("@/components/charts/SimulationChart"), {
  ssr: false,
});

const ACCENT = "#5B8DEF";
const ACCENT_STRONG = "#417EEB";

const HORIZONS = [5, 10, 15, 20, 30];
const SIM_COUNTS = [500, 1000, 2000];
const INVEST_PRESETS = [5_000, 10_000, 25_000, 50_000];

const CHART_POINTS = 120;

const GLOSSARY: { term: string; text: string }[] = [
  {
    term: "Simulation de Monte Carlo",
    text: "On ne calcule pas UN futur, on en tire des milliers au hasard. Chacun est un scénario possible. En les regardant tous ensemble, on obtient une distribution de résultats plutôt qu'une prédiction unique.",
  },
  {
    term: "Rendement moyen (le « drift »)",
    text: "La tendance de fond : combien l'actif rapporte par an en moyenne, une fois les hauts et les bas lissés. C'est le paramètre le plus important et le plus mal connu — l'historique ne permet pas de l'estimer précisément.",
  },
  {
    term: "Volatilité",
    text: "L'amplitude des secousses autour de cette tendance. Une volatilité de 25 % signifie que les écarts d'une année sur l'autre sont typiquement de cet ordre. Contrairement au rendement, elle s'estime bien.",
  },
  {
    term: "Bootstrap (historique rejoué)",
    text: "Au lieu d'inventer les variations avec une formule, on rejoue des morceaux réels du passé, par blocs d'un mois. Avantage : on garde les krachs, les rebonds et leur enchaînement tels qu'ils se sont produits.",
  },
  {
    term: "GBM (courbe théorique)",
    text: "Mouvement brownien géométrique. Les variations sont générées par une formule mathématique en cloche. Simple et rapide, mais il lisse la réalité : les krachs violents lui sont structurellement impossibles.",
  },
  {
    term: "Multivarié (par actif)",
    text: "Chaque actif du portefeuille est simulé séparément, en respectant la façon dont ils bougent ensemble. Seul mode qui permet de choisir si on rééquilibre le portefeuille ou non.",
  },
  {
    term: "Rééquilibrage",
    text: "Remettre les proportions à leur cible. Sans rééquilibrage, un actif qui monte prend une place croissante. L'écart de résultat entre les deux options peut dépasser 50 %.",
  },
  {
    term: "Marge d'erreur",
    text: "Le rendement et la volatilité sont mesurés sur un historique limité, donc imparfaitement connus. Activée, cette option en tient compte : la fourchette s'élargit fortement, mais elle devient sincère.",
  },
  {
    term: "Prime de risque",
    text: "Plutôt que de prolonger le passé, on part de la théorie : rendement = taux sans risque + sensibilité au marché × prime des actions. Une hypothèse discutable, mais assumée.",
  },
];

const REBALANCE_LABELS: Record<RebalancePolicy, string> = {
  daily: "quotidien",
  annual: "annuel",
  none: "aucun",
};

function fmtCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} M€`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)} k€`;
  return `${Math.round(value)} €`;
}


export default function SimulationPage() {
  const { mode, activeAsset, activePortfolio, displayMode } = useApp();
  const isBlack = displayMode === "black";
  const t = useTheme();

  const isAsset = mode === "asset";
  const hasSource = isAsset ? Boolean(activeAsset) : Boolean(activePortfolio);
  const sourceTitle = isAsset
    ? activeAsset?.ticker ?? "Sélectionner un actif"
    : activePortfolio?.name ?? "Sélectionner un portefeuille";
  const sourceDescription = isAsset
    ? activeAsset?.name ?? "Recherchez un actif depuis le menu en haut à gauche."
    : activePortfolio
      ? `${activePortfolio.assets.length} actif${activePortfolio.assets.length > 1 ? "s" : ""}`
      : "Choisissez un portefeuille depuis le menu en haut à gauche.";

  // ── Parameters ────────────────────────────────
  const [horizon, setHorizon] = useState(10);
  const [nSims, setNSims] = useState(1000);
  const [investment, setInvestment] = useState(10_000);
  const [goal, setGoal] = useState<number | "">("");
  const [simModel, setSimModel] = useState<SimulationModel>("bootstrap");
  const [paramUncertainty, setParamUncertainty] = useState(true);
  const [rebalance, setRebalance] = useState<RebalancePolicy>("annual");
  const [estimationPeriod, setEstimationPeriod] = useState<Period>("5y");
  const [driftSource, setDriftSource] = useState<DriftSource>("historical");
  const [expectedReturn, setExpectedReturn] = useState<number>(7);
  const [showGlossary, setShowGlossary] = useState(false);

  // ── Run state ─────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MonteCarloResult | null>(null);
  // Log by default: outcomes are lognormal and span orders of magnitude, so a
  // linear axis crushes the median against the bottom of the plot.
  const [logScale, setLogScale] = useState(true);

  const assets: AssetInput[] = useMemo(() => {
    if (isAsset && activeAsset) return [{ ticker: activeAsset.ticker, weight: 100 }];
    if (!isAsset && activePortfolio) return activePortfolio.assets.map((a) => ({ ticker: a.ticker, weight: a.weight }));
    return [];
  }, [isAsset, activeAsset, activePortfolio]);

  async function runSimulation() {
    if (!assets.length) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.runMonteCarlo(
        {
          assets,
          period: estimationPeriod,
          horizon_years: horizon,
          n_simulations: nSims,
          initial_investment: investment,
          simulation_model: simModel,
          parameter_uncertainty: paramUncertainty,
          rebalance,
          drift_source: driftSource,
          expected_return:
            driftSource === "explicit" ? expectedReturn / 100 : null,
        },
        typeof goal === "number" ? goal : undefined,
      );
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "La simulation a échoué. Réessayez.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const hasChart = !!result && result.sample_paths.length > 0;

  // The black theme applies to the whole page, not just the chart surface.
  // Values copied from the chart page so both look identical.
  const panel: React.CSSProperties = isBlack
    ? {
        background: "linear-gradient(180deg, #0b0b0b 0%, #070707 100%)",
        border: "1px solid rgba(255,255,255,0.30)",
        boxShadow: "0 16px 44px rgba(0,0,0,0.28)",
      }
    : {
        background: t.isDark
          ? "linear-gradient(145deg, rgba(14,34,63,0.88), rgba(7,23,46,0.96))"
          : "rgba(255,255,255,0.94)",
        border: `1px solid ${t.borderStrong}`,
        boxShadow: t.isDark ? "0 16px 42px rgba(0,0,0,0.16)" : t.shadow,
        backdropFilter: "blur(24px) saturate(125%)",
        WebkitBackdropFilter: "blur(24px) saturate(125%)",
      };

  const robustColor =
    result?.robustness_color === "green" ? t.positive
    : result?.robustness_color === "red" ? t.negative
    : "#F5A524";

  return (
    <main
      data-novac-page
      style={{
        height: "100vh",
        overflow: "hidden",
        padding: "58px 20px 14px",
        background: isBlack ? "#171717" : t.bg,
        transition: "background-color .2s ease",
        color: t.textPrimary,
        fontFamily: "inherit",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          width: "100%",
          margin: "0 auto",
          flex: "1 1 0",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ── Source header ── */}
        <div style={{ display: "flex", alignItems: "stretch", minWidth: 0, flexShrink: 0 }}>
          {isAsset && activeAsset ? (
            <AssetHeroCard ticker={activeAsset.ticker} name={activeAsset.name} type={activeAsset.type} />
          ) : (
            <section
              style={{
                ...panel,
                width: "fit-content",
                minWidth: "420px",
                minHeight: "78px",
                display: "flex",
                alignItems: "center",
                borderRadius: "18px",
                padding: "10px 16px",
              }}
            >
              <div>
                <div style={{ color: t.textPrimary, fontSize: "18px", fontWeight: 650 }}>{sourceTitle}</div>
                <div style={{ marginTop: "5px", color: t.textSecondary, fontSize: "11px" }}>{sourceDescription}</div>
              </div>
            </section>
          )}
        </div>


        {/* ── Glossary (overlay so it never pushes the page into a scroll) ── */}
        {showGlossary && (
          <>
            {/* z-index stays below the global header (50) so the nav tabs
                remain clickable — otherwise the first click on a tab is
                swallowed by this backdrop and the user has to click twice. */}
            <div
              onClick={() => setShowGlossary(false)}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 40 }}
            />
            <section
              style={{
                position: "fixed",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: 41,
                width: "min(1100px, calc(100vw - 60px))",
                maxHeight: "min(76vh, 720px)",
                overflowY: "auto",
                background: t.isDark ? "rgba(9,27,52,0.97)" : "rgba(255,255,255,0.99)",
                border: `1px solid ${t.borderStrong}`,
                borderRadius: "26px",
                padding: "24px 28px",
                boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
              }}
            >
            <div style={{ color: t.textPrimary, fontSize: "13px", fontWeight: 650, marginBottom: "4px" }}>
              Comprendre les réglages
            </div>
            <div style={{ color: t.textMuted, fontSize: "11px", marginBottom: "16px" }}>
              Cette page ne prédit pas l’avenir. Elle montre l’éventail des résultats compatibles avec une hypothèse — et à quel point cette hypothèse compte.
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "14px 26px",
              }}
            >
              {GLOSSARY.map((g) => (
                <div key={g.term}>
                  <div style={{ color: t.textPrimary, fontSize: "11.5px", fontWeight: 620, marginBottom: "3px" }}>
                    {g.term}
                  </div>
                  <div style={{ color: t.textSecondary, fontSize: "11px", lineHeight: 1.55 }}>
                    {g.text}
                  </div>
                </div>
              ))}
            </div>
            </section>
          </>
        )}

        {/* ── Chart + results ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(290px, 360px)",
            gap: "12px",
            marginTop: "10px",
            flex: "1 1 0",
            minHeight: 0,
          }}
        >
          {/* Projection — same shell as the main trading chart */}
          <section
            className={isBlack ? undefined : "chart-glass-container"}
            data-glass-edge=""
            style={{
              border: isBlack ? "1px solid rgba(255,255,255,0.30)" : "1px solid rgba(205,225,255,0.16)",
              borderRadius: "30px",
              padding: "14px 18px 10px",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              position: "relative",
              background: isBlack
                ? "linear-gradient(180deg, #0b0b0b 0%, #070707 100%)"
                : "rgba(9,27,52,0.78)",
              backdropFilter: isBlack ? "none" : "blur(28px) saturate(1.2)",
              WebkitBackdropFilter: isBlack ? "none" : "blur(28px) saturate(1.2)",
              boxShadow: isBlack ? "0 16px 44px rgba(0,0,0,0.28)" : "0 12px 36px rgba(0,0,0,0.10)",
            }}
          >
            {/* Radial glow behind the plot, as on the chart page */}
            <div
              style={{
                position: "absolute",
                inset: isBlack ? 0 : -28,
                pointerEvents: "none",
                zIndex: 0,
                filter: isBlack ? "none" : "blur(20px)",
                opacity: isBlack ? 1 : 0.78,
                background: isBlack
                  ? "radial-gradient(ellipse 62% 38% at 12% 0%, rgba(255,255,255,0.018) 0%, transparent 72%)"
                  : "radial-gradient(ellipse 90% 72% at -10% -10%, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.014) 42%, rgba(255,255,255,0) 82%), radial-gradient(ellipse 86% 75% at 110% 112%, rgba(60,113,184,0.045) 0%, rgba(60,113,184,0.018) 44%, rgba(60,113,184,0) 84%)",
              }}
            />
            <div style={{ display: "flex", alignItems: "center" }}>
              <div>
                <div style={{ color: t.textPrimary, fontSize: "16px", fontWeight: 620 }}>
                  Projection {hasSource ? `de ${sourceTitle}` : ""}
                </div>
                <div style={{ marginTop: "4px", color: t.textMuted, fontSize: "10px" }}>
                  {result
                    ? [
                        `${nSims.toLocaleString("fr-FR")} trajectoires`,
                        result.model === "bootstrap"
                          ? "bootstrap par blocs de 21 j"
                          : result.model === "multivariate"
                            ? "multivarié (Cholesky)"
                            : "GBM gaussien",
                        ...(result.model === "multivariate" && assets.length > 1
                          ? [`rebalancement ${REBALANCE_LABELS[result.rebalance]}`]
                          : []),
                        `estimé sur ${result.n_observations.toLocaleString("fr-FR")} jours (${(
                          result.n_observations / 252
                        ).toFixed(1)} ans)`,
                      ].join(" · ")
                    : `${nSims.toLocaleString("fr-FR")} trajectoires simulées`}
                </div>
              </div>
              {result && (
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "14px" }}>
                  <Legend
                    swatch="rgba(255,255,255,0.45)"
                    label={`${result.sample_paths.length.toLocaleString("fr-FR")} scénarios`}
                    t={t}
                    line
                  />
                  <Legend swatch={ACCENT} label="Médiane" t={t} line />
                  <button
                    onClick={() => setLogScale((v) => !v)}
                    style={{
                      marginLeft: "4px",
                      padding: "5px 10px",
                      borderRadius: "9px",
                      border: `1px solid ${logScale ? "rgba(91,141,239,0.45)" : t.border}`,
                      background: logScale ? "rgba(91,141,239,0.14)" : "transparent",
                      color: logScale ? ACCENT : t.textMuted,
                      fontSize: "10px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Log
                  </button>
                </div>
              )}
            </div>

            {/* paddingTop gives the topmost price label room; without it the
                label sits on the canvas edge and is clipped by the panel. */}
            <div style={{ position: "relative", flex: "1 1 0", minHeight: 0, marginTop: "10px", paddingTop: "8px" }}>
              {result && hasChart ? (
                <SimulationChart
                  paths={result.sample_paths}
                  median={result.percentiles.p50}
                  timeIndex={result.path_time_index}
                  horizonYears={horizon}
                  target={typeof goal === "number" && goal > 0 ? goal : null}
                  logScale={logScale}
                  black={isBlack}
                />
              ) : (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "grid",
                    placeItems: "center",
                    textAlign: "center",
                    borderTop: `1px solid ${t.border}`,
                    backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent 72px, ${t.border} 73px)`,
                  }}
                >
                  <div style={{ maxWidth: "340px" }}>
                    <div style={{ color: t.textPrimary, fontSize: "14px", fontWeight: 560 }}>
                      {error ? "Erreur" : loading ? "Simulation en cours…" : hasSource ? "Prêt à simuler" : "Sélectionnez une source"}
                    </div>
                    <div style={{ marginTop: "7px", color: error ? t.negative : t.textMuted, fontSize: "11px", lineHeight: 1.55 }}>
                      {error
                        ? error
                        : loading
                          ? "Projection des trajectoires…"
                          : hasSource
                            ? "Ajustez les paramètres puis lancez la simulation."
                            : `Choisissez ${isAsset ? "un actif" : "un portefeuille"} pour afficher les projections.`}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Results */}
          <aside
            style={{
              ...panel,
              borderRadius: "30px",
              padding: "14px 18px",
              minHeight: 0,
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <div>
                <div style={{ color: t.textPrimary, fontSize: "15px", fontWeight: 620 }}>Résultats</div>
                <div style={{ marginTop: "3px", color: t.textMuted, fontSize: "10px" }}>
                  À l’horizon de {horizon} ans
                </div>
              </div>
              {result && (
                <div
                  style={{
                    marginLeft: "auto",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                  }}
                >
                  <div style={{ color: robustColor, fontSize: "22px", fontWeight: 700, lineHeight: 1 }}>
                    {result.robustness_score}
                  </div>
                  <div style={{ color: robustColor, fontSize: "9px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    {result.robustness_label}
                  </div>
                </div>
              )}
            </div>

            {([
              {
                label: "Résultat le plus probable",
                help: "La valeur médiane : la moitié des scénarios finissent au-dessus, la moitié en dessous.",
                value: result ? fmtCurrency(result.final_values_p50) : "—",
              },
              {
                label: "Fourchette probable",
                help: "9 scénarios sur 10 finissent dans cette fourchette. Il reste 1 chance sur 20 de faire moins que la borne basse, et autant de faire mieux que la borne haute.",
                value: result
                  ? `${fmtCompact(result.final_values_p5)} – ${fmtCompact(result.final_values_p95)}`
                  : "—",
              },
              {
                label: "Chances de gagner",
                help: "Part des scénarios qui finissent au-dessus de la mise de départ.",
                value: result ? fmtPct(1 - result.probability_of_loss, 0) : "—",
                color: result ? t.positive : undefined,
              },
              {
                label: "Risque de perdre",
                help: "Part des scénarios qui finissent en dessous de la mise de départ.",
                value: result ? fmtPct(result.probability_of_loss, 0) : "—",
                color: result ? t.negative : undefined,
              },
              {
                label: "Rendement retenu",
                help: result?.drift_source === "historical"
                  ? "Rendement annuel moyen supposé, prolongé depuis l'historique. C'est l'hypothèse la plus lourde de toute la simulation."
                  : result?.drift_source === "explicit"
                    ? "Rendement annuel que tu as fixé toi-même."
                    : "Rendement annuel déduit du taux sans risque et de la sensibilité au marché.",
                value: result ? fmtPct(result.annualized_return, 1) : "—",
                sub:
                  result && result.parameter_uncertainty && result.drift_source === "historical"
                    ? `plage plausible ${fmtPct(result.expected_return_low, 1)} → ${fmtPct(result.expected_return_high, 1)}`
                    : undefined,
              },
              {
                label: "Volatilité",
                help: "Amplitude des variations d'une année sur l'autre. Contrairement au rendement, elle s'estime correctement sur un historique court.",
                value: result ? fmtPct(result.annualized_volatility, 1) : "—",
              },
              {
                label: "Pire scénario sur 100",
                help: "Seul 1 scénario sur 100 finit en dessous de ce montant.",
                value: result ? fmtCompact(result.final_values_p1) : "—",
              },
              {
                label: "Moyenne des 5 % pires cas",
                help: "Quand ça tourne vraiment mal, voilà à quoi s'attendre en moyenne. Plus parlant que la seule pire valeur, car cela résume toute la queue basse.",
                value: result ? fmtCompact(result.expected_shortfall_5) : "—",
              },
            ]).map((row, index) => (
              <div
                key={row.label}
                aria-label={row.help}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  padding: "7px 0",
                  borderTop: `1px solid ${t.border}`,
                  marginTop: index === 0 ? "12px" : 0,
                  cursor: "help",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: t.textSecondary, fontSize: "11px" }}>{row.label}</div>
                  {"sub" in row && row.sub && (
                    <div style={{ color: t.textMuted, fontSize: "9.5px", marginTop: "2px" }}>{row.sub}</div>
                  )}
                </div>
                <span style={{ color: row.color ?? (result ? t.textPrimary : t.textMuted), fontSize: "13px", fontWeight: 600, whiteSpace: "nowrap" }}>
                  {row.value}
                </span>
              </div>
            ))}

            {/* Goal analysis */}
            {result?.goal_analysis && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "13px 14px",
                  borderRadius: "14px",
                  border: `1px solid ${t.border}`,
                  background: t.isDark ? "rgba(91,141,239,0.06)" : "rgba(65,126,235,0.05)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ color: t.textSecondary, fontSize: "11px" }}>
                    Atteindre {fmtCurrency(result.goal_analysis.target_value)}
                  </span>
                  <span style={{ color: ACCENT_STRONG, fontSize: "15px", fontWeight: 700 }}>
                    {fmtPct(result.goal_analysis.probability_of_reaching, 0)}
                  </span>
                </div>
                {result.goal_analysis.years_to_reach_median != null && (
                  <div style={{ marginTop: "6px", color: t.textMuted, fontSize: "10px" }}>
                    Atteint en ~{result.goal_analysis.years_to_reach_median} ans (scénario médian)
                  </div>
                )}
              </div>
            )}

            {/* Distribution histogram */}
            <div style={{ marginTop: "12px" }}>
              <div style={{ color: t.textMuted, fontSize: "10px", marginBottom: "6px" }}>
                Distribution des valeurs finales
              </div>
              {result ? (
                <Histogram result={result} t={t} />
              ) : (
                <div
                  style={{
                    height: "90px",
                    borderRadius: "14px",
                    border: `1px solid ${t.border}`,
                    background: t.isDark ? "rgba(255,255,255,0.012)" : "rgba(16,24,40,0.015)",
                    display: "grid",
                    placeItems: "center",
                    color: t.textMuted,
                    fontSize: "10px",
                  }}
                >
                  Lancez une simulation
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* ── Parameters ── */}
        <section
          style={{
            ...panel,
            marginTop: "10px",
            borderRadius: "20px",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-end",
            gap: "16px 20px",
            padding: "11px 16px",
            flexShrink: 0,
          }}
        >
          <Field label="Horizon">
            <SegPills
              options={HORIZONS.map((h) => ({ value: h, label: `${h} ans` }))}
              value={horizon}
              onChange={setHorizon}
              t={t}
            />
          </Field>

          <Field label="Investissement initial">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <SegPills
                options={INVEST_PRESETS.map((v) => ({ value: v, label: fmtCompact(v) }))}
                value={investment}
                onChange={setInvestment}
                t={t}
              />
              <input
                type="number"
                min={100}
                step={1000}
                value={investment}
                onChange={(e) => setInvestment(Math.max(100, Number(e.target.value) || 0))}
                style={numberInput(t)}
              />
            </div>
          </Field>

          <Field label="Simulations">
            <SegPills
              options={SIM_COUNTS.map((v) => ({ value: v, label: v.toLocaleString("fr-FR") }))}
              value={nSims}
              onChange={setNSims}
              t={t}
            />
          </Field>

          <Field label="Rendement attendu">
            <SegPills<DriftSource>
              options={[
                { value: "historical", label: "Passé prolongé", title: "On suppose que l'actif rapportera à l'avenir ce qu'il a rapporté par le passé. Hypothèse forte et souvent trop optimiste." },
                { value: "explicit", label: "Je le fixe", title: "Tu choisis toi-même le rendement annuel attendu. L'hypothèse devient explicite et discutable." },
                { value: "risk_premium", label: "Prime de risque", title: "Rendement = taux sans risque + sensibilité au marché (bêta) × prime de risque actions. Ancré sur la théorie financière plutôt que sur le passé de l'actif." },
              ]}
              value={driftSource}
              onChange={setDriftSource}
              t={t}
            />
          </Field>

          {driftSource === "explicit" && (
            <Field label="Rendement annuel">
              <div style={{ position: "relative", display: "inline-block" }}>
                <input
                  type="number"
                  step={0.5}
                  value={expectedReturn}
                  onChange={(e) => setExpectedReturn(Number(e.target.value))}
                  style={{
                    width: "104px",
                    height: "34px",
                    padding: "0 26px 0 12px",
                    borderRadius: "10px",
                    border: `1px solid ${t.border}`,
                    background: t.isDark ? "rgba(255,255,255,0.02)" : "rgba(16,24,40,0.02)",
                    color: t.textPrimary,
                    fontSize: "13px",
                    fontWeight: 600,
                  }}
                />
                <span
                  style={{
                    position: "absolute",
                    right: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontSize: "12px",
                    color: t.textMuted,
                    pointerEvents: "none",
                  }}
                >
                  %
                </span>
              </div>
            </Field>
          )}

          <Field label="Historique estimé">
            <SegPills<Period>
              options={[
                { value: "1y", label: "1 an", title: "Réactif au régime récent, mais μ et σ très bruités" },
                { value: "3y", label: "3 ans", title: "Compromis entre réactivité et précision d'estimation" },
                { value: "5y", label: "5 ans", title: "Estimation plus stable, peut manquer un changement de régime" },
                { value: "10y", label: "10 ans", title: "Inclut plusieurs cycles — l'erreur-type sur le drift baisse en 1/√T" },
              ]}
              value={estimationPeriod}
              onChange={setEstimationPeriod}
              t={t}
            />
          </Field>

          <Field label="Modèle">
            <SegPills<SimulationModel>
              options={[
                { value: "bootstrap", label: "Bootstrap", title: "Rééchantillonne des blocs de 21 jours de rendements réels — conserve queues épaisses, asymétrie et retour à la moyenne" },
                { value: "gbm", label: "GBM", title: "Mouvement brownien géométrique — rendements log gaussiens i.i.d." },
                { value: "multivariate", label: "Multivarié", title: "Simule chaque actif séparément, corrélés par décomposition de Cholesky — permet de choisir la politique de rebalancement" },
              ]}
              value={simModel}
              onChange={setSimModel}
              t={t}
            />
          </Field>

          {simModel === "multivariate" && assets.length > 1 && (
            <Field label="Rebalancement">
              <SegPills<RebalancePolicy>
                options={[
                  { value: "daily", label: "Quotidien", title: "Poids cibles restaurés chaque jour — hypothèse implicite des modèles agrégés" },
                  { value: "annual", label: "Annuel", title: "Poids cibles restaurés une fois par an" },
                  { value: "none", label: "Aucun", title: "Buy and hold — les gagnants prennent une place croissante et l'allocation dérive" },
                ]}
                value={rebalance}
                onChange={setRebalance}
                t={t}
              />
            </Field>
          )}

          <Field label="Incertitude">
            <button
              onClick={() => setParamUncertainty((v) => !v)}
              aria-label="Le rendement et la volatilité sont estimés sur un historique limité : on ne les connaît pas exactement. Cochée, chaque trajectoire utilise des valeurs légèrement différentes, tirées au sort dans la plage plausible. L'intervalle s'élargit beaucoup — c'est le prix de l'honnêteté."
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                height: "34px",
                padding: "0 12px",
                borderRadius: "10px",
                cursor: "pointer",
                border: `1px solid ${paramUncertainty ? "rgba(91,141,239,0.45)" : t.border}`,
                background: paramUncertainty
                  ? "rgba(91,141,239,0.14)"
                  : t.isDark ? "rgba(255,255,255,0.02)" : "rgba(16,24,40,0.02)",
                color: paramUncertainty ? ACCENT : t.textSecondary,
                fontSize: "11px",
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: "13px",
                  height: "13px",
                  borderRadius: "4px",
                  display: "grid",
                  placeItems: "center",
                  fontSize: "9px",
                  color: "#F8F9FC",
                  border: `1px solid ${paramUncertainty ? ACCENT_STRONG : t.borderStrong}`,
                  background: paramUncertainty ? ACCENT_STRONG : "transparent",
                }}
              >
                {paramUncertainty ? "✓" : ""}
              </span>
              Marge d’erreur
            </button>
          </Field>

          <Field label="Objectif (optionnel)">
            <input
              type="number"
              min={0}
              step={1000}
              placeholder="—"
              value={goal}
              onChange={(e) => setGoal(e.target.value === "" ? "" : Math.max(0, Number(e.target.value) || 0))}
              style={{ ...numberInput(t), width: "120px" }}
            />
          </Field>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={() => setShowGlossary((v) => !v)}
              aria-label="Comprendre les réglages et le vocabulaire"
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "10px",
                cursor: "pointer",
                border: `1px solid ${showGlossary ? "rgba(91,141,239,0.45)" : t.border}`,
                background: showGlossary ? "rgba(91,141,239,0.14)" : "transparent",
                color: showGlossary ? ACCENT : t.textMuted,
                fontSize: "14px",
                fontWeight: 700,
              }}
            >
              ?
            </button>
            <button
              disabled={!hasSource || loading}
              onClick={runSimulation}
              style={{
                minWidth: "174px",
                height: "40px",
                border: "1px solid rgba(91,141,239,0.35)",
                borderRadius: "11px",
                background: hasSource && !loading
                  ? "linear-gradient(180deg, rgba(65,126,235,0.96), rgba(45,98,198,0.96))"
                  : "rgba(91,141,239,0.10)",
                color: hasSource && !loading ? "#F8F9FC" : t.textMuted,
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.035em",
                cursor: hasSource && !loading ? "pointer" : "not-allowed",
                transition: "filter 0.15s",
              }}
            >
              {loading ? "Simulation en cours…" : "Lancer la simulation"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

// ── Sub-components ──────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <div>
      <div style={{ color: t.textMuted, fontSize: "9px", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "7px" }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function SegPills<T extends string | number>({
  options,
  value,
  onChange,
  t,
}: {
  options: { value: T; label: string; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  t: ReturnType<typeof useTheme>;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        padding: "3px",
        borderRadius: "10px",
        border: `1px solid ${t.border}`,
        background: t.isDark ? "rgba(255,255,255,0.02)" : "rgba(16,24,40,0.02)",
        gap: "2px",
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            aria-label={opt.title}
            onClick={() => onChange(opt.value)}
            style={{
              padding: "6px 11px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              fontSize: "11px",
              fontWeight: active ? 650 : 500,
              color: active ? "#F8F9FC" : t.textSecondary,
              background: active ? "linear-gradient(180deg, rgba(65,126,235,0.96), rgba(45,98,198,0.96))" : "transparent",
              transition: "all 0.12s",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function numberInput(t: ReturnType<typeof useTheme>): React.CSSProperties {
  return {
    width: "96px",
    height: "34px",
    padding: "0 10px",
    borderRadius: "9px",
    border: `1px solid ${t.border}`,
    background: t.isDark ? "rgba(255,255,255,0.03)" : "#fff",
    color: t.textPrimary,
    fontSize: "12px",
    fontWeight: 600,
    outline: "none",
  };
}

function Legend({ swatch, label, t, line }: { swatch: string; label: string; t: ReturnType<typeof useTheme>; line?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
      <span style={{ width: "11px", height: line ? "2px" : "9px", borderRadius: line ? 0 : "3px", background: swatch }} />
      <span style={{ color: t.textMuted, fontSize: "10px" }}>{label}</span>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
      <span style={{ color }}>{label}</span>
      <span style={{ color, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function Histogram({ result, t }: { result: MonteCarloResult; t: ReturnType<typeof useTheme> }) {
  const bins = result.distribution;
  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const init = result.initial_investment;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "62px" }}>
      {bins.map((b, i) => {
        const gain = b.range_min >= init;
        return (
          <div
            key={i}
            aria-label={`${fmtCompact(b.range_min)} – ${fmtCompact(b.range_max)} · ${b.pct}%`}
            style={{
              flex: 1,
              height: `${Math.max(2, (b.count / maxCount) * 100)}%`,
              borderRadius: "2px 2px 0 0",
              background: gain ? t.positive : t.negative,
              opacity: 0.72,
            }}
          />
        );
      })}
    </div>
  );
}
