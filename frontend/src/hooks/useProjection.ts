"use client";
import { useEffect, useState } from "react";

import { API_URL as API } from "@/lib/api";
import type { Objectif } from "@/lib/objectifs";
import { enTetesAuth } from "@/lib/session";

/** La réponse de la route de projection, refus compris. */
export type Projection =
  | { possible: false; raison: "valeur_inconnue" | "sans_echeance" | "sans_rendement_attendu";
      objectif: Objectif }
  | {
      possible: true;
      objectif: Objectif;
      mois: number[];
      enveloppes: Record<string, number[]>;
      mediane: number | null;
      intervalle: [number, number] | null;
      niveau_intervalle: number;
      probabilite: number | null;
      taux_implicites: Record<string, number>;
      requis: number | null;
      volatilite: number | null;
      volatilite_source: "mesuree" | "echantillon_court" | "indisponible";
      seances_mesurees: number;
      seances_minimales: number;
      valeur_portefeuille: number | null;
      source_valeur: string;
    };

/**
 * La projection d'un objectif.
 *
 * ⚠️ Route à part, et appelée seulement quand un objectif est choisi : elle télécharge
 * l'historique des cours pour mesurer la volatilité du portefeuille. La joindre à la
 * liste des objectifs aurait rendu l'onglet aussi lent que son calcul le plus lourd — le
 * défaut déjà corrigé sur les événements.
 */
export function useProjection(portfolioId?: string, objectifId?: string | null) {
  const [projection, setProjection] = useState<Projection | null>(null);
  const [etat, setEtat] = useState<"charge" | "pret" | "erreur">("pret");

  useEffect(() => {
    if (!portfolioId || !objectifId) { setProjection(null); setEtat("pret"); return; }
    let annule = false;
    setEtat("charge");
    fetch(`${API}/api/v1/portfolios/${portfolioId}/objectifs/${objectifId}/projection`,
      { headers: enTetesAuth() })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Projection) => { if (!annule) { setProjection(d); setEtat("pret"); } })
      .catch(() => { if (!annule) setEtat("erreur"); });
    return () => { annule = true; };
  }, [portfolioId, objectifId]);

  return { projection, etat };
}
