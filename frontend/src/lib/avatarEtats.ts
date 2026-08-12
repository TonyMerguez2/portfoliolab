/**
 * Le répertoire d'états du visage — V1.
 *
 * ⚠️ **Ce n'est pas une liste d'animations, c'est une machine à états**, et la nuance
 * décide de toute la structure. Une animation se joue ; un état **dure** tant que la
 * situation dure. « Focus » tient pendant tout le calcul, « Préoccupé » tant que le
 * risque est affiché — alors qu'« Erreur » se joue une fois et rend la main. Confondre
 * les deux donnerait soit des mimiques qui s'arrêtent en pleine analyse, soit une tête
 * qui reste fâchée après un simple refus.
 *
 * ⚠️ **Rien n'est déclenché ici.** Ce module décrit *à quoi ressemble* chaque état ;
 * c'est l'application qui dit quand — survol prolongé, calcul en cours, seuil atteint.
 * Cette séparation est la seule façon de garder le visage réutilisable ailleurs que sur
 * la page de démonstration : la colonne « quand » du répertoire est portée ici comme
 * une **documentation**, pas comme du code.
 *
 * ⚠️ **Chaque état est une pose, pas une suite d'images.** On y va en amortissant depuis
 * la pose courante, quelle qu'elle soit : passer de « Somnolent » à « Surpris » n'a pas
 * demandé d'écrire cette transition-là. Les quelques états qui ont un mouvement propre —
 * le « non » de l'erreur, le va-et-vient de l'observation — le déclarent à part, en
 * fonction du temps écoulé.
 */

/** Tout ce qu'un état peut régler. Les valeurs neutres valent 1 ou 0. */
export type Pose = {
  /** Multiplicateurs de la forme des yeux. */
  largeur: number;
  hauteur: number;
  ecart: number;
  /** Cambrure : positive pour l'œil arqué « ⌒ ». */
  courbure: number;
  /** Inclinaison ajoutée, en degrés. Positive = les hauts vers l'intérieur. */
  inclinaison: number;
  /** Décalages d'orientation, en degrés. */
  lacet: number;
  tangage: number;
  roulis: number;
  /** Fermeture de fond des paupières, 0 à 1. */
  fermeture: number;
  /** Écart de fermeture entre les deux yeux — le sourcil levé du sceptique. */
  asymetrie: number;
  /** Échelle de la tête : le squash et le recul. */
  echelleX: number;
  echelleY: number;
  /** Multiplicateurs de la dérive au repos et du suivi du curseur. */
  derive: number;
  suivi: number;
};

export const POSE_NEUTRE: Pose = {
  largeur: 1, hauteur: 1, ecart: 1, courbure: 0, inclinaison: 0,
  lacet: 0, tangage: 0, roulis: 0,
  fermeture: 0, asymetrie: 0,
  echelleX: 1, echelleY: 1,
  derive: 1, suivi: 1,
};

export type Etat = {
  cle: string;
  libelle: string;
  /** La situation qui doit l'appeler, côté application. Documentation. */
  quand: string;
  /**
   * `soutenu` dure jusqu'au prochain état ; `ponctuel` se joue puis rend la main à
   * l'état de fond. C'est la distinction qui fait la machine à états.
   */
  nature: "soutenu" | "ponctuel";
  /** Pour un ponctuel : sa durée totale, en millisecondes. */
  duree?: number;
  /** Constante de temps de l'entrée dans l'état. Court = brusque, long = fondu. */
  amorti?: number;
  pose: Partial<Pose>;
  /** Le mouvement propre à l'état, en fonction du temps qui y est passé. */
  anime?: (ecoule: number) => Partial<Pose>;
  /** Multiplicateur de la cadence des clignements. Grand = rare. */
  clignement?: number;
};

/**
 * ⚠️ **Le clignement n'est pas dans cette liste**, et c'est une décision. Il n'exclut
 * aucun état : on cligne en réfléchissant comme en s'étonnant. En faire un état l'aurait
 * rendu incompatible avec tous les autres, alors qu'il se superpose à chacun — et que
 * chaque état n'a qu'à en régler la fréquence.
 */
export const ETATS: Etat[] = [
  {
    cle: "neutre",
    libelle: "Neutre",
    quand: "état normal",
    nature: "soutenu",
    pose: {},
  },
  {
    cle: "curieux",
    libelle: "Curieux",
    quand: "survol prolongé d'une fonction",
    nature: "soutenu",
    // Les yeux se rapprochent : c'est ce resserrement, plus que le regard lui-même,
    // qui donne l'air de s'intéresser à quelque chose de précis.
    pose: { ecart: 0.84, hauteur: 1.06, roulis: 7, lacet: 6, tangage: -3, derive: 0.7 },
    clignement: 1.3,
  },
  {
    cle: "focus",
    libelle: "Focus",
    quand: "analyse ou calcul en cours",
    nature: "soutenu",
    // Le mouvement se réduit plus qu'il ne s'arrête : une tête parfaitement figée se
    // lit comme un écran gelé, pas comme de la concentration.
    pose: { largeur: 0.74, hauteur: 0.92, derive: 0.22, suivi: 0.35 },
    clignement: 2.2,
    anime: e => ({ lacet: 1.6 * Math.sin(e / 900) }),
  },
  {
    cle: "content",
    libelle: "Content",
    quand: "objectif atteint, bonne opération terminée",
    nature: "soutenu",
    // L'œil arqué demande un œil **plus large que haut** : c'est l'aplatissement qui
    // rend la cambrure lisible, pas la cambrure seule.
    pose: { hauteur: 0.19, largeur: 1.45, courbure: 0.62, tangage: -2 },
    clignement: 1.6,
  },
  {
    cle: "tres-content",
    libelle: "Très content",
    quand: "étape importante franchie",
    nature: "ponctuel",
    duree: 1500,
    amorti: 90,
    pose: { hauteur: 0.16, largeur: 1.55, courbure: 0.72, ecart: 1.06 },
    // Le squash vertical, avec son rebond : la tête s'écrase puis repart, deux fois,
    // en s'amortissant. Sans l'amortissement, c'est un ressort de dessin animé.
    anime: e => {
      const r = Math.exp(-e / 420) * Math.sin(e / 105);
      return { echelleY: 1 - 0.11 * r, echelleX: 1 + 0.08 * r, tangage: -4 * r };
    },
  },
  {
    cle: "surpris",
    libelle: "Surpris",
    quand: "variation ou résultat inhabituel",
    nature: "ponctuel",
    duree: 1400,
    amorti: 70,
    // Yeux ronds : largeur et hauteur se rapprochent l'une de l'autre.
    pose: { largeur: 1.55, hauteur: 0.62, ecart: 1.14, tangage: -4 },
    clignement: 3,
    // Le micro-recul : la tête se retire d'un cheveu, très vite, puis revient. C'est le
    // sursaut — il doit être passé avant qu'on ait eu le temps de le lire.
    anime: e => ({ echelleX: 1 - 0.055 * Math.exp(-e / 260), echelleY: 1 - 0.055 * Math.exp(-e / 260) }),
  },
  {
    cle: "preoccupe",
    libelle: "Préoccupé",
    quand: "risque élevé ou incohérence",
    nature: "soutenu",
    pose: { inclinaison: 11, hauteur: 0.82, largeur: 1.05, tangage: 3, derive: 0.6 },
    clignement: 0.8,
  },
  {
    cle: "sceptique",
    libelle: "Sceptique",
    quand: "hypothèse très ambitieuse",
    nature: "soutenu",
    // L'asymétrie fait tout : un œil plus fermé que l'autre, plus une tête qui penche.
    pose: { asymetrie: 0.46, roulis: -8, inclinaison: 5, hauteur: 0.9, derive: 0.7 },
    clignement: 1.4,
  },
  {
    cle: "reflexion",
    libelle: "Réflexion",
    quand: "génération d'un insight",
    nature: "soutenu",
    amorti: 320,
    // Le regard part en haut à droite — la direction que prend un regard qui cherche.
    pose: { lacet: 19, tangage: -14, hauteur: 0.86, derive: 0.5, suivi: 0.15 },
    clignement: 1.8,
    anime: e => ({ lacet: 2.4 * Math.sin(e / 1800), tangage: 1.6 * Math.sin(e / 2400 + 1) }),
  },
  {
    cle: "observation",
    libelle: "Observation",
    quand: "comparaison de deux actifs",
    nature: "soutenu",
    pose: { hauteur: 0.94, derive: 0.35, suivi: 0 },
    clignement: 1.5,
    /**
     * ⚠️ **Une onde carrée adoucie, pas un sinus.** Un regard qui compare deux choses
     * s'**arrête** sur chacune : un aller-retour sinusoïdal passe son temps entre les
     * deux, ce qui donne l'air de balayer et non de comparer. La tangente hyperbolique
     * tient les extrémités et rend le trajet bref.
     */
    anime: e => ({ lacet: 21 * Math.tanh(3.2 * Math.sin(e / 1250)) }),
  },
  {
    cle: "somnolent",
    libelle: "Somnolent",
    quand: "longue inactivité",
    nature: "soutenu",
    amorti: 900,
    pose: {
      fermeture: 0.52, hauteur: 0.8, courbure: 0.12,
      tangage: 6, derive: 0.55, suivi: 0.25,
    },
    // Un clignement rare et la dérive ralentie : c'est le rythme qui dit la somnolence,
    // autant que les paupières.
    clignement: 2.6,
    anime: e => ({ roulis: 3.5 * Math.sin(e / 5200), tangage: 2 * Math.sin(e / 4100) }),
  },
  {
    cle: "reveil",
    libelle: "Réveil",
    quand: "retour de l'utilisateur",
    nature: "ponctuel",
    duree: 1100,
    amorti: 55,
    // L'ouverture dépasse le neutre avant d'y revenir : c'est ce dépassement qui fait
    // lire « il se réveille » plutôt que « il ouvre les yeux ».
    pose: { hauteur: 1.18, largeur: 1.06 },
    anime: e => ({
      tangage: -5 * Math.exp(-e / 300),
      roulis: 4 * Math.exp(-e / 260) * Math.sin(e / 120),
    }),
  },
  {
    cle: "erreur",
    libelle: "Erreur",
    quand: "action impossible",
    nature: "ponctuel",
    duree: 900,
    amorti: 60,
    pose: { hauteur: 0.88, inclinaison: 7 },
    // Le « non » de la tête : trois allers-retours qui s'éteignent. La période courte
    // est ce qui distingue un refus d'un balancement.
    anime: e => ({ lacet: 14 * Math.exp(-e / 280) * Math.sin(e / 62) }),
  },
  {
    cle: "succes",
    libelle: "Succès",
    quand: "sauvegarde ou import réussi",
    nature: "ponctuel",
    duree: 1200,
    amorti: 80,
    pose: { hauteur: 0.21, largeur: 1.42, courbure: 0.6 },
    // Le rebond, dans l'autre sens que le squash du « très content » : la tête part
    // vers le haut au lieu de s'écraser. Deux joies, deux gestes.
    anime: e => {
      const r = Math.exp(-e / 340) * Math.sin(e / 115);
      return { echelleY: 1 + 0.07 * r, tangage: -5 * r };
    },
  },
];

/**
 * L'état qui convient à une variation de cours, en pourcentage.
 *
 * ⚠️ **C'est la traduction qui rend l'avatar utile plutôt que décoratif.** Survoler une
 * ligne ne dit rien en soi ; survoler une ligne *qui a pris neuf pour cent* est une
 * information, et le visage la reprend avant qu'on ait lu le chiffre. Sans cette
 * fonction, tous les survols donneraient « Curieux » et l'avatar ne serait qu'un
 * curseur de plus.
 *
 * ⚠️ **Le seuil de l'inhabituel n'est pas symétrique dans son intention.** Au-dessus de
 * huit pour cent, la surprise convient : c'est un résultat qu'on ne voit pas tous les
 * jours. En dessous de moins huit, la même surprise serait déplacée — une chute forte
 * appelle l'inquiétude, pas l'étonnement. Le répertoire distingue les deux, autant s'en
 * servir.
 */
export function etatSelonVariation(pourcentage: number | null | undefined): string {
  if (typeof pourcentage !== "number" || !isFinite(pourcentage)) return "curieux";
  if (pourcentage >= 8) return "surpris";
  if (pourcentage >= 1) return "content";
  if (pourcentage <= -4) return "preoccupe";
  if (pourcentage <= -1) return "sceptique";
  return "curieux";
}

export function etatParCle(cle: string): Etat {
  for (let i = 0; i < ETATS.length; i++) if (ETATS[i].cle === cle) return ETATS[i];
  return ETATS[0];
}

/** La pose complète d'un état, valeurs neutres comprises. */
export function poseDeLEtat(etat: Etat): Pose {
  return { ...POSE_NEUTRE, ...etat.pose };
}
