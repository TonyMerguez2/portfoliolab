"use client";
import { useEffect, useMemo, useState } from "react";

import AssetLogo from "@/components/AssetLogo";
import type { AnalyseEvenements } from "@/hooks/useAnalyseEvenements";
import { fichierAgenda, nomFichier } from "@/lib/agenda";
import { cleEcheance, limiterMacro, macroEcartees } from "@/lib/echeances";
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
  /** Le nom de la société : « 000660.KS » ne désigne rien, « SK Hynix » si. */
  nom_societe?: string | null;
  /**
   * Le code du drapeau d'une échéance macroéconomique — « us », « eu ».
   *
   * Un code, pas une image : les fichiers sont déjà dans `public/drapeaux`, ceux
   * des places boursières des cartes d'actifs. Le serveur nomme le pays, la page
   * choisit le dessin.
   */
  pays?: string | null;
  /**
   * D'où vient l'échéance : « relevé » ou « flux ».
   *
   * ⚠️ Montrée, parce que les deux n'ont pas la même garantie. Le relevé vient d'une
   * page officielle, porte son heure et court jusqu'à fin 2027 ; le flux du
   * fournisseur tient quatre semaines et ne contient aucune décision de banque
   * centrale. Les mêler sans le dire donnerait à l'un le crédit de l'autre.
   */
  source?: string | null;
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
  jour, onEffacerJour, tickerChoisi, onChoisirTicker,
}: {
  portfolioId?: string;
  limite?: number;
  onVoirTout?: () => void;
  /**
   * Des échéances à joindre à celles de cette route — celles vues par
   * transparence, chargées à part parce que leur route est plus lente.
   */
  supplement?: Evenement[];
  /** Ne montrer que ce jour, quand il est choisi dans le calendrier. */
  jour?: string | null;
  /** Rend la main sur le filtre de jour, pour pouvoir en sortir depuis la liste. */
  onEffacerJour?: () => void;
  /** Le titre dont l'impact est détaillé à droite, pour le montrer comme retenu. */
  tickerChoisi?: string | null;
  /**
   * Appelé au clic sur une échéance qui porte un titre.
   *
   * ⚠️ Seules les publications de résultats sont sélectionnables : ce sont les
   * seules dont on sache mesurer l'impact — voir `porteUnImpact`. Rendre une ligne
   * macro cliquable aurait promis un détail qui n'existe pas.
   */
  onChoisirTicker?: (ticker: string | null) => void;
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
  /**
   * La ligne sous le curseur.
   *
   * ⚠️ Tenue en état plutôt que confiée à un `title` : l'infobulle native rend
   * exactement l'encadré gris qu'on a retiré des pastilles du graphique, et elle
   * le pose par-dessus la liste. Un fond au survol dit la même chose sans rien
   * recouvrir.
   */
  const [survol, setSurvol] = useState<number | null>(null);

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

  const visibles = useMemo(() => {
    const parNature = filtre === "tous" ? tout : tout.filter(e => e.nature === filtre);
    // ⚠️ Filtré sur un jour, la limite est levée : on a demandé *cette* journée,
    // en tronquer la fin serait absurde. Une journée porte au plus quelques
    // échéances, là où la liste entière en compte des dizaines.
    if (jour) return parNature.filter(e => e.date === jour);
    // ⚠️ La vue d'ensemble réserve une part à la macro. Le calendrier automatique
    // en a fait passer trois à dix-sept sur cinq semaines, dont onze **avant** la
    // première publication du portefeuille : sans cette part, les six lignes de la
    // liste étaient six lignes de macro et le portefeuille n'apparaissait plus.
    // Le filtre « Économique » et le calendrier, eux, reçoivent tout.
    const partagees = filtre === "tous" ? limiterMacro(parNature) : parNature;
    return partagees.slice(0, limite);
  }, [tout, filtre, limite, jour]);

  /**
   * Combien de publications économiques ne sont pas dans cette liste.
   *
   * ⚠️ Le compte porte sur **tout** ce que la vue d'ensemble laisse de côté, parce que
   * c'est ce que la phrase promet. J'avais d'abord tenté de ne compter que celles qui
   * auraient tenu dans les six lignes, pour ne pas mêler deux troncatures — mais le
   * lecteur, lui, veut savoir combien de publications existent qu'il ne voit pas, et
   * la réponse à cette question-là est simple.
   */
  const macroCachees = useMemo(
    () => (filtre === "tous" && !jour ? macroEcartees(tout) : 0),
    [tout, filtre, jour]);

  /**
   * Un filtre sans aucune échéance est **éteint**, pas masqué.
   *
   * Le masquer ferait apparaître et disparaître les onglets selon le portefeuille
   * ouvert, ce qui se lit comme un bogue. Éteint, il dit à la fois qu'il existe
   * et qu'il n'a rien à montrer.
   */
  const compte = (cle: Nature | "tous") =>
    cle === "tous" ? tout.length : tout.filter(e => e.nature === cle).length;

  /**
   * Une échéance est retenable quand on a effectivement un détail à montrer.
   *
   * Trois conditions, et aucune n'est décorative : un appelant qui n'écoute pas la
   * sélection, une ligne sans titre — les dates macro n'en ont pas —, et une nature
   * dont on ne sait pas mesurer l'effet. Un dividende est daté, son montant est
   * connu, mais il ne fait pas bouger le cours de plusieurs pourcents : lui donner
   * un curseur de clic aurait promis une statistique qui n'existe pas.
   */
  const selectionnable = (e: Evenement) =>
    !!onChoisirTicker && !!e.ticker && porteUnImpact(e.nature);

  /**
   * La ligne montrée comme retenue.
   *
   * ⚠️ Passe par `selectionnable`, sans quoi choisir les résultats d'AAPL aurait
   * aussi éclairé la ligne de son dividende : le titre coïncide, mais ce n'est pas
   * cette échéance-là qu'on détaille à droite.
   */
  const retenu = (e: Evenement) => selectionnable(e) && e.ticker === tickerChoisi;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: CLAIR.texte }}>
          Événements à venir
        </span>

        {/* Le jour retenu au calendrier, et de quoi le relâcher.
            ⚠️ Sans cette pastille, une liste filtrée sur une journée creuse
            paraîtrait vide sans raison : rien à l'écran ne dirait qu'un filtre est
            actif, ni comment en sortir. */}
        {jour && (
          <button type="button" onClick={onEffacerJour}
            title="Voir toutes les échéances"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer",
              padding: "3px 8px", borderRadius: RAYONS.plein,
              border: `1px solid ${JETONS.accent}`, background: JETONS.accentVoile,
              color: CLAIR.accent, fontFamily: FONT, fontSize: 10.5, fontWeight: 600,
            }}>
            {dateCourte(jour)}
            <span aria-hidden="true" style={{ fontSize: 12, lineHeight: 1 }}>×</span>
          </button>
        )}
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
          <div key={cleEcheance(e)}
            onClick={selectionnable(e)
              ? () => onChoisirTicker?.(retenu(e) ? null : e.ticker)
              : undefined}
            onMouseEnter={() => setSurvol(i)}
            onMouseLeave={() => setSurvol(s => (s === i ? null : s))}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 8px",
              margin: "0 -8px",
              borderBottom: i < visibles.length - 1 ? `1px solid ${CLAIR.bord}` : "none",
              cursor: selectionnable(e) ? "pointer" : "default",
              // La ligne retenue porte un fond, non un cerne : un cerne se lit comme
              // une bordure de tableau au milieu d'une liste déjà séparée par des
              // filets. Le rayon accompagne le fond, sinon il ne se voit pas.
              background: retenu(e)
                ? JETONS.accentVoile
                : (survol === i && selectionnable(e) ? CLAIR.carteCreuse : "transparent"),
              borderRadius: retenu(e) || survol === i ? RAYONS.xs : 0,
              transition: "background 120ms ease",
            }}>
            {/* Trois cas, dans cet ordre : le logo d'un titre, le drapeau d'une
                zone, et à défaut une pastille de couleur.
                ⚠️ `maxWidth: none` sur le drapeau, sinon la règle globale
                `img { max-width: 100% }` le rétrécit — le défaut déjà vécu sur le
                cadreur d'image. Et aucune bordure : c'est elle qui faisait
                apparaître les liserés bleus dans les coins des logos. */}
            {e.ticker && e.nature !== "economique" ? (
              <AssetLogo ticker={e.ticker} size={28} radius={7}
                fallbackBg={CLAIR.carteCreuse} fallbackBorder={CLAIR.bord}
                fallbackTextColor={CLAIR.texteSecondaire} bare />
            ) : e.pays ? (
              <img src={`/drapeaux/${e.pays}.svg`} alt=""
                aria-label={`Zone : ${e.ticker ?? ""}`}
                style={{
                  width: 28, height: 28, maxWidth: "none", maxHeight: "none",
                  flexShrink: 0, border: 0, outline: 0, boxShadow: "none",
                  display: "block",
                }} />
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
                {/* Le nom de la société à côté du ticker : par transparence, les
                    lignes sortent en « 0700.HK » ou « 000660.KS », qui ne désignent
                    rien — alors que « Tencent » et « SK Hynix » se reconnaissent. */}
                {e.nom_societe && (
                  <span style={{ fontWeight: 400, color: CLAIR.texteFaible }}>
                    {" "}{e.nom_societe}
                  </span>
                )}
              </div>
              <div style={{ fontFamily: FONT, fontSize: 10, color: CLAIR.texteFaible }}>
                {e.ticker ? e.libelle : "Publication économique"}
                {/* La provenance, sur les seules lignes macro : c'est là que les
                    garanties diffèrent. Une date relevée à la Fed ou à la BCE n'a pas
                    le même statut qu'une date lue chez le fournisseur de cours. */}
                {e.nature === "economique" && e.source && (
                  <> · {e.source === "relevé" ? "relevé officiel" : "flux fournisseur"}</>
                )}
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
            <button type="button"
              onClick={ev => {
                // ⚠️ La ligne est cliquable depuis qu'on peut retenir un titre :
                // sans arrêter la remontée, ajouter une échéance à l'agenda
                // changerait aussi le titre détaillé à droite. Deux effets pour un
                // clic, dont un que personne n'a demandé.
                ev.stopPropagation();
                telecharger(e);
              }}
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

      {/* ⚠️ La troncature s'avoue. Une liste qui garde deux publications
          économiques sur quarante-cinq, sans le dire, se lit comme une liste
          complète : on en conclut que rien d'autre n'est prévu. C'est le même
          défaut que le « + 2 » sans explication des pastilles du graphique, et le
          bouton dit où trouver le reste plutôt que de laisser chercher. */}
      {etat === "pret" && macroCachees > 0 && visibles.length > 0 && (
        <button type="button" onClick={() => setFiltre("economique")}
          style={{
            alignSelf: "flex-start", background: "none", border: "none", padding: 0,
            cursor: "pointer", textAlign: "left",
            fontFamily: FONT, fontSize: 10, color: CLAIR.texteFaible,
          }}>
          {macroCachees} autre{macroCachees > 1 ? "s" : ""} publication
          {macroCachees > 1 ? "s" : ""} économique{macroCachees > 1 ? "s" : ""} — voir
          {" "}<span style={{ color: CLAIR.accent, fontWeight: 600 }}>Économique</span>
        </button>
      )}

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
