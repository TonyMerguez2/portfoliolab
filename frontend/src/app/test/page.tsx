"use client";
import { useState, useEffect } from "react";
import LiquidGlassTreemap from "@/components/charts/LiquidGlassTreemap";
import AssetLogo from "@/components/AssetLogo";

const FONT      = "'Geist', 'SF Pro Display', system-ui, sans-serif";
const FONT_MONO = "'SF Mono', 'Fira Code', monospace";

type Period = "1J" | "7J" | "1M" | "3M" | "1A";
const PERIODS: Period[] = ["1J", "7J", "1M", "3M", "1A"];

const ASSETS = [
  { ticker: "AAPL",    weight: 18, change:  2.70, price:   289.36, type: "stock"  },
  { ticker: "NVDA",    weight: 14, change:  2.63, price:   200.09, type: "stock"  },
  { ticker: "TSLA",    weight: 13, change:  2.13, price:   420.60, type: "stock"  },
  { ticker: "AMZN",    weight: 13, change: -0.75, price:   238.34, type: "stock"  },
  { ticker: "MSFT",    weight: 13, change:  1.21, price:   373.02, type: "stock"  },
  { ticker: "GOOGL",   weight:  8, change:  1.05, price:   357.37, type: "stock"  },
  { ticker: "META",    weight:  6, change:  0.12, price:   563.29, type: "stock"  },
  { ticker: "ETH-USD", weight:  4, change:  0.19, price:  3240.50, type: "crypto" },
  { ticker: "AVGO",    weight:  3, change:  1.42, price:   185.20, type: "stock"  },
  { ticker: "SOL-USD", weight:  3, change:  1.52, price:   142.30, type: "crypto" },
  { ticker: "BNB-USD", weight:  3, change: -0.17, price:   544.75, type: "crypto" },
  { ticker: "BTC-USD", weight:  2, change:  0.09, price: 67420.00, type: "crypto" },
];

const TOTAL_VALUE       = 45_230.48;
const DAILY_CHANGE_PCT  = 1.37;
const DAILY_CHANGE_EUR  = 612.14;

// ── Sparkline helpers ───────────────────────────────────────────────────────────

function seededRand(seed: number) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

function genSparkline(seed: number, pts = 20, trend = 0.008): number[] {
  const r = seededRand(seed);
  let v = 0.4;
  return Array.from({ length: pts }, () => {
    v += trend + (r() - 0.48) * 0.07;
    v = Math.max(0.05, Math.min(0.95, v));
    return v;
  });
}

const portfolioCurve = genSparkline(42, 56, 0.007);

const sparks: Record<string, number[]> = {};
ASSETS.forEach((a, i) => {
  sparks[a.ticker] = genSparkline(i * 37 + 11, 20, a.change >= 0 ? 0.010 : -0.010);
});

const sorted       = [...ASSETS].sort((a, b) => b.change - a.change);
const topList      = sorted.slice(0, 5);
const worstList    = sorted.slice(-4).reverse();

// ── Sparkline component ────────────────────────────────────────────────────────

function Sparkline({ pts, color, w = 56, h = 20, glow = false }: {
  pts: number[]; color: string; w?: number; h?: number; glow?: boolean;
}) {
  const n   = pts.length;
  const min = Math.min(...pts), max = Math.max(...pts);
  const rng = max - min || 0.01;
  const x   = (i: number) => (i / (n - 1)) * w;
  const y   = (v: number) => h - ((v - min) / rng) * (h - 2) - 1;
  const d   = pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const uid = `sp-${color.replace(/\W/g, "")}-${w}-${h}`;
  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "visible", flexShrink: 0 }}>
      <defs>
        <linearGradient id={uid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={`url(#${uid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth={glow ? 1.5 : 1.2}
        strokeLinecap="round" strokeLinejoin="round"
        style={glow ? { filter: `drop-shadow(0 0 4px ${color}88)` } : {}} />
    </svg>
  );
}

// ── Reusable card surface ──────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
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

function SectionLabel({ children }: { children: React.ReactNode }) {
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TestPage() {
  const [period,  setPeriod]  = useState<Period>("1J");
  const [mounted, setMounted] = useState(false);

  useEffect(() => { const t = setTimeout(() => setMounted(true), 60); return () => clearTimeout(t); }, []);

  const anim = (delay: number): React.CSSProperties => ({
    opacity:    mounted ? 1 : 0,
    transform:  mounted ? "translateY(0)" : "translateY(10px)",
    transition: `opacity 460ms ease ${delay}ms, transform 460ms ease ${delay}ms`,
  });

  const perfColor = DAILY_CHANGE_PCT >= 0 ? "#4ade80" : "#f87171";

  return (
    <div style={{
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      background: "#040F22",
      fontFamily: FONT,
      color: "rgba(255,255,255,0.90)",
      paddingTop: 56,
      boxSizing: "border-box",
      overflow: "hidden",
    }}>

      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <header style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 20px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        flexShrink: 0,
        ...anim(0),
      }}>
        {/* Gauche: nom du portfolio */}
        <div>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", margin: 0, letterSpacing: "0.06em", fontWeight: 600 }}>PORTEFEUILLE</p>
          <p style={{ fontSize: 16, fontWeight: 700, margin: "2px 0 0", color: "#fff" }}>test 2</p>
        </div>

        {/* Centre: valeur totale */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em", fontFamily: FONT_MONO, lineHeight: 1 }}>
            {TOTAL_VALUE.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
          </div>
          <div style={{ marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: perfColor, fontFamily: FONT_MONO }}>
              +{DAILY_CHANGE_PCT.toFixed(2)}%
            </span>
            <span style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,0.20)", display: "inline-block" }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.45)", fontFamily: FONT_MONO }}>
              +{DAILY_CHANGE_EUR.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} € sur 24h
            </span>
          </div>
        </div>

        {/* Droite: sélecteur période */}
        <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.05)", borderRadius: 9, padding: 3, border: "1px solid rgba(255,255,255,0.07)" }}>
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: "5px 13px", borderRadius: 7, border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: 600, fontFamily: FONT,
              background: period === p ? "rgba(255,255,255,0.11)" : "transparent",
              color: period === p ? "#fff" : "rgba(255,255,255,0.35)",
              transition: "all 160ms ease",
              boxShadow: period === p ? "inset 0 1px 0 rgba(255,255,255,0.10)" : "none",
            }}>
              {p}
            </button>
          ))}
        </div>
      </header>

      {/* ── MAIN ───────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 10, padding: "10px 12px 0", overflow: "hidden" }}>

        {/* Treemap */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, ...anim(80) }}>
          <LiquidGlassTreemap assets={ASSETS} />
        </div>

        {/* Sidebar droite */}
        <div style={{
          width: 236, flexShrink: 0,
          display: "flex", flexDirection: "column", gap: 8,
          overflow: "hidden",
          ...anim(160),
        }}>

          {/* Portfolio curve */}
          <Card style={{ padding: "13px 14px 10px", flexShrink: 0 }}>
            <SectionLabel>PERFORMANCE PORTFOLIO · {period}</SectionLabel>
            <Sparkline pts={portfolioCurve} color="#5B8DEF" w={206} h={54} glow />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.20)", fontFamily: FONT_MONO }}>00:00</span>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.20)", fontFamily: FONT_MONO }}>24:00</span>
            </div>
          </Card>

          {/* Top performers */}
          <Card style={{ padding: "12px 14px", flexShrink: 0 }}>
            <SectionLabel>TOP PERFORMERS</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {topList.map(a => (
                <div key={a.ticker} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <AssetLogo ticker={a.ticker} type={a.type} size={22} radius={5}
                    fallbackBg="rgba(74,222,128,0.12)" fallbackBorder="rgba(74,222,128,0.25)" fallbackTextColor="#4ade80" />
                  <span style={{ fontSize: 12, fontWeight: 600, flex: 1, color: "rgba(255,255,255,0.78)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.ticker}
                  </span>
                  <Sparkline pts={sparks[a.ticker]} color="#4ade80" w={40} h={16} />
                  <span style={{ fontSize: 11, fontWeight: 700, fontFamily: FONT_MONO, color: "#4ade80", minWidth: 46, textAlign: "right" }}>
                    +{a.change.toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* Worst performers */}
          <Card style={{ padding: "12px 14px", flexShrink: 0 }}>
            <SectionLabel>MOINS BONS</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {worstList.map(a => (
                <div key={a.ticker} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <AssetLogo ticker={a.ticker} type={a.type} size={22} radius={5}
                    fallbackBg="rgba(248,113,113,0.12)" fallbackBorder="rgba(248,113,113,0.25)" fallbackTextColor="#f87171" />
                  <span style={{ fontSize: 12, fontWeight: 600, flex: 1, color: "rgba(255,255,255,0.78)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.ticker}
                  </span>
                  <Sparkline pts={sparks[a.ticker]} color="#f87171" w={40} h={16} />
                  <span style={{ fontSize: 11, fontWeight: 700, fontFamily: FONT_MONO, color: "#f87171", minWidth: 46, textAlign: "right" }}>
                    {a.change.toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* Exposition */}
          <Card style={{ padding: "12px 14px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <SectionLabel>EXPOSITION SECTEUR</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, justifyContent: "center" }}>
              {[
                { label: "Actions",  pct: 88, color: "#5B8DEF" },
                { label: "Crypto",   pct: 12, color: "#F0B429" },
              ].map(row => (
                <div key={row.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{row.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, fontFamily: FONT_MONO, color: row.color }}>{row.pct}%</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.07)" }}>
                    <div style={{ height: "100%", width: `${row.pct}%`, borderRadius: 2, background: row.color, opacity: 0.80 }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* ── BOTTOM KPI ROW ─────────────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 8,
        padding: "8px 12px 10px",
        flexShrink: 0,
        ...anim(260),
      }}>
        {[
          {
            label: "VALEUR TOTALE",
            value: "45 230,48 €",
            sub: "Portefeuille global",
            color: "#FFFFFF",
          },
          {
            label: "PERFORMANCE 24H",
            value: "+1,37%",
            sub: "+612,14 € aujourd'hui",
            color: "#4ade80",
          },
          {
            label: "SHARPE RATIO",
            value: "1,82",
            sub: "Bon · base 12 mois",
            color: "#5B8DEF",
          },
          {
            label: "VOLATILITÉ 30J",
            value: "12,4%",
            sub: "Faible · vs marché 18%",
            color: "#F0B429",
          },
        ].map(kpi => (
          <Card key={kpi.label} style={{ padding: "11px 16px", display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", color: "rgba(255,255,255,0.25)", fontFamily: FONT }}>
              {kpi.label}
            </span>
            <span style={{ fontSize: 22, fontWeight: 800, fontFamily: FONT_MONO, color: kpi.color, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              {kpi.value}
            </span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.30)", fontFamily: FONT }}>
              {kpi.sub}
            </span>
          </Card>
        ))}
      </div>
    </div>
  );
}
