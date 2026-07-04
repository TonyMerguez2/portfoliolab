"use client";
import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useApp } from "@/lib/AppContext";
import { TRENDING, BRAND_COLORS } from "@/lib/assets";
import TileCard from "@/components/TileCard";
import {
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip, Cell,
} from "recharts";

const GrowthChart = dynamic(() => import("@/components/charts/GrowthChart"), { ssr: false });
const SubChart    = dynamic(() => import("@/components/charts/SubChart"),    { ssr: false });
import AssetLogo from "@/components/AssetLogo";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function getCutoffDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function computeDrawdownFromPrices(data: {date:string;value:number}[]): {date:string;value:number}[] {
  let peak = -Infinity;
  return data.map(p => {
    if (p.value > peak) peak = p.value;
    const dd = peak > 0 ? ((p.value - peak) / peak) * 100 : 0;
    return { date: p.date, value: dd };
  });
}

function toDailyClose(data: {date:string;value:number;high?:number;low?:number}[]): {date:string;value:number;high?:number;low?:number}[] {
  const byDate = new Map<string, {date:string;value:number;high:number;low:number}>();
  for (const p of data) {
    const d = p.date.slice(0, 10);
    if (byDate.has(d)) {
      const ex = byDate.get(d)!;
      byDate.set(d, { date: d, value: p.value, high: Math.max(ex.high, p.high ?? p.value), low: Math.min(ex.low, p.low ?? p.value) });
    } else {
      byDate.set(d, { date: d, value: p.value, high: p.high ?? p.value, low: p.low ?? p.value });
    }
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
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

type TipIconKey = "shield"|"trending-up"|"zap"|"flame"|"mountain"|"alert"|"refresh"|"seedling"|"diamond"|"scale"|"x-circle"|"chart";
type TipSignal = "positive"|"negative"|"warning"|"neutral";
type Tip = { iconKey: TipIconKey; title: string; body: string; accent: string; signal: TipSignal; metric: string };

const TIP_ICONS: Record<TipIconKey, JSX.Element> = {
  "shield":      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  "trending-up": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  "zap":         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  "flame":       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0011 17c1.38 0 2.5-1.12 2.5-2.5 0-1.38-.5-2-1-3 1 .5 1.5 2 1.5 3 0 2.21-1.79 4-4 4s-4-1.79-4-4c0-2.5 2.5-5 2.5-5s-.5 1-.5 2.5z"/><path d="M12 2C6.5 6 4 10 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8c0-4-2-8-8-12z"/></svg>,
  "mountain":    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 17 9 5 15 11 19 8 21 17"/></svg>,
  "alert":       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  "refresh":     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>,
  "seedling":    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 000 20"/><path d="M12 12c2-2 5-3 8-3"/><path d="M12 17c-2-2-5-3-8-3"/></svg>,
  "diamond":     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/><line x1="12" y1="2" x2="12" y2="22"/><path d="M2 8.5h20M2 15.5h20"/></svg>,
  "scale":       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="3" x2="12" y2="21"/><path d="M3 6l9-3 9 3"/><path d="M3 12l9 3 9-3"/><path d="M3 18l9 3 9-3"/></svg>,
  "x-circle":    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>,
  "chart":       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
};

function generateTips(p: {
  vol1Y: number|null; drawdown: number|null; perf1Y: number|null; perf3M: number|null;
}): Tip[] {
  const tips: Tip[] = [];

  if (p.vol1Y !== null) {
    if (p.vol1Y < 15) tips.push({ iconKey:"shield", title:"Faible volatilité", accent:"#22c55e", signal:"positive",
      metric:`${p.vol1Y.toFixed(0)}% vol`,
      body:`Volatilité annualisée de ${p.vol1Y.toFixed(0)}% — actif défensif, idéal pour une stratégie buy & hold longue durée.` });
    else if (p.vol1Y < 35) tips.push({ iconKey:"chart", title:"Volatilité modérée", accent:"#60a5fa", signal:"neutral",
      metric:`${p.vol1Y.toFixed(0)}% vol`,
      body:`${p.vol1Y.toFixed(0)}% de volatilité annualisée — profil équilibré, convient à la plupart des stratégies.` });
    else if (p.vol1Y < 70) tips.push({ iconKey:"zap", title:"Volatilité élevée", accent:"#f97316", signal:"warning",
      metric:`${p.vol1Y.toFixed(0)}% vol`,
      body:`${p.vol1Y.toFixed(0)}% de volatilité — mouvements brusques possibles. Dimensionnez votre position avec soin.` });
    else tips.push({ iconKey:"flame", title:"Très haute volatilité", accent:"#ef4444", signal:"negative",
      metric:`${p.vol1Y.toFixed(0)}% vol`,
      body:`${p.vol1Y.toFixed(0)}% annualisé — actif spéculatif à forte convexité. Risque de perte en capital élevé sur court terme.` });
  }

  if (p.drawdown !== null) {
    if (p.drawdown > -10) tips.push({ iconKey:"mountain", title:"Proche des sommets", accent:"#22c55e", signal:"positive",
      metric:`${p.drawdown.toFixed(1)}% DD`,
      body:`Drawdown actuel de ${p.drawdown.toFixed(1)}% — l'actif se maintient en zone haute, proche de son plus haut historique.` });
    else if (p.drawdown > -25) tips.push({ iconKey:"refresh", title:"Correction modérée", accent:"#f59e0b", signal:"warning",
      metric:`${Math.abs(p.drawdown).toFixed(0)}% DD`,
      body:`Repli de ${Math.abs(p.drawdown).toFixed(0)}% depuis le pic. Zone potentielle d'accumulation si les fondamentaux restent solides.` });
    else if (p.drawdown > -50) tips.push({ iconKey:"alert", title:"Drawdown significatif", accent:"#f97316", signal:"warning",
      metric:`${Math.abs(p.drawdown).toFixed(0)}% DD`,
      body:`Correction de ${Math.abs(p.drawdown).toFixed(0)}% depuis le plus haut. Tendance baissière — attendez une confirmation de retournement.` });
    else tips.push({ iconKey:"x-circle", title:"Zone de capitulation", accent:"#ef4444", signal:"negative",
      metric:`${Math.abs(p.drawdown).toFixed(0)}% DD`,
      body:`Drawdown sévère de ${Math.abs(p.drawdown).toFixed(0)}%. Stress extrême — haut risque, mais historiquement une zone d'opportunité longue durée.` });
  }

  if (p.perf1Y !== null && p.perf3M !== null) {
    if (p.perf3M > 0 && p.perf1Y > 0) tips.push({ iconKey:"trending-up", title:"Momentum haussier", accent:"#22c55e", signal:"positive",
      metric:`+${p.perf1Y.toFixed(0)}% 1A`,
      body:`+${p.perf3M.toFixed(1)}% sur 3 mois, +${p.perf1Y.toFixed(1)}% sur 1 an — momentum positif aligné court et long terme.` });
    else if (p.perf3M < 0 && p.perf1Y > 0) tips.push({ iconKey:"refresh", title:"Consolidation", accent:"#60a5fa", signal:"neutral",
      metric:`+${p.perf1Y.toFixed(0)}% 1A`,
      body:`Repli de ${Math.abs(p.perf3M).toFixed(1)}% sur 3 mois après une bonne année (+${p.perf1Y.toFixed(1)}%). Phase de digestion, potentiel de reprise.` });
    else if (p.perf3M > 0 && p.perf1Y < 0) tips.push({ iconKey:"seedling", title:"Rebond en cours", accent:"#f59e0b", signal:"warning",
      metric:`${p.perf1Y.toFixed(0)}% 1A`,
      body:`+${p.perf3M.toFixed(1)}% sur 3 mois après une année difficile (${p.perf1Y.toFixed(1)}%). Surveiller la confirmation du retournement.` });
    else tips.push({ iconKey:"alert", title:"Pression baissière", accent:"#ef4444", signal:"negative",
      metric:`${p.perf1Y.toFixed(0)}% 1A`,
      body:`Recul sur 3 mois (${p.perf3M.toFixed(1)}%) et sur 1 an (${p.perf1Y.toFixed(1)}%). Tendance baissière persistante.` });
  }

  if (p.vol1Y !== null && p.perf1Y !== null && p.vol1Y > 0) {
    const sharpe = p.perf1Y / p.vol1Y;
    if (sharpe > 1) tips.push({ iconKey:"diamond", title:"Ratio rendement/risque excellent", accent:"#22c55e", signal:"positive",
      metric:`Sharpe ${sharpe.toFixed(2)}`,
      body:`+${p.perf1Y.toFixed(1)}% pour ${p.vol1Y.toFixed(0)}% de volatilité — ratio Sharpe estimé à ${sharpe.toFixed(2)}. L'actif compense très bien le risque.` });
    else if (sharpe > 0.3) tips.push({ iconKey:"scale", title:"Ratio rendement/risque correct", accent:"#60a5fa", signal:"neutral",
      metric:`Sharpe ${sharpe.toFixed(2)}`,
      body:`+${p.perf1Y.toFixed(1)}% de performance pour ${p.vol1Y.toFixed(0)}% de volatilité. Ratio risque/rendement raisonnable.` });
    else if (sharpe < 0) tips.push({ iconKey:"x-circle", title:"Ratio rendement/risque défavorable", accent:"#ef4444", signal:"negative",
      metric:`Sharpe ${sharpe.toFixed(2)}`,
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

// ── Colour presets ──────────────────────────────────────────────────────────
const COLOR_PRESETS = [
  { label:"Default", line:"#5B8DEF", up:"#26a69a", down:"#ef5350" },
  { label:"Neon",    line:"#00d4ff", up:"#00e676", down:"#ff1744" },
  { label:"Violet",  line:"#a855f7", up:"#c084fc", down:"#f43f5e" },
  { label:"Amber",   line:"#f59e0b", up:"#fbbf24", down:"#dc2626" },
];

function SwatchInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
      <span style={{ fontSize:9, letterSpacing:"0.08em", color:"rgba(255,255,255,0.35)", width:52, flexShrink:0 }}>{label}</span>
      <span style={{
        width:22, height:22, borderRadius:5, border:"1px solid rgba(255,255,255,0.15)",
        background:value, display:"block", flexShrink:0, position:"relative", overflow:"hidden",
      }}>
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          style={{ opacity:0, position:"absolute", inset:0, width:"100%", height:"100%", cursor:"pointer", border:"none", padding:0 }} />
      </span>
      <span style={{ fontSize:10, color:"rgba(255,255,255,0.45)", fontFamily:"monospace", letterSpacing:"0.04em" }}>{value.toUpperCase()}</span>
    </label>
  );
}

interface CustomPanelProps {
  lineColor: string; candleUp: string; candleDown: string; defaultLineColor: string;
  onLineColor: (v: string | null) => void; onCandleUp: (v: string) => void; onCandleDown: (v: string) => void;
}
function CustomPanel({ lineColor, candleUp, candleDown, defaultLineColor, onLineColor, onCandleUp, onCandleDown }: CustomPanelProps) {
  return (
    <div style={{
      position:"absolute", top:50, right:10, zIndex:30,
      background:"rgba(4,12,28,0.97)", border:"1px solid rgba(155,185,255,0.16)",
      borderRadius:12, padding:"14px 16px", width:230,
      boxShadow:"0 8px 32px rgba(0,0,0,0.7)",
      backdropFilter:"blur(12px)",
    }}>
      <div style={{ fontSize:9, letterSpacing:"0.12em", color:"rgba(255,255,255,0.25)", marginBottom:12 }}>COULEURS DU GRAPHIQUE</div>

      <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:14 }}>
        <SwatchInput label="COURBE" value={lineColor} onChange={v => onLineColor(v)} />
        <SwatchInput label="HAUSSE" value={candleUp}  onChange={onCandleUp} />
        <SwatchInput label="BAISSE" value={candleDown} onChange={onCandleDown} />
      </div>

      <div style={{ borderTop:"1px solid rgba(255,255,255,0.06)", paddingTop:12 }}>
        <div style={{ fontSize:9, letterSpacing:"0.08em", color:"rgba(255,255,255,0.22)", marginBottom:8 }}>PRESETS</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" as const }}>
          {COLOR_PRESETS.map(p => (
            <button key={p.label}
              onClick={() => { onLineColor(p.line); onCandleUp(p.up); onCandleDown(p.down); }}
              title={p.label}
              style={{
                width:20, height:20, borderRadius:4, cursor:"pointer",
                background:`linear-gradient(135deg, ${p.line} 50%, ${p.up} 50%)`,
                border:"1px solid rgba(255,255,255,0.12)", padding:0,
                transition:"transform 0.1s",
              }}
            />
          ))}
          <button
            onClick={() => { onLineColor(null); onCandleUp("#26a69a"); onCandleDown("#ef5350"); }}
            title="Réinitialiser"
            style={{
              width:20, height:20, borderRadius:4, cursor:"pointer",
              background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)",
              color:"rgba(255,255,255,0.35)", fontSize:11, display:"flex", alignItems:"center", justifyContent:"center", padding:0,
            }}
          >↺</button>
        </div>
      </div>
    </div>
  );
}

function TipCard({ tip, compact = false }: { tip: Tip; compact?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const signalColors: Record<TipSignal, { bg: string; border: string; glow: string }> = {
    positive: { bg:"rgba(34,197,94,0.08)",  border:"rgba(34,197,94,0.25)",  glow:"rgba(34,197,94,0.20)" },
    neutral:  { bg:"rgba(96,165,250,0.07)", border:"rgba(96,165,250,0.22)", glow:"rgba(96,165,250,0.18)" },
    warning:  { bg:"rgba(249,115,22,0.08)", border:"rgba(249,115,22,0.25)", glow:"rgba(249,115,22,0.20)" },
    negative: { bg:"rgba(239,68,68,0.08)",  border:"rgba(239,68,68,0.25)",  glow:"rgba(239,68,68,0.20)" },
  };
  const sc = signalColors[tip.signal];
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: compact ? "none" : "1 1 200px",
        background: sc.bg,
        border:`1px solid ${hovered ? tip.accent + "55" : sc.border}`,
        borderLeft:`3px solid ${tip.accent}`,
        borderRadius:10,
        padding: compact ? "10px 12px" : "13px 14px",
        display:"flex", alignItems:"flex-start", gap:10,
        cursor:"default",
        transform: hovered ? "translateY(-1px)" : "translateY(0)",
        transition:"all 0.18s ease",
        boxShadow: hovered ? `0 6px 18px rgba(0,0,0,0.35), 0 2px 8px ${sc.glow}` : "0 1px 4px rgba(0,0,0,0.15)",
      }}
    >
      <div style={{
        width:32, height:32, borderRadius:8, flexShrink:0,
        background:`rgba(255,255,255,0.06)`,
        border:`1px solid rgba(255,255,255,0.10)`,
        display:"flex", alignItems:"center", justifyContent:"center",
        color: tip.accent,
        transition:"box-shadow 0.18s ease",
        boxShadow: hovered ? `0 0 16px ${sc.glow}` : "none",
      }}>
        {TIP_ICONS[tip.iconKey]}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
          <span style={{ fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.88)", letterSpacing:"0.01em", flex:1, minWidth:0 }}>
            {tip.title}
          </span>
          <span style={{ fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:4,
            background:`${tip.accent}18`, border:`1px solid ${tip.accent}40`, color:tip.accent,
            letterSpacing:"0.04em", flexShrink:0, fontVariantNumeric:"tabular-nums" as const }}>
            {tip.metric}
          </span>
        </div>
        <p style={{ fontSize:10, color:"rgba(255,255,255,0.42)", lineHeight:1.55, margin:0 }}>
          {tip.body}
        </p>
      </div>
    </div>
  );
}


const typeColor = (type?: string) => ({
  bg: type==="CRYPTOCURRENCY"?"rgba(245,158,11,0.16)":type==="ETF"?"rgba(139,92,246,0.16)":type==="INDEX"?"rgba(34,211,238,0.14)":"rgba(59,130,246,0.16)",
  border: type==="CRYPTOCURRENCY"?"rgba(245,158,11,0.35)":type==="ETF"?"rgba(139,92,246,0.35)":type==="INDEX"?"rgba(34,211,238,0.32)":"rgba(59,130,246,0.35)",
  text: type==="CRYPTOCURRENCY"?"#fcd34d":type==="ETF"?"#c4b5fd":type==="INDEX"?"#67e8f9":"#93c5fd",
});

// Rang de l'actif dans sa catégorie (market cap / AUM / CoinMarketCap)
const ASSET_RANK: Record<string, number> = {
  // ── Crypto (CoinMarketCap) ────────────────────────────────────────────────
  "BTC-USD":1,"ETH-USD":2,"XRP-USD":3,"BNB-USD":4,"SOL-USD":5,
  "DOGE-USD":7,"ADA-USD":9,"AVAX-USD":11,"LINK-USD":13,"DOT-USD":16,
  "LTC-USD":19,"NEAR-USD":18,"SUI20947-USD":22,"UNI7083-USD":21,
  "ATOM-USD":27,"ARB-USD":38,"INJ-USD":47,"OP-USD":50,
  // ── US Stocks (market cap mondial) ────────────────────────────────────────
  NVDA:1,AAPL:2,MSFT:3,AMZN:4,GOOGL:5,GOOG:5,META:6,TSLA:7,
  AVGO:8,TSM:9,LLY:10,JPM:11,V:12,MA:13,UNH:14,WMT:15,
  XOM:16,HD:17,BAC:18,PG:19,COST:20,MRK:21,ABBV:22,KO:23,
  MCD:24,NFLX:25,ADBE:26,AMD:27,CRM:28,QCOM:29,NOW:30,
  GS:31,MS:32,SPGI:33,BLK:34,RTX:35,DE:36,CAT:37,BA:38,
  LMT:39,GE:40,DIS:41,SBUX:42,NKE:43,PYPL:44,UBER:45,
  COIN:50,PLTR:42,ARM:36,SMCI:55,ABNB:60,TXN:25,HON:38,
  // ── Europe (market cap européen) ──────────────────────────────────────────
  "ASML":1,"MC.PA":2,"NOVN.SW":3,"NESN.SW":4,"SAP":5,
  "OR.PA":6,"RO.SW":7,"TTE.PA":8,"SU.PA":9,"AIR.PA":10,
  "SIE.DE":11,"ALV.DE":12,"BNP.PA":13,"ACA.PA":14,"DG.PA":15,
  "BMW.DE":16,"VOW3.DE":17,"BAYN.DE":18,"BAS.DE":19,"ADS.DE":20,
  "GLE.PA":21,"SAN.PA":22,"HO.PA":23,"CS.PA":24,"DTE.DE":25,
  "AI.PA":26,"KER.PA":27,"STLA":28,
  "HSBA.L":1,"SHEL.L":2,"BP.L":3,"GSK.L":4,"RIO.L":5,
  "7203.T":1,"6758.T":2,"9984.T":3,
  "005930.KS":1,BABA:1,TCEHY:2,
  // ── ETF (AUM) ─────────────────────────────────────────────────────────────
  SPY:1,VTI:2,QQQ:3,VEA:4,AGG:5,VWO:6,GLD:7,IWM:8,
  IBIT:9,TLT:10,XLF:11,XLE:12,VNQ:13,XLK:14,XLV:15,
  XLI:16,EEM:17,FBTC:18,ACWI:19,EWJ:20,HYG:21,SLV:22,ARKK:23,
  "CW8.PA":1,"EWLD.PA":2,"ESE.PA":3,"PANX.PA":4,
};

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
  const [quote, setQuote] = useState<{day_high?:number;day_low?:number;open?:number;prev_close?:number;year_high?:number;year_low?:number;volume?:number;avg_volume?:number;market_cap?:number;currency?:string}|null>(null);
  const [subOpen, setSubOpen] = useState(false);
  const [subTab, setSubTab] = useState<SubTab>("drawdown");
  const [activePeriod, setActivePeriod] = useState("Max");
  const [visibleRange, setVisibleRange]   = useState<{from:string;to:string}|null>(null);
  const [crosshairTime, setCrosshairTime] = useState<number|null>(null);
  const [chartPriceData, setChartPriceData] = useState<{date:string;value:number;high?:number;low?:number}[]>([]);
  const [showCustom,    setShowCustom]    = useState(false);
  const [copied,        setCopied]        = useState(false);
  const [chartViewMode, setChartViewMode] = useState<"line" | "candle">("line");
  const [extractedColor, setExtractedColor] = useState<string | null>(null);
  const [displayCurrency,   setDisplayCurrency]   = useState<string | null>(null);
  const [showCurrencyMenu,  setShowCurrencyMenu]  = useState(false);
  const [fxRates,           setFxRates]           = useState<Record<string, number>>({ USD: 1 });
  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const [sidebarTab,     setSidebarTab]     = useState<"news"|"similar"|"ai">("news");
  const [similar,        setSimilar]        = useState<{ticker:string;sector?:string;country?:string;type?:string;price:number;change:number}[]>([]);
  const [similarBy,      setSimilarBy]      = useState<"sector"|"geography"|"class"|"marketcap">("sector");
  const [news,           setNews]           = useState<{title:string;publisher:string;link:string;published_at:string|number;thumbnail?:string}[]>([]);
  const [newsLoading,    setNewsLoading]    = useState(false);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [fullscreen,     setFullscreen]     = useState(false);

  // Reset extracted colour whenever the viewed asset changes
  useEffect(() => { setExtractedColor(null); }, [ticker]);

  // Colours — initialised from localStorage, persisted on every change
  const [lineColor,  setLineColorRaw]  = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem("novac_chart_lineColor") : null
  );
  const [candleUp,   setCandleUpRaw]   = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem("novac_chart_candleUp")   ?? "#26a69a") : "#26a69a"
  );
  const [candleDown, setCandleDownRaw] = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem("novac_chart_candleDown") ?? "#ef5350") : "#ef5350"
  );

  const setLineColor  = (v: string | null) => { setLineColorRaw(v);  if (v === null) localStorage.removeItem("novac_chart_lineColor"); else localStorage.setItem("novac_chart_lineColor", v); };
  const setCandleUp   = (v: string)        => { setCandleUpRaw(v);   localStorage.setItem("novac_chart_candleUp",   v); };
  const setCandleDown = (v: string)        => { setCandleDownRaw(v); localStorage.setItem("novac_chart_candleDown", v); };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const assetInfo = ticker ? TRENDING.find(a => a.ticker === ticker) : null;
  const isCrypto = !!(ticker && (assetInfo?.type === "CRYPTOCURRENCY" || ticker.endsWith("-USD")));
  const label = isPortfolio
    ? (activePortfolio?.name || "Portefeuille")
    : (assetInfo?.name || ticker || "Actif");
  const color = isPortfolio
    ? (activePortfolio?.color || "#5B8DEF")
    : (ticker ? (BRAND_COLORS[ticker] ?? extractedColor ?? "#5B8DEF") : "#5B8DEF");
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
          setDrawdownData(backtestData.drawdown_series || []);
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
          setDrawdownData(d.drawdown_series || []);
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

  // Quote (infos marché) — chargé une fois par ticker
  useEffect(() => {
    if (!ticker) { setQuote(null); return; }
    fetch(`${API_URL}/api/v1/quote/${encodeURIComponent(ticker)}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setQuote(d); })
      .catch(() => {});
  }, [ticker]);

  // Initialise la devise affichée depuis la devise native de l'actif
  useEffect(() => {
    if (quote?.currency) setDisplayCurrency(quote.currency);
  }, [quote?.currency]);

  // Auto-open sidebar when viewing a ticker
  useEffect(() => {
    if (ticker) setSidebarOpen(true);
  }, [ticker]);

  // Similar assets
  useEffect(() => {
    if (!ticker) { setSimilar([]); return; }
    setSimilarLoading(true);
    fetch(`${API_URL}/api/v1/similar/${encodeURIComponent(ticker)}?by=${similarBy}`)
      .then(r => r.json())
      .then((d: unknown) => { if (Array.isArray(d)) setSimilar(d); })
      .catch(() => {})
      .finally(() => setSimilarLoading(false));
  }, [ticker, similarBy]);

  // News
  useEffect(() => {
    if (!ticker) { setNews([]); return; }
    setNewsLoading(true);
    fetch(`${API_URL}/api/v1/news/${encodeURIComponent(ticker)}?lang=fr`)
      .then(r => r.json())
      .then((d: unknown) => { if (Array.isArray(d)) setNews(d); })
      .catch(() => {})
      .finally(() => setNewsLoading(false));
  }, [ticker]);

  // Taux de change (open.er-api.com, gratuit, sans auth)
  useEffect(() => {
    fetch("https://open.er-api.com/v6/latest/USD")
      .then(r => r.json())
      .then(d => { if (d.rates) setFxRates({ USD: 1, ...d.rates }); })
      .catch(() => {});
  }, []);

  // Multiplicateur pour convertir prix natif → devise choisie
  const fxMultiplier = useMemo(() => {
    const native = quote?.currency ?? "USD";
    const target = displayCurrency ?? native;
    if (target === native) return 1;
    const rNative = native === "USD" ? 1 : (fxRates[native] ?? 1);
    const rTarget = target === "USD" ? 1 : (fxRates[target] ?? 1);
    return rTarget / rNative;
  }, [displayCurrency, quote?.currency, fxRates]);

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
      const diffMs = (new Date(visibleRange.to).getTime() - new Date(visibleRange.from).getTime());
      if (diffMs >= 2 * 86400 * 1000) return { from: visibleRange.from, to: visibleRange.to };
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

  // For ticker mode, use daily-aggregated yfinance prices (same source as main chart)
  // so all indicators share the exact same date range and precision as GrowthChart.
  const dailyChartData = useMemo(() => toDailyClose(chartPriceData), [chartPriceData]);
  const effectivePriceData = ticker && dailyChartData.length > 0
    ? dailyChartData
    : scaledPortfolioData;


  // All other indicators use full data — LC SubChart handles visible range via setVisibleRange
  const fullVol    = useMemo(() => computeRollingVol(effectivePriceData), [effectivePriceData]);
  const fullRsi    = useMemo(() => computeRSI(effectivePriceData), [effectivePriceData]);
  const fullCorr   = useMemo(() => computeRollingCorrelation(effectivePriceData, scaledBenchmarkData), [effectivePriceData, scaledBenchmarkData]);
  const fullSharpe = useMemo(() => computeRollingSharpe(effectivePriceData), [effectivePriceData]);

  const tickerDrawdown = useMemo(
    () => ticker && dailyChartData.length > 0 ? computeDrawdownFromPrices(dailyChartData) : null,
    [ticker, dailyChartData]
  );


  const subData = useMemo((): { date: string; value: number }[] => {
    if (subTab === "drawdown") {
      if (tickerDrawdown) return tickerDrawdown;
      return scaledDrawdownData.map(p => ({ date: p.date, value: p.drawdown }));
    }
    if (subTab === "volatility")  return fullVol.map(p => ({ date: p.date, value: p.vol }));
    if (subTab === "rsi")         return fullRsi.map(p => ({ date: p.date, value: p.rsi }));
    if (subTab === "correlation") return fullCorr.map(p => ({ date: p.date, value: p.corr }));
    if (subTab === "sharpe")      return fullSharpe.map(p => ({ date: p.date, value: p.sharpe }));
    return [];
  }, [subTab, tickerDrawdown, scaledDrawdownData, fullVol, fullRsi, fullCorr, fullSharpe]);

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

  // ── metaCards hoisted so leftSlot can access it outside the header IIFE ──────
  const _EXCH: Record<string,string> = {
    NMS:"Nasdaq GS", NMQ:"Nasdaq", NYQ:"NYSE", NYSEArca:"NYSE Arca", PAR:"Euronext Paris",
    GER:"Xetra", LSE:"London SE", MCE:"Madrid", AMS:"Amsterdam", MIL:"Milan", SWX:"SIX Swiss",
  };
  const _fmtN = (v: number) => v < 1
    ? v.toLocaleString("en-US",{minimumFractionDigits:4,maximumFractionDigits:4})
    : v.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
  const _fmtV = (v: number) => v > 1e9 ? (v/1e9).toFixed(1)+"B" : v > 1e6 ? (v/1e6).toFixed(1)+"M" : v > 1e3 ? (v/1e3).toFixed(0)+"K" : String(v);
  const _fmtC = (v: number) => v > 1e12 ? (v/1e12).toFixed(2)+"T" : v > 1e9 ? (v/1e9).toFixed(1)+"B" : (v/1e6).toFixed(0)+"M";
  const metaCards = ticker ? (() => {
    const aType = assetInfo?.type;
    const isIdx = aType === "INDEX";
    const isEtf = aType === "ETF";
    const isCrp = aType === "CRYPTOCURRENCY";
    const exchVal = (isIdx || isCrp)
      ? null
      : (assetInfo?.exchange ? (_EXCH[assetInfo.exchange] || assetInfo.exchange) : null);
    return [
      exchVal                                               && { label:"Exchange", value: exchVal },
      aType                                                 && { label:"Type",     value: ({"EQUITY":"Action","ETF":"ETF","INDEX":"Indice","CRYPTOCURRENCY":"Crypto"} as Record<string,string>)[aType] || aType },
      quote?.currency                                       && { label:"Devise",   value: quote.currency },
      quote?.open      != null                              && { label:"Ouv",      value: _fmtN(quote.open!) },
      quote?.day_high  != null                              && { label:"Haut",     value: _fmtN(quote.day_high!) },
      quote?.day_low   != null                              && { label:"Bas",      value: _fmtN(quote.day_low!) },
      !isIdx && quote?.volume    != null                    && { label:"Vol",      value: _fmtV(quote.volume!) },
      !isIdx && quote?.market_cap != null                   && { label: isEtf ? "AUM" : "Cap", value: _fmtC(quote.market_cap!) },
      (quote?.year_low != null && quote?.year_high != null) && { label:"52 sem",  value: `${_fmtN(quote.year_low!)} – ${_fmtN(quote.year_high!)}` },
    ].filter(Boolean) as {label:string;value:string}[];
  })() : [];

  return (
    <div style={{ height:"100vh", background:"#041124", color:"#F8F9FC", fontFamily:"-apple-system,BlinkMacSystemFont,sans-serif", display:"flex", flexDirection:"column", position:"relative", overflow:"hidden" }}>
      <div style={{ position:"fixed", inset:0, zIndex:0, pointerEvents:"none", background:[
        "radial-gradient(ellipse 60% 50% at 25% 30%, rgba(80,120,255,0.09) 0%, transparent 100%)",
        "radial-gradient(ellipse 55% 60% at 75% 65%, rgba(60,200,100,0.06) 0%, transparent 100%)",
        "radial-gradient(ellipse 50% 45% at 55% 20%, rgba(200,100,255,0.05) 0%, transparent 100%)",
        "#040F22",
      ].join(", ") }}/>
      <div style={{ position:"relative", zIndex:1, display:"flex", flexDirection:"column", flex:1, minHeight:0 }}>

        {/* Header */}
        {(() => {
          const displayTicker = ticker
            ? ticker.replace(/-USD$/,"").replace(/[0-9]+$/,"").replace(/\.[A-Z]{1,3}$/,"").replace(/^\^/,"")
            : "";
          const EXCH: Record<string,string> = {
            NMS:"Nasdaq GS", NMQ:"Nasdaq", NYQ:"NYSE", NYSEArca:"NYSE Arca", PAR:"Euronext Paris",
            GER:"Xetra", LSE:"London SE", MCE:"Madrid", AMS:"Amsterdam", MIL:"Milan", SWX:"SIX Swiss",
          };
          const fmtNum = (v: number) => v < 1
            ? v.toLocaleString("en-US",{minimumFractionDigits:4,maximumFractionDigits:4})
            : v.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});

          // Market open — per exchange timezone
          const now = new Date();
          const EXCH_HOURS: Record<string,{tz:string;o:number;c:number}> = {
            NMS:{tz:"America/New_York",o:570,c:960},NMQ:{tz:"America/New_York",o:570,c:960},
            NYQ:{tz:"America/New_York",o:570,c:960},NYSEArca:{tz:"America/New_York",o:570,c:960},
            PAR:{tz:"Europe/Paris",o:540,c:1050},GER:{tz:"Europe/Berlin",o:540,c:1050},
            LSE:{tz:"Europe/London",o:480,c:990},SWX:{tz:"Europe/Zurich",o:540,c:1050},
            MCE:{tz:"Europe/Madrid",o:540,c:1050},AMS:{tz:"Europe/Amsterdam",o:540,c:1050},
            MIL:{tz:"Europe/Rome",o:540,c:1050},
          };
          const exchH = assetInfo?.exchange ? (EXCH_HOURS[assetInfo.exchange] ?? EXCH_HOURS.NMS) : EXCH_HOURS.NMS;
          const exParts = new Intl.DateTimeFormat("en-US",{timeZone:exchH.tz,weekday:"short",hour:"numeric",minute:"2-digit",hour12:false}).formatToParts(now);
          const exWd = exParts.find(p=>p.type==="weekday")?.value??"";
          const exH  = parseInt(exParts.find(p=>p.type==="hour")?.value??"0");
          const exM  = parseInt(exParts.find(p=>p.type==="minute")?.value??"0");
          const isOpen = exWd!=="Sat" && exWd!=="Sun" && (exH*60+exM)>=exchH.o && (exH*60+exM)<exchH.c;

          const up = currentPrice ? currentPrice.change >= 0 : true;

          return (
            <>
              <style>{`
                @keyframes hdr-glow-up{0%,100%{box-shadow:0 0 6px rgba(34,197,94,.15)}50%{box-shadow:0 0 14px rgba(34,197,94,.35)}}
                @keyframes hdr-glow-dn{0%,100%{box-shadow:0 0 6px rgba(239,68,68,.15)}50%{box-shadow:0 0 14px rgba(239,68,68,.35)}}
                @keyframes hdr-pulse{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.7)}60%{box-shadow:0 0 0 5px rgba(34,197,94,0)}}
                @keyframes hdr-pulse-live{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.9)}50%{box-shadow:0 0 0 6px rgba(34,197,94,0)}}
              `}</style>
              <div style={{ display:"flex", flexDirection:"column", padding:"11px 20px 9px", borderBottom:"1px solid rgba(255,255,255,0.06)", flexShrink:0, gap:8 }}>

                {/* ── Row 1: back · [logo + compact identity+price] · NOVAC ── */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:16 }}>

                  <div style={{ display:"flex", alignItems:"center", gap:13, minWidth:0 }}>
                    <button onClick={() => router.back()} style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, color:"rgba(255,255,255,0.55)", fontSize:11, padding:"6px 12px", cursor:"pointer", letterSpacing:"0.04em", flexShrink:0 }}>
                      ← Retour
                    </button>

                    {ticker && (
                      <TileCard ticker={ticker} style={{ display:"flex", alignItems:"center", gap:12, padding:"8px 10px" }}>
                        <AssetLogo
                          ticker={ticker} type={assetInfo?.type} size={40} radius={10}
                          fallbackBg={tc.bg} fallbackBorder={tc.border} fallbackTextColor={tc.text}
                          onColorExtracted={c => { if (!BRAND_COLORS[ticker]) setExtractedColor(c); }}
                          bare
                        />
                        <div>
                          {/* Line 1 — ticker · prix · variation  (même taille, même ligne) */}
                          <div style={{ display:"flex", alignItems:"baseline", gap:10, flexWrap:"nowrap" }}>
                            <span style={{ fontSize:20, fontWeight:800, color:"#F8F9FC", letterSpacing:"-0.03em", lineHeight:1 }}>
                              {displayTicker}
                            </span>
                            {currentPrice && (
                              <>
                                <span style={{ width:1, height:14, background:"rgba(255,255,255,0.3)", flexShrink:0, alignSelf:"center" }}/>
                                <span style={{ fontSize:20, fontWeight:700, color:"#F8F9FC", letterSpacing:"-0.03em", fontVariantNumeric:"tabular-nums", lineHeight:1 }}>
                                  {fmtNum(currentPrice.price)}
                                </span>
                                <span style={{ fontSize:11, fontWeight:600, color: up ? "#4ade80" : "#ef4444", letterSpacing:"-0.01em", fontVariantNumeric:"tabular-nums", lineHeight:1 }}>
                                  {up ? "▲" : "▼"}{" "}
                                  {fmtNum(Math.abs(quote?.prev_close ? currentPrice.price - quote.prev_close : currentPrice.price * currentPrice.change / 100))}{" "}
                                  {up ? "+" : "–"}{Math.abs(currentPrice.change).toFixed(2)}%
                                </span>
                              </>
                            )}
                          </div>
                          {/* Line 2 — tout statique + statut, même taille, même couleur */}
                          <div style={{ display:"flex", alignItems:"center", gap:5, marginTop:5 }}>
                            <span style={{ fontSize:11, color:"#FFFFFF", lineHeight:1, letterSpacing:"0.01em" }}>
                              {assetInfo?.name || ticker}
                              {(() => {
                                if (!ticker || ASSET_RANK[ticker] == null || assetInfo?.type === "INDEX") return null;
                                const lbl = ({"EQUITY":"Action","ETF":"ETF","CRYPTOCURRENCY":"Crypto"} as Record<string,string>)[assetInfo?.type ?? ""];
                                return lbl ? ` · #${ASSET_RANK[ticker]} ${lbl}` : null;
                              })()}
                            </span>
                            <span style={{ color:"#FFFFFF", fontSize:11 }}>·</span>
                            {!isCrypto && (
                              <span style={{ display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
                                <span style={{ width:5, height:5, borderRadius:"50%", display:"inline-block", background: isOpen ? "#22c55e" : "#FFFFFF", animation: isOpen ? "hdr-pulse 2s ease-in-out infinite" : "none", flexShrink:0 }}/>
                                <span style={{ fontSize:10, letterSpacing:"0.05em", color: isOpen ? "#4ade80" : "#FFFFFF" }}>
                                  {isOpen ? "Marché ouvert" : "Marché fermé"}
                                </span>
                                {isOpen && (
                                  <span style={{ fontSize:9, color:"#FFFFFF", letterSpacing:"0.04em" }}>↻ 60s</span>
                                )}
                              </span>
                            )}
                            {isCrypto && (
                              <span style={{ display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
                                <span style={{ width:5, height:5, borderRadius:"50%", background:"#22c55e", display:"inline-block", animation:"hdr-pulse-live 1.5s ease-in-out infinite", flexShrink:0 }}/>
                                <span style={{ fontSize:10, color:"#4ade80", letterSpacing:"0.05em" }}>LIVE</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </TileCard>
                    )}
                    {ticker && (
                      <div style={{ width:26, height:26, borderRadius:7, border:"1px solid rgba(255,255,255,0.12)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"not-allowed", flexShrink:0 }} title="Ajouter un benchmark (bientôt disponible)">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v8M1 5h8" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round"/></svg>
                      </div>
                    )}

                    {isPortfolio && activePortfolio && (
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:36, height:36, borderRadius:9, display:"flex", alignItems:"center", justifyContent:"center", background:`${activePortfolio.color||"#5B8DEF"}22`, border:`1px solid ${activePortfolio.color||"#5B8DEF"}44`, flexShrink:0 }}>
                          <span style={{ fontSize:"9px", fontWeight:800, color:activePortfolio.color||"#5B8DEF", letterSpacing:"-0.02em" }}>{shortLabel}</span>
                        </div>
                        <div>
                          <div style={{ fontSize:13, fontWeight:600, color:"#F8F9FC", lineHeight:1.2 }}>{activePortfolio.name}</div>
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:2, flexWrap:"wrap" }}>
                            <span style={{ fontSize:10, color:"rgba(255,255,255,0.28)" }}>{activePortfolio.assets.length} actifs · vs S&P 500</span>
                            <span style={{ color:"rgba(255,255,255,0.15)", fontSize:10 }}>·</span>
                            <span style={{ fontSize:10, color:"rgba(255,255,255,0.4)" }}>Investi</span>
                            <input type="number" min={1} value={investedAmount}
                              onChange={e => setInvestedAmount(Math.max(1, Number(e.target.value)))}
                              onClick={e => (e.target as HTMLInputElement).select()}
                              style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.14)", borderRadius:6, color:"#F8F9FC", fontSize:11, padding:"2px 7px", width:76, textAlign:"right", outline:"none" }}
                            />
                            <span style={{ fontSize:10, color:"rgba(255,255,255,0.4)" }}>€</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ color:"rgba(255,255,255,0.1)", fontSize:"11px", letterSpacing:"0.22em", flexShrink:0 }}>NOVAC</div>
                </div>

              </div>
            </>
          );
        })()}

        {/* Content */}
        <div style={{ flex:1, minHeight:0, padding:"10px 20px 10px", display:"flex", flexDirection:"column", overflow:"hidden" }}>
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
              <div style={{ display:"flex", gap:12, flex:"1 1 0", minHeight:0 }}>
              {/* Chart column */}
              <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column" }}>
              {/* Main chart */}
              <div style={{ border:"1px solid rgba(255,255,255,0.06)", borderRadius:"16px", padding:"14px 18px 10px", flex:"1 1 0", minHeight:220, display:"flex", flexDirection:"column", position:"relative", overflow:"hidden", background:"rgba(255,255,255,0.02)" }}>
                <GrowthChart
                  portfolioData={scaledPortfolioData}
                  benchmarkData={scaledBenchmarkData}
                  benchmarkName="S&P 500"
                  portfolioLabel={label}
                  drawdownData={scaledDrawdownData.length > 0 ? scaledDrawdownData : undefined}
                  ticker={ticker ?? undefined}
                  portfolioColor={lineColor ?? color}
                  candleUpColor={candleUp}
                  candleDownColor={candleDown}
                  chartMode={chartViewMode}
                  onChartModeChange={setChartViewMode}
                  dark={true}
                  priceMode={!!ticker}
                  hideDrawdown={true}
                  dailyChangePct={currentPrice?.change ?? null}
                  openPrice={quote?.open ?? null}
                  onPeriodChange={setActivePeriod}
                  onVisibleRangeChange={(from, to) => setVisibleRange(from && to ? { from: new Date(from*1000).toISOString().slice(0,10), to: new Date(to*1000).toISOString().slice(0,10) } : null)}
                  onCrosshairMove={(t) => setCrosshairTime(t)}
                  onAdaptiveData={setChartPriceData}
                  leftSlot={metaCards.length > 0 ? (
                    <div style={{ display:"flex", alignItems:"center", gap:0, overflow:"hidden" }}>
                      {metaCards.map((card, i) => (
                        <div key={card.label} style={{ display:"flex", alignItems:"center", gap:5, padding: i === 0 ? "0 10px 0 0" : "0 10px", borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.07)" : "none" }}>
                          <span style={{ fontSize:9, color:"rgba(255,255,255,0.22)", letterSpacing:"0.08em", textTransform:"uppercase" as const, flexShrink:0 }}>
                            {card.label}
                          </span>
                          <span style={{ fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.6)", fontVariantNumeric:"tabular-nums" as const }}>
                            {card.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : undefined}
                  rightSlot={
                    <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                      {/* Fullscreen */}
                      {ticker && (
                        <button
                          onClick={() => setFullscreen(f => !f)}
                          title={fullscreen ? "Quitter le plein écran" : "Plein écran"}
                          style={{
                            background: fullscreen ? "rgba(91,141,239,0.16)" : "rgba(255,255,255,0.05)",
                            border:`1px solid ${fullscreen ? "rgba(91,141,239,0.40)" : "rgba(255,255,255,0.10)"}`,
                            borderRadius:6, width:28, height:28, cursor:"pointer",
                            display:"flex", alignItems:"center", justifyContent:"center",
                            color: fullscreen ? "#9BB9FF" : "rgba(255,255,255,0.40)",
                            transition:"all 0.15s",
                          }}
                        >
                          {fullscreen ? (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"/></svg>
                          ) : (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>
                          )}
                        </button>
                      )}
                      {/* Sidebar toggle */}
                      {ticker && (
                        <button
                          onClick={() => setSidebarOpen(o => !o)}
                          title={sidebarOpen ? "Fermer le panneau" : "Ouvrir le panneau (News, Similaires, IA)"}
                          style={{
                            background: sidebarOpen ? "rgba(91,141,239,0.16)" : "rgba(255,255,255,0.05)",
                            border:`1px solid ${sidebarOpen ? "rgba(91,141,239,0.40)" : "rgba(255,255,255,0.10)"}`,
                            borderRadius:6, width:28, height:28, cursor:"pointer",
                            display:"flex", alignItems:"center", justifyContent:"center",
                            color: sidebarOpen ? "#9BB9FF" : "rgba(255,255,255,0.40)",
                            transition:"all 0.15s",
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
                        </button>
                      )}
                      {/* Share */}
                      <button
                        onClick={handleShare}
                        title="Copier le lien"
                        style={{
                          background: copied ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.05)",
                          border:`1px solid ${copied ? "rgba(34,197,94,0.35)" : "rgba(255,255,255,0.10)"}`,
                          borderRadius:6, width:28, height:28, cursor:"pointer",
                          display:"flex", alignItems:"center", justifyContent:"center",
                          color: copied ? "#4ade80" : "rgba(255,255,255,0.40)",
                          transition:"all 0.15s",
                        }}
                      >
                        {copied ? (
                          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="2,8 6,12 14,4"/>
                          </svg>
                        ) : (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                          </svg>
                        )}
                      </button>

                      {/* Courbe / Bougies toggle — only for ticker */}
                      {ticker && (
                        <button
                          onClick={() => setChartViewMode(m => m === "line" ? "candle" : "line")}
                          title={chartViewMode === "line" ? "Passer en bougies" : "Passer en courbe"}
                          style={{
                            background:"rgba(255,255,255,0.05)",
                            border:`1px solid ${chartViewMode === "candle" ? "rgba(155,185,255,0.35)" : "rgba(255,255,255,0.10)"}`,
                            borderRadius:6, width:28, height:28, cursor:"pointer",
                            display:"flex", alignItems:"center", justifyContent:"center",
                            color: chartViewMode === "candle" ? "#9BB9FF" : "rgba(255,255,255,0.40)",
                            transition:"all 0.15s",
                          }}
                        >
                          {chartViewMode === "line" ? (
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <rect x="3" y="4" width="3" height="6" rx="0.5"/>
                              <line x1="4.5" y1="2" x2="4.5" y2="4"/>
                              <line x1="4.5" y1="10" x2="4.5" y2="14"/>
                              <rect x="10" y="6" width="3" height="5" rx="0.5"/>
                              <line x1="11.5" y1="3" x2="11.5" y2="6"/>
                              <line x1="11.5" y1="11" x2="11.5" y2="13"/>
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <polyline points="1,12 4,8 7,10 10,5 13,7 15,4"/>
                            </svg>
                          )}
                        </button>
                      )}

                      {/* Customisation colours */}
                      <button
                        onClick={() => setShowCustom(v => !v)}
                        title="Personnaliser les couleurs"
                        style={{
                          background: showCustom ? "rgba(155,185,255,0.14)" : "rgba(255,255,255,0.05)",
                          border:`1px solid ${showCustom ? "rgba(155,185,255,0.35)" : "rgba(255,255,255,0.10)"}`,
                          borderRadius:6, width:28, height:28, cursor:"pointer",
                          display:"flex", alignItems:"center", justifyContent:"center",
                          transition:"all 0.15s",
                        }}
                      >
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                          <circle cx="4"  cy="4"  r="2.5" fill={showCustom ? "#9BB9FF" : "rgba(255,255,255,0.45)"}/>
                          <circle cx="12" cy="4"  r="2.5" fill={showCustom ? "#9BB9FF" : "rgba(255,255,255,0.45)"}/>
                          <circle cx="4"  cy="12" r="2.5" fill={showCustom ? "#9BB9FF" : "rgba(255,255,255,0.45)"}/>
                          <circle cx="12" cy="12" r="2.5" fill={showCustom ? "#9BB9FF" : "rgba(255,255,255,0.45)"}/>
                        </svg>
                      </button>
                    </div>
                  }
                />

                {/* ── Customisation panel ── */}
                {showCustom && <CustomPanel
                  lineColor={lineColor ?? color}
                  candleUp={candleUp}
                  candleDown={candleDown}
                  defaultLineColor={color}
                  onLineColor={setLineColor}
                  onCandleUp={setCandleUp}
                  onCandleDown={setCandleDown}
                />}
              </div>

              {/* Sub-panel — en dessous, hauteur fixe, pas de scroll */}
              {subOpen ? (
                <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:12, marginTop:4, flexShrink:0, display:"flex", flexDirection:"column" }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"4px 12px 3px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ display:"flex", gap:4, overflowX:"auto", scrollbarWidth:"none" as const }}>
                      {SUB_TABS.map(({key, label: lbl}) => (
                        <button key={key} onClick={() => setSubTab(key)} style={{ whiteSpace:"nowrap" as const, background: subTab===key ? "rgba(155,185,255,0.12)" : "transparent", border:`1px solid ${subTab===key ? "rgba(155,185,255,0.25)" : "transparent"}`, borderRadius:6, padding:"3px 10px", cursor:"pointer", fontSize:10, letterSpacing:"0.05em", color: subTab===key ? "#9BB9FF" : "rgba(255,255,255,0.3)" }}>
                          {lbl}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setSubOpen(false)} style={{ background:"transparent", border:"none", cursor:"pointer", color:"rgba(255,255,255,0.25)", fontSize:16, padding:"0 4px", lineHeight:1, flexShrink:0 }}>×</button>
                  </div>
                  <div style={{ height:200 }}>
                    {subTab === "distribution" ? (
                      distData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={distData} margin={{ top:4, right:2, bottom:2, left:0 }} barCategoryGap="4%">
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
                        <div style={{ height:200, display:"flex", alignItems:"center", justifyContent:"center", color:"rgba(255,255,255,0.2)", fontSize:11 }}>Données insuffisantes</div>
                      )
                    ) : subData.length > 0 ? (
                      <SubChart
                        type={subTab as import("@/components/charts/SubChart").SubChartType}
                        data={subData}
                        visibleRange={visibleRange}
                        height={200}
                      />
                    ) : (
                      <div style={{ height:200, display:"flex", alignItems:"center", justifyContent:"center", color:"rgba(255,255,255,0.2)", fontSize:11 }}>
                        {subTab === "correlation" || subTab === "sharpe" ? "Données insuffisantes (min 90 jours)" : "Données insuffisantes"}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setSubOpen(true)}
                  style={{ marginTop:6, background:"transparent", border:"1px dashed rgba(255,255,255,0.07)", borderRadius:8, padding:"5px 0", cursor:"pointer", color:"rgba(255,255,255,0.18)", fontSize:10, letterSpacing:"0.07em", display:"flex", alignItems:"center", justifyContent:"center", gap:5, flexShrink:0 }}
                >
                  <span>＋</span> Indicateur
                </button>
              )}

              </div>{/* end chart column */}

              {/* Sidebar */}
              {ticker && sidebarOpen && (
                <div style={{ width:336, flexShrink:0, display:"flex", flexDirection:"column", background:"rgba(255,255,255,0.025)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, overflow:"hidden" }}>
                  {/* Sidebar tabs + close button */}
                  <div style={{ display:"flex", alignItems:"stretch", borderBottom:"1px solid rgba(255,255,255,0.06)", flexShrink:0 }}>
                    {([["news","Actualités"],["similar","Similaires"],["ai","IA"]] as const).map(([tab, label]) => {
                      const active = sidebarTab === tab;
                      return (
                        <button key={tab} onClick={() => setSidebarTab(tab)}
                          style={{ flex:1, padding:"12px 4px 10px", border:"none", background: active?"rgba(91,141,239,0.10)":"transparent", cursor:"pointer", fontSize:11, fontWeight:active?700:500, letterSpacing:"0.07em", color:active?"#C5D9FF":"rgba(255,255,255,0.30)", borderBottom: active?"2px solid #5B8DEF":"2px solid rgba(255,255,255,0.0)", transition:"all 0.13s" }}>
                          {label}
                        </button>
                      );
                    })}
                    <button onClick={() => setSidebarOpen(false)}
                      title="Fermer"
                      style={{ flexShrink:0, width:36, border:"none", background:"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"rgba(255,255,255,0.20)", borderLeft:"1px solid rgba(255,255,255,0.05)", transition:"color 0.13s" }}
                      onMouseEnter={e => (e.currentTarget.style.color="rgba(255,255,255,0.55)")}
                      onMouseLeave={e => (e.currentTarget.style.color="rgba(255,255,255,0.20)")}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>

                  {/* Sidebar content */}
                  <div style={{ flex:1, overflowY:"auto", padding:"14px 12px" }}>

                    {/* NEWS TAB */}
                    {sidebarTab === "news" && (
                      newsLoading ? (
                        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                          {[1,2,3,4].map(i => (
                            <div key={i} style={{ height:60, borderRadius:8, background:"rgba(255,255,255,0.04)" }} />
                          ))}
                        </div>
                      ) : news.length > 0 ? (
                        <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                          {news.map((n, i) => {
                            let timeAgo = "";
                            try {
                              const ts = typeof n.published_at === "number"
                                ? new Date(n.published_at * 1000)
                                : new Date(n.published_at);
                              const diff = Math.floor((Date.now() - ts.getTime()) / 60000);
                              if (diff < 60)        timeAgo = `${diff}m`;
                              else if (diff < 1440) timeAgo = `${Math.floor(diff/60)}h`;
                              else                  timeAgo = `${Math.floor(diff/1440)}j`;
                            } catch { timeAgo = ""; }

                            return (
                              <a key={i} href={n.link} target="_blank" rel="noopener noreferrer"
                                style={{ display:"flex", gap:11, padding:"11px 12px", borderRadius:10, background:"rgba(255,255,255,0.025)", border:"1px solid rgba(255,255,255,0.06)", textDecoration:"none", transition:"all 0.14s", alignItems:"flex-start" }}
                                onMouseEnter={e => { e.currentTarget.style.background="rgba(255,255,255,0.055)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.12)"; }}
                                onMouseLeave={e => { e.currentTarget.style.background="rgba(255,255,255,0.025)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.06)"; }}>
                                {n.thumbnail ? (
                                  <img src={n.thumbnail} alt="" width={52} height={52}
                                    style={{ borderRadius:7, objectFit:"cover" as const, flexShrink:0 }}
                                    onError={e => { (e.target as HTMLImageElement).style.display="none"; }} />
                                ) : (
                                  <div style={{
                                    width:52, height:52, borderRadius:7, flexShrink:0,
                                    background: ["rgba(91,141,239,0.20)","rgba(139,92,246,0.20)","rgba(34,197,94,0.16)","rgba(249,115,22,0.18)","rgba(236,72,153,0.18)"][
                                      (n.publisher?.charCodeAt(0) ?? 65) % 5
                                    ],
                                    display:"flex", alignItems:"center", justifyContent:"center",
                                    fontSize:20, fontWeight:700, color:"rgba(255,255,255,0.50)",
                                  }}>
                                    {n.publisher?.[0]?.toUpperCase() ?? "N"}
                                  </div>
                                )}
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ fontSize:11.5, fontWeight:500, color:"rgba(255,255,255,0.84)", lineHeight:1.42,
                                    display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" as const, overflow:"hidden" }}>
                                    {n.title}
                                  </div>
                                  <div style={{ marginTop:5, display:"flex", alignItems:"center", gap:6 }}>
                                    <span style={{ fontSize:9.5, color:"rgba(255,255,255,0.38)", fontWeight:500 }}>{n.publisher}</span>
                                    {timeAgo && <><span style={{ width:2, height:2, borderRadius:"50%", background:"rgba(255,255,255,0.20)", display:"inline-block", flexShrink:0 }}/><span style={{ fontSize:9.5, color:"rgba(255,255,255,0.28)" }}>{timeAgo}</span></>}
                                    <span style={{ marginLeft:"auto", fontSize:9, color:"rgba(91,141,239,0.60)" }}>→</span>
                                  </div>
                                </div>
                              </a>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ padding:"30px 0", textAlign:"center", fontSize:11, color:"rgba(255,255,255,0.20)" }}>
                          Aucune actualité disponible.
                        </div>
                      )
                    )}

                    {/* SIMILAR TAB */}
                    {sidebarTab === "similar" && (
                      <div>
                        <div style={{ display:"flex", gap:4, marginBottom:12, flexWrap:"wrap" }}>
                          {(["sector","geography","class","marketcap"] as const).map(by => {
                            const labels = {sector:"Secteur", geography:"Géographie", class:"Classe", marketcap:"Market Cap"};
                            const active = similarBy === by;
                            return (
                              <button key={by} onClick={() => setSimilarBy(by)}
                                style={{ padding:"3px 9px", borderRadius:5, border:`1px solid ${active?"rgba(91,141,239,0.50)":"rgba(255,255,255,0.10)"}`, background:active?"rgba(91,141,239,0.18)":"transparent", color:active?"#9BB9FF":"rgba(255,255,255,0.32)", fontSize:9, fontWeight:active?700:400, cursor:"pointer", letterSpacing:"0.06em", transition:"all 0.13s" }}>
                                {labels[by]}
                              </button>
                            );
                          })}
                        </div>
                        {similarLoading ? (
                          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                            {[1,2,3,4,5].map(i => <div key={i} style={{ height:44, borderRadius:7, background:"rgba(255,255,255,0.04)" }} />)}
                          </div>
                        ) : similar.length > 0 ? (
                          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                            {similar.map(s => {
                              const name = TRENDING.find(t => t.ticker === s.ticker)?.name ?? s.ticker;
                              const pos  = s.change >= 0;
                              return (
                                <div key={s.ticker}
                                  onClick={() => { const url = new URL(window.location.href); url.searchParams.set("ticker", s.ticker); window.location.href = url.toString(); }}
                                  style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", borderRadius:8, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", cursor:"pointer", transition:"background 0.12s" }}
                                  onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,0.07)"}
                                  onMouseLeave={e => e.currentTarget.style.background="rgba(255,255,255,0.03)"}>
                                  <AssetLogo ticker={s.ticker} type={s.type ?? "EQUITY"} size={28}
                                    fallbackBg="rgba(255,255,255,0.07)" fallbackBorder="rgba(255,255,255,0.12)" fallbackTextColor="rgba(255,255,255,0.45)" />
                                  <div style={{ flex:1, minWidth:0 }}>
                                    <div style={{ fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.88)" }}>{s.ticker}</div>
                                    <div style={{ fontSize:9, color:"rgba(255,255,255,0.28)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{name}</div>
                                  </div>
                                  <div style={{ textAlign:"right", flexShrink:0 }}>
                                    <div style={{ fontSize:10, fontWeight:600, color:pos?"#4ade80":"#f87171", fontVariantNumeric:"tabular-nums" as const }}>
                                      {pos?"+":""}{s.change.toFixed(2)}%
                                    </div>
                                    <div style={{ fontSize:9, color:"rgba(255,255,255,0.30)", fontVariantNumeric:"tabular-nums" as const }}>
                                      {s.price < 1 ? s.price.toFixed(4) : s.price < 100 ? s.price.toFixed(2) : s.price.toFixed(0)}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div style={{ padding:"30px 0", textAlign:"center", fontSize:11, color:"rgba(255,255,255,0.20)" }}>
                            Aucun actif similaire trouvé.
                          </div>
                        )}
                      </div>
                    )}

                    {/* AI TAB */}
                    {sidebarTab === "ai" && (
                      tips.length > 0 ? (
                        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                            <span style={{ fontSize:9, color:"rgba(255,255,255,0.22)", letterSpacing:"0.12em", fontWeight:600 }}>ANALYSE IA</span>
                            <span style={{ fontSize:8, background:"rgba(139,92,246,0.18)", border:"1px solid rgba(139,92,246,0.3)", borderRadius:4, padding:"1px 5px", color:"#c4b5fd", fontWeight:600 }}>bêta</span>
                          </div>
                          {tips.map(tip => <TipCard key={tip.title} tip={tip} compact={true} />)}
                        </div>
                      ) : (
                        <div style={{ padding:"30px 0", textAlign:"center", fontSize:11, color:"rgba(255,255,255,0.20)" }}>
                          Chargement de l&apos;analyse…
                        </div>
                      )
                    )}

                  </div>
                </div>
              )}
              </div>{/* end flex-row */}

              {/* Fullscreen overlay */}
              {fullscreen && (
                <div style={{ position:"fixed", inset:0, zIndex:100, background:"#040F22", display:"flex", flexDirection:"column", padding:20 }}>
                  <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:10, flexShrink:0 }}>
                    <button onClick={() => setFullscreen(false)}
                      style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:8, color:"rgba(255,255,255,0.55)", fontSize:11, padding:"6px 14px", cursor:"pointer", letterSpacing:"0.07em", display:"flex", alignItems:"center", gap:6 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"/></svg>
                      Quitter le plein écran
                    </button>
                  </div>
                  <div style={{ flex:1, border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, overflow:"hidden", background:"rgba(255,255,255,0.02)" }}>
                    <GrowthChart
                      portfolioData={scaledPortfolioData}
                      benchmarkData={scaledBenchmarkData}
                      benchmarkName="S&P 500"
                      portfolioLabel={label}
                      drawdownData={scaledDrawdownData.length > 0 ? scaledDrawdownData : undefined}
                      ticker={ticker ?? undefined}
                      portfolioColor={lineColor ?? color}
                      candleUpColor={candleUp}
                      candleDownColor={candleDown}
                      chartMode={chartViewMode}
                      onChartModeChange={setChartViewMode}
                      dark={true}
                      priceMode={!!ticker}
                      hideDrawdown={true}
                      dailyChangePct={currentPrice?.change ?? null}
                      openPrice={quote?.open ?? null}
                      onPeriodChange={setActivePeriod}
                      onVisibleRangeChange={(from, to) => setVisibleRange(from && to ? { from: new Date(from*1000).toISOString().slice(0,10), to: new Date(to*1000).toISOString().slice(0,10) } : null)}
                      onCrosshairMove={(t) => setCrosshairTime(t)}
                      onAdaptiveData={setChartPriceData}
                    />
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
