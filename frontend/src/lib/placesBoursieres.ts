/**
 * Les places de cotation : leur nom lisible et le pays de leur drapeau.
 *
 * ⚠️ **Une seule table, parce qu'il y en avait deux.** `AssetHeroCard` portait
 * `EXCHANGE_LABELS`/`EXCHANGE_FLAGS`, la page du graphique portait `_EXCH`/`_EXCH_FLAG`
 * — quatre objets pour deux correspondances, recopiés à l'identique dans deux
 * fichiers. Le nom et le pays sont réunis dans une seule entrée parce qu'ils ne
 * peuvent pas diverger sans faute visible : une place connue du drapeau mais pas du
 * libellé affiche « TAI 🇹🇼 », c'est-à-dire un code brut à côté de son drapeau.
 *
 * ⚠️ **Les codes sont relevés, pas devinés.** Chaque entrée a été constatée en
 * interrogeant le fournisseur — `backend/scripts/releve_places.py`, qui lit
 * `yf.Ticker(t).info["exchange"]` sur un gros titre de chaque place. Ce n'est pas un
 * scrupule : les anciennes tables contenaient `SWX` pour la Suisse, que le
 * fournisseur n'a jamais renvoyé — il dit `EBS` —, et `EBS` manquait. Les trois
 * actions suisses du catalogue s'affichaient donc sans drapeau *et* sans nom de
 * place, alors que la table avait l'air de couvrir la Suisse. Un code inventé ne
 * lève pas et n'écrit rien dans la console : il rend un vide qui ressemble à une
 * absence de donnée.
 *
 * ⚠️ **Ce que couvrir Taïwan et la Corée voulait dire.** `TAI`, `TWO`, `KSC`, `KOE`,
 * `SES`, `STO`, `CPH`, `OSL`, `HEL` : aucun de ces codes n'était dans les anciennes
 * tables, et le dossier `public/drapeaux` n'avait de toute façon que dix-sept
 * fichiers. 2330.TW et 005930.KS — les deux premières lignes asiatiques d'un vrai
 * portefeuille — sortaient donc sans drapeau.
 */

/** Une place : le nom qu'on affiche, et le pays dont on tire le drapeau. */
export type PlaceBoursiere = {
  /** Le nom montré dans la pastille, à la place du code. */
  libelle: string;
  /** Le code ISO à deux lettres du pays, tel que le jeu de drapeaux l'attend. */
  pays: string;
};

/**
 * Les places dont le code a été **constaté** chez le fournisseur.
 *
 * Exportée à part de `PLACES` pour que le test puisse la confronter au relevé, clé
 * par clé. Sans cette séparation, `TIA` au lieu de `TAI` passerait : l'entrée serait
 * simplement inatteignable, et le drapeau de Taïwan resterait absent comme avant.
 *
 * Le pays est celui de la **place**, pas celui de l'émetteur : Nestlé cote à Zurich
 * et porte donc le drapeau suisse, y compris dans un portefeuille français. C'est ce
 * que la pastille annonce — « SIX Swiss », le lieu de cotation.
 */
export const PLACES_RELEVEES: Record<string, PlaceBoursiere> = {
  // ── Amérique du Nord ────────────────────────────────────────────────────────
  NMS: { libelle: "Nasdaq GS", pays: "us" },
  NGM: { libelle: "Nasdaq GM", pays: "us" },
  NCM: { libelle: "Nasdaq CM", pays: "us" },
  NYQ: { libelle: "NYSE", pays: "us" },
  PCX: { libelle: "NYSE Arca", pays: "us" },
  BTS: { libelle: "Cboe BZX", pays: "us" },
  PNK: { libelle: "OTC Pink", pays: "us" },
  TOR: { libelle: "Toronto", pays: "ca" },

  // ── Europe ──────────────────────────────────────────────────────────────────
  PAR: { libelle: "Euronext Paris", pays: "fr" },
  AMS: { libelle: "Amsterdam", pays: "nl" },
  BRU: { libelle: "Bruxelles", pays: "be" },
  LIS: { libelle: "Lisbonne", pays: "pt" },
  ISE: { libelle: "Dublin", pays: "ie" },
  GER: { libelle: "Xetra", pays: "de" },
  FRA: { libelle: "Francfort", pays: "de" },
  LSE: { libelle: "London SE", pays: "gb" },
  MCE: { libelle: "Madrid", pays: "es" },
  MIL: { libelle: "Milan", pays: "it" },
  EBS: { libelle: "SIX Swiss", pays: "ch" },
  VIE: { libelle: "Vienne", pays: "at" },
  STO: { libelle: "Stockholm", pays: "se" },
  CPH: { libelle: "Copenhague", pays: "dk" },
  OSL: { libelle: "Oslo", pays: "no" },
  HEL: { libelle: "Helsinki", pays: "fi" },

  // ── Asie et Pacifique ───────────────────────────────────────────────────────
  TAI: { libelle: "Taïwan", pays: "tw" },
  TWO: { libelle: "Taipei Exchange", pays: "tw" },
  KSC: { libelle: "KOSPI", pays: "kr" },
  KOE: { libelle: "KOSDAQ", pays: "kr" },
  SES: { libelle: "Singapour", pays: "sg" },
  HKG: { libelle: "Hong Kong", pays: "hk" },
  JPX: { libelle: "Tokyo", pays: "jp" },
  SHH: { libelle: "Shanghai", pays: "cn" },
  SHZ: { libelle: "Shenzhen", pays: "cn" },
  NSI: { libelle: "NSE Inde", pays: "in" },
  BSE: { libelle: "BSE Inde", pays: "in" },
  ASX: { libelle: "Sydney", pays: "au" },
  NZE: { libelle: "Nouvelle-Zélande", pays: "nz" },

  // ── Amérique du Sud ─────────────────────────────────────────────────────────
  SAO: { libelle: "São Paulo", pays: "br" },
};

/**
 * Les codes que le relevé ne rend pas, mais qui arrivent quand même jusqu'ici.
 *
 * `NYSEArca` vient du catalogue en dur : `TRENDING` note ainsi vingt et un fonds
 * cotés que le fournisseur, lui, appelle `PCX`. Les deux orthographes atteignent
 * l'écran selon la provenance de l'actif — le catalogue ou la recherche — donc les
 * deux doivent répondre.
 *
 * Les quatre autres viennent des anciennes tables et n'ont été rendus par aucun des
 * soixante et onze titres du relevé : le fournisseur dit `NMS` et non `NMQ`, `JPX`
 * et non `TYO`, `TOR` et non `TSX`, `EBS` et non `SWX`. Gardés parce qu'une entrée
 * jamais atteinte ne coûte rien, alors qu'une entrée retirée à tort rend un drapeau
 * vide — la panne qu'on est en train de réparer. À supprimer le jour où on saura
 * d'où venaient ces quatre-là.
 */
export const PLACES_HORS_RELEVE: Record<string, PlaceBoursiere> = {
  NYSEArca: { libelle: "NYSE Arca", pays: "us" },
  NMQ: { libelle: "Nasdaq", pays: "us" },
  TYO: { libelle: "Tokyo", pays: "jp" },
  TSX: { libelle: "Toronto", pays: "ca" },
  SWX: { libelle: "SIX Swiss", pays: "ch" },
};

/** Toutes les places, quelle que soit leur provenance. */
export const PLACES: Record<string, PlaceBoursiere> = {
  ...PLACES_RELEVEES,
  ...PLACES_HORS_RELEVE,
};

/**
 * Le nom lisible d'une place, ou `null` si on ne la connaît pas.
 *
 * L'appelant retombe sur le code brut — « Euronext Paris » vaut mieux que « PAR »,
 * mais « PAR » vaut mieux que rien : il dit au moins où le titre cote.
 */
export function libellePlace(code: string | null | undefined): string | null {
  return (code && PLACES[code]?.libelle) || null;
}

/**
 * Le code pays d'une place, ou `null`.
 *
 * ⚠️ **Le test sur la forme n'est pas décoratif**, et c'est lui qui fait de cette
 * fonction le seul point d'entrée du drapeau. Mesuré sur `CountryFlagRounded` : un
 * code inconnu ne lève pas, il ne dessine **rien** — un avertissement en console et
 * un vide de la taille demandée — et un code `null` lève sur `toUpperCase`. Une
 * coquille dans `PLACES` produirait donc soit un trou muet, soit un écran blanc.
 * Ici elle produit `null`, c'est-à-dire pas de drapeau du tout, et le test de ce
 * module la rattrape avant l'écran.
 */
export function paysDeLaPlace(code: string | null | undefined): string | null {
  const pays = code ? PLACES[code]?.pays : undefined;
  return typeof pays === "string" && pays.length === 2 ? pays : null;
}
