import { type Vec3, cercleDeLatitude, grandCercle } from "./avatarSpherique";
import { type Solide, surLeSolide } from "./avatarVolume";

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

/**
 * Le maillage **à pas constant sur la surface**, et non à pas constant en angle.
 *
 * ⚠️ **Une grille régulière en angle ne l'est plus une fois posée sur autre chose qu'une
 * sphère.** Le volume est atteint en poussant chaque direction jusqu'à sa surface : au
 * milieu d'une face de cube, cette distance vaut un ; vers un coin, elle vaut jusqu'à la
 * racine de trois. Un même écart d'angle y couvre donc une longueur presque deux fois
 * plus grande, et le maillage se resserre au centre de la face — signalé à l'usage : « la
 * grille doit être plus espacée sur la face, là c'est plus serré que sur les côtés. »
 *
 * ⚠️ **Les parallèles se placent à longueur égale, pas à latitude égale.** On mesure la
 * longueur réellement parcourue le long d'un méridien, et l'on répartit les cercles à
 * fractions égales de cette longueur. Les méridiens suivent la même règle le long de
 * l'équateur. Il reste une approximation assumée : un parallèle est un cercle de latitude
 * constante, or la longueur d'un méridien dépend de son azimut — on prend donc la moyenne
 * sur tous les azimuts, faute de quoi il faudrait des parallèles qui ondulent.
 */

const AZIMUTS_MESURE = 48;
const PAS_MESURE = Math.PI / 512;

/** La longueur de surface cumulée depuis le pôle nord, en fonction de l'angle polaire. */
function longueurDeMeridien(solide: Solide): Float64Array {
  const pas = Math.round(Math.PI / PAS_MESURE) + 1;
  const cumul = new Float64Array(pas);
  for (let a = 0; a < AZIMUTS_MESURE; a++) {
    const phi = (a / AZIMUTS_MESURE) * Math.PI * 2;
    let precedent = surLeSolide({ x: 0, y: 1, z: 0 }, solide);
    for (let i = 1; i < pas; i++) {
      const t = i * PAS_MESURE;
      const s = Math.sin(t);
      const point = surLeSolide(
        { x: s * Math.cos(phi), y: Math.cos(t), z: s * Math.sin(phi) }, solide);
      cumul[i] += cumul[i - 1] - cumul[i - 1] + Math.hypot(
        point.x - precedent.x, point.y - precedent.y, point.z - precedent.z);
      precedent = point;
    }
  }
  /* Les incréments ont été sommés sur tous les azimuts : on les moyenne puis on cumule. */
  const moyenne = new Float64Array(pas);
  for (let i = 1; i < pas; i++) moyenne[i] = moyenne[i - 1] + cumul[i] / AZIMUTS_MESURE;
  return moyenne;
}

/** La longueur de surface cumulée le long de l'équateur, en fonction de la longitude. */
function longueurDEquateur(solide: Solide): Float64Array {
  const pas = Math.round((Math.PI * 2) / PAS_MESURE) + 1;
  const cumul = new Float64Array(pas);
  let precedent = surLeSolide({ x: 0, y: 0, z: 1 }, solide);
  for (let i = 1; i < pas; i++) {
    const t = i * PAS_MESURE;
    const point = surLeSolide({ x: Math.sin(t), y: 0, z: Math.cos(t) }, solide);
    cumul[i] = cumul[i - 1] + Math.hypot(
      point.x - precedent.x, point.y - precedent.y, point.z - precedent.z);
    precedent = point;
  }
  return cumul;
}

/** L'angle auquel la longueur cumulée atteint `cible`. */
function angleALaLongueur(cumul: Float64Array, cible: number, pas: number): number {
  if (cible <= 0) return 0;
  const dernier = cumul.length - 1;
  if (cible >= cumul[dernier]) return dernier * pas;
  let bas = 0, haut = dernier;
  while (haut - bas > 1) {
    const milieu = (bas + haut) >> 1;
    if (cumul[milieu] <= cible) bas = milieu; else haut = milieu;
  }
  const large = cumul[haut] - cumul[bas];
  return (bas + (large > 1e-12 ? (cible - cumul[bas]) / large : 0)) * pas;
}

/**
 * Les deux tables de longueur d'un solide — méridien et équateur —, gardées par identité.
 *
 * ⚠️ **Ce sont elles qui coûtent, et elles se recalculaient à chaque image d'une morphose.**
 * Le reste de la grille n'est que de la géométrie de sphère, gratuite. La table du méridien,
 * elle, parcourt tous les azimuts : 9,8 ms par appel, soit une grille par image pendant toute
 * une transition. Un mélange étant un solide neuf à chaque image, aucun cache par identité ne
 * peut l'attraper — mais ses deux extrémités, elles, sont stables, et la table d'un rayon
 * interpolé est l'interpolation des deux tables. Même remède que pour la carte du regard.
 */
type TablesSolide = { meridien: Float64Array; equateur: Float64Array };
const tables = new WeakMap<Solide, TablesSolide>();
let tampon: TablesSolide | null = null;

function tablesDe(solide: Solide): TablesSolide {
  const connu = tables.get(solide);
  if (connu) return connu;
  if (solide.famille === "melange") {
    const de = tablesDe(solide.de), vers = tablesDe(solide.vers), p = solide.part;
    if (!tampon || tampon.meridien.length !== de.meridien.length) {
      tampon = {
        meridien: new Float64Array(de.meridien.length),
        equateur: new Float64Array(de.equateur.length),
      };
    }
    for (const cle of ["meridien", "equateur"] as const) {
      const a = de[cle], b = vers[cle], out = tampon[cle];
      for (let i = 0; i < out.length; i++) out[i] = a[i] + (b[i] - a[i]) * p;
    }
    return tampon;
  }
  const neuf = { meridien: longueurDeMeridien(solide), equateur: longueurDEquateur(solide) };
  tables.set(solide, neuf);
  return neuf;
}

let derniere: { solide: Solide; pas: number; grille: Grille } | null = null;

export function grillePourSolide(
  solide: Solide, pasDegres: number = PAS_GRILLE, echantillons: number = 96,
): Grille {
  if (derniere && derniere.solide === solide && derniere.pas === pasDegres) return derniere.grille;

  const { meridien, equateur } = tablesDe(solide);
  const total = meridien[meridien.length - 1];
  /* Le nombre d'intervalles est celui qu'aurait donné le pas en angle : la grille garde sa
     densité, seule sa répartition change. */
  const tranches = Math.max(2, Math.round(180 / pasDegres));
  const paralleles: Vec3[][] = [];
  for (let k = 1; k < tranches; k++) {
    if (k === tranches / 2) continue;
    const angle = angleALaLongueur(meridien, (total * k) / tranches, PAS_MESURE);
    paralleles.push(cercleDeLatitude(Math.PI / 2 - angle, echantillons));
  }

  const tour = equateur[equateur.length - 1];
  const colonnes = Math.max(2, Math.round(360 / pasDegres));
  const meridiens: Vec3[][] = [];
  /* Un grand cercle porte deux méridiens opposés : la moitié suffit. */
  for (let k = 0; k < colonnes / 2; k++) {
    const lon = angleALaLongueur(equateur, (tour * k) / colonnes, PAS_MESURE);
    meridiens.push(grandCercle({ x: Math.cos(lon), y: 0, z: -Math.sin(lon) }, echantillons));
  }

  const grille: Grille = {
    equateur: cercleDeLatitude(0, echantillons),
    paralleles, meridiens,
    axes: grilleSpherique(pasDegres, echantillons).axes,
  };
  derniere = { solide, pas: pasDegres, grille };
  return grille;
}
