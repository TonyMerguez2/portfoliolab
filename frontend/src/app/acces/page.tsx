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
import { Input } from "@appica/ui-react/input";
import { OTPField, OTPFieldInput } from "@appica/ui-react/otp-field";
import { Chip } from "@appica/ui-react/chip";
import { GradientGlow } from "@appica/ui-react/gradient-glow";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "@appica/icons-react";
import { BorderBeam } from "@appica/ui-react/border-beam";
import {
  Carousel, CarouselContent, CarouselSlide,
  CarouselPrev, CarouselNext, CarouselPagination,
} from "@appica/ui-react/carousel";

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

/**
 * Le nombre de chiffres du code d'accès.
 *
 * ⚠️ **Le champ à cases impose une longueur connue d'avance** : il en dessine autant qu'on lui
 * en annonce. Changer le code sans changer ce nombre donnerait un champ qui ne se remplit
 * jamais, ou qui se valide avant la fin.
 */
const LONGUEUR_CODE = 6;

/**
 * Les captures qui suivent la vidéo dans la galerie.
 *
 * ⚠️ **Le texte de remplacement décrit l'écran, il ne le nomme pas.** « tableau-de-bord.png »
 * n'apprend rien à qui ne voit pas l'image ; ce qu'on y trouve, si.
 */
const APERCUS = [
  { fichier: "tableau-de-bord.png", texte: "La vue générale : valeur totale, performance et score du patrimoine" },
  { fichier: "graphique.png", texte: "La courbe d'un portefeuille, avec ses achats repérés" },
  { fichier: "objectif.png", texte: "Un objectif d'épargne et sa projection" },
  { fichier: "carte-actif.png", texte: "La fiche d'une action, avec son cours et sa position" },
  { fichier: "solana.png", texte: "La fiche d'une cryptomonnaie" },
];

function Porte() {
  const parametres = useSearchParams();

  const [code, setCode] = useState("");
  const [etat, setEtat] = useState<Etat>("repos");
  const [email, setEmail] = useState("");
  const [inscription, setInscription] = useState<EtatInscription>("repos");
  const [codeOuvert, setCodeOuvert] = useState(false);

  /**
   * ⚠️ **Le code est passé en argument, il n'est pas relu dans l'état.** Le champ à six cases
   * se valide de lui-même dès la sixième frappe : appeler ce geste depuis son `onValueChange`
   * lirait un état que React n'a pas encore appliqué, donc un code amputé de son dernier
   * chiffre — refusé une fois sur une, sans rien pour l'expliquer.
   */
  async function ouvrir(saisi: string, e?: React.FormEvent) {
    e?.preventDefault();
    if (saisi.length < LONGUEUR_CODE || etat === "envoi") return;
    setEtat("envoi");
    try {
      const r = await fetch("/api/acces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motDePasse: saisi }),
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
      /* ⚠️ Le champ se vide à l'acceptation, pas à l'envoi : vidé avant la réponse, un refus
         du serveur laisserait l'adresse à retaper alors qu'elle était juste à une lettre
         près. */
      setEmail("");
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
    <main style={{ position: "relative", minHeight: "100vh",
                   /* ⚠️ La page ne tenait plus dans l'écran une fois la galerie ajoutée : elle
                      était `fixed` et coupait donc ce qui dépassait, sans barre de défilement
                      ni indice. Elle défile maintenant, et les deux repères — l'enseigne et la
                      mention — restent fixés à leur coin pour ne pas s'en aller avec. */
                   paddingBottom: 96,
                   fontFamily: FONT, color: JETONS.surFond }}>
      <style>{STYLE_CHAMPS}</style>

      <Decor />

      {/**
        * ⚠️ **L'enseigne est posée ici, et il le faut.** `CadreSite` ne monte ni le rail ni le
        * bandeau devant la porte — délibérément : ils annonceraient ce qu'on ferme. Cette page
        * doit donc écrire son enseigne elle-même, aux mêmes mesures que le bandeau du site :
        * `top: 12`, hauteur 36, marge de 20.
        */}
      <div style={{ position: "fixed", top: 12, left: 20, height: 36, zIndex: 3,
                    display: "flex", alignItems: "center", gap: 10 }}>
        <Logo taille={30} />
        <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.012em",
                       color: JETONS.surFond }}>Novac</span>
        <Chip render={<span />} size="sm" tabIndex={-1} className="cursor-default"
          style={{ marginLeft: 4 }}>
          {VERSION}
        </Chip>
      </div>

      <div style={{ position: "relative", zIndex: 1,
                    display: "flex", flexDirection: "column", alignItems: "center",
                    padding: "clamp(90px, 16vh, 190px) 24px 0", textAlign: "center" }}>

        {/**
          * ⚠️ **Le titre nomme la version, il ne la répète pas.** « Alpha 0.1 » est écrit dans
          * la pastille en haut à gauche et ici ; les deux viennent de la même constante, sinon
          * l'un des deux vieillira sans qu'on s'en aperçoive.
          */}
        <h1 style={{ margin: 0, maxWidth: "14ch",
                     fontSize: "clamp(30px, 4.4vw, 56px)", fontWeight: 700,
                     letterSpacing: "-0.03em", lineHeight: 1.08, color: JETONS.texteIntense }}>
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
                    /* ⚠️ `texteIntense` et non `surFond` : le second vaut #D1D5DC, un gris
                       clair, quand la phrase de l'accueil est en blanc franc. Les deux pages
                       affichent la même phrase — elles doivent l'écrire de la même encre. */
                    color: JETONS.texteIntense, whiteSpace: "nowrap" }}>
          {PHRASE_HAUT}{PHRASE_BAS}
          <MotQuiDefile mots={VERBES} suffixe="." largeur="6ch" />
        </p>

        <div style={{ height: 34 }} />

        {/**
          * ⚠️ **Le formulaire ne disparaît plus une fois l'adresse prise.** Il cédait la place
          * au message ; on ne voyait donc plus ce qu'on venait d'écrire, et se tromper d'adresse
          * ne laissait aucun moyen de se reprendre. La confirmation s'affiche là où s'affichent
          * les refus — même ligne, même place, seule la couleur change.
          *
          * ⚠️ `noValidate` : sans lui, `type="email"` fait refuser l'envoi par le navigateur,
          * qui affiche sa propre bulle grise. C'est l'encadré natif que le reste du site a
          * chassé, et il parle sa langue, pas celle de la page. Le champ garde son type pour le
          * clavier des téléphones ; le refus vient du serveur et s'affiche dans nos mots.
          */}
        <form onSubmit={inscrire} noValidate style={{ width: "100%", maxWidth: 420 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
            {/**
              * ⚠️ **`data-invalid` plutôt qu'une classe à nous.** Le champ d'Appica porte déjà
              * son état de refus — bord et anneau rouges — et l'attend sous cette forme. Lui
              * superposer notre `.nv-champ-refus` peindrait deux bords l'un sur l'autre.
              */}
            <Input type="email" value={email} inputMode="email" autoComplete="email"
              aria-label="Votre adresse e-mail" placeholder="vous@exemple.com"
              data-invalid={inscription === "refus" || undefined}
              onChange={e => { setEmail(e.target.value); if (inscription !== "repos") setInscription("repos"); }}
              className="flex-1 min-w-0" />
            {/**
              * ⚠️ **Une flèche et non le mot « Rejoindre ».** Le champ dit déjà ce qu'on y met,
              * et l'action reste nommée par `aria-label` pour qui n'a que le dessin. La même
              * flèche qu'en bas, pour que les deux gestes de la page se ressemblent.
              *
              * ⚠️ **Carré, `icon-md`, à la hauteur du champ.** Les crans d'icône du composant
              * sont carrés par construction : `md` en aurait fait un bouton large et vide
              * autour d'un dessin de dix-huit pixels.
              */}
            {/**
              * ⚠️ **Il ne se désactive pas une fois l'adresse prise.** Le champ se vide à la
              * confirmation, donc la condition « pas d'adresse » redevenait vraie et le bouton
              * passait en désactivé — c'est-à-dire à demi transparent, la coche avec. Le geste
              * reste sans effet, le formulaire s'en charge : ce qui compte ici est que la coche
              * se voie franchement.
              */}
            <Button type="submit" variant="outline" size="icon-md"
              aria-label="Rejoindre la liste d'attente"
              disabled={inscrit ? false : (!email || inscription === "envoi")}>
              <Coche montree={inscrit} />
            </Button>
          </div>
          {/**
            * ⚠️ **Une seule ligne pour les trois issues, et sa hauteur est réservée.** Refus,
            * panne et confirmation s'y succèdent au même endroit ; `minHeight` empêche la page
            * de sauter quand elle se remplit.
            */}
          <div style={{ minHeight: 18, marginTop: 7, fontSize: 11.5,
                        color: inscrit ? JETONS.positif : JETONS.negatif }}>
            {inscription === "refus" && "Cette adresse ne semble pas valide."}
            {inscription === "panne" && "Le serveur n'a pas répondu."}
            {inscription === "fait" && "C'est noté. Nous vous écrirons à l'ouverture des accès."}
            {inscription === "deja" && "Vous y êtes déjà. Nous vous écrirons à l'ouverture."}
          </div>
        </form>

        {/* ⚠️ La porte reste repliée derrière un bouton : ceux qui ont un code sont une
            poignée, et leur donner un champ permanent ferait croire aux autres qu'il leur en
            faut un. */}
        {/**
          * ⚠️ **Hauteur réservée : la colonne est centrée, tout ce qui change de taille ici
          * déplace le titre.** Le bouton fait 48 pixels, le champ à six cases et sa ligne de
          * message en font 65 : sans cette réserve, la page remontait d'une dizaine de pixels
          * au moment où les cases apparaissent. Relevé à l'usage.
          */}
        <div style={{ marginTop: 18, height: 70, display: "flex",
                      alignItems: "center", justifyContent: "center" }}>
          {codeOuvert ? (
            <form onSubmit={e => ouvrir(code, e)}>
              {/**
                * ⚠️ **Six cases, et plus de bouton « Entrer ».** Le code ne fait que des
                * chiffres et sa longueur est connue : il n'y a rien à confirmer une fois la
                * sixième case remplie. Un bouton n'aurait servi qu'à réclamer un geste de plus
                * pour un formulaire déjà complet.
                *
                * ⚠️ **Le champ garde le type mot de passe des navigateurs par ses cases**, mais
                * il affiche les chiffres : masquer six chiffres qu'on vient de taper n'ajoute
                * rien contre un regard par-dessus l'épaule, et retire la relecture.
                */}
              <OTPField length={LONGUEUR_CODE} value={code} aria-label="Code d'accès"
                onValueChange={(v) => {
                  setCode(v);
                  if (etat !== "repos") setEtat("repos");
                  if (v.length === LONGUEUR_CODE) ouvrir(v);
                }}>
                {Array.from({ length: LONGUEUR_CODE }, (_, i) => (
                  <OTPFieldInput key={i} placeholder="•" inputMode="numeric"
                    aria-label={`Chiffre ${i + 1} sur ${LONGUEUR_CODE}`} />
                ))}
              </OTPField>
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

      {/**
        * La galerie : la démonstration, puis les captures.
        *
        * ⚠️ **La vidéo est la première diapositive, et il faut que ce soit elle.** Les captures
        * montrent des écrans, la vidéo montre le produit en train de répondre — c'est la seule
        * qui prouve qu'il fonctionne. La reléguer après trois images en ferait une pièce
        * jointe.
        *
        * ⚠️ **Deux sources pour une vidéo, et l'ordre compte.** Le navigateur prend la première
        * qu'il sait lire : `webm` d'abord, plus légère et mieux rendue, `mp4` en repli pour
        * Safari. Les inverser ferait servir le mp4 à tout le monde.
        *
        * ⚠️ **Muette, en boucle, et jouée d'elle-même — les trois vont ensemble.** Une vidéo
        * qui se lance avec le son est bloquée par tous les navigateurs ; `muted` est ce qui
        * autorise `autoPlay`. `playsInline` évite qu'un téléphone la passe en plein écran.
        */}
      <div style={{ position: "relative", zIndex: 1, margin: "40px auto 0",
                    width: "100%", maxWidth: 880, padding: "0 24px" }}>
        <BorderBeam className="rounded-2xl">
          <Carousel loop>
            <CarouselContent>
              <CarouselSlide>
                <video
                  className="aspect-3/2 w-full rounded-2xl object-cover"
                  autoPlay muted loop playsInline preload="metadata"
                  poster="/apercus/demonstration-affiche.jpg"
                  aria-label="Le tableau de bord de Novac en fonctionnement">
                  <source src="/apercus/demonstration.webm" type="video/webm" />
                  <source src="/apercus/demonstration.mp4" type="video/mp4" />
                </video>
              </CarouselSlide>
              {APERCUS.map(a => (
                <CarouselSlide key={a.fichier}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/apercus/${a.fichier}`} alt={a.texte}
                    className="aspect-3/2 w-full rounded-2xl object-cover" />
                </CarouselSlide>
              ))}
            </CarouselContent>
            <CarouselPrev render={
              <Button variant="outline" size="icon-md" className="rounded-full">
                <ChevronLeft />
              </Button>
            } />
            <CarouselNext render={
              <Button variant="outline" size="icon-md" className="rounded-full">
                <ChevronRight />
              </Button>
            } />
            <CarouselPagination className="absolute inset-x-0 top-full mt-5 justify-center" />
          </Carousel>
        </BorderBeam>
      </div>

      {/* ⚠️ Fixée et non posée dans le flux : la page défile désormais, et cette mention doit
          rester lisible d'un bout à l'autre — c'est une mention légale, pas un pied de page
          qu'on atteint si l'on veut bien descendre. Le rembourrage du bas de `main` lui réserve
          sa place, sinon elle couvrirait la fin de la galerie. */}
      {/* ⚠️ Un voile sous la mention : fixée, elle passe par-dessus la galerie, et une capture
          claire la rendait illisible. Le dégradé s'éteint vers le haut pour ne pas dessiner de
          bande. */}
      <p style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 3,
                  textAlign: "center", fontFamily: FONT, fontSize: 11,
                  color: JETONS.surFondAttenue, lineHeight: 1.6, padding: "26px 24px 22px",
                  margin: 0,
                  background: `linear-gradient(to top, rgba(var(--nv-fond-rvb), 0.92) 40%, rgba(var(--nv-fond-rvb), 0))` }}>
        Novac est en cours de construction. Rien de ce qui s&apos;y affiche n&apos;est un
        conseil en investissement.
      </p>
    </main>
  );
}

/**
 * La flèche d'envoi, qui devient une coche une fois l'adresse prise.
 *
 * ⚠️ **Les deux dessins sont montés en permanence, superposés.** Une transition CSS ne joue
 * que sur un élément déjà présent : monter la coche au moment de la confirmation la ferait
 * apparaître d'un coup, sans le tracé. Ils se croisent donc en opacité, et la coche se dessine
 * par son trait.
 *
 * ⚠️ **Le tracé est celui du bouton de copie d'Appica, à la lettre** — même chemin, même
 * `pathLength` de 1, même `stroke-dasharray: 1 2`. Le trait est un pointillé dont le vide vaut
 * deux fois le plein : déplacer son décalage de 1,02 à 0 fait courir le plein d'un bout à
 * l'autre du chemin, ce qui *dessine* la coche au lieu de la révéler.
 */
function Coche({ montree }: { montree: boolean }) {
  const commun = {
    width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
    strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
    "aria-hidden": true,
    style: { position: "absolute" as const, inset: 0, margin: "auto",
             transition: "opacity 180ms ease" },
  };
  return (
    <span style={{ position: "relative", display: "inline-block", width: 18, height: 18 }}>
      <svg {...commun} style={{ ...commun.style, opacity: montree ? 0 : 1 }}>
        <path d="M7 17 17 7M7 7h10v10" />
      </svg>
      <svg {...commun} style={{ ...commun.style, opacity: montree ? 1 : 0 }}>
        <path d="M4.3 12.55 L9.25 17.5 L19.7 6.5" pathLength={1} strokeDasharray="1 2"
          style={{ strokeDashoffset: montree ? 0 : 1.02,
                   transition: montree
                     ? "stroke-dashoffset 350ms ease-out 100ms"
                     : "stroke-dashoffset 200ms ease-in" }} />
      </svg>
    </span>
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


