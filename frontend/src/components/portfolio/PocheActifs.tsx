"use client";
import { useId } from "react";
import { brandHex } from "@/lib/tileStyle";
import { decalerClarte } from "@/lib/couleur";
import { JETONS } from "@/lib/palette";
import AssetLogo from "@/components/AssetLogo";

/**
 * La vignette d'un portefeuille sans image : un portefeuille de cuir sombre, et
 * dedans une carte par actif détenu.
 *
 * Elle remplace l'initiale du nom, qui était redondante avec le nom affiché à
 * trois millimètres d'elle. Ce dessin dit deux choses de plus : que l'objet
 * désigné est un contenant, et ce qu'il contient.
 *
 * Le dessin suit l'icône de Wallet dans son rendu en volume, relevé sur une
 * capture. **Quatre plans, du fond vers l'avant** : le corps sombre, qui fait
 * toute la vignette ; une carte blanche, qui se voit en marge claire autour de
 * la pile et lui sert d'assise ; les cartes des actifs ; le rabat, du cuir du
 * corps, qui en couvre le bas.
 *
 * ⚠️ **Ce sont les ombres qui font le volume, pas les couleurs.** Chaque pièce
 * porte la sienne sur celle qui est derrière — la carte blanche sur le corps,
 * chaque carte sur sa voisine, le rabat sur les cartes. Sans elles, quatre
 * plans de teintes voisines s'écrasent en un seul. Le second levier est
 * l'arête éclairée : chaque carte s'ouvre sur deux unités de sa teinte
 * éclaircie, ce qui suffit à lui donner une épaisseur.
 *
 * ⚠️ Ce que le modèle porte et que ce dessin ne rendra pas : le biseau de
 * matière sur la tranche de chaque carte, un dégradé de moins d'un pixel à la
 * taille où la vignette est posée, et le grain du cuir. L'arête éclairée en
 * tient lieu.
 *
 * Trois versions sont mortes avant celle-ci, et toutes pour la même raison :
 * elles cherchaient à faire tenir la matière des cartes d'actifs — lavis de la
 * couleur du portefeuille, éclat de verre, base translucide qui suit le thème —
 * dans un dessin dont le modèle est une illustration éclairée à plat. Les deux
 * ne peuvent pas coexister.
 *
 * Tout est dessiné dans une boîte de 100 unités, corps compris : la vignette
 * reste juste à n'importe quelle taille. Les angles ne sont pas arrondis ici —
 * c'est l'appelant qui les coupe, avec son `overflow: hidden`.
 */

/**
 * Nombre de cartes montrées, au plus.
 *
 * Cinq, une de plus que le modèle. Le compte exact est de toute façon écrit en
 * toutes lettres à côté de la vignette (« 3 actifs ») : le dessin n'a pas à
 * faire office de compteur. Et il ne le pourrait pas au-delà : la pile occupe
 * une hauteur fixe, si bien que huit tranches donnent un peigne et douze un
 * pavé gris. À cinq, chaque tranche mesure 6,5 unités — 4 px à la taille où la
 * vignette est posée, 1,8 px dans le menu déroulant.
 */
const MAX_CARTES = 5;

/* ── Le relevé du modèle, ramené sur 100 unités ─────────────────────────────
   L'objet mesure 302 × 295 sur la capture ; chaque valeur ci-dessous est le
   rapport correspondant, arrondi. Les garder liées par le calcul plutôt que
   posées une à une est ce qui permet de bouger l'objet sans le déformer. */

/** Le corps : toute la vignette. */
const CORPS = { x: 0, y: 0, l: 100, h: 100 };

/**
 * Le rayon du corps, en fraction de la taille de la vignette.
 *
 * ⚠️ **Ce rayon a été mesuré deux fois, et la première était fausse.** J'avais
 * lu 147 px sur un objet de 824, soit 17,8 %, ce qui a rendu le corps plus carré
 * qu'avant la mesure. En reprenant l'angle du concept sur ses deux côtés — la
 * courbe quitte le bord gauche à quelque 180 px du sommet et rejoint le bord
 * haut à quelque 175 px de l'angle, sur un objet de 784 — on est à **22 % au
 * moins**. Et il faut y ajouter quelque chose : le concept n'a pas des angles
 * circulaires mais une silhouette continue à la manière d'Apple, dont la
 * courbure s'étale. Un arrondi circulaire doit donc être plus large qu'elle pour
 * paraître aussi rond. D'où 23,5 %.
 *
 * ⚠️ Exporté parce que c'est l'appelant qui coupe les angles, avec son
 * `overflow: hidden` : du plus creux des deux arrondis c'est toujours lui qui
 * gagne, donc les deux valeurs doivent venir d'ici.
 *
 * Il se trouve que 23,5 % est proche des 21,7 % de `rayonVignette` — 13/60 — que
 * suit le reste de l'application. L'écart de silhouette avec les logos d'actifs
 * est donc mince, mais il existe : la poche est un peu plus ronde qu'eux.
 */
export const RAYON_CORPS = 0.235;

/**
 * Arête haute du rabat.
 *
 * Elle est descendue de 49 à 61 avec le second relevé : la poche du modèle ne
 * couvre que les deux cinquièmes du bas, et le reste va aux cartes. C'est ce
 * qui dégage la place où le logo de la première ligne devient lisible.
 */
const RABAT = 61;

/**
 * Les cartes, en retrait de 8 % de la largeur et 14 % de la hauteur.
 *
 * Le modèle intercale une carte blanche entre le corps et la pile, et range les
 * cartes de couleur dedans — d'où un double retrait, 12,6 % puis 4 %. Elle est
 * retirée : les cartes reposent sur le corps, et récupèrent la largeur qu'elle
 * leur prenait. Elles passent ainsi de 67 à 84 unités.
 *
 * Le sommet est passé de 14 % à 10 % : le cuir laissait trop de vide au-dessus
 * de la pile. Il reste de la marge du côté de l'arrondi de la vignette, qui vaut
 * 21,6 unités et mord le coin des cartes qui montent trop haut — le point le
 * plus éloigné de leur arrondi est à 14,5 du centre de l'angle, soit sept unités
 * de reste. C'est leur rayon de 8,4, plus généreux qu'avant, qui paie cette
 * marge : un coin plus creusé s'écarte de l'arc au lieu de le croiser.
 */
const CARTE_X = 8;
const CARTE_L = 84;
const CARTE_HAUT = 10;

/**
 * L'arête de la carte de devant, aux deux tiers de la hauteur de pile.
 *
 * C'est le point fixe du dessin : elle y reste quel que soit le nombre de
 * lignes, et sa tranche vaut donc toujours le tiers restant. Voir `pas`.
 */
const AVANT = CARTE_HAUT + (RABAT - CARTE_HAUT) * 2 / 3;

/**
 * Le rayon des cartes : 9,5 unités, valeur absolue et non rapport de leur
 * largeur.
 *
 * L'absolu, c'est ce que fait le concept : ses trois cartes n'ont pas la même
 * largeur et portent pourtant le même arrondi. Le lier à la largeur les aurait
 * fait diverger.
 *
 * ⚠️ **Quatrième valeur, et il a fallu changer de repère pour la trouver.**
 * 21,6, puis 8,4, puis 6,4, puis 9,5 : à chaque fois je mesurais l'angle en
 * cherchant où la courbe *semble* commencer, ce qui la sous-estime toujours. Le
 * bon repère est l'autre bout : **où le bord haut de la carte devient droit.**
 * Sur la carte blanche du concept, il ne l'est qu'à une centaine de pixels de
 * son bord gauche, pour un objet de 784 — soit 13 unités. Les deux angles
 * mangent alors 31 % de la largeur de la carte, et c'est bien ce que montre le
 * concept.
 */
const RAYON = 13;

/**
 * Jusqu'où les cartes descendent, sous le rabat.
 *
 * Il faut passer le fond de l'échancrure, sans quoi elle laisserait voir le
 * corps au travers, comme un trou dans la pile.
 */
const CARTE_BAS = 92;

/**
 * Le logo de la première ligne, posé sur la carte de devant.
 *
 * Sa taille et son centre sont relevés sur le modèle, où le logo occupe 22 % de
 * la hauteur et se centre à 60,7 % — c'est-à-dire dans le creux de
 * l'échancrure, seul endroit où la carte de devant se voit sur toute sa largeur.
 *
 * ⚠️ Il faut qu'il tienne entre l'arête de la carte, au-dessus, et la courbe de
 * l'échancrure, en dessous : centré à 60,5 sur 23 de haut, il va de 49 à 72,
 * quand la carte commence à 44 et que le fond de l'échancrure est à 79. Sept
 * unités de garde en bas, cinq en haut. Le descendre le ferait mordre par le
 * cuir sur ses deux coins bas, là où la courbe remonte.
 */
const LOGO_TAILLE = 23;
const LOGO_CENTRE_Y = 60.5;

/**
 * En dessous de cette taille de vignette, pas de logo.
 *
 * À 28 px — la taille du menu déroulant — le logo mesurerait 6,4 px : une tache
 * de trois couleurs qui n'identifie rien et salit un dessin par ailleurs
 * lisible. Le seuil est posé à 40, où il fait 9,2 px.
 */
const LOGO_SEUIL = 40;

/**
 * Le cuir du corps, et celui du rabat, qui en est un pli.
 *
 * Les jetons de la palette, et non des hexadécimaux à soi : le noir du modèle
 * est neutre, celui de cette application est bleuté — `--nv-fond`, celui du
 * menu latéral, vaut #030712 — et un gris neutre posé au milieu se voit
 * immédiatement comme une pièce rapportée. Ce sont donc les deux liserés de la
 * palette qui font le cuir, `bordFort` puis `bord`, tous deux plus clairs que le
 * #030712 du cadre derrière : c'est ce qui détache la vignette de son support.
 *
 * ⚠️ Ces jetons valent `var(--nv-*)`, donc la vignette suit maintenant le thème.
 * En thème clair, le cuir devient pâle et se retrouve sur une carte blanche —
 * le mode clair est écarté à la demande, mais c'est bien là que ça se paiera.
 *
 * Le rabat démarre à `bordFort`, alors que le corps y est déjà à mi-chemin de
 * `bord` : onze niveaux de clarté d'écart, et c'est ce qui trace le pli
 * maintenant que le liseré blanc est parti.
 */
const CORPS_HAUT = JETONS.bordFort;
const CORPS_BAS = JETONS.bord;
const RABAT_HAUT = JETONS.bordFort;
const RABAT_BAS = JETONS.bord;

/**
 * Le rabat : le bas du corps, échancré.
 *
 * L'échancrure du second relevé est bien plus ample : **la moitié de la largeur
 * et 18 % de la hauteur**, contre 28 % et 8,5 % au relevé précédent. C'est le
 * creux du pouce, et c'est lui qui fait la poche ; sans lui, la forme est une
 * pile de bandes coupées net par une horizontale. Cette ampleur-là n'est pas
 * qu'une question de style : c'est elle qui ouvre la fenêtre par laquelle on
 * voit le logo de la première ligne.
 *
 * **Le fond est plat, et c'est ce qui fait le bassin.** L'échancrure n'est plus
 * deux cubiques qui se rejoignent en un point bas, mais deux cubiques séparées
 * par un segment horizontal de dix unités — un cinquième de sa largeur, comme au
 * concept. Chaque cubique va de l'horizontale haute à l'horizontale basse avec
 * ses deux points de contrôle à mi-course : c'est la demi-cosinusoïde, tangente
 * à plat aux deux bouts, donc douce à l'épaule **et** à l'entrée du fond.
 *
 * ⚠️ Trois réglages sont morts avant celui-ci.
 *
 * 0,345 / 0,40 : la descente démarrait lentement puis plongeait — épaule sèche,
 * fond en V.
 *
 * 0,5 / 0,5 sans fond plat : symétrique et douce, mais les deux courbes se
 * touchant en un seul point, le bas restait pointu.
 *
 * 0,70 / 0,35 : **les deux points de contrôle se croisaient.** Le premier tenait
 * la courbe à plat jusqu'à 70 % du chemin, le second la ramenait à plat dès
 * 65 % — l'un après l'autre, donc la courbe devait tout descendre dans les
 * 5 % restants. D'où le plongeon en goutte. C'était une faute de construction,
 * pas un réglage à affiner.
 *
 * Les deux cubiques sont l'exacte image l'une de l'autre par la médiane ; une
 * échancrure de guingois se voit immédiatement, même à 5 px.
 *
 * Le tracé sort du cadre de trois unités à gauche, à droite et en bas : c'est
 * l'`overflow: hidden` de l'appelant qui coupe ces trois côtés, et un tracé
 * qui s'arrêterait pile au bord y laisserait une arête d'un demi-pixel après
 * l'anticrénelage.
 */
const MI = CORPS.x + CORPS.l / 2;
const ECH_DEMI = CORPS.l * 0.25;
const ECH_L = MI - ECH_DEMI;
const ECH_R = MI + ECH_DEMI;
const ECH_BAS = RABAT + CORPS.h * 0.18;
/** Demi-largeur du fond plat, un cinquième de l'échancrure. */
const FOND_DEMI = ECH_DEMI * 0.2;
/** Course horizontale d'une des deux descentes. */
const PENTE = ECH_DEMI - FOND_DEMI;
const DEBORD = 3;
const RABAT_D = [
  `M ${CORPS.x - DEBORD},${RABAT}`,
  `L ${ECH_L},${RABAT}`,
  `C ${ECH_L + PENTE * 0.5},${RABAT} ${MI - FOND_DEMI - PENTE * 0.5},${ECH_BAS} ${MI - FOND_DEMI},${ECH_BAS}`,
  `L ${MI + FOND_DEMI},${ECH_BAS}`,
  `C ${MI + FOND_DEMI + PENTE * 0.5},${ECH_BAS} ${ECH_R - PENTE * 0.5},${RABAT} ${ECH_R},${RABAT}`,
  `L ${CORPS.x + CORPS.l + DEBORD},${RABAT}`,
  `L ${CORPS.x + CORPS.l + DEBORD},${CORPS.y + CORPS.h + DEBORD}`,
  `L ${CORPS.x - DEBORD},${CORPS.y + CORPS.h + DEBORD}`,
  "Z",
].join(" ");

export default function PocheActifs({
  actifs, taille = 44,
}: {
  /**
   * Les lignes du portefeuille. Le ticker et le poids suffisent ; `type` ne sert
   * qu'au logo de la première, dont il oriente la recherche — une crypto ne se
   * cherche pas au même endroit qu'une action.
   */
  actifs: { ticker: string; weight: number; type?: string }[];
  taille?: number;
}) {
  // Les identifiants de <defs> sont globaux au document : deux vignettes sur la
  // même page partageraient leurs dégradés, et la seconde reprendrait les
  // couleurs de la première.
  const id = useId().replace(/:/g, "");

  // Le plus gros poids devant, donc au bas de la pile. La légende de la
  // répartition le met en haut, et l'ordre inverse ici se défend malgré tout :
  // l'échancrure laisse voir la carte de devant sur toute sa largeur, si bien
  // qu'elle occupe à elle seule plus de surface que les tranches réunies. Une
  // ligne à 3 % y tenait la plus grande place du dessin.
  const cartes = [...actifs].sort((a, b) => a.weight - b.weight).slice(-MAX_CARTES);

  /**
   * L'écart vertical entre deux cartes, donc la hauteur de tranche visible.
   *
   * **La carte de devant ne bouge jamais** : son arête reste à `AVANT`, et elle
   * garde donc le tiers de la hauteur de pile quel que soit le nombre de lignes.
   * Les autres se répartissent également au-dessus d'elle. Ajouter des cartes ne
   * déplace ainsi que celles du milieu : à trois, les arêtes tombent sur 10, 23
   * et 36 ; à cinq, sur 10, 16,5, 23, 29,5 et 36 — les trois premières positions
   * sont exactement les mêmes, et les deux nouvelles se glissent dans les
   * intervalles.
   *
   * ⚠️ La règle précédente répartissait les *n* cartes sur toute la hauteur,
   * ce qui les déplaçait toutes dès qu'une s'ajoutait : passer de trois à cinq
   * aurait descendu la carte de devant de 36 à 41,2 et aminci sa tranche de 13 à
   * 7,8. Le dessin changeait d'aspect à chaque achat.
   *
   * À une seule carte, `pas` ne sert pas : elle est à la fois du fond et de
   * devant, et se pose en haut pour remplir la poche plutôt qu'y flotter.
   */
  const pas = cartes.length > 1 ? (AVANT - CARTE_HAUT) / (cartes.length - 1) : 0;

  /**
   * L'ombre d'une pièce : la même forme, floutée et noire, décalée derrière.
   *
   * Décalée vers le haut, à l'inverse de l'usage : la lumière du modèle vient
   * d'en haut, et ces pièces sont empilées vers l'avant en descendant. Chacune
   * porte donc son ombre sur ce qui la précède, c'est-à-dire au-dessus d'elle.
   */
  const ombre = (dy: number, alpha: number) => ({
    fill: `rgba(0,0,0,${alpha})`,
    filter: `url(#flou-${id})`,
    transform: `translate(0 ${dy})`,
  });

  /** La ligne de devant, celle du plus gros poids : c'est son logo qu'on voit. */
  const devant = cartes[cartes.length - 1];
  const avecLogo = devant != null && taille >= LOGO_SEUIL;
  /** Des unités du dessin aux pixels de l'appelant. */
  const px = (u: number) => (u / 100) * taille;

  return (
    <span style={{ position: "relative", display: "block", width: taille, height: taille }}>
    <svg width={taille} height={taille} viewBox="0 0 100 100"
      style={{ display: "block" }} aria-hidden="true">
      <defs>
        {/* Le flou des ombres. La zone est élargie à la main : celle par défaut
            se règle sur le cadre de la forme, et un rectangle plat s'y voit
            couper son flou en haut et en bas. */}
        <filter id={`flou-${id}`} x="-25%" y="-40%" width="150%" height="180%">
          <feGaussianBlur stdDeviation={1.4} />
        </filter>

        {([[`corps-${id}`, CORPS_HAUT, CORPS_BAS, CORPS.y, CORPS.y + CORPS.h],
           [`rabat-${id}`, RABAT_HAUT, RABAT_BAS, RABAT, CORPS.y + CORPS.h]] as const)
          .map(([cle, haut, bas, y1, y2]) => (
            <linearGradient key={cle} id={cle} gradientUnits="userSpaceOnUse"
              x1={0} y1={y1} x2={0} y2={y2}>
              <stop offset="0%" stopColor={haut} />
              <stop offset="100%" stopColor={bas} />
            </linearGradient>
          ))}

        {/* Une carte : arête éclairée, puis sa teinte, puis un pied assombri.
            Le premier arrêt tient sur deux unités quelle que soit la hauteur de
            la carte — d'où `userSpaceOnUse` et un dégradé par carte : en
            proportion de sa boîte, l'arête serait deux fois plus épaisse sur la
            carte du fond, qui est deux fois plus haute que celle de devant. */}
        {cartes.map((a, j) => {
          const y = CARTE_HAUT + j * pas;
          // La teinte du mode sombre, celle-là même que portent les cartes
          // d'actifs de la page : les cartes reposent sur le cuir noir du corps,
          // plus sur une feuille blanche. `brandHex` éclaircit les marques trop
          // sombres pour un fond noir — c'est le bon sens ici.
          const teinte = brandHex(a.ticker);
          return (
            <linearGradient key={a.ticker} id={`carte-${id}-${j}`}
              gradientUnits="userSpaceOnUse" x1={0} y1={y} x2={0} y2={CARTE_BAS}>
              <stop offset="0%" stopColor={decalerClarte(teinte, 0.13)} />
              <stop offset={`${(2 / (CARTE_BAS - y)) * 100}%`} stopColor={teinte} />
              <stop offset="100%" stopColor={decalerClarte(teinte, -0.07)} />
            </linearGradient>
          );
        })}
      </defs>

      {/* Le corps, d'un bord à l'autre. */}
      <rect x={CORPS.x} y={CORPS.y} width={CORPS.l} height={CORPS.h}
        fill={`url(#corps-${id})`} />

      {/* Les cartes, de l'arrière vers l'avant : chacune recouvre la précédente
          et n'en laisse voir qu'une tranche de `pas` unités. */}
      {cartes.map((a, j) => {
        const y = CARTE_HAUT + j * pas;
        const forme = { x: CARTE_X, width: CARTE_L, rx: RAYON, y, height: CARTE_BAS - y };
        return (
          <g key={a.ticker}>
            {/* ⚠️ Pas d'ombre pour la carte du fond. Elle n'a rien derrière elle
                sinon le cuir du corps, et son ombre y traçait une bande sombre
                floutée sur toute sa largeur, juste sous l'arête haute de la
                vignette — assez près des angles pour paraître couper la fin de
                leur arrondi. Le concept ne montre rien là : la première carte
                touche la paroi. Les suivantes gardent la leur, qui tombe sur une
                carte et sert à les décoller l'une de l'autre. */}
            {j > 0 && <rect {...forme} {...ombre(-1, 0.34)} />}
            <rect {...forme} fill={`url(#carte-${id}-${j})`} />
          </g>
        );
      })}

      {/* Le rabat, et l'ombre qu'il porte sur les cartes. Elle ne dépasse que
          par le haut, en une bande qui suit l'échancrure sans qu'on ait à la
          décrire deux fois. */}
      <path d={RABAT_D} {...ombre(-1.6, 0.42)} />
      <path d={RABAT_D} fill={`url(#rabat-${id})`} />

      {/* Il y avait ici le renflement des cartes sous le cuir : leur empreinte,
          très floutée et découpée au rabat, qui donnait à la poche l'air de se
          tendre sur ce qu'elle contient. Retiré — le concept a une poche plate.
          Avec elle sont partis sa découpe, son dégradé et son flou large, qui
          n'avaient pas d'autre usage.

          Il y avait aussi un liseré blanc sur l'arête du rabat, censé lui donner
          la lumière du pli. Retiré : sur les deux tiers de sa longueur, l'arête
          ne borde aucune carte mais le cuir du corps — même matière des deux
          côtés — et le trait s'y lisait comme un halo posé en travers de la
          vignette plutôt que comme un pli.

          Ce qui trace le pli désormais : l'ombre que le rabat porte sur les
          cartes, et l'écart de clarté entre son cuir, qui démarre à `bordFort`,
          et celui du corps, déjà à mi-chemin de `bord` à cette hauteur. */}
    </svg>

    {/* Le logo de la ligne de devant, dans le creux de l'échancrure.
        En dehors du SVG, et pas dans un `foreignObject` : `AssetLogo` porte une
        chaîne de sources de repli, un délai de quatre secondes et une bascule
        sur les initiales. Le réécrire en `<image>` aurait perdu tout cela pour
        une balise.

        `bare` retire son fond et son liseré : la carte lui en fournit déjà un.
        Les couleurs de repli sont celles d'un logo posé sur une teinte de
        marque — blanc translucide, encre blanche — et non les jetons de la
        palette, comme partout dans ce dessin. */}
    {avecLogo && (
      <span aria-hidden="true" style={{
        position: "absolute", pointerEvents: "none",
        left: px(50 - LOGO_TAILLE / 2), top: px(LOGO_CENTRE_Y - LOGO_TAILLE / 2),
        width: px(LOGO_TAILLE), height: px(LOGO_TAILLE),
      }}>
        <AssetLogo ticker={devant.ticker} type={devant.type}
          size={px(LOGO_TAILLE)} radius={px(LOGO_TAILLE) * 0.22} bare
          fallbackBg="rgba(255,255,255,0.16)"
          fallbackBorder="rgba(255,255,255,0.22)"
          fallbackTextColor="#FFFFFF" />
      </span>
    )}
    </span>
  );
}
