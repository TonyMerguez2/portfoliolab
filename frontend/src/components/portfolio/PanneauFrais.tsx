"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { FONT } from "@/lib/typography";
import { JETONS, RAYONS } from "@/lib/palette";

/**
 * Saisie des frais courants, ligne par ligne.
 *
 * ⚠️ Le seul moyen de mesurer les frais d'un portefeuille européen. Le fournisseur
 * de cours ne publie presque jamais le TER des ETF domiciliés en Europe : mesuré
 * sur un vrai PEA, un seul des trois fonds l'annonçait, soit 10 % du portefeuille —
 * sous le seuil de couverture de soixante pour cent, donc le facteur restait muet.
 *
 * Or les frais sont le facteur le plus prédictif du résultat relatif d'un
 * portefeuille de fonds sur vingt ans, et le seul qui soit **certain** : les
 * rendements sont espérés, les frais sont prélevés. Renoncer à les mesurer parce
 * qu'une API est avare serait renoncer à ce qui compte le plus.
 *
 * Et l'épargnant a le chiffre : il figure en toutes lettres sur le document
 * d'information clé de chaque fonds, sous « frais courants ». Le lui demander est
 * moins coûteux que de le laisser sans note.
 */
export default function PanneauFrais({
  lignes, valeurs, surFrais, fermer, ancre,
}: {
  /** Les tickers détenus, dans l'ordre d'affichage. */
  lignes: { ticker: string; part: number }[];
  /** Les frais déjà connus, du fournisseur ou d'une saisie précédente. */
  valeurs: Record<string, number | null>;
  surFrais: (frais: Record<string, number>) => void;
  fermer: () => void;
  ancre: { droite: number; haut: number };
}) {
  /**
   * ⚠️ Les saisies vivent en **texte** et non en nombre.
   *
   * Un état numérique force à convertir à chaque frappe : « 0, » devient 0, et le
   * champ se réécrit sous les doigts dès qu'on tape la virgule. Le texte laisse la
   * saisie intacte et la conversion n'a lieu qu'à l'enregistrement.
   */
  const [saisies, setSaisies] = useState<Record<string, string>>(() => {
    const depart: Record<string, string> = {};
    for (const l of lignes) {
      const v = valeurs[l.ticker];
      depart[l.ticker] = v == null ? "" : String(v);
    }
    return depart;
  });

  /** La virgule décimale est acceptée : c'est la séparatrice française. */
  const nombre = (t: string): number | null => {
    const net = t.trim().replace(",", ".");
    if (!net) return null;
    if (!/^\d{1,2}(\.\d{1,3})?$/.test(net)) return NaN;
    const v = parseFloat(net);
    return v >= 0 && v <= 5 ? v : NaN;
  };

  const fautes = lignes.filter(l => Number.isNaN(nombre(saisies[l.ticker] ?? "")));
  const remplies = lignes.filter(l => {
    const v = nombre(saisies[l.ticker] ?? "");
    return v != null && !Number.isNaN(v);
  });
  // La couverture décide de la mesure : sous soixante pour cent du portefeuille, le
  // facteur reste muet, et l'annoncer évite une saisie partielle sans effet visible.
  const couverture = remplies.reduce((s, l) => s + l.part, 0);
  const valide = fautes.length === 0 && remplies.length > 0;

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={fermer} />
      <div role="dialog" aria-label="Frais courants des fonds" style={{
        position: "fixed", top: ancre.haut, right: ancre.droite, zIndex: 41, width: 290,
        background: JETONS.carte, border: `1px solid ${JETONS.bordFort}`,
        borderRadius: RAYONS.md, padding: 14, boxShadow: JETONS.ombre,
      }}>
        <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
                      color: JETONS.texteAttenue, marginBottom: 4 }}>FRAIS COURANTS</div>
        <p style={{ margin: "0 0 12px", fontFamily: FONT, fontSize: 10.5,
                    color: JETONS.texteAttenue, lineHeight: 1.45 }}>
          Le fournisseur de cours ne publie pas le TER des ETF européens. Le chiffre
          figure sur le document d&apos;information clé de chaque fonds, sous
          «&nbsp;frais courants&nbsp;», en pourcentage par an.
        </p>

        {lignes.map(l => {
          const brut = saisies[l.ticker] ?? "";
          const faux = Number.isNaN(nombre(brut));
          return (
            <label key={l.ticker}
              style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
              <span style={{ flex: 1, minWidth: 0, fontFamily: FONT, fontSize: 11,
                             color: JETONS.texteFort, overflow: "hidden",
                             textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {l.ticker}
                <span style={{ marginLeft: 5, fontSize: 9.5, color: JETONS.texteAttenue }}>
                  {l.part.toFixed(0)}&nbsp;%
                </span>
              </span>
              <input
                value={brut}
                onChange={e => setSaisies(s => ({
                  ...s,
                  // Chiffres, virgule et point seulement : le reste ne peut pas être
                  // un taux, et le refuser à la frappe évite un message d'erreur.
                  [l.ticker]: e.target.value.replace(/[^\d.,]/g, "").slice(0, 6),
                }))}
                inputMode="decimal"
                placeholder="0,15"
                aria-label={`Frais courants de ${l.ticker}, en pourcentage par an`}
                aria-invalid={faux}
                style={{
                  width: 66, height: 26, padding: "0 7px", boxSizing: "border-box",
                  textAlign: "right",
                  background: JETONS.segmentPiste,
                  border: `1px solid ${faux ? JETONS.negatif : JETONS.bord}`,
                  borderRadius: RAYONS.xs, color: JETONS.texteIntense,
                  fontFamily: FONT, fontSize: 11.5,
                }} />
              <span style={{ fontFamily: FONT, fontSize: 10.5, color: JETONS.texteAttenue,
                             width: 30 }}>%/an</span>
            </label>
          );
        })}

        <p style={{ margin: "8px 0 0", fontFamily: FONT, fontSize: 10,
                    color: couverture >= 60 ? JETONS.texteAttenue : JETONS.attentionFort,
                    lineHeight: 1.45, minHeight: 28 }}>
          {fautes.length > 0
            ? "Un taux s'exprime en pourcentage annuel, entre 0 et 5 — par exemple 0,15."
            : couverture >= 60
              ? `${couverture.toFixed(0)} % du portefeuille renseigné : le facteur sera noté.`
              : `${couverture.toFixed(0)} % renseigné. Il en faut 60 pour que la note soit`
                + " calculée — sous ce seuil, une moyenne partielle serait flatteuse et fausse."}
        </p>

        <button type="button" disabled={!valide}
          onClick={() => {
            const sortie: Record<string, number> = {};
            for (const l of lignes) {
              const v = nombre(saisies[l.ticker] ?? "");
              if (v != null && !Number.isNaN(v)) sortie[l.ticker] = v;
            }
            surFrais(sortie);
            fermer();
          }}
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
