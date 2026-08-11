/**
 * Le drapeau d'un pays, quel que soit le mot par lequel on le désigne.
 *
 * ⚠️ **Le problème n'était pas le nombre de drapeaux, mais le vocabulaire.** La
 * ventilation géographique recevait sept libellés français en dur — « États-Unis »,
 * « France », « Japon », « Chine », « Inde », « Europe », « Zone euro ». Or le pays
 * d'une **action** vient de `info["country"]` chez le fournisseur, et sort en
 * anglais : « Switzerland », « Taiwan », « South Korea ». Aucune action ne pouvait
 * donc afficher de drapeau, quel que soit son pays — pas même les États-Unis, qui
 * arrivent en « United States ». Seuls les fonds, dont la zone se déduit du mandat
 * en français, en obtenaient un. Le serveur le dit lui-même dans `analyse.py` :
 * « les deux vocabulaires arrivent mélangés dans la même ventilation ».
 *
 * ⚠️ **Trois formes à accepter, mesurées sur les routes du serveur.**
 * `/api/v1/quote/NESN.SW` rend `country: "Switzerland"`, `/api/v1/similar/AAPL` rend
 * `country: "US"`, et la ventilation des fonds rend « Japon ». Un résolveur qui n'en
 * couvrirait qu'une laisserait les deux autres sans drapeau.
 *
 * ⚠️ **Les noms ne sont pas recopiés, ils sont demandés à la plateforme.**
 * `Intl.DisplayNames` nomme chaque code en anglais et en français : 404 entrées
 * d'index pour 245 pays, sans collision, mesuré. Une table écrite à la main aurait
 * fait quatre cents lignes de données à tenir à jour, et se serait trompée en
 * silence — c'est exactement la panne qu'on répare.
 *
 * ⚠️ **Un agrégat n'a pas de drapeau, et c'est la bonne réponse.** « Marchés
 * émergents », « Monde développé », « Asie-Pacifique » sont des ensembles de pays :
 * leur prêter le pavillon du pays dominant ferait lire une exposition qui n'est pas
 * celle des chiffres. Ils ne correspondent à aucun nom de pays, donc ils tombent
 * naturellement sur `null` — et le test le vérifie, pour que ce soit une décision
 * et non un hasard.
 */

/**
 * Les codes que le jeu de drapeaux sait effectivement dessiner.
 *
 * ⚠️ **Recopiés ici plutôt qu'importés du paquet, et c'est délibéré.** Lire
 * `Object.keys(paquet)` obligerait à importer les 261 drapeaux **et** leurs 261
 * variantes rondes dans le fichier de rendu, alors que `CountryFlagRounded` n'a
 * besoin que du premier jeu. Le test compare cette liste à ce que le paquet exporte
 * vraiment : elle ne peut donc pas dériver sans qu'un test tombe.
 *
 * ⚠️ Tous ne sont pas des pays. `eu` est l'Union européenne — le pavillon que la
 * ventilation emploie déjà pour « Europe » —, et `ib`, `xo`, `xa`, `un` ne sont pas
 * des codes ISO : la plateforme ne leur connaît aucun nom, ils ne sont donc
 * atteignables que par leur code.
 */
const CODES_DESSINABLES = [
  "ad", "ae", "af", "ag", "ai", "al", "am", "ao", "ar", "as", "at", "au",
  "aw", "ax", "az", "ba", "bb", "bd", "be", "bf", "bg", "bh", "bi", "bj",
  "bl", "bm", "bn", "bo", "br", "bs", "bt", "bw", "by", "bz", "ca", "cc",
  "cd", "cf", "cg", "ch", "ci", "ck", "cl", "cm", "cn", "co", "cr", "cu",
  "cv", "cw", "cx", "cy", "cz", "de", "dj", "dk", "dm", "do", "dz", "ec",
  "ee", "eg", "eh", "er", "es", "et", "eu", "fi", "fj", "fk", "fm", "fo",
  "fr", "ga", "gb", "gd", "ge", "gf", "gg", "gh", "gi", "gl", "gm", "gn",
  "gq", "gr", "gt", "gu", "gw", "gy", "hk", "hm", "hn", "hr", "ht", "hu",
  "ib", "ic", "id", "ie", "il", "im", "in", "io", "iq", "ir", "is", "it",
  "je", "jm", "jo", "jp", "ke", "kg", "kh", "ki", "km", "kn", "kp", "kr",
  "kw", "ky", "kz", "la", "lb", "lc", "li", "lk", "lr", "ls", "lt", "lu",
  "lv", "ly", "ma", "mc", "md", "me", "mg", "mh", "mk", "ml", "mm", "mn",
  "mo", "mp", "mq", "mr", "ms", "mt", "mu", "mv", "mw", "mx", "my", "mz",
  "na", "nc", "ne", "nf", "ng", "ni", "nl", "no", "np", "nr", "nu", "nz",
  "om", "pa", "pe", "pf", "pg", "ph", "pk", "pl", "pn", "pr", "ps", "pt",
  "pw", "py", "qa", "re", "ro", "rs", "ru", "rw", "sa", "sb", "sc", "sd",
  "se", "sg", "si", "sk", "sl", "sm", "sn", "so", "sr", "ss", "st", "sv",
  "sx", "sy", "sz", "tc", "td", "tf", "tg", "th", "tj", "tk", "tl", "tm",
  "tn", "to", "tr", "tt", "tv", "tw", "tz", "ua", "ug", "un", "us", "uy",
  "uz", "va", "vc", "ve", "vg", "vi", "vn", "vu", "wf", "ws", "xa", "xk",
  "xo", "ye", "za", "zm", "zw",
];

/**
 * Les libellés que l'index des noms ne rattrape pas.
 *
 * Chacun est une divergence **constatée**, pas une précaution : la plateforme et le
 * fournisseur ne nomment pas ces quatre-là de la même façon.
 *
 * - `Hong Kong` : la plateforme dit « Hong Kong SAR China », le fournisseur « Hong
 *   Kong » tout court — c'est aussi ainsi que `PAYS_VERS_REGION` l'écrit.
 * - `Turkey` : la plateforme dit « Türkiye » depuis le changement de nom de 2022, le
 *   fournisseur est resté à « Turkey ».
 * - `Europe` et `Zone euro` ne sont pas des pays. Ce sont les deux seuls agrégats à
 *   recevoir un pavillon, celui de l'Union européenne, et ils l'avaient déjà avant
 *   ce module : le retirer aurait été une régression.
 */
const ALIAS: Record<string, string> = {
  "hong kong": "hk",
  "turkey": "tr",
  "europe": "eu",
  "zone euro": "eu",
};

/** Minuscules, sans accents, espaces resserrés — « Taïwan » et « Taiwan » se rejoignent. */
function normaliser(libelle: string): string {
  return libelle
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * L'index nom → code, construit une fois puis gardé.
 *
 * Construit à la demande et non au chargement du module : 245 codes × 2 langues,
 * c'est rapide mais inutile tant qu'aucun drapeau n'est demandé.
 */
let index: Record<string, string> | null = null;

function indexDesNoms(): Record<string, string> {
  if (index) return index;
  const table: Record<string, string> = {};
  try {
    const langues = [
      new Intl.DisplayNames(["en"], { type: "region" }),
      new Intl.DisplayNames(["fr"], { type: "region" }),
    ];
    for (let i = 0; i < CODES_DESSINABLES.length; i++) {
      const code = CODES_DESSINABLES[i];
      const majuscule = code.toUpperCase();
      for (let j = 0; j < langues.length; j++) {
        // Sur un code que la plateforme ne connaît pas, `of` rend le code lui-même :
        // c'est le repli par défaut, et il signale ici « pas de nom ».
        const nom = langues[j].of(majuscule);
        if (!nom || nom === majuscule) continue;
        const cle = normaliser(nom);
        if (!table[cle]) table[cle] = code;
      }
    }
  } catch {
    // ⚠️ Un environnement sans `Intl.DisplayNames` perd les noms, pas les drapeaux :
    // les codes à deux lettres et les alias continuent de répondre. Le pire cas est
    // une ligne sans pavillon, jamais un écran blanc.
  }
  index = table;
  return table;
}

/**
 * Le code ISO à deux lettres d'un libellé de pays, ou `null`.
 *
 * Accepte les trois formes que le serveur produit : un code (« US »), un nom anglais
 * (« Switzerland ») et un nom français (« Japon »).
 *
 * ⚠️ Rend `null` plutôt qu'un code douteux, et ce garde est la raison d'être de la
 * fonction. Mesuré sur `CountryFlagRounded` : un code inconnu ne lève pas mais ne
 * dessine **rien** — un avertissement en console et un vide de la taille demandée —
 * et un code `null` lève sur `toUpperCase`. Tout ce qui n'est pas résolu ici est
 * donc arrêté avant le rendu.
 */
export function codePaysDrapeau(libelle: string | null | undefined): string | null {
  if (typeof libelle !== "string") return null;
  const cle = normaliser(libelle);
  if (!cle) return null;
  if (cle.length === 2 && CODES_DESSINABLES.indexOf(cle) >= 0) return cle;
  const alias = ALIAS[cle];
  if (alias) return alias;
  return indexDesNoms()[cle] ?? null;
}

/** Les codes dessinables, pour que le test les confronte à ce que le paquet exporte. */
export const CODES_PAYS = CODES_DESSINABLES;
