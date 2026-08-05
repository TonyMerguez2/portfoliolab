"use client";
import { useId, useMemo, useState } from "react";
import { donutArcs, type Slice } from "@/lib/donut";
import { brandHex } from "@/lib/tileStyle";
import { assetClass, type GridAsset } from "@/lib/portfolio";
import { FONT, NUM } from "@/lib/typography";
import { CLAIR } from "@/lib/palette";
import Segments from "@/components/ui/Segments";

/**
 * Répartition du portefeuille, en anneau.
 *
 * Deux découpages, comme dans la maquette. Le découpage par classe y figurait
 * seul, mais sur un portefeuille d'actions il ne montre qu'une part à 100 % —
 * un anneau plein qui n'apprend rien. Par actif, il informe toujours ; c'est
 * donc lui par défaut, l'autre restant à un clic.
 */

const CLASS_COLOR: Record<string, string> = { Actions: "var(--nv-accent)", ETF: "#a78bfa", Crypto: "var(--nv-attention)" };

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
  // Les identifiants de <defs> sont globaux au document : deux camemberts
  // sur la même page partageraient leurs dégradés, et le second
  // reprendrait les couleurs du premier.
  const idSvg = useId().replace(/:/g, "");

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
  // Cercle plein : ni écart entre les parts, ni coins arrondis. Les parts se
  // touchent, et seul le liseré de chacune marque la frontière.
  const arcs = useMemo(
    () => donutArcs(slices, {
      cx: SIZE / 2, cy: SIZE / 2, r: SIZE / 2,
      thickness: SIZE / 2, gap: 0,
    }),
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
        <Segments taille="sm" ariaLabel="Répartition par"
          valeur={mode} onChange={setMode}
          options={[
            { valeur: "actif",  libelle: "Actif" },
            { valeur: "classe", libelle: "Classe" },
          ]} />
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
            {/* La matière des cartes d'actifs, transposée en SVG.
                Une carte est faite de deux lavis d'angle — un fort depuis le
                haut-gauche, un plus discret depuis le bas-droit — sous un
                éclat spéculaire. Les mêmes teintes en aplat donnaient ici deux
                objets de familles différentes alors qu'ils désignent les mêmes
                lignes.

                Les dégradés sont ancrés sur le camembert entier et non sur
                chaque part : c'est ce qui fait lire l'ensemble comme une seule
                surface éclairée d'un même côté, au lieu de parts éclairées
                chacune pour soi. */}
            <defs>
              {arcs.map(a => (
                <radialGradient key={a.key} id={`part-${idSvg}-${a.key}`}
                  gradientUnits="userSpaceOnUse"
                  cx={0} cy={0} r={SIZE * 1.55}>
                  {/* La rampe suit celle de `tileSurface` — même sens, mêmes
                      proportions — mais à opacité doublée.

                      Reprendre ses valeurs exactes a été essayé : une carte
                      plafonne à 88/255, soit 34 %, et le camembert devenait
                      alors illisible. Une carte fait 248 px et vit seule sur la
                      page ; ici, trois parts se touchent, souvent de teintes
                      voisines, et à 34 % elles se confondent. Ce n'est pas le
                      réglage qui diffère mais la situation.

                      Une première version, à l'inverse, montait à 100 % : le
                      camembert était bien plus vif que les cartes qu'il devait
                      rappeler. */}
                  <stop offset="0%"   stopColor={a.color} stopOpacity={0.70} />
                  <stop offset="18%"  stopColor={a.color} stopOpacity={0.62} />
                  <stop offset="36%"  stopColor={a.color} stopOpacity={0.50} />
                  <stop offset="54%"  stopColor={a.color} stopOpacity={0.43} />
                  <stop offset="78%"  stopColor={a.color} stopOpacity={0.37} />
                  <stop offset="100%" stopColor={a.color} stopOpacity={0.33} />
                </radialGradient>
              ))}
              {/* L'éclat de verre, posé une fois sur l'ensemble. */}
              <radialGradient id={`eclat-${idSvg}`} gradientUnits="userSpaceOnUse"
                cx={SIZE * 0.18} cy={SIZE * 0.08} r={SIZE * 0.78}>
                <stop offset="0%"   stopColor="#FFFFFF" stopOpacity={0.16} />
                <stop offset="42%"  stopColor="#FFFFFF" stopOpacity={0.06} />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
              </radialGradient>
            </defs>
            {/* L'aplat sombre des cartes, posé sous les parts : c'est lui qui
                donne aux lavis leur assise et empêche les teintes de flotter
                sur le panneau. */}
            <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2} fill="rgba(2,10,24,0.38)" />
            {arcs.map(a => (
              /* Un remplissage, rien d'autre. Les parts ont porté un liseré
                 de leur couleur, à l'imitation du bord des cartes ; sur un
                 disque de 108 px il cernait les parts au lieu de les ourler,
                 et la frontière entre deux voisines se lisait comme un trait
                 tracé plutôt que comme un changement de teinte. */
              <path key={a.key} d={a.path} fill={`url(#part-${idSvg}-${a.key})`}
                opacity={hover && hover !== a.key ? 0.32 : 1}
                style={{ transition: "opacity 140ms", cursor: "default" }}
                onMouseEnter={() => setHover(a.key)}
                onMouseLeave={() => setHover(null)} />
            ))}
            {/* Par-dessus les parts, et sans capter la souris : il éclaire, il
                ne se survole pas. */}
            <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2}
              fill={`url(#eclat-${idSvg})`} pointerEvents="none" />
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
