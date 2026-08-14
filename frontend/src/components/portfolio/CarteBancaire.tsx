"use client";
import { CARTE_ACTIF } from "@/components/portfolio/CarteActif";
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
 * ⚠️ **Elle ne montre aucun numéro réel, et n'en connaît aucun.** Les quatre derniers
 * chiffres sont facultatifs et déclarés ; à défaut, les points suffisent. Une carte n'a
 * jamais eu besoin de son numéro pour se reconnaître comme carte, et un vrai numéro n'aurait
 * rien à faire dans une base qui n'en a pas l'usage.
 */
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
        borderRadius: 18, boxSizing: "border-box", padding: "15px 17px",
        background: `linear-gradient(145deg, ${arete} 0%, ${fond} 62%)`,
        border: "1px solid rgba(255,255,255,0.10)",
        display: "flex", flexDirection: "column", gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: FONT, fontSize: 14.5, fontWeight: 600, color: "rgba(255,255,255,0.96)",
            lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {intitule}
          </div>
          <div style={{ fontFamily: FONT, fontSize: 11.5, color: "rgba(255,255,255,0.52)", marginTop: 2 }}>
            {mention}
          </div>
        </div>
        {/* Le fronton d'une banque : c'est le pictogramme du genre, pas un logo
            d'établissement — celui-là a sa place sur le dossier, où l'épargnant le pose. */}
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)"
          strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M3 10h18M5 10v8m4-8v8m6-8v8m4-8v8M2 21h20M12 3l9 5H3z" />
        </svg>
      </div>

      {/**
        * La puce. Un rectangle arrondi doré barré de deux traits — c'est le seul détail qui
        * fait lire « carte » plutôt que « rectangle », et il tient en six lignes de SVG.
        */}
      <svg width="34" height="26" viewBox="0 0 34 26" aria-hidden="true">
        <rect x="0.5" y="0.5" width="33" height="25" rx="5"
          fill="rgba(255,255,255,0.22)" stroke="rgba(255,255,255,0.30)" />
        <path d="M12 1v24M22 1v24M1 9h32M1 17h32"
          stroke="rgba(255,255,255,0.28)" strokeWidth={1.2} />
      </svg>

      <div style={{
        ...NUM, fontSize: 15, letterSpacing: "0.12em",
        color: "rgba(255,255,255,0.80)", marginTop: "auto",
      }}>
        •••• ••••{derniers ? ` ${derniers}` : " ••••"}
      </div>
    </div>
  );
}
