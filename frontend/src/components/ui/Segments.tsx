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
 * L'option active n'est pas teintée à l'accent mais franchement claire : un
 * voile d'accent à 10 % ne se distingue pas d'un survol, et il perdait le sens
 * de « celle-ci est choisie ».
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
  const hauteur = petit ? 24 : 30;
  const rayonPiste = petit ? RAYONS.sm : RAYONS.md;

  return (
    <div role="tablist" aria-label={ariaLabel} style={{
      display: "inline-flex", gap: 2, padding: 3,
      background: JETONS.segmentPiste,
      borderRadius: rayonPiste,
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
              padding: petit ? "0 9px" : "0 12px",
              height: hauteur - 6,
              // Le rayon de la pastille suit celui de la piste, moins le
              // rembourrage : sans quoi la pastille paraît plus carrée que le
              // creux qui la contient.
              borderRadius: rayonPiste - 3,
              border: "none", cursor: "pointer", whiteSpace: "nowrap",
              fontFamily: FONT, fontSize: petit ? 10.5 : 11.5,
              fontWeight: actif ? 600 : 500,
              background: actif ? JETONS.segmentActif : "transparent",
              color: actif ? JETONS.segmentEncre : JETONS.texteAttenue,
              boxShadow: actif ? JETONS.segmentOmbre : "none",
              transition: "background 140ms, color 140ms",
            }}
            onMouseEnter={e => { if (!actif) e.currentTarget.style.color = JETONS.texteSecondaire; }}
            onMouseLeave={e => { if (!actif) e.currentTarget.style.color = JETONS.texteAttenue; }}>
            {o.libelle}
          </button>
        );
      })}
    </div>
  );
}
