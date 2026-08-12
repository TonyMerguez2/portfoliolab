import { contraste, hexVersRvb, rvbVersHex, rvbVersTsl, tslVersRvb } from "./couleur";

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
