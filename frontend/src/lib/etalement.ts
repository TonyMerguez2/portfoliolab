/**
 * L'étalement des cartes à l'ouverture d'un dossier — et leur rassemblement à la fermeture.
 *
 * ⚠️ **Ce n'est pas un morphing, c'est un jeu de cartes qu'on étale.** Mesuré avant
 * d'écrire une ligne : une carte d'aperçu dans un dossier et la même dans la grille font
 * toutes deux 248 × 196 et se trouvent **à la même hauteur** — seule leur abscisse change,
 * d'un empilement de quatorze pixels à une rangée de deux cent cinquante-huit. Il n'y a donc
 * ni taille à interpoler ni fondu entre deux dessins : les cartes glissent, c'est tout.
 *
 * ⚠️ **La grille remplace la rangée dans le DOM.** Ce sont deux rendus distincts, si bien
 * qu'aucune animation CSS ne peut relier l'un à l'autre. On mesure donc les positions de
 * départ **avant** le remplacement, on laisse React poser le nouvel écran, puis on remet
 * chaque carte à sa place d'avant par une translation qu'on ramène ensuite à zéro. Le
 * procédé est connu — mesurer, inverser, jouer.
 *
 * ⚠️ **Le repli est explicite, et c'est le point le plus important du module.** Si la mesure
 * de départ manque, ou si l'appariement échoue, on ne joue rien : l'écran s'affiche
 * instantanément, comme avant. Une animation ratée laisserait des cartes figées hors du
 * cadre par une transformation qu'aucun rendu ne viendrait effacer — bien pire que pas
 * d'animation du tout.
 *
 * ⚠️ Chemins relatifs et non l'alias « @/ » : Vitest tourne sans configuration.
 */

/** Où se trouvait une carte, repérée par son ticker. */
export type Positions = Map<string, { x: number; y: number }>;

/** La durée du glissement, et le décalage entre deux cartes. */
export const ETALEMENT = {
  duree: 420,
  /** Ce qui sépare le départ de deux cartes voisines : l'éventail se lit à ce retard. */
  cascade: 45,
  /**
   * ⚠️ **Une courbe qui part vite et finit doucement.** Les cartes viennent de sous le plan
   * du dossier : si elles démarrent lentement, on croit que l'écran a mis du temps à
   * répondre. L'accélération initiale fait que le geste répond au clic.
   */
  courbe: "cubic-bezier(0.22, 0.68, 0.28, 1)",
};

/** Le mouvement est-il refusé par la personne qui regarde ? */
export function mouvementRefuse(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Relève la position de chaque carte visible sous `racine`.
 *
 * ⚠️ **En coordonnées de fenêtre, et c'est ce qui rend la mesure comparable.** Les deux
 * écrans n'ont pas le même parent : rapportées à leur conteneur, les positions ne se
 * soustrairaient pas. Le défilement de la page entre les deux relevés est négligeable —
 * elles sont prises à quelques millisecondes d'écart, dans le même geste.
 */
export function releverLesCartes(racine: ParentNode | null | undefined): Positions {
  const releve: Positions = new Map();
  if (!racine) return releve;
  racine.querySelectorAll<HTMLElement>("[data-carte]").forEach((el) => {
    const cle = el.dataset.carte;
    if (!cle || releve.has(cle)) return;
    const b = el.getBoundingClientRect();
    if (b.width === 0 && b.height === 0) return;
    releve.set(cle, { x: b.left, y: b.top });
  });
  return releve;
}

/**
 * Le point d'où partent les cartes qui n'avaient pas d'aperçu.
 *
 * ⚠️ **Un dossier ne laisse voir que trois cartes ; il en contient parfois douze.** Les
 * autres n'ont pas de position de départ — les faire apparaître sur place, immobiles,
 * casserait l'éventail en deux moitiés dont l'une ne bouge pas. Elles partent donc du fond
 * de la pile, c'est-à-dire de la carte visible la plus à gauche : elles y étaient.
 */
function fondDeLaPile(depart: Positions): { x: number; y: number } | null {
  let fond: { x: number; y: number } | null = null;
  depart.forEach((p) => { if (!fond || p.x < fond.x) fond = p; });
  return fond;
}

/**
 * Ramène les cartes de leur position d'avant vers celle qu'elles occupent maintenant.
 *
 * Rend le nombre de cartes effectivement animées — zéro quand on s'est abstenu.
 */
export function jouerEtalement(
  depart: Positions,
  racine: ParentNode | null | undefined,
  options: { refuse?: boolean } = {},
): number {
  if (options.refuse ?? mouvementRefuse()) return 0;
  if (depart.size === 0 || !racine) return 0;

  // ⚠️ Les cartes sans surface sont écartées ici aussi : la vue en liste garde sa grille
  // montée mais masquée, et une carte à zéro pixel donnerait un déplacement calculé depuis
  // le coin de la fenêtre.
  const cartes = Array.from(
    racine.querySelectorAll<HTMLElement>("[data-carte]"),
  ).filter((el) => {
    if (typeof el.animate !== "function") return false;
    const b = el.getBoundingClientRect();
    return b.width > 0 || b.height > 0;
  });
  if (cartes.length === 0) return 0;

  const pile = fondDeLaPile(depart);
  let jouees = 0;

  cartes.forEach((el, rang) => {
    const cle = el.dataset.carte;
    if (!cle) return;
    const avant = depart.get(cle) ?? pile;
    if (!avant) return;
    const b = el.getBoundingClientRect();
    const dx = avant.x - b.left;
    const dy = avant.y - b.top;
    // Un déplacement d'un pixel ne se voit pas et ne mérite pas une image de plus.
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

    /**
     * ⚠️ **Celles qui n'avaient pas d'aperçu arrivent en fondu.** Sans cela, une carte
     * jaillirait du fond de la pile à pleine opacité, comme surgie de nulle part — alors
     * que les trois autres, elles, étaient bel et bien visibles avant le clic.
     */
    const connue = depart.has(cle);
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px)`, opacity: connue ? 1 : 0 },
        { transform: "translate(0, 0)", opacity: 1 },
      ],
      {
        duration: ETALEMENT.duree,
        delay: Math.min(rang, 6) * ETALEMENT.cascade,
        easing: ETALEMENT.courbe,
        /**
         * ⚠️ **`backwards`, et c'est la mesure qui l'a imposé.** Écrit d'abord en `none`,
         * une carte retardée restait posée à sa place **définitive** pendant tout son
         * retard, puis sautait en arrière au premier pixel d'animation. Relevé à l'écran :
         * la troisième carte s'affichait à 594 pendant quatre-vingt-dix millisecondes, puis
         * repartait de 324. L'éventail commençait par un clignotement.
         *
         * ⚠️ **`backwards` et non `both`.** Il n'agit qu'*avant* le début : rien ne persiste
         * à la fin. Une transformation qui survivrait à l'animation survivrait aussi au
         * prochain rendu de React, et la carte resterait décalée sans que rien ne l'explique.
         */
        fill: "backwards",
      },
    );
    jouees += 1;
  });

  return jouees;
}
