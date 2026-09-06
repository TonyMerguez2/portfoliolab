"use client";
import TitreDeCarte from "@/components/ui/TitreDeCarte";
import { useMemo, useState } from "react";

import { CLAIR, JETONS, RAYONS } from "@/lib/palette";
import { decalerMois, grilleDuMois, JOURS, NOMS_MOIS } from "@/lib/moisCalendrier";
import { FONT, NUM } from "@/lib/typography";

/**
 * Le mois, avec un point par échéance.
 *
 * ⚠️ **Une pastille de légende sans échéance est éteinte, pas masquée.** La masquer
 * ferait apparaître et disparaître des catégories selon le portefeuille ouvert, ce qui
 * se lit comme un bogue ; éteinte, elle dit à la fois qu'elle existe et qu'elle n'a
 * rien à montrer ce mois-ci.
 *
 * Ce commentaire disait jusqu'ici que les publications économiques « n'ont pas encore
 * de source dans le projet ». C'était vrai, ce ne l'est plus : elles viennent du relevé
 * officiel — Fed, BCE, BLS, BEA, Eurostat — et du calendrier du fournisseur. Une
 * documentation périmée sur ce qui est réel ou non est pire qu'aucune.
 *
 * ⚠️ **Rien sous la légende.** Le panneau portait deux mentions de plus, retirées à la
 * demande : voir la note en bas du rendu pour ce qui a été perdu au passage.
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
  evenements, onJour, selection,
}: {
  evenements: { date: string; nature: Nature }[];
  /**
   * Appelé au clic sur un jour qui porte au moins une échéance, avec sa date — ou
   * `null` quand on reclique le jour déjà choisi.
   *
   * ⚠️ Le second clic annule, et cela compte : sans issue, un utilisateur qui a
   * filtré sur une journée n'a aucun moyen de revenir à la liste entière depuis le
   * calendrier, et croit l'avoir cassée.
   */
  onJour?: (iso: string | null) => void;
  /** Le jour retenu, pour le montrer comme tel. */
  selection?: string | null;
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
    // ⚠️ `height: 100%` : sans elle, la racine se dimensionne sur son contenu et le
    // « flex: 1 » de la grille ne partage rien. C'est ce qui fait que les semaines
    // s'étirent jusqu'au bas du panneau au lieu de le déborder.
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0, height: "100%" }}>
      <TitreDeCarte style={{ marginBottom: 0 }} action={
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {fleche(-1)}
          <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: CLAIR.texteSecondaire,
            minWidth: 92, textAlign: "center" }}>
            {NOMS_MOIS[mois]} {annee}
          </span>
          {fleche(1)}
        </div>
      }>Calendrier</TitreDeCarte>

      {/* ⚠️ L'en-tête des jours est sorti de la grille des cases. Les deux ne
          partageaient qu'une seule grille, donc une seule règle de hauteur : impossible
          de faire grandir les semaines sans étirer aussi la ligne « Lun Mar Mer ». */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2,
        flexShrink: 0 }}>
        {JOURS.map(j => (
          <div key={j} style={{
            fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
            color: CLAIR.texteFaible, textAlign: "center", paddingBottom: 2,
          }}>{j}</div>
        ))}
      </div>

      {/* ⚠️ **Les six semaines se partagent la place disponible** au lieu de mesurer
          30 pixels chacune. Avec une hauteur fixe, la grille réclamait environ 319
          pixels — six rangées, l'en-tête, la légende et les écarts — et le panneau en
          offrait moins sur un écran moins haut : d'où une barre de défilement pour un
          calendrier, ce qui n'a pas de sens puisqu'un mois se lit d'un coup d'œil.
          `minmax(22px, 1fr)` laisse les rangées se serrer jusqu'à un plancher lisible
          et s'étirer quand la place existe, à toute hauteur de fenêtre. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2,
        gridAutoRows: "minmax(22px, 1fr)", flex: 1, minHeight: 0 }}>
        {grille.map(c => {
          const natures = parJour.get(c.iso);
          const estAujourdhui = c.iso === aujourdhui;
          const choisi = c.iso === selection;
          const cliquable = !!natures && !!onJour;
          /**
           * ⚠️ Le jour choisi et le jour courant ne se peignent pas pareil.
           *
           * Le courant est un aplat, la sélection un cerne. Leur donner le même
           * fond aurait rendu impossible de voir qu'on a filtré sur aujourd'hui —
           * le cas le plus fréquent.
           */
          return (
            <div key={c.iso}
              onClick={cliquable ? () => onJour!(choisi ? null : c.iso) : undefined}
              aria-label={cliquable
                ? (choisi ? "Cliquer pour voir toutes les échéances"
                          : "Ne voir que les échéances de ce jour")
                : undefined}
              style={{
                // ⚠️ Plus de hauteur fixe : c'est la rangée de la grille qui la donne,
                // et toutes les rangées ont la même — la case ne respire donc pas plus
                // selon les jours chargés, ce que la hauteur fixe servait à empêcher.
                // Elle reste garantie lisible par le plancher de `minmax(22px, 1fr)`.
                borderRadius: RAYONS.xs, boxSizing: "border-box",
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", gap: 2,
                cursor: cliquable ? "pointer" : "default",
                background: estAujourdhui ? JETONS.accent
                  : choisi ? JETONS.accentVoile : "transparent",
                border: choisi && !estAujourdhui
                  ? `1px solid ${JETONS.accent}` : "1px solid transparent",
                boxShadow: choisi && estAujourdhui ? `0 0 0 2px ${JETONS.accent}66` : "none",
                color: estAujourdhui ? "#FFFFFF"
                  : c.duMois ? CLAIR.texteSecondaire : CLAIR.texteFaible,
                // Les jours empruntés aux mois voisins restent lisibles mais
                // s'effacent : les masquer casserait l'alignement des semaines.
                opacity: c.duMois ? 1 : 0.35,
                // Une case porteuse d'échéance se signale même sans survol : sans
                // cela, rien n'indique qu'on peut cliquer.
                fontWeight: natures ? 700 : 400,
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

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", flexShrink: 0 }}>
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

      {/* ⚠️ **Rien d'autre sous la légende, et deux mentions ont été retirées d'ici.**
          Le panneau en portait trop, et un panneau qu'on cesse de lire ne protège de
          rien. Ce qui est parti, et où l'information subsiste ou non :

          - le rappel du jour filtré, quand la sélection sortait du mois affiché. La
            liste voisine porte déjà une pastille qui nomme ce jour avec une croix pour
            le relâcher : seul le raccourci « revenir à ce mois » est perdu ;
          - l'aveu d'incomplétude du calendrier macroéconomique, qui disait jusqu'à
            quelle date les organismes ont publié leurs dates. Celle-là n'a **plus
            aucun équivalent à l'écran** : passé le 11 septembre 2026, un mois sans
            point se lit désormais comme un mois sans échéance, alors que c'est un mois
            que les sources n'ont pas encore annoncé. Le serveur continue de rendre
            `peremption_macro` ; il suffira de le remettre ailleurs si le silence gêne. */}
    </div>
  );
}
