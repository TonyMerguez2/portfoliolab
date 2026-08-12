"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactionAvatar from "@/components/ReactionAvatar";
import CarteActif from "@/components/portfolio/CarteActif";
import { arrange, assetClass, type GridAsset, type SortKey } from "@/lib/portfolio";
import { FONT, NUM } from "@/lib/typography";
import { CLAIR, RAYONS } from "@/lib/palette";
import Segments from "@/components/ui/Segments";

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

export default function AssetGrid({
  assets, onAssetClick, view, titre = "Vos actifs",
}: {
  assets: GridAsset[];
  onAssetClick?: (ticker: string) => void;
  /** Vue courante. La bascule visible est retirée ; le rail se masque encore
   *  si le parent bascule en liste par un autre chemin. */
  view?: "carte" | "liste";
  /**
   * Ce que la grille annonce à sa gauche.
   *
   * ⚠️ **Prop, et non chaîne fixe, parce que la grille peut ne plus tout montrer.**
   * Un dossier ouvert au-dessus filtre ces cartes : laisser « Vos actifs » ferait lire
   * une grille amputée comme le portefeuille entier. Le seul autre indice — le dossier
   * soulevé — sort du champ dès qu'on descend.
   */
  titre?: string;
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

  /**
   * Le filtre réellement appliqué.
   *
   * ⚠️ **Dérivé, parce que la liste des classes bouge sous lui.** Un dossier ouvert
   * au-dessus rétrécit `assets`, donc `classes` : choisir « Actions » puis ouvrir
   * « Crypto » laissait une grille vide, sans onglet marqué, sans rien qui explique
   * pourquoi — mesuré, 0 carte pour 3 attendues. On retombe sur « Tous » tant que le
   * choix n'a plus de sens, sans l'effacer : refermer le dossier le rend.
   */
  const filtreActif = classes.indexOf(filter) >= 0 ? filter : "Tous";

  const shown = useMemo(() => arrange(assets, filtreActif, sort), [assets, filtreActif, sort]);

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

  /**
   * La variation moyenne des lignes montrées, qui sert de repère à l'avatar.
   *
   * Simple moyenne et non moyenne pondérée : on compare des **lignes** entre elles,
   * pas leur contribution au portefeuille. Une petite ligne qui s'envole doit
   * surprendre autant qu'une grosse.
   */
  const moyenneChange = useMemo(() => {
    const v = shown.map(a => a.change).filter((c): c is number => typeof c === "number");
    return v.length ? v.reduce((s, c) => s + c, 0) / v.length : null;
  }, [shown]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Une seule ligne : titre, filtres, puis le tri à droite — comme au
          concept. Le titre vivait au-dessus, dans une barre séparée qui
          portait aussi une infobulle et un bouton d'ajout absents du concept. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: CLAIR.surFond, whiteSpace: "nowrap" }}>
            {titre}
          </span>
        <Segments taille="sm" ariaLabel="Filtrer par classe d'actif"
          valeur={filtreActif} onChange={setFilter}
          options={classes.map(c => ({ valeur: c, libelle: c }))} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative", flexShrink: 0 }}>
          <span style={{ fontFamily: FONT, fontSize: 11, color: CLAIR.surFondAttenue, whiteSpace: "nowrap" }}>
            Trier par
          </span>
          <button type="button" onClick={() => setMenuTri(v => !v)}
            aria-haspopup="listbox" aria-expanded={menuTri}
            style={{
              display: "flex", alignItems: "center", gap: 6, height: 26, padding: "0 10px",
              borderRadius: RAYONS.sm, cursor: "pointer", border: "none",
              background: menuTri ? CLAIR.carteCreuse : CLAIR.carte,
              color: CLAIR.texte, fontFamily: FONT, fontSize: 11.5, fontWeight: 500,
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
                background: CLAIR.carte, border: `1px solid ${CLAIR.bordFort}`,
                borderRadius: RAYONS.md, padding: 4, boxShadow: CLAIR.ombre,
              }}>
                {(Object.keys(TRIS) as SortKey[]).map(k => (
                  <button key={k} type="button" role="option" aria-selected={k === sort}
                    onClick={() => { setSort(k); setMenuTri(false); }}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                      height: 28, padding: "0 9px", borderRadius: RAYONS.xs, border: "none", cursor: "pointer",
                      background: k === sort ? CLAIR.accentDoux : "transparent",
                      color: k === sort ? CLAIR.texte : CLAIR.texteSecondaire,
                      fontFamily: FONT, fontSize: 11.5, fontWeight: k === sort ? 600 : 500, textAlign: "left",
                    }}
                    onMouseEnter={e => { if (k !== sort) e.currentTarget.style.background = CLAIR.carteCreuse; }}
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
          background:`linear-gradient(to right, ${CLAIR.fond}, transparent)` }} />}
        {view !== "liste" && debord.droite && <div style={{ position:"absolute", right:0, top:0, bottom:0, width:44, zIndex:2, pointerEvents:"none",
          background:`linear-gradient(to left, ${CLAIR.fond}, transparent)` }} />}
      <div ref={railRef} className="novac-rail" onScroll={mesurer} style={{
        display: view === "liste" ? "none" : "flex",
        gap: 10, overflowX: "auto", overflowY: "hidden",
        scrollbarWidth: "none", paddingBottom: 2,
      }}>
        {shown.map(a => {
          /**
           * ⚠️ **L'avatar réagit à l'écart au portefeuille, pas à la variation brute.**
           * `change` est la variation sur la **période affichée** : sur la fenêtre Max
           * elle atteint des centaines de pour cent, si bien que toutes les lignes
           * franchissaient le seuil de l'étonnement — le visage était surpris en
           * permanence, donc ne disait plus rien, et sursautait à chaque carte
           * survolée. Comparée à la moyenne des lignes, la même donnée redevient
           * lisible : cette ligne fait-elle mieux ou moins bien que les autres ?
           */
          const ecart = a.change != null && moyenneChange != null
            ? a.change - moyenneChange : null;
          return (
            <ReactionAvatar key={a.ticker} variation={ecart}>
            <CarteActif a={a}
              onClick={onAssetClick ? () => onAssetClick(a.ticker) : undefined} />
            </ReactionAvatar>
          );
        })}
      </div>
      </div>

    </div>
  );
}
