"use client";
import { recuperer } from "@/lib/requete";
import { useEffect, useRef, useState } from "react";
import AuthModal from "@/components/AuthModal";
import Header from "@/components/Header";
import ProfileModal from "@/components/ProfileModal";
import { API_URL } from "@/lib/api";
import { CLAIR, RAYONS } from "@/lib/palette";
import { VERSION } from "@/lib/version";

/**
 * La phrase d'accueil.
 *
 * ⚠️ **Elle nomme ce que le produit fait, pas ce qu'il est.** « Find the optimal path »
 * disait une intention sans dire un service ; celle-ci reprend les mots de la page
 * publique, pour que les deux entrées du site promettent la même chose.
 */
const PHRASE = "Tout votre patrimoine, et ce qui le fait bouger.";
import PiluleAction from "@/components/portfolio/PiluleAction";
import PanneauCreation from "@/components/portfolio/PanneauCreation";
export default function Home() {
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const [dark, setDark] = useState(true);
  const darkRef = useRef(dark);
  /** Le panneau de création est-il ouvert ? */
  const [creation, setCreation] = useState(false);
  const [user, setUser] = useState<any>(null);
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
  const [showProfile, setShowProfile] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showTools, setShowTools] = useState(false);
  const [tickerData, setTickerData] = useState<{symbol: string, price: number, change: number}[]>([]);
  const tickerRef = useRef<HTMLDivElement>(null);
  const tickerPosRef = useRef(0);
  useEffect(() => {
    const u = localStorage.getItem("novac_user");
    if (u) setUser(JSON.parse(u));
  }, []);
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












  const getGreeting = () => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return "Bonjour";
    if (h >= 12 && h < 18) return "Bon après-midi";
    return "Bonsoir";
  };

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
        * ⚠️ **`!important` n'est pas une facilité, c'est une nécessité ici.** L'enseigne porte
        * son `display: flex` en style *en ligne*, et un style en ligne l'emporte sur n'importe
        * quelle règle de feuille — la classe seule ne masquait rien, et l'enseigne continuait
        * de s'afficher derrière la barre de recherche sur téléphone.
        */}
      <style>{`@media (max-width: 767px) { .nv-enseigne { display: none !important; } }`}</style>


      {/**
        * Le logo en filigrane.
        *
        * ⚠️ **Il ne cherche plus à être lu, et c'est le changement de fond.** Les versions
        * précédentes le voulaient gravé dans la page : corps couleur du fond, bord marqué,
        * éclats qui parcouraient son contour. Tout cela visait à le rendre presque invisible
        * — ce qui est contradictoire pour une marque, dont le rôle sur un écran d'accueil est
        * de dire qui l'on est. Le traitement était bon, la place était fausse.
        *
        * ⚠️ **Un filigrane, donc : très grand, très faible, débordant d'un angle.** Il devient
        * une texture de fond et non un objet. Le débord est ce qui l'empêche de redevenir un
        * objet : une forme entière, posée au milieu, se lit toujours comme quelque chose qu'on
        * montre ; coupée par le bord de l'écran, elle se lit comme de la matière.
        *
        * ⚠️ **En bas à droite, à l'opposé du rail de navigation.** À gauche il aurait chevauché
        * la barre latérale, dont le fond opaque l'aurait tranché net — un débord franc d'un
        * côté, une coupure nette de l'autre.
        *
        * ⚠️ **Ni filtre, ni contour, ni animation.** Un filigrane est plat par définition :
        * l'ombre interne servait à creuser, le liseré à faire vivre, et ni l'un ni l'autre
        * n'a de sens sur une texture. Le `.nv-lisere-courant` de `globals.css` disparaît avec.
        */}
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
        * L'enseigne : le logo, le nom, la version.
        *
        * ⚠️ **Elle se décale de la largeur du rail, pas d'une marge choisie à l'œil.** Le rail
        * est fixe et large de 68 px (`LARGEUR`, dans `SideNav`) ; poser l'enseigne à 24 px du
        * bord la ferait passer dessous. La valeur est donc la somme des deux, et elle suivra
        * si le rail change.
        *
        * ⚠️ **Le nom n'est plus en gras.** En 800 au centre, il était le seul objet de la
        * page et devait en porter le poids. Dans un coin, à 22 px, la même graisse crierait
        * par-dessus la phrase qui est maintenant le sujet.
        *
        * ⚠️ **Sous 768 px, elle s'efface** : la barre de recherche y prend toute la largeur du
        * haut et lui passe dessus. Rien n'est perdu — le rail porte le logo à trois centimètres
        * de là, et c'est justement pourquoi le centre de la page ne le porte plus.
        */}
      <div className="nv-enseigne" style={{
        position: "absolute", top: "26px", left: `${68 + 26}px`, zIndex: 10,
        display: "flex", alignItems: "center", gap: "10px",
      }}>
        <span aria-hidden="true" style={{
          width: "30px", height: "30px", flexShrink: 0, display: "block",
          background: text, transition: "background 0.4s ease",
          maskImage: "url(/logo-hivesync.svg)", WebkitMaskImage: "url(/logo-hivesync.svg)",
          maskSize: "contain", WebkitMaskSize: "contain",
          maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat",
          maskPosition: "center", WebkitMaskPosition: "center",
        }} />
        <span style={{
          color: text, fontSize: "22px", fontWeight: 500, letterSpacing: "-0.01em",
          transition: "color 0.4s ease",
        }}>
          Novac
        </span>
        {/**
          * ⚠️ **La pastille se pose sur la couleur du texte, pas sur une teinte fixe.** Elle
          * doit suivre le thème comme le reste du bloc ; un gris figé virerait au noir sur
          * fond clair. Son fond et son bord sont donc le texte à faible opacité.
          */}
        <span style={{
          marginLeft: "4px", padding: "5px 11px", borderRadius: RAYONS.plein,
          border: `1px solid ${text}22`, background: `${text}0D`,
          color: text, opacity: 0.68, fontSize: "12px", fontWeight: 500,
          whiteSpace: "nowrap", transition: "color 0.4s ease, border-color 0.4s ease",
        }}>
          {VERSION}
        </span>
      </div>

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
          <h1 style={{
            /**
             * ⚠️ **`margin: 0 auto` centre la boîte ; `textAlign` ne centre que l'encre
             * dedans.** Sans lui, le titre bridé à 16 caractères se colle à gauche de son
             * enveloppe, qui occupe elle toute la colonne : la phrase partait vers la
             * gauche pendant que la salutation et le bouton restaient au milieu.
             */
            color: text, margin: "0 auto", maxWidth: "min(16ch, 100%)",
            fontSize: "clamp(32px, 4.6vw, 60px)", fontWeight: 700,
            letterSpacing: "-0.03em", lineHeight: 1.08,
            transition: "color 0.4s ease",
          }}>
            {PHRASE}
          </h1>
        </div>

        <div style={{ height: "32px" }}/>

        {/* Bonsoir + avatar */}
        <div style={{
          display: "flex", alignItems: "center", gap: "10px",
        }}>
          <p style={{ color: text, fontSize: "14px", fontWeight: 300, letterSpacing: "0.15em", opacity: 0.45, transition: "color 0.4s ease" }}>
            {getGreeting()}{user ? `, ${user.username}` : ""}
          </p>
          {user && (
            <button onClick={() => setShowProfile(true)}
              className="w-8 h-8 flex items-center justify-center rounded-full overflow-hidden shrink-0"
              style={{
                border: dark ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(4,17,36,0.14)",
                backgroundColor: dark ? "rgba(255,255,255,0.07)" : "rgba(4,17,36,0.05)",
                cursor: "pointer",
              }}>
              {user?.avatar_url
                ? <img src={user.avatar_url.startsWith("/uploads") ? `${API_URL}${user.avatar_url}` : user.avatar_url} className="w-full h-full object-cover"/>
                : <span style={{ fontSize: "11px", fontWeight: 700, color: text, opacity: 0.7 }}>{user.username?.charAt(0).toUpperCase()}</span>
              }
            </button>
          )}
          {!user && (
            <button onClick={() => setShowAuth(true)}
              style={{
                fontSize: "10px", letterSpacing: "0.1em", color: text, opacity: 0.25,
                background: "transparent", border: "none", cursor: "pointer", padding: 0,
                transition: "opacity 0.2s",
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.55")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "0.25")}>
              Se connecter →
            </button>
          )}
        </div>

        <div style={{ height: "24px" }}/>

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
          <PiluleAction
            libelle="Créer un portefeuille"
            onClick={() => {
              if (user) { setCreation(true); return; }
              setCreerApresConnexion(true);
              setShowAuth(true);
            }}
            fond={CLAIR.accent} fondSurvol={CLAIR.accentFort}/>
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
      {showProfile && user && <ProfileModal dark={dark} user={user} onClose={() => setShowProfile(false)} onUpdate={(u: any) => setUser(u)}/>}
    </div>
  );
}
