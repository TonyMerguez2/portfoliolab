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
};
export type Period = "24h" | "1S" | "1M" | "3M" | "6M" | "1A" | "3A" | "Max";
