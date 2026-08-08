/**
 * L'analyse d'un portefeuille, telle que la rend `/portfolios/{id}/analysis`.
 *
 * ⚠️ **Une seule définition du score dans toute l'application.** Le bandeau du
 * tableau de bord calculait autrefois sa propre note, à quatre critères, et
 * l'onglet Analyse affichait celle-ci : deux chiffres pour un même portefeuille,
 * dans deux onglets. Sur un PEA à 69/20/10, l'un annonçait 0 de « risque » et 70
 * de diversification quand l'autre mesurait 1,87 ligne équivalente, soit 12.
 *
 * Le score local avait trois défauts que celui-ci n'a pas :
 *
 * — Son « risque » valait `100 − poids des trois premières lignes`, donc **zéro
 *   pour tout portefeuille de trois lignes ou moins**, par construction. Il pesait
 *   30 % de la note.
 * — Ses quatre axes n'en faisaient que deux : diversification et risque
 *   mesuraient la même concentration, momentum et « qualité » la même variation à
 *   trois mois. Un score à quatre critères avec deux entrées.
 * — Une donnée manquante comptait comme une mauvaise nouvelle : une ligne sans
 *   historique baissait la « qualité ». Ici les facteurs non mesurés sont ignorés,
 *   pas comptés zéro.
 *
 * Le plafond structurel achevait de le disqualifier : trois lignes ne pouvaient
 * pas dépasser 70 sur 100, quelle que soit leur qualité, et il fallait cinq
 * lignes pour seulement pouvoir atteindre « Excellent ».
 */

import type { NovacScore } from "@/lib/portfolio-score/types";

export type Part = { libelle: string; part: number };
export type Observation = { ton: string; titre: string; detail: string };
export type Trajet = { jour: number; p10: number; median: number; p90: number };
export type Projection = {
  median: number | null; p10: number | null; p90: number | null; trajectoire: Trajet[];
};

/**
 * Le profil de risque déclaré, et les cibles qui en découlent.
 *
 * ⚠️ C'est lui qui rend le risque **notable**. Sans profil, la volatilité est
 * mesurée et montrée mais ne note pas : juger un niveau de risque dans l'absolu
 * revient à décréter le projet de l'épargnant. Avec un profil, la question devient
 * vérifiable — le portefeuille tient-il ce qui a été déclaré ?
 *
 * La cible de perte reste calculée sans servir de note : elle situe la perte
 * maximale affichée, « 6,4 %, pour 30 % attendus au pire ».
 */
export type Profil = {
  part_actions: number;
  volatilite: number;
  perte: number;
  horizon_annees: number;
  tolerance: Tolerance;
};

export type Tolerance = "prudent" | "equilibre" | "dynamique";

export const TOLERANCES: { valeur: Tolerance; libelle: string; detail: string }[] = [
  { valeur: "prudent", libelle: "Prudent",
    detail: "Je vends si mon portefeuille perd beaucoup. 35 % d'actions au plus." },
  { valeur: "equilibre", libelle: "Équilibré",
    detail: "J'accepte des creux marqués sans y toucher. 65 % d'actions au plus." },
  { valeur: "dynamique", libelle: "Dynamique",
    detail: "Une baisse de moitié ne me ferait pas vendre. Jusqu'à 100 % d'actions." },
];

export type Analyse = {
  /**
   * La note globale, dupliquée à la racine pour ne rien casser dans l'interface.
   *
   * ⚠️ Elle vient du moteur à cinq piliers — `novac.score` — et non plus d'une
   * moyenne plate de facteurs. La clé est conservée parce que le bandeau, l'anneau et
   * quatre blocs d'en-tête la lisent, et qu'une seule source la produit.
   */
  score: number | null;
  /** Le NOVAC Portfolio Score complet : piliers, confiance, insights, version. */
  novac?: NovacScore;
  /** Le profil déclaré, ou `null` s'il ne l'est pas. */
  profil?: Profil | null;
  bande: string | null;
  expositions: Record<string, Part[]>;
  observations: Observation[];
  poids: { ticker: string; part: number }[];
  projection: Projection;
  /**
   * D'où viennent les poids analysés.
   *
   * `transactions` quand les positions sont valorisées, `poids` pour un
   * portefeuille défini par sa composition déclarée — auquel cas la liquidité
   * manque, faute de quantités détenues — et `aucune` quand il n'y a rien à
   * mesurer.
   */
  source: "transactions" | "poids" | "aucune" | "incomplet" | string;
  /**
   * Les lignes détenues dont le cours n'a pas pu être lu.
   *
   * ⚠️ Non vide, l'analyse est **refusée** plutôt que calculée sur les lignes
   * restantes. Sans ce refus, une ligne sans cours sortait du calcul des poids et
   * les autres étaient renormalisées à cent : observé sur un vrai PEA, la ligne à
   * 70 % avait disparu et la ventilation annonçait « Europe 67 % » au lieu de
   * « États-Unis 70 % », avec un score d'apparence normale.
   */
  sans_cours?: string[];
  /**
   * Les frais courants par ligne, avec leur provenance.
   *
   * ⚠️ Le facteur `frais` ne rend que la moyenne pondérée, ce qui ne suffit pas au
   * panneau de saisie : sans le détail, il montrait un champ vide même pour un fonds
   * dont le TER est connu, et demandait de retaper une donnée déjà là.
   *
   * `source` change ce que l'écran doit dire. « fournisseur » se corrige si
   * l'épargnant sait mieux — le TER dépend de la part détenue, et la source n'en
   * donne qu'une par ticker. « saisi » se modifie. `null` se remplit.
   */
  frais_lignes?: Record<string, { valeur: number | null; source: "saisi" | "fournisseur" | null }>;
};

/** L'état du chargement, partagé par le bandeau et l'onglet. */
export type EtatAnalyse = "charge" | "prêt" | "vide";
