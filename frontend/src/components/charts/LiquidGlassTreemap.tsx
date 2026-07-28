"use client";
import { useRef, useEffect, useState, useMemo } from "react";
import * as d3 from "d3";
import AssetLogo from "@/components/AssetLogo";
import { tileData, tileSurface, brandHex, brandRgb, hexToRgb } from "@/lib/tileStyle";
import type { RGB } from "@/lib/tileStyle";

type AssetItem = { ticker: string; weight: number; change: number | null; type?: string; price?: number | null; spark?: number[]; updatedAt?: number; value?: number | null; perfEur?: number | null };

const DEMO_ASSETS: AssetItem[] = [
  { ticker: "CW8",   weight: 23, change:  0.0 },
  { ticker: "GOOGL", weight: 19, change:  4.1 },
  { ticker: "SPY",   weight: 15, change:  1.2 },
  { ticker: "NVDA",  weight: 12, change:  3.2 },
  { ticker: "HRMS",  weight: 11, change: -1.8 },
  { ticker: "GOLD",  weight: 10, change:  0.8 },
  { ticker: "XSX6",  weight: 10, change: -0.9 },
];

const GAP    = 6;


function TileSparkline({ pts, color, w, h, updatedAt }: { pts: number[]; color: string; w: number; h: number; updatedAt?: number }) {
  const animR   = useRef<SVGAnimateElement>(null);
  const animO   = useRef<SVGAnimateElement>(null);

  useEffect(() => {
    if (!updatedAt) return;
    try {
      animR.current?.beginElement();
      animO.current?.beginElement();
    } catch (_) {}
  }, [updatedAt]);

  const n = pts.length;
  const min = Math.min(...pts), max = Math.max(...pts);
  const rng = max - min || 0.01;
  const sx = (i: number) => (i / (n - 1)) * w;
  const sy = (v: number) => h - ((v - min) / rng) * (h - 4) - 2;
  const d  = pts.map((v, i) => `${i === 0 ? "M" : "L"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(" ");
  const maskId = `tsm-${w}-${h}`;
  const ex = sx(n - 1), ey = sy(pts[n - 1]);

  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={maskId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%"   stopColor="white" stopOpacity="0" />
          <stop offset="28%"  stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="1" />
        </linearGradient>
        <mask id={`m-${maskId}`}>
          <rect x="0" y="0" width={w} height={h} fill={`url(#${maskId})`} />
        </mask>
      </defs>
      {/* Glow large + trait fin */}
      <path d={d} fill="none" stroke={color} strokeWidth="5" opacity="0.12"
        strokeLinecap="round" strokeLinejoin="round"
        mask={`url(#m-${maskId})`} style={{ filter: "blur(3px)" }} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.4"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.70"
        mask={`url(#m-${maskId})`} />
      {/* Dot fixe */}
      <circle cx={ex} cy={ey} r="2.2" fill={color} opacity="0.95" />
      {/* Halo : begin="indefinite" + beginElement() impératif au changement de prix */}
      <circle cx={ex} cy={ey} r="2.2" fill="none" stroke={color} strokeWidth="1.2" opacity="0">
        <animate ref={animR} attributeName="r"       begin="indefinite" values="2.2;11;11" dur="1.4s" repeatCount="1" />
        <animate ref={animO} attributeName="opacity" begin="indefinite" values="0.85;0;0"  dur="1.4s" repeatCount="1" />
      </circle>
    </svg>
  );
}

function FlipValue({ value, style }: { value: string; style?: React.CSSProperties }) {
  const [current, setCurrent] = useState(value);
  const [visible, setVisible]  = useState(true);
  useEffect(() => {
    if (value === current) return;
    setVisible(false);
    const t = setTimeout(() => { setCurrent(value); setVisible(true); }, 150);
    return () => clearTimeout(t);
  }, [value]); // eslint-disable-line
  return (
    <span style={{
      ...style,
      display: "inline-block",
      opacity:    visible ? 1 : 0,
      transform:  visible ? "translateY(0px)" : "translateY(4px)",
      transition: "opacity 150ms ease, transform 150ms ease",
    }}>
      {current}
    </span>
  );
}

type Tier = "full" | "compact" | "mini";
function getTier(w: number, h: number, weight = 0): Tier {
  // Assets à fort poids méritent le full tier même dans des tuiles légèrement plus petites
  const boost = weight >= 6 ? 18 : weight >= 4 ? 8 : 0;
  if (w > 145 - boost && h > 88 - boost) return "full";
  if (Math.min(w, h) > 56) return "compact";
  return "mini";
}

const FONT      = "'Inter', 'SF Pro Display', system-ui, sans-serif";
const FONT_MONO = "'SF Mono', 'Fira Code', monospace";

const TILE_ANIM = `
@keyframes tileIn {
  from { opacity: 0; transform: scale(0.90) translateZ(0); }
  to   { opacity: 1; transform: scale(1)    translateZ(0); }
}
`;

interface Props {
  assets?: AssetItem[];
  onAssetClick?: (ticker: string) => void;
}

export default function LiquidGlassTreemap({ assets: propAssets, onAssetClick }: Props = {}) {
  const containerRef              = useRef<HTMLDivElement>(null);
  const [size, setSize]           = useState({ w: 800, h: 600 });
  const [hovered, setHovered]     = useState<string | null>(null);
  const [miniPop, setMiniPop]     = useState<{ asset: AssetItem; x: number; y: number; w: number; h: number } | null>(null);

  const assets = propAssets && propAssets.length > 0 ? propAssets : DEMO_ASSETS;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setSize({ w: Math.floor(el.clientWidth), h: Math.floor(el.clientHeight) });
    const ro = new ResizeObserver(([e]) =>
      setSize({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) })
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tiles = useMemo(() => {
    if (size.w < 10 || size.h < 10) return [];
    const root = d3
      .hierarchy<any>({ children: assets })
      .sum((d) => d.weight ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    d3.treemap<any>()
      .size([size.w, size.h])
      .paddingInner(GAP)
      .paddingOuter(GAP)
      .tile(d3.treemapSquarify)(root);
    return root.leaves() as d3.HierarchyRectangularNode<any>[];
  }, [size, assets]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%", height: "100%", position: "relative",
        background: [
          "radial-gradient(ellipse 60% 50% at 25% 30%, rgba(80,120,255,0.09) 0%, transparent 100%)",
          "radial-gradient(ellipse 55% 60% at 75% 65%, rgba(60,200,100,0.06) 0%, transparent 100%)",
          "radial-gradient(ellipse 50% 45% at 55% 20%, rgba(200,100,255,0.05) 0%, transparent 100%)",
          "#040F22",
        ].join(", "),
      }}
    >
      <style>{TILE_ANIM}</style>
      {/* Popover pour tuiles mini */}
      {miniPop && (() => {
        const { asset: a, x: px, y: py, w: pw, h: ph } = miniPop;
        const [pr, pg, pb] = brandRgb(a.ticker);
        const chg = a.change ?? 0;
        const chgColor = chg >= 0 ? "#4ade80" : "#f87171";
        const chgStr = `${chg >= 0 ? "▲" : "▼"} ${Math.abs(chg).toFixed(2)}%`;
        const popW = 150;
        const left = Math.min(px, size.w - popW - 8);
        const top  = py - 100 < 0 ? py + ph + 8 : py - 96;
        return (
          <div style={{
            position: "absolute", left, top, width: popW, zIndex: 100,
            background: `rgba(${Math.round(pr*0.14)},${Math.round(pg*0.10)},${Math.round(pb*0.10)},0.94)`,
            backdropFilter: "blur(24px) saturate(1.8)",
            WebkitBackdropFilter: "blur(24px) saturate(1.8)",
            borderRadius: 12,
            border: `1px solid rgba(${pr},${pg},${pb},0.35)`,
            boxShadow: `0 8px 28px rgba(0,0,0,0.50), 0 0 0 1px rgba(${pr},${pg},${pb},0.15)`,
            padding: "10px 12px",
            pointerEvents: "none",
            display: "flex", flexDirection: "column", gap: 4,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <AssetLogo ticker={a.ticker} type={a.type} size={22} radius={5}
                fallbackBg={`rgba(${pr},${pg},${pb},0.18)`}
                fallbackBorder={`rgba(${pr},${pg},${pb},0.35)`}
                fallbackTextColor="#F8F9FC" bare/>
              <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.92)", fontFamily: FONT }}>{a.ticker}</span>
              <span style={{
                fontSize: 10, fontWeight: 600, fontFamily: FONT_MONO,
                color: "rgba(255,255,255,0.65)",
                background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 4, padding: "1px 4px", marginLeft: "auto",
              }}>{a.weight}%</span>
            </div>
            {/* Valeur portefeuille ou prix unitaire */}
            {(a.value != null || a.price != null) && (
              <span style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.92)", fontFamily: FONT_MONO }}>
                {a.value != null
                  ? a.value.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €"
                  : a.price!.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"}
              </span>
            )}
            {/* Perf % + perf € */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: chgColor, fontFamily: FONT_MONO }}>{chgStr}</span>
              {a.perfEur != null && (
                <span style={{ fontSize: 11, fontWeight: 600, color: chgColor, fontFamily: FONT_MONO, opacity: 0.72 }}>
                  {`${a.perfEur >= 0 ? "+" : ""}${Math.round(a.perfEur).toLocaleString("fr-FR")} €`}
                </span>
              )}
            </div>
            {/* Prix unitaire en secondaire si valeur dispo */}
            {a.value != null && a.price != null && (
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.30)", fontFamily: FONT_MONO }}>
                {a.price.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </span>
            )}
          </div>
        );
      })()}
      {tiles.map((node, idx) => {
        const asset  = node.data as AssetItem;
        const change = asset.change ?? 0;
        const x = node.x0, y = node.y0;
        const w = node.x1 - node.x0, h = node.y1 - node.y0;
        const tier   = getTier(w, h, asset.weight);
        const isHov  = hovered === asset.ticker;

        // Only the brand colour is needed here now; the surface itself comes
        // from tileSurface, and the glow blobs are gone.
        const [cr, cg, cb] = tileData(asset.ticker).rgb;
        const changeColor  = change >= 0 ? "#4ade80" : "#f87171";
        const triangle     = change >= 0 ? "▲" : "▼";
        const changeStr    = `${triangle} ${Math.abs(change).toFixed(2)}%`;

        // Same radius as the asset cards, not one derived from the tile size:
        // the point of these tiles is to read as the same object across pages.
        const tileRadius = 18;

        // Half intensity: these tiles are several times the area of an asset card,
        // where the same alpha stops reading as glass.
        const surface = tileSurface(asset.ticker, tileRadius, undefined, 0.5);

        const baseStyle: React.CSSProperties = {
          ...surface,
          position:             "absolute",
          left: x, top: y, width: w, height: h,
          // The .novac-tile edge is painted from currentColor, so the brand
          // colour has to be set here for the border to pick it up.
          color:                brandHex(asset.ticker),
          // Hover lifts the tile; the surface underneath stays the one above.
          ...(isHov ? {
            backdropFilter:       "blur(26px) saturate(1.75) brightness(1.10)",
            WebkitBackdropFilter: "blur(26px) saturate(1.75) brightness(1.10)",
            boxShadow: `0 20px 48px rgba(0,0,0,0.65), 0 8px 20px rgba(${cr},${cg},${cb},0.32), ${surface.boxShadow}`,
          } : {}),
          transform:            isHov ? "scale(1.07) translateY(-6px) translateZ(0)" : "scale(1) translateY(0) translateZ(0)",
          zIndex:               isHov ? 10 : 1,
          transition:           "box-shadow 200ms ease, transform 200ms cubic-bezier(0.34,1.4,0.64,1), backdrop-filter 200ms ease, z-index 0ms",
          cursor:               "pointer",
          animationName:        "tileIn",
          animationDuration:    "300ms",
          animationDelay:       `${idx * 35}ms`,
          animationFillMode:    "both",
          animationTimingFunction: "cubic-bezier(0.34,1.4,0.64,1)",
        };

        // Neither a coloured glow nor a second edge stroke: the asset cards
        // have neither, and these tiles are meant to read as the same object
        // across pages. tileSurface carries the whole surface, edge included.

        // Bloc perf réutilisable : triangle plus grand + % semi-bold + perf€
        const perfBlock = (perfFs: number, gap = 6) => (
          <div style={{ display: "flex", alignItems: "baseline", gap }}>
            <span style={{ fontSize: perfFs * 1.18, fontWeight: 800, color: changeColor,
              fontFamily: FONT_MONO, lineHeight: 1 }}>
              {triangle}
            </span>
            <FlipValue
              value={`${Math.abs(change).toFixed(2)}%`}
              style={{ fontSize: perfFs, fontWeight: 600, color: changeColor,
                fontFamily: FONT_MONO, letterSpacing: "0.01em" }}
            />
            {asset.perfEur != null && (
              <FlipValue
                value={`${asset.perfEur >= 0 ? "+" : ""}${Math.round(asset.perfEur).toLocaleString("fr-FR")} €`}
                style={{ fontSize: Math.max(perfFs * 0.68, 9), fontWeight: 600,
                  color: changeColor, fontFamily: FONT_MONO, opacity: 0.80 }}
              />
            )}
          </div>
        );

        // Formattage prix adaptatif : 0 décimales au-dessus de 10k, 1 en dessous de 100, sinon 2
        const fmtPrice = (p: number) => {
          if (p >= 10000) return p.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";
          if (p >= 100)   return p.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " €";
          return p.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
        };

        // FULL tier — toutes les tailles basées sur sqrt(w*h) : reflète l'aire réelle, indépendant de l'orientation
        if (tier === "full") {
          const scale    = Math.sqrt(w * h);
          const minDim   = Math.min(w, h);
          const logoSize = Math.min(110, Math.max(24, scale * 0.155));
          const tickerFs = Math.min(52, Math.max(12, scale * 0.076));
          const weightFs = Math.max(10, tickerFs * 0.58);
          const perfFs   = Math.min(48, Math.max(10, scale * 0.067));
          const valFs    = Math.min(54, Math.max(12, scale * 0.080));
          const pad      = Math.min(36, Math.max(14, minDim * 0.065));
          const headerGap = Math.min(18, Math.max(8, logoSize * 0.18));
          const showSpark = asset.spark && asset.spark.length > 1 && h > 105;
          const spW = Math.min(Math.round(w * 0.50), 320);
          const spH = Math.min(Math.round(h * 0.35), 130);
          return (
            <div key={asset.ticker}
              className="novac-tile"
              style={{ ...baseStyle, display: "flex", flexDirection: "column", padding: pad }}
              onMouseEnter={() => setHovered(asset.ticker)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onAssetClick?.(asset.ticker)}
            >
              {showSpark && (
                <div style={{
                  position: "absolute",
                  right: Math.round(w * 0.05),
                  top: "42%", transform: "translateY(-50%)",
                  width: spW, height: spH,
                  pointerEvents: "none", opacity: 0.65,
                }}>
                  <TileSparkline pts={asset.spark!} color={changeColor} w={spW} h={spH} updatedAt={asset.updatedAt} />
                </div>
              )}
              {/* Header */}
              <div style={{ position: "relative", display: "flex", alignItems: "center", gap: headerGap }}>
                <AssetLogo ticker={asset.ticker} type={asset.type} size={logoSize} radius={Math.round(logoSize * 0.22)}
                  fallbackBg={`rgba(${cr},${cg},${cb},0.18)`}
                  fallbackBorder={`rgba(${cr},${cg},${cb},0.35)`}
                  fallbackTextColor="#F8F9FC" bare/>
                <div style={{ display: "flex", flexDirection: "column", gap: Math.max(2, tickerFs * 0.12), minWidth: 0 }}>
                  <span style={{
                    fontSize: tickerFs, fontWeight: 700, lineHeight: 1,
                    color: "rgba(255,255,255,0.93)", fontFamily: FONT,
                    letterSpacing: "-0.01em",
                    textShadow: "0 1px 2px rgba(0,0,0,0.30)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {asset.ticker}
                  </span>
                  <span style={{ fontSize: weightFs, fontWeight: 700, lineHeight: 1, color: "rgba(255,255,255,0.50)", fontFamily: FONT_MONO }}>
                    {asset.weight}%
                  </span>
                </div>
              </div>
              {/* Bloc valeur + perf */}
              <div style={{ position: "relative", marginTop: "auto", display: "flex", flexDirection: "column", gap: Math.max(2, perfFs * 0.15) }}>
                {asset.value != null ? (
                  <FlipValue
                    value={asset.value.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €"}
                    style={{ fontSize: valFs, fontWeight: 700, color: "rgba(255,255,255,0.92)", fontFamily: FONT_MONO, letterSpacing: "0.01em" }}
                  />
                ) : asset.price != null ? (
                  <FlipValue
                    value={fmtPrice(asset.price)}
                    style={{ fontSize: valFs, fontWeight: 700, color: "rgba(255,255,255,0.82)", fontFamily: FONT_MONO, letterSpacing: "0.01em" }}
                  />
                ) : null}
                {perfBlock(perfFs)}
              </div>
            </div>
          );
        }

        // COMPACT tier — aussi basé sur sqrt(w*h)
        if (tier === "compact") {
          const narrow   = w < 95;
          const scale    = Math.sqrt(w * h);
          const pad      = Math.min(14, Math.max(7, Math.min(w, h) * 0.08));
          const logoSize = Math.min(30, Math.max(16, scale * 0.095));
          const tickerFs = Math.min(14, Math.max(9, scale * 0.052));
          const perfFs   = Math.min(13, Math.max(8, scale * 0.046));

          if (narrow) {
            const showSpark = asset.spark && asset.spark.length > 1 && h > 80;
            return (
              <div key={asset.ticker}
                className="novac-tile"
              style={{ ...baseStyle, display: "flex", flexDirection: "column", padding: pad }}
                onMouseEnter={() => setHovered(asset.ticker)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onAssetClick?.(asset.ticker)}
              >
                {showSpark && (() => {
                  const spW = Math.round(w * 0.82); const spH = Math.round(h * 0.22);
                  return (
                    <div style={{ position: "absolute", left: "50%", top: "52%", transform: "translate(-50%, -50%)", width: spW, height: spH, pointerEvents: "none", opacity: 0.40 }}>
                      <TileSparkline pts={asset.spark!} color={changeColor} w={spW} h={spH} updatedAt={asset.updatedAt} />
                    </div>
                  );
                })()}
                {/* Header */}
                <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
                  <AssetLogo ticker={asset.ticker} type={asset.type} size={logoSize} radius={Math.round(logoSize * 0.22)}
                    fallbackBg={`rgba(${cr},${cg},${cb},0.18)`} fallbackBorder={`rgba(${cr},${cg},${cb},0.35)`} fallbackTextColor="#F8F9FC" bare/>
                  <span style={{ fontSize: tickerFs, fontWeight: 700, color: "rgba(255,255,255,0.90)", fontFamily: FONT,
                    maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {asset.ticker}
                  </span>
                </div>
                {/* Valeur + perf */}
                <div style={{ position: "relative", marginTop: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
                  {(asset.value != null || asset.price != null) && (
                    <FlipValue
                      value={asset.value != null
                        ? asset.value.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €"
                        : fmtPrice(asset.price!)}
                      style={{ fontSize: Math.min(perfFs * 1.10, 17), fontWeight: 700,
                        color: "rgba(255,255,255,0.88)", fontFamily: FONT_MONO }}
                    />
                  )}
                  {perfBlock(perfFs, 4)}
                </div>
              </div>
            );
          }

          // Compact horizontal
          const showSpark = asset.spark && asset.spark.length > 1 && h > 65;
          return (
            <div key={asset.ticker}
              className="novac-tile"
              style={{ ...baseStyle, display: "flex", flexDirection: "column", padding: pad }}
              onMouseEnter={() => setHovered(asset.ticker)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onAssetClick?.(asset.ticker)}
            >
              {showSpark && (() => {
                const spW = Math.round(w * 0.38); const spH = Math.round(h * 0.28);
                return (
                  <div style={{ position: "absolute", right: Math.round(w * 0.05), top: "50%", transform: "translateY(-50%)", width: spW, height: spH, pointerEvents: "none", opacity: 0.50 }}>
                    <TileSparkline pts={asset.spark!} color={changeColor} w={spW} h={spH} updatedAt={asset.updatedAt} />
                  </div>
                );
              })()}
              {/* Header */}
              <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 7 }}>
                <AssetLogo ticker={asset.ticker} type={asset.type} size={logoSize} radius={Math.round(logoSize * 0.22)}
                  fallbackBg={`rgba(${cr},${cg},${cb},0.18)`} fallbackBorder={`rgba(${cr},${cg},${cb},0.35)`} fallbackTextColor="#F8F9FC" bare/>
                <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                  <span style={{ fontSize: tickerFs, fontWeight: 700, lineHeight: 1, color: "rgba(255,255,255,0.90)", fontFamily: FONT,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {asset.ticker}
                  </span>
                  <span style={{ fontSize: tickerFs * 0.72, fontWeight: 700, lineHeight: 1, color: "rgba(255,255,255,0.55)", fontFamily: FONT_MONO }}>
                    {asset.weight}%
                  </span>
                </div>
              </div>
              {/* Valeur + perf */}
              <div style={{ position: "relative", marginTop: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
                {(asset.value != null || asset.price != null) && (
                  <FlipValue
                    value={asset.value != null
                      ? asset.value.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €"
                      : fmtPrice(asset.price!)}
                    style={{ fontSize: Math.min(perfFs * 1.10, 17), fontWeight: 700,
                      color: "rgba(255,255,255,0.88)", fontFamily: FONT_MONO }}
                  />
                )}
                {perfBlock(perfFs, 4)}
              </div>
            </div>
          );
        }

        // MINI tier
        const minDim   = Math.min(w, h);
        const tickerFs = Math.min(11, Math.max(8, minDim * 0.12));
        const perfFs   = Math.min(10, Math.max(7, minDim * 0.10));
        return (
          <div key={asset.ticker}
            className="novac-tile"
            style={{ ...baseStyle, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 2, padding: 5 }}
            onMouseEnter={() => { setHovered(asset.ticker); setMiniPop({ asset, x, y, w, h }); }}
            onMouseLeave={() => { setHovered(null); setMiniPop(null); }}
            onClick={() => onAssetClick?.(asset.ticker)}
          >
            <span style={{
              position: "relative",
              fontSize: tickerFs, fontWeight: 700,
              color: "rgba(255,255,255,0.88)", fontFamily: FONT,
              whiteSpace: "nowrap", textAlign: "center",
              maxWidth: "100%", overflow: "hidden", textOverflow: "clip",
            }}>
              {asset.ticker}
            </span>
            <span style={{
              position: "relative",
              fontSize: perfFs, fontWeight: 600,
              color: changeColor, fontFamily: FONT_MONO,
              textAlign: "center",
            }}>
              {changeStr}
            </span>
          </div>
        );
      })}
    </div>
  );
}
