"use client";
import { recuperer } from "@/lib/requete";
import { useEffect, useRef, useState } from "react";
import AuthModal from "@/components/AuthModal";
import Header from "@/components/Header";
import ProfileModal from "@/components/ProfileModal";
import { API_URL } from "@/lib/api";
import { CLAIR } from "@/lib/palette";
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
  const fullTagline = "Find the optimal path.";
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
        * ⚠️ **Ancré à la fenêtre, pas au contenu — `fixed` et non `absolute`.** La racine de
        * cette page commence *après* le rail de navigation : elle démarre à 68 pixels et
        * rétrécit d'autant quand le menu s'ouvre. Un filigrane positionné par rapport à elle
        * se décalait donc à chaque ouverture, alors qu'une texture de fond n'a aucune raison
        * de bouger quand un panneau s'ouvre par-dessus. Signalé à l'usage.
        *
        * ⚠️ **Et cela règle le débordement du même coup.** Un élément `fixed` ne participe pas
        * à la zone défilable du document : il déborde de la fenêtre sans jamais y faire
        * apparaître de barre. En `absolute`, il ne devait sa discrétion qu'au `overflow:
        * hidden` de la racine — une protection qui tombe dès qu'un parent la lève.
        */}
      <div aria-hidden="true" className="fixed pointer-events-none" style={{
        right: "-16%", bottom: "-24%",
        width: "min(115vh, 1300px)", height: "min(115vh, 1300px)",
        zIndex: 0,
      }}>
        {/**
          * ⚠️ **Le filigrane interrompt la trame de points au lieu de se poser dessus.**
          * Demandé à l'usage. Un tracé teinté à 4 % laissait voir les pointillés au travers,
          * si bien que la forme se lisait comme un voile posé sur la texture — deux motifs
          * superposés au lieu d'un seul.
          *
          * ⚠️ **D'où le retour au masque CSS, et l'abandon du `<svg>`.** Pour couvrir les
          * points il faut une surface **opaque** ; pour rester invisible en tant que surface,
          * cette opacité doit être exactement le fond de la page. Un `fill` SVG ne sait pas
          * porter un dégradé calé sur la fenêtre — un fond CSS, si.
          *
          * ⚠️ **Deux couches de fond dans une seule propriété.** La première, la teinte du
          * filigrane, est un dégradé constant — la seule façon d'écrire un aplat parmi des
          * couches. La seconde reprend le dégradé du `body` en `background-attachment:
          * fixed` : il s'aligne donc au pixel sur celui de la page, à toute hauteur d'écran,
          * là où un aplat aurait fait une tache sur une forme aussi grande.
          */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: [
            /**
             * ⚠️ **La teinte est l'accent, pas du blanc — et c'est une question de direction,
             * pas d'intensité.** Le fond de page est un bleu nuit franc : `#101828`, dont le
             * bleu vaut deux fois et demie le rouge. Un blanc pur l'éclaircit également sur
             * les trois canaux — mesuré, +11, +10, +10 — donc il **désature** : le rapport
             * bleu/rouge tombait de 2,50 à 1,85 et la forme se lisait comme une tache délavée
             * plutôt que comme le fond éclairci.
             *
             * L'accent à six centièmes donne `rgb(20, 32, 53)`, soit un rapport de 2,65 :
             * dans la famille du fond, très légèrement plus froid. L'écart au fond garde la
             * même ampleur — la discrétion ne change pas, seule la direction devient juste.
             */
            "linear-gradient(rgba(var(--nv-accent-rvb), 0.06), rgba(var(--nv-accent-rvb), 0.06))",
            "var(--nv-fond-degrade)",
          ].join(", "),
          backgroundAttachment: "scroll, fixed",
          maskImage: "url(/logo-hivesync.svg)",
          WebkitMaskImage: "url(/logo-hivesync.svg)",
          maskSize: "contain", WebkitMaskSize: "contain",
          maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat",
          maskPosition: "center", WebkitMaskPosition: "center",
        }} />

        {/**
          * Le reflet qui parcourt les bords du filigrane.
          *
          * ⚠️ **Il sort du cadre et revient, parce que la forme elle-même en sort.** Le
          * filigrane déborde de l'angle bas-droit : un point qui suit son contour disparaît
          * donc hors écran sur une partie du trajet, puis reparaît de l'autre côté. C'est
          * l'effet demandé, et il ne demande aucun réglage — il découle du cadrage.
          *
          * ⚠️ **Un reflet par volute, chacun sur son chemin fermé.** Le dessin compte deux
          * sous-tracés ; un pointillé posé sur le tracé entier se déroule de l'un à l'autre
          * et se coupe à la jointure. Séparés, chacun fait le tour du sien sans fin.
          *
          * ⚠️ **L'épaisseur est en unités du dessin, sans `vector-effect`.** Voir
          * `.nv-reflet-logo` dans `globals.css` : figer le trait hors du repère entre en
          * conflit avec `pathLength`, et le motif cesse de boucler.
          */}
        <svg viewBox="0 0 1200 1200"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          {/**
            * ⚠️ **Un tracé par morceau, et jamais un tracé à deux sous-chemins.** SVG
            * réinitialise le motif de pointillés au début de chaque sous-tracé : réunir les
            * deux volutes dans un même `d` affiche donc **deux tirets simultanés**, quel que
            * soit le motif. C'est la raison — trouvée tard — pour laquelle la version
            * combinée montrait toujours deux reflets.
            *
            * ⚠️ **L'alternance vient du retard, pas de la géométrie.** Chaque volute porte le
            * même balayage de vingt-deux secondes, mais la seconde est décalée d'une
            * demi-période. Comme le motif laisse la volute éteinte la moitié du temps — voir
            * le vide de 1,88 dans `globals.css` —, l'une s'allume pendant que l'autre est
            * noire. Une seule lumière à l'écran, toujours.
            *
            * ⚠️ **La volute droite passe en premier**, puisque c'est par elle que le reflet
            * doit commencer ; celle de gauche prend le relais après son extinction.
            */}
          {[{ d: "M 985.00 878.91 C 967.83 876.88 940.52 868.54 911.00 856.31 C 892.19 848.52 847.20 826.38 826.00 814.48 C 767.78 781.80 670.81 718.29 553.00 635.69 C 499.88 598.45 489.89 590.34 478.64 575.35 C 455.73 544.83 453.63 515.03 473.90 508.15 C 482.05 505.39 487.48 506.45 518.81 516.94 C 589.84 540.72 620.45 543.80 637.42 528.86 C 657.32 511.35 659.79 480.08 644.97 433.50 C 616.22 343.12 522.58 204.50 418.02 97.52 C 386.12 64.88 381.58 57.85 381.53 41.00 C 381.50 30.02 383.14 25.82 389.80 19.80 C 394.86 15.22 399.68 13.68 407.39 14.17 C 415.31 14.68 420.39 17.33 437.91 30.08 C 525.36 93.72 611.10 170.06 695.04 259.00 C 823.48 395.10 898.51 486.68 950.81 571.19 C 1002.77 655.15 1035.98 730.97 1045.65 787.70 C 1048.05 801.75 1048.05 826.08 1045.67 836.50 C 1043.47 846.08 1037.50 858.94 1032.60 864.63 C 1022.71 876.13 1005.38 881.33 985.00 878.91 Z", relais: false },
            { d: "M 631.70 983.90 C 621.77 981.57 606.05 970.81 567.50 939.99 C 503.29 888.64 450.19 840.33 379.98 769.38 C 283.75 672.13 199.68 570.54 122.29 458.00 C 91.20 412.78 69.57 376.90 51.47 340.50 C 5.86 248.76 -7.36 183.84 11.70 145.18 C 25.39 117.40 55.39 110.88 101.46 125.67 C 145.45 139.79 208.35 172.07 281.00 217.81 C 334.14 251.26 370.18 275.89 514.50 377.36 C 560.15 409.45 572.49 421.18 582.99 442.50 C 588.54 453.76 589.94 458.78 589.98 467.60 C 590.02 477.94 586.75 484.49 579.67 488.27 C 576.24 490.10 573.99 490.47 567.00 490.39 C 559.07 490.30 556.69 489.68 531.50 481.22 C 486.29 466.03 460.56 460.51 438.16 461.19 C 426.90 461.53 424.89 461.87 419.96 464.26 C 405.25 471.40 396.76 487.17 395.34 510.00 C 392.00 563.74 443.79 668.87 527.38 778.00 C 540.31 794.88 578.12 841.98 594.42 861.50 C 602.68 871.40 619.81 890.08 632.48 903.00 C 657.95 928.98 661.70 934.24 664.59 948.09 C 669.34 970.90 652.83 988.88 631.70 983.90 Z", relais: true }].map((volute, i) => (
            <path key={i} d={volute.d} transform="matrix(1.112183 0 0 1.112093 600 600) translate(-525.5, -499)"
              className={`nv-reflet-logo${volute.relais ? " nv-reflet-logo--relais" : ""}`}
              pathLength={1}
              /**
               * ⚠️ **Le reflet suit la teinte du filigrane, et l'opacité a été recalculée
               * pour cela.** Il était en encre neutre à 0,085 ; sur un filigrane désormais
               * bleuté, du blanc l'aurait désaturé exactement comme il désaturait le fond —
               * rapport bleu/rouge tombant à 1,75, soit une traînée grise sur une forme
               * bleue.
               *
               * ⚠️ **Passer à l'accent oblige à monter l'opacité, sans que rien ne s'éclaire
               * davantage.** L'accent est moins lumineux que le blanc : à valeur égale il
               * éclaire moins. Calculé sur la luminance relative, 0,16 d'accent rend le même
               * gain de clarté que 0,085 de blanc — 19,3 contre 19,0 — pour un rapport
               * bleu/rouge de 2,88 au lieu de 1,75. Même discrétion, autre direction.
               *
               * ⚠️ **Puis ramené de 0,16 à 0,08 : le gain de clarté passe de 19,3 à 9,6.**
               * L'accord de teinte était juste, l'intensité non — signalé à l'usage comme
               * trop voyant. Un reflet sur un filigrane doit se deviner, pas se lire ; à la
               * moitié de sa clarté il attire encore l'œil qui passe sans retenir celui qui
               * lit.
               */
              fill="none" stroke="rgba(var(--nv-accent-rvb), 0.08)" strokeWidth={2.4}
              strokeLinejoin="round" strokeLinecap="round" />
          ))}
        </svg>
      </div>

      {/**
        * ⚠️ **Le texte descend pour laisser voir le logo.** Centré comme lui, il se posait
        * pile dessus : la forme passait derrière les mots et l'on n'en lisait plus rien.
        * Signalé à l'usage. Le logo garde le milieu — c'est sa place quand il fait partie du
        * décor — et le bloc de texte s'installe dans le tiers bas, sous lui.
        */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center"
        style={{ gap: "0px" }}>

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
          {/* ⚠️ **Cinquante-deux plutôt que trente-six.** Le mot est seul au centre d'un écran
              vide, avec un filigrane large derrière lui : à 36 il flottait sans tenir la page.
              L'interlettrage reste à 0,35 em — il se calcule sur la taille, donc l'espacement
              suit l'agrandissement sans qu'on y touche. */}
          <h1 style={{ color: text, fontSize: "52px", fontWeight: 700, letterSpacing: "0.35em", transition: "color 0.4s ease", margin: 0, marginRight: "-0.35em" }}>
            NOVAC
          </h1>
          <p style={{ color: text, opacity: 0.7, fontSize: "12px", fontWeight: 300, letterSpacing: "0.22em", marginTop: "10px", marginRight: "-0.22em", transition: "color 0.4s ease" }}>
            {fullTagline}
          </p>
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
