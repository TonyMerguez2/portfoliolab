import {
  clartePercue, contraste, decalerClarte, hexVersRvb, luminance, rvbVersHex, rvbVersTsl,
  tslVersRvb,
} from "./couleur";

/**
 * La couleur des yeux, déduite de celle de la tête.
 *
 * ⚠️ **Déduite et non choisie, parce qu'un second réglage se serait mal réglé.**
 * Laisser l'utilisateur poser librement les deux couleurs, c'est lui laisser poser un
 * bleu sombre sur un bleu sombre — et l'avatar n'a plus de regard du tout. Une seule
 * décision à prendre, et le contraste est garanti par construction.
 *
 * ⚠️ **Les yeux sont des trous, pas des pupilles.** Ils doivent donc être *plus sombres*
 * que la tête tant que c'est possible : un œil clair sur une tête sombre se lit comme un
 * regard lumineux, ce qui est un autre personnage. On ne bascule sur du clair que
 * lorsque la tête est déjà si sombre qu'aucun noir ne s'y détacherait.
 *
 * ⚠️ **La teinte est conservée, la saturation retenue.** Un noir pur sur une tête
 * colorée fait un trou mort ; le même noir légèrement teinté de la couleur de la tête
 * s'y intègre. Mais à pleine saturation, un « noir » violet reste violet — d'où le
 * plafond.
 */
export function couleurDesYeux(fond: string): string {
  const [teinte, saturation] = rvbVersTsl(hexVersRvb(fond));
  const teinté = (clarte: number, plafond: number) =>
    rvbVersHex(tslVersRvb([teinte, Math.min(saturation, plafond), clarte]));
  const creux = teinté(0.10, 0.45);
  /**
   * ⚠️ **Le basculement se mesure, il ne se devine pas.** J'avais d'abord posé un seuil
   * de clarté au jugé : à 0,30 une tête sombre gardait des yeux sombres, avec 1,86 de
   * contraste — un regard qu'on ne distingue plus. Or la limite n'est pas une opinion,
   * elle est arithmétique : atteindre un contraste de 3 face à du noir demande une
   * luminance d'au moins 0,10, soit environ 0,36 de clarté. En dessous, **aucun** œil
   * sombre ne peut convenir, quelle que soit la valeur choisie.
   *
   * On garde donc le creux tant qu'il est lisible, et on bascule sur le clair sinon.
   */
  if (contraste(fond, creux) >= 3) return creux;
  return teinté(0.93, 0.16);
}

/**
 * L'encre la plus forte que le fond permette — noir ou blanc.
 *
 * ⚠️ **Ce n'est pas la couleur des yeux, et la différence est mesurée.** Le regard n'a
 * besoin que de trois pour un : ce sont deux grandes formes pleines, et `couleurDesYeux`
 * cherche d'abord un creux de la teinte pour rester dans la famille du visage. Du texte
 * en a besoin de bien plus, parce qu'il sera **dilué** — les mentions secondaires et
 * faibles se rapprochent du fond, et chaque dilution mange du contraste. Mesuré avec
 * l'encre du regard : sur l'ardoise, un gris moyen où elle plafonne à 3,7, les niveaux
 * faibles tombaient à 2,71. Le noir ou le blanc donne la réserve nécessaire ; le fond,
 * lui, garde ses yeux.
 */
export function encrePleine(fond: string): string {
  /**
   * ⚠️ **On compare les deux, on ne devine pas d'après la luminance.** Un seuil posé à la
   * main envoyait le corail vers le blanc — 3,67 pour 1 — alors que le noir y donne 5,8 :
   * sa luminance le classait « sombre » quand sa clarté perçue en fait un fond moyen.
   * Avec deux candidats seulement, la comparaison directe est exacte et tient en une
   * ligne ; aucun seuil ne peut faire mieux, et tout seuil peut se tromper.
   */
  return contraste(fond, "#000000") >= contraste(fond, "#FFFFFF") ? "#000000" : "#FFFFFF";
}

/**
 * Une encre plus ou moins appuyée, obtenue en la ramenant vers le fond.
 *
 * ⚠️ **Vers le fond, et non vers le gris.** Une opacité sur du noir ou du blanc
 * déteindrait : sur une carte crème, du texte atténué virerait au gris sale au lieu de
 * s'estomper dans sa propre couleur. Mélangée au fond, chaque nuance reste de la famille.
 */
/**
 * La teinte d'une priorité, ramenée jusqu'à devenir lisible sur le fond.
 *
 * ⚠️ **Sans cela, l'urgence cesse de se voir — mesuré, sur dix couleurs sur onze.** Le
 * titre d'une aide se teinte selon sa priorité : rouge, orange, vert. Ces valeurs sont
 * réglées pour le fond sombre des cartes ; posées sur une carte crème ou ambre, elles
 * tombent entre 1,1 et 2,5 pour 1. Le titre le plus pressant devenait le moins lisible,
 * exactement à l'envers de ce qu'il veut dire.
 *
 * ⚠️ **On déplace la clarté, pas la teinte.** Retomber sur l'encre serait le plus simple
 * et perdrait l'information : les quatre priorités auraient la même couleur. En
 * assombrissant ou en éclaircissant par pas — dans le sens que le fond commande, celui-là
 * même que suivent les yeux de l'avatar — le rouge reste rouge et le vert reste vert,
 * jusqu'à ce qu'ils passent la barre des trois pour un.
 */
export function lisible(fond: string, teinte: string): string {
  if (contraste(fond, teinte) >= 3) return teinte;
  const versLeClair = luminance(encrePleine(fond)) > luminance(fond);
  let essai = teinte;
  for (let i = 0; i < 20; i++) {
    essai = decalerClarte(essai, versLeClair ? 0.05 : -0.05);
    if (contraste(fond, essai) >= 3) return essai;
  }
  // Aucune clarté ne convient — teinte trop proche du fond. L'encre reste lisible.
  return couleurDesYeux(fond);
}

export function encre(fond: string, part: number): string {
  const [rf, vf, bf] = hexVersRvb(fond);
  const [re, ve, be] = hexVersRvb(encrePleine(fond));
  const m = (a: number, b: number) => Math.round(a + (b - a) * part);
  return rvbVersHex([m(rf, re), m(vf, ve), m(bf, be)]);
}

/**
 * Le fond d'un **creux** : la carte, enfoncée.
 *
 * ⚠️ **Un creux se fait plus sombre, pas plus contrasté.** L'encre part vers le noir sur
 * une carte claire et vers le blanc sur une carte sombre — c'est ce qu'il faut pour du
 * texte, et c'est l'inverse de ce qu'il faut ici : un renfoncement éclairci sur une carte
 * sombre se lit comme une bosse. La lumière vient d'en haut, donc ce qui s'enfonce
 * s'assombrit, quelle que soit la couleur. On mélange donc vers le noir, toujours.
 *
 * Le relief se termine par deux ombres internes, comme les pastilles de couleur le font
 * déjà en sens inverse : une ombre portée depuis le bord haut, un liseré clair sur le bord
 * bas. Sans elles, le creux n'est qu'un rectangle plus sombre.
 */
export function fondCreux(fond: string, part: number = 0.12): string {
  const [r, v, b] = hexVersRvb(fond);
  const m = (x: number) => Math.round(x * (1 - part));
  return rvbVersHex([m(r), m(v), m(b)]);
}

/** Les deux ombres qui creusent : la lumière vient d'en haut. */
export const OMBRES_CREUX =
  "inset 0 2px 5px rgba(0,0,0,0.20), inset 0 -1px 0 rgba(255,255,255,0.10)";

/**
 * Le liseré intérieur d'une carte teintée.
 *
 * ⚠️ **Le cadre extérieur n'a pas de fonction ici : il *est* la carte.** C'est la règle des
 * deux thèmes, et elle est sans ambiguïté — `--nv-cadre` vaut `--nv-carte`, `#030712` en
 * sombre et `#FFFFFF` en clair, et le voile de l'anneau est cette même couleur à moitié.
 * L'anneau ne se voit donc jamais ; il ne fait que ménager six pixels autour de la carte.
 *
 * ⚠️ **J'avais fabriqué un noir teinté à sa place, et c'était un contresens.** Un noir posé
 * autour d'une carte bleue se voit énormément — un anneau sombre, exactement ce que le
 * thème évite en donnant au cadre la couleur de sa carte. Signalé à l'usage, deux fois.
 * Reproduire un rapport, ce n'est pas fabriquer une couleur qui *ressemble* à celle du
 * thème : c'est appliquer la même règle à une autre valeur de départ.
 */

/**
 * L'écart de clarté perçue entre une carte et son liseré, en points de `L*`.
 *
 * ⚠️ **Mesuré sur les deux thèmes, et ce n'est pas le rapport de contraste.** Le thème
 * sombre pose 6,3 points, le thème clair 8,4. Calé d'abord sur le *rapport* du thème
 * sombre — 1,135 —, le liseré de la carte teintée n'atteignait que 4,7 points : invisible,
 * alors même que son rapport de contraste était plus élevé que la référence. La formule du
 * contraste s'effondre dès qu'on s'éloigne du noir ; `L*` ne bouge pas. Sept points rend le
 * même bord sur les onze couleurs.
 */
const ECART_BORD = 7;

/**
 * Le liseré intérieur : la même couleur, juste assez décalée pour se voir.
 *
 * ⚠️ **Dans le sens où il reste de la place.** Le thème sombre éclaircit son liseré, le
 * thème clair l'assombrit — ce n'est pas une préférence mais une nécessité : sur une carte
 * citron, un liseré plus clair sortirait de l'échelle et disparaîtrait. On cherche donc le
 * décalage qui atteint la séparation voulue, du côté qui en a les moyens.
 */
export function bordCarte(fond: string): string {
  const [teinte, saturation, clarte] = rvbVersTsl(hexVersRvb(fond));
  const vise = clartePercue(fond);
  const sens = clarte > 0.5 ? -1 : 1;
  let essai = fond;
  for (let i = 1; i <= 40; i++) {
    const l = clarte + sens * i * 0.008;
    if (l <= 0 || l >= 1) return essai;
    essai = rvbVersHex(tslVersRvb([teinte, saturation, l]));
    if (Math.abs(clartePercue(essai) - vise) >= ECART_BORD) return essai;
  }
  return essai;
}

/**
 * Le contraste entre une tête et ses yeux, pour vérifier qu'on voit quelque chose.
 *
 * Exporté surtout pour le test : c'est la seule garantie qui compte, et elle se mesure.
 */
export function contrasteDuRegard(fond: string): number {
  return contraste(fond, couleurDesYeux(fond));
}

/**
 * Les couleurs proposées au clic sur le personnage.
 *
 * Un choix court plutôt qu'une roue complète : elles se parcourent d'un coup d'œil, et le
 * « + » reste là pour qui veut autre chose. Elles couvrent le tour du cercle chromatique
 * sans trou, à clarté et saturation comparables — deux teintes voisines mais l'une terne
 * et l'autre vive se seraient lues comme un défaut.
 *
 * ⚠️ **Onze et non douze**, pour que la grille tombe juste : quatre colonnes sur trois
 * rangées, le « + » occupant le coin haut droit comme sur la référence. À douze, la
 * dernière rangée ne portait qu'une pastille esseulée. C'est « Émeraude » qui est partie
 * — elle doublait presque « Menthe », donc c'est le choix qui coûtait le moins.
 */
export const COULEURS_AVATAR: { nom: string; hex: string }[] = [
  { nom: "Indigo", hex: "#6366F1" },
  { nom: "Violet", hex: "#8B5CF6" },
  { nom: "Fuchsia", hex: "#D946A6" },
  { nom: "Corail", hex: "#F43F5E" },
  { nom: "Ambre", hex: "#F59E0B" },
  { nom: "Citron", hex: "#D8E63C" },
  { nom: "Menthe", hex: "#10B981" },
  { nom: "Cyan", hex: "#22D3EE" },
  { nom: "Azur", hex: "#3B82F6" },
  { nom: "Ardoise", hex: "#64748B" },
  { nom: "Encre", hex: "#1E2233" },
];

/** La couleur par défaut, celle du prototype. */
export const COULEUR_PAR_DEFAUT = COULEURS_AVATAR[0].hex;

/** La clé sous laquelle le choix survit au rechargement. */
export const CLE_COULEUR = "novac-avatar-couleur";

/** Une valeur lue au stockage n'est pas forcément une couleur. */
export function estCouleurValide(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9A-Fa-f]{6}$/.test(v);
}
