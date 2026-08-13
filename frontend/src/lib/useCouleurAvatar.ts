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

/**
 * Les silhouettes proposées.
 *
 * ⚠️ **Seul le cube a sa variante en volume tournant, et c'est une mesure qui l'a
 * décidé.** `carre` et `carre3d` portent le même solide, séparés par l'ordre des
 * opérations : sans le suffixe l'image est étirée après la rotation — silhouette
 * immuable, surface qui se tord ; avec, le solide tourne — surface rigide, silhouette
 * qui respire. Pour la sphère la question ne se pose pas : les deux coïncident. Pour
 * l'étoile, mesuré, la version à silhouette fixe suit déjà la sphère de très près — le
 * rapport des deux yeux y fait 1,00 · 0,89 · 0,78 · 0,68 de zéro à trente degrés, contre
 * 1,00 · 0,91 · 0,82 · 0,72 sur la sphère, sans la bosse que le cube y montre. Sa
 * variante en volume tournant n'apporterait donc qu'une silhouette qui enfle.
 */
export const FORMES_AVATAR = ["sphere", "carre", "carre3d", "etoile"] as const;
export type FormeAvatar = (typeof FORMES_AVATAR)[number];
export const FORME_PAR_DEFAUT: FormeAvatar = "sphere";
const estFormeValide = (v: unknown): v is FormeAvatar =>
  typeof v === "string" && (FORMES_AVATAR as readonly string[]).indexOf(v) >= 0;

/**
 * Ce qu'on fait des choix devenus caducs.
 *
 * ⚠️ **Retirer une forme ne doit pas retirer le choix de l'utilisateur.** Sans cette
 * table, un portefeuille réglé sur l'étoile en volume tournant serait tombé au rejet de
 * la validation, donc revenu à la sphère : on lui aurait enlevé son étoile pour avoir
 * enlevé une variante de l'étoile. Il retrouve la forme la plus proche.
 */
const REMPLACEMENTS: Record<string, FormeAvatar> = { etoile3d: "etoile" };

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
        const remis = (gardee != null && REMPLACEMENTS[gardee]) || gardee;
        if (valide(remis)) choisie = remis;
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
