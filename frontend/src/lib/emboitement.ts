import type { CSSProperties } from "react";
import { CADRE } from "./palette";

/**
 * L'emboîtement d'une pastille dans l'angle de sa carte.
 *
 * ⚠️ **Un angle n'est propre que si les deux rayons sont concentriques.** La règle est celle
 * que le cadre double s'applique déjà à lui-même : `rayon extérieur = écart + rayon
 * intérieur`, soit l'anneau de 24, son rembourrage de `CADRE`, et la carte de 18. Une
 * pastille de rayon 12 posée dans une carte de rayon 18 suit la même arithmétique : elle
 * doit se tenir à **`CADRE` du bord**, sans quoi la courbe du coin passe loin de la sienne
 * et l'ensemble paraît posé de travers. Signalé à l'usage, capture à l'appui, d'abord sur
 * le graphique du tableau de bord puis sur toutes les autres cartes.
 *
 * ⚠️ **La correction se publie en variables, elle ne se calcule pas chez l'appelant.** Le
 * rembourrage varie d'une carte à l'autre — 13 × 15 sur la vue générale, 14 × 18 sur la page
 * graphique, 8 × 12 sur le graphique du tableau de bord — et l'en-tête qui porte la pastille
 * est un composant partagé qui ne sait pas dans quelle carte il vit. La carte publie donc
 * *sa* correction, l'en-tête l'applique sans rien savoir, et une carte qui ne publie rien
 * laisse ses pastilles exactement où elles étaient : le repli de chaque variable vaut zéro.
 */

export type Cotes = { haut: number; droite: number; bas: number; gauche: number };

/**
 * Les quatre côtés d'un rembourrage CSS abrégé.
 *
 * Rend `null` sur ce qu'on ne sait pas lire — une valeur en `em`, un calcul — plutôt qu'un
 * zéro qui se ferait passer pour une mesure et décalerait la pastille du mauvais côté.
 */
export function cotes(padding: string | number | undefined): Cotes | null {
  if (padding == null) return null;
  if (typeof padding === "number") {
    return { haut: padding, droite: padding, bas: padding, gauche: padding };
  }
  const parts = padding.trim().split(/\s+/);
  if (parts.length === 0 || parts.length > 4) return null;
  const n = parts.map(p => (/^-?\d+(\.\d+)?(px)?$/.test(p) ? parseFloat(p) : NaN));
  if (n.some(v => !Number.isFinite(v))) return null;
  const [a, b = a, c = a, d = b] = n;
  return { haut: a, droite: b, bas: c, gauche: d };
}

/**
 * Les variables à poser sur une carte pour que ses pastilles d'angle s'y emboîtent.
 *
 * `filet` est l'épaisseur du liseré de la carte : il compte dans l'écart au bord extérieur,
 * et `styleCarteInterieure` en pose toujours un.
 */
export function emboitement(padding: string | number | undefined, filet = 1): CSSProperties {
  const c = cotes(padding);
  if (!c) return {};
  const correction = (n: number) => `${CADRE - (n + filet)}px`;
  return {
    "--nv-emboite-haut": correction(c.haut),
    "--nv-emboite-droite": correction(c.droite),
    "--nv-emboite-gauche": correction(c.gauche),
  } as CSSProperties;
}
