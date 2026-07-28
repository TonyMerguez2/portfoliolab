import { BRAND_COLORS } from "@/lib/assets";

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? [parseInt(r[1],16), parseInt(r[2],16), parseInt(r[3],16)] : [91,141,239];
}

export function brandRgb(ticker: string): RGB {
  const hex = BRAND_COLORS[ticker];
  if (hex) return hexToRgb(hex);
  let h = 2166136261;
  for (let i = 0; i < ticker.length; i++) { h ^= ticker.charCodeAt(i); h = Math.imul(h, 16777619); }
  h = h >>> 0;
  return [100 + (h & 0x7F), 100 + ((h >> 8) & 0x7F), 140 + ((h >> 16) & 0x5F)];
}

export function tileData(ticker: string): {
  glassBg: string; borderGrad: string;
  rgb: RGB;
  b1cx: number; b1cy: number;
  b2cx: number; b2cy: number;
} {
  const [r, g, b] = brandRgb(ticker);

  let h = 2166136261;
  for (let i = 0; i < ticker.length; i++) { h ^= ticker.charCodeAt(i); h = Math.imul(h, 16777619); }
  h = h >>> 0;

  const b1cx = -5  + (h        & 0x0F);
  const b1cy = -5  + ((h >> 4) & 0x0F);
  const b2cx = 105 - ((h >> 8)  & 0x0F);
  const b2cy = 105 - ((h >> 12) & 0x0F);

  const shine      = "linear-gradient(160deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 35%)";
  const glass      = `rgba(${Math.round(r*0.14)},${Math.round(g*0.10)},${Math.round(b*0.10)},0.82)`;
  const glassBg    = `${shine}, ${glass}`;
  const borderGrad = `linear-gradient(135deg,
    rgba(255,255,255,0.55) 0%,
    rgba(${r},${g},${b},0.50) 5%,
    rgba(${r},${g},${b},0.15) 42%,
    rgba(0,0,0,0.08) 58%,
    rgba(${r},${g},${b},0.20) 88%,
    rgba(255,255,255,0.35) 95%,
    rgba(${r},${g},${b},0.45) 100%
  )`;

  return { glassBg, borderGrad, rgb: [r, g, b], b1cx, b1cy, b2cx, b2cy };
}

/** Brand colour as a hex string, for the `#RRGGBBAA` washes below. */
export function brandHex(ticker: string): string {
  const [r, g, b] = brandRgb(ticker);
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The tile surface, as the asset cards render it.
 *
 * Two corner washes of the brand colour, a diagonal veil, and a near-black
 * base. No drawn border: the edge is the wash fading out. Lifted by a soft
 * drop shadow and the faintest coloured halo.
 *
 * It lives here because it was written inline on the chart page and copied
 * nowhere. The portfolio map had meanwhile grown its own look — radial glow
 * blobs, an extra SVG edge stroke, a radius derived from the tile size — while
 * both were called the same tile. Callers add position, size and hover on top;
 * the surface itself belongs here so the two cannot drift again.
 *
 * `colorHex` overrides the brand colour, for pages that extract one from the
 * asset's logo.
 *
 * `intensity` scales the tint and the darkening together. It exists because a
 * given alpha does not make the same impression at every size: on a banner of
 * 554×79 it reads as a coloured card, on a tile of 790×367 the same value
 * covers five times the area and reads as opaque, glass gone. One value cannot
 * serve both. The default keeps the asset cards exactly as they were; the
 * portfolio map halves it.
 */
export function tileSurface(ticker: string, radius = 18, colorHex?: string, intensity = 1): {
  borderRadius: number;
  background: string;
  backdropFilter: string;
  WebkitBackdropFilter: string;
  border: string;
  boxShadow: string;
  overflow: "hidden";
  boxSizing: "border-box";
} {
  const c = colorHex ?? brandHex(ticker);
  /** Alpha as two hex digits, scaled by the surface's intensity. */
  const a = (v: number) => Math.round(Math.min(255, Math.max(0, v * intensity)))
    .toString(16).padStart(2, "0");
  return {
    borderRadius: radius,
    // Two corner washes, as the asset cards have always had them.
    //
    // Swapping them for a single linear gradient did remove the ridge where two
    // radials meet — and replaced it with straight bands, because the real
    // defect is neither shape but the quantisation underneath. On a dark
    // surface the eye resolves a single level out of 255, so any wide, gentle
    // gradient bands whatever its geometry. The answer is the dither layer in
    // globals.css, not the choice of curve.
    background: [
      `radial-gradient(ellipse 260% 300% at 0% 0%, ${c}${a(88)} 0%, ${c}${a(77)} 18%, ${c}${a(59)} 36%, ${c}${a(41)} 54%, ${c}${a(23)} 72%, ${c}${a(10)} 88%, ${c}00 100%)`,
      `radial-gradient(ellipse 260% 300% at 100% 100%, ${c}${a(76)} 0%, ${c}${a(66)} 18%, ${c}${a(51)} 36%, ${c}${a(35)} 54%, ${c}${a(20)} 72%, ${c}${a(9)} 88%, ${c}00 100%)`,
      `rgba(2,10,24,${(0.46 * intensity).toFixed(3)})`,
    ].join(", "),
    backdropFilter: "blur(24px) saturate(1.6) brightness(1.06)",
    WebkitBackdropFilter: "blur(24px) saturate(1.6) brightness(1.06)",
    border: "none",
    boxShadow: `0 14px 44px rgba(0,0,0,0.28), 0 0 28px ${c}10`,
    overflow: "hidden",
    boxSizing: "border-box",
  };
}
