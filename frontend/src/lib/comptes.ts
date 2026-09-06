import { recuperer } from "@/lib/requete";
// ⚠️ Chemins relatifs et non l'alias « @/ » : Vitest tourne sans configuration et ne le
// résout pas. Un import en alias ici rendrait tout le module intestable — y compris
// `fraicheurDuSolde`, qui est pourtant du calcul pur et le seul endroit où une erreur ne
// se verrait pas à l'écran.
import { API_URL } from "./api";
import { enTetesAuth } from "./session";

/**
 * Les comptes **déclarés** d'un portefeuille, côté client.
 *
 * ⚠️ **Un compte déclaré n'est pas une enveloppe devinée, et les deux coexistent.**
 * `compteInfere` range chaque ligne dans PEA, CTO ou Crypto d'après sa place de cotation :
 * c'est une déduction, incapable de distinguer deux PEA et incapable de décrire un compte
 * courant, qui ne détient aucun titre. Ce module porte l'autre moitié — ce que l'épargnant
 * a **dit** détenir. Les portefeuilles qui n'ont rien déclaré continuent d'être rangés par
 * déduction ; la bascule se fait au rythme de chacun.
 */

/** Les genres reconnus par le serveur. La liste vient de lui, jamais d'ici. */
export type GenreCompte = {
  cle: string;
  libelle: string;
  /** Le compte détient-il des titres, ou seulement des espèces ? */
  titres: boolean;
};

export type Compte = {
  id: string;
  nom: string;
  genre: string;
  libelle_genre: string;
  porte_des_titres: boolean;
  couleur: string;
  /**
   * Les liquidités du compte, ou `null` quand aucun apport n'a été saisi.
   *
   * ⚠️ **Calculé par le serveur, jamais stocké.** C'est la somme des apports du compte.
   * Le champ garde son nom parce que c'est ce que l'écran affiche, mais il n'y a plus de
   * solde quelque part qu'on pourrait corriger : pour changer ce nombre, on touche au
   * journal.
   *
   * ⚠️ **`null` n'est pas zéro.** Un PEA dont on ne connaît que les lignes ne déclare
   * aucune espèce, ce qui n'est pas déclarer zéro euro — et c'est la différence qui
   * empêche de lui dessiner une poche de liquidités plate.
   */
  solde: number | null;
  /**
   * Quand le dernier apport a eu lieu. ISO 8601, ou `null` si le journal est vide.
   *
   * ⚠️ **C'est l'âge de l'argent, là où `mis_a_jour_le` est l'âge de la fiche.** La carte
   * disait « Solde déclaré il y a 8 mois » d'après la seconde : renommer un livret
   * rajeunissait son solde sans qu'un euro ait bougé. Celle-ci répond à la question qu'on
   * se pose vraiment devant un compte de trésorerie.
   */
  dernier_apport_le: string | null;
  rang: number;
  /** Quand le compte a été déclaré ou corrigé. ISO 8601. */
  mis_a_jour_le: string | null;
};

/**
 * Depuis quand ce solde est ce qu'on en dit.
 *
 * ⚠️ **Un solde tapé à la main n'est pas une mesure, et l'écran doit le laisser voir.**
 * Sur un compte de trésorerie, ce montant *est* la valeur du compte : il entre dans les
 * totaux comme s'il était relevé, alors qu'il date du jour où quelqu'un l'a saisi. Le mot
 * « aujourd'hui » rassure à raison, « il y a 8 mois » prévient à raison ; l'absence de
 * mention laisserait croire au premier dans tous les cas.
 *
 * ⚠️ **Rien en dessous d'un jour.** « Il y a 3 heures » sur un livret n'apporte rien : ce
 * qu'on veut savoir, c'est si le chiffre a vieilli, et cela se compte en jours.
 *
 * ⚠️ **Le passage aux années se décide sur les jours, pas sur les mois — et c'est un test
 * qui l'a imposé.** Les mois étaient arrondis et les années tronquées : à 345 jours,
 * `round(345/30)` donne 12, ce qui sortait de la branche des mois, tandis que
 * `floor(345/365)` donne 0. La fonction annonçait donc **« il y a 0 ans »** pendant trois
 * semaines entières, entre 345 et 364 jours. Deux arithmétiques différentes ne se
 * rejoignent pas d'elles-mêmes ; on borne les mois à onze et l'on ne bascule qu'à 365.
 */
export function fraicheurDuSolde(iso: string | null): string | null {
  if (!iso) return null;
  const quand = new Date(iso);
  if (Number.isNaN(quand.getTime())) return null;
  const jours = Math.floor((Date.now() - quand.getTime()) / 86_400_000);
  if (jours <= 0) return "aujourd’hui";
  if (jours === 1) return "hier";
  if (jours < 30) return `il y a ${jours} jours`;
  if (jours < 365) return `il y a ${Math.min(11, Math.round(jours / 30))} mois`;
  const ans = Math.floor(jours / 365);
  return ans === 1 ? "il y a un an" : `il y a ${ans} ans`;
}

export type CompteASoumettre = {
  nom: string;
  genre: string;
  couleur: string;
  /**
   * L'argent qu'on met sur le compte en le déclarant, et la date à laquelle on l'y met.
   *
   * ⚠️ **Un apport daté, et non un solde.** « Il n'y a pas de depuis quand, juste la
   * date » : déclarer un livret à 5 000 € au 12 mars, c'est apporter 5 000 € le 12 mars.
   * Le même geste qu'un achat de titres, qui laisse le même repère sur la courbe.
   *
   * ⚠️ **Ignorés à la modification.** Le serveur ne les lit qu'à la création : corriger un
   * apport se fait sur l'apport lui-même, dans le journal. C'est ce qui empêche de rouvrir
   * la couture — deux chemins pour écrire la même somme, qui finissaient par diverger.
   */
  apport_initial?: number | null;
  apport_le?: string | null;
};

/**
 * ⚠️ **Les genres viennent du serveur et ne sont pas recopiés ici.** Réécrits côté client,
 * ils auraient divergé au premier ajout — et le formulaire aurait proposé un choix que le
 * serveur refuse, avec un 400 pour toute explication. La route est hors du chemin d'un
 * portefeuille : c'est une constante du domaine, elle n'appartient à personne.
 */
export async function lireGenres(): Promise<GenreCompte[]> {
  const r = await recuperer(`${API_URL}/api/v1/genres-de-compte`);
  if (!r.ok) throw new Error("Genres de compte indisponibles.");
  return r.json();
}

export async function lireComptes(portefeuille: string): Promise<Compte[]> {
  const r = await fetch(
    `${API_URL}/api/v1/portfolios/${encodeURIComponent(portefeuille)}/comptes`,
    { headers: enTetesAuth() },
  );
  if (!r.ok) throw new Error("Comptes indisponibles.");
  return r.json();
}

/**
 * ⚠️ **Le message d'erreur du serveur est remonté tel quel.** Il dit précisément ce qui
 * cloche — « Couleur attendue au format #RRGGBB », « Nom trop long » — là où un « échec de
 * l'enregistrement » générique obligerait l'épargnant à deviner lequel de ses quatre champs
 * pose problème. Les contrôles du formulaire ne remplacent pas ceux du serveur : ils les
 * devancent.
 */
async function ouRaler(r: Response, defaut: string): Promise<never> {
  let detail = defaut;
  try {
    const corps = await r.json();
    if (typeof corps?.detail === "string") detail = corps.detail;
  } catch { /* réponse sans corps JSON : on garde le message par défaut */ }
  throw new Error(detail);
}

export async function creerCompte(
  portefeuille: string, compte: CompteASoumettre,
): Promise<Compte> {
  const r = await fetch(
    `${API_URL}/api/v1/portfolios/${encodeURIComponent(portefeuille)}/comptes`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...enTetesAuth() },
      body: JSON.stringify(compte),
    },
  );
  if (!r.ok) return ouRaler(r, "Le compte n'a pas pu être créé.");
  return r.json();
}

export async function modifierCompte(
  portefeuille: string, id: string, compte: CompteASoumettre,
): Promise<Compte> {
  const r = await fetch(
    `${API_URL}/api/v1/portfolios/${encodeURIComponent(portefeuille)}/comptes/${id}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...enTetesAuth() },
      body: JSON.stringify(compte),
    },
  );
  if (!r.ok) return ouRaler(r, "Le compte n'a pas pu être modifié.");
  return r.json();
}

/**
 * Un mouvement de trésorerie : un versement ou un retrait, daté.
 *
 * ⚠️ `montant` est **signé** — positif pour un versement, négatif pour un retrait. Un
 * champ de sens à côté aurait permis d'écrire un retrait de −200 €, dont le signe se
 * serait appliqué deux fois.
 */
export type Mouvement = {
  id: string;
  date: string;
  montant: number;
  note: string | null;
};

const cheminMouvements = (portefeuille: string, compte: string) =>
  `${API_URL}/api/v1/portfolios/${encodeURIComponent(portefeuille)}/comptes/${compte}/mouvements`;

export async function listerMouvements(
  portefeuille: string, compte: string,
): Promise<Mouvement[]> {
  const r = await fetch(cheminMouvements(portefeuille, compte), { headers: enTetesAuth() });
  if (!r.ok) return ouRaler(r, "Le journal du compte n'a pas pu être lu.");
  return r.json();
}

/** Un apport, tel que la route du portefeuille le rend : avec le compte qui le porte. */
export type ApportRange = Mouvement & { compte_id: string };

/**
 * Tous les apports du portefeuille, comptes confondus.
 *
 * ⚠️ **Et non `/history/comptes`, qui les porte aussi.** Cette dernière télécharge
 * l'historique des cours de tous les titres avant de répondre : s'en servir pour remplir
 * une liste d'écritures ferait dépendre l'affichage d'un journal du réseau du fournisseur.
 * Ici, une requête sur une table déjà en base.
 */
export async function listerLesApports(portefeuille: string): Promise<ApportRange[]> {
  const r = await recuperer(`${API_URL}/api/v1/portfolios/${portefeuille}/mouvements`,
    { headers: enTetesAuth() });
  if (!r.ok) return ouRaler(r, "Les apports du portefeuille n'ont pas pu être lus.");
  return r.json();
}

/**
 * Enregistre un versement ou un retrait, et rend le compte **remis à jour**.
 *
 * ⚠️ **Le solde change côté serveur, et l'écran doit relire le compte.** Enregistrer un
 * mouvement dit que l'argent a bougé : la route ajoute le montant au solde. C'est
 * précisément ce qui distingue ce geste de la correction du solde, qui réécrit le chiffre
 * sans rien ajouter au journal — corriger veut dire « je m'étais trompé », verser veut
 * dire « j'ai ajouté ». Le compte rendu ici évite d'aller le redemander.
 */
export async function enregistrerMouvement(
  portefeuille: string, compte: string,
  mouvement: { date: string; montant: number; note?: string | null },
): Promise<{ mouvement: Mouvement; compte: Compte }> {
  const r = await fetch(cheminMouvements(portefeuille, compte), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...enTetesAuth() },
    body: JSON.stringify(mouvement),
  });
  if (!r.ok) return ouRaler(r, "Le mouvement n'a pas pu être enregistré.");
  return r.json();
}

/** Retire un mouvement du journal ; le serveur défait son effet sur le solde. */
export async function supprimerMouvement(
  portefeuille: string, compte: string, id: string,
): Promise<{ compte: Compte }> {
  const r = await fetch(`${cheminMouvements(portefeuille, compte)}/${id}`, {
    method: "DELETE", headers: enTetesAuth(),
  });
  if (!r.ok) return ouRaler(r, "Le mouvement n'a pas pu être supprimé.");
  return r.json();
}

export async function supprimerCompte(portefeuille: string, id: string): Promise<void> {
  const r = await fetch(
    `${API_URL}/api/v1/portfolios/${encodeURIComponent(portefeuille)}/comptes/${id}`,
    { method: "DELETE", headers: enTetesAuth() },
  );
  if (!r.ok) await ouRaler(r, "Le compte n'a pas pu être supprimé.");
}

/**
 * Range des opérations déjà saisies dans ce compte.
 *
 * ⚠️ **C'est ce qui rend un dossier deviné déclarable.** Un compte déclaré ne pouvait
 * contenir que des opérations créées après lui : déclarer son PEA donnait un dossier vide
 * à côté du dossier deviné toujours plein. Le serveur écrit tout ou rien — un lot qui
 * contient une opération étrangère est refusé sans qu'aucune ne bouge.
 */
export async function rattacherOperations(
  portefeuille: string, id: string, operations: number[],
): Promise<{ rattachees: number; deplacees: number }> {
  const r = await fetch(
    `${API_URL}/api/v1/portfolios/${encodeURIComponent(portefeuille)}/comptes/${id}/operations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...enTetesAuth() },
      body: JSON.stringify({ operations }),
    },
  );
  if (!r.ok) return ouRaler(r, "Les opérations n'ont pas pu être rattachées.");
  return r.json();
}

