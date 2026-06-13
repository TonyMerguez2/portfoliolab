"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function Header({ dark, setDark, hideToggle }: { dark: boolean, setDark: (d: boolean) => void, hideToggle?: boolean }) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [showTools, setShowTools] = useState(false);
  const [tickerData, setTickerData] = useState<{symbol: string, price: number, change: number}[]>([]);
  const tickerRef = useRef<HTMLDivElement>(null);
  const tickerPosRef = useRef(0);

  const text = dark ? "#F8F9FC" : "#0B1A33";

  useEffect(() => {
    const fetch_prices = async () => {
      try {
        const res = await fetch("http://localhost:8000/ticker");
        const data = await res.json();
        if (Array.isArray(data)) setTickerData(data);
      } catch {}
    };
    fetch_prices();
    const iv = setInterval(fetch_prices, 300000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!tickerRef.current || tickerData.length === 0) return;
    let raf: number;
    const el = tickerRef.current;
    const speed = 0.5;
    const timeout = setTimeout(() => {
      const singleWidth = el.scrollWidth / 2;
      const animate = () => {
        tickerPosRef.current -= speed;
        if (tickerPosRef.current <= -singleWidth) tickerPosRef.current += singleWidth;
        el.style.transform = `translateX(${Math.round(tickerPosRef.current)}px)`;
        raf = requestAnimationFrame(animate);
      };
      raf = requestAnimationFrame(animate);
    }, 200);
    return () => { cancelAnimationFrame(raf); clearTimeout(timeout); };
  }, [tickerData]);

  return (
    <>
      {/* Header top-right */}
      <div style={{
        position: "fixed", top: "16px", right: hideToggle ? "20px" : "64px",
        zIndex: 30, display: "flex", alignItems: "center", gap: "8px",
      }}>
        {/* Search */}
        <div style={{
          display: "flex", alignItems: "center",
          background: dark ? "rgba(255,255,255,0.06)" : "rgba(11,26,51,0.05)",
          border: dark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(11,26,51,0.1)",
          borderRadius: "9px", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          padding: "0 12px", width: "220px", height: "36px",
        }}>
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke={text} strokeWidth={2} style={{ opacity: 0.35, flexShrink: 0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
          </svg>
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Rechercher un actif, ETF, crypto..."
            style={{
              background: "transparent", border: "none", outline: "none",
              color: text, fontSize: "12px", letterSpacing: "0.04em",
              padding: "0 10px", width: "100%", height: "36px",
              opacity: searchQuery ? 1 : 0.45,
            }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")}
              style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, opacity: 0.4 }}>
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke={text} strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          )}
        </div>

        {/* Outils */}
        <div style={{ position: "relative" }}>
          <button onClick={() => setShowTools(t => !t)} style={{
            display: "flex", alignItems: "center", gap: "6px",
            background: dark ? "rgba(255,255,255,0.06)" : "rgba(11,26,51,0.05)",
            border: dark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(11,26,51,0.1)",
            borderRadius: "9px", padding: "0 14px", height: "36px",
            backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
            color: text, fontSize: "12px", letterSpacing: "0.06em", opacity: 0.7,
            cursor: "pointer", transition: "opacity 0.2s",
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={e => (e.currentTarget.style.opacity = "0.7")}>
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke={text} strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
            Outils
            <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke={text} strokeWidth={2}
              style={{ transform: showTools ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
          {showTools && (
            <div style={{
              position: "absolute", top: "calc(100% + 8px)", right: 0,
              background: dark ? "rgba(4,17,36,0.92)" : "rgba(243,246,252,0.95)",
              border: dark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(11,26,51,0.1)",
              borderRadius: "10px", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
              padding: "6px", minWidth: "200px",
              boxShadow: dark ? "0 16px 40px rgba(0,0,0,0.4)" : "0 16px 40px rgba(11,26,51,0.12)",
            }}>
              {[
                { icon: "◈", label: "Créer un portefeuille" },
                { icon: "◎", label: "Analyse de marché" },
                { icon: "⬡", label: "ETF Map", href: "/map" },
                { icon: "⟁", label: "Monte Carlo" },
                { icon: "◆", label: "Optimisation Markowitz" },
              ].map((item: any) => (
                <button key={item.label} onClick={() => item.href && router.push(item.href)}
                  style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    width: "100%", padding: "9px 12px", borderRadius: "7px",
                    background: "transparent", border: "none",
                    color: text, fontSize: "12px", letterSpacing: "0.04em",
                    cursor: item.href ? "pointer" : "default", textAlign: "left", opacity: 0.7,
                    transition: "background 0.15s, opacity 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = dark ? "rgba(255,255,255,0.07)" : "rgba(11,26,51,0.06)"; e.currentTarget.style.opacity = "1"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.opacity = "0.7"; }}>
                  <span style={{ opacity: 0.5, fontSize: "14px" }}>{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>





      {/* Ticker */}
      {tickerData.length > 0 && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 20,
          background: dark ? "rgba(4,17,36,0.85)" : "rgba(243,246,252,0.85)",
          backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          borderTop: dark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(11,26,51,0.08)",
          padding: "8px 0", overflow: "hidden",
        }}>
          <div ref={tickerRef} style={{ display: "flex", gap: "80px", whiteSpace: "nowrap", willChange: "transform" }}>
            {[...tickerData, ...tickerData].map((d, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                <span style={{ color: text, fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em", opacity: 0.7 }}>{d.symbol}</span>
                <span style={{ color: text, fontSize: "11px", opacity: 0.5 }}>{d.price.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span style={{ fontSize: "11px", fontWeight: 500, color: d.change >= 0 ? "#22c55e" : "#ef4444" }}>
                  {d.change >= 0 ? "+" : ""}{d.change.toFixed(2)}%
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
