"use client";
import { useRef, useEffect, useState, useMemo } from "react";
import * as d3 from "d3";
import AssetLogo from "@/components/AssetLogo";
import { surfaceAplat, brandRgb, hexToRgb } from "@/lib/tileStyle";
import { assetName } from "@/lib/assets";
import { encreSur, pourContrasteSur, couleurPerformance } from "@/lib/couleur";
import TileSparkline from "@/components/charts/TileSparkline";

type AssetItem = { ticker: string; weight: number; change: number | null; type?: string; price?: number | null; spark?: number[]; updatedAt?: number; value?: number | null; perfEur?: number | null };

const DEMO_ASSETS: AssetItem[] = [
  { ticker: "CW8",   weight: 23, change:  0.0 },
  { ticker: "GOOGL", weight: 19, change:  4.1 },
  { ticker: "SPY",   weight: 15, change:  1.2 },
  { ticker: "NVDA",  weight: 12, change:  3.2 },
  { ticker: "HRMS",  weight: 11, change: -1.8 },
  { ticker: "GOLD",  weight: 10, change:  0.8 },
  { ticker: "XSX6",  weight: 10, change: -0.9 },
];

const GAP    = 6;


function FlipValue({ value, style }: { value: string; style?: React.CSSProperties }) {
  const [current, setCurrent] = useState(value);
  const [visible, setVisible]  = useState(true);
  useEffect(() => {
    if (value === current) return;
    setVisible(false);
    const t = setTimeout(() => { setCurrent(value); setVisible(true); }, 150);
    return () => clearTimeout(t);
  }, [value]); // eslint-disable-line
  return (
    <span style={{
      ...style,
      display: "inline-block",
      opacity:    visible ? 1 : 0,
      transform:  visible ? "translateY(0px)" : "translateY(4px)",
      transition: "opacity 150ms ease, transform 150ms ease",
    }}>
      {current}
    </span>
  );
}

type Tier = "full" | "compact" | "mini";
function getTier(w: number, h: number, weight = 0): Tier {
  // Assets à fort poids méritent le full tier même dans des tuiles légèrement plus petites
  const boost = weight >= 6 ? 18 : weight >= 4 ? 8 : 0;
  if (w > 145 - boost && h > 88 - boost) return "full";
  if (Math.min(w, h) > 56) return "compact";
  return "mini";
}

// Même pile que le corps de page, donc que les cartes d'actif. Les chiffres
// étaient en monospace : d'où un pourcentage qui ne ressemblait pas au leur.
// Les chiffres tabulaires suffisent à les aligner sans changer de famille.
const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif";

const TILE_ANIM = `
@keyframes tileIn {
  from { opacity: 0; transform: scale(0.90) translateZ(0); }
  to   { opacity: 1; transform: scale(1)    translateZ(0); }
}
`;

interface Props {
  assets?: AssetItem[];
  onAssetClick?: (ticker: string) => void;
}

export default function LiquidGlassTreemap({ assets: propAssets, onAssetClick }: Props = {}) {
  const containerRef              = useRef<HTMLDivElement>(null);
  const [size, setSize]           = useState({ w: 800, h: 600 });
  const [hovered, setHovered]     = useState<string | null>(null);
  const [miniPop, setMiniPop]     = useState<{ asset: AssetItem; x: number; y: number; w: number; h: number } | null>(null);

  const assets = propAssets && propAssets.length > 0 ? propAssets : DEMO_ASSETS;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setSize({ w: Math.floor(el.clientWidth), h: Math.floor(el.clientHeight) });
    const ro = new ResizeObserver(([e]) =>
      setSize({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) })
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tiles = useMemo(() => {
    if (size.w < 10 || size.h < 10) return [];
    const root = d3
      .hierarchy<any>({ children: assets })
      .sum((d) => d.weight ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    d3.treemap<any>()
      .size([size.w, size.h])
      .paddingInner(GAP)
      .paddingOuter(GAP)
      .tile(d3.treemapSquarify)(root);
    return root.leaves() as d3.HierarchyRectangularNode<any>[];
  }, [size, assets]);

  return (
    <div
      ref={containerRef}
      /**
       * ⚠️ **Aucun fond : celui de l'application passe au travers.** Trois lueurs radiales —
       * bleue, verte, violette — couraient ici sur un `#040F22` opaque, ce qui masquait à la
       * fois le dégradé du `<body>` et la trame de points que `PointsFond` pose sur toutes les
       * pages depuis la mise en page racine. La carte de chaleur était donc la seule page de
       * l'application à ne pas reposer sur le même fond, et les trois lueurs se voyaient au
       * travers des intervalles entre les tuiles. Demandé à l'usage.
       *
       * ⚠️ **Transparent, et non le fond recopié.** Le dégradé du `<body>` est en
       * `background-attachment: fixed` et la trame vit en `z-index: -1` : les reproduire ici
       * donnerait deux sources pour une même apparence, qui divergeraient au premier changement
       * de thème. Ne rien peindre est ce qui garantit que c'est le même fond, pas un semblable.
       */
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      <style>{TILE_ANIM}</style>
      {/* Popover pour tuiles mini */}
      {miniPop && (() => {
        const { asset: a, x: px, y: py, w: pw, h: ph } = miniPop;
        const [pr, pg, pb] = brandRgb(a.ticker);
        const chg = a.change ?? 0;
        const chgColor = chg >= 0 ? "#4ade80" : "#f87171";
        const chgStr = `${chg >= 0 ? "▲" : "▼"} ${Math.abs(chg).toFixed(2)}%`;
        const popW = 150;
        const left = Math.min(px, size.w - popW - 8);
        const top  = py - 100 < 0 ? py + ph + 8 : py - 96;
        return (
          <div style={{
            position: "absolute", left, top, width: popW, zIndex: 100,
            background: `rgba(${Math.round(pr*0.14)},${Math.round(pg*0.10)},${Math.round(pb*0.10)},0.94)`,
            backdropFilter: "blur(24px) saturate(1.8)",
            WebkitBackdropFilter: "blur(24px) saturate(1.8)",
            borderRadius: 12,
            border: `1px solid rgba(${pr},${pg},${pb},0.35)`,
            boxShadow: `0 8px 28px rgba(0,0,0,0.50), 0 0 0 1px rgba(${pr},${pg},${pb},0.15)`,
            padding: "10px 12px",
            pointerEvents: "none",
            display: "flex", flexDirection: "column", gap: 4,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <AssetLogo ticker={a.ticker} type={a.type} size={22} radius={5}
                fallbackBg={`rgba(${pr},${pg},${pb},0.18)`}
                fallbackBorder={`rgba(${pr},${pg},${pb},0.35)`}
                fallbackTextColor="#F8F9FC" bare/>
              <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.92)", fontFamily: FONT }}>{a.ticker}</span>
              <span style={{
                fontSize: 10, fontWeight: 600, fontFamily: FONT, fontVariantNumeric: "tabular-nums",
                color: "rgba(255,255,255,0.65)",
                background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 4, padding: "1px 4px", marginLeft: "auto",
              }}>{a.weight}%</span>
            </div>
            {/* Valeur portefeuille ou prix unitaire */}
            {(a.value != null || a.price != null) && (
              <span style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.92)", fontFamily: FONT, fontVariantNumeric: "tabular-nums" }}>
                {a.value != null
                  ? a.value.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €"
                  : a.price!.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"}
              </span>
            )}
            {/* Perf % + perf € */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: chgColor, fontFamily: FONT, fontVariantNumeric: "tabular-nums" }}>{chgStr}</span>
              {a.perfEur != null && (
                <span style={{ fontSize: 11, fontWeight: 600, color: chgColor, fontFamily: FONT, fontVariantNumeric: "tabular-nums", opacity: 0.72 }}>
                  {`${a.perfEur >= 0 ? "+" : ""}${Math.round(a.perfEur).toLocaleString("fr-FR")} €`}
                </span>
              )}
            </div>
            {/* Prix unitaire en secondaire si valeur dispo */}
            {a.value != null && a.price != null && (
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.30)", fontFamily: FONT, fontVariantNumeric: "tabular-nums" }}>
                {a.price.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </span>
            )}
          </div>
        );
      })()}
      {tiles.map((node, idx) => {
        const asset  = node.data as AssetItem;
        const change = asset.change ?? 0;
        const x = node.x0, y = node.y0;
        const w = node.x1 - node.x0, h = node.y1 - node.y0;
        const tier   = getTier(w, h, asset.weight);
        const isHov  = hovered === asset.ticker;

        /**
         * La teinte de la tuile : sa variation, et rien d'autre.
         *
         * ⚠️ **C'est une carte de chaleur, donc la couleur porte la mesure.** Elle a porté la
         * marque — la couleur exacte de la plaque du logo, qui s'y fondait —, et c'était
         * lisible comme un annuaire : deux actifs à +4 % et −4 % n'avaient aucune parenté
         * visuelle. Tranché à l'usage quand la page a reçu son nom : « la couleur dit COMBIEN,
         * le logo dit QUI ». La plaque du logo redevient donc visible, ce qui est normal —
         * elle ne se fond plus dans rien.
         */
        const teinte = couleurPerformance(asset.change);
        const [cr, cg, cb] = hexToRgb(teinte);

        /**
         * L'encre de la tuile, et sa version voilée.
         *
         * ⚠️ **Le texte était blanc en dur, ce qui supposait une tuile sombre.** C'était vrai
         * tant que la surface posait ses lavis sur un fond `rgba(2,10,24,0.38)` : quelle que
         * soit la couleur de marque, la tuile restait foncée. En aplat elle vaut exactement la
         * plaque du logo — et certaines plaques sont **blanches** : `#f1f3fa` chez Alphabet,
         * `#ffffff` chez Meta et Microsoft. Le nom de l'actif y devenait blanc sur blanc.
         *
         * ⚠️ **`encreSur` choisit, elle ne corrige pas.** Elle rend le blanc ou l'encre sombre,
         * selon lequel des deux contraste le mieux avec le fond — sa propre note la réserve aux
         * « capitales, pastilles et étiquettes de bonne taille », ce que sont ces libellés. Les
         * opacités d'origine sont conservées telles quelles : c'est la hiérarchie du texte, et
         * elle ne dépend pas de la couleur.
         */
        const encreTuile = encreSur(teinte);
        const encre = (a: number) =>
          `color-mix(in srgb, ${encreTuile} ${Math.round(a * 100)}%, transparent)`;
        /**
         * Le vert et le rouge de la performance, ramenés dans la plage lisible sur *cette*
         * tuile.
         *
         * ⚠️ **Ils étaient fixes, ce qui supposait une tuile sombre.** Le vert `#4ade80` est
         * clair : posé sur les plaques claires que l'aplat fait apparaître, il s'efface. Mesuré
         * sur les tuiles de la page — **1,37:1 sur le vert NVDA**, 1,57 sur le blanc
         * d'Alphabet, 1,11 sur le bleu pâle de XSX6, là où il tient 4,75 sur le bleu de SPY.
         * Sous trois pour un, un chiffre de cette taille ne se lit plus ; le vert sur vert de
         * NVDA ne se voyait tout simplement pas.
         *
         * ⚠️ **`pourContrasteSur` et non `pourFond`, et j'ai essayé l'autre d'abord.**
         * `pourFond` ramène la couleur dans une plage réglée pour du blanc ou du noir : elle ne
         * regarde jamais le fond réel. Sur la tuile NVDA elle faisait **passer le vert de 1,37 à
         * 1,03** — le remède aggravait le mal, parce qu'une plage « lisible sur blanc » n'a rien
         * à dire d'un fond vert. `pourContrasteSur` vise le contraste avec cette tuile-ci.
         *
         * ⚠️ **La teinte ne bouge pas, la clarté seule s'adapte.** Le vert doit rester
         * reconnaissable comme « ça monte » : une couleur qui changerait de teinte selon la
         * tuile ne serait plus un code, juste un décor.
         */
        const changeColor  = pourContrasteSur(change >= 0 ? "#4ade80" : "#f87171", teinte);
        const triangle     = change >= 0 ? "▲" : "▼";
        const changeStr    = `${triangle} ${Math.abs(change).toFixed(2)}%`;

        // Same radius as the asset cards, not one derived from the tile size:
        // the point of these tiles is to read as the same object across pages.
        const tileRadius = 18;

        const surface = surfaceAplat(teinte, tileRadius);

        const baseStyle: React.CSSProperties = {
          ...surface,
          position:             "absolute",
          left: x, top: y, width: w, height: h,
          // The .novac-tile edge is painted from currentColor, so the tile
          // colour has to be set here for the border to pick it up.
          color:                teinte,
          /* Le survol soulève la tuile — ombre et échelle seulement. Il ajoutait aussi un
             `backdrop-filter` plus fort, qui n'a plus rien à filtrer sous un aplat opaque. */
          ...(isHov ? {
            boxShadow: `0 20px 48px rgba(0,0,0,0.65), 0 8px 20px rgba(${cr},${cg},${cb},0.32), ${surface.boxShadow}`,
          } : {}),
          transform:            isHov ? "scale(1.07) translateY(-6px) translateZ(0)" : "scale(1) translateY(0) translateZ(0)",
          zIndex:               isHov ? 10 : 1,
          /* ⚠️ La couleur est fondue parce qu'elle arrive en retard : elle se lit sur le logo,
             donc après son chargement, et la tuile sautait du repli à la teinte du logo d'une
             image à l'autre. Deux cent vingt millisecondes suffisent à en faire un passage
             plutôt qu'un clignotement. Possible seulement depuis que la surface est un aplat —
             les lavis d'avant étaient une propriété longue, qui ne s'interpole pas. */
          transition:           "background-color 220ms ease, box-shadow 200ms ease, transform 200ms cubic-bezier(0.34,1.4,0.64,1), z-index 0ms",
          cursor:               "pointer",
          animationName:        "tileIn",
          animationDuration:    "300ms",
          animationDelay:       `${idx * 35}ms`,
          animationFillMode:    "both",
          animationTimingFunction: "cubic-bezier(0.34,1.4,0.64,1)",
        };

        // Neither a coloured glow nor a second edge stroke: the asset cards
        // have neither, and these tiles are meant to read as the same object
        // across pages. tileSurface carries the whole surface, edge included.

        // Bloc perf réutilisable : triangle plus grand + % semi-bold + perf€
        const perfBlock = (perfFs: number, gap = 6) => (
          <div style={{ display: "flex", alignItems: "baseline", gap }}>
            <span style={{ fontSize: perfFs * 1.18, fontWeight: 800, color: changeColor,
              fontFamily: FONT, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
              {triangle}
            </span>
            <FlipValue
              value={`${Math.abs(change).toFixed(2)}%`}
              style={{ fontSize: perfFs, fontWeight: 600, color: changeColor,
                fontFamily: FONT, fontVariantNumeric: "tabular-nums", letterSpacing: "0.01em" }}
            />
            {asset.perfEur != null && (
              <FlipValue
                value={`${asset.perfEur >= 0 ? "+" : ""}${Math.round(asset.perfEur).toLocaleString("fr-FR")} €`}
                style={{ fontSize: Math.max(perfFs * 0.68, 9), fontWeight: 600,
                  color: changeColor, fontFamily: FONT, fontVariantNumeric: "tabular-nums", opacity: 0.80 }}
              />
            )}
          </div>
        );

        // Formattage prix adaptatif : 0 décimales au-dessus de 10k, 1 en dessous de 100, sinon 2
        const fmtPrice = (p: number) => {
          if (p >= 10000) return p.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";
          if (p >= 100)   return p.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " €";
          return p.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
        };

        // FULL tier — toutes les tailles basées sur sqrt(w*h) : reflète l'aire réelle, indépendant de l'orientation
        if (tier === "full") {
          const scale    = Math.sqrt(w * h);
          const minDim   = Math.min(w, h);
          const logoSize = Math.min(110, Math.max(24, scale * 0.155));
          const tickerFs = Math.min(52, Math.max(12, scale * 0.076));
          const weightFs = Math.max(10, tickerFs * 0.58);
          const perfFs   = Math.min(48, Math.max(10, scale * 0.067));
          const valFs    = Math.min(54, Math.max(12, scale * 0.080));
          const pad      = Math.min(36, Math.max(14, minDim * 0.065));
          const headerGap = Math.min(18, Math.max(8, logoSize * 0.18));
          const showSpark = asset.spark && asset.spark.length > 1 && h > 105;
          const spW = Math.min(Math.round(w * 0.50), 320);
          const spH = Math.min(Math.round(h * 0.35), 130);
          return (
            <div key={asset.ticker}
              className="novac-tile novac-tile-aplat"
              style={{ ...baseStyle, display: "flex", flexDirection: "column", padding: pad }}
              onMouseEnter={() => setHovered(asset.ticker)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onAssetClick?.(asset.ticker)}
            >
              {showSpark && (
                <div style={{
                  position: "absolute",
                  right: Math.round(w * 0.05),
                  top: "42%", transform: "translateY(-50%)",
                  width: spW, height: spH,
                  pointerEvents: "none", opacity: 0.65,
                }}>
                  <TileSparkline pts={asset.spark!} color={changeColor} w={spW} h={spH} updatedAt={asset.updatedAt} />
                </div>
              )}
              {/* Header */}
              <div style={{ position: "relative", display: "flex", alignItems: "center", gap: headerGap }}>
                <AssetLogo ticker={asset.ticker} type={asset.type} size={logoSize} radius={Math.round(logoSize * 0.22)}
                  fallbackBg="transparent" fallbackBorder="transparent"
                  fallbackTextColor={encreSur(teinte)} bare/>
                <div style={{ display: "flex", flexDirection: "column", gap: Math.max(2, tickerFs * 0.12), minWidth: 0 }}>
                  <span style={{
                    fontSize: tickerFs, fontWeight: 700, lineHeight: 1,
                    color: encre(0.93), fontFamily: FONT,
                    letterSpacing: "-0.01em",
                    textShadow: "0 1px 2px rgba(0,0,0,0.30)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {asset.ticker}
                  </span>
                  {/* Nom complet sous le ticker, comme sur la carte d'actif.
                      Omis quand le catalogue ne connaît pas le ticker : mieux
                      vaut s'en passer qu'afficher un intitulé inventé. */}
                  {assetName(asset.ticker) && (
                    <span style={{
                      fontSize: Math.max(10, tickerFs * 0.46), fontWeight: 550, lineHeight: 1.1,
                      color: encre(0.90), fontFamily: FONT,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {assetName(asset.ticker)}
                    </span>
                  )}
                  <span style={{ fontSize: weightFs, fontWeight: 700, lineHeight: 1, color: encre(0.50), fontFamily: FONT, fontVariantNumeric: "tabular-nums" }}>
                    {asset.weight}%
                  </span>
                </div>
              </div>
              {/* Bloc valeur + perf */}
              <div style={{ position: "relative", marginTop: "auto", display: "flex", flexDirection: "column", gap: Math.max(2, perfFs * 0.15) }}>
                {asset.value != null ? (
                  <FlipValue
                    value={asset.value.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €"}
                    style={{ fontSize: valFs, fontWeight: 700, color: encre(0.92), fontFamily: FONT, fontVariantNumeric: "tabular-nums", letterSpacing: "0.01em" }}
                  />
                ) : asset.price != null ? (
                  <FlipValue
                    value={fmtPrice(asset.price)}
                    style={{ fontSize: valFs, fontWeight: 700, color: encre(0.82), fontFamily: FONT, fontVariantNumeric: "tabular-nums", letterSpacing: "0.01em" }}
                  />
                ) : null}
                {perfBlock(perfFs)}
              </div>
            </div>
          );
        }

        // COMPACT tier — aussi basé sur sqrt(w*h)
        if (tier === "compact") {
          const narrow   = w < 95;
          const scale    = Math.sqrt(w * h);
          const pad      = Math.min(14, Math.max(7, Math.min(w, h) * 0.08));
          const logoSize = Math.min(30, Math.max(16, scale * 0.095));
          const tickerFs = Math.min(14, Math.max(9, scale * 0.052));
          const perfFs   = Math.min(13, Math.max(8, scale * 0.046));

          if (narrow) {
            const showSpark = asset.spark && asset.spark.length > 1 && h > 80;
            return (
              <div key={asset.ticker}
                className="novac-tile novac-tile-aplat"
              style={{ ...baseStyle, display: "flex", flexDirection: "column", padding: pad }}
                  onMouseEnter={() => setHovered(asset.ticker)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onAssetClick?.(asset.ticker)}
              >
                {showSpark && (() => {
                  const spW = Math.round(w * 0.82); const spH = Math.round(h * 0.22);
                  return (
                    <div style={{ position: "absolute", left: "50%", top: "52%", transform: "translate(-50%, -50%)", width: spW, height: spH, pointerEvents: "none", opacity: 0.40 }}>
                      <TileSparkline pts={asset.spark!} color={changeColor} w={spW} h={spH} updatedAt={asset.updatedAt} />
                    </div>
                  );
                })()}
                {/* Header */}
                <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
                  <AssetLogo ticker={asset.ticker} type={asset.type} size={logoSize} radius={Math.round(logoSize * 0.22)}
                    fallbackBg="transparent" fallbackBorder="transparent" fallbackTextColor={encreSur(teinte)} bare/>
                  <span style={{ fontSize: tickerFs, fontWeight: 700, color: encre(0.90), fontFamily: FONT,
                    maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {asset.ticker}
                  </span>
                </div>
                {/* Valeur + perf */}
                <div style={{ position: "relative", marginTop: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
                  {(asset.value != null || asset.price != null) && (
                    <FlipValue
                      value={asset.value != null
                        ? asset.value.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €"
                        : fmtPrice(asset.price!)}
                      style={{ fontSize: Math.min(perfFs * 1.10, 17), fontWeight: 700,
                        color: encre(0.88), fontFamily: FONT, fontVariantNumeric: "tabular-nums" }}
                    />
                  )}
                  {perfBlock(perfFs, 4)}
                </div>
              </div>
            );
          }

          // Compact horizontal
          const showSpark = asset.spark && asset.spark.length > 1 && h > 65;
          return (
            <div key={asset.ticker}
              className="novac-tile novac-tile-aplat"
              style={{ ...baseStyle, display: "flex", flexDirection: "column", padding: pad }}
              onMouseEnter={() => setHovered(asset.ticker)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onAssetClick?.(asset.ticker)}
            >
              {showSpark && (() => {
                const spW = Math.round(w * 0.38); const spH = Math.round(h * 0.28);
                return (
                  <div style={{ position: "absolute", right: Math.round(w * 0.05), top: "50%", transform: "translateY(-50%)", width: spW, height: spH, pointerEvents: "none", opacity: 0.50 }}>
                    <TileSparkline pts={asset.spark!} color={changeColor} w={spW} h={spH} updatedAt={asset.updatedAt} />
                  </div>
                );
              })()}
              {/* Header */}
              <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 7 }}>
                <AssetLogo ticker={asset.ticker} type={asset.type} size={logoSize} radius={Math.round(logoSize * 0.22)}
                  fallbackBg="transparent" fallbackBorder="transparent" fallbackTextColor={encreSur(teinte)} bare/>
                <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                  <span style={{ fontSize: tickerFs, fontWeight: 700, lineHeight: 1, color: encre(0.90), fontFamily: FONT,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {asset.ticker}
                  </span>
                  <span style={{ fontSize: tickerFs * 0.72, fontWeight: 700, lineHeight: 1, color: encre(0.55), fontFamily: FONT, fontVariantNumeric: "tabular-nums" }}>
                    {asset.weight}%
                  </span>
                </div>
              </div>
              {/* Valeur + perf */}
              <div style={{ position: "relative", marginTop: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
                {(asset.value != null || asset.price != null) && (
                  <FlipValue
                    value={asset.value != null
                      ? asset.value.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €"
                      : fmtPrice(asset.price!)}
                    style={{ fontSize: Math.min(perfFs * 1.10, 17), fontWeight: 700,
                      color: encre(0.88), fontFamily: FONT, fontVariantNumeric: "tabular-nums" }}
                  />
                )}
                {perfBlock(perfFs, 4)}
              </div>
            </div>
          );
        }

        // MINI tier
        const minDim   = Math.min(w, h);
        const tickerFs = Math.min(11, Math.max(8, minDim * 0.12));
        const perfFs   = Math.min(10, Math.max(7, minDim * 0.10));
        return (
          <div key={asset.ticker}
            className="novac-tile novac-tile-aplat"
            style={{ ...baseStyle, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 2, padding: 5 }}
            onMouseEnter={() => { setHovered(asset.ticker); setMiniPop({ asset, x, y, w, h }); }}
            onMouseLeave={() => { setHovered(null); setMiniPop(null); }}
            onClick={() => onAssetClick?.(asset.ticker)}
          >
            <span style={{
              position: "relative",
              fontSize: tickerFs, fontWeight: 700,
              color: encre(0.88), fontFamily: FONT,
              whiteSpace: "nowrap", textAlign: "center",
              maxWidth: "100%", overflow: "hidden", textOverflow: "clip",
            }}>
              {asset.ticker}
            </span>
            <span style={{
              position: "relative",
              fontSize: perfFs, fontWeight: 600,
              color: changeColor, fontFamily: FONT, fontVariantNumeric: "tabular-nums",
              textAlign: "center",
            }}>
              {changeStr}
            </span>
          </div>
        );
      })}
    </div>
  );
}
