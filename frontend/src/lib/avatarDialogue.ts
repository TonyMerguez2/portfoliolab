/**
 * Ce que l'avatar dit, et **comment il le dit**.
 *
 * ⚠️ **Le message se déduit de l'état, il ne s'écrit pas à côté.** L'avatar porte déjà une
 * quinzaine d'états — somnolent, préoccupé, succès — dont chacun décrit une situation. Une
 * seconde liste de phrases, réglée séparément, aurait divergé au premier état ajouté : on
 * se serait retrouvé avec une tête qui dort et un « bonjour » à côté. Ici, ajouter un état
 * sans lui donner de phrase le fait simplement retomber sur le salut, ce qui est le bon
 * échec.
 *
 * ⚠️ **Ce ne sont pas des paroles du logiciel.** La distinction tient dans ce que les
 * phrases disent : l'avatar commente **son propre état** — il dort, il cherche, il a fini
 * — et jamais les chiffres de l'épargnant. « Bonjour » et « zzZ » n'engagent personne ;
 * « votre portefeuille est risqué » serait un avis, et le personnage n'a pas à en donner.
 *
 * ⚠️ **Une chaîne de caractères ne suffisait pas, et c'est la raison d'être de ce module.**
 * Rendue d'un bloc, « Bonjour Sacha ! » se pose comme une ligne de paragraphe : rien n'y
 * distingue la formule du nom, et rien ne peut y entrer autrement que d'un seul tenant.
 * Signalé à l'usage — « pas juste un paragraphe posé à droite sur une ligne ». Une parole
 * est donc **découpée en morceaux**, chacun portant sa taille, son ton, son envol et son
 * rang d'entrée. Le texte brut reste disponible, mais il est **recomposé** à partir des
 * morceaux : les deux ne peuvent pas diverger, puisqu'il n'y a qu'une source.
 */

/** Le nom montré par défaut, quand l'appelant n'en fournit aucun. */
export const PSEUDO_PAR_DEFAUT = "vous";

/**
 * La place laissée à la parole sur le flanc du personnage, en pixels.
 *
 * ⚠️ **Mesurée dans le navigateur, et c'est d'elle que tout découle.** La tête occupe les
 * deux tiers du repère — 83 % de la largeur rendue — et la parole commence à 86 %. Ce qui
 * reste, c'est son flanc plus la gouttière du panneau : cent trente-deux pixels. Les
 * échelles, la taille de base et la longueur des répliques s'y rapportent toutes, et le test
 * s'en sert pour refuser un morceau trop long avant qu'il n'atteigne l'écran.
 */
export const PLACE_PAROLE = 132;

/**
 * La largeur en deçà de laquelle une parole ne se laisse plus enrouler, en pixels.
 *
 * ⚠️ **C'est la largeur du plus large mot d'amorce, mesurée.** « Bonjour » occupe 84 pixels
 * en 22 gras ; sous cette borne, il se couperait en son milieu et l'on n'aurait plus une
 * parole mais des syllabes empilées. Un contenant plus étroit que cela n'a pas trop peu de
 * place pour le texte : il a trop peu de place pour la parole, et c'est à lui de reculer.
 */
export const PLACE_MINIMALE = 88;

/**
 * ⚠️ **La taille de la parole ne suit PAS celle du personnage, et c'est délibéré.**
 * L'avatar mesure environ 390 pixels sur le banc et **63** dans le bandeau du portefeuille :
 * six fois moins. Une typographie exprimée en fraction de la tête — ou d'un cadre qui la
 * suit — donnerait là-bas trois pixels et demi. Signalé à l'usage : « il faut pas que le
 * texte soit trop petit ».
 *
 * La règle tient donc en une phrase : **le contenant décide de l'enroulement, jamais du
 * corps.** Les tailles sont absolues et ne se déduisent que de `PLACE_PAROLE` ; un contenant
 * étroit fait passer la parole à la ligne, et si elle ne tient toujours pas, elle déborde —
 * ce qui se voit et se corrige. Elle ne rapetisse jamais en silence jusqu'à l'illisible.
 */

/**
 * La taille de base d'une parole, en pixels — toutes les échelles en sont des multiples.
 *
 * ⚠️ **Elle se déduit de la place, pas du goût.** L'appui monte à 1,45 fois cette base, soit
 * 32 pixels, et « Sacha ! » mesure alors 122 pixels : il reste dix pixels. Monter la base à
 * 24 les ferait perdre, et le premier pseudonyme un peu long sortirait du panneau.
 *
 * ⚠️ **Elle vit ici et non dans le composant.** Les échelles n'ont de sens que rapportées à
 * elle ; séparées, la moindre retouche de l'une aurait invalidé les autres sans que rien ne
 * le signale — et le test qui vérifie que les répliques tiennent aurait mesuré dans une
 * unité qui n'était plus celle du rendu.
 */
export const BASE_PAROLE = 22;

/**
 * La largeur d'un caractère, rapportée à la taille de la police.
 *
 * ⚠️ **Une estimation, et elle n'a le droit que de *réduire*.** Mesurée dans le navigateur :
 * « Bonjour », sept caractères, 78 pixels en 20 gras — soit 0,557 fois la taille. Aucun
 * crénage réel ne s'écrit comme ça, et c'est assumé : elle ne sert qu'à reconnaître un texte
 * *manifestement* trop long. Le composant s'en sert pour rapetisser un pseudonyme
 * interminable, jamais pour agrandir ; le test s'en sert pour refuser une réplique trop
 * longue. Dans les deux cas, se tromper de dix pour cent est sans conséquence.
 *
 * ⚠️ **Rapportée à la taille, pas figée en pixels.** Écrite « 11,1 px », elle aurait continué
 * de mesurer dans l'unité de l'ancienne base le jour où celle-ci est passée de 20 à 22.
 */
export const PART_CARACTERE = 0.557;

/**
 * Le nombre de lignes qu'un seul morceau peut occuper avant qu'on ne le rapetisse.
 *
 * ⚠️ **Deux, parce qu'au-delà le nom se hache.** Le pseudonyme est le seul morceau dont on
 * ignore la longueur, et il ne se coupe proprement nulle part. Vu à l'essai avec
 * « Alexandre-Maximilien » : posé de force à 32 pixels, il s'empilait sur **quatre** lignes
 * coupées au milieu des syllabes — contenu, mais illisible. Ramené à la taille qui le fait
 * tenir en deux, il reste un nom.
 */
export const LIGNES_MORCEAU = 2;

/**
 * La taille de lecture : celle sous laquelle on refuse de descendre, en pixels.
 *
 * ⚠️ **C'est un plancher de *lecture*, pas un plancher technique.** Seize pixels, c'est la
 * taille du texte courant de l'application. En dessous, le mot est encore dessiné, mais on ne
 * le lit plus d'un coup d'œil — or une parole ne se déchiffre pas, elle s'attrape.
 */
const PLANCHER_MORCEAU = 16;

/**
 * La taille d'un morceau à l'écran, en pixels — sa taille voulue, bornée par la place.
 *
 * ⚠️ **Le plancher compte autant que le plafond.** Sans lui, un pseudonyme de quarante
 * caractères se réduirait à sept pixels : formellement il tiendrait, et personne ne pourrait
 * le lire. À quatorze, un nom démesuré finit par déborder en hauteur — ce qui se voit, se
 * comprend, et vaut mieux qu'un texte illisible qui prétend aller bien.
 *
 * ⚠️ **Mais le plancher ne borne que la réduction, jamais la taille voulue.** Écrit
 * `max(14, min(voulu, tient))`, il **remontait** le premier « z » du dodo — voulu à 12,1
 * pixels — et le souffle repartait de trop haut : c'est le test qui l'a dit, pas l'œil. Un
 * morceau délibérément minuscule n'est pas un morceau en détresse. La fonction ne peut
 * qu'ôter de la taille, jamais en ajouter.
 */
export function tailleMorceau(m: Morceau): number {
  const voulu = BASE_PAROLE * m.echelle;
  const tient = (LIGNES_MORCEAU * PLACE_PAROLE) / (m.texte.length * PART_CARACTERE);
  return Math.min(voulu, Math.max(PLANCHER_MORCEAU, tient));
}

/**
 * Un morceau de parole.
 *
 * ⚠️ **Le découpage suit le sens, pas la grammaire.** « Bonjour » et le nom sont deux
 * morceaux parce qu'ils ne pèsent pas pareil : l'un est la formule, l'autre est *vous*.
 * « Tiens » et ses points de suspension aussi, mais pour la raison inverse — la traîne doit
 * s'effacer pendant que le mot reste franc. Découper plus finement ne servirait à rien et
 * ferait des mots hachés à l'apparition, puisque chaque morceau entre à son tour.
 */
export type Morceau = {
  texte: string;
  /** La taille, en multiple de la taille de base de la parole. */
  echelle: number;
  /** Retenu : la couleur du personnage ramenée vers le fond. Sinon, franche. */
  sourd?: boolean;
  /** Passe à la ligne avant ce morceau. */
  saut?: boolean;
  /** Se colle au précédent : aucune espace, ni à l'écran ni dans le texte brut. */
  colle?: boolean;
  /** L'envol, en multiple de la taille de base : de combien ce morceau s'élève. */
  monte?: number;
  /** Le pivot, en degrés — ce qui empêche l'alignement d'être mécanique. */
  pivot?: number;
};

/**
 * Une parole entière.
 *
 * `genre` décide de l'entrée : une phrase **se pose**, un envol **s'échappe**. Les deux ne
 * peuvent pas partager une animation — un « zzZ » qui arriverait d'en bas comme un mot
 * dirait le contraire de ce qu'il montre.
 */
export type Parole = {
  morceaux: Morceau[];
  genre: "pose" | "envol";
  /** Les trois traits d'éclat, sur les paroles enjouées seulement. */
  eclat?: boolean;
};

/** Le morceau d'appui : franc, plus grand, c'est lui qu'on lit d'abord. */
const appui = (texte: string, echelle = 1.45): Morceau => ({ texte, echelle });

/** Le morceau d'amorce : retenu et plus petit, il prépare l'appui. */
const amorce = (texte: string): Morceau => ({ texte, echelle: 1, sourd: true });

/** La traîne — points de suspension, point final : elle s'efface. */
const traine = (texte: string, echelle = 1.45): Morceau =>
  ({ texte, echelle, sourd: true, colle: true });

/**
 * Le « zzZ » du dodo.
 *
 * ⚠️ **Trois `z` qui grandissent et montent, jamais alignés.** C'est le dessin même du
 * sommeil en bande dessinée : le souffle part petit et s'éloigne en enflant. Alignés sur une
 * même ligne de base et de taille égale, les trois mêmes lettres ne disent plus rien — on
 * lit « zzZ », un mot. Chacun porte donc sa hauteur, sa taille et son pivot, et ils entrent
 * dans l'ordre, du plus petit au plus grand.
 *
 * ⚠️ **Les pivots ne se répètent pas et ne s'alternent pas.** Un balancement régulier —
 * gauche, droite, gauche — se lit comme une décoration ; trois angles inégaux se lisent
 * comme trois bouffées.
 */
const DODO: Morceau[] = [
  { texte: "z", echelle: 0.55, monte: 0, pivot: -10 },
  { texte: "z", echelle: 0.95, monte: 0.48, pivot: 6, colle: true },
  { texte: "Z", echelle: 1.5, monte: 1.15, pivot: -4, colle: true },
];

/**
 * Le salut — la parole de référence, celle dont la mise en page vient de la maquette.
 *
 * ⚠️ **La formule s'efface derrière le nom, et non l'inverse.** Sur la maquette, « Bonjour »
 * est plus petit et le nom emplit la ligne suivante : ce qui compte, c'est *à qui* l'on
 * parle. Le nom occupe donc seul sa ligne — il est aussi le seul morceau dont on ignore la
 * longueur, donc le seul qui doive pouvoir respirer.
 */
const salut = (nom: string): Parole => {
  /**
   * ⚠️ **Le nom vide ne laisse pas un trou, et le garde est ici plutôt qu'à l'entrée.**
   * Sans lui, « Bonjour  ! » s'affiche avec sa double espace et son point d'exclamation
   * orphelin — le genre de détail qu'on ne voit qu'en production, sur le premier compte
   * sans pseudonyme. Placé dans le salut lui-même, il vaut pour tous ses appelants : le
   * repli par défaut comme les états qui le réutilisent.
   */
  if (!nom) return { genre: "pose", eclat: true, morceaux: [appui("Bonjour !")] };
  return {
    genre: "pose",
    eclat: true,
    morceaux: [amorce("Bonjour"), { ...appui(`${nom} !`), saut: true }],
  };
};

/** « Je regarde » : deux états le disent, une seule mise en page les sert. */
const regarde = (): Parole => ({
  genre: "pose",
  morceaux: [amorce("Je"), { ...appui("regarde", 1.3), saut: true }],
});

/**
 * Les paroles attachées aux états qui en méritent une.
 *
 * ⚠️ **Courtes, parce que la place l'est.** La parole s'écrit à côté de la tête, et la tête
 * occupe déjà les cinq sixièmes de la scène. Ce qui reste — son flanc, plus la gouttière du
 * panneau — a été mesuré : cent trente pixels. Deux morceaux y tiennent, l'un sous l'autre.
 * Un troisième demanderait une troisième ligne, et l'ensemble cesserait d'être une parole
 * pour devenir un paragraphe.
 */
const PAROLES: Record<string, (nom: string) => Parole> = {
  somnolent: () => ({ genre: "envol", morceaux: DODO }),
  reveil: () => ({ genre: "pose", morceaux: [appui("Hm ?")] }),
  curieux: () => ({ genre: "pose", morceaux: [appui("Tiens"), traine("…")] }),
  focus: regarde,
  observation: regarde,
  reflexion: () => ({ genre: "pose", morceaux: [amorce("Voyons"), { ...appui("voir"), saut: true }] }),
  content: salut,
  "tres-content": salut,
  surpris: () => ({ genre: "pose", eclat: true, morceaux: [appui("Oh !", 1.6)] }),
  sceptique: () => ({ genre: "pose", morceaux: [appui("Hmm"), traine("…")] }),
  preoccupe: () => ({ genre: "pose", morceaux: [appui("Hmm"), traine("…")] }),
  erreur: () => ({ genre: "pose", morceaux: [appui("Aïe"), traine(".")] }),
  succes: () => ({
    genre: "pose", eclat: true,
    morceaux: [amorce("C'est"), { ...appui("fait !"), saut: true }],
  }),
};

/**
 * La parole d'un état, le nom inséré.
 *
 * ⚠️ **Un état sans parole retombe sur le salut, et c'est le bon échec.** Il laisse ajouter
 * une expression au personnage sans devoir lui inventer un texte dans la foulée ; l'inverse
 * — exiger une réplique par état — aurait fait du silence une erreur.
 */
export function parolePour(etat: string, nom?: string | null): Parole {
  return (PAROLES[etat] ?? salut)((nom ?? "").trim());
}

/**
 * Le texte brut d'une parole — recomposé depuis ses morceaux, jamais écrit deux fois.
 *
 * ⚠️ **Un envol se recompose sans espaces, une phrase avec.** « zzZ » est un souffle, pas
 * trois mots ; les coller est ce qui le distingue d'un bégaiement. Les morceaux collés
 * suivent la même règle pour la ponctuation qu'ils traînent.
 */
export function texteDe(parole: Parole): string {
  return parole.morceaux
    .map((m, i) => (i === 0 || m.colle || parole.genre === "envol" ? m.texte : ` ${m.texte}`))
    .join("");
}

/** La phrase d'un état, en texte brut. */
export function messagePour(etat: string, nom?: string | null): string {
  return texteDe(parolePour(etat, nom));
}

/**
 * Les états qui ont leur propre parole — pour que le test puisse les éprouver un à un.
 *
 * ⚠️ **Exposé par une fonction plutôt que par la table.** Rendre `PAROLES` laisserait un
 * appelant y écrire. Le test en a besoin parce que l'invariant qui compte — aucune réplique
 * écrite pour un état qui n'existe pas — ne s'observe qu'en confrontant les deux listes, et
 * qu'une réplique orpheline ne se manifeste par rien à l'exécution : elle ne s'affiche
 * simplement jamais.
 */
export function etatsQuiParlent(): string[] {
  return Object.keys(PAROLES);
}
