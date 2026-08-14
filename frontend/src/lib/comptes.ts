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
  /** Les liquidités déclarées, ou `null` quand rien n'a été saisi. */
  solde: number | null;
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
  solde?: number | null;
};

/**
 * ⚠️ **Les genres viennent du serveur et ne sont pas recopiés ici.** Réécrits côté client,
 * ils auraient divergé au premier ajout — et le formulaire aurait proposé un choix que le
 * serveur refuse, avec un 400 pour toute explication. La route est hors du chemin d'un
 * portefeuille : c'est une constante du domaine, elle n'appartient à personne.
 */
export async function lireGenres(): Promise<GenreCompte[]> {
  const r = await fetch(`${API_URL}/api/v1/genres-de-compte`);
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

export async function supprimerCompte(portefeuille: string, id: string): Promise<void> {
  const r = await fetch(
    `${API_URL}/api/v1/portfolios/${encodeURIComponent(portefeuille)}/comptes/${id}`,
    { method: "DELETE", headers: enTetesAuth() },
  );
  if (!r.ok) await ouRaler(r, "Le compte n'a pas pu être supprimé.");
}

