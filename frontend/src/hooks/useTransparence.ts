"use client";
import { useEffect, useState } from "react";

import { API_URL as API } from "@/lib/api";
import { enTetesAuth } from "@/lib/session";

/**
 * Les publications des sociétés détenues par les fonds du portefeuille.
 *
 * ⚠️ **C'est la seule échéance qu'un ETF puisse avoir.** Il ne publie pas de
 * résultats — ce n'est pas une société — et un ETF capitalisant ne détache jamais
 * de dividende : vérifié sur les trois lignes d'un vrai PEA, dont les noms
 * officiels portent « EUR C » et « Acc ». Sans cette route, ces portefeuilles
 * n'ont aucun événement propre, et l'onglet ne montre que le calendrier
 * économique.
 *
 * ⚠️ **La vue est partielle par construction.** Le fournisseur ne rend que les dix
 * premières positions d'un fonds, quand un ETF S&P 500 en compte cinq cents. Le
 * compte est renvoyé pour que l'écran le dise : sans cela, l'absence d'une société
 * se lirait comme l'absence de sa publication.
 *
 * Route à part parce qu'elle coûte cher — un fonds demande de résoudre son indice,
 * lire la composition chez un ETF physique, puis interroger chaque ligne. La liste
 * des échéances ne l'attend pas : elle s'affiche d'abord, et ces lignes s'y ajoutent.
 */

export type EvenementTransparence = {
  nature: "resultats";
  date: string;
  libelle: string;
  ticker: string;
  moment: string | null;
  jours: number | null;
  montant: number | null;
  devise: string | null;
  rendement: number | null;
  eps_estime: number | null;
  /** Le fonds par lequel cette échéance concerne le portefeuille. */
  via: string;
  /** Part du portefeuille exposée, en pourcentage. */
  exposition: number;
  /** Le nom de la société : « 000660.KS » ne désigne rien, « SK Hynix » si. */
  nom_societe?: string | null;
};

export type Transparence = {
  evenements: EvenementTransparence[];
  fonds_opaques: string[];
  lignes_par_fonds: number;
};

export function useTransparence(portfolioId?: string): {
  donnees: Transparence | null;
  etat: "charge" | "pret" | "erreur";
} {
  const [donnees, setDonnees] = useState<Transparence | null>(null);
  const [etat, setEtat] = useState<"charge" | "pret" | "erreur">("charge");

  useEffect(() => {
    if (!portfolioId) { setEtat("pret"); setDonnees(null); return; }
    let annule = false;
    setEtat("charge");
    fetch(`${API}/api/v1/portfolios/${portfolioId}/events/transparence`, { headers: enTetesAuth() })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Transparence) => { if (!annule) { setDonnees(d); setEtat("pret"); } })
      .catch(() => { if (!annule) setEtat("erreur"); });
    return () => { annule = true; };
  }, [portfolioId]);

  return { donnees, etat };
}
