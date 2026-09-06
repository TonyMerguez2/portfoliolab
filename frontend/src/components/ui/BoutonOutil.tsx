"use client";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { JETONS, RAYONS } from "@/lib/palette";

/**
 * Un bouton d'outil carré, 26 px, posé à côté d'une piste de pastilles.
 *
 * ⚠️ **C'est le bouton du bandeau du graphique du portefeuille, sorti de là pour que la page
 * d'un actif ait le même.** Celle-ci avait sa propre famille : 30 px, arrondi 9, verre flouté,
 * teinte d'accent quand actif, ombre portée — six boutons, chacun avec ses quarante lignes de
 * style recopiées. Deux pages, deux vocabulaires pour la même commande. Le bouton reprend les
 * jetons de la piste — même fond creusé, même pastille blanche quand il est actif — parce qu'il
 * vit toujours à côté d'elle et doit se lire comme un de ses membres.
 *
 * `actif` est l'état que le bouton annonce (un panneau ouvert, un mode en cours), pas le
 * survol : il passe en pastille blanche, comme l'option retenue d'une piste.
 */
export default function BoutonOutil({ actif = false, titre, onClick, children, style }: {
  actif?: boolean;
  titre: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={titre} aria-pressed={actif}
      style={{
        background: actif ? JETONS.segmentActif : JETONS.segmentPiste,
        border: `1px solid ${actif ? JETONS.segmentActif : JETONS.bord}`,
        borderRadius: RAYONS.sm, width: 26, height: 26, cursor: "pointer", flexShrink: 0,
        padding: 0, display: "flex", alignItems: "center", justifyContent: "center",
        color: actif ? JETONS.segmentEncre : JETONS.texteFort,
        boxShadow: actif ? JETONS.segmentOmbre : "none",
        transition: "background 250ms, color 250ms",
        ...style,
      }}>
      {children}
    </button>
  );
}
