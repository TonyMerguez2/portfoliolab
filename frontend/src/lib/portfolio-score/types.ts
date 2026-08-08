/**
 * Les types du NOVAC Portfolio Score, tels que le serveur les rend.
 *
 * ⚠️ **Aucun calcul ici, et c'est délibéré.** Le moteur vit dans
 * `backend/app/services/score/` parce qu'il dépend de données que seul le serveur
 * possède : la transparence sectorielle des fonds, la composition des indices lue
 * chez des ETF physiques, un an de cours quotidiens, et un cache de trente jours.
 *
 * Une seconde définition du score côté client recréerait le défaut retiré de ce
 * projet : le bandeau calculait sa propre note à quatre critères quand l'onglet
 * Analyse affichait celle du serveur. Sur un même PEA, l'un annonçait 0 de « risque »
 * et 70 de diversification quand l'autre mesurait 12. Deux chiffres pour un
 * portefeuille, dans deux onglets.
 *
 * Ce fichier ne porte donc que des types et des aides de **présentation**.
 */

/** Les trois profils. Le même portefeuille peut obtenir trois notes différentes. */
export type Profil = "prudent" | "equilibre" | "dynamique";

/**
 * Le statut d'une mesure.
 *
 * ⚠️ `partiel` n'est pas un aveu de faiblesse : une ventilation sectorielle connue
 * sur 70 % du portefeuille se mesure, à condition de dire qu'il en manque 30. C'est
 * ce statut qui alimente l'indice de confiance.
 */
export type Statut = "disponible" | "partiel" | "indisponible";

/** Une mesure élémentaire, notée sur cent. */
export type Metrique = {
  cle: string;
  libelle: string;
  /**
   * La note sur cent, `null` quand la grandeur n'est pas calculable.
   *
   * ⚠️ Jamais zéro pour une donnée absente. Un zéro se lit comme une mauvaise note,
   * et c'est la règle qui a le plus coûté à établir dans ce projet : une ventilation
   * illisible faisait afficher « diversification 0 » et envoyait corriger une
   * concentration qui n'existait pas.
   */
  score: number | null;
  statut: Statut;
  /** Le poids prévu dans le pilier, avant renormalisation. */
  poids: number;
  /**
   * Le poids réellement appliqué, une fois les métriques absentes écartées.
   *
   * Trois métriques à 40, 30 et 30 %, celle du milieu absente : les deux autres
   * deviennent 57,14 et 42,86 %.
   */
  poids_effectif: number;
  /** La grandeur brute — 5,6 secteurs, 0,20 % par an, 114 actifs. */
  valeur: number | null;
  /** Sa lecture en clair. C'est elle qui rend la note vérifiable. */
  lecture: string;
  /** Ce que la métrique mesure, pour le niveau expert. */
  explication: string;
  /** La part du portefeuille sur laquelle la mesure repose, de 0 à 1. */
  couverture: number;
};

export type Pilier = {
  cle: "diversification" | "risque" | "construction" | "qualite" | "adequation" | string;
  libelle: string;
  score: number | null;
  poids: number;
  poids_effectif: number;
  explication: string;
  metriques: Metrique[];
};

/** Un constat déterministe, calculé et non rédigé par un modèle de langage. */
export type Insight = { ton: "fort" | "attention" | "info"; titre: string; detail: string };

export type NovacScore = {
  score: number | null;
  libelle: string | null;
  profil: Profil | null;
  /**
   * La qualité des **données**, pas celle du portefeuille.
   *
   * ⚠️ Les deux chiffres se lisent côte à côte. « 76, confiance 58 % » dit « ce
   * portefeuille semble correct, mais je connais mal ce qu'il contient » — une
   * information tout autre que « 76, confiance 94 % ». Sans cet indice, une note
   * calculée sur trois métriques ressemble à une note calculée sur dix.
   */
  confiance: number;
  piliers: Pilier[];
  points_forts: Insight[];
  points_attention: Insight[];
  donnees_manquantes: string[];
  calcule_le: string;
  /**
   * La version de méthodologie.
   *
   * ⚠️ Sans elle, deux notes calculées à six mois d'écart seraient incomparables sans
   * qu'on puisse le savoir — et une baisse due à un changement de méthode passerait
   * pour une dégradation du portefeuille.
   */
  version_methodologie: string;
};

/**
 * Les six bandes qualitatives.
 *
 * ⚠️ Pas six tranches égales, et c'est mesuré. Avec des seuils réguliers de vingt
 * points, quatre portefeuilles types sur huit tombaient dans la bande haute — du
 * portefeuille de marché jusqu'à un PEA sans exposition aux émergents — et la bande
 * basse restait vide. Les bandes se resserrent donc en haut.
 *
 * ⚠️ « Exceptionnel » est écarté du vocabulaire : le mot suggérerait une
 * recommandation ou une garantie, ce qu'un score de construction n'est pas.
 *
 * ⚠️ Recopiées de `config.BANDES` côté serveur, qui produit le libellé affiché. Ces
 * seuils ne servent qu'à choisir une encre : une divergence colorerait un « Bon » du
 * vert d'un « Excellent » sans changer le mot. Un test de chaque côté les fixe.
 */
export const BANDES: { min: number; nom: string }[] = [
  { min: 90, nom: "Excellent" },
  { min: 80, nom: "Très bon" },
  { min: 70, nom: "Bon" },
  { min: 60, nom: "Correct" },
  { min: 40, nom: "À améliorer" },
  { min: 0,  nom: "Fragile" },
];

/** Le libellé d'un score, identique à celui que rend le serveur. */
export function bandeDuScore(score: number): string {
  return (BANDES.find(b => score >= b.min) ?? BANDES[BANDES.length - 1]).nom;
}

/** L'intitulé lisible d'un profil. */
export const LIBELLE_PROFIL: Record<string, string> = {
  prudent: "Prudent",
  equilibre: "Équilibré",
  dynamique: "Dynamique",
};

/**
 * Le pilier le plus faible, pour nommer la cause d'une note.
 *
 * Un score sans motif se subit au lieu de se corriger. Les piliers non mesurés sont
 * écartés : ils ne coûtent aucun point, puisqu'ils ne comptent pas dans la moyenne.
 */
export function pilierLePlusFaible(piliers: Pilier[] | undefined): Pilier | null {
  if (!piliers) return null;
  let pire: Pilier | null = null;
  for (const p of piliers) {
    if (p.score == null || p.poids_effectif <= 0) continue;
    if (!pire || p.score < pire.score!) pire = p;
  }
  return pire;
}
