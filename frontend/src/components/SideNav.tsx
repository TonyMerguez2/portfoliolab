"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/lib/AppContext";
import ProfileModal from "@/components/ProfileModal";
import AuthModal from "@/components/AuthModal";
import { basculerMode, useModeTheme } from "@/lib/theme";
import { API_URL } from "@/lib/api";
import { RAYONS } from "@/lib/palette";

/**
 * Navigation principale, en rail sorti du bord gauche.
 *
 * ⚠️ **Le rail ne flotte pas, il sort du bord — et c'est toute la différence.** Une barre
 * posée à quelques pixels du bord est un panneau de plus, qui se lit comme un objet
 * étranger tombé sur la page. Ici une épine court sur toute la hauteur contre le bord, et le
 * rail en est un renflement : les deux raccords concaves, en haut et en bas, disent que
 * c'est la même matière. Repris d'une référence montrée à l'usage.
 *
 * ⚠️ **Sans l'épine, les raccords ne raccordent rien.** Ils ont besoin d'une matière à
 * rejoindre : sur la référence c'est le cadre noir de l'écran, qui court d'un bout à l'autre
 * et dont la barre n'est qu'un élargissement. Le premier essai posait les raccords sur un
 * rail isolé — ils se terminaient dans le vide, comme deux crochets.
 *
 * ⚠️ **La largeur totale ne bouge plus, et c'est ce qui rend le changement gratuit.** Le
 * repli publiait tour à tour 232 et 68 pixels dans `--novac-nav-w`, dont chaque page tire sa
 * marge gauche. Le rail garde les 68 de l'état replié : aucune page n'a à savoir qu'il a
 * changé de forme, et la variable reste publiée pour celles qui s'y accrochent en CSS.
 *
 * ⚠️ **Il n'y a plus d'état déplié, donc plus de préférence à retenir.** Les noms ne sont
 * plus écrits en toutes lettres — ils paraissent au survol, dans une infobulle à ergot. Le
 * bouton de repli, la clé de stockage et le garde-fou d'hydratation qu'elle imposait sont
 * partis avec.
 *
 * ⚠️ **Les anneaux de la référence n'ont pas été repris.** Ils y portent une consommation en
 * pourcentage ; « Carte » ou « Simulation » n'ont aucune quantité à montrer, et un anneau
 * posé autour d'eux aurait été un décor déguisé en donnée.
 */

/**
 * La largeur que le rail réserve, épine comprise.
 *
 * ⚠️ **C'est celle de l'ancien état replié, et ce n'est pas une coïncidence.** Elle est
 * publiée dans `--novac-nav-w` et sert de marge gauche à toutes les pages : la reprendre
 * telle quelle est ce qui permet de refaire la navigation sans toucher à une seule d'entre
 * elles.
 */
const LARGEUR = 68;
/** L'épine collée au bord, dont le rail est un renflement. */
const EPINE = 10;
/**
 * Le rayon de toutes les courbes du rail — les deux convexes du flanc droit comme les deux
 * raccords concaves.
 *
 * ⚠️ **Un seul rayon, et non deux, parce que la languette d'un dossier le dit déjà.** Son
 * commentaire est catégorique — « les trois coins de l'encoche ont le rayon des angles du
 * dossier », faute de quoi « trois courbures se succèdent et l'œil voit un raccord bricolé
 * sans savoir le nommer ». Le rail portait vingt pour les angles et seize pour les creux :
 * deux courbures pour une seule forme, la faute même que ce commentaire décrit. Relevé à
 * l'usage.
 *
 * ⚠️ **Mais le rayon est tout ce qui se partage : la courbe, elle, ne peut pas.** J'avais
 * écrit ici que les deux formes avaient « exactement la même topologie », et c'est faux. Le
 * raccord de la languette est un **S à virage nul** — il part horizontal, arrive horizontal
 * — ce qui autorise ses deux arcs à être raccourcis : 73,9° chacun, une course de 34,6 pour
 * une chute de 26, soit une pente de 36,9°. Les raccords du rail, eux, tournent chacun d'un
 * **quart**, de l'épine verticale au bord horizontal : à rayon égal leur arc *est* un quart
 * de cercle, 18 sur 18, pente 45°. Aucun raccourcissement n'est possible — on ne tourne pas
 * de quatre-vingt-dix degrés avec un arc de soixante-quatorze.
 *
 * ⚠️ **La conséquence est à savoir avant de vouloir l'adoucir.** Ces 45° sont exactement la
 * pente que la languette a écartée en son temps. Chez elle, la remède était de raccourcir
 * l'arc ; ici il n'y en a qu'un — **augmenter le rayon**, donc rompre la règle du rayon
 * unique qu'on vient d'appliquer. Les deux ne peuvent pas être vrais à la fois.
 *
 * ⚠️ **Pris dans l'échelle des rayons, et non chez la carte d'actif.** C'est bien elle qui
 * publie le nombre dont la languette tire ses courbes, mais `CarteActif` traîne derrière elle
 * TileCard, AssetLogo, une étincelle et des chiffres roulants : l'importer ici aurait chargé
 * tout cela dans la coquille de chaque page pour un entier. Elle prend désormais son rayon au
 * même endroit que nous — la source est commune, le poids ne l'est pas.
 */
const RAYON = RAYONS.lg;
/** Le côté d'une rangée, l'écart entre deux, et le rembourrage du rail. */
const RANGEE = 40, ECART = 4, MARGE = 9;
/**
 * Où le rail commence.
 *
 * ⚠️ **En haut, et non centré — la mesure tranche.** Le serveur rend neuf rangées : ni le
 * compte ni « Se connecter » ne sont décidés avant hydratation, et la dixième n'apparaît
 * qu'ensuite. Centré, le rail grandit alors de 44 pixels vers ses deux extrémités, et
 * **chaque rangée saute de 22 pixels à chaque chargement de page**. Un rail centré dérive en
 * outre de la moitié de tout redimensionnement vertical de la fenêtre : aucune cible n'a de
 * position stable, ni entre deux visites, ni entre deux tailles d'écran. Ancré en haut, les
 * deux valeurs tombent à zéro.
 *
 * ⚠️ **Mais pas aligné sur le bandeau, faute de place — et c'est contre-intuitif.** Le champ
 * de recherche commence à douze pixels du haut ; aligner la première rangée dessus poserait
 * le rail à y=3, et son raccord supérieur — qui vit un rayon plus haut — sortirait de
 * l'écran. On perdrait la moitié de la silhouette pour gagner un alignement. La première
 * rangée ne peut donc pas monter au-dessus de `RAYON + MARGE`, soit vingt-sept ; à
 * vingt-huit, la silhouette commence à dix pixels du bord supérieur.
 *
 * ⚠️ **Et un alignement manqué se voit plus qu'un décalage assumé.** Poser la première
 * rangée treize pixels sous le bandeau, c'est-à-dire *presque* en face, se lirait comme une
 * erreur. À vingt-huit, le rail ne prétend s'aligner sur rien.
 */
const HAUT = 28;

type Item = { label: string; href: string; icon: React.JSX.Element };

const icon = (d: string) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const ICONS = {
  dashboard: "M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  chart:     "M4 19V5m0 14h16M8 15V9m4 6V6m4 9v-4",
  markets:   "M3 3v18h18M7 15l4-5 3 3 5-7",
  map:       "M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5zM9 4v13m6-10.5v13",
  simulation:"M6 20V10m6 10V4m6 16v-7",
  reglages:  "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.8 1.17V21a2 2 0 1 1-4 0v-.1A1.65 1.65 0 0 0 7.9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3 15.1a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 8.9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 8.9 4.6h.1A1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V10a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1",
  sun:       "M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2-1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  moon:      "M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5",
};

/** Le voile flouté, identique sur les quatre pièces de la silhouette. */
const FLOU = {
  background: "var(--nv-barre-fond)",
  backdropFilter: "blur(24px) saturate(1.4)",
  WebkitBackdropFilter: "blur(24px) saturate(1.4)",
} as const;

/**
 * Une rangée du rail.
 *
 * ⚠️ **Écrite une fois, alors qu'il y en avait cinq copies.** Le panneau répétait le même
 * bloc de style pour un lien, un réglage, un compte, une connexion et deux thèmes — six
 * fois la même hauteur, le même arrondi, la même bascule de survol. Elles avaient déjà
 * divergé : 40 pixels de haut pour les liens, 44 pour le compte, `0 12px` de rembourrage
 * d'un côté et `0 8px` de l'autre. Le rail les remet toutes au carré, et une seule
 * définition garantit qu'elles y restent.
 */
function Rangee({
  nom, href, onClick, actif = false, enfant,
}: {
  nom: string;
  href?: string;
  onClick?: () => void;
  actif?: boolean;
  enfant: React.ReactNode;
}) {
  const socle: React.CSSProperties = {
    position: "relative",
    display: "flex", alignItems: "center", justifyContent: "center",
    width: RANGEE, height: RANGEE, flexShrink: 0,
    padding: 0, border: "none", borderRadius: 12, cursor: "pointer",
    textDecoration: "none",
    color: actif ? "var(--nv-texte)" : "var(--nv-texte-secondaire)",
    background: actif ? "var(--nv-barre-actif)" : "transparent",
    boxShadow: actif ? "inset 0 0 0 1px var(--nv-barre-actif-bord)" : "none",
    transition: "background 160ms, color 160ms",
  };
  /* ⚠️ Le survol se pose à la main plutôt qu'en CSS : la teinte active doit survivre au
     passage du curseur, et une règle `:hover` l'écraserait sans savoir laquelle est en cours. */
  const entrer = (e: React.MouseEvent<HTMLElement>) => {
    if (!actif) e.currentTarget.style.background = "var(--nv-barre-survol)";
  };
  const sortir = (e: React.MouseEvent<HTMLElement>) => {
    if (!actif) e.currentTarget.style.background = "transparent";
  };

  const dedans = (
    <>
      {enfant}
      {/**
        * ⚠️ **L'infobulle est dans le lien, pas à côté.** C'est ce qui la fait paraître au
        * survol sans une ligne de JavaScript ni un état par rangée : la règle CSS descend du
        * lien survolé vers son propre enfant. Posée en voisine, il aurait fallu dix états.
        */}
      <span className="nv-rail-bulle" style={{
        background: "var(--nv-carte)",
        color: "var(--nv-texte)",
        border: "1px solid var(--nv-bord-fort)",
        borderRadius: 8, padding: "5px 9px",
        fontSize: 12, fontWeight: 500, whiteSpace: "nowrap",
        boxShadow: "0 6px 20px rgba(0,0,0,0.28)",
      }}>{nom}</span>
    </>
  );

  return href ? (
    <Link className="nv-rail-lien" href={href} style={socle} aria-label={nom}
      aria-current={actif ? "page" : undefined}
      onMouseEnter={entrer} onMouseLeave={sortir}>{dedans}</Link>
  ) : (
    <button className="nv-rail-lien" type="button" onClick={onClick} style={socle}
      aria-label={nom} onMouseEnter={entrer} onMouseLeave={sortir}>{dedans}</button>
  );
}

export default function SideNav() {
  const pathname = usePathname();
  const { mode, activeAsset } = useApp();
  const modeTheme = useModeTheme();

  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<{ username?: string; email?: string; avatar_url?: string } | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("novac_user");
      if (stored) setUser(JSON.parse(stored));
    } catch { /* stockage refusé ou contenu illisible */ }
    setReady(true);
  }, []);

  // Vérifie que la session tient encore.
  //
  // `novac_user` et `novac_token` sont deux entrées distinctes du stockage :
  // le compte survivait à la disparition du jeton, et l'interface affichait un
  // utilisateur connecté qui ne pouvait plus rien enregistrer. L'échec ne se
  // découvrait qu'à la sauvegarde, sous forme d'« Authentification requise ».
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("novac_token") : null;
    if (!token) {
      if (typeof window !== "undefined") localStorage.removeItem("novac_user");
      setUser(null);
      return;
    }
    let annule = false;
    fetch(`${API_URL}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error("session close"))))
      .then((u) => {
        if (annule) return;
        // Le serveur fait foi : pseudo et avatar peuvent avoir changé ailleurs.
        setUser(u);
        try { localStorage.setItem("novac_user", JSON.stringify(u)); } catch { /* stockage refusé */ }
      })
      .catch(() => {
        if (annule) return;
        try {
          localStorage.removeItem("novac_token");
          localStorage.removeItem("novac_user");
        } catch { /* stockage refusé */ }
        setUser(null);
      });
    return () => { annule = true; };
  }, []);

  /* ⚠️ Publiée une fois pour toutes : la largeur ne dépend plus d'un état, mais la variable
     reste — c'est par elle que la coquille et les éléments fixes du bandeau se décalent, et
     aucun d'eux n'a jamais eu à connaître ce composant. */
  useEffect(() => {
    document.documentElement.style.setProperty("--novac-nav-w", `${LARGEUR}px`);
  }, []);

  // Le premier onglet suit le mode : un portefeuille ouvert mène à son tableau
  // de bord, un actif à son graphique.
  const first: Item = mode === "portfolio"
    ? { label: "Dashboard", href: "/portfolio", icon: icon(ICONS.dashboard) }
    : { label: "Graphique", href: activeAsset ? `/chart?ticker=${encodeURIComponent(activeAsset.ticker)}` : "/chart", icon: icon(ICONS.chart) };

  const items: Item[] = [
    first,
    { label: "Marchés",    href: "/treemap",    icon: icon(ICONS.markets) },
    { label: "Carte",      href: "/map",        icon: icon(ICONS.map) },
    /**
     * ⚠️ **« Analyse » est retirée, et `/dashboard` n'est plus atteignable.** Le rail était
     * le **seul** lien vers cette page dans toute l'application — vérifié par recherche, il
     * n'en existe aucun autre. Ses sept cent quarante-cinq lignes sont donc désormais du code
     * mort, servi par une route que rien ne mène à ouvrir. Retiré à l'usage ; la page n'a pas
     * été supprimée pour autant, cela ne m'a pas été demandé.
     */
    { label: "Simulation", href: "/simulation", icon: icon(ICONS.simulation) },
  ];

  return (
    <>
    {/* L'épine : la matière dont le rail est un renflement. */}
    <div aria-hidden="true" style={{
      position: "fixed", left: 0, top: 0, bottom: 0, width: EPINE, zIndex: 59,
      ...FLOU,
    }} />

    <nav
      aria-label="Navigation principale"
      data-avatar="curieux"
      className="nv-rail"
      style={{
        position: "fixed", left: EPINE, top: HAUT,
        width: LARGEUR - EPINE, zIndex: 60,
        display: "flex", flexDirection: "column", alignItems: "center", gap: ECART,
        padding: `${MARGE}px 0`,
        borderRadius: `0 ${RAYON}px ${RAYON}px 0`,
        ...FLOU,
        /* ⚠️ **Visible, sinon les raccords ne servent à rien** : ils sont dessinés par deux
           pseudo-éléments posés *hors* de la boîte, et l'infobulle sort par la droite. */
        overflow: "visible",
        ["--nv-raccord" as string]: `${RAYON}px`,
      }}
    >
      {/**
        * La marque, en tête du rail.
        *
        * ⚠️ **Le mot « NOVAC » est parti avec l'état déplié**, faute de tenir dans
        * cinquante-huit pixels. Le seul repère qui y tienne est le sigle, et il y était déjà :
        * c'est ce que la barre repliée montrait.
        */}
      <Rangee nom="Accueil Novac" href="/" enfant={
        <span aria-hidden="true" style={{
          width: 20, height: 20,
          backgroundColor: "var(--nv-texte)",
          maskImage: "url(/logo-hivesync.svg)",
          WebkitMaskImage: "url(/logo-hivesync.svg)",
          maskSize: "contain", WebkitMaskSize: "contain",
          maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat",
          maskPosition: "center", WebkitMaskPosition: "center",
        }} />
      } />

      {items.map(item => {
        const base = item.href.split("?")[0];
        const actif = pathname === base || (base !== "/" && pathname.startsWith(base));
        return (
          <Rangee key={item.label} nom={item.label} href={item.href} actif={actif}
            enfant={item.icon} />
        );
      })}

      {/**
        * ⚠️ **Un filet, et non un écart plus grand.** Les quatre commandes du bas ne sont pas
        * des destinations : elles règlent l'application. Un simple blanc aurait laissé croire
        * à une pause dans la même liste ; le trait dit qu'on change de nature. Demandé à
        * l'usage — « séparées d'un filet ».
        */}
      <span aria-hidden="true" style={{
        width: 22, height: 1, margin: `${ECART}px 0`,
        background: "var(--nv-bord-fort)", flexShrink: 0,
      }} />

      <Rangee nom="Paramètres" href="/parametres" actif={pathname.startsWith("/parametres")}
        enfant={icon(ICONS.reglages)} />

      {user && (
        <Rangee nom={user.username?.split(" ")[0] || user.email || "Compte"}
          onClick={() => setShowProfile(true)}
          enfant={
            <span style={{
              width: 26, height: 26, borderRadius: "50%", overflow: "hidden",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "1px solid var(--nv-bord-fort)", background: "var(--nv-carte-creuse)",
            }}>
              {user.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatar_url.startsWith("/uploads") ? `${API_URL}${user.avatar_url}` : user.avatar_url}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--nv-texte)", userSelect: "none" }}>
                  {(user.username || user.email || "?")[0].toUpperCase()}
                </span>
              )}
            </span>
          } />
      )}

      {/* Hors session : l'entrée du compte reste, mais elle mène à la
          connexion. Sans elle, il fallait repasser par la page d'accueil
          pour se connecter — donc quitter ce qu'on était en train de faire. */}
      {ready && !user && (
        <Rangee nom="Se connecter" onClick={() => setShowAuth(true)} enfant={
          <span style={{
            width: 26, height: 26, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "1px solid var(--nv-accent-bord)", background: "var(--nv-accent-doux)",
            color: "var(--nv-accent)", fontSize: 13, lineHeight: 1,
          }}>↪</span>
        } />
      )}

      {/**
        * ⚠️ **Il y avait deux bascules de thème, et la seconde ne se voyait presque jamais.**
        * Elle appelait `toggleDisplayMode`, qui fait bien basculer l'état — mais `displayMode`
        * n'est lu que par le graphique, la simulation et leurs courbes. Sur les cinq autres
        * pages, dont celle d'où on l'actionnait le plus souvent, appuyer ne changeait rien à
        * l'écran. Elle ne fonctionnait pas *là où on s'en servait*, ce qui revient au même.
        * Retirée à l'usage.
        *
        * ⚠️ **Plus rien ne bascule le thème noir dans l'application.** `GlobalHeader` en
        * extrait encore `toggleDisplayMode` du contexte, mais ne l'appelle nulle part — c'était
        * déjà le cas avant. Le contexte, lui, reste entier : l'état existe, sa valeur par
        * défaut est « verre », et le jour où le thème noir vaudra pour toutes les pages il y
        * aura un interrupteur à rebrancher, pas un mode à réécrire.
        */}
      <Rangee nom={modeTheme === "clair" ? "Thème sombre" : "Thème clair"}
        onClick={() => basculerMode()}
        enfant={icon(modeTheme === "clair" ? ICONS.moon : ICONS.sun)} />
    </nav>

    {/* Hors du <nav> à dessein : son backdrop-filter en fait le bloc conteneur
        des descendants en position fixe, qui seraient donc enfermés dans la
        largeur du rail. */}
    {showProfile && user && (
      // Le conteneur ne sert qu'à la superposition : la modale se voile en
      // z-index 50, le panneau vit en 60, et sans cela le panneau restait seul
      // éclairé au-dessus du voile. Un ancêtre positionné crée un contexte
      // d'empilement qui emporte la modale avec lui, sans la déplacer.
      <div style={{ position: "relative", zIndex: 70 }}>
      <ProfileModal
        user={user}
        dark
        onClose={() => setShowProfile(false)}
        onUpdate={updated => {
          // La déconnexion remonte null après avoir vidé le stockage ; s'y
          // fier plutôt que d'y réécrire "null", que le JSON.parse d'une
          // prochaine visite relirait sans erreur comme un compte connecté.
          setUser(updated);
          if (updated) {
            try { localStorage.setItem("novac_user", JSON.stringify(updated)); } catch { /* stockage refusé */ }
          }
        }}
      />
      </div>
    )}

    {showAuth && (
      <div style={{ position: "relative", zIndex: 70 }}>
        <AuthModal
          dark
          onClose={() => setShowAuth(false)}
          onAuth={(u: { username?: string; email?: string; avatar_url?: string }) => {
            setUser(u);
            setShowAuth(false);
            // Les portefeuilles appartiennent au compte : ce qui est affiché
            // vient de l'ancienne session, ou de personne. Un rechargement
            // complet plutôt qu'un router.refresh() — l'état des pages vit
            // dans des `useState` que le rafraîchissement serveur ne touche pas.
            window.location.reload();
          }}
        />
      </div>
    )}
    </>
  );
}
