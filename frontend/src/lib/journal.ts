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
};

/**
 * Nature d'une opération.
 *
 * Le premier achat d'un titre ouvre une ligne, les suivants la renforcent.
 * La distinction ne tient pas dans les données — les deux sont des BUY — mais
 * elle se lit dans l'ordre chronologique.
 */
export type TypeOp = "achat" | "renforcement" | "vente";

export const LIBELLE_OP: Record<TypeOp, string> = {
  achat: "Achat",
  renforcement: "Renforcement",
  vente: "Vente",
};

export const COULEUR_OP: Record<TypeOp, string> = {
  achat: "#00D492",
  renforcement: "#50A2FF",
  vente: "#FF6467",
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
      out[t.id] = "vente";
      detenu[t.ticker] = Math.max(0, q - t.quantity);
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
  const compte: Record<TypeOp, number> = { achat: 0, renforcement: 0, vente: 0 };
  for (const t of txs) compte[types[t.id]] += 1;

  return (Object.keys(compte) as TypeOp[])
    .filter(k => compte[k] > 0)
    .map(k => ({ type: k, nombre: compte[k], part: (compte[k] / txs.length) * 100 }));
}
