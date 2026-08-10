/**
 * Ce qu'une échéance à venir peut déplacer dans le portefeuille.
 *
 * Pur et testable : la formule tient en une multiplication, mais les deux règles
 * qui l'encadrent — quel événement en porte un, et pourquoi le chiffre est un
 * intervalle — décident de ce que le lecteur comprend.
 */

/** Les statistiques d'un titre, telles que le serveur les rend. */
export interface StatistiquesTitre {
  /** Part du titre dans le portefeuille, en pourcentage. */
  exposition: number;
  /** Amplitude moyenne de la réaction du titre, en pourcentage absolu. */
  impact_moyen: number;
  probabilite: number;
  seuil: number;
  echantillon: number;
}

/**
 * L'amplitude attendue sur le portefeuille, en pourcentage.
 *
 * ⚠️ **C'est un intervalle, pas une prévision.** La statistique porte sur la
 * valeur absolue des réactions passées : elle dit « ce titre bouge de neuf pour
 * cent le lendemain », pas dans quel sens. Multipliée par l'exposition, elle
 * donne de combien le portefeuille peut bouger — vers le haut comme vers le bas.
 * L'afficher signé aurait promis une direction que rien ne soutient : mesuré sur
 * TSLA, la société a battu le consensus de dix-sept pour cent et le titre a
 * baissé de trois et demi.
 *
 * Un titre qui pèse cinquante pour cent et bouge de neuf déplace le portefeuille
 * de quatre et demi.
 */
export function amplitudeAttendue(st: StatistiquesTitre): number {
  return (st.impact_moyen * st.exposition) / 100;
}

/**
 * Une échéance porte-t-elle un impact attendu ?
 *
 * ⚠️ **Les résultats, oui ; un détachement de dividende, non** — et ce n'est pas
 * un oubli. Le jour du détachement, le cours perd mécaniquement le montant du
 * dividende, mais cette valeur n'est pas perdue : elle passe du cours à vos
 * liquidités. Annoncer « −0,19 % attendu » sur un dividende ferait lire une perte
 * là où il n'y a qu'un transfert, et pousserait à s'en inquiéter.
 *
 * Une publication économique n'en porte pas non plus : son effet passe par le
 * marché entier et non par une ligne, donc l'exposition d'un titre ne le mesure
 * pas.
 */
export function porteUnImpact(nature: string): boolean {
  return nature === "resultats";
}

/** Le libellé de l'amplitude, prêt à afficher. */
export function libelleAmplitude(st: StatistiquesTitre): string {
  return `±${amplitudeAttendue(st).toFixed(2)} %`;
}
