import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_ACCES, empreinte, memeChaine, motDePasseAttendu } from "@/lib/acces";

/**
 * La porte de l'alpha fermée, posée devant tout le site.
 *
 * ⚠️ **Trois chemins doivent rester ouverts, sans quoi la porte s'enferme elle-même** :
 * la page qui la présente, la route qui l'ouvre, et l'inscription à la liste d'attente.
 * Fermer cette dernière serait le défaut classique de ce genre de page — un visiteur sans
 * mot de passe ne pourrait plus demander à en recevoir un, ce qui vide la liste de son
 * sens. Elle est publique par nécessité, et ne rend jamais ce qu'elle contient : voir
 * `backend/app/api/routes/attente.py`.
 *
 * ⚠️ **Une redirection pour une page, un 401 pour l'API.** Rediriger un appel de données
 * vers `/acces` lui aurait renvoyé du HTML avec un code 200 : le frontal aurait tenté de le
 * lire comme du JSON et affiché une erreur d'analyse, là où le vrai problème est la porte.
 */
export const config = {
  matcher: [
    /* Tout, sauf ce que le navigateur charge pour peindre la page elle-même. Les fichiers
       statiques n'ont rien à protéger — ils sont les mêmes pour tous — et les faire passer
       par la porte aurait cassé la page de la porte. */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|txt|xml)$).*)",
  ],
};

/** Les chemins que la porte laisse toujours passer. */
const OUVERTS = ["/acces", "/api/acces", "/api/v1/liste-attente"];

export async function middleware(requete: NextRequest) {
  const attendu = motDePasseAttendu();
  // Aucun mot de passe défini : le site n'est pas en alpha fermée, la porte n'existe pas.
  if (!attendu) return NextResponse.next();

  const chemin = requete.nextUrl.pathname;
  if (OUVERTS.some(o => chemin === o || chemin.startsWith(`${o}/`))) return NextResponse.next();

  const cookie = requete.cookies.get(COOKIE_ACCES)?.value ?? "";
  if (cookie && memeChaine(cookie, await empreinte())) return NextResponse.next();

  if (chemin.startsWith("/api/")) {
    return NextResponse.json({ detail: "Alpha fermée" }, { status: 401 });
  }

  /**
   * ⚠️ **Trois tentatives ont échoué avant celle-ci ; les voici pour qu'on n'y revienne pas.**
   *
   * 1. `NextResponse.redirect(requete.nextUrl)` envoyait sur `https://localhost:3000/acces`
   *    dès qu'un relais était devant : le site répondait parfaitement en local et était
   *    inatteignable de l'extérieur.
   *
   * 2. Un `Location` relatif, que la norme autorise et que tout navigateur résout, est refusé
   *    par le moteur de middleware de Next, qui analyse l'en-tête comme une URL complète —
   *    `ERR_INVALID_URL`, et une 500 à la place de la porte.
   *
   * 3. Une **réécriture** affichait bien la porte, mais l'adresse du navigateur restait celle
   *    demandée : `CadreSite` reconnaît la porte à son chemin, et laissait donc le rail de
   *    navigation et la barre de recherche autour d'elle. Une porte qui montre le mobilier de
   *    ce qu'elle protège.
   *
   * ⚠️ **L'adresse publique se lit dans les en-têtes, pas dans `nextUrl`.** Mesuré par le
   * tunnel : `nextUrl` vaut `https://localhost:3000/…` — le protocole du visiteur, repris de
   * `x-forwarded-proto`, posé sur l'hôte interne ; aucune des deux moitiés n'est fausse, leur
   * assemblage l'est. `host` et `x-forwarded-host`, eux, portent bien le nom que le
   * navigateur a tapé.
   *
   * ⚠️ **Faire confiance à `host` n'ouvre pas de redirection sauvage ici.** Le chemin est
   * toujours `/acces`, jamais une valeur reçue : seul le nom d'hôte vient du client, et un
   * client qui ment sur le sien ne redirige que lui-même.
   */
  const hote = requete.headers.get("x-forwarded-host") ?? requete.headers.get("host");
  const protocole = requete.headers.get("x-forwarded-proto") ?? requete.nextUrl.protocol.replace(":", "");

  /* ⚠️ On retient où le visiteur allait, pour l'y déposer une fois la porte ouverte. Sans
     ça, un lien partagé vers une page précise ramènerait toujours à l'accueil. La page, elle,
     refuse tout ce qui ne commence pas par une barre unique — « //ailleurs.example » en a deux
     et désigne un autre hôte —, faute de quoi le paramètre deviendrait le tremplin que
     l'en-tête d'hôte, lui, n'est pas. */
  const vers = chemin === "/" ? "" : `?vers=${encodeURIComponent(chemin + requete.nextUrl.search)}`;

  const porte = hote
    ? new URL(`/acces${vers}`, `${protocole}://${hote}`)
    /* Sans en-tête d'hôte — un appel qui n'en pose pas —, on retombe sur l'adresse interne :
       elle ne servira à personne, mais elle vaut mieux qu'une erreur. */
    : new URL(`/acces${vers}`, requete.nextUrl.origin);

  return NextResponse.redirect(porte, 307);
}
