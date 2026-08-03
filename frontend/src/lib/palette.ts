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

  /* Segments — voir le composant ui/Segments. */
  segmentPiste: "var(--nv-segment-piste)",
  segmentActif: "var(--nv-segment-actif)",
  segmentEncre: "var(--nv-segment-encre)",
  segmentOmbre: "var(--nv-segment-ombre)",
} as const;

/** Nom historique, le temps que les appelants migrent. */
export const CLAIR = JETONS;

/**
 * L'échelle des rayons.
 *
 * Un relevé sur la page en avait trouvé onze différents — 2, 5, 6, 7, 8, 9,
 * 10, 12, 13, 30 et 50 % — chacun choisi séparément au fil de l'écriture. Rien
 * ne distingue un rayon de 6 d'un rayon de 7 sinon l'inattention, mais les
 * deux côte à côte se voient.
 *
 * Cinq échelons suffisent, calés sur la base de 14 px relevée chez Appica.
 * `plein` sert aux barres et aux pastilles rondes, où l'arrondi doit valoir la
 * moitié de la hauteur quelle qu'elle soit.
 */
export const RAYONS = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  plein: 999,
} as const;

/**
 * Le rayon des grandes cartes.
 *
 * Descendu de 30 à 28 pour rejoindre l'échelon `xl`. L'écart de deux pixels ne
 * se voit pas ; c'est d'être sur l'échelle qui compte, puisque ces cartes
 * voisinent des panneaux qui, eux, s'y calent.
 */
export const RAYON = RAYONS.xl;
export const RAYON_PETIT = RAYONS.md;
export const MARGE = 10;
export const GOUTTIERE = 8;

/** La couleur d'un montant, selon son signe. */
export function couleurMontant(v: number | null | undefined): string {
  if (v == null) return JETONS.texteAttenue;
  return v >= 0 ? JETONS.positif : JETONS.negatif;
}
