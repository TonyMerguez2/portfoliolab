/**
 * Le classement des actifs proposés par la palette de recherche.
 *
 * ⚠️ **Une fonction pure, hors du composant, parce qu'un tri se vérifie.** Les cas qui comptent —
 * un actif sans capitalisation, deux à égalité, une liste où aucun n'en a — se disent en trois
 * lignes de test et se voient mal à l'écran, où il faudrait deviner l'ordre attendu.
 */

/** Les ordres proposés à l'utilisateur. */
export type OrdreActifs = "pertinence" | "capitalisation";

/**
 * Trie une liste d'actifs, sans jamais la modifier sur place.
 *
 * ⚠️ **`pertinence` rend l'ordre reçu **inchangé**, et c'est tout l'intérêt.** Cet ordre porte
 * déjà une information : quand on a tapé quelque chose, c'est le classement de Yahoo par
 * proximité au texte ; quand le champ est vide, c'est l'ordre du catalogue, rangé du plus connu
 * au moins connu. Le remplacer par défaut ferait perdre les deux.
 *
 * ⚠️ **Un actif sans capitalisation va à la fin, il ne vaut pas zéro.** Les indices n'en ont
 * aucune — un indice ne se possède pas — et un titre exotique peut simplement n'avoir pas encore
 * été mesuré. Les placer à zéro les mettrait au **même rang** que les plus petites valeurs
 * connues, en les mêlant à des données réelles ; les mettre après dit ce qui est vrai : on ne
 * sait pas.
 *
 * ⚠️ **À égalité — deux inconnus, ou deux capitalisations identiques — l'ordre reçu tranche.**
 * `Array.prototype.sort` est stable depuis ES2019 : le comparateur n'a donc rien à faire pour
 * que la pertinence serve de second critère. Sans cette garantie, deux inconnus permuteraient
 * d'un rendu à l'autre et la liste tremblerait sous le curseur.
 */
export function trierActifs<T extends { ticker: string }>(
  actifs: readonly T[],
  ordre: OrdreActifs,
  capitalisations: Readonly<Record<string, number>>,
): T[] {
  if (ordre !== "capitalisation") return [...actifs];
  return [...actifs].sort((a, b) => {
    const ca = capitalisations[a.ticker];
    const cb = capitalisations[b.ticker];
    if (ca === undefined && cb === undefined) return 0;
    if (ca === undefined) return 1;
    if (cb === undefined) return -1;
    return cb - ca;
  });
}
