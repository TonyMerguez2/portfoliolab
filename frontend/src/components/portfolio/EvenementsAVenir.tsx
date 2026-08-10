"use client";
import { useEffect, useMemo, useState } from "react";

import AssetLogo from "@/components/AssetLogo";
import type { AnalyseEvenements } from "@/hooks/useAnalyseEvenements";
import { fichierAgenda, nomFichier } from "@/lib/agenda";
import { libelleAmplitude, porteUnImpact } from "@/lib/impactEvenement";
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
  /** Le fonds par lequel l'échéance concerne le portefeuille, s'il y en a un. */
  via?: string | null;
  /** Part du portefeuille exposée, en pourcentage. */
  exposition?: number | null;
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

/**
 * L'heure d'une publication, dans le fuseau du lecteur.
 *
 * ⚠️ Le serveur envoie un **instant daté** — « 2026-08-26T08:30:00-04:00 » — et non
 * une heure toute faite. C'est ce qui permet de l'afficher juste ici : ces
 * publications tombent à 8 h 30 à New York, soit 14 h 30 à Paris la plupart de
 * l'année mais 13 h 30 la semaine où l'Amérique n'a pas encore changé d'heure et
 * l'Europe si. Recopier « 08:30 » aurait annoncé une publication du matin.
 */
const heureLocale = (instant: string) =>
  new Date(instant).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/**
 * Télécharge l'événement au format iCalendar.
 *
 * ⚠️ L'URL de l'objet est révoquée aussitôt le clic simulé. Sans cela, chaque
 * ajout laisserait le fichier en mémoire jusqu'au rechargement de la page — le
 * même défaut que le cadreur d'image, et le même remède.
 */
function telecharger(e: Evenement) {
  const detail = [
    e.ticker,
    e.montant != null ? `${e.montant} ${e.devise ?? ""}`.trim() : null,
    e.eps_estime != null ? `EPS estimé ${e.eps_estime}` : null,
  ].filter(Boolean).join(" · ");
  const fiche = {
    date: e.date,
    titre: e.ticker ? `${e.ticker} — ${e.libelle}` : e.libelle,
    description: detail || undefined,
    // La clé porte la nature, le titre et la date : elle ne bouge pas d'un ajout
    // au suivant, donc l'agenda remplace au lieu de dupliquer.
    cle: `${e.nature}-${e.ticker ?? "macro"}-${e.date}`,
  };
  const url = URL.createObjectURL(
    new Blob([fichierAgenda(fiche)], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichier(fiche);
  a.click();
  URL.revokeObjectURL(url);
}

export default function EvenementsAVenir({
  portfolioId, limite = 6, onVoirTout, onEvenements, analyse, supplement = [],
}: {
  portfolioId?: string;
  limite?: number;
  onVoirTout?: () => void;
  /**
   * Des échéances à joindre à celles de cette route — celles vues par
   * transparence, chargées à part parce que leur route est plus lente.
   */
  supplement?: Evenement[];
  /**
   * Les statistiques par titre, pour annoncer l'amplitude attendue.
   *
   * Passée par l'appelant et non cherchée ici : la page l'obtient déjà pour les
   * autres panneaux, et un appel de plus aurait fait partir deux fois la route la
   * plus coûteuse de l'écran. Absente, les lignes s'affichent sans amplitude — le
   * chiffre est un complément, pas une condition.
   */
  analyse?: AnalyseEvenements | null;
  /**
   * Remonte la liste obtenue, pour que le calendrier la partage.
   *
   * ⚠️ Un second appel de la même route l'aurait exposé à afficher un mois qui
   * contredit la liste d'à côté — deux réponses du fournisseur pouvant différer
   * d'une échéance selon l'instant. Une seule requête, deux lecteurs.
   *
   * Appelé depuis la réponse et non depuis un effet de rendu : un appel à chaque
   * rendu aurait bouclé avec l'état de l'appelant.
   *
   * La réponse entière et non la seule liste : le calendrier a besoin de la date
   * de péremption pour avouer son incomplétude, et la lui faire chercher par un
   * second appel aurait ramené le défaut qu'on évite ici.
   */
  onEvenements?: (reponse: Reponse) => void;
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
      .then((d: Reponse) => {
        if (annule) return;
        setDonnees(d);
        setEtat("pret");
        onEvenements?.(d);
      })
      .catch(() => { if (!annule) setEtat("erreur"); });
    return () => { annule = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioId]);

  /**
   * Les échéances propres au portefeuille et celles vues par transparence, dans
   * une seule liste chronologique.
   *
   * ⚠️ Fusionnées ici et non côté page, pour que les pastilles de filtre comptent
   * juste. Les laisser dehors aurait fait afficher « Résultats » comme un onglet
   * vide sur un portefeuille d'ETF, alors que ses fonds portent des sociétés qui
   * publient — ce qui est précisément l'information qu'on vient chercher.
   *
   * La transparence arrive après, sa route étant plus lente : la liste s'affiche
   * d'abord avec le macro, puis s'enrichit.
   */
  const tout = useMemo(
    () => [...(donnees?.evenements ?? []), ...supplement]
      .sort((a, b) => a.date.localeCompare(b.date)),
    [donnees, supplement]);

  const visibles = useMemo(
    () => (filtre === "tous" ? tout : tout.filter(e => e.nature === filtre)).slice(0, limite),
    [tout, filtre, limite]);

  /**
   * Un filtre sans aucune échéance est **éteint**, pas masqué.
   *
   * Le masquer ferait apparaître et disparaître les onglets selon le portefeuille
   * ouvert, ce qui se lit comme un bogue. Éteint, il dit à la fois qu'il existe
   * et qu'il n'a rien à montrer.
   */
  const compte = (cle: Nature | "tous") =>
    cle === "tous" ? tout.length : tout.filter(e => e.nature === cle).length;

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
                {/* L'origine, quand l'échéance vient d'une société détenue par un
                    fonds. La dire est indispensable : sans elle, une ligne « AAPL »
                    apparaîtrait dans un portefeuille qui ne détient pas Apple. */}
                {e.via && (
                  <>
                    {" · via "}
                    <span style={{ color: CLAIR.texteSecondaire }}>{e.via}</span>
                    {e.exposition != null && (
                      <span style={{ ...NUM }}> ({e.exposition.toFixed(2)} %)</span>
                    )}
                  </>
                )}
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
                <div style={{ ...NUM, fontSize: 10, color: CLAIR.texteFaible }}>
                  {heureLocale(e.moment)}
                </div>
              )}
            </div>

            {/* L'amplitude attendue sur le portefeuille.
                ⚠️ Seulement pour les résultats — voir `porteUnImpact`. Un
                détachement de dividende fait mécaniquement baisser le cours, mais
                la valeur passe du cours aux liquidités : annoncer « −0,19 % »
                ferait lire une perte là où il n'y a qu'un transfert.
                ⚠️ Et sans signe : la statistique dit de combien le titre bouge, pas
                dans quel sens. */}
            {(() => {
              const st = porteUnImpact(e.nature) && e.ticker
                ? analyse?.impacts[e.ticker] : undefined;
              if (!st) return null;
              return (
                <span title={`Amplitude moyenne du titre sur ses ${st.echantillon} derniers `
                  + `trimestres, ramenée à son poids de ${st.exposition.toFixed(1)} %`}
                  style={{
                    ...NUM, fontSize: 10, fontWeight: 700, flexShrink: 0,
                    color: CLAIR.texteSecondaire, background: CLAIR.carteCreuse,
                    border: `1px solid ${CLAIR.bord}`,
                    borderRadius: RAYONS.xs, padding: "2px 7px",
                  }}>
                  {libelleAmplitude(st)}
                </span>
              );
            })()}

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

            {/* Ajout à l'agenda : un fichier iCalendar téléchargé.
                Aucun service tiers, aucun compte à relier — le fichier s'ouvre
                dans l'agenda du système, et son identifiant stable fait qu'un
                second ajout remplace le premier au lieu de le doubler. */}
            <button type="button" onClick={() => telecharger(e)}
              aria-label={`Ajouter « ${e.libelle} » à l’agenda`}
              title="Ajouter à l’agenda"
              style={{
                width: 22, height: 22, flexShrink: 0, padding: 0, cursor: "pointer",
                borderRadius: RAYONS.xs, border: `1px solid ${CLAIR.bord}`,
                background: "transparent", color: CLAIR.texteSecondaire,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth={2} strokeLinecap="round"
                strokeLinejoin="round" aria-hidden="true">
                <path d="M8 3v3m8-3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
                <path d="M12 12v5m-2.5-2.5h5" />
              </svg>
            </button>
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
