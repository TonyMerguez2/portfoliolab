/**
 * Découpe d'un anneau en secteurs.
 *
 * À part du composant pour la même raison que les autres modules purs : c'est
 * de la trigonométrie, elle se vérifie sans rendu, et ses cas limites (une
 * seule part, une part nulle, des poids qui ne font pas 100) sont exactement
 * ceux qui produisent des anneaux mal fermés à l'écran.
 */

export type Slice = { key: string; value: number; color: string };
export type Arc = Slice & { path: string; share: number; from: number; to: number };

/** Point du cercle, à midi pour l'angle zéro puis dans le sens horaire. */
function polar(cx: number, cy: number, r: number, angle: number) {
  const a = angle - Math.PI / 2;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/**
 * Secteurs d'un anneau, dans l'ordre reçu.
 *
 * `gap` écarte les parts de quelques degrés. L'écart est retiré au secteur, pas
 * ajouté entre eux : sinon la somme des angles dépassait le tour complet et la
 * dernière part chevauchait la première.
 */
export function donutArcs(
  slices: Slice[],
  { cx, cy, r, thickness, gap = 0.012 }: { cx: number; cy: number; r: number; thickness: number; gap?: number },
): Arc[] {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  if (total <= 0) return [];

  const inner = Math.max(0, r - thickness);
  let cursor = 0;
  const out: Arc[] = [];

  for (const s of slices) {
    const share = Math.max(0, s.value) / total;
    if (share <= 0) continue;
    const from = cursor;
    const to = cursor + share * Math.PI * 2;
    cursor = to;

    // Une part unique ferait un arc de 360° : ses deux extrémités coïncident et
    // le tracé se réduit à un point. On la dessine en deux demi-arcs.
    const full = share > 0.9999;
    const a0 = full ? from : from + gap / 2;
    const a1 = full ? to : to - gap / 2;
    if (a1 <= a0 && !full) continue;

    const large = a1 - a0 > Math.PI ? 1 : 0;
    const o0 = polar(cx, cy, r, a0), o1 = polar(cx, cy, r, a1);
    const i1 = polar(cx, cy, inner, a1), i0 = polar(cx, cy, inner, a0);

    const path = full
      ? [
          `M${o0.x.toFixed(2)},${o0.y.toFixed(2)}`,
          `A${r},${r} 0 1 1 ${polar(cx, cy, r, from + Math.PI).x.toFixed(2)},${polar(cx, cy, r, from + Math.PI).y.toFixed(2)}`,
          `A${r},${r} 0 1 1 ${o0.x.toFixed(2)},${o0.y.toFixed(2)}`,
          `M${polar(cx, cy, inner, from).x.toFixed(2)},${polar(cx, cy, inner, from).y.toFixed(2)}`,
          `A${inner},${inner} 0 1 0 ${polar(cx, cy, inner, from + Math.PI).x.toFixed(2)},${polar(cx, cy, inner, from + Math.PI).y.toFixed(2)}`,
          `A${inner},${inner} 0 1 0 ${polar(cx, cy, inner, from).x.toFixed(2)},${polar(cx, cy, inner, from).y.toFixed(2)}`,
          "Z",
        ].join(" ")
      : [
          `M${o0.x.toFixed(2)},${o0.y.toFixed(2)}`,
          `A${r},${r} 0 ${large} 1 ${o1.x.toFixed(2)},${o1.y.toFixed(2)}`,
          `L${i1.x.toFixed(2)},${i1.y.toFixed(2)}`,
          `A${inner},${inner} 0 ${large} 0 ${i0.x.toFixed(2)},${i0.y.toFixed(2)}`,
          "Z",
        ].join(" ");

    out.push({ ...s, path, share, from, to });
  }
  return out;
}

/**
 * Jauge en demi-cercle, pour un indice borné à [0, 100].
 *
 * Renvoie deux tracés : le fond complet et la portion atteinte. Le demi-cercle
 * part de la gauche (180°) et va vers la droite (0°), comme un cadran.
 */
export function gaugeArc(
  value: number,
  { cx, cy, r, thickness = 6 }: { cx: number; cy: number; r: number; thickness?: number },
): { fond: string; valeur: string } {
  const borne = Math.max(0, Math.min(100, isFinite(value) ? value : 0));
  const pt = (frac: number) => {
    const a = Math.PI - frac * Math.PI;   // 180° → 0°
    return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
  };
  const d = (from: number, to: number) => {
    const p0 = pt(from), p1 = pt(to);
    // Un arc de longueur nulle ne se trace pas : à 0, le « M » seul suffit et
    // évite un point parasite au départ du cadran.
    if (Math.abs(to - from) < 1e-6) return `M${p0.x.toFixed(2)},${p0.y.toFixed(2)}`;
    const large = to - from > 0.5 ? 1 : 0;
    return `M${p0.x.toFixed(2)},${p0.y.toFixed(2)} A${r},${r} 0 ${large} 1 ${p1.x.toFixed(2)},${p1.y.toFixed(2)}`;
  };
  void thickness;
  return { fond: d(0, 1), valeur: d(0, borne / 100) };
}
