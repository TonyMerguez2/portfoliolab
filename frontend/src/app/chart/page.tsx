"use client";
import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useApp } from "@/lib/AppContext";
import { TRENDING } from "@/lib/assets";
import {
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip, Cell,
} from "recharts";

const GrowthChart = dynamic(() => import("@/components/charts/GrowthChart"), { ssr: false });
const SubChart    = dynamic(() => import("@/components/charts/SubChart"),    { ssr: false });

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function getCutoffDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function computeRollingVol(data: {date:string;value:number}[], window=30): {date:string;vol:number}[] {
  const result: {date:string;vol:number}[] = [];
  for (let i = window; i < data.length; i++) {
    const slice = data.slice(i - window, i + 1);
    const lr: number[] = [];
    for (let j = 1; j < slice.length; j++) {
      if (slice[j-1].value > 0 && slice[j].value > 0)
        lr.push(Math.log(slice[j].value / slice[j-1].value));
    }
    if (lr.length < 2) continue;
    const mean = lr.reduce((a,b) => a+b,0) / lr.length;
    const vari = lr.reduce((a,b) => a+(b-mean)**2,0) / (lr.length-1);
    result.push({ date: data[i].date, vol: Math.sqrt(vari) * Math.sqrt(252) * 100 });
  }
  return result;
}

function computeRSI(data: {date:string;value:number}[], period=14): {date:string;rsi:number}[] {
  if (data.length < period + 1) return [];
  const result: {date:string;rsi:number}[] = [];
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = data[i].value - data[i-1].value;
    if (delta > 0) avgGain += delta / period;
    else avgLoss += Math.abs(delta) / period;
  }
  for (let i = period; i < data.length; i++) {
    if (i > period) {
      const delta = data[i].value - data[i-1].value;
      avgGain = (avgGain * (period - 1) + Math.max(0,  delta)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(0, -delta)) / period;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push({ date: data[i].date, rsi: 100 - 100 / (1 + rs) });
  }
  return result;
}

function computeDistribution(data: {date:string;value:number}[], bins=24): {label:string;count:number;ret:number}[] {
  if (data.length < 2) return [];
  const returns: number[] = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i-1].value > 0 && data[i].value > 0)
      returns.push((data[i].value - data[i-1].value) / data[i-1].value * 100);
  }
  if (returns.length === 0) return [];
  const sorted = [...returns].sort((a,b) => a-b);
  const p1 = sorted[Math.floor(sorted.length * 0.01)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const clipped = returns.filter(r => r >= p1 && r <= p99);
  const min = Math.min(...clipped), max = Math.max(...clipped);
  const binSize = (max - min) / bins || 1;
  const histo = Array.from({length: bins}, (_, i) => ({
    label: (min + (i + 0.5) * binSize).toFixed(2) + "%",
    ret: min + (i + 0.5) * binSize,
    count: 0,
  }));
  clipped.forEach(r => { const idx = Math.min(Math.floor((r - min) / binSize), bins - 1); histo[idx].count++; });
  return histo;
}

function computeRollingCorrelation(
  portfolio: {date:string;value:number}[],
  benchmark: {date:string;value:number}[],
  window=90
): {date:string;corr:number}[] {
  const bmMap = new Map(benchmark.map(p => [p.date.slice(0,10), p.value]));
  const aligned: {date:string;pRet:number;bRet:number}[] = [];
  for (let i = 1; i < portfolio.length; i++) {
    const d0 = portfolio[i-1].date.slice(0,10), d1 = portfolio[i].date.slice(0,10);
    const bPrev = bmMap.get(d0), bCurr = bmMap.get(d1);
    if (bPrev && bCurr && portfolio[i-1].value > 0 && portfolio[i].value > 0)
      aligned.push({ date: portfolio[i].date,
        pRet: (portfolio[i].value - portfolio[i-1].value) / portfolio[i-1].value,
        bRet: (bCurr - bPrev) / bPrev });
  }
  const result: {date:string;corr:number}[] = [];
  for (let i = window; i < aligned.length; i++) {
    const sl = aligned.slice(i - window, i + 1);
    const pm = sl.reduce((a,b) => a+b.pRet,0) / sl.length;
    const bm = sl.reduce((a,b) => a+b.bRet,0) / sl.length;
    let num=0, pv=0, bv=0;
    sl.forEach(s => { num+=(s.pRet-pm)*(s.bRet-bm); pv+=(s.pRet-pm)**2; bv+=(s.bRet-bm)**2; });
    const d = Math.sqrt(pv*bv);
    if (d > 0) result.push({ date: aligned[i].date, corr: Math.max(-1, Math.min(1, num/d)) });
  }
  return result;
}

function computeRollingSharpe(data: {date:string;value:number}[], window=90, rf=0.035): {date:string;sharpe:number}[] {
  const rets: {date:string;ret:number}[] = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i-1].value > 0 && data[i].value > 0)
      rets.push({ date: data[i].date, ret: (data[i].value - data[i-1].value) / data[i-1].value });
  }
  const dailyRF = rf / 252;
  const result: {date:string;sharpe:number}[] = [];
  for (let i = window; i < rets.length; i++) {
    const sl = rets.slice(i - window, i + 1);
    const exc = sl.map(r => r.ret - dailyRF);
    const mean = exc.reduce((a,b) => a+b,0) / exc.length;
    const vari = exc.reduce((a,b) => a+(b-mean)**2,0) / (exc.length-1);
    const vol = Math.sqrt(vari);
    if (vol > 0) result.push({ date: rets[i].date, sharpe: (mean / vol) * Math.sqrt(252) });
  }
  return result;
}

function generateTips(p: {
  vol1Y: number|null; drawdown: number|null; perf1Y: number|null; perf3M: number|null;
}): { icon:string; title:string; body:string; accent:string }[] {
  const tips: { icon:string; title:string; body:string; accent:string }[] = [];

  if (p.vol1Y !== null) {
    if (p.vol1Y < 15) tips.push({ icon:"🛡️", title:"Faible volatilité", accent:"#22c55e",
      body:`Volatilité annualisée de ${p.vol1Y.toFixed(0)}% — actif défensif, idéal pour une stratégie buy & hold longue durée.` });
    else if (p.vol1Y < 35) tips.push({ icon:"📊", title:"Volatilité modérée", accent:"#60a5fa",
      body:`${p.vol1Y.toFixed(0)}% de volatilité annualisée — profil équilibré, convient à la plupart des stratégies.` });
    else if (p.vol1Y < 70) tips.push({ icon:"⚡", title:"Volatilité élevée", accent:"#f97316",
      body:`${p.vol1Y.toFixed(0)}% de volatilité — mouvements brusques possibles. Dimensionnez votre position avec soin.` });
    else tips.push({ icon:"🔥", title:"Très haute volatilité", accent:"#ef4444",
      body:`${p.vol1Y.toFixed(0)}% annualisé — actif spéculatif à forte convexité. Risque de perte en capital élevé sur court terme.` });
  }

  if (p.drawdown !== null) {
    if (p.drawdown > -10) tips.push({ icon:"📈", title:"Proche des sommets", accent:"#22c55e",
      body:`Drawdown actuel de ${p.drawdown.toFixed(1)}% — l'actif se maintient en zone haute, proche de son plus haut historique.` });
    else if (p.drawdown > -25) tips.push({ icon:"🔍", title:"Correction modérée", accent:"#f59e0b",
      body:`Repli de ${Math.abs(p.drawdown).toFixed(0)}% depuis le pic. Zone potentielle d'accumulation si les fondamentaux restent solides.` });
    else if (p.drawdown > -50) tips.push({ icon:"⚠️", title:"Drawdown significatif", accent:"#f97316",
      body:`Correction de ${Math.abs(p.drawdown).toFixed(0)}% depuis le plus haut. Tendance baissière — attendez une confirmation de retournement.` });
    else tips.push({ icon:"🚨", title:"Zone de capitulation", accent:"#ef4444",
      body:`Drawdown sévère de ${Math.abs(p.drawdown).toFixed(0)}%. Stress extrême — haut risque, mais historiquement une zone d'opportunité longue durée.` });
  }

  if (p.perf1Y !== null && p.perf3M !== null) {
    if (p.perf3M > 0 && p.perf1Y > 0) tips.push({ icon:"🚀", title:"Momentum haussier", accent:"#22c55e",
      body:`+${p.perf3M.toFixed(1)}% sur 3 mois, +${p.perf1Y.toFixed(1)}% sur 1 an — momentum positif aligné court et long terme.` });
    else if (p.perf3M < 0 && p.perf1Y > 0) tips.push({ icon:"🔄", title:"Consolidation", accent:"#60a5fa",
      body:`Repli de ${Math.abs(p.perf3M).toFixed(1)}% sur 3 mois après une bonne année (+${p.perf1Y.toFixed(1)}%). Phase de digestion, potentiel de reprise.` });
    else if (p.perf3M > 0 && p.perf1Y < 0) tips.push({ icon:"🌱", title:"Rebond en cours", accent:"#f59e0b",
      body:`+${p.perf3M.toFixed(1)}% sur 3 mois après une année difficile (${p.perf1Y.toFixed(1)}%). Surveiller la confirmation du retournement.` });
    else tips.push({ icon:"📉", title:"Pression baissière", accent:"#ef4444",
      body:`Recul sur 3 mois (${p.perf3M.toFixed(1)}%) et sur 1 an (${p.perf1Y.toFixed(1)}%). Tendance baissière persistante.` });
  }

  if (p.vol1Y !== null && p.perf1Y !== null && p.vol1Y > 0) {
    const sharpe = p.perf1Y / p.vol1Y;
    if (sharpe > 1) tips.push({ icon:"💎", title:"Ratio rendement/risque excellent", accent:"#22c55e",
      body:`+${p.perf1Y.toFixed(1)}% pour ${p.vol1Y.toFixed(0)}% de volatilité — ratio Sharpe estimé à ${sharpe.toFixed(2)}. L'actif compense très bien le risque.` });
    else if (sharpe > 0.3) tips.push({ icon:"⚖️", title:"Ratio rendement/risque correct", accent:"#60a5fa",
      body:`+${p.perf1Y.toFixed(1)}% de performance pour ${p.vol1Y.toFixed(0)}% de volatilité. Ratio risque/rendement raisonnable.` });
    else if (sharpe < 0) tips.push({ icon:"❌", title:"Ratio rendement/risque défavorable", accent:"#ef4444",
      body:`Rendement de ${p.perf1Y.toFixed(1)}% pour ${p.vol1Y.toFixed(0)}% de volatilité — le risque pris n'est pas compensé actuellement.` });
  }

  return tips;
}

type SubTab = "drawdown" | "volatility" | "rsi" | "distribution" | "correlation" | "sharpe";

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "drawdown",     label: "Drawdown" },
  { key: "volatility",   label: "Vol 30j" },
  { key: "rsi",          label: "RSI 14j" },
  { key: "distribution", label: "Distribution" },
  { key: "correlation",  label: "Corrélation" },
  { key: "sharpe",       label: "Sharpe 90j" },
];

const SUB_PERIOD_DAYS: Record<string, number | null> = {
  "1H": 91, "24h": 91, "1S": 14, "1M": 31, "3M": 91, "6M": 183, "1A": 365, "3A": 1095, "Max": null,
};

const typeColor = (type?: string) => ({
  bg: type==="CRYPTOCURRENCY"?"rgba(245,158,11,0.16)":type==="ETF"?"rgba(139,92,246,0.16)":type==="INDEX"?"rgba(34,211,238,0.14)":"rgba(59,130,246,0.16)",
  border: type==="CRYPTOCURRENCY"?"rgba(245,158,11,0.35)":type==="ETF"?"rgba(139,92,246,0.35)":type==="INDEX"?"rgba(34,211,238,0.32)":"rgba(59,130,246,0.35)",
  text: type==="CRYPTOCURRENCY"?"#fcd34d":type==="ETF"?"#c4b5fd":type==="INDEX"?"#67e8f9":"#93c5fd",
});

function ChartContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { activePortfolio } = useApp();

  const ticker = searchParams.get("ticker");
  const isPortfolio = searchParams.get("portfolio") === "true";

  const [rawPortfolioGrowth, setRawPortfolioGrowth] = useState<{date:string;value:number}[]>([]);
  const [rawBenchmarkGrowth, setRawBenchmarkGrowth] = useState<{date:string;value:number}[]>([]);
  const [drawdownData, setDrawdownData] = useState<{date:string;drawdown:number;drawdown_eur:number}[]>([]);
  const [currentPrice, setCurrentPrice] = useState<{price:number;change:number}|null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [investedAmount, setInvestedAmount] = useState(10000);
  const [wsLive, setWsLive] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [subTab, setSubTab] = useState<SubTab>("drawdown");
  const [activePeriod, setActivePeriod] = useState("Max");
  const [visibleRange, setVisibleRange] = useState<{from:string;to:string}|null>(null);

  const assetInfo = ticker ? TRENDING.find(a => a.ticker === ticker) : null;
  const isCrypto = !!(ticker && (assetInfo?.type === "CRYPTOCURRENCY" || ticker.endsWith("-USD")));
  const label = isPortfolio
    ? (activePortfolio?.name || "Portefeuille")
    : (assetInfo?.name || ticker || "Actif");
  const color = isPortfolio ? (activePortfolio?.color || "#5B8DEF") : "#5B8DEF";
  const tc = typeColor(assetInfo?.type);
  const shortLabel = ticker
    ? ticker.replace(/-USD$/,"").replace(/\.PA$/,"").replace(/\^/,"").slice(0,4)
    : isPortfolio && activePortfolio ? activePortfolio.name.slice(0,3).toUpperCase() : "PTF";

  // Data fetch
  useEffect(() => {
    if (ticker) {
      setLoading(true);
      setError(null);
      setCurrentPrice(null);
      (async () => {
        try {
          const [pricesRes, backtestRes] = await Promise.all([
            fetch(`${API_URL}/api/v1/prices?tickers=${encodeURIComponent(ticker)}`),
            fetch(`${API_URL}/api/v1/backtest`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ assets: [{ ticker, weight: 100 }], period: "max", benchmark: "^GSPC", risk_free_rate: 0.035 }),
            }),
          ]);
          const [pricesData, backtestData] = await Promise.all([pricesRes.json(), backtestRes.json()]);
          const currentPriceVal = (Array.isArray(pricesData) && pricesData.length > 0) ? pricesData[0].price as number : null;
          const currentChange   = (Array.isArray(pricesData) && pricesData.length > 0) ? pricesData[0].change as number : 0;
          if (currentPriceVal) setCurrentPrice({ price: currentPriceVal, change: currentChange });
          setRawPortfolioGrowth(backtestData.portfolio_growth || []);
          setRawBenchmarkGrowth(backtestData.benchmark_growth || []);
          setDrawdownData(backtestData.drawdown || []);
        } catch {
          setError("Impossible de charger les données de cet actif.");
        } finally {
          setLoading(false);
        }
      })();
    } else if (isPortfolio && activePortfolio) {
      setLoading(true);
      setError(null);
      fetch(`${API_URL}/api/v1/backtest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assets: activePortfolio.assets, period: "max", benchmark: "^GSPC", risk_free_rate: 0.035 }),
      })
        .then(r => r.json())
        .then(d => {
          setRawPortfolioGrowth(d.portfolio_growth || []);
          setRawBenchmarkGrowth(d.benchmark_growth || []);
          setDrawdownData(d.drawdown || []);
        })
        .catch(() => setError("Impossible de charger les données du portefeuille."))
        .finally(() => setLoading(false));
    } else if (isPortfolio && !activePortfolio) {
      setError("Aucun portefeuille actif. Sélectionnez-en un depuis le menu.");
      setLoading(false);
    } else {
      setError("Paramètres invalides.");
      setLoading(false);
    }
  }, [ticker, isPortfolio, activePortfolio?.id]);

  // WebSocket Binance pour crypto
  useEffect(() => {
    if (!ticker || !isCrypto) return;
    const symbol = ticker.replace(/-USD$/, "USDT").toLowerCase();
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol}@ticker`);
    ws.onopen = () => setWsLive(true);
    ws.onclose = () => setWsLive(false);
    ws.onerror = () => { setWsLive(false); ws.close(); };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const price = parseFloat(data.c);
        const changePct = parseFloat(data.P);
        if (price > 0) setCurrentPrice({ price, change: changePct });
      } catch {}
    };
    return () => { if (ws.readyState === WebSocket.OPEN) ws.close(); };
  }, [ticker, isCrypto]);

  // Refresh prix toutes les 60s pour actions/ETFs
  useEffect(() => {
    if (!ticker || isCrypto) return;
    const interval = setInterval(() => {
      fetch(`${API_URL}/api/v1/prices?tickers=${encodeURIComponent(ticker)}`)
        .then(r => r.json())
        .then((d: any[]) => { if (Array.isArray(d) && d.length > 0) setCurrentPrice({ price: d[0].price, change: d[0].change }); })
        .catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, [ticker, isCrypto]);

  const portfolioData = useMemo(() => {
    if (!ticker || !rawPortfolioGrowth.length) return rawPortfolioGrowth;
    const anchor = currentPrice?.price;
    if (!anchor) return rawPortfolioGrowth;
    const lastVal = rawPortfolioGrowth[rawPortfolioGrowth.length - 1].value;
    const mapped = rawPortfolioGrowth.map(p => ({
      date: p.date,
      value: Math.round(anchor * (p.value / lastVal) * 10000) / 10000,
    }));
    const today = new Date().toISOString().slice(0, 10);
    if (mapped[mapped.length - 1].date.slice(0, 10) < today) {
      mapped.push({ date: new Date().toISOString(), value: anchor });
    } else {
      mapped[mapped.length - 1] = { ...mapped[mapped.length - 1], value: anchor };
    }
    return mapped;
  }, [rawPortfolioGrowth, currentPrice?.price, ticker]);

  const benchmarkData = useMemo(() => {
    if (!ticker || !rawBenchmarkGrowth.length || !portfolioData.length) return rawBenchmarkGrowth;
    const firstPrice = portfolioData[0]?.value;
    const firstBmVal = rawBenchmarkGrowth[0]?.value;
    if (!firstPrice || !firstBmVal) return rawBenchmarkGrowth;
    return rawBenchmarkGrowth.map(p => ({
      date: p.date,
      value: Math.round(p.value / firstBmVal * firstPrice * 10000) / 10000,
    }));
  }, [rawBenchmarkGrowth, portfolioData, ticker]);

  const scaleFactor = isPortfolio ? investedAmount / 10000 : 1;
  const scaledPortfolioData = scaleFactor !== 1
    ? portfolioData.map(p => ({ ...p, value: Math.round(p.value * scaleFactor * 100) / 100 }))
    : portfolioData;
  const scaledBenchmarkData = scaleFactor !== 1
    ? benchmarkData.map(p => ({ ...p, value: Math.round(p.value * scaleFactor * 100) / 100 }))
    : benchmarkData;
  const scaledDrawdownData = scaleFactor !== 1
    ? drawdownData.map(p => ({ ...p, drawdown_eur: Math.round(p.drawdown_eur * scaleFactor * 100) / 100 }))
    : drawdownData;

  // Sub-chart data filtered by visible range (synced from main chart scroll)
  const subChartFilter = useMemo((): { from: string | null; to: string | null } => {
    if (visibleRange) {
      const diffMs = new Date(visibleRange.to).getTime() - new Date(visibleRange.from).getTime();
      if (diffMs >= 2 * 86400 * 1000) return visibleRange;
      return { from: getCutoffDate(91), to: null };
    }
    const days = SUB_PERIOD_DAYS[activePeriod] ?? null;
    return { from: days != null ? getCutoffDate(days) : null, to: null };
  }, [visibleRange, activePeriod]);

  const subPortfolioData = useMemo(() => {
    const { from, to } = subChartFilter;
    let pts = scaledPortfolioData;
    if (from) pts = pts.filter(p => p.date >= from);
    if (to)   pts = pts.filter(p => p.date <= to);
    return pts;
  }, [scaledPortfolioData, subChartFilter]);

  // Distribution stays filtered (histogram bins depend on the visible period)
  const distData = useMemo(() => computeDistribution(subPortfolioData), [subPortfolioData]);

  // All other indicators use full data — LC SubChart handles visible range via setVisibleRange
  const fullVol    = useMemo(() => computeRollingVol(scaledPortfolioData), [scaledPortfolioData]);
  const fullRsi    = useMemo(() => computeRSI(scaledPortfolioData), [scaledPortfolioData]);
  const fullCorr   = useMemo(() => computeRollingCorrelation(scaledPortfolioData, scaledBenchmarkData), [scaledPortfolioData, scaledBenchmarkData]);
  const fullSharpe = useMemo(() => computeRollingSharpe(scaledPortfolioData), [scaledPortfolioData]);

  const subData = useMemo((): { date: string; value: number }[] => {
    if (subTab === "drawdown")     return scaledDrawdownData.map(p => ({ date: p.date, value: p.drawdown }));
    if (subTab === "volatility")   return fullVol.map(p => ({ date: p.date, value: p.vol }));
    if (subTab === "rsi")          return fullRsi.map(p => ({ date: p.date, value: p.rsi }));
    if (subTab === "correlation")  return fullCorr.map(p => ({ date: p.date, value: p.corr }));
    if (subTab === "sharpe")       return fullSharpe.map(p => ({ date: p.date, value: p.sharpe }));
    return [];
  }, [subTab, scaledDrawdownData, fullVol, fullRsi, fullCorr, fullSharpe]);

  const { vol1Y, drawdownVal, perf1Y, perf3M } = useMemo(() => {
    const pts = scaledPortfolioData;
    let vol1Y: number|null = null;
    const cut1Y = getCutoffDate(365);
    const slice = pts.filter(p => p.date >= cut1Y);
    if (slice.length >= 20) {
      const lr = slice.slice(1).map((p,i) =>
        slice[i].value > 0 && p.value > 0 ? Math.log(p.value / slice[i].value) : null
      ).filter((v): v is number => v !== null);
      if (lr.length >= 2) {
        const mean = lr.reduce((a,b) => a+b,0) / lr.length;
        const vari = lr.reduce((a,b) => a+(b-mean)**2,0) / (lr.length-1);
        vol1Y = Math.sqrt(vari) * Math.sqrt(252) * 100;
      }
    }
    const drawdownVal = scaledDrawdownData.length > 0
      ? scaledDrawdownData[scaledDrawdownData.length - 1].drawdown : null;
    const pts1Y = pts.filter(p => p.date >= cut1Y);
    const perf1Y = pts1Y.length >= 2
      ? (pts1Y[pts1Y.length-1].value - pts1Y[0].value) / pts1Y[0].value * 100 : null;
    const pts3M = pts.filter(p => p.date >= getCutoffDate(91));
    const perf3M = pts3M.length >= 2
      ? (pts3M[pts3M.length-1].value - pts3M[0].value) / pts3M[0].value * 100 : null;
    return { vol1Y, drawdownVal, perf1Y, perf3M };
  }, [scaledPortfolioData, scaledDrawdownData]);

  const tips = useMemo(
    () => generateTips({ vol1Y, drawdown: drawdownVal, perf1Y, perf3M }),
    [vol1Y, drawdownVal, perf1Y, perf3M]
  );

  return (
    <div style={{ height:"100vh", background:"#041124", color:"#F8F9FC", fontFamily:"-apple-system,BlinkMacSystemFont,sans-serif", display:"flex", flexDirection:"column", position:"relative", overflow:"hidden" }}>
      <div style={{ position:"fixed", inset:0, zIndex:0, pointerEvents:"none", background:"radial-gradient(ellipse 55% 55% at 50% 50%, #0B1C3F 0%, #041124 100%)" }}/>
      <div style={{ position:"relative", zIndex:1, display:"flex", flexDirection:"column", flex:1, minHeight:0 }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 24px", borderBottom:"1px solid rgba(255,255,255,0.06)", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:"16px" }}>
            <button onClick={() => router.back()}
              style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"8px", color:"rgba(255,255,255,0.6)", fontSize:"11px", padding:"6px 12px", cursor:"pointer", letterSpacing:"0.04em", flexShrink:0 }}>
              ← Retour
            </button>

            {ticker && (
              <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                <div style={{ width:"36px", height:"36px", borderRadius:"9px", display:"flex", alignItems:"center", justifyContent:"center", background:tc.bg, border:`1px solid ${tc.border}`, flexShrink:0 }}>
                  <span style={{ fontSize:"9px", fontWeight:800, color:tc.text, letterSpacing:"-0.02em" }}>{shortLabel}</span>
                </div>
                <div>
                  <div style={{ fontSize:"13px", fontWeight:600, color:"#F8F9FC", lineHeight:1.2 }}>{assetInfo?.name || ticker}</div>
                  <div style={{ display:"flex", alignItems:"center", gap:"8px", marginTop:"2px" }}>
                    {currentPrice ? (
                      <>
                        <span style={{ fontSize:"13px", fontWeight:700, color:"#F8F9FC", letterSpacing:"-0.01em" }}>
                          {currentPrice.price < 1
                            ? currentPrice.price.toLocaleString("en-US", {minimumFractionDigits:4, maximumFractionDigits:4})
                            : currentPrice.price.toLocaleString("en-US", {minimumFractionDigits:2, maximumFractionDigits:2})}
                        </span>
                        <span style={{ fontSize:"11px", fontWeight:600, color: currentPrice.change >= 0 ? "#22c55e" : "#ef4444" }}>
                          {currentPrice.change >= 0 ? "▲" : "▼"} {Math.abs(currentPrice.change).toFixed(2)}%
                        </span>
                        <span style={{ fontSize:"9px", color:"rgba(255,255,255,0.22)", letterSpacing:"0.06em" }}>{ticker} · {assetInfo?.type || "ACTIF"}</span>
                        {isCrypto && wsLive && (
                          <span style={{ display:"flex", alignItems:"center", gap:"4px", fontSize:"9px", color:"#22c55e", letterSpacing:"0.06em" }}>
                            <span style={{ width:"6px", height:"6px", borderRadius:"50%", background:"#22c55e", display:"inline-block", animation:"pulse 1.5s infinite" }}/>
                            LIVE
                          </span>
                        )}
                        {!isCrypto && (() => {
                          const now = new Date();
                          const parts = new Intl.DateTimeFormat("en-US", {
                            timeZone: "America/New_York", weekday: "short",
                            hour: "numeric", minute: "2-digit", hour12: false,
                          }).formatToParts(now);
                          const wd = parts.find(p => p.type === "weekday")?.value ?? "";
                          const h  = parseInt(parts.find(p => p.type === "hour")?.value ?? "0");
                          const m  = parseInt(parts.find(p => p.type === "minute")?.value ?? "0");
                          const isOpen = wd !== "Sat" && wd !== "Sun" && (h * 60 + m) >= 570 && (h * 60 + m) < 960;
                          return (
                            <span style={{ display:"flex", alignItems:"center", gap:"4px", fontSize:"9px", letterSpacing:"0.06em", color: isOpen ? "#22c55e" : "rgba(255,255,255,0.28)" }}>
                              <span style={{ width:"5px", height:"5px", borderRadius:"50%", background: isOpen ? "#22c55e" : "rgba(255,255,255,0.28)", display:"inline-block" }}/>
                              {isOpen ? "Ouvert" : "Fermé"}
                            </span>
                          );
                        })()}
                      </>
                    ) : (
                      <span style={{ fontSize:"10px", color:"rgba(255,255,255,0.28)", letterSpacing:"0.06em" }}>{ticker} · {assetInfo?.type || "ACTIF"}</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {isPortfolio && activePortfolio && (
              <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                <div style={{ width:"36px", height:"36px", borderRadius:"9px", display:"flex", alignItems:"center", justifyContent:"center", background:`${activePortfolio.color || "#5B8DEF"}22`, border:`1px solid ${activePortfolio.color || "#5B8DEF"}44`, flexShrink:0 }}>
                  <span style={{ fontSize:"9px", fontWeight:800, color:activePortfolio.color || "#5B8DEF", letterSpacing:"-0.02em" }}>{shortLabel}</span>
                </div>
                <div>
                  <div style={{ fontSize:"13px", fontWeight:600, color:"#F8F9FC", lineHeight:1.2 }}>{activePortfolio.name}</div>
                  <div style={{ display:"flex", alignItems:"center", gap:"8px", marginTop:"2px", flexWrap:"wrap" }}>
                    <span style={{ fontSize:"10px", color:"rgba(255,255,255,0.28)" }}>{activePortfolio.assets.length} actifs · vs S&P 500</span>
                    <span style={{ color:"rgba(255,255,255,0.15)", fontSize:"10px" }}>·</span>
                    <span style={{ fontSize:"10px", color:"rgba(255,255,255,0.4)" }}>Investi</span>
                    <input
                      type="number" min={1} value={investedAmount}
                      onChange={e => setInvestedAmount(Math.max(1, Number(e.target.value)))}
                      onClick={e => (e.target as HTMLInputElement).select()}
                      style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.14)", borderRadius:"6px", color:"#F8F9FC", fontSize:"11px", padding:"2px 7px", width:"76px", textAlign:"right", outline:"none" }}
                    />
                    <span style={{ fontSize:"10px", color:"rgba(255,255,255,0.4)" }}>€</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div style={{ color:"rgba(255,255,255,0.1)", fontSize:"11px", letterSpacing:"0.22em" }}>NOVAC</div>
        </div>

        {/* Content */}
        <div style={{ flex:1, minHeight:0, padding:"16px 20px 20px", display:"flex", flexDirection:"column", overflowY:"auto", overflowX:"hidden" }}>
          {loading && (
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div style={{ color:"rgba(255,255,255,0.25)", fontSize:"12px", letterSpacing:"0.1em" }}>Chargement···</div>
            </div>
          )}
          {!loading && error && (
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:"16px" }}>
              <div style={{ color:"rgba(255,255,255,0.3)", fontSize:"12px", textAlign:"center", maxWidth:"300px", lineHeight:1.6 }}>{error}</div>
              <button onClick={() => router.back()}
                style={{ background:"rgba(91,141,239,0.12)", border:"1px solid rgba(91,141,239,0.25)", borderRadius:"8px", color:"#9BB9FF", fontSize:"11px", padding:"8px 18px", cursor:"pointer", letterSpacing:"0.05em" }}>
                ← Retour
              </button>
            </div>
          )}
          {!loading && !error && portfolioData.length > 0 && (
            <>
              {/* Main chart */}
              <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:"16px", padding:"14px 18px 10px", flex:"1 1 380px", minHeight:380, display:"flex", flexDirection:"column" }}>
                <GrowthChart
                  portfolioData={scaledPortfolioData}
                  benchmarkData={scaledBenchmarkData}
                  benchmarkName="S&P 500"
                  portfolioLabel={label}
                  drawdownData={scaledDrawdownData.length > 0 ? scaledDrawdownData : undefined}
                  ticker={ticker ?? undefined}
                  portfolioColor={color}
                  dark={true}
                  priceMode={!!ticker}
                  hideDrawdown={true}
                  onPeriodChange={setActivePeriod}
                  onVisibleRangeChange={(from, to) => setVisibleRange(from && to ? { from, to } : null)}
                />
              </div>

              {/* Sub-chart panel */}
              {!subOpen ? (
                <button
                  onClick={() => setSubOpen(true)}
                  style={{ marginTop:10, width:"100%", background:"transparent", border:"1px dashed rgba(255,255,255,0.09)", borderRadius:12, padding:"7px 0", cursor:"pointer", color:"rgba(255,255,255,0.2)", fontSize:11, letterSpacing:"0.08em", display:"flex", alignItems:"center", justifyContent:"center", gap:6, flexShrink:0 }}
                >
                  <span style={{ fontSize:16, lineHeight:1 }}>+</span> Ajouter un panneau
                </button>
              ) : (
                <div style={{ marginTop:10, background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:16, padding:"12px 16px 10px", flexShrink:0 }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                    <div style={{ display:"flex", gap:4, overflowX:"auto", scrollbarWidth:"none" }}>
                      {SUB_TABS.map(({key, label: lbl}) => (
                        <button key={key} onClick={() => setSubTab(key)} style={{ whiteSpace:"nowrap", background: subTab===key ? "rgba(155,185,255,0.12)" : "transparent", border:`1px solid ${subTab===key ? "rgba(155,185,255,0.25)" : "transparent"}`, borderRadius:6, padding:"3px 10px", cursor:"pointer", fontSize:10, letterSpacing:"0.05em", color: subTab===key ? "#9BB9FF" : "rgba(255,255,255,0.3)" }}>
                          {lbl}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setSubOpen(false)} style={{ background:"transparent", border:"none", cursor:"pointer", color:"rgba(255,255,255,0.3)", fontSize:18, padding:"0 4px", lineHeight:1 }}>×</button>
                  </div>

                  {subTab === "distribution" ? (
                    distData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={130}>
                        <BarChart data={distData} margin={{ top:2, right:2, bottom:2, left:0 }} barCategoryGap="4%">
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false}/>
                          <XAxis dataKey="label" hide/>
                          <YAxis tick={{ fill:"rgba(255,255,255,0.25)", fontSize:9 }} tickLine={false} axisLine={false} width={20}/>
                          <Tooltip
                            contentStyle={{ background:"#0d1f35", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, color:"rgba(255,255,255,0.7)", fontSize:10 }}
                            cursor={{ fill:"rgba(255,255,255,0.04)" }}
                            formatter={(v: number) => [v+" j", "Fréquence"]}
                            labelFormatter={(l: string) => `Rendement: ${l}`}
                          />
                          <Bar dataKey="count" radius={[2,2,0,0]}>
                            {distData.map((entry, i) => (
                              <Cell key={i} fill={entry.ret >= 0 ? "#22c55e" : "#ef4444"} fillOpacity={0.65}/>
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div style={{ height:130, display:"flex", alignItems:"center", justifyContent:"center", color:"rgba(255,255,255,0.2)", fontSize:11 }}>Données insuffisantes</div>
                    )
                  ) : subData.length > 0 ? (
                    <SubChart
                      type={subTab as import("@/components/charts/SubChart").SubChartType}
                      data={subData}
                      visibleRange={visibleRange}
                      height={130}
                    />
                  ) : (
                    <div style={{ height:130, display:"flex", alignItems:"center", justifyContent:"center", color:"rgba(255,255,255,0.2)", fontSize:11 }}>
                      {subTab === "correlation" || subTab === "sharpe" ? "Données insuffisantes (min 90 jours)" : "Données insuffisantes"}
                    </div>
                  )}
                </div>
              )}

              {/* AI tips */}
              {tips.length > 0 && (
                <div style={{ marginTop:18, flexShrink:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                    <span style={{ fontSize:10, color:"rgba(255,255,255,0.25)", letterSpacing:"0.12em", fontWeight:600 }}>ANALYSE</span>
                    <span style={{ fontSize:9, background:"rgba(139,92,246,0.18)", border:"1px solid rgba(139,92,246,0.3)", borderRadius:4, padding:"1px 6px", color:"#c4b5fd", fontWeight:600 }}>IA bêta</span>
                  </div>
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                    {tips.map(tip => (
                      <div key={tip.title} style={{
                        flex:"1 1 200px",
                        background:`linear-gradient(rgba(4,17,36,0.92),rgba(4,17,36,0.92)) padding-box, linear-gradient(135deg,${tip.accent}66,${tip.accent}18) border-box`,
                        border:"1px solid transparent",
                        borderRadius:14,
                        padding:"13px 14px",
                        display:"flex", alignItems:"flex-start", gap:12,
                      }}>
                        <div style={{ width:38, height:38, borderRadius:"50%", flexShrink:0, background:"rgba(255,255,255,0.07)", border:`1px solid ${tip.accent}44`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <span style={{ fontSize:17, lineHeight:1 }}>{tip.icon}</span>
                        </div>
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.88)", marginBottom:4 }}>{tip.title}</div>
                          <p style={{ fontSize:10, color:"rgba(255,255,255,0.38)", lineHeight:1.55, margin:0 }}>{tip.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {!loading && !error && portfolioData.length === 0 && (
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div style={{ color:"rgba(255,255,255,0.2)", fontSize:"12px" }}>Aucune donnée disponible</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChartPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight:"100vh", background:"#041124", display:"flex", alignItems:"center", justifyContent:"center", color:"rgba(255,255,255,0.25)", fontSize:"12px", letterSpacing:"0.1em" }}>
        Chargement···
      </div>
    }>
      <ChartContent />
    </Suspense>
  );
}
