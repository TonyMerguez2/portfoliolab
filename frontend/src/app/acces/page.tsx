"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FONT, NUM } from "@/lib/typography";
import { JETONS, RAYONS } from "@/lib/palette";
import Cadre from "@/components/ui/Cadre";
import TitreDeCarte from "@/components/ui/TitreDeCarte";
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
  const [codeOuvert, setCodeOuvert] = useState(false);

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
      <div style={{ position: "relative", zIndex: 1, minHeight: "100vh",
                    display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: "center", gap: 22,
                    padding: "72px 24px", textAlign: "center" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <Logo taille={30} />
          <span style={{ fontSize: 23, fontWeight: 700, letterSpacing: "-0.01em",
                         color: JETONS.surFond }}>Novac</span>
        </div>

        <PastilleAlpha />

        {/* ⚠️ **Le titre porte la demande, et non « Code d'accès ».** La porte reste, mais elle
            n'est plus le sujet : la plupart des visiteurs de cette page n'ont pas de code et
            n'en auront pas — ce qu'on attend d'eux, c'est une adresse. La hiérarchie doit dire
            laquelle des deux actions les concerne. */}
        <h1 style={{ margin: 0, fontSize: "clamp(34px, 6.2vw, 60px)", fontWeight: 700,
                     lineHeight: 1.08, letterSpacing: "-0.025em", maxWidth: 15 + "ch",
                     color: JETONS.surFond, textWrap: "balance" }}>
          Rejoignez la liste d&apos;attente
        </h1>

        <p style={{ margin: 0, maxWidth: "52ch", fontSize: 14.5, lineHeight: 1.6,
                    color: JETONS.surFondAttenue }}>
          Un tableau de bord pour suivre votre patrimoine entier — portefeuilles, comptes,
          objectifs — et comprendre ce qui le fait bouger. Rien n&apos;y est estimé : ce qui
          manque de données le dit.
        </p>

        {/* ── La liste d'attente, action principale ──────────────────────── */}
        <div style={{ width: "100%", maxWidth: 460, marginTop: 6 }}>
          {inscrit ? (
            /* ⚠️ Le formulaire disparaît une fois l'adresse prise : le laisser invitait à
               réessayer, et « déjà inscrit » se lit alors comme un échec. */
            <Cadre style={{ padding: "18px 20px" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: JETONS.positif, marginBottom: 5 }}>
                {inscription === "deja" ? "Vous y êtes déjà." : "C'est noté."}
              </div>
              <div style={{ fontSize: 12, color: JETONS.texteAttenue, lineHeight: 1.55 }}>
                Nous vous écrirons à l&apos;ouverture des accès.
              </div>
            </Cadre>
          ) : (
            /**
              * ⚠️ `noValidate` : sans lui, `type="email"` fait refuser l'envoi par le
              * navigateur, qui affiche sa propre bulle grise. C'est l'encadré natif que le
              * reste du site a chassé, et il parle la langue du navigateur, pas celle de la
              * page. Le champ garde son type pour le clavier des téléphones ; le refus vient
              * du serveur et s'affiche dans nos mots.
              */
            <form onSubmit={inscrire} noValidate>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="email" value={email} inputMode="email" autoComplete="email"
                  aria-label="Votre adresse e-mail"
                  onChange={e => { setEmail(e.target.value); if (inscription !== "repos") setInscription("repos"); }}
                  placeholder="vous@exemple.com"
                  className="novac-surface-saisie"
                  style={{ ...champ, flex: 1, width: "auto", minWidth: 0, textAlign: "left",
                           borderColor: inscription === "refus" ? JETONS.negatif : undefined }} />
                <button type="submit" disabled={!email || inscription === "envoi"}
                  style={{ padding: "0 20px", height: HAUTEUR_SAISIE, borderRadius: RAYON_SAISIE,
                           flexShrink: 0, border: "none",
                           background: email ? JETONS.segmentActif : JETONS.carteCreuse,
                           color: email ? JETONS.segmentEncre : JETONS.texteFaible,
                           cursor: email && inscription !== "envoi" ? "pointer" : "default",
                           fontFamily: FONT, fontSize: 13, fontWeight: 600,
                           transition: "background 200ms, color 200ms" }}>
                  {inscription === "envoi" ? "…" : "Rejoindre"}
                </button>
              </div>
              <div style={{ minHeight: 18, marginTop: 7, fontSize: 11.5, color: JETONS.negatif }}>
                {inscription === "refus" && "Cette adresse ne semble pas valide."}
                {inscription === "panne" && "Le serveur n'a pas répondu."}
              </div>
            </form>
          )}
        </div>

        {/* ── La porte, action secondaire ────────────────────────────────── */}
        {/* ⚠️ Repliée derrière un mot, et non supprimée : ceux qui ont un code sont une
            poignée, et leur donner un champ permanent au milieu de la page ferait croire aux
            autres qu'il leur en faut un. Le champ s'ouvre sur demande et prend le focus, pour
            qu'un invité n'ait pas à cliquer deux fois. */}
        {codeOuvert ? (
          <form onSubmit={ouvrir} style={{ width: "100%", maxWidth: 300 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input id="code" type="password" value={code} autoComplete="current-password"
                autoFocus placeholder="Code d'accès"
                onChange={e => { setCode(e.target.value); if (etat !== "repos") setEtat("repos"); }}
                className="novac-surface-saisie"
                style={{ ...champ, flex: 1, width: "auto", minWidth: 0, textAlign: "left",
                         borderColor: etat === "refus" ? JETONS.negatif : undefined }} />
              <button type="submit" disabled={!code || etat === "envoi"}
                style={{ padding: "0 16px", height: HAUTEUR_SAISIE, borderRadius: RAYON_SAISIE,
                         flexShrink: 0, border: "none",
                         background: code ? JETONS.segmentActif : JETONS.carteCreuse,
                         color: code ? JETONS.segmentEncre : JETONS.texteFaible,
                         cursor: code && etat !== "envoi" ? "pointer" : "default",
                         fontFamily: FONT, fontSize: 13, fontWeight: 600 }}>
                {etat === "envoi" ? "…" : "Entrer"}
              </button>
            </div>
            <div style={{ minHeight: 18, marginTop: 7, fontSize: 11.5, color: JETONS.negatif }}>
              {etat === "refus" && "Code incorrect."}
              {etat === "panne" && "Le serveur n'a pas répondu."}
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setCodeOuvert(true)}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
                     fontFamily: FONT, fontSize: 12, color: JETONS.surFondAttenue,
                     textDecoration: "underline", textUnderlineOffset: 3 }}>
            J&apos;ai un code d&apos;accès
          </button>
        )}

        <p style={{ margin: "10px 0 0", maxWidth: "46ch", fontSize: 11,
                    color: JETONS.surFondAttenue, lineHeight: 1.65 }}>
          Novac est en cours de construction. Rien de ce qui s&apos;y affiche n&apos;est un
          conseil en investissement.
        </p>
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
 * Ce qu'il y a derrière la porte : des panneaux du site, inclinés vers le centre.
 *
 * ⚠️ **Troisième version, et les deux premières disent pourquoi celle-ci.** Six vignettes
 * alignées avec titre et paragraphe faisaient une brochure — on la lit, on ne la désire pas.
 * Des fragments dessinés à la main faisaient pire : ils ne ressemblaient pas au site, donc ils
 * promettaient faux. Ici ce sont des **panneaux entiers**, montés avec les composants réels, et
 * penchés vers l'axe du texte comme des écrans posés autour de celui qu'on regarde.
 *
 * ⚠️ **Chaque pièce regarde la porte.** Celles de gauche pivotent vers la droite, celles de
 * droite vers la gauche, toutes reculées sur l'axe Z et légèrement floutées à mesure qu'elles
 * s'éloignent. C'est ce qui fait la profondeur : une opacité uniforme donnait une brochure
 * passée à l'eau.
 *
 * ⚠️ **Le voile radial prime sur tout le reste.** Le décor s'efface vers le centre pour que le
 * titre et le formulaire se lisent sans effort — c'est le formulaire qui recueille les
 * adresses, pas le décor.
 *
 * ⚠️ **Rien n'est atteignable** : `aria-hidden` et `pointer-events: none`. Au clavier comme au
 * lecteur d'écran, cette page n'a que deux champs et deux boutons.
 */
function Decor() {
  const actif = (ticker: string, weight: number, price: number, change: number,
                 value: number, perfEur: number, spark: number[]): GridAsset =>
    ({ ticker, weight, price, change, value, perfEur, spark });

  const pieces: { style: React.CSSProperties; recul: number; contenu: React.ReactNode }[] = [
    { style: { top: "9%", left: "-2%", width: 380 }, recul: 1, contenu: <PanneauVueGenerale /> },
    { style: { top: "8%", right: "-1%", width: 400 }, recul: 1, contenu: <PanneauComptes /> },
    { style: { bottom: "6%", left: "1%", width: 360 }, recul: 2, contenu: <PanneauObjectif /> },
    { style: { bottom: "7%", right: "3%", width: 220 }, recul: 2,
      contenu: <CarteActif inerte a={actif("ESE.PA", 42, 33.6, 6.19, 5267, 307.03,
        [30.1, 30.6, 30.4, 31.2, 31.0, 31.9, 32.4, 32.2, 33.1, 33.6])} /> },
  ];

  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none",
                                     overflow: "hidden", zIndex: 0, perspective: 1600 }}>
      <div style={{
        position: "absolute", inset: 0, transformStyle: "preserve-3d",
        /* ⚠️ Le masque **et** son préfixe WebKit : Safari ne connaît toujours pas la forme
           standard, et sans lui le décor s'y afficherait à pleine force sous le texte. */
        maskImage: "radial-gradient(ellipse 40% 58% at 50% 48%, transparent 30%, #000 82%)",
        WebkitMaskImage: "radial-gradient(ellipse 40% 58% at 50% 48%, transparent 30%, #000 82%)",
      }}>
        {pieces.map((p, i) => {
          const gauche = "left" in p.style;
          return (
            <div key={i} style={{
              position: "absolute", ...p.style,
              transformOrigin: gauche ? "left center" : "right center",
              transform: `translateZ(${-90 * p.recul}px) rotateY(${gauche ? 22 : -22}deg) rotateX(3deg)`,
              filter: `blur(${0.5 * p.recul}px)`,
              opacity: 0.8 - 0.12 * p.recul,
            }}>
              {p.contenu}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Le panneau « Vue générale » : la valeur, sa variation, la note, le rail de périodes. */
function PanneauVueGenerale() {
  return (
    <Cadre style={{ padding: "13px 15px" }}>
      <TitreDeCarte>Vue générale</TitreDeCarte>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ ...NUM, fontSize: 27, fontWeight: 700, color: JETONS.texteIntense,
                        letterSpacing: "-0.01em" }}>10 336,94 €</div>
          <div style={{ ...NUM, fontSize: 12, fontWeight: 600, color: JETONS.positif, marginTop: 4 }}>
            +307,03 €  (+7,10 %)
          </div>
          <div style={{ fontFamily: FONT, fontSize: 10.5, color: JETONS.texteFaible, marginTop: 3 }}>
            depuis le 6 février 2026
          </div>
        </div>
        <Anneau note={75} taille={72} />
      </div>
      <div style={{ marginTop: 12 }}><RailPeriodes /></div>
    </Cadre>
  );
}

/** Le panneau « Mes comptes » : deux dossiers, tels que le tableau de bord les range. */
function PanneauComptes() {
  return (
    <Cadre style={{ padding: "13px 15px" }}>
      <TitreDeCarte>Mes comptes</TitreDeCarte>
      <div style={{ display: "flex", gap: 10 }}>
        <CarteCompte nom="Crédit agricole épargne" couleur="#00D492"
          compte={<span style={{ ...NUM }}>5 000,00 €</span>} icone={<IconeEpargne />} />
        <CarteCompte nom="PEA Trade Republic" couleur="#5B6CF0"
          compte={<span style={{ ...NUM }}>5 266,94 €</span>} icone={<IconeTitres />} />
      </div>
    </Cadre>
  );
}

/** Le panneau « Mes objectifs » : un objectif et sa progression. */
function PanneauObjectif() {
  const part = 56;
  return (
    <Cadre style={{ padding: "13px 15px" }}>
      <TitreDeCarte>Mes objectifs</TitreDeCarte>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ width: 30, height: 30, borderRadius: RAYONS.sm, flexShrink: 0,
                       background: `${JETONS.accent}22`, color: JETONS.accent,
                       display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 3 2 12h3v8h5v-5h4v5h5v-8h3z" />
          </svg>
        </span>
        <span style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: JETONS.texte }}>
          Achat résidence principale
        </span>
        <span style={{ ...NUM, marginLeft: "auto", fontSize: 12.5, fontWeight: 700,
                       color: JETONS.texteIntense }}>{part} %</span>
      </div>
      <div style={{ ...NUM, fontSize: 11.5, color: JETONS.texteSecondaire, marginBottom: 7 }}>
        28 000 € / 50 000 €
      </div>
      {/* La piste est celle des barres du score : `bordFort`, le vide de l'anneau. */}
      <span style={{ display: "block", height: 8, borderRadius: 4, background: JETONS.bordFort,
                     overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", width: `${part}%`, borderRadius: 4,
                       background: JETONS.positif }} />
      </span>
      <div style={{ fontFamily: FONT, fontSize: 10.5, color: JETONS.texteFaible, marginTop: 8 }}>
        Objectif prévu en 2028
      </div>
    </Cadre>
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

/**
 * Le rail de périodes, avec la performance sur la pastille retenue.
 *
 * ⚠️ `Segments` n'est pas employé ici : il attend un `onChange` et un état, donc un rail
 * qu'on peut manipuler. Celui-ci est un décor derrière un masque, hors du parcours au
 * clavier ; lui donner un état vivant l'aurait fait exister pour rien.
 */
function RailPeriodes() {
  const periodes = ["24h", "1S", "1M", "3M", "6M", "1A", "Max"];
  const retenue = "6M";
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 4px",
                  borderRadius: RAYONS.plein, background: JETONS.segmentPiste }}>
      {periodes.map(p => (
        <span key={p} style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: p === retenue ? "3px 9px" : "3px 8px", borderRadius: RAYONS.plein,
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
