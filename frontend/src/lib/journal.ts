/**
 * Lecture du journal des transactions.
 *
 * Tout ce que la page Transactions affiche se déduit des écritures : le type
 * d'une opération, ce qu'elle a rapporté, la durée de détention. Ces calculs
 * sont ici plutôt que dans le rendu — une erreur y serait invisible à l'écran,
 * un « meilleure opération » faux ressemble à un « meilleure opération » juste.
 */

export type Tx = {
  id: number;
  ticker: string;
  asset_type: string;
  side: "BUY" | "SELL";
  quantity: number;
  unit_price: number;
  fees: number;
  executed_at: string;
  note?: string | null;
  /**
   * Le compte déclaré où cette écriture est rangée, ou `null` si elle ne l'est pas.
   *
   * ⚠️ **Le serveur l'envoie depuis toujours ; c'est l'écran qui le jetait.** La page
   * portefeuille lit déjà ce journal pour poser les repères de la courbe, et le champ
   * tombait au `.map`. Le déclarer ici évite d'aller redemander au serveur ce qu'il a déjà
   * dit — voir `comptesParTicker` dans `dossiers.ts`.
   */
  compte_id?: string | null;
};

/**
 * Nature d'une opération.
 *
 * Le premier achat d'un titre ouvre une ligne, les suivants la renforcent.
 * La distinction ne tient pas dans les données — les deux sont des BUY — mais
 * elle se lit dans l'ordre chronologique.
 *
 * Une vente qui solde la ligne et une vente qui n'en cède qu'une part ne disent
 * pas la même chose : la première referme une position, la seconde l'allège. La
 * distinction se lit dans la quantité restante, comme celle entre achat et
 * renforcement se lit dans l'ordre chronologique.
 */
export type TypeOp = "achat" | "renforcement" | "vente" | "vente_partielle";

export const LIBELLE_OP: Record<TypeOp, string> = {
  achat: "Achat",
  renforcement: "Renforcement",
  vente: "Vente",
  vente_partielle: "Vente partielle",
};

export const COULEUR_OP: Record<TypeOp, string> = {
  achat: "#00D492",
  renforcement: "#50A2FF",
  vente: "#FF6467",
  // L'ambre du thème — `--nv-attention` — et non une teinte inventée : une
  // sortie partielle se distingue ainsi d'une sortie totale au premier regard,
  // sans introduire une cinquième couleur dans l'application.
  vente_partielle: "#FF8904",
};

/**
 * Les mêmes types, sur fond clair.
 *
 * Les teintes du thème sombre sont choisies pour briller sur du noir : posées
 * sur blanc, `#4ade80` tombe à 1,6:1. La pastille devient un halo, et le
 * pictogramme blanc qu'elle porte disparaît tout à fait. Celles-ci sont
 * assombries jusqu'à porter du blanc.
 */
export const COULEUR_OP_CLAIR: Record<TypeOp, string> = {
  achat: "#00884D",
  renforcement: "#2177D1",
  vente: "#EA0B27",
  vente_partielle: "#D64200",
};

/**
 * Le tracé de chaque type, sur une boîte de 24 unités et en `fill`.
 *
 * ⚠️ Rangés ici plutôt que dans le composant, pour que TypeScript garantisse
 * qu'aucun type n'est sans glyphe : un `Record<TypeOp, …>` refuse la compilation
 * si l'on ajoute un type sans son dessin. Une liste de `if` dans le composant
 * aurait laissé passer un type muet, qui serait retombé silencieusement sur le
 * glyphe par défaut.
 *
 * Un chariot pour l'ouverture d'une ligne, une étiquette pour sa fermeture, et
 * deux flèches pour ce qui ajoute ou retranche sans changer la nature de la
 * position. Les deux flèches sont la même, retournée : c'est ce qui fait lire
 * « allègement » en face de « renforcement ».
 */
export const GLYPHE_OP: Record<TypeOp, string> = {
  achat:
    "M6.167 2.25a.97.97 0 0 1 .965.86l.007.115v1.041l12.708.912a.97.97 0 0 1 "
    + ".903.998l-.01.111-.972 6.826a.976.976 0 0 1-.853.831l-.11.006H7.14v1.95h9.722a2.91 "
    + "2.91 0 0 1 2.678 1.766 2.93 2.93 0 0 1-.556 3.166 2.914 2.914 0 0 "
    + "1-5.034-1.835l-.005-.172.005-.172q.026-.422.162-.803H8.917a2.93 2.93 0 0 1-1.04 "
    + "3.341 2.914 2.914 0 0 1-4.622-2.194l-.005-.172.005-.172a2.93 2.93 0 0 1 "
    + "1.94-2.587V4.2h-.973a.97.97 0 0 1-.965-.86l-.007-.115a.98.98 0 0 1 "
    + ".858-.968l.114-.007zm0 15.6a.97.97 0 0 0-.973.975.976.976 0 0 0 .973.975.97.97 0 0 "
    + "0 .972-.975.976.976 0 0 0-.972-.975m10.694 0a.97.97 0 0 0-.972.975.976.976 0 0 0 "
    + ".972.975.97.97 0 0 0 .972-.975.976.976 0 0 0-.972-.975",
  vente:
    "M11.192 2.25c.776 0 1.52.308 2.068.857l7.516 7.517a3.325 3.325 0 0 1 0 "
    + "4.7l-5.451 5.452a3.324 3.324 0 0 1-4.701 0L3.107 13.26a2.93 2.93 0 0 "
    + "1-.857-2.068V6.15a3.9 3.9 0 0 1 3.9-3.9zm-3.58 3.412a1.95 1.95 0 0 0-1.945 "
    + "1.804l-.005.146a1.95 1.95 0 1 0 1.95-1.95",
  renforcement:
    "m10.642 2.818-6.329 6.39a1.958 1.958 0 0 0-.417 2.115l.066.14c.16.318.406.585.708.77."
    + "301.187.648.286 1.002.286h2.485v6.79c0 .515.202 1.009.563 1.373s.849.568 1.359."
    + "568h3.843l.144-.005a1.92 1.92 0 0 0 1.265-.615c.33-.36.513-.83.513-1.32l-.001-6."
    + "79h2.486c.38-.001.751-.115 1.067-.328s.562-.516.708-.87a1.96 1.96 0 0 "
    + "0-.417-2.115L13.36 2.818a1.913 1.913 0 0 0-2.717 0",
  vente_partielle:
    "m10.078 2.75-.144.005a1.92 1.92 0 0 0-1.265.615 1.95 1.95 0 0 0-.513 1.32v6.79H5."
    + "671c-.38.001-.751.115-1.067.328a1.94 1.94 0 0 0-.708.87 1.96 1.96 0 0 0 .417 "
    + "2.115l6.328 6.389a1.91 1.91 0 0 0 2.717 0l6.329-6.39a1.958 1.958 0 0 0 "
    + ".417-2.115l-.066-.14a1.93 1.93 0 0 0-.707-.77 1.9 1.9 0 0 0-1.003-.286l-2.485-."
    + "001V4.69a1.95 1.95 0 0 0-.563-1.372 1.91 1.91 0 0 0-1.359-.568z",
};

/** Les écritures, classées de la plus ancienne à la plus récente. */
export function parDate(txs: Tx[]): Tx[] {
  return [...txs].sort((a, b) => a.executed_at.localeCompare(b.executed_at));
}

/**
 * Type de chaque opération, indexé par identifiant.
 *
 * Une vente totale referme la ligne : un achat ultérieur du même titre est un
 * nouvel achat, pas un renforcement.
 */
export function typesParOperation(txs: Tx[]): Record<number, TypeOp> {
  const detenu: Record<string, number> = {};
  const out: Record<number, TypeOp> = {};

  for (const t of parDate(txs)) {
    const q = detenu[t.ticker] ?? 0;
    if (t.side === "SELL") {
      // Solder la ligne ou l'alléger : c'est la quantité restante qui tranche.
      //
      // ⚠️ La même tolérance que partout ailleurs dans cette fonction, et elle
      // est nécessaire : les quantités sont fractionnaires, et une cession
      // intégrale saisie en plusieurs décimales laisse un résidu de l'ordre de
      // 10⁻¹⁵. Comparer à zéro strictement aurait rangé une sortie totale parmi
      // les allègements.
      const reste = q - t.quantity;
      out[t.id] = reste > 1e-9 ? "vente_partielle" : "vente";
      detenu[t.ticker] = Math.max(0, reste);
    } else {
      out[t.id] = q > 1e-9 ? "renforcement" : "achat";
      detenu[t.ticker] = q + t.quantity;
    }
  }
  return out;
}

/** Montant d'une opération, frais compris. */
export function montant(t: Tx): number {
  return t.quantity * t.unit_price + (t.fees ?? 0);
}

export type ResultatOp = {
  tx: Tx;
  type: TypeOp;
  /** Gain de la ligne : latent pour un achat encore détenu, réalisé pour une vente. */
  gain: number | null;
  gainPct: number | null;
  /** Réalisé pour une vente, latent pour un achat. */
  realise: boolean;
};

/**
 * Ce que chaque opération a rapporté.
 *
 * Pour un achat, l'écart entre le cours d'aujourd'hui et le prix payé. Pour une
 * vente, l'écart entre le prix de cession et le prix de revient au moment où
 * elle a eu lieu — et non le prix de revient actuel, qui a changé depuis.
 */
export function resultats(txs: Tx[], cours: Record<string, number | null | undefined>): ResultatOp[] {
  const pru: Record<string, { qty: number; invested: number }> = {};
  const types = typesParOperation(txs);
  const out: ResultatOp[] = [];

  for (const t of parDate(txs)) {
    const etat = pru[t.ticker] ?? { qty: 0, invested: 0 };
    const type = types[t.id];

    if (t.side === "BUY") {
      etat.invested += montant(t);
      etat.qty += t.quantity;
      pru[t.ticker] = etat;

      const p = cours[t.ticker];
      const gain = p != null ? t.quantity * p - montant(t) : null;
      out.push({
        tx: t, type, gain, realise: false,
        gainPct: gain != null && montant(t) > 0 ? (gain / montant(t)) * 100 : null,
      });
    } else {
      const prixRevient = etat.qty > 1e-9 ? etat.invested / etat.qty : 0;
      const gain = t.quantity * (t.unit_price - prixRevient) - (t.fees ?? 0);
      const base = t.quantity * prixRevient;
      etat.qty = Math.max(0, etat.qty - t.quantity);
      etat.invested = prixRevient * etat.qty;
      pru[t.ticker] = etat;

      out.push({
        tx: t, type, gain, realise: true,
        gainPct: base > 0 ? (gain / base) * 100 : null,
      });
    }
  }
  return out;
}

export type Resume = {
  operations: number;
  capitalInvesti: number;
  gainLatent: number | null;
  meilleure: ResultatOp | null;
  pire: ResultatOp | null;
  dureeMoyenneJours: number | null;
};

/**
 * Le récapitulatif du journal.
 *
 * `capitalInvesti` est ce qui reste engagé — achats moins ventes —, non la
 * somme brute des achats : après une revente, l'argent est ressorti.
 */
export function resume(
  txs: Tx[],
  cours: Record<string, number | null | undefined>,
  aujourdhui = new Date(),
): Resume {
  const res = resultats(txs, cours);
  const capitalInvesti = txs.reduce(
    (s, t) => s + (t.side === "BUY" ? montant(t) : -(t.quantity * t.unit_price - (t.fees ?? 0))),
    0,
  );

  const chiffres = res.filter(r => r.gain != null);
  const trie = [...chiffres].sort((a, b) => (b.gain ?? 0) - (a.gain ?? 0));

  // Durée de détention, pondérée par les montants : un versement de 1 000 €
  // fait il y a un mois pèse davantage qu'un de 50 € fait il y a un an.
  const achats = txs.filter(t => t.side === "BUY");
  const pondere = achats.reduce((s, t) => {
    const jours = (aujourdhui.getTime() - new Date(t.executed_at).getTime()) / 86400000;
    return s + montant(t) * Math.max(0, jours);
  }, 0);
  const total = achats.reduce((s, t) => s + montant(t), 0);

  const gainLatent = chiffres.length
    ? res.filter(r => !r.realise).reduce((s, r) => s + (r.gain ?? 0), 0)
    : null;

  return {
    operations: txs.length,
    capitalInvesti,
    gainLatent,
    meilleure: trie[0] ?? null,
    pire: trie.length > 1 ? trie[trie.length - 1] : null,
    dureeMoyenneJours: total > 0 ? Math.round(pondere / total) : null,
  };
}

/** Part de chaque type d'opération, en pourcentage du nombre d'écritures. */
export function repartitionTypes(txs: Tx[]): { type: TypeOp; part: number; nombre: number }[] {
  if (!txs.length) return [];
  const types = typesParOperation(txs);
  const compte: Record<TypeOp, number> = {
    achat: 0, renforcement: 0, vente_partielle: 0, vente: 0,
  };
  for (const t of txs) compte[types[t.id]] += 1;

  return (Object.keys(compte) as TypeOp[])
    .filter(k => compte[k] > 0)
    .map(k => ({ type: k, nombre: compte[k], part: (compte[k] / txs.length) * 100 }));
}
