/**
 * Le partage de la place dans la liste des échéances.
 *
 * ⚠️ Ce fichier existe à cause d'une conséquence mesurée. Le calendrier macro
 * automatique a fait passer les échéances macroéconomiques de 3 à 17 sur les cinq
 * prochaines semaines d'un vrai PEA — Pays-Bas, Singapour, Corée, Royaume-Uni,
 * Taïwan, Hong Kong, zone euro. Onze d'entre elles tombent **avant** la première
 * publication de résultats du portefeuille. Une liste de six lignes triée par date
 * n'aurait donc plus montré une seule ligne propre au portefeuille : la macro,
 * ajoutée pour enrichir l'écran, l'aurait vidé de son sujet.
 *
 * Le remède n'est pas de cacher la macro — elle reste entière sous son propre filtre
 * et dans le calendrier — mais de lui réserver une part de la vue d'ensemble.
 */

/** Ce dont cette limitation a besoin, et rien de plus. */
type Echeance = { nature: string; date: string };

/**
 * Combien d'échéances macro au plus dans la vue « Tous ».
 *
 * Deux, et non zéro : le prochain rendez-vous macroéconomique fait partie de ce
 * qu'on veut voir en arrivant. Et non six : la vue d'ensemble répond d'abord
 * « qu'est-ce qui attend **mon** portefeuille ».
 */
export const MACRO_DANS_TOUS = 2;

/**
 * Limite la part des échéances macro, en conservant l'ordre reçu.
 *
 * ⚠️ Les plus **proches** sont gardées, ce qui suppose la liste déjà triée par date —
 * c'est le cas de tout ce qui sort du serveur. Garder les dernières aurait annoncé la
 * réunion de décembre 2027 en cachant celle de la semaine prochaine.
 *
 * ⚠️ Rien n'est supprimé : la fonction ne s'applique qu'à la vue d'ensemble. Le filtre
 * « Économique » et le calendrier reçoivent la liste entière, sans quoi la limitation
 * deviendrait une perte de données au lieu d'un arbitrage d'affichage.
 */
export function limiterMacro<T extends Echeance>(
  evts: T[], maxMacro: number = MACRO_DANS_TOUS,
): T[] {
  let vues = 0;
  return evts.filter(e => {
    if (e.nature !== "economique") return true;
    vues += 1;
    return vues <= maxMacro;
  });
}

/**
 * Combien d'échéances macro la limitation a écartées.
 *
 * Sert à le dire à l'écran. Une liste qui tronque sans l'avouer se lit comme une
 * liste complète, et le lecteur conclut à tort que rien d'autre n'est prévu — le même
 * défaut que le « + 2 » sans explication des pastilles du graphique.
 */
export function macroEcartees<T extends Echeance>(
  evts: T[], maxMacro: number = MACRO_DANS_TOUS,
): number {
  const total = evts.filter(e => e.nature === "economique").length;
  return Math.max(0, total - maxMacro);
}
