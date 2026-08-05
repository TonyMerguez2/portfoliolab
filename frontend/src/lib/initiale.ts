/**
 * L'initiale qui tient lieu d'image, pour un portefeuille sans photo.
 */

/**
 * Ce qui ne peut pas servir d'initiale : espaces, ponctuation, symboles.
 *
 * Le jeu est décrit en négatif — ce qu'on écarte — plutôt qu'en positif. Dire
 * « une lettre ou un chiffre » demanderait `\p{L}`, indisponible avec la cible
 * ES5 du projet, et surtout exclurait les écritures sans casse : un nom en
 * chinois ou en arabe n'aurait alors pas d'initiale du tout.
 */
const SANS_IDENTITE = /[\s\-—–_.,;:!?'"«»()[\]{}/\\|@#*+=<>~`^$%&]/;

/**
 * Le premier caractère porteur d'un nom, en capitale.
 *
 * On cherche le premier caractère *porteur*, pas le premier caractère : un nom
 * comme « — PEA » ou « (ancien) Livret » donnerait sinon une vignette portant
 * un tiret ou une parenthèse.
 *
 * La lecture se fait par unité de code, et les paires de substitution sont
 * recollées : un nom commençant par un emoji renverrait autrement une moitié
 * de caractère, que le navigateur affiche en losange de remplacement.
 */
export function initiale(nom: string): string {
  const texte = nom ?? "";
  for (let i = 0; i < texte.length; i++) {
    const c = texte.charAt(i);
    if (SANS_IDENTITE.test(c)) continue;
    const code = texte.charCodeAt(i);
    const entier = code >= 0xd800 && code <= 0xdbff && i + 1 < texte.length
      ? texte.substr(i, 2)
      : c;
    return entier.toLocaleUpperCase("fr");
  }
  return "◆";
}
