"use client";
import { CLAIR, RAYONS } from "@/lib/palette";
import { ancrerLisere } from "@/components/ui/lisere";

/**
 * La croix qui referme une fenêtre.
 *
 * ⚠️ **Elle parlait trois dialectes, un par endroit.** La fenêtre d'opération posait un « ✕ »
 * dans une pastille de rayon 8 avec une bordure ; la déclaration d'un compte, un « × » nu sans
 * fond ni forme ; le panneau de création n'en avait aucune. Trois écritures pour le même
 * geste, dans trois fenêtres qui s'enchaînent.
 *
 * ⚠️ **Le glyphe ne pouvait pas rester un caractère.** « ✕ » et « × » n'ont ni la même chasse
 * ni la même épaisseur d'une police à l'autre, et se décalent verticalement selon les
 * métriques : les deux fenêtres montraient bien deux croix différentes, sans que personne
 * l'ait décidé.
 *
 * ⚠️ **Le bouton est un `boutonSecondaire` rendu carré.** Mêmes ingrédients qu'« Annuler » ou
 * « Retour » — `.novac-bouton-doux` pour le voile d'encre et son survol, aucune bordure,
 * encre pleine, liseré, rayon plein. Seule la boîte change : un carré de 26, donc un cercle.
 * L'encre pleine n'est pas cosmétique ici non plus, c'est elle qui teinte le liseré.
 *
 * ⚠️ **Une version où l'icône portait sa propre pastille a été essayée, puis écartée.** Le
 * dessin comprenait un carré très arrondi dont la croix était évidée ; il fallait alors
 * retirer au bouton son fond et son liseré, faute de quoi on voyait deux pastilles
 * concentriques. Cela le sortait du vocabulaire des autres boutons — c'était une icône
 * autonome, plus un bouton de la famille. Revenu à un signe posé sur la surface commune.
 *
 * ⚠️ **Le signe se rend à 70 % du cercle, et non à sa taille.** Le tracé occupe déjà la
 * moitié centrale de sa boîte — il va de 6 à 18 dans un `viewBox` de 24 —, si bien qu'un
 * `<svg>` rendu à 26 donnait un X de treize pixels : il touchait presque le cercle, et son
 * trait montait à 1,63 px, plus épais que celui des lettres d'à côté. Quatre tailles rendues
 * côte à côte avec « Annuler » : à 18, le trait tombe à 1,13 px — le poids apparent du
 * libellé voisin — et la marge au cercle redevient lisible.
 *
 * ⚠️ **La proportion, et non la valeur.** `taille * 0,7` tient à n'importe quel diamètre ;
 * un 18 écrit en dur aurait donné un signe minuscule le jour où l'on demande un bouton plus
 * grand, et le rapport aurait été à retrouver.
 */
export default function BoutonFermer({
  onClick, titre = "Fermer", taille = 26,
}: {
  onClick: () => void;
  /** Ce que la croix annonce — au survol et aux lecteurs d'écran. */
  titre?: string;
  /** Le diamètre du cercle. Le signe en occupe 70 %, et son tracé la moitié de cela. */
  taille?: number;
}) {
  const signe = Math.round(taille * 0.7);
  return (
    <button type="button" onClick={onClick} aria-label={titre}
      className="novac-lisere novac-bouton-doux" ref={ancrerLisere}
      style={{
        width: taille, height: taille, flexShrink: 0, boxSizing: "border-box", padding: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        borderRadius: RAYONS.plein, border: "none", cursor: "pointer",
        color: CLAIR.texte,
      }}>
      <svg viewBox="0 0 24 24" width={signe} height={signe} fill="none" stroke="currentColor"
        strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  );
}
