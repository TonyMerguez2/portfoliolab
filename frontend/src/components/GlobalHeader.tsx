"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "@/lib/AppContext";

type Asset = { ticker: string; type: string; name: string; };
type Price = { price: number; change: number; };

const TRENDING: Asset[] = [
  // US Large Cap
  {ticker:"AAPL",type:"EQUITY",name:"Apple Inc."},
  {ticker:"MSFT",type:"EQUITY",name:"Microsoft Corp."},
  {ticker:"NVDA",type:"EQUITY",name:"NVIDIA Corp."},
  {ticker:"TSLA",type:"EQUITY",name:"Tesla Inc."},
  {ticker:"AMZN",type:"EQUITY",name:"Amazon.com"},
  {ticker:"META",type:"EQUITY",name:"Meta Platforms"},
  {ticker:"GOOGL",type:"EQUITY",name:"Alphabet Inc."},
  {ticker:"GOOG",type:"EQUITY",name:"Alphabet Inc. C"},
  {ticker:"JPM",type:"EQUITY",name:"JPMorgan Chase"},
  {ticker:"V",type:"EQUITY",name:"Visa Inc."},
  {ticker:"MA",type:"EQUITY",name:"Mastercard"},
  {ticker:"JNJ",type:"EQUITY",name:"Johnson & Johnson"},
  {ticker:"WMT",type:"EQUITY",name:"Walmart Inc."},
  {ticker:"BAC",type:"EQUITY",name:"Bank of America"},
  {ticker:"XOM",type:"EQUITY",name:"ExxonMobil"},
  {ticker:"UNH",type:"EQUITY",name:"UnitedHealth Group"},
  {ticker:"PG",type:"EQUITY",name:"Procter & Gamble"},
  {ticker:"HD",type:"EQUITY",name:"Home Depot"},
  {ticker:"ABBV",type:"EQUITY",name:"AbbVie Inc."},
  {ticker:"MRK",type:"EQUITY",name:"Merck & Co."},
  {ticker:"AVGO",type:"EQUITY",name:"Broadcom Inc."},
  {ticker:"COST",type:"EQUITY",name:"Costco Wholesale"},
  {ticker:"KO",type:"EQUITY",name:"Coca-Cola Co."},
  {ticker:"LLY",type:"EQUITY",name:"Eli Lilly & Co."},
  {ticker:"MCD",type:"EQUITY",name:"McDonald's Corp."},
  {ticker:"INTC",type:"EQUITY",name:"Intel Corp."},
  {ticker:"AMD",type:"EQUITY",name:"Advanced Micro Devices"},
  {ticker:"CRM",type:"EQUITY",name:"Salesforce Inc."},
  {ticker:"ADBE",type:"EQUITY",name:"Adobe Inc."},
  {ticker:"NFLX",type:"EQUITY",name:"Netflix Inc."},
  {ticker:"PYPL",type:"EQUITY",name:"PayPal Holdings"},
  {ticker:"QCOM",type:"EQUITY",name:"Qualcomm Inc."},
  {ticker:"TXN",type:"EQUITY",name:"Texas Instruments"},
  {ticker:"HON",type:"EQUITY",name:"Honeywell Intl."},
  {ticker:"UPS",type:"EQUITY",name:"United Parcel Service"},
  {ticker:"CAT",type:"EQUITY",name:"Caterpillar Inc."},
  {ticker:"GS",type:"EQUITY",name:"Goldman Sachs"},
  {ticker:"MS",type:"EQUITY",name:"Morgan Stanley"},
  {ticker:"BLK",type:"EQUITY",name:"BlackRock Inc."},
  {ticker:"SPGI",type:"EQUITY",name:"S&P Global"},
  {ticker:"CB",type:"EQUITY",name:"Chubb Ltd."},
  {ticker:"MMC",type:"EQUITY",name:"Marsh McLennan"},
  {ticker:"RTX",type:"EQUITY",name:"Raytheon Technologies"},
  {ticker:"BA",type:"EQUITY",name:"Boeing Co."},
  {ticker:"LMT",type:"EQUITY",name:"Lockheed Martin"},
  {ticker:"GE",type:"EQUITY",name:"General Electric"},
  {ticker:"DE",type:"EQUITY",name:"Deere & Co."},
  {ticker:"F",type:"EQUITY",name:"Ford Motor Co."},
  {ticker:"GM",type:"EQUITY",name:"General Motors"},
  {ticker:"DIS",type:"EQUITY",name:"Walt Disney Co."},
  {ticker:"CMCSA",type:"EQUITY",name:"Comcast Corp."},
  {ticker:"VZ",type:"EQUITY",name:"Verizon Comm."},
  {ticker:"T",type:"EQUITY",name:"AT&T Inc."},
  {ticker:"CVS",type:"EQUITY",name:"CVS Health"},
  {ticker:"WFC",type:"EQUITY",name:"Wells Fargo"},
  {ticker:"C",type:"EQUITY",name:"Citigroup Inc."},
  {ticker:"USB",type:"EQUITY",name:"U.S. Bancorp"},
  {ticker:"TGT",type:"EQUITY",name:"Target Corp."},
  {ticker:"SBUX",type:"EQUITY",name:"Starbucks Corp."},
  {ticker:"NKE",type:"EQUITY",name:"Nike Inc."},
  {ticker:"LOW",type:"EQUITY",name:"Lowe's Companies"},
  {ticker:"NEE",type:"EQUITY",name:"NextEra Energy"},
  {ticker:"SO",type:"EQUITY",name:"Southern Co."},
  {ticker:"DUK",type:"EQUITY",name:"Duke Energy"},
  {ticker:"CVX",type:"EQUITY",name:"Chevron Corp."},
  {ticker:"COP",type:"EQUITY",name:"ConocoPhillips"},
  {ticker:"SLB",type:"EQUITY",name:"Schlumberger NV"},
  {ticker:"AMT",type:"EQUITY",name:"American Tower"},
  {ticker:"PLD",type:"EQUITY",name:"Prologis Inc."},
  {ticker:"EQIX",type:"EQUITY",name:"Equinix Inc."},
  {ticker:"NOW",type:"EQUITY",name:"ServiceNow Inc."},
  {ticker:"SNOW",type:"EQUITY",name:"Snowflake Inc."},
  {ticker:"UBER",type:"EQUITY",name:"Uber Technologies"},
  {ticker:"LYFT",type:"EQUITY",name:"Lyft Inc."},
  {ticker:"ABNB",type:"EQUITY",name:"Airbnb Inc."},
  {ticker:"COIN",type:"EQUITY",name:"Coinbase Global"},
  {ticker:"HOOD",type:"EQUITY",name:"Robinhood Markets"},
  {ticker:"PLTR",type:"EQUITY",name:"Palantir Technologies"},
  {ticker:"ARM",type:"EQUITY",name:"Arm Holdings"},
  {ticker:"SMCI",type:"EQUITY",name:"Super Micro Computer"},
  // Europe
  {ticker:"MC.PA",type:"EQUITY",name:"LVMH"},
  {ticker:"TTE.PA",type:"EQUITY",name:"TotalEnergies"},
  {ticker:"ASML",type:"EQUITY",name:"ASML Holding"},
  {ticker:"SAP",type:"EQUITY",name:"SAP SE"},
  {ticker:"OR.PA",type:"EQUITY",name:"L'Oréal"},
  {ticker:"SAN.PA",type:"EQUITY",name:"Sanofi"},
  {ticker:"AIR.PA",type:"EQUITY",name:"Airbus SE"},
  {ticker:"BNP.PA",type:"EQUITY",name:"BNP Paribas"},
  {ticker:"SU.PA",type:"EQUITY",name:"Schneider Electric"},
  {ticker:"AI.PA",type:"EQUITY",name:"Air Liquide"},
  {ticker:"RI.PA",type:"EQUITY",name:"Pernod Ricard"},
  {ticker:"KER.PA",type:"EQUITY",name:"Kering"},
  {ticker:"HO.PA",type:"EQUITY",name:"Thales"},
  {ticker:"DG.PA",type:"EQUITY",name:"Vinci SA"},
  {ticker:"CS.PA",type:"EQUITY",name:"AXA SA"},
  {ticker:"ACA.PA",type:"EQUITY",name:"Crédit Agricole"},
  {ticker:"GLE.PA",type:"EQUITY",name:"Société Générale"},
  {ticker:"STLA",type:"EQUITY",name:"Stellantis NV"},
  {ticker:"SIE.DE",type:"EQUITY",name:"Siemens AG"},
  {ticker:"ALV.DE",type:"EQUITY",name:"Allianz SE"},
  {ticker:"BMW.DE",type:"EQUITY",name:"BMW AG"},
  {ticker:"VOW3.DE",type:"EQUITY",name:"Volkswagen AG"},
  {ticker:"BAYN.DE",type:"EQUITY",name:"Bayer AG"},
  {ticker:"BAS.DE",type:"EQUITY",name:"BASF SE"},
  {ticker:"DTE.DE",type:"EQUITY",name:"Deutsche Telekom"},
  {ticker:"ADS.DE",type:"EQUITY",name:"Adidas AG"},
  {ticker:"HSBA.L",type:"EQUITY",name:"HSBC Holdings"},
  {ticker:"BP.L",type:"EQUITY",name:"BP PLC"},
  {ticker:"GSK.L",type:"EQUITY",name:"GSK PLC"},
  {ticker:"ULVR.L",type:"EQUITY",name:"Unilever PLC"},
  {ticker:"SHEL.L",type:"EQUITY",name:"Shell PLC"},
  {ticker:"RIO.L",type:"EQUITY",name:"Rio Tinto"},
  {ticker:"NOVN.SW",type:"EQUITY",name:"Novartis AG"},
  {ticker:"NESN.SW",type:"EQUITY",name:"Nestlé SA"},
  {ticker:"ROG.SW",type:"EQUITY",name:"Roche Holding"},
  // Asia
  {ticker:"TSM",type:"EQUITY",name:"Taiwan Semiconductor"},
  {ticker:"7203.T",type:"EQUITY",name:"Toyota Motor"},
  {ticker:"6758.T",type:"EQUITY",name:"Sony Group"},
  {ticker:"9984.T",type:"EQUITY",name:"SoftBank Group"},
  {ticker:"BABA",type:"EQUITY",name:"Alibaba Group"},
  {ticker:"BIDU",type:"EQUITY",name:"Baidu Inc."},
  {ticker:"JD",type:"EQUITY",name:"JD.com Inc."},
  {ticker:"PDD",type:"EQUITY",name:"PDD Holdings"},
  {ticker:"TCEHY",type:"EQUITY",name:"Tencent Holdings"},
  {ticker:"005930.KS",type:"EQUITY",name:"Samsung Electronics"},
  // ETF
  {ticker:"SPY",type:"ETF",name:"SPDR S&P 500 ETF"},
  {ticker:"QQQ",type:"ETF",name:"Invesco QQQ Trust"},
  {ticker:"VTI",type:"ETF",name:"Vanguard Total Market"},
  {ticker:"VEA",type:"ETF",name:"Vanguard Dev. Markets"},
  {ticker:"VWO",type:"ETF",name:"Vanguard FTSE EM"},
  {ticker:"EEM",type:"ETF",name:"iShares MSCI EM"},
  {ticker:"GLD",type:"ETF",name:"SPDR Gold Shares"},
  {ticker:"SLV",type:"ETF",name:"iShares Silver Trust"},
  {ticker:"IWM",type:"ETF",name:"iShares Russell 2000"},
  {ticker:"ARKK",type:"ETF",name:"ARK Innovation ETF"},
  {ticker:"XLF",type:"ETF",name:"Financial Select Sector"},
  {ticker:"XLK",type:"ETF",name:"Technology Select Sector"},
  {ticker:"XLE",type:"ETF",name:"Energy Select Sector"},
  {ticker:"XLV",type:"ETF",name:"Health Care Select Sector"},
  {ticker:"XLI",type:"ETF",name:"Industrial Select Sector"},
  {ticker:"IBIT",type:"ETF",name:"iShares Bitcoin Trust"},
  {ticker:"FBTC",type:"ETF",name:"Fidelity Wise Origin Bitcoin"},
  {ticker:"CW8.PA",type:"ETF",name:"Amundi MSCI World"},
  {ticker:"EWLD.PA",type:"ETF",name:"Lyxor MSCI World"},
  {ticker:"ESE.PA",type:"ETF",name:"BNP Paribas Easy S&P 500"},
  {ticker:"PANX.PA",type:"ETF",name:"Amundi Nasdaq-100"},
  {ticker:"EWJ",type:"ETF",name:"iShares MSCI Japan"},
  {ticker:"FXI",type:"ETF",name:"iShares China Large-Cap"},
  {ticker:"EWG",type:"ETF",name:"iShares MSCI Germany"},
  {ticker:"EWU",type:"ETF",name:"iShares MSCI UK"},
  {ticker:"ACWI",type:"ETF",name:"iShares MSCI ACWI"},
  {ticker:"AGG",type:"ETF",name:"iShares Core US Aggregate"},
  {ticker:"TLT",type:"ETF",name:"iShares 20+ Year Treasury"},
  {ticker:"HYG",type:"ETF",name:"iShares iBoxx High Yield"},
  {ticker:"VNQ",type:"ETF",name:"Vanguard Real Estate ETF"},
  // Crypto
  {ticker:"BTC-USD",type:"CRYPTOCURRENCY",name:"Bitcoin"},
  {ticker:"ETH-USD",type:"CRYPTOCURRENCY",name:"Ethereum"},
  {ticker:"SOL-USD",type:"CRYPTOCURRENCY",name:"Solana"},
  {ticker:"BNB-USD",type:"CRYPTOCURRENCY",name:"BNB"},
  {ticker:"XRP-USD",type:"CRYPTOCURRENCY",name:"XRP"},
  {ticker:"DOGE-USD",type:"CRYPTOCURRENCY",name:"Dogecoin"},
  {ticker:"ADA-USD",type:"CRYPTOCURRENCY",name:"Cardano"},
  {ticker:"AVAX-USD",type:"CRYPTOCURRENCY",name:"Avalanche"},
  {ticker:"DOT-USD",type:"CRYPTOCURRENCY",name:"Polkadot"},
  {ticker:"MATIC-USD",type:"CRYPTOCURRENCY",name:"Polygon"},
  {ticker:"LINK-USD",type:"CRYPTOCURRENCY",name:"Chainlink"},
  {ticker:"UNI-USD",type:"CRYPTOCURRENCY",name:"Uniswap"},
  {ticker:"LTC-USD",type:"CRYPTOCURRENCY",name:"Litecoin"},
  {ticker:"ATOM-USD",type:"CRYPTOCURRENCY",name:"Cosmos"},
  {ticker:"NEAR-USD",type:"CRYPTOCURRENCY",name:"NEAR Protocol"},
  {ticker:"ARB-USD",type:"CRYPTOCURRENCY",name:"Arbitrum"},
  {ticker:"OP-USD",type:"CRYPTOCURRENCY",name:"Optimism"},
  {ticker:"SUI-USD",type:"CRYPTOCURRENCY",name:"Sui"},
  // Indices
  {ticker:"^GSPC",type:"INDEX",name:"S&P 500"},
  {ticker:"^NDX",type:"INDEX",name:"Nasdaq 100"},
  {ticker:"^DJI",type:"INDEX",name:"Dow Jones"},
  {ticker:"^RUT",type:"INDEX",name:"Russell 2000"},
  {ticker:"^VIX",type:"INDEX",name:"VIX Volatility"},
  {ticker:"^FCHI",type:"INDEX",name:"CAC 40"},
  {ticker:"^GDAXI",type:"INDEX",name:"DAX 40"},
  {ticker:"^FTSE",type:"INDEX",name:"FTSE 100"},
  {ticker:"^N225",type:"INDEX",name:"Nikkei 225"},
  {ticker:"^HSI",type:"INDEX",name:"Hang Seng"},
  {ticker:"^STOXX50E",type:"INDEX",name:"Euro Stoxx 50"},
  {ticker:"^IBEX",type:"INDEX",name:"IBEX 35"},
  {ticker:"^AEX",type:"INDEX",name:"AEX Amsterdam"},
  {ticker:"^SSMI",type:"INDEX",name:"SMI Switzerland"},
];

const typeColor = (type: string) => ({
  bg: type==="CRYPTOCURRENCY"?"rgba(245,158,11,0.16)":type==="ETF"?"rgba(139,92,246,0.16)":type==="INDEX"?"rgba(34,211,238,0.14)":"rgba(59,130,246,0.16)",
  border: type==="CRYPTOCURRENCY"?"rgba(245,158,11,0.35)":type==="ETF"?"rgba(139,92,246,0.35)":type==="INDEX"?"rgba(34,211,238,0.32)":"rgba(59,130,246,0.35)",
  text: type==="CRYPTOCURRENCY"?"#fcd34d":type==="ETF"?"#c4b5fd":type==="INDEX"?"#67e8f9":"#93c5fd",
});

export default function GlobalHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { mode, setMode, activePortfolio, activeAsset, setActiveAsset } = useApp();
  const [localSearch, setLocalSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Asset[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [category, setCategory] = useState("all");
  const [displayCount, setDisplayCount] = useState(20);
  const [prices, setPrices] = useState<Record<string,Price>>({});
  const [tickerData, setTickerData] = useState<any[]>([]);
  const tickerRef = useRef<HTMLDivElement>(null);
  const tickerPosRef = useRef(0);
  const debounce = useRef<NodeJS.Timeout>();
  const listRef = useRef<HTMLDivElement>(null);
  const isLanding = pathname === "/";

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
    if (!localSearch) { setSearchResults([]); return; }
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const r = await fetch(`http://localhost:8000/api/v1/search?q=${encodeURIComponent(localSearch)}`);
        const d = await r.json();
        const items = (d?.results || []).map((x: any) => ({ ticker: x.ticker, type: x.type || "EQUITY", name: x.name || x.ticker }));
        setSearchResults(items);
        fetchPrices(items.slice(0,10).map((x: any) => x.ticker));
      } catch {}
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

  const glass = { background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.14)", backdropFilter:"blur(24px)" as const, WebkitBackdropFilter:"blur(24px)" as const, boxShadow:"0 4px 24px rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.1) inset" };

  const AssetRow = ({ a, highlighted }: { a: Asset; highlighted?: boolean }) => {
    const tc = typeColor(a.type);
    const p = prices[a.ticker];
    const label = a.ticker.replace(/-USD$/,"").replace(/\.PA$/,"").replace(/\^/,"").slice(0,4);
    return (
      <button onClick={() => { setActiveAsset({ ticker: a.ticker, name: a.name }); setShowDropdown(false); setLocalSearch(""); }}
        style={{ display:"flex", alignItems:"center", gap:"10px", width:"100%", padding:"8px 12px", background:"transparent", border:"none", cursor:"pointer", borderBottom:"1px solid rgba(255,255,255,0.04)" }}
        onMouseEnter={e => (e.currentTarget.style.background="rgba(255,255,255,0.05)")}
        onMouseLeave={e => (e.currentTarget.style.background="transparent")}>
        <div style={{ width:"28px", height:"28px", borderRadius:"6px", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", background:highlighted?`${tc.text}22`:tc.bg, border:`1px solid ${highlighted?tc.text:tc.border}`, boxShadow:highlighted?`0 0 8px ${tc.text}55`:"none", transition:"all 0.2s" }}>
          <span style={{ fontSize:"8px", fontWeight:800, color:tc.text, letterSpacing:"-0.02em" }}>{label}</span>
        </div>
        <span style={{ color:"#F8F9FC", fontSize:"11px", fontWeight:500, flex:1, textAlign:"left" }}>{a.name}</span>
        {p && (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:"1px" }}>
            <span style={{ color:"#F8F9FC", fontSize:"10px", opacity:0.6 }}>${p.price.toLocaleString("en-US", { minimumFractionDigits:2, maximumFractionDigits:2 })}</span>
            <span style={{ fontSize:"10px", fontWeight:600, color:p.change>=0?"#22c55e":"#ef4444" }}>{p.change>=0?"▲":"▼"} {Math.abs(p.change).toFixed(2)}%</span>
          </div>
        )}
      </button>
    );
  };

  return (
    <>
      {!isLanding && (
        <a href="/" style={{ position:"fixed", top:"18px", left:"20px", zIndex:50, textDecoration:"none", color:"#F8F9FC", fontSize:"13px", fontWeight:700, letterSpacing:"0.22em", opacity:0.85 }}>NOVAC</a>
      )}

      {/* Switcher centré */}
      <div style={{ position:"fixed", top:"13px", left:"50%", transform:"translateX(-50%)", zIndex:50 }}>
        <div style={{ display:"flex", alignItems:"center", borderRadius:"10px", padding:"3px", ...glass }}>
          <button onClick={() => setMode("portfolio")} style={{ padding:"5px 16px", borderRadius:"7px", border:"none", background:mode==="portfolio"?"rgba(255,255,255,0.12)":"transparent", color:"#F8F9FC", fontSize:"11px", fontWeight:mode==="portfolio"?600:400, opacity:mode==="portfolio"?1:0.45, cursor:"pointer", letterSpacing:"0.06em", boxShadow:mode==="portfolio"?"0 0 12px rgba(91,141,239,0.2)":"none", transition:"all 0.2s", whiteSpace:"nowrap" }}>
            {activePortfolio ? `● ${activePortfolio.name}` : mode==="portfolio" ? "● Portefeuille" : "○ Portefeuille"}
          </button>
          <div style={{ width:"1px", height:"16px", background:"rgba(255,255,255,0.12)", flexShrink:0 }}/>
          <button onClick={() => { setMode("asset"); setShowDropdown(true); }} style={{ padding:"5px 14px", borderRadius:"7px", border:"none", background:mode==="asset"?"rgba(255,255,255,0.12)":"transparent", color:"#F8F9FC", fontSize:"11px", fontWeight:mode==="asset"?600:400, opacity:mode==="asset"?1:0.45, cursor:"pointer", letterSpacing:"0.06em", boxShadow:mode==="asset"?"0 0 12px rgba(91,141,239,0.2)":"none", transition:"all 0.2s", whiteSpace:"nowrap" }}>
            {mode==="asset" ? "● Actif seul" : "○ Actif seul"}
          </button>
          {mode==="asset" && (
            <>
              <div style={{ width:"1px", height:"16px", background:"rgba(255,255,255,0.12)", flexShrink:0 }}/>
              <div style={{ display:"flex", alignItems:"center", gap:"6px", padding:"0 10px", width:"180px", flexShrink:0, position:"relative" }}>
                {activeAsset && !localSearch ? (() => { const tc = typeColor(TRENDING.find(a=>a.ticker===activeAsset.ticker)?.type||"EQUITY"); const label = activeAsset.ticker.replace(/-USD$/,"").replace(/\.PA$/,"").replace(/\^/,"").slice(0,4); return <div style={{ width:"28px", height:"28px", borderRadius:"6px", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", background:tc.bg, border:`1px solid ${tc.border}` }}><span style={{ fontSize:"8px", fontWeight:800, color:tc.text, letterSpacing:"-0.02em" }}>{label}</span></div>; })() : (
                <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="#F8F9FC" strokeWidth={2} style={{ opacity:0.35, flexShrink:0 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
                </svg>)}
                <input value={localSearch} onChange={e => { setLocalSearch(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder={activeAsset ? activeAsset.name : "Rechercher un actif..."}
                  style={{ background:"transparent", border:"none", outline:"none", color:"#F8F9FC", fontSize:"11px", width:"100%", opacity:localSearch?1:0.5 }}
                />
                {localSearch && <button onMouseDown={e=>e.preventDefault()} onClick={() => { setLocalSearch(""); setSearchResults([]); }} style={{ background:"transparent", border:"none", cursor:"pointer", opacity:0.4, color:"#F8F9FC", padding:0, fontSize:"11px" }}>✕</button>}
              </div>
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
              {displayAssets.map((a, i) => <AssetRow key={a.ticker} a={a} highlighted={i===0 && !!localSearch}/>)}
              {!localSearch && displayCount < filteredAssets.length && (
                <div style={{ padding:"10px", textAlign:"center", color:"rgba(255,255,255,0.2)", fontSize:"10px" }}>Scroll pour charger plus...</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Outils */}
      <div style={{ position:"fixed", top:"13px", right:"20px", zIndex:50 }}>
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
      </div>

      {/* Fermer dropdown au clic extérieur */}
      {showDropdown && <div style={{ position:"fixed", inset:0, zIndex:49 }} onClick={() => setShowDropdown(false)}/>}


    </>
  );
}
