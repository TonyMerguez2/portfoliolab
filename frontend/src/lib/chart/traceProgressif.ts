import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";

/**
 * Le tracé progressif d'une courbe : les points pas encore atteints sont remplacés par du
 * vide, si bien que la ligne s'écrit de gauche à droite sans que rien d'autre ne bouge.
 *
 * ⚠️ **Du vide, et non une série plus courte.** La première version donnait `slice(0, n)`
 * à la série. Mais une série plus courte occupe moins de temps : la bibliothèque recadrait
 * à chaque tranche, et il fallait lui réimposer la plage à chaque image — ce qu'elle refuse
 * quand la série n'a que deux points. Elle lève alors **« Value is null »**, remontée depuis
 * le site en production. Les points vides — un instant sans valeur, que la bibliothèque
 * accepte partout — gardent l'étendue temporelle intacte du premier au dernier instant :
 * il n'y a plus de cadrage horizontal à forcer, donc plus rien à casser.
 *
 * ⚠️ **L'échelle verticale, elle, reste à geler.** Elle ne voit que les valeurs posées, et
 * grandirait à mesure qu'elles arrivent : la courbe s'écraserait vers le bas en avançant.
 * On mesure donc les bornes de la série entière une fois, et on les impose le temps du
 * tracé.
 *
 * ⚠️ **L'horloge est injectable**, ce qui permet d'éprouver la progression sans écran :
 * qu'elle soit croissante, qu'elle finisse sur la série complète, et que l'échelle soit
 * rendue à la fin comme à l'annulation.
 */
export type Horloge = {
  maintenant: () => number;
  planifier: (f: (t: number) => void) => number;
  annuler: (id: number) => void;
};

const HORLOGE: Horloge = {
  maintenant: () => performance.now(),
  planifier: f => requestAnimationFrame(f),
  annuler: id => cancelAnimationFrame(id),
};

/** En deçà, le tracé n'a rien à montrer : la courbe paraît d'un coup. */
const POINTS_MINIMUM = 8;
const DUREE = 700;

type Point = { value?: number; high?: number; low?: number; close?: number };

/** Les bornes de la série entière, pour geler l'échelle verticale pendant le tracé. */
function bornes(donnees: readonly Point[]): { min: number; max: number } | null {
  let min = Infinity, max = -Infinity;
  for (const p of donnees) {
    const hauts = [p.value, p.high, p.close].filter(v => typeof v === "number") as number[];
    const bas = [p.value, p.low, p.close].filter(v => typeof v === "number") as number[];
    for (const v of hauts) if (v > max) max = v;
    for (const v of bas) if (v < min) min = v;
  }
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
}

/** Le mouvement dérange-t-il ? Réglage du système, respecté sans discuter. */
function mouvementRefuse(): boolean {
  return typeof matchMedia === "function"
    && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function tracerProgressivement(
  chart: IChartApi,
  serie: ISeriesApi<SeriesType>,
  donnees: readonly (Point & { time: unknown })[],
  options: { duree?: number; horloge?: Horloge } = {},
): () => void {
  const poserTout = () => serie.setData(donnees as never[]);
  if (donnees.length < POINTS_MINIMUM || mouvementRefuse()) { poserTout(); return () => {}; }

  const duree = options.duree ?? DUREE;
  const horloge = options.horloge ?? HORLOGE;

  // ── L'échelle verticale, gelée sur la série entière ───────────────────────
  const b = bornes(donnees);
  const echelleAvant = serie.options().autoscaleInfoProvider;
  if (b) serie.applyOptions({
    autoscaleInfoProvider: () => ({ priceRange: { minValue: b.min, maxValue: b.max } }),
  });
  const rendre = () => serie.applyOptions({ autoscaleInfoProvider: echelleAvant });

  /** La série entière, dont tout ce qui suit le n-ième point est laissé vide. */
  const jusqua = (n: number) =>
    donnees.map((p, i) => (i < n ? p : { time: p.time })) as never[];

  serie.setData(jusqua(2));

  // ── Progression ───────────────────────────────────────────────────────────
  /* ⚠️ Sentinelle négative et non zéro : un premier instant à `0` — l'origine d'une
     horloge de test, et rien n'interdit à une image d'y tomber — serait pris pour « pas
     encore parti », et le départ se décalerait d'une image. */
  let depart = -1, trame = 0, arrete = false;
  const pas = (t: number) => {
    if (arrete) return;
    if (depart < 0) depart = t;
    const part = Math.min(1, (t - depart) / duree);
    /* Sortie douce : la ligne part vite et se pose, plutôt que de s'arrêter net. */
    const adouci = 1 - Math.pow(1 - part, 3);
    const n = Math.max(2, Math.round(adouci * donnees.length));
    serie.setData(jusqua(n));
    if (part < 1) { trame = horloge.planifier(pas); return; }
    trame = 0;
    poserTout();
    rendre();
  };
  trame = horloge.planifier(pas);

  return () => {
    if (arrete) return;
    arrete = true;
    if (trame) horloge.annuler(trame);
    poserTout();
    rendre();
  };
}
