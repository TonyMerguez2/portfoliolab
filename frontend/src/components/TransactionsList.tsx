"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import AssetLogo from "@/components/AssetLogo";

const API       = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const FONT      = "'Inter', 'SF Pro Display', system-ui, sans-serif";
const FONT_MONO = "'SF Mono', 'Fira Code', monospace";

type TxSide   = "BUY" | "SELL";
type TxPeriod = "all" | "7j" | "30j" | "3m" | "1a";

interface Transaction {
  id:           number;
  portfolio_id: string;
  ticker:       string;
  asset_type:   string;
  side:         TxSide;
  quantity:     number;
  unit_price:   number;
  fees:         number;
  total:        number;
  executed_at:  string;
}

const PERIOD_LABELS: Record<TxPeriod, string> = {
  all: "Tout", "7j": "7 jours", "30j": "30 jours", "3m": "3 mois", "1a": "1 an",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function fmtNum(v: number, min = 2, max = 2) {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: min, maximumFractionDigits: max });
}

function fmtQty(v: number) {
  if (v % 1 === 0) return v.toLocaleString("fr-FR");
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 8 });
}

function assetLabel(t: string) {
  if (t === "CRYPTOCURRENCY") return "Crypto";
  if (t === "ETF")            return "ETF";
  if (t === "INDEX")          return "Indice";
  return "Action";
}

function periodCutoff(p: TxPeriod): Date | null {
  if (p === "all") return null;
  const d = new Date();
  if (p === "7j")  d.setDate(d.getDate() - 7);
  if (p === "30j") d.setDate(d.getDate() - 30);
  if (p === "3m")  d.setDate(d.getDate() - 90);
  if (p === "1a")  d.setFullYear(d.getFullYear() - 1);
  return d;
}

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("novac_token");
}

// Trash icon SVG
function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1.75 3.5h10.5M5.25 3.5V2.625C5.25 2.14 5.64 1.75 6.125 1.75h1.75C8.36 1.75 8.75 2.14 8.75 2.625V3.5m1.75 0-.4375 7.175C10.0375 11.134 9.66 11.5 9.2 11.5H4.8c-.46 0-.8375-.366-.8625-.825L3.5 3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function SkeletonRow({ delay }: { delay: number }) {
  return (
    <tr>
      {[90, 140, 55, 65, 80, 45, 75, 16].map((w, i) => (
        <td key={i} style={{ padding: "12px 14px" }}>
          <div style={{
            height: 10, borderRadius: 4,
            background: "rgba(255,255,255,0.07)",
            animation: "pulse 1.8s ease-in-out infinite",
            animationDelay: `${delay}ms`,
            width: w,
          }} />
        </td>
      ))}
    </tr>
  );
}

const selectStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 8, color: "#F8F9FC", fontSize: 11,
  fontFamily: FONT, padding: "5px 10px",
  cursor: "pointer", outline: "none",
};

interface Props {
  portfolioId:      string;
  refreshKey:       number;
  onNewTransaction: () => void;
}

export default function TransactionsList({ portfolioId, refreshKey, onNewTransaction }: Props) {
  const [transactions,  setTransactions]  = useState<Transaction[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [filterTicker,  setFilterTicker]  = useState("all");
  const [filterSide,    setFilterSide]    = useState<TxSide | "all">("all");
  const [filterPeriod,  setFilterPeriod]  = useState<TxPeriod>("all");
  const [confirmId,     setConfirmId]     = useState<number | null>(null);
  const [deletingId,    setDeletingId]    = useState<number | null>(null);
  const [removingId,    setRemovingId]    = useState<number | null>(null);
  const [hoveredId,     setHoveredId]     = useState<number | null>(null);
  const [trashHovId,    setTrashHovId]    = useState<number | null>(null);
  const [deleteError,   setDeleteError]   = useState<string | null>(null);

  const fetchTx = useCallback(() => {
    if (!portfolioId) return;
    setLoading(true);
    const token = getToken();
    fetch(`${API}/api/v1/portfolios/${portfolioId}/transactions`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then((d: unknown) => setTransactions(Array.isArray(d) ? (d as Transaction[]) : []))
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false));
  }, [portfolioId]);

  useEffect(() => { fetchTx(); }, [fetchTx, refreshKey]);

  const allTickers = useMemo(
    () => Array.from(new Set(transactions.map(t => t.ticker))),
    [transactions],
  );

  const filtered = useMemo(() => {
    let list = transactions;
    if (filterTicker !== "all") list = list.filter(t => t.ticker === filterTicker);
    if (filterSide   !== "all") list = list.filter(t => t.side === filterSide);
    if (filterPeriod !== "all") {
      const cut = periodCutoff(filterPeriod)!;
      list = list.filter(t => new Date(t.executed_at) >= cut);
    }
    return list;
  }, [transactions, filterTicker, filterSide, filterPeriod]);

  const totalInvested = useMemo(() =>
    filtered.filter(t => t.side === "BUY").reduce((s, t) => s + t.total, 0), [filtered]);
  const totalSold = useMemo(() =>
    filtered.filter(t => t.side === "SELL").reduce((s, t) => s + t.total, 0), [filtered]);
  const totalFees = useMemo(() =>
    filtered.reduce((s, t) => s + t.fees, 0), [filtered]);

  const hasFilters = filterTicker !== "all" || filterSide !== "all" || filterPeriod !== "all";
  const isFiltered = filtered.length < transactions.length;

  function resetFilters() {
    setFilterTicker("all"); setFilterSide("all"); setFilterPeriod("all");
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    setDeleteError(null);
    const token = getToken();
    try {
      const res = await fetch(`${API}/api/v1/portfolios/${portfolioId}/transactions/${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        setConfirmId(null);
        setRemovingId(id);
        setTimeout(() => {
          setTransactions(prev => prev.filter(t => t.id !== id));
          setRemovingId(null);
        }, 300);
      } else {
        const err = await res.json().catch(() => ({})) as { detail?: string };
        setDeleteError(err.detail ?? "Suppression impossible");
        setConfirmId(null);
      }
    } catch {
      setDeleteError("Erreur réseau");
      setConfirmId(null);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "10px 10px 0", overflow: "hidden" }}>

      {/* Error banner */}
      {deleteError && (
        <div style={{
          marginBottom: 8, padding: "9px 12px", borderRadius: 8, flexShrink: 0,
          background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.25)",
          color: "#fca5a5", fontSize: 12,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        }}>
          <span>{deleteError}</span>
          <button onClick={() => setDeleteError(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#fca5a5", fontSize: 14, padding: "0 2px", lineHeight: 1 }}>
            ✕
          </button>
        </div>
      )}

      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Transactions</span>
          {!loading && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", fontFamily: FONT_MONO }}>
              {filtered.length} opération{filtered.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <button
          onClick={onNewTransaction}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(91,141,239,0.28)")}
          onMouseLeave={e => (e.currentTarget.style.background = "rgba(91,141,239,0.18)")}
          style={{
            padding: "5px 14px", borderRadius: 8, border: "none", cursor: "pointer",
            fontSize: 11, fontWeight: 700, fontFamily: FONT,
            background: "rgba(91,141,239,0.18)", color: "#9BB9FF",
            borderBottom: "2px solid #5B8DEF", transition: "background 160ms ease",
          }}
        >
          + Nouvelle transaction
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexShrink: 0, flexWrap: "wrap" }}>
        {/* Ticker */}
        <select value={filterTicker} onChange={e => setFilterTicker(e.target.value)} style={selectStyle}>
          <option value="all">Tous les actifs</option>
          {allTickers.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {/* Side — segmented */}
        <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: 3, border: "1px solid rgba(255,255,255,0.07)", gap: 2 }}>
          {(["all", "BUY", "SELL"] as const).map(s => {
            const active = filterSide === s;
            return (
              <button key={s} onClick={() => setFilterSide(s)} style={{
                padding: "3px 10px", borderRadius: 6, border: "none", cursor: "pointer",
                fontSize: 10, fontWeight: active ? 700 : 500, fontFamily: FONT,
                background: active ? "rgba(255,255,255,0.12)" : "transparent",
                color: active ? "#fff" : "rgba(255,255,255,0.35)",
                transition: "all 150ms ease",
              }}>
                {s === "all" ? "Tous" : s === "BUY" ? "Achats" : "Ventes"}
              </button>
            );
          })}
        </div>

        {/* Period */}
        <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value as TxPeriod)} style={selectStyle}>
          {(Object.entries(PERIOD_LABELS) as [TxPeriod, string][]).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>

        {hasFilters && (
          <button
            onClick={resetFilters}
            onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.60)")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.32)")}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 11, color: "rgba(255,255,255,0.32)",
              textDecoration: "underline dotted", fontFamily: FONT, transition: "color 150ms",
            }}
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Synthesis */}
      {!loading && transactions.length > 0 && (
        <div style={{ marginBottom: 8, flexShrink: 0, fontSize: 11, fontFamily: FONT_MONO, color: "rgba(255,255,255,0.28)" }}>
          Total investi&nbsp;: <span style={{ color: "rgba(255,255,255,0.55)" }}>{fmtNum(totalInvested)} €</span>
          <span style={{ margin: "0 8px", opacity: 0.4 }}>·</span>
          Total vendu&nbsp;: <span style={{ color: "rgba(255,255,255,0.55)" }}>{fmtNum(totalSold)} €</span>
          <span style={{ margin: "0 8px", opacity: 0.4 }}>·</span>
          Frais cumulés&nbsp;: <span style={{ color: "rgba(255,255,255,0.55)" }}>{fmtNum(totalFees)} €</span>
        </div>
      )}

      {/* Table */}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", borderRadius: 10, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: FONT }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
            <tr style={{ background: "rgba(4,15,34,0.96)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" } as React.CSSProperties}>
              {(["Date", "Actif", "Type", "Quantité", "Prix unitaire", "Frais", "Total", ""] as const).map((h, i) => (
                <th key={i} style={{
                  padding: "10px 14px",
                  textAlign: (i >= 3 && i <= 6) ? "right" : "left",
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.10em",
                  color: "rgba(255,255,255,0.28)",
                  borderBottom: "1px solid rgba(255,255,255,0.07)",
                  textTransform: "uppercase", whiteSpace: "nowrap", fontFamily: FONT,
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading && Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} delay={i * 90} />)}

            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: "56px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 22, color: "rgba(255,255,255,0.13)", marginBottom: 12, fontFamily: FONT_MONO }}>≣</div>
                  {isFiltered ? (
                    <>
                      <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.38)" }}>
                        Aucune transaction ne correspond aux filtres
                      </p>
                      <button onClick={resetFilters} style={{
                        background: "none", border: "none", cursor: "pointer",
                        fontSize: 11, color: "#9BB9FF", textDecoration: "underline", fontFamily: FONT,
                      }}>
                        Réinitialiser les filtres
                      </button>
                    </>
                  ) : (
                    <>
                      <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.38)" }}>
                        Aucune transaction pour l&apos;instant
                      </p>
                      <p style={{ margin: "0 0 16px", fontSize: 11, color: "rgba(255,255,255,0.20)" }}>
                        Ajoutez votre première opération pour suivre votre P&amp;L réel
                      </p>
                      <button
                        onClick={onNewTransaction}
                        style={{
                          padding: "6px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                          fontSize: 11, fontWeight: 700, fontFamily: FONT,
                          background: "rgba(91,141,239,0.18)", color: "#9BB9FF",
                          borderBottom: "2px solid #5B8DEF",
                        }}
                      >
                        + Nouvelle transaction
                      </button>
                    </>
                  )}
                </td>
              </tr>
            )}

            {!loading && filtered.map(tx => {
              const isRemoving   = removingId  === tx.id;
              const isConfirming = confirmId   === tx.id;
              const isDeleting   = deletingId  === tx.id;
              const isHovered    = hoveredId   === tx.id;
              const isTrashHov   = trashHovId  === tx.id;
              const isBuy        = tx.side === "BUY";

              return (
                <tr
                  key={tx.id}
                  onMouseEnter={() => setHoveredId(tx.id)}
                  onMouseLeave={() => { setHoveredId(null); setTrashHovId(null); }}
                  style={{
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                    background: isHovered ? "rgba(255,255,255,0.03)" : "transparent",
                    opacity: isRemoving ? 0 : 1,
                    transform: isRemoving ? "translateX(-6px)" : "none",
                    transition: "opacity 280ms ease, transform 280ms ease, background 120ms ease",
                  }}
                >
                  {/* Date */}
                  <td style={{ padding: "11px 14px", color: "rgba(255,255,255,0.36)", fontSize: 11, whiteSpace: "nowrap" }}>
                    {fmtDate(tx.executed_at)}
                  </td>

                  {/* Actif */}
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <AssetLogo
                        ticker={tx.ticker}
                        type={tx.asset_type}
                        size={22}
                        fallbackBg="rgba(255,255,255,0.08)"
                        fallbackBorder="rgba(255,255,255,0.14)"
                        fallbackTextColor="rgba(255,255,255,0.55)"
                      />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#F8F9FC" }}>{tx.ticker}</div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", letterSpacing: "0.05em", marginTop: 1 }}>
                          {assetLabel(tx.asset_type)}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Type */}
                  <td style={{ padding: "11px 14px" }}>
                    <span style={{
                      padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, letterSpacing: "0.03em",
                      background: isBuy ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
                      color:      isBuy ? "#4ade80"              : "#f87171",
                      border:     `1px solid ${isBuy ? "rgba(74,222,128,0.22)" : "rgba(248,113,113,0.22)"}`,
                    }}>
                      {isBuy ? "Achat" : "Vente"}
                    </span>
                  </td>

                  {/* Quantité */}
                  <td style={{ padding: "11px 14px", textAlign: "right", fontFamily: FONT_MONO, color: "rgba(255,255,255,0.70)", fontSize: 12 }}>
                    {fmtQty(tx.quantity)}
                  </td>

                  {/* Prix unitaire */}
                  <td style={{ padding: "11px 14px", textAlign: "right", fontFamily: FONT_MONO, color: "rgba(255,255,255,0.70)", fontSize: 12 }}>
                    {fmtNum(tx.unit_price)} €
                  </td>

                  {/* Frais */}
                  <td style={{ padding: "11px 14px", textAlign: "right", fontFamily: FONT_MONO, color: "rgba(255,255,255,0.36)", fontSize: 12 }}>
                    {tx.fees > 0
                      ? `${fmtNum(tx.fees)} €`
                      : <span style={{ opacity: 0.35 }}>—</span>}
                  </td>

                  {/* Total */}
                  <td style={{ padding: "11px 14px", textAlign: "right", fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600, color: "#F8F9FC" }}>
                    {fmtNum(tx.total)} €
                  </td>

                  {/* Action */}
                  <td style={{ padding: "11px 14px", width: 1, whiteSpace: "nowrap" }}>
                    {isConfirming ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.36)", whiteSpace: "nowrap" }}>
                          Supprimer ?
                        </span>
                        <button
                          onClick={() => setConfirmId(null)}
                          style={{
                            padding: "3px 8px", borderRadius: 5, fontSize: 10, cursor: "pointer", fontFamily: FONT,
                            background: "transparent", border: "1px solid rgba(255,255,255,0.14)",
                            color: "rgba(255,255,255,0.45)", transition: "background 150ms",
                          }}
                        >
                          Annuler
                        </button>
                        <button
                          onClick={() => handleDelete(tx.id)}
                          disabled={isDeleting}
                          style={{
                            padding: "3px 8px", borderRadius: 5, fontSize: 10, cursor: "pointer",
                            fontFamily: FONT, fontWeight: 700,
                            background: "rgba(248,113,113,0.14)", border: "1px solid rgba(248,113,113,0.30)",
                            color: "#f87171", opacity: isDeleting ? 0.5 : 1, transition: "opacity 150ms",
                          }}
                        >
                          {isDeleting ? "…" : "Supprimer"}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setDeleteError(null); setConfirmId(tx.id); }}
                        onMouseEnter={() => setTrashHovId(tx.id)}
                        onMouseLeave={() => setTrashHovId(null)}
                        aria-label="Supprimer cette transaction"
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          padding: "3px 5px", borderRadius: 4, lineHeight: 1,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: isTrashHov ? "#f87171" : "rgba(255,255,255,0.45)",
                          opacity: isTrashHov ? 1 : (isHovered ? 0.4 : 0),
                          transition: "color 150ms ease, opacity 150ms ease",
                        }}
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ height: 10, flexShrink: 0 }} />
    </div>
  );
}
