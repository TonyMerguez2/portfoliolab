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

const COMPARISON_PERIODS = ["24h", "1S", "1M", "3M", "6M", "1A", "3A", "Max"] as const;
const COMPARISON_INTERVALS = ["1m", "5m", "15m", "1h", "1d", "1W"] as const;
const COMPARISON_PERIOD_SECS: Record<string, number | null> = {
  "24h": 86400, "1S": 7 * 86400, "1M": 30 * 86400, "3M": 91 * 86400,
  "6M": 183 * 86400, "1A": 365 * 86400, "3A": 1095 * 86400, "Max": null,
};
const COMPARISON_ALLOWED_INTERVALS: Record<string, string[]> = {
  "24h": ["1m", "5m", "15m"],
  "1S": ["5m", "15m", "1h"],
  "1M": ["5m", "15m", "1h", "1d"],
  "3M": ["15m", "1h", "1d"],
  "6M": ["1h", "1d", "1W"],
  "1A": ["1h", "1d", "1W"],
  "3A": ["1d", "1W"],
  "Max": ["1d", "1W"],
};
const COMPARISON_DEFAULT_INTERVAL: Record<string, string> = {
  "24h": "5m", "1S": "15m", "1M": "1h", "3M": "1h",
  "6M": "1d", "1A": "1d", "3A": "1d", "Max": "1d",
};

function computePeriodPerformances(
  data: { date: string; value: number }[],
  dailyChange: number | null,
): Record<string, number | null> {
  return Object.fromEntries(COMPARISON_PERIODS.map(period => {
    if (period === "24h" && dailyChange !== null) return [period, dailyChange];
    const secs = COMPARISON_PERIOD_SECS[period];
    const cutoff = secs ? new Date(Date.now() - secs * 1000).toISOString().slice(0, 10) : null;
    const points = cutoff ? data.filter(point => point.date.slice(0, 10) >= cutoff) : data;
    if (points.length < 2 || points[0].value <= 0) return [period, null];
    return [period, (points[points.length - 1].value - points[0].value) / points[0].value * 100];
  }));
}

function formatComparisonPerformance(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value >= 0 ? "+" : "";
  const abs = Math.abs(value);
  if (abs >= 10000) return `${sign}${(value / 1000).toFixed(0)}k%`;
  if (abs >= 1000) return `${sign}${value.toFixed(0)}%`;
  return `${sign}${value.toFixed(1)}%`;
}

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
  if (/earnings|revenue|profit|q[1-4]\b|eps\b|quarterly|annual|résultat|chiffre d.affaire|bénéfice|ventes|trimestre|prévision/i.test(title)) type = "Résultats";
  else if (/\bai\b|artificial intelligence|machine learning|chatgpt|\bgpt\b|\bllm\b|openai|gemini|mistral/i.test(title)) type = "IA";
  else if (/dividend|yield|dividende|payout/i.test(title)) type = "Dividende";
  else if (/\bsec\b|\bftc\b|regulat|fine\b|lawsuit|penalty|antitrust|sanction|amende|probe|procès|enquête|justice|litige|actionnaire/i.test(title)) type = "Régulation";
  else if (/merger|acqui|takeover|\bdeal\b|fusion|buys?\b|purchased?|rachat|acquisition/i.test(title)) type = "Fusion";
  else if (/analyst|upgrade|downgrade|price target|buy rating|sell rating|outperform|underperform|objectif de cours|recommandation|dégrade|relève/i.test(title)) type = "Analyse";
  else if (/\bipo\b|offering|stock split|buyback|repurchase|introduction en bourse|rachat d.action/i.test(title)) type = "Bourse";
  else if (/\bceo\b|\bcfo\b|\bcto\b|executive|appoint|resign|leadership|direction|dirigeant|nomme|démission/i.test(title)) type = "Direction";

  let score = 0;
  ["miss","beat","surge","plunge","crash","record","bankruptcy","default","fine","merger","acqui","billion","layoff","downgrade","upgrade","warning","recall","investigation","fraud","guidance cut","profit warning","job cut","procès","enquête","amende","fraude","faillite","rappel","licenciement","avertissement","chute","bondit","record","milliard","acquisition","fusion"].forEach(k => { if (t.includes(k)) score += 2; });
  ["growth","expansion","partnership","launch","announces","targets","dividend","analyst","forecast","results","report","croissance","partenariat","lancement","annonce","objectif","dividende","analyste","prévision","résultat","ventes","trimestre","bénéfice","investit","dépense"].forEach(k => { if (t.includes(k)) score += 1; });
  if (type === "Résultats" || type === "Fusion") score += 2;
  if (type === "Régulation") score += 1;

  const impact: NewsImpact = score >= 4 ? "high" : score >= 1 ? "medium" : "low";
  const readMin = Math.max(1, Math.min(5, Math.round(title.split(" ").length * 7 / 60)));
  return { impact, type, readMin };
}

function newsTimestamp(value: string | number): number {
  if (typeof value === "number") {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000;
    return Number.isFinite(milliseconds) ? milliseconds : 0;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNewsAge(timestamp: number): string {
  if (!timestamp) return "";
  const diff = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (diff < 60) return `il y a ${Math.max(1, diff)} min`;
  if (diff < 1440) return `il y a ${Math.floor(diff / 60)} h`;
  return `il y a ${Math.floor(diff / 1440)} j`;
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

const CRYPTO_COINGECKO_IDS: Record<string,string> = {
  "BTC-USD":"bitcoin", "ETH-USD":"ethereum", "SOL-USD":"solana", "BNB-USD":"binancecoin",
  "XRP-USD":"ripple", "DOGE-USD":"dogecoin", "ADA-USD":"cardano", "AVAX-USD":"avalanche-2",
  "DOT-USD":"polkadot", "INJ-USD":"injective-protocol", "LINK-USD":"chainlink",
  "UNI7083-USD":"uniswap", "LTC-USD":"litecoin", "ATOM-USD":"cosmos", "NEAR-USD":"near",
  "ARB-USD":"arbitrum", "OP-USD":"optimism", "SUI20947-USD":"sui",
};

async function fetchCryptoRank(ticker: string): Promise<number | null> {
  const id = CRYPTO_COINGECKO_IDS[ticker.toUpperCase()];
  if (!id) return null;
  try {
    const response = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(id)}`);
    if (!response.ok) return null;
    const data = await response.json();
    const rank = Array.isArray(data) ? Number(data[0]?.market_cap_rank) : NaN;
    return Number.isFinite(rank) && rank > 0 ? rank : null;
  } catch {
    return null;
  }
}

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
  // Surface style is global (header toggle), not page-local.
  const { displayMode: chartDisplayMode } = useApp();
  const [copied,        setCopied]        = useState(false);
  const [chartViewMode, setChartViewMode] = useState<"line" | "candle">("line");
  const [extractedColor, setExtractedColor] = useState<string | null>(null);
  const [bmExtractedColor, setBmExtractedColor] = useState<string | null>(null);
  const [displayCurrency,   setDisplayCurrency]   = useState<string | null>(null);
  const [showCurrencyMenu,  setShowCurrencyMenu]  = useState(false);
  const [fxRates,           setFxRates]           = useState<Record<string, number>>({ USD: 1 });
  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const [sidebarTab,     setSidebarTab]     = useState<"news"|"similar"|"ai">("news");
  const [similar,        setSimilar]        = useState<{ticker:string;sector?:string;country?:string;type?:string;mcap?:string;market_cap?:number|null;price:number;change:number}[]>([]);
  const [similarBy,      setSimilarBy]      = useState<"sector"|"geography"|"marketcap">("sector");
  const [news,           setNews]           = useState<{title:string;publisher:string;link:string;published_at:string|number;thumbnail?:string}[]>([]);
  const [newsLoading,    setNewsLoading]    = useState(false);
  const [newsSortBy,      setNewsSortBy]      = useState<"recent" | "impact">("recent");
  const [customBmTicker,  setCustomBmTicker]  = useState<string | null>(null);
  const [customBmName,    setCustomBmName]    = useState<string>("");
  const [customBmType,    setCustomBmType]    = useState<string>("EQUITY");
  const [rawCustomBmData, setRawCustomBmData] = useState<{date:string;value:number}[]>([]);

  const [customBmLoading, setCustomBmLoading] = useState(false);
  const [bmCurrentPrice,  setBmCurrentPrice]  = useState<{price:number;change:number}|null>(null);
  const [bmQuote,         setBmQuote]         = useState<{day_high?:number;day_low?:number;open?:number;prev_close?:number;year_high?:number;year_low?:number;volume?:number;avg_volume?:number;market_cap?:number;currency?:string;global_rank?:number}|null>(null);
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
      .then(async d => {
        if (d.error) return;
        if (isCrypto && d.global_rank == null) d.global_rank = await fetchCryptoRank(ticker);
        setQuote(d);
      })
      .catch(() => {});
  }, [ticker, isCrypto]);

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
    const controller = new AbortController();
    setSimilar([]);
    setSimilarLoading(true);
    fetch(`${API_URL}/api/v1/similar/${encodeURIComponent(ticker)}?by=${similarBy}`, { signal:controller.signal })
      .then(r => r.json())
      .then((d: unknown) => { if (Array.isArray(d)) setSimilar(d); })
      .catch(error => { if (error instanceof Error && error.name !== "AbortError") setSimilar([]); })
      .finally(() => { if (!controller.signal.aborted) setSimilarLoading(false); });
    return () => controller.abort();
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
    if (!customBmTicker) { setBmQuote(null); return; }
    setBmQuote(null);
    fetch(`${API_URL}/api/v1/quote/${encodeURIComponent(customBmTicker)}`)
      .then(r => r.json())
      .then(async d => {
        if (d.error) return;
        if (isBmCrypto && d.global_rank == null) d.global_rank = await fetchCryptoRank(customBmTicker);
        setBmQuote(d);
      })
      .catch(() => {});
  }, [customBmTicker, isBmCrypto]);

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

  const primaryPeriodPerformances = useMemo(
    () => computePeriodPerformances(scaledPortfolioData, currentPrice?.change ?? null),
    [scaledPortfolioData, currentPrice?.change],
  );
  const secondaryPeriodPerformances = useMemo(
    () => computePeriodPerformances(rawCustomBmData, bmCurrentPrice?.change ?? null),
    [rawCustomBmData, bmCurrentPrice?.change],
  );

  const selectComparisonPeriod = (period: string) => {
    const allowed = COMPARISON_ALLOWED_INTERVALS[period] ?? [];
    if (!allowed.includes(activeInterval)) setActiveInterval(COMPARISON_DEFAULT_INTERVAL[period] ?? "1d");
    setActivePeriod(period);
  };

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
    TOR:"Toronto", TSX:"Toronto", HKG:"Hong Kong", JPX:"Tokyo", TYO:"Tokyo", ASX:"Sydney",
  };
  const _EXCH_FLAG: Record<string,string> = {
    NMS:"us", NMQ:"us", NYQ:"us", NYSEArca:"us",
    PAR:"fr", GER:"de", LSE:"gb", MCE:"es", AMS:"nl", MIL:"it", SWX:"ch",
    TOR:"ca", TSX:"ca", HKG:"hk", JPX:"jp", TYO:"jp", ASX:"au",
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
  const bmAssetInfo = customBmTicker ? TRENDING.find(a => a.ticker === customBmTicker) : null;
  const bmMetaCards = customBmTicker ? (() => {
    const aType = customBmType || bmAssetInfo?.type;
    const isIdx = aType === "INDEX";
    const isEtf = aType === "ETF";
    const isCrp = aType === "CRYPTOCURRENCY";
    const exchVal = (isIdx || isCrp)
      ? null
      : (bmAssetInfo?.exchange ? (_EXCH[bmAssetInfo.exchange] || bmAssetInfo.exchange) : null);
    return [
      exchVal                                                   && { label:"Exchange", value: exchVal },
      aType                                                     && { label:"Type",     value: ({"EQUITY":"Action","ETF":"ETF","INDEX":"Indice","CRYPTOCURRENCY":"Crypto"} as Record<string,string>)[aType] || aType },
      bmQuote?.currency                                         && { label:"Devise",   value: bmQuote.currency },
      bmQuote?.open        != null                              && { label:"Ouv",      value: _fmtN(bmQuote.open!) },
      bmQuote?.day_high    != null                              && { label:"Haut",     value: _fmtN(bmQuote.day_high!) },
      bmQuote?.day_low     != null                              && { label:"Bas",      value: _fmtN(bmQuote.day_low!) },
      !isIdx && bmQuote?.volume     != null                     && { label:"Vol",      value: _fmtV(bmQuote.volume!) },
      !isIdx && bmQuote?.market_cap != null                     && { label: isEtf ? "AUM" : "Cap", value: _fmtC(bmQuote.market_cap!) },
      (bmQuote?.year_low != null && bmQuote?.year_high != null) && { label:"52 sem", value: `${_fmtN(bmQuote.year_low!)} – ${_fmtN(bmQuote.year_high!)}` },
    ].filter(Boolean) as {label:string;value:string}[];
  })() : [];

  return (
    <div data-novac-page style={{
      height:"100vh",
      background:chartDisplayMode === "black"
        ? "#171717"
        : "var(--novac-bg, #041124)",
      color:"var(--novac-text-primary, #F8F9FC)", fontFamily:"-apple-system,BlinkMacSystemFont,sans-serif",
      display:"flex", flexDirection:"column", position:"relative", overflow:"hidden",
      transition:"background-color .2s ease",
    }}>
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
              {/* dangerouslySetInnerHTML: <style> is a raw-text element, so the
                  browser never decodes entities inside it. React's SSR escapes
                  quotes in JSX children (" -> &quot;), which both breaks the CSS
                  and makes the server markup differ from the client render — a
                  hydration mismatch. Setting the HTML directly skips escaping. */}
              <style dangerouslySetInnerHTML={{ __html: `
                @keyframes hdr-glow-up{0%,100%{box-shadow:0 0 6px rgba(34,197,94,.15)}50%{box-shadow:0 0 14px rgba(34,197,94,.35)}}
                @keyframes hdr-glow-dn{0%,100%{box-shadow:0 0 6px rgba(239,68,68,.15)}50%{box-shadow:0 0 14px rgba(239,68,68,.35)}}
                @keyframes price-flash-up{0%{color:#4ade80}80%{color:#4ade80}100%{color:#F8F9FC}}
                @keyframes price-flash-dn{0%{color:#ef4444}80%{color:#ef4444}100%{color:#F8F9FC}}
                @keyframes hdr-pulse{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.7)}60%{box-shadow:0 0 0 5px rgba(34,197,94,0)}}
                @keyframes hdr-pulse-live{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.9)}50%{box-shadow:0 0 0 6px rgba(34,197,94,0)}}
                .chart-action-btn{width:30px!important;height:30px!important;box-sizing:border-box!important;border-width:1px!important;border-style:solid!important;border-radius:9px!important;box-shadow:0 2px 7px rgba(0,0,0,.22)!important;transition:transform .16s ease,filter .16s ease,background .16s ease,border-color .16s ease!important}
                .chart-action-btn:hover{transform:translateY(-1px);filter:brightness(1.12)}
                .chart-action-btn:active{transform:translateY(0)!important;filter:brightness(.96);transition-duration:0.07s!important}
                .news-card-link{transition:transform .16s ease,background .16s ease,border-color .16s ease,box-shadow .16s ease}
                .news-card-link:hover{transform:translateY(-1px);background:rgba(255,255,255,.047)!important;border-color:rgba(147,177,235,.17)!important;box-shadow:0 8px 22px rgba(0,0,0,.13)}
                .news-card-link:active{transform:translateY(0);transition-duration:.07s}
                .news-card-link:focus-visible{outline:2px solid rgba(91,141,239,.56);outline-offset:2px}
                .news-card-arrow{transition:transform .16s ease,opacity .16s ease}
                .news-card-link:hover .news-card-arrow{transform:translateX(2px);opacity:1!important}
                .chart-glass-container::before{display:none}
                .asset-hero-grid{position:relative;z-index:1;display:grid;grid-template-columns:max-content max-content max-content;align-items:center;height:64px;min-height:64px}
                .asset-hero-row{zoom:.94}
.asset-hero-card::before{content:'';position:absolute;z-index:4;inset:0;box-sizing:border-box;border-radius:inherit;padding:1px;pointer-events:none;background:linear-gradient(135deg,color-mix(in srgb,currentColor 44%,transparent) 0%,color-mix(in srgb,currentColor 36%,transparent) 24%,color-mix(in srgb,currentColor 17%,transparent) 44%,transparent 54%,color-mix(in srgb,currentColor 15%,transparent) 68%,color-mix(in srgb,currentColor 40%,transparent) 100%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
                .asset-hero-secondary-card{zoom:1}
                .asset-hero-identity{display:flex;align-items:center;min-width:0;padding-right:18px}
                .asset-hero-section{align-self:stretch;display:flex;flex-direction:column;justify-content:center;border-left:1px solid rgba(255,255,255,.11);padding:0 18px;min-width:0}
                .asset-hero-status{padding-right:10px}
                .asset-hero-reflection{position:absolute;z-index:0;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(118deg,rgba(255,255,255,.045) 0%,rgba(255,255,255,.01) 12%,transparent 27%,transparent 100%),radial-gradient(ellipse 17% 58% at 0% -10%,rgba(255,255,255,.052),transparent 70%),linear-gradient(180deg,rgba(255,255,255,.032),transparent 16%);mix-blend-mode:screen}
                .asset-hero-star{width:18px;height:22px;margin:-3px 0 -3px 5px;padding:0;border:0;background:transparent;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:0;flex:0 0 auto;box-shadow:none;appearance:none;opacity:1;transform:none!important;translate:none!important;scale:1!important;transition:none!important}
                .asset-hero-star:hover{background:transparent;border-color:transparent;opacity:1;transform:none!important;translate:none!important;scale:1!important}
                .asset-hero-star.is-active{background:transparent;border-color:transparent;box-shadow:none}
                .asset-hero-star:active{opacity:.58;transform:none!important;scale:1!important}
                .asset-hero-star:focus-visible{outline:2px solid rgba(255,255,255,.38);outline-offset:2px}
                .asset-hero-star svg,.asset-hero-star:hover svg{display:block;transform:none!important;translate:none!important;scale:1!important;transition:none!important}
                .asset-meta-pill{display:inline-flex;align-items:center;min-height:17px;padding:2px 7px;border-radius:999px;border:1px solid rgba(255,255,255,.035);background:rgba(255,255,255,.055);font-size:9px;line-height:1;font-weight:600;white-space:nowrap}
                .asset-hero-price{justify-content:space-between;padding-top:2px!important;padding-bottom:2px!important;box-sizing:border-box}
                .asset-performance-pill{display:inline-flex;align-items:center;min-height:17px;padding:2px 7px;border-radius:999px;font-size:9px;line-height:1;font-weight:700;box-sizing:border-box}
                .asset-exchange-flag{width:12px;height:12px;margin-left:3px;border:0;outline:0;border-radius:50%;flex:0 0 auto;object-fit:cover;display:inline-block;vertical-align:middle;box-shadow:none}
                .asset-market-pill{display:inline-flex;align-items:center;align-self:flex-start;gap:5px;min-height:17px;padding:2px 7px;box-sizing:border-box;border-radius:9px;border:1px solid rgba(255,255,255,.028);background:rgba(255,255,255,.045);white-space:nowrap}
                .similar-asset-card{transition:transform .16s ease,filter .16s ease,box-shadow .16s ease!important}
                .similar-asset-card:hover{transform:translateY(-1px);filter:brightness(1.08);box-shadow:0 9px 24px rgba(0,0,0,.24)!important}
                .similar-asset-card:active{transform:translateY(0);filter:brightness(.98)}
                .similar-asset-card:focus-visible{outline:2px solid rgba(155,185,255,.65);outline-offset:2px}
                @media(max-width:1180px){
                  .comparison-insights-grid{grid-template-columns:1fr 1fr!important}
                  .comparison-summary{grid-column:1 / -1}
                }
                @media(max-width:1120px){
                  .asset-hero-grid{grid-template-columns:max-content max-content max-content}
                  .asset-hero-identity{padding-right:10px}.asset-hero-section{padding:0 10px}.asset-hero-status{padding-right:6px}
                }
                @media(max-width:820px){
                  .asset-hero-row{zoom:1}
                  .asset-hero-grid{grid-template-columns:minmax(0,1fr) minmax(180px,.75fr);height:auto;min-height:0;row-gap:18px}
                  .asset-hero-status{grid-column:1 / 3;border-left:0!important;border-top:1px solid rgba(255,255,255,.1);padding:16px 0 0!important;flex-direction:row!important;align-items:center;justify-content:space-between!important}
                }
                @media(max-width:620px){
                  .asset-hero-grid{display:flex;flex-wrap:wrap;min-height:0;gap:18px}
                  .asset-hero-identity{width:100%;padding:0}.asset-hero-section{flex:1 1 180px;border-left:0;padding:0}
                  .asset-hero-price{border-top:1px solid rgba(255,255,255,.1);padding-top:16px!important}
                  .asset-hero-status{flex:1 1 100%;order:3}
                }
              ` }} />
              <div style={{ display:"flex", flexDirection:"column", padding:"8px 20px 8px", borderTop:"1px solid rgba(255,255,255,0.06)", borderBottom:"none", flexShrink:0, gap:8, marginTop:6 }}>

                {/* ── Row 1: back · [logo + compact identity+price] · NOVAC ── */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:16 }}>

                  <div className="asset-hero-row" style={{ display:"flex", alignItems:"stretch", gap:10, minWidth:0, width:"100%", flexWrap:"wrap" }}>
                    {ticker && (
                      <TileCard ticker={ticker} className="asset-hero-card" radius={18} glowStrength={0}
                        containerStyle={{
                          flex:"0 0 auto", width:"fit-content", maxWidth:"100%", minWidth:0,
                          color,
                          background:`radial-gradient(ellipse 65% 90% at 0% 0%, ${color}58 0%, ${color}40 42%, ${color}1B 72%, ${color}00 100%), radial-gradient(ellipse 65% 90% at 100% 100%, ${color}4C 0%, ${color}38 42%, ${color}18 72%, ${color}00 100%), linear-gradient(138deg, ${color}22 0%, ${color}28 48%, ${color}21 100%), rgba(2,10,24,0.46)`,
                          border:"none",
                          boxShadow:`0 14px 44px rgba(0,0,0,0.28), 0 0 28px ${color}10`,
                        }}
                        style={{ padding:"10px 12px" }}>
                        <div className="asset-hero-reflection"/>
                        <div className="asset-hero-grid">
                          <div className="asset-hero-identity">
                            <AssetLogo
                              ticker={ticker} type={assetInfo?.type} size={60} radius={13}
                              fallbackBg={tc.bg} fallbackBorder={tc.border} fallbackTextColor={tc.text}
                              onColorExtracted={c => { if (!BRAND_COLORS[ticker]) setExtractedColor(c); }}
                              bare
                            />
                            <div style={{ marginLeft:12, display:"flex", flexDirection:"column", justifyContent:"center", minWidth:0 }}>
                              <div style={{ display:"flex", alignItems:"center", minWidth:0 }}>
                                <span style={{ fontSize:20, fontWeight:800, color:"#F8F9FC", letterSpacing:"-0.04em", lineHeight:.95 }}>{displayTicker}</span>
                                <button onClick={toggleFavorite} className={`asset-hero-star${isFavorite ? " is-active" : ""}`} title={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"} aria-pressed={isFavorite}>
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill={isFavorite ? "#facc15" : "none"} stroke={isFavorite ? "#facc15" : "rgba(255,255,255,0.58)"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 3.15c.35 0 .68.2.84.54l2.17 4.4 4.86.7c.38.06.69.32.81.69.12.36.02.76-.25 1.02l-3.52 3.43.83 4.84c.06.38-.09.76-.4.99-.31.22-.72.25-1.06.07L12 17.54l-4.35 2.29c-.34.18-.75.15-1.06-.07a1.02 1.02 0 0 1-.4-.99l.83-4.84-3.52-3.43a1.02 1.02 0 0 1-.25-1.02c.12-.37.43-.63.81-.69l4.86-.7 2.17-4.4c.16-.34.49-.54.84-.54Z"/>
                                  </svg>
                                </button>
                              </div>
                              <span style={{ marginTop:5, fontSize:11, fontWeight:550, color:"rgba(255,255,255,0.9)", lineHeight:1.1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{assetInfo?.name || ticker}</span>
                              <div style={{ display:"flex", alignItems:"center", gap:7, marginTop:6, minWidth:0 }}>
                                {assetInfo?.type && assetInfo.type !== "INDEX" && (
                                  <span className="asset-meta-pill" style={{ color:"rgba(255,255,255,0.72)" }}>
                                    {({"EQUITY":"Action","ETF":"ETF","CRYPTOCURRENCY":"Crypto"} as Record<string,string>)[assetInfo.type] ?? assetInfo.type}
                                  </span>
                                )}
                                {quote?.global_rank != null && (
                                  <span className="asset-meta-pill" style={{ color:"rgba(255,255,255,0.72)" }}>#{quote.global_rank}</span>
                                )}
                                {assetInfo?.exchange && !isCrypto && (
                                  <span className="asset-meta-pill" style={{ color:"rgba(255,255,255,0.58)", fontWeight:500, overflow:"hidden", textOverflow:"ellipsis" }}>
                                    {_EXCH[assetInfo.exchange] ?? assetInfo.exchange}
                                    {_EXCH_FLAG[assetInfo.exchange] && <img className="asset-exchange-flag" src={`https://hatscripts.github.io/circle-flags/flags/${_EXCH_FLAG[assetInfo.exchange]}.svg`} alt="" aria-label="Pays de la place boursière" />}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="asset-hero-section asset-hero-price">
                            <div style={{ display:"flex", alignItems:"baseline", gap:7, whiteSpace:"nowrap" }}>
                              <span style={{ fontSize:34, fontWeight:650, color:"#F8F9FC", letterSpacing:"-0.055em", fontVariantNumeric:"tabular-nums", lineHeight:1, animation:priceFlash === "up" ? "price-flash-up 0.9s ease forwards" : priceFlash === "down" ? "price-flash-dn 0.9s ease forwards" : "none" }}>
                                {currentPrice ? fmtNum(currentPrice.price) : "—"}
                              </span>
                              {quote?.currency && <span style={{ fontSize:10, fontWeight:500, color:"rgba(255,255,255,0.5)", letterSpacing:"0.04em" }}>{quote.currency}</span>}
                            </div>
                            {currentPrice && (
                              <div style={{ display:"flex", alignItems:"center", gap:6, whiteSpace:"nowrap" }}>
                                <span style={{ fontSize:14, lineHeight:"17px", fontWeight:600, color:up ? "#4ade80" : "#ef4444", fontVariantNumeric:"tabular-nums" }}>
                                  {up ? "▲" : "▼"} {up ? "+" : "−"}{fmtNum(Math.abs(quote?.prev_close != null ? currentPrice.price - quote.prev_close : currentPrice.price * currentPrice.change / 100))}
                                </span>
                                <span className="asset-performance-pill" style={{ color:up ? "#4ade80" : "#ef4444", background:up ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)", fontVariantNumeric:"tabular-nums" }}>
                                  {up ? "+" : "−"}{Math.abs(currentPrice.change).toFixed(2)}%
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="asset-hero-section asset-hero-status">
                            {!isCrypto ? (
                              <div className="asset-market-pill">
                                <span style={{ width:5, height:5, borderRadius:"50%", background:isOpen ? "#22c55e" : "rgba(255,255,255,0.62)", flexShrink:0, animation:isOpen ? "hdr-pulse 2s ease-in-out infinite" : "none" }}/>
                                <span style={{ fontSize:9, fontWeight:650, color:isOpen ? "#4ade80" : "rgba(255,255,255,0.76)" }}>{isOpen ? "Marché ouvert" : "Marché fermé"}</span>
                              </div>
                            ) : (
                              <div className="asset-market-pill" style={{ background:"rgba(34,197,94,0.065)" }}>
                                <span style={{ width:5, height:5, borderRadius:"50%", background:"#22c55e", flexShrink:0, animation:"hdr-pulse-live 1.5s ease-in-out infinite" }}/>
                                <span style={{ fontSize:9, fontWeight:650, color:"#4ade80" }}>LIVE 24/7</span>
                              </div>
                            )}
                            {!isOpen && !isCrypto && (() => {
                              const latest = dailyChartData[dailyChartData.length - 1]?.date?.slice(0,10);
                              const d = latest ? new Date(`${latest}T12:00:00`) : now;
                              return (
                                <div style={{ display:"flex", flexDirection:"column", gap:1, marginTop:5 }}>
                                  <span style={{ fontSize:9, lineHeight:1.1, color:"rgba(255,255,255,0.5)" }}>Dernière clôture</span>
                                  <span style={{ fontSize:10, lineHeight:1.15, fontWeight:500, color:"rgba(255,255,255,0.72)" }}>
                                    {d.toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"numeric"})}
                                  </span>
                                </div>
                              );
                            })()}
                            {isCrypto ? (
                              <span style={{ marginTop:7, fontSize:9, color:"rgba(255,255,255,0.38)" }}>Cours en temps réel</span>
                            ) : isOpen ? (
                              <span style={{ marginTop:7, fontSize:9, color:"rgba(255,255,255,0.38)" }}>Màj toutes les 60 s</span>
                            ) : null}
                          </div>
                        </div>
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
                            const bmColor = BRAND_COLORS[customBmTicker] ?? bmExtractedColor ?? "#5B8DEF";
                            const bmCurrency = bmQuote?.currency ?? (customBmTicker.endsWith(".PA") || customBmTicker === "^STOXX50E" ? "EUR" : customBmTicker.endsWith(".L") ? "GBX" : customBmTicker.endsWith(".TO") ? "CAD" : "USD");
                            const bmLatest = rawCustomBmData[rawCustomBmData.length - 1]?.date?.slice(0,10);
                            const bmCloseDate = bmLatest ? new Date(`${bmLatest}T12:00:00`) : now;
                            return (
                            <TileCard ticker={customBmTicker} className="asset-hero-card asset-hero-secondary-card" radius={18} glowStrength={0}
                              onClick={() => setShowBmSearch(s => !s)}
                              containerStyle={{
                                flex:"0 0 auto", width:"fit-content", maxWidth:"100%", minWidth:0, color:bmColor, cursor:"pointer",
                                background:`radial-gradient(ellipse 65% 90% at 0% 0%, ${bmColor}58 0%, ${bmColor}40 42%, ${bmColor}1B 72%, ${bmColor}00 100%), radial-gradient(ellipse 65% 90% at 100% 100%, ${bmColor}4C 0%, ${bmColor}38 42%, ${bmColor}18 72%, ${bmColor}00 100%), linear-gradient(138deg, ${bmColor}22 0%, ${bmColor}28 48%, ${bmColor}21 100%), rgba(2,10,24,0.46)`,
                                border:"none",
                                boxShadow:`0 14px 44px rgba(0,0,0,0.28), 0 0 28px ${bmColor}10`,
                              }}
                              style={{ padding:"10px 12px" }}>
                              <div className="asset-hero-reflection"/>
                              <div className="asset-hero-grid">
                                <div className="asset-hero-identity">
                                  <AssetLogo ticker={customBmTicker} type={customBmType} size={60} radius={13}
                                    fallbackBg="rgba(255,255,255,0.07)" fallbackBorder="rgba(255,255,255,0.12)" fallbackTextColor="rgba(255,255,255,0.55)" bare
                                    onColorExtracted={c => { if (!BRAND_COLORS[customBmTicker]) setBmExtractedColor(c); }}/>
                                  <div style={{ marginLeft:12, display:"flex", flexDirection:"column", justifyContent:"center", minWidth:0 }}>
                                    <div style={{ display:"flex", alignItems:"center", minWidth:0 }}>
                                      <span style={{ fontSize:20, fontWeight:800, color:"#F8F9FC", letterSpacing:"-0.04em", lineHeight:.95 }}>{bmDisplayTicker}</span>
                                      <button onClick={e => { e.stopPropagation(); setCustomBmTicker(null); setCustomBmName(""); setRawCustomBmData([]); setBmCurrentPrice(null); setSyncView(false); }}
                                        className="asset-hero-star" title="Retirer la comparaison" aria-label="Retirer la comparaison">
                                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                                          <path d="M5 5l6 6M11 5l-6 6" stroke="rgba(255,255,255,.58)" strokeWidth="1.5" strokeLinecap="round"/>
                                        </svg>
                                      </button>
                                    </div>
                                    <span style={{ marginTop:5, fontSize:11, fontWeight:550, color:"rgba(255,255,255,0.9)", lineHeight:1.1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{customBmName}</span>
                                    <div style={{ display:"flex", alignItems:"center", gap:7, marginTop:6, minWidth:0 }}>
                                      <span className="asset-meta-pill" style={{ color:"rgba(255,255,255,0.72)" }}>
                                        {({"EQUITY":"Action","ETF":"ETF","INDEX":"Indice","CRYPTOCURRENCY":"Crypto"} as Record<string,string>)[customBmType] ?? customBmType}
                                      </span>
                                      {bmQuote?.global_rank != null && (
                                        <span className="asset-meta-pill" style={{ color:"rgba(255,255,255,0.72)" }}>#{bmQuote.global_rank}</span>
                                      )}
                                      {bmInfo?.exchange && customBmType !== "CRYPTOCURRENCY" && (
                                        <span className="asset-meta-pill" style={{ color:"rgba(255,255,255,0.58)", fontWeight:500 }}>
                                          {_EXCH[bmInfo.exchange] ?? bmInfo.exchange}
                                          {_EXCH_FLAG[bmInfo.exchange] && <img className="asset-exchange-flag" src={`https://hatscripts.github.io/circle-flags/flags/${_EXCH_FLAG[bmInfo.exchange]}.svg`} alt="" aria-label="Pays de la place boursière" />}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="asset-hero-section asset-hero-price">
                                  <div style={{ display:"flex", alignItems:"baseline", gap:7, whiteSpace:"nowrap" }}>
                                    <span style={{ fontSize:34, fontWeight:650, color:"#F8F9FC", letterSpacing:"-0.055em", fontVariantNumeric:"tabular-nums", lineHeight:1, animation:bmPriceFlash === "up" ? "price-flash-up 0.9s ease forwards" : bmPriceFlash === "down" ? "price-flash-dn 0.9s ease forwards" : "none" }}>
                                      {bmCurrentPrice ? fmtNum(bmCurrentPrice.price) : "—"}
                                    </span>
                                    <span style={{ fontSize:10, fontWeight:500, color:"rgba(255,255,255,0.5)", letterSpacing:"0.04em" }}>{bmCurrency}</span>
                                  </div>
                                  {bmCurrentPrice && (
                                    <div style={{ display:"flex", alignItems:"center", gap:6, whiteSpace:"nowrap" }}>
                                      <span style={{ fontSize:14, lineHeight:"17px", fontWeight:600, color:bmUp ? "#4ade80" : "#ef4444", fontVariantNumeric:"tabular-nums" }}>
                                        {bmUp ? "▲" : "▼"} {bmUp ? "+" : "−"}{fmtNum(Math.abs(bmCurrentPrice.price * bmCurrentPrice.change / 100))}
                                      </span>
                                      <span className="asset-performance-pill" style={{ color:bmUp ? "#4ade80" : "#ef4444", background:bmUp ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)", fontVariantNumeric:"tabular-nums" }}>
                                        {bmUp ? "+" : "−"}{Math.abs(bmCurrentPrice.change).toFixed(2)}%
                                      </span>
                                    </div>
                                  )}
                                </div>

                                <div className="asset-hero-section asset-hero-status">
                                  {customBmType !== "CRYPTOCURRENCY" ? (
                                    <div className="asset-market-pill">
                                      <span style={{ width:5, height:5, borderRadius:"50%", background:bmIsOpen ? "#22c55e" : "rgba(255,255,255,0.62)", flexShrink:0 }}/>
                                      <span style={{ fontSize:9, fontWeight:650, color:bmIsOpen ? "#4ade80" : "rgba(255,255,255,0.76)" }}>{bmIsOpen ? "Marché ouvert" : "Marché fermé"}</span>
                                    </div>
                                  ) : (
                                    <div className="asset-market-pill" style={{ background:"rgba(34,197,94,0.065)" }}>
                                      <span style={{ width:5, height:5, borderRadius:"50%", background:"#22c55e", flexShrink:0 }}/>
                                      <span style={{ fontSize:9, fontWeight:650, color:"#4ade80" }}>LIVE 24/7</span>
                                    </div>
                                  )}
                                  {isBmCrypto ? (
                                    <span style={{ marginTop:7, fontSize:9, color:"rgba(255,255,255,0.38)" }}>Cours en temps réel</span>
                                  ) : bmIsOpen ? (
                                    <span style={{ marginTop:7, fontSize:9, color:"rgba(255,255,255,0.38)" }}>Màj toutes les 60 s</span>
                                  ) : (
                                    <div style={{ display:"flex", flexDirection:"column", gap:1, marginTop:5 }}>
                                      <span style={{ fontSize:9, lineHeight:1.1, color:"rgba(255,255,255,0.5)" }}>Dernière clôture</span>
                                      <span style={{ fontSize:10, lineHeight:1.15, fontWeight:500, color:"rgba(255,255,255,0.72)" }}>
                                        {bmCloseDate.toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"numeric"})}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </TileCard>
                            );
                          })() : (
                            /* Ghost tile */
                            <div onClick={() => setShowBmSearch(s => !s)} style={{
                              display:"flex", alignItems:"center", gap:9, padding:"8px 11px", borderRadius:14, flexShrink:0,
                              border:"1px solid rgba(255,255,255,0.075)", cursor:"pointer",
                              background:"linear-gradient(135deg,rgba(255,255,255,0.035),rgba(255,255,255,0.012))",
                              backdropFilter:"blur(18px) saturate(1.2)", WebkitBackdropFilter:"blur(18px) saturate(1.2)",
                              boxShadow:"0 8px 24px rgba(0,0,0,0.10)",
                              transition:"background .18s ease,border-color .18s ease,box-shadow .18s ease", height:"100%", boxSizing:"border-box",
                            }}
                              onMouseEnter={e => { e.currentTarget.style.background="linear-gradient(135deg,rgba(255,255,255,0.052),rgba(255,255,255,0.020))"; e.currentTarget.style.borderColor="rgba(255,255,255,0.12)"; e.currentTarget.style.boxShadow="0 10px 28px rgba(0,0,0,0.14)"; }}
                              onMouseLeave={e => { e.currentTarget.style.background="linear-gradient(135deg,rgba(255,255,255,0.035),rgba(255,255,255,0.012))"; e.currentTarget.style.borderColor="rgba(255,255,255,0.075)"; e.currentTarget.style.boxShadow="0 8px 24px rgba(0,0,0,0.10)"; }}>
                              <div style={{ width:24, height:24, borderRadius:8, border:"1px solid rgba(255,255,255,0.085)", background:"rgba(255,255,255,0.025)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                                <svg width="10" height="10" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="rgba(255,255,255,0.46)" strokeWidth="1.35" strokeLinecap="round"/></svg>
                              </div>
                              <div>
                                <div style={{ fontSize:10, fontWeight:600, color:"rgba(255,255,255,0.58)", letterSpacing:"0.005em", lineHeight:1 }}>Comparer</div>
                                <div style={{ fontSize:8.5, color:"rgba(255,255,255,0.30)", marginTop:3, lineHeight:1 }}>ajouter un actif</div>
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
                                        <div key={bm.ticker} onClick={() => { setCustomBmTicker(bm.ticker); setCustomBmName(bm.name); setCustomBmType(bm.type); setShowBmSearch(false); setBmQuery(""); setSyncView(false); }}
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
                                    <div key={asset.ticker} onClick={() => { setCustomBmTicker(asset.ticker); setCustomBmName(asset.name); setCustomBmType(asset.type); setShowBmSearch(false); setBmQuery(""); setSyncView(false); }}
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
              <div className={chartDisplayMode === "black" ? undefined : "chart-glass-container"} data-glass-edge="" style={{
                border:chartDisplayMode === "black" ? "1px solid rgba(255,255,255,0.30)" : "1px solid rgba(205,225,255,0.16)", borderRadius:"30px", padding:"14px 18px 10px",
                flex:"1 1 0", minHeight:0, display:"flex", flexDirection:"column", position:"relative", overflow:"hidden",
                background:chartDisplayMode === "black" ? "linear-gradient(180deg, #0b0b0b 0%, #070707 100%)" : "rgba(9,27,52,0.78)",
                backdropFilter:chartDisplayMode === "black" ? "none" : "blur(28px) saturate(1.2)", WebkitBackdropFilter:chartDisplayMode === "black" ? "none" : "blur(28px) saturate(1.2)",
                boxShadow:chartDisplayMode === "black" ? "0 16px 44px rgba(0,0,0,0.28)" : "0 12px 36px rgba(0,0,0,0.10)",
              }}>
                {/* Radial glow derrière le graphique */}
                <div style={{ position:"absolute", inset:chartDisplayMode === "black" ? 0 : -28, pointerEvents:"none", zIndex:0, filter:chartDisplayMode === "black" ? "none" : "blur(20px)", opacity:chartDisplayMode === "black" ? 1 : 0.78, background:chartDisplayMode === "black" ? "radial-gradient(ellipse 62% 38% at 12% 0%, rgba(255,255,255,0.018) 0%, transparent 72%)" : "radial-gradient(ellipse 90% 72% at -10% -10%, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.014) 42%, rgba(255,255,255,0) 82%), radial-gradient(ellipse 86% 75% at 110% 112%, rgba(60,113,184,0.045) 0%, rgba(60,113,184,0.018) 44%, rgba(60,113,184,0) 84%)" }}/>
                <GrowthChart
                  portfolioData={scaledPortfolioData}
                  benchmarkData={syncView ? [] : activeBmData}
                  benchmarkRawData={syncView ? undefined : (customBmTicker ? rawCustomBmData : undefined)}
                  // Overlaid comparison: Percentage re-bases both series to the
                  // left edge of the visible range, so zooming answers "who did
                  // better over *this* window" — without it the curves stay
                  // anchored to the start of the loaded history and read flat.
                  //
                  // Percentage rather than IndexedTo100: the latter overrides
                  // the series price formatter and labels the axis with raw
                  // index values (0…6500), which reads as meaningless numbers.
                  priceScaleMode={customBmTicker && !syncView ? 2 : 0}
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
                  displayMode={chartDisplayMode}
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
                  externalPeriod={syncView ? activePeriod : undefined}
                  externalInterval={syncView ? activeInterval : undefined}
                  hideControls={syncView}
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

                      {/* Le mode de surface verre/noir vit désormais dans le header global. */}

                      {/* Contrôles du mode comparaison */}
                      {customBmTicker && (
                        <div style={{ display:"flex", alignItems:"center", gap:6, marginRight:2 }}>
                          {/* Superposé / séparé */}
                          <div style={{ display:"inline-flex", padding:2, borderRadius:9, gap:2,
                            border:"1px solid rgba(255,255,255,0.12)", background:"rgba(255,255,255,0.05)" }}>
                            {([["overlay","Superposé","Les deux actifs sur un même axe, ramenés à une base commune — pour voir lequel surperforme"],
                               ["split","Séparé","Un graphique par actif, chacun avec son axe de prix — pour lire les niveaux absolus"]] as const)
                              .map(([v,label,title]) => {
                                const active = (v === "overlay") === !syncView;
                                return (
                                  <button key={v} title={title} onClick={() => setSyncView(v === "split")}
                                    style={{ padding:"4px 9px", borderRadius:7, border:"none", cursor:"pointer",
                                      fontSize:10, fontWeight: active ? 650 : 500, letterSpacing:"0.02em",
                                      color: active ? "#F8F9FC" : "rgba(255,255,255,0.52)",
                                      background: active ? "rgba(155,185,255,0.22)" : "transparent" }}>
                                    {label}
                                  </button>
                                );
                              })}
                          </div>

                          {/* Repère de lecture : en superposé l'axe est un
                              indice recalculé sur la fenêtre visible, pas un prix. */}
                          {!syncView && (
                            <span title="Les deux courbes repartent de 0 % au début de la période choisie : l'écart lu à droite est la surperformance sur cette période. Le zoom est figé en comparaison pour que ce point de référence reste unique — utilise les boutons de période pour changer de fenêtre. La ligne horizontale marque le départ commun."
                              style={{ padding:"4px 9px", borderRadius:9, fontSize:10, fontWeight:600,
                                letterSpacing:"0.02em", color:"rgba(255,255,255,0.62)", cursor:"help",
                                border:"1px solid rgba(255,255,255,0.12)", background:"rgba(255,255,255,0.05)" }}>
                              Écart en %
                            </span>
                          )}
                        </div>
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
                  {/* Commandes communes — performances alignées + intervalle synchronisé */}
                  <div style={{
                    order:1, margin:"4px 0 -1px", padding:"5px 18px 4px", flexShrink:0,
                    display:"flex", flexDirection:"column", alignItems:"center", gap:4,
                  }}>
                    <div style={{
                      width:"min(100%, 690px)", display:"grid",
                      gridTemplateColumns:"58px repeat(8, minmax(48px, 1fr))", alignItems:"stretch",
                    }}>
                      <div style={{ display:"grid", gridTemplateRows:"20px 18px 20px", alignItems:"center", paddingRight:8 }}>
                        <span style={{ fontSize:9, fontWeight:700, color:lineColor ?? color, letterSpacing:"0.04em", textAlign:"right" }}>{shortLabel}</span>
                        <span style={{ fontSize:8, color:"rgba(255,255,255,0.22)", letterSpacing:"0.09em", textTransform:"uppercase", textAlign:"right" }}>Période</span>
                        <span style={{ fontSize:9, fontWeight:700, color:activeBmColor, letterSpacing:"0.04em", textAlign:"right" }}>
                          {customBmTicker.replace(/-USD$/,"-").replace(/-$/," ").replace(/^\^/,"").replace(/\.[A-Z]+$/," ").trim()}
                        </span>
                      </div>
                      {COMPARISON_PERIODS.map(period => {
                        const primaryPerf = primaryPeriodPerformances[period];
                        const secondaryPerf = secondaryPeriodPerformances[period];
                        const active = activePeriod === period;
                        const perfColor = (value: number | null) => value === null
                          ? "rgba(255,255,255,0.22)"
                          : value >= 0 ? "#34d399" : "#fb4f55";
                        return (
                          <button key={period} onClick={() => selectComparisonPeriod(period)} style={{
                            display:"grid", gridTemplateRows:"20px 18px 20px", alignItems:"center",
                            minWidth:0, padding:"0 3px", border:0, borderRadius:8, cursor:"pointer",
                            background:active ? "rgba(255,255,255,0.052)" : "transparent",
                            boxShadow:active ? `inset 0 0 0 1px rgba(255,255,255,0.07)` : "none",
                            transition:"background .15s ease, box-shadow .15s ease",
                          }}>
                            <span style={{ fontSize:10, fontWeight:650, color:perfColor(primaryPerf), fontVariantNumeric:"tabular-nums", opacity:active ? 1 : .78 }}>
                              {formatComparisonPerformance(primaryPerf)}
                            </span>
                            <span style={{
                              alignSelf:"stretch", display:"flex", alignItems:"center", justifyContent:"center",
                              fontSize:9.5, fontWeight:active ? 720 : 600,
                              color:active ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.43)",
                              borderBottom:active ? `2px solid ${lineColor ?? color}` : "2px solid transparent",
                            }}>{period}</span>
                            <span style={{ fontSize:10, fontWeight:650, color:perfColor(secondaryPerf), fontVariantNumeric:"tabular-nums", opacity:active ? 1 : .78 }}>
                              {formatComparisonPerformance(secondaryPerf)}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div style={{
                      display:"flex", alignItems:"center", gap:2, padding:"2px 4px",
                      borderRadius:8, background:"rgba(255,255,255,0.025)",
                      border:"1px solid rgba(255,255,255,0.045)",
                    }}>
                      <span style={{ fontSize:8, color:"rgba(255,255,255,0.25)", letterSpacing:"0.08em", textTransform:"uppercase", padding:"0 5px 0 3px" }}>Intervalle</span>
                      {COMPARISON_INTERVALS.map(interval => {
                        const allowed = (COMPARISON_ALLOWED_INTERVALS[activePeriod] ?? []).includes(interval);
                        const active = activeInterval === interval;
                        return (
                          <button key={interval} disabled={!allowed} onClick={() => allowed && setActiveInterval(interval)} style={{
                            minWidth:28, height:20, padding:"0 5px", borderRadius:5,
                            border:active ? "1px solid rgba(155,185,255,0.26)" : "1px solid transparent",
                            background:active ? "rgba(91,141,239,0.13)" : "transparent",
                            color:!allowed ? "rgba(255,255,255,0.11)" : active ? "#9BB9FF" : "rgba(255,255,255,0.38)",
                            fontSize:9, fontWeight:active ? 700 : 550, cursor:allowed ? "pointer" : "default",
                          }}>{interval}</button>
                        );
                      })}
                    </div>
                  </div>

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
                      flex:"1 1 0", minWidth:0,
                      background:"rgba(255,255,255,0.018)",
                      border:"1px solid rgba(255,255,255,0.055)",
                      borderRadius:12, padding:"11px 12px 10px", display:"flex", flexDirection:"column",
                      position:"relative", transition:"background 0.16s ease, border-color 0.16s ease", cursor:"default",
                      overflow:"hidden",
                    };
                    const groupBase: React.CSSProperties = {
                      minWidth:0, display:"flex", flexDirection:"column", gap:8,
                      padding:"10px 18px 12px", borderRadius:16,
                      background:"rgba(255,255,255,0.02)",
                      border:"1px solid rgba(255,255,255,0.06)",
                      overflow:"hidden",
                    };
                    const hov = (e: React.MouseEvent<HTMLDivElement>) => {
                      e.currentTarget.style.background="linear-gradient(145deg, rgba(255,255,255,0.048) 0%, rgba(255,255,255,0.021) 100%)";
                      e.currentTarget.style.borderColor="rgba(255,255,255,0.075)";
                    };
                    const unHov = (e: React.MouseEvent<HTMLDivElement>) => {
                      e.currentTarget.style.background="rgba(255,255,255,0.018)";
                      e.currentTarget.style.borderColor="rgba(255,255,255,0.055)";
                    };

                    const Lbl = ({ k, txt }: { k:string; txt:string }) => (
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:7 }}>
                        <span style={{ fontSize:9, fontWeight:550, color:"rgba(255,255,255,0.38)", letterSpacing:"0.085em", textTransform:"uppercase" as const }}>{txt}</span>
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

                    const Expl = ({ txt }: { txt:string }) => (
                      <span style={{ fontSize:9.25, color:"rgba(255,255,255,0.43)", lineHeight:1.48, marginTop:6, display:"block" }}>{txt}</span>
                    );
                    const comparisonPeriodLabel = ({
                      "24h":"24 h", "1S":"1 semaine", "1M":"1 mois", "3M":"3 mois",
                      "6M":"6 mois", "1A":"1 an", "3A":"3 ans", "Max":"Max",
                    } as Record<string,string>)[activePeriod] ?? activePeriod;
                    const directionLabel = syncStats.sameDir >= 70
                      ? "Mouvements souvent synchrones"
                      : syncStats.sameDir < 50
                      ? "Mouvements souvent opposés"
                      : "Synchronisation modérée";

                    return (
                      <div className="comparison-insights-grid" style={{ order:3, display:"grid", gridTemplateColumns:"1.42fr 1.42fr .96fr", gap:8, marginTop:6, flexShrink:0, alignItems:"stretch" }}>
                        {/* Relation entre les actifs */}
                        <section style={groupBase}>
                          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                            <span style={{ fontSize:8.5, fontWeight:650, color:"rgba(255,255,255,0.46)", letterSpacing:"0.10em", textTransform:"uppercase" }}>Relation entre les actifs</span>
                            <span style={{ fontSize:8.5, color:"rgba(255,255,255,0.28)" }}>Sur {comparisonPeriodLabel}</span>
                          </div>
                          <div style={{ display:"flex", gap:8, flex:1, minHeight:0 }}>
                            <div style={cardBase} onMouseEnter={hov} onMouseLeave={unHov}>
                              <TT k="corr"/><Lbl k="corr" txt="Corrélation"/>
                              <span style={{ fontSize:23, fontWeight:720, letterSpacing:"-0.025em", color:"#F8F9FC", fontVariantNumeric:"tabular-nums" as const, lineHeight:1, marginBottom:5 }}>{syncStats.corr.toFixed(2)}</span>
                              <span style={{ fontSize:10, fontWeight:620, color:corrLabel.c }}>{corrLabel.t}</span>
                              <Expl txt={corrExpl}/>
                            </div>
                            <div style={cardBase} onMouseEnter={hov} onMouseLeave={unHov}>
                              <TT k="dir"/><Lbl k="dir" txt="Même direction"/>
                              <span style={{ fontSize:23, fontWeight:720, letterSpacing:"-0.025em", color:"#F8F9FC", fontVariantNumeric:"tabular-nums" as const, lineHeight:1, marginBottom:5 }}>{syncStats.sameDir}%</span>
                              <span style={{ fontSize:10, fontWeight:620, color:"#9BB9FF" }}>{directionLabel}</span>
                              <Expl txt={`${syncStats.sameDirN} séances similaires sur ${syncStats.totalN} observées.`}/>
                            </div>
                          </div>
                        </section>

                        {/* Risque & performance */}
                        <section style={groupBase}>
                          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                            <span style={{ fontSize:8.5, fontWeight:650, color:"rgba(255,255,255,0.46)", letterSpacing:"0.10em", textTransform:"uppercase" }}>Risque &amp; performance</span>
                            <span style={{ fontSize:8.5, color:"rgba(255,255,255,0.28)" }}>Sur {comparisonPeriodLabel}</span>
                          </div>
                          <div style={{ display:"flex", gap:8, flex:1, minHeight:0 }}>
                            <div style={cardBase} onMouseEnter={hov} onMouseLeave={unHov}>
                              <TT k="beta"/><Lbl k="beta" txt="Bêta"/>
                              <span style={{ fontSize:23, fontWeight:720, letterSpacing:"-0.025em", color:"#F8F9FC", fontVariantNumeric:"tabular-nums" as const, lineHeight:1, marginBottom:5 }}>{syncStats.beta.toFixed(2)}×</span>
                              <span style={{ fontSize:10, fontWeight:620, color:betaLabel.c }}>{betaLabel.t}</span>
                              <Expl txt={betaExpl}/>
                            </div>
                            <div style={cardBase} onMouseEnter={hov} onMouseLeave={unHov}>
                              <TT k="alpha"/><Lbl k="alpha" txt="Alpha"/>
                              <span style={{ fontSize:23, fontWeight:720, letterSpacing:"-0.025em", color:syncStats.alpha > 5 ? "#4ade80" : syncStats.alpha < -5 ? "#ff5b5f" : "#F8F9FC", fontVariantNumeric:"tabular-nums" as const, lineHeight:1, marginBottom:5 }}>{syncStats.alpha > 0 ? "+" : ""}{syncStats.alpha.toFixed(1)}%</span>
                              <span style={{ fontSize:10, fontWeight:620, color:alphaLabel.c }}>{alphaLabel.t}</span>
                              <Expl txt={alphaExpl}/>
                            </div>
                          </div>
                        </section>

                        {/* Lecture rapide */}
                        <section className="comparison-summary" style={{ ...groupBase, position:"relative", overflow:"hidden", background:"linear-gradient(145deg, rgba(123,167,247,0.050) 0%, rgba(123,167,247,0.018) 52%, rgba(255,255,255,0.012) 100%)" }}>
                          <div aria-hidden="true" style={{ position:"absolute", right:16, top:44, width:31, height:31, borderRadius:"50%", background:`${color}2E`, opacity:.55 }}/>
                          <div aria-hidden="true" style={{ position:"absolute", right:1, top:44, width:31, height:31, borderRadius:"50%", background:`${activeBmColor}32`, opacity:.55 }}/>
                          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", position:"relative", zIndex:1 }}>
                            <span style={{ fontSize:9.5, fontWeight:680, color:"rgba(255,255,255,0.82)", letterSpacing:"0.015em" }}>Lecture rapide</span>
                            <span style={{ fontSize:8.5, color:"rgba(255,255,255,0.32)" }}>Sur {comparisonPeriodLabel}</span>
                          </div>
                          <div style={{ display:"flex", flexDirection:"column", gap:9, paddingTop:12, paddingRight:30, position:"relative", zIndex:1 }}>
                            <p style={{ fontSize:10.5, fontWeight:620, color:"rgba(255,255,255,0.78)", lineHeight:1.5, margin:0 }}>{aiLines[0]}</p>
                            <p style={{ fontSize:9.5, color:"rgba(255,255,255,0.48)", lineHeight:1.55, margin:0 }}>{aiLines[1]}</p>
                          </div>
                        </section>
                      </div>
                    );
                  })()}

                  {/* Second chart — benchmark */}
                  <div
                    className={chartDisplayMode === "black" ? undefined : "chart-glass-container"}
                    data-glass-edge=""
                    style={{
                      order:2, border:chartDisplayMode === "black" ? "1px solid rgba(255,255,255,0.30)" : "1px solid rgba(205,225,255,0.16)", borderRadius:"30px", padding:"14px 18px 10px",
                      flex:"1 1 0", minHeight:0, display:"flex", flexDirection:"column", position:"relative", overflow:"hidden", marginTop:6,
                      background:chartDisplayMode === "black" ? "linear-gradient(180deg, #0b0b0b 0%, #070707 100%)" : "rgba(9,27,52,0.78)",
                      backdropFilter:chartDisplayMode === "black" ? "none" : "blur(28px) saturate(1.2)", WebkitBackdropFilter:chartDisplayMode === "black" ? "none" : "blur(28px) saturate(1.2)",
                      boxShadow:chartDisplayMode === "black" ? "0 16px 44px rgba(0,0,0,0.28)" : "0 12px 36px rgba(0,0,0,0.10)",
                    }}>
                    <div style={{ position:"absolute", inset:chartDisplayMode === "black" ? 0 : -28, pointerEvents:"none", zIndex:0, filter:chartDisplayMode === "black" ? "none" : "blur(20px)", opacity:chartDisplayMode === "black" ? 1 : 0.78, background:chartDisplayMode === "black" ? "radial-gradient(ellipse 62% 38% at 12% 0%, rgba(255,255,255,0.018) 0%, transparent 72%)" : "radial-gradient(ellipse 90% 72% at -10% -10%, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.014) 42%, rgba(255,255,255,0) 82%), radial-gradient(ellipse 86% 75% at 110% 112%, rgba(60,113,184,0.045) 0%, rgba(60,113,184,0.018) 44%, rgba(60,113,184,0) 84%)" }}/>
                    <GrowthChart
                      ticker={customBmTicker}
                      portfolioData={rawCustomBmData}
                      benchmarkData={[]}
                      benchmarkName=""
                      portfolioLabel={customBmTicker.replace(/-USD$/,"").replace(/^\^/,"")}
                      portfolioColor={activeBmColor}
                      displayMode={chartDisplayMode}
                      livePrice={bmCurrentPrice?.price}
                      dailyChangePct={bmCurrentPrice?.change ?? null}
                      dark={true}
                      priceMode={true}
                      hideDrawdown={true}
                      isCrypto={isBmCrypto}
                      externalPeriod={activePeriod}
                      externalInterval={activeInterval}
                      onPeriodChange={setActivePeriod}
                      onIntervalChange={setActiveInterval}
                      hideControls={true}
                      leftSlot={bmMetaCards.length > 0 ? (
                        <div style={{ display:"flex", alignItems:"center", gap:0, overflow:"hidden" }}>
                          {bmMetaCards.map((card, i) => (
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
                    />
                  </div>
                </>
              )}

              {/* Sub-panel — en dessous, hauteur fixe, pas de scroll */}
              {subOpen ? (
                <div style={{ order:4, background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:12, marginTop:4, flexShrink:0, display:"flex", flexDirection:"column" }}>
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
                <div
                  className={chartDisplayMode === "black" ? undefined : "chart-glass-container"}
                  style={{
                    width:336,
                    flexShrink:0,
                    display:"flex",
                    flexDirection:"column",
                    boxSizing:"border-box",
                    background:chartDisplayMode === "black"
                      ? "linear-gradient(180deg, #0b0b0b 0%, #070707 100%)"
                      : "rgba(9,27,52,0.78)",
                    border:chartDisplayMode === "black"
                      ? "1px solid rgba(255,255,255,0.30)"
                      : "1px solid rgba(205,225,255,0.16)",
                    borderRadius:30,
                    overflow:"hidden",
                    backdropFilter:chartDisplayMode === "black" ? "none" : "blur(28px) saturate(1.2)",
                    WebkitBackdropFilter:chartDisplayMode === "black" ? "none" : "blur(28px) saturate(1.2)",
                    boxShadow:chartDisplayMode === "black"
                      ? "0 16px 44px rgba(0,0,0,0.28)"
                      : "0 12px 36px rgba(0,0,0,0.10)",
                  }}
                >
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
                        const seenNews = new Set<string>();
                        const scored = news
                          .map(n => ({
                            ...n,
                            ...scoreNews(n.title),
                            timestamp: newsTimestamp(n.published_at),
                          }))
                          .filter(n => {
                            const normalizedTitle = n.title
                              .normalize("NFD")
                              .replace(/[\u0300-\u036f]/g, "")
                              .toLowerCase()
                              .replace(/[^a-z0-9]+/g, " ")
                              .trim();
                            const key = n.link || normalizedTitle;
                            if (!key || seenNews.has(key)) return false;
                            seenNews.add(key);
                            return true;
                          });
                        const impactRank: Record<NewsImpact, number> = { high:0, medium:1, low:2 };
                        const sorted = [...scored].sort((a,b) => newsSortBy === "impact"
                          ? impactRank[a.impact] - impactRank[b.impact] || b.timestamp - a.timestamp
                          : b.timestamp - a.timestamp);
                        return (
                          <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
                            {/* Sort bar */}
                            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                              <span style={{ fontSize:9, letterSpacing:"0.08em", color:"rgba(255,255,255,0.25)", textTransform:"uppercase" as const }}>
                                {sorted.length} actualité{sorted.length > 1 ? "s" : ""}
                              </span>
                              <div style={{ display:"flex", alignItems:"center", padding:2, borderRadius:8, gap:1,
                                background:"rgba(255,255,255,0.035)", border:"1px solid rgba(255,255,255,0.07)" }}>
                                {(["recent","impact"] as const).map(s => (
                                  <button key={s} onClick={() => setNewsSortBy(s)}
                                    title={s === "impact" ? "Trier par impact estimé" : "Trier par date de publication"}
                                    style={{
                                    fontSize:9, fontWeight:600, letterSpacing:"0.045em", padding:"3px 9px", borderRadius:6, cursor:"pointer",
                                    border:"none",
                                    background: newsSortBy===s ? "rgba(91,141,239,0.20)" : "transparent",
                                    color: newsSortBy===s ? "#9BB9FF" : "rgba(255,255,255,0.35)",
                                    boxShadow: newsSortBy===s ? "inset 0 0 0 1px rgba(155,185,255,0.30), 0 2px 6px rgba(0,0,0,0.14)" : "none",
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
                              const timeAgo = formatNewsAge(n.timestamp);

                              const imp = IMPACT_CONFIG[n.impact];

                              return (
                                <a key={n.link || `${n.title}-${i}`} href={n.link} target="_blank" rel="noopener noreferrer"
                                  className="news-card-link"
                                  style={{ display:"flex", flexDirection:"column", gap:6, padding:"9px 10px", borderRadius:11, background:"rgba(255,255,255,0.023)", border:"1px solid rgba(255,255,255,0.058)", textDecoration:"none" }}>
                                  {/* Top row: type + impact badge */}
                                  <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                                    <span style={{ fontSize:8, fontWeight:650, letterSpacing:"0.075em", padding:"1.5px 6px", borderRadius:5,
                                      background:"rgba(255,255,255,0.08)", color:"rgba(255,255,255,0.50)", textTransform:"uppercase" as const }}>
                                      {n.type}
                                    </span>
                                    <span title="Impact estimé à partir du titre et du type d’événement" style={{ fontSize:8, fontWeight:650, letterSpacing:"0.045em", padding:"1.5px 6px", borderRadius:5,
                                      background:imp.bg, color:imp.color, display:"flex", alignItems:"center", gap:3 }}>
                                      <span style={{ width:4, height:4, borderRadius:"50%", background:imp.dot, display:"inline-block", flexShrink:0 }}/>
                                      {imp.label}
                                    </span>
                                    <span style={{ marginLeft:"auto", fontSize:8.5, color:"rgba(255,255,255,0.27)", whiteSpace:"nowrap" }}>{timeAgo}{timeAgo ? " · " : ""}{n.readMin} min</span>
                                  </div>
                                  {/* Content row */}
                                  <div style={{ display:"flex", gap:9, alignItems:"center" }}>
                                    {n.thumbnail ? (
                                      <img src={n.thumbnail} alt="" width={42} height={42}
                                        style={{ borderRadius:7, objectFit:"cover" as const, flexShrink:0, background:"rgba(255,255,255,.04)" }}
                                        onError={e => { (e.target as HTMLImageElement).style.display="none"; }} />
                                    ) : (
                                      <div style={{
                                        width:42, height:42, borderRadius:7, flexShrink:0,
                                        background: ["rgba(91,141,239,0.18)","rgba(139,92,246,0.18)","rgba(34,197,94,0.14)","rgba(249,115,22,0.16)","rgba(236,72,153,0.16)"][
                                          (n.publisher?.charCodeAt(0) ?? 65) % 5
                                        ],
                                        display:"flex", alignItems:"center", justifyContent:"center",
                                        fontSize:17, fontWeight:700, color:"rgba(255,255,255,0.45)",
                                      }}>
                                        {n.publisher?.[0]?.toUpperCase() ?? "N"}
                                      </div>
                                    )}
                                    <div style={{ flex:1, minWidth:0 }}>
                                      <div style={{ fontSize:10.5, fontWeight:560, color:"rgba(255,255,255,0.86)", lineHeight:1.38,
                                        display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" as const, overflow:"hidden" }}>
                                        {n.title}
                                      </div>
                                      <div style={{ marginTop:3, display:"flex", alignItems:"center", gap:5 }}>
                                        <span style={{ fontSize:8.8, color:"rgba(255,255,255,0.34)", fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{n.publisher}</span>
                                        <span className="news-card-arrow" style={{ marginLeft:"auto", fontSize:10, lineHeight:1, color:"rgba(91,141,239,0.62)", opacity:.75 }}>→</span>
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
                          {(["sector","geography","marketcap"] as const).map(by => {
                            const labels = {sector:"Secteur", geography:"Géographie", marketcap:"Market Cap"};
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
                          <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                            {similar.map(s => {
                              const info = TRENDING.find(t => t.ticker === s.ticker);
                              const name = info?.name ?? s.ticker;
                              const assetType = info?.type ?? s.type ?? "EQUITY";
                              const assetTypeLabel = ({EQUITY:"Action",ETF:"ETF",INDEX:"Indice",CRYPTOCURRENCY:"Crypto"} as Record<string,string>)[assetType] ?? assetType;
                              const exchange = info?.exchange ? (_EXCH[info.exchange] ?? info.exchange) : "";
                              const assetColor = BRAND_COLORS[s.ticker] ?? "#5B8DEF";
                              const currency = assetType === "CRYPTOCURRENCY" ? "USD" : ({
                                PAR:"EUR", GER:"EUR", AMS:"EUR", MIL:"EUR", MCE:"EUR",
                                LSE:"GBP", SWX:"CHF", TOR:"CAD", TSX:"CAD", HKG:"HKD",
                                JPX:"JPY", TYO:"JPY", ASX:"AUD",
                              } as Record<string,string>)[info?.exchange ?? ""] ?? "USD";
                              const pos = s.change >= 0;
                              return (
                                <button key={s.ticker}
                                  type="button"
                                  className="asset-hero-card similar-asset-card"
                                  data-border=""
                                  onClick={() => {
                                    const url = new URL(window.location.href);
                                    url.searchParams.set("ticker", s.ticker);
                                    router.push(`${url.pathname}${url.search}`);
                                  }}
                                  style={{
                                    position:"relative", isolation:"isolate", overflow:"hidden", width:"100%", minHeight:66,
                                    display:"grid", gridTemplateColumns:"42px minmax(0,1fr) auto", alignItems:"center", gap:10,
                                    padding:"9px 10px", border:0, borderRadius:16, color:assetColor, cursor:"pointer",
                                    fontFamily:"inherit", textAlign:"left", appearance:"none",
                                    background:`radial-gradient(ellipse 72% 110% at 0% 0%, ${assetColor}42 0%, ${assetColor}25 48%, ${assetColor}00 100%), radial-gradient(ellipse 72% 110% at 100% 100%, ${assetColor}38 0%, ${assetColor}20 48%, ${assetColor}00 100%), linear-gradient(138deg, ${assetColor}1D 0%, ${assetColor}24 50%, ${assetColor}1B 100%), rgba(4,16,35,0.78)`,
                                    boxShadow:`0 6px 18px rgba(0,0,0,0.18), 0 0 20px ${assetColor}08`,
                                  }}>
                                  <div className="asset-hero-reflection"/>
                                  <div style={{ position:"relative", zIndex:1, display:"flex", alignItems:"center" }}>
                                    <AssetLogo ticker={s.ticker} type={assetType} size={42} radius={10}
                                      fallbackBg="rgba(255,255,255,0.07)" fallbackBorder="rgba(255,255,255,0.10)" fallbackTextColor="rgba(255,255,255,0.52)" bare />
                                  </div>
                                  <div style={{ position:"relative", zIndex:1, minWidth:0, alignSelf:"stretch", display:"flex", flexDirection:"column", justifyContent:"center" }}>
                                    <span style={{ fontSize:12.5, lineHeight:1, fontWeight:760, letterSpacing:"-0.02em", color:"#F8F9FC", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.ticker}</span>
                                    <span style={{ marginTop:4, fontSize:9, lineHeight:1, color:"rgba(255,255,255,0.52)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{name}</span>
                                    <div style={{ display:"flex", alignItems:"center", gap:5, marginTop:6, minWidth:0 }}>
                                      <span className="asset-meta-pill" style={{ minHeight:15, padding:"2px 6px", fontSize:8, color:"rgba(255,255,255,0.70)" }}>{assetTypeLabel}</span>
                                      {(similarBy === "marketcap" ? s.market_cap != null : (exchange || s.country)) && (
                                        <span className="asset-meta-pill" style={{ minHeight:15, maxWidth:88, padding:"2px 6px", fontSize:8, color:"rgba(255,255,255,0.52)", fontWeight:500, overflow:"hidden", textOverflow:"ellipsis" }}>
                                          <span style={{ overflow:"hidden", textOverflow:"ellipsis" }}>
                                            {similarBy === "marketcap" && s.market_cap != null ? `Cap ${_fmtC(s.market_cap)}` : (exchange || s.country)}
                                          </span>
                                          {similarBy !== "marketcap" && info?.exchange && _EXCH_FLAG[info.exchange] && <img className="asset-exchange-flag" style={{ width:10, height:10 }} src={`https://hatscripts.github.io/circle-flags/flags/${_EXCH_FLAG[info.exchange]}.svg`} alt="" />}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div style={{ position:"relative", zIndex:1, minWidth:62, textAlign:"right", display:"flex", flexDirection:"column", alignItems:"flex-end", justifyContent:"center", gap:6 }}>
                                    <div style={{ display:"flex", alignItems:"baseline", justifyContent:"flex-end", gap:4, whiteSpace:"nowrap" }}>
                                      <span style={{ fontSize:13, lineHeight:1, fontWeight:680, letterSpacing:"-0.025em", color:"rgba(255,255,255,0.92)", fontVariantNumeric:"tabular-nums" as const }}>{_fmtN(s.price)}</span>
                                      <span style={{ fontSize:7.5, lineHeight:1, fontWeight:600, color:"rgba(255,255,255,0.38)", letterSpacing:"0.04em" }}>{currency}</span>
                                    </div>
                                    <span className="asset-performance-pill" style={{ minHeight:16, padding:"2px 7px", fontSize:8.5, color:pos?"#4ade80":"#ef4444", background:pos?"rgba(34,197,94,0.23)":"rgba(239,68,68,0.23)", fontVariantNumeric:"tabular-nums" as const }}>
                                      {pos?"+":"−"}{Math.abs(s.change).toFixed(2)}%
                                    </span>
                                  </div>
                                </button>
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
