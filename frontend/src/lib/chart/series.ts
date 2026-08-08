/**
 * Pure series arithmetic shared by the charts.
 *
 * Extracted from GrowthChart so it can be tested without a browser, a canvas
 * or a chart instance. Every function here caused a visible defect at some
 * point; each now has a regression test next to it in series.test.ts.
 */

/** A point on a price or value series. */
export interface SeriesPoint {
  date: string;
  value: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
}

/** A lightweight-charts BusinessDay. */
export interface BusinessDay {
  year: number;
  month: number;
  day: number;
}

/**
 * The one place a percentage change is computed.
 *
 * The recurring defect was never the arithmetic but the pairing: a base-100
 * index divided by a raw price reads 763% instead of 692%, and the result
 * looks plausible enough to ship. Callers must hand over both terms together,
 * from a single source, so a mismatched pair cannot be assembled by accident.
 */
export function pctChange(
  value: number | null | undefined,
  base: number | null | undefined,
): number | null {
  if (value == null || base == null) return null;
  if (!Number.isFinite(value) || !Number.isFinite(base) || base === 0) return null;
  return (value / base - 1) * 100;
}

/** A lightweight-charts Time — timestamp or BusinessDay — as Unix seconds. */
export function timeToSeconds(t: unknown): number {
  if (t !== null && typeof t === "object") {
    const d = t as BusinessDay;
    return Date.UTC(d.year, d.month - 1, d.day) / 1000;
  }
  return t as number;
}

/**
 * An ISO date string as Unix seconds.
 *
 * Parsed as an instant, never compared as text: the feeds carry different UTC
 * offsets, so "14:15-04:00" sorts before "17:15+02:00" as a string while it is
 * actually three hours later. String ordering silently paired each point of a
 * comparison with the wrong counterpart.
 */
export function isoToSeconds(d: string): number {
  return Math.floor(new Date(d).getTime() / 1000);
}

/** An ISO date string as a BusinessDay, dropping any time component. */
export function isoToBusinessDay(d: string): BusinessDay {
  const p = d.slice(0, 10).split("-");
  return { year: +p[0], month: +p[1], day: +p[2] };
}

/**
 * Thin a series to at most `max` points, always keeping the last one.
 *
 * Dropping the final point would cut the curve short of today, and the legend
 * with it.
 */
export function sampleDown<T>(arr: T[], max = 3000): T[] {
  if (arr.length <= max) return arr;
  const step = Math.ceil(arr.length / max);
  return arr.filter((_, i) => i % step === 0 || i === arr.length - 1);
}

/** Deduplicate by time and sort chronologically — lightweight-charts rejects
 *  unordered or repeated timestamps outright. */
export function dedupByTime<T extends { time: unknown }>(arr: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const t = item.time;
    const k = t !== null && typeof t === "object"
      ? `${(t as BusinessDay).year}-${(t as BusinessDay).month}-${(t as BusinessDay).day}`
      : String(t);
    if (!seen.has(k)) { seen.add(k); out.push(item); }
  }
  return out.sort((a, b) => timeToSeconds(a.time) - timeToSeconds(b.time));
}

/**
 * First and last value of a series inside a date window, both bounds included.
 *
 * Both ends are taken from the same filter. Reading the start from the window
 * but the end from the whole series described a span that was not on screen —
 * a view stopping in April still reported a July value.
 */
export function windowEnds(
  src: { date: string; value: number }[],
  fromISO?: string | null,
  toISO?: string | null,
): { first: number; last: number } | null {
  if (!src.length) return null;
  const pts = src.filter(p => {
    const d = p.date.slice(0, 10);
    return (!fromISO || d >= fromISO) && (!toISO || d <= toISO);
  });
  if (pts.length < 2) return null;
  return { first: pts[0].value, last: pts[pts.length - 1].value };
}

/**
 * Align a compared series onto the main one's timestamps.
 *
 * Iterates the main grid and carries the compared asset's last known value
 * forward. Two things this must not do, both of which it did at some point:
 *
 *  - match on the calendar day, which collapses every intraday bar of a day
 *    onto that day's *final* value — a flat staircase, and look-ahead with it;
 *  - compare the raw strings, which mis-pairs points across UTC offsets.
 *
 * Forward-filling is also what the two curves need when the markets keep
 * different hours: the compared line simply holds while its exchange is shut.
 * A stock compared against a crypto therefore reads flat on weekends, and a
 * crypto compared against a stock absorbs the weekend into Monday.
 */
export function joinOnMainGrid(
  main: { date: string; value: number }[],
  compared: { date: string; value: number }[],
): { date: string; value: number; compared: number }[] {
  const bySeconds = (a: { date: string }, b: { date: string }) =>
    isoToSeconds(a.date) - isoToSeconds(b.date);
  const mainSorted = [...main].sort(bySeconds);
  const comparedSorted = [...compared].sort(bySeconds);

  const out: { date: string; value: number; compared: number }[] = [];
  let j = 0;
  let carried: number | null = null;
  for (const p of mainSorted) {
    const at = isoToSeconds(p.date);
    while (j < comparedSorted.length && isoToSeconds(comparedSorted[j].date) <= at) {
      carried = comparedSorted[j].value;
      j++;
    }
    // Nothing carried yet means the compared asset had not started trading.
    if (carried != null) out.push({ date: p.date, value: p.value, compared: carried });
  }
  return out;
}

/** Index a series to 100 at its first point, rounded to two decimals — the
 *  precision the axis renders and the legend must agree with. */
export function indexToBase100(
  src: { date: string; value: number }[],
  pick: (p: { date: string; value: number }) => number = p => p.value,
): { date: string; value: number }[] {
  if (!src.length) return [];
  const base = pick(src[0]);
  if (!Number.isFinite(base) || base === 0) return [];
  return src.map(p => ({ date: p.date, value: Math.round((pick(p) / base) * 10000) / 100 }));
}

/**
 * Regroupe la série en bougies.
 *
 * L'ouverture, le sommet, le creux et la clôture sont tirés des **valeurs
 * réelles du portefeuille** contenues dans chaque paquet. C'est important :
 * composer la bougie à partir des plus hauts de chaque ligne donnerait une
 * borne supérieure et non un vrai sommet — AAPL peut culminer à 10 h et NVDA à
 * 15 h, le portefeuille n'a jamais valu la somme des deux.
 *
 * La contrepartie est que le sommet vaut celui des points échantillonnés : sur
 * une série de clôtures journalières, les extrêmes intraday manquent. C'est la
 * limite ordinaire de toute bougie construite sur des clôtures.
 */
export function agregerEnBougies<T extends number>(
  data: { time: T; value: number }[],
  cible = 60,
): { time: T; open: number; high: number; low: number; close: number }[] {
  if (data.length < 2) return [];
  const taille = Math.max(1, Math.ceil(data.length / cible));
  const out: { time: T; open: number; high: number; low: number; close: number }[] = [];
  for (let i = 0; i < data.length; i += taille) {
    const paquet = data.slice(i, i + taille);
    const valeurs = paquet.map(p => p.value);
    out.push({
      time: paquet[0].time,
      open: valeurs[0],
      high: Math.max(...valeurs),
      low: Math.min(...valeurs),
      close: valeurs[valeurs.length - 1],
    });
  }
  return out;
}
