"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Cours crypto poussés en direct, pour plusieurs lignes à la fois.
 *
 * La page graphique ouvrait déjà un flux Binance, mais pour un seul actif. Le
 * tableau de bord en suit plusieurs : Binance accepte un flux combiné, donc
 * une seule connexion suffit quel qu'en soit le nombre.
 *
 * Ne rend que le **prix**. Le flux porte aussi la variation, mais sur 24 h
 * seulement ; l'écraser ferait afficher la variation du jour sous une carte
 * réglée sur « 1 mois ». La variation continue donc de venir du sondage.
 */

/** Les paires cotées ailleurs qu'en dollar n'existent pas telles quelles chez
 *  Binance. On suit la paire en dollar — la conversion est une autre affaire,
 *  et elle vaut pour l'ensemble du site, pas pour ce flux. */
const PAIRE = /^([A-Z0-9]+)-(USD|USDT|EUR)$/i;

export function symboleBinance(ticker: string): string | null {
  const m = PAIRE.exec(ticker);
  return m ? `${m[1].toLowerCase()}usdt` : null;
}

/**
 * Un rendu au plus toutes les 700 ms.
 *
 * Binance pousse plusieurs messages par seconde et par paire. Rendre à chaque
 * message ferait travailler la page en continu pour des variations qu'aucun
 * œil ne suit — et le clignotement, qui dure 900 ms, n'aurait jamais le temps
 * de s'éteindre entre deux.
 */
const PALIER_MS = 700;

export function useCoursCrypto(tickers: string[]): Record<string, number> {
  const [prix, setPrix] = useState<Record<string, number>>({});
  // La liste change d'identité à chaque rendu du parent sans changer de
  // contenu : sans cette clé, la connexion serait refaite en boucle.
  const cle = tickers.slice().sort().join(",");
  const enAttente = useRef<Record<string, number>>({});

  useEffect(() => {
    const suivis = cle ? cle.split(",") : [];
    const paires = suivis
      .map(t => ({ ticker: t, flux: symboleBinance(t) }))
      .filter((x): x is { ticker: string; flux: string } => x.flux !== null);
    if (!paires.length) return;

    const parFlux = new Map(paires.map(p => [p.flux, p.ticker]));
    const ws = new WebSocket(
      "wss://stream.binance.com:9443/stream?streams="
      + paires.map(p => `${p.flux}@ticker`).join("/"),
    );

    let minuteur: ReturnType<typeof setTimeout> | null = null;
    const vider = () => {
      minuteur = null;
      const lot = enAttente.current;
      enAttente.current = {};
      if (Object.keys(lot).length) setPrix(p => ({ ...p, ...lot }));
    };

    ws.onmessage = e => {
      try {
        const { data } = JSON.parse(e.data);
        const ticker = parFlux.get(String(data?.s ?? "").toLowerCase());
        const p = parseFloat(data?.c);
        if (!ticker || !(p > 0)) return;
        enAttente.current[ticker] = p;
        if (!minuteur) minuteur = setTimeout(vider, PALIER_MS);
      } catch { /* message illisible : on garde le dernier prix connu */ }
    };
    // Un flux muet vaut mieux qu'une page cassée : à défaut, le sondage
    // continue de fournir des prix, simplement moins souvent.
    ws.onerror = () => ws.close();

    return () => {
      if (minuteur) clearTimeout(minuteur);
      enAttente.current = {};
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
    };
  }, [cle]);

  return prix;
}
