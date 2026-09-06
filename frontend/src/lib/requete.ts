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

/** Combien de temps une réponse peut resservir. Deux secondes : la durée d'un montage de page. */
const FRAICHEUR = 2000;

type Entree = { promesse: Promise<Response>; pose: number };

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
  const now = Date.now();
  const deja = enCours.get(k);
  if (deja && now - deja.pose < FRAICHEUR) {
    /* ⚠️ `clone()` est obligatoire : le corps d'une réponse ne se lit qu'une fois, et le
       deuxième appelant recevrait un flux déjà consommé. Le clone se fait à la lecture, pas au
       dépôt, pour que la réponse d'origine reste intacte pour le suivant. */
    return deja.promesse.then(r => r.clone());
  }

  const promesse = fetch(url, init);
  enCours.set(k, { promesse, pose: now });

  /* ⚠️ L'entrée est retirée à l'échec, jamais gardée : mémoriser une panne de réseau
     pendant deux secondes ferait échouer d'emblée les appels qui suivent, alors que le
     réseau est peut-être déjà revenu. */
  promesse.catch(() => { enCours.delete(k); });
  setTimeout(() => {
    const e = enCours.get(k);
    if (e && e.promesse === promesse) enCours.delete(k);
  }, FRAICHEUR);

  return promesse.then(r => r.clone());
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
