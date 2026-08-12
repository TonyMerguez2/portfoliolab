import { type Vec3, cercleDeLatitude, grandCercle } from "./avatarSpherique";

/**
 * Le maillage de la sphère : parallèles, méridiens et axes.
 *
 * ⚠️ **La grille n'est pas un décor, c'est la sphère elle-même rendue visible.** Tout
 * le reste de l'avatar — les yeux, les motifs des skins — est peint sur une surface
 * qu'on ne voit jamais : on ne perçoit que la silhouette, un disque, et l'on doit
 * deviner le volume au comportement des formes. Le maillage montre ce volume
 * directement, et c'est ce qui permet de vérifier une rotation à l'œil : un parallèle
 * qui ne se courbe pas dans le bon sens signale un tangage inversé bien avant qu'un
 * test ne le rattrape.
 *
 * ⚠️ **Les courbes sont calculées une fois, pas à chaque image.** Elles ne dépendent
 * que du pas ; l'orientation n'intervient qu'à la projection. C'est la même règle que
 * pour les motifs des skins, et pour la même raison — une grille au pas de 15° porte
 * une trentaine de courbes de cent points, soit trois mille transformations par image
 * si on les refaisait à chaque fois.
 *
 * ⚠️ **Les axes sont ceux de la *tête*, pas ceux du monde.** Ils tournent donc avec
 * elle, et c'est ce qui rend la rotation lisible : le repère du monde, immobile, ne
 * dirait rien de plus que les bords de l'écran. L'axe Z est celui du regard — c'est
 * lui qu'on suit pour savoir où le visage est tourné.
 */

const rad = (degres: number) => (degres * Math.PI) / 180;

export type Grille = {
  /** Le cercle de latitude nulle, tracé à part parce qu'on l'accentue. */
  equateur: Vec3[];
  /** Les autres cercles de latitude, des pôles exclus. */
  paralleles: Vec3[][];
  /**
   * Les grands cercles passant par les pôles.
   *
   * ⚠️ Un grand cercle porte **deux** méridiens opposés : au pas de 30°, six cercles
   * suffisent aux douze méridiens. En tracer douze reviendrait à peindre chaque trait
   * deux fois — invisible, mais deux fois le travail.
   */
  meridiens: Vec3[][];
  /** Les six demi-axes du repère de la tête, du centre vers la surface. */
  axes: { cle: "x" | "y" | "z"; signe: 1 | -1; pointe: Vec3 }[];
};

/** Le pas par défaut, en degrés : assez fin pour lire la courbure, assez large pour compter. */
export const PAS_GRILLE = 15;

export function grilleSpherique(
  pasDegres: number = PAS_GRILLE, echantillons: number = 96,
): Grille {
  const paralleles: Vec3[][] = [];
  for (let lat = pasDegres; lat < 90; lat += pasDegres) {
    paralleles.push(cercleDeLatitude(rad(lat), echantillons));
    paralleles.push(cercleDeLatitude(rad(-lat), echantillons));
  }

  const meridiens: Vec3[][] = [];
  // L'axe d'un grand cercle est perpendiculaire à son plan : pour un méridien de
  // longitude λ, le plan contient les pôles et la direction (sin λ, 0, cos λ), donc
  // sa normale vaut (cos λ, 0, −sin λ).
  for (let lon = 0; lon < 180; lon += pasDegres) {
    const a = rad(lon);
    meridiens.push(grandCercle({ x: Math.cos(a), y: 0, z: -Math.sin(a) }, echantillons));
  }

  const axes: Grille["axes"] = [];
  const directions: { cle: "x" | "y" | "z"; v: Vec3 }[] = [
    { cle: "x", v: { x: 1, y: 0, z: 0 } },
    { cle: "y", v: { x: 0, y: 1, z: 0 } },
    { cle: "z", v: { x: 0, y: 0, z: 1 } },
  ];
  for (const d of directions) {
    axes.push({ cle: d.cle, signe: 1, pointe: d.v });
    axes.push({ cle: d.cle, signe: -1, pointe: { x: -d.v.x, y: -d.v.y, z: -d.v.z } });
  }

  return { equateur: cercleDeLatitude(0, echantillons), paralleles, meridiens, axes };
}
