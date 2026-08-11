"use client";
import { useEffect, useRef, useState } from "react";

/**
 * La taille réelle d'un élément, en pixels, tenue à jour.
 *
 * ⚠️ **Existe pour ne plus étirer un dessin.** La courbe de projection employait
 * `preserveAspectRatio="none"` afin de remplir la hauteur qu'on lui laissait. Sur mon
 * écran elle disposait de 186 pixels et la déformation passait inaperçue ; sur un écran
 * plus court elle n'en avait que quarante, et l'étirement vertical de 6 pour 1 rendait
 * **le texte illisible** — les graduations devenaient un pâté. Le SVG n'étire pas que
 * les traits : il écrase aussi les lettres.
 *
 * En mesurant le conteneur, le `viewBox` peut valoir exactement sa taille en pixels : une
 * unité de dessin vaut un pixel, rien n'est mis à l'échelle, et le texte garde sa forme
 * quelle que soit la fenêtre.
 */
export function useTaille<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [taille, setTaille] = useState({ largeur: 0, hauteur: 0 });

  useEffect(() => {
    const n = ref.current;
    if (!n) return;
    const mesurer = () => {
      const r = n.getBoundingClientRect();
      // ⚠️ Arrondi à l'entier : une largeur fractionnaire dans un `viewBox` replace le
      // dessin sur des demi-pixels, ce qui est exactement le défaut qui faisait paraître
      // les drapeaux coupés d'un côté.
      setTaille(t => {
        const l = Math.round(r.width), h = Math.round(r.height);
        return t.largeur === l && t.hauteur === h ? t : { largeur: l, hauteur: h };
      });
    };
    mesurer();
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(n);
    return () => observateur.disconnect();
  }, []);

  return { ref, ...taille };
}
