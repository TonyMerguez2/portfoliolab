"use client";
import { useState } from "react";

/**
 * Un mot qui se remplit de couleur, puis cède la place au suivant.
 *
 * Le verbe s'affiche dans une encre discrète ; la couleur pleine le traverse de gauche à
 * droite ; une fois qu'il est plein, le mot suivant prend sa place et repart discret. Le dessin
 * du remplissage est dans `globals.css`, sous `.nv-mot` — c'est là que se trouve le pourquoi du
 * `background-clip` et du `-webkit-text-fill-color`.
 *
 * ⚠️ **Le changement de mot est déclenché par la fin de l'animation, pas par une minuterie.**
 * Une minuterie réglée sur la même durée dérive : elle compte depuis que React a posé
 * l'élément, l'animation depuis que le navigateur l'a peint, et l'écart grandit à chaque tour —
 * le mot changerait avant d'être plein, ou après un temps mort. `onAnimationEnd` dit exactement
 * quand le remplissage est terminé, et rien ne peut se désynchroniser.
 *
 * ⚠️ **La `key` relance l'animation.** Une animation CSS ne rejoue pas parce que le texte du
 * nœud a changé ; il faut un nouvel élément. Changer la clé à chaque mot force React à en
 * monter un, et le remplissage repart de zéro.
 *
 * ⚠️ **Le verbe occupe sa propre ligne.** Placé dans la phrase, sa largeur poussait le texte
 * qui précède à chaque rotation, puisque le titre est centré. Trois façons de l'éviter ont été
 * essayées — mesurer les mots et animer la largeur, réserver la largeur du plus long, réserver
 * une largeur moyenne et laisser déborder — et toutes compensaient le défaut au lieu de le
 * retirer. Seul sur sa ligne, le verbe ne pousse plus rien : ce qui le précède est immobile par
 * construction.
 */
export default function MotQuiDefile({ mots, suffixe = "", remplissage = 2600, style }: {
  mots: string[];
  /** Ce qui suit le mot et se remplit avec lui — un point final, en pratique. */
  suffixe?: string;
  /** Durée du remplissage, en millisecondes : c'est aussi le temps d'affichage du mot. */
  remplissage?: number;
  style?: React.CSSProperties;
}) {
  const [index, setIndex] = useState(0);

  return (
    <span style={{ display: "block", ...style }}>
      <span
        key={index}
        className="nv-mot"
        style={{
          display: "inline-block", whiteSpace: "nowrap",
          "--nv-remplissage": `${remplissage}ms`,
        } as React.CSSProperties}
        onAnimationEnd={() => setIndex(i => (i + 1) % mots.length)}
      >
        {mots[index]}{suffixe}
      </span>
    </span>
  );
}
