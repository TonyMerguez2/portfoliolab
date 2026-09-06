"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import AssetLogo from "@/components/AssetLogo";
import { surfaceAplat } from "@/lib/tileStyle";
import { couleurPerformance, encreSur, melanger, PALETTE_SECOURS, pourContrasteSur, SEUILS_PAR_PERIODE } from "@/lib/couleur";
import type { PaletteChaleur } from "@/lib/couleur";
import { resoudreJeton, useModeTheme } from "@/lib/theme";

/**
 * La carte de chaleur du S&P 500 : cinq cents titres, groupés par secteur.
 *
 * ⚠️ **Un composant à part, et non `LiquidGlassTreemap` élargi.** Les deux dessinent des
 * rectangles proportionnels, et c'est tout ce qu'ils partagent. Celui-là montre **sept** actifs
 * d'un portefeuille, avec leur poids, leur courbe et leur performance en euros ; celle-ci en
 * montre **cinq cents**, sans portefeuille, groupés par secteur, où la moitié des tuiles fait
 * moins de trente pixels et ne peut porter qu'un sigle. Les faire cohabiter dans un composant
 * aurait donné une cascade de conditions dont aucune branche ne sert aux deux.
 *
 * ⚠️ **Ce qui se partage se partage vraiment, mais ailleurs.** La surface en aplat, la rampe de
 * couleur, le choix de l'encre et le liseré viennent tous de `tileStyle` et de `couleur` : les
 * deux cartes rendent donc la même matière sans partager une ligne de disposition. C'est la
 * règle déjà écrite dans `tileSurface` — le surface se mutualise, le composant non.
 */

type Titre = {
  ticker: string;
  nom: string;
  secteur: string;
  capitalisation: number;
  variation: number;
  cours: number;
};

type Reponse = { periode: string; horodatage: number; titres: Titre[]; sansDonnees?: boolean };

/**
 * Les périodes proposées, dans l'ordre où on les lit.
 *
 * Les clés sont celles que le service attend — voir `PERIODES` dans
 * `backend/app/services/chaleur.py`, qui refuse tout le reste et retombe sur « 1j ».
 */
const PERIODES: { cle: string; nom: string }[] = [
  { cle: "1j",  nom: "1 J" },
  { cle: "1s",  nom: "1 S" },
  { cle: "1m",  nom: "1 M" },
  { cle: "3m",  nom: "3 M" },
  { cle: "aaj", nom: "AAJ" },
  { cle: "1a",  nom: "1 A" },
];

/**
 * Les écarts, et pourquoi ils sont si petits.
 *
 * ⚠️ **Deux pixels entre les tuiles suffisaient à défaire la carte.** Avec huit de plus entre
 * les secteurs, le fond passait partout et l'ensemble se lisait comme des pastilles dispersées
 * plutôt que comme un pavage. Relevé en comparant avec TradingView : chez eux les tuiles se
 * touchent, séparées d'un filet, et c'est ce qui fait la densité d'une carte de chaleur — la
 * surface colorée doit dominer, pas le fond entre les cases.
 */
/**
 * Les crans de grossissement, et non une échelle continue.
 *
 * ⚠️ **Le zoom libre rendait les tuiles illisibles, et c'est arithmétique.** Les tailles sont
 * calculées à l'écran puis divisées par le facteur, puisque la transformation les remultiplie.
 * À un facteur entier, 22 ⁄ 2 fait 11 : le navigateur rastérise un texte de 11 px et le double
 * proprement. À 2,3, il rastérise 9,57 px et multiplie — les jambages tombent entre deux pixels
 * et le sigle se brouille. Des crans entiers font retomber toutes les tailles sur des valeurs
 * rondes. Relevé à l'usage : « c'est illisible ».
 *
 * ⚠️ **Seize au plus, et huit ne suffisait pas.** J'avais borné à huit en calculant que la
 * plus petite tuile, 5 px de côté, en ferait 40 — assez pour un sigle. Le calcul portait sur la
 * *plus petite*, or ce qui compte est le nombre de tuiles encore muettes : à huit, il en restait
 * que le pavage n'avait toujours pas ouvertes. Seize porte la même tuile de 5 px à 80.
 */
const CRANS = [1, 2, 3, 4, 6, 8, 12, 16];
const ZOOM_MAX = CRANS[CRANS.length - 1];

/** La hauteur de la barre d'outils, en tête du panneau. */
const BARRE = 44;

const ECART = 1;         // entre deux tuiles d'un même secteur
const ECART_SECTEUR = 4; // entre deux secteurs
const EN_TETE = 18;      // la bande où s'écrit le nom du secteur


const formaterCap = (v: number) =>
  v >= 1e12 ? `${(v / 1e12).toFixed(2)} T$`
  : v >= 1e9 ? `${(v / 1e9).toFixed(0)} Md$`
  : `${(v / 1e6).toFixed(0)} M$`;

/**
 * ⚠️ **Plus de `margeHaut` : la barre d'outils est entrée dans le panneau.** Elle vivait dans
 * la bande du bandeau, que la carte devait donc éviter en décalant ses tuiles — et elle y
 * partageait la place avec le champ de recherche, posé en `position: fixed`, ce qui obligeait à
 * lui réserver **356 pixels** et faisait disparaître la légende sous 832 px de large. Dans un
 * panneau qui commence sous le bandeau, la barre a toute la largeur : la réserve tombe, la
 * légende tient à toutes les tailles, et le décalage des tuiles n'a plus lieu d'être.
 */
export default function CarteChaleur() {
  const boite = useRef<HTMLDivElement>(null);
  const [taille, setTaille] = useState({ l: 900, h: 600 });
  const [periode, setPeriode] = useState("1j");
  /**
   * Grouper par secteur, ou non.
   *
   * ⚠️ **Ce n'est pas seulement un en-tête qu'on cache.** Dégroupée, la carte redevient un seul
   * pavage : les cinq cents titres se rangent par capitalisation décroissante sans cloison, ce
   * qui donne plus de place aux petits et fait mieux voir la hiérarchie des tailles. Groupée,
   * elle répond à « quel secteur tient le marché aujourd'hui ». Deux questions différentes, et
   * aucune des deux ne se déduit de l'autre.
   */
  const [grouper, setGrouper] = useState(true);

  /**
   * La palette, lue sur les jetons de l'application.
   *
   * ⚠️ **Résolue une fois, et non cinq cents.** `resoudreJeton` appelle `getComputedStyle`,
   * qui force le navigateur à calculer les styles : l'appeler dans le rendu de chaque tuile en
   * ferait cinq cents par image.
   *
   * ⚠️ **Par effet et non par mémo, et ce n'est pas un détail de style.** Un `useMemo` sur
   * `[mode]` faisait ce qu'il fallait mais le vérificateur de règles le refusait, à juste
   * titre : la fonction ne *lit* pas `mode`, elle lit le DOM, et rien ne dit à React que l'un
   * dépend de l'autre. Un effet exprime la vraie chaîne — le thème a changé, donc il faut
   * relire les jetons — et le premier rendu part de la palette de secours, ce qui est
   * exactement ce qu'il faut côté serveur, où aucun jeton n'est résoluble.
   */
  /**
   * Le grossissement, et le déplacement qui va avec.
   *
   * ⚠️ **Le zoom doit *révéler*, pas seulement agrandir — c'est toute la demande.** Une simple
   * `transform: scale()` grossirait aussi le texte déjà présent et laisserait muettes les
   * tuiles qui n'en portaient pas : une case de 10 px qui n'affichait rien deviendrait une case
   * de 40 px qui n'affiche toujours rien. Ce qu'une tuile dessine est donc décidé sur son aire
   * **apparente** — `aire × k²` — et les tailles de texte et de logo sont ensuite divisées par
   * `k`, puisque la transformation les remultipliera. Résultat : en grossissant, une petite
   * tuile franchit les mêmes seuils que les grandes et gagne son sigle, sa variation, puis son
   * logo.
   *
   * ⚠️ **Le déplacement ne passe pas par React.** Zoomer est rare et refait les cinq cents
   * tuiles — mesuré à 80 ms, imperceptible sur un cran. Déplacer est continu : l'écrire dans
   * l'état ferait ce rendu à chaque image de glissement. Il s'écrit donc directement sur le
   * style, comme la position de l'infobulle et pour la même raison.
   */
  const [zoom, setZoom] = useState(1);
  const vue = useRef<HTMLDivElement>(null);
  const deplacement = useRef({ x: 0, y: 0 });
  const glisse = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null);

  const mode = useModeTheme();
  const [palette, setPalette] = useState<PaletteChaleur>(PALETTE_SECOURS);
  useEffect(() => {
    setPalette({
      hausse: resoudreJeton("--nv-positif", PALETTE_SECOURS.hausse),
      baisse: resoudreJeton("--nv-negatif", PALETTE_SECOURS.baisse),
      /* La palette n'a pas de cran « case au repos » : ses sept crans déclinent une couleur,
         pas une surface neutre. `--nv-bord-fort` en est le plus proche mais ne tient que
         1,37:1 contre le fond de la page — une case sans mouvement y disparaîtrait. Éclairci
         d'un quart vers le gris de texte : 2,15:1. */
      neutre: melanger(
        resoudreJeton("--nv-bord-fort", "#1E2939"),
        resoudreJeton("--nv-texte-secondaire", "#99A1AF"),
        0.25,
      ),
    });
  }, [mode]);
  const [donnees, setDonnees] = useState<Reponse | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [survole, setSurvole] = useState<Titre | null>(null);
  /**
   * ⚠️ **La position de l'infobulle est écrite dans le DOM, pas dans l'état.** Elle y était, et
   * chaque `mousemove` re-rendait donc les cinq cents tuiles pour déplacer une boîte de deux
   * cents pixels. Mesuré : **1,7 ms par événement**, soit un dixième du budget d'une image à
   * soixante hertz, dépensé à ne rien changer à l'écran. C'est le même constat que
   * `trackSpecular` dans `tileStyle`, dont le commentaire dit déjà pourquoi un pointeur ne
   * passe pas par React.
   */
  const bulle = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = boite.current;
    if (!el) return;
    const mesurer = (l: number, h: number) => setTaille({ l: Math.floor(l), h: Math.floor(h) });
    mesurer(el.clientWidth, el.clientHeight);
    const ro = new ResizeObserver(([e]) => mesurer(e.contentRect.width, e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /**
   * ⚠️ **Le rafraîchissement est à la minute, et il suit le cache du serveur.** Celui-ci garde
   * son calcul soixante secondes : demander plus souvent ne rendrait que la même réponse. On
   * s'aligne donc dessus plutôt que de deviner un rythme, et on s'arrête quand l'onglet passe
   * en arrière-plan — une page qu'on ne regarde pas n'a pas à réveiller le serveur.
   */
  useEffect(() => {
    let vivant = true;
    const charger = async () => {
      try {
        const r = await fetch(`/api/v1/chaleur?periode=${periode}`);
        if (!r.ok) throw new Error(`serveur ${r.status}`);
        const d: Reponse = await r.json();
        if (!vivant) return;
        setDonnees(d);
        setErreur(d.sansDonnees ? "Aucune donnée pour cette période." : null);
      } catch (e) {
        if (vivant) setErreur(e instanceof Error ? e.message : "échec du chargement");
      } finally {
        if (vivant) setChargement(false);
      }
    };
    setChargement(true);
    charger();
    const minuterie = setInterval(() => {
      if (document.visibilityState === "visible") charger();
    }, 60_000);
    return () => { vivant = false; clearInterval(minuterie); };
  }, [periode]);

  /**
   * La disposition : un niveau de secteurs, un niveau de titres.
   *
   * ⚠️ **`paddingTop` est ce qui creuse la bande d'en-tête.** d3 ne sait pas écrire un titre de
   * groupe ; il sait réserver de la place au-dessus des enfants d'un nœud, et c'est là qu'on
   * écrit le nom du secteur. Sans lui, les titres rempliraient le rectangle du secteur jusqu'au
   * bord et le nom se poserait par-dessus une tuile.
   */
  const disposition = useMemo(() => {
    const titres = donnees?.titres ?? [];
    if (!titres.length || taille.l < 40 || taille.h < 40) return null;

    /* ⚠️ `Array.from` et non l'étalement du `Map` : la cible TypeScript du projet est en
       deçà d'ES2015 pour l'itération, et `[...map]` y échoue à la compilation. */
    const parSecteur = Array.from(d3.group(titres, t => t.secteur), ([secteur, membres]) => ({
      secteur, children: membres,
    }));
    const racine = d3
      .hierarchy<any>({ children: grouper ? parSecteur : titres })
      .sum((d: any) => d.capitalisation ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    d3.treemap<any>()
      .size([taille.l, Math.max(40, taille.h)])
      .paddingOuter(grouper ? ECART_SECTEUR / 2 : ECART)
      /* Sans groupement il n'y a pas d'en-tête à loger : laisser la réserve creuserait une
         bande vide en haut de chaque tuile. */
      .paddingTop(grouper ? EN_TETE : 0)
      .paddingInner(ECART)
      .round(true)
      .tile(d3.treemapSquarify)(racine);

    return racine;
  }, [donnees, taille, grouper]);

  const seuil = SEUILS_PAR_PERIODE[periode] ?? 3;
  /* ⚠️ **Le seuil couvre les commandes de zoom, qui sont arrivées après.** Il valait 560 quand
     la barre ne portait que les périodes et le groupement ; les deux boutons de zoom et le
     facteur en ont ajouté quatre-vingt-dix, et c'étaient eux qui se faisaient couper à droite —
     la légende, elle, restait. Ce qui doit céder en premier est ce dont on peut se passer. */
  const placeBarre = taille.l;

  /**
   * Les tuiles, calculées une fois par disposition.
   *
   * ⚠️ **Sans ce mémo, survoler une tuile en re-rendait cinq cents.** L'état `survole` vit dans
   * ce composant — il le faut, l'infobulle en dépend —, et tout changement d'état re-rend son
   * arbre entier. En figeant les éléments sur `[disposition, seuil]`, React retrouve les mêmes
   * objets d'un rendu à l'autre et saute leur réconciliation : seule l'infobulle est refaite.
   */
  const tuiles = useMemo(() => disposition?.leaves().map((n: any) => {
        const t: Titre = n.data;
        const l = n.x1 - n.x0, h = n.y1 - n.y0;
        if (l < 3 || h < 3) return null;

        /* Les côtés **apparents** : c'est sur eux que tout se décide. Une case de 10 px
           grossie quatre fois en fait 40, donc elle a désormais la place d'un sigle. */
        const lv = l * zoom, hv = h * zoom;
        const teinte = couleurPerformance(t.variation, seuil, palette);
        const encre = encreSur(teinte);
        const variation = `${t.variation >= 0 ? "+" : "−"}${Math.abs(t.variation).toFixed(2)} %`;

        /**
         * Tout est une **fraction de la hauteur de la tuile**, sans plancher ni plafond.
         *
         * ⚠️ **Les bornes cassaient le rapport aux deux bouts.** Un plancher de 9 px donnait aux
         * petites tuiles un texte énorme par rapport à elles ; un plafond de 38 le refusait aux
         * grandes, proportionnellement plus sobres. Deux tuiles de tailles différentes n'avaient
         * donc pas la même allure. Demandé à l'usage : « il faut que ce soit pareil, de toute
         * façon il y a le zoom pour les lire ».
         *
         * ⚠️ **La hauteur commande, et non le petit côté.** La pile est verticale : c'est la
         * hauteur qu'elle consomme. Le petit côté mélangeait les deux axes et donnait un texte
         * trop gros aux tuiles larges et basses.
         *
         * ⚠️ **La largeur ne fixe rien, elle borne.** Un sigle long dans une tuile étroite doit
         * rétrécir sous sa part de hauteur, sinon il se fait couper — « +1.16 % » rendu « L.16 »,
         * vu à l'écran. C'est la seule entorse au rapport constant, et elle est nécessaire.
         *
         * ⚠️ **Les chasses sont relevées, pas estimées**, et le « M » et le « W » comptent pour
         * un quart de plus : sur quatre lettres, deux larges suffisent à faire mentir une moyenne.
         * Mesuré en comparant `scrollWidth` et `clientWidth` sur les cinq cents tuiles.
         *
         * ⚠️ **`INTERLIGNE` sert deux fois, et il le faut.** C'est la hauteur de boîte réservée
         * dans le budget vertical **et** le `line-height` posé sur les deux textes. Les deux
         * doivent être le même nombre : réserver 1,15 et dessiner à 1,05 laisse les glyphes
         * sortir de leur boîte, ce qui ne déborde d'aucune mesure et se voit pourtant.
         */
        const PART_SIGLE = 0.20, PART_VAR = 0.15, PART_LOGO = 0.26, INTERLIGNE = 1.2;
        /* `split("")` et non l'étalement : la cible du projet est en deçà d'ES2015 pour
           l'itération, comme déjà rencontré sur `d3.group`. */
        const chasse = (texte: string) =>
          texte.split("").reduce((n, c) => n + (c === "M" || c === "W" ? 1.28 : 1), 0);
        const tenirEnLargeur = (texte: string, em: number) => (lv * 0.90) / (chasse(texte) * em);

        const sigleEcran = Math.min(hv * PART_SIGLE, tenirEnLargeur(t.ticker, 0.68));
        const varEcran = Math.min(hv * PART_VAR, tenirEnLargeur(variation, 0.62));
        const hLogo = hv * PART_LOGO;
        const sigleFs = sigleEcran / zoom;

        /**
         * Ce qui tient, décidé sur la place **restante** et non chacun dans son coin.
         *
         * ⚠️ **Trois seuils indépendants s'additionnent mal.** Chacun demandait « la tuile est-
         * elle assez haute pour moi ? » sans savoir ce que les autres avaient pris : une tuile de
         * 70 px accordait logo, sigle et variation, dont la pile en réclamait 90. Le sigle se
         * faisait alors rogner par le haut et paraissait passer **sous le logo** — vu à l'écran
         * sur « TXN » et « CRWD ».
         *
         * ⚠️ **Du plus utile au moins utile.** Le sigle d'abord, sans lui la tuile ne se nomme
         * pas ; la variation ensuite, qui est la donnée ; le logo en dernier, qui est un agrément
         * et le plus encombrant. L'ordre décide de ce qui saute quand la place manque.
         *
         * ⚠️ **Les seuils en pixels ne cadrent plus la taille, ils évitent les poussières.** Six
         * pixels de texte ne se lisent pas, mais le zoom est là pour ça : on ne grossit plus rien
         * de force, on s'abstient simplement de peindre l'illisible.
         */
        const ECART_PILE = 2;
        const hSigle = sigleEcran * INTERLIGNE;
        const hVar = varEcran * INTERLIGNE;
        const montrerSigle = sigleEcran >= 6 && hv >= hSigle;
        const montrerVar = montrerSigle && varEcran >= 6 && hv >= hSigle + hVar + ECART_PILE;
        const montrerLogo = montrerVar && hLogo >= 10
          && hv >= hSigle + hVar + hLogo + 2 * ECART_PILE;

        return (
          <div key={t.ticker}
            className="nv-chaleur-tuile"
            onMouseEnter={() => setSurvole(t)}
            onMouseLeave={() => setSurvole(null)}
            style={{
              /**
                * ⚠️ **Aucun arrondi : demandé, et la petite taille le justifie.** Un rayon de
                * cinq pixels sur une tuile de vingt ronge la moitié de chaque coin — elle cesse
                * d'être un rectangle et le pavage se troue. Relevé à l'usage, en comparant avec
                * TradingView, dont les tuiles sont franchement carrées.
                *
                * ⚠️ **Et plus de classe `novac-tile` non plus.** Elle apportait un liseré d'un
                * pixel tiré de `currentColor` et un grain : deux couches pensées pour une carte
                * d'actif isolée, qui sur cinq cents cases voisines ne font qu'un bruit de bord.
                * Ne reste que `nv-chaleur-tuile`, où vivent l'encadré de survol et la
                * neutralisation de l'ombre.
                */
              ...surfaceAplat(teinte, 0),
              position: "absolute",
              left: n.x0, top: n.y0, width: l, height: h,
              color: teinte,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: ECART_PILE / zoom,
              overflow: "hidden", cursor: "pointer",
              /* L'ombre portée de `surfaceAplat` est neutralisée par `.nv-chaleur-tuile`, dans
                 la feuille de style et non ici : c'est là que vit aussi l'encadré de survol, et
                 une ombre posée en ligne l'aurait emporté sur lui. */
            }}>
            {montrerLogo && (
              /* ⚠️ `teinte` est passée parce qu'ici — et ici seulement — le fond du logo n'est pas
                 connu d'avance : il va du vert vif au rouge vif selon la performance. Sans elle, la
                 pastille se décide sur un seuil absolu qui suppose un fond sombre, et 29 des 100
                 logos tombaient sous 3:1 de contraste, `WELL` à 1,01 — invisible. */
              <AssetLogo ticker={t.ticker} size={hLogo / zoom}
                radius={6 / zoom} fallbackBg="transparent" fallbackBorder="transparent"
                fallbackTextColor={encre} fondSurface={teinte} bare />
            )}
            {montrerSigle && (
              <span style={{
                /* ⚠️ **1,2 et non 1,05 : c'est l'interlignage qui faisait se chevaucher les
                   étages.** Une boîte de ligne à 1,05 em est plus courte que ce que la fonte
                   dessine — les hampes et les jambages d'Inter en occupent environ 1,2 — si bien
                   que les glyphes **sortaient de leur boîte** et mordaient sur le voisin du
                   dessus. Rien ne débordait au sens des boîtes, ce qui est exactement pourquoi
                   ma mesure de hauteur ne voyait rien alors que l'œil voyait « FICO » recouvert
                   par son pourcentage et « ON » collé sous son logo. */
                fontSize: sigleFs, fontWeight: 700, lineHeight: INTERLIGNE,
                color: `color-mix(in srgb, ${encre} 95%, transparent)`,
                whiteSpace: "nowrap", maxWidth: "100%", overflow: "hidden",
              }}>
                {t.ticker}
              </span>
            )}
            {/* ⚠️ Sous huit pixels la variation cesse d'être lisible : mieux vaut une tuile qui
                 ne porte que son sigle qu'une ligne de chiffres qu'on devine. */}
            {montrerVar && (
              <span style={{
                fontSize: varEcran / zoom, fontWeight: 600, lineHeight: INTERLIGNE,
                fontVariantNumeric: "tabular-nums",
                color: pourContrasteSur(t.variation >= 0 ? palette.hausse : palette.baisse, teinte),
                whiteSpace: "nowrap",
              }}>
                {variation}
              </span>
            )}
          </div>
        );
        }), [disposition, seuil, palette, zoom]);

  /**
   * Reborne le déplacement pour que la carte couvre toujours la vue.
   *
   * ⚠️ **Sans cela, on tire le pavage hors de l'écran et il reste du vide.** À grossissement 1
   * la carte fait exactement la taille de la vue : le seul déplacement licite est zéro, et la
   * borne le donne d'elle-même sans qu'on ait à traiter ce cas à part.
   */
  const reborner = (d: { x: number; y: number }, k: number) => ({
    x: Math.min(0, Math.max(taille.l - taille.l * k, d.x)),
    y: Math.min(0, Math.max(taille.h - taille.h * k, d.y)),
  });

  const poserTransformation = () => {
    const el = vue.current;
    if (!el) return;
    const { x, y } = deplacement.current;
    el.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
  };
  useEffect(poserTransformation);

  /**
   * La molette grossit **sous le curseur**, et non au centre.
   *
   * Le point visé doit rester sous le pointeur : c'est ce qu'on attend d'un zoom de carte, et
   * c'est ce qui permet d'aller chercher une petite tuile sans la perdre en route. D'où le
   * déplacement recalculé à partir de la position du curseur dans la vue.
   */
  const surMolette = (e: React.WheelEvent) => {
    e.preventDefault();
    const boiteVue = vue.current?.parentElement?.getBoundingClientRect();
    if (!boiteVue) return;
    /* La molette saute de cran en cran, comme les boutons : c'est la même échelle, et deux
       chemins vers des facteurs différents rendraient les crans inutiles. */
    const i = CRANS.indexOf(zoom);
    const k = CRANS[Math.min(CRANS.length - 1, Math.max(0, (i < 0 ? 0 : i) + (e.deltaY < 0 ? 1 : -1)))];
    if (k === zoom) return;
    const cx = e.clientX - boiteVue.left, cy = e.clientY - boiteVue.top;
    const d = deplacement.current;
    deplacement.current = reborner(
      { x: cx - (cx - d.x) * (k / zoom), y: cy - (cy - d.y) * (k / zoom) },
      k,
    );
    setZoom(k);
  };

  const surAppui = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    glisse.current = { x: e.clientX, y: e.clientY, ...deplacement.current ? { dx: deplacement.current.x, dy: deplacement.current.y } : { dx: 0, dy: 0 } };
  };

  /**
   * Passe au cran suivant ou précédent.
   *
   * ⚠️ **On cherche l'indice du cran courant plutôt que de tenir un compteur.** Les deux
   * reviennent au même tant que rien d'autre ne touche au zoom ; le jour où quelque chose y
   * touchera — un lien qui ouvre la carte grossie sur un secteur, par exemple — un compteur
   * désynchronisé donnerait un premier clic qui saute deux crans.
   */
  const changerCran = (sens: 1 | -1) => {
    /* ⚠️ **Forme fonctionnelle, et son absence se voyait au doigt.** Le gestionnaire lisait
       `zoom` dans la portée de son rendu : cinq clics rapides sur « + » voyaient tous la même
       valeur de départ et rendaient tous le cran suivant — on montait d'un cran au lieu de
       cinq. React ne re-rend qu'après le lot d'événements ; seul l'état passé en argument est
       à jour. Constaté en enchaînant les clics sans attendre le rendu. */
    setZoom(z => {
      const i = CRANS.indexOf(z);
      const suivant = CRANS[Math.min(CRANS.length - 1, Math.max(0, (i < 0 ? 0 : i) + sens))];
      deplacement.current = reborner(deplacement.current, suivant);
      return suivant;
    });
  };

  /* Le suivi du pointeur : une écriture de style, aucun rendu. */
  const suivre = (e: React.MouseEvent) => {
    const g = glisse.current;
    if (g) {
      deplacement.current = reborner(
        { x: g.dx + (e.clientX - g.x), y: g.dy + (e.clientY - g.y) },
        zoom,
      );
      poserTransformation();
      return;
    }
    const el = bulle.current;
    if (!el) return;
    el.style.left = `${Math.min(e.clientX + 14, window.innerWidth - 230)}px`;
    el.style.top = `${e.clientY + 16}px`;
  };

  return (
    <div style={{ width: "100%", height: "100%", minWidth: 0, display: "flex", flexDirection: "column" }}>
      {/* Le sélecteur de période et la légende, sur la bande laissée libre en haut. */}
      {/**
        * ⚠️ **La barre s'arrête à 352 pixels du bord droit, et ce n'est pas une marge de
        * confort.** Le champ de recherche du bandeau est en `position: fixed; right: 20px`
        * pour 320 de large : il occupe donc les 340 derniers pixels de la fenêtre, quelle que
        * soit la page. Sans cette réserve, la légende passait dessous — vu à l'écran.
        */}
      <div style={{
        flexShrink: 0, height: BARRE,
        display: "flex", alignItems: "center", gap: 14, padding: "0 12px",
        borderBottom: "1px solid var(--nv-bord)", overflow: "hidden",
      }}>
        {/* ⚠️ `flexShrink: 0` et `nowrap` : sans eux la barre comprimait les boutons jusqu'à
            couper « 1 J » sur deux lignes, vu à l'écran dès que le bouton « Secteurs » est
            venu partager la place. Mieux vaut que la légende disparaisse — elle sait le
            faire — que des libellés cassés. */}
        <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          {PERIODES.map(p => {
            const actif = p.cle === periode;
            return (
              <button key={p.cle} type="button" onClick={() => setPeriode(p.cle)}
                aria-pressed={actif}
                style={{
                  padding: "5px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                  fontSize: 12, fontWeight: 600, letterSpacing: "0.02em", whiteSpace: "nowrap",
                  fontVariantNumeric: "tabular-nums",
                  background: actif ? "var(--nv-barre-actif)" : "transparent",
                  color: actif ? "var(--nv-texte)" : "var(--nv-texte-secondaire)",
                  boxShadow: actif ? "inset 0 0 0 1px var(--nv-barre-actif-bord)" : "none",
                  transition: "background 140ms, color 140ms",
                }}>
                {p.nom}
              </button>
            );
          })}
        </div>

        {/**
          * ⚠️ **La légende montre la rampe, elle ne la décrit pas.** Sept pastilles prises dans
          * `couleurPerformance` aux mêmes bornes que les tuiles : si la rampe change, la légende
          * change avec, parce qu'elle est la même fonction. Écrire les couleurs à la main aurait
          * donné une légende qui ment le jour où l'échelle bouge.
          */}
        {/**
          * Le basculement du groupement par secteur.
          *
          * ⚠️ **Un interrupteur et non une liste déroulante.** Il n'y a que deux états, et une
          * liste à deux entrées demande deux gestes là où un bouton en demande un. `aria-pressed`
          * dit l'état aux technologies d'assistance, ce qu'un simple bouton ne ferait pas.
          */}
        <button type="button" onClick={() => setGrouper(g => !g)} aria-pressed={grouper}
          aria-label={grouper ? "Masquer les secteurs" : "Grouper par secteur"}
          style={{
            padding: "5px 10px", borderRadius: 8, border: "none", cursor: "pointer",
            fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0,
            background: grouper ? "var(--nv-barre-actif)" : "transparent",
            color: grouper ? "var(--nv-texte)" : "var(--nv-texte-secondaire)",
            boxShadow: grouper ? "inset 0 0 0 1px var(--nv-barre-actif-bord)" : "none",
            transition: "background 140ms, color 140ms",
          }}>
          Secteurs
        </button>

        {placeBarre > 700 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }} aria-hidden="true">
          <span style={{ fontSize: 11, color: "var(--nv-texte-secondaire)", fontVariantNumeric: "tabular-nums" }}>
            −{seuil} %
          </span>
          <div style={{ display: "flex", borderRadius: 4, overflow: "hidden" }}>
            {[-1, -0.66, -0.33, 0, 0.33, 0.66, 1].map(f => (
              <span key={f} style={{
                width: 16, height: 10,
                background: couleurPerformance(f * seuil, seuil, palette),
              }} />
            ))}
          </div>
          <span style={{ fontSize: 11, color: "var(--nv-texte-secondaire)", fontVariantNumeric: "tabular-nums" }}>
            +{seuil} %
          </span>
        </div>
        )}

        {/**
          * Les commandes de grossissement.
          *
          * ⚠️ **Poussées à droite par `marginLeft: auto`.** Elles ne se lisent pas avec les
          * périodes — celles-ci choisissent *ce qu'on regarde*, celles-là *de combien près*.
          * Les coller à la suite les aurait données pour une septième et huitième période.
          */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: "auto", flexShrink: 0 }}>
          {([["−", () => changerCran(-1)], ["+", () => changerCran(1)]] as const).map(([signe, agir]) => (
            <button key={signe} type="button" onClick={agir}
              aria-label={signe === "+" ? "Grossir" : "Réduire"}
              disabled={signe === "+" ? zoom >= ZOOM_MAX : zoom <= 1}
              style={{
                width: 26, height: 26, borderRadius: 7, border: "none",
                cursor: (signe === "+" ? zoom >= ZOOM_MAX : zoom <= 1) ? "default" : "pointer",
                fontSize: 15, fontWeight: 700, lineHeight: 1,
                background: "transparent",
                color: (signe === "+" ? zoom >= ZOOM_MAX : zoom <= 1)
                  ? "var(--nv-texte-attenue)" : "var(--nv-texte-secondaire)",
              }}>
              {signe}
            </button>
          ))}
          {/* Le facteur courant, qui sert aussi de bouton de retour à l'échelle 1. */}
          <button type="button" onClick={() => { deplacement.current = { x: 0, y: 0 }; setZoom(1); }}
            aria-label="Revenir à l'échelle d'origine"
            style={{
              padding: "5px 8px", borderRadius: 8, border: "none",
              cursor: zoom > 1 ? "pointer" : "default",
              fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums",
              background: "transparent",
              color: zoom > 1 ? "var(--nv-texte)" : "var(--nv-texte-attenue)",
              minWidth: 34,
            }}>
            ×{zoom}
          </button>
        </div>

        {chargement && (
          <span style={{ fontSize: 11, color: "var(--nv-texte-secondaire)" }}>Chargement…</span>
        )}
        {erreur && !chargement && (
          <span style={{ fontSize: 11, color: "var(--nv-negatif)" }}>{erreur}</span>
        )}
      </div>

      {/**
        * La zone de carte : tout ce qui reste sous la barre.
        *
        * ⚠️ **C'est elle qu'on mesure, et non le panneau entier.** Le `ResizeObserver` est posé
        * ici : la disposition de d3 doit connaître la place réellement offerte aux tuiles, pas
        * celle-ci augmentée de la barre. Mesurer le panneau obligeait à retrancher la hauteur
        * de la barre à la main — c'est ce que faisait `margeHaut`, et c'était une soustraction
        * de plus à tenir juste à chaque changement de la barre.
        */}
      <div ref={boite}
        onMouseMove={suivre}
        onWheel={surMolette}
        onMouseDown={surAppui}
        onMouseUp={() => { glisse.current = null; }}
        onMouseLeave={() => { glisse.current = null; setSurvole(null); }}
        style={{
          flex: 1, minHeight: 0, position: "relative", overflow: "hidden",
          cursor: zoom > 1 ? (glisse.current ? "grabbing" : "grab") : "default",
        }}>
        {/* La couche transformée : c'est elle qu'on déplace et qu'on grossit, d'un bloc. */}
        <div ref={vue} style={{
          position: "absolute", inset: 0, transformOrigin: "0 0",
          transform: `translate(${deplacement.current.x}px, ${deplacement.current.y}px) scale(${zoom})`,
          /* L'épaisseur des traits de mise en évidence, en unités de disposition, pour qu'ils
             gardent deux pixels vus une fois la couche grossie. Héritée par les tuiles, que le
             `:hover` de la feuille de style ne peut pas calculer lui-même. */
          ["--chaleur-trait" as string]: `${2 / zoom}px`,
        } as React.CSSProperties}>

      {/**
        * Les en-têtes de secteur, et l'encadré qui suit le survol.
        *
        * ⚠️ **Le secteur survolé se déduit de la tuile survolée, il ne s'écoute pas.** Les
        * tuiles sont des frères en positionnement absolu, pas les enfants d'une boîte de
        * secteur : il n'existe aucun élément à survoler qui *soit* le secteur, et un `:hover`
        * de CSS n'aurait rien à quoi s'accrocher. L'état `survole` porte déjà le titre pointé,
        * dont on lit le secteur — aucun écouteur de plus, aucun rendu de plus.
        *
        * ⚠️ **L'encadré ne prend pas la souris.** Il couvre tout le rectangle du secteur,
        * tuiles comprises : sans `pointerEvents: "none"`, il volerait le survol aux tuiles
        * qu'il entoure et la carte se figerait sur la première visée.
        */}
      {grouper && disposition?.children?.map((s: any) => {
        const l = s.x1 - s.x0, h = s.y1 - s.y0;
        const vise = survole?.secteur === s.data.secteur;
        return (
          <div key={`secteur-${s.data.secteur}`}>
            {vise && (
              <div style={{
                position: "absolute",
                left: s.x0, top: s.y0, width: l, height: h,
                border: `var(--chaleur-trait) solid var(--nv-accent)`,
                pointerEvents: "none", zIndex: 4,
              }} />
            )}
            {l >= 46 && h >= EN_TETE + 8 && (
              <div style={{
                position: "absolute",
                /**
                  * ⚠️ **La bande garde sa hauteur à l'écran, et se colle au-dessus des tuiles.**
                  * d3 réserve `EN_TETE` en unités de disposition, que la transformation
                  * multiplie : à ×8 la bande faisait **144 pixels**, et remplie d'accent au
                  * survol elle devenait un bloc bleu qui mangeait l'écran. Le libellé occupe
                  * donc `EN_TETE ⁄ zoom` — dix-huit pixels vus, quel que soit le cran — et se
                  * pose au **bas** de la réserve. Le vide restant se retrouve ainsi au-dessus,
                  * où il se lit comme l'écart entre deux secteurs plutôt que comme un trou entre
                  * un titre et ce qu'il titre.
                  */
                left: s.x0, top: s.y0 + EN_TETE - EN_TETE / zoom,
                width: l, height: EN_TETE / zoom,
                display: "flex", alignItems: "center", paddingLeft: 5 / zoom,
                /* Onze pixels vus, à tous les crans : la bande étant désormais de hauteur
                   constante, le libellé n'a plus de vide à remplir. */
                fontSize: 11 / zoom, fontWeight: 700, letterSpacing: "0.04em",
                textTransform: "uppercase",
                background: vise ? "var(--nv-accent)" : "transparent",
                color: vise ? "#FFFFFF" : "var(--nv-texte-secondaire)",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                pointerEvents: "none", zIndex: 5,
                transition: "background 120ms, color 120ms",
              }}>
                {s.data.secteur}
              </div>
            )}
          </div>
        );
      })}

      {/* Les titres. */}
      {tuiles}
        </div>
      </div>

      {/**
        * L'infobulle : le seul endroit où le nom complet et la capitalisation se lisent.
        *
        * ⚠️ **Elle est nécessaire, elle n'est pas un ornement.** Neuf tuiles sur dix sont trop
        * petites pour porter autre chose qu'un sigle ; sans elle, la moitié de la carte serait
        * illisible pour qui ne connaît pas les cinq cents sigles du S&P 500 par cœur.
        */}
      {survole && (
        <div ref={bulle} style={{
          position: "fixed", zIndex: 200, pointerEvents: "none",
          background: "var(--nv-carte)", color: "var(--nv-texte)",
          border: "1px solid var(--nv-bord-fort)", borderRadius: 10,
          padding: "9px 12px", minWidth: 180,
          boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
          display: "flex", flexDirection: "column", gap: 3,
        }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{survole.ticker}</span>
          <span style={{ fontSize: 11, color: "var(--nv-texte-secondaire)" }}>{survole.nom}</span>
          <span style={{ fontSize: 11, color: "var(--nv-texte-secondaire)" }}>{survole.secteur}</span>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline", marginTop: 2 }}>
            <span style={{
              fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums",
              color: survole.variation >= 0 ? "var(--nv-positif)" : "var(--nv-negatif)",
            }}>
              {survole.variation >= 0 ? "+" : "−"}{Math.abs(survole.variation).toFixed(2)} %
            </span>
            <span style={{ fontSize: 11, color: "var(--nv-texte-secondaire)", fontVariantNumeric: "tabular-nums" }}>
              {formaterCap(survole.capitalisation)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
