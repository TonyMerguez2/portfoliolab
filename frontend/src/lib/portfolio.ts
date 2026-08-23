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

/**
 * Places européennes éligibles au PEA parmi les codes du catalogue.
 *
 * `LSE` en est absente depuis le Brexit et `EBS` — la Suisse — n'y a jamais
 * figuré, bien que toutes deux soient européennes au sens géographique. C'est
 * l'Espace économique européen qui compte, pas le continent.
 */
const PLACES_PEA = new Set(["PAR", "GER", "AMS", "BRU", "LIS", "MIL", "MCE", "STO", "HEL", "CPH", "DUB", "VIE"]);

export type Enveloppe = "PEA" | "CTO" | "Crypto";

/**
 * Le compte où une ligne est **vraisemblablement** détenue.
 *
 * ⚠️ **C'est la même inférence qu'`enveloppe`, ligne par ligne — donc la même mise en
 * garde, en plus exposée.** Sur un portefeuille entier, une seule place inconnue
 * suffisait à retirer l'étiquette : le doute se voyait. Ici chaque titre reçoit un
 * compte, y compris quand rien ne le justifie — une action parisienne détenue en
 * compte-titres ordinaire ira dans « PEA » et personne ne le saura.
 *
 * C'est acceptable tant que ce classement n'est qu'un **rangement proposé**, que
 * l'utilisateur voit et pourra corriger. Cela cesserait de l'être le jour où un calcul
 * fiscal s'appuierait dessus.
 */
export function compteInfere(
  ticker: string, place: (t: string) => string | null,
): Enveloppe {
  if (assetClass(ticker) === "Crypto") return "Crypto";
  const p = place(ticker);
  return p != null && PLACES_PEA.has(p) ? "PEA" : "CTO";
}

/**
 * L'enveloppe que le contenu d'un portefeuille laisse déduire.
 *
 * ⚠️ **C'est une inférence, pas une donnée.** Aucun champ ne dit dans quel
 * compte les titres sont détenus ; la règle ne fait que lire ce que le contenu
 * *interdit*. Elle se trompera sur un portefeuille de titres parisiens détenu
 * en compte-titres ordinaire — ce qui est parfaitement possible — et sur un ETF
 * coté à Paris mais à réplication physique d'actions américaines, qui n'est pas
 * éligible au PEA malgré sa place de cotation. Le libellé mérite donc une
 * infobulle qui dise d'où il sort ; il ne vaut pas une déclaration fiscale.
 *
 * Chaque étiquette n'est posée que lorsqu'elle est la seule possible au vu de
 * ce qu'on sait :
 *
 * - **Crypto** si tout est crypto. Un PEA ne peut pas en détenir, un
 *   compte-titres ordinaire non plus.
 * - **PEA** s'il n'y a aucune crypto et que toutes les places sont connues et
 *   éligibles. Une seule place inconnue suffit à retirer l'étiquette : c'est le
 *   sens du `null` d'`assetExchange`.
 * - **CTO** sinon, y compris quand on ne sait pas. C'est le fourre-tout, celui
 *   qui peut tout détenir, donc le moins engageant des trois.
 *
 * Un portefeuille vide n'a pas d'enveloppe : `null`, et rien ne s'affiche.
 */
/**
 * D'où sort l'étiquette, en une phrase, pour l'infobulle de la pastille.
 *
 * Ici et non dans les composants : la phrase est la même à deux endroits — la
 * bande de tête et la liste du menu déroulant — et c'est exactement le genre de
 * texte qui divergerait à la première retouche. Elle est aussi la seule chose
 * qui empêche une déduction de passer pour une donnée ; elle mérite une source
 * unique.
 */
export function infobulleEnveloppe(e: Enveloppe): string {
  const raison = e === "Crypto" ? "toutes les lignes sont des cryptomonnaies."
    : e === "PEA" ? "toutes les lignes cotent sur une place de l'Espace économique européen, éligible au PEA."
    : "au moins une ligne n'est pas éligible au PEA, ou sa place de cotation est inconnue.";
  return `Déduit du contenu du portefeuille, pas d'une donnée de compte : ${raison}`;
}

export function enveloppe(
  tickers: string[],
  place: (ticker: string) => string | null,
): Enveloppe | null {
  if (tickers.length === 0) return null;
  const cryptos = tickers.filter(t => assetClass(t) === "Crypto");
  if (cryptos.length === tickers.length) return "Crypto";
  if (cryptos.length > 0) return "CTO";
  return tickers.every(t => {
    const p = place(t);
    return p != null && PLACES_PEA.has(p);
  }) ? "PEA" : "CTO";
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
 * La variation d'un groupe de lignes, pondérée par leur poids.
 *
 * ⚠️ **Le poids se renormalise sur les seules lignes qui ont un cours**, et c'est ce qui
 * distingue cette fonction du `weightedChange` du bandeau. Celui-ci divise par le poids de
 * *toutes* les lignes, y compris celles dont le prix manque : une ligne muette y tire donc
 * le résultat vers zéro, comme si elle n'avait pas bougé. Sur un total de portefeuille c'est
 * un biais qu'on peut accepter — il se dilue. Sur un dossier de deux lignes dont une est
 * indisponible, il fait annoncer la moitié du mouvement réel, et le visage se tromperait
 * d'humeur.
 *
 * ⚠️ **Rend `null` et non zéro quand rien n'est chiffrable.** Un dossier sans cours n'a pas
 * fait « zéro pour cent » — on n'en sait rien, et c'est ce que l'avatar doit lire pour
 * retomber sur son attention neutre plutôt que d'annoncer la stabilité.
 *
 * ⚠️ **Un poids total nul rend `null` aussi.** Un dossier de lignes à poids zéro — une
 * enveloppe vidée dont les écritures restent — donnerait sinon une division par zéro, donc
 * `NaN`, qui se propage en silence jusqu'à l'attribut publié.
 */
export function variationPonderee(
  lignes: { change: number | null; weight: number }[],
): number | null {
  const chiffrees = lignes.filter(l => typeof l.change === "number" && isFinite(l.change));
  const poids = chiffrees.reduce((s, l) => s + l.weight, 0);
  if (!chiffrees.length || poids <= 0) return null;
  return chiffrees.reduce((s, l) => s + (l.weight / poids) * (l.change as number), 0);
}

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
