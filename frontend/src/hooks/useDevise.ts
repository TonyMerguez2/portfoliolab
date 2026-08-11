"use client";
import { useCallback, useEffect, useState } from "react";

import { API_URL as API } from "@/lib/api";
import { compteMemorise, enTetesAuth } from "@/lib/session";

export type Devise = {
  code: string; symbole: string; nom: string;
  decimales: number;
  /** Vrai quand l'affichage dans cette devise implique une conversion de change. */
  conversion: boolean;
  /** Le prix d'un dollar dans cette devise, ou `null` si la paire est indisponible. */
  taux: number | null;
  /** La date du relevé — le marché des changes ferme le week-end. */
  taux_date: string | null;
  /** « 1 $ = 0,8662 € », formulé par le serveur pour que le sens soit lisible. */
  taux_clair: string | null;
};

/**
 * La devise d'affichage du compte, et de quoi la changer.
 *
 * ⚠️ **La liste vient du serveur, pas d'une copie ici.** Elle porte les symboles, le nombre
 * de décimales — le yen n'a pas de centimes — et l'information « implique une conversion ».
 * Recopier tout cela côté client l'aurait fait diverger dès le premier ajout.
 *
 * ⚠️ La préférence est relue depuis `/auth/me` au chargement. Sans cela, elle retomberait
 * sur le dollar à chaque visite alors qu'elle est bien enregistrée.
 */
export function useDevise() {
  const [devises, setDevises] = useState<Devise[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [etat, setEtat] = useState<"charge" | "pret" | "erreur">("charge");
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const liste = await (await fetch(`${API}/api/v1/auth/devises`)).json();
        if (annule) return;
        setDevises(liste.devises ?? []);
        // Le compte connecté, s'il y en a un : la préférence est à lui.
        let choisie: string | null = null;
        if (compteMemorise()) {
          const r = await fetch(`${API}/api/v1/auth/me`, { headers: enTetesAuth() });
          if (r.ok) choisie = (await r.json()).devise ?? null;
        }
        if (annule) return;
        setCode(choisie ?? liste.defaut ?? "USD");
        setEtat("pret");
      } catch {
        if (!annule) setEtat("erreur");
      }
    })();
    return () => { annule = true; };
  }, []);

  /** Enregistre la préférence. Rend `true` si le serveur a accepté. */
  const changer = useCallback(async (nouveau: string): Promise<boolean> => {
    setErreur(null);
    if (!compteMemorise()) {
      // ⚠️ Sans compte, la préférence n'a nulle part où vivre. On le dit plutôt que de la
      // garder en mémoire et de la perdre au rechargement.
      setErreur("Connectez-vous pour enregistrer votre devise d’affichage.");
      return false;
    }
    try {
      const r = await fetch(`${API}/api/v1/auth/profile`, {
        method: "PUT",
        headers: { ...enTetesAuth(), "Content-Type": "application/json" },
        body: JSON.stringify({ devise: nouveau }),
      });
      if (!r.ok) {
        const corps = await r.json().catch(() => null);
        setErreur(corps?.detail ?? `Refus du serveur (${r.status})`);
        return false;
      }
      setCode(nouveau);
      return true;
    } catch {
      setErreur("Serveur injoignable.");
      return false;
    }
  }, []);

  const active = devises.find(d => d.code === code) ?? null;
  return { devises, code, active, etat, erreur, changer };
}
