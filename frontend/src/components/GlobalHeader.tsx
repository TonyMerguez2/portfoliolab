"use client";
import { useEffect, useRef, useState, memo, useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "@/lib/AppContext";
import { enTetesAuth } from "@/lib/session";
import { surModification } from "@/lib/portefeuilleModifie";
import { TRENDING } from "@/lib/assets";
import AssetLogo from "@/components/AssetLogo";
import PocheActifs, { RAYON_CORPS } from "@/components/portfolio/PocheActifs";
import PastilleEnveloppe from "@/components/portfolio/PastilleEnveloppe";
import { enveloppe, infobulleEnveloppe } from "@/lib/portfolio";
import { assetExchange } from "@/lib/assets";

/**
 * Taille de la vignette d'un portefeuille dans la liste du menu déroulant.
 *
 * Voir la mise en garde à l'endroit où elle sert : 48 est le plus petit nombre
 * qui laisse tenir à la fois le logo de la première ligne et une pastille
 * d'enveloppe lisible.
 */
const VIGNETTE = 48;
import { JETONS, RAYONS, rayonVignette } from "@/lib/palette";
import FenetreModale from "@/components/ui/FenetreModale";
import { initiale } from "@/lib/initiale";
import { encreSur } from "@/lib/couleur";
import { API_URL } from "@/lib/api";

type Asset = { ticker: string; type: string; name: string; };
type Portefeuille = {
  id: string; name: string; color?: string | null; image_url?: string | null;
  // Le poids sert à la vignette, qui met la plus grosse ligne devant. Le type
  // était `unknown[]`, ce que seul un `.length` tolérait.
  assets?: { ticker: string; weight: number }[];
};
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


/**
 * Un portefeuille dans les résultats de recherche.
 *
 * Le sélecteur du bandeau ayant été retiré, il n'existait plus aucun chemin
 * vers les autres portefeuilles : la page en ouvrait un et rien ne permettait
 * d'en changer. Ils reviennent ici, à côté des actifs — ce sont deux choses
 * qu'on cherche par leur nom.
 */
const LignePortefeuille = memo(function LignePortefeuille(
  { p, actif, onSelect }: { p: Portefeuille; actif: boolean; onSelect: (p: Portefeuille) => void },
) {
  const [survol, setSurvol] = useState(false);
  const fond = p.color || "#6366F1";
  const enveloppeLigne = useMemo(
    () => enveloppe((p.assets ?? []).map(a => a.ticker), assetExchange),
    [p.assets]);
  return (
    <div onClick={() => onSelect(p)}
      onMouseEnter={() => setSurvol(true)} onMouseLeave={() => setSurvol(false)}
      style={{ display:"flex", alignItems:"center", gap:"10px", width:"100%", padding:"8px 12px",
        background: survol ? "rgba(255,255,255,0.05)" : "transparent", cursor:"pointer",
        borderBottom:"1px solid rgba(255,255,255,0.04)", boxSizing:"border-box" as const }}>
      {/* La même vignette que la bande de tête du portefeuille, et désormais avec
          les deux mêmes ajouts : le logo de la première ligne, et la pastille
          d'enveloppe. Elle portait l'initiale du nom, à trois millimètres du nom
          lui-même — répétition qui coûtait plus cher ici qu'ailleurs, cette liste
          servant justement à distinguer des portefeuilles dont les initiales se
          ressemblent.

          ⚠️ **Elle passe de 28 à 48 px, et c'est ce que coûtent ces deux
          ajouts.** À 28, le logo ne s'affichait pas — le seuil de `PocheActifs`
          est à 40, en dessous duquel il mesure moins de 9 px et ne désigne plus
          rien — et une pastille lisible ne descend pas sous 20 px de diamètre, ce
          qui en aurait couvert la moitié. La ligne de la liste gagne donc une
          vingtaine de pixels de haut. C'est le prix, il n'y a pas de réglage
          intermédiaire qui tienne : entre 28 et 48, on paie la hauteur sans
          gagner la lisibilité.

          Le rayon suit celui du corps de la poche quand c'est elle qui s'affiche,
          et `rayonVignette` sinon : c'est ce `overflow: hidden` qui coupe les
          angles du dessin, donc les deux valeurs doivent s'accorder. */}
      <span style={{ position:"relative", display:"inline-flex", flexShrink:0 }}>
        {/**
          * ⚠️ La couleur du portefeuille ne sert de fond **qu'à l'initiale**.
          *
          * Elle était posée dans tous les cas, et cela produisait un liseré coloré
          * le long des angles arrondis — un liseré bleu sur les portefeuilles
          * restés à la couleur par défaut, `#6366F1`. La cause n'est pas un
          * débordement mais le lissage : le `overflow: hidden` découpe l'angle en
          * fondu, et chaque pixel du bord mélange le dessin avec ce qu'il y a
          * derrière. Derrière, il y avait cet indigo.
          *
          * Une image ou une poche remplissent la boîte : elles n'ont besoin
          * d'aucun fond, et la surface creuse du thème leur suffit. C'est déjà ce
          * que fait `ImagePortefeuille` sur le tableau de bord — d'où l'absence du
          * liseré là-bas, et sa présence ici.
          */}
        <span style={{ width:VIGNETTE, height:VIGNETTE, flexShrink:0,
          borderRadius: p.assets && !p.image_url ? Math.round(VIGNETTE * RAYON_CORPS) : rayonVignette(VIGNETTE),
          display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden",
          background: p.image_url || p.assets ? JETONS.carteCreuse : fond,
          color:encreSur(fond), fontSize:19, fontWeight:700 }}>
          {p.image_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={`${API_URL}${p.image_url}`} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
            : p.assets
              ? <PocheActifs actifs={p.assets} taille={VIGNETTE} />
              : initiale(p.name)}
        </span>
        {enveloppeLigne && (
          <PastilleEnveloppe enveloppe={enveloppeLigne} diametre={20}
            infobulle={infobulleEnveloppe(enveloppeLigne)} />
        )}
      </span>
      <span style={{ color:"#F8F9FC", fontSize:"11px", fontWeight:500, flex:1, textAlign:"left" }}>{p.name}</span>
      {actif && (
        <span style={{ fontSize:"9px", color:JETONS.positif, fontWeight:600, letterSpacing:"0.04em" }}>OUVERT</span>
      )}
      <span style={{ color:"rgba(255,255,255,0.35)", fontSize:"10px" }}>
        {p.assets?.length ?? 0} actif{(p.assets?.length ?? 0) > 1 ? "s" : ""}
      </span>
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
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [portfolios, setPortfolios] = useState<Portefeuille[]>([]);
  const [showTools, setShowTools] = useState(false);
  const [category, setCategory] = useState("all");
  const [displayCount, setDisplayCount] = useState(20);
  const [prices, setPrices] = useState<Record<string,Price>>({});
  const [tickerData, setTickerData] = useState<any[]>([]);
  const tickerRef = useRef<HTMLDivElement>(null);
  const tickerPosRef = useRef(0);
  const [isSearching, setIsSearching] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const debounce = useRef<NodeJS.Timeout | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);
  const isLanding = pathname === "/";
  const isChartPage = pathname === "/chart";
  useEffect(() => {
    fetch(`${API_URL}/api/v1/portfolios`, { headers: enTetesAuth() })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setPortfolios(d); })
      .catch(() => {});
  }, []);

  /**
   * La liste se corrige quand un portefeuille est écrit ailleurs.
   *
   * ⚠️ Elle n'est lue qu'une fois, au montage — et l'en-tête ne se démonte pas
   * d'une page à l'autre. Poser une image sur le tableau de bord la laissait donc
   * sur sa version périmée jusqu'au prochain chargement complet, ce qui se lisait
   * comme un recadrage non enregistré alors qu'il l'était.
   *
   * On rapièce l'entrée concernée plutôt que de recharger la liste : c'est une
   * requête en moins, et surtout aucun risque de la voir se réordonner ou
   * clignoter sous le curseur de quelqu'un qui la parcourt.
   */
  useEffect(() => surModification(p => {
    setPortfolios(l => l.map(x => (x.id === p.id ? { ...x, ...p } : x)));
  }), []);

  // Ticker tape
  useEffect(() => {
    const fetch_prices = async () => {
      try { const r = await fetch(`${API_URL}/ticker`); const d = await r.json(); if (Array.isArray(d)) setTickerData(d); } catch {}
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
      const r = await fetch(`${API_URL}/api/v1/prices?tickers=${encodeURIComponent(tickers.join(","))}`);
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
        const r = await fetch(`${API_URL}/api/v1/search?q=${encodeURIComponent(localSearch)}`);
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
    if (!showSearch || mode !== "asset") return;
    const visible = filteredAssets.slice(0, displayCount);
    fetchPrices(visible.map(a => a.ticker));
  }, [showSearch, category, displayCount, mode]);

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
  /**
   * Les portefeuilles proposés.
   *
   * Tous quand le champ est vide, filtrés dès qu'on tape. Les montrer d'emblée
   * est délibéré : une liste qui n'apparaît qu'après avoir tapé le bon mot
   * suppose qu'on sache déjà qu'elle existe, et c'est précisément ce qui
   * manquait.
   */
  const portefeuillesTrouves = useMemo(() => {
    const q = localSearch.trim().toLowerCase();
    if (!q) return portfolios;
    return portfolios.filter(p => (p.name ?? "").toLowerCase().includes(q));
  }, [portfolios, localSearch]);

  const ouvrirPortefeuille = useCallback((p: Portefeuille) => {
    // Le contexte type l'identifiant en nombre, l'API le rend en UUID — même
    // conversion que sur la page portefeuille.
    setActivePortfolio({ id: p.id as unknown as number, name: p.name,
      assets: (p.assets ?? []) as { ticker: string; weight: number }[],
      color: p.color || "#6366F1" });
    setMode("portfolio");
    setShowSearch(false);
    setShowSearch(false);
    setLocalSearch("");
    router.push(`/portfolio?id=${encodeURIComponent(p.id)}`);
  }, [setActivePortfolio, setMode, router]);

  const displayAssets = localSearch ? searchResults.filter(a => category === "all" || a.type === category) : filteredAssets.slice(0, displayCount);

  /**
   * ⚠️ **Fermer, c'est trois choses et non une.** La palette se refermait par des suites
   * recopiées — parfois `setShowSearch(false)` seul, parfois avec la remise à zéro de
   * l'index, parfois avec un `blur()`. Rouverte, elle gardait alors la ligne surlignée de
   * la fois d'avant. Un seul geste, appelé de partout.
   */
  const fermerPalette = useCallback(() => {
    setShowSearch(false);
    setHighlightIndex(-1);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSearch) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlightIndex(i => Math.min(i + 1, displayAssets.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlightIndex(i => Math.max(i - 1, -1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const a = displayAssets[highlightIndex];
      if (a) { setActiveAsset({ ticker: a.ticker, name: a.name }); setShowSearch(false); setLocalSearch(""); setHighlightIndex(-1); }
    }
    else if (e.key === "Escape") fermerPalette();
  };

  // ⌘K, comme dans la maquette. Le raccourci est posé sur le document parce que
  // le déclencheur n'a pas le focus au moment où l'on veut ouvrir la palette.
  //
  // ⚠️ Plus de `focus()` différé : la fenêtre se monte à l'ouverture, et son champ porte
  // `autoFocus` — React le lui donne au montage, sans minuterie à accorder.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowSearch(true);
      }
      if (e.key === "Escape") fermerPalette();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fermerPalette]);

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
    setShowSearch(false);
    setLocalSearch("");
    setHighlightIndex(-1);
    // Sur la page chart : naviguer directement vers le nouvel actif
    if (isChartPage) router.push(`/chart?ticker=${encodeURIComponent(a.ticker)}`);
  }, [setActiveAsset, isChartPage, router]);

  const handleChart = useCallback((ticker: string) => {
    router.push(`/chart?ticker=${encodeURIComponent(ticker)}`);
    setShowSearch(false);
  }, [router]);

  return (
    <>

      {/* Le salut a été retiré : il occupait la moitié gauche du bandeau pour
          répéter un prénom déjà lisible en bas de la barre latérale. Le
          sous-titre de la page portefeuille — « Voici la performance de votre
          portefeuille » — l'a suivi : il occupait à son tour cette moitié gauche
          pour énoncer ce que les chiffres juste en dessous montrent déjà. C'est
          la recherche qui prend la place, et elle a de quoi la remplir. */}

      {/* La navigation vit désormais dans SideNav, en panneau latéral. */}


      {/**
        * Le déclencheur de la recherche, au bord droit du bandeau.
        *
        * ⚠️ **Ce n'est plus un champ, c'est un bouton — et la différence est le sujet.** La
        * recherche s'écrivait ici même, et ses résultats tombaient dans un panneau accroché
        * sous le champ : la troisième surface flottante de l'application, avec ses propres
        * marges, sa propre largeur et son propre ancrage. Demandé à l'usage de la faire
        * s'ouvrir « comme une page, comme pour ajouter une opération ». Elle se pose donc
        * désormais dans une `FenetreModale`, au centre, sur le même voile que les quatre
        * autres — et ce qui reste au bandeau n'a plus qu'à *annoncer* la recherche.
        *
        * ⚠️ **Il garde exactement l'aspect du champ qu'il remplace.** Même hauteur, même
        * aplat, même loupe, même phrase : ce qu'on cliquait continue de se cliquer au même
        * endroit et de la même façon. Seul ce qui s'ouvre a changé.
        *
        * ⚠️ **Le texte est un `span`, plus un `placeholder`.** Un champ désactivé aurait
        * gardé un curseur de saisie et l'annonce « champ de texte » aux technologies
        * d'assistance, pour une boîte où l'on ne peut rien écrire.
        */}
      <button type="button" onClick={() => setShowSearch(true)}
        aria-label="Rechercher un actif, un ETF, un indice"
        style={{
          position:"fixed", top:"12px", right:"20px", zIndex:50, width:"320px",
          display:"flex", alignItems:"center", gap:"8px", height:"36px", padding:"0 12px",
          borderRadius:RAYONS.md, boxSizing:"border-box", cursor:"pointer",
          background:JETONS.segmentPiste, border:"none", outline:"none",
          textAlign:"left",
        }}>
        {/* La loupe du concept. Trait de 2,0 et non 1,5 : leur valeur suppose un rendu à
            24 px, où elle donne 1,5. Sur une boîte de 18 il faut 2,0 pour ce poids. */}
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"
          strokeWidth={2.0} strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink:0, color:JETONS.texteIntense }}>
          <path d="m21 21-6-6M3 10a7 7 0 1 0 14 0 7 7 0 0 0-14 0"/>
        </svg>
        <span style={{ color:JETONS.texte, fontSize:"12px", opacity:0.55, flex:1, minWidth:0,
          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          Rechercher un actif, un ETF, un indice…
        </span>
      </button>

      {showSearch && (
        /**
         * ⚠️ **La fenêtre partagée, et non une quatrième recette.** Elle apporte le voile, le
         * centrage, l'animation, `aria-modal` et la fermeture au clic dehors — quatre choses
         * que le panneau ancré réécrivait pour lui seul, dont un voile invisible en `zIndex`
         * 49 qu'il fallait poser deux fois.
         *
         * ⚠️ **Rembourrage nul et débordement caché, contre les valeurs par défaut.** Une
         * fenêtre ordinaire respire de 18 sur 20 et fait défiler tout son contenu ; une
         * palette veut que son champ touche les bords et que **seule la liste** défile, le
         * champ et le pied restant en place. Les trois valeurs sont passées en `style`, que
         * `FenetreModale` étale après les siennes.
         */
        <FenetreModale largeur={560} etiquette="Recherche"
          onFermer={fermerPalette}
          style={{ padding:0, gap:0, overflow:"hidden" }}>
          {/* Le champ, en tête et sur toute la largeur. */}
          <div style={{ display:"flex", alignItems:"center", gap:"10px",
            padding:"14px 18px", borderBottom:`1px solid ${JETONS.bord}` }}>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"
              strokeWidth={2.0} strokeLinecap="round" strokeLinejoin="round"
              style={{ flexShrink:0, color:JETONS.texteIntense }}>
              <path d="m21 21-6-6M3 10a7 7 0 1 0 14 0 7 7 0 0 0-14 0"/>
            </svg>
            {/* ⚠️ `autoFocus` plutôt qu'un `focus()` différé : la fenêtre se monte au moment
                où on l'ouvre, donc le champ existe déjà quand React le pose. */}
            <input ref={searchRef} value={localSearch} autoFocus
              onChange={e => { setLocalSearch(e.target.value); setHighlightIndex(-1); }}
              onKeyDown={handleKeyDown}
              placeholder="Rechercher un actif, un ETF, un indice…"
              style={{ background:"transparent", border:"none", outline:"none",
                color:JETONS.texte, fontSize:"15px", flex:1, minWidth:0 }}/>
            {localSearch && (
              <button onClick={() => { setLocalSearch(""); setSearchResults([]); setHighlightIndex(-1); }}
                aria-label="Effacer la recherche"
                style={{ background:"transparent", border:"none", cursor:"pointer", opacity:0.4,
                  color:JETONS.texte, padding:0, fontSize:"13px" }}>✕</button>
            )}
          </div>

          <div style={{ display:"flex", gap:"2px", padding:"8px 14px",
            borderBottom:`1px solid ${JETONS.bord}` }}>
            {[{id:"all",label:"Tous"},{id:"EQUITY",label:"Actions"},{id:"ETF",label:"Fonds"},{id:"INDEX",label:"Indices"},{id:"CRYPTOCURRENCY",label:"Crypto"}].map(cat => (
              <button key={cat.id} onClick={() => { setCategory(cat.id); setDisplayCount(20); }}
                style={{ padding:"4px 11px", borderRadius:"6px", border:"none", fontSize:"11px", cursor:"pointer",
                  background:category===cat.id?"rgba(91,141,239,0.2)":"transparent",
                  color:category===cat.id?"#9BB9FF":"rgba(255,255,255,0.4)",
                  fontWeight:category===cat.id?600:400, letterSpacing:"0.04em" }}>{cat.label}</button>
            ))}
          </div>

          {/* ⚠️ La liste seule défile, et c'est elle qui porte la hauteur : `flex: 1` sur un
              parent en colonne, plus un plafond, pour que la fenêtre ne grandisse pas au
              rythme des résultats. */}
          <div ref={listRef} onScroll={handleScroll}
            style={{ flex:1, minHeight:0, maxHeight:"46vh", overflowY:"auto" }}>
            {portefeuillesTrouves.length > 0 && (
              <>
                <div style={{ padding:"8px 14px 2px", color:"rgba(255,255,255,0.2)", fontSize:"9px", letterSpacing:"0.12em" }}>PORTEFEUILLES</div>
                {portefeuillesTrouves.map(p => (
                  <LignePortefeuille key={p.id} p={p}
                    actif={String(activePortfolio?.id ?? "") === String(p.id)}
                    onSelect={ouvrirPortefeuille} />
                ))}
              </>
            )}
            {!localSearch && <div style={{ padding:"8px 14px 2px", color:"rgba(255,255,255,0.2)", fontSize:"9px", letterSpacing:"0.12em" }}>POPULAIRES</div>}
            {displayAssets.map((a, i) => (
              <AssetRow key={a.ticker} a={a} highlighted={i===0 && !!localSearch} focused={i===highlightIndex}
                idx={i} price={prices[a.ticker]}
                onSelect={x => { handleSelect(x); fermerPalette(); }}
                onChart={x => { handleChart(x); fermerPalette(); }}/>
            ))}
            {localSearch && displayAssets.length === 0 && portefeuillesTrouves.length === 0 && !isSearching && (
              <div style={{ padding:"24px 14px", textAlign:"center", color:"rgba(255,255,255,0.25)", fontSize:"12px" }}>Aucun résultat</div>
            )}
          </div>

          {/**
            * ⚠️ **Le pied annonce les touches, parce qu'elles marchent enfin.** Les flèches
            * et l'entrée étaient déjà écrites, mais gardées derrière un état que rien
            * n'allumait plus : elles ne faisaient rien depuis longtemps, et personne ne
            * pouvait le savoir puisque rien ne les annonçait. Les rendre visibles est ce qui
            * oblige à les tenir.
            */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-end", gap:"14px",
            padding:"9px 14px", borderTop:`1px solid ${JETONS.bord}`,
            color:"rgba(255,255,255,0.35)", fontSize:"11px" }}>
            {[["↑ ↓","Naviguer"],["↵","Ouvrir"],["Esc","Fermer"]].map(([touche, quoi]) => (
              <span key={quoi} style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                <kbd style={{ fontFamily:"inherit", fontSize:"10px", padding:"2px 6px",
                  borderRadius:"5px", border:`1px solid ${JETONS.bord}`,
                  color:"rgba(255,255,255,0.6)" }}>{touche}</kbd>
                {quoi}
              </span>
            ))}
          </div>
        </FenetreModale>
      )}

      {/**
        * La roue de réglage a été retirée du bandeau.
        *
        * ⚠️ **Elle disait « Réglages » et ouvrait les notifications.** Le libellé et
        * l'infobulle annonçaient un panneau de réglages ; le clic dépliait une boîte
        * contenant « Aucune notification ». Deux promesses, aucune tenue — et les vrais
        * réglages vivent dans la barre latérale, où ils sont nommés « Paramètres ».
        *
        * ⚠️ **Ce qui part avec elle.** L'état `showNotifs` et son panneau vide, qui
        * n'avaient plus d'autre déclencheur. Rien d'autre ne les lisait ; le voile de
        * fermeture ne garde donc que la recherche.
        */}
    </>
  );
}
