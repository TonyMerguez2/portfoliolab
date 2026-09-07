"use client";
import { useEffect, useState } from "react";
import { LOGO_CHEMIN, LOGO_TRANSFORME, LOGO_VUE } from "@/lib/logoTrace";

/** Le tracé du contour, en millisecondes. */
const TRACE = 1200;
/** À quel point du tracé le remplissage commence à paraître. */
const DEPART_REMPLISSAGE = 0.7;
/** La durée du fondu du remplissage. */
const REMPLISSAGE = 350;
/** Le temps que le voile met à s'effacer une fois le logo plein. */
const RETRAIT = 450;

/**
 * L'animation d'entrée : le logo se dessine, puis se remplit, puis s'efface.
 *
 * Le déroulé est celui de `swiftui-logo-draw` : un contour tracé en 1,2 s, un remplissage qui
 * commence à 70 % du tracé et prend 0,35 s. Ni lueur, ni changement d'échelle — le dessin seul.
 *
 * ⚠️ **Ce composant ne décide de rien : il lit `data-entree` sur la racine.** La décision — une
 * fois par visite, jamais si le système demande moins d'animations — est prise par le script du
 * `<head>`, avant la première peinture. Deux endroits qui décideraient finiraient par ne plus
 * dire la même chose ; et surtout, décider ici arriverait trop tard : le voile n'apparaîtrait
 * qu'après l'hydratation, laissant voir la page puis la recouvrant.
 *
 * ⚠️ **Le voile plein écran n'est pas ici non plus** — il est en CSS, peint dès la marque posée.
 * Ce composant n'apporte que le logo, par-dessus.
 */
export default function EntreeLogo() {
  const [etat, setEtat] = useState<"attente" | "joue" | "fini">("attente");

  useEffect(() => {
    /**
     * ⚠️ **Le réglage système passe avant l'effet.** Deux secondes d'animation plein écran sont
     * exactement ce que « moins d'animations » demande d'éviter — et ici il n'y a rien à voir
     * derrière : la sauter revient à entrer directement sur le site.
     */
    if (!document.documentElement.hasAttribute("data-entree")) { setEtat("fini"); return; }
    setEtat("joue");
    const fin = setTimeout(() => setEtat("fini"), TRACE + REMPLISSAGE + RETRAIT);
    return () => clearTimeout(fin);
  }, []);

  if (etat !== "joue") return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center",
        /* ⚠️ Pas de fond ici : le voile est peint par la feuille de style, sous cette couche.
           En poser un second ferait deux opacités à accorder. */
        pointerEvents: "none",
        animation: `nv-entree-voile ${RETRAIT}ms ease-in ${TRACE + REMPLISSAGE}ms forwards`,
      }}
    >
      <svg viewBox={LOGO_VUE} width="150" height="150" fill="none" aria-hidden="true">
        {/**
          * ⚠️ **Deux fois le même chemin : l'un se trace, l'autre se remplit.** Un seul ne
          * saurait pas faire les deux — le contour s'anime par son pointillé, le remplissage par
          * son opacité, et une forme ne porte qu'un `fill`. Ils sont superposés au pixel, donc
          * la jointure ne se voit pas.
          *
          * ⚠️ **`pathLength={1}` normalise la longueur du tracé.** Sans lui, le pointillé se
          * mesurerait en unités du dessin — plusieurs milliers ici — et il faudrait recalculer
          * la valeur à chaque retouche du logo. À 1, le décalage va de 1 à 0, quel que soit le
          * chemin.
          */}
        <g transform={LOGO_TRANSFORME}>
          <path
            d={LOGO_CHEMIN}
            stroke="var(--nv-texte-intense)" strokeWidth={1.6}
            /**
              * ⚠️ **`vectorEffect` : sans lui, le trait faisait un sixième de pixel.** Une
              * épaisseur de trait s'exprime dans les unités du dessin, que la boîte réduit
              * ensuite — ici de 1200 à 132, et la matrice du logo ajoute son propre facteur :
              * 1,5 unité devenait **0,165 pixel** à l'écran. Le navigateur peint alors un trait
              * plus fin qu'un pixel, qu'il ne peut rendre qu'en le diluant : d'où un contour
              * pâle, haché, qui paraît granuleux.
              *
              * `non-scaling-stroke` sort l'épaisseur de cette arithmétique — 1,6 veut dire
              * 1,6 pixel à l'écran, quelle que soit la taille du logo. C'est aussi ce qui
              * garantit que le trait ne changera pas si l'on redimensionne le dessin.
              */
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round" strokeLinejoin="round"
            pathLength={1} strokeDasharray={1}
            style={{ animation: `nv-entree-trace ${TRACE}ms cubic-bezier(0.65, 0, 0.35, 1) forwards` }}
          />
          <path
            d={LOGO_CHEMIN}
            fill="var(--nv-texte-intense)"
            style={{
              opacity: 0,
              animation: `nv-entree-encre ${REMPLISSAGE}ms ease-out ${TRACE * DEPART_REMPLISSAGE}ms forwards`,
            }}
          />
        </g>
      </svg>
    </div>
  );
}
