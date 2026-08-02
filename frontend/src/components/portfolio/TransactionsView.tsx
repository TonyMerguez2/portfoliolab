"use client";
import { useEffect, useMemo, useState } from "react";
import AssetLogo from "@/components/AssetLogo";
import { FONT, NUM } from "@/lib/typography";
import { enTetesAuth } from "@/lib/session";
import {
  resume, resultats, repartitionTypes, typesParOperation, montant, parDate,
  LIBELLE_OP, COULEUR_OP, type Tx, type TypeOp,
} from "@/lib/journal";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Géométrie reprise de la vue générale, pour que les deux onglets s'alignent. */
const MARGE = 10;
const GOUTTIERE = 8;
const RAYON = 30;

/**
 * Journal des transactions.
 *
 * La page répond à « qu'ai-je fait, et qu'est-ce que ça a donné ? ». Chaque
 * chiffre vient des écritures ; rien n'y est estimé. Les panneaux dont les
 * données n'existent pas encore — les dividendes — le disent au lieu de
 * montrer un zéro qu'on prendrait pour une mesure.
 */

type Position = { ticker: string; current_price: number | null; current_value: number | null };

const eur = (v: number, dec = 2) =>
  v.toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + " €";

const dateCourte = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" });

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
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexShrink: 0 }}>
      <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.88)" }}>
        {children}
      </span>
      {action}
    </div>
  );
}

function Ligne({ label, valeur, couleur }: { label: string; valeur: React.ReactNode; couleur?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "5px 0" }}>
      <span style={{ fontFamily: FONT, fontSize: 11.5, color: "rgba(255,255,255,0.45)" }}>{label}</span>
      <span style={{ ...NUM, fontSize: 12.5, fontWeight: 600, color: couleur ?? "rgba(255,255,255,0.90)" }}>
        {valeur}
      </span>
    </div>
  );
}

export default function TransactionsView({
  portfolioId, refreshKey, onNewTransaction,
}: {
  portfolioId: string;
  refreshKey: number;
  onNewTransaction: () => void;
}) {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [choisie, setChoisie] = useState<number | null>(null);
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
    ]).then(([tx, pos]) => {
      if (annule) return;
      const liste: Tx[] = Array.isArray(tx) ? tx : (tx?.transactions ?? []);
      setTxs(liste);
      setPositions(pos?.positions ?? []);
      setChargement(false);
      // La plus récente est sélectionnée d'office : un panneau de détail vide
      // à l'arrivée n'apprend rien et laisse la colonne du milieu béante.
      const recentes = parDate(liste);
      setChoisie(prev => prev ?? (recentes.length ? recentes[recentes.length - 1].id : null));
    });
    return () => { annule = true; };
  }, [portfolioId, refreshKey]);

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
      setChoisie(prev => (prev === id ? null : prev));
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

  const recentes = useMemo(() => parDate(txs).reverse(), [txs]);
  const detail   = choisie != null ? parId[choisie] : null;
  const valeurTotale = positions.reduce((s, p) => s + (p.current_value ?? 0), 0);

  if (chargement) {
    return <div style={{ padding: 40, textAlign: "center", fontFamily: FONT, fontSize: 12, color: "rgba(255,255,255,0.30)" }}>Chargement…</div>;
  }

  if (!txs.length) {
    return (
      <Carte style={{ margin: 14, alignItems: "center", justifyContent: "center", padding: 48 }}>
        <p style={{ fontFamily: FONT, fontSize: 13, color: "rgba(255,255,255,0.55)", margin: "0 0 6px" }}>
          Aucune transaction
        </p>
        <p style={{ fontFamily: FONT, fontSize: 11.5, color: "rgba(255,255,255,0.30)", margin: "0 0 16px", textAlign: "center", lineHeight: 1.6 }}>
          Le portefeuille se compose de vos écritures. Ajoutez la première.
        </p>
        <button onClick={onNewTransaction} style={{
          padding: "9px 16px", borderRadius: 10, border: "1px solid rgba(91,141,239,0.35)",
          background: "rgba(91,141,239,0.16)", color: "#9BB9FF", fontSize: 12,
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
          <Titre>Toutes les transactions</Titre>
          <div style={{ overflowY: "auto", minHeight: 0, flex: 1 }}>
            <TableauOperations
              lignes={recentes} types={types} parId={parId}
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
              {recentes.map(t => {
                const type = types[t.id];
                const actif = t.id === choisie;
                return (
                  <button key={t.id} onClick={() => setChoisie(t.id)} style={{
                    display: "flex", gap: 9, width: "100%", textAlign: "left", padding: "7px 8px",
                    borderRadius: 9, marginBottom: 2, cursor: "pointer", fontFamily: FONT,
                    background: actif ? "rgba(91,141,239,0.12)" : "transparent",
                    border: `1px solid ${actif ? "rgba(91,141,239,0.28)" : "transparent"}`,
                  }}>
                    <i style={{ width: 7, height: 7, borderRadius: "50%", background: COULEUR_OP[type], marginTop: 5, flexShrink: 0 }} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: "block", fontSize: 10, color: "rgba(255,255,255,0.32)" }}>
                        {dateCourte(t.executed_at)}
                      </span>
                      <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.88)" }}>
                        {LIBELLE_OP[type]} {t.ticker}
                      </span>
                      <span style={{ ...NUM, display: "block", fontSize: 10.5, color: "rgba(255,255,255,0.40)" }}>
                        {t.quantity.toLocaleString("fr-FR", { maximumFractionDigits: 6 })} × {eur(t.unit_price)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Carte>

          {/* Détail */}
          <Carte>
            <Titre>Détail de l&apos;opération</Titre>
            {detail ? (() => {
              const t = detail.tx;
              const p = cours[t.ticker];
              const valeurLigne = p != null ? t.quantity * p : null;
              const poids = valeurLigne != null && valeurTotale > 0 ? (valeurLigne / valeurTotale) * 100 : null;
              return (
                <div style={{ overflowY: "auto", minHeight: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <AssetLogo ticker={t.ticker} type={t.asset_type} size={30} radius={8}
                      fallbackBg="rgba(91,141,239,0.16)" fallbackBorder="rgba(91,141,239,0.35)"
                      fallbackTextColor="#9BB9FF" />
                    <span>
                      <span style={{ display: "block", fontFamily: FONT, fontSize: 13, fontWeight: 700, color: COULEUR_OP[detail.type] }}>
                        {LIBELLE_OP[detail.type]} {t.ticker}
                      </span>
                      <span style={{ display: "block", fontFamily: FONT, fontSize: 10.5, color: "rgba(255,255,255,0.35)" }}>
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
                      <div key={l} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "8px 10px" }}>
                        <div style={{ fontFamily: FONT, fontSize: 9.5, color: "rgba(255,255,255,0.32)", marginBottom: 3 }}>{l}</div>
                        <div style={{ ...NUM, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.92)", whiteSpace: "nowrap" }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontFamily: FONT, fontSize: 9.5, color: "rgba(255,255,255,0.32)", marginBottom: 3 }}>
                        Poids dans le portefeuille
                      </div>
                      <div style={{ ...NUM, fontSize: 12.5, fontWeight: 700, color: "rgba(255,255,255,0.92)", whiteSpace: "nowrap" }}>
                        {poids != null ? `${poids.toFixed(2)} %` : "—"}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontFamily: FONT, fontSize: 9.5, color: "rgba(255,255,255,0.32)", marginBottom: 3 }}>
                        Valeur actuelle
                      </div>
                      <div style={{ ...NUM, fontSize: 12.5, fontWeight: 700, color: "rgba(255,255,255,0.92)", whiteSpace: "nowrap" }}>
                        {valeurLigne != null ? eur(valeurLigne) : "—"}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontFamily: FONT, fontSize: 9.5, color: "rgba(255,255,255,0.32)", marginBottom: 3 }}>
                        {detail.realise ? "Résultat réalisé" : "Plus-value latente"}
                      </div>
                      <div style={{ ...NUM, fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap",
                        color: detail.gain == null ? "rgba(255,255,255,0.40)" : detail.gain >= 0 ? "#4ade80" : "#f87171" }}>
                        {detail.gain == null ? "—" : `${detail.gain >= 0 ? "+" : ""}${eur(detail.gain)}`}
                        {detail.gainPct != null && (
                          <span style={{ display: "block", opacity: 0.6, fontSize: 10.5, fontWeight: 600 }}>
                            {detail.gainPct >= 0 ? "+" : ""}{detail.gainPct.toFixed(2)} %
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 10 }}>
                    <div style={{ fontFamily: FONT, fontSize: 9.5, color: "rgba(255,255,255,0.32)", marginBottom: 4 }}>
                      Note personnelle
                    </div>
                    <div style={{ fontFamily: FONT, fontSize: 11.5, lineHeight: 1.6,
                      color: t.note ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.25)" }}>
                      {t.note || "Aucune note sur cette opération."}
                    </div>
                  </div>

                  {erreur && (
                    <div style={{ marginTop: 10, padding: "7px 10px", borderRadius: 8,
                      background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.25)",
                      fontFamily: FONT, fontSize: 10.5, color: "#fca5a5", lineHeight: 1.5 }}>
                      {erreur}
                    </div>
                  )}

                  <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    {confirme === t.id ? (
                      <>
                        <button onClick={() => setConfirme(null)} style={{
                          padding: "5px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.10)",
                          background: "transparent", color: "rgba(255,255,255,0.45)",
                          fontSize: 10.5, cursor: "pointer", fontFamily: FONT }}>Annuler</button>
                        <button onClick={() => supprimer(t.id)} disabled={suppression} style={{
                          padding: "5px 10px", borderRadius: 8, border: "1px solid rgba(248,113,113,0.35)",
                          background: "rgba(248,113,113,0.14)", color: "#f87171", fontWeight: 600,
                          fontSize: 10.5, cursor: suppression ? "default" : "pointer", fontFamily: FONT,
                          opacity: suppression ? 0.5 : 1 }}>
                          {suppression ? "Suppression…" : "Confirmer la suppression"}
                        </button>
                      </>
                    ) : (
                      <button onClick={() => { setConfirme(t.id); setErreur(null); }} style={{
                        padding: "5px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.10)",
                        background: "transparent", color: "rgba(255,255,255,0.35)",
                        fontSize: 10.5, cursor: "pointer", fontFamily: FONT }}>
                        Supprimer cette opération
                      </button>
                    )}
                  </div>
                </div>
              );
            })() : (
              <div style={{ fontFamily: FONT, fontSize: 11.5, color: "rgba(255,255,255,0.28)" }}>
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
              padding: "6px 11px", borderRadius: 9, border: "1px solid rgba(91,141,239,0.35)",
              background: "rgba(91,141,239,0.16)", color: "#9BB9FF", fontSize: 11,
              fontWeight: 600, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap",
            }}>+ Nouvelle</button>
          }>Résumé</Titre>
          <Ligne label="Nombre d'opérations" valeur={recap.operations} />
          <Ligne label="Capital investi" valeur={eur(recap.capitalInvesti, 0)} />
          <Ligne label="Gain latent"
            valeur={recap.gainLatent == null ? "—" : `${recap.gainLatent >= 0 ? "+" : ""}${eur(recap.gainLatent, 0)}`}
            couleur={recap.gainLatent == null ? undefined : recap.gainLatent >= 0 ? "#4ade80" : "#f87171"} />
          <Ligne label="Meilleure opération"
            valeur={recap.meilleure?.gain == null ? "—" : `${recap.meilleure.gain >= 0 ? "+" : ""}${eur(recap.meilleure.gain, 0)}`}
            couleur="#4ade80" />
          <Ligne label="Pire opération"
            valeur={recap.pire?.gain == null ? "—" : `${recap.pire.gain >= 0 ? "+" : ""}${eur(recap.pire.gain, 0)}`}
            couleur={recap.pire?.gain != null && recap.pire.gain >= 0 ? "#4ade80" : "#f87171"} />
          <Ligne label="Durée moyenne de détention"
            valeur={recap.dureeMoyenneJours == null ? "—" : `${recap.dureeMoyenneJours} jours`} />
        </Carte>

        {/* Dividendes — le modèle ne connaît qu'achat et vente. Un panneau à
            zéro se lirait comme « vous n'avez rien touché » ; il dit plutôt
            que la saisie n'existe pas encore. */}
        <Carte style={{ flexShrink: 0 }}>
          <Titre>Dividendes</Titre>
          <p style={{ fontFamily: FONT, fontSize: 11.5, color: "rgba(255,255,255,0.30)", margin: 0, lineHeight: 1.6 }}>
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
              <span style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: FONT, fontSize: 11.5, color: "rgba(255,255,255,0.55)" }}>
                <i style={{ width: 7, height: 7, borderRadius: "50%", background: COULEUR_OP[p.type] }} />
                {LIBELLE_OP[p.type]}
              </span>
              <span style={{ ...NUM, fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>
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
function TableauOperations({
  lignes, types, parId, choisie, onChoisir,
}: {
  lignes: Tx[];
  types: Record<number, TypeOp>;
  parId: Record<number, { gain: number | null }>;
  choisie: number | null;
  onChoisir: (id: number) => void;
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
                position: "sticky", top: 0, background: "rgba(9,27,52,0.96)",
                // Interlettrage et marges resserrés : « Résultat » réclamait
                // 60 px dans une colonne qui en offrait 52.
                textAlign: i >= 3 ? "right" : "left", padding: "6px 3px",
                fontSize: 9, fontWeight: 700, letterSpacing: "0.02em",
                color: "rgba(255,255,255,0.30)", textTransform: "uppercase",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((t: Tx) => {
            const r = parId[t.id];
            return (
              <tr key={t.id} onClick={() => onChoisir(t.id)} style={{
                cursor: "pointer",
                background: t.id === choisie ? "rgba(91,141,239,0.10)" : "transparent",
                borderTop: "1px solid rgba(255,255,255,0.05)",
              }}>
                <td style={{ padding: "7px 6px", fontSize: 10.5, color: "rgba(255,255,255,0.55)", whiteSpace: "nowrap" }}>
                  {new Date(t.executed_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                </td>
                <td style={{ padding: "7px 6px", fontSize: 10.5 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: COULEUR_OP[types[t.id]],
                                 overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                    <i style={{ width: 6, height: 6, borderRadius: "50%", background: COULEUR_OP[types[t.id]], flexShrink: 0 }} />
                    {LIBELLE_OP[types[t.id]]}
                  </span>
                </td>
                <td style={{ padding: "7px 6px", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.88)",
                             overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.ticker}</td>
                <td style={{ ...NUM, padding: "7px 6px", textAlign: "right", fontSize: 10.5, whiteSpace: "nowrap", color: "rgba(255,255,255,0.60)" }}>
                  {t.side === "SELL" ? "−" : "+"}{t.quantity.toLocaleString("fr-FR", { maximumFractionDigits: 6 })}
                </td>
                <td style={{ ...NUM, padding: "7px 6px", textAlign: "right", fontSize: 10.5, whiteSpace: "nowrap", color: "rgba(255,255,255,0.75)" }}>{eur(montant(t))}</td>
                <td style={{ ...NUM, padding: "7px 6px", textAlign: "right", fontSize: 10.5, whiteSpace: "nowrap", fontWeight: 600,
                  color: r?.gain == null ? "rgba(255,255,255,0.25)" : r.gain >= 0 ? "#4ade80" : "#f87171" }}>
                  {r?.gain == null ? "—" : `${r.gain >= 0 ? "+" : ""}${Math.round(r.gain).toLocaleString("fr-FR")} €`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
  );
}
