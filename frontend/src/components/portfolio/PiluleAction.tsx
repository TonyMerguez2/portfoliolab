"use client";
import { FONT } from "@/lib/typography";
import { RAYONS } from "@/lib/palette";

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
export default function PiluleAction({
  libelle, onClick, fond, fondSurvol, title, angle = 171, placement,
}: {
  libelle: string;
  onClick: () => void;
  /** Le fond, déjà assombri pour que le blanc tienne. Voir `assombrirPourBlanc`. */
  fond: string;
  /** Le même, éclairci — le survol éclaire, il ne fonce pas. */
  fondSurvol: string;
  title?: string;
  /**
   * L'angle du liseré, en degrés.
   *
   * ⚠️ **Il suit les proportions de la pilule** : `180° − atan(hauteur / largeur)`. Pour les
   * 26 pixels de haut et la largeur d'un libellé de deux mots — environ 160 — cela donne les
   * 171° par défaut. Une pilule nettement plus courte le veut plus petit : « Ajouter un
   * compte » tourne à 170°. Voir le calcul dans `globals.css`.
   */
  angle?: number;
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
      style={{
        display: "flex", alignItems: "center", gap: 6, height: 26,
        padding: "0 12px", borderRadius: RAYONS.plein, cursor: "pointer",
        border: "none", background: fond, color: "#FFFFFF",
        ["--nv-lisere-angle" as string]: `${angle}deg`,
        boxShadow: ombre,
        fontFamily: FONT, fontSize: 11, fontWeight: 700,
        whiteSpace: "nowrap", flexShrink: 0,
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
