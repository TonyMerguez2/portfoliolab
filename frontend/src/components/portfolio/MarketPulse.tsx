"use client";
import { recuperer } from "@/lib/requete";
import { useEffect, useState } from "react";
import TileSparkline from "@/components/charts/TileSparkline";
import { FONT, NUM } from "@/lib/typography";
import { API_URL as API } from "@/lib/api";
import { marqueAvatar } from "@/lib/avatarEtats";

/**
 * Repères de marché : indice, crypto, devise.
 *
 * Bas de la maquette. Sa moitié gauche — « 3 actifs ont des événements
 * importants » — et son « Fear & Greed » ne sont pas ici mais dans WatchBand,
 * qui enveloppe ce bloc et le pose entre les deux.
 *
 * ⚠️ **Rien ne monte ce composant, ni WatchBand qui l'appelle.** Les deux sont
 * nés sans point d'accroche dans la refonte du portefeuille (98c8a18), et
 * l'historique ne garde trace d'aucun montage — donc d'aucun retrait. Ce que ce
 * dépôt fait quand il démonte un bloc se lit ailleurs : « La répartition passe
 * du camembert au pavage » retire AllocationDonut le jour même où elle lui
 * donne un remplaçant. Ici, ni commit ni remplaçant. Le branchement a été
 * oublié, pas défait — et juger la mise en page de cette rangée demande donc
 * de la monter d'abord.
 */


const PERIOD_API: Record<string, string> = { "1J": "1d", "7J": "7d", "1M": "1mo", "3M": "3mo", "1A": "1y" };

type Repere = { ticker: string; label: string; decimales: number };
const REPERES: Repere[] = [
  { ticker: "^GSPC",    label: "S&P 500",  decimales: 2 },
  { ticker: "BTC-USD",  label: "Bitcoin",  decimales: 0 },
  { ticker: "EURUSD=X", label: "EUR/USD",  decimales: 4 },
];

type Cote = { symbol: string; price: number; change: number; series?: number[] };

export default function MarketPulse({ period = "1J" }: { period?: string }) {
  const [cotes, setCotes] = useState<Record<string, Cote>>({});

  useEffect(() => {
    let cancelled = false;
    const tickers = REPERES.map(r => r.ticker).join(",");
    const charger = () =>
      recuperer(`${API}/api/v1/prices?tickers=${encodeURIComponent(tickers)}&period=${PERIOD_API[period] ?? "1d"}`)
        .then(r => r.json())
        .then((list: Cote[]) => {
          if (cancelled || !Array.isArray(list)) return;
          const m: Record<string, Cote> = {};
          list.forEach(c => { if (c.symbol) m[c.symbol] = c; });
          setCotes(m);
        })
        .catch(() => {});
    charger();
    // Même cadence que les prix du portefeuille, pour que les deux ne racontent
    // pas des instants différents.
    const t = setInterval(charger, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, [period]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, height: "100%" }}>
      <span style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: "0.10em",
        color: "rgba(255,255,255,0.25)", flexShrink: 0, marginRight: 16 }}>
        MARCHÉS
      </span>
      {REPERES.map((r, i) => {
        const c = cotes[r.ticker];
        const up = (c?.change ?? 0) >= 0;
        const col = up ? "#4ade80" : "#f87171";
        return (
          <div key={r.ticker}
            // Le visage du bandeau s'accorde au marché survolé : content sur une
            // hausse, préoccupé sur une baisse franche — et fâché si elle se creuse
            // pendant qu'on la regarde, ce que le chiffre publié permet de voir.
            {...marqueAvatar(c?.change)}
            style={{
            display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0,
            paddingLeft: i ? 16 : 0,
            borderLeft: i ? "1px solid rgba(255,255,255,0.06)" : "none",
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: FONT, fontSize: 10.5, color: "rgba(255,255,255,0.42)", lineHeight: 1.3 }}>
                {r.label}
              </div>
              <div style={{ ...NUM, fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.90)", lineHeight: 1.2 }}>
                {c ? c.price.toLocaleString("fr-FR", { minimumFractionDigits: r.decimales, maximumFractionDigits: r.decimales }) : "—"}
              </div>
              <div style={{ ...NUM, fontSize: 10.5, fontWeight: 600, color: c ? col : "rgba(255,255,255,0.25)", lineHeight: 1.3 }}>
                {c ? `${up ? "+" : ""}${c.change.toFixed(2)} %` : "—"}
              </div>
            </div>
            {c?.series && c.series.length > 1 && (
              <TileSparkline pts={c.series} color={col} w={62} h={26} />
            )}
          </div>
        );
      })}
    </div>
  );
}
