import { NextResponse } from "next/server";
import { COOKIE_ACCES, empreinte, memeChaine, motDePasseAttendu } from "@/lib/acces";

/**
 * Ouvrir la porte : un mot de passe entre, un cookie sort.
 *
 * ⚠️ **Le cookie est `httpOnly`.** Le JavaScript de la page ne peut donc pas le lire, ce qui
 * met l'empreinte hors de portée d'un script tiers ou d'une extension. La page n'a de toute
 * façon rien à en faire : c'est le middleware qui le relit, à chaque requête.
 */
export const runtime = "nodejs";

/** Trente jours : assez pour ne pas retaper le mot de passe à chaque visite d'un invité. */
const DUREE = 60 * 60 * 24 * 30;

export async function POST(requete: Request) {
  const attendu = motDePasseAttendu();
  if (!attendu) return NextResponse.json({ ouvert: true });

  let saisi = "";
  try {
    saisi = String(((await requete.json()) as { motDePasse?: unknown })?.motDePasse ?? "");
  } catch {
    return NextResponse.json({ ouvert: false }, { status: 400 });
  }

  if (!memeChaine(saisi, attendu)) {
    /* ⚠️ Aucun indice sur ce qui cloche — ni « trop court », ni « presque ». Un seul mot de
       passe protège tout le site : chaque précision offerte est un essai économisé à qui le
       cherche. */
    return NextResponse.json({ ouvert: false }, { status: 401 });
  }

  const reponse = NextResponse.json({ ouvert: true });
  reponse.cookies.set(COOKIE_ACCES, await empreinte(), {
    httpOnly: true,
    sameSite: "lax",
    /* En clair sur `localhost`, chiffré partout ailleurs : `secure` sur un site de
       développement en HTTP empêcherait le navigateur de poser le cookie, et la porte se
       refermerait aussitôt ouverte. */
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DUREE,
  });
  return reponse;
}
