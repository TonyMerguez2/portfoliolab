/**
 * À quelle fréquence les cours sont relus.
 *
 * Une seule valeur, parce qu'il y en avait deux : la page graphique sondait
 * toutes les 60 secondes et l'écrivait sous le prix — « Màj toutes les 60 s » —
 * pendant que le tableau de bord en faisait quatre fois plus sans rien dire.
 * Un même portefeuille avançait donc à deux vitesses selon la page regardée,
 * et l'étiquette de l'une décrivait le réglage de l'autre.
 *
 * Dix secondes, calé sur le cache de Yahoo et non sur l'agitation des titres.
 *
 * Le premier réglage tenait 15 s, justifié par ESE.PA qui ne changeait que
 * toutes les 18 secondes. L'échantillon était mauvais : cet ETF est peu
 * liquide, si bien que la mesure mélangeait la lenteur du titre et celle de la
 * source. Repris sur des instruments qui cotent en continu, le pas se révèle
 * bien plus régulier — 10,9 s sur BTC-USD, 10,2 s sur MC.PA, jamais moins de
 * dix quel que soit l'instrument. Bitcoin bougeant plusieurs fois par seconde,
 * ce plancher n'est pas celui du marché : c'est Yahoo qui rafraîchit son cache
 * toutes les dix secondes environ.
 *
 * Sonder plus vite ne rendrait donc rien de neuf, et yfinance — porte non
 * officielle — bride quand on insiste. Sonder à 15 s, en revanche, manquait
 * environ un rafraîchissement sur trois.
 *
 * Sans effet sur le retard, qui appartient à la place : temps réel en crypto et
 * sur le Nasdaq, quinze minutes sur Euronext Paris.
 */
export const CADENCE_COURS_MS = 10_000;

/** L'étiquette, dérivée de la cadence pour qu'elle ne puisse plus la démentir. */
export const LIBELLE_CADENCE = `Màj toutes les ${CADENCE_COURS_MS / 1000} s`;
