import { describe, it, expect } from "vitest";
import { buildComparison, resolveCommonStart, previousSessionClose } from "./comparison";
import { pctChange } from "./series";

const daily = (from: string, values: number[]): { date: string; value: number }[] => {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  return values.map((value, i) => ({
    date: new Date(start + i * 86400000).toISOString().slice(0, 10),
    value,
  }));
};

describe("resolveCommonStart", () => {
  it("takes the later of the two starts, so neither gets a head start", () => {
    const main = daily("2020-01-01", [1, 2, 3, 4]);
    const compared = daily("2020-01-03", [10, 20]);
    expect(resolveCommonStart(main, compared, null)).toBe("2020-01-03");
  });

  it("moves to the period cut when both assets predate it", () => {
    const main = daily("2020-01-01", [1, 2, 3, 4, 5]);
    const compared = daily("2020-01-01", [10, 20, 30, 40, 50]);
    expect(resolveCommonStart(main, compared, "2020-01-04")).toBe("2020-01-04");
  });

  // The period buttons all collapsed onto one figure because the bound came
  // from the intraday window rather than the history, clamping every long
  // period to the same start.
  it("does not clamp to the cut when the compared asset starts after it", () => {
    const main = daily("2020-01-01", [1, 2, 3, 4, 5]);
    const compared = daily("2020-01-05", [10]);
    expect(resolveCommonStart(main, compared, "2020-01-02")).toBe("2020-01-05");
  });

  it("returns null without a main series", () => {
    expect(resolveCommonStart([], daily("2020-01-01", [1]), null)).toBeNull();
  });
});

describe("buildComparison", () => {
  it("starts both curves at exactly 100", () => {
    const out = buildComparison(daily("2020-01-01", [50, 60, 70]), daily("2020-01-01", [8, 9, 10]), null)!;
    expect(out.main[0].value).toBe(100);
    expect(out.compared[0].value).toBe(100);
    expect(out.disjoint).toBe(false);
  });

  it("reports the change each asset actually made over the window", () => {
    const out = buildComparison(daily("2020-01-01", [50, 100]), daily("2020-01-01", [10, 5]), null)!;
    expect(pctChange(out.main[1].value, out.main[0].value)).toBeCloseTo(100, 6);
    expect(pctChange(out.compared[1].value, out.compared[0].value)).toBeCloseTo(-50, 6);
  });

  // Both curves must describe the same span. Anchoring them a few sessions
  // apart is what made one read ahead over Max and behind once zoomed.
  it("puts both curves on the same grid and the same first date", () => {
    const main = daily("2020-01-01", [1, 2, 3, 4, 5]);
    const compared = daily("2020-01-03", [10, 20, 30]);
    const out = buildComparison(main, compared, null)!;
    expect(out.commonStart).toBe("2020-01-03");
    expect(out.main).toHaveLength(out.compared.length);
    expect(out.main[0].date).toBe(out.compared[0].date);
    expect(out.main[0].date.slice(0, 10)).toBe("2020-01-03");
  });

  it("exposes the raw base a later live tick must be divided by", () => {
    const out = buildComparison(daily("2020-01-01", [457, 460]), daily("2020-01-01", [70, 71]), null)!;
    expect(out.base).toBe(457);
    // A tick of 480 belongs at 105.03 on the curve, not at 480.
    expect((480 / out.base) * 100).toBeCloseTo(105.03, 2);
  });

  it("honours the period cut", () => {
    const main = daily("2020-01-01", [10, 20, 30, 40]);
    const compared = daily("2020-01-01", [1, 2, 3, 4]);
    const out = buildComparison(main, compared, "2020-01-03")!;
    expect(out.commonStart).toBe("2020-01-03");
    expect(out.base).toBe(30);
    expect(out.main).toHaveLength(2);
  });

  it("gives up when the compared asset has nothing inside the window", () => {
    // Its only quote predates the main series, so the shared window is empty.
    // Returning null lets the caller fall back to plotting prices rather than
    // draw a flat line from a two-year-old value and call it a comparison.
    const main = daily("2021-01-01", [10, 20]);
    const compared = [{ date: "2019-01-01", value: 5 }];
    expect(buildComparison(main, compared, null)).toBeNull();
  });

  it("flags the disjoint case rather than pretending the curves are aligned", () => {
    // A single shared instant is not a curve; each side is indexed on its own.
    const main = [{ date: "2020-01-01", value: 10 }];
    const compared = [{ date: "2020-01-01", value: 5 }];
    const out = buildComparison(main, compared, null)!;
    expect(out.disjoint).toBe(true);
    expect(out.main[0].value).toBe(100);
    expect(out.compared[0].value).toBe(100);
  });

  it("returns null rather than blanking a good chart when a side is empty", () => {
    expect(buildComparison([], daily("2020-01-01", [1, 2]), null)).toBeNull();
    expect(buildComparison(daily("2020-01-01", [1, 2]), [], null)).toBeNull();
  });

  it("returns null on a zero base instead of producing Infinity", () => {
    expect(buildComparison(daily("2020-01-01", [0, 1]), daily("2020-01-01", [1, 2]), null)).toBeNull();
  });

  it("thins long series while keeping both sides the same length", () => {
    const values = Array.from({ length: 500 }, (_, i) => i + 1);
    const out = buildComparison(daily("2020-01-01", values), daily("2020-01-01", values), null, { maxPoints: 50 })!;
    expect(out.main.length).toBeLessThanOrEqual(51);
    expect(out.main).toHaveLength(out.compared.length);
    expect(out.main[out.main.length - 1].date).toBe(out.compared[out.compared.length - 1].date);
  });

  // A one-day view has to answer the same question as the asset card: where is
  // the price against yesterday's close. A "now minus 24 hours" cut-off instead
  // lands on yesterday's *open*, and the two disagreed on screen.
  describe("anchor: session", () => {
    // Real LVMH bars, 27 and 28 July 2026.
    const intraday = [
      { date: "2026-07-27T09:00:00+02:00", value: 468.50 }, // previous open
      { date: "2026-07-27T13:00:00+02:00", value: 470.00 },
      { date: "2026-07-27T17:25:00+02:00", value: 466.30 }, // previous close
      { date: "2026-07-28T09:00:00+02:00", value: 477.70 }, // today's open
      { date: "2026-07-28T16:50:00+02:00", value: 468.35 }, // latest
    ];
    const compared = intraday.map(p => ({ ...p, value: p.value / 2 }));

    it("finds the close of the session before the last", () => {
      expect(previousSessionClose(intraday)).toBe(466.30);
    });

    it("measures against that close, matching the asset card", () => {
      const out = buildComparison(intraday, compared, "2026-07-27", { anchor: "session" })!;
      const last = out.main[out.main.length - 1].value;
      expect(pctChange(last, 100)).toBeCloseTo(0.44, 2);
      // The period cut-off would have anchored on 468.50 and read -0.03 %.
      const wrong = buildComparison(intraday, compared, "2026-07-27")!;
      expect(pctChange(wrong.main[wrong.main.length - 1].value, 100)).toBeCloseTo(-0.03, 2);
    });

    it("plots the latest session only, opening on the overnight gap", () => {
      const out = buildComparison(intraday, compared, "2026-07-27", { anchor: "session" })!;
      expect(out.commonStart).toBe("2026-07-28");
      expect(out.main).toHaveLength(2);
      // 477.70 against 466.30 — the gap is visible instead of being flattened.
      expect(pctChange(out.main[0].value, 100)).toBeCloseTo(2.44, 2);
    });

    it("reports the raw close as the base a live tick divides by", () => {
      const out = buildComparison(intraday, compared, "2026-07-27", { anchor: "session" })!;
      expect(out.base).toBe(466.30);
    });

    // The daily bar carries the closing auction, the 5-minute feed stops
    // before it: 466.80 against 466.30 on LVMH. The asset card reads the daily
    // series, so the chart has to be given the same close to agree with it.
    it("prefers a close supplied by the caller over the intraday one", () => {
      const out = buildComparison(intraday, compared, "2026-07-27", {
        anchor: "session",
        bases: { main: 466.80, compared: 233.15 },
      })!;
      expect(out.base).toBe(466.80);
      const last = out.main[out.main.length - 1].value;
      expect(pctChange(last, 100)).toBeCloseTo(0.33, 2); // 468.35 / 466.80
    });

    it("falls back to the intraday close when none is supplied", () => {
      const out = buildComparison(intraday, compared, "2026-07-27", {
        anchor: "session",
        bases: { main: null, compared: null },
      })!;
      expect(out.base).toBe(466.30);
    });

    it("falls back to the period anchor when there is no earlier session", () => {
      const oneDay = intraday.filter(p => p.date.startsWith("2026-07-28"));
      const out = buildComparison(oneDay, oneDay, null, { anchor: "session" })!;
      expect(out.main[0].value).toBe(100);
    });
  });

  it("holds the compared curve flat while its market is shut", () => {
    // Main trades every day, compared only on the first and last.
    const main = daily("2020-01-01", [100, 110, 120, 130]);
    const compared = [
      { date: "2020-01-01", value: 10 },
      { date: "2020-01-04", value: 20 },
    ];
    const out = buildComparison(main, compared, null)!;
    expect(out.compared.map(p => p.value)).toEqual([100, 100, 100, 200]);
  });
});
