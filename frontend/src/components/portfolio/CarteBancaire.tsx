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
/** À droite de la languette, la carte respire jusqu'au plan. */
const DEBORD = CARTE_COMPTE.languette.largeur - 16;
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
 * ⚠️ **Elle garde la boîte du logo qu'elle remplace.** Même côté, même arrondi, même origine
 * que le logo d'une carte d'actif : c'est ce qui aligne les deux cartes lorsqu'elles dépassent
 * côte à côte de deux dossiers voisins.
 */

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
const RANGEES = [[-2, 9.6], [10.5, 19.7], [20.6, 34]];
/** Le sillon entre deux pavés, en unités du repère — mesuré sur la photo, il est fin. */
const ARRONDI_PAVE = 1.3;

function Puce() {
  /**
   * ⚠️ **L'identifiant du dégradé est propre à l'instance.** Deux cartes bancaires côte à
   * côte partageraient sinon la même définition : le navigateur applique alors la dernière
   * rencontrée aux deux, et la première change d'aspect quand la seconde apparaît.
   */
  const id = useId().replace(/:/g, "");
  const cote = CARTE_ACTIF.logo.cote;
  return (
    <svg width={cote} height={cote} viewBox="0 0 32 32" aria-hidden="true"
      style={{ flexShrink: 0 }}>
      <defs>
        {/**
          * ⚠️ **Le dégradé est en coordonnées du repère, pas de chaque boîte.** Rapporté à
          * la boîte de chaque pavé, il repartait du clair dans les neuf : on obtenait neuf
          * petites plaques éclairées pareil, au lieu d'une seule surface que la lumière
          * traverse.
          */}
        <linearGradient id={`puce-${id}`} gradientUnits="userSpaceOnUse"
          x1="0" y1="0" x2="32" y2="32">
          <stop offset="0%" stopColor="#F4F6F9" />
          <stop offset="34%" stopColor="#D3D8DF" />
          <stop offset="66%" stopColor="#A8AFBA" />
          <stop offset="100%" stopColor="#CDD3DA" />
        </linearGradient>
      </defs>

      <defs>
        <clipPath id={`silhouette-${id}`}>
          <rect x="0.6" y="0.6" width="30.8" height="30.8"
            rx={CARTE_ACTIF.logo.rayon - 0.6} />
        </clipPath>
      </defs>

      {/* Le substrat : ce qui affleure entre les pavés. Sans liseré épais autour — sur la
          photo, le pourtour est fait des pavés eux-mêmes, pas d'un cadre. */}
      <rect x="0.6" y="0.6" width="30.8" height="30.8" rx={CARTE_ACTIF.logo.rayon - 0.6}
        fill="#5F656F" />

      <g clipPath={`url(#silhouette-${id})`}>
        {RANGEES.map(([y1, y2], r) => COLONNES.map(([x1, x2], c) => (
          <rect key={`${r}-${c}`} x={x1} y={y1} width={x2 - x1} height={y2 - y1}
            rx={ARRONDI_PAVE} fill={`url(#puce-${id})`} />
        )))}
      </g>
    </svg>
  );
}

export default function CarteBancaire({
  intitule, mention, couleur, derniers,
}: {
  /** Ce que la carte annonce en tête — « Compte courant », « Livret A ». */
  intitule: string;
  /** La ligne sous l'intitulé — « Solde disponible ». */
  mention: string;
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
      }}
    >
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
          <div style={{
            fontFamily: FONT, fontSize: 11.5, fontWeight: 550, color: "rgba(255,255,255,0.45)",
            lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {mention}
          </div>
        </div>

        {/* Le fronton d'une banque : le pictogramme du genre, pas un logo d'établissement —
            celui-là a sa place sur le dossier, où l'épargnant le pose. */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)"
          strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M3 10h18M5 10v8m4-8v8m6-8v8m4-8v8M2 21h20M12 3l9 5H3z" />
        </svg>
      </div>

      {/* Le numéro, dans le prolongement que la languette laisse libre à droite. */}
      <div style={{
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
