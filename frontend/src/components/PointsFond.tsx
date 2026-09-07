"use client";
import { useEffect, useRef } from "react";

/**
 * Le fond à points du thème sombre, qui s'éclaire sous le curseur.
 *
 * Deux trames identiques superposées en CSS : l'une terne et visible partout,
 * l'autre vive mais masquée sauf dans un disque centré sur le curseur. Tout se
 * joue dans globals.css ; ce composant ne fait que déplacer le centre du
 * masque.
 *
 * Il l'écrit en propriété CSS personnalisée plutôt qu'en état React. Un
 * pointermove émet des dizaines d'événements par seconde : les passer par
 * useState re-rendrait la page à chaque pixel parcouru, pour déplacer un
 * dégradé. La même raison a fait écrire trackSpecular() ainsi sur les tuiles.
 *
 * Le suivi est en outre calé sur requestAnimationFrame : le navigateur émet
 * plus d'événements qu'il ne peint d'images, et écrire la variable deux fois
 * entre deux peintures est du travail perdu.
 */
export default function PointsFond() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Un doigt sur un écran tactile n'a pas de position de survol : la lueur
    // resterait figée là où l'on a touché. On ne l'installe donc que pour un
    // pointeur qui survole vraiment.
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let image = 0;
    let x = 0;
    let y = 0;

    const peindre = () => {
      image = 0;
      el.style.setProperty("--nv-mx", `${x}px`);
      el.style.setProperty("--nv-my", `${y}px`);
    };

    const bouger = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!image) image = requestAnimationFrame(peindre);
    };

    // La lueur repart hors champ quand le curseur quitte la fenêtre, sinon elle
    // reste allumée au dernier point touché comme un projecteur oublié.
    const sortir = () => {
      if (image) cancelAnimationFrame(image);
      image = 0;
      el.style.setProperty("--nv-mx", "-9999px");
      el.style.setProperty("--nv-my", "-9999px");
    };

    window.addEventListener("pointermove", bouger, { passive: true });
    document.addEventListener("pointerleave", sortir);
    return () => {
      if (image) cancelAnimationFrame(image);
      window.removeEventListener("pointermove", bouger);
      document.removeEventListener("pointerleave", sortir);
    };
  }, []);

  return (
    <>
      {/**
        * ⚠️ **Le dégradé de page est une couche à lui, et non le fond du `<body>`.** Il y était,
        * en `background-attachment: fixed` pour rester calé sur la fenêtre. Deux ennuis avec
        * ça : Safari sur iPhone **ignore** cet attachement, et la page de la porte s'est mise à
        * défiler — le dégradé s'étirait alors sur toute la hauteur du document, si bien que le
        * premier écran n'en montrait que le tiers sombre du haut. D'où un site nettement plus
        * sombre qu'avant, sans que rien n'ait changé de ses couleurs.
        *
        * Une couche `fixed` de la taille de la fenêtre n'a pas ce défaut : elle est calée par
        * sa position, pas par une propriété que le navigateur peut ne pas honorer.
        */}
      <div className="nv-fond-page" aria-hidden="true" />
      <div ref={ref} className="nv-points" aria-hidden="true" />
    </>
  );
}
