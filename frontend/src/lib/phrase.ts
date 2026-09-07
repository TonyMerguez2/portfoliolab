/**
 * La phrase d'accueil et ses verbes, partagés par les deux entrées du site.
 *
 * ⚠️ **Un seul endroit, parce qu'il y a deux pages.** L'accueil et la porte de l'alpha
 * annoncent la même chose ; les écrire deux fois, c'est accepter qu'elles divergent au premier
 * changement de mot. La page publique et la page derrière le code doivent promettre
 * exactement la même chose — c'est précisément ce que quelqu'un vérifie en franchissant la
 * porte.
 */

/**
 * ⚠️ **L'espace final n'est pas une coquille.** Un `<br />` peut suivre, et il colle les deux
 * morceaux dans le texte du nœud : sans cette espace, un lecteur d'écran prononce
 * « patrimoine,et ». Elle ne se voit pas — une espace en fin de ligne est absorbée par la mise
 * en page.
 */
export const PHRASE_HAUT = "Tout votre patrimoine, ";
export const PHRASE_BAS = "et ce qui le fait ";

/**
 * ⚠️ **Les cinq verbes ne disent pas la même chose, et c'est voulu.** « Évoluer » et
 * « changer » décrivent, « performer » et « grandir » promettent, « résister » rassure. La
 * phrase change donc de registre au fil du cycle. Choisis à la demande, après que j'aie
 * signalé qu'un verbe de gain se lit comme une promesse de rendement sur un produit qui écrit
 * en pied de page ne donner aucun conseil en investissement.
 */
export const VERBES = ["évoluer", "performer", "résister", "grandir", "changer"];
