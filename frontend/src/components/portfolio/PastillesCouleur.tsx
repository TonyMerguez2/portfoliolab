"use client";

import { COULEURS_AVATAR } from "@/lib/avatarCouleur";
import { ChoixCouleur } from "@/components/portfolio/ChoixApparence";

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

/**
 * ⚠️ **Ce composant n'est plus qu'un nom : le choix lui-même est celui de l'avatar.** Il avait
 * sa propre rangée — pastilles de vingt-deux pixels, retour à la ligne libre, anneau de
 * sélection creusé à l'intérieur —, écrite avec soin et devenue fausse le jour où la rangée
 * des couleurs d'avatar est passée en écailles : aplats plats, chevauchement d'un quart,
 * aucune marque de sélection. Deux écrans qui proposent « choisir une couleur » se sont
 * remis à ne pas proposer la même chose. Relevé à l'usage — « mêmes couleurs que la page
 * avatar ».
 *
 * ⚠️ **La palette n'a jamais divergé, la présentation si.** `COULEURS_DOSSIER` pointait déjà
 * sur `COULEURS_AVATAR` ; ce qui différait était le dessin, ce qui suffit à faire lire deux
 * systèmes. C'est le défaut que ce fichier disait combattre dans son propre commentaire.
 *
 * ⚠️ **Le nom reste, faute de quoi trois appelants changeraient pour rien.** L'indirection ne
 * coûte rien et garde le vocabulaire du dossier là où il est parlé.
 */
export default function PastillesCouleur({
  couleur, onChoisir,
}: {
  couleur: string;
  onChoisir: (hex: string) => void;
}) {
  return <ChoixCouleur couleur={couleur} onChoisir={onChoisir} />;
}
