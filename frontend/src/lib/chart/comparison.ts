/**
 * Building the two curves of a comparison.
 *
 * All of it is pure: given the two price series and the period cut-off, it
 * returns exactly what should be plotted. The component is left with two
 * writes and nothing to decide, which is the point — every defect this chart
 * has produced came from a decision taken inside an effect, where it could not
 * be tested.
 */
import { joinOnMainGrid, sampleDown } from "./series";

export interface Point {
  date: string;
  value: number;
}

export interface ComparisonCurves {
  /** Main asset, indexed to 100 at `commonStart`. */
  main: Point[];
  /** Compared asset, indexed to 100 at the same instant. */
  compared: Point[];
  /**
   * Raw value the main curve was indexed against. A live tick arriving later
   * has to be divided by this to land on the curve rather than beside it —
   * writing a raw price into an indexed series once read as +84 000 %.
   */
  base: number;
  /** First instant both assets have data for, at or after the period cut. */
  commonStart: string;
  /**
   * True when the two grids never met and each curve had to be indexed on its
   * own. The curves are then only loosely comparable; the caller may want to
   * say so rather than present them as aligned.
   */
  disjoint: boolean;
}

const day = (d: string) => d.slice(0, 10);

/**
 * Where a one-day view measures from.
 *
 * `session` is what every finance site shows and what the asset card already
 * says: today's bars, read against yesterday's *close*. Anchoring on the first
 * bar of the previous day instead — which a plain "now minus 24 hours" cut-off
 * gives — put the reference at yesterday's open, 468.50 rather than 466.30 on
 * LVMH, and the legend read -0.03 % where the card said +0.44 %.
 */
export type Anchor = "period" | "session";

/** Close of the last session before the most recent one, or null. */
export function previousSessionClose(pts: Point[]): number | null {
  if (!pts.length) return null;
  const lastDay = day(pts[pts.length - 1].date);
  for (let i = pts.length - 1; i >= 0; i--) {
    if (day(pts[i].date) < lastDay) return pts[i].value;
  }
  return null;
}

/** First instant of the most recent session present in the series. */
function lastSessionStart(pts: Point[]): string | null {
  return pts.length ? day(pts[pts.length - 1].date) : null;
}

/**
 * First instant both series can be measured from.
 *
 * Anchoring on the later of the two starts is what makes the comparison fair:
 * indexing an asset from before its counterpart existed credits it with a
 * head start that is not in the window being asked about.
 */
export function resolveCommonStart(
  main: Point[],
  compared: Point[],
  periodCut: string | null,
): string | null {
  if (!main.length) return null;
  const mainStart = day(main[0].date);
  const ref = periodCut ?? mainStart;
  const mainAt = main.find(p => day(p.date) >= ref);
  const comparedAt = compared.find(p => day(p.date) >= ref);
  const a = mainAt ? day(mainAt.date) : mainStart;
  const b = comparedAt
    ? day(comparedAt.date)
    : (compared.length ? day(compared[0].date) : mainStart);
  return a > b ? a : b;
}

/** Index to 100 against an explicit base, at the precision the axis renders. */
function indexAgainst(pts: Point[], base: number): Point[] {
  return pts.map(p => ({ date: p.date, value: Math.round((p.value / base) * 10000) / 100 }));
}

/**
 * Build both curves for the selected period.
 *
 * Returns null when there is nothing plottable, so the caller can leave the
 * chart untouched rather than write an empty series over a good one.
 */
export function buildComparison(
  main: Point[],
  compared: Point[],
  periodCut: string | null,
  opts: {
    maxPoints?: number;
    anchor?: Anchor;
    /**
     * Closes to measure a session view against, when the caller has a better
     * source than the intraday feed.
     *
     * They disagree: the daily bar carries the closing auction, the 5-minute
     * feed stops before it. On LVMH that is 466.80 against 466.30 — half a
     * euro, but enough for the chart to read +0.17 % while the asset card,
     * fed by the daily series, reads +0.06 %. Passing the same closes the rest
     * of the app uses is what makes them agree.
     */
    bases?: { main?: number | null; compared?: number | null };
  } = {},
): ComparisonCurves | null {
  const { maxPoints = 3000, anchor = "period", bases } = opts;
  if (!main.length || !compared.length) return null;

  // A session view plots the latest day and measures it against the close
  // before it; anything else runs from the period cut-off.
  const sessionDay = anchor === "session" ? lastSessionStart(main) : null;
  const commonStart = sessionDay ?? resolveCommonStart(main, compared, periodCut);
  if (!commonStart) return null;

  const overrideBase = anchor === "session"
    ? (bases?.main ?? previousSessionClose(main))
    : null;
  const overrideComparedBase = anchor === "session"
    ? (bases?.compared ?? previousSessionClose(compared))
    : null;

  const mainPts = main.filter(p => day(p.date) >= commonStart);
  const comparedPts = compared.filter(p => day(p.date) >= commonStart);
  if (!mainPts.length || !comparedPts.length) return null;

  const shared = joinOnMainGrid(mainPts, comparedPts);

  // Two points are the minimum for a curve to say anything; below that the
  // grids never really met and each series is indexed on its own instead.
  if (shared.length >= 2) {
    const sampled = sampleDown(shared, maxPoints);
    const base = overrideBase ?? shared[0].value;
    const comparedBase = overrideComparedBase ?? shared[0].compared;
    if (!base || !comparedBase) return null;
    return {
      main: indexAgainst(sampled.map(p => ({ date: p.date, value: p.value })), base),
      compared: indexAgainst(sampled.map(p => ({ date: p.date, value: p.compared })), comparedBase),
      base,
      commonStart,
      disjoint: false,
    };
  }

  const base = overrideBase ?? mainPts[0].value;
  const comparedBase = overrideComparedBase ?? comparedPts[0].value;
  if (!base || !comparedBase) return null;
  return {
    main: indexAgainst(sampleDown(mainPts, maxPoints), base),
    compared: indexAgainst(sampleDown(comparedPts, maxPoints), comparedBase),
    base,
    commonStart,
    disjoint: true,
  };
}
