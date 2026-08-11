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

  // ⚠️ Le fait qui distingue ce plafond de tous les autres chiffres de l'écran. Sans cette
  // phrase, un épargnant voyant son PEA valoir plus que ses versements pourrait croire qu'il
  // approche de la limite, alors que la performance ne l'entame pas.
  sortie.push("Les plus-values ne consomment pas ce plafond : seuls vos versements le "
    + "remplissent.");

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

export function observations(
  o: Objectif, valeurPortefeuille?: number | null,
  medianeProjection?: number | null,
): string[] {
  // ⚠️ Un aiguillage, et non des conditions ajoutées au fil du texte : les constats de
  // capital parlent de patrimoine, de trajectoire médiane et de pouvoir d'achat, trois
  // notions qui n'ont aucun sens pour un cumul de versements.
  if (o.sur_versements) return constatsPlafond(o);

  // ⚠️ **La médiane vient de la projection quand elle existe, et c'est un correctif.**
  // Vu à l'écran : le panneau de projection annonçait 373 261 € — la médiane des tirages —
  // tandis que le constat parlait de 362 986 €, la capitalisation déterministe. Deux
  // calculs de la même grandeur, à dix centimètres l'un de l'autre, tous deux justes et
  // dont l'écart de 2,8 % ne se justifie par rien aux yeux du lecteur. Les tests
  // garantissaient qu'ils se rejoignent à 5 % près ; ils ne garantissaient pas qu'on
  // n'affiche pas les deux.
  const mediane = medianeProjection ?? o.valeur_projetee;
  const sortie: string[] = [];
  const requis = o.capital_requis;

  if (requis != null && o.montant_actuel != null && o.montant_actuel < requis) {
    sortie.push(`Il manque ${euros(requis - o.montant_actuel)} pour atteindre la cible.`);
  }

  if (requis != null && valeurPortefeuille != null && valeurPortefeuille > 0) {
    const fois = requis / valeurPortefeuille;
    sortie.push(fois >= 1.05
      ? `La cible représente ${fois.toFixed(1)} fois votre patrimoine actuel.`
      : `La cible est du même ordre que votre patrimoine actuel.`);
  }

  // Le rythme, comparé à l'échéance : une soustraction de mois, pas une consigne.
  const rythme = ecartAuRythme(o);
  if (rythme && o.mois_pour_atteindre != null) {
    const annee = new Date().getFullYear()
      + Math.floor((new Date().getMonth() + o.mois_pour_atteindre) / 12);
    sortie.push(`Au rythme actuel — ${o.versement_mensuel ? euros(o.versement_mensuel) : "0 €"} `
      + `par mois — la cible serait atteinte en ${annee} (${rythme.texte}).`);
  }

  if (mediane != null && requis != null && o.mois_restants) {
    const ecart = mediane - requis;
    sortie.push(ecart >= 0
      ? `À l’échéance, la trajectoire médiane dépasse la cible de ${euros(ecart)}.`
      : `À l’échéance, la trajectoire médiane reste ${euros(-ecart)} sous la cible.`);
  }

  // ⚠️ Le pouvoir d'achat se recalcule sur la médiane affichée, et non sur la valeur
  // déterministe du serveur : sinon la phrase citerait un montant qui n'apparaît nulle
  // part ailleurs à l'écran.
  if (mediane != null && o.inflation != null && o.mois_restants) {
    const constants = mediane / (1 + o.inflation / 100) ** (o.mois_restants / 12);
    if (mediane - constants > 0) {
      sortie.push(`À ${o.inflation} % d’inflation, ces ${euros(mediane)} `
        + `vaudront ${euros(constants)} d’aujourd’hui.`);
    }
  }

  return sortie;
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
