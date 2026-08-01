"use client";
import { useEffect, useState, useMemo, useRef, Suspense } from "react";
import type { ReactNode } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useApp } from "@/lib/AppContext";
import AssetLogo from "@/components/AssetLogo";
import TransactionModal from "@/components/TransactionModal";
import TransactionsList from "@/components/TransactionsList";
import PerformanceChart from "@/components/portfolio/PerformanceChart";
import AssetGrid from "@/components/portfolio/AssetGrid";
import AllocationDonut from "@/components/portfolio/AllocationDonut";
import RecentActivity from "@/components/portfolio/RecentActivity";
import PortfolioTabs from "@/components/portfolio/PortfolioTabs";
import { donutArcs } from "@/lib/donut";
import { valoriser } from "@/lib/portfolio";
import { enTetesAuth } from "@/lib/session";
import { FONT } from "@/lib/typography";
import type { Period } from "@/lib/chart/portfolioCurve";

// ── Types ──────────────────────────────────────────────────────────────────────
type PortfolioAsset = { ticker: string; weight: number };
type PortfolioData  = { id: string; name: string; assets: PortfolioAsset[]; color: string; total_value?: number | null; cost_basis?: number | null };
type PriceData      = { symbol: string; price: number; change: number; series?: number[] };
type Enriched       = PortfolioAsset & {
  price: number | null; change: number | null; type?: string;
  value: number | null; perfEur: number | null;
  /** Renseignés quand la valorisation vient des transactions. */
  quantity?: number | null; avgCost?: number | null; invested?: number | null; pnlEur?: number | null;
};

/** Une ligne de `/positions` : ce que les transactions impliquent réellement. */
type Position = {
  ticker: string; quantity: number; avg_cost: number; invested: number;
  current_price: number | null; current_value: number | null;
  pnl_eur: number | null; pnl_pct: number | null; weight: number | null;
};
type PositionsData = {
  source: "transactions" | "weights";
  positions: Position[];
  total_value: number | null;
  total_invested: number | null;
  total_pnl_eur: number | null;
  total_pnl_pct: number | null;
};


// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtChange(v: number | null) {
  if (v === null) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}

// ── Exposition ─────────────────────────────────────────────────────────────────
const CRYPTO_SET = new Set(["BTC","ETH","BNB","SOL","XRP","ADA","DOGE","AVAX","LINK","UNI","LTC","MATIC","DOT"]);
const ETF_RE     = /^(SPY|QQQ|IWM|VTI|VOO|GLD|TLT|HYG|EEM|VEA|IEFA|ARKK)/i;

function classifyExposition(assets: Enriched[]): Record<string, number> {
  const groups: Record<string, number> = {};
  for (const a of assets) {
    const t = a.ticker.replace(/-USD$/, "").replace(/\.[A-Z]+$/, "").toUpperCase();
    let cat = "Actions";
    if (CRYPTO_SET.has(t) || a.type === "CRYPTOCURRENCY" || a.ticker.endsWith("-USD")) cat = "Crypto";
    else if (ETF_RE.test(t)) cat = "ETF";
    groups[cat] = (groups[cat] ?? 0) + a.weight;
  }
  return groups;
}

const EXPO_COLORS: Record<string, string> = {
  Actions: "#5B8DEF", Crypto: "#fbbf24", ETF: "#a78bfa", Cash: "#34d399",
};

// ── Sparkline ──────────────────────────────────────────────────────────────────
/* Les séries viennent du backend, qui les renvoie avec le prix — même appel,
   aucun coût réseau supplémentaire. Il y avait ici trois générateurs de fausses
   courbes : `seededRand`, `genSparkline` et `initPriceHistory` fabriquaient une
   marche aléatoire à graine fixe entre le cours d'ouverture et le prix courant.
   Le résultat était crédible, stable d'un rendu à l'autre, et faux : une page
   qui affiche des montants en euros ne peut pas dessiner des cours inventés
   juste à côté. */

function Sparkline({ pts, color, w = 48, h = 18, glow = false }: {
  pts: number[]; color: string; w?: number; h?: number; glow?: boolean;
}) {
  const n   = pts.length;
  const min = Math.min(...pts), max = Math.max(...pts);
  const rng = max - min || 0.01;
  const x   = (i: number) => (i / (n - 1)) * w;
  const y   = (v: number) => h - ((v - min) / rng) * (h - 2) - 1;
  const d   = pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const uid = `sp${color.replace(/\W/g, "")}-${w}-${h}`;
  return (
    <svg width={w} height={h} style={{ display: "block", flexShrink: 0, overflow: "visible" }}>
      <defs>
        <linearGradient id={uid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={`url(#${uid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth={glow ? 1.5 : 1.1}
        strokeLinecap="round" strokeLinejoin="round"
        style={glow ? { filter: `drop-shadow(0 0 4px ${color}88)` } : {}} />
    </svg>
  );
}

// ── Surface card ───────────────────────────────────────────────────────────────
function Card({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      // Mêmes bord, fond et rayon que le conteneur du graphique : les cartes
      // de la colonne de droite avaient un rayon de 12 px pour 30 à gauche, ce
      // qui se voyait dès qu'on les regardait ensemble.
      background: "rgba(9,27,52,0.78)",
      border: "1px solid rgba(205,225,255,0.16)",
      borderRadius: 30,
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
      color: "rgba(255,255,255,0.28)", fontFamily: FONT,
      display: "block", marginBottom: 10,
    }}>
      {children}
    </span>
  );
}

// ── NOVAC Score circle gauge ───────────────────────────────────────────────────
function scoreColor(s: number) { return s >= 60 ? "#4ade80" : s >= 40 ? "#fbbf24" : "#f87171"; }
function scoreLabel(s: number) { return s >= 80 ? "Excellent" : s >= 60 ? "Bon" : s >= 40 ? "Moyen" : "À risque"; }

function CircleScore({ score, size = 88, nu = false }: { score: number; size?: number; nu?: boolean }) {
  const color = scoreColor(score);
  const atteint = Math.max(0, Math.min(100, score));
  // Même traitement que la répartition : couleurs pleines, aucun écart, aucun
  // arrondi, aucun liseré. Le verre — liseré blanc, halo flouté, angles
  // émoussés — a été retiré des deux au même titre.
  //
  // Un anneau et non un disque, en revanche : le score s'y lit comme une jauge
  // remplie, et le centre porte le chiffre partout sauf dans la bande de tête.
  const arcs = donutArcs(
    [
      { key: "atteint", value: atteint, color },
      { key: "reste", value: 100 - atteint, color: "rgba(255,255,255,0.10)" },
    ],
    { cx: size / 2, cy: size / 2, r: size / 2, thickness: Math.max(7, size * 0.15), gap: 0 },
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ display: "block" }}>
          {arcs.map(a => <path key={a.key} d={a.path} fill={a.color} />)}
        </svg>
        {!nu && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", pointerEvents: "none",
          }}>
            <span style={{ fontSize: size * 0.32, fontWeight: 800, fontFamily: FONT, color: "#fff", lineHeight: 1 }}>{score}</span>
            <span style={{ fontSize: Math.max(8, size * 0.10), color: "rgba(255,255,255,0.30)", letterSpacing: "0.04em" }}>/100</span>
          </div>
        )}
      </div>
      {!nu && <span style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: "0.02em" }}>{scoreLabel(score)}</span>}
    </div>
  );
}

// ── Radar chart SVG ────────────────────────────────────────────────────────────
function RadarChart({ metrics, size = 170 }: { metrics: { label: string; value: number }[]; size?: number }) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 26, n = metrics.length;
  const pt = (i: number, v: number) => {
    const a = (i / n) * 2 * Math.PI - Math.PI / 2;
    const d = (v / 100) * r;
    return { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d };
  };
  const axis = (i: number, s = 1) => {
    const a = (i / n) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + Math.cos(a) * r * s, y: cy + Math.sin(a) * r * s };
  };
  const poly = metrics.map((m, i) => { const p = pt(i, m.value); return `${p.x},${p.y}`; }).join(" ");
  return (
    <svg width={size} height={size}>
      {[0.25, 0.5, 0.75, 1].map(s => (
        <polygon key={s} points={metrics.map((_, i) => { const p = axis(i, s); return `${p.x},${p.y}`; }).join(" ")}
          fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
      ))}
      {metrics.map((_, i) => { const p = axis(i); return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />; })}
      <polygon points={poly} fill="rgba(91,141,239,0.15)" stroke="#5B8DEF" strokeWidth={1.5} strokeLinejoin="round" />
      {metrics.map((m, i) => {
        const p = axis(i, 1.22);
        return (
          <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
            fill="rgba(255,255,255,0.40)" fontSize={8.5} fontFamily={FONT}>{m.label}</text>
        );
      })}
    </svg>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
// Les périodes viennent du module partagé : la page et le graphique doivent
// parler des mêmes fenêtres, et les libellés sont ceux de la page graphique.
const PERIODS: Period[] = ["24h", "1S", "1M", "3M", "6M", "1A", "3A", "Max"];

/** Retrait latéral commun à la bande, aux onglets et au contenu. */
const MARGE = 10;
const PERIOD_MAP: Record<Period, string> = {
  "24h": "1d", "1S": "7d", "1M": "1mo", "3M": "3mo",
  "6M": "6mo", "1A": "1y", "3A": "3y", "Max": "max",
};
const PERIOD_LABEL: Record<Period, string> = {
  "24h": "24h", "1S": "1 semaine", "1M": "1 mois", "3M": "3 mois",
  "6M": "6 mois", "1A": "1 an", "3A": "3 ans", "Max": "tout l'historique",
};

function PortfolioPageInner() {
  const { activePortfolio, setActivePortfolio, setMode } = useApp();
  const searchParams = useSearchParams();
  const router       = useRouter();

  const [portfolio,     setPortfolio]     = useState<PortfolioData | null>(null);
  const [prices,        setPrices]        = useState<Record<string, PriceData>>({});
  const [loading,       setLoading]       = useState(true);
  const [view,          setView]          = useState<"carte" | "liste">("carte");
  const [period,        setPeriod]        = useState<Period>("Max")   // Vue d'ensemble en arrivant : une journée ne dit rien d'un portefeuille;
  const [mounted,       setMounted]       = useState(false);
  const [sparkHistory,    setSparkHistory]    = useState<Record<string, number[]>>({});
  const [priceUpdatedAt,  setPriceUpdatedAt]  = useState<Record<string, number>>({});
  const [editingValue,    setEditingValue]    = useState(false);
  const [valueInput,      setValueInput]      = useState("");
  const [editingCost,     setEditingCost]     = useState(false);
  const [costInput,       setCostInput]       = useState("");
  const [spyChange,       setSpyChange]       = useState<number | null>(null);
  const [dashView,        setDashView]        = useState<"resume"|"analyse"|"evenements"|"objectifs"|"transactions">("resume");
  const [activeTooltip,   setActiveTooltip]   = useState<string | null>(null);
  const [showTxModal,     setShowTxModal]     = useState(false);
  const [txRefreshKey,    setTxRefreshKey]    = useState(0);
  const [positions,       setPositions]       = useState<PositionsData | null>(null);
  const [prenom,          setPrenom]          = useState<string | null>(null);
  const [masque,          setMasque]          = useState(false);

  // Lu après montage : le lire pendant le rendu ferait diverger serveur et client.
  useEffect(() => {
    try {
      const brut = localStorage.getItem("novac_user");
      if (!brut) return;
      const u = JSON.parse(brut);
      const nom = (u?.username || u?.email || "").trim();
      if (nom) setPrenom(nom.split(/[\s@]/)[0]);
    } catch { /* stockage refusé ou contenu illisible */ }
  }, []);

  useEffect(() => { const t = setTimeout(() => setMounted(true), 60); return () => clearTimeout(t); }, []);

  useEffect(() => {
    const idFromUrl = searchParams.get("id");
    fetch("http://localhost:8000/api/v1/portfolios", { headers: enTetesAuth() })
      .then(r => r.json())
      .then((list: PortfolioData[]) => {
        if (!Array.isArray(list) || !list.length) { setLoading(false); return; }
        const target = idFromUrl
          ? list.find(p => p.id === idFromUrl)
          : activePortfolio
            ? list.find(p => p.id === String(activePortfolio.id))
            : list[0];
        const p = target ?? list[0];
        setPortfolio(p);
        // Le contexte type l'identifiant en number, l'API le renvoie en UUID.
        // La désactivation ESLint qui était ici visait une règle absente de la
        // configuration, ce qui faisait échouer le lint du fichier au lieu de
        // taire quoi que ce soit.
        setActivePortfolio({ id: p.id as unknown as number, name: p.name, assets: p.assets, color: p.color });
        setMode("portfolio");
      })
      .catch(() => setLoading(false));
  }, [searchParams]); // eslint-disable-line

  // Réagit aux changements de portefeuille depuis le GlobalHeader.
  //
  // Le contexte ne transporte que { id, name, assets, color }. S'en contenter,
  // comme on le faisait, perdait `total_value` et `cost_basis` : changer de
  // portefeuille par le menu affichait « Valeur — » sur chaque carte, « Non
  // défini » en tête, et retirait au graphique son échelle en euros — jusqu'au
  // prochain rechargement complet de la page, seul endroit qui les relisait.
  // On repasse donc par l'API, en gardant l'objet partiel comme affichage
  // provisoire pour que la page ne se vide pas pendant l'aller-retour.
  useEffect(() => {
    if (!activePortfolio) return;
    const id = String(activePortfolio.id);
    setPortfolio(prev => prev?.id === id ? prev : {
      id,
      name:   activePortfolio.name,
      assets: (activePortfolio.assets || []) as PortfolioAsset[],
      color:  activePortfolio.color || "#5B8DEF",
    });

    let cancelled = false;
    fetch("http://localhost:8000/api/v1/portfolios", { headers: enTetesAuth() })
      .then(r => r.json())
      .then((list: PortfolioData[]) => {
        if (cancelled || !Array.isArray(list)) return;
        const complet = list.find(p => String(p.id) === id);
        if (complet) setPortfolio(complet);
      })
      .catch(() => { /* l'objet partiel reste affiché */ });
    return () => { cancelled = true; };
  }, [activePortfolio?.id]); // eslint-disable-line

  // Positions réelles, déduites des transactions.
  //
  // C'est la valorisation juste : quantité détenue × cours du jour, et un prix
  // de revient issu des écritures. Le calcul par les poids qui suit ne vaut
  // qu'à défaut — il suppose une valeur totale saisie à la main et des poids
  // qui n'ont pas dérivé depuis, deux hypothèses fausses dès le premier
  // mouvement de marché.
  //
  // Relancé à chaque écriture ajoutée : `txRefreshKey` est déjà le signal
  // qu'utilise « Activité récente ».
  useEffect(() => {
    const id = portfolio?.id;
    if (!id) { setPositions(null); return; }
    const auth = enTetesAuth();
    if (!auth.Authorization) { setPositions(null); return; }   // hors session : repli sur les poids

    let cancelled = false;
    fetch(`http://localhost:8000/api/v1/portfolios/${id}/positions`, { headers: auth })
      .then(r => (r.ok ? r.json() : null))
      .then((d: PositionsData | null) => { if (!cancelled) setPositions(d); })
      .catch(() => { if (!cancelled) setPositions(null); });
    return () => { cancelled = true; };
  }, [portfolio?.id, txRefreshKey]);

  /** Vrai quand la page valorise sur les écritures plutôt que sur les poids. */
  const surTransactions =
    positions?.source === "transactions" && positions.positions.length > 0;

  /**
   * Rendement du portefeuille sur la période, en TWR.
   *
   * `weightedChange` est la moyenne pondérée des variations d'actifs : sur la
   * fenêtre Max, il rend la performance des fonds depuis leur création, et non
   * celle de l'épargnant. Un PEA ouvert en février affichait ainsi « +417 %
   * sur tout l'historique » à côté d'un « Total +175 € » exact.
   */
  const [twr, setTwr] = useState<number | null>(null);
  /** Rendement du S&P 500 sur exactement la même fenêtre. */
  const [repere, setRepere] = useState<number | null>(null);
  /** Ce que l'argent versé a rapporté sur la période : gain en euros et en %. */
  const [gain, setGain] = useState<{ eur: number; pct: number | null } | null>(null);
  /** Les mêmes versements rejoués sur le S&P 500, aux mêmes dates. */
  const [simRepere, setSimRepere] = useState<{ value: number; gain_eur: number; gain_pct: number } | null>(null);
  /** Date de la première transaction — l'origine du portefeuille. */
  const [origine, setOrigine] = useState<string | null>(null);

  useEffect(() => {
    const id = portfolio?.id;
    if (!id || !surTransactions) { setTwr(null); return; }
    let annule = false;
    fetch(`http://localhost:8000/api/v1/portfolios/${id}/history?period=${PERIOD_MAP[period]}`,
          { headers: enTetesAuth() })
      .then(r => (r.ok ? r.json() : null))
      .then((d: {
        twr_pct?: number | null; benchmark_pct?: number | null; start?: string | null;
        gain_eur?: number | null; gain_pct?: number | null;
        benchmark_sim?: { value: number | null; gain_eur: number | null; gain_pct: number | null };
      } | null) => {
        if (annule) return;
        setTwr(typeof d?.twr_pct === "number" ? d.twr_pct : null);
        setRepere(typeof d?.benchmark_pct === "number" ? d.benchmark_pct : null);
        setOrigine(d?.start ?? null);
        setGain(typeof d?.gain_eur === "number"
          ? { eur: d.gain_eur, pct: typeof d.gain_pct === "number" ? d.gain_pct : null }
          : null);
        const sim = d?.benchmark_sim;
        setSimRepere(sim && typeof sim.value === "number" && typeof sim.gain_eur === "number"
          && typeof sim.gain_pct === "number"
          ? { value: sim.value, gain_eur: sim.gain_eur, gain_pct: sim.gain_pct }
          : null);
      })
      .catch(() => { if (!annule) { setTwr(null); setRepere(null); setGain(null); setSimRepere(null); } });
    return () => { annule = true; };
  }, [portfolio?.id, surTransactions, period, txRefreshKey]);

  const valeurTotale  = surTransactions ? positions!.total_value    : (portfolio?.total_value ?? null);
  const prixDeRevient = surTransactions ? positions!.total_invested : (portfolio?.cost_basis  ?? null);

  const isFirstLoad = useRef(true);

  // Union allocation ∪ positions : un actif détenu hors allocation cible doit
  // avoir un cours, sans quoi il s'affiche sans prix ni variation.
  const tickersSuivis = useMemo(() => {
    const set = new Set<string>((portfolio?.assets ?? []).map(a => a.ticker));
    if (surTransactions) positions!.positions.forEach(p => set.add(p.ticker));
    return Array.from(set);
  }, [portfolio, surTransactions, positions]);

  useEffect(() => {
    if (!tickersSuivis.length) return;
    const tickers = tickersSuivis.join(",");
    if (isFirstLoad.current) {
      setLoading(true);
      setSparkHistory({});
    }

    const fetchPrices = (isInit = false) =>
      fetch(`http://localhost:8000/api/v1/prices?tickers=${encodeURIComponent(tickers)}&period=${PERIOD_MAP[period]}`)
        .then(r => r.json())
        .then((list: PriceData[]) => {
          const map: Record<string, PriceData> = {};
          list.forEach(p => { if (p.symbol) map[p.symbol] = p; });
          // Mis à jour à chaque tour, pas seulement au premier. La condition
          // `isInit` gelait prix et variation au chargement pendant que la
          // sparkline, elle, continuait d'avancer : la courbe montait à côté
          // d'un montant qui ne bougeait plus.
          setPrices(map);

          const newUpdatedAt: Record<string, number> = {};
          setSparkHistory(prev => {
            const next = { ...prev };
            list.forEach(p => {
              if (p.price == null) return;
              // La série du backend fait foi ; entre deux tours on lui ajoute
              // le prix courant, qui bouge plus vite que le pas de 15 minutes.
              if (!next[p.symbol] || isInit) {
                next[p.symbol] = p.series?.length ? p.series : [p.price];
                newUpdatedAt[p.symbol] = Date.now();
              } else {
                const lastPrice = next[p.symbol][next[p.symbol].length - 1];
                if (Math.abs(p.price - lastPrice) > 0.0001) {
                  next[p.symbol] = [...next[p.symbol], p.price].slice(-60);
                  newUpdatedAt[p.symbol] = Date.now(); // prix réellement changé
                }
              }
            });
            return next;
          });
          if (Object.keys(newUpdatedAt).length)
            setPriceUpdatedAt(prev => ({ ...prev, ...newUpdatedAt }));
        })
        .catch(() => {});

    fetchPrices(true).finally(() => { setLoading(false); isFirstLoad.current = false; });

    const interval = setInterval(() => fetchPrices(false), 15000);
    return () => clearInterval(interval);
  }, [tickersSuivis, period]);

  // Benchmark SPY — fetch séparé, silencieux en cas d'échec
  useEffect(() => {
    fetch(`http://localhost:8000/api/v1/prices?tickers=SPY&period=${PERIOD_MAP[period]}`)
      .then(r => r.json())
      .then((list: PriceData[]) => {
        const spy = list.find(p => p.symbol === "SPY");
        setSpyChange(spy?.change ?? null);
      })
      .catch(() => setSpyChange(null));
  }, [period]);

  const enriched: Enriched[] = useMemo(() => {
    if (!portfolio) return [];

    // Sur transactions, la liste des lignes vient des positions, pas de
    // l'allocation cible : un actif entièrement vendu n'est plus détenu, et un
    // actif acheté hors allocation l'est bel et bien. Partir des poids
    // afficherait le portefeuille voulu au lieu du portefeuille réel.
    if (surTransactions) {
      const base = valoriser(positions!.positions, prices);
      return base.map((a, i) => ({
        ...a,
        quantity: positions!.positions[i].quantity,
        avgCost:  positions!.positions[i].avg_cost,
        invested: positions!.positions[i].invested,
        pnlEur:   positions!.positions[i].pnl_eur,
      }));
    }

    return portfolio.assets.map(a => {
      const price  = prices[a.ticker]?.price  ?? null;
      const change = prices[a.ticker]?.change ?? null;
      const tv     = portfolio.total_value ?? null;
      const value  = tv != null ? (a.weight / 100) * tv : null;
      // Gain sur la période, à partir de la valeur d'*aujourd'hui*.
      //
      // `valeur × variation` était faux : il suppose que la valeur actuelle
      // était déjà celle du début de période. Le bon calcul est
      // V − V/(1+r), c'est-à-dire ce que la ligne vaut aujourd'hui moins ce
      // qu'elle valait alors. L'écart passait inaperçu sur 24 h ; sur la
      // fenêtre Max il annonçait des millions d'euros de plus-value sur un
      // portefeuille de cinq mille.
      const perfEur = value != null && change != null && change > -100
        ? value - value / (1 + change / 100)
        : null;
      return { ...a, price, change, value, perfEur };
    });
  }, [portfolio, prices, surTransactions, positions]);

  const totalWeight    = enriched.reduce((s, a) => s + a.weight, 0);
  const weightedChange = enriched.reduce((s, a) => {
    if (a.change === null) return s;
    return s + (a.weight / totalWeight) * a.change;
  }, 0);
  /**
   * Le rendement à afficher : celui du portefeuille quand on le connaît, la
   * moyenne pondérée des actifs à défaut.
   */
  const perfPeriode = surTransactions ? twr : weightedChange;
  const isUp       = (perfPeriode ?? 0) >= 0;
  const perfColor  = isUp ? "#4ade80" : "#f87171";

  /**
   * Repère de comparaison, mesuré sur la même fenêtre que le portefeuille.
   *
   * Il était relevé à part, sur la période nominale : « Max » donnait au S&P
   * 500 ses trente ans d'historique face à six mois de détention, d'où un
   * « vs S&P 500 −2 500 % » qui ne comparait rien.
   */
  const reperePeriode = surTransactions ? repere : spyChange;

  /**
   * Gain de l'épargnant sur la période — ce qu'il a réellement encaissé.
   *
   * Hors transactions, on n'a que la variation moyenne des actifs ; on en
   * déduit le gain comme avant, en retranchant la valeur de début de période.
   */
  const gainAffiche: { eur: number; pct: number | null } | null =
    surTransactions
      ? gain
      : (valeurTotale != null && weightedChange != null
          ? {
              eur: weightedChange > -100
                ? valeurTotale - valeurTotale / (1 + weightedChange / 100)
                : valeurTotale,
              pct: weightedChange,
            }
          : null);

  /**
   * Libellé de la période.
   *
   * « Sur tout l'historique » laissait entendre une profondeur que le
   * portefeuille n'a pas : sur Max, la fenêtre commence à la première
   * transaction. Autant la nommer.
   */
  const libellePeriode = period === "24h"
    ? "Aujourd'hui"
    : period === "Max" && origine
      ? `Depuis le ${new Date(origine).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`
      : `Sur ${PERIOD_LABEL[period]}`;

  const topPerformers    = [...enriched].filter(a => a.change !== null)
    .sort((a, b) => (b.change ?? 0) - (a.change ?? 0)).slice(0, 5);
  const bottomPerformers = [...enriched].filter(a => a.change !== null)
    .sort((a, b) => (a.change ?? 0) - (b.change ?? 0)).slice(0, 5);

  const exposition = useMemo(() => classifyExposition(enriched), [enriched]);
  const top3Conc   = [...enriched].sort((a, b) => b.weight - a.weight)
    .slice(0, 3).reduce((s, a) => s + a.weight, 0);
  const gainCount  = enriched.filter(a => (a.change ?? 0) > 0).length;
  const lossCount  = enriched.filter(a => (a.change ?? 0) < 0).length;

  // NOVAC Score
  const novacScore = useMemo(() => {
    const n = enriched.length;
    if (!n) return null;
    const hhi  = enriched.reduce((s, a) => s + Math.pow(a.weight / 100, 2), 0);
    const minH = 1 / n;
    const diversification = n === 1 ? 0 : Math.round(Math.min(100, ((1 - hhi) / (1 - minH)) * 100));
    const risque    = Math.round(Math.max(0, Math.min(100, 100 - top3Conc)));
    const momentum  = Math.round(Math.max(0, Math.min(100, 50 + weightedChange * 5)));
    const qualite   = Math.round((enriched.filter(a => (a.change ?? 0) > 0).length / n) * 100);
    const global    = Math.round(diversification * 0.30 + risque * 0.30 + momentum * 0.20 + qualite * 0.20);
    return { global, diversification, risque, momentum, qualite };
  }, [enriched, top3Conc, weightedChange]);

  // Repli le temps que la série arrive : un segment plat entre les deux seules
  // valeurs connues, plutôt qu'une courbe inventée qui aurait l'air d'un cours.
  const assetSparks = useMemo(() => {
    const map: Record<string, number[]> = {};
    enriched.forEach(a => {
      if (a.price == null) return;
      const start = a.change != null ? a.price / (1 + a.change / 100) : a.price;
      map[a.ticker] = [start, a.price];
    });
    return map;
  }, [enriched]);

  const saveTotalValue = async () => {
    if (!portfolio) return;
    const v = parseFloat(valueInput.replace(/\s/g, "").replace(",", "."));
    if (isNaN(v) || v <= 0) { setEditingValue(false); return; }
    await fetch(`http://localhost:8000/api/v1/portfolios/${portfolio.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json", ...enTetesAuth() },
      body: JSON.stringify({ total_value: v }),
    }).catch(() => {});
    setPortfolio(p => p ? { ...p, total_value: v } : p);
    setEditingValue(false);
  };

  const saveCostBasis = async () => {
    if (!portfolio) return;
    const v = parseFloat(costInput.replace(/\s/g, "").replace(",", "."));
    if (isNaN(v) || v <= 0) { setEditingCost(false); return; }
    await fetch(`http://localhost:8000/api/v1/portfolios/${portfolio.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json", ...enTetesAuth() },
      body: JSON.stringify({ cost_basis: v }),
    }).catch(() => {});
    setPortfolio(p => p ? { ...p, cost_basis: v } : p);
    setEditingCost(false);
  };

  const anim = (delay: number): React.CSSProperties => ({
    opacity:    mounted ? 1 : 0,
    transform:  mounted ? "translateY(0)" : "translateY(8px)",
    transition: `opacity 440ms ease ${delay}ms, transform 440ms ease ${delay}ms`,
  });

  if (!portfolio && !loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", background: "var(--novac-bg, #040F22)", color: "rgba(255,255,255,0.5)",
        fontSize: 14, flexDirection: "column", gap: 16 }}>
        <div>Aucun portefeuille sélectionné.</div>
        <button onClick={() => router.push("/build")}
          style={{ padding: "8px 20px", borderRadius: 8,
            border: "1px solid rgba(91,141,239,0.4)",
            background: "rgba(91,141,239,0.1)", color: "#9BB9FF",
            cursor: "pointer", fontSize: 12 }}>
          Créer un portefeuille
        </button>
      </div>
    );
  }

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      background: "var(--novac-bg, #040F22)", color: "var(--novac-text-primary, #F8F9FC)",
      fontFamily: FONT, boxSizing: "border-box",
      paddingTop: 62, overflow: "hidden",
    }}>

      {/* ── Bande de tête ─────────────────────────────────────────────────
          Les trois chiffres que la maquette met en avant. Ceux qu'elle
          montrait en plus — rendement TWR, cash disponible — n'ont aucune
          source : ni calcul au backend, ni champ au modèle. Les afficher
          à vide aurait donné trois cases vides plutôt qu'un tableau de bord.

          Le retrait latéral vaut MARGE, comme les onglets et le contenu :
          remontée au niveau de la page, la bande avait perdu le retrait de la
          vue Résumé et touchait les deux bords. */}
      <div style={{ padding: `0 ${MARGE}px`, flexShrink: 0 }}>
      <Card style={{ padding: "13px 18px", flexShrink: 0, display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
        {/* Identité du portefeuille. La maquette met ici une illustration
            décorative ; elle ne dit rien qu'on ne sache déjà. Ces pixels
            répondent plutôt à une question que la mise en page a fait
            disparaître : depuis que la pastille est partie à droite du
            bandeau, la bande n'indiquait plus de quel portefeuille il s'agit.
            Les logos empilés montrent en plus ce qu'il contient. */}
        {portfolio && (
          <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              {enriched.slice(0, 4).map((a, i) => (
                <div key={a.ticker} title={a.ticker} style={{
                  width: 30, height: 30, borderRadius: "50%", overflow: "hidden",
                  // Chevauchement vers la gauche, le premier logo devant : sans
                  // l'ordre inverse, chaque logo masquait le précédent.
                  marginLeft: i ? -10 : 0, zIndex: 4 - i,
                  border: "2px solid var(--novac-bg, #040F22)",
                  background: "rgba(255,255,255,0.06)", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <AssetLogo ticker={a.ticker} type={a.type || "EQUITY"} size={26} radius={13}
                    fallbackBg="rgba(255,255,255,0.10)" fallbackBorder="transparent"
                    fallbackTextColor="#fff" bare />
                </div>
              ))}
              {enriched.length > 4 && (
                <div style={{
                  width: 30, height: 30, borderRadius: "50%", marginLeft: -10, zIndex: 0,
                  border: "2px solid var(--novac-bg, #040F22)", background: "rgba(255,255,255,0.10)",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.70)", fontFamily: FONT,
                }}>
                  +{enriched.length - 4}
                </div>
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: portfolio.color || "#5B8DEF", flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {portfolio.name}
                </span>
              </div>
              <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)" }}>
                {enriched.length} actif{enriched.length > 1 ? "s" : ""}
              </span>
            </div>
          </div>
        )}
        <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.07)" }} />
        <div style={{ minWidth: 200 }}>
    {/* VALEUR TOTALE + édition inline */}
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <p style={{ margin: 0, fontSize: 11.5, fontWeight: 500, color: "rgba(255,255,255,0.55)" }}>Valeur totale</p>
        <button onClick={() => setMasque(v => !v)} title={masque ? "Afficher les montants" : "Masquer les montants"}
          aria-label={masque ? "Afficher les montants" : "Masquer les montants"}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", color: "rgba(255,255,255,0.32)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            {masque
              ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22"/><path d="M9.9 9.9a3 3 0 1 0 4.2 4.2"/></>
              : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}
          </svg>
        </button>
      </span>
    </div>
    {editingValue ? (
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
        <input autoFocus value={valueInput} onChange={e => setValueInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") saveTotalValue(); if (e.key === "Escape") setEditingValue(false); }}
          onBlur={saveTotalValue} placeholder="Ex: 10000" type="number"
          style={{ width: 100, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(91,141,239,0.40)", borderRadius: 6, padding: "3px 8px", color: "#fff", fontSize: 11, outline: "none", fontFamily: FONT }} />
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>€</span>
      </div>
    ) : (
      <div style={{ fontSize: 32, fontWeight: 600, fontFamily: FONT, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1, marginBottom: 5 }}>
        {masque
          ? "•••• €"
          : valeurTotale != null
            ? valeurTotale.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €"
            : <span style={{ fontSize: 13, color: "rgba(255,255,255,0.25)" }}>Non défini</span>}
      </div>
    )}
    {/* Perf sur la période choisie. Le libellé la suit : il disait
        « Aujourd'hui » quelle que soit la période, et annonçait donc
        un gain d'un an comme s'il datait du matin. */}
    {/* Ce que l'argent a rapporté, et non ce que les fonds ont fait.
        C'est la question qu'on se pose devant son relevé : « j'ai versé
        4 960 €, j'ai 5 134 €, donc j'ai gagné 175 € ». La performance des
        fonds, plus élevée quand les versements sont récents, figure à côté
        sous son propre nom. */}
    {gainAffiche != null && (
      <div style={{ fontSize: 11, fontFamily: FONT, color: gainAffiche.eur >= 0 ? "#4ade80" : "#f87171", fontWeight: 600 }}>
        {libellePeriode}&nbsp;
        <span>
          {gainAffiche.eur >= 0 ? "+" : ""}
          {Math.round(gainAffiche.eur).toLocaleString("fr-FR")} €
        </span>
        {gainAffiche.pct != null && (
          <span style={{ opacity: 0.55, marginLeft: 4 }}>({fmtChange(gainAffiche.pct)})</span>
        )}
      </div>
    )}
        </div>
        <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.07)" }} />
        <div style={{ minWidth: 150 }}>
          <p style={{ margin: "0 0 4px", fontSize: 11.5, fontWeight: 500, color: "rgba(255,255,255,0.55)" }}>Gains / pertes</p>
    {/* P&L total depuis achat */}
    {valeurTotale != null && (() => {
      const cb = prixDeRevient;
      if (cb == null) {
        return (
          <div style={{ marginTop: 3 }}>
            {editingCost ? (
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <input autoFocus value={costInput} onChange={e => setCostInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveCostBasis(); if (e.key === "Escape") setEditingCost(false); }}
                  onBlur={saveCostBasis} placeholder="Prix de revient" type="number"
                  style={{ width: 110, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(91,141,239,0.40)", borderRadius: 6, padding: "3px 8px", color: "#fff", fontSize: 10, outline: "none", fontFamily: FONT }} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>€</span>
              </div>
            ) : (
              <button onClick={() => { setCostInput(""); setEditingCost(true); }}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "rgba(255,255,255,0.22)", padding: 0, textDecoration: "underline dotted", fontFamily: FONT, transition: "color 150ms" }}
                onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.50)")}
                onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.22)")}>
                + Définir prix de revient
              </button>
            )}
          </div>
        );
      }
      const plEur = valeurTotale - cb;
      const plPct = (plEur / cb) * 100;
      const plCol = plEur >= 0 ? "#4ade80" : "#f87171";
      return (
        <div style={{ marginTop: 3, fontSize: 11, fontFamily: FONT, color: plCol, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          Total
          <span>{plEur >= 0 ? "+" : ""}{Math.round(plEur).toLocaleString("fr-FR")} €</span>
          <span style={{ opacity: 0.55 }}>({plPct >= 0 ? "+" : ""}{plPct.toFixed(1)}%)</span>
          {/* Le crayon disparaît dès que le prix de revient vient des
              écritures : la valeur saisie serait enregistrée puis ignorée,
              le calcul repartant des transactions au rafraîchissement. */}
          {!surTransactions && (
            <button onClick={() => { setCostInput(cb.toString()); setEditingCost(true); }}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 9, color: "rgba(255,255,255,0.22)", padding: 0, transition: "color 150ms" }}
              onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.50)")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.22)")}>✏</button>
          )}
          {editingCost && !surTransactions && (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <input autoFocus value={costInput} onChange={e => setCostInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveCostBasis(); if (e.key === "Escape") setEditingCost(false); }}
                onBlur={saveCostBasis} type="number"
                style={{ width: 90, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(91,141,239,0.40)", borderRadius: 6, padding: "2px 7px", color: "#fff", fontSize: 10, outline: "none", fontFamily: FONT }} />
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>€</span>
            </div>
          )}
        </div>
      );
    })()}
        </div>
        <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.07)" }} />
        <div style={{ minWidth: 120 }}>
          <p style={{ margin: "0 0 4px", fontSize: 11.5, fontWeight: 500, color: "rgba(255,255,255,0.55)" }}>Comparaison</p>
    {/* Performance des fonds — distincte du gain de l'épargnant.
        C'est elle qu'on oppose à l'indice : comparer un versement progressif
        à un indice supposé investi d'un coup pénaliserait le premier sans
        que ses choix d'actifs y soient pour rien. */}
    {surTransactions && perfPeriode != null && (
      <div style={{ position: "relative", marginTop: 3 }}
        onMouseEnter={() => setActiveTooltip("fonds")}
        onMouseLeave={() => setActiveTooltip(null)}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.40)", fontFamily: FONT, cursor: "default" }}>
          Fonds&nbsp;
          <span style={{ color: perfPeriode >= 0 ? "#4ade80" : "#f87171", fontWeight: 700 }}>
            {fmtChange(perfPeriode)}
          </span>
        </div>
        {activeTooltip === "fonds" && (
          <div style={{
            position: "absolute", bottom: "calc(100% + 6px)", left: 0, zIndex: 50, width: 230,
            background: "rgba(4,17,36,0.97)", border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 8, padding: "8px 10px", boxShadow: "0 8px 24px rgba(0,0,0,0.50)",
            pointerEvents: "none",
          }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.62)", lineHeight: 1.55 }}>
              Ce que vos fonds ont fait sur la période, indépendamment de la date
              de vos versements. Votre gain est plus faible si vous avez investi
              récemment : cet argent n&apos;a pas encore travaillé.
            </span>
          </div>
        )}
      </div>
    )}
    {/* Le repère, rejoué avec les mêmes versements aux mêmes dates.
        Opposer deux pourcentages laissait ouvert ce que l'épargnant aurait
        réellement eu ; en euros, la question ne se pose plus. */}
    {simRepere != null && gain != null ? (() => {
      const ecart = gain.eur - simRepere.gain_eur;
      const col   = ecart >= 0 ? "#4ade80" : "#f87171";
      return (
        <div style={{ position: "relative", marginTop: 3 }}
          onMouseEnter={() => setActiveTooltip("spy")}
          onMouseLeave={() => setActiveTooltip(null)}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.40)", fontFamily: FONT, cursor: "default" }}>
            vs S&amp;P 500&nbsp;
            <span style={{ color: col, fontWeight: 700 }}>
              {ecart >= 0 ? "+" : ""}{Math.round(ecart).toLocaleString("fr-FR")} €
            </span>
          </div>
          {activeTooltip === "spy" && (
            <div style={{
              position: "absolute", bottom: "calc(100% + 6px)", left: 0, zIndex: 50, width: 252,
              background: "rgba(4,17,36,0.97)", border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 8, padding: "9px 11px", boxShadow: "0 8px 24px rgba(0,0,0,0.50)",
              pointerEvents: "none",
            }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.62)", lineHeight: 1.6 }}>
                Vos versements, aux mêmes dates, placés sur le S&amp;P 500 vaudraient{" "}
                <b style={{ color: "rgba(255,255,255,0.85)" }}>
                  {Math.round(simRepere.value).toLocaleString("fr-FR")} €
                </b>{" "}
                — soit {simRepere.gain_eur >= 0 ? "+" : ""}
                {Math.round(simRepere.gain_eur).toLocaleString("fr-FR")} € de gain.
                Vous {ecart >= 0 ? "faites mieux" : "faites moins bien"} de{" "}
                {Math.abs(Math.round(ecart)).toLocaleString("fr-FR")} €.
              </span>
            </div>
          )}
        </div>
      );
    })() : reperePeriode != null && perfPeriode != null && (() => {
      // Sans transactions, on ne peut pas rejouer de versements : on retombe
      // sur l'écart de pourcentages.
      const diff    = perfPeriode - reperePeriode;
      const diffCol = diff >= 0 ? "#4ade80" : "#f87171";
      return (
        <div style={{ marginTop: 3, fontSize: 10, color: "rgba(255,255,255,0.40)", fontFamily: FONT }}>
          vs S&amp;P 500&nbsp;
          <span style={{ color: diffCol, fontWeight: 700 }}>{diff >= 0 ? "+" : ""}{diff.toFixed(2)}%</span>
        </div>
      );
    })()}
        </div>
        {novacScore && <>
          <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.07)" }} />
          {/* Santé du portefeuille : le titre chiffré passe en tête, la carte
              de droite ne garde que le détail par critère. */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 170 }}>
            <CircleScore score={novacScore.global} size={54} nu />
            <div>
              <p style={{ margin: "0 0 3px", fontSize: 11.5, fontWeight: 500, color: "rgba(255,255,255,0.55)" }}>Santé du portefeuille</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                <span style={{ fontSize: 20, fontWeight: 800, fontFamily: FONT, color: "#fff", lineHeight: 1 }}>{novacScore.global}</span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.32)" }}>/100</span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: scoreColor(novacScore.global) }}>
                {scoreLabel(novacScore.global)}
              </span>
            </div>
          </div>
        </>}
      </Card>
      </div>

      {/* Navigation des sections, sous la bande de valeur : on lit d'abord
          combien on a, puis on choisit ce qu'on veut en voir.
          Au niveau de la page et non dans la vue Résumé — laissée dedans,
          elle disparaissait dès qu'on changeait d'onglet, donc sans retour. */}
      <div style={{ padding: `8px ${MARGE}px 0`, flexShrink: 0, ...anim(40) }}>
        <PortfolioTabs active={dashView} onChange={setDashView} />
      </div>

      {/* ── MAIN ────────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", position: "relative" }}>

      {/* ══ VUE RÉSUMÉ ══════════════════════════════════════════════════════════ */}
      <div style={{ display: dashView === "resume" ? "flex" : "none", flexDirection: "column", height: "100%", gap: 8, padding: `8px ${MARGE}px 0`, overflowY: "auto", overflowX: "hidden" }}>

        <div style={{ display: "flex", flex: 1, minHeight: 0, gap: 0, alignItems: "stretch" }}>

        {/* Treemap / Liste */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 8, ...anim(80) }}>
          {/* Performance du portefeuille — l'élément central de la maquette, et
              le seul qui manquait entièrement. La période est celle de la page :
              un unique sélecteur commande la courbe, les tuiles et les chiffres,
              plutôt que deux réglages qui se contredisent. */}
          {/* Conteneur repris à l'identique de la page graphique : même rayon de
              30 px, même bord, même fond, même rembourrage, et la même couche
              de halo interne. Un `Card` générique donnait un cadre visiblement
              différent pour le même objet. */}
          <div className="chart-glass-container" data-glass-edge="" style={{
            border: "1px solid rgba(205,225,255,0.16)", borderRadius: 30, padding: "14px 18px 10px",
            flex: 1, minHeight: 150, display: "flex", flexDirection: "column",
            position: "relative", overflow: "hidden", background: "rgba(9,27,52,0.78)",
          }}>
            <div style={{
              position: "absolute", inset: -28, pointerEvents: "none", zIndex: 0,
              filter: "blur(20px)", opacity: 0.78,
              background: "radial-gradient(ellipse 90% 72% at -10% -10%, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.014) 42%, rgba(255,255,255,0) 82%), radial-gradient(ellipse 86% 75% at 110% 112%, rgba(60,113,184,0.045) 0%, rgba(60,113,184,0.018) 44%, rgba(60,113,184,0) 84%)",
            }} />
            <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            <PerformanceChart
              assets={enriched.map(a => ({ ticker: a.ticker, weight: a.weight }))}
              totalValue={valeurTotale}
              period={period}
              onPeriodChange={setPeriod}
              color={portfolio?.color || "#5B8DEF"}
              portfolioId={portfolio?.id}
              surTransactions={surTransactions}
            />
            </div>
          </div>

          {/* Le titre, les filtres et le tri tenaient sur deux lignes, avec
              une infobulle de légende et un bouton d'ajout que le concept n'a
              pas. Tout est descendu dans la grille, sur une seule ligne. */}
          {loading ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.20)", fontSize: 12 }}>
              Chargement…
            </div>
          ) : (<>
            {/* Grille à cartes égales. La treemap pondérée codait le poids
                par la surface : les petites lignes en devenaient illisibles,
                et deux rectangles de proportions différentes se comparent mal.
                Le poids se lit maintenant en chiffres sur chaque carte. */}
            <div style={{ flexShrink: 0 }}>
              <AssetGrid
                assets={enriched.map(a => ({
                  ticker: a.ticker, weight: a.weight,
                  change: a.change, type: a.type, price: a.price,
                  spark:     sparkHistory[a.ticker] ?? assetSparks[a.ticker],
                  updatedAt: priceUpdatedAt[a.ticker],
                  value:     a.value,
                  perfEur:   a.perfEur,
                  pnlEur:    a.pnlEur,
                  pnlPct:    a.invested && a.pnlEur != null ? (a.pnlEur / a.invested) * 100 : null,
                  avgCost:   a.avgCost,
                  quantity:  a.quantity,
                }))}
                onAssetClick={ticker => router.push(`/chart?ticker=${encodeURIComponent(ticker)}`)}
                view={view}
              />
            </div>
            {/* Liste — toujours monté */}
            <div style={{ overflowY: "auto", flex: 1, borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)", display: view === "liste" ? "block" : "none" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 100px 70px" }}>
                {/* La dernière colonne suit la période, comme les libellés de
                    la bande de tête : figée sur « 24h », elle annonçait une
                    variation d'un an comme celle de la journée. */}
                {["Actif", "Poids", "Prix", PERIOD_LABEL[period]].map(h => (
                  <div key={h} style={{ padding: "8px 14px", fontSize: 9, fontWeight: 700,
                    color: "rgba(255,255,255,0.28)", letterSpacing: "0.10em",
                    borderBottom: "1px solid rgba(255,255,255,0.05)" }}>{h}</div>
                ))}
                {[...enriched].sort((a, b) => b.weight - a.weight).flatMap(a => [
                  <div key={`${a.ticker}-n`} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <AssetLogo ticker={a.ticker} type="EQUITY" size={22} radius={5}
                      fallbackBg="rgba(255,255,255,0.08)" fallbackBorder="rgba(255,255,255,0.14)" fallbackTextColor="#fff"
                      bare/>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{a.ticker.replace(/-USD$/, "")}</span>
                  </div>,
                  <div key={`${a.ticker}-w`} style={{ padding: "9px 14px", fontSize: 11, color: "rgba(255,255,255,0.55)", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center" }}>{a.weight.toFixed(1)}%</div>,
                  <div key={`${a.ticker}-p`} style={{ padding: "9px 14px", fontSize: 11, color: "rgba(255,255,255,0.55)", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", fontFamily: FONT }}>
                    {a.price !== null ? `${a.price.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : "—"}
                  </div>,
                  <div key={`${a.ticker}-c`} style={{ padding: "9px 14px", fontSize: 11, fontWeight: 700, borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", fontFamily: FONT, color: a.change === null ? "rgba(255,255,255,0.25)" : a.change >= 0 ? "#4ade80" : "#f87171" }}>
                    {fmtChange(a.change)}
                  </div>,
                ])}
              </div>
            </div>
          </>)}

          {/* La bande « À surveiller » vivait ici — mouvements notables,
              repères de marché, sentiment. Retirée : le concept arrête la
              colonne sur « Voir tous les actifs ». Les cartes « Risque » et
              « Bilan journalier » l'avaient précédée au même endroit. */}
        </div>

        {/* ── Right sidebar ─────────────────────────────────────────────────── */}
        <div style={{
          width: 296, flexShrink: 0,
          display: "flex", flexDirection: "column", gap: 8,
          paddingLeft: 10, overflow: "hidden",
          ...anim(160),
        }}>

          {/* Santé du portefeuille. La valeur totale est remontée dans la
              bande de tête : elle y est le premier chiffre qu'on cherche, et
              son départ rend une centaine de pixels à cette colonne. */}
          <Card style={{ padding: "14px 16px", flexShrink: 0 }}>
            {novacScore && (() => {
              const subScores = [
                { key: "diversification", label: "Diversification", value: novacScore.diversification,
                  tip: (v: number) => v >= 75 ? "Vos actifs couvrent plusieurs secteurs. Aucune position ne domine excessivement." : v >= 40 ? "Bonne base, mais certaines positions restent dominantes." : "Concentration élevée. Un choc sectoriel peut fortement impacter le portefeuille." },
                { key: "risque", label: "Risque", value: novacScore.risque,
                  tip: (v: number) => v >= 60 ? "La concentration top 3 reste raisonnable. Le risque de perte simultanée est limité." : v >= 40 ? "Vos 3 premiers actifs représentent une part significative. À surveiller." : "Fort risque de concentration. Un seul événement peut impacter lourdement le portefeuille." },
                { key: "momentum", label: "Momentum", value: novacScore.momentum,
                  tip: (v: number) => v >= 55 ? "Tendance positive sur la période. Bon contexte de maintien ou d'entrée." : v >= 40 ? "Momentum neutre. Le portefeuille évolue sans direction claire." : "Tendance baissière sur la période. Moment de réévaluation potentiel." },
                { key: "qualite", label: "Qualité", value: novacScore.qualite,
                  tip: (v: number) => v >= 70 ? "La majorité des actifs performent positivement. Le portefeuille est en bonne santé." : v >= 40 ? "Une partie des actifs sous-performe. Surveiller les positions négatives." : "Plus de la moitié des actifs sont en perte. Le portefeuille mérite une révision." },
              ];
              return (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>
                    <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,0.88)" }}>Détail du score</p>
                    <span title="Quatre critères pondérés : diversification, concentration, tendance et part d'actifs en hausse."
                      style={{ display: "flex", color: "rgba(255,255,255,0.28)", cursor: "help" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
                      </svg>
                    </span>
                  </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                        {subScores.map(m => {
                          const col = scoreColor(m.value);
                          return (
                            <div key={m.key} style={{ position: "relative", borderRadius: 6, padding: "2px 4px", transition: "background 150ms" }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; setActiveTooltip(m.key); }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; setActiveTooltip(null); }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, cursor: "default" }}>
                                <span style={{ fontSize: 10, color: activeTooltip === m.key ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.42)", transition: "color 120ms" }}>{m.label}</span>
                                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: FONT, color: col }}>{m.value}</span>
                              </div>
                              <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.07)" }}>
                                <div style={{ height: "100%", borderRadius: 3, background: col, width: `${m.value}%`, opacity: 0.85, transition: "width 800ms ease" }} />
                              </div>
                              {activeTooltip === m.key && (
                                <div style={{
                                  position: "absolute", bottom: "calc(100% + 8px)", right: 0, left: 0, zIndex: 50,
                                  background: "rgba(4,17,36,0.97)", border: "1px solid rgba(255,255,255,0.10)",
                                  borderRadius: 8, padding: "8px 10px", boxShadow: "0 8px 24px rgba(0,0,0,0.50)",
                                  pointerEvents: "none",
                                }}>
                                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.62)", lineHeight: 1.5 }}>{m.tip(m.value)}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                  </div>
                  <button type="button" onClick={() => setDashView("analyse")}
                    style={{
                      display: "flex", alignItems: "center", gap: 5, marginTop: 10,
                      background: "none", border: "none", cursor: "pointer", padding: 0,
                      fontFamily: FONT, fontSize: 11, fontWeight: 500, color: "rgba(129,168,255,0.85)",
                    }}>
                    Voir le détail du score
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </button>
                </>
              );
            })()}
          </Card>

          {/* « Mouvements » vivait ici : les trois plus fortes hausses et
              baisses en contribution. Retiré — chaque carte d'actif affiche
              déjà sa variation et sa contribution en euros, et le tri par
              performance de la grille refait le classement à la demande. Sa
              place revient à l'allocation, dont la légende était rognée. */}
          {/* Allocation. Remplace l'exposition sectorielle, qui rangeait
              tout un portefeuille d'actions dans une barre unique à 100 %. */}
          <Card style={{ padding: "13px 15px", flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <AllocationDonut
              assets={enriched.map(a => ({
                ticker: a.ticker, weight: a.weight, price: a.price,
                change: a.change, value: a.value, perfEur: a.perfEur,
              }))}
              totalValue={valeurTotale}
              onSeeAll={() => setDashView("analyse")}
            />
          </Card>
          {/* Activité récente. Le « Voir toute l'activité → » de la maquette
              n'avait aucune destination ; il mène à l'onglet Transactions,
              qui porte déjà le tableau complet. */}
          <Card style={{ padding: "13px 15px", flex: 1, minHeight: 128, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <RecentActivity
              portfolioId={portfolio?.id}
              refreshKey={txRefreshKey}
              onSeeAll={() => setDashView("transactions")}
            />
          </Card>
        </div>
        </div>
      </div>{/* fin Vue Résumé */}

      {/* ══ VUE ANALYSE ═════════════════════════════════════════════════════════ */}
      <div style={{ display: dashView === "analyse" ? "flex" : "none", height: "100%", padding: "14px 14px 10px", gap: 12, overflow: "hidden" }}>
        {/* Gauche : Radar de risque */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
          <Card style={{ flex: 1, padding: "16px 18px", display: "flex", flexDirection: "column" }}>
            <SectionLabel>RADAR DE RISQUE</SectionLabel>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 24 }}>
              {novacScore && (
                <RadarChart size={200} metrics={[
                  { label: "Diversif.", value: novacScore.diversification },
                  { label: "Momentum", value: novacScore.momentum },
                  { label: "Qualité",  value: novacScore.qualite },
                  { label: "Risque",   value: novacScore.risque },
                  { label: "Exposition", value: Math.min(100, (exposition["Actions"] ?? 0) + (exposition["ETF"] ?? 0)) },
                ]} />
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {novacScore && [
                  { label: "Diversification", value: novacScore.diversification, color: "#5B8DEF" },
                  { label: "Momentum",        value: novacScore.momentum,        color: novacScore.momentum >= 50 ? "#4ade80" : "#f87171" },
                  { label: "Qualité",         value: novacScore.qualite,         color: "#a78bfa" },
                  { label: "Risque",          value: novacScore.risque,          color: novacScore.risque >= 60 ? "#4ade80" : "#fbbf24" },
                ].map(m => (
                  <div key={m.label} style={{ minWidth: 140 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{m.label}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, fontFamily: FONT, color: m.color }}>{m.value}</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.07)" }}>
                      <div style={{ height: "100%", borderRadius: 2, background: m.color, width: `${m.value}%`, opacity: 0.8, transition: "width 600ms ease" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
        {/* Droite : Scénarios + exposition */}
        <div style={{ width: 280, display: "flex", flexDirection: "column", gap: 10 }}>
          <Card style={{ padding: "14px 16px" }}>
            <SectionLabel>SCÉNARIOS WHAT-IF</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "Nasdaq −10%", impact: -0.072, color: "#f87171" },
                { label: "Inflation +2%", impact: -0.018, color: "#fbbf24" },
                { label: "Bitcoin +20%", impact: 0.031, color: "#4ade80" },
                { label: "Taux +1%", impact: -0.012, color: "#fbbf24" },
              ].map(s => {
                const eurImpact = valeurTotale ? valeurTotale * s.impact : null;
                return (
                  <div key={s.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 10px", borderRadius: 8, background: `${s.color}12`, border: `1px solid ${s.color}22` }}>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>{s.label}</span>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, fontFamily: FONT, color: s.color }}>
                        {s.impact >= 0 ? "+" : ""}{(s.impact * 100).toFixed(1)}%
                      </span>
                      {eurImpact != null && (
                        <div style={{ fontSize: 10, color: s.color, opacity: 0.6 }}>
                          {eurImpact >= 0 ? "+" : ""}{Math.round(eurImpact).toLocaleString("fr-FR")} €
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
          <Card style={{ flex: 1, padding: "14px 16px" }}>
            <SectionLabel>EXPOSITION SECTORIELLE</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, justifyContent: "center", flex: 1 }}>
              {Object.entries(exposition).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <div key={k}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: EXPO_COLORS[k] ?? "#94a3b8" }} />
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>{k}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: FONT, color: EXPO_COLORS[k] ?? "#94a3b8" }}>{v.toFixed(1)}%</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.07)" }}>
                    <div style={{ height: "100%", borderRadius: 3, background: EXPO_COLORS[k] ?? "#94a3b8", width: `${v}%`, transition: "width 600ms ease" }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>{/* fin Vue Analyse */}

      {/* ══ VUE ÉVÉNEMENTS ══════════════════════════════════════════════════════ */}
      <div style={{ display: dashView === "evenements" ? "flex" : "none", height: "100%", padding: "14px 14px 10px", gap: 12, overflow: "hidden" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
          <Card style={{ flex: 1, padding: "16px 18px" }}>
            <SectionLabel>INSIGHTS IA</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                `${topPerformers[0]?.ticker ?? "—"} tire la performance du portefeuille avec ${fmtChange(topPerformers[0]?.change ?? null)} sur la période.`,
                `Concentration élevée : vos 3 premiers actifs représentent ${top3Conc.toFixed(0)}% du portefeuille. ${top3Conc > 60 ? "Diversification recommandée." : "Niveau acceptable."}`,
                `${gainCount} actifs en hausse contre ${lossCount} en baisse — momentum ${weightedChange >= 0 ? "positif" : "négatif"} sur ${PERIOD_LABEL[period]}.`,
              ].map((insight, i) => (
                <div key={i} style={{ display: "flex", gap: 12, padding: "12px 14px", borderRadius: 10,
                  background: "rgba(91,141,239,0.07)", border: "1px solid rgba(91,141,239,0.15)" }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(91,141,239,0.20)",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    fontSize: 10, fontWeight: 800, color: "#9BB9FF" }}>AI</div>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.70)", lineHeight: 1.6 }}>{insight}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <div style={{ width: 300, display: "flex", flexDirection: "column", gap: 10 }}>
          <Card style={{ flex: 1, padding: "16px 18px" }}>
            <SectionLabel>ÉVÉNEMENTS À VENIR</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {enriched.slice(0, 6).map((a, i) => (
                <div key={a.ticker} style={{ display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 0", borderBottom: i < 5 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                  <AssetLogo ticker={a.ticker} type={a.type} size={28} radius={7}
                    fallbackBg="rgba(255,255,255,0.07)" fallbackBorder="rgba(255,255,255,0.12)" fallbackTextColor="#fff"
                    bare />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{a.ticker.replace(/-USD$/,"")}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.30)" }}>Résultats trimestriels</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#fbbf24",
                    background: "rgba(251,191,36,0.12)", borderRadius: 5, padding: "2px 7px" }}>
                    J+{(i + 1) * 3}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>{/* fin Vue Événements */}

      {/* ══ VUE OBJECTIFS ═══════════════════════════════════════════════════════ */}
      <div style={{ display: dashView === "objectifs" ? "grid" : "none", height: "100%", padding: "14px 14px 10px",
        gridTemplateColumns: "1fr 1fr 1fr", gap: 12, overflow: "hidden" }}>
        <Card style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          <SectionLabel>OBJECTIFS</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { label: "Retraite 2035",         current: valeurTotale ?? 0, target: 400000, color: "#5B8DEF" },
              { label: "Achat immobilier",       current: (valeurTotale ?? 0) * 0.42, target: 100000, color: "#a78bfa" },
              { label: "Indépendance financière", current: (valeurTotale ?? 0) * 0.28, target: 500000, color: "#4ade80" },
            ].map(g => {
              const pct = Math.min(100, g.target > 0 ? (g.current / g.target) * 100 : 0);
              return (
                <div key={g.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.78)" }}>{g.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: FONT, color: g.color }}>{pct.toFixed(0)}%</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.07)" }}>
                    <div style={{ height: "100%", borderRadius: 3, background: g.color, width: `${pct}%`, transition: "width 600ms ease" }} />
                  </div>
                  <div style={{ marginTop: 4, fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: FONT }}>
                    {Math.round(g.current).toLocaleString("fr-FR")} € / {g.target.toLocaleString("fr-FR")} €
                  </div>
                </div>
              );
            })}
          </div>
          {novacScore && <>
            <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.07)" }} />
            {/* Santé du portefeuille : le titre chiffré passe en tête, la carte
                de droite ne garde que le détail par critère. */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 170 }}>
              <CircleScore score={novacScore.global} size={54} nu />
              <div>
                <p style={{ margin: "0 0 3px", fontSize: 11.5, fontWeight: 500, color: "rgba(255,255,255,0.55)" }}>Santé du portefeuille</p>
                <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                  <span style={{ fontSize: 20, fontWeight: 800, fontFamily: FONT, color: "#fff", lineHeight: 1 }}>{novacScore.global}</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.32)" }}>/100</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: scoreColor(novacScore.global) }}>
                  {scoreLabel(novacScore.global)}
                </span>
              </div>
            </div>
          </>}
        </Card>
        <Card style={{ padding: "16px 18px", display: "flex", flexDirection: "column" }}>
          <SectionLabel>MEILLEURS CONTRIBUTEURS</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {[...enriched].filter(a => a.perfEur != null).sort((a, b) => Math.abs(b.perfEur!) - Math.abs(a.perfEur!))
              .slice(0, 6).map((a, i) => (
              <div key={a.ticker} style={{ display: "flex", alignItems: "center", gap: 10,
                padding: "10px 0", borderBottom: i < 5 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                <AssetLogo ticker={a.ticker} type={a.type} size={26} radius={6}
                  fallbackBg="rgba(255,255,255,0.07)" fallbackBorder="rgba(255,255,255,0.12)" fallbackTextColor="#fff"
                  bare />
                <span style={{ fontSize: 12, fontWeight: 600, flex: 1, color: "rgba(255,255,255,0.78)" }}>{a.ticker.replace(/-USD$/,"")}</span>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, fontFamily: FONT, color: (a.perfEur ?? 0) >= 0 ? "#4ade80" : "#f87171" }}>
                    {(a.perfEur ?? 0) >= 0 ? "+" : ""}{Math.round(a.perfEur!).toLocaleString("fr-FR")} €
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.30)", fontFamily: FONT }}>{fmtChange(a.change)}</div>
                </div>
              </div>
            ))}
          </div>
          {novacScore && <>
            <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.07)" }} />
            {/* Santé du portefeuille : le titre chiffré passe en tête, la carte
                de droite ne garde que le détail par critère. */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 170 }}>
              <CircleScore score={novacScore.global} size={54} nu />
              <div>
                <p style={{ margin: "0 0 3px", fontSize: 11.5, fontWeight: 500, color: "rgba(255,255,255,0.55)" }}>Santé du portefeuille</p>
                <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                  <span style={{ fontSize: 20, fontWeight: 800, fontFamily: FONT, color: "#fff", lineHeight: 1 }}>{novacScore.global}</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.32)" }}>/100</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: scoreColor(novacScore.global) }}>
                  {scoreLabel(novacScore.global)}
                </span>
              </div>
            </div>
          </>}
        </Card>
        <Card style={{ padding: "16px 18px", display: "flex", flexDirection: "column" }}>
          <SectionLabel>RÉPARTITION PAR CLASSE</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, justifyContent: "center" }}>
            {Object.entries(exposition).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: EXPO_COLORS[k] ?? "#94a3b8", flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.60)", flex: 1 }}>{k}</span>
                <span style={{ fontSize: 14, fontWeight: 700, fontFamily: FONT, color: EXPO_COLORS[k] ?? "#94a3b8" }}>{v.toFixed(1)}%</span>
              </div>
            ))}
          </div>
          {novacScore && <>
            <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.07)" }} />
            {/* Santé du portefeuille : le titre chiffré passe en tête, la carte
                de droite ne garde que le détail par critère. */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 170 }}>
              <CircleScore score={novacScore.global} size={54} nu />
              <div>
                <p style={{ margin: "0 0 3px", fontSize: 11.5, fontWeight: 500, color: "rgba(255,255,255,0.55)" }}>Santé du portefeuille</p>
                <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                  <span style={{ fontSize: 20, fontWeight: 800, fontFamily: FONT, color: "#fff", lineHeight: 1 }}>{novacScore.global}</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.32)" }}>/100</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: scoreColor(novacScore.global) }}>
                  {scoreLabel(novacScore.global)}
                </span>
              </div>
            </div>
          </>}
        </Card>
      </div>{/* fin Vue Objectifs */}

      {/* ══ VUE TRANSACTIONS ════════════════════════════════════════════════════ */}
      <div style={{ display: dashView === "transactions" ? "flex" : "none", height: "100%", flexDirection: "column", overflow: "hidden" }}>
        {portfolio && (
          <TransactionsList
            portfolioId={portfolio.id}
            refreshKey={txRefreshKey}
            onNewTransaction={() => setShowTxModal(true)}
          />
        )}
      </div>

      </div>{/* fin MAIN wrapper */}

      {/* Bottom padding */}
      <div style={{ height: 10, flexShrink: 0 }} />

      {showTxModal && (
        <TransactionModal
          portfolioId={portfolio?.id ?? ""}
          isOpen={showTxModal}
          onClose={() => setShowTxModal(false)}
          onSuccess={() => { setShowTxModal(false); setTxRefreshKey(k => k + 1); }}
        />
      )}
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", background: "var(--novac-bg, #040F22)",
        color: "rgba(255,255,255,0.25)", fontSize: 12 }}>
        Chargement…
      </div>
    }>
      <PortfolioPageInner />
    </Suspense>
  );
}
