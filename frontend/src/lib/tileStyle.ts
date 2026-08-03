import { BRAND_COLORS } from "@/lib/assets";
import { pourFondSombre } from "@/lib/couleur";

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? [parseInt(r[1],16), parseInt(r[2],16), parseInt(r[3],16)] : [91,141,239];
}

export function brandRgb(ticker: string): RGB {
  // La table passe par la même mise au net que les couleurs extraites d'un
  // logo : quelques teintes de marque sont trop sombres pour un fond noir, et
  // rien ne justifie de les traiter autrement.
  const hex = BRAND_COLORS[ticker];
  if (hex) return hexToRgb(pourFondSombre(hex));
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
 * asset's logo. C'est le seul paramètre qui varie d'un appelant à l'autre.
 *
 * Il y a eu un paramètre d'intensité, que la carte de portefeuille réglait à
 * moitié parce que ses tuiles couvrent cinq fois l'aire d'une carte d'actif et
 * paraissaient plus opaques à alpha égal. Retiré : la consigne est que les deux
 * rendent exactement la même surface, et un réglage qui les distingue ne peut
 * que les faire diverger de nouveau. Seuls le contenu et la taille changent.
 */
export function tileSurface(ticker: string, radius = 18, colorHex?: string): {
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
  /** Alpha sur deux chiffres hexadécimaux. */
  const a = (v: number) => Math.round(Math.min(255, Math.max(0, v)))
    .toString(16).padStart(2, "0");
  return {
    borderRadius: radius,
    // Deux lavis d'angle de pleine amplitude — l'aspect voulu, avec sa
    // profondeur.
    //
    // Sur un fond sombre l'œil résout un niveau sur 255, et ces lavis en
    // traversent quatre-vingt-huit : autant de frontières possibles, que l'on
    // voyait en anneaux. Deux leviers existent contre cela, et ils s'excluent.
    //
    // Réduire l'amplitude les supprime par construction — un dégradé ne peut
    // pas montrer plus de marches qu'il ne traverse de niveaux — mais aplatit
    // l'aspect au passage. Essayé : lisse, et sans relief.
    //
    // Trames par-dessus, la pleine amplitude est conservée. C'est la voie
    // choisie ici, et le tramage vit dans globals.css. Toute la difficulté
    // tient à la finesse de son grain : voir le commentaire là-bas.
    background: [
      // Spéculaire : l'éclat qui dit « verre ».
      //
      // Sa position vient de --tile-mx / --tile-my, que trackSpecular() met à
      // jour au passage du curseur ; par défaut il se pose en haut à gauche,
      // là où les lavis sont les plus clairs, donc l'absence de JS ne se voit
      // pas. Petit et contrasté, à l'inverse des lavis — c'est ce qui le rend
      // sûr : un dégradé de 180 px ne traverse pas assez de surface pour que
      // ses paliers se lisent en anneaux.
      `radial-gradient(circle 180px at var(--tile-mx, 18%) var(--tile-my, 8%), rgba(255,255,255,0.085) 0%, rgba(255,255,255,0.035) 42%, rgba(255,255,255,0) 72%)`,
      `radial-gradient(ellipse 260% 300% at 0% 0%, ${c}${a(88)} 0%, ${c}${a(77)} 18%, ${c}${a(59)} 36%, ${c}${a(41)} 54%, ${c}${a(23)} 72%, ${c}${a(10)} 88%, ${c}00 100%)`,
      `radial-gradient(ellipse 260% 300% at 100% 100%, ${c}${a(76)} 0%, ${c}${a(66)} 18%, ${c}${a(51)} 36%, ${c}${a(35)} 54%, ${c}${a(20)} 72%, ${c}${a(9)} 88%, ${c}00 100%)`,
      // Assombrissement de fond, volontairement plus léger qu'avant : la tuile
      // laisse davantage passer ce qu'il y a derrière.
      "rgba(2,10,24,0.38)",
    ].join(", "),
    backdropFilter: "blur(24px) saturate(1.6) brightness(1.06)",
    WebkitBackdropFilter: "blur(24px) saturate(1.6) brightness(1.06)",
    border: "none",
    boxShadow: `0 14px 44px rgba(0,0,0,0.28), 0 0 28px ${c}10`,
    overflow: "hidden",
    boxSizing: "border-box",
  };
}

/**
 * Déplace le spéculaire d'une tuile sous le curseur.
 *
 * À brancher sur onPointerMove, et son pendant releaseSpecular() sur
 * onPointerLeave pour que l'éclat revienne à sa position de repos plutôt que
 * de rester figé là où la souris est sortie.
 *
 * Écrit deux propriétés personnalisées sur l'élément, sans état React ni
 * rendu : un pointermove est fréquent, et un re-rendu par mouvement sur
 * plusieurs tuiles coûterait bien plus que l'effet ne vaut.
 */
export function trackSpecular(e: { currentTarget: HTMLElement; clientX: number; clientY: number }): void {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  el.style.setProperty("--tile-mx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
  el.style.setProperty("--tile-my", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
}

/** Rend le spéculaire à sa position de repos. */
export function releaseSpecular(e: { currentTarget: HTMLElement }): void {
  e.currentTarget.style.removeProperty("--tile-mx");
  e.currentTarget.style.removeProperty("--tile-my");
}
