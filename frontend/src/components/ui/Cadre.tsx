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
  // ⚠️ **`gridColumn` manquait, et son absence ne se voyait pas.** Seul `gridArea`
  // figurait ici, alors que les appelants écrivent naturellement
  // `gridColumn: "1 / -1"` — la forme courte, de loin la plus répandue. Appliquée à la
  // couche intérieure, elle ne fait **rien** : ce div n'est pas un élément de grille.
  // Aucune erreur, aucun avertissement, simplement un panneau qui reste dans sa
  // colonne. Constaté à l'écran sur l'onglet Objectifs, dont la rangée de cartes devait
  // traverser la largeur et s'entassait dans un tiers.
  "gridColumn", "gridRow", "gridColumnStart", "gridColumnEnd",
  "gridRowStart", "gridRowEnd", "justifySelf", "placeSelf",
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
  children, style, classeCarte, teinte,
}: {
  children: ReactNode;
  /** Réparti automatiquement entre les deux couches. */
  style?: CSSProperties;
  /**
   * Une classe pour la couche **intérieure**, celle qui porte le fond, le liseré
   * et le rayon.
   *
   * Le nom dit explicitement laquelle des deux couches la reçoit : un simple
   * `className` laisserait à deviner, et se tromper de couche est silencieux —
   * un effet de bord posé sur l'anneau extérieur habillerait le vide entre les
   * deux cadres au lieu du liseré qu'on visait.
   */
  classeCarte?: string;
  /**
   * Les couleurs des deux anneaux, quand la carte ne prend pas celles du thème.
   *
   * ⚠️ **Passées ici plutôt que dans `style`, parce que `style` ne peut pas les
   * atteindre.** La répartition envoie tout ce qui n'est pas du placement à la couche
   * *intérieure* : un `border` écrit par l'appelant habille la carte, jamais le cadre qui
   * l'entoure. Sans cette porte, une carte teintée garderait un cadre extérieur du thème
   * autour d'un fond qui n'en est plus — c'est-à-dire un anneau étranger, exactement ce
   * que ce composant existe pour éviter.
   */
  teinte?: { cadre: string; voile: string; bord: string };
}) {
  const { cadre, carte } = repartir(style);
  return (
    <div style={{
      ...styleCadreExterieur(),
      ...(teinte ? { background: teinte.voile, border: `1px solid ${teinte.cadre}` } : {}),
      ...cadre,
    }}>
      <div className={classeCarte} style={{
        ...styleCarteInterieure(),
        ...(teinte ? { border: `1px solid ${teinte.bord}` } : {}),
        ...carte,
      }}>
        {children}
      </div>
    </div>
  );
}
