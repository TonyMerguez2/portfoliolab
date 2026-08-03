/**
 * Palette du thème clair : fond bleu, panneaux blancs.
 *
 * Le reste de l'application est encore sombre, avec près de deux mille
 * couleurs écrites en dur. Ces jetons existent pour que la page convertie ne
 * les répète pas une troisième fois : si le bleu change, il change ici.
 *
 * Les couleurs sémantiques ne sont pas celles du thème sombre. Le vert clair
 * `#4ade80`, lisible sur fond noir, tombe à 1,8:1 de contraste sur blanc —
 * illisible. Les gains et les pertes ont donc leurs propres teintes ici.
 */

export const CLAIR = {
  /** Fond de page. */
  fond: "#0B63E7",
  /** Nuance plus profonde, pour les zones en retrait du fond. */
  fondProfond: "#0A56C8",

  /** Surface des panneaux. */
  carte: "#FFFFFF",
  /** Surface d'un élément posé *dans* un panneau — encart, ligne survolée. */
  carteCreuse: "#F4F7FB",

  bord: "rgba(15,23,42,0.10)",
  bordFort: "rgba(15,23,42,0.18)",

  texte: "#0F172A",
  texteSecondaire: "rgba(15,23,42,0.62)",
  texteAttenue: "rgba(15,23,42,0.42)",
  texteFaible: "rgba(15,23,42,0.30)",

  /** Texte posé directement sur le fond bleu. */
  surFond: "#FFFFFF",
  surFondAttenue: "rgba(255,255,255,0.72)",
  surFondFaible: "rgba(255,255,255,0.50)",

  /**
   * Gains et pertes.
   *
   * Assombris par rapport au thème sombre : sur blanc, il faut au moins 4,5:1
   * pour du texte courant, et les teintes claires n'y arrivent pas.
   */
  positif: "#0F7B3D",
  negatif: "#C81E1E",
  attention: "#B45309",

  /** Accent — le bleu du fond, mais tenable sur blanc. */
  accent: "#0B63E7",
  accentDoux: "rgba(11,99,231,0.10)",
  accentBord: "rgba(11,99,231,0.28)",

  ombre: "0 1px 2px rgba(11,32,74,0.06), 0 8px 24px rgba(11,32,74,0.08)",
} as const;

/** Rayon et espacement, repris de la géométrie existante. */
export const RAYON = 30;
export const RAYON_PETIT = 14;
export const MARGE = 10;
export const GOUTTIERE = 8;

/** La couleur d'un montant, selon son signe. */
export function couleurMontant(v: number | null | undefined): string {
  if (v == null) return CLAIR.texteAttenue;
  return v >= 0 ? CLAIR.positif : CLAIR.negatif;
}
