"use client";
import { useEffect, useState } from "react";

/**
 * Un mot qui se remplace par le suivant, dans un emplacement de largeur fixe.
 *
 * ⚠️ **La boîte a une largeur fixe, et le mot déborde à droite s'il est plus long.** C'est là
 * tout le mécanisme, et il tient en une ligne de style. Comme la largeur ne dépend plus du mot
 * affiché, la mise en page de la phrase ne bouge jamais : le texte qui précède garde sa place
 * au pixel, et le nombre de lignes ne peut plus changer. Le mot commence toujours au même
 * endroit ; ses lettres continuent simplement plus ou moins loin vers la droite.
 *
 * ⚠️ **Trois autres voies ont été essayées avant, et chacune échouait sur un point.**
 * Une boîte ajustée au mot recalait la ligne entière à chaque rotation — le défaut d'origine.
 * Une boîte mesurée puis animée en largeur rendait ce recalage fluide, mais c'était toujours un
 * recalage, et cela demandait un exemplaire invisible par mot, `document.fonts.ready` et un
 * `ResizeObserver`. Isoler le verbe sur sa propre ligne supprimait bien la cause, mais faisait
 * passer le titre à trois lignes.
 *
 * ⚠️ **La largeur se donne en `ch`, jamais en pixels.** Le corps du titre est en `clamp`, donc
 * il varie avec la fenêtre ; une largeur en pixels serait juste à une seule taille d'écran.
 * L'unité `ch` suit le corps, et le débord reste proportionnel partout.
 *
 * ⚠️ **Le point final est passé ici, avec le mot.** Laissé dans la phrase, il restait immobile
 * pendant que le verbe s'efface : une ponctuation flottant seule au bout d'un vide, puis le mot
 * suivant venant s'y coller.
 */
export default function MotQuiDefile({ mots, suffixe = "", largeur = "6ch", intervalle = 2600, transition = 420, style }: {
  mots: string[];
  /**
   * Largeur réservée au mot, en `ch`.
   *
   * ⚠️ **C'est elle qui décide du centrage apparent de la phrase.** Trop étroite, tous les mots
   * débordent et la phrase penche à droite ; trop large, tous laissent un blanc et elle penche à
   * gauche. La valeur juste est la moyenne des mots de la liste — mesurés à 60 px : évoluer 218,
   * performer 288, résister 223, grandir 209, changer 238, soit 235 en moyenne pour un `ch` à
   * 40 px. D'où six.
   */
  largeur?: string;
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
    <span style={{
      display: "inline-block", width: largeur, verticalAlign: "bottom",
      /* ⚠️ **Le titre est centré, donc son alignement descend jusqu'ici.** Sans ce `left`, le
         mot se centrait *dans* son emplacement : les courts partaient plus à droite que les
         longs, et son début se déplaçait à chaque rotation — exactement ce que la largeur fixe
         devait empêcher. */
      textAlign: "left",
      /* ⚠️ Le débordement doit rester visible — c'est lui qu'on cherche. Une valeur héritée de
         `hidden` couperait les mots longs en plein milieu. */
      whiteSpace: "nowrap", overflow: "visible",
      ...style,
    }}>
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
