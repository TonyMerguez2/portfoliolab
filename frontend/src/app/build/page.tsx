"use client";
import { recuperer } from "@/lib/requete";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/AppContext";
import AssetLogo from "@/components/AssetLogo";
import { TRENDING } from "@/lib/assets";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import TransactionModal, { type DraftTx } from "@/components/TransactionModal";
import { repartir, sansCours, capitalEngage, agreger } from "@/lib/transactions";
import { enTetesAuth } from "@/lib/session";
import { API_URL } from "@/lib/api";

/**
 * Construction d'un portefeuille.
 *
 * Ce fichier a été reconstruit depuis le cache de compilation de Next : le
 * fichier d'origine, non suivi par git — `.gitignore` exclut `build/` —, a été
 * détruit par un script de réécriture. La logique et la mise en forme sont
 * celles d'origine, retrouvées dans le module transpilé ; les commentaires du
 * code initial, eux, sont perdus.
 */

type Asset = { ticker: string; name: string; weight: number; type: string };
type SearchResult = { ticker: string; name: string; type: string; exchange?: string; logo?: string };
type Preset = { name: string; tag: string; assets: Asset[] };


/** Catalogue local, celui du bandeau de recherche. */
const POPULAR = TRENDING;

/** Couleurs de pastille par classe d'actif. */
const tc = (type: string) => ({
  bg: type === "CRYPTOCURRENCY" ? "rgba(245,158,11,0.16)" : type === "ETF" ? "rgba(139,92,246,0.16)" : type === "INDEX" ? "rgba(34,211,238,0.14)" : "rgba(59,130,246,0.16)",
  border: type === "CRYPTOCURRENCY" ? "rgba(245,158,11,0.35)" : type === "ETF" ? "rgba(139,92,246,0.35)" : type === "INDEX" ? "rgba(34,211,238,0.32)" : "rgba(59,130,246,0.35)",
  text: type === "CRYPTOCURRENCY" ? "#fcd34d" : type === "ETF" ? "#c4b5fd" : type === "INDEX" ? "#67e8f9" : "#93c5fd"
});

const CATEGORIES = [
    {
        id: "all",
        label: "Tous"
    },
    {
        id: "EQUITY",
        label: "Actions"
    },
    {
        id: "ETF",
        label: "Fonds"
    },
    {
        id: "INDEX",
        label: "Indices"
    },
    {
        id: "CRYPTOCURRENCY",
        label: "Crypto"
    }
];

const COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#84cc16"
  ];
  const PRESETS: Preset[] = [
  {
  name: "MSCI World",
  tag: "ETF",
  assets: [
  {
  ticker: "CW8.PA",
  name: "Amundi MSCI World",
  weight: 100,
  type: "ETF"
  }
  ]
  },
  {
  name: "S&P 500",
  tag: "ETF",
  assets: [
  {
  ticker: "SPY",
  name: "SPDR S&P 500",
  weight: 100,
  type: "ETF"
  }
  ]
  },
  {
  name: "Monde + Or + Bitcoin",
  tag: "Multi",
  assets: [
  {
  ticker: "CW8.PA",
  name: "MSCI World",
  weight: 70,
  type: "ETF"
  },
  {
  ticker: "GLD",
  name: "Gold ETF",
  weight: 20,
  type: "ETF"
  },
  {
  ticker: "BTC-USD",
  name: "Bitcoin",
  weight: 10,
  type: "CRYPTOCURRENCY"
  }
  ]
  },
  {
  name: "Tech US",
  tag: "Actions",
  assets: [
  {
  ticker: "AAPL",
  name: "Apple",
  weight: 30,
  type: "EQUITY"
  },
  {
  ticker: "MSFT",
  name: "Microsoft",
  weight: 30,
  type: "EQUITY"
  },
  {
  ticker: "NVDA",
  name: "NVIDIA",
  weight: 20,
  type: "EQUITY"
  },
  {
  ticker: "GOOGL",
  name: "Alphabet",
  weight: 20,
  type: "EQUITY"
  }
  ]
  },
  {
  name: "Monde + Bitcoin",
  tag: "Multi",
  assets: [
  {
  ticker: "CW8.PA",
  name: "MSCI World",
  weight: 80,
  type: "ETF"
  },
  {
  ticker: "BTC-USD",
  name: "Bitcoin",
  weight: 20,
  type: "CRYPTOCURRENCY"
  }
  ]
  },
  {
  name: "CAC 40 Stars",
  tag: "Actions",
  assets: [
  {
  ticker: "MC.PA",
  name: "LVMH",
  weight: 35,
  type: "EQUITY"
  },
  {
  ticker: "OR.PA",
  name: "L'Or\xe9al",
  weight: 35,
  type: "EQUITY"
  },
  {
  ticker: "TTE.PA",
  name: "TotalEnergies",
  weight: 30,
  type: "EQUITY"
  }
  ]
  }
];

export default function BuildPage() {
    const router = useRouter();
    const { setActivePortfolio } = useApp();
    /**
     * Source des positions. `null` tant que l'utilisateur n'a pas choisi entre
     * la saisie manuelle et la synchronisation avec un courtier.
     */
    const [source, setSource] = useState<"manuel" | null>(null);
    /** Actif dont on saisit une transaction, quand le panneau est ouvert. */
    const [actifSaisi, setActifSaisi] = useState<{ ticker: string; name: string; type: string } | null>(null);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [searchFocused, setSearchFocused] = useState(false);
    const [category, setCategory] = useState("all");
    const [portfolioName, setPortfolioName] = useState("");
    const [totalValue, setTotalValue] = useState("");
    const [saving, setSaving] = useState(false);
    const [showSave, setShowSave] = useState(false);
    const [presetToConfirm, setPresetToConfirm] = useState<Preset | null>(null);
    const [prices, setPrices] = useState<Record<string, { price: number; change: number }>>({});
    const [displayCount, setDisplayCount] = useState(20);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const listRef = useRef<any>(null);
    const [showToast, setShowToast] = useState(false);
    // Save modal — enriched state
    //
    // Les transactions sont la source du prix de revient. Le portefeuille n'est
    // qu'une allocation cible ; ce sont ces écritures, datées, qui disent ce qui
    // a été acheté, quand et à quel cours.
    const [lignes, setLignes] = useState<DraftTx[]>([]);
    const [panneauTx, setPanneauTx] = useState(false);
    const [ligneEditee, setLigneEditee] = useState<number | null>(null);
    const [capital, setCapital] = useState("");
    const [investDate, setInvestDate] = useState(()=>new Date().toISOString().slice(0, 10));
    const [repartition, setRepartition] = useState(false);
    const [isSimulation, setIsSimulation] = useState(false);
    const [savePhase, setSavePhase] = useState<"form" | "progress" | "tx_errors">("form");
    const [txProgress, setTxProgress] = useState<{ done: number; total: number } | null>(null);
    const [txErrors, setTxErrors] = useState<{ ticker: string; error: string }[]>([]);
    const [priceError, setPriceError] = useState<string[]>([]);
    const [savedPortId, setSavedPortId] = useState<string | null>(null);
    const [lignesEchouees, setLignesEchouees] = useState<DraftTx[]>([]);
    /** Vrai quand l'enregistrement s'arrête faute de session valide. */
    const [sessionExpiree, setSessionExpiree] = useState(false);
    const [presetHover, setPresetHover] = useState<Preset | null>(null);
    const [hoverPos, setHoverPos] = useState({
        x: 0,
        y: 0
    });
    const [isSearching, setIsSearching] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(-1);
    const [hoveredSearchTicker, setHoveredSearchTicker] = useState<string | null>(null);
    const searchRef = useRef<any>(null);
    const fetchPrices = (tickers: string[])=>{
        if (!tickers.length) return;
        recuperer("".concat(API_URL, "/api/v1/prices?tickers=").concat(encodeURIComponent(tickers.slice(0, 50).join(",")))).then((r: any)=>r.json()).then((data: any)=>{
            if (!Array.isArray(data)) return;
            const map: Record<string, { price: number; change: number }> = {};
            data.forEach((d: any)=>{
                if (d.symbol) map[d.symbol] = {
                    price: d.price,
                    change: d.change
                };
            });
            setPrices((prev: any) =>({
                    ...prev,
                    ...map
                }));
        }).catch(()=>{});
    };
    useEffect(()=>{
        fetchPrices(TRENDING.slice(0, 20).map((a: any)=>a.ticker));
    }, []);
    // Les cours des actifs détenus, sans quoi la composition se lit au prix
    // d'achat : les poids resteraient figés à la répartition du jour de
    // l'achat, alors que c'est précisément leur dérive qui intéresse.
    useEffect(()=>{
        const manquants = Array.from(new Set(lignes.map((t)=>t.ticker))).filter((t)=>!prices[t]);
        if (manquants.length) fetchPrices(manquants);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lignes]);
    useEffect(()=>{
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        let raf: number | undefined;
        let t = 0;
        const resize = ()=>{
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener("resize", resize);
        const draw = ()=>{
            t += 0.003;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "#041124";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            for(let i = 0; i < 3; i++){
                const x = canvas.width * (0.2 + i * 0.3 + Math.sin(t + i * 2) * 0.08), y = canvas.height * (0.3 + Math.cos(t * 0.7 + i) * 0.2);
                const g = ctx.createRadialGradient(x, y, 0, x, y, canvas.width * 0.4);
                g.addColorStop(0, "rgba(".concat(i === 0 ? "30,80,180" : i === 1 ? "60,20,140" : "10,60,160", ",").concat(String(0.06 + Math.sin(t + i) * 0.02), ")"));
                g.addColorStop(1, "rgba(0,0,0,0)");
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            ctx.strokeStyle = "rgba(91,141,239,0.025)";
            ctx.lineWidth = 1;
            for(let i = -20; i < 40; i++){
                const off = t * 20 % 60;
                ctx.beginPath();
                ctx.moveTo(i * 60 - canvas.height + off, 0);
                ctx.lineTo(i * 60 + off, canvas.height);
                ctx.stroke();
            }
            raf = requestAnimationFrame(draw);
        };
        draw();
        return ()=>{
            if (raf !== undefined) cancelAnimationFrame(raf);
            window.removeEventListener("resize", resize);
        };
    }, []);
    const norm = (s: string)=>s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const search = useCallback(async (q: string)=>{
        if (!q || q.length < 1) {
            setResults([]);
            setIsSearching(false);
            setHighlightIndex(-1);
            return;
        }
        const qn = norm(q);
        // Instant local match from TRENDING (handles accents + ticker prefix)
        const local = POPULAR.filter((a: any)=>norm(a.ticker).includes(qn) || norm(a.name).includes(qn));
        if (local.length > 0) {
            setResults(local);
            setHighlightIndex(-1);
            fetchPrices(local.map((r: any)=>r.ticker));
        }
        setIsSearching(true);
        try {
            const res = await recuperer("".concat(API_URL, "/api/v1/search?q=").concat(encodeURIComponent(q)));
            const data = await res.json();
            const api = data.results || [];
            // Merge: API first, then local not already present
            const seen = new Set(api.map((r: any)=>r.ticker));
            const merged = [
                ...api,
                ...local.filter((l: any)=>!seen.has(l.ticker))
            ].slice(0, 10);
            setResults(merged);
            setHighlightIndex(-1);
            fetchPrices(merged.map((r: any)=>r.ticker));
        } catch (e) {
            if (local.length === 0) setResults([]);
        } finally{
            setIsSearching(false);
        }
    }, []);
    useEffect(()=>{
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(()=>search(query), 300) as unknown as undefined;
    }, [
        query,
        search
    ]);
    // La composition n'est plus saisie : elle se déduit des écritures. Un poids
    // réglé au curseur décrit une intention, une quantité décrit une détention ;
    // les deux divergent dès la première séance, et c'est la seconde qui est vraie.
    const composition = useMemo(()=>agreger(lignes, prices), [lignes, prices]);
    const assets: Asset[] = useMemo(
        ()=>composition.map((l)=>({ ticker: l.ticker, name: l.name, weight: l.weight, type: l.type })),
        [composition]);
    const displayList = query ? results : POPULAR;
    const filtered = displayList.filter((r: any)=>category === "all" || r.type === category);
    const displayed = filtered.slice(0, displayCount);
    useEffect(()=>{
        setDisplayCount(20);
    }, [
        category,
        query
    ]);
    useEffect(()=>{
        if (!searchFocused) return;
        fetchPrices(filtered.slice(0, displayCount).map((r: any)=>r.ticker));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        searchFocused,
        category,
        displayCount
    ]);
    const handleListScroll = (e: any) =>{
        const el = e.currentTarget;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) {
            const newCount = Math.min(displayCount + 20, filtered.length);
            const newItems = filtered.slice(displayCount, newCount);
            if (newItems.length > 0) fetchPrices(newItems.map((r: any)=>r.ticker));
            setDisplayCount(newCount);
        }
    };
    useEffect(()=>{
        const h = (e: any) =>{
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                var _searchRef_current;
                e.preventDefault();
                (_searchRef_current = searchRef.current) === null || _searchRef_current === void 0 ? void 0 : _searchRef_current.focus();
                setSearchFocused(true);
            }
        };
        document.addEventListener("keydown", h);
        return ()=>document.removeEventListener("keydown", h);
    }, []);
    useEffect(()=>{
        if (highlightIndex < 0 || !listRef.current) return;
        const el = listRef.current.querySelector('[data-idx="'.concat(String(highlightIndex), '"]'));
        el === null || el === void 0 ? void 0 : el.scrollIntoView({
            block: "nearest"
        });
    }, [
        highlightIndex
    ]);
    const handleKeyDown = (e: any) =>{
        if (!searchFocused) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightIndex((i: any) =>Math.min(i + 1, displayed.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightIndex((i: any) =>Math.max(i - 1, -1));
        } else if (e.key === "Enter") {
            e.preventDefault();
            const r = displayed[highlightIndex];
            if (r) {
                addAssetDirect(r);
                setHighlightIndex(-1);
            }
        } else if (e.key === "Escape") {
            var _searchRef_current;
            setSearchFocused(false);
            setHighlightIndex(-1);
            (_searchRef_current = searchRef.current) === null || _searchRef_current === void 0 ? void 0 : _searchRef_current.blur();
        }
    };
    /**
     * Choisir un actif ouvre la saisie d'une transaction.
     *
     * La recherche ajoutait auparavant une ligne d'allocation avec un poids, et
     * les écritures n'arrivaient qu'au moment d'enregistrer. Un actif « dans le
     * portefeuille » sans quantité ni date ne décrit rien : ni ce qui est
     * détenu, ni à quel prix il a été acheté.
     */
    const addAssetDirect = (r: any) =>{
        setActifSaisi({
            ticker: r.ticker,
            name: r.name,
            type: r.type || "EQUITY"
        });
        setLigneEditee(null);
        setPanneauTx(true);
        setQuery("");
        setHighlightIndex(-1);
    };
    const addAsset = addAssetDirect;
    /** Retirer un actif retire les écritures qui le concernent. */
    const removeAsset = (ticker: any) =>setLignes((prev)=>prev.filter((t)=>t.ticker !== ticker));
    const closeSaveModal = ()=>{
        setShowSave(false);
        setSavePhase("form");
        setPriceError([]);
        setTxErrors([]);
        setTxProgress(null);
        setPanneauTx(false);
        setLigneEditee(null);
    };
    const openSaveModal = ()=>{
        if (assets.length === 0) return;
        setSavePhase("form");
        setPriceError([]);
        setTxErrors([]);
        setTxProgress(null);
        setSavedPortId(null);
        setPanneauTx(false);
        setLigneEditee(null);
        fetchPrices(assets.map((a: any)=>a.ticker));
        setShowSave(true);
    };
    /**
     * Matérialise un modèle en transactions datées.
     *
     * Un modèle ne porte que des poids ; il lui manque un capital et une date
     * pour devenir des écritures. Le cours retenu est celui de cette date-là,
     * pas celui d'aujourd'hui : dater un achat de mars en le valorisant au
     * cours d'août fausse le prix de revient sans que rien ne le signale. Les
     * lignes produites restent modifiables une par une.
     */
    const appliquerPreset = async (preset: Preset)=>{
        const montant = parseFloat(capital.replace(/\s/g, "").replace(",", "."));
        if (!montant || montant <= 0 || preset.assets.length === 0) return;
        setRepartition(true);
        setPriceError([]);
        try {
            const tickers = preset.assets.map((a)=>a.ticker).join(",");
            const res = await recuperer("".concat(API_URL, "/api/v1/price-at?tickers=").concat(encodeURIComponent(tickers), "&date=").concat(investDate));
            const cours: Record<string, number> = await res.json();
            const manquants = sansCours(preset.assets, cours);
            if (manquants.length > 0) {
                setPriceError(manquants);
                return;
            }
            setLignes(repartir(preset.assets, cours, montant, investDate));
            setPresetToConfirm(null);
            setCapital("");
        } catch (e) {
            setPriceError(preset.assets.map((a)=>a.ticker));
        } finally{
            setRepartition(false);
        }
    };
    /** Envoie les écritures saisies. Retient celles qui ont échoué. */
    const envoyerLignes = async (portfolioId: string, aEnvoyer: DraftTx[])=>{
        const token = typeof window !== "undefined" ? localStorage.getItem("novac_token") : null;
        const errors: { ticker: string; error: string }[] = [];
        // Les échecs sont repérés par rang, pas par ticker : un même actif peut
        // porter plusieurs écritures, et rejouer celles qui sont déjà passées
        // les créerait en double.
        const echouees: DraftTx[] = [];
        setSavePhase("progress");
        setTxProgress({
            done: 0,
            total: aEnvoyer.length
        });
        for (const tx of aEnvoyer){
            try {
                const res = await recuperer("".concat(API_URL, "/api/v1/portfolios/").concat(portfolioId, "/transactions"), {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...token ? {
                            Authorization: "Bearer ".concat(token)
                        } : {}
                    },
                    body: JSON.stringify({
                        ticker: tx.ticker,
                        asset_type: tx.asset_type,
                        side: tx.side,
                        quantity: tx.quantity,
                        unit_price: tx.unit_price,
                        fees: tx.fees,
                        executed_at: tx.executed_at,
                        note: tx.note ?? null
                    })
                });
                if (!res.ok) {
                    const err = await res.json().catch(()=>({}));
                    errors.push({
                        ticker: tx.ticker,
                        error: res.status === 401
                            ? "Session expirée — reconnectez-vous"
                            : err.detail || "Erreur ".concat(String(res.status))
                    });
                    echouees.push(tx);
                }
            } catch (e) {
                errors.push({
                    ticker: tx.ticker,
                    error: "Erreur r\xe9seau"
                });
                echouees.push(tx);
            }
            setTxProgress((prev: any) =>prev ? {
                    ...prev,
                    done: prev.done + 1
                } : null);
        }
        setTxErrors(errors);
        if (errors.length > 0) {
            setSavePhase("tx_errors");
            setLignesEchouees(echouees);
        } else {
            setShowSave(false);
            setPortfolioName("");
            setLignes([]);
            setCapital("");
            setSavePhase("form");
            setTxProgress(null);
            setShowToast(true);
            setTimeout(()=>{
                setShowToast(false);
                router.push("/portfolio");
            }, 2200);
        }
    };
    const savePortfolio = async ()=>{
        if (!portfolioName.trim() || assets.length === 0) return;
        if (!isSimulation && lignes.length === 0) return;

        // Vérifier la session avant de créer quoi que ce soit.
        //
        // La création d'un portefeuille ne demande pas de jeton, l'écriture des
        // transactions si. Enchaîner les deux sans contrôle laissait un
        // portefeuille vide derrière chaque échec d'authentification, et il
        // fallait le découvrir au dernier écran.
        if (!isSimulation) {
            const token = typeof window !== "undefined" ? localStorage.getItem("novac_token") : null;
            if (!token) {
                setSessionExpiree(true);
                return;
            }
            try {
                const contr = await recuperer("".concat(API_URL, "/api/v1/auth/me"), {
                    headers: { Authorization: "Bearer ".concat(token) }
                });
                if (!contr.ok) {
                    setSessionExpiree(true);
                    return;
                }
            } catch (e) {
                // Backend injoignable : on laisse la suite échouer et le dire.
            }
        }

        setSaving(true);
        setPriceError([]);
        setSessionExpiree(false);
        try {
            // Le capital réellement engagé se lit sur les écritures, pas sur une
            // saisie séparée : les deux finiraient par diverger.
            const investi = capitalEngage(lignes);
            const pRes2 = await recuperer("".concat(API_URL, "/api/v1/portfolios"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...enTetesAuth()
                },
                body: JSON.stringify({
                    name: portfolioName.trim(),
                    assets: assets.map((a: any)=>({
                            ticker: a.ticker,
                            weight: a.weight
                        })),
                    color: "#5B8DEF",
                    total_value: !isSimulation ? investi : totalValue ? parseFloat(totalValue.replace(/\s/g, "").replace(",", ".")) : null,
                    is_simulation: isSimulation
                })
            });
            const portfolio = await pRes2.json();
            const portfolioId = portfolio.id;
            setSavedPortId(portfolioId);

            setActivePortfolio({
                id: portfolioId,
                name: portfolioName.trim(),
                assets,
                color: "#5B8DEF"
            });
            if (isSimulation) {
                setShowSave(false);
                setPortfolioName("");
                setSavePhase("form");
                setShowToast(true);
                setTimeout(()=>{
                    setShowToast(false);
                    router.push("/");
                }, 2200);
            } else {
                await envoyerLignes(portfolioId, lignes);
            }
        } finally{
            setSaving(false);
        }
    };
    const summary = {
        equity: assets.filter((a: any)=>a.type === "EQUITY").reduce((s: any, a: any)=>s + a.weight, 0),
        etf: assets.filter((a: any)=>a.type === "ETF").reduce((s: any, a: any)=>s + a.weight, 0),
        crypto: assets.filter((a: any)=>a.type === "CRYPTOCURRENCY").reduce((s: any, a: any)=>s + a.weight, 0),
        index: assets.filter((a: any)=>a.type === "INDEX").reduce((s: any, a: any)=>s + a.weight, 0)
    };
    const glass: React.CSSProperties = {
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.1)",
        backdropFilter: "blur(20px)"
    };
    return <div style={{
            minHeight: "100vh",
            background: "#041124",
            color: "#F8F9FC",
            fontFamily: "-apple-system,BlinkMacSystemFont,sans-serif",
            position: "relative"
        }}>
  <canvas ref={canvasRef} style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 0,
                    pointerEvents: "none"
                }} />
  <div style={{
                    position: "relative",
                    zIndex: 1,
                    maxWidth: "1200px",
                    margin: "0 auto",
                    padding: "80px 32px 40px"
                }}>
    <div style={{
                            textAlign: "center",
                            marginBottom: "32px"
                        }}>
      <div style={{
                                    color: "rgba(255,255,255,0.2)",
                                    fontSize: "9px",
                                    letterSpacing: "0.25em",
                                    marginBottom: "8px"
                                }}>
        NOVAC — CONSTRUCTION
      </div>
      <h1 style={{
                                    fontSize: "28px",
                                    fontWeight: 200,
                                    letterSpacing: "0.08em",
                                    margin: "0 0 6px",
                                    color: "#F8F9FC"
                                }}>
        Créer un portefeuille
      </h1>
      <p style={{
                                    color: "rgba(255,255,255,0.25)",
                                    fontSize: "11px",
                                    letterSpacing: "0.04em",
                                    margin: 0
                                }}>
        {source === null
          ? "D'où viennent vos positions ?"
          : "Ajoutez vos transactions, la composition en découle"}
      </p>
    </div>
    {/* ── Choix de la source ───────────────────────────────────────────────
        Deux façons d'alimenter un portefeuille. La synchronisation avec un
        courtier viendra ; en attendant, elle est annoncée mais inactive —
        mieux vaut un bouton grisé qu'une promesse absente. */}
    {source === null && <div style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "16px",
                            maxWidth: "760px",
                            margin: "0 auto"
                        }}>
      <button onClick={()=>setSource("manuel")} style={{
                            ...glass,
                            borderRadius: "14px",
                            padding: "28px 24px",
                            textAlign: "left",
                            cursor: "pointer",
                            color: "inherit",
                            fontFamily: "inherit",
                            transition: "all 0.15s"
                        }}
        onMouseEnter={(e: any)=>{ e.currentTarget.style.background = "rgba(91,141,239,0.10)"; e.currentTarget.style.borderColor = "rgba(91,141,239,0.35)"; }}
        onMouseLeave={(e: any)=>{ e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}>
        <div style={{ fontSize: "22px", marginBottom: "12px" }}>✎</div>
        <div style={{ fontSize: "14px", fontWeight: 500, color: "#F8F9FC", marginBottom: "6px" }}>
          Ajouter des transactions manuellement
        </div>
        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.32)", lineHeight: 1.6 }}>
          Cherchez un actif, indiquez ce que vous avez acheté et quand. Le prix de
          revient et la répartition se calculent à partir de là.
        </div>
      </button>
      <div aria-label="Bientôt disponible" style={{
                            ...glass,
                            borderRadius: "14px",
                            padding: "28px 24px",
                            opacity: 0.42,
                            cursor: "not-allowed",
                            position: "relative"
                        }}>
        <div style={{ fontSize: "22px", marginBottom: "12px" }}>⇄</div>
        <div style={{ fontSize: "14px", fontWeight: 500, color: "#F8F9FC", marginBottom: "6px" }}>
          Connecter un portefeuille
        </div>
        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.32)", lineHeight: 1.6 }}>
          Trade Republic, Binance, Coinbase… Vos positions et votre historique
          importés automatiquement.
        </div>
        <span style={{
            position: "absolute", top: "18px", right: "18px",
            fontSize: "8px", letterSpacing: "0.14em", fontWeight: 700,
            color: "#9BB9FF", background: "rgba(91,141,239,0.16)",
            border: "1px solid rgba(91,141,239,0.30)", borderRadius: "5px", padding: "3px 7px"
        }}>
          BIENTÔT
        </span>
      </div>
    </div>}
    {source === "manuel" && <div style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 300px",
                            gap: "24px",
                            alignItems: "start"
                        }}>
      <div style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "16px"
                                }}>
        <div style={{
                                            ...glass,
                                            borderRadius: "10px",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "8px",
                                            padding: "0 14px",
                                            height: "44px"
                                        }}>
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="#F8F9FC" strokeWidth={2} style={{
                                                    opacity: isSearching ? 0.6 : 0.3,
                                                    flexShrink: 0,
                                                    transition: "opacity 0.2s"
                                                }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input ref={searchRef} value={query} onChange={(e: any)=>{
                                                    setQuery(e.target.value);
                                                    setSearchFocused(true);
                                                    setHighlightIndex(-1);
                                                }} onFocus={()=>setSearchFocused(true)} onBlur={()=>setTimeout(()=>{
                                                        setSearchFocused(false);
                                                        setHighlightIndex(-1);
                                                    }, 150)} onKeyDown={handleKeyDown} placeholder="Rechercher un actif, ETF, crypto, indice..." style={{
                                                    background: "transparent",
                                                    border: "none",
                                                    outline: "none",
                                                    color: "#F8F9FC",
                                                    fontSize: "11px",
                                                    width: "100%",
                                                    opacity: query ? 1 : 0.5
                                                }} />
          <span style={{
                                                    color: "rgba(255,255,255,0.18)",
                                                    fontSize: "9px",
                                                    letterSpacing: "0.05em",
                                                    flexShrink: 0,
                                                    border: "1px solid rgba(255,255,255,0.1)",
                                                    borderRadius: "4px",
                                                    padding: "1px 5px"
                                                }}>
            ⌘K
          </span>
          {isSearching ? <span style={{
                                                    color: "rgba(91,141,239,0.7)",
                                                    fontSize: "10px",
                                                    flexShrink: 0
                                                }}>
  ···
</span> : query && <button onClick={()=>{
                                                    setQuery("");
                                                    setResults([]);
                                                    setHighlightIndex(-1);
                                                }} style={{
                                                    background: "transparent",
                                                    border: "none",
                                                    cursor: "pointer",
                                                    opacity: 0.4,
                                                    color: "#F8F9FC",
                                                    padding: 0,
                                                    fontSize: "13px"
                                                }}>
  ✕
</button>}
        </div>
        {searchFocused && <div onMouseDown={(e: any)=>e.preventDefault()} style={{
                                            background: "rgba(4,17,36,0.97)",
                                            border: "1px solid rgba(255,255,255,0.1)",
                                            borderRadius: "12px",
                                            overflow: "hidden",
                                            boxShadow: "0 16px 48px rgba(0,0,0,0.5)"
                                        }}>
  <div style={{
                                                    display: "flex",
                                                    gap: "2px",
                                                    padding: "8px 8px 6px",
                                                    borderBottom: "1px solid rgba(255,255,255,0.06)"
                                                }}>
    {CATEGORIES.map((cat: any) =><button key={cat.id} onClick={()=>setCategory(cat.id)} style={{
                                                            padding: "3px 10px",
                                                            borderRadius: "6px",
                                                            border: "none",
                                                            fontSize: "10px",
                                                            background: category === cat.id ? "rgba(91,141,239,0.2)" : "transparent",
                                                            color: category === cat.id ? "#9BB9FF" : "rgba(255,255,255,0.4)",
                                                            cursor: "pointer",
                                                            fontWeight: category === cat.id ? 600 : 400,
                                                            letterSpacing: "0.04em"
                                                        }}>
  {cat.label}
</button>)}
  </div>
  <div ref={listRef} onScroll={handleListScroll} style={{
                                                    maxHeight: "320px",
                                                    overflowY: "auto"
                                                }}>
    {!query && <div style={{
                                                            padding: "3px 12px 2px",
                                                            color: "rgba(255,255,255,0.2)",
                                                            fontSize: "9px",
                                                            letterSpacing: "0.12em"
                                                        }}>
  POPULAIRES
</div>}
    {displayed.map((r: any, i: any) =>{
                                                        const c = tc(r.type);
                                                        const highlighted = i === 0 && !!query;
                                                        const focused = i === highlightIndex;
                                                        const alreadyAdded = !!assets.find((a: any)=>a.ticker === r.ticker);
                                                        const p = prices[r.ticker];
                                                        const label = r.ticker.replace(/-USD$/, "").replace(/\.PA$/, "").replace(/\^/, "").slice(0, 4);
                                                        const isHovered = hoveredSearchTicker === r.ticker;
                                                        return <div key={r.ticker} data-idx={i} style={{
                                                                display: "flex",
                                                                alignItems: "center",
                                                                gap: "10px",
                                                                width: "100%",
                                                                padding: "8px 12px",
                                                                background: focused ? "rgba(91,141,239,0.12)" : isHovered && !alreadyAdded ? "rgba(255,255,255,0.05)" : "transparent",
                                                                borderLeft: focused ? "2px solid rgba(91,141,239,0.6)" : "2px solid transparent",
                                                                cursor: alreadyAdded ? "default" : "pointer",
                                                                borderBottom: "1px solid rgba(255,255,255,0.04)",
                                                                opacity: alreadyAdded ? 0.5 : 1,
                                                                boxSizing: "border-box"
                                                            }} onClick={()=>{
                                                                if (!alreadyAdded) addAsset(r);
                                                            }} onMouseEnter={()=>setHoveredSearchTicker(r.ticker)} onMouseLeave={()=>setHoveredSearchTicker(null)}>
  <AssetLogo ticker={r.ticker} type={r.type} size={28} radius={6} fallbackBg={highlighted ? "".concat(c.text, "22") : c.bg} fallbackBorder={highlighted ? c.text : c.border} fallbackTextColor={c.text} style={{
                                                                        border: "1px solid ".concat(highlighted ? c.text : c.border),
                                                                        boxShadow: highlighted ? "0 0 8px ".concat(c.text, "55") : "none",
                                                                        background: highlighted ? "".concat(c.text, "11") : "rgba(255,255,255,0.06)"
                                                                    }} />
  <span style={{
                                                                        color: "#F8F9FC",
                                                                        fontSize: "11px",
                                                                        fontWeight: 500,
                                                                        flex: 1,
                                                                        textAlign: "left"
                                                                    }}>
    {r.name}
  </span>
  <div style={{
                                                                        display: "flex",
                                                                        alignItems: "center",
                                                                        gap: "6px",
                                                                        flexShrink: 0
                                                                    }}>
    {isHovered && <button onClick={(e: any)=>{
                                                                                e.stopPropagation();
                                                                                router.push("/chart?ticker=".concat(encodeURIComponent(r.ticker)));
                                                                            }} style={{
                                                                                background: "rgba(91,141,239,0.15)",
                                                                                border: "1px solid rgba(91,141,239,0.3)",
                                                                                borderRadius: "5px",
                                                                                color: "#9BB9FF",
                                                                                fontSize: "10px",
                                                                                padding: "2px 8px",
                                                                                cursor: "pointer",
                                                                                whiteSpace: "nowrap",
                                                                                letterSpacing: "0.03em"
                                                                            }}>
  Graphique
</button>}
    {p && <div style={{
                                                                                display: "flex",
                                                                                flexDirection: "column",
                                                                                alignItems: "flex-end",
                                                                                gap: "1px"
                                                                            }}>
  <span style={{
                                                                                        color: "#F8F9FC",
                                                                                        fontSize: "10px",
                                                                                        opacity: 0.6
                                                                                    }}>
    $
    {p.price.toLocaleString("en-US", {
                                                                                            minimumFractionDigits: 2,
                                                                                            maximumFractionDigits: 2
                                                                                        })}
  </span>
  <span style={{
                                                                                        fontSize: "10px",
                                                                                        fontWeight: 600,
                                                                                        color: p.change >= 0 ? "#22c55e" : "#ef4444"
                                                                                    }}>
    {p.change >= 0 ? "▲" : "▼"}
     
    {Math.abs(p.change).toFixed(2)}
    %
  </span>
</div>}
    {alreadyAdded ? <span style={{
                                                                                color: "rgba(255,255,255,0.2)",
                                                                                fontSize: "10px"
                                                                            }}>
  ✓
</span> : <span style={{
                                                                                color: "rgba(91,141,239,0.7)",
                                                                                fontSize: "10px",
                                                                                background: "rgba(91,141,239,0.08)",
                                                                                padding: "2px 7px",
                                                                                borderRadius: "4px",
                                                                                border: "1px solid rgba(91,141,239,0.15)"
                                                                            }}>
  + Ajouter
</span>}
  </div>
</div>;
                                                    })}
    {!query && displayCount < filtered.length && <div style={{
                                                            padding: "10px",
                                                            textAlign: "center",
                                                            color: "rgba(255,255,255,0.2)",
                                                            fontSize: "10px"
                                                        }}>
  Scroll pour charger plus...
</div>}
  </div>
</div>}
        <div>
          <div style={{
                                                    color: "rgba(255,255,255,0.2)",
                                                    fontSize: "9px",
                                                    letterSpacing: "0.18em",
                                                    marginBottom: "10px"
                                                }}>
            MODÈLES PRÉDÉFINIS
          </div>
          <div style={{
                                                    display: "flex",
                                                    flexWrap: "wrap",
                                                    gap: "8px"
                                                }}>
            {PRESETS.map((p: any)=><button key={p.name} onClick={()=>{
                                                            // Un modèle ne décrit qu'une répartition : il lui manque
                                                            // un capital et une date pour devenir des écritures.
                                                            setPresetToConfirm(p);
                                                        }} style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: "8px",
                                                            padding: "7px 13px",
                                                            borderRadius: "8px",
                                                            background: "rgba(255,255,255,0.04)",
                                                            border: "1px solid rgba(255,255,255,0.08)",
                                                            color: "rgba(255,255,255,0.6)",
                                                            fontSize: "11px",
                                                            cursor: "pointer",
                                                            transition: "all 0.15s",
                                                            position: "relative"
                                                        }} onMouseEnter={(e: any)=>{
                                                            const r = e.currentTarget.getBoundingClientRect();
                                                            setHoverPos({
                                                                x: r.left,
                                                                y: r.top - 8
                                                            });
                                                            setPresetHover(p);
                                                            e.currentTarget.style.background = "rgba(91,141,239,0.1)";
                                                            e.currentTarget.style.borderColor = "rgba(91,141,239,0.25)";
                                                            e.currentTarget.style.color = "#9BB9FF";
                                                        }} onMouseLeave={(e: any)=>{
                                                            setPresetHover(null);
                                                            e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                                                            e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                                                            e.currentTarget.style.color = "rgba(255,255,255,0.6)";
                                                        }}>
  <span style={{
                                                                    fontSize: "9px",
                                                                    color: "rgba(255,255,255,0.25)",
                                                                    background: "rgba(255,255,255,0.05)",
                                                                    padding: "1px 6px",
                                                                    borderRadius: "3px",
                                                                    letterSpacing: "0.06em"
                                                                }}>
    {p.tag}
  </span>
  {p.name}
</button>)}
          </div>
        </div>
        {assets.length > 0 && <div style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: "10px"
                                        }}>
  <div>
    <div style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "space-between"
                                                        }}>
      <div style={{
                                                                    display: "flex",
                                                                    alignItems: "center",
                                                                    gap: "10px"
                                                                }}>
        <span style={{
                                                                            color: "rgba(255,255,255,0.3)",
                                                                            fontSize: "9px",
                                                                            letterSpacing: "0.15em"
                                                                        }}>
          COMPOSITION
        </span>
        <span style={{
                                                                            background: "rgba(91,141,239,0.12)",
                                                                            border: "1px solid rgba(91,141,239,0.2)",
                                                                            color: "#9BB9FF",
                                                                            fontSize: "9px",
                                                                            fontWeight: 600,
                                                                            padding: "2px 7px",
                                                                            borderRadius: "10px"
                                                                        }}>
          {assets.length}
           actifs
        </span>
      </div>
      {/* Le total des poids et « Équilibrer » n'ont plus d'objet : les poids
          se déduisent des quantités, ils somment donc à 100 par construction.
          On montre à la place le capital réellement engagé. */}
      <span style={{ color: "rgba(255,255,255,0.45)", fontSize: "11px", fontWeight: 500 }}>
        {capitalEngage(lignes).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} € investis
      </span>
    </div>
  </div>
  <div style={{
                                                    ...glass,
                                                    borderRadius: "10px",
                                                    overflow: "hidden"
                                                }}>
    {assets.map((a: any, i: any) =>{
                                                    const c = tc(a.type);
                                                    return <div key={a.ticker} style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: "12px",
                                                            padding: "10px 14px",
                                                            borderBottom: "1px solid rgba(255,255,255,0.04)"
                                                        }}>
  <AssetLogo ticker={a.ticker} type={a.type} size={28} radius={6} fallbackBg={c.bg} fallbackBorder={c.border} fallbackTextColor={c.text} style={{
                                                                    boxShadow: "0 0 8px ".concat(c.text, "33")
                                                                }} />
  <div style={{
                                                                    flex: 1,
                                                                    minWidth: 0
                                                                }}>
    <div style={{
                                                                            color: "#F8F9FC",
                                                                            fontSize: "12px",
                                                                            fontWeight: 500,
                                                                            overflow: "hidden",
                                                                            textOverflow: "ellipsis",
                                                                            whiteSpace: "nowrap"
                                                                        }}>
      {a.name}
    </div>
    <div style={{
                                                                            color: "rgba(255,255,255,0.2)",
                                                                            fontSize: "10px",
                                                                            marginTop: "1px"
                                                                        }}>
      {a.ticker}
    </div>
  </div>
  {/* Ce que les écritures disent de cette ligne. Le poids se lit, il ne se
      règle plus : le modifier reviendrait à réécrire l'histoire des achats. */}
  <div style={{ textAlign: "right", flexShrink: 0, minWidth: 130 }}>
    <div style={{ color: "#F8F9FC", fontSize: "12px", fontWeight: 500 }}>
      {(composition[i].value ?? composition[i].invested).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €
    </div>
    <div style={{ color: "rgba(255,255,255,0.28)", fontSize: "10px", marginTop: "1px" }}>
      {composition[i].quantity.toLocaleString("fr-FR", { maximumFractionDigits: 6 })}
      {" × "}
      {composition[i].avgCost.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €
    </div>
  </div>
  <div style={{ width: 46, textAlign: "right", flexShrink: 0,
                color: COLORS[i % COLORS.length], fontSize: "11px", fontWeight: 600 }}>
    {composition[i].weight.toFixed(1)}%
  </div>
  <button onClick={()=>{ setActifSaisi({ ticker: a.ticker, name: a.name, type: a.type }); setLigneEditee(null); setPanneauTx(true); }}
    aria-label="Ajouter une transaction sur cet actif"
    style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.28)",
             cursor: "pointer", fontSize: "15px", lineHeight: 1, flexShrink: 0, padding: "0 2px" }}
    onMouseEnter={(e: any)=>e.currentTarget.style.color = "#9BB9FF"}
    onMouseLeave={(e: any)=>e.currentTarget.style.color = "rgba(255,255,255,0.28)"}>
    +
  </button>
  <button onClick={()=>removeAsset(a.ticker)} style={{
                                                                    background: "transparent",
                                                                    border: "none",
                                                                    color: "rgba(255,255,255,0.18)",
                                                                    cursor: "pointer",
                                                                    fontSize: "17px",
                                                                    lineHeight: 1,
                                                                    flexShrink: 0,
                                                                    padding: "0 2px"
                                                                }} onMouseEnter={(e: any)=>e.currentTarget.style.color = "#ef4444"} onMouseLeave={(e: any)=>e.currentTarget.style.color = "rgba(255,255,255,0.18)"}>
    ×
  </button>
</div>;
                                                })}
  </div>
  {(summary.equity > 0 || summary.etf > 0 || summary.crypto > 0 || summary.index > 0) && <div style={{
                                                    display: "flex",
                                                    gap: "8px"
                                                }}>
  {[
                                                    {
                                                        label: "Actions",
                                                        val: summary.equity,
                                                        color: "#93c5fd"
                                                    },
                                                    {
                                                        label: "ETF",
                                                        val: summary.etf,
                                                        color: "#c4b5fd"
                                                    },
                                                    {
                                                        label: "Crypto",
                                                        val: summary.crypto,
                                                        color: "#fcd34d"
                                                    },
                                                    {
                                                        label: "Indices",
                                                        val: summary.index,
                                                        color: "#67e8f9"
                                                    }
                                                ].filter((x: any)=>x.val > 0).map((x: any)=><div key={x.label} style={{
                                                            ...glass,
                                                            borderRadius: "7px",
                                                            padding: "8px 12px",
                                                            flex: 1
                                                        }}>
  <div style={{
                                                                    color: "rgba(255,255,255,0.3)",
                                                                    fontSize: "8px",
                                                                    letterSpacing: "0.12em",
                                                                    marginBottom: "3px"
                                                                }}>
    {x.label.toUpperCase()}
  </div>
  <div style={{
                                                                    color: x.color,
                                                                    fontSize: "16px",
                                                                    fontWeight: 600
                                                                }}>
    {x.val.toFixed(0)}
    %
  </div>
</div>)}
</div>}
</div>}
      </div>
      <div style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "12px",
                                    position: "sticky",
                                    top: "80px"
                                }}>
        <div style={{
                                            ...glass,
                                            borderRadius: "12px",
                                            padding: "18px"
                                        }}>
          <div style={{
                                                    color: "rgba(255,255,255,0.3)",
                                                    fontSize: "9px",
                                                    letterSpacing: "0.15em",
                                                    marginBottom: "14px"
                                                }}>
            RÉPARTITION
          </div>
          {assets.length === 0 ? <div style={{
                                                    height: "160px",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center"
                                                }}>
  <div style={{
                                                        color: "rgba(255,255,255,0.1)",
                                                        fontSize: "11px",
                                                        letterSpacing: "0.05em"
                                                    }}>
    Aucun actif
  </div>
</div> : <>
  <ResponsiveContainer width="100%" height={160}>
    <PieChart>
      <Pie data={assets} dataKey="weight" nameKey="ticker" cx="50%" cy="50%" innerRadius={44} outerRadius={68} strokeWidth={0}>
        {assets.map((_: any, i: any) =><Cell key={i} fill={COLORS[i % COLORS.length]} />)}
      </Pie>
      <Tooltip contentStyle={{
                                                                        background: "rgba(4,17,36,0.97)",
                                                                        border: "1px solid rgba(255,255,255,0.1)",
                                                                        borderRadius: "8px",
                                                                        color: "#F8F9FC",
                                                                        fontSize: "11px"
                                                                    }} formatter={(v: any)=>[
                                                                            "".concat(v, "%")
                                                                        ]} />
    </PieChart>
  </ResponsiveContainer>
  <div style={{
                                                            display: "flex",
                                                            flexDirection: "column",
                                                            gap: "5px",
                                                            marginTop: "10px"
                                                        }}>
    {assets.map((a: any, i: any) =><div key={a.ticker} style={{
                                                                    display: "flex",
                                                                    alignItems: "center",
                                                                    gap: "7px"
                                                                }}>
  <div style={{
                                                                            width: "6px",
                                                                            height: "6px",
                                                                            borderRadius: "2px",
                                                                            background: COLORS[i % COLORS.length],
                                                                            flexShrink: 0
                                                                        }} />
  <span style={{
                                                                            color: "rgba(255,255,255,0.45)",
                                                                            fontSize: "10px",
                                                                            flex: 1
                                                                        }}>
    {a.ticker.replace(/-USD$/, "")}
  </span>
  <span style={{
                                                                            color: "#F8F9FC",
                                                                            fontSize: "10px",
                                                                            fontWeight: 600
                                                                        }}>
    {/* Un poids déduit est un réel, pas l'entier que réglait le curseur. */}
    {a.weight.toFixed(1)}
    %
  </span>
</div>)}
  </div>
</>}
        </div>
        <button onClick={openSaveModal} disabled={assets.length === 0} style={{
                                            padding: "13px",
                                            borderRadius: "9px",
                                            background: assets.length > 0 ? "rgba(91,141,239,0.16)" : "rgba(255,255,255,0.02)",
                                            border: assets.length > 0 ? "1px solid rgba(91,141,239,0.3)" : "1px solid rgba(255,255,255,0.06)",
                                            color: assets.length > 0 ? "#9BB9FF" : "rgba(255,255,255,0.2)",
                                            fontSize: "10px",
                                            fontWeight: 500,
                                            cursor: assets.length > 0 ? "pointer" : "not-allowed",
                                            letterSpacing: "0.1em",
                                            transition: "all 0.2s"
                                        }}>
          {lignes.length === 0 ? "AUCUNE TRANSACTION" : "SAUVEGARDER →"}
        </button>
        <button onClick={()=>router.push("/")} style={{
                                            padding: "9px",
                                            borderRadius: "9px",
                                            background: "transparent",
                                            border: "1px solid rgba(255,255,255,0.06)",
                                            color: "rgba(255,255,255,0.25)",
                                            fontSize: "9px",
                                            cursor: "pointer",
                                            letterSpacing: "0.1em"
                                        }}>
          ← RETOUR
        </button>
      </div>
    </div>}
  </div>
  {presetHover && <div style={{
                    position: "fixed",
                    left: hoverPos.x,
                    top: hoverPos.y,
                    transform: "translateY(-100%)",
                    zIndex: 200,
                    background: "rgba(4,17,36,0.97)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "10px",
                    padding: "12px 14px",
                    minWidth: "190px",
                    pointerEvents: "none",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.5)"
                }}>
  <div style={{
                            color: "rgba(255,255,255,0.3)",
                            fontSize: "9px",
                            letterSpacing: "0.12em",
                            marginBottom: "10px"
                        }}>
    COMPOSITION
  </div>
  {presetHover.assets.map((a: any, i: any) =><div key={a.ticker} style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: "7px"
                            }}>
  <div style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "7px"
                                    }}>
    <div style={{
                                                width: "6px",
                                                height: "6px",
                                                borderRadius: "2px",
                                                background: COLORS[i % COLORS.length],
                                                flexShrink: 0
                                            }} />
    <span style={{
                                                color: "rgba(255,255,255,0.65)",
                                                fontSize: "10px"
                                            }}>
      {a.name}
    </span>
  </div>
  <span style={{
                                        color: COLORS[i % COLORS.length],
                                        fontSize: "11px",
                                        fontWeight: 700
                                    }}>
    {a.weight}
    %
  </span>
</div>)}
</div>}
  {showToast && <div style={{
                    position: "fixed",
                    bottom: "32px",
                    right: "32px",
                    zIndex: 200,
                    background: "rgba(34,197,94,0.13)",
                    border: "1px solid rgba(34,197,94,0.32)",
                    borderRadius: "12px",
                    padding: "14px 18px",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    backdropFilter: "blur(20px)",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.4)"
                }}>
  <div style={{
                            width: "28px",
                            height: "28px",
                            borderRadius: "50%",
                            background: "rgba(34,197,94,0.18)",
                            border: "1px solid rgba(34,197,94,0.38)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0
                        }}>
    <span style={{
                                color: "#22c55e",
                                fontSize: "14px"
                            }}>
      ✓
    </span>
  </div>
  <div>
    <div style={{
                                    color: "#22c55e",
                                    fontSize: "12px",
                                    fontWeight: 600
                                }}>
      Portefeuille sauvegardé
    </div>
    <div style={{
                                    color: "rgba(255,255,255,0.38)",
                                    fontSize: "10px",
                                    marginTop: "2px"
                                }}>
      Retrouvez-le depuis la page d&apos;accueil
    </div>
  </div>
  <button onClick={()=>setShowToast(false)} style={{
                            background: "transparent",
                            border: "none",
                            color: "rgba(255,255,255,0.25)",
                            cursor: "pointer",
                            fontSize: "13px",
                            marginLeft: "4px",
                            padding: 0
                        }}>
    ✕
  </button>
</div>}
  {showSave && (()=>{
                const today = new Date().toISOString().slice(0, 10);
                const investi = capitalEngage(lignes);
                const inputCss: React.CSSProperties = {
                    width: "100%",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    color: "#F8F9FC",
                    fontSize: "13px",
                    outline: "none",
                    boxSizing: "border-box",
                    fontFamily: "inherit"
                };
                const labelCss: React.CSSProperties = {
                    fontSize: "9px",
                    color: "rgba(255,255,255,0.28)",
                    letterSpacing: "0.12em",
                    fontWeight: 700,
                    display: "block",
                    marginBottom: "5px"
                };
                return <div style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(4,17,36,0.88)",
                        backdropFilter: "blur(20px)",
                        zIndex: 100,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                    }}>
  <div style={{
                            background: "rgba(8,25,54,0.98)",
                            border: "1px solid rgba(255,255,255,0.12)",
                            borderRadius: "16px",
                            padding: "32px",
                            width: "540px",
                            maxHeight: "88vh",
                            overflowY: "auto"
                        }}>
    <div style={{
                                    color: "rgba(255,255,255,0.22)",
                                    fontSize: "9px",
                                    letterSpacing: "0.22em",
                                    marginBottom: "6px"
                                }}>
      SAUVEGARDER
    </div>
    <h2 style={{
                                    color: "#F8F9FC",
                                    fontSize: "20px",
                                    fontWeight: 200,
                                    margin: "0 0 22px",
                                    letterSpacing: "0.06em"
                                }}>
      Créer le portefeuille
    </h2>
    <div style={{
                                    marginBottom: "18px"
                                }}>
      <label style={labelCss}>
        NOM DU PORTEFEUILLE
      </label>
      <input value={portfolioName} onChange={(e: any)=>setPortfolioName(e.target.value)} onKeyDown={(e: any)=>e.key === "Enter" && savePhase === "form" && savePortfolio()} placeholder="Ex: Portefeuille principal" autoFocus={true} style={inputCss} />
    </div>
    <div style={{
                                    marginBottom: "20px"
                                }}>
      <label style={labelCss}>
        MODE
      </label>
      <div style={{
                                            display: "flex",
                                            background: "rgba(255,255,255,0.04)",
                                            borderRadius: "9px",
                                            padding: "3px",
                                            border: "1px solid rgba(255,255,255,0.08)",
                                            gap: "3px"
                                        }}>
        {[
                                            {
                                                v: false,
                                                label: "Portefeuille r\xe9el"
                                            },
                                            {
                                                v: true,
                                                label: "Simulation"
                                            }
                                        ].map((param: any) =>{
                                            let { v, label } = param;
                                            const act = isSimulation === v;
                                            return <button key={String(v)} onClick={()=>{
                                                    setIsSimulation(v);
                                                    setPriceError([]);
                                                }} style={{
                                                    flex: 1,
                                                    padding: "8px",
                                                    borderRadius: "7px",
                                                    border: "none",
                                                    cursor: "pointer",
                                                    fontSize: "11px",
                                                    fontWeight: act ? 600 : 400,
                                                    transition: "all 160ms",
                                                    background: act ? "rgba(91,141,239,0.20)" : "transparent",
                                                    color: act ? "#9BB9FF" : "rgba(255,255,255,0.38)"
                                                }}>
  {label}
</button>;
                                        })}
      </div>
      <p style={{
                                            margin: "5px 0 0",
                                            fontSize: "10px",
                                            color: "rgba(255,255,255,0.20)",
                                            lineHeight: 1.5
                                        }}>
        {isSimulation ? "Simulation : aucune transaction n'est cr\xe9\xe9e. Seuls les poids sont enregistr\xe9s." : "R\xe9el : le portefeuille est constitu\xe9 des transactions ci-dessous, dat\xe9es une \xe0 une."}
      </p>
    </div>
    {!isSimulation && savePhase === "form" && <>
      {/* La répartition d'un capital a rejoint la boîte des modèles : elle n'a
          de sens qu'au moment de choisir une allocation, pas à l'enregistrement,
          où les écritures existent déjà. */}
      {priceError.length > 0 && <div style={{ marginBottom: "14px", padding: "10px 12px", borderRadius: "8px",
        background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.25)", color: "#fca5a5", fontSize: "11px" }}>
        Cours introuvable à cette date pour : {priceError.join(", ")}. Choisissez une autre date, ou saisissez ces lignes à la main.
      </div>}

      {/* Les écritures saisies */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "8px" }}>
          <span style={{ ...labelCss, marginBottom: 0 }}>TRANSACTIONS</span>
          {lignes.length > 0 && <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.30)" }}>
            {lignes.length} ligne{lignes.length > 1 ? "s" : ""} · {investi.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} € investis
          </span>}
        </div>

        {lignes.length === 0 ? (
          <div style={{ padding: "18px 12px", borderRadius: "8px", border: "1px dashed rgba(255,255,255,0.10)",
            textAlign: "center", fontSize: "11px", color: "rgba(255,255,255,0.28)", lineHeight: 1.6 }}>
            Aucune transaction.<br />Le prix de revient se calcule sur ces écritures : il en faut au moins une.
          </div>
        ) : (
          <div style={{ borderRadius: "8px", border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden" }}>
            {lignes.map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 10px",
                borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none", fontSize: "11px" }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0,
                  background: t.side === "BUY" ? "#4ade80" : "#f87171" }} />
                <span style={{ fontWeight: 600, color: "#F8F9FC", minWidth: 62 }}>{t.ticker}</span>
                <span style={{ color: "rgba(255,255,255,0.45)", flex: 1 }}>
                  {t.quantity.toLocaleString("fr-FR", { maximumFractionDigits: 6 })} × {t.unit_price.toLocaleString("fr-FR", { maximumFractionDigits: 6 })} €
                </span>
                <span style={{ color: "rgba(255,255,255,0.35)", minWidth: 74 }}>
                  {new Date(t.executed_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" })}
                </span>
                <button onClick={()=>{ setLigneEditee(i); setPanneauTx(true); }}
                  style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: "11px", padding: "2px 4px" }}>
                  Modifier
                </button>
                <button onClick={()=>setLignes(prev=>prev.filter((_, j)=>j !== i))}
                  style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.25)", cursor: "pointer", fontSize: "12px", padding: "2px 4px" }}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

      </div>
      {/* La saisie ne vit plus ici : elle part de la recherche, sur la page.
          Ce récapitulatif reste en lecture, le temps de vérifier avant
          d'enregistrer. */}
    </>}
    {isSimulation && savePhase === "form" && <div style={{
                                    marginBottom: "18px"
                                }}>
  <label style={labelCss}>
    VALEUR TOTALE (optionnel)
  </label>
  <div style={{
                                            position: "relative"
                                        }}>
    <input value={totalValue} onChange={(e: any)=>setTotalValue(e.target.value)} placeholder="Ex: 10000" type="number" min="0" style={{
                                                    ...inputCss,
                                                    paddingRight: "32px"
                                                }} />
    <span style={{
                                                    position: "absolute",
                                                    right: "12px",
                                                    top: "50%",
                                                    transform: "translateY(-50%)",
                                                    fontSize: "12px",
                                                    color: "rgba(255,255,255,0.28)"
                                                }}>
      €
    </span>
  </div>
  <p style={{
                                            margin: "5px 0 0",
                                            fontSize: "10px",
                                            color: "rgba(255,255,255,0.20)"
                                        }}>
    Valeur indicative — permet d&apos;afficher des montants approximatifs dans le dashboard.
  </p>
</div>}
    {savePhase === "progress" && txProgress && <div style={{
                                    textAlign: "center",
                                    padding: "20px 0",
                                    marginBottom: "16px"
                                }}>
  <p style={{
                                            margin: "0 0 12px",
                                            fontSize: "12px",
                                            color: "rgba(255,255,255,0.55)"
                                        }}>
    Création des transactions… 
    {txProgress.done}
     / 
    {txProgress.total}
  </p>
  <div style={{
                                            height: "5px",
                                            borderRadius: "3px",
                                            background: "rgba(255,255,255,0.08)",
                                            overflow: "hidden"
                                        }}>
    <div style={{
                                                height: "100%",
                                                borderRadius: "3px",
                                                background: "#5B8DEF",
                                                width: "".concat(String(txProgress.done / txProgress.total * 100), "%"),
                                                transition: "width 300ms ease"
                                            }} />
  </div>
</div>}
    {savePhase === "tx_errors" && <div style={{
                                    marginBottom: "16px"
                                }}>
  <div style={{
                                            padding: "10px 12px",
                                            borderRadius: "8px",
                                            background: "rgba(248,113,113,0.08)",
                                            border: "1px solid rgba(248,113,113,0.22)",
                                            marginBottom: "12px"
                                        }}>
    <p style={{
                                                    margin: "0 0 6px",
                                                    fontSize: "11px",
                                                    color: "rgba(255,255,255,0.60)",
                                                    fontWeight: 600
                                                }}>
      {/* Interpolé plutôt que découpé en nœuds de texte : JSX rogne les
          espaces de bord de ligne, ce qui donnait « 0/3transactions créées ». */}
      {`${lignes.length - txErrors.length} / ${lignes.length} transactions créées`}
    </p>
    <p style={{
                                                    margin: "0 0 8px",
                                                    fontSize: "10px",
                                                    color: "rgba(255,255,255,0.35)"
                                                }}>
      Échouées :
    </p>
    {/* Indexé : un même ticker peut échouer sur plusieurs écritures, et deux
        clés identiques feraient disparaître des lignes de la liste. */}
    {txErrors.map((e: any, i: number)=><div key={i} style={{
                                                        fontSize: "10px",
                                                        color: "#fca5a5",
                                                        marginBottom: "3px"
                                                    }}>
  {`• ${e.ticker} — ${e.error}`}
</div>)}
  </div>
  <div style={{
                                            display: "flex",
                                            gap: "10px"
                                        }}>
    <button onClick={async ()=>{
                                                    setSaving(true);
                                                    try {
                                                        await envoyerLignes(savedPortId!, lignesEchouees);
                                                    } finally{
                                                        setSaving(false);
                                                    }
                                                }} disabled={saving} style={{
                                                    flex: 2,
                                                    padding: "11px",
                                                    borderRadius: "8px",
                                                    background: "rgba(91,141,239,0.18)",
                                                    border: "1px solid rgba(91,141,239,0.35)",
                                                    color: "#9BB9FF",
                                                    fontSize: "11px",
                                                    fontWeight: 500,
                                                    cursor: "pointer",
                                                    letterSpacing: "0.08em",
                                                    opacity: saving ? 0.5 : 1
                                                }}>
      {saving ? "R\xc9ESSAI…" : "R\xc9ESSAYER (".concat(String(txErrors.length), " manquante").concat(String(txErrors.length > 1 ? "s" : ""), ")")}
    </button>
    <button onClick={()=>{
                                                    setShowSave(false);
                                                    setSavePhase("form");
                                                    setShowToast(true);
                                                    setTimeout(()=>{
                                                        setShowToast(false);
                                                        router.push("/portfolio");
                                                    }, 2200);
                                                }} style={{
                                                    flex: 1,
                                                    padding: "11px",
                                                    borderRadius: "8px",
                                                    background: "transparent",
                                                    border: "1px solid rgba(255,255,255,0.09)",
                                                    color: "rgba(255,255,255,0.4)",
                                                    fontSize: "11px",
                                                    cursor: "pointer",
                                                    letterSpacing: "0.08em"
                                                }}>
      TERMINER
    </button>
  </div>
</div>}
    {savePhase === "form" && sessionExpiree && <div style={{
                                    marginBottom: "14px", padding: "12px 14px", borderRadius: "10px",
                                    background: "rgba(251,191,36,0.09)", border: "1px solid rgba(251,191,36,0.28)"
                                }}>
      <p style={{ margin: "0 0 4px", fontSize: "12px", fontWeight: 600, color: "#fcd34d" }}>
        Vous n&apos;êtes pas connecté
      </p>
      <p style={{ margin: 0, fontSize: "11px", color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
        Les transactions sont rattachées à votre compte. Connectez-vous depuis le
        menu de profil, puis relancez l&apos;enregistrement — vos {lignes.length} écriture{lignes.length > 1 ? "s" : ""} sont conservées.
      </p>
    </div>}
    {savePhase === "form" && <div style={{
                                    display: "flex",
                                    gap: "10px",
                                    marginTop: "4px"
                                }}>
  <button onClick={closeSaveModal} style={{
                                            flex: 1,
                                            padding: "11px",
                                            borderRadius: "8px",
                                            background: "transparent",
                                            border: "1px solid rgba(255,255,255,0.09)",
                                            color: "rgba(255,255,255,0.4)",
                                            fontSize: "11px",
                                            cursor: "pointer",
                                            letterSpacing: "0.08em"
                                        }}>
    ANNULER
  </button>
  <button onClick={savePortfolio} disabled={saving || !portfolioName.trim() || !isSimulation && lignes.length === 0} style={{
                                            flex: 2,
                                            padding: "11px",
                                            borderRadius: "8px",
                                            background: "rgba(91,141,239,0.18)",
                                            border: "1px solid rgba(91,141,239,0.35)",
                                            color: "#9BB9FF",
                                            fontSize: "11px",
                                            fontWeight: 500,
                                            cursor: "pointer",
                                            letterSpacing: "0.08em",
                                            opacity: saving || !portfolioName.trim() || !isSimulation && lignes.length === 0 ? 0.5 : 1
                                        }}>
    {saving ? "ENREGISTREMENT…" : isSimulation ? "SAUVEGARDER →" : "CR\xc9ER ET INVESTIR →"}
  </button>
</div>}
  </div>
</div>;
            })()}
  {/* La saisie d'une transaction — le composant du dashboard, à l'identique.
      Elle s'ouvre depuis la recherche : choisir un actif, c'est déclarer une
      opération sur cet actif, pas l'inscrire à une allocation. */}
  {panneauTx && <TransactionModal
        isOpen={true}
        prefillAsset={actifSaisi ?? undefined}
        lockAsset={!!actifSaisi && ligneEditee === null}
        initialDraft={ligneEditee !== null ? lignes[ligneEditee] : null}
        onDraft={(tx)=>{
            setLignes((prev)=>ligneEditee !== null
                ? prev.map((l, j)=>j === ligneEditee ? tx : l)
                : [...prev, tx]);
            setPanneauTx(false);
            setLigneEditee(null);
            setActifSaisi(null);
        }}
        onSuccess={()=>{}}
        onClose={()=>{ setPanneauTx(false); setLigneEditee(null); setActifSaisi(null); }}
    />}
  {presetToConfirm && <div style={{
                    position: "fixed",
                    inset: 0,
                    background: "rgba(4,17,36,0.88)",
                    backdropFilter: "blur(20px)",
                    zIndex: 100,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                }}>
  <div style={{
                        background: "rgba(8,25,54,0.98)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "16px",
                        padding: "36px",
                        width: "400px"
                    }}>
    <div style={{
                                color: "rgba(255,255,255,0.25)",
                                fontSize: "10px",
                                letterSpacing: "0.2em",
                                marginBottom: "8px"
                            }}>
      MODÈLE PRÉDÉFINI
    </div>
    <h2 style={{
                                color: "#F8F9FC",
                                fontSize: "20px",
                                fontWeight: 200,
                                margin: "0 0 10px",
                                letterSpacing: "0.06em"
                            }}>
      {presetToConfirm.name}
    </h2>
    <p style={{
                                color: "rgba(255,255,255,0.3)",
                                fontSize: "11px",
                                margin: "0 0 18px",
                                lineHeight: 1.7,
                                letterSpacing: "0.02em"
                            }}>
      {lignes.length > 0
        ? "Vos transactions actuelles seront remplacées. Cette action est irréversible."
        : "Un modèle ne décrit qu'une répartition. Indiquez le capital et la date de l'achat : une transaction sera créée par actif, au cours de clôture de ce jour-là."}
    </p>
    <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
      <div style={{ position: "relative", flex: 1 }}>
        <input value={capital} onChange={(e: any)=>setCapital(e.target.value)} placeholder="10 000" type="number" min="0"
          style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
                   borderRadius: "8px", padding: "10px 28px 10px 12px", color: "#F8F9FC", fontSize: "13px",
                   outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
        <span style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
                       fontSize: "12px", color: "rgba(255,255,255,0.28)" }}>€</span>
      </div>
      <input value={investDate} onChange={(e: any)=>setInvestDate(e.target.value)} type="date"
        max={new Date().toISOString().slice(0, 10)}
        style={{ width: "150px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
                 borderRadius: "8px", padding: "10px 12px", color: "#F8F9FC", fontSize: "13px",
                 outline: "none", boxSizing: "border-box", fontFamily: "inherit", colorScheme: "dark" }} />
    </div>
    {priceError.length > 0 && <p style={{ margin: "0 0 14px", fontSize: "10px", color: "#fca5a5", lineHeight: 1.6 }}>
      Cours introuvable à cette date pour : {priceError.join(", ")}. Essayez une autre date.
    </p>}
    <div style={{
                                display: "flex",
                                gap: "10px"
                            }}>
      <button onClick={()=>setPresetToConfirm(null)} style={{
                                        flex: 1,
                                        padding: "11px",
                                        borderRadius: "8px",
                                        background: "transparent",
                                        border: "1px solid rgba(255,255,255,0.09)",
                                        color: "rgba(255,255,255,0.4)",
                                        fontSize: "11px",
                                        cursor: "pointer",
                                        letterSpacing: "0.08em"
                                    }}>
        ANNULER
      </button>
      <button onClick={()=>appliquerPreset(presetToConfirm)}
                                    disabled={repartition || !capital} style={{
                                        flex: 2,
                                        padding: "11px",
                                        borderRadius: "8px",
                                        background: "rgba(91,141,239,0.18)",
                                        border: "1px solid rgba(91,141,239,0.35)",
                                        color: "#9BB9FF",
                                        opacity: repartition || !capital ? 0.45 : 1,
                                        fontSize: "11px",
                                        fontWeight: 500,
                                        cursor: "pointer",
                                        letterSpacing: "0.08em"
                                    }}>
        {repartition ? "…" : "CRÉER LES TRANSACTIONS →"}
      </button>
    </div>
  </div>
</div>}
</div>;
}

