/**
 * La grille d'un mois, semaine par semaine, du lundi au dimanche.
 *
 * Pure et sans DOM : le calcul des débordements de mois est exactement le genre
 * de chose qui se trompe d'un jour en février ou lors d'un changement d'heure, et
 * qu'un test attrape en une ligne.
 */

/** Une case de la grille. */
export interface Case {
  /** Date ISO « AAAA-MM-JJ ». */
  iso: string;
  jour: number;
  /** Faux pour les jours empruntés au mois précédent ou suivant. */
  duMois: boolean;
}

/** Les noms de jours de la maquette, dans l'ordre où elle les affiche. */
export const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/** « AAAA-MM-JJ » d'une date locale, sans passer par UTC. */
function iso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const j = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${j}`;
}

/**
 * Les six semaines qui contiennent le mois donné.
 *
 * ⚠️ **Six semaines, toujours.** Un mois en occupe quatre à six selon le jour où
 * il commence ; rendre le compte juste ferait changer la hauteur de la grille d'un
 * mois à l'autre, et le panneau sauterait à chaque flèche. Quarante-deux cases
 * couvrent tous les cas.
 *
 * ⚠️ **La semaine commence le lundi.** `getDay()` rend 0 pour dimanche : utiliser
 * cette valeur telle quelle décalerait toute la grille d'un jour, et les mois
 * commençant un dimanche ouvriraient une semaine entière de vide.
 */
export function grilleDuMois(annee: number, mois: number): Case[] {
  const premier = new Date(annee, mois, 1);
  // 0 = lundi … 6 = dimanche.
  const decalage = (premier.getDay() + 6) % 7;
  const debut = new Date(annee, mois, 1 - decalage);

  const cases: Case[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + i);
    cases.push({ iso: iso(d), jour: d.getDate(), duMois: d.getMonth() === mois });
  }
  return cases;
}

/** Le mois précédent ou suivant, sans déborder d'année. */
export function decalerMois(annee: number, mois: number, pas: number): [number, number] {
  const total = annee * 12 + mois + pas;
  return [Math.floor(total / 12), ((total % 12) + 12) % 12];
}

export const NOMS_MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
