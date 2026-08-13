"use client";
import { useEffect, useState } from "react";

/**
 * Le passage d'une forme à l'autre, en une seule valeur.
 *
 * ⚠️ **Sorti des composants parce qu'ils sont deux.** L'avatar de l'application et le banc
 * d'essai changent tous deux de forme, et tous deux ont besoin de la même boucle : la même
 * durée, la même courbe, la même façon de repartir quand une bascule survient pendant une
 * bascule. Deux copies auraient divergé au premier ajustement de la durée — et cette
 * divergence-là ne se voit pas, elle se ressent.
 *
 * ⚠️ **Le crochet ne rend pas un volume, seulement l'état de la transition.** Chaque
 * appelant construit le sien : le banc y ajoute son curseur d'arrondi, l'application non.
 * Lui faire rendre le volume aurait demandé de lui passer tout ce dont il dépend, donc de
 * remonter le réglage d'arrondi dans un crochet qui n'a rien à en connaître.
 */

/**
 * La durée d'une morphose, en millisecondes.
 *
 * ⚠️ Réglée à vue. En deçà de trois cents, on ne voit pas la forme intermédiaire et le
 * changement se lit comme un remplacement ; au-delà de six cents, on attend. À 420 le
 * volume a le temps de se déformer sans jamais faire patienter.
 */
export const DUREE_MORPHOSE = 420;

/**
 * L'adoucissement — une courbe en `S`.
 *
 * ⚠️ **Il porte sur le mélange des volumes, pas sur une opacité.** La part avance
 * linéairement dans le temps ; la courbe la ralentit au départ et à l'arrivée, ce qui donne
 * à la forme le poids d'un objet qui se déforme plutôt que d'un réglage qu'on pousse.
 */
export const adoucir = (u: number) => u * u * (3 - 2 * u);

export type Morphose<T> = { de: T; part: number };

type Etat<T> = {
  /** La forme telle que le crochet l'a vue au dernier rendu. */
  vue: T;
  passage: { de: T; depart: number } | null;
  part: number;
};

export function useMorphose<T>(forme: T, anime: boolean = true): Morphose<T> | null {
  const [etat, setEtat] = useState<Etat<T>>({ vue: forme, passage: null, part: 1 });

  /**
   * ⚠️ **La transition démarre *pendant le rendu*, et c'est tout l'objet de ce bloc.**
   * Démarrée dans un effet, elle arrive trop tard : React a déjà peint l'image du nouveau
   * réglage, donc la forme d'arrivée paraît **en entier** le temps d'une image, puis
   * l'animation la ramène en arrière pour la reprendre depuis le début. Signalé à l'usage
   * comme « un clignotement de la forme précédente » — c'était l'inverse, un éclair de la
   * suivante suivi d'un retour en arrière. Mesuré sur la page avant correction : la tête
   * affichait 200 × 181, l'encombrement du triangle, cent millisecondes avant que la
   * morphose ne commence à 199 × 200.
   *
   * Ajuster l'état pendant le rendu est le remède prévu pour exactement ce cas : React
   * relance le rendu sans rien peindre entre les deux, si bien qu'aucune image
   * intermédiaire n'existe. Il faut pour cela que le calcul se déduise de l'état et non
   * d'une référence mutable, faute de quoi un double rendu — celui du mode strict — le
   * ferait sauter.
   */
  if (etat.vue !== forme) {
    /**
     * ⚠️ **Une valeur, pas une fonction de mise à jour — et la nuance est décisive.**
     * Écrit `setEtat(e => …)` avec une condition sur `e.vue`, le calcul cesse d'être
     * idempotent : React rejoue les fonctions de mise à jour en mode strict, et à la
     * seconde exécution `e.vue` vaut déjà la nouvelle forme, si bien que le passage se
     * remettait à zéro et que **plus aucune transition ne démarrait**. La forme de départ
     * se lit dans l'état du rendu en cours ; la nouvelle valeur ne dépend alors de rien
     * qu'on puisse appliquer deux fois.
     */
    setEtat({
      vue: forme,
      passage: anime ? { de: etat.vue, depart: performance.now() } : null,
      part: 0,
    });
  }

  const passage = etat.passage;
  useEffect(() => {
    if (!passage) return;
    let image = 0;
    const avancer = (t: number) => {
      const u = Math.min(1, (t - passage.depart) / DUREE_MORPHOSE);
      if (u >= 1) setEtat(e => (e.passage === passage ? { ...e, passage: null, part: 1 } : e));
      else {
        setEtat(e => (e.passage === passage ? { ...e, part: u } : e));
        image = requestAnimationFrame(avancer);
      }
    };
    image = requestAnimationFrame(avancer);
    return () => cancelAnimationFrame(image);
  }, [passage]);

  /**
   * ⚠️ **La forme de départ est rendue dès la première image, à part nulle.** C'est ce qui
   * garantit la continuité : l'image qui suit immédiatement le clic est *exactement* celle
   * d'avant le clic, et le mouvement part de là.
   */
  return passage ? { de: passage.de, part: adoucir(etat.part) } : null;
}
