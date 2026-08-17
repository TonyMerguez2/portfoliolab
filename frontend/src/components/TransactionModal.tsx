"use client";
import { useEffect, useRef, useState } from "react";
import AssetLogo from "@/components/AssetLogo";
import FenetreModale from "@/components/ui/FenetreModale";
import { FONT } from "@/lib/typography";
import { API_URL as API } from "@/lib/api";


type Side        = "BUY" | "SELL";
type SearchAsset = { ticker: string; name: string; type: string };

/** Une écriture, telle que la saisie la produit — avant tout envoi. */
export type DraftTx = {
  ticker:      string;
  asset_type:  string;
  side:        Side;
  quantity:    number;
  unit_price:  number;
  fees:        number;
  executed_at: string;
  /** Mémo libre, facultatif. */
  note?:       string;
  /** Nom lisible, conservé pour l'affichage des brouillons. */
  name:        string;
};

interface Props {
  /**
   * Portefeuille destinataire. Facultatif : la page de construction saisit des
   * transactions avant que le portefeuille existe, et les remet via `onDraft`.
   */
  portfolioId?:   string;
  isOpen:         boolean;
  onClose:        () => void;
  onSuccess:      () => void;
  prefillTicker?: string;
  /**
   * Actif imposé, quand l'appelant le connaît déjà — évite l'aller-retour de
   * recherche de `prefillTicker`.
   */
  prefillAsset?:  SearchAsset;
  /** Empêche de changer d'actif : la ligne saisie porte sur celui-là. */
  lockAsset?:     boolean;
  /**
   * Reçoit l'écriture au lieu de l'envoyer. Sert à collecter des transactions
   * pour un portefeuille qui n'est pas encore créé.
   */
  onDraft?:       (tx: DraftTx) => void;
  /** Valeurs de départ, pour reprendre une écriture déjà saisie. */
  initialDraft?:  DraftTx | null;
  /**
   * Rendu intégré : le panneau s'affiche dans le flux au lieu de flotter
   * au-dessus d'un voile.
   *
   * C'est la même saisie, au même endroit du code. La page de construction en
   * avait une autre — poids et montant global, une seule date pour tout — qui
   * produisait un prix de revient approché. Deux formulaires pour la même
   * écriture auraient divergé, et le prix de revient avec eux.
   */
  embedded?: boolean;
  /** Masque la croix de fermeture, inutile en rendu intégré. */
  hideClose?: boolean;
  /**
   * Les comptes déclarés **à titres** du portefeuille, parmi lesquels ranger l'écriture.
   *
   * ⚠️ **Une opération se range dans un compte, et ce n'est plus facultatif à l'écran.**
   * Sans compte, elle retombe dans le classement par déduction — deviné d'après la place de
   * cotation, incapable de distinguer deux PEA. Tant que ce classement était le seul, il
   * fallait bien s'en contenter ; depuis qu'un compte peut être déclaré, laisser une ligne
   * sans compte ne fait plus que reporter le rangement.
   *
   * ⚠️ **Les comptes de trésorerie n'y figurent pas.** Sur un livret, le solde *est* la
   * valeur : y ranger un achat compterait la somme deux fois. Le serveur le refuse, mais un
   * choix impossible n'a pas à être proposé.
   */
  comptes?: {
    /** L'identifiant du compte, ou la clé du dossier deviné qu'il faudra déclarer. */
    id: string;
    nom: string;
    couleur: string;
    /**
     * Ce choix est un dossier **deviné** : le retenir le déclarera.
     *
     * ⚠️ **Les dossiers devinés figurent dans la liste, et ce n'est pas un raccourci de
     * confort.** L'écran montre « PEA » et « CTO » sur la vue générale ; répondre ici
     * « vous n'avez déclaré aucun compte » revient à nier ce qu'il vient d'afficher.
     * L'épargnant a bien des comptes — ils sont seulement devinés — et la seule chose qui
     * manquait était de pouvoir les désigner.
     */
    aDeclarer?: boolean;
    /** Combien de lignes la déclaration rattacherait. */
    lignes?: number;
  }[];
  /**
   * Transforme le choix en un identifiant de compte réel, en le déclarant au besoin.
   *
   * ⚠️ **La modale ne sait pas ce que « déclarer » veut dire, et c'est voulu.** Créer un
   * compte puis lui rattacher les lignes d'un dossier est l'affaire de la page ; la saisie
   * n'a qu'à savoir dans quel compte écrire. Sans cette couture, elle aurait dû connaître
   * les genres, les couleurs et la route de rattachement pour poser une opération.
   */
  resoudreLeCompte?: (choix: string) => Promise<string>;
  /**
   * Le compte imposé, quand la saisie part de l'intérieur d'un dossier.
   *
   * ⚠️ **Imposé et montré, jamais imposé en silence.** On ouvre cette saisie depuis un
   * dossier précis ; laisser le choix ouvert inviterait à ranger ailleurs que là où l'on
   * vient de cliquer, et le taire ferait un rangement invisible.
   */
  compteImpose?: { id: string; nom: string; couleur: string };
  /** Ouvre la déclaration d'un compte, quand il n'y en a aucun où ranger l'écriture. */
  onDeclarerCompte?: () => void;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function typeColor(type: string) {
  return {
    bg:     type === "CRYPTOCURRENCY" ? "rgba(245,158,11,0.16)"  : type === "ETF" ? "rgba(139,92,246,0.16)"  : type === "INDEX" ? "rgba(34,211,238,0.14)"  : "rgba(59,130,246,0.16)",
    border: type === "CRYPTOCURRENCY" ? "rgba(245,158,11,0.35)"  : type === "ETF" ? "rgba(139,92,246,0.35)"  : type === "INDEX" ? "rgba(34,211,238,0.32)"  : "rgba(59,130,246,0.35)",
    text:   type === "CRYPTOCURRENCY" ? "#fcd34d"                : type === "ETF" ? "#c4b5fd"                : type === "INDEX" ? "#67e8f9"                 : "#93c5fd",
  };
}

function fmtEur(v: number): string {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

export default function TransactionModal({
  portfolioId, isOpen, onClose, onSuccess, prefillTicker, prefillAsset,
  lockAsset = false, onDraft, initialDraft, embedded = false, hideClose = false,
  comptes = [], compteImpose, onDeclarerCompte, resoudreLeCompte,
}: Props) {
  const [side,           setSide]           = useState<Side>("BUY");
  /**
   * Le compte où ranger l'écriture.
   *
   * ⚠️ **Aucun choix par défaut, même quand il n'y a qu'un compte.** Le préremplir ferait
   * ranger sans y penser, et l'on ne s'en apercevrait qu'au moment où un second compte
   * existe — c'est-à-dire trop tard, avec un historique déjà mal classé.
   */
  const [compteId,       setCompteId]       = useState<string>("");
  const [searchQuery,    setSearchQuery]    = useState("");
  const [searchResults,  setSearchResults]  = useState<SearchAsset[]>([]);
  const [isSearching,    setIsSearching]    = useState(false);
  const [showDrop,       setShowDrop]       = useState(false);
  const [selectedAsset,  setSelectedAsset]  = useState<SearchAsset | null>(null);
  const [quantity,       setQuantity]       = useState("");
  const [unitPrice,      setUnitPrice]      = useState("");
  const [fees,           setFees]           = useState("0");
  const [date,           setDate]           = useState(todayStr);
  const [submitting,     setSubmitting]     = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [heldQty,        setHeldQty]        = useState<number | null>(null);
  const [fetchingPrice,  setFetchingPrice]  = useState(false);
  const [note,           setNote]           = useState("");
  /**
   * Unité de saisie. On raisonne tantôt en titres — « j'ai acheté 5 Apple » —,
   * tantôt en euros — « j'ai mis 500 € sur Apple ». Imposer l'un des deux
   * oblige à sortir la calculatrice ; la quantité manquante se déduit du cours.
   */
  const [saisieEn,       setSaisieEn]       = useState<"quantite" | "montant">("quantite");
  const [montant,        setMontant]        = useState("");
  const [focusedField,   setFocusedField]   = useState<string | null>(null);

  const debounceRef   = useRef<NodeJS.Timeout | undefined>(undefined);
  const searchInputRef = useRef<HTMLInputElement>(null);
  /**
   * Vrai dès que le prix a été saisi à la main. Le cours proposé ne doit plus
   * l'écraser : une transaction réelle se passe rarement au cours de clôture.
   */
  const prixEdite     = useRef(false);


  // ── Escape to close ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [isOpen, onClose]);

  // ── Reset form on open ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    setSearchQuery("");
    setSearchResults([]);
    setShowDrop(false);
    setError(null);
    setHeldQty(null);

    if (initialDraft) {
      setSide(initialDraft.side);
      setSelectedAsset({
        ticker: initialDraft.ticker, type: initialDraft.asset_type, name: initialDraft.name,
      });
      setQuantity(String(initialDraft.quantity));
      setUnitPrice(String(initialDraft.unit_price));
      setFees(String(initialDraft.fees));
      setDate(initialDraft.executed_at.slice(0, 10));
      setNote(initialDraft.note ?? "");
      setSaisieEn("quantite");
      setMontant("");
      prixEdite.current = true;   // le prix repris ne doit pas être écrasé
      return;
    }

    setSide("BUY");
    setSelectedAsset(prefillAsset ?? null);
    setQuantity("");
    setUnitPrice("");
    setFees("0");
    setDate(todayStr());
    setNote("");
    setSaisieEn("quantite");
    setMontant("");
    prixEdite.current = false;
  }, [isOpen, prefillAsset, initialDraft]);

  // ── Prefill ticker ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !prefillTicker || prefillAsset) return;
    fetch(`${API}/api/v1/search?q=${encodeURIComponent(prefillTicker)}`)
      .then(r => r.json())
      .then((d: any) => {
        const results: SearchAsset[] = (d?.results || []).map((x: any) => ({
          ticker: x.ticker, type: x.type || "EQUITY", name: x.name || x.ticker,
        }));
        const match = results.find(r => r.ticker === prefillTicker) ?? results[0];
        if (match) setSelectedAsset(match);
      })
      .catch(() => {});
  }, [isOpen, prefillTicker, prefillAsset]);

  // ── Cours proposé, à la date de l'opération ──────────────────────────────────
  //
  // Le prix de revient n'est juste que si le cours retenu est celui du jour de
  // l'achat. Proposer le cours du jour pour une transaction datée de mars
  // dernier fausserait tout le calcul, sans que rien ne le signale.
  useEffect(() => {
    if (!isOpen || !selectedAsset || prixEdite.current) return;
    let annule = false;
    setFetchingPrice(true);
    fetch(`${API}/api/v1/price-at?tickers=${encodeURIComponent(selectedAsset.ticker)}&date=${date}`)
      .then(r => r.json())
      .then((d: any) => {
        if (annule || prixEdite.current) return;
        const p = d?.[selectedAsset.ticker];
        if (typeof p === "number" && p > 0) setUnitPrice(p >= 1 ? p.toFixed(2) : p.toFixed(6));
      })
      .catch(() => {})
      .finally(() => { if (!annule) setFetchingPrice(false); });
    return () => { annule = true; };
  }, [isOpen, selectedAsset, date]);

  // ── Search debounce ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery) { setSearchResults([]); setIsSearching(false); return; }
    setIsSearching(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`${API}/api/v1/search?q=${encodeURIComponent(searchQuery)}`);
        const d = await r.json();
        const items: SearchAsset[] = (d?.results || []).map((x: any) => ({
          ticker: x.ticker, type: x.type || "EQUITY", name: x.name || x.ticker,
        }));
        setSearchResults(items.slice(0, 8));
        setShowDrop(true);
      } catch {} finally { setIsSearching(false); }
    }, 300);
  }, [searchQuery]);

  // ── Held quantity (SELL only) ────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedAsset || side !== "SELL" || !portfolioId) { setHeldQty(null); return; }
    const token = localStorage.getItem("novac_token");
    if (!token) return;
    fetch(`${API}/api/v1/portfolios/${portfolioId}/positions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => {
        const pos = (d?.positions || []).find((p: any) => p.ticker === selectedAsset.ticker);
        setHeldQty(pos?.quantity ?? null);
      })
      .catch(() => setHeldQty(null));
  }, [selectedAsset, side, portfolioId]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function pickAsset(asset: SearchAsset) {
    setSelectedAsset(asset);
    setSearchQuery("");
    setShowDrop(false);
    setSearchResults([]);
    setUnitPrice("");
    prixEdite.current = false;   // le cours du nouvel actif reprend la main
  }

  function clearAsset() {
    setSelectedAsset(null);
    setHeldQty(null);
    setUnitPrice("");
    prixEdite.current = false;
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }

  // ── Computed ─────────────────────────────────────────────────────────────────
  /**
   * ⚠️ **Le compte imposé se réapplique à chaque ouverture.** L'état survit au démontage —
   * le panneau se cache, il ne se démonte pas — si bien qu'ouvrir la saisie depuis un
   * dossier après l'avoir ouverte depuis un autre aurait gardé le premier compte.
   */
  useEffect(() => {
    if (!isOpen) return;
    setCompteId(compteImpose?.id ?? "");
  }, [isOpen, compteImpose?.id]);

  const price    = parseFloat(unitPrice.replace(",", ".")) || 0;
  const feesVal  = parseFloat(fees.replace(",", "."))      || 0;
  const montantVal = parseFloat(montant.replace(",", ".")) || 0;
  // En mode « montant », la quantité se déduit du cours retenu. Sans cours, on
  // ne peut pas conclure : mieux vaut zéro qu'une division par zéro.
  const qty      = saisieEn === "quantite"
    ? (parseFloat(quantity) || 0)
    : (price > 0 ? montantVal / price : 0);
  const total    = qty * price + feesVal;
  /**
   * ⚠️ **Le compte n'est exigé que sur le chemin qui écrit en base.** Le brouillon sert la
   * création d'un portefeuille : il n'existe pas encore, donc il n'a aucun compte, et
   * l'exiger là rendrait toute création impossible. C'est la même raison qui interdit de
   * rendre `compte_id` obligatoire côté serveur.
   */
  const compteRequis = !onDraft;
  const choixCompte = comptes.find(c => c.id === compteId);
  const isValid  = !!selectedAsset && qty > 0 && price > 0
    && (!compteRequis || !!compteId);

  const accentColor  = side === "BUY" ? "#4ade80"              : "#f87171";
  const accentBg     = side === "BUY" ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)";
  const accentBorder = side === "BUY" ? "rgba(74,222,128,0.40)" : "rgba(248,113,113,0.40)";

  // ── Submit ───────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!isValid || submitting) return;

    // Portefeuille pas encore créé : on remet l'écriture à l'appelant.
    if (onDraft) {
      onDraft({
        ticker:      selectedAsset!.ticker,
        asset_type:  selectedAsset!.type,
        name:        selectedAsset!.name,
        side,
        quantity:    qty,
        unit_price:  price,
        fees:        feesVal,
        executed_at: `${date}T00:00:00`,
        note:        note.trim() || undefined,
      });
      onSuccess();
      return;
    }

    const token = localStorage.getItem("novac_token");
    if (!token) { setError("Vous devez être connecté pour enregistrer une transaction."); return; }
    setSubmitting(true);
    setError(null);
    try {
      /**
       * ⚠️ **Le compte est résolu avant l'écriture, et son échec arrête tout.** Choisir un
       * dossier deviné le déclare : si cette déclaration manque, poster l'opération quand
       * même la laisserait sans compte — c'est-à-dire exactement ce que l'écran vient
       * d'interdire, mais en silence et après coup.
       */
      const compteFinal = resoudreLeCompte ? await resoudreLeCompte(compteId) : compteId;
      const res = await fetch(`${API}/api/v1/portfolios/${portfolioId}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ticker:      selectedAsset!.ticker,
          asset_type:  selectedAsset!.type,
          side,
          quantity:    qty,
          unit_price:  price,
          fees:        feesVal,
          executed_at: `${date}T00:00:00`,
          note:        note.trim() || null,
          compte_id:   compteFinal || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || `Erreur ${res.status}`);
      }
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Enter key on card ────────────────────────────────────────────────────────
  function handleCardKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && isValid && !submitting && !showDrop) handleSubmit();
  }

  if (!isOpen) return null;

  // ── Render ───────────────────────────────────────────────────────────────────
  function inputStyle(field: string): React.CSSProperties {
    return {
      width: "100%", background: "rgba(255,255,255,0.06)",
      border: `1px solid ${focusedField === field ? "rgba(91,141,239,0.50)" : "rgba(255,255,255,0.10)"}`,
      borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "#F8F9FC",
      fontFamily: FONT, boxSizing: "border-box",
      transition: "border-color 160ms", outline: "none",
    };
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
    color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 6,
  };

  const ticker  = selectedAsset?.ticker ?? "—";
  // Une quantité déduite d'un montant tombe rarement rond : 1 000 € d'Apple
  // font 3,237188825224175 titres, qu'il ne sert à rien d'afficher en entier.
  const qtyLisible = qty.toLocaleString("fr-FR", { maximumFractionDigits: 8 });
  const btnLabel = submitting
    ? "Enregistrement…"
    : `${side === "BUY" ? "Acheter" : "Vendre"}${qty > 0 ? ` ${qtyLisible}` : ""} ${ticker}${isValid ? ` pour ${fmtEur(total)}` : ""}`;

  const contenu = (
        <div style={{ padding: embedded ? 0 : "20px 24px 24px" }}>

          {/* ── Header ──────────────────────────────────────────────────────── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#F8F9FC", letterSpacing: "0.02em" }}>
              Nouvelle transaction
            </span>
            {!hideClose && (
              <button
                onClick={onClose}
                style={{
                  background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 8, color: "rgba(255,255,255,0.50)", width: 28, height: 28,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, lineHeight: 1, flexShrink: 0,
                }}
              >✕</button>
            )}
          </div>

          {/* ── Error banner ─────────────────────────────────────────────────── */}
          {error && (
            <div style={{
              marginBottom: 16, padding: "10px 14px", borderRadius: 10,
              background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.25)",
              color: "#f87171", fontSize: 12, lineHeight: 1.55,
            }}>
              {error}
            </div>
          )}

          {/* ── Side toggle ──────────────────────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 20 }}>
            {(["BUY", "SELL"] as Side[]).map(s => {
              const active   = side === s;
              const col      = s === "BUY" ? "#4ade80"               : "#f87171";
              const activeBg = s === "BUY" ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)";
              const actBord  = s === "BUY" ? "rgba(74,222,128,0.40)" : "rgba(248,113,113,0.40)";
              return (
                <button key={s} onClick={() => setSide(s)} style={{
                  padding: "10px", borderRadius: 10,
                  border: `1px solid ${active ? actBord : "rgba(255,255,255,0.09)"}`,
                  background: active ? activeBg : "rgba(255,255,255,0.04)",
                  color: active ? col : "rgba(255,255,255,0.35)",
                  fontSize: 13, fontWeight: active ? 700 : 500, fontFamily: FONT,
                  cursor: "pointer", transition: "all 160ms ease", letterSpacing: "0.04em",
                }}>
                  {s === "BUY" ? "↑ Achat" : "↓ Vente"}
                </button>
              );
            })}
          </div>

          {/* ── Asset search ─────────────────────────────────────────────────── */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>ACTIF</label>

            {selectedAsset ? (
              /* Selected pill */
              <div style={{
                display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                borderRadius: 10, background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.10)",
              }}>
                {(() => { const tc = typeColor(selectedAsset.type); return (
                  <AssetLogo ticker={selectedAsset.ticker} type={selectedAsset.type} size={24} radius={6}
                    fallbackBg={tc.bg} fallbackBorder={tc.border} fallbackTextColor={tc.text}/>
                ); })()}
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#F8F9FC" }}>
                  {selectedAsset.ticker}
                </span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
                  {selectedAsset.name}
                </span>
                {fetchingPrice && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.30)" }}>…</span>}
                {!lockAsset && (
                  <button
                    onClick={clearAsset}
                    style={{
                      background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 6, color: "rgba(255,255,255,0.45)", width: 22, height: 22,
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, flexShrink: 0,
                    }}
                  >×</button>
                )}
              </div>
            ) : (
              /* Search input */
              <div style={{ position: "relative" }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "9px 12px",
                  borderRadius: 10, background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.10)", cursor: "text",
                }} onClick={() => searchInputRef.current?.focus()}>
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    style={{ color: "rgba(255,255,255,0.28)", flexShrink: 0 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
                  </svg>
                  <input
                    ref={searchInputRef}
                    className="tx-input"
                    value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); setShowDrop(true); }}
                    onFocus={() => searchQuery && setShowDrop(true)}
                    onBlur={() => setTimeout(() => setShowDrop(false), 150)}
                    placeholder="Rechercher un actif…"
                    autoFocus
                    style={{ background: "transparent", border: "none", outline: "none", color: "#F8F9FC", fontSize: 12, flex: 1, fontFamily: FONT }}
                  />
                  {isSearching && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.28)" }}>…</span>}
                </div>

                {/* Dropdown */}
                {showDrop && searchResults.length > 0 && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 10,
                    background: "rgba(4,17,36,0.98)", border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: 10, overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
                  }}>
                    {searchResults.map((a, i) => {
                      const tc = typeColor(a.type);
                      return (
                        <div
                          key={a.ticker}
                          onMouseDown={() => pickAsset(a)}
                          style={{
                            display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                            cursor: "pointer",
                            borderBottom: i < searchResults.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                          <AssetLogo ticker={a.ticker} type={a.type} size={22} radius={5}
                            fallbackBg={tc.bg} fallbackBorder={tc.border} fallbackTextColor={tc.text}/>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#F8F9FC", minWidth: 56 }}>{a.ticker}</span>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                          <span style={{ fontSize: 9, color: tc.text, background: `${tc.text}18`, borderRadius: 4, padding: "2px 6px", fontWeight: 700, letterSpacing: "0.08em", flexShrink: 0 }}>
                            {a.type}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Saisie principale : quantité ou montant ──────────────────────── */}
          <div style={{
            marginBottom: 14, padding: "14px 16px", borderRadius: 12,
            background: "rgba(255,255,255,0.05)",
            border: `1px solid ${focusedField === "hero" ? "rgba(91,141,239,0.45)" : "rgba(255,255,255,0.09)"}`,
            transition: "border-color 160ms",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="number"
                value={saisieEn === "quantite" ? quantity : montant}
                onChange={e => saisieEn === "quantite" ? setQuantity(e.target.value) : setMontant(e.target.value)}
                onFocus={() => setFocusedField("hero")} onBlur={() => setFocusedField(null)}
                min={0} step="any" placeholder="0"
                style={{
                  flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none",
                  color: "#F8F9FC", fontSize: 30, fontWeight: 600, fontFamily: FONT,
                  letterSpacing: "-0.02em", padding: 0,
                }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.45)", flexShrink: 0 }}>
                {saisieEn === "quantite" ? (selectedAsset?.ticker ?? "—") : "€"}
              </span>
              {/* Bascule d'unité : on raisonne en titres ou en euros selon le jour. */}
              <button
                onClick={() => {
                  // On convertit pour que le basculement ne perde pas la saisie.
                  if (saisieEn === "quantite") {
                    setMontant(qty > 0 && price > 0 ? String(+(qty * price).toFixed(2)) : "");
                    setSaisieEn("montant");
                  } else {
                    setQuantity(qty > 0 ? String(+qty.toFixed(8)) : "");
                    setSaisieEn("quantite");
                  }
                }}
                title={saisieEn === "quantite" ? "Saisir un montant en euros" : "Saisir un nombre de titres"}
                style={{
                  flexShrink: 0, width: 30, height: 30, borderRadius: 8,
                  background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.11)",
                  color: "rgba(255,255,255,0.55)", cursor: "pointer", fontSize: 13, lineHeight: 1,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >⇅</button>
            </div>
            {/* L'autre unité, en lecture : ce que la saisie implique. */}
            <div style={{ marginTop: 4, fontSize: 11, color: "rgba(255,255,255,0.32)", fontFamily: FONT }}>
              {qty > 0 && price > 0
                ? (saisieEn === "quantite"
                    ? `≈ ${fmtEur(qty * price)}`
                    : `≈ ${qty.toLocaleString("fr-FR", { maximumFractionDigits: 8 })} ${selectedAsset?.ticker ?? ""}`)
                : saisieEn === "quantite" ? "Nombre de titres" : "Montant investi"}
            </div>
            {side === "SELL" && selectedAsset && (
              <div style={{ marginTop: 6, fontSize: 10, color: "rgba(255,255,255,0.28)", fontFamily: FONT }}>
                Détenu : {heldQty !== null ? heldQty.toLocaleString("fr-FR", { maximumFractionDigits: 8 }) : "—"}
              </div>
            )}
          </div>

          {/* ── Détails ──────────────────────────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>

            {/* Date — aujourd'hui par défaut ; la changer change le cours. */}
            <div>
              <label style={labelStyle}>DATE</label>
              <input
                type="date"
                value={date} onChange={e => setDate(e.target.value)}
                onFocus={() => setFocusedField("date")} onBlur={() => setFocusedField(null)}
                max={todayStr()}
                style={{ ...inputStyle("date"), colorScheme: "dark" as const, fontFamily: FONT }}
              />
              <div style={{ marginTop: 5, fontSize: 10, color: "rgba(255,255,255,0.28)", fontFamily: FONT }}>
                {date === todayStr() ? "Aujourd'hui — cours du jour" : "Cours de clôture de ce jour"}
              </div>
            </div>

            {/* Prix unitaire */}
            <div>
              <label style={labelStyle}>PRIX UNITAIRE (€)</label>
              <input
                type="number"
                value={unitPrice}
                onChange={e => { prixEdite.current = true; setUnitPrice(e.target.value); }}
                onFocus={() => setFocusedField("price")} onBlur={() => setFocusedField(null)}
                min={0} step="any"
                placeholder={fetchingPrice ? "…" : "0,00"}
                style={inputStyle("price")}
              />
              {prixEdite.current && (
                <div style={{ marginTop: 5, fontSize: 10, color: "rgba(255,255,255,0.28)", fontFamily: FONT }}>
                  Saisi à la main
                </div>
              )}
            </div>

            {/* Frais */}
            <div>
              <label style={labelStyle}>FRAIS (€)</label>
              <input
                type="number"
                value={fees} onChange={e => setFees(e.target.value)}
                onFocus={() => setFocusedField("fees")} onBlur={() => setFocusedField(null)}
                min={0} step="any" placeholder="0"
                style={inputStyle("fees")}
              />
            </div>

            {/* Note */}
            <div>
              <label style={labelStyle}>NOTE</label>
              <input
                type="text"
                value={note} onChange={e => setNote(e.target.value)}
                onFocus={() => setFocusedField("note")} onBlur={() => setFocusedField(null)}
                placeholder="PEA, arbitrage…"
                maxLength={120}
                style={inputStyle("note")}
              />
            </div>

            {/**
              * Le compte où ranger l'écriture.
              *
              * ⚠️ **Trois cas, et le troisième est celui qu'on oublie.** Un compte imposé —
              * la saisie part de l'intérieur d'un dossier — se montre sans se changer. Une
              * liste de comptes se choisit. Et quand il n'y en a aucun, un bouton éteint et
              * muet serait le pire des trois : on ne saurait ni pourquoi ni quoi faire. On
              * dit donc ce qui manque, et on offre de le créer.
              */}
            {compteRequis && (
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>COMPTE</label>
                {compteImpose ? (
                  <div style={{
                    ...inputStyle("compte"),
                    display: "flex", alignItems: "center", gap: 8,
                    color: "rgba(255,255,255,0.92)",
                  }}>
                    <span style={{
                      width: 9, height: 9, borderRadius: "50%", flexShrink: 0,
                      background: compteImpose.couleur,
                    }} />
                    {compteImpose.nom}
                  </div>
                ) : comptes.length > 0 ? (
                  <select
                    value={compteId} onChange={e => setCompteId(e.target.value)}
                    onFocus={() => setFocusedField("compte")} onBlur={() => setFocusedField(null)}
                    style={inputStyle("compte")}>
                    {/* ⚠️ Une option vide et sélectionnée par défaut, plutôt que le premier
                        compte : préremplir ferait ranger sans y penser, et l'on ne s'en
                        apercevrait qu'une fois un second compte ouvert — trop tard, avec un
                        historique déjà mal classé. */}
                    <option value="">Choisissez un compte…</option>
                    {comptes.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.nom}{c.aDeclarer ? " — à déclarer" : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div style={{
                    padding: "10px 12px", borderRadius: 10, fontSize: 12, lineHeight: 1.5,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    color: "rgba(255,255,255,0.72)",
                  }}>
                    Une opération se range dans un compte, et vous n’en avez pas encore
                    déclaré.
                    {onDeclarerCompte && (
                      <button type="button" onClick={onDeclarerCompte}
                        style={{
                          display: "block", marginTop: 8, padding: 0, background: "none",
                          border: "none", cursor: "pointer", font: "inherit",
                          color: "#4ade80", textDecoration: "underline",
                        }}>
                        Déclarer un compte
                      </button>
                    )}
                  </div>
                )}
                {/**
                  * ⚠️ **Ce que le choix entraîne, dit avant d'enregistrer.** Retenir un
                  * dossier deviné le déclare : cela crée un compte et lui rattache ses
                  * lignes. C'est le bon geste — il évite un détour par un autre écran — mais
                  * il est bien plus lourd que « ranger cette opération », et le découvrir
                  * après coup serait le pire des deux mondes.
                  */}
                {choixCompte?.aDeclarer && (
                  <div style={{
                    marginTop: 6, fontSize: 11, lineHeight: 1.45,
                    color: "rgba(255,255,255,0.62)",
                  }}>
                    Ce dossier est deviné : l’enregistrer le déclarera comme compte
                    {choixCompte.lignes ? `, avec ses ${choixCompte.lignes} ligne${
                      choixCompte.lignes > 1 ? "s" : ""}` : ""}. Vous pourrez le renommer
                    ensuite.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Live recap ───────────────────────────────────────────────────── */}
          <div style={{
            padding: "10px 14px", borderRadius: 10, marginBottom: 16,
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.30)", fontFamily: FONT }}>
                {qty > 0 && price > 0
                  ? `${qtyLisible} × ${price}${feesVal > 0 ? ` + ${feesVal}` : ""} =`
                  : "Total :"}
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, fontFamily: FONT, color: isValid ? accentColor : "rgba(255,255,255,0.22)" }}>
                {isValid ? fmtEur(total) : "—"}
              </span>
            </div>
          </div>

          {/* ── Submit ───────────────────────────────────────────────────────── */}
          <button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            style={{
              width: "100%", padding: "13px", borderRadius: 12,
              border: `1px solid ${isValid ? accentBorder : "rgba(255,255,255,0.08)"}`,
              background: isValid ? accentBg : "rgba(255,255,255,0.04)",
              color: isValid ? accentColor : "rgba(255,255,255,0.22)",
              fontSize: 13, fontWeight: 700, fontFamily: FONT,
              cursor: isValid && !submitting ? "pointer" : "not-allowed",
              opacity: submitting ? 0.6 : 1,
              transition: "all 200ms ease", letterSpacing: "0.02em",
            }}
          >
            {btnLabel}
          </button>

        </div>
  );

  if (embedded) return contenu;

  /**
   * ⚠️ **La fenêtre est celle de tout le monde, elle n'a plus la sienne.** Elle portait un
   * fond translucide bleuté, un bord blanc à 10 %, un rayon de 16, une ombre écrite à la
   * main et un flou de 32 — cinq valeurs qui ne se retrouvaient nulle part ailleurs dans
   * l'application. Le cadre double de la page les remplace toutes.
   *
   * ⚠️ **Son animation en JavaScript disparaît avec.** Elle existait « pour éviter un
   * `<style>` global », ce qui était la bonne objection au moment de l'écrire ; la feuille
   * globale porte désormais ces images-clés pour les trois fenêtres, et un état React
   * remis à zéro à chaque ouverture ne rend plus service à personne. Ce qu'on y gagne :
   * `prefers-reduced-motion` s'applique enfin ici aussi, ce qu'un `transition` en ligne ne
   * savait pas faire.
   *
   * ⚠️ **`handleCardKey` reste sur le contenu**, et non sur le voile : il sert aux touches
   * de la saisie, pas à la fermeture, que la coquille prend en charge.
   */
  return (
    <FenetreModale onFermer={onClose} largeur={440} zIndex={200}
      etiquette="Saisir une opération"
      style={{ padding: "20px 24px 24px", fontFamily: FONT }}>
      <div onKeyDown={handleCardKey} style={{ display: "contents" }}>
        {contenu}
      </div>
    </FenetreModale>
  );
}
