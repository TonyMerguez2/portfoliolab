/**
 * La géométrie de la courbe de projection, en pur.
 *
 * ⚠️ Écrite à part pour être vérifiée sans rien afficher. Une échelle fausse ne se voit
 * pas : elle produit une courbe plausible, et c'est le pire des cas — celui où l'on croit
 * lire un patrimoine.
 */

/** Les bornes utiles d'une série, jamais dégénérées. */
export function bornes(valeurs: number[]): { bas: number; haut: number } {
  const finies = valeurs.filter(v => Number.isFinite(v));
  if (finies.length === 0) return { bas: 0, haut: 1 };
  const bas = Math.min(0, ...finies);
  const haut = Math.max(...finies);
  // ⚠️ Un intervalle nul rendrait une division par zéro, donc des `NaN` dans le
  // chemin SVG — et un tracé absent, sans message. Une hauteur minimale garantit
  // qu'une série plate se dessine comme une ligne plate.
  return haut - bas < 1e-9 ? { bas, haut: bas + 1 } : { bas, haut };
}

/**
 * Des graduations lisibles entre deux bornes.
 *
 * ⚠️ Arrondies à une puissance de dix « humaine » — 1, 2, 2,5 ou 5 fois une puissance —
 * parce qu'une échelle graduée tous les 137 429 € ne se lit pas. On préfère quatre
 * repères ronds à six repères exacts.
 */
export function graduations(bas: number, haut: number, cible = 4): number[] {
  const etendue = haut - bas;
  if (etendue <= 0) return [bas];
  const brut = etendue / Math.max(1, cible);
  const magnitude = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 2.5, 5, 10].map(m => m * magnitude)
    .find(p => p >= brut) ?? 10 * magnitude;
  const sortie: number[] = [];
  for (let v = Math.ceil(bas / pas) * pas; v <= haut + 1e-9; v += pas) sortie.push(v);
  return sortie;
}

export type Cadre = {
  largeur: number; hauteur: number;
  marge: { haut: number; bas: number; gauche: number; droite: number };
};

/** Les deux projections d'un point de données vers un pixel. */
export function echelles(
  mois: number[], bas: number, haut: number, cadre: Cadre,
): { x: (m: number) => number; y: (v: number) => number } {
  const { largeur, hauteur, marge } = cadre;
  const utileX = Math.max(1, largeur - marge.gauche - marge.droite);
  const utileY = Math.max(1, hauteur - marge.haut - marge.bas);
  const mMin = mois.length ? mois[0] : 0;
  const mMax = mois.length ? mois[mois.length - 1] : 1;
  const etendueM = Math.max(1e-9, mMax - mMin);
  const etendueV = Math.max(1e-9, haut - bas);
  return {
    x: m => marge.gauche + ((m - mMin) / etendueM) * utileX,
    // ⚠️ L'axe des valeurs est inversé : en SVG, zéro est en haut. L'oublier dessine
    // une projection qui descend quand le patrimoine monte, ce qui se voit — mais une
    // erreur de signe sur une seule série passerait inaperçue.
    y: v => marge.haut + (1 - (v - bas) / etendueV) * utileY,
  };
}

/**
 * Le chemin SVG d'une série.
 *
 * ⚠️ Les points non finis sont **sautés** et coupent le tracé au lieu d'être remplacés
 * par zéro. Une courbe qui plonge à zéro se lit comme une perte totale ; un trou se lit
 * comme une donnée manquante, ce qui est le cas.
 */
export function chemin(
  mois: number[], valeurs: number[],
  x: (m: number) => number, y: (v: number) => number,
): string {
  let d = "";
  let ouvert = false;
  for (let i = 0; i < mois.length && i < valeurs.length; i++) {
    const v = valeurs[i];
    if (!Number.isFinite(v)) { ouvert = false; continue; }
    d += `${ouvert ? "L" : "M"}${x(mois[i]).toFixed(2)} ${y(v).toFixed(2)}`;
    ouvert = true;
  }
  return d;
}

/**
 * Le contour fermé d'une bande entre deux séries.
 *
 * ⚠️ La bande est la représentation honnête d'un intervalle : elle montre une zone, là
 * où trois traits laissent croire à trois trajectoires. On dessine les deux — la bande
 * pour la vérité, les traits parce que la maquette les demande — et la légende nomme des
 * centiles, pas des scénarios.
 */
export function bande(
  mois: number[], bas: number[], haut: number[],
  x: (m: number) => number, y: (v: number) => number,
): string {
  const dessus = chemin(mois, haut, x, y);
  if (!dessus) return "";
  let retour = "";
  for (let i = Math.min(mois.length, bas.length) - 1; i >= 0; i--) {
    if (!Number.isFinite(bas[i])) continue;
    retour += `L${x(mois[i]).toFixed(2)} ${y(bas[i]).toFixed(2)}`;
  }
  return retour ? `${dessus}${retour}Z` : "";
}

/** L'année civile d'un jalon en mois, depuis aujourd'hui. */
export function anneeDuMois(mois: number, aujourdhui = new Date()): number {
  const d = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth() + mois, 1);
  return d.getFullYear();
}

/**
 * Un montant abrégé pour un axe : « 1,5 M€ », « 500 k€ ».
 *
 * ⚠️ Sur un axe, « 1 512 480 € » écrase ses voisins et se lit moins bien qu'un ordre de
 * grandeur. Ailleurs — dans une mesure chiffrée — c'est le montant exact qu'il faut.
 */
export function montantCourt(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M€`;
  if (a >= 1e3) return `${Math.round(v / 1e3)} k€`;
  return `${Math.round(v)} €`;
}
