"use client";
import type { CSSProperties, ReactNode } from "react";
import { FONT } from "@/lib/typography";
import { CLAIR } from "@/lib/palette";

/**
 * L'en-tête d'une carte : le titre, une action éventuelle à droite, un sous-titre éventuel.
 *
 * ⚠️ **Une seule implémentation, mesurée sur « Répartition » et « Activité ».** Chaque onglet
 * avait la sienne : 12,5 px ici, 13 là, 15 en gras ailleurs ; un rembourrage de carte de
 * 13 × 15 sur la vue générale, 16 × 18 sur les événements, 14 × 16 sur les objectifs ; un
 * titre posé à 13 px du haut sur une carte et à 21 sur la voisine. Relevé dans le
 * navigateur, onglet par onglet, avant d'écrire ceci. Le titre est à 12,5 px en graisse
 * 600, sur une ligne de 17 px, et il tombe à 13 px du bord haut d'une carte rembourrée à
 * 13 × 15 — ce que fait « Activité ».
 *
 * ⚠️ **L'action ne change pas la hauteur de la ligne.** Une piste de pastilles fait 26 px,
 * un bouton 22 : enfermés dans une boîte de 17 px centrée, ils débordent de quelques pixels
 * de part et d'autre, dans le rembourrage, et le titre reste exactement où il est. C'est
 * ce que « Répartition » obtenait avec une marge négative écrite à la main.
 */
export default function TitreDeCarte({ children, action, sous, style }: {
  children: ReactNode;
  action?: ReactNode;
  sous?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={{ flexShrink: 0, marginBottom: 8, ...style }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, height: 17 }}>
        <span style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: CLAIR.texte, lineHeight: "17px",
                       minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {children}
        </span>
        {action && (
          <div style={{ height: 17, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {action}
          </div>
        )}
      </div>
      {sous && (
        <div style={{ marginTop: 3, fontFamily: FONT, fontSize: 11, color: CLAIR.texteAttenue }}>
          {sous}
        </div>
      )}
    </div>
  );
}
