import { useId } from "react";

import { decalerClarte } from "@/lib/couleur";
import { CARTE_ACTIF } from "@/components/portfolio/CarteActif";

/**
 * Un compte, dessiné comme un dossier, avec un aperçu de ce qu'il contient.
 *
 * ⚠️ **Une seule découpe, et non une languette posée sur un rectangle.** C'est là que
 * se joue toute la ressemblance au concept : entre la languette et le plan du dossier,
 * le contour ne fait pas un angle droit mais une **double courbure** — un quart de tour
 * convexe puis un quart de tour concave. Deux éléments empilés donnaient un décrochement
 * net, qui se lit comme une barre collée au-dessus d'une carte. Le contour est donc un
 * `clip-path` d'un seul tenant, dans lequel le dégradé passe sans raccord.
 *
 * ⚠️ **La conséquence : les dimensions sont en pixels, pas en pourcentages.** Un
 * `path()` ne s'exprime qu'en unités absolues. La carte a donc une taille fixe — ce
 * qui tombe bien, puisqu'elle doit de toute façon être taillée pour contenir des cartes
 * d'actifs à leur vraie taille. Une grille en `1fr` étirerait la découpe hors de sa
 * boîte : les dossiers se posent en colonnes de `CARTE_COMPTE.largeur`.
 *
 * ⚠️ **L'ombre est un `drop-shadow`, pas un `box-shadow`.** Un `box-shadow` suit la
 * boîte, que le `clip-path` vient justement de tailler : l'ombre débordait dans
 * l'encoche. Le filtre, lui, suit la silhouette réelle.
 */

/**
 * Le rayon des angles : celui d'une carte d'actif, jamais un autre.
 *
 * ⚠️ **Repris et non recopié.** Les dossiers et les cartes se côtoient dans la même rangée,
 * et un dossier plus rond que ce qu'il range se voit immédiatement sans qu'on sache le
 * nommer. J'ai successivement posé vingt-deux puis vingt-six au jugé, en mesurant sur la
 * maquette — le bon nombre était sous la main depuis le début, et il ne peut plus dériver.
 */
const RAYON = CARTE_ACTIF.rayon;
/**
 * La languette : sa largeur, sa hauteur, et le rayon commun à ses deux courbes.
 *
 * ⚠️ **Les trois coins de l'encoche ont le rayon des angles du dossier.** Le coin haut-gauche
 * de la languette *est* un angle du dossier ; le coin haut-droit et le creux qui le suit
 * doivent l'être aussi, faute de quoi trois courbures se succèdent sur quinze centimètres et
 * l'œil voit un raccord bricolé sans savoir le nommer.
 *
 * ⚠️ **Le rayon n'impose pourtant pas la hauteur, et c'est ce que j'avais manqué.** Deux
 * *quarts* de cercle tangents descendent chacun de leur rayon, d'où une languette de deux
 * rayons — trente-six, jugée trop haute à l'usage. Mais rien n'oblige les arcs à être des
 * quarts : deux arcs **plus courts**, de même rayon, restent tangents entre eux et
 * horizontaux à leurs extrémités. La courbure ne change pas — c'est elle qu'on reconnaît —
 * seule la portion parcourue diminue.
 *
 * ⚠️ **C'est alors l'étalement qui se déduit, et il se calcule.** Les deux centres sont
 * distants de deux rayons, l'un à `rayon` sous le bord haut, l'autre à `rayon` au-dessus du
 * plan : Pythagore donne la course horizontale. Écrite à la main, elle aurait cessé d'être
 * juste au premier changement de hauteur, et la tangence se serait perdue sans prévenir —
 * exactement ce qui a produit, tour après tour, une marche, un toboggan, une rampe et un coin
 * pincé.
 */
const LANGUETTE = {
  largeur: 118,
  /** Réglable librement : les arcs s'accourcissent au lieu de changer de rayon. */
  hauteur: 26,
  /** Le rayon des trois courbes — celui des angles du dossier, donc celui des cartes. */
  rayon: RAYON,
  /** La course horizontale du raccord, imposée par les deux précédents. */
  get course() {
    const r = this.rayon;
    return Math.sqrt(4 * r * r - (this.hauteur - 2 * r) ** 2);
  },
};

/**
 * La taille du dossier, déduite de la carte d'actif qu'il doit contenir.
 *
 * ⚠️ **La bande dégagée n'est pas la hauteur d'aperçu.** La languette recouvre celle-ci
 * sur sa moitié gauche, c'est-à-dire précisément là où se trouvent le logo et le nom de
 * la carte : ce qui échappe vraiment au dossier vaut `apercu − languette.hauteur`. Réglé
 * à 54, il n'en dépassait que le pourcentage de poids, tout à droite — un aperçu qui
 * n'apprenait rien.
 *
 * ⚠️ **Et la hauteur totale n'est pas libre** : elle doit valoir celle d'une carte
 * d'actif, sans quoi la courbe au-dessus change de taille selon qu'on regarde les
 * dossiers ou leur contenu.
 */
/**
 * Le paquet de cartes dans le dossier : son retrait, le décalage entre deux cartes.
 *
 * ⚠️ **Le retrait vaut la même chose des deux côtés, et il ne le valait pas.** Mesuré sur les
 * trois dossiers de l'écran : seize pixels avant la première carte, douze après la dernière.
 * Ces deux marges se voient toutes les deux — la bande qui dépasse du plan laisse voir le
 * fond de la page de part et d'autre du paquet —, si bien que l'asymétrie était visible sans
 * être justifiée. Elle venait d'un total posé d'un bloc, cinquante-six, dont personne n'avait
 * redécoupé les termes.
 *
 * ⚠️ **Dix de chaque côté, réglé à l'œil et non déduit.** L'équilibrage s'était d'abord fait
 * à quatorze — la moitié des vingt-huit pixels que l'ancienne répartition dépensait —, ce qui
 * gardait les largeurs inchangées mais laissait le paquet trop au large. À dix, le dossier
 * serre ses cartes et perd huit pixels : 268, 282 et 296 pour une, deux ou trois cartes. La
 * largeur se recalcule d'elle-même, il n'y a rien d'autre à reprendre.
 */
const PAQUET = { retrait: 10, decalage: 14 };

/** Le nombre de cartes qu'un dossier laisse voir au plus. */
export const APERCUS_MAX = 3;

export const CARTE_COMPTE = {
  /**
   * La largeur d'un dossier qui laisse voir `n` cartes.
   *
   * ⚠️ **Elle s'ajuste au contenu, parce qu'un dossier de trésorerie n'en range qu'une.**
   * Fixée sur trois cartes, elle laissait quarante pixels de vide en haut à droite d'un
   * compte courant — mesuré — et l'on y voyait le fond de la page à travers la bande qui
   * dépasse du plan. La largeur suit donc le paquet : le retrait, les décalages, la carte,
   * et la marge de droite.
   *
   * ⚠️ **Bornée à une carte au minimum.** Un compte déclaré sans ligne n'en laisse voir
   * aucune ; sans plancher, le dossier se serait rétréci en dessous de ce que son propre
   * texte réclame.
   */
  largeurPour(cartes: number): number {
    const n = Math.min(APERCUS_MAX, Math.max(1, cartes));
    return 2 * PAQUET.retrait + (n - 1) * PAQUET.decalage + CARTE_ACTIF.largeur;
  },
  /**
   * La largeur maximale, celle d'un dossier plein.
   *
   * ⚠️ **C'est elle qui règle le pas du rail, et non la largeur d'un dossier donné.** Un pas
   * qui suivrait chaque dossier ferait atterrir le défilement au milieu du suivant dès que
   * deux dossiers n'ont pas le même contenu.
   */
  get largeur() { return this.largeurPour(APERCUS_MAX); },
  /**
   * Ce qu'on laisse voir des cartes rangées dedans, au-dessus du plan.
   *
   * ⚠️ Ni plus ni moins que la languette plus les 46 pixels de la ligne d'identité :
   * c'est le minimum pour que le logo et le nom échappent à la languette, et tout
   * excédent se prend sur la courbe, au-dessus.
   */
  apercu: LANGUETTE.hauteur + CARTE_ACTIF.identite,
  /**
   * Le plan de devant, celui qui porte le nom.
   *
   * ⚠️ **Ce n'est pas un réglage libre : c'est le complément.** Le dossier doit faire
   * exactement la hauteur d'une carte d'actif, faute de quoi la courbe au-dessus change
   * de taille selon qu'on regarde les dossiers ou leur contenu — un écran qui se réajuste
   * à chaque va-et-vient. Le plan prend donc ce que l'aperçu laisse. Mesuré, son contenu
   * en demande 123 ; en dessous, le nom viendrait toucher le pictogramme.
   */
  panneau: CARTE_ACTIF.hauteur - (LANGUETTE.hauteur + CARTE_ACTIF.identite),
  /**
   * La languette, publiée parce que ce qu'on range dedans doit savoir ce qu'elle cache.
   *
   * ⚠️ **La bande dégagée n'est pas rectangulaire, et c'est ce qui a piégé la carte
   * bancaire.** Une carte posée au-dessus du plan est visible sur toute sa largeur jusqu'à
   * `apercu − languette.hauteur`, soit 46 pixels — puis, de 46 à 68, uniquement à droite de
   * la languette. Dessinée comme un rectangle de 68 de haut, elle perdait son numéro sous
   * le coin gauche du plan. Publier la découpe évite de la redécouvrir à l'œil.
   */
  languette: LANGUETTE,
};
const HAUTEUR = CARTE_COMPTE.apercu + CARTE_COMPTE.panneau;

/**
 * Le contour du dossier, languette comprise.
 *
 * Décrit une fois pour toutes puisque la taille est fixe. Le sens de parcours est horaire.
 *
 * ⚠️ **Le raccord de la languette est une Bézier, plus deux arcs.** Deux quarts de cercle
 * accolés donnent bien un S, mais un S dont l'étalement vaut forcément le rayon : la pente
 * était donc à quarante-cinq degrés, sans moyen de l'adoucir sans changer aussi la hauteur de
 * la languette. La cubique part verticale — elle prolonge l'arc du coin sans cassure — et
 * arrive horizontale sur le plan, avec la longueur qu'on lui donne.
 */
const contourDe = (l: number) => {
  const h = CARTE_COMPTE.panneau + LANGUETTE.hauteur;
  const { hauteur: hl, largeur: ll, rayon: r, course } = LANGUETTE;
  return [
    `M ${RAYON},0`,
    `L ${ll},0`,
    // Le bombé, jusqu'au point où les deux arcs se touchent : à mi-course, à mi-hauteur.
    `A ${r},${r} 0 0 1 ${ll + course / 2},${hl / 2}`,
    // Le creux, de même rayon, qui reprend exactement la tangente laissée par le bombé.
    `A ${r},${r} 0 0 0 ${ll + course},${hl}`,
    `L ${l - RAYON},${hl}`,
    `A ${RAYON},${RAYON} 0 0 1 ${l},${hl + RAYON}`,
    `L ${l},${h - RAYON}`,
    `A ${RAYON},${RAYON} 0 0 1 ${l - RAYON},${h}`,
    `L ${RAYON},${h}`,
    `A ${RAYON},${RAYON} 0 0 1 0,${h - RAYON}`,
    `L 0,${RAYON}`,
    `A ${RAYON},${RAYON} 0 0 1 ${RAYON},0`,
    "Z",
  ].join(" ");
};

/**
 * Les contours, calculés une fois par largeur possible.
 *
 * ⚠️ **Trois seulement, donc on les garde plutôt que de les recalculer à chaque rendu.** Le
 * tracé se refait à chaque image sinon, et il change de chaîne à chaque fois — ce qui suffit
 * à faire recalculer la découpe au navigateur pour rien.
 */
const CONTOURS = new Map<number, string>();
const contourPour = (l: number) => {
  const connu = CONTOURS.get(l);
  if (connu) return connu;
  const trace = contourDe(l);
  CONTOURS.set(l, trace);
  return trace;
};

export default function CarteCompte({
  nom, compte, couleur, icone, nombre, apercu, sansPastille, onClick,
}: {
  nom: string;
  /**
   * Ce que la carte annonce sous le nom — « 4 actifs », ou le montant d'un compte de
   * trésorerie.
   *
   * ⚠️ **Un nœud et non une chaîne, parce que les deux ne pèsent pas pareil.** « 3 actifs »
   * est une mention ; sur un livret, le montant *est* l'information de la carte, et il doit
   * s'afficher en conséquence. Contraint au texte, il aurait fallu un second champ, donc
   * deux mises en page à tenir à jour pour une seule ligne.
   */
  compte: React.ReactNode;
  couleur: string;
  icone: React.ReactNode;
  /** Le nombre porté par la pastille de droite, quand il y a lieu. */
  nombre?: number;
  /**
   * Les cartes rangées dans le dossier, la première devant.
   *
   * ⚠️ **De vraies cartes d'actifs, à leur taille.** Des vignettes réduites auraient
   * demandé une seconde mise en page à tenir à jour, et n'auraient plus rien annoncé
   * de fidèle. Le dossier n'en laisse voir que le haut — le logo et le nom — ce qui
   * suffit à savoir ce qu'il contient sans l'ouvrir.
   */
  apercu?: React.ReactNode[];
  /**
   * ⚠️ **Trois états, pas deux.** La pastille est pleine quand le dossier porte quelque
   * chose et creuse quand il est vide — mais « creuse » veut dire *pas encore*, et
   * compter les lignes d'un livret n'a aucun sens, ni maintenant ni plus tard. Sans ce
   * troisième cas, un compte de trésorerie affichait un cercle vide qui promettait un
   * remplissage.
   */
  sansPastille?: boolean;
  onClick?: () => void;
}) {
  /** Un identifiant par instance : deux dossiers voisins partageraient sinon le dégradé. */
  const idBord = useId().replace(/:/g, "");
  /** La largeur suit ce que le dossier laisse voir, jamais moins d'une carte. */
  const largeur = CARTE_COMPTE.largeurPour((apercu ?? []).length);
  const CONTOUR = contourPour(largeur);
  const tresClair = decalerClarte(couleur, 0.19);
  const clair = decalerClarte(couleur, 0.10);
  const sombre = decalerClarte(couleur, -0.16);
  const cartes = apercu ?? [];

  return (
    <button
      type="button"
      className="novac-dossier"
      onClick={onClick}
      /* ⚠️ **Le personnage se penche sur ce qu'on survole, et ne dit rien.** Un survol
         change au rythme du curseur : c'est le bon registre pour une mimique, qu'on
         remarque à peine, et le mauvais pour un mot, qui clignoterait. Mesuré une fois
         déjà, sur « Je regarde ». L'attribut suffit — aucun abonnement, un seul écouteur
         sur le document. Voir `AvatarContext`. */
      data-avatar="curieux"
      // ⚠️ Pas d'`aria-expanded` : le dossier ne se déplie pas sous lui-même, il
      // remplace la vue. Annoncer un dépliement ferait attendre un contenu juste en
      // dessous, alors que c'est toute la zone qui change.
      aria-label={`Ouvrir ${nom}, ${compte}`}
      style={{
        position: "relative", width: largeur, height: HAUTEUR,
        padding: 0, border: 0, background: "none", cursor: "pointer",
        textAlign: "left", flexShrink: 0,
      }}
    >
      {/**
        * L'ombre du dossier, dessinée **avant** les cartes.
        *
        * ⚠️ Portée par le plan lui-même, elle se peignait par-dessus l'aperçu : un halo
        * de la couleur du compte, étalé sur les cartes, qui les faisait paraître
        * translucides. L'ordre de peinture suit l'ordre du document, et un filtre
        * s'applique après le contenu de son élément — il fallait donc séparer les deux.
        * Ce double, de forme identique, est entièrement recouvert par le vrai plan.
        */}
      <div aria-hidden="true" style={{
        position: "absolute", left: 0, top: CARTE_COMPTE.apercu - LANGUETTE.hauteur,
        width: largeur, height: CARTE_COMPTE.panneau + LANGUETTE.hauteur,
        clipPath: `path("${CONTOUR}")`, background: couleur,
        /**
         * ⚠️ **Le halo est de la couleur du dossier, et c'est lui qui le décolle du fond.**
         * Sur la maquette, chaque dossier pose une lueur de sa propre teinte sous lui : sans
         * elle, il reste un aplat collé à la page. Trois ombres empilées plutôt qu'une —
         * une lueur large et diffuse qui porte la couleur, une ombre courte qui donne
         * l'épaisseur, un contact serré qui pose l'objet. Une seule ombre ne peut pas faire
         * les trois : large elle flotte, courte elle ne rayonne pas.
         *
         * ⚠️ **`drop-shadow` et non `box-shadow`.** Le second suit la boîte, que le
         * `clip-path` vient justement de tailler : l'ombre débordait dans l'encoche. Le
         * filtre, lui, suit la silhouette réelle.
         *
         * ⚠️ **La portée de l'ombre est bornée par la marge de la page, et non l'inverse.**
         * Elle valait 16 de décalage et 34 de flou, soit cinquante pixels sous la
         * silhouette. Or un rail tranche à l'horizontale, et la colonne qui le contient
         * aussi : lui ménager cinquante pixels revenait à les prendre à la courbe, seule à
         * porter un `flex: 1` — la courbe a visiblement rétréci, et c'était le bon reproche.
         * L'ombre tient donc désormais dans `MARGE`, la marge que la page applique déjà sur
         * ses côtés. Ce qui dépasse encore — deux pixels — y est à moins de deux pour cent
         * d'opacité, là où l'ancienne y était près de son maximum : c'est cette coupe-là,
         * en pleine force, qui donnait le trait net sous le dossier.
         */
        filter: `drop-shadow(0 2px 9px ${couleur}59)`
          + ` drop-shadow(0 1px 3px ${couleur}3D)`
          + ` drop-shadow(0 1px 2px rgba(4,10,24,0.38))`,
      }} />

      {/* Le paquet de cartes, décalé vers la droite.
          ⚠️ Rendu à l'envers : la première du tableau doit passer *devant* les autres,
          et rien n'ordonne l'empilement ici sinon l'ordre du document.

          ⚠️ Décalage latéral et non vertical : les cartes sont alignées en haut pour que
          leur ligne d'identité tombe dans la bande dégagée, celle qui échappe à la
          languette. Décalées vers le bas, elles auraient enfoncé le logo derrière elle.
          Ce sont donc leurs tranches de droite qui dépassent — et c'est ce dépassement,
          pas un compteur, qui dit qu'il y en a plusieurs. */}
      {cartes.map((c, i) => i).reverse().map(i => (
        <div key={i} aria-hidden="true" className="novac-dossier-paquet" style={{
          position: "absolute", left: PAQUET.retrait + i * PAQUET.decalage, top: 0,
          pointerEvents: "none",
        }}>
          {cartes[i]}
        </div>
      ))}

      {/* Le plan du dossier, par-dessus les cartes. */}
      <div style={{
        position: "absolute", left: 0, top: CARTE_COMPTE.apercu - LANGUETTE.hauteur,
        width: largeur, height: CARTE_COMPTE.panneau + LANGUETTE.hauteur,
      }}>
        <div style={{
          width: "100%", height: "100%",
          clipPath: `path("${CONTOUR}")`,
          /**
           * ⚠️ **Le dégradé s'étire davantage, parce qu'un aplat ne se lit pas comme un
           * objet.** Il allait du clair au sombre en passant par la teinte à mi-course ;
           * comparé à la maquette, il manquait de course — le dossier paraissait plat là où
           * le modèle a une surface qui tourne. Les deux extrêmes s'écartent donc, et le
           * point de bascule remonte : la lumière frappe le haut-gauche sur près de la
           * moitié du trajet, puis la surface s'enfonce.
           */
          /**
           * ⚠️ **Deux couches, parce qu'un dégradé linéaire ne fait pas une surface.** Il
           * décrit une pente régulière : la couleur y varie du même pas d'un bout à l'autre,
           * et l'œil lit un aplat incliné plutôt qu'un objet éclairé. Sur la maquette, la
           * lumière est **localisée** — elle frappe le haut-gauche et s'éteint en s'en
           * éloignant, ce qui est un dégradé radial, pas linéaire. On garde donc le linéaire
           * pour la teinte de fond, qui doit tourner du clair au sombre, et l'on pose
           * par-dessus une tache lumineuse qui donne le relief.
           *
           * ⚠️ **La tache est blanche, jamais teintée.** Le dossier prend l'une des onze
           * couleurs de l'épargnant : une lumière colorée aurait été juste sur une et fausse
           * sur les dix autres. Du blanc à quatorze pour cent éclaircit n'importe quelle
           * teinte sans en introduire une seconde.
           */
          /**
           * ⚠️ **La lumière rentre vers l'intérieur, sinon elle mange le liseré.** Centrée
           * sur le coin haut-gauche, elle éclaircissait le plan exactement là où passe
           * l'arête blanche : les deux se confondaient, et le liseré paraissait absent sur
           * toute la languette. Deux effets blancs superposés ne s'additionnent pas, ils
           * s'annulent — celui du dessous doit laisser le bord tranquille.
           */
          background: `radial-gradient(88% 78% at 26% 12%,`
            + ` rgba(255,255,255,0.11) 0%, rgba(255,255,255,0) 62%),`
            + ` linear-gradient(148deg, ${tresClair} 0%, ${clair} 26%,`
            + ` ${couleur} 58%, ${sombre} 100%)`,
        }}>
          <div style={{
            position: "relative", height: "100%",
            /**
             * ⚠️ **Les marges viennent de la maquette, où le plan respire davantage.**
             * Mesuré au même facteur 2,3 : le pictogramme s'y tient à vingt-et-un pixels du
             * bord et la dernière ligne à vingt-quatre du bas, contre seize et douze ici. Le
             * texte y gagne l'air qui le distinguait d'un bloc collé au coin.
             */
            padding: `${LANGUETTE.hauteur + 10}px 18px 18px`,
            display: "flex", flexDirection: "column", justifyContent: "space-between",
          }}>
            {/* L'identité du dossier : le repère de l'établissement, puis son nom. */}
            <div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <span style={{
                width: 36, height: 36, borderRadius: 11, flexShrink: 0,
                background: "rgba(255,255,255,0.94)", color: sombre,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {icone}
              </span>
              {/* La pastille de droite : pleine quand le dossier porte quelque chose,
                  creuse quand il est vide — comme la coche de la référence. */}
              {!sansPastille && (
                <span style={{
                  width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: nombre ? "rgba(255,255,255,0.94)" : "transparent",
                  border: nombre ? "none" : "1.5px solid rgba(255,255,255,0.55)",
                  color: sombre, fontSize: 12.5, fontWeight: 700,
                }}>
                  {nombre ? nombre : ""}
                </span>
              )}
            </div>
              {/**
                * ⚠️ **Le nom passe sous le pictogramme, et rapetisse.** Il partageait le bas
                * de la carte avec le montant, deux lignes de poids voisin qui se disputaient
                * la lecture. En tête, sous le repère de l'établissement, il devient ce qu'il
                * est — une étiquette — et laisse le bas au seul chiffre qui compte.
                */}
              <div style={{
                marginTop: 9, fontSize: 15, fontWeight: 650, color: "rgba(255,255,255,0.95)",
                lineHeight: 1.2, letterSpacing: "-0.005em",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {nom}
              </div>
            </div>

            <div>
              <div style={{
                display: "flex", alignItems: "flex-end", justifyContent: "space-between",
              }}>
                <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.82)", minWidth: 0 }}>
                  {compte}
                </div>
                {/* Le chevron pointe à droite, comme sur la référence, et ne pivote
                    plus : il ne déplie rien sous la carte, il mène dans le dossier. */}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke="rgba(255,255,255,0.9)" strokeWidth={2.4} strokeLinecap="round"
                  strokeLinejoin="round" aria-hidden="true">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/**
        * Le liseré du pourtour.
        *
        * ⚠️ **Un tracé SVG, parce qu'aucun `border` ne suit une découpe.** La silhouette du
        * dossier vient d'un `clip-path` : un `border` en épouserait la *boîte*, donc un
        * rectangle, et traverserait l'encoche de part en part. Le même chemin, tracé sans
        * remplissage, colle exactement au bord — encoche et pente comprises.
        *
        * ⚠️ **Il est de la couleur du dossier, éclaircie — pas blanc.** Trois versions blanches ont
        * échoué avant de comprendre la demande. Un blanc posé sur une teinte ne décrit pas une
        * arête, il décrit un reflet : il paraît juste sur un dossier sombre et se dissout sur
        * un clair, et sur aucun il ne donne l'impression d'un bord *taillé dans la matière*.
        * Éclaircir la teinte du dossier, en revanche, fait toujours la même chose quelle que
        * soit la couleur choisie — le bord reste de la famille, et l'objet paraît épais plutôt
        * que verni.
        *
        * ⚠️ **Il faut le poser franchement, et c'est une mesure qui l'a tranché.** Je l'ai cru
        * absent alors qu'il était peint : repassé en rouge de quatre pixels le temps d'un
        * essai, il est apparu net et exactement sur la silhouette. Ce n'était donc ni un
        * problème d'ordre de rendu ni de découpe, mais d'intensité — un blanc qui descend à
        * vingt-six pour cent sur un pixel et demi ne se distingue pas d'un plan dont le
        * dégradé éclaircit déjà le haut. Deux pixels, et rien sous trente-huit pour cent.
        *
        * ⚠️ **Blanc sur tout le tour, plus vif en haut.** Deux versions ont raté avant :
        * l'une s'éteignait en transparence vers le bas, l'autre virait au noir. Toutes deux
        * partaient du même raisonnement — imiter une lumière rasante — et toutes deux
        * donnaient un liseré qu'on ne voyait pas, signalé comme « inexistant ». Sur la
        * maquette, l'arête fait le tour complet : plus vive en tête, jamais absente ailleurs.
        * Le dégradé ne descend donc plus sous vingt-six pour cent.
        *
        * ⚠️ **Il se peint en dernier, après le plan.** Placé avant, il était recouvert par
        * le plan qu'il est censé cerner — invisible, et je l'ai cru absent avant de
        * regarder l'ordre de rendu.
        *
        * ⚠️ **Un demi-pixel de retrait, et il se calcule par axe.** Un trait centré sur le
        * chemin déborde de moitié hors de la silhouette, là où le SVG et le `clip-path` du
        * plan l'ont déjà coupé. Le ramener à l'intérieur demande de rentrer le tracé d'un
        * demi-pixel **des quatre côtés** : un `translate` de 0,5 s'occupe du haut et de la
        * gauche, une échelle du bas et de la droite. Une échelle *unique* ne peut pas faire
        * les deux, puisque le dossier n'est pas carré — réglée sur la largeur (0,9967), elle
        * envoyait le bord bas à 150,005 sur un SVG haut de 150. Le trait y était donc centré
        * **sur** la limite du dessin, coupé de moitié, et signalé à l'écran comme « encore un
        * peu coupé ». D'où deux facteurs, `(côté − 1) / côté`, exacts pour les trois largeurs
        * possibles. L'anisotropie qu'ils introduisent vaut trois millièmes : le rayon de 18
        * devient 17,94 dans un sens et 17,88 dans l'autre.
        */}
      <svg width={largeur} height={CARTE_COMPTE.panneau + LANGUETTE.hauteur}
        aria-hidden="true" style={{
          position: "absolute", left: 0, top: CARTE_COMPTE.apercu - LANGUETTE.hauteur,
          pointerEvents: "none",
        }}>
        <defs>
          <linearGradient id={`bord-${idBord}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={decalerClarte(couleur, 0.32)} />
            <stop offset="34%" stopColor={decalerClarte(couleur, 0.22)} />
            <stop offset="100%" stopColor={decalerClarte(couleur, 0.12)} />
          </linearGradient>
        </defs>
        {/* ⚠️ Un pixel, comme l'arête d'une carte bancaire : deux dossiers et une carte
            voisins doivent porter le même trait, sinon le plus épais paraît plus proche. */}
        <path d={CONTOUR} fill="none" stroke={`url(#bord-${idBord})`} strokeWidth={1}
          transform={`translate(0.5, 0.5) scale(${(largeur - 1) / largeur}, ${
            (CARTE_COMPTE.panneau + LANGUETTE.hauteur - 1) / (CARTE_COMPTE.panneau + LANGUETTE.hauteur)
          })`} />
      </svg>
    </button>
  );
}
