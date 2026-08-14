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
 * La languette : sa hauteur au-dessus du plan, sa largeur, et la forme de son raccord.
 *
 * ⚠️ **`pente` est la longueur horizontale du raccord, et elle ne se déduit plus de la
 * hauteur.** Le raccord était fait de deux quarts de cercle de même rayon, ce qui l'obligeait
 * à valoir exactement la moitié de la hauteur de la languette : onze pixels d'étalement pour
 * vingt-deux de descente, soit une pente à quarante-cinq degrés. Sur la maquette elle est
 * bien plus douce, mais pas au point où je l'ai d'abord poussée : une cubique de trente-deux
 * pixels après un coin de neuf faisait quarante-et-un pixels de transition, et le bord se
 * couchait à l'horizontale bien avant d'atteindre le plan — un toboggan plutôt qu'une
 * languette. Signalé à l'usage. Mesurée sur la maquette, la transition entière fait une
 * trentaine de pixels : douze de coin bombé, vingt de raccord.
 *
 * ⚠️ **Une Bézier plutôt qu'un second arc, malgré tout.** Deux quarts de cercle accolés
 * obligent l'étalement à valoir le rayon, donc la moitié de la hauteur de la languette : la
 * proportion des deux courbures cesse d'être réglable. La cubique laisse choisir le coin et
 * le raccord séparément.
 */
const LANGUETTE = { hauteur: 22, largeur: 118, courbure: 12, pente: 20 };

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
export const CARTE_COMPTE = {
  /** De quoi loger une carte d'actif, le décalage du paquet et une marge à droite. */
  largeur: CARTE_ACTIF.largeur + 56,
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
const CONTOUR = (() => {
  const l = CARTE_COMPTE.largeur;
  const h = CARTE_COMPTE.panneau + LANGUETTE.hauteur;
  const { hauteur: hl, largeur: ll, courbure: c, pente } = LANGUETTE;
  return [
    `M ${RAYON},0`,
    `L ${ll - c},0`,
    `A ${c},${c} 0 0 1 ${ll},${c}`,          // le coin de la languette, bombé
    /**
     * Le raccord au plan : verticale au départ, horizontale à l'arrivée.
     *
     * ⚠️ **Les deux poignées sont symétriques, sinon la courbe se couche trop tôt.** La
     * seconde était posée à 0,46 de la longueur : la Bézier atteignait l'horizontale au
     * milieu du parcours et finissait par un long plat. À la moitié de chaque côté, la
     * descente se répartit et l'on obtient un S régulier.
     */
    `C ${ll},${c + (hl - c) * 0.5} ${ll + pente * 0.5},${hl} ${ll + pente},${hl}`,
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
})();

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
  const tresClair = decalerClarte(couleur, 0.19);
  const clair = decalerClarte(couleur, 0.10);
  const sombre = decalerClarte(couleur, -0.16);
  const cartes = apercu ?? [];

  return (
    <button
      type="button"
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
        position: "relative", width: CARTE_COMPTE.largeur, height: HAUTEUR,
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
        width: CARTE_COMPTE.largeur, height: CARTE_COMPTE.panneau + LANGUETTE.hauteur,
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
         */
        filter: `drop-shadow(0 16px 34px ${couleur}59)`
          + ` drop-shadow(0 6px 12px ${couleur}3D)`
          + ` drop-shadow(0 2px 3px rgba(4,10,24,0.38))`,
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
        <div key={i} aria-hidden="true" style={{
          position: "absolute", left: 16 + i * 14, top: 0,
          pointerEvents: "none",
        }}>
          {cartes[i]}
        </div>
      ))}

      {/* Le plan du dossier, par-dessus les cartes. */}
      <div style={{
        position: "absolute", left: 0, top: CARTE_COMPTE.apercu - LANGUETTE.hauteur,
        width: CARTE_COMPTE.largeur, height: CARTE_COMPTE.panneau + LANGUETTE.hauteur,
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
          background: `radial-gradient(120% 100% at 8% -8%,`
            + ` rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 58%),`
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
            padding: `${LANGUETTE.hauteur + 14}px 21px 21px`,
            display: "flex", flexDirection: "column", justifyContent: "space-between",
          }}>
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

            <div>
              <div style={{
                fontSize: 18, fontWeight: 700, color: "#FFFFFF", lineHeight: 1.15,
                letterSpacing: "-0.01em",
              }}>
                {nom}
              </div>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginTop: 3,
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
        * ⚠️ **Blanc sur tout le tour, plus vif en haut.** Deux versions ont raté avant celle-ci :
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
        * ⚠️ **Un demi-pixel de retrait.** Un trait centré sur le chemin déborde de moitié
        * hors de la silhouette, où le `clip-path` du plan l'a déjà coupé : il paraissait
        * deux fois plus fin en haut qu'en bas. Le décalage le ramène entièrement à
        * l'intérieur.
        */}
      <svg width={CARTE_COMPTE.largeur} height={CARTE_COMPTE.panneau + LANGUETTE.hauteur}
        aria-hidden="true" style={{
          position: "absolute", left: 0, top: CARTE_COMPTE.apercu - LANGUETTE.hauteur,
          pointerEvents: "none",
        }}>
        <defs>
          <linearGradient id={`bord-${idBord}`} x1="0" y1="0" x2="0" y2="1">
  
          </linearGradient>
        </defs>
        <path d={CONTOUR} fill="none" stroke={`url(#bord-${idBord})`} strokeWidth={1.5}
          transform="translate(0.5, 0.5) scale(0.9967)" />
      </svg>
    </button>
  );
}
