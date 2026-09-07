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
 * ⚠️ **Deux façons de poser le mot, et le choix n'est pas cosmétique.** Par défaut il occupe
 * sa propre ligne : rien ne le précède, donc sa largeur ne pousse rien. Avec `largeur`, il
 * s'insère dans la phrase — et il faut alors lui **réserver** une place fixe, faute de quoi le
 * texte qui le précède glisse à chaque rotation, le bloc étant centré. Un mot plus long que sa
 * réserve déborde simplement vers la droite : c'est voulu, et c'est le seul moyen de garder la
 * phrase immobile sans laisser un trou après les mots courts.
 */
export default function MotQuiDefile({ mots, suffixe = "", largeur, remplissage = 1700, passage = 240, style }: {
  mots: string[];
  /** Ce qui suit le mot et se remplit avec lui — un point final, en pratique. */
  suffixe?: string;
  /**
   * La place réservée au mot dans la phrase, en `ch`. Omise, il prend sa propre ligne.
   *
   * ⚠️ **En `ch`, jamais en pixels** : le corps du texte varie avec la fenêtre, une largeur en
   * pixels ne serait juste qu'à une taille d'écran.
   *
   * ⚠️ **La valeur juste est la moyenne des mots**, pas le plus long ni le plus court : trop
   * étroite, tous débordent et la phrase penche à droite ; trop large, tous laissent un blanc
   * et elle penche à gauche.
   */
  largeur?: string;
  /**
   * Durée du remplissage, en millisecondes : c'est aussi le temps d'affichage du mot.
   *
   * ⚠️ **Elle borne la vitesse par le bas, pas par le haut.** Descendre encore ferait passer
   * le balayage plus vite que la lecture : on verrait le mot changer sans avoir eu le temps de
   * le lire, ce qui donne une impression de nervosité plutôt que de mouvement. Avec le passage,
   * un verbe tient l'écran un peu moins de deux secondes.
   */
  remplissage?: number;
  /** Durée de l'effacement et de l'arrivée, en millisecondes. */
  passage?: number;
  style?: React.CSSProperties;
}) {
  const [index, setIndex] = useState(0);
  const [sortie, setSortie] = useState(false);

  return (
    <span style={largeur
      ? {
          display: "inline-block", width: largeur, verticalAlign: "bottom",
          /* Le débordement doit rester visible — c'est lui qu'on cherche. */
          whiteSpace: "nowrap", overflow: "visible",
          /* ⚠️ L'alignement du bloc descend jusqu'ici : sans ce `left`, le mot se centrerait
             *dans* sa réserve, et son début se déplacerait à chaque rotation — exactement ce
             que la largeur fixe doit empêcher. */
          textAlign: "left",
          ...style,
        }
      : { display: "block", ...style }}>
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
