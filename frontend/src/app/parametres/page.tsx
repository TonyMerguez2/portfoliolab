"use client";

import ReglageDevise from "@/components/ReglageDevise";

/**
 * Les réglages du site.
 *
 * Une seule section pour l'instant, la devise d'affichage. La page existe quand même :
 * l'alternative était de glisser le sélecteur dans la modale de profil, où il aurait été
 * mêlé au pseudo et à l'avatar — deux choses qui décrivent *qui* est l'utilisateur, là où la
 * devise décrit *comment* il lit ses montants.
 */
export default function PageParametres() {
  return (
    <main style={{
      maxWidth: 760, margin: "0 auto", padding: "26px 22px 60px",
      display: "flex", flexDirection: "column", gap: 18,
    }}>
      <header>
        <h1 style={{
          margin: 0, fontSize: 21, fontWeight: 680, letterSpacing: "-0.01em",
          color: "var(--nv-texte-fort)",
        }}>Paramètres</h1>
        <p style={{
          margin: "6px 0 0", fontSize: 13, color: "var(--nv-texte-secondaire)",
        }}>
          Vos préférences d’affichage, enregistrées sur votre compte.
        </p>
      </header>

      <ReglageDevise />
    </main>
  );
}
