"use client";
import AssetLogo from "@/components/AssetLogo";
import { qualifierImpact } from "@/components/portfolio/ImpactEvenements";
import type { AnalyseEvenements } from "@/hooks/useAnalyseEvenements";
import { CLAIR, JETONS, RAYONS } from "@/lib/palette";
import { FONT, NUM } from "@/lib/typography";

/**
 * Les deux vues détaillées de la maquette : dividendes et résultats.
 *
 * ⚠️ **Elles répètent volontairement ce que le panneau des échéances filtre déjà.**
 * Ses quatre pastilles — Tous, Résultats, Économique, Dividendes — montrent la même
 * donnée sous une forme condensée. Ces tableaux existent pour ce que le format
 * apporte en plus : le montant et le rendement côte à côte pour un dividende, le
 * risque de mouvement pour un résultat. La liste répond à « quand », les tableaux
 * à « combien ».
 *
 * Aucune ne refait d'appel : la liste des échéances et l'analyse sont obtenues une
 * fois par la page, puis passées à qui en a besoin.
 */

type Evenement = {
  nature: "resultats" | "dividende" | "economique";
  date: string;
  libelle: string;
  ticker: string | null;
  jours: number | null;
  montant: number | null;
  devise: string | null;
  rendement: number | null;
  eps_estime: number | null;
};

const symbole = (devise: string | null) =>
  devise === "USD" ? "$" : devise === "EUR" ? "€" : (devise ?? "");

const dateCourte = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("fr-FR",
    { day: "numeric", month: "short", year: "numeric" });

const cellule = { padding: "7px 6px", fontFamily: FONT, fontSize: 10.5 } as const;
const entete = {
  ...cellule, fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
  color: CLAIR.texteFaible, textTransform: "uppercase" as const,
  borderBottom: `1px solid ${CLAIR.bord}`, textAlign: "left" as const,
};

function Titre({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: CLAIR.texte }}>
      {children}
    </span>
  );
}

function Vide({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: 0, fontFamily: FONT, fontSize: 11, color: CLAIR.texteFaible, lineHeight: 1.6 }}>
      {children}
    </p>
  );
}

export function DividendesAVenir({
  evenements, limite = 6,
}: {
  evenements: Evenement[];
  limite?: number;
}) {
  const lignes = evenements.filter(e => e.nature === "dividende").slice(0, limite);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0, flex: 1 }}>
      <Titre>Dividendes à venir</Titre>

      {lignes.length === 0 ? (
        <Vide>
          Aucun détachement annoncé. Les ETF et les cryptomonnaies n&apos;en
          publient pas chez notre fournisseur.
        </Vide>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={entete}>Actif</th>
                <th style={entete}>Détachement</th>
                <th style={{ ...entete, textAlign: "right" }}>Dividende</th>
                <th style={{ ...entete, textAlign: "right" }}>Rendement</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map(e => (
                <tr key={`${e.ticker}:${e.date}`} style={{ borderBottom: `1px solid ${CLAIR.bord}` }}>
                  <td style={cellule}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                      <AssetLogo ticker={e.ticker ?? ""} size={20} radius={5}
                        fallbackBg={CLAIR.carteCreuse} fallbackBorder={CLAIR.bord}
                        fallbackTextColor={CLAIR.texteSecondaire} bare />
                      <strong style={{ color: CLAIR.texte }}>{e.ticker}</strong>
                    </span>
                  </td>
                  <td style={{ ...cellule, ...NUM, color: CLAIR.texteSecondaire, whiteSpace: "nowrap" }}>
                    {dateCourte(e.date)}
                  </td>
                  <td style={{ ...cellule, ...NUM, textAlign: "right", color: CLAIR.texte, whiteSpace: "nowrap" }}>
                    {e.montant != null
                      ? `${e.montant.toLocaleString("fr-FR", { maximumFractionDigits: 4 })} ${symbole(e.devise)}`
                      : "—"}
                  </td>
                  {/* ⚠️ Le rendement du **seul versement**, non le rendement annuel :
                      c'est ce que ce détachement retire du cours. Un titre qui verse
                      quatre fois par an afficherait sinon un chiffre quatre fois trop
                      petit sous un intitulé qui promet l'année. */}
                  <td style={{ ...cellule, ...NUM, textAlign: "right", fontWeight: 700,
                    color: e.rendement != null ? JETONS.positif : CLAIR.texteFaible,
                    whiteSpace: "nowrap" }}>
                    {e.rendement != null ? `${e.rendement.toFixed(2)} %` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ProchainsResultats({
  evenements, analyse, limite = 6,
}: {
  evenements: Evenement[];
  /** Sert au seul risque de mouvement ; son absence n'empêche pas la liste. */
  analyse: AnalyseEvenements | null;
  limite?: number;
}) {
  const lignes = evenements.filter(e => e.nature === "resultats").slice(0, limite);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0, flex: 1 }}>
      <Titre>Prochains résultats</Titre>

      {lignes.length === 0 ? (
        <Vide>
          Aucune publication annoncée. Les ETF et les cryptomonnaies ne publient pas
          de résultats trimestriels.
        </Vide>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {lignes.map((e, i) => {
            const im = e.ticker ? analyse?.impacts[e.ticker] : undefined;
            const q = im ? qualifierImpact(im.probabilite) : null;
            return (
              <div key={`${e.ticker}:${e.date}`} style={{
                display: "flex", alignItems: "center", gap: 9, padding: "9px 0",
                borderBottom: i < lignes.length - 1 ? `1px solid ${CLAIR.bord}` : "none",
              }}>
                <AssetLogo ticker={e.ticker ?? ""} size={26} radius={7}
                  fallbackBg={CLAIR.carteCreuse} fallbackBorder={CLAIR.bord}
                  fallbackTextColor={CLAIR.texteSecondaire} bare />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: FONT, fontSize: 11.5, fontWeight: 700, color: CLAIR.texte }}>
                    {e.ticker}
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: 10, color: CLAIR.texteFaible }}>
                    {e.libelle}
                    {e.eps_estime != null && (
                      <> · <span style={{ ...NUM }}>EPS estimé {e.eps_estime.toFixed(2)}</span></>
                    )}
                  </div>
                </div>

                <div style={{ ...NUM, fontSize: 10, color: CLAIR.texteSecondaire,
                  textAlign: "right", whiteSpace: "nowrap" }}>
                  {dateCourte(e.date)}
                </div>

                {/* Le risque de mouvement, quand douze trimestres permettent de le
                    dire. Absent, la case reste vide plutôt que de porter un mot
                    qu'aucune mesure ne soutient. */}
                {q && (
                  <span style={{
                    fontFamily: FONT, fontSize: 9.5, fontWeight: 700, flexShrink: 0,
                    color: q.teinte, background: q.teinte + "1E",
                    borderRadius: RAYONS.xs, padding: "2px 7px",
                  }}>
                    {q.mot}
                  </span>
                )}

                {e.jours != null && (
                  <span style={{ ...NUM, fontSize: 10, fontWeight: 700, flexShrink: 0,
                    color: JETONS.accent, background: JETONS.accent + "1E",
                    borderRadius: RAYONS.xs, padding: "2px 7px" }}>
                    {e.jours === 0 ? "auj." : `J+${e.jours}`}
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
