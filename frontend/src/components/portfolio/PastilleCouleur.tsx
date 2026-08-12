import { decalerClarte } from "@/lib/couleur";

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
        outline: retenue ? "2px solid rgba(20,22,30,0.55)" : "none",
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
