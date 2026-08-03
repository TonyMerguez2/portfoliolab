"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/lib/AppContext";
import ProfileModal from "@/components/ProfileModal";
import AuthModal from "@/components/AuthModal";
import { basculerMode, useModeTheme } from "@/lib/theme";

/**
 * Navigation principale, en panneau latéral repliable.
 *
 * La largeur est publiée dans `--novac-nav-w` sur l'élément racine plutôt que
 * remontée dans un contexte : la coquille et les éléments fixes du header s'y
 * accrochent en CSS, sans qu'aucun d'eux n'ait à connaître ce composant ni à
 * se re-rendre quand on replie le panneau.
 */
const EXPANDED = 232;
const COLLAPSED = 68;
const STORAGE_KEY = "novac_nav_collapsed";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Item = { label: string; href: string; icon: JSX.Element };

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
  analysis:  "M12 3a9 9 0 1 0 9 9h-9z M13 3.5A8.5 8.5 0 0 1 20.5 11H13z",
  simulation:"M6 20V10m6 10V4m6 16v-7",
  sun:       "M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2-1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  moon:      "M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5",
};

export default function SideNav() {
  const pathname = usePathname();
  const { mode, activeAsset, displayMode, toggleDisplayMode } = useApp();
  const modeTheme = useModeTheme();

  // Replié par défaut nulle part : on lit la préférence après hydratation, pour
  // que le rendu serveur et le premier rendu client concordent.
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<{ username?: string; email?: string; avatar_url?: string } | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
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

  useEffect(() => {
    document.documentElement.style.setProperty("--novac-nav-w", `${collapsed ? COLLAPSED : EXPANDED}px`);
  }, [collapsed]);

  const toggle = useCallback(() => {
    setCollapsed(v => {
      const next = !v;
      try { localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch { /* stockage refusé */ }
      return next;
    });
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
    { label: "Analyse",    href: "/dashboard",  icon: icon(ICONS.analysis) },
    { label: "Simulation", href: "/simulation", icon: icon(ICONS.simulation) },
  ];

  const width = collapsed ? COLLAPSED : EXPANDED;

  return (
    <>
    <nav
      aria-label="Navigation principale"
      style={{
        position: "fixed", left: 0, top: 0, bottom: 0, width, zIndex: 60,
        display: "flex", flexDirection: "column",
        background: "rgba(4,15,34,0.72)",
        backdropFilter: "blur(24px) saturate(1.4)",
        WebkitBackdropFilter: "blur(24px) saturate(1.4)",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        // Pas de transition avant hydratation : sinon le panneau s'anime depuis
        // sa largeur par défaut vers la préférence enregistrée, à chaque visite.
        transition: ready ? "width 220ms cubic-bezier(0.4,0,0.2,1)" : "none",
        overflow: "hidden",
      }}
    >
      {/* Marque + bouton de repli */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, height: 60, padding: "0 16px", flexShrink: 0 }}>
        <Link href="/" aria-label="Accueil Novac" style={{
          textDecoration: "none", color: "#F8F9FC", fontSize: 13, fontWeight: 700,
          letterSpacing: "0.22em", whiteSpace: "nowrap",
          // Effacé sans être démonté : le retirer du flux ferait sauter le
          // bouton de repli d'un côté à l'autre pendant l'animation.
          opacity: collapsed ? 0 : 0.85,
          width: collapsed ? 0 : "auto",
          // Une largeur nulle ne retient pas le texte : sans découpe, « NOVAC »
          // débordait par-dessus le bouton de repli et, quoique invisible,
          // captait son clic — déplier ne faisait donc rien. Les évènements
          // sont coupés en plus de la découpe, la seconde ne valant que pour
          // ce qui dépasse.
          overflow: "hidden",
          pointerEvents: collapsed ? "none" : undefined,
          transition: "opacity 160ms",
        }}>NOVAC</Link>
        <button
          onClick={toggle}
          aria-label={collapsed ? "Déplier la navigation" : "Replier la navigation"}
          aria-expanded={!collapsed}
          title={collapsed ? "Déplier" : "Replier"}
          style={{
            marginLeft: collapsed ? 0 : "auto", width: 32, height: 32, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: "none", borderRadius: 8,
            color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
          </svg>
        </button>
      </div>

      {/* Liens */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "6px 10px", flex: 1 }}>
        {items.map(item => {
          const base = item.href.split("?")[0];
          const active = pathname === base || (base !== "/" && pathname.startsWith(base));
          return (
            <Link key={item.label} href={item.href}
              title={collapsed ? item.label : undefined}
              aria-current={active ? "page" : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                height: 40, padding: "0 12px", borderRadius: 10,
                textDecoration: "none", whiteSpace: "nowrap",
                color: active ? "#F8F9FC" : "rgba(255,255,255,0.55)",
                background: active ? "rgba(255,255,255,0.11)" : "transparent",
                boxShadow: active ? "inset 0 0 0 1px rgba(255,255,255,0.10)" : "none",
                fontSize: 13, fontWeight: active ? 600 : 500,
                transition: "background 160ms, color 160ms",
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.035)"; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ flexShrink: 0, display: "flex" }}>{item.icon}</span>
              <span style={{ opacity: collapsed ? 0 : 1, transition: "opacity 160ms" }}>{item.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Bas de panneau : compte puis thème.
          Tout ce qui touche au compte est réuni ici — il était auparavant
          coupé en deux, avatar dans le bandeau et thème dans le panneau. */}
      <div style={{ padding: "10px", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
        {user && (
          <button
            type="button"
            onClick={() => setShowProfile(true)}
            title={collapsed ? (user.username || user.email || "Compte") : undefined}
            style={{
              display: "flex", alignItems: "center", gap: 12, width: "100%",
              height: 44, padding: "0 8px", borderRadius: 10, marginBottom: 4,
              background: "transparent", border: "none", cursor: "pointer",
              color: "rgba(255,255,255,0.88)", fontSize: 13, fontWeight: 500,
              whiteSpace: "nowrap", textAlign: "left",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.045)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{
              width: 28, height: 28, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.1)",
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
                <span style={{ fontSize: 11, fontWeight: 700, color: "#F8F9FC", userSelect: "none" }}>
                  {(user.username || user.email || "?")[0].toUpperCase()}
                </span>
              )}
            </span>
            <span style={{
              opacity: collapsed ? 0 : 1, transition: "opacity 160ms",
              overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {user.username?.split(" ")[0] || user.email || "Compte"}
            </span>
          </button>
        )}

        {/* Hors session : l'entrée du compte reste, mais elle mène à la
            connexion. Sans elle, il fallait repasser par la page d'accueil
            pour se connecter — donc quitter ce qu'on était en train de faire. */}
        {ready && !user && (
          <button
            type="button"
            onClick={() => setShowAuth(true)}
            title={collapsed ? "Se connecter" : undefined}
            style={{
              display: "flex", alignItems: "center", gap: 12, width: "100%",
              height: 44, padding: "0 8px", borderRadius: 10, marginBottom: 4,
              background: "transparent", border: "none", cursor: "pointer",
              color: "rgba(255,255,255,0.88)", fontSize: 13, fontWeight: 500,
              whiteSpace: "nowrap", textAlign: "left",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.045)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{
              width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "1px solid rgba(91,141,239,0.35)", background: "rgba(91,141,239,0.16)",
              color: "#9BB9FF", fontSize: 13, lineHeight: 1,
            }}>↪</span>
            <span style={{
              opacity: collapsed ? 0 : 1, transition: "opacity 160ms",
              overflow: "hidden", textOverflow: "ellipsis",
            }}>
              Se connecter
            </span>
          </button>
        )}
        <button
          onClick={() => basculerMode()}
          title={modeTheme === "clair" ? "Passer au thème sombre" : "Passer au thème clair"}
          style={{
            display: "flex", alignItems: "center", gap: 12, width: "100%",
            height: 40, padding: "0 12px", borderRadius: 10,
            background: "transparent", border: "none", cursor: "pointer",
            color: "var(--nv-texte-secondaire)", fontSize: 13, fontWeight: 500,
            whiteSpace: "nowrap", textAlign: "left",
          }}
        >
          <span style={{ flexShrink: 0, display: "flex" }}>
            {icon(modeTheme === "clair" ? ICONS.moon : ICONS.sun)}
          </span>
          <span style={{ opacity: collapsed ? 0 : 1, transition: "opacity 160ms" }}>
            {modeTheme === "clair" ? "Thème sombre" : "Thème clair"}
          </span>
        </button>
        <button
          onClick={toggleDisplayMode}
          title={displayMode === "black" ? "Revenir au thème verre" : "Passer au thème noir"}
          style={{
            display: "flex", alignItems: "center", gap: 12, width: "100%",
            height: 40, padding: "0 12px", borderRadius: 10,
            background: "transparent", border: "none", cursor: "pointer",
            color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 500,
            whiteSpace: "nowrap", textAlign: "left",
          }}
        >
          <span style={{ flexShrink: 0, display: "flex" }}>
            {icon(displayMode === "black" ? ICONS.sun : ICONS.moon)}
          </span>
          <span style={{ opacity: collapsed ? 0 : 1, transition: "opacity 160ms" }}>
            {displayMode === "black" ? "Thème verre" : "Thème noir"}
          </span>
        </button>
      </div>

    </nav>

    {/* Hors du <nav> à dessein : son backdrop-filter en fait le bloc conteneur
        des descendants en position fixe, qui seraient donc enfermés dans les
        232 px du panneau — et rognés par son overflow: hidden. */}
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
