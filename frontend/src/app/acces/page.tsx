"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FONT, NUM } from "@/lib/typography";
import { JETONS, RAYONS } from "@/lib/palette";
import Cadre from "@/components/ui/Cadre";
import { champ, HAUTEUR_SAISIE, RAYON_SAISIE } from "@/components/ui/saisie";

/**
 * La porte de l'alpha fermée : entrer avec un code, ou laisser son adresse.
 *
 * ⚠️ **Les deux gestes sur la même page, et c'est le point de la page.** Une porte seule
 * renvoie l'inconnu sans rien lui proposer ; une liste d'attente seule n'a pas d'endroit où
 * la mettre tant que le site est fermé. Séparées, elles auraient demandé deux pages dont
 * l'une, celle de la liste, aurait dû rester ouverte — donc être le vrai accueil du site.
 *
 * ⚠️ **C'est la seule page que verront la plupart des visiteurs pendant l'alpha et la bêta.**
 * Elle porte donc l'identité du site — le filigrane du logo, le mot-symbole espacé de la page
 * d'accueil, les jetons de couleur, la police du reste — et non une mise en page de service.
 * Elle montre aussi trois aperçus de ce qu'on trouve derrière : demander une adresse sans rien
 * montrer, c'est demander de la confiance sans rien donner en échange.
 *
 * ⚠️ **Les chiffres des aperçus sont des exemples, et le disent.** Inventer des données en les
 * faisant passer pour un portefeuille réel serait une promesse fausse ; les taire rendrait les
 * dessins illisibles. Ils portent la mention « aperçu », une fois, en tête du bloc.
 */

type Etat = "repos" | "envoi" | "refus" | "panne";
type EtatInscription = "repos" | "envoi" | "fait" | "deja" | "refus" | "panne";

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
  const parametres = useSearchParams();

  const [code, setCode] = useState("");
  const [etat, setEtat] = useState<Etat>("repos");
  const [email, setEmail] = useState("");
  const [inscription, setInscription] = useState<EtatInscription>("repos");

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
      /* Un chargement complet, et non `router.push` : le routeur garde en cache des pages
         rendues du temps où la porte était fermée. */
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
      const d = (await r.json()) as { deja?: boolean };
      setInscription(d.deja ? "deja" : "fait");
    } catch {
      setInscription("panne");
    }
  }

  const inscrit = inscription === "fait" || inscription === "deja";

  return (
    <main style={{ minHeight: "100vh", position: "relative", overflow: "hidden",
                   fontFamily: FONT, color: JETONS.surFond }}>
      <div style={{ position: "relative", zIndex: 1, maxWidth: 1000, margin: "0 auto",
                    padding: "clamp(40px, 8vh, 96px) 24px 72px",
                    display: "flex", flexDirection: "column",
                    alignItems: "center", gap: "clamp(36px, 7vh, 64px)" }}>

        {/* ── L'enseigne : le logo, puis le nom ─────────────────────────── */}
        <header style={{ textAlign: "center" }}>
          {/* ⚠️ **« Novac » et non « NOVAC », à la demande.** La capitale espacée est le
              mot-symbole de la page d'accueil, qui est une affiche ; ici le nom accompagne un
              logo et une porte, et une casse normale se lit comme un nom plutôt que comme une
              enseigne. L'espacement tombe donc aussi : il n'a de sens qu'en capitales. */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
            <Logo taille={38} />
            <span style={{ fontSize: "clamp(27px, 5vw, 36px)", fontWeight: 700,
                           letterSpacing: "-0.01em", color: JETONS.surFond }}>
              Novac
            </span>
          </div>
          <p style={{ margin: "12px 0 0", fontSize: 11.5, fontWeight: 400,
                      letterSpacing: "0.2em", marginRight: "-0.2em",
                      color: JETONS.surFondAttenue, textTransform: "uppercase" }}>
            Find the optimal path
          </p>
          <PastilleAlpha />
        </header>

        {/* ── La porte ───────────────────────────────────────────────────── */}
        <section style={{ width: "100%", maxWidth: 400 }}>
          {/* ⚠️ `Cadre`, et non un panneau bricolé à la main. C'est le conteneur de tout le
              site — double anneau, voile d'intervalle, arrondis mesurés — et la porte n'a
              aucune raison d'en avoir un autre. La version précédente empilait un fond, un
              liseré et une ombre portée qui ne ressemblaient à rien d'autre ici. */}
          <Cadre style={{ padding: 22 }}>
            <form onSubmit={ouvrir}>
              <label htmlFor="code" style={{ display: "block", fontSize: 12.5, fontWeight: 600,
                                             color: JETONS.texte, marginBottom: 8 }}>
                Code d&apos;accès
              </label>
              {/* ⚠️ **`champ` et `.novac-surface-saisie`, comme toutes les saisies du site.**
                  Cette page avait les siennes : arrondi 10 au lieu de 18, hauteur libre au lieu
                  de 40, un liseré peint en `border` là où le site le pose en pseudo-élément
                  masqué — un `border` raccourcit la boîte de deux pixels sans changer son
                  rayon, et les deux arcs se croisent dans les angles. La classe porte aussi le
                  survol et le focus, qu'un style en ligne ne sait pas exprimer. */}
              <input id="code" type="password" value={code} autoComplete="current-password"
                onChange={e => { setCode(e.target.value); if (etat !== "repos") setEtat("repos"); }}
                placeholder="••••••••"
                className="novac-surface-saisie"
                style={{ ...champ, borderColor: etat === "refus" ? JETONS.negatif : undefined }} />

              {/* ⚠️ La ligne d'état occupe sa place en permanence : sans elle, le bouton
                  sautait de dix-huit pixels à la première erreur. */}
              <div style={{ minHeight: 18, marginTop: 6, fontSize: 11.5,
                            color: etat === "refus" || etat === "panne" ? JETONS.negatif : JETONS.texteFaible }}>
                {etat === "refus" && "Code incorrect."}
                {etat === "panne" && "Le serveur n'a pas répondu."}

              </div>

              <button type="submit" disabled={!code || etat === "envoi"}
                style={{ width: "100%", marginTop: 4, height: HAUTEUR_SAISIE, borderRadius: RAYON_SAISIE,
                         border: "none", cursor: code && etat !== "envoi" ? "pointer" : "default",
                         background: code ? JETONS.segmentActif : JETONS.carteCreuse,
                         color: code ? JETONS.segmentEncre : JETONS.texteFaible,
                         fontFamily: FONT, fontSize: 13, fontWeight: 600,
                         transition: "background 200ms, color 200ms" }}>
                {etat === "envoi" ? "Ouverture…" : "Entrer"}
              </button>
            </form>

            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "22px 0 18px" }}>
              <span style={{ flex: 1, height: 1, background: JETONS.bord }} />
              <span style={{ fontSize: 10, color: JETONS.texteFaible, letterSpacing: "0.12em" }}>
                PAS ENCORE DE CODE
              </span>
              <span style={{ flex: 1, height: 1, background: JETONS.bord }} />
            </div>

            {inscrit ? (
              /* ⚠️ Le formulaire disparaît une fois l'adresse prise : le laisser invitait à
                 réessayer, et « déjà inscrit » se lit alors comme un échec. */
              <div style={{ textAlign: "center", padding: "6px 0 2px" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: JETONS.positif, marginBottom: 5 }}>
                  {inscription === "deja" ? "Vous y êtes déjà." : "C'est noté."}
                </div>
                <div style={{ fontSize: 11.5, color: JETONS.texteAttenue, lineHeight: 1.55 }}>
                  Nous vous écrirons à l&apos;ouverture des accès.
                </div>
              </div>
            ) : (
              /**
                * ⚠️ `noValidate` : sans lui, `type="email"` fait refuser l'envoi par le
                * navigateur, qui affiche sa propre bulle grise — « Veuillez inclure @ ». C'est
                * l'encadré natif que le reste du site a chassé, et il parle la langue du
                * navigateur, pas celle de la page. Le champ garde son type pour le clavier des
                * téléphones ; le refus vient du serveur et s'affiche dans nos mots.
                */
              <form onSubmit={inscrire} noValidate>
                <p style={{ margin: "0 0 10px", fontSize: 11.5, color: JETONS.texteAttenue, lineHeight: 1.55 }}>
                  Laissez votre adresse : vous recevrez un code dès qu&apos;une place se libère.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="email" value={email} inputMode="email" autoComplete="email"
                    aria-label="Votre adresse e-mail"
                    onChange={e => { setEmail(e.target.value); if (inscription !== "repos") setInscription("repos"); }}
                    placeholder="vous@exemple.com"
                    className="novac-surface-saisie"
                    style={{ ...champ, flex: 1, width: "auto", minWidth: 0,
                             borderColor: inscription === "refus" ? JETONS.negatif : undefined }} />
                  {/* ⚠️ **La pastille blanche du site, pas un bouton bleu.** L'accent sert
                      ici aux liens et aux mentions, jamais à un bouton d'action : partout
                      ailleurs — pistes de période, outils du graphique, « Entrer » juste
                      au-dessus — l'action retenue est une pastille blanche à encre noire. Un
                      bouton bleu à côté d'elle faisait deux vocabulaires dans la même carte. */}
                  <button type="submit" disabled={!email || inscription === "envoi"}
                    style={{ padding: "0 16px", height: HAUTEUR_SAISIE, borderRadius: RAYON_SAISIE,
                             flexShrink: 0, border: "none",
                             background: email ? JETONS.segmentActif : JETONS.carteCreuse,
                             color: email ? JETONS.segmentEncre : JETONS.texteFaible,
                             cursor: email && inscription !== "envoi" ? "pointer" : "default",
                             fontFamily: FONT, fontSize: 13, fontWeight: 600,
                             transition: "background 200ms, color 200ms" }}>
                    {inscription === "envoi" ? "…" : "Rejoindre"}
                  </button>
                </div>
                <div style={{ minHeight: 18, marginTop: 6, fontSize: 11.5, color: JETONS.negatif }}>
                  {inscription === "refus" && "Cette adresse ne semble pas valide."}
                  {inscription === "panne" && "Le serveur n'a pas répondu."}
                </div>
              </form>
            )}
          </Cadre>

          <p style={{ margin: "18px 0 0", textAlign: "center", fontSize: 11,
                      color: JETONS.surFondAttenue, lineHeight: 1.65 }}>
            Novac est en cours de construction. Rien de ce qui s&apos;y affiche
            n&apos;est un conseil en investissement.
          </p>
        </section>

        {/* ── Ce qu'il y a derrière ──────────────────────────────────────── */}
        <section style={{ width: "100%" }}>
          <Intertitre>Aperçu · exemples chiffrés</Intertitre>
          {/* ⚠️ Six aperçus et non trois, à la demande, et le dessin y prend le dessus : il
              occupe toute la largeur de la carte sur une bande haute, le texte se resserre
              dessous. Un aperçu qu'on lit plus qu'on ne regarde ne montre rien. */}
          <div style={{ display: "grid", gap: 12,
                        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            <Apercu titre="Une note, et ce qui la fonde"
              texte="Cinq piliers sur cent. Un pilier non mesurable est écarté, jamais compté à zéro.">
              <AnneauScore />
            </Apercu>
            <Apercu titre="La courbe de votre patrimoine"
              texte="Reconstruite depuis vos opérations réelles, comparée au marché sur la même fenêtre.">
              <Courbe />
            </Apercu>
            <Apercu titre="Ce que vous détenez vraiment"
              texte="En transparence des fonds : trois ETF, c'est des centaines de sociétés.">
              <MosaiqueApercu />
            </Apercu>
            <Apercu titre="Chaque ligne, son gain"
              texte="Quantité détenue et prix de revient issus de vos écritures, pas d'une pondération cible.">
              <CartesActifs />
            </Apercu>
            <Apercu titre="Vos comptes, rangés"
              texte="PEA, compte-titres, livrets, compte courant. Les espèces comptent dans le patrimoine, jamais dans la performance.">
              <Dossiers />
            </Apercu>
            <Apercu titre="La fenêtre que vous voulez"
              texte="De la séance du jour à tout l'historique, la performance suit la période choisie.">
              <RailPeriodes />
            </Apercu>
          </div>
        </section>
      </div>
    </main>
  );
}

/* ── Pièces ──────────────────────────────────────────────────────────────── */

/**
 * Le logo, à gauche du nom.
 *
 * ⚠️ **Il a d'abord été posé en filigrane derrière la page, et retiré à la demande.** Le
 * procédé — le dessin en masque du dégradé de fond — est celui de la page d'accueil, où il a
 * sa place parce que cette page-là n'a rien d'autre à montrer. Ici, la porte, les aperçus et
 * le fond pointillé occupent déjà l'espace : une quatrième couche faisait un fond chargé.
 *
 * Peint en encre pleine et non en masque de dégradé : à cette taille, un dégradé se réduit à
 * une teinte plate, avec la fragilité du masque en plus.
 */
function Logo({ taille = 34 }: { taille?: number }) {
  return (
    <span aria-hidden="true"
      style={{
        width: taille, height: taille, flexShrink: 0, display: "block",
        background: JETONS.surFond,
        maskImage: "url(/logo-hivesync.svg)", WebkitMaskImage: "url(/logo-hivesync.svg)",
        maskSize: "contain", WebkitMaskSize: "contain",
        maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat",
        maskPosition: "center", WebkitMaskPosition: "center",
      }} />
  );
}

/**
 * La pastille « alpha fermée », avec son liseré rouge qui tourne.
 *
 * ⚠️ **Le liseré tourne, il ne clignote pas.** Un `border` ne sait pas se dégrader le long
 * d'un contour ; la technique est celle du site — un pseudo-élément masqué, voir
 * `.novac-lisere` — mais avec un dégradé **conique** que l'on fait pivoter. Le point vif du
 * dégradé parcourt donc le tour de la pastille, et la rotation est continue : rien ne
 * s'allume ni ne s'éteint, ce qui serait une alarme plutôt qu'un signe de vie.
 *
 * ⚠️ **Le rouge est celui des pertes du site**, `negatif`, et non un rouge choisi à part :
 * c'est déjà la couleur qui veut dire « attention » partout ailleurs. Le fond et l'encre
 * restent sobres — un rouge plein ferait une alerte, quand il ne s'agit que de dire que le
 * site n'est pas encore ouvert.
 *
 * ⚠️ **`@property` déclare l'angle comme une vraie grandeur**, sans quoi le navigateur
 * interpole entre deux chaînes de caractères et la rotation se fait par sauts. Les
 * navigateurs qui l'ignorent gardent une pastille fixe, correctement dessinée.
 */
function PastilleAlpha() {
  return (
    <>
      <style>{`
        @property --nv-tour { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
        @keyframes nv-tourne { to { --nv-tour: 360deg; } }
        .nv-alpha { position: relative; isolation: isolate; }
        .nv-alpha::before {
          content: ''; position: absolute; inset: 0; border-radius: inherit;
          padding: 1px; pointer-events: none;
          background: conic-gradient(from var(--nv-tour),
            transparent 0deg, transparent 250deg,
            rgba(var(--nv-negatif-rvb), 0.25) 300deg,
            rgba(var(--nv-negatif-rvb), 1) 345deg,
            rgba(var(--nv-negatif-rvb), 0.25) 352deg,
            transparent 360deg);
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude;
          animation: nv-tourne 3.2s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .nv-alpha::before { animation: none; background: rgba(var(--nv-negatif-rvb), 0.55); }
        }
      `}</style>
      <span className="nv-alpha"
        style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 20,
                 padding: "5px 13px", borderRadius: RAYONS.plein,
                 background: JETONS.carteCreuse,
                 color: JETONS.texteSecondaire, fontSize: 10.5, fontWeight: 600,
                 letterSpacing: "0.14em" }}>
        <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: 3,
                                          background: JETONS.negatif, flexShrink: 0 }} />
        ALPHA FERMÉE
      </span>
    </>
  );
}

function Intertitre({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
      <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: "0.14em",
                     textTransform: "uppercase", color: JETONS.texteFaible, whiteSpace: "nowrap" }}>
        {children}
      </span>
      <span style={{ flex: 1, height: 1, background: JETONS.bord }} />
    </div>
  );
}

function Apercu({ titre, texte, children }: {
  titre: string; texte: string; children: React.ReactNode;
}) {
  return (
    <Cadre style={{ padding: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ⚠️ Hauteur fixe : six dessins de natures différentes doivent poser leurs titres sur
          la même ligne, sinon la grille se lit comme des cartes mal alignées. Le dessin est
          centré et débordant est masqué — chacun est tracé pour cette bande. */}
      <div style={{ height: 104, borderRadius: RAYONS.sm, background: JETONS.carteCreuse,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    overflow: "hidden" }}>
        {children}
      </div>
      <div>
        <div style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: JETONS.texte,
                      marginBottom: 4 }}>{titre}</div>
        <p style={{ margin: 0, fontFamily: FONT, fontSize: 11.5, lineHeight: 1.55,
                    color: JETONS.texteAttenue }}>{texte}</p>
        </div>
      </div>
    </Cadre>
  );
}

/** L'anneau du score, à la mesure de celui du bandeau. */
function AnneauScore() {
  const score = 75, r = 34, c = 2 * Math.PI * r;
  return (
    <svg width="92" height="92" viewBox="0 0 92 92" role="img" aria-label="Exemple de note : 75 sur 100">
      <circle cx="46" cy="46" r={r} fill="none" stroke={JETONS.bordFort} strokeWidth="9" />
      <circle cx="46" cy="46" r={r} fill="none" stroke={JETONS.positif} strokeWidth="9"
        strokeLinecap="round" strokeDasharray={`${(c * score) / 100} ${c}`}
        transform="rotate(-90 46 46)" />
      <text x="46" y="46" textAnchor="middle" dominantBaseline="central"
        style={{ ...NUM, fontSize: 22, fontWeight: 700, fill: JETONS.texteIntense }}>{score}</text>
    </svg>
  );
}

/** Une courbe de patrimoine et son repère de marché. */
function Courbe() {
  const patrimoine = "M2,64 L18,58 L34,60 L50,46 L66,49 L82,34 L98,30 L114,22 L130,25 L146,12";
  const repere     = "M2,66 L18,63 L34,64 L50,57 L66,58 L82,50 L98,49 L114,44 L130,45 L146,38";
  return (
    <svg width="148" height="76" viewBox="0 0 148 76" role="img"
      aria-label="Exemple de courbe de patrimoine, comparée au marché">
      <defs>
        <linearGradient id="nv-aire" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={JETONS.accent} stopOpacity="0.28" />
          <stop offset="100%" stopColor={JETONS.accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${patrimoine} L146,74 L2,74 Z`} fill="url(#nv-aire)" />
      <path d={repere} fill="none" stroke={JETONS.texteFaible} strokeWidth="1.5"
        strokeDasharray="3 3" strokeLinecap="round" />
      <path d={patrimoine} fill="none" stroke={JETONS.accent} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="146" cy="12" r="3" fill={JETONS.accent} />
    </svg>
  );
}

/** La mosaïque de répartition, aux aires fidèles aux poids. */
function MosaiqueApercu() {
  const blocs = [
    { x: 0,  y: 0,  l: 78, h: 44, c: "#50A2FF", t: "42 %" },
    { x: 80, y: 0,  l: 62, h: 44, c: "#a78bfa", t: "31 %" },
    { x: 0,  y: 46, l: 46, h: 30, c: "#FF8904", t: "15 %" },
    { x: 48, y: 46, l: 42, h: 30, c: "#00D492", t: "8 %" },
    { x: 92, y: 46, l: 50, h: 30, c: "#22d3ee", t: "4 %" },
  ];
  return (
    <svg width="142" height="76" viewBox="0 0 142 76" role="img"
      aria-label="Exemple de répartition en mosaïque">
      {blocs.map(b => (
        <g key={b.c}>
          <rect x={b.x} y={b.y} width={b.l} height={b.h} rx="3" fill={b.c} />
          <text x={b.x + 6} y={b.y + b.h / 2} dominantBaseline="central"
            style={{ ...NUM, fontSize: 11, fontWeight: 700, fill: "#0B1220" }}>{b.t}</text>
        </g>
      ))}
    </svg>
  );
}

/** Deux cartes d'actif, avec leur variation et leur courbe miniature. */
function CartesActifs() {
  const lignes = [
    { nom: "ESE.PA",  valeur: "5 267 €", pct: "+6,19 %", positif: true,
      d: "M0,17 L11,15 L22,18 L33,11 L44,13 L55,6 L66,4" },
    { nom: "CW8.PA",  valeur: "3 118 €", pct: "−0,84 %", positif: false,
      d: "M0,7 L11,9 L22,6 L33,12 L44,10 L55,15 L66,17" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7, width: "100%", padding: "0 14px" }}>
      {lignes.map(l => (
        <div key={l.nom} style={{ display: "flex", alignItems: "center", gap: 10,
                                  background: JETONS.carte, borderRadius: RAYONS.sm,
                                  padding: "8px 10px" }}>
          <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: JETONS.texte,
                         width: 52, flexShrink: 0 }}>{l.nom}</span>
          <svg width="68" height="22" viewBox="0 0 68 22" style={{ flexShrink: 0 }} aria-hidden="true">
            <path d={l.d} fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              stroke={l.positif ? JETONS.positif : JETONS.negatif} />
          </svg>
          <span style={{ ...NUM, fontSize: 11, color: JETONS.texteSecondaire, marginLeft: "auto" }}>
            {l.valeur}
          </span>
          <span style={{ ...NUM, fontSize: 10.5, fontWeight: 700, width: 52, textAlign: "right",
                         color: l.positif ? JETONS.positif : JETONS.negatif }}>{l.pct}</span>
        </div>
      ))}
    </div>
  );
}

/** Trois dossiers de compte, comme la rangée du tableau de bord. */
function Dossiers() {
  const dossiers = [
    { nom: "PEA",            montant: "5 267 €", couleur: "#5B6CF0" },
    { nom: "Épargne",        montant: "5 000 €", couleur: "#00D492" },
    { nom: "Compte courant", montant: "70 €",    couleur: "#FF8904" },
  ];
  return (
    <div style={{ display: "flex", gap: 7, width: "100%", padding: "0 14px" }}>
      {dossiers.map(d => (
        <div key={d.nom} style={{ flex: 1, minWidth: 0, borderRadius: RAYONS.sm,
                                  background: `${d.couleur}1F`,
                                  border: `1px solid ${d.couleur}3D`,
                                  padding: "9px 9px 10px" }}>
          {/* La languette du dossier, réduite à son signe : un onglet en haut à gauche. */}
          <span aria-hidden="true" style={{ display: "block", width: 16, height: 3, borderRadius: 2,
                                            background: d.couleur, marginBottom: 8 }} />
          <div style={{ fontFamily: FONT, fontSize: 9.5, fontWeight: 600, color: JETONS.texteSecondaire,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.nom}</div>
          <div style={{ ...NUM, fontSize: 11.5, fontWeight: 700, color: JETONS.texteIntense,
                        marginTop: 2, whiteSpace: "nowrap" }}>{d.montant}</div>
        </div>
      ))}
    </div>
  );
}

/** Le rail de périodes, avec la performance sur la pastille retenue. */
function RailPeriodes() {
  const periodes = ["24h", "1S", "1M", "3M", "6M", "1A"];
  const retenue = "6M";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 5px",
                  borderRadius: RAYONS.plein, background: JETONS.carte }}>
      {periodes.map(p => (
        <span key={p} style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: p === retenue ? "3px 9px" : "3px 7px", borderRadius: RAYONS.plein,
          fontFamily: FONT, fontSize: 10.5, fontWeight: p === retenue ? 600 : 500,
          background: p === retenue ? JETONS.segmentActif : "transparent",
          color: p === retenue ? JETONS.segmentEncre : JETONS.texteFaible,
        }}>
          {p}
          {p === retenue && (
            <span style={{ ...NUM, fontSize: 10, fontWeight: 700, color: JETONS.positif }}>
              +4,18 %
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
