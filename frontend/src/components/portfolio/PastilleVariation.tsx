import { FONT } from "@/lib/typography";
import { CLAIR } from "@/lib/palette";

/**
 * La pastille d'un pourcentage, et la flèche qui l'accompagne.
 *
 * ⚠️ **Sorties de la page du portefeuille pour être portées ailleurs.** Le bandeau affiche
 * ainsi sa performance — un montant, puis son pourcentage enfermé dans un fond teinté — et
 * le détail d'une écriture doit le dire de la même façon : c'est la même grandeur, une
 * plus-value, à deux échelles. Demandé à l'usage. Recopier la recette une troisième fois
 * aurait suffi à ce que les trois divergent, comme l'ont fait les boutons d'ajout avant
 * qu'ils ne deviennent `PiluleAction`.
 */

/**
 * La taille de référence de la pastille, et le montant qu'elle accompagnait.
 *
 * ⚠️ **Le rapport compte plus que la taille, et c'est lui qu'on conserve.** Relevé sur le
 * bandeau du portefeuille : un montant en 18, sa pastille en 11,5 — soit **0,639**. Posée
 * telle quelle à côté d'un montant de 12,5, la même pastille de 11,5 monte à 0,92 : elle
 * pèse alors presque autant que le chiffre qu'elle précise, et l'ordre de lecture s'inverse.
 * Signalé à l'usage.
 *
 * ⚠️ **Chaque appel dit donc la taille de *son* montant, pas celle de sa pastille.** La
 * proportion se déduit, elle ne se règle pas — c'est ce qui l'empêche de dériver d'un
 * endroit à l'autre le jour où l'un des deux montants change de corps.
 */
const TAILLE_REFERENCE = 11.5;
const MONTANT_REFERENCE = 18;
const RAPPORT = TAILLE_REFERENCE / MONTANT_REFERENCE;

/**
 * Le fond teinté d'une valeur chiffrée.
 *
 * ⚠️ **Alignement sur la ligne de base, et non au centre.** Un pictogramme centré
 * verticalement flotte à côté de chiffres qui, eux, reposent sur leur ligne de base : le
 * triangle paraissait glisser vers le haut. En `baseline`, un élément remplacé comme un SVG
 * pose son bord inférieur sur cette ligne — la base de la flèche et le pied des chiffres
 * tombent donc au même niveau.
 */
export const pastille = (couleur: string, taille = TAILLE_REFERENCE): React.CSSProperties => {
  const k = taille / TAILLE_REFERENCE;
  return {
    fontFamily: FONT, fontSize: taille, fontWeight: 600, color: CLAIR.carte,
    background: couleur, borderRadius: 999, padding: `${3 * k}px ${9 * k}px`,
    whiteSpace: "nowrap", lineHeight: 1.2,
    display: "inline-flex", alignItems: "baseline", gap: 4 * k,
  };
};

/**
 * La flèche de tendance.
 *
 * ⚠️ **Sa boîte épouse le dessin au millième près.** Le cadrage `2.25 6.25 19.5 11.5` donne
 * 8,479 px au-dessus de la ligne de base pour cette police à cette taille : posée sur cette
 * ligne par l'alignement de la pastille, la flèche monte exactement au sommet du chiffre
 * voisin et s'arrête exactement sur son pied. La largeur suit le rapport de la boîte, faute
 * de quoi le dessin s'étirerait.
 *
 * ⚠️ **Un seul cadrage pour les deux sens** : ces deux chemins occupent la même bande,
 * montée et descente confondues. Vérifié plutôt que supposé.
 *
 * ⚠️ **`overflow: visible`, sinon le trait est rasé sur ses quatre bords.** Un SVG masque
 * par défaut ce qui dépasse de sa boîte. Or celle-ci épouse le dessin : les bouts arrondis
 * arrivent *pile* sur le bord, et le demi-pixel d'antialiasing qui les adoucit tombe du
 * mauvais côté de la limite. Signalé à l'usage — la flèche paraissait coupée à droite.
 * Élargir la boîte aurait aussi réglé le rognage, mais en désaccordant la hauteur du dessin
 * de celle des chiffres : c'est le masquage qu'il faut lever, pas le cadrage qu'il faut
 * fausser.
 */
export function FlecheTendance({ hausse, taille = TAILLE_REFERENCE }:
  { hausse: boolean; taille?: number }) {
  /* ⚠️ Le dessin suit la police à l'échelle près : c'est le rapport qui pose la flèche au
     sommet et au pied du chiffre, pas les valeurs absolues. Les figer aurait donné une
     flèche de taille normale à côté de chiffres réduits. */
  const k = taille / TAILLE_REFERENCE;
  return (
    <svg viewBox="2.25 6.25 19.5 11.5" fill="none" stroke="currentColor" strokeWidth={1.5}
      strokeLinecap="round" strokeLinejoin="round" width={14.38 * k} height={8.48 * k}
      aria-hidden="true" style={{ flexShrink: 0, overflow: "visible" }}>
      <path d={hausse
        ? "m3 17 6-6 4 4 8-8m0 0h-7m7 0v7"
        : "m3 7 6 6 4-4 8 8m0 0v-7m0 7h-7"} />
    </svg>
  );
}

/**
 * Un pourcentage de variation, flèche comprise.
 *
 * ⚠️ **Le signe est porté par le chiffre *et* par la flèche, et ce n'est pas redondant.**
 * La flèche se lit d'un coup d'œil, le signe se lit quand on s'arrête sur la valeur ; l'un
 * sert le survol de la page, l'autre la lecture attentive.
 */
export default function PastilleVariation({ pct, couleur, surMontantDe = MONTANT_REFERENCE }: {
  pct: number;
  couleur: string;
  /** La taille du montant que la pastille accompagne. Voir `RAPPORT`. */
  surMontantDe?: number;
}) {
  const taille = surMontantDe * RAPPORT;
  return (
    <span style={pastille(couleur, taille)}>
      <FlecheTendance hausse={pct >= 0} taille={taille} />
      {pct >= 0 ? "+" : ""}{pct.toFixed(2)} %
    </span>
  );
}
