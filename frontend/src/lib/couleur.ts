/**
 * Mise au net des couleurs de marque.
 *
 * La teinte d'un actif est extraite de son logo, et un logo n'est pas fait pour
 * servir de couleur de tracé : le pelage brun du chien de WIF donne un brun
 * sombre, illisible sur fond noir. La teinte est conservée — c'est elle qui
 * identifie l'actif — mais la clarté et la saturation sont ramenées dans une
 * plage utilisable.
 */

export type RVB = [number, number, number];

export function hexVersRvb(hex: string): RVB {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  return m
    ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
    : [91, 141, 239];
}

export function rvbVersHex([r, g, b]: RVB): string {
  const d = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${d(r)}${d(g)}${d(b)}`;
}

/** Teinte (0–1), saturation (0–1), clarté (0–1). */
export function rvbVersTsl([r, g, b]: RVB): [number, number, number] {
  const R = r / 255, V = g / 255, B = b / 255;
  const max = Math.max(R, V, B), min = Math.min(R, V, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === R)      h = ((V - B) / d + (V < B ? 6 : 0)) / 6;
  else if (max === V) h = ((B - R) / d + 2) / 6;
  else                h = ((R - V) / d + 4) / 6;
  return [h, s, l];
}

export function tslVersRvb([h, s, l]: [number, number, number]): RVB {
  if (s === 0) { const v = l * 255; return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const canal = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [canal(h + 1 / 3) * 255, canal(h) * 255, canal(h - 1 / 3) * 255];
}

/** Bornes retenues pour un tracé sur fond très sombre. */
export const CLARTE_MIN = 0.52;
export const CLARTE_MAX = 0.72;
export const SATURATION_MIN = 0.45;
export const SATURATION_MAX = 0.92;

/**
 * Ramène une couleur dans la plage lisible sur fond sombre, sans toucher à sa
 * teinte.
 *
 * La teinte identifie l'actif et doit être respectée ; la clarté et la
 * saturation ne servent qu'à la rendre visible. Un brun reste un brun, mais
 * cesse de se confondre avec le fond.
 *
 * Un gris — saturation quasi nulle — est laissé gris : lui inventer une
 * saturation lui donnerait une teinte arbitraire tirée du bruit de l'image.
 */
export function pourFondSombre(hex: string): string {
  const [h, s, l] = rvbVersTsl(hexVersRvb(hex));
  if (s < 0.08) {
    // Une nuance de gris : on se contente de l'éclaircir.
    const clarte = Math.max(CLARTE_MIN, Math.min(CLARTE_MAX, l));
    return rvbVersHex(tslVersRvb([h, s, clarte]));
  }
  return rvbVersHex(tslVersRvb([
    h,
    Math.max(SATURATION_MIN, Math.min(SATURATION_MAX, s)),
    Math.max(CLARTE_MIN, Math.min(CLARTE_MAX, l)),
  ]));
}

/**
 * Le pendant clair : ramène une couleur dans la plage lisible sur fond blanc.
 *
 * Même principe et même respect de la teinte, mais les bornes de clarté
 * descendent au lieu de monter. Elles ne sont pas le miroir des précédentes :
 * l'œil tolère moins bien une couleur claire sur blanc qu'une couleur sombre
 * sur noir, et il faut descendre plus bas qu'on ne montait haut pour atteindre
 * la même lisibilité.
 */
const CLARTE_MIN_CLAIR = 0.28;
const CLARTE_MAX_CLAIR = 0.44;

export function pourFondClair(hex: string): string {
  const [h, s, l] = rvbVersTsl(hexVersRvb(hex));
  const clarte = Math.max(CLARTE_MIN_CLAIR, Math.min(CLARTE_MAX_CLAIR, l));
  if (s < 0.08) return rvbVersHex(tslVersRvb([h, s, clarte]));
  return rvbVersHex(tslVersRvb([
    h,
    Math.max(SATURATION_MIN, Math.min(SATURATION_MAX, s)),
    clarte,
  ]));
}

/** Normalise selon le thème actif. */
export function pourFond(hex: string, clair: boolean): string {
  return clair ? pourFondClair(hex) : pourFondSombre(hex);
}

/**
 * Poids d'un groupe de pixels dans le choix de la couleur dominante.
 *
 * Compter les pixels seuls fait gagner les grandes plages ternes : le pelage
 * d'un logo animalier l'emporte sur le bleu vif de sa casquette, alors que
 * c'est le second que l'œil retient. La saturation pèse donc dans la balance.
 */
export function poidsGroupe(nombre: number, saturation: number): number {
  return nombre * (0.35 + saturation);
}
