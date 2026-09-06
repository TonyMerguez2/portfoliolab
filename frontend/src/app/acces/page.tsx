"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FONT, NUM } from "@/lib/typography";
import { JETONS, RAYONS } from "@/lib/palette";
import { champ, HAUTEUR_SAISIE } from "@/components/ui/saisie";
import Cadre from "@/components/ui/Cadre";

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

/**
 * L'effet de bord des deux champs, celui de la barre de recherche.
 *
 * ⚠️ **`.novac-surface-saisie` ne pouvait pas servir telle quelle, et il a fallu deux essais
 * pour comprendre laquelle de ses deux moitiés reprendre.** Sa *couleur* est
 * `--nv-bord`, `#101828` : posée dans une carte elle se creuse joliment, posée directement
 * sur cette page elle vaut la teinte médiane du dégradé de fond, et le champ disparaît. Mais
 * son *comportement* est exactement ce qui était demandé — un bord transparent au repos, qui
 * s'allume au survol, et un champ qui se creuse au foyer, prenant la couleur du panneau pour
 * devenir un trou plutôt qu'une plaque cerclée.
 *
 * On reprend donc le comportement à la lettre, avec une surface relevée d'un cran pour qu'il
 * se voie sur cette page-ci. ⚠️ Une classe locale et non des styles en ligne : ni `:hover` ni
 * `:focus-within` ne s'écrivent dans un attribut `style`, et c'est précisément l'état qu'on
 * veut voir.
 *
 * Le rayon est celui de la barre de recherche, `RAYONS.xl`, et non celui des champs de
 * formulaire : cette page n'a pas de formulaire dense, elle a deux pastilles isolées.
 */
const STYLE_CHAMPS = `
  .nv-champ {
    background: var(--nv-bord-fort);
    border: 1px solid transparent;
    color: var(--nv-texte);
    outline: none;
    transition: background 150ms, border-color 150ms, box-shadow 150ms;
  }
  .nv-champ:hover { border-color: var(--nv-texte-attenue); }
  .nv-champ:focus, .nv-champ:focus-visible, .nv-champ:focus-within {
    background: var(--nv-carte);
    border-color: var(--nv-texte-attenue);
    box-shadow: 0 0 0 1px var(--nv-texte-attenue);
  }
  .nv-champ-refus, .nv-champ-refus:hover { border-color: var(--nv-negatif); }
`;

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
      <style>{STYLE_CHAMPS}</style>
      <Decor />
      <div style={{ position: "relative", zIndex: 1, minHeight: "100vh",
                    display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: "center", gap: 22,
                    padding: "72px 24px", textAlign: "center" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
          <Logo taille={52} />
          <span style={{ fontSize: 38, fontWeight: 700, letterSpacing: "-0.015em",
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

        {/* ⚠️ Le paragraphe d'explication est retiré, à la demande : trois lignes sur ce que
            fait Novac, à côté d'un décor qui le montre déjà. Le titre et le décor disent la
            même chose, l'un en mots et l'autre en images ; les deux ensemble alourdissent. */}

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
                  className={`nv-champ${inscription === "refus" ? " nv-champ-refus" : ""}`}
                  onChange={e => { setEmail(e.target.value); if (inscription !== "repos") setInscription("repos"); }}
                  placeholder="vous@exemple.com"
                  style={{ ...champ, flex: 1, width: "auto", minWidth: 0, textAlign: "left",
                           borderRadius: RAYONS.xl }} />
                <button type="submit" disabled={!email || inscription === "envoi"}
                  style={{ padding: "0 20px", height: HAUTEUR_SAISIE,
                           flexShrink: 0, border: "none",
                           background: JETONS.segmentActif, color: JETONS.segmentEncre,
                           borderRadius: RAYONS.xl, opacity: email ? 1 : 0.45,
                           cursor: email && inscription !== "envoi" ? "pointer" : "default",
                           fontFamily: FONT, fontSize: 13, fontWeight: 600,
                           transition: "opacity 200ms" }}>
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
                className={`nv-champ${etat === "refus" ? " nv-champ-refus" : ""}`}
                onChange={e => { setCode(e.target.value); if (etat !== "repos") setEtat("repos"); }}
                style={{ ...champ, flex: 1, width: "auto", minWidth: 0, textAlign: "left",
                         borderRadius: RAYONS.xl }} />
              <button type="submit" disabled={!code || etat === "envoi"}
                style={{ padding: "0 16px", height: HAUTEUR_SAISIE,
                         flexShrink: 0, border: "none",
                         background: JETONS.segmentActif, color: JETONS.segmentEncre,
                         borderRadius: RAYONS.xl, opacity: code ? 1 : 0.45,
                         cursor: code && etat !== "envoi" ? "pointer" : "default",
                         fontFamily: FONT, fontSize: 13, fontWeight: 600,
                         transition: "opacity 200ms" }}>
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

      </div>

      {/* ⚠️ La mention descend en pied de page, à la demande. Posée sous le formulaire, elle
          se lisait comme une condition de l'inscription ; au bas de l'écran, elle est ce
          qu'elle est — une mention légale, qui doit être visible sans rien commander. */}
      <p style={{ position: "absolute", bottom: 22, left: 0, right: 0, zIndex: 1,
                  margin: 0, textAlign: "center", fontFamily: FONT, fontSize: 11,
                  color: JETONS.surFondAttenue, lineHeight: 1.6, padding: "0 24px" }}>
        Novac est en cours de construction. Rien de ce qui s&apos;y affiche n&apos;est un
        conseil en investissement.
      </p>
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
                 background: `rgba(var(--nv-negatif-rvb), 0.12)`,
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
  /**
   * ⚠️ **De vraies captures, prises sur un compte de démonstration.** Les versions
   * précédentes reconstituaient les écrans à la main : d'abord des rectangles colorés qui ne
   * ressemblaient à rien du site, puis des compositions fidèles mais qui restaient des
   * imitations. Ce sont maintenant des images de l'application, avec ses vraies courbes, ses
   * vrais logos et ses vrais calculs.
   *
   * ⚠️ **Jamais le portefeuille de quelqu'un.** Cette page est publique : une capture d'un
   * compte réel y publierait des montants, des lignes détenues et des noms de comptes. Le
   * compte `demo@novac.fyi` existe pour cela — chiffres inventés, titres réels pour que les
   * cours et les logos soient justes. Voir `deploiement/` et le script de semis.
   *
   * Les images se refont en une commande quand l'interface change :
   *     cd frontend && node capturer-demo.mjs
   */
  /**
   * ⚠️ **Les deux grands écrans ne débordent plus des bords.** Ils étaient posés à `-6 %` et
   * `-7 %` : le tiers d'un tableau de bord sortait de l'écran, et la rotation coupait le
   * reste en biais. Une capture tronquée à l'oblique ne se lit pas comme une fenêtre en
   * perspective mais comme une image mal cadrée. Elles rentrent maintenant en entier, un peu
   * plus petites, et la perspective seule fait la profondeur.
   */
  const pieces: { style: React.CSSProperties; recul: number; src: string; alt: string }[] = [
    { style: { top: "6%", left: "1%", width: 520 }, recul: 1,
      src: "/apercus/tableau-de-bord.png", alt: "" },
    { style: { top: "10%", right: "1%", width: 310 }, recul: 2,
      src: "/apercus/objectif.png", alt: "" },
    { style: { bottom: "24%", left: "2%", width: 235 }, recul: 2,
      src: "/apercus/carte-actif.png", alt: "" },
    { style: { bottom: "3%", left: "13%", width: 220 }, recul: 2,
      src: "/apercus/solana.png", alt: "" },
    { style: { bottom: "3%", right: "1%", width: 500 }, recul: 1,
      src: "/apercus/graphique.png", alt: "" },
  ];

  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none",
                                     overflow: "hidden", zIndex: 0, perspective: 1700 }}>
      <div style={{
        position: "absolute", inset: 0, transformStyle: "preserve-3d",
        /* ⚠️ Le masque **et** son préfixe WebKit : Safari ne connaît toujours pas la forme
           standard, et sans lui le décor s'y afficherait à pleine force sous le texte. */
        maskImage: "radial-gradient(ellipse 34% 52% at 50% 46%, transparent 36%, #000 88%)",
        WebkitMaskImage: "radial-gradient(ellipse 34% 52% at 50% 46%, transparent 36%, #000 88%)",
        /**
         * ⚠️ **L'atténuation est posée ici, sur la couche entière, et non sur chaque image.**
         * Une opacité par pièce les rend translucides *les unes aux autres* : deux cartes qui
         * se recouvrent laissent voir celle de dessous à travers celle de dessus, ce qui ne
         * ressemble à rien. Sur la couche, les pièces se composent d'abord entre elles —
         * chacune opaque, celle de devant cachant celle de derrière — et l'ensemble s'atténue
         * ensuite d'un seul coup. Le recouvrement redevient un empilement.
         */
        opacity: 0.88,
      }}>
        {pieces.map((p, i) => {
          const gauche = "left" in p.style;
          return (
            /* ⚠️ `<img>` et non `next/image` : ces quatre fichiers sont des décors de taille
               fixe, servis une fois, sur une page sans mise en page fluide. L'optimiseur de
               Next demanderait une route serveur pour un gain nul ici. */
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={p.src} alt={p.alt} style={{
              position: "absolute", ...p.style, height: "auto", display: "block",
              borderRadius: RAYONS.md,
              transformOrigin: gauche ? "left center" : "right center",
              /* ⚠️ Vingt-deux degrés, comme le concept : les pièces se tournent franchement
                 vers l'axe du titre au lieu de rester presque de face. Au-delà, le bord
                 éloigné d'un écran de cinq cents pixels cesse d'être lisible. */
              transform: `translateZ(${-80 * p.recul}px) rotateY(${gauche ? 22 : -22}deg) rotateX(3deg)`,
              /* ⚠️ `brightness` et non `opacity` pour marquer l'éloignement : une image plus
                 sombre reste opaque, une image atténuée devient un calque. Voir la couche. */
              filter: `blur(${0.4 * p.recul}px) brightness(${(1 - 0.13 * p.recul).toFixed(2)})`,
              boxShadow: "0 30px 70px rgba(0,0,0,0.55)",
            }} />
          );
        })}
      </div>
    </div>
  );
}
