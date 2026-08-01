/**
 * Session du compte.
 *
 * Le jeton était relu à la main dans chaque composant, avec des variantes :
 * certains l'envoyaient, d'autres non, et les routes qui l'exigent répondaient
 * 401 sans que rien ne le signale. Un seul endroit le lit désormais.
 */

const CLE_JETON = "novac_token";
const CLE_COMPTE = "novac_user";

export type Compte = {
  id?: string;
  email?: string;
  username?: string;
  avatar_url?: string | null;
};

/** Le jeton, ou `null` — y compris au rendu serveur, sans `localStorage`. */
export function jeton(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(CLE_JETON); } catch { return null; }
}

/**
 * En-têtes d'authentification, vides hors session.
 *
 * Renvoyer un objet vide plutôt qu'un `Authorization: Bearer null` : la
 * seconde forme donne un 401 là où l'absence d'en-tête laisse les routes
 * publiques répondre normalement.
 */
export function enTetesAuth(): Record<string, string> {
  const t = jeton();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** Le compte mémorisé, sans garantie que sa session soit encore valide. */
export function compteMemorise(): Compte | null {
  if (typeof window === "undefined") return null;
  try {
    const brut = localStorage.getItem(CLE_COMPTE);
    return brut ? JSON.parse(brut) as Compte : null;
  } catch { return null; }
}

export function enregistrerSession(compte: Compte, token: string): void {
  try {
    localStorage.setItem(CLE_JETON, token);
    localStorage.setItem(CLE_COMPTE, JSON.stringify(compte));
  } catch { /* stockage refusé */ }
}

/** Efface les deux entrées ensemble — les séparer laissait l'interface mentir. */
export function fermerSession(): void {
  try {
    localStorage.removeItem(CLE_JETON);
    localStorage.removeItem(CLE_COMPTE);
  } catch { /* stockage refusé */ }
}
