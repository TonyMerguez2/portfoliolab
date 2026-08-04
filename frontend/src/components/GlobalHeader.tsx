"use client";
import { useEffect, useRef, useState, memo, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "@/lib/AppContext";
import { enTetesAuth } from "@/lib/session";
import { TRENDING } from "@/lib/assets";
import AssetLogo from "@/components/AssetLogo";
import { JETONS, RAYONS } from "@/lib/palette";

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
  const { mode, setMode, activePortfolio, setActivePortfolio, activeAsset, setActiveAsset, displayMode, toggleDisplayMode } = useApp();
  const [localSearch, setLocalSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Asset[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showPortfolioMenu, setShowPortfolioMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
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
  const debounce = useRef<NodeJS.Timeout | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isLanding = pathname === "/";
  const isChartPage = pathname === "/chart";
  useEffect(() => {
    fetch("http://localhost:8000/api/v1/portfolios", { headers: enTetesAuth() })
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

  // ⌘K, comme dans la maquette. Le raccourci est posé sur le document parce que
  // le champ n'a pas le focus au moment où on veut l'y amener.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowSearch(true);
        searchRef.current?.focus();
      }
      if (e.key === "Escape") { setShowSearch(false); setShowNotifs(false); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (highlightIndex < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${highlightIndex}"]`) as HTMLElement;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex]);

  const pillStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", borderRadius: RAYONS.plein,
    background: JETONS.carteCreuse,
    backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
    border: `1px solid ${JETONS.bord}`, cursor: "pointer",
    color: JETONS.texte, boxShadow: JETONS.ombre,
  };

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

  return (
    <>

      {/* Le salut a été retiré : il occupait la moitié gauche du bandeau pour
          répéter un prénom déjà lisible en bas de la barre latérale. Le
          sous-titre reste sur la page portefeuille, lui seul disant quelque
          chose de la page regardée. */}
      {pathname.startsWith("/portfolio") && (
        <div style={{
          position:"fixed", top:"18px", left:"calc(var(--novac-nav-w, 232px) + 20px)", zIndex:50,
          lineHeight:1.25, transition:"left 220ms cubic-bezier(0.4,0,0.2,1)",
        }}>
          <p style={{ margin:0, fontSize:"12px", color:JETONS.texteSecondaire, whiteSpace:"nowrap" }}>
            Voici la performance de votre portefeuille
          </p>
        </div>
      )}

      {/* La navigation vit désormais dans SideNav, en panneau latéral. */}

      {showDropdown && <div style={{ position:"fixed", inset:0, zIndex:49 }} onClick={() => setShowDropdown(false)}/>}
      {showPortfolioMenu && <div style={{ position:"fixed", inset:0, zIndex:49 }} onClick={() => setShowPortfolioMenu(false)}/>}


      {/* Recherche globale.
          Elle n'existait que repliée dans le menu du portefeuille, et sur la
          page portefeuille ce menu ne montre que les portefeuilles : il n'y
          avait donc aucun moyen de chercher un actif depuis cette page. */}
      <div style={{ position:"fixed", top:"12px", right:"20px", zIndex:50, display:"flex", alignItems:"flex-start", gap:"8px" }}>
        {/* Le sélecteur de portefeuille vivait ici. Retiré à la demande : il
            encombrait le bandeau à gauche de la recherche.
            Conséquence à connaître — c'était le seul moyen de passer d'un
            portefeuille à l'autre. La page prend désormais celui du contexte,
            ou le premier de la liste à défaut. */}


        <div style={{ position:"relative", width:"320px" }}>
        <div style={{
          display:"flex", alignItems:"center", gap:"8px", height:"36px", padding:"0 12px",
          borderRadius:RAYONS.md, boxSizing:"border-box",
          // Un aplat sombre et sans liseré, comme le concept : le champ y est
          // un creux dans le bandeau, pas un objet cerné posé dessus. Le verre
          // translucide qu'il portait le laissait flotter entre les deux.
          background:JETONS.segmentPiste,
          border:"none",
          outline: showSearch ? `1px solid ${JETONS.accentBord}` : "none",
          transition:"outline-color 150ms",
        }}>
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}
            style={{ flexShrink:0, color:JETONS.texteIntense }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
          </svg>
          <input ref={searchRef} value={localSearch}
            onChange={e => { setLocalSearch(e.target.value); setHighlightIndex(-1); setShowSearch(true); }}
            onFocus={() => setShowSearch(true)}
            onKeyDown={handleKeyDown}
            placeholder="Rechercher un actif, un ETF, un indice…"
            style={{ background:"transparent", border:"none", outline:"none", color:JETONS.texte, fontSize:"12px", flex:1, minWidth:0 }}/>
          {localSearch
            ? <button onMouseDown={e => e.preventDefault()}
                onClick={() => { setLocalSearch(""); setSearchResults([]); setHighlightIndex(-1); }}
                style={{ background:"transparent", border:"none", cursor:"pointer", opacity:0.4, color:JETONS.texte, padding:0, fontSize:"12px" }}>✕</button>
            : (
              // Deux touches distinctes plutôt qu'un « ⌘K » en un seul mot :
              // ce sont deux touches à presser, et le concept les montre
              // comme telles, chacune sur son capuchon.
              <span style={{ display:"flex", gap:4, flexShrink:0 }} aria-hidden="true">
                {["⌘", "K"].map(t => (
                  <kbd key={t} style={{
                    display:"flex", alignItems:"center", justifyContent:"center",
                    minWidth:20, height:20, padding:"0 5px", borderRadius:RAYONS.xs,
                    background:JETONS.segmentPiste, color:JETONS.texteSecondaire,
                    fontFamily:"inherit", fontSize:"11px", fontWeight:500, lineHeight:1,
                  }}>{t}</kbd>
                ))}
              </span>
            )}
        </div>

        {showSearch && (
          <div style={{
            position:"absolute", top:"calc(100% + 6px)", right:0, width:"420px",
            background:"rgba(4,17,36,0.97)", border:"1px solid rgba(255,255,255,0.1)",
            borderRadius:"12px", overflow:"hidden", boxShadow:"0 16px 48px rgba(0,0,0,0.5)", zIndex:60,
          }} onMouseDown={e => e.preventDefault()}>
            <div style={{ display:"flex", gap:"2px", padding:"6px 8px", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
              {[{id:"all",label:"Tous"},{id:"EQUITY",label:"Actions"},{id:"ETF",label:"Fonds"},{id:"INDEX",label:"Indices"},{id:"CRYPTOCURRENCY",label:"Crypto"}].map(cat => (
                <button key={cat.id} onClick={() => { setCategory(cat.id); setDisplayCount(20); }}
                  style={{ padding:"3px 10px", borderRadius:"6px", border:"none", fontSize:"10px", cursor:"pointer",
                    background:category===cat.id?"rgba(91,141,239,0.2)":"transparent",
                    color:category===cat.id?"#9BB9FF":"rgba(255,255,255,0.4)",
                    fontWeight:category===cat.id?600:400, letterSpacing:"0.04em" }}>{cat.label}</button>
              ))}
            </div>
            <div ref={listRef} onScroll={handleScroll} style={{ maxHeight:"320px", overflowY:"auto" }}>
              {!localSearch && <div style={{ padding:"6px 12px 2px", color:"rgba(255,255,255,0.2)", fontSize:"9px", letterSpacing:"0.12em" }}>POPULAIRES</div>}
              {displayAssets.map((a, i) => (
                <AssetRow key={a.ticker} a={a} highlighted={i===0 && !!localSearch} focused={i===highlightIndex}
                  idx={i} price={prices[a.ticker]}
                  onSelect={x => { handleSelect(x); setShowSearch(false); }}
                  onChart={x => { handleChart(x); setShowSearch(false); }}/>
              ))}
              {localSearch && displayAssets.length === 0 && !isSearching && (
                <div style={{ padding:"18px 14px", textAlign:"center", color:"rgba(255,255,255,0.25)", fontSize:"11px" }}>Aucun résultat</div>
              )}
            </div>
          </div>
        )}
        </div>

        {/* Cloche. Pas de pastille de notification : il n'existe aucune source
            d'alertes dans le projet, et un point coloré promettrait du contenu
            qui n'arriverait jamais. Elle dit ce qu'elle sait. */}
        <div style={{ position:"relative" }}>
          <button type="button" onClick={() => setShowNotifs(v => !v)}
            aria-label="Réglages" title="Réglages"
            style={{
              width:36, height:36, borderRadius:RAYONS.md, flexShrink:0, cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center",
              // Pastille claire à icône sombre, comme le bouton d'angle du
              // concept — et comme les segments de la page, dont c'est déjà la
              // langue. Le verre translucide qu'elle portait la faisait
              // disparaître dans le bandeau.
              background:JETONS.segmentActif,
              border:"none", color:JETONS.segmentEncre,
              boxShadow:JETONS.segmentOmbre,
              transition:"opacity 150ms",
              opacity: showNotifs ? 0.86 : 1,
            }}>
            {/* Une roue dentée : crête plate, flanc presque radial, congés.
                Chaque dent est un arc du cercle extérieur — c'est ce plat qui
                dit « engrenage ». Le creux est un arc du cercle intérieur, et
                les deux se raccordent par une cubique courte. L'arrondi vient
                des congés, pas de la forme des dents : une version antérieure
                courbait les dents elles-mêmes et la roue devenait une fleur.

                Les bras de contrôle tiennent à 30 % du creux, pas davantage.
                Au-delà, la courbe part dans le sens de la circonférence, doit
                virer d'un quart de tour pour redescendre, et dépasse : le
                flanc se referme en crochet. À 45 % le tracé bouclait sur
                lui-même — invisible sous le trait épais, flagrant en fil de
                fer.

                Huit dents courtes sur un corps large, et non six longues sur
                un corps mince. C'est ce qui change tout dans l'allure, et
                c'est aussi ce qui a imposé la taille : rendues au pixel près,
                huit dents ne se séparent pas à 14 px — l'entre-dent y vaut un
                pixel et demi, que le trait remplit. Il en faut seize.

                D'où la loupe à 20 px. Les deux tracés n'occupent pas la même
                part de leur boîte — la loupe 16 unités sur 24, la roue 20,4,
                mesuré et non supposé. À 16 et 20 px, les encres valent
                respectivement 13,6 et 13,3 px : la parité tient, et
                l'engrenage a enfin de quoi se lire. */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth={1.9} strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
              <path d="M22.07 10.40 A10.2 10.2 0 0 1 22.07 13.60 C21.94 14.43 19.39 12.91 19.20 13.73 A7.4 7.4 0 0 1 18.31 15.87 C17.87 16.58 20.75 17.32 20.25 18.00 A10.2 10.2 0 0 1 18.00 20.25 C17.32 20.75 16.58 17.87 15.87 18.31 A7.4 7.4 0 0 1 13.73 19.20 C12.91 19.39 14.43 21.94 13.60 22.07 A10.2 10.2 0 0 1 10.40 22.07 C9.57 21.94 11.09 19.39 10.27 19.20 A7.4 7.4 0 0 1 8.13 18.31 C7.42 17.87 6.68 20.75 6.00 20.25 A10.2 10.2 0 0 1 3.75 18.00 C3.25 17.32 6.13 16.58 5.69 15.87 A7.4 7.4 0 0 1 4.80 13.73 C4.61 12.91 2.06 14.43 1.93 13.60 A10.2 10.2 0 0 1 1.93 10.40 C2.06 9.57 4.61 11.09 4.80 10.27 A7.4 7.4 0 0 1 5.69 8.13 C6.13 7.42 3.25 6.68 3.75 6.00 A10.2 10.2 0 0 1 6.00 3.75 C6.68 3.25 7.42 6.13 8.13 5.69 A7.4 7.4 0 0 1 10.27 4.80 C11.09 4.61 9.57 2.06 10.40 1.93 A10.2 10.2 0 0 1 13.60 1.93 C14.43 2.06 12.91 4.61 13.73 4.80 A7.4 7.4 0 0 1 15.87 5.69 C16.58 6.13 17.32 3.25 18.00 3.75 A10.2 10.2 0 0 1 20.25 6.00 C20.75 6.68 17.87 7.42 18.31 8.13 A7.4 7.4 0 0 1 19.20 10.27 C19.39 11.09 21.94 9.57 22.07 10.40Z" />
              <circle cx="12" cy="12" r="3.3" />
            </svg>
          </button>
          {showNotifs && (
            <div style={{
              position:"absolute", top:"calc(100% + 6px)", right:0, width:"250px",
              background:"rgba(4,17,36,0.97)", border:"1px solid rgba(255,255,255,0.1)",
              borderRadius:"12px", padding:"18px 14px", textAlign:"center", zIndex:60,
              boxShadow:"0 16px 48px rgba(0,0,0,0.5)",
            }}>
              <span style={{ fontSize:"11px", color:"rgba(255,255,255,0.35)", lineHeight:1.5 }}>
                Aucune notification
              </span>
            </div>
          )}
        </div>
      </div>
      {(showSearch || showNotifs) && (
        <div style={{ position:"fixed", inset:0, zIndex:49 }}
          onClick={() => { setShowSearch(false); setShowNotifs(false); }}/>
      )}
    </>
  );
}
