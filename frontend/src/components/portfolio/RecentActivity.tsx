"use client";
import { useEffect, useState } from "react";
import AssetLogo from "@/components/AssetLogo";
import { relativeDay } from "@/lib/portfolio";
import { FONT, NUM } from "@/lib/typography";
import { CLAIR } from "@/lib/palette";
import { API_URL as API } from "@/lib/api";

export { relativeDay };

/**
 * Aperçu des dernières transactions.
 *
 * Un extrait, pas une liste : l'onglet Transactions porte déjà le tableau
 * complet avec ses filtres et sa suppression. C'est la destination du « Voir
 * toute l'activité → » de la maquette, qui n'en avait aucune jusqu'ici.
 */


type Tx = {
  id: string; ticker: string; side: "BUY" | "SELL";
  quantity: number; unit_price: number; total: number;
  executed_at: string; asset_type?: string;
};

export default function RecentActivity({
  portfolioId, refreshKey = 0, limit = 4, onSeeAll,
}: {
  portfolioId?: string;
  refreshKey?: number;
  limit?: number;
  onSeeAll?: () => void;
}) {
  const [txs, setTxs] = useState<Tx[] | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!portfolioId) return;
    let cancelled = false;
    const token = typeof window !== "undefined" ? localStorage.getItem("novac_token") : null;
    fetch(`${API}/api/v1/portfolios/${portfolioId}/transactions`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => {
        // 401 n'est pas une panne : c'est une session absente. On le distingue
        // d'une liste vide, qui elle veut dire « aucune transaction saisie ».
        if (r.status === 401 || r.status === 403) { if (!cancelled) setDenied(true); return null; }
        return r.json();
      })
      .then(d => { if (!cancelled && Array.isArray(d)) setTxs(d); })
      .catch(() => { if (!cancelled) setTxs([]); });
    return () => { cancelled = true; };
  }, [portfolioId, refreshKey]);

  const shown = (txs ?? []).slice(0, limit);

  return (
    /**
     * ⚠️ **L'attribut est sur le panneau, pas sur la liste.** Posé sur la liste, il
     * disparaissait avec elle : sans transaction, c'est l'état vide qui est rendu, et le
     * personnage ne réagissait plus du tout — un câblage qu'on ne peut pas voir est un
     * câblage qu'on croit fait. Survoler « Activité récente », c'est regarder son activité,
     * qu'il y en ait ou non. Mimique seule, aucun mot : voir `CarteCompte`.
     */
    <div data-avatar="curieux"
      style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: CLAIR.texte }}>
          Activité récente
        </span>
      </div>

      {denied || txs === null || shown.length === 0 ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: FONT, fontSize: 10.5, color: CLAIR.texteFaible, textAlign: "center", lineHeight: 1.5 }}>
          {denied ? "Connectez-vous pour voir vos transactions"
            : txs === null ? "Chargement…"
            : "Aucune transaction enregistrée"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7, overflowY: "auto", minHeight: 0 }}>
          {shown.map(t => {
            const achat = t.side === "BUY";
            return (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <AssetLogo ticker={t.ticker} type={t.asset_type || "EQUITY"} size={22} radius={6}
                  fallbackBg={CLAIR.carteCreuse} fallbackBorder={CLAIR.bord}
                  fallbackTextColor={CLAIR.texteSecondaire} bare />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: FONT, fontSize: 11.5, fontWeight: 600, color: CLAIR.texte, lineHeight: 1.2 }}>
                    {achat ? "Achat" : "Vente"}
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: 10, color: CLAIR.texteAttenue, lineHeight: 1.2,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.ticker.replace(/-USD$/, "")}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ ...NUM, fontSize: 11, fontWeight: 700, color: achat ? CLAIR.positif : CLAIR.negatif, lineHeight: 1.2 }}>
                    {achat ? "+" : "−"}{Math.round(t.total).toLocaleString("fr-FR")} €
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: 9.5, color: CLAIR.texteFaible, lineHeight: 1.2 }}>
                    {relativeDay(t.executed_at)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {onSeeAll && (txs?.length ?? 0) > 0 && (
        <button type="button" onClick={onSeeAll}
          style={{
            display: "flex", alignItems: "center", gap: 5, alignSelf: "flex-start",
            background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0,
            fontFamily: FONT, fontSize: 11, fontWeight: 500, color: CLAIR.accent,
          }}>
          Voir toute l&apos;activité
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      )}
    </div>
  );
}
