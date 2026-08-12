"use client";
import { useCallback, useEffect, useState } from "react";

import { COULEUR_PAR_DEFAUT, estCouleurValide } from "@/lib/avatarCouleur";

/**
 * La couleur d'un portefeuille, telle que son avatar la porte.
 *
 * ⚠️ **Sortie du composant de l'avatar parce qu'elle ne lui appartient plus.** Elle
 * habillait sa tête ; elle habille désormais aussi la courbe de performance. Laissée
 * dans le composant, il aurait fallu la faire remonter par un rappel jusqu'à la page,
 * puis redescendre vers le graphique — un chemin où l'on finit toujours par avoir deux
 * valeurs qui ne coïncident plus. Ici la page la tient, et la donne aux deux.
 *
 * ⚠️ **Gardée localement, pas envoyée au serveur.** Le champ `color` existe côté API
 * mais rien ne permet encore de l'écrire. Le choix ne suit donc pas d'un appareil à
 * l'autre — c'est la limite à connaître, et elle tombera le jour où une route acceptera
 * l'écriture.
 */

/** La clé de la couleur d'un portefeuille donné. */
export const cleCouleur = (id: string | number) => `novac-avatar-couleur:${id}`;

export function useCouleurAvatar(
  portefeuille: { id: string | number; color?: string | null } | null | undefined,
): [string, (hex: string) => void] {
  const [couleur, setCouleur] = useState(COULEUR_PAR_DEFAUT);
  const id = portefeuille?.id;
  const depuisApi = portefeuille?.color;

  /**
   * ⚠️ **Lue après le montage, pas au premier rendu.** Le serveur ne connaît pas le
   * stockage local : partir de la valeur enregistrée ferait diverger l'hydratation. On
   * part donc de la couleur que l'API connaît, et l'on corrige aussitôt s'il existe un
   * choix local.
   */
  useEffect(() => {
    let choisie = estCouleurValide(depuisApi) ? depuisApi : COULEUR_PAR_DEFAUT;
    if (id != null) {
      try {
        const gardee = localStorage.getItem(cleCouleur(id));
        if (estCouleurValide(gardee)) choisie = gardee;
      } catch {
        // Stockage refusé — navigation privée, réglage strict. La couleur du
        // portefeuille fait l'affaire ; ce n'est pas une raison pour casser la page.
      }
    }
    setCouleur(choisie);
  }, [id, depuisApi]);

  const choisir = useCallback((hex: string) => {
    if (!estCouleurValide(hex)) return;
    setCouleur(hex);
    if (id == null) return;
    try { localStorage.setItem(cleCouleur(id), hex); } catch { /* voir plus haut */ }
  }, [id]);

  return [couleur, choisir];
}
