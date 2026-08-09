"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { couleurGrille, ecrireStyleGrille, lireStyleGrille, LIBELLE_GRILLE, STYLES_GRILLE, type StyleGrille } from "@/lib/grille";
import {
  createChart, AreaSeries, CandlestickSeries, ColorType, CrosshairMode, LineStyle,
  type Logical, type MouseEventParams,
  type IChartApi, type ISeriesApi, type UTCTimestamp,
} from "lightweight-charts";
import type { HistoryPoint, Period } from "@/lib/chart/portfolioCurve";
import { FONT, NUM } from "@/lib/typography";
import { enTetesAuth } from "@/lib/session";
import { COULEUR_OP, COULEUR_OP_CLAIR, GLYPHE_OP, type TypeOp } from "@/lib/journal";
import { useModeTheme, resoudreJeton } from "@/lib/theme";
import { RAYONS, JETONS } from "@/lib/palette";
import { agregerEnBougies } from "@/lib/chart/series";
import { ancresParJour, dominante, jourAncre } from "@/lib/chart/reperes";
import { cleSource } from "@/lib/chart/sourceSerie";
import {
  GLYPHES, TAILLE_DEFAUT, cleStickers, ecrireStickers, idSticker, lireStickers,
  coordonneeFine, logiqueFine, logiqueVersTemps, tailleEtiree, tempsVersLogique,
  type Sticker,
} from "@/lib/chart/stickers";
import Segments from "@/components/ui/Segments";

export type { HistoryPoint, Period };

/**
 * Courbe de valeur du portefeuille.
 *
 * Sur lightweight-charts, comme la page graphique, et non sur un tracé SVG
 * maison : c'est la seule façon d'obtenir *exactement* la même échelle à
 * droite, la même pastille de dernière valeur et la même croix de visée. Deux
 * implémentations auraient divergé au premier réglage, et le même portefeuille
 * se serait lu différemment selon la page.
 *
 * La série vient de `/portfolio-history`, en base 1 au début de la fenêtre.
 * C'est ici qu'on la ramène en euros, en clouant le *dernier* point sur la
 * valeur totale — le seul montant que l'utilisateur connaisse pour de vrai.
 * L'ancrer au début produirait une courbe finissant à côté du chiffre affiché
 * juste au-dessus d'elle.
 */

// Mêmes périodes et mêmes libellés que la page graphique : le même portefeuille
// doit s'interroger avec les mêmes mots d'un écran à l'autre.
const PERIOD_API: Record<Period, string> = {
  "24h": "1d", "1S": "7d", "1M": "1mo", "3M": "3mo",
  "6M": "6mo", "1A": "1y", "3A": "3y", "Max": "max",
};
const PERIODES = Object.keys(PERIOD_API) as Period[];
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Demi-largeur, en pixels, de la portion de courbe éclairée au survol. */
const HALO = 22;

/**
 * Diamètre de la pastille d'opération, et du glyphe qu'elle porte.
 *
 * ⚠️ Vingt-deux pixels, et c'est une mesure, pas un goût. Les glyphes sont
 * dessinés sur une boîte de 24 unités et détaillés — le chariot a deux roues et
 * une anse. Rendus côte à côte à taille réelle sur le fond de l'application :
 * illisibles à 10 px, où le chariot devient un pâté ; à peine devinables à
 * 12 ; lisibles à 14. La pastille valant le glyphe plus ses deux pixels de
 * contour de chaque côté, 14 impose 22.
 *
 * Le coût est assumé : les repères occupent 22 % de plus sur la courbe qu'avec
 * les flèches au trait qui les précédaient. C'est le prix d'un pictogramme qui
 * se lit sans légende.
 */
const PASTILLE = 22;

/**
 * Le contour de la pastille, peint dans la couleur du fond.
 *
 * Il détache le disque de la courbe qui le traverse — voir le style de la
 * pastille — mais il ne se lit pas comme une partie du repère : l'œil y voit du
 * fond, pas de la pastille.
 */
const CONTOUR = 2;

/**
 * ⚠️ **La surface colorée réellement vue**, et la seule mesure qui compte pour
 * proportionner un glyphe.
 *
 * C'est la distinction qui manquait, et elle a produit deux repères visiblement
 * différents pour la même chose. La vignette de l'encart avait été dimensionnée
 * sur la boîte *extérieure* de la pastille : 10/16 contre 14/22, soit 0,625
 * contre 0,636 — presque identiques, donc apparemment cohérents. Mais rapportés
 * au disque coloré, les deux rapports sont 0,625 et **0,778** : sur la courbe le
 * glyphe emplit son disque, dans l'encart il y flotte.
 *
 * Les deux partagent désormais le même disque et le même glyphe. La pastille n'en
 * diffère que par son contour, qui s'ajoute à l'extérieur.
 */
const DISQUE = PASTILLE - 2 * CONTOUR;
/** Deux pixels de marge autour du glyphe, de chaque côté du disque. */
const GLYPHE = DISQUE - 4;

/**
 * Écritures détaillées au plus dans l'encart, les suivantes étant comptées.
 *
 * Trois lignes, et non cinq : au-delà, l'encart devient un tableau posé sur la
 * courbe qu'il commente — les lignes du bas débordent du bandeau de tête et
 * recouvrent le tracé. Le compte des restantes suffit à dire qu'il y en a, et le
 * clic sur la bulle ouvre l'onglet Transactions, qui les porte toutes.
 */
const MAX_LIGNES_ENCART = 3;

/**
 * Pictogramme d'une opération.
 *
 * Quatre cercles de couleurs différentes demanderaient de retenir un code ; un
 * chariot, une étiquette et deux flèches opposées se lisent sans légende.
 *
 * Les tracés viennent de `GLYPHE_OP`, où un `Record<TypeOp, …>` garantit qu'un
 * type ne peut pas exister sans son dessin.
 */
function Pictogramme({ type, taille = GLYPHE }: { type: string; taille?: number }) {
  const trace = GLYPHE_OP[type as TypeOp] ?? GLYPHE_OP.achat;
  return (
    <svg
      width={taille} height={taille} viewBox="0 0 24 24" fill="currentColor"
      // Sans `display: block`, le SVG reste en ligne et s'aligne sur la ligne de
      // base : il se posait deux pixels sous le centre du cercle.
      style={{ display: "block" }}
    >
      <path d={trace} />
    </svg>
  );
}

/**
 * Le pictogramme d'un mode d'affichage.
 *
 * Trois glyphes pleins, sur une boîte de 24 unités, rendus à 14 px comme les
 * autres icônes du bandeau. Ils sont en `fill` et non en trait : c'est le jeu
 * dont ils viennent, et le mélanger avec des tracés au trait de 1,5 aurait donné
 * trois poids différents sur trois boutons voisins.
 *
 * Chaque glyphe désigne l'état qu'il représente, et non celui qui suivrait un
 * clic. Le bouton unique qui faisait tourner les trois modes montrait le mode
 * suivant, parce qu'il n'avait aucun autre moyen d'annoncer où il menait ; une
 * piste à deux pastilles montre l'état retenu, donc chaque pastille porte le
 * sien.
 */
function MarqueMode({ cible }: { cible: "ligne" | "bougie" }) {
  const commun = {
    width: 14, height: 14, viewBox: "0 0 24 24", fill: "currentColor",
    "aria-hidden": true as const, style: { display: "block" },
  };
  if (cible === "bougie") {
    return (
      <svg {...commun}>
        <path d="M6.167 3.25a.97.97 0 0 1 .965.859l.007.113v.973a1.944 1.944 0 0 1 1.94 1.798l.004.146v2.917a1.944 1.944 0 0 1-1.798 1.94L7.139 12v7.778a.972.972 0 0 1-1.938.114l-.007-.114V12a1.944 1.944 0 0 1-1.94-1.8l-.004-.145V7.139A1.945 1.945 0 0 1 5.049 5.2l.145-.004v-.973a.97.97 0 0 1 .973-.972M12 3.25a.97.97 0 0 1 .965.859l.007.113v8.75a1.945 1.945 0 0 1 1.94 1.8l.005.145v2.917a1.945 1.945 0 0 1-1.799 1.94l-.146.005a.973.973 0 0 1-1.937.114l-.007-.114-.146-.005a1.945 1.945 0 0 1-1.793-1.787l-.006-.153v-2.917a1.945 1.945 0 0 1 1.799-1.94l.146-.004v-8.75A.97.97 0 0 1 12 3.25M17.833 3.25a.97.97 0 0 1 .966.859l.007.113a1.944 1.944 0 0 1 1.94 1.799l.004.146v3.889a1.944 1.944 0 0 1-1.799 1.94l-.145.005v7.778a.973.973 0 0 1-1.938.114l-.007-.114V12a1.944 1.944 0 0 1-1.94-1.8l-.004-.145v-3.89a1.945 1.945 0 0 1 1.798-1.939l.146-.005a.97.97 0 0 1 .972-.972" />
      </svg>
    );
  }
  return (
    <svg {...commun}>
      <path d="M15.13 9.438a.97.97 0 0 1 1.355-.16l.091.08 3.89 3.882a.97.97 0 0 1 .275.56l.009.127v4.852a.97.97 0 0 1-.858.964l-.114.007H4.2l-.107-.009-.107-.02-.104-.032-.102-.045-.097-.057-.092-.068-.058-.053-.07-.08-.062-.086-.053-.094-.015-.034-.04-.1-.025-.102-.015-.105-.004-.107.009-.107.018-.102q.015-.057.034-.108l.045-.102.057-.097 3.89-5.824a.97.97 0 0 1 1.132-.378l.11.048 3.187 1.59z" />
      <path d="M15.142 3.6a.973.973 0 0 1 1.344-.146l.09.08 3.89 3.883a.97.97 0 0 1-1.284 1.453l-.092-.08-3.136-3.13-4.18 5.005a.97.97 0 0 1-1.069.295l-.112-.048L7.43 9.334 5 12.568a.973.973 0 0 1-1.259.26l-.102-.066a.97.97 0 0 1-.262-1.257l.068-.102L6.36 7.521a.97.97 0 0 1 1.106-.331l.107.045 3.2 1.597z" />
    </svg>
  );
}

/**
 * L'habillage du canevas : texte, grille, réticule.
 *
 * lightweight-charts peint sur un canevas et ne sait pas résoudre `var(...)`.
 * Ces couleurs sont donc écrites en clair, et regroupées ici parce qu'elles
 * servent deux fois — à la création du graphique, et à chaque changement de
 * thème, le graphique n'étant créé qu'une seule fois.
 */
/** Clé de rangement de la couleur de courbe, propre à ce graphique. */
const CLE_COULEUR = "novac-graphique-couleur";

function habillage(clair: boolean, grille: StyleGrille = "standard") {
  return {
    layout: {
      attributionLogo: false,
      background: { type: ColorType.Solid, color: "transparent" },
      textColor: resoudreJeton("--nv-texte-secondaire", clair ? "#364153" : "#99A1AF"),
      fontSize: 11,
    },
    grid: {
      vertLines: { visible: false },
      horzLines: {
        color: couleurGrille(grille, clair) ?? "rgba(0,0,0,0)",
        style: LineStyle.Solid,
        visible: grille !== "none",
      },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: resoudreJeton("--nv-bord-fort", clair ? "#D1D5DC" : "#1E2939"),
                  style: LineStyle.Solid, width: 1 as const,
                  labelBackgroundColor: resoudreJeton("--nv-texte-intense", clair ? "#101828" : "#FFFFFF") },
      horzLine: { color: resoudreJeton("--nv-bord-fort", clair ? "#D1D5DC" : "#1E2939"),
                  style: LineStyle.Solid, width: 1 as const,
                  labelBackgroundColor: resoudreJeton("--nv-texte-intense", clair ? "#101828" : "#FFFFFF") },
    },
  };
}

/**
 * Réglages d'apparence du graphique : couleur de la courbe, densité de grille.
 *
 * La page d'un actif a déjà un panneau équivalent, mais il vit dans son
 * fichier et traite aussi les bougies. Celui-ci est volontairement réduit aux
 * deux réglages qui ont un sens sur un portefeuille, et il parle la langue de
 * la nouvelle page : piste creuse, pastille claire, jetons partout.
 *
 * Les teintes proposées viennent de la palette du concept plutôt que d'une
 * roue chromatique libre : un nuancier ouvert produit vite une courbe qui ne
 * s'accorde avec rien d'autre à l'écran.
 */
const TEINTES: { nom: string; valeur: string }[] = [
  { nom: "Bleu",    valeur: "#50A2FF" },
  { nom: "Menthe",  valeur: "#00D492" },
  { nom: "Ambre",   valeur: "#FF8904" },
  { nom: "Corail",  valeur: "#FF6467" },
  { nom: "Cyan",    valeur: "#00BCFF" },
  { nom: "Ardoise", valeur: "#99A1AF" },
];

function PanneauReglages({
  couleur, surCouleur, fermer, ancre,
}: {
  couleur: string;
  surCouleur: (v: string | null) => void;
  fermer: () => void;
  /** Coin haut-droit du panneau, en coordonnées de fenêtre. */
  ancre: { droite: number; haut: number };
}) {
  // Rendu dans le corps du document, et non sur place.
  //
  // Le cadre du graphique porte un `backdrop-filter`, ce qui en fait le bloc
  // conteneur de ses descendants en position fixe : le panneau s'y ancrait,
  // et ses coordonnées de fenêtre le projetaient hors de l'écran. Le même
  // piège que la modale de profil, dont la barre latérale porte la note.
  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      {/* Voile de fermeture : un clic hors du panneau le referme, sans qu'on
          ait à écouter le document et à démêler les clics du panneau lui-même. */}
      <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={fermer} />
      {/* Position fixe et non absolue : la carte du graphique rogne son
          débordement — la courbe en a besoin — et un panneau posé dedans s'y
          faisait couper. Il s'ancre donc sur le bouton, en coordonnées de
          fenêtre. */}
      <div role="dialog" aria-label="Apparence du graphique" style={{
        position: "fixed", top: ancre.haut, right: ancre.droite, zIndex: 41, width: 208,
        background: JETONS.carte, border: `1px solid ${JETONS.bordFort}`,
        borderRadius: RAYONS.md, padding: 12, boxShadow: JETONS.ombre,
      }}>
        <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
                      color: JETONS.texteAttenue, marginBottom: 8 }}>COULEUR DE LA COURBE</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {TEINTES.map(t => {
            const actif = couleur.toLowerCase() === t.valeur.toLowerCase();
            return (
              <button key={t.valeur} type="button" title={t.nom}
                aria-pressed={actif} onClick={() => surCouleur(t.valeur)}
                style={{
                  width: 22, height: 22, borderRadius: RAYONS.xs, cursor: "pointer",
                  background: t.valeur, padding: 0,
                  // Le liseré du choix retenu est clair et détaché de la
                  // pastille : un contour de sa propre teinte serait invisible.
                  border: `2px solid ${actif ? JETONS.texteIntense : "transparent"}`,
                  boxShadow: actif ? JETONS.segmentOmbre : "none",
                }} />
            );
          })}
          <button type="button" title="Rendre la couleur du portefeuille"
            onClick={() => surCouleur(null)}
            style={{
              width: 22, height: 22, borderRadius: RAYONS.xs, cursor: "pointer", padding: 0,
              background: JETONS.segmentPiste, border: `1px solid ${JETONS.bord}`,
              color: JETONS.texteFort, fontFamily: FONT, fontSize: 12, lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>↺</button>
        </div>

      </div>
    </>,
    document.body,
  );
}

/**
 * Choix d'un sticker à poser.
 *
 * Le panneau **ne referme pas** en choisissant : le clic suivant doit tomber sur
 * la courbe, pas sur le voile de fermeture. C'est la différence avec les deux
 * autres panneaux, dont le choix est complet dès qu'il est fait. Ici choisir ne
 * fait qu'armer ; poser reste à faire.
 */
function PanneauStickers({
  arme, surGeste, surVider, nbPoses, fermer, ancre,
}: {
  arme: string | null;
  /** Démarre le geste d'un glyphe : armement si relâché sur place, dépose sinon. */
  surGeste: (glyphe: string, x: number, y: number) => void;
  surVider: () => void;
  nbPoses: number;
  fermer: () => void;
  ancre: { droite: number; haut: number };
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={fermer} />
      <div role="dialog" aria-label="Stickers" style={{
        position: "fixed", top: ancre.haut, right: ancre.droite, zIndex: 41, width: 208,
        background: JETONS.carte, border: `1px solid ${JETONS.bordFort}`,
        borderRadius: RAYONS.md, padding: 12, boxShadow: JETONS.ombre,
      }}>
        <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
                      color: JETONS.texteAttenue, marginBottom: 8 }}>STICKERS</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0,1fr))", gap: 4 }}>
          {GLYPHES.map(g => {
            const actif = arme === g;
            return (
              <button key={g} type="button" aria-pressed={actif}
                title={actif ? "Cliquez sur la courbe pour le poser" : "Choisir ce sticker"}
                // ⚠️ `pointerdown` et non `onClick` : le même appui sert aux deux
                // gestes. Relâché sur place il arme le glyphe ; traîné jusqu'au
                // graphique il l'y dépose. C'est le moteur de gestes qui tranche,
                // au seuil de quelques pixels.
                onPointerDown={e => { e.preventDefault(); surGeste(g, e.clientX, e.clientY); }}
                style={{
                  height: 26, padding: 0, cursor: "pointer", borderRadius: RAYONS.xs,
                  background: actif ? JETONS.segmentActif : JETONS.segmentPiste,
                  border: `1px solid ${actif ? JETONS.segmentActif : JETONS.bord}`,
                  fontSize: 14, lineHeight: 1,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background 250ms",
                }}>{g}</button>
            );
          })}
        </div>
        <div style={{ fontFamily: FONT, fontSize: 10.5, color: JETONS.texteAttenue,
                      marginTop: 10, lineHeight: 1.45 }}>
          {arme
            ? "Cliquez sur le graphique pour le poser."
            : "Faites glisser un sticker sur le graphique, ou cliquez-le puis cliquez le graphique."}
          {nbPoses > 0 && <><br />Cliquez un sticker posé pour le sélectionner, puis déplacez-le, étirez sa poignée ou retirez-le.</>}
        </div>
        {nbPoses > 0 && (
          <button type="button" onClick={surVider}
            style={{
              marginTop: 10, width: "100%", height: 26, cursor: "pointer",
              borderRadius: RAYONS.xs, background: JETONS.segmentPiste,
              border: `1px solid ${JETONS.bord}`, color: JETONS.texteFort,
              fontFamily: FONT, fontSize: 10.5, fontWeight: 500,
            }}>
            Tout retirer ({nbPoses})
          </button>
        )}
      </div>
    </>,
    document.body,
  );
}

/**
 * Choix du style de grille — les quatre mêmes que sur la page d'un actif.
 *
 * Chaque option montre un aperçu plutôt que son seul nom : « Minimal » et
 * « Standard » ne se distinguent qu'à l'œil, et un libellé seul obligerait à
 * essayer les quatre pour comprendre.
 */
function PanneauGrille({
  style, surStyle, fermer, ancre,
}: {
  style: StyleGrille;
  surStyle: (v: StyleGrille) => void;
  fermer: () => void;
  ancre: { droite: number; haut: number };
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={fermer} />
      <div role="dialog" aria-label="Style de la grille" style={{
        position: "fixed", top: ancre.haut, right: ancre.droite, zIndex: 41, width: 196,
        background: JETONS.carte, border: `1px solid ${JETONS.bordFort}`,
        borderRadius: RAYONS.md, padding: 12, boxShadow: JETONS.ombre,
      }}>
        <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
                      color: JETONS.texteAttenue, marginBottom: 8 }}>STYLE DE GRILLE</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 6 }}>
          {STYLES_GRILLE.map(v => {
            const actif = v === style;
            const filet = couleurGrille(v, false);
            return (
              <button key={v} type="button" aria-pressed={actif} onClick={() => surStyle(v)}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                  padding: "7px 4px 6px", cursor: "pointer", borderRadius: RAYONS.xs,
                  background: actif ? JETONS.segmentActif : JETONS.segmentPiste,
                  border: `1px solid ${actif ? JETONS.segmentActif : JETONS.bord}`,
                  color: actif ? JETONS.segmentEncre : JETONS.texteFort,
                  fontFamily: FONT, fontSize: 10.5, fontWeight: 500,
                  transition: "background 250ms, color 250ms",
                }}>
                {/* Aperçu : les filets tels qu'ils se peindront, sur un fond de
                    carte. Ils sont dessinés en clair pour rester lisibles sur la
                    pastille blanche de l'option retenue. */}
                <svg width="30" height="20" viewBox="0 0 30 20" style={{ flexShrink: 0 }} aria-hidden="true">
                  <rect width="30" height="20" rx="2" fill={JETONS.fond} />
                  {filet && [5, 10, 15].map(y => (
                    <line key={y} x1="0" y1={y} x2="30" y2={y} stroke={filet} strokeWidth="1" />
                  ))}
                </svg>
                {LIBELLE_GRILLE[v]}
              </button>
            );
          })}
        </div>
      </div>
    </>,
    document.body,
  );
}

/**
 * Deux listes de repères décrivent-elles le même affichage ?
 *
 * Sert à ne pas réveiller React quand un recalcul retombe sur le même résultat —
 * le cas d'un rafraîchissement des cours qui ne déplace aucun repère. La
 * comparaison passe par une clé textuelle plutôt que champ par champ : les
 * positions sont déjà arrondies à l'entier, donc deux affichages identiques
 * donnent exactement la même chaîne.
 */
function memeListe<T>(a: readonly T[], b: readonly T[], cle: (x: T) => string): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (cle(a[i]) !== cle(b[i])) return false;
  return true;
}

/**
 * ⚠️ **Sans les coordonnées**, et c'est là tout l'intérêt.
 *
 * Elles y étaient, et elles faisaient trembler les repères. Le raisonnement :
 * `subscribeVisibleLogicalRangeChange` déclenche un recalcul, celui-ci posait les
 * nouvelles positions dans un état React, et React livre son rendu à la trame
 * suivante — alors que la bibliothèque, elle, a déjà repeint sa toile dans la
 * trame courante. La courbe avançait donc d'un cran avant ses pastilles, et à la
 * molette comme au glissement on voyait les bulles nager derrière le tracé.
 *
 * Les positions sont désormais écrites directement dans le DOM par `placer`, dans
 * la trame même du recalcul. Ces clés ne servent plus qu'à savoir si la
 * *composition* de la liste a changé — ce qui n'arrive qu'en changeant de
 * portefeuille, de période ou d'écritures.
 */
const cléPastille = (p: { id: number; titre: string; nombre: number }) =>
  `${p.id}:${p.nombre}:${p.titre}`;
const cléRepere = (r: { sens: string; titre: string }) => `${r.sens}:${r.titre}`;

/** Une position en pixels dans le cadre, ou `null` hors du cadre. */
type Coord = { x: number; y: number } | null;

/**
 * Ancre un repère à sa position, ou le masque s'il n'en a pas.
 *
 * `translate3d` plutôt que `left`/`top` : la position ne touche alors ni la mise
 * en page ni le calcul de style, et le navigateur n'a plus qu'à recomposer.
 *
 * Hors cadre, `visibility` plutôt que le retrait du nœud : un repère qui sort par
 * la gauche revient souvent par le même bord, et le détruire pour le recréer
 * aurait rendu la liste instable à chaque déplacement.
 */
function ancrer(n: HTMLElement, c: Coord): void {
  if (!c) { n.style.visibility = "hidden"; return; }
  n.style.visibility = "visible";
  n.style.transform = `translate3d(${c.x}px, ${c.y}px, 0) translate(-50%, -50%)`;
}
const cléStickerPlace = (k: { id: string; x: number; y: number; taille: number; glyphe: string }) =>
  `${k.id}:${k.x}:${k.y}:${k.taille}:${k.glyphe}`;

/**
 * La même couleur, translucide.
 *
 * ⚠️ Le suffixe hexadécimal ne s'ajoute qu'à une couleur hexadécimale. Le repli
 * de `couleurOp` pour un type inconnu est un `var(...)`, auquel on ne peut rien
 * concaténer : on le rend alors tel quel, et l'anneau y est simplement opaque.
 * Écrire `couleur + "59"` sans ce garde aurait produit `var(--nv-accent)59`, que
 * le navigateur ignore en silence — donc un anneau qui disparaît sans dire
 * pourquoi.
 */
function translucide(couleur: string, alphaHex: string): string {
  return couleur.startsWith("#") ? couleur + alphaHex : couleur;
}

/** La couleur d'un type d'opération, selon le thème. */
function couleurOp(type: string, clair: boolean): string {
  const t = type as keyof typeof COULEUR_OP;
  return (clair ? COULEUR_OP_CLAIR : COULEUR_OP)[t] ?? (clair ? "#0B63E7" : "var(--nv-accent)");
}

/**
 * Abrégé des grands nombres, comme sur la page graphique.
 *
 * Deux décimales dans le cas courant : ces pourcentages se lisent à côté du gain
 * en euros de la bande de tête, qui en porte deux, et un chiffre de moins les
 * faisait paraître arrondis à la volée. Les paliers d'abrégement gardent leur
 * précision d'origine — à mille pour cent, la deuxième décimale ne dit rien.
 */
function fmtPct(pct: number): string {
  const signe = pct >= 0 ? "+" : "";
  const abs = Math.abs(pct);
  if (abs >= 10000) return `${signe}${(pct / 1000).toFixed(0)}k%`;
  if (abs >= 1000) return `${signe}${pct.toFixed(0)}%`;
  return `${signe}${pct.toFixed(2)}%`;
}

/** Fenêtres en secondes, pour découper la série Max période par période. */
const PERIOD_SECS: Record<Period, number | null> = {
  "24h": 86400, "1S": 604800, "1M": 2592000, "3M": 7862400,
  "6M": 15811200, "1A": 31536000, "3A": 94608000, "Max": null,
};

export default function PerformanceChart({
  assets, totalValue, period, onPeriodChange, color = "var(--nv-accent)", height,
  portfolioId, surTransactions = false, operations = [], onOperationClick, onSurvol,
}: {
  assets: { ticker: string; weight: number }[];
  totalValue: number | null;
  period: Period;
  onPeriodChange: (p: Period) => void;
  color?: string;
  height?: number;
  /**
   * Portefeuille dont on trace la trajectoire réelle. Sans lui, la courbe
   * simule un achat-conservation aux pondérations courantes.
   */
  portfolioId?: string;
  /**
   * Vrai quand les positions viennent des transactions. La courbe part alors
   * de la première opération, au lieu de remonter à la création du plus ancien
   * fonds — un PEA ouvert en février affichait sinon « +371 % sur tout
   * l'historique ».
   */
  surTransactions?: boolean;
  /**
   * Opérations à jalonner sur la courbe. Une pastille par écriture, à sa date,
   * de la couleur de son type — un versement ne se lit pas sur la courbe seule,
   * qui monte aussi bien parce qu'on a versé que parce que le marché a monté.
   */
  operations?: {
    id: number; ticker: string; executed_at: string; type: string;
    couleur: string; libelle: string;
    /**
     * Quantité, prix unitaire et frais — facultatifs, et lus seulement par
     * l'encart de survol. Une pastille se dessine sans eux ; le détail affiché
     * en haut à gauche s'adapte à ce qui est fourni plutôt que d'inventer un
     * montant.
     */
    quantity?: number; unit_price?: number; fees?: number;
  }[];
  /** Appelé au clic sur un repère, avec l'identifiant de l'écriture. */
  onOperationClick?: (id: number) => void;
  /**
   * Le point sous le curseur, ou `null` quand il quitte le tracé.
   *
   * `valeur` est déjà à l'échelle du total affiché : l'appelant peut la
   * substituer telle quelle à son propre chiffre. `investi` est le capital
   * engagé à cette date quand la route le donne, ce qui permet de recalculer un
   * gain à l'instant survolé plutôt que d'afficher celui d'aujourd'hui sous une
   * date d'hier.
   */
  onSurvol?: (p: { valeur: number; date: string; investi?: number } | null) => void;
}) {
  // Le thème se lit à la source plutôt que de descendre en props : le
  // graphique est utilisé par la vue générale et par l'onglet Transactions, et
  // les deux n'avaient aucune raison de le lui rappeler.
  const clair = useModeTheme() === "clair";
  const boxRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const serieRef = useRef<ISeriesApi<"Area"> | null>(null);
  const bougieRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  /** L'axe des prix est-il affiché ? Voir l'effet d'alimentation. */
  const axeVisibleRef = useRef(true);
  const colorRef = useRef(color);
  const clairRef = useRef(clair);

  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("loading");
  const [survol, setSurvol] = useState<{ valeur: number; date: string } | null>(null);

  /**
   * Le survol remonté à l'appelant, et le capital engagé qui va avec.
   *
   * ⚠️ Passe par une référence et non par les dépendances d'un effet : le
   * réticule bouge à chaque pixel, et refaire un abonnement à chaque mouvement
   * coûterait bien plus que l'effet ne vaut. Même raison que `trackSpecular`
   * dans `tileStyle`.
   *
   * `survol` existait déjà et n'était affiché nulle part : il déclenchait un
   * rendu du composant à chaque mouvement de souris pour rien. Il sert enfin.
   */
  const surSurvolRef = useRef(onSurvol);
  surSurvolRef.current = onSurvol;
  const investiParDateRef = useRef<Map<string, number>>(new Map());
  /**
   * Le dernier point remonté, pour ne pas le remonter deux fois.
   *
   * Le réticule bouge au pixel, la courbe a des points tous les quelques pixels :
   * sans ce garde, un balayage du graphique déclencherait cent rendus de la page
   * appelante — qui en compte mille quatre cents lignes — pour cinquante valeurs
   * distinctes.
   */
  const dernierSurvolRef = useRef<string | null>(null);
  /**
   * Courbe ou bougies, dans une piste à deux pastilles.
   *
   * ⚠️ Un troisième mode a existé, qui superposait la courbe du capital engagé,
   * puis remplissait l'aire entre les deux en vert ou en rouge. Retiré : ce que
   * cette aire montrait est déjà écrit deux fois — le capital et le gain sont
   * dans la bande de tête, et le survol les donne à n'importe quelle date — et
   * elle le payait en lisibilité du tracé. Le capital forçait l'échelle à couvrir
   * l'écart entre les deux courbes, ce qui écrasait la seule chose que le
   * graphique sache faire seul : l'allure de la valeur. Mesuré, l'amplitude
   * tombait de 140 à 126 px sur un mois et de 140 à 11 px sur vingt-quatre
   * heures — au point qu'il fallait griser la bascule sous un mois. Et l'aire
   * elle-même ne faisait que 2,5 px de haut en médiane sur trois mois, pour la
   * même raison d'échelle. Ne pas le rétablir sans traiter cette cause.
   */
  const [mode, setMode] = useState<"ligne" | "bougie">("ligne");


  /**
   * Réglages d'apparence, retenus d'une visite à l'autre.
   *
   * `null` pour la courbe signifie « la couleur du portefeuille », et non une
   * absence de choix : c'est ce qui permet au bouton de réinitialisation de
   * rendre la main au portefeuille plutôt que de figer sa teinte du jour.
   */
  /**
   * Les stickers posés à la main, et celui qui attend d'être posé.
   *
   * `stickerArme` est le glyphe choisi mais pas encore placé. Il vit à part de la
   * liste : tant qu'il n'a pas de point d'ancrage, il n'est pas un sticker mais
   * une intention.
   */
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [stickerArme, setStickerArme] = useState<string | null>(null);
  const [stickersOuverts, setStickersOuverts] = useState(false);
  const [ancreStickers, setAncreStickers] = useState<{ droite: number; haut: number } | null>(null);
  /** Les stickers projetés à l'écran, recalculés comme les pastilles. */
  const [stickersPlaces, setStickersPlaces] =
    useState<{ id: string; glyphe: string; x: number; y: number; taille: number; titre: string }[]>([]);

  const cleSt = cleStickers(portfolioId);
  useEffect(() => { setStickers(lireStickers(cleSt)); }, [cleSt]);

  /**
   * Le glyphe armé et le facteur d'échelle, lus par l'abonnement au clic.
   *
   * ⚠️ Cet abonnement est pris **une seule fois**, à la création du graphique, et
   * sa fermeture figerait donc les valeurs de ce premier rendu. Le passer par des
   * références est ce qui lui donne accès à l'état courant sans réabonner à
   * chaque frappe — se réabonner obligerait à recréer le graphique, ce qui
   * emporterait le cadrage avec lui.
   */
  const stickerArmeRef = useRef<string | null>(null);
  stickerArmeRef.current = stickerArme;

  /**
   * Le geste en cours : traîner un glyphe du panneau, déplacer un sticker posé,
   * ou tirer sa poignée.
   *
   * ⚠️ Dans une référence et non dans l'état. Les écouteurs de la fenêtre sont
   * posés **une fois** au montage et consultent cette référence ; les faire
   * dépendre de l'état les aurait fait retirer et remettre à chaque pixel
   * parcouru, soit une centaine de fois par déplacement.
   *
   * `bouge` distingue le clic du glissement : sous le seuil, le geste est un clic
   * — qui sélectionne un sticker posé, ou arme un glyphe du panneau — au-delà,
   * c'est un déplacement. Sans ce seuil, le moindre frémissement de la main
   * transformait chaque clic en micro-déplacement.
   */
  const gesteRef = useRef<
    | { type: "panneau"; glyphe: string; x0: number; y0: number; bouge: boolean }
    | { type: "deplace"; id: string; x0: number; y0: number; bouge: boolean }
    | { type: "etire"; id: string; x0: number; y0: number; base: number }
    | null
  >(null);
  /** Le glyphe qui suit le curseur pendant qu'on le traîne depuis le panneau. */
  const [fantome, setFantome] = useState<{ glyphe: string; x: number; y: number } | null>(null);
  /** Décalage transitoire d'un sticker qu'on déplace, avant de l'ancrer à nouveau. */
  const [deplace, setDeplace] = useState<{ id: string; dx: number; dy: number } | null>(null);
  /** Taille transitoire pendant l'étirement. */
  const [etire, setEtire] = useState<{ id: string; taille: number } | null>(null);
  /** Le sticker sélectionné, qui montre son cadre, sa poignée et sa croix. */
  const [selection, setSelection] = useState<string | null>(null);

  /**
   * Les horodatages de la série affichée, croissants.
   *
   * Ils servent dans les deux sens : convertir un point de l'écran en date
   * fractionnaire au moment de poser, et refaire le chemin inverse à chaque
   * projection. Voir `logiqueVersTemps`.
   */
  const tempsSerieRef = useRef<number[]>([]);

  const stickersRef = useRef<Sticker[]>(stickers);
  stickersRef.current = stickers;

  /** Range la liste et la persiste d'un même geste. */
  const majStickers = (suite: Sticker[]) => {
    setStickers(suite);
    ecrireStickers(cleStRef.current, suite);
  };
  const majRef = useRef(majStickers);
  majRef.current = majStickers;

  /**
   * Un point de l'écran vers l'ancrage (horodatage, valeur brute).
   *
   * Rend `null` hors du cadre : une dépose à côté du graphique ne pose rien
   * plutôt que de coller le sticker au bord. En revanche une dépose **dans** le
   * cadre mais au-delà de la dernière donnée est ramenée à la borne la plus
   * proche — le curseur y est encore sur le graphique, refuser serait incompris.
   */
  const ancrageDepuisEcran = (clientX: number, clientY: number) => {
    const el = plotRef.current, chart = chartRef.current, serie = serieRef.current;
    if (!el || !chart || !serie) return null;
    const r = el.getBoundingClientRect();
    const x = clientX - r.left, y = clientY - r.top;
    if (x < 0 || y < 0 || x > r.width || y > r.height) return null;
    // ⚠️ Par l'indice logique, et non par `coordinateToTime`.
    //
    // Cette dernière rend l'horodatage de la barre la plus proche : le sticker
    // sautait donc au point de mesure voisin, visiblement à côté de l'endroit
    // lâché. L'indice logique est fractionnaire, ce qui donne une date entre deux
    // barres — voir `logiqueVersTemps`.
    const ts = chart.timeScale();
    const entier = ts.coordinateToLogical(x);
    if (entier == null) return null;
    // ⚠️ L'indice rendu est **entier** : il faut l'affiner nous-mêmes, sinon le
    // sticker se pose au centre de la barre la plus proche. Voir `logiqueFine`.
    const fin = logiqueFine(x, entier as number, l => ts.logicalToCoordinate(l as Logical));
    if (fin == null) return null;
    const t = logiqueVersTemps(fin, tempsSerieRef.current);
    if (t == null) return null;
    const prix = serie.coordinateToPrice(y);
    if (prix == null) return null;
    return { temps: t, valeur: (prix as number) / (echelleStickerRef.current || 1) };
  };
  const ancrageRef = useRef(ancrageDepuisEcran);
  ancrageRef.current = ancrageDepuisEcran;

  /** Seuil au-delà duquel un appui devient un glissement, en pixels. */
  const SEUIL_GLISSEMENT = 4;

  useEffect(() => {
    const surBouge = (e: PointerEvent) => {
      const g = gesteRef.current;
      if (!g) return;
      const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
      if (g.type === "etire") {
        setEtire({ id: g.id, taille: tailleEtiree(g.base, dx, dy) });
        return;
      }
      if (!g.bouge && Math.abs(dx) + Math.abs(dy) < SEUIL_GLISSEMENT) return;
      g.bouge = true;
      if (g.type === "panneau") setFantome({ glyphe: g.glyphe, x: e.clientX, y: e.clientY });
      else setDeplace({ id: g.id, dx, dy });
    };

    const surRelache = (e: PointerEvent) => {
      const g = gesteRef.current;
      gesteRef.current = null;
      setFantome(null);
      setDeplace(null);
      setEtire(null);
      if (!g) return;

      if (g.type === "etire") {
        const taille = tailleEtiree(g.base, e.clientX - g.x0, e.clientY - g.y0);
        majRef.current(stickersRef.current.map(k => (k.id === g.id ? { ...k, taille } : k)));
        return;
      }

      // En deçà du seuil, le geste est un clic.
      if (!g.bouge) {
        if (g.type === "panneau") setStickerArme(a => (a === g.glyphe ? null : g.glyphe));
        else setSelection(s => (s === g.id ? null : g.id));
        return;
      }

      const ancre = ancrageRef.current(e.clientX, e.clientY);
      if (g.type === "panneau") {
        // Déposé hors du cadre : on abandonne, sans poser ni armer.
        if (!ancre) return;
        majRef.current(stickersRef.current.concat([{
          id: idSticker(), glyphe: g.glyphe, taille: TAILLE_DEFAUT, ...ancre,
        }]));
        setStickerArme(null);
      } else {
        // Un sticker traîné hors du cadre reste où il était : le perdre pour un
        // geste trop ample serait sévère, et rien ne le signalerait.
        if (!ancre) return;
        majRef.current(stickersRef.current.map(k => (k.id === g.id ? { ...k, ...ancre } : k)));
      }
    };

    window.addEventListener("pointermove", surBouge);
    window.addEventListener("pointerup", surRelache);
    window.addEventListener("pointercancel", surRelache);
    return () => {
      window.removeEventListener("pointermove", surBouge);
      window.removeEventListener("pointerup", surRelache);
      window.removeEventListener("pointercancel", surRelache);
    };
  }, []);
  const echelleStickerRef = useRef(1);
  const cleStRef = useRef(cleSt);
  cleStRef.current = cleSt;

  const [reglagesOuverts, setReglagesOuverts] = useState(false);
  const [ancreReglages, setAncreReglages] = useState<{ droite: number; haut: number } | null>(null);
  const [couleurChoisie, setCouleurChoisie] = useState<string | null>(null);
  const [grille, setGrille] = useState<StyleGrille>("standard");
  const [grilleOuverte, setGrilleOuverte] = useState(false);
  const [ancreGrille, setAncreGrille] = useState<{ droite: number; haut: number } | null>(null);

  // Les deux préférences ne partagent pas leur rangement : le style de grille
  // est commun à tous les graphiques — c'est la clé de la page d'un actif —
  // alors que la couleur de courbe n'a de sens que sur un portefeuille.
  useEffect(() => {
    setGrille(lireStyleGrille());
    try {
      const c = localStorage.getItem(CLE_COULEUR);
      if (c) setCouleurChoisie(c === "null" ? null : c);
    } catch { /* préférence illisible : on garde la couleur du portefeuille. */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(CLE_COULEUR, couleurChoisie ?? "null"); } catch { /* sans effet */ }
  }, [couleurChoisie]);
  /** Date de la première transaction, quand la courbe en vient. */
  const [origine, setOrigine] = useState<string | null>(null);
  /** Titres détenus dont le cours n'a pas pu être établi. */
  const [sansCours, setSansCours] = useState<string[]>([]);
  /** Position à l'écran de chaque repère d'opération, en pixels du cadre. */
  useEffect(() => {
    clairRef.current = clair;
    // Le graphique n'est créé qu'une fois : sans cette réapplication, la
    // grille et le réticule resteraient dans les couleurs du thème de départ,
    // et la densité choisie ne prendrait effet qu'au prochain montage.
    chartRef.current?.applyOptions(habillage(clair, grille));
  }, [clair, grille]);

  const [pastilles, setPastilles] = useState<
    { id: number; titre: string; nombre: number; type: string; jour: string }[]>([]);
  /**
   * Le groupe d'écritures dont la pastille est **sous la souris**.
   *
   * ⚠️ Et non le jour sous le réticule, qui était la première version et se
   * comportait exactement à l'envers de ce qu'on attend. La pastille capte le
   * pointeur — il faut bien pouvoir la cliquer — donc lightweight-charts ne
   * reçoit plus le mouvement et éteint son réticule dès que la souris arrive
   * dessus. L'encart s'affichait ainsi en survolant la journée à côté de la
   * bulle, et disparaissait au moment précis où l'on pointait la bulle.
   *
   * Le jour suffit : il n'y a plus qu'une pastille par journée. Le type en avait
   * fait partie, du temps où une journée mixte en portait deux — superposées au
   * pixel, donc l'une invisible. Voir le regroupement.
   */
  const [jourSurvole, setJourSurvole] = useState<string | null>(null);

  /**
   * L'ordonnée d'un point : sa valeur réelle, ramenée à l'échelle du total.
   *
   * ⚠️ **Une seule fonction, et c'est le point.** Ce calcul vivait en deux
   * exemplaires — le tracé et le placement des pastilles d'opération. Une
   * version qui traçait la valeur nette des versements n'a corrigé que le
   * premier : les pastilles se sont placées d'après une valeur qui n'était plus
   * sur la courbe, donc hors du cadre, donc écartées. Elles avaient purement
   * disparu du graphique.
   *
   * ⚠️ Cette version nette a été essayée puis retirée. Elle réglait bien le
   * changement d'allure au zoom — saut maximal ramené de 1 026 € à 53 € — mais
   * au prix de la seule chose qu'on vient lire ici : ce que le portefeuille
   * valait à une date. Elle affichait 3 236 € au 6 février, jour où il en valait
   * 29. C'est l'échelle qu'il fallait figer, pas les données qu'il fallait
   * changer.
   */
  /**
   * Le facteur qui ramène la série au total affiché dans la bande de tête.
   *
   * Partagé parce qu'il a deux consommateurs qui doivent rester d'accord :
   * `ordonnee`, qui place la courbe, et les stickers, qui sont ancrés à une
   * valeur brute et remis à l'échelle au moment d'être placés. S'ils divergeaient,
   * un sticker glisserait par rapport au point de la courbe où il a été posé.
   */
  const echelle = useMemo(() => {
    if (!points.length) return 1;
    const dernier = points[points.length - 1].value || 1;
    return (totalValue ?? 0) > 0 ? totalValue! / dernier : 1;
  }, [points, totalValue]);

  const ordonnee = useMemo(() => {
    if (!points.length) return null;
    return (p: HistoryPoint) => p.value * echelle;
  }, [points, echelle]);
  echelleStickerRef.current = echelle;

  /**
   * Les bornes verticales, calculées sur **toute** la série.
   *
   * C'est ce que lit `autoscaleInfoProvider`, et c'est ce qui empêche l'allure de
   * la courbe de changer au zoom. Par défaut lightweight-charts recalcule
   * l'échelle sur ce qui est visible : la valeur d'un portefeuille contenant les
   * versements, elle va ici de 29 € à 3 454 € avec un mur de 1 026 € au
   * renforcement du 9 juin. Vue en entier, le marché s'aplatissait ; glissée d'un
   * centimètre, l'échelle se resserrait sur les dizaines d'euros et le même
   * marché devenait de grandes vagues. Une seule échelle pour toute la série, et
   * zoomer ne fait plus que se déplacer dans un dessin qui ne bouge pas.
   */
  /**
   * La série telle qu'elle est posée sur le graphique.
   *
   * Hissée hors de l'effet d'alimentation parce qu'elle a deux lecteurs : cet
   * effet, et la projection des stickers, qui a besoin des horodatages pour
   * convertir une date intercalaire en indice logique. Recopier le filtrage aux
   * deux endroits aurait donné deux séries destinées à diverger — et l'écart se
   * serait vu comme un sticker décalé d'une barre.
   *
   * Elle est aussi calculée pendant le rendu, donc disponible pour **tous** les
   * effets. Rangée dans une référence depuis l'effet d'alimentation, elle
   * arrivait après l'effet de positionnement, qui s'exécute avant lui : les
   * stickers manquaient jusqu'au recalcul suivant.
   */
  const data = useMemo(() => {
    if (!points.length || !ordonnee) return [];
    return points
      .map(p => ({
        time: Math.floor(new Date(p.date).getTime() / 1000) as UTCTimestamp,
        value: ordonnee(p),
      }))
      .filter(d => isFinite(d.time) && isFinite(d.value))
      // lightweight-charts exige un temps strictement croissant : deux points
      // au même horodatage font lever la série entière.
      .filter((d, i, arr) => i === 0 || d.time > arr[i - 1].time);
  }, [points, ordonnee]);

  const tempsSerie = useMemo(() => data.map(d => d.time as number), [data]);
  tempsSerieRef.current = tempsSerie;

  const bornes = useMemo(() => {
    if (!points.length || !ordonnee) return null;
    const vals = points.map(ordonnee);
    const bas = Math.min(...vals), haut = Math.max(...vals);
    // Un vingtième de marge, pour que la courbe ne touche ni le haut ni le bas.
    const marge = (haut - bas) * 0.05 || Math.abs(haut) * 0.01 || 1;
    return { min: bas - marge, max: haut + marge };
  }, [points, ordonnee]);
  const bornesRef = useRef<{ min: number; max: number } | null>(null);
  bornesRef.current = bornes;

  /** La série déjà cadrée, en « période|mode ». Voir `cadrer`. */
  const cadreRef = useRef<string | null>(null);

  /**
   * Vrai quand le cadrage de la série affichée est confirmé.
   *
   * ⚠️ Tant qu'il est faux, **rien n'est peint** : ni les courbes, ni les repères
   * d'opération, ni ceux d'extrême. C'est ce qui supprime le clignotement d'une
   * courbe mal cadrée au changement de période.
   *
   * Le cadrage ne peut pas être garanti à la première peinture : appliqué de
   * façon synchrone il est écrasé par la mise en page que la bibliothèque
   * enchaîne, et cela d'autant plus sûrement que la série est longue. Chronométré
   * sur la fenêtre d'un mois — 816 barres de quinze minutes — la courbe
   * apparaissait 34 ms à la mauvaise échelle de temps, avec son premier repère à
   * 287 px hors cadre, avant de sauter à la bonne. Deux trames, mais deux trames
   * qui se lisent comme une autre courbe qui clignote.
   *
   * Puisqu'on ne peut pas peindre juste du premier coup, on ne peint pas. Un cadre
   * vide pendant deux trames ne se remarque pas ; une courbe fausse, si.
   */
  const [cadrePret, setCadrePret] = useState(false);

  // ── Données ────────────────────────────────────────────────────────────────
  const key = assets.map(a => `${a.ticker}:${a.weight}`).join(",");

  /**
   * La fenêtre dont la série affichée provient, pour ne pas montrer l'une sous le
   * libellé de l'autre.
   *
   * ⚠️ Au changement de période, la série de la précédente restait à l'écran le
   * temps de la requête — deux secondes pour trois mois de barres intraday — mais
   * recadrée sur la nouvelle fenêtre et sous le nouveau bouton. On voyait donc
   * une courbe d'un mois annoncée comme trois mois, avec son propre axe, avant
   * qu'elle ne saute sur la bonne.
   *
   * On la vide donc. Le voile « Chargement… » prend le relais, ce qui ne montre
   * rien de faux — et c'est bien ce qu'on veut plutôt qu'une donnée qui ne
   * correspond pas à ce qui est demandé.
   *
   * ⚠️ Uniquement sur la période, jamais sur `key`. Ce dernier contient les poids,
   * qui dérivent des cours sur un portefeuille suivi par transactions : le vider
   * là-dessus blanchirait le graphique toutes les dix secondes.
   *
   * ⚠️ **La période ne suffisait pas : le portefeuille compte autant.** Ce
   * composant n'est jamais remonté — la page ne lui donne pas de `key` — si bien
   * qu'en changeant de portefeuille sans changer de période, la série précédente
   * restait à l'écran, avec son axe, sous le nom et le total du nouveau. Un
   * portefeuille de crypto allant de 119 807 à 123 272 € laissait ainsi son axe
   * devant un PEA de 5 304 €.
   *
   * L'identité retenue est l'identifiant du portefeuille quand il y en a un, et
   * la liste des tickers sinon — **sans les poids**, pour la raison ci-dessus.
   * Deux portefeuilles de mêmes tickers à poids différents ne sont donc pas
   * distingués ici ; c'est le prix à payer pour ne pas blanchir le graphique à
   * chaque rafraîchissement des cours, et le cas ne se produit pas en mode suivi
   * par transactions, qui est celui des vrais portefeuilles.
   */
  const cleSerie = cleSource({
    periode: period, portfolioId, surTransactions,
    tickers: assets.map(a => a.ticker),
  });
  const sourceAfficheeRef = useRef(cleSerie);
  useEffect(() => {
    if (sourceAfficheeRef.current === cleSerie) return;
    sourceAfficheeRef.current = cleSerie;
    setPoints([]);
  }, [cleSerie]);

  useEffect(() => {
    if (!assets.length) { setPoints([]); setState("idle"); return; }
    let cancelled = false;
    setState("loading");
    const tickers = assets.map(a => a.ticker).join(",");
    const weights = assets.map(a => a.weight).join(",");
    const url = surTransactions && portfolioId
      ? `${API}/api/v1/portfolios/${portfolioId}/history?period=${PERIOD_API[period]}`
      : `${API}/api/v1/portfolio-history?tickers=${encodeURIComponent(tickers)}&weights=${encodeURIComponent(weights)}&period=${PERIOD_API[period]}`;
    fetch(url, { headers: enTetesAuth() })
      .then(r => r.json())
      .then((d: { points?: HistoryPoint[]; start?: string | null; sans_cours?: string[] }) => {
        if (cancelled) return;
        const pts = Array.isArray(d.points) ? d.points : [];
        setPoints(pts);
        if (d.start) setOrigine(d.start);
        // Le serveur refuse de tracer plutôt que d'omettre un titre dont le
        // cours manque : il vaudrait alors zéro dans la somme, et la courbe
        // montrerait une perte inexistante. On dit lequel.
        setSansCours(Array.isArray(d.sans_cours) ? d.sans_cours : []);
        setState(pts.length ? "idle" : "error");
      })
      .catch(() => { if (!cancelled) { setPoints([]); setState("error"); } });
    return () => { cancelled = true; };
  }, [key, period, portfolioId, surTransactions]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Rendements par période ─────────────────────────────────────────────────
  //
  // Un appel par période, et non une seule série Max qu'on découperait.
  //
  // La tentation était forte — un appel au lieu de huit — mais les deux ne
  // décrivent pas le même portefeuille. La série renvoyée pour une fenêtre
  // applique les pondérations courantes *au début de cette fenêtre* ; découper
  // la série Max donne, elle, ce qu'un achat-conservation de 2020 vaut
  // aujourd'hui, poids dérivés compris. Mesuré sur douze lignes : +10,2 % sur
  // un an par appel direct, -25,3 % par découpe de Max. Signes opposés.
  //
  // Et c'est bien le premier qu'il faut afficher, puisque c'est la série que
  // la courbe trace au-dessus du chiffre.
  const [rendements, setRendements] = useState<Record<Period, number | null>>(
    () => Object.fromEntries(PERIODES.map(p => [p, null])) as Record<Period, number | null>);

  useEffect(() => {
    if (!assets.length) return;
    let cancelled = false;
    const tickers = encodeURIComponent(assets.map(a => a.ticker).join(","));
    const weights = encodeURIComponent(assets.map(a => a.weight).join(","));
    Promise.all(PERIODES.map(p => {
      const u = surTransactions && portfolioId
        ? `${API}/api/v1/portfolios/${portfolioId}/history?period=${PERIOD_API[p]}`
        : `${API}/api/v1/portfolio-history?tickers=${tickers}&weights=${weights}&period=${PERIOD_API[p]}`;
      return fetch(u, { headers: enTetesAuth() })
        .then(r => r.json())
        /**
         * Sur transactions, le gain rapporté au capital engagé — la même mesure
         * que « Gains / pertes » de la bande de tête, fenêtre par fenêtre.
         *
         * ⚠️ C'était le TWR, et c'est un changement de fond. Le TWR répond à
         * « comment mes fonds se sont-ils comportés », en donnant à chaque
         * journée le même poids quel que soit l'argent en jeu. Sur un
         * portefeuille qui grandit par versements, il se laisse dominer par les
         * périodes où presque rien n'était investi : mesuré ici en reconstruisant
         * la chaîne jour par jour, **79 % du +17,6 % de la fenêtre Max provenait
         * de journées où moins de 1 000 € étaient en jeu**, sur un capital final
         * de 3 257 €. Le premier achat pesait 29 €, et son mouvement de février
         * comptait autant que celui de 3 200 € en juillet.
         *
         * Le gain sur capital engagé n'a pas ce défaut, se vérifie de tête — ce
         * qu'on a mis, ce qu'on a — et se compare au repère S&P 500, qui est
         * mesuré sur cette base-là. Les deux chiffres de la bande ne peuvent
         * plus se contredire.
         *
         * Ce que ça coûte : ce n'est pas un *taux*. Il ignore le temps, donc
         * +191 € gagnés en six mois et les mêmes gagnés en un jour s'y lisent
         * pareil. Le taux existe et reste calculé sous le nom `taux_pct` —
         * Dietz modifié, 14,89 % ici contre 5,87 % — mais il se compare à un
         * repère qui n'est pas mesuré comme lui.
         */
        .then((d: { change?: number | null; gain_pct?: number | null }) => {
          const v = surTransactions ? d.gain_pct : d.change;
          return [p, typeof v === "number" ? v : null] as const;
        })
        .catch(() => [p, null] as const);
    })).then(paires => {
      if (!cancelled) setRendements(Object.fromEntries(paires) as Record<Period, number | null>);
    });
    return () => { cancelled = true; };
  }, [key, portfolioId, surTransactions]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Le meilleur et le pire moment de la fenêtre, au sens du gain.
   *
   * `(valeur − investi) / investi` : le rendement de l'argent réellement mis,
   * c'est-à-dire ce qu'on entend quand on dit « mon investissement est à +9 % ».
   *
   * ⚠️ Cette mesure se dilue à chaque versement — de l'argent frais entre à 0 %
   * de gain et tire le rapport vers le bas. Le pire moment pourrait donc n'être
   * que le lendemain d'un virement. Vérifié sur un portefeuille réel avant de
   * poser ces repères : ses six versements ne tombent sur aucun des deux
   * extrêmes, le plus proche restant à quatre jours. La dilution est de toute
   * façon ce que l'épargnant vit — son pourcentage global baisse bel et bien
   * quand il verse — donc en marquer les extrêmes ne trompe personne.
   *
   * Rien en dessous de dix points, ni quand les deux tombent au même endroit :
   * sur une fenêtre de 24 h, « le meilleur moment » ne veut rien dire.
   */
  const extremes = useMemo(() => {
    const g = points
      .filter(p => typeof p.invested === "number" && (p.invested as number) > 0)
      .map(p => ({ p, pct: (p.value - (p.invested as number)) / (p.invested as number) * 100 }));
    if (g.length < 10) return null;
    let haut = g[0], bas = g[0];
    for (const x of g) {
      if (x.pct > haut.pct) haut = x;
      if (x.pct < bas.pct) bas = x;
    }
    return haut.p.date === bas.p.date ? null : { haut, bas };
  }, [points]);

  /**
   * Les jours de la série, dans l'ordre où elle est tracée.
   *
   * Partagé par le placement des pastilles et par l'encart de survol : les deux
   * doivent désigner exactement la même journée, sinon l'encart détaillerait une
   * écriture dont la pastille est ailleurs.
   */
  const joursSerie = useMemo(() => points.map(p => p.date.slice(0, 10)), [points]);

  /**
   * Les écritures rattachées à chaque jour **tracé**, et non à leur propre date.
   *
   * C'est `jourAncre` qui décide du rattachement, exactement comme pour les
   * pastilles : une écriture passée un samedi est portée par le lundi, et une
   * écriture hors de la fenêtre n'est portée par personne. Reprendre la date
   * brute ici aurait fait apparaître l'encart sur un jour sans pastille, et
   * manquer celui qui en porte une.
   */
  const opsParJour = useMemo(() => {
    const m = new Map<string, typeof operations>();
    for (const op of operations) {
      const jour = jourAncre(op.executed_at.slice(0, 10), joursSerie);
      if (!jour) continue;
      const liste = m.get(jour);
      if (liste) liste.push(op); else m.set(jour, [op]);
    }
    return m;
  }, [operations, joursSerie]);

  /**
   * Les nœuds des repères et leur dernière position connue.
   *
   * Deux registres par famille : le nœud, pour écrire dedans sans passer par
   * React, et la position, pour la réappliquer quand un nœud vient de naître —
   * il n'existait pas encore au moment du calcul.
   */
  const noeudsPastille = useRef(new Map<number, HTMLElement>());
  const coordsPastille = useRef(new Map<number, Coord>());
  const noeudsRepere = useRef(new Map<string, HTMLElement>());
  const coordsRepere = useRef(new Map<string, Coord>());

  /** Retient une position et l'applique aussitôt si le nœud est déjà là. */
  function placer<K>(
    noeuds: React.RefObject<Map<K, HTMLElement>>,
    coords: React.RefObject<Map<K, Coord>>,
    cle: K, c: Coord,
  ): void {
    coords.current.set(cle, c);
    const n = noeuds.current.get(cle);
    if (n) ancrer(n, c);
  }

  /**
   * Le rappel de référence d'un repère : il s'inscrit, et se pose.
   *
   * ⚠️ La pose au montage est indispensable. Le calcul a lieu avant que React
   * n'ait créé le nœud : sans elle, une pastille apparaissait au coin haut gauche
   * du cadre et n'en bougeait qu'au prochain déplacement de la vue.
   */
  function inscrire<K>(
    noeuds: React.RefObject<Map<K, HTMLElement>>,
    coords: React.RefObject<Map<K, Coord>>,
    cle: K,
  ) {
    return (n: HTMLElement | null) => {
      if (!n) { noeuds.current.delete(cle); return; }
      noeuds.current.set(cle, n);
      ancrer(n, coords.current.get(cle) ?? null);
    };
  }

  const [reperes, setReperes] = useState<{ sens: "haut" | "bas"; titre: string }[]>([]);

  /**
   * Place les pastilles d'opération et les repères d'extrême au-dessus de la
   * courbe.
   *
   * Recalculé à chaque déplacement ou redimensionnement : les coordonnées sont
   * des pixels, elles ne survivent pas à un changement de fenêtre. Une
   * opération hors de la plage visible n'a pas de coordonnée — elle disparaît,
   * ce qui est juste.
   *
   * ⚠️ Le garde ne porte plus sur `operations` : les repères d'extrême doivent
   * paraître même sur un portefeuille sans écriture jalonnée.
   */
  useEffect(() => {
    const chart = chartRef.current, serie = serieRef.current, el = plotRef.current;
    if (!chart || !serie || !el || !points.length || !ordonnee || !cadrePret) { setPastilles([]); setReperes([]); return; }

    // L'ancre de chaque jour — horodatage réel et ordonnée — et la liste des
    // jours tracés. Voir `lib/chart/reperes`, où les deux règles sont testées :
    // les repères d'extrême prenaient déjà l'horodatage du point, c'est pourquoi
    // eux seuls survivaient aux fenêtres tracées en barres intraday.
    //
    // L'ordonnée est celle de la courbe, et non un second calcul : voir `ordonnee`.
    const ancreAu = ancresParJour(points, ordonnee);
    const jours = joursSerie;

    const calculer = () => {
      /**
       * Regroupement **par jour**, et par jour seulement.
       *
       * Quatre renforcements le même jour partagent date et valeur : leurs
       * pastilles se posaient exactement l'une sur l'autre, indiscernables d'une
       * seule mais quatre fois plus opaques. D'où un regroupement.
       *
       * ⚠️ Le type en faisait partie, et c'était un défaut qui cachait des
       * écritures. Une journée peut porter plusieurs natures d'acte : relevé sur
       * un vrai PEA, le 19 février 2026 compte deux achats — PAEJ.PA et ETZ.PA,
       * premières lignes — et deux renforcements d'ESE.PA. Cela faisait deux
       * groupes, donc deux pastilles, **ancrées au même jour donc aux mêmes
       * coordonnées au pixel**. L'une recouvrait l'autre exactement : les deux
       * achats étaient invisibles sur le tracé, et le survol de la bulle visible
       * n'en détaillait pas un seul.
       *
       * Une seule pastille par jour, donc, et le détail dit tout ce qu'elle
       * couvre — chaque ligne y porte déjà sa propre vignette, à sa couleur et à
       * son glyphe.
       */
      const groupes = new Map<string, { ops: typeof operations; jour: string }>();
      for (const op of operations) {
        const jour = op.executed_at.slice(0, 10);
        // Hors du cadre — antérieure ou postérieure à la fenêtre — l'écriture est
        // écartée plutôt que rapprochée du bord : voir `jourAncre`.
        const cible = jourAncre(jour, jours);
        if (!cible) continue;
        const g = groupes.get(cible);
        if (g) g.ops.push(op);
        else groupes.set(cible, { jour: cible, ops: [op] });
      }

      // `jour` accompagne le groupe : c'est lui qui permet à l'encart de retrouver
      // les écritures que cette pastille porte, sans redécouper les groupes.
      const out: { id: number; titre: string; nombre: number; type: string; jour: string }[] = [];
      for (const g of Array.from(groupes.values())) {
        const ancre = ancreAu.get(g.jour);
        const x = ancre == null ? null
          : chart.timeScale().timeToCoordinate(ancre.temps as UTCTimestamp);
        const y = ancre == null ? null : serie.priceToCoordinate(ancre.valeur);
        const tete = g.ops.reduce(dominante);
        const quand = new Date(tete.executed_at).toLocaleDateString("fr-FR");
        const tickers = Array.from(new Set(g.ops.map(o => o.ticker)));
        // Coordonnées entières.
        //
        // La bibliothèque rend des positions fractionnaires — 462,443 px. Le
        // contour de 2 px et le pictogramme se répartissaient alors sur deux
        // rangées de pixels : le cerne paraissait plus épais d'un côté et le
        // signe décentré, alors qu'il est géométriquement au milieu.
        placer(noeudsPastille, coordsPastille, tete.id,
               x == null || y == null ? null : { x: Math.round(x), y: Math.round(y) });
        // ⚠️ Une pastille hors cadre reste dans la liste, seulement masquée.
        // L'en retirer aurait fait varier la liste à chaque déplacement de la
        // vue, donc réveillé React — précisément ce que ce découplage évite.
        out.push({
          id: tete.id, nombre: g.ops.length, type: tete.type, jour: g.jour,
          titre: g.ops.length === 1
            ? `${tete.libelle} ${tete.ticker} — ${quand}`
            // Plus d'une écriture : on ne nomme plus un type, puisque la journée
            // peut en porter plusieurs. « 4 opérations » est vrai dans tous les
            // cas, là où « 4 renforcements » aurait été faux les jours mixtes.
            : `${g.ops.length} opérations (${tickers.join(", ")}) — ${quand}`,
        });
      }
      // Rien n'a changé dans la *composition* de la liste — les positions, elles,
      // viennent d'être écrites dans le DOM : on ne réveille pas React pour rien.
      setPastilles(p => (memeListe(p, out, cléPastille) ? p : out));

      // Les deux repères d'extrême, placés par la même mécanique.
      //
      // ⚠️ La liste vide passe par la forme fonctionnelle. Rendre un `[]` neuf à
      // chaque appel aurait suffi à faire rendre React à chaque cran de molette,
      // puisque la référence change — exactement ce que ce chemin cherche à
      // éviter, et d'autant plus vicieux que le contenu, lui, est identique.
      if (!extremes) { setReperes(p => (p.length ? [] : p)); return; }
      const rep: { sens: "haut" | "bas"; titre: string }[] = [];
      for (const [sens, e] of [["haut", extremes.haut], ["bas", extremes.bas]] as const) {
        const t = Math.floor(new Date(e.p.date).getTime() / 1000) as UTCTimestamp;
        const x = chart.timeScale().timeToCoordinate(t);
        const y = serie.priceToCoordinate(ordonnee(e.p));
        const quand = new Date(e.p.date).toLocaleDateString("fr-FR");
        placer(noeudsRepere, coordsRepere, sens,
               x == null || y == null ? null : { x: Math.round(x), y: Math.round(y) });
        rep.push({
          sens,
          titre: `${sens === "haut" ? "Meilleur" : "Pire"} moment de la période — `
               + `${e.pct >= 0 ? "+" : ""}${e.pct.toFixed(2)} % le ${quand}`,
        });
      }
      setReperes(p => (memeListe(p, rep, cléRepere) ? p : rep));

    };

    /**
     * Les stickers, projetés par la même mécanique mais **pas au même rythme**.
     *
     * ⚠️ Ils restent portés par l'état React, coordonnées comprises, parce que
     * leur position se compose avec le décalage transitoire du glissement — un
     * ancrage impératif devrait s'accorder avec un geste en cours, et cela touche
     * à la logique de déplacement plutôt qu'à celle de placement.
     *
     * Ils gardent donc le report d'une trame, et son motif d'origine : la molette
     * émet plusieurs fois par trame, et chaque émission qui déplace un sticker
     * relance un rendu complet — 7,4 ms l'unité en développement.
     *
     * Le prix est connu : pendant un glissement rapide, un sticker posé à côté
     * d'une pastille traîne d'une trame sur elle. Les pastilles, elles, sont
     * ancrées au pixel du tracé, et c'est ce qui était demandé. Sur un
     * portefeuille sans sticker — le cas courant — la liste reste vide et le
     * report ne coûte rien.
     */
    const calculerStickers = () => {
      const chart = chartRef.current, serie = serieRef.current;
      if (!chart || !serie || !points.length || !ordonnee || !cadrePret) { setStickersPlaces([]); return; }
      const st: { id: string; glyphe: string; x: number; y: number; taille: number; titre: string }[] = [];
      for (const k of stickers) {
        // Par l'indice logique là aussi : `timeToCoordinate` ne connaît que les
        // horodatages existants et ne rendrait rien pour une date intercalaire.
        const logique = tempsVersLogique(k.temps, tempsSerieRef.current);
        // `logicalToCoordinate` rend zéro sur un indice fractionnaire : on
        // interpole entre les deux ancres entières qui l'encadrent.
        const x = logique == null ? null
          : coordonneeFine(logique, l => chart.timeScale().logicalToCoordinate(l as Logical));
        const y = serie.priceToCoordinate(k.valeur * echelle);
        // Hors de la fenêtre — autre période, ou vue déplacée — le sticker n'a pas
        // de coordonnée : il est simplement omis, et revient quand la date rentre
        // dans le cadre. Il n'est pas supprimé pour autant.
        if (x == null || y == null) continue;
        st.push({
          id: k.id, glyphe: k.glyphe, taille: k.taille,
          x: Math.round(x), y: Math.round(y),
          titre: `${k.glyphe} le ${new Date(k.temps * 1000).toLocaleDateString("fr-FR")}`
               + " — glisser pour déplacer, cliquer pour sélectionner",
        });
      }
      setStickersPlaces(p => (memeListe(p, st, cléStickerPlace) ? p : st));
    };

    /**
     * Les pastilles dans la trame, les stickers à la suivante.
     *
     * ⚠️ **Le report était la cause du flottement des bulles**, et il réglait le
     * bon problème par le mauvais bout.
     *
     * Son motif, mesuré à l'époque : la molette émet le changement de plage
     * plusieurs fois par trame, et chaque émission relançait un rendu complet du
     * composant — 7,4 ms l'unité en développement, sur un budget de 16,7. Le
     * calcul, lui, ne coûtait rien : 0,08 ms.
     *
     * Mais la bibliothèque repeint sa toile dans la trame de l'événement.
     * Différer d'une trame garantissait donc que les pastilles arriveraient
     * toujours une trame en retard sur le tracé auquel elles sont censées être
     * clouées. À trois cents pixels par seconde de glissement, cela fait cinq
     * pixels d'écart — assez pour qu'on voie les bulles nager.
     *
     * Ce qui coûtait cher n'existe plus pour elles : leurs positions vont
     * directement dans le DOM, et l'état React ne porte que la composition de la
     * liste, qui ne bouge pas quand la vue se déplace. `memeListe` absorbe alors
     * les émissions surnuméraires sans qu'aucun rendu n'ait lieu. On calcule donc
     * tout de suite, et c'est ce qui les ancre.
     *
     * Les stickers, eux, gardent le report : voir `calculerStickers`.
     */
    let trame = 0;
    const surPlage = () => {
      calculer();
      if (trame) return;
      trame = requestAnimationFrame(() => { trame = 0; calculerStickers(); });
    };

    calculer();
    calculerStickers();
    const ts = chart.timeScale();
    ts.subscribeVisibleLogicalRangeChange(surPlage);
    // Le redimensionnement passe par le même chemin. Aucun risque de boucle :
    // `ancrer` n'écrit que `transform` et `visibility`, qui ne remettent rien en
    // page.
    const ro = new ResizeObserver(surPlage);
    ro.observe(el);
    return () => {
      ts.unsubscribeVisibleLogicalRangeChange(surPlage);
      if (trame) cancelAnimationFrame(trame);
      ro.disconnect();
    };
  }, [operations, points, joursSerie, totalValue, mode, ordonnee, extremes, cadrePret, stickers, echelle, tempsSerie]);

  // ── Création du graphique ──────────────────────────────────────────────────
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true,
      ...habillage(clairRef.current),
      // Échelle à droite, sans bordure et avec les mêmes marges que la page
      // graphique : c'est là que lightweight-charts pose la pastille de
      // dernière valeur.
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
      // Bords fixés : sans eux, la molette emmène la courbe dans le vide, des
      // mois de blanc à droite ou à gauche de données qui n'existent pas.
      // Compatible avec le cadrage en [0,5 ; n−1,5], qui reste à l'intérieur
      // de la plage réelle.
      timeScale: {
        borderVisible: false, timeVisible: false, secondsVisible: false,
        fixLeftEdge: true, fixRightEdge: true,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      /**
       * ⚠️ L'axe des prix ne se glisse **pas**, et ce n'est pas un choix de
       * confort : c'était un bug, et le plus tenace de ce graphique.
       *
       * Relevé dans le code de la bibliothèque (5.2.0, `PriceScale._scaleTo`) :
       * un glissement vertical sur l'axe pose `autoScale: false`. Or cet
       * indicateur ne se relève jamais tout seul. À partir de ce geste,
       * `autoscaleInfoProvider` — donc `bornes`, donc toute l'échelle verticale
       * de ce graphique — n'est **plus consulté du tout** : la plage reste figée
       * sur celle du moment du glissement, quel que soit le portefeuille ouvert
       * ensuite, quelle que soit la période choisie.
       *
       * C'est ce qui affichait un axe gradué de 118 000 à 124 000 € devant un
       * portefeuille de 5 304 € : la plage venait d'un portefeuille de crypto
       * allant de 119 807 à 123 272 €, consulté plus tôt dans la même session.
       *
       * Le geste était de toute façon en contradiction avec l'intention : voir
       * `bornes`, dont tout le propos est qu'une seule échelle vaille pour toute
       * la série, afin que zoomer ne change pas l'allure de la courbe. Une
       * échelle qu'on peut étirer à la souris n'est plus cette échelle-là.
       */
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: false } },
    });

    const serie = chart.addSeries(AreaSeries, {
      lineColor: colorRef.current,
      topColor: colorRef.current + "55",
      bottomColor: colorRef.current + "00",
      lineWidth: 2,
      lastValueVisible: true,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      priceFormat: { type: "price", precision: 0, minMove: 1 },
      // L'échelle verticale porte sur toute la série et non sur ce qui est
      // visible : voir `bornes`. Passée par une référence parce que le graphique
      // n'est créé qu'une fois, alors que les bornes changent à chaque période.
      autoscaleInfoProvider: () => {
        const b = bornesRef.current;
        return b ? { priceRange: { minValue: b.min, maxValue: b.max } } : null;
      },
    });

    // Série bougies, créée d'emblée et laissée vide : la basculer revient
    // ainsi à échanger des données, pas à détruire et recréer une série — ce
    // qui emporterait le cadrage avec elle.
    const bougies = chart.addSeries(CandlestickSeries, {
      // Le canevas ne résout pas var() : on lui passe la valeur calculée.
      upColor: resoudreJeton("--nv-positif", "#00D492"),
      downColor: resoudreJeton("--nv-negatif", "#FF6467"),
      borderUpColor: resoudreJeton("--nv-positif", "#00D492"),
      borderDownColor: resoudreJeton("--nv-negatif", "#FF6467"),
      wickUpColor: resoudreJeton("--nv-positif", "#00D492"),
      wickDownColor: resoudreJeton("--nv-negatif", "#FF6467"),
      lastValueVisible: true, priceLineVisible: false,
      priceFormat: { type: "price", precision: 0, minMove: 1 },
    });

    chartRef.current = chart;
    serieRef.current = serie;
    bougieRef.current = bougies;

    // Halo de survol : la portion de courbe sous le curseur est repeinte en
    // flou coloré puis d'un trait blanc fin, découpée à une fenêtre autour du
    // curseur et estompée sur ses bords. Repris de la page graphique.
    chart.subscribeCrosshairMove(param => {
      const cv = glowRef.current;
      const ctx = cv?.getContext("2d");
      if (!cv || !ctx) return;
      ctx.clearRect(0, 0, cv.width, cv.height);

      const data = (param.seriesData.get(serie) ?? param.seriesData.get(bougies)) as { value?: number; close?: number } | undefined;
      const val = data?.value ?? data?.close;
      if (!param.point || !param.time || val == null) {
        setSurvol(null);
        if (dernierSurvolRef.current !== null) {
          dernierSurvolRef.current = null;
          surSurvolRef.current?.(null);
        }
        return;
      }
      // `val` est la valeur *tracée*, donc déjà à l'échelle du total affiché :
      // l'appelant peut la mettre directement en face de son propre chiffre.
      const quand = new Date((param.time as number) * 1000).toISOString();
      setSurvol({ valeur: val, date: quand });
      if (dernierSurvolRef.current !== quand) {
        dernierSurvolRef.current = quand;
        surSurvolRef.current?.({
          valeur: val, date: quand,
          investi: investiParDateRef.current.get(quand.slice(0, 10)),
        });
      }

      const cx = param.point.x;
      // `data()` renvoie un tableau en lecture seule mêlant points et blancs :
      // on ne garde que ceux qui portent une valeur.
      const pts = (serie.data() as readonly { time: unknown; value?: number }[])
        .filter((p): p is { time: number; value: number } => typeof p.value === "number");
      if (pts.length < 2) return;

      const seg: [number, number][] = [];
      let gauche: [number, number] | null = null;
      let droitePosee = false;
      for (const p of pts) {
        const sx = chart.timeScale().timeToCoordinate(p.time as UTCTimestamp);
        const sy = serie.priceToCoordinate(p.value);
        if (sx == null || sy == null || !isFinite(sx) || !isFinite(sy)) continue;
        // Un point de part et d'autre de la fenêtre est conservé : sans eux le
        // halo commencerait et finirait dans le vide au lieu de suivre la
        // courbe jusqu'au bord de la découpe.
        if (sx < cx - HALO) gauche = [sx, sy];
        else if (sx <= cx + HALO) seg.push([sx, sy]);
        else if (!droitePosee) { seg.push([sx, sy]); droitePosee = true; }
      }
      if (gauche) seg.unshift(gauche);
      if (seg.length < 2) return;

      const trace = () => {
        ctx.beginPath();
        ctx.moveTo(seg[0][0], seg[0][1]);
        for (let i = 1; i < seg.length; i++) ctx.lineTo(seg[i][0], seg[i][1]);
      };

      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - HALO, 0, HALO * 2, cv.height);
      ctx.clip();

      ctx.save();
      ctx.filter = "blur(1.5px)";
      trace();
      ctx.strokeStyle = colorRef.current + "80";
      ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.stroke();
      ctx.restore();

      trace();
      ctx.strokeStyle = clairRef.current ? "rgba(15,23,42,0.75)" : "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.stroke();
      ctx.restore();

      // Estompage des deux bords, pour que la découpe ne se voie pas.
      ctx.globalCompositeOperation = "destination-in";
      const fondu = ctx.createLinearGradient(cx - HALO, 0, cx + HALO, 0);
      fondu.addColorStop(0, "rgba(0,0,0,0)");
      fondu.addColorStop(0.2, "rgba(0,0,0,1)");
      fondu.addColorStop(0.8, "rgba(0,0,0,1)");
      fondu.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = fondu;
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.globalCompositeOperation = "source-over";
    });

    // Le canevas du halo suit la taille du graphique, en pixels physiques.
    const ro = new ResizeObserver(() => {
      const cv = glowRef.current;
      if (!cv) return;
      cv.width = el.clientWidth;
      cv.height = el.clientHeight;
    });
    ro.observe(el);

    /**
     * Poser un sticker : un clic sur le graphique, quand un glyphe est armé.
     *
     * Le point cliqué est converti en couple (horodatage, valeur) et non gardé en
     * pixels : c'est ce qui fait qu'un sticker suit le zoom, le déplacement et le
     * redimensionnement au lieu de rester collé à l'écran. La valeur est divisée
     * par le facteur d'échelle avant d'être rangée — voir le champ `valeur` de
     * `Sticker` pour la raison.
     *
     * `param.time` est absent quand le clic tombe hors de la plage de données ; on
     * ne pose alors rien plutôt que d'inventer une date.
     */
    const surClic = (param: MouseEventParams) => {
      const glyphe = stickerArmeRef.current;
      if (!glyphe || !param.point) return;
      // Par l'indice logique, comme la dépose : `param.time` est l'horodatage de
      // la barre la plus proche, et poserait le sticker à côté du clic.
      const ech = chart.timeScale();
      const entier = ech.coordinateToLogical(param.point.x);
      if (entier == null) return;
      const fin = logiqueFine(param.point.x, entier as number,
        l => ech.logicalToCoordinate(l as Logical));
      if (fin == null) return;
      const t = logiqueVersTemps(fin, tempsSerieRef.current);
      if (t == null) return;
      const prix = serie.coordinateToPrice(param.point.y);
      if (prix == null) return;
      const facteur = echelleStickerRef.current || 1;
      const neuf: Sticker = {
        id: idSticker(),
        glyphe,
        temps: t,
        valeur: (prix as number) / facteur,
        taille: TAILLE_DEFAUT,
      };
      setStickers(l => {
        const suite = l.concat([neuf]);
        ecrireStickers(cleStRef.current, suite);
        return suite;
      });
      // Désarmé après avoir posé, comme le fait TradingView : rester armé faisait
      // qu'un clic destiné à déplacer la vue posait un second sticker.
      setStickerArme(null);
    };
    chart.subscribeClick(surClic);

    return () => {
      ro.disconnect();
      chart.unsubscribeClick(surClic);
      chart.remove();
      chartRef.current = null;
      serieRef.current = null;
    };
  }, []);

  // ── Alimentation ───────────────────────────────────────────────────────────
  useEffect(() => {
    const serie = serieRef.current, chart = chartRef.current;
    if (!serie || !chart) return;

    /**
     * Série vide : on retire aussi **l'axe**, et pas seulement la courbe.
     *
     * ⚠️ Vider les données ne remet pas l'échelle à zéro. Relevé dans le code de
     * la bibliothèque (5.2.0, `PriceScale._recalculatePriceRangeImpl`), deux
     * règles se conjuguent : une série sans valeur est ignorée par le calcul
     * d'échelle, et quand plus aucune série n'y contribue, la plage courante est
     * **conservée** telle quelle — le commentaire d'origine dit « keep current
     * range is new is empty ».
     *
     * Le voile « Chargement… » ne suffit donc pas à masquer l'ancienne échelle :
     * il est transparent et centré, et les graduations restent parfaitement
     * lisibles derrière. Sur un portefeuille dont l'historique est vide, elles ne
     * partaient même jamais — l'axe d'un autre portefeuille restait affiché
     * indéfiniment sous un message d'indisponibilité.
     *
     * Le coût est un léger élargissement du cadre le temps du chargement, l'axe
     * cessant d'occuper sa colonne. C'est le bon côté du marché : une largeur qui
     * bouge se remarque à peine, des euros faux se lisent.
     *
     * ⚠️ Basculé **uniquement au changement**, jamais à chaque passage. Cet effet
     * rejoue à chaque rafraîchissement des cours, toutes les dix secondes ;
     * réappliquer les options de l'axe y provoquerait une remise en page, donc un
     * risque de réveiller le `ResizeObserver` du cadrage — lequel force un
     * recadrage et effacerait le zoom de l'utilisateur. C'est exactement le défaut
     * décrit plus bas sur `rightOffset`, et il ne coûte rien de l'éviter.
     */
    const axeVoulu = !!points.length && !!ordonnee;
    if (axeVisibleRef.current !== axeVoulu) {
      axeVisibleRef.current = axeVoulu;
      chart.priceScale("right").applyOptions({ visible: axeVoulu });
    }
    if (!axeVoulu) {
      serie.setData([]);
      bougieRef.current?.setData([]);
      return;
    }

    // Le capital engagé, indexé par jour, pour que le survol puisse rendre un
    // gain daté plutôt que celui d'aujourd'hui sous une date d'hier.
    investiParDateRef.current = new Map(
      points.filter(p => typeof p.invested === "number")
            .map(p => [p.date.slice(0, 10), p.invested as number]));

    const bougies = mode === "bougie" ? agregerEnBougies(data) : [];
    if (mode === "bougie") {
      serie.setData([]);
      bougieRef.current?.setData(bougies);
    } else {
      bougieRef.current?.setData([]);
      serie.setData(data);
    }

    // Les deux séries suivent `cadrePret` : invisibles tant que le cadrage n'est
    // pas confirmé. Voir la note sur cet état.
    serie.applyOptions({ visible: cadrePret });
    bougieRef.current?.applyOptions({ visible: cadrePret });

    // Le cadrage porte sur la série réellement affichée : les bougies sont
    // agrégées, donc bien moins nombreuses que les points de la ligne. Régler
    // la fenêtre sur le compte de la ligne tassait soixante bougies dans le
    // premier vingtième du tracé.
    const nbBarres = mode === "bougie" ? bougies.length : data.length;
    // Cadrage sur les horodatages réels plutôt que `fitContent()`.
    //
    // `fitContent` encadre les *barres*, pas les points : il ajoute une demi-barre
    // de marge de chaque côté. Sur la page graphique cela ne se voit pas, ses
    // séries comptant plusieurs centaines de points — la demi-barre y vaut deux
    // pixels. Ici, 27 points intraday sur 860 px donnent des barres de 32 px,
    // donc 16 px de vide entre le dernier point et la pastille de valeur.
    // En fixant la fenêtre aux horodatages extrêmes, la courbe touche les deux
    // bords quel que soit le nombre de points.
    if (nbBarres > 1) {
      // Cadrage sur [0,5 ; n−1,5], et non [0 ; n−1].
      //
      // La bibliothèque répartit la largeur sur `to − from + 1` barres, puis
      // dessine le point i au *centre* de la sienne. Demander [0 ; n−1] laisse
      // donc une demi-barre de vide de chaque côté. Invisible sur la fenêtre
      // Max — 5 500 points, la demi-barre vaut un dixième de pixel — mais
      // énorme sur 1 semaine : mesuré à 70 px pour 6 points, la courbe se
      // détachait visiblement de l'échelle et de la marge gauche.
      //
      // Décaler les deux bornes d'une demi-barre place le premier et le
      // dernier point exactement sur les bords : mesuré à 1 px après coup.
      //
      // Différé d'une trame : appliqué dans la foulée de `setData`, le cadrage
      // est écrasé par la mise en page que la bibliothèque enchaîne.
      /**
       * Le cadrage ne se rejoue que quand la série change de nature — période ou
       * mode — ou quand le cadre change de largeur.
       *
       * ⚠️ **Jamais sur un rafraîchissement des cours.** Ils arrivent toutes les
       * dix secondes et font changer `totalValue`, donc l'échelle, donc cet
       * effet. Deux versions ont raté cette condition : la première rejouait tout
       * et remettait la vue d'ensemble, la seconde laissait `rightOffset` se
       * réappliquer — ce qui recolle la dernière barre au bord droit, donc fait
       * défiler la vue à droite. **Les trois appels déplacent la vue**, aucun ne
       * peut rester hors de la condition.
       *
       * `forcer` sert au redimensionnement : là, les pixels ont changé sous la
       * vue et il faut bien recadrer. C'est aussi ce qui rattrape le cas de
       * l'onglet monté masqué, où le premier cadrage se fait sur une largeur
       * nulle — on ne retient donc rien tant que la largeur est nulle.
       */
      /**
       * La clé du cadrage : période, mode, **et nombre de barres**.
       *
       * ⚠️ Le nombre de barres est le discriminant, et l'oublier casse l'un des
       * deux comportements à coup sûr.
       *
       * Sur un changement de période, cet effet tourne deux fois : une première
       * avec les points encore anciens — le chargement est en vol — puis une
       * seconde à leur arrivée. Une clé réduite à `période|mode` est déjà
       * satisfaite au second passage, donc le cadrage calculé sur l'ancien compte
       * de barres restait en place : mesuré, la fenêtre de Max ne montrait plus
       * que 8 % de la série, celle d'un an 25 %.
       *
       * À l'inverse, recadrer à chaque passage annule le zoom de l'utilisateur dès
       * que les cours se rafraîchissent, toutes les dix secondes — mesuré aussi,
       * la vue revenait de 1 095→2 034 à 0,5→3 128,5.
       *
       * Le nombre de barres sépare les deux : il change quand la série est
       * remplacée, pas quand seules les valeurs bougent.
       *
       * ⚠️ Reste un cas : sur 24 h, la série s'allonge d'une barre toutes les
       * quinze minutes, et le cadrage se refait alors. C'est assumé — le bord
       * droit a bougé pour de bon — et sans commune mesure avec un recadrage
       * toutes les dix secondes.
       */
      const cle = `${period}|${mode}|${nbBarres}`;

      const cadrer = (forcer = false) => {
        try {
          const w = plotRef.current?.clientWidth ?? 0;
          if (w <= 0) return;
          if (!forcer && cadreRef.current === cle) return;
          // Zoom arrière borné à la vue d'ensemble : au-delà, on ne montre que
          // du blanc. L'espacement minimal est celui qui fait tenir toute la
          // série dans le cadre.
          if (nbBarres > 1) chart.timeScale().applyOptions({ minBarSpacing: w / nbBarres });
          chart.timeScale().applyOptions({ rightOffset: 0 });
          chart.timeScale().setVisibleLogicalRange({ from: 0.5, to: nbBarres - 1.5 });
          cadreRef.current = cle;
        } catch { /* graphique démonté entre-temps */ }
      };

      /**
       * Le cadrage est vérifié, puis réappliqué s'il n'a pas pris.
       *
       * ⚠️ Une seule trame ne suffit pas, et le seuil dépend du nombre de points.
       * Sur la fenêtre d'un mois — 784 barres de quinze minutes, contre 127 en
       * Max, 172 en 1 S et 95 en 24 h — la bibliothèque n'avait pas fini sa mise
       * en page à la trame suivante et écrasait la fenêtre demandée : l'axe
       * affichait deux jours au lieu d'un mois, et le premier repère d'opération
       * se retrouvait à 287 px hors cadre à gauche.
       *
       * Plutôt qu'un délai choisi au hasard, on relit la plage réellement en
       * place à la trame d'après et on recadre si elle s'écarte de plus d'une
       * barre. Le contrôle coûte une lecture ; le délai magique aurait coûté un
       * réglage à refaire au prochain changement de granularité.
       */
      // ⚠️ Un premier cadrage **synchrone**, avant que quoi que ce soit ne soit
      // peint.
      //
      // Il peut être écrasé par la mise en page que la bibliothèque enchaîne —
      // c'est pour cela que le différé existe — mais quand il tient, la première
      // peinture est déjà la bonne. Sans lui, la courbe apparaissait mal cadrée
      // pendant deux trames avant que la vérification ne la remette : chronométré
      // à 33 ms, assez pour se voir comme une autre courbe qui clignote.
      // Un recadrage est-il attendu ? Si oui, on masque le temps qu'il se pose.
      const enAttente = cadreRef.current !== cle;
      if (enAttente) setCadrePret(false);

      cadrer();

      /**
       * La vérification ne tourne que si un cadrage était attendu.
       *
       * ⚠️ C'est la condition qui protège le zoom de l'utilisateur, et son
       * absence était un vrai bug : la correction ci-dessous est **forcée**, donc
       * elle passe outre la garde de `cadrer`. Sur un rafraîchissement des cours —
       * toutes les dix secondes — l'effet rejouait, la fenêtre visible ne
       * correspondait évidemment pas à la vue d'ensemble puisque l'utilisateur
       * avait zoomé, et le contrôle « corrigeait » ce zoom en le supprimant.
       *
       * Le contrôle ne sait pas distinguer « le cadrage demandé n'a pas pris » de
       * « la vue a été déplacée exprès ». La seule chose qui les sépare est de
       * savoir si on a demandé un cadrage : hors changement de période ou de mode,
       * on n'en a demandé aucun, donc il n'y a rien à vérifier.
       *
       * ⚠️ **Mais aussi quand la confirmation n'a jamais eu lieu**, et cette
       * seconde condition répare une courbe qui ne se peignait pas du tout.
       *
       * La chaîne ci-dessous met trois trames à confirmer le cadrage, et le
       * nettoyage de l'effet l'annule. Or elle est interrompue à la moindre
       * variation des dépendances — `totalValue` change à chaque rafraîchissement
       * des cours, et il entraîne `echelle`, `ordonnee` et `data` avec lui. Une
       * seule interruption suffisait à tout bloquer : `cadrer` ayant déjà inscrit
       * la clé, le passage suivant trouvait `enAttente` faux et ne replanifiait
       * rien. `cadrePret` restait donc faux pour toujours, et les deux séries
       * gardaient `visible: false` — un cadre vide, avec son axe et ses dates,
       * mais sans courbe, jusqu'au prochain changement de période.
       *
       * C'est arrivé à l'arrivée sur la page, où les cours et les positions se
       * posent en quelques trames, et sur la fenêtre Max qui est celle d'ouverture.
       *
       * La condition ne peut pas boucler : une fois `cadrePret` vrai à clé
       * inchangée, elle est fausse.
       */
      let id = 0, id2 = 0, id3 = 0;
      if (enAttente || !cadrePret) id = requestAnimationFrame(() => {
        // Gardé, pas forcé : cet appel ne sert qu'à rattraper le cas où la largeur
        // était nulle à la passe synchrone.
        cadrer();
        id2 = requestAnimationFrame(() => {
          try {
            const v = chart.timeScale().getVisibleLogicalRange();
            const pris = v
              && Math.abs(v.from - 0.5) <= 1
              && Math.abs(v.to - (nbBarres - 1.5)) <= 1;
            if (!pris) cadrer(true);
          } catch { /* graphique démonté entre-temps */ }
          // ⚠️ On découvre une trame **après** la correction, pas dans la même.
          //
          // `setVisibleLogicalRange` ne prend effet qu'à la mise en page suivante
          // de la bibliothèque : découvrir aussitôt laissait les repères se
          // calculer sur l'ancienne échelle, et l'un d'eux reparaissait à 287 px
          // hors cadre le temps d'une trame. Mesuré, puis vérifié après coup.
          //
          // Et on découvre quoi qu'il arrive : un cadrage qui ne prendrait pas
          // malgré deux tentatives et une correction ne doit pas laisser un cadre
          // vide pour autant.
          id3 = requestAnimationFrame(() => setCadrePret(true));
        });
      });

      // Recadrer quand le cadre prend enfin ses dimensions.
      //
      // L'onglet Transactions est monté masqué : le graphique s'y crée dans un
      // conteneur de largeur nulle, et le cadrage calculé alors ne vaut rien —
      // à l'affichage, la courbe se retrouvait tassée sur le cinquième droit.
      const el = plotRef.current;
      let largeur = el?.clientWidth ?? 0;
      const ro = el ? new ResizeObserver(() => {
        const w = el.clientWidth;
        if (w > 0 && w !== largeur) { largeur = w; cadrer(true); }
      }) : null;
      if (el && ro) ro.observe(el);

      // Les deux trames s'annulent : la seconde est planifiée par la première,
      // donc un démontage entre les deux laisserait un rappel sur un graphique
      // détruit.
      return () => { cancelAnimationFrame(id); cancelAnimationFrame(id2); cancelAnimationFrame(id3); ro?.disconnect(); };
    }
    chart.timeScale().fitContent();
  }, [points, totalValue, mode, operations, ordonnee, period, cadrePret, data]);

  // L'heure ne s'affiche que sur la journée. Sur une série journalière,
  // `timeVisible` intercalait des numéros de jour entre les noms de mois —
  // « nov. 2026 mars avr. juin 5 » sur la fenêtre d'un an.
  useEffect(() => {
    chartRef.current?.timeScale().applyOptions({ timeVisible: period === "24h" });
  }, [period]);

  // Couleur et mode s'appliquent à la série existante. En mode ligne, le
  // dégradé est simplement rendu transparent.
  // Le canevas ne résout pas var() : une couleur de portefeuille est un
  // hexadécimal, mais le repli est un jeton. On le résout ici, à chaque rendu
  // — donc aussi au changement de thème, qui en provoque un.
  const teinte = couleurChoisie ?? color;
  const encre = teinte.startsWith("var(")
    ? resoudreJeton(teinte.slice(4, -1).trim(), "#50A2FF")
    : teinte;
  // Le halo de survol lit la couleur dans une référence, mise à jour ici :
  // la déclaration de `colorRef` précède celle de l'état de teinte.
  colorRef.current = encre;
  useEffect(() => {
    serieRef.current?.applyOptions({
      lineColor: encre,
      topColor: encre + "55",
      bottomColor: encre + "00",
    });
  }, [encre, mode]);

  const retirerSticker = (id: string) => setStickers(l => {
    const suite = l.filter(k => k.id !== id);
    ecrireStickers(cleSt, suite);
    return suite;
  });

  const eur = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";
  const dernier = points.length && totalValue ? totalValue : null;

  /**
   * Les écritures portées par la pastille sous la souris.
   *
   * ⚠️ L'encart n'annonce **ni la date ni la valeur** du point visé, et c'est
   * délibéré : la bande de tête de la page les donne déjà, et à la date survolée
   * — elle bascule sur `survol` pour la valeur comme pour le capital engagé. Les
   * répéter dans le cadre aurait affiché deux fois le même chiffre à trente
   * centimètres d'écart, dont l'un en plus petit.
   *
   * Il ne paraît donc que là où il apporte ce que personne d'autre ne dit : le
   * détail de l'écriture, quand on pointe la bulle qui la porte.
   */
  const opsVisees = jourSurvole ? opsParJour.get(jourSurvole) ?? [] : [];

  const montantOp = (o: { quantity?: number; unit_price?: number; fees?: number }) =>
    o.quantity != null && o.unit_price != null
      ? o.quantity * o.unit_price + (o.fees ?? 0)
      : null;

  /**
   * Les périodes : libellé, rendement de la période dessous, et un filet sous
   * celle qui est active.
   *
   * Les huit pourcentages sont tirés d'une seule série — celle de la fenêtre
   * Max — plutôt que d'un appel par période : sinon un même intervalle pourrait
   * annoncer un chiffre une fois sélectionné et un autre au repos.
   *
   * Sorties du bandeau de tête et posées sous le cadre, centrées. Elles y
   * laissent le haut du graphique à l'encart de survol, qui a besoin du coin
   * gauche — c'est là que l'œil va chercher ce genre de lecture, et c'est là que
   * la page graphique la met déjà.
   */
  const barrePeriodes = (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
      {PERIODES.map(p => {
        const actif = p === period;
        const pct = rendements[p];
        // Une fenêtre plus ancienne que le portefeuille se replie sur son
        // origine et répète le chiffre de Max. Trois nombres identiques
        // laissent croire à trois mesures : mieux vaut les éteindre.
        const secs = PERIOD_SECS[p];
        const anterieure = !!origine && secs != null
          && Date.now() - secs * 1000 < new Date(origine).getTime();
        return (
          <div key={p} onClick={() => { if (!anterieure) onPeriodChange(p); }}
            title={anterieure ? `Le portefeuille n'existe que depuis le ${new Date(origine!).toLocaleDateString("fr-FR")}` : undefined}
            /**
             * ⚠️ Une largeur **minimale**, et non fixe. Les quarante-cinq pixels
             * d'origine étaient plus étroits que leur propre contenu : mesuré à
             * l'encre dans la police rendue, « +390.48 % » en occupe 58,2 et
             * « +65.43 % » 50,6, pour un écart de 4 px entre deux cases. Quatre
             * des huit pourcentages débordaient donc sur leurs voisins et se
             * touchaient. Le défaut ne datait pas du déplacement de la barre,
             * mais il devient voyant au centre de l'écran.
             */
            style={{ position: "relative", paddingBottom: 4, textAlign: "center",
                     minWidth: 45, paddingLeft: 3, paddingRight: 3,
                     cursor: anterieure ? "default" : "pointer", flex: "none",
                     opacity: anterieure ? 0.3 : 1 }}>
            <div style={{
              fontFamily: FONT, fontSize: 12, fontWeight: 500,
              // Leur variante d'onglets « line » : l'actif passe à
              // `foreground-intense`, l'inactif reste à `foreground-strong`
              // — bien plus lumineux que le gris que j'avais.
              color: actif ? JETONS.texteIntense : JETONS.texteFort,
              transition: "color 250ms",
            }}>{p}</div>
            {pct != null && !anterieure && (
              <div style={{
                ...NUM, fontSize: 11, fontWeight: 700,
                color: pct >= 0 ? JETONS.positif : JETONS.negatif,
              }}>
                {fmtPct(pct)}
              </div>
            )}
            {actif && (
              // Indicateur blanc, comme leur `bg-foreground-intense`, et non
              // teinté à l'accent : la couleur y désignait le graphique, pas
              // l'onglet retenu.
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, borderRadius: RAYONS.plein, background: JETONS.texteIntense }} />
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div ref={boxRef} style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Les outils seuls en tête, alignés à droite : les périodes sont passées
          sous le cadre, et rien ne reste à leur gauche. */}
      {/* Bandeau de tête : le détail de l'écriture à gauche, les outils à
          droite, sur la même ligne et donc à la même marge. */}
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "flex-end",
        gap: 10, marginBottom: 4,
        /**
         * ⚠️ Position de référence pour l'encart, et hauteur plancher.
         *
         * L'encart est posé en absolu dans ce bandeau : `left: 0` lui donne
         * exactement la marge gauche que les boutons ont à droite, et sa hauteur
         * ne peut plus faire respirer la ligne — sans quoi le tracé se serait
         * raccourci de trente pixels chaque fois que le curseur passe sur une
         * écriture, et rallongé en repartant.
         */
        position: "relative", minHeight: 30,
      }}>
        {/**
          * L'encart de lecture, dans le bandeau de tête et non dans le cadre.
          *
          * Il ne dit **rien sur la date ni sur la valeur**, que la bande de tête
          * de la page donne déjà à la date survolée. Uniquement le détail de
          * l'écriture pointée, que personne d'autre n'affiche : il paraît donc là
          * où il apporte quelque chose, et s'efface ailleurs.
          *
          * Sorti du tracé, il s'aligne sur la marge des boutons — même ligne,
          * mêmes retraits. Il garde son halo pour autant : quand trois écritures
          * s'y empilent, les lignes du bas dépassent sur le haut du tracé, et là
          * encore un chiffre doit rester lisible.
          *
          * ⚠️ `pointerEvents: none` sur tout le bloc. Il déborde sur le tracé et
          * capterait sinon le réticule qui le nourrit : l'encart s'effacerait au
          * moment précis où l'on s'en approche, et les pastilles sous lui
          * deviendraient incliquables.
          *
          * Il ne paraît qu'une fois le cadrage confirmé, comme les courbes : une
          * ligne lisible au-dessus d'un cadre vide n'aurait rien désigné.
          */}
        {opsVisees.length > 0 && cadrePret && (
          <div style={{
            // `top: 0 ; left: 0` : le coin du bandeau, donc la marge même des
            // boutons qui le terminent à droite.
            position: "absolute", top: 0, left: 0, zIndex: 20, pointerEvents: "none",
            fontFamily: FONT, lineHeight: 1.5, maxWidth: "62%",
            // L'écart entre les lignes vient du conteneur, pour que la première
            // n'hérite pas d'une marge haute qui la décollerait du bord.
            display: "flex", flexDirection: "column", gap: 3,
            /**
             * Un halo, et non un cadre.
             *
             * ⚠️ Les lignes du bas dépassent sur le tracé dès qu'il y a plus d'une
             * écriture, et sur la fenêtre d'un mois la courbe passe justement en
             * haut : sans rien, un chiffre blanc sur un trait clair devient
             * illisible. Un panneau opaque réglerait la lisibilité mais percerait
             * un trou dans le graphique.
             *
             * Le halo détache chaque lettre de ce qu'il y a derrière sans rien
             * masquer. Il prend la couleur du fond, donc s'inverse avec le thème :
             * sombre sur fond sombre, clair sur fond clair.
             */
            textShadow: clair
              ? "0 0 3px #FFFFFF, 0 0 6px #FFFFFF"
              : "0 0 3px rgba(6,20,42,0.95), 0 0 7px rgba(6,20,42,0.85)",
          }}>
            {/* Les écritures du jour visé.
                ⚠️ Cinq au plus, et non trois. La pastille ne regroupant plus par
                type, une journée en porte davantage : relevé sur un vrai PEA, le
                15 juillet 2026 en compte cinq et le 19 février quatre. À trois, la
                plupart des journées chargées auraient fini par « et 2 autres »,
                c'est-à-dire par masquer ce que le survol vient chercher.
                Au-delà de cinq, l'encart deviendrait un tableau posé sur la
                courbe qu'il commente ; le compte des suivantes suffit alors. */}
            {opsVisees.slice(0, MAX_LIGNES_ENCART).map(o => {
              const m = montantOp(o);
              return (
                <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    width: DISQUE, height: DISQUE, borderRadius: "50%", flexShrink: 0,
                    background: couleurOp(o.type, clair),
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: clair ? "#FFFFFF" : "rgba(6,20,42,0.96)",
                  }}>
                    {/* Réduit par rapport au tracé, et c'est assumé : le libellé est
                        écrit juste à côté, donc la vignette n'a qu'à rappeler la
                        couleur et la silhouette. Elle n'a rien à expliquer seule. */}
                    <Pictogramme type={o.type} />
                  </span>
                  <span style={{ fontSize: 11, color: JETONS.texteFort, whiteSpace: "nowrap" }}>
                    {o.libelle} <strong style={{ color: JETONS.texteIntense }}>{o.ticker}</strong>
                  </span>
                  {o.quantity != null && o.unit_price != null && (
                    <span style={{ ...NUM, fontSize: 11, color: JETONS.texteSecondaire, whiteSpace: "nowrap" }}>
                      {o.quantity.toLocaleString("fr-FR", { maximumFractionDigits: 4 })}
                      {" × "}
                      {o.unit_price.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                    </span>
                  )}
                  {m != null && (
                    <span style={{ ...NUM, fontSize: 11, fontWeight: 700, color: JETONS.texteFort, whiteSpace: "nowrap" }}>
                      {m.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                    </span>
                  )}
                </div>
              );
            })}
            {/* Le reste, compté et non énuméré.
                Aligné sur la colonne du texte des lignes au-dessus — la largeur
                du disque plus l'écart qui le sépare de son libellé — pour que le
                nombre se lise dans le prolongement de la liste et non sous les
                vignettes.
                ⚠️ Le nombre est nommé. Un « +2 » seul ne dit pas de quoi : deux
                euros, deux pour cent, deux titres ? Le chiffre garde la fonte
                chiffrée et le gras qui le font ressortir, le mot le rend lisible. */}
            {opsVisees.length > MAX_LIGNES_ENCART && (() => {
              const reste = opsVisees.length - MAX_LIGNES_ENCART;
              return (
                <div style={{
                  fontFamily: FONT, fontSize: 10, color: JETONS.texteAttenue,
                  paddingLeft: DISQUE + 6,
                }}>
                  <strong style={{ ...NUM, fontWeight: 700 }}>+{reste}</strong>
                  {reste > 1 ? " autres opérations" : " autre opération"}
                  {" ce jour-là"}
                </div>
              );
            })()}
          </div>
        )}
        <div style={{ display: "flex", gap: 6, flexShrink: 0, position: "relative" }}>
        {/* Stickers : des repères libres, posés à la main sur le tracé. */}
        <button type="button"
          onClick={e => {
            const r = e.currentTarget.getBoundingClientRect();
            setAncreStickers({ droite: window.innerWidth - r.right, haut: r.bottom + 6 });
            setStickersOuverts(v => !v);
          }}
          title="Stickers"
          style={{
            // Actif quand le panneau est ouvert **ou** qu'un glyphe attend d'être
            // posé : le panneau se referme dès le clic sur la courbe, et sans ce
            // second cas rien ne rappelait qu'on était encore armé.
            background: stickersOuverts || stickerArme ? JETONS.segmentActif : JETONS.segmentPiste,
            border: `1px solid ${stickersOuverts || stickerArme ? JETONS.segmentActif : JETONS.bord}`,
            borderRadius: RAYONS.sm, width: 30, height: 30, cursor: "pointer", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: stickersOuverts || stickerArme ? JETONS.segmentEncre : JETONS.texteFort,
            boxShadow: stickersOuverts || stickerArme ? JETONS.segmentOmbre : "none",
            transition: "background 250ms, color 250ms",
          }}>
          {/* Sticker qui se décolle. Même compensation de graisse que le
              croisillon : 1,5 sur une boîte de 24 rendue à 14 ne pèserait que
              0,875 px. */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m20 12-2 .5A6.002 6.002 0 0 1 11.5 6l.5-2m8 8-8-8m8 8a8 8 0 1 1-8-8" />
          </svg>
        </button>

        {/* Le glyphe qui suit le curseur pendant qu'on le traîne.
            Dans un portail et en position fixe : la carte du graphique rogne son
            débordement, et le fantôme doit pouvoir survoler le panneau comme le
            reste de la page. Transparent aux événements, sans quoi il serait la
            cible du `pointerup` au lieu du graphique. */}
        {fantome && typeof document !== "undefined" && createPortal(
          <div aria-hidden="true" style={{
            position: "fixed", left: fantome.x, top: fantome.y,
            transform: "translate(-50%,-50%)", zIndex: 60, pointerEvents: "none",
            fontSize: TAILLE_DEFAUT * 0.82, lineHeight: 1, opacity: 0.85,
            filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.5))",
          }}>{fantome.glyphe}</div>,
          document.body,
        )}

        {stickersOuverts && ancreStickers && (
          <PanneauStickers
            arme={stickerArme}
            surGeste={(glyphe, x, y) => {
              gesteRef.current = { type: "panneau", glyphe, x0: x, y0: y, bouge: false };
            }}
            surVider={() => { setStickers([]); ecrireStickers(cleSt, []); setStickerArme(null); }}
            nbPoses={stickers.length}
            fermer={() => setStickersOuverts(false)}
            ancre={ancreStickers}
          />
        )}

        <button type="button"
          onClick={e => {
            const r = e.currentTarget.getBoundingClientRect();
            setAncreGrille({ droite: window.innerWidth - r.right, haut: r.bottom + 6 });
            setGrilleOuverte(v => !v);
          }}
          title="Personnaliser la grille"
          style={{
            background: grilleOuverte ? JETONS.segmentActif : JETONS.segmentPiste,
            border: `1px solid ${grilleOuverte ? JETONS.segmentActif : JETONS.bord}`,
            borderRadius: RAYONS.sm, width: 30, height: 30, cursor: "pointer", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: grilleOuverte ? JETONS.segmentEncre : JETONS.texteFort,
            boxShadow: grilleOuverte ? JETONS.segmentOmbre : "none",
            transition: "background 250ms, color 250ms",
          }}>
          {/* Croisillon fourni sur une boîte de 24, rendu à 14 comme les glyphes
              de la piste voisine.

              ⚠️ L'épaisseur de trait ne se recopie pas telle quelle. Elle est
              donnée pour une boîte de 24 : à 14 px de rendu elle ne pèserait plus
              que 0,875 px, contre 1,5 px pour le croisillon qu'elle remplace, et
              le bouton pâlissait à côté de ses voisins. On la remonte à 2,6 pour
              retrouver 1,5 px effectif — la géométrie est celle du concept, seule
              la graisse est ramenée à l'échelle de rendu. */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 8h18M3 16h18M8 3v18m8-18v18" />
          </svg>
        </button>

        {grilleOuverte && ancreGrille && (
          <PanneauGrille
            style={grille}
            surStyle={v => { setGrille(v); ecrireStyleGrille(v); }}
            fermer={() => setGrilleOuverte(false)}
            ancre={ancreGrille}
          />
        )}

        <button type="button"
          onClick={e => {
            const r = e.currentTarget.getBoundingClientRect();
            setAncreReglages({ droite: window.innerWidth - r.right, haut: r.bottom + 6 });
            setReglagesOuverts(v => !v);
          }}
          title="Couleur de la courbe"
          style={{
            background: reglagesOuverts ? JETONS.segmentActif : JETONS.segmentPiste,
            border: `1px solid ${reglagesOuverts ? JETONS.segmentActif : JETONS.bord}`,
            borderRadius: RAYONS.sm, width: 30, height: 30, cursor: "pointer", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: reglagesOuverts ? JETONS.segmentEncre : JETONS.texteFort,
            boxShadow: reglagesOuverts ? JETONS.segmentOmbre : "none",
            transition: "background 250ms, color 250ms",
          }}>
          {/* Trois disques qui se chevauchent, en aplat : rien à compenser ici,
              une forme pleine garde son poids à toutes les échelles. */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19.218 11.08a5.85 5.85 0 0 1-5.508 10.243q.2-.206.386-.429a7.8 7.8 0 0 0 1.745-6.001 7.82 7.82 0 0 0 3.377-3.813M4.795 11.075a7.79 7.79 0 0 0 9.155 4.58 5.85 5.85 0 0 1-2.632 5.133 5.854 5.854 0 0 1-9.044-4.357 5.85 5.85 0 0 1 2.376-5.255z" />
            <path d="M12.004 2.25a5.85 5.85 0 0 1 5.406 3.611 5.848 5.848 0 0 1-4.265 7.977A5.854 5.854 0 0 1 6.151 8.1l.004-.22a5.85 5.85 0 0 1 5.849-5.63" />
          </svg>
        </button>

        {reglagesOuverts && ancreReglages && (
          <PanneauReglages
            couleur={encre}
            surCouleur={setCouleurChoisie}
            fermer={() => setReglagesOuverts(false)}
            ancre={ancreReglages}
          />
        )}

        {/* Courbe ou bougies, côte à côte dans une piste.
            La taille `md` par défaut n'est pas un détail de goût : 26 px de
            pastille plus 2 px de creux de chaque côté font exactement les 30 px
            des boutons voisins, là où `sm` en aurait fait 26 et aurait désaligné
            la rangée. `picto` carre les pastilles, le rembourrage par défaut
            étant réglé sur des mots et non sur des icônes. */}
        <Segments
          picto
          ariaLabel="Type de tracé"
          valeur={mode}
          onChange={setMode}
          options={[
            { valeur: "ligne" as const, libelle: <MarqueMode cible="ligne" />, titre: "Courbe" },
            { valeur: "bougie" as const, libelle: <MarqueMode cible="bougie" />, titre: "Bougies" },
          ]}
        />
        </div>
      </div>

      <div style={{ position: "relative", flex: height ? undefined : 1, height, minHeight: 0 }}>
        <div ref={plotRef}
          // Un appui sur le graphique lui-même désélectionne : sans cela, le cadre
          // et la poignée restaient après qu'on soit passé à autre chose.
          onPointerDown={() => setSelection(null)}
          style={{
          position: "absolute", inset: 0,
          // Curseur en croix tant qu'un sticker attend d'être posé : c'est le seul
          // signal que le prochain clic ne déplacera pas la vue.
          cursor: stickerArme ? "crosshair" : undefined,
        }} />
        {/* Repères d'opération, en surcouche.
            Le greffon de la bibliothèque les fait entrer dans l'échelle des
            prix : sur un portefeuille parti de zéro, loger les pastilles sous
            la courbe descendait l'axe à −1 000 €, une valeur que le
            portefeuille n'a jamais eue. Positionnées ici à la main, elles
            flottent au-dessus du tracé sans rien déformer. */}
        {/* Les deux extrêmes de la période, en anneau creux.
            Forme délibérément différente des pastilles d'opération, qui sont des
            disques pleins à pictogramme : deux repères de même silhouette se
            liraient comme la même chose. Et posés **sous** elles dans
            l'empilement — quand un achat tombe sur le meilleur moment, c'est
            l'achat qui garde le pixel, lui seul étant cliquable. */}
        {reperes.map(r => (
          /**
           * Aucune infobulle, et il n'y en avait déjà pas.
           *
           * ⚠️ Un `title` était posé là, mais il ne pouvait ni s'afficher ni se
           * lire : l'anneau est en `pointerEvents: none`, donc le navigateur ne le
           * survole jamais, et en `aria-hidden`, donc aucun lecteur d'écran ne
           * l'annonce. Il donnait l'illusion d'une explication accessible.
           *
           * Le libellé reste calculé, car il entre dans l'identité du repère — voir
           * `cléRepere`. Rendre ces anneaux explicables demanderait de les rendre
           * survolables, ce qui les ferait capter le réticule : à faire seulement
           * si le besoin se présente.
           */
          <span key={r.sens} aria-hidden="true"
            ref={inscrire(noeudsRepere, coordsRepere, r.sens)}
            style={{
            // Ancré par `transform`, écrit hors de React : voir `ancrer`. Le coin
            // reste à l'origine, le déplacement est entièrement dans la transformée
            // — et le `translate(-50%,-50%)` qu'elle porte recentre l'anneau.
            position: "absolute", left: 0, top: 0, visibility: "hidden",
            width: 12, height: 12, borderRadius: RAYONS.plein,
            // Fond de la carte à l'intérieur de l'anneau : un anneau vraiment
            // creux laisse passer la courbe, qui le traverse et le referme.
            background: clair ? "#FFFFFF" : JETONS.carte,
            border: `2px solid ${r.sens === "haut" ? JETONS.positif : JETONS.negatif}`,
            boxSizing: "border-box", zIndex: 5, pointerEvents: "none",
          }} />
        ))}
        {/* Stickers posés à la main.
            Sous les pastilles d'opération dans l'empilement, comme les anneaux
            d'extrême : quand un sticker tombe sur une opération, c'est l'opération
            qui garde le pixel — elle ouvre une fiche, le sticker ne fait que se
            sélectionner. */}
        {stickersPlaces.map(k => {
          const choisi = selection === k.id;
          // Décalage et taille transitoires : pendant le geste, le sticker suit le
          // curseur sans que son ancrage soit encore recalculé. Il ne l'est qu'au
          // relâchement, une conversion par pixel parcouru étant inutile.
          const d = deplace && deplace.id === k.id ? deplace : null;
          const taille = etire && etire.id === k.id ? etire.taille : k.taille;
          return (
            <div key={k.id} style={{
              position: "absolute",
              left: k.x + (d ? d.dx : 0), top: k.y + (d ? d.dy : 0),
              transform: "translate(-50%,-50%)",
              width: taille, height: taille, zIndex: choisi ? 7 : 6,
            }}>
              <div role="button" tabIndex={0} title={k.titre}
                onPointerDown={e => {
                  e.preventDefault(); e.stopPropagation();
                  gesteRef.current = { type: "deplace", id: k.id, x0: e.clientX, y0: e.clientY, bouge: false };
                }}
                onKeyDown={e => {
                  // Le clavier ne peut pas glisser : il sélectionne et supprime.
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelection(s2 => (s2 === k.id ? null : k.id)); }
                  if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); retirerSticker(k.id); }
                }}
                style={{
                  width: "100%", height: "100%", cursor: d ? "grabbing" : "grab",
                  fontSize: taille * 0.82, lineHeight: 1,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  borderRadius: RAYONS.xs,
                  // Le cadre n'apparaît qu'à la sélection : posé en permanence, il
                  // ferait de chaque sticker une vignette encadrée plutôt qu'un
                  // repère posé sur la courbe.
                  outline: choisi ? `1px dashed ${JETONS.texteAttenue}` : "none",
                  outlineOffset: 2,
                  // Ombre portée pour détacher l'emoji d'un tracé de teinte proche,
                  // sans lui ajouter de cadre.
                  filter: clair
                    ? "drop-shadow(0 1px 2px rgba(15,23,42,0.35))"
                    : "drop-shadow(0 1px 3px rgba(0,0,0,0.75))",
                  userSelect: "none", touchAction: "none",
                }}>{k.glyphe}</div>

              {choisi && (
                <>
                  {/* Poignée au coin bas-droit : le coin est la convention, et il
                      évite de recouvrir l'emoji qu'on est en train de régler. */}
                  <div role="button" tabIndex={-1} aria-label="Étirer le sticker" title="Étirer"
                    onPointerDown={e => {
                      e.preventDefault(); e.stopPropagation();
                      gesteRef.current = { type: "etire", id: k.id, x0: e.clientX, y0: e.clientY, base: k.taille };
                    }}
                    style={{
                      position: "absolute", right: -7, bottom: -7,
                      width: 11, height: 11, borderRadius: RAYONS.plein,
                      background: JETONS.segmentActif, border: `1px solid ${JETONS.bordFort}`,
                      cursor: "nwse-resize", boxShadow: JETONS.segmentOmbre, touchAction: "none",
                    }} />
                  <button type="button" aria-label="Retirer le sticker" title="Retirer"
                    onPointerDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); retirerSticker(k.id); }}
                    style={{
                      position: "absolute", left: -8, top: -8,
                      width: 14, height: 14, padding: 0, borderRadius: RAYONS.plein,
                      background: JETONS.carte, border: `1px solid ${JETONS.bordFort}`,
                      color: JETONS.texteFort, cursor: "pointer",
                      fontFamily: FONT, fontSize: 9, lineHeight: 1,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>×</button>
                </>
              )}
            </div>
          );
        })}
        {pastilles.map(p => {
        // Pastille reliée à la courbe par une tige, comme si l'opération en
        // sortait. Détachée, elle flottait sans qu'on sache à quel point du
        // tracé elle se rapportait — sur une courbe en escalier, l'écart
        // d'un jour se lit.
        const pointee = jourSurvole === p.jour;
        // Une bulle est estompée quand une *autre* est pointée : c'est ce qui
        // répond à « laquelle je lis » quand plusieurs se serrent. Sur la fenêtre
        // Max, dix jours d'écriture tiennent sur cent vingt-huit points.
        const estompee = jourSurvole != null && !pointee;
        return (
          /**
           * ⚠️ `aria-label` et non `title` : pas d'infobulle native.
           *
           * Le `title` faisait surgir la boîte grise du navigateur sous le
           * curseur, qui répétait ce que l'encart en haut à gauche affiche
           * désormais — en travers de la courbe, avec sa demi-seconde de retard et
           * un style qui n'est pas celui de l'application. Deux réponses à la même
           * question, dont la moins bonne masquait le tracé.
           *
           * Le libellé reste porté, pour que la bulle garde un nom accessible :
           * elle ne contient qu'un dessin, et sans lui le bouton serait muet pour
           * un lecteur d'écran.
           */
          <button key={p.id} aria-label={p.titre} type="button"
            onClick={onOperationClick ? () => onOperationClick(p.id) : undefined}
            /**
             * Le survol de la bulle elle-même commande l'encart.
             *
             * ⚠️ `pointerEnter` et non `mouseEnter` : le premier couvre aussi le
             * stylet, et se déclenche au premier contact d'un doigt — sur mobile,
             * effleurer la bulle en montre alors le détail au lieu de rien.
             *
             * ⚠️ Et il faut bien que ce soit la bulle : c'est elle qui capte le
             * pointeur, donc le réticule de la bibliothèque s'éteint dès qu'on
             * l'approche. Se fier au réticule affichait l'encart *à côté* de la
             * bulle et l'effaçait dessus.
             */
            onPointerEnter={() => setJourSurvole(p.jour)}
            onPointerLeave={() => setJourSurvole(j => (j === p.jour ? null : j))}
            ref={inscrire(noeudsPastille, coordsPastille, p.id)}
            style={{
              // Centré sur le point de la courbe : le repère en sort au lieu
              // de flotter au-dessus. Une tige le rattachait, mais douze pixels
              // plus haut il semblait encore posé à côté.
              //
              // La position est posée par `ancrer`, hors de React, et sa
              // transformée porte le recentrage. Masquée par défaut : elle ne
              // paraît qu'une fois ancrée, sinon la première trame la montrerait
              // au coin haut gauche du cadre.
              position: "absolute", left: 0, top: 0, visibility: "hidden",
              width: PASTILLE, height: PASTILLE, borderRadius: "50%", padding: 0,
              // Plein, et non cerclé : sur un tracé de la même teinte, un
              // cercle évidé se confondait avec la courbe qui le traverse.
              background: couleurOp(p.type, clair),
              border: `${CONTOUR}px solid ${clair ? "#FFFFFF" : "rgba(6,20,42,0.96)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: clair ? "#FFFFFF" : "rgba(6,20,42,0.96)", flexShrink: 0,
              // Au premier plan quand elle est pointée : une bulle à demi
              // recouverte par sa voisine redevient entière. Au-dessus des
              // stickers, qui sont à 7.
              zIndex: pointee ? 8 : 6,
              cursor: onOperationClick ? "pointer" : "default",
              // ⚠️ Toujours réceptive au pointeur, même sans clic à offrir : c'est
              // le survol qui déplie son détail en haut à gauche. Conditionner
              // cette réceptivité au gestionnaire de clic aurait rendu l'encart
              // silencieusement muet chez un appelant qui n'en fournit pas.
              pointerEvents: "auto",
              /**
               * ⚠️ **Un anneau peint à l'extérieur, et surtout pas un
               * agrandissement.**
               *
               * Un `scale` au survol défait le travail d'ancrage : la position est
               * écrite au pixel dans la transformée, et l'agrandir remettrait les
               * bords du disque comme ceux de son contour de deux pixels entre deux
               * pixels de l'écran. La bulle deviendrait floue au moment précis où on
               * la regarde de près. Le `box-shadow`, lui, se peint hors de la boîte
               * sans rien déplacer ni redimensionner.
               */
              boxShadow: pointee ? `0 0 0 3px ${translucide(couleurOp(p.type, clair), "59")}` : "none",
              opacity: estompee ? 0.45 : 1,
              /**
               * ⚠️ **Jamais `transition: all` ici.** La position de la bulle est
               * une transformée réécrite à chaque déplacement de la vue : une
               * transition l'aurait animée, et les bulles se seraient mises à
               * glisser mollement derrière la courbe à chaque molette — soit
               * exactement le flottement qu'on vient de supprimer, mais en pire.
               * Seules l'opacité et l'ombre sont adoucies.
               */
              transition: "opacity 120ms ease, box-shadow 120ms ease",
            }}>
            <Pictogramme type={p.type} />
          </button>
        );
        })}
        <canvas ref={glowRef} style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          // Repris de la page graphique. Sans z-index, le canevas passait sous
          // ceux que la bibliothèque empile elle-même : le halo était peint
          // mais invisible. Le mode « screen » le fait rayonner sur la courbe
          // au lieu de la recouvrir d'un trait opaque.
          zIndex: 5, mixBlendMode: "screen",
        }} />
        {(state === "loading" && !points.length) || state === "error" ? (
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: FONT, fontSize: 12, color: clair ? "rgba(15,23,42,0.42)" : "rgba(248,249,252,0.35)", pointerEvents: "none",
          }}>
            {state !== "error"
              ? "Chargement…"
              : sansCours.length
                ? `Cours indisponible pour ${sansCours.join(", ")} — courbe masquée pour ne pas afficher une valeur fausse`
                : "Historique indisponible pour cette période"}
          </div>
        ) : null}
      </div>

      {/* Périodes sous le cadre, et non dedans : posées en surcouche au bas du
          tracé, elles recouvriraient les libellés de l'axe des dates — c'est le
          défaut mesuré qui avait déjà fait sortir la légende du cadre. */}
      <div style={{ paddingTop: 6, flexShrink: 0 }}>
        {barrePeriodes}
      </div>
    </div>
  );
}
