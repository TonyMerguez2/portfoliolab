"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FONT } from "@/lib/typography";
import { JETONS, RAYONS } from "@/lib/palette";

/**
 * La porte de l'alpha fermée : entrer avec un code, ou laisser son adresse.
 *
 * ⚠️ **Les deux gestes sur la même page, et c'est le point de la page.** Une porte seule
 * renvoie l'inconnu sans rien lui proposer ; une liste d'attente seule n'a pas d'endroit où
 * la mettre tant que le site est fermé. Séparées, elles auraient demandé deux pages dont
 * l'une, celle de la liste, aurait dû rester ouverte — donc être le vrai accueil du site.
 * Autant que ce soit celle-ci.
 *
 * ⚠️ **Le code d'abord, la liste ensuite, séparés d'un filet.** L'ordre inverse a été
 * envisagé : la liste concerne plus de monde. Mais celui qui a un code vient pour entrer, et
 * lui faire lire un formulaire d'inscription avant de trouver son champ, à chaque visite,
 * est le genre de friction qui se paie tous les jours.
 */

/** Ce que le champ du code peut répondre. */
type Etat = "repos" | "envoi" | "refus" | "panne";

export default function PageAcces() {
  /* ⚠️ `useSearchParams` impose une frontière de suspense, sans quoi la page entière bascule
     en rendu à la demande — et Next refuse la construction statique. */
  return (
    <Suspense fallback={null}>
      <Porte />
    </Suspense>
  );
}

function Porte() {
  const router = useRouter();
  const parametres = useSearchParams();

  const [code, setCode] = useState("");
  const [etat, setEtat] = useState<Etat>("repos");

  const [email, setEmail] = useState("");
  const [inscription, setInscription] = useState<"repos" | "envoi" | "fait" | "deja" | "refus" | "panne">("repos");

  async function ouvrir(e: React.FormEvent) {
    e.preventDefault();
    if (!code || etat === "envoi") return;
    setEtat("envoi");
    try {
      const r = await fetch("/api/acces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motDePasse: code }),
      });
      if (!r.ok) { setEtat("refus"); return; }
      /**
       * ⚠️ **Une destination interne, et rien d'autre.** `vers` vient de l'adresse, donc du
       * visiteur : accepter n'importe quelle valeur ferait de cette page une redirection
       * ouverte, qu'on emploie pour faire partir quelqu'un vers un faux site depuis un lien
       * qui porte le vrai domaine. Une barre unique en tête est la seule forme admise —
       * « //ailleurs.example » en a deux et désigne un autre hôte.
       */
      const vers = parametres.get("vers") ?? "";
      const sur = vers.startsWith("/") && !vers.startsWith("//") ? vers : "/";
      /**
       * ⚠️ Un chargement complet, et non `router.push` : le routeur garde en cache des pages
       * rendues du temps où la porte était fermée, et le cookie ne vient d'exister que dans
       * la réponse qu'on vient de lire.
       */
      window.location.replace(sur);
    } catch {
      setEtat("panne");
    }
  }

  async function inscrire(e: React.FormEvent) {
    e.preventDefault();
    if (!email || inscription === "envoi") return;
    setInscription("envoi");
    try {
      const r = await fetch("/api/v1/liste-attente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, origine: "acces" }),
      });
      if (r.status === 422) { setInscription("refus"); return; }
      if (!r.ok) { setInscription("panne"); return; }
      const donnees = (await r.json()) as { deja?: boolean };
      setInscription(donnees.deja ? "deja" : "fait");
    } catch {
      setInscription("panne");
    }
  }

  const inscrit = inscription === "fait" || inscription === "deja";

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
                   padding: 24, fontFamily: FONT, color: JETONS.surFond }}>
      <div style={{ width: "100%", maxWidth: 380 }}>

        {/* ── L'enseigne ─────────────────────────────────────────────────── */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "0.24em", marginBottom: 10 }}>
            NOVAC
          </div>
          <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: RAYONS.plein,
                         background: JETONS.accentVoile, border: `1px solid ${JETONS.accentBord}`,
                         color: JETONS.accent, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em" }}>
            ALPHA FERMÉE
          </span>
        </div>

        <div style={{ background: JETONS.carte, border: `1px solid ${JETONS.bord}`,
                      borderRadius: RAYONS.lg, padding: 22 }}>

          {/* ── Entrer ───────────────────────────────────────────────────── */}
          <form onSubmit={ouvrir}>
            <label htmlFor="code" style={{ display: "block", fontSize: 12.5, fontWeight: 600,
                                           color: JETONS.texte, marginBottom: 8 }}>
              Code d&apos;accès
            </label>
            <input id="code" type="password" value={code} autoComplete="current-password"
              onChange={e => { setCode(e.target.value); if (etat !== "repos") setEtat("repos"); }}
              placeholder="••••••••"
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px",
                       borderRadius: RAYONS.sm, background: JETONS.carteCreuse,
                       border: `1px solid ${etat === "refus" ? JETONS.negatif : JETONS.bord}`,
                       color: JETONS.texte, fontFamily: FONT, fontSize: 13, outline: "none" }} />

            {/* ⚠️ La ligne d'état occupe sa place en permanence : sans elle, le bouton sautait
                de dix-huit pixels à la première erreur. */}
            <div style={{ minHeight: 18, marginTop: 6, fontSize: 11.5,
                          color: etat === "refus" || etat === "panne" ? JETONS.negatif : JETONS.texteFaible }}>
              {etat === "refus" && "Code incorrect."}
              {etat === "panne" && "Le serveur n'a pas répondu."}
            </div>

            <button type="submit" disabled={!code || etat === "envoi"}
              style={{ width: "100%", marginTop: 4, padding: "10px 12px", borderRadius: RAYONS.sm,
                       border: "none", cursor: code && etat !== "envoi" ? "pointer" : "default",
                       background: code ? JETONS.segmentActif : JETONS.carteCreuse,
                       color: code ? JETONS.segmentEncre : JETONS.texteFaible,
                       fontFamily: FONT, fontSize: 13, fontWeight: 600,
                       transition: "background 200ms, color 200ms" }}>
              {etat === "envoi" ? "Ouverture…" : "Entrer"}
            </button>
          </form>

          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0 18px" }}>
            <span style={{ flex: 1, height: 1, background: JETONS.bord }} />
            <span style={{ fontSize: 10.5, color: JETONS.texteFaible, letterSpacing: "0.06em" }}>
              PAS ENCORE DE CODE
            </span>
            <span style={{ flex: 1, height: 1, background: JETONS.bord }} />
          </div>

          {/* ── La liste d'attente ───────────────────────────────────────── */}
          {inscrit ? (
            /* ⚠️ Le formulaire disparaît une fois l'adresse prise : le laisser invitait à
               réessayer, et « déjà inscrit » se lit alors comme un échec. */
            <div style={{ textAlign: "center", padding: "6px 0 2px" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: JETONS.positif, marginBottom: 4 }}>
                {inscription === "deja" ? "Vous y êtes déjà." : "C'est noté."}
              </div>
              <div style={{ fontSize: 11.5, color: JETONS.texteAttenue, lineHeight: 1.5 }}>
                Nous vous écrirons à l&apos;ouverture des accès.
              </div>
            </div>
          ) : (
            /**
              * ⚠️ `noValidate` : sans lui, `type="email"` fait refuser l'envoi par le navigateur,
              * qui affiche sa propre bulle grise — « Veuillez inclure @ ». C'est exactement
              * l'encadré natif que le reste du site a chassé, et il parle la langue du
              * navigateur, pas celle de la page. Le champ garde son type pour le clavier des
              * téléphones et le remplissage automatique ; le refus, lui, vient du serveur et
              * s'affiche dans nos mots.
              */
            <form onSubmit={inscrire} noValidate>
              <p style={{ margin: "0 0 10px", fontSize: 11.5, color: JETONS.texteAttenue, lineHeight: 1.5 }}>
                Laissez votre adresse : vous recevrez un code dès qu&apos;une place se libère.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="email" value={email} inputMode="email" autoComplete="email"
                  aria-label="Votre adresse e-mail"
                  onChange={e => { setEmail(e.target.value); if (inscription !== "repos") setInscription("repos"); }}
                  placeholder="vous@exemple.com"
                  style={{ flex: 1, minWidth: 0, padding: "9px 12px", borderRadius: RAYONS.sm,
                           background: JETONS.carteCreuse,
                           border: `1px solid ${inscription === "refus" ? JETONS.negatif : JETONS.bord}`,
                           color: JETONS.texte, fontFamily: FONT, fontSize: 13, outline: "none" }} />
                <button type="submit" disabled={!email || inscription === "envoi"}
                  style={{ padding: "9px 14px", borderRadius: RAYONS.sm, flexShrink: 0,
                           border: `1px solid ${JETONS.accentBord}`,
                           background: JETONS.accentVoile, color: JETONS.accent,
                           cursor: email && inscription !== "envoi" ? "pointer" : "default",
                           fontFamily: FONT, fontSize: 13, fontWeight: 600 }}>
                  {inscription === "envoi" ? "…" : "Rejoindre"}
                </button>
              </div>
              <div style={{ minHeight: 18, marginTop: 6, fontSize: 11.5, color: JETONS.negatif }}>
                {inscription === "refus" && "Cette adresse ne semble pas valide."}
                {inscription === "panne" && "Le serveur n'a pas répondu."}
              </div>
            </form>
          )}
        </div>

        <p style={{ margin: "18px 0 0", textAlign: "center", fontSize: 11,
                    color: JETONS.surFondAttenue, lineHeight: 1.6 }}>
          Novac est en cours de construction. Rien de ce qui s&apos;y affiche
          n&apos;est un conseil en investissement.
        </p>
      </div>
    </main>
  );
}
