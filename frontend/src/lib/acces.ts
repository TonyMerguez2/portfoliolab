/**
 * La porte de l'alpha fermée : un mot de passe partagé, et rien de plus.
 *
 * ⚠️ **Ce n'est pas de l'authentification, et il ne faut pas le confondre avec les comptes.**
 * Les comptes disent *qui* vous êtes — e-mail, mot de passe haché, jeton signé côté FastAPI.
 * Ceci dit seulement *que le site n'est pas encore public* : un seul mot de passe pour tout
 * le monde, celui qu'on donne aux gens qu'on invite. Les deux se superposent sans se
 * remplacer : la porte s'ouvre, puis on se connecte.
 *
 * ⚠️ **Le mot de passe ne descend jamais dans le navigateur.** Le cookie porte une empreinte
 * HMAC-SHA256 d'une phrase fixe, signée par un secret qui ne quitte pas le serveur. Le
 * navigateur ne peut donc ni la calculer ni remonter au mot de passe — là où un cookie qui
 * vaudrait « ouvert=1 » se fabriquerait à la main en trois secondes depuis la console.
 *
 * Deux variables d'environnement, à poser sur le serveur :
 *
 *   NOVAC_ACCES_MOT_DE_PASSE   le mot de passe distribué aux invités
 *   NOVAC_ACCES_SECRET         une chaîne aléatoire, pour signer le cookie
 *
 * ⚠️ **Sans mot de passe défini, la porte n'existe pas** — le site répond comme avant. C'est
 * ce qui laisse le développement local intact, et c'est aussi le piège à connaître : oublier
 * la variable en production revient à publier le site ouvert. Rien ne peut le deviner à
 * votre place ; vérifiez-le une fois la mise en ligne faite.
 */

/** Le nom du cookie qui porte l'empreinte. */
export const COOKIE_ACCES = "novac_acces";

/**
 * La phrase signée. Sa valeur n'a aucune importance — seule compte l'impossibilité de
 * produire sa signature sans le secret.
 */
const PHRASE = "novac-alpha-fermee";

/** Le mot de passe attendu, ou une chaîne vide si la porte est désactivée. */
export const motDePasseAttendu = () => process.env.NOVAC_ACCES_MOT_DE_PASSE || "";

/**
 * L'empreinte que doit porter le cookie.
 *
 * ⚠️ `crypto.subtle` et non `node:crypto` : ce module est lu par le middleware, qui tourne
 * sur le runtime Edge où les modules Node n'existent pas. L'API Web Crypto, elle, est
 * présente des deux côtés.
 */
export async function empreinte(): Promise<string> {
  const secret = process.env.NOVAC_ACCES_SECRET || motDePasseAttendu();
  const cle = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cle, new TextEncoder().encode(PHRASE));
  /* ⚠️ `Array.from` et non l'étalement : la cible du projet est ES5, où itérer un
     `Uint8Array` demande `downlevelIteration`. Changer le réglage du compilateur pour une
     ligne aurait touché tout le code. */
  return Array.from(new Uint8Array(signature)).map(o => o.toString(16).padStart(2, "0")).join("");
}

/**
 * Compare deux chaînes en temps constant.
 *
 * ⚠️ `===` s'arrête au premier caractère qui diffère : le temps de réponse dit alors combien
 * de caractères sont justes, et le mot de passe se devine caractère par caractère. Le coût
 * ici est nul, l'habitude vaut mieux que le jugement au cas par cas.
 */
export function memeChaine(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let ecart = 0;
  for (let i = 0; i < a.length; i++) ecart |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return ecart === 0;
}
