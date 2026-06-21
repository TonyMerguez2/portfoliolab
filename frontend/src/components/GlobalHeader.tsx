"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "@/lib/AppContext";
import { TRENDING } from "@/lib/assets";

type Asset = { ticker: string; type: string; name: string; };
type Price = { price: number; change: number; };


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

  // Search
  useEffect(() => {
    if (!localSearch) { setSearchResults([]); setIsSearching(false); setHighlightIndex(-1); return; }
    setIsSearching(true);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const r = await fetch(`http://localhost:8000/api/v1/search?q=${encodeURIComponent(localSearch)}`);
        const d = await r.json();
        const items = (d?.results || []).map((x: any) => ({ ticker: x.ticker, type: x.type || "EQUITY", name: x.name || x.ticker }));
        setSearchResults(items);
        setHighlightIndex(-1);
        fetchPrices(items.slice(0,10).map((x: any) => x.ticker));
      } catch {} finally { setIsSearching(false); }
    }, 300);
  }, [localSearch]);

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

  const AssetRow = ({ a, highlighted, focused, idx }: { a: Asset; highlighted?: boolean; focused?: boolean; idx: number }) => {
    const tc = typeColor(a.type);
    const p = prices[a.ticker];
    const label = a.ticker.replace(/-USD$/,"").replace(/\.PA$/,"").replace(/\^/,"").slice(0,4);
    const [hovered, setHovered] = useState(false);
    return (
      <div
        data-idx={idx}
        style={{ display:"flex", alignItems:"center", gap:"10px", width:"100%", padding:"8px 12px", background: focused ? "rgba(91,141,239,0.12)" : hovered ? "rgba(255,255,255,0.05)" : "transparent", cursor:"pointer", borderBottom:"1px solid rgba(255,255,255,0.04)", borderLeft: focused ? "2px solid rgba(91,141,239,0.6)" : "2px solid transparent", boxSizing:"border-box" as const }}
        onClick={() => { setActiveAsset({ ticker: a.ticker, name: a.name }); setShowDropdown(false); setLocalSearch(""); setHighlightIndex(-1); }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}>
        <div style={{ width:"28px", height:"28px", borderRadius:"6px", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", background:highlighted?`${tc.text}22`:tc.bg, border:`1px solid ${highlighted?tc.text:tc.border}`, boxShadow:highlighted?`0 0 8px ${tc.text}55`:"none", transition:"all 0.2s" }}>
          <span style={{ fontSize:"8px", fontWeight:800, color:tc.text, letterSpacing:"-0.02em" }}>{label}</span>
        </div>
        <span style={{ color:"#F8F9FC", fontSize:"11px", fontWeight:500, flex:1, textAlign:"left" }}>{a.name}</span>
        {hovered && (
          <button
            onClick={e => { e.stopPropagation(); router.push(`/chart?ticker=${encodeURIComponent(a.ticker)}`); setShowDropdown(false); }}
            style={{ background:"rgba(91,141,239,0.15)", border:"1px solid rgba(91,141,239,0.3)", borderRadius:"5px", color:"#9BB9FF", fontSize:"10px", padding:"3px 8px", cursor:"pointer", flexShrink:0, whiteSpace:"nowrap" as const, letterSpacing:"0.03em" }}>
            Graphique
          </button>
        )}
        {p && (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:"1px" }}>
            <span style={{ color:"#F8F9FC", fontSize:"10px", opacity:0.6 }}>${p.price.toLocaleString("en-US", { minimumFractionDigits:2, maximumFractionDigits:2 })}</span>
            <span style={{ fontSize:"10px", fontWeight:600, color:p.change>=0?"#22c55e":"#ef4444" }}>{p.change>=0?"▲":"▼"} {Math.abs(p.change).toFixed(2)}%</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {!isLanding && !isChartPage && (
        <a href="/" style={{ position:"fixed", top:"18px", left:"20px", zIndex:50, textDecoration:"none", color:"#F8F9FC", fontSize:"13px", fontWeight:700, letterSpacing:"0.22em", opacity:0.85 }}>NOVAC</a>
      )}

      {/* Switcher centré */}
      {pathname !== "/build" && !isChartPage && <div style={{ position:"fixed", top:"13px", left:"50%", transform:"translateX(-50%)", zIndex:50 }}>
        <div style={{ display:"flex", alignItems:"center", borderRadius:"10px", padding:"3px", ...glass }}>
          <div style={{ position:"relative" }}>
            <button onClick={() => { setMode("portfolio"); setShowPortfolioMenu(v => !v); setShowDropdown(false); }}
              style={{ padding:"5px 16px", borderRadius:"7px", border:"none", background:mode==="portfolio"?"rgba(255,255,255,0.12)":"transparent", color:"#F8F9FC", fontSize:"11px", fontWeight:mode==="portfolio"?600:400, opacity:mode==="portfolio"?1:0.45, cursor:"pointer", letterSpacing:"0.06em", boxShadow:mode==="portfolio"?"0 0 12px rgba(91,141,239,0.2)":"none", transition:"all 0.2s", whiteSpace:"nowrap" }}>
              {activePortfolio ? `● ${activePortfolio.name}` : mode==="portfolio" ? "● Portefeuille" : "○ Portefeuille"}
            </button>
            {showPortfolioMenu && (
              <div style={{ position:"absolute", top:"calc(100% + 10px)", left:0, background:"rgba(4,17,36,0.97)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"12px", minWidth:"220px", boxShadow:"0 16px 40px rgba(0,0,0,0.5)", overflow:"hidden", zIndex:70 }}
                onMouseDown={e => e.preventDefault()}>
                {portfolios.length > 0 && (
                  <>
                    <div style={{ padding:"7px 12px 4px", color:"rgba(255,255,255,0.22)", fontSize:"9px", letterSpacing:"0.14em" }}>MES PORTEFEUILLES</div>
                    {portfolios.map((p: any) => (
                      <div key={p.id}
                        style={{ display:"flex", alignItems:"center", gap:"10px", width:"100%", padding:"9px 12px", background:hoveredPortfolioId===p.id?"rgba(255,255,255,0.05)":"transparent", borderBottom:"1px solid rgba(255,255,255,0.04)", cursor:"pointer" }}
                        onClick={() => { setActivePortfolio({ id: p.id, name: p.name, assets: p.assets || [], color: p.color || "#5B8DEF" }); setMode("portfolio"); setShowPortfolioMenu(false); }}
                        onMouseEnter={() => setHoveredPortfolioId(p.id)}
                        onMouseLeave={() => setHoveredPortfolioId(null)}>
                        <div style={{ width:"7px", height:"7px", borderRadius:"2px", background: p.color || "#5B8DEF", flexShrink:0 }}/>
                        <span style={{ color:"#F8F9FC", fontSize:"11px", flex:1 }}>{p.name}</span>
                        {hoveredPortfolioId === p.id ? (
                          <button
                            onClick={e => { e.stopPropagation(); setActivePortfolio({ id: p.id, name: p.name, assets: p.assets || [], color: p.color || "#5B8DEF" }); setMode("portfolio"); setShowPortfolioMenu(false); router.push("/chart?portfolio=true"); }}
                            style={{ background:"rgba(91,141,239,0.15)", border:"1px solid rgba(91,141,239,0.3)", borderRadius:"5px", color:"#9BB9FF", fontSize:"10px", padding:"2px 7px", cursor:"pointer", flexShrink:0, whiteSpace:"nowrap" as const }}>
                            Graphique
                          </button>
                        ) : (
                          <>
                            <span style={{ color:"rgba(255,255,255,0.25)", fontSize:"10px" }}>{Array.isArray(p.assets) ? p.assets.length : 0} actifs</span>
                            {activePortfolio?.id === p.id && <span style={{ color:"#5B8DEF", fontSize:"10px" }}>●</span>}
                          </>
                        )}
                      </div>
                    ))}
                    <div style={{ height:"1px", background:"rgba(255,255,255,0.06)", margin:"4px 0" }}/>
                  </>
                )}
                <button onClick={() => { router.push("/build"); setShowPortfolioMenu(false); }}
                  style={{ display:"flex", alignItems:"center", gap:"8px", width:"100%", padding:"9px 12px", background:"transparent", border:"none", cursor:"pointer", color:"rgba(255,255,255,0.5)", fontSize:"11px", letterSpacing:"0.04em" }}
                  onMouseEnter={e => { e.currentTarget.style.background="rgba(91,141,239,0.08)"; e.currentTarget.style.color="#9BB9FF"; }}
                  onMouseLeave={e => { e.currentTarget.style.background="transparent"; e.currentTarget.style.color="rgba(255,255,255,0.5)"; }}>
                  <span style={{ opacity:0.5 }}>+</span> Nouveau portefeuille
                </button>
              </div>
            )}
          </div>
          <div style={{ width:"1px", height:"16px", background:"rgba(255,255,255,0.12)", flexShrink:0 }}/>
          <button onClick={() => { setMode("asset"); setShowDropdown(true); setShowPortfolioMenu(false); setTimeout(() => inputRef.current?.focus(), 50); }} style={{ padding:"5px 14px", borderRadius:"7px", border:"none", background:mode==="asset"?"rgba(255,255,255,0.12)":"transparent", color:"#F8F9FC", fontSize:"11px", fontWeight:mode==="asset"?600:400, opacity:mode==="asset"?1:0.45, cursor:"pointer", letterSpacing:"0.06em", boxShadow:mode==="asset"?"0 0 12px rgba(91,141,239,0.2)":"none", transition:"all 0.2s", whiteSpace:"nowrap" }}>
            {mode==="asset" ? "● Actif seul" : "○ Actif seul"}
          </button>
          {mode==="asset" && (
            <>
              <div style={{ width:"1px", height:"16px", background:"rgba(255,255,255,0.12)", flexShrink:0 }}/>
              {pathname !== "/build" && <div style={{ display:"flex", alignItems:"center", gap:"6px", padding:"0 10px", width:"180px", flexShrink:0, position:"relative" }}>
                {activeAsset && !localSearch ? (() => { const tc = typeColor(TRENDING.find(a=>a.ticker===activeAsset.ticker)?.type||"EQUITY"); const label = activeAsset.ticker.replace(/-USD$/,"").replace(/\.PA$/,"").replace(/\^/,"").slice(0,4); return <div style={{ width:"28px", height:"28px", borderRadius:"6px", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", background:tc.bg, border:`1px solid ${tc.border}` }}><span style={{ fontSize:"8px", fontWeight:800, color:tc.text, letterSpacing:"-0.02em" }}>{label}</span></div>; })() : (
                <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="#F8F9FC" strokeWidth={2} style={{ opacity:0.35, flexShrink:0 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
                </svg>)}
                <input ref={inputRef} value={localSearch} onChange={e => { setLocalSearch(e.target.value); setShowDropdown(true); setHighlightIndex(-1); }}
                  onFocus={() => setShowDropdown(true)}
                  onKeyDown={handleKeyDown}
                  placeholder={activeAsset ? activeAsset.name : "Rechercher un actif..."}
                  style={{ background:"transparent", border:"none", outline:"none", color:"#F8F9FC", fontSize:"11px", width:"100%", opacity:localSearch?1:0.5 }}
                />
                {isSearching
                  ? <span style={{ color:"rgba(91,141,239,0.7)", fontSize:"10px", flexShrink:0, letterSpacing:"0.05em", animation:"none" }}>···</span>
                  : localSearch && <button onMouseDown={e=>e.preventDefault()} onClick={() => { setLocalSearch(""); setSearchResults([]); setHighlightIndex(-1); }} style={{ background:"transparent", border:"none", cursor:"pointer", opacity:0.4, color:"#F8F9FC", padding:0, fontSize:"11px" }}>✕</button>}
              </div>}
            </>
          )}
        </div>

        {/* Dropdown liste d'actifs */}
        {showDropdown && mode==="asset" && (
          <div style={{ position:"absolute", top:"calc(100% + 6px)", left:"50%", transform:"translateX(-50%)", width:"420px", background:"rgba(4,17,36,0.97)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"12px", overflow:"hidden", boxShadow:"0 16px 48px rgba(0,0,0,0.5)", zIndex:60 }}
            onMouseDown={e => e.preventDefault()}>
            {/* Catégories */}
            <div style={{ display:"flex", gap:"2px", padding:"8px 8px 6px", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
              {[{id:"all",label:"Tous"},{id:"EQUITY",label:"Actions"},{id:"ETF",label:"Fonds"},{id:"INDEX",label:"Indices"},{id:"CRYPTOCURRENCY",label:"Crypto"}].map(cat => (
                <button key={cat.id} onClick={() => { setCategory(cat.id); setDisplayCount(20); }} style={{ padding:"3px 10px", borderRadius:"6px", border:"none", fontSize:"10px", background:category===cat.id?"rgba(91,141,239,0.2)":"transparent", color:category===cat.id?"#9BB9FF":"rgba(255,255,255,0.4)", cursor:"pointer", fontWeight:category===cat.id?600:400, letterSpacing:"0.04em" }}>
                  {cat.label}
                </button>
              ))}
            </div>
            {/* Liste scrollable */}
            <div ref={listRef} onScroll={handleScroll} style={{ maxHeight:"320px", overflowY:"auto" }}>
              {!localSearch && <div style={{ padding:"3px 12px 2px", color:"rgba(255,255,255,0.2)", fontSize:"9px", letterSpacing:"0.12em" }}>POPULAIRES</div>}
              {displayAssets.map((a, i) => <AssetRow key={a.ticker} a={a} highlighted={i===0 && !!localSearch} focused={i===highlightIndex} idx={i}/>)}
              {!localSearch && displayCount < filteredAssets.length && (
                <div style={{ padding:"10px", textAlign:"center", color:"rgba(255,255,255,0.2)", fontSize:"10px" }}>Scroll pour charger plus...</div>
              )}
            </div>
          </div>
        )}
      </div>}

      {/* Outils */}
      {!isChartPage && <div style={{ position:"fixed", top:"13px", right:"20px", zIndex:50 }}>
        <div style={{ position:"relative" }}>
          <button onClick={() => setShowTools(t => !t)} style={{ display:"flex", alignItems:"center", gap:"6px", borderRadius:"8px", padding:"6px 14px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.06)", backdropFilter:"blur(20px)", color:"rgba(255,255,255,0.7)", fontSize:"11px", fontWeight:400, letterSpacing:"0.06em", cursor:"pointer" }}>
            ≡ Outils <span style={{ opacity:0.5, fontSize:"10px" }}>{showTools?"▲":"▼"}</span>
          </button>
          {showTools && (
            <div style={{ position:"absolute", top:"calc(100% + 8px)", right:0, background:"rgba(4,17,36,0.97)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"12px", backdropFilter:"blur(24px)", padding:"6px", minWidth:"210px", boxShadow:"0 16px 40px rgba(0,0,0,0.4)" }}>
              {[{icon:"◈",label:"Créer un portefeuille",href:"/build"},{icon:"◎",label:"Analyse de marché"},{icon:"⬡",label:"ETF Map",href:"/map"},{icon:"⟁",label:"Monte Carlo"},{icon:"◆",label:"Optimisation Markowitz"}].map((item:any) => (
                <button key={item.label} onClick={() => { item.href && router.push(item.href); setShowTools(false); }}
                  style={{ display:"flex", alignItems:"center", gap:"10px", width:"100%", padding:"9px 12px", borderRadius:"7px", background:"transparent", border:"none", color:"#F8F9FC", fontSize:"12px", cursor:item.href?"pointer":"default", textAlign:"left", opacity:0.7, transition:"background 0.15s" }}
                  onMouseEnter={e => { e.currentTarget.style.background="rgba(255,255,255,0.07)"; e.currentTarget.style.opacity="1"; }}
                  onMouseLeave={e => { e.currentTarget.style.background="transparent"; e.currentTarget.style.opacity="0.7"; }}>
                  <span style={{ opacity:0.5, fontSize:"14px" }}>{item.icon}</span>{item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>}

      {showDropdown && <div style={{ position:"fixed", inset:0, zIndex:49 }} onClick={() => setShowDropdown(false)}/>}
      {showPortfolioMenu && <div style={{ position:"fixed", inset:0, zIndex:49 }} onClick={() => setShowPortfolioMenu(false)}/>}


    </>
  );
}
