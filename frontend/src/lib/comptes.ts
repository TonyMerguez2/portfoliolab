import { API_URL } from "@/lib/api";
import { enTetesAuth } from "@/lib/session";

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
  logo_url: string | null;
  /** Les liquidités déclarées, ou `null` quand rien n'a été saisi. */
  solde: number | null;
  rang: number;
};

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

/**
 * Téléverse le logo de l'établissement.
 *
 * ⚠️ **Aucun `Content-Type` posé à la main.** Le navigateur doit écrire lui-même la
 * frontière du `multipart`, qu'il génère : la fixer ici produit un corps que le serveur ne
 * sait plus découper, et l'erreur arrive sous la forme d'un 422 sans rapport apparent.
 */
export async function televerserLogo(
  portefeuille: string, id: string, fichier: File,
): Promise<Compte> {
  const corps = new FormData();
  corps.append("file", fichier);
  const r = await fetch(
    `${API_URL}/api/v1/portfolios/${encodeURIComponent(portefeuille)}/comptes/${id}/logo`,
    { method: "POST", headers: enTetesAuth(), body: corps },
  );
  if (!r.ok) return ouRaler(r, "Le logo n'a pas pu être enregistré.");
  return r.json();
}

/**
 * L'adresse complète d'un logo, ou `null`.
 *
 * Le serveur rend un chemin public relatif ; l'écran a besoin d'une URL absolue quand
 * l'API vit sur une autre origine que le site.
 */
export function urlDuLogo(compte: Pick<Compte, "logo_url">): string | null {
  if (!compte.logo_url) return null;
  return compte.logo_url.startsWith("http")
    ? compte.logo_url
    : `${API_URL}/${compte.logo_url.replace(/^\/+/, "")}`;
}
