"use client";
import { useState, useEffect, useMemo, useRef, Suspense } from "react";
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

// ── News AI scoring ──────────────────────────────────────────────────────────
type NewsImpact = "high" | "medium" | "low";
type NewsEventType = "Résultats" | "IA" | "Dividende" | "Régulation" | "Fusion" | "Analyse" | "Bourse" | "Direction" | "Marché";

function scoreNews(title: string): { impact: NewsImpact; type: NewsEventType; readMin: number } {
  const t = title.toLowerCase();
  let type: NewsEventType = "Marché";
  if (/earnings|revenue|profit|q[1-4]\b|eps\b|quarterly|annual|résultat|chiffre d.affaire|bénéfice/i.test(title)) type = "Résultats";
  else if (/\bai\b|artificial intelligence|machine learning|chatgpt|\bgpt\b|\bllm\b|openai|gemini|mistral/i.test(title)) type = "IA";
  else if (/dividend|yield|dividende|payout/i.test(title)) type = "Dividende";
  else if (/\bsec\b|\bftc\b|regulat|fine\b|lawsuit|penalty|antitrust|sanction|amende|probe/i.test(title)) type = "Régulation";
  else if (/merger|acqui|takeover|\bdeal\b|fusion|buys?\b|purchased?/i.test(title)) type = "Fusion";
  else if (/analyst|upgrade|downgrade|price target|buy rating|sell rating|outperform|underperform/i.test(title)) type = "Analyse";
  else if (/\bipo\b|offering|stock split|buyback|repurchase/i.test(title)) type = "Bourse";
  else if (/\bceo\b|\bcfo\b|\bcto\b|executive|appoint|resign|leadership/i.test(title)) type = "Direction";

  let score = 0;
  ["miss","beat","surge","plunge","crash","record","bankruptcy","default","fine","merger","acqui","billion","layoff","downgrade","upgrade","warning","recall","investigation","fraud","guidance cut","profit warning","job cut"].forEach(k => { if (t.includes(k)) score += 2; });
  ["growth","expansion","partnership","launch","announces","targets","dividend","analyst","forecast","results","report"].forEach(k => { if (t.includes(k)) score += 1; });
  if (type === "Résultats" || type === "Fusion") score += 2;
  if (type === "Régulation") score += 1;

  const impact: NewsImpact = score >= 4 ? "high" : score >= 1 ? "medium" : "low";
  const readMin = Math.max(1, Math.min(5, Math.round(title.split(" ").length * 7 / 60)));
  return { impact, type, readMin };
}

const IMPACT_CONFIG: Record<NewsImpact, { label: string; color: string; bg: string; dot: string }> = {
  high:   { label: "Impact élevé",  color: "#f87171", bg: "rgba(239,68,68,0.12)",   dot: "#ef4444" },
  medium: { label: "Impact moyen",  color: "#fb923c", bg: "rgba(249,115,22,0.12)",  dot: "#f97316" },
  low:    { label: "Impact faible", color: "#4ade80", bg: "rgba(34,197,94,0.12)",   dot: "#22c55e" },
};

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
  const [priceFlash, setPriceFlash] = useState<"up"|"down"|null>(null);
  const prevPriceRef = useRef<number|null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [investedAmount, setInvestedAmount] = useState(10000);
  const [wsLive, setWsLive] = useState(false);

  useEffect(() => {
    if (currentPrice == null) return;
    const prev = prevPriceRef.current;
    prevPriceRef.current = currentPrice.price;
    if (prev !== null && currentPrice.price !== prev) {
      setPriceFlash(currentPrice.price > prev ? "up" : "down");
      const t = setTimeout(() => setPriceFlash(null), 900);
      return () => clearTimeout(t);
    }
  }, [currentPrice?.price]); // eslint-disable-line react-hooks/exhaustive-deps

  const [quote, setQuote] = useState<{day_high?:number;day_low?:number;open?:number;prev_close?:number;year_high?:number;year_low?:number;volume?:number;avg_volume?:number;market_cap?:number;currency?:string;global_rank?:number}|null>(null);
  const [isFavorite, setIsFavorite] = useState(() => {
    try { return JSON.parse(localStorage.getItem("favorites") ?? "[]").includes(ticker); } catch { return false; }
  });
  const toggleFavorite = () => {
    setIsFavorite((prev: boolean) => {
      const next = !prev;
      try {
        const list: string[] = JSON.parse(localStorage.getItem("favorites") ?? "[]");
        const deduped = Array.from(new Set([...list, ticker as string])) as string[];
        const updated = next ? deduped : list.filter((t: string) => t !== ticker);
        localStorage.setItem("favorites", JSON.stringify(updated));
      } catch {}
      return next;
    });
  };
  const [subOpen, setSubOpen] = useState(false);
  const [subTab, setSubTab] = useState<SubTab>("drawdown");
  const [activePeriod, setActivePeriod] = useState("Max");
  const [visibleRange, setVisibleRange]   = useState<{from:string;to:string}|null>(null);
  const [syncView, setSyncView] = useState(false);
  const [statsTooltip, setStatsTooltip] = useState<string|null>(null);
  const [activeInterval, setActiveInterval] = useState<string>("1d");
  const [chartPriceData, setChartPriceData] = useState<{date:string;value:number;high?:number;low?:number}[]>([]);
  const [showCustom,    setShowCustom]    = useState(false);
  const [copied,        setCopied]        = useState(false);
  const [chartViewMode, setChartViewMode] = useState<"line" | "candle">("line");
  const [extractedColor, setExtractedColor] = useState<string | null>(null);
  const [bmExtractedColor, setBmExtractedColor] = useState<string | null>(null);
  const [displayCurrency,   setDisplayCurrency]   = useState<string | null>(null);
  const [showCurrencyMenu,  setShowCurrencyMenu]  = useState(false);
  const [fxRates,           setFxRates]           = useState<Record<string, number>>({ USD: 1 });
  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const [sidebarTab,     setSidebarTab]     = useState<"news"|"similar"|"ai">("news");
  const [similar,        setSimilar]        = useState<{ticker:string;sector?:string;country?:string;type?:string;price:number;change:number}[]>([]);
  const [similarBy,      setSimilarBy]      = useState<"sector"|"geography"|"class"|"marketcap">("sector");
  const [news,           setNews]           = useState<{title:string;publisher:string;link:string;published_at:string|number;thumbnail?:string}[]>([]);
  const [newsLoading,    setNewsLoading]    = useState(false);
  const [newsSortBy,      setNewsSortBy]      = useState<"recent" | "impact">("recent");
  const [customBmTicker,  setCustomBmTicker]  = useState<string | null>(null);
  const [customBmName,    setCustomBmName]    = useState<string>("");
  const [customBmType,    setCustomBmType]    = useState<string>("EQUITY");
  const [rawCustomBmData, setRawCustomBmData] = useState<{date:string;value:number}[]>([]);

  const [customBmLoading, setCustomBmLoading] = useState(false);
  const [bmCurrentPrice,  setBmCurrentPrice]  = useState<{price:number;change:number}|null>(null);
  const [bmPriceFlash, setBmPriceFlash] = useState<"up"|"down"|null>(null);
  const prevBmPriceRef = useRef<number|null>(null);
  useEffect(() => {
    if (bmCurrentPrice == null) return;
    const prev = prevBmPriceRef.current;
    prevBmPriceRef.current = bmCurrentPrice.price;
    if (prev !== null && bmCurrentPrice.price !== prev) {
      setBmPriceFlash(bmCurrentPrice.price > prev ? "up" : "down");
      const t = setTimeout(() => setBmPriceFlash(null), 900);
      return () => clearTimeout(t);
    }
  }, [bmCurrentPrice?.price]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showBmSearch,    setShowBmSearch]    = useState(false);
  const [bmQuery,         setBmQuery]         = useState("");
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
  const activeBmColor = customBmTicker
    ? (BRAND_COLORS[customBmTicker] ?? bmExtractedColor ?? "#f59e0b")
    : "#f59e0b";
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

  // WebSocket Binance pour crypto — throttlé à 1 setState/2s pour éviter les re-renders continus
  useEffect(() => {
    if (!ticker || !isCrypto) return;
    const symbol = ticker.replace(/-USD$/, "USDT").toLowerCase();
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol}@ticker`);
    ws.onopen = () => setWsLive(true);
    ws.onclose = () => setWsLive(false);
    ws.onerror = () => { setWsLive(false); ws.close(); };
    let lastUpdate = 0;
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const price = parseFloat(data.c);
        const changePct = parseFloat(data.P);
        const now = Date.now();
        if (price > 0 && now - lastUpdate >= 2000) {
          lastUpdate = now;
          setCurrentPrice({ price, change: changePct });
        }
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

  // portfolioData est stable (ne dépend plus de currentPrice) — la mise à jour live se fait
  // via le prop livePrice passé à GrowthChart pour éviter 10k re-créations d'objets/tick WebSocket.
  const portfolioData = useMemo(() => rawPortfolioGrowth, [rawPortfolioGrowth]);

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

  // Réinitialiser la couleur extraite quand on change de benchmark
  useEffect(() => { setBmExtractedColor(null); }, [customBmTicker]);

  // Prix live du benchmark — WebSocket Binance pour crypto, polling 60s pour actions/ETF
  const isBmCrypto = customBmType === "CRYPTOCURRENCY" || (customBmTicker?.endsWith("-USD") ?? false);

  useEffect(() => {
    if (!customBmTicker) { setBmCurrentPrice(null); return; }
    // fetch initial dans tous les cas
    fetch(`${API_URL}/api/v1/prices?tickers=${encodeURIComponent(customBmTicker)}`)
      .then(r => r.json())
      .then((d: any[]) => { if (Array.isArray(d) && d.length > 0) setBmCurrentPrice({ price: d[0].price, change: d[0].change }); })
      .catch(() => {});
  }, [customBmTicker]);

  useEffect(() => {
    if (!customBmTicker || !isBmCrypto) return;
    const symbol = customBmTicker.replace(/-USD$/, "USDT").toLowerCase();
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol}@ticker`);
    let lastUpdate = 0;
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const price = parseFloat(data.c);
        const changePct = parseFloat(data.P);
        const now = Date.now();
        if (price > 0 && now - lastUpdate >= 2000) {
          lastUpdate = now;
          setBmCurrentPrice({ price, change: changePct });
        }
      } catch {}
    };
    ws.onerror = () => ws.close();
    return () => { if (ws.readyState === WebSocket.OPEN) ws.close(); };
  }, [customBmTicker, isBmCrypto]);

  useEffect(() => {
    if (!customBmTicker || isBmCrypto) return;
    const interval = setInterval(() => {
      fetch(`${API_URL}/api/v1/prices?tickers=${encodeURIComponent(customBmTicker)}`)
        .then(r => r.json())
        .then((d: any[]) => { if (Array.isArray(d) && d.length > 0) setBmCurrentPrice({ price: d[0].price, change: d[0].change }); })
        .catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, [customBmTicker, isBmCrypto]);

  // Custom benchmark fetch
  useEffect(() => {
    if (!customBmTicker) { setRawCustomBmData([]); return; }
    setCustomBmLoading(true);
    fetch(`${API_URL}/api/v1/intraday?ticker=${encodeURIComponent(customBmTicker)}&period=max&interval=1d`)
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) { setRawCustomBmData([]); return; }
        const prices = data
          .filter((p: any) => p.date && (p.close ?? p.value) > 0)
          .map((p: any) => ({ date: String(p.date).slice(0, 10), value: p.close ?? p.value }));
        setRawCustomBmData(prices);
      })
      .catch(() => setRawCustomBmData([]))
      .finally(() => setCustomBmLoading(false));
  }, [customBmTicker]);



  const customBmData = useMemo(() => {
    if (!rawCustomBmData.length || !portfolioData.length) return rawCustomBmData;
    const firstPrice = portfolioData[0]?.value;
    const firstBmVal = rawCustomBmData[0]?.value;
    if (!firstPrice || !firstBmVal) return rawCustomBmData;
    return rawCustomBmData.map(p => ({
      date: p.date,
      value: Math.round(p.value / firstBmVal * firstPrice * 10000) / 10000,
    }));
  }, [rawCustomBmData, portfolioData]);

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
  const activeBmData = customBmTicker && customBmData.length ? customBmData : [];
  // Perf calculée depuis le début de l'historique du ticker principal (pas depuis l'IPO du benchmark)
  const bmPerf = useMemo(() => {
    if (!rawCustomBmData.length) return null;
    const dotStart = scaledPortfolioData[0]?.date?.slice(0, 10);
    const pts = dotStart ? rawCustomBmData.filter(p => p.date >= dotStart) : rawCustomBmData;
    if (pts.length < 2) return null;
    const first = pts[0].value;
    const last  = pts[pts.length - 1].value;
    return first > 0 ? (last - first) / first * 100 : null;
  }, [rawCustomBmData, scaledPortfolioData]);

  // Stats comparatif (365j) pour la vue synchronisée
  const syncStats = useMemo(() => {
    if (!rawCustomBmData.length || !chartPriceData.length) return null;
    const PERIOD_SECS: Record<string,number|null> = { "24h":86400,"1S":7*86400,"1M":30*86400,"3M":91*86400,"6M":183*86400,"1A":365*86400,"3A":1095*86400,"Max":null };
    const statSecs = PERIOD_SECS[activePeriod] ?? null;
    const cutStr = statSecs ? new Date(Date.now() - statSecs * 1000).toISOString().slice(0, 10) : null;
    const aMap = new Map(chartPriceData.filter(p => !cutStr || p.date >= cutStr).map(p => [p.date.slice(0,10), p.value]));
    const bMap = new Map(rawCustomBmData.filter(p => !cutStr || p.date >= cutStr).map(p => [p.date.slice(0,10), p.value]));
    const dates = Array.from(aMap.keys()).filter(d => bMap.has(d)).sort();
    if (dates.length < 5) return null;
    // daily returns
    const ra: number[] = [], rb: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      const pa0 = aMap.get(dates[i-1])!, pa1 = aMap.get(dates[i])!;
      const pb0 = bMap.get(dates[i-1])!, pb1 = bMap.get(dates[i])!;
      ra.push((pa1 - pa0) / pa0);
      rb.push((pb1 - pb0) / pb0);
    }
    const n = ra.length;
    const meanA = ra.reduce((s, x) => s + x, 0) / n;
    const meanB = rb.reduce((s, x) => s + x, 0) / n;
    const cov = ra.reduce((s, x, i) => s + (x - meanA) * (rb[i] - meanB), 0) / n;
    const varA = ra.reduce((s, x) => s + (x - meanA) ** 2, 0) / n;
    const varB = rb.reduce((s, x) => s + (x - meanB) ** 2, 0) / n;
    const corr = varA > 0 && varB > 0 ? cov / Math.sqrt(varA * varB) : 0;
    const beta = varB > 0 ? cov / varB : 0;
    const rf = 0.035 / 252; // taux sans risque journalier (~3.5%/an)
    const alpha = (meanA - (rf + beta * (meanB - rf))) * 252 * 100; // alpha annualisé en %
    const sameDir = ra.filter((r, i) => Math.sign(r) === Math.sign(rb[i])).length;
    return { corr: +corr.toFixed(2), beta: +beta.toFixed(2), alpha: +alpha.toFixed(2), sameDir: Math.round(sameDir / n * 100), sameDirN: sameDir, totalN: n };
  }, [rawCustomBmData, chartPriceData, activePeriod]);

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

  // Timeline commune : miroir exact de la range visible du graphique du haut

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
    <div data-novac-page style={{ height:"100vh", background:"var(--novac-bg, #041124)", color:"var(--novac-text-primary, #F8F9FC)", fontFamily:"-apple-system,BlinkMacSystemFont,sans-serif", display:"flex", flexDirection:"column", position:"relative", overflow:"hidden" }}>
      {/* Ambient glow — positionné derrière la carte actif (haut-gauche), ellipse large et aplatie */}
      <div style={{ position:"relative", zIndex:1, display:"flex", flexDirection:"column", flex:1, minHeight:0, paddingTop:48 }}>

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
                @keyframes price-flash-up{0%{color:#4ade80}80%{color:#4ade80}100%{color:#F8F9FC}}
                @keyframes price-flash-dn{0%{color:#ef4444}80%{color:#ef4444}100%{color:#F8F9FC}}
                @keyframes hdr-pulse{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.7)}60%{box-shadow:0 0 0 5px rgba(34,197,94,0)}}
                @keyframes hdr-pulse-live{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.9)}50%{box-shadow:0 0 0 6px rgba(34,197,94,0)}}
                .chart-action-btn{transition:all 0.18s cubic-bezier(0.34,1.56,0.64,1)!important}
                .chart-action-btn:hover{transform:scale(1.08) translateY(-0.5px);filter:brightness(1.15)}
                .chart-action-btn:active{transform:scale(0.94)!important;transition-duration:0.08s!important}
              `}</style>
              <div style={{ display:"flex", flexDirection:"column", padding:"11px 20px 9px", borderTop:"1px solid rgba(255,255,255,0.06)", borderBottom:"none", flexShrink:0, gap:8, marginTop:10 }}>

                {/* ── Row 1: back · [logo + compact identity+price] · NOVAC ── */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:16 }}>

                  <div style={{ display:"flex", alignItems:"center", gap:13, minWidth:0 }}>
                    {ticker && (
                      <TileCard ticker={ticker} style={{ display:"flex", alignItems:"center", gap:0, padding:"14px 16px" }}>
                        {/* Logo */}
                        <AssetLogo
                          ticker={ticker} type={assetInfo?.type} size={56} radius={13}
                          fallbackBg={tc.bg} fallbackBorder={tc.border} fallbackTextColor={tc.text}
                          onColorExtracted={c => { if (!BRAND_COLORS[ticker]) setExtractedColor(c); }}
                          bare
                        />
                        {/* Identity */}
                        <div style={{ marginLeft:14, display:"flex", flexDirection:"column", justifyContent:"center", gap:6 }}>
                          <span style={{ fontSize:18, fontWeight:800, color:"#F8F9FC", letterSpacing:"-0.03em", lineHeight:1 }}>{displayTicker}</span>
                          <span style={{ fontSize:10, fontWeight:600, color:"rgba(255,255,255,0.85)", lineHeight:1 }}>{assetInfo?.name || ticker}</span>
                          <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                            {assetInfo?.type && assetInfo.type !== "INDEX" && (() => {
                              const col = BRAND_COLORS[ticker as string] ?? extractedColor ?? "#5B8DEF";
                              return (
                                <span style={{ fontSize:9, fontWeight:700, color:col, background:`${col}22`, borderRadius:20, padding:"2px 7px", letterSpacing:"0.02em" }}>
                                  {({"EQUITY":"Action","ETF":"ETF","CRYPTOCURRENCY":"Crypto"} as Record<string,string>)[assetInfo.type] ?? assetInfo.type}
                                </span>
                              );
                            })()}
                            {quote?.global_rank != null && (
                              <span style={{ fontSize:9, fontWeight:600, color: BRAND_COLORS[ticker as string] ?? extractedColor ?? "#5B8DEF" }}>#{quote.global_rank}</span>
                            )}
                            {assetInfo?.exchange && !isCrypto && (
                              <span style={{ fontSize:9, fontWeight:400, color:"rgba(255,255,255,0.38)" }}>{_EXCH[assetInfo.exchange] ?? assetInfo.exchange}</span>
                            )}
                          </div>
                        </div>
                        {/* Divider */}
                        <div style={{ width:1, height:44, background:"rgba(255,255,255,0.1)", margin:"0 16px", flexShrink:0 }}/>
                        {/* Price */}
                        <div style={{ display:"flex", flexDirection:"column", justifyContent:"space-between", alignSelf:"stretch", gap:0 }}>
                          <div style={{ display:"flex", alignItems:"baseline", gap:5 }}>
                            <span style={{ fontSize:18, fontWeight:700, color:"#F8F9FC", letterSpacing:"-0.04em", fontVariantNumeric:"tabular-nums", lineHeight:1, animation: priceFlash === "up" ? "price-flash-up 0.9s ease forwards" : priceFlash === "down" ? "price-flash-dn 0.9s ease forwards" : "none" }}>
                              {currentPrice ? fmtNum(currentPrice.price) : "—"}
                            </span>
                            {quote?.currency && <span style={{ fontSize:11, fontWeight:500, color:"rgba(255,255,255,0.4)", letterSpacing:"0.05em" }}>{quote.currency}</span>}
                          </div>
                          {currentPrice && (
                            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                              <span style={{ fontSize:11, fontWeight:600, color: up ? "#4ade80" : "#ef4444", fontVariantNumeric:"tabular-nums" }}>
                                {up ? "▲" : "▼"} {up ? "+" : ""}{fmtNum(Math.abs(quote?.prev_close ? currentPrice.price - quote.prev_close : currentPrice.price * currentPrice.change / 100))}
                              </span>
                              <span style={{ fontSize:10, fontWeight:700, color: up ? "#4ade80" : "#ef4444", background: up ? "rgba(34,197,94,0.28)" : "rgba(239,68,68,0.28)", borderRadius:20, padding:"1px 7px", fontVariantNumeric:"tabular-nums" }}>
                                {up ? "+" : "–"}{Math.abs(currentPrice.change).toFixed(2)}%
                              </span>
                            </div>
                          )}
                        </div>
                        {/* Divider */}
                        <div style={{ width:1, height:44, background:"rgba(255,255,255,0.1)", margin:"0 16px", flexShrink:0 }}/>
                        {/* Status + last close */}
                        <div style={{ display:"flex", flexDirection:"column", justifyContent:"space-between", alignSelf:"stretch", gap:0 }}>
                          {!isCrypto ? (
                            <div style={{ display:"flex", alignItems:"center", gap:4, background:"rgba(255,255,255,0.07)", borderRadius:20, padding:"2px 8px" }}>
                              <span style={{ width:5, height:5, borderRadius:"50%", background: isOpen ? "#22c55e" : "rgba(255,255,255,0.35)", flexShrink:0, animation: isOpen ? "hdr-pulse 2s ease-in-out infinite" : "none" }}/>
                              <span style={{ fontSize:9, fontWeight:600, color: isOpen ? "#4ade80" : "rgba(255,255,255,0.55)", letterSpacing:"0.02em" }}>
                                {isOpen ? "Marché ouvert" : "Marché fermé"}
                              </span>
                            </div>
                          ) : (
                            <div style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(34,197,94,0.1)", borderRadius:7, padding:"4px 9px" }}>
                              <span style={{ width:6, height:6, borderRadius:"50%", background:"#22c55e", flexShrink:0, animation:"hdr-pulse-live 1.5s ease-in-out infinite" }}/>
                              <span style={{ fontSize:11, fontWeight:600, color:"#4ade80", letterSpacing:"0.02em" }}>LIVE</span>
                            </div>
                          )}
                          {!isOpen && !isCrypto && (() => {
                            const d = new Date(now);
                            const wd = d.getDay();
                            if (wd === 0) d.setDate(d.getDate() - 2);
                            else if (wd === 6) d.setDate(d.getDate() - 1);
                            return (
                              <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
                                <span style={{ fontSize:9, color:"rgba(255,255,255,0.32)", letterSpacing:"0.02em" }}>Dernière clôture</span>
                                <span style={{ fontSize:10, fontWeight:500, color:"rgba(255,255,255,0.7)" }}>
                                  {d.toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"})}
                                </span>
                              </div>
                            );
                          })()}
                          {isOpen && <span style={{ fontSize:9, color:"rgba(255,255,255,0.3)", letterSpacing:"0.04em" }}>↻ 60s</span>}
                        </div>
                        {/* Fixed-width spacer before star */}
                        <div style={{ width:16, flexShrink:0 }}/>
                        {/* Star / favorite */}
                        <button
                          onClick={toggleFavorite}
                          style={{ flexShrink:0, alignSelf:"center", width:28, height:28, borderRadius:7, border:"1px solid rgba(255,255,255,0.12)", background:"rgba(255,255,255,0.06)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", transition:"all 0.18s" }}
                          onMouseEnter={e => (e.currentTarget.style.background="rgba(255,255,255,0.12)")}
                          onMouseLeave={e => (e.currentTarget.style.background="rgba(255,255,255,0.06)")}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill={isFavorite ? "#facc15" : "none"} stroke={isFavorite ? "#facc15" : "rgba(255,255,255,0.5)"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                          </svg>
                        </button>
                      </TileCard>
                    )}
                    {ticker && (() => {
                      const BM_PRESETS = [
                        { ticker:"^GSPC",     name:"S&P 500",        type:"INDEX" },
                        { ticker:"^IXIC",     name:"Nasdaq 100",     type:"INDEX" },
                        { ticker:"^DJI",      name:"Dow Jones",      type:"INDEX" },
                        { ticker:"^STOXX50E", name:"Euro Stoxx 50",  type:"INDEX" },
                        { ticker:"BTC-USD",   name:"Bitcoin",        type:"CRYPTOCURRENCY" },
                        { ticker:"GC=F",      name:"Or (Gold)",      type:"INDEX" },
                      ];
                      const bmResults = bmQuery.trim().length === 0
                        ? TRENDING.slice(0, 10)
                        : TRENDING.filter(a =>
                            a.ticker.toLowerCase().includes(bmQuery.toLowerCase()) ||
                            a.name.toLowerCase().includes(bmQuery.toLowerCase())
                          ).slice(0, 10);

                      return (
                        <div style={{ position:"relative" }}>
                          {/* Tuile benchmark — ghost si rien sélectionné, pleine sinon */}
                          {customBmTicker ? (() => {
                            const bmInfo = TRENDING.find(a => a.ticker === customBmTicker);
                            const bmDisplayTicker = customBmTicker.replace(/-USD$/,"").replace(/[0-9]+$/,"").replace(/\.[A-Z]{1,3}$/,"").replace(/^\^/,"");
                            const bmExchH = bmInfo?.exchange ? (EXCH_HOURS[bmInfo.exchange] ?? EXCH_HOURS.NMS) : EXCH_HOURS.NMS;
                            const bmParts = new Intl.DateTimeFormat("en-US",{timeZone:bmExchH.tz,weekday:"short",hour:"numeric",minute:"2-digit",hour12:false}).formatToParts(now);
                            const bmWd = bmParts.find(p=>p.type==="weekday")?.value??"";
                            const bmH  = parseInt(bmParts.find(p=>p.type==="hour")?.value??"0");
                            const bmM  = parseInt(bmParts.find(p=>p.type==="minute")?.value??"0");
                            const bmIsOpen = bmWd!=="Sat" && bmWd!=="Sun" && (bmH*60+bmM)>=bmExchH.o && (bmH*60+bmM)<bmExchH.c;
                            const bmUp = bmCurrentPrice ? bmCurrentPrice.change >= 0 : true;
                            return (
                            <TileCard ticker={customBmTicker} onClick={() => setShowBmSearch(s => !s)}
                              style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 9px", cursor:"pointer" }}>
                              <AssetLogo ticker={customBmTicker} type={customBmType} size={28} radius={7}
                                fallbackBg="rgba(255,255,255,0.07)" fallbackBorder="rgba(255,255,255,0.12)" fallbackTextColor="rgba(255,255,255,0.55)" bare
                                onColorExtracted={c => { if (!BRAND_COLORS[customBmTicker]) setBmExtractedColor(c); }}/>
                              <div>
                                {/* Ligne 1 — ticker | prix | variation (miroir carte principale, échelle réduite) */}
                                <div style={{ display:"flex", alignItems:"baseline", gap:6, flexWrap:"nowrap" as const }}>
                                  <span style={{ fontSize:13, fontWeight:800, color:"#F8F9FC", letterSpacing:"-0.03em", lineHeight:1 }}>{bmDisplayTicker}</span>
                                  {bmCurrentPrice && <>
                                    <span style={{ width:1, height:10, background:"rgba(255,255,255,0.3)", flexShrink:0, alignSelf:"center" }}/>
                                    <span style={{ fontSize:13, fontWeight:700, letterSpacing:"-0.03em", fontVariantNumeric:"tabular-nums" as const, lineHeight:1, color:"#F8F9FC", animation: bmPriceFlash === "up" ? "price-flash-up 0.9s ease forwards" : bmPriceFlash === "down" ? "price-flash-dn 0.9s ease forwards" : "none" }}>
                                      {fmtNum(bmCurrentPrice.price)}
                                    </span>
                                    <span style={{ fontSize:9, fontWeight:600, color: bmUp ? "#4ade80" : "#ef4444", letterSpacing:"-0.01em", fontVariantNumeric:"tabular-nums" as const, lineHeight:1 }}>
                                      {bmUp ? "▲" : "▼"}{" "}
                                      {fmtNum(Math.abs(bmCurrentPrice.price * bmCurrentPrice.change / 100))}{" "}
                                      {bmUp ? "+" : "–"}{Math.abs(bmCurrentPrice.change).toFixed(2)}%
                                    </span>
                                  </>}
                                </div>
                                {/* Ligne 2 — nom · rank · statut marché */}
                                <div style={{ display:"flex", alignItems:"center", gap:4, marginTop:3 }}>
                                  <span style={{ fontSize:9, color:"#FFFFFF", lineHeight:1 }}>
                                    {customBmName}
                                  </span>
                                  <span style={{ color:"#FFFFFF", fontSize:9 }}>·</span>
                                  {customBmType !== "CRYPTOCURRENCY" ? (
                                    <span style={{ display:"flex", alignItems:"center", gap:3, flexShrink:0 }}>
                                      <span style={{ width:4, height:4, borderRadius:"50%", display:"inline-block", background: bmIsOpen ? "#22c55e" : "#FFFFFF", flexShrink:0 }}/>
                                      <span style={{ fontSize:9, letterSpacing:"0.04em", color: bmIsOpen ? "#4ade80" : "#FFFFFF" }}>
                                        {bmIsOpen ? "Marché ouvert" : "Marché fermé"}
                                      </span>
                                    </span>
                                  ) : (
                                    <span style={{ display:"flex", alignItems:"center", gap:3, flexShrink:0 }}>
                                      <span style={{ width:4, height:4, borderRadius:"50%", background:"#22c55e", display:"inline-block" }}/>
                                      <span style={{ fontSize:9, color:"#4ade80", letterSpacing:"0.04em" }}>LIVE</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                              {/* × remove */}
                              <div onClick={e => { e.stopPropagation(); setCustomBmTicker(null); setCustomBmName(""); setRawCustomBmData([]); setBmCurrentPrice(null); setSyncView(false); }}
                                onMouseEnter={e => { e.currentTarget.style.background="rgba(255,255,255,0.18)"; (e.currentTarget.querySelectorAll("line") as NodeListOf<SVGLineElement>).forEach(l => l.style.stroke="rgba(255,255,255,0.9)"); }}
                                onMouseLeave={e => { e.currentTarget.style.background="rgba(255,255,255,0.08)"; (e.currentTarget.querySelectorAll("line") as NodeListOf<SVGLineElement>).forEach(l => l.style.stroke="rgba(255,255,255,0.55)"); }}
                                style={{ marginLeft:"auto", width:16, height:16, borderRadius:4, background:"rgba(255,255,255,0.08)", flexShrink:0, position:"relative", transition:"background 0.15s", cursor:"pointer" }}>
                                <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%" }} viewBox="0 0 16 16" fill="none">
                                  <line x1="5" y1="5" x2="11" y2="11" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" strokeLinecap="round"/>
                                  <line x1="11" y1="5" x2="5" y2="11" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" strokeLinecap="round"/>
                                </svg>
                              </div>
                            </TileCard>
                            );
                          })() : (
                            /* Ghost tile */
                            <div onClick={() => setShowBmSearch(s => !s)} style={{
                              display:"flex", alignItems:"center", gap:8, padding:"8px 12px", borderRadius:12, flexShrink:0,
                              border:"1px dashed rgba(255,255,255,0.16)", cursor:"pointer",
                              background:"rgba(255,255,255,0.03)", backdropFilter:"blur(8px)",
                              transition:"all 0.18s", height:"100%", boxSizing:"border-box",
                            }}
                              onMouseEnter={e => { e.currentTarget.style.background="rgba(255,255,255,0.07)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.28)"; }}
                              onMouseLeave={e => { e.currentTarget.style.background="rgba(255,255,255,0.03)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.16)"; }}>
                              <div style={{ width:28, height:28, borderRadius:7, border:"1px solid rgba(255,255,255,0.15)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                                <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="rgba(255,255,255,0.40)" strokeWidth="1.5" strokeLinecap="round"/></svg>
                              </div>
                              <div>
                                <div style={{ fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.50)", lineHeight:1 }}>Comparer</div>
                                <div style={{ fontSize:9, color:"rgba(255,255,255,0.25)", marginTop:2, lineHeight:1 }}>ajouter un actif</div>
                              </div>
                            </div>
                          )}

                          {/* Search panel */}
                          {showBmSearch && (
                            <>
                              <div style={{ position:"fixed", inset:0, zIndex:40 }} onClick={() => { setShowBmSearch(false); setBmQuery(""); }}/>
                              <div style={{ position:"absolute", top:"calc(100% + 8px)", left:0, zIndex:50,
                                background:"rgba(5,12,30,0.97)", border:"1px solid rgba(255,255,255,0.10)",
                                borderRadius:14, padding:"12px 10px", backdropFilter:"blur(24px)",
                                boxShadow:"0 12px 40px rgba(0,0,0,0.6)", width:260 }}>
                                {/* Search input */}
                                <div style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.10)", borderRadius:9, padding:"6px 10px", marginBottom:10 }}>
                                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round"><circle cx="6.5" cy="6.5" r="4.5"/><path d="M10.5 10.5l3 3"/></svg>
                                  <input
                                    autoFocus
                                    value={bmQuery}
                                    onChange={e => setBmQuery(e.target.value)}
                                    placeholder="Chercher un actif…"
                                    style={{ flex:1, background:"none", border:"none", outline:"none", fontSize:11, color:"#F8F9FC", caretColor:"#5B8DEF" }}
                                    onKeyDown={e => e.key === "Escape" && (setShowBmSearch(false), setBmQuery(""))}
                                  />
                                  {bmQuery && <button onClick={() => setBmQuery("")} style={{ background:"none", border:"none", cursor:"pointer", color:"rgba(255,255,255,0.30)", fontSize:14, padding:0, lineHeight:1 }}>×</button>}
                                </div>

                                {/* Presets — only when no query */}
                                {!bmQuery.trim() && (
                                  <div style={{ marginBottom:8 }}>
                                    <div style={{ fontSize:8.5, letterSpacing:"0.10em", color:"rgba(255,255,255,0.20)", marginBottom:6, paddingLeft:2 }}>INDICES & CRYPTO</div>
                                    <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
                                      {BM_PRESETS.map(bm => (
                                        <div key={bm.ticker} onClick={() => { setCustomBmTicker(bm.ticker); setCustomBmName(bm.name); setCustomBmType(bm.type); setShowBmSearch(false); setBmQuery(""); setSyncView(true); }}
                                          style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 8px", borderRadius:8, cursor:"pointer", transition:"background 0.10s" }}
                                          onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,0.07)"}
                                          onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                                          <AssetLogo ticker={bm.ticker} type={bm.type} size={24} radius={6}
                                            fallbackBg="rgba(255,255,255,0.08)" fallbackBorder="rgba(255,255,255,0.12)" fallbackTextColor="rgba(255,255,255,0.50)"/>
                                          <div>
                                            <div style={{ fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.85)" }}>{bm.name}</div>
                                            <div style={{ fontSize:9, color:"rgba(255,255,255,0.30)" }}>{bm.ticker}</div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                    <div style={{ margin:"8px 0", borderTop:"1px solid rgba(255,255,255,0.06)" }}/>
                                    <div style={{ fontSize:8.5, letterSpacing:"0.10em", color:"rgba(255,255,255,0.20)", marginBottom:6, paddingLeft:2 }}>POPULAIRES</div>
                                  </div>
                                )}

                                {/* Results list */}
                                <div style={{ display:"flex", flexDirection:"column", gap:1, maxHeight:220, overflowY:"auto" }}>
                                  {bmResults.map(asset => (
                                    <div key={asset.ticker} onClick={() => { setCustomBmTicker(asset.ticker); setCustomBmName(asset.name); setCustomBmType(asset.type); setShowBmSearch(false); setBmQuery(""); setSyncView(true); }}
                                      style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 8px", borderRadius:8, cursor:"pointer", transition:"background 0.10s" }}
                                      onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,0.07)"}
                                      onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                                      <AssetLogo ticker={asset.ticker} type={asset.type} size={24} radius={6}
                                        fallbackBg="rgba(255,255,255,0.08)" fallbackBorder="rgba(255,255,255,0.12)" fallbackTextColor="rgba(255,255,255,0.50)"/>
                                      <div style={{ flex:1, minWidth:0 }}>
                                        <div style={{ fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.85)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{asset.ticker}</div>
                                        <div style={{ fontSize:9, color:"rgba(255,255,255,0.30)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{asset.name}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })()}

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
              <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", minHeight:0 }}>
              {/* Main chart */}
              <div style={{ border:"1px solid rgba(255,255,255,0.06)", borderRadius:"16px", padding:"14px 18px 10px", flex:"3 1 0", minHeight:0, display:"flex", flexDirection:"column", position:"relative", overflow:"hidden", background:"rgba(255,255,255,0.02)" }}>
                {/* Radial glow derrière le graphique */}
                <div style={{ position:"absolute", inset:0, pointerEvents:"none", zIndex:0, background:`radial-gradient(ellipse 75% 45% at 50% 75%, ${(lineColor??color)}1A 0%, transparent 70%), radial-gradient(ellipse 40% 30% at 15% 25%, ${(lineColor??color)}0D 0%, transparent 60%)` }}/>
                <GrowthChart
                  portfolioData={scaledPortfolioData}
                  benchmarkData={syncView ? [] : activeBmData}
                  benchmarkRawData={syncView ? undefined : (customBmTicker ? rawCustomBmData : undefined)}
                  benchmarkName={customBmTicker ? customBmName : "S&P 500"}
                  benchmarkColor={activeBmColor}
                  benchmarkTicker={customBmTicker ?? undefined}
                  livePrice={currentPrice?.price}
                  isCrypto={isCrypto}
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
                  onVisibleRangeChange={(from, to) => {
                    if (!from || !to) { setVisibleRange(null); return; }
                    const fd = new Date(from*1000); const td = new Date(to*1000);
                    if (!isNaN(fd.getTime()) && !isNaN(td.getTime())) setVisibleRange({ from: fd.toISOString().slice(0,10), to: td.toISOString().slice(0,10) });
                  }}
                  onIntervalChange={setActiveInterval}
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
                    <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                      {/* Fullscreen */}
                      {ticker && (
                        <button
                          onClick={() => setFullscreen(f => !f)}
                          title={fullscreen ? "Quitter le plein écran" : "Plein écran"}
                          className="chart-action-btn"
                          style={{
                            background: fullscreen ? "rgba(91,141,239,0.18)" : "rgba(255,255,255,0.06)",
                            backdropFilter:"blur(10px) saturate(1.5)",
                            WebkitBackdropFilter:"blur(10px) saturate(1.5)",
                            border:`1px solid ${fullscreen ? "rgba(91,141,239,0.45)" : "rgba(255,255,255,0.12)"}`,
                            borderRadius:9, width:30, height:30, cursor:"pointer",
                            display:"flex", alignItems:"center", justifyContent:"center",
                            color: fullscreen ? "#9BB9FF" : "rgba(255,255,255,0.50)",
                            boxShadow: fullscreen ? "0 0 12px rgba(91,141,239,0.20), inset 0 1px 0 rgba(255,255,255,0.10)" : "0 1px 3px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.07)",
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
                          className="chart-action-btn"
                          style={{
                            background: sidebarOpen ? "rgba(91,141,239,0.18)" : "rgba(255,255,255,0.06)",
                            backdropFilter:"blur(10px) saturate(1.5)",
                            WebkitBackdropFilter:"blur(10px) saturate(1.5)",
                            border:`1px solid ${sidebarOpen ? "rgba(91,141,239,0.45)" : "rgba(255,255,255,0.12)"}`,
                            borderRadius:9, width:30, height:30, cursor:"pointer",
                            display:"flex", alignItems:"center", justifyContent:"center",
                            color: sidebarOpen ? "#9BB9FF" : "rgba(255,255,255,0.50)",
                            boxShadow: sidebarOpen ? "0 0 12px rgba(91,141,239,0.20), inset 0 1px 0 rgba(255,255,255,0.10)" : "0 1px 3px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.07)",
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
                        </button>
                      )}
                      {/* Share */}
                      <button
                        onClick={handleShare}
                        title="Copier le lien"
                        className="chart-action-btn"
                        style={{
                          background: copied ? "rgba(34,197,94,0.16)" : "rgba(255,255,255,0.06)",
                          backdropFilter:"blur(10px) saturate(1.5)",
                          WebkitBackdropFilter:"blur(10px) saturate(1.5)",
                          border:`1px solid ${copied ? "rgba(34,197,94,0.40)" : "rgba(255,255,255,0.12)"}`,
                          borderRadius:9, width:30, height:30, cursor:"pointer",
                          display:"flex", alignItems:"center", justifyContent:"center",
                          color: copied ? "#4ade80" : "rgba(255,255,255,0.50)",
                          boxShadow: copied ? "0 0 12px rgba(34,197,94,0.18), inset 0 1px 0 rgba(255,255,255,0.10)" : "0 1px 3px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.07)",
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
                          className="chart-action-btn"
                          style={{
                            background: chartViewMode === "candle" ? "rgba(155,185,255,0.16)" : "rgba(255,255,255,0.06)",
                            backdropFilter:"blur(10px) saturate(1.5)",
                            WebkitBackdropFilter:"blur(10px) saturate(1.5)",
                            border:`1px solid ${chartViewMode === "candle" ? "rgba(155,185,255,0.40)" : "rgba(255,255,255,0.12)"}`,
                            borderRadius:9, width:30, height:30, cursor:"pointer",
                            display:"flex", alignItems:"center", justifyContent:"center",
                            color: chartViewMode === "candle" ? "#9BB9FF" : "rgba(255,255,255,0.50)",
                            boxShadow: chartViewMode === "candle" ? "0 0 12px rgba(155,185,255,0.16), inset 0 1px 0 rgba(255,255,255,0.10)" : "0 1px 3px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.07)",
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

                      {/* Vue synchronisée — visible si benchmark actif */}
                      {customBmTicker && (
                        <button
                          onClick={() => setSyncView(v => !v)}
                          title="Vue synchronisée"
                          className="chart-action-btn"
                          style={{
                            background: syncView ? "rgba(91,141,239,0.18)" : "rgba(255,255,255,0.06)",
                            backdropFilter:"blur(10px) saturate(1.5)",
                            WebkitBackdropFilter:"blur(10px) saturate(1.5)",
                            border:`1px solid ${syncView ? "rgba(91,141,239,0.45)" : "rgba(255,255,255,0.12)"}`,
                            borderRadius:9, height:30, padding:"0 10px", cursor:"pointer",
                            display:"flex", alignItems:"center", gap:5,
                            color: syncView ? "#9BB9FF" : "rgba(255,255,255,0.50)",
                            fontSize:11, fontWeight:500, whiteSpace:"nowrap" as const,
                            boxShadow: syncView ? "0 0 12px rgba(91,141,239,0.20), inset 0 1px 0 rgba(255,255,255,0.10)" : "0 1px 3px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.07)",
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="8" rx="1"/><rect x="3" y="13" width="18" height="8" rx="1"/></svg>
                          Vue synchronisée
                        </button>
                      )}

                      {/* Customisation colours */}
                      <button
                        onClick={() => setShowCustom(v => !v)}
                        title="Personnaliser les couleurs"
                        className="chart-action-btn"
                        style={{
                          background: showCustom ? "rgba(155,185,255,0.16)" : "rgba(255,255,255,0.06)",
                          backdropFilter:"blur(10px) saturate(1.5)",
                          WebkitBackdropFilter:"blur(10px) saturate(1.5)",
                          border:`1px solid ${showCustom ? "rgba(155,185,255,0.40)" : "rgba(255,255,255,0.12)"}`,
                          borderRadius:9, width:30, height:30, cursor:"pointer",
                          display:"flex", alignItems:"center", justifyContent:"center",
                          boxShadow: showCustom ? "0 0 12px rgba(155,185,255,0.16), inset 0 1px 0 rgba(255,255,255,0.10)" : "0 1px 3px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.07)",
                        }}
                      >
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                          <circle cx="4"  cy="4"  r="2.5" fill={showCustom ? "#9BB9FF" : "rgba(255,255,255,0.50)"}/>
                          <circle cx="12" cy="4"  r="2.5" fill={showCustom ? "#9BB9FF" : "rgba(255,255,255,0.50)"}/>
                          <circle cx="4"  cy="12" r="2.5" fill={showCustom ? "#9BB9FF" : "rgba(255,255,255,0.50)"}/>
                          <circle cx="12" cy="12" r="2.5" fill={showCustom ? "#9BB9FF" : "rgba(255,255,255,0.50)"}/>
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

              {/* ── Vue synchronisée : stats + second chart ── */}
              {syncView && customBmTicker && rawCustomBmData.length > 0 && (
                <>
                  {/* Stats panel */}
                  {syncStats && (() => {
                    const lA = (ticker ?? "A").replace(/-USD$/,"").replace(/^\^/,"").replace(/\.[A-Z]+$/,"");
                    const lB = (customBmTicker ?? "B").replace(/-USD$/,"").replace(/^\^/,"").replace(/\.[A-Z]+$/,"");

                    const tooltips: Record<string,string> = {
                      corr:  `Mesure si deux actifs montent et baissent ensemble (de −1 à +1). Proche de 0 : ils évoluent indépendamment — utile pour diversifier.`,
                      beta:  `Compare l'amplitude des mouvements. Bêta 0.5 : quand ${lA} fait ±10 %, ${lB} fait ±5 % en moyenne.`,
                      alpha: `Alpha : la performance de ${lA} au-delà de ce que sa relation avec ${lB} (bêta) laisserait prévoir. Ici ${lB} sert de référence, comme un indice le ferait. Calculé sur ${activePeriod}, taux sans risque 3,5%/an.`,
                      dir:   `Part des jours où les deux actifs ont clôturé dans la même direction. 50 % = hasard pur.`,
                    };

                    // Interprétations colorées — corr/beta/dir neutres, seul alpha sémantique
                    const corrLabel = syncStats.corr >= 0.7 ? { t:`Forte corrélation`, c:"#9BB9FF" }
                      : syncStats.corr >= 0.3 ? { t:`Corrélation modérée`, c:"#9BB9FF" }
                      : { t:`Faible corrélation`, c:"rgba(255,255,255,0.45)" };

                    const betaLabel = syncStats.beta < 0.7 ? { t:`${lB} varie moins que ${lA}`, c:"#9BB9FF" }
                      : syncStats.beta <= 1.3 ? { t:`Volatilités similaires`, c:"rgba(255,255,255,0.45)" }
                      : { t:`${lB} amplifie ${lA}`, c:"#9BB9FF" };

                    const alphaLabel = syncStats.alpha > 5 ? { t:`${lA} surperforme`, c:"#4ade80" }
                      : syncStats.alpha < -5 ? { t:`${lA} sous-performe`, c:"#ef4444" }
                      : { t:`Neutre`, c:"rgba(255,255,255,0.45)" };

                    const dirLabel = { t:`${syncStats.sameDirN} jours sur ${syncStats.totalN}`, c:"#9BB9FF" };

                    // Explications sous la jauge — chaque carte décrit SA métrique
                    const corrExpl = syncStats.corr < 0.3
                      ? `${lB} évolue indépendamment de ${lA} sur la période.`
                      : syncStats.corr < 0.7
                      ? `Tendances parfois liées, souvent indépendantes.`
                      : `${lB} suit généralement les mouvements de ${lA}.`;
                    const betaExpl = `Pour 1% de variation de ${lA}, ${lB} varie de ${Math.abs(syncStats.beta).toFixed(2)}%.`;
                    const alphaExpl = syncStats.alpha > 5
                      ? `${lA} génère ${syncStats.alpha.toFixed(1)}%/an au-delà de ce que son risque (bêta) justifie.`
                      : syncStats.alpha < -5
                      ? `${lA} sous-performe de ${Math.abs(syncStats.alpha).toFixed(1)}%/an par rapport à son niveau de risque.`
                      : `La performance de ${lA} est conforme à son exposition au risque.`;
                    const dirExpl = syncStats.sameDir >= 70
                      ? `Mouvements souvent synchrones — les hausses et baisses se produisent ensemble.`
                      : syncStats.sameDir < 50
                      ? `Les deux actifs évoluent plus souvent en sens opposé que dans le même sens.`
                      : `Co-mouvement modéré sur la période.`;

                    // Résumé IA — synthèse croisée, pas paraphrase des cartes
                    const aiLines: string[] = (() => {
                      const lowCorr = syncStats.corr < 0.35;
                      const highCorr = syncStats.corr > 0.7;
                      const nearOneBeta = Math.abs(syncStats.beta - 1) < 0.3;
                      const posAlpha = syncStats.alpha > 5;
                      const negAlpha = syncStats.alpha < -5;
                      const lowDir = syncStats.sameDir < 60;
                      if (lowCorr && lowDir) {
                        return [
                          `Diversification réelle : ${lA} et ${lB} suivent des logiques différentes.`,
                          `En détenir les deux lisse les à-coups du portefeuille.`,
                        ];
                      } else if (highCorr && nearOneBeta && !posAlpha) {
                        return [
                          `Quasi-doublons sur la période : corrélation élevée et bêta proche de 1.`,
                          `Détenir les deux n'apporte presque pas de diversification.`,
                        ];
                      } else if (lowCorr && posAlpha) {
                        return [
                          `${lA} surperforme nettement, et sans lien fort avec ${lB} : sa dynamique lui est propre.`,
                          `Combinaison efficace pour diversifier avec un moteur de performance indépendant.`,
                        ];
                      } else if (highCorr && posAlpha) {
                        return [
                          `Malgré une forte corrélation avec ${lB}, ${lA} génère un surplus de performance.`,
                          `La diversification est faible, mais le choix de ${lA} s'avère payant sur la période.`,
                        ];
                      } else if (!lowCorr && !highCorr && posAlpha) {
                        return [
                          `Corrélation modérée et alpha positif : ${lA} maintient une dynamique propre.`,
                          `Diversification partielle avec un léger avantage de performance.`,
                        ];
                      } else if (negAlpha) {
                        return [
                          `${lA} sous-performe par rapport au risque qu'il représente face à ${lB}.`,
                          `Revoir la pertinence de ce couple d'actifs sur la période ${activePeriod}.`,
                        ];
                      } else {
                        return [
                          `Corrélation modérée entre ${lA} et ${lB} — tendances partiellement liées.`,
                          `Diversification partielle : les deux actifs peuvent coexister en portefeuille.`,
                        ];
                      }
                    })();

                    const cardBase: React.CSSProperties = {
                      flex:1, background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)",
                      borderRadius:12, padding:"11px 12px 10px", display:"flex", flexDirection:"column",
                      position:"relative", transition:"background 0.15s", cursor:"default",
                    };
                    const hov = (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.background="rgba(255,255,255,0.045)"; };
                    const unHov = (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.background="rgba(255,255,255,0.02)"; };

                    const Lbl = ({ k, txt }: { k:string; txt:string }) => (
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:5 }}>
                        <span style={{ fontSize:8.5, color:"rgba(255,255,255,0.28)", letterSpacing:"0.08em", textTransform:"uppercase" as const }}>{txt}</span>
                        <span onMouseEnter={() => setStatsTooltip(k)} onMouseLeave={() => setStatsTooltip(null)}
                          style={{ fontSize:11, color: statsTooltip===k ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.28)", cursor:"help", transition:"color 0.15s", lineHeight:1 }}>ⓘ</span>
                      </div>
                    );
                    const TT = ({ k }: { k:string }) => statsTooltip===k ? (
                      <div style={{ position:"absolute", bottom:"calc(100% + 6px)", left:0, right:0, zIndex:200,
                        background:"#111827", border:"1px solid rgba(255,255,255,0.10)", borderRadius:8,
                        padding:"8px 10px", fontSize:11, color:"rgba(255,255,255,0.68)", lineHeight:1.55,
                        pointerEvents:"none", boxShadow:"0 4px 24px rgba(0,0,0,0.55)" }}>
                        {tooltips[k]}
                      </div>
                    ) : null;

                    // Gauge: track + fill + cursor + labels below
                    const G = ({ pct, gradient, fill, fillColor, labels, cursor=true }:{
                      pct:number; gradient?:string; fill?:{from:number;to:number}; fillColor?:string;
                      labels:string[]; cursor?:boolean;
                    }) => {
                      const cp = Math.max(0, Math.min(100, pct));
                      return (
                        <div style={{ position:"relative", marginTop:8, marginBottom:0 }}>
                          <div style={{ position:"relative", height:6, background: gradient||"rgba(255,255,255,0.09)", borderRadius:3, overflow:"hidden" }}>
                            {fill && <div style={{ position:"absolute", top:0, bottom:0, left:`${fill.from}%`, width:`${fill.to-fill.from}%`, background: fillColor||"rgba(255,255,255,0.25)" }}/>}
                          </div>
                          {cursor && <div style={{ position:"absolute", top:0, left:`calc(${cp}% - 1px)`, width:2, height:6, background:"#fff", borderRadius:1, boxShadow:"0 0 5px rgba(255,255,255,0.6)" }}/>}
                          <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
                            {labels.map((l,i) => <span key={i} style={{ fontSize:8, color:"rgba(255,255,255,0.22)" }}>{l}</span>)}
                          </div>
                        </div>
                      );
                    };

                    const Expl = ({ txt }: { txt:string }) => (
                      <span style={{ fontSize:9, color:"rgba(255,255,255,0.32)", lineHeight:1.45, marginTop:5, display:"block", minHeight:26 }}>{txt}</span>
                    );

                    return (
                      <div style={{ display:"flex", gap:5, marginTop:6, flexShrink:0, alignItems:"stretch" }}>

                        {/* Corrélation */}
                        <div style={cardBase} onMouseEnter={hov} onMouseLeave={unHov}>
                          <TT k="corr"/><Lbl k="corr" txt={`Corrélation (${activePeriod})`}/>
                          <span style={{ fontSize:20, fontWeight:700, color:"#F8F9FC", fontVariantNumeric:"tabular-nums" as const, lineHeight:1, marginBottom:3 }}>{syncStats.corr.toFixed(2)}</span>
                          <span style={{ fontSize:10, fontWeight:600, color: corrLabel.c, display:"block", minHeight:28 }}>{corrLabel.t}</span>
                          <G pct={(syncStats.corr+1)/2*100}
                            gradient="linear-gradient(to right, rgba(91,141,239,0.07) 0%, rgba(91,141,239,0.28) 100%)"
                            labels={["-1","0","+1"]}/>
                          <Expl txt={corrExpl}/>
                        </div>

                        {/* Bêta */}
                        <div style={cardBase} onMouseEnter={hov} onMouseLeave={unHov}>
                          <TT k="beta"/><Lbl k="beta" txt={`Bêta (${activePeriod})`}/>
                          <span style={{ fontSize:20, fontWeight:700, color:"#F8F9FC", fontVariantNumeric:"tabular-nums" as const, lineHeight:1, marginBottom:3 }}>{syncStats.beta.toFixed(2)}</span>
                          <span style={{ fontSize:10, fontWeight:600, color: betaLabel.c, display:"block", minHeight:28 }}>{betaLabel.t}</span>
                          <G pct={Math.min(syncStats.beta,2)/2*100}
                            gradient="linear-gradient(to right, rgba(91,141,239,0.07) 0%, rgba(91,141,239,0.28) 100%)"
                            labels={["0","1","2+"]}/>
                          <Expl txt={betaExpl}/>
                        </div>

                        {/* Alpha */}
                        <div style={cardBase} onMouseEnter={hov} onMouseLeave={unHov}>
                          <TT k="alpha"/><Lbl k="alpha" txt={`Alpha (${activePeriod})`}/>
                          <span style={{ fontSize:20, fontWeight:700, color: syncStats.alpha > 5 ? "#4ade80" : syncStats.alpha < -5 ? "#ef4444" : "#F8F9FC", fontVariantNumeric:"tabular-nums" as const, lineHeight:1, marginBottom:3 }}>{syncStats.alpha > 0 ? "+" : ""}{syncStats.alpha.toFixed(1)}%</span>
                          <span style={{ fontSize:10, fontWeight:600, color: alphaLabel.c, display:"block", minHeight:28 }}>{alphaLabel.t}</span>
                          {(() => {
                            const alphaBound = Math.max(30, Math.ceil((Math.abs(syncStats.alpha) + 10) / 10) * 10);
                            const clamped = Math.max(-alphaBound, Math.min(alphaBound, syncStats.alpha));
                            const curPct = 50 + clamped / alphaBound * 50;
                            const fill = clamped >= 0 ? { from:50, to:curPct } : { from:curPct, to:50 };
                            const fillColor = clamped >= 0 ? "rgba(74,222,128,0.30)" : "rgba(239,68,68,0.30)";
                            return <G pct={curPct} fill={fill} fillColor={fillColor}
                              gradient="linear-gradient(to right, rgba(239,68,68,0.15) 0%, rgba(255,255,255,0.07) 50%, rgba(74,222,128,0.15) 100%)"
                              labels={[`−${alphaBound}%`,"0",`+${alphaBound}%`]}/>;
                          })()}
                          <Expl txt={alphaExpl}/>
                        </div>

                        {/* Jours même sens */}
                        <div style={cardBase} onMouseEnter={hov} onMouseLeave={unHov}>
                          <TT k="dir"/><Lbl k="dir" txt={`Jours même sens (${activePeriod})`}/>
                          <span style={{ fontSize:20, fontWeight:700, color:"#F8F9FC", fontVariantNumeric:"tabular-nums" as const, lineHeight:1, marginBottom:3 }}>{syncStats.sameDir}%</span>
                          <span style={{ fontSize:10, fontWeight:600, color: dirLabel.c, display:"block", minHeight:28 }}>{dirLabel.t}</span>
                          <G pct={syncStats.sameDir} fill={{ from:0, to:syncStats.sameDir }} fillColor="rgba(91,141,239,0.28)"
                            gradient="linear-gradient(to right, rgba(91,141,239,0.07) 0%, rgba(91,141,239,0.20) 100%)"
                            labels={["0%","50%","100%"]}/>
                          <Expl txt={dirExpl}/>
                        </div>

                        {/* Résumé IA */}
                        <div style={{ flex:"0 0 186px", background:"rgba(123,167,247,0.05)", border:"1px solid rgba(123,167,247,0.14)", borderRadius:12, padding:"11px 13px 10px", display:"flex", flexDirection:"column", gap:7 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:1 }}>
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 1l1.5 4.5L14 8l-4.5 1.5L8 15l-1.5-4.5L2 8l4.5-1.5z" fill="#9BB9FF"/></svg>
                            <span style={{ fontSize:11, fontWeight:700, color:"#9BB9FF", letterSpacing:"0.03em" }}>Résumé IA</span>
                          </div>
                          {aiLines.map((p,i) => (
                            <p key={i} style={{ fontSize:10, color:"rgba(255,255,255,0.58)", lineHeight:1.6, margin:0 }}>{p}</p>
                          ))}
                        </div>

                      </div>
                    );
                  })()}

                  {/* Second chart — benchmark */}
                  <div
                    style={{ border:"1px solid rgba(255,255,255,0.06)", borderRadius:"16px", padding:"10px 18px 10px", flex:"2 1 0", minHeight:0, display:"flex", flexDirection:"column", position:"relative", overflow:"hidden", background:"rgba(255,255,255,0.02)", marginTop:6 }}>
                    <div style={{ position:"absolute", inset:0, pointerEvents:"none", zIndex:0, background:`radial-gradient(ellipse 75% 45% at 50% 75%, ${activeBmColor}18 0%, transparent 70%)` }}/>
                    {/* Meta header */}
                    <div style={{ display:"flex", alignItems:"center", gap:0, marginBottom:4, flexShrink:0, position:"relative", zIndex:1 }}>
                      {([
                        { label:"Type", value:({"EQUITY":"Action","ETF":"ETF","INDEX":"Indice","CRYPTOCURRENCY":"Crypto"} as Record<string,string>)[customBmType] || customBmType },
                        { label:"Devise", value:"USD" },
                      ] as {label:string;value:string}[]).map((card, i) => (
                        <div key={card.label} style={{ display:"flex", alignItems:"center", gap:5, padding: i === 0 ? "0 10px 0 0" : "0 10px", borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.07)" : "none" }}>
                          <span style={{ fontSize:9, color:"rgba(255,255,255,0.22)", letterSpacing:"0.08em", textTransform:"uppercase" as const }}>{card.label}</span>
                          <span style={{ fontSize:9, fontWeight:600, color:"rgba(255,255,255,0.75)", letterSpacing:"0.03em" }}>{card.value}</span>
                        </div>
                      ))}
                    </div>
                    <GrowthChart
                      ticker={customBmTicker}
                      portfolioData={[]}
                      benchmarkData={[]}
                      benchmarkName=""
                      portfolioLabel={customBmTicker.replace(/-USD$/,"").replace(/^\^/,"")}
                      portfolioColor={activeBmColor}
                      livePrice={bmCurrentPrice?.price}
                      dailyChangePct={bmCurrentPrice?.change ?? null}
                      dark={true}
                      priceMode={true}
                      hideDrawdown={true}
                      isCrypto={isBmCrypto}
                      externalPeriod={activePeriod}
                      externalInterval={activeInterval}
                      hideControls={true}
                      onPeriodChange={() => {}}
                    />
                    {/* Period perfs */}
                    <div style={{ display:"flex", justifyContent:"center", gap:16, paddingTop:4, flexShrink:0, position:"relative", zIndex:1 }}>
                      {(["24h","1S","1M","3M","6M","1A","3A","Max"] as const).map(key => {
                        let pct: number | null = null;
                        if (key === "24h") {
                          pct = bmCurrentPrice?.change ?? null;
                        } else {
                          const SECS: Record<string,number> = { "1S":7*86400,"1M":30*86400,"3M":91*86400,"6M":183*86400,"1A":365*86400,"3A":1095*86400 };
                          const secs = SECS[key];
                          const pts = secs
                            ? rawCustomBmData.filter(p => p.date >= new Date(Date.now() - secs*1000).toISOString().slice(0,10))
                            : rawCustomBmData;
                          if (pts.length >= 2) pct = (pts[pts.length-1].value - pts[0].value) / pts[0].value * 100;
                        }
                        const isActive = activePeriod === key;
                        return (
                          <div key={key} style={{ position:"relative", paddingBottom:4, textAlign:"center", minWidth:36 }}>
                            <div style={{ fontSize:10, fontWeight:600, color: isActive ? activeBmColor : "#94a3b8" }}>{key}</div>
                            {pct !== null && (
                              <div style={{ fontSize:10, fontWeight:700, color: pct >= 0 ? "#4ade80" : "#ef4444", fontVariantNumeric:"tabular-nums" as const }}>
                                {(() => { const s = pct >= 0 ? "+" : ""; const a = Math.abs(pct); return a >= 10000 ? `${s}${(pct/1000).toFixed(0)}k%` : a >= 1000 ? `${s}${pct.toFixed(0)}%` : `${s}${pct.toFixed(1)}%`; })()}
                              </div>
                            )}
                            {isActive && <div style={{ position:"absolute", bottom:0, left:0, right:0, height:2, borderRadius:1, background:activeBmColor }}/>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

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
              ) : null}

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
                            <div key={i} style={{ height:72, borderRadius:10, background:"rgba(255,255,255,0.04)", animation:"none" }} />
                          ))}
                        </div>
                      ) : news.length > 0 ? (() => {
                        const scored = news.map(n => ({ ...n, ...scoreNews(n.title) }));
                        const sorted = newsSortBy === "impact"
                          ? [...scored].sort((a,b) => ({ high:0, medium:1, low:2 }[a.impact] - ({ high:0, medium:1, low:2 }[b.impact])))
                          : scored;
                        return (
                          <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
                            {/* Sort bar */}
                            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                              <span style={{ fontSize:9, letterSpacing:"0.08em", color:"rgba(255,255,255,0.25)", textTransform:"uppercase" as const }}>
                                {sorted.length} actualité{sorted.length > 1 ? "s" : ""}
                              </span>
                              <div style={{ display:"flex", gap:3 }}>
                                {(["recent","impact"] as const).map(s => (
                                  <button key={s} onClick={() => setNewsSortBy(s)} style={{
                                    fontSize:9, letterSpacing:"0.06em", padding:"2px 8px", borderRadius:5, cursor:"pointer",
                                    border:`1px solid ${newsSortBy===s ? "rgba(155,185,255,0.40)" : "rgba(255,255,255,0.10)"}`,
                                    background: newsSortBy===s ? "rgba(91,141,239,0.16)" : "transparent",
                                    color: newsSortBy===s ? "#9BB9FF" : "rgba(255,255,255,0.35)",
                                    transition:"all 0.14s",
                                  }}>
                                    {s === "recent" ? "Récent" : "Impact"}
                                  </button>
                                ))}
                              </div>
                            </div>
                            {/* News items */}
                            <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                            {sorted.map((n, i) => {
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

                              const imp = IMPACT_CONFIG[n.impact];

                              return (
                                <a key={i} href={n.link} target="_blank" rel="noopener noreferrer"
                                  style={{ display:"flex", flexDirection:"column", gap:7, padding:"10px 11px", borderRadius:10, background:"rgba(255,255,255,0.025)", border:"1px solid rgba(255,255,255,0.06)", textDecoration:"none", transition:"all 0.14s" }}
                                  onMouseEnter={e => { e.currentTarget.style.background="rgba(255,255,255,0.05)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.11)"; }}
                                  onMouseLeave={e => { e.currentTarget.style.background="rgba(255,255,255,0.025)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.06)"; }}>
                                  {/* Top row: type + impact badge */}
                                  <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                                    <span style={{ fontSize:8.5, fontWeight:600, letterSpacing:"0.07em", padding:"1.5px 6px", borderRadius:4,
                                      background:"rgba(255,255,255,0.08)", color:"rgba(255,255,255,0.50)", textTransform:"uppercase" as const }}>
                                      {n.type}
                                    </span>
                                    <span style={{ fontSize:8.5, fontWeight:600, letterSpacing:"0.05em", padding:"1.5px 6px", borderRadius:4,
                                      background:imp.bg, color:imp.color, display:"flex", alignItems:"center", gap:3 }}>
                                      <span style={{ width:4, height:4, borderRadius:"50%", background:imp.dot, display:"inline-block", flexShrink:0 }}/>
                                      {imp.label}
                                    </span>
                                    <span style={{ marginLeft:"auto", fontSize:8.5, color:"rgba(255,255,255,0.22)" }}>{n.readMin} min</span>
                                  </div>
                                  {/* Content row */}
                                  <div style={{ display:"flex", gap:9, alignItems:"flex-start" }}>
                                    {n.thumbnail ? (
                                      <img src={n.thumbnail} alt="" width={44} height={44}
                                        style={{ borderRadius:6, objectFit:"cover" as const, flexShrink:0 }}
                                        onError={e => { (e.target as HTMLImageElement).style.display="none"; }} />
                                    ) : (
                                      <div style={{
                                        width:44, height:44, borderRadius:6, flexShrink:0,
                                        background: ["rgba(91,141,239,0.18)","rgba(139,92,246,0.18)","rgba(34,197,94,0.14)","rgba(249,115,22,0.16)","rgba(236,72,153,0.16)"][
                                          (n.publisher?.charCodeAt(0) ?? 65) % 5
                                        ],
                                        display:"flex", alignItems:"center", justifyContent:"center",
                                        fontSize:18, fontWeight:700, color:"rgba(255,255,255,0.45)",
                                      }}>
                                        {n.publisher?.[0]?.toUpperCase() ?? "N"}
                                      </div>
                                    )}
                                    <div style={{ flex:1, minWidth:0 }}>
                                      <div style={{ fontSize:11, fontWeight:500, color:"rgba(255,255,255,0.84)", lineHeight:1.44,
                                        display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" as const, overflow:"hidden" }}>
                                        {n.title}
                                      </div>
                                      <div style={{ marginTop:4, display:"flex", alignItems:"center", gap:5 }}>
                                        <span style={{ fontSize:9, color:"rgba(255,255,255,0.35)", fontWeight:500 }}>{n.publisher}</span>
                                        {timeAgo && <><span style={{ width:2, height:2, borderRadius:"50%", background:"rgba(255,255,255,0.18)", display:"inline-block", flexShrink:0 }}/><span style={{ fontSize:9, color:"rgba(255,255,255,0.25)" }}>{timeAgo}</span></>}
                                        <span style={{ marginLeft:"auto", fontSize:9, color:"rgba(91,141,239,0.55)" }}>→</span>
                                      </div>
                                    </div>
                                  </div>
                                </a>
                              );
                            })}
                            </div>
                          </div>
                        );
                      })() : (
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
                      benchmarkData={activeBmData}
                      benchmarkRawData={customBmTicker ? rawCustomBmData : undefined}
                      benchmarkName={customBmTicker ? customBmName : "S&P 500"}
                      benchmarkColor={activeBmColor}
                      livePrice={currentPrice?.price}
                      isCrypto={isCrypto}
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
                      onVisibleRangeChange={(from, to) => { if (!from || !to) { setVisibleRange(null); return; } const fd = new Date(from*1000); const td = new Date(to*1000); if (!isNaN(fd.getTime()) && !isNaN(td.getTime())) setVisibleRange({ from: fd.toISOString().slice(0,10), to: td.toISOString().slice(0,10) }); }}
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
