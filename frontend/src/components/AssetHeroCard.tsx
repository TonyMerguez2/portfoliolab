"use client";

import { useEffect, useMemo, useState } from "react";
import AssetLogo from "@/components/AssetLogo";
import TileCard from "@/components/TileCard";
import { BRAND_COLORS, TRENDING } from "@/lib/assets";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Price = { price: number; change: number };
type Quote = {
  prev_close?: number;
  currency?: string;
  global_rank?: number;
};

const EXCHANGE_LABELS: Record<string, string> = {
  NMS: "Nasdaq GS",
  NMQ: "Nasdaq",
  NYQ: "NYSE",
  NYSEArca: "NYSE Arca",
  PAR: "Euronext Paris",
  GER: "Xetra",
  LSE: "London SE",
  MCE: "Madrid",
  AMS: "Amsterdam",
  MIL: "Milan",
  SWX: "SIX Swiss",
  TOR: "Toronto",
  TSX: "Toronto",
  HKG: "Hong Kong",
  JPX: "Tokyo",
  TYO: "Tokyo",
  ASX: "Sydney",
};

const EXCHANGE_FLAGS: Record<string, string> = {
  NMS: "us",
  NMQ: "us",
  NYQ: "us",
  NYSEArca: "us",
  PAR: "fr",
  GER: "de",
  LSE: "gb",
  MCE: "es",
  AMS: "nl",
  MIL: "it",
  SWX: "ch",
  TOR: "ca",
  TSX: "ca",
  HKG: "hk",
  JPX: "jp",
  TYO: "jp",
  ASX: "au",
};

const EXCHANGE_HOURS: Record<string, { tz: string; open: number; close: number }> = {
  NMS: { tz: "America/New_York", open: 570, close: 960 },
  NMQ: { tz: "America/New_York", open: 570, close: 960 },
  NYQ: { tz: "America/New_York", open: 570, close: 960 },
  NYSEArca: { tz: "America/New_York", open: 570, close: 960 },
  PAR: { tz: "Europe/Paris", open: 540, close: 1050 },
  GER: { tz: "Europe/Berlin", open: 540, close: 1050 },
  LSE: { tz: "Europe/London", open: 480, close: 990 },
  SWX: { tz: "Europe/Zurich", open: 540, close: 1050 },
  MCE: { tz: "Europe/Madrid", open: 540, close: 1050 },
  AMS: { tz: "Europe/Amsterdam", open: 540, close: 1050 },
  MIL: { tz: "Europe/Rome", open: 540, close: 1050 },
};

function formatNumber(value: number) {
  return value < 1
    ? value.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })
    : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isExchangeOpen(exchange?: string) {
  const hours = exchange ? EXCHANGE_HOURS[exchange] ?? EXCHANGE_HOURS.NMS : EXCHANGE_HOURS.NMS;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: hours.tz,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const weekday = parts.find(part => part.type === "weekday")?.value ?? "";
  const hour = Number(parts.find(part => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find(part => part.type === "minute")?.value ?? 0);
  const current = hour * 60 + minute;
  return weekday !== "Sat" && weekday !== "Sun" && current >= hours.open && current < hours.close;
}

export default function AssetHeroCard({
  ticker,
  name,
  type,
}: {
  ticker: string;
  name?: string;
  type?: string;
}) {
  const asset = useMemo(() => TRENDING.find(item => item.ticker === ticker), [ticker]);
  const assetType = asset?.type ?? type ?? "EQUITY";
  const exchange = asset?.exchange;
  const isCrypto = assetType === "CRYPTOCURRENCY" || ticker.endsWith("-USD");
  const open = isCrypto || isExchangeOpen(exchange);
  const [price, setPrice] = useState<Price | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [extractedColor, setExtractedColor] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);

  useEffect(() => {
    setExtractedColor(null);
    try {
      const favorites: string[] = JSON.parse(localStorage.getItem("favorites") ?? "[]");
      setIsFavorite(favorites.includes(ticker));
    } catch {
      setIsFavorite(false);
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    // The API can be briefly unavailable (server restarting, network blip).
    // Without a retry the card stays stuck on "—" until a full reload, even
    // once the backend is healthy again.
    const load = (attempt = 0) => {
      Promise.all([
        fetch(`${API_URL}/api/v1/prices?tickers=${encodeURIComponent(ticker)}`).then(r => r.json()),
        fetch(`${API_URL}/api/v1/quote/${encodeURIComponent(ticker)}`).then(r => r.json()),
      ])
        .then(([prices, nextQuote]) => {
          if (cancelled) return;
          const first = Array.isArray(prices) ? prices[0] : null;
          setPrice(first?.price != null ? { price: Number(first.price), change: Number(first.change ?? 0) } : null);
          setQuote(nextQuote && typeof nextQuote === "object" ? nextQuote : null);
        })
        .catch(() => {
          if (cancelled) return;
          setPrice(null);
          setQuote(null);
          if (attempt < 4) {
            retryTimer = setTimeout(() => load(attempt + 1), 1500 * 2 ** attempt);
          }
        });
    };

    load();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [ticker]);

  const toggleFavorite = () => {
    setIsFavorite(previous => {
      const next = !previous;
      try {
        const favorites: string[] = JSON.parse(localStorage.getItem("favorites") ?? "[]");
        const updated = next
          ? Array.from(new Set([...favorites, ticker]))
          : favorites.filter(item => item !== ticker);
        localStorage.setItem("favorites", JSON.stringify(updated));
      } catch {}
      return next;
    });
  };

  const displayTicker = ticker
    .replace(/-USD$/, "")
    .replace(/[0-9]+$/, "")
    .replace(/\.[A-Z]{1,3}$/, "")
    .replace(/^\^/, "");
  const color = BRAND_COLORS[ticker] ?? extractedColor ?? "#5B8DEF";
  const up = price ? price.change >= 0 : true;
  const absoluteChange = price
    ? Math.abs(quote?.prev_close != null ? price.price - quote.prev_close : price.price * price.change / 100)
    : null;

  return (
    <>
      {/* dangerouslySetInnerHTML so React does not escape the quotes in
          content:'' — <style> is raw text, entities are never decoded there,
          and the escaping also causes a server/client hydration mismatch. */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shared-hero-pulse{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.7)}60%{box-shadow:0 0 0 5px rgba(34,197,94,0)}}
        .shared-asset-hero-row{zoom:.94}
        .shared-asset-hero-card::before{content:'';position:absolute;z-index:4;inset:0;box-sizing:border-box;border-radius:inherit;padding:1px;pointer-events:none;background:linear-gradient(135deg,color-mix(in srgb,currentColor 44%,transparent) 0%,color-mix(in srgb,currentColor 36%,transparent) 24%,color-mix(in srgb,currentColor 17%,transparent) 44%,transparent 54%,color-mix(in srgb,currentColor 15%,transparent) 68%,color-mix(in srgb,currentColor 40%,transparent) 100%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
        .shared-asset-hero-grid{position:relative;z-index:1;display:grid;grid-template-columns:max-content max-content max-content;align-items:center;height:64px;min-height:64px}
        .shared-asset-hero-identity{display:flex;align-items:center;min-width:0;padding-right:18px}
        .shared-asset-hero-section{align-self:stretch;display:flex;flex-direction:column;justify-content:center;border-left:1px solid rgba(255,255,255,.11);padding:0 18px;min-width:0}
        .shared-asset-hero-price{justify-content:space-between;padding-top:2px!important;padding-bottom:2px!important;box-sizing:border-box}
        .shared-asset-hero-status{padding-right:10px}
        .shared-asset-hero-reflection{position:absolute;z-index:0;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(118deg,rgba(255,255,255,.045) 0%,rgba(255,255,255,.01) 12%,transparent 27%,transparent 100%),radial-gradient(ellipse 17% 58% at 0% -10%,rgba(255,255,255,.052),transparent 70%),linear-gradient(180deg,rgba(255,255,255,.032),transparent 16%);mix-blend-mode:screen}
        .shared-asset-hero-star{width:18px;height:22px;margin:-3px 0 -3px 5px;padding:0;border:0;background:transparent;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:0 0 auto;box-shadow:none;appearance:none;transform:none!important;transition:none!important}
        .shared-asset-hero-star:hover,.shared-asset-hero-star:active{background:transparent;transform:none!important;scale:1!important}
        .shared-asset-meta-pill,.shared-asset-performance-pill{display:inline-flex;align-items:center;min-height:17px;padding:2px 7px;border-radius:999px;font-size:9px;line-height:1;font-weight:600;white-space:nowrap;box-sizing:border-box}
        .shared-asset-meta-pill{border:1px solid rgba(255,255,255,.035);background:rgba(255,255,255,.055)}
        .shared-asset-performance-pill{font-weight:700}
        .shared-asset-exchange-flag{width:12px;height:12px;margin-left:3px;border:0;outline:0;border-radius:50%;flex:0 0 auto;object-fit:cover;display:inline-block;vertical-align:middle;box-shadow:none}
        .shared-asset-market-pill{display:inline-flex;align-items:center;align-self:flex-start;gap:5px;min-height:17px;padding:2px 7px;box-sizing:border-box;border-radius:9px;border:1px solid rgba(255,255,255,.028);background:rgba(255,255,255,.045);white-space:nowrap}
        @media(max-width:820px){.shared-asset-hero-row{zoom:1}.shared-asset-hero-grid{grid-template-columns:minmax(0,1fr) minmax(180px,.75fr);height:auto;row-gap:18px}.shared-asset-hero-status{grid-column:1 / 3;border-left:0!important;border-top:1px solid rgba(255,255,255,.1);padding:16px 0 0!important;flex-direction:row!important;align-items:center;justify-content:space-between!important}}
      ` }} />

      <div className="shared-asset-hero-row" style={{ display: "flex", alignItems: "stretch", minWidth: 0 }}>
        <TileCard
          ticker={ticker}
          className="shared-asset-hero-card"
          radius={18}
          glowStrength={0}
          containerStyle={{
            flex: "0 0 auto",
            width: "fit-content",
            maxWidth: "100%",
            minWidth: 0,
            color,
            background: `radial-gradient(ellipse 65% 90% at 0% 0%, ${color}58 0%, ${color}40 42%, ${color}1B 72%, ${color}00 100%), radial-gradient(ellipse 65% 90% at 100% 100%, ${color}4C 0%, ${color}38 42%, ${color}18 72%, ${color}00 100%), linear-gradient(138deg, ${color}22 0%, ${color}28 48%, ${color}21 100%), rgba(2,10,24,0.46)`,
            border: "none",
            boxShadow: `0 14px 44px rgba(0,0,0,0.28), 0 0 28px ${color}10`,
          }}
          style={{ padding: "10px 12px" }}
        >
          <div className="shared-asset-hero-reflection" />
          <div className="shared-asset-hero-grid">
            <div className="shared-asset-hero-identity">
              <AssetLogo
                ticker={ticker}
                type={assetType}
                size={60}
                radius={13}
                fallbackBg="rgba(255,255,255,.07)"
                fallbackBorder="rgba(255,255,255,.12)"
                fallbackTextColor="rgba(255,255,255,.55)"
                onColorExtracted={nextColor => {
                  if (!BRAND_COLORS[ticker]) setExtractedColor(nextColor);
                }}
                bare
              />
              <div style={{ marginLeft: 12, display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color: "#F8F9FC", letterSpacing: "-0.04em", lineHeight: 0.95 }}>
                    {displayTicker}
                  </span>
                  <button
                    onClick={toggleFavorite}
                    className="shared-asset-hero-star"
                    title={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                    aria-pressed={isFavorite}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill={isFavorite ? "#facc15" : "none"} stroke={isFavorite ? "#facc15" : "rgba(255,255,255,0.58)"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3.15c.35 0 .68.2.84.54l2.17 4.4 4.86.7c.38.06.69.32.81.69.12.36.02.76-.25 1.02l-3.52 3.43.83 4.84c.06.38-.09.76-.4.99-.31.22-.72.25-1.06.07L12 17.54l-4.35 2.29c-.34.18-.75.15-1.06-.07a1.02 1.02 0 0 1-.4-.99l.83-4.84-3.52-3.43a1.02 1.02 0 0 1-.25-1.02c.12-.37.43-.63.81-.69l4.86-.7 2.17-4.4c.16-.34.49-.54.84-.54Z" />
                    </svg>
                  </button>
                </div>
                <span style={{ marginTop: 5, fontSize: 11, fontWeight: 550, color: "rgba(255,255,255,0.9)", lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {asset?.name ?? name ?? ticker}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6, minWidth: 0 }}>
                  {assetType !== "INDEX" && (
                    <span className="shared-asset-meta-pill" style={{ color: "rgba(255,255,255,0.72)" }}>
                      {({ EQUITY: "Action", ETF: "ETF", CRYPTOCURRENCY: "Crypto" } as Record<string, string>)[assetType] ?? assetType}
                    </span>
                  )}
                  {quote?.global_rank != null && (
                    <span className="shared-asset-meta-pill" style={{ color: "rgba(255,255,255,0.72)" }}>#{quote.global_rank}</span>
                  )}
                  {exchange && !isCrypto && (
                    <span className="shared-asset-meta-pill" style={{ color: "rgba(255,255,255,0.58)", fontWeight: 500 }}>
                      {EXCHANGE_LABELS[exchange] ?? exchange}
                      {EXCHANGE_FLAGS[exchange] && (
                        <img className="shared-asset-exchange-flag" src={`/drapeaux/${EXCHANGE_FLAGS[exchange]}.svg`} alt="" />
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="shared-asset-hero-section shared-asset-hero-price">
              <div style={{ display: "flex", alignItems: "baseline", gap: 7, whiteSpace: "nowrap" }}>
                <span style={{ fontSize: 34, fontWeight: 650, color: "#F8F9FC", letterSpacing: "-0.055em", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                  {price ? formatNumber(price.price) : "—"}
                </span>
                {quote?.currency && <span style={{ fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.5)", letterSpacing: "0.04em" }}>{quote.currency}</span>}
              </div>
              {price && absoluteChange != null && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                  <span style={{ fontSize: 14, lineHeight: "17px", fontWeight: 600, color: up ? "#4ade80" : "#ef4444", fontVariantNumeric: "tabular-nums" }}>
                    {up ? "▲" : "▼"} {up ? "+" : "−"}{formatNumber(absoluteChange)}
                  </span>
                  <span className="shared-asset-performance-pill" style={{ color: up ? "#4ade80" : "#ef4444", background: up ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)", fontVariantNumeric: "tabular-nums" }}>
                    {up ? "+" : "−"}{Math.abs(price.change).toFixed(2)}%
                  </span>
                </div>
              )}
            </div>

            <div className="shared-asset-hero-section shared-asset-hero-status">
              <div className="shared-asset-market-pill" style={isCrypto ? { background: "rgba(34,197,94,0.065)" } : undefined}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: open ? "#22c55e" : "rgba(255,255,255,0.62)", flexShrink: 0, animation: open ? "shared-hero-pulse 2s ease-in-out infinite" : "none" }} />
                <span style={{ fontSize: 9, fontWeight: 650, color: open ? "#4ade80" : "rgba(255,255,255,0.76)" }}>
                  {isCrypto ? "LIVE 24/7" : open ? "Marché ouvert" : "Marché fermé"}
                </span>
              </div>
              {isCrypto ? (
                <span style={{ marginTop: 7, fontSize: 9, color: "rgba(255,255,255,0.38)" }}>Cours en temps réel</span>
              ) : open ? (
                <span style={{ marginTop: 7, fontSize: 9, color: "rgba(255,255,255,0.38)" }}>Màj toutes les 60 s</span>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 5 }}>
                  <span style={{ fontSize: 9, lineHeight: 1.1, color: "rgba(255,255,255,0.5)" }}>Dernière clôture</span>
                  <span style={{ fontSize: 10, lineHeight: 1.15, fontWeight: 500, color: "rgba(255,255,255,0.72)" }}>
                    {new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                </div>
              )}
            </div>
          </div>
        </TileCard>
      </div>
    </>
  );
}
