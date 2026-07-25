"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { useApp } from "@/lib/AppContext";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { fmtCurrency, fmtPct } from "@/lib/format";
import type {
  AssetInput,
  MonteCarloResult,
  Period,
  RebalancePolicy,
  SimulationModel,
} from "@/types";
import AssetHeroCard from "@/components/AssetHeroCard";

const ACCENT = "#5B8DEF";
const ACCENT_STRONG = "#417EEB";

const HORIZONS = [5, 10, 15, 20, 30];
const SIM_COUNTS = [500, 1000, 2000];
const INVEST_PRESETS = [5_000, 10_000, 25_000, 50_000];

const CHART_POINTS = 120;

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

type ChartPoint = { year: number; band90: [number, number]; band50: [number, number]; median: number };

function buildChartData(res: MonteCarloResult): ChartPoint[] {
  const { p5, p25, p50, p75, p95 } = res.percentiles;
  const n = p50.length;
  if (n === 0) return [];
  const step = Math.max(1, Math.floor(n / CHART_POINTS));
  const data: ChartPoint[] = [];
  for (let i = 0; i < n; i += step) {
    data.push({
      year: +(i / 252).toFixed(2),
      band90: [p5[i], p95[i]],
      band50: [p25[i], p75[i]],
      median: p50[i],
    });
  }
  const last = n - 1;
  if (data.length && data[data.length - 1].year !== +(last / 252).toFixed(2)) {
    data.push({
      year: +(last / 252).toFixed(2),
      band90: [p5[last], p95[last]],
      band50: [p25[last], p75[last]],
      median: p50[last],
    });
  }
  return data;
}

export default function SimulationPage() {
  const { mode, activeAsset, activePortfolio } = useApp();
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

  // ── Run state ─────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MonteCarloResult | null>(null);
  const [logScale, setLogScale] = useState(false);

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

  const chartData = useMemo(() => (result ? buildChartData(result) : []), [result]);

  const panel: React.CSSProperties = {
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
        minHeight: "100vh",
        padding: "62px 20px 36px",
        background: t.bg,
        color: t.textPrimary,
        fontFamily: "inherit",
      }}
    >
      <div style={{ width: "100%", margin: "0 auto" }}>
        {/* ── Source header ── */}
        <div style={{ display: "flex", alignItems: "stretch", minWidth: 0, minHeight: "78px" }}>
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

        {/* ── Parameters ── */}
        <section
          style={{
            ...panel,
            marginTop: "14px",
            borderRadius: "22px",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-end",
            gap: "22px",
            padding: "16px 18px",
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
              title="Tire μ et σ dans leur loi a posteriori à chaque trajectoire, au lieu de traiter les estimations comme certaines. Élargit fortement l'intervalle — c'est l'effet réel de n'avoir que 5 ans de données."
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
              Paramètres estimés
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

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
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

        {/* ── Chart + results ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(290px, 360px)",
            gap: "14px",
            marginTop: "14px",
          }}
        >
          {/* Projection */}
          <section
            style={{
              ...panel,
              minHeight: "472px",
              borderRadius: "30px",
              padding: "22px 24px",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
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
                  <Legend swatch={`${ACCENT}55`} label="90 %" t={t} />
                  <Legend swatch={`${ACCENT}aa`} label="50 %" t={t} />
                  <Legend swatch={ACCENT_STRONG} label="Médiane" t={t} line />
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

            <div style={{ position: "relative", flex: 1, minHeight: "365px", marginTop: "18px" }}>
              {result && chartData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                    <defs>
                      <linearGradient id="band90" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={ACCENT} stopOpacity={0.22} />
                        <stop offset="100%" stopColor={ACCENT} stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={t.border} vertical={false} />
                    <XAxis
                      dataKey="year"
                      type="number"
                      domain={[0, horizon]}
                      tickFormatter={(v) => `${v} a`}
                      tick={{ fill: t.textMuted, fontSize: 10 }}
                      axisLine={{ stroke: t.border }}
                      tickLine={false}
                    />
                    <YAxis
                      scale={logScale ? "log" : "linear"}
                      domain={logScale ? ["auto", "auto"] : [0, "auto"]}
                      allowDataOverflow={false}
                      tickFormatter={fmtCompact}
                      tick={{ fill: t.textMuted, fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      width={54}
                    />
                    <Tooltip content={<ChartTooltip t={t} />} />
                    <ReferenceLine
                      y={result.initial_investment}
                      stroke={t.textMuted}
                      strokeDasharray="4 4"
                    />
                    {typeof goal === "number" && goal > 0 && (
                      <ReferenceLine y={goal} stroke={t.positive} strokeDasharray="5 3"
                        label={{ value: "Objectif", fill: t.positive, fontSize: 10, position: "insideTopRight" }} />
                    )}
                    <Area
                      dataKey="band90"
                      stroke="none"
                      fill="url(#band90)"
                      isAnimationActive={false}
                      activeDot={false}
                    />
                    <Area
                      dataKey="band50"
                      stroke="none"
                      fill={ACCENT}
                      fillOpacity={0.28}
                      isAnimationActive={false}
                      activeDot={false}
                    />
                    <Line
                      dataKey="median"
                      stroke={ACCENT_STRONG}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
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
              minHeight: "472px",
              borderRadius: "30px",
              padding: "22px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <div>
                <div style={{ color: t.textPrimary, fontSize: "16px", fontWeight: 620 }}>Résultats</div>
                <div style={{ marginTop: "5px", color: t.textMuted, fontSize: "10px" }}>
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

            {[
              ["Valeur médiane", result ? fmtCurrency(result.final_values_p50) : "—"],
              ["Intervalle 90 %", result ? `${fmtCompact(result.final_values_p5)} – ${fmtCompact(result.final_values_p95)}` : "—"],
              ["Probabilité de gain", result ? fmtPct(1 - result.probability_of_loss, 0) : "—", result ? t.positive : undefined],
              ["Risque de perte", result ? fmtPct(result.probability_of_loss, 0) : "—", result ? t.negative : undefined],
              [
                "Rendement annualisé",
                result
                  ? result.parameter_uncertainty
                    ? `${fmtPct(result.annualized_return, 1)} ± ${fmtPct(result.drift_std_error, 1)}`
                    : fmtPct(result.annualized_return, 1)
                  : "—",
              ],
              ["Volatilité annualisée", result ? fmtPct(result.annualized_volatility, 1) : "—"],
              ["Pire 1 % (P1)", result ? fmtCompact(result.final_values_p1) : "—"],
              ["Perte moy. au-delà du P5", result ? fmtCompact(result.expected_shortfall_5) : "—"],
            ].map(([label, value, color], index) => (
              <div
                key={label as string}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "13px 0",
                  borderTop: `1px solid ${t.border}`,
                  marginTop: index === 0 ? "20px" : 0,
                }}
              >
                <span style={{ color: t.textSecondary, fontSize: "11px" }}>{label as string}</span>
                <span style={{ color: (color as string) ?? (result ? t.textPrimary : t.textMuted), fontSize: "13px", fontWeight: 600 }}>
                  {value as string}
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
            <div style={{ marginTop: "18px" }}>
              <div style={{ color: t.textMuted, fontSize: "10px", marginBottom: "8px" }}>
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
            title={opt.title}
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

function ChartTooltip({ active, payload, t }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as ChartPoint;
  return (
    <div
      style={{
        background: t.isDark ? "rgba(7,23,46,0.96)" : "rgba(255,255,255,0.98)",
        border: `1px solid ${t.borderStrong}`,
        borderRadius: "10px",
        padding: "9px 11px",
        fontSize: "11px",
        color: t.textPrimary,
        boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
      }}
    >
      <div style={{ color: t.textMuted, fontSize: "10px", marginBottom: "5px" }}>Année {p.year.toFixed(1)}</div>
      <Row label="Médiane" value={fmtCurrency(p.median)} color={ACCENT_STRONG} />
      <Row label="P25–P75" value={`${fmtCompact(p.band50[0])} – ${fmtCompact(p.band50[1])}`} color={t.textSecondary} />
      <Row label="P5–P95" value={`${fmtCompact(p.band90[0])} – ${fmtCompact(p.band90[1])}`} color={t.textMuted} />
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
    <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "90px" }}>
      {bins.map((b, i) => {
        const gain = b.range_min >= init;
        return (
          <div
            key={i}
            title={`${fmtCompact(b.range_min)} – ${fmtCompact(b.range_max)} · ${b.pct}%`}
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
