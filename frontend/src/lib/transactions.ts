import type { DraftTx } from "@/components/TransactionModal";

/**
 * Construction des écritures d'un portefeuille.
 *
 * Le portefeuille n'est qu'une allocation cible ; ce sont les transactions,
 * datées, qui portent le prix de revient. Le calcul qui les fabrique est isolé
 * ici parce qu'une erreur y est invisible : une quantité fausse ne se voit pas
 * à l'écran, elle se voit six mois plus tard sur une performance fausse.
 */

export type Pondere = { ticker: string; name: string; weight: number; type: string };

/** Arrondi d'affichage d'un cours : deux décimales, six sous l'euro. */
export function arrondirCours(prix: number): number {
  return parseFloat(prix.toFixed(prix >= 1 ? 2 : 6));
}

/**
 * Répartit `montant` sur `assets` au prorata des poids, aux cours de `cours`.
 *
 * Les cours attendus sont ceux de `date` — c'est le point : une transaction
 * datée du 15 mars valorisée au cours d'aujourd'hui donne un prix de revient
 * faux, et rien dans l'interface ne le signale.
 *
 * Les actifs sans cours connu sont écartés ; l'appelant les signale.
 */
export function repartir(
  assets: Pondere[],
  cours: Record<string, number>,
  montant: number,
  date: string,
): DraftTx[] {
  if (!(montant > 0)) return [];
  return assets
    .filter(a => typeof cours[a.ticker] === "number" && cours[a.ticker] > 0)
    .map(a => {
      const prix = cours[a.ticker];
      return {
        ticker:      a.ticker.toUpperCase(),
        asset_type:  a.type || "EQUITY",
        name:        a.name,
        side:        "BUY" as const,
        quantity:    parseFloat((montant * a.weight / 100 / prix).toFixed(6)),
        unit_price:  arrondirCours(prix),
        fees:        0,
        executed_at: `${date}T00:00:00`,
      };
    });
}

/** Tickers de `assets` dont le cours manque dans `cours`. */
export function sansCours(assets: Pondere[], cours: Record<string, number>): string[] {
  return assets
    .filter(a => !(typeof cours[a.ticker] === "number" && cours[a.ticker] > 0))
    .map(a => a.ticker);
}

/** Une ligne du portefeuille, telle que les écritures la produisent. */
export type LignePortefeuille = {
  ticker: string; name: string; type: string;
  quantity: number; invested: number; avgCost: number;
  price: number | null; value: number | null; weight: number;
};

/**
 * Agrège les écritures en composition.
 *
 * Les poids ne sont plus saisis, ils se déduisent : un poids réglé au curseur
 * décrit une intention, une quantité décrit une détention. Les deux divergent
 * dès la première séance, et c'est la seconde qui est vraie.
 *
 * Le prix de revient suit la même règle que le backend (`compute_positions`) :
 * une vente ne le déplace pas, elle réduit la quantité et le capital engagé au
 * prorata. Vendre à perte ne doit pas faire baisser le prix d'achat moyen.
 */
export function agreger(
  lignes: DraftTx[],
  cours: Record<string, { price?: number | null } | undefined> = {},
): LignePortefeuille[] {
  const parTicker = new Map<string, LignePortefeuille>();

  // Chronologique : le prix de revient dépend de l'ordre des opérations.
  const ordonnees = [...lignes].sort((a, b) => a.executed_at.localeCompare(b.executed_at));

  for (const t of ordonnees) {
    const l = parTicker.get(t.ticker) ?? {
      ticker: t.ticker, name: t.name, type: t.asset_type,
      quantity: 0, invested: 0, avgCost: 0, price: null, value: null, weight: 0,
    };
    if (t.side === "BUY") {
      l.invested += t.quantity * t.unit_price + t.fees;
      l.quantity += t.quantity;
      l.avgCost   = l.quantity > 0 ? l.invested / l.quantity : 0;
    } else {
      l.quantity = Math.max(0, l.quantity - t.quantity);
      l.invested = l.avgCost * l.quantity;   // le PRU ne bouge pas à la vente
    }
    parTicker.set(t.ticker, l);
  }

  // Une position soldée n'est plus détenue : elle sort de la composition.
  const lignesGardees = Array.from(parTicker.values()).filter(l => l.quantity > 1e-9);

  for (const l of lignesGardees) {
    const p = cours[l.ticker]?.price;
    l.price = typeof p === "number" && p > 0 ? p : null;
    l.value = l.price != null ? l.quantity * l.price : null;
  }

  // Poids sur la valeur de marché quand elle est connue, sinon sur le capital
  // engagé — sans quoi un cours manquant effacerait la ligne du croissant.
  const base = lignesGardees.map(l => l.value ?? l.invested);
  const total = base.reduce((s, v) => s + v, 0);
  lignesGardees.forEach((l, i) => {
    l.weight = total > 0 ? (base[i] / total) * 100 : 0;
  });

  return lignesGardees.sort((a, b) => (b.value ?? b.invested) - (a.value ?? a.invested));
}

/**
 * Capital réellement engagé par une série d'écritures.
 *
 * Une vente rend du capital, les frais en consomment. Cette somme remplace la
 * saisie « capital investi » : deux nombres censés dire la même chose finissent
 * toujours par diverger.
 */
export function capitalEngage(lignes: DraftTx[]): number {
  return lignes.reduce(
    (s, t) => s + (t.side === "BUY" ? 1 : -1) * t.quantity * t.unit_price + t.fees,
    0,
  );
}
