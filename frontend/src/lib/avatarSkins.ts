import {
  type Vec3, carreauCube, grandCercle, ruban, tournerTete,
} from "./avatarSpherique";
import {
  decalerClarte, hexVersRvb, rvbVersHex, rvbVersTsl, tslVersRvb,
} from "./couleur";

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
  /** La couleur de remplissage. Omise quand `degrade` prend sa place. */
  couleur?: string;
  trait?: string;
  epaisseur?: number;
  /**
   * Le dégradé qui remplit l'aplat, à la place de `couleur`.
   *
   * ⚠️ **Une clé, pas une valeur.** Un dégradé SVG vit dans les `<defs>` et se désigne par
   * un identifiant ; or cet identifiant doit être unique **par avatar**, sans quoi deux
   * portefeuilles affichés côte à côte se partagent le premier déclaré. Le skin nomme donc
   * son dégradé localement, et c'est le rendu qui préfixe.
   */
  degrade?: string;
  opacite?: number;
  /** Une classe CSS, pour les animations qui vivent dans la feuille globale. */
  classe?: string;
  /**
   * La règle de remplissage, quand un tracé se creuse d'un trou.
   *
   * ⚠️ **`evenodd` sert à faire un tour sans le dessiner.** Un grand rectangle et une dalle
   * dans le même `d` : la seconde perce le premier, et ce qui reste est exactement la bande
   * qui les sépare. Sans elle, la règle par défaut remplirait tout et la dalle
   * disparaîtrait sous le tour.
   */
  regleDeRemplissage?: "evenodd";
  /**
   * Un détourage nommé, en plus de celui de la silhouette.
   *
   * ⚠️ **Parce qu'un skin peut avoir des régions, pas seulement des couches.** Le terminal
   * en a deux : la dalle, où vivent le balayage et le halo, et le boîtier qui l'entoure.
   * Sans cette découpe, les lignes couraient sur le boîtier aussi — et c'est exactement ce
   * qui faisait lire l'objet comme un écran nu plutôt que comme un appareil.
   */
  decoupe?: string;
  /**
   * Peint **après** les yeux, et non avant comme tout le reste.
   *
   * ⚠️ **Parce qu'un reflet est sur la face avant du verre.** Les aplats d'un skin sont ce
   * qu'il y a *derrière* le regard — un fond d'écran, un balayage, un vignettage — et sont
   * donc posés avant lui. Un reflet, lui, est ce qu'on voit *sur* la vitre : il doit passer
   * par-dessus tout ce qui est dedans, yeux compris. Peint dessous, il donnait un verre
   * derrière lequel les yeux flottaient sans être couverts, ce qui trahissait qu'il n'y a
   * pas vraiment de vitre.
   *
   * ⚠️ **Un drapeau, et non une seconde liste `platsDevant`.** Deux listes auraient obligé
   * chaque rendu à les traiter séparément et à garder leur ordre relatif en tête ; un
   * drapeau se partitionne en une ligne et laisse l'ordre d'écriture faire foi. Les rendus
   * qui ne dessinent pas d'yeux — la pastille de réglage — peuvent l'ignorer entièrement.
   */
  devant?: boolean;
};

/** Une région nommée, découpée dans la silhouette. Voir `MotifPlat.decoupe`. */
export type Decoupe = { id: string; d: string };

/**
 * Un dégradé radial déclaré par un skin.
 *
 * ⚠️ **Radial seulement, et c'est suffisant.** Les deux besoins d'un écran — la lueur qui
 * rayonne du centre et le vignettage qui assombrit les bords — sont le même objet vu dans
 * les deux sens. Un dégradé linéaire n'aurait servi à rien ici, et un type qui prévoit
 * tout se paie en cas jamais empruntés.
 */
export type Degrade = {
  /** Nom local ; le rendu le préfixe par avatar. Voir `MotifPlat.degrade`. */
  id: string;
  /** Centre et rayon, en unités de surface sur une tête de rayon 100. */
  cx: number;
  cy: number;
  r: number;
  arrets: { a: number; couleur: string; opacite?: number }[];
};

/**
 * Le traitement des yeux, quand un skin en demande un autre que le contraste par défaut.
 *
 * ⚠️ **La couleur seulement, jamais la géométrie.** Forme, taille, écart, inclinaison et
 * position restent l'affaire du composant : un skin qui pourrait les déplacer finirait par
 * le faire, et les yeux sont ce qui rend ce symbole reconnaissable.
 */
export type Yeux = {
  couleur: string;
  /** Une émission lumineuse autour des yeux, en unités de surface. */
  lueur?: { rayon: number; couleur: string };
  /** Une classe CSS posée sur le groupe des yeux, pour animer cette lueur. */
  classe?: string;
  /**
   * La région où le regard existe — une découpe nommée, comme pour les aplats.
   *
   * ⚠️ **Un regard derrière une vitre est borné par la vitre, pas par la tête.** Par défaut
   * les yeux sont détourés par la silhouette, ce qui convient à un visage : ils ne peuvent
   * en sortir. Sur un appareil, cela devient faux dès que la tête tourne un peu — l'œil
   * glissait sur le cerclage et venait se poser *par-dessus* le métal, comme collé sur le
   * boîtier. Confiné à la dalle ou à la visière, il disparaît derrière le cadre, ce qui est
   * ce qu'un objet fait.
   *
   * ⚠️ **La lueur est coupée avec lui, et c'est voulu.** En SVG le filtre s'applique avant
   * le détourage : le halo est donc borné à la vitre lui aussi. Physiquement une lumière
   * baverait un peu sur le cerclage ; à l'écran, cette bavure sur un chrome clair se lit
   * comme une salissure. On préfère le bord net.
   */
  decoupe?: string;
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
   * Les formes sur lesquelles ce skin a un sens. Absent : toutes.
   *
   * ⚠️ **Parce qu'un décor peut dépendre de la forme, alors que les autres n'en dépendent
   * pas.** Les coutures d'un ballon restent des coutures sur n'importe quel volume, un
   * peu tordues mais lisibles. Une carte du monde, non : détourée par un triangle, elle
   * n'est plus un globe. Le sélecteur retire donc le skin des choix dès que la tête prend
   * une forme qu'il ne prévoit pas, plutôt que de laisser produire une image fausse.
   *
   * ⚠️ **Une liste, là où il n'y avait qu'un booléen `rond`.** Celui-ci ne savait exprimer
   * qu'une seule restriction — « la sphère et rien d'autre » — et le terminal en demande
   * une autre : le carré, et rien d'autre. Ajouter un second drapeau aurait fait deux
   * mécanismes pour une même question, et le troisième cas les aurait départagés mal.
   *
   * ⚠️ **Typée `readonly string[]` et non `FormeAvatar[]`, à contrecœur.** Le type des
   * formes vit dans `useCouleurAvatar`, qui importe déjà `SKINS` d'ici : le nommer
   * fermerait un cycle d'imports. Les clés sont vérifiées par un test plutôt que par le
   * compilateur, ce qui est le prix de ce découpage-là.
   */
  formes?: readonly string[];
  /** La palette proposée au moment où l'on choisit ce skin. Ensuite, à la main. */
  palette: Palette;
  /** Les découpes posées sur la surface, du fond vers le dessus. Vide pour une tête unie. */
  motifs: (p: Palette) => Motif[];
  /** Les aplats plats, détourés par la silhouette. */
  plats?: (p: Palette) => MotifPlat[];
  /** Les dégradés que les aplats désignent par leur nom. */
  degrades?: (p: Palette) => Degrade[];
  /** Les régions que les aplats désignent par leur nom. */
  decoupes?: (p: Palette) => Decoupe[];
  /** De quoi peindre les yeux autrement — leur couleur, et une lueur. */
  yeux?: (p: Palette) => Yeux;
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
  formes: ["sphere"],
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

/**
 * Un terminal à tube : une carrosserie, une vitre encastrée, et du phosphore dedans.
 *
 * ⚠️ **Un habillage, jamais une forme.** La silhouette appartient à la forme choisie : ses
 * proportions, son rayon d'angle et la géométrie des yeux ne bougent pas d'un pixel. Ce qui
 * change est la surface. Le boîtier dessiné ci-dessous est peint *à l'intérieur* du carré,
 * il ne l'élargit pas et ne l'arrondit pas autrement.
 *
 * ⚠️ **Tout est *plat*, et c'est la seule construction juste.** Un écran se peint sur la
 * vitre, pas sur le volume : le balayage reste horizontal quoi que fasse la tête. C'est ce
 * que `MotifPlat` garantit — détouré par la silhouette, jamais emporté par la rotation.
 * Posé sur la sphère comme les coutures d'un ballon, le tube se serait mis à rouler.
 *
 * ⚠️ **Les teintes se déduisent de la couleur choisie.** La palette propose un vert de
 * phosphore, mais les terminaux ambre ont existé : chaque couche est cette même teinte
 * décalée en clarté, et le boîtier la même désaturée. L'habillage suit la couleur au lieu
 * de la contredire.
 *
 * ⚠️ **Deux régions, et c'est la correction principale de cette passe.** La première
 * version faisait de la forme entière un écran : le balayage courait jusqu'à l'arête, et
 * l'on voyait une dalle nue plutôt qu'un appareil. Il y a désormais un *boîtier* et une
 * *dalle* encastrée dedans, la seconde bornant strictement les couches lumineuses — voir
 * `decoupes`. Un moniteur se reconnaît à sa carrosserie autant qu'à sa lueur.
 */
export const ECRAN = {
  /** L'écart entre deux lignes de balayage, sur une tête de rayon 100. */
  pas: 7,
  /**
   * ⚠️ **Bien sous la moitié du pas.** Au-delà, le sombre l'emporte et l'on ne lit plus
   * des lignes sur un écran mais un écran sombre rayé de clair. Deux pixels sur sept
   * laissent les cinq septièmes du phosphore visibles — un peigne, pas une grille.
   */
  trait: 2,
  /**
   * La dalle : ses retraits dans un repère qui va de −100 à 100, et son rayon d'angle.
   *
   * ⚠️ **Le tour n'est pas d'épaisseur égale : le bas est deux fois et demie plus large.**
   * C'est la proportion qui *dit* « appareil ». Un cadre régulier se lit comme une marge ;
   * un bandeau sous la vitre se lit comme la face avant d'un boîtier, celle qui porte les
   * commandes. Le modèle le montre, et c'est le seul endroit où loger les détails.
   *
   * ⚠️ **Mesuré sur les yeux avant d'être choisi.** Sur cinquante relevés, clignements et
   * regard compris, ils tiennent dans `x ∈ [−38,3 ; 31,3]` et `y ∈ [−35 ; 38,7]`. La dalle
   * descend à 54 : quinze unités de garde sous l'œil le plus bas. La consigne « ne pas
   * toucher à leur géométrie » interdisait de les remonter, donc c'est le bandeau qui
   * s'arrête là où ils commencent, et non l'inverse.
   *
   * ⚠️ **Le rayon de la dalle est bien plus petit que celui de la silhouette.** Une vitre
   * aussi arrondie que le boîtier ne se distingue plus de lui ; un verre est toujours plus
   * anguleux que la matière qui le tient.
   */
  dalle: { cote: 18, haut: 18, bas: 46, rayon: 24 },
  /*
   * ⚠️ **Exporté pour être vérifié, pas pour être lu ailleurs.** Aucun composant ne s'en
   * sert : seul le test des marges y accède, parce que retrouver le bas de la dalle en
   * relisant le tracé SVG demanderait d'interpréter des `v` et des arcs relatifs — un test
   * qui casserait au premier changement de construction plutôt qu'au premier changement de
   * proportion. Une constante nommée est la bonne forme d'une spécification chiffrée.
   */
  /** Le bandeau sous la vitre : la grille de gauche s'y borne. */
  bandeau: { grille: { x: -58, y: 64, largeur: 50, pas: 6, trait: 2.4, nombre: 4 } },
};

/** Une ellipse, en tracé : deux arcs d'un demi-tour. */
const ellipse = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;

/** Un rectangle à coins arrondis, en tracé. */
const rectangle = (x: number, y: number, l: number, h: number, r: number) =>
  `M${x + r} ${y}h${l - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}`
  + `a${r} ${r} 0 0 1 ${-r} ${r}h${-(l - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}`
  + `v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}Z`;

/**
 * La dalle, en tracé — la même géométrie pour la peindre et pour la détourer.
 *
 * ⚠️ **Une fonction, pas une constante.** Elle est appelée au rendu, donc un changement de
 * `ECRAN.dalle` se propage partout sans qu'aucune copie ne subsiste. Le `retrait` grandi de
 * quelques unités sert au creux : c'est le seul endroit qui s'en écarte, et il le fait par
 * un calcul lisible plutôt que par un second tracé écrit à la main.
 */
const vitre = (marge = 0) => {
  const d = ECRAN.dalle;
  return rectangle(-100 + d.cote - marge, -100 + d.haut - marge,
                   200 - 2 * d.cote + 2 * marge,
                   200 - d.haut - d.bas + 2 * marge, d.rayon + marge);
};

/**
 * Deux traits de lumière en biais : le reflet d'une fenêtre sur une vitre.
 *
 * ⚠️ **C'est ce qui fait lire du *verre* plutôt qu'un trou peint.** La dalle du terminal et
 * la visière du casque étaient toutes deux des aplats très sombres nuancés au centre — donc
 * des surfaces mates. Un halo dit « ça éclaire », un vignettage dit « c'est bombé » ; seul
 * un reflet dit « il y a quelque chose *devant* ». C'est la couche qui manquait aux deux, et
 * c'est la même : partagée plutôt que recopiée, elle ne peut pas diverger.
 *
 * ⚠️ **Deux traits inégaux, jamais un seul, jamais trois.** Un trait unique se lit comme une
 * rayure ou comme un défaut de rendu. Deux — un large et un fin, parallèles — se lisent
 * immédiatement comme le montant et la traverse d'une fenêtre : c'est un idiome, et l'œil le
 * décode sans y penser. Au-delà de deux, on retombe sur des rayures.
 *
 * ⚠️ **Ils traversent de part en part, en débordant largement.** Ils courent de −110 à 110
 * quand la vitre en fait à peine 130 : c'est le détourage qui décide où ils commencent et
 * finissent. Bornés à la vitre, leurs quatre coins seraient visibles et le reflet se lirait
 * comme un ruban collé dessus.
 *
 * ⚠️ **Vingt-sept degrés de la verticale, et cette valeur n'est pas libre.** Trop droit, le
 * reflet devient une bande de balayage de plus ; trop couché, il devient un horizon. Cette
 * pente-là est celle d'une vitre debout éclairée par une fenêtre haute — c'est aussi, à peu
 * près, celle de tous les reflets d'icône, ce qui la rend familière.
 */
const refletDeVitre = () =>
  "M-72 -110L-30 -110L30 110L-12 110Z"
  + "M-16 -110L0 -110L60 110L44 110Z";

/**
 * Une matière : la *teinte* choisie, à la clarté et à la saturation qu'on lui impose.
 *
 * ⚠️ **Désaturer est le geste qui fait le métal.** `decalerClarte` seul rendait un vert
 * sombre — la première version du tour valait `#070A04` contre `#10180B` pour la dalle,
 * cinq pour cent d'écart, et l'utilisateur ne l'a pas vu du tout. Un boîtier n'est pas la
 * même matière que le phosphore : il ne rougeoie pas, il *reflète*. On garde donc la teinte
 * à un dixième de sa saturation — assez pour que la couleur réglée le colore encore, trop
 * peu pour qu'il ait l'air allumé — et c'est la clarté seule qui le sépare de l'écran.
 *
 * ⚠️ **Plus clair que la dalle, jamais plus sombre.** C'est la leçon de la version
 * précédente : un tour plus sombre que l'écran ne se lit pas comme un cadre, il se lit
 * comme du vide, et l'objet redevient une dalle flottante.
 *
 * ⚠️ **La saturation est *imposée*, elle n'est pas une fraction de celle d'origine.** La
 * première version gardait un dixième de la saturation source, et cela s'est effondré sur
 * la coque claire de l'astronaute : à clarté 0,86, la chroma disponible est déjà bornée par
 * le modèle TSL, si bien que multiplier une saturation faible ne produisait plus aucune
 * teinte visible. Mesuré : l'ivoire du modèle (`#E3DED2`) s'écarte du gris de 14,5 unités
 * RVB, la version proportionnelle n'atteignait que 2,2. Une matière a sa propre force de
 * pigment ; ce qu'elle emprunte à la couleur réglée, c'est sa **teinte**.
 *
 * ⚠️ **Bornée à quatre fois la saturation d'origine, et c'est ce qui sauve les gris.** Une
 * couleur presque neutre garde une teinte au sens TSL — `#8E8E93` est « bleu » à 3 % — et
 * l'imposer à 26 % l'amplifierait huit fois : un réglage gris donnerait un casque bleu
 * pâle, ce que personne n'a demandé. Le plafond laisse les couleurs franches atteindre leur
 * pigment et retient les neutres près du neutre.
 */
const matiere = (hex: string, clarte: number, saturation: number): string => {
  const [teinte, source] = rvbVersTsl(hexVersRvb(hex));
  return rvbVersHex(tslVersRvb([teinte, Math.min(saturation, source * 4), clarte]));
};

const TERMINAL: Skin = {
  cle: "terminal",
  libelle: "Terminal",
  /**
   * ⚠️ **Réservé au carré arrondi, et à lui seul.** L'appareil est composé pour une surface
   * à peu près carrée : le bandeau suppose un bord bas droit, le vignettage suit les quatre
   * côtés de la vitre, et le balayage a besoin d'une largeur constante pour se lire comme un
   * peigne. Détouré par un triangle ou une goutte, il ne raconte plus un moniteur — le
   * bandeau se pince en pointe et la grille sort de la silhouette. Sept images fausses pour
   * en servir une : c'est ce que `formes` existe pour empêcher.
   */
  formes: ["carre"],
  /**
   * Le vert d'un tube au phosphore.
   *
   * ⚠️ **C'est la teinte *allumée* qui est réglée, pas le fond.** L'écran éteint est
   * presque noir, et sa couleur ne vient que de ce qui s'y allume : régler le noir aurait
   * été régler ce qu'on ne voit pas. Le fond et le boîtier se déduisent donc de cette
   * teinte — voir `plats`.
   */
  palette: { tete: "#5C8A3C", accent: "#7CFF9B", yeux: "#8BFFA8" },
  motifs: () => [],
  degrades: p => {
    const phosphore = decalerClarte(p.tete, 0.3);
    return [
      {
        /**
         * La lumière qui tombe sur le boîtier : claire en haut à gauche, éteinte en bas.
         *
         * ⚠️ **Une seule source, en haut à gauche, comme partout ailleurs dans
         * l'application.** Les cartes, les pastilles et les liserés supposent tous cette
         * direction ; un boîtier éclairé d'ailleurs se serait remarqué sans qu'on sache dire
         * pourquoi. L'écart reste faible : il s'agit de donner du volume à la carrosserie,
         * pas d'y dessiner un reflet qui concurrencerait l'écran.
         */
        id: "boitier", cx: -70, cy: -95, r: 235,
        arrets: [
          { a: 0, couleur: "#FFFFFF", opacite: 0.13 },
          { a: 0.55, couleur: "#FFFFFF", opacite: 0.03 },
          { a: 1, couleur: "#000000", opacite: 0.16 },
        ],
      },
      {
        /**
         * Le halo du centre : le faisceau qui insiste au milieu de la dalle.
         *
         * ⚠️ **Centré sur la dalle, pas sur la tête.** La vitre n'est plus concentrique à la
         * silhouette depuis que le bandeau lui prend le bas : son milieu est à −14. Un halo
         * resté à zéro aurait éclairé le bord bas et laissé le haut terne, ce qui se lit
         * comme une tache et non comme un faisceau.
         */
        id: "halo", cx: 0, cy: -20, r: 96,
        arrets: [
          { a: 0, couleur: phosphore, opacite: 0.22 },
          { a: 0.45, couleur: phosphore, opacite: 0.1 },
          { a: 1, couleur: phosphore, opacite: 0 },
        ],
      },
      {
        /**
         * La bande du balayage lent : une lueur large et molle qui descend l'écran.
         *
         * ⚠️ **Étirée en ellipse plate plutôt que peinte en bande nette.** Un rectangle
         * clair qui descend se lit comme un objet qui passe devant l'écran ; une lueur sans
         * bord se lit comme une brillance *dans* le tube, ce qui est le phénomène qu'on
         * imite. Le dégradé s'éteint à 100 %, donc la bande n'a aucune arête.
         */
        id: "bande", cx: 0, cy: 0, r: 55,
        arrets: [
          { a: 0, couleur: phosphore, opacite: 0.16 },
          { a: 1, couleur: phosphore, opacite: 0 },
        ],
      },
      {
        /**
         * Le reflet, qui s'éteint en descendant vers la droite.
         *
         * ⚠️ **Blanc, et non phosphore, contrairement à tout le reste de ce skin.** Un
         * reflet n'est pas de la lumière *émise* par l'écran, c'est de la lumière ambiante
         * renvoyée par sa vitre : lui donner la teinte du tube en aurait fait une troisième
         * source verte, et l'écran aurait paru s'allumer par plaques. C'est le raisonnement
         * qui laisse déjà le balayage en noir pur — une ombre n'a pas de teinte.
         *
         * ⚠️ **Deux fois plus faible que celui du casque.** La dalle porte déjà un halo, une
         * bande lente et un peigne ; un reflet appuyé y aurait fait une quatrième chose à
         * regarder. La visière du casque, elle, est nue : elle peut le porter franchement.
         */
        id: "reflet", cx: -58, cy: -84, r: 190,
        arrets: [
          { a: 0, couleur: "#FFFFFF", opacite: 0.055 },
          { a: 0.55, couleur: "#FFFFFF", opacite: 0.02 },
          { a: 1, couleur: "#FFFFFF", opacite: 0 },
        ],
      },
      {
        /**
         * Le vignettage, qui va dans l'autre sens : transparent au centre, sombre au bord.
         *
         * ⚠️ **Il commence tard — à 55 % — et c'est ce qui le rend discret.** Amorcé au
         * centre, il grise toute la dalle et l'écran paraît sale plutôt que courbe.
         */
        id: "vignette", cx: 0, cy: -14, r: 100,
        arrets: [
          { a: 0, couleur: "#000000", opacite: 0 },
          { a: 0.55, couleur: "#000000", opacite: 0 },
          { a: 1, couleur: "#000000", opacite: 0.5 },
        ],
      },
    ];
  },
  /**
   * ⚠️ **Les yeux ne sont plus des trous, ce sont des pixels allumés.** C'est la seule
   * entorse assumée à la règle des préréglages — « les yeux sont des trous, une teinte vive
   * en fait des pupilles peintes ». Sur un écran, l'inverse est vrai : ce qui se voit est
   * ce qui émet, et un trou noir sur une dalle noire ne se verrait pas du tout. Leur
   * géométrie, elle, n'est pas touchée : `Yeux` ne porte qu'une couleur et une lueur.
   */
  yeux: p => ({
    couleur: decalerClarte(p.tete, 0.38),
    lueur: { rayon: 3.4, couleur: decalerClarte(p.tete, 0.3) },
    classe: "novac-crt-yeux",
    /* Le phosphore ne s'allume que sur la dalle : hors d'elle, il n'y a plus d'écran. */
    decoupe: "dalle",
  }),
  /**
   * La dalle, comme région : ce qui est peint dedans n'en sort pas.
   *
   * ⚠️ **Déclarée ici et non recopiée dans chaque aplat.** Quatre couches s'y détourent — le
   * halo, le peigne, la bande, le vignettage. Écrite quatre fois, la géométrie de l'écran
   * aurait quatre occasions de diverger au premier changement de proportion ; passant par
   * `vitre()`, qui sert aussi à *peindre* la dalle, le trou et le verre ne peuvent pas se
   * désaligner.
   */
  decoupes: () => [{ id: "dalle", d: vitre() }],
  plats: p => {
    /**
     * ⚠️ **Tout se déduit de la couleur choisie, rien n'est écrit en dur.** La dalle est
     * cette teinte très assombrie, le phosphore la même éclaircie, le boîtier la même
     * désaturée : un terminal ambre ou bleu s'obtient en changeant la couleur, sans toucher
     * à ce fichier. Un skin qui poserait ses propres teintes rendrait le réglage de couleur
     * sans effet sur lui.
     */
    const dalle = decalerClarte(p.tete, -0.32);
    const phosphore = decalerClarte(p.tete, 0.3);
    /**
     * Les deux clartés du boîtier : sa masse, et ses creux.
     *
     * ⚠️ **Le relief se fait par l'ombre seule, jamais par une arête claire.** Il y a eu
     * une troisième valeur — un cheveu clair posé au-dessus de la vitre, sous les fentes de
     * la grille, en haut de la touche — pour imiter un bord biseauté. À l'écran ce n'étaient
     * pas des arêtes, c'étaient des **lignes blanches translucides** posées sur l'objet, et
     * l'utilisateur les a vues comme telles. La raison tient à l'échelle : un biseau
     * n'existe qu'au-dessus d'une certaine largeur de trait, et en dessous il ne reste que
     * le trait. Le creux sombre suffit à enfoncer la vitre — c'est l'ombre qui porte le
     * relief, la lumière n'était qu'un doublon coûteux.
     *
     * ⚠️ **Le rapport de contraste entre le corps et la dalle vaut 2,02, et un test le
     * garde.** Le premier tour valait 1,10 : mathématiquement différent, visuellement rien.
     * Deux aplats sombres voisins ont besoin d'à peu près 2 pour se séparer à soixante-trois
     * pixels — la taille du bandeau, là où cet avatar est le plus souvent regardé.
     */
    const corps = matiere(p.tete, 0.28, 0.04);
    const creux = matiere(p.tete, 0.16, 0.04);
    const lignes: MotifPlat[] = [];
    /**
     * ⚠️ **Le peigne déborde largement de la dalle, et il le faut.** Il court de −130 à 130
     * quand la vitre s'arrête à 54 : le détourage le coupe, et les lignes des extrémités
     * restent entières. Bornées au cadre, la dernière paraissait rognée.
     */
    for (let y = -130; y <= 130; y += ECRAN.pas) {
      lignes.push({ d: `M-140 ${y}h280v${ECRAN.trait}h-280Z`, couleur: "#000000",
                    opacite: 0.22, decoupe: "dalle" });
    }
    const g = ECRAN.bandeau.grille;
    const barres: MotifPlat[] = [];
    /**
     * La grille du bandeau : quelques traits fins, sous la vitre, à gauche.
     *
     * ⚠️ **Des traits, et pas un haut-parleur dessiné.** Le modèle porte une grille percée,
     * des vis et une molette ; reproduits, ils tombent sous le pixel à quarante et
     * deviennent une bouillie grise. Quatre lignes espacées de six unités survivent à la
     * réduction en devenant une *texture* — on ne les compte plus, mais on lit encore
     * « surface travaillée », ce qui est tout ce qu'on leur demande.
     *
     * ⚠️ **Un seul trait sombre par fente, sans reflet dessous.** Le doublage clair censé
     * les creuser produisait quatre lignes blanches translucides en travers du bandeau —
     * bien plus visibles que les fentes qu'elles devaient souligner.
     */
    for (let i = 0; i < g.nombre; i++) {
      barres.push({ d: rectangle(g.x, g.y + i * g.pas, g.largeur, g.trait, g.trait / 2),
                    couleur: creux });
    }
    return [
      /**
       * ⚠️ **Le boîtier est peint par le skin, il n'est pas la couleur de la tête.** La
       * silhouette est remplie par le composant avec la teinte réglée ; ce premier aplat
       * opaque, détouré comme les autres, la recouvre entièrement. C'est ce qui permet à
       * l'appareil d'être gris tout en suivant la couleur choisie — sans quoi il aurait
       * fallu donner aux skins le droit de repeindre la tête, c'est-à-dire de défaire un
       * réglage de l'utilisateur.
       */
      { d: ellipse(0, 0, 150, 150), couleur: corps },
      // La lumière sur la carrosserie, avant que la vitre ne s'y encastre.
      { d: ellipse(0, 0, 150, 150), degrade: "boitier" },
      /**
       * Le creux où la vitre est posée : la dalle élargie de trois unités, en plus sombre.
       *
       * ⚠️ **Un aplat derrière, et non un contour.** Un `stroke` se serait centré sur le
       * tracé, donc à moitié caché sous la vitre — invisible pour cette moitié-là, et
       * d'épaisseur variable à l'écran selon la taille de rendu. Un rectangle débordant de
       * trois unités donne une rainure d'épaisseur exacte que la dalle recouvre proprement.
       */
      { d: vitre(3), couleur: creux },
      // La dalle éteinte, opaque : à partir d'ici, tout est détouré par elle.
      { d: vitre(), couleur: dalle },
      // Le halo ensuite : la lueur du faisceau, sous le balayage.
      { d: ellipse(0, 0, 150, 150), degrade: "halo", classe: "novac-crt-halo",
        decoupe: "dalle" },
      // Le balayage, qui traverse la lueur au lieu de s'y interrompre.
      ...lignes,
      /**
       * La bande lente, entre le balayage et le vignettage.
       *
       * ⚠️ **Sous le vignettage, sinon elle éclaire les coins en passant.** Le vignettage
       * doit rester la dernière parole sur les bords : une lueur qui repasse par-dessus lui
       * ferait clignoter les angles à chaque tour, ce qui est exactement le genre de détail
       * qu'on ne remarque qu'après l'avoir vu vingt fois.
       */
      { d: ellipse(0, -150, 150, 26), degrade: "bande", classe: "novac-crt-bande",
        decoupe: "dalle" },
      // Le vignettage par-dessus les lignes : il assombrit les bords, lignes comprises.
      { d: ellipse(0, 0, 150, 150), degrade: "vignette", decoupe: "dalle" },
      ...barres,
      /**
       * La touche et son témoin, à droite du bandeau.
       *
       * ⚠️ **Un seul point allumé, et il emprunte la couleur du phosphore.** Une seconde
       * source lumineuse d'une autre teinte aurait concurrencé les yeux, qui sont le sujet.
       * En reprenant exactement la teinte de l'écran, le témoin passe pour une diode du même
       * appareil, et l'avatar garde une seule couleur — ce qui compte d'autant plus qu'il
       * est le plus souvent affiché à quarante pixels.
       */
      { d: rectangle(10, g.y - 2, 42, 20, 7), couleur: creux },
      { d: ellipse(70, g.y + 8, 5.5, 5.5), couleur: creux },
      { d: ellipse(70, g.y + 8, 3, 3), couleur: phosphore, opacite: 0.75 },
      /**
       * Le reflet de la vitre, **en dernier et devant les yeux**.
       *
       * ⚠️ **Il était sous le vignettage, pour que celui-ci éteigne ses angles.** Son propre
       * dégradé le fait déjà : mesuré, il est retombé à moins d'un centième d'opacité aux
       * quatre coins de la dalle, où le vignettage ne trouvait donc rien à éteindre. La
       * précaution ne coûtait rien mais ne servait rien non plus — et elle plaçait la vitre
       * derrière le regard, ce qui est le contraire d'une vitre.
       */
      { d: refletDeVitre(), degrade: "reflet", decoupe: "dalle", devant: true },
    ];
  },
};
/**
 * Un casque d'astronaute : coque claire, cerclage de métal, visière noire.
 *
 * ⚠️ **Le frère du terminal, et volontairement.** Même construction — un boîtier, une
 * ouverture encastrée, un regard derrière —, mêmes contraintes : la silhouette, ses
 * proportions, son rayon d'angle et la géométrie des yeux ne bougent pas d'un pixel. Ce qui
 * change est la *matière*. Deux habillages qui partagent leur ossature valent mieux que
 * deux constructions différentes pour un même objet, parce que le jour où l'ouverture doit
 * remonter, la question ne se pose qu'une fois.
 *
 * ⚠️ **Il inverse la valeur, et c'est tout son intérêt.** Le terminal est sombre et sa
 * lumière vient du centre ; le casque est clair et sa visière est le seul trou noir de la
 * composition. Posés côte à côte dans la rangée de réglages, ils ne peuvent pas se
 * confondre — ce qu'on ne pourrait pas dire de deux écrans de teintes différentes.
 *
 * ⚠️ **Le cerclage est fait d'anneaux pleins, sans un seul dégradé linéaire.** Un chrome se
 * peint d'ordinaire par une bande de reflets orientée, et le type `Degrade` ne connaît que
 * le radial. Plutôt que d'ouvrir le type — et de devoir suivre ce changement dans les
 * *trois* copies du rendu, dette déjà signalée —, trois anneaux concentriques de clartés
 * alternées font le même travail : clair au bord, sombre au milieu, clair à l'intérieur.
 * C'est ainsi qu'on lit un métal tourné, et cela survit mieux à la réduction qu'un dégradé,
 * qui à quarante pixels se moyenne en un gris unique.
 */
const CASQUE = {
  /** Le hublot : où commence le cerclage, dans un repère qui va de −100 à 100. */
  hublot: { cote: 22, haut: 21, bas: 33, rayon: 40 },
  /**
   * L'épaisseur des trois anneaux, du bord vers la visière.
   *
   * ⚠️ **Treize unités en tout, soit six et demi pour cent du côté.** En deçà, le cerclage
   * devient un liseré et le casque un simple écran clair ; au-delà, la visière se referme
   * sur les yeux. La borne basse est la même que pour le terminal, la borne haute est
   * donnée par l'enveloppe mesurée du regard — voir `bas`.
   */
  anneaux: [0, 4, 9] as const,
  cerclage: 13,
  /** Le bouton du menton, seul détail de la coque. */
  bouton: { x: 52, y: 82, r: 8.5 },
};

/**
 * Les quatre valeurs d'un chrome, de l'éclat au creux.
 *
 * ⚠️ **Partagées entre les dégradés et les aplats, parce qu'elles servent aux deux.** Les
 * anneaux sont désormais *remplis* par un dégradé de ces tons ; les recopier d'un côté et de
 * l'autre aurait fait deux tables à garder d'accord, pour un habillage dont tout le sujet
 * est justement que les valeurs se répondent.
 *
 * ⚠️ **La saturation reste au plancher.** Un chrome ne porte pas de couleur, il en reflète :
 * cinq centièmes suffisent à ce qu'un casque bleu ne renvoie pas exactement le même gris
 * qu'un casque ambre, et pas un de plus.
 */
const chromeDe = (hex: string) => ({
  vif: matiere(hex, 0.9, 0.04),
  clair: matiere(hex, 0.72, 0.05),
  sombre: matiere(hex, 0.45, 0.06),
  creux: matiere(hex, 0.3, 0.06),
});

/** La visière, en tracé — la même géométrie pour la peindre et pour la détourer. */
const visiere = (marge = 0) => {
  const h = CASQUE.hublot;
  const d = CASQUE.cerclage - marge;
  return rectangle(-100 + h.cote + d, -100 + h.haut + d,
                   200 - 2 * h.cote - 2 * d, 200 - h.haut - h.bas - 2 * d,
                   h.rayon - d);
};

const ASTRONAUTE: Skin = {
  cle: "astronaute",
  libelle: "Astronaute",
  /**
   * ⚠️ **Réservé au carré arrondi, pour les mêmes raisons que le terminal.** Le cerclage
   * suit les quatre côtés d'un hublot à peu près carré et le bouton suppose un bord bas
   * droit ; détouré par une goutte ou un triangle, l'anneau se pince en pointe et le casque
   * n'est plus un casque.
   */
  formes: ["carre"],
  /**
   * Le bleu d'une visite au clair de Terre.
   *
   * ⚠️ **C'est encore la teinte *allumée* qui est réglée.** La coque est presque blanche et
   * la visière presque noire : ni l'une ni l'autre ne porte vraiment de couleur. Ce qu'on
   * règle est ce qui brille — le regard — et tout le reste en descend par la saturation et
   * la clarté. Régler le crème aurait donné un casque dont les yeux ne suivraient pas.
   */
  palette: { tete: "#4FA3E3", accent: "#9BD4FF", yeux: "#BFE6FF" },
  motifs: () => [],
  degrades: p => [
    {
      /**
       * La lumière sur la coque : franche en haut à gauche, éteinte en bas à droite.
       *
       * ⚠️ **Bien plus marquée que sur le terminal, parce qu'une surface claire le
       * demande.** Un boîtier sombre se contente de six centièmes de clarté pour paraître
       * bombé ; sur un blanc cassé, le même écart disparaît — l'œil juge le relief sur le
       * contraste *relatif*, et il reste peu de marge vers le haut quand on part déjà de
       * 0,87. On descend donc plutôt qu'on ne monte : la lumière est presque neutre, et
       * c'est l'ombre du bas qui fait le volume.
       *
       * ⚠️ **Mesuré : la première version montait à 0,50 de blanc et délavait tout.** Sur
       * un aplat déjà à 0,87 de clarté, un demi-blanc sature — la coque, le logement et les
       * trois anneaux se rejoignaient au même blanc et le cerclage disparaissait. Sur une
       * matière claire, l'éclairage doit être *plus faible* que sur une matière sombre, pas
       * plus fort : c'est le contraire de l'intuition, et c'est pour cela que c'est noté.
       */
      id: "coque", cx: -62, cy: -88, r: 245,
      arrets: [
        { a: 0, couleur: "#FFFFFF", opacite: 0.2 },
        { a: 0.45, couleur: "#FFFFFF", opacite: 0.04 },
        { a: 1, couleur: "#2A2620", opacite: 0.2 },
      ],
    },
    {
      /**
       * Le flanc **extérieur** de la moulure : clair en haut, sombre en bas.
       *
       * ⚠️ **C'est l'inversion entre ce dégradé et le suivant qui fait le métal.** Trois
       * aplats de valeurs fixes restent trois bordures empilées, quelle qu'en soit la
       * teinte — c'est exactement ce qu'on voyait. Une moulure de métal, elle, a des flancs
       * qui regardent dans des directions opposées : sous une lumière venue d'en haut, le
       * flanc extérieur s'allume en haut et s'éteint en bas, le flanc intérieur fait
       * précisément le contraire. Cette contradiction locale est le seul indice dont l'œil
       * a besoin pour conclure « c'est tourné dans la masse » plutôt que « c'est dessiné ».
       *
       * ⚠️ **Radial très éloigné, faute de linéaire.** Le type `Degrade` ne connaît que le
       * radial, et l'ouvrir obligerait à suivre le changement dans les trois copies du
       * rendu. Un centre placé loin au-dessus donne une chute quasi verticale sur la zone
       * utile ; le peu de courbure qui reste tombe bien, puisqu'un anneau est courbe.
       *
       * ⚠️ **Deux arrêts presque confondus au milieu : c'est l'horizon, et c'est ce qui
       * sépare un chrome d'un aluminium brossé.** Un métal poli ne dégrade pas, il
       * *réfléchit* : il montre le ciel au-dessus d'une certaine inclinaison et le sol en
       * dessous, avec une bascule brutale entre les deux. Une rampe régulière du clair au
       * sombre donne une matière mate et plastique — c'était le cas de la première version
       * à dégradés, qui restait terne malgré l'inversion.
       *
       * ⚠️ **Les bornes sont mesurées, pas choisies.** Sur la zone visible du cerclage, ce
       * dégradé n'est parcouru qu'entre 34 % et 76 % de son rayon : des arrêts posés de 0 à
       * 1 laissaient donc le vif et le creux inatteignables, et l'anneau n'employait que le
       * tiers médian de sa propre gamme. Tous les arrêts ci-dessous sont recalés sur la
       * plage réellement traversée.
       *
       * ⚠️ **Décentré vers la gauche, comme toute la lumière de ce fichier.** Cartes,
       * pastilles et liserés supposent une source en haut à gauche ; un anneau éclairé
       * d'ailleurs se remarquerait sans qu'on sache dire pourquoi.
       */
      id: "chromeHaut", cx: -34, cy: -190, r: 340,
      arrets: [
        { a: 0.32, couleur: chromeDe(p.tete).vif },
        { a: 0.48, couleur: chromeDe(p.tete).clair },
        /* L'horizon : deux arrêts presque confondus, donc une bascule franche. */
        { a: 0.54, couleur: chromeDe(p.tete).sombre },
        { a: 0.78, couleur: chromeDe(p.tete).creux },
      ],
    },
    {
      /** Le flanc **intérieur**, la gorge : sombre en haut, clair en bas. L'inverse. */
      id: "chromeBas", cx: 34, cy: 258, r: 340,
      arrets: [
        { a: 0.55, couleur: chromeDe(p.tete).vif },
        { a: 0.7, couleur: chromeDe(p.tete).clair },
        { a: 0.76, couleur: chromeDe(p.tete).sombre },
        { a: 1, couleur: chromeDe(p.tete).creux },
      ],
    },
    {
      /**
       * Le ciel dans la visière : une lueur froide au sommet du verre.
       *
       * ⚠️ **C'est un *reflet*, donc il est en haut et il ne se voit qu'à peine.** Le noir
       * de la visière doit rester la valeur la plus sombre de l'objet, sans quoi les yeux
       * cessent de s'en détacher. Seize centièmes suffisent à dire « c'est du verre, pas un
       * trou » — au-delà, la visière prend la couleur du reflet et l'on ne sait plus si
       * elle est teintée.
       */
      id: "verre", cx: -18, cy: -78, r: 118,
      arrets: [
        { a: 0, couleur: decalerClarte(p.tete, 0.24), opacite: 0.16 },
        { a: 0.5, couleur: decalerClarte(p.tete, 0.1), opacite: 0.05 },
        { a: 1, couleur: "#000000", opacite: 0 },
      ],
    },
    {
      /**
       * Le reflet sur la visière : la même fenêtre que sur l'écran du terminal.
       *
       * ⚠️ **Deux fois plus fort que celui du terminal, et c'est voulu.** La visière est
       * nue — pas de balayage, pas de bande qui descend, rien qu'un verre noir. Elle peut
       * porter un reflet franc, là où la dalle du terminal aurait eu une quatrième chose à
       * montrer. Une même couche, deux intensités : c'est la surface qui décide, pas
       * l'envie d'uniformiser.
       */
      id: "reflet", cx: -58, cy: -84, r: 190,
      arrets: [
        { a: 0, couleur: "#FFFFFF", opacite: 0.11 },
        { a: 0.55, couleur: "#FFFFFF", opacite: 0.04 },
        { a: 1, couleur: "#FFFFFF", opacite: 0 },
      ],
    },
    {
      /** Le vignettage de la visière, qui la bombe en la fermant sur ses bords. */
      id: "creuxVisiere", cx: 0, cy: -14, r: 104,
      arrets: [
        { a: 0, couleur: "#000000", opacite: 0 },
        { a: 0.6, couleur: "#000000", opacite: 0 },
        { a: 1, couleur: "#000000", opacite: 0.55 },
      ],
    },
  ],
  /**
   * ⚠️ **Les yeux rayonnent, comme sur le terminal, et pour la même raison.** Ce sont des
   * pixels allumés derrière un verre, pas des trous : sur une visière noire, un trou noir
   * ne se verrait pas. La lueur est plus serrée qu'au terminal — un phosphore bave, une
   * diode derrière du verre non — et sa géométrie n'est toujours pas touchée.
   */
  yeux: p => ({
    couleur: decalerClarte(p.tete, 0.12),
    lueur: { rayon: 2.6, couleur: p.tete },
    classe: "novac-casque-yeux",
    /* Le regard vit derrière le verre : le cerclage le masque au lieu de le porter. */
    decoupe: "visiere",
  }),
  /**
   * ⚠️ **Une seule région : le casque n'a que sa visière à borner.** Il y en a eu une
   * seconde, `metal`, qui réunissait le cerclage et deux lanières latérales pour qu'un même
   * reflet les parcoure d'un seul tenant. Les lanières sont retirées, et chaque pièce porte
   * désormais son propre dégradé de matière : cette lueur d'ensemble ne servait plus qu'à
   * aplatir ce que les autres venaient de creuser.
   */
  decoupes: () => [{ id: "visiere", d: visiere() }],
  plats: p => {
    /**
     * ⚠️ **Quatre matières, une seule couleur d'origine.** La coque garde huit centièmes de
     * pigment — assez pour qu'un casque bleu ne soit pas le même blanc qu'un casque ambre,
     * et calé sur l'ivoire du modèle —, le chrome n'en porte presque aucun puisqu'il
     * reflète au lieu de teindre, et la visière beaucoup, parce qu'un noir teinté est
     * précisément ce qui distingue un verre d'un trou percé dans la coque.
     */
    const coque = matiere(p.tete, 0.86, 0.26);
    /** Le logement du hublot : la coque assombrie, pour que le cerclage y paraisse posé. */
    const logement = matiere(p.tete, 0.64, 0.14);
    const verre = matiere(p.tete, 0.07, 0.5);
    const h = CASQUE.hublot;
    /**
     * Les trois anneaux du cerclage, du bord vers la visière.
     *
     * ⚠️ **Peints pleins et empilés, pas creusés en couronnes.** Chacun recouvre le
     * précédent en s'y encastrant, et la visière recouvre le dernier : aucun `evenodd`,
     * aucune couronne à recalculer si l'épaisseur change. Le tracé est le même appel avec
     * une marge différente, ce qui rend impossible qu'un anneau se désaligne d'un autre.
     *
     * ⚠️ **Remplis d'un dégradé, plus d'un aplat, et l'anneau médian prend l'autre sens.**
     * Trois valeurs fixes donnaient trois bordures empilées : chaque bande gardait la même
     * clarté sur tout son tour, ce qu'aucun métal ne fait. Chacune porte maintenant la chute
     * de lumière d'un flanc de moulure, et celle du milieu la porte à l'envers. En haut de
     * l'anneau on lit donc clair / sombre / clair, en bas sombre / clair / sombre : c'est
     * cette contradiction qui se lit comme du tourné plutôt que comme du dessiné.
     */
    const cerclage = CASQUE.anneaux.map((retrait, i) => ({
      d: rectangle(-100 + h.cote + retrait, -100 + h.haut + retrait,
                   200 - 2 * h.cote - 2 * retrait,
                   200 - h.haut - h.bas - 2 * retrait,
                   h.rayon - retrait),
      degrade: i === 1 ? "chromeBas" : "chromeHaut",
    }));
    const b = CASQUE.bouton;
    return [
      /**
       * ⚠️ **La coque est peinte par le skin, elle n'est pas la couleur de la tête.** La
       * silhouette est remplie par le composant avec la teinte réglée ; ce premier aplat
       * opaque la recouvre entièrement. C'est ce qui permet au casque d'être blanc cassé
       * tout en suivant la couleur choisie — sans quoi il aurait fallu donner aux skins le
       * droit de repeindre la tête, c'est-à-dire de défaire un réglage de l'utilisateur.
       */
      { d: ellipse(0, 0, 150, 150), couleur: coque },
      { d: ellipse(0, 0, 150, 150), degrade: "coque" },
      /* Le logement, débordant de trois unités : la rainure où le cerclage s'assied. */
      { d: rectangle(-100 + h.cote - 3, -100 + h.haut - 3,
                     200 - 2 * h.cote + 6, 200 - h.haut - h.bas + 6, h.rayon + 3),
        couleur: logement },
      ...cerclage,
      // La visière opaque : à partir d'ici, tout est détouré par elle.
      { d: visiere(), couleur: verre },
      { d: ellipse(0, 0, 150, 150), degrade: "verre", decoupe: "visiere" },
      { d: ellipse(0, 0, 150, 150), degrade: "creuxVisiere", decoupe: "visiere" },
      /**
       * Le bouton du menton — un anneau creux, jamais une pastille pleine.
       *
       * ⚠️ **Le seul détail de la coque, et il ne s'allume pas.** Le terminal a une grille,
       * une touche et une diode ; le casque n'a que cela, parce que sa coque est claire et
       * que tout ce qu'on y pose s'y voit trois fois plus. Un témoin lumineux y aurait
       * concurrencé les yeux, qui sont déjà les seuls objets brillants sur du noir.
       */
      { d: ellipse(b.x, b.y, b.r, b.r), couleur: logement },
      { d: ellipse(b.x, b.y, b.r - 1.6, b.r - 1.6), couleur: coque },
      /* Le reflet en dernier et devant les yeux, pour la raison dite au terminal. */
      { d: refletDeVitre(), degrade: "reflet", decoupe: "visiere", devant: true },
    ];
  },
};

/**
 * Un heaume de chevalier : acier sombre, crête centrale, fente de vue et ventail.
 *
 * ⚠️ **Le troisième de la même famille, et il en réemploie toute l'ossature.** Terminal,
 * casque d'astronaute, heaume : un boîtier, une ouverture, un regard derrière. Ce qui change
 * est la matière et le découpage. Trois constructions différentes auraient voulu dire poser
 * trois fois les mêmes questions de proportion, et les résoudre trois fois différemment.
 *
 * ⚠️ **La crête est peinte *devant* le regard, et c'est indispensable.** Le nasal d'un heaume
 * passe entre les yeux : il doit donc être posé après eux, sinon un œil qui dérive vers le
 * centre lui passe par-dessus et le heaume se démonte. C'est exactement ce que
 * `MotifPlat.devant` sert à dire — le même mécanisme que le reflet des vitres.
 *
 * ⚠️ **Le nasal est centré sur l'axe du heaume, et il occulte : c'est ce que fait un
 * nasal.** Une première version le décalait à `x = −3,2` pour se glisser entre les yeux,
 * d'après un relevé de deux cents images qui donnait un couloir libre de 17,7 unités. Ce
 * relevé était faux : trois secondes et demie, alors que la dérive de la tête a des périodes
 * de 2,9 à 4,3 secondes — j'avais mesuré une phase, pas une enveloppe. Repris sur **mille
 * huit cents images**, le milieu de l'écart oscille de −6 à +11,1 et l'écart libre minimal
 * tombe à **4,8 unités** : aucun couloir fixe n'existe, parce que la rotation de la tête
 * change l'écartement *apparent* des yeux. Un nasal de quatre unités aurait été un fil.
 *
 * ⚠️ **Donc tout est symétrique autour de zéro, l'axe du heaume.** Le décalage laissait les
 * boulons alignés sur l'axe de la silhouette pendant que la crête s'en écartait de trois
 * unités : deux symétries concurrentes, et l'œil ne voyait que la faute. Une pièce n'a qu'un
 * axe.
 */
const HEAUME = {
  /** L'axe du heaume et la largeur du nasal. Tout s'y rapporte — voir l'en-tête. */
  axe: { milieu: 0, largeur: 14 },
  /** La fente de vue : sa lèvre haute, ses épaules, et la pointe de son V. */
  fente: { haut: -46, epaule: 8, pointe: 64, bord: 82 },
  /** Le bandeau de front, au-dessus de la fente. */
  bandeau: { haut: -68, bas: -48 },
  /** Les fentes de ventilation du ventail : trois par côté. */
  ventail: { x: 36, pas: 12, largeur: 7, haut: 56, hauteur: 28 },
};

/**
 * La fente de vue, en tracé : une bande large que le bas referme en V.
 *
 * ⚠️ **Le V est ce qui distingue un heaume d'un masque de plongée.** Une ouverture
 * rectangulaire donne un bandeau ; deux joues qui remontent vers les tempes donnent un
 * casque fermé sur un visage. La pointe descend à 64 alors que les yeux s'arrêtent à 38,5 :
 * six unités de garde au point le plus serré, mesurées sur l'œil droit à `x = 31`.
 */
const fenteDeVue = () => {
  const f = HEAUME.fente;
  const m = HEAUME.axe.milieu;
  return `M${-f.bord} ${f.haut}L${f.bord} ${f.haut}L${f.bord} ${f.epaule}`
    + `L${m + 7} ${f.pointe}L${m - 7} ${f.pointe}L${-f.bord} ${f.epaule}Z`;
};

/**
 * La crête, **en deux flancs** — `cote` vaut −1 à gauche de l'arête, 1 à droite.
 *
 * ⚠️ **Étranglée sur la traversée du regard, évasée au-dessus et au-dessous.** C'est la
 * forme même d'un nasal : il n'a de place qu'entre les yeux, et rien ne l'empêche de
 * s'élargir là où il n'y a plus d'œil à éviter. Une bande de largeur constante aurait été
 * soit trop grêle en haut, soit impossible au milieu.
 *
 * ⚠️ **Deux tracés qui se partagent l'axe, et non un seul rempli d'un dégradé.** Un dégradé
 * en travers d'une bande produit un tube : la valeur y varie *continûment*, ce que fait un
 * cylindre et jamais une arête. Une arête, c'est deux plans qui se rencontrent, donc une
 * **discontinuité** de valeur exactement sur l'axe. C'est la différence entre une pièce
 * forgée et une pièce dessinée, et aucune finesse de dégradé ne la remplace : la première
 * version, à un seul dégradé, se lisait comme un tuyau collé sur le heaume.
 */
const flancDeCrete = (cote: -1 | 1) => {
  const { milieu: m, largeur: l } = HEAUME.axe;
  const b = m + cote * (l / 2);
  return `M${m} -106L${m + cote * 13} -72L${b} -40L${b} 46L${b + cote * 21} 88`
    + `L${m} 88L${m} 46L${m} -40Z`;
};

/** Les quatre valeurs d'un acier forgé, de l'arête éclairée au fond de gorge. */
const acierDe = (hex: string) => ({
  vif: matiere(hex, 0.62, 0.03),
  clair: matiere(hex, 0.44, 0.04),
  sombre: matiere(hex, 0.26, 0.05),
  creux: matiere(hex, 0.15, 0.07),
});

const CHEVALIER: Skin = {
  cle: "chevalier",
  libelle: "Chevalier",
  /**
   * ⚠️ **Réservé au carré arrondi, comme ses deux frères.** Le bandeau de front suppose un
   * bord haut droit, le ventail un bord bas droit, et la fente de vue s'appuie sur les deux
   * côtés. Détouré par une goutte, le heaume perd ses appuis et devient une tache grise.
   */
  formes: ["carre"],
  /**
   * La braise d'un regard sous l'acier.
   *
   * ⚠️ **C'est encore la teinte *allumée* qui est réglée.** L'acier n'a pas de couleur
   * propre — il prend celle de ce qui l'éclaire — et le fond de la fente est presque noir.
   * Ce qu'on règle est la braise ; l'armure en descend par la saturation et la clarté.
   */
  palette: { tete: "#E8781E", accent: "#FFB169", yeux: "#FFD1A3" },
  motifs: () => [],
  degrades: p => [
    {
      /**
       * La lumière sur le heaume : franche en haut à gauche, éteinte en bas à droite.
       *
       * ⚠️ **Plus contrastée que sur le casque blanc, et pour la raison inverse.** Une coque
       * claire sature dès qu'on l'éclaire ; un acier sombre, lui, a toute la place vers le
       * haut. C'est la même règle appliquée dans l'autre sens : l'amplitude disponible
       * dépend de la clarté de départ, jamais de l'envie de faire ressortir la pièce.
       */
      id: "heaume", cx: -58, cy: -92, r: 250,
      arrets: [
        { a: 0, couleur: "#FFFFFF", opacite: 0.3 },
        { a: 0.42, couleur: "#FFFFFF", opacite: 0.08 },
        { a: 1, couleur: "#000000", opacite: 0.34 },
      ],
    },
    {
      /**
       * Les plaques d'acier : arête claire en haut, gorge sombre en bas.
       *
       * ⚠️ **Le même artifice que le cerclage du casque, horizon compris.** L'acier poli
       * bascule du ciel au sol en quelques centièmes de course au lieu de dégrader
       * régulièrement ; sans cette cassure, les plaques redeviennent des aplats gris. Les
       * arrêts sont recalés sur la plage réellement parcourue par la zone visible.
       */
      id: "plaque", cx: -30, cy: -210, r: 350,
      arrets: [
        { a: 0.3, couleur: acierDe(p.tete).vif },
        { a: 0.46, couleur: acierDe(p.tete).clair },
        { a: 0.52, couleur: acierDe(p.tete).sombre },
        { a: 0.8, couleur: acierDe(p.tete).creux },
      ],
    },
    {
      /**
       * Le ventail : la même chute, recalée sur *sa* portion de course.
       *
       * ⚠️ **Un second dégradé plutôt qu'un seul étiré, et c'est la même leçon qu'au
       * casque.** Mesuré depuis le centre commun : le bandeau de front est parcouru entre
       * 41 % et 47 % du rayon, le ventail entre 64 % et 92 %. Les arrêts du premier plaçaient
       * donc tout le second au-delà de l'horizon, dans le seul fond de gorge : la plaque du
       * bas ressortait en aplat mort, et ses fentes de ventilation, de la même valeur,
       * disparaissaient entièrement. Une pièce éloignée d'une source a besoin de sa propre
       * échelle, pas d'une rampe plus longue.
       */
      id: "plaqueBasse", cx: -30, cy: -210, r: 350,
      arrets: [
        { a: 0.62, couleur: acierDe(p.tete).vif },
        { a: 0.68, couleur: acierDe(p.tete).clair },
        { a: 0.72, couleur: acierDe(p.tete).sombre },
        { a: 0.92, couleur: acierDe(p.tete).creux },
      ],
    },
    {
      /**
       * La joue droite du ventail : la même chute, d'un demi-ton en dessous.
       *
       * ⚠️ **Un demi-ton, pas un ton entier.** La première version descendait franchement,
       * et la joue droite fusionnait avec le flanc sombre du nasal en une seule masse noire :
       * on ne lisait plus deux joues rivetées mais un heaume à moitié éteint. Deux plans
       * voisins doivent se distinguer *assez pour qu'on voie la couture*, pas au point que
       * l'un disparaisse — la couture est l'information, l'obscurité n'en est pas une.
       */
      id: "plaqueBasseOmbre", cx: -30, cy: -210, r: 350,
      arrets: [
        { a: 0.62, couleur: matiere(p.tete, 0.53, 0.035) },
        { a: 0.7, couleur: matiere(p.tete, 0.35, 0.045) },
        { a: 0.92, couleur: matiere(p.tete, 0.135, 0.07) },
      ],
    },
    {
      /**
       * Le flanc **gauche** du nasal : celui qui regarde la lumière.
       *
       * ⚠️ **Chaque flanc a sa propre rampe, et elles ne se rejoignent pas sur l'axe.**
       * C'est tout l'objet de la séparation : la rupture de valeur au milieu *est* l'arête.
       * Un dégradé continu en travers aurait donné un cylindre, jamais une crête.
       *
       * ⚠️ **Il s'assombrit en descendant, comme le reste du heaume.** Un flanc éclairé
       * d'une seule valeur sur toute sa longueur se lit comme un ruban de papier ; c'est la
       * chute vers le menton qui lui donne sa longueur.
       */
      id: "creteGauche", cx: -34, cy: -180, r: 300,
      arrets: [
        { a: 0.24, couleur: acierDe(p.tete).vif },
        { a: 0.52, couleur: acierDe(p.tete).clair },
        { a: 0.86, couleur: acierDe(p.tete).sombre },
      ],
    },
    {
      /** Le flanc **droit**, dans l'ombre : il commence là où le gauche finit. */
      id: "creteDroite", cx: -34, cy: -180, r: 300,
      arrets: [
        { a: 0.24, couleur: matiere(p.tete, 0.33, 0.045) },
        { a: 0.62, couleur: matiere(p.tete, 0.23, 0.055) },
        { a: 0.86, couleur: matiere(p.tete, 0.16, 0.07) },
      ],
    },
    {
      /**
       * Le fond de la fente : noir au centre, plus noir encore sur les bords.
       *
       * ⚠️ **Il descend vers l'extérieur, à l'inverse du vignettage d'un écran.** Une dalle
       * s'éteint sur ses bords parce qu'elle est bombée ; une fente s'assombrit parce qu'on
       * y voit *moins loin* de biais. Même dégradé, deux raisons — et la seconde demande
       * qu'il commence plus tôt, sans quoi la fente paraît éclairée de l'intérieur.
       */
      id: "fond", cx: 0, cy: -6, r: 96,
      arrets: [
        { a: 0, couleur: "#000000", opacite: 0.1 },
        { a: 0.35, couleur: "#000000", opacite: 0.34 },
        { a: 1, couleur: "#000000", opacite: 0.72 },
      ],
    },
  ],
  /**
   * ⚠️ **Une braise, pas une diode ni un phosphore.** Le halo est plus large que celui du
   * casque et plus chaud que celui du terminal : ce qui brille ici est censé être une
   * lumière *derrière* l'acier, pas une source posée dessus. Leur géométrie n'est toujours
   * pas touchée.
   */
  yeux: p => ({
    couleur: decalerClarte(p.tete, 0.16),
    lueur: { rayon: 4.2, couleur: p.tete },
    classe: "novac-braise",
    /* Le regard n'existe que dans la fente : ailleurs il n'y a que de l'acier. */
    decoupe: "fente",
  }),
  decoupes: () => [{ id: "fente", d: fenteDeVue() }],
  plats: p => {
    const a = acierDe(p.tete);
    const rivets: MotifPlat[] = [];
    /**
     * Les rivets, en deux touches chacun.
     *
     * ⚠️ **Un disque sombre puis un disque clair décalé, jamais un cercle contourné.** Un
     * contour donne un anneau, c'est-à-dire un trou ; un disque clair posé en haut à gauche
     * d'un disque sombre donne une tête bombée qui capte la même lumière que le reste. Deux
     * tracés de plus par rivet, et l'objet cesse d'être percé pour être assemblé.
     */
    /**
     * ⚠️ **Chaque rivet est centré dans la plaque qu'il tient, et pas seulement en `x`.**
     * Ceux du bandeau tombaient juste — il court de −68 à −48, ils sont à −58. Les autres
     * étaient posés à vue : ceux des tempes deux unités trop bas dans leur bandeau, ceux du
     * ventail une trop haut. Un rivet décentré se remarque avant tout le reste, parce que
     * l'œil compare des distances égales bien mieux qu'il n'évalue une distance seule.
     *
     * ⚠️ Aucun rivet sous la crête : le premier jeu en plaçait un au centre à `y = 74`, où
     * le nasal, peint après, le recouvrait entièrement. Deux tracés pour rien.
     */
    for (const [x, y] of [[-72, -58], [-44, -58], [44, -58], [72, -58],
                          [-76, 20], [76, 20], [-74, 63], [74, 63]] as const) {
      rivets.push({ d: ellipse(x, y, 5.6, 5.6), couleur: a.creux });
      rivets.push({ d: ellipse(x - 0.7, y - 0.9, 4.2, 4.2), couleur: a.clair });
    }
    const v = HEAUME.ventail;
    const fentes: MotifPlat[] = [];
    /**
     * Les fentes du ventail : trois de chaque côté, sous la pointe du V.
     *
     * ⚠️ **Creusées d'une seule couleur, sans reflet dessous.** Le doublage clair censé
     * suggérer un biseau a déjà été essayé sur la grille du terminal : à cette échelle il ne
     * produit pas une arête mais une ligne blanche translucide, et il a fallu le retirer.
     * La leçon vaut ici sans qu'on ait à la réapprendre.
     */
    for (const cote of [-1, 1] as const) {
      for (let i = 0; i < 3; i++) {
        fentes.push({
          d: rectangle(cote * (v.x + i * v.pas) - (cote < 0 ? v.largeur : 0), v.haut,
                       v.largeur, v.hauteur, v.largeur / 2),
          /* ⚠️ Plus sombre que le fond de gorge de l'acier, et non égal : peintes en
             `creux`, elles se confondaient exactement avec la plaque qui les porte. Un trou
             est toujours plus noir que le creux le plus profond de la pièce percée. */
          couleur: matiere(p.tete, 0.05, 0.2),
        });
      }
    }
    const b = HEAUME.bandeau;
    return [
      /* L'acier, peint par le skin : la tête garde sa couleur réglée pour la braise. */
      { d: ellipse(0, 0, 150, 150), couleur: a.sombre },
      { d: ellipse(0, 0, 150, 150), degrade: "heaume" },
      /**
       * Le bandeau de front, en plaque rapportée.
       *
       * ⚠️ **Débordant largement des deux côtés, pour être coupé par la silhouette.** Une
       * plaque qui s'arrêterait juste avant l'arête laisserait un liseré d'acier derrière
       * elle et se lirait comme une étiquette collée. Rivetée d'un bord à l'autre, elle
       * ceinture le heaume.
       */
      { d: rectangle(-110, b.haut, 220, b.bas - b.haut, 3), degrade: "plaque" },
      { d: rectangle(-110, b.bas - 2.5, 220, 2.5, 0), couleur: a.creux, opacite: 0.55 },
      /* Le ventail : la plaque du bas, sous la pointe de la fente. */
      /**
       * Le ventail, en **deux joues** qui se rejoignent sur l'axe.
       *
       * ⚠️ **Même raison que pour le nasal : une pièce d'armure est faite de plans.** Une
       * seule plaque en V, si bien dégradée soit-elle, garde la même valeur de part et
       * d'autre du milieu et se lit comme une découpe dans une tôle. Deux joues dont l'une
       * est un ton plus sombre disent qu'elles sont *rivetées ensemble*, ce qui est
       * exactement ce que montre le modèle.
       */
      ...([-1, 1] as const).map(cote => ({
        d: `M${cote * 110} ${HEAUME.fente.epaule + 4}`
          + `L${HEAUME.axe.milieu} ${HEAUME.fente.pointe + 6}`
          + `L${HEAUME.axe.milieu} 110L${cote * 110} 110Z`,
        degrade: cote === -1 ? "plaqueBasse" : "plaqueBasseOmbre",
      })),
      ...fentes,
      // La fente de vue, creusée dans l'acier, puis son fond qui s'enfonce.
      { d: fenteDeVue(), couleur: matiere(p.tete, 0.06, 0.3) },
      { d: ellipse(0, 0, 150, 150), degrade: "fond", decoupe: "fente" },
      /**
       * L'ombre que le bandeau porte dans la fente, sur sa lèvre haute.
       *
       * ⚠️ **Une ombre portée, et surtout pas un filet clair.** L'envie était d'éclairer la
       * lèvre pour marquer l'épaisseur de l'acier ; c'est exactement le cheveu blanc
       * translucide qu'il a fallu retirer du terminal, et il aurait produit ici le même
       * effet — une ligne posée sur l'image plutôt qu'une arête. Une ouverture creusée dans
       * une plaque épaisse ne montre pas de lumière en haut : elle montre l'ombre de ce qui
       * la surplombe. Six unités de dégradé noir suffisent à donner l'épaisseur.
       */
      { d: rectangle(-84, HEAUME.fente.haut, 168, 7, 0), couleur: "#000000",
        opacite: 0.5, decoupe: "fente" },
      ...rivets,
      /**
       * La crête, **devant le regard**.
       *
       * ⚠️ **Après les yeux, sinon le heaume se démonte.** Le nasal passe entre eux : peint
       * avant, un œil qui dérive vers le centre lui passerait par-dessus et l'on verrait une
       * braise flotter sur l'acier. C'est le même besoin que le reflet des vitres, et le même
       * drapeau y répond.
       */
      { d: flancDeCrete(1), degrade: "creteDroite", devant: true },
      { d: flancDeCrete(-1), degrade: "creteGauche", devant: true },
    ];
  },
};

const UNI: Skin = {
  cle: "uni",
  libelle: "Uni",
  palette: { tete: "#6366F1", accent: "#8B5CF6", yeux: "#121214" },
  motifs: () => [],
};

export const SKINS: Skin[] = [
  UNI, BASKET, VOLLEY, TENNIS, TERRE, TERMINAL, ASTRONAUTE, CHEVALIER,
];

/**
 * Ce skin convient-il à cette forme ?
 *
 * ⚠️ **Une seule fonction pour trois appelants.** La question se posait à trois endroits —
 * la liste proposée par le banc d'essai, et les deux endroits où changer de forme doit
 * retirer un skin devenu impossible — chacun avec sa propre écriture du test. Trois
 * copies d'une condition finissent par diverger, et celle-ci décide de ce qu'on voit.
 */
/**
 * ⚠️ **Le carré porte deux noms dans ce dépôt, et il a fallu s'y heurter pour le voir.**
 * Les réglages l'appellent `carre` — c'est ce que lit un portefeuille — quand la géométrie
 * l'appelle `cube`, nom de la famille de solides dont il est tiré. Le banc d'essai parle la
 * seconde langue, l'application la première. Un skin déclaré sur `carre` disparaissait donc
 * du banc sans qu'aucune erreur ne le dise.
 *
 * La table ne répare pas la cause : deux vocabulaires pour une même forme restent deux
 * vocabulaires, et les renommer touche à la couche géométrique. Elle la contient à un seul
 * endroit, celui où la question se pose, et les skins n'écrivent que le nom des réglages.
 */
const SYNONYMES_DE_FORME: Record<string, string> = { cube: "carre" };

export function skinPourForme(s: Skin, forme: string): boolean {
  const nom = SYNONYMES_DE_FORME[forme] ?? forme;
  return !s.formes || s.formes.indexOf(nom) >= 0;
}

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
