"use client";
import { useEffect, useState } from "react";

import { compteMemorise } from "@/lib/session";

/**
 * Le salut de l'arrivée : le personnage dit bonjour, puis se tait.
 *
 * ⚠️ **Le salut n'est pas un état de l'avatar, et c'est pourquoi il vit ici.** Tous les
 * autres mots viennent du répertoire d'expressions : il dort, il calcule, il a fini. « Bonjour »
 * ne répond à rien de tel — il répond au fait qu'on **vient d'arriver**, ce qu'aucune mimique
 * ne décrit. Branché sur l'état neutre, il aurait été affiché en permanence, ce qui en aurait
 * fait un bandeau qui salue plutôt qu'un personnage qui parle ; branché sur le montage, il se
 * dit une fois et s'efface, comme un vrai bonjour.
 *
 * ⚠️ **Le nom se lit après le montage, jamais pendant.** Il vient du stockage local, absent au
 * rendu serveur : le lire au premier rendu ferait diverger le HTML envoyé et celui reconstruit
 * — l'erreur d'hydratation classique. On part donc sans nom et on l'ajoute aussitôt ; comme la
 * parole entre en fondu, la substitution passe dans l'animation.
 */

/**
 * Ce que dure le salut, en millisecondes.
 *
 * ⚠️ **Quatre secondes et demie, bornées par les deux bouts.** Il faut de quoi remarquer,
 * lire, et laisser passer l'entrée elle-même — le texte apparaît morceau par morceau sur près
 * de cinq cents millisecondes. Plus long, le salut cesse d'être un salut : il devient un
 * élément du bandeau, et l'on retombe sur ce qu'on voulait éviter.
 */
export const DUREE_SALUT = 4500;

export type SalutArrivee = { salue: boolean; nom: string | null };

export function useSalutArrivee(duree: number = DUREE_SALUT): SalutArrivee {
  const [salue, setSalue] = useState(true);
  const [nom, setNom] = useState<string | null>(null);

  useEffect(() => {
    setNom(compteMemorise()?.username?.trim() || null);
    const t = window.setTimeout(() => setSalue(false), duree);
    return () => window.clearTimeout(t);
  }, [duree]);

  return { salue, nom };
}
