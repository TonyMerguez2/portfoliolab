/**
 * Les stickers posés à la main sur un graphique.
 *
 * Des repères libres, à la façon des emojis de TradingView : on en choisit un,
 * on clique sur la courbe, il reste là. Ils ne décrivent rien que le
 * portefeuille sache calculer — c'est justement leur rôle. Les pastilles
 * d'opération et les anneaux d'extrême viennent des données ; un sticker vient de
 * celui qui regarde, et marque ce que lui seul sait.
 */

/** Un sticker rangé, tel qu'il survit d'une visite à l'autre. */
export type Sticker = {
  /** Identifiant local, pour la clé de rendu et le retrait. */
  id: string;
  /** L'emoji posé. */
  glyphe: string;
  /** Horodatage en secondes : l'ancrage horizontal. */
  temps: number;
  /**
   * L'ancrage vertical, en valeur **brute**.
   *
   * ⚠️ Pas la valeur lue sur l'axe. Le graphique met la série à l'échelle du
   * total affiché dans la bande de tête (voir `ordonnee`), et ce facteur bouge à
   * chaque rafraîchissement des cours. Un sticker rangé à la valeur affichée
   * dériverait donc lentement par rapport à la courbe sous laquelle il a été
   * posé. On divise par le facteur au moment de poser, on remultiplie au moment
   * de placer : le sticker garde sa position relative au tracé.
   */
  valeur: number;
  /**
   * Le côté du sticker en pixels d'écran.
   *
   * En pixels et non en unités du graphique : un sticker est une annotation posée
   * sur la vue, pas une mesure. Le faire grandir au zoom l'aurait rendu énorme
   * sur une fenêtre d'un jour et illisible sur dix ans, alors qu'il ne dit rien
   * de la taille de ce qu'il désigne.
   */
  taille: number;
};

/** Taille de pose, et les deux bornes de l'étirement. */
export const TAILLE_DEFAUT = 22;
export const TAILLE_MIN = 14;
export const TAILLE_MAX = 72;

/** Ramène une taille dans les bornes utilisables. */
export function bornerTaille(n: number): number {
  if (!isFinite(n)) return TAILLE_DEFAUT;
  return Math.max(TAILLE_MIN, Math.min(TAILLE_MAX, Math.round(n)));
}

/**
 * La taille obtenue en tirant la poignée d'un déplacement (dx, dy).
 *
 * La moyenne des deux axes plutôt que l'un ou l'autre : la poignée est au coin,
 * et n'écouter que l'horizontale rendait le geste vertical sans effet alors que
 * c'est celui qu'on fait spontanément pour agrandir. Le sticker reste carré — un
 * emoji étiré en rectangle se déforme, ce que personne ne cherche.
 */
export function tailleEtiree(base: number, dx: number, dy: number): number {
  return bornerTaille(base + (dx + dy) / 2);
}

/**
 * Les glyphes proposés.
 *
 * Volontairement courts et sans ambiguïté à seize pixels. Les emojis à plusieurs
 * points de code — drapeaux, familles, variantes de teinte — sont écartés : la
 * cible de compilation est es5, où les parcourir caractère par caractère les
 * coupe en deux.
 */
export const GLYPHES = [
  "🚀", "📈", "📉", "🔥", "⭐", "🎯",
  "💰", "⚠️", "👀", "💡", "📌", "🔔",
  "✅", "❌", "❤️", "😀", "😭", "🤔",
];

/**
 * La clé de rangement, par portefeuille.
 *
 * Contrairement au style de grille — un réglage d'affichage, donc unique pour
 * toute l'application — un sticker parle d'**un** portefeuille à **une** date.
 * Le partager entre portefeuilles poserait des repères sur des courbes qui n'ont
 * rien à voir.
 */
export function cleStickers(portefeuille?: string | null): string {
  return `novac_chart_stickers_${portefeuille ?? "defaut"}`;
}

/** Lit les stickers rangés, en se repliant sur une liste vide. */
export function lireStickers(cle: string): Sticker[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const brut = localStorage.getItem(cle);
    if (!brut) return [];
    const l: unknown = JSON.parse(brut);
    if (!Array.isArray(l)) return [];
    // Chaque entrée est vérifiée champ par champ. Le contenu du rangement local
    // n'est pas de la donnée de confiance : une version antérieure du format, ou
    // une écriture à moitié faite, ne doit pas casser le graphique.
    // ⚠️ Le garde n'affirme pas `Sticker` mais l'ancien format, sans taille : ce
    // champ est arrivé après les premiers stickers rangés. Une entrée qui n'en a
    // pas reçoit celle par défaut plutôt que d'être écartée — perdre un repère
    // posé à la main pour un champ manquant serait disproportionné.
    type Ancien = Omit<Sticker, "taille"> & { taille?: unknown };
    return l.filter((s): s is Ancien =>
      s != null && typeof s === "object"
      && typeof (s as Ancien).id === "string"
      && typeof (s as Ancien).glyphe === "string"
      && typeof (s as Ancien).temps === "number" && isFinite((s as Ancien).temps)
      && typeof (s as Ancien).valeur === "number" && isFinite((s as Ancien).valeur))
      .map(s => ({
        id: s.id, glyphe: s.glyphe, temps: s.temps, valeur: s.valeur,
        taille: bornerTaille(typeof s.taille === "number" ? s.taille : TAILLE_DEFAUT),
      }));
  } catch {
    return [];
  }
}

export function ecrireStickers(cle: string, liste: Sticker[]): void {
  try {
    localStorage.setItem(cle, JSON.stringify(liste));
  } catch {
    /* Rangement indisponible : les stickers valent pour la session. */
  }
}

/**
 * Un compteur de session, pour que deux stickers posés dans la même milliseconde
 * ne portent pas le même identifiant.
 */
let compteur = 0;

/**
 * Un identifiant local, sans dépendre de `crypto` qui manque en test.
 *
 * ⚠️ L'horodatage et le hasard ne suffisent pas. Dans une même milliseconde
 * `Date.now()` est constant, et l'unicité reposait alors sur un tirage parmi un
 * million : sur cinq cents identifiants, la probabilité de collision atteint
 * 11,8 % — un test l'a fait apparaître une fois sur douze. Deux stickers de même
 * identifiant, et c'est la clé de rendu qui se dédouble et le retrait qui en
 * supprime deux. Le compteur rend la collision impossible au sein d'une session ;
 * l'horodatage et le hasard couvrent le cas de deux sessions simultanées.
 */
export function idSticker(): string {
  compteur += 1;
  return `s${Date.now().toString(36)}_${compteur.toString(36)}_`
       + Math.floor(Math.random() * 46656).toString(36);
}

/**
 * L'indice logique fractionnaire vers un horodatage, par interpolation.
 *
 * ⚠️ C'est ce qui permet de poser un sticker **où on l'a lâché**, et non sur la
 * barre la plus proche. `coordinateToTime` de la bibliothèque rend l'horodatage
 * d'une barre existante : sur une série journalière, la pose sautait ainsi
 * jusqu'à une demi-journée de large, ce qui se voit à l'écran comme un
 * réalignement — l'emoji ne reste pas où on l'a mis.
 *
 * L'indice logique, lui, est fractionnaire. On l'interpole entre les deux
 * horodatages voisins pour obtenir une date qui n'existe pas dans la série, et
 * c'est très bien : un sticker n'est pas une donnée, il n'a aucune raison de
 * tomber sur un point de mesure.
 *
 * Un horodatage plutôt qu'un indice, parce qu'un indice ne veut rien dire d'une
 * période à l'autre — la barre n° 40 n'est pas le même jour sur un mois et sur
 * dix ans, alors qu'une date l'est toujours.
 */
export function logiqueVersTemps(logique: number, temps: readonly number[]): number | null {
  if (!temps.length) return null;
  if (temps.length === 1) return temps[0];
  const dernier = temps.length - 1;
  // Hors série : on cale sur la borne. Une extrapolation placerait le sticker à
  // une date que le graphique ne pourra jamais réafficher.
  if (logique <= 0) return temps[0];
  if (logique >= dernier) return temps[dernier];
  const i = Math.floor(logique);
  const f = logique - i;
  return temps[i] + (temps[i + 1] - temps[i]) * f;
}

/**
 * L'inverse : un horodatage vers l'indice logique fractionnaire.
 *
 * Rend `null` hors de la série — le sticker est alors simplement hors cadre, ce
 * qui arrive dès qu'on change de période.
 */
export function tempsVersLogique(t: number, temps: readonly number[]): number | null {
  if (!temps.length) return null;
  const dernier = temps.length - 1;
  if (t < temps[0] || t > temps[dernier]) return null;
  if (temps.length === 1) return 0;
  // Recherche dichotomique : la série peut compter des centaines de points, et
  // ce calcul est refait pour chaque sticker à chaque trame de zoom.
  let bas = 0, haut = dernier;
  while (haut - bas > 1) {
    const mi = (bas + haut) >> 1;
    if (temps[mi] <= t) bas = mi; else haut = mi;
  }
  const pas = temps[haut] - temps[bas];
  return pas > 0 ? bas + (t - temps[bas]) / pas : bas;
}

/**
 * Où se trouve la barre `i`, et quelle largeur sépare deux barres voisines.
 *
 * Mesuré sur le graphique lui-même plutôt que déduit d'un espacement supposé :
 * la bibliothèque est seule à savoir où elle place ses barres, et cet écart
 * change à chaque cran de zoom.
 */
function ancreBarre(
  i: number,
  pos: (l: number) => number | null,
): { x0: number; pas: number } | null {
  const x0 = pos(i);
  if (x0 == null) return null;
  const apres = pos(i + 1);
  if (apres != null) return { x0, pas: apres - x0 };
  // Dernière barre de la série : on prend l'écart avec la précédente, qui vaut le
  // même puisque les barres sont régulièrement espacées à l'écran.
  const avant = pos(i - 1);
  if (avant != null) return { x0, pas: x0 - avant };
  return { x0, pas: 0 };
}

/**
 * Une abscisse en indice logique **fractionnaire**.
 *
 * ⚠️ La bibliothèque ne sait pas le faire, et c'est la cause du réalignement des
 * stickers. Mesuré : `coordinateToLogical` rend le même entier pour x = 300, 302
 * et 304, et `logicalToCoordinate` rend 0 dès qu'on lui passe 47,25. On n'obtient
 * donc d'elle que des ancres entières, entre lesquelles on interpole ici. Sans
 * cela, la pose sautait d'une demi-barre — jusqu'à trois pixels sur la vue
 * complète, davantage sur une fenêtre courte, et cela se voit.
 *
 * `entier` est l'indice rendu par la bibliothèque pour cette abscisse.
 */
export function logiqueFine(
  x: number,
  entier: number,
  pos: (l: number) => number | null,
): number | null {
  const b = ancreBarre(entier, pos);
  if (!b) return null;
  if (b.pas === 0) return entier;
  return entier + (x - b.x0) / b.pas;
}

/** Le chemin inverse : un indice fractionnaire vers son abscisse. */
export function coordonneeFine(
  logique: number,
  pos: (l: number) => number | null,
): number | null {
  const i = Math.floor(logique);
  const b = ancreBarre(i, pos);
  if (!b) return null;
  return b.x0 + b.pas * (logique - i);
}
