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

/** Un facteur mesuré, ou déclaré non mesurable. */
export type Facteur = {
  /** La grandeur brute, `null` si l'historique ne permet pas de la calculer. */
  valeur: number | null;
  /** Sa lecture en clair — « 1,9 ligne équivalente », « 14,2 % par an ». */
  libelle: string;
  /** Sa note sur cent, `null` quand la grandeur manque. */
  score: number | null;
  /**
   * Le facteur pèse-t-il dans la note globale ?
   *
   * ⚠️ Un facteur peut être mesuré sans compter. C'est le cas de la perte
   * maximale, seule survivante de cette catégorie : « votre portefeuille a perdu
   * 6,4 % entre son sommet et son point bas » se comprend sans formation
   * financière, là où une volatilité annualisée demande une traduction. Elle
   * reste donc affichée, mais elle ne note pas — son score suivait celui de la
   * volatilité à 0,88 de corrélation, et compter les deux revenait à peser deux
   * fois la même dispersion.
   *
   * Absente, elle vaut `true` : un facteur ajouté côté serveur compte par défaut
   * plutôt que d'être ignoré en silence.
   */
  compte?: boolean;
};

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

/**
 * Les facteurs qui n'ont de sens que face à un profil.
 *
 * Listés ici parce que l'interface doit pouvoir dire *lesquels* se taisent quand
 * le profil manque : « un facteur attend votre profil » est actionnable, une note
 * silencieusement plus basse ne l'est pas.
 *
 * ⚠️ Ils étaient trois. Le bêta a été supprimé — mesuré sur des rendements
 * quotidiens, il valait 0,54 pour un fonds coté à Paris contre 0,99 pour un fonds
 * américain suivant le **même** indice, et il certifiait donc conforme à une cible
 * de 65 % d'actions un portefeuille investi à cent pour cent. La perte maximale ne
 * note plus : son score corrélait à 0,88 avec celui de la volatilité, les deux
 * étant deux lectures de la même dispersion.
 */
export const FACTEURS_DU_PROFIL = ["volatilite"];

export type Analyse = {
  score: number | null;
  /** Le profil déclaré, ou `null` s'il ne l'est pas. */
  profil?: Profil | null;
  bande: string | null;
  facteurs: Record<string, Facteur>;
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

/**
 * Les cinq bandes du score, **côté client**.
 *
 * ⚠️ Le libellé affiché vient du serveur, qui le calcule avec `analyse.py`. Ces
 * seuils ne servent qu'à ce que le client ne peut pas recevoir : choisir une
 * encre, dessiner un dégradé d'anneau. Ils doivent donc rester alignés sur ceux
 * du serveur, faute de quoi la couleur et le mot se contrediraient en silence.
 *
 * Ils vivent ici plutôt que dans chaque composant parce qu'il en existait **trois**
 * copies divergentes dans l'application, et l'une portait un vocabulaire fantôme :
 * `scoreLabel` disait « Excellent » au-dessus de 80, un mot qui n'apparaît nulle
 * part ailleurs et qui restait de l'ancien score local remplacé.
 *
 * Les seuils ne forment pas cinq tranches égales de vingt points, et c'est mesuré :
 * régulières, elles tassaient les libellés en haut. Quatre portefeuilles types sur
 * huit tombaient en « Très bon » — du portefeuille de marché à 95 jusqu'à un PEA à
 * 84 sans aucune exposition aux marchés émergents — et la bande « Faible » restait
 * vide. « Très bon » veut dire « aucun manque nommable », ce qui commence plus haut.
 */
export const BANDES: { min: number; nom: string }[] = [
  { min: 88, nom: "Très bon" },
  { min: 70, nom: "Bon" },
  { min: 50, nom: "Moyen" },
  { min: 30, nom: "Faible" },
  { min: 0,  nom: "Très faible" },
];

/** Le libellé d'un score, identique à celui que rend le serveur. */
export function bandeDuScore(score: number): string {
  return (BANDES.find(b => score >= b.min) ?? BANDES[BANDES.length - 1]).nom;
}

export const LIBELLE_FACTEUR: Record<string, string> = {
  diversification:     "Diversification",
  geographie:          "Géographie",
  concentration:       "Concentration",
  frais:               "Frais des fonds",
  frais_courtage:      "Frais de courtage",
  redondance:          "Redondance",
  volatilite:          "Volatilité",
  perte_max:           "Perte maximale",
};

/**
 * Ce que chaque facteur mesure, en une phrase.
 *
 * Rédigées à partir des repères réellement codés dans `analyse.py`, et non
 * inventées : la concentration y vise vingt sociétés équivalentes, la
 * diversification huit secteurs. Les infobulles qu'elles remplacent promettaient
 * « vos actifs couvrent plusieurs secteurs » à propos d'un calcul qui ne regardait
 * que des poids.
 *
 * ⚠️ À relire dès qu'un seuil bouge dans `analyse.py`. Une explication périmée
 * est pire qu'absente : elle décrit un calcul qui n'a plus lieu.
 */
export const EXPLICATION_FACTEUR: Record<string, string> = {
  diversification:
    "Mesurée en transparence, sur les secteurs réellement détenus — trois ETF, "
    + "c'est trois lignes mais des centaines de sociétés. Huit secteurs "
    + "équivalents valent cent, un seul vaut zéro.",
  geographie:
    "Votre distance à la répartition du marché mondial, en points de portefeuille : "
    + "combien il faudrait déplacer pour la rejoindre. Le portefeuille de marché est "
    + "par arithmétique le plus diversifié qui existe, donc s'en écarter concentre — "
    + "quel que soit votre profil. Un ETF monde en est proche, un seul pays très loin.",
  concentration:
    "Le risque qu'un actif disparaisse : le nombre d'actifs équipondérés "
    + "auquel équivaut votre portefeuille, en transparence des fonds. Vingt vaut "
    + "cent, une seule vaut zéro. Un ETF monde pèse près de 200 sociétés, un ETF "
    + "sectoriel une vingtaine. Un fonds synthétique ne détient qu'un contrat "
    + "d'échange et n'a aucune composition à publier : la mesure vient alors de "
    + "l'indice qu'il suit, lu chez un fonds physique, et le libellé le dit.",
  volatilite:
    "L'amplitude annualisée des variations, comparée à la cible de votre profil. "
    + "Rester en deçà coûte moins de points que la dépasser : un manque à gagner "
    + "n'est pas un risque de vendre dans la baisse. Sans profil déclaré, elle est "
    + "mesurée sans être notée.",
  frais:
    "Les frais courants de vos fonds (TER), prélevés chaque année sur l'encours. "
    + "Sans objet si vous ne détenez aucun fonds : un titre ou une crypto en direct "
    + "n'en supportent pas, et le facteur sort alors du calcul. "
    + "0,10 % par an vaut cent, 1 % vaut zéro. Souvent indisponibles pour les ETF "
    + "européens : le fournisseur de cours ne les publie pas.",
  frais_courtage:
    "Les commissions que vous avez saisies, rapportées aux montants achetés. Un "
    + "coût ponctuel par ordre, distinct du prélèvement annuel des fonds — les "
    + "mêler donnerait un chiffre sans signification.",
  redondance:
    "La corrélation la plus forte entre deux de vos lignes. Au-delà de 0,95, "
    + "elles font le même pari et l'une des deux n'apporte rien.",
  perte_max:
    "La pire baisse subie, du sommet au point bas. Affichée sans être notée : "
    + "elle dit le risque mieux qu'aucun autre chiffre, mais elle suit la "
    + "volatilité de si près que la noter aussi compterait deux fois la même "
    + "mesure.",
};

/**
 * Ordre d'affichage : ce qui **note** d'abord, ce qui **informe** ensuite.
 *
 * Le lecteur descend ainsi de ce qui explique sa note vers ce qui décrit son
 * portefeuille sans le juger. Les deux groupes se distinguent aussi par la
 * mention « indicatif » et l'absence de couleur.
 *
 * ⚠️ La liste est passée de treize entrées à huit. Sept facteurs ont été retirés
 * après avoir été mesurés sur des portefeuilles types : la devise lisait la place
 * de cotation et non l'exposition — cent contre zéro pour deux enveloppes du même
 * indice —, le bêta était biaisé vers zéro par le décalage des clôtures, la
 * liquidité valait cent partout, le Sharpe était à moitié du bruit de tirage, la
 * corrélation moyenne doublait la redondance, les classes d'actifs doublaient un
 * graphique déjà affiché. Les raisons complètes vivent dans `analyse.py`, au plus
 * près du calcul retiré.
 *
 * La géographie, elle, a été retirée puis **rétablie** avec un calcul entièrement
 * différent : elle comptait des étiquettes de zone — « Monde développé » valait une
 * zone, donc zéro, pour un fonds détenant 23 pays — et mesure désormais l'écart aux
 * poids du marché mondial.
 */
export const ORDRE = [
  // Notants : construction, coût, risque face au profil.
  "diversification", "geographie", "concentration", "frais_courtage", "frais",
  "redondance", "volatilite",
  // Indicatif : le seul niveau conservé, parce qu'il se comprend sans formation.
  "perte_max",
];

/**
 * Combien de facteurs sont réellement mesurés, sur combien d'attendus.
 *
 * ⚠️ À afficher, et pas seulement à connaître. Un score moyenné sur trois
 * facteurs et un score moyenné sur six se ressemblent à l'écran alors qu'ils ne
 * valent pas la même confiance. Le taire présenterait une note partielle comme
 * une note complète.
 */
export function couvertureFacteurs(facteurs: Record<string, Facteur> | undefined): {
  mesures: number; total: number;
} {
  if (!facteurs) return { mesures: 0, total: 0 };
  // ⚠️ Le total ne compte que les facteurs **notants**. Annoncer « 6 sur 6 »
  // quand l'un des six est indicatif laisserait croire qu'il pèse dans la note.
  const notants = ORDRE.filter(k => facteurs[k] && facteurs[k].compte !== false);
  return {
    mesures: notants.filter(k => facteurs[k].score != null).length,
    total: notants.length,
  };
}

/**
 * Le facteur qui coûte le plus de points, pour dire *pourquoi* la note est là.
 *
 * Un score sans motif ne se corrige pas : il se subit. Rendre le facteur le plus
 * faible permet au bandeau de nommer la cause au lieu d'afficher un chiffre nu.
 * Les facteurs non mesurés sont écartés — ils ne coûtent rien, puisqu'ils ne
 * comptent pas dans la moyenne.
 */
export function facteurLePlusFaible(
  facteurs: Record<string, Facteur> | undefined,
): { cle: string; libelle: string; score: number } | null {
  if (!facteurs) return null;
  let pire: { cle: string; libelle: string; score: number } | null = null;
  for (const cle of ORDRE) {
    const f = facteurs[cle];
    // Un facteur indicatif ne coûte aucun point : il ne peut pas être la cause
    // d'une note basse, même s'il est le plus mal noté.
    if (!f || f.score == null || f.compte === false) continue;
    if (!pire || f.score < pire.score) {
      pire = { cle, libelle: LIBELLE_FACTEUR[cle] ?? cle, score: f.score };
    }
  }
  return pire;
}
