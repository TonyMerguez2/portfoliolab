"use client";
import { recuperer } from "@/lib/requete";
import { useCallback, useEffect, useState } from "react";

import { API_URL as API } from "@/lib/api";
import type { Genre, Objectif } from "@/lib/objectifs";
import { enTetesAuth } from "@/lib/session";

/** Ce que le formulaire envoie, et ce que la route valide. */
export type Saisie = {
  nom: string;
  genre: Genre;
  cible: number;
  echeance_annee?: number | null;
  age_cible?: number | null;
  part_affectee?: number | null;
  versement_mensuel?: number | null;
  /** `null` veut dire « reprends la mesure des transactions », non « zéro ». */
  verse_deja?: number | null;
  taux_attendu?: number | null;
  inflation?: number | null;
  taux_retrait?: number | null;
  couleur?: string | null;
};

export type Reponse = {
  objectifs: Objectif[];
  valeur_portefeuille: number | null;
  source_valeur: string;
  lignes_valorisees: number;
  lignes_totales: number;
  somme_des_parts: number;
  annee_naissance_connue: boolean;
};

/**
 * Les objectifs d'un portefeuille, avec de quoi les modifier.
 *
 * ⚠️ **Un seul point d'appel, et il recharge après chaque écriture.** L'avancement de
 * *tous* les objectifs dépend de la même valeur de portefeuille et de la somme des
 * parts affectées : créer un objectif à 40 % change ce que les autres représentent.
 * Mettre à jour la seule carte modifiée aurait laissé les voisines mentir jusqu'au
 * prochain rechargement.
 *
 * ⚠️ Le message d'erreur du serveur est conservé tel quel. Les refus de saisie sont
 * précis — « taux_attendu : 120 est hors de -20 à 30 » — et les remplacer par « une
 * erreur est survenue » obligerait l'épargnant à deviner ce qu'il a mal tapé.
 */
export function useObjectifs(portfolioId?: string) {
  const [donnees, setDonnees] = useState<Reponse | null>(null);
  const [etat, setEtat] = useState<"charge" | "pret" | "erreur">("charge");
  const [erreurEcriture, setErreurEcriture] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!portfolioId) { setEtat("pret"); setDonnees(null); return; }
    setEtat("charge");
    try {
      const r = await recuperer(`${API}/api/v1/portfolios/${portfolioId}/objectifs`,
        { headers: enTetesAuth() });
      if (!r.ok) throw new Error(String(r.status));
      setDonnees(await r.json());
      setEtat("pret");
    } catch {
      setEtat("erreur");
    }
  }, [portfolioId]);

  useEffect(() => { void charger(); }, [charger]);

  /** Rend `true` quand l'écriture a abouti ; sinon `erreurEcriture` porte la raison. */
  const ecrire = useCallback(async (
    methode: "POST" | "PUT" | "DELETE", saisie?: Saisie, id?: string,
  ): Promise<boolean> => {
    if (!portfolioId) return false;
    setErreurEcriture(null);
    const base = `${API}/api/v1/portfolios/${portfolioId}/objectifs`;
    try {
      const r = await fetch(id ? `${base}/${id}` : base, {
        method: methode,
        headers: { ...enTetesAuth(), "Content-Type": "application/json" },
        body: saisie ? JSON.stringify(saisie) : undefined,
      });
      if (!r.ok) {
        const corps = await r.json().catch(() => null);
        setErreurEcriture(corps?.detail ?? `Refus du serveur (${r.status})`);
        return false;
      }
      await charger();
      return true;
    } catch {
      setErreurEcriture("Serveur injoignable.");
      return false;
    }
  }, [portfolioId, charger]);

  return {
    donnees, etat, erreurEcriture,
    creer: (s: Saisie) => ecrire("POST", s),
    modifier: (id: string, s: Saisie) => ecrire("PUT", s, id),
    supprimer: (id: string) => ecrire("DELETE", undefined, id),
    recharger: charger,
  };
}
