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
 * ⚠️ **Tout l'enchaînement est piloté par les fins d'animation, jamais par une minuterie.**
 * Une minuterie réglée sur la même durée dérive : elle compte depuis que React a posé
 * l'élément, l'animation depuis que le navigateur l'a peint, et l'écart grandit à chaque tour —
 * le mot changerait avant d'être plein, ou après un temps mort. Le cycle se lit donc dans les
 * événements : le remplissage se termine → le mot s'efface ; l'effacement se termine → le
 * suivant prend sa place et se remplit à son tour.
 *
 * ⚠️ **Les trois animations arrivent par le même événement : il faut les distinguer par leur
 * nom.** `nv-entree` se termine elle aussi, 320 ms après le montage ; la traiter comme une fin
 * de remplissage ferait changer le mot au bout d'un tiers de seconde. Les noms viennent de
 * `globals.css`, qui est une feuille globale — ils ne sont donc pas hachés à la compilation, et
 * cette comparaison tient.
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
export default function MotQuiDefile({ mots, suffixe = "", remplissage = 2600, passage = 320, style }: {
  mots: string[];
  /** Ce qui suit le mot et se remplit avec lui — un point final, en pratique. */
  suffixe?: string;
  /** Durée du remplissage, en millisecondes : c'est aussi le temps d'affichage du mot. */
  remplissage?: number;
  /** Durée de l'effacement et de l'arrivée, en millisecondes. */
  passage?: number;
  style?: React.CSSProperties;
}) {
  const [index, setIndex] = useState(0);
  const [sortie, setSortie] = useState(false);

  return (
    <span style={{ display: "block", ...style }}>
      <span
        key={index}
        className={sortie ? "nv-mot nv-mot--sortie" : "nv-mot"}
        style={{
          display: "inline-block", whiteSpace: "nowrap",
          "--nv-remplissage": `${remplissage}ms`,
          "--nv-passage": `${passage}ms`,
        } as React.CSSProperties}
        onAnimationEnd={e => {
          if (e.animationName === "nv-remplir") setSortie(true);
          else if (e.animationName === "nv-sortie") {
            setIndex(i => (i + 1) % mots.length);
            setSortie(false);
          }
        }}
      >
        {mots[index]}{suffixe}
      </span>
    </span>
  );
}
