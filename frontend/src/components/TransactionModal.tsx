"use client";
import { useEffect, useRef, useState } from "react";
import AssetLogo from "@/components/AssetLogo";

const API       = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const FONT      = "'Inter', 'SF Pro Display', system-ui, sans-serif";
const FONT_MONO = "'SF Mono', 'Fira Code', monospace";

type Side        = "BUY" | "SELL";
type SearchAsset = { ticker: string; name: string; type: string };

interface Props {
  portfolioId:    string;
  isOpen:         boolean;
  onClose:        () => void;
  onSuccess:      () => void;
  prefillTicker?: string;
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

export default function TransactionModal({ portfolioId, isOpen, onClose, onSuccess, prefillTicker }: Props) {
  const [side,           setSide]           = useState<Side>("BUY");
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
  const [focusedField,   setFocusedField]   = useState<string | null>(null);
  const [cardVisible,    setCardVisible]    = useState(false);

  const debounceRef   = useRef<NodeJS.Timeout>();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Animation d'entrée (remplace le @keyframes CSS) ─────────────────────────
  useEffect(() => {
    if (!isOpen) { setCardVisible(false); return; }
    const raf = requestAnimationFrame(() => setCardVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

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
    setSide("BUY");
    setSearchQuery("");
    setSearchResults([]);
    setShowDrop(false);
    setSelectedAsset(null);
    setQuantity("");
    setUnitPrice("");
    setFees("0");
    setDate(todayStr());
    setError(null);
    setHeldQty(null);
  }, [isOpen]);

  // ── Prefill ticker ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !prefillTicker) return;
    fetch(`${API}/api/v1/search?q=${encodeURIComponent(prefillTicker)}`)
      .then(r => r.json())
      .then(async (d: any) => {
        const results: SearchAsset[] = (d?.results || []).map((x: any) => ({
          ticker: x.ticker, type: x.type || "EQUITY", name: x.name || x.ticker,
        }));
        const match = results.find(r => r.ticker === prefillTicker) ?? results[0];
        if (!match) return;
        setSelectedAsset(match);
        await prefetchPrice(match.ticker);
      })
      .catch(() => {});
  }, [isOpen, prefillTicker]); // eslint-disable-line

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
    if (!selectedAsset || side !== "SELL") { setHeldQty(null); return; }
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
  async function prefetchPrice(ticker: string) {
    setFetchingPrice(true);
    try {
      const r = await fetch(`${API}/api/v1/prices?tickers=${encodeURIComponent(ticker)}&period=1d`);
      const d = await r.json();
      const item = (d || []).find((x: any) => x.symbol === ticker);
      if (item?.price && item.price > 0) {
        const p = item.price as number;
        setUnitPrice(p >= 1 ? p.toFixed(2) : p.toFixed(6));
      }
    } catch {} finally { setFetchingPrice(false); }
  }

  async function pickAsset(asset: SearchAsset) {
    setSelectedAsset(asset);
    setSearchQuery("");
    setShowDrop(false);
    setSearchResults([]);
    setUnitPrice("");
    await prefetchPrice(asset.ticker);
  }

  function clearAsset() {
    setSelectedAsset(null);
    setHeldQty(null);
    setUnitPrice("");
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }

  // ── Computed ─────────────────────────────────────────────────────────────────
  const qty      = parseFloat(quantity)  || 0;
  const price    = parseFloat(unitPrice.replace(",", ".")) || 0;
  const feesVal  = parseFloat(fees.replace(",", "."))      || 0;
  const total    = qty * price + feesVal;
  const isValid  = !!selectedAsset && qty > 0 && price > 0;

  const accentColor  = side === "BUY" ? "#4ade80"              : "#f87171";
  const accentBg     = side === "BUY" ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)";
  const accentBorder = side === "BUY" ? "rgba(74,222,128,0.40)" : "rgba(248,113,113,0.40)";

  // ── Submit ───────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!isValid || submitting) return;
    const token = localStorage.getItem("novac_token");
    if (!token) { setError("Vous devez être connecté pour enregistrer une transaction."); return; }
    setSubmitting(true);
    setError(null);
    try {
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
      fontFamily: FONT_MONO, boxSizing: "border-box",
      transition: "border-color 160ms", outline: "none",
    };
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
    color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 6,
  };

  const ticker  = selectedAsset?.ticker ?? "—";
  const btnLabel = submitting
    ? "Enregistrement…"
    : `${side === "BUY" ? "Acheter" : "Vendre"}${qty > 0 ? ` ${qty}` : ""} ${ticker}${isValid ? ` pour ${fmtEur(total)}` : ""}`;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.60)",
          backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
        }}
      />

      {/* Card — animation JS fade+scale pour éviter le <style> global */}
      <div
        onKeyDown={handleCardKey}
        onClick={e => e.stopPropagation()}
        style={{
          position: "fixed", top: "50%", left: "50%", zIndex: 201,
          transform: `translate(-50%,-50%) scale(${cardVisible ? 1 : 0.97})`,
          opacity: cardVisible ? 1 : 0,
          transition: "opacity 180ms ease, transform 180ms cubic-bezier(0.34,1,0.56,1)",
          width: 440, maxWidth: "calc(100vw - 32px)",
          background: "rgba(4,17,36,0.97)",
          border: "1px solid rgba(255,255,255,0.10)",
          backdropFilter: "blur(32px)", WebkitBackdropFilter: "blur(32px)",
          borderRadius: 16,
          boxShadow: "0 32px 80px rgba(0,0,0,0.65), 0 1px 0 rgba(255,255,255,0.07) inset",
          fontFamily: FONT,
        }}
      >
        <div style={{ padding: "20px 24px 24px" }}>

          {/* ── Header ──────────────────────────────────────────────────────── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#F8F9FC", letterSpacing: "0.02em" }}>
              Nouvelle transaction
            </span>
            <button
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 8, color: "rgba(255,255,255,0.50)", width: 28, height: 28,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, lineHeight: 1, flexShrink: 0,
              }}
            >✕</button>
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
                <button
                  onClick={clearAsset}
                  style={{
                    background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: 6, color: "rgba(255,255,255,0.45)", width: 22, height: 22,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, flexShrink: 0,
                  }}
                >×</button>
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

          {/* ── Fields 2-col grid ────────────────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>

            {/* Quantité */}
            <div>
              <label style={labelStyle}>QUANTITÉ</label>
              <input
                type="number"
                value={quantity} onChange={e => setQuantity(e.target.value)}
                onFocus={() => setFocusedField("qty")} onBlur={() => setFocusedField(null)}
                min={0} step="any" placeholder="0"
                style={inputStyle("qty")}
              />
              {side === "SELL" && selectedAsset && (
                <div style={{ marginTop: 5, fontSize: 10, color: "rgba(255,255,255,0.28)", fontFamily: FONT_MONO }}>
                  Détenu : {heldQty !== null ? heldQty.toLocaleString("fr-FR", { maximumFractionDigits: 8 }) : "—"}
                </div>
              )}
            </div>

            {/* Prix unitaire */}
            <div>
              <label style={labelStyle}>PRIX UNITAIRE (€)</label>
              <input
                type="number"
                value={unitPrice} onChange={e => setUnitPrice(e.target.value)}
                onFocus={() => setFocusedField("price")} onBlur={() => setFocusedField(null)}
                min={0} step="any"
                placeholder={fetchingPrice ? "…" : "0,00"}
                style={inputStyle("price")}
              />
            </div>

            {/* Date */}
            <div>
              <label style={labelStyle}>DATE</label>
              <input
                type="date"
                value={date} onChange={e => setDate(e.target.value)}
                onFocus={() => setFocusedField("date")} onBlur={() => setFocusedField(null)}
                max={todayStr()}
                style={{ ...inputStyle("date"), colorScheme: "dark" as const, fontFamily: FONT }}
              />
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
          </div>

          {/* ── Live recap ───────────────────────────────────────────────────── */}
          <div style={{
            padding: "10px 14px", borderRadius: 10, marginBottom: 16,
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.30)", fontFamily: FONT_MONO }}>
                {qty > 0 && price > 0
                  ? `${qty} × ${price}${feesVal > 0 ? ` + ${feesVal}` : ""} =`
                  : "Total :"}
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, fontFamily: FONT_MONO, color: isValid ? accentColor : "rgba(255,255,255,0.22)" }}>
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
      </div>
    </>
  );
}
