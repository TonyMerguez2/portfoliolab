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

export type Genre = "capital" | "capital_age" | "achat" | "revenu_mensuel";

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
  ecartes: number;
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
  let total = 0, actuel = 0, comptes = 0, ecartes = 0;
  for (const o of objectifs) {
    if (o.capital_requis == null || o.montant_actuel == null) { ecartes += 1; continue; }
    total += o.capital_requis;
    actuel += o.montant_actuel;
    comptes += 1;
  }
  const part = total > 0 ? Math.min(100, (actuel / total) * 100) : 0;
  return { total, actuel, reste: Math.max(0, total - actuel), part, comptes, ecartes };
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
export function observations(
  o: Objectif, valeurPortefeuille?: number | null,
): string[] {
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

  if (o.valeur_projetee != null && requis != null && o.mois_restants) {
    const ecart = o.valeur_projetee - requis;
    sortie.push(ecart >= 0
      ? `À l’échéance, la trajectoire médiane dépasse la cible de ${euros(ecart)}.`
      : `À l’échéance, la trajectoire médiane reste ${euros(-ecart)} sous la cible.`);
  }

  if (o.projetee_en_euros_constants != null && o.valeur_projetee != null
      && o.inflation != null) {
    const perte = o.valeur_projetee - o.projetee_en_euros_constants;
    if (perte > 0) {
      sortie.push(`À ${o.inflation} % d’inflation, ces ${euros(o.valeur_projetee)} `
        + `vaudront ${euros(o.projetee_en_euros_constants)} d’aujourd’hui.`);
    }
  }

  return sortie;
}
