"use client";
import { FAMILLE_AVATAR, contourDeForme } from "@/components/AvatarNovac";
import { ARRONDI_REFERENCE } from "@/lib/avatarReglages";
import { solideDepuis } from "@/lib/avatarVolume";
import { RAYON_TETE, contourSilhouette } from "@/lib/avatarSpherique";
import PastilleCouleur from "@/components/portfolio/PastilleCouleur";
import { COULEURS_AVATAR } from "@/lib/avatarCouleur";
import { skinParCle, skinPourForme } from "@/lib/avatarSkins";
import { CLAIR } from "@/lib/palette";
import { FONT } from "@/lib/typography";
import { FORMES_AVATAR, type FormeAvatar } from "@/lib/useCouleurAvatar";

/**
 * Choisir l'apparence d'un avatar : sa couleur, sa silhouette.
 *
 * ⚠️ **Sorti du panneau de réglage le jour où un second écran a dû l'offrir.** Ces deux
 * grilles vivaient dans `AvatarPortefeuille`, c'est-à-dire dans la fenêtre qu'on ouvre
 * *depuis un portefeuille déjà créé*. La création, elle, doit poser la même question avant
 * qu'il existe. Recopiées, les deux auraient divergé sur ce qui diverge toujours : le
 * diamètre d'une pastille, le nombre de colonnes, la marque de sélection — et l'on aurait
 * fini avec deux écrans qui proposent « la couleur de l'avatar » sans proposer la même
 * chose. C'est exactement l'histoire de `PastillesCouleur`, un cran plus bas.
 *
 * ⚠️ **Ce qui reste chez l'appelant : les habillages.** Ils dépendent de la silhouette
 * portée, se filtrent par une règle propre au réglage, et la création n'en offre pas — un
 * portefeuille qu'on vient de nommer n'a pas encore de quoi mériter un globe terrestre.
 */

/** Ce que chaque forme s'appelle, à l'écran comme pour les technologies d'assistance. */
export const NOM_FORME: Record<FormeAvatar, string> = {
  sphere: "Ronde",
  carre: "Carrée",
  etoile: "Étoile",
  etoile6: "Étoile à six lobes",
  nuage: "Nuage",
  hexagone: "Hexagone",
  triangle: "Triangle",
  goutte: "Goutte",
};

/**
 * Une rubrique du réglage : son intitulé et ce qu'elle propose.
 *
 * ⚠️ **Écrite une fois pour toutes.** Des blocs identiques à l'espacement près, et c'est
 * l'espacement qui aurait divergé — c'est toujours lui.
 */
export function Reglage({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{
        fontFamily: FONT, fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
        textTransform: "uppercase", color: CLAIR.texteAttenue,
      }}>{titre}</span>
      {children}
    </div>
  );
}

/**
 * Le nuancier, disposé en écailles.
 *
 * ⚠️ **La sélection ne se montre que si la tête est unie.** Un habillage recouvre la
 * couleur : marquer une pastille pendant qu'un globe terrestre est porté annoncerait un
 * choix qui ne se voit nulle part. D'où `skin`, qui vaut « uni » par défaut — le cas de la
 * création, où aucun habillage n'est encore possible.
 *
 * ⚠️ **Il n'y a plus de « + » pour une couleur libre.** Un champ de couleur natif fermait la
 * rangée et ouvrait le sélecteur du système. Retiré à l'usage. Il se justifiait quand le
 * nuancier n'offrait que onze teintes et laissait des trous — quatre-vingt-quinze degrés
 * sans aucun vert franc ; à dix-neuf, le tour est couvert et la porte de sortie ne servait
 * plus qu'à casser la bande. La capacité disparaît de l'écran, pas du modèle :
 * `estCouleurValide` accepte toujours n'importe quel hexadécimal, donc un choix déjà
 * enregistré hors nuancier reste porté.
 */
export function ChoixCouleur({
  couleur, onChoisir, skin = "uni", taille = 38, parRangee = 10,
}: {
  couleur: string;
  onChoisir: (hex: string) => void;
  skin?: string;
  taille?: number;
  /** Combien de pastilles par rangée. Dix-neuf couleurs en font deux, de dix et neuf. */
  parRangee?: number;
}) {
  /**
   * ⚠️ **Les pastilles se recouvrent, et c'est le sujet.** Elles étaient posées dans une
   * grille à écarts réguliers de dix pixels — un tableau de cases, où chaque teinte est un
   * élément de liste. Demandé à l'usage de les faire se superposer. Le chevauchement change
   * ce qu'on lit : des disques qui se mordent forment **une matière continue**, un nuancier
   * qu'on parcourt, et non dix-neuf boutons rangés côte à côte.
   *
   * ⚠️ **Un quart du diamètre, ni plus ni moins.** En deçà, l'œil lit un défaut d'alignement
   * plutôt qu'une intention ; au-delà, les teintes du milieu ne montrent plus qu'un croissant
   * et le nuancier cesse d'être lisible. À trente-huit pixels cela fait neuf, donc un pas de
   * vingt-neuf d'un centre au suivant.
   */
  const recouvrement = Math.round(taille * 0.24);
  const pas = taille - recouvrement;
  /**
   * ⚠️ **Une rangée sur deux est décalée d'un demi-pas.** Sans ce décalage les chevauchements
   * s'alignent en colonnes et redessinent la grille qu'on vient de quitter. En quinconce,
   * chaque pastille se loge dans le creux de ses deux voisines du dessus.
   */
  const decalage = Math.round(pas / 2);
  /**
   * Le pas vertical d'une rangée à l'autre.
   *
   * ⚠️ **`pas · √3/2`, et ce n'est pas un réglage mais la seule valeur juste.** Les deux
   * rangées se chevauchaient de la même quantité que deux voisines de la même ligne — neuf
   * pixels — et cela paraissait **moins** superposé. Signalé à l'usage. La raison est
   * géométrique : la rangée du bas étant décalée d'un demi-pas, deux pastilles de rangées
   * voisines sont séparées en diagonale, non à la verticale. À neuf pixels d'écart vertical
   * leurs centres étaient à √(14,5² + 29²) = 32,4 l'un de l'autre, contre 29 sur une même
   * ligne : elles se mordaient donc bel et bien moins.
   *
   * Pour que le recouvrement se voie identique partout, il faut égaler les distances entre
   * centres : √((pas/2)² + v²) = pas, d'où v = pas · √3/2 — le pas d'un réseau hexagonal.
   * Vingt-cinq pixels ici, soit treize de recouvrement vertical contre neuf d'horizontal.
   * Deux nombres différents pour un même effet à l'œil.
   */
  const pasVertical = Math.round(pas * Math.sqrt(3) / 2);

  const rangees = [];
  for (let i = 0; i < COULEURS_AVATAR.length; i += parRangee) {
    rangees.push(COULEURS_AVATAR.slice(i, i + parRangee));
  }

  return (
    /**
      * ⚠️ **Deux enveloppes, et il en faut deux.** La bande mesure 299 pixels là où la fenêtre
      * en offre 430 : alignée à gauche elle laissait cent trente pixels de vide à droite, qui
      * se lisaient comme un oubli. Mais centrer les **rangées** entre elles casse la
      * quinconce — la seconde étant plus courte d'une pastille, elle se recentrait de sept
      * pixels et son décalage passait de quinze à vingt-deux. Mesuré. C'est donc le **bloc**
      * qui se centre, pendant que les rangées restent alignées à gauche l'une sur l'autre.
      */
    <div style={{ display: "flex", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        {rangees.map((rangee, r) => (
          <div key={r} style={{
            display: "flex",
            marginTop: r === 0 ? 0 : -(taille - pasVertical),
            marginLeft: r % 2 === 1 ? decalage : 0,
          }}>
            {rangee.map((c, i) => (
              /**
                * ⚠️ **Le décalage est porté par une enveloppe, jamais par la pastille** :
                * celle-ci s'agrandit au survol et à la sélection, et une marge posée sur elle
                * serait emportée par le même `transform`.
                *
                * ⚠️ **Et cette enveloppe est `flex`, pas un bloc ordinaire.** Un bouton est
                * un élément en-ligne : dans un bloc, il crée une ligne de texte et hérite de
                * l'espace réservé aux jambages sous la ligne de base. Mesuré — la rangée
                * faisait 45 pixels de haut pour des pastilles de 38, et les sept pixels
                * fantômes s'ajoutaient au pas vertical, qui passait de 25 à 32. En contexte
                * flexible, il n'y a plus de ligne de texte, donc plus de jambages.
                */
              <div key={c.hex} style={{
                display: "flex", marginLeft: i === 0 ? 0 : -recouvrement,
              }}>
                <PastilleCouleur couleur={c.hex} titre={c.nom} taille={taille}
                  retenue={skin === "uni" && c.hex.toLowerCase() === couleur.toLowerCase()}
                  onClick={() => onChoisir(c.hex)} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * La part de sa boîte que chaque silhouette occupe en largeur.
 *
 * ⚠️ **Toutes ne la remplissent pas, et c'est ce qui faussait la rangée.** L'ajustement des
 * volumes ramène chaque forme au même encombrement en prenant sa **plus grande** dimension :
 * le rond touche les quatre bords, mais l'hexagone n'occupe que 91 % de la largeur et la
 * goutte 82 %, le reste étant du vide transparent. Espacées par leurs boîtes, les huit
 * paraissaient donc irrégulièrement écartées — mesuré à l'écran : des vides de 4, 4, 5,8,
 * 5,8, 4, 4 et 7,3 pixels là où l'on croyait en poser huit fois quatre.
 *
 * ⚠️ **Et c'est de là que venait le mouvement latéral au survol.** Une forme qui grandit
 * mange 1,9 pixel de chaque côté : sur un vide de 4 cela en referme la moitié, sur un vide de
 * 7,3 le quart. Les deux côtés se resserraient donc à des vitesses différentes, ce que l'œil
 * lit comme un glissement. Signalé à l'usage. Les couleurs n'avaient pas ce défaut parce
 * qu'elles se chevauchent : il n'y a aucun vide à refermer.
 */
const PART_LARGEUR: Record<FormeAvatar, number> = FORMES_AVATAR.reduce((table, cle) => {
  table[cle] = solideDepuis(FAMILLE_AVATAR[cle], ARRONDI_REFERENCE).demiLargeur ?? 1;
  return table;
}, {} as Record<FormeAvatar, number>);

/**
 * Le point d'une silhouette qui ne bouge pas quand on l'agrandit.
 *
 * ⚠️ **Le centre d'une boîte n'est pas le centre d'une forme, et c'est toute l'affaire.**
 * Agrandir autour d'un point `P` envoie chaque point `Q` sur `P + s·(Q−P)` : seul `P` reste
 * immobile, tout le reste s'en éloigne. Si la matière de la forme n'est pas répartie autour
 * de `P`, son centre de gravité — le point que l'œil suit — s'éloigne lui aussi, et le
 * grossissement se lit comme un glissement.
 *
 * ⚠️ **C'est pour cela que les couleurs ne posaient pas le problème.** Un disque a son centre
 * de gravité exactement au milieu de sa boîte : l'agrandir autour de ce milieu ne déplace
 * rien, on ne voit que la croissance. La goutte, elle, porte sa masse en bas et sa pointe en
 * haut ; le triangle porte la sienne au tiers de sa base. Agrandies autour du milieu de leur
 * boîte, elles **descendent** — signalé à l'usage, et c'est exactement ce que la géométrie
 * prévoit.
 *
 * ⚠️ **Deux fausses pistes avant celle-ci, toutes deux écartées par la mesure.** L'écart entre
 * boîtes voisines, corrigé pour de bon mais sans rapport avec ce mouvement-ci. Puis l'ancrage
 * au pied, qui supprimait bien la descente — mais en la remplaçant par une montée de la même
 * ampleur : on ne corrige pas un déplacement en le retournant.
 *
 * ⚠️ **Le centroïde se calcule sur le contour, par la formule des aires signées.** Il ne
 * s'estime pas à l'œil et il ne se tabule pas à la main : une neuvième forme ajoutée demain
 * doit obtenir le sien sans que personne y pense.
 */
function centroide(points: readonly { x: number; y: number }[]): { x: number; y: number } {
  let aire = 0, cx = 0, cy = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length];
    const croix = p.x * q.y - q.x * p.y;
    aire += croix;
    cx += (p.x + q.x) * croix;
    cy += (p.y + q.y) * croix;
  }
  /* Un contour dégénéré n'a pas de centre de gravité : on rend le milieu de la boîte, qui
     est le comportement par défaut du navigateur. */
  if (Math.abs(aire) < 1e-9) return { x: 0, y: 0 };
  return { x: cx / (3 * aire), y: cy / (3 * aire) };
}

/**
 * L'origine du grossissement de chaque silhouette, en pourcentage de sa boîte.
 *
 * ⚠️ **Le contour vit dans un repère centré de rayon 100**, donc de −100 à +100 sur chaque
 * axe : une coordonnée `c` tombe à `(c + 100) / 2` pour cent de la boîte. Calculé une fois
 * au chargement, sur un contour fin — la précision du centroïde ne coûte rien ici, alors
 * qu'elle coûterait à chaque image dans le rendu de l'avatar.
 */
const CENTROIDE: Record<FormeAvatar, { x: number; y: number }> =
  FORMES_AVATAR.reduce((table, cle) => {
    table[cle] = centroide(contourSilhouette(
      solideDepuis(FAMILLE_AVATAR[cle], ARRONDI_REFERENCE), RAYON_TETE, 720));
    return table;
  }, {} as Record<FormeAvatar, { x: number; y: number }>);

/**
 * L'origine du grossissement, en pixels entiers.
 *
 * ⚠️ **En pixels et non en pourcentage, pour qu'elle tombe juste.** Un pourcentage se résout
 * en une valeur fractionnaire — `18,867px`, `23,3662px` sur les formes mesurées — que le
 * compositeur de WebKit arrondit à sa façon au moment où il crée la couche. Arrondir ici
 * plutôt que de le laisser faire coûte au plus un demi-pixel d'écart au centre de gravité,
 * soit six centièmes de pixel de dérive à l'agrandissement : invisible, et surtout stable.
 */
const ORIGINE_SURVOL = (forme: FormeAvatar, taille: number): string => {
  const c = CENTROIDE[forme];
  const enPixels = (v: number) => Math.round(((v + 100) / 200) * taille);
  return `${enPixels(c.x)}px ${enPixels(c.y)}px`;
};

/**
 * Les huit silhouettes.
 *
 * ⚠️ **Une silhouette est le même objet qu'une pastille de couleur, au masque près.** C'est
 * la leçon de quatre corrections ratées. Ces vignettes étaient des `<svg>` posées dans un
 * bouton ; les pastilles, elles, sont des boutons unis. Deux objets de nature différente, et
 * WebKit ne les compose pas pareil : la forme se décalait d'un pixel au démarrage de
 * l'agrandissement là où la couleur ne bougeait pas. Signalé quatre fois, invisible sur
 * Chromium — donc invisible pour moi, quelle que soit la finesse de mes mesures.
 *
 * ⚠️ **Le contour est passé en masque CSS, et le fond porte la couleur.** Le bouton devient
 * alors *exactement* ce qu'est une pastille : une surface teintée, découpée. Plus de nœud
 * `<svg>` à l'intérieur, plus de mise en page à centrer, plus de tracé vectoriel à
 * redessiner. Ce que le navigateur fait à l'une, il le fait à l'autre — c'est la seule
 * garantie que je puisse donner sans avoir le navigateur en question sous la main.
 *
 * ⚠️ **Ni `transform-origin`, ni classe à part, ni couche de composition.** Ces trois
 * réglages ont été essayés puis retirés : chacun visait un déplacement réel mais minuscule,
 * et chacun **éloignait** un peu plus la silhouette du comportement de la pastille, alors que
 * c'est précisément ce comportement-là qui était demandé. Le seul écart restant est le
 * facteur d'agrandissement, qui ne peut pas déplacer un objet : il ne fait que le dilater
 * autour de son centre.
 *
 * ⚠️ **Ce que le masque coûte.** L'avatar n'est plus rendu ici : la vignette montre la
 * silhouette et la couleur, mais plus l'habillage. C'est acceptable — l'habillage recouvre la
 * tête et ne dit rien de sa forme, qui est la seule question posée par cette rubrique.
 *
 * ⚠️ **Plus de case, plus de liseré, plus d'infobulle.** Chaque forme vivait dans un carré
 * arrondi teinté, la retenue gagnait un bord coloré, le survol sortait le nom dans une boîte
 * du système : les trois choses qu'on venait de retirer aux couleurs, une rubrique plus haut.
 *
 * ⚠️ **Et sans yeux.** Ce qui distingue ces huit vignettes est leur contour ; deux yeux
 * identiques répétés huit fois n'y ajoutent rien. Le visage reste sur l'aperçu, en grand.
 *
 * ⚠️ **Rien ne désigne la silhouette retenue, comme pour les couleurs.** C'est l'aperçu qui
 * répond — il porte la forme choisie à soixante-seize pixels, juste au-dessus. `aria-pressed`
 * garde l'état pour qui n'a pas l'image.
 *
 * ⚠️ **Elles ne se chevauchent pas, elles.** Une couleur recouverte reste lisible : il en
 * subsiste toujours un morceau d'aplat. Une silhouette mordue, non — c'est son contour entier
 * qui porte l'information.
 */

/**
 * Le masque de chaque silhouette, prêt à poser en fond.
 *
 * ⚠️ **Calculé une fois au chargement.** Le tracé ne dépend que de la forme ; le recomposer
 * à chaque rendu ferait un texte de deux mille caractères par vignette et par frappe au
 * clavier, puisque le panneau se redessine à chaque lettre du nom.
 *
 * ⚠️ **Encodé, faute de quoi rien ne s'affiche.** Un `data:` d'image SVG contient des
 * chevrons, des dièses et des guillemets, qui ferment l'URL au premier rencontré. Le défaut
 * est silencieux : pas d'erreur, juste un masque vide, donc un bouton invisible.
 */
const MASQUE: Record<FormeAvatar, string> = FORMES_AVATAR.reduce((table, cle) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200">`
    + `<path d="${contourDeForme(cle)}" fill="#000"/></svg>`;
  table[cle] = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  return table;
}, {} as Record<FormeAvatar, string>);

export function ChoixSilhouette({
  forme, onChoisir, couleur, taille = 38, ecart = 6,
}: {
  forme: FormeAvatar;
  onChoisir: (v: FormeAvatar) => void;
  couleur: string;
  /**
   * Le côté d'une vignette.
   *
   * ⚠️ **Exactement le diamètre d'une pastille de couleur.** À taille égale, le facteur
   * partagé donne le même agrandissement en pixels — 3,8 — et les deux rubriques répondent
   * pareil sous le curseur.
   */
  taille?: number;
  /**
   * L'écart entre deux vignettes — **d'encre à encre, et non de boîte à boîte**.
   *
   * ⚠️ Toutes les formes ne remplissent pas leur boîte : la goutte n'en occupe que 82 % en
   * largeur, l'hexagone 91 %. Espacées par leurs boîtes, les huit paraissaient
   * irrégulièrement écartées — mesuré 4, 4, 5,8, 5,8, 4, 4 et 7,3 pixels. Chaque vignette
   * reçoit donc une marge négative égale au vide que sa forme laisse.
   *
   * ⚠️ **Ces marges sont arrondies au pixel entier.** Fractionnaires, elles posaient chaque
   * vignette à une sous-position différente de ses voisines, et WebKit aligne sur la grille
   * de pixels tout élément qu'il compose — d'où un saut au démarrage de l'agrandissement. Les
   * pastilles de couleur, dont les marges valent 0 et −9, n'ont jamais eu ce défaut.
   */
  ecart?: number;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: ecart }}>
      {FORMES_AVATAR.map(cle => {
        const encre = Math.round(taille * PART_LARGEUR[cle]);
        const vide = Math.round((taille - encre) / 2);
        return (
          <button key={cle} type="button" onClick={() => onChoisir(cle)}
            aria-pressed={forme === cle}
            aria-label={`Silhouette ${NOM_FORME[cle].toLowerCase()}`}
            className="nv-pastille"
            style={{
              width: taille, height: taille, padding: 0, border: 0, cursor: "pointer",
              /* Le fond porte la couleur, le masque porte la forme. Rien d'autre. */
              background: couleur,
              maskImage: MASQUE[cle], WebkitMaskImage: MASQUE[cle],
              maskSize: "contain", WebkitMaskSize: "contain",
              maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat",
              maskPosition: "center", WebkitMaskPosition: "center",
              marginLeft: -vide, marginRight: -vide,
              /* Le facteur qui donne à cette forme la même croissance en pixels qu'aux
                 autres — voir `.nv-pastille:hover` dans `globals.css`. Un facteur dilate
                 autour du centre : il ne peut pas déplacer la vignette. */
              ["--nv-survol" as string]: (1 + (taille * 0.10) / encre).toFixed(4),
            }}/>
        );
      })}
    </div>
  );
}
