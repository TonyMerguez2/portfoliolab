"use client";
import { useId } from "react";

import { CARTE_ACTIF } from "@/components/portfolio/CarteActif";
import { CARTE_COMPTE } from "@/components/portfolio/CarteCompte";
import { decalerClarte } from "@/lib/couleur";
import { FONT, NUM } from "@/lib/typography";

/**
 * La carte bancaire qui dépasse d'un dossier de trésorerie.
 *
 * ⚠️ **Elle occupe la place d'une carte d'actif, et c'est toute son idée.** Un dossier
 * laisse voir ce qu'il range : des lignes pour un PEA, une carte pour un compte courant. La
 * zone dégagée au-dessus du plan ne montrait rien sur un compte de trésorerie — un vide qui
 * se lisait « à remplir » alors que ce compte ne recevra jamais de ligne. Elle reprend donc
 * les dimensions exactes de `CARTE_ACTIF` : le dossier la rogne de la même façon, sans un
 * calcul de plus.
 *
 * ⚠️ **Tout son contenu tient dans ce que le dossier ne cache pas, et c'est une découpe en
 * L.** Vu à l'écran : dessinée comme une carte ordinaire, avec sa puce au milieu et son
 * numéro en bas, elle n'en laissait paraître que l'en-tête. Ce qui échappe au plan, c'est
 * une bande de 46 pixels sur toute la largeur, prolongée jusqu'à 68 **à droite de la
 * languette seulement**. Le numéro se range donc dans ce prolongement, et rien d'essentiel
 * ne descend plus bas.
 *
 * ⚠️ **Elle ne montre aucun numéro réel, et n'en connaît aucun.** Les quatre derniers
 * chiffres sont facultatifs et déclarés ; à défaut, les points suffisent. Une carte n'a
 * jamais eu besoin de son numéro pour se reconnaître comme carte, et un vrai numéro n'aurait
 * rien à faire dans une base qui n'en a pas l'usage.
 */

/** Ce qui reste visible sur toute la largeur : la bande au-dessus de la languette. */
const BANDE = CARTE_COMPTE.apercu - CARTE_COMPTE.languette.hauteur;
/**
 * À droite de la languette, la carte respire jusqu'au plan.
 *
 * ⚠️ **La pente compte, pas seulement la largeur de la languette.** Le plan ne reprend son
 * bord horizontal qu'au bout du raccord : tant que la pente descend, elle recouvre encore la
 * carte. Calé sur la seule largeur, le numéro serait passé sous la courbe.
 */
const DEBORD = CARTE_COMPTE.languette.largeur + CARTE_COMPTE.languette.pente - 16;
/**
 * Le contact d'une puce à circuit intégré.
 *
 * ⚠️ **Ce ne sont pas des traits sur une plaque, ce sont des pavés séparés.** Le premier jet
 * remplissait un carré puis le barrait de lignes : à l'œil, un quadrillage dessiné *sur* une
 * surface. Sur une vraie puce, chaque contact est une plage de métal isolée, et ce qu'on voit
 * entre elles est le substrat qui affleure. On peint donc le fond sombre, puis neuf pavés
 * par-dessus — la différence tient à ce que les sillons ont alors une *profondeur*, et que
 * les angles des pavés s'arrondissent chacun pour leur compte.
 *
 * ⚠️ **Les rangées et les colonnes sont inégales, et c'est la signature de la forme.** Trois
 * bandes égales font un damier ; sur le contact, la colonne du milieu est large et celles des
 * bords étroites, tandis que la rangée du bas est la plus haute. C'est ce déséquilibre qu'on
 * reconnaît sans savoir le nommer, et c'est lui qu'un damier régulier manquait.
 *
 * ⚠️ **Les pavés d'angle épousent la courbe du contour, et ils ne peuvent pas le faire
 * seuls.** Un rectangle a quatre angles de même rayon : posé dans un carré arrondi, il
 * laisse quatre coins sombres que la photo n'a pas. Plutôt que de tracer quatre chemins aux
 * rayons dissymétriques, on laisse les pavés du pourtour **déborder** et l'on découpe
 * l'ensemble à la silhouette de la puce. Le contour taille alors leurs angles extérieurs
 * exactement comme le sien.
 *
 * ⚠️ **Aucun reflet posé à la main.** Une version portait un trait blanc le long du bord
 * supérieur, censé dire « surface polie » : il ne suivait aucun pavé, coupait le premier
 * sillon et se lisait comme une rayure. Le métal se dit par le dégradé qui traverse tous les
 * pavés d'un seul tenant — clair en haut à gauche, sombre en bas à droite — et par rien
 * d'autre.
 *
 * ⚠️ **Elle garde l'origine du logo qu'elle remplace, plus sa boîte.** Une puce est plus
 * large que haute — carrée, elle se lit comme une icône d'application. Sa largeur reste celle
 * du logo d'une carte d'actif et son coin haut-gauche tombe au même endroit : c'est cela qui
 * aligne les deux cartes lorsqu'elles dépassent côte à côte de deux dossiers voisins, et la
 * hauteur n'y entre pour rien puisque la rangée s'aligne par le sommet.
 */

/**
 * Les dimensions de la puce, en pixels.
 *
 * ⚠️ **La largeur est celle du logo, la hauteur non.** C'est la largeur qui porte
 * l'alignement — le coin haut-gauche et la colonne de texte qui suit. La hauteur ne fait que
 * donner sa forme à la puce, et une puce est un rectangle couché.
 */
const PUCE = { largeur: CARTE_ACTIF.logo.cote, hauteur: 26 };

/**
 * La grille des contacts, en unités du repère de 32.
 *
 * ⚠️ **Écrite en bornes plutôt qu'en largeurs.** Les pavés se déduisent d'un produit de deux
 * listes : trois colonnes, trois rangées. Exprimée en largeurs additionnées, la moindre
 * retouche décalait tout ce qui suit et il fallait refaire l'arithmétique à la main.
 *
 * ⚠️ **Les bornes extérieures sortent du repère, et c'est voulu.** Le débord est rattrapé
 * par la découpe : c'est lui qui donne aux pavés d'angle la courbe du contour.
 *
 * ⚠️ **Colonne du milieu large, rangée du bas haute.** Trois bandes égales font un damier ;
 * le déséquilibre est ce qu'on reconnaît d'un contact sans savoir le nommer.
 */
const COLONNES = [[-2, 9.0], [9.9, 22.1], [23.0, 34]];
/**
 * ⚠️ **Les rangées sont recalculées sur la hauteur réduite, pas simplement écrasées.** Un
 * `viewBox` plus court aurait comprimé les sillons avec les pavés : ils sont taillés dans le
 * métal, ils n'ont pas de raison de s'amincir quand la puce se couche. Les trois hauteurs
 * gardent donc leurs proportions — la rangée du bas reste la plus haute — et les sillons
 * gardent leurs neuf dixièmes d'unité.
 */
const RANGEES = [[-2, 7.74], [8.64, 15.94], [16.84, 28]];
/** Le sillon entre deux pavés, en unités du repère — mesuré sur la photo, il est fin. */
const ARRONDI_PAVE = 1.3;

function Puce() {
  /**
   * ⚠️ **L'identifiant du dégradé est propre à l'instance.** Deux cartes bancaires côte à
   * côte partageraient sinon la même définition : le navigateur applique alors la dernière
   * rencontrée aux deux, et la première change d'aspect quand la seconde apparaît.
   */
  const id = useId().replace(/:/g, "");
  return (
    <svg width={PUCE.largeur} height={PUCE.hauteur}
      viewBox={`0 0 ${PUCE.largeur} ${PUCE.hauteur}`} aria-hidden="true"
      style={{ flexShrink: 0 }}>
      <defs>
        {/**
          * ⚠️ **Le dégradé est en coordonnées du repère, pas de chaque boîte.** Rapporté à
          * la boîte de chaque pavé, il repartait du clair dans les neuf : on obtenait neuf
          * petites plaques éclairées pareil, au lieu d'une seule surface que la lumière
          * traverse.
          */}
        <linearGradient id={`puce-${id}`} gradientUnits="userSpaceOnUse"
          x1="0" y1="0" x2={PUCE.largeur} y2={PUCE.hauteur}>
          <stop offset="0%" stopColor="#F4F6F9" />
          <stop offset="34%" stopColor="#D3D8DF" />
          <stop offset="66%" stopColor="#A8AFBA" />
          <stop offset="100%" stopColor="#CDD3DA" />
        </linearGradient>
      </defs>

      <defs>
        <clipPath id={`silhouette-${id}`}>
          <rect x="0.6" y="0.6" width={PUCE.largeur - 1.2} height={PUCE.hauteur - 1.2}
            rx={CARTE_ACTIF.logo.rayon - 0.6} />
        </clipPath>
      </defs>

      {/* Le substrat : ce qui affleure entre les pavés. Sans liseré épais autour — sur la
          photo, le pourtour est fait des pavés eux-mêmes, pas d'un cadre. */}
      <rect x="0.6" y="0.6" width={PUCE.largeur - 1.2} height={PUCE.hauteur - 1.2}
        rx={CARTE_ACTIF.logo.rayon - 0.6} fill="#5F656F" />

      <g clipPath={`url(#silhouette-${id})`}>
        {RANGEES.map(([y1, y2], r) => COLONNES.map(([x1, x2], c) => (
          <rect key={`${r}-${c}`} x={x1} y={y1} width={x2 - x1} height={y2 - y1}
            rx={ARRONDI_PAVE} fill={`url(#puce-${id})`} />
        )))}
      </g>
    </svg>
  );
}

/**
 * Le fond guilloché de la carte.
 *
 * ⚠️ **Les arcs sont calés pour traverser la bande visible, pas pour être beaux hors champ.**
 * Le dossier ne laisse voir que les soixante-huit premiers pixels de la carte : un motif
 * centré, ou des arcs partant du bas, n'existeraient que dans la partie cachée. Leur centre
 * est donc posé au-delà du coin inférieur droit et leurs rayons choisis pour que les trois
 * courbes coupent la bande — mesuré, elles la traversent aux abscisses 181, 98 et 36.
 *
 * ⚠️ **En blanc translucide, jamais dans une teinte à soi.** La carte prend la couleur du
 * dossier, qui est celle que l'épargnant a choisie parmi onze : un motif coloré aurait été
 * juste sur l'une et faux sur les dix autres. Du blanc à sept pour cent éclaircit la surface
 * quelle qu'elle soit, sans jamais introduire une seconde teinte.
 */
function Guilloche({ id }: { id: string }) {
  const L = CARTE_ACTIF.largeur, H = CARTE_ACTIF.hauteur;
  return (
    <svg viewBox={`0 0 ${L} ${H}`} aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
        pointerEvents: "none" }}>
      <defs>
        <radialGradient id={`lueur-${id}`} cx="0.86" cy="0.04" r="0.75">
          <stop offset="0%" stopColor="rgba(255,255,255,0.16)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>
      {/* La lueur du coin haut-droit : elle éclaire la bande visible sans y poser de forme. */}
      <rect width={L} height={H} fill={`url(#lueur-${id})`} />
      <g fill="none" stroke="rgba(255,255,255,0.075)" strokeWidth={1.2}>
        <circle cx={L + 7} cy={H + 19} r={190} />
        <circle cx={L + 7} cy={H + 19} r={235} />
        <circle cx={L + 7} cy={H + 19} r={280} />
      </g>
    </svg>
  );
}

export default function CarteBancaire({
  intitule, couleur, derniers,
}: {
  /** Ce que la carte annonce en tête — « Compte courant », « Livret A ». */
  intitule: string;
  /** La couleur du dossier, dont la carte tire sa propre teinte. */
  couleur: string;
  /** Les quatre derniers chiffres, s'ils ont été déclarés. */
  derniers?: string | null;
}) {
  /**
   * ⚠️ **La carte est bien plus sombre que son dossier, et c'est ce qui les distingue.**
   * Posée dans la teinte du dossier, elle s'y fondait : on ne voyait plus qu'un aplat de
   * couleur dépassant d'un autre aplat de la même couleur. Sur la référence, la carte est
   * presque noire et le dossier lumineux — deux objets, pas un dégradé.
   */
  const fond = decalerClarte(couleur, -0.34);
  const arete = decalerClarte(couleur, -0.22);
  /** Un identifiant par instance : deux cartes voisines partageraient sinon les dégradés. */
  const id = useId().replace(/:/g, "");

  return (
    <div
      aria-hidden="true"
      style={{
        width: CARTE_ACTIF.largeur, height: CARTE_ACTIF.hauteur,
        /**
         * ⚠️ **Rayon et marges viennent de la carte d'actif, ils ne sont pas recopiés.**
         * Les deux cartes se côtoient dans la même rangée de dossiers : deux arrondis
         * voisins de deux pixels se voient sans qu'on sache les nommer, et deux jeux de
         * marges auraient divergé au premier ajustement de l'une des deux.
         */
        borderRadius: CARTE_ACTIF.rayon, boxSizing: "border-box",
        padding: `${CARTE_ACTIF.marge.haut}px ${CARTE_ACTIF.marge.cote}px 0`,
        background: `linear-gradient(145deg, ${arete} 0%, ${fond} 62%)`,
        /**
         * ⚠️ **L'arête est une ombre interne, pas un liseré — et ce pixel se voyait.** Sous
         * `border-box`, un `border` de un pixel rentre le contenu d'autant : la puce tombait
         * à 15/16 quand le logo d'une carte d'actif est à 14/15. Mesuré côte à côte, l'écart
         * se remarque sans qu'on sache le nommer. L'ombre interne dessine la même arête sans
         * toucher au modèle de boîte.
         */
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.10)",
        display: "flex", flexDirection: "column",
        /* ⚠️ Le fond est posé en absolu : il faut donc un repère, et les deux rangées
           doivent se replacer au-dessus de lui. */
        position: "relative", overflow: "hidden",
      }}
    >
      <Guilloche id={id} />

      {/**
        * La bande du haut : puce, intitulé, mention, pictogramme.
        *
        * ⚠️ **Alignée par le haut, et non centrée.** Centrée, la pastille du fronton se
        * plaçait au milieu des deux lignes de texte : son bord supérieur tombait plus bas
        * que celui du titre, et le titre plus haut que celui de la puce. Trois éléments,
        * trois marges hautes différentes. Alignés en tête, ils partagent celle de la carte
        * d'actif — la même que celle de son logo.
        */}
      <div style={{
        position: "relative",
        height: BANDE - CARTE_ACTIF.marge.haut,
        display: "flex", alignItems: "flex-start", gap: CARTE_ACTIF.ecartIdentite,
      }}>
        {/**
          * La puce. Un rectangle arrondi barré de deux traits — c'est le seul détail qui
          * fait lire « carte » plutôt que « rectangle », et il tient en trois lignes de SVG.
          */}
        <Puce />
        <div style={{ minWidth: 0, flex: 1 }}>
          {/* Corps et interlignage repris de la ligne d'identité d'une carte d'actif : c'est
              le même rang de lecture, il doit avoir le même poids. */}
          <div style={{
            fontFamily: FONT, fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.94)",
            lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {intitule}
          </div>
        </div>

        {/* Le fronton d'une banque : le pictogramme du genre, pas un logo d'établissement —
            celui-là a sa place sur le dossier, où l'épargnant le pose. */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.94)"
          strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11m16-11v11M8 14v3m4-3v3m4-3v3" />
        </svg>
      </div>

      {/* Le numéro, dans le prolongement que la languette laisse libre à droite. */}
      <div style={{
        position: "relative",
        height: CARTE_COMPTE.languette.hauteur, paddingLeft: DEBORD,
        display: "flex", alignItems: "center", justifyContent: "flex-end",
      }}>
        <span style={{
          ...NUM, fontSize: 13, letterSpacing: "0.14em", color: "rgba(255,255,255,0.78)",
          whiteSpace: "nowrap",
        }}>
          •••• ••••{derniers ? ` ${derniers}` : " ••••"}
        </span>
      </div>
    </div>
  );
}
