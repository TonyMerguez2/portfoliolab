"use client";
import { useEffect, useMemo, useState } from "react";
import RadarChart from "@/components/charts/RadarChart";
import { FONT, NUM } from "@/lib/typography";
import { enTetesAuth } from "@/lib/session";
import { donutArcs } from "@/lib/donut";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Analyse du portefeuille.
 *
 * Chaque score s'accompagne de la mesure qui le fonde : « 42 » ne veut rien
 * dire, « corrélation 0,58 en moyenne » se vérifie. Un indicateur sans données
 * l'annonce au lieu d'afficher un zéro qu'on prendrait pour une mesure.
 *
 * Rien n'est produit par un modèle de langage. Les observations sont des règles
 * sur des mesures, et les panneaux portent des noms qui le disent.
 */

const MARGE = 10;
const GOUTTIERE = 8;
const RAYON = 30;

type Facteur = { valeur: number | null; libelle: string; score: number | null };
type Part = { libelle: string; part: number };
type Observation = { ton: string; titre: string; detail: string };
type Analyse = {
  score: number | null;
  bande: string | null;
  facteurs: Record<string, Facteur>;
  expositions: Record<string, Part[]>;
  observations: Observation[];
  poids: { ticker: string; part: number }[];
  source: string;
};

const LIBELLE_FACTEUR: Record<string, string> = {
  diversification:     "Diversification",
  concentration:       "Concentration",
  volatilite:          "Volatilité",
  liquidite:           "Liquidité",
  correlation:         "Corrélation",
  sensibilite_marche:  "Sensibilité marché",
};

/**
 * Intitulés du radar, abrégés.
 *
 * « Sensibilité marché » posé autour d'un cercle de 168 px chevauche ses
 * voisins ; la liste à côté donne le nom entier.
 */
const ABREGE: Record<string, string> = {
  diversification:    "Diversif.",
  concentration:      "Concentr.",
  volatilite:         "Volatilité",
  liquidite:          "Liquidité",
  correlation:        "Corrél.",
  sensibilite_marche: "Marché",
};

/** Ordre d'affichage, celui du radar comme celui de la liste. */
const ORDRE = ["diversification", "concentration", "volatilite", "liquidite", "correlation", "sensibilite_marche"];

const BANDES: { min: number; nom: string; couleur: string }[] = [
  { min: 80, nom: "Très bon",    couleur: "#4ade80" },
  { min: 60, nom: "Bon",         couleur: "#22c55e" },
  { min: 40, nom: "Moyen",       couleur: "#fbbf24" },
  { min: 20, nom: "Faible",      couleur: "#fb923c" },
  { min: 0,  nom: "Très faible", couleur: "#f87171" },
];

const couleurScore = (s: number | null) =>
  s == null ? "rgba(255,255,255,0.30)" : (BANDES.find(b => s >= b.min) ?? BANDES[4]).couleur;

const TON: Record<string, { couleur: string; signe: string }> = {
  alerte:    { couleur: "#f87171", signe: "!" },
  attention: { couleur: "#fbbf24", signe: "!" },
  favorable: { couleur: "#4ade80", signe: "✓" },
  info:      { couleur: "#5B8DEF", signe: "i" },
};

const COULEURS_PART = ["#5B8DEF", "#a78bfa", "#fbbf24", "#4ade80", "#f87171", "#22d3ee", "#94a3b8"];

function Carte({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "rgba(9,27,52,0.78)", border: "1px solid rgba(205,225,255,0.16)",
      borderRadius: RAYON, padding: "14px 18px", display: "flex", flexDirection: "column",
      minHeight: 0, ...style,
    }}>{children}</div>
  );
}

function Titre({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                  marginBottom: 12, flexShrink: 0 }}>
      <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.88)" }}>
        {children}
      </span>
      {action}
    </div>
  );
}

export default function AnalyseView({ portfolioId, refreshKey }: { portfolioId: string; refreshKey: number }) {
  const [a, setA] = useState<Analyse | null>(null);
  const [etat, setEtat] = useState<"charge" | "prêt" | "vide">("charge");
  const [ongletExpo, setOngletExpo] = useState<"secteurs" | "devises" | "classes">("secteurs");

  useEffect(() => {
    if (!portfolioId) return;
    let annule = false;
    setEtat("charge");
    fetch(`${API}/api/v1/portfolios/${portfolioId}/analysis`, { headers: enTetesAuth() })
      .then(r => (r.ok ? r.json() : null))
      .then((d: Analyse | null) => {
        if (annule) return;
        setA(d);
        setEtat(d && d.source === "transactions" ? "prêt" : "vide");
      })
      .catch(() => { if (!annule) setEtat("vide"); });
    return () => { annule = true; };
  }, [portfolioId, refreshKey]);

  const facteursRadar = useMemo(
    () => ORDRE
      .filter(k => a?.facteurs?.[k]?.score != null)
      .map(k => ({ label: ABREGE[k], value: a!.facteurs[k].score! })),
    [a]);

  if (etat === "charge") {
    return <div style={{ padding: 40, textAlign: "center", fontFamily: FONT, fontSize: 12,
                         color: "rgba(255,255,255,0.30)" }}>Analyse en cours…</div>;
  }
  if (etat === "vide" || !a) {
    return (
      <div style={{ padding: `8px ${MARGE}px 0`, height: "100%" }}>
        <Carte style={{ alignItems: "center", justifyContent: "center", padding: 48 }}>
          <p style={{ fontFamily: FONT, fontSize: 13, color: "rgba(255,255,255,0.55)", margin: "0 0 6px" }}>
            Rien à analyser pour l&apos;instant
          </p>
          <p style={{ fontFamily: FONT, fontSize: 11.5, color: "rgba(255,255,255,0.30)",
                      margin: 0, textAlign: "center", lineHeight: 1.6 }}>
            L&apos;analyse porte sur les positions réelles. Ajoutez des transactions
            pour que le portefeuille ait quelque chose à mesurer.
          </p>
        </Carte>
      </div>
    );
  }

  const expo = a.expositions[ongletExpo] ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: GOUTTIERE,
                  padding: `8px ${MARGE}px 0`, height: "100%", minHeight: 0, overflow: "hidden" }}>

      {/* ── Rangée haute ─────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,0.9fr) minmax(0,1.3fr) minmax(0,1fr)",
                    gap: GOUTTIERE, flex: 1.1, minHeight: 0 }}>

        {/* Score */}
        <Carte>
          <Titre>Score d&apos;analyse</Titre>
          {/* Anneau au-dessus, bandes dessous. Côte à côte, la légende ne
              disposait que de soixante-douze pixels et repliait chaque
              intitulé sur deux lignes. */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
                        gap: 10, flex: 1, minHeight: 0, overflow: "hidden" }}>
            <Jauge score={a.score} bande={a.bande} />
            <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%", minWidth: 0 }}>
              {BANDES.map(b => {
                const actif = a.score != null && a.score >= b.min &&
                  (b.min === 80 || a.score < (BANDES[BANDES.indexOf(b) - 1]?.min ?? 101));
                return (
                  <div key={b.nom} style={{ display: "flex", alignItems: "center", gap: 7,
                                            fontFamily: FONT, fontSize: 10,
                                            color: actif ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.38)",
                                            fontWeight: actif ? 600 : 400 }}>
                    <i style={{ width: 6, height: 6, borderRadius: "50%", background: b.couleur, flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{b.nom}</span>
                    <span style={{ ...NUM, opacity: 0.55 }}>
                      {b.min}–{b.min === 80 ? 100 : (BANDES[BANDES.indexOf(b) - 1]?.min ?? 100) - 1}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <p style={{ margin: "8px 0 0", fontFamily: FONT, fontSize: 9.5,
                      color: "rgba(255,255,255,0.28)", lineHeight: 1.45, flexShrink: 0 }}>
            Moyenne des facteurs mesurables : ceux qui manquent d&apos;historique
            sont écartés plutôt que comptés à zéro.
          </p>
        </Carte>

        {/* Facteurs de risque */}
        <Carte>
          <Titre>Facteurs de risque</Titre>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minHeight: 0 }}>
            {facteursRadar.length >= 3 && (
              <div style={{ flexShrink: 0 }}>
                <RadarChart size={140} metrics={facteursRadar} />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              {ORDRE.map(k => {
                const f = a.facteurs[k];
                if (!f) return null;
                return (
                  // Intitulé et mesure sur deux lignes : côte à côte, ils se
                  // disputaient cent cinquante pixels et se coupaient tous les
                  // deux.
                  <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontFamily: FONT, fontSize: 11,
                                     color: "rgba(255,255,255,0.68)", overflow: "hidden",
                                     textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {LIBELLE_FACTEUR[k]}
                      </span>
                      <span style={{ display: "block", fontFamily: FONT, fontSize: 9.5,
                                     color: "rgba(255,255,255,0.32)", overflow: "hidden",
                                     textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.libelle}
                      </span>
                    </span>
                    <span style={{ ...NUM, fontSize: 13, fontWeight: 700, width: 26, textAlign: "right",
                                   color: couleurScore(f.score), flexShrink: 0 }}>
                      {f.score ?? "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </Carte>

        {/* Exposition */}
        <Carte>
          <Titre action={
            <div style={{ display: "flex", gap: 3, background: "rgba(255,255,255,0.05)",
                          borderRadius: 8, padding: 2 }}>
              {([["secteurs", "Secteurs"], ["devises", "Devises"], ["classes", "Classes"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setOngletExpo(k)} style={{
                  padding: "3px 9px", borderRadius: 6, border: "none", cursor: "pointer",
                  fontFamily: FONT, fontSize: 10, fontWeight: ongletExpo === k ? 700 : 500,
                  background: ongletExpo === k ? "rgba(91,141,239,0.20)" : "transparent",
                  color: ongletExpo === k ? "#9BB9FF" : "rgba(255,255,255,0.40)",
                }}>{l}</button>
              ))}
            </div>
          }>Exposition</Titre>

          {expo.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 9, overflowY: "auto", minHeight: 0 }}>
              {expo.map((e, i) => (
                <div key={e.libelle}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontFamily: FONT, fontSize: 11, color: "rgba(255,255,255,0.68)",
                                   overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.libelle}
                    </span>
                    <span style={{ ...NUM, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.88)" }}>
                      {e.part.toFixed(1)} %
                    </span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)" }}>
                    <div style={{ width: `${Math.min(100, e.part)}%`, height: "100%", borderRadius: 2,
                                  background: COULEURS_PART[i % COULEURS_PART.length] }} />
                  </div>
                </div>
              ))}
              {ongletExpo === "secteurs" && (
                <p style={{ margin: "2px 0 0", fontFamily: FONT, fontSize: 9.5,
                            color: "rgba(255,255,255,0.26)", lineHeight: 1.5 }}>
                  En transparence de vos fonds : la ventilation interne de chaque
                  ETF est répartie au prorata de son poids.
                </p>
              )}
            </div>
          ) : (
            <p style={{ fontFamily: FONT, fontSize: 11, color: "rgba(255,255,255,0.28)", margin: 0 }}>
              Ventilation indisponible pour ces titres.
            </p>
          )}
        </Carte>
      </div>

      {/* ── Rangée basse ─────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)",
                    gap: GOUTTIERE, flex: 1, minHeight: 0 }}>

        <Carte>
          <Titre>Ce que disent vos chiffres</Titre>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", minHeight: 0 }}>
            {a.observations.length ? a.observations.map((o, i) => {
              const t = TON[o.ton] ?? TON.info;
              return (
                <div key={i} style={{ display: "flex", gap: 10, padding: "9px 11px", borderRadius: 12,
                                      background: "rgba(255,255,255,0.035)",
                                      border: "1px solid rgba(255,255,255,0.06)" }}>
                  <span style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                                 background: t.couleur, color: "rgba(6,20,42,0.96)",
                                 display: "flex", alignItems: "center", justifyContent: "center",
                                 fontFamily: FONT, fontSize: 11, fontWeight: 800 }}>
                    {t.signe}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontFamily: FONT, fontSize: 11.5, fontWeight: 600,
                                   color: "rgba(255,255,255,0.88)", marginBottom: 2 }}>
                      {o.titre}
                    </span>
                    <span style={{ display: "block", fontFamily: FONT, fontSize: 10.5,
                                   color: "rgba(255,255,255,0.45)", lineHeight: 1.55 }}>
                      {o.detail}
                    </span>
                  </span>
                </div>
              );
            }) : (
              <p style={{ fontFamily: FONT, fontSize: 11, color: "rgba(255,255,255,0.30)",
                          margin: 0, lineHeight: 1.6 }}>
                Rien de saillant : aucune ligne ne domine, les corrélations et la
                volatilité restent dans des bornes ordinaires.
              </p>
            )}
          </div>
          <p style={{ margin: "10px 0 0", fontFamily: FONT, fontSize: 9.5,
                      color: "rgba(255,255,255,0.24)", lineHeight: 1.5, flexShrink: 0 }}>
            Observations calculées sur vos positions. Ce ne sont pas des conseils
            en investissement.
          </p>
        </Carte>

        <Carte>
          <Titre>Répartition des lignes</Titre>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, overflowY: "auto", minHeight: 0 }}>
            {a.poids.map((p, i) => (
              <div key={p.ticker}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600,
                                 color: "rgba(255,255,255,0.80)" }}>{p.ticker}</span>
                  <span style={{ ...NUM, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.88)" }}>
                    {p.part.toFixed(1)} %
                  </span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)" }}>
                  <div style={{ width: `${Math.min(100, p.part)}%`, height: "100%", borderRadius: 2,
                                background: COULEURS_PART[i % COULEURS_PART.length] }} />
                </div>
              </div>
            ))}
          </div>
        </Carte>
      </div>
    </div>
  );
}

/**
 * Anneau du score.
 *
 * Même traitement que celui de la santé du portefeuille : couleurs pleines,
 * aucun écart ni arrondi. Deux anneaux voisins traités différemment se
 * remarquent aussitôt.
 */
function Jauge({ score, bande }: { score: number | null; bande: string | null }) {
  const T = 92;
  const couleur = couleurScore(score);
  const atteint = Math.max(0, Math.min(100, score ?? 0));
  const arcs = donutArcs(
    [
      { key: "atteint", value: atteint, color: couleur },
      { key: "reste",   value: 100 - atteint, color: "rgba(255,255,255,0.10)" },
    ],
    { cx: T / 2, cy: T / 2, r: T / 2, thickness: 11, gap: 0 },
  );
  return (
    <div style={{ position: "relative", width: T, height: T, flexShrink: 0 }}>
      <svg width={T} height={T} style={{ display: "block" }}>
        {arcs.map(x => <path key={x.key} d={x.path} fill={x.color} />)}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center" }}>
        <span style={{ ...NUM, fontSize: 30, fontWeight: 700, color: "#fff", lineHeight: 1 }}>
          {score ?? "—"}
        </span>
        <span style={{ fontFamily: FONT, fontSize: 10, color: "rgba(255,255,255,0.35)" }}>/100</span>
        {bande && (
          <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: couleur, marginTop: 3 }}>
            {bande}
          </span>
        )}
      </div>
    </div>
  );
}
