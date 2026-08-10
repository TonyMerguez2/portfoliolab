"use client";
import { useEffect, useState } from "react";

import type { Impact } from "@/hooks/useAnalyseEvenements";
import { API_URL as API } from "@/lib/api";
import { enTetesAuth } from "@/lib/session";

/**
 * L'impact attendu d'un titre choisi, calculé à la demande.
 *
 * ⚠️ À la demande, et c'est ce qui rend la sélection possible sur un portefeuille
 * d'ETF. L'analyse d'ensemble ne couvre que les lignes détenues en direct — les
 * trois ETF d'un PEA, qui ne publient rien. Les sociétés qui l'exposent réellement
 * sont vues par transparence, et il y en a une trentaine : calculer leurs
 * statistiques d'avance aurait coûté autant d'interrogations — dates de publication
 * et historique de cours pour chacune — dont on n'aurait regardé qu'une.
 *
 * L'exposition est résolue par le serveur, jamais transmise d'ici : la faire passer
 * en paramètre laisserait l'interface dicter le poids qui multiplie la statistique.
 *
 * ⚠️ `null` avec l'état « prêt » est une réponse **valide** : ce titre n'expose pas
 * ce portefeuille, ou ses publications sont trop peu nombreuses pour en tirer une
 * moyenne. L'écran doit le distinguer d'une panne.
 */
export function useImpactTitre(portfolioId?: string, ticker?: string | null): {
  impact: (Impact & { ticker: string }) | null;
  etat: "charge" | "pret" | "erreur";
} {
  const [impact, setImpact] = useState<(Impact & { ticker: string }) | null>(null);
  const [etat, setEtat] = useState<"charge" | "pret" | "erreur">("pret");

  useEffect(() => {
    if (!portfolioId || !ticker) { setImpact(null); setEtat("pret"); return; }
    let annule = false;
    setEtat("charge");
    const url = `${API}/api/v1/portfolios/${portfolioId}/events/impact`
      + `?ticker=${encodeURIComponent(ticker)}`;
    fetch(url, { headers: enTetesAuth() })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { impact: (Impact & { ticker: string }) | null }) => {
        if (annule) return;
        setImpact(d.impact);
        setEtat("pret");
      })
      .catch(() => { if (!annule) setEtat("erreur"); });
    return () => { annule = true; };
  }, [portfolioId, ticker]);

  return { impact, etat };
}
