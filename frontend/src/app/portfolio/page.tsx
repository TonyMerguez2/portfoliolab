"use client";
import { useEffect, useState, useMemo, useRef, Suspense } from "react";
import type { ReactNode } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useApp } from "@/lib/AppContext";
import AssetLogo from "@/components/AssetLogo";
import LiquidGlassTreemap from "@/components/charts/LiquidGlassTreemap";
import TransactionModal from "@/components/TransactionModal";
import TransactionsList from "@/components/TransactionsList";

// ── Types ──────────────────────────────────────────────────────────────────────
type PortfolioAsset = { ticker: string; weight: number };
type PortfolioData  = { id: string; name: string; assets: PortfolioAsset[]; color: string; total_value?: number | null; cost_basis?: number | null };
type PriceData      = { symbol: string; price: number; change: number };
type Enriched       = PortfolioAsset & { price: number | null; change: number | null; type?: string; value: number | null; perfEur: number | null };

const FONT      = "'Inter', 'SF Pro Display', system-ui, sans-serif";
const FONT_MONO = "'SF Mono', 'Fira Code', monospace";

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
function seededRand(seed: number) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

function genSparkline(seed: number, pts = 20, trend = 0.008): number[] {
  const r = seededRand(seed);
  let v = 0.4;
  return Array.from({ length: pts }, () => {
    v += trend + (r() - 0.48) * 0.07;
    return (v = Math.max(0.05, Math.min(0.95, v)));
  });
}

// Brownian bridge de startPrice → price avec volatilité réaliste
function initPriceHistory(price: number, change: number, pts = 24): number[] {
  const seed = Math.abs(Math.round(price * 100));
  const r    = seededRand(seed);
  const startPrice = price / (1 + change / 100);
  const vol  = price * 0.007; // volatilité par step ~0.7% du prix
  let v = startPrice;
  const result: number[] = [startPrice];
  for (let i = 1; i < pts; i++) {
    const drift = (price - v) / (pts - i + 1); // attire vers le prix final
    v += drift + (r() - 0.48) * vol;
    result.push(Math.max(0.001, v));
  }
  result[result.length - 1] = price;
  return result;
}

const portfolioCurve = genSparkline(42, 56, 0.007);

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
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 12,
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

function CircleScore({ score, size = 88 }: { score: number; size?: number }) {
  const r    = (size - 14) / 2;
  const cx   = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(1, score / 100)) * circ;
  const color = scoreColor(score);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)", display: "block" }}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={9} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={9}
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${color}99)`, transition: "stroke-dasharray 1s cubic-bezier(0.34,1,0.64,1)" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 28, fontWeight: 800, fontFamily: FONT_MONO, color: "#fff", lineHeight: 1 }}>{score}</span>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.30)", letterSpacing: "0.04em" }}>/100</span>
        </div>
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: "0.02em" }}>{scoreLabel(score)}</span>
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
type Period = "1J" | "7J" | "1M" | "3M" | "1A";
const PERIODS: Period[] = ["1J", "7J", "1M", "3M", "1A"];
const PERIOD_MAP: Record<Period, string> = { "1J": "1d", "7J": "7d", "1M": "1mo", "3M": "3mo", "1A": "1y" };
const PERIOD_LABEL: Record<Period, string> = { "1J": "24h", "7J": "7j", "1M": "1 mois", "3M": "3 mois", "1A": "1 an" };

function PortfolioPageInner() {
  const { activePortfolio, setActivePortfolio, setMode } = useApp();
  const searchParams = useSearchParams();
  const router       = useRouter();

  const [portfolio,     setPortfolio]     = useState<PortfolioData | null>(null);
  const [prices,        setPrices]        = useState<Record<string, PriceData>>({});
  const [loading,       setLoading]       = useState(true);
  const [view,          setView]          = useState<"carte" | "liste">("carte");
  const [period,        setPeriod]        = useState<Period>("1J");
  const [mounted,       setMounted]       = useState(false);
  const [sparkHistory,    setSparkHistory]    = useState<Record<string, number[]>>({});
  const [priceUpdatedAt,  setPriceUpdatedAt]  = useState<Record<string, number>>({});
  const [editingValue,    setEditingValue]    = useState(false);
  const [valueInput,      setValueInput]      = useState("");
  const [editingCost,     setEditingCost]     = useState(false);
  const [costInput,       setCostInput]       = useState("");
  const [spyChange,       setSpyChange]       = useState<number | null>(null);
  const [legendTooltip,   setLegendTooltip]   = useState(false);
  const [dashView,        setDashView]        = useState<"resume"|"analyse"|"evenements"|"objectifs"|"transactions">("resume");
  const [activeTooltip,   setActiveTooltip]   = useState<string | null>(null);
  const [showTxModal,     setShowTxModal]     = useState(false);
  const [txRefreshKey,    setTxRefreshKey]    = useState(0);

  useEffect(() => { const t = setTimeout(() => setMounted(true), 60); return () => clearTimeout(t); }, []);

  useEffect(() => {
    const idFromUrl = searchParams.get("id");
    fetch("http://localhost:8000/api/v1/portfolios")
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setActivePortfolio({ id: p.id as any, name: p.name, assets: p.assets, color: p.color });
        setMode("portfolio");
      })
      .catch(() => setLoading(false));
  }, [searchParams]); // eslint-disable-line

  // Réagit aux changements de portefeuille depuis le GlobalHeader
  useEffect(() => {
    if (!activePortfolio) return;
    setPortfolio(prev => {
      if (prev?.id === String(activePortfolio.id)) return prev;
      return {
        id:     String(activePortfolio.id),
        name:   activePortfolio.name,
        assets: (activePortfolio.assets || []) as PortfolioAsset[],
        color:  activePortfolio.color || "#5B8DEF",
      };
    });
  }, [activePortfolio?.id]); // eslint-disable-line

  const isFirstLoad = useRef(true);

  useEffect(() => {
    if (!portfolio?.assets?.length) return;
    const tickers = portfolio.assets.map(a => a.ticker).join(",");
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
          if (isInit) setPrices(map);

          const newUpdatedAt: Record<string, number> = {};
          setSparkHistory(prev => {
            const next = { ...prev };
            list.forEach(p => {
              if (p.price == null) return;
              if (!next[p.symbol] || isInit) {
                next[p.symbol] = initPriceHistory(p.price, p.change ?? 0, 24);
                newUpdatedAt[p.symbol] = Date.now();
              } else {
                const lastPrice = next[p.symbol][next[p.symbol].length - 1];
                if (Math.abs(p.price - lastPrice) > 0.0001) {
                  next[p.symbol] = [...next[p.symbol], p.price].slice(-50);
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
  }, [portfolio, period]);

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
    return portfolio.assets.map(a => {
      const price  = prices[a.ticker]?.price  ?? null;
      const change = prices[a.ticker]?.change ?? null;
      const tv     = portfolio.total_value ?? null;
      const value  = tv != null ? (a.weight / 100) * tv : null;
      const perfEur = value != null && change != null ? value * (change / 100) : null;
      return { ...a, price, change, value, perfEur };
    });
  }, [portfolio, prices]);

  const totalWeight    = enriched.reduce((s, a) => s + a.weight, 0);
  const weightedChange = enriched.reduce((s, a) => {
    if (a.change === null) return s;
    return s + (a.weight / totalWeight) * a.change;
  }, 0);
  const isUp       = weightedChange >= 0;
  const perfColor  = isUp ? "#4ade80" : "#f87171";

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

  // Sparklines per asset — deterministic, trending per change direction
  const assetSparks = useMemo(() => {
    const map: Record<string, number[]> = {};
    enriched.forEach((a, i) => {
      map[a.ticker] = genSparkline(i * 37 + 11, 20, (a.change ?? 0) >= 0 ? 0.010 : -0.010);
    });
    return map;
  }, [enriched]);

  const saveTotalValue = async () => {
    if (!portfolio) return;
    const v = parseFloat(valueInput.replace(/\s/g, "").replace(",", "."));
    if (isNaN(v) || v <= 0) { setEditingValue(false); return; }
    await fetch(`http://localhost:8000/api/v1/portfolios/${portfolio.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
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
      method: "PUT", headers: { "Content-Type": "application/json" },
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
        height: "100vh", background: "#040F22", color: "rgba(255,255,255,0.5)",
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
      background: "#040F22", color: "#F8F9FC",
      fontFamily: FONT, boxSizing: "border-box",
      paddingTop: 48, overflow: "hidden",
    }}>

      {/* ── SUB-HEADER ──────────────────────────────────────────────────────── */}
      <header style={{
        display: "flex", alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 18px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        flexShrink: 0,
        ...anim(0),
      }}>
        {/* Gauche : nom */}
        <div>
          <p style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,0.30)", letterSpacing: "0.06em", fontWeight: 600 }}>PORTEFEUILLE</p>
          <p style={{ margin: "2px 0 0", fontSize: 15, fontWeight: 700, color: "#fff" }}>
            {portfolio?.name ?? "—"}
          </p>
        </div>

        {/* Droite : vues dashboard */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {(["resume","analyse","evenements","objectifs","transactions"] as const).map(v => {
            const labels = { resume: "Résumé", analyse: "Analyse", evenements: "Événements", objectifs: "Objectifs", transactions: "Transactions" };
            const isAct  = dashView === v;
            return (
              <button key={v} onClick={() => setDashView(v)} style={{
                padding: "5px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                fontSize: 11, fontWeight: isAct ? 700 : 500, fontFamily: FONT,
                background: isAct ? "rgba(91,141,239,0.18)" : "transparent",
                color: isAct ? "#9BB9FF" : "rgba(255,255,255,0.32)",
                borderBottom: isAct ? "2px solid #5B8DEF" : "2px solid transparent",
                transition: "all 180ms ease",
              }}>
                {labels[v]}
              </button>
            );
          })}
        </div>
      </header>

      {/* ── MAIN ────────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", position: "relative" }}>

      {/* ══ VUE RÉSUMÉ ══════════════════════════════════════════════════════════ */}
      <div style={{ display: dashView === "resume" ? "flex" : "none", height: "100%", gap: 0, padding: "10px 10px 0", overflow: "hidden" }}>

        {/* Treemap / Liste */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 8, ...anim(80) }}>
          {/* Barre contrôles : période (gauche) · ⓘ + carte/liste (droite) */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            {/* Sélecteur de période */}
            <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: 3, border: "1px solid rgba(255,255,255,0.07)" }}>
              {PERIODS.map(p => (
                <button key={p} onClick={() => setPeriod(p)} style={{
                  padding: "3px 9px", borderRadius: 6, border: "none", cursor: "pointer",
                  fontSize: 10, fontWeight: 600, fontFamily: FONT,
                  background: period === p ? "rgba(255,255,255,0.11)" : "transparent",
                  color: period === p ? "#fff" : "rgba(255,255,255,0.32)",
                  transition: "all 160ms ease",
                }}>
                  {p}
                </button>
              ))}
            </div>
            {/* ⓘ + toggle vue */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Légende ⓘ */}
              <div style={{ position: "relative" }}
                onMouseEnter={() => setLegendTooltip(true)}
                onMouseLeave={() => setLegendTooltip(false)}>
                <span style={{ fontSize: 16, color: "rgba(255,255,255,0.22)", cursor: "default", lineHeight: 1, userSelect: "none" }}>ⓘ</span>
                {legendTooltip && (
                  <div style={{
                    position: "absolute", bottom: "calc(100% + 8px)", right: 0, zIndex: 50, whiteSpace: "nowrap",
                    background: "rgba(4,17,36,0.97)", border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: 8, padding: "8px 12px", boxShadow: "0 8px 24px rgba(0,0,0,0.50)",
                    pointerEvents: "none",
                  }}>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.62)" }}>
                      Fond = couleur de marque &nbsp;·&nbsp;
                      <span style={{ color: "#4ade80" }}>▲</span>
                      <span style={{ color: "#f87171" }}>▼</span> = performance du jour
                    </span>
                  </div>
                )}
              </div>
              {/* Toggle carte / liste */}
              <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: 3, gap: 1, border: "1px solid rgba(255,255,255,0.07)" }}>
                {(["carte", "liste"] as const).map(v => (
                  <button key={v} onClick={() => setView(v)} style={{
                    padding: "3px 10px", borderRadius: 6, border: "none", cursor: "pointer",
                    fontSize: 10, fontWeight: 600, fontFamily: FONT,
                    background: view === v ? "rgba(255,255,255,0.11)" : "transparent",
                    color: view === v ? "#fff" : "rgba(255,255,255,0.32)",
                    transition: "all 160ms ease",
                  }}>
                    {v === "carte" ? "⊞ Carte" : "≡ Liste"}
                  </button>
                ))}
              </div>
              {/* Nouvelle transaction */}
              {portfolio && (
                <button
                  onClick={() => setShowTxModal(true)}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "4px 10px", borderRadius: 8, cursor: "pointer",
                    fontSize: 10, fontWeight: 600, fontFamily: FONT,
                    border: "1px solid rgba(74,222,128,0.30)",
                    background: "rgba(74,222,128,0.08)", color: "#4ade80",
                    transition: "all 160ms ease",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(74,222,128,0.15)"; e.currentTarget.style.borderColor = "rgba(74,222,128,0.50)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(74,222,128,0.08)"; e.currentTarget.style.borderColor = "rgba(74,222,128,0.30)"; }}
                >
                  + Transaction
                </button>
              )}
            </div>
          </div>
          {loading ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.20)", fontSize: 12 }}>
              Chargement…
            </div>
          ) : (<>
            {/* Carte — toujours monté pour éviter le re-init D3 */}
            <div style={{ flex: 1, minHeight: 0, display: view === "carte" ? "flex" : "none", flexDirection: "column" }}>
              <LiquidGlassTreemap
                assets={enriched.map(a => ({
                  ticker: a.ticker, weight: a.weight,
                  change: a.change, type: a.type, price: a.price,
                  spark:     sparkHistory[a.ticker] ?? assetSparks[a.ticker],
                  updatedAt: priceUpdatedAt[a.ticker],
                  value:     a.value,
                  perfEur:   a.perfEur,
                }))}
                onAssetClick={ticker => router.push(`/chart?ticker=${encodeURIComponent(ticker)}`)}
              />
            </div>
            {/* Liste — toujours monté */}
            <div style={{ overflowY: "auto", flex: 1, borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)", display: view === "liste" ? "block" : "none" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 100px 70px" }}>
                {["Actif", "Poids", "Prix", "24h"].map(h => (
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
                  <div key={`${a.ticker}-p`} style={{ padding: "9px 14px", fontSize: 11, color: "rgba(255,255,255,0.55)", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", fontFamily: FONT_MONO }}>
                    {a.price !== null ? `${a.price.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : "—"}
                  </div>,
                  <div key={`${a.ticker}-c`} style={{ padding: "9px 14px", fontSize: 11, fontWeight: 700, borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", fontFamily: FONT_MONO, color: a.change === null ? "rgba(255,255,255,0.25)" : a.change >= 0 ? "#4ade80" : "#f87171" }}>
                    {fmtChange(a.change)}
                  </div>,
                ])}
              </div>
            </div>
          </>)}

          {/* Bottom KPI row — 2 cartes après fusion/suppression */}
          {view === "carte" && (() => {
            const riskLevel = top3Conc > 70 ? 3 : top3Conc > 50 ? 2 : 1;
            const riskColor = riskLevel === 3 ? "#f87171" : riskLevel === 2 ? "#fbbf24" : "#4ade80";
            const riskLabel = riskLevel === 3 ? "Élevé" : riskLevel === 2 ? "Modéré" : "Faible";
            const totalGain = enriched.reduce((s, a) => s + Math.max(0, a.perfEur ?? 0), 0);
            const totalLoss = enriched.reduce((s, a) => s + Math.min(0, a.perfEur ?? 0), 0);
            return (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, flexShrink: 0, ...anim(240) }}>

                {/* RISQUE — fusion Concentration + Risque avec bordure gauche sémantique */}
                <Card style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: 14,
                  borderLeft: `3px solid ${riskColor}`, borderRadius: "0 12px 12px 0" }}>
                  <div style={{ flexShrink: 0 }}>
                    <p style={{ margin: 0, fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", color: "rgba(255,255,255,0.25)" }}>RISQUE</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: riskColor, boxShadow: `0 0 6px ${riskColor}88`, flexShrink: 0 }} />
                      <span style={{ fontSize: 18, fontWeight: 700, color: riskColor, lineHeight: 1 }}>{riskLabel}</span>
                    </div>
                    <p style={{ margin: "4px 0 0", fontSize: 9, color: "rgba(255,255,255,0.28)" }}>Concentration top 3 : {top3Conc.toFixed(0)}%</p>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ position: "relative", height: 5, borderRadius: 3, background: "linear-gradient(to right, #4ade80, #fbbf24, #f87171)" }}>
                      <div style={{
                        position: "absolute", top: "50%", transform: "translate(-50%,-50%)",
                        left: `${riskLevel === 1 ? 20 : riskLevel === 2 ? 55 : 85}%`,
                        width: 11, height: 11, borderRadius: "50%",
                        background: riskColor, border: "2px solid #040F22",
                        boxShadow: `0 0 7px ${riskColor}`,
                        transition: "left 600ms cubic-bezier(0.34,1,0.64,1)",
                      }} />
                    </div>
                  </div>
                </Card>

                {/* BILAN JOURNALIER */}
                <Card style={{ padding: "8px 14px" }}>
                  <p style={{ margin: "0 0 4px", fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", color: "rgba(255,255,255,0.25)" }}>BILAN JOURNALIER</p>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, fontFamily: FONT_MONO, color: "#4ade80", lineHeight: 1 }}>
                      +{Math.round(totalGain).toLocaleString("fr-FR")} €
                    </span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.20)" }}>/</span>
                    <span style={{ fontSize: 18, fontWeight: 800, fontFamily: FONT_MONO, color: lossCount > 0 ? "#f87171" : "rgba(255,255,255,0.18)", lineHeight: 1 }}>
                      {Math.round(totalLoss).toLocaleString("fr-FR")} €
                    </span>
                  </div>
                  <div style={{ marginTop: 5, fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: FONT }}>
                    <span style={{ color: "#4ade80", fontWeight: 600 }}>{gainCount}</span>
                    {" hausse"}{gainCount !== 1 ? "s" : ""}
                    {" · "}
                    <span style={{ color: lossCount > 0 ? "#f87171" : "rgba(255,255,255,0.35)", fontWeight: 600 }}>{lossCount}</span>
                    {" baisse"}{lossCount !== 1 ? "s" : ""}
                  </div>
                </Card>
              </div>
            );
          })()}
        </div>

        {/* ── Right sidebar ─────────────────────────────────────────────────── */}
        <div style={{
          width: 248, flexShrink: 0,
          display: "flex", flexDirection: "column", gap: 8,
          paddingLeft: 10, overflow: "hidden",
          ...anim(160),
        }}>

          {/* 1. ÉTAT DE SANTÉ — Valeur totale + Score NOVAC fusionnés */}
          <Card style={{ padding: "14px 16px", flexShrink: 0 }}>
            {/* VALEUR TOTALE + édition inline */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", color: "rgba(255,255,255,0.28)" }}>VALEUR TOTALE</p>
              <button onClick={() => { setValueInput(portfolio?.total_value?.toString() ?? ""); setEditingValue(true); }}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "rgba(255,255,255,0.28)", padding: "0 2px", transition: "color 150ms" }}
                onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.65)")}
                onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.28)")}>✏</button>
            </div>
            {editingValue ? (
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                <input autoFocus value={valueInput} onChange={e => setValueInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveTotalValue(); if (e.key === "Escape") setEditingValue(false); }}
                  onBlur={saveTotalValue} placeholder="Ex: 10000" type="number"
                  style={{ width: 100, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(91,141,239,0.40)", borderRadius: 6, padding: "3px 8px", color: "#fff", fontSize: 11, outline: "none", fontFamily: FONT_MONO }} />
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>€</span>
              </div>
            ) : (
              <div style={{ fontSize: 24, fontWeight: 800, fontFamily: FONT_MONO, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1, marginBottom: 4 }}>
                {portfolio?.total_value != null
                  ? portfolio.total_value.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €"
                  : <span style={{ fontSize: 13, color: "rgba(255,255,255,0.25)" }}>Non défini</span>}
              </div>
            )}
            {/* Perf du jour */}
            {portfolio?.total_value != null && weightedChange != null && (
              <div style={{ fontSize: 11, fontFamily: FONT_MONO, color: perfColor, fontWeight: 600 }}>
                Aujourd&apos;hui&nbsp;
                <span>{weightedChange >= 0 ? "+" : ""}{Math.round(portfolio.total_value * weightedChange / 100).toLocaleString("fr-FR")} €</span>
                <span style={{ opacity: 0.55, marginLeft: 4 }}>({fmtChange(weightedChange)})</span>
              </div>
            )}
            {/* P&L total depuis achat */}
            {portfolio?.total_value != null && (() => {
              const cb = portfolio.cost_basis;
              if (cb == null) {
                return (
                  <div style={{ marginTop: 3 }}>
                    {editingCost ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <input autoFocus value={costInput} onChange={e => setCostInput(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveCostBasis(); if (e.key === "Escape") setEditingCost(false); }}
                          onBlur={saveCostBasis} placeholder="Prix de revient" type="number"
                          style={{ width: 110, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(91,141,239,0.40)", borderRadius: 6, padding: "3px 8px", color: "#fff", fontSize: 10, outline: "none", fontFamily: FONT_MONO }} />
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
              const plEur = portfolio.total_value - cb;
              const plPct = (plEur / cb) * 100;
              const plCol = plEur >= 0 ? "#4ade80" : "#f87171";
              return (
                <div style={{ marginTop: 3, fontSize: 11, fontFamily: FONT_MONO, color: plCol, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  Total
                  <span>{plEur >= 0 ? "+" : ""}{Math.round(plEur).toLocaleString("fr-FR")} €</span>
                  <span style={{ opacity: 0.55 }}>({plPct >= 0 ? "+" : ""}{plPct.toFixed(1)}%)</span>
                  <button onClick={() => { setCostInput(cb.toString()); setEditingCost(true); }}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 9, color: "rgba(255,255,255,0.22)", padding: 0, transition: "color 150ms" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.50)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.22)")}>✏</button>
                  {editingCost && (
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <input autoFocus value={costInput} onChange={e => setCostInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveCostBasis(); if (e.key === "Escape") setEditingCost(false); }}
                        onBlur={saveCostBasis} type="number"
                        style={{ width: 90, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(91,141,239,0.40)", borderRadius: 6, padding: "2px 7px", color: "#fff", fontSize: 10, outline: "none", fontFamily: FONT_MONO }} />
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>€</span>
                    </div>
                  )}
                </div>
              );
            })()}
            {/* Benchmark SPY */}
            {spyChange != null && weightedChange != null && (() => {
              const diff    = weightedChange - spyChange;
              const diffCol = diff >= 0 ? "#4ade80" : "#f87171";
              return (
                <div style={{ position: "relative", marginTop: 3 }}
                  onMouseEnter={() => setActiveTooltip("spy")}
                  onMouseLeave={() => setActiveTooltip(null)}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.40)", fontFamily: FONT_MONO, cursor: "default" }}>
                    vs S&amp;P 500&nbsp;
                    <span style={{ color: diffCol, fontWeight: 700 }}>{diff >= 0 ? "+" : ""}{diff.toFixed(2)}%</span>
                  </div>
                  {activeTooltip === "spy" && (
                    <div style={{
                      position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0, zIndex: 50,
                      background: "rgba(4,17,36,0.97)", border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 8, padding: "8px 10px", boxShadow: "0 8px 24px rgba(0,0,0,0.50)",
                      pointerEvents: "none", whiteSpace: "nowrap",
                    }}>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.62)", lineHeight: 1.5 }}>
                        Votre portefeuille&nbsp;
                        {diff >= 0 ? "surperforme" : "sous-performe"}&nbsp;
                        le S&amp;P 500 de {Math.abs(diff).toFixed(2)}% sur la période.
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}
            <div style={{ margin: "12px 0", height: 1, background: "rgba(255,255,255,0.06)" }} />
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
                  <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                    <CircleScore score={novacScore.global} size={88} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: "0 0 10px", fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", color: "rgba(255,255,255,0.28)" }}>SCORE NOVAC</p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                        {subScores.map(m => {
                          const col = scoreColor(m.value);
                          return (
                            <div key={m.key} style={{ position: "relative", borderRadius: 6, padding: "2px 4px", transition: "background 150ms" }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; setActiveTooltip(m.key); }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; setActiveTooltip(null); }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, cursor: "default" }}>
                                <span style={{ fontSize: 10, color: activeTooltip === m.key ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.42)", transition: "color 120ms" }}>{m.label}</span>
                                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: FONT_MONO, color: col }}>{m.value}</span>
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
                    </div>
                  </div>
                </>
              );
            })()}
          </Card>

          {/* 2. MOUVEMENTS — triés par contribution € absolue, avec perfEur */}
          <Card style={{ padding: "11px 13px", flexShrink: 0 }}>
            <SectionLabel>MOUVEMENTS</SectionLabel>
            {/* Hausses — top 3 par |perfEur| décroissant */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[...enriched]
                .filter(a => a.change !== null && (a.change ?? 0) >= 0)
                .sort((a, b) => Math.abs(b.perfEur ?? 0) - Math.abs(a.perfEur ?? 0))
                .slice(0, 3)
                .map(a => (
                  <div key={a.ticker} style={{ display: "flex", alignItems: "center", gap: 7, borderRadius: 6, padding: "3px 4px", transition: "background 150ms" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <AssetLogo ticker={a.ticker} type={a.type} size={18} radius={4}
                      fallbackBg="rgba(74,222,128,0.12)" fallbackBorder="rgba(74,222,128,0.25)" fallbackTextColor="#4ade80"
                      bare />
                    <span style={{ fontSize: 11, fontWeight: 600, flex: 1, color: "rgba(255,255,255,0.75)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.ticker.replace(/-USD$/, "")}
                    </span>
                    <span style={{ fontSize: 10, fontFamily: FONT_MONO, color: "#4ade80", fontWeight: 600, textAlign: "right", lineHeight: 1.3 }}>
                      {fmtChange(a.change)}
                      {a.perfEur != null && (
                        <span style={{ display: "block", fontSize: 9, opacity: 0.65 }}>
                          +{Math.round(a.perfEur).toLocaleString("fr-FR")} €
                        </span>
                      )}
                    </span>
                  </div>
                ))}
            </div>
            {/* Séparateur */}
            <div style={{ margin: "8px 0", height: 1, background: "rgba(255,255,255,0.05)" }} />
            {/* Baisses — uniquement change < 0, triées par |perfEur| décroissant */}
            {(() => {
              const losers = [...enriched]
                .filter(a => (a.change ?? 0) < 0)
                .sort((a, b) => Math.abs(b.perfEur ?? 0) - Math.abs(a.perfEur ?? 0))
                .slice(0, 3);
              if (!losers.length) return (
                <p style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,0.22)", textAlign: "center", padding: "4px 0" }}>
                  Aucun actif en baisse
                </p>
              );
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {losers.map(a => (
                    <div key={a.ticker} style={{ display: "flex", alignItems: "center", gap: 6, borderRadius: 6, padding: "3px 4px", transition: "background 150ms" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <AssetLogo ticker={a.ticker} type={a.type} size={18} radius={4}
                        fallbackBg="rgba(248,113,113,0.12)" fallbackBorder="rgba(248,113,113,0.25)" fallbackTextColor="#f87171"
                        bare />
                      <span style={{ fontSize: 11, fontWeight: 600, flex: 1, color: "rgba(255,255,255,0.75)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.ticker.replace(/-USD$/, "")}
                      </span>
                      <span style={{ fontSize: 10, fontFamily: FONT_MONO, color: "#f87171", fontWeight: 600, textAlign: "right", lineHeight: 1.3 }}>
                        {fmtChange(a.change)}
                        {a.perfEur != null && (
                          <span style={{ display: "block", fontSize: 9, opacity: 0.65 }}>
                            {Math.round(a.perfEur).toLocaleString("fr-FR")} €
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </Card>

          {/* 3. EXPOSITION SECTEUR — seul endroit */}
          <Card style={{ padding: "11px 13px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <SectionLabel>EXPOSITION SECTEUR</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 9, justifyContent: "center", flex: 1 }}>
              {Object.entries(exposition).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <div key={k} style={{ borderRadius: 6, padding: "2px 4px", transition: "background 150ms" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: EXPO_COLORS[k] ?? "#94a3b8" }} />
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{k}</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, fontFamily: FONT_MONO, color: EXPO_COLORS[k] ?? "#94a3b8" }}>{v.toFixed(1)}%</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.07)" }}>
                    <div style={{ height: "100%", width: `${v}%`, borderRadius: 2, background: EXPO_COLORS[k] ?? "#94a3b8", opacity: 0.80, transition: "width 600ms ease" }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
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
                      <span style={{ fontSize: 11, fontWeight: 700, fontFamily: FONT_MONO, color: m.color }}>{m.value}</span>
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
                const eurImpact = portfolio?.total_value ? portfolio.total_value * s.impact : null;
                return (
                  <div key={s.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 10px", borderRadius: 8, background: `${s.color}12`, border: `1px solid ${s.color}22` }}>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>{s.label}</span>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, fontFamily: FONT_MONO, color: s.color }}>
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
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: FONT_MONO, color: EXPO_COLORS[k] ?? "#94a3b8" }}>{v.toFixed(1)}%</span>
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
              { label: "Retraite 2035",         current: portfolio?.total_value ?? 0, target: 400000, color: "#5B8DEF" },
              { label: "Achat immobilier",       current: (portfolio?.total_value ?? 0) * 0.42, target: 100000, color: "#a78bfa" },
              { label: "Indépendance financière", current: (portfolio?.total_value ?? 0) * 0.28, target: 500000, color: "#4ade80" },
            ].map(g => {
              const pct = Math.min(100, g.target > 0 ? (g.current / g.target) * 100 : 0);
              return (
                <div key={g.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.78)" }}>{g.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: FONT_MONO, color: g.color }}>{pct.toFixed(0)}%</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.07)" }}>
                    <div style={{ height: "100%", borderRadius: 3, background: g.color, width: `${pct}%`, transition: "width 600ms ease" }} />
                  </div>
                  <div style={{ marginTop: 4, fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: FONT_MONO }}>
                    {Math.round(g.current).toLocaleString("fr-FR")} € / {g.target.toLocaleString("fr-FR")} €
                  </div>
                </div>
              );
            })}
          </div>
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
                  <div style={{ fontSize: 12, fontWeight: 700, fontFamily: FONT_MONO, color: (a.perfEur ?? 0) >= 0 ? "#4ade80" : "#f87171" }}>
                    {(a.perfEur ?? 0) >= 0 ? "+" : ""}{Math.round(a.perfEur!).toLocaleString("fr-FR")} €
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.30)", fontFamily: FONT_MONO }}>{fmtChange(a.change)}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card style={{ padding: "16px 18px", display: "flex", flexDirection: "column" }}>
          <SectionLabel>RÉPARTITION PAR CLASSE</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, justifyContent: "center" }}>
            {Object.entries(exposition).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: EXPO_COLORS[k] ?? "#94a3b8", flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.60)", flex: 1 }}>{k}</span>
                <span style={{ fontSize: 14, fontWeight: 700, fontFamily: FONT_MONO, color: EXPO_COLORS[k] ?? "#94a3b8" }}>{v.toFixed(1)}%</span>
              </div>
            ))}
          </div>
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
        height: "100vh", background: "#040F22",
        color: "rgba(255,255,255,0.25)", fontSize: 12 }}>
        Chargement…
      </div>
    }>
      <PortfolioPageInner />
    </Suspense>
  );
}
