"use client";
import { useCallback, useEffect, useRef, useState } from "react";

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
  const [taille, setTaille] = useState({ largeur: 0, hauteur: 0 });
  const observateur = useRef<ResizeObserver | null>(null);

  /**
   * ⚠️ **Un `ref` de rappel, et non un `useRef` lu dans un effet monté une fois.** C'était
   * la forme précédente, et elle ne mesurait **jamais** dans le seul cas où elle sert. Le
   * conteneur de la courbe n'existe pas au montage du composant : il apparaît quand la
   * projection arrive du serveur, une seconde plus tard. L'effet, en dépendances vides,
   * lisait donc `ref.current === null`, sortait, et ne repassait pas. Le `viewBox` gardait
   * ses valeurs de repli — 600 sur 150 — et le SVG, en `width: 100%`, les étirait à la
   * largeur réelle : mesuré à 794 pixels pour un `viewBox` de 600, soit un étirement
   * horizontal de 32 %, celui-là même que ce fichier a été écrit pour supprimer.
   *
   * Un `ref` de rappel s'exécute quand le nœud paraît, quel que soit le moment.
   */
  const ref = useCallback((n: T | null) => {
    observateur.current?.disconnect();
    observateur.current = null;
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
    observateur.current = new ResizeObserver(mesurer);
    observateur.current.observe(n);
  }, []);

  useEffect(() => () => observateur.current?.disconnect(), []);

  return { ref, ...taille };
}
