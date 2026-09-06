/**
 * Les teintes déjà tirées des logos, partagées par tout ce qui affiche un actif.
 *
 * ⚠️ **Ce cache vivait dans `AssetLogo`, et c'est ce qui obligeait à câbler des rappels.** Seul
 * le composant qui *dessine* un logo pouvait connaître sa teinte : toute autre surface — la
 * carte d'actif, la répartition pavée, la page graphique — devait recevoir un `onColorExtracted`
 * et tenir son propre état pour la même valeur. D'où trois copies d'une seule information, et
 * trois occasions de diverger. Sorti ici, il devient consultable sans rien câbler.
 *
 * ⚠️ **Un module et non `AssetLogo`, parce que `tileStyle` ne doit pas importer de composant.**
 * `couleurActif` a besoin de lire ce cache ; si la table vivait dans le composant, une
 * bibliothèque de couleurs se mettrait à dépendre de React. La leçon a déjà été payée sur
 * `couleur.ts`, où un import de `theme` a fait échouer quatre fichiers de test d'un coup.
 *
 * ⚠️ **Ce que le cache ne fait pas : prévenir.** Il se remplit quand un logo se charge, donc
 * après le premier rendu. Une surface qui le consulte sans s'abonner montrera la couleur de
 * repli jusqu'à son prochain rendu — acceptable pour celles qui se redessinent au fil des
 * cours, et c'est pourquoi les cartes d'actif, elles, gardent leur rappel : elles doivent
 * changer de couleur *à l'arrivée* de la teinte, pas au prochain hasard.
 */

import { clartePercue, ecartPercu, rvbVersHex } from "./couleur";
import type { RVB } from "./couleur";

const _teintes = new Map<string, string>();

/**
 * La couleur de **plaque** d'un logo — le fond sur lequel la marque est posée.
 *
 * ⚠️ **Ce n'est pas la teinte dominante, et confondre les deux a produit deux défauts.** La
 * dominante cherche la couleur la plus marquante du *dessin* ; la plaque est le fond. Sur
 * `ESE.PA` — dessin vert sur plaque blanche — c'est la dominante qui dit juste. Sur `JPM` —
 * lettres blanches sur plaque brune — c'est la plaque, et la dominante comme la table de
 * marques donnaient un bleu qui ne se voyait nulle part sur le logo.
 *
 * ⚠️ **`null` est une réponse, pas une absence.** Une plaque blanche, noire ou grise n'a rien à
 * dire de la marque : on la refuse explicitement, et l'appelant passe à la question suivante.
 * Sans cette distinction, Apple prendrait le noir de sa plaque et Microsoft le blanc de la
 * sienne.
 */
const _plaques = new Map<string, string | null>();

/**
 * L'aspect d'un logo : porte-t-il une plaque, est-il détouré, et de quelle couleur est son dessin ?
 *
 * ⚠️ **Ces réponses décident du fond de la pastille, et rien d'autre ne le peut.** Un logo
 * détouré qui tranche sur sa tuile se pose nu, et c'est net ; celui qui s'y confond réclame une
 * pastille ; un logo à plaque n'a besoin de rien, il porte la sienne.
 *
 * ⚠️ **`detoure` est une question distincte, et l'avoir déduite de `plaque` était une faute.**
 * `plaque` vaut `null` dans deux cas que rien ne distingue une fois la valeur rangée : le logo est
 * détouré, ou il porte une plaque **blanche ou noire** qu'on refuse parce qu'elle ne dit rien de
 * la marque. Tant qu'on ne lui demandait que la couleur d'une carte, la confusion était sans
 * effet — les deux cas passent à la question suivante. Elle est apparue en posant la marge :
 * `MSFT` et `AAPL`, plaques opaques refusées pour cause d'achromatisme, se voyaient traités en
 * détourés et leur carré blanc ou noir se mettait à flotter au milieu de la tuile.
 *
 * ⚠️ **`marque` est la couleur moyenne du dessin, et elle a remplacé un booléen `marqueSombre`.**
 * Le booléen répondait « ce dessin est-il sombre ? » avec un seuil absolu — clarté sous 110. La
 * vraie question est « ce dessin se voit-il **sur cette tuile-là** ? », et elle n'a pas de réponse
 * absolue : la carte de chaleur recolore ses tuiles à chaque cours. Mesuré sur les cent logos
 * locaux, le seuil absolu laissait **29 marques sous 3:1 de contraste et 19 sous 2:1** —
 * `WELL` à **1,01**, invisible. On range donc la couleur, dont le booléen se déduit, et non
 * l'inverse.
 */
export type AspectLogo = {
  plaque: string | null;
  detoure: boolean;
  /** La moyenne RVB des pixels opaques du dessin, ou `null` si l'analyse a échoué. */
  marque: RVB | null;
  /**
   * Le dessin est-il **sans couleur** — un aplat de noir, de blanc ou de gris ?
   *
   * ⚠️ **C'est la permission de le recolorer, et rien d'autre ne la donne.** Un logo monochrome
   * ne porte aucune information dans sa teinte : le rendre blanc sur fond sombre ne lui retire
   * rien, et c'est d'ailleurs la variante que les marques publient elles-mêmes pour ces fonds-là.
   * Un logo polychrome, lui, se dénaturerait — d'où la mesure plutôt qu'une liste de tickers.
   */
  monochrome: boolean;
};
const _aspects = new Map<string, AspectLogo>();

export function aspectConnu(ticker: string): AspectLogo | null {
  return _aspects.get(ticker) ?? null;
}

/**
 * La part de la pastille laissée **vide autour du dessin**, de chaque côté.
 *
 * ⚠️ **Elle répare un défaut signalé comme « le bas du logo est coupé », qui n'en était pas un.**
 * Le rendu a été mesuré sur la tuile fautive : boîte et image à 36,4 × 36,4, `objectFit: contain`,
 * débordement nul en haut comme en bas. Rien n'était rogné. Et l'image source non plus : les
 * arches de McDonald's y sont entières, pieds plats compris — c'est le vrai dessin de la marque.
 *
 * ⚠️ **Le défaut était le recadrage de la source, et il est systématique.** FMP rogne au ras de
 * l'encre : sur trente valeurs, **vingt-six des vingt-huit logos détourés touchent les quatre
 * bords** de leur toile, remplissage 1,00. Posé dans une pastille carrée, le dessin vient donc
 * buter contre le bord — et un pied plat qui touche le bord se lit comme une coupe. Ce n'est pas
 * propre à `MCD`, c'est la règle ; `INTC` à 0,78 et `JNJ` à 0,91 sont les exceptions.
 *
 * ⚠️ **Une marge suffit, un recentrage serait du zèle.** Le décalage du centre de l'encre par
 * rapport au centre de la toile ne dépasse **3 %** sur tout l'échantillon : les sources centrent
 * leur dessin. On corrige donc l'échelle, pas la position.
 *
 * ⚠️ **Zéro pour les plaques, et ce n'est pas un oubli.** Un logo à plaque *est* son propre fond :
 * l'écarter des bords laisserait voir la tuile derrière, c'est-à-dire un cadre autour du badge.
 * Seul le dessin détouré veut de l'air.
 *
 * ⚠️ **La question posée est `detoure`, et surtout pas `plaque`.** Les avoir confondues faisait
 * flotter le carré blanc de `MSFT` et le carré noir d'`AAPL` : leurs plaques sont bien opaques,
 * mais `plaque` les refuse comme *couleur* — achromatiques — et rend `null`, qui se lisait
 * « détouré ». Vu à l'écran avant d'être vu dans le code.
 *
 * ⚠️ **Zéro aussi tant que l'analyse n'a pas répondu.** Elle arrive après le chargement de
 * l'image ; marger d'abord ferait sauter la plaque au moment où on apprend que c'en est une. Même
 * arbitrage que le fond de la pastille, et il ne coûte qu'un premier rendu : l'aspect est relu du
 * cache, donc déjà connu à tout affichage suivant.
 */
export const MARGE_DESSIN = 0.10;

/** La marge à laisser autour du dessin, en pixels, pour une pastille de `taille` pixels. */
export function margeDuDessin(taille: number, aspect: AspectLogo | null): number {
  if (!aspect || !aspect.detoure) return 0;
  return taille * MARGE_DESSIN;
}

/**
 * L'écart perçu minimal entre un dessin et sa tuile pour qu'on le laisse nu.
 *
 * ⚠️ **Le rapport de contraste avait été essayé d'abord, et il s'est trompé de 72 sur 99.** Il ne
 * mesure que la luminance : l'œil vert de `NVDA` sur sa tuile mauve n'y valait que 2,12, et se
 * voyait donc réclamer une pastille sombre dont il n'avait aucun besoin — constaté à l'écran,
 * pas déduit. En écart perçu, le même couple mesure 100.
 *
 * ⚠️ **Vingt-cinq parce que la distribution décroche là, et pour aucune autre raison.** Relevé
 * sur les cent logos locaux : 6 sous 25, 7 sous 30, 17 sous 40. Le seuil isole la poignée qui
 * disparaît vraiment — `MRK` à 12,6, `ORCL` à 19,3, `MS` à 22,8 — sans emballer les autres.
 */
export const ECART_MIN = 25;

/** Les deux fonds possibles d'une pastille. Le sombre reprend la surface la plus foncée du thème. */
export const PASTILLE_CLAIRE = "#FFFFFF";
export const PASTILLE_SOMBRE = "#0B1220";

/**
 * La surface supposée quand l'appelant ne dit pas sur quoi il dessine.
 *
 * ⚠️ **Ce n'est pas un défaut arbitraire : toutes les surfaces de l'application sont sombres**,
 * sauf les tuiles de la carte de chaleur — qui, elles, transmettent leur couleur. Supposer clair
 * inverserait chaque logo monochrome de l'application.
 */
export const SURFACE_PAR_DEFAUT = "#0B1220";

/**
 * Le filtre CSS à poser sur le dessin — `none`, ou de quoi le basculer dans l'autre ton.
 *
 * ⚠️ **Il répond au défaut « Apple, il y a toujours un fond blanc, pas juste le logo ».** La
 * pomme est un aplat noir posé sur une fiche bleu nuit : invisible nue, elle recevait une plaque
 * blanche. Recolorer est ici la bonne réponse et non un contournement — une forme monochrome ne
 * porte rien dans sa teinte, et le blanc sur fond sombre est la variante officielle de ces
 * marques-là.
 *
 * ⚠️ **`brightness(0)` d'abord, puis `invert(1)`, et l'ordre compte.** `brightness(0)` écrase le
 * dessin en noir pur **en préservant son canal alpha** ; `invert(1)` le remonte en blanc pur. Un
 * `invert(1)` seul rendrait un gris foncé en gris clair — jamais franc — et trahirait la nuance
 * d'origine au lieu de la remplacer.
 *
 * ⚠️ **Six logos sur cent sont concernés** — `AAPL`, `GS`, `INTC`, `MS`, `PLTR`, `SYK` : les
 * monochromes sombres. Les autres monochromes sont déjà clairs et se voient très bien.
 */
export function filtreDuDessin(aspect: AspectLogo | null, fondSurface: string | null): string {
  if (!aspect?.detoure || !aspect.marque || !aspect.monochrome) return "none";
  const fond = fondSurface ?? SURFACE_PAR_DEFAUT;
  if (ecartPercu(rvbVersHex(aspect.marque), fond) >= ECART_MIN) return "none";
  return clartePercue(fond) < 50 ? "brightness(0) invert(1)" : "brightness(0)";
}

/**
 * Le fond de la pastille : rien, du blanc, ou du sombre — décidé sur le **contraste mesuré**.
 *
 * ⚠️ **Le seuil absolu ne pouvait pas marcher, et ce n'était pas une question de réglage.** La
 * règle précédente posait un fond blanc sous les dessins de clarté inférieure à 110. Elle suppose
 * que le fond, lui, est sombre — vrai du reste de l'application, faux de la carte de chaleur, dont
 * les tuiles vont du vert vif au rouge vif en passant par un gris ardoise. Un dessin proche de
 * sa tuile y disparaît sans qu'aucun seuil absolu ne le voie : `WELL` à 1,01 de contraste,
 * `MRK` à 12,6 d'écart perçu.
 *
 * ⚠️ **Sans fond connu, on retombe sur l'ancienne règle, et c'est volontaire.** Les cartes d'actif
 * et l'en-tête de la page graphique posent leurs logos sur la surface sombre du thème ; leur
 * passer la couleur n'apporterait rien et il faudrait la câbler partout. L'appelant qui *sait*
 * sur quoi il dessine le dit ; les autres gardent un comportement inchangé.
 *
 * ⚠️ **On ne met un fond que s'il **répare** quelque chose.** Si le dessin passe déjà le seuil sur
 * sa tuile, il reste nu : c'est le rendu demandé, et une pastille posée sans nécessité est
 * exactement la vignette collée qu'on cherchait à supprimer.
 */
export function fondPastille(aspect: AspectLogo | null, fondSurface: string | null): string {
  if (!aspect?.detoure || !aspect.marque) return "transparent";
  /**
   * ⚠️ **Un dessin monochrome n'a jamais besoin de plaque : on le recolore.** C'est le défaut
   * signalé — « Apple, il y a toujours un fond blanc, pas juste le logo ». La pomme est un aplat
   * noir de saturation **0,000** ; sur la surface sombre de la fiche d'actif elle disparaîtrait,
   * et la règle lui glissait donc un carré blanc dessous. Or une forme sans couleur se rend
   * simplement **dans l'autre ton** — c'est la variante qu'Apple publie pour les fonds sombres.
   * La plaque reste réservée aux dessins polychromes, qu'on ne peut pas recolorer sans les
   * dénaturer. Le rendu, lui, est décidé par `filtreDuDessin`.
   */
  if (aspect.monochrome) return "transparent";
  const marque = rvbVersHex(aspect.marque);
  /**
   * ⚠️ **Le seuil absolu de clarté a été retiré : il s'est trompé trois fois, jamais deux fois de
   * la même façon.** Il posait une pastille blanche sous tout dessin de luma inférieure à 110.
   * Signalé en dernier : `PYPL`, dont le bleu moyen (26, 83, 149) a une luma de **73** — donc
   * « sombre » — et se voyait coller un carré blanc sur la fiche d'actif, alors qu'il mesure
   * **ΔE 43,3** contre le fond de l'application, soit près du double du seuil. Il n'avait besoin
   * de rien.
   *
   * ⚠️ **Il ne reste donc qu'une règle, appliquée partout.** Sans fond transmis, on suppose la
   * surface sombre du thème — vrai de toute l'application sauf des tuiles de la carte de chaleur,
   * qui transmettent la leur. Supposer, ici, ne coûte rien : c'est une constante du thème, pas une
   * grandeur inventée. Ce qui coûtait cher, c'était de mesurer la mauvaise chose.
   */
  if (ecartPercu(marque, fondSurface ?? SURFACE_PAR_DEFAUT) >= ECART_MIN) return "transparent";
  /* ⚠️ Le meilleur des deux, pas « blanc par défaut » : une marque quasi blanche — dix-sept sur
     les cent — se perd sur du blanc et ressort sur du sombre. */
  return ecartPercu(marque, PASTILLE_CLAIRE) >= ecartPercu(marque, PASTILLE_SOMBRE)
    ? PASTILLE_CLAIRE : PASTILLE_SOMBRE;
}

export function retenirAspect(ticker: string, a: AspectLogo): void {
  _aspects.set(ticker, a);
  _plaques.set(ticker, a.plaque);
}

/** La teinte connue pour ce ticker, ou `null` si aucun logo n'a encore été analysé. */
export function teinteConnue(ticker: string): string | null {
  return _teintes.get(ticker) ?? null;
}

/** Range une teinte fraîchement extraite. */
export function retenirTeinte(ticker: string, hex: string): void {
  _teintes.set(ticker, hex);
}

/**
 * Vrai si le logo de ce ticker a déjà été analysé, quel qu'ait été le résultat.
 *
 * ⚠️ **La question se pose sur la plaque et non sur la teinte, parce que l'une est toujours
 * écrite et l'autre non.** L'extraction de teinte abandonne sans rien ranger quand le dessin
 * n'offre aucun pixel assez vif — un logo en noir et blanc, par exemple. Se fier à elle ferait
 * retélécharger ces logos-là à chaque remontage, indéfiniment. La plaque, elle, est rangée dans
 * tous les cas : `null` y est une réponse.
 */
export function analyseFaite(ticker: string): boolean {
  return _plaques.has(ticker);
}

/** La couleur de plaque connue, ou `null` si le logo n'en a pas d'exploitable. */
export function plaqueConnue(ticker: string): string | null {
  return _plaques.get(ticker) ?? null;
}

/** Range une plaque relevée — `null` compris, qui est un résultat. */
export function retenirPlaque(ticker: string, hex: string | null): void {
  _plaques.set(ticker, hex);
}
