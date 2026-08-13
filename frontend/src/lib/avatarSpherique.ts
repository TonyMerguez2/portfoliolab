/**
 * La géométrie d'un regard posé sur une sphère.
 *
 * ⚠️ **Aucun dessin n'est stocké, et c'est tout l'intérêt.** L'approche habituelle
 * — un SVG par orientation — demande de redessiner à la main chaque pose, ne permet
 * aucune valeur intermédiaire, et fait que la moindre retouche de la forme oblige à
 * refaire tous les fichiers. Ici il n'existe qu'un seul contour, celui de la capsule,
 * et la rotation de la tête le **déforme réellement** : chaque point du même contour
 * est peint sur la sphère, tourné en trois dimensions, puis ramené dans le plan.
 * L'orientation devient une donnée continue, pas une image à choisir.
 *
 * La chaîne, dans l'ordre :
 *
 * 1. `contourCapsule` échantillonne la forme dans le plan local de l'œil.
 * 2. `ancrageOeil` place l'œil sur la sphère et lui donne un repère tangent.
 * 3. `surLaSphere` transporte chaque point du contour sur la surface.
 * 4. `tournerTete` applique le lacet et le tangage.
 * 5. `couperHemisphere` retire ce qui est passé derrière.
 * 6. `projeter` ramène en deux dimensions, et `cheminSvg` écrit le `d`.
 *
 * ⚠️ **Le transport se fait par carte exponentielle, pas par projection du plan
 * tangent.** La différence est visible : le plan tangent étire les bords — un œil
 * long paraît grossir à mesure qu'il s'éloigne de son ancre — alors que la carte
 * exponentielle conserve les distances **le long de la surface**. C'est la définition
 * même de « posé sur la sphère » : la forme garde sa taille de dessin, et seule sa
 * projection à l'écran se comprime. C'est ce qui donne l'impression de peinture sur
 * un objet plutôt que de décalque.
 */

import { SPHERE, type Solide, rayonSolide, surLeSolide } from "./avatarVolume";

export type Vec3 = { x: number; y: number; z: number };
export type Point2 = { x: number; y: number };

/**
 * Le rayon de la tête, en unités de surface.
 *
 * Cent, pour que les réglages se lisent : un œil de « 66 u » de haut couvre 66
 * centièmes de radian d'arc, soit un peu plus d'un tiers du rayon. Les largeurs et
 * les écarts s'expriment dans la même unité, celle du **ruban tendu sur la sphère**
 * et non celle de l'écran — deux valeurs qui ne coïncident qu'au centre du visage.
 */
export const RAYON_TETE = 100;

const TAU = Math.PI * 2;

function normaliser(v: Vec3): Vec3 {
  const n = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  return n === 0 ? v : { x: v.x / n, y: v.y / n, z: v.z / n };
}

/**
 * Le contour d'une capsule — un rectangle aux bouts entièrement arrondis.
 *
 * ⚠️ **Échantillonné à pas constant le long du périmètre, y compris sur les côtés
 * droits.** C'est contre-intuitif : dans le plan, deux points suffisent à décrire un
 * segment. Mais un segment droit dans le repère local ne l'est plus une fois posé sur
 * la sphère et tourné — il devient un arc. Ne l'échantillonner qu'à ses extrémités
 * rendrait un œil dont les longs côtés restent obstinément droits pendant que les
 * bouts s'incurvent, ce qui se voit immédiatement.
 *
 * Les points sont rendus dans un repère **v vers le haut**, celui de la surface ; le
 * passage aux coordonnées de l'écran, où v descend, se fait à la projection.
 *
 * ⚠️ **La forme s'aplatit aussi bien qu'elle s'allonge**, et ce n'est pas une
 * symétrie gratuite : c'est ce qui rend le clignement possible. Une capsule dont le
 * rayon serait toujours la demi-largeur dégénérerait en **disque** dès que la hauteur
 * passe sous la largeur — un œil qui se ferme deviendrait alors une bille, et
 * refuserait de descendre plus bas. En prenant le rayon sur la **plus petite** des
 * deux dimensions, la même formule donne une capsule verticale, un cercle, puis une
 * fente horizontale, sans discontinuité. Fermer un œil n'est plus qu'un réglage de
 * hauteur qui tend vers zéro.
 */
export function contourCapsule(
  largeur: number, hauteur: number, echantillons: number, courbure: number = 0,
): Point2[] {
  return contourArrondi(largeur, hauteur, 1, echantillons, courbure);
}

/**
 * La même forme, mais dont on choisit l'arrondi des quatre coins.
 *
 * ⚠️ **La capsule n'était qu'un cas particulier de cette fonction, et le code le disait
 * déjà.** Le parcours interne suivait un rectangle à coins ronds — quatre côtés, quatre
 * quarts de cercle — dont seul le rayon était imposé : le plus grand possible. Ajouter
 * une « forme carrée » n'a donc rien demandé de neuf, seulement de rendre ce rayon
 * réglable. Une seconde fonction, avec son propre échantillonnage et sa propre cambrure,
 * aurait doublé le chemin par lequel un œil peut se tromper.
 *
 * ⚠️ **L'arrondi est une *fraction*, pas une longueur.** Le rayon maximal vaut la moitié
 * de la plus petite dimension, et cette dimension change en permanence — c'est par elle
 * que passe le clignement. Un rayon en unités absolues devrait être rogné à chaque
 * image dès que l'œil se ferme, et l'on verrait la forme changer de proportions au
 * milieu du clignement. Une fraction garde le même galbe de l'œil ouvert à la fente.
 *
 * `arrondi` vaut 1 pour la capsule, 0 pour un rectangle à angles vifs.
 */
export function contourArrondi(
  largeur: number, hauteur: number, arrondi: number,
  echantillons: number, courbure: number = 0,
): Point2[] {
  const demiL = Math.max(0.001, largeur / 2);
  const demiH = Math.max(0.001, hauteur / 2);
  const r = Math.min(demiL, demiH) * Math.min(1, Math.max(0, arrondi));
  // Les parties droites : avec l'arrondi maximal, l'une des deux est toujours nulle.
  const plat = 2 * (demiL - r);
  const dressé = 2 * (demiH - r);
  const perimetre = 2 * plat + 2 * dressé + TAU * r;
  const points: Point2[] = [];
  for (let i = 0; i < echantillons; i++) {
    const p = pointSurCapsule((i / echantillons) * perimetre, r, plat, dressé);
    points.push(courbure === 0 ? p : cambrer(p, demiL, courbure));
  }
  return points;
}

/**
 * Cambre la forme : le milieu monte, les bords descendent — l'œil arqué « ⌒ ».
 *
 * ⚠️ **Toujours dans le même sens, quelle que soit la forme de l'œil.** La tentation
 * était de cambrer perpendiculairement au grand axe : joli sur un œil aplati, mais le
 * grand axe **bascule** quand la hauteur passe sous la largeur — et un œil qui s'aplatit
 * en passant du neutre au content traverse ce basculement. La cambrure aurait sauté d'un
 * axe à l'autre en pleine transition. Ici elle décale toujours `y` selon `x` : franche
 * sur un œil large, presque nulle sur un œil haut, et continue entre les deux.
 */
function cambrer(p: Point2, demiLargeur: number, courbure: number): Point2 {
  const t = p.x / demiLargeur;
  return { x: p.x, y: p.y + courbure * (1 - t * t) * demiLargeur };
}

/**
 * Le point à l'abscisse curviligne `s`, en partant du milieu du côté droit.
 *
 * Le parcours est celui d'un rectangle à coins ronds : côté, coin, côté, coin… `r` est
 * le rayon des coins, `plat` et `dressé` les longueurs des parties droites.
 */
function pointSurCapsule(s: number, r: number, plat: number, dressé: number): Point2 {
  const cx = plat / 2, cy = dressé / 2;
  const quart = (Math.PI / 2) * r;
  // Les huit tronçons, dans l'ordre du parcours : côté, coin, côté, coin…
  const etapes: number[] = [dressé, quart, plat, quart, dressé, quart, plat, quart];
  let reste = s;
  let etape = 0;
  while (etape < etapes.length && reste >= etapes[etape]) {
    reste -= etapes[etape];
    etape++;
  }
  const coin = (centreX: number, centreY: number, depart: number) => {
    // ⚠️ Sans arrondi, le coin n'a plus de longueur : `reste / r` y vaudrait l'infini
    // et le point partirait en NaN. Il ne reste alors que l'angle lui-même.
    if (r <= 0) return { x: centreX, y: centreY };
    const t = depart + reste / r;
    return { x: centreX + r * Math.cos(t), y: centreY + r * Math.sin(t) };
  };
  switch (etape) {
    case 0: return { x: cx + r, y: -cy + reste };
    case 1: return coin(cx, cy, 0);
    case 2: return { x: cx - reste, y: cy + r };
    case 3: return coin(-cx, cy, Math.PI / 2);
    case 4: return { x: -cx - r, y: cy - reste };
    case 5: return coin(-cx, -cy, Math.PI);
    case 6: return { x: -cx + reste, y: -cy - r };
    default: return coin(cx, -cy, (3 * Math.PI) / 2);
  }
}

/** Un œil posé sur la sphère : sa position, et le repère tangent qui l'accompagne. */
export type Ancrage = {
  /** Le point de la sphère unité où l'œil est planté. */
  centre: Vec3;
  /** Le vecteur tangent qui va vers la droite de la surface. */
  versDroite: Vec3;
  /** Le vecteur tangent qui va vers le haut de la surface. */
  versHaut: Vec3;
};

/**
 * Plante un œil à une longitude et une latitude, avec son repère de surface.
 *
 * ⚠️ **Le repère est celui de la surface, pas celui de l'écran.** Il est obtenu en
 * dérivant la position par rapport aux deux angles, ce qui donne deux vecteurs
 * automatiquement tangents et orthogonaux — l'inclinaison locale de l'œil tourne donc
 * *dans le plan de la peau*. Prendre à la place les axes de l'écran aurait fait
 * glisser la capsule hors de la surface dès que la tête tourne, et l'illusion
 * s'effondre exactement là où on l'attend le plus.
 *
 * La tête regarde vers `+z`, c'est-à-dire vers celui qui l'observe.
 */
export function ancrageOeil(longitude: number, latitude: number): Ancrage {
  const sl = Math.sin(longitude), cl = Math.cos(longitude);
  const sf = Math.sin(latitude), cf = Math.cos(latitude);
  return {
    centre: { x: sl * cf, y: sf, z: cl * cf },
    versDroite: { x: cl, y: 0, z: -sl },
    versHaut: { x: -sl * sf, y: cf, z: -cl * sf },
  };
}

/**
 * Transporte un point du plan local sur la sphère, à distance géodésique constante.
 *
 * C'est la carte exponentielle : `u` et `v` sont des longueurs **d'arc**, pas des
 * coordonnées de plan. Un point à 33 u de son ancre reste à 33 u de son ancre une
 * fois sur la surface, quelle que soit l'orientation de la tête.
 */
export function surLaSphere(
  ancrage: Ancrage, u: number, v: number, rayon: number,
): Vec3 {
  const longueur = Math.sqrt(u * u + v * v);
  if (longueur < 1e-9) return ancrage.centre;
  const angle = longueur / rayon;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const du = u / longueur, dv = v / longueur;
  const tx = ancrage.versDroite.x * du + ancrage.versHaut.x * dv;
  const ty = ancrage.versDroite.y * du + ancrage.versHaut.y * dv;
  const tz = ancrage.versDroite.z * du + ancrage.versHaut.z * dv;
  return {
    x: ancrage.centre.x * cos + tx * sin,
    y: ancrage.centre.y * cos + ty * sin,
    z: ancrage.centre.z * cos + tz * sin,
  };
}

/**
 * Applique la rotation de la tête : lacet autour de la verticale, tangage autour de
 * l'horizontale.
 *
 * Le lacet d'abord, le tangage ensuite. L'ordre compte dès que les deux sont non
 * nuls — les rotations ne commutent pas — et celui-ci est celui d'une tête : on
 * tourne le regard de côté, puis on lève ou baisse le menton. L'inverse ferait
 * pencher le visage lorsqu'il regarde en biais vers le haut.
 */
export function tournerTete(
  p: Vec3, lacet: number, tangage: number, roulis: number = 0,
): Vec3 {
  const sl = Math.sin(lacet), cl = Math.cos(lacet);
  const x1 = p.x * cl + p.z * sl;
  const z1 = -p.x * sl + p.z * cl;
  const st = Math.sin(tangage), ct = Math.cos(tangage);
  const x2 = x1, y2 = p.y * ct - z1 * st, z2 = p.y * st + z1 * ct;
  if (roulis === 0) return { x: x2, y: y2, z: z2 };
  /**
   * ⚠️ **Le roulis vient en dernier, autour de l'axe du regard.** C'est la tête qui
   * penche sur le côté, le geste de la curiosité — et le seul des trois qui **ne change
   * pas** la cote : il fait tourner l'image dans son propre plan. La coupe de
   * l'hémisphère et la silhouette n'en sont donc pas affectées, ce qui rend cette
   * rotation gratuite pour tout le reste du module.
   */
  const sr = Math.sin(roulis), cr = Math.cos(roulis);
  return { x: x2 * cr - y2 * sr, y: x2 * sr + y2 * cr, z: z2 };
}

/**
 * Retire du contour ce qui est passé derrière la tête.
 *
 * ⚠️ **Sans cette coupe, un œil qui contourne le bord reparaît à l'envers.** Une
 * projection orthographique écrase l'avant et l'arrière au même endroit : la partie
 * cachée de la capsule reviendrait se replier sur la partie visible, en un nœud qui
 * ne ressemble à rien.
 *
 * Les points d'entrée et de sortie sont **renormalisés** sur la sphère. Interpolés
 * bêtement, ils tomberaient à l'intérieur du volume, donc en retrait du bord du
 * disque, et l'œil semblerait décoller de la silhouette au lieu d'y être coupé net.
 *
 * ⚠️ **Le résultat est une *liste* de contours, et il fallait bien en arriver là.** Un
 * motif peut percer devant en plusieurs endroits séparés — un ruban presque tangent à
 * la silhouette y pointe par ses deux bouts. Refermer chaque morceau sur l'entrée du
 * **suivant**, comme le fait le découpage classique contre une droite, revient à relier
 * deux régions disjointes en passant par tout le tour de la tête. Mesuré : un tronçon
 * de la couture de tennis se refermait par un arc de 357° et peignait 99,9 % du disque.
 * Chaque morceau se referme donc sur **sa propre** entrée, ce qui rend des régions
 * séparées — la vérité géométrique — et rend le sens de parcours enfin cohérent d'un
 * morceau à l'autre.
 *
 * ⚠️ **Entre deux traversées, le contour suit l'arc du bord, pas une corde.** Refermer
 * en ligne droite paraissait négligeable — et l'est tant que l'œil reste petit. Vu à
 * l'écran sur une capsule agrandie une fois et demie et rasant la silhouette, le
 * raccourci ouvre un coin de fond entre la forme et le bord de la tête : l'œil semble
 * rogné par un angle droit là où il devrait épouser la rondeur. Les points ajoutés
 * sont interpolés sur le grand cercle `z = 0`, donc exactement sur la silhouette.
 */
export function couperHemisphere(contour: Vec3[], pasArc: number = 0.06): Vec3[][] {
  // ⚠️ **Rien devant, rien à dessiner** — et ce garde vaut mieux que de faire confiance
  // au reste de la fonction. Un contour qui affleure la silhouette sans jamais la
  // franchir ne laisse que des sommets de cote nulle, à partir desquels tout ce qui
  // suit doit deviner un côté qui n'existe pas. On le dit ici plutôt que de le
  // découvrir en aval.
  const n = contour.length;
  let devant = -Infinity, derriere = Infinity;
  for (let i = 0; i < n; i++) {
    devant = Math.max(devant, contour[i].z);
    derriere = Math.min(derriere, contour[i].z);
  }
  if (devant <= 1e-9) return [];
  if (derriere >= 0) return [contour];

  /**
   * ⚠️ **Le parcours démarre sur une *entrée*, pas sur un sommet visible quelconque.**
   * C'est ce qui permet à chaque morceau de connaître la traversée par laquelle il a
   * commencé, donc de se refermer sur elle.
   */
  let depart = -1;
  for (let i = 0; i < n; i++) {
    if (contour[i].z >= 0 && contour[(i - 1 + n) % n].z < 0) { depart = i; break; }
  }
  if (depart < 0) return [contour];

  const sens = sensDeParcours(contour);
  const traversee = (a: Vec3, b: Vec3): Vec3 => {
    const t = a.z / (a.z - b.z);
    return normaliser({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: 0,
    });
  };

  const pieces: Vec3[][] = [];
  let piece: Vec3[] | null = null;
  let entree: Vec3 | null = null;

  for (let k = 0; k < n; k++) {
    const i = (depart + k) % n;
    const a = contour[i];
    if (a.z < 0) continue;
    const b = contour[(i + 1) % n];

    if (piece === null) {
      entree = traversee(contour[(i - 1 + n) % n], a);
      piece = [entree];
    }
    piece.push(a);

    if (b.z < 0) {
      const sortie = traversee(a, b);
      piece.push(sortie);
      poserArcDeBord(piece, sortie, entree as Vec3, pasArc, sens);
      pieces.push(piece);
      piece = null;
    }
  }
  if (piece) pieces.push(piece);
  return pieces;
}

/**
 * Le sens dans lequel le contour tourne, vu depuis l'extérieur de la sphère.
 *
 * ⚠️ **C'est la seule donnée exacte qui lève l'ambiguïté du bord**, et j'y suis venu
 * après deux règles approchées. La première prenait le plus court arc : fausse dès que
 * les deux traversées sont diamétralement opposées, ce qui arrive à tout panneau bordé
 * par deux méridiens. La seconde visait le centre des sommets cachés : fausse quand la
 * partie cachée fait le tour de l'arrière, car sa projection se referme autour de
 * l'origine et ne désigne plus aucun côté — mesuré sur la couture arrière du ballon de
 * basket, dont le centre des cachés tombait à 0,01 de l'origine et penchait, d'un
 * cheveu, du mauvais côté. La couture peignait alors 99,9 % du disque.
 *
 * Le raisonnement juste ne porte pas sur les positions mais sur le **sens de
 * parcours** : la partie visible d'une surface sphérique est toujours vue de son côté
 * extérieur, donc son sens de rotation à l'écran ne dépend pas de l'orientation de la
 * tête. Un contour parcouru dans le sens direct garde son intérieur à gauche ; sur le
 * bord du disque, garder l'intérieur à gauche impose de tourner dans le sens direct.
 * Il n'y a plus de choix à faire, seulement une constante à lire.
 *
 * Aire vectorielle de Newell, comparée à la direction du contour : leur produit
 * scalaire donne le signe. Calculé et non déclaré par l'appelant — les deux yeux sont
 * l'image miroir l'un de l'autre et tournent donc en sens opposés, ce qu'une constante
 * posée à la main aurait tôt ou tard démenti.
 */
export function sensDeParcours(contour: Vec3[]): 1 | -1 {
  let nx = 0, ny = 0, nz = 0;
  let gx = 0, gy = 0, gz = 0;
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i];
    const b = contour[(i + 1) % contour.length];
    nx += a.y * b.z - a.z * b.y;
    ny += a.z * b.x - a.x * b.z;
    nz += a.x * b.y - a.y * b.x;
    gx += a.x; gy += a.y; gz += a.z;
  }
  return nx * gx + ny * gy + nz * gz >= 0 ? 1 : -1;
}

/**
 * Ajoute les points intermédiaires de la silhouette entre deux traversées.
 *
 * Les deux extrémités sont sur le cercle `z = 0` : parcourir ce cercle en angle garde
 * donc tout le chemin exactement sur la silhouette, sans interpolation à normaliser.
 *
 * ⚠️ **Le sens est imposé par l'orientation du contour, il ne se devine pas.** Voir
 * `sensDeParcours` : garder l'intérieur du même côté sur le bord du disque comme sur
 * le reste du contour ne laisse qu'une possibilité.
 */
function poserArcDeBord(
  sortie: Vec3[], a: Vec3, b: Vec3, pas: number, sens: 1 | -1,
): void {
  const depart = Math.atan2(a.y, a.x);
  const arrivee = Math.atan2(b.y, b.x);
  let ecart = arrivee - depart;
  if (sens > 0) { while (ecart <= 0) ecart += TAU; } else { while (ecart >= 0) ecart -= TAU; }
  /**
   * ⚠️ **Jamais plus d'un demi-tour, et ce n'est pas une précaution mais un théorème.**
   * Tous les motifs de cette page tiennent dans moins d'un hémisphère — un œil, un
   * tronçon de couture, une lame de ballon. Le bord d'une telle forme ne peut donc pas
   * longer plus de la moitié de la silhouette : au-delà, c'est que le sens a été pris à
   * l'envers, et l'on prend le complémentaire.
   *
   * Ce garde rattrape le cas que le sens seul ne couvre pas : un ruban presque tangent
   * à la silhouette y perce en deux endroits, et la région visible se referme alors
   * autour d'un coin caché plutôt qu'en deux morceaux francs. Mesuré sans lui : un
   * tronçon de la couture de tennis peignait 100 % du disque.
   */
  if (Math.abs(ecart) > Math.PI) ecart -= Math.sign(ecart) * TAU;
  const combien = Math.floor(Math.abs(ecart) / pas);
  if (combien < 1) return;
  for (let k = 1; k <= combien; k++) {
    const t = depart + (ecart * k) / (combien + 1);
    sortie.push({ x: Math.cos(t), y: Math.sin(t), z: 0 });
  }
}


/**
 * De la sphère à l'écran, en projection orthographique.
 *
 * Orthographique et non en perspective : c'est ce qui garde la silhouette de la tête
 * parfaitement circulaire quelle que soit la rotation, comme un logo. Une perspective
 * la rendrait ovale et trahirait le volume qu'on cherche justement à suggérer sans le
 * montrer.
 *
 * `y` change de signe : la surface compte vers le haut, le SVG vers le bas.
 */
export function projeter(p: Vec3, rayon: number, solide: Solide = SPHERE): Point2 {
  const q = surLeSolide(p, solide);
  // Le recentrage s'applique **avant** le passage à l'écran, donc dans le repère du
  // monde, où `y` monte encore : c'est le même décalage pour la tête et pour les yeux.
  const d = solide.decalage;
  return { x: (q.x - (d ? d.x : 0)) * rayon, y: -(q.y - (d ? d.y : 0)) * rayon };
}

/**
 * De combien un point est poussé — ou retiré — en passant de la sphère au solide.
 *
 * ⚠️ **Ce facteur n'est pas uniforme, et c'est ce qui déforme ce qu'on peint.** Sur le
 * cube il vaut 1 au centre des faces et jusqu'à 1,37 vers les coins ; sur l'étoile il
 * creuse entre les branches. Une forme posée sur la sphère puis transportée change donc
 * de taille selon l'endroit. Sur un œil, l'effet se voit — mesuré, l'œil qui s'éloigne du
 * regard **grandissait de 27 %** là où il aurait dû rapetisser de 10 %. C'est pourquoi
 * `cheminOeil` s'en sert pour compenser.
 */
export function gonflement(p: Vec3, solide: Solide): number {
  return rayonSolide(p, solide);
}

/**
 * Le contour de la tête, en mode à silhouette fixe.
 *
 * ⚠️ **Tracé par la même transformation que tout le reste, et non par un `rect` arrondi.**
 * C'est l'image du cercle `z = 0` — celui-là même sur lequel la coupe de l'hémisphère
 * referme les contours. Deux définitions de la silhouette finiraient par se décoller, et
 * l'on verrait un liseré de fond entre un œil rasant le bord et le bord lui-même.
 */
export function contourSilhouette(
  solide: Solide, rayon: number = RAYON_TETE, echantillons: number = 360,
): Point2[] {
  const points: Point2[] = [];
  for (let i = 0; i < echantillons; i++) {
    const t = (i / echantillons) * TAU;
    points.push(projeter({ x: Math.cos(t), y: Math.sin(t), z: 0 }, rayon, solide));
  }
  return points;
}

/** Écrit un contour fermé en attribut `d`, arrondi au centième. */
export function cheminSvg(points: Point2[]): string {
  if (points.length < 3) return "";
  const bout = (p: Point2) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  let d = `M ${bout(points[0])}`;
  for (let i = 1; i < points.length; i++) d += ` L ${bout(points[i])}`;
  return d + " Z";
}

/**
 * Écrit une polyligne **ouverte**, pour un trait qu'on ne referme pas.
 *
 * ⚠️ Deux points suffisent, là où `cheminSvg` en exige trois : un contour à deux
 * sommets n'enferme aucune surface, mais un trait à deux sommets est un segment. La
 * grille en produit à foison, dès qu'un méridien ne fait qu'effleurer la silhouette.
 */
export function cheminOuvert(points: Point2[]): string {
  if (points.length < 2) return "";
  const bout = (p: Point2) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  let d = `M ${bout(points[0])}`;
  for (let i = 1; i < points.length; i++) d += ` L ${bout(points[i])}`;
  return d;
}

/**
 * Un **parallèle** : le cercle de la sphère à une latitude donnée.
 *
 * ⚠️ **Ce n'est pas un grand cercle, et c'est justement pourquoi il fallait l'écrire.**
 * `grandCercle` ne rend que les cercles de rayon 1, ceux dont le plan passe par le
 * centre ; un parallèle a le rayon `cos(latitude)` et flotte à la hauteur `sin(latitude)`.
 * Seul l'équateur appartient aux deux familles.
 */
export function cercleDeLatitude(latitude: number, echantillons: number = 96): Vec3[] {
  const r = Math.cos(latitude), y = Math.sin(latitude);
  const points: Vec3[] = [];
  for (let i = 0; i < echantillons; i++) {
    const t = (i / echantillons) * TAU;
    points.push({ x: r * Math.cos(t), y, z: r * Math.sin(t) });
  }
  return points;
}

/**
 * Sépare une courbe en tronçons visibles et tronçons cachés.
 *
 * ⚠️ **Ce n'est pas `couperHemisphere`, et les confondre serait une faute.** Celui-là
 * découpe une **surface** : il jette l'arrière et referme ce qui reste en longeant la
 * silhouette, parce qu'un aplat doit border la tête. Ici on découpe un **trait** : il
 * n'y a rien à refermer, et l'arrière ne se jette pas — c'est même lui qui donne le
 * volume, tracé en clair derrière la sphère comme sur un globe filaire. Refermer ces
 * tronçons aurait peint des lunes pleines à la place des lignes.
 *
 * Les points de traversée sont renormalisés et **partagés** par les deux côtés : sans
 * quoi le trait laisserait un trou d'un demi-échantillon à chaque passage du bord.
 */
export function couperParProfondeur(
  courbe: Vec3[], ferme: boolean = true,
): { devant: Vec3[][]; derriere: Vec3[][] } {
  const n = courbe.length;
  if (n < 2) return { devant: [], derriere: [] };

  let haut = -Infinity, bas = Infinity;
  for (let i = 0; i < n; i++) {
    haut = Math.max(haut, courbe[i].z);
    bas = Math.min(bas, courbe[i].z);
  }
  // ⚠️ **Les cas d'un seul côté sont traités d'abord, et pas par économie.** Sur une
  // courbe fermée entièrement visible, le parcours général rendrait deux tronçons —
  // celui qui part du premier point et celui qui y revient — donc deux traits au lieu
  // d'un. Invisible à l'écran, faux à la mesure.
  if (bas >= 0) return { devant: [courbe], derriere: [] };
  if (haut < 0) return { devant: [], derriere: [courbe] };

  const traversee = (a: Vec3, b: Vec3): Vec3 => {
    const t = a.z / (a.z - b.z);
    return normaliser({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: 0,
    });
  };

  /**
   * ⚠️ Sur une courbe fermée, le parcours démarre sur une traversée. Démarré n'importe
   * où, il couperait un tronçon en deux au point de départ.
   */
  let depart = 0;
  if (ferme) {
    for (let i = 0; i < n; i++) {
      if ((courbe[i].z >= 0) !== (courbe[(i - 1 + n) % n].z >= 0)) { depart = i; break; }
    }
  }

  const devant: Vec3[][] = [];
  const derriere: Vec3[][] = [];
  const segments = ferme ? n : n - 1;
  let visible = courbe[depart].z >= 0;
  /**
   * ⚠️ **Sur une courbe fermée, le premier tronçon s'ouvre sur la traversée qui le
   * précède, pas sur le sommet de départ.** Ouvert au sommet, il lui manquait le
   * morceau compris entre la silhouette et ce sommet — un morceau que le parcours
   * rendait à la toute fin, en un second tronçon du même côté. Mesuré sur un équateur
   * vu de face : deux traits devant au lieu d'un, aboutés au même endroit, donc
   * rigoureusement invisibles et rigoureusement faux.
   */
  let morceau: Vec3[] = ferme
    ? [traversee(courbe[(depart - 1 + n) % n], courbe[depart]), courbe[depart]]
    : [courbe[depart]];

  for (let k = 0; k < segments; k++) {
    const a = courbe[(depart + k) % n];
    const b = courbe[(depart + k + 1) % n];
    if ((a.z >= 0) === (b.z >= 0)) { morceau.push(b); continue; }
    const p = traversee(a, b);
    morceau.push(p);
    (visible ? devant : derriere).push(morceau);
    visible = !visible;
    morceau = [p, b];
  }
  // Le tour bouclé, ce qui reste en main n'est que la reprise du premier tronçon :
  // la dernière traversée est celle sur laquelle on avait ouvert. Une courbe ouverte,
  // elle, n'a pas de reprise — son dernier tronçon est bien à rendre.
  if (!ferme && morceau.length >= 2) (visible ? devant : derriere).push(morceau);
  return { devant, derriere };
}

/**
 * Le `d` d'un trait posé sur la sphère, séparé selon qu'il passe devant ou derrière.
 *
 * Le pendant de `cheminSurLaTete` pour les lignes. Deux attributs plutôt qu'un, parce
 * que les deux faces ne se dessinent pas pareil : l'avant en plein, l'arrière en pâle.
 */
export function traitSurLaTete(
  courbe: Vec3[], orientation: Orientation, rayon: number = RAYON_TETE,
  ferme: boolean = true, solide: Solide = SPHERE,
): { devant: string; derriere: string } {
  const tourne: Vec3[] = [];
  for (let i = 0; i < courbe.length; i++) {
    tourne.push(tournerTete(
      courbe[i], orientation.lacet, orientation.tangage, orientation.roulis ?? 0));
  }
  const coupe = couperParProfondeur(tourne, ferme);
  const ecrire = (morceaux: Vec3[][]) => {
    const bouts: string[] = [];
    for (let i = 0; i < morceaux.length; i++) {
      const ecran: Point2[] = [];
      for (let j = 0; j < morceaux[i].length; j++) ecran.push(projeter(morceaux[i][j], rayon, solide));
      const d = cheminOuvert(ecran);
      if (d) bouts.push(d);
    }
    return bouts.join(" ");
  };
  return { devant: ecrire(coupe.devant), derriere: ecrire(coupe.derriere) };
}

/**
 * Un **fuseau** : la portion de sphère comprise entre deux demi-grands-cercles qui
 * partagent le même axe — un quartier d'orange.
 *
 * ⚠️ **C'est la seule primitive dont les skins ont besoin**, et ce n'est pas une
 * économie de code, c'est une propriété. Un quartier large peint un panneau de ballon
 * de plage ; un quartier étroit peint une couture. Les deux traversent ensuite la même
 * chaîne que les yeux — rotation, coupe, projection —, donc une couture s'affine près
 * du bord et disparaît derrière la tête exactement comme il faut, sans qu'aucun code
 * de skin n'ait à s'en occuper.
 *
 * ⚠️ **Un fuseau est un polygone simple, et c'est pourquoi on l'a préféré aux bandes.**
 * La tentation était de décrire une couture comme l'anneau compris entre deux
 * parallèles. Un anneau est troué : ni un contour fermé ni la coupe de l'hémisphère
 * ne savent le représenter sans artifice. Un fuseau se referme aux deux pôles, donc
 * tout le reste du module s'applique sans un cas particulier.
 *
 * `polaire` porte les deux pointes du quartier, `reference` donne la direction de
 * l'angle zéro et doit lui être perpendiculaire. Un grand cercle complet demande deux
 * fuseaux, l'un à `angle`, l'autre à `angle + π` : c'est voulu, la moitié cachée étant
 * de toute façon retirée par la coupe.
 */
export function fuseau(
  polaire: Vec3, reference: Vec3,
  angle1: number, angle2: number,
  echantillons: number = 96,
): Vec3[] {
  const e1 = normaliser(reference);
  const e2 = {
    x: polaire.y * e1.z - polaire.z * e1.y,
    y: polaire.z * e1.x - polaire.x * e1.z,
    z: polaire.x * e1.y - polaire.y * e1.x,
  };
  const n = Math.max(2, Math.round(echantillons / 2));
  const points: Vec3[] = [];
  const bord = (angle: number, descendant: boolean) => {
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const tx = e1.x * ca + e2.x * sa;
    const ty = e1.y * ca + e2.y * sa;
    const tz = e1.z * ca + e2.z * sa;
    for (let i = 0; i <= n; i++) {
      const k = descendant ? i : n - i;
      // ⚠️ **Les deux pôles sont posés exactement, pas calculés.** `Math.sin(Math.PI)`
      // vaut 1,22 × 10⁻¹⁶ et non zéro : le pôle sud dérivait donc d'un cheveu, assez
      // pour être classé *derrière* la sphère quand le pôle nord, lui, tombait juste.
      // Un motif entièrement caché gardait alors un seul pôle du bon côté — une pointe
      // esseulée qui suffisait à faire refermer le contour de travers, et à peindre
      // tout le disque. Le défaut ne se voyait que sur les panneaux invisibles, donc
      // nulle part avant qu'un skin n'en ait.
      if (k === 0) { points.push({ ...polaire }); continue; }
      if (k === n) { points.push({ x: -polaire.x, y: -polaire.y, z: -polaire.z }); continue; }
      const psi = (k / n) * Math.PI;
      const cp = Math.cos(psi), sp = Math.sin(psi);
      points.push({
        x: polaire.x * cp + tx * sp,
        y: polaire.y * cp + ty * sp,
        z: polaire.z * cp + tz * sp,
      });
    }
  };
  bord(angle1, true);
  bord(angle2, false);
  return points;
}

/**
 * Un grand cercle, celui dont le plan est perpendiculaire à `axe`.
 *
 * Le tour complet d'une sphère : c'est le tracé d'une couture de ballon.
 */
export function grandCercle(axe: Vec3, echantillons: number = 160): Vec3[] {
  const n = normaliser(axe);
  // Une direction franchement non colinéaire à l'axe, pour bâtir le repère.
  const aide: Vec3 = Math.abs(n.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const e1 = normaliser({
    x: aide.y * n.z - aide.z * n.y,
    y: aide.z * n.x - aide.x * n.z,
    z: aide.x * n.y - aide.y * n.x,
  });
  const e2 = {
    x: n.y * e1.z - n.z * e1.y,
    y: n.z * e1.x - n.x * e1.z,
    z: n.x * e1.y - n.y * e1.x,
  };
  const points: Vec3[] = [];
  for (let i = 0; i < echantillons; i++) {
    const t = (i / echantillons) * TAU;
    const c = Math.cos(t), s = Math.sin(t);
    points.push({
      x: e1.x * c + e2.x * s,
      y: e1.y * c + e2.y * s,
      z: e1.z * c + e2.z * s,
    });
  }
  return points;
}

/**
 * Un ruban de largeur constante qui suit une courbe fermée sur la sphère.
 *
 * ⚠️ **La largeur est prise perpendiculairement à la courbe, pas en latitude.** Le
 * fuseau, employé jusqu'ici pour les coutures, se pince jusqu'à disparaître à ses deux
 * pôles : la couture d'un ballon de basket s'y réduisait à un point, alors qu'une vraie
 * couture garde son épaisseur sur tout son tour. Le décalage se fait donc le long de la
 * normale à la courbe — `p × T` —, ce qui donne une largeur constante quelle que soit
 * l'inclinaison locale du tracé.
 *
 * ⚠️ **Le ruban est rendu en tronçons, et c'est structurel.** Un ruban qui fait le tour
 * complet est un anneau : il n'a pas de contour fermé simple, et ni la coupe de
 * l'hémisphère ni la règle d'orientation ne savent traiter un contour qui se recoud sur
 * lui-même. Découpé en tronçons, chacun redevient un quadrilatère ordinaire. Les
 * tronçons partagent leurs arêtes deux à deux et se peignent dans un même `path`, où
 * le rendu les fusionne sans laisser de couture claire entre eux.
 */
export function ruban(
  courbe: Vec3[], demiLargeur: number, parTroncon: number = 8,
): Vec3[][] {
  const n = courbe.length;
  const cos = Math.cos(demiLargeur), sin = Math.sin(demiLargeur);
  const haut: Vec3[] = [], bas: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const p = courbe[i];
    const avant = courbe[(i + 1) % n];
    const arriere = courbe[(i - 1 + n) % n];
    const t = normaliser({
      x: avant.x - arriere.x, y: avant.y - arriere.y, z: avant.z - arriere.z,
    });
    const nor = normaliser({
      x: p.y * t.z - p.z * t.y,
      y: p.z * t.x - p.x * t.z,
      z: p.x * t.y - p.y * t.x,
    });
    haut.push({ x: p.x * cos + nor.x * sin, y: p.y * cos + nor.y * sin, z: p.z * cos + nor.z * sin });
    bas.push({ x: p.x * cos - nor.x * sin, y: p.y * cos - nor.y * sin, z: p.z * cos - nor.z * sin });
  }
  const troncons: Vec3[][] = [];
  for (let debut = 0; debut < n; debut += parTroncon) {
    const fin = Math.min(debut + parTroncon, n);
    const piece: Vec3[] = [];
    for (let i = debut; i <= fin; i++) piece.push(haut[i % n]);
    for (let i = fin; i >= debut; i--) piece.push(bas[i % n]);
    troncons.push(piece);
  }
  return troncons;
}

/**
 * Un carreau de sphère, découpé comme la face d'un cube gonflé.
 *
 * C'est la construction d'un ballon de volley : six faces, chacune coupée en trois
 * lames, les lames d'une face perpendiculaires à celles de ses voisines. Les dix-huit
 * carreaux **pavent la sphère entière**, sans reste et sans recouvrement.
 *
 * `axe` désigne la face — 0 pour x, 1 pour y, 2 pour z — et `u`, `v` parcourent la face
 * du cube entre −1 et 1 avant d'être ramenés sur la sphère.
 */
export function carreauCube(
  axe: 0 | 1 | 2, signe: 1 | -1,
  u0: number, u1: number, v0: number, v1: number,
  echantillons: number = 14,
): Vec3[] {
  const surLaFace = (u: number, v: number): Vec3 => {
    const brut = axe === 0 ? { x: signe, y: u, z: v }
      : axe === 1 ? { x: u, y: signe, z: v }
        : { x: u, y: v, z: signe };
    return normaliser(brut);
  };
  const points: Vec3[] = [];
  const cote = (
    du: number, au: number, dv: number, av: number,
  ) => {
    for (let i = 0; i < echantillons; i++) {
      const t = i / echantillons;
      points.push(surLaFace(du + (au - du) * t, dv + (av - dv) * t));
    }
  };
  cote(u0, u1, v0, v0);
  cote(u1, u1, v0, v1);
  cote(u1, u0, v1, v1);
  cote(u0, u0, v1, v0);
  return points;
}

/**
 * Le `d` d'un motif déjà posé sur la sphère : rotation, coupe, projection.
 *
 * Le pendant de `cheminOeil` pour les aplats d'un skin. Séparé parce que le contour
 * d'un motif ne dépend pas de l'orientation : on le calcule une fois, et seule cette
 * fonction est refaite à chaque image.
 */
export function cheminSurLaTete(
  polygone: Vec3[], orientation: Orientation, rayon: number = RAYON_TETE,
  solide: Solide = SPHERE,
): string {
  const tourne: Vec3[] = [];
  for (let i = 0; i < polygone.length; i++) {
    tourne.push(tournerTete(
      polygone[i], orientation.lacet, orientation.tangage, orientation.roulis ?? 0));
  }
  return cheminDesMorceaux(couperHemisphere(tourne), rayon, solide);
}

/** Projette et écrit une liste de contours en un seul `d`, un sous-tracé par morceau. */
function cheminDesMorceaux(morceaux: Vec3[][], rayon: number, solide: Solide = SPHERE): string {
  const bouts: string[] = [];
  for (let i = 0; i < morceaux.length; i++) {
    const ecran: Point2[] = [];
    for (let j = 0; j < morceaux[i].length; j++) {
      ecran.push(projeter(morceaux[i][j], rayon, solide));
    }
    const d = cheminSvg(ecran);
    if (d) bouts.push(d);
  }
  return bouts.join(" ");
}

/**
 * Le `d` d'un motif fait de plusieurs morceaux, en un seul attribut.
 *
 * ⚠️ **Un seul `path` et non un par morceau**, et ce n'est pas qu'une économie de
 * nœuds : les sous-tracés d'un même `path` sont rastérisés comme une seule couverture.
 * Deux morceaux qui partagent une arête se fondent donc sans laisser le filet clair
 * qu'on obtiendrait avec deux éléments voisins — exactement ce qui trahirait le
 * découpage d'un ruban en tronçons.
 */
export function cheminsSurLaTete(
  morceaux: Vec3[][], orientation: Orientation, rayon: number = RAYON_TETE,
  solide: Solide = SPHERE,
): string {
  const bouts: string[] = [];
  for (let i = 0; i < morceaux.length; i++) {
    const d = cheminSurLaTete(morceaux[i], orientation, rayon, solide);
    if (d) bouts.push(d);
  }
  return bouts.join(" ");
}

/** Tout ce qui définit un œil, dans les unités de surface. */
export type ReglagesOeil = {
  /** Distance géodésique entre l'axe du visage et le centre de l'œil. */
  ecart: number;
  /** Décalage vertical de l'ancre, vers le haut si positif. */
  elevation: number;
  largeur: number;
  hauteur: number;
  /** Inclinaison de la capsule dans le plan de la surface, en radians. */
  inclinaison: number;
  /** Cambrure de l'œil : positif pour un arc « ⌒ », l'œil des mimiques heureuses. */
  courbure?: number;
  /**
   * Arrondi des quatre coins, de 0 pour des angles vifs à 1 pour la capsule.
   *
   * Absent, il vaut 1 : c'est la forme d'origine, et rien de ce qui existait ne change.
   */
  arrondi?: number;
};

/** L'orientation de la tête, en radians. */
export type Orientation = { lacet: number; tangage: number; roulis?: number };

/**
 * Le `d` d'un œil, du contour local jusqu'à l'attribut SVG.
 *
 * `cote` vaut −1 pour l'œil de gauche à l'écran, +1 pour celui de droite.
 *
 * ⚠️ L'inclinaison est **miroir** d'un œil à l'autre. C'est ce qui fait qu'une seule
 * valeur suffit à décrire une expression : « fâché » incline les deux capsules l'une
 * vers l'autre, et il n'y a rien d'autre à changer — ni forme, ni position, ni dessin.
 *
 * ⚠️ **Le miroir se fait sur `u`, après la rotation — pas en inversant l'angle.**
 * Inverser l'inclinaison paraît équivalent et ne l'est pas : il manque le retournement
 * de l'axe horizontal. La raison est dans le repère tangent lui-même. À la longitude
 * `−λ`, `versDroite` vaut `(cos λ, 0, sin λ)`, alors que l'image miroir du repère de
 * droite vaut `(−cos λ, 0, −sin λ)` — les deux sont opposés. Sans ce signe, les deux
 * yeux penchent du même côté au lieu de se répondre, et la symétrie de face est
 * rompue de plusieurs unités. Mesuré avant correction : 21 u d'écart sur un contour
 * qui devait être exactement symétrique.
 */
export function cheminOeil(
  reglages: ReglagesOeil,
  orientation: Orientation,
  cote: -1 | 1,
  rayon: number = RAYON_TETE,
  echantillons: number = 220,
  solide: Solide = SPHERE,
): string {
  const ancrage = ancrageOeil(
    (cote * reglages.ecart) / rayon,
    reglages.elevation / rayon,
  );
  const cos = Math.cos(reglages.inclinaison), sin = Math.sin(reglages.inclinaison);

  /**
   * ⚠️ **L'œil est rétréci d'avance de ce que le gonflement va lui rendre.**
   * Le passage au cube pousse les points d'autant plus qu'ils approchent d'une arête :
   * un œil qui s'écarte de l'axe du regard s'y trouvait donc **agrandi** au lieu d'être
   * raccourci par la perspective — mesuré, +27 % à dix degrés de lacet quand la sphère
   * en rendait −10 %. Le visage donnait alors deux yeux de tailles franchement
   * différentes, ce qui se remarque immédiatement.
   *
   * La correction se prend **à l'ancre**, une seule fois : c'est le terme dominant, et
   * il s'annule exactement. Il reste la variation du gonflement *à l'intérieur* de
   * l'œil, qui l'étire un peu vers les bords — symétrique, donc invisible, et d'autant
   * plus faible que l'œil est petit. Sur la sphère, le facteur vaut 1 : rien ne change.
   */
  const compense = 1 / gonflement(
    // ⚠️ **Le gonflement se mesure sur l'ancre *tournée*, pas sur l'ancre au repos.**
    // Il s'applique après la rotation, dans le repère du solide : pris avant, il ne
    // corrigeait que la taille de face et laissait intacte l'asymétrie qu'on cherchait
    // à supprimer — mesuré, le rapport des deux yeux restait à 1,27 au lieu de tomber.
    tournerTete(ancrage.centre, orientation.lacet, orientation.tangage, orientation.roulis ?? 0),
    solide);

  const contour = contourArrondi(
    reglages.largeur, reglages.hauteur, reglages.arrondi ?? 1,
    echantillons, reglages.courbure ?? 0);
  const surface: Vec3[] = [];
  for (let i = 0; i < contour.length; i++) {
    const u = cote * (contour[i].x * cos - contour[i].y * sin) * compense;
    const v = (contour[i].x * sin + contour[i].y * cos) * compense;
    surface.push(tournerTete(
      surLaSphere(ancrage, u, v, rayon),
      orientation.lacet, orientation.tangage, orientation.roulis ?? 0,
    ));
  }

  return cheminDesMorceaux(couperHemisphere(surface), rayon, solide);
}
