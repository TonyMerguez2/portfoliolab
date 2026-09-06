/**
 * Le nom complet d'un actif, quel que soit l'endroit d'où il vient.
 *
 * ⚠️ **Le catalogue local ne suffit pas, et ça se voyait sur trois cartes.** `assetName` ne lit
 * que `TRENDING`, cent soixante et un actifs choisis à la main. Un portefeuille réel contient
 * autre chose : `ETZ.PA` et `PAEJ.PA` — deux lignes d'un vrai PEA — n'y sont pas, et leurs cartes
 * n'affichaient donc **rien** sous le ticker pendant que leur voisine `ESE.PA` portait son
 * intitulé. Trois cartes côte à côte, deux muettes.
 *
 * ⚠️ **On complète le catalogue, on ne le remplace pas.** Le nom local est rendu
 * **immédiatement**, sans attendre le réseau : c'est le cas de la grande majorité des actifs, et
 * un intitulé qui apparaît une seconde après la carte se lit comme un défaut. Le serveur n'est
 * interrogé que pour ce que le catalogue ignore.
 *
 * ⚠️ **Une seconde table écrite à la main aurait vieilli en silence.** C'était la solution
 * courte : ajouter ces deux lignes à `TRENDING`. Mais le prochain portefeuille apporterait deux
 * autres tickers, et rien ne le signalerait — la carte serait simplement muette, comme
 * aujourd'hui. Demander au serveur vaut pour n'importe quel ticker, y compris ceux qui n'existent
 * pas encore.
 */

import { assetName } from "./assets";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Les noms obtenus du serveur, et les demandes en cours.
 *
 * ⚠️ **`null` est une réponse rangée, pas une absence.** Un ticker que le serveur ne connaît pas
 * doit cesser d'être redemandé ; sans cette distinction, chaque rendu relancerait la même requête
 * vouée au même échec — et les cartes se redessinent au fil des cours.
 *
 * ⚠️ **Les demandes en cours sont mémorisées, sinon trois cartes du même actif font trois
 * requêtes.** La page du portefeuille rend la même ligne à plusieurs endroits — carte, tableau,
 * répartition. Sans ce registre, chacun tirerait sa propre requête pour le même nom.
 */
const _noms = new Map<string, string | null>();
const _enCours = new Map<string, Promise<void>>();
const _abonnes = new Set<() => void>();

/** Le nom connu **sans attendre** : le catalogue local, puis ce que le serveur a déjà rendu. */
export function nomConnu(ticker: string): string | null {
  return assetName(ticker) ?? _noms.get(ticker) ?? null;
}

/** S'abonne aux noms qui arrivent. Rend la fonction de désabonnement. */
export function surNouveauNom(rappel: () => void): () => void {
  _abonnes.add(rappel);
  return () => { _abonnes.delete(rappel); };
}

/**
 * Demande au serveur le nom d'un ticker que le catalogue ignore.
 *
 * ⚠️ **On passe par la recherche, qui rend déjà l'intitulé complet.** Vérifié sur `ETZ.PA` :
 * « BNP Paribas Easy Stoxx Europe 600 UCITS ETF EUR C ». La fiche `/quote` ne porte pas de nom,
 * et `/ticker` en rendrait bien plus que ce qu'on demande.
 *
 * ⚠️ **On retient la correspondance **exacte**, jamais le premier résultat.** Une recherche sur
 * `ETZ.PA` peut rendre d'autres lignes du même émetteur ; prendre la première collerait le nom
 * d'un fonds voisin sur la carte, ce qui est pire que pas de nom du tout.
 */
export function demanderNom(ticker: string): void {
  if (!ticker || nomConnu(ticker) !== null || _noms.has(ticker) || _enCours.has(ticker)) return;
  const promesse = (async () => {
    try {
      const r = await fetch(`${API_URL}/api/v1/search?q=${encodeURIComponent(ticker)}`);
      const d = await r.json();
      const exact = (d?.results || []).find((x: { ticker?: string }) => x?.ticker === ticker);
      _noms.set(ticker, exact?.name ?? null);
    } catch {
      _noms.set(ticker, null);
    } finally {
      _enCours.delete(ticker);
      _abonnes.forEach(f => f());
    }
  })();
  _enCours.set(ticker, promesse);
}
