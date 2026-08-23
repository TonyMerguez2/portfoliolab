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
  /**
   * Pliure de l'œil : son milieu se casse en un **angle**, là où la cambrure l'arrondit.
   *
   * ⚠️ **Le chevron n'est pas une forme de plus, c'est le même œil plié.** Voir `cambrer`
   * dans `avatarSpherique` : la parabole `1 − t²` de la cambrure et le toit `1 − |t|` de la
   * pliure ne diffèrent que par un coin en zéro. Les deux s'appliquent **séparément** —
   * plier ne demande pas de cambrer d'abord.
   */
  pliure: number;
  /**
   * Inclinaison des yeux, en degrés.
   *
   * ⚠️ **Le signe dit l'humeur, et il se lit à l'envers de ce qu'on croit.** *Positive*, elle
   * fait **monter** le bout intérieur de chaque œil vers le milieu du visage : `/ \`, l'air
   * peiné, celui qui implore. *Négative*, elle le fait descendre vers le nez : `\ /`, l'air
   * fâché. Relevé sur un œil incliné de 24° : bout intérieur à `y = −9`, bout extérieur à
   * `y = +9` — l'intérieur est bien le plus haut. S'être fié à l'intuition inverse a donné
   * une colère qui se lisait comme un caprice.
   */
  inclinaison: number;
  /** Décalages d'orientation, en degrés. */
  lacet: number;
  tangage: number;
  roulis: number;
  /** Fermeture de fond des paupières, 0 à 1. */
  fermeture: number;
  /** Écart de fermeture entre les deux yeux — le sourcil levé du sceptique. */
  asymetrie: number;
  /**
   * Le passage vers le glyphe d'invite de commande : `>` à gauche, `_` à droite.
   *
   * ⚠️ **Un champ dédié, et non une généralisation « une forme par œil ».** Toutes les
   * autres grandeurs de la pose valent pour les deux yeux à la fois ; seule la *fermeture*
   * se dissocie, par `asymetrie`. Ouvrir la forme entière au traitement par côté aurait
   * doublé la surface de la pose — largeur, hauteur, courbure, inclinaison, chacune en
   * deux exemplaires — pour un seul état qui s'en serve. Le jour où un second en aura
   * besoin, ce sera le moment de généraliser, pas avant.
   *
   * ⚠️ **Un nombre et non un drapeau** : il se mélange comme le reste, donc l'entrée dans
   * le glyphe et la sortie s'amortissent d'elles-mêmes. Un booléen aurait fait paraître le
   * chevron d'un coup, au milieu d'un visage qui, lui, fond.
   */
  invite: number;
  /**
   * L'émerveillement peint dans l'œil : un éclat à quatre branches et une bulle.
   *
   * ⚠️ **Un nombre, pas un drapeau** — comme `invite`, et pour la même raison : les détails
   * grandissent depuis rien au lieu d'apparaître d'un coup au milieu d'un visage qui, lui,
   * fond. Zéro les retire complètement, ce qui laisse l'œil plein.
   */
  emerveille: number;
  /** Échelle de la tête : le squash et le recul. */
  echelleX: number;
  echelleY: number;
  /** Multiplicateurs de la dérive au repos et du suivi du curseur. */
  derive: number;
  suivi: number;
};

export const POSE_NEUTRE: Pose = {
  largeur: 1, hauteur: 1, ecart: 1, courbure: 0, pliure: 0, inclinaison: 0,
  lacet: 0, tangage: 0, roulis: 0,
  fermeture: 0, asymetrie: 0, invite: 0, emerveille: 0,
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
  /**
   * La pose visée.
   *
   * ⚠️ **Elle peut dépendre du tirage d'entrée, et c'est le seul endroit où un choix
   * aléatoire a sa place.** `anime` s'ajoute brut à la pose lissée et disparaît brut quand
   * l'état se termine : un décalage **constant** posé là fait donc sauter le visage en
   * sortant — mesuré à quinze degrés de lacet en une image, et attrapé par l'essai « passe
   * d'un état à l'autre sans à-coup ». Ce que `anime` sait porter, ce sont les mouvements
   * qui repassent par zéro. Un choix tenu, lui, appartient à la pose, qui est amortie à
   * l'aller comme au retour.
   */
  pose: Partial<Pose> | ((tirage: number) => Partial<Pose>);
  /**
   * Le mouvement propre à l'état, en fonction du temps qui y est passé.
   *
   * ⚠️ **`tirage` est constant pendant tout l'état, et c'est ce qui le rend utile.** Il est
   * pris une fois, à l'instant où l'état commence, et vaut la même chose jusqu'à ce qu'on
   * en change. C'est ce qu'il faut pour un choix qu'on fait **en entrant** — de quel côté
   * l'avatar s'endort — et non pour une variation continue, qui se décrit avec `ecoule`.
   * Un `Math.random()` appelé ici aurait retiré un nombre à chaque image, donc soixante
   * fois par seconde : le regard aurait sauté partout au lieu de se poser.
   */
  anime?: (ecoule: number, tirage: number) => Partial<Pose>;
  /** Multiplicateur de la cadence des clignements. Grand = rare. */
  clignement?: number;
  /**
   * Combien l'état tolère de gestes spontanés par-dessus lui. 0 les interdit.
   *
   * ⚠️ Tous n'en veulent pas autant : « Focus » réduit le mouvement par définition, et
   * un dormeur qui jette des coups d'œil ne dort pas. Le neutre, lui, en a besoin —
   * c'est là que le visage passe le plus clair de son temps, et c'est là qu'un avatar
   * immobile se met à ressembler à une icône.
   */
  spontaneite?: number;
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
    quand: "survol d'une zone, lecture d'un panneau, valeur sans relief",
    nature: "soutenu",
    /**
     * ⚠️ **C'est devenu l'état le plus porté du répertoire, il ne peut plus ressembler au
     * neutre.** Il a absorbé « content », « réflexion » et « observation » lors de la
     * réduction : cinq zones de l'application le posent, et toute valeur sans relief y
     * retombe. Sa version d'origine ne s'écartait du repos que par sept degrés de roulis et
     * un resserrement de seize pour cent — assez pour être *juste*, pas pour être *lu*.
     * Signalé à l'usage : « ça ressemble beaucoup à l'expression neutre ».
     *
     * ⚠️ **Quatre signaux qui vont dans le même sens, plutôt qu'un seul appuyé.** Une tête
     * franchement penchée suffirait à dire la curiosité, mais à quatorze degrés elle se lit
     * comme un tic ; c'est en faisant converger plusieurs indices faibles qu'on obtient une
     * mimique évidente sans qu'aucun réglage ne paraisse forcé :
     *
     * 1. **La tête penche** (roulis 11) — le signal le plus universel de la curiosité, chez
     *    l'animal comme dans le dessin.
     * 2. **Les yeux s'écartent et se ramassent** — 22 unités d'écart contre 18 au repos, et
     *    23 sur 40 au lieu de 19 sur 66. La première version les **resserrait**, au motif
     *    qu'un regard qui converge vise un point précis ; à l'écran, deux yeux rapprochés
     *    sur une tête penchée se lisent comme un plissement méfiant, pas comme de l'intérêt.
     *    Écartés et raccourcis, ils quittent la fente verticale du repos pour une forme plus
     *    ronde — et c'est cette ouverture qui dit la curiosité.
     * 3. **Ils s'inclinent vers l'intérieur** (inclinaison 8) — le sourcil froncé de qui
     *    examine, obtenu sans dessiner de sourcil.
     * 4. **Le menton se lève** (tangage −5) : on regarde vers ce qui intrigue.
     *
     * ⚠️ **Aucune asymétrie ici, et c'est délibéré.** Une première version en posait un peu
     * — l'œil mi-clos du « hm ? » — et elle rapprochait trop les deux états : l'asymétrie
     * est la **signature** du sceptique, qui ne dispose que d'elle pour se distinguer.
     * Signalé à l'usage. Ce qui sépare désormais les deux ne demande aucune finesse de
     * lecture : le curieux **penche la tête d'un côté et ouvre grand**, le sceptique
     * **penche de l'autre, ferme un œil et garde le menton droit**.
     */
    pose: {
      /* ⚠️ Écrits en unités sur la référence plutôt qu'en facteurs tout faits : la pose
         porte bien un multiplicateur, mais l'intention se dit en unités — 23 de large sur
         40 de haut, 22 d'écart à l'axe — et la division la garde lisible si
         `OEIL_REFERENCE` bouge un jour. */
      ecart: 22 / 18, largeur: 23 / 19, hauteur: 40 / 66, inclinaison: 8,
      roulis: 12, lacet: 7, tangage: -5, derive: 0.55,
    },
    /**
     * Le balayage lent : le regard parcourt ce qu'il examine.
     *
     * ⚠️ **Une sinusoïde, donc qui repasse par zéro** — obligatoire ici : `anime` s'ajoute
     * à la pose et disparaît d'un coup quand l'état se termine, si bien qu'un décalage
     * constant ferait sauter le visage en sortant. C'est la leçon du somnolent, dont le
     * choix de côté a dû migrer dans la pose pour cette raison.
     *
     * ⚠️ **Très lente et très courte.** Cet état est tenu pendant qu'on lit un panneau :
     * un mouvement ample deviendrait vite agaçant, là où trois degrés sur une période de
     * deux secondes se remarquent à peine mais empêchent la tête de se figer.
     */
    anime: e => ({ lacet: 3 * Math.sin(e / 2000) }),
    clignement: 1.3,
  },
  {
    cle: "tres-content",
    libelle: "Très content",
    quand: "étape importante franchie",
    nature: "ponctuel",
    duree: 1500,
    amorti: 90,
    pose: { hauteur: 0.16, largeur: 1.55, courbure: 0.72, ecart: 1.06 },
    /**
     * ⚠️ **Aucun clignement : l'œil est déjà un arc.** La joie aplatit la paupière à seize
     * centièmes de sa hauteur — il n'y a plus d'œil ouvert à fermer. Un battement par-dessus
     * ne se lit donc pas comme un clignement mais comme un raté du tracé : l'arc disparaît
     * et revient sans raison. Le défaut est propre aux mimiques à œil arqué, et le
     * répertoire n'en compte plus qu'une depuis la réduction.
     */
    clignement: 0,
    // Le squash vertical, avec son rebond : la tête s'écrase puis repart, deux fois,
    // en s'amortissant. Sans l'amortissement, c'est un ressort de dessin animé.
    anime: e => {
      const r = Math.exp(-e / 420) * Math.sin(e / 105);
      return { echelleY: 1 - 0.11 * r, echelleX: 1 + 0.08 * r, tangage: -4 * r };
    },
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
    cle: "colere",
    libelle: "En colère",
    quand: "une action refusée coup sur coup, ou une perte qui s'aggrave sous les yeux",
    nature: "soutenu",
    /**
     * ⚠️ **L'inclinaison est *négative*, et s'être trompé de signe a coûté deux allers-retours.**
     * Une inclinaison positive fait **monter les bouts intérieurs** des yeux — mesuré, `y = −9`
     * dedans contre `+9` dehors : c'est le `/ \` de celui qui implore, et à l'écran cela se
     * lisait comme un caprice, jamais comme de la colère. Le signe négatif descend les bouts
     * intérieurs vers le nez, `\ /`, et c'est le seul sens qui durcit un visage.
     *
     * Rien d'autre n'est ajouté pour « faire colère » : ni trait, ni couleur, ni forme
     * nouvelle. La différence entre contrarié et en colère est un nombre.
     *
     * ⚠️ **L'œil se resserre en hauteur mais s'élargit un peu, et les deux vont ensemble.**
     * Seulement l'écraser donnerait le plissement de celui qui doute — le même geste que le
     * sceptique, qui cherche. La colère, elle, *fixe* : l'œil se ferme vers le haut et
     * s'étire, ce qui donne un regard dur au lieu d'un regard qui hésite.
     *
     * ⚠️ **L'écart s'ouvre, contre l'intuition.** Resserrer les yeux paraissait dire le
     * froncement ; à l'écran, cela rapproche surtout les deux barres et le visage se pince au
     * lieu de se durcir. Vingt-quatre unités — un facteur 1,084 sur les 22,14 de référence —
     * laissent aux deux accents la place de se lire comme deux sourcils.
     *
     * ⚠️ **L'œil reste *droit*, et la pliure a été essayée puis retirée.** Le chevron était
     * tentant : c'est le même levier que l'invite, il donne un angle franc, et la mesure
     * suivait — l'écart du milieu de l'œil à la droite qui joint ses bouts passait de 3,8 à
     * 8,8 unités, la pliure la plus creuse possible avant que l'œil ne s'étale. Mais à
     * l'écran, deux yeux en `> <` ne disent pas la colère : « on dirait qu'il fait un caprice
     * plutôt qu'il est énervé ». L'angle infantilise, là où la barre penchée durcit.
     *
     * Ce que la colère demande, c'est donc une **droite** inclinée, pas un chevron. Toute
     * l'expression retombe sur l'inclinaison — un nombre, comme le fâché du banc.
     */
    pose: {
      inclinaison: -31, hauteur: 0.56, largeur: 1.06, ecart: 1.084, derive: 0.3,
    },
    /**
     * ⚠️ **Un frémissement, pas un tremblement — et il doit rester minuscule.** `anime`
     * s'ajoute à la pose et **disparaît d'un coup** quand l'état change : sur un état soutenu,
     * qu'on peut quitter à n'importe quel instant, toute amplitude se paie en saut du visage
     * au moment de la sortie. Un degré et demi passe inaperçu ; c'est la même prudence que le
     * balancement du curieux, à une période dix fois plus courte parce que la colère vibre là
     * où la curiosité flotte.
     */
    /**
     * ⚠️ **Il tremble : c'est une vibration rapide et minuscule, pas un balancement.** Une
     * respiration lente — le volume qui se gonfle et se dégonfle — avait été essayée : elle se
     * lisait comme un soupir, pas comme de la rage. Ce qui fait la colère, c'est la
     * **fréquence**, pas l'amplitude. Ici huit à onze battements par seconde, pour **un degré
     * et demi** de débattement.
     *
     * ⚠️ **L'amplitude a été divisée par deux après coup, et la fréquence n'a pas bougé.**
     * Deux degrés et demi donnaient une tête qui bouge visiblement — jugé trop lourd. C'est la
     * confirmation par l'usage de ce que le réglage supposait : le tremblement se reconnaît à
     * son rythme, et l'on peut lui retirer la moitié de son ampleur sans lui retirer sa
     * nature. Le réduire en *ralentissant* l'aurait tué.
     *
     * ⚠️ **Les trois périodes sont volontairement incommensurables.** Un seul sinus, ou trois
     * en phase, donne un métronome — on lit un balancement régulier, presque apaisant. Des
     * périodes qui ne retombent jamais ensemble donnent un mouvement qui ne se répète pas :
     * c'est ce qui se lit comme un tremblement.
     *
     * ⚠️ **L'amplitude est plafonnée par la sortie, en plus du goût.** L'état est soutenu, donc
     * on le quitte à n'importe quel instant, et `anime` disparaît d'un coup à cet instant-là :
     * ce qui reste sur la table au moment du départ, le visage le rattrape en une image. Un
     * degré et demi passe inaperçu ; à quinze, cela se voyait comme un sursaut — c'est l'essai
     * « passe d'un état à l'autre sans à-coup » qui l'a attrapé, ailleurs.
     */
    anime: e => ({
      lacet: 1.4 * Math.sin(e / 19),
      tangage: 0.6 * Math.sin(e / 14),
      roulis: 0.9 * Math.sin(e / 25),
      /* Le volume vibre avec la tête, en opposition : ce qui s'élargit se tasse. */
      echelleX: 1 + 0.007 * Math.sin(e / 21),
      echelleY: 1 - 0.007 * Math.sin(e / 21),
    }),
    /* On ne cligne pas quand on fixe quelqu'un : le clignement s'espace. */
    clignement: 2.6,
    /* Et l'on ne se laisse pas distraire : presque aucun geste spontané par-dessus. */
    spontaneite: 0.15,
  },
  {
    cle: "blase",
    libelle: "Blasé",
    quand: "la énième fois qu'on lui demande la même chose, ou un résultat sans surprise",
    nature: "soutenu",
    /**
     * ⚠️ **Le blasé est une affaire de *paupière*, pas de sourcil.** Rien n'est incliné, rien
     * n'est plié : l'œil reste rigoureusement droit et se contente d'être à moitié tombé. Un
     * accent l'aurait fait basculer dans une humeur — vers le bas la colère, vers le haut la
     * peine — alors que l'indifférence est précisément l'absence des deux. C'est la seule
     * expression du répertoire qui ne se sert d'aucun angle.
     *
     * ⚠️ **Les trois nombres sont des mesures d'écran, pas des multiplicateurs choisis.** Ils
     * viennent du banc, en unités : hauteur **16**, largeur **35**, écart **24**. Rapportés
     * aux dimensions de référence — 81,18 de haut, 23,37 de large, 22,14 d'écart — cela donne
     * les facteurs ci-dessous. Les écrire ainsi permet de retrouver la mesure d'origine ; les
     * arrondir les aurait détachés de ce qui a été vu à l'écran.
     *
     * L'œil y perd les quatre cinquièmes de sa hauteur et gagne la moitié de sa largeur : une
     * fente large, celle du regard qui a déjà tout vu.
     */
    pose: {
      hauteur: 16 / 81.18, largeur: 35 / 23.37, ecart: 24 / 22.14,
      inclinaison: 0, derive: 0.6,
    },
    /**
     * ⚠️ **Aucun mouvement propre, et c'est l'expression même.** Les humeurs qui appuient ont
     * leur `anime` — la colère tremble, l'émerveillement pulse, le curieux se balance. Le
     * blasé, non : ce qui le dit, c'est qu'il ne se passe rien. Lui ajouter une oscillation,
     * même minuscule, lui rendrait de l'intérêt pour ce qu'il regarde.
     *
     * Il garde en revanche un peu de dérive et de suivi : un visage totalement immobile ne se
     * lit pas comme indifférent mais comme éteint — ou comme une image figée.
     */
    /* On cligne rarement quand plus rien ne surprend. */
    clignement: 1.8,
    spontaneite: 0.4,
  },
  {
    cle: "emerveille",
    libelle: "Émerveillé",
    quand: "découverte d'un résultat qui dépasse l'attendu",
    nature: "ponctuel",
    duree: 2200,
    amorti: 130,
    /**
     * ⚠️ **L'émerveillement agrandit l'œil ; il ne l'arrondit pas.** La tentation était
     * de reprendre les yeux ronds du « surpris » — mais la surprise est un sursaut, elle
     * écarquille ; l'émerveillement *contemple*, et son œil reste haut. C'est ce qui les
     * distingue à l'œil alors que les deux « ouvrent grand ».
     *
     * L'écart se resserre légèrement et la tête s'incline : le regard converge sur ce
     * qu'il admire au lieu de le fixer de face.
     */
    pose: { emerveille: 1, hauteur: 0.74, largeur: 1.95, ecart: 1.22, inclinaison: 9, tangage: -4, derive: 0.6 },
    /* Les éclats respirent : une pulsation lente, assez ample pour se voir, assez lente
       pour ne pas clignoter. */
    anime: e => ({ emerveille: 1 + 0.14 * Math.sin(e / 260) }),
    /* On ne cligne presque pas quand on s'émerveille : on regarde. */
    clignement: 3.4,
    spontaneite: 0,
  },
  {
    cle: "tour",
    libelle: "Tour complet",
    quand: "pour le plaisir, pendant le vagabondage qui précède le sommeil",
    nature: "ponctuel",
    duree: 1500,
    /* Entrée franche : un tour se lance, il ne se fond pas. */
    amorti: 60,
    pose: {},
    /**
     * Le tour sur lui-même.
     *
     * ⚠️ **Autour du lacet, donc un vrai demi-tour du volume — pas une roue dans le plan de
     * l'écran.** Le roulis aurait fait tourner l'image de la tête, ce qui se lit comme un
     * autocollant qui pivote. Le lacet fait tourner le *solide* : les yeux glissent vers le
     * bord, disparaissent derrière la tête au passage du dos, et reviennent de l'autre côté.
     * C'est ce que la géométrie sait déjà faire — `couperHemisphere` les tranche à l'horizon
     * — et c'est ce qui rend le geste convaincant plutôt que décoratif.
     *
     * ⚠️ **Le tour finit exactement sur 360°, et cela seul le rend possible ici.** `anime`
     * s'ajoute à la pose et **disparaît d'un coup** quand l'état se termine : n'importe
     * quelle autre valeur d'arrivée ferait sauter la tête. 360° est la seule qui soit à la
     * fois « un tour entier » et, pour les fonctions trigonométriques, identique à zéro. Le
     * même piège que le décalage du somnolent, résolu autrement — ici pas besoin de passer
     * par la pose, l'arithmétique referme la boucle toute seule.
     *
     * ⚠️ **Une anticipation avant l'élan.** Sans elle le tour démarre à froid et se lit
     * comme un glissement. Vingt-deux degrés en arrière, sur un sinus qui revient à zéro
     * avant que le tour ne commence : la tête prend son appui, puis part.
     */
    anime: e => {
      const DUREE = 1500;
      const u = Math.min(1, e / DUREE);
      const RECUL = 0.18;
      const recul = u < RECUL ? -22 * Math.sin((u / RECUL) * Math.PI) : 0;
      const t = u <= RECUL ? 0 : (u - RECUL) / (1 - RECUL);
      const doux = t * t * (3 - 2 * t);
      /* L'étirement du mouvement et un roulis qui part et revient : deux périodes entières,
         donc nuls à l'arrivée comme le lacet. */
      const elan = Math.sin(u * Math.PI);
      return {
        lacet: 360 * doux + recul,
        roulis: 9 * Math.sin(u * Math.PI * 2),
        echelleX: 1 + 0.06 * elan,
        echelleY: 1 - 0.05 * elan,
      };
    },
  },
  {
    cle: "invite",
    libelle: "Invite",
    quand: "clin d'œil au code, pendant le vagabondage qui précède le sommeil",
    nature: "ponctuel",
    /**
     * ⚠️ **Un multiple exact de la demi-période du curseur, et pas un chiffre rond.** Le
     * clignotement est un créneau de 530 ms : sur une durée quelconque, l'état se termine
     * une fois sur deux **curseur éteint**, et le glyphe s'efface alors sur une barre
     * manquante — on lit un bug d'affichage, pas une invite. Trois demi-périodes tombent
     * juste : le curseur est allumé au départ comme à l'arrivée.
     *
     * ⚠️ **C'est le *maintien* qui était trop long, pas l'entrée.** Le glyphe se forme en
     * quatre-vingts millisecondes et tient ensuite toute la durée. La descendre ne suffisait
     * plus : à 1060 on gardait bien deux battements de curseur — le minimum pour lire un
     * clignotement plutôt qu'une barre immobile — mais ces deux battements duraient encore
     * une seconde.
     *
     * ⚠️ **C'est donc le *curseur* qui a été accéléré, pas le compte de battements.** Sa
     * demi-période passe de 530 à 380 ms : deux battements tiennent désormais en 760 ms au
     * lieu de 1060. On perd le rythme exact d'un terminal réglé d'usine — le curseur paraît
     * un peu nerveux — mais on garde ce qui fait l'effet, à savoir qu'il **clignote**. Sous
     * deux battements il ne clignoterait plus : il s'allumerait puis s'éteindrait une fois,
     * ce qui n'est plus un curseur.
     */
    duree: 760,
    /**
     * ⚠️ **Une entrée brusque, une seule de tout le répertoire.** Partout ailleurs le
     * visage fond d'un état à l'autre, parce qu'un visage n'a pas de transitions nettes.
     * Ici c'est justement le propos : la tête **bascule** en mode machine. Quatre-vingts
     * millisecondes, soit cinq images — assez pour ne pas clignoter, trop peu pour qu'on y
     * lise une émotion.
     */
    amorti: 80,
    /**
     * ⚠️ **Le regard décroche et la tête s'immobilise.** `suivi` et `derive` tombent à
     * zéro : un terminal ne suit pas la souris. C'est cette immobilité, autant que le
     * glyphe, qui fait basculer la lecture de « visage » à « écran ».
     */
    pose: { invite: 1, derive: 0, suivi: 0, lacet: 0, tangage: 0, roulis: 0 },
    /**
     * Le curseur clignote, et **mécaniquement**.
     *
     * ⚠️ **Un créneau, pas un fondu — c'est tout le sel de l'hommage.** Un curseur de
     * terminal est allumé ou éteint, à cadence fixe, sans amorti ; l'œil humain, lui,
     * cligne avec une accélération. Le contraste tient en une fonction : `Math.floor` sur
     * la demi-période donne le créneau, là où le reste du visage n'utilise que des
     * sinusoïdes. Demi-période à 380 ms — voir `duree` pour pourquoi ce n'est pas les
     * 530 d'un terminal d'usine.
     *
     * ⚠️ **`asymetrie` et non `fermeture` :** seule la barre de droite doit s'éteindre. Le
     * chevron reste allumé, comme l'invite qui l'attend.
     */
    anime: e => ({ asymetrie: Math.floor(e / 380) % 2 === 0 ? 0 : 1 }),
    /* Ni clignement d'œil ni geste spontané : la machine ne se gratte pas le nez. */
    clignement: 0,
    spontaneite: 0,
  },
  {
    cle: "somnolent",
    libelle: "Somnolent",
    quand: "longue inactivité",
    nature: "soutenu",
    amorti: 900,
    /**
     * ⚠️ **La tête tombe, elle ne se contente pas de fermer les yeux.** Des paupières
     * basses sur une tête droite se lisent comme un regard méfiant, pas comme
     * l'assoupissement : c'est l'inclinaison qui fait la différence. Le menton descend
     * de treize degrés et la tête roule de onze sur le côté — le mouvement de celui qui
     * pique du nez.
     */
    /**
     * ⚠️ **Le regard est complètement figé : ni dérive, ni suivi du curseur.** Un dormeur
     * dont les yeux suivent la souris ne dort pas — c'était pourtant le cas, à un cinquième
     * de l'amplitude, et cela suffisait à trahir l'état. Ce qui donne la vie ici n'est plus
     * le mouvement continu mais le **déplacement du regard par paliers**, plus bas.
     */
    pose: tirage => ({
      fermeture: 0.58, hauteur: 0.74, courbure: 0.12,
      tangage: 13, roulis: -11, derive: 0, suivi: 0,
      /* De quel côté il s'endort : à gauche, au milieu ou à droite. Le tangage ne bouge
         pas — le regard reste baissé quel que soit le tirage. */
      lacet: (Math.floor(tirage * 3) - 1) * 15,
    }),
    // Un clignement rare et la dérive ralentie : c'est le rythme qui dit la somnolence,
    // autant que les paupières.
    /**
     * ⚠️ **Zéro veut dire « jamais », et c'est bien ce qu'on veut ici.** Un dormeur ne
     * cligne pas : ses paupières sont déjà baissées, et un battement par-dessus se lit
     * comme un réveil manqué. Le répertoire savait déjà l'écrire, mais la valeur zéro était
     * lue à l'envers par la machine — voir le garde-fou dans `avatarVie`.
     */
    clignement: 0,
    /* Ni geste spontané : un dormeur qui jette des coups d'œil ne dort pas. */
    spontaneite: 0,

  },
  {
    cle: "reveil",
    libelle: "Réveil",
    quand: "retour de l'utilisateur",
    nature: "ponctuel",
    duree: 1100,
    amorti: 55,
    /**
     * L'ouverture dépasse le neutre avant d'y revenir : c'est ce dépassement qui fait lire
     * « il se réveille » plutôt que « il ouvre les yeux ».
     *
     * ⚠️ **Il ouvre **grand**, comme la surprise.** On sort de paupières à moitié closes :
     * revenir simplement au neutre ne se voit pas, la différence est trop faible pour se
     * lire comme un sursaut. L'œil s'arrondit donc franchement, un cran en dessous du
     * surpris — c'est un réveil, pas un choc.
     */
    pose: { hauteur: 0.56, largeur: 2.07, ecart: 1.39 },
    /**
     * La secousse : la tête tressaille en rouvrant les yeux.
     *
     * ⚠️ **Elle porte sur l'échelle, donc sur la **silhouette** — pas sur l'orientation.**
     * Le tangage et le roulis font bouger la tête *dans l'espace* : c'est un mouvement de
     * cou, celui de quelqu'un qui se redresse. La secousse d'un réveil est autre chose —
     * la matière elle-même sursaute, se comprime et rebondit. Cela ne s'obtient qu'en
     * déformant le volume, et l'avatar a exactement ce qu'il faut : `echelleX` et
     * `echelleY`, qui s'appliquent au rendu et non à la géométrie — la sphère reste une
     * sphère, c'est son image qu'on comprime.
     *
     * ⚠️ **Les deux axes en opposition, et c'est ce qui fait la matière.** Écraser en
     * hauteur *et* en largeur donnerait un objet qui rétrécit ; l'un se comprime pendant
     * que l'autre s'étale, à volume constant à l'œil. C'est la règle du `squash and
     * stretch`, et l'écart entre les deux amplitudes — douze contre neuf centièmes — est
     * ce qui empêche que ça ressemble à une pulsation.
     *
     * ⚠️ **Plus vive et plus courte que celle du « très content ».** Là-bas c'est une joie
     * qui s'installe (période 105, amorti 420) ; ici un sursaut, qui doit être fini avant
     * qu'on ait eu le temps de le lire. Deux fois plus rapide, deux fois plus vite amorti.
     */
    anime: e => {
      const r = Math.exp(-e / 210) * Math.sin(e / 62);
      return {
        tangage: -5 * Math.exp(-e / 300),
        roulis: 4 * Math.exp(-e / 260) * Math.sin(e / 120),
        echelleY: 1 - 0.12 * r,
        echelleX: 1 + 0.09 * r,
      };
    },
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
  /**
   * ⚠️ **Deux bandes ont fondu dans leurs voisines**, le répertoire ayant été ramené à
   * l'essentiel. « Surpris » et « content » disaient tous deux une hausse, à deux
   * intensités ; il ne reste que « très content », qui prend la hausse **franche** — celle
   * qui mérite qu'un visage réagisse. La hausse molle retombe sur « curieux », c'est-à-dire
   * sur l'attention sans jugement : plus juste qu'une joie tiède qu'on aurait vue vingt fois
   * par écran. « Préoccupé » et « sceptique » disaient de même la baisse à deux intensités ;
   * « sceptique » les couvre.
   */
  if (pourcentage >= 8) return "tres-content";
  if (pourcentage <= -1) return "sceptique";
  return "curieux";
}

/**
 * Les deux attributs qui rendent un élément expressif, posés ensemble.
 *
 * ⚠️ **Le chiffre voyage à côté de la clé, et non à sa place.** Le fournisseur a besoin des
 * deux : la clé dit ce que vaut la variation *maintenant*, le chiffre lui permet de voir ce
 * qu'elle est en train de faire — c'est ce qui distingue une perte d'une perte qui se
 * creuse. Déduire l'aggravation du seul changement de clé n'aurait rien attrapé : une chute
 * de −0,5 % à −7 % reste « sceptique » d'un bout à l'autre.
 *
 * ⚠️ **Un seul appel plutôt que deux attributs à écrire côte à côte.** Ils doivent décrire
 * le même nombre ; les laisser séparés, c'est accepter qu'un jour l'un des deux soit oublié
 * ou branché sur une autre valeur, et le défaut serait invisible — le visage se contenterait
 * de ne jamais se fâcher.
 *
 * ⚠️ **À réserver aux valeurs qui se rafraîchissent.** Sur une liste chargée une fois — les
 * actifs similaires, par exemple — le chiffre ne bougera jamais : l'attribut n'y coûterait
 * rien mais n'y servirait à rien, et laisserait croire que l'endroit est branché.
 *
 * ⚠️ **Le chiffre suivi peut n'être pas celui qui décide de la bande, et il le faut.** La
 * grille d'actifs classe ses cartes sur l'**écart à la moyenne des lignes**, parce que la
 * variation brute sature sur une fenêtre longue — voir `AssetGrid`. Mesuré à l'écran sur la
 * fenêtre Max : un écart de **246 485 points**. Contre une échelle pareille, la marche de
 * trois dixièmes ne veut plus rien dire, et le moindre frémissement aurait mis le visage en
 * colère à chaque relecture des cours. Le classement garde donc l'écart ; ce qu'on regarde
 * se creuser, c'est la variation vraie.
 */
export function marqueAvatar(
  pourcentage: number | null | undefined,
  /** Le chiffre dont on surveille l'évolution, quand il diffère de celui qui classe. */
  suivi: number | null | undefined = pourcentage,
) {
  return {
    "data-avatar": etatSelonVariation(pourcentage),
    /* `undefined` retire l'attribut au lieu d'écrire « null » : sans quoi le fournisseur
       croirait à un chiffre publié et lirait `Number("null")`. */
    "data-variation": typeof suivi === "number" && isFinite(suivi) ? suivi : undefined,
  };
}

/**
 * Ce qu'il faut perdre, en points de pourcentage, pour que la chute compte.
 *
 * ⚠️ **Un plancher, parce que les cours frémissent.** Le rafraîchissement est de dix
 * secondes — `CADENCE_COURS_MS` — et un tick ordinaire ne déplace la variation que de
 * quelques centièmes de point. Sans marche, le visage passerait en colère à chaque
 * relecture d'un titre en baisse : donc en permanence, donc sans que cela ne dise plus
 * rien. Trois dixièmes de point en dix secondes, c'est une glissade qui se voit à l'écran.
 */
export const MARCHE_AGGRAVATION = 0.3;

/**
 * L'état d'une variation qu'on regarde se creuser.
 *
 * ⚠️ **La seule entrée du répertoire qui compare deux instants, et « en colère » l'exigeait.**
 * Son `quand` dit « une perte qui s'aggrave sous les yeux », pas « une grosse perte ». Un
 * simple seuil sur la valeur courante aurait fâché le visage devant tout ce qui affiche
 * −9 %, y compris un titre qui remonte depuis une heure. Ce qui met en colère, c'est le
 * mouvement, pas le niveau — et c'est aussi ce qui rend l'état rare, donc lisible.
 *
 * ⚠️ **Il faut être en perte, et pas seulement en baisse.** Un titre qui passe de +4 % à
 * +3,5 % se replie ; il ne perd rien, et le voir enrager sur un gain qui s'effrite se
 * lirait comme de l'avidité. La colère est réservée au rouge qui s'enfonce.
 *
 * ⚠️ **Sans précédent, aucune colère possible** — et c'est ce qui protège l'entrée dans un
 * élément. Le premier relevé n'a rien à quoi se comparer : il retombe sur la lecture
 * ordinaire, et la colère ne peut naître qu'au relevé suivant, donc sous les yeux de
 * quelqu'un qui regardait déjà.
 */
export function etatSelonAggravation(
  pourcentage: number | null | undefined,
  precedent: number | null | undefined,
): string {
  const ordinaire = etatSelonVariation(pourcentage);
  if (typeof pourcentage !== "number" || !isFinite(pourcentage)) return ordinaire;
  if (typeof precedent !== "number" || !isFinite(precedent)) return ordinaire;
  if (pourcentage >= 0) return ordinaire;
  /**
   * ⚠️ **Sous les cent pour cent, ce n'est plus une perte : c'est une donnée fausse.** Une
   * position longue ne peut pas perdre plus que tout — le plancher n'est donc pas un
   * réglage de goût, c'est une borne physique. Et il sert : sur la fenêtre Max, la variation
   * d'une ligne part en vrille — relevé à l'écran sur ce portefeuille, **+814 559 %**. Contre
   * une échelle pareille, la marche de trois dixièmes est franchie par n'importe quel
   * frémissement, et le visage serait resté en colère tant que la fenêtre est ouverte.
   */
  if (pourcentage <= -100) return ordinaire;
  return pourcentage <= precedent - MARCHE_AGGRAVATION ? "colere" : ordinaire;
}

/**
 * Ce que dit un élément survolé, compte tenu de ce qu'on lui a vu juste avant.
 *
 * ⚠️ **Sorti du fournisseur pour être vérifiable.** C'est la règle de la maison — `@/lib`
 * porte le calcul, le composant porte le rendu — et elle vaut doublement ici : la décision
 * dépend d'un souvenir, donc d'un enchaînement, et un enchaînement ne se relit pas à l'œil.
 * Laissée en fermeture dans l'écouteur, cette poignée de lignes n'aurait pu s'éprouver qu'en
 * survolant l'écran à la main, au moment précis où un cours bouge.
 *
 * ⚠️ **Elle rend le souvenir au lieu de le garder.** Aucun état caché, donc : la même entrée
 * donne toujours la même sortie, et c'est l'appelant qui décide de la durée de vie de la
 * mémoire — il l'efface quand on change d'élément. Une variable de module aurait été plus
 * courte et aurait fait fuiter le souvenir d'une carte sur la suivante.
 *
 * @param cle         ce que porte `data-avatar`, ou `null` si l'élément n'en a pas
 * @param chiffre     ce que porte `data-variation`, tel quel — `undefined` s'il n'y en a pas
 * @param precedent   la dernière variation vue sur **ce même** élément
 */
export function lireMarqueAvatar(
  cle: string | null,
  chiffre: string | undefined,
  precedent: number | null,
): { cle: string | null; variation: number | null } {
  /* Sans chiffre publié, rien à comparer : l'élément impose sa clé, et le souvenir
     s'efface — sans quoi la variation d'une carte survivrait à son survol. */
  if (cle === null || chiffre === undefined) return { cle, variation: null };
  const variation = Number(chiffre);
  return {
    cle: etatSelonAggravation(variation, precedent),
    variation: isFinite(variation) ? variation : null,
  };
}

/**
 * L'état d'un point de courbe, à partir de son écart à la performance du jour.
 *
 * ⚠️ **Des paliers bien plus larges que ceux d'une variation de cours, et un de moins.**
 * Signalé à l'usage : en promenant le curseur, le visage changeait sans arrêt de
 * mimique. Une courbe se parcourt en continu — chaque pixel déplace la valeur — là où
 * l'on passe d'une carte à l'autre par sauts. Avec les seuils d'`etatSelonVariation`,
 * un simple glissement traversait quatre bandes, et la tête n'avait le temps de se
 * poser dans aucune.
 *
 * ⚠️ **« Sceptique » n'y figure pas.** Un œil plus fermé que l'autre exprime un doute
 * sur une hypothèse ; il ne veut rien dire sur un point de mesure. Le retirer d'ici,
 * c'est une bande de moins à traverser, et une mimique qui garde son sens là où elle
 * en a un.
 */
export function etatSelonEcartCourbe(
  ecart: number | null | undefined,
  /**
   * Le point survolé est-il le sommet de la courbe ?
   *
   * ⚠️ **C'est la seule façon d'atteindre « émerveillé » qui soit réellement observable.**
   * Son `quand` dit « découverte d'un résultat qui dépasse l'attendu », et une première
   * version l'avait branché sur un *record* du portefeuille : juste sur le fond, invisible
   * en pratique — il fallait qu'un nouveau plus haut se produise pendant que la page était
   * ouverte. Mesuré sur ce portefeuille : 1,7 à 2,1 % sous son sommet sur **toutes** les
   * fenêtres, donc rien, jamais. Ici la découverte est celle de l'utilisateur : il promène
   * le curseur et **trouve** le meilleur moment de la période.
   */
  auSommet = false,
): string {
  if (typeof ecart !== "number" || !isFinite(ecart)) return "curieux";
  /**
   * ⚠️ **Le sommet doit encore battre aujourd'hui.** Sur une courbe entièrement sous le
   * niveau actuel, son point haut reste le meilleur *de la période* — mais s'émerveiller
   * d'un moment où l'on valait moins qu'aujourd'hui se lirait comme un contresens. Au-delà
   * de zéro, le sommet est à la fois le meilleur de la courbe et meilleur que maintenant :
   * c'est là qu'il y a quelque chose à fêter.
   */
  if (auSommet && ecart >= 0) return "emerveille";
  /* Mêmes fusions que pour la variation, aux seuils larges de la courbe. */
  if (ecart >= 20) return "tres-content";
  if (ecart <= -10) return "sceptique";
  return "curieux";
}

export function etatParCle(cle: string): Etat {
  for (let i = 0; i < ETATS.length; i++) if (ETATS[i].cle === cle) return ETATS[i];
  return ETATS[0];
}

/** La pose complète d'un état, valeurs neutres comprises. */
/**
 * Les grandeurs qui se **multiplient** ; toutes les autres s'ajoutent.
 *
 * ⚠️ La distinction se lit dans `POSE_NEUTRE` : ce qui y vaut 1 est un facteur, ce qui y
 * vaut 0 est un décalage. Les composer à l'envers doublerait la taille d'un œil au lieu de
 * la laisser tranquille, ou ajouterait un à un angle sans raison.
 */
const FACTEURS: (keyof Pose)[] = [
  "largeur", "hauteur", "ecart", "echelleX", "echelleY", "derive", "suivi",
];

/**
 * Superpose un geste à la pose de l'état de fond.
 *
 * ⚠️ **Sans cela, un geste spontané *efface* l'expression au lieu de s'y ajouter.** Le
 * module annonçait depuis toujours qu'ils se jouent « par-dessus l'état » — c'était vrai de
 * l'**état**, qui est bien restauré ensuite, et faux de la **pose**, qui était purement
 * remplacée. Le défaut restait invisible tant que les expressions ressemblaient au repos ;
 * dès que « curieux » a pris du caractère, il a sauté aux yeux : `coup-oeil` porte
 * `pose: {}`, donc le visage revenait *exactement* au neutre pendant une seconde, toutes
 * les trois secondes. Signalé à l'usage — « les yeux se remettent en neutre, c'est bizarre ».
 */
export function superposerPose(fond: Pose, geste: Pose): Pose {
  const out = { ...fond };
  for (const cle of Object.keys(fond) as (keyof Pose)[]) {
    out[cle] = FACTEURS.indexOf(cle) >= 0 ? fond[cle] * geste[cle] : fond[cle] + geste[cle];
  }
  return out;
}

export function poseDeLEtat(etat: Etat, tirage = 0.5): Pose {
  return { ...POSE_NEUTRE, ...(typeof etat.pose === "function" ? etat.pose(tirage) : etat.pose) };
}

/**
 * Les gestes que le visage se donne tout seul, par-dessus l'état en cours.
 *
 * ⚠️ **Ils manquaient, et leur absence se voyait.** La machine à états les avait
 * remplacés : hors d'une réaction de l'application, le visage ne faisait plus que
 * dériver et cligner. Or c'est en « neutre » qu'il passe le plus clair de son temps —
 * et un neutre sans initiative propre se lit comme une icône, si soignées que soient
 * les mimiques qu'on ne voit jamais.
 *
 * ⚠️ **Ce sont des ponctuels ordinaires**, donc ils rendent la main à l'état de fond
 * comme les autres. Ils ne le remplacent pas : un coup d'œil pendant « Préoccupé »
 * revient sur « Préoccupé ». Ils sont tenus à part d'`ETATS` parce que le répertoire
 * V1 décrit ce que l'**application** demande ; ceux-ci ne sont demandés par personne.
 */
export const GESTES_SPONTANES: Etat[] = [
  {
    cle: "coup-oeil",
    libelle: "Coup d'œil",
    quand: "de lui-même, au repos",
    nature: "ponctuel",
    duree: 1150,
    amorti: 75,
    pose: {},
    // Le regard part ailleurs et revient. Le geste le plus court du lot, et celui qui
    // donne le plus l'impression d'une attention propre.
    anime: e => {
      const f = e < 130 ? e / 130 : e > 870 ? Math.max(0, 1 - (e - 870) / 280) : 1;
      return { lacet: 17 * f * (e % 2 === 0 ? 1 : 1), tangage: -6 * f };
    },
  },
  {
    cle: "coup-oeil-gauche",
    libelle: "Coup d'œil à gauche",
    quand: "de lui-même, au repos",
    nature: "ponctuel",
    duree: 1150,
    amorti: 75,
    pose: {},
    anime: e => {
      const f = e < 130 ? e / 130 : e > 870 ? Math.max(0, 1 - (e - 870) / 280) : 1;
      return { lacet: -19 * f, tangage: 4 * f };
    },
  },
  {
    cle: "penchement",
    libelle: "Penchement",
    quand: "de lui-même, au repos",
    nature: "ponctuel",
    duree: 1600,
    amorti: 230,
    // Le geste de la curiosité, et le seul qui emploie franchement le roulis.
    pose: { roulis: 13, lacet: 5, inclinaison: 2 },
  },
  {
    cle: "plissement",
    libelle: "Plissement",
    quand: "de lui-même, au repos",
    nature: "ponctuel",
    duree: 1250,
    amorti: 150,
    pose: { hauteur: 0.52, largeur: 1.12, inclinaison: 5 },
  },
  {
    cle: "etirement",
    libelle: "Étirement",
    quand: "de lui-même, au repos",
    nature: "ponctuel",
    duree: 1300,
    amorti: 110,
    // Les yeux s'ouvrent grand un instant, comme on se déraidit.
    pose: { hauteur: 1.2, largeur: 1.08, tangage: -4 },
  },
];

/**
 * Les gestes que le visage se permet **pendant le vagabondage**, et eux seuls.
 *
 * ⚠️ **Un répertoire nommé plutôt qu'un tirage écrit au hasard dans le contexte.** Ces gestes
 * ne disent rien de l'application — ils ne réagissent à aucune donnée, ils occupent le visage
 * quand plus personne ne le regarde travailler. C'est ce qui les sépare des expressions, et
 * c'est pourquoi ils ne se déclenchent qu'une fois l'utilisateur parti : vus pendant qu'on se
 * sert de l'outil, ils passeraient pour une réponse à ce qu'on vient de faire.
 *
 * ⚠️ **Les alterner double l'intervalle entre deux apparitions du *même* geste** sans rien
 * changer à la cadence d'ensemble. Ajouter un troisième geste ici suffit à l'y faire entrer :
 * c'est le seul endroit à toucher, et l'essai vérifie qu'ils sont tous ponctuels — un geste
 * soutenu s'installerait au lieu de passer, et le visage resterait bloqué dedans.
 */
export const GESTES_LIBRES = ["invite", "tour"] as const;
