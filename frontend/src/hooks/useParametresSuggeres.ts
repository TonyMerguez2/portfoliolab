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
  periode_mesuree: {
    debut: string; fin: string; seances: number; couverture: number;
    sans_historique: string[];
  } | null;
  inflation: { valeur: number; source: string };
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
