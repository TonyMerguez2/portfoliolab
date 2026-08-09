/**
 * Où poser les pastilles d'opération sur la courbe.
 *
 * Extrait de PerformanceChart pour être testable sans navigateur ni canevas,
 * comme le reste de `src/lib/chart`. Les deux fonctions d'ici corrigent chacune
 * un défaut visible à l'écran, et c'est ce qui justifie les tests d'à côté.
 */

/** Le point d'un jour : son horodatage dans la série, et son ordonnée tracée. */
export interface Ancre {
  /** L'horodatage en secondes, tel que la série le porte. */
  temps: number;
  /** L'ordonnée, déjà mise à l'échelle du total affiché. */
  valeur: number;
}

/**
 * Le point de chaque jour de la série, indexé par jour.
 *
 * ⚠️ L'horodatage retenu est celui du **point**, jamais minuit. C'est ce qui
 * faisait disparaître toutes les pastilles d'opération sur les fenêtres tracées
 * en barres intraday — un mois en barres de quinze minutes, vingt-quatre heures
 * en barres d'une minute. Le repère était cherché à minuit UTC ; la bibliothèque
 * ne convertit que les horodatages présents dans la série, et aucune barre de
 * séance ne tombe à minuit. Elle ne rendait donc aucune coordonnée, et la
 * pastille était omise sans un mot.
 *
 * Sur une série journalière, l'horodatage *est* minuit : rien ne change.
 *
 * ⚠️ **Le premier point de la journée, pas le dernier.** Une écriture est
 * enregistrée à minuit et prise en compte dès le premier instant qui la suit :
 * la courbe saute donc à la première barre du jour. En retenant la dernière, la
 * pastille se posait à la clôture, soit une journée entière à droite du saut
 * qu'elle prétend désigner — mesuré à 60 px sur la fenêtre d'un mois, où une
 * séance vaut justement 60 px. Le repère annonçait un renforcement après la
 * hausse qu'il avait causée.
 *
 * Cela vaut aussi si une écriture porte un jour une heure réelle : la première
 * barre de la journée est alors la première barre postérieure à l'écriture,
 * c'est-à-dire toujours celle où la courbe bouge.
 */
export function ancresParJour<P extends { date: string }>(
  points: readonly P[],
  ordonnee: (p: P) => number,
): Map<string, Ancre> {
  const m = new Map<string, Ancre>();
  for (const p of points) {
    const jour = p.date.slice(0, 10);
    if (m.has(jour)) continue;
    const temps = Math.floor(new Date(p.date).getTime() / 1000);
    if (!Number.isFinite(temps)) continue;
    m.set(jour, { temps, valeur: ordonnee(p) });
  }
  return m;
}

/**
 * Le plus long report toléré entre une écriture et le point qui la porte.
 *
 * ⚠️ Quatre jours, et ce n'est pas un chiffre rond choisi au hasard : c'est la
 * plus longue fermeture d'une place européenne, le pont de Pâques, du vendredi
 * saint au lundi inclus. En deçà, reporter une écriture au jour coté suivant est
 * fidèle ; au-delà, la pastille ne désigne plus ce qui s'est passé.
 */
export const REPORT_MAX_JOURS = 4;

/** L'écart en jours entre deux dates « AAAA-MM-JJ ». */
function ecartJours(depuis: string, jusqua: string): number {
  return (Date.parse(jusqua) - Date.parse(depuis)) / 86_400_000;
}

/**
 * Le jour de la série où poser une opération, ou `null` si elle n'y a pas sa
 * place.
 *
 * ⚠️ Le discriminant est l'**écart**, pas le côté, et c'est un test qui l'a
 * établi. La première version écartait tout ce qui précédait le premier jour
 * tracé — ce qui jetait une écriture passée le samedi précédant l'ouverture de
 * la fenêtre, alors qu'elle en fait légitimement partie. Or la même recherche
 * doit franchir un samedi et refuser six mois : seule sa longueur les sépare.
 *
 * Le défaut d'origine : la page transmet toutes les transactions du
 * portefeuille, sans filtre de période. Sur la fenêtre de trois mois d'un PEA
 * ouvert en février, chaque écriture antérieure retombait sur le premier jour
 * affiché — une pile de pastilles collée au bord gauche, chacune annonçant sa
 * vraie date sous une position fausse.
 *
 * Le même seuil couvre trois cas d'un coup : l'écriture plus vieille que la
 * fenêtre, celle qui tombe dans une longue suspension de cotation, et celle
 * postérieure au dernier point.
 *
 * `jours` est la liste des jours de la série, dans l'ordre où elle est tracée.
 */
export function jourAncre(jourOp: string, jours: readonly string[]): string | null {
  if (!jours.length) return null;
  // Le premier jour coté à partir de la date de l'opération : une écriture
  // passée un samedi n'a pas de point à elle. Rien après : l'opération est
  // postérieure au dernier point, elle est hors cadre.
  const cible = jours.find(j => j >= jourOp);
  if (cible === undefined) return null;
  return ecartJours(jourOp, cible) > REPORT_MAX_JOURS ? null : cible;
}
