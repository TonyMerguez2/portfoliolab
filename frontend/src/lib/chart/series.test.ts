import { describe, it, expect } from "vitest";
import {
  pctChange,
  timeToSeconds,
  isoToSeconds,
  isoToBusinessDay,
  sampleDown,
  dedupByTime,
  windowEnds,
  joinOnMainGrid,
  indexToBase100,
} from "./series";

/**
 * Each block below corresponds to a defect that reached the screen. The point
 * is not coverage for its own sake — it is that these particular mistakes
 * cannot come back silently.
 */

describe("pctChange", () => {
  it("computes a plain relative change", () => {
    expect(pctChange(110, 100)).toBeCloseTo(10, 10);
    expect(pctChange(50, 100)).toBeCloseTo(-50, 10);
  });

  it("is scale-invariant, which is why indexing twice is harmless", () => {
    // A base-100 index and the raw prices it came from must agree.
    const raw = pctChange(586.73, 35.31123);
    const indexed = pctChange((586.73 / 35.31123) * 100, 100);
    expect(indexed).toBeCloseTo(raw!, 10);
  });

  it("refuses a zero or non-finite reference instead of returning Infinity", () => {
    expect(pctChange(10, 0)).toBeNull();
    expect(pctChange(10, NaN)).toBeNull();
    expect(pctChange(NaN, 10)).toBeNull();
    expect(pctChange(10, null)).toBeNull();
    expect(pctChange(null, 10)).toBeNull();
  });

  // The original defect: an index (791.63) divided by a raw price (91.70)
  // read +763% where the answer was +692%. Nothing here can prevent a caller
  // pairing the wrong two numbers — only the call sites can, by picking both
  // from one source — but this pins what a correct pair produces.
  it("gives the documented figure for the pair that was once mismatched", () => {
    expect(pctChange(791.63, 100)).toBeCloseTo(691.63, 10);
    expect(pctChange(791.63, 91.7)).toBeCloseTo(763.28, 2);
  });
});

describe("timeToSeconds", () => {
  it("reads a BusinessDay as UTC midnight, free of the host timezone", () => {
    expect(timeToSeconds({ year: 2026, month: 7, day: 28 }))
      .toBe(Date.UTC(2026, 6, 28) / 1000);
  });

  it("passes a numeric timestamp through untouched", () => {
    expect(timeToSeconds(1785200000)).toBe(1785200000);
  });
});

describe("isoToSeconds", () => {
  // The intraday comparison bug: two feeds carrying different UTC offsets were
  // compared as text, so a New York bar sorted before a Paris bar that was in
  // fact three hours earlier.
  it("orders instants correctly across differing UTC offsets", () => {
    const paris = "2026-07-28T17:15:00+02:00";   // 15:15 UTC
    const newYork = "2026-07-28T14:15:00-04:00"; // 18:15 UTC
    expect(isoToSeconds(paris)).toBeLessThan(isoToSeconds(newYork));
    // …while the raw strings claim the opposite.
    expect(paris > newYork).toBe(true);
  });
});

describe("isoToBusinessDay", () => {
  it("drops the time component", () => {
    expect(isoToBusinessDay("2026-07-28T17:15:00+02:00"))
      .toEqual({ year: 2026, month: 7, day: 28 });
  });
});

describe("sampleDown", () => {
  it("leaves a short series alone", () => {
    const a = [1, 2, 3];
    expect(sampleDown(a, 10)).toBe(a);
  });

  it("always keeps the last point, so the curve reaches today", () => {
    const a = Array.from({ length: 1000 }, (_, i) => i);
    const out = sampleDown(a, 100);
    expect(out.length).toBeLessThanOrEqual(101);
    expect(out[out.length - 1]).toBe(999);
    expect(out[0]).toBe(0);
  });
});

describe("dedupByTime", () => {
  it("removes repeats and sorts, both of which lightweight-charts requires", () => {
    const out = dedupByTime([
      { time: 300, v: "c" },
      { time: 100, v: "a" },
      { time: 300, v: "dup" },
      { time: 200, v: "b" },
    ]);
    expect(out.map(p => p.v)).toEqual(["a", "b", "c"]);
  });

  it("handles BusinessDay keys", () => {
    const out = dedupByTime([
      { time: { year: 2026, month: 7, day: 28 } },
      { time: { year: 2026, month: 7, day: 27 } },
      { time: { year: 2026, month: 7, day: 28 } },
    ]);
    expect(out).toHaveLength(2);
    expect(timeToSeconds(out[0].time)).toBeLessThan(timeToSeconds(out[1].time));
  });
});

describe("windowEnds", () => {
  const src = [
    { date: "2025-01-01", value: 100 },
    { date: "2025-06-01", value: 150 },
    { date: "2026-01-01", value: 200 },
    { date: "2026-07-01", value: 250 },
  ];

  it("takes both bounds from the same window", () => {
    expect(windowEnds(src, "2025-06-01", "2026-01-01")).toEqual({ first: 150, last: 200 });
  });

  // The defect this pins: reading the start from the window but the end from
  // the whole series. A view stopping in January would have reported 250.
  it("never reaches past the right bound", () => {
    const w = windowEnds(src, "2025-01-01", "2026-01-01");
    expect(w!.last).toBe(200);
    expect(w!.last).not.toBe(250);
  });

  it("returns null rather than a bogus figure when the window holds one point", () => {
    expect(windowEnds(src, "2026-07-01", "2026-07-01")).toBeNull();
    expect(windowEnds([], null, null)).toBeNull();
  });
});

describe("joinOnMainGrid", () => {
  it("carries the compared value forward, never backward", () => {
    const main = [
      { date: "2026-07-27T09:00:00+02:00", value: 10 },
      { date: "2026-07-27T10:00:00+02:00", value: 11 },
      { date: "2026-07-27T11:00:00+02:00", value: 12 },
    ];
    const compared = [
      { date: "2026-07-27T09:00:00+02:00", value: 100 },
      { date: "2026-07-27T11:00:00+02:00", value: 300 },
    ];
    const out = joinOnMainGrid(main, compared);
    expect(out.map(p => p.compared)).toEqual([100, 100, 300]);
  });

  // The staircase bug: matching on the calendar day gave every bar of a day
  // that day's closing value — look-ahead dressed up as a flat line.
  it("does not leak a later value into an earlier bar", () => {
    const main = [
      { date: "2026-07-27T09:00:00Z", value: 10 },
      { date: "2026-07-27T17:00:00Z", value: 12 },
    ];
    const compared = [
      { date: "2026-07-27T09:00:00Z", value: 100 },
      { date: "2026-07-27T17:00:00Z", value: 999 },
    ];
    const out = joinOnMainGrid(main, compared);
    expect(out[0].compared).toBe(100);
    expect(out[0].compared).not.toBe(999);
  });

  it("pairs correctly when the two feeds carry different UTC offsets", () => {
    const main = [{ date: "2026-07-28T17:15:00+02:00", value: 10 }]; // 15:15 UTC
    const compared = [
      { date: "2026-07-28T10:00:00-04:00", value: 1 },  // 14:00 UTC — before
      { date: "2026-07-28T14:15:00-04:00", value: 2 },  // 18:15 UTC — after
    ];
    const out = joinOnMainGrid(main, compared);
    expect(out[0].compared).toBe(1);
  });

  it("holds the compared line flat while its market is shut", () => {
    // Crypto on the main grid, a stock compared: Saturday and Sunday must
    // repeat Friday's close rather than invent a price.
    const main = [
      { date: "2026-07-24T00:00:00Z", value: 10 }, // Friday
      { date: "2026-07-25T00:00:00Z", value: 11 }, // Saturday
      { date: "2026-07-26T00:00:00Z", value: 12 }, // Sunday
      { date: "2026-07-27T00:00:00Z", value: 13 }, // Monday
    ];
    const compared = [
      { date: "2026-07-24T00:00:00Z", value: 50 },
      { date: "2026-07-27T00:00:00Z", value: 55 },
    ];
    expect(joinOnMainGrid(main, compared).map(p => p.compared)).toEqual([50, 50, 50, 55]);
  });

  it("drops leading points where the compared asset did not yet exist", () => {
    const main = [
      { date: "2020-01-01T00:00:00Z", value: 10 },
      { date: "2021-01-01T00:00:00Z", value: 11 },
    ];
    const compared = [{ date: "2021-01-01T00:00:00Z", value: 100 }];
    const out = joinOnMainGrid(main, compared);
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe("2021-01-01T00:00:00Z");
  });

  it("does not depend on the input order", () => {
    const main = [
      { date: "2026-07-27T11:00:00Z", value: 12 },
      { date: "2026-07-27T09:00:00Z", value: 10 },
    ];
    const compared = [
      { date: "2026-07-27T11:00:00Z", value: 300 },
      { date: "2026-07-27T09:00:00Z", value: 100 },
    ];
    expect(joinOnMainGrid(main, compared).map(p => p.compared)).toEqual([100, 300]);
  });
});

describe("indexToBase100", () => {
  it("starts at exactly 100", () => {
    const out = indexToBase100([
      { date: "2025-01-01", value: 35.31123 },
      { date: "2026-01-01", value: 586.73 },
    ]);
    expect(out[0].value).toBe(100);
  });

  it("agrees with pctChange on the indexed values", () => {
    const src = [
      { date: "2025-01-01", value: 35.31123 },
      { date: "2026-01-01", value: 136.39653 },
    ];
    const out = indexToBase100(src);
    // The legend divides the plotted values; it must land on the same figure
    // the raw prices give. 286.27% is the pair verified against the API.
    expect(pctChange(out[1].value, out[0].value)).toBeCloseTo(286.27, 1);
    expect(pctChange(src[1].value, src[0].value)).toBeCloseTo(286.27, 1);
  });

  it("returns nothing rather than Infinity on a zero base", () => {
    expect(indexToBase100([{ date: "2025-01-01", value: 0 }])).toEqual([]);
    expect(indexToBase100([])).toEqual([]);
  });
});
