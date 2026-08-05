/**
 * De combien de crans avancer pour aller d'un chiffre à l'autre.
 *
 * Toujours vers l'avant : de 9 à 0, un cran et non neuf en arrière. Un compteur
 * qui recule pour afficher un nombre plus grand se lit comme une baisse, ce qui
 * est le contraire de ce que le mouvement doit dire.
 *
 * C'est aussi ce qui dimensionne la bande des chiffres : la position de départ
 * vaut au plus 9 et l'avance au plus 9, donc jamais au-delà de 18. Deux séries
 * de dix chiffres suffisent, et la position revient dans la première une fois
 * le mouvement terminé.
 */
export function crans(avant: number, apres: number): number {
  return (apres - avant + 10) % 10;
}
