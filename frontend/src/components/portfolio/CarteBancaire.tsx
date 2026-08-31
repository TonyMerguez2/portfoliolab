"use client";
import { useId } from "react";

import { CARTE_ACTIF } from "@/components/portfolio/CarteActif";
import { MOTIFS_PUCE, REPERE_PUCE, fondPour, motifPour } from "@/lib/pucesCarte";
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
 * ⚠️ **Le creux compte, pas seulement la largeur de la languette.** Le plan ne reprend son
 * bord horizontal qu'au bout du raccord : tant que le creux descend, il recouvre encore la
 * carte. Calé sur la seule largeur, le numéro serait passé sous la courbe.
 */
const DEBORD = CARTE_COMPTE.languette.largeur + CARTE_COMPTE.languette.course - 16;
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

/** Ce qui affleure entre les plages : le substrat, sous le métal. */
const SUBSTRAT = "#5F656F";

/**
 * La puce, gravée d'un des dessins de `MOTIFS_PUCE`.
 *
 * ⚠️ **Substrat puis plages, et jamais l'inverse.** Une version intermédiaire peignait la
 * plaque pleine et traçait les sillons par-dessus, au pinceau : c'était plus court, et faux.
 * Un trait ne peut pas arrondir ce qu'il sépare — les plages restaient à angles vifs, alors
 * que sur la planche ce sont des tuiles nettement arrondies, d'un rayon bien supérieur à la
 * largeur du sillon. Le sillon n'est donc dessiné nulle part : c'est le substrat qu'on voit
 * entre deux tuiles.
 *
 * ⚠️ **Le dégradé traverse toutes les plages d'un seul tenant**, en coordonnées du repère.
 * Rapporté à la boîte de chacune, il repartirait du clair dans chaque tuile : on obtiendrait
 * une mosaïque de plaquettes éclairées pareil, au lieu d'une surface que la lumière traverse.
 *
 * ⚠️ **La découpe à la silhouette taille les tuiles du pourtour.** Elles débordent exprès de
 * la boîte : leurs angles extérieurs prennent ainsi le rayon du contour de la puce, au lieu
 * de porter le leur et de laisser quatre coins sombres que la planche n'a pas.
 */
function Puce({ motif }: { motif: number }) {
  /**
   * ⚠️ **L'identifiant du dégradé est propre à l'instance.** Deux cartes bancaires côte à
   * côte partageraient sinon la même définition : le navigateur applique alors la dernière
   * rencontrée aux deux, et la première change d'aspect quand la seconde apparaît.
   */
  const id = useId().replace(/:/g, "");
  const dessin = MOTIFS_PUCE[motif % MOTIFS_PUCE.length];
  const metal = `url(#puce-${id})`;
  return (
    <svg width={PUCE.largeur} height={PUCE.hauteur}
      viewBox={`0 0 ${REPERE_PUCE.largeur} ${REPERE_PUCE.hauteur}`} aria-hidden="true"
      style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id={`puce-${id}`} gradientUnits="userSpaceOnUse"
          x1="0" y1="0" x2={REPERE_PUCE.largeur} y2={REPERE_PUCE.hauteur}>
          <stop offset="0%" stopColor="#F4F6F9" />
          <stop offset="34%" stopColor="#D3D8DF" />
          <stop offset="66%" stopColor="#A8AFBA" />
          <stop offset="100%" stopColor="#CDD3DA" />
        </linearGradient>
        <clipPath id={`silhouette-${id}`}>
          <rect x="0.6" y="0.6" width={REPERE_PUCE.largeur - 1.2}
            height={REPERE_PUCE.hauteur - 1.2} rx={CARTE_ACTIF.logo.rayon - 0.6} />
        </clipPath>
      </defs>

      <g clipPath={`url(#silhouette-${id})`}>
        <rect x="0.6" y="0.6" width={REPERE_PUCE.largeur - 1.2}
          height={REPERE_PUCE.hauteur - 1.2} rx={CARTE_ACTIF.logo.rayon - 0.6}
          fill={SUBSTRAT} />
        {dessin.plages.map((d, i) => <path key={`p${i}`} d={d} fill={metal} />)}
        {dessin.disques?.map((c, i) => (
          <circle key={`c${i}`} cx={c.cx} cy={c.cy} r={c.r} fill={metal} />
        ))}
        {/* Les entailles n'ouvrent pas la plaque : elles entament une tuile sans la couper. */}
        {dessin.entailles?.map((d, i) => (
          <path key={`e${i}`} d={d} fill="none" stroke={SUBSTRAT} strokeWidth={1.1}
            strokeLinecap="round" />
        ))}
      </g>
    </svg>
  );
}

/**
 * Le centre du pointillé, en pourcentage de la carte.
 *
 * ⚠️ **Remonté dans la bande visible, et c'est tout le sujet.** Sur la carte de référence, la
 * fleur du halftone est à peu près au milieu — chez nous, le dossier recouvre tout ce qui
 * passe sous le soixante-huitième pixel, soit les deux tiers du bas. Un centre fidèlement
 * recopié n'aurait jamais existé qu'en dessous, et il ne serait resté à l'écran qu'un semis de
 * points sans origine. Il est donc posé haut et à droite, dans la zone que le titre laisse
 * libre, et il tombe du même coup sur la lueur du coin — la fleur naît là où la carte est
 * déjà éclairée.
 */
const CENTRE_POINTILLE = { x: 64, y: 19 };

/**
 * Le semis de points : un halftone polaire, en deux dégradés et zéro nœud.
 *
 * ⚠️ **Ce n'est pas un semis de points, c'est le croisement de deux familles.** Sur la carte
 * de référence, les points ne sont ni alignés ni de taille constante : ils sont posés sur une
 * grille *polaire* — des rayons partant d'un centre, coupés par des anneaux concentriques. Un
 * point est une intersection. C'est ce qui produit tout l'effet : l'écart angulaire étant
 * constant, les points grossissent et s'écartent en s'éloignant du centre, et le moiré des
 * deux familles fait tourner la surface.
 *
 * ⚠️ **En CSS et non en SVG, parce que le compte de nœuds était rédhibitoire.** À l'écart de
 * la référence — trois pixels et demi ramenés à notre échelle — la carte demanderait près de
 * quatre mille cercles, multipliés par autant de dossiers de trésorerie affichés. Deux
 * dégradés répétés en font autant pour un seul élément, et le navigateur les peint sur le
 * processeur graphique. Les hachures du fond n° 0 ont payé leurs soixante-douze tracés parce
 * qu'un `<pattern>` aurait laissé voir sa grille ; ici le motif est *polaire*, donc justement
 * hors d'atteinte d'une tuile — mais parfaitement à portée d'un dégradé conique.
 *
 * ⚠️ **`multiply` entre les deux couches, `screen` par-dessus la carte.** Superposées telles
 * quelles, les deux familles auraient donné une résille — des rayons *et* des anneaux, avec
 * des nœuds un peu plus clairs. Ce n'est pas ce que montre la référence, où il n'y a que les
 * nœuds. Le produit des deux ne garde que leur intersection ; le `screen` la repose ensuite
 * sur la carte sans jamais l'assombrir, ce qu'un blanc translucide ordinaire n'aurait pas su
 * faire par-dessus le dégradé de teinte.
 *
 * ⚠️ **Les bornes sont molles des deux côtés, et ce n'est pas de la coquetterie.** Des arrêts
 * francs à moins de deux degrés scintillent : la carte se déplace d'un pixel au survol du
 * dossier et les rayons crénelés se mettent à fourmiller. Des bornes dégradées donnent des
 * points ronds plutôt que des losanges, ce que la référence montre aussi.
 *
 * ⚠️ **Le cœur est évidé, sinon il fait un œil-de-bœuf.** Une grille polaire a un défaut que
 * la référence ne peut pas avoir, parce qu'elle est imprimée : près du centre, l'écart
 * angulaire tombe sous le pixel, les rayons se fondent en un gris uniforme et **il ne reste
 * plus que les anneaux** — une cible concentrique, vue et corrigée. Le masque efface le semis
 * sur les huit premiers pixels et le laisse revenir à vingt-six ; la fleur blanche posée
 * dessous occupe la place, comme sur la référence où les points naissent d'une lumière au
 * lieu de s'y empiler.
 */
function Pointille() {
  const { x, y } = CENTRE_POINTILLE;
  const centre = `at ${x}% ${y}%`;
  /* Le masque et la fleur partagent leur centre avec le semis : trois valeurs, une source. */
  const evidement = `radial-gradient(circle ${centre},`
    + " transparent 0, transparent 8px, #000 26px)";
  return (
    <>
      {/* La fleur, sous le semis : c'est d'elle que les points ont l'air de sortir. */}
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: `radial-gradient(circle ${centre}, rgba(255,255,255,0.20) 0,`
          + " rgba(255,255,255,0.07) 24px, rgba(255,255,255,0) 62px)",
      }} />
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: [
          /* Les rayons : une période de 3,9° fait quatre-vingt-douze branches. */
          `repeating-conic-gradient(from 0deg ${centre},`
            + " #fff 0deg, #000 1.3deg, #000 2.6deg, #fff 3.9deg)",
          /* Les anneaux : 5,4 pixels de période, soit l'écart des points près du centre. */
          `repeating-radial-gradient(circle ${centre},`
            + " #fff 0, #000 2px, #000 3.4px, #fff 5.4px)",
        ].join(", "),
        backgroundBlendMode: "multiply",
        mixBlendMode: "screen",
        opacity: 0.16,
        /* ⚠️ Le préfixe reste : Safari ne sert `mask-image` sans lui que depuis 15.4. */
        WebkitMaskImage: evidement, maskImage: evidement,
      }} />
    </>
  );
}

/**
 * Le fond guilloché de la carte.
 *
 * ⚠️ **Le motif est calé pour traverser la bande visible, pas pour être beau hors champ.**
 * Le dossier ne laisse voir que les soixante-huit premiers pixels de la carte : un dessin
 * centré, ou des arcs partant du bas, n'existeraient que dans la partie cachée. C'est la
 * contrainte qui a défait chacun des trois fonds au premier essai, et celle qu'il faut
 * reprendre avant d'en ajouter un quatrième.
 *
 * ⚠️ **En blanc translucide, jamais dans une teinte à soi.** La carte prend la couleur du
 * dossier, qui est celle que l'épargnant a choisie parmi onze : un motif coloré aurait été
 * juste sur l'une et faux sur les dix autres. Du blanc à peine posé éclaircit la surface
 * quelle qu'elle soit, sans jamais introduire une seconde teinte.
 */
function Guilloche({ id, fond }: { id: string; fond: number }) {
  const L = CARTE_ACTIF.largeur, H = CARTE_ACTIF.hauteur;
  return (
    <>
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
      {/**
        * ⚠️ **Les traits se voient, sinon ils ne servent à rien.** À 7,5 % d'opacité, ils
        * étaient signalés comme « trop discrets » — et ils l'étaient d'autant plus depuis que
        * la carte a été éclaircie : un blanc à peine posé disparaît sur un fond clair, là où
        * il tenait encore sur un presque-noir.
        *
        * ⚠️ **Ils s'éteignent vers l'extérieur.** Tous à la même intensité, les traits du bord
        * gauche pesaient autant que ceux qui passent près du coin éclairé, ce qui aplatit la
        * surface. Le dégradé les fait naître dans la lueur et s'y perdre.
        */}
      <defs>
        <linearGradient id={`arcs-${id}`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.20)" />
          <stop offset="55%" stopColor="rgba(255,255,255,0.11)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.04)" />
        </linearGradient>
      </defs>
      {/**
        * ⚠️ **Trois gravures, et toutes calées sur la même bande.** Le motif était unique :
        * deux dossiers voisins montraient la même courbe au même endroit, et l'œil y lisait
        * un fond d'interface plutôt que deux objets. Ce qui change d'un dessin à l'autre est
        * la *famille de courbes*, jamais l'endroit où elle passe — les trois traversent les
        * soixante-huit pixels visibles, faute de quoi elles n'existeraient que sous le plan.
        *
        * ⚠️ **Six ont été dessinées, trois sont restées, et aucune n'est morte de sa
        * régularité seule.** Écartées : des ondes sinusoïdales et des obliques droites — un
        * motif de fond d'écran, pas la gravure d'une carte ; puis le guillochis d'origine,
        * quatre arcs concentriques nés du coin bas-droit, que le pointillé remplace. Ce qui
        * reste ne se ressemble en rien : une matière hachurée, une famille de courbes, un
        * semis de points. **Les numéros sont ceux d'aujourd'hui et ils ont déjà glissé deux
        * fois** — inutile de chercher à les faire correspondre aux planches montrées à
        * l'usage, seule leur suite sans trou compte, `fondPour` prenant un modulo.
        *
        * ⚠️ **Toutes en blanc translucide.** La carte prend l'une des dix-neuf couleurs de
        * dossier : une gravure teintée aurait été juste sur l'une et fausse sur les dix-huit
        * autres.
        */}
      <g fill="none" stroke={`url(#arcs-${id})`} strokeWidth={1.4}>
        {fond === 0 && (
          /**
           * Des hachures fines, et des plans de lumière qui les traversent.
           *
           * ⚠️ **Le sens des hachures ne change jamais — c'est la teinte qui change.** Ma
           * première version pliait les hachures en miroir de part et d'autre d'une courbe :
           * cela donnait un chevron, et la carte de référence n'en a pas. Sur elle, les
           * traits filent tous dans la même direction d'un bord à l'autre ; ce qui découpe la
           * surface, ce sont de larges plans plus clairs qui passent *dessous*. La matière
           * est continue, la lumière ne l'est pas.
           *
           * ⚠️ **Deux plans, et non un.** Un seul aurait donné une carte coupée en deux ; la
           * référence en montre plusieurs qui se recouvrent, ce qui fait tourner la surface
           * comme un ruban plié. Le second est plus faible et décalé, si bien que leur
           * intersection forme une troisième valeur sans qu'on ait à la peindre.
           *
           * ⚠️ **Les deux traversent la bande visible.** Posés plus bas, ils n'existeraient
           * que sous le plan du dossier, et il ne resterait qu'un aplat hachuré.
           *
           * ⚠️ **Cinq pixels d'écart, et un trait de 0,55.** C'est la seule façon d'obtenir
           * une *matière* : à treize d'écart on lit des traits, à un trait de 1,4 la surface
           * vire au blanc laiteux. Il faut qu'entre deux hachures il reste plus de vide que
           * de matière — c'est ce qui distingue un guillochis gravé d'un aplat peint.
           *
           * ⚠️ **Soixante-douze tracés, et c'est le prix à payer.** Un `<pattern>` en aurait
           * fait un seul, mais son contenu se répète en coordonnées de tuile : le dégradé qui
           * éteint les hachures vers le bord extérieur y repartirait à chaque tuile, et l'on
           * verrait la grille du motif. La densité est le sujet ; on la paie en nœuds.
           */
          <>
            {/* Les plans de lumière, sous les hachures : `fill` et non `stroke`. */}
            <path fill="rgba(255,255,255,0.055)" stroke="none"
              d={`M-10 ${H + 10} L-10 58 C ${L * 0.3} 44, ${L * 0.58} 20, ${L + 10} -10`
                + ` L${L + 10} ${H + 10} Z`} />
            <path fill="rgba(255,255,255,0.038)" stroke="none"
              d={`M-10 ${H + 10} L-10 96 C ${L * 0.36} 74, ${L * 0.66} 44, ${L + 10} 22`
                + ` L${L + 10} ${H + 10} Z`} />
            <g strokeWidth={0.55}>
              {Array.from({ length: 72 }, (_, i) => (
                <path key={i} d={`M${-100 + i * 5} ${H + 10} L${-5 + i * 5} -10`} />
              ))}
            </g>
          </>
        )}
        {fond === 1 && (
          /**
           * Un éventail d'arcs qui balaie le coin haut-droit.
           *
           * ⚠️ **Le centre est dans la carte, et il a fallu l'y ramener.** Premier essai :
           * centre sous le bord gauche, à 250 pixels — des rayons de 285 à 350, soit une fois
           * et demie la diagonale de la carte. Vu à deux fois et demie, l'éventail ne se lisait
           * plus comme des arcs mais comme un faisceau de traits droits : sur les onze, huit
           * tournaient de moins de quinze degrés. **Un arc dont le rayon dépasse l'objet n'est
           * plus un arc, c'est une droite.** Le centre est donc rentré dans la carte, près du
           * coin bas-gauche.
           *
           * ⚠️ **Puis il a fallu l'ouvrir : c'est la portée qui manquait, pas la courbure.**
           * Deuxième essai, centre en (95, 168) : les arcs tournaient bien, mais neuf traits
           * blottis dans le coin, ressortant tous du bord droit avant la mi-hauteur. La carte
           * de référence, elle, porte son éventail sur la moitié de sa surface — c'est la
           * *famille* qu'on y voit, jamais un trait. Le centre a donc été poussé vers le bas
           * et vers la gauche, en (61, 186) : à peu près la même courbure, mais onze arcs qui
           * balaient le bord droit **de 8 jusqu'à 138**, soit sept dixièmes de la hauteur, au
           * lieu de s'arrêter à 94.
           *
           * ⚠️ **Le rayon de départ n'est pas choisi, il est déduit.** Il est celui de l'arc
           * qui passe par (113, 0) et (248, 138) en tournant de soixante degrés — l'ouverture
           * qu'on veut voir. Une corde et un angle donnent le rayon, `corde = 2 r sin(θ/2)`,
           * et le rayon donne le centre sur la médiatrice. Les onze rayons suivent de 6,5.
           *
           * ⚠️ **L'écart se resserre tout seul vers le coin, et ce n'est pas un réglage.**
           * Le pas des rayons est constant ; mais plus un arc est grand, plus il coupe le bord
           * supérieur à plat, et moins ce pas se traduit en distance. Mesuré sur le bord :
           * vingt-et-un pixels entre les deux premiers, dix entre les deux derniers. C'est la
           * convergence qu'on voit sur la carte de référence, et elle sort de la géométrie
           * plutôt que d'une suite de rayons écrite à la main.
           *
           * ⚠️ **Les onze traversent la bande visible**, puisque tous entrent par le bord
           * supérieur : ils coupent le haut de 113 à 240. Le premier entre après la puce et
           * au-delà de la tête du titre — l'éventail effleure la fin d'un nom long et laisse
           * tout le reste intact, là où les autres fonds traversent la carte de part en part.
           *
           * ⚠️ **L'éventail n'a pas de dernier trait — mais il a bien un premier.** À intensité
           * égale, la famille se lisait découpée dans un motif plus grand : un arc franc
           * marquait son bord comme une coupure. Seuls les deux **derniers** sont donc éteints,
           * ceux du coin. Le premier, lui, reste entier : il court vers le bas-gauche, là où le
           * dégradé commun l'a déjà ramené à quatre pour cent — l'atténuer une seconde fois
           * l'aurait effacé, et avec lui toute l'ouverture qu'on venait de gagner.
           *
           * ⚠️ **Trait d'un pixel, et non le 1,4 du groupe.** À dix pixels d'écart, l'épaisseur
           * commune refermait les intervalles : c'est la même règle qu'aux hachures du fond
           * n° 0 — plus les traits se serrent, plus il faut qu'il reste du vide entre eux.
           */
          <g strokeWidth={1}>
            {Array.from({ length: 11 }, (_, i) => (
              <circle key={i} cx={61} cy={186} r={193 + i * 6.5}
                strokeOpacity={i === 10 ? 0.45 : i === 9 ? 0.75 : 1} />
            ))}
          </g>
        )}
      </g>
    </svg>
    {/* ⚠️ Hors du SVG : le pointillé se peint en CSS, faute de pouvoir tenir en nœuds. */}
    {fond === 2 && <Pointille />}
    </>
  );
}

export default function CarteBancaire({
  intitule, couleur, derniers, cle,
}: {
  /** Ce que la carte annonce en tête — « Compte courant », « Livret A ». */
  intitule: string;
  /** La couleur du dossier, dont la carte tire sa propre teinte. */
  couleur: string;
  /** Les quatre derniers chiffres, s'ils ont été déclarés. */
  derniers?: string | null;
  /**
   * De quoi attribuer sa puce à cette carte-ci.
   *
   * ⚠️ **Une clé, et non un numéro de dessin.** L'appelant sait *quel compte* il montre, pas
   * quelle gravure lui revient : lui faire choisir un motif l'obligerait à savoir combien il
   * en existe — et à refaire ce choix, donc à le refaire différemment, au prochain emplacement
   * où une carte apparaîtra. Il donne ce qu'il a, la carte en déduit le reste. C'est aussi ce
   * qui a permis d'en retirer deux sans toucher à un seul appelant.
   *
   * ⚠️ **L'identifiant du compte de préférence à son nom, quand il existe.** Renommer un
   * compte ne doit pas regraver sa carte. À défaut — un dossier deviné, pas encore déclaré —
   * le nom fait l'affaire : il est ce qui tient lieu d'identité à ce stade.
   */
  cle?: string;
}) {
  /**
   * ⚠️ **La carte est plus sombre que son dossier, et c'est ce qui les distingue.** Posée
   * dans la teinte du dossier, elle s'y fondait : on ne voyait plus qu'un aplat de couleur
   * dépassant d'un autre aplat de la même couleur. Il faut donc un écart franc — deux
   * objets, pas un dégradé.
   *
   * ⚠️ **Mais l'écart avait viré au terne, et sur une teinte chaude cela se paie cher.**
   * À −34 %, un jaune-vert de dossier donnait une carte kaki : plus une couleur assombrie,
   * une couleur *salie*. Le vert-de-gris n'apparaît que sur les teintes chaudes, ce qui
   * explique qu'il ait passé les essais faits sur des bleus. Un tiers de moins suffit à
   * séparer les deux plans, et la carte reste dans sa propre couleur.
   */
  const fond = decalerClarte(couleur, -0.23);
  const arete = decalerClarte(couleur, -0.14);
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
        /**
         * ⚠️ **L'isolation borne l'arrière-plan que le `screen` du pointillé doit lire.** Sans
         * elle, un `mix-blend-mode` remonte au premier contexte d'empilement venu : le
         * navigateur doit alors composer tout ce qui a été peint sous lui — la rangée de
         * dossiers, la page — pour éclaircir deux cent quarante-huit pixels de large.
         *
         * ⚠️ **Elle ne corrige aucun défaut visible, et je l'ai vérifié plutôt que supposé.**
         * Retirée à la main sur la page rendue, l'image est identique au pixel près : la carte
         * étant opaque et son propre fond peint dans le même contexte, l'arrière-plan lu se
         * trouve être le bon de toute façon. Ce qui change est le *périmètre* de la lecture,
         * et donc son coût — et le fait qu'elle reste juste si l'on pose un jour quelque chose
         * de translucide sous la carte.
         */
        isolation: "isolate",
      }}
    >
      <Guilloche id={id} fond={fondPour(cle ?? intitule)} />

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
        <Puce motif={motifPour(cle ?? intitule)} />
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

        {/**
          * ⚠️ **Le coin haut-droit reste vide, et c'est un choix.** Il a porté deux choses,
          * l'une après l'autre. D'abord le fronton d'une banque, écrit en dur — qui faisait
          * doublon avec le pictogramme du genre porté par le plan du dossier, quelques pixels
          * plus bas : deux tracés identiques dans le même objet, et pire depuis que le compte
          * courant a le sien, la carte disant « banque » pendant que le dossier disait
          * « espèces ». Puis la marque Novac, à la place que les cartes réservent au réseau.
          * Écartée à l'usage.
          *
          * ⚠️ **Ce qui reste dit déjà tout ce qu'il faut.** La puce fait lire « carte », le
          * nom dit quel compte, le numéro en bas achève la forme. Une marque de plus ne
          * répondait à aucune question que la carte laisse en suspens.
          *
          * ⚠️ **Le vide n'est pas un oubli : c'est la fin de bande.** Le titre porte
          * `flex: 1` et occupe donc la place libérée — rien à retirer ni à recentrer.
          */}
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
