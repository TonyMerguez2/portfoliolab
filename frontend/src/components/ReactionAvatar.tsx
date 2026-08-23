import { marqueAvatar } from "@/lib/avatarEtats";

/**
 * Rend expressif tout ce qu'il enveloppe.
 *
 * ⚠️ **Un enrobage transparent à la mise en page.** `display: contents` retire
 * l'élément du calcul de disposition sans le retirer de l'arbre : il ne casse donc ni
 * une grille, ni un `flex`, ni un `gap` — tout en restant trouvable par le `closest`
 * qui remonte depuis la souris. C'est ce qui permet de rendre expressif un composant
 * qui ne transmet pas les attributs qu'on lui passe, sans avoir à le modifier.
 *
 * ⚠️ **Aucun écouteur n'est posé ici.** Un `onMouseEnter` par carte, sur une grille de
 * cinquante lignes, ce sont cinquante abonnements et autant de rendus à surveiller. Un
 * attribut ne coûte rien : c'est le fournisseur qui écoute, une seule fois, sur le
 * document.
 */
export default function ReactionAvatar({
  variation, suivi, etat, children,
}: {
  /** La variation en pourcentage — le visage s'accorde au résultat. */
  variation?: number | null;
  /**
   * Le chiffre dont on surveille l'évolution, si ce n'est pas `variation`.
   *
   * ⚠️ **À renseigner dès que `variation` est une grandeur dérivée** — un écart à une
   * moyenne, un rang, un score. La colère se déclenche sur une **marche en points de
   * pourcentage** : sur une échelle qui n'est pas celle d'une variation de cours, elle
   * partirait à chaque relecture. Voir `marqueAvatar`.
   */
  suivi?: number | null;
  /** Un état imposé, quand la variation n'a pas de sens. */
  etat?: string;
  children: React.ReactNode;
}) {
  /* ⚠️ Un état imposé ne publie **pas** de variation : il n'y a pas de chiffre derrière, et
     en inventer un ferait croire au fournisseur qu'il y a une valeur à suivre. */
  return (
    <span style={{ display: "contents" }}
      {...(etat ? { "data-avatar": etat } : marqueAvatar(variation, suivi ?? variation))}>
      {children}
    </span>
  );
}
