/**
 * L'identité de la série affichée par le graphique de performance.
 *
 * Extrait de PerformanceChart pour être testable sans navigateur ni canevas,
 * comme le reste de `src/lib/chart`. La règle tient en trois lignes, mais elle
 * a produit deux défauts opposés, et c'est ce qui justifie de la figer ici.
 */

/** Ce dont dépend la série téléchargée, hors cours. */
export interface SourceSerie {
  /** La fenêtre demandée : « 1d », « max »… */
  periode: string;
  /** L'identifiant du portefeuille, en mode suivi par transactions. */
  portfolioId?: string;
  /** Les tickers, dans l'ordre où ils sont affichés. */
  tickers: string[];
  /** Le portefeuille est-il suivi par transactions ? */
  surTransactions?: boolean;
}

/**
 * La clé qui distingue deux séries à ne pas confondre à l'écran.
 *
 * ⚠️ **La période ne suffit pas.** PerformanceChart n'est jamais remonté — la
 * page ne lui donne pas de `key` — si bien qu'en changeant de portefeuille sans
 * changer de période, la série précédente restait affichée, avec son axe, sous
 * le nom et le total du nouveau. Mesuré sur des données réelles : un
 * portefeuille de crypto allant de 119 807 à 123 272 € laissait son axe gradué
 * de 118 000 à 124 000 € devant un PEA de 5 304 €.
 *
 * ⚠️ **Les poids n'en font pas partie, et c'est volontaire.** Ils dérivent des
 * cours sur un portefeuille suivi par transactions, donc ils changent toutes
 * les dix secondes : les inclure blanchirait le graphique à chaque
 * rafraîchissement. Deux portefeuilles de mêmes tickers à poids différents ne
 * sont donc pas distingués — un angle mort assumé, qui ne concerne pas le mode
 * suivi par transactions, celui des vrais portefeuilles, où l'identifiant
 * tranche.
 */
export function cleSource(s: SourceSerie): string {
  const identite = s.surTransactions && s.portfolioId
    ? s.portfolioId
    : s.tickers.join(",");
  return `${s.periode}|${identite}`;
}

/**
 * Faut-il jeter la série affichée ?
 *
 * Oui dès que la clé change : mieux vaut un cadre vide sous un voile
 * « Chargement… » qu'une courbe qui ne correspond pas à ce qui est annoncé.
 */
export function serieAJeter(avant: SourceSerie, apres: SourceSerie): boolean {
  return cleSource(avant) !== cleSource(apres);
}
