import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";
import { FONT } from "@/lib/typography";

/**
 * Le badge de dernière valeur, dessiné par nous plutôt que par la bibliothèque.
 *
 * ⚠️ **Parce que ses quatre coins ne s'arrondissent pas.** lightweight-charts peint
 * l'étiquette de l'échelle avec les rayons `[r, 0, 0, r]` — relevé dans son code : seuls
 * les deux coins extérieurs sont arrondis, les deux qui font face au graphique restent
 * carrés. C'est sa forme d'origine, celle des terminaux de marché, et aucune option ne
 * l'ouvre : ni les réglages de série, ni les greffons d'axe, qui ne portent que le texte
 * et les couleurs.
 *
 * ⚠️ **Une surcouche HTML, et non un canevas de plus.** Le badge est un `div` posé
 * au-dessus de l'échelle : il se relit, se règle en CSS, et suit le thème sans qu'on
 * redessine quoi que ce soit. Le prix à payer est qu'il faut le repositionner nous-mêmes —
 * d'où `rafraichir`, que l'appelant doit appeler quand la donnée change, la bibliothèque
 * n'émettant rien quand l'échelle se recadre toute seule.
 */
export type Badge = { rafraichir: () => void; detruire: () => void };

/** Ce que le badge doit afficher à cet instant, ou `null` pour le masquer. */
export type EtatBadge = { valeur: number; texte: string; fond: string; encre: string } | null;

/**
 * L'encre qui se lit sur ce fond.
 *
 * ⚠️ **Parce que la couleur du badge est celle de la courbe, et qu'elle varie.** Elle suit
 * le portefeuille — du cyan clair au rouge soutenu — et un blanc fixe disparaîtrait sur les
 * plus claires. Le seuil porte sur la luminance perçue, pas sur la teinte : c'est ce qui
 * décide de la lisibilité.
 */
export function encreLisible(fond: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(fond.trim());
  if (!m) return "#FFFFFF";
  const n = parseInt(m[1], 16);
  const canal = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const y = 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255)
    + 0.0722 * canal(n & 255);
  return y > 0.45 ? "#0B101B" : "#FFFFFF";
}

const HAUTEUR = 18;
const RAYON = 4;

export function poserBadge(
  chart: IChartApi,
  serie: ISeriesApi<SeriesType>,
  hote: HTMLElement,
  lire: () => EtatBadge,
): Badge {
  const el = document.createElement("div");
  el.dataset.nvBadge = "cours";
  Object.assign(el.style, {
    position: "absolute", right: "0", top: "0", zIndex: "2",
    height: `${HAUTEUR}px`, borderRadius: `${RAYON}px`,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: FONT, fontSize: "11px", fontWeight: "500",
    fontVariantNumeric: "tabular-nums",
    /* ⚠️ Transparent aux gestes : il couvre l'échelle, dont le glissement règle le zoom
       vertical. Un badge opaque aux clics y creuserait un trou mort de dix-huit pixels. */
    pointerEvents: "none",
    visibility: "hidden",
  } satisfies Partial<CSSStyleDeclaration>);
  /* ⚠️ L'hôte doit être un repère de position, sinon le badge se cale sur un ancêtre
     lointain et part ailleurs sur la page. On ne le force que s'il n'en est pas déjà un. */
  if (getComputedStyle(hote).position === "static") hote.style.position = "relative";
  hote.appendChild(el);

  /**
   * ⚠️ **Rien de ce badge ne doit pouvoir abattre la page.** Il est décoratif, mais il
   * interroge la bibliothèque — coordonnée, largeur d'échelle, hauteur de l'axe des dates,
   * formateur — depuis un abonnement qu'elle déclenche elle-même, et ses accesseurs lèvent
   * « Value is null » dès que son modèle interne n'est pas encore, ou n'est plus, en état :
   * série vide, panneau non mesuré, graphique en cours de destruction. Remontée depuis le
   * site, sur un écran d'erreur pleine page — pour une étiquette de prix.
   *
   * ⚠️ **J'ai d'abord accusé l'animation de tracé**, livrée en même temps, et je l'ai
   * corrigée puis retirée : l'erreur est revenue à l'identique. Elle venait d'ici.
   *
   * ⚠️ **Le remède est de se taire, pas de deviner laquelle des questions a échoué.** Un
   * badge qui disparaît une image est invisible ; une page blanche ne l'est pas.
   */
  let signale = false;
  const placer = () => {
    try { placerVraiment(); }
    catch (err) {
      el.style.visibility = "hidden";
      /* Une fois, pas à chaque image : ce calcul repasse à chaque déplacement de la vue. */
      if (!signale) { signale = true; console.warn("Badge de cours : pose impossible", err); }
    }
  };

  const placerVraiment = () => {
    const etat = lire();
    if (!etat) { el.style.visibility = "hidden"; return; }
    /* L'ordonnée d'abord : elle est rendue sans rien exiger, et vaut `null` hors cadre.
       Les mesures du graphique ne sont demandées qu'ensuite, une fois qu'on sait qu'il y a
       quelque chose à poser. */
    const y = serie.priceToCoordinate(etat.valeur);
    if (y == null) { el.style.visibility = "hidden"; return; }
    const largeur = chart.priceScale("right").width();
    if (!(largeur > 0)) { el.style.visibility = "hidden"; return; }
    el.textContent = etat.texte;
    el.style.width = `${largeur}px`;
    el.style.background = etat.fond;
    el.style.color = etat.encre;
    /**
     * ⚠️ **Retenu dans le cadre, comme l'étiquette native.** `priceToCoordinate` rend une
     * ordonnée même quand la valeur sort de la plage affichée : il suffit de reculer dans
     * l'historique pour que le dernier cours passe loin au-dessus du haut. Mesuré à
     * **−371 px** sur la vue longue de SPY — le badge partait au-dessus de la page. La
     * bibliothèque, elle, cale son étiquette contre le bord ; on fait de même.
     *
     * ⚠️ **Le bas s'arrête à l'échelle des dates**, dont la hauteur se demande au
     * graphique : sans cela, le badge se poserait par-dessus les années.
     */
    const bas = hote.clientHeight - chart.timeScale().height() - HAUTEUR;
    const pose = Math.min(Math.max(0, y - HAUTEUR / 2), Math.max(0, bas));
    /* ⚠️ Arrondi au pixel : la bibliothèque rend des ordonnées fractionnaires, et un badge
       posé à 462,4 px fait baver son texte sur deux rangées de pixels. */
    el.style.transform = `translateY(${Math.round(pose)}px)`;
    el.style.visibility = "visible";
  };

  placer();
  const ts = chart.timeScale();
  ts.subscribeVisibleLogicalRangeChange(placer);
  const ro = new ResizeObserver(placer);
  ro.observe(hote);

  return {
    rafraichir: placer,
    detruire: () => {
      ts.unsubscribeVisibleLogicalRangeChange(placer);
      ro.disconnect();
      el.remove();
    },
  };
}
