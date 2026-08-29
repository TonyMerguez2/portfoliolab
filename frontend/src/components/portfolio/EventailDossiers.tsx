"use client";
import { useId, useState } from "react";

import { COULEURS_AVATAR } from "@/lib/avatarCouleur";
import { silhouetteDossier } from "@/components/portfolio/CarteCompte";

/**
 * L'éventail de dossiers qui coiffe la déclaration d'un compte.
 *
 * ⚠️ **Extrait du panneau de création, qui le gardait pour lui.** Il y vivait comme décor de
 * la deuxième étape ; mais cette étape *est* le formulaire de déclaration d'un compte, celui
 * que le tableau de bord ouvre aussi de son côté — et qui n'avait donc pas d'illustration.
 * Deux vues du même écran, dont une amputée de son en-tête. Signalé à l'usage.
 *
 * ⚠️ **Ce n'est pas un décor, c'est l'aperçu.** Le dossier du milieu porte la couleur qu'on
 * est en train de choisir, en grand et d'aplomb ; les autres sont tirés au hasard et
 * enfoncés. C'est aussi ce qui autorise la bande de couleurs sans marque de sélection : elle
 * n'a pas à désigner la teinte retenue, puisque le centre la montre juste au-dessus.
 */

/**
 * Ce que les avatars de décor montrent.
 *
 * ⚠️ **Tiré au hasard, et c'est possible parce que rien de ceci n'est rendu côté serveur.**
 * Le panneau n'existe qu'après un clic : sa première passe est déjà cliente. Un tirage dans
 * un composant rendu par le serveur donnerait deux dessins différents de part et d'autre et
 * React signalerait la divergence d'hydratation — c'est le piège habituel de `Math.random`
 * dans un initialiseur d'état, et il ne se tend pas ici.
 *
 * ⚠️ **Sans répétition tant que la source en a, puis on repart d'une source entière.** La
 * version d'avant s'arrêtait quand la réserve était vide, et rendait donc **moins d'éléments
 * que demandé** — une place aurait reçu `undefined`, sans que rien ne le signale. Elle ne tire
 * plus que des couleurs, dont il y a dix-neuf pour quatre places ; la garde reste, parce que
 * c'est le genre de défaut qui ne se voit qu'une fois posé à l'écran.
 */
export function tirage<T>(source: readonly T[], combien: number): T[] {
  const pris: T[] = [];
  let restant: T[] = [];
  while (pris.length < combien) {
    if (!restant.length) restant = source.slice();
    pris.push(restant.splice(Math.floor(Math.random() * restant.length), 1)[0]);
  }
  return pris;
}

/**
 * L'éventail des dossiers.
 *
 * ⚠️ **Des dossiers dresses, pas poses sur un arc.** Les deux versions precedentes les
 * faisaient pivoter autour d'un point lointain, si bien qu'ils suivaient une courbe et que
 * l'oeil lisait l'arche avant les objets. Sur la reference, les dossiers sont **debout, cote
 * a cote, pieds sur une meme ligne**, et l'inclinaison n'est qu'un basculement de chacun sur
 * sa base — le geste d'une rangee de chemises qu'on ecarte, pas d'un jeu de cartes qu'on
 * etale.
 *
 * ⚠️ **La ligne de pied est ce qui tient l'image.** C'est elle qui dit qu'ils reposent sur
 * quelque chose ; sans elle il ne reste que des rectangles flottants. D'ou l'origine des
 * rotations au **milieu du pied** de chaque dossier, et non a son centre : un dossier qui
 * bascule autour de son centre decolle d'un cote.
 *
 * ⚠️ **Grands, et bien plus qu'avant.** Le dossier central passe de 76 a 176 pixels de large.
 * Une illustration reduite a des vignettes de quarante pixels ne montre rien de la forme —
 * ni la languette, ni les angles —, et c'est precisement la forme qui doit etre reconnue.
 *
 * ⚠️ **L'eloignement se dit par la taille et l'assombrissement, jamais par l'inclinaison
 * seule.** De 176 pixels et pleine couleur au milieu, a 104 et 72 % de voile au bout. Ce
 * voile n'est pas une transparence : voir `Dossier`, ou il est explique pourquoi un dossier
 * du fond doit etre sombre et non translucide.
 *
 * ⚠️ **L'eventail doit tenir dans la carte, et un dossier incline est plus large qu'il n'en a
 * l'air.** Sa largeur apparente vaut `l·cos a + h·sin a` : les 104 pixels du dernier en font
 * 116 une fois bascule de 17 degres. Un premier reglage a 116 de large ecarte de 140 occupait
 * 455 pixels pour 408 disponibles — mesure, et les deux bouts se faisaient couper par le
 * cadre. Les abscisses se calent donc sur la largeur *tournee*, pas sur la largeur nominale.
 */
const EVENTAIL = [
  { x: -118, angle: -17, taille: 104, recul: 0.72, retard: 340 },
  { x: 118, angle: 17, taille: 104, recul: 0.72, retard: 300 },
  { x: -76, angle: -8, taille: 136, recul: 0.44, retard: 160 },
  { x: 76, angle: 8, taille: 136, recul: 0.44, retard: 120 },
];

/** Le dossier qu'on declare : au milieu, d'aplomb, devant. */
const DOSSIER_CENTRE = 176;

/**
 * La hauteur du cadre de l'illustration, et la ligne sur laquelle les dossiers posent.
 *
 * ⚠️ **148 et non la hauteur d'une grappe de têtes.** Des dossiers dressés de 176 de large
 * font 98 de haut à eux seuls, et leurs voisins basculés dépassent encore ; la grappe
 * d'avatars, elle, tient dans cent. Une hauteur unique aurait rogné l'un ou vidé l'autre.
 *
 * ⚠️ **Trente-six pixels sous la ligne de pied, parce que le fondu du reflet meurt à
 * trente-quatre.** Mesuré, pas estimé.
 */
export const HAUTEUR_EVENTAIL = 148;
const LIGNE_DE_PIED = 112;

/**
 * Le dossier de compte, tel qu'il est dessiné sur le tableau de bord.
 *
 * ⚠️ **Le tracé vient de `CarteCompte`, il n'est pas réécrit ici.** J'en avais d'abord fait
 * une version approchée — languette de proportions choisies à l'œil, raccord simplifié à deux
 * quarts de cercle — au motif que la vraie géométrie est commandée par ce que le dossier
 * range et ne se réduirait pas à quarante pixels. C'était un faux problème : un contour SVG
 * ne se réduit pas en changeant ses nombres, il se réduit par son `viewBox`. Demandé à
 * l'usage que ce soit exactement le dossier du tableau de bord.
 *
 * ⚠️ **Rien n'est donc à tenir en double.** Le rayon des angles, la hauteur de la languette,
 * la course de son raccord — ce raccord que `CarteCompte` a mis quatre essais à obtenir, « une
 * marche, un toboggan, une rampe et un coin pincé » — arrivent ici tels quels et suivront
 * leurs futurs réglages sans qu'on y pense.
 *
 * ⚠️ **Un seul aperçu, donc la largeur d'un dossier de trésorerie.** Elle s'ajuste au nombre
 * de cartes rangées ; l'illustration ne range rien, elle prend donc la plus étroite, qui est
 * aussi la plus proche d'un dossier vide — ce qu'un compte qu'on vient de déclarer est.
 */
const DOSSIER = silhouetteDossier(1);

/**
 * La hauteur d'un dossier large de `taille`.
 *
 * ⚠️ **Un dossier n'est pas carré : 268 sur 150, soit 56 % de sa largeur.** C'est ce qui a
 * fait abandonner la grappe pour ces vignettes-là. Réglée pour des têtes rondes, elle les
 * posait par le bord haut de cases carrées : chaque dossier flottait au-dessus d'un vide,
 * différent pour chacun puisque chacun a sa taille. Recentrer verticalement corrigeait
 * l'aplomb, pas le fond — huit rectangles parallèles restent une rangée, pas une pile.
 * L'éventail répond aux deux d'un coup, puisqu'il place par le milieu et incline.
 */
const hauteurDossier = (taille: number) =>
  Math.round(taille * DOSSIER.hauteur / DOSSIER.largeur);

/**
 * Un dossier, avec son lustre et son reflet.
 *
 * ⚠️ **L'ombre portée n'est pas un ornement, c'est ce qui sépare.** Des dossiers qui se
 * recouvrent sans elle se soudent en une bande continue : deux teintes voisines n'ont aucun
 * bord entre elles, et l'on ne compte plus les objets. Un liseré aurait fait le même travail,
 * mais il faudrait le teinter du fond de la carte — donc le refaire à chaque thème — là où
 * une ombre creuse indépendamment de ce qu'il y a dessous.
 *
 * ⚠️ **Portée par un filtre et non par une `box-shadow`.** `drop-shadow` suit la
 * **silhouette** du tracé, languette comprise ; une ombre de boîte aurait dessiné un
 * rectangle, c'est-à-dire précisément la forme qu'on a pris soin de ne pas avoir.
 *
 * ⚠️ **Le lustre est un second tracé, pas un dégradé de fond.** Le même chemin repeint d'un
 * dégradé de blanc, du coin haut-gauche vers le milieu : il épouse donc la languette et les
 * angles, alors qu'un fond dégradé aurait éclairé un rectangle dont on aurait vu les coins.
 * C'est ce qui donne à la référence ses dossiers *pleins* plutôt que *coloriés*.
 *
 * ⚠️ **Il s'éteint aux deux tiers.** Poussé jusqu'au bas, il éclaircit toute la surface et la
 * couleur choisie n'est plus celle qu'on voit — le défaut exact qu'on a reproché aux
 * pastilles bombées. Ici il ne touche qu'un coin.
 *
 * ⚠️ **Le reflet est le même dessin retourné, effacé par un masque.** Aucun second tracé à
 * tenir : `scaleY(-1)` et un dégradé d'opacité suffisent. Il commence à 18 % et meurt en un
 * tiers de sa hauteur — au-delà, on lit une seconde rangée de dossiers à l'envers.
 */
function Dossier({
  taille, couleur, recul = 0,
}: { taille: number; couleur: string; recul?: number }) {
  const marque = useId().replace(/:/g, "");
  const hauteur = hauteurDossier(taille);
  const dessin = (
    <svg width={taille} height={hauteur}
      viewBox={`0 0 ${DOSSIER.largeur} ${DOSSIER.hauteur}`}
      aria-hidden="true" style={{ display: "block" }}>
      <defs>
        <linearGradient id={`lustre-${marque}`} x1="0" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.26" />
          <stop offset="0.34" stopColor="#FFFFFF" stopOpacity="0.10" />
          <stop offset="0.66" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={DOSSIER.d} fill={couleur} className="nv-teinte" />
      <path d={DOSSIER.d} fill={`url(#lustre-${marque})`} />
      {/**
        * ⚠️ **Le recul est un voile de la couleur du fond, pas une baisse d'opacité.** Les
        * dossiers d'arrière-plan étaient effacés par `opacity` sur leur enveloppe : ils
        * devenaient donc **transparents**, et l'on voyait au travers ceux qu'ils recouvraient
        * et la carte derrière. Relevé à l'usage. Sur la référence, les dossiers du fond ne
        * sont pas translucides — ils sont **sombres**, et parfaitement opaques.
        *
        * ⚠️ **Peint par-dessus, donc opaque vis-à-vis de ce qu'il y a derrière.** Le voile ne
        * s'applique qu'au dossier lui-même : il l'enfonce dans le noir sans rien laisser
        * passer. C'est la différence entre un objet dans l'ombre et un objet en verre.
        *
        * ⚠️ **`--nv-fond-rvb` plutôt qu'un noir en dur.** En thème clair le fond est presque
        * blanc : un voile noir y aurait sali les dossiers au lieu de les éloigner. Le voile
        * prend donc la couleur du fond, quel qu'il soit, et l'éloignement se lit toujours
        * comme un enfoncement dans la page.
        */}
      {recul > 0 && (
        <path d={DOSSIER.d} fill={`rgba(var(--nv-fond-rvb), ${recul})`} />
      )}
    </svg>
  );
  return (
    <div style={{ filter: "drop-shadow(0 2px 5px rgba(0,0,0,0.55))" }}>
      {dessin}
      <div aria-hidden="true" style={{
        transform: "scaleY(-1)", transformOrigin: "top",
        opacity: 0.18, pointerEvents: "none",
        maskImage: "linear-gradient(to top, transparent 0%, #000 34%)",
        WebkitMaskImage: "linear-gradient(to top, transparent 0%, #000 34%)",
      }}>{dessin}</div>
    </div>
  );
}

/**
 * Les couleurs des dossiers du fond.
 *
 * ⚠️ **Tirées une fois, et l'appelant peut vouloir les tenir lui-même.** Le panneau de
 * création démonte l'illustration en passant à la troisième étape et la remonte si l'on
 * revient : un tirage interne rebattrait les couleurs à chaque aller-retour, alors qu'on a
 * demandé que « les avatars ne soient pas modifiables derrière ». Il passe donc son propre
 * tirage, figé pour la durée du panneau. Une fenêtre qui ne montre l'éventail qu'une fois —
 * la déclaration d'un compte depuis le tableau de bord — laisse le défaut faire.
 */
export function couleursDeFond(): string[] {
  return tirage(COULEURS_AVATAR, EVENTAIL.length).map(c => c.hex);
}

export default function EventailDossiers({
  couleur, couleursFond,
}: {
  /** La teinte du dossier central : celle qu'on est en train de choisir. */
  couleur: string;
  /** Les teintes du fond, quand l'appelant tient à ce qu'elles survivent à un démontage. */
  couleursFond?: string[];
}) {
  const [tireesIci] = useState(couleursDeFond);
  const fond = couleursFond ?? tireesIci;
  return (
    /**
     * ⚠️ `flexShrink: 0` : la carte de `FenetreModale` est une colonne flexible plafonnée à
     * 90 % de la hauteur d'écran. Sans cela, un contenu qui grandit **rétrécit les enfants à
     * hauteur fixe** — l'illustration se serait tassée en une bande.
     *
     * ⚠️ **`overflow: hidden`, et c'est le reflet qui l'exige.** Un reflet est le dessin
     * retourné : sa boîte fait la hauteur entière du dossier même si le masque l'efface bien
     * avant. Sans coupe, le bloc descendait à 260 pixels pour une image qui en montre 148.
     */
    <div aria-hidden="true" style={{
      position: "relative", flexShrink: 0, marginBottom: 2,
      height: HAUTEUR_EVENTAIL, overflow: "hidden",
    }}>
      {/**
        * ⚠️ **Le pied sur la ligne, l'origine de la rotation dessous.** Chaque dossier est
        * posé par son bas — `top` calculé depuis la ligne de pied — et bascule autour du
        * milieu de ce bas. Ancré au centre, comme le veut le défaut, il décollerait d'un côté
        * et s'enfoncerait de l'autre : la rangée perdrait précisément le sol qui la tient.
        *
        * ⚠️ **Les deux transformations se lisent de droite à gauche.** On centre d'abord la
        * boîte sur son abscisse, on la décale de `x`, puis on la fait basculer. Dans l'autre
        * sens, la rotation emporterait le décalage et les dossiers partiraient en orbite.
        */}
      {EVENTAIL.map((place, i) => (
        <div key={i} style={{
          position: "absolute", left: "50%",
          top: LIGNE_DE_PIED - hauteurDossier(place.taille),
          transformOrigin: "50% 100%",
          transform: `rotate(${place.angle}deg) translateX(${place.x}px) translateX(-50%)`,
        }}>
          <div className="nv-arrivee-tete" style={{ animationDelay: `${place.retard}ms` }}>
            <Dossier taille={place.taille} couleur={fond[i]} recul={place.recul} />
          </div>
        </div>
      ))}
      {/* Sans rotation : c'est le seul dossier d'aplomb, et c'est ce qui le désigne comme
          celui qu'on est en train de déclarer. Il arrive le premier, le groupe se forme
          autour de lui. */}
      <div style={{
        position: "absolute", zIndex: 1, left: "50%", transform: "translateX(-50%)",
        top: LIGNE_DE_PIED - hauteurDossier(DOSSIER_CENTRE),
      }}>
        <div className="nv-arrivee-tete">
          <Dossier taille={DOSSIER_CENTRE} couleur={couleur} />
        </div>
      </div>
    </div>
  );
}
