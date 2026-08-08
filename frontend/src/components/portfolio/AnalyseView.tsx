"use client";
import { useMemo, useState } from "react";
import RadarChart from "@/components/charts/RadarChart";
import { FONT, NUM } from "@/lib/typography";
import { donutArcs } from "@/lib/donut";
import {
  BANDES as SEUILS_BANDES, EXPLICATION_FACTEUR,
  LIBELLE_FACTEUR, ORDRE, type Analyse, type EtatAnalyse, type Observation,
  type Part, type Projection, type Trajet,
} from "@/lib/analyse";
import Cadre from "@/components/ui/Cadre";
import { JETONS } from "@/lib/palette";


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

/**
 * Intitulés du radar, abrégés.
 *
 * « Diversification » posé autour d'un cercle de 168 px chevauche ses voisins ;
 * la liste à côté donne le nom entier.
 *
 * ⚠️ Seuls les facteurs **notants** ont un abrégé, parce que seuls eux figurent
 * sur le radar — il représente la note. Les indicatifs vivent dans la liste, avec
 * leur nom entier et la mention qui va avec.
 *
 * Le radar porte sept branches. « Devise » et « Marché » ont été retirés avec leurs
 * facteurs — la première lisait la place de cotation et non l'exposition, le second
 * avait un bêta biaisé vers zéro pour toute ligne cotée hors de New York.
 *
 * « Diversification » y est abrégé en « Secteurs » depuis que la géographie est un
 * facteur séparé : les deux branches voisines devaient se distinguer d'un coup
 * d'œil, et « Diversif. » ne disait plus laquelle des deux on lisait.
 */
const ABREGE: Record<string, string> = {
  diversification:    "Secteurs",
  geographie:         "Géographie",
  concentration:      "Concentr.",
  frais:              "Frais fonds",
  frais_courtage:     "Courtage",
  redondance:         "Redond.",
  volatilite:         "Volatilité",
};


/**
 * Les cinq bandes du score.
 *
 * Elles servent d'encre — sur le chiffre, sur la pastille de légende — donc
 * elles se prennent au cran `fort`, seul cran garanti au-dessus de 4,5:1 dans
 * les deux thèmes. « Faible » était un orange Tailwind (#fb923c) sans rapport
 * avec la rampe ; les deux premières bandes partageaient la même valeur, ce
 * qui rendait « Très bon » et « Bon » indiscernables.
 */
/**
 * ⚠️ Les seuils et les noms viennent de `lib/analyse.ts`, cette liste n'y ajoute
 * que l'encre. Ils étaient écrits en dur ici : c'était la deuxième des **trois**
 * copies divergentes que portait l'application, et une divergence colorait un
 * « Bon » du vert de « Très bon » sans changer le mot — un désaccord discret entre
 * la couleur et le texte, que rien n'aurait signalé.
 *
 * L'ordre des couleurs suit celui des bandes, de la meilleure à la pire.
 */
const BANDES = SEUILS_BANDES.map((b, i) => ({
  ...b,
  couleur: [JETONS.positifFort, JETONS.positif, JETONS.attentionFort,
            JETONS.attentionIntense, JETONS.negatifFort][i],
}));

const couleurScore = (s: number | null) =>
  s == null ? "rgba(var(--nv-encre-rvb), 0.30)" : (BANDES.find(b => s >= b.min) ?? BANDES[4]).couleur;

/**
 * Le ton d'une observation, en fond et en encre.
 *
 * Trois de ces quatre couleurs étaient des hexadécimaux relevés sur le thème
 * sombre : la pastille gardait donc son vert vif et son glyphe sombre en thème
 * clair, où le glyphe disparaissait. Le motif de l'échelle règle les deux d'un
 * coup — un fond `voile` et une encre `fort`, qui se retournent ensemble.
 */
const TON: Record<string, { fond: string; encre: string; signe: string }> = {
  alerte:    { fond: JETONS.negatifVoile,    encre: JETONS.negatifFort,    signe: "!" },
  attention: { fond: JETONS.attentionVoile,  encre: JETONS.attentionFort,  signe: "!" },
  favorable: { fond: JETONS.positifVoile,    encre: JETONS.positifFort,    signe: "✓" },
  info:      { fond: JETONS.accentVoile,     encre: JETONS.accentFort,     signe: "i" },
};

/**
 * Le drapeau d'une zone d'exposition, quand il en existe un.
 *
 * La table est incomplète à dessein. « Asie-Pacifique », « Marchés émergents »
 * et « Monde développé » sont des agrégats de pays : aucun pavillon ne les
 * représente, et leur prêter celui du pays dominant laisserait lire une
 * exposition qui n'est pas celle des chiffres. Ces lignes n'ont donc pas de
 * drapeau, et c'est la bonne réponse.
 */
const DRAPEAU_ZONE: Record<string, string> = {
  "États-Unis": "us",
  "Europe": "eu",
  "Zone euro": "eu",
  "France": "fr",
  "Japon": "jp",
  "Chine": "cn",
  "Inde": "in",
};

const COULEURS_PART = ["#50A2FF", "#a78bfa", "#FF8904", "#00D492", JETONS.negatif, "#22d3ee", "#94a3b8"];

function Carte({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <Cadre style={{ padding: "14px 18px", display: "flex", flexDirection: "column", minHeight: 0, ...style }}>
      {children}
    </Cadre>
  );
}

function Titre({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                  marginBottom: 12, flexShrink: 0 }}>
      <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: "rgba(var(--nv-encre-rvb), 0.88)" }}>
        {children}
      </span>
      {action}
    </div>
  );
}

/**
 * L'onglet Analyse.
 *
 * ⚠️ L'analyse arrive en propriété et n'est plus chargée ici. Elle alimente
 * aussi le score du bandeau : la charger deux fois aurait doublé les appels à une
 * route qui télécharge un an d'historique et les fiches sectorielles, et surtout
 * rien n'aurait garanti que les deux réponses concordent.
 */
export default function AnalyseView({ analyse: a, etat }: { analyse: Analyse | null; etat: EtatAnalyse }) {
  // ⚠️ « devises » a été retiré des onglets. La ventilation venait de la devise de
  // **cotation** : elle annonçait « EUR 100 % » pour un portefeuille de trackers
  // S&P 500 cotés à Paris, dont l'exposition au dollar est totale. C'était faux, et
  // aucune donnée disponible ne permet de la corriger — les poids par devise des
  // sous-jacents ne sont pas publiés.
  const [ongletExpo, setOngletExpo] = useState<"secteurs" | "zones" | "classes">("secteurs");

  /**
   * Le radar ne porte que les facteurs qui **notent**.
   *
   * ⚠️ Il représente visuellement la note : y placer un facteur indicatif — la
   * perte maximale, hors du score — laisserait croire qu'il y pèse. Elle reste dans
   * la liste en dessous, marquée comme telle.
   */
  const facteursRadar = useMemo(
    () => ORDRE
      .filter(k => a?.facteurs?.[k]?.score != null
                && a!.facteurs[k].compte !== false
                // Un facteur notant sans abrégé n'a pas sa place sur le radar :
                // il s'y afficherait sans étiquette.
                && ABREGE[k] != null)
      .map(k => ({ label: ABREGE[k], value: a!.facteurs[k].score! })),
    [a]);

  if (etat === "charge") {
    return <div style={{ padding: 40, textAlign: "center", fontFamily: FONT, fontSize: 12,
                         color: "rgba(var(--nv-encre-rvb), 0.30)" }}>Analyse en cours…</div>;
  }
  if (etat === "vide" || !a) {
    return (
      <div style={{ padding: `8px ${MARGE}px 0`, height: "100%" }}>
        <Carte style={{ alignItems: "center", justifyContent: "center", padding: 48 }}>
          <p style={{ fontFamily: FONT, fontSize: 13, color: "rgba(var(--nv-encre-rvb), 0.55)", margin: "0 0 6px" }}>
            Rien à analyser pour l&apos;instant
          </p>
          <p style={{ fontFamily: FONT, fontSize: 11.5, color: "rgba(var(--nv-encre-rvb), 0.30)",
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
                                            color: actif ? "rgba(var(--nv-encre-rvb), 0.88)" : "rgba(var(--nv-encre-rvb), 0.38)",
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
                      color: "rgba(var(--nv-encre-rvb), 0.28)", lineHeight: 1.45, flexShrink: 0 }}>
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
                /**
                 * ⚠️ Un facteur **indicatif** ne montre pas de tiret à la place de
                 * sa note.
                 *
                 * La perte maximale est le seul de cette sorte, et elle n'a plus de
                 * score : rendue « — » comme les autres, elle se lisait « non
                 * mesurée » alors qu'elle l'est parfaitement — son libellé porte
                 * « −6,4 %, pour 30 % attendus au pire ». Les deux cas sont
                 * différents et doivent le rester : ici « indicatif » dit qu'on ne
                 * la note pas, le tiret dit qu'on ne sait pas.
                 */
                const indicatif = f.compte === false;
                return (
                  // Intitulé et mesure sur deux lignes : côte à côte, ils se
                  // disputaient cent cinquante pixels et se coupaient tous les
                  // deux.
                  // ⚠️ L'explication vit ici depuis que le détail a quitté la vue
                  // générale. C'était sa seule adresse dans l'application : la
                  // retirer avec les barres aurait effacé de l'interface ce que
                  // chaque facteur mesure, et laissé sept notes sans définition.
                  <div key={k} title={EXPLICATION_FACTEUR[k] ?? undefined}
                    style={{ display: "flex", alignItems: "center", gap: 8, cursor: "help" }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontFamily: FONT, fontSize: 11,
                                     color: "rgba(var(--nv-encre-rvb), 0.68)", overflow: "hidden",
                                     textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {LIBELLE_FACTEUR[k]}
                        {indicatif && (
                          <span style={{ marginLeft: 4, fontSize: 9,
                                         color: "rgba(var(--nv-encre-rvb), 0.32)" }}>
                            indicatif
                          </span>
                        )}
                      </span>
                      <span style={{ display: "block", fontFamily: FONT, fontSize: 9.5,
                                     color: "rgba(var(--nv-encre-rvb), 0.32)", overflow: "hidden",
                                     textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.libelle}
                      </span>
                    </span>
                    <span style={{ ...NUM, fontSize: 13, fontWeight: 700, width: 26, textAlign: "right",
                                   color: couleurScore(f.score), flexShrink: 0 }}>
                      {indicatif ? "" : f.score ?? "—"}
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
            <div style={{ display: "flex", gap: 3, background: "rgba(var(--nv-encre-rvb), 0.05)",
                          borderRadius: 8, padding: 2 }}>
              {([["secteurs", "Secteurs"], ["zones", "Zones"], ["classes", "Classes"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setOngletExpo(k)} style={{
                  padding: "3px 7px", borderRadius: 6, border: "none", cursor: "pointer",
                  fontFamily: FONT, fontSize: 9.5, fontWeight: ongletExpo === k ? 700 : 500,
                  background: ongletExpo === k ? JETONS.accentDoux : "transparent",
                  color: ongletExpo === k ? JETONS.accent : "rgba(var(--nv-encre-rvb), 0.40)",
                }}>{l}</button>
              ))}
            </div>
          }>Exposition</Titre>

          {expo.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 9, overflowY: "auto", minHeight: 0 }}>
              {expo.map((e, i) => (
                <div key={e.libelle}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0,
                                   fontFamily: FONT, fontSize: 11, color: "rgba(var(--nv-encre-rvb), 0.68)" }}>
                      {ongletExpo === "zones" && DRAPEAU_ZONE[e.libelle] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/drapeaux/${DRAPEAU_ZONE[e.libelle]}.svg`} alt="" aria-hidden="true"
                          style={{
                            width: 14, height: 14, flexShrink: 0, display: "block",
                            // La préflight de Tailwind pose `max-width: 100%` sur les
                            // images. Dans un conteneur en flex dont la largeur de
                            // contenu vaut zéro, cela réduit l'image à néant : elle
                            // mesurait 0 de large pour 14 de haut.
                            maxWidth: "none",
                          }} />
                      )}
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {e.libelle}
                      </span>
                    </span>
                    <span style={{ ...NUM, fontSize: 11, fontWeight: 700, color: "rgba(var(--nv-encre-rvb), 0.88)" }}>
                      {e.part.toFixed(1)} %
                    </span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: "rgba(var(--nv-encre-rvb), 0.06)" }}>
                    <div style={{ width: `${Math.min(100, e.part)}%`, height: "100%", borderRadius: 2,
                                  background: COULEURS_PART[i % COULEURS_PART.length] }} />
                  </div>
                </div>
              ))}
              {(ongletExpo === "secteurs" || ongletExpo === "zones") && (
                <p style={{ margin: "2px 0 0", fontFamily: FONT, fontSize: 9.5,
                            color: "rgba(var(--nv-encre-rvb), 0.26)", lineHeight: 1.5 }}>
                  {ongletExpo === "secteurs"
                    ? "En transparence de vos fonds : la ventilation interne de chaque ETF est répartie au prorata de son poids."
                    : "Zone déduite de l'indice suivi par chaque fonds — un ETF S&P 500 est américain par mandat. La place de cotation, elle, ne dit rien de l'exposition."}
                </p>
              )}
            </div>
          ) : (
            <p style={{ fontFamily: FONT, fontSize: 11, color: "rgba(var(--nv-encre-rvb), 0.28)", margin: 0 }}>
              Ventilation indisponible pour ces titres.
            </p>
          )}
        </Carte>
      </div>

      {/* ── Rangée basse ─────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.25fr) minmax(0,1fr) minmax(0,0.75fr)",
                    gap: GOUTTIERE, flex: 1, minHeight: 0 }}>

        <Carte>
          <Titre>Ce que disent vos chiffres</Titre>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", minHeight: 0 }}>
            {a.observations.length ? a.observations.map((o, i) => {
              const t = TON[o.ton] ?? TON.info;
              return (
                <div key={i} style={{ display: "flex", gap: 10, padding: "9px 11px", borderRadius: 12,
                                      background: "rgba(var(--nv-encre-rvb), 0.035)",
                                      border: "1px solid rgba(var(--nv-encre-rvb), 0.06)" }}>
                  <span style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                                 background: t.fond, color: t.encre,
                                 display: "flex", alignItems: "center", justifyContent: "center",
                                 fontFamily: FONT, fontSize: 11, fontWeight: 800 }}>
                    {t.signe}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontFamily: FONT, fontSize: 11.5, fontWeight: 600,
                                   color: "rgba(var(--nv-encre-rvb), 0.88)", marginBottom: 2 }}>
                      {o.titre}
                    </span>
                    <span style={{ display: "block", fontFamily: FONT, fontSize: 10.5,
                                   color: "rgba(var(--nv-encre-rvb), 0.45)", lineHeight: 1.55 }}>
                      {o.detail}
                    </span>
                  </span>
                </div>
              );
            }) : (
              <p style={{ fontFamily: FONT, fontSize: 11, color: "rgba(var(--nv-encre-rvb), 0.30)",
                          margin: 0, lineHeight: 1.6 }}>
                Rien de saillant : aucune ligne ne domine, les corrélations et la
                volatilité restent dans des bornes ordinaires.
              </p>
            )}
          </div>
          <p style={{ margin: "10px 0 0", fontFamily: FONT, fontSize: 9.5,
                      color: "rgba(var(--nv-encre-rvb), 0.24)", lineHeight: 1.5, flexShrink: 0 }}>
            Observations calculées sur vos positions. Ce ne sont pas des conseils
            en investissement.
          </p>
        </Carte>

        <Carte>
          <Titre>Projection à un an</Titre>
          <Cone p={a.projection} />
        </Carte>

        <Carte>
          <Titre>Répartition des lignes</Titre>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, overflowY: "auto", minHeight: 0 }}>
            {a.poids.map((p, i) => (
              <div key={p.ticker}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600,
                                 color: "rgba(var(--nv-encre-rvb), 0.80)" }}>{p.ticker}</span>
                  <span style={{ ...NUM, fontSize: 11, fontWeight: 700, color: "rgba(var(--nv-encre-rvb), 0.88)" }}>
                    {p.part.toFixed(1)} %
                  </span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: "rgba(var(--nv-encre-rvb), 0.06)" }}>
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
      { key: "reste",   value: 100 - atteint, color: "rgba(var(--nv-encre-rvb), 0.10)" },
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
        <span style={{ ...NUM, fontSize: 30, fontWeight: 700, color: JETONS.texteIntense, lineHeight: 1 }}>
          {score ?? "—"}
        </span>
        <span style={{ fontFamily: FONT, fontSize: 10, color: "rgba(var(--nv-encre-rvb), 0.35)" }}>/100</span>
        {bande && (
          <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: couleur, marginTop: 3 }}>
            {bande}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Cône de projection à un an.
 *
 * Les trois quantiles dessinent une bande, non une courbe : une ligne unique
 * se lirait comme une prévision alors que la dispersion est le seul
 * enseignement du calcul.
 */
function Cone({ p }: { p: Projection }) {
  const t = p.trajectoire ?? [];
  if (!t.length || p.median == null) {
    return (
      <p style={{ fontFamily: FONT, fontSize: 11, color: "rgba(var(--nv-encre-rvb), 0.28)",
                  margin: 0, lineHeight: 1.6 }}>
        Historique trop court pour projeter. Il faut une soixantaine de séances
        pour estimer une dispersion qui veuille dire quelque chose.
      </p>
    );
  }

  const L = 300, H = 120;
  const bas = Math.min(...t.map(x => x.p10));
  const haut = Math.max(...t.map(x => x.p90));
  const etendue = haut - bas || 1;
  const x = (i: number) => (i / (t.length - 1)) * L;
  const y = (v: number) => H - ((v - bas) / etendue) * H;

  const ligne = (cle: "p10" | "median" | "p90") =>
    t.map((pt, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(pt[cle]).toFixed(1)}`).join(" ");
  const bande = `${ligne("p90")} L${t.map((pt, i) => `${x(t.length - 1 - i).toFixed(1)},${y(t[t.length - 1 - i].p10).toFixed(1)}`).join(" L")} Z`;

  const eur = (v: number) => Math.round(v).toLocaleString("fr-FR") + " €";

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <svg viewBox={`0 0 ${L} ${H}`} preserveAspectRatio="none"
             style={{ width: "100%", height: "100%", display: "block" }}>
          <path d={bande} fill={JETONS.accentDoux} />
          <path d={ligne("median")} fill="none" stroke={JETONS.accent} strokeWidth="1.6"
                vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, flexShrink: 0 }}>
        {([["Défavorable", p.p10, JETONS.negatif], ["Médiane", p.median, JETONS.accent],
           ["Favorable", p.p90, JETONS.positif]] as const).map(([l, v, c]) => (
          <span key={l} style={{ textAlign: "center" }}>
            <span style={{ display: "block", fontFamily: FONT, fontSize: 9,
                           color: "rgba(var(--nv-encre-rvb), 0.32)" }}>{l}</span>
            <span style={{ ...NUM, display: "block", fontSize: 12, fontWeight: 700, color: c }}>
              {v == null ? "—" : eur(v)}
            </span>
          </span>
        ))}
      </div>
      <p style={{ margin: "8px 0 0", fontFamily: FONT, fontSize: 9,
                  color: "rgba(var(--nv-encre-rvb), 0.26)", lineHeight: 1.45, flexShrink: 0 }}>
        Portefeuille projeté tel qu&apos;il est, sans versement futur. Deux mille
        tirages sur la volatilité observée — un ordre de grandeur de dispersion,
        pas une prévision.
      </p>
    </div>
  );
}
