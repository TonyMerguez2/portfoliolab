"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  RAYON_TETE, type Orientation, type ReglagesOeil, cheminOeil, cheminsSurLaTete,
} from "@/lib/avatarSpherique";
import { PRESETS, SKINS, type Palette, skinParCle } from "@/lib/avatarSkins";
import { type EtatVie, VIE_AU_REPOS, creerVie } from "@/lib/avatarVie";
import { ETATS } from "@/lib/avatarEtats";

/**
 * Prototype 02 — un regard construit par le calcul, pas par le dessin.
 *
 * ⚠️ **Il n'existe qu'un seul contour dans toute la page.** Chaque œil est la même
 * capsule ; ce que la rotation change, c'est la surface sur laquelle elle est peinte.
 * L'alternative habituelle — un SVG par orientation — bloque les valeurs
 * intermédiaires, oblige à tout redessiner à la moindre retouche de la forme, et
 * n'aurait de toute façon pas permis de suivre un curseur en continu.
 *
 * La géométrie est dans [`avatarSpherique.ts`](../../lib/avatarSpherique.ts), à part
 * et sans React : c'est ce qui permet de la tester sur des centaines d'orientations
 * sans rien afficher, notamment l'invariant qui compte — aucun point ne sort jamais
 * de la tête.
 *
 * ⚠️ **Le suivi et le clignement ne sont pas des animations plaquées.** Ni l'un ni
 * l'autre n'ajoute d'image ou de calque : le suivi bouge les deux entrées de la
 * projection, le clignement fait tendre la hauteur de la capsule vers zéro. Tout
 * repasse par la même chaîne géométrique, donc un œil qui cligne alors que la tête est
 * tournée se ferme **en suivant la courbure** au lieu de s'aplatir à plat.
 *
 * ⚠️ **Les couleurs sont celles de la maquette, pas celles du thème.** Le panneau
 * reste noir et blanc quel que soit le réglage clair/sombre de l'application. C'est
 * délibéré : la référence visuelle se reproduit d'abord fidèlement, le raccord au
 * système de couleurs vient ensuite — sans quoi on ne saurait plus, en regardant
 * l'écran, ce qui vient de la maquette et ce qui vient du thème.
 */

const ACCENT = "#6366F1";
const ENCRE = "#121214";
/** Le fond du panneau sombre, derrière la tête — distinct de la couleur des yeux. */
const FOND = "#121214";
const TITRE = "#0B0B12";
const TEXTE = "#5F5F6B";
const DOUX = "#7A7A87";
const BORD = "#E8E8EE";
const PISTE = "#E4E4EB";

/**
 * Les expressions, et tout ce qu'elles changent : un angle.
 *
 * ⚠️ Aucune ne charge de nouveau dessin. « Fâché » incline les deux capsules l'une
 * vers l'autre, « triste » les incline en sens inverse, et le miroir entre l'œil
 * gauche et l'œil droit est fait par la géométrie. C'est la démonstration la plus
 * directe de l'intérêt du procédé : une expression tient dans un nombre.
 */
const EXPRESSIONS = [
  { cle: "neutre", libelle: "Neutre", inclinaison: 0 },
  { cle: "fache", libelle: "Fâché", inclinaison: 16 },
  { cle: "triste", libelle: "Triste", inclinaison: -16 },
] as const;

type CleExpression = (typeof EXPRESSIONS)[number]["cle"];


/** Constante de temps de l'amorti du regard : le suivi glisse, il ne saute pas. */
const AMORTI = 95;

const rad = (degres: number) => (degres * Math.PI) / 180;
const borner = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Deux états de vie assez proches pour qu'un nouveau rendu ne montre rien de plus. */
function identiques(a: EtatVie, b: EtatVie): boolean {
  const cles: (keyof EtatVie)[] = [
    "fermetureGauche", "fermetureDroite", "lacet", "tangage", "roulis",
    "largeur", "hauteur", "ecart", "courbure", "inclinaison",
    "echelleX", "echelleY", "suivi",
  ];
  for (const cle of cles) if (Math.abs(a[cle] - b[cle]) > 1e-4) return false;
  return true;
}

export default function AvatarProceduralPage() {
  const [lacet, setLacet] = useState(-2);
  const [tangage, setTangage] = useState(0);
  const [vie, setVie] = useState<EtatVie>(VIE_AU_REPOS);
  const [expression, setExpression] = useState<CleExpression>("neutre");
  const [largeur, setLargeur] = useState(19);
  const [hauteur, setHauteur] = useState(66);
  const [taille, setTaille] = useState(1.23);
  const [ecart, setEcart] = useState(18);
  const [suivi, setSuivi] = useState(true);
  const [amplitude, setAmplitude] = useState(13);
  const [clignement, setClignement] = useState(true);
  const [cadence, setCadence] = useState(4.5);
  const [etat, setEtat] = useState("neutre");
  const [derive, setDerive] = useState(3);
  const [skin, setSkin] = useState("uni");
  const [palette, setPalette] = useState<Palette>(skinParCle("uni").palette);

  /**
   * Les aplats du skin, dans le repère de la tête au repos.
   *
   * ⚠️ **Calculés une fois par skin, pas une fois par image.** Le contour d'un motif ne
   * dépend ni de l'orientation ni des couleurs : seuls la rotation et la projection
   * changent d'une image à l'autre. Le ballon de basket porte huit fuseaux de
   * quatre-vingt-dix points ; les refaire à chaque battement de cœur du suivi aurait
   * coûté sept cents transformations trigonométriques pour rien.
   */
  const motifs = useMemo(() => skinParCle(skin).motifs(palette), [skin, palette]);

  /**
   * L'orientation rendue : la pose choisie, plus ce que la vie y ajoute.
   *
   * ⚠️ **Une somme, pas un remplacement.** Les curseurs continuent de dire la pose de
   * fond ; la dérive et les gestes ne font qu'osciller autour. Sans cette séparation,
   * un geste écraserait le réglage de l'utilisateur, et régler une pose de trois quarts
   * deviendrait impossible dès qu'un mouvement automatique passe.
   */
  const orientation: Orientation = useMemo(() => ({
    lacet: rad(lacet + vie.lacet),
    tangage: rad(tangage + vie.tangage),
    roulis: rad(vie.roulis),
  }), [lacet, tangage, vie]);

  const cheminsMotifs = useMemo(
    () => motifs.map(m => ({
      d: cheminsSurLaTete(m.morceaux, orientation),
      couleur: m.couleur,
      trait: m.trait,
      epaisseur: m.epaisseur,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [motifs, orientation]);

  /** Choisir un skin **propose** sa palette ; elle reste modifiable ensuite. */
  const choisirSkin = useCallback((cle: string) => {
    setSkin(cle);
    setPalette(skinParCle(cle).palette);
  }, []);

  const inclinaison = EXPRESSIONS.filter(e => e.cle === expression)[0].inclinaison;

  /**
   * La pose visée, et la pose de repos.
   *
   * ⚠️ **Deux valeurs et non une, parce que le suivi doit pouvoir rendre la main.**
   * Le repos est ce que les curseurs et le glisser ont réglé ; la cible est le repos
   * plus l'écart dû à la souris. Sans cette séparation, promener le curseur écraserait
   * la pose choisie et les deux réglages se battraient — le curseur reviendrait sur sa
   * valeur dès qu'on bouge la souris.
   */
  const cible = useRef({ lacet: -2, tangage: 0 });
  const repos = useRef({ lacet: -2, tangage: 0 });
  const svgRef = useRef<SVGSVGElement | null>(null);

  /**
   * ⚠️ La taille globale multiplie **aussi** l'écart, et pas seulement la capsule.
   * Ne redimensionner que les yeux les aurait rapprochés en proportion à mesure
   * qu'ils grossissent : le regard se serait resserré au lieu de grandir.
   *
   * ⚠️ **Le clignement passe par la hauteur, pas par un masque.** Poser une paupière
   * par-dessus aurait demandé une seconde forme, à déformer elle aussi et à tenir
   * d'accord avec la première. Ici l'œil qui se ferme est le même œil, avec une
   * hauteur qui tend vers la fente — donc il se ferme correctement même vu de biais.
   */
  /**
   * Les réglages d'**un** œil, à sa propre fermeture.
   *
   * ⚠️ **Un jeu par œil, et c'est ce qui rend le clin d'œil possible.** Tant que les
   * deux yeux partageaient les mêmes réglages, ils ne pouvaient que se fermer ensemble
   * — un clin d'œil n'était qu'un clignement lent.
   */
  const reglagesOeil = useCallback((fermeture: number): ReglagesOeil => {
    const largeurRendue = largeur * taille * vie.largeur;
    const ouverte = hauteur * taille * vie.hauteur;
    const fente = Math.max(1.5, largeurRendue * 0.12);
    return {
      ecart: ecart * taille * vie.ecart,
      elevation: 0,
      largeur: largeurRendue,
      hauteur: ouverte + (fente - ouverte) * fermeture,
      inclinaison: rad(inclinaison + vie.inclinaison),
      courbure: vie.courbure,
    };
  }, [ecart, taille, largeur, hauteur, inclinaison, vie]);

  const oeilGauche = useMemo(
    () => cheminOeil(reglagesOeil(vie.fermetureGauche), orientation, -1),
    [reglagesOeil, vie.fermetureGauche, orientation]);
  const oeilDroit = useMemo(
    () => cheminOeil(reglagesOeil(vie.fermetureDroite), orientation, 1),
    [reglagesOeil, vie.fermetureDroite, orientation]);

  // ── La boucle de vie ────────────────────────────────────────────────────────
  /**
   * ⚠️ **La boucle n'anime rien elle-même, elle interroge.** Toute la logique de temps
   * est dans [`avatarVie.ts`](../../lib/avatarVie.ts), sans React et sans rendu, ce qui
   * permet de la vérifier sur des minutes simulées image par image. Ici il ne reste que
   * l'amorti du suivi de souris — le seul mouvement qui dépend d'une entrée extérieure.
   *
   * ⚠️ **Amorti au temps écoulé et non par image.** Un `v += (cible - v) * 0.12` par
   * image rend le mouvement deux fois plus lent sur un écran à 120 Hz que sur un écran
   * à 60 — un défaut qu'on ne voit jamais sur sa propre machine. L'exponentielle du
   * délai réel donne la même vitesse partout.
   */
  const vieRef = useRef(creerVie());
  /** Ce qu'il reste du suivi du curseur dans l'état courant : « Focus » l'atténue. */
  const suiviRef = useRef(1);
  const reglagesVie = useRef({
    derive, clignement, cadenceClignement: cadence,
  });
  reglagesVie.current = { derive, clignement, cadenceClignement: cadence };

  /**
   * Un visage qui cligne, dérive et suit le curseur, c'est du mouvement permanent et
   * non sollicité — exactement ce que `prefers-reduced-motion` désigne. Toutes les vies
   * du regard s'éteignent donc d'elles-mêmes, et restent rallumables à la main.
   *
   * Coupé après le montage plutôt qu'à l'état initial : le serveur ne connaît pas la
   * préférence, et un état de départ différent ferait diverger l'hydratation.
   */
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setSuivi(false);
    setClignement(false);
    setDerive(0);
  }, []);

  useEffect(() => {
    let image = 0;
    let precedent = performance.now();

    const boucle = (t: number) => {
      const dt = Math.min(64, t - precedent);
      precedent = t;
      const part = 1 - Math.exp(-dt / AMORTI);

      setLacet(v => (Math.abs(cible.current.lacet - v) < 0.01
        ? cible.current.lacet : v + (cible.current.lacet - v) * part));
      setTangage(v => (Math.abs(cible.current.tangage - v) < 0.01
        ? cible.current.tangage : v + (cible.current.tangage - v) * part));
      /**
       * ⚠️ **On ne prévient React que si quelque chose a bougé.** `avancer` rend un
       * objet neuf à chaque image : le passer tel quel forcerait un rendu soixante fois
       * par seconde même toutes animations éteintes — y compris quand l'utilisateur a
       * demandé moins de mouvement, ce qui serait le comble.
       */
      setVie(precedente => {
        const suivante = vieRef.current.avancer(t, reglagesVie.current);
        suiviRef.current = suivante.suivi;
        return identiques(precedente, suivante) ? precedente : suivante;
      });

      image = requestAnimationFrame(boucle);
    };
    image = requestAnimationFrame(boucle);
    return () => cancelAnimationFrame(image);
  }, []);

  /** Déclenche un geste à la demande, pour pouvoir le regarder sans l'attendre. */
  /** Demande un état ; un ponctuel rend ensuite la main au fond. */
  const demander = useCallback((cle: string) => {
    vieRef.current.demander(cle, performance.now());
    setEtat(vieRef.current.fond());
  }, []);

  // ── Glisser sur la tête, et suivre la souris ────────────────────────────────
  const saisie = useRef<{ x: number; y: number; lacet: number; tangage: number } | null>(null);

  /** Pose une orientation choisie à la main : elle devient le nouveau repos. */
  const poser = useCallback((l: number, t: number) => {
    repos.current = { lacet: l, tangage: t };
    cible.current = { lacet: l, tangage: t };
  }, []);

  const commencer = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    // ⚠️ **La saisie est enregistrée d'abord, la capture ensuite.** Dans l'ordre
    // inverse, `setPointerCapture` levant — ce qu'il fait dès que le pointeur n'est
    // plus actif, et systématiquement sur un événement synthétique — laissait
    // `saisie` vide : le glisser ne démarrait jamais, et le geste retombait
    // silencieusement sur le suivi de la souris. Une panne qui ne se voit pas, parce
    // que quelque chose bouge quand même.
    saisie.current = { x: e.clientX, y: e.clientY, lacet, tangage };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Sans capture, le glisser fonctionne tant que le pointeur reste sur le panneau.
    }
  }, [lacet, tangage]);

  const relacher = useCallback(() => { saisie.current = null; }, []);

  /**
   * Le regard suit le curseur, à partir du centre de la tête.
   *
   * ⚠️ **Un écart ajouté au repos, pas une position absolue.** L'orientation reste
   * celle des curseurs ; la souris n'y ajoute qu'un léger décalage, borné par
   * l'amplitude. C'est ce qui permet de régler une pose de trois quarts et de garder
   * le regard vivant *autour* d'elle, au lieu de le voir ramené au centre.
   *
   * Le tangage suit le geste : curseur en bas, regard vers le bas. La convention
   * inverse — celle des logiciels 3D, où l'on fait tourner l'objet — se lit ici comme
   * un bug, parce qu'on manipule un visage et non une caméra.
   */
  const bouger = useCallback((e: React.PointerEvent) => {
    const prise = saisie.current;
    if (prise) {
      const l = borner(prise.lacet + (e.clientX - prise.x) * 0.22, -55, 55);
      const t = borner(prise.tangage + (e.clientY - prise.y) * 0.22, -42, 42);
      poser(l, t);
      return;
    }
    if (!suivi) return;
    const boite = svgRef.current?.getBoundingClientRect();
    if (!boite) return;
    const dx = borner((e.clientX - (boite.left + boite.width / 2)) / (boite.width / 2), -1, 1);
    const dy = borner((e.clientY - (boite.top + boite.height / 2)) / (boite.height / 2), -1, 1);
    // ⚠️ Lu dans une référence et non dans l'état : `bouger` est mémorisé, et le
    // faire dépendre de la vie le recréerait soixante fois par seconde.
    const force = amplitude * suiviRef.current;
    cible.current = {
      lacet: borner(repos.current.lacet + dx * force, -55, 55),
      // Moins d'amplitude en vertical : une tête bascule moins haut qu'elle ne pivote.
      tangage: borner(repos.current.tangage + dy * force * 0.62, -42, 42),
    };
  }, [suivi, amplitude, poser]);

  const quitter = useCallback(() => {
    if (saisie.current) return;
    cible.current = { ...repos.current };
  }, []);

  return (
    <div data-novac-page style={{ display: "flex", height: "100vh", background: "#FFFFFF" }}>
      <style dangerouslySetInnerHTML={{ __html: `
        .av-curseur{-webkit-appearance:none;appearance:none;width:100%;height:16px;background:transparent;cursor:pointer;margin:0;display:block}
        .av-curseur::-webkit-slider-runnable-track{height:4px;border-radius:999px;background:var(--av-piste)}
        .av-curseur::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:14px;height:14px;border-radius:50%;background:${ACCENT};border:0;margin-top:-5px}
        .av-curseur::-moz-range-track{height:4px;border-radius:999px;background:var(--av-piste)}
        .av-curseur::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:${ACCENT};border:0}
        .av-curseur:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 4px ${ACCENT}33}
        .av-tete{touch-action:none;cursor:grab}
        .av-tete:active{cursor:grabbing}
        @media(max-width:860px){.av-deux-panneaux{flex-direction:column}.av-panneau-droit{flex:1 1 auto!important;max-height:none!important;border-left:0!important;border-top:1px solid ${BORD}}}
      ` }} />

      <div className="av-deux-panneaux" style={{ display: "flex", flex: 1, minWidth: 0 }}>
        {/* ── La tête ───────────────────────────────────────────────────────── */}
        <div
          onPointerMove={bouger}
          onPointerLeave={quitter}
          style={{
            flex: 1, minWidth: 0, background: ENCRE,
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 44, padding: "48px 40px",
          }}
        >
          <svg
            ref={svgRef}
            className="av-tete"
            viewBox="-115 -115 230 230"
            onPointerDown={commencer}
            onPointerUp={relacher}
            onPointerCancel={relacher}
            role="img"
            aria-label={`Visage orienté de ${lacet.toFixed(0)} degrés horizontalement `
              + `et ${tangage.toFixed(0)} degrés verticalement`}
            style={{ width: "min(72%, 520px)", height: "auto", display: "block", flexShrink: 0 }}
          >
            {/* ⚠️ **Le squash est une échelle du rendu, pas une déformation de la
                sphère.** L'écrasement d'un rebond touche l'objet entier, motifs et yeux
                compris : le passer dans la géométrie aurait obligé chaque contour à en
                tenir compte, et la sphère ne serait plus une sphère — la coupe de
                l'hémisphère et la silhouette n'auraient plus de sens. Ici la géométrie
                reste sphérique et c'est l'image qu'on comprime. */}
            <g transform={`scale(${vie.echelleX.toFixed(4)} ${vie.echelleY.toFixed(4)})`}>
              <circle cx={0} cy={0} r={RAYON_TETE} fill={palette.tete} />
              {/* Les aplats du skin, peints sur la sphère et non plaqués par-dessus :
                  ils tournent avec la tête et s'affinent près du bord. Dessinés avant
                  les yeux, pour que le regard passe devant la couture qu'il croise. */}
              {cheminsMotifs.map((m, i) => (
                <path key={i} d={m.d} fill={m.couleur}
                  stroke={m.trait ?? "none"} strokeWidth={m.epaisseur ?? 0}
                  strokeLinejoin="round" />
              ))}
              <path d={oeilGauche} fill={palette.yeux} />
              <path d={oeilDroit} fill={palette.yeux} />
            </g>
          </svg>

          <p style={{
            margin: 0, maxWidth: 430, textAlign: "center", color: "#85858F",
            fontSize: 12.5, lineHeight: 1.55,
          }}>
            Le regard suit la souris ; glisse sur la tête pour régler X/Y. Les yeux ne
            changent jamais de SVG : chaque point du même contour est reprojeté.
          </p>
        </div>

        {/* ── Les réglages ──────────────────────────────────────────────────── */}
        {/* ⚠️ Une part de la largeur plutôt qu'une valeur fixe. La maquette occupe
            1320 px ; ici, la barre de navigation en prend déjà 232, et un panneau figé
            à 557 px laisserait à la tête moins de place qu'aux réglages — l'inverse du
            rapport de la référence. Le `clamp` garde la proportion 1,37 : 1 sur les
            largeurs courantes sans jamais écraser les curseurs. */}
        <div className="av-panneau-droit" style={{
          flex: "0 0 clamp(400px, 42%, 557px)", minWidth: 0, background: "#FFFFFF",
          borderLeft: `1px solid ${BORD}`,
          // Le haut dégagé : l'en-tête de l'application flotte en position fixe
          // par-dessus la page, et le sur-titre passerait sinon dessous.
          padding: "64px 46px 64px",
          overflowY: "auto", maxHeight: "100vh",
        }}>
          <p style={{
            margin: 0, color: ACCENT, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.085em", textTransform: "uppercase",
          }}>
            Prototype 02 · Géométrie procédurale
          </p>

          <h1 style={{
            margin: "18px 0 0", color: TITRE, fontSize: 47, fontWeight: 800,
            letterSpacing: "-0.037em", lineHeight: 1.06,
          }}>
            Deux yeux.<br />Une seule forme.
          </h1>

          <p style={{ margin: "20px 0 0", color: TEXTE, fontSize: 14.5, lineHeight: 1.62 }}>
            Chaque œil est un rectangle long totalement arrondi. La taille et
            l&apos;inclinaison sont définies localement, puis la rotation de tête déforme
            réellement le contour sur une sphère 3D avant de le ramener dans le SVG.
          </p>

          <Carte
            titre="Expressions rapides"
            note="Ces boutons ne chargent aucun nouveau dessin : ils changent seulement les rotations locales des deux capsules."
            marge={30}
          >
            <div style={{ display: "flex", gap: 10 }}>
              {EXPRESSIONS.map(e => (
                <button
                  key={e.cle}
                  type="button"
                  onClick={() => setExpression(e.cle)}
                  aria-pressed={expression === e.cle}
                  style={{
                    flex: 1, padding: "11px 8px", borderRadius: 9, cursor: "pointer",
                    fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                    border: `1px solid ${expression === e.cle ? ACCENT : BORD}`,
                    background: expression === e.cle ? ACCENT : "#FFFFFF",
                    color: expression === e.cle ? "#FFFFFF" : "#33333D",
                  }}
                >
                  {e.libelle}
                </button>
              ))}
            </div>
          </Carte>

          <Carte
            titre="Habillage"
            note="Un skin n'est pas une image plaquée : chaque panneau est un quartier de sphère, peint sur la surface et repassé par la même projection que les yeux."
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {SKINS.map(s => (
                <button
                  key={s.cle}
                  type="button"
                  onClick={() => choisirSkin(s.cle)}
                  aria-pressed={skin === s.cle}
                  style={{
                    padding: "11px 4px", borderRadius: 9, cursor: "pointer",
                    fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                    border: `1px solid ${skin === s.cle ? ACCENT : BORD}`,
                    background: skin === s.cle ? ACCENT : "#FFFFFF",
                    color: skin === s.cle ? "#FFFFFF" : "#33333D",
                  }}
                >
                  {s.libelle}
                </button>
              ))}
            </div>
          </Carte>

          <Carte
            titre="Palette"
            note={skin === "volley"
              ? "Les dix-huit lames prennent la couleur de tête, l'accent et le blanc, une teinte par paire de faces opposées."
              : skin === "basket" || skin === "tennis"
                ? "La tête donne le fond, l'accent donne les coutures."
                : "Choisir un habillage propose sa palette ; elle reste modifiable ensuite."}
          >
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <Teinte libelle="Tête" valeur={palette.tete}
                onChange={v => setPalette(p => ({ ...p, tete: v }))} />
              <Teinte libelle="Accent" valeur={palette.accent}
                onChange={v => setPalette(p => ({ ...p, accent: v }))} />
              <Teinte libelle="Yeux" valeur={palette.yeux}
                onChange={v => setPalette(p => ({ ...p, yeux: v }))} />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {PRESETS.map(p => (
                <button
                  key={p.nom}
                  type="button"
                  title={p.nom}
                  aria-label={`Palette ${p.nom}`}
                  onClick={() => setPalette(cur => ({ ...cur, tete: p.tete, accent: p.accent }))}
                  style={{
                    width: 30, height: 30, borderRadius: 8, cursor: "pointer", padding: 0,
                    border: `1px solid ${BORD}`,
                    background: `linear-gradient(135deg, ${p.tete} 0 55%, ${p.accent} 55% 100%)`,
                  }}
                />
              ))}
            </div>
          </Carte>

          <Carte
            titre="Vie du regard"
            note="Aucune image ni calque : tout passe par les mêmes entrées que le reste — deux angles, une hauteur de capsule, une inclinaison. Le penchement emploie le roulis, la troisième rotation."
          >
            <Bascule
              libelle="Suivi de la souris"
              actif={suivi}
              onChange={v => { setSuivi(v); if (!v) cible.current = { ...repos.current }; }}
            />
            <Curseur libelle="Amplitude du suivi" valeur={amplitude} affichage={`± ${amplitude.toFixed(0)}°`}
              min={0} max={30} pas={1} onChange={setAmplitude} />
            <div style={{ height: 6 }} />
            <Bascule libelle="Clignement automatique" actif={clignement} onChange={setClignement} />
            <Curseur libelle="Cadence des clignements" valeur={cadence} affichage={`${cadence.toFixed(1)} s`}
              min={1.5} max={9} pas={0.1} onChange={setCadence} />
            {/* ⚠️ La dérive est ce qui distingue un visage d'une icône : sans elle,
                l'avatar est parfaitement immobile entre deux mimiques, et l'immobilité
                parfaite se lit comme une image. */}
            <Curseur libelle="Dérive au repos" valeur={derive} affichage={`± ${derive.toFixed(1)}°`}
              min={0} max={8} pas={0.1} onChange={setDerive} />
          </Carte>

          <Carte
            titre="Répertoire"
            note="Les états soutenus durent jusqu'au suivant ; les ponctuels se jouent puis rendent la main. C'est l'application qui décide quand — la colonne « quand » est portée dans le code."
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {ETATS.map(e => {
                const retenu = etat === e.cle;
                return (
                  <button
                    key={e.cle}
                    type="button"
                    title={`${e.quand} — ${e.nature}`}
                    onClick={() => demander(e.cle)}
                    aria-pressed={retenu}
                    style={{
                      padding: "9px 4px", borderRadius: 9, cursor: "pointer",
                      fontSize: 11.5, fontWeight: 600, fontFamily: "inherit",
                      // ⚠️ **Trois propriétés détaillées, pas le raccourci `border`.**
                      // Mélanger `border` et `borderStyle` dans le même objet de style
                      // fait avertir React, et à raison : au rendu suivant, il met à
                      // jour la propriété détaillée sans savoir que le raccourci a
                      // réécrit les trois. La bordure se retrouve alors dans un état
                      // qu'aucune des deux valeurs ne décrit.
                      borderWidth: 1,
                      // Les ponctuels ne « restent » pas : rien ne les montre retenus,
                      // et une bordure pointillée dit qu'ils repartent d'eux-mêmes.
                      borderStyle: e.nature === "ponctuel" ? "dashed" : "solid",
                      borderColor: retenu ? ACCENT : BORD,
                      background: retenu ? ACCENT : "#FFFFFF",
                      color: retenu ? "#FFFFFF" : "#33333D",
                    }}
                  >
                    {e.libelle}
                  </button>
                );
              })}
            </div>
          </Carte>

          <Carte
            titre="Rotation de la tête"
            note="Ce sont les deux entrées de la projection sphérique. Elles peuvent plus tard venir d'un geste, du regard ou d'un moteur IA."
          >
            <Curseur libelle="Rotation horizontale Y" valeur={lacet} affichage={`${lacet.toFixed(0)}°`}
              min={-55} max={55} pas={1}
              onChange={v => { poser(v, repos.current.tangage); setLacet(v); }} />
            <Curseur libelle="Rotation verticale X" valeur={tangage} affichage={`${tangage.toFixed(0)}°`}
              min={-42} max={42} pas={1}
              onChange={v => { poser(repos.current.lacet, v); setTangage(v); }} />
          </Carte>

          <Carte
            titre="Forme commune"
            note="Les deux yeux partagent la même capsule de base. On peut l'allonger, l'épaissir, l'écarter et redimensionner tout le regard."
          >
            <Curseur libelle="Largeur" valeur={largeur} affichage={`${largeur.toFixed(0)} u`}
              min={8} max={44} pas={1} onChange={setLargeur} />
            <Curseur libelle="Hauteur" valeur={hauteur} affichage={`${hauteur.toFixed(0)} u`}
              min={16} max={96} pas={1} onChange={setHauteur} />
            <Curseur libelle="Taille globale" valeur={taille} affichage={`${taille.toFixed(2)}×`}
              min={0.6} max={1.6} pas={0.01} onChange={setTaille} />
            <Curseur libelle="Écart des yeux" valeur={ecart} affichage={`${ecart.toFixed(0)} u`}
              min={4} max={40} pas={1} onChange={setEcart} />
          </Carte>
        </div>
      </div>
    </div>
  );
}

function Carte({ titre, note, marge = 16, children }: {
  titre: string;
  note: string;
  marge?: number;
  children: React.ReactNode;
}) {
  return (
    <section style={{
      marginTop: marge, padding: "20px 22px 22px", background: "#FFFFFF",
      border: `1px solid ${BORD}`, borderRadius: 14,
    }}>
      <h2 style={{ margin: 0, color: "#16161D", fontSize: 14.5, fontWeight: 700 }}>{titre}</h2>
      <p style={{ margin: "7px 0 18px", color: DOUX, fontSize: 12.5, lineHeight: 1.55 }}>{note}</p>
      {children}
    </section>
  );
}

function Teinte({ libelle, valeur, onChange }: {
  libelle: string;
  valeur: string;
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
      <span style={{
        display: "block", marginBottom: 7,
        color: "#3A3A45", fontSize: 12.5, fontWeight: 600,
      }}>
        {libelle}
      </span>
      <span style={{
        display: "flex", alignItems: "center", gap: 8, padding: "6px 9px",
        border: `1px solid ${BORD}`, borderRadius: 9,
      }}>
        <input
          type="color"
          value={valeur}
          aria-label={`Couleur — ${libelle}`}
          onChange={e => onChange(e.target.value)}
          // Le champ natif porte sa propre bordure et son propre fond selon le
          // navigateur : on le vide pour ne garder que la pastille de couleur.
          style={{
            width: 22, height: 22, padding: 0, border: 0, borderRadius: 6,
            background: "none", cursor: "pointer", flexShrink: 0,
          }}
        />
        <span style={{
          color: DOUX, fontSize: 11, fontWeight: 600, letterSpacing: "0.02em",
          fontVariantNumeric: "tabular-nums", textTransform: "uppercase",
          overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {valeur}
        </span>
      </span>
    </label>
  );
}

function Bascule({ libelle, actif, onChange }: {
  libelle: string;
  actif: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={actif}
      onClick={() => onChange(!actif)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        width: "100%", padding: 0, marginTop: 4, border: 0, background: "none",
        cursor: "pointer", fontFamily: "inherit",
      }}
    >
      <span style={{ color: "#3A3A45", fontSize: 12.5, fontWeight: 600 }}>{libelle}</span>
      <span style={{
        width: 36, height: 20, borderRadius: 999, flexShrink: 0,
        background: actif ? ACCENT : PISTE, position: "relative",
        transition: "background 150ms ease",
      }}>
        <span style={{
          position: "absolute", top: 3, left: actif ? 19 : 3,
          width: 14, height: 14, borderRadius: "50%", background: "#FFFFFF",
          transition: "left 150ms ease",
        }} />
      </span>
    </button>
  );
}

function Curseur({ libelle, valeur, affichage, min, max, pas, onChange }: {
  libelle: string;
  valeur: number;
  /** La valeur telle qu'on la lit, unité comprise — « 19 u », « 1.23× ». */
  affichage: string;
  min: number;
  max: number;
  pas: number;
  onChange: (v: number) => void;
}) {
  const part = ((valeur - min) / (max - min)) * 100;
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginBottom: 9,
      }}>
        <label style={{ color: "#3A3A45", fontSize: 12.5, fontWeight: 600 }}>{libelle}</label>
        <span style={{
          color: ACCENT, fontSize: 12.5, fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
        }}>
          {affichage}
        </span>
      </div>
      <input
        className="av-curseur"
        type="range"
        min={min}
        max={max}
        step={pas}
        value={valeur}
        aria-label={libelle}
        onChange={e => onChange(Number(e.target.value))}
        // La piste remplie est peinte par un dégradé plutôt que par un second élément :
        // un `::-webkit-slider-runnable-track` n'accepte pas d'enfant.
        style={{
          ["--av-piste" as string]:
            `linear-gradient(to right, ${ACCENT} 0 ${part}%, ${PISTE} ${part}% 100%)`,
        }}
      />
    </div>
  );
}
