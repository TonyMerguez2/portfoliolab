"use client";
import { useCallback } from "react";
import { Bell, Cross } from "@appica/icons-react";
import { Button } from "@appica/ui-react/button";
import { Popover, PopoverContent, PopoverTrigger } from "@appica/ui-react/popover";
import { useToastManager } from "@appica/ui-react/toast";

import { useAlertesMacro, useAnnonceDesAlertes, type AlerteMacro } from "@/hooks/useAlertesMacro";
import DrapeauPays from "@/components/DrapeauPays";
import { useApp } from "@/lib/AppContext";
import { JETONS, RAYONS } from "@/lib/palette";
import { FONT } from "@/lib/typography";

/**
 * Les alertes macroéconomiques : un toast à l'arrivée, une liste ensuite.
 *
 * ⚠️ **Le toast annonce, la liste conserve — et c'est la seule répartition tenable.** Une
 * alerte qui reste à l'écran jusqu'à sa suppression paraît la demande la plus simple ;
 * elle veut dire qu'au cinquième chargement de page, cinq échéances non écartées se
 * réempilent dans le coin. Le toast dit donc « voici du neuf » une fois — le serveur
 * décide de ce qui est neuf, voir `useAlertesMacro` — et c'est la liste qui porte la
 * persistance, jusqu'à ce qu'on écarte la ligne.
 *
 * ⚠️ **Rien ici n'invente d'alerte.** Ce sont les échéances du calendrier macro, filtrées
 * sur les zones que les tickers du portefeuille rendent pertinentes. Pas de seuil, pas de
 * signal, pas de « votre portefeuille risque » : une date, un libellé, une zone.
 */

/** Dans combien de temps, en clair. */
function echeance(jours: number | null): string {
  if (jours == null) return "";
  if (jours === 0) return "aujourd’hui";
  if (jours === 1) return "demain";
  return `dans ${jours} jours`;
}

function Ligne({ a, onSupprimer }: { a: AlerteMacro; onSupprimer: (cle: string) => void }) {
  return (
    <li style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 4px",
                 borderBottom: `1px solid ${JETONS.bord}` }}>
      {/* ⚠️ **Le composant maison, et non une balise `<img>` à nous.** `DrapeauPays` est le
          seul point de rendu d'un drapeau du site : c'est lui qui porte le garde des codes
          inconnus — sans quoi un code absent affiche une image cassée à la place, ou lève
          sur un `null`. Il rend `null` quand la zone n'est pas un pays, ce qui est
          exactement le cas de « eu ». */}
      {a.pays && <DrapeauPays pays={a.pays} taille={16} />}
      <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0, flex: 1 }}>
        <span style={{ fontFamily: FONT, fontSize: 12, color: JETONS.texte }}>{a.libelle}</span>
        <span style={{ fontFamily: FONT, fontSize: 10.5, color: JETONS.texteFaible }}>
          {echeance(a.jours)}
          {/* ⚠️ L'origine est dite, parce que les deux n'ont pas la même garantie : le
              relevé vient d'une page officielle, le flux tient quatre semaines et ses
              dates sont parfois indicatives. */}
          {a.source ? ` · ${a.source}` : ""}
        </span>
      </span>
      <Button size="icon-sm" variant="ghost" aria-label={`Écarter « ${a.libelle} »`}
        onClick={() => onSupprimer(a.cle)}>
        <Cross />
      </Button>
    </li>
  );
}

export default function AlertesMacro() {
  const { activePortfolio } = useApp();
  const { alertes, marquerVues, supprimer } = useAlertesMacro(activePortfolio ? String(activePortfolio.id) : null);
  const toast = useToastManager();

  const annoncer = useCallback((a: AlerteMacro) => {
    toast.add({
      title: a.libelle,
      description: `Échéance ${echeance(a.jours)}.`,
    });
  }, [toast]);

  useAnnonceDesAlertes(alertes, marquerVues, annoncer);

  /* ⚠️ Pas de cloche quand il n'y a rien à dire. Un compteur à zéro en permanence
     apprend à ne plus le regarder. */
  if (alertes.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button size="icon-md" variant="outline"
            aria-label={`${alertes.length} alerte${alertes.length > 1 ? "s" : ""} macroéconomique${alertes.length > 1 ? "s" : ""}`}>
            <span style={{ position: "relative", display: "inline-flex" }}>
              <Bell />
              <span aria-hidden="true" style={{
                position: "absolute", top: -3, right: -4,
                minWidth: 14, height: 14, padding: "0 3px",
                borderRadius: RAYONS.plein, background: JETONS.accent,
                color: "#FFFFFF", fontFamily: FONT, fontSize: 9, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {alertes.length}
              </span>
            </span>
          </Button>
        }
      />
      <PopoverContent style={{ width: 320, padding: "6px 12px 10px" }}>
        <p style={{ margin: "6px 0 2px", fontFamily: FONT, fontSize: 10.5,
                    letterSpacing: "0.06em", textTransform: "uppercase",
                    color: JETONS.texteFaible }}>
          Échéances macroéconomiques
        </p>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", maxHeight: 320,
                     overflowY: "auto" }}>
          {alertes.map(a => <Ligne key={a.cle} a={a} onSupprimer={supprimer} />)}
        </ul>
        <p style={{ margin: "9px 0 0", fontFamily: FONT, fontSize: 9.5, lineHeight: 1.5,
                    color: JETONS.texteFaible }}>
          Les zones affichées sont déduites des titres détenus. Écarter une échéance la
          retire définitivement, sur tous vos appareils.
        </p>
      </PopoverContent>
    </Popover>
  );
}
