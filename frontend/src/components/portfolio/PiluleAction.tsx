"use client";
import { ancrerLisere } from "@/components/ui/lisere";
import { pilule } from "@/components/ui/saisie";

/**
 * La pilule d'ajout : le geste « déclarer une chose de plus », partout où il se présente.
 *
 * ⚠️ **Un composant parce qu'il y en avait déjà trois copies, et qu'elles divergeaient.**
 * « Ajouter un compte » et « Ajouter une opération » vivaient dans la page, recopiées l'une
 * sur l'autre — le commentaire de la seconde disait d'ailleurs qu'elle était « la jumelle de
 * la première, et pas une cousine », ce qui est exactement l'aveu qu'une règle était tenue à
 * la main. La troisième, dans le résumé des transactions, ne l'avait pas suivie : bord
 * accentué, fond translucide, encre bleue, rayon de 9 — un autre bouton pour le même geste.
 * Signalé à l'usage.
 *
 * ⚠️ **Le fond vient de l'avatar et se reçoit en propriété, il ne se calcule pas ici.** La
 * teinte est choisie par l'épargnant et vit dans la page, qui la sert aussi à la courbe et
 * au personnage. La recalculer dans le composant aurait fait une deuxième source pour une
 * même couleur — le défaut que la page s'interdit déjà explicitement. Elle arrive donc déjà
 * assombrie par `assombrirPourBlanc`, ce qui est ce qui garantit que le blanc ci-dessous
 * reste lisible quelle que soit la couleur choisie.
 */

/**
 * ⚠️ **Une seule taille, et c'est une décision, pas un manque.** La page d'accueil a eu droit
 * à une grande version — 46 pixels de haut, puis 38 —, l'idée étant qu'une action seule au
 * milieu d'un écran vide demande plus de présence qu'une commande de barre d'outils. Essayée,
 * puis abandonnée à l'usage : c'est le même geste, il en veut le même bouton. Une échelle à
 * deux points, c'est déjà deux versions qui peuvent diverger.
 *
 * ⚠️ **Ce que la landing en avait fait de son côté**, avant de reprendre ce composant : rayon
 * de saisie au lieu du rayon plein, `+` écrit au clavier en guise d'icône, interlettrage, et
 * un survol qui soulevait le bouton d'un pixel au lieu de l'éclairer. Le même geste dans un
 * autre dialecte — la quatrième copie, exactement ce que ce fichier existe pour empêcher.
 */
export default function PiluleAction({
  libelle, onClick, fond, fondSurvol, title, placement,
}: {
  libelle: string;
  onClick: () => void;
  /** Le fond, déjà assombri pour que le blanc tienne. Voir `assombrirPourBlanc`. */
  fond: string;
  /** Le même, éclairci — le survol éclaire, il ne fonce pas. */
  fondSurvol: string;
  title?: string;
  /**
   * De quoi la **placer**, et rien d'autre.
   *
   * ⚠️ **Réservé au positionnement — marges, alignement — jamais à l'apparence.** C'est la
   * seule porte laissée ouverte, et elle est étroite exprès : rouvrir le fond, le rayon ou
   * la graisse ici rendrait au composant le défaut qu'il vient de corriger, à savoir trois
   * boutons qui se ressemblent sans être les mêmes. Le seul usage à ce jour est le
   * `marginLeft: "auto"` qui pousse « Ajouter un compte » au bout de sa rangée.
   */
  placement?: React.CSSProperties;
}) {
  const ombre = "0 1px 3px rgba(0,0,0,0.30)";
  const ombreSurvol = "0 2px 6px rgba(0,0,0,0.35)";
  return (
    <button type="button" onClick={onClick} title={title} className="novac-lisere"
      ref={ancrerLisere}
      /* ⚠️ La forme vient de `pilule`, dans `ui/saisie` : elle était écrite ici, et les
         pieds de fenêtre comme le bouton de tri de la grille l'avaient recopiée chacun de
         leur côté. Ne restent en propre que la teinte, l'ombre et le survol. */
      style={{
        ...pilule,
        background: fond, color: "#FFFFFF",
        boxShadow: ombre,
        fontSize: 11, fontWeight: 700,
        transition: "background 150ms, box-shadow 150ms",
        ...placement,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = fondSurvol;
        e.currentTarget.style.boxShadow = ombreSurvol;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = fond;
        e.currentTarget.style.boxShadow = ombre;
      }}>
      {/**
        * ⚠️ **Un signe « plus », et non l'icône de l'objet ajouté.** Le glyphe qui nomme la
        * section n'a rien à faire sur le bouton qui l'alimente : là on dit *ce qu'on
        * regarde*, ici *ce qu'on fait*.
        *
        * ⚠️ **Rendu à 14 et non à 24**, la taille d'export du modèle : elle dépasserait la
        * pilule, dont la hauteur tient celle de toute la rangée.
        */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={1.5}
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 5v14m-7-7h14" />
      </svg>
      {libelle}
    </button>
  );
}
