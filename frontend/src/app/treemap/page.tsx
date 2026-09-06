"use client";
import CarteChaleur from "@/components/charts/CarteChaleur";
import Cadre from "@/components/ui/Cadre";

/**
 * La page des marchés : la carte de chaleur, dans le cadre de l'application.
 *
 * ⚠️ **`Cadre` et non un conteneur écrit ici — j'en avais fait une quatrième copie.** J'avais
 * posé à la main un fond, un liseré et un rayon choisis au jugé. Or ce composant existe
 * précisément pour ça, et son propre en-tête le dit : « il y en avait trois exemplaires — le
 * tableau de bord, l'onglet Transactions, l'onglet Analyse — chacun avec ses propres valeurs
 * […] Trois copies d'une même idée finissent toujours par diverger. » La mienne aurait été la
 * quatrième, et elle divergeait déjà : un seul anneau au lieu de deux, sans le voile ni le flou
 * de l'anneau extérieur.
 *
 * ⚠️ **La géométrie est celle de la vue Résumé, reprise et non recalculée.** Même retrait
 * (`8px 10px 10px`), même `Cadre` élastique. C'est ce qui garantit que le panneau descend
 * exactement aussi bas que la rangée de dossiers du tableau de bord : les deux pages n'ont pas
 * une mesure commune, elles ont la **même** construction. Il descendait auparavant dix pixels
 * plus bas, faute de la bande de huit pixels que le Résumé pose en tête.
 *
 * ⚠️ **La largeur est en pour-cent et non en `100vw`, et c'est un défaut mesuré.** Le contenu
 * vit dans `.novac-shell`, qui lui pose une marge gauche de la largeur du rail. Une largeur de
 * `100vw` ignore cette marge : la page dépassait d'exactement soixante-huit pixels, ce qui
 * ouvrait une **barre de défilement horizontale** et poussait les tuiles sous le rail. Mesuré :
 * `scrollWidth` 631 pour une fenêtre de 563.
 */

/** Le retrait de la vue Résumé du tableau de bord. */
const MARGE = 10;
/** La bande du bandeau : le champ de recherche y est posé en fixe, hors du flux. */
const BANDEAU = 62;

export default function TreemapPage() {
  return (
    <div style={{
      width: "100%", height: "100vh", boxSizing: "border-box",
      paddingTop: BANDEAU, overflow: "hidden",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{
        flex: 1, minHeight: 0,
        padding: `8px ${MARGE}px ${MARGE}px`,
        display: "flex",
      }}>
        <Cadre style={{
          flex: "1 1 0", minHeight: 0,
          /* ⚠️ **`minWidth: 0`, sans quoi le cadre déborde de la page.** Un élément de flex a
             `min-width: auto` : il refuse de descendre sous la largeur intrinsèque de son
             contenu. Or la barre d'outils, avec ses sept boutons, sa légende et ses commandes
             de zoom, est large. Mesuré : le cadre faisait 664 px dans une zone de 608, et
             sortait de la fenêtre par la droite. */
          minWidth: 0,
          display: "flex", flexDirection: "column", overflow: "hidden",
          /* Aucun rembourrage : la carte va jusqu'au liseré. Les blocs du Résumé posent
             `13px 15px` parce qu'ils portent du texte ; un pavage, lui, n'a pas de marge
             intérieure à respecter — chaque pixel rendu est une tuile de plus. */
          padding: 0,
        }}>
          <CarteChaleur />
        </Cadre>
      </div>
    </div>
  );
}
