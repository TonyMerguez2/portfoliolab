import { BRAND_COLORS } from "./assets";
import { pourFond, pourFondSombre } from "./couleur";
import { plaqueConnue, teinteConnue } from "./couleursLogos";

/* ⚠️ **Imports relatifs et non aliasés, pour que ce module soit testable.** Aucun test du
   dépôt n'atteignait jusqu'ici un module écrit en `@/…` : l'alias n'est pas résolu sous vitest,
   comme l'a montré `couleur.ts` en faisant échouer quatre fichiers d'un coup le jour où on lui
   a ajouté un import aliasé. Or la règle de couleur d'un actif est exactement ce qui doit être
   verrouillé par un test — c'est elle qui a divergé entre deux pages. */

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
 * La couleur d'un actif : une seule règle, pour toutes les cartes qui le montrent.
 *
 * ⚠️ **Elle existe parce que deux pages répondaient différemment à la même question.** La carte
 * d'actif du tableau de bord posait `brandHex(ticker)` ; celle de la page graphique calculait
 * `pourFond(BRAND_COLORS[t] ?? extraite ?? accent, !sombre)`. Le même actif pouvait donc porter
 * deux couleurs selon la page où on le regardait — ce que personne ne voit tant qu'on ne les
 * ouvre pas côte à côte, et qu'on ne peut plus ignorer une fois vu. Demandé à l'usage.
 *
 * ⚠️ **Quatre sources, dans cet ordre — et j'ai essayé de mettre la plaque en premier, à tort.**
 * Deux cartes fautives (`ESE.PA`, `JPM`) m'avaient fait conclure que « ce qui se voit prime sur
 * ce qui est écrit ». L'audit du catalogue entier a montré que c'était faux : **vingt-cinq
 * actifs partagent le logo de leur émetteur** — sept ETF sectoriels SPDR, douze iShares, quatre
 * Vanguard, deux BNP. Leur plaque identifie la maison, pas le fonds. Plaque en premier, les
 * sept SPDR devenaient le **même bleu** et les douze iShares le **même cyan** : on remplaçait
 * quelques couleurs fausses par une famille entière d'indistinguables.
 *
 * 1. **La table de marques**, qui est le seul endroit où l'on peut distinguer deux fonds au
 *    logo identique — l'or de `GLD` de l'énergie de `XLE`.
 * 2. **La plaque du logo**, pour les actifs que la table ignore : c'est le fond que l'œil
 *    compare, et il vaut mieux qu'un hachage.
 * 3. **La teinte dominante** du dessin, quand le logo n'a pas de plaque exploitable.
 * 4. **Le hachage du ticker** en dernier — il ne veut rien dire, il a seulement le mérite d'être
 *    stable et distinct d'un actif à l'autre.
 *
 * ⚠️ **Les entrées fausses se corrigent dans la table, pas dans la règle.** Douze tickers à logo
 * **unique** portaient une couleur que leur propre plaque contredisait de plus de quarante
 * degrés — `JPM` en bleu pour une plaque brune, `TSM` en bleu pour une plaque rouge. Onze de ces
 * douze plaques sont parfaitement plates, donc fiables. Les entrées ont été retirées : sans
 * elles, la plaque parle. Voir `BRAND_COLORS`.
 *
 * ⚠️ **La mise au net suit le thème, et c'était la seconde divergence.** `brandHex` appliquait
 * `pourFondSombre` en toutes circonstances : en thème clair, la carte du tableau de bord gardait
 * donc des couleurs réglées pour du noir pendant que la page graphique, elle, passait par
 * `pourFondClair`. Les deux pages divergeaient alors sur **tous** les actifs, pas seulement sur
 * ceux qui manquent à la table.
 */
export function couleurActif(
  ticker: string,
  { extraite = null, clair = false }: { extraite?: string | null; clair?: boolean } = {},
): string {
  const marque = BRAND_COLORS[ticker];
  if (marque) return pourFond(marque, clair);
  const plaque = plaqueConnue(ticker);
  if (plaque) return pourFond(plaque, clair);
  /* ⚠️ La teinte passée par l'appelant d'abord, le cache partagé ensuite : une surface qui
     s'abonne a la valeur la plus fraîche, une surface qui ne s'abonne pas profite quand même de
     ce qu'une autre a déjà analysé. Sans ce second recours, la répartition pavée et les cartes
     d'actif du même tableau de bord se contredisaient sur les actifs hors table. */
  const teinte = extraite ?? teinteConnue(ticker);
  if (teinte) return pourFond(teinte, clair);
  return pourFond(brandHex(ticker), clair);
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
  /**
   * La couleur de la tuile, voilée d'une opacité donnée sur 255.
   *
   * ⚠️ **`color-mix` et non un suffixe hexadécimal, et ce correctif vient d'un défaut vu à
   * l'écran.** Cette fonction écrivait `${c}${alphaHex}` — juste tant que `c` est un
   * hexadécimal, catastrophique sinon. Or les couleurs proposées par le formulaire
   * d'objectifs viennent de la palette, où `JETONS.accent` vaut la chaîne
   * `« var(--nv-accent) »` : la concaténation produisait `var(--nv-accent)58`, déclaration
   * **invalide** que le navigateur ignore en silence. Résultat, les cartes concernées
   * n'avaient aucun lavis de couleur — un fond gris uni — tandis que celles créées avec un
   * hexadécimal littéral étaient franchement teintées. Deux cartes côte à côte, deux
   * apparences, aucune erreur en console.
   *
   * `color-mix` accepte n'importe quelle couleur CSS, `var()` comprise, ce qui referme le
   * problème à la source plutôt que d'imposer un format aux appelants.
   */
  const voile = (v: number) =>
    `color-mix(in srgb, ${c} ${(Math.min(255, Math.max(0, v)) / 255 * 100).toFixed(1)}%, transparent)`;
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
      `radial-gradient(ellipse 260% 300% at 0% 0%, ${voile(88)} 0%, ${voile(77)} 18%, ${voile(59)} 36%, ${voile(41)} 54%, ${voile(23)} 72%, ${voile(10)} 88%, ${voile(0)} 100%)`,
      `radial-gradient(ellipse 260% 300% at 100% 100%, ${voile(76)} 0%, ${voile(66)} 18%, ${voile(51)} 36%, ${voile(35)} 54%, ${voile(20)} 72%, ${voile(9)} 88%, ${voile(0)} 100%)`,
      // Assombrissement de fond, volontairement plus léger qu'avant : la tuile
      // laisse davantage passer ce qu'il y a derrière.
      "rgba(2,10,24,0.38)",
    ].join(", "),
    backdropFilter: "blur(24px) saturate(1.6) brightness(1.06)",
    WebkitBackdropFilter: "blur(24px) saturate(1.6) brightness(1.06)",
    border: "none",
    boxShadow: `0 14px 44px rgba(0,0,0,0.28), 0 0 28px ${voile(16)}`,
    overflow: "hidden",
    boxSizing: "border-box",
  };
}

/**
 * La tuile en aplat : une seule couleur, pleine et sans matière.
 *
 * ⚠️ **Elle existe pour que la plaque du logo disparaisse dans la carte.** Un logo de marque
 * est une plaque de couleur avec un dessin blanc dessus ; si la carte porte *exactement* la
 * couleur de cette plaque, la plaque cesse de se voir et il ne reste que le dessin, posé sur
 * un fond uni. Demandé à l'usage — « qu'on voie seulement le logo blanc et que le fond soit
 * uniforme ». Le moindre lavis, dégradé ou voile suffit à faire réapparaître le carré du
 * logo, puisqu'il éloigne la carte de la couleur exacte à l'endroit précis où le logo se
 * pose.
 *
 * ⚠️ **C'est donc `tileSurface` moins tout ce qui n'est pas la couleur.** Partent : les deux
 * lavis d'angle, le spéculaire qui suit le curseur, le fond sombre `rgba(2,10,24,0.38)` et le
 * `backdrop-filter`. Ce dernier n'aurait de toute façon plus rien à filtrer — un aplat opaque
 * ne laisse rien passer.
 *
 * ⚠️ **Le bord reste, et c'est la seule chose qu'on garde du verre.** Il est peint par
 * `.novac-tile::before`, hors d'ici, à partir de `currentColor` : l'appelant pose donc la même
 * couleur sur `color`. Demandé — « sauf effet sur bord ».
 *
 * ⚠️ **Une seconde surface, et non un drapeau sur la première.** Ce fichier porte déjà la
 * trace d'un paramètre d'intensité retiré parce qu'il faisait diverger deux appelants qui
 * devaient rendre la même chose. Ce n'en est pas un : la distinction n'est pas « quelle page »
 * mais « d'où vient la couleur ». Un aplat n'a de sens que si la couleur est celle du logo —
 * sinon il n'y a rien à faire disparaître, et une carte pleine d'une couleur de marque prise
 * dans une table serait un aplat qui ne sert à rien. `tileSurface` reste donc telle quelle
 * pour `TileCard`, dont les couleurs viennent encore de la table.
 */
export function surfaceAplat(couleur: string, radius = 18): {
  borderRadius: number;
  backgroundColor: string;
  border: string;
  boxShadow: string;
  overflow: "hidden";
  boxSizing: "border-box";
} {
  return {
    borderRadius: radius,
    /* ⚠️ `backgroundColor` et non `background` : la couleur arrive après le chargement du
       logo, et une propriété longue ne s'interpole pas. Nommer la sous-propriété est ce qui
       permet à l'appelant de fondre l'une dans l'autre au lieu de la faire sauter. */
    backgroundColor: couleur,
    border: "none",
    /* L'ombre portée reste : elle décolle la tuile du fond, ce qui n'est pas un effet de
       matière — et sans elle une carte sombre se confond avec la page. Le halo coloré de
       `tileSurface`, lui, est parti avec le reste du verre. */
    boxShadow: "0 14px 44px rgba(0,0,0,0.28)",
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
