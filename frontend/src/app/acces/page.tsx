"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FONT, NUM } from "@/lib/typography";
import { JETONS, RAYONS } from "@/lib/palette";
import Cadre from "@/components/ui/Cadre";
import { champ, HAUTEUR_SAISIE, RAYON_SAISIE } from "@/components/ui/saisie";
import CarteActif from "@/components/portfolio/CarteActif";
import CarteCompte from "@/components/portfolio/CarteCompte";
import AvatarNovac from "@/components/AvatarNovac";
import type { GridAsset } from "@/lib/portfolio";

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
      <Decor />
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
                 color: JETONS.negatif, fontSize: 10.5, fontWeight: 600,
                 letterSpacing: "0.14em" }}>
        <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: 3,
                                          background: JETONS.negatif, flexShrink: 0 }} />
        ALPHA FERMÉE
      </span>
    </>
  );
}

/**
 * Ce qu'il y a derrière la porte, aperçu par-dessus l'épaule.
 *
 * ⚠️ **Ce sont les vrais composants du site, et c'est la seconde version.** La première
 * dessinait des imitations — des rectangles colorés en guise de dossiers, deux lignes de
 * texte en guise de cartes d'actif — qui ne ressemblaient à rien de ce qu'on trouve derrière
 * la porte. Une vitrine qui montre autre chose que la boutique est pire que pas de vitrine :
 * elle promet faux. `CarteActif`, `CarteCompte` et `AvatarNovac` sont donc montés tels quels,
 * avec les mêmes props que dans le tableau de bord.
 *
 * ⚠️ **`inerte` sur les cartes d'actif** : le mode existait déjà pour l'aperçu d'un dossier,
 * et il retire le clic comme le survol. Sans lui, le décor entrerait dans le parcours au
 * clavier et mènerait nulle part.
 *
 * ⚠️ **La profondeur vient d'une perspective et d'un flou léger**, pas d'une simple
 * transparence. Chaque pièce est inclinée dans le plan et reculée sur l'axe Z : celles du
 * fond sont plus floues et plus petites, comme des fenêtres ouvertes derrière celle-ci. Une
 * opacité uniforme donnait une brochure passée à l'eau ; la perspective donne un décor.
 *
 * ⚠️ **Le voile radial reste et prime sur tout.** Le décor s'efface vers le centre pour que
 * le nom et la porte se lisent sans effort — c'est la carte qui fait entrer, pas le décor.
 *
 * ⚠️ **Rien n'est atteignable** : `aria-hidden` et `pointer-events: none`. Au clavier comme
 * au lecteur d'écran, cette page n'a que deux champs et deux boutons.
 */
function Decor() {
  const actif = (ticker: string, weight: number, price: number, change: number,
                 value: number, perfEur: number, spark: number[]): GridAsset =>
    ({ ticker, weight, price, change, value, perfEur, spark });

  /** Une pièce : sa place, son recul, et ce qu'elle montre. */
  const pieces: { style: React.CSSProperties; recul: number; contenu: React.ReactNode }[] = [
    { style: { top: "7%", left: "4%" }, recul: 1,
      contenu: <CarteActif inerte a={actif("ESE.PA", 42, 33.6, 6.19, 5267, 307.03,
        [30.1, 30.6, 30.4, 31.2, 31.0, 31.9, 32.4, 32.2, 33.1, 33.6])} /> },
    { style: { top: "30%", left: "9%" }, recul: 2,
      contenu: <CarteActif inerte a={actif("CW8.PA", 31, 512.4, -0.84, 3118, -26.4,
        [518, 516, 519, 514, 515, 511, 513, 510, 512.9, 512.4])} /> },
    { style: { top: "5%", right: "5%" }, recul: 2,
      contenu: <CarteCompte nom="PEA Trade Republic" couleur="#5B6CF0"
        compte={<span style={{ ...NUM }}>5 266,94 €</span>} icone={<IconeTitres />} /> },
    { style: { bottom: "12%", right: "7%" }, recul: 1,
      contenu: <CarteCompte nom="Crédit agricole épargne" couleur="#00D492"
        compte={<span style={{ ...NUM }}>5 000,00 €</span>} icone={<IconeEpargne />} /> },
    { style: { top: "31%", right: "9%" }, recul: 3,
      contenu: <Anneau note={75} taille={96} /> },
    { style: { bottom: "32%", left: "24%" }, recul: 3,
      contenu: <Anneau note={41} taille={72} /> },
    { style: { bottom: "13%", left: "10%" }, recul: 2,
      contenu: <AvatarNovac taille={86} etat="content" suivi={false} vivant={false}
        couleur="#6366F1" forme="sphere" /> },
  ];

  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none",
                                     overflow: "hidden", zIndex: 0, perspective: 1400 }}>
      <div style={{
        position: "absolute", inset: 0, transformStyle: "preserve-3d",
        /* ⚠️ Le masque **et** son préfixe WebKit : Safari ne connaît toujours pas la forme
           standard, et sans lui le décor s'y afficherait à pleine force sous la porte. */
        maskImage: "radial-gradient(ellipse 44% 52% at 50% 44%, transparent 22%, #000 74%)",
        WebkitMaskImage: "radial-gradient(ellipse 44% 52% at 50% 44%, transparent 22%, #000 74%)",
      }}>
        {pieces.map((p, i) => {
          const gauche = "left" in p.style;
          return (
            <div key={i} style={{
              position: "absolute", ...p.style,
              /* Les pièces de gauche se tournent vers la droite et l'inverse : elles regardent
                 toutes vers la porte, comme des panneaux disposés autour d'elle. */
              transform: `translateZ(${-70 * p.recul}px) rotateY(${gauche ? 14 : -14}deg) rotateX(4deg)`,
              filter: `blur(${0.6 * p.recul}px)`,
              opacity: 0.72 - 0.1 * p.recul,
            }}>
              {p.contenu}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Les deux icônes de dossier, reprises de la rangée « Vos comptes ». */
function IconeTitres() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4 19h16v2H4zM6 10h3v7H6zm4.5-4h3v11h-3zM15 12h3v5h-3z" />
    </svg>
  );
}
function IconeEpargne() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm2 0v2h14V7zm0 4v6h14v-6z" />
    </svg>
  );
}

/**
 * L'anneau du score, dessiné comme `CircleScore` du tableau de bord.
 *
 * ⚠️ Celui-là n'est pas exporté — il vit dans la page du portefeuille. Sa géométrie est donc
 * reprise à l'identique plutôt qu'approchée : épaisseur à 16 % du diamètre, bouts arrondis, et
 * la retenue d'une épaisseur sur la longueur remplie, sans quoi un score de 100 se recouvre
 * lui-même et un score de 0 laisse une pastille.
 */
function Anneau({ note, taille }: { note: number; taille: number }) {
  const epaisseur = Math.max(8, taille * 0.16);
  const rayon = (taille - epaisseur) / 2;
  const perimetre = 2 * Math.PI * rayon;
  const rempli = note === 0 ? 0 : Math.max(epaisseur, (note / 100) * perimetre - epaisseur);
  const couleur = note >= 60 ? JETONS.positif : JETONS.negatif;
  return (
    <div style={{ position: "relative", width: taille, height: taille }}>
      <svg width={taille} height={taille} style={{ display: "block", transform: "rotate(-90deg)" }}>
        <circle cx={taille / 2} cy={taille / 2} r={rayon} fill="none"
          stroke={JETONS.bordFort} strokeWidth={epaisseur} />
        <circle cx={taille / 2} cy={taille / 2} r={rayon} fill="none"
          stroke={couleur} strokeWidth={epaisseur} strokeLinecap="round"
          strokeDasharray={`${rempli} ${perimetre}`} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center",
                    justifyContent: "center", ...NUM, fontSize: taille * 0.3, fontWeight: 700,
                    color: JETONS.texteIntense }}>
        {note}
      </div>
    </div>
  );
}
