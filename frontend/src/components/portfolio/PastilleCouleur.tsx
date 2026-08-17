import { useId } from "react";

import { decalerClarte } from "@/lib/couleur";
import { JETONS } from "@/lib/palette";
import type { Decoupe, Degrade, MotifPlat } from "@/lib/avatarSkins";

/**
 * ⚠️ **L'anneau de sélection prend l'encre du thème, il n'est plus écrit en dur.** Il valait
 * `rgba(20,22,30,0.55)` — un gris presque noir choisi pour l'ancien panneau, qui était une
 * carte blanche quel que soit le thème. Ce panneau est devenu une fenêtre de l'application,
 * donc sombre : l'anneau y est passé invisible, et l'on ne voyait plus quelle couleur était
 * retenue. Une valeur en dur survit exactement jusqu'au jour où son fond change.
 */

/**
 * Une pastille de couleur bombée, comme sur la référence.
 *
 * ⚠️ **Le relief tient à quatre ombres qui se répondent, pas à un dégradé.** Un simple
 * dégradé du clair au sombre donne un disque plat qu'on a peint : ce qui fait la
 * pastille de bonbon, c'est la lumière posée en haut *à l'intérieur*, le creux en bas
 * *à l'intérieur*, l'ombre portée en dessous et le halo de sa propre couleur autour.
 * Retirer l'une des quatre suffit à faire retomber l'objet à plat — j'ai essayé.
 *
 * ⚠️ **Le halo prend la couleur de la pastille, pas du noir.** C'est ce qui donne
 * l'impression que le disque est translucide et éclairé de l'intérieur. Un halo neutre
 * l'aurait fait ressembler à un jeton posé sur la carte.
 *
 * ⚠️ **Les teintes du relief sont calculées, pas écrites.** Elles se déduisent de la
 * couleur par un décalage de clarté : une table de variantes aurait interdit le champ
 * libre, où la couleur n'est connue qu'au moment du clic.
 */
export default function PastilleCouleur({
  couleur, taille = 34, retenue = false, titre, onClick,
}: {
  couleur: string;
  taille?: number;
  /** La couleur en cours : elle porte un anneau, seule marque qui ne la salit pas. */
  retenue?: boolean;
  titre?: string;
  onClick?: () => void;
}) {
  const haut = decalerClarte(couleur, 0.16);
  const bas = decalerClarte(couleur, -0.13);
  return (
    <button
      type="button"
      onClick={onClick}
      title={titre}
      aria-label={titre}
      aria-pressed={retenue}
      style={{
        width: taille, height: taille, borderRadius: "50%", padding: 0, border: 0,
        cursor: "pointer", flexShrink: 0, position: "relative",
        // La lumière vient d'en haut, un peu à gauche : c'est l'inclinaison de la
        // référence, et elle doit être la même sur toutes les pastilles pour qu'on les
        // lise comme un même jeu d'objets éclairés par une seule source.
        background: `radial-gradient(circle at 42% 26%, ${haut} 0%, ${couleur} 54%, ${bas} 100%)`,
        boxShadow: [
          `0 0 ${Math.round(taille * 0.3)}px ${Math.round(taille * 0.04)}px ${couleur}59`,
          `0 ${Math.round(taille * 0.06)}px ${Math.round(taille * 0.12)}px rgba(0,0,0,0.20)`,
          `inset 0 ${-Math.round(taille * 0.07)}px ${Math.round(taille * 0.11)}px rgba(0,0,0,0.22)`,
          `inset 0 ${Math.round(taille * 0.06)}px ${Math.round(taille * 0.09)}px rgba(255,255,255,0.30)`,
        ].join(", "),
        outline: retenue ? `2px solid ${JETONS.texteIntense}` : "none",
        outlineOffset: 2,
        transition: "transform 120ms ease",
      }}
    />
  );
}

/**
 * Le « + » de la référence : la couleur libre.
 *
 * ⚠️ **Il ouvre le sélecteur du système, il n'en réinvente pas un.** Une roue chromatique
 * maison, c'est une teinte, une saturation, une clarté et un champ hexadécimal à tenir —
 * là où le navigateur en propose déjà un que l'utilisateur connaît, avec la pipette de
 * son système. Le champ natif est simplement rendu invisible et déclenché par le bouton,
 * parce que son apparence, elle, n'est pas réglable.
 */
export function PastillePlus({
  taille = 34, valeur, onChange,
}: {
  taille?: number;
  valeur: string;
  onChange: (hex: string) => void;
}) {
  const trait = Math.max(2, Math.round(taille * 0.09));
  const bras = Math.round(taille * 0.52);
  return (
    <label
      title="Une autre couleur"
      style={{
        width: taille, height: taille, flexShrink: 0, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative",
      }}
    >
      <input
        type="color"
        value={valeur}
        aria-label="Une autre couleur"
        onChange={e => onChange(e.target.value)}
        // Invisible mais présent : c'est lui qui ouvre le sélecteur du système, et un
        // `display: none` l'empêcherait de recevoir le clic sur certains navigateurs.
        style={{
          position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%",
          padding: 0, border: 0, cursor: "pointer",
        }}
      />
      <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`}
        aria-hidden="true" style={{ display: "block", pointerEvents: "none" }}>
        {/* Le trait porte sa propre ombre, comme sur la référence : sans elle il paraît
            collé sur la carte alors que les pastilles, elles, en décollent. */}
        <g stroke="#4A5058" strokeWidth={trait} strokeLinecap="round"
          style={{ filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.28))" }}>
          <line x1={(taille - bras) / 2} y1={taille / 2} x2={(taille + bras) / 2} y2={taille / 2} />
          <line x1={taille / 2} y1={(taille - bras) / 2} x2={taille / 2} y2={(taille + bras) / 2} />
        </g>
      </svg>
    </label>
  );
}

/**
 * Une pastille qui montre un **habillage** plutôt qu'une couleur.
 *
 * ⚠️ **Le même objet que ses voisines, à la peinture près.** Elle vit dans la rangée des
 * couleurs parce qu'elle décrit la même chose — ce que porte la tête — et il n'y a rien à
 * composer entre les deux : l'habillage recouvre la couleur. Elle en reprend donc le
 * diamètre, l'ombre portée, le creux et la lumière du haut, sans quoi elle se lirait
 * comme un bouton étranger tombé au milieu d'un jeu de bonbons.
 *
 * ⚠️ **Le halo est neutre, lui.** Celui des pastilles prend leur couleur, ce qui les fait
 * paraître éclairées de l'intérieur ; un aplat à deux teintes n'a pas de couleur unique à
 * rayonner, et lui en imposer une aurait teinté l'océan ou les terres au hasard.
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
      style={{
        width: taille, height: taille, borderRadius: rayon, padding: 0, border: 0,
        cursor: "pointer", flexShrink: 0, position: "relative", overflow: "hidden",
        background: fond,
        boxShadow: [
          `0 ${Math.round(taille * 0.06)}px ${Math.round(taille * 0.12)}px rgba(0,0,0,0.20)`,
          `inset 0 ${-Math.round(taille * 0.07)}px ${Math.round(taille * 0.11)}px rgba(0,0,0,0.22)`,
          `inset 0 ${Math.round(taille * 0.06)}px ${Math.round(taille * 0.09)}px rgba(255,255,255,0.30)`,
        ].join(", "),
        outline: retenue ? `2px solid ${JETONS.texteIntense}` : "none",
        outlineOffset: 2,
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
