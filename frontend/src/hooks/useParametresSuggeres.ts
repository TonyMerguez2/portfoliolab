"use client";
import { useEffect, useState } from "react";

import { API_URL as API } from "@/lib/api";
import { enTetesAuth } from "@/lib/session";

export type ParametresSuggeres = {
  versement: {
    par_mois: number | null; net: number; mois: number; operations: number;
    concentration: number;
    /** Vrai quand ce rythme ne décrit pas une habitude — un apport unique, par exemple. */
    trompeur: boolean;
  } | null;
  /**
   * Le passé de l'allocation, **montré et jamais pré-rempli**.
   *
   * ⚠️ Mesuré sur un vrai portefeuille : 18,63 % par an sur trois ans, 13,17 % sur dix.
   * Exact, et décrivant une décennie exceptionnelle. Le glisser dans le champ rendrait
   * chaque projection délirante, et l'épargnant y croirait parce que le chiffre vient de
   * ses données.
   */
  rendements_passes: { annees: number; rendement: number; volatilite: number }[];
  /**
   * Le rendement à long terme de grandes classes d'actifs.
   *
   * ⚠️ **Celles-ci peuvent être proposées, contrairement aux précédentes.** Elles portent
   * sur des fenêtres de dix-huit à trente-trois ans, qui contiennent 2000, 2008 et 2020,
   * et sur des classes d'actifs — non sur les dix ans d'un portefeuille particulier. C'est
   * la différence entre un ordre de grandeur et une extrapolation.
   *
   * ⚠️ Libellées en dollars : un épargnant en euros a touché autre chose selon le change.
   */
  references_longues: {
    ticker: string; libelle: string; rendement: number; annees: number;
    depuis: string; proposee: boolean;
  }[];
  periode_mesuree: {
    debut: string; fin: string; seances: number; couverture: number;
    sans_historique: string[];
  } | null;
  /**
   * Deux valeurs, volontairement.
   *
   * ⚠️ `valeur` est la **cible** de la BCE, 2 % ; `observee` est le dernier niveau
   * **constaté** — 2,9 % en juillet 2026 selon Eurostat, 2,5 % hors énergie et
   * alimentation. Sur vingt-quatre ans, un million d'euros vaut 622 000 € d'aujourd'hui
   * à 2 % et 504 000 à 2,9 %. N'en montrer qu'une serait trompeur.
   */
  inflation: {
    valeur: number; source: string;
    observee: number; observee_coeur: number;
    observee_mois: string; observee_source: string;
  };
};

/** Ce que le portefeuille permet de proposer pour préparer un objectif. */
export function useParametresSuggeres(portfolioId?: string) {
  const [suggestions, setSuggestions] = useState<ParametresSuggeres | null>(null);

  useEffect(() => {
    if (!portfolioId) { setSuggestions(null); return; }
    let annule = false;
    fetch(`${API}/api/v1/portfolios/${portfolioId}/objectifs/parametres`,
      { headers: enTetesAuth() })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!annule && d) setSuggestions(d); })
      .catch(() => { /* Sans suggestion, le formulaire reste saisissable à la main. */ });
    return () => { annule = true; };
  }, [portfolioId]);

  return suggestions;
}
