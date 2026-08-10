"use client";
import { useEffect, useState } from "react";

import { API_URL as API } from "@/lib/api";
import { enTetesAuth } from "@/lib/session";

/**
 * L'historique des publications et l'impact attendu, obtenus **une seule fois**.
 *
 * ⚠️ Ce crochet existe pour qu'il n'y ait qu'un appelant. Les deux panneaux qui
 * s'en servent l'appelaient chacun de son côté, donc la route la plus coûteuse de
 * l'écran partait deux fois — celle qui va chercher, par titre, les publications
 * passées **et** l'historique des cours qui les entoure. C'est le défaut que
 * j'avais justement écarté pour le calendrier, et que j'avais laissé s'installer
 * ici.
 *
 * Deux réponses de la même route peuvent en outre différer d'une échéance selon
 * l'instant : les panneaux se seraient contredits d'un cadre à l'autre.
 */

export type Passe = {
  date: string;
  ticker: string;
  libelle: string;
  moment: string;
  surprise: number | null;
  resultat: string;
  variation: number | null;
  impact_portefeuille: number | null;
};

export type Impact = {
  exposition: number;
  impact_moyen: number;
  probabilite: number;
  seuil: number;
  echantillon: number;
};

export type AnalyseEvenements = {
  passes: Passe[];
  impacts: Record<string, Impact>;
  sans_donnees: string[];
};

export type EtatChargement = "charge" | "pret" | "erreur";

export function useAnalyseEvenements(portfolioId?: string): {
  donnees: AnalyseEvenements | null;
  etat: EtatChargement;
} {
  const [donnees, setDonnees] = useState<AnalyseEvenements | null>(null);
  const [etat, setEtat] = useState<EtatChargement>("charge");

  useEffect(() => {
    if (!portfolioId) { setEtat("pret"); setDonnees(null); return; }
    let annule = false;
    setEtat("charge");
    fetch(`${API}/api/v1/portfolios/${portfolioId}/events/analyse`, { headers: enTetesAuth() })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: AnalyseEvenements) => { if (!annule) { setDonnees(d); setEtat("pret"); } })
      .catch(() => { if (!annule) setEtat("erreur"); });
    return () => { annule = true; };
  }, [portfolioId]);

  return { donnees, etat };
}
