"use client";
import { useEffect, type CSSProperties, type ReactNode } from "react";

import Cadre from "@/components/ui/Cadre";

/**
 * Une fenêtre par-dessus la page : son voile, son cadre et son arrivée.
 *
 * ⚠️ **Ce composant existe pour la même raison que `Cadre`, un cran plus haut.** Chaque
 * fenêtre de l'application écrivait son propre voile, son propre conteneur et sa propre
 * animation : la déclaration d'un compte avait un rayon de 10 sans ombre, la saisie d'une
 * opération un rayon de 16 avec un fond translucide et une transition pilotée en
 * JavaScript, la recherche un troisième assortiment. Trois fenêtres, trois systèmes, et
 * aucune ne portait le cadre double de la page. On ne les rattrape pas une à une — c'est
 * ce qu'on vient de faire pour la première, et la deuxième aurait dérivé le mois suivant.
 *
 * ⚠️ **Le conteneur est `Cadre`, jamais une copie de ses valeurs.** Un panneau de cette
 * page est fait de deux couches — un anneau extérieur au bord sombre, voilé et flouté,
 * puis la carte qui porte le fond et son liseré — et son rayon intérieur se déduit du
 * rayon extérieur moins le retrait. Recopier quatre propriétés donne quelque chose de
 * ressemblant, pas d'identique.
 *
 * ⚠️ **Le voile et la fenêtre entrent séparément**, l'un posant le décor et l'autre y
 * arrivant. Les deux animations vivent dans la feuille globale, où leur réglage est
 * expliqué et où `prefers-reduced-motion` les coupe d'un seul endroit.
 */
export default function FenetreModale({
  children, onFermer, largeur = 460, zIndex = 60, etiquette, style,
}: {
  children: ReactNode;
  onFermer: () => void;
  /** Largeur de la fenêtre. Elle se rétracte d'elle-même sur un écran plus étroit. */
  largeur?: number;
  /**
   * Le plan de la fenêtre.
   *
   * ⚠️ **Réglable parce que toutes ne se superposent pas au même étage.** La saisie d'une
   * opération peut s'ouvrir depuis un écran qui porte déjà des couches à 60 ; la laisser
   * au défaut la ferait passer dessous, visible mais inatteignable.
   */
  zIndex?: number;
  /** Ce que la fenêtre annonce à un lecteur d'écran. */
  etiquette?: string;
  /** Ajouté au contenu de la carte — un rembourrage inhabituel, un écart différent. */
  style?: CSSProperties;
}) {
  /**
   * ⚠️ **Échap ferme, et c'est ici plutôt que chez chaque appelant.** Deux des trois
   * fenêtres le géraient, la troisième non : une fenêtre modale dont on ne sort qu'à la
   * souris est un piège au clavier, et c'est le genre d'oubli qui ne se voit qu'à
   * l'usage. Posé sur le document, l'écouteur suit la fenêtre du dessus quoi qu'il
   * arrive.
   */
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => { if (e.key === "Escape") onFermer(); };
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, [onFermer]);

  return (
    <div className="novac-voile-modale" onClick={onFermer}
      role="dialog" aria-modal="true" aria-label={etiquette}
      style={{
        position: "fixed", inset: 0, zIndex, display: "flex",
        alignItems: "center", justifyContent: "center", padding: 20,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)",
      }}>
      {/**
        * ⚠️ **Un div porte l'arrêt du clic, faute de quoi cliquer dans la fenêtre la
        * refermerait.** `Cadre` ne prend pas de gestionnaire, et lui en ajouter un pour
        * ces appelants-ci chargerait un composant partagé d'une préoccupation étrangère.
        * C'est aussi lui qui porte l'animation : posée sur la carte intérieure, elle
        * aurait fait glisser le fond dans son anneau resté immobile.
        */}
      <div className="novac-fenetre-modale" onClick={e => e.stopPropagation()}
        style={{ width: largeur, maxWidth: "100%", maxHeight: "90vh", display: "flex" }}>
        <Cadre style={{
          width: "100%", minHeight: 0, overflowY: "auto",
          padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14,
          ...style,
        }}>
          {children}
        </Cadre>
      </div>
    </div>
  );
}
