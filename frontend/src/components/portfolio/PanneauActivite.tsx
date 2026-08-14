"use client";
import { useEffect, useState } from "react";

import { CountryFlagRounded } from "@appica/country-flags-react";

import AssetLogo from "@/components/AssetLogo";
import { API_URL } from "@/lib/api";
import { enTetesAuth } from "@/lib/session";
import { CLAIR } from "@/lib/palette";
import { FONT } from "@/lib/typography";

/**
 * Ce qui vient de se passer, et ce qui va se passer.
 *
 * ⚠️ **Trois lignes de trois natures différentes, et c'est le propos du panneau.** La
 * dernière opération dit ce que vous avez fait ; la prochaine publication économique et les
 * prochains résultats disent ce que le marché va faire. Séparées, ces informations vivaient
 * dans deux onglets — Transactions et Événements — et la vue générale ne répondait jamais à
 * « qu'est-ce qui arrive ? ».
 *
 * ⚠️ **Une échéance par nature, pas une liste.** Les onglets portent les listes complètes ;
 * ce panneau donne la plus proche de chaque sorte. Trois lignes se lisent d'un coup d'œil,
 * douze demandent une lecture — et la place est comptée, puisque ce panneau doit faire
 * exactement la hauteur de son voisin.
 *
 * ⚠️ **Les échéances viennent de la route « transparence », pas de la route simple.** Un
 * portefeuille d'ETF ne publie aucun résultat : ce sont les sociétés détenues *à travers*
 * les fonds qui en publient, et c'est bien le portefeuille qu'elles remuent. La route
 * simple aurait laissé la ligne « résultats » vide sur la plupart des portefeuilles.
 */

type Evenement = {
  nature: "resultats" | "dividende" | "economique";
  date: string;
  libelle: string;
  ticker?: string | null;
  jours?: number | null;
  nom_societe?: string | null;
  pays?: string | null;
  via?: string | null;
};

type Operation = {
  id: number;
  ticker: string;
  asset_type: string;
  side: "BUY" | "SELL";
  quantity: number;
  unit_price: number;
  fees?: number | null;
  executed_at: string;
};

/**
 * Le délai en clair.
 *
 * ⚠️ **En jours tant qu'ils se comptent, jamais en date seule.** « le 26 août » oblige à
 * calculer ; « dans 11 jours » se lit. Au-delà de deux semaines l'inverse devient vrai —
 * « dans 48 jours » ne se représente pas — et la date reprend la main.
 */
function delai(jours: number | null | undefined, date: string): string {
  if (jours == null) return dateCourte(date);
  if (jours <= 0) return "aujourd’hui";
  if (jours === 1) return "demain";
  if (jours <= 14) return `dans ${jours} jours`;
  return dateCourte(date);
}

function dateCourte(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/** Depuis combien de temps, pour une opération déjà passée. */
function depuis(iso: string): string {
  const quand = new Date(iso).getTime();
  if (Number.isNaN(quand)) return "";
  const jours = Math.floor((Date.now() - quand) / 86_400_000);
  if (jours <= 0) return "aujourd’hui";
  if (jours === 1) return "hier";
  if (jours < 30) return `il y a ${jours} jours`;
  return dateCourte(iso);
}

const EUROS = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/**
 * Ce que le logo affiche quand il n'en existe pas.
 *
 * ⚠️ **Obligatoire, et c'est le compilateur qui l'a rappelé.** Sans image, `AssetLogo`
 * dessine l'initiale du ticker : il lui faut un fond, un bord et une encre, sinon elle
 * tombe sur du transparent. Les valeurs sont celles des cartes d'actifs, pour que le même
 * titre ait le même repli des deux côtés de l'écran.
 */
const REPLI_LOGO = {
  fallbackBg: "rgba(255,255,255,0.10)",
  fallbackBorder: "rgba(255,255,255,0.16)",
  fallbackTextColor: "rgba(255,255,255,0.80)",
};

export default function PanneauActivite({
  portfolioId, refreshKey, onVoirTout,
}: {
  portfolioId?: string;
  /** Change à chaque écriture enregistrée, pour relire le journal. */
  refreshKey?: number;
  onVoirTout?: () => void;
}) {
  const [operation, setOperation] = useState<Operation | null>(null);
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  /**
   * ⚠️ **Trois états, pas deux.** « Rien à montrer » et « pas encore lu » se ressemblent à
   * l'écran et n'appellent pas la même phrase : le premier est un fait sur le portefeuille,
   * le second une attente. Les confondre fait dire « aucune opération » à qui en a.
   */
  const [charge, setCharge] = useState(false);

  useEffect(() => {
    if (!portfolioId) { setCharge(true); return; }
    let annule = false;
    setCharge(false);
    const base = `${API_URL}/api/v1/portfolios/${portfolioId}`;
    const lire = (chemin: string) =>
      fetch(`${base}${chemin}`, { headers: enTetesAuth() })
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null);

    Promise.all([lire("/transactions"), lire("/events/transparence")]).then(([tx, ev]) => {
      if (annule) return;
      const liste: Operation[] = Array.isArray(tx) ? tx : (tx?.transactions ?? []);
      // ⚠️ Trié ici plutôt que supposé : la route rend l'ordre qu'elle veut, et « la
      // dernière » ne doit pas dépendre de cela.
      const triees = [...liste].sort(
        (a, b) => new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime());
      setOperation(triees[0] ?? null);
      setEvenements(Array.isArray(ev?.evenements) ? ev.evenements : []);
      setCharge(true);
    });
    return () => { annule = true; };
  }, [portfolioId, refreshKey]);

  // ⚠️ Les échéances passées sont écartées : la route en rend pour l'historique, et
  // « prochaine publication » ne peut pas désigner hier.
  const aVenir = evenements.filter(e => (e.jours ?? 0) >= 0);
  const economique = aVenir.find(e => e.nature === "economique") ?? null;
  const resultats = aVenir.find(e => e.nature === "resultats") ?? null;

  const etiquette: React.CSSProperties = {
    fontFamily: FONT, fontSize: 9.5, fontWeight: 600, letterSpacing: "0.07em",
    color: CLAIR.texteFaible, textTransform: "uppercase",
  };
  const principal: React.CSSProperties = {
    fontFamily: FONT, fontSize: 12, fontWeight: 600, color: CLAIR.texte,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  };
  const secondaire: React.CSSProperties = {
    fontFamily: FONT, fontSize: 10.5, color: CLAIR.texteAttenue,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  };

  /** Une ligne du panneau : son intitulé, ce qu'elle montre, et quand. */
  const Ligne = ({ titre, vide, gauche, texte, sousTexte, quand }: {
    titre: string; vide: string; gauche?: React.ReactNode;
    texte?: string; sousTexte?: string; quand?: string;
  }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={etiquette}>{titre}</span>
      {texte ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {gauche}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={principal}>{texte}</div>
            {sousTexte && <div style={secondaire}>{sousTexte}</div>}
          </div>
          {quand && (
            <span style={{ ...secondaire, flexShrink: 0, color: CLAIR.texteFaible }}>
              {quand}
            </span>
          )}
        </div>
      ) : (
        <span style={secondaire}>{charge ? vide : "…"}</span>
      )}
    </div>
  );

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 12, flexShrink: 0 }}>
        <span style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: CLAIR.texte }}>
          Activité
        </span>
      </div>

      {/* ⚠️ **Réparties sur toute la hauteur, non empilées en tête.** Ce panneau doit faire
          la hauteur de son voisin : sans `space-between`, les trois lignes se tassaient en
          haut et laissaient un grand vide sous elles, ce qui se lit comme un chargement qui
          n'aboutit pas. */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
        justifyContent: "space-between", gap: 12, overflow: "hidden" }}>

        <Ligne
          titre="Dernière opération"
          vide="Aucune opération enregistrée."
          gauche={operation && (
            <AssetLogo ticker={operation.ticker} type={operation.asset_type}
              size={22} radius={6} {...REPLI_LOGO} />
          )}
          texte={operation
            ? `${operation.side === "BUY" ? "Achat" : "Vente"} · ${operation.ticker}`
            : undefined}
          sousTexte={operation
            ? `${EUROS.format(Math.round(
                operation.quantity * operation.unit_price + (operation.fees ?? 0)))} €`
            : undefined}
          quand={operation ? depuis(operation.executed_at) : undefined}
        />

        {/**
          * ⚠️ **Le drapeau vient du jeu de 261 pays, pas des quinze fichiers de
          * `public/drapeaux`.** Ce dossier n'a ni Taïwan, ni la Corée, ni aucun pays
          * nordique — c'est-à-dire les premières expositions asiatiques d'un vrai PEA, qui
          * s'affichaient sans rien.
          *
          * ⚠️ **La garde sur le code n'est pas une précaution de style.** Mesuré sur ce
          * composant ailleurs dans l'application : un code inconnu ne dessine **rien** — pas
          * d'erreur, juste un vide de la taille du drapeau, qui décale la ligne — et un code
          * `null` lève. D'où le test sur une chaîne de deux lettres, et le repli derrière.
          */}
        <Ligne
          titre="Prochaine publication économique"
          vide="Rien d’annoncé pour vos zones."
          gauche={economique && (
            typeof economique.pays === "string" && economique.pays.length === 2 ? (
              <CountryFlagRounded code={economique.pays} size={22}
                title={economique.ticker ?? undefined}
                style={{ flexShrink: 0, display: "block" }} />
            ) : (
              <span style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                background: CLAIR.carteCreuse, border: `1px solid ${CLAIR.bord}`,
              }} />
            )
          )}
          texte={economique?.libelle}
          sousTexte={economique?.ticker ?? undefined}
          quand={economique ? delai(economique.jours, economique.date) : undefined}
        />

        {/* ⚠️ Le nom de la société plutôt que son ticker : par transparence, les lignes d'un
            fonds asiatique sortent en « 0700.HK », qui ne désigne rien pour un lecteur. */}
        <Ligne
          titre="Prochains résultats d’entreprise"
          vide="Aucune publication attendue."
          gauche={resultats?.ticker && (
            <AssetLogo ticker={resultats.ticker} type="EQUITY" size={22} radius={6}
              {...REPLI_LOGO} />
          )}
          texte={resultats
            ? (resultats.nom_societe ?? resultats.ticker ?? resultats.libelle) ?? undefined
            : undefined}
          sousTexte={resultats?.via ? `via ${resultats.via}` : undefined}
          quand={resultats ? delai(resultats.jours, resultats.date) : undefined}
        />
      </div>

      {onVoirTout && (
        <button type="button" onClick={onVoirTout}
          style={{
            display: "flex", alignItems: "center", gap: 5, marginTop: 12, flexShrink: 0,
            background: "none", border: "none", cursor: "pointer", padding: 0,
            fontFamily: FONT, fontSize: 11, fontWeight: 500, color: CLAIR.accent,
          }}>
          Voir les événements
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      )}
    </>
  );
}
