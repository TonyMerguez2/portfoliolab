"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Le passage d'une forme à l'autre, en une seule valeur.
 *
 * ⚠️ **Sorti des composants parce qu'ils sont deux.** L'avatar de l'application et le banc
 * d'essai changent tous deux de forme, et tous deux ont besoin de la même boucle : la même
 * durée, la même courbe, la même façon de repartir quand une bascule survient pendant une
 * bascule. Deux copies auraient divergé au premier ajustement de la durée — et cette
 * divergence-là ne se voit pas, elle se ressent.
 *
 * ⚠️ **Le crochet ne rend pas un volume, seulement l'état de la transition.** Chaque
 * appelant construit le sien : le banc y ajoute son curseur d'arrondi, l'application non.
 * Lui faire rendre le volume aurait demandé de lui passer tout ce dont il dépend, donc de
 * remonter le réglage d'arrondi dans un crochet qui n'a rien à en connaître.
 */

/**
 * La durée d'une morphose, en millisecondes.
 *
 * ⚠️ Réglée à vue. En deçà de trois cents, on ne voit pas la forme intermédiaire et le
 * changement se lit comme un remplacement ; au-delà de six cents, on attend. À 420 le
 * volume a le temps de se déformer sans jamais faire patienter.
 */
export const DUREE_MORPHOSE = 420;

/**
 * L'adoucissement — une courbe en `S`.
 *
 * ⚠️ **Il porte sur le mélange des volumes, pas sur une opacité.** La part avance
 * linéairement dans le temps ; la courbe la ralentit au départ et à l'arrivée, ce qui donne
 * à la forme le poids d'un objet qui se déforme plutôt que d'un réglage qu'on pousse.
 */
export const adoucir = (u: number) => u * u * (3 - 2 * u);

export type Morphose<T> = { de: T; part: number };

export function useMorphose<T>(forme: T, anime: boolean = true): Morphose<T> | null {
  const [transition, setTransition] = useState<Morphose<T> | null>(null);
  const precedente = useRef(forme);

  /**
   * ⚠️ **Le changement est appliqué tout de suite ; la transition n'est qu'un rattrapage.**
   * On garde la forme *précédente* et on la rejoint. L'inverse — retenir la nouvelle forme
   * jusqu'à la fin du fondu — ferait qu'une seconde bascule en cours de route repartirait
   * d'un état déjà faux, celui qu'on n'a pas encore fini d'atteindre. Ici une bascule
   * pendant une bascule repart simplement d'où l'on en est.
   */
  useEffect(() => {
    const de = precedente.current;
    if (de === forme) return;
    precedente.current = forme;
    if (!anime) { setTransition(null); return; }
    let image = 0;
    const debut = performance.now();
    const avancer = (t: number) => {
      const u = Math.min(1, (t - debut) / DUREE_MORPHOSE);
      setTransition(u >= 1 ? null : { de, part: adoucir(u) });
      if (u < 1) image = requestAnimationFrame(avancer);
    };
    image = requestAnimationFrame(avancer);
    return () => cancelAnimationFrame(image);
  }, [forme, anime]);

  return transition;
}
