/**
 * Les dessins de contact d'une puce à circuit intégré.
 *
 * ⚠️ **Six retenus sur les huit de la planche.** Le quatrième — une colonne centrale barrée
 * d'un X — et le sixième — deux chevrons nus — ont été écartés à l'usage. Les rangs
 * conservés gardent leur **numéro de planche** dans les commentaires, et non leur position
 * dans ce tableau : c'est ce numéro qui permet d'en désigner un, et le renuméroter aurait
 * rendu muet le seul repère commun.
 *
 * ⚠️ **Ce sont des plages, et non des sillons — la première version s'était trompée de
 * modèle.** J'avais tracé les gravures au pinceau : un réseau de traits sombres posé sur une
 * plaque pleine. C'est plus court à écrire et cela paraissait équivalent, mais un trait ne
 * peut pas arrondir ce qu'il sépare — il laisse les plages à angles vifs. Or sur la planche,
 * chaque contact est une **tuile nettement arrondie**, d'un rayon bien plus grand que la
 * largeur du sillon qui la borde, et c'est ce contraste qu'on reconnaît. Relevé à l'usage :
 * « c'est pas exactement la même chose ».
 *
 * ⚠️ **On peint donc le substrat, puis les plages par-dessus.** Le sillon n'est jamais
 * dessiné : il est ce qui reste visible entre deux tuiles. Sa largeur se règle en écartant
 * les plages, son fond est le substrat, et chaque tuile porte son propre arrondi.
 *
 * ⚠️ **Les plages du pourtour débordent de la boîte, et c'est la découpe qui les taille.**
 * Une tuile d'angle doit épouser la courbe du contour de la puce, pas porter son propre rayon
 * dans le coin. Plutôt que de tracer des angles dissymétriques, on la laisse sortir et la
 * silhouette la coupe : ses angles extérieurs prennent alors exactement le rayon du contour.
 *
 * ⚠️ **Un helper de polygone arrondi, plutôt que des `<rect rx>`.** Il a d'abord servi à des
 * tuiles triangulaires, écartées depuis ; il reste parce qu'il fabrique aussi les pavés, et
 * qu'un dessin en biais redemandé n'aurait rien à réinventer.
 */

/** Le repère commun : la boîte de la puce, en pixels. */
export const REPERE_PUCE = { largeur: 32, hauteur: 26 };

/** Le rayon d'une tuile. Mesuré sur la planche : il est franc, presque un tiers de sillon. */
const RAYON_PLAGE = 1.9;
/** La demi-largeur d'un sillon : c'est de cela qu'on écarte deux tuiles voisines. */
const S = 0.55;
/** De combien les tuiles du pourtour sortent de la boîte, avant d'être taillées. */
export const DEBORD_PLAGE = 3;
const DEHORS = DEBORD_PLAGE;

const X0 = -DEHORS;
const X1 = REPERE_PUCE.largeur + DEHORS;
const Y0 = -DEHORS;
const Y1 = REPERE_PUCE.hauteur + DEHORS;

/* Les lignes de partage, prises au milieu du sillon. Elles reviennent dans presque tous les
   dessins : nommées une fois, elles ne peuvent pas diverger d'un motif à l'autre. */
const HAUT = 9;      // le sillon horizontal du haut
const BAS = 17.4;    // celui du bas
const GAUCHE = 11.5; // le sillon vertical qui borde la colonne du milieu, à gauche
const DROITE = 20.5; // le même, à droite
const AXE = REPERE_PUCE.largeur / 2;

type Point = readonly [number, number];

/**
 * Le tracé d'un polygone aux angles arrondis.
 *
 * ⚠️ **Le rayon se rabat sur la moitié du plus court côté adjacent.** Sans cette borne, un
 * angle très fermé — la pointe d'un chevron — voit ses deux arrondis se croiser, et le tracé
 * se replie sur lui-même en produisant une entaille au lieu d'une pointe. C'est invisible
 * dans le code et parfaitement visible à l'écran, sur un seul dessin à la fois.
 *
 * ⚠️ **Une quadratique par angle, le sommet servant de point de contrôle.** Un arc de cercle
 * exact demanderait le centre et le sens de rotation ; la quadratique donne la même courbe à
 * l'œil sur des rayons de deux unités, et elle ne peut pas se tromper de sens.
 */
function polygoneArrondi(points: readonly Point[], rayon = RAYON_PLAGE): string {
  const n = points.length;
  const morceaux: string[] = [];
  for (let i = 0; i < n; i++) {
    const s = points[i];
    const avant = points[(i - 1 + n) % n];
    const apres = points[(i + 1) % n];
    const versAvant = vecteur(s, avant);
    const versApres = vecteur(s, apres);
    const r = Math.min(rayon, longueur(s, avant) / 2, longueur(s, apres) / 2);
    const a = [s[0] + versAvant[0] * r, s[1] + versAvant[1] * r];
    const b = [s[0] + versApres[0] * r, s[1] + versApres[1] * r];
    morceaux.push(`${i === 0 ? "M" : "L"}${arr(a[0])} ${arr(a[1])}`);
    morceaux.push(`Q${arr(s[0])} ${arr(s[1])} ${arr(b[0])} ${arr(b[1])}`);
  }
  return morceaux.join(" ") + " Z";
}

const longueur = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const vecteur = (a: Point, b: Point) => {
  const d = longueur(a, b) || 1;
  return [(b[0] - a[0]) / d, (b[1] - a[1]) / d] as const;
};
/** Deux décimales suffisent dans un repère de 32, et le fichier reste lisible. */
const arr = (v: number) => Number(v.toFixed(2));

/** Une tuile rectangulaire, donnée par ses deux coins. */
const pave = (x1: number, y1: number, x2: number, y2: number) =>
  polygoneArrondi([[x1, y1], [x2, y1], [x2, y2], [x1, y2]]);

/* Les trois bandes et les colonnes, une fois les sillons retranchés. */
const BANDE_HAUTE = [Y0, HAUT - S] as const;
const BANDE_MEDIANE = [HAUT + S, BAS - S] as const;
const BANDE_BASSE = [BAS + S, Y1] as const;

/**
 * Un dessin de puce : ses plages, et les entailles qui ne séparent rien.
 *
 * ⚠️ **Deux natures, parce que la planche en montre deux.** L'essentiel du dessin découpe la
 * plaque en tuiles ; mais le septième porte deux tirets courts qui **n'atteignent aucun
 * bord** — ils entament une plage sans la couper en deux. Les décrire en tuiles aurait
 * demandé des polygones non convexes en U ; en entaille, ce sont deux segments.
 */
export type MotifPuce = {
  /** Les tuiles de métal, tracés fermés. */
  plages: string[];
  /** Les disques, quand une tuile est ronde — le cinquième dessin. */
  disques?: { cx: number; cy: number; r: number }[];
  /** Les traits sombres qui n'ouvrent pas la plaque. */
  entailles?: string[];
};

/** Les dessins retenus, dans l'ordre de la planche fournie. */
export const MOTIFS_PUCE: readonly MotifPuce[] = [
  /* 1 — Bloc central. Deux bandes coupées en leur milieu, une bande médiane en trois. */
  {
    plages: [
      pave(X0, BANDE_HAUTE[0], AXE - S, BANDE_HAUTE[1]),
      pave(AXE + S, BANDE_HAUTE[0], X1, BANDE_HAUTE[1]),
      pave(X0, BANDE_MEDIANE[0], GAUCHE - S, BANDE_MEDIANE[1]),
      pave(GAUCHE + S, BANDE_MEDIANE[0], DROITE - S, BANDE_MEDIANE[1]),
      pave(DROITE + S, BANDE_MEDIANE[0], X1, BANDE_MEDIANE[1]),
      pave(X0, BANDE_BASSE[0], AXE - S, BANDE_BASSE[1]),
      pave(AXE + S, BANDE_BASSE[0], X1, BANDE_BASSE[1]),
    ],
  },

  /* 2 — Cadre et chevrons. Bandes haute et basse d'un seul tenant, bloc central au milieu,
     et par-dessus un cadre et deux chevrons gravés. */
  (() => {
    const c = { x1: 3.6, x2: 28.4, y1: 3.6, y2: 22.4, r: 2.2 };
    return {
      plages: [
        pave(X0, BANDE_HAUTE[0], X1, BANDE_HAUTE[1]),
        pave(X0, BANDE_MEDIANE[0], GAUCHE - S, BANDE_MEDIANE[1]),
        pave(GAUCHE + S, BANDE_MEDIANE[0], DROITE - S, BANDE_MEDIANE[1]),
        pave(DROITE + S, BANDE_MEDIANE[0], X1, BANDE_MEDIANE[1]),
        pave(X0, BANDE_BASSE[0], X1, BANDE_BASSE[1]),
      ],
      /**
       * ⚠️ **Cadre et chevrons sont gravés, ils ne découpent pas.** Une première version en
       * faisait des frontières de tuiles : le chevron devenait un large triangle de métal et
       * le cadre un anneau, si bien que le dessin se lisait comme une mosaïque. Sur la
       * planche, ce sont des **traits fins** — l'un et l'autre entament la plaque sans la
       * partager. Relevé en comparant le rendu à la planche.
       */
      entailles: [
        `M${c.x1 + c.r} ${c.y1} H${c.x2 - c.r} Q${c.x2} ${c.y1} ${c.x2} ${c.y1 + c.r}`
          + ` V${c.y2 - c.r} Q${c.x2} ${c.y2} ${c.x2 - c.r} ${c.y2}`
          + ` H${c.x1 + c.r} Q${c.x1} ${c.y2} ${c.x1} ${c.y2 - c.r}`
          + ` V${c.y1 + c.r} Q${c.x1} ${c.y1} ${c.x1 + c.r} ${c.y1}`,
        `M${GAUCHE} ${c.y1} L${AXE} ${HAUT - S} L${DROITE} ${c.y1}`,
        `M${GAUCHE} ${c.y2} L${AXE} ${BAS + S} L${DROITE} ${c.y2}`,
      ],
    };
  })(),

  /* 3 — Six barres. Un sillon vertical franc, trois tuiles de chaque côté. Il est posé à
     gauche du milieu : ce décalage est ce qui distingue le dessin d'un damier. */
  (() => {
    const v = 14;
    return {
      plages: [
        pave(X0, BANDE_HAUTE[0], v - S, BANDE_HAUTE[1]),
        pave(X0, BANDE_MEDIANE[0], v - S, BANDE_MEDIANE[1]),
        pave(X0, BANDE_BASSE[0], v - S, BANDE_BASSE[1]),
        pave(v + S, BANDE_HAUTE[0], X1, BANDE_HAUTE[1]),
        pave(v + S, BANDE_MEDIANE[0], X1, BANDE_MEDIANE[1]),
        pave(v + S, BANDE_BASSE[0], X1, BANDE_BASSE[1]),
      ],
    };
  })(),

  /* 5 — Pastille. Le bloc central devient un disque ; les tuiles médianes s'arrêtent à son
     bord, et les bandes haute et basse restent coupées en leur milieu. */
  (() => {
    const r = 3.7;
    return {
      plages: [
        pave(X0, BANDE_HAUTE[0], AXE - S, BANDE_HAUTE[1]),
        pave(AXE + S, BANDE_HAUTE[0], X1, BANDE_HAUTE[1]),
        pave(X0, BANDE_MEDIANE[0], AXE - r - S, BANDE_MEDIANE[1]),
        pave(AXE + r + S, BANDE_MEDIANE[0], X1, BANDE_MEDIANE[1]),
        pave(X0, BANDE_BASSE[0], AXE - S, BANDE_BASSE[1]),
        pave(AXE + S, BANDE_BASSE[0], X1, BANDE_BASSE[1]),
      ],
      disques: [{ cx: AXE, cy: 13, r }],
    };
  })(),

  /* 7 — Asymétrique. Trois barres à gauche ; à droite trois plages, dont les deux extrêmes
     portent un tiret court qui n'atteint aucun bord — les seules marques flottantes de la
     planche. */
  (() => {
    const v = 12.6;
    return {
      plages: [
        pave(X0, BANDE_HAUTE[0], v - S, BANDE_HAUTE[1]),
        pave(X0, BANDE_MEDIANE[0], v - S, BANDE_MEDIANE[1]),
        pave(X0, BANDE_BASSE[0], v - S, BANDE_BASSE[1]),
        pave(v + S, BANDE_HAUTE[0], X1, BANDE_HAUTE[1]),
        pave(v + S, BANDE_MEDIANE[0], X1, BANDE_MEDIANE[1]),
        pave(v + S, BANDE_BASSE[0], X1, BANDE_BASSE[1]),
      ],
      /**
       * ⚠️ **Deux tirets, et non deux sillons.** Ils entament une plage sans la couper en
       * deux : décrits en tuiles, il aurait fallu des polygones non convexes en U, et le
       * helper d'arrondi ne les traite pas. En entaille, ce sont deux segments.
       */
      entailles: ["M21.6 5.2 H27.8", "M21.6 21.2 H27.8"],
    };
  })(),

  /* 8 — Damier. Le premier dessin dont les bandes haute et basse sont coupées en trois au
     lieu de deux : les verticales tombent alors dans le prolongement du bloc central. */
  {
    plages: ([BANDE_HAUTE, BANDE_MEDIANE, BANDE_BASSE] as const).flatMap(([y1, y2]) => [
      pave(X0, y1, GAUCHE - S, y2),
      pave(GAUCHE + S, y1, DROITE - S, y2),
      pave(DROITE + S, y1, X1, y2),
    ]),
  },
];

/**
 * Le dessin attribué à un compte.
 *
 * ⚠️ **Tiré au hasard *en apparence*, mais déduit — et c'est toute la difficulté de la
 * demande.** Un `Math.random()` aurait changé de puce à chaque rendu : la carte se serait
 * regravée en changeant d'onglet, en survolant un dossier, à chaque rechargement. « Une puce
 * au hasard » veut dire *imprévisible*, pas *instable* : ce qu'on veut, c'est que deux
 * comptes voisins ne portent pas le même dessin, et que le mien ne bouge jamais.
 *
 * ⚠️ **Déduit plutôt que stocké, donc rien à écrire en base.** Une colonne `puce` aurait
 * demandé une migration, un défaut pour les comptes existants, et un champ de plus à ne
 * jamais oublier de recopier. La clé du compte suffit : elle est déjà stable et déjà unique.
 *
 * ⚠️ **Une somme de rangs pondérée, et non la longueur ni le premier caractère.** Les noms de
 * comptes se ressemblent beaucoup — « PEA Bourso », « PEA Trade Republic », « Compte
 * courant » — et partagent souvent leur début. Le facteur 33 à chaque caractère fait que deux
 * clés voisines tombent loin l'une de l'autre.
 */
export function motifPour(cle: string): number {
  let somme = 0;
  for (let i = 0; i < cle.length; i++) {
    somme = (somme * 33 + cle.charCodeAt(i)) % 100003;
  }
  return somme % MOTIFS_PUCE.length;
}


/**
 * Le fond gravé d'une carte : combien de dessins, et lequel revient à qui.
 *
 * ⚠️ **Quatre, et non un seul.** Le guillochis était unique : deux dossiers de trésorerie
 * côte à côte montraient exactement la même courbe au même endroit, ce qui les faisait lire
 * comme un motif d'interface plutôt que comme deux objets. Demandé à l'usage, sur le modèle
 * des puces. Le quatrième — des hachures fines pliées par une arête — est venu d'une carte
 * réelle montrée à l'usage.
 *
 * ⚠️ **Tirés indépendamment de la puce, et c'est une vraie contrainte.** Réutiliser
 * `motifPour` telle quelle aurait lié les deux : la puce n° 3 serait toujours venue avec le
 * fond n° 0, et l'on aurait vu six paires figées au lieu de dix-huit combinaisons. Le sel
 * décale la somme avant le modulo, ce qui suffit à décorréler les deux tirages.
 *
 * ⚠️ **Même raison d'être que pour la puce : déduit, jamais tiré au sort.** Un
 * `Math.random()` regraverait le fond à chaque rendu.
 */
export const FONDS_CARTE = 4;

export function fondPour(cle: string): number {
  let somme = 7919;
  for (let i = 0; i < cle.length; i++) {
    somme = (somme * 31 + cle.charCodeAt(i)) % 100003;
  }
  return somme % FONDS_CARTE;
}
