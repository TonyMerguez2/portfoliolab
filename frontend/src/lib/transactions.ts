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
