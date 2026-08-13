import {
  type Tache, type Vec3, carreauCube, contourTache, dansLaTache, grandCercle, ruban,
  tournerTete,
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
 * Un skin réservé à la sphère le déclare.
 *
 * ⚠️ **Parce qu'un décor peut dépendre de la forme, alors que les autres n'en dépendent
 * pas.** Les coutures d'un ballon sont des grands cercles : transportées sur un cube ou
 * une goutte, elles restent des coutures, un peu tordues mais lisibles. Une carte du
 * monde, non — les continents s'étirent avec le volume et le globe cesse d'être un globe.
 * Le picker le retire donc des choix dès que la tête n'est plus ronde, plutôt que de
 * laisser produire une image fausse.
 */
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
  /** Vrai si le skin n'a de sens que sur la sphère. */
  rond?: boolean;
  /** La palette proposée au moment où l'on choisit ce skin. Ensuite, à la main. */
  palette: Palette;
  /** Les aplats, du fond vers le dessus. Vide pour une tête unie. */
  motifs: (p: Palette) => Motif[];
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

/** Un point de la sphère depuis sa longitude et sa latitude, en degrés. */
function surLeGlobe(longitude: number, latitude: number): Vec3 {
  const lo = rad(longitude), la = rad(latitude);
  return { x: Math.cos(la) * Math.sin(lo), y: Math.sin(la), z: Math.cos(la) * Math.cos(lo) };
}

/**
 * Les continents.
 *
 * ⚠️ **Ils font le tour complet, comme toutes les découpes de ce fichier.** Une carte
 * limitée à la face visible se trahirait au premier quart de tour — et celle-ci tourne
 * pour de bon, puisque chaque contour passe par la même chaîne que les yeux. Il en faut
 * donc derrière, et aux pôles.
 *
 * ⚠️ **Les harmoniques ne sont pas décoratives : ce sont elles qui font la côte.** Un
 * rayon constant donne des pastilles, et une planète en pastilles ne ressemble à rien.
 * Trois ordres suffisent — un pour la masse générale, un pour les golfes, un pour les
 * découpes fines — et il vaut mieux les déphaser d'un continent à l'autre, sans quoi ils
 * se ressemblent tous.
 */
export const CONTINENTS: Tache[] = [
  { centre: surLeGlobe(-28, 16), rayon: 0.62, bosses: [[2, 0.26, 0.5], [3, 0.17, 2.1], [5, 0.1, 0.9]] },
  { centre: surLeGlobe(34, -30), rayon: 0.44, bosses: [[2, 0.3, 2.6], [3, 0.2, 0.4], [5, 0.11, 3.4]] },
  { centre: surLeGlobe(96, 22), rayon: 0.5, bosses: [[2, 0.22, 1.3], [3, 0.24, 2.9], [4, 0.12, 0.2]] },
  { centre: surLeGlobe(168, -12), rayon: 0.56, bosses: [[2, 0.28, 0.9], [3, 0.15, 1.7], [5, 0.13, 2.4]] },
  { centre: surLeGlobe(-108, -20), rayon: 0.4, bosses: [[2, 0.24, 3.0], [3, 0.21, 0.8], [4, 0.1, 1.9]] },
  { centre: surLeGlobe(-60, 66), rayon: 0.34, bosses: [[2, 0.27, 1.1], [3, 0.18, 2.5]] },
  { centre: surLeGlobe(140, 62), rayon: 0.26, bosses: [[2, 0.3, 0.3], [3, 0.16, 1.4]] },
  { centre: surLeGlobe(10, -74), rayon: 0.3, bosses: [[2, 0.2, 2.2], [3, 0.19, 0.6]] },
  { centre: surLeGlobe(-152, 34), rayon: 0.16, bosses: [[2, 0.3, 1.8]] },
  { centre: surLeGlobe(74, -62), rayon: 0.14, bosses: [[3, 0.28, 0.7]] },
];

/**
 * La largeur du haut-fond qui borde chaque terre, en radians.
 *
 * ⚠️ **Une seconde tache plus large, et non un filet tracé.** Un trait suit bien le
 * contour, mais SVG le centre dessus : la moitié de son épaisseur mange la terre, et le
 * vert se retrouve rongé partout où la côte se découpe. En peignant la même tache
 * élargie *avant* la verte, le liseré tombe entièrement dans l'eau — ce qu'il est.
 */
export const HAUT_FOND = 0.075;

/** La moucheture : nombre de grains, et leur rayon. */
const GRAINS = 190;
export const RAYON_GRAIN = 0.016;

/**
 * Les grains, répartis par l'angle d'or.
 *
 * ⚠️ **Une spirale plutôt qu'un tirage au sort.** Un semis aléatoire fait des paquets et
 * des trous, très visibles sur un aplat ; et il changerait à chaque rendu, ce qui
 * interdirait toute mesure. La spirale de Fibonacci répartit régulièrement sans jamais
 * s'aligner, et elle est reproductible.
 */
export function grainsDuGlobe(): { terre: Vec3[][]; mer: Vec3[][] } {
  const terre: Vec3[][] = [], mer: Vec3[][] = [];
  const or = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < GRAINS; i++) {
    const y = 1 - (2 * (i + 0.5)) / GRAINS;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = or * i;
    const p: Vec3 = { x: Math.cos(a) * r, y, z: Math.sin(a) * r };
    let surTerre = false;
    for (let j = 0; j < CONTINENTS.length && !surTerre; j++) {
      // Rentré d'un grain : un point posé pile sur la côte donnerait un grain à cheval.
      if (dansLaTache(p, CONTINENTS[j], -RAYON_GRAIN * 2)) surTerre = true;
    }
    let dansLeHautFond = false;
    for (let j = 0; j < CONTINENTS.length && !dansLeHautFond; j++) {
      if (dansLaTache(p, CONTINENTS[j], HAUT_FOND + RAYON_GRAIN * 2)) dansLeHautFond = true;
    }
    const grain = contourTache({ centre: p, rayon: RAYON_GRAIN, bosses: [] }, 0, 10);
    if (surTerre) terre.push(grain);
    // ⚠️ Rien dans le haut-fond : le liseré est une bande étroite, un grain dessus se
    // lirait comme une île et brouillerait la côte, seule ligne qui porte la lecture.
    else if (!dansLeHautFond) mer.push(grain);
  }
  return { terre, mer };
}

/** Les deux teintes que l'utilisateur ne règle pas : l'eau claire et les deux mouchetures. */
const COTE = "#6FD3E4";
const GRAIN_MER = "#6E9CC4";
const GRAIN_TERRE = "#63A83A";

const TERRE: Skin = {
  cle: "terre",
  libelle: "Terre",
  rond: true,
  palette: { tete: "#4A78A8", accent: "#7CC24A", yeux: "#1B2733" },
  motifs: p => {
    const bordures: Vec3[][] = [], terres: Vec3[][] = [];
    for (let i = 0; i < CONTINENTS.length; i++) {
      bordures.push(contourTache(CONTINENTS[i], HAUT_FOND));
      terres.push(contourTache(CONTINENTS[i]));
    }
    const g = grainsDuGlobe();
    // Un peu de biais : de face, l'axe des pôles tomberait pile entre les deux yeux.
    const tourner = (m: Vec3[][]) => poseMorceaux(m, rad(-18), rad(-10));
    return [
      { morceaux: tourner(g.mer), couleur: GRAIN_MER },
      { morceaux: tourner(bordures), couleur: COTE },
      { morceaux: tourner(terres), couleur: p.accent },
      { morceaux: tourner(g.terre), couleur: GRAIN_TERRE },
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
