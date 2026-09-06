"use client";
import { usePathname } from "next/navigation";

/**
 * Le cadre du site — rail de navigation et bandeau — sauf devant la porte de l'alpha.
 *
 * ⚠️ **Pourquoi un composant plutôt qu'un `return null` dans chacun des deux.** Le rail et le
 * bandeau appellent une dizaine de hooks après avoir lu le chemin ; sortir tôt au milieu
 * aurait enfreint la règle des hooks, et sortir tard les aurait laissés faire leur travail
 * — le bandeau va chercher le compte et la palette d'actifs — pour ne rien afficher. Ici ils
 * ne sont simplement pas montés.
 *
 * ⚠️ **La porte ne doit rien montrer du site.** Le rail affiche les pages, le bandeau le
 * compte et la recherche : les laisser derrière un mot de passe reviendrait à annoncer ce
 * qu'on ferme, et à offrir des liens qui renverraient tous à la porte. Le fond pointillé,
 * lui, reste — c'est de l'ambiance, pas de l'information.
 */
export default function CadreSite({ rail, bandeau, children }: {
  rail: React.ReactNode; bandeau: React.ReactNode; children: React.ReactNode;
}) {
  if (usePathname() === "/acces") return <>{children}</>;
  return (
    <>
      {rail}
      <div className="novac-shell">
        {bandeau}
        {children}
      </div>
    </>
  );
}
