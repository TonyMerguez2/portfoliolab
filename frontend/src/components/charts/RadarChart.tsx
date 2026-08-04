"use client";
import { FONT } from "@/lib/typography";
import { JETONS } from "@/lib/palette";

/**
 * Radar de facteurs, sur une échelle de 0 à 100.
 *
 * Extrait de la page portefeuille pour être partagé avec l'onglet Analyse :
 * deux radars écrits séparément auraient fini par diverger de graduation, et
 * l'un des deux aurait menti sur l'autre.
 *
 * Tout était écrit en blanc translucide et en bleu #5B8DEF, l'ancien accent.
 * En thème clair la toile et les six intitulés disparaissaient : il ne restait
 * qu'un polygone flottant sans axes ni noms — un graphique qui ne se lit plus.
 */

/** La toile de fond : l'encre du thème, assez faible pour rester une trame. */
const TOILE = "rgba(var(--nv-encre-rvb), 0.07)";
export default function RadarChart({ metrics, size = 170 }: { metrics: { label: string; value: number }[]; size?: number }) {
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
          fill="none" stroke={TOILE} strokeWidth={1} />
      ))}
      {metrics.map((_, i) => { const p = axis(i); return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={TOILE} strokeWidth={1} />; })}
      <polygon points={poly} fill={JETONS.accentDoux} stroke={JETONS.accent} strokeWidth={1.5} strokeLinejoin="round" />
      {metrics.map((m, i) => {
        const p = axis(i, 1.22);
        return (
          <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
            fill={JETONS.texteAttenue} fontSize={8.5} fontFamily={FONT}>{m.label}</text>
        );
      })}
    </svg>
  );
}
