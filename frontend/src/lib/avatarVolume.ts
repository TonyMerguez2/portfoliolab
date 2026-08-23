import type { Vec3 } from "./avatarSpherique";

/**
 * Les volumes que la tête peut prendre, et rien d'autre.
 *
 * ⚠️ **Un descripteur plutôt qu'un exposant.** Tant qu'il n'y avait qu'une famille — la
 * superellipsoïde, du disque au cube — un simple nombre suffisait, et il traversait
 * toute la chaîne. L'étoile n'entre pas dans ce nombre : ce n'est pas le même calcul,
 * seulement le même *rôle*. Le faire passer pour un exposant aurait demandé une valeur
 * sentinelle, c'est-à-dire un mensonge que chaque fonction traversée aurait dû connaître.
 *
 * ⚠️ **Tous les volumes sont *étoilés* au sens géométrique** : leur surface se décrit par
 * un rayon en fonction de la direction. C'est cette propriété, et elle seule, qui permet
 * de garder toute la chaîne existante — poser la forme sur la sphère, la tourner, la
 * couper, la projeter — en n'ajoutant qu'une mise à l'échelle radiale. Un volume qui ne
 * l'aurait pas — un tore, une forme creusée — demanderait de tout reprendre.
 *
 * ⚠️ **Aucun ne sort de son carré, et c'est là l'invariant.** Il ne porte pas sur le
 * rayon — le cube pousse vers les coins et atteint 1,37 dans la direction d'une arête,
 * les étoiles creusent et descendent sous 1 — mais sur l'**encombrement** : la silhouette
 * reste dans le carré de côté 2, qu'elle touche sur les axes. Changer de forme ne change
 * donc pas la place que la tête occupe. Le coussin, écrasé, n'en occupe que les trois
 * quarts en hauteur : il ne dépasse pas davantage, il en prend moins.
 */

type FormeSolide =
  /** La sphère, où la silhouette et la surface tiennent toutes deux en place. */
  | { famille: "sphere" }
  /** La superellipsoïde |x|ⁿ + |y|ⁿ + |z|ⁿ = 1 : du disque au cube arrondi. */
  | { famille: "cube"; exposant: number }
  /**
   * L'étoile adoucie : une sphère pincée entre quatre lobes, autour de l'axe du regard.
   *
   * Le rayon vaut `1 − creux · 2x²y²`, et chacun des trois facteurs compte :
   *
   * ⚠️ **Rien sur `z`, donc aucune pointe devant ni derrière.** La première version
   * creusait autour des six axes, y compris celui du regard : les yeux voyageaient alors
   * en plein dans un creux, et la concavité y rapproche le bord visible au point de les
   * couper dès dix degrés de lacet. Ici le terme s'annule dès qu'on quitte le plan de
   * l'écran, si bien que le chemin du centre du visage jusqu'aux lobes latéraux reste
   * **exactement sphérique** — c'est précisément le chemin que parcourent les yeux.
   *
   * ⚠️ **`x²y²` et non `x⁴+y⁴`.** Les deux donnent la même modulation à quatre lobes dans
   * le plan de l'écran ; mais `x⁴+y⁴` vaut zéro au pôle du regard, ce qui y creuserait un
   * trou, tandis que `x²y²` s'y annule — pas de creux, pas de pointe, la surface y passe
   * lisse.
   */
  | { famille: "etoile"; creux: number }
  /**
   * La même à six lobes : `1 − creux · (3x²y − y³)²`.
   *
   * Le facteur vaut `ρ⁶ sin²(3θ)` dans le plan de l'écran — six creux, six lobes — et il
   * s'annule sur **trois** grands cercles au lieu de deux.
   */
  | { famille: "etoile6"; creux: number }
  /**
   * Le coussin : une **capsule couchée** — un cylindre à bouts hémisphériques.
   *
   * Côtés haut et bas rigoureusement droits, bouts entièrement ronds. C'est la forme la
   * plus simple à décrire et la plus difficile à obtenir par modulation : un cube écrasé
   * donne des coins, un pincement des pôles donne un bord mou. Ici la surface est
   * définie par sa **distance à un segment**, ce qui donne exactement la capsule.
   *
   * `rayon` est celui des bouts ; le segment porte le reste, `1 − rayon` de demi-longueur.
   */
  | { famille: "coussin"; rayon: number }
  /**
   * L'hexagone : trois paires de plans, sommet en haut.
   *
   * `1 / (Σₖ |u·nₖ|ⁿ + |z|ⁿ)^(1/n)` avec les normales à 0°, 60° et 120°. La première
   * bande vaut `|x| ≤ 1` : les côtés plats sont donc **verticaux**, et les sommets
   * tombent en haut et en bas. C'est la même construction que le carré, à une direction
   * près — le carré n'en ferme que deux.
   */
  | { famille: "hexagone"; exposant: number }
  /**
   * Le triangle : trois demi-plans, pointe en haut.
   *
   * ⚠️ **Des demi-plans et non des bandes, et c'est ce qui change tout.** Une bande
   * `|u·n| ≤ h` contraint des deux côtés : trois bandes font un hexagone, jamais un
   * triangle. Il faut ne retenir que le côté positif — `max(0, u·n)` — pour que les trois
   * contraintes ferment trois côtés seulement. La somme des puissances arrondit ensuite
   * les sommets, exactement comme sur le carré.
   */
  | { famille: "triangle"; exposant: number }
  /**
   * La goutte : un corps rond surmonté d'une vraie pointe.
   *
   * ⚠️ **La pointe est possible, contrairement à ce que je croyais.** Une surface
   * radiale est ronde à ses pôles tant que le rayon y est *dérivable* ; il suffit qu'il
   * y présente un **coin** pour que la tangente saute et que la pointe apparaisse. Le
   * terme en `exp(−φ/finesse)`, où `φ` est l'angle depuis le sommet, a exactement ce
   * coin en zéro : la dérivée y vaut `−1/finesse` d'un côté et `+1/finesse` de l'autre.
   *
   * `corps` est le rayon du corps rond, la pointe atteignant 1 ; `finesse` commande
   * l'angle du cône — plus elle est petite, plus la pointe est fine.
   */
  | { famille: "goutte"; corps: number; finesse: number }
  /**
   * Le nuage : l'**union de cinq boules**, large en bas, deux lobes en haut.
   *
   * ⚠️ **Une union, et non une modulation du rayon.** Toutes les autres familles partent
   * de la sphère et la déforment ; un nuage ne se laisse pas décrire ainsi — ses bosses
   * sont des renflements *locaux*, et une modulation qui les produirait creuserait
   * ailleurs. L'union est exacte et tient en une ligne : le rayon dans une direction est
   * la plus lointaine des intersections avec les boules. Elle n'est valable que tant que
   * l'origine est **dedans**, ce qui est le cas ici — les trois grosses boules se
   * recouvrent au centre.
   *
   * ⚠️ **Des boules et non des disques, alors que la référence est plate.** Le contour de
   * face est le même dans les deux cas, puisque les centres sont tous à `z = 0` ; mais
   * l'avatar a besoin d'un **volume**, pas d'un contour : les yeux s'ancrent dessus et
   * l'habillage s'y détoure. Un profil plat aurait donné une silhouette juste et un
   * regard posé dans le vide.
   *
   * Disposition reprise de `bloub` (licence MIT, voir `NOTICES/bloub.txt`), aux ordonnées
   * retournées — voir `BOULES_NUAGE`.
   */
  | { famille: "nuage" }
  /**
   * Deux volumes à la fois, pour passer de l'un à l'autre.
   *
   * ⚠️ **C'est le rayon qu'on mélange, pas l'image.** Fondre deux dessins l'un dans
   * l'autre donne un fantôme : pendant la transition on voit deux formes superposées,
   * jamais une forme intermédiaire. Or ici toutes les familles disent la même chose — un
   * **rayon par direction** — si bien que leur moyenne pondérée en est un aussi, et
   * décrit un volume parfaitement légitime. Le triangle devient rond en passant par des
   * triangles de plus en plus émoussés, pas par une surimpression.
   *
   * ⚠️ **Et tout le reste suit sans une ligne de plus.** La silhouette, les yeux, le
   * détourage de l'habillage se déduisent tous du rayon : il n'y a rien à animer
   * séparément, donc rien qui puisse se désynchroniser en route. C'est le bénéfice qu'on
   * paie depuis le début en décrivant les formes par une fonction plutôt que par un
   * tracé.
   */
  | { famille: "melange"; de: Solide; vers: Solide; part: number };

/**
 * Un volume, avec l'échelle qui le fait tenir dans le carré de la tête.
 *
 * ⚠️ **Sans elle, changer de forme change la taille du personnage.** Le triangle ne
 * mesurait que 148 unités de large contre 200 pour le rond, et la goutte 140 : à côté
 * d'un nom de portefeuille, cela se lit comme un avatar plus petit, pas comme une autre
 * forme. L'échelle se calcule une fois, en cherchant le plus grand écart aux deux axes
 * sur la silhouette de face, et ramène chaque forme au même encombrement.
 */
export type Solide = FormeSolide & {
  echelle?: number;
  /**
   * Le décalage qui recentre la forme dans le carré de la tête.
   *
   * ⚠️ **Une forme radiale n'est pas centrée sur son origine.** Le triangle a sa pointe à
   * un rayon et sa base à un demi : mesuré, il occupait `y ∈ [−0,59 ; 1]`, donc il
   * flottait en haut de son cadre. La goutte de même. Comme la description radiale ne
   * connaît que des rayons, le recentrage se fait à la projection — sur tout ce qui est
   * dessiné, yeux compris, pour que le regard reste au milieu de la forme et non au
   * milieu du cadre.
   */
  decalage?: { x: number; y: number };
  /** La demi-largeur de la silhouette, dont dépend l'écartement des yeux. */
  demiLargeur?: number;
  /**
   * Le regard se pose sur une **sphère** au lieu de la vraie surface.
   *
   * ⚠️ **Une entorse assumée, et une seule forme la demande.** La loi du regard veut que
   * l'œil soit peint sur la surface : c'est ce qui donne un œil droit sur une face plate et
   * plié sur une arête, sans le moindre facteur. Elle a une limite, et le nuage la franchit —
   * son contour est fait de cinq bosses, si bien que le bord est à 74 unités à une hauteur et
   * à 95 à la suivante. L'œil y arrive donc de travers, s'y enroule, et se tord : relevé 11,0
   * unités de courbure contre 6,9 sur le cube et 4,5 sur la sphère, et jusqu'à 2,34 fois sa
   * largeur de repos.
   *
   * Plutôt que de compliquer la loi pour une forme compliquée, on lui donne un support
   * simple : le regard se promène sur une sphère, et c'est la silhouette du nuage qui le
   * découpe. L'œil se comporte alors exactement comme sur la sphère — droit, il rétrécit sans
   * à-coup, il passe derrière — et il ne peut pas dépasser puisqu'il est coupé au contour.
   */
  regardRond?: boolean;
};

export const SPHERE: Solide = { famille: "sphere" };

/**
 * Le volume à mi-chemin entre deux autres.
 *
 * ⚠️ **Il faut le remettre à l'échelle, et j'avais démontré le contraire.** Le
 * raisonnement tenait à moitié : les deux volumes sont bornés par le carré de la tête,
 * donc leur moyenne l'est aussi — le mélange ne peut pas **déborder**. J'en avais conclu
 * qu'aucun réajustement n'était nécessaire, et le test que j'avais écrit ne vérifiait que
 * ce sens-là. Or une moyenne peut très bien **rétrécir** : la sphère atteint son maximum
 * dans toutes les directions, le triangle seulement dans trois, si bien que leur moyenne
 * ne l'atteint nulle part. Mesuré sur la page, la tête passait de 200 unités de large à
 * 190 au milieu du passage avant de revenir à 200 — un pincement, puis un regonflement.
 * C'est exactement ce qui se voyait, et ce qui se lisait comme un défaut de fluidité.
 *
 * Le mélange est donc mesuré et remis à l'échelle comme n'importe quel volume. Trois
 * cent soixante directions suffisent : c'est une échelle, pas une silhouette, et le pas
 * plus fin coûterait à chaque image d'une transition.
 *
 * ⚠️ **Le recentrage se recalcule aussi, il ne s'interpole pas.** Le décalage d'un volume
 * dépend de sa silhouette ; celle du mélange n'est pas la moyenne des deux silhouettes,
 * seulement celle du rayon moyen. Interpoler les deux décalages faisait dériver la tête
 * de quelques unités en cours de route, un glissement latéral qui n'a rien à faire là.
 */
export function melangerSolides(de: Solide, vers: Solide, part: number): Solide {
  const t = Math.min(1, Math.max(0, part));
  if (t <= 0) return de;
  if (t >= 1) return vers;
  return ajuster({ famille: "melange", de, vers, part: t }, 360);
}

/**
 * L'amplitude maximale du creusement.
 *
 * ⚠️ **Bornée par ce que le regard supporte, pas par ce qui est joli.** Un creux
 * concave rapproche le bord visible : la surface s'y détourne avant le quart de tour, et
 * l'œil qui passe par là se trouve coupé bien plus tôt que sur une sphère. Mesuré, à
 * quatre-vingt-seize centièmes de creux — ce que donnait le premier réglage — l'œil
 * commençait à être rogné dès **dix degrés de lacet** en volume tournant, là où la sphère
 * tient jusqu'à cinquante-sept. Le visage montrait alors un croissant d'œil collé au bord
 * en permanence : ce que l'on prend pour un défaut d'affichage, et qui n'est que la
 * géométrie d'un creux trop profond.
 *
 * Le pincement ne portant plus sur l'axe du regard, cette contrainte s'est desserrée :
 * les yeux ne traversent plus de creux du tout. Soixante-douze centièmes donnent un
 * pincement d'un peu plus du tiers au bout de la course, et de dix-huit pour cent au
 * réglage de l'application — le galbe de la référence.
 */
const AMPLEUR_ETOILE = 0.72;

/**
 * Le solide correspondant à une forme et à un réglage d'arrondi.
 *
 * `arrondi` vaut 1 pour la forme la plus ronde et 0 pour la plus marquée, dans les deux
 * familles : c'est le même curseur qui sert aux deux, et il va toujours du plus doux au
 * plus franc.
 */
/**
 * Les familles qu'on peut **choisir**.
 *
 * ⚠️ Le mélange en est exclu, et le compilateur y tient : c'est un état de transition,
 * pas une forme. L'y laisser entrer aurait permis de demander « la forme mélange » à
 * `solideDepuis`, qui n'a alors ni volume de départ ni volume d'arrivée à quoi se
 * raccrocher.
 */
export type FamilleSolide = Exclude<Solide["famille"], "melange">;

/**
 * L'ampleur maximale de chaque famille, atteinte au bout de la course du réglage.
 *
 * ⚠️ **Une par famille, parce qu'elles ne se creusent pas au même rythme.** Le même
 * nombre appliqué à toutes donnerait un galet ridicule là où l'étoile serait à peine
 * marquée : ce que le curseur commande, c'est « du plus doux au plus franc », pas une
 * grandeur physique commune.
 */
const AMPLEUR: Record<"etoile" | "etoile6", number> = {
  etoile: AMPLEUR_ETOILE,
  /**
   * ⚠️ Plus prudente que l'étoile à quatre lobes, à profondeur égale : six creux serrés
   * font une silhouette qui se replie sur elle-même, et le contour y laisse alors de
   * petits éclats sombres — le remplissage ne sait pas quel côté est l'intérieur.
   */
  etoile6: 0.3,
};

/** Le rayon des bouts de la capsule : ce qui reste porte sa longueur. */
const RAYON_COUSSIN = 0.62;

/**
 * Les cinq boules du nuage, reprises de `bloub` (MIT — voir `NOTICES/bloub.txt`).
 *
 * Trois grosses qui portent la masse en bas, deux plus petites qui font les lobes en haut.
 *
 * ⚠️ **Les ordonnées sont l'opposé de celles de la référence, et ce n'est pas une
 * coquille.** `bloub` dessine dans le repère de l'écran, où `y` croît vers le bas ; le
 * volume de l'avatar suit la convention mathématique, où `y` croît vers le haut — c'est
 * elle que suivent déjà la pointe de la goutte et le sommet du triangle. Reprises telles
 * quelles, les boules donnaient un nuage **retourné** : la masse en haut et les deux
 * lobes en dessous, ce qui se lit comme une flaque plutôt que comme un nuage. Vérifié à
 * l'écran, pas déduit.
 *
 * Les rayons ne sont pas normalisés ici : `ajuster` s'en charge, comme pour les autres
 * familles.
 */
/**
 * La dureté du maximum lisse qui soude les boules du nuage.
 *
 * ⚠️ **Mesurée, pas choisie.** Plus la valeur est grande, plus la jonction est franche — et
 * plus l'œil s'y plie ; plus elle est petite, plus le nuage gonfle entre ses boules et perd
 * ses lobes. Relevé du coude du contour de l'œil, qui vaut 12° sur une forme lisse :
 * douceur 8 → 12°, 14 → 12°, **25 → 12°**, 40 → 14°. On garde donc la jonction la plus
 * franche qui ne plie plus le regard, pour ne rien perdre du dessin.
 */
const DOUCEUR_NUAGE = 25;

/**
 * Les cinq boules du nuage, telles que la référence les pose.
 *
 * ⚠️ **La disposition est celle de `bloub`, et elle le reste.** J'ai remplacé un temps ces
 * cinq boules par une grosse coupole centrale entourée de quatre écartées, pour que l'œil ne
 * traverse plus de raccord — le défaut était réel et la mesure bonne (courbure de l'œil au
 * repos 3,29 → 0,06). Mais la silhouette obtenue n'était plus un nuage : une flaque à deux
 * bosses. Un défaut de regard ne justifie pas de redessiner la forme, et la forme n'était pas
 * la mienne à changer. Le raccord des boules se traite dans la loi du regard, pas ici.
 *
 * ⚠️ **Le relief ne se voit plus que dans le contour : le devant est plat.** L'œil est peint
 * *sur* la surface — sur un volume bosselé, il épouse les bosses et ondule. C'était juste et
 * c'était laid. La forme demandée est donc « plate mais en relief » : la section reste
 * exactement celle des cinq boules, l'épaisseur s'y ajoute comme une superellipse. Mesuré :
 * la profondeur ne bouge pas d'un centième du milieu du visage jusqu'à quarante-cinq degrés,
 * et la courbure de l'œil au repos tombe de 3,0 à 0,04.
 */
/**
 * L'épaisseur de la dalle, et la franchise de son arête.
 *
 * ⚠️ **Ni l'une ni l'autre ne touche à la silhouette.** À `z = 0` le rayon vaut la section
 * quelles que soient leurs valeurs : le contour dessiné est le même à toutes. Elles ne règlent
 * que ce que le regard rencontre en glissant vers le bord.
 *
 * ⚠️ **L'arête est de nouveau arrondie, et la raison qui l'avait rendue franche a disparu.**
 * Elle avait été durcie pour empêcher l'œil de s'enrouler sur la tranche en atteignant le
 * bord — un vrai défaut, mesuré : largeur du tracé 24 → 30 alors que le cube passe de 23 à 4.
 * Mais le regard ne se promène plus sur le nuage : il se promène sur une sphère, et c'est la
 * silhouette qui le découpe (voir `regardRond`). La tranche ne le concerne donc plus, et rien
 * n'oblige plus le volume à être un emporte-pièce. On lui rend son galbe.
 *
 * Relevé « courbure de l'axe de l'œil au repos / à 20° de lacet », à demi-épaisseur 0,62 :
 * arrondi 4 → 0,25 / 1,35 ; 8 → 0,04 / 0,22 ; 24 → 0,04 / 0,01 ; **40 → 0,04 / 0,01**. Et à
 * arrondi 6, en épaississant : 0,55 → 0,43 ; 0,62 → 0,56 ; 0,75 → 0,90 ; 0,90 → 1,53 — plus la
 * dalle est épaisse, plus le regard quitte tôt le plat pour l'arête.
 */
const DALLE_NUAGE = { demi: 0.62, arrondi: 8 };

/**
 * La section du nuage dans son plan : l'union adoucie des cinq boules.
 *
 * ⚠️ **En deux dimensions, alors que les boules en ont trois.** C'est le même calcul qu'avant
 * — la plus lointaine des intersections, adoucie —, mais mené sur une direction du plan : la
 * troisième dimension n'est plus portée par les boules, elle l'est par l'épaisseur de la
 * dalle. Les centres étant tous à `z = 0`, la section obtenue est identique au contour que
 * donnait l'union en volume.
 */
function sectionNuage(dx: number, dy: number): number {
  let loin = 0;
  const distances: number[] = [];
  for (const b of BOULES_NUAGE) {
    const proj = dx * b.x + dy * b.y;
    const disc = proj * proj - (b.x * b.x + b.y * b.y - b.r * b.r);
    if (disc < 0) continue;
    const t = proj + Math.sqrt(disc);
    distances.push(t);
    if (t > loin) loin = t;
  }
  if (distances.length < 2) return loin;
  /* Le maximum est mis en facteur pour que l'exponentielle ne déborde jamais. */
  let somme = 0;
  for (const t of distances) somme += Math.exp(DOUCEUR_NUAGE * (t - loin));
  return loin + Math.log(somme) / DOUCEUR_NUAGE;
}

const BOULES_NUAGE: Array<{ x: number; y: number; r: number }> = [
  { x: -0.44, y: -0.2, r: 0.54 },
  { x: 0.02, y: -0.3, r: 0.6 },
  { x: 0.46, y: -0.2, r: 0.5 },
  { x: -0.24, y: 0.3, r: 0.48 },
  { x: 0.3, y: 0.24, r: 0.44 },
];
/** Le corps de la goutte, et la finesse de sa pointe. */
const GOUTTE = { corps: 0.7, finesse: 0.22 };

/**
 * Les trois directions qui ferment l'hexagone.
 *
 * ⚠️ Quatre-vingt-dix degrés en tête, et non zéro : la première bande devient alors
 * `|y| ≤ 1`, ce qui donne un **côté plat en haut et en bas**. Partie de zéro, la forme
 * aurait un sommet en haut — un hexagone posé sur la pointe, qu'on ne lit plus comme
 * une tête.
 */
const ANGLES_HEXAGONE = [0, 60, 120].map(a => (a * Math.PI) / 180);

/**
 * Les trois axes d'un cube dont la grande diagonale nous fait face.
 *
 * ⚠️ **Leur somme vaut l'axe du regard, et c'est toute la construction.** Un cube dont la
 * diagonale `(1,1,1)` pointe vers l'observateur se projette en hexagone régulier : il suffit
 * donc de trois axes orthonormés dont la somme, normalisée, soit `(0,0,1)`. Ceux-ci sont
 * choisis pour poser en plus un **sommet en haut**, faute de quoi l'hexagone tournerait de
 * trente degrés et se lirait comme un écrou.
 */
const AXES_CUBE_COIN = [
  { x: -0.408248290463863, y: 0.707106781186548, z: 0.577350269189626 },
  { x: 0.816496580927726, y: -0.000000000000000, z: 0.577350269189626 },
  { x: -0.408248290463863, y: -0.707106781186548, z: 0.577350269189626 },
];

/**
 * Les trois normales sortantes du triangle, sommet en haut.
 *
 * ⚠️ Sortantes, donc l'une pointe vers le bas : c'est elle qui ferme la base. Prises
 * toutes trois vers le haut, les contraintes ne fermeraient rien.
 */
const NORMALES_TRIANGLE = [-90, 30, 150].map(a => (a * Math.PI) / 180)
  .map(a => ({ x: Math.cos(a), y: Math.sin(a) }));
/** La distance du centre à chaque côté : la moitié du rayon des sommets. */
const RENTRANT_TRIANGLE = 0.5;

/**
 * Met la forme à l'échelle du carré de la tête.
 *
 * On mesure la silhouette de face — le cercle `z = 0` transporté sur le solide — et l'on
 * divise par son plus grand écart aux axes. Toutes les formes touchent alors le bord du
 * carré, aucune ne le dépasse.
 */
function ajuster(forme: FormeSolide, echantillons: number = 720): Solide {
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (let i = 0; i < echantillons; i++) {
    const t = (i / echantillons) * Math.PI * 2;
    const u = { x: Math.cos(t), y: Math.sin(t), z: 0 };
    const r = rayonSolide(u, forme);
    xMin = Math.min(xMin, u.x * r); xMax = Math.max(xMax, u.x * r);
    yMin = Math.min(yMin, u.y * r); yMax = Math.max(yMax, u.y * r);
  }
  const demiL = (xMax - xMin) / 2, demiH = (yMax - yMin) / 2;
  const plus = Math.max(demiL, demiH);
  if (plus <= 1e-9) return forme;
  const echelle = 1 / plus;
  return {
    ...forme,
    echelle,
    decalage: { x: ((xMax + xMin) / 2) * echelle, y: ((yMax + yMin) / 2) * echelle },
    demiLargeur: demiL * echelle,
  };
}


/**
 * Les solides déjà construits, par forme et par arrondi.
 *
 * ⚠️ **Rendre un objet neuf à chaque appel coûtait une morphose entière par image.** Tout ce
 * qui est cher en aval — la carte des longueurs de surface, la grille — se met en cache **par
 * identité** de solide, faute de pouvoir comparer deux volumes autrement. Un mélange étant un
 * solide neuf à chaque image, ses deux extrémités l'étaient aussi : leurs cartes se
 * reconstruisaient soixante fois par seconde, 43 ms pour le nuage et 13 ms pour l'étoile.
 * Mémoriser ici suffit à ce que tout le reste retombe sur ses pieds, et un solide est
 * immuable — deux appels identiques *doivent* rendre le même objet.
 */
const construits = new Map<string, Solide>();

export function solideDepuis(forme: FamilleSolide, arrondi: number): Solide {
  const cle = `${forme}|${arrondi.toFixed(4)}`;
  const connu = construits.get(cle);
  if (connu) return connu;
  const neuf = construire(forme, arrondi);
  construits.set(cle, neuf);
  return neuf;
}

function construire(forme: FamilleSolide, arrondi: number): Solide {
  const a = Math.min(1, Math.max(0, arrondi));
  if (forme === "sphere" || a >= 1) return SPHERE;
  const exposant = Math.min(24, 2 / Math.max(0.001, a));
  if (forme === "cube") return { famille: "cube", exposant };
  /**
   * ⚠️ **L'hexagone part de plus haut, et il le faut absolument.** Avec trois directions
   * espacées de soixante degrés, `Σ cos^n` est **constante** pour n = 2 et n = 4 : les
   * termes en `cos 2θ` et `cos 4θ` s'y annulent trois à trois. À l'exposant 4 — celui que
   * donnait le réglage de référence — la forme était donc un cercle parfait, ce qui s'est
   * vu tout de suite. La modulation n'apparaît qu'avec le terme en `cos 6θ`, c'est-à-dire
   * à partir de la puissance sixième.
   */
  if (forme === "hexagone") {
    return ajuster({ famille: "hexagone", exposant: Math.min(30, 8 / Math.max(0.001, a)) });
  }
  if (forme === "triangle") return ajuster({ famille: "triangle", exposant });
  // La capsule et la goutte tiennent leur galbe de leur construction, pas d'un réglage :
  // les bouts d'une capsule sont ronds par définition, la pointe d'une goutte est une
  // pointe. L'arrondi n'a rien à y commander.
  if (forme === "coussin") return ajuster({ famille: "coussin", rayon: RAYON_COUSSIN });
  /* Le nuage ne se règle pas : ses bosses sont posées, pas modulées. Comme la capsule et
     la goutte, il tient son galbe de sa construction et ignore le curseur d'arrondi. */
  if (forme === "nuage") return { ...ajuster({ famille: "nuage" }), regardRond: true };
  if (forme === "goutte") return ajuster({ famille: "goutte", ...GOUTTE });
  return ajuster({ famille: forme, creux: (1 - a) * AMPLEUR[forme] });
}

export const estSphere = (s: Solide) => s.famille === "sphere";

const puissanceSignee = (v: number, e: number) =>
  (v === 0 ? 0 : Math.sign(v) * Math.pow(Math.abs(v), e));

/**
 * Le rayon du solide dans une direction donnée — le cœur de tout le module.
 *
 * `u` n'a pas besoin d'être unitaire : seule sa direction compte, et la fonction la
 * normalise. Le rayon vaut 1 sur les axes ; au-delà pour le cube, en deçà pour l'étoile.
 */
export function rayonSolide(u: Vec3, s: Solide): number {
  return brut(u, s) * (s.echelle ?? 1);
}

function brut(u: Vec3, s: Solide): number {
  if (s.famille === "sphere") return 1;
  if (s.famille === "melange") {
    return rayonSolide(u, s.de) + (rayonSolide(u, s.vers) - rayonSolide(u, s.de)) * s.part;
  }
  const l = Math.sqrt(u.x * u.x + u.y * u.y + u.z * u.z);
  if (l <= 1e-12) return 1;
  // ⚠️ Les composantes **signées** d'abord : les symétries d'ordre trois et la goutte
  // distinguent le haut du bas et la gauche de la droite. Les valeurs absolues ne
  // servent qu'aux familles qui sont symétriques par rapport aux trois plans.
  const sx = u.x / l, sy = u.y / l, sz = u.z / l;
  const x = Math.abs(sx), y = Math.abs(sy), z = Math.abs(sz);
  switch (s.famille) {
    case "cube": {
      const n = s.exposant;
      return 1 / Math.pow(Math.pow(x, n) + Math.pow(y, n) + Math.pow(z, n), 1 / n);
    }
    case "etoile":
      return 1 - s.creux * 2 * x * x * y * y;
    case "etoile6": {
      const f = 3 * x * x * y - y * y * y;
      return 1 - s.creux * f * f;
    }
    case "triangle": {
      const n = s.exposant;
      let somme = Math.pow(z, n);
      for (const m of NORMALES_TRIANGLE) {
        const c = sx * m.x + sy * m.y;
        if (c > 0) somme += Math.pow(c / RENTRANT_TRIANGLE, n);
      }
      return somme <= 0 ? 1 : 1 / Math.pow(somme, 1 / n);
    }
    case "hexagone": {
      /**
       * ⚠️ **Un cube vu par le coin a été essayé, mesuré, et refusé par la mesure.** L'idée
       * est juste sur le papier : un hexagone régulier *est* la projection d'un cube regardé
       * le long de sa grande diagonale, et l'écrire tient en trois produits scalaires —
       * `AXES_CUBE_COIN` est resté pour le jour où l'on y reviendrait.
       *
       * Deux faits l'ont arrêté, l'un après l'autre :
       *
       * 1. **Sa silhouette n'est un hexagone que s'il est *vif*.** Le nôtre est arrondi ; ses
       *    trois coins proches et ses trois coins lointains ne s'émoussent alors pas pareil,
       *    et le contour prend une symétrie d'ordre **trois** au lieu de six — relevé, un
       *    rayon qui va de 90 à 113 en trois lobes. Ce n'est plus une tête hexagonale.
       * 2. **Il n'est pas symétrique avant/arrière**, à la différence de toutes les autres
       *    formes, si bien que sa silhouette ne coïncide plus avec sa section équatoriale.
       *    Tout ce qui est peint dessus en sortait : 22,6 unités pour l'œil, et un maillage
       *    qui débordait de tous les côtés.
       *
       * L'hexagone reste donc trois paires de plans — une forme à six côtés, pas un cube.
       */
      const n = s.exposant;
      let somme = Math.pow(z, n);
      for (const a of ANGLES_HEXAGONE) {
        somme += Math.pow(Math.abs(sx * Math.cos(a) + sy * Math.sin(a)), n);
      }
      return 1 / Math.pow(somme, 1 / n);
    }
    case "goutte": {
      /**
       * Le rayon en fonction de l'angle depuis le sommet. Le terme exponentiel a un
       * **coin** en zéro — dérivée `∓1/finesse` selon le côté —, et c'est ce coin qui
       * fait la pointe : sans lui la surface serait ronde là comme partout.
       */
      const phi = Math.acos(Math.min(1, Math.max(-1, sy)));
      return s.corps + (1 - s.corps) * Math.exp(-phi / s.finesse);
    }
    case "nuage": {
      /**
       * ⚠️ **Le nuage est une *dalle* : face plate devant, relief dans le contour.** C'est la
       * décision qui remplace l'union de boules en trois dimensions. Un volume bosselé pose un
       * problème que rien dans la loi du regard ne peut résoudre : l'œil est peint *sur* la
       * surface, donc il épouse les bosses, donc il ondule — c'était juste, et c'était laid.
       *
       * On garde donc exactement la silhouette, qui est ce qui fait le nuage, et on rend le
       * devant plat. La section reste l'union adoucie des cinq boules, évaluée **dans le
       * plan** ; l'épaisseur s'y ajoute comme une superellipse, exactement comme le cube
       * compose ses trois axes. À `z = 0` le rayon vaut la section : le contour dessiné est
       * inchangé au point près. Devant, la surface est un plan.
       */
      const rho = Math.hypot(sx, sy);
      if (rho < 1e-9) return DALLE_NUAGE.demi;
      const section = sectionNuage(sx / rho, sy / rho);
      const n = DALLE_NUAGE.arrondi;
      return 1 / Math.pow(
        Math.pow(rho / section, n) + Math.pow(z / DALLE_NUAGE.demi, n), 1 / n);
    }
    default: {
      /**
       * La capsule : la surface à distance constante d'un segment. On cherche le `t` tel
       * que `dist(t·u, segment) = rayon`, ce qui se résout à la main — côté plat quand le
       * pied de la perpendiculaire tombe dans le segment, côté rond sinon.
       */
      const b = s.rayon, d2 = 1 - b;
      const A = x, B = Math.sqrt(sy * sy + sz * sz);
      if (B <= 1e-9) return 1;
      if ((b * A) / B <= d2) return b / B;
      return d2 * A + Math.sqrt(Math.max(0, b * b - d2 * d2 * B * B));
    }
  }
}

/** Le point du solide qui correspond à un point de la sphère : même direction. */
export function surLeSolide(p: Vec3, s: Solide): Vec3 {
  if (s.famille === "sphere") return p;
  const k = rayonSolide(p, s);
  return { x: p.x * k, y: p.y * k, z: p.z * k };
}

/**
 * La normale du solide, lue sur le point de la **sphère**.
 *
 * ⚠️ **Elle ne se confond avec la position que sur la sphère.** C'est la seule raison
 * pour laquelle le module principal n'a jamais eu à distinguer les deux, et la première
 * chose à corriger dès qu'un autre volume entre en scène : sur un cube ou une étoile, un
 * point peut être devant sans être vu, et inversement.
 *
 * ⚠️ **Calculée par différences finies, et non par un gradient écrit à la main pour
 * chaque forme.** Toutes les surfaces d'ici sont radiales, `ρ = r(u)` : la normale s'en
 * déduit une fois pour toutes par `n ∝ u − (∇r)⊥ / r`, où seul `∇r` dépend de la famille.
 * Sept gradients écrits à la main, c'étaient sept occasions de se tromper d'un signe — et
 * une normale fausse ne casse rien de visible, elle décale seulement le bord, ce qui est
 * la manière dont ce genre d'erreur survit. Un test confronte le résultat aux deux
 * gradients qu'on sait écrire exactement, celui du cube et celui de l'étoile.
 *
 * ⚠️ **La dérivée se prend le long de la sphère, pas dans l'espace.** Le point avancé est
 * renormalisé par `rayonSolide`, qui ne regarde que la direction : sans cela on
 * mesurerait aussi la variation due au fait d'avoir quitté la sphère, et la normale
 * pencherait d'autant.
 */
export function normaleSolide(p: Vec3, s: Solide): Vec3 {
  const u = normaliser(p);
  if (s.famille === "sphere") return u;
  const r = rayonSolide(u, s);
  const { e1, e2 } = baseTangente(u);
  const h = 1e-4;
  const pas = (e: Vec3, signe: number) => rayonSolide(
    { x: u.x + signe * h * e.x, y: u.y + signe * h * e.y, z: u.z + signe * h * e.z }, s);
  const d1 = (pas(e1, 1) - pas(e1, -1)) / (2 * h);
  const d2 = (pas(e2, 1) - pas(e2, -1)) / (2 * h);
  return normaliser({
    x: u.x - (d1 * e1.x + d2 * e2.x) / r,
    y: u.y - (d1 * e1.y + d2 * e2.y) / r,
    z: u.z - (d1 * e1.z + d2 * e2.z) / r,
  });
}

/** Deux directions orthonormées tangentes à la sphère en `u`. */
function baseTangente(u: Vec3): { e1: Vec3; e2: Vec3 } {
  const aide: Vec3 = Math.abs(u.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const e1 = normaliser({
    x: aide.y * u.z - aide.z * u.y,
    y: aide.z * u.x - aide.x * u.z,
    z: aide.x * u.y - aide.y * u.x,
  });
  return {
    e1,
    e2: {
      x: u.y * e1.z - u.z * e1.y,
      y: u.z * e1.x - u.x * e1.z,
      z: u.x * e1.y - u.y * e1.x,
    },
  };
}

function normaliser(v: Vec3): Vec3 {
  const n = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  return n === 0 ? v : { x: v.x / n, y: v.y / n, z: v.z / n };
}
