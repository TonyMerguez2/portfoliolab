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
export type HistoryPoint = { date: string; value: number };
export type Period = "24h" | "1S" | "1M" | "3M" | "6M" | "1A" | "3A" | "Max";
