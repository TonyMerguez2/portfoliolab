"use client";
import type { CSSProperties, ReactNode } from "react";
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

/**
 * Une option de la piste.
 *
 * `libelle` accepte un nœud et pas seulement une chaîne : le bandeau du
 * graphique du portefeuille y met des pictogrammes. Dans ce cas `titre` devient
 * obligatoire en pratique — une icône seule n'a pas de texte, donc rien à
 * annoncer à un lecteur d'écran ni à montrer au survol.
 */
export type Segment<T extends string> = {
  valeur: T; libelle: ReactNode; titre?: string;
  /**
   * Une seconde ligne sous le libellé — le rendement sous chaque période, par exemple.
   *
   * ⚠️ **Dès qu'une option en porte une, toutes les pastilles prennent la hauteur de la plus
   * haute** : la piste est en flex, ses enfants s'étirent, et un libellé seul se centre dans
   * la hauteur commune. Sans ça, une option muette aurait fait une pastille plus basse que
   * ses voisines, et la piste une dentelure.
   */
  sous?: ReactNode;
  /**
   * Une option qu'on montre sans l'offrir : une fenêtre plus ancienne que le portefeuille.
   *
   * ⚠️ **Montrée éteinte plutôt que retirée**, pour que la rangée ne change pas de forme
   * au fil des mois — et pour que l'infobulle puisse dire *pourquoi* on ne peut pas.
   */
  desactive?: boolean;
  /** Attributs supplémentaires posés sur le bouton — les `data-*` que l'avatar lit. */
  attributs?: Record<string, string | number | undefined>;
  /**
   * Le style de cette option **quand elle est retenue**, posé par-dessus celui de la piste.
   *
   * ⚠️ **Pour une option qui porte un résultat, pas pour décorer.** La période active du
   * graphique devient, au pixel, la pastille de performance du bandeau — même fond, même
   * encre, même taille de texte, même rembourrage. Deux mécanismes séparés (un fond, une
   * encre) ne suffisaient pas : la pastille du bandeau est aussi une *taille*, et l'écart
   * s'est vu tant qu'on ne reprenait que ses couleurs. La piste ne sait rien de ce que
   * l'option veut dire ; c'est l'appelant qui décide, et seulement pour l'option retenue.
   */
  styleActif?: CSSProperties;
};

export default function Segments<T extends string>({
  options, valeur, onChange, taille = "md", picto = false, ariaLabel, sousEnLigne = false,
}: {
  options: readonly Segment<T>[];
  valeur: T;
  onChange: (v: T) => void;
  /** `sm` pour les en-têtes de panneau, `md` pour les barres de section. */
  taille?: "sm" | "md";
  /**
   * Pastilles carrées, pour des options qui ne portent qu'un pictogramme.
   *
   * Le rembourrage par défaut est réglé sur du texte : 13 px de part et d'autre
   * d'un mot. Autour d'une icône de 14 px, il donne une pastille de 40 sur 26,
   * soit une bande large et basse où le pictogramme flotte. On passe donc à une
   * largeur fixée égale à la hauteur du bouton voisin, ce qui aligne aussi la
   * piste sur la rangée de boutons du bandeau.
   */
  picto?: boolean;
  ariaLabel?: string;
  /**
   * La seconde ligne posée **à côté** du libellé plutôt que dessous.
   *
   * ⚠️ **Deux lignes coûtent 62 px de haut sous le graphique, et ça s'est vu.** Le rendement
   * sous chaque période faisait une piste deux fois et demie plus haute que celle des comptes
   * juste au-dessus, pour la commande qu'on touche le plus. Sur une ligne, la même information
   * tient dans les 22 px de la piste voisine ; elle s'étale en largeur, dont le cadre a
   * toujours à revendre — c'est la hauteur qui manque sous un graphique, jamais la largeur.
   */
  sousEnLigne?: boolean;
}) {
  const petit = taille === "sm";
  // Leur échelle nommée, déjà en v4 : rounded-sm vaut 12 px, rounded-md 14.
  const rayon = petit ? 12 : RAYONS.md;
  const avecSous = options.some(o => o.sous != null);
  const deuxLignes = avecSous && !sousEnLigne;

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
        const eteint = !!o.desactive;
        return (
          <button key={o.valeur} type="button" role="tab" aria-selected={actif}
            aria-disabled={eteint || undefined}
            onClick={() => { if (!eteint) onChange(o.valeur); }} aria-label={o.titre}
            {...o.attributs}
            style={{
              // Sur deux lignes, la hauteur vient du contenu ; le rembourrage vertical
              // remplace la hauteur fixe, et la piste égalise les pastilles entre elles.
              padding: picto ? 0 : deuxLignes ? (petit ? "3px 9px" : "4px 11px") : petit ? "0 10px" : "0 13px",
              width: picto ? (petit ? 26 : 30) : undefined,
              // Sur deux lignes, la hauteur vient du contenu ; à côté du libellé, la seconde
              // ligne est de l'encre à la même taille et tient dans la hauteur nominale.
              height: deuxLignes ? undefined : petit ? 22 : 26,
              borderRadius: rayon,
              border: "none", cursor: eteint ? "not-allowed" : "pointer", whiteSpace: "nowrap",
              fontFamily: FONT, fontSize: petit ? 11 : 12,
              fontWeight: 500, lineHeight: 1.2,
              // Une icône ne se cale pas sur une ligne de base comme du texte :
              // sans ce centrage, un pictogramme se posait deux pixels bas.
              display: "inline-flex", flexDirection: deuxLignes ? "column" : "row",
              alignItems: "center", justifyContent: "center",
              gap: deuxLignes ? 1 : avecSous ? 5 : 0,
              background: actif ? JETONS.segmentActif : "transparent",
              color: actif ? JETONS.segmentEncre : JETONS.segmentInactif,
              boxShadow: actif ? JETONS.segmentOmbre : "none",
              // ⚠️ L'option éteinte garde sa place et son libellé, en retrait : retirée,
              // la rangée changerait de forme selon l'âge du portefeuille.
              opacity: eteint ? 0.35 : 1,
              transition: "background 250ms, color 250ms",
              ...(actif ? o.styleActif : undefined),
            }}
            onMouseEnter={e => { if (!actif && !eteint) e.currentTarget.style.background = JETONS.segmentSurvol; }}
            onMouseLeave={e => { if (!actif) e.currentTarget.style.background = "transparent"; }}>
            <span>{o.libelle}</span>
            {o.sous != null && <span>{o.sous}</span>}
          </button>
        );
      })}
    </div>
  );
}
