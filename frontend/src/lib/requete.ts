import { fermerSession } from "@/lib/session";

/**
 * Un `fetch` qui ne pose jamais deux fois la même question en même temps.
 *
 * ⚠️ **Écrit contre une mesure, pas contre une intuition.** Un chargement de la vue générale
 * sur le site en ligne partait en trente-quatre appels d'API, dont une bonne dizaine étaient
 * des doublons stricts : `portfolios` demandé quatre fois, `transactions` trois fois,
 * `positions`, `comptes`, `events`, `events/transparence` et `prices` deux fois chacun — et
 * même deux `history?period=max` à neuf millisecondes d'écart. Chacun rallongeait tous les
 * autres, puisqu'ils se partagent un serveur.
 *
 * ⚠️ **Le défaut n'est pas de la négligence, il est structurel.** Les composants d'une même
 * page demandent les mêmes données sans se connaître — le bandeau et les cartes veulent tous
 * deux les positions, la vue générale et le graphique tous deux les transactions. Les faire
 * dialoguer aurait voulu dire remonter l'état jusqu'à un ancêtre commun, donc réécrire la
 * page. Mutualiser au niveau du transport les laisse ignorants les uns des autres.
 *
 * Deux mécanismes, et ils ne font pas la même chose :
 *
 * — **Le partage des vols en cours.** Deux appels identiques lancés avant que le premier soit
 *   rendu partagent une seule requête réseau. C'est ce qui absorbe les doublons du chargement,
 *   où tout part dans la même poignée de millisecondes.
 *
 * — **Une mémoire très courte**, `FRAICHEUR`. Elle rattrape les doublons décalés — un composant
 *   monté un peu après les autres — sans jamais garder de données assez longtemps pour montrer
 *   un cours périmé.
 *
 * ⚠️ **Les GET seulement.** Mutualiser une écriture reviendrait à en perdre une : deux
 * enregistrements identiques envoyés coup sur coup sont deux intentions, pas une.
 */

/**
 * Combien de temps une réponse **déjà rendue** peut resservir.
 *
 * ⚠️ Trois secondes, et surtout pas davantage : au-delà, un cours ou un solde qu'on vient de
 * modifier pourrait se relire périmé. Le partage des appels *en vol*, lui, n'a pas de durée —
 * voir ci-dessous.
 */
const GRACE = 3000;

type Entree = { promesse: Promise<Response>; rendue: number | null };

const enCours = new Map<string, Entree>();

/**
 * La clé d'un appel : sa méthode, son adresse, et le jeton qui l'accompagne.
 *
 * ⚠️ Le jeton en fait partie, sans quoi la réponse destinée à un compte pourrait resservir à
 * un autre — sur un même navigateur, au moment d'une déconnexion suivie d'une reconnexion.
 */
function cle(url: string, init?: RequestInit): string {
  const entetes = new Headers(init?.headers);
  return `${init?.method ?? "GET"} ${url} ${entetes.get("Authorization") ?? ""}`;
}

/**
 * L'évènement qui annonce une session expirée. `SideNav` l'écoute et ouvre la connexion.
 *
 * ⚠️ **Un évènement plutôt qu'une redirection, parce que ce fichier ne sait pas où il
 * tourne.** Il est importé par des pages, des composants et des tests ; y appeler un routeur
 * l'attacherait à Next, et `window.location` ferait perdre la page en cours. L'évènement
 * laisse l'interface décider — ici, une fenêtre de connexion par-dessus la page, d'où l'on
 * revient à l'endroit d'où l'on vient.
 */
export const SESSION_EXPIREE = "novac:session-expiree";

/**
 * Une réponse 401 dit-elle que la session est finie ?
 *
 * ⚠️ **Trois conditions, et aucune n'est de trop.** Il faut que l'appel ait porté un jeton —
 * sans quoi un 401 sur une route publique consultée hors session effacerait ce qu'il n'y a
 * pas ; il faut que ce ne soit pas la porte de l'alpha, qui répond 401 elle aussi et le dit
 * par son en-tête ; et il faut exclure la route de connexion elle-même, dont le 401 signifie
 * « mauvais mot de passe » et refermerait la fenêtre qu'on vient d'ouvrir.
 */
function sessionFinie(url: string, init: RequestInit | undefined, r: Response): boolean {
  if (r.status !== 401) return false;
  if (r.headers.get("x-novac-porte") === "fermee") return false;
  if (/\/auth\/(login|register)\b/.test(url)) return false;
  return new Headers(init?.headers).has("Authorization");
}

/**
 * Efface la session et l'annonce, une fois pour toute une rafale.
 *
 * ⚠️ **Le garde-fou n'est pas cosmétique : une page en lance quinze d'un coup.** Le tableau
 * de bord demande portefeuilles, positions, comptes, transactions, objectifs, évènements…
 * dans la même poignée de millisecondes. Sans lui, un jeton périmé faisait quinze effacements
 * et quinze ouvertures de la fenêtre de connexion.
 */
let annonceFaite = false;
function annoncerSessionFinie(): void {
  /* ⚠️ Ce module sert aussi au rendu serveur, où il n'y a ni `window` ni stockage : un 401
     y est un fait de transport, pas une session à fermer. */
  if (typeof window === "undefined") return;
  if (annonceFaite) return;
  annonceFaite = true;
  fermerSession();
  window.dispatchEvent(new Event(SESSION_EXPIREE));
}

/** Après une reconnexion, la prochaine expiration doit pouvoir s'annoncer à son tour. */
export function rearmerSession(): void { annonceFaite = false; }

function surveiller(url: string, init: RequestInit | undefined, p: Promise<Response>): Promise<Response> {
  return p.then(r => { if (sessionFinie(url, init, r)) annoncerSessionFinie(); return r; });
}

export function recuperer(url: string, init?: RequestInit): Promise<Response> {
  const methode = (init?.method ?? "GET").toUpperCase();
  if (methode !== "GET") return surveiller(url, init, fetch(url, init));

  const k = cle(url, init);
  const deja = enCours.get(k);

  /**
   * ⚠️ **Tant que l'appel est en vol, on le partage sans limite de temps** — c'est la
   * correction d'un défaut de la première version, qui comparait l'heure de *départ* à une
   * fenêtre de deux secondes. Un appel qui mettait trois secondes cessait donc d'être
   * partagé au bout de deux, alors qu'il n'avait même pas répondu : les doublons repartaient
   * en double sur exactement les appels les plus lents, ceux qu'il fallait mutualiser en
   * priorité. Mesuré sur le site : `history?period=max`, `transactions` et
   * `events/transparence` partaient toujours deux fois.
   *
   * Une fois la réponse rendue, elle ne resservira plus que `GRACE` millisecondes : c'est un
   * cache, et un cache doit être court.
   */
  if (deja && (deja.rendue === null || Date.now() - deja.rendue < GRACE)) {
    /* ⚠️ `clone()` est obligatoire : le corps d'une réponse ne se lit qu'une fois, et le
       deuxième appelant recevrait un flux déjà consommé. */
    return deja.promesse.then(r => r.clone());
  }

  const entree: Entree = { promesse: surveiller(url, init, fetch(url, init)), rendue: null };
  enCours.set(k, entree);

  entree.promesse.then(
    () => { entree.rendue = Date.now(); setTimeout(() => {
      if (enCours.get(k) === entree) enCours.delete(k);
    }, GRACE); },
    /* ⚠️ L'entrée part à l'échec, jamais gardée : mémoriser une panne de réseau ferait
       échouer d'emblée les appels suivants, alors que le réseau est peut-être déjà revenu. */
    () => { if (enCours.get(k) === entree) enCours.delete(k); },
  );

  return entree.promesse.then(r => r.clone());
}

/**
 * Programme un travail pour le moment où le navigateur n'a plus rien à faire.
 *
 * ⚠️ `requestIdleCallback` n'existe pas partout — Safari ne l'a que depuis peu — d'où le repli
 * sur un `setTimeout`, qui n'attend pas le repos mais laisse au moins passer le rendu en cours.
 */
export function auRepos(travail: () => void): number {
  const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  return w.requestIdleCallback
    ? w.requestIdleCallback(travail, { timeout: 3000 })
    : window.setTimeout(travail, 300);
}

export function annulerRepos(id: number): void {
  const w = window as unknown as { cancelIdleCallback?: (id: number) => void };
  if (w.cancelIdleCallback) w.cancelIdleCallback(id);
  else window.clearTimeout(id);
}
