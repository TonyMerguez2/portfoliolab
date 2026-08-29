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
function Guilloche({ id, fond }: { id: string; fond: number }) {
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
      {/**
        * ⚠️ **Les arcs se voient, sinon ils ne servent à rien.** À 7,5 % d'opacité sur un
        * pixel et deux dixièmes, ils étaient signalés comme « trop discrets » — et ils
        * l'étaient d'autant plus depuis que la carte a été éclaircie : un blanc à peine posé
        * disparaît sur un fond clair, là où il tenait encore sur un presque-noir. Ils passent
        * à 14 %, sur un trait plus franc.
        *
        * ⚠️ **Un quatrième arc, et l'écart resserré.** Trois cercles espacés de quarante-cinq
        * laissaient de grandes plages nues entre eux ; le guillochis d'une vraie carte se
        * reconnaît à la **répétition**, pas à la présence de courbes. Les rayons se suivent
        * donc de trente-huit, et le plus petit remonte pour que le motif atteigne la bande
        * visible plutôt que de rester tapi sous le plan du dossier.
        *
        * ⚠️ **Ils s'éteignent vers l'extérieur.** Tous à la même intensité, les arcs du bord
        * gauche pesaient autant que ceux qui tournent près du coin éclairé, ce qui aplatit la
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
        * ⚠️ **Toutes en blanc translucide, comme la première.** La carte prend l'une des
        * dix-neuf couleurs de dossier : une gravure teintée aurait été juste sur l'une et
        * fausse sur les dix-huit autres.
        */}
      <g fill="none" stroke={`url(#arcs-${id})`} strokeWidth={1.4}>
        {fond === 0 && (
          /* Le guillochis d'origine : des arcs concentriques nés du coin bas-droit. Leurs
             rayons se suivent de trente-huit — c'est la répétition qui fait le guillochis,
             pas la présence de courbes. */
          <>
            <circle cx={L + 7} cy={H + 19} r={152} />
            <circle cx={L + 7} cy={H + 19} r={190} />
            <circle cx={L + 7} cy={H + 19} r={228} />
            <circle cx={L + 7} cy={H + 19} r={266} />
          </>
        )}
        {fond === 1 && (
          /**
           * Des ondes : quatre sinusoïdes parallèles qui traversent la bande.
           *
           * ⚠️ **Écrites en courbes de Bézier plutôt qu'en `path` sinusoïdal exact.** Deux
           * cubiques par période suffisent à l'œil sur une amplitude de neuf pixels, et
           * restent lisibles dans le fichier — une sinusoïde échantillonnée aurait donné
           * quarante nombres qu'on ne saurait plus relire.
           */
          [0, 1, 2, 3].map(i => (
            <path key={i} d={`M-10 ${10 + i * 21} C ${L * 0.28} ${1 + i * 21},`
              + ` ${L * 0.42} ${19 + i * 21}, ${L * 0.62} ${10 + i * 21}`
              + ` S ${L * 0.9} ${1 + i * 21}, ${L + 10} ${8 + i * 21}`} />
          ))
        )}
        {fond === 3 && (
          /**
           * Des hachures fines, pliées par une arête — relevé sur une carte réelle.
           *
           * ⚠️ **Ce qui fait ce guillochis-là, c'est la densité, pas le tracé.** Les trois
           * autres dessins posent quatre à sept courbes ; celui-ci en pose une quarantaine,
           * si serrées qu'on ne les compte pas. C'est ce qui le fait lire comme une *matière*
           * brossée plutôt que comme des traits — et c'est aussi ce qui le rend lisible dans
           * une bande de quarante-six pixels, là où un motif clairsemé n'aurait montré que
           * deux ou trois lignes isolées.
           *
           * ⚠️ **L'arête change le sens des hachures, elle ne les interrompt pas.** Sur la
           * référence, les deux zones sont hachurées toutes les deux : ce qui les sépare est
           * le *sens*, qui accroche la lumière différemment de part et d'autre. Une zone
           * laissée nue aurait donné deux matières au lieu d'une pliure dans la même.
           *
           * ⚠️ **La pliure traverse la bande visible**, comme les arcs : posée plus bas, elle
           * n'existerait que sous le plan du dossier et les deux zones se ressembleraient.
           *
           * ⚠️ **Un trait deux fois plus fin que les autres dessins.** À 1,4 les hachures se
           * touchaient presque et la surface virait au blanc laiteux ; à 0,7 elles gardent
           * entre elles autant de vide que de matière, ce qui est la condition pour qu'un
           * guillochis se lise comme gravé et non comme peint.
           */
          <>
            <defs>
              <clipPath id={`pli-haut-${id}`}>
                <path d={`M-10 -10 H${L + 10} V4 C ${L * 0.62} 22, ${L * 0.3} 44, -10 64 Z`} />
              </clipPath>
              <clipPath id={`pli-bas-${id}`}>
                <path d={`M-10 64 C ${L * 0.3} 44, ${L * 0.62} 22, ${L + 10} 4`
                  + ` V${H + 10} H-10 Z`} />
              </clipPath>
            </defs>
            <g clipPath={`url(#pli-haut-${id})`} strokeWidth={0.7}>
              {Array.from({ length: 34 }, (_, i) => (
                <path key={i} d={`M${-90 + i * 13} ${H + 10} L${30 + i * 13} -10`} />
              ))}
            </g>
            <g clipPath={`url(#pli-bas-${id})`} strokeWidth={0.7}>
              {Array.from({ length: 34 }, (_, i) => (
                <path key={i} d={`M${-30 + i * 13} ${H + 10} L${-150 + i * 13} -10`} />
              ))}
            </g>
          </>
        )}
        {fond === 2 && (
          /**
           * Des obliques : un faisceau de droites parallèles, dans le sens de la lumière.
           *
           * ⚠️ **Inclinées à contresens du dégradé de teinte.** Le fond de la carte descend
           * du clair au sombre vers le bas-droit ; des obliques dans le même sens auraient
           * épaissi ce mouvement au lieu de le croiser, et la surface serait redevenue plate.
           *
           * ⚠️ **L'écart est serré au point qu'on ne les compte pas.** Vingt-six pixels : à
           * quarante on lisait des traits isolés, ce qui est un décor et non une matière.
           */
          [0, 1, 2, 3, 4, 5, 6].map(i => (
            <path key={i} d={`M${-40 + i * 26} ${H + 10} L${40 + i * 26} -10`} />
          ))
        )}
      </g>
    </svg>
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
