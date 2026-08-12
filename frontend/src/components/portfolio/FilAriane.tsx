import { FONT } from "@/lib/typography";
import { CLAIR } from "@/lib/palette";

/**
 * Le chemin parcouru, quand un dossier est ouvert.
 *
 * ⚠️ **C'est ce qui remplace la présence simultanée des dossiers et des cartes.** Les
 * dossiers occupent la place des cartes ; ouvrir l'un d'eux échange le contenu de cette
 * place au lieu de s'ajouter dessous. Sans repère, l'utilisateur ne saurait ni où il se
 * trouve, ni comment revenir : le chemin est donc la contrepartie obligatoire de
 * l'échange, pas une décoration.
 *
 * ⚠️ **Deux cibles pour un seul retour, et c'est voulu.** La flèche et la racine font la
 * même chose. C'est ce que font les explorateurs de fichiers, parce que l'une est le
 * geste appris et l'autre la cible évidente — supprimer la flèche oblige à viser un mot
 * de sept pixels de haut.
 */
export default function FilAriane({
  racine, courant, couleur, onRacine,
}: {
  /** Le nom du niveau supérieur — celui vers lequel on remonte. */
  racine: string;
  /** Le dossier ouvert. */
  courant: string;
  /** La couleur du dossier ouvert, reprise sur la pastille. */
  couleur?: string;
  onRacine: () => void;
}) {
  const lien: React.CSSProperties = {
    fontFamily: FONT, fontSize: 12.5, fontWeight: 500, color: CLAIR.texteSecondaire,
    background: "none", border: 0, padding: 0, cursor: "pointer", whiteSpace: "nowrap",
  };
  return (
    <nav aria-label="Chemin" style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <button type="button" onClick={onRacine} aria-label={`Revenir à ${racine}`}
        style={{
          width: 24, height: 24, borderRadius: "50%", flexShrink: 0, border: 0,
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          background: CLAIR.carteCreuse, color: CLAIR.texteSecondaire,
        }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>

      <ol style={{
        display: "flex", alignItems: "center", gap: 6, minWidth: 0,
        listStyle: "none", margin: 0, padding: 0,
      }}>
        <li>
          <button type="button" onClick={onRacine} style={lien}>{racine}</button>
        </li>
        <li aria-hidden="true" style={{ color: CLAIR.texteFaible, fontSize: 12, lineHeight: 1 }}>/</li>
        <li aria-current="page" style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          {couleur && (
            <span aria-hidden="true" style={{
              width: 8, height: 8, borderRadius: "50%", background: couleur, flexShrink: 0,
            }} />
          )}
          <span style={{
            fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: CLAIR.surFond,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {courant}
          </span>
        </li>
      </ol>
    </nav>
  );
}
