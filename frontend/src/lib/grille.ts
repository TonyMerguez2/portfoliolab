/**
 * Les styles de grille d'un graphique.
 *
 * Cette table vivait dans GrowthChart, où la page d'un actif l'utilise. Le
 * graphique du tableau de bord en avait besoin à son tour ; la recopier aurait
 * donné deux barèmes destinés à diverger, comme les tuiles avant qu'on ne les
 * réunisse.
 *
 * La préférence est rangée sous une clé unique : choisir « Minimal » sur un
 * actif le choisit aussi sur le tableau de bord. C'est un réglage d'affichage,
 * pas une propriété du graphique regardé.
 */

export type StyleGrille = "none" | "minimal" | "standard" | "solid";

export const STYLES_GRILLE: StyleGrille[] = ["none", "minimal", "standard", "solid"];

export const LIBELLE_GRILLE: Record<StyleGrille, string> = {
  none: "Aucune",
  minimal: "Minimal",
  standard: "Standard",
  solid: "Solide",
};

/** Clé de rangement, partagée avec la page d'un actif. */
export const CLE_GRILLE = "novac_grid_preset";

/**
 * L'opacité du filet, par style et par thème.
 *
 * Les valeurs sombres sont celles d'origine. Les claires ne s'en déduisent pas
 * par symétrie : un gris à 4 % sur blanc ne se voit pas du tout, là où un blanc
 * à 4 % sur noir se devine encore. Elles sont donc relevées à part.
 */
const OPACITES: Record<Exclude<StyleGrille, "none">, { sombre: number; clair: number }> = {
  minimal:  { sombre: 0.040, clair: 0.10 },
  standard: { sombre: 0.075, clair: 0.16 },
  solid:    { sombre: 0.110, clair: 0.22 },
};

/** La couleur du filet pour un style donné, ou `null` si la grille est masquée. */
export function couleurGrille(style: StyleGrille, clair: boolean): string | null {
  if (style === "none") return null;
  const o = OPACITES[style];
  return clair
    ? `rgba(100,116,139,${o.clair})`
    : `rgba(255,255,255,${o.sombre})`;
}

/** Lit la préférence rangée, en se repliant sur « standard ». */
export function lireStyleGrille(): StyleGrille {
  if (typeof localStorage === "undefined") return "standard";
  try {
    const v = localStorage.getItem(CLE_GRILLE);
    return STYLES_GRILLE.includes(v as StyleGrille) ? (v as StyleGrille) : "standard";
  } catch {
    return "standard";
  }
}

export function ecrireStyleGrille(style: StyleGrille): void {
  try {
    localStorage.setItem(CLE_GRILLE, style);
  } catch {
    /* Stockage indisponible : le choix vaut pour la session. */
  }
}
