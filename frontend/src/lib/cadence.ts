/**
 * À quelle fréquence les cours sont relus.
 *
 * Une seule valeur, parce qu'il y en avait deux : la page graphique sondait
 * toutes les 60 secondes et l'écrivait sous le prix — « Màj toutes les 60 s » —
 * pendant que le tableau de bord en faisait quatre fois plus sans rien dire.
 * Un même portefeuille avançait donc à deux vitesses selon la page regardée,
 * et l'étiquette de l'une décrivait le réglage de l'autre.
 *
 * Quinze secondes est calé sur la source : mesuré sur ESE.PA, elle change en
 * moyenne toutes les 18 secondes. Sonder plus vite ne rapporte rien — vingt-deux
 * relevés en quarante-cinq secondes n'avaient donné que trois valeurs
 * distinctes — et yfinance, porte non officielle, bride quand on insiste.
 *
 * Sans effet sur le retard, qui appartient à la place : temps réel en crypto et
 * sur le Nasdaq, quinze minutes sur Euronext Paris.
 */
export const CADENCE_COURS_MS = 15_000;

/** L'étiquette, dérivée de la cadence pour qu'elle ne puisse plus la démentir. */
export const LIBELLE_CADENCE = `Màj toutes les ${CADENCE_COURS_MS / 1000} s`;
