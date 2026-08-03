"use client";
import { FONT } from "@/lib/typography";
import { CLAIR } from "@/lib/palette";

/**
 * Barre d'onglets du portefeuille.
 *
 * Reprend la maquette : icône, libellé, soulignement de l'onglet actif, et un
 * filet continu qui court sous toute la barre pour l'ancrer au contenu.
 *
 * Elle occupe toute la largeur, au-dessus du graphique, plutôt que d'être
 * tassée à droite du sous-en-tête. C'est la navigation principale de la page :
 * la reléguer dans un coin en pastilles la faisait passer pour un réglage
 * d'affichage.
 */


export type TabId = "resume" | "analyse" | "evenements" | "objectifs" | "transactions";

const icone = (d: string) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const TABS: { id: TabId; label: string; icon: JSX.Element }[] = [
  { id: "resume",       label: "Vue générale",  icon: icone("M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z") },
  { id: "transactions", label: "Transactions",  icon: icone("M4 7h13m0 0-3-3m3 3-3 3M20 17H7m0 0 3 3m-3-3 3-3") },
  { id: "analyse",      label: "Analyse",       icon: icone("M12 3a9 9 0 1 0 9 9h-9zM13 3.5A8.5 8.5 0 0 1 20.5 11H13z") },
  { id: "evenements",   label: "Événements",    icon: icone("M8 3v3m8-3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z") },
  { id: "objectifs",    label: "Objectifs",     icon: icone("M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 12h.01") },
];

export default function PortfolioTabs({
  active, onChange,
}: {
  active: TabId;
  onChange: (id: TabId) => void;
}) {
  return (
    <nav aria-label="Sections du portefeuille" style={{
      display: "flex", alignItems: "stretch", gap: 4,
      // Le filet est porté par la barre, pas par chaque onglet : il reste
      // continu sous les intervalles, et le soulignement actif s'y pose.
      borderBottom: `1px solid ${CLAIR.bord}`,
      padding: "0 4px", flexShrink: 0,
      // Retour à la ligne plutôt que défilement : `overflow-x: auto` fait
      // apparaître une barre dès que la largeur manque d'un pixel, et une
      // barre de défilement sur cinq onglets ne se justifie jamais. En
      // enroulant, la barre grandit d'une ligne dans le pire des cas.
      flexWrap: "wrap",
    }}>
      {TABS.map(t => {
        const actif = t.id === active;
        return (
          <button key={t.id} type="button" onClick={() => onChange(t.id)}
            aria-current={actif ? "page" : undefined}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "0 14px", height: 40, border: "none", background: "transparent",
              cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
              fontFamily: FONT, fontSize: 12.5, fontWeight: actif ? 600 : 500,
              // Mêmes deux crans que le sélecteur de période et que leur
              // variante d'onglets « line » : `foreground-strong` au repos,
              // `foreground-intense` une fois retenu.
              color: actif ? CLAIR.texteIntense : CLAIR.texteFort,
              // Décalé d'un pixel pour couvrir le filet de la barre plutôt que
              // de s'empiler dessus, ce qui épaississait le trait.
              boxShadow: actif ? `inset 0 -2px 0 0 ${CLAIR.texteIntense}` : "none",
              marginBottom: -1,
              transition: "color 160ms",
            }}
            onMouseEnter={e => { if (!actif) e.currentTarget.style.color = CLAIR.texteIntense; }}
            onMouseLeave={e => { if (!actif) e.currentTarget.style.color = CLAIR.texteFort; }}>
            <span style={{ display: "flex", flexShrink: 0, opacity: actif ? 1 : 0.75 }}>{t.icon}</span>
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
