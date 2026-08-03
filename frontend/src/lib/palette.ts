import type { CSSProperties } from "react";

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
  /** Anneau extérieur du cadre, voir le composant Card. */
  cadre: "var(--nv-cadre)",
  /** Voile de l'intervalle entre les deux anneaux. */
  cadreVoile: "var(--nv-cadre-voile)",

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
  segmentInactif: "var(--nv-segment-inactif)",
  segmentSurvol: "var(--nv-segment-survol)",
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
 * Cinq échelons, pris sur leur échelle nommée résolue depuis leur styles.css :
 * 4xs 4, 3xs 6, 2xs 8, xs 10, sm 12, md 14, lg 16, xl 18, 2xl 24, 3xl 32,
 * 4xl 40 — la base `--radius` valant 0.875rem, soit 14 px.
 * `plein` sert aux barres et aux pastilles rondes, où l'arrondi doit valoir la
 * moitié de la hauteur quelle qu'elle soit.
 */
export const RAYONS = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  plein: 999,
} as const;

/**
 * Le rayon des grandes cartes : leur `rounded-2xl`.
 *
 * L'anneau intérieur en découle — 24 moins les 6 px d'intervalle font 18, soit
 * exactement leur `rounded-xl`. Les deux rayons du concept tombent donc juste
 * sans être écrits séparément.
 */
export const RAYON = 24;
export const RAYON_PETIT = RAYONS.md;
export const MARGE = 10;
export const GOUTTIERE = 8;

/**
 * Largeur de l'intervalle entre les deux anneaux.
 *
 * Six pixels, parce que leur cadre est en `rounded-2xl` (24 px) et leur carte
 * en `rounded-xl` (18 px) : la différence des deux rayons donne l'intervalle,
 * et les anneaux restent concentriques.
 */
export const CADRE = 6;

/**
 * L'anneau extérieur du cadre.
 *
 * Son rembourrage laisse voir la page entre les deux anneaux, mais à travers un
 * voile sombre à demi opacité — leur `bg-background/50` avec `backdrop-blur-xs`.
 * L'intérieur du cadre est donc plus sombre que la page tout autour, et la
 * trame de points reste perceptible au travers, à moitié.
 *
 * Deux versions ont précédé celle-ci. La première peignait l'intervalle d'une
 * ombre interne opaque : la trame s'arrêtait au bord du cadre au lieu de le
 * traverser. La seconde le laissait complètement transparent : la bande claire
 * du dégradé de page passait alors en entier, et l'intérieur du cadre était
 * aussi clair que l'extérieur.
 */
export function styleCadreExterieur(rayon: number = RAYON): CSSProperties {
  return {
    // Un voile à demi opacité, et non du transparent : il assombrit la bande de
    // page qu'il recouvre, ce qui creuse l'intérieur du cadre. Le flou reprend
    // leur `backdrop-blur-xs`. La trame reste visible au travers, à moitié.
    background: JETONS.cadreVoile,
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
    border: `1px solid ${JETONS.cadre}`,
    borderRadius: rayon,
    padding: CADRE,
    // La carte intérieure occupe toute la place laissée.
    display: "flex",
    flexDirection: "column",
    boxSizing: "border-box",
  };
}

/**
 * La carte, à l'intérieur du cadre.
 *
 * Son rayon découle de celui du cadre moins l'intervalle, ce qui garde les deux
 * anneaux concentriques : 24 − 6 = 18, soit exactement la paire du concept
 * (`rounded-2xl` dehors, `rounded-xl` dedans).
 */
export function styleCarteInterieure(rayon: number = RAYON): CSSProperties {
  return {
    background: JETONS.carte,
    border: `1px solid ${JETONS.bord}`,
    borderRadius: rayon - CADRE,
    boxShadow: JETONS.ombre,
    flex: 1,
    minHeight: 0,
    boxSizing: "border-box",
  };
}

/** La couleur d'un montant, selon son signe. */
export function couleurMontant(v: number | null | undefined): string {
  if (v == null) return JETONS.texteAttenue;
  return v >= 0 ? JETONS.positif : JETONS.negatif;
}
