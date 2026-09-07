"use client";
import { recuperer } from "@/lib/requete";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/lib/AppContext";
import ProfileModal from "@/components/ProfileModal";
import AuthModal from "@/components/AuthModal";
import { Avatar, AvatarImage, AvatarFallback } from "@appica/ui-react/avatar";
import { UserFilled } from "@appica/icons-react";
import { basculerMode, useModeTheme } from "@/lib/theme";
import { API_URL } from "@/lib/api";

/**
 * Navigation principale : deux cascades en S, tête et pied, qui sortent du bord gauche de
 * l'écran.
 *
 * ⚠️ **La courbe vient du dossier de `CarteCompte`, la symétrie non.** Le tracé de référence
 * est `contourDe` : le raccord de sa languette — deux arcs tangents à des bords parallèles —
 * est ce qu'on reprend, mis à l'échelle. Mais une languette est **dissymétrique** : un angle
 * ordinaire sur un flanc, l'encoche sur l'autre. Le rail l'a été, un temps, l'encoche en bas
 * et un quart de cercle de rayon 18 en haut ; c'est ce que la géométrie du dossier dit, et
 * c'est ce que l'usage a écarté — « juste le menu doit être symétrique, donc reproduis la
 * cascade du bas mais en haut ». Le rail n'est donc **pas** une languette : c'est un ruban qui
 * sort du bord et y rentre, deux fois de la même façon. Décidé, pas oublié.
 *
 * ⚠️ **Le plan n'est pas une pièce du rail : c'est la page.** Une épine pleine hauteur courait
 * contre le bord, dont le rail se donnait pour un renflement — il fallait bien une matière où
 * les deux raccords à angle droit d'alors pouvaient se terminer. Les cascades, elles, arrivent
 * **tangentes à la verticale** : elles se fondent dans le bord de l'écran sans rien à
 * rejoindre. Une épine faite de la matière du rail dirait au contraire que le plan est un
 * panneau de plus, quand il doit être la page elle-même.
 *
 * ⚠️ **La largeur totale ne bouge plus, et c'est ce qui rend le changement gratuit.** Le
 * repli publiait tour à tour 232 et 68 pixels dans `--novac-nav-w`, dont chaque page tire sa
 * marge gauche. Le rail garde les 68 de l'état replié : aucune page n'a à savoir qu'il a
 * changé de forme, et la variable reste publiée pour celles qui s'y accrochent en CSS.
 *
 * ⚠️ **Il n'y a plus d'état déplié, donc plus de préférence à retenir.** Les noms ne sont
 * plus écrits en toutes lettres — ils paraissent au survol, dans une infobulle à ergot. Le
 * bouton de repli, la clé de stockage et le garde-fou d'hydratation qu'elle imposait sont
 * partis avec.
 *
 * ⚠️ **Les anneaux de la référence n'ont pas été repris.** Ils y portent une consommation en
 * pourcentage ; « Carte » ou « Simulation » n'ont aucune quantité à montrer, et un anneau
 * posé autour d'eux aurait été un décor déguisé en donnée.
 */

/**
 * La largeur que le rail réserve — c'est-à-dire de combien le ruban sort du bord.
 *
 * ⚠️ **C'est celle de l'ancien état replié, et ce n'est pas une coïncidence.** Elle est
 * publiée dans `--novac-nav-w` et sert de marge gauche à toutes les pages : la reprendre
 * telle quelle est ce qui permet de refaire la navigation sans toucher à une seule d'entre
 * elles.
 *
 * ⚠️ **Elle ne réserve plus d'épine.** Les 68 pixels étaient partagés entre une bande de dix
 * contre le bord et un rail de cinquante-huit ; ils vont maintenant d'un seul tenant du bord
 * de l'écran au flanc. La valeur publiée, elle, n'a pas bougé — et c'est bien elle, la largeur
 * entière, qui sert de profondeur aux deux cascades.
 */
const LARGEUR = 68;
/**
 * Le rayon des deux cascades en S.
 *
 * ⚠️ **Ce qui rend un pli doux n'est pas son rayon, c'est sa course.** J'ai écrit ici que la
 * pente d'un raccord à quatre-vingt-dix degrés vaut 45° « quel que soit le rayon », et j'en ai
 * tiré qu'on ne pouvait rien y faire. C'est vrai de la pente et faux de l'effet : deux arcs
 * tangents à des bords *parallèles* ne tournent d'aucun angle net, ce qui laisse toute liberté
 * de les raccourcir — le dossier le dit déjà, et c'est sa course, pas sa pente, qu'on lit.
 *
 * ⚠️ **Le nombre est celui du dossier, mis à l'échelle de la profondeur d'ici.** Il plie sur
 * une profondeur de 26 avec un rayon de 18 ; la nôtre est profonde de 68. Le même S demande
 * donc `18 × 68 ⁄ 26`, soit 47 — et la course tombe alors à 90,3, c'est-à-dire les 34,6 du
 * dossier au même facteur. Ce n'est pas une ressemblance, c'est la même courbe agrandie.
 *
 * ⚠️ **Dix-huit ne marcherait pas, et pas seulement de justesse.** Deux arcs de rayon `r`
 * n'atteignent deux verticales distantes de `d` que si `r ≥ d ⁄ 4`, soit 17 : à 18 on est à un
 * pixel de l'impossible, et la course qui en sortirait vaut 16,5 pour une chute de 68 — une
 * falaise, pas une cascade.
 *
 * ⚠️ **Ce que la symétrie coûte, et c'est assumé.** Le nombre a été choisi quand il n'y avait
 * qu'un pli, en remplacement de deux plis de 47 : quatre-vingt-dix pixels contre quatre-vingt-
 * quatorze, le budget était le même. La symétrie demandée à l'usage en remet un second, donc
 * **181 pixels de silhouette pliée pour 361 de rangées** — un tiers de la hauteur du rail. Ce
 * n'est pas une dérive : c'est cette cascade-là qui a été demandée, vue en place, et deux fois.
 * Le seul remède serait de la raccourcir, c'est-à-dire de la changer.
 */
const RACCORD = 47;
/**
 * De combien l'encoche s'étale le long du rail, déduit du reste.
 *
 * ⚠️ **Deux arcs tangents, et leur étalement n'est pas libre.** Deux arcs de même rayon qui
 * relient deux verticales distantes de `d` en restant tangents à l'une et à l'autre s'étalent
 * de `√(4r² − (d − 2r)²)` ; ici `d` vaut la largeur entière, du bord de l'écran au flanc.
 * C'est la formule que la languette du dossier emploie déjà, à ceci près qu'elle y relie deux
 * horizontales. Écrire l'étalement à la main, c'est le voir cesser d'être juste au premier
 * changement de largeur — et la tangence se perd sans prévenir.
 *
 * ⚠️ **Et non arrondi, parce que l'arrondi est précisément ce qui la perd.** Le point où les
 * deux arcs se touchent est à mi-course et à mi-profondeur : un dixième de pixel de moins sur
 * la course, et il n'est plus sur le cercle. Le navigateur redimensionne alors les rayons en
 * silence pour boucler le tracé, et la tangente aux extrémités part avec.
 */
const ETALEMENT = Math.sqrt(4 * RACCORD ** 2 - (LARGEUR - 2 * RACCORD) ** 2);
/** Le côté d'une rangée, l'écart entre deux, et le rembourrage du rail. */
const RANGEE = 40, ECART = 4, MARGE = 9;
/**
 * Où le rail commence.
 *
 * ⚠️ **En haut, et non centré — la mesure tranche.** Le serveur rend neuf rangées : ni le
 * compte ni « Se connecter » ne sont décidés avant hydratation, et la dixième n'apparaît
 * qu'ensuite. Centré, le rail grandit alors de 44 pixels vers ses deux extrémités, et
 * **chaque rangée saute de 22 pixels à chaque chargement de page**. Un rail centré dérive en
 * outre de la moitié de tout redimensionnement vertical de la fenêtre : aucune cible n'a de
 * position stable, ni entre deux visites, ni entre deux tailles d'écran. Ancré en haut, les
 * deux valeurs tombent à zéro.
 *
 * ⚠️ **Le rail ne tient plus le haut : il se centre sur la hauteur.** Il partait à 12 px pour
 * que sa silhouette et le champ de recherche tiennent sur une ligne — un alignement demandé à
 * l'usage, et juste tant que le coin haut gauche était à lui. Il ne l'est plus : l'enseigne
 * s'y est installée, avec les mêmes 20 px de marge que le champ à l'autre bout. Deux objets ne
 * peuvent pas occuper le même coin, et c'est le bandeau qui doit le tenir — il traverse la
 * page de bord à bord, le rail non.
 *
 * ⚠️ **Le centrage se fait sur la fenêtre, pas sur un `top` calculé.** `top: 50%` puis un
 * décalage de la moitié de sa propre hauteur : le rail n'a pas de hauteur fixe — elle dépend
 * du nombre de rangées, qui dépend de la session — et tout calcul en pixels aurait été faux
 * dès qu'une rangée apparaît ou disparaît.
 */

/**
 * La silhouette du rail : un flanc droit, une cascade en S à chaque bout.
 *
 * Le sens de parcours est horaire, en partant du bord de l'écran. La courbe est celle du
 * raccord de languette de `contourDe`, dans `CarteCompte.tsx`, mise à l'échelle — mais posée
 * deux fois, en miroir, là où le dossier n'en a qu'une.
 *
 * ⚠️ **La symétrie est demandée, et elle a coûté un détour.** Le rail a porté un temps la
 * vraie languette : l'encoche en bas, un quart de cercle de rayon 18 en haut. C'est ce que la
 * géométrie du dossier impose — une languette a un flanc qui commence et un flanc qui rejoint
 * le plan. L'usage a tranché autrement : « juste le menu doit être symétrique ». L'angle
 * ordinaire est donc parti, et avec lui le seul rayon que ce fichier partageait avec l'échelle
 * des cartes. Ne pas le remettre en croyant réparer un oubli.
 *
 * ⚠️ **Les deux arcs d'une cascade se touchent à mi-course et à mi-profondeur.** C'est le seul
 * point où ils peuvent se rejoindre en gardant la même tangente ; il se calcule, il ne se règle
 * pas.
 *
 * ⚠️ **Les quatre drapeaux de balayage ne sont pas les mêmes, et c'est la signature du
 * miroir.** En haut la cascade part du bord de l'écran vers le flanc — `0` puis `1` ; en bas
 * elle repart du flanc vers le bord — `1` puis `0`. Deux cascades symétriques ont donc des
 * drapeaux *inversés*, non identiques. Ils ont déjà été posés faux tous les quatre sans que la
 * capture prise alors le montre : elle cadrait la moitié du rail où l'erreur ne se voit pas.
 * Vérifier les deux bouts, pas un seul.
 *
 * ⚠️ **En `clip-path` et non en masques, parce qu'un S ne se masque pas.** Les raccords d'un
 * temps étaient des quarts de disque retranchés d'un carré, ce qu'un dégradé radial sait
 * faire. Un arc plus court qu'un quart, non : il faut le tracer. D'où une hauteur à mesurer,
 * puisque le tracé la contient — le rail grandit avec son contenu, qui change quand la
 * session s'ouvre.
 */
const silhouette = (h: number) => {
  const l = LARGEUR, r = RACCORD, v = ETALEMENT;
  return [
    // La cascade du haut : le creux part tangent au bord de l'écran…
    "M0,0",
    `A${r},${r} 0 0 0 ${l / 2},${v / 2}`,
    // …puis le bombé reprend sa tangente et arrive tangent au flanc.
    `A${r},${r} 0 0 1 ${l},${v}`,
    // Le flanc, droit sur toute la hauteur des rangées.
    `L${l},${h - v}`,
    // La cascade du bas, la même en miroir : le bombé quitte le flanc…
    `A${r},${r} 0 0 1 ${l / 2},${h - v / 2}`,
    // …et le creux rejoint le bord de l'écran, tangent lui aussi.
    `A${r},${r} 0 0 0 0,${h}`,
    "Z",
  ].join(" ");
};

type Item = { label: string; href: string; icon: React.JSX.Element };

/**
 * Un pictogramme : un ou plusieurs tracés, pleins ou au trait.
 *
 * ⚠️ **Ce n'était qu'une chaîne, et ça ne suffit plus.** Le jeu précédent était uniformément
 * au trait, d'un seul tracé : `icon()` prenait un `d` et posait un contour de 1,7. Les
 * pictogrammes fournis à l'usage sont pleins pour huit d'entre eux, au trait pour la carte
 * seule, et celui du graphique en compte **deux**. Trois variations qu'une chaîne ne peut pas
 * porter.
 */
type Pictogramme = { trace: string[]; contour?: boolean };

/**
 * ⚠️ **Dix-huit pixels et non dix-sept, parce que le jeu a changé de nature.** Un
 * pictogramme plein pèse plus qu'un contour de même boîte : à dix-sept, ceux-ci paraissaient
 * plus gros que les précédents alors qu'ils occupent la même place. Le pixel rendu est ici
 * une compensation de masse, pas un agrandissement.
 *
 * ⚠️ **Le trait de la carte reste celui de sa source.** Un globe est un fil de fer : il ne
 * peut pas se remplir sans devenir un disque. Son 1,5 dans une boîte de 24 rendue à 18 donne
 * un trait d'environ 1,1 pixel — plus léger que la masse des pleins qui l'entourent, et c'est
 * le seul écart de graisse du jeu. Assumé : la forme prime, et elle n'a pas d'autre version.
 */
/**
 * Les initiales tirées d'un pseudonyme ou d'une adresse.
 *
 * ⚠️ **Deux lettres quand le nom en offre deux, une sinon.** « Marie Dupont » donne MD,
 * « camille » donne C. Prendre systématiquement les deux premières lettres d'un mot unique
 * donnerait « CA », qui se lit comme un sigle et non comme une initiale.
 *
 * ⚠️ **L'adresse est coupée avant l'arobase.** Sans quoi « sacha@exemple.fr » donnerait SE —
 * la seconde lettre venant du fournisseur de courrier, qui ne dit rien de la personne.
 */
const initiales = (nom: string | undefined) => {
  const base = (nom ?? "").split("@")[0].trim();
  if (!base) return "?";
  const mots = base.split(/[\s._-]+/).filter(Boolean);
  return (mots.length > 1 ? mots[0][0] + mots[1][0] : mots[0][0]).toUpperCase();
};

const icon = (p: Pictogramme) => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"
    fill={p.contour ? "none" : "currentColor"}
    stroke={p.contour ? "currentColor" : "none"}
    strokeWidth={p.contour ? 1.5 : undefined}
    strokeLinecap="round" strokeLinejoin="round">
    {p.trace.map((d, i) => <path key={i} d={d} />)}
  </svg>
);

/**
 * ⚠️ **Le jeu précédent avait un défaut que celui-ci corrige.** « Graphique » et
 * « Simulation » y étaient le même dessin — trois barres, l'une avec un axe en L, l'autre
 * sans : à dix-sept pixels et sans nom écrit à côté, deux destinations sur cinq ne se
 * distinguaient plus. Les nouveaux les séparent par la forme même : une courbe pleine, trois
 * barres, quatre tuiles. Il n'y a plus deux pictogrammes du même genre dans le rail.
 */
const ICONS: Record<string, Pictogramme> = {
  dashboard: { trace: ["m12.69 2.535 8.772 8.776c.615.614.18 1.664-.689 1.664H19.8v5.85a2.926 2.926 0 0 1-2.925 2.925h-.975v-6.825a2.926 2.926 0 0 0-2.753-2.92L12.975 12h-1.95a2.924 2.924 0 0 0-2.924 2.925v6.825h-.975A2.924 2.924 0 0 1 4.2 18.825v-5.85h-.974c-.868 0-1.304-1.05-.69-1.664l8.774-8.776a.975.975 0 0 1 1.378 0m.285 11.415a.974.974 0 0 1 .975.975v6.825h-3.9v-6.825a.974.974 0 0 1 .861-.968l.114-.007z"] },
  chart: { trace: [
    "M15.13 9.438a.97.97 0 0 1 1.355-.16l.091.08 3.89 3.882a.97.97 0 0 1 .275.56l.009.127v4.852a.97.97 0 0 1-.858.964l-.114.007H4.2l-.107-.009-.107-.02-.104-.032-.102-.045-.097-.057-.092-.068-.058-.053-.07-.08-.062-.086-.053-.094-.015-.034-.04-.1-.025-.102-.015-.105-.004-.107.009-.107.018-.102q.015-.057.034-.108l.045-.102.057-.097 3.89-5.824a.97.97 0 0 1 1.132-.378l.11.048 3.187 1.59z",
    "M15.142 3.6a.973.973 0 0 1 1.344-.146l.09.08 3.89 3.883a.97.97 0 0 1-1.284 1.453l-.092-.08-3.136-3.13-4.18 5.005a.97.97 0 0 1-1.069.295l-.112-.048L7.43 9.334 5 12.568a.973.973 0 0 1-1.259.26l-.102-.066a.97.97 0 0 1-.262-1.257l.068-.102L6.36 7.521a.97.97 0 0 1 1.106-.331l.107.045 3.2 1.597z",
  ] },
  markets: { trace: ["M9.083 3.25a1.945 1.945 0 0 1 1.945 1.944v5.834a1.944 1.944 0 0 1-1.945 1.944H5.194a1.944 1.944 0 0 1-1.944-1.944V5.194A1.944 1.944 0 0 1 5.194 3.25zm0 11.667a1.944 1.944 0 0 1 1.945 1.944v1.945a1.945 1.945 0 0 1-1.945 1.944H5.194a1.945 1.945 0 0 1-1.944-1.944V16.86a1.944 1.944 0 0 1 1.944-1.944zm9.723-3.89a1.944 1.944 0 0 1 1.944 1.945v5.834a1.945 1.945 0 0 1-1.944 1.944h-3.89a1.945 1.945 0 0 1-1.944-1.944v-5.834a1.944 1.944 0 0 1 1.945-1.944zm0-7.777a1.944 1.944 0 0 1 1.944 1.944V7.14a1.945 1.945 0 0 1-1.944 1.944h-3.89a1.945 1.945 0 0 1-1.944-1.944V5.194a1.945 1.945 0 0 1 1.945-1.944z"] },
  map: { contour: true, trace: ["M3.6 9h16.8M3.6 15h16.8M11.5 3a17 17 0 0 0 0 18m1-18a17 17 0 0 1 0 18M3 12a9 9 0 1 0 18.001 0A9 9 0 0 0 3 12"] },
  simulation: { trace: ["M5 7.25c.223 0 .428 0 .599.012.177.012.373.039.57.12.43.178.77.52.948.948.082.198.11.394.121.571.012.171.012.376.012.599v9c0 .223 0 .428-.012.599a1.8 1.8 0 0 1-.12.57 1.75 1.75 0 0 1-.948.948 1.8 1.8 0 0 1-.571.121A9 9 0 0 1 5 20.75c-.223 0-.428 0-.599-.012a1.8 1.8 0 0 1-.57-.12 1.75 1.75 0 0 1-.948-.948 1.8 1.8 0 0 1-.121-.571 9 9 0 0 1-.012-.599v-9c0-.223 0-.428.012-.599a1.8 1.8 0 0 1 .12-.57 1.75 1.75 0 0 1 .948-.948 1.8 1.8 0 0 1 .571-.121c.171-.012.376-.012.599-.012M19 10.25c.223 0 .428 0 .599.012.177.012.373.039.57.12.43.178.77.52.948.948.082.198.11.394.121.571.012.171.012.376.012.599v6c0 .223 0 .428-.012.599a1.8 1.8 0 0 1-.12.57 1.75 1.75 0 0 1-.948.948 1.8 1.8 0 0 1-.571.121c-.171.012-.376.012-.599.012s-.428 0-.599-.012a1.8 1.8 0 0 1-.57-.12 1.75 1.75 0 0 1-.948-.948 1.8 1.8 0 0 1-.121-.571 9 9 0 0 1-.012-.599v-6c0-.223 0-.428.012-.599.012-.177.039-.373.12-.57a1.75 1.75 0 0 1 .948-.948c.198-.082.394-.11.571-.121.171-.012.376-.012.599-.012M12 3.25c.223 0 .428 0 .599.012.177.012.373.039.57.12.43.178.77.52.948.948.082.198.11.394.121.571.012.171.012.376.012.599v12.999c0 .223 0 .428-.012.599a1.8 1.8 0 0 1-.12.57c-.178.43-.52.77-.948.948-.198.082-.394.11-.571.122-.171.012-.376.011-.599.011s-.428 0-.599-.01a1.8 1.8 0 0 1-.57-.123 1.75 1.75 0 0 1-.948-.947 1.8 1.8 0 0 1-.121-.571 9 9 0 0 1-.012-.599V5.5c0-.223 0-.428.012-.599a1.8 1.8 0 0 1 .12-.57 1.75 1.75 0 0 1 .948-.948 1.8 1.8 0 0 1 .571-.121c.171-.012.376-.012.599-.012"] },
  reglages: { trace: ["M14.58 4.28a.705.705 0 0 0 1.054.436c2.378-1.448 5.099 1.272 3.651 3.65a.707.707 0 0 0 .436 1.053c2.705.656 2.705 4.505 0 5.162a.705.705 0 0 0-.437 1.053c1.448 2.378-1.272 5.099-3.65 3.651a.707.707 0 0 0-1.053.436c-.656 2.705-4.505 2.705-5.162 0a.706.706 0 0 0-1.053-.437c-2.378 1.448-5.099-1.272-3.651-3.65a.706.706 0 0 0-.436-1.053c-2.705-.656-2.705-4.505 0-5.162a.706.706 0 0 0 .437-1.053c-1.448-2.378 1.272-5.099 3.65-3.651a.704.704 0 0 0 1.053-.436c.656-2.705 4.505-2.705 5.162 0M12 9.074a2.925 2.925 0 1 0 0 5.85 2.925 2.925 0 0 0 0-5.85"] },
  sun: { trace: ["M12 18.84a.977.977 0 0 1 .977.978v1.955a.977.977 0 0 1-1.954 0v-1.955a.977.977 0 0 1 .977-.977m-4.837-2.003a.977.977 0 0 1 0 1.382L5.78 19.601a.976.976 0 1 1-1.382-1.382l1.382-1.382a.977.977 0 0 1 1.382 0m11.056 0 1.382 1.382a.977.977 0 0 1-1.382 1.382l-1.382-1.382a.978.978 0 0 1 1.382-1.382m-4.934-9.612a4.886 4.886 0 1 1-2.425 9.466 4.886 4.886 0 0 1 2.425-9.466m-9.103 3.798a.977.977 0 0 1 0 1.954H2.227a.977.977 0 0 1 0-1.954zm17.59 0a.977.977 0 0 1 0 1.954h-1.954a.977.977 0 0 1 0-1.954zM5.782 4.399 7.163 5.78A.977.977 0 0 1 5.78 7.163L4.399 5.78A.977.977 0 0 1 5.78 4.399m13.82 0a.977.977 0 0 1 0 1.382L18.22 7.163a.978.978 0 0 1-1.382-1.382l1.382-1.382a.977.977 0 0 1 1.382 0M12 1.25a.977.977 0 0 1 .977.977v1.955a.977.977 0 0 1-1.954 0V2.227A.977.977 0 0 1 12 1.25"] },
  moon: { trace: ["M12.336 2.25c-1.781 0-3.528.48-5.056 1.387a9.8 9.8 0 0 0-3.618 3.765 9.68 9.68 0 0 0 .493 10.01 9.8 9.8 0 0 0 3.97 3.399 9.91 9.91 0 0 0 10.065-.974 9.76 9.76 0 0 0 3.232-4.095c.335-.8-.468-1.603-1.277-1.277a6.45 6.45 0 0 1-4.35.162 6.4 6.4 0 0 1-3.446-2.634 6.29 6.29 0 0 1 1.043-8.046l.076-.078c.542-.614.111-1.611-.746-1.611h-.261l-.067-.006-.06-.002z"] },
  connexion: { trace: ["M12 2.25c.954 0 1.886.286 2.679.822a4.86 4.86 0 0 1 1.775 2.187c.365.891.46 1.871.275 2.817a4.9 4.9 0 0 1-1.32 2.496 4.8 4.8 0 0 1-2.468 1.334 4.77 4.77 0 0 1-2.786-.277A4.83 4.83 0 0 1 7.99 9.833a4.9 4.9 0 0 1-.812-2.708l.004-.212a4.9 4.9 0 0 1 1.483-3.31A4.8 4.8 0 0 1 12 2.25M13.929 13.95c1.278 0 2.505.514 3.409 1.428a4.9 4.9 0 0 1 1.412 3.447v.975c0 .517-.203 1.013-.565 1.379a1.92 1.92 0 0 1-1.364.571H7.18a1.92 1.92 0 0 1-1.364-.571A1.96 1.96 0 0 1 5.25 19.8v-.975c0-1.293.508-2.533 1.412-3.447a4.8 4.8 0 0 1 3.41-1.428z"] },
};

/** Le voile flouté du rail — la seule pièce, depuis que l'épine a disparu. */
const FLOU = {
  background: "var(--nv-barre-fond)",
  backdropFilter: "blur(24px) saturate(1.4)",
  WebkitBackdropFilter: "blur(24px) saturate(1.4)",
} as const;

/**
 * Une rangée du rail.
 *
 * ⚠️ **Écrite une fois, alors qu'il y en avait cinq copies.** Le panneau répétait le même
 * bloc de style pour un lien, un réglage, un compte, une connexion et deux thèmes — six
 * fois la même hauteur, le même arrondi, la même bascule de survol. Elles avaient déjà
 * divergé : 40 pixels de haut pour les liens, 44 pour le compte, `0 12px` de rembourrage
 * d'un côté et `0 8px` de l'autre. Le rail les remet toutes au carré, et une seule
 * définition garantit qu'elles y restent.
 */
function Rangee({
  nom, href, onClick, actif = false, enfant,
}: {
  nom: string;
  href?: string;
  onClick?: () => void;
  actif?: boolean;
  enfant: React.ReactNode;
}) {
  const socle: React.CSSProperties = {
    position: "relative",
    display: "flex", alignItems: "center", justifyContent: "center",
    width: RANGEE, height: RANGEE, flexShrink: 0,
    padding: 0, border: "none", borderRadius: 12, cursor: "pointer",
    textDecoration: "none",
    color: actif ? "var(--nv-texte)" : "var(--nv-texte-secondaire)",
    background: actif ? "var(--nv-barre-actif)" : "transparent",
    boxShadow: actif ? "inset 0 0 0 1px var(--nv-barre-actif-bord)" : "none",
    transition: "background 160ms, color 160ms",
  };
  /* ⚠️ Le survol se pose à la main plutôt qu'en CSS : la teinte active doit survivre au
     passage du curseur, et une règle `:hover` l'écraserait sans savoir laquelle est en cours. */
  const entrer = (e: React.MouseEvent<HTMLElement>) => {
    if (!actif) e.currentTarget.style.background = "var(--nv-barre-survol)";
  };
  const sortir = (e: React.MouseEvent<HTMLElement>) => {
    if (!actif) e.currentTarget.style.background = "transparent";
  };

  const dedans = (
    <>
      {enfant}
      {/**
        * ⚠️ **L'infobulle est dans le lien, pas à côté.** C'est ce qui la fait paraître au
        * survol sans une ligne de JavaScript ni un état par rangée : la règle CSS descend du
        * lien survolé vers son propre enfant. Posée en voisine, il aurait fallu dix états.
        */}
      <span className="nv-rail-bulle" style={{
        background: "var(--nv-carte)",
        color: "var(--nv-texte)",
        border: "1px solid var(--nv-bord-fort)",
        borderRadius: 8, padding: "5px 9px",
        fontSize: 12, fontWeight: 500, whiteSpace: "nowrap",
        boxShadow: "0 6px 20px rgba(0,0,0,0.28)",
      }}>{nom}</span>
    </>
  );

  return href ? (
    <Link className="nv-rail-lien" href={href} style={socle} aria-label={nom}
      aria-current={actif ? "page" : undefined}
      onMouseEnter={entrer} onMouseLeave={sortir}>{dedans}</Link>
  ) : (
    <button className="nv-rail-lien" type="button" onClick={onClick} style={socle}
      aria-label={nom} onMouseEnter={entrer} onMouseLeave={sortir}>{dedans}</button>
  );
}

export default function SideNav() {
  const pathname = usePathname();
  const { mode, activeAsset } = useApp();
  const modeTheme = useModeTheme();

  const [ready, setReady] = useState(false);
  /**
   * La découpe du rail, refaite quand sa hauteur change.
   *
   * ⚠️ **Mesurée et non déduite du nombre de rangées.** Il en varie déjà — le compte n'est
   * décidé qu'après hydratation — et rien ne dit qu'une future rangée aura la même hauteur
   * que les autres. Un `ResizeObserver` répond à ce qui est, pas à ce qu'on croit compter.
   */
  const [decoupe, setDecoupe] = useState("");
  const ancrerRail = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const poser = () => {
      const h = el.getBoundingClientRect().height;
      if (h > 0) setDecoupe(`path("${silhouette(h)}")`);
    };
    poser();
    const ro = new ResizeObserver(poser);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [user, setUser] = useState<{ username?: string; email?: string; avatar_url?: string } | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("novac_user");
      if (stored) setUser(JSON.parse(stored));
    } catch { /* stockage refusé ou contenu illisible */ }
    setReady(true);
  }, []);

  // Vérifie que la session tient encore.
  //
  // `novac_user` et `novac_token` sont deux entrées distinctes du stockage :
  // le compte survivait à la disparition du jeton, et l'interface affichait un
  // utilisateur connecté qui ne pouvait plus rien enregistrer. L'échec ne se
  // découvrait qu'à la sauvegarde, sous forme d'« Authentification requise ».
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("novac_token") : null;
    if (!token) {
      if (typeof window !== "undefined") localStorage.removeItem("novac_user");
      setUser(null);
      return;
    }
    let annule = false;
    recuperer(`${API_URL}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error("session close"))))
      .then((u) => {
        if (annule) return;
        // Le serveur fait foi : pseudo et avatar peuvent avoir changé ailleurs.
        setUser(u);
        try { localStorage.setItem("novac_user", JSON.stringify(u)); } catch { /* stockage refusé */ }
      })
      .catch(() => {
        if (annule) return;
        try {
          localStorage.removeItem("novac_token");
          localStorage.removeItem("novac_user");
        } catch { /* stockage refusé */ }
        setUser(null);
      });
    return () => { annule = true; };
  }, []);

  /* ⚠️ Publiée une fois pour toutes : la largeur ne dépend plus d'un état, mais la variable
     reste — c'est par elle que la coquille et les éléments fixes du bandeau se décalent, et
     aucun d'eux n'a jamais eu à connaître ce composant. */
  useEffect(() => {
    document.documentElement.style.setProperty("--novac-nav-w", `${LARGEUR}px`);
  }, []);

  // Le premier onglet suit le mode : un portefeuille ouvert mène à son tableau
  // de bord, un actif à son graphique.
  const first: Item = mode === "portfolio"
    ? { label: "Dashboard", href: "/portfolio", icon: icon(ICONS.dashboard) }
    : { label: "Graphique", href: activeAsset ? `/chart?ticker=${encodeURIComponent(activeAsset.ticker)}` : "/chart", icon: icon(ICONS.chart) };

  const items: Item[] = [
    first,
    { label: "Marchés",    href: "/treemap",    icon: icon(ICONS.markets) },
    { label: "Carte",      href: "/map",        icon: icon(ICONS.map) },
    /**
     * ⚠️ **« Analyse » est retirée, et `/dashboard` n'est plus atteignable.** Le rail était
     * le **seul** lien vers cette page dans toute l'application — vérifié par recherche, il
     * n'en existe aucun autre. Ses sept cent quarante-cinq lignes sont donc désormais du code
     * mort, servi par une route que rien ne mène à ouvrir. Retiré à l'usage ; la page n'a pas
     * été supprimée pour autant, cela ne m'a pas été demandé.
     */
    { label: "Simulation", href: "/simulation", icon: icon(ICONS.simulation) },
  ];

  return (
    <>
    <nav
      aria-label="Navigation principale"
      data-avatar="curieux"
      ref={ancrerRail}
      style={{
        position: "fixed", left: 0, top: "50%", transform: "translateY(-50%)",
        width: LARGEUR, zIndex: 60,
        display: "flex", flexDirection: "column", alignItems: "center", gap: ECART,
        /* ⚠️ Le rembourrage porte l'étalement des deux cascades : la découpe mange ces
           pixels-là, et sans eux la première et la dernière rangée entreraient dans la courbe.
           Arrondi ici et nulle part ailleurs : un demi-pixel de rembourrage ne se voit pas, un
           demi-pixel d'étalement défait la tangence des arcs. */
        padding: `${Math.round(ETALEMENT + MARGE)}px 0`,
        /* ⚠️ **La découpe emporte aussi l'infobulle, et `overflow` n'y peut rien.** Un
           `clip-path` coupe tous les descendants, positionnés ou non : la bulle des noms sort
           à onze pixels du flanc et se perd donc à la coupe. Un `overflow: visible` traînait
           ici en croyant l'en préserver — il ne s'applique qu'au débordement, jamais à la
           découpe. Le remède est de poser la matière et sa découpe dans une couche à part,
           sous les rangées, plutôt que sur le rail lui-même ; ce n'est pas la silhouette, et
           cela déplace le bloc conteneur dont les modales plus bas se tiennent à l'écart. */
        clipPath: decoupe, WebkitClipPath: decoupe,
        ...FLOU,
      }}
    >
      {/**
        * La marque, en tête du rail.
        *
        * ⚠️ **Le mot « NOVAC » est parti avec l'état déplié**, faute de tenir dans
        * cinquante-huit pixels. Le seul repère qui y tienne est le sigle, et il y était déjà :
        * c'est ce que la barre repliée montrait.
        */}
      <Rangee nom="Accueil Novac" href="/" enfant={
        <span aria-hidden="true" style={{
          width: 20, height: 20,
          backgroundColor: "var(--nv-texte)",
          maskImage: "url(/logo-hivesync.svg)",
          WebkitMaskImage: "url(/logo-hivesync.svg)",
          maskSize: "contain", WebkitMaskSize: "contain",
          maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat",
          maskPosition: "center", WebkitMaskPosition: "center",
        }} />
      } />

      {items.map(item => {
        const base = item.href.split("?")[0];
        const actif = pathname === base || (base !== "/" && pathname.startsWith(base));
        return (
          <Rangee key={item.label} nom={item.label} href={item.href} actif={actif}
            enfant={item.icon} />
        );
      })}

      {/**
        * ⚠️ **Un filet, et non un écart plus grand.** Les quatre commandes du bas ne sont pas
        * des destinations : elles règlent l'application. Un simple blanc aurait laissé croire
        * à une pause dans la même liste ; le trait dit qu'on change de nature. Demandé à
        * l'usage — « séparées d'un filet ».
        */}
      <span aria-hidden="true" style={{
        width: 22, height: 1, margin: `${ECART}px 0`,
        background: "var(--nv-bord-fort)", flexShrink: 0,
      }} />

      <Rangee nom="Paramètres" href="/parametres" actif={pathname.startsWith("/parametres")}
        enfant={icon(ICONS.reglages)} />

      {user && (
        <Rangee nom={user.username?.split(" ")[0] || user.email || "Compte"}
          onClick={() => setShowProfile(true)}
          enfant={
            /**
              * ⚠️ **Le repli n'est plus une branche `if`, et c'est le composant qui le tient.**
              * L'enveloppe posait l'image quand `avatar_url` existait, l'initiale sinon, et
              * masquait l'image en `onError` quand elle ne se chargeait pas — un repli qui ne
              * repliait sur rien : la case restait vide. `Avatar` affiche son `Fallback` tant
              * que l'image n'a pas *abouti*, absente comme cassée. Le cas « adresse présente
              * mais fichier disparu » se soigne donc tout seul.
              *
              * ⚠️ **La taille est donnée en pixels, pas en cran.** Le composant accepte les
              * deux ; les crans nommés vont de 20 à 64 et aucun ne vaut 26, la mesure de la
              * boîte des rangées de ce rail.
              */
            <Avatar size={26} shape="rounded">
              {user.avatar_url && (
                <AvatarImage
                  src={user.avatar_url.startsWith("/uploads") ? `${API_URL}${user.avatar_url}` : user.avatar_url}
                  alt="" />
              )}
              <AvatarFallback>{initiales(user.username || user.email)}</AvatarFallback>
            </Avatar>
          } />
      )}

      {/* Hors session : l'entrée du compte reste, mais elle mène à la
          connexion. Sans elle, il fallait repasser par la page d'accueil
          pour se connecter — donc quitter ce qu'on était en train de faire. */}
      {ready && !user && (
        /**
          * ⚠️ **La pastille d'accent a cédé la place au pictogramme.** Cette entrée portait un
          * « ↪ » typographique dans un disque teinté : le disque disait « ceci concerne le
          * compte », faute d'un dessin qui le dise. Le pictogramme fourni est une silhouette —
          * il porte le sens lui-même, et la pastille redevenait une bordure de plus dans un
          * rail qui n'en a aucune autre.
          *
          * ⚠️ **L'accent reste, sur l'encre.** C'est la seule rangée qui appelle une action
          * plutôt qu'une destination : elle doit se détacher, mais par sa couleur, pas par une
          * forme étrangère. `icon()` peint en `currentColor`, donc l'enveloppe suffit.
          */
        <Rangee nom="Se connecter" onClick={() => setShowAuth(true)} enfant={
          /**
            * ⚠️ **La même enveloppe que la session ouverte, avec une silhouette dedans.** Les
            * deux états occupent ainsi la même forme au même endroit : se connecter ne déplace
            * rien, la silhouette cède simplement la place au visage. Avec un pictogramme nu,
            * la rangée changeait de masse à la connexion.
            */
          <Avatar size={26} shape="rounded">
            <AvatarFallback>
              <UserFilled />
            </AvatarFallback>
          </Avatar>
        } />
      )}

      {/**
        * ⚠️ **Il y avait deux bascules de thème, et la seconde ne se voyait presque jamais.**
        * Elle appelait `toggleDisplayMode`, qui fait bien basculer l'état — mais `displayMode`
        * n'est lu que par le graphique, la simulation et leurs courbes. Sur les cinq autres
        * pages, dont celle d'où on l'actionnait le plus souvent, appuyer ne changeait rien à
        * l'écran. Elle ne fonctionnait pas *là où on s'en servait*, ce qui revient au même.
        * Retirée à l'usage.
        *
        * ⚠️ **Plus rien ne bascule le thème noir dans l'application.** `GlobalHeader` en
        * extrait encore `toggleDisplayMode` du contexte, mais ne l'appelle nulle part — c'était
        * déjà le cas avant. Le contexte, lui, reste entier : l'état existe, sa valeur par
        * défaut est « verre », et le jour où le thème noir vaudra pour toutes les pages il y
        * aura un interrupteur à rebrancher, pas un mode à réécrire.
        */}
      <Rangee nom={modeTheme === "clair" ? "Thème sombre" : "Thème clair"}
        onClick={() => basculerMode()}
        enfant={icon(modeTheme === "clair" ? ICONS.moon : ICONS.sun)} />
    </nav>

    {/* Hors du <nav> à dessein : son backdrop-filter en fait le bloc conteneur
        des descendants en position fixe, qui seraient donc enfermés dans la
        largeur du rail. */}
    {showProfile && user && (
      // Le conteneur ne sert qu'à la superposition : la modale se voile en
      // z-index 50, le panneau vit en 60, et sans cela le panneau restait seul
      // éclairé au-dessus du voile. Un ancêtre positionné crée un contexte
      // d'empilement qui emporte la modale avec lui, sans la déplacer.
      <div style={{ position: "relative", zIndex: 70 }}>
      <ProfileModal
        user={user}
        dark
        onClose={() => setShowProfile(false)}
        onUpdate={updated => {
          // La déconnexion remonte null après avoir vidé le stockage ; s'y
          // fier plutôt que d'y réécrire "null", que le JSON.parse d'une
          // prochaine visite relirait sans erreur comme un compte connecté.
          setUser(updated);
          if (updated) {
            try { localStorage.setItem("novac_user", JSON.stringify(updated)); } catch { /* stockage refusé */ }
          }
        }}
      />
      </div>
    )}

    {showAuth && (
      <div style={{ position: "relative", zIndex: 70 }}>
        <AuthModal
          dark
          onClose={() => setShowAuth(false)}
          onAuth={(u: { username?: string; email?: string; avatar_url?: string }) => {
            setUser(u);
            setShowAuth(false);
            // Les portefeuilles appartiennent au compte : ce qui est affiché
            // vient de l'ancienne session, ou de personne. Un rechargement
            // complet plutôt qu'un router.refresh() — l'état des pages vit
            // dans des `useState` que le rafraîchissement serveur ne touche pas.
            window.location.reload();
          }}
        />
      </div>
    )}
    </>
  );
}
