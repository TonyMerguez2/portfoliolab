"use client";
import { useCallback, useEffect, useRef, useState } from "react";

import { CLAIR, MARGE } from "@/lib/palette";

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
/**
 * La place que le rail se réserve au-dessus et au-dessous de ses cartes.
 *
 * ⚠️ **Un rail tranche à l'horizontale, en haut comme en bas.** `overflow-x: auto` force
 * l'autre axe à devenir non visible : ce qui dépasse est coupé net. Deux choses en
 * souffraient. Les cartes d'un dossier, qui s'élèvent au survol, se retrouvaient sciées par
 * le haut. Et l'ombre portée des dossiers, qui n'avait que deux pixels devant elle, était
 * coupée **en pleine force** — un trait horizontal net juste sous le dossier, qui donnait à
 * croire que le dossier lui-même était amputé.
 *
 * ⚠️ **En haut, la réserve doit valoir au moins la translation du survol**, définie dans
 * `globals.css` sous `.novac-dossier-paquet`. Deux nombres réglés séparément, donc : celui-ci
 * est le plus grand des deux par sécurité.
 *
 * ⚠️ **En bas, la réserve vaut `MARGE`, et c'est à l'ombre de s'y tenir.** J'ai d'abord fait
 * l'inverse : mesuré la portée de l'ombre des dossiers — cinquante pixels — et réservé
 * autant. Cette place se prend forcément quelque part, et la colonne qui héberge un rail n'a
 * qu'un enfant en `flex: 1`, la courbe : c'est elle qui a rétréci de cinquante pixels pour
 * qu'une lueur puisse finir. Une ombre ne vaut pas cela. La réserve retombe donc sur la
 * marge que la page applique déjà sur ses côtés, et l'ombre de `CarteCompte` a été retaillée
 * pour s'y éteindre.
 *
 * ⚠️ **La marge négative reprend la réserve, mais le parent doit malgré tout la prévoir.**
 * Elle annule bien la place dans le flux ; elle n'empêche pas la boîte du rail de dépasser
 * de son conteneur. Sous un ancêtre qui défile, ce dépassement devient du défilement
 * fantôme — de la course pour ne montrer qu'une ombre. La colonne qui héberge un rail doit
 * donc finir sur `MARGE`, ce que la vue Résumé ne faisait pas : ses côtés en avaient dix,
 * son bas zéro.
 */
export const RESERVE_RAIL = { haut: 10, bas: MARGE };

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
        // ⚠️ **Vingt-six, comme toutes les commandes de la vue générale.** Elles y font 26
        // sans exception — sélecteur de dossier, type de tracé, découpage de la
        // répartition, bouton de tri de la grille, pilule d'ajout — et ces flèches étaient
        // les seules à 28. L'écart ne se voit pas de front, puisqu'elles flottent sur les
        // cartes au lieu de tenir une rangée ; il se voyait à la mesure, et deux pixels
        // suffisent à trahir un contrôle venu d'ailleurs.
        width: 26, height: 26, borderRadius: "50%", cursor: "pointer",
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
      {/**
        * ⚠️ **Le retrait est repris par une marge négative, pour que la rangée ne grandisse
        * pas.** Le rembourrage donne la place *dans* la zone de défilement ; la marge
        * l'annule au dehors. Sans elle, réserver de quoi soulever une carte ou de quoi finir
        * une ombre pousserait vers le bas tout ce qui suit — la courbe, le bandeau — au seul
        * motif qu'une animation pourrait avoir lieu. Voir `RESERVE_RAIL` pour d'où viennent
        * les deux nombres, et pour ce que le conteneur doit prévoir en retour.
        */}
      <div ref={rail} className="novac-rail" onScroll={mesurer} style={{
        display: cache ? "none" : "flex",
        gap: 10, overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none",
        paddingTop: RESERVE_RAIL.haut, marginTop: -RESERVE_RAIL.haut,
        paddingBottom: RESERVE_RAIL.bas, marginBottom: -RESERVE_RAIL.bas,
      }}>
        {children}
      </div>
    </div>
  );
}
