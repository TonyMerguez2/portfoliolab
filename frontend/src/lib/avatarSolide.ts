import {
  RAYON_TETE, type Orientation, type Point2, type Vec3,
  ancrageOeil, cheminOuvert, cheminSvg, contourArrondi, projeter, sensDeParcours,
  surLaSphere, tournerTete, type ReglagesOeil,
} from "./avatarSpherique";

/**
 * Le même personnage, mais dont le **solide tourne pour de bon**.
 *
 * ⚠️ **Ce module existe parce que les deux modes ne partagent aucune étape.** Dans le
 * mode ordinaire, le gonflement vers le cube s'applique *après* la rotation : la
 * silhouette reste le même carré arrondi sous tous les angles — c'est le parti du logo
 * — mais ce qui est peint dessus se tord en tournant. Mesuré : un même point de la
 * surface reçoit un gonflement qui varie de 21,4 % selon l'orientation, contre 0,0 % sur
 * la sphère. Ici le gonflement passe *avant* la rotation, et tout s'inverse : la grille
 * et les yeux deviennent rigides, seule la perspective les raccourcit, et c'est la
 * silhouette qui respire — mesuré, +20 % d'aire à 45° de lacet.
 *
 * ⚠️ **La visibilité n'est plus le signe de la cote.** Sur une sphère, un point est vu
 * si `z ≥ 0` ; sur un solide quelconque, il l'est si sa **normale** regarde vers nous.
 * Les deux coïncident sur la sphère — sa normale *est* sa position —, ce qui explique
 * que le module principal n'ait jamais eu à faire la distinction. Ici il le faut.
 *
 * ⚠️ **La silhouette a une forme close, et c'est ce qui rend le tout praticable.** Pour
 * la superellipsoïde |x|ⁿ + |y|ⁿ + |z|ⁿ = 1, la normale en `q` vaut
 * `(sgn·|qᵢ|ⁿ⁻¹)`. En posant `uᵢ = sgn(qᵢ)|qᵢ|ⁿ⁻¹`, la surface devient la boule unité de
 * la **norme duale** ℓⁿ′ avec 1/n + 1/n′ = 1, et la condition « normale perpendiculaire
 * au regard » devient `u · v = 0` : un simple plan. La silhouette est donc l'intersection
 * d'une boule duale et d'un plan — une courbe convexe plane, qu'on paramètre par un
 * angle et qu'on parcourt comme on parcourait le cercle du bord. Sans cela, il aurait
 * fallu la suivre au pas à pas, et c'est exactement le genre de marche qui se trompe en
 * silence.
 */

const TAU = Math.PI * 2;

/** L'exposant en deçà duquel on est sur la sphère, où tout ceci est inutile. */
const SPHERE = 2 + 1e-9;

function normaliser(v: Vec3): Vec3 {
  const n = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  return n === 0 ? v : { x: v.x / n, y: v.y / n, z: v.z / n };
}

const puissanceSignee = (v: number, e: number) =>
  (v === 0 ? 0 : Math.sign(v) * Math.pow(Math.abs(v), e));

/** Le point du solide qui correspond à un point de la sphère : même direction. */
export function surLeSolide(p: Vec3, exposant: number): Vec3 {
  if (exposant <= SPHERE) return p;
  const n = Math.pow(
    Math.pow(Math.abs(p.x), exposant)
    + Math.pow(Math.abs(p.y), exposant)
    + Math.pow(Math.abs(p.z), exposant),
    1 / exposant,
  );
  return n <= 1e-12 ? p : { x: p.x / n, y: p.y / n, z: p.z / n };
}

/**
 * La normale du solide, lue sur le point de la **sphère**.
 *
 * Le point du solide est proportionnel à celui de la sphère, et la normale ne dépend que
 * des rapports entre coordonnées : inutile de passer par le solide pour l'obtenir.
 */
export function normaleSolide(p: Vec3, exposant: number): Vec3 {
  if (exposant <= SPHERE) return p;
  return normaliser({
    x: puissanceSignee(p.x, exposant - 1),
    y: puissanceSignee(p.y, exposant - 1),
    z: puissanceSignee(p.z, exposant - 1),
  });
}

/**
 * La direction du regard, exprimée dans le repère du solide.
 *
 * ⚠️ C'est l'inverse de `tournerTete` appliqué à l'axe de la caméra. On ne peut pas s'en
 * passer : la silhouette se calcule dans le repère où le solide est aligné, puis se
 * tourne — l'inverse demanderait de résoudre la même équation dans un repère où le
 * solide n'a plus de forme simple.
 */
export function regardDansLeSolide(orientation: Orientation): Vec3 {
  const { lacet, tangage } = orientation;
  const roulis = orientation.roulis ?? 0;
  // Roulis inverse (autour de Z), puis tangage inverse (X), puis lacet inverse (Y).
  const sr = Math.sin(-roulis), cr = Math.cos(-roulis);
  const x1 = 0 * cr - 0 * sr, y1 = 0 * sr + 0 * cr, z1 = 1;
  const st = Math.sin(-tangage), ct = Math.cos(-tangage);
  const x2 = x1, y2 = y1 * ct - z1 * st, z2 = y1 * st + z1 * ct;
  const sl = Math.sin(-lacet), cl = Math.cos(-lacet);
  return { x: x2 * cl + z2 * sl, y: y2, z: -x2 * sl + z2 * cl };
}

/** Un repère orthonormé du plan perpendiculaire à `v`. */
function baseDuPlan(v: Vec3): { e1: Vec3; e2: Vec3 } {
  const aide: Vec3 = Math.abs(v.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const e1 = normaliser({
    x: aide.y * v.z - aide.z * v.y,
    y: aide.z * v.x - aide.x * v.z,
    z: aide.x * v.y - aide.y * v.x,
  });
  const e2 = {
    x: v.y * e1.z - v.z * e1.y,
    y: v.z * e1.x - v.x * e1.z,
    z: v.x * e1.y - v.y * e1.x,
  };
  return { e1, e2 };
}

/**
 * La silhouette du solide vue selon `v`, dans le repère du solide.
 *
 * Elle se lit dans l'espace dual : la surface y devient la boule de la norme ℓⁿ′, et la
 * condition de silhouette un plan. Il ne reste qu'à parcourir un cercle dans ce plan.
 */
export class Silhouette {
  private readonly e1: Vec3;
  private readonly e2: Vec3;
  private readonly dual: number;

  constructor(private readonly regard: Vec3, private readonly exposant: number) {
    const base = baseDuPlan(normaliser(regard));
    this.e1 = base.e1;
    this.e2 = base.e2;
    this.dual = exposant / (exposant - 1);
  }

  /** Le point de la silhouette à l'angle `t`, sur le solide. */
  point(t: number): Vec3 {
    const c = Math.cos(t), s = Math.sin(t);
    const d = { x: this.e1.x * c + this.e2.x * s, y: this.e1.y * c + this.e2.y * s, z: this.e1.z * c + this.e2.z * s };
    const m = this.dual;
    const norme = Math.pow(
      Math.pow(Math.abs(d.x), m) + Math.pow(Math.abs(d.y), m) + Math.pow(Math.abs(d.z), m),
      1 / m,
    );
    const u = { x: d.x / norme, y: d.y / norme, z: d.z / norme };
    const inverse = 1 / (this.exposant - 1);
    return {
      x: puissanceSignee(u.x, inverse),
      y: puissanceSignee(u.y, inverse),
      z: puissanceSignee(u.z, inverse),
    };
  }

  /** L'angle auquel se trouve la silhouette la plus proche d'un point de la sphère. */
  angle(p: Vec3): number {
    const e = this.exposant - 1;
    const u = {
      x: puissanceSignee(p.x, e),
      y: puissanceSignee(p.y, e),
      z: puissanceSignee(p.z, e),
    };
    return Math.atan2(
      u.x * this.e2.x + u.y * this.e2.y + u.z * this.e2.z,
      u.x * this.e1.x + u.y * this.e1.y + u.z * this.e1.z,
    );
  }

  /** Le point de la silhouette le plus proche d'un point de la sphère. */
  ramener(p: Vec3): Vec3 {
    return this.point(this.angle(p));
  }

  /** Le contour complet, pour dessiner la tête. */
  contour(echantillons: number = 240): Vec3[] {
    const points: Vec3[] = [];
    for (let i = 0; i < echantillons; i++) points.push(this.point((i / echantillons) * TAU));
    return points;
  }
}

/** Un point du contour, tel qu'il se rend : sa position et sa visibilité. */
type Sommet = { solide: Vec3; sphere: Vec3; vu: boolean };

/**
 * Retire ce qui est passé derrière le solide, et referme le long de la silhouette.
 *
 * Le décalque de `couperHemisphere`, à trois différences près : la visibilité se lit sur
 * la normale, les traversées se ramènent sur la silhouette au lieu du cercle `z = 0`, et
 * l'arc de fermeture suit cette même silhouette. Le reste — démarrer sur une traversée,
 * refermer chaque morceau sur *sa* propre entrée, prendre le sens par l'aire de Newell —
 * est identique, et pour les mêmes raisons.
 */
function couper(
  sommets: Sommet[], silhouette: Silhouette, orientation: Orientation, pasArc: number,
): Vec3[][] {
  const n = sommets.length;
  let unVu = false, unCache = false;
  for (let i = 0; i < n; i++) (sommets[i].vu ? (unVu = true) : (unCache = true));
  if (!unVu) return [];
  if (!unCache) return [sommets.map(s => s.solide)];

  let depart = -1;
  for (let i = 0; i < n; i++) {
    if (sommets[i].vu && !sommets[(i - 1 + n) % n].vu) { depart = i; break; }
  }
  if (depart < 0) return [sommets.map(s => s.solide)];

  const tourner = (p: Vec3) =>
    tournerTete(p, orientation.lacet, orientation.tangage, orientation.roulis ?? 0);
  const sens = sensDeParcours(sommets.map(s => tourner(s.solide)));

  /** La traversée : on prend le milieu des deux sommets et on le pose sur la silhouette. */
  const traversee = (a: Sommet, b: Sommet): { angle: number; point: Vec3 } => {
    const milieu = normaliser({
      x: a.sphere.x + b.sphere.x, y: a.sphere.y + b.sphere.y, z: a.sphere.z + b.sphere.z,
    });
    const angle = silhouette.angle(milieu);
    return { angle, point: silhouette.point(angle) };
  };

  const pieces: Vec3[][] = [];
  let piece: Vec3[] | null = null;
  let entree = 0;

  for (let k = 0; k < n; k++) {
    const i = (depart + k) % n;
    const a = sommets[i];
    if (!a.vu) continue;
    const b = sommets[(i + 1) % n];

    if (piece === null) {
      const t = traversee(sommets[(i - 1 + n) % n], a);
      entree = t.angle;
      piece = [t.point];
    }
    piece.push(a.solide);

    if (!b.vu) {
      const t = traversee(a, b);
      piece.push(t.point);
      poserArcDeSilhouette(piece, silhouette, t.angle, entree, pasArc, sens);
      pieces.push(piece);
      piece = null;
    }
  }
  if (piece) pieces.push(piece);
  return pieces;
}

/**
 * Ajoute les points intermédiaires de la silhouette entre deux traversées.
 *
 * ⚠️ Même garde-fou que sur la sphère : l'écart est ramené dans `]−π, π]` et borné au
 * demi-tour. Au-delà, c'est que le sens a été pris à l'envers, et longer les trois
 * quarts du bord peindrait une lune entière.
 */
function poserArcDeSilhouette(
  sortie: Vec3[], silhouette: Silhouette,
  depart: number, arrivee: number, pas: number, sens: 1 | -1,
): void {
  let ecart = arrivee - depart;
  if (Math.abs(ecart) > Math.PI) ecart -= Math.sign(ecart) * TAU;
  if (Math.sign(ecart) !== sens) ecart += sens * TAU;
  if (Math.abs(ecart) > Math.PI) return;
  const combien = Math.floor(Math.abs(ecart) / pas);
  for (let k = 1; k <= combien; k++) {
    sortie.push(silhouette.point(depart + (ecart * k) / (combien + 1)));
  }
}

/** Rend un contour de la sphère sur le solide tournant, en `d` SVG. */
function rendre(
  contourSphere: Vec3[], orientation: Orientation, exposant: number, rayon: number,
): string {
  const silhouette = new Silhouette(regardDansLeSolide(orientation), exposant);
  const sommets: Sommet[] = contourSphere.map(p => {
    const normale = normaleSolide(p, exposant);
    const vue = tournerTete(normale, orientation.lacet, orientation.tangage, orientation.roulis ?? 0);
    return { solide: surLeSolide(p, exposant), sphere: p, vu: vue.z >= 0 };
  });
  const morceaux = couper(sommets, silhouette, orientation, 0.06);
  const bouts: string[] = [];
  for (const morceau of morceaux) {
    const ecran: Point2[] = morceau.map(q => projeter(
      tournerTete(q, orientation.lacet, orientation.tangage, orientation.roulis ?? 0), rayon));
    const d = cheminSvg(ecran);
    if (d) bouts.push(d);
  }
  return bouts.join(" ");
}

/** Le `d` d'un œil posé sur le solide qui tourne. */
export function cheminOeilSolide(
  reglages: ReglagesOeil, orientation: Orientation, cote: -1 | 1,
  rayon: number = RAYON_TETE, echantillons: number = 220, exposant: number = 2,
): string {
  const ancrage = ancrageOeil((cote * reglages.ecart) / rayon, reglages.elevation / rayon);
  const cos = Math.cos(reglages.inclinaison), sin = Math.sin(reglages.inclinaison);
  const contour = contourArrondi(
    reglages.largeur, reglages.hauteur, reglages.arrondi ?? 1, echantillons, reglages.courbure ?? 0);
  /**
   * ⚠️ **Aucune compensation ici, et c'est tout l'intérêt du mode.** Dans l'autre, l'œil
   * doit être rétréci d'avance de ce que le gonflement va lui rendre. Ici le gonflement
   * a lieu avant la rotation : l'œil est peint une fois pour toutes sur le solide, et
   * tourne avec lui. Il n'y a plus rien à corriger.
   */
  const surSphere = contour.map(c => surLaSphere(
    ancrage, cote * (c.x * cos - c.y * sin), c.x * sin + c.y * cos, rayon));
  return rendre(surSphere, orientation, exposant, rayon);
}

/** Le `d` d'un motif de skin, posé sur le solide qui tourne. */
export function cheminsSurLeSolide(
  morceaux: Vec3[][], orientation: Orientation,
  rayon: number = RAYON_TETE, exposant: number = 2,
): string {
  const bouts: string[] = [];
  for (const m of morceaux) {
    const d = rendre(m, orientation, exposant, rayon);
    if (d) bouts.push(d);
  }
  return bouts.join(" ");
}

/** Le contour de la tête : la silhouette du solide, projetée. */
export function contourTeteSolide(
  orientation: Orientation, exposant: number,
  rayon: number = RAYON_TETE, echantillons: number = 240,
): string {
  const silhouette = new Silhouette(regardDansLeSolide(orientation), exposant);
  return cheminSvg(silhouette.contour(echantillons).map(q => projeter(
    tournerTete(q, orientation.lacet, orientation.tangage, orientation.roulis ?? 0), rayon)));
}

/**
 * Un trait du maillage, séparé selon qu'il passe devant ou derrière le solide.
 *
 * Même partage que sur la sphère, à ceci près que « devant » se lit sur la normale.
 */
export function traitSurLeSolide(
  courbe: Vec3[], orientation: Orientation,
  rayon: number = RAYON_TETE, exposant: number = 2,
): { devant: string; derriere: string } {
  const silhouette = new Silhouette(regardDansLeSolide(orientation), exposant);
  const tourner = (p: Vec3) =>
    tournerTete(p, orientation.lacet, orientation.tangage, orientation.roulis ?? 0);
  const n = courbe.length;
  const vu = courbe.map(p => tourner(normaleSolide(p, exposant)).z >= 0);
  const ecran = courbe.map(p => projeter(tourner(surLeSolide(p, exposant)), rayon));

  const devant: Point2[][] = [];
  const derriere: Point2[][] = [];
  let morceau: Point2[] = [];
  let cote = vu[0];
  const bord = (a: number, b: number) => {
    const milieu = normaliser({
      x: courbe[a].x + courbe[b].x, y: courbe[a].y + courbe[b].y, z: courbe[a].z + courbe[b].z,
    });
    return projeter(tourner(silhouette.ramener(milieu)), rayon);
  };
  for (let i = 0; i < n; i++) {
    morceau.push(ecran[i]);
    const j = (i + 1) % n;
    if (vu[i] !== vu[j]) {
      const p = bord(i, j);
      morceau.push(p);
      (cote ? devant : derriere).push(morceau);
      cote = vu[j];
      morceau = [p];
    }
  }
  if (morceau.length >= 2) (cote ? devant : derriere).push(morceau);
  const ecrire = (l: Point2[][]) => l.map(cheminOuvert).filter(Boolean).join(" ");
  return { devant: ecrire(devant), derriere: ecrire(derriere) };
}
