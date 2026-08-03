"use client";
import type { CSSProperties, ReactNode } from "react";
import { styleCadreExterieur, styleCarteInterieure } from "@/lib/palette";

/**
 * Un panneau, avec le cadre double du concept.
 *
 * Deux couches imbriquées : l'anneau extérieur, transparent, dont le
 * rembourrage laisse voir la page à travers un voile ; puis la carte, qui porte
 * le fond, son liseré et le contenu.
 *
 * Ce composant existe parce qu'il y en avait trois exemplaires — le tableau de
 * bord, l'onglet Transactions, l'onglet Analyse — chacun avec ses propres
 * valeurs de fond, de liseré et de rayon. Ce sont les deux derniers qui
 * gardaient encore un rayon de 30 et un liseré bleuté quand le premier était
 * passé au cadre. Trois copies d'une même idée finissent toujours par diverger.
 */

/**
 * Les clés qui placent le panneau dans sa grille, par opposition à celles qui
 * habillent son contenu.
 *
 * Le tri doit être explicite : une clé de placement appliquée à la couche
 * intérieure la décrocherait de son cadre, et une clé de contenu appliquée à
 * l'extérieure repousserait la carte au lieu du texte.
 */
const CLES_DE_PLACEMENT = new Set([
  "flex", "flexShrink", "flexGrow", "flexBasis", "minHeight", "maxHeight",
  "minWidth", "maxWidth", "width", "height", "alignSelf", "order", "gridArea",
  "marginTop", "marginBottom", "marginLeft", "marginRight", "margin",
]);

export function repartir(style?: CSSProperties): { cadre: CSSProperties; carte: CSSProperties } {
  const cadre: CSSProperties = {};
  const carte: CSSProperties = {};
  for (const [cle, valeur] of Object.entries(style ?? {})) {
    (CLES_DE_PLACEMENT.has(cle) ? cadre : carte)[cle as never] = valeur as never;
  }
  return { cadre, carte };
}

export default function Cadre({
  children, style,
}: {
  children: ReactNode;
  /** Réparti automatiquement entre les deux couches. */
  style?: CSSProperties;
}) {
  const { cadre, carte } = repartir(style);
  return (
    <div style={{ ...styleCadreExterieur(), ...cadre }}>
      <div style={{ ...styleCarteInterieure(), ...carte }}>
        {children}
      </div>
    </div>
  );
}
