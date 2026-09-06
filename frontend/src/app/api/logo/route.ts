/**
 * Le relais des logos : la même image, servie depuis notre propre origine.
 *
 * ⚠️ **Il existe pour une seule raison : lire les pixels d'un logo.** Un canevas qui a reçu
 * une image d'une autre origine devient *teinté* — `getImageData` y lève une `SecurityError`
 * —, à moins que le serveur d'en face n'autorise la lecture par un en-tête CORS. Mesuré sur
 * les cinq sources du fichier `AssetLogo` : `cdn.jsdelivr.net`, `financialmodelingprep.com` et
 * `s2.coinmarketcap.com` répondent à une requête `crossOrigin`, **`assets.parqet.com` et
 * `assets.coincap.io` la refusent**. Or Parqet est la *première* source essayée pour toute
 * action ou tout ETF : c'est donc l'image de presque tous les logos affichés qui était
 * illisible.
 *
 * ⚠️ **Ce que cela rendait mort, sans une ligne d'erreur.** `extractColor` posait
 * `img.crossOrigin` puis n'écoutait que `onload` : sur Parqet l'image n'arrivait jamais, la
 * fonction de rappel n'était jamais appelée, et l'appelant gardait sa couleur par défaut sans
 * savoir qu'il n'avait rien reçu. Une analyse qui paraissait marcher parce que son échec
 * ressemblait à son résultat. C'est la teinte dominante dont se servent la page graphique et
 * la carte d'en-tête d'un actif ; elle fonctionne depuis, pour la première fois.
 *
 * ⚠️ **On ne relaie que la sonde, pas l'affichage.** L'`<img>` visible garde l'adresse
 * d'origine : elle n'a aucun besoin d'être lisible au canevas, et la faire passer par ici
 * mettrait tout le trafic des logos sur notre serveur pour rien.
 *
 * ⚠️ **Et la liste des hôtes est fermée, parce qu'un relais ouvert n'est pas un relais.** Une
 * route qui va chercher l'URL qu'on lui donne laisse atteindre depuis le dehors tout ce que le
 * serveur atteint — le réseau interne compris. Les cinq hôtes ci-dessous sont exactement ceux
 * que `resolveUrls` sait produire ; en ajouter un là-bas demande de l'ajouter ici.
 */

/** Les hôtes dont `resolveUrls` tire ses adresses, et eux seuls. */
const HOTES = new Set([
  "assets.parqet.com",
  "financialmodelingprep.com",
  "s2.coinmarketcap.com",
  "assets.coincap.io",
  "cdn.jsdelivr.net",
]);

export async function GET(requete: Request): Promise<Response> {
  const brute = new URL(requete.url).searchParams.get("u");
  if (!brute) return new Response("paramètre « u » manquant", { status: 400 });

  let cible: URL;
  try { cible = new URL(brute); }
  catch { return new Response("adresse illisible", { status: 400 }); }

  if (cible.protocol !== "https:" || !HOTES.has(cible.hostname)) {
    return new Response("hôte non autorisé", { status: 403 });
  }

  let amont: Response;
  try {
    /* Un jour de cache côté serveur : un logo de marque ne change pas d'une visite à
       l'autre, et la sonde repasse ici à chaque session faute de cache navigateur partagé. */
    amont = await fetch(cible, { headers: { accept: "image/*" }, next: { revalidate: 86400 } });
  } catch {
    return new Response("source injoignable", { status: 502 });
  }
  if (!amont.ok || !amont.body) return new Response("logo indisponible", { status: 502 });

  /* ⚠️ Le type est vérifié et non recopié tel quel : cette route rend ce qu'un hôte tiers lui
     donne, et un `content-type` non-image renverrait au navigateur, depuis *notre* origine, un
     document que nous n'avons pas écrit. */
  const type = amont.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) return new Response("réponse non-image", { status: 502 });

  return new Response(amont.body, {
    headers: {
      "content-type": type,
      "cache-control": "public, max-age=86400, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
