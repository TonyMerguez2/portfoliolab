"use client";
import type { Projection } from "@/hooks/useProjection";
import { bornes, chemin, echelles } from "@/lib/courbeProjection";
import { euros } from "@/lib/objectifs";
import { CLAIR, JETONS, RAYONS } from "@/lib/palette";
import { FONT, NUM } from "@/lib/typography";

/**
 * Les trois enveloppes, détaillées côte à côte.
 *
 * ⚠️ **La maquette affichait une probabilité par scénario — 25 %, 50 %, 25 % — et ces
 * nombres n'existent pas.** Ce sont des poids inventés, comme si l'avenir se répartissait
 * en trois cas d'inégale chance. Ce que les tirages disent est autre chose et se dit
 * exactement : le 5ᵉ centile est la valeur sous laquelle **5 %** des tirages terminent, le
 * 50ᵉ celle sous laquelle la moitié termine. C'est ce qui est écrit ici.
 *
 * ⚠️ **Aucune de ces trois cartes n'est un avenir.** Un portefeuille ne suit pas le
 * cinquième centile pendant vingt ans : ce centile change de trajectoire chaque mois. Les
 * cartes servent à situer une dispersion, pas à parier.
 */

const CARTES = [
  { centile: "95", titre: "95ᵉ centile", couleur: JETONS.positif,
    sens: "95 % des tirages terminent en dessous" },
  { centile: "50", titre: "Médiane", couleur: JETONS.accent,
    sens: "la moitié des tirages terminent en dessous" },
  { centile: "5", titre: "5ᵉ centile", couleur: JETONS.negatif,
    sens: "5 % des tirages terminent en dessous" },
];

const CADRE = { largeur: 200, hauteur: 44,
  marge: { haut: 4, bas: 4, gauche: 2, droite: 2 } };

export default function ScenariosObjectif({ projection }: { projection: Projection | null }) {
  if (!projection?.possible) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: CLAIR.texte }}>
          Dispersion des tirages
        </span>
        <p style={{ margin: 0, fontFamily: FONT, fontSize: 11, color: CLAIR.texteFaible }}>
          {projection ? "Aucune projection à détailler pour cet objectif."
            : "Choisissez un objectif projeté."}
        </p>
      </div>
    );
  }

  const p = projection;
  const sansDispersion = p.volatilite == null;
  const toutes = Object.values(p.enveloppes).flat();
  const { bas, haut } = bornes(toutes);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, flex: 1 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: CLAIR.texte }}>
          Dispersion des tirages
        </span>
        <span style={{ fontFamily: FONT, fontSize: 9.5, color: CLAIR.texteFaible }}>
          {p.objectif.nom}
        </span>
      </div>

      {sansDispersion ? (
        <p style={{ margin: 0, fontFamily: FONT, fontSize: 10.5, lineHeight: 1.55,
          color: JETONS.attention }}>
          Sans volatilité mesurable, il n’y a qu’une trajectoire : celle du rendement que
          vous avez posé. Aucune dispersion à détailler.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 10,
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
          {CARTES.map(c => {
            const serie = p.enveloppes[c.centile] ?? [];
            const fin = serie[serie.length - 1];
            const { x, y } = echelles(p.mois, bas, haut, CADRE);
            const atteint = p.requis != null && fin != null && fin >= p.requis;
            return (
              <div key={c.centile} style={{
                display: "flex", flexDirection: "column", gap: 7, padding: "11px 12px",
                borderRadius: RAYONS.sm, border: `1px solid ${CLAIR.bord}`,
                background: CLAIR.carteCreuse,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%",
                    background: c.couleur }} />
                  <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700,
                    color: CLAIR.texte }}>{c.titre}</span>
                  {p.taux_implicites[c.centile] != null && (
                    <span style={{ ...NUM, marginLeft: "auto", fontSize: 10.5,
                      fontWeight: 700, color: c.couleur }}>
                      {p.taux_implicites[c.centile]} %/an
                    </span>
                  )}
                </div>

                <div>
                  <span style={{ fontFamily: FONT, fontSize: 9, color: CLAIR.texteFaible }}>
                    Valeur à l’échéance
                  </span>
                  <div style={{ ...NUM, fontSize: 15, fontWeight: 700, color: CLAIR.texte }}>
                    {fin != null ? euros(fin) : "—"}
                  </div>
                </div>

                <svg viewBox={`0 0 ${CADRE.largeur} ${CADRE.hauteur}`}
                  style={{ width: "100%", height: 44, display: "block" }} aria-hidden="true">
                  <path d={chemin(p.mois, serie, x, y)} fill="none" stroke={c.couleur}
                    strokeWidth="1.6" strokeLinejoin="round" />
                </svg>

                {/* ⚠️ Le sens du centile, écrit en clair. « 25 % » aurait laissé croire à
                    une chance attachée à ce scénario ; ce n'est pas ce que le nombre dit. */}
                <span style={{ fontFamily: FONT, fontSize: 9, lineHeight: 1.45,
                  color: CLAIR.texteFaible }}>
                  {c.sens}
                </span>

                {p.requis != null && (
                  <span style={{
                    alignSelf: "flex-start", fontFamily: FONT, fontSize: 9,
                    fontWeight: 700, padding: "2px 6px", borderRadius: RAYONS.xs,
                    color: atteint ? JETONS.positif : JETONS.attention,
                    background: (atteint ? JETONS.positif : JETONS.attention) + "1E",
                  }}>
                    {atteint ? "cible dépassée" : "cible non atteinte"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
