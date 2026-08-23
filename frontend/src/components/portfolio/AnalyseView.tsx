"use client";
import { useMemo, useState } from "react";
import { FONT, NUM } from "@/lib/typography";
import { donutArcs } from "@/lib/donut";
import {
  type Analyse, type EtatAnalyse, type Observation,
  type Part, type Projection, type Trajet,
} from "@/lib/analyse";
import { BANDES as SEUILS_BANDES, LIBELLE_PROFIL } from "@/lib/portfolio-score/types";
import Cadre from "@/components/ui/Cadre";
import DrapeauPays from "@/components/DrapeauPays";
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
 * ⚠️ Le radar a été **retiré** de l'onglet, avec sa table d'abrégés.
 *
 * Il doublait l'information des cinq barres, qui portent en plus les chiffres, les
 * noms entiers et les poids — un radar dont les étiquettes ne tiennent pas ne dit rien
 * qu'une barre ne dise mieux. Et sa colonne fixe étouffait la mise en page : mesuré à
 * 800 px de large, elle faisait disparaître les cinq piliers du cadre.
 *
 * Le code est supprimé plutôt que laissé de côté : un composant gardé « au cas où »
 * cesse d'être maintenu tout en restant compilé.
 */


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
// ⚠️ **Six** couleurs pour six bandes. La table en portait cinq, donc la dernière
// recevait `undefined` : tout score inférieur à quarante s'affichait sans couleur, en
// blanc, comme une note neutre. Vu à l'écran sur un « 24 » qui devait alerter.
//
// L'échelle suit le §18 : vert pour ce qui va, orange pour ce qui mérite attention,
// rouge pour ce qui pose problème. Deux crans de vert et deux d'orange pour que six
// bandes se distinguent sans arc-en-ciel.
const COULEURS_BANDES = [
  JETONS.positifFort,       // Excellent
  JETONS.positif,           // Très bon
  JETONS.attentionFort,     // Bon
  JETONS.attentionIntense,  // Correct
  JETONS.negatif,           // À améliorer
  JETONS.negatifFort,       // Fragile
];
const BANDES = SEUILS_BANDES.map((b, i) => ({ ...b, couleur: COULEURS_BANDES[i] }));

const couleurScore = (s: number | null) =>
  s == null ? "rgba(var(--nv-encre-rvb), 0.30)" : (BANDES.find(b => s >= b.min) ?? BANDES[BANDES.length - 1]).couleur;

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

const COULEURS_PART = ["#50A2FF", "#a78bfa", "#FF8904", "#00D492", JETONS.negatif, "#22d3ee", "#94a3b8"];

function Carte({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    // ⚠️ L'attribut est posé sur la carte, pas sur chaque ligne : `closest` remonte
    // l'arbre, donc un seul suffit à rendre tout le panneau expressif. Un attribut par
    // ligne aurait été autant d'occasions d'en oublier une.
    <Cadre data-avatar="curieux"
      style={{ padding: "14px 18px", display: "flex", flexDirection: "column", minHeight: 0, ...style }}>
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
  // Un seul pilier déplié à la fois : la carte ne peut pas porter vingt-cinq lignes.
  const [pilierOuvert, setPilierOuvert] = useState<string | null>(null);

  /**
   * Le radar ne porte que les facteurs qui **notent**.
   *
   * ⚠️ Il représente visuellement la note : y placer un facteur indicatif — la
   * perte maximale, hors du score — laisserait croire qu'il y pèse. Elle reste dans
   * la liste en dessous, marquée comme telle.
   */
  // ⚠️ Mémorisé : `?? []` crée un tableau neuf à chaque rendu, ce qui invaliderait
  // le `useMemo` du radar en permanence — il recalculerait à chaque frappe ailleurs
  // dans la page.
  const piliers = useMemo(() => a?.novac?.piliers ?? [], [a]);
  const confiance = a?.novac?.confiance ?? null;
  const profilLisible = a?.novac?.profil ? LIBELLE_PROFIL[a.novac.profil] : null;

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

        {/* Le bloc principal du score */}
        <Carte>
          <Titre>NOVAC Score</Titre>
          {/* ⚠️ La légende des six bandes vivait ici, sur six lignes. Elle décrivait
              l'échelle une fois pour toutes et prenait la place de ce qui change : le
              profil et la confiance. Elle appartient à l'écran de méthodologie. */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
                        gap: 12, flex: 1, minHeight: 0, justifyContent: "center" }}>
            <Jauge score={a.score} bande={a.bande} />
            {/* Profil et confiance côte à côte : deux chiffres de natures
                différentes, et la confiance ne remplace jamais la note. */}
            <div style={{ display: "flex", gap: 22, width: "100%", justifyContent: "center" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: FONT, fontSize: 9, letterSpacing: "0.06em",
                              color: "rgba(var(--nv-encre-rvb), 0.32)", marginBottom: 2 }}>
                  PROFIL
                </div>
                <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600,
                              color: "rgba(var(--nv-encre-rvb), 0.82)" }}>
                  {profilLisible ?? "non déclaré"}
                </div>
              </div>
              <div style={{ width: 1, background: JETONS.bord }} />
              <div style={{ textAlign: "center" }} title={
                "La qualité des données, non celle du portefeuille. Les manques sur une "
                + "grosse position pèsent plus lourd que sur une petite."
                + (a.novac?.donnees_manquantes.length
                  ? ` Absent : ${a.novac.donnees_manquantes.join(" · ")}.` : "")}>
                <div style={{ fontFamily: FONT, fontSize: 9, letterSpacing: "0.06em",
                              color: "rgba(var(--nv-encre-rvb), 0.32)", marginBottom: 2 }}>
                  CONFIANCE
                </div>
                <div style={{ ...NUM, fontSize: 12, fontWeight: 700, cursor: "help",
                              color: confiance == null ? "rgba(var(--nv-encre-rvb), 0.40)"
                                : confiance >= 80 ? JETONS.positif : JETONS.attentionFort }}>
                  {confiance == null ? "—" : `${confiance} %`}
                </div>
              </div>
            </div>
          </div>
          <p style={{ margin: "10px 0 0", fontFamily: FONT, fontSize: 9.5,
                      color: "rgba(var(--nv-encre-rvb), 0.28)", lineHeight: 1.45, flexShrink: 0 }}>
            Moyenne des cinq piliers mesurables, pondérée selon votre profil. Les
            piliers non calculables sont écartés, jamais comptés à zéro.
            {a.novac && ` ${a.novac.version_methodologie}.`}
          </p>
        </Carte>

        {/* Les cinq piliers */}
        <Carte>
          <Titre action={
            <span style={{ fontFamily: FONT, fontSize: 9.5, whiteSpace: "nowrap",
                           color: "rgba(var(--nv-encre-rvb), 0.30)" }}>
              cliquez pour le détail
            </span>
          }>Les cinq piliers</Titre>
          {/* ⚠️ `alignItems: stretch` et non `center`, et c'est tout le défaut d'avant.
              Centrée, une liste plus haute que sa rangée débordait **des deux côtés** à
              la fois : elle chevauchait le titre en haut et sortait du cadre en bas,
              symétriquement. Le `overflowY: auto` de la liste ne servait à rien puisque
              le centrage l'avait déjà fait grandir hors de son conteneur.

              Étirée, elle reçoit exactement la hauteur de la rangée et défile dedans.
              Le radar, lui, se centre seul — c'est un carré, il n'a pas à s'étirer. */}
          {/* ⚠️ **Le radar a été retiré de cette carte**, et c'est un retrait, pas un
              oubli.

              Il doublait l'information des cinq barres, qui portent en plus les
              chiffres et les noms entiers — un radar sans étiquettes lisibles ne dit
              rien qu'une barre ne dise mieux. Et c'est lui qui étouffait la mise en
              page : mesuré à 800 px de large, sa colonne fixe de 150 px faisait
              disparaître les cinq piliers du cadre, tronquait « Équilibré » en
              « quilibré » et repliait le titre sur deux lignes.

              Les cinq notes occupent donc toute la largeur, et le détail du pilier
              ouvert vient dessous. La carte n'a pas la hauteur de tout montrer d'un
              coup — cinq piliers plus quatre métriques demandent 376 px pour 291 —
              donc l'ensemble défile, mais les cinq notes restent en tête de liste. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6,
                        flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 4 }}>
            {piliers.map(pil => {
              const actif = pilierOuvert === pil.cle;
              const col = couleurScore(pil.score);
              return (
                <div key={pil.cle}>
                  <button type="button" title={pil.explication}
                    onClick={() => setPilierOuvert(actif ? null : pil.cle)}
                    style={{ display: "block", width: "100%", textAlign: "left",
                             background: actif ? "rgba(var(--nv-encre-rvb), 0.04)" : "none",
                             border: "none", borderRadius: 6, padding: "3px 6px",
                             cursor: "pointer", transition: "background 150ms" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ flex: 1, minWidth: 0, fontFamily: FONT, fontSize: 11.5,
                                     fontWeight: 600, color: "rgba(var(--nv-encre-rvb), 0.82)",
                                     overflow: "hidden", textOverflow: "ellipsis",
                                     whiteSpace: "nowrap" }}>
                        {pil.libelle}
                        <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 500,
                                       color: "rgba(var(--nv-encre-rvb), 0.30)" }}>
                          {pil.poids_effectif > 0
                            ? `${pil.poids_effectif.toFixed(0)} %`
                            : "hors calcul"}
                        </span>
                      </span>
                      <span style={{ ...NUM, fontSize: 15, fontWeight: 700, width: 30,
                                     textAlign: "right", color: col, flexShrink: 0 }}>
                        {pil.score ?? "—"}
                      </span>
                    </div>
                    {/* Une barre très fine, comme le §18 le demande : elle donne
                        l'ordre de grandeur sans peser dans la composition. */}
                    <div style={{ height: 3, marginTop: 4, borderRadius: 2,
                                  background: "rgba(var(--nv-encre-rvb), 0.07)" }}>
                      {pil.score != null && (
                        <div style={{ height: "100%", borderRadius: 2, background: col,
                                      width: `${pil.score}%`, opacity: 0.85,
                                      transition: "width 600ms ease" }} />
                      )}
                    </div>
                  </button>
                  {actif && (
                    <div style={{ padding: "5px 6px 7px 14px", display: "flex",
                                  flexDirection: "column", gap: 5 }}>
                      {pil.metriques.filter(m => m.poids > 0).map(m => (
                        <div key={m.cle} title={m.explication}
                          style={{ display: "flex", alignItems: "baseline", gap: 8,
                                   cursor: "help" }}>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: "block", fontFamily: FONT, fontSize: 10,
                                           color: "rgba(var(--nv-encre-rvb), 0.64)" }}>
                              {m.libelle}
                              <span style={{ marginLeft: 4, fontSize: 8.5,
                                             color: "rgba(var(--nv-encre-rvb), 0.26)" }}>
                                {m.poids_effectif.toFixed(0)} %
                              </span>
                            </span>
                            {/* La lecture brute : « 0,56 au plus entre deux lignes »
                                se vérifie, « 100 » se subit. */}
                            <span style={{ display: "block", fontFamily: FONT, fontSize: 9,
                                           lineHeight: 1.35,
                                           color: "rgba(var(--nv-encre-rvb), 0.30)" }}>
                              {m.lecture}
                              {m.statut === "partiel"
                                && ` · ${(m.couverture * 100).toFixed(0)} % du portefeuille`}
                            </span>
                          </span>
                          <span style={{ ...NUM, fontSize: 10.5, fontWeight: 600, width: 24,
                                         textAlign: "right", color: couleurScore(m.score),
                                         flexShrink: 0 }}>
                            {m.score ?? "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
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
                      {/* ⚠️ Le libellé arrive en deux vocabulaires, et c'est ce qui
                          faisait la panne. La zone d'un fonds se déduit de son mandat,
                          en français — « Japon » —, mais le pays d'une **action** vient
                          de `info["country"]` chez le fournisseur et sort en anglais —
                          « Switzerland », « Taiwan ». La table d'avant tenait sept
                          libellés français en dur : aucune action n'avait donc de
                          drapeau, pas même les américaines, qui arrivent en
                          « United States ». Le résolveur accepte les deux langues et
                          les 245 pays du jeu de drapeaux.

                          ⚠️ Les agrégats — « Marchés émergents », « Monde développé » —
                          continuent de n'en avoir aucun : leur prêter le pavillon du
                          pays dominant ferait lire une exposition qui n'est pas celle
                          des chiffres. C'est `codePaysDrapeau` qui rend `null`, et un
                          test le vérifie. */}
                      {ongletExpo === "zones" && <DrapeauPays pays={e.libelle} taille={14} />}
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
