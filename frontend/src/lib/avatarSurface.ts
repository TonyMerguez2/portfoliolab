import {
  RAYON_TETE, type Orientation, type Point2, type Vec3,
  contourArrondi, type ReglagesOeil,
} from "./avatarSpherique";
import { SPHERE, type Solide, surLeSolide, normaleSolide } from "./avatarVolume";
import { couperEtTracer } from "./avatarSolide";

/**
 * Le regard qui **marche sur la surface** — une seule loi, sans un seul coefficient.
 *
 * ⚠️ **Pourquoi elle remplace tout le reste.** Il y a eu une loi par famille de volume : la
 * sphère résolvait chaque point le long de son rayon, le cube posait un décalque plat qu'il
 * fallait ensuite **rétrécir** pour qu'il ne sorte pas de la forme, le triangle promenait
 * l'œil sur un profil de révolution. Deux d'entre elles reposaient sur des facteurs — un
 * plafond d'aire, un resserrement, une saturation —, c'est-à-dire sur des réglages. À
 * l'écran, cela se voyait : l'œil devenait minuscule en approchant d'un angle. Jugé ainsi, et
 * c'est juste : « je veux que ce soit géométrique, pas une simple disparition progressive. »
 *
 * ⚠️ **La loi : un point de l'œil est repéré par deux longueurs *de surface*.** Combien à
 * droite, combien en haut — mesurés sur le volume lui-même. Tourner la tête ne tourne rien :
 * cela déplace l'œil d'un arc `rayon × angle`, exactement ce qu'aurait parcouru un point de
 * la surface. Tout le reste en découle, sans rien à régler :
 *
 * - sur une **face plate**, marcher donne un rectangle : l'œil y est plat, à sa taille ;
 * - sur une **sphère**, la même marche donne l'enroulement qu'on a toujours eu ;
 * - sur un **cône**, l'œil se resserre en montant, parce que la surface s'y resserre ;
 * - au passage d'une **arête**, il se plie, parce que la surface s'y plie ;
 * - et rien ne peut sortir de la silhouette, puisque tout est posé *sur* le volume.
 *
 * ⚠️ **La carte est cartésienne, et j'en ai d'abord écrit une polaire — à tort.** Repérer un
 * point par « une distance et un azimut depuis le milieu du visage » semble naturel, mais un
 * œil placé sur le côté s'y déploie en éventail : chacun de ses points marche une distance
 * différente sur un méridien différent. Mesuré, des aires jusqu'à **196 %** de leur valeur au
 * repos. Il faut deux marches perpendiculaires — d'abord le long d'un parallèle, puis le long
 * d'un méridien —, chacune avec la métrique de l'endroit où l'on est.
 */

/**
 * La carte des longueurs de surface d'un volume.
 *
 * ⚠️ **Deux tables, parce que les deux directions ont chacune leur métrique.** Le long d'un
 * parallèle, un degré de longitude ne couvre pas la même longueur selon la hauteur ; le long
 * d'un méridien, un degré de latitude ne couvre pas la même longueur selon la longitude.
 * Une seule table donnerait une carte juste dans un sens et fausse dans l'autre.
 */
export type CarteSurface = {
  /** Longitudes tabulées, et longueur cumulée le long du méridien de chacune. */
  meridiens: Float64Array[];
  /** Latitudes tabulées, et longueur cumulée le long du parallèle de chacune. */
  paralleles: Float64Array[];
};

/** Combien de méridiens et de parallèles la carte tabule. */
const LIGNES = 96;
/** Le pas de marche, en radians : assez fin pour que la longueur cumulée soit exacte. */
const PAS = Math.PI / 512;
/** Jusqu'où la carte va, de part et d'autre du point qui fait face. */
const PORTEE = Math.PI;

/** Un angle ramené dans `]−π ; π]` : un tour entier ne déplace rien. */
const enroule = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

const dirDe = (lon: number, lat: number): Vec3 => ({
  x: Math.sin(lon) * Math.cos(lat),
  y: Math.sin(lat),
  z: Math.cos(lon) * Math.cos(lat),
});

/**
 * Les cartes déjà construites, gardées par identité de solide.
 *
 * ⚠️ **Une seule case ne suffisait pas, et cela se chiffrait en images perdues.** Construire
 * une carte coûte de 10 ms sur la sphère à 43 ms sur le nuage : tant qu'un seul volume est à
 * l'écran, une case unique suffit — mais dès que deux formes coexistent, chacune chasse
 * l'autre et l'on repaie le prix à chaque image. Une `WeakMap` les garde toutes sans retenir
 * un seul solide en mémoire une fois qu'il n'est plus utilisé.
 */
const cartes = new WeakMap<Solide, CarteSurface>();

/**
 * La carte d'un mélange, **interpolée** entre celles de ses deux extrémités.
 *
 * ⚠️ **Sans cela, une morphose coûte une carte par image — 70 ms, soit quatorze images par
 * seconde.** Un mélange est un solide neuf à chaque image, puisque sa part change : aucune
 * mise en cache par identité ne peut l'attraper. Or la carte d'un rayon interpolé est, à
 * l'arrondi près, l'interpolation des deux cartes — les longueurs cumulées sont lisses en la
 * part. On interpole donc, dans un tampon réutilisé pour ne rien allouer en cours de route.
 * L'approximation ne dure que le temps de la transition, et les deux bouts restent exacts.
 */
let tampon: CarteSurface | null = null;
function carteInterpolee(de: CarteSurface, vers: CarteSurface, part: number): CarteSurface {
  if (!tampon || tampon.meridiens.length !== de.meridiens.length) {
    tampon = {
      meridiens: de.meridiens.map(l => new Float64Array(l.length)),
      paralleles: de.paralleles.map(l => new Float64Array(l.length)),
    };
  }
  for (const cle of ["meridiens", "paralleles"] as const) {
    for (let i = 0; i < tampon[cle].length; i++) {
      const a = de[cle][i], b = vers[cle][i], out = tampon[cle][i];
      for (let j = 0; j < out.length; j++) out[j] = a[j] + (b[j] - a[j]) * part;
    }
  }
  return tampon;
}

/**
 * ⚠️ **Poser le regard sur une version *adoucie* du volume a été essayé, et mesuré comme
 * pire.** L'idée répondait à un vrai défaut — sur le nuage, l'œil épouse les bosses et s'y
 * tord — et elle marchait sur ce point : la courbure de l'œil au repos tombait de 3,29 à
 * 0,40. Mais une **moyenne de rayons dépasse le rayon dans un creux** : entre deux lobes
 * d'étoile ou au raccord de deux boules, la surface lissée sort de la vraie, et l'œil avec —
 * relevé, 2 à 3,3 unités hors du contour sur six formes des huit. La rattraper demanderait de
 * plafonner la moyenne au rayon brut, c'est-à-dire un facteur correctif : précisément ce que
 * cette loi existe pour ne plus avoir. Le relief du nuage reste donc visible ; il est vrai.
 */

/** La longueur cumulée le long d'une courbe échantillonnée, depuis son milieu. */
function cumuler(point: (t: number) => Vec3): Float64Array {
  const moitie = Math.round(PORTEE / PAS);
  const cumul = new Float64Array(2 * moitie + 1);
  /* L'indice `moitie` est l'origine ; on s'éloigne dans les deux sens. */
  for (const sens of [1, -1]) {
    let precedent = point(0);
    for (let i = 1; i <= moitie; i++) {
      const q = point(sens * i * PAS);
      cumul[moitie + sens * i] = cumul[moitie + sens * (i - 1)]
        + Math.hypot(q.x - precedent.x, q.y - precedent.y, q.z - precedent.z);
      precedent = q;
    }
  }
  return cumul;
}

export function carteDe(solide: Solide): CarteSurface {
  const connue = cartes.get(solide);
  if (connue) return connue;
  if (solide.famille === "melange") {
    return carteInterpolee(carteDe(solide.de), carteDe(solide.vers), solide.part);
  }
  const meridiens: Float64Array[] = [];
  const paralleles: Float64Array[] = [];
  for (let i = 0; i < LIGNES; i++) {
    /* Les lignes couvrent un demi-tour de part et d'autre : la carte doit répondre partout
       où le regard peut aller, y compris derrière. */
    const lon = -Math.PI + (2 * Math.PI * i) / (LIGNES - 1);
    meridiens.push(cumuler(t => surLeSolide(dirDe(lon, t), solide)));
    const lat = -Math.PI / 2 + (Math.PI * i) / (LIGNES - 1);
    paralleles.push(cumuler(t => surLeSolide(dirDe(t, lat), solide)));
  }
  const carte = { meridiens, paralleles };
  cartes.set(solide, carte);
  return carte;
}

/** La ligne tabulée la plus proche d'un angle. */
function ligneVoisine(
  tables: Float64Array[], angle: number, min: number, etendue: number,
): Float64Array {
  const x = ((angle - min) / etendue) * (tables.length - 1);
  return tables[Math.min(tables.length - 1, Math.max(0, Math.round(x)))];
}

/**
 * La longueur cumulée jusqu'à un angle donné — l'inverse d'`angleALaLongueur`.
 *
 * ⚠️ Interpolée entre deux pas, sans quoi le regard avancerait par sauts d'un tiers de degré.
 */
function longueurALAngle(cumul: Float64Array, angle: number): number {
  const moitie = (cumul.length - 1) / 2;
  const sens = angle >= 0 ? 1 : -1;
  const pas = Math.min(moitie, Math.abs(angle) / PAS);
  const bas = Math.floor(pas), haut = Math.min(moitie, bas + 1);
  const f = pas - bas;
  return sens * (cumul[moitie + sens * bas] * (1 - f) + cumul[moitie + sens * haut] * f);
}

/** L'angle auquel la longueur cumulée atteint `distance`, dans le sens de son signe. */
function angleALaLongueur(cumul: Float64Array, distance: number): number {
  const moitie = (cumul.length - 1) / 2;
  const sens = distance >= 0 ? 1 : -1;
  const vise = Math.abs(distance);
  let bas = 0, haut = moitie;
  if (vise >= cumul[moitie + sens * moitie]) return sens * moitie * PAS;
  while (haut - bas > 1) {
    const milieu = (bas + haut) >> 1;
    if (cumul[moitie + sens * milieu] <= vise) bas = milieu; else haut = milieu;
  }
  const large = cumul[moitie + sens * haut] - cumul[moitie + sens * bas];
  return sens * (bas + (large > 1e-12 ? (vise - cumul[moitie + sens * bas]) / large : 0)) * PAS;
}

/**
 * L'angle atteint pour une longueur donnée, **interpolé entre deux lignes tabulées**.
 *
 * ⚠️ **Arrondir à la ligne la plus proche ne suffit pas, et cela se mesure.** Les lignes sont
 * espacées de près de quatre degrés ; un œil en couvre une douzaine, donc trois ou quatre
 * lignes, et l'arrondi y dessine un escalier. Relevé sur le cube, dont la face est plate et
 * où le bord de l'œil devrait être rigoureusement droit : 16 unités de bosse, soit *plus* que
 * l'enroulement sphérique qu'on cherchait à supprimer.
 */
function angleEntreLignes(
  tables: Float64Array[], angle: number, min: number, etendue: number, distance: number,
): number {
  const x = Math.min(tables.length - 1, Math.max(0,
    ((angle - min) / etendue) * (tables.length - 1)));
  const i = Math.min(tables.length - 2, Math.floor(x));
  const f = x - i;
  return angleALaLongueur(tables[i], distance) * (1 - f)
    + angleALaLongueur(tables[i + 1], distance) * f;
}

/** La réciproque d'`angleEntreLignes` : la longueur d'un angle, interpolée entre deux lignes. */
function longueurEntreLignes(
  tables: Float64Array[], angle: number, min: number, etendue: number, vise: number,
): number {
  const x = Math.min(tables.length - 1, Math.max(0,
    ((angle - min) / etendue) * (tables.length - 1)));
  const i = Math.min(tables.length - 2, Math.floor(x));
  const f = x - i;
  return longueurALAngle(tables[i], vise) * (1 - f) + longueurALAngle(tables[i + 1], vise) * f;
}

/**
 * Le point de la surface atteint en marchant de `u` à droite puis de `v` en haut.
 *
 * ⚠️ **Deux passes, parce que les deux marches se conditionnent l'une l'autre.** La longueur
 * d'un degré de longitude dépend de la hauteur où l'on se trouve, et celle d'un degré de
 * latitude dépend de la longitude. On part donc d'une première estimation à l'équateur, on
 * en déduit la hauteur, puis on refait la marche horizontale à cette hauteur-là. Une
 * troisième passe ne déplace plus rien de mesurable.
 */
export function pointDeLaCarte(
  carte: CarteSurface, solide: Solide, u: number, v: number,
): { direction: Vec3; point: Vec3 } {
  let lat = 0;
  let lon = 0;
  for (let passe = 0; passe < 2; passe++) {
    lon = angleEntreLignes(carte.paralleles, lat, -Math.PI / 2, Math.PI, u);
    lat = angleEntreLignes(carte.meridiens, lon, -Math.PI, 2 * Math.PI, v);
  }
  const direction = dirDe(lon, lat);
  return { direction, point: surLeSolide(direction, solide) };
}

/**
 * Le `d` d'un œil peint sur la surface, déplacé par le regard.
 *
 * ⚠️ **Aucun facteur, aucune borne, aucune exception de forme.** On convertit le regard en un
 * déplacement de surface, on peint l'œil à cet endroit aux vraies longueurs de surface, on
 * projette, et l'on retranche ce qui a tourné le dos. Une forme différente donne une
 * déformation différente parce que sa surface est différente — c'est le but.
 */
export function cheminOeilSurface(
  reglages: ReglagesOeil, orientation: Orientation, cote: -1 | 1,
  rayon: number = RAYON_TETE, echantillons: number = 220, solide: Solide,
): string {
  /**
   * ⚠️ **Le regard ne se promène pas forcément sur la forme qu'on dessine.** Une seule la
   * demande — le nuage, dont le contour bosselé tordait l'œil —, et pour elle le support est
   * une sphère : voir `regardRond`. Tout le reste du calcul est identique ; seul le **bord**
   * qui découpe l'œil reste celui de la vraie silhouette, si bien que rien ne peut dépasser.
   */
  /* ⚠️ La sphère du module, et non une copie : la carte est mise en cache **par identité**,
     et une copie fraîche à chaque image la ferait reconstruire soixante fois par seconde.
     `surLeSolide` n'utilise pas le décalage — il s'applique à la projection —, donc rien
     n'est perdu à passer la constante telle quelle. */
  const support: Solide = solide.regardRond ? SPHERE : solide;
  const carte = carteDe(support);
  const contour = contourArrondi(
    reglages.largeur, reglages.hauteur, reglages.arrondi ?? 1, echantillons,
    reglages.courbure ?? 0, reglages.pliure ?? 0);

  /**
   * ⚠️ **Le regard devient une longueur, pas une rotation.** Un lacet de θ déplace un point
   * de la surface d'un arc `rayon × θ` : c'est cette longueur qu'on parcourt. Le roulis, lui,
   * tourne le motif autour de l'ancre — il ne déplace rien.
   *
   * ⚠️ **Le regard se place par l'*angle*, l'œil se dessine en *longueurs de surface*.** Les
   * deux ne sont pas la même chose dès que la forme est creusée : entre deux lobes d'étoile,
   * la surface est plus longue que l'angle qu'elle couvre, si bien qu'un regard mesuré en
   * longueur y prend du retard. À quatre-vingts degrés de lacet, les deux yeux étaient encore
   * là, entassés contre le lobe droit au lieu d'être passés derrière — pris d'abord pour un
   * œil coupé en deux, jusqu'à ce que le DOM montre deux tracés entiers de deux cent vingt
   * points. Un lacet de θ doit tourner le regard de θ, quelle que soit la forme.
   */
  const roulis = orientation.roulis ?? 0;
  const cosR = Math.cos(roulis), sinR = Math.sin(roulis);
  /**
   * ⚠️ **L'ordre des deux conversions compte, et c'est ce que j'avais raté.** L'abscisse se
   * lit sur le parallèle de la *hauteur visée*, pas sur l'équateur : sur une forme creusée les
   * deux diffèrent de moitié, et prendre l'équateur faisait fondre l'œil à 77 unités d'aire là
   * où il en faut 187. On calcule donc la hauteur d'abord, l'abscisse ensuite.
   */
  /* Où l'œil se tient au repos, en angles : c'est le point que la longueur `ecart` atteint,
     et non `asin(ecart)` — sur un triangle les deux diffèrent du simple au double. */
  const latRepos = angleALaLongueur(
    ligneVoisine(carte.meridiens, 0, -Math.PI, 2 * Math.PI), reglages.elevation / rayon);
  const lonRepos = angleALaLongueur(
    ligneVoisine(carte.paralleles, latRepos, -Math.PI / 2, Math.PI),
    (cote * reglages.ecart) / rayon);
  const latVisee = latRepos - orientation.tangage;
  /**
   * ⚠️ **Le lacet est ramené dans un tour, sinon la tête finit son tour complet aveugle.**
   * La carte ne connaît qu'un demi-tour de part et d'autre : au-delà, la recherche de
   * longueur sature et l'œil reste collé derrière. Un tour de 360° s'arrêtait donc à 100° —
   * relevé sur les neuf formes, aire des deux yeux nulle de 120° jusqu'à l'arrivée, y compris
   * *à* 360° où l'on devrait être exactement revenu au repos. Un tour entier ne déplace rien :
   * c'est l'arithmétique qui doit le dire, pas la table.
   */
  const lonVisee = enroule(lonRepos + orientation.lacet);
  const brutV = rayon * longueurALAngle(
    ligneVoisine(carte.meridiens, lonVisee, -Math.PI, 2 * Math.PI), latVisee);
  const brutU = rayon * longueurALAngle(
    ligneVoisine(carte.paralleles, latVisee, -Math.PI / 2, Math.PI), lonVisee);
  const ancreU = brutU * cosR - brutV * sinR;
  const ancreV = brutU * sinR + brutV * cosR;

  /* L'inclinaison propre de l'œil et le roulis se composent : une seule rotation du motif. */
  const angle = reglages.inclinaison + cote * roulis;
  const cos = Math.cos(angle), sin = Math.sin(angle);

  /* ⚠️ Les longueurs se comptent sur le volume, dont le rayon vaut un : tout ce qui vient
     des réglages — en unités d'écran — passe donc par `rayon`. L'oublier fait saturer la
     carte et l'œil s'écrase en un point. */
  /**
   * ⚠️ **L'œil se dessine autour de son ancre, et non depuis l'axe du visage — sans quoi il
   * s'ouvre en éventail sur les formes creusées.** Les parallèles n'ont pas tous la même
   * longueur : sur une étoile, celui qui passe au creux entre deux lobes est bien plus court
   * que celui de l'équateur. Compter l'abscisse depuis l'axe donnait donc à chaque rangée de
   * l'œil une longitude différente pour un même écart, et l'œil s'évasait en approchant du
   * bord au lieu de se réduire. Mesuré au lacet : la sphère ramène sa largeur de 15 à 8 unités
   * entre 40° et 70°, les étoiles la gardaient à 17, voire l'élargissaient à 20 — ce qui se
   * lisait comme une bande collée à la pointe, qui cassait la courbure du lobe.
   *
   * On fixe donc l'ancre en angles une fois pour toutes, puis chaque rangée relit la longitude
   * de cette ancre sur *son propre* parallèle avant d'y ajouter l'écart du point. La largeur
   * de l'œil redevient un arc local, exactement comme sa hauteur est une longueur locale.
   */
  const latAncre = angleEntreLignes(
    carte.meridiens, lonVisee, -Math.PI, 2 * Math.PI, ancreV / rayon);
  const lonAncre = angleEntreLignes(
    carte.paralleles, latAncre, -Math.PI / 2, Math.PI, ancreU / rayon);
  const hauteurAncre = longueurEntreLignes(
    carte.meridiens, lonAncre, -Math.PI, 2 * Math.PI, latAncre);

  /**
   * ⚠️ **Un œil appartient au point où il est ancré : si l'ancre est derrière, l'œil est
   * derrière.** Sans cette règle, il ne disparaît pas d'un bloc : ses bords continuent de
   * dépasser après que son milieu est passé, et comme la métrique d'une forme creusée ramène
   * le haut et le bas de l'œil *en avant* de son centre, ce qui subsiste n'est plus un
   * croissant mais **deux lambeaux séparés** — mesuré à 85° de lacet sur les deux étoiles,
   * et c'est exactement la bande qui apparaît le long de la pointe et casse sa courbure.
   * Sur la sphère, dont la métrique est uniforme, le cas ne se présentait pas : d'où le fait
   * qu'il ait échappé si longtemps.
   *
   * La règle ne coupe rien de visible : à ce lacet, l'œil ne montre déjà plus que des éclats.
   */
  if (Math.cos(lonAncre) * Math.cos(latAncre) <= 0) return "";

  const sommets = contour.map(c => {
    const du = (cote * (c.x * cos - c.y * sin)) / rayon;
    const dv = (c.x * sin + c.y * cos) / rayon;
    /* La hauteur se marche sur le méridien de l'ancre… */
    const lat = angleEntreLignes(
      carte.meridiens, lonAncre, -Math.PI, 2 * Math.PI, hauteurAncre + dv);
    /* …et l'abscisse sur le parallèle de *cette* hauteur, depuis la longitude de l'ancre. */
    const lon = angleEntreLignes(carte.paralleles, lat, -Math.PI / 2, Math.PI,
      longueurEntreLignes(carte.paralleles, lat, -Math.PI / 2, Math.PI, lonAncre) + du);
    const direction = dirDe(lon, lat);
    const point = surLeSolide(direction, support);
    /**
     * ⚠️ **La visibilité se lit sur le *côté*, pas sur la normale — et c'est l'inverse de ce
     * que j'ai écrit d'abord.** « La surface nous regarde-t-elle ? » semble la bonne question,
     * et elle l'est sur un volume convexe. Sur une forme creusée, elle cesse d'être monotone :
     * au fond d'un creux la normale se rallume, si bien que l'œil qui passe le bord se coupait
     * en **deux morceaux séparés par un liseré de fond** — un gros croissant, puis un mince
     * collé au contour. Vu à l'écran sur les deux étoiles.
     *
     * Le côté, lui, ne peut pas se rallumer : on est devant, puis derrière.
     *
     * ⚠️ **Et il ne suffit pas : encore faut-il que la surface *regarde* vers nous.** Sur un
     * volume rond les deux conditions coïncident. Sur une dalle, non : au-delà de la face
     * plate il y a la **tranche**, qui est devant l'équateur et pourtant vue par le travers.
     * L'œil qui glissait vers le bord s'y enroulait, et sa partie enroulée revenait se serrer
     * contre le contour — d'où un coin gras qui *élargissait* l'œil au lieu de le réduire :
     * relevé sur le nuage, largeur 24 → 30 en approchant du bord, là où le cube passe de 23 à
     * 4. Le haut de l'œil y arrive le premier, le contour n'étant qu'à 74 unités à cette
     * hauteur contre 95 au milieu, et c'est ce décalage qui déforme.
     *
     * Le côté seul avait été choisi pour une bonne raison — la normale peut se rallumer au
     * fond d'un creux et couper l'œil en deux. Cette raison est tombée : le morceau principal
     * l'emporte désormais, quelques lignes plus bas. On peut donc exiger les deux, et l'œil se
     * fait couper net au bord de la face plate au lieu de s'étaler sur la tranche.
     */
    const normale = normaleSolide(direction, support);
    /**
     * ⚠️ **Et quand le support n'est pas la forme, il faut en plus tenir dans le contour.**
     * Tant que l'œil est posé sur le volume qu'on dessine, sa projection y est forcément :
     * la condition serait vide, et elle l'était — écrite une première fois, mesurée sur les
     * deux étoiles, zéro point gagné, retirée. Elle cesse d'être vide dès que le regard se
     * promène sur une sphère plutôt que sur le nuage : la sphère déborde là où le contour se
     * creuse. On coupe donc au contour, ce qui est exactement l'effet voulu — l'œil disparaît
     * derrière le bord du nuage au lieu d'en sortir.
     */
    let dedans = true;
    if (solide.regardRond) {
      const azimut = Math.atan2(point.y, point.x);
      const bord = surLeSolide({ x: Math.cos(azimut), y: Math.sin(azimut), z: 0 }, solide);
      dedans = Math.hypot(point.x, point.y) <= Math.hypot(bord.x, bord.y);
    }
    return { solide: point, sphere: direction, vu: direction.z > 0 && normale.z > 0 && dedans };
  });

  /**
   * ⚠️ **Un œil est une tache d'un seul tenant : on ne garde que son morceau principal.** La
   * visibilité, prise point par point, peut s'allumer à deux endroits du contour. Sur une
   * sphère, jamais : le critère y est monotone le long du tracé. Sur une forme creusée, la
   * métrique ramène le haut et le bas de l'œil *en avant* de son milieu, si bien qu'au moment
   * où celui-ci passe derrière, ses deux extrémités dépassent encore — et l'œil se dessine en
   * **deux lambeaux séparés par un liseré de fond**. Relevé de 70° à 85° de lacet sur les deux
   * étoiles, sur le coussin en biais et sur le triangle : c'est la bande qui apparaît le long
   * de la pointe et qui en casse la courbure.
   *
   * On ne corrige donc pas la géométrie — elle est juste, ces éclats sont bien devant — mais
   * on refuse de les *dessiner* : un œil qui se fragmente n'est plus un œil. Le plus long
   * segment vu l'emporte, le reste passe derrière avec le milieu.
   */
  let debut = 0, longueur = 0, courantDebut = -1, courant = 0;
  for (let i = 0; i < 2 * sommets.length; i++) {
    if (sommets[i % sommets.length].vu) {
      if (courantDebut < 0) courantDebut = i;
      courant++;
      if (courant > longueur) { longueur = courant; debut = courantDebut; }
    } else { courantDebut = -1; courant = 0; }
  }
  if (longueur < sommets.length) {
    for (let i = 0; i < sommets.length; i++) sommets[i].vu = false;
    for (let i = debut; i < debut + longueur; i++) sommets[i % sommets.length].vu = true;
  }

  /**
   * ⚠️ **Le découpage au limbe est celui du module solide, pas un second de mon cru.** J'en
   * avais écrit un — retirer les points cachés, rejoindre les survivants —, et il enfermait
   * jusqu'à deux fois l'aire de l'œil dès que celui-ci se coupait à deux endroits : relevé,
   * 207 % sur la goutte. Celui d'`avatarSolide` déduit le sens du parcours de l'aire et
   * refuse de longer plus d'un demi-tour ; il est éprouvé et couvert d'essais.
   */
  const decalage = solide.decalage;
  const versEcran = (p: Vec3): Point2 => ({
    x: (p.x - (decalage ? decalage.x : 0)) * rayon,
    y: -(p.y - (decalage ? decalage.y : 0)) * rayon,
  });
  const bord = {
    angle: (p: Vec3) => Math.atan2(p.y, p.x),
    point: (t: number) => surLeSolide({ x: Math.cos(t), y: Math.sin(t), z: 0 }, solide),
  };
  return couperEtTracer(sommets, bord, versEcran);
}
