/**
 * Ce qu'on écrit sur la carte d'un objectif d'épargne.
 *
 * ⚠️ **Ce fichier remplace des libellés qui mentaient.** L'onglet affichait trois
 * objectifs codés en dur — « Retraite 2035 », « Achat immobilier », « Indépendance
 * financière » — avec des cibles choisies au hasard et un montant courant obtenu en
 * multipliant la valeur du portefeuille par 0,42 et 0,28. Ici, chaque mot vient d'un
 * objectif que l'épargnant a saisi, et chaque chiffre du serveur.
 *
 * Tout est pur : les seules décisions prises ici sont de mise en forme, et elles se
 * vérifient sans rien afficher.
 */

export type Genre =
  | "capital" | "capital_age" | "achat" | "revenu_mensuel"
  /**
   * Un plafond de **versements** : « quand aurai-je versé 150 000 € sur mon PEA ? »
   *
   * ⚠️ **Le seul genre qui ignore la performance, et c'est tout son objet.** Le plafond
   * d'un PEA porte sur le cumul des versements ; les plus-values ne le consomment pas. Un
   * PEA valant 150 000 € pour 90 000 € versés garde 60 000 € de capacité — le mesurer sur
   * la valeur l'annoncerait plein avec deux tiers du chemin restant.
   */
  | "plafond_versements";

/** Vrai quand l'avancement compte les versements et non la valeur du portefeuille. */
export const surVersements = (g: Genre): boolean => g === "plafond_versements";

/** Un objectif tel que la route le rend. */
export type Objectif = {
  id: string;
  nom: string;
  genre: Genre;
  cible: number;
  echeance_annee: number | null;
  age_cible: number | null;
  part_affectee: number | null;
  versement_mensuel: number | null;
  /** Le cumul saisi, ou `null` quand l'épargnant s'en remet à la mesure. */
  verse_deja: number | null;
  /**
   * Ce que les transactions mesurent — un **minorant** des versements réels.
   *
   * ⚠️ L'application enregistre des achats et des ventes de titres, jamais les virements
   * sur le compte : l'argent laissé en liquidités n'y figure pas. Rendu même quand un
   * chiffre est saisi, pour que l'écran puisse signaler un écart.
   */
  verse_mesure: number | null;
  /** Celui des deux qui sert au calcul. */
  verse_retenu: number | null;
  /** Rendu par le serveur pour que l'écran n'ait pas à recopier la liste des genres. */
  sur_versements: boolean;
  /** Ce que changerait un autre rythme, ou un autre rendement. */
  sensibilites: Sensibilite[];
  /**
   * Le versement mensuel qu'il faudrait pour tenir l'échéance.
   *
   * ⚠️ L'inverse de la projection, et la seule réponse de l'écran à « pour y être à la date
   * voulue, quel rythme ? ». Tout le reste répond à la question opposée.
   */
  versement_requis: number | null;
  taux_attendu: number | null;
  inflation: number | null;
  taux_retrait: number | null;
  couleur: string | null;
  capital_requis: number | null;
  montant_actuel: number | null;
  avancement: number | null;
  atteint: boolean | null;
  mois_restants: number | null;
  valeur_projetee: number | null;
  projetee_en_euros_constants: number | null;
  mois_pour_atteindre: number | null;
};

/**
 * Ce que devient la date d'atteinte si une entrée change.
 *
 * ⚠️ **Une sensibilité, pas un conseil.** « À 400 € par mois, la cible reculerait de douze
 * ans » est la même fonction évaluée à une autre entrée : rien n'y est prescrit, et
 * l'épargnant compare deux chiffres pour trancher lui-même. « Versez 800 € » serait une
 * recommandation d'investissement, que ce logiciel ne produit pas. Le conditionnel porte
 * toute la différence, et un test le garde.
 */
export type Sensibilite = {
  quoi: "versement" | "rendement";
  versement: number;
  taux: number;
  /** Les mois nécessaires dans ce cas, ou `null` si la cible devient hors de portée. */
  mois: number | null;
  /** L'écart en mois avec le rythme actuel : positif = plus tard. */
  ecart_mois: number | null;
};

/**
 * Ce que la cible représente, selon la sorte d'objectif.
 *
 * ⚠️ Quatre libellés parce que les quatre sortes ne disent pas la même chose. La
 * maquette les distingue déjà : « Objectif final » pour un capital, « Objectif à
 * 60 ans » pour un âge, « Objectif » pour un achat daté, « Revenus passifs » pour un
 * revenu mensuel. Un intitulé commun aurait fait lire 5 000 € comme un patrimoine.
 */
export function libelleCible(o: Pick<Objectif, "genre" | "age_cible">): string {
  switch (o.genre) {
    case "capital": return "Objectif final";
    case "capital_age": return o.age_cible ? `Objectif à ${o.age_cible} ans` : "Objectif";
    case "achat": return "Objectif";
    case "revenu_mensuel": return "Revenus passifs";
    // ⚠️ « versés » et non « atteint » : ce plafond se remplit avec de l'argent apporté,
    // pas avec de la valeur acquise. Le mot porte toute la distinction.
    case "plafond_versements": return "Plafond de versements";
  }
}

const EUROS = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/**
 * Le montant de la cible, avec son unité.
 *
 * ⚠️ « € / mois » pour un revenu, et c'est le point. Afficher « 5 000 € » à côté d'un
 * patrimoine de cinq mille euros laisserait croire l'objectif atteint, alors qu'il en
 * réclame un million et demi — voir `capital_requis` côté serveur.
 */
export function montantCible(o: Pick<Objectif, "genre" | "cible">): string {
  const n = EUROS.format(Math.round(o.cible));
  return o.genre === "revenu_mensuel" ? `${n} € / mois` : `${n} €`;
}

/** Un montant en euros, arrondi à l'unité. */
export const euros = (v: number): string => `${EUROS.format(Math.round(v))} €`;

/**
 * L'échéance en clair, depuis un nombre de mois.
 *
 * ⚠️ En années dès qu'il y en a plus d'une, parce que « dans 216 mois » ne se
 * représente pas. Sous un an, en mois : « dans 4 mois » est actionnable là où « dans
 * 0 an » ne veut rien dire.
 */
export function echeanceEnClair(mois: number | null): string | null {
  if (mois == null || mois <= 0) return null;
  if (mois < 12) return `dans ${mois} mois`;
  const ans = Math.round(mois / 12);
  return `dans ${ans} an${ans > 1 ? "s" : ""}`;
}

/**
 * Ce que le rythme actuel promet, comparé à l'échéance.
 *
 * ⚠️ **Un constat, jamais un conseil.** La maquette proposait « augmentez votre
 * investissement mensuel à 1 000 € » : c'est une recommandation d'investissement, que
 * ce logiciel ne produit pas. Une soustraction de mois, en revanche, informe sans
 * prescrire — l'épargnant en tire ce qu'il veut.
 *
 * Rend `null` quand il n'y a rien à comparer : pas d'échéance, ou pas d'hypothèse de
 * rendement. Un silence vaut mieux qu'une phrase bâtie sur un taux que personne n'a
 * choisi.
 */
export function ecartAuRythme(o: Pick<Objectif, "mois_restants" | "mois_pour_atteindre">):
  { texte: string; tenable: boolean } | null {
  const { mois_restants: reste, mois_pour_atteindre: besoin } = o;
  if (reste == null) return null;
  if (besoin == null) {
    // ⚠️ Le serveur rend `null` quand aucune durée ne convient — sans versement et à
    // taux nul, par exemple. Dire « jamais » serait exact mais brutal ; dire la cause
    // est plus utile.
    return { texte: "hors de portée au rythme actuel", tenable: false };
  }
  if (besoin <= reste) {
    const avance = reste - besoin;
    if (avance < 6) return { texte: "dans les temps", tenable: true };
    const ans = Math.round(avance / 12);
    return {
      texte: ans >= 1 ? `${ans} an${ans > 1 ? "s" : ""} d’avance` : `${avance} mois d’avance`,
      tenable: true,
    };
  }
  const retard = besoin - reste;
  const ans = Math.round(retard / 12);
  return {
    texte: ans >= 1 ? `${ans} an${ans > 1 ? "s" : ""} de retard` : `${retard} mois de retard`,
    tenable: false,
  };
}

/**
 * Ce que la somme des parts affectées permet de dire.
 *
 * ⚠️ Au-delà de cent pour cent, le même euro est compté pour deux objectifs. Le serveur
 * rend la somme sans la normaliser, exprès : corriger en douce cacherait à l'épargnant
 * qu'il a réparti deux fois son patrimoine.
 */
export function alerteRepartition(somme: number | null | undefined): string | null {
  if (somme == null || somme <= 100.5) return null;
  return `Vos objectifs se partagent ${Math.round(somme)} % du portefeuille : `
    + "au-delà de 100 %, le même euro compte pour plusieurs objectifs.";
}

/**
 * Ce que vaut la valorisation dont l'avancement dépend.
 *
 * ⚠️ Trois cas, et l'écran doit les distinguer. « transactions » vaut les cours du
 * jour ; « poids » retombe sur une colonne enregistrée dont on a mesuré qu'elle
 * contient le montant investi, pas la valeur — 4 959,91 € contre 5 304,86 sur un vrai
 * PEA ; « indisponible » signifie qu'aucun cours n'a pu être obtenu. Ce dernier cas ne
 * doit surtout pas se lire comme un patrimoine nul.
 */
export function avertissementValeur(
  source: string | null | undefined, valorisees?: number, totales?: number,
): string | null {
  if (source === "indisponible") {
    return "Cours indisponibles : l’avancement ne peut pas être calculé pour l’instant.";
  }
  if (source === "poids") {
    return "Avancement estimé depuis la valeur enregistrée du portefeuille, "
      + "faute de transactions saisies.";
  }
  if (source === "transactions" && totales && valorisees != null && valorisees < totales) {
    return `Valorisation partielle : ${valorisees} ligne${valorisees > 1 ? "s" : ""} `
      + `sur ${totales} ont un cours. L’avancement est sous-estimé.`;
  }
  return null;
}

/** L'agrégat de tous les objectifs d'un portefeuille. */
export type Agregat = {
  /** La somme des capitaux requis, en euros. */
  total: number;
  /** La somme des montants déjà constitués. */
  actuel: number;
  /** Ce qu'il reste, jamais négatif. */
  reste: number;
  /** L'avancement d'ensemble, borné à cent. */
  part: number;
  /** Combien d'objectifs entrent dans le calcul, et combien en sont écartés. */
  comptes: number;
  /** Écartés faute de montant connu — valorisation impossible. */
  ecartes: number;
  /**
   * Écartés parce qu'ils ne se comptent pas dans la même unité : les plafonds de versements.
   *
   * ⚠️ **Distinct de `ecartes`, et le message à l'écran doit le rester.** « Montant
   * indisponible » sur un plafond de versements est faux : son montant est parfaitement
   * connu, il n'est simplement pas commensurable avec un patrimoine. Vu à l'écran, cette
   * confusion faisait passer un choix de calcul assumé pour une donnée manquante.
   */
  horsUnite: number;
};

/**
 * L'avancement de l'ensemble des objectifs.
 *
 * ⚠️ **Les objectifs sans capital requis ni montant connu sont écartés et comptés.** Un
 * objectif dont la valorisation a échoué ne vaut pas zéro : l'inclure à zéro tirerait
 * l'avancement global vers le bas et ferait passer une ignorance pour un retard. Le
 * nombre d'écartés est rendu pour que l'écran puisse le dire.
 *
 * ⚠️ **Additionner des capitaux d'échéances différentes est une convention.** 300 000 €
 * dans cinq ans et 1 250 000 € dans dix-huit ans ne sont pas commensurables : un euro de
 * 2044 n'a pas le pouvoir d'achat d'un euro de 2031. La maquette additionne, donc on
 * additionne — mais l'écran doit présenter le résultat comme une somme de cibles, pas
 * comme un patrimoine à constituer.
 */
export function agregat(objectifs: Objectif[]): Agregat {
  let total = 0, actuel = 0, comptes = 0, ecartes = 0, horsUnite = 0;
  for (const o of objectifs) {
    // ⚠️ **Les plafonds de versements sont exclus, et pas par commodité de présentation.**
    // Leur `montant_actuel` est un cumul de versements ; celui des autres est la part du
    // patrimoine affectée. Or les versements *sont* dans le patrimoine : les additionner
    // compterait deux fois le même argent, et gonflerait l'avancement global d'un
    // portefeuille qui n'aurait rien gagné. Comptés comme écartés, donc dits à l'écran.
    if (o.sur_versements) { horsUnite += 1; continue; }
    if (o.capital_requis == null || o.montant_actuel == null) { ecartes += 1; continue; }
    total += o.capital_requis;
    actuel += o.montant_actuel;
    comptes += 1;
  }
  const part = total > 0 ? Math.min(100, (actuel / total) * 100) : 0;
  return { total, actuel, reste: Math.max(0, total - actuel), part, comptes, ecartes,
           horsUnite };
}

/**
 * Des constats chiffrés sur un objectif — jamais des conseils.
 *
 * ⚠️ **Ce que ce panneau remplace.** La maquette proposait des « Recommandations IA » :
 * « augmenter votre investissement mensuel à 1 000 € », « réduire l'exposition aux
 * actions à 70 % », « activer le réinvestissement automatique ». C'est du conseil en
 * investissement personnalisé, que ce logiciel ne produit pas. Ce qui suit est
 * arithmétique et vérifiable : des divisions, des soustractions et des comparaisons de
 * dates. L'épargnant en tire ses conclusions.
 *
 * Chaque constat est omis dès qu'une de ses entrées manque, plutôt que d'être bâti sur
 * une hypothèse par défaut.
 */
/**
 * Une durée en clair : « 18 ans 6 mois », « 8 mois », « atteint ».
 *
 * ⚠️ **Les années **et** les mois, contrairement à `echeanceEnClair`.** Celle-ci arrondit à
 * l'année parce qu'elle exprime une échéance lointaine et vague ; celle-ci exprime le temps
 * qui reste *au rythme actuel*, qui est le résultat d'un calcul et non un horizon choisi.
 * Arrondir « 18 ans 6 mois » à « 19 ans » y jetterait la moitié de la précision disponible,
 * et sur un plafond de versements — une simple division — toute la précision.
 */
export function dureeEnClair(mois: number | null | undefined): string | null {
  if (mois == null || !Number.isFinite(mois)) return null;
  if (mois <= 0) return "atteint";
  if (mois < 12) return `${mois} mois`;
  const ans = Math.floor(mois / 12);
  const reste = mois % 12;
  const partAns = `${ans} an${ans > 1 ? "s" : ""}`;
  return reste === 0 ? partAns : `${partAns} ${reste} mois`;
}

/**
 * Le mois où l'on sera dans `mois` mois, en clair : « mars 2041 ».
 *
 * ⚠️ Le **mois** et pas seulement l'année. Pour un plafond de versements, la réponse est une
 * date précise — c'est une division, pas une projection de marché — et n'afficher que
 * « 2041 » jetterait onze mois de précision que le calcul possède réellement.
 */
export function moisEnClair(mois: number, depuis?: Date): string {
  const d = depuis ? new Date(depuis) : new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + mois);
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

/**
 * Les constats d'un objectif de plafond de versements.
 *
 * ⚠️ **Aucun de ces constats ne parle de performance, et c'est délibéré.** Un plafond de
 * versements ne se remplit qu'avec de l'argent apporté : mentionner le rendement, la
 * trajectoire médiane ou le pouvoir d'achat laisserait croire que les marchés en rapprochent
 * ou en éloignent. Ils n'y changent rien.
 */
function constatsPlafond(o: Objectif): string[] {
  const sortie: string[] = [];
  const verse = o.verse_retenu ?? o.montant_actuel;
  const plafond = o.capital_requis ?? o.cible;

  if (verse != null && plafond != null) {
    const reste = plafond - verse;
    sortie.push(reste > 0
      ? `Il reste ${euros(reste)} à verser avant le plafond de ${euros(plafond)}.`
      : `Le plafond est atteint : ${euros(verse)} versés sur ${euros(plafond)}.`);
  }

  if (o.mois_pour_atteindre != null && o.mois_pour_atteindre > 0 && o.versement_mensuel) {
    const ans = Math.floor(o.mois_pour_atteindre / 12);
    const duree = ans >= 1
      ? `dans ${ans} an${ans > 1 ? "s" : ""} et ${o.mois_pour_atteindre % 12} mois`
      : `dans ${o.mois_pour_atteindre} mois`;
    sortie.push(`À ${euros(o.versement_mensuel)} par mois, le plafond serait atteint en `
      + `${moisEnClair(o.mois_pour_atteindre)} — ${duree}.`);
  } else if (o.mois_pour_atteindre == null && !o.atteint) {
    // ⚠️ La cause plutôt que « jamais » : sans rythme de versement, la question n'a pas de
    // réponse, ce qui n'est pas la même chose qu'une réponse négative.
    sortie.push("Sans versement mensuel renseigné, aucune date ne peut être calculée.");
  }

  // ⚠️ **« Les plus-values ne consomment pas ce plafond » a été retirée d'ici.** C'était une
  // explication, non un constat : elle ne dépendait d'aucun chiffre et se répétait à
  // l'identique à chaque affichage — la définition du bruit sur un panneau qu'on consulte
  // souvent. Elle n'est pas perdue : le formulaire la donne au moment où l'on choisit cette
  // sorte d'objectif, c'est-à-dire là où elle s'apprend, et la carte dit « versés » sous son
  // montant.

  // ⚠️ L'écart entre le relevé et les transactions saisies est un signal, pas un détail. Un
  // cumul déclaré très supérieur au net des transactions veut dire qu'il manque des
  // écritures — et l'avancement de tous les autres objectifs est alors faux lui aussi.
  if (o.verse_deja != null && o.verse_mesure != null
      && Math.abs(o.verse_deja - o.verse_mesure) > Math.max(50, o.verse_deja * 0.05)) {
    sortie.push(`Vos transactions saisies totalisent ${euros(o.verse_mesure)}, contre `
      + `${euros(o.verse_deja)} déclarés : il manque probablement des transactions.`);
  }

  return sortie;
}

/**
 * Une sensibilité mise en phrase, au conditionnel.
 *
 * ⚠️ **Le conditionnel n'est pas une précaution de style, c'est le fond.** « À 400 € par
 * mois, la cible reculerait de douze ans » informe ; « versez 800 € » prescrirait. Les deux
 * portent le même calcul et n'ont pas le même statut — le premier laisse la décision à
 * l'épargnant, le second la prend pour lui.
 *
 * ⚠️ Rend `null` quand l'écart est nul : « la cible reculerait de zéro mois » n'apprend rien
 * et occupe une ligne d'un panneau qui en compte cinq.
 */
export function phraseSensibilite(s: Sensibilite, actuel: number | null): string | null {
  if (s.mois == null) {
    return s.quoi === "versement"
      ? `À ${euros(s.versement)} par mois, la cible ne serait plus atteignable.`
      : `Avec un point de rendement en moins (${pourcent(s.taux, 1)} %), la cible ne serait `
        + "plus atteignable.";
  }
  if (s.ecart_mois == null || s.ecart_mois === 0) return null;
  const duree = dureeEnClair(Math.abs(s.ecart_mois));
  if (!duree) return null;
  const sens = s.ecart_mois > 0 ? `reculerait de ${duree}` : `avancerait de ${duree}`;
  if (s.quoi === "rendement") {
    return `Avec un point de rendement en moins (${pourcent(s.taux, 1)} %), la cible ${sens}.`;
  }
  // Le repère « moitié » ou « double » se lit plus vite que le montant seul.
  //
  // ⚠️ Entre parenthèses et non entre tirets. Vu à l'écran : « À 400 € par mois — la moitié
  // de votre rythme, la cible reculerait… » ouvre une incise que la virgule ne referme pas,
  // et la phrase se lit de travers. Une incise au tiret réclame son tiret fermant, qui
  // tomberait juste avant une virgule — deux ponctuations pour rien.
  const repere = actuel && actuel > 0
    ? (s.versement < actuel ? " (la moitié de votre rythme)" : " (le double)")
    : "";
  return `À ${euros(s.versement)} par mois${repere}, la cible ${sens}.`;
}

/**
 * Les deux variantes de versement, réunies en une phrase comparative.
 *
 * ⚠️ **Une ligne et non deux.** « À 400 € par mois, la cible reculerait de 9 ans » suivie de
 * « À 1 600 € par mois, la cible avancerait de 8 ans » sont deux phrases de même forme, que
 * le lecteur doit rapprocher lui-même pour en tirer l'encadrement. Réunies, l'encadrement est
 * donné : on lit l'effet d'un rythme deux fois moindre et deux fois plus fort d'un seul coup.
 *
 * Retombe sur la phrase unitaire s'il n'y en a qu'une, et rend `null` s'il n'y en a aucune.
 */
export function phraseVersements(
  liste: Sensibilite[], actuel: number | null,
): string | null {
  const utiles = liste.filter(s => s.mois == null || (s.ecart_mois ?? 0) !== 0);
  if (utiles.length === 0) return null;
  if (utiles.length === 1) return phraseSensibilite(utiles[0], actuel);

  const [bas, haut] = [...utiles].sort((a, b) => a.versement - b.versement);
  const partie = (s: Sensibilite): string => {
    if (s.mois == null) return "elle ne serait plus atteignable";
    const d = dureeEnClair(Math.abs(s.ecart_mois ?? 0));
    return (s.ecart_mois ?? 0) > 0 ? `elle reculerait de ${d}` : `elle avancerait de ${d}`;
  };
  return `À ${euros(bas.versement)} par mois, ${partie(bas)} ; `
    + `à ${euros(haut.versement)}, ${partie(haut)}.`;
}

/**
 * Ce que l'écran montre déjà ailleurs, et qu'il ne faut donc pas redire ici.
 *
 * ⚠️ **La critique qui a fait réécrire ce panneau.** Il alignait « Il manque 1 247 738 € »
 * quand la carte affiche « 2 282 € / 1 250 000 € », et « la cible serait atteinte en 2059
 * (15 ans de retard) » quand la même carte porte « reste 33 ans » et l'étiquette « 15 ans de
 * retard ». C'était de la reformulation, pas de l'interprétation : le lecteur relisait ce
 * qu'il venait de voir. Le critère est désormais celui de `score/insights.py` — chiffrer une
 * **conséquence** que rien d'autre ne calcule, et citer la mesure qui la fonde.
 *
 * Sont donc partis d'ici : le montant manquant (la carte donne les deux termes), la date au
 * rythme actuel (la carte donne la durée restante et l'écart à l'échéance), et la lecture en
 * euros constants (le panneau de projection la porte sous sa médiane).
 */

/**
 * Des interprétations chiffrées sur l'objectif projeté — jamais des conseils.
 *
 * ⚠️ **Ce panneau occupe l'emplacement des « Recommandations IA » de la maquette**, qui
 * proposait « augmenter votre investissement mensuel à 1 000 € ». C'est du conseil en
 * investissement personnalisé, que ce logiciel ne produit pas. Ce qui suit est arithmétique,
 * et chaque ligne se recompte à la main.
 *
 * ⚠️ **Trois lignes au plus, et chacune doit apprendre quelque chose.** Le nombre n'est pas
 * une contrainte de place : au-delà, plus rien n'est lu, et une ligne de trop dévalue les
 * autres. Les candidates sont classées par ce qu'elles apportent, non par l'ordre du calcul.
 */
export function observations(
  o: Objectif, valeurPortefeuille?: number | null,
  medianeProjection?: number | null, autres?: Objectif[],
): string[] {
  // ⚠️ **La médiane vient de la projection quand elle existe, et c'est un correctif.**
  // Vu à l'écran : le panneau de projection annonçait 373 261 € — la médiane des tirages —
  // tandis que le constat parlait de 362 986 €, la capitalisation déterministe. Deux
  // calculs de la même grandeur, à dix centimètres l'un de l'autre, tous deux justes et
  // dont l'écart de 2,8 % ne se justifie par rien aux yeux du lecteur.
  const mediane = medianeProjection ?? o.valeur_projetee;
  const sortie: string[] = [];
  const requis = o.capital_requis;

  // ── 1. Le rythme qu'exigerait l'échéance ──────────────────────────────────
  //
  // La ligne la plus utile du panneau, et la seule à répondre « pour y être à la date
  // voulue, quel rythme ? ». Elle est en tête parce que c'est la question qu'on se pose
  // devant une échéance qu'on ne tient pas.
  if (o.versement_requis != null && o.versement_requis > 0 && o.echeance_annee) {
    const rapport = o.versement_mensuel && o.versement_mensuel > 0
      ? o.versement_requis / o.versement_mensuel : null;
    const compare = rapport == null ? ""
      : rapport >= 1.05
        ? `, soit ${pourcent(rapport, 1)} fois votre rythme actuel`
        : rapport <= 0.95
          ? `, soit moins que votre rythme actuel`
          : `, soit votre rythme actuel`;
    sortie.push(`Tenir ${o.echeance_annee} demanderait ${euros(o.versement_requis)} `
      + `par mois${compare}.`);
  }

  // ── 2. Ce qu'il manquerait à l'échéance ───────────────────────────────────
  //
  // Une conséquence, non une mesure : l'écran montre la médiane et la cible, pas leur
  // différence à la date choisie.
  if (mediane != null && requis != null && o.mois_restants) {
    const ecart = mediane - requis;
    sortie.push(ecart >= 0
      ? `À l’échéance, la trajectoire médiane dépasse la cible de ${euros(ecart)}.`
      : `À l’échéance, la trajectoire médiane reste ${euros(-ecart)} sous la cible.`);
  }

  // ── 3. Lequel des deux leviers pèse le plus ───────────────────────────────
  const levier = phraseLevier(o);
  if (levier) sortie.push(levier);

  // ── Ce que le plafond implique pour les autres objectifs ───────────────────
  const croise = phraseCroisee(o, autres);
  if (croise) sortie.push(croise);

  // ── La plus-value qui n'entame pas le plafond, chiffrée ────────────────────
  const gain = phraseGainHorsPlafond(o, valeurPortefeuille);
  if (gain) sortie.push(gain);

  // ⚠️ **Un repli, et un seul.** Sans échéance ni rendement, aucune des interprétations
  // ci-dessus n'existe, et un panneau vide n'aide personne. Le montant restant est alors dit
  // — c'est une soustraction que la carte laisse faire, donc le plus faible des constats,
  // mais il vaut mieux que le silence.
  if (sortie.length === 0 && requis != null && o.montant_actuel != null
      && o.montant_actuel < requis) {
    sortie.push(o.sur_versements
      ? `Il reste ${euros(requis - o.montant_actuel)} à verser avant le plafond de `
        + `${euros(requis)}.`
      : `Il manque ${euros(requis - o.montant_actuel)} pour atteindre la cible.`);
  }

  // ⚠️ L'écart entre le relevé et les transactions saisies est un signal, pas un détail : un
  // cumul déclaré très supérieur au net des transactions veut dire qu'il manque des
  // écritures — et l'avancement de tous les autres objectifs est alors faux lui aussi.
  if (o.sur_versements && o.verse_deja != null && o.verse_mesure != null
      && Math.abs(o.verse_deja - o.verse_mesure) > Math.max(50, o.verse_deja * 0.05)) {
    sortie.push(`Vos transactions saisies totalisent ${euros(o.verse_mesure)}, contre `
      + `${euros(o.verse_deja)} déclarés : il manque probablement des transactions.`);
  }

  return sortie;
}

/**
 * Lequel du rythme ou du rendement pèse le plus sur la date d'atteinte.
 *
 * ⚠️ **C'est une interprétation, et c'est ce qui manquait au panneau.** Les deux
 * sensibilités brutes disaient « doubler avance de 8 ans » et « un point de rendement en
 * moins recule de 3 ans » ; les mettre en regard dit *lequel des deux leviers commande*, ce
 * que le lecteur devait déduire seul. Rien n'est prescrit : on ne dit pas d'actionner le
 * levier, on dit lequel bouge le résultat.
 */
/** Vrai quand cette variante est au-dessus du rythme actuel — la hypothèse « et si plus ? ». */
function actuelSuperieur(s: Sensibilite, o: Objectif): boolean {
  return o.versement_mensuel != null && s.versement > o.versement_mensuel;
}

export function phraseLevier(o: Objectif): string | null {
  const versements = (o.sensibilites ?? [])
    .filter(s => s.quoi === "versement" && s.mois != null && s.ecart_mois != null);
  const rendement = (o.sensibilites ?? [])
    .find(s => s.quoi === "rendement" && s.mois != null && s.ecart_mois != null);
  if (!rendement || versements.length === 0) return null;

  // ⚠️ **La variante à la hausse est préférée, quand elle existe.** Mon premier jet prenait
  // celle des deux qui bouge le plus, et citait donc la baisse — 109 mois contre 101 : la
  // phrase démontrait que le rythme commande en montrant ce qu'on perd, là où la question
  // que l'on se pose est ce qu'on gagne. Les deux prouvent la même chose ; l'une se lit.
  const fort = versements.find(v => actuelSuperieur(v, o)) ?? versements[0];
  const parVersement = Math.abs(fort.ecart_mois!);
  const parRendement = Math.abs(rendement.ecart_mois!);
  const dv = dureeEnClair(parVersement);
  const dr = dureeEnClair(parRendement);
  if (!dv || !dr) return null;

  const tete = parVersement > parRendement
    ? "Le rythme pèse plus que le rendement ici"
    : "Le rendement pèse plus que le rythme ici";
  // ⚠️ « déplace » et non « avance » ou « recule » : on compare deux **amplitudes**, l'une
  // vers le haut et l'autre vers le bas. Un verbe orienté ferait croire que les deux vont
  // dans le même sens.
  const levier = actuelSuperieur(fort, o)
    ? "doubler vos versements"
    : `passer à ${euros(fort.versement)} par mois`;
  return `${tete} : ${levier} déplace la cible de ${dv}, `
    + `un point de rendement de ${dr}.`;
}

/**
 * La plus-value qui ne consomme pas le plafond, en euros.
 *
 * ⚠️ **La version chiffrée d'une explication que j'avais d'abord écrite, puis retirée.** Le
 * panneau portait « les plus-values ne consomment pas ce plafond : seuls vos versements le
 * remplissent » — vrai, important, et pourtant du décor : la phrase ne dépendait d'aucune
 * donnée et se répétait à l'identique. Ici la même idée porte trois chiffres du portefeuille,
 * et elle grandit avec lui : cinq cents euros de plus-value aujourd'hui, cent vingt mille
 * dans vingt ans. C'est le critère de `score/insights.py` — chiffrer, et citer la mesure.
 *
 * ⚠️ Seuil sur la **part** et non sur le montant seul : cinquante euros de gain sur cinq
 * mille versés est du bruit de marché, la même somme sur trois cents versés est un fait.
 */
export function phraseGainHorsPlafond(
  o: Objectif, valeurPortefeuille?: number | null,
): string | null {
  if (!o.sur_versements) return null;
  const verse = o.verse_retenu ?? o.montant_actuel;
  if (verse == null || verse <= 0 || valeurPortefeuille == null) return null;
  const gain = valeurPortefeuille - verse;
  if (gain <= 0 || gain / verse < 0.02) return null;
  return `Vos ${euros(verse)} versés valent ${euros(valeurPortefeuille)} aujourd’hui — `
    + `${euros(gain)} de plus-value, qui n’entament pas le plafond.`;
}

/**
 * Ce qu'un plafond de versements implique pour les autres objectifs du portefeuille.
 *
 * ⚠️ **La seule interprétation qui demande de regarder au-delà d'un objectif**, et la plus
 * utile sur un plafond : une enveloppe qui sature avant que les objectifs qu'elle finance
 * n'aboutissent est un fait qu'aucune carte ne montre, puisqu'il naît de la rencontre de
 * deux d'entre elles.
 *
 * ⚠️ Aucune conclusion n'est tirée. On date les deux échéances et on donne l'écart ;
 * « il faudra ouvrir une autre enveloppe » serait un conseil, et n'apparaît pas.
 */
export function phraseCroisee(o: Objectif, autres?: Objectif[]): string | null {
  if (!o.sur_versements || o.mois_pour_atteindre == null || o.mois_pour_atteindre <= 0) {
    return null;
  }
  const candidats = (autres ?? []).filter(a => a.id !== o.id && !a.sur_versements);

  // ⚠️ **Une échéance choisie passe devant un horizon projeté, et l'écart de solidité est
  // grand.** Vu à l'écran : la phrase se comparait à « Liberté financière », dont les 48 ans
  // ne sont pas une date mais le résultat d'une division par 400 € de versement mensuel —
  // un chiffre qui bouge si l'épargnant change d'avis. Une année saisie, elle, est un
  // engagement : c'est à elle qu'une date de saturation mérite d'être comparée.
  const dates = candidats
    .filter(a => a.echeance_annee != null && a.mois_restants != null)
    .sort((a, b) => b.mois_restants! - a.mois_restants!);
  const projetes = candidats
    .filter(a => a.mois_pour_atteindre != null)
    .sort((a, b) => b.mois_pour_atteindre! - a.mois_pour_atteindre!);

  const cible = dates[0] ?? projetes[0];
  if (!cible) return null;
  const surEcheance = dates.length > 0;
  const horizon = surEcheance ? cible.mois_restants! : cible.mois_pour_atteindre!;

  const ecart = horizon - o.mois_pour_atteindre;
  // Sous un an d'écart, les deux dates se confondent et la phrase n'apprend rien.
  if (Math.abs(ecart) < 12) return null;
  const duree = dureeEnClair(Math.abs(ecart));
  if (!duree) return null;

  const repere = surEcheance
    ? `l’échéance de « ${cible.nom} » (${cible.echeance_annee})`
    : `que « ${cible.nom} » n’aboutisse au rythme actuel`;
  const quand = moisEnClair(o.mois_pour_atteindre);
  return ecart > 0
    ? `Le plafond serait atteint en ${quand}, ${duree} avant ${repere}.`
    : `Le plafond serait atteint en ${quand}, ${duree} après ${
      surEcheance ? repere : `que « ${cible.nom} » aboutisse au rythme actuel`}.`;
}

/**
 * Un pourcentage d'avancement, lisible même quand il est minuscule.
 *
 * ⚠️ **« 0 % » et « moins de 1 % » ne disent pas la même chose.** Constaté à l'écran :
 * 4 545 € contre une somme de cibles de 3 050 000 € font 0,11 %, arrondis à « 0 % » —
 * indiscernable d'un objectif auquel on n'a rien affecté, alors qu'un versement a bien
 * commencé. Au-delà de 99,5 %, symétriquement, « 100 % » laisserait croire l'objectif
 * atteint alors qu'il reste quelques euros.
 */
export function pourcentageLisible(part: number): string {
  if (part > 0 && part < 0.5) return "< 1 %";
  if (part >= 99.5 && part < 100) return "> 99 %";
  return `${Math.round(part)} %`;
}

/**
 * Un taux en pourcentage, à la française.
 *
 * ⚠️ **Virgule décimale.** Les taux venaient du serveur en nombres et étaient interpolés
 * tels quels : l'écran affichait « 17.9 % », « 7.47 %/an », « 18.08 % par an » — un point
 * décimal au milieu d'une interface entièrement en français, où les montants sont pourtant
 * formatés correctement. Le défaut est petit et partout à la fois, donc il se corrige à un
 * seul endroit.
 */
export function pourcent(v: number | null | undefined, decimales = 2): string {
  // ⚠️ **Tolérant à l'absence, et ce garde vient d'un écran blanc.** Le formulaire tenait
  // une réponse d'API antérieure à l'ajout d'un champ ; `pourcent(undefined)` a levé sur
  // `toLocaleString` et fait tomber **toute la page** derrière une erreur globale. C'est
  // ce qui arrive à chaque déploiement, quand un client garde en mémoire une réponse de la
  // version précédente. Un formateur ne doit pas pouvoir emporter une application : il
  // rend un tiret et laisse le reste s'afficher.
  //
  // ⚠️ Et la leçon est plus large : mon type TypeScript **affirmait** que le champ était
  // un nombre. Un type sur une réponse d'API est une déclaration sur une donnée qu'on ne
  // maîtrise pas, pas une vérification.
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 0,
                                     maximumFractionDigits: decimales });
}
