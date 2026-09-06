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

export function recuperer(url: string, init?: RequestInit): Promise<Response> {
  const methode = (init?.method ?? "GET").toUpperCase();
  if (methode !== "GET") return fetch(url, init);

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

  const entree: Entree = { promesse: fetch(url, init), rendue: null };
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
