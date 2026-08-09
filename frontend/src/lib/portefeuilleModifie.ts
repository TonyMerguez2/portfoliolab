/**
 * Le signal « ce portefeuille vient de changer », d'un bout de l'arbre à l'autre.
 *
 * ⚠️ Il existe parce que deux composants éloignés affichent le même portefeuille
 * sans se connaître : la vignette du tableau de bord et la liste du menu de
 * l'en-tête. Cette dernière lit les portefeuilles une seule fois, au montage.
 * Poser une image la laissait donc sur sa version périmée jusqu'au prochain
 * chargement complet de la page — ce qui se lisait comme un recadrage non
 * enregistré, alors qu'il l'était.
 *
 * Un événement de fenêtre plutôt qu'un contexte ou un magasin partagé : il n'y a
 * qu'un émetteur, un abonné et un champ qui change. Un contexte aurait demandé
 * d'envelopper l'arbre entier pour ce seul cas.
 *
 * ⚠️ Le nom de l'événement n'est écrit qu'ici, et c'est le point. Une chaîne
 * recopiée de part et d'autre se serait tôt ou tard écartée d'une lettre, et un
 * abonnement qui n'écoute rien ne se signale par aucune erreur : il ne se passe
 * simplement plus rien.
 *
 * Non testé, et il faut le dire : la suite tourne dans un environnement Node, où
 * `window` n'existe pas. Éprouver ces trois lignes demanderait d'ajouter jsdom au
 * projet, ce que ces trois lignes ne justifient pas. C'est le typage qui tient
 * lieu de garde-fou.
 */

const EVENEMENT = "novac:portefeuille-modifie";

/** Ce qu'un abonné peut lire. La forme complète vient de l'API. */
export interface PortefeuilleModifie {
  id: string;
  [champ: string]: unknown;
}

/** Annonce qu'un portefeuille vient d'être écrit, tel que l'API l'a renvoyé. */
export function annoncerModification(p: PortefeuilleModifie): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<PortefeuilleModifie>(EVENEMENT, { detail: p }));
}

/** S'abonne, et rend de quoi se désabonner. */
export function surModification(
  rappel: (p: PortefeuilleModifie) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const ecouteur = (e: Event) => {
    const p = (e as CustomEvent<PortefeuilleModifie>).detail;
    if (p?.id) rappel(p);
  };
  window.addEventListener(EVENEMENT, ecouteur);
  return () => window.removeEventListener(EVENEMENT, ecouteur);
}
