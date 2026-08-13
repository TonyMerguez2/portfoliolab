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
 * La teinte d'un reflet sur une carte : sa couleur, montée vers la lumière.
 *
 * ⚠️ **Un reflet blanc trahit le placage.** Du verre teinté ne renvoie pas de la lumière
 * blanche : il la colore au passage. Comparé à l'image sur quatre couleurs de carte, un
 * reflet blanc lave la teinte — sur le corail il vire au gris, sur le citron il délave —
 * alors qu'un reflet monté de trente-cinq pour cent vers le blanc reste franchement de la
 * couleur de la carte tout en se lisant comme une lumière. Au-delà, vers soixante, il
 * redevient blanc et l'on perd ce qu'on cherchait.
 *
 * ⚠️ **Rendue en triplet séparé d'espaces, pas en hexadécimal.** Le dégradé décline la
 * même teinte à quatre opacités ; la syntaxe `rgb(var(--t) / α)` permet de n'écrire la
 * couleur qu'une fois, là où un hexadécimal obligerait à en fabriquer quatre.
 */
export function refletCarte(fond: string, part: number = 0.35): string {
  const [r, v, b] = hexVersRvb(fond);
  const m = (x: number) => Math.round(x + (255 - x) * part);
  return `${m(r)} ${m(v)} ${m(b)}`;
}

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

/**
 * Le contraste que la parole doit atteindre face à son fond.
 *
 * ⚠️ **Trois pour un, et ce chiffre engage la typographie.** C'est le seuil des grands
 * caractères — quatorze points en gras, soit 18,7 pixels. Il ne vaut donc que parce que la
 * parole est posée en gras 800 à dix-neuf pixels au minimum, y compris dans son registre
 * compact. Descendre la taille sans remonter ce seuil rendrait la règle fausse en silence.
 *
 * ⚠️ **Choisi pour ce qu'il **ne** corrige pas.** Mesuré sur les onze teintes : à trois,
 * `tonFranc` n'en retouche **aucune** sur un fond sombre — les sept que la normalisation du
 * thème laisse déjà intactes gardent donc la couleur exacte du personnage, là où il vit le
 * plus souvent — et quatre seulement sont corrigées sur une carte blanche, les claires.
 * À quatre et demi, l'indigo lui-même se serait décalé, et l'on aurait perdu la propriété qui
 * fait tenir tout le dispositif : que le mot soit *sa* couleur.
 */
const CONTRASTE_PAROLE = 3;

/**
 * Le ton **franc** d'une parole : la couleur du personnage, corrigée juste assez pour se lire.
 *
 * ⚠️ **La correction du thème ne suffisait pas, et c'est une mesure qui l'a montré.**
 * `pourFond` ramène une teinte dans une plage jugée lisible, mais ne vise aucun contraste :
 * sur une carte blanche, le pire des onze avatars tombait à **1,87** — un mot qu'on devine.
 * Ici l'on ne suppose plus, on mesure et l'on s'éloigne du fond jusqu'à atteindre le seuil.
 *
 * ⚠️ **Le sens de la correction se déduit du fond, pas du thème.** Un jeton de thème peut
 * mentir — une carte « claire » très saturée, un fond sombre presque gris. Comparer le noir
 * et le blanc face au fond répond exactement à la question posée : de quel côté y a-t-il de
 * la place ?
 */
export function tonFranc(couleur: string, fond: string): string {
  if (contraste(couleur, fond) >= CONTRASTE_PAROLE) return couleur;
  const [teinte, saturation, clarte] = rvbVersTsl(hexVersRvb(couleur));
  const sens = contraste("#000000", fond) > contraste("#FFFFFF", fond) ? -1 : 1;
  let franc = couleur;
  for (let i = 1; i <= 120; i++) {
    const l = Math.max(0, Math.min(1, clarte + sens * i * 0.006));
    franc = rvbVersHex(tslVersRvb([teinte, saturation, l]));
    if (contraste(franc, fond) >= CONTRASTE_PAROLE || l === 0 || l === 1) break;
  }
  return franc;
}

/**
 * L'écart de clarté visé entre les deux tons d'une parole, en points de `L*`.
 *
 * ⚠️ **Onze points, parce que c'est ce que la plupart des couleurs peuvent donner.** Mesuré
 * sur les onze teintes : à cette cible, huit d'entre elles atteignent entre 8 et 15 points,
 * ce qui sépare franchement l'amorce de l'appui. Viser plus haut ne change rien — le
 * plancher de lisibilité arrête la descente bien avant, et les valeurs mesurées à 8, 11 et
 * 14 sont identiques. Viser moins bas rendrait la hiérarchie invisible sur les teintes qui,
 * elles, ont de la marge.
 */
const ECART_PAROLE = 11;

/**
 * Le contraste minimal auquel on s'arrête, face au fond.
 *
 * ⚠️ **Trois pour un, parce que c'est du gros texte gras et rien d'autre.** C'est le seuil
 * des grandes tailles, et il ne vaut ici que parce que la parole est posée en vingt gras au
 * minimum. Le même ton dans une mention courante serait sous-dimensionné.
 */
const PLANCHER_PAROLE = 3.2;

/**
 * Le ton **retenu** d'une parole : la couleur du personnage, en sourdine.
 *
 * ⚠️ **Ni blanc, ni gris — la même teinte, moins présente.** La maquette posait le mot
 * d'amorce en blanc ; refusé à l'usage, et à raison : un blanc n'appartient à personne, et
 * c'est justement la couleur qui rattache la parole au personnage. On garde donc la teinte
 * et l'on retire de la présence, par deux leviers à la fois.
 *
 * ⚠️ **Deux leviers, parce qu'aucun ne suffit seul.** Mélangé vers le fond, le ton perd sa
 * lisibilité avant d'avoir perdu sa vivacité : mesuré, à trente pour cent de mélange, la
 * pire des onze teintes tombe déjà à 2,29 de contraste. Désaturé seul, il **remonte** en
 * clarté sur certaines teintes — HSL n'est pas perceptuel — et l'amorce se retrouve plus
 * claire que l'appui, soit l'inverse de la hiérarchie voulue. On coupe donc la saturation de
 * moitié *et* l'on descend en clarté jusqu'à l'écart visé.
 *
 * ⚠️ **La descente s'arrête au plancher, quitte à ne pas atteindre la cible.** Sur l'encre —
 * une tête si sombre que le garde-fou du fond noir la remonte déjà à 3,42 de contraste — il
 * ne reste que 1,4 point d'écart. La hiérarchie repose alors sur la seule taille, ce qui est
 * la bonne dégradation : un ton illisible ne serait pas une nuance, ce serait un trou.
 */
export function tonRetenu(plein: string, fond: string): string {
  const [teinte, saturation, clarte] = rvbVersTsl(hexVersRvb(plein));
  const vise = clartePercue(plein) - ECART_PAROLE;
  let retenu = rvbVersHex(tslVersRvb([teinte, saturation * 0.5, clarte]));
  /**
   * ⚠️ **Le point de départ lui-même peut être sous le plancher, et il l'était.** Désaturer
   * ne change pas que la vivacité : sur une carte blanche, cela **éclaircit** certaines
   * teintes, et le ton retenu tombait à 2,96 — sous son propre plancher — sans que la boucle
   * ne s'en aperçoive, puisqu'elle ne vérifiait que les candidats suivants. On renonce alors
   * à retenir quoi que ce soit : les deux tons se confondent, et la hiérarchie ne tient plus
   * qu'à la taille. C'est la même dégradation que pour une tête trop sombre, et c'est la
   * bonne : une nuance illisible n'est pas une nuance.
   */
  if (contraste(retenu, fond) < PLANCHER_PAROLE) return plein;
  for (let i = 1; i <= 60; i++) {
    const essai = rvbVersHex(tslVersRvb([teinte, saturation * 0.5, Math.max(0, clarte - i * 0.006)]));
    if (contraste(essai, fond) < PLANCHER_PAROLE) break;
    retenu = essai;
    if (clartePercue(essai) <= vise) break;
  }
  return retenu;
}
