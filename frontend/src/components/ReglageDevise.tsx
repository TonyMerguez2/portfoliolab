"use client";
import { useState } from "react";

import Cadre from "@/components/ui/Cadre";
import { useDevise } from "@/hooks/useDevise";

/**
 * Le choix de la devise d'affichage du site.
 *
 * ⚠️ **Chaque devise montre son taux du jour, et sa date.** C'est ce qui rend le réglage
 * vérifiable : « 1 $ = 0,8662 € » se compare à n'importe quelle source en deux secondes.
 * Sans ce chiffre, une paire de change inversée — 1,16 au lieu de 0,86, deux nombres
 * également plausibles — passerait inaperçue et fausserait tout ce qui en dépend.
 *
 * ⚠️ **Le dollar est le défaut parce qu'il n'applique aucune conversion.** Les séries de
 * cours du fournisseur sont majoritairement libellées en dollars ; c'est donc le seul choix
 * qui n'introduit aucune approximation. Les autres le disent.
 */
export default function ReglageDevise() {
  const { devises, code, active, etat, erreur, changer } = useDevise();
  const [enCours, setEnCours] = useState<string | null>(null);

  const choisir = async (nouveau: string) => {
    if (nouveau === code) return;
    setEnCours(nouveau);
    await changer(nouveau);
    setEnCours(null);
  };

  return (
    <Cadre style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 650, color: "var(--nv-texte)" }}>
          Devise d’affichage
        </h2>
        <p style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.5, color: "var(--nv-texte-secondaire)" }}>
          La devise dans laquelle les montants du site vous sont présentés. Elle ne change
          rien à vos placements : c’est une unité de lecture.
        </p>
      </div>

      {etat === "charge" && (
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--nv-texte-attenue)" }}>Chargement…</p>
      )}

      {etat === "erreur" && (
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--nv-negatif)" }}>
          Liste des devises indisponible — serveur injoignable.
        </p>
      )}

      {etat === "pret" && (
        <div style={{
          display: "grid", gap: 8,
          gridTemplateColumns: "repeat(auto-fill, minmax(196px, 1fr))",
        }}>
          {devises.map(d => {
            const choisie = d.code === code;
            return (
              <button
                key={d.code}
                type="button"
                onClick={() => choisir(d.code)}
                aria-pressed={choisie}
                disabled={enCours !== null}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "11px 13px", borderRadius: 12, textAlign: "left",
                  background: choisie ? "var(--nv-accent-doux)" : "var(--nv-carte-creuse)",
                  border: `1px solid ${choisie ? "var(--nv-accent-bord)" : "var(--nv-bord)"}`,
                  cursor: enCours !== null ? "progress" : "pointer",
                  // Atténué pendant l'enregistrement, jamais démonté : la grille garderait
                  // sinon un trou et les tuiles se déplaceraient sous le curseur.
                  opacity: enCours !== null && !choisie ? 0.55 : 1,
                  transition: "background 140ms, border-color 140ms, opacity 140ms",
                }}
              >
                <span aria-hidden="true" style={{
                  width: 34, height: 34, flexShrink: 0, borderRadius: 9,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: choisie ? "var(--nv-accent)" : "var(--nv-carte-creuse)",
                  // ⚠️ Un liseré, parce que le fond seul ne suffit pas dans les deux
                  // thèmes. En clair, `--nv-carte-creuse` vaut #F9FAFB — exactement le fond
                  // de la tuile : la vignette disparaissait, seul le symbole restait. Le
                  // thème sombre ne le montrait pas, la même variable y étant translucide
                  // sur un fond noir. Mesuré à l'écran, pas déduit.
                  border: choisie ? "1px solid transparent" : "1px solid var(--nv-bord-fort)",
                  color: choisie ? "#fff" : "var(--nv-texte-secondaire)",
                  fontSize: d.symbole.length > 1 ? 11 : 15, fontWeight: 700,
                }}>{d.symbole}</span>
                <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{
                    fontSize: 13, fontWeight: choisie ? 650 : 550,
                    color: "var(--nv-texte)", whiteSpace: "nowrap",
                    overflow: "hidden", textOverflow: "ellipsis",
                  }}>{d.nom}</span>
                  <span style={{
                    fontSize: 11, color: "var(--nv-texte-attenue)",
                    fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
                  }}>
                    {d.conversion
                      ? (d.taux_clair ?? "taux indisponible")
                      : "aucune conversion"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {erreur && (
        <p style={{
          margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--nv-negatif)",
        }}>{erreur}</p>
      )}

      {/* ⚠️ Ce paragraphe dit ce que le réglage fait *aujourd'hui*. Les rendements de
          référence et le backtest sont calculés sur des fonds cotés en dollars ; les
          convertir demande le taux de chaque séance, pas celui du jour. Tant que ce n'est
          pas fait, l'annoncer converti serait un mensonge — et appliquer le taux du jour à
          toute l'histoire en serait un autre, invisible : la conversion s'annule dans le
          rapport final sur initial, le rendement reste inchangé et l'on croit avoir
          converti alors qu'on a seulement changé l'étiquette. */}
      {etat === "pret" && active?.conversion && (
        <p style={{
          margin: 0, fontSize: 11.5, lineHeight: 1.55, color: "var(--nv-texte-attenue)",
          borderTop: "1px solid var(--nv-bord)", paddingTop: 12,
        }}>
          Les rendements de référence et le backtest d’allocation restent calculés en
          dollars, devise de cotation des fonds employés
          {active.taux_date ? ` — taux relevé le ${active.taux_date.split("-").reverse().join("/")}` : ""}.
        </p>
      )}
    </Cadre>
  );
}
