"use client";
import { useEffect, useState } from "react";

/**
 * Un mot qui se remplace par le suivant, seul sur sa ligne.
 *
 * ⚠️ **La ligne à lui seul est ce qui rend ce composant simple.** Une première version gardait
 * le verbe dans la phrase, à la suite de « et ce qui le fait ». Comme « performer » et
 * « grandir » ne mesurent pas la même chose et que le titre est centré, chaque changement
 * recalait la ligne entière : le texte qui précède glissait à chaque rotation. Pour l'empêcher,
 * cette version mesurait chaque mot sur un exemplaire invisible, attendait
 * `document.fonts.ready`, écoutait un `ResizeObserver` et animait la largeur de la boîte — une
 * machinerie entière au service d'un défaut de mise en page.
 *
 * ⚠️ **Isoler le verbe supprime la cause au lieu de la compenser.** Seul sur sa ligne, il ne
 * pousse plus rien : ce qui le précède est figé par construction, et sa propre largeur n'a plus
 * d'importance puisque la ligne se centre d'elle-même. Il ne reste qu'un fondu. Les mesures,
 * l'observateur, l'animation de largeur et le `!important` qui allait avec ont disparu — ainsi
 * que la règle qui isolait déjà le verbe sous 560 px, devenue le cas général.
 *
 * ⚠️ **Le point final est passé ici, avec le mot.** Laissé dans la phrase, il restait immobile
 * pendant que le verbe s'efface : une ponctuation flottant seule au bout d'un vide, puis le mot
 * suivant venant s'y coller.
 */
export default function MotQuiDefile({ mots, suffixe = "", intervalle = 2600, transition = 420, style }: {
  mots: string[];
  /** Ce qui suit le mot et s'efface avec lui — un point final, en pratique. */
  suffixe?: string;
  /** Durée d'affichage d'un mot, transition comprise. */
  intervalle?: number;
  /** Durée du fondu, en millisecondes. */
  transition?: number;
  style?: React.CSSProperties;
}) {
  const [index, setIndex] = useState(0);
  const [sortant, setSortant] = useState(false);

  /**
   * ⚠️ **Le réglage système l'emporte sur l'effet.** Qui a demandé moins d'animations ne veut
   * pas d'un mot qui change tout seul toutes les deux secondes et demie — c'est exactement le
   * genre de mouvement périphérique que ce réglage vise. La phrase garde alors son premier mot,
   * et son sens ne dépend d'aucun des autres.
   */
  const [anime, setAnime] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const lire = () => setAnime(!mq.matches);
    lire();
    mq.addEventListener("change", lire);
    return () => mq.removeEventListener("change", lire);
  }, []);

  useEffect(() => {
    if (!anime || mots.length < 2) return;
    /**
     * ⚠️ **Deux temps et non un.** Le mot sortant s'efface d'abord, le suivant entre ensuite :
     * les croiser ferait se superposer deux textes à mi-course, illisibles l'un sur l'autre.
     */
    const t1 = setTimeout(() => {
      setSortant(true);
      setTimeout(() => { setIndex(i => (i + 1) % mots.length); setSortant(false); }, transition);
    }, intervalle);
    return () => clearTimeout(t1);
  }, [index, anime, mots.length, intervalle, transition]);

  return (
    <span style={{ display: "block", ...style }}>
      <span style={{
        display: "inline-block", whiteSpace: "nowrap",
        opacity: sortant ? 0 : 1,
        transform: sortant ? "translateY(-0.16em)" : "translateY(0)",
        transition: anime
          ? `opacity ${transition}ms ease, transform ${transition}ms cubic-bezier(0.4, 0, 0.2, 1)`
          : "none",
      }}>
        {mots[index]}{suffixe}
      </span>
    </span>
  );
}
