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
 * ⚠️ **Les deux routes d'échéances sont lues, et fusionnées.** La « transparence » regarde à
 * travers les fonds : un portefeuille d'ETF ne publie aucun résultat, ce sont les sociétés
 * détenues qui en publient, et c'est bien le portefeuille qu'elles remuent. La route simple
 * n'aurait donc jamais rempli la ligne « résultats ».
 *
 * ⚠️ **Mais la transparence dépend de la composition des fonds, qui peut manquer.** Vu à
 * l'écran : 41 échéances côté route simple, zéro côté transparence, et le panneau annonçait
 * « rien d'annoncé » sur les deux lignes — y compris l'économique, que la route simple avait
 * en nombre. S'appuyer sur la seule source la plus riche revient à la rendre obligatoire.
 * Les deux listes se fondent donc, et le doublon se reconnaît à sa nature, sa date et son
 * titre.
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

    Promise.all([
      lire("/transactions"), lire("/events/transparence"), lire("/events"),
    ]).then(([tx, parTransparence, simples]) => {
      if (annule) return;
      const liste: Operation[] = Array.isArray(tx) ? tx : (tx?.transactions ?? []);
      // ⚠️ Trié ici plutôt que supposé : la route rend l'ordre qu'elle veut, et « la
      // dernière » ne doit pas dépendre de cela.
      const triees = [...liste].sort(
        (a, b) => new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime());
      setOperation(triees[0] ?? null);

      const fondu = new Map<string, Evenement>();
      for (const source of [parTransparence, simples]) {
        for (const e of (Array.isArray(source?.evenements) ? source.evenements : [])) {
          // La transparence passe en premier : à doublon, c'est sa version qu'on garde,
          // parce qu'elle porte le fonds par lequel l'échéance nous concerne.
          const cle = `${e.nature}|${e.date}|${e.ticker ?? e.libelle}`;
          if (!fondu.has(cle)) fondu.set(cle, e);
        }
      }
      setEvenements(Array.from(fondu.values())
        .sort((a, b) => (a.jours ?? 9e9) - (b.jours ?? 9e9)));
      setCharge(true);
    });
    return () => { annule = true; };
  }, [portfolioId, refreshKey]);

  // ⚠️ Les échéances passées sont écartées : la route en rend pour l'historique, et
  // « prochaine publication » ne peut pas désigner hier.
  const aVenir = evenements.filter(e => (e.jours ?? 0) >= 0);
  const economique = aVenir.find(e => e.nature === "economique") ?? null;
  const resultats = aVenir.find(e => e.nature === "resultats") ?? null;

  /**
   * Une ligne d'activité : pastille, titre, précision, valeur.
   *
   * ⚠️ **Les intitulés en capitales ont disparu.** Chaque ligne en portait un — « DERNIÈRE
   * OPÉRATION », « PROCHAINE PUBLICATION ÉCONOMIQUE » — soit trois lignes de texte pour
   * annoncer trois lignes de contenu, dans une carte qui n'en a que pour six. La nature de
   * chaque ligne se lit maintenant dans sa précision : « Achat », « Économie »,
   * « Résultats ».
   *
   * ⚠️ **La pastille encadre le logo au lieu de le poser nu.** Trois images d'origines
   * différentes se succèdent — un logo d'ETF, un drapeau, un logo de société — et sans cadre
   * commun leurs formes et leurs fonds font trois objets sans rapport. Le cadre les met au
   * même gabarit.
   */
  const Ligne = ({ dessin, titre, precision, valeur, teinte, dernier }: {
    dessin?: React.ReactNode;
    titre?: string;
    precision?: string;
    valeur?: string;
    /** La couleur du montant, quand il entre plutôt qu'il ne sort. */
    teinte?: string;
    vide: string;
    dernier?: boolean;
  }) => (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1,
      /**
       * ⚠️ **Un trait pointillé, et seulement entre les lignes.** Sous la dernière, il
       * doublerait le bord de la carte à trois pixels de distance — deux traits parallèles
       * dont l'un ne sépare rien.
       */
      borderBottom: dernier ? "none" : `1px dashed ${CLAIR.bord}`,
    }}>
      <span style={{
        width: 32, height: 32, borderRadius: 10, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: CLAIR.carteCreuse, border: `1px solid ${CLAIR.bord}`,
        overflow: "hidden",
      }}>
        {dessin}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: CLAIR.texte,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {titre ?? "—"}
        </div>
        <div style={{
          fontFamily: FONT, fontSize: 10.5, color: CLAIR.texteAttenue, marginTop: 1,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {precision ?? (charge ? "" : "…")}
        </div>
      </div>
      {valeur && (
        <span style={{
          fontFamily: FONT, fontSize: 12.5, fontWeight: 600, flexShrink: 0,
          color: teinte ?? CLAIR.texte, whiteSpace: "nowrap",
        }}>
          {valeur}
        </span>
      )}
    </div>
  );

  /**
   * ⚠️ **Le signe suit le sens de l'argent, pas celui de l'opération.** Un achat sort des
   * espèces du compte même s'il fait entrer des titres : l'écrire en positif parce qu'on
   * « acquiert » quelque chose donnerait une colonne où tout est vert.
   */
  const montantOperation = operation
    ? `${operation.side === "BUY" ? "−" : "+"}${EUROS.format(Math.round(
        operation.quantity * operation.unit_price + (operation.fees ?? 0)))} €`
    : undefined;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 8, flexShrink: 0 }}>
        <span style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: CLAIR.texte }}>
          Activité
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
        overflow: "hidden" }}>

        <Ligne
          vide="Aucune opération"
          dessin={operation && (
            <AssetLogo ticker={operation.ticker} type={operation.asset_type}
              size={32} radius={10} {...REPLI_LOGO} bare />
          )}
          titre={operation?.ticker}
          precision={operation
            ? `${operation.side === "BUY" ? "Achat" : "Vente"} · ${depuis(operation.executed_at)}`
            : (charge ? "Aucune opération enregistrée" : undefined)}
          valeur={montantOperation}
          // Une vente fait entrer de l'argent : c'est le seul cas vert de la carte.
          teinte={operation?.side === "SELL" ? CLAIR.positif : undefined}
        />

        <Ligne
          vide="Rien d’annoncé"
          dessin={economique && (
            typeof economique.pays === "string" && economique.pays.length === 2
              ? <CountryFlagRounded code={economique.pays} size={32}
                  style={{ display: "block" }} />
              : null
          )}
          titre={economique?.libelle}
          precision={economique
            ? `Économie${economique.ticker ? ` · ${economique.ticker}` : ""}`
            : (charge ? "Rien d’annoncé pour vos zones" : undefined)}
          valeur={economique ? delai(economique.jours, economique.date) : undefined}
        />

        {/* ⚠️ Le nom de la société plutôt que son ticker : par transparence, les lignes d'un
            fonds asiatique sortent en « 0700.HK », qui ne désigne rien pour un lecteur. */}
        <Ligne
          vide="Aucune publication"
          dernier
          dessin={resultats?.ticker && (
            <AssetLogo ticker={resultats.ticker} type="EQUITY" size={32} radius={10}
              {...REPLI_LOGO} bare />
          )}
          titre={resultats
            ? (resultats.nom_societe ?? resultats.ticker ?? resultats.libelle) ?? undefined
            : undefined}
          precision={resultats
            ? `Résultats${resultats.via ? ` · via ${resultats.via}` : ""}`
            : (charge ? "Aucune publication attendue" : undefined)}
          valeur={resultats ? delai(resultats.jours, resultats.date) : undefined}
        />
      </div>

      {onVoirTout && (
        <button type="button" onClick={onVoirTout}
          style={{
            display: "flex", alignItems: "center", gap: 5, marginTop: 8, flexShrink: 0,
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
