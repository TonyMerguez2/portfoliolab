"use client";
import { useState, useEffect, useRef, CSSProperties, memo } from "react";
import { BRAND_COLORS } from "@/lib/assets";

const _idxCache  = new Map<string, number>();
type LogoMeta = { hasBg: boolean; isDark: boolean };
const _metaCache = new Map<string, LogoMeta>();

// Same formula as LiquidGlassTreemap tiles
function brandGlassBg(ticker: string): string {
  const hex = BRAND_COLORS[ticker.replace(/-USD$/, "")];
  let r = 91, g = 141, b = 239;
  if (hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (m) { r = parseInt(m[1],16); g = parseInt(m[2],16); b = parseInt(m[3],16); }
  } else {
    // deterministic hash fallback (same as treemap)
    let h = 2166136261;
    for (let i = 0; i < ticker.length; i++) { h ^= ticker.charCodeAt(i); h = Math.imul(h, 16777619); }
    h = h >>> 0;
    r = 100 + (h & 0x7F); g = 100 + ((h >> 8) & 0x7F); b = 140 + ((h >> 16) & 0x5F);
  }
  const shine = "linear-gradient(160deg,rgba(255,255,255,0.07) 0%,rgba(255,255,255,0) 35%)";
  const dark  = `rgba(${Math.round(r*0.14)},${Math.round(g*0.10)},${Math.round(b*0.10)},0.90)`;
  return `${shine},${dark}`;
}

function cryptoSymbol(ticker: string): string {
  return ticker.replace(/-USD$/, "").replace(/[0-9]+$/, "").toLowerCase();
}

const CMC_IDS: Record<string, number> = {
  btc:1, eth:1027, bnb:1839, sol:5426, xrp:52, doge:74, ada:2010,
  avax:5805, dot:6636, shib:5994, matic:3890, pol:3890, link:1975,
  uni:7083, ltc:2, atom:3794, trx:1958, etc:1321, xlm:512, fil:2280,
  hbar:4642, apt:21794, arb:11841, op:11840, sui:20947, pepe:24478,
  wif:28752, inj:7226, sei:23149, jup:29210, near:6535, vet:3077,
  mkr:1518, aave:7278, sand:6210, mana:1966, crv:6538, comp:5692,
  snx:2586, ens:13855, imx:10603, rune:4157, ftm:3513, s:3513,
  algo:4030, icp:8916, qnt:3155, eos:1765, flow:4558, ksm:5034,
  xmr:328, zec:1437, bch:1831, ton:11419, wld:13502, stx:4847,
  floki:10804, bonk:23095, render:5690, fet:3773, grt:6719, ldo:8000,
};

function resolveUrls(ticker: string, type?: string): string[] {
  const isCrypto = type === "CRYPTOCURRENCY" || ticker.endsWith("-USD");
  if (isCrypto) {
    const sym = cryptoSymbol(ticker);
    const cmcId = CMC_IDS[sym];
    const urls: string[] = [];
    if (cmcId) urls.push(`https://s2.coinmarketcap.com/static/img/coins/64x64/${cmcId}.png`);
    urls.push(`https://assets.coincap.io/assets/icons/${sym}@2x.png`);
    urls.push(`https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons/128/color/${sym}.png`);
    return urls;
  }
  const clean = ticker.replace(/\.[A-Z]{1,3}$/, "").replace(/^\^/, "");
  const urls = [
    `https://assets.parqet.com/logos/symbol/${encodeURIComponent(ticker)}?format=png`,
    `https://financialmodelingprep.com/image-stock/${ticker}.png`,
  ];
  if (clean !== ticker) urls.push(`https://financialmodelingprep.com/image-stock/${clean}.png`);
  return urls;
}

// Canvas pixel analysis — requires crossOrigin image to avoid SecurityError
function analyzeElement(img: HTMLImageElement): LogoMeta {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, 32, 32);
  const { data } = ctx.getImageData(0, 0, 32, 32); // throws if tainted

  const a = (x: number, y: number) => data[(y * 32 + x) * 4 + 3];
  const avgCorner = (a(0,0) + a(31,0) + a(0,31) + a(31,31)) / 4;
  const hasBg = avgCorner > 200;
  if (hasBg) return { hasBg: true, isDark: false };

  let lumSum = 0, count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 50) continue;
    lumSum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    count++;
  }
  return { hasBg: false, isDark: count > 0 && lumSum / count < 100 };
}

// Load a separate crossOrigin probe image for analysis
// If CORS is blocked (FMP stocks), falls back to hasBg:true → transparent → trust the image
function analyzeAsync(src: string, cb: (m: LogoMeta) => void): void {
  const probe = new Image();
  probe.crossOrigin = "anonymous";
  probe.onload = () => {
    try { cb(analyzeElement(probe)); }
    catch { cb({ hasBg: true, isDark: false }); }
  };
  probe.onerror = () => cb({ hasBg: true, isDark: false });
  probe.src = src;
}

function extractColor(src: string, cb: (hex: string) => void): void {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      const SIZE = 32;
      const canvas = document.createElement("canvas");
      canvas.width = SIZE; canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
      type Bucket = { count: number; r: number; g: number; b: number; sat: number };
      const buckets = new Map<number, Bucket>();
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
        if (a < 50) continue;
        const brightness = (r + g + b) / 3;
        if (brightness > 220 || brightness < 15) continue;
        const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
        const sat = max === 0 ? 0 : d / max;
        if (sat < 0.15) continue;
        let h = 0;
        if (d !== 0) {
          if (max === r)      h = ((g-b)/d + (g < b ? 6 : 0)) / 6;
          else if (max === g) h = ((b-r)/d + 2) / 6;
          else                h = ((r-g)/d + 4) / 6;
        }
        const bkt = Math.floor(h * 24);
        const ex = buckets.get(bkt);
        if (!ex) buckets.set(bkt, { count:1, r, g, b, sat });
        else { ex.count++; if (sat > ex.sat) { ex.r=r; ex.g=g; ex.b=b; ex.sat=sat; } }
      }
      if (!buckets.size) return;
      let best: Bucket = { count:0, r:91, g:141, b:239, sat:0 };
      buckets.forEach(v => { if (v.count > best.count) best = v; });
      const h = (n: number) => n.toString(16).padStart(2, "0");
      cb(`#${h(best.r)}${h(best.g)}${h(best.b)}`);
    } catch { /* CORS */ }
  };
  img.src = src;
}

interface Props {
  ticker: string;
  type?: string;
  size?: number;
  radius?: number;
  style?: CSSProperties;
  fallbackBg: string;
  fallbackBorder: string;
  fallbackTextColor: string;
  bare?: boolean; // no background/border — use inside cards that already have their own surface
  onColorExtracted?: (hex: string) => void;
}

function AssetLogoInner({
  ticker, type, size = 32, radius = 8,
  style, fallbackBg, fallbackBorder, fallbackTextColor, bare, onColorExtracted,
}: Props) {
  const urls      = resolveUrls(ticker, type);
  const cachedIdx  = _idxCache.get(ticker);
  const cachedMeta = _metaCache.get(ticker);

  const [idx,    setIdx]    = useState(cachedIdx ?? 0);
  const [status, setStatus] = useState<"loading"|"ok"|"failed">(cachedIdx !== undefined ? "ok" : "loading");
  const [meta,   setMeta]   = useState<LogoMeta>(cachedMeta ?? { hasBg: true, isDark: false });

  const imgRef    = useRef<HTMLImageElement>(null);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const c = _idxCache.get(ticker);
    const m = _metaCache.get(ticker);
    setIdx(c ?? 0);
    setStatus(c !== undefined ? "ok" : "loading");
    setMeta(m ?? { hasBg: true, isDark: false });
  }, [ticker]);

  // Timeout de 4s : si l'image ne répond pas (réseau bloqué, adblocker…)
  // on bascule sur "failed" pour afficher les initiales
  useEffect(() => {
    if (status !== "loading") { if (timerRef.current) clearTimeout(timerRef.current); return; }
    timerRef.current = setTimeout(() => {
      setStatus(s => s === "loading" ? "failed" : s);
    }, 4000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [status, idx]);

  useEffect(() => {
    if (status === "loading" && imgRef.current?.complete) {
      if (imgRef.current.naturalWidth > 0) {
        onLoaded(imgRef.current);
      } else {
        if (idx + 1 < urls.length) setIdx(i => i + 1);
        else setStatus("failed");
      }
    }
  }, [idx, status]); // eslint-disable-line react-hooks/exhaustive-deps

  function onLoaded(_el: HTMLImageElement) {
    _idxCache.set(ticker, idx);
    setStatus("ok");
    analyzeAsync(urls[idx], m => {
      _metaCache.set(ticker, m);
      setMeta(m);
    });
    if (onColorExtracted) extractColor(urls[idx], onColorExtracted);
  }

  const handleError = () => {
    if (idx + 1 < urls.length) setIdx(i => i + 1);
    else setStatus("failed");
  };

  const label = ticker
    .replace(/-USD$/,"").replace(/[0-9]+$/,"")
    .replace(/\.[A-Z]{1,3}$/,"").replace(/^\^/,"")
    .slice(0,4).toUpperCase();

  const containerBg  = bare ? "transparent" : status !== "ok" ? fallbackBg : brandGlassBg(ticker);
  const containerBdr = bare ? "none"        : status !== "ok" ? "none"      : "1px solid rgba(255,255,255,0.07)";
  const showGloss   = size >= 24 && status === "ok";

  return (
    <div style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0,
      position: "relative", overflow: "hidden",
      background: containerBg,
      border: status === "failed" ? `1px solid ${fallbackBorder}` : containerBdr,
      display: "flex", alignItems: "center", justifyContent: "center",
      ...style,
    }}>

      {/* Fallback initials */}
      {status === "failed" && (
        <span style={{
          fontSize: Math.max(6, Math.floor(size * 0.27)), fontWeight: 800,
          color: fallbackTextColor, letterSpacing: "-0.02em", userSelect: "none",
        }}>
          {label}
        </span>
      )}

      {/* Logo */}
      {status !== "failed" && (
        <img
          ref={imgRef}
          key={`${ticker}-${idx}`}
          src={urls[idx]}
          alt={ticker}
          style={{
            position: "absolute", inset: 0,
            width: "100%", height: "100%",
            objectFit: "contain",
            opacity: status === "ok" ? 1 : 0,
            transition: "opacity 0.15s ease",
          }}
          onLoad={() => onLoaded(imgRef.current!)}
          onError={handleError}
        />
      )}

      {/* iOS gloss (top reflection + bottom depth + inner ring) — only ≥ 24px */}
      {showGloss && <>
        <div style={{
          position:"absolute", top:0, left:0, right:0, height:"48%",
          background:"linear-gradient(180deg,rgba(255,255,255,0.18) 0%,rgba(255,255,255,0.02) 100%)",
          pointerEvents:"none",
        }}/>
        <div style={{
          position:"absolute", bottom:0, left:0, right:0, height:"30%",
          background:"linear-gradient(0deg,rgba(0,0,0,0.16) 0%,rgba(0,0,0,0) 100%)",
          pointerEvents:"none",
        }}/>
        <div style={{
          position:"absolute", inset:0, borderRadius:"inherit",
          boxShadow:"inset 0 1px 0 rgba(255,255,255,0.14),inset 0 -1px 0 rgba(0,0,0,0.14)",
          pointerEvents:"none",
        }}/>
      </>}

    </div>
  );
}

const AssetLogo = memo(AssetLogoInner);
export default AssetLogo;
