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
  dark?: boolean;
  percentMode?: boolean;
  priceMode?: boolean;
  hideDrawdown?: boolean;
  dailyChangePct?: number | null;
  openPrice?: number | null;
}

function toTs(d: string): UTCTimestamp {
  return Math.floor(new Date(d).getTime() / 1000) as UTCTimestamp;
}

// Calcul de perf partagé entre légende chart et boutons période
// → garantit que bouton et légende affichent exactement la même valeur
function computePerfForPeriod(
  period: string,
  adaptiveData: { date: string; value: number }[],
  portfolioData: DataPoint[],
  isIntradayInterval: boolean,
): { first: number; last: number } | null {
  const visibleSecs = (PERIOD_VISIBLE_SECS as Record<string, number | undefined>)[period] ?? null;

  if (isIntradayInterval && adaptiveData.length >= 2) {
    const adaptiveLast = adaptiveData[adaptiveData.length - 1].value;
    const liveLast = portfolioData.length > 0
      ? portfolioData[portfolioData.length - 1].value as number
      : adaptiveLast;

    if (visibleSecs) {
      const nowSec  = Math.floor(Date.now() / 1000);
      const lastTs  = toTs(adaptiveData[adaptiveData.length - 1].date);
      const toSec   = nowSec - lastTs > visibleSecs / 2 ? lastTs : nowSec;
      const fromSec = toSec - visibleSecs;
      const fp = adaptiveData.find(p => toTs(p.date) >= fromSec);
      // fp not found = adaptiveData doesn't cover this period → fall through to daily branch
      if (fp) return { first: fp.value, last: liveLast };
    } else {
      return { first: adaptiveData[0].value, last: liveLast };
    }
  }

  // Intervalle daily/weekly ou mode portfolio
  const cutStr = visibleSecs
    ? new Date(Date.now() - visibleSecs * 1000).toISOString().slice(0, 10)
    : null;
  const pts = cutStr
    ? portfolioData.filter(p => p.date >= cutStr)
    : portfolioData;
  if (pts.length < 2) return null;
  return { first: pts[0].value as number, last: pts[pts.length - 1].value as number };
}

function dedup<T extends { time: UTCTimestamp }>(arr: T[]): T[] {
  const seen = new Set<number>();
  const out: T[] = [];
  for (const item of arr) {
    if (!seen.has(item.time)) { seen.add(item.time); out.push(item); }
  }
  return out.sort((a, b) => a.time - b.time);
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

function agg2h(pts: OHLCPt[]): OHLCPt[] {
  return aggregateCandles(pts, d =>
    `${d.toISOString().slice(0, 10)}_${Math.floor(d.getUTCHours() / 2)}`
  );
}

function aggWeekly(pts: OHLCPt[]): OHLCPt[] {
  return aggregateCandles(pts, d => {
    const day = d.getUTCDay();
    const mon = new Date(d);
    mon.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
    return mon.toISOString().slice(0, 10);
  });
}

function aggMonthly(pts: OHLCPt[]): OHLCPt[] {
  return aggregateCandles(pts, d => d.toISOString().slice(0, 7));
}

// ─── Grid presets ─────────────────────────────────────────────────────────────
type GridPreset = "none" | "minimal" | "standard" | "solid";

const GRID_PRESETS: Record<GridPreset, { color: string; style: LineStyle; label: string }> = {
  none:     { color: "rgba(255,255,255,0)",    style: LineStyle.Dashed, label: "Aucune"   },
  minimal:  { color: "rgba(255,255,255,0.03)", style: LineStyle.Dashed, label: "Minimal"  },
  standard: { color: "rgba(255,255,255,0.06)", style: LineStyle.Dashed, label: "Standard" },
  solid:    { color: "rgba(255,255,255,0.10)", style: LineStyle.Solid,  label: "Solide"   },
};

export default function GrowthChart({
  portfolioData, benchmarkData, benchmarkName, portfolioLabel,
  drawdownData, ticker, portfolioColor = "#4f46e5",
  candleUpColor = "#26a69a", candleDownColor = "#ef5350",
  chartMode: chartModeProp, onChartModeChange, rightSlot, leftSlot,
  onExitFullscreen, onPeriodChange, onVisibleRangeChange, onCrosshairMove, onAdaptiveData,
  dark = false, percentMode = false, priceMode = false,
  hideDrawdown = false, dailyChangePct = null, openPrice = null,
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

  const adaptiveDataRef         = useRef<typeof adaptiveData>([]);
  const onVisibleRangeChangeRef = useRef(onVisibleRangeChange);
  const onCrosshairMoveRef      = useRef(onCrosshairMove);
  const onAdaptiveDataRef       = useRef(onAdaptiveData);
  useEffect(() => { adaptiveDataRef.current = adaptiveData; }, [adaptiveData]);
  useEffect(() => { onVisibleRangeChangeRef.current = onVisibleRangeChange; }, [onVisibleRangeChange]);
  useEffect(() => { onCrosshairMoveRef.current = onCrosshairMove; }, [onCrosshairMove]);
  useEffect(() => { onAdaptiveDataRef.current = onAdaptiveData; }, [onAdaptiveData]);

  // Fire onAdaptiveData whenever the price data changes (ticker mode only)
  useEffect(() => {
    if (ticker && adaptiveData.length > 0) {
      onAdaptiveDataRef.current?.(adaptiveData.map(p => ({ date: p.date, value: p.value, high: p.high, low: p.low })));
    }
  }, [adaptiveData, ticker]);
  useEffect(() => { chartModeRef.current = chartMode; }, [chartMode]);
  useEffect(() => { isMountedRef.current = true; }, []);

  // handlePeriodChange : met à jour la période et auto-switch l'intervalle si incompatible
  const handlePeriodChange = useCallback((p: typeof periodFilter) => {
    const allowed = PERIOD_ALLOWED_INTERVALS[p];
    if (!allowed.includes(intervalKey)) {
      setIntervalKey(PERIOD_DEFAULT_INTERVAL[p] as typeof intervalKey);
    }
    setPeriodFilter(p);
    onPeriodChange?.(p);
  }, [intervalKey, onPeriodChange]); // eslint-disable-line

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
        setAdaptiveData(data as typeof adaptiveData);
      })
      .catch(() => { if (!cancelled) setAdaptiveData([]); });
    return () => { cancelled = true; };
  }, [ticker, intervalKey, fetchKey]); // eslint-disable-line


  useEffect(() => {
    setTimeout(() => window.dispatchEvent(new Event("resize")), 100);
  }, [fullscreen]);


  const isIntraday = !!(ticker && adaptiveData.length > 0);
  const isIntradayInterval = ["1m", "5m", "15m", "1h"].includes(intervalKey);

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
      const bg  = dark ? "rgba(0,0,0,0)" : "#ffffff";
      const txt = dark ? "#94a3b8" : "#64748b";
      const initGrid = dark ? GRID_PRESETS[gridPreset] : { color: "#f1f5f9", style: LineStyle.Dashed };
      const initVisible = dark ? gridPreset !== "none" : true;

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
            color: dark ? "rgba(255,255,255,0.2)" : "#94a3b8",
            style: LineStyle.Solid,
            width: 1,
            labelBackgroundColor: dark ? "#334155" : "#1e293b",
          },
          horzLine: {
            color: dark ? "rgba(255,255,255,0.2)" : "#94a3b8",
            style: LineStyle.Solid,
            width: 1,
            labelBackgroundColor: dark ? "#334155" : "#1e293b",
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

      // Sync visible time range to parent (debounced 150ms)
      let rangeDebounce: ReturnType<typeof setTimeout>;
      const rangeHandler = (range: { from: number; to: number } | null) => {
        clearTimeout(rangeDebounce);
        rangeDebounce = setTimeout(() => {
          if (!range) { onVisibleRangeChangeRef.current?.(null, null); return; }
          onVisibleRangeChangeRef.current?.(range.from, range.to);
        }, 30);
      };
      chart.timeScale().subscribeVisibleTimeRangeChange(rangeHandler as any);

      const area = chart.addSeries(AreaSeries, {
        lineColor: portfolioColor,
        topColor:    portfolioColor + (ticker ? "40" : "55"),
        bottomColor: portfolioColor + "00",
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        crosshairMarkerBorderColor: "#ffffff",
        crosshairMarkerBackgroundColor: portfolioColor,
        lastValueVisible: true,
        priceLineVisible: false,
        priceFormat: {
          type: "custom",
          formatter: (v: number) => {
            try { return fmtPrice(v); } catch { return String(v); }
          },
          minMove: 0.001,
        },
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
        color: "#f59e0b",
        lineWidth: 1,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
      benchmarkSeriesRef.current = bm;

      chart.subscribeCrosshairMove(param => {
        if (!param.time || !param.point) {
          setHoverPrice(null);
          setHoverDate(null);
          setHoverOHLC(null);
          setHoverPoint(null);
          setHoverBmPrice(null);
          onCrosshairMoveRef.current?.(null);
          return;
        }
        onCrosshairMoveRef.current?.(param.time as UTCTimestamp);
        try {
          const aData  = param.seriesData.get(area) as any;
          const cData  = param.seriesData.get(candle) as any;
          const bmData = param.seriesData.get(bm) as any;
          setHoverPoint({ x: param.point.x, y: param.point.y });
          setHoverDate(new Date((param.time as number) * 1000).toISOString());
          if (cData && chartModeRef.current === "candle") {
            setHoverPrice(cData.close ?? null);
            setHoverOHLC({ open: cData.open, high: cData.high, low: cData.low, close: cData.close });
          } else if (aData) {
            setHoverPrice(aData.value ?? null);
            setHoverOHLC(null);
          }
          setHoverBmPrice(bmData?.value ?? null);
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update layout colors when dark mode changes
  useEffect(() => {
    if (!chartRef.current) return;
    const bg  = dark ? "rgba(0,0,0,0)" : "#ffffff";
    const txt = dark ? "#94a3b8" : "#64748b";
    chartRef.current.applyOptions({
      layout: { background: { type: ColorType.Solid, color: bg }, textColor: txt },
    });
  }, [dark]);

  // Update grid when preset or toggles change
  useEffect(() => {
    if (!chartRef.current) return;
    const p = dark ? GRID_PRESETS[gridPreset] : { color: "#f1f5f9", style: LineStyle.Dashed };
    const visible = dark ? gridPreset !== "none" : true;
    chartRef.current.applyOptions({
      grid: {
        vertLines: { color: p.color, style: p.style, visible: visible && showVert },
        horzLines: { color: p.color, style: p.style, visible: visible && showHorz },
      },
    });
  }, [gridPreset, showHorz, showVert, dark]);

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

  // Set series data — déclenché uniquement par les changements de données structurelles.
  // portfolioData est volontairement absent des deps : la mise à jour du prix live
  // passe par un effet séparé qui utilise series.update() au lieu de setData(),
  // évitant ainsi le reset de vue (zoom-out) que setData() provoque.
  useEffect(() => {
    const area   = areaSeriesRef.current;
    const candle = candleSeriesRef.current;
    const bm     = benchmarkSeriesRef.current;
    if (!area || !candle || !bm) return;

    try {
      if (ticker) {
        if (isIntraday) {
          const aData = dedup(adaptiveData.map(p => ({ time: toTs(p.date), value: p.value })));
          const cData = dedup(adaptiveData.map(p => ({
            time:  toTs(p.date),
            open:  p.open  ?? p.value,
            high:  p.high  ?? p.value,
            low:   p.low   ?? p.value,
            close: p.close ?? p.value,
          })));
          area.setData(aData);
          candle.setData(cData);
        } else {
          area.setData([]);
          candle.setData([]);
        }
        bm.setData([]);
        const inCandle = chartModeRef.current === "candle";
        area.applyOptions({ visible: !inCandle });
        candle.applyOptions({ visible: inCandle });
      } else {
        // Portfolio mode (no ticker)
        const cutStr = getCutoffStr(periodFilter);
        const filterDate = (arr: DataPoint[]) =>
          cutStr ? arr.filter(p => p.date >= cutStr) : arr;

        const aData = dedup(filterDate(portfolioData).map(p => ({ time: toTs(p.date), value: p.value as number })));
        const bmData = benchmarkData.length
          ? dedup(filterDate(benchmarkData).map(p => ({ time: toTs(p.date), value: p.value as number })))
          : [];

        area.setData(aData);
        candle.setData([]);
        bm.setData(bmData);
        area.applyOptions({ visible: true });
        candle.applyOptions({ visible: false });
      }
    } catch (err: any) {
      console.warn("GrowthChart setData error:", err?.message);
    }
  }, [adaptiveData, benchmarkData, isIntraday, periodFilter]); // eslint-disable-line

  // Mise à jour du prix live (toutes les ~60s pour les actions Yahoo Finance).
  // series.update() met à jour uniquement la dernière barre sans reset de vue.
  useEffect(() => {
    if (!isIntraday || portfolioData.length === 0 || adaptiveData.length === 0) return;
    const live = portfolioData[portfolioData.length - 1];
    const livePrice = live.value as number;
    const lastBar = adaptiveData[adaptiveData.length - 1];
    try {
      const lastTs = toTs(lastBar.date);
      areaSeriesRef.current?.update({ time: lastTs, value: livePrice });
      candleSeriesRef.current?.update({
        time:  lastTs,
        open:  lastBar.open  ?? lastBar.value,
        high:  Math.max(lastBar.high ?? lastBar.value, livePrice),
        low:   lastBar.low   ?? lastBar.value,
        close: livePrice,
      });
    } catch { /* ignore si série pas encore prête */ }
  }, [portfolioData]); // eslint-disable-line

  // Applique la fenêtre visible quand les données changent OU quand la période change
  useEffect(() => {
    if (!adaptiveData.length) return;
    const chart = chartRef.current;
    if (!chart) return;
    const visibleSecs = PERIOD_VISIBLE_SECS[periodFilter];
    if (visibleSecs) {
      const nowSec  = Math.floor(Date.now() / 1000);
      const lastTs  = toTs(adaptiveData[adaptiveData.length - 1].date);
      const toSec   = (nowSec - lastTs > visibleSecs / 2 ? lastTs : nowSec) as UTCTimestamp;
      const fromSec = (toSec - visibleSecs) as UTCTimestamp;
      chart.timeScale().setVisibleRange({ from: fromSec, to: toSec });
    } else {
      chart.timeScale().fitContent();
    }
  }, [adaptiveData, periodFilter]); // eslint-disable-line

  // fitContent en mode portfolio (pas de fetch async, données déjà dispo)
  useEffect(() => {
    if (!ticker) {
      chartRef.current?.timeScale().fitContent();
    }
  }, [periodFilter, ticker]); // eslint-disable-line

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
  const periodPerfData = useMemo(() => {
    if (periodFilter === "24h" && dailyChangePct !== null && portfolioData.length > 0) {
      const last  = portfolioData[portfolioData.length - 1].value as number;
      const first = last / (1 + dailyChangePct / 100);
      return { first, last };
    }
    const visibleSecs = (PERIOD_VISIBLE_SECS as Record<string, number | undefined>)[periodFilter] ?? null;
    const cutStr = visibleSecs
      ? new Date(Date.now() - visibleSecs * 1000).toISOString().slice(0, 10)
      : null;
    const pts = cutStr ? portfolioData.filter(p => p.date >= cutStr) : portfolioData;
    if (pts.length < 2) return null;
    return { first: pts[0].value as number, last: pts[pts.length - 1].value as number };
  }, [portfolioData, periodFilter, dailyChangePct]);

  const periodPerfPct  = periodPerfData ? (periodPerfData.last - periodPerfData.first) / periodPerfData.first * 100 : null;
  const hoverPerfPct   = (hoverPrice !== null && periodPerfData) ? (hoverPrice - periodPerfData.first) / periodPerfData.first * 100 : null;
  // displayPrice always shows the live price (portfolioData.last), independent of perf calculation.
  const displayPrice   = hoverPrice ?? (portfolioData.length > 0 ? portfolioData[portfolioData.length - 1].value as number : null);
  const displayPerfPct = hoverPerfPct ?? periodPerfPct;

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
      <div style={{ fontSize: 11, color: dark ? "rgba(255,255,255,0.45)" : "#94a3b8", marginBottom: 2 }}>
        {fmtHoverDate(displayDate)}
      </div>
      {hoverOHLC ? (
        <div style={{ display: "flex", gap: 8, fontSize: 11, flexWrap: "wrap" }}>
          {([
            { label: "O", val: hoverOHLC.open,  color: dark ? "#cbd5e1" : "#475569" },
            { label: "H", val: hoverOHLC.high,  color: "#22c55e" },
            { label: "L", val: hoverOHLC.low,   color: "#ef4444" },
            { label: "C", val: hoverOHLC.close, color: hoverOHLC.close >= hoverOHLC.open ? "#22c55e" : "#ef4444" },
          ] as const).map(({ label, val, color }) => (
            <span key={label}>
              <span style={{ color: dark ? "rgba(255,255,255,0.35)" : "#94a3b8" }}>{label} </span>
              <span style={{ fontWeight: 600, fontFamily: "monospace", color }}>{fmtPrice(val)}</span>
            </span>
          ))}
        </div>
      ) : displayPrice !== null ? (
        <div style={{ fontSize: 11, display: "flex", gap: 12 }}>
          <span>
            <span style={{ color: dark ? "rgba(255,255,255,0.35)" : "#94a3b8" }}>{portfolioLabel} </span>
            <span style={{ fontWeight: 600, fontFamily: "monospace", color: portfolioColor }}>{fmtPrice(displayPrice)}</span>
          </span>
          {hoverBmPrice != null && (
            <span>
              <span style={{ color: dark ? "rgba(255,255,255,0.35)" : "#94a3b8" }}>{benchmarkName} </span>
              <span style={{ fontWeight: 600, fontFamily: "monospace", color: "#f59e0b" }}>{fmtPrice(hoverBmPrice)}</span>
            </span>
          )}
          {displayPerfPct != null && (
            <span style={{ fontWeight: 700, color: displayPerfPct >= 0 ? "#22c55e" : "#ef4444" }}>
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
      <div className="flex items-center justify-between px-2 py-1 flex-shrink-0 gap-2">
        <div className="flex items-center min-w-0">{leftSlot ?? null}</div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {rightSlot}

          {/* Grid picker — dark mode only */}
          {dark && (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowGridPicker(v => !v)}
                title="Personnaliser la grille"
                style={{
                  width: 28, height: 28, borderRadius: 7, border: "none",
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
                                  strokeDasharray={p === "solid" ? "none" : "2 2"}
                                  opacity={p === "minimal" ? 0.5 : 1}
                                />
                                <line x1="14" y1="0" x2="14" y2="20"
                                  stroke={GRID_PRESETS[p].color === "rgba(255,255,255,0)" ? "none" : GRID_PRESETS[p].color}
                                  strokeWidth="1"
                                  strokeDasharray={p === "solid" ? "none" : "2 2"}
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
        {chartLegend}

      </div>

      {/* Period buttons */}
      <div className="flex justify-center gap-4 py-2 flex-wrap flex-shrink-0">
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
            const pts = cutStr ? portfolioData.filter(p => p.date >= cutStr) : portfolioData;
            if (pts.length >= 2) {
              pct = (pts[pts.length - 1].value as number - (pts[0].value as number)) / (pts[0].value as number) * 100;
            }
          }
          return (
            <div
              key={key}
              className="relative pb-1 cursor-pointer text-center min-w-[40px]"
              onClick={() => handlePeriodChange(key)}
            >
              <div className="text-xs font-semibold" style={{ color: isActive ? portfolioColor : "#94a3b8" }}>
                {key}
              </div>
              {pct !== null && (
                <div className={`text-xs font-bold tabular-nums ${pct >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  {(() => { const s = pct >= 0 ? "+" : ""; const a = Math.abs(pct); return a >= 10000 ? `${s}${(pct/1000).toFixed(0)}k%` : a >= 1000 ? `${s}${pct.toFixed(0)}%` : `${s}${pct.toFixed(1)}%`; })()}
                </div>
              )}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded" style={{ background: portfolioColor }}/>
              )}
            </div>
          );
        })}
      </div>

      {/* Interval selector — uniquement en mode ticker */}
      {ticker && (
        <div className="flex justify-center gap-2 pb-2 flex-shrink-0">
          {(["1m","5m","15m","1h","1d","1W"] as const).map(iv => {
            const allowed = PERIOD_ALLOWED_INTERVALS[periodFilter] ?? [];
            const isAllowed = allowed.includes(iv);
            const isActive  = intervalKey === iv;
            return (
              <button
                key={iv}
                disabled={!isAllowed}
                onClick={() => isAllowed && setIntervalKey(iv)}
                style={{
                  fontSize: 10, fontWeight: isActive ? 700 : 500,
                  padding: "2px 7px", borderRadius: 5,
                  border: isActive
                    ? `1px solid ${portfolioColor}66`
                    : "1px solid transparent",
                  color: !isAllowed
                    ? (dark ? "rgba(255,255,255,0.15)" : "#cbd5e1")
                    : isActive
                      ? portfolioColor
                      : (dark ? "rgba(255,255,255,0.45)" : "#94a3b8"),
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
            fontSize: 10, color: "#94a3b8", zIndex: 10, pointerEvents: "none", letterSpacing: "0.05em",
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
                tick={{ fontSize: 10, fill: "#94a3b8" }}
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
