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
 * un bouton 22 : la ligne est tenue à 17, ils débordent dans le rembourrage de la carte, et
 * le titre reste exactement où il est. C'est ce que « Répartition » obtenait avec une marge
 * négative écrite à la main.
 */
export default function TitreDeCarte({ children, action, actionEnLigne, sous, style }: {
  children: ReactNode;
  action?: ReactNode;
  /**
   * L'action est-elle du texte nu plutôt qu'une pastille ?
   *
   * ⚠️ **Un lien ne s'emboîte pas dans un angle, il se lit sur la ligne du titre.** Poussé
   * à 6 px du bord comme une piste de pastilles, il se retrouvait huit pixels au-dessus du
   * titre, et à six pixels d'un bord où rien ne le contient — deux défauts que la pastille
   * n'a pas, parce qu'elle a une boîte. Un seul appelant est dans ce cas aujourd'hui, le
   * lien « Projeter dans Simulation » de l'onglet Analyse ; le réglage est nommé d'après ce
   * qu'il décrit plutôt que d'après lui.
   */
  actionEnLigne?: boolean;
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
          /**
           * ⚠️ **L'action s'emboîte dans l'angle haut-droit de la carte — voir `emboitement`.**
           * Elle se tenait au rembourrage de la carte, soit 16 px du bord droit et 9,5 du
           * haut : la courbe du coin passait loin de la sienne. Elle se pose maintenant à 6
           * des deux bords, l'écart qui rend les deux rayons concentriques. Les deux marges
           * viennent de la carte elle-même, qui les publie ; dans un conteneur qui n'en
           * publie pas, elles valent zéro et rien ne bouge.
           *
           * ⚠️ **Calée en haut, et non centrée sur la ligne.** Une marge sur un élément
           * centré n'est pas un décalage : la boîte redistribue la moitié de l'espace libre,
           * et la pastille n'arrivait qu'à mi-chemin. `flex-start` rend la position
           * prévisible — bord haut de la piste = bord haut de la ligne, plus la marge.
           *
           * ⚠️ **Plus de hauteur imposée de 17 px.** Elle servait à ce que l'action ne fasse
           * pas respirer la ligne ; c'est la ligne elle-même qui la tient, à 17, et la
           * pastille déborde dans le rembourrage comme avant.
           */
          <div style={{
            ...(actionEnLigne
              ? { height: 17 }
              : {
                alignSelf: "flex-start",
                marginTop: "var(--nv-emboite-haut, 0px)",
                marginRight: "var(--nv-emboite-droite, 0px)",
              }),
            display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
          }}>
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
