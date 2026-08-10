"use client";
import { useMemo, useState } from "react";

import { CLAIR, JETONS, RAYONS } from "@/lib/palette";
import { decalerMois, grilleDuMois, JOURS, NOMS_MOIS } from "@/lib/moisCalendrier";
import { FONT, NUM } from "@/lib/typography";

/**
 * Le mois, avec un point par échéance.
 *
 * ⚠️ **Deux des trois catégories sont peuplées, la troisième attend ses dates.**
 * Les résultats et les dividendes viennent des échéances réellement publiées ;
 * les publications économiques — IPC, PCE, FOMC — n'ont pas encore de source dans
 * le projet. Leur pastille de légende est donc éteinte plutôt que masquée : la
 * masquer laisserait croire que cette catégorie n'existe pas, l'éteindre dit
 * qu'elle existe et n'a rien à montrer.
 *
 * Le calendrier ne décide de rien : il lit la liste d'événements que l'appelant a
 * déjà obtenue. Deux appels pour la même donnée l'auraient exposée à afficher un
 * mois qui contredit la liste d'à côté.
 */

type Nature = "resultats" | "dividende" | "economique";

const TEINTE: Record<Nature, string> = {
  resultats: JETONS.accent,
  dividende: JETONS.positif,
  economique: JETONS.attention,
};

const LEGENDE: { cle: Nature; libelle: string }[] = [
  { cle: "resultats", libelle: "Résultats" },
  { cle: "economique", libelle: "Économique" },
  { cle: "dividende", libelle: "Dividendes" },
];

export default function CalendrierEvenements({
  evenements, peremption, onJour,
}: {
  evenements: { date: string; nature: Nature }[];
  /**
   * Jusqu'où le calendrier macro est complet.
   *
   * ⚠️ Affiché, et non gardé pour le serveur. Passé cette date, un mois sans point
   * n'est pas un mois sans échéance : c'est un mois que la source n'a pas encore
   * publié. Le taire ferait lire une absence là où il n'y a qu'une ignorance — et
   * c'est le genre de silence sur lequel on prend une décision.
   */
  peremption?: string | null;
  /** Appelé au clic sur un jour qui porte au moins une échéance. */
  onJour?: (iso: string) => void;
}) {
  const maintenant = new Date();
  const [[annee, mois], setMois] = useState<[number, number]>(
    [maintenant.getFullYear(), maintenant.getMonth()]);

  const grille = useMemo(() => grilleDuMois(annee, mois), [annee, mois]);

  /**
   * Les natures présentes par jour, sans doublon : un jour, un point par nature.
   *
   * Rangées en tableau plutôt qu'en ensemble : la cible de compilation du projet
   * n'itère pas les `Set` sans drapeau supplémentaire, et un tableau dédoublonné à
   * la main coûte moins qu'un réglage de compilateur changé pour trois points.
   */
  const parJour = useMemo(() => {
    const m = new Map<string, Nature[]>();
    for (const e of evenements) {
      const liste = m.get(e.date);
      if (!liste) m.set(e.date, [e.nature]);
      else if (!liste.includes(e.nature)) liste.push(e.nature);
    }
    return m;
  }, [evenements]);

  const aujourdhui = `${maintenant.getFullYear()}-`
    + `${String(maintenant.getMonth() + 1).padStart(2, "0")}-`
    + `${String(maintenant.getDate()).padStart(2, "0")}`;

  const fleche = (pas: number) => (
    <button type="button" onClick={() => setMois(decalerMois(annee, mois, pas))}
      aria-label={pas < 0 ? "Mois précédent" : "Mois suivant"}
      style={{
        width: 22, height: 22, borderRadius: RAYONS.xs, cursor: "pointer",
        border: `1px solid ${CLAIR.bord}`, background: "transparent",
        color: CLAIR.texteSecondaire, fontFamily: FONT, fontSize: 11, lineHeight: 1,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
      }}>
      {pas < 0 ? "‹" : "›"}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: CLAIR.texte }}>
          Calendrier
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {fleche(-1)}
          <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: CLAIR.texteSecondaire,
            minWidth: 92, textAlign: "center" }}>
            {NOMS_MOIS[mois]} {annee}
          </span>
          {fleche(1)}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {JOURS.map(j => (
          <div key={j} style={{
            fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
            color: CLAIR.texteFaible, textAlign: "center", paddingBottom: 2,
          }}>{j}</div>
        ))}

        {grille.map(c => {
          const natures = parJour.get(c.iso);
          const estAujourdhui = c.iso === aujourdhui;
          const cliquable = !!natures && !!onJour;
          return (
            <div key={c.iso}
              onClick={cliquable ? () => onJour!(c.iso) : undefined}
              style={{
                // Hauteur fixe : la rangée de points ne doit pas faire respirer la
                // case, sinon la grille se déforme selon les jours chargés.
                height: 30, borderRadius: RAYONS.xs,
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", gap: 2,
                cursor: cliquable ? "pointer" : "default",
                background: estAujourdhui ? JETONS.accent : "transparent",
                color: estAujourdhui ? "#FFFFFF"
                  : c.duMois ? CLAIR.texteSecondaire : CLAIR.texteFaible,
                // Les jours empruntés aux mois voisins restent lisibles mais
                // s'effacent : les masquer casserait l'alignement des semaines.
                opacity: c.duMois ? 1 : 0.35,
              }}>
              <span style={{ ...NUM, fontSize: 11, lineHeight: 1 }}>{c.jour}</span>
              <span style={{ display: "flex", gap: 2, height: 4 }}>
                {natures?.map(n => (
                  <span key={n} style={{
                    width: 4, height: 4, borderRadius: "50%",
                    background: estAujourdhui ? "#FFFFFF" : TEINTE[n],
                  }} />
                ))}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {LEGENDE.map(l => {
          const presente = evenements.some(e => e.nature === l.cle);
          return (
            <span key={l.cle} style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              fontFamily: FONT, fontSize: 10,
              color: presente ? CLAIR.texteSecondaire : CLAIR.texteFaible,
              opacity: presente ? 1 : 0.5,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: presente ? TEINTE[l.cle] : "transparent",
                border: presente ? "none" : `1px solid ${CLAIR.texteFaible}`,
              }} />
              {l.libelle}
            </span>
          );
        })}
      </div>

      {/* L'aveu d'incomplétude, quand le mois affiché dépasse ce que les sources
          couvrent. Ne paraît que là où il est utile : l'afficher en permanence en
          ferait une mention décorative qu'on cesse de lire. */}
      {peremption && grille.some(c => c.duMois && c.iso > peremption) && (
        <p style={{ margin: 0, fontFamily: FONT, fontSize: 9.5, color: CLAIR.texteFaible, lineHeight: 1.5 }}>
          Publications économiques connues jusqu&apos;au{" "}
          <span style={{ ...NUM }}>
            {new Date(peremption + "T12:00:00").toLocaleDateString("fr-FR",
              { day: "numeric", month: "long", year: "numeric" })}
          </span>. Au-delà, les organismes n&apos;ont pas encore annoncé leurs dates.
        </p>
      )}
    </div>
  );
}
