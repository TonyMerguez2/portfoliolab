"use client";
import { RAYONS } from "@/lib/palette";
import { FONT } from "@/lib/typography";
import type { Enveloppe } from "@/lib/portfolio";

/**
 * L'enveloppe d'un portefeuille, en pastille sur sa vignette.
 *
 * Un rond blanc à l'angle haut-droit, à la manière d'un compteur de
 * notifications : il chevauche le coin plutôt que de se ranger à côté, ce qui le
 * rattache à la vignette au lieu d'en faire un voisin.
 *
 * ⚠️ **Ce que la pastille affiche est déduit, pas connu.** Aucun champ ne dit
 * dans quel compte les titres sont détenus ; la règle lit ce que le contenu
 * interdit. Voir `enveloppe`, qui porte la mise en garde complète. L'infobulle
 * est donc obligatoire : sans elle, une inférence passerait pour une donnée sur
 * une page de finances. C'est l'appelant qui la fournit, puisque lui seul sait
 * de quel portefeuille il parle.
 *
 * Encre noire sur blanc, sans jeton de palette : la pastille garde le même
 * aspect dans les deux thèmes, comme le dessin du portefeuille qu'elle
 * surmonte, et un rond blanc n'admet qu'une encre.
 */

/**
 * Diamètre du rond par défaut, en pixels.
 *
 * ⚠️ C'est un plancher pratique, pas un choix d'esthétique : trois lettres
 * capitales lisibles demandent un corps d'au moins 6,5 px, et un corps de 6,5 px
 * demande ce diamètre-là. Le réduire ne rend pas la pastille plus discrète, il la
 * rend muette.
 */
const DIAMETRE_DEFAUT = 22;

/**
 * Le sigle du bitcoin, tracé plutôt qu'écrit.
 *
 * Le caractère ₿ (U+20BF) n'est pas dans toutes les fontes système, et une
 * lettre de repli — un « B » nu — dirait autre chose. Un tracé ne dépend de
 * rien.
 *
 * Les deux barres verticales qui dépassent en haut et en bas sont ce qui
 * distingue le sigle d'un B majuscule ; à cette taille elles ne mesurent qu'un
 * pixel et demi, et ce sont pourtant elles qui portent la reconnaissance.
 *
 * D'où les deux réglages, comparés à taille réelle plutôt que devinés : le sigle
 * occupe 72 % du rond et non 62 — à 62 il se lisait comme un B — et son trait
 * descend de 2,4 à 2,2, parce qu'un trait plus épais referme les deux panses au
 * lieu de mieux les dessiner.
 */
function Bitcoin({ taille }: { taille: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none"
      stroke="#000000" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M8 6.4v11.2" />
      <path d="M8 6.4h5.2a2.8 2.8 0 0 1 0 5.6H8" />
      <path d="M8 12h6a2.8 2.8 0 0 1 0 5.6H8" />
      <path d="M10.8 3.6v2.8M14.2 3.6v2.8M10.8 17.6v2.8M14.2 17.6v2.8" />
    </svg>
  );
}

export default function PastilleEnveloppe({
  enveloppe, infobulle, diametre = DIAMETRE_DEFAUT,
}: {
  enveloppe: Enveloppe;
  /** D'où sort l'étiquette. Voir la mise en garde ci-dessus. */
  infobulle: string;
  /** Voir `DIAMETRE_DEFAUT` avant de descendre en dessous. */
  diametre?: number;
}) {
  /** Le débord sur l'angle : un quart du rayon, pour que le chevauchement
   *  garde la même allure quelle que soit la taille. */
  const debord = Math.round(diametre * 0.11);
  return (
    <span title={infobulle} style={{
      position: "absolute", top: -debord, right: -debord, zIndex: 12,
      width: diametre, height: diametre, borderRadius: RAYONS.plein,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "#FFFFFF", color: "#000000",
      // Deux ombres : une portée, qui décolle la pastille du cuir sombre, et un
      // cerne noir très fin. Sans le cerne, le blanc bave sur le fond clair
      // d'une carte d'actif quand la vignette est posée ailleurs.
      boxShadow: "0 1px 4px rgba(0,0,0,0.45), 0 0 0 0.5px rgba(0,0,0,0.25)",
      fontFamily: FONT, cursor: "help", userSelect: "none",
    }}>
      {enveloppe === "Crypto"
        ? <Bitcoin taille={diametre * 0.72} />
        : (
          // 0,34 du diamètre, soit 7,5 px dans un rond de 22 : le corps est
          // contraint par la largeur des trois lettres, pas par la hauteur.
          // L'interlettrage est resserré à −0,04 em, sans quoi « CTO » touche
          // les bords.
          <span style={{ fontSize: diametre * 0.34, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1 }}>
            {enveloppe}
          </span>
        )}
    </span>
  );
}
