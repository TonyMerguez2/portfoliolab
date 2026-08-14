"use client";
import { CARTE_ACTIF } from "@/components/portfolio/CarteActif";
import { CARTE_COMPTE } from "@/components/portfolio/CarteCompte";
import { decalerClarte } from "@/lib/couleur";
import { FONT, NUM } from "@/lib/typography";

/**
 * La carte bancaire qui dépasse d'un dossier de trésorerie.
 *
 * ⚠️ **Elle occupe la place d'une carte d'actif, et c'est toute son idée.** Un dossier
 * laisse voir ce qu'il range : des lignes pour un PEA, une carte pour un compte courant. La
 * zone dégagée au-dessus du plan ne montrait rien sur un compte de trésorerie — un vide qui
 * se lisait « à remplir » alors que ce compte ne recevra jamais de ligne. Elle reprend donc
 * les dimensions exactes de `CARTE_ACTIF` : le dossier la rogne de la même façon, sans un
 * calcul de plus.
 *
 * ⚠️ **Tout son contenu tient dans ce que le dossier ne cache pas, et c'est une découpe en
 * L.** Vu à l'écran : dessinée comme une carte ordinaire, avec sa puce au milieu et son
 * numéro en bas, elle n'en laissait paraître que l'en-tête. Ce qui échappe au plan, c'est
 * une bande de 46 pixels sur toute la largeur, prolongée jusqu'à 68 **à droite de la
 * languette seulement**. Le numéro se range donc dans ce prolongement, et rien d'essentiel
 * ne descend plus bas.
 *
 * ⚠️ **Elle ne montre aucun numéro réel, et n'en connaît aucun.** Les quatre derniers
 * chiffres sont facultatifs et déclarés ; à défaut, les points suffisent. Une carte n'a
 * jamais eu besoin de son numéro pour se reconnaître comme carte, et un vrai numéro n'aurait
 * rien à faire dans une base qui n'en a pas l'usage.
 */

/** Ce qui reste visible sur toute la largeur : la bande au-dessus de la languette. */
const BANDE = CARTE_COMPTE.apercu - CARTE_COMPTE.languette.hauteur;
/** À droite de la languette, la carte respire jusqu'au plan. */
const DEBORD = CARTE_COMPTE.languette.largeur - 16;
export default function CarteBancaire({
  intitule, mention, couleur, derniers,
}: {
  /** Ce que la carte annonce en tête — « Compte courant », « Livret A ». */
  intitule: string;
  /** La ligne sous l'intitulé — « Solde disponible ». */
  mention: string;
  /** La couleur du dossier, dont la carte tire sa propre teinte. */
  couleur: string;
  /** Les quatre derniers chiffres, s'ils ont été déclarés. */
  derniers?: string | null;
}) {
  /**
   * ⚠️ **La carte est bien plus sombre que son dossier, et c'est ce qui les distingue.**
   * Posée dans la teinte du dossier, elle s'y fondait : on ne voyait plus qu'un aplat de
   * couleur dépassant d'un autre aplat de la même couleur. Sur la référence, la carte est
   * presque noire et le dossier lumineux — deux objets, pas un dégradé.
   */
  const fond = decalerClarte(couleur, -0.34);
  const arete = decalerClarte(couleur, -0.22);

  return (
    <div
      aria-hidden="true"
      style={{
        width: CARTE_ACTIF.largeur, height: CARTE_ACTIF.hauteur,
        borderRadius: 18, boxSizing: "border-box", padding: "0 17px",
        background: `linear-gradient(145deg, ${arete} 0%, ${fond} 62%)`,
        border: "1px solid rgba(255,255,255,0.10)",
        display: "flex", flexDirection: "column",
      }}
    >
      {/* La bande du haut : puce, intitulé, mention, pictogramme. Tout y tient. */}
      <div style={{ height: BANDE, display: "flex", alignItems: "center", gap: 11 }}>
        {/**
          * La puce. Un rectangle arrondi barré de deux traits — c'est le seul détail qui
          * fait lire « carte » plutôt que « rectangle », et il tient en trois lignes de SVG.
          */}
        <svg width="30" height="23" viewBox="0 0 34 26" aria-hidden="true" style={{ flexShrink: 0 }}>
          <rect x="0.5" y="0.5" width="33" height="25" rx="5"
            fill="rgba(255,255,255,0.22)" stroke="rgba(255,255,255,0.30)" />
          <path d="M12 1v24M22 1v24M1 9h32M1 17h32"
            stroke="rgba(255,255,255,0.28)" strokeWidth={1.2} />
        </svg>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontFamily: FONT, fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.96)",
            lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {intitule}
          </div>
          <div style={{ fontFamily: FONT, fontSize: 11, color: "rgba(255,255,255,0.52)", marginTop: 1 }}>
            {mention}
          </div>
        </div>

        {/* Le fronton d'une banque : le pictogramme du genre, pas un logo d'établissement —
            celui-là a sa place sur le dossier, où l'épargnant le pose. */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)"
          strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M3 10h18M5 10v8m4-8v8m6-8v8m4-8v8M2 21h20M12 3l9 5H3z" />
        </svg>
      </div>

      {/* Le numéro, dans le prolongement que la languette laisse libre à droite. */}
      <div style={{
        height: CARTE_COMPTE.languette.hauteur, paddingLeft: DEBORD,
        display: "flex", alignItems: "center", justifyContent: "flex-end",
      }}>
        <span style={{
          ...NUM, fontSize: 13, letterSpacing: "0.14em", color: "rgba(255,255,255,0.78)",
          whiteSpace: "nowrap",
        }}>
          •••• ••••{derniers ? ` ${derniers}` : " ••••"}
        </span>
      </div>
    </div>
  );
}
