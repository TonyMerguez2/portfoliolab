"use client";
import { useEffect } from "react";

/**
 * La page demande la silhouette du logo dans le fond.
 *
 * ⚠️ **Elle ne dessine rien.** La silhouette n'est pas une couche : ce sont les points du fond
 * eux-mêmes, dessinés comme si le curseur était sur eux. Ils appartiennent donc à la trame
 * montée par `PointsFond` dans la mise en page racine, et rien ici ne peut les redessiner —
 * une seconde trame aurait sa propre boucle, ses propres places, et l'on retomberait sur la
 * grille désalignée que `globals.css` a appris à éviter en quatre tentatives.
 *
 * Ce composant ne fait donc que poser une marque sur `<html>`, que la feuille de style et la
 * toile lisent. Il remplace le `<div className="nv-silhouette">` que l'accueil et la porte
 * de l'alpha écrivaient chacun de son côté.
 *
 * ⚠️ **Retirée au démontage** : la silhouette appartient aux deux pages d'entrée. Sur le
 * tableau de bord, un logo géant dans le fond gênerait la lecture des chiffres. La trame
 * repèse alors ses points et le logo s'éteint, sans que la boucle ait été remontée.
 */
export default function SilhouetteNovac() {
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("data-silhouette", "");
    return () => html.removeAttribute("data-silhouette");
  }, []);

  return null;
}
