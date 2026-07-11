"use client";
import { useEffect, useRef, useState, memo, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "@/lib/AppContext";
import { TRENDING } from "@/lib/assets";
import AssetLogo from "@/components/AssetLogo";
import ProfileModal from "@/components/ProfileModal";
import { useTheme } from "@/lib/theme";

type Asset = { ticker: string; type: string; name: string; };
type Price = { price: number; change: number; };

type AssetRowProps = {
  a: Asset;
  highlighted?: boolean;
  focused?: boolean;
  idx: number;
  price?: Price;
  onSelect: (a: Asset) => void;
  onChart: (ticker: string) => void;
};

const AssetRow = memo(function AssetRow({ a, highlighted, focused, idx, price, onSelect, onChart }: AssetRowProps) {
  const tc = typeColor(a.type);
  const [hovered, setHovered] = useState(false);
  return (
    <div
      data-idx={idx}
      style={{ display:"flex", alignItems:"center", gap:"10px", width:"100%", padding:"8px 12px", background: focused ? "rgba(91,141,239,0.12)" : hovered ? "rgba(255,255,255,0.05)" : "transparent", cursor:"pointer", borderBottom:"1px solid rgba(255,255,255,0.04)", borderLeft: focused ? "2px solid rgba(91,141,239,0.6)" : "2px solid transparent", boxSizing:"border-box" as const }}
      onClick={() => onSelect(a)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>
      <AssetLogo
        ticker={a.ticker}
        type={a.type}
        size={28}
        radius={6}
        fallbackBg={tc.bg}
        fallbackBorder={tc.border}
        fallbackTextColor={tc.text}
      />
      <span style={{ color:"#F8F9FC", fontSize:"11px", fontWeight:500, flex:1, textAlign:"left" }}>{a.name}</span>
      {hovered && (
        <button
          onClick={e => { e.stopPropagation(); onChart(a.ticker); }}
          style={{ background:"rgba(91,141,239,0.15)", border:"1px solid rgba(91,141,239,0.3)", borderRadius:"5px", color:"#9BB9FF", fontSize:"10px", padding:"3px 8px", cursor:"pointer", flexShrink:0, whiteSpace:"nowrap" as const, letterSpacing:"0.03em" }}>
          Graphique
        </button>
      )}
      {price && (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:"1px" }}>
          <span style={{ color:"#F8F9FC", fontSize:"10px", opacity:0.6 }}>${price.price.toLocaleString("en-US", { minimumFractionDigits:2, maximumFractionDigits:2 })}</span>
          <span style={{ fontSize:"10px", fontWeight:600, color:price.change>=0?"#22c55e":"#ef4444" }}>{price.change>=0?"▲":"▼"} {Math.abs(price.change).toFixed(2)}%</span>
        </div>
      )}
    </div>
  );
});


const typeColor = (type: string) => ({
  bg: type==="CRYPTOCURRENCY"?"rgba(245,158,11,0.16)":type==="ETF"?"rgba(139,92,246,0.16)":type==="INDEX"?"rgba(34,211,238,0.14)":"rgba(59,130,246,0.16)",
  border: type==="CRYPTOCURRENCY"?"rgba(245,158,11,0.35)":type==="ETF"?"rgba(139,92,246,0.35)":type==="INDEX"?"rgba(34,211,238,0.32)":"rgba(59,130,246,0.35)",
  text: type==="CRYPTOCURRENCY"?"#fcd34d":type==="ETF"?"#c4b5fd":type==="INDEX"?"#67e8f9":"#93c5fd",
});

export default function GlobalHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { mode, setMode, activePortfolio, setActivePortfolio, activeAsset, setActiveAsset } = useApp();
  const [localSearch, setLocalSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Asset[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showPortfolioMenu, setShowPortfolioMenu] = useState(false);
  const [portfolios, setPortfolios] = useState<any[]>([]);
  const t = useTheme();
  const [showTools, setShowTools] = useState(false);
  const [category, setCategory] = useState("all");
  const [displayCount, setDisplayCount] = useState(20);
  const [prices, setPrices] = useState<Record<string,Price>>({});
  const [tickerData, setTickerData] = useState<any[]>([]);
  const tickerRef = useRef<HTMLDivElement>(null);
  const tickerPosRef = useRef(0);
  const [isSearching, setIsSearching] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [hoveredPortfolioId, setHoveredPortfolioId] = useState<string|null>(null);
  const debounce = useRef<NodeJS.Timeout>();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isLanding = pathname === "/";
  const isChartPage = pathname === "/chart";
  const [user, setUser] = useState<any>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [theme, setTheme] = useState<"dark"|"light">(() =>
    typeof window !== "undefined" ? (localStorage.getItem("novac_theme") as "dark"|"light") ?? "dark" : "dark"
  );
  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("novac_theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  useEffect(() => {
    const stored = localStorage.getItem("novac_user");
    if (stored) { try { setUser(JSON.parse(stored)); } catch {} }
  }, []);

  useEffect(() => {
    fetch("http://localhost:8000/api/v1/portfolios")
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setPortfolios(d); })
      .catch(() => {});
  }, []);

  // ⌘K shortcut
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setMode("asset");
        setShowDropdown(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  // Ticker tape
  useEffect(() => {
    const fetch_prices = async () => {
      try { const r = await fetch("http://localhost:8000/ticker"); const d = await r.json(); if (Array.isArray(d)) setTickerData(d); } catch {}
    };
    fetch_prices(); const iv = setInterval(fetch_prices, 300000); return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!tickerRef.current || tickerData.length === 0) return;
    let raf: number; const el = tickerRef.current;
    const t = setTimeout(() => {
      const w = el.scrollWidth / 2;
      const a = () => { tickerPosRef.current -= 0.5; if (tickerPosRef.current <= -w) tickerPosRef.current += w; el.style.transform = `translateX(${Math.round(tickerPosRef.current)}px)`; raf = requestAnimationFrame(a); };
      raf = requestAnimationFrame(a);
    }, 200);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, [tickerData]);

  // Fetch prices for visible assets
  const fetchPrices = async (tickers: string[]) => {
    try {
      const r = await fetch(`http://localhost:8000/api/v1/prices?tickers=${encodeURIComponent(tickers.join(","))}`);
      const d = await r.json();
      if (Array.isArray(d)) {
        const p: Record<string,Price> = {};
        d.forEach((x: any) => { if (x.symbol) p[x.symbol] = { price: x.price, change: x.change }; });
        setPrices(prev => ({ ...prev, ...p }));
      }
    } catch {}
  };

  // Search — local TRENDING fallback (instant, gère les accents) + API
  const normSearch = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  useEffect(() => {
    if (!localSearch) { setSearchResults([]); setIsSearching(false); setHighlightIndex(-1); return; }
    const qn = normSearch(localSearch);
    // Résultats locaux immédiats depuis TRENDING
    const local: Asset[] = TRENDING
      .filter(a => normSearch(a.ticker).includes(qn) || normSearch(a.name).includes(qn))
      .map(a => ({ ticker: a.ticker, type: a.type, name: a.name }));
    if (local.length > 0) {
      setSearchResults(local);
      setHighlightIndex(-1);
      fetchPrices(local.slice(0, 10).map(a => a.ticker));
    }
    setIsSearching(true);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const r = await fetch(`http://localhost:8000/api/v1/search?q=${encodeURIComponent(localSearch)}`);
        const d = await r.json();
        const api: Asset[] = (d?.results || []).map((x: any) => ({ ticker: x.ticker, type: x.type || "EQUITY", name: x.name || x.ticker }));
        const seen = new Set(api.map(a => a.ticker));
        const merged = [...api, ...local.filter(a => !seen.has(a.ticker))].slice(0, 10);
        setSearchResults(merged);
        setHighlightIndex(-1);
        fetchPrices(merged.map(a => a.ticker));
      } catch { if (local.length === 0) setSearchResults([]); } finally { setIsSearching(false); }
    }, 300);
  }, [localSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load prices when dropdown opens
  useEffect(() => {
    if (!showDropdown || mode !== "asset") return;
    const visible = filteredAssets.slice(0, displayCount);
    fetchPrices(visible.map(a => a.ticker));
  }, [showDropdown, category, displayCount, mode]);

  // Scroll infini
  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
      const newCount = Math.min(displayCount + 20, filteredAssets.length);
      const newAssets = filteredAssets.slice(displayCount, newCount);
      if (newAssets.length > 0) fetchPrices(newAssets.map(a => a.ticker));
      setDisplayCount(newCount);
    }
  };

  const filteredAssets = TRENDING.filter(a => category === "all" || a.type === category);
  const displayAssets = localSearch ? searchResults.filter(a => category === "all" || a.type === category) : filteredAssets.slice(0, displayCount);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlightIndex(i => Math.min(i + 1, displayAssets.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlightIndex(i => Math.max(i - 1, -1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const a = displayAssets[highlightIndex];
      if (a) { setActiveAsset({ ticker: a.ticker, name: a.name }); setShowDropdown(false); setLocalSearch(""); setHighlightIndex(-1); }
    }
    else if (e.key === "Escape") { setShowDropdown(false); setHighlightIndex(-1); inputRef.current?.blur(); }
  };

  useEffect(() => {
    if (highlightIndex < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${highlightIndex}"]`) as HTMLElement;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex]);

  const glass = { background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.14)", backdropFilter:"blur(24px)" as const, WebkitBackdropFilter:"blur(24px)" as const, boxShadow:"0 4px 24px rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.1) inset" };
  const pillStyle: React.CSSProperties = { display:"flex", alignItems:"center", borderRadius:"999px", background:t.isDark ? "rgba(255,255,255,0.07)" : "rgba(16,24,40,0.05)", backdropFilter: t.isDark ? "blur(20px)" : "none", WebkitBackdropFilter: t.isDark ? "blur(20px)" : "none" as const, border:`1px solid ${t.border}`, cursor:"pointer", color:t.textPrimary, boxShadow: t.isDark ? "none" : t.shadow };

  const handleSelect = useCallback((a: Asset) => {
    setActiveAsset({ ticker: a.ticker, name: a.name });
    setShowDropdown(false);
    setLocalSearch("");
    setHighlightIndex(-1);
    // Sur la page chart : naviguer directement vers le nouvel actif
    if (isChartPage) router.push(`/chart?ticker=${encodeURIComponent(a.ticker)}`);
  }, [setActiveAsset, isChartPage, router]);

  const handleChart = useCallback((ticker: string) => {
    router.push(`/chart?ticker=${encodeURIComponent(ticker)}`);
    setShowDropdown(false);
  }, [router]);

  const firstTab = mode === "portfolio"
    ? { label: "Dashboard", href: "/portfolio" }
    : { label: "Graphique", href: activeAsset ? `/chart?ticker=${encodeURIComponent(activeAsset.ticker)}` : "/chart" };

  const navTabs = [
    firstTab,
    { label: "Marchés", href: "/treemap" },
    { label: "Carte",   href: "/map" },
    { label: "Analyse", href: "/dashboard" },
  ];

  return (
    <>

      {/* Left: NOVAC + separator + asset pill */}
      {(
        <div style={{ position:"fixed", top:"12px", left:"20px", zIndex:50, display:"flex", alignItems:"center", gap:"10px" }}>
          <a href="/" style={{ textDecoration:"none", color:t.textPrimary, fontSize:"13px", fontWeight:700, letterSpacing:"0.22em", opacity:0.85 }}>NOVAC</a>
          <div style={{ width:"1px", height:"16px", background:t.borderStrong, flexShrink:0 }}/>
          <div style={{ position:"relative" }}>
            <button onClick={() => { setShowDropdown(v => !v); setShowPortfolioMenu(false); }}
              style={{ ...pillStyle, gap:"6px", padding:"0 10px 0 8px", height:"36px", boxSizing:"border-box" }}>
              {mode === "portfolio" && activePortfolio ? (
                <>
                  <div style={{ width:8, height:8, borderRadius:2, background:activePortfolio.color||"#5B8DEF", flexShrink:0 }}/>
                  <span style={{ fontSize:"12px", fontWeight:500, letterSpacing:"0.04em" }}>{activePortfolio.name}</span>
                </>
              ) : isChartPage ? (
                // Sur la page chart : juste une icône recherche — la carte actif gère l'affichage
                <>
                  <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ opacity:0.5, flexShrink:0 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
                  </svg>
                  <span style={{ fontSize:"12px", fontWeight:500, letterSpacing:"0.04em", opacity:0.6 }}>Actifs</span>
                </>
              ) : (
                <>
                  {activeAsset && (() => {
                    const t = TRENDING.find(a => a.ticker === activeAsset.ticker)?.type || "EQUITY";
                    const tc = typeColor(t);
                    return <AssetLogo ticker={activeAsset.ticker} type={t} size={22} radius={5} fallbackBg={tc.bg} fallbackBorder={tc.border} fallbackTextColor={tc.text}/>;
                  })()}
                  <span style={{ fontSize:"12px", fontWeight:500, letterSpacing:"0.04em" }}>{activeAsset ? activeAsset.ticker : "Sélectionner..."}</span>
                </>
              )}
              <span style={{ fontSize:"9px", opacity:0.45 }}>▾</span>
            </button>
            {showDropdown && (
              <div style={{ position:"absolute", top:"calc(100% + 6px)", left:0, width: pathname.startsWith("/portfolio") ? "280px" : "420px", background:"rgba(4,17,36,0.97)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"12px", overflow:"hidden", boxShadow:"0 16px 48px rgba(0,0,0,0.5)", zIndex:60 }}
                onMouseDown={e => e.preventDefault()}>

                {/* Sur la page portfolio : uniquement la liste des portefeuilles */}
                {pathname.startsWith("/portfolio") ? (
                  <div>
                    <div style={{ padding:"10px 14px 6px", color:"rgba(255,255,255,0.30)", fontSize:"9px", letterSpacing:"0.14em", fontWeight:700 }}>MES PORTEFEUILLES</div>
                    {portfolios.map((p: any) => (
                      <div key={p.id}
                        onClick={() => { setActivePortfolio({ id:p.id, name:p.name, assets:p.assets||[], color:p.color||"#5B8DEF" }); setMode("portfolio"); setShowDropdown(false); }}
                        style={{ display:"flex", alignItems:"center", gap:"10px", padding:"9px 14px", cursor:"pointer", transition:"background 0.12s" }}
                        onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,0.04)"}
                        onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                        <div style={{ width:"8px", height:"8px", borderRadius:"2px", background:p.color||"#5B8DEF", flexShrink:0 }}/>
                        <span style={{ color:"#F8F9FC", fontSize:"12px", flex:1, fontWeight:500 }}>{p.name}</span>
                        {p.is_simulation && <span style={{ fontSize:"8px", padding:"1px 5px", borderRadius:"4px", background:"rgba(99,102,241,0.14)", border:"1px solid rgba(99,102,241,0.28)", color:"#a5b4fc", letterSpacing:"0.08em", flexShrink:0 }}>SIM</span>}
                        <span style={{ color:"rgba(255,255,255,0.25)", fontSize:"10px" }}>{Array.isArray(p.assets)?p.assets.length:0} actifs</span>
                        {activePortfolio?.id === p.id && <span style={{ color:"#5B8DEF", fontSize:"10px" }}>●</span>}
                      </div>
                    ))}
                    {portfolios.length === 0 && (
                      <div style={{ padding:"16px 14px", color:"rgba(255,255,255,0.25)", fontSize:"11px" }}>Aucun portefeuille</div>
                    )}
                  </div>
                ) : (
                  /* Ailleurs : recherche d'actifs + portefeuilles */
                  <>
                    <div style={{ display:"flex", alignItems:"center", gap:"8px", padding:"10px 12px", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#F8F9FC" strokeWidth={2} style={{ opacity:0.3, flexShrink:0 }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
                      </svg>
                      <input ref={inputRef} value={localSearch} onChange={e => { setLocalSearch(e.target.value); setHighlightIndex(-1); }}
                        onKeyDown={handleKeyDown}
                        placeholder="Rechercher un actif..."
                        style={{ background:"transparent", border:"none", outline:"none", color:"#F8F9FC", fontSize:"12px", flex:1 }}
                        autoFocus
                      />
                      {localSearch && <button onMouseDown={e => e.preventDefault()} onClick={() => { setLocalSearch(""); setSearchResults([]); setHighlightIndex(-1); }} style={{ background:"transparent", border:"none", cursor:"pointer", opacity:0.4, color:"#F8F9FC", padding:0 }}>✕</button>}
                    </div>
                    <div style={{ display:"flex", gap:"2px", padding:"6px 8px", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
                      {[{id:"all",label:"Tous"},{id:"EQUITY",label:"Actions"},{id:"ETF",label:"Fonds"},{id:"INDEX",label:"Indices"},{id:"CRYPTOCURRENCY",label:"Crypto"}].map(cat => (
                        <button key={cat.id} onClick={() => { setCategory(cat.id); setDisplayCount(20); }} style={{ padding:"3px 10px", borderRadius:"6px", border:"none", fontSize:"10px", background:category===cat.id?"rgba(91,141,239,0.2)":"transparent", color:category===cat.id?"#9BB9FF":"rgba(255,255,255,0.4)", cursor:"pointer", fontWeight:category===cat.id?600:400, letterSpacing:"0.04em" }}>
                          {cat.label}
                        </button>
                      ))}
                    </div>
                    <div style={{ position:"relative" }}>
                      <div ref={listRef} onScroll={handleScroll} style={{ maxHeight:"260px", overflowY:"auto" }}>
                        {!localSearch && <div style={{ padding:"3px 12px 2px", color:"rgba(255,255,255,0.2)", fontSize:"9px", letterSpacing:"0.12em" }}>POPULAIRES</div>}
                        {displayAssets.map((a, i) => <AssetRow key={a.ticker} a={a} highlighted={i===0 && !!localSearch} focused={i===highlightIndex} idx={i} price={prices[a.ticker]} onSelect={handleSelect} onChart={handleChart}/>)}
                        {!localSearch && displayCount < filteredAssets.length && (
                          <div style={{ padding:"10px", textAlign:"center", color:"rgba(255,255,255,0.2)", fontSize:"10px" }}>Scroll pour charger plus...</div>
                        )}
                      </div>
                      <div style={{ position:"absolute", bottom:0, left:0, right:0, height:"40px", background:"linear-gradient(to bottom, transparent, rgba(4,17,36,0.95))", pointerEvents:"none" }}/>
                    </div>
                    {portfolios.length > 0 && !localSearch && (
                      <div style={{ borderTop:"1px solid rgba(255,255,255,0.06)" }}>
                        <div style={{ padding:"7px 12px 4px", color:"rgba(255,255,255,0.22)", fontSize:"9px", letterSpacing:"0.14em" }}>MES PORTEFEUILLES</div>
                        {portfolios.map((p: any) => (
                          <div key={p.id}
                            onClick={() => { setActivePortfolio({ id:p.id, name:p.name, assets:p.assets||[], color:p.color||"#5B8DEF" }); setMode("portfolio"); setShowDropdown(false); }}
                            style={{ display:"flex", alignItems:"center", gap:"10px", padding:"8px 12px", cursor:"pointer", transition:"background 0.12s" }}
                            onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,0.04)"}
                            onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                            <div style={{ width:"7px", height:"7px", borderRadius:"2px", background:p.color||"#5B8DEF", flexShrink:0 }}/>
                            <span style={{ color:"#F8F9FC", fontSize:"11px", flex:1 }}>{p.name}</span>
                            {p.is_simulation && <span style={{ fontSize:"8px", padding:"1px 5px", borderRadius:"4px", background:"rgba(99,102,241,0.14)", border:"1px solid rgba(99,102,241,0.28)", color:"#a5b4fc", letterSpacing:"0.08em", flexShrink:0 }}>SIM</span>}
                            <span style={{ color:"rgba(255,255,255,0.25)", fontSize:"10px" }}>{Array.isArray(p.assets)?p.assets.length:0} actifs</span>
                            {activePortfolio?.id === p.id && <span style={{ color:"#5B8DEF", fontSize:"10px" }}>●</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Nav tabs centrés */}
      {(
        <div style={{ ...pillStyle, position:"fixed", top:"12px", left:"50%", transform:"translateX(-50%)", zIndex:50, gap:"0", padding:"3px", height:"36px", boxSizing:"border-box" }}>
          {navTabs.map(tab => {
            const tabBase = tab.href.split("?")[0];
            const isActive = pathname === tabBase || (tabBase !== "/" && pathname.startsWith(tabBase));
            return (
              <a key={tab.label} href={tab.href}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.opacity = "0.45"; }}
                style={{ textDecoration:"none", color:t.textPrimary, fontSize:"12px",
                  fontWeight: isActive ? 500 : 400,
                  opacity: isActive ? 1 : 0.45,
                  letterSpacing:"0.05em",
                  transition:"all 0.2s",
                  whiteSpace:"nowrap" as const,
                  padding:"6px 14px",
                  borderRadius:"999px",
                  background: isActive ? (t.isDark ? "rgba(255,255,255,0.08)" : "rgba(16,24,40,0.07)") : "transparent",
                  display:"block",
                }}>
                {tab.label}
              </a>
            );
          })}
        </div>
      )}


      {showDropdown && <div style={{ position:"fixed", inset:0, zIndex:49 }} onClick={() => setShowDropdown(false)}/>}
      {showPortfolioMenu && <div style={{ position:"fixed", inset:0, zIndex:49 }} onClick={() => setShowPortfolioMenu(false)}/>}

      {/* Right zone: theme toggle + avatar profil */}
      <div style={{ position:"fixed", top:"12px", right:"20px", zIndex:50, display:"flex", alignItems:"center", gap:"8px" }}>
        {/* Theme toggle — désactivé temporairement */}

        {/* Avatar profil */}
        {user && (
          <button onClick={() => setShowProfile(true)}
            style={{ ...pillStyle, gap:"7px", padding:"0 10px", height:"36px", boxSizing:"border-box" }}>
            <div style={{ width:22, height:22, borderRadius:"50%", overflow:"hidden", flexShrink:0, border:"1px solid rgba(255,255,255,0.15)", background:"rgba(255,255,255,0.1)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              {user.avatar_url ? (
                <img
                  src={user.avatar_url.startsWith("/uploads") ? `${API_URL}${user.avatar_url}` : user.avatar_url}
                  alt="avatar"
                  style={{ width:"100%", height:"100%", objectFit:"cover" }}
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <span style={{ fontSize:"10px", fontWeight:700, color:"#F8F9FC", letterSpacing:"-0.01em", userSelect:"none" as const }}>
                  {(user.username || user.email || "?")[0].toUpperCase()}
                </span>
              )}
            </div>
            {user.username && (
              <span style={{ fontSize:"12px", fontWeight:500, letterSpacing:"0.04em", maxWidth:80, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>
                {user.username.split(" ")[0]}
              </span>
            )}
          </button>
        )}
      </div>

      {showProfile && user && (
        <ProfileModal
          user={user}
          onClose={() => setShowProfile(false)}
          onUpdate={u => { setUser(u); setShowProfile(false); }}
          dark
        />
      )}

    </>
  );
}
