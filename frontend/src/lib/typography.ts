import type { CSSProperties } from "react";

/**
 * Pile typographique unique de l'application.
 *
 * Elle était recopiée dans une dizaine de fichiers, et deux variantes
 * coexistaient sans que rien ne les rapproche : les cartes d'actif en
 * `SF Pro Text`, la page portefeuille en `SF Pro Display`. Ce sont deux
 * dessins différents — Display est plus resserré, Text plus ouvert — et le
 * même montant ne se lisait donc pas pareil selon l'endroit.
 */
export const FONT =
  "Geist, -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif";

/**
 * Style des valeurs chiffrées.
 *
 * Même police que le texte, avec des chiffres à chasse fixe. La page utilisait
 * `SF Mono` : les colonnes s'alignaient, mais un prix y avait l'air d'extrait
 * d'un terminal à côté de la même valeur sur une carte. `tabular-nums` donne
 * l'alignement sans changer de caractère.
 */
export const NUM: CSSProperties = { fontFamily: FONT, fontVariantNumeric: "tabular-nums" };
