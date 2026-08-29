import { useId } from "react";

import type { Decoupe, Degrade, MotifPlat } from "@/lib/avatarSkins";

/**
 * ⚠️ **Il n'y a plus d'anneau de sélection du tout.** Il y en a eu deux : `rgba(20,22,30,
 * 0.55)` écrit en dur, devenu invisible le jour où le panneau blanc s'est fait fenêtre
 * sombre, puis l'encre du thème — un cerclage blanc de deux pixels. Écarté à l'usage.
 *
 * ⚠️ **Ce qui le remplace ne s'ajoute pas, il se retranche aux autres.** La pastille retenue
 * **passe devant** ses voisines : sur un nuancier en écailles, où chacune est mordue par
 * celle de sa droite, être la seule entière est déjà une marque. Un anneau désignait la
 * couleur de l'extérieur ; ici c'est la disposition qui la désigne, et rien d'étranger ne
 * vient se poser sur la teinte.
 *
 * ⚠️ **Elle a aussi grandi d'un cinquième, un temps.** Écarté à l'usage : un agrandissement
 * permanent déforme la bande là où l'œil cherche un nuancier régulier. Ce qui reste est donc
 * la marque la plus discrète possible — l'aperçu de l'avatar, juste au-dessus, portant de
 * toute façon la couleur choisie en grand.
 *
 * ⚠️ **Le repère non visuel reste, lui.** `aria-pressed` porte l'état pour qui n'a pas
 * l'image : la marque a changé de forme, elle n'a pas disparu. Voir `.nv-pastille` dans
 * `globals.css`, qui la dessine.
 */

/**
 * Le cerne d'une pastille : un cheveu d'encre du thème.
 *
 * ⚠️ **Un aplat sans bord disparaît sur un fond proche.** L'encre `#1E2233` sur la fenêtre
 * sombre, le citron sur la carte claire : sans cerne, la pastille n'a plus de contour et la
 * rangée paraît trouée.
 *
 * ⚠️ **Il contraste avec la carte, pas avec la pastille — et c'est tout le raisonnement.**
 * `--nv-encre-rvb` vaut le blanc en thème sombre et le bleu nuit en clair : le cheveu est
 * donc toujours du côté opposé au fond, donc toujours visible, quelle que soit la teinte
 * qu'il borde. Un cerne qui contrasterait avec la *pastille* ne résoudrait rien — c'est
 * justement quand la pastille ressemble à la carte qu'on a besoin de la borner.
 *
 * ⚠️ **Assombrir la couleur elle-même était le premier essai, et il était faux.**
 * `decalerClarte(couleur, -0.14)` travaille en TSL : sur une teinte déjà très saturée,
 * baisser la clarté pousse vers la teinte pure au lieu de foncer. Mesuré sur l'indigo
 * `#6366F1` — le cerne sortait en `rgb(33, 38, 235)`, c'est-à-dire un bleu **plus vif** que
 * la pastille, soit un liseré fluorescent là où l'on voulait une ombre.
 */
const CERNE = "rgba(var(--nv-encre-rvb), 0.18)";

/**
 * Une pastille de couleur : un aplat, un cerne, rien d'autre.
 *
 * ⚠️ **Elle a été bombée, et ce n'était pas le bon registre.** Quatre ombres se
 * répondaient — une lumière posée en haut à l'intérieur, un creux en bas, une ombre portée
 * dessous et un halo de sa propre couleur autour — pour imiter un bonbon de verre. C'était
 * bien fait et c'était trop : relevé à l'usage comme « trop réaliste ». Un sélecteur de
 * couleur montre **une couleur**, pas un objet éclairé ; tout ce qui simule une matière
 * ajoute une information dont le choix n'a que faire, et fausse d'ailleurs la teinte qu'on
 * croit choisir — le haut du dégradé était 16 % plus clair que la couleur réelle.
 *
 * ⚠️ **Ce qui reste est ce qui sert.** L'aplat, qui dit la couleur exactement. Le cerne, qui
 * la borne. Deux éléments, deux fonctions — et plus rien pour désigner celle qui est
 * retenue : voir la note d'en-tête.
 *
 * ⚠️ **Le grossissement au survol vit dans `.nv-pastille`.** Un `:hover` ne s'écrit pas en
 * style en ligne, et c'est là le seul reste de matière qu'on garde : la pastille répond au
 * geste au lieu de faire semblant d'exister.
 */
export default function PastilleCouleur({
  couleur, taille = 34, retenue = false, titre, onClick,
}: {
  couleur: string;
  taille?: number;
  /**
   * La couleur en cours.
   *
   * ⚠️ **Elle ne se voit plus, elle s'annonce.** Toutes les marques visuelles ont été
   * écartées à l'usage ; ce drapeau ne sert donc plus qu'à poser `aria-pressed`, ce qui
   * n'est pas une raison de le supprimer — c'est au contraire le seul endroit où l'état
   * survit encore.
   */
  retenue?: boolean;
  /**
   * Le nom de la couleur.
   *
   * ⚠️ **Il n'est plus posé en `title`, donc plus d'infobulle grise au survol.** Elle
   * s'affichait sur chaque pastille et se lisait mal : dix-neuf disques serrés, et une boîte
   * du système qui recouvre ses voisines dès que le curseur traverse la bande. Écartée à
   * l'usage. Le nom reste en `aria-label` — la couleur se choisit à l'œil, mais elle doit
   * pouvoir s'annoncer.
   */
  titre?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={titre}
      aria-pressed={retenue}
      className="nv-pastille"
      style={{
        width: taille, height: taille, borderRadius: "50%", padding: 0, border: 0,
        cursor: "pointer", flexShrink: 0,
        background: couleur,
        boxShadow: `inset 0 0 0 1px ${CERNE}`,
      }}
    />
  );
}

/**
 * ⚠️ **Le « + » de la couleur libre a été retiré d'ici.** Il ouvrait le sélecteur du système
 * sur un champ `input[type=color]` rendu invisible — la bonne façon de faire, puisqu'une roue
 * chromatique maison, c'est une teinte, une saturation, une clarté et un champ hexadécimal à
 * tenir. Il se justifiait tant que le nuancier n'offrait que onze teintes et laissait de
 * vrais trous ; à dix-neuf, le tour du cercle est couvert et il ne servait plus qu'à casser
 * la bande d'écailles, n'étant pas un disque. Écarté à l'usage.
 *
 * ⚠️ **Rien n'en survit ici, et c'est délibéré.** Un composant exporté que plus personne
 * n'appelle est du code qui vieillit sans être vu — les pastilles se sont aplaties, l'anneau
 * de sélection a disparu, et lui serait resté seul à porter l'ancien langage. S'il faut
 * rouvrir le champ libre un jour, il se réécrit en vingt lignes ; le modèle, lui, n'a jamais
 * cessé de l'accepter, `estCouleurValide` prenant n'importe quel hexadécimal.
 */

/**
 * Une pastille qui montre un **habillage** plutôt qu'une couleur.
 *
 * ⚠️ **Le même objet que ses voisines, à la peinture près.** Elle vit dans la rangée des
 * couleurs parce qu'elle décrit la même chose — ce que porte la tête — et il n'y a rien à
 * composer entre les deux : l'habillage recouvre la couleur. Elle en reprend donc le
 * diamètre, le cerne et l'anneau, sans quoi elle se lirait comme un bouton étranger tombé au
 * milieu de la rangée.
 *
 * ⚠️ **Elle s'est aplatie avec elles, et c'était obligatoire.** Elle portait le même relief —
 * creux du bas, lumière du haut, ombre portée. Le garder ici pendant que les couleurs le
 * perdaient aurait fait exactement ce que la règle ci-dessus interdit : un objet d'un autre
 * registre au milieu de la rangée. Quand une recette est partagée, elle se change des deux
 * côtés à la fois — c'est tout l'intérêt de l'avoir écrite deux fois au même endroit.
 */
export function PastilleSkin({
  contour, aplats, fond, degrades = [], decoupes = [], rayon = "50%",
  taille = 34, retenue = false, titre, onClick,
}: {
  /** La silhouette, dans un repère centré de rayon 100. */
  contour: string;
  /**
   * ⚠️ **Le type partagé, et non une copie de sa forme.** Il était réécrit ici à
   * l'identique ; le jour où `MotifPlat` a gagné un dégradé et une opacité, la copie ne le
   * savait pas et la compilation s'est arrêtée là — ce qui est la meilleure façon de
   * découvrir une copie, mais pas la plus économique.
   */
  aplats: MotifPlat[];
  /** Le fond sur lequel les aplats se posent — l'océan, pour la Terre. */
  fond: string;
  /**
   * Les dégradés et les régions que les aplats désignent par leur nom.
   *
   * ⚠️ **Ils étaient volontairement ignorés, et c'est ce qui interdisait le terminal.**
   * L'aperçu ne servait qu'à la Terre, dont les aplats sont unis ; monter des `<defs>` pour
   * un bouton de trente-quatre pixels paraissait cher. Le terminal est presque entièrement
   * fait de dégradés et d'une découpe : sans eux sa pastille était un carré noir. Le coût
   * réel s'est révélé être une dizaine de lignes, contre une rangée de réglages qui aurait
   * dû rester incomplète pour toujours.
   */
  degrades?: Degrade[];
  decoupes?: Decoupe[];
  /**
   * Le rayon du bouton — rond par défaut.
   *
   * ⚠️ **Un habillage se montre sur la silhouette à laquelle il s'applique.** Le globe est
   * rond et sa pastille l'est aussi ; le terminal n'existe que sur le carré arrondi, et
   * enfermé dans un disque il perdrait ses quatre coins, c'est-à-dire précisément le
   * boîtier qu'on veut montrer. La pastille prend donc la forme de ce qu'elle annonce.
   */
  rayon?: string;
  taille?: number;
  retenue?: boolean;
  titre?: string;
  onClick?: () => void;
}) {
  /** ⚠️ Les identifiants sont uniques par pastille : deux aperçus voisins se
      partageraient sinon le premier dégradé déclaré, comme dans l'avatar. */
  const marque = useId().replace(/:/g, "");
  return (
    <button
      type="button"
      onClick={onClick}
      title={titre}
      aria-label={titre}
      aria-pressed={retenue}
      className="nv-pastille"
      style={{
        width: taille, height: taille, borderRadius: rayon, padding: 0, border: 0,
        cursor: "pointer", flexShrink: 0, position: "relative", overflow: "hidden",
        background: fond,
        boxShadow: `inset 0 0 0 1px ${CERNE}`,
      }}
    >
      <svg viewBox="-100 -100 200 200" width={taille} height={taille}
        aria-hidden="true" style={{ display: "block" }}>
        <defs>
          {degrades.map(g => (
            <radialGradient key={g.id} id={`${g.id}-${marque}`}
              gradientUnits="userSpaceOnUse" cx={g.cx} cy={g.cy} r={g.r}>
              {g.arrets.map((a, i) => (
                <stop key={i} offset={a.a} stopColor={a.couleur} stopOpacity={a.opacite} />
              ))}
            </radialGradient>
          ))}
          {decoupes.map(c => (
            <clipPath key={c.id} id={`${c.id}-${marque}`}><path d={c.d} /></clipPath>
          ))}
        </defs>
        <clipPath id={`past-${marque}`}><path d={contour} /></clipPath>
        <g clipPath={`url(#past-${marque})`}>
          {aplats.map((m, i) => (
            /**
             * ⚠️ **Aucune animation ici : `classe` n'est pas reprise.** Les couches du
             * terminal qui respirent — le halo, la bande de balayage — porteraient leur
             * animation jusque dans la rangée de réglages, où trente-quatre pixels
             * clignoteraient à côté des couleurs. Un aperçu montre le résultat, il ne le
             * joue pas ; c'est déjà la règle des vignettes de silhouette juste en dessous.
             */
            <path key={i} d={m.d} opacity={m.opacite}
              fill={m.degrade ? `url(#${m.degrade}-${marque})` : m.couleur ?? "none"}
              clipPath={m.decoupe ? `url(#${m.decoupe}-${marque})` : undefined}
              fillRule={m.regleDeRemplissage}
              stroke={m.trait ?? "none"} strokeWidth={m.epaisseur ?? 0}
              strokeLinejoin="round" strokeLinecap="round" />
          ))}
        </g>
      </svg>
    </button>
  );
}
