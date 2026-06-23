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

const PERIOD_CONFIG: Record<string, { apiPeriod: string; interval: string }> = {
  "1H":  { apiPeriod: "7d",  interval: "1m"  },
  "24h": { apiPeriod: "5d",  interval: "5m"  },
  "1S":  { apiPeriod: "7d",  interval: "5m"  },
  "1M":  { apiPeriod: "60d", interval: "15m" },
  "3M":  { apiPeriod: "max", interval: "1h"  },
  "6M":  { apiPeriod: "max", interval: "1d"  },
  "1A":  { apiPeriod: "max", interval: "1d"  },
  "3A":  { apiPeriod: "max", interval: "1d"  },
  "Max": { apiPeriod: "max", interval: "1d"  },
};

const PERIOD_CONFIG_CANDLE: Record<string, { apiPeriod: string; interval: string }> = {
  "1H":  { apiPeriod: "7d",  interval: "1m"  },
  "24h": { apiPeriod: "5d",  interval: "5m"  },
  "1S":  { apiPeriod: "1mo", interval: "30m" },
  "1M":  { apiPeriod: "60d", interval: "1h"  },
  "3M":  { apiPeriod: "max", interval: "1d"  },
  "6M":  { apiPeriod: "max", interval: "1d"  },
  "1A":  { apiPeriod: "max", interval: "1d"  },
  "3A":  { apiPeriod: "max", interval: "1d"  },
  "Max": { apiPeriod: "max", interval: "1d"  },
};

// Durée visible initialement (en secondes) pour chaque période.
// setVisibleRange cadre la fenêtre ; les données hors fenêtre sont scrollables.
const PERIOD_VISIBLE_SECS: Record<string, number> = {
  "1H":  3600,
  "24h": 86400,
  "1S":  7   * 86400,
  "1M":  30  * 86400,
  "3M":  91  * 86400,
  "6M":  183 * 86400,
  "1A":  365 * 86400,
  "3A":  1095 * 86400,
};

interface DataPoint { date: string; [key: string]: number | string; }

// ─── Market phase zone primitive ─────────────────────────────────────────────
type ZoneType = "bull" | "bear" | "consolidation";
interface Zone { id: string; startTime: UTCTimestamp; endTime: UTCTimestamp; type: ZoneType; }

const ZONE_COLORS: Record<ZoneType, string> = {
  bull:          "rgba(34,197,94,0.13)",
  bear:          "rgba(239,68,68,0.13)",
  consolidation: "rgba(251,146,60,0.13)",
};
const ZONE_BORDER: Record<ZoneType, string> = {
  bull:          "rgba(34,197,94,0.35)",
  bear:          "rgba(239,68,68,0.35)",
  consolidation: "rgba(251,146,60,0.35)",
};

class ZonesRenderer {
  constructor(private _zones: Zone[], private _chart: IChartApi) {}
  draw() {}
  drawBackground(target: any) {
    target.useMediaCoordinateSpace((scope: any) => {
      const { context: ctx, mediaSize } = scope;
      const ts = this._chart.timeScale();
      for (const z of this._zones) {
        const x1 = ts.timeToCoordinate(z.startTime as any);
        const x2 = ts.timeToCoordinate(z.endTime   as any);
        if (x1 === null || x2 === null) continue;
        const left  = Math.min(x1, x2);
        const width = Math.abs(x2 - x1);
        ctx.fillStyle = ZONE_COLORS[z.type];
        ctx.fillRect(left, 0, width, mediaSize.height);
        // left border line
        ctx.fillStyle = ZONE_BORDER[z.type];
        ctx.fillRect(left, 0, 2, mediaSize.height);
        ctx.fillRect(left + width - 2, 0, 2, mediaSize.height);
      }
    });
  }
}

class ZonesPrimitiveView {
  constructor(private _zones: Zone[], private _chart: IChartApi) {}
  zOrder() { return "bottom" as const; }
  renderer() { return new ZonesRenderer(this._zones, this._chart); }
}

class ZonesPrimitive {
  private _zones: Zone[] = [];
  constructor(private _chart: IChartApi) {}
  updateZones(zones: Zone[]) { this._zones = [...zones]; }
  updateAllViews() {}
  paneViews() { return [new ZonesPrimitiveView(this._zones, this._chart)]; }
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
  dark?: boolean;
  percentMode?: boolean;
  priceMode?: boolean;
  hideDrawdown?: boolean;
}

function toTs(d: string): UTCTimestamp {
  return Math.floor(new Date(d).getTime() / 1000) as UTCTimestamp;
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
  const days: Record<string, number> = { "1H":1, "24h":1, "1S":14, "1M":31, "3M":91, "6M":183, "1A":365, "3A":1095 };
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

export default function GrowthChart({
  portfolioData, benchmarkData, benchmarkName, portfolioLabel,
  drawdownData, ticker, portfolioColor = "#4f46e5",
  candleUpColor = "#26a69a", candleDownColor = "#ef5350",
  chartMode: chartModeProp, onChartModeChange, rightSlot, leftSlot,
  onExitFullscreen, onPeriodChange, onVisibleRangeChange, onCrosshairMove, onAdaptiveData,
  dark = false, percentMode = false, priceMode = false,
  hideDrawdown = false,
}: Props) {

  const [periodFilter, setPeriodFilter] = useState<"1H"|"24h"|"1S"|"1M"|"3M"|"6M"|"1A"|"3A"|"Max">("Max");
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
  const chartModeForFetch = useRef(chartMode);
  const prevChartModeRef  = useRef(chartMode);
  const isMountedRef      = useRef(false);
  const [fetchKey, setFetchKey] = useState(0);

  // Zone annotation state
  const [zones, setZones] = useState<Zone[]>([]);
  const [activeZoneTool, setActiveZoneTool] = useState<ZoneType | null>(null);
  const [drawingStep, setDrawingStep] = useState<0 | 1>(0); // 0=idle/waiting start, 1=waiting end
  const pendingZoneTypeRef = useRef<ZoneType | null>(null);
  const zoneStartRef       = useRef<UTCTimestamp | null>(null);
  const zonePrimitiveRef   = useRef<ZonesPrimitive | null>(null);

  // Lazy loading refs
  const oldestLoadedDateRef = useRef<string | null>(null);
  const currentIntervalRef  = useRef<string>("1d");
  const isLoadingMoreRef    = useRef(false);
  const hasMoreHistoryRef   = useRef(true);
  const isAutoModeRef       = useRef(true);
  const isPrependRef            = useRef(false);
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
  useEffect(() => {
    chartModeForFetch.current = chartMode;
    if (ticker && isMountedRef.current) setFetchKey(k => k + 1);
  }, [chartMode, ticker]); // eslint-disable-line
  useEffect(() => { isMountedRef.current = true; }, []);

  // Lazy load: fetch chunk d'historique avant la barre la plus ancienne chargée.
  // Quand l'interval intraday est épuisé par la limite Yahoo, bascule sur "1d" pour continuer.
  const loadMore = useCallback(async () => {
    if (
      isLoadingMoreRef.current ||
      !hasMoreHistoryRef.current ||
      isAutoModeRef.current
    ) return;
    const oldest = oldestLoadedDateRef.current;
    if (!ticker || !oldest) return;

    isLoadingMoreRef.current = true;
    const iv = currentIntervalRef.current;
    const endDate = new Date(oldest);
    endDate.setDate(endDate.getDate() - 1);

    const daysMap: Record<string, number> = {
      "1m": 2, "5m": 6, "15m": 15, "30m": 25, "1h": 70, "1d": 450,
    };
    const days = daysMap[iv] ?? 450;
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);

    const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const start = startDate.toISOString().slice(0, 10);
    const end   = endDate.toISOString().slice(0, 10);
    try {
      const res  = await fetch(`${API_URL}/api/v1/intraday?ticker=${encodeURIComponent(ticker)}&start=${start}&end=${end}&interval=${iv}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        if (iv !== "1d") {
          // Historique intraday épuisé (limite Yahoo ~60j/5m, ~730j/1h).
          // On bascule sur daily pour continuer à charger l'historique complet.
          currentIntervalRef.current = "1d";
          // isLoadingMoreRef = false dans finally → le prochain scroll relance loadMore en 1d
        } else {
          hasMoreHistoryRef.current = false;
        }
      } else {
        oldestLoadedDateRef.current = data[0].date;
        isPrependRef.current = true;
        setAdaptiveData(prev => [...(data as typeof adaptiveData), ...prev]);
      }
    } catch {
      hasMoreHistoryRef.current = false;
    } finally {
      isLoadingMoreRef.current = false;
    }
  }, [ticker]); // eslint-disable-line

  // Fetch intraday data
  useEffect(() => {
    if (!ticker) { setAdaptiveData([]); return; }

    // Vider immédiatement pour éviter d'afficher les données stale de la période précédente.
    setAdaptiveData([]);
    // Reset lazy loading state pour chaque nouveau fetch
    isLoadingMoreRef.current  = false;
    hasMoreHistoryRef.current = true;
    isPrependRef.current      = false;
    oldestLoadedDateRef.current = null;

    const isCandleMode = chartModeForFetch.current === "candle";

    const config = isCandleMode
      ? PERIOD_CONFIG_CANDLE[periodFilter]
      : PERIOD_CONFIG[periodFilter];
    if (!config) { setAdaptiveData([]); return; }
    const interval = config.interval;

    // 1H : pas de lazy (7j de 1m = tout ce que Yahoo a).
    // apiPeriod=max : tout l'historique disponible déjà chargé (1d ou 1h), lazy inutile.
    // Autres périodes (24h/1S/1M) : lazy actif, fallback 1d si intraday épuisé.
    isAutoModeRef.current = (periodFilter === "1H") || (config.apiPeriod === "max");
    currentIntervalRef.current = interval;

    const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    let cancelled = false;
    fetch(`${API_URL}/api/v1/intraday?ticker=${encodeURIComponent(ticker)}&period=${config.apiPeriod}&interval=${interval}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled || !Array.isArray(data)) return;
        let pts = data as typeof adaptiveData;

        // Pas de downsample en courbe : lightweight-charts gère 10k+ pts nativement.
        // Le downsample détruirait la résolution dans la fenêtre visible (ex: 3 pts/h en 1H 1m).
        // Candle: agrégation OHLCV selon la période
        if (isCandleMode) {
          if (periodFilter === "1M")  pts = agg2h(pts);
          if (periodFilter === "3A")  pts = aggWeekly(pts);
          if (periodFilter === "Max") pts = aggWeekly(pts);
        }
        // Mémoriser la date la plus ancienne pour le lazy loading
        oldestLoadedDateRef.current = pts[0]?.date ?? null;
        setAdaptiveData(pts);

        // Pour 1H/24h/1S/1M en mode LIGNE : historique daily chargé en arrière-plan.
        // En candle, on ne mixe pas les résolutions (bougies 1m + bougies 1j = incohérent visuellement).
        // En candle, le lazy loading avec fallback 1d gère l'historique progressivement.
        if (!isCandleMode && periodFilter !== "1H" && config.apiPeriod !== "max" && interval !== "1d" && pts.length > 0) {
          const cutDate = pts[0].date.slice(0, 10);
          fetch(`${API_URL}/api/v1/intraday?ticker=${encodeURIComponent(ticker)}&period=max&interval=1d`)
            .then(r => r.json())
            .then((daily: typeof pts) => {
              if (cancelled || !Array.isArray(daily)) return;
              // Seulement les barres daily AVANT le début des données intraday
              const before = daily.filter((p: typeof pts[0]) => p.date.slice(0, 10) < cutDate);
              hasMoreHistoryRef.current = false; // historique complet chargé, lazy inutile
              if (before.length > 0) {
                oldestLoadedDateRef.current = before[0].date;
                isPrependRef.current = true;
                setAdaptiveData(prev => [...before, ...prev]);
              }
            })
            .catch(() => { /* lazy loading reste actif comme fallback */ });
        }
      })
      .catch(() => { if (!cancelled) setAdaptiveData([]); });
    return () => { cancelled = true; };
  }, [ticker, periodFilter, fetchKey]); // eslint-disable-line

  // Lazy load: déclencher quand l'utilisateur scrolle vers le bord gauche du chart
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !ticker) return;
    const handler = (range: { from: number; to: number } | null) => {
      if (range && range.from < 50) loadMore();
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
    return () => chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler);
  }, [ticker, loadMore]);

  useEffect(() => {
    setTimeout(() => window.dispatchEvent(new Event("resize")), 100);
  }, [fullscreen]);


  const isIntraday = !!(ticker && adaptiveData.length > 0);

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
      const bg   = dark ? "rgba(0,0,0,0)" : "#ffffff";
      const grid = dark ? "rgba(255,255,255,0.05)" : "#f1f5f9";
      const txt  = dark ? "#94a3b8" : "#64748b";

      const chart = createChart(containerRef.current, {
        autoSize: true,
        layout: {
          attributionLogo: false,
          background: { type: ColorType.Solid, color: bg },
          textColor: txt,
          fontSize: 11,
        },
        grid: {
          vertLines: { color: grid, style: LineStyle.Dashed },
          horzLines: { color: grid, style: LineStyle.Dashed },
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
        topColor:    portfolioColor + "55",
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

      // Zone primitive (draws colored background bands)
      const zp = new ZonesPrimitive(chart);
      area.attachPrimitive(zp);
      zonePrimitiveRef.current = zp;

      // Zone creation: 2-click workflow
      chart.subscribeClick(param => {
        if (!pendingZoneTypeRef.current || !param.time) return;
        if (zoneStartRef.current === null) {
          // First click → record start
          zoneStartRef.current = param.time as UTCTimestamp;
          setDrawingStep(1);
        } else {
          // Second click → create zone
          const t1 = zoneStartRef.current;
          const t2 = param.time as UTCTimestamp;
          const startTime = Math.min(t1, t2) as UTCTimestamp;
          const endTime   = Math.max(t1, t2) as UTCTimestamp;
          const type = pendingZoneTypeRef.current;
          pendingZoneTypeRef.current = null;
          zoneStartRef.current = null;
          setActiveZoneTool(null);
          setDrawingStep(0);
          setZones(prev => [...prev, { id: `z-${Date.now()}`, startTime, endTime, type }]);
        }
      });

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
        zonePrimitiveRef.current = null;
      };
    } catch (err: any) {
      setChartError(err?.message ?? "Chart init failed");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update theme
  useEffect(() => {
    if (!chartRef.current) return;
    const bg   = dark ? "rgba(0,0,0,0)" : "#ffffff";
    const grid = dark ? "rgba(255,255,255,0.05)" : "#f1f5f9";
    const txt  = dark ? "#94a3b8" : "#64748b";
    chartRef.current.applyOptions({
      layout: { background: { type: ColorType.Solid, color: bg }, textColor: txt },
      grid: { vertLines: { color: grid, style: LineStyle.Dashed }, horzLines: { color: grid, style: LineStyle.Dashed } },
    });
  }, [dark]);

  // Update area series color (from logo color extraction)
  useEffect(() => {
    if (!areaSeriesRef.current) return;
    areaSeriesRef.current.applyOptions({
      lineColor: portfolioColor,
      topColor:    portfolioColor + "55",
      bottomColor: portfolioColor + "00",
      crosshairMarkerBackgroundColor: portfolioColor,
    });
  }, [portfolioColor]);

  // Sync zones → primitive + force chart redraw
  useEffect(() => {
    if (!zonePrimitiveRef.current) return;
    zonePrimitiveRef.current.updateZones(zones);
    areaSeriesRef.current?.applyOptions({});
  }, [zones]);


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

  // Après chargement initial, cadrer la vue sur la bonne fenêtre temporelle.
  // En candle auto, on utilise setVisibleRange pour n'afficher que la période choisie
  // même si les données téléchargées couvrent une plage plus large (buffer scroll).
  useEffect(() => {
    if (adaptiveData.length > 0 && !isPrependRef.current) {
      const chart = chartRef.current;
      if (chart) {
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
      }
    }
    isPrependRef.current = false;
  }, [adaptiveData, periodFilter]); // eslint-disable-line

  // fitContent en mode portfolio (pas de fetch async, données déjà dispo)
  useEffect(() => {
    if (!ticker) {
      chartRef.current?.timeScale().fitContent();
    }
  }, [periodFilter, ticker]); // eslint-disable-line

  // Transition symétrique : quand le MODE change, masquer la série destination
  // (qui a les données stale de l'ancien mode), garder la source visible.
  // Le data effect fait le vrai switch atomique une fois les nouvelles données prêtes.
  useEffect(() => {
    const modeChanged = prevChartModeRef.current !== chartMode;
    prevChartModeRef.current = chartMode;
    if (!modeChanged || !ticker) return;
    if (chartMode === "candle") {
      // line→candle : masquer candle stale, area reste visible pendant le fetch
      candleSeriesRef.current?.applyOptions({ visible: false });
    } else {
      // candle→line : masquer area stale (données coarses candle), candle reste visible
      areaSeriesRef.current?.applyOptions({ visible: false });
    }
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
  const periodPerfData = useMemo(() => {
    // Intraday (minute/hour bars): use adaptiveData for BOTH first and last to avoid scale mismatch.
    if (isIntraday && adaptiveData.length >= 2) {
      const lastPrice = adaptiveData[adaptiveData.length - 1].value;
      const visibleSecs = PERIOD_VISIBLE_SECS[periodFilter];
      let firstPrice = adaptiveData[0].value;
      if (visibleSecs) {
        const nowSec = Math.floor(Date.now() / 1000);
        const lastTs = toTs(adaptiveData[adaptiveData.length - 1].date);
        const effectiveToSec = nowSec - lastTs > visibleSecs / 2 ? lastTs : nowSec;
        const fromTs = effectiveToSec - visibleSecs;
        const fp = adaptiveData.find(p => toTs(p.date) >= fromTs);
        firstPrice = fp?.value ?? lastPrice;
      }
      return { first: firstPrice, last: lastPrice };
    }
    // Non-intraday (daily bars): use portfolioData filtered by period — same logic as period buttons.
    const cutStr = getCutoffStr(periodFilter);
    const pts = cutStr ? portfolioData.filter(p => p.date >= cutStr) : portfolioData;
    if (pts.length < 2) return null;
    return { first: pts[0].value as number, last: pts[pts.length - 1].value as number };
  }, [isIntraday, adaptiveData, portfolioData, periodFilter]); // eslint-disable-line

  const periodPerfPct  = periodPerfData ? (periodPerfData.last - periodPerfData.first) / periodPerfData.first * 100 : null;
  const hoverPerfPct   = (hoverPrice !== null && periodPerfData) ? (hoverPrice - periodPerfData.first) / periodPerfData.first * 100 : null;
  // displayPrice always shows the live price (portfolioData.last), independent of perf calculation.
  const displayPrice   = hoverPrice ?? (portfolioData.length > 0 ? portfolioData[portfolioData.length - 1].value as number : null);
  const displayPerfPct = hoverPerfPct ?? periodPerfPct;

  const fmtHoverDate = (iso: string | null): string | null => {
    if (!iso) return null;
    try {
      const d = new Date(iso);
      if (["1H","24h"].includes(periodFilter)) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      if (["1S","1M"].includes(periodFilter)) return d.toLocaleDateString("fr-FR", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" });
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
      style={fullscreen ? { background: dark ? "#041124" : "white" } : { minHeight: 0, overflow: "hidden" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 flex-shrink-0 gap-2">
        <div className="flex items-center min-w-0">{leftSlot ?? null}</div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {rightSlot}
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
          <div ref={containerRef} style={{ width: "100%", height: "100%", cursor: activeZoneTool ? "crosshair" : "default" }} />
        )}
        {chartLegend}

        {/* Zone tool hint — shown during drawing */}
        {activeZoneTool && (
          <div style={{
            position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
            zIndex: 30, pointerEvents: "none",
            background: "rgba(8,18,38,0.88)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8, padding: "4px 12px",
            fontSize: 11, color: "rgba(255,255,255,0.6)", backdropFilter: "blur(12px)",
          }}>
            {drawingStep === 0 ? "Clic pour définir le début de la zone" : "Clic pour définir la fin de la zone"}
          </div>
        )}

        {/* Zone toolbar */}
        <div style={{
          position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
          zIndex: 30, display: "flex", flexDirection: "column", gap: 4,
        }}>
          {([
            { type: "bull"          as ZoneType, color: "#22c55e", label: "Haussier" },
            { type: "consolidation" as ZoneType, color: "#fb923c", label: "Consolidation" },
            { type: "bear"          as ZoneType, color: "#ef4444", label: "Baissier" },
          ]).map(({ type, color, label }) => {
            const active = activeZoneTool === type;
            return (
              <button
                key={type}
                title={label}
                onClick={() => {
                  if (active) {
                    pendingZoneTypeRef.current = null;
                    zoneStartRef.current = null;
                    setActiveZoneTool(null);
                    setDrawingStep(0);
                  } else {
                    pendingZoneTypeRef.current = type;
                    zoneStartRef.current = null;
                    setActiveZoneTool(type);
                    setDrawingStep(0);
                  }
                }}
                style={{
                  width: 22, height: 22, borderRadius: 6,
                  border: `2px solid ${active ? color : color + "55"}`,
                  background: active ? color + "33" : color + "18",
                  cursor: "pointer", transition: "all 0.15s",
                  boxShadow: active ? `0 0 8px ${color}66` : "none",
                }}
              />
            );
          })}

          {/* Separator + clear */}
          {zones.length > 0 && (
            <>
              <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "2px 0" }} />
              <button
                onClick={() => setZones([])}
                title="Effacer toutes les zones"
                style={{
                  width: 22, height: 22, borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.05)",
                  cursor: "pointer", fontSize: 11, color: "rgba(255,255,255,0.4)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                ✕
              </button>
            </>
          )}
        </div>

        {/* NOVAC logo — bottom-right watermark */}
        <img
          src={dark ? "/logob.png" : "/logoa.png"}
          alt="NOVAC"
          style={{
            position: "absolute", bottom: 36, right: 72,
            height: 24, width: "auto",
            opacity: 0.35, zIndex: 10,
            pointerEvents: "none", userSelect: "none",
          }}
        />
      </div>

      {/* Period buttons */}
      <div className="flex justify-center gap-4 py-2 flex-wrap flex-shrink-0">
        {(["1H","24h","1S","1M","3M","6M","1A","3A","Max"] as const).map(key => {
          let first: number | undefined, last: number | undefined;
          if (key === "1H" || key === "24h") {
            // portfolioData a seulement des barres journalières.
            // Quand le marché est fermé, live ≈ last close → comparaison = 0%.
            // On compare plutôt les deux dernières clôtures différentes.
            const all = portfolioData;
            if (all.length >= 3) {
              const v0 = all[all.length - 1].value as number; // live (ou last close)
              const v1 = all[all.length - 2].value as number; // last close
              const v2 = all[all.length - 3].value as number; // prev close
              // Si live ≈ last close (marché fermé), afficher last close vs prev close.
              if (Math.abs(v0 - v1) / (v1 || 1) < 0.0002) { first = v2; last = v1; }
              else { first = v1; last = v0; }
            } else if (all.length === 2) {
              first = all[0].value as number; last = all[1].value as number;
            }
          } else {
            const cutStr = getCutoffStr(key);
            const pts = cutStr ? portfolioData.filter(p => p.date >= cutStr) : portfolioData;
            first = pts[0]?.value as number | undefined;
            last  = pts[pts.length - 1]?.value as number | undefined;
          }
          const pct = (first && last) ? (last - first) / first * 100 : null;
          const isActive = periodFilter === key;
          return (
            <div
              key={key}
              className="relative pb-1 cursor-pointer text-center min-w-[40px]"
              onClick={() => { setPeriodFilter(key); onPeriodChange?.(key); }}
            >
              <div className="text-xs font-semibold" style={{ color: isActive ? (dark ? "#9BB9FF" : "#4f46e5") : "#94a3b8" }}>
                {key}
              </div>
              {pct !== null && (
                <div className={`text-xs font-bold tabular-nums ${pct >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  {(() => { const s = pct >= 0 ? "+" : ""; const a = Math.abs(pct); return a >= 10000 ? `${s}${(pct/1000).toFixed(0)}k%` : a >= 1000 ? `${s}${pct.toFixed(0)}%` : `${s}${pct.toFixed(1)}%`; })()}
                </div>
              )}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded" style={{ background: dark ? "#9BB9FF" : "#4f46e5" }}/>
              )}
            </div>
          );
        })}
      </div>


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
