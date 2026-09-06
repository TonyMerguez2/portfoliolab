"use client";
import { recuperer } from "@/lib/requete";
import { useEffect, useState } from "react";
import AssetLogo from "@/components/AssetLogo";
import MarketPulse from "@/components/portfolio/MarketPulse";
import { gaugeArc } from "@/lib/donut";
import type { GridAsset } from "@/lib/portfolio";
import { FONT, NUM } from "@/lib/typography";
import { API_URL as API } from "@/lib/api";
import { marqueAvatar } from "@/lib/avatarEtats";

/**
 * Bande basse : ce qui mérite l'attention, les repères de marché, le sentiment.
 *
 * La maquette annonce ici « 3 actifs ont des événements importants », adossé à
 * un calendrier de résultats. Ce bloc garde l'intention — qu'est-ce qui bouge
 * aujourd'hui — et la remplit avec ce qu'on sait vraiment : les actifs dont la
 * variation sort de l'ordinaire.
 *
 * ⚠️ **La raison de ce détour a disparu depuis.** Le calendrier n'existait
 * nulle part au backend quand ces lignes ont été écrites, et l'onglet
 * Événements fabriquait ses dates depuis l'ordre de la boucle — « Résultats
 * trimestriels J+3, J+6, J+9 ». `services/evenements.py` sert désormais de
 * vraies échéances, relevées chez le fournisseur. Rendre à cette bande les
 * événements de la maquette est donc devenu possible : ce qui reste est un
 * choix qu'on n'a pas fait, non plus un mur.
 *
 * ⚠️ **Rien ne monte cette bande.** Voir MarketPulse, qu'elle enveloppe.
 */


/** Seuil au-delà duquel un mouvement mérite d'être signalé, en points de %. */
const SEUIL = 2;

type Fng = { value: number | null; label: string | null; scope: string };

export default function WatchBand({
  assets, period, periodLabel,
}: {
  assets: GridAsset[];
  period: string;
  periodLabel: string;
}) {
  const [fng, setFng] = useState<Fng | null>(null);

  useEffect(() => {
    let cancelled = false;
    recuperer(`${API}/api/v1/fear-greed`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setFng(d); })
      .catch(() => { /* le panneau se tait */ });
    return () => { cancelled = true; };
  }, []);

  const notables = assets
    .filter(a => a.change != null && Math.abs(a.change) >= SEUIL)
    .sort((a, b) => Math.abs(b.change!) - Math.abs(a.change!));

  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 0, height: "100%" }}>
      {/* Ce qui bouge */}
      <div style={{ flex: "0 0 auto", minWidth: 210, paddingRight: 18, display: "flex", flexDirection: "column", justifyContent: "center", gap: 3 }}>
        <span style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,0.88)" }}>
          À surveiller
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontFamily: FONT, fontSize: 10.5, color: "rgba(255,255,255,0.38)", lineHeight: 1.3 }}>
          {notables.length
            ? `${notables.length} actif${notables.length > 1 ? "s" : ""} ${notables.length > 1 ? "bougent" : "bouge"} de plus de ${SEUIL} % sur ${periodLabel}`
            : `Aucun mouvement marqué sur ${periodLabel}`}
        </span>
        {notables.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            {notables.slice(0, 3).map((a, i) => (
              <div key={a.ticker} aria-label={`${a.ticker} ${a.change! >= 0 ? "+" : ""}${a.change!.toFixed(2)} %`}
                {...marqueAvatar(a.change)}
                style={{
                  width: 26, height: 26, borderRadius: "50%", overflow: "hidden",
                  marginLeft: i ? -8 : 0, zIndex: 3 - i, flexShrink: 0,
                  border: `2px solid ${a.change! >= 0 ? "#4ade80" : "#f87171"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "rgba(255,255,255,0.06)",
                }}>
                <AssetLogo ticker={a.ticker} type={a.type || "EQUITY"} size={22} radius={11}
                  fallbackBg="rgba(255,255,255,0.10)" fallbackBorder="transparent"
                  fallbackTextColor="#fff" bare />
              </div>
            ))}
            {notables.length > 3 && (
              <span style={{ ...NUM, marginLeft: 8, fontSize: 10.5, color: "rgba(255,255,255,0.38)" }}>
                +{notables.length - 3}
              </span>
            )}
          </div>
        )}
        </div>
      </div>

      <div style={{ width: 1, background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />

      {/* Repères de marché */}
      <div style={{ flex: 1, minWidth: 0, padding: "0 18px" }}>
        <MarketPulse period={period} />
      </div>

      {/* Sentiment. Le libellé dit « crypto » : c'est l'indice d'alternative.me,
          et le présenter en baromètre général au-dessus d'un portefeuille
          d'actions ferait croire à une mesure qu'il ne prend pas. */}
      {fng?.value != null && (() => {
        const v = fng.value!;
        const couleur = v >= 75 ? "#4ade80" : v >= 55 ? "#a3e635" : v >= 45 ? "#fbbf24" : v >= 25 ? "#fb923c" : "#f87171";
        const { fond, valeur } = gaugeArc(v, { cx: 34, cy: 32, r: 26, thickness: 6 });
        return (
          <>
            <div style={{ width: 1, background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />
            <div style={{ flex: "0 0 auto", paddingLeft: 18, display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="68" height="40" style={{ display: "block", flexShrink: 0 }}>
                <path d={fond} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={6} strokeLinecap="round" />
                <path d={valeur} fill="none" stroke={couleur} strokeWidth={6} strokeLinecap="round" />
              </svg>
              <div>
                <div style={{ fontFamily: FONT, fontSize: 10.5, color: "rgba(255,255,255,0.38)", lineHeight: 1.3 }}>
                  Fear &amp; Greed crypto
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ ...NUM, fontSize: 17, fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>{v}</span>
                  <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: couleur }}>{fng.label}</span>
                </div>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
