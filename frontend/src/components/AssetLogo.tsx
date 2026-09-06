"use client";
import { useState, useEffect, useRef, CSSProperties, memo } from "react";
import { poidsGroupe, pourFondSombre, rvbVersHex } from "@/lib/couleur";
import type { RVB } from "@/lib/couleur";
import { analyseFaite, aspectConnu, filtreDuDessin, fondPastille as fondDeLaPastille, margeDuDessin, retenirAspect, retenirTeinte, teinteConnue } from "@/lib/couleursLogos";
import type { AspectLogo } from "@/lib/couleursLogos";
import { LOGOS_LOCAUX } from "@/lib/logosLocaux";

const _idxCache  = new Map<string, number>();
/* La teinte dominante vit désormais dans `lib/couleursLogos`, pour que les surfaces qui
   n'affichent pas de logo puissent la consulter sans qu'on leur câble un rappel. */
/**
 * L'adresse d'un logo, relayée par notre origine pour être lisible au canevas.
 *
 * ⚠️ **Sans elle, deux des cinq sources sont muettes.** Parqet et CoinCap ne répondent pas
 * aux requêtes `crossOrigin` ; une image chargée d'elles teinte le canevas et `getImageData`
 * lève. Or Parqet est la première adresse essayée pour toute action : l'analyse échouait donc
 * sur presque tous les logos, et silencieusement. Le relais vit dans `app/api/logo`, dont
 * l'en-tête raconte la mesure.
 *
 * ⚠️ **Réservée aux sondes.** L'`<img>` affichée garde l'adresse d'origine — voir la route.
 */
const viaRelais = (src: string) =>
  /* ⚠️ Un logo local est **déjà** de notre origine : le passer au relais le ferait refuser par
     sa liste blanche — qui n'admet que des hôtes distants en https — et l'analyse échouerait
     sans bruit, donc sans marge ni pastille blanche. */
  src.startsWith("/") ? src : `/api/logo?u=${encodeURIComponent(src)}`;

/**
 * ⚠️ **`brandGlassBg` a été retiré : plus personne ne lui demandait de fond.** Il calculait un
 * voile de la couleur de marque — ou d'un hachage du ticker — et le posait sous **tous** les
 * logos. Depuis que la pastille se règle sur l'aspect mesuré du dessin, un logo à plaque ne veut
 * rien derrière lui et un détouré à marque claire non plus ; seul le détouré sombre veut un
 * fond, et il le veut **blanc**, pas teinté.
 */

function cryptoSymbol(ticker: string): string {
  return ticker.replace(/-[A-Z]{2,5}$/, "").replace(/[0-9]+$/, "").toLowerCase();
}

const CMC_IDS: Record<string, number> = {
  btc:1, eth:1027, bnb:1839, sol:5426, xrp:52, doge:74, ada:2010,
  avax:5805, dot:6636, shib:5994, matic:3890, pol:3890, link:1975,
  uni:7083, ltc:2, atom:3794, trx:1958, etc:1321, xlm:512, fil:2280,
  hbar:4642, apt:21794, arb:11841, op:11840, sui:20947, pepe:24478,
  wif:28752, inj:7226, sei:23149, jup:29210, near:6535, vet:3077,
  mkr:1518, aave:7278, sand:6210, mana:1966, crv:6538, comp:5692,
  snx:2586, ens:13855, imx:10603, rune:4157, ftm:3513, s:3513,
  algo:4030, icp:8916, qnt:3155, eos:1765, flow:4558, ksm:5034,
  xmr:328, zec:1437, bch:1831, ton:11419, wld:13502, stx:4847,
  floki:10804, bonk:23095, render:5690, fet:3773, grt:6719, ldo:8000,
};

/**
 * La résolution demandée aux sources, en pixels.
 *
 * ⚠️ **Cent pixels ne suffisaient pas, et l'écran le montre.** Parqet répond en **100 × 100**
 * quand on ne lui demande rien ; or la carte d'en-tête de la page graphique affiche son logo à
 * 60 px, soit **120 pixels physiques** sur un écran à densité double — l'image y était donc
 * agrandie, et molle. Le paramètre `size` existe et n'était pas employé.
 *
 * ⚠️ **Et c'est un vrai rendu, pas un agrandissement.** Vérifié en comparant le 256 servi au
 * 100 agrandi en lanczos : **2,71 niveaux d'écart moyen** par composante, donc deux images
 * différentes. Parqet garde des originaux vectoriels — son point d'entrée `format=svg` le
 * confirme — et rastérise à la demande. Le poids ne bouge pas : un kilo-octet dans les deux cas.
 *
 * ⚠️ **CoinMarketCap passe de 64 à 128 pour la même raison.** Son 64 × 64 était en dessous du
 * moindre affichage rétina. Les paliers offerts sont 64, 128 et 200 ; 128 couvre les 60 px de la
 * carte d'en-tête, et 200 ne servirait qu'à charger sept kilo-octets au lieu de cinq.
 */
const TAILLE_LOGO = 256;

/**
 * Les adresses à essayer pour un actif, dans l'ordre — et le **périmètre** que cela dessine.
 *
 * ⚠️ **L'application n'a pas de catalogue fermé, et c'est le point de départ.** La recherche
 * interroge Yahoo Finance : n'importe quel titre coté au monde peut être ouvert. On ne peut donc
 * pas garantir un logo pour « tous les actifs » — on peut garantir une **dégradation propre**
 * partout, et une couverture mesurée par famille. Audité par `scripts/audit-perimetre.cjs` sur un
 * échantillon réel de la recherche, et par `scripts/audit-logos.cjs` sur les catalogues locaux :
 *
 * - **Composants du S&P 500** — 502 sur 503, soit 100 % à l'arrondi. Le seul absent est `VMRK`.
 * - **Cryptomonnaies** — **157 sur 227, soit 69 %**, et la couverture suit le rang : 92 % dans les
 *   cent premières, 79 % ensuite, 57 % au-delà de la trois-centième. ⚠️ *Un « 8 sur 8 » a figuré
 *   ici : c'étaient les huit cryptos d'un échantillon de recherche biaisé vers les actions, pas
 *   une couverture. Le compte au dénominateur, jamais l'échantillon sous la main.*
 * - **Actions** — 76 sur 84. Les manquantes sont des **cotations secondaires étrangères** :
 *   `RHO.DE` pour Roche, `1NESN.MI` pour Nestlé, `AHL1.F` pour Alibaba. Le fournisseur ne connaît
 *   que la ligne principale, et les rattacher demanderait une table de correspondance qui
 *   n'existe pas ici.
 * - **ETF** — 43 sur 45 ; manquent deux fonds PEA d'Amundi.
 * - **Fonds communs** — 5 sur 17, et c'est structurel : un `0P0001OZ17` est un identifiant
 *   Morningstar, aucun fournisseur de logos ne couvre cette famille.
 *
 * ⚠️ **Ce qui est garanti, en revanche, l'est sans exception : une carte se rend toujours.**
 * Sans logo, `AssetLogo` affiche les initiales du ticker ; sans couleur de marque, `couleurActif`
 * descend jusqu'au hachage, qui ne peut pas échouer. Vérifié à l'écran sur `RHO.DE`, hors
 * couverture : initiales « RHO », couleur attribuée, carte intacte. Il n'y a pas d'actif qui
 * casse, seulement des actifs moins bien servis.
 */
function resolveUrls(ticker: string, type?: string): string[] {
  const isCrypto = type === "CRYPTOCURRENCY" || ticker.endsWith("-USD");
  if (isCrypto) {
    const sym = cryptoSymbol(ticker);
    const cmcId = CMC_IDS[sym];
    const urls: string[] = [];
    if (cmcId) urls.push(`https://s2.coinmarketcap.com/static/img/coins/128x128/${cmcId}.png`);
    urls.push(`https://assets.coincap.io/assets/icons/${sym}@2x.png`);
    urls.push(`https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons/128/color/${sym}.png`);
    return urls;
  }
  const clean = ticker.replace(/\.[A-Z]{1,3}$/, "").replace(/^\^/, "");
  /**
   * ⚠️ **Le fichier local passe devant tout, et il règle deux choses d'un coup.** Il est
   * **détouré pour de vrai** — les neuf logos que nos fournisseurs ne servaient qu'en plaque ont
   * été incrustés par `scripts/detourer-logos.cjs` — et il ne dépend de personne. Mesuré avant :
   * sur 309 tuiles affichées ensemble, **137 logos retombaient sur les plaques de Parqet alors
   * que FMP les avait** ; la source détourée ne tient pas trois cents requêtes simultanées.
   *
   * ⚠️ **Conditionné au manifeste, jamais essayé à l'aveugle.** Seules les cent premières
   * capitalisations ont un fichier ; tenter l'adresse pour les autres ferait quatre cents 404 par
   * affichage de la carte de chaleur.
   *
   * ⚠️ **Devant, mais pas seul.** Le manifeste est engendré avec les fichiers, donc d'accord avec
   * eux — jusqu'au jour où un déploiement emporte l'un sans l'autre. Les adresses distantes
   * restent derrière : `onerror` y descend, et l'actif s'affiche au lieu de montrer ses initiales.
   */
  const locales = LOGOS_LOCAUX.has(ticker) ? [`/logos/${ticker}.png`] : [];
  /**
   * ⚠️ **La source détourée passe devant, et c'est un arbitrage mesuré.** Parqet sert des
   * **plaques** — un carré de couleur avec la marque dessus — qui se lisent comme des badges sur
   * une tuile. FMP sert le même logo **détouré** dans 76 % des cas, mesuré sur cent vingt valeurs
   * du S&P 500, et le couvre à 120/120. Un dessin posé nu est plus propre qu'un badge, demandé à
   * l'usage.
   *
   * ⚠️ **Le prix est la résolution, et il est réel.** Parqet rend 256 px partout ; FMP rend 250
   * pour la plupart mais retombe à **100 px pour un logo sur six**. On perd donc en finesse là
   * où on gagne en propreté. Parqet reste en second : il rattrape les absents de FMP et ses
   * plaques restent les bienvenues quand le détourage n'existe pas.
   */
  const urls = [
    ...locales,
    `https://financialmodelingprep.com/image-stock/${ticker}.png`,
    `https://assets.parqet.com/logos/symbol/${encodeURIComponent(ticker)}?format=png&size=${TAILLE_LOGO}`,
  ];
  if (clean !== ticker) urls.push(`https://financialmodelingprep.com/image-stock/${clean}.png`);
  return urls;
}

/**
 * ⚠️ **`fondDuLogo`, `extraireFond`, `_fondCache` et la propriété `onFondExtrait` ont été
 * retirés.** Ils lisaient la couleur exacte de la plaque d'un logo — les quatre coins, à la
 * taille naturelle, sans conversion — pour que la carte des marchés la reprenne et que la
 * plaque s'y fonde. Cela marchait : les logos Parqet sont des aplats parfaits, écart nul entre
 * leurs coins. Mais la page est devenue une **carte de chaleur**, où la couleur porte la
 * variation et non la marque : plus personne ne demandait ce fond, et un calcul que nul ne lit
 * est exactement ce qu'on vient de retirer vingt lignes plus bas.
 *
 * Ce qui reste de cet épisode et qui sert toujours : le relais `api/logo`, sans lequel aucune
 * analyse de pixels n'est possible sur les logos Parqet — voir `viaRelais`.
 */

/**
 * ⚠️ **`analyzeElement`, `analyzeAsync`, `LogoMeta` et `_metaCache` ont été retirés d'ici : ils
 * ne servaient à rien, au sens strict.** Ils calculaient deux booléens — le logo porte-t-il son
 * propre fond, son dessin est-il sombre — que le composant rangeait dans un état `meta`
 * **jamais lu** : ni le rendu, ni le fond du cadre, ni la bordure ne le consultaient. Vérifié
 * en cherchant chaque occurrence : quatre écritures, aucune lecture.
 *
 * Ils ne coûtaient presque rien tant que la sonde échouait — `crossOrigin` sur Parqet, donc
 * une erreur immédiate, dont le rattrapage rendait la même valeur que le succès. En les
 * faisant passer par le relais, on leur aurait rendu leur travail : un aller-retour réseau et
 * une lecture de 32 × 32 pixels par logo, pour un résultat que personne ne regarde.
 *
 * Ce qu'ils faisaient de juste — lire l'opacité des coins pour savoir si un logo porte sa
 * propre plaque — est décrit dans le commentaire ci-dessus, et se réécrit en dix lignes le jour
 * où quelqu'un en aura l'usage.
 */
/**
 * La couleur de plaque d'un logo : le fond sur lequel la marque est posée, ou `null`.
 *
 * ⚠️ **Elle répond à une question que la dominante ne pose pas.** Relevé sur neuf logos : le
 * fonds `ESE.PA` est un dessin **vert sur plaque blanche** — la dominante dit juste, la plaque
 * ne dit rien ; `JPM` est un **« JPMC » blanc sur plaque brune** — c'est l'inverse, et la table
 * de marques comme la dominante y donnaient un bleu qu'on ne voit nulle part sur le logo.
 *
 * ⚠️ **Trois conditions, et chacune écarte un cas rencontré.** Les coins doivent être
 * **opaques** — sinon le logo est détouré et n'a pas de plaque ; ils doivent être **proches** —
 * jusqu'à quarante-huit niveaux d'écart, car la plaque de `JPM` est un dégradé qui en mesure
 * trente-cinq, mais au-delà ce n'est plus un fond, c'est une image ; et la couleur doit être
 * **chromatique** — une plaque blanche (Microsoft, `ESE.PA`), quasi blanche (Alphabet) ou noire
 * (Apple) ne dit rien d'une marque, et la retenir donnerait une carte blanche ou noire.
 */
/**
 * La marque est-elle sombre ? — c'est-à-dire invisible sur une tuile foncée si on la pose nue.
 *
 * ⚠️ **On ne mesure que les pixels opaques, et c'est tout le point.** Un logo détouré est
 * majoritairement transparent : moyenner l'image entière rendrait la couleur du vide. Seuls les
 * pixels du dessin comptent, et c'est leur clarté moyenne qui décide.
 *
 * ⚠️ **Le seuil de 110 sur 255 vient d'une mesure, pas d'un tour de main.** Sur cent vingt
 * valeurs du S&P 500 servies détourées, il sépare 38 marques sombres — Accenture, Adobe, Amgen,
 * Aon — des claires, et ces trente-huit sont exactement celles qui disparaissent sur le fond de
 * l'application.
 */
/**
 * ⚠️ **Une seule passe de canevas pour les trois questions, et c'était déjà la règle.** Elles
 * portent toutes sur la même image à la même définition ; `plaqueDuLogo` et `marqueSombre`
 * dessinaient chacune la leur, et ajouter le détourage en aurait fait une troisième. Le
 * commentaire d'`extractColor` disait déjà « la plaque se relève dans la même image chargée » —
 * il n'était vrai que du téléchargement, pas du dessin.
 */
function aspectDuLogo(img: HTMLImageElement, detoureConnu: boolean): AspectLogo {
  const NEUTRE: AspectLogo = { plaque: null, marque: null, detoure: detoureConnu, monochrome: false };
  const S = 64;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  if (!ctx) return NEUTRE;
  ctx.drawImage(img, 0, 0, S, S);
  const { data } = ctx.getImageData(0, 0, S, S);
  const px = (x: number, y: number) => {
    const i = (y * S + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };

  /* La couleur moyenne du dessin. ⚠️ Seuls les pixels **opaques** comptent : moyenner l'image
     entière d'un logo détouré rendrait la couleur du vide. */
  const somme = [0, 0, 0];
  let n = 0, sommeSaturation = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i], v = data[i + 1], b = data[i + 2];
    somme[0] += r; somme[1] += v; somme[2] += b;
    /* ⚠️ La saturation se cumule **pixel par pixel**, jamais sur la moyenne : un logo
       rouge-et-vert a une moyenne grisâtre et passerait pour monochrome. */
    const mx = Math.max(r, v, b), mn = Math.min(r, v, b);
    sommeSaturation += mx === 0 ? 0 : (mx - mn) / mx;
    n++;
  }
  /**
   * ⚠️ **Le seuil de 0,12 vient de la distribution des cent logos, pas d'un choix de confort.**
   * Relevé : 21 monochromes en dessous, et la zone limite est vide entre `CB` à 0,097 et `ISRG`
   * à 0,175 — le seuil tombe dans un trou, ce qui est la seule position défendable. `AAPL`
   * mesure 0,000.
   */
  const monochrome = n > 0 && sommeSaturation / n < 0.12;
  const marque: RVB | null = n > 0
    ? [Math.round(somme[0] / n), Math.round(somme[1] / n), Math.round(somme[2] / n)]
    : null;

  /**
   * ⚠️ **Quand on le sait, on ne le devine pas — et `MSFT` montre pourquoi.** Nos cent fichiers
   * locaux sont détourés *par construction* : `scripts/detourer-logos.cjs` les a produits. Les
   * relire aux pixels pour redécouvrir ce fait donnait une réponse fausse, parce que les quatre
   * carrés de Microsoft **couvrent tout le cadre** : coins opaques, pourtour opaque à **94 %**,
   * seuls les interstices sont vides. Aucun seuil ne le sépare d'une vraie plaque, mesurée à
   * 100 % sur `KO`, `PEP`, `PG`, `ABT` et `PFE`. Le logo repartait donc sans marge, collé bord à
   * bord — l'aspect même qu'on venait de corriger.
   *
   * ⚠️ **Pour les sources distantes, en revanche, il faut bien mesurer**, et l'opacité des coins
   * suffit : la séparation y est franche, 0 à 2 % contre 100 %.
   */
  const coins = [px(0, 0), px(S - 1, 0), px(0, S - 1), px(S - 1, S - 1)];
  if (detoureConnu || coins.some(p => p[3] < 250))
    return { plaque: null, marque, detoure: true, monochrome };

  /* Les coins sont opaques : reste à savoir si leur couleur dit quelque chose de la marque.
     Ils doivent être **proches** — jusqu'à quarante-huit niveaux, car la plaque de `JPM` est un
     dégradé qui en mesure trente-cinq, au-delà ce n'est plus un fond mais une image — et
     **chromatiques** : un blanc (Microsoft), un quasi-blanc (Alphabet) ou un noir (Apple) ne dit
     rien d'une marque, et le retenir donnerait une carte blanche ou noire. */
  const ecart = Math.max(...[0, 1, 2].map(k =>
    Math.max(...coins.map(p => p[k])) - Math.min(...coins.map(p => p[k]))));
  if (ecart > 48) return { plaque: null, marque, detoure: false, monochrome };

  const moyenne = [0, 1, 2].map(k => Math.round(coins.reduce((s, p) => s + p[k], 0) / 4));
  const [max, min] = [Math.max(...moyenne), Math.min(...moyenne)];
  const clarte = (max + min) / 2 / 255;
  const saturation = max === 0 ? 0 : (max - min) / max;
  const plaque = saturation < 0.15 || clarte < 0.10 || clarte > 0.88
    ? null
    : rvbVersHex(moyenne as [number, number, number]);
  return { plaque, marque, detoure: false, monochrome };
}

function extractColor(src: string, ticker: string, cb: (hex: string) => void, reveiller?: (a: AspectLogo) => void): void {
  const img = new Image();
  img.onload = () => {
    /* ⚠️ La plaque se relève dans la **même** image chargée. La lire à part doublerait le
       téléchargement et la lecture de pixels pour une information tirée du même fichier. */
    const local = src.startsWith("/logos/");
    let a: AspectLogo;
    try { a = aspectDuLogo(img, local); }
    catch { a = { plaque: null, marque: null, detoure: local, monochrome: false }; }
    retenirAspect(ticker, a);
    reveiller?.(a);
    try {
      const SIZE = 32;
      const canvas = document.createElement("canvas");
      canvas.width = SIZE; canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
      type Bucket = { count: number; r: number; g: number; b: number; sat: number };
      const buckets = new Map<number, Bucket>();
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
        if (a < 50) continue;
        const brightness = (r + g + b) / 3;
        if (brightness > 220 || brightness < 15) continue;
        const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
        const sat = max === 0 ? 0 : d / max;
        if (sat < 0.15) continue;
        let h = 0;
        if (d !== 0) {
          if (max === r)      h = ((g-b)/d + (g < b ? 6 : 0)) / 6;
          else if (max === g) h = ((b-r)/d + 2) / 6;
          else                h = ((r-g)/d + 4) / 6;
        }
        const bkt = Math.floor(h * 24);
        const ex = buckets.get(bkt);
        if (!ex) buckets.set(bkt, { count:1, r, g, b, sat });
        else { ex.count++; if (sat > ex.sat) { ex.r=r; ex.g=g; ex.b=b; ex.sat=sat; } }
      }
      if (!buckets.size) return;
      // Le groupe retenu n'est plus le plus nombreux mais le plus marquant :
      // compter les pixels seuls faisait gagner les grandes plages ternes — le
      // pelage brun d'un logo animalier l'emportait sur la couleur vive que
      // l'œil retient.
      let best: Bucket = { count:0, r:91, g:141, b:239, sat:0 };
      let meilleur = -1;
      buckets.forEach(v => {
        const p = poidsGroupe(v.count, v.sat);
        if (p > meilleur) { meilleur = p; best = v; }
      });
      // Ramenée dans la plage lisible sur fond sombre, teinte inchangée : un
      // brun de pelage reste un brun mais cesse de se confondre avec le fond.
      cb(pourFondSombre(rvbVersHex([best.r, best.g, best.b])));
    } catch { /* canevas teinté : le relais n'a pas répondu */ }
  };
  img.src = viaRelais(src);
}

interface Props {
  ticker: string;
  type?: string;
  size?: number;
  radius?: number;
  style?: CSSProperties;
  fallbackBg: string;
  fallbackBorder: string;
  fallbackTextColor: string;
  bare?: boolean; // no background/border — use inside cards that already have their own surface
  /**
   * La couleur de la surface sur laquelle ce logo est posé, si l'appelant la connaît.
   *
   * ⚠️ **Facultative à dessein : seule la carte de chaleur en a besoin.** Partout ailleurs le
   * logo repose sur la surface sombre du thème, que la règle par défaut suppose déjà. La carte,
   * elle, recolore ses tuiles du vert vif au rouge vif selon la performance — c'est le seul
   * endroit où le fond n'est pas connu d'avance, et le seul où 29 logos sur 100 tombaient sous
   * le seuil de contraste.
   */
  fondSurface?: string;
  onColorExtracted?: (hex: string) => void;
}

function AssetLogoInner({
  ticker, type, size = 32, radius = 8,
  style, fallbackBg, fallbackBorder, fallbackTextColor, bare, fondSurface, onColorExtracted,
}: Props) {
  const urls      = resolveUrls(ticker, type);
  const cachedIdx  = _idxCache.get(ticker);

  const [idx,    setIdx]    = useState(cachedIdx ?? 0);
  const [status, setStatus] = useState<"loading"|"ok"|"failed">(cachedIdx !== undefined ? "ok" : "loading");
  /**
   * L'aspect du logo, tenu dans l'état parce qu'il décide du rendu.
   *
   * ⚠️ **Le cache partagé ne réveille personne, et c'est écrit dans son en-tête.** L'aspect y est
   * rangé pour les surfaces qui n'affichent pas de logo ; mais une écriture dans une `Map` ne
   * déclenche aucun rendu. Ce composant, lui, doit changer de fond **à l'arrivée** de l'analyse —
   * un logo à marque sombre resterait sinon sans sa pastille blanche jusqu'au prochain rendu venu
   * d'ailleurs. D'où une copie dans l'état, initialisée depuis le cache pour ne rien réanalyser.
   */
  const [aspect, setAspect] = useState<AspectLogo | null>(() => aspectConnu(ticker));

  const imgRef    = useRef<HTMLImageElement>(null);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const c = _idxCache.get(ticker);
    setIdx(c ?? 0);
    setStatus(c !== undefined ? "ok" : "loading");
    setAspect(aspectConnu(ticker));
  }, [ticker]);

  // Timeout de 4s : si l'image ne répond pas (réseau bloqué, adblocker…)
  // on bascule sur "failed" pour afficher les initiales
  useEffect(() => {
    if (status !== "loading") { if (timerRef.current) clearTimeout(timerRef.current); return; }
    timerRef.current = setTimeout(() => {
      setStatus(s => s === "loading" ? "failed" : s);
    }, 4000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [status, idx]);

  useEffect(() => {
    if (status === "loading" && imgRef.current?.complete) {
      if (imgRef.current.naturalWidth > 0) {
        onLoaded(imgRef.current);
      } else {
        if (idx + 1 < urls.length) setIdx(i => i + 1);
        else setStatus("failed");
      }
    }
  }, [idx, status]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * ⚠️ **Les analyses consultent le cache avant de retélécharger.** Elles ne le faisaient pas,
   * alors que les caches existaient déjà et servaient à l'état initial vingt lignes plus haut :
   * chaque remontage d'un logo rechargeait une image et relisait ses pixels au canevas, pour
   * recalculer un résultat déjà connu. Et les remontages sont fréquents — la page du
   * portefeuille se rend plusieurs fois par seconde, poussée par les cours en direct.
   *
   * Mesuré au repos, sur onze secondes, pour vingt et un logos affichés : **cinquante-six
   * objets `Image` et vingt-cinq lectures `getImageData`** avant, **sept et une** après.
   * Rien ne change à l'écran ; c'est du réseau et du calcul rendus, en production comme en
   * développement.
   *
   * ⚠️ **Un cache par question, et non un pour tout le fichier.** Il n'en reste qu'un —
   * la teinte dominante du dessin, sortie dans `lib/couleursLogos` — depuis que la carte de chaleur n'a plus
   * besoin de la couleur de plaque. La règle vaut pour la prochaine analyse : deux questions
   * sur la même image sont deux caches, sans quoi il faut tout relancer dès que l'une manque.
   */
  function onLoaded(_el: HTMLImageElement) {
    _idxCache.set(ticker, idx);
    setStatus("ok");

    /**
     * ⚠️ **L'analyse redevient inconditionnelle, et j'avais eu raison de la conditionner puis
     * tort de le faire.** Je venais de la réserver aux tickers absents de la table de marques,
     * pour économiser un aller-retour dont le résultat était jeté. Mais la **plaque** se relève
     * dans la même passe, et elle prime désormais sur la table : la sauter pour `JPM` — qui *est*
     * dans la table — reviendrait à ne jamais voir que sa plaque est brune. On analyse donc une
     * fois par ticker, quel que soit ce que la table en dit.
     *
     * ⚠️ **Une fois, vraiment.** `analyseFaite` interroge le cache des **plaques**, qui est
     * écrit dans tous les cas — `null` compris. Interroger celui des teintes aurait laissé
     * retélécharger indéfiniment les logos dont le dessin n'offre aucune couleur vive.
     */
    if (!analyseFaite(ticker)) {
      extractColor(urls[idx], ticker, hex => {
        retenirTeinte(ticker, hex);
        onColorExtracted?.(hex);
      }, setAspect);
    } else {
      const connue = teinteConnue(ticker);
      if (connue) onColorExtracted?.(connue);
    }
  }

  const handleError = () => {
    if (idx + 1 < urls.length) setIdx(i => i + 1);
    else setStatus("failed");
  };

  const label = ticker
    .replace(/-USD$/,"").replace(/[0-9]+$/,"")
    .replace(/\.[A-Z]{1,3}$/,"").replace(/^\^/,"")
    .slice(0,4).toUpperCase();

  /**
   * Le fond de la pastille : trois cas, et un seul mérite un fond.
   *
   * ⚠️ **Le logo portait toujours un aplat teinté, qu'il en ait besoin ou non.** `brandGlassBg`
   * posait un voile de la couleur de marque sous **tous** les logos — y compris sous ceux qui
   * ont déjà leur propre plaque, ce qui faisait une plaque sur un voile, et sous ceux qui sont
   * détourés à marque claire, qui n'ont besoin de rien. Demandé à l'usage : un dessin posé nu,
   * propre.
   *
   * ⚠️ **Les cas se mesurent sur l'image, ils ne se devinent pas** — la règle vit dans
   * `fondPastille`, dont l'en-tête raconte pourquoi le seuil absolu a dû céder au contraste
   * mesuré. Ici on ne fait que lui donner ce qu'elle demande.
   *
   * ⚠️ **La pastille se décide sur `detoure`, pas sur l'absence de plaque exploitable :** la
   * glisser sous le carré noir d'`AAPL` — opaque, mais refusé comme *couleur* — ne se voyait pas,
   * et c'est bien le problème d'un calcul faux qui passe inaperçu.
   *
   * ⚠️ **Tant que l'analyse n'a pas répondu, on ne met rien.** Elle arrive après le chargement
   * de l'image ; poser un fond par défaut ferait clignoter la pastille du teinté au blanc. Ne
   * rien poser fait au pire paraître un logo sombre une fraction de seconde, ce qui se voit
   * moins qu'un changement de fond.
   */
  const fondPastille = status !== "ok" ? fallbackBg : fondDeLaPastille(aspect, fondSurface ?? null);
  const filtre = filtreDuDessin(aspect, fondSurface ?? null);
  const marge = margeDuDessin(size, aspect);
  const containerBg  = bare ? fondPastille : status !== "ok" ? fallbackBg : fondPastille;
  const containerBdr = "none";

  return (
    <div style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0,
      position: "relative", overflow: "hidden",
      background: containerBg,
      border: status === "failed" ? `1px solid ${fallbackBorder}` : containerBdr,
      display: "flex", alignItems: "center", justifyContent: "center",
      ...style,
    }}>

      {/* Fallback initials */}
      {status === "failed" && (
        <span style={{
          fontSize: Math.max(6, Math.floor(size * 0.27)), fontWeight: 800,
          color: fallbackTextColor, letterSpacing: "-0.02em", userSelect: "none",
        }}>
          {label}
        </span>
      )}

      {/* Logo */}
      {status !== "failed" && (
        <img
          ref={imgRef}
          key={`${ticker}-${idx}`}
          src={urls[idx]}
          alt={ticker}
          style={{
            /* ⚠️ La marge se pose sur l'image, pas en `padding` sur la pastille : le bloc
               conteneur d'un élément absolu est la **boîte de remplissage** de son ancêtre, si
               bien qu'un `inset: 0` avec `width: 100%` ignorerait ce remplissage. */
            position: "absolute",
            top: marge, left: marge,
            width:  `calc(100% - ${2 * marge}px)`,
            height: `calc(100% - ${2 * marge}px)`,
            objectFit: "contain",
            /* ⚠️ Le filtre bascule les dessins monochromes dans l'autre ton plutôt que de leur
               glisser une plaque dessous — voir `filtreDuDessin`. */
            filter: filtre,
            opacity: status === "ok" ? 1 : 0,
            transition: "opacity 0.15s ease",
          }}
          onLoad={() => onLoaded(imgRef.current!)}
          onError={handleError}
        />
      )}

      {/**
        * ⚠️ **Le relief a été retiré, et il tenait en trois couches.** Un reflet blanc sur la
        * moitié haute, une ombre noire sur le tiers bas, et un anneau intérieur clair en haut /
        * sombre en bas — la recette d'une icône d'iOS. Ensemble elles bombaient la plaque.
        *
        * ⚠️ **Trois raisons de s'en passer, dont deux mesurables.** Elles s'appliquaient au
        * logo *et* à son fond, donc elles éclaircissaient la marque elle-même — un logo n'a
        * pas à changer de couleur parce qu'on l'a posé sur une plaque. Elles ne s'affichaient
        * qu'au-delà de vingt-quatre pixels, si bien que le même actif n'avait pas le même
        * aspect selon l'écran où on le regardait. Et elles répètent, ici, l'imitation de verre
        * déjà écartée des pastilles de couleur : l'application ne fait plus semblant d'avoir
        * de la matière.
        */}


    </div>
  );
}

const AssetLogo = memo(AssetLogoInner);
export default AssetLogo;
