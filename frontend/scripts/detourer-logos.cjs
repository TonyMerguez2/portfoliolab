/**
 * Détoure les logos des cent premières capitalisations et les range dans `public/logos`.
 *
 * ⚠️ **Pourquoi détourer nous-mêmes plutôt que choisir une source détourée.** FMP sert le logo
 * détouré dans la plupart des cas, mais le reste arrive en **plaque** — un carré de couleur avec
 * la marque dessus — et Parqet en sert presque toujours une. À l'écran ces plaques remplissent la
 * pastille bord à bord et se lisent comme des vignettes collées sur la tuile, là où le dessin nu
 * se fond. Aucune source ne couvre les cent en détouré : il faut le faire.
 *
 * ⚠️ **Et un second gain, mesuré avant d'être cherché.** Sur 309 tuiles affichées d'un coup,
 * **137 logos retombaient sur Parqet alors que FMP les avait** : la source détourée ne tient pas
 * trois cents requêtes simultanées, et le repli ramenait justement les plaques. Servis depuis
 * `public/`, ils ne dépendent plus de personne.
 *
 * ⚠️ **Couvrir « les cent premières » ne marche pas, et c'est structurel.** Le manifeste était figé
 * sur un instantané des capitalisations. Quelques heures plus tard, les cours avaient bougé et
 * `FTNT`, `ADBE`, `MDT` et `ACN` étaient entrés dans le top 100 affiché **sans avoir de fichier** :
 * ils retombaient sur les plaques des fournisseurs. Le classement est une cible mobile, donc tout
 * manifeste dimensionné au plus juste se troue dès le lendemain. On couvre l'indice entier ; c'est
 * la seule taille qui ne dépend pas du jour où le script a tourné.
 *
 * Usage : `node scripts/detourer-logos.cjs [n]` — n vaut 100 par défaut, passer 503 pour tout.
 */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const RACINE = path.join(__dirname, "..", "public", "logos");
const API = "http://localhost:8000/api/v1/chaleur?periode=1j";
const TAILLE = 256;

/**
 * L'écart, en distance RVB au fond modélisé, au-delà duquel un pixel est **pleinement** du dessin.
 *
 * ⚠️ **Deux seuils et non un, sinon le bord du dessin devient un escalier.** Les pixels d'un logo
 * rastérisé sont **lissés** : sur le contour, chacun est un mélange de la marque et de la plaque.
 * Un seuil unique les classe tout ou rien et rend un découpage en marches. Entre le seuil bas —
 * calibré plus bas sur l'image elle-même — et celui-ci, l'opacité monte progressivement.
 */
const LOIN = 92;

/**
 * Les logos repris de Wikipédia, par ticker — la source officielle quand les fournisseurs se
 * trompent ou datent.
 *
 * ⚠️ **Ce n'est pas une rustine mais un correctif de *données*, et il faut savoir le distinguer.**
 * Les cas précédents étaient des défauts d'algorithme : mauvais seuil, mauvais modèle, mauvaise
 * statistique. Ceux-ci n'en sont pas. FMP et Parqet servent pour `HUBB` un ovale des années 2000,
 * pour `NWS` un carré cyan qui n'est pas la marque, pour `BR` un pictogramme abandonné. Aucun
 * traitement d'image ne rend un logo **juste** à partir d'un logo **faux** : il faut changer de
 * source.
 *
 * ⚠️ **Wikipédia, parce que c'est la seule source gratuite qui soit à la fois à jour et nette.**
 * Mesuré sur les alternatives : Clearbit ne répond plus, `logo.dev` exige une clé, DuckDuckGo ne
 * sert que des favicons de moins d'un kilo-octet. Wikipédia rend ces cinq-là en **960 px de large,
 * avec canal alpha et pourtour déjà vide à 75–99 %**.
 *
 * ⚠️ **Une table nommée à la main, et c'est assumé.** Le nom de fichier ne se devine pas : la
 * recherche automatique sur « Hubbell » tombe sur le patronyme, pas sur l'entreprise. Chaque
 * entrée a été vérifiée à l'œil contre le logo servi. La table reste courte parce qu'elle ne
 * couvre que les cas où les fournisseurs ont tort ; l'étendre demande la même vérification.
 */
const LOGOS_WIKIPEDIA = {
  BR:   "Logo for Broadridge 2024.svg",
  HUBB: "Hubbell-corporate primary digital logo color.png",
  NWS:  "News Corp logo 2013.svg",
  NWSA: "News Corp logo 2013.svg",
  /* ⚠️ `GM` et `VMRK` n'avaient **aucun** fichier : le premier parce que son « gm » bleu clair sur
     fond bleu disparaît à toute calibration, le second parce qu'aucun fournisseur ne le connaît. */
  GM:   "General Motors (logo with wordmark, horizontal).svg",
  VMRK: "Logo of Vivmark Residential.png",
};

/** L'adresse d'un fichier Wikipédia, rendu à la largeur demandée. */
const adresseWikipedia = (fichier, largeur = 512) =>
  `https://en.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(fichier)}?width=${largeur}`;

/**
 * Le logo de l'**émetteur** pour certains fonds, quand la marque servie n'est pas la bonne.
 *
 * ⚠️ **Deux défauts distincts, tous deux signalés à l'écran, tous deux de données.**
 *
 * `PAEJ.PA` affichait le « X » de **Lyxor**. Or son nom officiel est « **Amundi** PEA Asie
 * Pacifique » : Amundi a absorbé Lyxor en 2021, et les fournisseurs servent encore l'ancienne
 * marque. On le renvoie vers le logo qui sert déjà `CW8.PA`, l'autre fonds Amundi du même
 * portefeuille — deux fonds du même émetteur doivent porter la même marque, c'est exactement la
 * remarque qui a lancé tout ceci.
 *
 * `ESE.PA` et `ETZ.PA` portaient le carré vert **glacé** de Parqet, avec son dégradé et son
 * liseré. Demandé : l'envol d'étoiles seul. Or ce carré n'est pas retirable par incrustation —
 * son dégradé n'est pas linéaire, donc aucun modèle de fond ne le décrit, et la boucle
 * **converge** dessus au lieu de le peler. Vérifié en la laissant tourner douze fois : elle finit
 * au même résultat qu'en trois. Il fallait changer de source, pas insister sur la mécanique.
 *
 * ⚠️ **`carreDeTete` traite le cas où le symbole est enfermé dans un verrouillage horizontal.**
 * Le logo officiel de BNP est « carré + BNP PARIBAS » sur une ligne : gardé entier, il rend un
 * lettrage noir illisible sur carte sombre, large de cinq fois sa hauteur. On isole le carré de
 * tête — dont le vert est **plat**, lui — et l'incrustation ordinaire en tire les étoiles.
 */
const LOGOS_EMETTEUR = {
  "ESE.PA":  { fichier: "BNP Paribas logo.svg", largeur: 2000, carreDeTete: true },
  "ETZ.PA":  { fichier: "BNP Paribas logo.svg", largeur: 2000, carreDeTete: true },
  "PAEJ.PA": { url: "https://assets.parqet.com/logos/symbol/CW8.PA?format=png&size=256" },
};

/**
 * Les tickers hors S&P 500 à couvrir aussi.
 *
 * ⚠️ **Le périmètre « composants du S&P 500 » laissait deux fonds européens du même émetteur
 * avec deux logos différents.** Signalé à l'écran : `ESE.PA` et `ETZ.PA` sont tous deux des BNP
 * Paribas Easy, et n'affichaient pas la même marque. La cause n'est pas le détourage mais la
 * **source** : FMP ne connaît pas `ETZ.PA` — 404 — donc il retombait sur la plaque blanche de
 * Parqet pendant que son jumeau prenait la plaque verte de FMP. Deux fournisseurs, deux rendus.
 * Détourés localement, les deux passent par Parqet et rendent le même dessin.
 *
 * ⚠️ **La liste vient de trois endroits, et aucun ne suffit seul.** Le S&P 500 pour la carte de
 * chaleur ; `TRENDING` pour les suggestions de la palette ; et ces quelques lignes-ci, qui sont
 * des fonds européens réellement détenus mais absents des deux autres. Un ticker hors de cette
 * réunion garde le repli distant — l'application ne casse pas, elle est seulement moins bien
 * servie.
 */
const AUTRES_TICKERS = ["ETZ.PA", "PAEJ.PA"];

/**
 * Les tickers de `TRENDING`, lus dans la source du catalogue.
 *
 * ⚠️ **Lu, et non recopié.** Une seconde liste écrite ici divergerait du catalogue dès la
 * première suggestion ajoutée, et rien ne le signalerait — la palette proposerait un actif dont
 * le logo resterait distant. La lecture par motif est fruste mais vérifiable : on compte ce
 * qu'on trouve, et le script le dit.
 */
function tickersDuCatalogue() {
  try {
    const source = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "assets.ts"), "utf8");
    const bloc = source.match(/export const TRENDING[^=]*=\s*\[([\s\S]*?)\n\];/);
    if (!bloc) return [];
    return [...bloc[1].matchAll(/ticker:\s*"([^"]+)"/g)].map(m => m[1]);
  } catch {
    return [];
  }
}

/**
 * Ramène la source à 256 sur son plus grand côté, **sans remplissage et sans agrandissement**.
 *
 * ⚠️ **Le `Math.min(1, …)` n'est pas une précaution, il empêche d'inventer du détail.** La version
 * précédente montait tout à 256, y compris les sources de 100 px — un logo sur cinq. On stockait
 * alors un agrandissement de deux fois et demie en le faisant passer pour une définition. Le
 * navigateur agrandira de toute façon à l'affichage ; autant qu'il le fasse à partir des vrais
 * pixels, et que le fichier ne mente pas sur ce qu'il contient.
 */
async function preparer(buf) {
  const m = await sharp(buf).metadata();
  const k = Math.min(1, TAILLE / Math.max(m.width, m.height));
  const l = Math.max(1, Math.round(m.width * k));
  const h = Math.max(1, Math.round(m.height * k));
  return sharp(buf).ensureAlpha().resize(l, h, { fit: "fill" })
    .raw().toBuffer({ resolveWithObject: true });
}

/** La boîte englobant les pixels visibles, ou `null` si l'image est vide. */
function boiteEncre(buf, W, H) {
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (buf[(y * W + x) * 4 + 3] <= 40) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x0, y0, l: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * Recadre l'image sur son dessin.
 *
 * ⚠️ **C'est ce qui rend les logos comparables entre eux, et son absence se voyait sur `AAPL`.**
 * Signalé : « logo Apple trop petit, pas même dimension que les autres ». Mesuré : son dessin
 * n'occupait que **0,48** de sa toile quand la plupart en occupent 1,00. La cause est structurelle
 * — dans une plaque, la marque est petite et centrée ; en retirant la plaque, ses larges marges
 * transparentes restent. Les neuf logos détourés ici étaient donc exactement les neuf plus petits
 * à l'écran. Après recadrage, c'est la pastille qui fixe la taille, et elle seule.
 *
 * ⚠️ **Recadrer, mais surtout pas remettre au carré.** Un logotype large — `WELL` est un 128 × 37 —
 * doit rester large : `objectFit: contain` l'ajustera sur sa largeur, exactement comme le fait un
 * détouré servi par le fournisseur. Le remettre au carré reviendrait à réintroduire les marges
 * qu'on vient d'enlever.
 */
function recadrer(buf, W, H, b) {
  const out = Buffer.alloc(b.l * b.h * 4);
  for (let y = 0; y < b.h; y++)
    buf.copy(out, y * b.l * 4, ((y + b.y0) * W + b.x0) * 4, ((y + b.y0) * W + b.x0 + b.l) * 4);
  return out;
}

/**
 * Vrai si tout le pourtour est opaque : le logo porte une plaque.
 *
 * ⚠️ **La question se pose sur la source à son format, jamais après remplissage — c'est le défaut
 * qui a laissé passer `WELL`.** Je mettais d'abord la source au carré en `fit: contain`, ce qui
 * **ajoute des bandes transparentes** aux logos non carrés ; `WELL` est un 128 × 37. Le test
 * regardait donc mon propre remplissage, concluait « déjà détouré », et le rectangle blanc du
 * logotype partait intact à l'écran. Un test qui mesure ce qu'on vient d'ajouter ne mesure rien.
 *
 * ⚠️ **Tout le pourtour, et pas les quatre coins.** Les coins suffisent à *soupçonner* une plaque ;
 * ils ne suffisent pas à l'affirmer, un dessin pouvant déborder d'un côté sans toucher d'angle.
 *
 * ⚠️ **La question est « reste-t-il du vide ? », pas « est-ce plein ? » — et `ADI` a payé la
 * différence.** J'exigeais un alpha d'au moins 250 sur tout le pourtour. Or FMP sert `ADI` comme
 * un carré blanc avec le triangle évidé, et **les bords de ce carré sont adoucis** : leur alpha
 * descend à 67. Le test concluait « déjà détouré » et on livrait le carré blanc tel quel. Un
 * dessin réellement détouré, lui, a des pixels de pourtour à **alpha zéro** — c'est là qu'est la
 * frontière, pas dans l'opacité pleine. Mesuré : les détourés sont à 0, les plaques à 255, et
 * `ADI` à 67 se range du bon côté.
 */
const OPACITE_PLAQUE = 40;

/**
 * La part de chaque bord qu'on **ignore** aux extrémités, pour tolérer des coins arrondis.
 *
 * ⚠️ **Sans elle, une plaque à coins arrondis passe pour un détourage — c'est le cas d'`ETN`.**
 * Parqet sert Eaton comme un carré bleu **arrondi** : ses angles sont transparents. Un test qui
 * exige tout le pourtour opaque y trouve du vide et conclut « déjà détouré » ; on livrait la
 * vignette bleue. Les milieux de bord, eux, sont pleins à 255. On ne regarde donc que les 60 %
 * centraux de chaque bord — un vrai détourage y laisse du vide, un carré arrondi non.
 *
 * ⚠️ **Ce test est strictement plus permissif que le précédent**, donc il ne peut rien
 * déclasser : tout ce qui était reconnu comme plaque l'est encore, on en reconnaît seulement plus.
 */
const BORD = 0.2;

/** La part de chaque bord échantillonnée près d'un angle pour en estimer la couleur de fond. */
const PART_ANGLE = 0.35;
function aUnePlaque(data, W, H, C) {
  const a = (x, y) => data[(y * W + x) * C + 3];
  const [x0, x1] = [Math.floor(W * BORD), Math.ceil(W * (1 - BORD))];
  const [y0, y1] = [Math.floor(H * BORD), Math.ceil(H * (1 - BORD))];
  for (let x = x0; x < x1; x++) if (a(x, 0) < OPACITE_PLAQUE || a(x, H - 1) < OPACITE_PLAQUE) return false;
  for (let y = y0; y < y1; y++) if (a(0, y) < OPACITE_PLAQUE || a(W - 1, y) < OPACITE_PLAQUE) return false;
  return true;
}

/**
 * Le fond modélisé comme une surface **bilinéaire** tendue entre les quatre coins.
 *
 * ⚠️ **Une couleur unique ne suffisait pas, et `KLAC` le prouve : 166 niveaux entre ses coins.**
 * Sa plaque est un dégradé diagonal cyan → bleu → violet ; keyée contre la médiane du pourtour,
 * elle ressortait en rectangle dégradé posé derrière le dessin. Une surface bilinéaire rend
 * **exactement** un aplat comme un dégradé linéaire, qui sont les deux seuls fonds rencontrés.
 */
function modeleFond(data, W, H, C) {
  /**
   * ⚠️ **Chaque point de contrôle est la **médiane du pourtour** près de son angle, et non un
   * pixel.** Un pixel d'angle ne marche pas sur une plaque arrondie — `ETN` — où l'angle est
   * transparent et son RVB rangé vaut (0, 0, 0) : le modèle décrivait alors un fond noir absent
   * de l'image.
   *
   * ⚠️ **Et un point pris « en retrait » ne marche pas non plus — c'est l'erreur que j'ai faite
   * en corrigeant la première.** J'échantillonnais à 20 % des bords pour éviter les angles ronds ;
   * mais quand la marque est grande, ce point tombe **dans le dessin**. Le modèle décrivait alors
   * la marque, `seuilBas` saturait à 80, et l'incrustation échouait : `NOC`, `GM`, `PRU` et une
   * vingtaine d'autres sont passés d'un détourage correct à aucun fichier du tout.
   *
   * ⚠️ **Le pourtour est le seul endroit sûr.** Sur une plaque, le bord extérieur est du fond par
   * construction — une marque qui le toucherait ferait un logo pleine page, pas une plaque. On
   * ne lit donc que la ligne et la colonne extrêmes, on saute les pixels vides (angles ronds), et
   * on prend la médiane pour rester insensible à un liseré ou à un pixel aberrant.
   */
  const lire = (x, y) => { const i = (y * W + x) * C; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; };
  /** La médiane des pixels **opaques du pourtour** proches d'un angle donné. */
  const angle = (droite, bas) => {
    const ech = [];
    const nx = Math.max(1, Math.round(W * PART_ANGLE));
    const ny = Math.max(1, Math.round(H * PART_ANGLE));
    for (let k = 0; k < nx; k++) {
      const x = droite ? W - 1 - k : k;
      for (const y of [bas ? H - 1 : 0]) { const p = lire(x, y); if (p[3] >= OPACITE_PLAQUE) ech.push(p); }
    }
    for (let k = 0; k < ny; k++) {
      const y = bas ? H - 1 - k : k;
      for (const x of [droite ? W - 1 : 0]) { const p = lire(x, y); if (p[3] >= OPACITE_PLAQUE) ech.push(p); }
    }
    if (!ech.length) return [0, 0, 0];
    return [0, 1, 2].map(k => {
      const v = ech.map(p => p[k]).sort((a, b) => a - b);
      return v[v.length >> 1];
    });
  };
  const c = [angle(false, false), angle(true, false), angle(false, true), angle(true, true)];
  return (x, y) => {
    const u = W > 1 ? x / (W - 1) : 0, v = H > 1 ? y / (H - 1) : 0;
    return [0, 1, 2].map(k =>
      (c[0][k] * (1 - u) + c[1][k] * u) * (1 - v) + (c[2][k] * (1 - u) + c[3][k] * u) * v);
  };
}

/**
 * Le seuil bas, **calibré sur l'image** : l'écart entre le pourtour réel et son modèle.
 *
 * ⚠️ **Le fixer en dur ne pouvait pas marcher pour les deux familles à la fois.** Un aplat colle
 * à son modèle à deux ou trois niveaux près ; un dégradé qui n'est pas exactement linéaire s'en
 * écarte bien davantage. Un seuil unique laissait donc soit des bavures de plaque, soit un dessin
 * mangé. Mesurer l'écart puis lui ajouter une marge est la seule version qui ne suppose rien.
 *
 * ⚠️ **Un centile et non le maximum — le maximum a fait échouer dix-neuf logos.** Il suffisait
 * qu'**un seul pixel du dessin touche le bord** pour que l'écart mesuré soit énorme : le seuil
 * saturait alors à son plafond de 80, l'incrustation effaçait tout ce qui était à moins de 80 du
 * fond, c'est-à-dire le dessin lui-même. Diagnostiqué sur les dix-neuf : `seuil=80` sur dix-huit
 * d'entre eux. `MO`, `HIG`, `RJF`, `EFX`, `NWS` ont des logotypes qui atteignent le bord.
 *
 * ⚠️ **C'est la même leçon que pour le modèle de fond, apprise deux fois.** Là-bas j'avais
 * remplacé un pixel d'angle par une médiane du pourtour ; ici je laissais un `max`. Une statistique
 * de pire cas sur des données qui contiennent des exceptions ne mesure que l'exception.
 */
const CENTILE_SEUIL = 0.95;

function seuilBas(data, W, H, C, fond) {
  const ecarts = [];
  const test = (x, y) => {
    const i = (y * W + x) * C;
    /* ⚠️ Les pixels **vides** du pourtour sont ignorés : sur une plaque à coins arrondis, leur
       RVB rangé est (0, 0, 0) et leur écart au modèle serait énorme. Calibrer là-dessus ferait
       exploser le seuil, et l'incrustation mangerait le dessin. */
    if (data[i + 3] < OPACITE_PLAQUE) return;
    const f = fond(x, y);
    ecarts.push(Math.hypot(data[i] - f[0], data[i + 1] - f[1], data[i + 2] - f[2]));
  };
  for (let x = 0; x < W; x++) { test(x, 0); test(x, H - 1); }
  for (let y = 0; y < H; y++) { test(0, y); test(W - 1, y); }
  if (!ecarts.length) return 10;
  ecarts.sort((a, b) => a - b);
  const pire = ecarts[Math.min(ecarts.length - 1, Math.floor(ecarts.length * CENTILE_SEUIL))];
  return Math.min(pire + 10, LOIN - 12);
}

/**
 * Retire le fond modélisé et rend des pixels détourés.
 *
 * ⚠️ **La couleur des pixels de bord est corrigée, sans quoi il reste un halo.** Un pixel à moitié
 * transparent garde la couleur du *mélange* marque + plaque ; affiché sur une tuile sombre, ce
 * mélange trahit l'ancienne plaque en liseré autour du dessin. On remonte donc la couleur pure
 * par `c = (mélange − (1−a)·fond) / a`, l'inverse exact de la composition qui l'a produite.
 */
function detourer(data, W, H, C, fond, bas) {
  const out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * C, j = (y * W + x) * 4;
    const f = fond(x, y);
    const d = Math.hypot(data[i] - f[0], data[i + 1] - f[1], data[i + 2] - f[2]);
    /**
     * ⚠️ **L'opacité d'origine multiplie celle qu'on calcule, et l'oublier avait **inversé**
     * `ADI`.** FMP le sert comme un carré blanc dont le triangle est **évidé** — 13 634 pixels à
     * alpha zéro. Or un pixel transparent stocke quand même un RVB, ici (0,0,0) : l'incrustation,
     * qui ne regardait que la couleur, le trouvait très loin du blanc et le **gardait**, tandis
     * qu'elle effaçait le carré. On livrait le trou peint en noir, à savoir un triangle noir plein
     * là où il fallait le logo d'Analog Devices. Ce qui était vide doit le rester.
     */
    const a = (data[i + 3] / 255) * (d <= bas ? 0 : d >= LOIN ? 1 : (d - bas) / (LOIN - bas));
    if (a === 0) continue;                       // Buffer.alloc a déjà mis les quatre à zéro
    for (let k = 0; k < 3; k++) {
      const v = (data[i + k] - (1 - a) * f[k]) / a;
      out[j + k] = Math.max(0, Math.min(255, Math.round(v)));
    }
    out[j + 3] = Math.round(a * 255);
  }
  return out;
}

/** Le pourtour est-il devenu suffisamment transparent ? L'invariant qui dit si le modèle a tenu. */
function pourtourNet(buf, W, H) {
  /**
   * ⚠️ **La question posée est « la plaque a-t-elle disparu ? », et non « combien de pixels
   * restent ? ».** Je comptais les pixels de pourtour encore opaques, avec un seuil arbitraire.
   * Mais un logotype qui **atteint le bord** en laisse forcément — mesuré : 36 % pour `NWS`,
   * 27 % pour `HIG`, 17 % pour `HUBB`. Aucun seuil ne pouvait à la fois les accepter et rejeter
   * une plaque mal retirée : les deux populations se recouvrent.
   *
   * ⚠️ **Réutiliser `aUnePlaque` sur le résultat dit exactement ce qu'on veut savoir.** Si le
   * pourtour est encore *plein*, la plaque est toujours là et l'incrustation a échoué ; s'il est
   * troué, elle est partie — que le dessin en occupe deux pour cent ou quarante.
   */
  return !aUnePlaque(buf, W, H, 4);
}

/** La boîte d'encre et la clarté moyenne du dessin — de quoi vérifier le résultat. */
function mesurer(buf, W, H) {
  let x0 = W, x1 = -1, y0 = H, y1 = -1, somme = 0, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (buf[i + 3] < 24) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (buf[i + 3] > 200) { somme += 0.299 * buf[i] + 0.587 * buf[i + 1] + 0.114 * buf[i + 2]; n++; }
  }
  if (x1 < 0) return null;
  return { partOpaque: n / (W * H), clarte: n ? somme / n : 0 };
}

async function charger(url) {
  /* ⚠️ Un agent identifiable, pas un navigateur déguisé : Wikimedia refuse les agents génériques
     et demande qu'on se nomme. Les deux autres fournisseurs l'acceptent aussi. */
  const r = await fetch(url, { headers: { "user-agent": "NovacLogos/1.0 (logos internes)" } });
  if (!r.ok) return null;
  const b = Buffer.from(await r.arrayBuffer());
  const m = await sharp(b).metadata();
  return { b, def: Math.max(m.width, m.height) };
}

/**
 * ⚠️ **Les fonctions sont exportées pour pouvoir être **instrumentées** une par une.** Diagnostiquer
 * les logos qui échouent demandait de rejouer la chaîne hors du script ; je l'avais d'abord
 * recopiée dans un banc d'essai, et la copie a divergé — elle omettait le recadrage, si bien que
 * `GM` y « passait » alors qu'il échoue ici. Un diagnostic qui ne rejoue pas le vrai code ne
 * diagnostique rien.
 */
module.exports = { preparer, boiteEncre, recadrer, aUnePlaque, modeleFond, seuilBas, detourer,
                   pourtourNet, mesurer, charger, OPACITE_PLAQUE, BORD, LOIN, TAILLE };

if (require.main !== module) return;

(async () => {
  const combien = Number(process.argv[2]) || 100;
  const j = await (await fetch(API)).json();
  const cotes = j.titres.filter(t => t.capitalisation > 0);
  /**
   * ⚠️ **Un périmètre incomplet ne doit rien produire, parce qu'il **supprime**.** La carte de
   * chaleur dépend de Yahoo, qui limite le débit ; ce jour-là elle n'a rendu **qu'un seul titre
   * sur 503**. Le script a donc calculé un périmètre de 161 tickers, jugé les 447 autres
   * périmés, et les a effacés — le manifeste est tombé de 503 à 136 sans qu'aucune étape
   * n'échoue. Chaque pièce faisait son travail ; c'est leur enchaînement qui détruisait.
   *
   * ⚠️ **La borne porte sur ce qu'on a reçu, pas sur ce qu'on a demandé.** Exiger un compte exact
   * casserait au moindre retrait d'indice ; accepter n'importe quoi laisse passer le cas d'un
   * seul titre. Les quatre cinquièmes attendus séparent nettement les deux.
   */
  const attendu = Math.min(combien, 503);
  if (cotes.length < attendu * 0.8) {
    console.error(`ABANDON : la carte de chaleur n'a rendu que ${cotes.length} titres cotés sur`
      + ` ${attendu} attendus. Rien n'a été écrit ni supprimé — relancer quand elle sera chaude.`);
    process.exitCode = 1;
    return;
  }
  const indice = cotes.sort((a, b) => b.capitalisation - a.capitalisation)
    .slice(0, combien).map(t => t.ticker);

  /* La réunion des trois provenances, dédoublonnée et dans un ordre stable : l'indice d'abord,
     puis les suggestions, puis les lignes détenues hors des deux. */
  const catalogue = tickersDuCatalogue();
  const top = [...new Set([...indice, ...catalogue, ...AUTRES_TICKERS])];
  console.log(`périmètre : ${indice.length} de l'indice + ${catalogue.length} du catalogue`
    + ` + ${AUTRES_TICKERS.length} hors listes = ${top.length} tickers`);

  fs.mkdirSync(RACINE, { recursive: true });
  const rapport = [];

  for (const ticker of top) {
    /* ⚠️ Quand Wikipédia a une entrée, elle **remplace** les fournisseurs au lieu de les
       concurrencer : le départage se fait à la quantité de dessin, et un pictogramme faux mais
       grand battrait un lettrage juste. Une entrée dans la table est une décision, pas un
       candidat. */
    const emetteur = LOGOS_EMETTEUR[ticker];
    const wiki = LOGOS_WIKIPEDIA[ticker];
    const sources = emetteur
      ? [["Émetteur", emetteur.url || adresseWikipedia(emetteur.fichier, emetteur.largeur)]]
      : wiki
      ? [["Wikipédia", adresseWikipedia(wiki)]]
      : [
          ["FMP", `https://financialmodelingprep.com/image-stock/${ticker}.png`],
          ["Parqet", `https://assets.parqet.com/logos/symbol/${encodeURIComponent(ticker)}?format=png&size=${TAILLE}`],
        ];
    /**
     * ⚠️ **On évalue les deux sources au lieu de garder la première qui répond, et le gain se
     * mesure sur le dessin.** L'ordre fixe prenait FMP puis Parqet en repli. Mais la définition
     * qui compte n'est pas celle de la *toile*, c'est celle du **dessin** : la pomme de FMP tient
     * dans 48 pixels sur une toile de 100, là où Parqet la sert bien plus grande sur sa plaque de
     * 256. À toile égale ou même plus petite, une source peut donc porter deux fois plus de
     * détail. On les détoure toutes les deux et on garde celle qui en a le plus.
     */
    const candidats = [];
    for (const [nom, url] of sources) {
      let src; try { src = await charger(url); } catch { src = null; }
      if (!src || src.def < 64) continue;

      /**
       * ⚠️ **Le carré est isolé à la définition **native**, avant toute réduction.** Le faire
       * après `preparer` annulait la haute définition demandée : le verrouillage 2000 × 412 était
       * d'abord ramené à 256 de large, si bien que son carré ne mesurait plus que 53 px et que
       * `ESE.PA` sortait en **43 × 42**. On découpe donc dans la source, puis on réduit — l'ordre
       * inverse jetait précisément ce qu'on était allé chercher.
       *
       * ⚠️ **Recadrage sur l'encre d'abord :** le fichier de Wikipédia porte des marges
       * transparentes, et découper « le carré de tête » sur une image margée rognerait du vide.
       */
      if (emetteur?.carreDeTete) {
        const n = await sharp(src.b).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        let nb = n.data, nW = n.info.width, nH = n.info.height;
        const enc = boiteEncre(nb, nW, nH);
        if (enc) { nb = recadrer(nb, nW, nH, enc); nW = enc.l; nH = enc.h; }
        const cote = Math.min(nW, nH);
        nb = recadrer(nb, nW, nH, { x0: 0, y0: 0, l: cote, h: cote });
        src = { b: await sharp(nb, { raw: { width: cote, height: cote, channels: 4 } }).png().toBuffer(),
                def: cote };
      }

      const { data, info } = await preparer(src.b);
      let W = info.width, H = info.height;
      const C = info.channels;
      let buf = Buffer.alloc(W * H * 4);
      for (let p = 0; p < W * H; p++)
        for (let k = 0; k < 4; k++) buf[p * 4 + k] = data[p * C + k];

      /**
       * ⚠️ **Recadrer puis retester, en boucle — parce que le recadrage *révèle* des plaques.**
       * `SCHW` en est le cas : FMP le sert comme un rectangle bleu **en retrait** de sa toile, le
       * reste étant transparent. Le pourtour de la toile est donc vide, le test conclut « déjà
       * détouré », et on livrait la vignette bleue. Une fois rogné sur l'encre, ce même fichier
       * *est* la plaque, et le test le voit enfin. Une passe unique ne pouvait pas l'attraper,
       * quel que soit son seuil : elle regardait au mauvais endroit.
       *
       * ⚠️ **Trois passes au plus, et la borne n'est pas décorative.** Chaque passe doit réduire
       * l'image ou s'arrêter ; sans borne, une image dont l'incrustation ne converge pas
       * boucherait le script sans rien signaler.
       */
      /**
       * ⚠️ **Une passe ratée n'invalide plus la source : on garde le dernier état valide.** C'est
       * ce qui perdait `AIG`, `BR`, `SBAC` et `GM`. La passe 1 retire correctement leur plaque et
       * laisse un **cartouche** — le rectangle blanc autour d'« AIG ». La passe 2 voit alors le
       * bord opaque de ce cartouche, le prend pour une plaque à son tour, et l'efface : image
       * vide, source rejetée, aucun fichier. La boucle mangeait son propre résultat.
       *
       * ⚠️ **La boucle sert à peler des plaques imbriquées, pas à tout ou rien.** Si un pelage
       * échoue, l'état d'avant reste parfaitement valide — c'est même le bon résultat. On ne perd
       * que ce que la passe fautive aurait ajouté.
       */
      let action = "déjà détouré", seuil;
      let retenu = { buf, W, H, action };
      for (let passe = 0; passe < 3; passe++) {
        const b = boiteEncre(buf, W, H);
        if (!b) break;
        if (b.l !== W || b.h !== H) { buf = recadrer(buf, W, H, b); W = b.l; H = b.h; }
        retenu = { buf, W, H, action };
        if (!aUnePlaque(buf, W, H, 4)) break;

        const fond = modeleFond(buf, W, H, 4);
        seuil = seuilBas(buf, W, H, 4, fond);
        const suivant = detourer(buf, W, H, 4, fond, seuil);
        const m = mesurer(suivant, W, H);
        /* ⚠️ Deux refus, et chacun a un cas réel derrière lui : une incrustation qui efface
           presque tout a mangé le dessin ; un pourtour resté *plein* veut dire que la plaque est
           toujours là. Dans les deux cas on s'arrête et on garde l'état précédent. */
        if (!m || m.partOpaque < 0.005 || !pourtourNet(suivant, W, H)) break;
        buf = suivant;
        action = "détouré";
        retenu = { buf, W, H, action };
      }
      ({ buf, W, H, action } = retenu);

      /* ⚠️ Une source dont la plaque n'a jamais pu être retirée n'est pas un candidat : la garder
         reviendrait à livrer la vignette, ce qu'on cherche précisément à éviter. */
      if (aUnePlaque(buf, W, H, 4)) continue;
      const fin = boiteEncre(buf, W, H);
      if (!fin) continue;
      if (fin.l !== W || fin.h !== H) { buf = recadrer(buf, W, H, fin); W = fin.l; H = fin.h; }

      candidats.push({ nom, action, buf, W, H, def: src.def, encre: Math.max(W, H),
                       seuilBas: seuil === undefined ? undefined : Math.round(seuil) });
    }
    /* La source qui porte le plus de dessin l'emporte ; à égalité, l'ordre d'origine tranche. */
    const choisi = candidats.sort((a, b) => b.encre - a.encre)[0] ?? null;

    if (!choisi) { rapport.push({ ticker, echec: true }); continue; }

    /**
     * ⚠️ **On écrit la boîte d'encre telle quelle : ni mise au carré, ni remise à l'échelle.**
     * La version précédente centrait le dessin dans un carré de 256 — c'est-à-dire qu'elle
     * *rajoutait* les marges transparentes qu'on vient de retirer, et le fichier redevenait
     * incomparable aux autres. `objectFit: contain` ajuste le dessin sur son plus grand côté :
     * un fichier au format de son encre s'affiche donc à la taille de sa pastille, quel que soit
     * son rapport. C'est la propriété qu'on cherchait.
     */
    await sharp(choisi.buf, { raw: { width: choisi.W, height: choisi.H, channels: 4 } })
      .png({ compressionLevel: 9 }).toFile(path.join(RACINE, `${ticker}.png`));

    const m = mesurer(choisi.buf, choisi.W, choisi.H);
    rapport.push({ ticker, nom: choisi.nom, action: choisi.action, def: choisi.def,
                   encre: `${choisi.W}x${choisi.H}`, seuilBas: choisi.seuilBas, ...m });
  }

  const ok = rapport.filter(r => !r.echec);
  const det = ok.filter(r => r.action === "détouré");

  /**
   * ⚠️ **Un manifeste, et non un simple essai de `/logos/X.png` avec repli sur erreur.** Le repli
   * marcherait — `AssetLogo` passe à l'adresse suivante sur `onerror` — mais la carte de chaleur
   * affiche cinq cents titres dont quatre cents n'ont pas de fichier local : ce serait quatre
   * cents requêtes 404 à chaque affichage, et une console illisible pour couvrir les vraies.
   */
  const liste = ok.map(r => r.ticker).sort();

  /**
   * ⚠️ **Les fichiers d'une passe précédente sont supprimés, sinon le dossier ment.** Le script
   * écrit sans nettoyer : après une passe où quelques logos ont cessé de passer les garde-fous,
   * `public/logos` contenait **490 fichiers pour 469 au manifeste**. Les vingt et un orphelins
   * n'étaient pas servis — le manifeste seul décide — mais ils faussaient toute vérification faite
   * sur le dossier, et c'est exactement ce genre d'écart silencieux qu'on cherche à éviter ici.
   */
  const attendus = new Set(liste.map(t => `${t}.png`));
  const orphelins = fs.readdirSync(RACINE).filter(f => f.endsWith(".png") && !attendus.has(f));
  for (const f of orphelins) fs.unlinkSync(path.join(RACINE, f));
  if (orphelins.length) console.log(`nettoyage : ${orphelins.length} fichier(s) périmé(s) supprimé(s)`);

  fs.writeFileSync(path.join(__dirname, "..", "src", "lib", "logosLocaux.ts"),
    `/**\n * Les tickers dont le logo est servi depuis \`public/logos\`, détouré par nos soins.\n *\n` +
    ` * ⚠️ **Fichier engendré par \`scripts/detourer-logos.cjs\` — ne pas modifier à la main.**\n` +
    ` * Il couvre les ${liste.length} premières capitalisations du S&P 500. Le reste du catalogue\n` +
    ` * continue de passer par les fournisseurs distants ; c'est le repli, pas une exception.\n */\n` +
    `export const LOGOS_LOCAUX: ReadonlySet<string> = new Set(${JSON.stringify(liste)});\n`);
  console.log(`manifeste : src/lib/logosLocaux.ts (${liste.length} tickers)`);

  console.log(`\n${ok.length}/${top.length} logos écrits dans public/logos`);
  console.log(`  déjà détourés : ${ok.length - det.length}`);
  console.log(`  détourés ici  : ${det.length} — ${det.map(r => r.ticker).join(" ")}`);
  const ech = rapport.filter(r => r.echec);
  if (ech.length) console.log(`  ⚠️ échecs : ${ech.map(r => r.ticker).join(" ")}`);
  const petits = ok.filter(r => r.def < 200);
  console.log(`  définition source < 200 px : ${petits.length} — ${petits.map(r => r.ticker).join(" ")}`);
  console.log(`\nclarté : sombres (<110) ${ok.filter(r => r.clarte < 110).length}` +
              ` | quasi blanches (>200) ${ok.filter(r => r.clarte > 200).length}`);
  console.log(JSON.stringify(det, null, 1));
})();
