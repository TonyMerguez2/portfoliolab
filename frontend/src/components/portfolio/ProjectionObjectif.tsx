"use client";
import type { Projection } from "@/hooks/useProjection";
import {
  anneeDuMois, bande, bornes, chemin, echelles, graduations, montantCourt,
} from "@/lib/courbeProjection";
import { echeanceEnClair, euros, type Objectif } from "@/lib/objectifs";
import { CLAIR, JETONS, RAYONS } from "@/lib/palette";
import { FONT, NUM } from "@/lib/typography";

/**
 * La projection d'un objectif : enveloppes, intervalle, probabilité.
 *
 * ⚠️ **Trois courbes, mais pas trois scénarios.** La maquette les nomme « optimiste »,
 * « neutre », « pessimiste », ce qui laisse croire à trois avenirs dont un se réalisera.
 * Ce sont les 5ᵉ, 50ᵉ et 95ᵉ centiles des tirages à chaque mois : aucune n'est une
 * trajectoire qu'un portefeuille suivrait. La légende les nomme donc pour ce qu'elles
 * sont, et la bande grisée — la représentation honnête d'un intervalle — est dessinée
 * derrière.
 *
 * ⚠️ **Le panneau dit ce qu'il ne peut pas calculer.** Sans échéance, sans rendement
 * attendu, sans valorisation, sans volatilité mesurable : quatre silences distincts, avec
 * chacun sa cause et son remède. Une courbe absente sans explication se lit comme une
 * panne.
 */

const CADRE = { largeur: 620, hauteur: 240,
  marge: { haut: 14, bas: 26, gauche: 52, droite: 12 } };

const COURBES: { centile: string; libelle: string; couleur: string; tirets?: string }[] = [
  { centile: "95", libelle: "95ᵉ centile", couleur: JETONS.positif, tirets: "5 4" },
  { centile: "50", libelle: "Médiane", couleur: JETONS.accent },
  { centile: "5", libelle: "5ᵉ centile", couleur: JETONS.negatif, tirets: "5 4" },
];

function Mesure({ titre, valeur, note }: { titre: string; valeur: string; note?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span style={{ fontFamily: FONT, fontSize: 9.5, color: CLAIR.texteFaible }}>{titre}</span>
      <span style={{ ...NUM, fontSize: 15, fontWeight: 700, color: CLAIR.texte }}>{valeur}</span>
      {note && <span style={{ fontFamily: FONT, fontSize: 9, color: CLAIR.texteFaible,
        lineHeight: 1.4 }}>{note}</span>}
    </div>
  );
}

function Anneau({ part, couleur }: { part: number; couleur: string }) {
  const r = 26, c = 2 * Math.PI * r;
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" aria-hidden="true">
      <circle cx="34" cy="34" r={r} fill="none" stroke={CLAIR.carteCreuse} strokeWidth="6" />
      <circle cx="34" cy="34" r={r} fill="none" stroke={couleur} strokeWidth="6"
        strokeLinecap="round" strokeDasharray={`${(part / 100) * c} ${c}`}
        transform="rotate(-90 34 34)" />
      <text x="34" y="38" textAnchor="middle"
        style={{ ...NUM, fontSize: 15, fontWeight: 700, fill: CLAIR.texte }}>
        {Math.round(part)} %
      </text>
    </svg>
  );
}

/** Le motif de refus, dit en clair et avec son remède. */
function Silence({ raison }: { raison: string }) {
  const textes: Record<string, string> = {
    valeur_inconnue: "La valeur du portefeuille n’a pas pu être établie : les cours sont "
      + "indisponibles pour l’instant. Sans elle, aucun point de départ à projeter.",
    sans_echeance: "Cet objectif n’a pas d’échéance. Ajoutez une année cible — ou une "
      + "année de naissance, pour un objectif exprimé en âge — pour obtenir une projection.",
    sans_rendement_attendu: "Aucun rendement attendu n’est renseigné. C’est une hypothèse "
      + "qui vous appartient : le logiciel n’en choisit pas à votre place, faute de quoi "
      + "la projection passerait pour une prévision.",
  };
  return (
    <p style={{ margin: 0, fontFamily: FONT, fontSize: 11, lineHeight: 1.6,
      color: CLAIR.texteSecondaire, maxWidth: 460 }}>
      {textes[raison] ?? "Projection indisponible."}
    </p>
  );
}

export default function ProjectionObjectif({
  objectifs, choisi, onChoisir, projection, etat, onParametres,
}: {
  objectifs: Objectif[];
  choisi: string | null;
  onChoisir: (id: string) => void;
  projection: Projection | null;
  etat: "charge" | "pret" | "erreur";
  onParametres?: (o: Objectif) => void;
}) {
  const o = objectifs.find(x => x.id === choisi) ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: CLAIR.texte }}>
          Projection de l’objectif
        </span>
        {/* Le choix de l'objectif projeté. Une liste et non un onglet : cinq objectifs
            tiennent dans un menu, pas dans une rangée d'onglets. */}
        {objectifs.length > 0 && (
          <select value={choisi ?? ""} onChange={e => onChoisir(e.target.value)}
            style={{
              fontFamily: FONT, fontSize: 11, fontWeight: 600, padding: "4px 8px",
              borderRadius: RAYONS.xs, border: `1px solid ${CLAIR.bord}`,
              background: CLAIR.carteCreuse, color: CLAIR.accent, cursor: "pointer",
            }}>
            {objectifs.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}
          </select>
        )}
        {o && onParametres && (
          <button type="button" onClick={() => onParametres(o)}
            style={{
              marginLeft: "auto", padding: "4px 10px", borderRadius: RAYONS.xs,
              cursor: "pointer", border: `1px solid ${CLAIR.bord}`,
              background: "transparent", color: CLAIR.texteSecondaire,
              fontFamily: FONT, fontSize: 10.5, fontWeight: 600,
            }}>
            Modifier les paramètres
          </button>
        )}
      </div>

      {objectifs.length === 0 && (
        <p style={{ margin: 0, fontFamily: FONT, fontSize: 11, color: CLAIR.texteFaible }}>
          Créez un objectif pour voir une projection.
        </p>
      )}
      {etat === "charge" && (
        <p style={{ margin: 0, fontFamily: FONT, fontSize: 11, color: CLAIR.texteFaible }}>
          Mesure de la volatilité et tirages…
        </p>
      )}
      {etat === "erreur" && (
        <p style={{ margin: 0, fontFamily: FONT, fontSize: 11, color: CLAIR.texteFaible }}>
          Projection indisponible pour le moment.
        </p>
      )}

      {etat === "pret" && projection && !projection.possible && (
        <Silence raison={projection.raison} />
      )}

      {etat === "pret" && projection?.possible && (() => {
        const p = projection;
        const toutes = Object.values(p.enveloppes).flat().concat(p.requis ?? []);
        const { bas, haut } = bornes(toutes);
        const { x, y } = echelles(p.mois, bas, haut, CADRE);
        const ans = Math.round((p.objectif.mois_restants ?? 0) / 12);
        const sansDispersion = p.volatilite == null;

        return (
          <div style={{ display: "flex", gap: 16, minHeight: 0, flexWrap: "wrap" }}>
            {/* ── Colonne des mesures ──────────────────────────────────────── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 176 }}>
              <Mesure titre={`Valeur médiane dans ${ans} an${ans > 1 ? "s" : ""}`}
                valeur={p.mediane != null ? euros(p.mediane) : "—"}
                note={p.objectif.projetee_en_euros_constants != null
                  ? `soit ${euros(p.objectif.projetee_en_euros_constants)} d’aujourd’hui`
                  : undefined} />

              {/* ⚠️ « 90 % » et non 95 : c'est ce que les centiles 5 et 95 délimitent. La
                  maquette annonçait 95 % au-dessus de bornes qui n'en couvrent que 90. */}
              {p.intervalle && (
                <Mesure titre={`Intervalle ${p.niveau_intervalle} %`}
                  valeur={`${montantCourt(p.intervalle[0])} – ${montantCourt(p.intervalle[1])}`}
                  note="d’après les tirages du modèle" />
              )}

              {p.probabilite != null && (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Anneau part={p.probabilite}
                    couleur={p.probabilite >= 66 ? JETONS.positif
                      : p.probabilite >= 33 ? JETONS.attention : JETONS.negatif} />
                  <span style={{ fontFamily: FONT, fontSize: 9.5, color: CLAIR.texteFaible,
                    lineHeight: 1.45 }}>
                    des tirages atteignent {p.requis != null ? euros(p.requis) : "la cible"}
                  </span>
                </div>
              )}

              {/* ⚠️ La provenance de la volatilité, jamais tue : c'est elle qui décide si
                  l'intervalle et la probabilité existent. */}
              <span style={{ fontFamily: FONT, fontSize: 9, lineHeight: 1.5,
                color: sansDispersion ? JETONS.attention : CLAIR.texteFaible }}>
                {p.volatilite_source === "mesuree"
                  ? `Volatilité mesurée sur votre portefeuille : ${p.volatilite} % par an, `
                    + `sur ${p.seances_mesurees} séances.`
                  : p.volatilite_source === "echantillon_court"
                    ? `Historique trop court pour mesurer la volatilité `
                      + `(${p.seances_mesurees} séances, ${p.seances_minimales} requises) : `
                      + `ni intervalle ni probabilité.`
                    : "Volatilité non mesurable : ni intervalle ni probabilité."}
              </span>
            </div>

            {/* ── La courbe ────────────────────────────────────────────────── */}
            <div style={{ flex: 1, minWidth: 300 }}>
              <svg viewBox={`0 0 ${CADRE.largeur} ${CADRE.hauteur}`}
                style={{ width: "100%", height: "auto", display: "block" }}
                role="img"
                aria-label={`Projection de ${p.objectif.nom} sur ${ans} ans`}>
                {graduations(bas, haut).map(v => (
                  <g key={v}>
                    <line x1={CADRE.marge.gauche} x2={CADRE.largeur - CADRE.marge.droite}
                      y1={y(v)} y2={y(v)} stroke={CLAIR.bord} strokeWidth="1" />
                    <text x={CADRE.marge.gauche - 6} y={y(v) + 3} textAnchor="end"
                      style={{ ...NUM, fontSize: 8.5, fill: CLAIR.texteFaible }}>
                      {montantCourt(v)}
                    </text>
                  </g>
                ))}

                {/* La bande de l'intervalle : une zone, là où trois traits laisseraient
                    croire à trois trajectoires. */}
                {!sansDispersion && (
                  <path d={bande(p.mois, p.enveloppes["5"], p.enveloppes["95"], x, y)}
                    fill={JETONS.accent} opacity={0.09} />
                )}

                {/* La cible : une ligne horizontale, pointillée pour ne pas être prise
                    pour une trajectoire. */}
                {p.requis != null && p.requis <= haut && (
                  <line x1={CADRE.marge.gauche} x2={CADRE.largeur - CADRE.marge.droite}
                    y1={y(p.requis)} y2={y(p.requis)} stroke={CLAIR.texteSecondaire}
                    strokeWidth="1.2" strokeDasharray="3 3" />
                )}

                {COURBES.filter(c => !sansDispersion || c.centile === "50").map(c => (
                  <path key={c.centile}
                    d={chemin(p.mois, p.enveloppes[c.centile], x, y)}
                    fill="none" stroke={c.couleur} strokeWidth="1.8"
                    strokeDasharray={c.tirets} strokeLinejoin="round" />
                ))}

                {[p.mois[0], p.mois[Math.floor(p.mois.length / 2)],
                  p.mois[p.mois.length - 1]].map((m, i) => (
                  <text key={i} x={x(m)} y={CADRE.hauteur - 8}
                    textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
                    style={{ ...NUM, fontSize: 8.5, fill: CLAIR.texteFaible }}>
                    {anneeDuMois(m)}
                  </text>
                ))}
              </svg>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
                {COURBES.filter(c => !sansDispersion || c.centile === "50").map(c => (
                  <span key={c.centile} style={{ display: "inline-flex", alignItems: "center",
                    gap: 5, fontFamily: FONT, fontSize: 9.5, color: CLAIR.texteFaible }}>
                    <span style={{ width: 12, height: 2, background: c.couleur }} />
                    {c.libelle}
                    {p.taux_implicites[c.centile] != null && (
                      <span style={{ ...NUM }}> ({p.taux_implicites[c.centile]} %/an)</span>
                    )}
                  </span>
                ))}
                {p.requis != null && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5,
                    fontFamily: FONT, fontSize: 9.5, color: CLAIR.texteFaible }}>
                    <span style={{ width: 12, height: 0, borderTop:
                      `1.2px dashed ${CLAIR.texteSecondaire}` }} />
                    Objectif
                  </span>
                )}
              </div>

              {/* ⚠️ L'aveu du modèle, sous la courbe et non dans une aide masquée. Les
                  tirages supposent des rendements mensuels indépendants et log-normaux :
                  les marchés réels ont des queues plus épaisses, donc les extrêmes sont
                  sous-estimés. Sans cette phrase, trois courbes lisses passent pour une
                  prévision. */}
              <p style={{ margin: "8px 0 0", fontFamily: FONT, fontSize: 9,
                lineHeight: 1.5, color: CLAIR.texteFaible }}>
                Ces courbes sont des centiles de {" "}
                <span style={{ ...NUM }}>2 000</span> tirages, pas trois scénarios : aucune
                n’est une trajectoire que le portefeuille suivrait. Le modèle suppose des
                rendements mensuels indépendants et log-normaux, ce qui sous-estime les
                situations extrêmes.
                {echeanceEnClair(p.objectif.mois_restants)
                  && ` Échéance ${echeanceEnClair(p.objectif.mois_restants)}.`}
              </p>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
