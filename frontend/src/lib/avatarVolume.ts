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
 * ⚠️ **Aucun ne sort de son carré, et c'est là l'invariant.** Il ne porte pas sur le
 * rayon — le cube pousse vers les coins et atteint 1,37 dans la direction d'une arête,
 * les étoiles creusent et descendent sous 1 — mais sur l'**encombrement** : la silhouette
 * reste dans le carré de côté 2, qu'elle touche sur les axes. Changer de forme ne change
 * donc pas la place que la tête occupe. Le coussin, écrasé, n'en occupe que les trois
 * quarts en hauteur : il ne dépasse pas davantage, il en prend moins.
 */

export type Solide =
  /** La sphère, où la silhouette et la surface tiennent toutes deux en place. */
  | { famille: "sphere" }
  /** La superellipsoïde |x|ⁿ + |y|ⁿ + |z|ⁿ = 1 : du disque au cube arrondi. */
  | { famille: "cube"; exposant: number }
  /**
   * L'étoile adoucie : une sphère pincée entre quatre lobes, autour de l'axe du regard.
   *
   * Le rayon vaut `1 − creux · 2x²y²`, et chacun des trois facteurs compte :
   *
   * ⚠️ **Rien sur `z`, donc aucune pointe devant ni derrière.** La première version
   * creusait autour des six axes, y compris celui du regard : les yeux voyageaient alors
   * en plein dans un creux, et la concavité y rapproche le bord visible au point de les
   * couper dès dix degrés de lacet. Ici le terme s'annule dès qu'on quitte le plan de
   * l'écran, si bien que le chemin du centre du visage jusqu'aux lobes latéraux reste
   * **exactement sphérique** — c'est précisément le chemin que parcourent les yeux.
   *
   * ⚠️ **`x²y²` et non `x⁴+y⁴`.** Les deux donnent la même modulation à quatre lobes dans
   * le plan de l'écran ; mais `x⁴+y⁴` vaut zéro au pôle du regard, ce qui y creuserait un
   * trou, tandis que `x²y²` s'y annule — pas de creux, pas de pointe, la surface y passe
   * lisse.
   */
  | { famille: "etoile"; creux: number }
  /**
   * La même à six lobes : `1 − creux · (3x²y − y³)²`.
   *
   * Le facteur vaut `ρ⁶ sin²(3θ)` dans le plan de l'écran — six creux, six lobes — et il
   * s'annule sur **trois** grands cercles au lieu de deux.
   */
  | { famille: "etoile6"; creux: number }
  /**
   * Le coussin : le cube arrondi, écrasé sur la verticale.
   *
   * ⚠️ **Un aplatissement du cube, et non un pincement des pôles.** La première version
   * valait `1 − creux · y⁴` : un pincement qui, passé un cinquième de creux, **affaisse
   * le milieu du bord** au lieu de l'aplatir. Le point le plus haut n'était plus au
   * sommet mais à soixante-neuf degrés, et le centre du bord supérieur pendait de 1,3 %
   * de la demi-hauteur — assez pour qu'on voie un bord mou là où l'on attend un côté.
   * En divisant `y` dans la formule du cube, le bord garde exactement la platitude d'un
   * cube et la forme s'aplatit sans jamais creuser.
   */
  | { famille: "coussin"; exposant: number; hauteur: number };

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
 * Le pincement ne portant plus sur l'axe du regard, cette contrainte s'est desserrée :
 * les yeux ne traversent plus de creux du tout. Soixante-douze centièmes donnent un
 * pincement d'un peu plus du tiers au bout de la course, et de dix-huit pour cent au
 * réglage de l'application — le galbe de la référence.
 */
const AMPLEUR_ETOILE = 0.72;

/**
 * Le solide correspondant à une forme et à un réglage d'arrondi.
 *
 * `arrondi` vaut 1 pour la forme la plus ronde et 0 pour la plus marquée, dans les deux
 * familles : c'est le même curseur qui sert aux deux, et il va toujours du plus doux au
 * plus franc.
 */
export type FamilleSolide = Solide["famille"];

/**
 * L'ampleur maximale de chaque famille, atteinte au bout de la course du réglage.
 *
 * ⚠️ **Une par famille, parce qu'elles ne se creusent pas au même rythme.** Le même
 * nombre appliqué à toutes donnerait un galet ridicule là où l'étoile serait à peine
 * marquée : ce que le curseur commande, c'est « du plus doux au plus franc », pas une
 * grandeur physique commune.
 */
const AMPLEUR: Record<Exclude<FamilleSolide, "sphere" | "cube" | "coussin">, number> = {
  etoile: AMPLEUR_ETOILE,
  /**
   * ⚠️ Plus prudente que l'étoile à quatre lobes, à profondeur égale : six creux serrés
   * font une silhouette qui se replie sur elle-même, et le contour y laisse alors de
   * petits éclats sombres — le remplissage ne sait pas quel côté est l'intérieur.
   */
  etoile6: 0.3,
};

/** Ce dont le coussin est écrasé sur la verticale — indépendant de l'arrondi des bords. */
const HAUTEUR_COUSSIN = 0.75;

export function solideDepuis(forme: FamilleSolide, arrondi: number): Solide {
  const a = Math.min(1, Math.max(0, arrondi));
  if (forme === "sphere" || a >= 1) return SPHERE;
  const exposant = Math.min(24, 2 / Math.max(0.001, a));
  if (forme === "cube") return { famille: "cube", exposant };
  if (forme === "coussin") return { famille: "coussin", exposant, hauteur: HAUTEUR_COUSSIN };
  return { famille: forme, creux: (1 - a) * AMPLEUR[forme] };
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
  switch (s.famille) {
    case "cube": {
      const n = s.exposant;
      return 1 / Math.pow(Math.pow(x, n) + Math.pow(y, n) + Math.pow(z, n), 1 / n);
    }
    case "etoile":
      return 1 - s.creux * 2 * x * x * y * y;
    case "etoile6": {
      const f = 3 * x * x * y - y * y * y;
      return 1 - s.creux * f * f;
    }
    default: {
      // Le cube, mais dont la verticale est comptée plus cher : il s'écrase d'autant.
      const n = s.exposant, h = s.hauteur;
      return 1 / Math.pow(
        Math.pow(x, n) + Math.pow(y / h, n) + Math.pow(z, n), 1 / n);
    }
  }
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
 * ⚠️ **Calculée par différences finies, et non par un gradient écrit à la main pour
 * chaque forme.** Toutes les surfaces d'ici sont radiales, `ρ = r(u)` : la normale s'en
 * déduit une fois pour toutes par `n ∝ u − (∇r)⊥ / r`, où seul `∇r` dépend de la famille.
 * Sept gradients écrits à la main, c'étaient sept occasions de se tromper d'un signe — et
 * une normale fausse ne casse rien de visible, elle décale seulement le bord, ce qui est
 * la manière dont ce genre d'erreur survit. Un test confronte le résultat aux deux
 * gradients qu'on sait écrire exactement, celui du cube et celui de l'étoile.
 *
 * ⚠️ **La dérivée se prend le long de la sphère, pas dans l'espace.** Le point avancé est
 * renormalisé par `rayonSolide`, qui ne regarde que la direction : sans cela on
 * mesurerait aussi la variation due au fait d'avoir quitté la sphère, et la normale
 * pencherait d'autant.
 */
export function normaleSolide(p: Vec3, s: Solide): Vec3 {
  const u = normaliser(p);
  if (s.famille === "sphere") return u;
  const r = rayonSolide(u, s);
  const { e1, e2 } = baseTangente(u);
  const h = 1e-4;
  const pas = (e: Vec3, signe: number) => rayonSolide(
    { x: u.x + signe * h * e.x, y: u.y + signe * h * e.y, z: u.z + signe * h * e.z }, s);
  const d1 = (pas(e1, 1) - pas(e1, -1)) / (2 * h);
  const d2 = (pas(e2, 1) - pas(e2, -1)) / (2 * h);
  return normaliser({
    x: u.x - (d1 * e1.x + d2 * e2.x) / r,
    y: u.y - (d1 * e1.y + d2 * e2.y) / r,
    z: u.z - (d1 * e1.z + d2 * e2.z) / r,
  });
}

/** Deux directions orthonormées tangentes à la sphère en `u`. */
function baseTangente(u: Vec3): { e1: Vec3; e2: Vec3 } {
  const aide: Vec3 = Math.abs(u.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const e1 = normaliser({
    x: aide.y * u.z - aide.z * u.y,
    y: aide.z * u.x - aide.x * u.z,
    z: aide.x * u.y - aide.y * u.x,
  });
  return {
    e1,
    e2: {
      x: u.y * e1.z - u.z * e1.y,
      y: u.z * e1.x - u.x * e1.z,
      z: u.x * e1.y - u.y * e1.x,
    },
  };
}

function normaliser(v: Vec3): Vec3 {
  const n = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  return n === 0 ? v : { x: v.x / n, y: v.y / n, z: v.z / n };
}
