"use client";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/AppContext";
import { useEffect, useRef, useState } from "react";

export default function Header({ dark, setDark, hideToggle, showLogo }: { dark: boolean, setDark: (d: boolean) => void, hideToggle?: boolean, showLogo?: boolean }) {
  const router = useRouter();
  const { mode, setMode, activePortfolio, activeAsset, setActiveAsset } = useApp();
  const [localSearch, setLocalSearch] = useState("");
  const [localResults, setLocalResults] = useState<any[]>([]);
  const [showLocalResults, setShowLocalResults] = useState(false);
  const localDebounce = useRef<NodeJS.Timeout | undefined>(undefined);

  const handleLocalSearch = (q: string) => {
    setLocalSearch(q);
    setShowLocalResults(false);
    clearTimeout(localDebounce.current);
    if (!q) { setLocalResults([]); return; }
    localDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`http://localhost:8000/api/v1/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        const items = (data?.quotes || data?.results || []).slice(0, 6);
        setLocalResults(items.map((r: any) => ({ ticker: r.symbol || r.ticker, name: r.shortname || r.longname || r.name })));
        setShowLocalResults(true);
      } catch {}
    }, 300);
  };
  const [searchQuery, setSearchQuery] = useState("");
  const [showTools, setShowTools] = useState(false);
  const [tickerData, setTickerData] = useState<{symbol: string, price: number, change: number}[]>([]);
  const tickerRef = useRef<HTMLDivElement>(null);
  const tickerPosRef = useRef(0);

  const text = "#F8F9FC"; // Toujours dark

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
      {/* Mode switcher — centré en haut */}
      <div style={{ position: "fixed", top: "14px", left: "50%", transform: "translateX(-50%)", zIndex: 30, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
        {/* Switcher */}
        <div style={{
          display: "flex", alignItems: "center",
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: "12px", padding: "3px",
          backdropFilter: "blur(40px) saturate(180%)", WebkitBackdropFilter: "blur(40px) saturate(180%)",
          boxShadow: "0 2px 20px rgba(0,0,0,0.2), 0 0 0 0.5px rgba(255,255,255,0.15) inset, 0 1px 0 rgba(255,255,255,0.2) inset",
        }}>
          {(["portfolio", "asset"] as const).map((m, i) => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: "5px 16px", borderRadius: "7px", border: "none",
              background: mode === m ? "rgba(91,141,239,0.22)" : "transparent",
              color: "#F8F9FC",
              boxShadow: mode === m ? "0 2px 8px rgba(91,141,239,0.2)" : "none", fontSize: "11px", fontWeight: mode === m ? 600 : 400,
              opacity: mode === m ? 1 : 0.45, cursor: "pointer", letterSpacing: "0.06em",
              transition: "all 0.2s",
            }}>
              {m === "portfolio"
                ? (activePortfolio ? `● ${activePortfolio.name}` : "● Portefeuille")
                : "○ Actif seul"}
            </button>
          ))}
        </div>
        {/* Barre de recherche contextuelle */}
        <div style={{ position: "relative", width: "280px" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: "8px",
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: "9px", padding: "0 12px", height: "32px",
            backdropFilter: "blur(40px) saturate(180%)", WebkitBackdropFilter: "blur(40px) saturate(180%)",
            boxShadow: "0 2px 16px rgba(0,0,0,0.15), 0 0 0 0.5px rgba(255,255,255,0.12) inset, 0 1px 0 rgba(255,255,255,0.15) inset",
          }}>
            <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke={text} strokeWidth={2} style={{ opacity: 0.35, flexShrink: 0 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
            </svg>
            <input value={localSearch} onChange={e => handleLocalSearch(e.target.value)}
              placeholder={mode === "portfolio" ? "Rechercher un portefeuille..." : "Rechercher un actif, ETF, crypto..."}
              style={{ background: "transparent", border: "none", outline: "none", color: text, fontSize: "11px", width: "100%", opacity: localSearch ? 1 : 0.5 }}
            />
            {localSearch && (
              <button onClick={() => { setLocalSearch(""); setLocalResults([]); setShowLocalResults(false); }} style={{ background: "transparent", border: "none", cursor: "pointer", opacity: 0.4, padding: 0 }}>
                <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke={text} strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            )}
          </div>
          {/* Résultats */}
          {showLocalResults && localResults.length > 0 && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: dark ? "rgba(4,17,36,0.97)" : "rgba(243,246,252,0.97)", border: dark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(11,26,51,0.1)", borderRadius: "10px", overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", zIndex: 50 }}>
              {localResults.map(r => (
                <button key={r.ticker} onClick={() => { setActiveAsset({ ticker: r.ticker, name: r.name }); setLocalSearch(""); setShowLocalResults(false); }}
                  style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "8px 12px", background: "transparent", border: "none", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = dark ? "rgba(255,255,255,0.06)" : "rgba(11,26,51,0.05)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  <span style={{ color: text, fontSize: "11px", fontWeight: 600 }}>{r.ticker}</span>
                  <span style={{ color: text, fontSize: "10px", opacity: 0.4 }}>{r.name}</span>
                </button>
              ))}
            </div>
          )}
          {/* Actif actif affiché */}
          {mode === "asset" && activeAsset && !localSearch && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: dark ? "rgba(4,17,36,0.9)" : "rgba(243,246,252,0.9)", border: dark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(11,26,51,0.08)", borderRadius: "8px", padding: "7px 12px", backdropFilter: "blur(12px)" }}>
              <span style={{ color: "#9BB9FF", fontSize: "11px", fontWeight: 600 }}>{activeAsset.ticker}</span>
              <span style={{ color: text, fontSize: "10px", opacity: 0.4, marginLeft: "6px" }}>{activeAsset.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Header top-right */}
      <div style={{
        position: "fixed", top: "16px", right: hideToggle ? "20px" : "64px",
        zIndex: 30, display: "flex", alignItems: "center", gap: "8px",
      }}>
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
