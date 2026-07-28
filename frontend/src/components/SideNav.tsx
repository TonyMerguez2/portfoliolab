"use client";
import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useApp } from "@/lib/AppContext";

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

  // Replié par défaut nulle part : on lit la préférence après hydratation, pour
  // que le rendu serveur et le premier rendu client concordent.
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(STORAGE_KEY) === "1"); } catch { /* stockage refusé */ }
    setReady(true);
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
        <a href="/" aria-label="Accueil Novac" style={{
          textDecoration: "none", color: "#F8F9FC", fontSize: 13, fontWeight: 700,
          letterSpacing: "0.22em", whiteSpace: "nowrap",
          // Effacé sans être démonté : le retirer du flux ferait sauter le
          // bouton de repli d'un côté à l'autre pendant l'animation.
          opacity: collapsed ? 0 : 0.85,
          width: collapsed ? 0 : "auto",
          transition: "opacity 160ms",
        }}>NOVAC</a>
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
            <a key={item.label} href={item.href}
              title={collapsed ? item.label : undefined}
              aria-current={active ? "page" : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                height: 40, padding: "0 12px", borderRadius: 10,
                textDecoration: "none", whiteSpace: "nowrap",
                color: active ? "#F8F9FC" : "rgba(255,255,255,0.55)",
                background: active ? "rgba(255,255,255,0.07)" : "transparent",
                fontSize: 13, fontWeight: active ? 600 : 500,
                transition: "background 160ms, color 160ms",
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.035)"; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ flexShrink: 0, display: "flex" }}>{item.icon}</span>
              <span style={{ opacity: collapsed ? 0 : 1, transition: "opacity 160ms" }}>{item.label}</span>
            </a>
          );
        })}
      </div>

      {/* Bas de panneau */}
      <div style={{ padding: "10px", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
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
  );
}
