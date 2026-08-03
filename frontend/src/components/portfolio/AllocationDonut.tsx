"use client";
import { useMemo, useState } from "react";
import { donutArcs, type Slice } from "@/lib/donut";
import { brandHex } from "@/lib/tileStyle";
import { assetClass, type GridAsset } from "@/lib/portfolio";
import { FONT, NUM } from "@/lib/typography";
import { CLAIR } from "@/lib/palette";

/**
 * Répartition du portefeuille, en anneau.
 *
 * Deux découpages, comme dans la maquette. Le découpage par classe y figurait
 * seul, mais sur un portefeuille d'actions il ne montre qu'une part à 100 % —
 * un anneau plein qui n'apprend rien. Par actif, il informe toujours ; c'est
 * donc lui par défaut, l'autre restant à un clic.
 */

const CLASS_COLOR: Record<string, string> = { Actions: "#5B8DEF", ETF: "#a78bfa", Crypto: "#fbbf24" };

// Anneau et légende côte à côte, comme au concept. La colonne de droite a été
// élargie à 296 px, ce qui laisse la place d'un anneau de 108 px sans rogner
// les libellés — à 248 px, « AAPL » devenait « A… ».
const SIZE = 108;

/** Nombre de lignes montrées avant de renvoyer vers la vue détaillée. */
const MAX_LEGENDE = 5;

export default function AllocationDonut({
  assets, totalValue, onSeeAll,
}: {
  assets: GridAsset[];
  totalValue?: number | null;
  /** Destination du « Voir la répartition détaillée ». */
  onSeeAll?: () => void;
}) {
  const [mode, setMode] = useState<"actif" | "classe">("actif");
  const [hover, setHover] = useState<string | null>(null);

  const slices: Slice[] = useMemo(() => {
    if (mode === "actif") {
      return [...assets]
        .sort((a, b) => b.weight - a.weight)
        .map(a => ({ key: a.ticker.replace(/-USD$/, ""), value: a.weight, color: brandHex(a.ticker) }));
    }
    const grouped = new Map<string, number>();
    assets.forEach(a => {
      const c = assetClass(a.ticker);
      grouped.set(c, (grouped.get(c) ?? 0) + a.weight);
    });
    return Array.from(grouped.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ key: k, value: v, color: CLASS_COLOR[k] ?? "#94a3b8" }));
  }, [assets, mode]);

  // L'écart entre parts est plus large qu'un simple jointoiement : c'est lui
  // qui fait lire les secteurs comme des pièces de verre posées côte à côte
  // plutôt que comme un anneau découpé.
  // Camembert plein, écart nul. L'épaisseur vaut le rayon, ce qui referme le
  // centre : il ne portait plus aucune information, un anneau y aurait laissé
  // un trou pour rien.
  const arcs = useMemo(
    () => donutArcs(slices, { cx: SIZE / 2, cy: SIZE / 2, r: SIZE / 2, thickness: SIZE / 2, gap: 0 }),
    [slices]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: CLAIR.texte }}>
          Répartition
          <span title="Part de chaque ligne dans la valeur totale du portefeuille."
            style={{ display: "flex", color: CLAIR.texteFaible, cursor: "help" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
            </svg>
          </span>
        </span>
        <div style={{ display: "flex", gap: 2, background: CLAIR.carteCreuse, borderRadius: 7, padding: 2 }}>
          {(["actif", "classe"] as const).map(m => (
            <button key={m} type="button" onClick={() => setMode(m)}
              style={{
                padding: "0 8px", height: 21, borderRadius: 5, border: "none", cursor: "pointer",
                fontFamily: FONT, fontSize: 10.5, fontWeight: m === mode ? 600 : 500,
                background: m === mode ? CLAIR.accentDoux : "transparent",
                color: m === mode ? CLAIR.accent : CLAIR.texteAttenue,
              }}>{m === "actif" ? "Actif" : "Classe"}</button>
          ))}
        </div>
      </div>

      <div style={{
        display: "flex", alignItems: "flex-start", gap: 12,
        // Hauteur figée sur le diamètre : la légende compte trois lignes en
        // mode Classe et six en mode Actif, et le panneau changeait de taille
        // au basculement.
        height: SIZE, minHeight: SIZE,
      }}>
        {/* Couleurs pleines, aucun écart, aucun arrondi, aucun liseré.
            Le traitement verre qui vivait ici — liseré blanc, couleur à 58 %,
            halo flouté, angles émoussés — donnait une couronne de pétales
            détachés là où le concept montre un camembert continu. Il a été
            retiré du score aussi, et le composant partagé qui le portait
            n'ayant plus d'appelant, il a été supprimé. */}
        <div style={{ position: "relative", width: SIZE, height: SIZE, flexShrink: 0 }}>
          <svg width={SIZE} height={SIZE} style={{ display: "block" }}>
            {arcs.map(a => (
              <path key={a.key} d={a.path} fill={a.color}
                opacity={hover && hover !== a.key ? 0.32 : 1}
                style={{ transition: "opacity 140ms", cursor: "default" }}
                onMouseEnter={() => setHover(a.key)}
                onMouseLeave={() => setHover(null)} />
            ))}
          </svg>
        </div>

        {/* Légende à droite de l'anneau, une ligne par part. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0, height: "100%", overflowY: "auto" }}>
          {arcs.slice(0, MAX_LEGENDE).map(a => (
            <div key={a.key}
              onMouseEnter={() => setHover(a.key)} onMouseLeave={() => setHover(null)}
              style={{ display: "flex", alignItems: "center", gap: 7, opacity: hover && hover !== a.key ? 0.45 : 1, transition: "opacity 140ms" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: a.color, flexShrink: 0 }} />
              <span style={{ fontFamily: FONT, fontSize: 11, color: CLAIR.texteSecondaire, flex: 1,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.key}</span>
              <span style={{ ...NUM, fontSize: 11, fontWeight: 600, color: CLAIR.texteSecondaire, flexShrink: 0 }}>
                {(a.share * 100).toFixed(1)} %
              </span>
            </div>
          ))}
          {/* Au-delà de cinq lignes, la légende devenait un pavé qui poussait
              tout le panneau. Le reste est résumé, et le lien du bas mène au
              détail complet. */}
          {arcs.length > MAX_LEGENDE && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 1 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: CLAIR.carteCreuse, flexShrink: 0 }} />
              <span style={{ fontFamily: FONT, fontSize: 11, color: CLAIR.texteAttenue, flex: 1 }}>
                {arcs.length - MAX_LEGENDE} autres
              </span>
              <span style={{ ...NUM, fontSize: 11, fontWeight: 600, color: CLAIR.texteSecondaire, flexShrink: 0 }}>
                {(arcs.slice(MAX_LEGENDE).reduce((t, a) => t + a.share, 0) * 100).toFixed(1)} %
              </span>
            </div>
          )}
        </div>
      </div>

      {onSeeAll && (
        <button type="button" onClick={onSeeAll}
          style={{
            display: "flex", alignItems: "center", gap: 5, alignSelf: "flex-start",
            background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0,
            fontFamily: FONT, fontSize: 11, fontWeight: 500, color: CLAIR.accent,
          }}>
          Voir la répartition détaillée
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      )}
    </div>
  );
}
