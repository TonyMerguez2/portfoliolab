/**
 * Les jetons de couleur, vus depuis le JavaScript.
 *
 * Chaque valeur est une référence à une variable CSS, pas une couleur. Les
 * couleurs elles-mêmes vivent dans globals.css, déclinées pour les deux
 * thèmes ; ce module ne fait que les nommer pour les styles en ligne.
 *
 * L'intérêt est qu'un `style={{ color: JETONS.texte }}` produit
 * `color: var(--nv-texte)`, que le navigateur résout à chaque peinture. Changer
 * de thème revient donc à écrire un attribut sur <html> : aucun composant n'est
 * re-rendu, aucun état ne circule, et rien ne peut se désynchroniser.
 *
 * La version précédente exportait des hexadécimaux et se faisait passer en
 * props sous le nom `clair`. Elle ne pouvait pas porter deux thèmes
 * permanents : il aurait fallu propager le booléen partout, et chaque bascule
 * aurait repeint l'arbre entier.
 *
 * Une seule chose échappe à ce mécanisme : le canevas. lightweight-charts veut
 * des couleurs véritables et ne sait pas résoudre `var(...)`. Pour lui, voir
 * `resoudreJeton()` dans @/lib/theme.
 */

export const JETONS = {
  /** Fond de page. */
  fond: "var(--nv-fond)",
  /** Nuance plus profonde, pour les zones en retrait du fond. */
  fondProfond: "var(--nv-fond-profond)",

  /** Surface des panneaux. */
  carte: "var(--nv-carte)",
  /** Surface d'un élément posé *dans* un panneau — encart, ligne survolée. */
  carteCreuse: "var(--nv-carte-creuse)",

  bord: "var(--nv-bord)",
  bordFort: "var(--nv-bord-fort)",

  texte: "var(--nv-texte)",
  texteSecondaire: "var(--nv-texte-secondaire)",
  texteAttenue: "var(--nv-texte-attenue)",
  texteFaible: "var(--nv-texte-faible)",

  /**
   * Texte posé directement sur le fond de page, hors carte.
   *
   * En thème sombre le fond est presque noir, en thème clair presque blanc :
   * ces trois jetons ne valent donc pas la même chose que `texte` d'un côté et
   * s'y confondent de l'autre. Ils existent pour que les composants n'aient
   * jamais à savoir quel thème est actif.
   */
  surFond: "var(--nv-sur-fond)",
  surFondAttenue: "var(--nv-sur-fond-attenue)",
  surFondFaible: "var(--nv-sur-fond-faible)",

  positif: "var(--nv-positif)",
  negatif: "var(--nv-negatif)",
  attention: "var(--nv-attention)",

  accent: "var(--nv-accent)",
  accentDoux: "var(--nv-accent-doux)",
  accentBord: "var(--nv-accent-bord)",

  ombre: "var(--nv-ombre)",
} as const;

/** Nom historique, le temps que les appelants migrent. */
export const CLAIR = JETONS;

/**
 * Rayons.
 *
 * `RAYON` reste à 30 : c'est la géométrie actuelle des grandes cartes, et la
 * reprofiler est une décision de forme, pas de couleur — elle n'a pas sa place
 * dans un changement de thème. L'échelle en dessous suit la base de 14 px
 * relevée chez Appica, pour les éléments qui n'ont pas encore de rayon fixé.
 */
export const RAYON = 30;
export const RAYON_PETIT = 14;
export const MARGE = 10;
export const GOUTTIERE = 8;

/** La couleur d'un montant, selon son signe. */
export function couleurMontant(v: number | null | undefined): string {
  if (v == null) return JETONS.texteAttenue;
  return v >= 0 ? JETONS.positif : JETONS.negatif;
}
