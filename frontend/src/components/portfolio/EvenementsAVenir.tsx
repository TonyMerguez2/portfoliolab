"use client";
import { useEffect, useMemo, useState } from "react";

import AssetLogo from "@/components/AssetLogo";
import { API_URL as API } from "@/lib/api";
import { CLAIR, JETONS, RAYONS } from "@/lib/palette";
import { enTetesAuth } from "@/lib/session";
import { FONT, NUM } from "@/lib/typography";

/**
 * Les échéances à venir des lignes du portefeuille.
 *
 * ⚠️ **Remplace un panneau entièrement fabriqué.** Celui d'avant listait les
 * actifs du portefeuille en leur collant l'étiquette « Résultats trimestriels »
 * et un « J+3, J+6, J+9 » calculé depuis l'indice de la boucle. Aucune de ces
 * dates n'existait. Ici, une date absente reste absente.
 *
 * ⚠️ **Le vide est un résultat, et il s'explique.** Un ETF ou une cryptomonnaie
 * ne publie ni résultats ni dividende chez le fournisseur — vérifié sur ESE.PA,
 * ETZ.PA, PAEJ.PA, CW8.PA et BTC-USD. Un portefeuille qui n'en contient que
 * rendra toujours une liste vide, et l'écran doit dire pourquoi : sans cela on
 * lit une panne là où il n'y a qu'une absence de publication.
 */

type Nature = "resultats" | "dividende" | "economique";

type Evenement = {
  nature: Nature;
  date: string;
  libelle: string;
  ticker: string | null;
  moment: string | null;
  jours: number | null;
  montant: number | null;
  devise: string | null;
  rendement: number | null;
  eps_estime: number | null;
};

type Reponse = {
  evenements: Evenement[];
  sans_donnees: string[];
  peremption_macro: string | null;
};

/** Les filtres de la maquette, et la nature qu'ils retiennent. */
const FILTRES: { cle: Nature | "tous"; libelle: string }[] = [
  { cle: "tous", libelle: "Tous" },
  { cle: "resultats", libelle: "Résultats" },
  { cle: "economique", libelle: "Économique" },
  { cle: "dividende", libelle: "Dividendes" },
];

/** La couleur d'une nature, reprise de la légende du calendrier de la maquette. */
const TEINTE: Record<Nature, string> = {
  resultats: JETONS.accent,
  economique: JETONS.attention,
  dividende: JETONS.positif,
};

const dateCourte = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("fr-FR",
    { day: "numeric", month: "long", year: "numeric" });

export default function EvenementsAVenir({
  portfolioId, limite = 6, onVoirTout,
}: {
  portfolioId?: string;
  limite?: number;
  onVoirTout?: () => void;
}) {
  const [donnees, setDonnees] = useState<Reponse | null>(null);
  const [etat, setEtat] = useState<"charge" | "pret" | "erreur">("charge");
  const [filtre, setFiltre] = useState<Nature | "tous">("tous");

  useEffect(() => {
    if (!portfolioId) { setEtat("pret"); setDonnees(null); return; }
    let annule = false;
    setEtat("charge");
    fetch(`${API}/api/v1/portfolios/${portfolioId}/events`, { headers: enTetesAuth() })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Reponse) => { if (!annule) { setDonnees(d); setEtat("pret"); } })
      .catch(() => { if (!annule) setEtat("erreur"); });
    return () => { annule = true; };
  }, [portfolioId]);

  const visibles = useMemo(() => {
    const tout = donnees?.evenements ?? [];
    return (filtre === "tous" ? tout : tout.filter(e => e.nature === filtre)).slice(0, limite);
  }, [donnees, filtre, limite]);

  /**
   * Un filtre sans aucune échéance est **éteint**, pas masqué.
   *
   * Le masquer ferait apparaître et disparaître les onglets selon le portefeuille
   * ouvert, ce qui se lit comme un bogue. Éteint, il dit à la fois qu'il existe
   * et qu'il n'a rien à montrer.
   */
  const compte = (cle: Nature | "tous") =>
    cle === "tous"
      ? (donnees?.evenements.length ?? 0)
      : (donnees?.evenements.filter(e => e.nature === cle).length ?? 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: CLAIR.texte }}>
          Événements à venir
        </span>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {FILTRES.map(f => {
          const actif = filtre === f.cle;
          const vide = compte(f.cle) === 0;
          return (
            <button key={f.cle} type="button" onClick={() => setFiltre(f.cle)}
              disabled={vide && !actif}
              style={{
                padding: "5px 11px", borderRadius: RAYONS.plein, cursor: vide && !actif ? "default" : "pointer",
                border: `1px solid ${actif ? JETONS.accent : CLAIR.bord}`,
                background: actif ? JETONS.accent : "transparent",
                color: actif ? "#FFFFFF" : vide ? CLAIR.texteFaible : CLAIR.texteSecondaire,
                fontFamily: FONT, fontSize: 11, fontWeight: 600,
                opacity: vide && !actif ? 0.45 : 1,
              }}>
              {f.libelle}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {etat === "charge" && (
          <p style={{ margin: 0, fontFamily: FONT, fontSize: 11, color: CLAIR.texteFaible }}>
            Chargement…
          </p>
        )}

        {etat === "erreur" && (
          <p style={{ margin: 0, fontFamily: FONT, fontSize: 11, color: CLAIR.texteFaible }}>
            Échéances indisponibles pour le moment.
          </p>
        )}

        {/* ⚠️ Le vide s'explique, et nomme les lignes concernées. « Aucun
            événement » seul se lirait comme une panne ; dire quelles lignes ne
            publient rien transforme le silence en information. */}
        {etat === "pret" && visibles.length === 0 && (
          <div style={{ fontFamily: FONT, fontSize: 11, color: CLAIR.texteFaible, lineHeight: 1.6 }}>
            <p style={{ margin: 0 }}>Aucune échéance annoncée.</p>
            {donnees && donnees.sans_donnees.length > 0 && (
              <p style={{ margin: "4px 0 0" }}>
                {donnees.sans_donnees.join(", ")} ne publie
                {donnees.sans_donnees.length > 1 ? "nt" : ""} ni résultats ni
                dividende — c&apos;est le cas des ETF et des cryptomonnaies.
              </p>
            )}
          </div>
        )}

        {etat === "pret" && visibles.map((e, i) => (
          <div key={`${e.nature}:${e.ticker ?? ""}:${e.date}`}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 0",
              borderBottom: i < visibles.length - 1 ? `1px solid ${CLAIR.bord}` : "none",
            }}>
            {/* Une crypto ou une action portent leur logo ; un événement macro
                n'a pas de titre, donc une pastille de sa couleur tient la place
                pour que les lignes restent alignées. */}
            {e.ticker && e.nature !== "economique" ? (
              <AssetLogo ticker={e.ticker} size={28} radius={7}
                fallbackBg={CLAIR.carteCreuse} fallbackBorder={CLAIR.bord}
                fallbackTextColor={CLAIR.texteSecondaire} bare />
            ) : (
              <span style={{
                width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                background: TEINTE[e.nature] + "22",
                border: `1px solid ${TEINTE[e.nature]}55`,
              }} />
            )}

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: CLAIR.texte }}>
                {e.ticker ? e.ticker.replace(/-USD$/, "") : e.libelle}
              </div>
              <div style={{ fontFamily: FONT, fontSize: 10, color: CLAIR.texteFaible }}>
                {e.ticker ? e.libelle : "Publication économique"}
                {e.nature === "dividende" && e.montant != null && (
                  <>
                    {" · "}
                    <span style={{ ...NUM }}>
                      {e.montant.toLocaleString("fr-FR", { maximumFractionDigits: 4 })}
                      {e.devise === "USD" ? " $" : e.devise === "EUR" ? " €" : ` ${e.devise ?? ""}`}
                    </span>
                    {e.rendement != null && (
                      <span style={{ ...NUM }}> ({e.rendement.toFixed(2)} %)</span>
                    )}
                  </>
                )}
              </div>
            </div>

            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ ...NUM, fontSize: 10, color: CLAIR.texteSecondaire }}>
                {dateCourte(e.date)}
              </div>
              {e.moment && (
                <div style={{ ...NUM, fontSize: 10, color: CLAIR.texteFaible }}>{e.moment}</div>
              )}
            </div>

            {e.jours != null && (
              <span style={{
                ...NUM, fontSize: 10, fontWeight: 700, flexShrink: 0,
                color: TEINTE[e.nature],
                background: TEINTE[e.nature] + "1E",
                borderRadius: RAYONS.xs, padding: "2px 7px",
              }}>
                {e.jours === 0 ? "aujourd’hui" : `J+${e.jours}`}
              </span>
            )}
          </div>
        ))}
      </div>

      {onVoirTout && etat === "pret" && (donnees?.evenements.length ?? 0) > limite && (
        <button type="button" onClick={onVoirTout}
          style={{
            alignSelf: "center", background: "none", border: "none", cursor: "pointer",
            fontFamily: FONT, fontSize: 11, fontWeight: 600, color: CLAIR.accent, padding: 0,
          }}>
          Voir tous les événements à venir →
        </button>
      )}
    </div>
  );
}
