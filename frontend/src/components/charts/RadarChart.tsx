"use client";
import { FONT } from "@/lib/typography";

/**
 * Radar de facteurs, sur une échelle de 0 à 100.
 *
 * Extrait de la page portefeuille pour être partagé avec l'onglet Analyse :
 * deux radars écrits séparément auraient fini par diverger de graduation, et
 * l'un des deux aurait menti sur l'autre.
 */
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
