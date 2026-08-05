"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Le sens de la dernière variation d'un nombre, le temps d'un clignotement.
 *
 * Un cours qui change sans rien dire passe inaperçu : entre deux
 * rafraîchissements, seul un chiffre bouge de quelques centimes au milieu
 * d'une page dense. La couleur dit dans quel sens, brièvement, puis s'efface —
 * une couleur permanente ferait croire à un état plutôt qu'à un mouvement.
 *
 * Écrit ici parce que la page graphique en portait déjà deux exemplaires, pour
 * le prix de l'actif et pour celui du repère, et que le tableau de bord en
 * demandait deux de plus. Quatre copies d'une même horloge finissent par
 * diverger de durée.
 */

export type Sens = "hausse" | "baisse" | null;

/** Durée du clignotement, alignée sur les animations de globals.css. */
export const DUREE_CLIGNOTEMENT = 900;

export function useClignotement(valeur: number | null | undefined): Sens {
  const [sens, setSens] = useState<Sens>(null);
  const precedent = useRef<number | null>(null);

  useEffect(() => {
    if (valeur == null) return;
    const avant = precedent.current;
    precedent.current = valeur;
    // La première valeur n'est une variation de rien : sans ce test, toute la
    // page clignoterait au chargement.
    if (avant === null || valeur === avant) return;
    setSens(valeur > avant ? "hausse" : "baisse");
    const t = setTimeout(() => setSens(null), DUREE_CLIGNOTEMENT);
    return () => clearTimeout(t);
  }, [valeur]);

  return sens;
}

/**
 * Le style à appliquer au nombre qui clignote.
 *
 * `--nv-repos` porte la couleur de fin : l'animation doit ramener le texte à
 * sa couleur normale, qui n'est pas la même partout — blanc cassé sur une
 * carte d'actif colorée, encre du thème dans le bandeau. Une animation qui
 * fixerait sa couleur d'arrivée en dur repeindrait l'un des deux.
 */
export function styleClignotement(sens: Sens, couleurNormale: string) {
  return {
    color: couleurNormale,
    ["--nv-repos" as string]: couleurNormale,
    animation: sens ? `nv-clignote-${sens} ${DUREE_CLIGNOTEMENT}ms ease forwards` : undefined,
  };
}
