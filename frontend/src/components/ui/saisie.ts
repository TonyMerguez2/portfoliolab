import { FONT } from "@/lib/typography";
import { CLAIR, RAYONS } from "@/lib/palette";

/**
 * Le vocabulaire des formulaires : l'étiquette, le champ, les deux boutons.
 *
 * ⚠️ **Relevé sur le formulaire de déclaration d'un compte, qui l'avait défini pour lui
 * seul.** Ces constantes vivaient en tête de `FormulaireCompte`, non exportées : la fenêtre
 * de saisie d'une opération — le second endroit de l'application où l'on remplit des champs
 * — ne pouvait donc que les réinventer, et elle les avait réinventées autrement. Demandé à
 * l'usage que les deux se ressemblent.
 *
 * ⚠️ **Ce que la fenêtre d'opération disait en dur mérite d'être nommé :** elle écrivait ses
 * fonds en `rgba(255,255,255,…)`, c'est-à-dire juste en thème sombre et faux en clair, là où
 * le formulaire de compte passe par les jetons depuis longtemps. Le partage corrige au
 * passage.
 */

/** L'intitulé au-dessus d'un champ : petites capitales espacées, encre faible. */
export const etiquette: React.CSSProperties = {
  fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
  color: CLAIR.texteFaible, textTransform: "uppercase",
};

/**
 * Le rayon de tout ce qui se pose **dans** une fenêtre.
 *
 * ⚠️ **Celui du conteneur, et non un rayon d'élément.** Les champs portaient `xs`, soit 6 :
 * une pastille anguleuse dans un panneau très arrondi, et l'œil lit deux langages dans le
 * même cadre. `Cadre` donne à sa carte intérieure `RAYON − CADRE`, soit 24 − 6 = 18 ; les
 * surfaces qu'elle contient reprennent cette valeur.
 */
export const RAYON_SAISIE = RAYONS.lg;

/**
 * La hauteur de tout ce qui se pose en ligne dans une fenêtre : champ, bouton, bandeau.
 *
 * ⚠️ **Une constante parce que quatre valeurs voisines cohabitaient.** Relevé dans la
 * fenêtre d'opération : les champs faisaient 39, la barre de recherche d'actif 40, les
 * sens « Achat » et « Vente » 41, les boutons du bas 38. Aucun de ces écarts n'était voulu
 * — ils tombaient du remplissage de chacun, `10px` ici, `9px` là, `13px` ailleurs, et de la
 * hauteur de ligne du texte qu'il portait. Trois pixels ne se nomment pas, mais empilés
 * dans une même colonne ils se voient : les bords gauches ne s'alignaient plus d'une rangée
 * à l'autre. Signalé à l'usage.
 *
 * ⚠️ **40 plutôt que 38, parce que c'est la valeur qu'imposait déjà la barre d'actif.** Elle
 * porte un logo de 24 et sept pixels de marge de part et d'autre ; la réduire aurait
 * demandé de rapetisser le logo, qu'on venait au contraire d'agrandir. Les autres n'avaient
 * pas de contrainte propre — c'est donc à elles de céder.
 *
 * ⚠️ **Elle vaut deux fois le rayon, et c'est ce qui fait la pilule.** À 40 de haut,
 * `RAYON_SAISIE` de 18 laisse deux pixels de droit de chaque côté ; l'œil lit un demi-cercle.
 * Changer l'une sans l'autre casserait la forme commune à toute la fenêtre.
 */
export const HAUTEUR_SAISIE = 40;

/**
 * La géométrie d'un champ de saisie.
 *
 * ⚠️ **Le fond, le bord et les états vivent dans `.novac-surface-saisie`.** Seule la
 * géométrie est ici : un `:hover` ne s'écrit pas en style en ligne, et les trois états de
 * ces surfaces sont précisément ce qu'on veut voir. La classe est donc **obligatoire** en
 * plus de ce style — posé seul, il donne un champ sans fond ni bord.
 *
 * ⚠️ **La hauteur est imposée, le remplissage vertical ne fait plus que la remplir.** Il la
 * décidait, et la décidait donc différemment selon la police de chaque champ. Un `<input>`
 * centre sa valeur verticalement de lui-même, si bien que fixer la boîte ne déplace pas le
 * texte.
 */
export const champ: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", fontFamily: FONT, fontSize: 12.5,
  height: HAUTEUR_SAISIE, padding: "0 12px", borderRadius: RAYON_SAISIE,
  color: CLAIR.texte, outline: "none",
};

/**
 * La géométrie de la **pilule d'action** — celle d'« Ajouter un compte » et d'« Ajouter une
 * opération », désignée à l'usage comme le modèle des boutons de pied de fenêtre.
 *
 * ⚠️ **Extraite de `PiluleAction`, qui la gardait pour elle.** Elle y était écrite en clair
 * au milieu du composant ; le bouton de tri de la grille l'avait donc recopiée — mêmes 26
 * pixels, même rayon plein, même rembourrage de 12 —, et les pieds de fenêtre en avaient
 * inventé une troisième. Trois écritures pour une seule forme.
 *
 * ⚠️ **Rayon plein et non `RAYON_SAISIE` : ce n'est pas une surface, c'est un geste.** Les
 * champs partagent 18 parce qu'ils se lisent comme des trous dans le panneau ; une pilule
 * d'action se lit comme un objet posé dessus, et son arrondi vaut la moitié de sa hauteur.
 *
 * ⚠️ **Vingt-six pixels contre les quarante d'un champ, et l'écart est voulu.** Une commande
 * ne pèse pas autant qu'une saisie : la rangée du bas doit se laisser survoler, pas
 * remplir. C'est la raison pour laquelle `HAUTEUR_SAISIE` ne s'applique pas ici — les deux
 * mesures répondent à deux questions différentes.
 */
export const HAUTEUR_PILULE = 26;

/** Le tronc commun : forme, taille, alignement. La teinte et l'encre viennent après. */
export const pilule: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  boxSizing: "border-box", height: HAUTEUR_PILULE, padding: "0 12px",
  borderRadius: RAYONS.plein, border: "none", fontFamily: FONT,
  whiteSpace: "nowrap", flexShrink: 0, cursor: "pointer",
};

/**
 * Le bouton qui engage : plein, encre blanche, teinte donnée par l'appelant.
 *
 * ⚠️ **C'est la pilule d'action, à l'icône près.** Même hauteur, même rayon plein, même
 * corps de 11 en gras, même ombre portée d'un pixel — demandé à l'usage. Ce qu'il n'a pas,
 * c'est le signe « plus » : celui-ci annonce qu'on ajoute une chose de plus, alors qu'un
 * pied de fenêtre conclut ce qui est déjà commencé.
 *
 * ⚠️ **`inline-flex` centré, et non du remplissage vertical.** Avec une hauteur imposée, un
 * `padding` vertical ne centre plus rien : il ne fait que rogner la boîte par le haut.
 */
export const boutonPrincipal = (couleur: string, actif = true): React.CSSProperties => ({
  ...pilule,
  fontSize: 11, fontWeight: 700, color: "#FFFFFF",
  background: couleur, opacity: actif ? 1 : 0.45,
  boxShadow: "0 1px 3px rgba(0,0,0,0.30)",
  cursor: actif ? "pointer" : "not-allowed",
});

/**
 * Le bouton qui renonce : la même pilule, sans aplat.
 *
 * ⚠️ **Relevé sur le bouton de tri de la grille d'actifs, désigné à l'usage.** Sa recette
 * tient en trois traits : **aucun fond**, aucune bordure ni cerne, et l'encre **pleine**.
 * Rien ne le détache de la surface sauf le liseré. Il ne renonce donc pas à exister — il
 * renonce à être souligné.
 *
 * ⚠️ **L'encre pleine n'est pas un détail de lisibilité, c'est ce qui dessine le contour.**
 * `.novac-lisere::before` se teinte à `currentColor` : une encre atténuée n'atténue pas
 * seulement le texte, elle efface le liseré. C'était le défaut d'une version intermédiaire —
 * encre secondaire, donc liseré à 24 % d'un gris déjà pâle, c'est-à-dire rien.
 *
 * ⚠️ **Un voile, et non un aplat — la nuance a demandé trois essais.** Le liseré s'éteint
 * sur deux coins opposés : seul, il laisse la pilule *ouverte*, et il n'y avait « que les
 * bords de visible ». Un aplat opaque (`--nv-bord`) la refermait, mais faisait du bouton qui
 * renonce une surface pleine, aussi présente que celui qui engage. Les candidats ont été
 * rendus côte à côte : 4 % referme la forme sans presque rien montrer, 9 % commence à
 * concurrencer le bouton principal, 6 % se lit comme une surface sans peser.
 *
 * ⚠️ **Ce fond vit dans `.novac-bouton-doux`, et la classe est obligatoire.** Il était écrit
 * ici ; un style en ligne ne connaît pas `:hover`, et le survol est précisément ce qu'on
 * veut voir sur un bouton. Le laisser en ligne *et* déclarer le survol dans la feuille
 * n'aurait rien donné non plus — la règle en ligne l'emporte. Posé sans la classe, ce style
 * donne donc un bouton sans fond. C'est le même contrat que `champ` avec
 * `.novac-surface-saisie`, pour la même raison.
 *
 * ⚠️ **Pas de bordure, et ce n'est pas qu'une question de goût : elle dédoublait le
 * liseré.** `.novac-lisere::before` est posé en `inset: 0`, ce qui le place dans la
 * **boîte de rembourrage** ; une bordure d'un pixel lui donne une boîte plus courte de deux
 * pixels tout en lui léguant le rayon par `inherit`. Les deux arcs ne se superposent alors
 * plus — on voyait deux traits parallèles se croiser dans les angles. Relevé à l'écran :
 * « y'a 2 bords qui se superposent ». Si un cerne redevenait nécessaire, il faudrait le
 * peindre en `box-shadow: inset`, qui ne prend pas de place, et surtout pas en `border`.
 */
export const boutonSecondaire: React.CSSProperties = {
  ...pilule,
  fontSize: 11, fontWeight: 500,
  color: CLAIR.texte,
};
