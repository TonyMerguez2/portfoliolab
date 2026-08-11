"use client";
import { useState } from "react";

import type { ParametresSuggeres } from "@/hooks/useParametresSuggeres";
import type { Saisie } from "@/hooks/useObjectifs";
import { pourcent, type Genre, type Objectif } from "@/lib/objectifs";
import { CLAIR, JETONS, RAYONS } from "@/lib/palette";
import { FONT, NUM } from "@/lib/typography";

/**
 * La saisie d'un objectif d'épargne.
 *
 * ⚠️ **Les hypothèses sont présentées comme telles.** Taux de rendement attendu,
 * inflation, taux de retrait : ce sont des choix de l'épargnant, pas des mesures. Les
 * champs sont donc vides par défaut — sauf le taux de retrait, pré-rempli à 4 % avec
 * mention de son origine — et l'écran dit ce qui se calcule sans eux. Un taux glissé
 * d'office aurait fait passer une projection pour une prévision.
 *
 * ⚠️ **Aucun conseil ici non plus.** Le formulaire n'oriente pas vers un rendement
 * « raisonnable » ni un versement « recommandé » : il enregistre ce que l'épargnant
 * décide.
 */

const GENRES: { cle: Genre; titre: string; aide: string }[] = [
  { cle: "capital", titre: "Un capital à atteindre",
    aide: "Un montant, avec ou sans date. « Un million d’euros. »" },
  { cle: "capital_age", titre: "Un capital à un âge",
    aide: "« Deux millions à 60 ans. » L’échéance se déduit de votre année de naissance." },
  { cle: "achat", titre: "Un achat précis",
    aide: "Un montant à une date. « 300 000 € en 2031 pour un appartement. »" },
  { cle: "revenu_mensuel", titre: "Un revenu mensuel",
    aide: "« 5 000 € par mois. » Converti en capital par le taux de retrait." },
];

const COULEURS = [JETONS.accent, "#a78bfa", JETONS.positif, JETONS.attention, "#f472b6"];

function Champ({ etiquette, aide, children }: {
  etiquette: string; aide?: string; children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 600,
        color: CLAIR.texteSecondaire }}>{etiquette}</span>
      {children}
      {aide && <span style={{ fontFamily: FONT, fontSize: 9.5, color: CLAIR.texteFaible,
        lineHeight: 1.45 }}>{aide}</span>}
    </label>
  );
}

const styleSaisie: React.CSSProperties = {
  ...NUM, fontSize: 12, padding: "7px 9px", borderRadius: RAYONS.xs,
  border: `1px solid ${CLAIR.bord}`, background: CLAIR.carteCreuse,
  color: CLAIR.texte, outline: "none", width: "100%", boxSizing: "border-box",
};

/** `undefined` quand le champ est vide : le serveur distingue « absent » de « zéro ». */
const nombre = (v: string): number | null => (v.trim() === "" ? null : Number(v));

export default function FormulaireObjectif({
  initial, anneeNaissanceConnue, suggestions, erreur,
  onEnregistrer, onSupprimer, onFermer,
}: {
  /** L'objectif à modifier, ou rien pour une création. */
  initial?: Objectif | null;
  /**
   * ⚠️ Sert à prévenir, pas à bloquer. Sans année de naissance au compte, un objectif
   * « à tel âge » s'enregistre mais reste sans échéance : mieux vaut le dire à la
   * saisie que laisser une carte muette.
   */
  anneeNaissanceConnue: boolean;
  /**
   * Ce que le portefeuille permet de proposer.
   *
   * ⚠️ **Le versement est repris d'un clic, le rendement ne l'est jamais.** Le premier est
   * une mesure des transactions ; le second serait une mesure du passé présentée comme
   * une attente. Sur un vrai portefeuille, la dernière décennie donne 13,17 % par an :
   * le pré-remplir rendrait la projection délirante, et l'épargnant y croirait parce que
   * le chiffre vient de ses propres données. On le montre, il choisit.
   */
  suggestions?: ParametresSuggeres | null;
  erreur?: string | null;
  onEnregistrer: (s: Saisie) => void;
  onSupprimer?: () => void;
  onFermer: () => void;
}) {
  const [nom, setNom] = useState(initial?.nom ?? "");
  const [genre, setGenre] = useState<Genre>(initial?.genre ?? "capital");
  const [cible, setCible] = useState(initial ? String(initial.cible) : "");
  const [echeance, setEcheance] = useState(
    initial?.echeance_annee ? String(initial.echeance_annee) : "");
  const [age, setAge] = useState(initial?.age_cible ? String(initial.age_cible) : "");
  const [part, setPart] = useState(
    initial?.part_affectee != null ? String(initial.part_affectee) : "");
  const [versement, setVersement] = useState(
    initial?.versement_mensuel != null ? String(initial.versement_mensuel) : "");
  const [taux, setTaux] = useState(
    initial?.taux_attendu != null ? String(initial.taux_attendu) : "");
  const [inflation, setInflation] = useState(
    initial?.inflation != null ? String(initial.inflation)
      : String(suggestions?.inflation.valeur ?? ""));
  const [retrait, setRetrait] = useState(
    initial?.taux_retrait != null ? String(initial.taux_retrait) : "4");
  const [couleur, setCouleur] = useState(initial?.couleur ?? JETONS.accent);

  const enAge = genre === "capital_age";
  const enRevenu = genre === "revenu_mensuel";

  return (
    <div
      onClick={onFermer}
      style={{
        position: "fixed", inset: 0, zIndex: 60, display: "flex",
        alignItems: "center", justifyContent: "center", padding: 20,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)",
      }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          width: 460, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto",
          background: CLAIR.carte, border: `1px solid ${CLAIR.bord}`,
          borderRadius: RAYONS.sm, padding: "18px 20px",
          display: "flex", flexDirection: "column", gap: 14,
        }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 700, color: CLAIR.texte }}>
            {initial ? "Modifier l’objectif" : "Nouvel objectif"}
          </span>
          <button type="button" onClick={onFermer} aria-label="Fermer"
            style={{ background: "none", border: "none", cursor: "pointer",
              color: CLAIR.texteFaible, fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        <Champ etiquette="Nom">
          <input value={nom} onChange={e => setNom(e.target.value)} style={{ ...styleSaisie, fontFamily: FONT }}
            placeholder="Retraite, appartement, indépendance…" />
        </Champ>

        <Champ etiquette="Sorte d’objectif" aide={GENRES.find(g => g.cle === genre)?.aide}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {GENRES.map(g => (
              <button key={g.cle} type="button" onClick={() => setGenre(g.cle)}
                style={{
                  padding: "7px 9px", borderRadius: RAYONS.xs, cursor: "pointer",
                  textAlign: "left", fontFamily: FONT, fontSize: 10.5, fontWeight: 600,
                  border: `1px solid ${genre === g.cle ? JETONS.accent : CLAIR.bord}`,
                  background: genre === g.cle ? JETONS.accentVoile : "transparent",
                  color: genre === g.cle ? CLAIR.accent : CLAIR.texteSecondaire,
                }}>
                {g.titre}
              </button>
            ))}
          </div>
        </Champ>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Champ etiquette={enRevenu ? "Revenu visé (€ / mois)" : "Montant visé (€)"}>
            <input value={cible} onChange={e => setCible(e.target.value)}
              inputMode="decimal" style={styleSaisie} placeholder={enRevenu ? "5000" : "300000"} />
          </Champ>

          {enAge ? (
            <Champ etiquette="Âge visé"
              aide={anneeNaissanceConnue ? undefined
                : "Votre année de naissance n’est pas enregistrée : cet objectif restera sans échéance."}>
              <input value={age} onChange={e => setAge(e.target.value)}
                inputMode="numeric" style={styleSaisie} placeholder="60" />
            </Champ>
          ) : (
            <Champ etiquette="Année d’échéance" aide="Facultative.">
              <input value={echeance} onChange={e => setEcheance(e.target.value)}
                inputMode="numeric" style={styleSaisie} placeholder="2044" />
            </Champ>
          )}
        </div>

        <Champ etiquette="Part du portefeuille affectée (%)"
          aide="100 % par défaut. Avec plusieurs objectifs, répartissez : au-delà de 100 % au total, le même euro compterait deux fois.">
          <input value={part} onChange={e => setPart(e.target.value)}
            inputMode="decimal" style={styleSaisie} placeholder="100" />
        </Champ>

        {/* ── Hypothèses ─────────────────────────────────────────────────────── */}
        <div style={{ borderTop: `1px solid ${CLAIR.bord}`, paddingTop: 12,
          display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontFamily: FONT, fontSize: 10, color: CLAIR.texteFaible,
            lineHeight: 1.5 }}>
            <strong style={{ color: CLAIR.texteSecondaire }}>Hypothèses</strong> — ce sont
            vos choix, pas des mesures. Sans elles, la carte montre l’avancement mais
            aucune projection.
          </span>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Champ etiquette="Versement mensuel (€)"
              aide={suggestions?.versement?.trompeur
                ? `Vos apports sont concentrés (${suggestions.versement.concentration} % sur un seul mois) : `
                  + "ce rythme ne décrit pas une habitude."
                : undefined}>
              <input value={versement} onChange={e => setVersement(e.target.value)}
                inputMode="decimal" style={styleSaisie} placeholder="800" />
              {/* ⚠️ Une mesure, donc reprise d'un clic — mais jamais glissée d'office :
                  c'est l'épargnant qui décide de ce qu'il versera demain, pas ce qu'il a
                  versé hier. */}
              {suggestions?.versement?.par_mois != null && (
                <button type="button"
                  onClick={() => setVersement(String(Math.round(suggestions.versement!.par_mois!)))}
                  style={{ alignSelf: "flex-start", marginTop: 3, padding: "2px 7px",
                    borderRadius: RAYONS.xs, cursor: "pointer", background: "transparent",
                    border: `1px solid ${CLAIR.bord}`, color: CLAIR.accent,
                    fontFamily: FONT, fontSize: 9.5, fontWeight: 600 }}>
                  reprendre {Math.round(suggestions.versement.par_mois)} €/mois observés
                  sur {suggestions.versement.mois} mois
                </button>
              )}
            </Champ>
            <Champ etiquette="Rendement attendu (% / an)">
              <input value={taux} onChange={e => setTaux(e.target.value)}
                inputMode="decimal" style={styleSaisie} placeholder="7,2" />
              {/* ⚠️ **Aucun bouton pour reprendre ces chiffres, volontairement.** Ils
                  mesurent le passé de votre allocation, sur une période — 2014 à 2026 —
                  qui fut exceptionnelle pour les actions. Un clic les transformerait en
                  attente, et la projection en promesse. Ils sont là pour situer un ordre
                  de grandeur, pas pour être recopiés. */}
              {suggestions && suggestions.rendements_passes.length > 0 && (
                <span style={{ marginTop: 3, fontFamily: FONT, fontSize: 9,
                  lineHeight: 1.45, color: CLAIR.texteFaible }}>
                  Votre allocation a rendu{" "}
                  {suggestions.rendements_passes
                    .map(r => `${pourcent(r.rendement, 1)} % sur ${r.annees} ans`).join(", ")}.
                  {suggestions.periode_mesuree
                    && suggestions.periode_mesuree.couverture < 99.5
                    && ` Mesuré sur ${pourcent(suggestions.periode_mesuree.couverture, 1)} % de l’allocation.`}
                  {" "}Ce sont des mesures du passé, sur une période favorable aux actions —
                  pas une prévision.
                </span>
              )}
            </Champ>
            <Champ etiquette="Inflation estimée (% / an)"
              aide={suggestions
                ? `Pré-rempli sur la ${suggestions.inflation.source} — une cible publiée, `
                  + "pas une prévision. Pour lire la projection en euros d’aujourd’hui."
                : "Pour lire la projection en euros d’aujourd’hui."}>
              <input value={inflation} onChange={e => setInflation(e.target.value)}
                inputMode="decimal" style={styleSaisie} placeholder="2" />
            </Champ>
            {enRevenu && (
              <Champ etiquette="Taux de retrait (% / an)"
                aide="4 % est une convention issue de l’étude Trinity (1998), pas une garantie.">
                <input value={retrait} onChange={e => setRetrait(e.target.value)}
                  inputMode="decimal" style={styleSaisie} />
              </Champ>
            )}
          </div>
        </div>

        <Champ etiquette="Couleur">
          <div style={{ display: "flex", gap: 7 }}>
            {COULEURS.map(c => (
              <button key={c} type="button" onClick={() => setCouleur(c)}
                aria-label={`Couleur ${c}`}
                style={{
                  width: 22, height: 22, borderRadius: "50%", cursor: "pointer",
                  background: c, border: couleur === c ? `2px solid ${CLAIR.texte}` : "none",
                }} />
            ))}
          </div>
        </Champ>

        {/* ⚠️ Le refus du serveur est montré mot pour mot. « taux_attendu : 120 est hors
            de -20 à 30 » se corrige ; « une erreur est survenue » se devine. */}
        {erreur && (
          <p style={{ margin: 0, fontFamily: FONT, fontSize: 10.5, lineHeight: 1.5,
            color: JETONS.negatif }}>
            {erreur}
          </p>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
          <button type="button"
            onClick={() => onEnregistrer({
              nom: nom.trim(), genre, cible: Number(cible.replace(",", ".")) || 0,
              echeance_annee: enAge ? null : nombre(echeance),
              age_cible: enAge ? nombre(age) : null,
              part_affectee: nombre(part.replace(",", ".")),
              versement_mensuel: nombre(versement.replace(",", ".")),
              taux_attendu: nombre(taux.replace(",", ".")),
              inflation: nombre(inflation.replace(",", ".")),
              taux_retrait: enRevenu ? nombre(retrait.replace(",", ".")) : null,
              couleur,
            })}
            style={{
              flex: 1, padding: "9px 14px", borderRadius: RAYONS.xs, cursor: "pointer",
              border: `1px solid ${JETONS.accent}`, background: JETONS.accentVoile,
              color: CLAIR.accent, fontFamily: FONT, fontSize: 11.5, fontWeight: 700,
            }}>
            {initial ? "Enregistrer" : "Créer l’objectif"}
          </button>
          {onSupprimer && (
            <button type="button" onClick={onSupprimer}
              style={{
                padding: "9px 14px", borderRadius: RAYONS.xs, cursor: "pointer",
                border: `1px solid ${CLAIR.bord}`, background: "transparent",
                color: JETONS.negatif, fontFamily: FONT, fontSize: 11.5, fontWeight: 600,
              }}>
              Supprimer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
