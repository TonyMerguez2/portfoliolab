import {
  RAYON_TETE, type Orientation, type Point2, type Vec3,
  ancrageOeil, cheminOuvert, cheminSvg, contourArrondi, projeter, sensDeParcours,
  surLaSphere, tournerTete, type ReglagesOeil,
} from "./avatarSpherique";
import { SPHERE, type Solide, estSphere, normaleSolide, surLeSolide } from "./avatarVolume";

export { normaleSolide, surLeSolide };

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
 * ⚠️ **La silhouette se cherche, elle ne se calcule pas.** Le long de chaque méridien
 * partant du point qui nous fait face, la normale bascule de « vers nous » vers
 * « derrière » : le changement de signe donne le bord. Une dichotomie suffit, et elle
 * vaut pour n'importe quel volume étoilé — c'est ce qui a permis d'ajouter l'étoile sans
 * rien réécrire. La superellipsoïde, elle, en admet une forme close ; un test s'en sert
 * comme témoin pour vérifier que la recherche tombe au même endroit.
 *
 * ⚠️ **Ce qui ne vaut que pour les formes convexes, et qu'il faut savoir.** « Vu » est
 * ici défini par « sa normale regarde vers nous ». Sur une sphère ou un cube arrondi,
 * c'est exact. Sur l'étoile, qui est creusée, un point peut regarder vers nous tout en
 * étant caché derrière une branche : à fort creux et sous un angle rasant, un morceau de
 * fond peut donc reparaître. Le rendre juste demanderait un test d'occultation, c'est-à-
 * dire un lancer de rayon par point — hors de proportion avec ce que cela corrigerait.
 */

const TAU = Math.PI * 2;

/**
 * Sur combien de méridiens le bord est cherché.
 *
 * ⚠️ **Mesuré, pas choisi.** À quatre-vingt-seize, l'interpolation entre deux méridiens
 * s'écartait de la vraie normale de six centièmes près d'une arête de cube — trois degrés,
 * assez pour que le contour s'y aplatisse visiblement. À cent quatre-vingt-douze l'écart
 * tombe sous le millième, et la table se construit une fois par image.
 */
const ECHANTILLONS_BORD = 192;

function normaliser(v: Vec3): Vec3 {
  const n = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  return n === 0 ? v : { x: v.x / n, y: v.y / n, z: v.z / n };
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
 * ⚠️ **Trouvée par balayage puis dichotomie, et non par une formule.** La superellipsoïde
 * en avait une : dans l'espace dual, sa silhouette est l'intersection d'une boule et d'un
 * plan. L'étoile n'en a pas, et écrire deux chemins — l'un exact, l'autre approché —
 * aurait fait diverger les deux formes au premier ajustement. On garde donc la méthode
 * générale, et **un test la confronte à la formule exacte** là où celle-ci existe : c'est
 * la seule façon d'avoir à la fois une méthode unique et l'assurance qu'elle est juste.
 *
 * Le principe : le long d'un méridien allant du point qui nous fait face au point opposé,
 * la normale passe de « vers nous » à « vers l'arrière ». Le changement de signe donne la
 * silhouette. On prend le **premier**, pour tenir le contour extérieur même quand la
 * forme est creusée et que la normale se retourne plusieurs fois.
 */
export class Silhouette {
  private readonly e1: Vec3;
  private readonly e2: Vec3;
  private readonly axe: Vec3;
  /**
   * L'angle méridien du bord, échantillonné tout autour.
   *
   * ⚠️ **C'est cette table qui rend le contour et la visibilité *cohérents*.** Sans elle,
   * le bord venait d'une recherche et la visibilité d'un test indépendant — « la normale
   * regarde-t-elle vers nous ? ». Les deux ne disent pas la même chose sur une forme
   * creusée : au fond d'un creux, la normale peut regarder vers nous alors que le point
   * est passé derrière le bord. Vu à l'écran, l'œil qui rasait le bord de l'étoile ne
   * gardait qu'un mince croissant collé à la silhouette, le reste étant déclaré caché.
   * Ici, un point est vu s'il est **en deçà du bord sur son propre méridien** : la même
   * table décide de l'un et de l'autre, ils ne peuvent plus se contredire.
   */
  private readonly bord: number[] | null;

  constructor(regard: Vec3, private readonly solide: Solide, echantillons: number = ECHANTILLONS_BORD) {
    this.axe = normaliser(regard);
    const base = baseDuPlan(this.axe);
    this.e1 = base.e1;
    this.e2 = base.e2;
    this.bord = estSphere(solide) ? null : this.tabler(echantillons);
  }

  /** La direction du méridien d'angle `t`, dans le plan perpendiculaire au regard. */
  private direction(t: number): Vec3 {
    const c = Math.cos(t), s = Math.sin(t);
    return {
      x: this.e1.x * c + this.e2.x * s,
      y: this.e1.y * c + this.e2.y * s,
      z: this.e1.z * c + this.e2.z * s,
    };
  }

  /** Le point de la sphère à l'angle méridien `s` sur le méridien `t`. */
  private surLeMeridien(t: number, angle: number): Vec3 {
    const d = this.direction(t);
    const ca = Math.cos(angle), sa = Math.sin(angle);
    return {
      x: this.axe.x * ca + d.x * sa,
      y: this.axe.y * ca + d.y * sa,
      z: this.axe.z * ca + d.z * sa,
    };
  }

  /**
   * Cherche l'angle du bord sur chaque méridien.
   *
   * Le long d'un méridien partant du point qui nous fait face, la normale bascule de
   * « vers nous » vers « derrière ». On prend le **premier** basculement : c'est le bord
   * extérieur, celui qui compte, même quand la forme est creusée et que la normale se
   * retourne plus loin.
   */
  private tabler(n: number): number[] {
    const table: number[] = [];
    const PAS = Math.PI / 16;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TAU;
      const face = (angle: number) => {
        const N = normaleSolide(this.surLeMeridien(t, angle), this.solide);
        return N.x * this.axe.x + N.y * this.axe.y + N.z * this.axe.z;
      };
      let a = 0, b = Math.PI;
      let precedent = face(0);
      for (let angle = PAS; angle <= Math.PI + 1e-9; angle += PAS) {
        const v = face(angle);
        if (precedent >= 0 && v < 0) { a = angle - PAS; b = angle; break; }
        precedent = v;
      }
      for (let k = 0; k < 12; k++) {
        const m = (a + b) / 2;
        if (face(m) >= 0) a = m; else b = m;
      }
      table.push((a + b) / 2);
    }
    return table;
  }

  /** L'angle méridien du bord, à l'angle `t` — interpolé entre deux échantillons. */
  private angleDuBord(t: number): number {
    if (!this.bord) return Math.PI / 2;
    const n = this.bord.length;
    const x = ((t % TAU) + TAU) / TAU * n;
    const i = Math.floor(x) % n;
    const f = x - Math.floor(x);
    return this.bord[i] * (1 - f) + this.bord[(i + 1) % n] * f;
  }

  /** Le point de la silhouette à l'angle `t`, sur le solide. */
  point(t: number): Vec3 {
    return surLeSolide(this.surLeMeridien(t, this.angleDuBord(t)), this.solide);
  }

  /**
   * L'angle auquel se trouve la silhouette la plus proche d'un point de la sphère.
   *
   * C'est simplement l'angle de sa composante perpendiculaire au regard : la
   * paramétrisation est faite pour que ce soit vrai, chaque angle désignant un méridien.
   */
  angle(p: Vec3): number {
    return Math.atan2(
      p.x * this.e2.x + p.y * this.e2.y + p.z * this.e2.z,
      p.x * this.e1.x + p.y * this.e1.y + p.z * this.e1.z,
    );
  }

  /**
   * Ce point de la sphère est-il, une fois porté sur le solide, du côté visible ?
   *
   * ⚠️ **Deux conditions, et il faut les deux.** La normale qui regarde vers nous ne
   * suffit pas : au fond d'un creux, elle peut nous faire face alors que le point est
   * passé derrière le bord — c'est ce qui laissait un croissant d'œil déborder de
   * l'étoile, mesuré à quatorze points sur cent treize. Être en deçà du bord ne suffit
   * pas non plus : sur le flanc arrière d'une branche, un point reste en deçà tout en
   * tournant le dos. Leur conjonction tient les deux bouts, et redonne exactement le
   * test d'origine sur une forme convexe, où elles coïncident.
   */
  vu(p: Vec3, normaleTournee: Vec3): boolean {
    if (normaleTournee.z < 0) return false;
    const cos = p.x * this.axe.x + p.y * this.axe.y + p.z * this.axe.z;
    return Math.acos(Math.min(1, Math.max(-1, cos))) <= this.angleDuBord(this.angle(p));
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

/**
 * La silhouette de l'orientation courante, gardée d'un appel à l'autre.
 *
 * ⚠️ **Une seule entrée suffit, et ce n'est pas un hasard.** Dans une image, tout — les
 * deux yeux, chaque motif de skin, chaque trait du maillage — se rend sous la même
 * orientation et le même solide. Un cache d'une entrée touche donc à chaque fois, là où
 * reconstruire la table à chaque appel coûterait vingt-cinq fois le même travail.
 */
let derniere: { regard: Vec3; solide: Solide; valeur: Silhouette } | null = null;

export function silhouettePour(orientation: Orientation, solide: Solide): Silhouette {
  const regard = regardDansLeSolide(orientation);
  if (derniere && derniere.solide === solide
    && Math.abs(derniere.regard.x - regard.x) < 1e-12
    && Math.abs(derniere.regard.y - regard.y) < 1e-12
    && Math.abs(derniere.regard.z - regard.z) < 1e-12) {
    return derniere.valeur;
  }
  const valeur = new Silhouette(regard, solide);
  derniere = { regard, solide, valeur };
  return valeur;
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
  contourSphere: Vec3[], orientation: Orientation, solide: Solide, rayon: number,
): string {
  const silhouette = silhouettePour(orientation, solide);
  const tourne = (v: Vec3) =>
    tournerTete(v, orientation.lacet, orientation.tangage, orientation.roulis ?? 0);
  const sommets: Sommet[] = contourSphere.map(p => ({
    solide: surLeSolide(p, solide), sphere: p,
    vu: silhouette.vu(p, tourne(normaleSolide(p, solide))),
  }));
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
  rayon: number = RAYON_TETE, echantillons: number = 220, solide: Solide = SPHERE,
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
  return rendre(surSphere, orientation, solide, rayon);
}

/** Le `d` d'un motif de skin, posé sur le solide qui tourne. */
export function cheminsSurLeSolide(
  morceaux: Vec3[][], orientation: Orientation,
  rayon: number = RAYON_TETE, solide: Solide = SPHERE,
): string {
  const bouts: string[] = [];
  for (const m of morceaux) {
    const d = rendre(m, orientation, solide, rayon);
    if (d) bouts.push(d);
  }
  return bouts.join(" ");
}

/** Le contour de la tête : la silhouette du solide, projetée. */
export function contourTeteSolide(
  orientation: Orientation, solide: Solide,
  rayon: number = RAYON_TETE, echantillons: number = 240,
): string {
  const silhouette = silhouettePour(orientation, solide);
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
  rayon: number = RAYON_TETE, solide: Solide = SPHERE,
): { devant: string; derriere: string } {
  const silhouette = silhouettePour(orientation, solide);
  const tourner = (p: Vec3) =>
    tournerTete(p, orientation.lacet, orientation.tangage, orientation.roulis ?? 0);
  const n = courbe.length;
  const vu = courbe.map(p => silhouette.vu(p, tourner(normaleSolide(p, solide))));
  const ecran = courbe.map(p => projeter(tourner(surLeSolide(p, solide)), rayon));

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
