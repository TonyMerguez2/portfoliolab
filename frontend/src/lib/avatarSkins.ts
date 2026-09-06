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
  /**
   * Un texte à la place du tracé : `d` est alors ignoré.
   *
   * ⚠️ **Le seul écart à « tout est un tracé », et pour un seul mot.** L'encoche du Pip-Boy
   * porte son nom gravé, et c'était demandé. Dessiner sept lettres en polygones aurait
   * donné un tracé illisible à relire et faux dès la première correction ; un `<text>` SVG
   * se rend partout, se détoure comme un tracé et suit la même couleur. Ce que ça coûte : la
   * police du système, donc un rendu qui peut différer d'une machine à l'autre d'un demi
   * pixel — acceptable pour une gravure de huit unités, pas pour une forme.
   *
   * ⚠️ **Trois rendus la peignent, et c'est la dette connue de ce dépôt** : le composant, le
   * banc, la pastille de réglage. Chacun a une branche pour le texte, écrite de la même
   * façon ; en ajouter une quatrième oblige à la reprendre.
   */
  texte?: { contenu: string; x: number; y: number; taille: number; graisse?: number; espacement?: number };
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

// ── Appareils : ce que les écrans se partagent ─────────────────────────────

/**
 * ⚠️ **Le terminal, devenu Pip-Boy, a été retiré à la demande — et ses outils restent.** Le
 * classique et le Game Boy sont bâtis sur la même ossature : un boîtier, une vitre encastrée
 * dans une région nommée, un regard borné par elle. Les fonctions ci-dessous — l'ellipse,
 * le rectangle, la superellipse, la vitre, le reflet, la matière — sont celles qu'il avait
 * fait naître ; elles n'ont plus de propriétaire et servent aux deux.
 */

/** Une ellipse, en tracé : deux arcs d'un demi-tour. */
const ellipse = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;

/** Un rectangle à coins arrondis, en tracé. */
const rectangle = (x: number, y: number, l: number, h: number, r: number) =>
  `M${x + r} ${y}h${l - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}`
  + `a${r} ${r} 0 0 1 ${-r} ${r}h${-(l - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}`
  + `v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}Z`;

/**
 * Une superellipse |x/rx|ⁿ + |y/ry|ⁿ = 1, en tracé échantillonné.
 *
 * ⚠️ **L'écran des appareils se trace avec la courbe de la silhouette, pas avec des arcs de
 * cercle.** Le carré arrondi n'est pas un rectangle à coins ronds : c'est une superellipse
 * d'exposant 4, mesurée sur le banc — le point de la diagonale tombe à 0,841 du demi-côté,
 * ce qui est exactement 2^(−1/4). Un écran à coins circulaires posé dedans montrait deux
 * géométries d'arrondi l'une dans l'autre, et l'œil le voyait sans savoir le dire : « le
 * rayon de l'écran doit être pareil que celui de la forme ». Le même exposant, aux
 * dimensions de l'écran, donne un encadrement d'épaisseur presque constante — dix-huit
 * unités sur les côtés, vingt dans les coins. Fait d'abord pour le classique, puis demandé
 * pour le terminal : c'est `vitre()` qui la trace, donc tous les écrans la partagent.
 *
 * ⚠️ **Échantillonnée, comme la silhouette elle-même.** Il n'existe pas de commande SVG pour
 * cette courbe ; quatre-vingt-seize segments suffisent à la rendre lisse à toute taille
 * affichée, et le détourage s'en accommode aussi bien que d'un tracé à arcs.
 */
const superellipse = (cx: number, cy: number, rx: number, ry: number, n = 4, segments = 96) => {
  const e = 2 / n;
  let d = "";
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * 2 * Math.PI;
    const c = Math.cos(t), s = Math.sin(t);
    const x = cx + rx * Math.sign(c) * Math.pow(Math.abs(c), e);
    const y = cy + ry * Math.sign(s) * Math.pow(Math.abs(s), e);
    d += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d + "Z";
};

/**
 * La dalle, en tracé — la même géométrie pour la peindre et pour la détourer.
 *
 * ⚠️ **Une fonction, pas une constante.** Elle est appelée au rendu, donc un changement des
 * retraits d'une dalle se propage partout sans qu'aucune copie ne subsiste. La `marge` élargit la
 * courbe pour les creux et les encadrements : c'est le seul endroit qui s'en écarte, et il
 * le fait par un calcul lisible plutôt que par un second tracé écrit à la main.
 *
 * ⚠️ **Une superellipse, plus un rectangle à arcs.** Voir `superellipse` : les coins de
 * l'écran suivent la courbe de la silhouette, ce qui vaut pour le terminal comme pour le
 * classique.
 */
/**
 * ⚠️ **Deux formes de vitre, parce que les deux modèles n'ont pas la même.** Le classique
 * — un carré arrondi dont l'écran épouse les coins — se trace en superellipse, comme sa
 * silhouette. Le Pip-Boy, lui, a un écran *rectangulaire* aux coins modérément arrondis
 * dans un cadre épais, et le concept fourni le montre sans ambiguïté ; tracé en
 * superellipse, il perdait ses bords droits et ne ressemblait plus au concept, ce qui a
 * été signalé. Chaque appareil nomme donc ses retraits et sa forme.
 */
export type Dalle = { cote: number; haut: number; bas: number; rayon?: number };
const vitre = (marge: number, d: Dalle) => {
  const x = -100 + d.cote - marge, y = -100 + d.haut - marge;
  const l = 200 - 2 * d.cote + 2 * marge, h = 200 - d.haut - d.bas + 2 * marge;
  if (d.rayon != null) return rectangle(x, y, l, h, d.rayon + marge);
  return superellipse(x + l / 2, y + h / 2, l / 2, h / 2);
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
 *
 * ⚠️ **Deux bandes nettes, et surtout pas une estompe.** Il y a eu une version où chaque
 * bande était triplée en largeurs croissantes, pour fondre son arête. Le résultat faisait
 * l'inverse de ce qu'on cherchait : trois parallélogrammes à bord franc, ce sont **trois**
 * arêtes au lieu d'une, donc un empilement de bandes visible au lieu d'un dégradé. On ne
 * fond pas un bord en le répétant. Le tracé est revenu à sa forme d'origine, celle qui
 * plaisait — c'est la traînée du filtre de lueur qu'on cherchait alors, et elle venait
 * d'ailleurs.
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
/**
 * ⚠️ **`virage` décale la teinte, en tours (0,07 ≈ 25°), et sert au seul Pip-Boy.** Son
 * métal est un kaki *vert* quand son phosphore est ambre : déduit tel quel de l'ambre, le
 * boîtier sortait brun. Tourner la teinte d'un quart de sextant vers le vert donne l'olive du
 * modèle tout en restant accroché à la couleur réglée — un phosphore rouge donnerait un
 * boîtier brun-orangé, un bleu un boîtier violacé, ce qui est la bonne réponse.
 */
const matiere = (hex: string, clarte: number, saturation: number, virage = 0): string => {
  const [teinte, source] = rvbVersTsl(hexVersRvb(hex));
  return rvbVersHex(tslVersRvb([(teinte + virage + 1) % 1, Math.min(saturation, source * 4), clarte]));
};

/**
 * Avive une teinte : plus saturée, à clarté inchangée.
 *
 * ⚠️ **La saturation seule, et surtout pas la clarté.** Un halo de néon doit être *coloré*,
 * pas *clair* : l'éclaircir le tirerait vers le blanc, or c'est déjà ce que fait le cœur du
 * trait, et les deux finiraient par se confondre. C'est l'écart entre un cœur presque blanc
 * et un halo franchement teinté qui fait lire un tube au néon plutôt qu'une braise.
 */
const aviver = (hex: string, delta: number): string => {
  const [teinte, saturation, clarte] = rvbVersTsl(hexVersRvb(hex));
  return rvbVersHex(tslVersRvb([teinte, Math.min(1, saturation + delta), clarte]));
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
       *
       * ⚠️ **Il a été resserré dans le coin, puis rétabli — et l'aller-retour a servi.**
       * On lui a imputé la traînée derrière le regard : réduit à cent vingt unités, il ne
       * délivrait plus que 0,3 % de blanc au centre des yeux, et la traînée est restée. La
       * cause était ailleurs — la région du filtre de lueur, voir `AvatarNovac`. Le reflet
       * retrouve donc sa course : étranglé, il ne balayait plus la vitre et se réduisait à
       * une tache d'angle. Une correction qui ne corrige rien doit être défaite, pas gardée
       * « au cas où » : elle laisserait croire qu'elle sert.
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
   * ⚠️ **Un néon, et non plus une braise.** La différence tient en un point : un tube au
   * néon a un **cœur presque blanc** entouré d'un halo saturé, alors qu'une braise est de
   * la même teinte partout, simplement plus claire au centre. C'est ce contraste
   * cœur/halo qui fait lire « gaz excité » plutôt que « métal chaud », et il se règle
   * uniquement par les deux couleurs — la géométrie des yeux n'est toujours pas touchée.
   *
   * ⚠️ **Le cœur monte à 0,62 de clarté, pas à 1.** Un blanc pur aurait effacé la teinte et
   * donné un regard laiteux, indistinct de celui de l'astronaute ; il faut que la couleur
   * reste lisible dans le trait tout en paraissant surexposée. Le halo, lui, prend la teinte
   * **saturée** — pas celle du heaume, qui est déjà tirée vers l'acier.
   *
   * ⚠️ **Le rayon reste à trois, et ce n'est pas un choix esthétique.** Le halo est peint en
   * contours empilés, pas flouté : au-delà de trois unités, ses douze paliers cessent de se
   * fondre et se lisent comme des anneaux concentriques. Un néon plus large demanderait un
   * vrai filtre de flou, donc un coût de rendu par avatar, pour un gain que la fente de vue
   * masquerait aux trois quarts.
   */
  yeux: p => ({
    couleur: decalerClarte(p.tete, 0.62),
    lueur: { rayon: 3, couleur: aviver(p.tete, 0.35) },
    classe: "novac-neon",
    /* Le regard n'existe que dans la fente : ailleurs il n'y a que de l'acier. */
    decoupe: "fente",
  }),
  decoupes: () => [{ id: "fente", d: fenteDeVue() }],
  plats: p => {
    const a = acierDe(p.tete);
    const rivets: MotifPlat[] = [];
    /**
     * Les rivets : un logement sombre, une tête claire, **concentriques**.
     *
     * ⚠️ **La tête était décalée de (−0,7 ; −0,9) pour figurer un bombé, et c'était une
     * faute.** Sur un logement de 5,6 unités et une tête de 4,2, ce décalage laissait
     * l'anneau à 2,54 unités d'un côté contre 0,26 de l'autre : un rapport de dix pour un.
     * À la taille rendue, personne n'y lit un dôme — on y lit une pièce mal posée, et c'est
     * exactement ce qui a été signalé. L'œil juge très finement l'égalité de deux distances,
     * et très mal la direction d'un éclairage sur douze pixels.
     *
     * ⚠️ **Un relief se peint, il ne se décale pas.** C'est la même erreur que le cheveu
     * blanc du terminal et que le filet clair de la lèvre de fente : simuler un volume par
     * un artifice de position ou de trait, là où seule la valeur peut le dire. À cette
     * échelle un rivet n'est qu'un disque clair cerné de sombre — et le dégradé général du
     * heaume suffit à ce que ceux du haut soient plus clairs que ceux du bas.
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
      rivets.push({ d: ellipse(x, y, 4.3, 4.3), couleur: a.clair });
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

// ── Classique ─────────────────────────────────────────────────────────────────

/**
 * Met un tracé à l'échelle et le pose : `M`/`L`/`C` absolus déplacés, `c`/`l`/`s` relatifs
 * seulement agrandis.
 *
 * ⚠️ **Le strict nécessaire pour la pomme, pas un interpréteur SVG.** Six commandes, celles
 * que son tracé emploie ; une commande inconnue lève, plutôt que de laisser passer un dessin
 * faux en silence.
 */
const poser = (d: string, echelle: number, cx: number, cy: number): string => {
  let sortie = "";
  const re = /([MLCSmlcsZz])([^MLCSmlcsZz]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    const cmd = m[1];
    const nombres = (m[2].match(/-?\d*\.?\d+/g) ?? []).map(Number);
    if (cmd === "Z" || cmd === "z") { sortie += "Z"; continue; }
    const absolu = cmd === cmd.toUpperCase();
    const coords = nombres.map((v, i) =>
      (v * echelle + (absolu ? (i % 2 === 0 ? cx : cy) : 0)).toFixed(2));
    sortie += cmd + coords.join(" ");
  }
  return sortie;
};

/**
 * La pomme, en tracé de référence sur une boîte de 24, telle qu'on la dessine partout.
 *
 * ⚠️ **Un tracé connu, pas une courbe écrite à la main.** La première pomme était composée
 * de six Bézier posées à l'œil : le flanc gauche bombait plus que le droit et la feuille
 * partait de travers, si bien que le fruit paraissait penché — « mets-le droit ». Un tracé
 * de référence a ses proportions déjà justes ; on ne le retouche pas, on le pose à l'échelle.
 */
const POMME_24 =
  "M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014"
  + "-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039"
  + " 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48"
  + " 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857"
  + "-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09"
  + "-4.61 1.09z"
  + "M15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818"
  + "-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701z";

/**
 * La pomme posée sur la façade : vingt-six unités de haut, centrée en (cx, cy).
 *
 * ⚠️ **Plate et droite, sans aucun effet de volume.** C'est un signe imprimé sur un boîtier,
 * pas un objet dessus : ni ombre, ni reflet, ni dégradé du boîtier par-dessus — elle est
 * peinte après la lumière de la carrosserie, précisément pour n'en recevoir aucune.
 */
const POMME_HAUTEUR = 26;
/** Où commence le corps du fruit dans la boîte de 24 : au-dessus, il n'y a que la feuille. */
const POMME_SOMMET_DU_CORPS = 5.86;
const pomme = (cx: number, cy: number) =>
  poser(POMME_24, POMME_HAUTEUR / 24, cx - 12 * POMME_HAUTEUR / 24, cy - 12 * POMME_HAUTEUR / 24);

/**
 * Les six bandes de la pomme, de haut en bas.
 *
 * ⚠️ **Les seules couleurs écrites en dur de tout ce fichier, et c'est assumé.** Partout
 * ailleurs, chaque teinte se déduit de la couleur réglée : un boîtier, un phosphore, un
 * chrome suivent le réglage. Un arc-en-ciel, non — c'est un *signe*, et un signe qui
 * changerait de couleurs avec la tête cesserait d'être reconnu. Il est fixe pour la même
 * raison qu'un drapeau l'est.
 */
const ARC_EN_CIEL = ["#61BB46", "#FDB827", "#F5821F", "#E03A3E", "#963D97", "#009DDC"];

/**
 * Un ordinateur d'autrefois : un boîtier beige, un écran noir encastré, et sur la façade
 * une pomme et une fente à disquette.
 *
 * ⚠️ **Le troisième frère du terminal et du casque, sur la même ossature.** Un boîtier, une
 * ouverture encastrée, un regard derrière ; la silhouette, ses proportions et la géométrie
 * des yeux ne bougent pas d'un pixel. Ce qui le distingue du terminal, c'est la *matière*
 * du boîtier — claire, chaude, presque ivoire, quand le terminal est un métal sombre — et
 * une façade qui raconte l'objet par deux détails : la pomme et la fente. Posés côte à côte
 * dans la rangée, un écran sombre dans une carrosserie noire et le même dans une
 * carrosserie beige ne se confondent pas.
 *
 * ⚠️ **La façade est une marche en avant, pas un simple tour.** Sur le modèle, la face
 * avant porte l'écran dans un cadre plus clair, en relief sur le corps. Il est peint ici
 * comme une plaque un ton plus claire, élargie de onze unités autour de la vitre, avant la
 * rainure sombre et la dalle. Sans elle, l'objet se lisait comme un terminal repeint en
 * beige ; avec, il a la face d'un appareil moulé.
 *
 * ⚠️ **Tout suit la couleur réglée, hors la pomme.** Le beige proposé n'est qu'une palette
 * de départ : le corps, la façade, la rainure et la fente se déduisent de la teinte de
 * tête, l'écran et l'invite de l'accent. Une couleur grise donne un modèle platine, une
 * bleue un modèle translucide. Voir `ARC_EN_CIEL` pour l'exception.
 */
/** Les retraits de l'écran du classique : ceux du premier terminal, sans rayon — superellipse. */
const DALLE_CLASSIQUE: Dalle = { cote: 18, haut: 18, bas: 46 };

const CLASSIQUE: Skin = {
  cle: "classique",
  libelle: "Classique",
  /* Même raison que le terminal : un appareil composé pour une surface carrée. */
  formes: ["carre"],
  /**
   * Un beige chaud pour la tête, un vert de phosphore pour l'accent.
   *
   * ⚠️ **Contrairement au terminal, c'est le *boîtier* qui est réglé, pas l'écran.** Sur le
   * terminal, la carrosserie est presque invisible et l'écran fait la couleur ; ici c'est
   * l'inverse — l'objet est beige avant d'être vert. Ce qui s'allume dedans vient de
   * l'accent, et le reste d'une teinte de tête qu'on voit sur les trois quarts de la
   * surface.
   */
  palette: { tete: "#C4B396", accent: "#3FE05B", yeux: "#7CFF7A" },
  motifs: () => [],
  degrades: p => [
    {
      /* La lumière sur le boîtier, de la même source haut-gauche que tout le reste. */
      id: "boitier", cx: -70, cy: -95, r: 235,
      arrets: [
        { a: 0, couleur: "#FFFFFF", opacite: 0.16 },
        { a: 0.55, couleur: "#FFFFFF", opacite: 0.04 },
        { a: 1, couleur: "#000000", opacite: 0.14 },
      ],
    },
    {
      /**
       * La lueur du centre : plus discrète que celle du terminal.
       *
       * ⚠️ **L'écran de ce modèle est *noir*, pas vert.** Sa lumière tient dans ce qui s'y
       * écrit : le point d'invite et les yeux. Un halo appuyé en ferait un tube au phosphore
       * de plus, et le boîtier clair perdrait ce qui le rend lisible — un trou noir net dans
       * une matière claire.
       */
      id: "halo", cx: 0, cy: -20, r: 96,
      arrets: [
        { a: 0, couleur: p.accent, opacite: 0.1 },
        { a: 0.5, couleur: p.accent, opacite: 0.04 },
        { a: 1, couleur: p.accent, opacite: 0 },
      ],
    },
    {
      id: "reflet", cx: -58, cy: -84, r: 190,
      arrets: [
        { a: 0, couleur: "#FFFFFF", opacite: 0.09 },
        { a: 0.55, couleur: "#FFFFFF", opacite: 0.03 },
        { a: 1, couleur: "#FFFFFF", opacite: 0 },
      ],
    },
    {
      id: "vignette", cx: 0, cy: -14, r: 100,
      arrets: [
        { a: 0, couleur: "#000000", opacite: 0 },
        { a: 0.6, couleur: "#000000", opacite: 0 },
        { a: 1, couleur: "#000000", opacite: 0.45 },
      ],
    },
  ],
  /**
   * Des pixels allumés, bornés à la dalle — voir le terminal, dont c'est la règle.
   *
   * ⚠️ **Tirés de l'accent, jamais de `p.yeux`.** Sur le banc, la palette du skin fournit des
   * yeux verts et la première version les lisait ; sur le site, `yeux` est la couleur que le
   * composant déduit de la tête — celle des *trous* d'un visage uni, donc sombre — et les
   * yeux sortaient gris-vert sur un écran noir, à peine visibles dans le bandeau. Vu à
   * l'écran en appliquant le skin depuis le sélecteur. L'accent, lui, est celui du skin sur
   * les deux rendus : c'est le phosphore, et c'est lui qui doit éclairer.
   */
  yeux: p => ({
    couleur: decalerClarte(p.accent, 0.14),
    lueur: { rayon: 3, couleur: p.accent },
    classe: "novac-crt-yeux",
    decoupe: "dalle",
  }),
  decoupes: () => [
    { id: "dalle", d: vitre(0, DALLE_CLASSIQUE) },
    { id: "pomme", d: pomme(-60, 80) },
  ],
  plats: p => {
    /**
     * Les matières du boîtier, déduites de la teinte de tête.
     *
     * ⚠️ **Saturation imposée à 0,28, plus haute que celle du terminal.** Un beige est une
     * couleur *chaude* : à la saturation du métal du terminal, il tombait dans un gris
     * sale. C'est le plafond de `matiere` — quatre fois la saturation réglée — qui retient
     * un gris réglé près du gris.
     */
    const corps = matiere(p.tete, 0.70, 0.28);
    const facade = matiere(p.tete, 0.78, 0.26);
    const creux = matiere(p.tete, 0.40, 0.22);
    const ombre = matiere(p.tete, 0.58, 0.24);
    /* L'écran : presque noir, à peine teinté de l'accent pour que le noir soit *son* noir. */
    const dalle = matiere(p.accent, 0.06, 0.3);
    /**
     * Les six bandes, réparties sur le **corps** du fruit, la feuille entière en vert.
     *
     * ⚠️ **Pas six bandes égales sur toute la hauteur.** Réparties ainsi, le vert ne couvrait
     * que la feuille et le jaune commençait au sommet du fruit — vu sur le rendu isolé. Sur
     * le logo, la feuille est verte *et* le haut du fruit aussi : le corps se divise en six,
     * et la première bande remonte jusqu'à la feuille pour la prendre avec elle.
     */
    const bandes: MotifPlat[] = [];
    const echelle = POMME_HAUTEUR / 24;
    const hautBoite = 80 - POMME_HAUTEUR / 2;
    const hautCorps = hautBoite + POMME_SOMMET_DU_CORPS * echelle;
    const pas = (POMME_HAUTEUR - POMME_SOMMET_DU_CORPS * echelle) / ARC_EN_CIEL.length;
    for (let i = 0; i < ARC_EN_CIEL.length; i++) {
      const y0 = i === 0 ? hautBoite : hautCorps + i * pas;
      const y1 = hautCorps + (i + 1) * pas;
      bandes.push({ d: `M-80 ${y0.toFixed(2)}h40v${(y1 - y0 + 0.3).toFixed(2)}h-40Z`,
                    couleur: ARC_EN_CIEL[i], decoupe: "pomme" });
    }
    return [
      { d: ellipse(0, 0, 150, 150), couleur: corps },
      { d: ellipse(0, 0, 150, 150), degrade: "boitier" },
      /**
       * L'encadrement de l'écran, en trois marches : la façade claire, un chanfrein, la
       * rainure sombre où la vitre s'enfonce.
       *
       * ⚠️ **La rainure fait six unités, deux fois celle du terminal.** Le modèle détaillé
       * montre un bord épais et sombre autour de la dalle, qui est ce qui donne à l'écran
       * son enfoncement dans une matière claire ; à trois unités, sur un boîtier beige, il
       * disparaissait et l'écran paraissait collé dessus. Sur le terminal, le boîtier est
       * sombre et trois suffisent.
       */
      { d: vitre(13, DALLE_CLASSIQUE), couleur: ombre, opacite: 0.45 },
      { d: vitre(12, DALLE_CLASSIQUE), couleur: facade },
      { d: vitre(6, DALLE_CLASSIQUE), couleur: ombre },
      { d: vitre(4.5, DALLE_CLASSIQUE), couleur: creux },
      { d: vitre(0, DALLE_CLASSIQUE), couleur: dalle },
      { d: ellipse(0, 0, 150, 150), degrade: "halo", classe: "novac-crt-halo", decoupe: "dalle" },
      /**
       * ⚠️ **Rien d'écrit sur l'écran : ni chevron, ni tiret.** Le modèle porte un point
       * d'invite `>_` et la première version le reprenait, en haut à gauche de la dalle.
       * Retiré à la demande : sur un avatar, l'écran a déjà son sujet — les yeux — et un
       * signe de plus à côté d'eux se lisait comme un troisième œil. L'écran noir et vide
       * derrière deux pixels allumés dit « appareil » sans rien ajouter.
       */
      { d: ellipse(0, 0, 150, 150), degrade: "vignette", decoupe: "dalle" },
      /* La pomme, à gauche de la façade : six bandes détourées par le fruit. */
      ...bandes,
      /**
       * La fente à disquette, à droite : une rainure sombre et sa languette.
       *
       * ⚠️ **À dix unités sous la façade, et la pomme au même niveau.** La première version
       * posait la fente à 64, quand la façade descend à 66 : le lecteur mordait sur
       * l'encadrement de l'écran, signalé aussitôt. Fente et pomme sont descendues
       * ensemble, pour rester sur une même ligne sous la vitre ; la silhouette laisse
       * encore six unités de marge sous elles à ces abscisses.
       *
       * ⚠️ **Une pilule sombre et sa fente, sans bouton ni languette.** Le modèle détaillé
       * ne montre que cela : une forme allongée, un cheveu plus clair sur son pourtour, et
       * la fente presque noire au milieu. La languette de la première version n'y est pas,
       * et sous soixante pixels elle faisait une tache.
       */
      { d: rectangle(22, 76, 48, 11, 5.5), couleur: ombre },
      { d: rectangle(23, 77, 46, 9, 4.5), couleur: creux },
      { d: rectangle(27, 80, 38, 3.5, 1.75), couleur: dalle },
      { d: refletDeVitre(), degrade: "reflet", decoupe: "dalle", devant: true },
    ];
  },
};

// ── Game Boy ─────────────────────────────────────────────────────────────────

/**
 * L'écran du Game Boy : un rectangle aux coins doux, dans un cadre gris sombre.
 *
 * ⚠️ **Le bas descend à 49, et non à 32 comme sur le concept.** Sur le modèle, la dalle
 * s'arrête plus haut et la façade en dessous est large. Mais les yeux descendent à 38,7 et
 * sont bornés par la dalle : un écran qui finit à 32 les tronque. La consigne — ne pas
 * toucher à leur géométrie — l'emporte sur la proportion du concept ; la dalle descend
 * donc dix unités sous l'œil le plus bas, et c'est la façade qui se resserre.
 *
 * ⚠️ **Exportée pour être vérifiée, pas pour être lue ailleurs** — c'est la garde des yeux
 * qu'un test tient, et il la lit ici.
 */
export const DALLE_GAMEBOY: Dalle = { cote: 40, haut: 30, bas: 51, rayon: 8 };

/**
 * Le cadre gris autour de la dalle : ses retraits, dans le même repère.
 *
 * ⚠️ **Le bas du cadre est à 55, et c'est la contrainte qui organise toute la façade.** La
 * première version le laissait descendre à 58 pendant que le bouton du haut commençait à
 * 47 : les boutons chevauchaient le cadre, et les fentes passaient sous le bouton du bas —
 * signalé à l'écran. La dalle ne pouvant remonter (garde des yeux), c'est le cadre qui
 * s'amincit en bas — six unités contre huit en haut — et la façade qui se range en dessous,
 * de 58 à 93, sans qu'aucune pièce n'en touche une autre.
 */
const CADRE_GAMEBOY: Dalle = { cote: 22, haut: 22, bas: 45, rayon: 14 };

/**
 * Une fente de haut-parleur, inclinée : un trait épais aux bouts ronds.
 *
 * ⚠️ **Un tracé, pas une rotation SVG.** Les aplats n'ont pas de `transform` — et lui en
 * donner un aurait ouvert un cas que trois rendus devraient suivre. Les quatre coins du
 * trait se calculent, et deux disques ferment les bouts : c'est une ligne au sens propre.
 */
const fente = (cx: number, cy: number, longueur: number, largeur: number, angle: number) => {
  const c = Math.cos(angle), s = Math.sin(angle);
  const ax = cx - c * longueur / 2, ay = cy - s * longueur / 2;
  const bx = cx + c * longueur / 2, by = cy + s * longueur / 2;
  const nx = -s * largeur / 2, ny = c * largeur / 2;
  return `M${(ax + nx).toFixed(2)} ${(ay + ny).toFixed(2)}L${(bx + nx).toFixed(2)} ${(by + ny).toFixed(2)}`
    + `L${(bx - nx).toFixed(2)} ${(by - ny).toFixed(2)}L${(ax - nx).toFixed(2)} ${(ay - ny).toFixed(2)}Z`
    + ellipse(ax, ay, largeur / 2, largeur / 2) + ellipse(bx, by, largeur / 2, largeur / 2);
};

/**
 * Une console de poche : coque gris chaud, cadre sombre, dalle vert olive, et sur la
 * façade une croix, deux boutons ronds, deux touches en pilule, une diode et un
 * haut-parleur.
 *
 * ⚠️ **Le troisième appareil sur l'ossature commune, et le plus chargé en façade.** Le
 * classique a deux détails, celui-ci en a cinq — mais chacun est un signe connu de tous, et
 * c'est leur *ensemble* qui fait reconnaître l'objet au premier regard, plus que la dalle
 * verte. Aucun n'est plus fin que ce qui survit à quarante pixels : la croix devient un
 * plus sombre, les boutons deux points rouges, le haut-parleur une texture.
 *
 * ⚠️ **La dalle est mate, sans balayage ni reflet.** Un écran à cristaux liquides n'est ni
 * un tube ni une vitre : le concept le montre uni, d'un vert olive plat, avec pour seule
 * lumière ce qui s'y allume. Le halo est gardé, très faible, pour que les yeux aient l'air
 * d'éclairer la dalle ; le reflet de vitre du casque n'y aurait rien à faire.
 *
 * ⚠️ **La coque suit la couleur de tête, la dalle suit l'accent.** Une coque bleue ou noire
 * s'obtient en changeant la couleur ; le vert de la dalle et des yeux vient de l'accent du
 * skin, comme le phosphore du classique. Les deux boutons ronds et la diode sont rouges
 * fixes : ce sont des signes, pas des matières — voir l'arc-en-ciel de la pomme.
 */
const ROUGE_GAMEBOY = "#A63A5E";

const GAMEBOY: Skin = {
  cle: "gameboy",
  libelle: "Game Boy",
  formes: ["carre"],
  palette: { tete: "#D9D3C9", accent: "#7FE072", yeux: "#A6FF8F" },
  motifs: () => [],
  degrades: p => [
    {
      id: "boitier", cx: -70, cy: -95, r: 235,
      arrets: [
        { a: 0, couleur: "#FFFFFF", opacite: 0.18 },
        { a: 0.55, couleur: "#FFFFFF", opacite: 0.04 },
        { a: 1, couleur: "#000000", opacite: 0.12 },
      ],
    },
    {
      /* La lueur des yeux sur la dalle : faible, la dalle est mate. */
      id: "halo", cx: 0, cy: -8, r: 70,
      arrets: [
        { a: 0, couleur: p.accent, opacite: 0.16 },
        { a: 0.6, couleur: p.accent, opacite: 0.05 },
        { a: 1, couleur: p.accent, opacite: 0 },
      ],
    },
    {
      /* Chaque bouton rond : une lumière en haut à gauche, comme le boîtier. */
      id: "boutonRond", cx: 50, cy: 58, r: 28,
      arrets: [
        { a: 0, couleur: "#FFFFFF", opacite: 0.22 },
        { a: 1, couleur: "#000000", opacite: 0.18 },
      ],
    },
  ],
  /* Des segments allumés, bornés à la dalle : hors d'elle, pas d'écran. */
  yeux: p => ({
    couleur: aviver(decalerClarte(p.accent, 0.08), 0.3),
    lueur: { rayon: 3.2, couleur: p.accent },
    classe: "novac-crt-yeux",
    decoupe: "dalle",
  }),
  decoupes: () => [{ id: "dalle", d: vitre(0, DALLE_GAMEBOY) }],
  plats: p => {
    /**
     * ⚠️ **Les matières de la coque sont presque neutres, à dessein.** Le concept est un gris
     * chaud ; à 0,08 de saturation, la teinte réglée colore encore la coque sans en faire un
     * plastique teinté. Le cadre est le même gris, bien plus sombre, et légèrement plus
     * saturé pour ne pas virer au noir pur.
     */
    const coque = matiere(p.tete, 0.82, 0.08);
    const rebord = matiere(p.tete, 0.88, 0.08);
    const rainure = matiere(p.tete, 0.70, 0.06);
    const cadre = matiere(p.tete, 0.36, 0.05);
    const cadreSombre = matiere(p.tete, 0.26, 0.05);
    const touche = matiere(p.tete, 0.45, 0.05);
    const croix = matiere(p.tete, 0.17, 0.03);
    /* La dalle : l'accent ramené à un olive sombre — c'est un cristal liquide, pas une lampe. */
    const dalle = matiere(p.accent, 0.33, 0.28);
    const dalleOmbre = matiere(p.accent, 0.26, 0.28);

    /**
     * La façade, de gauche à droite, entre le bas du cadre (55) et le bas de la coque.
     *
     * ⚠️ **Chaque pièce est placée contre les autres *et* contre la *face* — pas la
     * silhouette.** La face s'arrête à 94, où commence le rebord clair ; c'est elle qui
     * borne le décor, et la première passe la confondait avec la silhouette à 100 : les
     * fentes du bas, justes dans la forme, mordaient sur le rebord. Vu sur le site.
     *
     * ⚠️ **Six unités entre le cadre et le bouton le plus haut, pas trois.** À trois, dans
     * le bandeau à quarante pixels, c'est un demi-pixel : les deux se touchaient à l'œil.
     * Boutons ronds de rayon 7 à (44, 74) et (62, 66) : le plus haut commence à 59, le cadre
     * finit à 55. Les fentes courent de (54, 86) à (75, 77), à quinze unités du bouton le
     * plus proche ; leur bout le plus bas est à 89,2 en y pour x ≈ 52, où la face monte
     * encore à 91,7 ; le plus à droite à 76,5 en x pour y ≈ 74, où la face s'étend à 83.
     *
     * ⚠️ **Rentrés vers le centre après une troisième passe.** La croix allait jusqu'à −77
     * et les fentes jusqu'à 79 : dans la forme, mais collés au rebord, et la diode touchait
     * presque le cadre. Signalé trois fois de suite pour trois pièces : le décor d'une
     * façade se compose depuis son centre, pas depuis ses bords. La croix va maintenant de
     * −70 à −44, la diode à (−87, −45) laisse cinq unités au cadre.
     */
    const boutons: MotifPlat[] = [];
    for (const [bx, by] of [[44, 74], [62, 66]]) {
      boutons.push({ d: ellipse(bx, by + 1, 7, 7), couleur: "#000000", opacite: 0.25 });
      boutons.push({ d: ellipse(bx, by, 7, 7), couleur: ROUGE_GAMEBOY });
      boutons.push({ d: ellipse(bx, by, 7, 7), degrade: "boutonRond" });
      boutons.push({ d: ellipse(bx - 2, by - 2.3, 2.6, 1.8), couleur: "#FFFFFF", opacite: 0.28 });
    }
    const hautParleur: MotifPlat[] = [];
    for (let k = 0; k < 6; k++) {
      const cx = 54 + k * 4.2, cy = 86 - k * 1.8;
      hautParleur.push({ d: fente(cx, cy, 7, 2.2, -1.15), couleur: cadre, opacite: 0.75 });
    }
    return [
      /* Le rebord : coque en clair, rainure, face — même construction que les autres. */
      { d: ellipse(0, 0, 150, 150), couleur: rebord },
      { d: superellipse(0, 0, 95.5, 95.5), couleur: rainure },
      { d: superellipse(0, 0, 94, 94), couleur: coque },
      { d: ellipse(0, 0, 150, 150), degrade: "boitier" },
      /* Le cadre gris de l'écran, avec son ombre et sa marche intérieure. */
      { d: vitre(1.5, CADRE_GAMEBOY), couleur: rainure },
      { d: vitre(0, CADRE_GAMEBOY), couleur: cadre },
      { d: vitre(0, CADRE_GAMEBOY), degrade: "boitier" },
      { d: vitre(2.5, DALLE_GAMEBOY), couleur: cadreSombre },
      { d: vitre(0, DALLE_GAMEBOY), couleur: dalle },
      /* Une ombre portée par le cadre sur le haut de la dalle : c'est elle qui l'enfonce. */
      { d: `M-100 -100H100V${-100 + DALLE_GAMEBOY.haut + 4}H-100Z`, couleur: dalleOmbre, decoupe: "dalle" },
      { d: ellipse(0, 0, 150, 150), degrade: "halo", classe: "novac-crt-halo", decoupe: "dalle" },
      /* La diode, en haut à gauche de l'écran. */
      { d: ellipse(-87, -45, 3.8, 3.8), couleur: cadreSombre },
      { d: ellipse(-87, -45, 2.9, 2.9), couleur: ROUGE_GAMEBOY },
      { d: ellipse(-87.9, -46.1, 1.1, 0.8), couleur: "#FFFFFF", opacite: 0.35 },
      /* La croix, en bas à gauche : deux barres et leur creux central. */
      { d: rectangle(-62.5, 62, 11, 26, 2.5), couleur: croix },
      { d: rectangle(-70, 69.5, 26, 11, 2.5), couleur: croix },
      { d: ellipse(-57, 75, 2.8, 2.8), couleur: touche, opacite: 0.5 },
      /* Les deux touches en pilule, au centre. */
      { d: rectangle(-27, 71.5, 20, 6.5, 3.25), couleur: cadre },
      { d: rectangle(-25, 73.2, 16, 3, 1.5), couleur: touche },
      { d: rectangle(2, 71.5, 20, 6.5, 3.25), couleur: cadre },
      { d: rectangle(4, 73.2, 16, 3, 1.5), couleur: touche },
      ...boutons,
      ...hautParleur,
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
  UNI, BASKET, VOLLEY, TENNIS, TERRE, ASTRONAUTE, CHEVALIER, CLASSIQUE, GAMEBOY,
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
