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

  /**
   * ⚠️ **Le décor disparaît sous 900 px, et ce n'est pas une facilité.** Mesuré à 375 px : la
   * carte d'objectif recouvrait le nom du site, celle d'Apple passait derrière le champ
   * e-mail, et la capture de NVDA sous la mention légale. Les pièces sont posées en
   * pourcentages depuis les quatre coins d'une composition pensée en paysage ; sur une
   * colonne de trois cent soixante-quinze pixels, ces quatre coins se rejoignent au milieu et
   * il n'y a plus de marge où les loger.
   *
   * Les réduire n'aurait rien réglé : à cette largeur, un tableau de bord lisible tient déjà
   * toute la place, et illisible il ne montre plus rien. Sur téléphone la page garde donc le
   * nom, la promesse et le champ — ce pour quoi on y vient — sur un fond propre.
   */
  @media (max-width: 900px) { .nv-decor { display: none; } }

  /**
   * La carte se coupe en deux : le formulaire à gauche, la démonstration à droite.
   *
   * ⚠️ **Une grille et non deux colonnes flottantes** : les deux moitiés doivent faire la
   * même hauteur quoi qu'il arrive, sinon la vidéo dépasse du cadre ou laisse un trou sous
   * elle. « minmax(0, …) » empêche la colonne de texte de refuser de se resserrer — sans lui,
   * une adresse longue dans le champ élargirait la carte au-delà de l'écran.
   */
  .nv-porte {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr);
    align-items: stretch;
  }
  .nv-demo { min-height: 460px; }

  /**
   * ⚠️ **Sous 900 px, une seule colonne et la vidéo passe dessous, plus courte.** Elle n'est
   * pas retirée comme l'était le décor : ici elle *est* l'argument, et une page qui promet un
   * tableau de bord sans en montrer un ne promet rien. Mais elle passe après le formulaire —
   * sur un téléphone, on décide en trois secondes, et ce qu'on doit trouver d'abord est le
   * champ.
   */
  @media (max-width: 900px) {
    .nv-porte { grid-template-columns: minmax(0, 1fr); }
    .nv-demo { min-height: 0; aspect-ratio: 880 / 568; }
  }
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
      {/**
        * ⚠️ **Une carte au centre, coupée en deux : ce qu'on remplit à gauche, ce qu'on
        * regarde à droite.** Les quatre captures posées aux coins ont vécu deux versions ;
        * elles montraient bien le site mais laissaient le formulaire seul au milieu d'un
        * décor, sans rien qui les relie. Dans une carte, la démonstration devient l'argument
        * du formulaire d'à côté — on voit ce à quoi on s'inscrit.
        */}
      <div style={{ position: "relative", zIndex: 1, minHeight: "100vh",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "48px 24px 24px" }}>
        <Cadre style={{ width: "100%", maxWidth: 1060 }}>
          <div className="nv-porte">
            {/* ── À gauche : ce qu'il faut remplir ─────────────────────── */}
            <div style={{ padding: "34px 34px 30px", display: "flex", flexDirection: "column",
                          justifyContent: "center", minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 26 }}>
                <Logo taille={26} />
                <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em",
                               color: JETONS.surFond }}>Novac</span>
              </div>

              <PastilleAlpha />

              <h1 style={{ margin: "18px 0 12px", fontSize: "clamp(30px, 3.4vw, 42px)",
                           fontWeight: 700, lineHeight: 1.08, letterSpacing: "-0.025em",
                           color: JETONS.surFond, textWrap: "balance" }}>
                Rejoignez la liste d&apos;attente
              </h1>

              <p style={{ margin: "0 0 22px", maxWidth: "40ch", fontSize: 13.5, lineHeight: 1.6,
                          color: JETONS.surFondAttenue }}>
                Suivez votre patrimoine entier — portefeuilles, comptes, objectifs — et
                comprenez ce qui le fait bouger.
              </p>

              {inscrit ? (
                /* ⚠️ Le formulaire disparaît une fois l'adresse prise : le laisser invitait à
                   réessayer, et « déjà inscrit » se lit alors comme un échec. */
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: JETONS.positif, marginBottom: 5 }}>
                    {inscription === "deja" ? "Vous y êtes déjà." : "C'est noté."}
                  </div>
                  <div style={{ fontSize: 12.5, color: JETONS.texteAttenue, lineHeight: 1.55 }}>
                    Nous vous écrirons à l&apos;ouverture des accès.
                  </div>
                </div>
              ) : (
                /**
                  * ⚠️ `noValidate` : sans lui, `type="email"` fait refuser l'envoi par le
                  * navigateur, qui affiche sa propre bulle grise. C'est l'encadré natif que le
                  * reste du site a chassé, et il parle sa langue, pas celle de la page. Le
                  * champ garde son type pour le clavier des téléphones ; le refus vient du
                  * serveur et s'affiche dans nos mots.
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
                      style={{ padding: "0 20px", height: HAUTEUR_SAISIE, borderRadius: RAYONS.xl,
                               flexShrink: 0, border: "none",
                               background: JETONS.segmentActif, color: JETONS.segmentEncre,
                               opacity: email ? 1 : 0.45,
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

              {/* ⚠️ La porte reste, repliée derrière un mot : ceux qui ont un code sont une
                  poignée, et leur donner un champ permanent ferait croire aux autres qu'il
                  leur en faut un. */}
              <div style={{ marginTop: 14 }}>
                {codeOuvert ? (
                  <form onSubmit={ouvrir}>
                    <div style={{ display: "flex", gap: 8, maxWidth: 320 }}>
                      <input id="code" type="password" value={code} autoComplete="current-password"
                        autoFocus placeholder="Code d'accès"
                        className={`nv-champ${etat === "refus" ? " nv-champ-refus" : ""}`}
                        onChange={e => { setCode(e.target.value); if (etat !== "repos") setEtat("repos"); }}
                        style={{ ...champ, flex: 1, width: "auto", minWidth: 0, textAlign: "left",
                                 borderRadius: RAYONS.xl }} />
                      <button type="submit" disabled={!code || etat === "envoi"}
                        style={{ padding: "0 16px", height: HAUTEUR_SAISIE, borderRadius: RAYONS.xl,
                                 flexShrink: 0, border: "none",
                                 background: JETONS.segmentActif, color: JETONS.segmentEncre,
                                 opacity: code ? 1 : 0.45,
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
            </div>

            {/* ── À droite : la démonstration ──────────────────────────── */}
            <Demonstration />
          </div>
        </Cadre>
      </div>

      {/* ⚠️ `sticky` et non `absolute` : posée en absolu, elle se superposait au contenu dès
          que la page devenait plus haute que l'écran — le cas sur téléphone. En `sticky` elle
          se colle au bas de l'écran quand il reste de la place, et reprend sa place dans le
          flux quand il n'y en a plus. */}
      <p style={{ position: "sticky", bottom: 22, zIndex: 1, marginTop: -30,
                  marginBottom: 22, textAlign: "center", fontFamily: FONT, fontSize: 11,
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
  return (
    <div aria-hidden="true" className="nv-decor"
      style={{
        position: "absolute", top: "-18%", right: "-14%", pointerEvents: "none",
        width: "min(820px, 78vw)", aspectRatio: "1", zIndex: 0, opacity: 0.5,
        /**
         * ⚠️ **Le procédé de la page d'accueil : le dessin sert de masque au fond, il n'est
         * pas peint.** Le filigrane laisse passer le dégradé de la page teinté d'un souffle
         * d'accent, ce qui le fait *partie* du fond au lieu d'une image posée dessus. Les
         * quatre captures qui occupaient les coins ont vécu ici : elles sont maintenant dans
         * la vidéo, à leur place, en mouvement — ce qu'aucune image fixe ne montre.
         */
        background: [
          "linear-gradient(rgba(var(--nv-accent-rvb), 0.08), rgba(var(--nv-accent-rvb), 0.08))",
          "var(--nv-fond-degrade)",
        ].join(", "),
        maskImage: "url(/logo-hivesync.svg)", WebkitMaskImage: "url(/logo-hivesync.svg)",
        maskSize: "contain", WebkitMaskSize: "contain",
        maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat",
        maskPosition: "center", WebkitMaskPosition: "center",
      }} />
  );
}


/**
 * La démonstration : une visite du site, filmée sur le compte de démonstration.
 *
 * ⚠️ **Filmée, et jamais sur le portefeuille de quelqu'un.** Cette page est publique ; une
 * capture d'un compte réel y publierait des montants, des lignes détenues et des noms de
 * comptes. Le compte `demo@novac.fyi` existe pour cela — chiffres inventés, titres réels
 * pour que les cours et les logos soient justes. La vidéo se refait en une commande quand
 * l'interface change : `cd frontend && node filmer-demo.mjs`.
 *
 * ⚠️ **Muette, en boucle, sans commande.** Une démonstration de décor n'est pas un film qu'on
 * regarde : elle tourne pendant qu'on lit à côté. Le son couperait la lecture, et une barre
 * de lecture inviterait à un geste qui n'a rien à donner. `playsInline` est ce qui l'empêche
 * de passer en plein écran sur iPhone, où la lecture automatique bascule sinon.
 *
 * ⚠️ **`poster` n'est pas un ornement** : sur une connexion lente, la première image s'affiche
 * pendant que la vidéo charge, au lieu d'un rectangle noir dans la carte.
 */
function Demonstration() {
  return (
    <div className="nv-demo" style={{ position: "relative", overflow: "hidden",
                                      background: JETONS.fondProfond }}>
      {/**
        * ⚠️ **Deux encodages, et l'ordre compte.** Le navigateur retient la première source
        * qu'il sait lire : VP9 d'abord, parce qu'à qualité égale il pèse deux fois moins que
        * le H.264 ; celui-ci ensuite, pour les Safari qui ne lisent pas le WebM.
        *
        * ⚠️ La première version était encodée en VP8 — le seul codec du ffmpeg embarqué par
        * Playwright — à 620 kb/s sur une image de 880 px. Le texte de l'interface y partait en
        * bouillie. Filmée à 1600 px et réencodée en VP9, elle est deux fois plus définie et
        * *plus légère* : 674 ko contre 1,5 Mo.
        */}
      <video
        poster="/apercus/demonstration-affiche.jpg"
        autoPlay muted loop playsInline preload="metadata"
        aria-hidden="true"
        style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}>
        <source src="/apercus/demonstration.webm" type="video/webm" />
        <source src="/apercus/demonstration.mp4" type="video/mp4" />
      </video>
      {/* ⚠️ Un voile très léger, du côté du texte : sans lui, le bord clair de la vidéo vient
          buter contre la colonne de gauche et les deux moitiés se disputent l'œil. */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none",
        background: `linear-gradient(90deg, ${JETONS.carte} 0%, rgba(0,0,0,0) 22%)` }} />
    </div>
  );
}
