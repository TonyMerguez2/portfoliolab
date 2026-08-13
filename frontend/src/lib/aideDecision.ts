/**
 * L'aide à la décision : une couche d'interprétation posée sur les calculs de NOVAC.
 *
 * ⚠️ **Rien n'est calculé ici.** Toutes les grandeurs arrivent du serveur, où vivent les
 * mathématiques — `mois_pour_atteindre`, `versement_requis`, `taux_implicite`,
 * `part_du_gain`, `scenarios_stress`. Ce module choisit lesquelles méritent une phrase, avec
 * quelle priorité, et dans quel ordre. La frontière est celle du projet depuis le début : le
 * calcul se recompte, la phrase se relit.
 *
 * ⚠️ **Aucune recommandation, et la règle porte sur la forme autant que sur le fond.** On
 * décrit des conséquences — « un versement supplémentaire de 100 € réduirait l'échéance de
 * deux ans » — jamais des consignes. Les formulations évitent le verbe d'action à la deuxième
 * personne plutôt que de le mettre au conditionnel : une phrase sans sujet à qui s'adresser ne
 * peut pas glisser vers l'impératif au fil d'une réécriture. Un test le garde.
 *
 * ⚠️ **Aucun modèle de langage n'intervient.** La reformulation par un modèle est prévue comme
 * une étape *ultérieure* et strictement cosmétique : elle recevrait ces objets déjà remplis et
 * n'aurait droit qu'à en réécrire `titre` et `description`. Tant qu'elle n'existe pas, le mot
 * « IA » n'apparaît nulle part à l'écran — l'y écrire serait une affirmation fausse sur la
 * provenance des chiffres.
 */

import {
  dureeEnClair, euros, moisEnClair, pourcent, pourcentageLisible, type Objectif,
} from "./objectifs";

/** Ce dont parle un insight. Sert au classement autant qu'à la lecture. */
export type FamilleInsight =
  | "calendrier"        // avance, retard, date d'atteinte
  | "versement"         // le rythme qu'exigerait l'échéance
  | "pas_marginal"      // ce que cent euros de plus par mois déplacent
  | "rendement_requis"  // le rendement qu'il faudrait, et sa vraisemblance
  | "inflation"         // le pouvoir d'achat de la cible
  | "affectation"       // la part du portefeuille destinée à l'objectif
  | "risque"            // horizon contre volatilité
  | "stress"            // ce qu'une secousse ferait
  | "chevauchement"     // plusieurs objectifs sur le même euro
  | "jalon";            // où l'on en est

/**
 * L'urgence de lecture.
 *
 * ⚠️ `critique` est réservé à ce qui rend l'objectif intenable ou fausse un autre chiffre de
 * l'écran. En mettre partout revient à n'en mettre nulle part.
 */
export type Priorite = "positive" | "info" | "warning" | "critique";

/**
 * Le fait dont l'insight parle, par-delà sa famille.
 *
 * ⚠️ **Trois familles peuvent décrire la même chose.** Sur un objectif en retard, « l'échéance
 * ne serait pas tenue », « le rythme requis dépasse le vôtre » et « l'objectif suppose un
 * rendement hors de portée » sont trois angles d'un seul fait : la trajectoire ne mène pas à la
 * cible. Le classement par famille ne le voyait pas — chacune est distincte — et la carte
 * affichait donc quatre fois la même mauvaise nouvelle sous quatre formulations. Le sujet est ce
 * qui permet d'en garder deux et de laisser la place à ce qui dit autre chose.
 */
export type Sujet = "hors_trajectoire" | "sur_trajectoire" | "portefeuille";

export type Insight = {
  id: string;
  famille: FamilleInsight;
  /** `undefined` quand l'insight ne partage son fait avec aucun autre. */
  sujet?: Sujet;
  priorite: Priorite;
  /** Une phrase courte, qui tient sur une ligne. */
  titre: string;
  /** Le détail chiffré, deux phrases au plus. */
  description: string;
  /** Le chiffre à mettre en avant, quand il y en a un qui résume l'insight. */
  metrique?: { libelle: string; valeur: string };
  /**
   * De 0 à 1. Ce n'est pas une probabilité : c'est la complétude des données qui fondent
   * l'insight — voir `confiance`.
   */
  confiance: number;
  /** Les raisons de cette confiance, pour que le chiffre ne soit pas un décret. */
  motifs: string[];
  /** Les hypothèses employées, telles qu'elles s'affichent sous la phrase. */
  hypotheses: string[];
  /** Les autres objectifs qu'un insight met en cause. */
  objectifsLies?: string[];
};

/** Ce que l'écran sait du portefeuille au moment de l'interprétation. */
export type Contexte = {
  valeurPortefeuille?: number | null;
  /** La somme des parts affectées, non normalisée — voir `alerteRepartition`. */
  sommeDesParts?: number | null;
  autres?: Objectif[];
  /** La volatilité annualisée mesurée, en pourcentage. */
  volatilite?: number | null;
  /** « mesuree », « echantillon_court », « indisponible » ou « sans_objet ». */
  volatiliteSource?: string | null;
  seancesMesurees?: number | null;
  /** La médiane des tirages, pour que deux panneaux ne citent pas deux nombres. */
  mediane?: number | null;
  /** Le pire recul du backtest de l'allocation, en pourcentage négatif. */
  pireRecul?: number | null;
};

// ── Confiance ────────────────────────────────────────────────────────────────

/**
 * La confiance d'un insight, et ses motifs.
 *
 * ⚠️ **Ce n'est pas une probabilité de réalisation**, et le confondre serait grave : un
 * insight peut être calculé sur des données parfaites et décrire un avenir très incertain.
 * Ce nombre dit seulement à quel point les *entrées* sont complètes — historique mesuré ou
 * remplacé, hypothèses saisies ou absentes. Le libellé à l'écran l'exprime en mots plutôt
 * qu'en pourcentage, pour la même raison.
 */
export function confiance(
  o: Objectif, c: Contexte, besoins: { volatilite?: boolean } = {},
): { valeur: number; motifs: string[] } {
  let valeur = 1;
  const motifs: string[] = [];

  if (o.taux_attendu != null) {
    motifs.push("rendement attendu renseigné");
  } else {
    valeur -= 0.25;
    motifs.push("aucun rendement attendu");
  }

  if (o.mois_restants != null) {
    motifs.push("échéance datée");
  } else {
    valeur -= 0.15;
    motifs.push("objectif sans échéance");
  }

  if (besoins.volatilite) {
    if (c.volatiliteSource === "mesuree") {
      motifs.push(`volatilité mesurée sur ${c.seancesMesurees ?? "?"} séances`);
    } else if (c.volatiliteSource === "echantillon_court") {
      valeur -= 0.3;
      motifs.push("historique trop court pour mesurer la volatilité");
    } else {
      valeur -= 0.35;
      motifs.push("volatilité non mesurable");
    }
  }

  if (c.valeurPortefeuille == null) {
    valeur -= 0.2;
    motifs.push("valeur du portefeuille indisponible");
  }

  return { valeur: Math.max(0.1, Math.min(1, Number(valeur.toFixed(2)))), motifs };
}

/** La confiance en mots. Un pourcentage inviterait à la lire comme une probabilité. */
export function confianceEnClair(valeur: number): string {
  if (valeur >= 0.85) return "Confiance élevée";
  if (valeur >= 0.6) return "Confiance moyenne";
  return "Estimation indicative";
}

// ── Le chiffre fort, coupé ───────────────────────────────────────────────────

/**
 * Le chiffre fort d'un insight, séparé en ce qui porte le sens et ce qui le qualifie.
 *
 * « 14 ans 8 mois » se lit d'un coup si les mois cèdent le pas aux années ; à la même
 * taille, les deux nombres se disputent l'œil et la ligne enroule pour rien. Deux formes
 * seulement sont reconnues, et ce sont celles que produit le moteur :
 *
 * - une durée composée — « 14 ans 8 mois » → « 14 ans » et « 8 mois » ;
 * - un rythme — « 6 301 € / mois », « 18,5 % / an » → le montant, puis « / mois ».
 *
 * ⚠️ **Tout le reste ressort entier, et c'est le comportement voulu.** « 6 mois » seul,
 * « 60 % », « 600 000 € », « atteint » : là, l'unité *est* le sens, et la rapetisser
 * effacerait ce que le nombre mesure. Une règle qui rétrécirait toute occurrence du mot
 * « mois » ferait exactement cette faute.
 *
 * ⚠️ Découper une chaîne d'affichage est fragile par nature — la parade propre serait une
 * métrique structurée à la source. Elle ne vaut pas ici le remaniement de vingt-trois points
 * d'appel : chacune des deux formes naît d'un seul endroit, et un test les couvre. Si une
 * troisième apparaît, elle passera *entière* — un échec lisible, et non une coupe fautive.
 */
/**
 * Ce qui distingue les découpes entre elles.
 *
 * ⚠️ **Le genre existe pour la taille, pas pour le sens.** Une durée composée porte deux
 * membres, donc deux fois plus de signes : elle doit rétrécir pour ne pas écraser le
 * paragraphe voisin. Une unité en symbole n'ajoute qu'un caractère et ne coûte rien. Sans
 * cette distinction, détacher le « % » de « 93 % » aurait rapetissé le nombre lui-même,
 * ce qui est l'exact contraire de ce qu'on cherche.
 */
export type GenreMetrique = "duree" | "rythme" | "unite" | "entier";

export function couperMetrique(
  valeur: string,
): { fort: string; discret: string | null; genre: GenreMetrique } {
  // ⚠️ `\s` couvre l'espace fine insécable U+202F que `Intl.NumberFormat("fr-FR")` place
  // dans « 6 301 € ». Un espace littéral ne l'attraperait pas, et le rythme ressortirait
  // entier sans que rien ne le signale — le piège de cette base de code, quatre fois déjà.
  const duree = valeur.match(/^(\d+\s*ans?)\s+(\d+\s*mois)$/);
  if (duree) return { fort: duree[1], discret: duree[2], genre: "duree" };

  const rythme = valeur.match(/^(.+?)\s*\/\s*(mois|an)$/);
  if (rythme) return { fort: rythme[1], discret: `/ ${rythme[2]}`, genre: "rythme" };

  /**
   * ⚠️ **Un symbole n'est pas un mot, et la règle a dû se nuancer là-dessus.** Elle
   * refusait de détacher toute unité, au motif que rapetisser « mois » dans « 6 mois »
   * laisserait un « 6 » de trente pixels ne voulant rien dire. C'est vrai d'un mot, qui
   * doit être lu pour que le nombre ait un sens. Ce ne l'est pas d'un symbole : « 93 »
   * suivi d'un « % » plus petit se lit toujours quatre-vingt-treize pour cent, parce que
   * le signe se reconnaît d'un coup d'œil au lieu de se lire. Signalé à l'usage, et
   * conforme à la maquette, où le pourcentage est plus menu que son nombre.
   *
   * ⚠️ **Le pourcentage seulement, et une espace ordinaire seulement.** L'euro s'y prêtait
   * autant, et il a fallu y renoncer : `euros()` place une **espace fine insécable** avant
   * son symbole, que la recomposition de la coupe remplacerait par une espace ordinaire.
   * C'est exactement la faute que le garde-fou du moteur redoute — une coupe qui perd un
   * caractère invisible. Le moteur, lui, écrit ses pourcentages avec une espace ordinaire :
   * la coupe s'y recompose au caractère près, et le motif l'exige explicitement plutôt que
   * de tolérer n'importe quel blanc.
   */
  const symbole = valeur.match(/^(.+?) (%)$/);
  if (symbole) return { fort: symbole[1], discret: symbole[2], genre: "unite" };

  return { fort: valeur, discret: null, genre: "entier" };
}

// ── Hypothèses ───────────────────────────────────────────────────────────────

/**
 * Les hypothèses d'un objectif, en clair.
 *
 * ⚠️ Elles accompagnent chaque insight parce qu'un chiffre sans ses entrées n'est pas
 * vérifiable : « atteint en 2043 » ne veut rien dire sans « à 800 €/mois et 7,2 %/an ».
 */
export function hypotheses(o: Objectif): string[] {
  const h: string[] = [];
  if (o.versement_mensuel) h.push(`${euros(o.versement_mensuel)} / mois`);
  if (o.taux_attendu != null) h.push(`${pourcent(o.taux_attendu, 1)} % / an`);
  if (o.inflation != null) h.push(`${pourcent(o.inflation, 1)} % d’inflation`);
  if (o.genre === "revenu_mensuel" && o.taux_retrait != null) {
    h.push(`taux de retrait ${pourcent(o.taux_retrait, 1)} %`);
  }
  if (o.part_affectee != null && o.part_affectee < 100) {
    h.push(`${pourcent(o.part_affectee, 0)} % du portefeuille`);
  }
  return h;
}

// ── Les familles, une fonction chacune ───────────────────────────────────────
//
// ⚠️ Chacune rend `null` dès qu'une de ses entrées manque, plutôt que de se rabattre sur une
// valeur par défaut. Un insight bâti sur un taux que personne n'a choisi se lit comme un fait.

/** Sous cet écart, avance et retard ne se distinguent pas d'un arrondi de calcul. */
const ECART_SIGNIFICATIF_MOIS = 6;

/** Au-delà de cette part de l'horizon, un retard cesse d'être rattrapable par un ajustement. */
const RETARD_CRITIQUE = 0.5;

function calendrier(o: Objectif, c: Contexte): Insight | null {
  const { mois_restants: reste, mois_pour_atteindre: besoin } = o;
  const conf = confiance(o, c);
  const base = { id: `${o.id}:calendrier`, famille: "calendrier" as const,
    confiance: conf.valeur, motifs: conf.motifs, hypotheses: hypotheses(o) };

  // ⚠️ **Sans échéance, cette famille se taît — et j'ai essayé le contraire.** J'avais ajouté
  // « au rythme actuel, la cible tomberait en mars 2051 » pour remplir une place : or la carte
  // de l'objectif affiche déjà « reste 33 ans » juste au-dessus. C'était une reformulation,
  // exactement ce que ce panneau doit éviter. Les quatre places se remplissent sans elle, avec
  // l'inflation sur l'horizon projeté, la part du gain, une secousse et le pas de cent euros —
  // qui, eux, ne se lisent nulle part ailleurs.
  if (reste == null) return null;

  if (besoin == null) {
    return {
      ...base, priorite: "critique",
      titre: "L’échéance ne serait pas tenue", sujet: "hors_trajectoire",
      description: `Au rythme actuel, la cible de ${euros(o.capital_requis ?? o.cible)} `
        + "n’est atteinte à aucun horizon calculable : sans rendement ni versement, aucune "
        + "durée ne convient.",
      metrique: { libelle: "hors de portée", valeur: "—" },
    };
  }
  const ecart = besoin - reste;
  if (Math.abs(ecart) < ECART_SIGNIFICATIF_MOIS) {
    return {
      ...base, priorite: "positive",
      titre: "Votre trajectoire est compatible avec l’échéance", sujet: "sur_trajectoire",
      description: `Au rythme actuel, la cible tomberait en ${moisEnClair(besoin)}, `
        + `soit à moins de six mois de l’échéance de ${o.echeance_annee}.`,
      metrique: { libelle: "écart à l’échéance", valeur: `${Math.abs(ecart)} mois` },
    };
  }
  if (ecart < 0) {
    const duree = dureeEnClair(-ecart);
    return {
      ...base, priorite: "positive",
      titre: "Votre trajectoire est en avance", sujet: "sur_trajectoire",
      description: `Au rythme actuel, la cible de ${euros(o.capital_requis ?? o.cible)} `
        + `pourrait être atteinte en ${moisEnClair(besoin)}, avant l’échéance de `
        + `${o.echeance_annee}.`,
      metrique: { libelle: "d’avance estimée", valeur: duree ?? "—" },
    };
  }
  const duree = dureeEnClair(ecart);
  return {
    ...base,
    priorite: ecart > reste * RETARD_CRITIQUE ? "critique" : "warning",
    titre: "L’échéance ne serait pas tenue au rythme actuel", sujet: "hors_trajectoire",
    description: `La cible tomberait en ${moisEnClair(besoin)}, alors que l’échéance est `
      + `fixée à ${o.echeance_annee}.`,
    metrique: { libelle: "de retard estimé", valeur: duree ?? "—" },
  };
}

/** Au-delà de ce multiple du rythme actuel, l'écart cesse d'être un ajustement. */
const MULTIPLE_NOTABLE = 1.05;

function versement(o: Objectif, c: Contexte): Insight | null {
  if (o.versement_requis == null || o.versement_requis <= 0 || !o.echeance_annee) return null;
  const conf = confiance(o, c);
  const base = { id: `${o.id}:versement`, famille: "versement" as const,
    confiance: conf.valeur, motifs: conf.motifs, hypotheses: hypotheses(o) };
  const actuel = o.versement_mensuel;

  if (!actuel || actuel <= 0) {
    return {
      ...base, priorite: "info",
      titre: "Le rythme requis n’est pas encore renseigné",
      description: `Tenir ${o.echeance_annee} demanderait environ `
        + `${euros(o.versement_requis)} par mois, à titre indicatif.`,
      metrique: { libelle: "rythme requis", valeur: `${euros(o.versement_requis)} / mois` },
    };
  }
  const rapport = o.versement_requis / actuel;
  if (rapport > MULTIPLE_NOTABLE) {
    return {
      ...base, priorite: rapport >= 2 ? "warning" : "info",
      titre: "Le rythme requis dépasse le vôtre", sujet: "hors_trajectoire",
      description: `Tenir ${o.echeance_annee} demanderait environ `
        + `${euros(o.versement_requis)} par mois, soit ${pourcent(rapport, 1)} fois `
        + `les ${euros(actuel)} versés aujourd’hui.`,
      metrique: { libelle: "rythme requis", valeur: `${euros(o.versement_requis)} / mois` },
    };
  }
  const marge = (actuel / o.versement_requis - 1) * 100;
  return {
    ...base, priorite: "positive",
    titre: "Votre rythme dépasse le minimum requis", sujet: "sur_trajectoire",
    description: `Tenir ${o.echeance_annee} demanderait environ `
      + `${euros(o.versement_requis)} par mois ; vous en versez ${euros(actuel)}.`,
    metrique: { libelle: "au-dessus du requis", valeur: `${pourcent(marge, 0)} %` },
  };
}

/** Au-delà de cet écart au rendement supposé, l'objectif repose sur une hypothèse tendue. */
const ECART_RENDEMENT_TENDU = 2;

/** Au-delà de ce rendement annuel, aucune allocation large ne l'a tenu sur longue période. */
const RENDEMENT_INVRAISEMBLABLE = 15;

function rendementRequis(o: Objectif, c: Contexte): Insight | null {
  if (o.rendement_requis == null || o.taux_attendu == null || !o.echeance_annee) return null;
  const conf = confiance(o, c);
  const base = { id: `${o.id}:rendement_requis`, famille: "rendement_requis" as const,
    confiance: conf.valeur, motifs: conf.motifs, hypotheses: hypotheses(o) };
  const requis = o.rendement_requis;
  const ecart = requis - o.taux_attendu;

  if (requis >= RENDEMENT_INVRAISEMBLABLE) {
    return {
      ...base, priorite: "critique",
      titre: "L’objectif suppose un rendement hors de portée", sujet: "hors_trajectoire",
      description: `Atteindre la cible en ${o.echeance_annee} avec vos versements actuels `
        + `demanderait ${pourcent(requis, 1)} % par an. Aucune allocation large n’a tenu ce `
        + "rythme sur une longue période.",
      metrique: { libelle: "rendement requis", valeur: `${pourcent(requis, 1)} % / an` },
    };
  }
  if (ecart > ECART_RENDEMENT_TENDU) {
    return {
      ...base, priorite: "warning",
      titre: "L’objectif suppose plus que votre hypothèse", sujet: "hors_trajectoire",
      description: `Atteindre la cible en ${o.echeance_annee} demanderait `
        + `${pourcent(requis, 1)} % par an, contre ${pourcent(o.taux_attendu, 1)} % retenus `
        + "dans vos paramètres.",
      metrique: { libelle: "rendement requis", valeur: `${pourcent(requis, 1)} % / an` },
    };
  }
  return {
    ...base, priorite: "positive",
    titre: "Le rendement requis reste sous votre hypothèse", sujet: "sur_trajectoire",
    description: `Atteindre la cible en ${o.echeance_annee} demanderait `
      + `${pourcent(requis, 1)} % par an, soit moins que les `
      + `${pourcent(o.taux_attendu, 1)} % que vous avez posés.`,
    metrique: { libelle: "rendement requis", valeur: `${pourcent(requis, 1)} % / an` },
  };
}

/** Au-delà de cette part, la valeur finale dépend d'abord des marchés. */
const GAIN_DOMINANT = 60;

function dependanceAuRendement(o: Objectif, c: Contexte): Insight | null {
  const pg = o.part_du_gain;
  // ⚠️ L'horizon projeté suffit : la part du gain se mesure sur une durée, pas sur une date
  // choisie. La condition sur `mois_restants` faisait taire cette famille sur tout objectif
  // sans échéance, alors que le serveur en fournit désormais la valeur.
  if (pg == null || !(o.mois_restants ?? o.mois_pour_atteindre)) return null;
  const conf = confiance(o, c);
  const base = { id: `${o.id}:dependance`, famille: "rendement_requis" as const,
    confiance: conf.valeur, motifs: conf.motifs, hypotheses: hypotheses(o) };
  const partVersements = 100 - pg.part_gain;

  if (pg.part_gain >= GAIN_DOMINANT) {
    return {
      ...base, priorite: "warning",
      titre: "Votre objectif dépend surtout de la capitalisation",
      description: `Sur la valeur finale projetée, ${pourcent(pg.part_gain, 0)} % viennent du `
        + `rendement composé et ${pourcent(partVersements, 0)} % de vos apports. La réussite `
        + "dépend donc d’abord de l’hypothèse de rendement.",
      metrique: { libelle: "issu du rendement", valeur: `${pourcent(pg.part_gain, 0)} %` },
    };
  }
  return {
    ...base, priorite: "info",
    titre: "Votre objectif repose surtout sur vos apports",
    description: `Sur la valeur finale projetée, ${pourcent(partVersements, 0)} % viennent de `
      + `vos apports et ${pourcent(pg.part_gain, 0)} % du rendement composé. Même un rendement `
      + "décevant n’en changerait pas l’essentiel.",
    metrique: { libelle: "issu de vos apports", valeur: `${pourcent(partVersements, 0)} %` },
  };
}

/** Sous cet horizon, l'inflation ne déforme pas assez la cible pour mériter une ligne. */
const HORIZON_INFLATION_MOIS = 120;

function inflation(o: Objectif, c: Contexte): Insight | null {
  // ⚠️ **L'horizon projeté fait office d'échéance quand il n'y en a pas.** L'inflation ronge
  // le pouvoir d'achat sur une durée, non jusqu'à une date choisie : se taire faute
  // d'échéance privait de cet insight les objectifs les plus lointains, qui sont justement
  // ceux que l'inflation déforme le plus.
  const horizon = o.mois_restants ?? o.mois_pour_atteindre;
  if (o.inflation == null || !horizon || horizon < HORIZON_INFLATION_MOIS) {
    return null;
  }
  // ⚠️ **La cible, et non la valeur projetée.** Ramener la projection en euros constants est
  // déjà fait sous la médiane du panneau voisin ; ce qui n'est dit nulle part, c'est ce que
  // vaudra *l'objectif lui-même* — le nombre que l'épargnant a choisi comme suffisant.
  const cible = o.capital_requis ?? o.cible;
  const constants = cible / (1 + o.inflation / 100) ** (horizon / 12);
  if (constants >= cible) return null;
  const conf = confiance(o, c);
  const perte = (1 - constants / cible) * 100;
  return {
    id: `${o.id}:inflation`, famille: "inflation", priorite: "info",
    confiance: conf.valeur, motifs: conf.motifs, hypotheses: hypotheses(o),
    titre: `${euros(cible)} ne vaudra pas ${euros(cible)} d’aujourd’hui`,
    description: `À ${pourcent(o.inflation, 1)} % d’inflation sur `
      + `${dureeEnClair(horizon)}, votre cible correspondrait à environ `
      + `${euros(constants)} en euros d’aujourd’hui, soit ${pourcent(perte, 0)} % de pouvoir `
      + "d’achat en moins.",
    metrique: { libelle: "en euros d’aujourd’hui", valeur: euros(constants) },
  };
}

/** Sous cette part, l'objectif n'avance qu'avec une fraction du portefeuille. */
const PART_FAIBLE = 50;

function affectation(o: Objectif, c: Contexte): Insight | null {
  // ⚠️ Sans objet pour un plafond de versements : on ne répartit pas un versement déjà fait
  // entre deux enveloppes, l'euro versé sur le PEA l'a été en entier.
  if (o.sur_versements) return null;
  const part = o.part_affectee;
  if (part == null || part >= PART_FAIBLE) return null;
  const conf = confiance(o, c);
  return {
    id: `${o.id}:affectation`, famille: "affectation", priorite: "info",
    confiance: conf.valeur, motifs: conf.motifs, hypotheses: hypotheses(o),
    titre: "Une fraction du portefeuille seulement est affectée",
    description: `${pourcent(part, 0)} % du portefeuille est destiné à cet objectif, `
      + `soit ${o.montant_actuel != null ? euros(o.montant_actuel) : "une part"} des `
      + `${c.valeurPortefeuille != null ? euros(c.valeurPortefeuille) : "avoirs"} détenus. `
      + "Sa progression s’en trouve d’autant plus lente.",
    metrique: { libelle: "du portefeuille", valeur: `${pourcent(part, 0)} %` },
  };
}

/** Sous cet horizon, une forte volatilité n'a plus le temps d'être absorbée. */
const HORIZON_COURT_MOIS = 36;

/** Au-delà de cet horizon, la volatilité cesse d'être la contrainte dominante. */
const HORIZON_LONG_MOIS = 240;

/** Au-delà de cette volatilité annualisée, le portefeuille est franchement mouvant. */
const VOLATILITE_ELEVEE = 20;

function risque(o: Objectif, c: Contexte): Insight | null {
  const vol = c.volatilite;
  if (vol == null || vol < VOLATILITE_ELEVEE) return null;
  const horizon = o.mois_restants ?? o.mois_pour_atteindre;
  if (horizon == null) return null;
  const conf = confiance(o, c, { volatilite: true });
  const base = { id: `${o.id}:risque`, famille: "risque" as const,
    confiance: conf.valeur, motifs: conf.motifs, hypotheses: hypotheses(o),
    metrique: { libelle: "volatilité annualisée", valeur: `${pourcent(vol, 1)} %` } };

  if (horizon <= HORIZON_COURT_MOIS) {
    return {
      ...base, priorite: "critique",
      titre: "Votre horizon est court par rapport au risque",
      description: `L’objectif est prévu dans ${dureeEnClair(horizon)} alors que le `
        + `portefeuille présente une volatilité annualisée de ${pourcent(vol, 1)} %. `
        + "Une baisse survenue près de l’échéance n’aurait pas le temps d’être rattrapée.",
    };
  }
  if (horizon >= HORIZON_LONG_MOIS) {
    return {
      ...base, priorite: "info",
      titre: "Votre horizon absorbe la volatilité",
      description: `La volatilité du portefeuille atteint ${pourcent(vol, 1)} % par an, mais `
        + `l’horizon de ${dureeEnClair(horizon)} laisse le temps d’en amortir les secousses.`,
    };
  }
  return {
    ...base, priorite: "warning",
    titre: "Le risque est notable pour cet horizon",
    description: `L’objectif est prévu dans ${dureeEnClair(horizon)} et le portefeuille `
      + `présente une volatilité annualisée de ${pourcent(vol, 1)} %.`,
  };
}

/** Sous cet écart, une secousse ne mérite pas d'être signalée. */
const STRESS_NOTABLE_MOIS = 6;

function stress(o: Objectif, c: Contexte): Insight | null {
  const scenarios = (o.stress ?? []).filter(s => s.ecart_mois != null && s.ecart_mois > 0);
  if (scenarios.length === 0) return null;
  // Le choc qui déplace le plus la date : c'est celui qui informe.
  const pire = scenarios.reduce((a, b) => (b.ecart_mois! > a.ecart_mois! ? b : a));
  if (pire.ecart_mois! < STRESS_NOTABLE_MOIS) return null;
  const conf = confiance(o, c);
  const duree = dureeEnClair(pire.ecart_mois!);
  return {
    id: `${o.id}:stress`, famille: "stress",
    priorite: pire.ecart_mois! > 60 ? "warning" : "info",
    confiance: conf.valeur, motifs: conf.motifs, hypotheses: hypotheses(o),
    titre: `${pire.libelle} repousserait l’échéance`,
    // La seconde phrase reprend le libellé sans son article, pour ne pas le répéter en tête.
    description: `La date d’atteinte passerait à ${moisEnClair(pire.mois!)}, `
      + `soit ${duree} plus tard qu’au rythme actuel.`,
    metrique: { libelle: "de retard", valeur: duree ?? "—" },
  };
}

/** Au-delà de cette somme des parts, le même euro sert plusieurs fois. */
const SOMME_PARTS_LIMITE = 100.5;

function chevauchement(o: Objectif, c: Contexte): Insight | null {
  const somme = c.sommeDesParts;
  if (somme == null || somme <= SOMME_PARTS_LIMITE) return null;
  // ⚠️ **Nommer les objectifs, et non répéter la somme.** « Progression globale », juste
  // au-dessus, affiche déjà « vos objectifs se partagent 200 % du portefeuille ». Redire ce
  // pourcentage ici serait la même phrase à dix centimètres d'elle-même. Ce que ce panneau peut
  // ajouter, c'est **lesquels** : le total ne dit pas où regarder.
  const gourmands = (c.autres ?? [])
    .filter(a => !a.sur_versements && (a.part_affectee ?? 100) >= 50)
    .sort((a, b) => (b.part_affectee ?? 100) - (a.part_affectee ?? 100));
  if (gourmands.length < 2) return null;
  const conf = confiance(o, c);
  const nommes = gourmands.slice(0, 2)
    .map(a => `« ${a.nom} » (${pourcent(a.part_affectee ?? 100, 0)} %)`).join(" et ");
  return {
    id: `${o.id}:chevauchement`, famille: "chevauchement", priorite: "critique",
    sujet: "portefeuille",
    confiance: conf.valeur, motifs: conf.motifs, hypotheses: hypotheses(o),
    objectifsLies: gourmands.map(a => a.id),
    titre: "Deux objectifs se disputent le même capital",
    description: `${nommes} y puisent tous deux. Les parts totalisent `
      + `${pourcent(somme, 0)} % : ce ne sont pas des patrimoines séparés, et le total déjà `
      + "constitué en est d’autant gonflé.",
    metrique: { libelle: "objectifs concernés", valeur: `${gourmands.length}` },
  };
}

function jalon(o: Objectif, c: Contexte): Insight | null {
  if (o.avancement == null || o.capital_requis == null || o.montant_actuel == null) return null;
  const conf = confiance(o, c);
  const base = { id: `${o.id}:jalon`, famille: "jalon" as const,
    confiance: conf.valeur, motifs: conf.motifs, hypotheses: hypotheses(o) };

  if (o.atteint) {
    return {
      ...base, priorite: "positive",
      titre: o.sur_versements ? "Le plafond est atteint" : "La cible est atteinte",
      description: `${euros(o.montant_actuel)} sur ${euros(o.capital_requis)}.`,
      metrique: { libelle: "de la cible", valeur: "100 %" },
    };
  }
  // ⚠️ `pourcentageLisible` et non un arrondi : 905 € sur 1 500 000 € font 0,06 %, écrits
  // « 0 % » par un arrondi — indiscernable d'un objectif auquel on n'a rien affecté, alors
  // qu'un versement a bien commencé. Vu à l'écran sur « Liberté financière ».
  const part = pourcentageLisible(o.avancement);
  return {
    ...base, priorite: "info",
    titre: o.sur_versements
      ? `Vous avez versé ${part} du plafond`
      : `Vous avez constitué ${part} de la cible`,
    description: `${euros(o.montant_actuel)} sur ${euros(o.capital_requis)}, `
      + `soit ${euros(o.capital_requis - o.montant_actuel)} restants.`,
    metrique: { libelle: "de la cible", valeur: part },
  };
}

/**
 * Le plafond de versements face aux objectifs qu'il finance.
 *
 * ⚠️ La seule interprétation qui demande de regarder au-delà d'un objectif : une enveloppe qui
 * sature avant que les objectifs qu'elle finance n'aboutissent est un fait qu'aucune carte ne
 * montre, puisqu'il naît de la rencontre de deux d'entre elles.
 */
function plafondEtHorizons(o: Objectif, c: Contexte): Insight | null {
  if (!o.sur_versements || o.mois_pour_atteindre == null || o.mois_pour_atteindre <= 0) {
    return null;
  }
  const candidats = (c.autres ?? []).filter(a => a.id !== o.id && !a.sur_versements);
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
  if (Math.abs(ecart) < 12) return null;
  const duree = dureeEnClair(Math.abs(ecart));
  const conf = confiance(o, c);
  const repere = surEcheance
    ? `l’échéance de « ${cible.nom} » (${cible.echeance_annee})`
    : `l’aboutissement de « ${cible.nom} » au rythme actuel`;
  return {
    id: `${o.id}:plafond_horizons`, famille: "calendrier", priorite: "info",
    confiance: conf.valeur, motifs: conf.motifs, hypotheses: hypotheses(o),
    objectifsLies: [cible.id],
    titre: ecart > 0 ? "Le plafond saturerait avant vos autres objectifs"
      : "Le plafond tiendrait jusqu’au bout",
    description: `La capacité de versement serait épuisée en `
      + `${moisEnClair(o.mois_pour_atteindre)}, ${duree} ${ecart > 0 ? "avant" : "après"} `
      + `${repere}.`,
    metrique: { libelle: ecart > 0 ? "avant l’échéance" : "après l’échéance",
      valeur: duree ?? "—" },
  };
}

/**
 * La plus-value qui ne consomme pas le plafond.
 *
 * ⚠️ La version chiffrée d'une explication qui traînait en texte fixe : elle ne dépendait
 * d'aucune donnée et se répétait à l'identique. Ici elle porte trois chiffres du portefeuille,
 * et elle grandit avec lui.
 */
function gainHorsPlafond(o: Objectif, c: Contexte): Insight | null {
  if (!o.sur_versements) return null;
  const verse = o.verse_retenu ?? o.montant_actuel;
  if (verse == null || verse <= 0 || c.valeurPortefeuille == null) return null;
  const gain = c.valeurPortefeuille - verse;
  if (gain <= 0 || gain / verse < 0.02) return null;
  const conf = confiance(o, c);
  return {
    id: `${o.id}:gain_hors_plafond`, famille: "jalon", priorite: "positive",
    confiance: conf.valeur, motifs: conf.motifs, hypotheses: hypotheses(o),
    titre: "Vos plus-values n’entament pas le plafond",
    description: `${euros(verse)} versés valent ${euros(c.valeurPortefeuille)} aujourd’hui : `
      + `${euros(gain)} de plus-value, qui ne consomment aucune capacité de versement.`,
    metrique: { libelle: "de plus-value hors plafond", valeur: euros(gain) },
  };
}

/**
 * L'effet d'un pas de cent euros par mois.
 *
 * ⚠️ Le taux de change entre des euros et des années, et la ligne la plus actionnable de
 * toutes : personne ne double ses versements d'un trait de plume, tout le monde peut mettre
 * cent euros de plus.
 */
function pasMarginal(o: Objectif, c: Contexte): Insight | null {
  const s = (o.sensibilites ?? []).find(x => x.quoi === "versement_marginal");
  if (!s || o.versement_mensuel == null) return null;
  const pas = s.versement - o.versement_mensuel;
  if (pas <= 0) return null;
  const conf = confiance(o, c);
  const base = { id: `${o.id}:pas_marginal`, famille: "pas_marginal" as const,
    confiance: conf.valeur, motifs: conf.motifs, hypotheses: hypotheses(o) };
  const quoi = o.sur_versements ? "le plafond" : "la cible";

  if (s.mois == null) {
    return {
      ...base, priorite: "info",
      titre: `${euros(pas)} de plus par mois n’y suffiraient pas`,
      description: `Même à ${euros(s.versement)} par mois, ${quoi} resterait hors de portée `
        + "au rendement retenu.",
    };
  }
  if (s.ecart_mois == null || s.ecart_mois === 0) return null;
  const duree = dureeEnClair(Math.abs(s.ecart_mois));
  // ⚠️ Pluriel : le sujet est « cent euros », pas « un pas ». Vu à l'écran en « 100 € de
  // plus par mois rapprocherait », qui accroche l'œil autant qu'une faute de calcul.
  const sens = s.ecart_mois < 0 ? "rapprocheraient" : "repousseraient";
  return {
    ...base, priorite: "info",
    titre: `${euros(pas)} de plus par mois ${sens} ${quoi} de ${duree}`,
    description: `${euros(s.versement)} au lieu de ${euros(o.versement_mensuel)} porterait `
      + `la date d’atteinte à ${moisEnClair(s.mois)}.`,
    metrique: { libelle: s.ecart_mois < 0 ? "gagnés" : "perdus", valeur: duree ?? "—" },
  };
}

// ── Classement et sélection ──────────────────────────────────────────────────

/** L'ordre des priorités, du plus urgent au moins. */
const RANG_PRIORITE: Record<Priorite, number> = {
  critique: 0, warning: 1, positive: 2, info: 3,
};

/**
 * L'ordre des familles à priorité égale.
 *
 * ⚠️ C'est l'ordre demandé : incohérence, risque, calendrier, dépendance au rendement,
 * chevauchement, inflation, jalon, puis le reste. Il ne se déduit d'aucune règle générale —
 * c'est un jugement sur ce qui compte le plus pour décider, et il vaut mieux l'écrire une fois
 * ici que le laisser émerger d'un tri par priorité seule.
 */
const RANG_FAMILLE: Record<FamilleInsight, number> = {
  chevauchement: 0,
  risque: 1,
  calendrier: 2,
  rendement_requis: 3,
  // ⚠️ Le pas de cent euros est une famille à part, et rangée haut. Il partageait
  // « versement » avec le rythme requis, et la déduplication par famille en supprimait donc
  // un des deux — toujours le même, puisque le tri est stable. Or ils ne disent pas la même
  // chose : l'un donne le rythme qu'exigerait l'échéance, l'autre le taux de change entre des
  // euros et des années. C'est le second qui correspond à une décision qu'on prend.
  pas_marginal: 4,
  stress: 5,
  inflation: 6,
  versement: 7,
  jalon: 8,
  affectation: 9,
};

/**
 * Combien d'insights la carte montre.
 *
 * ⚠️ Quatre depuis que la somme des parts a cessé de crier au chevauchement sur des données
 * justes : cette alerte occupait la première place de chaque carte, et les familles utiles
 * étaient repoussées d'un cran. Quatre points de navigation restent lisibles d'un coup d'œil ;
 * au-delà, ils deviennent une frise qu'on ne compte plus.
 */
export const MAXIMUM_AFFICHE = 4;

/**
 * Combien d'insights peuvent partager le même sujet.
 *
 * ⚠️ Deux, parce qu'un fait s'établit mieux sous deux angles que sous un seul — « 14 ans de
 * retard » et « 18,5 % par an nécessaires » se complètent — mais qu'un troisième n'ajoute plus
 * qu'une reformulation. C'est ce qui empêche la carte de dire quatre fois la même chose.
 */
export const MAXIMUM_PAR_SUJET = 2;

/**
 * Les insights d'un objectif, classés et bornés.
 *
 * ⚠️ **Toutes les familles sont évaluées, puis triées, puis coupées.** L'ordre d'évaluation
 * n'est donc pas l'ordre d'affichage, ce qui évite le piège du premier générateur qui gagne :
 * un jalon positif ne doit pas passer devant une incohérence critique parce qu'il a été
 * calculé plus tôt.
 */
export function aideALaDecision(o: Objectif | null, c: Contexte = {}): Insight[] {
  if (!o) return [];
  // ⚠️ **`versement` manquait à cette liste, et son insight n'était donc jamais produit.**
  // Le générateur existait, testé de nulle part, appelé de nulle part : le « rythme requis »
  // — l'une des interprétations les plus utiles — était mort-né. Débusqué par un test qui
  // cherchait une autre phrase et ne trouvait rien du tout. Une liste de fonctions est un
  // endroit où l'on oublie sans que rien ne le signale : ni `tsc` ni `eslint` ne voient qu'une
  // fonction exportée nulle part n'est plus référencée qu'ici.
  const familles = [
    chevauchement, risque, calendrier, rendementRequis, dependanceAuRendement,
    versement, pasMarginal, stress, inflation, plafondEtHorizons, gainHorsPlafond,
    jalon, affectation,
  ];
  const trouves = familles
    .map(f => f(o, c))
    .filter((i): i is Insight => i !== null);

  trouves.sort((a, b) =>
    RANG_PRIORITE[a.priorite] - RANG_PRIORITE[b.priorite]
    || RANG_FAMILLE[a.famille] - RANG_FAMILLE[b.famille]);

  // ⚠️ Une seule entrée par famille : deux insights de rendement à la suite disent deux fois
  // la même chose sous deux angles, et occupent la place d'une famille absente.
  //
  // ⚠️ **Et deux au plus par sujet, ce qui est la vraie défense contre la répétition.** Sur un
  // objectif en retard, trois familles distinctes décrivent le même fait : l'échéance non tenue,
  // le rythme requis trop haut, le rendement requis invraisemblable. Le tri par famille ne le
  // voyait pas et la carte affichait quatre fois la même mauvaise nouvelle. Deux angles
  // suffisent à l'établir ; les places restantes vont à ce qui dit autre chose — une secousse,
  // l'inflation, le pas de cent euros.
  const vuesFamille = new Set<FamilleInsight>();
  const parSujet = new Map<Sujet, number>();
  const retenus: Insight[] = [];
  for (const i of trouves) {
    if (vuesFamille.has(i.famille)) continue;
    if (i.sujet) {
      const deja = parSujet.get(i.sujet) ?? 0;
      if (deja >= MAXIMUM_PAR_SUJET) continue;
      parSujet.set(i.sujet, deja + 1);
    }
    vuesFamille.add(i.famille);
    retenus.push(i);
    if (retenus.length >= MAXIMUM_AFFICHE) break;
  }
  return retenus;
}
