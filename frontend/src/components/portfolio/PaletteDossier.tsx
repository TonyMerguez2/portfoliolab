"use client";

import PastillesCouleur from "@/components/portfolio/PastillesCouleur";
import { CLAIR, RAYONS } from "@/lib/palette";
import { FONT } from "@/lib/typography";

/**
 * La couleur d'un dossier **déduit**, et rien d'autre.
 *
 * ⚠️ **Un écran séparé du formulaire de déclaration, parce qu'il n'y a rien d'autre à
 * dire.** Un dossier déduit — PEA, compte-titres, crypto — n'a pas été saisi : il existe
 * parce que des lignes s'y rangent d'après leur place de cotation. Son nom vient de
 * l'enveloppe, son contenu des lignes, son solde de leur valorisation. Lui présenter le
 * formulaire complet aurait montré quatre champs dont trois inertes, et promis une
 * déclaration qui n'a pas lieu.
 *
 * ⚠️ **Il dit ce qu'il ne fait pas.** Changer la couleur d'un dossier deviné ne le déclare
 * pas, ne rattache aucune ligne et ne crée aucun compte. Sans cette phrase, l'écran
 * ressemble assez au formulaire de déclaration pour qu'on croie avoir déclaré.
 */
export default function PaletteDossier({
  nom, couleur, surMesure, onChoisir, onReinitialiser, onFermer,
}: {
  /** Le nom de l'enveloppe, tel qu'il s'affiche sur le dossier. */
  nom: string;
  couleur: string;
  /** La couleur a-t-elle déjà été choisie, ou est-ce encore celle d'origine ? */
  surMesure: boolean;
  onChoisir: (hex: string) => void;
  onReinitialiser: () => void;
  onFermer: () => void;
}) {
  return (
    <div onClick={onFermer}
      style={{
        position: "fixed", inset: 0, zIndex: 60, display: "flex",
        alignItems: "center", justifyContent: "center", padding: 20,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)",
      }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          width: 340, maxWidth: "100%",
          background: CLAIR.carte, border: `1px solid ${CLAIR.bord}`,
          borderRadius: RAYONS.sm, padding: "18px 20px",
          display: "flex", flexDirection: "column", gap: 14,
        }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 700, color: CLAIR.texte }}>
            Dossier {nom}
          </span>
          <button type="button" onClick={onFermer} aria-label="Fermer"
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontFamily: FONT, fontSize: 16, lineHeight: 1, color: CLAIR.texteFaible,
            }}>
            ×
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{
            fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
            color: CLAIR.texteFaible, textTransform: "uppercase",
          }}>
            Couleur du dossier
          </span>
          <PastillesCouleur couleur={couleur} onChoisir={onChoisir} />
        </div>

        <span style={{ fontFamily: FONT, fontSize: 10.5, color: CLAIR.texteAttenue,
          lineHeight: 1.45 }}>
          Ce dossier est déduit de vos lignes : son nom et son contenu viennent de leur
          place de cotation. Seule son apparence se règle ici.
        </span>

        {surMesure && (
          <button type="button" onClick={onReinitialiser}
            style={{
              alignSelf: "flex-start", background: "none", border: "none", padding: 0,
              cursor: "pointer", fontFamily: FONT, fontSize: 11,
              color: CLAIR.texteSecondaire, textDecoration: "underline",
            }}>
            Rendre au dossier sa couleur d’origine
          </button>
        )}
      </div>
    </div>
  );
}
