"use client";
import { FONT } from "@/lib/typography";
import { JETONS, RAYONS } from "@/lib/palette";

/**
 * Un choix exclusif, en pastilles.
 *
 * Une piste creusée, et l'option retenue en pastille pleine et claire posée
 * dessus. C'est le motif du concept, et il dit deux choses d'un coup : les
 * options forment un groupe, et l'une d'elles est en relief.
 *
 * Ce que remplaçaient jusqu'ici trois implémentations séparées — le
 * basculement Actif/Classe de la répartition, les filtres de la grille
 * d'actifs, le choix de tri — chacune avec ses propres hauteurs et ses propres
 * rayons. C'est d'ailleurs de là que venait une bonne part des onze rayons
 * distincts relevés sur la page.
 *
 * Les valeurs viennent de leur composant Tabs, variante « pill », et non de
 * mes déductions sur captures. Trois choses m'avaient échappé :
 *
 * — La pastille active est **blanche et son texte noir dans les deux thèmes**.
 *   Ce n'est pas la couleur d'encre du thème : c'est un objet posé sur la
 *   piste, et il garde la même valeur qu'on soit en clair ou en sombre.
 * — Le texte inactif est leur `foreground-strong`, bien plus lumineux que le
 *   gris atténué que j'avais choisi.
 * — La pastille garde **le rayon de la piste** (`rounded-[inherit]`) au lieu de
 *   le réduire du rembourrage. J'appliquais la règle des arrondis
 *   concentriques ; eux ne le font pas, et à 2 px de rembourrage l'écart ne se
 *   voit pas.
 */

export type Segment<T extends string> = { valeur: T; libelle: string };

export default function Segments<T extends string>({
  options, valeur, onChange, taille = "md", ariaLabel,
}: {
  options: readonly Segment<T>[];
  valeur: T;
  onChange: (v: T) => void;
  /** `sm` pour les en-têtes de panneau, `md` pour les barres de section. */
  taille?: "sm" | "md";
  ariaLabel?: string;
}) {
  const petit = taille === "sm";
  // Leur échelle nommée, déjà en v4 : rounded-sm vaut 12 px, rounded-md 14.
  const rayon = petit ? 12 : RAYONS.md;

  return (
    <div role="tablist" aria-label={ariaLabel} style={{
      // gap-0.5 et p-0.5 chez eux, soit 2 px de part et d'autre.
      display: "inline-flex", gap: 2, padding: 2,
      background: JETONS.segmentPiste,
      borderRadius: rayon,
      // La piste ne doit pas s'étirer si elle vit dans un conteneur en flex :
      // elle vaut la largeur de ses options, pas davantage.
      flexShrink: 0, boxSizing: "border-box",
    }}>
      {options.map(o => {
        const actif = o.valeur === valeur;
        return (
          <button key={o.valeur} type="button" role="tab" aria-selected={actif}
            onClick={() => onChange(o.valeur)}
            style={{
              padding: petit ? "0 10px" : "0 13px",
              height: petit ? 22 : 26,
              borderRadius: rayon,
              border: "none", cursor: "pointer", whiteSpace: "nowrap",
              fontFamily: FONT, fontSize: petit ? 11 : 12,
              fontWeight: 500,
              background: actif ? JETONS.segmentActif : "transparent",
              color: actif ? JETONS.segmentEncre : JETONS.segmentInactif,
              boxShadow: actif ? JETONS.segmentOmbre : "none",
              transition: "background 250ms, color 250ms",
            }}
            onMouseEnter={e => { if (!actif) e.currentTarget.style.background = JETONS.segmentSurvol; }}
            onMouseLeave={e => { if (!actif) e.currentTarget.style.background = "transparent"; }}>
            {o.libelle}
          </button>
        );
      })}
    </div>
  );
}
