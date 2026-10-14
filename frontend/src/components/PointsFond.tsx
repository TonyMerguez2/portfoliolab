"use client";
import TrameAnimee from "@/components/TrameAnimee";

/**
 * Le fond du site : son dégradé, et sa trame de points.
 *
 * ⚠️ **La trame est passée du CSS à la toile, et ce composant a fondu d'autant.** Il suivait
 * le curseur pour déplacer le centre d'un masque : deux trames identiques superposées, l'une
 * terne et visible partout, l'autre vive et masquée sauf sous la souris. Tout le mouvement
 * était dans le masque ; les points, eux, ne bougeaient pas. `TrameAnimee` les fait bouger —
 * chacun est une masse sur ressort — ce qu'aucun dégradé répété ne sait faire, et le suivi du
 * pointeur vit désormais là-bas.
 *
 * ⚠️ **`.nv-points` n'a pas disparu pour autant.** La classe garde ce qui n'est pas du
 * dessin : la place de la couche, son rang sous le contenu, le fondu qui dissipe la trame en
 * haut et en bas de l'écran, et le jeton qui éteint la lueur sur téléphone. La toile se pose
 * dedans.
 *
 * ⚠️ **La silhouette du logo n'est pas une couche de plus : c'est cette trame-ci.** Les points
 * qui tombent dans le dessin du logo y sont dessinés comme si le curseur était sur eux, en
 * permanence — même rayon, même encre, même passe. Les pages disent seulement qu'elles la
 * veulent, et l'accueil est la raison d'être de tout ceci : voir `SilhouetteNovac`.
 */
export default function PointsFond() {
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
      <TrameAnimee silhouette className="nv-points" />
    </>
  );
}
