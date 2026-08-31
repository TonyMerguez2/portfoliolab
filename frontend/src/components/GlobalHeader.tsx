"use client";
import { useEffect, useRef, useState, memo, useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "@/lib/AppContext";
import { enTetesAuth } from "@/lib/session";
import { surModification } from "@/lib/portefeuilleModifie";
import { TRENDING } from "@/lib/assets";
import AssetLogo from "@/components/AssetLogo";
import AvatarNovac from "@/components/AvatarNovac";
import { lireApparenceAvatar } from "@/lib/useCouleurAvatar";

/**
 * Le côté de la vignette d'un portefeuille dans la palette.
 *
 * ⚠️ **Celui d'un logo d'actif, et pas un de plus.** Elle valait 48 du temps où elle portait
 * une poche d'actifs : le logo de la première ligne n'apparaît qu'à partir de 40, et une
 * pastille lisible ne descend pas sous 20 — deux seuils qui imposaient la hauteur. L'avatar
 * n'a aucun de ces seuils, et une liste où portefeuilles et actifs se suivent doit les poser
 * sur la même colonne : deux tailles de vignette font deux natures d'objet. Relevé à
 * l'usage.
 */
const VIGNETTE = 28;
import { JETONS, RAYONS } from "@/lib/palette";
import { brandHex } from "@/lib/tileStyle";
import { HAUTEUR_SAISIE, RAYON_SAISIE, champ } from "@/components/ui/saisie";
import FenetreModale from "@/components/ui/FenetreModale";
import Segments from "@/components/ui/Segments";
import { API_URL } from "@/lib/api";

/**
 * Le rayon des deux surfaces de recherche : le déclencheur du bandeau et le champ de la
 * palette.
 *
 * ⚠️ **Celui de la fenêtre, et non celui des saisies.** `RAYON_SAISIE` vaut 18, qui est le
 * rayon de la *carte* intérieure ; la fenêtre, elle, se voit arrondie à 24 par son anneau
 * extérieur — et c'est ce bord-là qu'on a sous les yeux quand la palette est ouverte. Un
 * champ posé à quatorze pixels du bord d'une fenêtre en portait donc six de moins qu'elle,
 * ce qui se lit comme deux familles de coins. Demandé à l'usage : « même rayon que la page ».
 *
 * ⚠️ **Le déclencheur le prend aussi, alors qu'il n'est pas dans la fenêtre.** Ce sont les
 * deux visages du même objet — l'un annonce ce que l'autre ouvre —, et ils se voient à une
 * seconde d'intervalle. Deux rayons feraient deux boîtes.
 */
const RAYON_RECHERCHE = RAYONS.xl;

type Asset = { ticker: string; type: string; name: string; };
type Portefeuille = {
  id: string; name: string; color?: string | null; image_url?: string | null;
  /** La valeur déclarée du portefeuille. La route de liste la publie déjà. */
  total_value?: number | null;
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
};

const AssetRow = memo(function AssetRow({ a, highlighted, focused, idx, price, onSelect }: AssetRowProps) {
  const tc = typeColor(a.type);
  const [hovered, setHovered] = useState(false);
  /**
   * ⚠️ **La ligne prend la teinte de l'actif, et non un bleu pour tous.** Elle se surlignait
   * en `rgba(91,141,239,…)` — l'accent de l'application, le même sur Apple, Bitcoin et le
   * CAC 40. Or chaque actif *a* une couleur, celle que portent déjà sa carte et sa tuile :
   * la reprendre ici fait que la ligne visée s'annonce de la même couleur que ce qu'elle va
   * ouvrir. Relevé à l'usage.
   *
   * ⚠️ **Deux alphas et non un.** Le survol et la sélection au clavier doivent se distinguer
   * quand les deux tombent sur la même ligne — sans quoi déplacer la souris efface la trace
   * du clavier. Le clavier appuie plus fort.
   */
  const teinte = brandHex(a.ticker);
  const fond = focused ? `${teinte}2E` : hovered ? `${teinte}1A` : "transparent";
  return (
    <div
      data-idx={idx}
      style={{ display:"flex", alignItems:"center", gap:"10px", width:"100%", padding:"8px 12px", background: fond, cursor:"pointer", borderRadius:RAYONS.sm, boxSizing:"border-box" as const }}
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
      {/**
        * ⚠️ **Le bouton « Graphique » a été retiré, et il se prenait pour une commande.**
        * Il paraissait au survol, juste avant le prix, et poussait donc le cours et la
        * performance hors du regard **au moment précis où l'on visait la ligne**. Or la
        * ligne entière ouvre déjà le graphique : le bouton doublait le clic qui le portait,
        * et le payait en cachant les deux seuls chiffres qu'on venait lire. Relevé à
        * l'usage — « je ne vois pas avec le bouton ».
        */}
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
  { p, actif, onSelect, idx, focused, onSupprimer, chiffres }: {
    p: Portefeuille; actif: boolean; onSelect: (p: Portefeuille) => void;
    /**
     * ⚠️ **Le rang dans la suite, et non dans la liste des portefeuilles.** C'est par lui que
     * l'effet de défilement retrouve la ligne surlignée — `[data-idx]` est cherché sur toute
     * la liste, portefeuilles et actifs mêlés. Un rang local aurait fait remonter le premier
     * actif portant le même numéro.
     */
    idx: number;
    focused: boolean;
    /** Retire ce portefeuille. Rendu par l'appelant, qui seul tient la liste. */
    onSupprimer: (p: Portefeuille) => void;
    /**
     * La valeur et la variation du jour, déjà calculées.
     *
     * ⚠️ **Passées toutes faites, et non déduites d'une table de cours.** Recevoir `prices`
     * entier ferait échouer la mémoïsation de chaque ligne à chaque cours reçu — toutes les
     * dix secondes, pour vingt lignes dont une seule a bougé. Deux nombres changent quand
     * *ces* deux nombres changent.
     */
    chiffres: { valeur: number | null; variation: number | null; lignes: number };
  },
) {
  const [survol, setSurvol] = useState(false);
  const [confirme, setConfirme] = useState(false);
  /* ⚠️ Gardé sur le portefeuille : la liste se refiltre à chaque frappe, et relire le
     stockage à chaque rendu ferait vingt lectures par lettre tapée. */
  const apparence = useMemo(() => lireApparenceAvatar(p), [p]);
  return (
    <div onClick={() => onSelect(p)} data-idx={idx}
      onMouseEnter={() => setSurvol(true)}
      onMouseLeave={() => { setSurvol(false); setConfirme(false); }}
      style={{ display:"flex", alignItems:"center", gap:"10px", width:"100%", padding:"8px 12px",
        /* Le survol et la sélection au clavier disent la même chose et se peignent pareil :
           deux teintes pour un même état feraient croire à deux états. */
        background: focused ? `${apparence.couleur}2E` : survol ? `${apparence.couleur}1A` : "transparent",
        cursor:"pointer", borderRadius:RAYONS.sm, boxSizing:"border-box" as const }}>
      {/**
        * ⚠️ **L'avatar du portefeuille, et non plus sa poche d'actifs.** Cette vignette
        * montrait le contenu — une carte par actif, empilées — ou l'initiale du nom à trois
        * millimètres du nom lui-même. C'était le portrait de ce que le portefeuille *range* ;
        * ce qu'on cherche dans une liste, c'est le portefeuille lui-même. Il a un visage
        * depuis qu'on peut lui en choisir un, et deux portefeuilles se reconnaissent bien
        * mieux à leur forme et à leur teinte qu'à six logos de trois pixels. Relevé à
        * l'usage — « au lieu d'afficher l'ancien logo ».
        *
        * ⚠️ **Vivant, mais sans regard.** Je les avais figés — vingt avatars qui respirent
        * dans une liste qui se refiltre à chaque frappe, cela paraissait cher. Demandé à
        * l'usage de les animer : ce qui coûte vraiment n'est pas la respiration mais le
        * **suivi du curseur**, qui fait recalculer la direction du regard de chaque ligne à
        * chaque mouvement de souris. `suivi` reste donc coupé, et vingt paires d'yeux ne se
        * tournent pas ensemble vers le curseur — ce qui, à cette taille, se lirait comme un
        * défaut plutôt que comme une présence.
        *
        * ⚠️ **La pastille d'enveloppe a été retirée, et elle avait deux torts.** Elle
        * annonçait PEA, CTO ou crypto par-dessus l'avatar — une information vraie, mais posée
        * *sur* le seul endroit de la ligne qui serve à reconnaître le portefeuille. Elle
        * mordait donc le portrait qu'on venait d'y mettre. Et son diamètre de vingt sur une
        * vignette descendue à vingt-huit en recouvrait plus de la moitié : elle tenait sur
        * les quarante-huit d'avant, pas ici. Retirée à l'usage.
        *
        * ⚠️ **Ce qu'on perd.** Deux portefeuilles nommés pareil et de même apparence ne se
        * départagent plus dans cette liste. Le cas existe ; il est rare, et l'enveloppe se lit
        * sur le dossier une fois le portefeuille ouvert.
        */}
      <AvatarNovac taille={VIGNETTE} couleur={apparence.couleur} forme={apparence.forme}
        skin={apparence.skin} suivi={false} />
      <span style={{ color:"#F8F9FC", fontSize:"11px", fontWeight:500, flex:1, textAlign:"left" }}>{p.name}</span>
      {actif && (
        <span style={{ fontSize:"9px", color:JETONS.positif, fontWeight:600, letterSpacing:"0.04em" }}>OUVERT</span>
      )}
      {/**
        * ⚠️ **La même colonne que les actifs, au même endroit.** Une ligne de portefeuille
        * n'annonçait que son nombre d'actifs, quand celle d'un actif porte un cours et une
        * variation du jour. Les deux se suivent dans la même liste : deux grammaires à
        * droite du nom obligent à relire pour savoir ce qu'on regarde. Demandé à l'usage.
        *
        * ⚠️ **Le nombre d'actifs ne disparaît pas, il descend.** Il tenait la place que le
        * cours occupe maintenant ; il devient la ligne du bas quand il n'y a pas de variation
        * à montrer — un portefeuille vide, ou dont aucun cours n'est encore arrivé.
        */}
      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:"1px" }}>
        <span style={{ color:"#F8F9FC", fontSize:"10px", opacity:0.6 }}>
          {chiffres.valeur != null
            ? chiffres.valeur.toLocaleString("fr-FR", { maximumFractionDigits:0 }) + " €"
            : `${chiffres.lignes} actif${chiffres.lignes > 1 ? "s" : ""}`}
        </span>
        {chiffres.variation != null && (
          <span style={{ fontSize:"10px", fontWeight:600,
            color: chiffres.variation >= 0 ? "#22c55e" : "#ef4444" }}>
            {chiffres.variation >= 0 ? "▲" : "▼"} {Math.abs(chiffres.variation).toFixed(2)}%
          </span>
        )}
      </div>
      {/**
        * ⚠️ **Deux clics, et non une boîte du navigateur.** `confirm()` arrête tout, sort de
        * la page et se présente au nom du site plutôt qu'au nom de l'application — c'est déjà
        * la règle du formulaire de compte, et il n'y a pas de raison qu'elle vaille là et pas
        * ici. Le bouton devient son propre garde-fou, et se défait dès qu'on quitte la ligne.
        *
        * ⚠️ **Il n'apparaît qu'au survol de la ligne, et il arrête le clic.** Visible en
        * permanence, une croix par portefeuille ferait d'une liste de navigation une liste de
        * gestion ; sans `stopPropagation`, la supprimer ouvrirait le portefeuille au passage.
        */}
      {(survol || confirme) && (
        <button type="button"
          onClick={e => {
            e.stopPropagation();
            if (confirme) onSupprimer(p); else setConfirme(true);
          }}
          aria-label={confirme ? `Confirmer la suppression de ${p.name}` : `Supprimer ${p.name}`}
          style={{ flexShrink:0, border:"none", cursor:"pointer", borderRadius:RAYONS.xs,
            padding:"3px 8px", fontSize:"10px", letterSpacing:"0.03em",
            background: confirme ? "rgba(239,68,68,0.22)" : "transparent",
            color: confirme ? "#fca5a5" : "rgba(255,255,255,0.4)" }}>
          {confirme ? "Confirmer" : "✕"}
        </button>
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

  /**
   * Les cours des actifs proposés, demandés à l'ouverture de la palette.
   *
   * ⚠️ **La condition sur le mode a été retirée, et c'est elle qui vidait la colonne.** Elle
   * se lisait `mode !== "asset"` — vestige du temps où la recherche était un menu déroulant
   * qui ne s'ouvrait qu'en mode actif. Depuis qu'elle est une palette, elle s'ouvre de
   * partout : sur le tableau de bord d'un portefeuille, `mode` vaut « portfolio », aucun
   * cours n'était donc chargé, et les vingt actifs proposés paraissaient sans prix ni
   * variation. Relevé à l'usage — « je ne vois plus les perfs et valeurs ».
   *
   * ⚠️ **Ce n'est pas la palette qui choisit ce qu'elle montre selon le mode.** Elle propose
   * les mêmes actifs partout ; conditionner leurs cours à l'écran d'où on l'appelle est une
   * asymétrie que rien n'annonce, et qui se lit comme une panne de réseau.
   */
  useEffect(() => {
    if (!showSearch) return;
    const visible = filteredAssets.slice(0, displayCount);
    fetchPrices(visible.map(a => a.ticker));
  }, [showSearch, category, displayCount]);

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

  /**
   * Retire un portefeuille, ici et sur le serveur.
   *
   * ⚠️ **La liste est corrigée avant la réponse, et remise en cas de refus.** Attendre le
   * serveur laisse la ligne sous le curseur pendant une seconde, ce qui se lit comme un clic
   * manqué et invite à recommencer — sur une suppression, recommencer est précisément ce
   * qu'il ne faut pas encourager. On retire d'abord ; si la route refuse, la liste revient
   * telle qu'elle était.
   *
   * ⚠️ **Le portefeuille ouvert cesse de l'être s'il vient d'être supprimé.** Le contexte
   * garderait sinon un identifiant que le serveur ne connaît plus, et la page suivante
   * chercherait à le charger.
   */
  const supprimerPortefeuille = useCallback(async (cible: Portefeuille) => {
    const avant = portfolios;
    setPortfolios(l => l.filter(x => String(x.id) !== String(cible.id)));
    if (String(activePortfolio?.id ?? "") === String(cible.id)) setActivePortfolio(null);
    try {
      const r = await fetch(`${API_URL}/api/v1/portfolios/${encodeURIComponent(cible.id)}`,
        { method: "DELETE", headers: enTetesAuth() });
      if (!r.ok) throw new Error("refus");
    } catch {
      setPortfolios(avant);
    }
  }, [portfolios, activePortfolio, setActivePortfolio]);

  /**
   * Ce que chaque portefeuille vaut réellement, demandé au serveur.
   *
   * ⚠️ **`/positions` et non la charge utile de la liste — j'avais lu deux champs pour ce
   * qu'ils ne sont pas.** `total_value`, sur `GET /portfolios`, est la valeur *saisie à la
   * déclaration*, c'est-à-dire l'investi ; et `assets` est l'**allocation cible**, vide dès
   * qu'un portefeuille est bâti sur des transactions. D'où les trois symptômes relevés à
   * l'usage, qui n'en faisaient qu'un : une valeur qui était l'investi, un « 0 actif » sur un
   * portefeuille qui en a, et aucune variation faute de poids à pondérer.
   *
   * ⚠️ **La route fait déjà le repli, et c'est pourquoi elle est la bonne.** Sans
   * transactions, elle recalcule depuis `assets × total_value` et se déclare `source:
   * "weights"` ; avec, elle rend les positions réelles. Refaire ce choix ici aurait été
   * réécrire, du mauvais côté du réseau, la seule règle qui sache trancher.
   *
   * ⚠️ **La variation est celle depuis l'achat, et non celle du jour.** `total_pnl_pct` est
   * la seule performance qu'une route publie par portefeuille. Un 24 h demanderait de
   * pondérer les cours de chaque position — faisable, mais c'est un second calcul et une
   * seconde source de désaccord avec ce que la page portefeuille affiche.
   *
   * ⚠️ **Une requête par portefeuille, et une seule fois par identifiant.** Il n'existe pas
   * de route groupée. Le résultat est donc gardé tant que l'en-tête vit — il ne se démonte
   * pas d'une page à l'autre —, si bien que rouvrir la palette ne redemande rien.
   */
  const [chiffresPf, setChiffresPf] = useState<Record<string,
    { valeur: number | null; variation: number | null; lignes: number }>>({});

  useEffect(() => {
    if (!showSearch) return;
    const aLire = portfolios.filter(p => !(String(p.id) in chiffresPf));
    if (!aLire.length) return;
    let annule = false;
    Promise.all(aLire.map(async p => {
      try {
        const r = await fetch(
          `${API_URL}/api/v1/portfolios/${encodeURIComponent(p.id)}/positions`,
          { headers: enTetesAuth() });
        if (!r.ok) throw new Error("refus");
        const d = await r.json();
        return [String(p.id), {
          valeur: Number.isFinite(d?.total_value) ? d.total_value : null,
          variation: Number.isFinite(d?.total_pnl_pct) ? d.total_pnl_pct : null,
          lignes: Array.isArray(d?.positions) ? d.positions.length : 0,
        }] as const;
      } catch {
        /* ⚠️ On garde une entrée vide plutôt que rien : sans elle, le portefeuille
           repasserait dans `aLire` au prochain rendu et l'on redemanderait sans fin une
           route qui refuse. */
        return [String(p.id), { valeur: null, variation: null, lignes: 0 }] as const;
      }
    })).then(lots => {
      if (annule) return;
      setChiffresPf(t => ({ ...t, ...Object.fromEntries(lots) }));
    });
    return () => { annule = true; };
  }, [showSearch, portfolios, chiffresPf]);

  const displayAssets = localSearch ? searchResults.filter(a => category === "all" || a.type === category) : filteredAssets.slice(0, displayCount);

  /**
   * Ce que la palette propose, en une seule suite.
   *
   * ⚠️ **Deux listes rendues à la file n'en font pas une pour le clavier.** Les
   * portefeuilles et les actifs s'affichaient l'un sous l'autre, mais `highlightIndex`
   * n'indexait que les actifs : les flèches sautaient les portefeuilles, et l'entrée ne
   * pouvait pas en ouvrir un. Ce qu'on voit doit être ce qu'on parcourt — d'où une suite
   * unique, dont l'ordre d'affichage *est* l'ordre de navigation.
   *
   * ⚠️ **La catégorie décide ce qui entre, pas ce qui se colore.** « Portefeuilles » écarte
   * les actifs, les quatre autres écartent les portefeuilles ; « Tous » garde les deux. Un
   * filtre qui laisserait la liste entière en grisant les exclus obligerait à les parcourir
   * pour les ignorer.
   */
  const resultats = useMemo(() => [
    ...(category === "all" || category === "PORTEFEUILLE"
      ? portefeuillesTrouves.map(p => ({ genre: "portefeuille" as const, cle: `p:${p.id}`, p }))
      : []),
    ...(category === "PORTEFEUILLE"
      ? []
      : displayAssets.map(a => ({ genre: "actif" as const, cle: `a:${a.ticker}`, a }))),
  ], [category, portefeuillesTrouves, displayAssets]);

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

  /**
   * Ouvrir un résultat, quel qu'il soit.
   *
   * ⚠️ **L'entrée n'ouvrait rien, elle se contentait de retenir l'actif.** Elle appelait
   * `setActiveAsset` et refermait : le contexte changeait, la page ne bougeait pas. Sur la
   * page graphique, la navigation se faisait bien — mais dans `handleSelect`, et sous la
   * condition `isChartPage`. Autrement dit, chercher un actif depuis la carte ou la
   * simulation le sélectionnait sans jamais le montrer. Relevé à l'usage.
   *
   * ⚠️ **Le contexte est posé avant la navigation, et il le faut.** La page graphique lit
   * l'actif actif au montage ; naviguer d'abord la ferait s'ouvrir sur le précédent, le
   * temps d'un rendu.
   */
  const ouvrirResultat = useCallback((r: { genre: "portefeuille"; p: Portefeuille }
    | { genre: "actif"; a: Asset }) => {
    if (r.genre === "portefeuille") { ouvrirPortefeuille(r.p); return; }
    setActiveAsset({ ticker: r.a.ticker, name: r.a.name });
    setLocalSearch("");
    fermerPalette();
    router.push(`/chart?ticker=${encodeURIComponent(r.a.ticker)}`);
  }, [ouvrirPortefeuille, setActiveAsset, fermerPalette, router]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSearch) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlightIndex(i => Math.min(i + 1, resultats.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlightIndex(i => Math.max(i - 1, -1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const r = resultats[highlightIndex];
      if (r) ouvrirResultat(r);
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
      {/**
        * ⚠️ **Il porte la même surface que le champ qu'il ouvre.** Il avait son propre aplat
        * — `segmentPiste` —, aucun liseré, et un rayon de 14 choisi ici : trois valeurs qui
        * ne se retrouvaient nulle part ailleurs, pour un objet qui annonce précisément un
        * champ de saisie. `.novac-surface-saisie` lui donne le fond, le liseré transparent
        * qui se colore au survol et le creusement au clic — la même réponse au geste que le
        * champ de la palette. Relevé à l'usage.
        *
        * ⚠️ **Le fond n'est plus posé en ligne, et il ne peut pas l'être.** La classe porte
        * le repos autant que le survol ; une règle en ligne l'emporterait sur elle, et le
        * survol ne ferait plus rien. C'est la même contrainte que `.novac-bouton-doux`, dont
        * le commentaire de `globals.css` dit déjà pourquoi.
        */}
      <button type="button" onClick={() => setShowSearch(true)}
        className="novac-surface-saisie"
        aria-label="Rechercher un actif, un ETF, un indice"
        style={{
          position:"fixed", top:"12px", right:"20px", zIndex:50, width:"320px",
          display:"flex", alignItems:"center", gap:"8px", height:"36px", padding:"0 12px",
          borderRadius:RAYON_RECHERCHE, boxSizing:"border-box", cursor:"pointer",
          outline:"none", textAlign:"left",
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
          {/**
            * Le champ, en tête.
            *
            * ⚠️ **Une pilule cernée, et non une bande à ras bord.** Il touchait les deux
            * flancs de la fenêtre et ne se distinguait du reste que par le filet du dessous :
            * on lisait un en-tête, pas un endroit où écrire. Sur le concept, c'est un objet
            * posé *dans* la fenêtre — cerné, arrondi, avec de l'air tout autour. La
            * différence n'est pas décorative : c'est elle qui dit « le curseur est ici ».
            *
            * ⚠️ **Le filet du dessous reste, lui.** Il ne cerne plus le champ, il sépare la
            * saisie des résultats — deux rôles que la même ligne tenait, et dont un seul
            * survit à l'encadrement.
            */}
          <div style={{ padding:"14px 14px 12px", borderBottom:`1px solid ${JETONS.bord}` }}>
          {/**
            * ⚠️ **La recette des saisies, et non un rayon choisi ici.** Je l'avais fait plein
            * — une pilule de 999 —, ce qui est la forme des *boutons* d'action, pas celle des
            * champs. L'application a une seule recette pour « on écrit ici » : quarante de
            * haut, `RAYON_SAISIE` d'arrondi, douze de rembourrage, et la surface
            * `.novac-surface-saisie`. Un champ qui invente sa forme est un champ que l'œil
            * range ailleurs. Relevé à l'usage.
            */}
          <div className="novac-surface-saisie" style={{ display:"flex", alignItems:"center",
            gap:"10px", height:HAUTEUR_SAISIE, padding:champ.padding,
            borderRadius:RAYON_RECHERCHE, boxSizing:"border-box" }}>
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
          </div>

          {/**
            * ⚠️ **La rangée de catégories est un `Segments`, et non six boutons.** Elle en
            * était six : un fond bleu à 20 % sur celui qui est pris, un gris sur les autres,
            * un rayon de 6 et un rembourrage écrits sur place — quatre valeurs propres à cette
            * ligne. L'application a pourtant un objet pour cela, celui qui découpe la courbe
            * du graphique, et qui sert déjà quatre fois ailleurs. C'est la même question
            * posée : « lequel de ces découpages regardez-vous ? ». Demandé à l'usage.
            *
            * ⚠️ **`sm`, comme au graphique.** La palette est une fenêtre, pas une barre de
            * section : `md` y donnerait des pastilles plus hautes que les rangées qu'elles
            * filtrent.
            *
            * ⚠️ **La piste peut déborder, et il faut le lui permettre.** Six libellés dans
            * 560 pixels tiennent, mais « Portefeuilles » est long et rien ne garantit qu'un
            * septième découpage tiendrait. Le défilement horizontal est repris du graphique,
            * avec sa marge négative — sans elle, la piste rogne son propre anneau de survol.
            */}
          <div style={{ padding:"10px 14px", borderBottom:`1px solid ${JETONS.bord}`,
            overflowX:"auto", scrollbarWidth:"none" }}>
            <Segments
              taille="sm"
              ariaLabel="Filtrer les résultats"
              valeur={category}
              onChange={v => { setCategory(v); setDisplayCount(20); }}
              options={[
                { valeur: "all", libelle: "Tous" },
                { valeur: "PORTEFEUILLE", libelle: "Portefeuilles" },
                { valeur: "EQUITY", libelle: "Actions" },
                { valeur: "ETF", libelle: "Fonds" },
                { valeur: "INDEX", libelle: "Indices" },
                { valeur: "CRYPTOCURRENCY", libelle: "Crypto" },
              ]}
            />
          </div>

          {/* ⚠️ La liste seule défile, et c'est elle qui porte la hauteur : `flex: 1` sur un
              parent en colonne, plus un plafond, pour que la fenêtre ne grandisse pas au
              rythme des résultats. */}
          <div ref={listRef} onScroll={handleScroll}
            style={{ flex:1, minHeight:0, maxHeight:"46vh", overflowY:"auto", padding:"0 8px 8px" }}>
            {resultats.map((r, i) => {
              /* L'en-tête paraît au premier de chaque genre, et nulle part ailleurs :
                 c'est la suite qui le décide, pas deux blocs écrits à la file. */
              const entete = i === 0 || resultats[i - 1].genre !== r.genre
                ? (r.genre === "portefeuille" ? "PORTEFEUILLES" : localSearch ? null : "POPULAIRES")
                : null;
              return (
                <div key={r.cle}>
                  {entete && (
                    <div style={{ padding:"8px 14px 2px", color:"rgba(255,255,255,0.2)", fontSize:"9px", letterSpacing:"0.12em" }}>{entete}</div>
                  )}
                  {r.genre === "portefeuille" ? (
                    <LignePortefeuille p={r.p} idx={i} focused={i === highlightIndex}
                      actif={String(activePortfolio?.id ?? "") === String(r.p.id)}
                      onSelect={ouvrirPortefeuille} onSupprimer={supprimerPortefeuille}
                      chiffres={chiffresPf[String(r.p.id)]
                        ?? { valeur: null, variation: null, lignes: r.p.assets?.length ?? 0 }} />
                  ) : (
                    <AssetRow a={r.a} highlighted={false} focused={i === highlightIndex}
                      idx={i} price={prices[r.a.ticker]}
                      onSelect={() => ouvrirResultat(r)}/>
                  )}
                </div>
              );
            })}
            {localSearch && resultats.length === 0 && !isSearching && (
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
