"use client";
import { useLayoutEffect, useRef, useState } from "react";
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
  /**
   * La glissière : la pastille retenue est un seul objet qui se déplace, et non un fond
   * qui s'allume ici pendant qu'il s'éteint là.
   *
   * ⚠️ **Un fondu croisé ne dit pas la même chose qu'un glissement.** Deux fonds qui se
   * relaient laissent croire à deux objets ; un seul qui se déplace dit qu'il n'y en a
   * qu'un, et le trajet montre d'où l'on vient. C'est ce que fait la variante « pill » de
   * leur composant, d'où viennent déjà les valeurs de cette piste.
   *
   * ⚠️ **Mesurée après coup, et non calculée.** Les pastilles n'ont pas la même largeur —
   * « 24h » et « Compte courant BNP » — et la retenue change parfois de contenu en le
   * devenant, la période affichant alors son rendement. Additionner des rembourrages
   * aurait donné une glissière juste sur les cas simples et fausse partout ailleurs.
   */
  const piste = useRef<HTMLDivElement>(null);
  const [glissiere, setGlissiere] = useState<{ x: number; y: number; l: number; h: number } | null>(null);
  /**
   * ⚠️ **Le premier placement ne s'anime pas.** Sans cela, la glissière part du coin
   * haut-gauche de la piste à chaque affichage de la page et rejoint l'option retenue —
   * un mouvement que personne n'a demandé, et qui annonce un changement qui n'a pas eu lieu.
   */
  const pose = useRef(false);
  const [anime, setAnime] = useState(false);

  /**
   * ⚠️ **Sans liste de dépendances, et c'est voulu.** La pastille retenue change parfois de
   * contenu *en le devenant* — la période affiche alors son rendement — donc sa largeur ne
   * se déduit d'aucune des valeurs que cet effet pourrait surveiller. Poser `[]` figerait la
   * glissière à sa première mesure ; poser `[valeur]` la laisserait en retard d'un rendu sur
   * le contenu. Ce qui rend l'absence de liste **sûre**, c'est que `mesurer` rend le même
   * objet quand la mesure n'a pas changé : React renonce alors au rendu suivant, et la
   * chaîne s'arrête d'elle-même. C'est précisément ce garde-fou que l'avertissement
   * ci-dessous réclame, et il est là.
   */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const p = piste.current;
    const cible = p?.querySelector<HTMLElement>('[data-retenu="1"]');
    if (!p || !cible) { setGlissiere(null); return; }
    /**
     * ⚠️ **La même mesure doit rendre le même objet, sinon rien ne s'arrête.** Cet effet
     * tourne à chaque rendu — il le faut, la pastille retenue changeant parfois de contenu
     * en le devenant — et poser un objet neuf à chaque passage empêche React de renoncer au
     * rendu suivant : « Maximum update depth exceeded », vu à l'écran dès le premier essai.
     */
    const mesurer = () => {
      const m = { x: cible.offsetLeft, y: cible.offsetTop, l: cible.offsetWidth, h: cible.offsetHeight };
      setGlissiere(prec =>
        prec && prec.x === m.x && prec.y === m.y && prec.l === m.l && prec.h === m.h ? prec : m);
    };
    mesurer();
    if (!pose.current) { pose.current = true; requestAnimationFrame(() => setAnime(true)); }
    /* La piste vit dans des cadres qui changent de largeur : une pastille de texte suit. */
    const oeil = new ResizeObserver(mesurer);
    oeil.observe(p); oeil.observe(cible);
    return () => oeil.disconnect();
  });

  /**
   * ⚠️ **La surface de l'option retenue passe à la glissière, ses lettres restent au
   * bouton.** `styleActif` sert à une option qui porte un résultat — la période active
   * devient la pastille de performance du bandeau — et apporte donc son propre fond, son
   * rayon, son rembourrage. Laissé sur le bouton, ce fond opaque recouvrirait la glissière
   * et le glissement se verrait sauter. On lui prend donc ce qui **peint**, et on lui
   * laisse ce qui **écrit** : le rembourrage reste au bouton, puisque c'est lui qui donne
   * à la glissière sa taille en la lui faisant mesurer.
   */
  const actifOption = options.find(o => o.valeur === valeur);
  const surface = actifOption?.styleActif;
  /**
   * ⚠️ **Aucune clé ne vaut `undefined` ici.** Ce bloc est étalé après le rayon de la
   * glissière : une clé absente n'est pas ignorée, elle **écrase** ce qui précède. La
   * glissière s'est retrouvée avec des coins carrés sur toutes les pistes sans
   * `styleActif`, c'est-à-dire presque toutes — vu à l'écran, rayon calculé à `0px`.
   */
  const peinture: CSSProperties = {
    background: surface?.background ?? surface?.backgroundColor ?? JETONS.segmentActif,
    borderRadius: surface?.borderRadius ?? rayon,
    boxShadow: surface?.boxShadow ?? JETONS.segmentOmbre,
  };
  const ecriture: CSSProperties | undefined = surface && (() => {
    const { background: _f, backgroundColor: _fc, borderRadius: _r, boxShadow: _o, ...reste } = surface;
    return reste;
  })();
  const avecSous = options.some(o => o.sous != null);
  const deuxLignes = avecSous && !sousEnLigne;

  return (
    <div ref={piste} role="tablist" aria-label={ariaLabel} style={{
      position: "relative",
      // gap-0.5 et p-0.5 chez eux, soit 2 px de part et d'autre.
      display: "inline-flex", gap: 2, padding: 2,
      background: JETONS.segmentPiste,
      borderRadius: rayon,
      // La piste ne doit pas s'étirer si elle vit dans un conteneur en flex :
      // elle vaut la largeur de ses options, pas davantage.
      flexShrink: 0, boxSizing: "border-box",
    }}>
      {glissiere && (
        <span aria-hidden="true" style={{
          position: "absolute", left: 0, top: 0,
          width: glissiere.l, height: glissiere.h,
          transform: `translate(${glissiere.x}px, ${glissiere.y}px)`,
          borderRadius: rayon,
          transition: anime ? "transform 250ms, width 250ms, height 250ms, background 250ms" : "none",
          pointerEvents: "none",
          ...peinture,
        }} />
      )}
      {options.map(o => {
        const actif = o.valeur === valeur;
        const eteint = !!o.desactive;
        return (
          <button key={o.valeur} type="button" role="tab" aria-selected={actif}
            aria-disabled={eteint || undefined}
            data-retenu={actif ? "1" : undefined}
            className="nv-segment"
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
              /* ⚠️ Quatre, comme l'écart interne du contenu de variation : cinq ici et
                 quatre à l'intérieur faisaient deux rythmes dans une même pastille. */
              gap: deuxLignes ? 1 : avecSous ? 4 : 0,
              /**
               * La surface retenue est peinte par la glissière, sous les boutons.
               *
               * ⚠️ **Sauf tant qu'elle n'est pas mesurée.** La mesure demande un DOM : au
               * rendu serveur, et à la toute première image avant hydratation, la glissière
               * n'existe pas — et la piste n'aurait alors aucune option en relief. Le
               * bouton garde donc son fond dans ce seul cas. Le passage de l'un à l'autre
               * se fait dans la même image, la mesure ayant lieu avant l'affichage : il n'y
               * a pas de clignotement.
               */
              position: "relative", zIndex: 1,
              background: actif && !glissiere ? peinture.background : "transparent",
              boxShadow: actif && !glissiere ? peinture.boxShadow : undefined,
              color: actif ? JETONS.segmentEncre : JETONS.segmentInactif,
              // ⚠️ L'option éteinte garde sa place et son libellé, en retrait : retirée,
              // la rangée changerait de forme selon l'âge du portefeuille.
              opacity: eteint ? 0.35 : 1,
              transition: "background 250ms, color 250ms",
              ...(actif ? ecriture : undefined),
            }}
            >
            <span>{o.libelle}</span>
            {o.sous != null && <span>{o.sous}</span>}
          </button>
        );
      })}
    </div>
  );
}
