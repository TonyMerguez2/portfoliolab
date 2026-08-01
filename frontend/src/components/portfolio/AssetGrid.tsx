"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TileCard from "@/components/TileCard";
import AssetLogo from "@/components/AssetLogo";
import TileSparkline from "@/components/charts/TileSparkline";
import { brandHex } from "@/lib/tileStyle";
import { assetName } from "@/lib/assets";
import { arrange, assetClass, type GridAsset, type SortKey } from "@/lib/portfolio";
import { FONT, NUM } from "@/lib/typography";

export type { GridAsset, SortKey };

/**
 * Grille d'actifs à cartes de taille égale.
 *
 * Remplace la treemap pondérée. Le poids se lit désormais en chiffres, en haut
 * de chaque carte, plutôt qu'en surface : l'aire est un encodage faible — on
 * compare mal deux rectangles de proportions différentes — et surtout elle
 * rendait les petites lignes illisibles, alors que ce sont souvent celles
 * qu'on veut inspecter. À taille égale, chaque actif reçoit la même place pour
 * son prix, sa variation et sa courbe.
 *
 * L'habillage vient de TileCard, donc strictement le même que les cartes de la
 * page graphique : fond, bord dégradé, reflet au survol.
 */


const TRIS: Record<SortKey, string> = {
  poids: "Poids", perf: "Performance", valeur: "Valeur", alpha: "Nom",
};

const eur = (v: number, dec = 2) =>
  v.toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + " €";

export default function AssetGrid({
  assets, onAssetClick, view,
}: {
  assets: GridAsset[];
  onAssetClick?: (ticker: string) => void;
  /** Vue courante. La bascule visible est retirée ; le rail se masque encore
   *  si le parent bascule en liste par un autre chemin. */
  view?: "carte" | "liste";
}) {
  const [filter, setFilter] = useState("Tous");
  const [sort, setSort] = useState<SortKey>("poids");
  const [menuTri, setMenuTri] = useState(false);

  // Seules les classes réellement présentes sont proposées : un onglet « Crypto »
  // sur un portefeuille d'actions ne mène qu'à une grille vide.
  const classes = useMemo(() => {
    const present = new Set(assets.map(a => assetClass(a.ticker)));
    return ["Tous", ...(["Actions", "ETF", "Crypto"] as const).filter(c => present.has(c))];
  }, [assets]);

  const shown = useMemo(() => arrange(assets, filter, sort), [assets, filter, sort]);

  // Un rail horizontal cache ses éléments sur un axe qu'on ne pense pas à
  // explorer. On mesure donc ce qui dépasse de chaque côté, pour l'annoncer :
  // sans ce repère, un portefeuille de douze lignes en montre sept et laisse
  // croire qu'il n'en a que sept.
  const railRef = useRef<HTMLDivElement>(null);
  const [debord, setDebord] = useState({ gauche: false, droite: false });

  const mesurer = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    setDebord({
      gauche: el.scrollLeft > 2,
      droite: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
    });
  }, []);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    mesurer();
    // Le panneau latéral se replie sans que la fenêtre change de taille : il
    // faut observer le rail lui-même, pas l'évènement resize.
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mesurer, shown.length]);

  const glisser = (sens: -1 | 1) => {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: sens * Math.max(258, el.clientWidth * 0.8), behavior: "smooth" });
  };

  const Fleche = ({ sens }: { sens: -1 | 1 }) => (
    <button type="button" aria-label={sens < 0 ? "Actifs précédents" : "Actifs suivants"}
      onClick={() => glisser(sens)}
      style={{
        position: "absolute", top: "50%", transform: "translateY(-50%)",
        [sens < 0 ? "left" : "right"]: 2, zIndex: 3,
        width: 28, height: 28, borderRadius: "50%", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(8,20,42,0.88)", border: "1px solid rgba(255,255,255,0.14)",
        color: "rgba(255,255,255,0.75)", backdropFilter: "blur(8px)",
      }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d={sens < 0 ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
      </svg>
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Une seule ligne : titre, filtres, puis le tri à droite — comme au
          concept. Le titre vivait au-dessus, dans une barre séparée qui
          portait aussi une infobulle et un bouton d'ajout absents du concept. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,0.88)", whiteSpace: "nowrap" }}>
            Vos actifs
          </span>
        <div style={{ display: "flex", gap: 4 }}>
          {classes.map(c => (
            <button key={c} type="button" onClick={() => setFilter(c)}
              style={{
                padding: "0 11px", height: 26, borderRadius: 7, border: "none", cursor: "pointer",
                fontFamily: FONT, fontSize: 11.5, fontWeight: c === filter ? 600 : 500,
                background: c === filter ? "rgba(255,255,255,0.10)" : "transparent",
                color: c === filter ? "#F8F9FC" : "rgba(248,249,252,0.45)",
                transition: "background 140ms, color 140ms",
              }}>{c}</button>
          ))}
        </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative", flexShrink: 0 }}>
          <span style={{ fontFamily: FONT, fontSize: 11, color: "rgba(248,249,252,0.40)", whiteSpace: "nowrap" }}>
            Trier par
          </span>
          <button type="button" onClick={() => setMenuTri(v => !v)}
            aria-haspopup="listbox" aria-expanded={menuTri}
            style={{
              display: "flex", alignItems: "center", gap: 6, height: 26, padding: "0 10px",
              borderRadius: 7, cursor: "pointer", border: "none",
              background: menuTri ? "rgba(255,255,255,0.11)" : "rgba(255,255,255,0.06)",
              color: "#F8F9FC", fontFamily: FONT, fontSize: 11.5, fontWeight: 500,
              transition: "background 140ms",
            }}>
            {TRIS[sort]}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"
              style={{ opacity: 0.5, transform: menuTri ? "rotate(180deg)" : "none", transition: "transform 160ms" }}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {menuTri && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setMenuTri(false)} />
              <div role="listbox" style={{
                position: "absolute", top: "calc(100% + 5px)", right: 0, zIndex: 41, minWidth: 132,
                background: "rgba(6,20,42,0.97)", border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 9, padding: 4, boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
              }}>
                {(Object.keys(TRIS) as SortKey[]).map(k => (
                  <button key={k} type="button" role="option" aria-selected={k === sort}
                    onClick={() => { setSort(k); setMenuTri(false); }}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                      height: 28, padding: "0 9px", borderRadius: 6, border: "none", cursor: "pointer",
                      background: k === sort ? "rgba(255,255,255,0.08)" : "transparent",
                      color: k === sort ? "#F8F9FC" : "rgba(248,249,252,0.62)",
                      fontFamily: FONT, fontSize: 11.5, fontWeight: k === sort ? 600 : 500, textAlign: "left",
                    }}
                    onMouseEnter={e => { if (k !== sort) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                    onMouseLeave={e => { if (k !== sort) e.currentTarget.style.background = "transparent"; }}>
                    {TRIS[k]}
                    {k === sort && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Rail horizontal. Les cartes gardent une largeur fixe — c'est ce qui
          les maintient toutes à la même taille — et le rail défile. */}
      <div style={{ position: "relative", minWidth: 0 }}>
        {view !== "liste" && debord.gauche && <Fleche sens={-1} />}
        {view !== "liste" && debord.droite && <Fleche sens={1} />}
        {/* Voiles de bord : ils coupent les cartes en lisière plutôt que de les
            laisser finir net, ce qui signale la continuation même à l'arrêt. */}
        {view !== "liste" && debord.gauche && <div style={{ position:"absolute", left:0, top:0, bottom:0, width:44, zIndex:2, pointerEvents:"none",
          background:"linear-gradient(to right, var(--novac-bg), transparent)" }} />}
        {view !== "liste" && debord.droite && <div style={{ position:"absolute", right:0, top:0, bottom:0, width:44, zIndex:2, pointerEvents:"none",
          background:"linear-gradient(to left, var(--novac-bg), transparent)" }} />}
      <div ref={railRef} className="novac-rail" onScroll={mesurer} style={{
        display: view === "liste" ? "none" : "flex",
        gap: 10, overflowX: "auto", overflowY: "hidden",
        scrollbarWidth: "none", paddingBottom: 2,
      }}>
        {shown.map(a => {
          const up = (a.change ?? 0) >= 0;
          const chg = up ? "#4ade80" : "#f87171";
          const name = assetName(a.ticker);
          return (
            <TileCard key={a.ticker} ticker={a.ticker} radius={12}
              colorHex={brandHex(a.ticker)}
              onClick={onAssetClick ? () => onAssetClick(a.ticker) : undefined}
              containerStyle={{ height: 196, width: 248, flexShrink: 0 }}
              style={{ height: "100%", display: "flex", flexDirection: "column", padding: "14px 15px" }}>

              {/* Identité */}
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <AssetLogo ticker={a.ticker} type={a.type || "EQUITY"} size={32} radius={8}
                  fallbackBg="rgba(255,255,255,0.10)" fallbackBorder="rgba(255,255,255,0.16)"
                  fallbackTextColor="#fff" bare />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: FONT, fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.94)",
                    lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.ticker.replace(/-USD$/, "")}
                  </div>
                  {name && (
                    <div style={{ fontFamily: FONT, fontSize: 11.5, fontWeight: 550, color: "rgba(255,255,255,0.45)",
                      lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {name}
                    </div>
                  )}
                </div>
                <span style={{ ...NUM, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.50)", flexShrink: 0 }}>
                  {a.weight.toFixed(a.weight < 10 ? 1 : 0)}%
                </span>
              </div>

              {/* Cours et variation */}
              <div style={{ marginTop: 10 }}>
                <div style={{ ...NUM, fontSize: 20, fontWeight: 700, color: "rgba(255,255,255,0.94)", lineHeight: 1.1 }}>
                  {a.price != null ? eur(a.price) : "—"}
                </div>
                <div style={{ ...NUM, fontSize: 12.5, fontWeight: 600, color: chg, marginTop: 3 }}>
                  {a.change != null ? `${up ? "+" : ""}${a.change.toFixed(2)} %` : "—"}
                  {a.perfEur != null && (
                    <span style={{ opacity: 0.62, marginLeft: 5 }}>
                      {up ? "+" : ""}{Math.round(a.perfEur).toLocaleString("fr-FR")} €
                    </span>
                  )}
                </div>
              </div>

              {/* Courbe sur toute la largeur, comme au concept : rangée à
                  droite sur la moitié de la carte, elle laissait un vide à
                  gauche que rien ne venait occuper. */}
              <div style={{ flex: 1, display: "flex", alignItems: "flex-end", minHeight: 0, marginLeft: -2 }}>
                {a.spark && a.spark.length > 1 && (
                  <TileSparkline pts={a.spark} color={chg} w={222} h={42} updatedAt={a.updatedAt} />
                )}
              </div>

              {/* Valeur détenue. Masquée faute de valeur totale au portefeuille :
                  une ligne « Valeur — » répétée sur chaque carte n'apprend rien
                  et occupe la place d'un trait de séparation utile. */}
              {a.value != null && (
                <div style={{
                  display: "flex", alignItems: "baseline", justifyContent: "space-between",
                  marginTop: 8, paddingTop: 7, borderTop: "1px solid rgba(255,255,255,0.07)",
                }}>
                  <span style={{ fontFamily: FONT, fontSize: 10, color: "rgba(255,255,255,0.38)" }}>Valeur</span>
                  <span style={{ ...NUM, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.88)" }}>
                    {eur(a.value, 0)}
                  </span>
                </div>
              )}
            </TileCard>
          );
        })}
      </div>
      </div>

    </div>
  );
}
