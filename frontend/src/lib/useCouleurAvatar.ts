"use client";
import { useCallback, useEffect, useState } from "react";

import { COULEUR_PAR_DEFAUT, estCouleurValide } from "@/lib/avatarCouleur";

/**
 * L'apparence d'un portefeuille, telle que son avatar la porte : sa couleur, sa forme.
 *
 * ⚠️ **Sortie du composant de l'avatar parce qu'elle ne lui appartient plus.** La
 * couleur habillait sa tête ; elle habille désormais aussi la courbe de performance.
 * Laissée dans le composant, il aurait fallu la faire remonter par un rappel jusqu'à la
 * page, puis redescendre vers le graphique — un chemin où l'on finit toujours par avoir
 * deux valeurs qui ne coïncident plus. Ici la page la tient, et la donne aux deux.
 *
 * ⚠️ **Gardée localement, pas envoyée au serveur.** Le champ `color` existe côté API
 * mais rien ne permet encore de l'écrire, et rien n'existe du tout pour la forme. Le
 * choix ne suit donc pas d'un appareil à l'autre — c'est la limite à connaître, et elle
 * tombera le jour où une route acceptera l'écriture.
 */

/** La clé de la couleur d'un portefeuille donné. */
export const cleCouleur = (id: string | number) => `novac-avatar-couleur:${id}`;
/** Celle de sa silhouette. */
export const cleForme = (id: string | number) => `novac-avatar-forme:${id}`;

/** Les silhouettes proposées. */
export type FormeAvatar = "sphere" | "carre";
export const FORME_PAR_DEFAUT: FormeAvatar = "sphere";
const estFormeValide = (v: unknown): v is FormeAvatar => v === "sphere" || v === "carre";

/**
 * Un choix d'apparence, gardé pour un portefeuille.
 *
 * ⚠️ **Écrit une fois pour les deux réglages.** La couleur et la forme se lisent, se
 * valident et se rangent exactement pareil ; deux copies auraient divergé au premier
 * ajustement de la règle d'hydratation — c'est-à-dire de la seule partie délicate.
 *
 * ⚠️ **Lu après le montage, pas au premier rendu.** Le serveur ne connaît pas le
 * stockage local : partir de la valeur enregistrée ferait diverger l'hydratation. On
 * part donc de ce que l'API sait, et l'on corrige aussitôt s'il existe un choix local.
 */
function useChoixGarde<T extends string>(
  id: string | number | undefined,
  cle: (id: string | number) => string,
  valide: (v: unknown) => v is T,
  depart: T,
  depuisApi?: T | null,
): [T, (v: T) => void] {
  const [valeur, setValeur] = useState<T>(depart);

  useEffect(() => {
    let choisie: T = valide(depuisApi) ? depuisApi : depart;
    if (id != null) {
      try {
        const gardee = localStorage.getItem(cle(id));
        if (valide(gardee)) choisie = gardee;
      } catch {
        // Stockage refusé — navigation privée, réglage strict. Ce n'est pas une raison
        // de casser la page : on garde ce que l'API sait.
      }
    }
    setValeur(choisie);
    // `cle`, `valide` et `depart` sont des constantes de module ; les suivre ne ferait
    // que relire le stockage sans jamais rien changer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, depuisApi]);

  const choisir = useCallback((v: T) => {
    if (!valide(v)) return;
    setValeur(v);
    if (id == null) return;
    try { localStorage.setItem(cle(id), v); } catch { /* voir plus haut */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return [valeur, choisir];
}

export function useCouleurAvatar(
  portefeuille: { id: string | number; color?: string | null } | null | undefined,
): [string, (hex: string) => void] {
  return useChoixGarde<string>(
    portefeuille?.id, cleCouleur, estCouleurValide, COULEUR_PAR_DEFAUT,
    portefeuille?.color,
  );
}

/** La silhouette d'un portefeuille : sphère, ou cube aux arêtes arrondies. */
export function useFormeAvatar(
  portefeuille: { id: string | number } | null | undefined,
): [FormeAvatar, (v: FormeAvatar) => void] {
  return useChoixGarde<FormeAvatar>(
    portefeuille?.id, cleForme, estFormeValide, FORME_PAR_DEFAUT);
}
