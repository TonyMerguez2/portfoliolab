import { decalerClarte } from "@/lib/couleur";

/**
 * Un compte, dessiné comme un dossier.
 *
 * ⚠️ **La forme fait tout le travail, et elle tient à un seul tracé.** Un rectangle
 * arrondi avec un titre ne dit pas « dossier » ; ce qui le dit, c'est la **languette** —
 * le décrochement en haut à gauche, et la pochette claire qui dépasse derrière. Sans
 * elle, la carte se lit comme n'importe quelle tuile de l'application, et l'utilisateur
 * n'a aucune raison de penser qu'elle s'ouvre.
 *
 * ⚠️ **Le contour est une découpe, pas une bordure.** La languette se décrit par un
 * `path` en coordonnées relatives, ce qui laisse la carte prendre n'importe quelle
 * taille sans que les rayons se déforment — un `clip-path` en pourcentages aurait
 * étiré les angles dès que la largeur et la hauteur cessent d'être égales.
 */

/** Le rayon des angles, en pixels, commun au dossier et à sa pochette. */
const RAYON = 20;

export default function CarteCompte({
  nom, compte, couleur, icone, nombre, ouvert = false, onClick,
}: {
  nom: string;
  /** Ce que la carte annonce sous le nom — « 4 actifs ». */
  compte: string;
  couleur: string;
  icone: React.ReactNode;
  /** Le nombre porté par la pastille de droite, quand il y a lieu. */
  nombre?: number;
  ouvert?: boolean;
  onClick?: () => void;
}) {
  const clair = decalerClarte(couleur, 0.1);
  const sombre = decalerClarte(couleur, -0.1);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={ouvert}
      aria-label={`${nom} — ${compte}`}
      style={{
        position: "relative", width: "100%", minWidth: 210, height: 148,
        padding: 0, border: 0, background: "none", cursor: "pointer",
        textAlign: "left", flexShrink: 0,
        // La carte se soulève d'un cheveu quand elle est ouverte : c'est le seul
        // retour qui dise « c'est celle-ci que vous regardez » sans ajouter de cerne.
        transform: ouvert ? "translateY(-2px)" : "none",
        transition: "transform 160ms ease",
      }}
    >
      {/* La pochette, derrière : elle ne dépasse qu'en haut et à droite, comme une
          feuille glissée dans le dossier. C'est elle qui donne la profondeur.

          ⚠️ **Teintée, pas blanche.** La référence est posée sur un fond clair, où une
          feuille blanche se lit comme du papier ; sur le fond sombre de l'application,
          le même blanc à 92 % devenait la zone la plus lumineuse de tout l'écran — une
          barre qui attirait l'œil avant le nom du compte. Une clarté prise sur la
          couleur du dossier garde la feuille lisible sans la faire crier. */}
      <div style={{
        position: "absolute", left: 10, right: 0, top: 0, height: 96,
        borderRadius: RAYON, background: decalerClarte(couleur, 0.42),
        boxShadow: `0 2px 10px ${couleur}33`,
      }} />
      {/* Le halo de la couleur, tout autour : la référence en porte un, et c'est lui
          qui empêche les quatre cartes de se lire comme des aplats posés côte à côte. */}
      <div style={{
        position: "absolute", inset: -6, borderRadius: RAYON + 6,
        background: couleur, opacity: 0.16, filter: "blur(6px)", pointerEvents: "none",
      }} />

      {/* La languette : le bloc qui remonte à gauche, au-dessus du plan du dossier.

          ⚠️ **Frère du dossier, et non son enfant.** Elle y était, en `top: -22` — et
          l'`overflow: hidden` du dossier en rognait les 22 pixels qui dépassent, c'est-à-dire
          exactement ceux qui font la languette : mesuré, 8 pixels visibles sur 30. La carte
          se lisait comme un rectangle arrondi surmonté d'une barre claire. Ici elle est
          dessinée avant le dossier, qui vient en recouvrir le bas. */}
      <div style={{
        position: "absolute", left: 0, top: 0, width: "52%", height: 40,
        borderTopLeftRadius: RAYON, borderTopRightRadius: RAYON,
        background: clair,
      }} />

      {/* Le dossier lui-même : le plan de devant, qui recouvre la pochette et la
          languette et donne au tout son épaisseur. */}
      <div style={{
        position: "absolute", inset: 0, top: 22,
        borderRadius: RAYON,
        background: `linear-gradient(155deg, ${clair} 0%, ${couleur} 46%, ${sombre} 100%)`,
        boxShadow: `0 10px 22px ${couleur}47`,
        overflow: "hidden",
      }}>
        <div style={{
          position: "relative", height: "100%", padding: "12px 14px 12px",
          display: "flex", flexDirection: "column", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <span style={{
              width: 38, height: 38, borderRadius: 11, flexShrink: 0,
              background: "rgba(255,255,255,0.92)", color: sombre,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {icone}
            </span>
            {/* La pastille de droite : pleine quand le dossier porte quelque chose,
                creuse quand il est vide — comme la coche de la référence. */}
            <span style={{
              width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: nombre ? "rgba(255,255,255,0.94)" : "transparent",
              border: nombre ? "none" : "1.5px solid rgba(255,255,255,0.55)",
              color: sombre, fontSize: 12, fontWeight: 700,
            }}>
              {nombre ? nombre : ""}
            </span>
          </div>

          <div>
            <div style={{
              fontSize: 16, fontWeight: 700, color: "#FFFFFF", lineHeight: 1.15,
              letterSpacing: "-0.01em",
            }}>
              {nom}
            </div>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginTop: 3,
            }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.82)" }}>{compte}</span>
              {/* Le chevron pivote à l'ouverture : sur la référence il pointe à droite
                  parce qu'il mène ailleurs ; ici le contenu se déroule en dessous, et
                  un chevron qui ne bouge pas mentirait sur ce qui va se passer. */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="rgba(255,255,255,0.9)" strokeWidth={2.4} strokeLinecap="round"
                strokeLinejoin="round" aria-hidden="true"
                style={{
                  transform: ouvert ? "rotate(90deg)" : "none",
                  transition: "transform 180ms ease",
                }}>
                <path d="m9 18 6-6-6-6" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
