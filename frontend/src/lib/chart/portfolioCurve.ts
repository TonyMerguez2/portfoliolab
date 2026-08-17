/**
 * Types de la courbe de portefeuille.
 *
 * Ce module portait aussi `niceBounds` et `axisLabels`, qui calculaient les
 * graduations et les étiquettes d'un tracé SVG fait main. Le graphique est
 * passé sur lightweight-charts, comme la page graphique, et la bibliothèque
 * dessine ses propres axes : ces fonctions ne sont plus appelées nulle part.
 * Leurs douze tests non plus — des tests qui gardent du code mort ne
 * protègent rien et donnent une fausse assurance.
 */
export type HistoryPoint = {
  date: string;
  value: number;
  /**
   * Le capital engagé à cet instant, quand la route le donne.
   *
   * Sert à tracer la courbe nette des versements : sans lui, un renforcement
   * fait dans la valeur un mur de plusieurs centaines d'euros, à côté duquel les
   * mouvements de marché ne se voient plus. Voir `PerformanceChart`.
   */
  invested?: number;
  /**
   * Le patrimoine : les titres **plus** les liquidités déclarées, à cet instant.
   *
   * ⚠️ **Absent quand aucun compte ne déclare de liquidités**, et c'est voulu : la route
   * ne renvoie pas une copie de `value`, si bien que la courbe sait qu'il n'y a rien de
   * plus à montrer plutôt que de tracer deux fois la même chose.
   *
   * ⚠️ **`value` reste la valeur des seuls titres**, et c'est elle que lisent les gains,
   * la variation et la comparaison au repère. L'épargne monte le patrimoine sans être une
   * performance ; les deux champs existent pour que cette distinction survive au trajet.
   */
  patrimoine?: number;
  /**
   * Les liquidités déclarées à cet instant : `patrimoine − value`, mais dit par la route.
   *
   * ⚠️ **Publié plutôt que déduit, parce que la déduction avait un angle mort.** L'écran
   * l'obtenait par soustraction, ce qui donnait zéro quand `patrimoine` manquait — donc
   * « il n'y avait pas d'épargne ce jour-là » là où le sens est « je l'ignore ». Le gain
   * retranchait alors zéro et reprenait la trésorerie entière : « +115,66 % » relevé à
   * l'écran sur un patrimoine dont la moitié dormait sur un livret.
   *
   * ⚠️ **Absentes, comme `patrimoine`, quand aucun compte ne déclare d'espèces.**
   * L'absence se distingue de zéro, et c'est toute la valeur de ce champ.
   */
  liquidites?: number;
};
export type Period = "24h" | "1S" | "1M" | "3M" | "6M" | "1A" | "3A" | "Max";
