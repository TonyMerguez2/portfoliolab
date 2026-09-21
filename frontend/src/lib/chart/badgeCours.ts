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
  hote.appendChild(el);

  const placer = () => {
    const etat = lire();
    if (!etat) { el.style.visibility = "hidden"; return; }
    const y = serie.priceToCoordinate(etat.valeur);
    const largeur = chart.priceScale("right").width();
    if (y == null || !(largeur > 0)) { el.style.visibility = "hidden"; return; }
    el.textContent = etat.texte;
    el.style.width = `${largeur}px`;
    el.style.background = etat.fond;
    el.style.color = etat.encre;
    /* ⚠️ Arrondi au pixel : la bibliothèque rend des ordonnées fractionnaires, et un badge
       posé à 462,4 px fait baver son texte sur deux rangées de pixels. */
    el.style.transform = `translateY(${Math.round(y - HAUTEUR / 2)}px)`;
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
