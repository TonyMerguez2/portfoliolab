"use client";
import { recuperer } from "@/lib/requete";
import { useRouter } from "next/navigation";
import { FONT } from "@/lib/typography";
import { useEffect, useRef, useState } from "react";
import AuthModal from "@/components/AuthModal";
import Header from "@/components/Header";
import { API_URL } from "@/lib/api";
import { enTetesAuth } from "@/lib/session";
import { CLAIR, RAYONS } from "@/lib/palette";

/**
 * La phrase d'accueil.
 *
 * ⚠️ **Elle nomme ce que le produit fait, pas ce qu'il est.** « Find the optimal path »
 * disait une intention sans dire un service ; celle-ci reprend les mots de la page
 * publique, pour que les deux entrées du site promettent la même chose.
 */
/**
 * ⚠️ **L'espace final n'est pas une coquille.** Le `<br />` qui suit colle les deux morceaux
 * dans le texte du nœud : sans lui, un lecteur d'écran prononce « patrimoine,et ». Il ne se
 * voit pas à l'écran — une espace en fin de ligne est absorbée par la mise en page.
 */
const PHRASE_HAUT = "Tout votre patrimoine, ";
const PHRASE_BAS = "et ce qui le fait ";
/**
 * ⚠️ **Les cinq verbes ne disent pas la même chose, et c'est voulu.** « Évoluer » et
 * « changer » décrivent, « performer » et « grandir » promettent, « résister » rassure. La
 * phrase change donc de registre au fil du cycle. Choisis à la demande, après que j'aie
 * signalé qu'un verbe de gain se lit comme une promesse de rendement sur un produit qui écrit
 * en pied de page ne donner aucun conseil en investissement.
 */
const VERBES = ["évoluer", "performer", "résister", "grandir", "changer"];
import PiluleAction from "@/components/portfolio/PiluleAction";
import PanneauCreation from "@/components/portfolio/PanneauCreation";
import MotQuiDefile from "@/components/MotQuiDefile";
export default function Home() {
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const [dark, setDark] = useState(true);
  const darkRef = useRef(dark);
  /** Le panneau de création est-il ouvert ? */
  const [creation, setCreation] = useState(false);
  const [user, setUser] = useState<any>(null);
  /**
   * Les portefeuilles du compte, pour savoir quoi proposer.
   *
   * ⚠️ **`null` n'est pas « aucun » : c'est « on ne sait pas encore ».** La distinction décide
   * du libellé du bouton. Avec un simple tableau vide au départ, l'accueil d'un habitué
   * affichait « Créer un portefeuille » pendant la seconde de chargement, puis basculait sur
   * « Ouvrir » — un clignotement à chaque visite, et le risque de cliquer sur la mauvaise
   * action. Tant que la réponse n'est pas là, le bouton garde le libellé neutre et n'ouvre
   * rien de contradictoire.
   */
  const [portefeuilles, setPortefeuilles] = useState<any[] | null>(null);
  const aDesPortefeuilles = (portefeuilles?.length ?? 0) > 0;
  const router = useRouter();
  const [showAuth, setShowAuth] = useState(false);
  /**
   * ⚠️ **La demande de création survit à la connexion.** Le contrôle de session vivait au
   * *dernier* clic du panneau : on composait un avatar, on déclarait un compte, on saisissait
   * une opération, et l'on obtenait « Connectez-vous pour créer un portefeuille » — un mur,
   * sans lien pour s'y connecter, après quatre écrans de saisie. Relevé en parcourant le
   * panneau de bout en bout, hors session.
   *
   * ⚠️ **Rediriger vers la connexion ne suffisait pas : il fallait ne rien perdre.** Ouvrir la
   * fenêtre d'authentification puis rendre la main à l'accueil aurait obligé à recliquer sur
   * le bouton, c'est-à-dire à faire deux fois le même geste. Ce drapeau retient l'intention le
   * temps de la connexion et ouvre le panneau dans la foulée.
   */
  const [creerApresConnexion, setCreerApresConnexion] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showTools, setShowTools] = useState(false);
  const [tickerData, setTickerData] = useState<{symbol: string, price: number, change: number}[]>([]);
  const tickerRef = useRef<HTMLDivElement>(null);
  const tickerPosRef = useRef(0);
  useEffect(() => {
    const u = localStorage.getItem("novac_user");
    if (u) setUser(JSON.parse(u));
  }, []);

  /**
   * ⚠️ **Interrogé même sans session connue.** Le compte est lu dans le stockage local, qui
   * peut être vide alors qu'un jeton valide existe encore — la requête tranche, pas la
   * supposition. Sans jeton, l'API répond une liste vide et le bouton reste sur la création.
   */
  useEffect(() => {
    recuperer(`${API_URL}/api/v1/portfolios`, { headers: enTetesAuth() })
      .then(r => r.json())
      .then(d => setPortefeuilles(Array.isArray(d) ? d : []))
      .catch(() => setPortefeuilles([]));
  }, [user]);
  const targetMouse = useRef({ x: 0, y: 0 });
  const smoothMouse = useRef({ x: 0, y: 0 });
  const haloRef = useRef(0);

  useEffect(() => { darkRef.current = dark; }, [dark]);

  useEffect(() => {
    if (!tickerRef.current || tickerData.length === 0) return;
    let raf: number;
    const el = tickerRef.current;
    const speed = 0.5;
    // Mesurer après rendu complet
    const timeout = setTimeout(() => {
      const singleWidth = el.scrollWidth / 2;
      const animate = () => {
        tickerPosRef.current -= speed;
        if (tickerPosRef.current <= -singleWidth) {
          tickerPosRef.current += singleWidth;
        }
        el.style.transform = `translateX(${Math.round(tickerPosRef.current)}px)`;
        raf = requestAnimationFrame(animate);
      };
      raf = requestAnimationFrame(animate);
    }, 200);
    return () => { cancelAnimationFrame(raf); clearTimeout(timeout); };
  }, [tickerData]);

  useEffect(() => {
    const fetch_prices = async () => {
      try {
        const res = await recuperer(`${API_URL}/ticker`);
        const data = await res.json();
        if (Array.isArray(data)) setTickerData(data);
      } catch {}
    };
    fetch_prices();
    const iv = setInterval(fetch_prices, 30000);
    return () => clearInterval(iv);
  }, []);


  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light") setDark(false);
    else setDark(true);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  /**
   * ⚠️ **L'écran d'accueil ne défile pas, et on le lui interdit plutôt que de l'espérer.**
   * Il tient dans la fenêtre par construction : il n'y a rien en dessous ni à droite vers
   * quoi défiler. Mesuré chez moi à 696, 1512 et 1960 pixels de large, le document ne
   * débordait d'aucun côté — et pourtant des barres apparaissaient à l'usage. Plutôt que de
   * chercher quel descendant dépasse de un pixel selon la plateforme, on énonce la règle :
   * cette page-ci est fixe.
   *
   * ⚠️ **La restitution au démontage n'est pas une politesse, elle est obligatoire.** Sans
   * elle, quitter l'accueil laisserait `overflow: hidden` sur le document entier, et toutes
   * les autres pages de l'application deviendraient impossibles à faire défiler.
   */
  useEffect(() => {
    const de = document.documentElement, corps = document.body;
    const avant = { de: de.style.overflow, corps: corps.style.overflow };
    /**
     * ⚠️ **Remettre à zéro avant de verrouiller, sinon on fige un décalage.** `overflow:
     * hidden` empêche de défiler, mais n'annule pas la position déjà atteinte : en arrivant
     * sur l'accueil depuis une page défilée, ou après un rechargement qui restaure la
     * position, l'écran restait décalé et **le verrou interdisait de revenir**. Le rail de
     * navigation se retrouvait coupé sur son bord gauche, sans moyen de le ramener.
     */
    de.scrollTop = corps.scrollTop = 0;
    de.scrollLeft = corps.scrollLeft = 0;
    window.scrollTo(0, 0);
    de.style.overflow = "hidden";
    corps.style.overflow = "hidden";
    return () => { de.style.overflow = avant.de; corps.style.overflow = avant.corps; };
  }, []);












  /* ⚠️ `bg` est parti avec les couches de fond : la page laisse voir celui de
     l'application. `text` reste — il teinte le logo, qui est un masque. */
  const text = dark ? "#F8F9FC" : "#0B1A33";
  const btnBg = dark ? "#F8F9FC" : "#041124";
  const btnText = dark ? "#041124" : "#F8F9FC";


  return (
    /**
      * ⚠️ **La landing ne peint plus son propre fond.** Elle posait un aplat opaque —
      * `#041124` en sombre — puis deux dégradés radiaux par-dessus : trois couches qui
      * recouvraient entièrement le fond de l'application, si bien que l'écran d'accueil et
      * le reste du produit n'avaient visiblement rien en commun. Demandé à l'usage d'avoir
      * le même fond que le tableau de bord.
      *
      * ⚠️ **Il n'y a donc rien à ajouter : il suffisait de retirer.** Le dégradé
      * `--nv-fond-degrade` est porté par le `body`, et la trame de points qui s'éclaire sous
      * le curseur par `PointsFond`, monté dans la mise en page racine. Les deux étaient déjà
      * là, dessous, cachés.
      *
      * ⚠️ **Le canevas reste.** Ce n'est pas un fond mais l'illustration du propos — les
      * chemins qui convergent, dont l'un est optimal, sous le mot « Find the optimal path ».
      * Il s'efface de lui-même (`clearRect`), donc il laisse voir ce qui est derrière.
      *
      * ⚠️ **Le fondu de sortie est parti avec la navigation qu'il accompagnait.** La page
      * s'effaçait une demi-seconde avant de partir vers `/build` ; elle ne part plus, le
      * panneau de création s'ouvrant par-dessus. Ce qui restait — un état `exiting` jamais
      * mis à vrai, un `convergingRef` jamais relu, un `handleStart` que plus rien n'appelait
      * depuis que le bouton naviguait lui-même — ne faisait plus que décrire une intention
      * disparue.
      */
    <div className="fixed inset-0 overflow-hidden">
      {/**
        * La silhouette du logo, dessinée par la trame de points.
        *
        * ⚠️ **Elle remplace le filigrane, qui est supprimé.** Le filigrane était un aplat
        * masqué par le dessin : il éclaircissait le fond en forme de logo. Les deux ensemble
        * faisaient deux logos décalés — l'un clair, l'autre piqueté — sans que rien ne
        * l'explique. Le reflet animé qui parcourait son contour part avec lui : il n'avait de
        * sens que sur un bord plein, et il n'y a plus de bord.
        *
        * ⚠️ **Ce ne sont pas des points ajoutés : ce sont les mêmes, rendus plus présents.**
        * La couche reprend exactement le motif de `.nv-points` — même rayon, même pas de
        * 14 px — dans une encre plus soutenue, et le logo lui sert de masque. Une seconde
        * trame décalée d'un demi-pixel aurait moiré contre la première.
        *
        * ⚠️ **Le pas est ancré sur le coin de l'écran, comme la trame du fond.** `.nv-points`
        * est en `position: fixed` et son motif part de l'origine du cadre. Cette couche est
        * donc `fixed` elle aussi, à la taille de l'écran, et c'est le **masque** qu'on place
        * et qu'on dimensionne — pas la boîte. Dimensionner la boîte aurait décalé la grille
        * de points, et la silhouette se serait lue comme une seconde trame plutôt que comme
        * la même, renforcée.
        */}
      <div aria-hidden="true" className="fixed pointer-events-none nv-silhouette"
        style={{ inset: 0, zIndex: 0 }} />


      {/**
        * ⚠️ **Le texte descend pour laisser voir le logo.** Centré comme lui, il se posait
        * pile dessus : la forme passait derrière les mots et l'on n'en lisait plus rien.
        * Signalé à l'usage. Le logo garde le milieu — c'est sa place quand il fait partie du
        * décor — et le bloc de texte s'installe dans le tiers bas, sous lui.
        */}
      {/**
        * ⚠️ **La colonne se centre dans l'espace libre, pas dans la fenêtre.** Le rail est
        * posé par-dessus, large de 68 px : un contenu centré sur la fenêtre entière lui passe
        * dessous. Invisible tant que le centre ne portait qu'un mot étroit ; avec une phrase,
        * sur un écran de 390 px, la moitié gauche disparaissait derrière le rail et la droite
        * sortait de l'écran. La marge latérale rend les 24 px de respiration que le texte
        * n'avait plus.
        */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center"
        style={{ gap: "0px", paddingLeft: `${68 + 24}px`, paddingRight: "24px" }}>

        {/**
          * ⚠️ **Plus d'attente avant l'affichage : la mise en scène n'a plus d'objet.** Une
          * machine à trois états — `assembling`, `assembled`, `ready` — retenait ce bloc une
          * seconde et demie, le temps que le logo s'assemble en quatre quartiers convergents.
          * Cet assemblage a été retiré il y a longtemps ; l'attente, elle, est restée. L'écran
          * demeurait donc vide pour mettre en scène un événement supprimé.
          *
          * ⚠️ **Et l'enveloppe double disparaît avec.** Deux `<div>` imbriqués ne portaient
          * que deux opacités liées à ces états : sans eux, il n'y a qu'un titre et sa
          * baseline.
          */}
        {/**
          * ⚠️ **Le bloc est centré, ses deux lignes ne l'étaient pas.** La colonne centre ses
          * enfants, mais ce bloc-ci se dimensionne sur le plus large des deux — le titre, 278
          * pixels — et la baseline, longue de 179, restait alignée à gauche dedans : son encre
          * se retrouvait **cinquante pixels à gauche** du centre de la page. Relevé à l'usage.
          *
          * ⚠️ **Et l'interlettrage se paie en marge négative.** `letter-spacing` pose son
          * espace *après chaque lettre, la dernière comprise* : la boîte du titre traîne 18,2
          * pixels de vide à droite, si bien qu'un centrage de la boîte décale l'encre de la
          * moitié — neuf pixels — vers la gauche. Une marge droite égale à l'espacement
          * retranche ce vide de la boîte sans toucher au dessin, et le centre géométrique
          * redevient le centre visible. Chaque ligne annule le sien, d'où deux valeurs.
          */}
        <div style={{ textAlign: "center" }}>
          {/**
            * ⚠️ **Une phrase, à la place de la marque.** Le centre portait « Novac » en très
            * gros : le nom du produit annoncé à des gens déjà entrés — cette page est
            * derrière la porte à code — et souvent connectés, que la page salue par leur
            * prénom deux lignes plus bas. L'enseigne dit maintenant qui l'on est depuis le
            * coin haut gauche, et le centre dit ce que l'on fait.
            *
            * ⚠️ **La baseline anglaise part avec.** « Find the optimal path. » était la seule
            * ligne anglaise d'un produit entièrement français, et elle ne nommait aucune des
            * choses que Novac sait faire. Deux phrases superposées se seraient concurrencées.
            *
            * ⚠️ **Le corps se règle sur la largeur, pas sur une valeur fixe.** À 60 px sur un
            * portable, la phrase tiendrait sur quatre lignes et ne serait plus une phrase
            * mais un paragraphe. `clamp` la laisse respirer sur grand écran sans casser le
            * petit.
            */}
          {/**
            * ⚠️ **Le titre porte un nom stable, et c'est indispensable ici.** Son texte change
            * toutes les deux secondes : sans `aria-label`, la phrase entendue dépend du verbe
            * qui passait à cet instant, et rien n'annonce les suivants. Le nom fixe donne la
            * phrase entière avec le premier verbe ; la rotation reste un effet visuel, ce
            * qu'elle est.
            */}
          <h1 aria-label={`${PHRASE_HAUT}${PHRASE_BAS}${VERBES[0]}.`} style={{
            /**
             * ⚠️ **`margin: 0 auto` centre la boîte ; `textAlign` ne centre que l'encre
             * dedans.** Sans lui, le titre bridé à 16 caractères se colle à gauche de son
             * enveloppe, qui occupe elle toute la colonne : la phrase partait vers la
             * gauche pendant que la salutation et le bouton restaient au milieu.
             */
            /**
             * ⚠️ **La largeur ne dépend plus des verbes.** Elle a valu 17 puis 18 ch le temps
             * que le verbe partage une ligne avec la phrase : il fallait alors que la boîte
             * contienne la plus longue des cinq versions, faute de quoi « performer » ajoutait
             * une ligne à lui seul. Le verbe ayant sa ligne, seule la phrase fixe dicte la
             * mesure, et 16 ch lui suffisent.
             */
            color: text, margin: "0 auto", maxWidth: "min(16ch, 100%)",
            fontSize: "clamp(28px, 4.6vw, 60px)", fontWeight: 700,
            letterSpacing: "-0.03em", lineHeight: 1.08,
            transition: "color 0.4s ease",
          }}>
            {/**
              * ⚠️ **La coupure est posée, pas laissée au hasard de la largeur.** À 17 ch le
              * navigateur cassait après « et », qui restait seul en bout de première ligne. La
              * virgule est la seule coupure que la phrase porte naturellement.
              */}
            {PHRASE_HAUT}<br />{PHRASE_BAS}<MotQuiDefile mots={VERBES} suffixe="." />
          </h1>
        </div>

        {/**
          * ⚠️ **La salutation est partie, et l'avatar avec.** « Bonsoir, Sacha » nommait la
          * personne juste sous une phrase qui promet un service : deux registres à trois
          * centimètres l'un de l'autre. Le bouton de profil et le « Se connecter » qui
          * l'accompagnaient ne sont pas perdus pour autant — **le rail porte les deux**, il
          * monte lui-même `ProfileModal` et `AuthModal`. Ils étaient en double.
          */}
        <div style={{ height: "26px" }}/>


        {/* Bouton */}
        <div style={{
          transition: "opacity 0.7s ease 0.45s, transform 0.7s ease 0.45s",
        }}>
          {/**
            * ⚠️ **Le dernier bouton d'action qui parlait encore son propre dialecte.** Il a
            * posé `rgba(255,255,255,0.09)` de fond et `rgba(255,255,255,0.18)` de bord — du
            * blanc en dur, donc juste en thème sombre et faux en clair —, puis la géométrie
            * des formulaires : rayon de saisie, `+` écrit au clavier, interlettrage, et un
            * survol qui soulevait le bouton d'un pixel au lieu de l'éclairer.
            *
            * ⚠️ **C'est la pilule d'ajout, sans rien de plus.** Même geste — « créer une
            * chose » — donc même bouton, à l'identique : le signe `+` dessiné, le rayon plein,
            * le liseré, l'ombre qui s'ouvre au survol, et les 26 pixels de haut. Il a eu une
            * version agrandie, au motif qu'une action seule au milieu d'un écran vide demande
            * plus de présence ; essayée à 46 puis à 38, puis abandonnée à l'usage. Ce qui
            * porte cette page, c'est le nom et le filigrane — le bouton n'a qu'à être le
            * bouton. C'était la quatrième copie ; les trois autres avaient déjà divergé.
            *
            * ⚠️ **L'angle du liseré reste au défaut, et il fallait le vérifier.** Il suit les
            * proportions : 180° − atan(26 / 155) = 170,5°, à un demi-degré des 171° du
            * composant. « Ajouter un compte » déclare 170 parce qu'il est plus court — 141 de
            * large — et tombe donc à 169,6. Ici rien à redire.
            */}
          {/**
            * ⚠️ **L'accueil proposait de créer un portefeuille à qui en avait déjà six.** Le
            * libellé était fixe : un habitué, connecté, avatar affiché dans le rail, arrivait
            * sur une page dont la seule action ignorait tout ce qu'il possédait — il devait
            * passer par le rail pour retrouver ce qu'il venait voir. L'action principale est
            * maintenant celle qu'il attend, et la création passe au second rang sans
            * disparaître.
            */}
          {aDesPortefeuilles ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
              <PiluleAction
                libelle="Ouvrir mon portefeuille"
                onClick={() => router.push("/portfolio")}
                fond={CLAIR.accent} fondSurvol={CLAIR.accentFort}/>
              {/**
                * ⚠️ **Un lien et non une seconde pilule.** Deux pilules côte à côte se
                * disputent le regard et rien ne dit laquelle est la principale ; en dessous et
                * en texte, la création reste atteignable sans prétendre au même rang.
                */}
              <button onClick={() => setCreation(true)}
                style={{
                  background: "transparent", border: "none", cursor: "pointer", padding: 0,
                  color: text, opacity: 0.5, fontSize: "13px", fontFamily: FONT,
                  textDecoration: "underline", textUnderlineOffset: "3px",
                  transition: "opacity 0.2s",
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = "0.8")}
                onMouseLeave={e => (e.currentTarget.style.opacity = "0.5")}>
                Créer un autre portefeuille
              </button>
            </div>
          ) : (
            <PiluleAction
              libelle="Créer un portefeuille"
              onClick={() => {
                if (user) { setCreation(true); return; }
                setCreerApresConnexion(true);
                setShowAuth(true);
              }}
              fond={CLAIR.accent} fondSurvol={CLAIR.accentFort}/>
          )}
        </div>

      </div>

            {/**
        * ⚠️ **La création se fait ici, sans quitter l'écran.** Le bouton menait à `/build`,
        * qui demandait d'abord d'où venaient les positions, faisait composer une allocation,
        * et ne demandait le nom qu'à la fin — dans une fenêtre appelée « Sauvegarder ».
        * Nommer la chose en dernier, c'est la construire avant de savoir ce qu'on construit.
        * `/build` reste ce qu'il fait bien : composer une allocation cible. Ce panneau est
        * l'autre chemin, le court.
        */}
      {creation && <PanneauCreation onFermer={() => setCreation(false)}/>}

      {showAuth && <AuthModal dark={dark}
        /* ⚠️ Abandonner la connexion abandonne aussi l'intention : sans cela, se connecter
           plus tard par le lien du bas rouvrirait le panneau de création sans qu'on l'ait
           demandé. */
        onClose={() => { setShowAuth(false); setCreerApresConnexion(false); }}
        onAuth={(u: any) => {
          setUser(u);
          if (creerApresConnexion) { setCreerApresConnexion(false); setCreation(true); }
        }}/>}
    </div>
  );
}
