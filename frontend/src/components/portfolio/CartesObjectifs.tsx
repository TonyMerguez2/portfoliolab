"use client";
import type { Objectif } from "@/lib/objectifs";
import {
  echeanceEnClair, ecartAuRythme, euros, libelleCible, montantCible,
} from "@/lib/objectifs";
import { CLAIR, JETONS, RAYONS } from "@/lib/palette";
import { FONT, NUM } from "@/lib/typography";

/**
 * La rangée de cartes d'objectifs, comme la maquette la dessine.
 *
 * ⚠️ **Remplace trois objectifs écrits dans le code.** L'onglet affichait « Retraite
 * 2035 », « Achat immobilier » et « Indépendance financière » avec des cibles choisies
 * au hasard et un montant courant calculé en multipliant la valeur du portefeuille par
 * 0,42 et 0,28. Ici, aucune carte n'existe si l'épargnant n'a pas saisi l'objectif, et
 * chaque chiffre vient du serveur.
 *
 * ⚠️ **Aucun conseil.** La carte dit où l'on en est et, quand les hypothèses le
 * permettent, si le rythme actuel tient l'échéance. Elle ne dit jamais quoi faire.
 */

/** Un pictogramme par sorte d'objectif — le genre est connu, l'icône ne l'invente pas. */
const GLYPHE: Record<Objectif["genre"], string> = {
  // Une cible : un capital à atteindre.
  capital: "M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l7-7m0 0V3m0 2h2",
  // Un sablier : un capital à une date de vie.
  capital_age: "M7 3h10M7 21h10M8 3v3.5L12 11l4-4.5V3M8 21v-3.5L12 13l4 4.5V21",
  // Une maison : un achat précis.
  achat: "M4 11.5 12 4l8 7.5M6 10.5V20h12v-9.5M10 20v-5h4v5",
  // Une flèche qui revient : un revenu qui tombe chaque mois.
  revenu_mensuel: "M4 9h10a4 4 0 0 1 0 8H8m0 0 3-3m-3 3 3 3M4 9l3-3M4 9l3 3",
  // Un plafond, et une flèche qui monte vers lui : ce qui le remplit vient d'en bas — les
  // versements — et non de la valeur du portefeuille.
  plafond_versements: "M4 4h16M12 20V8m0 0-4 4m4-4 4 4",
};

function Jauge({ part, couleur }: { part: number; couleur: string }) {
  return (
    <div style={{ height: 5, borderRadius: RAYONS.plein, background: CLAIR.carteCreuse,
      overflow: "hidden" }}>
      <div style={{
        height: "100%", borderRadius: RAYONS.plein, background: couleur,
        width: `${Math.max(0, Math.min(100, part))}%`, transition: "width 600ms ease",
      }} />
    </div>
  );
}

function Carte({ o, onModifier }: { o: Objectif; onModifier?: (o: Objectif) => void }) {
  const couleur = o.couleur || JETONS.accent;
  const rythme = ecartAuRythme(o);
  const echeance = echeanceEnClair(o.mois_restants);

  return (
    <div
      onClick={onModifier ? () => onModifier(o) : undefined}
      style={{
        display: "flex", flexDirection: "column", gap: 8,
        // ⚠️ Un peu plus d'air qu'avant : le titre « MES OBJECTIFS » et son bouton, retirés
        // au-dessus, rendaient une trentaine de pixels à la rangée. Ils reviennent ici
        // plutôt qu'à un panneau du bas, dont aucun ne les réclamait — et l'onglet tient
        // toujours en un écran, ce qui était la contrainte de départ.
        padding: "13px 15px", borderRadius: RAYONS.sm,
        border: `1px solid ${CLAIR.bord}`, background: CLAIR.carteCreuse,
        cursor: onModifier ? "pointer" : "default", minWidth: 0,
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{
          width: 28, height: 28, borderRadius: RAYONS.xs, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: couleur + "1E", border: `1px solid ${couleur}33`,
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={couleur}
            strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true">
            <path d={GLYPHE[o.genre]} />
          </svg>
        </span>
        <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600,
          color: CLAIR.texte, minWidth: 0, overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {o.nom}
        </span>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: couleur,
          flexShrink: 0 }} />
      </div>

      <div>
        <div style={{ ...NUM, fontSize: 18, fontWeight: 700, color: CLAIR.texte,
          lineHeight: 1.15 }}>
          {montantCible(o)}
        </div>
        <div style={{ fontFamily: FONT, fontSize: 10, color: CLAIR.texteFaible }}>
          {libelleCible(o)}
        </div>
      </div>

      {/* ⚠️ Sans avancement, pas de jauge : le serveur rend `null` quand la valeur du
          portefeuille est inconnue — cours indisponibles. Une jauge à zéro se lirait
          comme un objectif intouché, ce qui est faux et découragerait pour rien. */}
      {o.avancement != null ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1 }}><Jauge part={o.avancement} couleur={couleur} /></div>
            <span style={{ ...NUM, fontSize: 11, fontWeight: 700, color: couleur }}>
              {Math.round(o.avancement)} %
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline",
            justifyContent: "space-between", gap: 8 }}>
            {/* ⚠️ « versés » pour un plafond : le même « 3 000 € / 150 000 € » se lirait
                sinon comme un patrimoine, alors que c'est un cumul d'apports. */}
            <span style={{ ...NUM, fontSize: 10, color: CLAIR.texteFaible }}>
              {o.montant_actuel != null && o.capital_requis != null
                ? `${euros(o.montant_actuel)} / ${euros(o.capital_requis)}`
                  + (o.sur_versements ? " versés" : "")
                : "—"}
            </span>
            <span style={{ fontFamily: FONT, fontSize: 10, color: CLAIR.texteFaible,
              whiteSpace: "nowrap" }}>
              {echeance ?? "sans échéance"}
            </span>
          </div>
        </>
      ) : (
        <span style={{ fontFamily: FONT, fontSize: 10, color: CLAIR.texteFaible }}>
          Avancement indisponible
        </span>
      )}

      {/* Le constat de rythme, quand les hypothèses le permettent. Jamais une consigne. */}
      {rythme && (
        <span style={{
          alignSelf: "flex-start", fontFamily: FONT, fontSize: 9.5, fontWeight: 600,
          padding: "2px 7px", borderRadius: RAYONS.xs,
          color: rythme.tenable ? JETONS.positif : JETONS.attention,
          background: (rythme.tenable ? JETONS.positif : JETONS.attention) + "1E",
        }}>
          {rythme.texte}
        </span>
      )}
    </div>
  );
}

export default function CartesObjectifs({
  objectifs, onAjouter, onModifier,
}: {
  objectifs: Objectif[];
  onAjouter?: () => void;
  onModifier?: (o: Objectif) => void;
}) {
  return (
    <div style={{
      display: "grid", gap: 12,
      // Autant de colonnes que la largeur en autorise, sans jamais descendre sous une
      // largeur lisible : c'est ce qui fait tenir une carte comme cinq.
      //
      // ⚠️ **205 et non 228, et ce chiffre vient d'une mesure.** À 228, quatre colonnes
      // seulement tenaient dans les 1 134 pixels de la grille : le quatrième objectif
      // renvoyait la tuile « Ajouter » à la ligne, ajoutant 136 pixels et faisant **défiler
      // l'onglet** — 923 pixels de contenu pour 645 de hauteur utile. Or tenir en un écran
      // est la contrainte qui commande toute cette page. Cinq colonnes tiennent à 205, les
      // cartes gardent 214 pixels de large, et la rangée de la tuile disparaît : c'est plus
      // de place gagnée que les quelques pixels de largeur cédés.
      gridTemplateColumns: "repeat(auto-fill, minmax(205px, 1fr))",
    }}>
      {objectifs.map(o => <Carte key={o.id} o={o} onModifier={onModifier} />)}

      {onAjouter && (
        <button type="button" onClick={onAjouter}
          style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 5, minHeight: 124, cursor: "pointer",
            borderRadius: RAYONS.sm, border: `1px dashed ${CLAIR.bord}`,
            background: "transparent", color: CLAIR.texteFaible, fontFamily: FONT,
          }}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>+</span>
          <span style={{ fontSize: 11 }}>
            {objectifs.length === 0 ? "Créer un objectif" : "Ajouter un objectif"}
          </span>
        </button>
      )}
    </div>
  );
}
