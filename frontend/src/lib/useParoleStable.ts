"use client";
import { useEffect, useState } from "react";

// ⚠️ Chemin relatif : l'alias « @/ » ne se résout pas sous Vitest, qui tourne sans
// configuration. Un import en alias ici rendrait ce module intestable.
import { etatParCle } from "./avatarEtats";

/**
 * L'état dont on accepte de **parler** — celui qui a tenu assez longtemps pour valoir un mot.
 *
 * ⚠️ **Écrit pour la parole, et pour elle seule.** Le visage peut changer vite : deux yeux
 * qui se plissent un instant se lisent comme de la vie. Des **mots** qui apparaissent et
 * disparaissent au même rythme se lisent comme un défaut d'affichage — on tourne la tête vers
 * eux, et il n'y a déjà plus rien à lire. Ce délai ne touche donc que le texte ; la mimique
 * garde toute sa réactivité.
 *
 * ⚠️ **Le déclencheur est un pouls, pas une action.** Mesuré dans le bandeau du portefeuille :
 * la relecture des cours met l'avatar au travail quatre cents millisecondes toutes les quinze
 * secondes, si bien que « zzZ » cédait la place à « Je regarde » puis la reprenait, en boucle,
 * sous les yeux de quelqu'un en train de lire un montant.
 *
 * ⚠️ **Un délai unique ne pouvait pas marcher, et c'est la mesure qui l'a montré.** Le pouls
 * dure 400 ms, un changement d'onglet 530 : à peine trente millisecondes les séparent, et
 * aucun seuil ne passe entre les deux. Ce n'est donc pas une question de durée mais de
 * **nature** — voir plus bas.
 */

/**
 * Le temps qu'un état **soutenu** doit tenir avant d'être dit, en millisecondes.
 *
 * ⚠️ **Neuf cents, et l'on assume ce qu'on écarte.** Au-dessus du pouls des cours comme du
 * chargement d'un onglet, donc les deux restent muets. Ce qu'on y gagne est plus qu'une
 * absence de bruit : « Je regarde » n'apparaît plus que lorsqu'on **attend vraiment**, ce qui
 * est précisément le moment où l'on veut savoir que quelque chose se passe. Un calcul terminé
 * en une demi-seconde n'a besoin d'aucun commentaire.
 */
export const DELAI_SOUTENU = 900;

/**
 * ⚠️ **Un état ponctuel passe tout de suite, et il le faut.** Le succès, l'erreur, la surprise
 * ne durent que neuf cents à quatorze cents millisecondes : les retarder de neuf cents
 * reviendrait à les avaler. Surtout, ils ne sont pas un pouls — ils sont déclenchés par
 * quelque chose qui vient d'arriver, donc ils méritent d'être dits sans délai. C'est la
 * distinction que le répertoire porte déjà ; on ne la refait pas ici.
 *
 * ⚠️ **La décision est une fonction pure, séparée du crochet, et c'est pour l'éprouver.**
 * Il n'y a pas de DOM dans ces tests : monter un crochet y demanderait un moteur de rendu
 * pour une règle qui tient en une ligne. Sortie, elle se vérifie directement — y compris le
 * fait que le seuil passe bien au-dessus des durées mesurées, ce qui est le vrai enjeu.
 */
export function delaiParole(cle: string): number {
  return etatParCle(cle).nature === "ponctuel" ? 0 : DELAI_SOUTENU;
}

export function useParoleStable(cle: string): string {
  const [stable, setStable] = useState(cle);

  useEffect(() => {
    if (cle === stable) return;
    const delai = delaiParole(cle);
    if (delai === 0) { setStable(cle); return; }
    const t = window.setTimeout(() => setStable(cle), delai);
    return () => window.clearTimeout(t);
  }, [cle, stable]);

  return stable;
}
