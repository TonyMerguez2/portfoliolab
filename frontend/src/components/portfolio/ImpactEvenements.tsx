"use client";
import { useMemo } from "react";

import type { AnalyseEvenements, EtatChargement, Impact } from "@/hooks/useAnalyseEvenements";

import AssetLogo from "@/components/AssetLogo";
import { CLAIR, JETONS, RAYONS } from "@/lib/palette";
import { FONT, NUM } from "@/lib/typography";

/**
 * Ce que les publications passées disent de la prochaine, et ce qu'elles ont fait.
 *
 * Deux panneaux nourris du même appel : l'impact attendu d'une échéance à venir,
 * et l'historique de celles déjà vécues. Ils partagent le calcul parce qu'ils
 * partagent la mesure — la réaction du cours à la première séance qui suit la
 * publication.
 *
 * ⚠️ **Rien n'est extrapolé.** L'impact annoncé est une statistique de ce qui
 * s'est produit, pas une prévision : la moyenne des variations absolues des douze
 * derniers trimestres et la part d'entre elles qui a dépassé deux pour cent. Sous
 * quatre trimestres, le serveur ne rend aucune statistique plutôt qu'une moyenne
 * sur deux points, et ces panneaux se taisent alors.
 *
 * ⚠️ **La surprise et la réaction sont deux choses.** Mesuré sur TSLA : au premier
 * trimestre 2026, la société a battu le consensus de dix-sept pour cent et le
 * titre a *baissé* de trois et demi. C'est pourquoi les deux colonnes sont
 * affichées côte à côte au lieu que l'une résume l'autre.
 */

/**
 * Le mot qui qualifie un impact, tiré de la **probabilité** et non de l'amplitude.
 *
 * ⚠️ Choisi ainsi parce qu'il est vérifiable : « deux chances sur trois que le
 * titre bouge de plus de deux pour cent » se comprend et se recompte. Un seuil
 * posé sur l'amplitude moyenne aurait demandé de décider qu'un mouvement de trois
 * pour cent est « élevé » et de deux « moyen » — un arbitrage qu'aucune donnée ne
 * soutient.
 */
export function qualifierImpact(p: number): { mot: string; teinte: string } {
  if (p >= 66) return { mot: "Élevé", teinte: JETONS.negatif };
  if (p >= 33) return { mot: "Moyen", teinte: JETONS.attention };
  return { mot: "Faible", teinte: JETONS.positif };
}

const pct = (v: number, signe = true) =>
  `${signe && v > 0 ? "+" : ""}${v.toFixed(2)} %`;

const dateCourte = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("fr-FR",
    { day: "numeric", month: "short", year: "numeric" });

/** Une mesure encadrée, comme les trois de la maquette. */
function Mesure({ titre, valeur, note }: { titre: string; valeur: string; note: string }) {
  return (
    <div style={{
      flex: 1, minWidth: 0, padding: "9px 10px", borderRadius: RAYONS.sm,
      background: CLAIR.carteCreuse, border: `1px solid ${CLAIR.bord}`, textAlign: "center",
    }}>
      <div style={{ fontFamily: FONT, fontSize: 9.5, color: CLAIR.texteFaible }}>{titre}</div>
      {/* ⚠️ `nowrap`, faute de quoi « ±4,84 % » se coupe entre le nombre et son
          unité dans une case de cent pixels : le pourcentage passe seul à la ligne
          et la mesure se lit sur deux étages. Vu sur le panneau réel. */}
      <div style={{ ...NUM, fontSize: 15, fontWeight: 700, color: CLAIR.texte,
        margin: "2px 0 1px", whiteSpace: "nowrap" }}>
        {valeur}
      </div>
      <div style={{ fontFamily: FONT, fontSize: 9, color: CLAIR.texteFaible }}>{note}</div>
    </div>
  );
}

export function ImpactPotentiel({
  donnees, etat, ticker, detail, etatDetail, onEffacer,
}: {
  donnees: AnalyseEvenements | null;
  etat: EtatChargement;
  /** Le titre à détailler. Par défaut, celui dont l'impact attendu est le plus fort. */
  ticker?: string | null;
  /**
   * L'impact d'un titre demandé à la demande, quand il n'est pas dans l'analyse
   * d'ensemble.
   *
   * ⚠️ Nécessaire pour les titres vus par transparence : l'analyse ne couvre que
   * les lignes détenues en direct, et sur un portefeuille d'ETF ce sont justement
   * celles qui ne publient rien. Sans ce détail, sélectionner NVIDIA n'aurait rien
   * montré alors que c'est la société qui expose le plus ce portefeuille.
   */
  detail?: (Impact & { ticker: string }) | null;
  etatDetail?: EtatChargement;
  /**
   * Relâche la sélection.
   *
   * Sans lui la pastille qui l'annonce n'est pas montrée : un « × » qui ne rend
   * rien serait pire que pas de pastille du tout.
   */
  onEffacer?: () => void;
}) {
  /**
   * À défaut de sélection, le titre le plus réactif.
   *
   * ⚠️ Le plus réactif, et non le premier venu : ce panneau sert à prévenir, donc
   * il doit montrer la ligne qui peut le plus secouer le portefeuille. L'ordre
   * alphabétique y aurait mis Apple devant Nvidia sans autre raison que la lettre.
   */
  const choisi = useMemo(() => {
    if (ticker) return ticker;
    const im = donnees?.impacts ?? {};
    return Object.keys(im).sort(
      (a, b) => (im[b].impact_moyen * im[b].exposition) - (im[a].impact_moyen * im[a].exposition),
    )[0];
  }, [donnees, ticker]);

  /**
   * Les chiffres à montrer : le détail demandé d'abord, l'analyse d'ensemble sinon.
   *
   * ⚠️ Le repli se fait sur `choisi`, qui **vaut** `ticker` dès qu'une sélection est
   * active. Ce n'est donc jamais un autre titre qui s'affiche sous le nom demandé —
   * seulement, le cas échéant, la même statistique venue de l'autre route. Écrit
   * ainsi plutôt qu'avec un test sur `ticker` parce que la version à deux branches
   * disait la même chose de façon illisible.
   */
  const im = (ticker ? detail : undefined)
    ?? (choisi ? donnees?.impacts[choisi] : undefined);

  // Un état de chargement propre à la sélection : sans lui, changer de titre
  // laisserait les chiffres du précédent à l'écran le temps de la requête.
  const enCours = etat === "charge" || (!!ticker && etatDetail === "charge");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: CLAIR.texte }}>
          Impact potentiel sur votre portefeuille
        </span>

        {/* ⚠️ Sans cette pastille, le panneau montre le même titre qu'on l'ait
            choisi ou non : par défaut il affiche le plus réactif, qui est souvent
            celui qu'on vient de cliquer. Rien ne dirait alors qu'une sélection est
            active, ni comment revenir à la vue d'ensemble. */}
        {ticker && onEffacer && (
          <button type="button" onClick={onEffacer} title="Revenir à la vue d’ensemble"
            style={{
              display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer",
              flexShrink: 0, padding: "3px 8px", borderRadius: RAYONS.plein,
              border: `1px solid ${JETONS.accent}`, background: JETONS.accentVoile,
              color: CLAIR.accent, fontFamily: FONT, fontSize: 10, fontWeight: 700,
            }}>
            {ticker}
            <span aria-hidden="true" style={{ fontSize: 12, lineHeight: 1 }}>×</span>
          </button>
        )}
      </div>

      {enCours && (
        <p style={{ margin: 0, fontFamily: FONT, fontSize: 11, color: CLAIR.texteFaible }}>
          Calcul{ticker ? ` pour ${ticker}` : ""}…
        </p>
      )}
      {(etat === "erreur" || etatDetail === "erreur") && !enCours && (
        <p style={{ margin: 0, fontFamily: FONT, fontSize: 11, color: CLAIR.texteFaible }}>
          Analyse indisponible pour le moment.
        </p>
      )}

      {/* ⚠️ Le silence est motivé. Sous quatre trimestres publiés, le serveur ne
          rend aucune statistique — et un panneau qui n'explique pas son vide se lit
          comme une panne. */}
      {!enCours && etat !== "erreur" && etatDetail !== "erreur" && !im && (
        <p style={{ margin: 0, fontFamily: FONT, fontSize: 11, color: CLAIR.texteFaible, lineHeight: 1.6 }}>
          {ticker
            ? `${ticker} : pas assez de publications passées pour en tirer une statistique, ou ce titre n’expose pas ce portefeuille.`
            : "Aucune publication passée assez nombreuse pour en tirer une statistique."}
          {donnees && donnees.sans_donnees.length > 0 && (
            <> {donnees.sans_donnees.join(", ")} ne publie
              {donnees.sans_donnees.length > 1 ? "nt" : ""} pas de résultats.</>
          )}
        </p>
      )}

      {!enCours && im && choisi && (() => {
        const q = qualifierImpact(im.probabilite);
        return (
          <div style={{
            padding: 12, borderRadius: RAYONS.sm,
            background: CLAIR.carteCreuse, border: `1px solid ${CLAIR.bord}`,
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <AssetLogo ticker={choisi} size={30} radius={8}
                fallbackBg={CLAIR.carte} fallbackBorder={CLAIR.bord}
                fallbackTextColor={CLAIR.texteSecondaire} bare />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: CLAIR.texte }}>
                  {choisi}
                </div>
                {/* Dire *pourquoi* ce titre-là. À défaut de sélection, le panneau
                    montre le plus réactif : sans le mentionner, le lecteur croit
                    voir la prochaine publication du calendrier, qui n'est pas
                    forcément celle-ci. */}
                <div style={{ fontFamily: FONT, fontSize: 10, color: CLAIR.texteFaible }}>
                  {ticker
                    ? "Prochaine publication de résultats"
                    : "Le titre le plus réactif du portefeuille"}
                </div>
              </div>
              <span style={{
                fontFamily: FONT, fontSize: 10, fontWeight: 700, color: q.teinte,
                background: q.teinte + "1E", borderRadius: RAYONS.xs, padding: "3px 8px",
              }}>
                {q.mot}
              </span>
            </div>

            <p style={{ margin: 0, fontFamily: FONT, fontSize: 11, color: CLAIR.texteSecondaire, lineHeight: 1.55 }}>
              Sur les <span style={{ ...NUM }}>{im.echantillon}</span> derniers trimestres,
              le titre a bougé de <span style={{ ...NUM }}>±{im.impact_moyen.toFixed(2)} %</span>
              {" "}à la séance qui a suivi la publication.
            </p>

            <div style={{ display: "flex", gap: 7 }}>
              <Mesure titre="Exposition" valeur={pct(im.exposition, false)} note="du portefeuille" />
              <Mesure titre="Impact moyen" valeur={`±${im.impact_moyen.toFixed(2)} %`} note="sur le titre" />
              <Mesure titre="Probabilité"
                valeur={`${im.probabilite.toFixed(0)} %`}
                note={`de dépasser ${im.seuil.toFixed(0)} %`} />
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export function HistoriqueEvenements({
  donnees, etat, limite = 8,
}: {
  donnees: AnalyseEvenements | null;
  etat: EtatChargement;
  limite?: number;
}) {
  const lignes = (donnees?.passes ?? []).slice(0, limite);

  const cellule = { padding: "7px 8px", fontFamily: FONT, fontSize: 10.5 } as const;
  const entete = {
    ...cellule, fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
    color: CLAIR.texteFaible, textTransform: "uppercase" as const,
    borderBottom: `1px solid ${CLAIR.bord}`, textAlign: "left" as const,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0, flex: 1 }}>
      <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: CLAIR.texte }}>
        Historique des événements
      </span>

      {etat === "charge" && (
        <p style={{ margin: 0, fontFamily: FONT, fontSize: 11, color: CLAIR.texteFaible }}>Calcul…</p>
      )}
      {etat === "erreur" && (
        <p style={{ margin: 0, fontFamily: FONT, fontSize: 11, color: CLAIR.texteFaible }}>
          Historique indisponible pour le moment.
        </p>
      )}
      {etat === "pret" && lignes.length === 0 && (
        <p style={{ margin: 0, fontFamily: FONT, fontSize: 11, color: CLAIR.texteFaible, lineHeight: 1.6 }}>
          Aucune publication passée sur ces lignes.
          {donnees && donnees.sans_donnees.length > 0 && (
            <> {donnees.sans_donnees.join(", ")} ne publie
              {donnees.sans_donnees.length > 1 ? "nt" : ""} pas de résultats — c&apos;est
              le cas des ETF et des cryptomonnaies.</>
          )}
        </p>
      )}

      {etat === "pret" && lignes.length > 0 && (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={entete}>Date</th>
                <th style={entete}>Événement</th>
                <th style={{ ...entete, textAlign: "right" }}>Surprise</th>
                <th style={{ ...entete, textAlign: "right" }}>Sur le titre</th>
                <th style={{ ...entete, textAlign: "right" }}>Sur le portefeuille</th>
                <th style={entete}>Résultat</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map(l => (
                <tr key={`${l.ticker}:${l.date}`} style={{ borderBottom: `1px solid ${CLAIR.bord}` }}>
                  <td style={{ ...cellule, ...NUM, color: CLAIR.texteSecondaire, whiteSpace: "nowrap" }}>
                    {dateCourte(l.date)}
                  </td>
                  <td style={{ ...cellule, color: CLAIR.texte, whiteSpace: "nowrap" }}>
                    <strong>{l.ticker}</strong>
                    <span style={{ color: CLAIR.texteFaible }}> · {l.libelle}</span>
                  </td>
                  {/* La surprise et la réaction restent deux colonnes distinctes :
                      elles ne vont pas dans le même sens aussi souvent qu'on croit. */}
                  <td style={{ ...cellule, ...NUM, textAlign: "right", whiteSpace: "nowrap",
                    color: l.surprise == null ? CLAIR.texteFaible
                      : l.surprise > 0 ? JETONS.positif : JETONS.negatif }}>
                    {l.surprise == null ? "—" : pct(l.surprise)}
                  </td>
                  <td style={{ ...cellule, ...NUM, textAlign: "right", whiteSpace: "nowrap",
                    color: l.variation == null ? CLAIR.texteFaible
                      : l.variation > 0 ? JETONS.positif : JETONS.negatif }}>
                    {l.variation == null ? "—" : pct(l.variation)}
                  </td>
                  <td style={{ ...cellule, ...NUM, textAlign: "right", whiteSpace: "nowrap", fontWeight: 700,
                    color: l.impact_portefeuille == null ? CLAIR.texteFaible
                      : l.impact_portefeuille > 0 ? JETONS.positif : JETONS.negatif }}>
                    {l.impact_portefeuille == null ? "—" : pct(l.impact_portefeuille)}
                  </td>
                  <td style={{ ...cellule, color: CLAIR.texteSecondaire, whiteSpace: "nowrap" }}>
                    {l.resultat}
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
