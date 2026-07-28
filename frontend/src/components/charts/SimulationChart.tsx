"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

/**
 * Spaghetti plot of Monte Carlo trajectories.
 *
 * Only the median (and an optional goal line) are real chart series. The
 * thousands of scenario lines are painted onto a canvas underneath, redrawn
 * solely when the axes move.
 *
 * Giving every scenario its own series is the obvious implementation and the
 * wrong one: lightweight-charts repaints all of them on every crosshair move,
 * so at 2 000 paths the cursor visibly stutters. Keeping them out of the chart
 * means moving the cursor only repaints one series.
 */
export interface SimulationChartProps {
  paths: number[][];
  median: number[];
  timeIndex: number[];
  horizonYears: number;
  target?: number | null;
  logScale?: boolean;
  black?: boolean;
}

const MEDIAN_LINE = "#5B8DEF";
const TARGET_LINE = "rgba(52,211,153,0.65)";

/**
 * Per-line opacity for the scenario bundle.
 *
 * A fixed alpha only works at one density: readable at 200 lines, it saturates
 * into a solid white mass at 2 000. Scaling it with the count keeps the
 * accumulated ink roughly constant.
 */
function scenarioAlpha(count: number): number {
  return Math.min(0.22, Math.max(0.012, 26 / Math.max(count, 1)));
}

/** Trading-day offset -> UTC timestamp, anchored to today. */
function dayToTime(dayOffset: number, start: number): UTCTimestamp {
  const calendarDays = (dayOffset / 252) * 365.25;
  return (start + Math.round(calendarDays) * 86400) as UTCTimestamp;
}

export default function SimulationChart({
  paths,
  median,
  timeIndex,
  horizonYears,
  target,
  logScale = false,
  black = false,
}: SimulationChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartHostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const medianRef = useRef<ISeriesApi<"Line"> | null>(null);
  const extraRef = useRef<ISeriesApi<"Line">[]>([]);
  const drawRef = useRef<() => void>(() => {});
  const rafRef = useRef<number | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const observedCellsRef = useRef<Element[]>([]);

  /**
   * Coalesce repaints onto one animation frame.
   *
   * Repainting the bundle costs ~95 ms at 2 000 paths, and a single wheel
   * gesture fires many range-change events — without this, each one would
   * queue its own full redraw and panning would crawl.
   */
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleDraw = useRef(() => {
    if (rafRef.current !== null) return;
    const run = () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      rafRef.current = null;
      timerRef.current = null;
      drawRef.current();
    };
    // Race a frame against a timer: requestAnimationFrame is throttled in
    // background tabs and some headless contexts, and the bundle would then
    // stay frozen on a stale range after a zoom or resize.
    rafRef.current = requestAnimationFrame(run);
    timerRef.current = setTimeout(run, 32);
  }).current;

  // ── Chart creation ────────────────────────────────────────────
  useEffect(() => {
    if (!chartHostRef.current || !containerRef.current) return;

    const grid = "rgba(255,255,255,0.05)";

    const chart = createChart(chartHostRef.current, {
      autoSize: true,
      layout: {
        attributionLogo: false,
        background: { type: ColorType.Solid, color: "rgba(0,0,0,0)" },
        textColor: "rgba(255,255,255,0.58)",
        fontSize: 11,
      },
      localization: {
        priceFormatter: (v: number) => {
          const a = Math.abs(v);
          if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)} M€`;
          if (a >= 10_000) return `${Math.round(v / 1_000)} k€`;
          if (a >= 1_000) return `${(v / 1_000).toFixed(1)} k€`;
          return `${Math.round(v)} €`;
        },
      },
      grid: {
        vertLines: { color: grid, style: LineStyle.Solid, visible: true },
        horzLines: { color: grid, style: LineStyle.Solid, visible: true },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(255,255,255,0.28)",
          style: LineStyle.Solid,
          width: 1,
          labelBackgroundColor: "#202020",
          labelVisible: true,
        },
        horzLine: {
          color: "rgba(255,255,255,0.28)",
          style: LineStyle.Solid,
          width: 1,
          labelBackgroundColor: "#202020",
          labelVisible: true,
        },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.16, bottom: 0.06 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: false,
        secondsVisible: false,
        // Only the left edge is pinned. Pinning both forces the view to span
        // the entire dataset, which silently disables zoom and pan; pinning
        // neither leaves dead space before the first point.
        fixLeftEdge: true,
        fixRightEdge: false,
        rightOffset: 0,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: true } },
      kineticScroll: { touch: true, mouse: true },
    });

    chartRef.current = chart;

    // Repaint the bundle whenever the axes move, never on crosshair moves.
    const onRange = () => scheduleDraw();
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);

    // Two elements matter, and they resize at different moments:
    //   • the container drives the canvas backing size — it changes with the
    //     window;
    //   • the pane is the plot area the bundle is projected onto — it changes
    //     on its own when the price-scale labels are measured and the axis
    //     gutter is reserved, which happens *after* the container has settled.
    // Observing only the container missed the second, which is why the first
    // paint could land on a provisional width.
    const ro = new ResizeObserver(() => scheduleDraw());
    ro.observe(containerRef.current);
    roRef.current = ro;

    return () => {
      // Reset, not just cancel. These two are the guard `scheduleDraw` tests
      // to coalesce repaints; leaving a stale id behind meant the guard stayed
      // shut for the life of the component and every scheduled repaint —
      // resize, zoom, pan — was silently dropped. React remounts effects on
      // mount in development, so this triggered on every single page load.
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      rafRef.current = null;
      timerRef.current = null;
      ro.disconnect();
      roRef.current = null;
      observedCellsRef.current = [];
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      chart.remove();
      chartRef.current = null;
      medianRef.current = null;
      extraRef.current = [];
    };
    // Created once. The theme is applied with applyOptions below rather than
    // by rebuilding the chart: displayMode only resolves after hydration, so a
    // dependency here would tear the chart down and drop its series while the
    // data effect — whose deps have not changed — never re-runs to restore it.
  }, []);

  useEffect(() => {
    const grid = black ? "rgba(255,255,255,0.055)" : "rgba(255,255,255,0.05)";
    chartRef.current?.applyOptions({
      grid: {
        vertLines: { color: grid },
        horzLines: { color: grid },
      },
    });
  }, [black]);

  useEffect(() => {
    chartRef.current?.priceScale("right").applyOptions({ mode: logScale ? 1 : 0 });
    // Direct, not scheduled: rAF can be throttled (background tab, reduced
    // motion, headless) and the bundle would then simply never appear.
    drawRef.current();
  }, [logScale]);

  // ── Data ──────────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !median.length || !timeIndex.length) return;

    for (const s of extraRef.current) {
      try { chart.removeSeries(s); } catch { /* already gone */ }
    }
    extraRef.current = [];
    if (medianRef.current) {
      try { chart.removeSeries(medianRef.current); } catch { /* already gone */ }
      medianRef.current = null;
    }

    const start = Math.floor(Date.now() / 1000 / 86400) * 86400;
    const times = timeIndex.map((d) => dayToTime(d, start));

    // Scale on the true extremes so no scenario is clipped.
    let dataMin = Infinity;
    let dataMax = -Infinity;
    for (const path of paths) {
      for (const v of path) {
        if (!Number.isFinite(v) || v <= 0) continue;
        if (v < dataMin) dataMin = v;
        if (v > dataMax) dataMax = v;
      }
    }
    for (const v of median) {
      if (!Number.isFinite(v) || v <= 0) continue;
      if (v < dataMin) dataMin = v;
      if (v > dataMax) dataMax = v;
    }
    if (!Number.isFinite(dataMin)) dataMin = 1;
    if (!Number.isFinite(dataMax)) dataMax = dataMin * 10;

    const scale = {
      priceRange: { minValue: Math.max(1, dataMin * 0.95), maxValue: dataMax * 1.05 },
    };

    const addLine = (values: number[], color: string, lineWidth: 1 | 2) => {
      const series = chart.addSeries(LineSeries, {
        color,
        lineWidth,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false, // no dot following the cursor
        lineStyle: LineStyle.Solid,
        autoscaleInfoProvider: () => scale,
      });
      series.setData(
        values
          .map((v, i) => ({ time: times[i], value: v }))
          .filter((p) => p.time !== undefined && Number.isFinite(p.value)),
      );
      return series;
    };

    const medianSeries = addLine(median, MEDIAN_LINE, 2);
    medianRef.current = medianSeries;

    if (target && target > 0) {
      const line = addLine(median.map(() => target), TARGET_LINE, 1);
      line.applyOptions({ lineStyle: LineStyle.Dashed });
      extraRef.current.push(line);
    }

    // ── Bundle painter ──────────────────────────────────────────
    drawRef.current = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      const series = medianRef.current;
      if (!canvas || !container || !series || !chartRef.current) return;

      const { clientWidth: w, clientHeight: h } = container;
      if (!w || !h) return;

      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const ts = chartRef.current.timeScale();

      // x is derived from the visible logical range rather than
      // timeToCoordinate, which returns null for anything outside the current
      // view — that silently dropped the tail of every path whenever the range
      // did not cover the whole dataset. Interpolating keeps off-screen points
      // at coordinates beyond the canvas, where clipping handles them.
      const range = ts.getVisibleLogicalRange();
      const pane = chartRef.current.paneSize();
      const plotW = pane?.width || w;
      if (!range || range.to === range.from) return;
      const span = range.to - range.from;
      const xs = times.map((_, i) => ((i - range.from) / span) * plotW);

      // The canvas spans the whole container, the plot area stops short of the
      // price-scale gutter. Without this, zooming in pushes scenarios out from
      // under the axis labels — the chart's own background is transparent, so
      // they would show straight through.
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, plotW, h);
      ctx.clip();

      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(255,255,255,${scenarioAlpha(paths.length)})`;
      ctx.lineJoin = "round";

      for (const path of paths) {
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < path.length; i++) {
          const y = series.priceToCoordinate(path[i]);
          if (y === null) { started = false; continue; }
          if (started) ctx.lineTo(xs[i], y);
          else { ctx.moveTo(xs[i], y); started = true; }
        }
        // One stroke per path so overlapping lines accumulate opacity — a
        // single batched path would render flat and lose the density cue.
        if (started) ctx.stroke();
      }

      ctx.restore();
    };

    // Frame the data exactly. fitContent alone leaves a gap on the left now
    // that the edges are no longer pinned, so pin the logical range instead.
    chart.timeScale().fitContent();
    chart.timeScale().setVisibleLogicalRange({ from: 0, to: median.length - 1 });

    // Watch the plot area, which is what the bundle is projected onto.
    //
    // `getHTMLElement()` returns the pane's table *row*, not the plot area: it
    // spans the full chart width and so never changes when the price-scale
    // gutter is reserved — only the split between its cells does. Its cells
    // are therefore what has to be observed. They are taken as a group rather
    // than singled out by index or width, so no assumption is made about which
    // side the axis sits on or whether a left scale is present.
    //
    // The row only exists once a series has been added, hence here rather than
    // at chart creation. This replaces the timed retries this used to rely on:
    // the bundle is repainted when the plot area actually reaches its final
    // width, however long that takes, instead of at guessed delays a slow
    // machine could outrun.
    const row = chart.panes()[0]?.getHTMLElement() ?? null;
    const cells = row ? Array.from(row.children) : [];
    const previous = observedCellsRef.current;
    if (cells.length !== previous.length || cells.some((c, i) => c !== previous[i])) {
      for (const c of previous) roRef.current?.unobserve(c);
      for (const c of cells) roRef.current?.observe(c);
      observedCellsRef.current = cells;
    }

    // Paint immediately so the bundle is never missing while the layout
    // settles; the observer above corrects it if the pane then moves.
    drawRef.current();
  }, [paths, median, timeIndex, horizonYears, target]);

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* The bundle sits underneath so the median line, crosshair and axis
          labels drawn by the chart stay on top of it. */}
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}
      />
      <div ref={chartHostRef} style={{ position: "absolute", inset: 0, zIndex: 1 }} />
    </div>
  );
}
