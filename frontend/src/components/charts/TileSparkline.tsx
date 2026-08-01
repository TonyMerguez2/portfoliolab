"use client";
import { useEffect, useRef } from "react";

/**
 * Sparkline des tuiles d'actif.
 *
 * Extraite de LiquidGlassTreemap pour que la grille de la page portefeuille et
 * la treemap tracent la même courbe : deux implémentations auraient divergé au
 * premier ajustement, et la même valeur se serait lue différemment selon la vue.
 *
 * Le halo se déclenche impérativement par `beginElement()` plutôt que par une
 * animation en boucle : il ne doit pulser qu'au moment où le prix change.
 */
export function TileSparkline({ pts, color, w, h, updatedAt }: { pts: number[]; color: string; w: number; h: number; updatedAt?: number }) {
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

export default TileSparkline;
