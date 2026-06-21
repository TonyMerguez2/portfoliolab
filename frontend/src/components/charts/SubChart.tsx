"use client";
import { useRef, useEffect, useMemo } from "react";
import {
  createChart, IChartApi,
  AreaSeries, LineSeries,
  ColorType, CrosshairMode, LineStyle,
  UTCTimestamp,
} from "lightweight-charts";

export type SubChartType = "drawdown" | "volatility" | "rsi" | "correlation" | "sharpe";

interface Props {
  type: SubChartType;
  data: { date: string; value: number }[];
  visibleRange?: { from: string; to: string } | null;
  height?: number;
}

interface SeriesCfg {
  isArea?: boolean;
  color: string;
  areaTop?: string;
  areaBottom?: string;
  formatter: (v: number) => string;
  priceLines?: { price: number; color: string; title: string }[];
}

const CONFIGS: Record<SubChartType, SeriesCfg> = {
  drawdown: {
    isArea: true,
    color: "#ef4444",
    areaTop: "rgba(239,68,68,0.35)",
    areaBottom: "rgba(185,28,28,0.6)",
    formatter: v => v.toFixed(1) + "%",
  },
  volatility: {
    color: "#f59e0b",
    formatter: v => v.toFixed(0) + "%",
  },
  rsi: {
    color: "#60a5fa",
    formatter: v => v.toFixed(0),
    priceLines: [
      { price: 70, color: "#ef4444", title: "OB" },
      { price: 50, color: "rgba(255,255,255,0.12)", title: "" },
      { price: 30, color: "#22c55e", title: "OS" },
    ],
  },
  correlation: {
    color: "#c084fc",
    formatter: v => v.toFixed(2),
    priceLines: [
      { price:  0.5, color: "rgba(255,255,255,0.08)", title: "" },
      { price:  0,   color: "rgba(255,255,255,0.2)",  title: "" },
      { price: -0.5, color: "rgba(255,255,255,0.08)", title: "" },
    ],
  },
  sharpe: {
    color: "#f59e0b",
    formatter: v => v.toFixed(2),
    priceLines: [
      { price: 1, color: "#22c55e",               title: "1.0" },
      { price: 0, color: "rgba(255,255,255,0.2)", title: "" },
    ],
  },
};

function toTs(dateStr: string): UTCTimestamp {
  return Math.floor(new Date(dateStr.slice(0, 10)).getTime() / 1000) as UTCTimestamp;
}

export default function SubChart({ type, data, visibleRange, height = 130 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const seriesRef    = useRef<any>(null);

  // Create chart once — never recreate
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        attributionLogo: false,
        background: { type: ColorType.Solid, color: "rgba(0,0,0,0)" },
        textColor: "rgba(255,255,255,0.25)",
        fontSize: 9,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.05)", style: LineStyle.Dashed },
        horzLines: { color: "rgba(255,255,255,0.05)", style: LineStyle.Dashed },
      },
      crosshair: { mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(255,255,255,0.15)", style: LineStyle.Solid, width: 1, labelBackgroundColor: "#334155" },
        horzLine: { color: "rgba(255,255,255,0.15)", style: LineStyle.Solid, width: 1, labelBackgroundColor: "#334155" },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderVisible: false, visible: false },
      handleScroll: { mouseWheel: false, pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false },
      handleScale:  { mouseWheel: false, pinch: false, axisPressedMouseMove: false },
    });
    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Swap series when type changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (seriesRef.current) {
      try { chart.removeSeries(seriesRef.current); } catch {}
      seriesRef.current = null;
    }
    const cfg = CONFIGS[type];
    let s: any;
    if (cfg.isArea) {
      s = chart.addSeries(AreaSeries, {
        lineColor: cfg.color,
        topColor: cfg.areaTop,
        bottomColor: cfg.areaBottom,
        lineWidth: 2,
        lastValueVisible: true, priceLineVisible: false,
        priceFormat: { type: "custom", formatter: cfg.formatter, minMove: 0.01 },
      });
    } else {
      s = chart.addSeries(LineSeries, {
        color: cfg.color,
        lineWidth: 2,
        lastValueVisible: true, priceLineVisible: false,
        priceFormat: { type: "custom", formatter: cfg.formatter, minMove: 0.01 },
      });
    }
    cfg.priceLines?.forEach(pl =>
      s.createPriceLine({ price: pl.price, color: pl.color, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: pl.title !== "", title: pl.title })
    );
    seriesRef.current = s;
  }, [type]);

  // Push data
  const lcData = useMemo(() =>
    [...data]
      .map(p => ({ time: toTs(p.date), value: p.value }))
      .filter((p, i, arr) => i === 0 || p.time !== arr[i-1].time)
      .sort((a, b) => a.time - b.time),
    [data]
  );

  useEffect(() => {
    if (!seriesRef.current || !lcData.length) return;
    seriesRef.current.setData(lcData);
    if (!visibleRange) chartRef.current?.timeScale().fitContent();
  }, [lcData]); // eslint-disable-line

  // Sync visible range from main chart
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !visibleRange || !lcData.length) return;
    const from = toTs(visibleRange.from);
    const to   = toTs(visibleRange.to);
    // Only apply if range falls within our data
    const dataFrom = lcData[0].time;
    const dataTo   = lcData[lcData.length - 1].time;
    if (from <= dataTo && to >= dataFrom) {
      try { chart.timeScale().setVisibleRange({ from, to }); } catch {}
    }
  }, [visibleRange, lcData]);

  return <div ref={containerRef} style={{ width: "100%", height }} />;
}
