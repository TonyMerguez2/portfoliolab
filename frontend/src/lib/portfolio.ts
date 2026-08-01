/**
 * Tri, filtrage et classement des actifs d'un portefeuille.
 *
 * À part du composant, comme les autres modules purs du projet : ces règles
 * décident de ce que l'utilisateur voit et méritent d'être vérifiées sans
 * monter un rendu.
 */
export type GridAsset = {
  ticker: string;
  weight: number;
  price: number | null;
  change: number | null;
  value: number | null;
  perfEur: number | null;
  spark?: number[];
  updatedAt?: number;
  type?: string;
  /**
   * Plus-value de la position depuis son achat, quand les écritures la
   * donnent. Distincte de `change`, qui est la variation du cours sur la
   * période affichée : sur la fenêtre Max, un ETF né en 2021 affichait
   * « +520 % · +2 992 € » sur une ligne qui n'a jamais rapporté cela.
   */
  pnlEur?: number | null;
  pnlPct?: number | null;
  avgCost?: number | null;
  quantity?: number | null;
};

export type SortKey = "poids" | "perf" | "valeur" | "alpha";

const CRYPTO = /-(USD|EUR|USDT)$/i;
const ETF = /^(SPY|QQQ|IWM|VTI|VOO|GLD|TLT|HYG|EEM|VEA|IEFA|ARKK|CW8|XSX6|URTH)/i;

/** Classe d'actif déduite du ticker — même règle que l'exposition de la page. */
export function assetClass(ticker: string): "Crypto" | "ETF" | "Actions" {
  if (CRYPTO.test(ticker)) return "Crypto";
  if (ETF.test(ticker)) return "ETF";
  return "Actions";
}

/** Tri et filtrage, à part pour être testables sans rendu. */
export function arrange(assets: GridAsset[], filter: string, sort: SortKey): GridAsset[] {
  const kept = filter === "Tous" ? assets : assets.filter(a => assetClass(a.ticker) === filter);
  const by: Record<SortKey, (a: GridAsset, b: GridAsset) => number> = {
    poids:  (a, b) => b.weight - a.weight,
    // Les actifs sans cours connu tombent en fin de liste plutôt que de compter
    // pour zéro, ce qui les aurait glissés au milieu des actifs stables.
    perf:   (a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity),
    valeur: (a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity),
    alpha:  (a, b) => a.ticker.localeCompare(b.ticker),
  };
  return [...kept].sort(by[sort]);
}


// ── Valorisation ──────────────────────────────────────────────────────────────

/** Une ligne de `/positions`, telle que le backend la renvoie. */
export type Position = {
  ticker: string; quantity: number; avg_cost: number; invested: number;
  current_price: number | null; current_value: number | null;
  pnl_eur: number | null; pnl_pct: number | null; weight: number | null;
};

/**
 * Gain sur la période, à partir de la valeur d'aujourd'hui.
 *
 * `valeur × variation` suppose que la valeur actuelle était déjà celle du début
 * de période. Le bon calcul retranche ce que la ligne valait alors :
 * V − V/(1+r). Sur une fenêtre longue, l'écart se chiffre en ordres de grandeur.
 */
export function gainPeriode(valeur: number | null, variation: number | null): number | null {
  if (valeur == null || variation == null || variation <= -100) return null;
  return valeur - valeur / (1 + variation / 100);
}

/**
 * Valorise les positions issues des transactions.
 *
 * La liste part des positions, pas de l'allocation cible : un actif soldé n'est
 * plus détenu, un actif acheté hors allocation l'est bel et bien. Partir des
 * poids afficherait le portefeuille voulu au lieu du portefeuille réel.
 */
export function valoriser(
  positions: Position[],
  cours: Record<string, { price?: number | null; change?: number | null } | undefined>,
): GridAsset[] {
  return positions.map(p => {
    const change = cours[p.ticker]?.change ?? null;
    const value  = p.current_value;
    return {
      ticker:  p.ticker,
      weight:  p.weight ?? 0,
      price:   p.current_price ?? cours[p.ticker]?.price ?? null,
      change,
      value,
      perfEur: gainPeriode(value, change),
    };
  });
}


/** « Aujourd'hui », « Hier », puis la date — repère plus lisible qu'un horodatage. */
export function relativeDay(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const jour = (x: Date) => Math.floor(new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime() / 86400000);
  const diff = jour(now) - jour(d);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Hier";
  if (diff < 7) return `Il y a ${diff} jours`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" });
}
