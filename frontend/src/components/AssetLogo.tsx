"use client";
import { useState, useEffect, CSSProperties, memo } from "react";

// Module-level cache survives component remounts — ticker → working URL index
const _cache = new Map<string, number>();

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
  const urls = [`https://financialmodelingprep.com/image-stock/${ticker}.png`];
  if (clean !== ticker) urls.push(`https://financialmodelingprep.com/image-stock/${clean}.png`);
  return urls;
}

function extractColor(src: string, cb: (hex: string) => void): void {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      const SIZE = 24;
      const canvas = document.createElement("canvas");
      canvas.width = SIZE; canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
      type Bucket = { count: number; r: number; g: number; b: number; sat: number };
      const buckets = new Map<number, Bucket>();
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 50) continue;
        const brightness = (r + g + b) / 3;
        if (brightness > 225 || brightness < 18) continue;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
        const sat = max === 0 ? 0 : d / max;
        if (sat < 0.18) continue;
        let h = 0;
        if (d !== 0) {
          if (max === r)      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          else if (max === g) h = ((b - r) / d + 2) / 6;
          else                h = ((r - g) / d + 4) / 6;
        }
        const bkt = Math.floor(h * 18);
        const ex = buckets.get(bkt);
        if (!ex) {
          buckets.set(bkt, { count: 1, r, g, b, sat });
        } else {
          ex.count++;
          if (sat > ex.sat) { ex.r = r; ex.g = g; ex.b = b; ex.sat = sat; }
        }
      }
      if (!buckets.size) return;
      let best: Bucket = { count: 0, r: 91, g: 141, b: 239, sat: 0 };
      buckets.forEach(v => { if (v.count > best.count) best = v; });
      const h = (n: number) => n.toString(16).padStart(2, "0");
      cb(`#${h(best.r)}${h(best.g)}${h(best.b)}`);
    } catch { /* CORS failure — silent */ }
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
  onColorExtracted?: (hex: string) => void;
}

function AssetLogoInner({
  ticker, type, size = 32, radius = 8,
  style,
  fallbackBg, fallbackBorder, fallbackTextColor,
  onColorExtracted,
}: Props) {
  const urls = resolveUrls(ticker, type);
  const cachedIdx = _cache.get(ticker);
  const [idx, setIdx]       = useState(cachedIdx ?? 0);
  const [status, setStatus] = useState<"loading" | "ok" | "failed">(
    cachedIdx !== undefined ? "ok" : "loading"
  );

  useEffect(() => {
    const c = _cache.get(ticker);
    setIdx(c ?? 0);
    setStatus(c !== undefined ? "ok" : "loading");
  }, [ticker]);

  useEffect(() => {
    if (status !== "ok" || !onColorExtracted) return;
    extractColor(urls[idx], onColorExtracted);
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = ticker
    .replace(/-USD$/, "").replace(/[0-9]+$/, "")
    .replace(/\.[A-Z]{1,3}$/, "").replace(/^\^/, "")
    .slice(0, 4).toUpperCase();

  const handleError = () => {
    if (idx + 1 < urls.length) setIdx(i => i + 1);
    else setStatus("failed");
  };

  const handleLoad = () => {
    _cache.set(ticker, idx);
    setStatus("ok");
  };

  if (status === "failed") {
    return (
      <div style={{
        width: size, height: size, borderRadius: radius, flexShrink: 0,
        background: fallbackBg, border: `1px solid ${fallbackBorder}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        ...style,
      }}>
        <span style={{
          fontSize: Math.max(6, Math.floor(size * 0.27)), fontWeight: 800,
          color: fallbackTextColor, letterSpacing: "-0.02em", userSelect: "none",
        }}>
          {label}
        </span>
      </div>
    );
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0,
      overflow: "hidden", background: "transparent", border: "none",
      display: "flex", alignItems: "center", justifyContent: "center",
      ...style,
    }}>
      <img
        key={`${ticker}-${idx}`}
        src={urls[idx]}
        alt={ticker}
        style={{
          width: "100%", height: "100%", objectFit: "contain",
          display: status === "ok" ? "block" : "none",
        }}
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  );
}

const AssetLogo = memo(AssetLogoInner);
export default AssetLogo;
