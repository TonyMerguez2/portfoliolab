import {
  type Vec3, carreauCube, grandCercle, ruban, tournerTete,
} from "./avatarSpherique";

/**
 * Les habillages de la tête — et pourquoi ce ne sont pas des images.
 *
 * ⚠️ **Un skin est une découpe de la sphère, pas une texture.** Plaquer une image
 * aurait demandé des coordonnées de texture, une déformation à refaire pour chaque
 * orientation, et n'aurait de toute façon pas donné de bords nets en SVG. Ici chaque
 * aplat est **posé sur la surface** : il traverse la même chaîne que les yeux, donc il
 * tourne avec la tête et disparaît derrière la silhouette sans une ligne de plus.
 *
 * ⚠️ **Le motif fait le tour complet, jamais seulement l'avant.** C'est la contrainte
 * qui décide de toutes les constructions ci-dessous : les coutures sont des grands
 * cercles entiers, les lames de volley pavent les six faces d'un cube gonflé, et la
 * couture de tennis est une courbe fermée. Un décor limité à la face visible se
 * trahirait au premier quart de tour.
 *
 * ⚠️ **Deux façons de peindre, et pas une de plus.** Un *ruban* pour les coutures —
 * largeur constante le long d'une courbe —, un *carreau* pour les panneaux. Le fuseau
 * employé au départ pour les coutures a été abandonné : il se pince jusqu'à disparaître
 * à ses pôles, si bien que les coutures du basket s'évanouissaient en haut et en bas de
 * la tête au lieu de garder leur épaisseur.
 */

/** Les trois couleurs que l'utilisateur règle, et que les skins se partagent. */
export type Palette = { tete: string; accent: string; yeux: string };

/**
 * Un aplat **plat**, détouré par la silhouette et posé à l'endroit — il ne tourne pas.
 *
 * ⚠️ **Toutes les décorations sont immobiles, et c'est une décision de cohérence.** Une
 * découpe peinte sur la sphère tourne juste ; la même transportée sur un triangle ou une
 * capsule s'y étire, parce que ces volumes ne se comportent pas comme une sphère sous la
 * rotation. Puisque les autres formes recevront elles aussi des habillages et qu'ils
 * devront y rester fixes, faire tourner celui de la sphère seul aurait produit deux
 * règles pour une même famille de réglages. On fige donc tout : ce qu'on perd en réalisme
 * sur une forme, on le gagne en unité sur les huit.
 */
export type MotifPlat = {
  /** Le tracé, en unités de surface sur une tête de rayon 100. */
  d: string;
  couleur: string;
  trait?: string;
  epaisseur?: number;
};

/** Un aplat découpé sur la sphère, éventuellement en plusieurs morceaux jointifs. */
export type Motif = {
  morceaux: Vec3[][];
  couleur: string;
  /** La couleur du filet qui souligne le motif, s'il en porte un. */
  trait?: string;
  epaisseur?: number;
};

export type Skin = {
  cle: string;
  libelle: string;
  /**
   * Vrai si le skin n'a de sens que sur la sphère.
   *
   * ⚠️ **Parce qu'un décor peut dépendre de la forme, alors que les autres n'en dépendent
   * pas.** Les coutures d'un ballon restent des coutures sur n'importe quel volume, un
   * peu tordues mais lisibles. Une carte du monde, non : détourée par un triangle, elle
   * n'est plus un globe. Le picker le retire donc des choix dès que la tête n'est plus
   * ronde, plutôt que de laisser produire une image fausse.
   */
  rond?: boolean;
  /** La palette proposée au moment où l'on choisit ce skin. Ensuite, à la main. */
  palette: Palette;
  /** Les découpes posées sur la surface, du fond vers le dessus. Vide pour une tête unie. */
  motifs: (p: Palette) => Motif[];
  /** Les aplats plats, détourés par la silhouette. */
  plats?: (p: Palette) => MotifPlat[];
};

const rad = (d: number) => (d * Math.PI) / 180;

/**
 * Tourne une géométrie une fois pour toutes, au moment de la construire.
 *
 * ⚠️ Sert à présenter les ballons **de trois quarts** plutôt que face à une de leurs
 * faces. Un cube gonflé vu pile dans l'axe d'une face montre un seul panneau et ne
 * ressemble à rien ; légèrement tourné, il en montre trois et se reconnaît aussitôt.
 */
function pose(points: Vec3[], lacet: number, tangage: number): Vec3[] {
  const sortie: Vec3[] = [];
  for (let i = 0; i < points.length; i++) {
    sortie.push(tournerTete(points[i], lacet, tangage));
  }
  return sortie;
}

function poseMorceaux(morceaux: Vec3[][], lacet: number, tangage: number): Vec3[][] {
  const sortie: Vec3[][] = [];
  for (let i = 0; i < morceaux.length; i++) sortie.push(pose(morceaux[i], lacet, tangage));
  return sortie;
}

// ── Basket ────────────────────────────────────────────────────────────────────

/**
 * L'épaisseur d'une couture de basket, en demi-largeur d'arc.
 *
 * 0,024 rad, soit 4,8 unités de surface sur une tête de rayon 100 — une douzaine de
 * pixels au rendu courant. Réglé sur la référence : les coutures d'un ballon de basket
 * sont larges et franches, pas des cheveux.
 */
const COUTURE_BASKET = 0.024;

/** L'écartement des deux coutures latérales, celles qui bombent de part et d'autre. */
const LATERALES = rad(42);

/**
 * Le méridien passant par la longitude donnée : l'axe de son grand cercle.
 *
 * ⚠️ L'angle ne se lit pas tel quel à l'écran, la projection le rabat en sinus. Une
 * couture à 58° culmine à 85 % du rayon et vient raser la silhouette — le ballon se lit
 * alors comme un cercle barré. À 42°, le sommet tombe à 67 %, l'écartement d'un vrai
 * ballon. C'est une constante qu'on ne déduit pas, on la regarde.
 */
function axeDuMeridien(longitude: number): Vec3 {
  return { x: Math.cos(longitude), y: 0, z: -Math.sin(longitude) };
}

const BASKET: Skin = {
  cle: "basket",
  libelle: "Basket",
  palette: { tete: "#D0632B", accent: "#FFFFFF", yeux: "#20242B" },
  motifs: p => {
    const coutures: Vec3[][] = [];
    // Trois coutures « verticales » — la médiane et les deux qui bombent — plus
    // l'horizontale : le découpage en huit panneaux d'un ballon de basket.
    const axes = [
      axeDuMeridien(0), axeDuMeridien(LATERALES), axeDuMeridien(-LATERALES),
      { x: 0, y: 1, z: 0 },
    ];
    for (let i = 0; i < axes.length; i++) {
      const troncons = ruban(grandCercle(axes[i]), COUTURE_BASKET);
      for (let j = 0; j < troncons.length; j++) coutures.push(troncons[j]);
    }
    // Un quart de tour de biais : de face, la couture horizontale passerait pile entre
    // les deux yeux et le ballon se lirait comme un visage barré.
    return [{ morceaux: poseMorceaux(coutures, rad(14), rad(-9)), couleur: p.accent }];
  },
};

// ── Volley ────────────────────────────────────────────────────────────────────

/**
 * Les six faces d'un cube gonflé, chacune en trois lames.
 *
 * ⚠️ **Les lames d'une face sont perpendiculaires à celles de ses voisines**, et c'est
 * la signature du ballon de volley — ce qui le distingue d'un ballon de plage à
 * quartiers. On l'obtient sans effort en séparant les lames de chaque face selon l'axe
 * *suivant* : la face portée par x se coupe selon y, celle portée par y selon z, celle
 * portée par z selon x. Deux faces adjacentes tombent alors toujours sur deux axes
 * différents.
 */
const COUPES = [-1, -1 / 3, 1 / 3, 1];

/** Les six faces, et la teinte de chacune. Les faces opposées se répondent. */
const FACES: { axe: 0 | 1 | 2; signe: 1 | -1; teinte: 0 | 1 | 2 }[] = [
  { axe: 0, signe: 1, teinte: 0 }, { axe: 0, signe: -1, teinte: 0 },
  { axe: 1, signe: 1, teinte: 1 }, { axe: 1, signe: -1, teinte: 1 },
  { axe: 2, signe: 1, teinte: 2 }, { axe: 2, signe: -1, teinte: 2 },
];

const VOLLEY: Skin = {
  cle: "volley",
  libelle: "Volley",
  palette: { tete: "#2B3E96", accent: "#F2C230", yeux: "#1A1F33" },
  motifs: p => {
    const teintes = [p.tete, p.accent, "#FAFAF6"];
    const parTeinte: Vec3[][][] = [[], [], []];
    for (const face of FACES) {
      for (let k = 0; k < 3; k++) {
        // La face portée par y se coupe selon `v`, les deux autres selon `u` : c'est
        // ce décalage qui croise les lames d'une face à l'autre.
        const carreau = face.axe === 1
          ? carreauCube(face.axe, face.signe, -1, 1, COUPES[k], COUPES[k + 1])
          : carreauCube(face.axe, face.signe, COUPES[k], COUPES[k + 1], -1, 1);
        parTeinte[face.teinte].push(carreau);
      }
    }
    return parTeinte.map((morceaux, i) => ({
      morceaux: poseMorceaux(morceaux, rad(38), rad(24)),
      couleur: teintes[i],
      // Le filet sombre entre les lames, comme sur la référence. Tracé plutôt que
      // peint : il suit le contour de chaque lame, donc le réseau des coutures se
      // dessine tout seul, silhouette comprise.
      trait: "#151A2E",
      epaisseur: 1.6,
    }));
  },
};

// ── Tennis ────────────────────────────────────────────────────────────────────

/**
 * La couture d'un ballon de tennis : une seule courbe fermée qui partage la sphère en
 * deux moitiés identiques.
 *
 * ⚠️ **La latitude oscille deux fois par tour**, et c'est ce qui fait la forme. Écrite
 * `latitude = A·cos(2·longitude)`, la courbe monte, redescend, remonte et se referme
 * après un tour complet. Les deux régions qu'elle délimite se déduisent l'une de
 * l'autre par un quart de tour suivi d'un retournement — elles sont donc superposables,
 * comme les deux pièces de feutre d'une vraie balle.
 *
 * Une oscillation simple — une seule montée par tour — aurait donné une couture qui
 * passe par le centre du visage, l'inverse de l'effet recherché : de face, une balle de
 * tennis montre deux arcs qui s'évitent.
 */
const AMPLITUDE_TENNIS = rad(56);
const COUTURE_TENNIS = 0.05;
/**
 * Le liseré sombre autour de la couture.
 *
 * ⚠️ **Un second ruban, légèrement plus large, et surtout pas un tracé.** Le filet SVG
 * suit le contour de *chaque* morceau : sur un ruban découpé en tronçons, il dessine
 * donc aussi les traverses entre eux, et la couture prend l'air d'une échelle. Vu à
 * l'écran avant correction. Deux aplats superposés n'ont pas ce défaut — la découpe
 * interne reste invisible, puisque rien ne la souligne.
 */
const LISERE_TENNIS = 0.061;

function courbeTennis(echantillons: number = 200): Vec3[] {
  const points: Vec3[] = [];
  for (let i = 0; i < echantillons; i++) {
    const longitude = (i / echantillons) * Math.PI * 2;
    const latitude = AMPLITUDE_TENNIS * Math.cos(2 * longitude);
    const cl = Math.cos(latitude);
    points.push({
      x: Math.sin(longitude) * cl,
      y: Math.sin(latitude),
      z: Math.cos(longitude) * cl,
    });
  }
  return points;
}

const TENNIS: Skin = {
  cle: "tennis",
  libelle: "Tennis",
  palette: { tete: "#D8E63C", accent: "#FBFBF6", yeux: "#26290F" },
  motifs: p => {
    const courbe = courbeTennis();
    return [
      {
        morceaux: poseMorceaux(ruban(courbe, LISERE_TENNIS), rad(26), rad(16)),
        couleur: "#20250F",
      },
      {
        morceaux: poseMorceaux(ruban(courbe, COUTURE_TENNIS), rad(26), rad(16)),
        couleur: p.accent,
      },
    ];
  },
};

// ── Uni ───────────────────────────────────────────────────────────────────────

// ── Terre ─────────────────────────────────────────────────────────────────────

/**
 * ⚠️ **Un continent n'est pas une fonction, c'est un dessin — et il a fallu s'y
 * reprendre.** La première Terre décrivait chaque terre par un rayon que des harmoniques
 * cabossaient, dans l'esprit du reste du module. C'est élégant et cela ne ressemble à
 * rien : on obtient des amibes régulières, jamais un continent, parce que ce qui fait
 * lire une côte — un isthme étroit, un golfe profond, une île détachée juste à côté — ne
 * s'écrit pas comme une somme de cosinus. Signalé à l'usage, sans détour.
 *
 * Les terres sont donc **composées**, sommet par sommet, et le code ne fait que lisser.
 * On garde le bénéfice du procédural là où il sert — la marge du haut-fond s'obtient d'un
 * trait épaissi, l'échelle est libre — sans prétendre déduire une forme qui relève du
 * dessin.
 */
export type Terre = { sommets: [number, number][] };

/**
 * Les terres, en unités de surface sur une tête de rayon 100.
 *
 * ⚠️ **Plusieurs débordent volontairement du cercle.** Une carte dont toutes les terres
 * flottent à l'intérieur se lit comme des taches posées sur un disque ; ce qui fait le
 * globe, c'est que les continents *sortent du cadre* et sont tranchés par le bord. Le
 * détourage s'en charge, il suffit de les laisser dépasser.
 */
export const TERRES: Terre[] = [
  // Le nord-ouest : une masse échancrée d'un golfe profond, qui sort par la gauche.
  { sommets: [[-122, -54], [-98, -76], [-68, -82], [-46, -68], [-52, -50], [-28, -44],
    [-20, -26], [-40, -22], [-34, -6], [-56, 0], [-64, -16], [-86, -8], [-98, -26],
    [-120, -28]] },
  // Le nord-est, qui s'échappe par le haut et se termine en presqu'île.
  { sommets: [[16, -110], [46, -106], [68, -88], [78, -64], [64, -48], [48, -60],
    [34, -44], [20, -58], [10, -82]] },
  // L'austral : long, tordu, avec une pointe. C'est la forme la plus reconnaissable.
  { sommets: [[2, 22], [26, 14], [44, 26], [52, 48], [46, 70], [30, 92], [14, 102],
    [6, 86], [18, 68], [8, 52], [-10, 58], [-14, 36]] },
  // Une côte à l'est, tranchée par le bord.
  { sommets: [[82, 2], [102, 8], [112, 30], [104, 50], [86, 46], [80, 28], [88, 16]] },
  // Le sud-ouest, qui sort par en bas.
  { sommets: [[-102, 48], [-80, 52], [-64, 70], [-70, 92], [-92, 108], [-114, 96],
    [-118, 70]] },
  // Trois îles : ce sont elles qui donnent l'échelle de l'océan.
  { sommets: [[-2, -20], [10, -24], [16, -14], [6, -6], [-4, -10]] },
  { sommets: [[46, -20], [58, -24], [64, -14], [56, -6], [46, -10]] },
  { sommets: [[-66, 24], [-54, 20], [-48, 30], [-58, 36]] },
];



/**
 * La largeur du haut-fond qui borde chaque terre.
 *
 * ⚠️ **Obtenu par un trait épaissi, et le sens du dessin en dépend.** SVG peint le
 * remplissage puis le contour : un trait posé sur la terre verte lui mangerait la moitié
 * de son épaisseur, et le vert serait rongé partout où la côte se découpe. On peint donc
 * la **même courbe deux fois** — d'abord en clair, remplie *et* traitée, ce qui la
 * grossit vers l'extérieur ; puis en vert, remplie seulement. Le liseré tombe alors
 * entièrement dans l'eau, ce qu'il est.
 */
export const HAUT_FOND = 7;

/** Les deux teintes que l'utilisateur ne règle pas. */
const COTE = "#6FD3E4";

/**
 * Une courbe fermée et lisse passant par tous les sommets.
 *
 * ⚠️ **Catmull-Rom, pour que les sommets soient des *points de passage*.** Écrire
 * directement des Béziers demanderait de placer des poignées de contrôle, qui ne sont sur
 * la courbe nulle part : on ne saurait plus où l'on dessine. Ici chaque sommet est sur la
 * côte, et la tangente s'y déduit de ses deux voisins — on compose une forme en déplaçant
 * des points qu'on voit.
 */
type Cubique = [number, number, number, number, number, number, number, number];

/** Les cubiques de la côte — une par intervalle entre deux sommets. */
function cubiquesDe(sommets: [number, number][]): Cubique[] {
  const n = sommets.length;
  const p = (i: number) => sommets[((i % n) + n) % n];
  const sortie: Cubique[] = [];
  for (let i = 0; i < n; i++) {
    const [x0, y0] = p(i - 1), [x1, y1] = p(i), [x2, y2] = p(i + 1), [x3, y3] = p(i + 2);
    sortie.push([x1, y1, x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6,
      x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6, x2, y2]);
  }
  return sortie;
}

function courbeLissee(sommets: [number, number][]): string {
  const c = cubiquesDe(sommets);
  let d = `M ${c[0][0].toFixed(2)} ${c[0][1].toFixed(2)}`;
  for (const [, , c1x, c1y, c2x, c2y, x, y] of c) {
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)}`
      + ` ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d + " Z";
}

/**
 * La même côte, échantillonnée en polygone.
 *
 * ⚠️ **Rendue par le module et non refaite ailleurs.** Une mesure qui reconstruirait la
 * courbe de son côté n'éprouverait que sa propre copie de la formule : elle passerait au
 * vert le jour où le tracé changerait sans elle. Les deux sorties partent des mêmes
 * cubiques, donc ce qu'on mesure est ce qu'on dessine.
 */
export function contourTerre(t: Terre, parSegment: number = 10): [number, number][] {
  const points: [number, number][] = [];
  for (const [x0, y0, c1x, c1y, c2x, c2y, x1, y1] of cubiquesDe(t.sommets)) {
    for (let i = 0; i < parSegment; i++) {
      const u = i / parSegment, v = 1 - u;
      points.push([
        v * v * v * x0 + 3 * v * v * u * c1x + 3 * v * u * u * c2x + u * u * u * x1,
        v * v * v * y0 + 3 * v * v * u * c1y + 3 * v * u * u * c2y + u * u * u * y1,
      ]);
    }
  }
  return points;
}

const TERRE: Skin = {
  cle: "terre",
  libelle: "Terre",
  rond: true,
  palette: { tete: "#4A78A8", accent: "#7CC24A", yeux: "#1B2733" },
  motifs: () => [],
  plats: p => {
    const traces = TERRES.map(t => courbeLissee(t.sommets));
    return [
      // Le haut-fond d'abord, grossi par son propre trait ; les terres par-dessus.
      ...traces.map(d => ({ d, couleur: COTE, trait: COTE, epaisseur: HAUT_FOND * 2 })),
      ...traces.map(d => ({ d, couleur: p.accent })),
    ];
  },
};

const UNI: Skin = {
  cle: "uni",
  libelle: "Uni",
  palette: { tete: "#6366F1", accent: "#8B5CF6", yeux: "#121214" },
  motifs: () => [],
};

export const SKINS: Skin[] = [UNI, BASKET, VOLLEY, TENNIS, TERRE];

export function skinParCle(cle: string): Skin {
  for (let i = 0; i < SKINS.length; i++) if (SKINS[i].cle === cle) return SKINS[i];
  return UNI;
}

/**
 * Quelques palettes toutes faites, pour la tête unie.
 *
 * Elles ne touchent pas à la couleur des yeux : sur ce visage, les yeux sont des
 * **trous**, et leur donner une teinte vive les transforme en pupilles peintes — un
 * autre personnage, pas un autre coloris.
 */
export const PRESETS: { nom: string; tete: string; accent: string }[] = [
  { nom: "Indigo", tete: "#6366F1", accent: "#8B5CF6" },
  { nom: "Menthe", tete: "#10B981", accent: "#34D399" },
  { nom: "Corail", tete: "#F43F5E", accent: "#FB7185" },
  { nom: "Ambre", tete: "#F59E0B", accent: "#FCD34D" },
  { nom: "Ardoise", tete: "#64748B", accent: "#94A3B8" },
];
