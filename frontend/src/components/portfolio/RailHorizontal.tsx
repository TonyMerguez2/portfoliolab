"use client";
import { useCallback, useEffect, useRef, useState } from "react";

import { CLAIR } from "@/lib/palette";

/**
 * Une rangée qui défile horizontalement, et qui dit ce qu'elle cache.
 *
 * ⚠️ **Un rail cache ses éléments sur un axe qu'on ne pense pas à explorer.** Une grille
 * qui se replie montre tout ; un rail montre ce qui tient et tait le reste. Sans repère,
 * un portefeuille de douze lignes en montre sept et laisse croire qu'il n'en a que sept.
 * On mesure donc ce qui dépasse de chaque côté pour l'annoncer : un voile qui coupe les
 * cartes en lisière plutôt que de les laisser finir net, et une flèche pour avancer.
 *
 * ⚠️ **Le débordement se mesure sur le rail, pas sur la fenêtre.** Le panneau latéral se
 * replie sans que la fenêtre change de taille : un écouteur `resize` ne verrait rien
 * passer. D'où l'observateur posé sur l'élément lui-même.
 *
 * Sorti de la grille d'actifs le jour où les dossiers de compte ont pris la même place
 * et le même défilement — deux copies auraient divergé, et c'est justement le genre de
 * détail qu'on ne recopie qu'à moitié.
 */
export default function RailHorizontal({
  children, cache = false, pasMinimal = 258,
}: {
  children: React.ReactNode;
  /** Masqué sans être démonté, quand le parent montre autre chose à la place. */
  cache?: boolean;
  /** Le pas d'un coup de flèche, quand la largeur visible est plus étroite. */
  pasMinimal?: number;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [debord, setDebord] = useState({ gauche: false, droite: false });

  const mesurer = useCallback(() => {
    const el = rail.current;
    if (!el) return;
    setDebord({
      gauche: el.scrollLeft > 2,
      droite: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
    });
  }, []);

  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    mesurer();
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mesurer, children]);

  const glisser = (sens: -1 | 1) => {
    const el = rail.current;
    if (!el) return;
    el.scrollBy({ left: sens * Math.max(pasMinimal, el.clientWidth * 0.8), behavior: "smooth" });
  };

  const Fleche = ({ sens }: { sens: -1 | 1 }) => (
    <button type="button" aria-label={sens < 0 ? "Précédent" : "Suivant"}
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
        strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={sens < 0 ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
      </svg>
    </button>
  );

  const voile = (cote: "gauche" | "droite") => (
    <div style={{
      position: "absolute", [cote === "gauche" ? "left" : "right"]: 0, top: 0, bottom: 0,
      width: 44, zIndex: 2, pointerEvents: "none",
      background: `linear-gradient(to ${cote === "gauche" ? "right" : "left"}, ${CLAIR.fond}, transparent)`,
    }} />
  );

  return (
    <div style={{ position: "relative", minWidth: 0 }}>
      {!cache && debord.gauche && <Fleche sens={-1} />}
      {!cache && debord.droite && <Fleche sens={1} />}
      {!cache && debord.gauche && voile("gauche")}
      {!cache && debord.droite && voile("droite")}
      <div ref={rail} className="novac-rail" onScroll={mesurer} style={{
        display: cache ? "none" : "flex",
        gap: 10, overflowX: "auto", overflowY: "hidden",
        scrollbarWidth: "none", paddingBottom: 2,
      }}>
        {children}
      </div>
    </div>
  );
}
