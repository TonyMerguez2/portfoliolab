/**
 * La géométrie du cadrage d'une image dans une vignette carrée.
 *
 * Extraite du composant pour être testable sans navigateur ni canevas, comme le
 * reste de `src/lib`. Tout tient en trois règles, et c'est la troisième qui
 * décide de ce que le serveur reçoit.
 *
 * Le repère est celui du **cadre** : un carré de `cadre` pixels, origine en haut
 * à gauche. L'image y est posée centrée, puis déplacée de `dx`/`dy` et
 * agrandie de `echelle` — un facteur qui va des pixels de l'image vers ceux de
 * l'écran.
 */

/** Une image, réduite à ce qui compte ici. */
export interface Dimensions {
  largeur: number;
  hauteur: number;
}

/**
 * Le plus petit agrandissement qui couvre encore le cadre.
 *
 * ⚠️ C'est un **maximum** des deux rapports, pas un minimum. Prendre le plus
 * petit ferait *tenir* l'image dans le cadre — donc laisserait deux bandes vides
 * sur le côté le plus court, et ces bandes finiraient dans le fichier envoyé.
 * Une vignette de portefeuille doit être pleine.
 */
export function echelleMinimale(img: Dimensions, cadre: number): number {
  if (img.largeur <= 0 || img.hauteur <= 0) return 1;
  return Math.max(cadre / img.largeur, cadre / img.hauteur);
}

/**
 * Le déplacement ramené dans ses limites, pour que l'image couvre le cadre.
 *
 * Au-delà, un angle du cadre se retrouverait sur du vide. Plutôt que d'interdire
 * le geste, on le laisse aller et on le borne : c'est ce qui donne la sensation
 * de butée d'une photo qu'on pousse au bord.
 *
 * À l'échelle minimale exactement, la marge est nulle sur au moins un axe : le
 * déplacement y est simplement figé à zéro.
 */
export function bornerDecalage(
  dx: number, dy: number, img: Dimensions, echelle: number, cadre: number,
): { dx: number; dy: number } {
  const margeX = Math.max(0, (img.largeur * echelle - cadre) / 2);
  const margeY = Math.max(0, (img.hauteur * echelle - cadre) / 2);
  return {
    dx: borner(dx, margeX),
    dy: borner(dy, margeY),
  };
}

/**
 * `v` ramené dans [−marge, marge].
 *
 * ⚠️ Le `+ 0` final n'est pas décoratif : il neutralise le zéro négatif. À marge
 * nulle et déplacement négatif, `Math.max(-0, -50)` rend `-0`, que `Math.min`
 * propage — et un test a suffi à le montrer. Le zéro négatif se glisse ensuite
 * dans les transformations CSS et fait échouer toute comparaison stricte à zéro,
 * pour une valeur qui vaut pourtant zéro.
 */
function borner(v: number, marge: number): number {
  return Math.min(marge, Math.max(-marge, v)) + 0;
}

/** La portion de l'image visible dans le cadre, en pixels de l'image. */
export interface Source {
  sx: number;
  sy: number;
  /** Le côté du carré prélevé — le cadre étant carré, largeur et hauteur sont égales. */
  cote: number;
}

/**
 * Ce qu'il faut découper dans l'image d'origine pour obtenir le cadre affiché.
 *
 * ⚠️ Le calcul part de l'image **native**, jamais de ce que le navigateur a
 * affiché. Le cadre à l'écran mesure quelques centaines de pixels alors que la
 * photo en compte souvent des milliers : découper d'après l'affichage aurait
 * exporté une vignette à la résolution de l'écran, floue dès qu'on l'agrandit.
 * Ici l'échelle sert à convertir, et la découpe garde toute la finesse
 * disponible.
 *
 * Le résultat est borné à l'image : un déplacement hors limites — que
 * `bornerDecalage` empêche, mais qu'un appelant pourrait ne pas avoir borné —
 * donnerait sinon un rectangle source à cheval sur le vide, que `drawImage`
 * remplit de transparence.
 */
export function sourceVisible(
  dx: number, dy: number, img: Dimensions, echelle: number, cadre: number,
): Source {
  const cote = Math.min(cadre / echelle, img.largeur, img.hauteur);
  // Position du coin haut-gauche de l'image dans le repère du cadre.
  const x0 = cadre / 2 + dx - (img.largeur * echelle) / 2;
  const y0 = cadre / 2 + dy - (img.hauteur * echelle) / 2;
  return {
    sx: Math.min(Math.max(0, -x0 / echelle), img.largeur - cote),
    sy: Math.min(Math.max(0, -y0 / echelle), img.hauteur - cote),
    cote,
  };
}

/**
 * L'échelle maximale offerte, en multiples de l'échelle minimale.
 *
 * Quatre fois : au-delà, on agrandit des pixels plutôt que de choisir un
 * cadrage. Sur une photo de téléphone — 3 000 pixels de côté pour une vignette
 * exportée à 512 — la butée est de toute façon atteinte bien avant que l'image
 * ne se dégrade.
 */
export const ZOOM_MAX = 4;

/**
 * Le côté de la vignette exportée, en pixels.
 *
 * Cinq cent douze pour une vignette affichée entre 44 et 48 pixels : le rapport
 * paraît large, mais il couvre les écrans à trois fois la densité et laisse la
 * place à un affichage plus grand ailleurs dans l'application. Une image
 * exportée à la taille d'affichage serait à refaire au premier réemploi.
 */
export const COTE_EXPORT = 512;
