"use client";

import { COULEURS_AVATAR } from "@/lib/avatarCouleur";
import { CLAIR } from "@/lib/palette";

/**
 * Le choix de la couleur d'un dossier.
 *
 * ⚠️ **Sorti du formulaire le jour où un second écran a dû l'offrir.** Les dossiers déduits
 * — PEA, compte-titres, crypto — n'ont pas de formulaire de déclaration mais se recolorent
 * quand même. Deux rangées de pastilles recopiées auraient divergé sur la taille, sur
 * l'anneau de sélection ou sur la palette elle-même, et deux écrans qui proposent « la
 * couleur du dossier » doivent proposer exactement la même chose.
 *
 * ⚠️ **La palette est celle de l'avatar, et non une seconde.** Elle couvre le tour du
 * cercle chromatique à clarté et saturation comparables — c'est déjà éprouvé — et deux
 * palettes auraient fini par se croiser sur un même écran.
 */
export const COULEURS_DOSSIER = COULEURS_AVATAR;

export default function PastillesCouleur({
  couleur, onChoisir, cote = 22,
}: {
  /** La couleur retenue, mise en valeur par un anneau. */
  couleur: string;
  onChoisir: (hex: string) => void;
  /** Le diamètre d'une pastille. */
  cote?: number;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {COULEURS_DOSSIER.map(c => (
        <button key={c.hex} type="button" onClick={() => onChoisir(c.hex)}
          aria-label={c.nom} title={c.nom}
          /**
           * ⚠️ **La sélection se dit par un anneau détaché, pas par un liseré.** Sur une
           * pastille de vingt-deux pixels, un bord de la même famille que le fond
           * disparaît ; l'anneau passe par la couleur de la carte, donc se voit sur
           * n'importe quelle teinte.
           */
          style={{
            width: cote, height: cote, borderRadius: "50%", cursor: "pointer",
            background: c.hex, border: "none",
            boxShadow: couleur === c.hex
              ? `0 0 0 2px ${CLAIR.carte}, 0 0 0 4px ${c.hex}` : "none",
          }} />
      ))}
    </div>
  );
}
