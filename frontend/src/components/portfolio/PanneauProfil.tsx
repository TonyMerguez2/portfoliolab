"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import Segments from "@/components/ui/Segments";
import { FONT } from "@/lib/typography";
import { JETONS, RAYONS } from "@/lib/palette";
import { TOLERANCES, type Profil, type Tolerance } from "@/lib/analyse";

/**
 * Déclaration du profil de risque : horizon et tolérance.
 *
 * ⚠️ Deux questions et pas une, parce qu'elles ne disent pas la même chose.
 * L'horizon dit ce que l'épargnant peut se **permettre** — un creux de trois ans
 * ne compte pas quand on investit sur vingt — et la tolérance ce qu'il peut
 * **supporter**, qui se mesure au fait de vendre ou non dans la baisse. Le calcul
 * retient le plus contraignant des deux : se savoir capable d'attendre ne sert à
 * rien si l'on vend au premier creux.
 *
 * Les trois intitulés de tolérance décrivent un **comportement** et non une envie.
 * « Dynamique » ne veut rien dire à qui n'a jamais vu son épargne baisser de
 * moitié ; « une baisse de moitié ne me ferait pas vendre » se répond.
 */
export default function PanneauProfil({
  profil, surProfil, fermer, ancre,
}: {
  profil: Profil | null;
  surProfil: (horizon: number, tolerance: Tolerance) => void;
  fermer: () => void;
  ancre: { droite: number; haut: number };
}) {
  const [horizon, setHorizon] = useState(String(profil?.horizon_annees ?? 15));
  const [tolerance, setTolerance] = useState<Tolerance>(profil?.tolerance ?? "equilibre");

  const annees = Math.max(1, Math.min(60, parseInt(horizon, 10) || 0));
  const valide = /^\d{1,2}$/.test(horizon.trim()) && annees >= 1;

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={fermer} />
      <div role="dialog" aria-label="Profil de risque" style={{
        position: "fixed", top: ancre.haut, right: ancre.droite, zIndex: 41, width: 268,
        background: JETONS.carte, border: `1px solid ${JETONS.bordFort}`,
        borderRadius: RAYONS.md, padding: 14, boxShadow: JETONS.ombre,
      }}>
        <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
                      color: JETONS.texteAttenue, marginBottom: 4 }}>PROFIL DE RISQUE</div>
        <p style={{ margin: "0 0 12px", fontFamily: FONT, fontSize: 10.5,
                    color: JETONS.texteAttenue, lineHeight: 1.45 }}>
          Trois facteurs — volatilité, perte maximale et sensibilité au marché —
          ne sont mesurés que sans être notés tant que votre intention n&apos;est pas
          connue.
        </p>

        <label style={{ display: "block", fontFamily: FONT, fontSize: 11,
                        color: JETONS.texteFort, marginBottom: 5 }}>
          Dans combien d&apos;années comptez-vous en avoir besoin&nbsp;?
        </label>
        <input
          value={horizon}
          onChange={e => setHorizon(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
          inputMode="numeric"
          aria-label="Horizon en années"
          style={{
            width: "100%", height: 28, padding: "0 8px", boxSizing: "border-box",
            background: JETONS.segmentPiste, border: `1px solid ${valide ? JETONS.bord : JETONS.negatif}`,
            borderRadius: RAYONS.xs, color: JETONS.texteIntense,
            fontFamily: FONT, fontSize: 12, marginBottom: 12,
          }} />

        <label style={{ display: "block", fontFamily: FONT, fontSize: 11,
                        color: JETONS.texteFort, marginBottom: 5 }}>
          Si votre portefeuille baissait fortement&nbsp;?
        </label>
        <Segments
          taille="sm"
          ariaLabel="Tolérance au risque"
          valeur={tolerance}
          onChange={setTolerance}
          options={TOLERANCES.map(t => ({ valeur: t.valeur, libelle: t.libelle, titre: t.detail }))}
        />
        <p style={{ margin: "8px 0 0", fontFamily: FONT, fontSize: 10,
                    color: JETONS.texteAttenue, lineHeight: 1.45, minHeight: 28 }}>
          {TOLERANCES.find(t => t.valeur === tolerance)?.detail}
        </p>

        <button type="button" disabled={!valide}
          onClick={() => { surProfil(annees, tolerance); fermer(); }}
          style={{
            marginTop: 10, width: "100%", height: 28, cursor: valide ? "pointer" : "default",
            borderRadius: RAYONS.xs, background: JETONS.segmentActif,
            border: "none", color: JETONS.segmentEncre,
            fontFamily: FONT, fontSize: 11.5, fontWeight: 600,
            opacity: valide ? 1 : 0.4,
          }}>
          Enregistrer
        </button>
      </div>
    </>,
    document.body,
  );
}
