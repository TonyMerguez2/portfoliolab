"use client";
import { useEffect, useMemo, useState } from "react";
import AssetLogo from "@/components/AssetLogo";
import { FONT, NUM } from "@/lib/typography";
import { enTetesAuth } from "@/lib/session";
import Cadre from "@/components/ui/Cadre";
import { JETONS } from "@/lib/palette";
import { API_URL as API } from "@/lib/api";
import {
  resume, resultats, repartitionTypes, typesParOperation, montant, parDate,
  LIBELLE_OP, COULEUR_OP, type Tx, type TypeOp,
} from "@/lib/journal";
import {
  lireComptes, listerLesApports, type Compte, type ApportRange,
} from "@/lib/comptes";


/** Géométrie reprise de la vue générale, pour que les deux onglets s'alignent. */
const MARGE = 10;
const GOUTTIERE = 8;

/**
 * Journal des transactions.
 *
 * La page répond à « qu'ai-je fait, et qu'est-ce que ça a donné ? ». Chaque
 * chiffre vient des écritures ; rien n'y est estimé. Les panneaux dont les
 * données n'existent pas encore — les dividendes — le disent au lieu de
 * montrer un zéro qu'on prendrait pour une mesure.
 *
 * ⚠️ **Les apports de trésorerie figurent ici au même titre que les achats.** C'est ce que
 * « comme pour l'achat d'actions » veut dire : verser 500 € sur un livret est une écriture
 * datée, elle a sa place dans le journal des écritures. Les en écarter aurait laissé
 * l'épargnant devant une liste qui prétend tout montrer et tait la moitié de son
 * patrimoine — d'autant qu'ils portent déjà leur pastille sur la courbe d'à côté.
 *
 * ⚠️ **Un apport n'a ni quantité, ni cours, ni résultat, et l'écran l'assume.** Les
 * colonnes correspondantes affichent un tiret plutôt qu'un zéro : verser n'est pas gagner,
 * et un « 0 € » dans la colonne Résultat se lirait comme une opération blanche alors qu'il
 * n'y a rien à mesurer.
 */

type Position = { ticker: string; current_price: number | null; current_value: number | null };

/**
 * Le dossier regardé : tout le portefeuille, un compte déclaré, ou le reliquat.
 *
 * ⚠️ **Le même vocabulaire que le sélecteur du graphique** — `"total"`, l'identifiant du
 * compte, ou `"__libre__"`. Deux écrans voisins qui découpent la même chose selon deux
 * conventions auraient fini par diverger, et il aurait fallu traduire de l'un à l'autre.
 */
type Vue = string;
const TOTAL = "total";
const LIBRE = "__libre__";

/**
 * Une entrée du journal : une opération de bourse ou un apport de trésorerie.
 *
 * ⚠️ **Une clé textuelle plutôt que l'identifiant nu.** Les opérations sont numérotées par
 * la base, les apports portent un UUID : sans préfixe, rien ne garantissait qu'un jour les
 * deux ne se rencontrent pas sur la même valeur, et la sélection aurait désigné deux lignes
 * à la fois.
 */
type Entree =
  | { genre: "op"; cle: string; date: string; tx: Tx; compteId: string | null }
  | { genre: "apport"; cle: string; date: string; apport: ApportRange };

const cleOp = (id: number) => `op:${id}`;
const cleApport = (id: string) => `ap:${id}`;

const eur = (v: number, dec = 2) =>
  v.toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + " €";

const dateCourte = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" });

function Carte({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <Cadre style={{ padding: "14px 18px", display: "flex", flexDirection: "column", minHeight: 0, ...style }}>
      {children}
    </Cadre>
  );
}

function Titre({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexShrink: 0 }}>
      <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: "rgba(var(--nv-encre-rvb), 0.88)" }}>
        {children}
      </span>
      {action}
    </div>
  );
}

function Ligne({ label, valeur, couleur }: { label: string; valeur: React.ReactNode; couleur?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "5px 0" }}>
      <span style={{ fontFamily: FONT, fontSize: 11.5, color: "rgba(var(--nv-encre-rvb), 0.45)" }}>{label}</span>
      <span style={{ ...NUM, fontSize: 12.5, fontWeight: 600, color: couleur ?? "rgba(var(--nv-encre-rvb), 0.90)" }}>
        {valeur}
      </span>
    </div>
  );
}

export default function TransactionsView({
  portfolioId, refreshKey, onNewTransaction, selectionDemandee,
}: {
  portfolioId: string;
  refreshKey: number;
  onNewTransaction: () => void;
  /** Écriture à mettre en avant, désignée depuis le graphique de la vue générale. */
  selectionDemandee?: number | null;
}) {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [apports, setApports] = useState<ApportRange[]>([]);
  const [vue, setVue] = useState<Vue>(TOTAL);
  const [choisie, setChoisie] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [confirme, setConfirme] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [suppression, setSuppression] = useState(false);

  // ── Données ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!portfolioId) return;
    let annule = false;
    setChargement(true);
    Promise.all([
      fetch(`${API}/api/v1/portfolios/${portfolioId}/transactions`, { headers: enTetesAuth() })
        .then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`${API}/api/v1/portfolios/${portfolioId}/positions`, { headers: enTetesAuth() })
        .then(r => (r.ok ? r.json() : null)).catch(() => null),
      // ⚠️ Les dossiers et leurs apports échouent sans bruit : l'onglet doit rester lisible
      // sur un portefeuille dont aucun compte n'est déclaré, ce qui est le cas le plus
      // courant tant que la reprise n'est pas faite.
      lireComptes(portfolioId).catch(() => [] as Compte[]),
      listerLesApports(portfolioId).catch(() => [] as ApportRange[]),
    ]).then(([tx, pos, cpts, apps]) => {
      if (annule) return;
      const liste: Tx[] = Array.isArray(tx) ? tx : (tx?.transactions ?? []);
      setTxs(liste);
      setPositions(pos?.positions ?? []);
      setComptes(cpts);
      setApports(apps);
      setChargement(false);
      // La plus récente est sélectionnée d'office : un panneau de détail vide
      // à l'arrivée n'apprend rien et laisse la colonne du milieu béante.
      const recentes = parDate(liste);
      setChoisie(prev => prev ?? (recentes.length ? cleOp(recentes[recentes.length - 1].id) : null));
    });
    return () => { annule = true; };
  }, [portfolioId, refreshKey]);

  // Une opération désignée depuis le graphique prend la main sur la sélection
  // par défaut, et la timeline défile jusqu'à elle.
  //
  // ⚠️ **Le dossier se remet sur « Tout » au passage.** L'opération désignée peut
  // appartenir à un compte que le filtre courant écarte : sans cela, le graphique
  // pointerait une ligne que cet onglet a masquée, et le clic n'aurait aucun effet visible.
  useEffect(() => {
    if (selectionDemandee == null) return;
    setVue(TOTAL);
    setChoisie(cleOp(selectionDemandee));
    const el = document.getElementById(`op-${selectionDemandee}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectionDemandee]);

  /**
   * Supprime une écriture.
   *
   * Le serveur refuse si une vente postérieure en dépendait : retirer un achat
   * rendrait cette vente impossible. Son message vaut mieux qu'un « erreur ».
   */
  async function supprimer(id: number) {
    setSuppression(true);
    setErreur(null);
    try {
      const r = await fetch(`${API}/api/v1/portfolios/${portfolioId}/transactions/${id}`, {
        method: "DELETE", headers: enTetesAuth(),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail || `Suppression refusée (${r.status})`);
      }
      setTxs(prev => prev.filter(t => t.id !== id));
      setChoisie(prev => (prev === cleOp(id) ? null : prev));
      setConfirme(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Suppression impossible");
    } finally {
      setSuppression(false);
    }
  }

  // ── Calculs ────────────────────────────────────────────────────────────────
  const cours = useMemo(
    () => Object.fromEntries(positions.map(p => [p.ticker, p.current_price])) as Record<string, number | null>,
    [positions]);

  const recap    = useMemo(() => resume(txs, cours), [txs, cours]);
  const resultat = useMemo(() => resultats(txs, cours), [txs, cours]);
  const types    = useMemo(() => typesParOperation(txs), [txs]);
  const parts    = useMemo(() => repartitionTypes(txs), [txs]);
  const parId    = useMemo(
    () => Object.fromEntries(resultat.map(r => [r.tx.id, r])), [resultat]);

  /** Les écritures telles que le graphique les attend. */
  const reperes = useMemo(
    () => txs.map(t => ({
      id: t.id, ticker: t.ticker, executed_at: t.executed_at,
      type: types[t.id], couleur: COULEUR_OP[types[t.id]], libelle: LIBELLE_OP[types[t.id]],
    })),
    [txs, types]);

  const nomDeCompte = useMemo(
    () => Object.fromEntries(comptes.map(c => [c.id, c])) as Record<string, Compte>,
    [comptes]);

  /**
   * Les dossiers proposés au filtre.
   *
   * ⚠️ **Seuls ceux qui ont quelque chose à montrer.** Un compte déclaré sans la moindre
   * écriture ni le moindre apport ouvrirait une liste vide : un onglet qui propose un
   * chemin menant nulle part se lit comme une panne.
   *
   * ⚠️ **Et le reliquat en dernier, s'il existe.** Tant que la déclaration des comptes
   * n'est pas faite, la plupart des opérations n'en visent aucun ; sans ce groupe, filtrer
   * ferait disparaître l'essentiel du journal sans dire où c'est passé.
   */
  const dossiers = useMemo(() => {
    const avecOps = new Set(txs.map(t => t.compte_id).filter(Boolean) as string[]);
    const avecApports = new Set(apports.map(a => a.compte_id));
    const lot = comptes
      .filter(c => avecOps.has(c.id) || avecApports.has(c.id))
      .map(c => ({ cle: c.id, nom: c.nom, couleur: c.couleur }));
    if (txs.some(t => !t.compte_id || !nomDeCompte[t.compte_id])) {
      lot.push({ cle: LIBRE, nom: "Non rattachées", couleur: JETONS.texteAttenue });
    }
    return lot;
  }, [comptes, txs, apports, nomDeCompte]);

  /** Ce que le dossier regardé laisse passer. */
  const dansLaVue = useMemo(() => {
    const opRangee = (t: Tx) =>
      t.compte_id && nomDeCompte[t.compte_id] ? t.compte_id : LIBRE;
    return {
      txs: vue === TOTAL ? txs : txs.filter(t => opRangee(t) === vue),
      // ⚠️ Un apport appartient toujours à un compte : le reliquat n'en contient aucun.
      apports: vue === TOTAL ? apports
        : vue === LIBRE ? [] : apports.filter(a => a.compte_id === vue),
    };
  }, [vue, txs, apports, nomDeCompte]);

  /**
   * Le journal complet du dossier regardé, opérations et apports mêlés, du plus récent au
   * plus ancien.
   */
  const entrees = useMemo<Entree[]>(() => {
    const lot: Entree[] = [
      ...dansLaVue.txs.map(t => ({
        genre: "op" as const, cle: cleOp(t.id), date: t.executed_at, tx: t,
        compteId: t.compte_id ?? null,
      })),
      ...dansLaVue.apports.map(a => ({
        genre: "apport" as const, cle: cleApport(a.id), date: a.date ?? "", apport: a,
      })),
    ];
    return lot.sort((x, y) => y.date.localeCompare(x.date));
  }, [dansLaVue]);

  /**
   * ⚠️ **La sélection suit le dossier qu'on vient de choisir.** Elle survivait au filtre :
   * après être passé sur « Livret A », le panneau de détail décrivait encore un
   * renforcement de bitcoin, absent de la liste affichée. Un détail qui désigne une ligne
   * qu'on ne voit nulle part donne à croire à une erreur d'affichage. On retombe donc sur
   * la plus récente du dossier, comme à l'arrivée sur l'onglet.
   */
  useEffect(() => {
    if (!entrees.length) { setChoisie(null); return; }
    setChoisie(prev => (prev && entrees.some(e => e.cle === prev)) ? prev : entrees[0].cle);
  }, [entrees]);

  const choisieOp = choisie?.startsWith("op:") ? Number(choisie.slice(3)) : null;
  const detail    = choisieOp != null ? parId[choisieOp] : null;
  const detailApport = useMemo(
    () => (choisie?.startsWith("ap:")
      ? apports.find(a => a.id === choisie.slice(3)) ?? null : null),
    [choisie, apports]);
  const valeurTotale = positions.reduce((s, p) => s + (p.current_value ?? 0), 0);

  if (chargement) {
    return <div style={{ padding: 40, textAlign: "center", fontFamily: FONT, fontSize: 12, color: "rgba(var(--nv-encre-rvb), 0.30)" }}>Chargement…</div>;
  }

  // ⚠️ **Les apports comptent pour « il y a quelque chose ».** Un portefeuille qui n'est
  // fait que d'épargne a un journal — ses versements — et l'accueillir par « Aucune
  // transaction » lui dirait que rien n'a été saisi alors que tout l'est.
  if (!txs.length && !apports.length) {
    return (
      <Carte style={{ margin: 14, alignItems: "center", justifyContent: "center", padding: 48 }}>
        <p style={{ fontFamily: FONT, fontSize: 13, color: "rgba(var(--nv-encre-rvb), 0.55)", margin: "0 0 6px" }}>
          Aucune transaction
        </p>
        <p style={{ fontFamily: FONT, fontSize: 11.5, color: "rgba(var(--nv-encre-rvb), 0.30)", margin: "0 0 16px", textAlign: "center", lineHeight: 1.6 }}>
          Le portefeuille se compose de vos écritures. Ajoutez la première.
        </p>
        <button onClick={onNewTransaction} style={{
          padding: "9px 16px", borderRadius: 10, border: `1px solid ${JETONS.accentBord}`,
          background: JETONS.accentDoux, color: JETONS.accent, fontSize: 12,
          fontWeight: 600, cursor: "pointer", fontFamily: FONT,
        }}>+ Nouvelle transaction</button>
      </Carte>
    );
  }

  return (
    // Même géométrie que la vue générale : marge de 10 px, gouttière de 8,
    // rayon de 30. Deux onglets voisins aux cadres décalés se voient.
    // Même géométrie que la vue générale, jusqu'au rembourrage : la marge du
    // bas vient du bas de page, commun aux onglets. L'écran tient dans la
    // fenêtre et ne défile pas — les panneaux se partagent la hauteur au
    // prorata, chacun défilant chez lui.
    <div style={{
      display: "flex", gap: GOUTTIERE, padding: `8px ${MARGE}px 0`,
      height: "100%", minHeight: 0, overflow: "hidden",
    }}>

      {/* ── Colonne principale ───────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: GOUTTIERE, flex: 1,
                    minWidth: 0, minHeight: 0 }}>

        {/* Le tableau prend la place du graphique : la courbe est déjà celle
            de la vue générale, la répéter d'un onglet à l'autre n'apprenait
            rien de plus. */}
        <Carte style={{ flex: 1.15, minHeight: 0 }}>
          <Titre>
            {vue === TOTAL ? "Toutes les écritures"
              : `Écritures de ${dossiers.find(d => d.cle === vue)?.nom ?? "ce dossier"}`}
          </Titre>
          {/* ⚠️ **Sur sa propre ligne, et non dans le titre.** Placé à droite de celui-ci,
              le rang de dossiers entrait en concurrence avec lui pour la même largeur : à
              six comptes, le titre se brisait en deux lignes et les dernières pastilles
              sortaient du cadre. Vu à l'écran. */}
          {dossiers.length > 0 && (
            <BarreDossiers dossiers={dossiers} vue={vue} onChoisir={setVue} />
          )}
          <div style={{ overflowY: "auto", minHeight: 0, flex: 1 }}>
            <TableauOperations
              lignes={entrees} types={types} parId={parId} comptes={nomDeCompte}
              choisie={choisie} onChoisir={setChoisie}
            />
          </div>
        </Carte>

        {/* Hauteur fixe, et non minimale : sans plafond, la timeline grandit
            avec ses écritures au lieu de défiler, et le panneau de détail —
            étiré à la même hauteur par la grille — se creuse d'un vide que
            rien ne remplit. */}
        {/* Timeline et détail, hauteur fixe sous le tableau. Le tableau ayant
            pris la place du graphique, la rangée n'a plus qu'à se poser
            dessous — et le cadre ne défile pas, donc rien n'est coupé. */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "230px minmax(0,1fr)",
          gap: GOUTTIERE, flex: 1, minHeight: 0,
        }}>

          {/* Timeline */}
          <Carte>
            <Titre>Timeline</Titre>
            <div style={{ overflowY: "auto", minHeight: 0, flex: 1 }}>
              {entrees.map(e => {
                const actif = e.cle === choisie;
                // ⚠️ Un apport emprunte la teinte violette de son type — hors de l'échelle
                // vert-rouge des opérations : verser n'est ni une réussite ni un échec.
                const type: TypeOp = e.genre === "op" ? types[e.tx.id] : "apport";
                const verse = e.genre === "apport" && e.apport.montant >= 0;
                return (
                  <button key={e.cle}
                    id={e.genre === "op" ? `op-${e.tx.id}` : undefined}
                    onClick={() => setChoisie(e.cle)} style={{
                    display: "flex", gap: 9, width: "100%", textAlign: "left", padding: "7px 8px",
                    borderRadius: 9, marginBottom: 2, cursor: "pointer", fontFamily: FONT,
                    background: actif ? JETONS.accentVoile : "transparent",
                    border: `1px solid ${actif ? JETONS.accentBord : "transparent"}`,
                  }}>
                    <i style={{ width: 7, height: 7, borderRadius: "50%", background: COULEUR_OP[type], marginTop: 5, flexShrink: 0 }} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: "block", fontSize: 10, color: "rgba(var(--nv-encre-rvb), 0.32)" }}>
                        {dateCourte(e.date)}
                      </span>
                      <span style={{ display: "block", fontSize: 12, fontWeight: 600,
                                     color: "rgba(var(--nv-encre-rvb), 0.88)",
                                     overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {e.genre === "op"
                          ? `${LIBELLE_OP[type]} ${e.tx.ticker}`
                          : `${verse ? "Versement" : "Retrait"} · ${nomDeCompte[e.apport.compte_id]?.nom ?? "compte supprimé"}`}
                      </span>
                      <span style={{ ...NUM, display: "block", fontSize: 10.5, color: "rgba(var(--nv-encre-rvb), 0.40)" }}>
                        {e.genre === "op"
                          ? `${e.tx.quantity.toLocaleString("fr-FR", { maximumFractionDigits: 6 })} × ${eur(e.tx.unit_price)}`
                          : eur(Math.abs(e.apport.montant))}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Carte>

          {/* Détail */}
          <Carte>
            <Titre>{detailApport ? "Détail de l’apport" : "Détail de l’opération"}</Titre>
            {detailApport ? (
              <DetailApport apport={detailApport} compte={nomDeCompte[detailApport.compte_id]} />
            ) : detail ? (() => {
              const t = detail.tx;
              const p = cours[t.ticker];
              const valeurLigne = p != null ? t.quantity * p : null;
              const poids = valeurLigne != null && valeurTotale > 0 ? (valeurLigne / valeurTotale) * 100 : null;
              return (
                <div style={{ overflowY: "auto", minHeight: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <AssetLogo ticker={t.ticker} type={t.asset_type} size={30} radius={8}
                      fallbackBg={JETONS.accentDoux} fallbackBorder={JETONS.accentBord}
                      fallbackTextColor={JETONS.accent} />
                    <span>
                      <span style={{ display: "block", fontFamily: FONT, fontSize: 13, fontWeight: 700, color: COULEUR_OP[detail.type] }}>
                        {LIBELLE_OP[detail.type]} {t.ticker}
                      </span>
                      <span style={{ display: "block", fontFamily: FONT, fontSize: 10.5, color: "rgba(var(--nv-encre-rvb), 0.35)" }}>
                        {new Date(t.executed_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                      </span>
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 12 }}>
                    {[
                      ["Quantité", t.quantity.toLocaleString("fr-FR", { maximumFractionDigits: 8 })],
                      ["Prix unitaire", eur(t.unit_price)],
                      ["Montant", eur(montant(t))],
                      ["Frais", eur(t.fees ?? 0)],
                    ].map(([l, v]) => (
                      <div key={l} style={{ background: "rgba(var(--nv-encre-rvb), 0.04)", borderRadius: 10, padding: "8px 10px" }}>
                        <div style={{ fontFamily: FONT, fontSize: 9.5, color: "rgba(var(--nv-encre-rvb), 0.32)", marginBottom: 3 }}>{l}</div>
                        <div style={{ ...NUM, fontSize: 12, fontWeight: 700, color: "rgba(var(--nv-encre-rvb), 0.92)", whiteSpace: "nowrap" }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontFamily: FONT, fontSize: 9.5, color: "rgba(var(--nv-encre-rvb), 0.32)", marginBottom: 3 }}>
                        Poids dans le portefeuille
                      </div>
                      <div style={{ ...NUM, fontSize: 12.5, fontWeight: 700, color: "rgba(var(--nv-encre-rvb), 0.92)", whiteSpace: "nowrap" }}>
                        {poids != null ? `${poids.toFixed(2)} %` : "—"}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontFamily: FONT, fontSize: 9.5, color: "rgba(var(--nv-encre-rvb), 0.32)", marginBottom: 3 }}>
                        Valeur actuelle
                      </div>
                      <div style={{ ...NUM, fontSize: 12.5, fontWeight: 700, color: "rgba(var(--nv-encre-rvb), 0.92)", whiteSpace: "nowrap" }}>
                        {valeurLigne != null ? eur(valeurLigne) : "—"}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontFamily: FONT, fontSize: 9.5, color: "rgba(var(--nv-encre-rvb), 0.32)", marginBottom: 3 }}>
                        {detail.realise ? "Résultat réalisé" : "Plus-value latente"}
                      </div>
                      <div style={{ ...NUM, fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap",
                        color: detail.gain == null ? "rgba(var(--nv-encre-rvb), 0.40)" : detail.gain >= 0 ? JETONS.positif : JETONS.negatif }}>
                        {detail.gain == null ? "—" : `${detail.gain >= 0 ? "+" : ""}${eur(detail.gain)}`}
                        {detail.gainPct != null && (
                          <span style={{ display: "block", opacity: 0.6, fontSize: 10.5, fontWeight: 600 }}>
                            {detail.gainPct >= 0 ? "+" : ""}{detail.gainPct.toFixed(2)} %
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ borderTop: "1px solid rgba(var(--nv-encre-rvb), 0.07)", paddingTop: 10 }}>
                    <div style={{ fontFamily: FONT, fontSize: 9.5, color: "rgba(var(--nv-encre-rvb), 0.32)", marginBottom: 4 }}>
                      Note personnelle
                    </div>
                    <div style={{ fontFamily: FONT, fontSize: 11.5, lineHeight: 1.6,
                      color: t.note ? "rgba(var(--nv-encre-rvb), 0.65)" : "rgba(var(--nv-encre-rvb), 0.25)" }}>
                      {t.note || "Aucune note sur cette opération."}
                    </div>
                  </div>

                  {erreur && (
                    <div style={{ marginTop: 10, padding: "7px 10px", borderRadius: 8,
                      background: JETONS.negatifVoile, border: `1px solid ${JETONS.negatifDoux}`,
                      fontFamily: FONT, fontSize: 10.5, color: JETONS.negatif, lineHeight: 1.5 }}>
                      {erreur}
                    </div>
                  )}

                  <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    {confirme === t.id ? (
                      <>
                        <button onClick={() => setConfirme(null)} style={{
                          padding: "5px 10px", borderRadius: 8, border: "1px solid rgba(var(--nv-encre-rvb), 0.10)",
                          background: "transparent", color: "rgba(var(--nv-encre-rvb), 0.45)",
                          fontSize: 10.5, cursor: "pointer", fontFamily: FONT }}>Annuler</button>
                        <button onClick={() => supprimer(t.id)} disabled={suppression} style={{
                          padding: "5px 10px", borderRadius: 8, border: `1px solid ${JETONS.negatifDoux}`,
                          background: JETONS.negatifDoux, color: JETONS.negatif, fontWeight: 600,
                          fontSize: 10.5, cursor: suppression ? "default" : "pointer", fontFamily: FONT,
                          opacity: suppression ? 0.5 : 1 }}>
                          {suppression ? "Suppression…" : "Confirmer la suppression"}
                        </button>
                      </>
                    ) : (
                      <button onClick={() => { setConfirme(t.id); setErreur(null); }} style={{
                        padding: "5px 10px", borderRadius: 8, border: "1px solid rgba(var(--nv-encre-rvb), 0.10)",
                        background: "transparent", color: "rgba(var(--nv-encre-rvb), 0.35)",
                        fontSize: 10.5, cursor: "pointer", fontFamily: FONT }}>
                        Supprimer cette opération
                      </button>
                    )}
                  </div>
                </div>
              );
            })() : (
              <div style={{ fontFamily: FONT, fontSize: 11.5, color: "rgba(var(--nv-encre-rvb), 0.28)" }}>
                Choisissez une opération dans la timeline.
              </div>
            )}
          </Carte>

        </div>
      </div>

      {/* ── Colonne de droite ────────────────────────────────────────────── */}
      {/* Le dernier panneau s'étire pour occuper le bas : sans quoi la colonne
          s'arrêtait à mi-hauteur et laissait un vide que rien ne justifiait. */}
      <div style={{ display: "flex", flexDirection: "column", gap: GOUTTIERE,
                    width: 320, flexShrink: 0, minHeight: 0 }}>

        <Carte style={{ flexShrink: 0 }}>
          <Titre action={
            <button onClick={onNewTransaction} style={{
              padding: "6px 11px", borderRadius: 9, border: `1px solid ${JETONS.accentBord}`,
              background: JETONS.accentDoux, color: JETONS.accent, fontSize: 11,
              fontWeight: 600, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap",
            }}>+ Nouvelle</button>
          }>Résumé</Titre>
          <Ligne label="Nombre d'opérations" valeur={recap.operations} />
          <Ligne label="Capital investi" valeur={eur(recap.capitalInvesti, 0)} />
          <Ligne label="Gain latent"
            valeur={recap.gainLatent == null ? "—" : `${recap.gainLatent >= 0 ? "+" : ""}${eur(recap.gainLatent, 0)}`}
            couleur={recap.gainLatent == null ? undefined : recap.gainLatent >= 0 ? JETONS.positif : JETONS.negatif} />
          <Ligne label="Meilleure opération"
            valeur={recap.meilleure?.gain == null ? "—" : `${recap.meilleure.gain >= 0 ? "+" : ""}${eur(recap.meilleure.gain, 0)}`}
            couleur={JETONS.positif} />
          <Ligne label="Pire opération"
            valeur={recap.pire?.gain == null ? "—" : `${recap.pire.gain >= 0 ? "+" : ""}${eur(recap.pire.gain, 0)}`}
            couleur={recap.pire?.gain != null && recap.pire.gain >= 0 ? JETONS.positif : JETONS.negatif} />
          <Ligne label="Durée moyenne de détention"
            valeur={recap.dureeMoyenneJours == null ? "—" : `${recap.dureeMoyenneJours} jours`} />
        </Carte>

        {/* Dividendes — le modèle ne connaît qu'achat et vente. Un panneau à
            zéro se lirait comme « vous n'avez rien touché » ; il dit plutôt
            que la saisie n'existe pas encore. */}
        <Carte style={{ flexShrink: 0 }}>
          <Titre>Dividendes</Titre>
          <p style={{ fontFamily: FONT, fontSize: 11.5, color: "rgba(var(--nv-encre-rvb), 0.30)", margin: 0, lineHeight: 1.6 }}>
            Aucun dividende enregistré.<br />
            La saisie des dividendes n&apos;est pas encore disponible : une
            transaction ne peut être qu&apos;un achat ou une vente.
          </p>
        </Carte>

        <Carte style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <Titre>Répartition des opérations</Titre>
          <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 12 }}>
            {parts.map(p => (
              <div key={p.type} style={{ width: `${p.part}%`, background: COULEUR_OP[p.type] }} />
            ))}
          </div>
          {parts.map(p => (
            <div key={p.type} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: FONT, fontSize: 11.5, color: "rgba(var(--nv-encre-rvb), 0.55)" }}>
                <i style={{ width: 7, height: 7, borderRadius: "50%", background: COULEUR_OP[p.type] }} />
                {LIBELLE_OP[p.type]}
              </span>
              <span style={{ ...NUM, fontSize: 12, fontWeight: 600, color: "rgba(var(--nv-encre-rvb), 0.85)" }}>
                {p.part.toFixed(0)} %
              </span>
            </div>
          ))}
        </Carte>
      </div>
    </div>
  );
}


/**
 * Le tableau des opérations.
 *
 * Extrait pour être posé à deux endroits : à droite du détail quand la largeur
 * le permet, en pleine largeur dessous sinon. L'écrire deux fois aurait suffi
 * à ce que les deux divergent.
 */
/**
 * Le détail d'un apport de trésorerie.
 *
 * ⚠️ **Aucun résultat, et c'est dit plutôt que tu.** Un panneau qui montrerait les mêmes
 * cases que pour une opération — poids, valeur actuelle, plus-value — avec des tirets
 * partout donnerait à croire à une mesure manquante. Il n'en manque aucune : verser de
 * l'argent n'a pas de performance, et la phrase le dit à la place des cases vides.
 *
 * ⚠️ **La correction se fait au journal du compte, pas ici.** Cet onglet donne à lire
 * l'histoire du portefeuille ; la modifier appartient à la fiche du compte, où le geste a
 * son garde-fou et sa distinction entre corriger et verser.
 */
function DetailApport({ apport, compte }: { apport: ApportRange; compte?: Compte }) {
  const verse = apport.montant >= 0;
  return (
    <div style={{ overflowY: "auto", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          background: `${COULEUR_OP.apport}22`, border: `1px solid ${COULEUR_OP.apport}55`,
          color: COULEUR_OP.apport, fontFamily: FONT, fontSize: 14, fontWeight: 700,
        }}>{verse ? "+" : "−"}</span>
        <span>
          <span style={{ display: "block", fontFamily: FONT, fontSize: 13, fontWeight: 700, color: COULEUR_OP.apport }}>
            {verse ? "Versement" : "Retrait"} · {compte?.nom ?? "Compte supprimé"}
          </span>
          <span style={{ display: "block", fontFamily: FONT, fontSize: 10.5, color: "rgba(var(--nv-encre-rvb), 0.35)" }}>
            {apport.date && new Date(apport.date).toLocaleDateString("fr-FR",
              { day: "numeric", month: "long", year: "numeric" })}
          </span>
        </span>
      </div>

      <div style={{ background: "rgba(var(--nv-encre-rvb), 0.04)", borderRadius: 10, padding: "8px 10px", marginBottom: 12 }}>
        <div style={{ fontFamily: FONT, fontSize: 9.5, color: "rgba(var(--nv-encre-rvb), 0.32)", marginBottom: 3 }}>Montant</div>
        <div style={{ ...NUM, fontSize: 12, fontWeight: 700, color: "rgba(var(--nv-encre-rvb), 0.92)", whiteSpace: "nowrap" }}>
          {verse ? "+" : "−"}{eur(Math.abs(apport.montant))}
        </div>
      </div>

      <div style={{ borderTop: "1px solid rgba(var(--nv-encre-rvb), 0.07)", paddingTop: 10, marginBottom: 12 }}>
        <div style={{ fontFamily: FONT, fontSize: 9.5, color: "rgba(var(--nv-encre-rvb), 0.32)", marginBottom: 4 }}>Note</div>
        <div style={{ fontFamily: FONT, fontSize: 11.5, lineHeight: 1.6,
          color: apport.note ? "rgba(var(--nv-encre-rvb), 0.65)" : "rgba(var(--nv-encre-rvb), 0.25)" }}>
          {apport.note || "Aucune note sur cet apport."}
        </div>
      </div>

      <div style={{ fontFamily: FONT, fontSize: 10.5, lineHeight: 1.6, color: "rgba(var(--nv-encre-rvb), 0.35)" }}>
        Un apport monte votre patrimoine sans être une performance : il n’a ni résultat ni
        plus-value. Pour le corriger, ouvrez la fiche de {compte?.nom ?? "son compte"}.
      </div>
    </div>
  );
}

/**
 * Le choix du dossier regardé.
 *
 * ⚠️ **Posé dans le titre du tableau, et non au-dessus de l'onglet.** Il ne commande que
 * cette liste-là : le résumé de droite continue de porter sur le portefeuille entier, et
 * un filtre planté en tête de page aurait laissé croire qu'il s'applique à tout ce qui est
 * visible.
 */
function BarreDossiers({
  dossiers, vue, onChoisir,
}: {
  dossiers: { cle: string; nom: string; couleur: string }[];
  vue: string;
  onChoisir: (v: string) => void;
}) {
  const puce = (actif: boolean): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "4px 9px", borderRadius: 8, cursor: "pointer", fontFamily: FONT,
    fontSize: 10.5, fontWeight: 600, whiteSpace: "nowrap",
    background: actif ? JETONS.accentVoile : "transparent",
    border: `1px solid ${actif ? JETONS.accentBord : "rgba(var(--nv-encre-rvb), 0.08)"}`,
    color: actif ? JETONS.accent : "rgba(var(--nv-encre-rvb), 0.45)",
  });
  return (
    <div style={{ display: "flex", gap: 4, overflowX: "auto", marginBottom: 10,
                  paddingBottom: 2, flexShrink: 0 }}>
      <button onClick={() => onChoisir(TOTAL)} style={puce(vue === TOTAL)}>Tout</button>
      {dossiers.map(d => (
        <button key={d.cle} onClick={() => onChoisir(d.cle)} style={puce(vue === d.cle)}
          title={`Les écritures de ${d.nom}`}>
          <i style={{ width: 6, height: 6, borderRadius: "50%", background: d.couleur, flexShrink: 0 }} />
          {d.nom}
        </button>
      ))}
    </div>
  );
}

function TableauOperations({
  lignes, types, parId, comptes, choisie, onChoisir,
}: {
  lignes: Entree[];
  types: Record<number, TypeOp>;
  parId: Record<number, { gain: number | null }>;
  comptes: Record<string, Compte>;
  choisie: string | null;
  onChoisir: (cle: string) => void;
}) {
  return (
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT, tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "18%" }} />
          <col style={{ width: "20%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "18%" }} />
        </colgroup>
        <thead>
          <tr>
            {["Date", "Type", "Actif", "Qté", "Montant", "Résultat"].map((h, i) => (
              <th key={h} style={{
                // L'en-tête est collant : son fond doit être opaque, sinon les
                // lignes défilent au travers. D'où le jeton de carte et non un
                // voile — c'est ce qui interdit ici l'encre translucide.
                position: "sticky", top: 0, background: JETONS.carte,
                // Interlettrage et marges resserrés : « Résultat » réclamait
                // 60 px dans une colonne qui en offrait 52.
                textAlign: i >= 3 ? "right" : "left", padding: "6px 3px",
                fontSize: 9, fontWeight: 700, letterSpacing: "0.02em",
                color: JETONS.texteAttenue, textTransform: "uppercase",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map(e => {
            const actif = e.cle === choisie;
            const cellule: React.CSSProperties = {
              padding: "7px 6px", fontSize: 10.5, whiteSpace: "nowrap",
            };
            const fond = {
              cursor: "pointer",
              background: actif ? JETONS.accentVoile : "transparent",
              borderTop: "1px solid rgba(var(--nv-encre-rvb), 0.05)",
            } as React.CSSProperties;

            // ⚠️ **Un apport n'a ni quantité, ni cours, ni résultat.** Les colonnes
            // correspondantes portent un tiret : un « 0 € » en face de Résultat se lirait
            // comme une opération blanche, alors qu'il n'y a rien à mesurer — verser n'est
            // pas gagner, et c'est la règle centrale de ce portefeuille.
            if (e.genre === "apport") {
              const verse = e.apport.montant >= 0;
              const nom = comptes[e.apport.compte_id]?.nom ?? "Compte supprimé";
              const vide = { ...cellule, textAlign: "right" as const,
                             color: "rgba(var(--nv-encre-rvb), 0.25)" };
              return (
                <tr key={e.cle} onClick={() => onChoisir(e.cle)} style={fond}>
                  <td style={{ ...cellule, color: "rgba(var(--nv-encre-rvb), 0.55)" }}>
                    {new Date(e.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                  </td>
                  <td style={cellule}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5,
                                   color: COULEUR_OP.apport, overflow: "hidden",
                                   textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                      <i style={{ width: 6, height: 6, borderRadius: "50%", background: COULEUR_OP.apport, flexShrink: 0 }} />
                      {verse ? "Versement" : "Retrait"}
                    </span>
                  </td>
                  <td style={{ ...cellule, fontSize: 11, fontWeight: 600,
                               color: "rgba(var(--nv-encre-rvb), 0.70)",
                               overflow: "hidden", textOverflow: "ellipsis" }}>{nom}</td>
                  <td style={{ ...NUM, ...vide }}>—</td>
                  <td style={{ ...NUM, ...cellule, textAlign: "right", color: "rgba(var(--nv-encre-rvb), 0.75)" }}>
                    {verse ? "+" : "−"}{eur(Math.abs(e.apport.montant))}
                  </td>
                  <td style={{ ...NUM, ...vide }}>—</td>
                </tr>
              );
            }

            const t = e.tx;
            const r = parId[t.id];
            return (
              <tr key={e.cle} onClick={() => onChoisir(e.cle)} style={fond}>
                <td style={{ ...cellule, color: "rgba(var(--nv-encre-rvb), 0.55)" }}>
                  {new Date(t.executed_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                </td>
                <td style={cellule}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: COULEUR_OP[types[t.id]],
                                 overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                    <i style={{ width: 6, height: 6, borderRadius: "50%", background: COULEUR_OP[types[t.id]], flexShrink: 0 }} />
                    {LIBELLE_OP[types[t.id]]}
                  </span>
                </td>
                <td style={{ ...cellule, fontSize: 11, fontWeight: 600, color: "rgba(var(--nv-encre-rvb), 0.88)",
                             overflow: "hidden", textOverflow: "ellipsis" }}>{t.ticker}</td>
                <td style={{ ...NUM, ...cellule, textAlign: "right", color: "rgba(var(--nv-encre-rvb), 0.60)" }}>
                  {t.side === "SELL" ? "−" : "+"}{t.quantity.toLocaleString("fr-FR", { maximumFractionDigits: 6 })}
                </td>
                <td style={{ ...NUM, ...cellule, textAlign: "right", color: "rgba(var(--nv-encre-rvb), 0.75)" }}>{eur(montant(t))}</td>
                <td style={{ ...NUM, ...cellule, textAlign: "right", fontWeight: 600,
                  color: r?.gain == null ? "rgba(var(--nv-encre-rvb), 0.25)" : r.gain >= 0 ? JETONS.positif : JETONS.negatif }}>
                  {r?.gain == null ? "—" : `${r.gain >= 0 ? "+" : ""}${Math.round(r.gain).toLocaleString("fr-FR")} €`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
  );
}
