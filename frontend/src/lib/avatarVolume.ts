import type { Vec3 } from "./avatarSpherique";

/**
 * Les volumes que la tête peut prendre, et rien d'autre.
 *
 * ⚠️ **Un descripteur plutôt qu'un exposant.** Tant qu'il n'y avait qu'une famille — la
 * superellipsoïde, du disque au cube — un simple nombre suffisait, et il traversait
 * toute la chaîne. L'étoile n'entre pas dans ce nombre : ce n'est pas le même calcul,
 * seulement le même *rôle*. Le faire passer pour un exposant aurait demandé une valeur
 * sentinelle, c'est-à-dire un mensonge que chaque fonction traversée aurait dû connaître.
 *
 * ⚠️ **Tous les volumes sont *étoilés* au sens géométrique** : leur surface se décrit par
 * un rayon en fonction de la direction. C'est cette propriété, et elle seule, qui permet
 * de garder toute la chaîne existante — poser la forme sur la sphère, la tourner, la
 * couper, la projeter — en n'ajoutant qu'une mise à l'échelle radiale. Un volume qui ne
 * l'aurait pas — un tore, une forme creusée — demanderait de tout reprendre.
 *
 * ⚠️ **Tous valent exactement 1 sur les axes, et c'est là l'invariant.** Il ne porte pas
 * sur le rayon — le cube pousse vers les coins et atteint 1,37 dans la direction d'une
 * arête, l'étoile creuse et descend sous 1 — mais sur l'**encombrement** : la silhouette
 * touche le cercle aux quatre milieux des côtés et ne sort jamais de son carré. Changer
 * de forme ne change donc pas la place que la tête occupe.
 */

export type Solide =
  /** La sphère, où la silhouette et la surface tiennent toutes deux en place. */
  | { famille: "sphere" }
  /** La superellipsoïde |x|ⁿ + |y|ⁿ + |z|ⁿ = 1 : du disque au cube arrondi. */
  | { famille: "cube"; exposant: number }
  /**
   * L'étoile adoucie : une sphère creusée entre ses six pointes d'axe.
   *
   * `creux` va de 0 (la sphère) à 1 (l'étoile franche). Le rayon vaut
   * `(1 + a·(x⁴+y⁴+z⁴)) / (1 + a)` — maximal sur les axes, minimal sur les diagonales.
   * La puissance quatrième plutôt qu'un cosinus : elle donne la même modulation à quatre
   * lobes dans le plan de l'écran, mais elle est **la même autour des trois axes**, donc
   * la forme reste une étoile sous n'importe quelle rotation au lieu de s'aplatir dès
   * qu'on la tourne.
   */
  | { famille: "etoile"; creux: number };

export const SPHERE: Solide = { famille: "sphere" };

/**
 * L'amplitude maximale du creusement.
 *
 * ⚠️ **Bornée par ce que le regard supporte, pas par ce qui est joli.** Un creux
 * concave rapproche le bord visible : la surface s'y détourne avant le quart de tour, et
 * l'œil qui passe par là se trouve coupé bien plus tôt que sur une sphère. Mesuré, à
 * quatre-vingt-seize centièmes de creux — ce que donnait le premier réglage — l'œil
 * commençait à être rogné dès **dix degrés de lacet** en volume tournant, là où la sphère
 * tient jusqu'à cinquante-sept. Le visage montrait alors un croissant d'œil collé au bord
 * en permanence : ce que l'on prend pour un défaut d'affichage, et qui n'est que la
 * géométrie d'un creux trop profond.
 *
 * À quarante-cinq centièmes, le creux se voit encore — dix pour cent de profondeur, le
 * galbe de la référence — et le rognage ne commence qu'au-delà du débattement du suivi.
 */
const AMPLEUR_ETOILE = 0.45;

/**
 * Le solide correspondant à une forme et à un réglage d'arrondi.
 *
 * `arrondi` vaut 1 pour la forme la plus ronde et 0 pour la plus marquée, dans les deux
 * familles : c'est le même curseur qui sert aux deux, et il va toujours du plus doux au
 * plus franc.
 */
export function solideDepuis(
  forme: "sphere" | "cube" | "etoile", arrondi: number,
): Solide {
  const a = Math.min(1, Math.max(0, arrondi));
  if (forme === "sphere" || a >= 1) return SPHERE;
  if (forme === "cube") return { famille: "cube", exposant: Math.min(24, 2 / Math.max(0.001, a)) };
  return { famille: "etoile", creux: (1 - a) * AMPLEUR_ETOILE };
}

export const estSphere = (s: Solide) => s.famille === "sphere";

const puissanceSignee = (v: number, e: number) =>
  (v === 0 ? 0 : Math.sign(v) * Math.pow(Math.abs(v), e));

/**
 * Le rayon du solide dans une direction donnée — le cœur de tout le module.
 *
 * `u` n'a pas besoin d'être unitaire : seule sa direction compte, et la fonction la
 * normalise. Le rayon vaut 1 sur les axes ; au-delà pour le cube, en deçà pour l'étoile.
 */
export function rayonSolide(u: Vec3, s: Solide): number {
  if (s.famille === "sphere") return 1;
  const l = Math.sqrt(u.x * u.x + u.y * u.y + u.z * u.z);
  if (l <= 1e-12) return 1;
  const x = Math.abs(u.x) / l, y = Math.abs(u.y) / l, z = Math.abs(u.z) / l;
  if (s.famille === "cube") {
    const n = s.exposant;
    const somme = Math.pow(x, n) + Math.pow(y, n) + Math.pow(z, n);
    return 1 / Math.pow(somme, 1 / n);
  }
  const a = s.creux;
  const q = x * x * x * x + y * y * y * y + z * z * z * z;
  return (1 + a * q) / (1 + a);
}

/** Le point du solide qui correspond à un point de la sphère : même direction. */
export function surLeSolide(p: Vec3, s: Solide): Vec3 {
  if (s.famille === "sphere") return p;
  const k = rayonSolide(p, s);
  return { x: p.x * k, y: p.y * k, z: p.z * k };
}

/**
 * La normale du solide, lue sur le point de la **sphère**.
 *
 * ⚠️ **Elle ne se confond avec la position que sur la sphère.** C'est la seule raison
 * pour laquelle le module principal n'a jamais eu à distinguer les deux, et la première
 * chose à corriger dès qu'un autre volume entre en scène : sur un cube ou une étoile, un
 * point peut être devant sans être vu, et inversement.
 *
 * Pour l'étoile, la normale vient du gradient de la forme implicite
 * `F(q) = (1+a)|q|⁵ − |q|⁴ − a(qx⁴+qy⁴+qz⁴)`, qui s'annule exactement sur la surface —
 * l'écriture polaire `ρ = r(u)` multipliée par `ρ⁴` pour n'avoir que des polynômes.
 */
export function normaleSolide(p: Vec3, s: Solide): Vec3 {
  if (s.famille === "sphere") return p;
  if (s.famille === "cube") {
    const e = s.exposant - 1;
    return normaliser({
      x: puissanceSignee(p.x, e),
      y: puissanceSignee(p.y, e),
      z: puissanceSignee(p.z, e),
    });
  }
  /**
   * ⚠️ **La direction d'abord, et ce n'est pas une précaution de style.** Le gradient de
   * l'étoile n'est pas invariant d'échelle : appelée avec un point déjà porté sur le
   * solide plutôt qu'avec un point de la sphère, la fonction le remettait à l'échelle une
   * seconde fois et rendait une normale fausse de dix-sept centièmes. Une normale fausse
   * ne casse rien de visible — elle décale seulement le bord —, ce qui est précisément
   * la manière dont ce genre d'erreur survit.
   */
  const q = surLeSolide(normaliser(p), s);
  const a = s.creux;
  const r = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z);
  const c = 5 * (1 + a) * r * r * r - 4 * r * r;
  return normaliser({
    x: c * q.x - 4 * a * q.x * q.x * q.x,
    y: c * q.y - 4 * a * q.y * q.y * q.y,
    z: c * q.z - 4 * a * q.z * q.z * q.z,
  });
}

function normaliser(v: Vec3): Vec3 {
  const n = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  return n === 0 ? v : { x: v.x / n, y: v.y / n, z: v.z / n };
}
