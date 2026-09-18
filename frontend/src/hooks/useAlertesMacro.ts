"use client";
import { useCallback, useEffect, useRef, useState } from "react";

import { API_URL as API } from "@/lib/api";
import { recuperer } from "@/lib/requete";
import { enTetesAuth } from "@/lib/session";

/** Une échéance macro qui concerne le portefeuille, telle que le serveur la rend. */
export type AlerteMacro = {
  cle: string;
  /** « economique » pour une échéance du calendrier, « performance » pour une ligne du jour. */
  nature?: "economique" | "performance";
  date: string;
  libelle: string;
  /** La variation en clair, pour les seules alertes de performance : « +3,10 % aujourd’hui ». */
  detail?: string | null;
  /** La variation du jour, en pourcentage, quand l'alerte en porte une. */
  variation?: number | null;
  /** Jours d'ici là. Zéro le jour même. */
  jours: number | null;
  /** Code de zone à deux lettres — « us », « eu » — pour le drapeau. */
  pays: string | null;
  /** « relevé » ou « flux » : les deux n'ont pas la même garantie. */
  source: string | null;
  /** Vraie tant que l'alerte n'a pas été annoncée à l'écran. */
  nouvelle: boolean;
};

/**
 * Les alertes macroéconomiques du portefeuille actif.
 *
 * ⚠️ **Le serveur décide de ce qui est neuf, pas l'écran.** Le drapeau `nouvelle` vient
 * de la base : c'est lui qui dit si le toast doit se lever. Le tenir côté navigateur
 * aurait fait réannoncer toutes les alertes sur un autre appareil, et perdre la mémoire à
 * chaque vidage de cache — alors que la suppression, elle, est déjà rangée dans le compte.
 *
 * ⚠️ **Annoncer, puis marquer — jamais l'inverse.** Marquer d'abord et laisser le toast
 * échouer perdrait l'alerte sans l'avoir montrée. Dans l'autre sens, un marquage qui
 * échoue fait au pire réannoncer une fois de plus.
 */
export function useAlertesMacro(portfolioId?: string | null) {
  const [alertes, setAlertes] = useState<AlerteMacro[]>([]);
  const [etat, setEtat] = useState<"charge" | "pret" | "erreur">("pret");

  const charger = useCallback(async () => {
    if (!portfolioId) { setAlertes([]); return; }
    setEtat("charge");
    try {
      const r = await recuperer(`${API}/api/v1/portfolios/${portfolioId}/alertes`,
        { headers: enTetesAuth() });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { alertes?: AlerteMacro[] };
      setAlertes(Array.isArray(d.alertes) ? d.alertes : []);
      setEtat("pret");
    } catch {
      /* ⚠️ Une alerte absente n'est pas une panne à afficher : le reste de la page vaut
         mieux qu'un bandeau d'erreur pour un complément d'information. */
      setAlertes([]);
      setEtat("erreur");
    }
  }, [portfolioId]);

  useEffect(() => { void charger(); }, [charger]);

  const marquerVues = useCallback(async (cles: string[]) => {
    if (cles.length === 0) return;
    setAlertes(a => a.map(x => (cles.includes(x.cle) ? { ...x, nouvelle: false } : x)));
    try {
      await recuperer(`${API}/api/v1/alertes/vues`, {
        method: "POST",
        headers: { ...enTetesAuth(), "Content-Type": "application/json" },
        body: JSON.stringify({ cles }),
      });
    } catch { /* réannoncé une fois de plus au pire — voir l'avertissement du module */ }
  }, []);

  const supprimer = useCallback(async (cle: string) => {
    /* ⚠️ Retirée de l'écran avant la réponse : c'est un geste de rangement, et attendre
       le serveur pour voir disparaître ce qu'on vient d'écarter se lit comme un blocage.
       Un échec la fera revenir au prochain chargement, ce qui est le bon repli. */
    setAlertes(a => a.filter(x => x.cle !== cle));
    try {
      await recuperer(`${API}/api/v1/alertes/${encodeURIComponent(cle)}`,
        { method: "DELETE", headers: enTetesAuth() });
    } catch { /* voir ci-dessus */ }
  }, []);

  return { alertes, etat, marquerVues, supprimer, recharger: charger };
}

/**
 * Lève un toast pour chaque alerte neuve, une seule fois.
 *
 * ⚠️ **Le garde-fou local existe en plus de celui du serveur.** `nouvelle` ne repasse à
 * faux qu'après l'aller-retour ; sans cette mémoire de session, un rendu intermédiaire
 * relèverait le même toast une seconde fois avant la réponse.
 */
export function useAnnonceDesAlertes(
  alertes: AlerteMacro[],
  marquerVues: (cles: string[]) => void,
  annoncer: (a: AlerteMacro) => void,
) {
  const dejaAnnoncees = useRef<Set<string>>(new Set());

  useEffect(() => {
    const neuves = alertes.filter(a => a.nouvelle && !dejaAnnoncees.current.has(a.cle));
    if (neuves.length === 0) return;
    neuves.forEach(a => {
      dejaAnnoncees.current.add(a.cle);
      annoncer(a);
    });
    marquerVues(neuves.map(a => a.cle));
  }, [alertes, marquerVues, annoncer]);
}
