"use client";
import { useCallback, useEffect, useState } from "react";

import { COULEUR_PAR_DEFAUT, estCouleurValide } from "@/lib/avatarCouleur";
import { SKINS } from "@/lib/avatarSkins";

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
/** Celle de son habillage. */
export const cleSkin = (id: string | number) => `novac-avatar-skin:${id}`;

/**
 * Les silhouettes proposées.
 *
 * ⚠️ **Aucune ne fait tourner son volume : toutes gardent une silhouette figée.** C'est
 * le parti du logo, celui du rond et du carré depuis le début — quoi que fasse la tête,
 * la marque garde exactement le même contour, et tout le mouvement se lit sur ce qui est
 * peint dessus. Le prix est connu et mesuré : la surface se tord en tournant, ce que
 * la compensation à l'ancre de l'œil absorbe pour l'essentiel. Le rapport des deux yeux
 * suit alors de très près celui de la sphère — 1,00 · 0,89 · 0,78 · 0,68 sur l'étoile
 * contre 1,00 · 0,91 · 0,82 · 0,72 —, sans la bosse que seul le cube y montre.
 *
 * Le banc d'essai propose l'autre parti, où le solide tourne pour de bon : la surface y
 * devient rigide, mais la silhouette respire. Il n'y a pas de troisième voie — la sphère
 * est la seule forme où les deux tiennent en place à la fois.
 */
export const FORMES_AVATAR = [
  "sphere", "carre", "coussin", "hexagone",
  "triangle", "etoile", "etoile6", "goutte",
] as const;
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
const REMPLACEMENTS: Record<string, FormeAvatar> = {
  etoile3d: "etoile",
  carre3d: "carre",
  galet: "sphere",
  fossettes: "sphere",
};

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

/**
 * Les habillages proposés dans l'application.
 *
 * ⚠️ **Tous ne valent pas pour toutes les formes, et le choix doit le savoir.** La Terre
 * est un dessin plat détouré par la silhouette : détourée par un triangle, elle n'est
 * plus un globe. Elle disparaît donc du panneau dès que la tête n'est plus ronde — et
 * comme la forme peut changer *après* l'habillage, le réglage sait aussi se retirer.
 */
export const estSkinValide = (v: unknown): v is string =>
  typeof v === "string" && SKINS.some(s => s.cle === v);

/** L'habillage d'un portefeuille, gardé comme le reste. */
export function useSkinAvatar(
  portefeuille: { id: string | number } | null | undefined,
): [string, (v: string) => void] {
  return useChoixGarde<string>(portefeuille?.id, cleSkin, estSkinValide, "uni");
}

/** La silhouette d'un portefeuille : sphère, ou cube aux arêtes arrondies. */
export function useFormeAvatar(
  portefeuille: { id: string | number } | null | undefined,
): [FormeAvatar, (v: FormeAvatar) => void] {
  return useChoixGarde<FormeAvatar>(
    portefeuille?.id, cleForme, estFormeValide, FORME_PAR_DEFAUT);
}
