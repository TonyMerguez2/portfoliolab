"use client";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

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
 *
 * ⚠️ **Montée dans le corps du document, jamais là où on l'écrit.** `position: fixed` ne se
 * rapporte à la fenêtre du navigateur que si aucun ancêtre ne porte `transform`, `filter`,
 * `backdrop-filter` ou `contain` : le premier qui en porte un devient le bloc conteneur.
 * Constaté à l'écran en ouvrant le réglage de l'avatar depuis le bandeau, dont une carte
 * est floutée — la fenêtre s'y est retrouvée enfermée dans un rectangle de 1190 × 113,
 * voile compris. Rien ne le signale : ni erreur, ni avertissement, seulement une fenêtre
 * qui s'ouvre au mauvais endroit.
 *
 * ⚠️ **Et c'est ici que le portail doit être, pas chez l'appelant.** Le panneau de l'avatar
 * en avait un, écrit à la main, avec sa propre note expliquant la même chose ; les deux
 * autres fenêtres n'en avaient pas et marchaient par chance, faute d'ancêtre flouté. Poser
 * le portail dans le composant partagé fait que la prochaine fenêtre ne retombera pas dans
 * le piège — et supprime la note à recopier.
 */
/**
 * La largeur d'une fenêtre de saisie.
 *
 * ⚠️ **Une constante parce que les trois fenêtres du même parcours en avaient trois.** Le
 * panneau de création déclarait 470, la saisie d'une opération 440, la déclaration d'un
 * compte 460 — et le défaut du composant valait 460 aussi, si bien qu'aucune ne pouvait
 * s'aligner sur les autres sans qu'on aille lire les trois. Or ce sont les mêmes écrans : la
 * déclaration d'un compte est une étape *dans* la création d'un portefeuille avant d'être
 * une fenêtre du tableau de bord. Trente pixels d'écart entre deux vues du même formulaire
 * se voient immédiatement quand on passe de l'une à l'autre. Signalé à l'usage, deux fois.
 *
 * ⚠️ **470 parce que c'est le panneau de création qui contraint.** Il porte une illustration
 * et une bande de dix-neuf couleurs ; les deux autres n'ont pas de contrainte propre. C'est
 * donc à elles de céder, comme la barre d'actif avait imposé sa hauteur aux champs.
 *
 * ⚠️ **Elle reste réglable**, et une fenêtre qui n'appartient pas à ce parcours peut avoir sa
 * mesure : le réglage d'avatar s'ouvre à 400, parce qu'il ne montre qu'une grille de
 * silhouettes et qu'une fenêtre large la laisserait flotter.
 */
export const LARGEUR_FENETRE = 470;

export default function FenetreModale({
  children, onFermer, largeur = LARGEUR_FENETRE, zIndex = 60, etiquette, style,
}: {
  children: ReactNode;
  onFermer: () => void;
  /** Largeur de la fenêtre — voir `LARGEUR_FENETRE`. Elle se rétracte d'elle-même sur un écran plus étroit. */
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

  /**
   * ⚠️ **Le portail n'existe qu'après le montage, sinon l'hydratation diverge.** Le serveur
   * n'a pas de `document` : rendre le portail dès la première passe ferait un arbre côté
   * client qui ne correspond pas à celui du serveur, ce que React signale bruyamment. Un
   * état qui bascule au montage coûte un rendu de plus, une seule fois, à l'ouverture.
   */
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);
  if (!monte) return null;

  return createPortal((
    <div className="novac-voile-modale" onClick={onFermer}
      role="dialog" aria-modal="true" aria-label={etiquette}
      style={{
        position: "fixed", inset: 0, zIndex, display: "flex",
        /* ⚠️ **Toutes les fenêtres sont centrées, y compris celle de création.** Elle s'est
           ouverte un temps sous le bandeau, dans le prolongement de la barre de recherche,
           l'idée étant qu'elle continue le haut de l'écran. Ramenée au centre à l'usage — et
           un seul ancrage vaut mieux qu'un réglage : quatre fenêtres qui s'ouvrent au même
           endroit se lisent comme un système, deux places en font deux mécanismes. */
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
  ), document.body);
}
