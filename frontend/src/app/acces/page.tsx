"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FONT, NUM } from "@/lib/typography";
import { JETONS, RAYONS } from "@/lib/palette";
import { champ, HAUTEUR_SAISIE } from "@/components/ui/saisie";
import MotQuiDefile from "@/components/MotQuiDefile";
import { PHRASE_HAUT, PHRASE_BAS, VERBES } from "@/lib/phrase";
import { VERSION } from "@/lib/version";
import { Button } from "@appica/ui-react/button";
import { Chip } from "@appica/ui-react/chip";
import { GradientGlow } from "@appica/ui-react/gradient-glow";
import { ArrowUpRight } from "@appica/icons-react";

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
    /**
     * ⚠️ **La page reprend la composition de l'accueil, et c'est délibéré.** Elle a longtemps
     * porté une carte coupée en deux — le formulaire à gauche, une vidéo de démonstration à
     * droite. Deux entrées du même produit, deux mises en page sans rapport : celui qui
     * franchit la porte changeait de site en la franchissant. Même fond, même phrase, même
     * enseigne — la porte annonce ce qu'elle ouvre.
     *
     * ⚠️ **La vidéo de démonstration part avec la carte.** Elle existe toujours dans
     * `public/apercus/` ; c'est la mise en page qui n'a plus d'endroit où la loger, pas le
     * fichier qui a disparu.
     */
    <main style={{ position: "fixed", inset: 0, overflow: "hidden",
                   fontFamily: FONT, color: JETONS.surFond }}>
      <style>{STYLE_CHAMPS}</style>

      <Decor />

      {/**
        * ⚠️ **L'enseigne est posée ici, et il le faut.** `CadreSite` ne monte ni le rail ni le
        * bandeau devant la porte — délibérément : ils annonceraient ce qu'on ferme. Cette page
        * doit donc écrire son enseigne elle-même, aux mêmes mesures que le bandeau du site :
        * `top: 12`, hauteur 36, marge de 20.
        */}
      <div style={{ position: "absolute", top: 12, left: 20, height: 36, zIndex: 2,
                    display: "flex", alignItems: "center", gap: 10 }}>
        <Logo taille={30} />
        <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.012em",
                       color: JETONS.surFond }}>Novac</span>
        <Chip render={<span />} size="sm" tabIndex={-1} className="cursor-default"
          style={{ marginLeft: 4 }}>
          {VERSION}
        </Chip>
      </div>

      <div style={{ position: "relative", zIndex: 1, height: "100%",
                    display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: "center", padding: "0 24px", textAlign: "center" }}>

        {/**
          * ⚠️ **Le titre nomme la version, il ne la répète pas.** « Alpha 0.1 » est écrit dans
          * la pastille en haut à gauche et ici ; les deux viennent de la même constante, sinon
          * l'un des deux vieillira sans qu'on s'en aperçoive.
          */}
        <h1 style={{ margin: 0, maxWidth: "14ch",
                     fontSize: "clamp(30px, 4.4vw, 56px)", fontWeight: 700,
                     letterSpacing: "-0.03em", lineHeight: 1.08, color: JETONS.surFond }}>
          Liste d&apos;attente pour l&apos;{VERSION.toLowerCase()}
        </h1>

        {/**
          * ⚠️ **La phrase de l'accueil, en petit, et tirée du même fichier.** L'écrire à la
          * main ici, c'est accepter que les deux pages divergent au premier changement de mot.
          * Le verbe garde sa ligne : sa largeur pousserait le texte qui précède à chaque
          * rotation, le bloc étant centré — c'est la raison qui a valu trois tentatives sur
          * l'accueil.
          *
          * ⚠️ **Sur une seule ligne ici, contrairement à l'accueil.** Le verbe est donc dans la
          * phrase, avec une place réservée de six caractères — la moyenne des cinq. Sans cette
          * réserve, « performer » et « grandir » n'ayant pas la même largeur, tout le texte qui
          * précède glisserait à chaque rotation.
          *
          * ⚠️ **`nowrap` et pas de largeur maximale** : la ligne doit rester entière. Elle
          * mesure une cinquantaine de caractères, donc le corps la borne — c'est le `clamp` qui
          * l'empêche de déborder sur un téléphone, pas un retour à la ligne.
          */}
        <p style={{ margin: "18px 0 0", fontSize: "clamp(11px, 1.35vw, 17px)", lineHeight: 1.45,
                    color: JETONS.surFondAttenue, whiteSpace: "nowrap" }}>
          {PHRASE_HAUT}{PHRASE_BAS}
          <MotQuiDefile mots={VERBES} suffixe="." largeur="6ch" />
        </p>

        <div style={{ height: 34 }} />

        {inscrit ? (
          /* ⚠️ Le formulaire disparaît une fois l'adresse prise : le laisser invitait à
             réessayer, et « déjà inscrit » se lit alors comme un échec. */
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: JETONS.positif, marginBottom: 5 }}>
              {inscription === "deja" ? "Vous y êtes déjà." : "C'est noté."}
            </div>
            <div style={{ fontSize: 13, color: JETONS.texteAttenue, lineHeight: 1.55 }}>
              Nous vous écrirons à l&apos;ouverture des accès.
            </div>
          </div>
        ) : (
          /**
            * ⚠️ `noValidate` : sans lui, `type="email"` fait refuser l'envoi par le navigateur,
            * qui affiche sa propre bulle grise. C'est l'encadré natif que le reste du site a
            * chassé, et il parle sa langue, pas celle de la page. Le champ garde son type pour
            * le clavier des téléphones ; le refus vient du serveur et s'affiche dans nos mots.
            */
          <form onSubmit={inscrire} noValidate style={{ width: "100%", maxWidth: 420 }}>
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

        {/* ⚠️ La porte reste repliée derrière un bouton : ceux qui ont un code sont une
            poignée, et leur donner un champ permanent ferait croire aux autres qu'il leur en
            faut un. */}
        <div style={{ marginTop: 18 }}>
          {codeOuvert ? (
            <form onSubmit={ouvrir}>
              <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: 320 }}>
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
            /**
              * ⚠️ **Le même bouton que « Ouvrir mon portefeuille », halo compris.** Demandé
              * ainsi. Il attire donc plus l'œil que le champ d'inscription juste au-dessus,
              * alors qu'il s'adresse à une poignée de gens — c'est un choix de mise en avant,
              * pas un accident : signalé une fois, il suffit d'inverser les deux si l'usage
              * dit le contraire.
              */
            <GradientGlow from="#8EC5FF" via="#EFADF7" to="#FFD69B"
              pressScale className="rounded-[16px]">
              <Button size="lg" onClick={() => setCodeOuvert(true)}>
                Utiliser un code d&apos;accès
                <ArrowUpRight data-icon="end" />
              </Button>
            </GradientGlow>
          )}
        </div>
      </div>

      {/* ⚠️ Posée en absolu et non dans le flux : la colonne du milieu occupe toute la hauteur,
          et la mention doit rester collée au bas de l'écran sans la comprimer. */}
      <p style={{ position: "absolute", left: 0, right: 0, bottom: 22, zIndex: 1,
                  textAlign: "center", fontFamily: FONT, fontSize: 11,
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
   * ⚠️ **Le même fond que l'accueil, à la lettre.** Cette page portait son propre filigrane :
   * le dessin du logo servant de masque au dégradé, donc une forme *plus claire* que le fond.
   * L'accueil, lui, a fini par le dessiner avec la trame de points — la même que celle du
   * fond, simplement plus dense — et cette version-là respire. Deux pages d'entrée avec deux
   * fonds différents, c'était une incohérence de plus à tenir à jour.
   *
   * La classe `.nv-silhouette` porte tout : la trame, ses deux masques, le dégradé de densité
   * et le battement par fondu entre deux tailles. Rien à recopier ici.
   *
   * ⚠️ **Plus de coupure sous 900 px.** Une règle effaçait le décor sur téléphone, et
   * c'était juste tant qu'il s'agissait d'une grande image posée dans un coin. Un fond plein
   * écran n'encombre rien : l'accueil garde le sien sur téléphone, cette page fait pareil,
   * sans quoi « le même fond » ne serait vrai que sur grand écran.
   */
  return <div aria-hidden="true" className="nv-silhouette"
    style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }} />;
}


