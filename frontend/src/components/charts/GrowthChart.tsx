"use client";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  createChart, IChartApi, ISeriesApi,
  AreaSeries, LineSeries, CandlestickSeries,
  ColorType, CrosshairMode, LineStyle,
  UTCTimestamp,
} from "lightweight-charts";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Customized,
} from "recharts";
// Pure series arithmetic lives outside the component so it can be tested
// without a browser. Every function imported here has regression tests in
// src/lib/chart/series.test.ts covering a defect that once reached the screen.
import {
  pctChange, timeToSeconds, isoToSeconds, isoToBusinessDay,
  sampleDown, dedupByTime, windowEnds,
} from "@/lib/chart/series";
// The two comparison curves are built entirely here — grid, anchor, indexing —
// so the effect below only has to write the result. See comparison.test.ts.
import { buildComparison, previousSessionClose } from "@/lib/chart/comparison";
import { couleurGrille, LIBELLE_GRILLE, STYLES_GRILLE, type StyleGrille } from "@/lib/grille";

// Fetch config par intervalle — charge tout le disponible Yahoo en un seul fetch
const INTERVAL_FETCH_CONFIG: Record<string, { apiPeriod: string; apiInterval: string }> = {
  "1m":  { apiPeriod: "7d",  apiInterval: "1m"  },
  "5m":  { apiPeriod: "60d", apiInterval: "5m"  },
  "15m": { apiPeriod: "60d", apiInterval: "15m" },
  "1h":  { apiPeriod: "max", apiInterval: "60m" },
  "1d":  { apiPeriod: "max", apiInterval: "1d"  },
  "1W":  { apiPeriod: "max", apiInterval: "1wk" },
};

// Intervalles disponibles selon la fenêtre de la période
const PERIOD_ALLOWED_INTERVALS: Record<string, string[]> = {
  "24h": ["1m", "5m", "15m"],
  "1S":  ["5m", "15m", "1h"],
  "1M":  ["5m", "15m", "1h", "1d"],
  "3M":  ["15m", "1h", "1d"],
  "6M":  ["1h", "1d", "1W"],
  "1A":  ["1h", "1d", "1W"],
  "3A":  ["1d", "1W"],
  "Max": ["1d", "1W"],
};

// Intervalle par défaut lors d'un changement de période
const PERIOD_DEFAULT_INTERVAL: Record<string, string> = {
  "24h": "5m",
  "1S":  "15m",
  "1M":  "1h",
  "3M":  "1h",
  "6M":  "1d",
  "1A":  "1d",
  "3A":  "1d",
  "Max": "1d",
};

// Durée visible initialement (en secondes) pour chaque période.
// setVisibleRange cadre la fenêtre ; les données hors fenêtre sont scrollables.
const PERIOD_VISIBLE_SECS: Record<string, number> = {
  "24h": 86400,
  "1S":  7   * 86400,
  "1M":  30  * 86400,
  "3M":  91  * 86400,
  "6M":  183 * 86400,
  "1A":  365 * 86400,
  "3A":  1095 * 86400,
};

interface DataPoint { date: string; [key: string]: number | string; }

/**
 * Last plotted value of a series.
 *
 * Deliberately the final point, not the last one inside the view: paired with
 * a base fixed at the start of the period, it makes the legend answer "where
 * does this asset stand now, since the period began" — one figure, equal to
 * the period button, that panning and zooming leave alone. The same reason
 * single-asset mode keeps showing the current price however you navigate.
 */
function lastSeriesValue(series: ISeriesApi<any> | null): number | null {
  const pts = (series?.data() as { value?: number }[]) ?? [];
  const last = pts.length ? pts[pts.length - 1].value : null;
  return typeof last === "number" ? last : null;
}


interface Props {
  portfolioData: DataPoint[];
  benchmarkData: DataPoint[];
  benchmarkName: string;
  portfolioLabel: string;
  drawdownData?: { date: string; drawdown: number; drawdown_eur: number }[];
  benchmarkDrawdownData?: { date: string; drawdown: number }[];
  ticker?: string;
  onRemoveBenchmark?: () => void;
  portfolioColor?: string;
  candleUpColor?:   string;
  candleDownColor?: string;
  chartMode?:         "line" | "candle";
  onChartModeChange?: (m: "line" | "candle") => void;
  rightSlot?:         React.ReactNode;
  leftSlot?:          React.ReactNode;
  onExitFullscreen?: () => void;
  onPeriodChange?: (period: string) => void;
  onVisibleRangeChange?: (from: number | null, to: number | null) => void;
  onCrosshairMove?: (time: UTCTimestamp | null) => void;
  onAdaptiveData?: (data: { date: string; value: number; high?: number; low?: number }[]) => void;
  benchmarkRawData?: DataPoint[];
  benchmarkColor?: string;
  benchmarkTicker?: string;
  livePrice?: number;
  dark?: boolean;
  percentMode?: boolean;
  priceMode?: boolean;
  hideDrawdown?: boolean;
  dailyChangePct?: number | null;
  openPrice?: number | null;
  isCrypto?: boolean;
  syncCrosshairTime?: number | null;
  externalPeriod?: string;
  externalInterval?: string;
  onIntervalChange?: (interval: string) => void;
  hideControls?: boolean;
  externalVisibleRange?: { from: number; to: number } | null;
  syncPriceScaleWidth?: number;
  onPriceScaleWidthChange?: (width: number) => void;
  onCrosshairXPixel?: (x: number | null) => void;
  syncCrosshairXPixel?: number | null;
  timeAxisStart?: number; // UTC timestamp : étend l'axe X avant le 1er bar (sync Max period)
  displayMode?: "glass" | "black";
}

/** Thin adapters onto the tested helpers, keeping lightweight-charts' types. */
const toTs = (d: string): UTCTimestamp => isoToSeconds(d) as UTCTimestamp;
const toDay = isoToBusinessDay;

/**
 * `getVisibleRange()` throws "Value is null" on a chart whose time scale holds
 * no points — the state right after an interval change clears the data. Read
 * through here: as the first statement of the data effect, an unguarded call
 * aborted the whole update before a single series was written, and the compared
 * curve then kept the previous period's data while the main one moved on.
 */
function safeVisibleRange(chart: IChartApi | null) {
  try { return chart?.timeScale().getVisibleRange() ?? null; } catch { return null; }
}

/**
 * Write one series without letting it take the others down.
 *
 * lightweight-charts notifies its visible-range subscribers synchronously from
 * within `setData`, and that notification can itself throw while the chart is
 * in the transient state above. Writing the two comparison series in sequence
 * therefore left the second one stale. Each write now stands alone.
 */
function safeSetData(series: ISeriesApi<any> | null, data: unknown[]): void {
  try { series?.setData(data as never); }
  catch (err) { console.warn("GrowthChart: setData rejected", err); }
}

function getCutoffStr(p: string): string | null {
  if (p === "Max") return null;
  const now = new Date();
  const days: Record<string, number> = { "24h":1, "1S":14, "1M":31, "3M":91, "6M":183, "1A":365, "3A":1095 };
  if (!days[p]) return null;
  now.setDate(now.getDate() - days[p]);
  return now.toISOString().slice(0, 10);
}

interface OHLCPt { date: string; value: number; open?: number; high?: number; low?: number; close?: number; }

function finitePrice(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

// Yahoo peut renvoyer ponctuellement une clôture null alors que l'OHLC existe.
// lightweight-charts refuse strictement ces valeurs lors d'un setData(), surtout
// au retour du mode bougies vers la courbe. On normalise donc une seule fois à
// l'entrée et on ignore uniquement les lignes réellement inexploitables.
function normalizeOhlcPoints(rows: unknown[]): OHLCPt[] {
  const normalized: OHLCPt[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const date = typeof row.date === "string" ? row.date : "";
    if (!date || !Number.isFinite(new Date(date).getTime())) continue;

    const close = finitePrice(row.close) ?? finitePrice(row.value);
    const open = finitePrice(row.open) ?? close;
    if (close == null || open == null) continue;

    const rawHigh = finitePrice(row.high);
    const rawLow = finitePrice(row.low);
    normalized.push({
      date,
      value: close,
      open,
      high: Math.max(rawHigh ?? close, open, close),
      low: Math.min(rawLow ?? close, open, close),
      close,
    });
  }
  return normalized;
}

function aggregateCandles(pts: OHLCPt[], getKey: (d: Date) => string): OHLCPt[] {
  const groups = new Map<string, OHLCPt[]>();
  const order: string[] = [];
  for (const pt of pts) {
    const key = getKey(new Date(pt.date));
    if (!groups.has(key)) { groups.set(key, []); order.push(key); }
    groups.get(key)!.push(pt);
  }
  return order.map(key => {
    const bars = groups.get(key)!;
    return {
      date:  bars[0].date,
      value: bars[bars.length - 1].value,
      open:  bars[0].open  ?? bars[0].value,
      high:  Math.max(...bars.map(b => b.high  ?? b.value)),
      low:   Math.min(...bars.map(b => b.low   ?? b.value)),
      close: bars[bars.length - 1].close ?? bars[bars.length - 1].value,
    };
  });
}

function hexToRgba(hex: string, alpha: number): string {
  if (!hex.startsWith("#") || hex.length < 7) return `rgba(128,128,128,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Grid presets ─────────────────────────────────────────────────────────────
type GridPreset = StyleGrille;

const GRID_PRESETS: Record<GridPreset, { color: string; style: LineStyle; label: string }> =
  Object.fromEntries(STYLES_GRILLE.map(v => [v, {
    color: couleurGrille(v, false) ?? "rgba(255,255,255,0)",
    style: LineStyle.Solid,
    label: LIBELLE_GRILLE[v],
  }])) as Record<GridPreset, { color: string; style: LineStyle; label: string }>;

function resolveGridPreset(
  preset: GridPreset,
  displayMode: "glass" | "black",
  dark: boolean,
) {
  const selected = GRID_PRESETS[preset];
  if (preset === "none") return selected;

  if (!dark) {
    const lightColors: Record<Exclude<GridPreset, "none">, string> = {
      minimal: "rgba(100,116,139,0.10)",
      standard: "rgba(100,116,139,0.16)",
      solid: "rgba(100,116,139,0.22)",
    };
    return { ...selected, color: lightColors[preset] };
  }

  // Le fond noir demande un soupçon de contraste supplémentaire, mais le
  // choix de l'utilisateur (pointillé, tireté ou plein) reste inchangé.
  if (displayMode === "black") {
    const blackColors: Record<Exclude<GridPreset, "none">, string> = {
      minimal: "rgba(255,255,255,0.050)",
      standard: "rgba(255,255,255,0.085)",
      solid: "rgba(255,255,255,0.130)",
    };
    return { ...selected, color: blackColors[preset] };
  }

  return selected;
}

export default function GrowthChart({
  portfolioData, benchmarkData, benchmarkName, portfolioLabel,
  drawdownData, ticker, portfolioColor = "#4f46e5",
  candleUpColor = "#26a69a", candleDownColor = "#ef5350",
  chartMode: chartModeProp, onChartModeChange, rightSlot, leftSlot,
  onExitFullscreen, onPeriodChange, onVisibleRangeChange, onCrosshairMove, onAdaptiveData,
  benchmarkRawData, benchmarkColor = "#f59e0b", benchmarkTicker,
  dark = false, percentMode = false, priceMode = false,
  hideDrawdown = false, dailyChangePct = null, openPrice = null, isCrypto = false, livePrice: livePriceProp,
  syncCrosshairTime = null, externalPeriod, externalInterval, externalVisibleRange,
  onIntervalChange, hideControls = false, syncPriceScaleWidth, onPriceScaleWidthChange,
  onCrosshairXPixel, syncCrosshairXPixel, timeAxisStart,
  displayMode = "glass",
}: Props) {

  const [periodFilter, setPeriodFilter] = useState<"24h"|"1S"|"1M"|"3M"|"6M"|"1A"|"3A"|"Max">("Max");
  const [intervalKey,  setIntervalKey]  = useState<"1m"|"5m"|"15m"|"1h"|"1d"|"1W">("1d");
  const [chartModeInternal, setChartModeInternal] = useState<"line"|"candle">("line");
  const chartMode = chartModeProp ?? chartModeInternal;
  const setChartMode = (fn: ((m: "line"|"candle") => "line"|"candle") | "line" | "candle") => {
    const next = typeof fn === "function" ? fn(chartMode) : fn;
    setChartModeInternal(next);
    onChartModeChange?.(next);
  };
  const [adaptiveData, setAdaptiveData] = useState<{
    date: string; value: number;
    open?: number; high?: number; low?: number; close?: number;
  }[]>([]);
  const [fullscreen, setFullscreen] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);

  // Grid customization
  const [gridPreset, setGridPreset] = useState<GridPreset>(() => {
    try { return (localStorage.getItem("novac_grid_preset") as GridPreset) || "standard"; } catch { return "standard"; }
  });
  const [showHorz, setShowHorz] = useState(() => {
    try { return localStorage.getItem("novac_grid_horz") !== "false"; } catch { return true; }
  });
  const [showVert, setShowVert] = useState(() => {
    try { return localStorage.getItem("novac_grid_vert") !== "false"; } catch { return true; }
  });
  const [showGridPicker, setShowGridPicker] = useState(false);

  // Hover state for custom tooltip
  const [hoverPrice,   setHoverPrice]   = useState<number | null>(null);
  const [hoverDate,    setHoverDate]    = useState<string | null>(null);
  const [hoverOHLC,    setHoverOHLC]    = useState<{ open:number; high:number; low:number; close:number } | null>(null);
  const [hoverPoint,   setHoverPoint]   = useState<{ x: number; y: number } | null>(null);
  const [hoverBmPrice, setHoverBmPrice] = useState<number | null>(null);
  /** Raw price at the hovered date. Kept separately from hoverPrice, which in
   *  performance mode carries the base-100 series value, so the percentage can
   *  be computed against a base expressed in the same unit. */
  const [hoverRawPrice, setHoverRawPrice] = useState<number | null>(null);
  const [hoverBmRawPrice, setHoverBmRawPrice] = useState<number | null>(null);

  // Refs
  const containerRef       = useRef<HTMLDivElement>(null);
  const chartWrapRef       = useRef<HTMLDivElement>(null);
  const chartRef           = useRef<IChartApi | null>(null);
  const areaSeriesRef      = useRef<ISeriesApi<"Area"> | null>(null);
  const candleSeriesRef    = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const benchmarkSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const chartModeRef      = useRef(chartMode);
  const prevChartModeRef  = useRef(chartMode);
  const isMountedRef      = useRef(false);
  const [fetchKey, setFetchKey] = useState(0);
  const [bmAdaptiveData, setBmAdaptiveData] = useState<OHLCPt[]>([]);
  const [comparisonMode, setComparisonMode] = useState<"perf" | "raw">("perf");
  const prevBmTickerRef = useRef<string | undefined>(undefined);
  const chartPctModeRef = useRef(false);
  /** Raw value the area series was indexed against while comparing, so a live
   *  tick can be expressed in the same unit as the curve it lands on. */
  const pctBaseRef = useRef<number | null>(null);
  /** Time window currently on screen, in unix seconds. Driven by both the
   *  period buttons and mouse zoom/pan, so it is the single reference the
   *  legend and the indexed axis can agree on. */
  const [visibleSecs, setVisibleSecs] = useState<{ from: number; to: number } | null>(null);
  /**
   * The reference both compared curves are measured against.
   *
   * A constant, because buildComparison always indexes so that the reference
   * *is* 100 — whatever it stands for: the start of the period, or yesterday's
   * close on a one-day view. Reading the first plotted point instead only
   * agreed with it by coincidence, and stopped agreeing the moment the anchor
   * moved: on "24h" the first plotted point is today's open, so the legend
   * measured the day from the open while the card measured it from the close.
   */
  const INDEXED_BASE = 100;

  const glowCanvasRef       = useRef<HTMLCanvasElement>(null);
  const portfolioColorRef   = useRef(portfolioColor);
  const lineDataRef         = useRef<{ date: string; value: number }[]>([]);
  const useBusinessDayRef   = useRef(false);

  const adaptiveDataRef         = useRef<typeof adaptiveData>([]);
  const onVisibleRangeChangeRef    = useRef(onVisibleRangeChange);
  const onCrosshairMoveRef         = useRef(onCrosshairMove);
  const onAdaptiveDataRef          = useRef(onAdaptiveData);
  const onPriceScaleWidthChangeRef = useRef(onPriceScaleWidthChange);
  const onCrosshairXPixelRef       = useRef(onCrosshairXPixel);
  useEffect(() => { portfolioColorRef.current = portfolioColor; }, [portfolioColor]);
  useEffect(() => { useBusinessDayRef.current = !isCrypto && ["1d","1W"].includes(intervalKey); }, [isCrypto, intervalKey]);
  useEffect(() => {
    lineDataRef.current = adaptiveData.length
      ? adaptiveData
      : portfolioData.map(p => ({ date: p.date as string, value: p.value as number }));
  }, [adaptiveData, portfolioData]);
  useEffect(() => { adaptiveDataRef.current = adaptiveData; }, [adaptiveData]);


  /**
   * Comparison navigates exactly like the single-asset chart.
   *
   * Panning and zooming used to be frozen here: the axis re-bases to the left
   * edge of the view, so a moving window moved the 0% reference, and the
   * figures derived from it drifted apart. That was a symptom of each figure
   * resolving its own reference. They now share one, recomputed from the
   * window on every range change, so a moving anchor is no longer a problem —
   * and freezing navigation to work around it is no longer warranted.
   *
   * Intraday stays restricted when the two assets trade on venues with
   * different hours; that limit is about the data, not the arithmetic, and is
   * handled by `intradayLocked`.
   */
  // Named rather than inlined in the dependency array: an expression there
  // cannot be checked statically, so the linter gives up on the whole effect.
  const hasBenchmarkRawData = (benchmarkRawData?.length ?? 0) > 0;
  useEffect(() => {
    // Adding or removing a comparison changes the window the chart is bound to
    // (it gets clamped to the dates both assets share), so re-frame on the
    // active period. Without this the view keeps whatever range was on screen
    // while the period button claims to cover the whole history.
    setPeriodEpoch(n => n + 1);
    // Keyed on the data being present, not just the ticker: the comparison
    // series is fetched asynchronously, so re-framing on the ticker alone runs
    // before the shared window is even known.
  }, [benchmarkTicker, hasBenchmarkRawData]);

  const benchmarkRawDataRef = useRef<DataPoint[]>([]);
  useEffect(() => { benchmarkRawDataRef.current = benchmarkRawData ?? []; }, [benchmarkRawData]);

  // The compared asset keeps its own brand colour instead of a fixed orange.
  const benchmarkColorRef = useRef(benchmarkColor);
  useEffect(() => {
    benchmarkColorRef.current = benchmarkColor;
    benchmarkSeriesRef.current?.applyOptions({ color: benchmarkColor });
  }, [benchmarkColor]);

  useEffect(() => { onVisibleRangeChangeRef.current = onVisibleRangeChange; }, [onVisibleRangeChange]);
  useEffect(() => { onCrosshairMoveRef.current = onCrosshairMove; }, [onCrosshairMove]);
  useEffect(() => { onAdaptiveDataRef.current = onAdaptiveData; }, [onAdaptiveData]);
  useEffect(() => { onPriceScaleWidthChangeRef.current = onPriceScaleWidthChange; }, [onPriceScaleWidthChange]);
  useEffect(() => { onCrosshairXPixelRef.current = onCrosshairXPixel; }, [onCrosshairXPixel]);

  // Fire onAdaptiveData whenever the price data changes (ticker mode only)
  useEffect(() => {
    if (ticker && adaptiveData.length > 0) {
      onAdaptiveDataRef.current?.(adaptiveData.map(p => ({ date: p.date, value: p.value, high: p.high, low: p.low })));
    }
  }, [adaptiveData, ticker]);
  useEffect(() => { chartModeRef.current = chartMode; }, [chartMode]);
  useEffect(() => { isMountedRef.current = true; }, []);

  // Sync canvas size to chart container
  useEffect(() => {
    const canvas = glowCanvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const sync = () => { canvas.width = container.clientWidth; canvas.height = container.clientHeight; };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  /** Bumped on every period-button click, so re-selecting the active period
   *  still re-frames the chart. */
  const [periodEpoch, setPeriodEpoch] = useState(0);

  // handlePeriodChange : met à jour la période et auto-switch l'intervalle si incompatible
  const handlePeriodChange = useCallback((p: typeof periodFilter) => {
    const allowed = PERIOD_ALLOWED_INTERVALS[p];
    if (!allowed.includes(intervalKey)) {
      const newIv = PERIOD_DEFAULT_INTERVAL[p] as typeof intervalKey;
      setIntervalKey(newIv);
      onIntervalChange?.(newIv); // notifie le parent pour que activeInterval reste en sync
    }
    setPeriodFilter(p);
    // Re-applying the same period must still reset a manual zoom. Without this
    // counter React bails out on the identical state and the view stays where
    // the user dragged it, while the button claims to show the whole period.
    setPeriodEpoch(n => n + 1);
    onPeriodChange?.(p);
  }, [intervalKey, onPeriodChange, onIntervalChange]);

  // Fetch intraday data — charge toute la plage disponible Yahoo pour l'intervalle choisi
  useEffect(() => {
    if (!ticker) { setAdaptiveData([]); return; }

    setAdaptiveData([]);

    const config = INTERVAL_FETCH_CONFIG[intervalKey];
    if (!config) { setAdaptiveData([]); return; }

    const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    let cancelled = false;
    fetch(`${API_URL}/api/v1/intraday?ticker=${encodeURIComponent(ticker)}&period=${config.apiPeriod}&interval=${config.apiInterval}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled || !Array.isArray(data)) return;
        setAdaptiveData(normalizeOhlcPoints(data));
      })
      .catch(() => { if (!cancelled) setAdaptiveData([]); });
    return () => { cancelled = true; };
  }, [ticker, intervalKey, fetchKey]);

  /**
   * Full daily history of the asset, fetched once per ticker.
   *
   * The period figures need a series that always spans the whole history.
   * `adaptiveData` cannot serve: it follows the selected interval, so at 1m it
   * holds about sixty days — every period longer than that then reported the
   * same number. And `portfolioData` is a backtested position on a ticker page,
   * not a price, so it answered a different question entirely: Max read +836%
   * from it against +747% from the prices.
   *
   * Deliberately keyed on the ticker alone, never on the interval: switching
   * from 1d to 1m must not change what "3 ans" means.
   */
  const [dailyHistory, setDailyHistory] = useState<OHLCPt[]>([]);
  useEffect(() => {
    if (!ticker) { setDailyHistory([]); return; }
    const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    let cancelled = false;
    fetch(`${API_URL}/api/v1/intraday?ticker=${encodeURIComponent(ticker)}&period=max&interval=1d`)
      .then(r => r.json())
      .then(data => { if (!cancelled && Array.isArray(data)) setDailyHistory(normalizeOhlcPoints(data)); })
      .catch(() => { if (!cancelled) setDailyHistory([]); });
    return () => { cancelled = true; };
  }, [ticker, fetchKey]);

  /**
   * The single series every period figure is read from — the eight buttons and
   * the window they clamp to. Anything deriving a period return must go through
   * here, so no two of them can end up describing different things.
   */
  const periodSource: { date: string; value?: number | string }[] =
    ticker && dailyHistory.length ? dailyHistory : portfolioData;

  // Fetch intraday data pour le benchmark — même intervalle que la courbe principale
  useEffect(() => {
    if (!ticker || !benchmarkTicker) {
      setBmAdaptiveData([]);
      prevBmTickerRef.current = undefined;
      return;
    }
    if (benchmarkTicker !== prevBmTickerRef.current) {
      setBmAdaptiveData([]);
      prevBmTickerRef.current = benchmarkTicker;
    }
    const config = INTERVAL_FETCH_CONFIG[intervalKey];
    if (!config) { setBmAdaptiveData([]); return; }
    const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    let cancelled = false;
    fetch(`${API_URL}/api/v1/intraday?ticker=${encodeURIComponent(benchmarkTicker)}&period=${config.apiPeriod}&interval=${config.apiInterval}`)
      .then(r => r.json())
      .then(data => { if (!cancelled && Array.isArray(data)) setBmAdaptiveData(normalizeOhlcPoints(data)); })
      .catch(() => { if (!cancelled) setBmAdaptiveData([]); });
    return () => { cancelled = true; };
  }, [ticker, benchmarkTicker, intervalKey, fetchKey]);

  useEffect(() => {
    setTimeout(() => window.dispatchEvent(new Event("resize")), 100);
  }, [fullscreen]);


  const isIntraday = !!(ticker && adaptiveData.length > 0);
  const isIntradayInterval = ["1m", "5m", "15m", "1h"].includes(intervalKey);

  /**
   * Do the two compared assets trade on the same session?
   *
   * Read straight off the feeds' UTC offsets ("+02:00" vs "-04:00"). Paris and
   * New York overlap barely two hours a day, so at 15m only 25% of the main
   * asset's bars have a fresh value for the compared one — the rest is a held
   * plateau. Same-exchange pairs overlap fully and compare cleanly intraday.
   */
  const sessionsAligned = useMemo(() => {
    if (!benchmarkTicker) return true;
    const off = (d: any) => {
      const m = String(d).match(/([+-]\d{2}:\d{2})$/);
      return m ? m[1] : (String(d).endsWith("Z") ? "+00:00" : null);
    };
    // Compare the most recent bars, not the oldest: over a long history the
    // two series start in different seasons, so their first points can differ
    // by an hour purely from daylight saving and look like distinct markets.
    const a = adaptiveData.length ? off(adaptiveData[adaptiveData.length - 1].date) : null;
    const b = bmAdaptiveData.length ? off(bmAdaptiveData[bmAdaptiveData.length - 1].date) : null;
    if (!a || !b) return true; // unknown — do not restrict on a guess
    return a === b;
  }, [benchmarkTicker, adaptiveData, bmAdaptiveData]);

  /** Intraday is only offered when it is actually comparable. */
  const intradayLocked = !!benchmarkTicker && !sessionsAligned;

  // Leave an interval that just became unavailable, rather than sitting on a
  // disabled button.
  useEffect(() => {
    if (intradayLocked && ["1m", "5m", "15m", "1h"].includes(intervalKey)) {
      setIntervalKey("1d");
      onIntervalChange?.("1d");
    }
  }, [intradayLocked, intervalKey, onIntervalChange]);

  // 24h has no daily equivalent — a single bar says nothing.
  useEffect(() => {
    if (intradayLocked && periodFilter === "24h") handlePeriodChange("1S");
  }, [intradayLocked, periodFilter, handlePeriodChange]);
  const hasComparison = !!(benchmarkTicker && benchmarkData.length > 0);
  // BusinessDay supprime les trous weekend/jours fériés sur les actions en 1d/1W
  const useBusinessDay = !isCrypto && ["1d", "1W"].includes(intervalKey);
  const t = (d: string) => (useBusinessDay ? toDay(d) : toTs(d)) as UTCTimestamp;

  const fmtPrice = (v: number): string => {
    if (percentMode) {
      const pct = (v - 10000) / 10000 * 100;
      return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
    }
    if (priceMode) {
      if (v < 1)    return v.toFixed(4);
      if (v < 10)   return v.toFixed(3);
      if (v >= 1e5) return `${(v / 1000).toFixed(0)}k`;
      return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
    }
    return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + " €";
  };

  // ─── Create chart on mount ────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    try {
      const blackDisplay = displayMode === "black";
      const bg  = dark ? "rgba(0,0,0,0)" : "#ffffff";
      const txt = blackDisplay ? "rgba(255,255,255,0.58)" : dark ? "var(--nv-texte-secondaire)" : "#64748b";
      const initGrid = resolveGridPreset(gridPreset, displayMode, dark);
      const initVisible = gridPreset !== "none";

      const chart = createChart(containerRef.current, {
        autoSize: true,
        layout: {
          attributionLogo: false,
          background: { type: ColorType.Solid, color: bg },
          textColor: txt,
          fontSize: 11,
        },
        grid: {
          vertLines: { color: initGrid.color, style: initGrid.style, visible: initVisible && showVert },
          horzLines: { color: initGrid.color, style: initGrid.style, visible: initVisible && showHorz },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: {
            color: blackDisplay ? "rgba(255,255,255,0.28)" : dark ? "rgba(255,255,255,0.2)" : "var(--nv-texte-secondaire)",
            style: LineStyle.Solid,
            width: 1,
            labelBackgroundColor: blackDisplay ? "#202020" : dark ? "#334155" : "#1e293b",
            labelVisible: !hideControls,
          },
          horzLine: {
            color: blackDisplay ? "rgba(255,255,255,0.28)" : dark ? "rgba(255,255,255,0.2)" : "var(--nv-texte-secondaire)",
            style: LineStyle.Solid,
            width: 1,
            labelBackgroundColor: blackDisplay ? "#202020" : dark ? "#334155" : "#1e293b",
            visible: true,
            labelVisible: !hideControls,
          },
        },
        rightPriceScale: {
          borderVisible: false,
          scaleMargins: { top: 0.08, bottom: 0.08 },
        },
        timeScale: {
          borderVisible: false,
          timeVisible: true,
          secondsVisible: false,
          fixRightEdge: true,
          fixLeftEdge: true,
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: false,
        },
        handleScale: {
          mouseWheel: true,
          pinch: true,
          axisPressedMouseMove: { time: true, price: true },
        },
        kineticScroll: { touch: true, mouse: true },
      });
      chartRef.current = chart;

      // Sync visible time range to parent (debounced)
      const timeToSec = timeToSeconds;
      let rangeDebounce: ReturnType<typeof setTimeout>;
      /**
       * Driven by the *logical* range, deliberately, though what we need is the
       * time range.
       *
       * Subscribing to the time range makes lightweight-charts call
       * `getVisibleRange()` itself before handing it over, and that throws
       * "Value is null" on an empty scale — the state between clearing a series
       * and setting the next one. Merely holding a listener was enough: going
       * from Max to 3 ans in comparison raised an unhandled error, outside any
       * try of ours since the call happens in the library's own paint cycle.
       * The logical range returns null instead of throwing, so we take that as
       * the trigger and read the time range through our own guard.
       */
      const rangeHandler = () => {
        clearTimeout(rangeDebounce);
        const range = safeVisibleRange(chartRef.current);
        // Track the window locally too, so the legend can describe what is
        // actually on screen instead of the selected period button.
        setVisibleSecs(range ? { from: timeToSec(range.from), to: timeToSec(range.to) } : null);

        rangeDebounce = setTimeout(() => {
          if (!range) { onVisibleRangeChangeRef.current?.(null, null); return; }
          onVisibleRangeChangeRef.current?.(timeToSec(range.from), timeToSec(range.to));
          const w = (chart as any).priceScale?.("right")?.width?.();
          if (typeof w === "number" && w > 0) onPriceScaleWidthChangeRef.current?.(w);
        }, 30);
      };
      chart.timeScale().subscribeVisibleLogicalRangeChange(rangeHandler);

      const area = chart.addSeries(AreaSeries, {
        lineColor: portfolioColor,
        topColor:    portfolioColor + (ticker ? "40" : "55"),
        bottomColor: portfolioColor + "00",
        lineWidth: 2,
        crosshairMarkerVisible: false,
        lastValueVisible: true,
        priceLineVisible: false,
        priceFormat: {
          type: "custom",
          formatter: (v: number) => {
            try { return fmtPrice(v); } catch { return String(v); }
          },
          minMove: 0.001,
        },
        // The 0% reference line only appears in percentage / indexedTo100
        // modes. Keep it — it marks the common starting point and separates
        // gain from loss — but dim and dashed so it does not read as a series.
        baseLineVisible: true,
        baseLineColor: "rgba(255,255,255,0.22)",
        baseLineWidth: 1,
        baseLineStyle: LineStyle.Dashed,
      });
      areaSeriesRef.current = area;

      const candle = chart.addSeries(CandlestickSeries, {
        upColor: candleUpColor, downColor: candleDownColor,
        borderUpColor: candleUpColor, borderDownColor: candleDownColor,
        wickUpColor: candleUpColor, wickDownColor: candleDownColor,
        lastValueVisible: true,
        priceLineVisible: false,
        visible: false,
      });
      candleSeriesRef.current = candle;

      const bm = chart.addSeries(LineSeries, {
        color: benchmarkColorRef.current,
        lineWidth: 1,
        // Show the compared asset's own badge on the axis — with two curves
        // overlaid, labelling only one of them is confusing.
        lastValueVisible: true,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        // Only the main series draws the 0% reference line; two overlapping
        // base lines read as a stray third curve.
        baseLineVisible: false,
      });
      benchmarkSeriesRef.current = bm;

      chart.subscribeCrosshairMove(param => {
        const glowCanvas = glowCanvasRef.current;
        const ctx = glowCanvas?.getContext("2d");

        if (!param.time || !param.point) {
          if (ctx && glowCanvas) ctx.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
          setHoverPrice(null);
          setHoverDate(null);
          setHoverOHLC(null);
          setHoverPoint(null);
          setHoverBmPrice(null);
          setHoverRawPrice(null);
          setHoverBmRawPrice(null);
          onCrosshairMoveRef.current?.(null);
          onCrosshairXPixelRef.current?.(null);
          return;
        }
        onCrosshairMoveRef.current?.(param.time as UTCTimestamp);
        onCrosshairXPixelRef.current?.(param.point.x);
        try {
          const aData  = param.seriesData.get(area) as any;
          const cData  = param.seriesData.get(candle) as any;
          const bmData = param.seriesData.get(bm) as any;
          setHoverPoint({ x: param.point.x, y: param.point.y });
          // param.time peut être UTCTimestamp (number) ou BusinessDay ({ year, month, day })
          const rawTime = param.time as any;
          const isoDate = typeof rawTime === "object"
            ? `${rawTime.year}-${String(rawTime.month).padStart(2,"0")}-${String(rawTime.day).padStart(2,"0")}T12:00:00.000Z`
            : new Date((rawTime as number) * 1000).toISOString();
          setHoverDate(isoDate);
          if (cData && chartModeRef.current === "candle") {
            setHoverPrice(cData.close ?? null);
            setHoverOHLC({ open: cData.open, high: cData.high, low: cData.low, close: cData.close });
          } else if (aData) {
            setHoverPrice(aData.value ?? null);
            setHoverOHLC(null);
          }
          setHoverBmPrice(bmData?.value ?? null);

          // The percentage must be computed from raw prices, in the same unit
          // as its reference. In performance mode the series holds base-100
          // values, so reusing the hovered series value against a raw-price
          // base divided an index by a price — a plausible-looking but
          // meaningless number.
          const dayKey = isoDate.slice(0, 10);
          const lastAtOrBefore = (arr: { date: any; value?: any }[]): number | null => {
            for (let i = arr.length - 1; i >= 0; i--) {
              if (String(arr[i].date).slice(0, 10) <= dayKey) return arr[i].value as number;
            }
            return null;
          };
          const rawSrc = adaptiveDataRef.current.length ? adaptiveDataRef.current : lineDataRef.current;
          setHoverRawPrice(lastAtOrBefore(rawSrc));
          setHoverBmRawPrice(lastAtOrBefore(benchmarkRawDataRef.current));

          // Curve glow.
          //
          // Coordinates come from series.data() rather than from the raw price
          // arrays: in performance mode the series holds base-100 values, so
          // feeding priceToCoordinate a raw price put the glow at the wrong
          // height — a bright smudge floating off the curve.
          if (ctx && glowCanvas) {
            ctx.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
            if (aData?.value != null && chartModeRef.current !== "candle") {
              const halfPx = 22;
              const cx     = param.point.x;

              const timeToSecLocal = (tm: any): number =>
                (tm !== null && typeof tm === "object")
                  ? new Date(`${tm.year}-${String(tm.month).padStart(2,"0")}-${String(tm.day).padStart(2,"0")}`).getTime() / 1000
                  : (tm as number);
              const cursorTs = timeToSecLocal(param.time);

              const collect = (series: ISeriesApi<any>): [number, number][] => {
                const pts = (series.data() as any[]) ?? [];
                if (pts.length < 2) return [];
                let lo = 0, hi = pts.length - 1, curIdx = 0;
                while (lo <= hi) {
                  const m2 = (lo + hi) >> 1;
                  if (timeToSecLocal(pts[m2].time) <= cursorTs) { curIdx = m2; lo = m2 + 1; } else hi = m2 - 1;
                }
                const WINDOW = 200;
                const out: [number, number][] = [];
                let left: [number, number] | null = null;
                let rightSet = false;
                for (let i = Math.max(0, curIdx - WINDOW); i <= Math.min(pts.length - 1, curIdx + WINDOW); i++) {
                  const sx = chart.timeScale().timeToCoordinate(pts[i].time);
                  const sy = series.priceToCoordinate(pts[i].value);
                  if (sx == null || sy == null || !isFinite(sx) || !isFinite(sy)) continue;
                  if (sx < cx - halfPx) left = [sx, sy];
                  else if (sx <= cx + halfPx) out.push([sx, sy]);
                  else if (!rightSet) { out.push([sx, sy]); rightSet = true; }
                }
                if (left) out.unshift(left);
                return out;
              };

              const paint = (segPts: [number, number][], col: string) => {
                if (segPts.length < 2) return;
                const drawPath = () => {
                  ctx.beginPath();
                  ctx.moveTo(segPts[0][0], segPts[0][1]);
                  for (let i = 1; i < segPts.length; i++) ctx.lineTo(segPts[i][0], segPts[i][1]);
                };
                ctx.save();
                ctx.beginPath();
                ctx.rect(cx - halfPx, 0, halfPx * 2, glowCanvas.height);
                ctx.clip();

                ctx.save(); ctx.filter = "blur(1.5px)";
                drawPath(); ctx.strokeStyle = hexToRgba(col, 0.5); ctx.lineWidth = 3;
                ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
                ctx.restore();

                drawPath(); ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 1.5;
                ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
                ctx.restore();
              };

              paint(collect(area), portfolioColorRef.current);
              // The compared curve deserves the same treatment: highlighting
              // only one of two overlaid series looks like a rendering fault.
              if ((bm.data() as any[])?.length) paint(collect(bm), benchmarkColorRef.current);

              // Fade left/right edges once, over both glows.
              ctx.globalCompositeOperation = "destination-in";
              const fade = ctx.createLinearGradient(cx - halfPx, 0, cx + halfPx, 0);
              fade.addColorStop(0,   "rgba(0,0,0,0)");
              fade.addColorStop(0.2, "rgba(0,0,0,1)");
              fade.addColorStop(0.8, "rgba(0,0,0,1)");
              fade.addColorStop(1,   "rgba(0,0,0,0)");
              ctx.fillStyle = fade;
              ctx.fillRect(0, 0, glowCanvas.width, glowCanvas.height);
              ctx.globalCompositeOperation = "source-over";
            }
          }
        } catch { /* ignore crosshair errors */ }
      });

      setChartError(null);

      return () => {
        clearTimeout(rangeDebounce);
        chart.remove();
        chartRef.current = null;
        areaSeriesRef.current = null;
        candleSeriesRef.current = null;
        benchmarkSeriesRef.current = null;
      };
    } catch (err: any) {
      setChartError(err?.message ?? "Chart init failed");
    }
    // The chart is built once and afterwards mutated through applyOptions.
    // Listing the colours, theme and formatters here would tear it down and
    // rebuild it on every appearance change — which is precisely what happened
    // when `black` was once in this array: the series were dropped and the data
    // effect, whose own dependencies had not changed, never re-ran to restore
    // them. Anything that must react to a prop belongs in its own effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync period from external source (split-view mode)
  useEffect(() => {
    if (!externalPeriod) return;
    const valid = ["24h","1S","1M","3M","6M","1A","3A","Max"] as const;
    if (!valid.includes(externalPeriod as any)) return;
    setPeriodFilter(externalPeriod as typeof valid[number]);
    // Application immédiate du range via refs — évite d'attendre le cycle state→render→effect
    const chart = chartRef.current;
    const data = adaptiveDataRef.current;
    if (!chart || !data.length) return;
    const visibleSecs = (PERIOD_VISIBLE_SECS as Record<string, number | undefined>)[externalPeriod] ?? null;
    if (visibleSecs) {
      if (useBusinessDay) {
        const toDate = data[data.length - 1].date.slice(0, 10);
        const fromDate = new Date(Date.now() - visibleSecs * 1000).toISOString().slice(0, 10);
        try { chart.timeScale().setVisibleRange({ from: toDay(fromDate) as any, to: toDay(toDate) as any }); } catch {}
      } else {
        const nowSec = Math.floor(Date.now() / 1000);
        const lastTs = toTs(data[data.length - 1].date);
        const toSec = (nowSec - lastTs > visibleSecs / 2 ? lastTs : nowSec) as UTCTimestamp;
        const fromSec = (toSec - visibleSecs) as UTCTimestamp;
        try { chart.timeScale().setVisibleRange({ from: fromSec, to: toSec }); } catch {}
      }
    } else {
      try { chart.timeScale().fitContent(); } catch {}
    }
  }, [externalPeriod, useBusinessDay]);

  // Sync interval from external source
  useEffect(() => {
    if (!externalInterval) return;
    const valid = ["1m","5m","15m","1h","1d","1W"] as const;
    if (valid.includes(externalInterval as any)) setIntervalKey(externalInterval as typeof valid[number]);
  }, [externalInterval]);

  const externalVisibleRangeRef = useRef(externalVisibleRange);
  useEffect(() => { externalVisibleRangeRef.current = externalVisibleRange; }, [externalVisibleRange]);

  // Verrouille la plage visible (split-view sync)
  // fixLeftEdge doit être false sinon setVisibleRange est contraint au premier data point
  // minimumWidth identique sur les 2 charts pour aligner les curseurs pixel-parfait
  useEffect(() => {
    if (!chartRef.current) return;
    const scaleW = syncPriceScaleWidth ?? 0;
    chartRef.current.applyOptions({
      timeScale: { fixLeftEdge: !externalVisibleRange },
      rightPriceScale: { minimumWidth: scaleW },
    });
    if (!externalVisibleRange) return;
    const from = externalVisibleRange.from as UTCTimestamp;
    const to   = externalVisibleRange.to   as UTCTimestamp;
    try { chartRef.current.timeScale().setVisibleRange({ from, to }); } catch {}
  }, [externalVisibleRange, syncPriceScaleWidth]);

  // Sync crosshair from external source (split-view mode)
  useEffect(() => {
    if (!chartRef.current || syncCrosshairTime == null) {
      chartRef.current?.clearCrosshairPosition();
      return;
    }
    const series = areaSeriesRef.current ?? candleSeriesRef.current;
    if (!series) return;
    try { chartRef.current.setCrosshairPosition(NaN, syncCrosshairTime as UTCTimestamp, series); } catch {}
  }, [syncCrosshairTime]);

  // Update layout colors when dark mode changes
  useEffect(() => {
    if (!chartRef.current) return;
    const bg  = dark ? "rgba(0,0,0,0)" : "#ffffff";
    const txt = displayMode === "black" ? "rgba(255,255,255,0.58)" : dark ? "var(--nv-texte-secondaire)" : "#64748b";
    chartRef.current.applyOptions({
      layout: { background: { type: ColorType.Solid, color: bg }, textColor: txt },
    });
  }, [dark, displayMode]);

  // Update grid when preset or toggles change
  useEffect(() => {
    if (!chartRef.current) return;
    const p = resolveGridPreset(gridPreset, displayMode, dark);
    const visible = gridPreset !== "none";
    chartRef.current.applyOptions({
      grid: {
        vertLines: { color: p.color, style: p.style, visible: visible && showVert },
        horzLines: { color: p.color, style: p.style, visible: visible && showHorz },
      },
    });
  }, [gridPreset, showHorz, showVert, dark, displayMode]);

  // Update area series color (from logo color extraction)
  useEffect(() => {
    if (!areaSeriesRef.current) return;
    areaSeriesRef.current.applyOptions({
      lineColor: portfolioColor,
      topColor:    portfolioColor + (ticker ? "40" : "55"),
      bottomColor: portfolioColor + "00",
      crosshairMarkerBackgroundColor: portfolioColor,
    });
  }, [portfolioColor, ticker]);

  // Update candle colors
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    candleSeriesRef.current.applyOptions({
      upColor: candleUpColor, downColor: candleDownColor,
      borderUpColor: candleUpColor, borderDownColor: candleDownColor,
      wickUpColor: candleUpColor, wickDownColor: candleDownColor,
    });
  }, [candleUpColor, candleDownColor]);

  // Set series data
  useEffect(() => {
    const area   = areaSeriesRef.current;
    const candle = candleSeriesRef.current;
    const bm     = benchmarkSeriesRef.current;
    if (!area || !candle || !bm) return;

    try {
      const savedRange = safeVisibleRange(chartRef.current);
      const cutStr = getCutoffStr(periodFilter);
      const filterDate = (arr: DataPoint[]) => cutStr ? arr.filter(p => p.date >= cutStr) : arr;

      if (ticker) {
        if (isIntraday) {
          const inCandle    = chartModeRef.current === "candle";
          const dotStartStr = adaptiveData.length ? String(adaptiveData[0].date).slice(0, 10) : "";
          const rawFmt      = { type: "price" as const, precision: 4, minMove: 0.0001 };
          // 1 bougie = 1 session de trading — jamais de downsample sur les candles.
          // La courbe line peut être réduite (visuellement identique sur courbes lisses).
          const lineData   = sampleDown(adaptiveData);
          const candleData = adaptiveData;

          if (hasComparison && benchmarkData.length && adaptiveData.length) {

            if (comparisonMode === "perf") {
              const useBmIntraday = bmAdaptiveData.length > 0;
              const bmSource = useBmIntraday ? bmAdaptiveData : benchmarkData.filter(p => p.date >= dotStartStr);

              // Everything the two curves are made of is decided by
              // buildComparison, which is pure and covered by tests. What is
              // left here is writing the result onto the chart.
              const curves = buildComparison(
                adaptiveData.map(p => ({ date: String(p.date), value: p.value as number })),
                (bmSource as DataPoint[]).map(p => ({ date: String(p.date), value: p.value as number })),
                cutStr,
                // "24h" means the day's move against yesterday's close, the
                // same question the asset card answers. A plain now-minus-24h
                // cut-off anchors on yesterday's open instead. The closes come
                // from the daily series both here and in the card, because the
                // intraday feed stops before the closing auction and would put
                // the two a few tenths of a percent apart.
                periodFilter === "24h"
                  ? {
                      anchor: "session",
                      bases: {
                        main: previousSessionClose(
                          dailyHistory.map(p => ({ date: String(p.date), value: p.value })),
                        ),
                        compared: previousSessionClose(
                          (benchmarkRawData ?? []).map(p => ({ date: String(p.date), value: p.value as number })),
                        ),
                      },
                    }
                  : {},
              );

              const base100Fmt = {
                type: "custom" as const,
                formatter: (v: number) => {
                  const pct = v - 100;
                  if (Math.abs(pct) >= 10000) return `${pct >= 0 ? "+" : ""}${(pct / 1000).toFixed(1)}K%`;
                  if (Math.abs(pct) >= 1000)  return `${pct >= 0 ? "+" : ""}${(pct / 1000).toFixed(2)}K%`;
                  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
                },
                minMove: 0.01,
              };

              if (curves) {
                chartRef.current?.applyOptions({ leftPriceScale: { visible: false } });
                candle.applyOptions({ visible: false });
                candle.setData([]);

                pctBaseRef.current = curves.base;
                safeSetData(area, dedupByTime(curves.main.map(p => ({ time: t(p.date), value: p.value }))));
                safeSetData(bm, dedupByTime(curves.compared.map(p => ({ time: t(p.date), value: p.value }))));
                area.applyOptions({ visible: true, priceFormat: base100Fmt, priceScaleId: "right" });
                bm.applyOptions({ priceFormat: base100Fmt, priceScaleId: "right" });
                chartPctModeRef.current = true;
              } else {
                candle.applyOptions({ visible: false });
                candle.setData([]);
                area.setData(dedupByTime(lineData.map(p => ({ time: t(p.date), value: p.value }))));
                bm.setData([]);
                area.applyOptions({ visible: true, priceFormat: rawFmt, priceScaleId: "right" });
                chartPctModeRef.current = false;
                pctBaseRef.current = null;
              }

            } else {
              // ── Prix réel ──
              const rawBmAligned = (benchmarkRawData ?? []).filter(p => p.date >= dotStartStr);
              const aData = dedupByTime(lineData.map(p => ({ time: t(p.date), value: p.value })));
              const cData = dedupByTime(candleData.map(p => ({
                time: t(p.date), open: p.open ?? p.value, high: p.high ?? p.value,
                low: p.low ?? p.value, close: p.close ?? p.value,
              })));
              chartRef.current?.applyOptions({
                leftPriceScale: { visible: true, borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.08 } },
              });
              if (inCandle) {
                area.applyOptions({ visible: false, priceFormat: rawFmt, priceScaleId: "right" });
                area.setData([]);
                candle.setData(cData);
                candle.applyOptions({ visible: true });
              } else {
                candle.applyOptions({ visible: false });
                candle.setData([]);
                area.setData(aData);
                area.applyOptions({ visible: true, priceFormat: rawFmt, priceScaleId: "right" });
              }
              bm.applyOptions({ priceScaleId: "left", priceFormat: rawFmt });
              bm.setData(rawBmAligned.length
                ? dedupByTime(sampleDown(rawBmAligned).map(p => ({ time: t(p.date), value: p.value as number })))
                : []);
              chartPctModeRef.current = false;
              pctBaseRef.current = null;
            }

          } else {
            // ── Pas de benchmark ──
            chartRef.current?.applyOptions({ leftPriceScale: { visible: false } });
            const aData = dedupByTime(lineData.map(p => ({ time: t(p.date), value: p.value })));
            const cData = dedupByTime(candleData.map(p => ({
              time: t(p.date), open: p.open ?? p.value, high: p.high ?? p.value,
              low: p.low ?? p.value, close: p.close ?? p.value,
            })));
            // Whitespace prefix (mode sync Max) : étend l'axe X de timeAxisStart au 1er bar réel.
            // fitContent() montrera alors depuis timeAxisStart, aligné avec le top chart.
            const wsPrefix: { time: UTCTimestamp }[] = [];
            if (timeAxisStart && aData.length > 0) {
              const firstTs = aData[0].time as number;
              if (timeAxisStart < firstTs) {
                for (let ts = timeAxisStart; ts < firstTs; ts += 86400) {
                  wsPrefix.push({ time: ts as UTCTimestamp });
                }
              }
            }
            if (inCandle) {
              area.applyOptions({ visible: false, priceFormat: rawFmt, priceScaleId: "right" });
              area.setData([]);
              candle.setData([...wsPrefix, ...cData] as any);
              candle.applyOptions({ visible: true });
            } else {
              candle.applyOptions({ visible: false });
              candle.setData([]);
              area.setData([...wsPrefix, ...aData] as any);
              area.applyOptions({ visible: true, priceFormat: rawFmt, priceScaleId: "right" });
            }
            bm.setData([]);
            bm.applyOptions({ priceScaleId: "right", priceFormat: rawFmt });
            chartPctModeRef.current = false;
            pctBaseRef.current = null;
          }

        } else {
          area.setData([]); candle.setData([]); bm.setData([]);
          chartPctModeRef.current = false;
          pctBaseRef.current = null;
        }
      } else {
        // Portfolio mode
        const rawFmtPortfolio = { type: "custom" as const, formatter: (v: number) => { try { return fmtPrice(v); } catch { return String(v); } }, minMove: 0.001 };
        const aData = dedupByTime(filterDate(portfolioData).map(p => ({ time: toTs(p.date), value: p.value as number })));
        const bmData = benchmarkData.length
          ? dedupByTime(filterDate(benchmarkData).map(p => ({ time: toTs(p.date), value: p.value as number })))
          : [];
        area.setData(aData);
        candle.setData([]);
        bm.setData(bmData);
        area.applyOptions({ visible: true, priceFormat: rawFmtPortfolio });
        candle.applyOptions({ visible: false });
      }

      // Ne restaure pas le range si un range externe gère la plage (mode sync)
      // Également ignoré si externalPeriod est actif — le time-range effect applique la bonne plage
      // Not while comparing: navigation is locked there, so there is no user
      // range worth preserving — and restoring the pre-comparison one fought
      // the re-frame, collapsing a one-week view down to the last few bars.
      if (savedRange && chartRef.current && !externalVisibleRangeRef.current && !externalPeriod && !benchmarkTicker) {
        try { chartRef.current.timeScale().setVisibleRange(savedRange as any); } catch {}
      }
      // No fitContent here: the period effect already sets the exact window.
      // Fitting the content instead framed on every loaded bar, and since the
      // common start is truncated to the day, "24h" stretched to cover the
      // whole previous session.
    } catch (err) {
      // Keep the stack. This handler used to log the message alone, which hid
      // where the throw came from — and because the two series are written one
      // after the other, a throw in between left the compared curve holding the
      // previous period's data while the main one had moved on.
      console.warn("GrowthChart setData error:", err);
    }
    // Listed on purpose, and deliberately short of what the linter wants.
    // `portfolioData` changes on every live tick — including it would rewrite
    // every series once a minute and reset the view under the cursor; the live
    // price has its own effect for that. `t` and `fmtPrice` are rebuilt on each
    // render, so they would loop. What remains is the set that genuinely
    // changes the data being plotted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adaptiveData, bmAdaptiveData, benchmarkData, benchmarkRawData, isIntraday, periodFilter, comparisonMode, chartMode, externalVisibleRange, timeAxisStart]);

  // Mise à jour du prix live (toutes les ~60s pour les actions Yahoo Finance).
  // series.update() met à jour uniquement la dernière barre sans reset de vue.
  useEffect(() => {
    if (!isIntraday || portfolioData.length === 0 || adaptiveData.length === 0) return;
    // On a ticker page `portfolioData` is a backtested position, not a price:
    // its last value is a euro amount in the tens of thousands. Writing it into
    // a price series put a spike at the right edge; writing it into a series
    // indexed to 100 while comparing made the legend read +84 000 %. Take the
    // live price where there is one, and fall back to the bar being replaced.
    const fallback = ticker
      ? finitePrice(adaptiveData[adaptiveData.length - 1].value)
      : finitePrice(portfolioData[portfolioData.length - 1].value);
    const rawLive = (ticker ? finitePrice(livePriceProp) : undefined) ?? fallback;
    const lastBar = adaptiveData[adaptiveData.length - 1];
    if (rawLive == null || !lastBar) return;
    // The curve may be indexed; the tick has to reach it in the same unit.
    const livePrice = chartPctModeRef.current
      ? (pctBaseRef.current ? (rawLive / pctBaseRef.current) * 100 : null)
      : rawLive;
    if (livePrice == null) return;
    const isBizDay = !isCrypto && ["1d", "1W"].includes(intervalKey);
    const lastTime = isBizDay ? (toDay(lastBar.date) as any) : toTs(lastBar.date);
    try {
      if (chartModeRef.current === "candle") {
        // Candles are never indexed — they are hidden while comparing — so they
        // take the raw tick, alongside the raw open/high/low of the same bar.
        candleSeriesRef.current?.update({
          time:  lastTime,
          open:  lastBar.open  ?? lastBar.value,
          high:  Math.max(lastBar.high ?? lastBar.value, rawLive),
          low:   Math.min(lastBar.low ?? lastBar.value, rawLive),
          close: rawLive,
        });
      } else {
        areaSeriesRef.current?.update({ time: lastTime, value: livePrice });
      }
    } catch { /* ignore si série pas encore prête */ }
  }, [portfolioData, adaptiveData, livePriceProp, ticker, isCrypto, intervalKey, isIntraday]);

  // Applique la fenêtre visible quand les données changent OU quand la période change
  useEffect(() => {
    if (!adaptiveData.length) return;
    const chart = chartRef.current;
    if (!chart) return;
    // Si un range externe est actif (mode sync), il prime sur le range interne
    if (externalVisibleRange) {
      try {
        chart.timeScale().setVisibleRange({
          from: externalVisibleRange.from as UTCTimestamp,
          to:   externalVisibleRange.to   as UTCTimestamp,
        });
      } catch {}
      return;
    }
    const visibleSecs = PERIOD_VISIBLE_SECS[periodFilter];
    if (visibleSecs) {
      if (useBusinessDay) {
        const toDate  = adaptiveData[adaptiveData.length - 1].date.slice(0, 10);
        const fromDate = new Date(Date.now() - visibleSecs * 1000).toISOString().slice(0, 10);
        chart.timeScale().setVisibleRange({ from: toDay(fromDate) as any, to: toDay(toDate) as any });
      } else {
        const nowSec  = Math.floor(Date.now() / 1000);
        const lastTs  = toTs(adaptiveData[adaptiveData.length - 1].date);
        const toSec   = (nowSec - lastTs > visibleSecs / 2 ? lastTs : nowSec) as UTCTimestamp;
        const fromSec = (toSec - visibleSecs) as UTCTimestamp;
        chart.timeScale().setVisibleRange({ from: fromSec, to: toSec });
      }
    } else {
      chart.timeScale().fitContent();
    }
  }, [adaptiveData, periodFilter, useBusinessDay, externalVisibleRange, periodEpoch]);

  // fitContent en mode portfolio (pas de fetch async, données déjà dispo)
  useEffect(() => {
    if (!ticker) {
      chartRef.current?.timeScale().fitContent();
    }
  }, [periodFilter, ticker, periodEpoch]);

  // Bascule immédiate de visibilité entre les deux séries au changement de mode
  useEffect(() => {
    prevChartModeRef.current = chartMode;
    if (!ticker || !areaSeriesRef.current || !candleSeriesRef.current) return;
    const inCandle = chartMode === "candle";
    areaSeriesRef.current.applyOptions({ visible: !inCandle });
    candleSeriesRef.current.applyOptions({ visible: inCandle });
  }, [chartMode, ticker]);

  // ─── Drawdown data ────────────────────────────────────────────────────────────
  const drawdownSampled = useMemo(() => {
    if (!drawdownData || drawdownData.length === 0) return [];
    const cutStr = getCutoffStr(periodFilter);
    let pts = cutStr ? drawdownData.filter(p => p.date >= cutStr) : drawdownData;
    const hasPos = pts.some(p => (p.drawdown ?? 0) > 0);
    if (hasPos) pts = pts.map(p => ({ ...p, drawdown: -Math.abs(p.drawdown ?? 0), drawdown_eur: -Math.abs(p.drawdown_eur ?? 0) }));
    if (pts.length <= 300) return pts;
    const step = Math.ceil(pts.length / 300);
    return pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
  }, [drawdownData, periodFilter]);

  // ─── Perf stats ───────────────────────────────────────────────────────────────
  // Même source que les boutons inactifs → bouton actif = légende, jamais de changement au clic
  /**
   * First date both assets have data for. While comparing, the chart is
   * clamped to it — so the period figures must be too, otherwise "Max" reports
   * the main asset since its own IPO while the chart shows the common window.
   */
  const comparisonRange = useMemo(() => {
    const bm = benchmarkRawData ?? [];
    if (!benchmarkTicker || !bm.length) return null;
    // The full history, not the displayed one: bounding on the intraday window
    // clamped every period longer than it to the same start, so 3M, 6M, 1A, 3A
    // and Max all reported one identical figure.
    const src = periodSource;
    if (!src.length) return null;
    const aStart = String(src[0].date).slice(0, 10);
    const bStart = String(bm[0].date).slice(0, 10);
    // The end matters as much as the start: one market may have traded a day
    // longer, and counting that extra session in the period figures but not on
    // the chart makes the two disagree.
    const aEnd = String(src[src.length - 1].date).slice(0, 10);
    const bEnd = String(bm[bm.length - 1].date).slice(0, 10);
    return { start: aStart > bStart ? aStart : bStart, end: aEnd < bEnd ? aEnd : bEnd };
  }, [benchmarkTicker, benchmarkRawData, periodSource]);
  const comparisonStart = comparisonRange?.start ?? null;
  const comparisonEnd   = comparisonRange?.end ?? null;

  const periodPerfData = useMemo(() => {
    const source = periodSource;
    if (periodFilter === "24h" && dailyChangePct !== null && source.length > 0) {
      const last  = source[source.length - 1].value as number;
      const first = last / (1 + dailyChangePct / 100);
      return { first, last };
    }
    const visibleSecs = (PERIOD_VISIBLE_SECS as Record<string, number | undefined>)[periodFilter] ?? null;
    const cutStr = visibleSecs
      ? new Date(Date.now() - visibleSecs * 1000).toISOString().slice(0, 10)
      : null;
    // Never start before the compared asset exists, nor end after its last
    // session — the chart is bound to the same window.
    const floor = comparisonStart && (!cutStr || comparisonStart > cutStr) ? comparisonStart : cutStr;
    const pts = source.filter(p => {
      const d = String(p.date).slice(0, 10);
      return (!floor || d >= floor) && (!comparisonEnd || d <= comparisonEnd);
    });
    if (pts.length < 2) return null;
    return { first: pts[0].value as number, last: pts[pts.length - 1].value as number };
  }, [periodSource, periodFilter, dailyChangePct, comparisonStart, comparisonEnd]);

  const periodPerfPct  = periodPerfData ? (periodPerfData.last - periodPerfData.first) / periodPerfData.first * 100 : null;

  /**
   * Same figures but anchored to what is on screen rather than to the selected
   * period button. Zooming changes the indexed axis, so a legend tied to the
   * button would contradict it; this keeps the two in step whether the user
   * navigates with the period buttons or the mouse.
   */
  const visiblePerfData = useMemo(() => {
    const source = (ticker && adaptiveData.length > 0 ? adaptiveData : portfolioData)
      .map(p => ({ date: String(p.date), value: p.value as number }));
    if (!visibleSecs || source.length < 2) return periodPerfData;
    const fromStr = new Date(visibleSecs.from * 1000).toISOString().slice(0, 10);
    const toStr   = new Date(visibleSecs.to   * 1000).toISOString().slice(0, 10);
    return windowEnds(source, fromStr, toStr) ?? periodPerfData;
  }, [ticker, adaptiveData, portfolioData, visibleSecs, periodPerfData]);

  /**
   * While comparing, both figures come from the series values divided by their
   * value at the left edge of the window — the exact transform the axis
   * applies. Outside comparison the raw-price path is kept, since the axis then
   * shows prices rather than a relative scale.
   */
  const cmpMode = !!benchmarkTicker && chartPctModeRef.current;

  /**
   * Resolve each curve to one reference and the values measured against it.
   *
   * Comparison mode reads the series, whose values are already rebased to 100;
   * price mode reads the raw arrays. Picking the pair in a single expression is
   * what makes the two modes structurally unable to disagree: there is no point
   * at which a base from one source can meet a value from the other.
   */
  const mainCurve = cmpMode
    ? { base: INDEXED_BASE, last: lastSeriesValue(areaSeriesRef.current), hover: hoverPrice }
    : { base: visiblePerfData?.first ?? null, last: visiblePerfData?.last ?? null, hover: hoverRawPrice };

  const visiblePerfPct = pctChange(mainCurve.last, mainCurve.base);
  const hoverPerfPct   = pctChange(mainCurve.hover, mainCurve.base);

  /** Same window, same reference, for the compared asset — so both legend
   *  figures answer "since the left edge of what you see", like the axis.
   *  Both ends are taken, and from the same filter the main asset uses, so the
   *  two curves cannot end up reporting over different spans. */
  const bmVisibleWindow = useMemo(() => {
    const src = (benchmarkRawData ?? []).map(p => ({ date: String(p.date), value: p.value as number }));
    if (!src.length) return null;
    const whole = windowEnds(src, null, null);
    if (!visibleSecs) return whole;
    const fromStr = new Date(visibleSecs.from * 1000).toISOString().slice(0, 10);
    const toStr   = new Date(visibleSecs.to   * 1000).toISOString().slice(0, 10);
    return windowEnds(src, fromStr, toStr) ?? whole;
  }, [benchmarkRawData, visibleSecs]);

  const bmCurve = cmpMode
    ? { base: INDEXED_BASE, last: lastSeriesValue(benchmarkSeriesRef.current), hover: hoverBmPrice }
    : { base: bmVisibleWindow?.first ?? null, last: bmVisibleWindow?.last ?? null, hover: hoverBmRawPrice };

  const bmHoverPerfPct   = pctChange(bmCurve.hover, bmCurve.base);
  const bmVisiblePerfPct = pctChange(bmCurve.last, bmCurve.base);
  const bmDisplayPerfPct = bmHoverPerfPct ?? bmVisiblePerfPct;
  // displayPrice always shows the live price (portfolioData.last), independent of perf calculation.
  const displayPrice   = hoverPrice !== null
    ? hoverPrice
    : hoverDate !== null
      ? 0  // cursor active but in whitespace (no series value)
      : (livePriceProp ?? (portfolioData.length > 0 ? portfolioData[portfolioData.length - 1].value as number : null));
  const displayPerfPct = hoverPerfPct ?? visiblePerfPct;

  const fmtHoverDate = (iso: string | null): string | null => {
    if (!iso) return null;
    try {
      const d = new Date(iso);
      if (intervalKey === "1m") return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      if (["5m","15m","1h"].includes(intervalKey)) return d.toLocaleDateString("fr-FR", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" });
      return d.toLocaleDateString("fr-FR", { day:"numeric", month:"short", year:"numeric" });
    } catch { return iso; }
  };

  const displayDate = hoverDate ?? (adaptiveData.length > 0 ? adaptiveData[adaptiveData.length - 1].date : portfolioData.length > 0 ? portfolioData[portfolioData.length - 1].date : null);

  // Légende top-left intégrée dans le chart (style TradingView)
  // Affiche toujours le prix/perf courant ; se met à jour avec les valeurs hover.
  const chartLegend = (
    <div style={{
      position: "absolute", top: 8, left: 8, zIndex: 20, pointerEvents: "none",
      lineHeight: 1.6,
    }}>
      <div style={{ fontSize: 11, color: dark ? "rgba(255,255,255,0.45)" : "var(--nv-texte-secondaire)", marginBottom: 2 }}>
        {fmtHoverDate(displayDate)}
      </div>
      {hoverOHLC ? (
        <div style={{ display: "flex", gap: 8, fontSize: 11, flexWrap: "wrap" }}>
          {([
            { label: "O", val: hoverOHLC.open,  color: dark ? "var(--nv-texte)" : "#475569" },
            { label: "H", val: hoverOHLC.high,  color: "var(--nv-positif)" },
            { label: "L", val: hoverOHLC.low,   color: "#ef4444" },
            { label: "C", val: hoverOHLC.close, color: hoverOHLC.close >= hoverOHLC.open ? "var(--nv-positif)" : "#ef4444" },
          ] as const).map(({ label, val, color }) => (
            <span key={label}>
              <span style={{ color: dark ? "rgba(255,255,255,0.35)" : "var(--nv-texte-secondaire)" }}>{label} </span>
              <span style={{ fontWeight: 600, fontFamily: "monospace", color }}>{fmtPrice(val)}</span>
            </span>
          ))}
        </div>
      ) : displayPrice !== null ? (
        <div style={{ fontSize: 11, display: "flex", gap: 12 }}>
          {/* When comparing, both entries are shown as a percentage since the
              left edge of the visible range — the same reference as the axis.
              Showing a base-100 index next to a window-based percentage made
              the two figures contradict each other as soon as you zoomed. */}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            {benchmarkTicker && (
              <span style={{ width: 9, height: 2, borderRadius: 1, background: portfolioColor, flexShrink: 0 }} />
            )}
            <span style={{ color: dark ? "rgba(255,255,255,0.35)" : "var(--nv-texte-secondaire)" }}>{portfolioLabel}</span>
            {!benchmarkTicker && (
              <span style={{ fontWeight: 600, fontFamily: "monospace", color: portfolioColor }}>{fmtPrice(displayPrice)}</span>
            )}
            {benchmarkTicker && displayPerfPct != null && (
              <span style={{ fontWeight: 700, fontFamily: "monospace", color: displayPerfPct >= 0 ? "var(--nv-positif)" : "#ef4444" }}>
                {displayPerfPct >= 0 ? "+" : ""}{displayPerfPct.toFixed(2)}%
              </span>
            )}
          </span>
          {benchmarkTicker && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 9, height: 2, borderRadius: 1, background: benchmarkColor, flexShrink: 0 }} />
              <span style={{ color: dark ? "rgba(255,255,255,0.35)" : "var(--nv-texte-secondaire)" }}>{benchmarkName}</span>
              {bmDisplayPerfPct != null && (
                <span style={{ fontWeight: 700, fontFamily: "monospace", color: bmDisplayPerfPct >= 0 ? "var(--nv-positif)" : "#ef4444" }}>
                  {bmDisplayPerfPct >= 0 ? "+" : ""}{bmDisplayPerfPct.toFixed(2)}%
                </span>
              )}
            </span>
          )}
          {!benchmarkTicker && displayPerfPct != null && (
            <span style={{ fontWeight: 700, color: displayPerfPct >= 0 ? "var(--nv-positif)" : "#ef4444" }}>
              {displayPerfPct >= 0 ? "+" : ""}{displayPerfPct.toFixed(2)}%
            </span>
          )}
        </div>
      ) : null}
    </div>
  );

  // ─── JSX ─────────────────────────────────────────────────────────────────────
  return (
    <div
      ref={chartWrapRef}
      className={fullscreen ? "fixed inset-0 z-50 flex flex-col p-4" : "w-full h-full flex flex-col"}
      style={fullscreen
        ? { background: dark ? "#041124" : "white" }
        : { minHeight: 0, overflow: "hidden" }
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 shrink-0 gap-2">
        <div className="flex items-center min-w-0">{leftSlot ?? null}</div>

        <div className="flex items-center gap-1 shrink-0">
          {rightSlot}

          {/* Grid picker — dark mode only */}
          {dark && (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowGridPicker(v => !v)}
                title="Personnaliser la grille"
                className="chart-action-btn"
                style={{
                  width: 30, height: 30, borderRadius: 9,
                  border: `1px solid ${showGridPicker ? "rgba(155,185,255,0.40)" : "rgba(255,255,255,0.12)"}`,
                  background: showGridPicker ? "rgba(155,185,255,0.18)" : "rgba(255,255,255,0.06)",
                  color: showGridPicker ? "#9BB9FF" : "rgba(255,255,255,0.4)",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.15s",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <line x1="0" y1="4.7" x2="14" y2="4.7"/>
                  <line x1="0" y1="9.3" x2="14" y2="9.3"/>
                  <line x1="4.7" y1="0" x2="4.7" y2="14"/>
                  <line x1="9.3" y1="0" x2="9.3" y2="14"/>
                </svg>
              </button>

              {showGridPicker && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setShowGridPicker(false)} />
                  <div style={{
                    position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50,
                    background: "rgba(6,14,32,0.97)", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 12, padding: "12px 12px 10px", backdropFilter: "blur(20px)",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.5)", width: 196,
                  }}>
                    {/* Presets */}
                    <div style={{ fontSize: 9, letterSpacing: "0.1em", color: "rgba(255,255,255,0.22)", marginBottom: 8 }}>STYLE</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5, marginBottom: 12 }}>
                      {(["none","minimal","standard","solid"] as GridPreset[]).map(p => {
                        const active = gridPreset === p;
                        return (
                          <button key={p} onClick={() => {
                            setGridPreset(p);
                            try { localStorage.setItem("novac_grid_preset", p); } catch {}
                          }} style={{
                            borderRadius: 7, padding: "6px 4px 5px", cursor: "pointer",
                            border: active ? "1px solid rgba(155,185,255,0.55)" : "1px solid rgba(255,255,255,0.07)",
                            background: active ? "rgba(79,70,229,0.2)" : "rgba(255,255,255,0.04)",
                            transition: "all 0.15s", display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                          }}>
                            {/* Mini preview */}
                            <svg width="28" height="20" viewBox="0 0 28 20" style={{ flexShrink: 0 }}>
                              <rect width="28" height="20" fill="rgba(255,255,255,0.03)" rx="2"/>
                              {p !== "none" && <>
                                <line x1="0" y1="10" x2="28" y2="10"
                                  stroke={GRID_PRESETS[p].color === "rgba(255,255,255,0)" ? "none" : GRID_PRESETS[p].color}
                                  strokeWidth="1"
                                  strokeDasharray="none"
                                  opacity={p === "minimal" ? 0.5 : 1}
                                />
                                <line x1="14" y1="0" x2="14" y2="20"
                                  stroke={GRID_PRESETS[p].color === "rgba(255,255,255,0)" ? "none" : GRID_PRESETS[p].color}
                                  strokeWidth="1"
                                  strokeDasharray="none"
                                  opacity={p === "minimal" ? 0.5 : 1}
                                />
                              </>}
                            </svg>
                            <span style={{ fontSize: 8, color: active ? "#9BB9FF" : "rgba(255,255,255,0.35)", letterSpacing: "0.04em" }}>
                              {GRID_PRESETS[p].label}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* H/V toggles */}
                    <div style={{ fontSize: 9, letterSpacing: "0.1em", color: "rgba(255,255,255,0.22)", marginBottom: 8 }}>LIGNES</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {([
                        { key: "horz" as const, label: "Horizontales", icon: "≡", val: showHorz, set: (v: boolean) => { setShowHorz(v); try { localStorage.setItem("novac_grid_horz", String(v)); } catch {} } },
                        { key: "vert" as const, label: "Verticales",   icon: "⫴", val: showVert, set: (v: boolean) => { setShowVert(v); try { localStorage.setItem("novac_grid_vert", String(v)); } catch {} } },
                      ]).map(({ key, label, icon, val, set }) => (
                        <button key={key} onClick={() => set(!val)} style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "6px 9px", borderRadius: 7, cursor: "pointer",
                          border: val ? "1px solid rgba(155,185,255,0.25)" : "1px solid rgba(255,255,255,0.07)",
                          background: val ? "rgba(79,70,229,0.12)" : "rgba(255,255,255,0.03)",
                          transition: "all 0.15s",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <span style={{ fontSize: 13, color: val ? "#9BB9FF" : "rgba(255,255,255,0.3)", lineHeight: 1, width: 14, textAlign: "center" }}>{icon}</span>
                            <span style={{ fontSize: 10, color: val ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.3)", letterSpacing: "0.02em" }}>{label}</span>
                          </div>
                          {/* Toggle pill */}
                          <div style={{
                            width: 26, height: 14, borderRadius: 7, position: "relative",
                            background: val ? "rgba(99,102,241,0.8)" : "rgba(255,255,255,0.12)",
                            transition: "background 0.2s", flexShrink: 0,
                          }}>
                            <div style={{
                              position: "absolute", top: 2, left: val ? 14 : 2, width: 10, height: 10,
                              borderRadius: "50%", background: "white",
                              transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                            }}/>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Fullscreen */}
          {!dark && (
            <button
              onClick={() => { if (fullscreen && onExitFullscreen) onExitFullscreen(); setFullscreen(v => !v); }}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {fullscreen
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M9 9L4 4m0 0h5m-5 0v5M15 9l5-5m0 0h-5m5 0v5M9 15l-5 5m0 0h5m-5 0v-5M15 15l5 5m0 0h-5m5 0v-5"/>
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5M20 8V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5M20 16v4m0 0h-4m4 0l-5-5"/>
                }
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Chart */}
      <div style={{ flex: "1 1 0", minHeight: 0, position: "relative" }}>
        {chartError ? (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#ef4444", fontSize: 12, fontFamily: "monospace" }}>Chart error: {chartError}</span>
          </div>
        ) : (
          <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
        )}
        <canvas
          ref={glowCanvasRef}
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 5, mixBlendMode: "screen" }}
        />
        {chartLegend}
        {hideControls && syncCrosshairXPixel != null && (
          <div style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: syncCrosshairXPixel,
            width: 1,
            background: "rgba(255,255,255,0.25)",
            pointerEvents: "none",
            zIndex: 50,
          }} />
        )}
      </div>

      {/* Comparison mode toggle */}
      {hasComparison && (
        <div className="flex justify-center gap-2 pb-1 shrink-0">
          {(["perf", "raw"] as const).map(m => (
            <button key={m} onClick={() => setComparisonMode(m)} style={{
              fontSize: 10, fontWeight: comparisonMode === m ? 700 : 500,
              padding: "2px 10px", borderRadius: 5,
              border: comparisonMode === m ? `1px solid ${portfolioColor}66` : "1px solid transparent",
              color: comparisonMode === m ? portfolioColor : (dark ? "rgba(255,255,255,0.45)" : "var(--nv-texte-secondaire)"),
              background: comparisonMode === m ? `${portfolioColor}18` : "transparent",
              cursor: "pointer", transition: "all 0.15s",
            }}>
              {m === "perf" ? "Performance" : "Prix réel"}
            </button>
          ))}
        </div>
      )}

      {/* Period buttons */}
      {!hideControls && <div className="flex justify-center gap-4 py-2 flex-wrap shrink-0">
        {(["24h","1S","1M","3M","6M","1A","3A","Max"] as const).map(key => {
          const isActive = periodFilter === key;
          let pct: number | null = null;
          if (isActive) {
            pct = periodPerfPct;
          } else if (key === "24h") {
            pct = dailyChangePct ?? null;
          } else {
            const visibleSecs = (PERIOD_VISIBLE_SECS as Record<string, number | undefined>)[key] ?? null;
            const cutStr = visibleSecs ? new Date(Date.now() - visibleSecs * 1000).toISOString().slice(0, 10) : null;
            // Same clamp as the active button, so no period claims a return
            // reaching back before the compared asset existed.
            const floor = comparisonStart && (!cutStr || comparisonStart > cutStr) ? comparisonStart : cutStr;
            // Same series the active button reads, so a period cannot report one
            // figure when selected and another when not — Max used to swing from
            // +747% to +836% on selection alone.
            const pts = periodSource.filter(p => {
              const d = String(p.date).slice(0, 10);
              return (!floor || d >= floor) && (!comparisonEnd || d <= comparisonEnd);
            });
            if (pts.length >= 2) {
              pct = (pts[pts.length - 1].value as number - (pts[0].value as number)) / (pts[0].value as number) * 100;
            }
          }
          return (
            <div
              key={key}
              className="relative pb-1 text-center w-[48px] flex-none"
              title={intradayLocked && key === "24h"
                ? "Indisponible en comparaison entre places aux horaires différents : une seule séance quotidienne ne suffit pas à comparer."
                : undefined}
              style={{
                cursor: intradayLocked && key === "24h" ? "not-allowed" : "pointer",
                opacity: intradayLocked && key === "24h" ? 0.35 : 1,
              }}
              onClick={() => { if (!(intradayLocked && key === "24h")) handlePeriodChange(key); }}
            >
              <div className="text-xs font-semibold" style={{ color: isActive ? portfolioColor : "var(--nv-texte-secondaire)" }}>
                {key}
              </div>
              {pct !== null && (
                <div className="text-xs font-bold tabular-nums"
                  style={{ color: pct >= 0 ? "var(--nv-positif)" : "var(--nv-negatif)" }}>
                  {(() => { const s = pct >= 0 ? "+" : ""; const a = Math.abs(pct); return a >= 10000 ? `${s}${(pct/1000).toFixed(0)}k%` : a >= 1000 ? `${s}${pct.toFixed(0)}%` : `${s}${pct.toFixed(1)}%`; })()}
                </div>
              )}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-sm" style={{ background: portfolioColor }}/>
              )}
            </div>
          );
        })}
      </div>}

      {/* Interval selector — uniquement en mode ticker */}
      {!hideControls && ticker && (
        <div className="flex justify-center gap-2 pb-2 shrink-0">
          {(["1m","5m","15m","1h","1d","1W"] as const).map(iv => {
            const allowed = PERIOD_ALLOWED_INTERVALS[periodFilter] ?? [];
            const blockedByComparison = intradayLocked && ["1m","5m","15m","1h"].includes(iv);
            // Short periods only list intraday intervals; when those are locked
            // the daily bar becomes the fallback so the period stays usable.
            const dailyFallback = intradayLocked && iv === "1d";
            const isAllowed = (allowed.includes(iv) || dailyFallback) && !blockedByComparison;
            const isActive  = intervalKey === iv;
            return (
              <button
                key={iv}
                disabled={!isAllowed}
                title={blockedByComparison
                  ? "Indisponible en comparaison : les deux actifs cotent sur des places aux horaires différents. À cette finesse, la courbe comparée serait un palier plat les trois quarts du temps."
                  : undefined}
                onClick={() => { if (isAllowed) { setIntervalKey(iv); onIntervalChange?.(iv); } }}
                style={{
                  fontSize: 10, fontWeight: isActive ? 700 : 500,
                  padding: "2px 7px", borderRadius: 5,
                  border: isActive
                    ? `1px solid ${portfolioColor}66`
                    : "1px solid transparent",
                  color: !isAllowed
                    ? (dark ? "rgba(255,255,255,0.15)" : "var(--nv-texte)")
                    : isActive
                      ? portfolioColor
                      : (dark ? "rgba(255,255,255,0.45)" : "var(--nv-texte-secondaire)"),
                  background: isActive
                    ? `${portfolioColor}18`
                    : "transparent",
                  cursor: isAllowed ? "pointer" : "not-allowed",
                  transition: "all 0.15s",
                }}
              >
                {iv}
              </button>
            );
          })}
        </div>
      )}


      {/* Drawdown (Recharts) */}
      {!isIntraday && drawdownSampled.length > 0 && !hideDrawdown && (
        <div style={{ height: 100, position: "relative", flexShrink: 0 }}>
          <span style={{
            position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)",
            fontSize: 10, color: "var(--nv-texte-secondaire)", zIndex: 10, pointerEvents: "none", letterSpacing: "0.05em",
          }}>
            DRAWDOWN
          </span>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={drawdownSampled} margin={{ top: 0, right: 0, bottom: 16, left: 4 }}>
              <defs>
                <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#fca5a5" stopOpacity={0.1}/>
                  <stop offset="50%"  stopColor="#ef4444" stopOpacity={0.5}/>
                  <stop offset="100%" stopColor="#b91c1c" stopOpacity={0.9}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={dark ? "rgba(255,255,255,0.05)" : "#f1f5f9"}/>
              <XAxis dataKey="date" hide/>
              <YAxis
                orientation="right"
                dataKey={(percentMode || priceMode) ? "drawdown" : "drawdown_eur"}
                tickFormatter={v => (percentMode || priceMode)
                  ? v.toFixed(1) + "%"
                  : new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
                }
                tick={{ fontSize: 10, fill: "var(--nv-texte-secondaire)" }}
                tickLine={false}
                axisLine={false}
                width={70}
                domain={["auto", 0]}
              />
              <Tooltip content={() => null} wrapperStyle={{ display: "none" }}/>
              <ReferenceLine y={0} stroke="#e2e8f0" strokeWidth={1}/>
              <Area
                type="monotone"
                dataKey={(percentMode || priceMode) ? "drawdown" : "drawdown_eur"}
                stroke="#ef4444"
                fill="url(#ddGrad)"
                strokeWidth={1.5}
                dot={false}
                baseValue={0}
              />
              <Customized component={(props: any) => {
                try {
                  const yAxisMap = props.yAxisMap;
                  if (!yAxisMap) return null;
                  const yAxis = yAxisMap[0] ?? Object.values(yAxisMap)[0];
                  if (!yAxis || !drawdownSampled.length) return null;
                  const lastPt = drawdownSampled[drawdownSampled.length - 1];
                  const val = (percentMode || priceMode) ? (lastPt.drawdown ?? 0) : (lastPt.drawdown_eur ?? 0);
                  const y = yAxis.scale(val);
                  if (isNaN(y)) return null;
                  const x = yAxis.x;
                  const label = (percentMode || priceMode)
                    ? val.toFixed(1) + "%"
                    : new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
                  const w = label.length * 5.5 + 12;
                  return (
                    <g>
                      <rect x={x + 2} y={y - 10} width={w} height={20} rx={3} fill="#ef4444"/>
                      <text x={x + 2 + w / 2} y={y} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={10} fontWeight="600">
                        {label}
                      </text>
                    </g>
                  );
                } catch { return null; }
              }}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
