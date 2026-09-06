"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  RAYON_TETE, type Orientation, cheminDansOeil, cheminOeil, cheminSvg, contourBulle,
  contourEclat, contourSilhouette, decaler,
} from "@/lib/avatarSpherique";
import { cheminOeilSurface } from "@/lib/avatarSurface";
import { type FamilleSolide, melangerSolides, solideDepuis } from "@/lib/avatarVolume";
import {
  ARRONDI_REFERENCE, ECART_INVITE, HALO, OEIL_REFERENCE, TAILLE_INVITE,
  TAILLE_REFERENCE,
  VIE_REFERENCE,
} from "@/lib/avatarReglages";
import { type EtatVie, VIE_AU_REPOS, creerVie } from "@/lib/avatarVie";
import { COULEUR_PAR_DEFAUT, couleurDesYeux } from "@/lib/avatarCouleur";
import { type MotifPlat, skinParCle } from "@/lib/avatarSkins";
import { FONT } from "@/lib/typography";
import type { FormeAvatar } from "@/lib/useCouleurAvatar";
import { useMorphose } from "@/lib/useMorphose";

/**
 * Le visage de Novac, prêt à poser n'importe où.
 *
 * ⚠️ **Tout tient dans ce composant : sa vie, son suivi, son rendu.** La page de
 * démonstration reste le banc d'essai, avec ses vingt curseurs ; ici il ne doit rien
 * y avoir à régler pour qu'il fonctionne. Un avatar qu'il faut câbler à chaque
 * emplacement finit par n'être posé qu'une fois.
 *
 * ⚠️ **Le suivi écoute la fenêtre entière, pas le composant.** Dans un coin d'écran, un
 * visage qui ne réagit qu'au survol de ses trente-huit pixels ne réagit jamais : on ne
 * passe pas dessus, on passe *ailleurs*. C'est précisément de suivre le curseur au loin
 * qui le fait remarquer.
 *
 * ⚠️ **Les proportions des yeux ne sont pas celles de la maquette**, et c'est une
 * question de taille de rendu. Les capsules d'origine font 23 unités de large sur 200 de
 * diamètre : à trente-huit pixels, cela donne des traits de quatre pixels de large que
 * l'antialiasage avale. Élargies et raccourcies, elles gardent leur caractère et
 * redeviennent lisibles. La géométrie est la même — seuls trois nombres changent.
 */

/**
 * ⚠️ **Les proportions viennent du banc d'essai, sans retouche.** Elles y étaient
 * élargies : vingt-trois unités de large sur deux cents de diamètre donnent, à
 * trente-huit pixels, des traits de quatre pixels que l'antialiasage avale — d'où des
 * capsules épaissies ici. Le prix était que la même forme ne rendait plus pareil aux
 * deux endroits, ce qui se voit tout de suite quand on compare, et qui rend le banc
 * d'essai inutile puisqu'il ne montre plus ce qu'on obtiendra. On garde donc la
 * référence, et c'est la **taille de rendu** qu'il faut monter si le trait manque de
 * corps : à soixante-trois pixels, la capsule fait sept pixels de large.
 */

/**
 * ⚠️ Deux fois moins d'échantillons que sur la page d'essai. À trente-huit pixels, un
 * contour de deux cent vingt points en dépose six par pixel : on paie un calcul que
 * l'écran ne peut pas montrer.
 */
const ECHANTILLONS = 96;


/**
 * Le volume que porte chaque forme proposée.
 *
 * ⚠️ Exportée parce qu'un second endroit peint désormais des morceaux d'avatar — les yeux
 * seuls, dans l'aide à la décision. Une seconde table aurait divergé de celle-ci au
 * premier ajout de forme, et le défaut aurait été muet : un œil dessiné sur le mauvais
 * volume reste un œil.
 */
export const FAMILLE_AVATAR: Record<FormeAvatar, FamilleSolide> = {
  sphere: "sphere",
  carre: "cube",
  etoile: "etoile",
  etoile6: "etoile6",
  nuage: "nuage",
  hexagone: "hexagone",
  triangle: "triangle",
  goutte: "goutte",
};


/**
 * Le contour d'une forme, dans le repère de l'avatar — pour ce qui se pose **par-dessus**.
 *
 * ⚠️ **Rendu ici parce que la table des volumes est ici.** Un survol qui cerne l'avatar
 * doit suivre sa silhouette, sinon il cerne un carré autour d'une goutte. L'interface
 * n'a pas à connaître la famille de solide derrière chaque forme proposée ; elle demande
 * un tracé et le pose.
 */
export function contourDeForme(forme: FormeAvatar): string {
  return cheminSvg(contourSilhouette(solideDepuis(FAMILLE_AVATAR[forme], ARRONDI_REFERENCE),
    RAYON_TETE, 180));
}

/**
 * La vie du visage à cette taille.
 *
 * ⚠️ **La dérive est bien plus ample qu'au banc d'essai, et ce n'est pas un caprice.**
 * À trente-huit pixels, la tête a dix-neuf pixels de rayon : deux degrés de lacet
 * déplacent les yeux de moins d'un pixel, donc de rien du tout. Ce qui se voyait sur
 * une tête de cinq cents pixels disparaît ici. Sept degrés rendent le même effet visible
 * — un visage qui ne tient pas en place — sans que la tête parte pour autant.
 *
 * ⚠️ **Les gestes spontanés sont plus fréquents qu'ils ne le seraient sur un grand
 * format.** Un avatar de coin d'écran n'est regardé que par intermittence : espacés de
 * dix secondes, ses gestes tomberaient presque toujours pendant qu'on regarde ailleurs.
 */
const REGLAGES = {
  ...VIE_REFERENCE,
  /**
   * ⚠️ **Les gestes spontanés sont le seul ajout au banc d'essai, et il s'assume.** Un
   * avatar de coin d'écran n'est regardé que par intermittence : sans eux, l'essentiel
   * de sa vie tomberait pendant qu'on regarde ailleurs. Ils n'existent pas sur le banc
   * parce qu'on y regarde le visage en continu.
   */
  spontane: true,
  cadenceSpontane: 4.5,
};

/**
 * Le coup d'œil que jette un défilement, en degrés, et le temps qu'il met à retomber.
 *
 * ⚠️ **Il s'ajoute au suivi de la souris au lieu de le remplacer.** Pendant qu'on
 * défile, le curseur ne bouge pas : le regard reste donc accroché là où il était, et
 * rien ne dit que le visage a remarqué quelque chose. L'écart s'ajoute, si bien que le
 * regard glisse dans le sens du défilement puis revient là où pointe la souris.
 *
 * ⚠️ **Sept degrés, pas davantage.** Le suivi complet vaut dix degrés à la verticale :
 * un coup d'œil plus ample que le suivi lui-même se lirait comme un sursaut à chaque
 * cran de molette.
 *
 * ⚠️ **Les deux axes, pas seulement la verticale.** Les listes de l'application
 * défilent aussi de côté — le rail des actifs, celui des comptes —, et c'est justement
 * là qu'on défile en cherchant quelque chose. N'écouter que `scrollTop` n'aurait rien
 * donné sur ces rails : mesuré, le regard n'y bougeait pas d'un pixel.
 */
const COUP_OEIL = 7;
const RETOUR_COUP_OEIL = 320;

const rad = (d: number) => (d * Math.PI) / 180;
const borner = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export default function AvatarNovac({
  taille = 38,
  etat = "neutre",
  impulsion = 0,
  couleur,
  couleurYeux,
  suivi = true,
  amplitude = VIE_REFERENCE.amplitude,
  forme = "sphere",
  skin = "uni",
  vivant = true,
  yeux = true,
  titre,
  style,
}: {
  /** Le diamètre rendu, en pixels. */
  taille?: number;
  /** L'état du répertoire à tenir — voir `avatarEtats.ts`. */
  etat?: string;
  /**
   * Compteur de relance.
   *
   * ⚠️ **Deux erreurs de suite portent la même clé.** Sans ce jeton, la seconde ne
   * déclencherait rien : rien n'aurait changé du point de vue de React. C'est le défaut
   * classique des animations pilotées par un état.
   */
  impulsion?: number;
  /**
   * La couleur de la tête. Omise, elle vient du choix de l'utilisateur.
   *
   * ⚠️ Les yeux ne s'imposent qu'avec elle : seuls, ils pourraient devenir invisibles
   * sur la tête. Voir `couleurDesYeux`, qui les déduit en garantissant le contraste.
   */
  couleur?: string;
  couleurYeux?: string;
  /**
   * L'habillage peint sur la tête.
   *
   * ⚠️ **Il est immobile, contrairement au regard.** Un décor peint sur la surface
   * tournerait juste sur la sphère et s'étirerait sur toutes les autres formes, qui ne
   * se comportent pas comme elle sous la rotation. Ici il est **détouré par la
   * silhouette** : un dessin plat, tranché par le bord de la tête, identique quoi que
   * fasse le regard. Une seule règle pour les huit formes.
   */
  skin?: string;
  /**
   * Le visage respire-t-il ?
   *
   * ⚠️ **Distinct du suivi, et il fallait les séparer.** Couper le suivi arrête le
   * regard mais laisse le clignement et la dérive : dans une vignette de sélection, une
   * douzaine de têtes qui clignent chacune de son côté attire l'œil sur le choix qu'on
   * ne fait pas encore. Un aperçu doit être **immobile** — c'est une image de ce qu'on
   * obtiendra, pas une créature.
   */
  vivant?: boolean;
  /**
   * La tête a-t-elle un visage ?
   *
   * ⚠️ **Faux pour une vignette qui ne montre que la silhouette.** Le sélecteur de forme
   * pose huit têtes côte à côte, toutes de la même couleur : ce qui les distingue est leur
   * contour, et deux yeux identiques répétés huit fois n'ajoutent rien à cette question tout
   * en occupant le milieu de chaque vignette. Demandé à l'usage.
   *
   * ⚠️ **Ce n'est pas la même chose que `vivant`.** Sans vie, les yeux sont là mais immobiles ;
   * sans visage, il n'y a plus d'yeux du tout — donc plus de reflets ni de halo d'habillage
   * non plus, qui vivent dans le même groupe et n'ont rien à cercler.
   */
  yeux?: boolean;
  /** Le regard suit-il le curseur dans la fenêtre ? */
  suivi?: boolean;
  /** Débattement du suivi, en degrés. */
  amplitude?: number;
  /**
   * La silhouette : sphère, ou cube aux arêtes arrondies.
   *
   * ⚠️ Ce n'est pas un habillage plaqué par-dessus mais la surface elle-même : les yeux
   * sont peints dessus et suivent son galbe. Sur le cube, la face avant est plate, donc
   * un œil vu de face n'y est pas courbé — cela se voit même à trente-huit pixels.
   *
   * ⚠️ `carre` et `solide` sont le même volume dans deux ordres différents. Le premier
   * garde une silhouette immuable et laisse la surface se tordre en tournant ; le second
   * fait tourner le solide, ce qui rend la surface rigide et fait respirer la silhouette.
   */
  forme?: FormeAvatar;
  titre?: string;
  style?: React.CSSProperties;
}) {
  /**
   * ⚠️ **Les yeux se déduisent de la tête *effectivement rendue*.** Ma première version
   * ne les déduisait que lorsque la couleur venait du contexte : dès qu'un appelant
   * passait la sienne — le cas de chaque portefeuille — les yeux retombaient sur un
   * bleu-noir figé. Sur une tête sombre ils s'y seraient effacés, c'est-à-dire
   * exactement la panne que `couleurDesYeux` existe pour empêcher.
   */
  const teteRendue = couleur ?? COULEUR_PAR_DEFAUT;
  const yeuxRendus = couleurYeux ?? couleurDesYeux(teteRendue);

  /**
   * ⚠️ **Un descripteur, pas cinq chemins de rendu.** La sphère est la superellipsoïde
   * d'exposant 2, et l'étoile n'est qu'une autre famille du même descripteur : le
   * composant ne choisit qu'entre deux fonctions — l'image étirée après la rotation, ou
   * le solide qui tourne.
   */

  const [vie, setVie] = useState<EtatVie>(VIE_AU_REPOS);
  const [pose, setPose] = useState({ lacet: 0, tangage: 0 });
  const vieRef = useRef(creerVie());
  const cible = useRef({ lacet: 0, tangage: 0 });
  const suiviRef = useRef(1);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [anime, setAnime] = useState(true);

  /**
   * Le volume rendu — celui de la forme, ou le mélange pendant une morphose.
   *
   * ⚠️ **Tout se déduit du rayon, donc rien n'est animé séparément.** La silhouette, les
   * yeux et le détourage de l'habillage sortent tous du même volume : il n'y a pas de
   * transition du contour d'un côté et du regard de l'autre, donc rien qui puisse se
   * désynchroniser en route.
   */
  const transition = useMorphose(forme, anime && vivant);
  const solide = useMemo(() => {
    const arrivee = solideDepuis(FAMILLE_AVATAR[forme], ARRONDI_REFERENCE);
    if (!transition) return arrivee;
    return melangerSolides(
      solideDepuis(FAMILLE_AVATAR[transition.de], ARRONDI_REFERENCE), arrivee, transition.part);
  }, [forme, transition]);
  /** Ce que le défilement ajoute au regard, et qui retombe tout seul. */
  const coupDOeil = useRef({ lacet: 0, tangage: 0 });

  /** L'état demandé par l'appelant est transmis à la vie, qui gère la transition. */
  useEffect(() => { vieRef.current.demander(etat, performance.now()); }, [etat, impulsion]);

  /**
   * Un visage qui cligne, dérive et suit le curseur, c'est du mouvement permanent et non
   * sollicité — exactement ce que `prefers-reduced-motion` désigne. Coupé après le
   * montage et non à l'état initial : le serveur ne connaît pas la préférence, et un
   * état de départ différent ferait diverger l'hydratation.
   */
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) setAnime(false);
  }, []);

  useEffect(() => {
    if (!anime || !vivant) return;
    let image = 0;
    let precedent = performance.now();
    const boucle = (t: number) => {
      const dt = Math.min(64, t - precedent);
      precedent = t;
      // Amorti au temps écoulé et non par image : sinon le mouvement est deux fois plus
      // lent sur un écran à 120 Hz que sur un écran à 60.
      const part = 1 - Math.exp(-dt / 110);
      // Le coup d'œil du défilement se dissipe de lui-même : ce qui l'entretient, c'est
      // le défilement qui continue, pas une minuterie qu'il faudrait annuler.
      const reste = Math.exp(-dt / RETOUR_COUP_OEIL);
      coupDOeil.current = {
        lacet: Math.abs(coupDOeil.current.lacet) < 0.01 ? 0 : coupDOeil.current.lacet * reste,
        tangage: Math.abs(coupDOeil.current.tangage) < 0.01 ? 0 : coupDOeil.current.tangage * reste,
      };
      setPose(p => ({
        lacet: p.lacet + (cible.current.lacet + coupDOeil.current.lacet - p.lacet) * part,
        tangage: p.tangage + (cible.current.tangage + coupDOeil.current.tangage - p.tangage) * part,
      }));
      setVie(precedente => {
        const suivante = vieRef.current.avancer(t, REGLAGES);
        suiviRef.current = suivante.suivi;
        return identiques(precedente, suivante) ? precedente : suivante;
      });
      image = requestAnimationFrame(boucle);
    };
    image = requestAnimationFrame(boucle);
    return () => cancelAnimationFrame(image);
  }, [anime, vivant]);

  const regarder = useCallback((e: PointerEvent) => {
    const boite = svgRef.current?.getBoundingClientRect();
    if (!boite) return;
    /**
     * ⚠️ **La distance est ramenée à la taille de l'écran, pas à celle de l'avatar.**
     * Rapportée au composant, la moindre position hors de ses trente-huit pixels
     * saturerait le regard : il resterait collé à sa butée et ne bougerait plus.
     */
    const dx = (e.clientX - (boite.left + boite.width / 2)) / (window.innerWidth * 0.5);
    /**
     * ⚠️ **Le vertical était étouffé deux fois, et cela se voyait.** Signalé à l'usage :
     * « le regard ne se porte pas assez sur les éléments en bas ». Mesuré sur la page du
     * portefeuille, avatar au centre (136, 116) d'une fenêtre de 695 × 790 : le regard
     * atteignait **20,9°** vers la droite mais **11,1°** vers le bas — moitié moins, alors
     * que c'est vers le bas qu'il y a quelque chose à regarder.
     *
     * Deux amortissements se multipliaient : un diviseur vertical plus grand que
     * l'horizontal — `0,6` contre `0,5` — **et** un facteur `0,6` supplémentaire sur le
     * tangage. Le second suffit à dire ce qu'il voulait dire ; les deux ensemble mettaient
     * la butée de 26° hors d'atteinte, puisqu'il aurait fallu descendre à 1 578 px sous
     * l'avatar dans une fenêtre qui en fait 790.
     *
     * ⚠️ **Et le budget vertical se dépensait du mauvais côté.** L'avatar vit en haut de la
     * page : 116 px le séparent du bord haut, 674 du bord bas — cinq fois et demie plus. Un
     * réglage pensé pour un visage centré donne donc presque toute sa réserve à un côté où
     * il n'y a rien, et rationne celui où vit le contenu.
     *
     * Après réglage, aux mêmes mesures : **18,9° vers le bas** pour 20,9° vers la droite. Le
     * vertical reste en retrait — une tête bascule moins haut qu'elle ne pivote, et c'est ce
     * que dit encore le facteur ci-dessous — mais il n'est plus une note de bas de page.
     */
    const dy = (e.clientY - (boite.top + boite.height / 2)) / (window.innerHeight * 0.5);
    const force = amplitude * suiviRef.current;
    cible.current = {
      lacet: borner(dx * force, -38, 38),
      // Moins d'amplitude en vertical : une tête bascule moins haut qu'elle ne pivote.
      tangage: borner(dy * force * 0.85, -26, 26),
    };
  }, [amplitude]);

  useEffect(() => {
    if (!suivi || !anime) { cible.current = { lacet: 0, tangage: 0 }; return; }
    window.addEventListener("pointermove", regarder, { passive: true });
    return () => window.removeEventListener("pointermove", regarder);
  }, [suivi, anime, regarder]);

  /**
   * Le regard suit le défilement.
   *
   * ⚠️ **Le sens se lit sur la position, pas sur `wheel`.** Un événement de molette
   * porte bien son `deltaY`, mais il ne couvre ni le clavier, ni la barre de
   * défilement, ni les défilements programmés — et sur un pavé tactile il continue
   * d'arriver alors que la page est déjà en butée, ce qui ferait loucher le visage
   * contre un mur. La différence de position ne ment pas : nulle, il ne se passe rien.
   *
   * ⚠️ **Une position par élément défilé, gardée dans une `WeakMap`.** Les panneaux, le
   * menu et la page ont chacun la leur ; une seule variable les mélangerait et rendrait
   * un écart absurde au premier passage de l'un à l'autre. La `WeakMap` laisse
   * l'élément disparaître avec son entrée.
   */
  useEffect(() => {
    if (!suivi || !anime) return;
    const positions = new WeakMap<EventTarget, { x: number; y: number }>();
    const defiler = (e: Event) => {
      const ou = e.target;
      if (!ou) return;
      const page = ou === document || ou === document.documentElement || ou === document.body;
      const position = page
        ? { x: window.scrollX, y: window.scrollY }
        : { x: (ou as Element).scrollLeft, y: (ou as Element).scrollTop };
      const avant = positions.get(ou);
      positions.set(ou, position);
      if (!avant) return;
      const glisse = (ecart: number) => (Math.abs(ecart) < 1 ? 0 : Math.sign(ecart) * COUP_OEIL * 0.5);
      // Défiler vers le bas fait regarder vers le bas, vers la droite fait regarder à
      // droite : c'est de là qu'arrive ce qu'on n'a pas encore lu.
      coupDOeil.current = {
        lacet: borner(coupDOeil.current.lacet + glisse(position.x - avant.x), -COUP_OEIL, COUP_OEIL),
        tangage: borner(coupDOeil.current.tangage + glisse(position.y - avant.y), -COUP_OEIL, COUP_OEIL),
      };
    };
    document.addEventListener("scroll", defiler, { passive: true, capture: true });
    return () => document.removeEventListener("scroll", defiler, true);
  }, [suivi, anime]);

  const orientation: Orientation = useMemo(() => ({
    lacet: rad(pose.lacet + vie.lacet),
    tangage: rad(pose.tangage + vie.tangage),
    roulis: rad(vie.roulis),
  }), [pose, vie]);

  /**
   * Le contour de la tête.
   *
   * ⚠️ **Le volume ne tourne pas : c'est son image qu'on étire, après la rotation.** La
   * silhouette est donc immuable — elle ne dépend que de la forme, et se calcule une fois
   * pour toutes. C'est le parti du logo : quoi que fasse la tête, la marque garde
   * exactement le même contour, et tout le mouvement se lit sur ce qui est peint dessus.
   * Le banc d'essai propose l'autre parti, où le solide tourne pour de bon.
   */
  /**
   * Le contour de la tête, et le nombre de points qui le décrivent.
   *
   * ⚠️ **Échantillonné selon la taille rendue, comme les yeux le sont déjà.** Cent quatre-
   * vingts points étaient posés quelle que soit la taille : à trente-huit pixels, le
   * périmètre en fait cent vingt, soit une point et demi par pixel — on payait un calcul que
   * l'écran ne peut pas montrer. Le raisonnement était écrit à côté, pour `ECHANTILLONS`, et
   * n'avait jamais été appliqué ici.
   *
   * ⚠️ **Ce n'est gratuit qu'en dehors d'une morphose, et c'est là tout l'intérêt.** À forme
   * fixe le contour est mémoïsé et ne coûte rien ; pendant un changement de forme, `solide`
   * change à chaque image et il est **recalculé soixante fois par seconde**. La morphose est
   * donc le seul moment où ce nombre pèse — et le seul moment où l'on a signalé des
   * saccades. Mesuré : sur le banc, où un seul avatar existe, la morphose ne perd aucune
   * image ; sur la page du portefeuille, dix sur soixante passaient au-dessus de vingt
   * millisecondes.
   *
   * ⚠️ **Il ne dépend que de `taille`, jamais de l'état de la morphose.** Un nombre de points
   * qui changerait en cours de route ferait sauter la silhouette à la dernière image, au
   * moment précis où l'œil la suit.
   *
   * ⚠️ **Arrondi à un multiple de quatre, et ce n'est pas une coquetterie : c'est ce qui
   * empêche les pointes d'être tranchées.** Les points sont pris à `t = i/n · 2π` ; pour que
   * l'un d'eux tombe sur l'axe vertical, il faut `n/4` entier. Sinon deux points encadrent le
   * sommet et la corde qui les joint le coupe net.
   *
   * Constaté sur la goutte à soixante-seize pixels de rendu : `1,4 × 76 = 106`, or 106/4 vaut
   * 26,5 — les points 26 et 27 tombaient à `x = ±3,35` et le pic, qui devait monter à −100,
   * s'arrêtait à **−95,5**. Quatre unités et demie de moins sur deux cents, soit un sommet
   * rabattu en petit plateau. Signalé à l'usage.
   *
   * ⚠️ **Le défaut ne se voyait qu'à certaines tailles**, ce qui est le pire des cas : à
   * vingt-six pixels le compte est plafonné à 72, à cent trente-deux il l'est à 180, et les
   * deux sont des multiples de quatre. Seules les tailles intermédiaires tombaient à côté.
   * Les bornes étant elles-mêmes des multiples de quatre, les ramener après l'arrondi
   * préserve la propriété.
   *
   * ⚠️ **Cela vaut pour toutes les formes à sommet, pas seulement la goutte.** La pointe du
   * triangle et les branches des étoiles vivent sur les mêmes axes ; elles étaient tranchées
   * de la même façon, moins visiblement parce que moins effilées.
   */
  const contourTete = useMemo(
    () => cheminSvg(contourSilhouette(
      solide, RAYON_TETE, borner(Math.round(taille * 1.4 / 4) * 4, 72, 180))),
    [solide, taille]);

  /**
   * Les aplats de l'habillage, et l'identifiant de leur détourage.
   *
   * ⚠️ **Un identifiant par instance, sinon les avatars se volent leur découpe.** Un
   * `clipPath` vit dans le document entier, pas dans son SVG : deux avatars portant le
   * même identifiant en partagent un seul, et la page en compte autant qu'il y a de
   * portefeuilles. Le second prendrait la silhouette du premier — un globe détouré par
   * un triangle.
   */
  const marque = useId().replace(/:/g, "");
  const aplats = useMemo(() => {
    const s = skinParCle(skin);
    return s.plats ? s.plats({ tete: teteRendue, accent: s.palette.accent, yeux: yeuxRendus })
      : [];
  }, [skin, teteRendue, yeuxRendus]);

  /** Les dégradés que les aplats désignent, et le traitement des yeux du skin. */
  const degrades = useMemo(() => {
    const s = skinParCle(skin);
    return s.degrades
      ? s.degrades({ tete: teteRendue, accent: s.palette.accent, yeux: yeuxRendus }) : [];
  }, [skin, teteRendue, yeuxRendus]);

  const decoupes = useMemo(() => {
    const s = skinParCle(skin);
    return s.decoupes
      ? s.decoupes({ tete: teteRendue, accent: s.palette.accent, yeux: yeuxRendus }) : [];
  }, [skin, teteRendue, yeuxRendus]);

  const yeuxDuSkin = useMemo(() => {
    const s = skinParCle(skin);
    return s.yeux
      ? s.yeux({ tete: teteRendue, accent: s.palette.accent, yeux: yeuxRendus }) : null;
  }, [skin, teteRendue, yeuxRendus]);

  /**
   * ⚠️ **Le remplissage d'un aplat : son dégradé s'il en nomme un, sa couleur sinon.**
   * L'identifiant est préfixé par `marque`, pour la raison dite plus haut — deux avatars
   * sur la même page partageraient sinon le premier dégradé déclaré.
   */
  const remplissage = useCallback(
    (m: { degrade?: string; couleur?: string }) =>
      m.degrade ? `url(#${m.degrade}-${marque})` : (m.couleur ?? "none"),
    [marque]);

  const couleurYeuxFinale = yeuxDuSkin?.couleur ?? yeuxRendus;

  /**
   * Les aplats, séparés en ce qui passe derrière le regard et ce qui passe devant.
   *
   * ⚠️ **Une partition, pas deux sources.** L'ordre d'écriture du skin reste l'ordre de
   * peinture à l'intérieur de chaque groupe : `filter` le préserve. Demander au skin deux
   * listes séparées aurait obligé à raisonner sur leur ordre relatif à chaque relecture.
   */
  const derriere = useMemo(() => aplats.filter(m => !m.devant), [aplats]);
  const devant = useMemo(() => aplats.filter(m => m.devant), [aplats]);

  /** Un aplat, peint. Partagé par les deux groupes pour qu'ils ne divergent pas. */
  const peindre = useCallback((m: MotifPlat, i: number) => m.texte ? (
    /* Un texte à la place du tracé — voir `MotifPlat.texte`. Même remplissage, même détourage. */
    <text key={i} x={m.texte.x} y={m.texte.y} fill={remplissage(m)} opacity={m.opacite}
      fontSize={m.texte.taille} fontWeight={m.texte.graisse ?? 600} fontFamily={FONT}
      letterSpacing={m.texte.espacement ?? 0} textAnchor="middle" dominantBaseline="middle"
      clipPath={m.decoupe ? `url(#${m.decoupe}-${marque})` : undefined}
      style={{ userSelect: "none", pointerEvents: "none" }}>{m.texte.contenu}</text>
  ) : (
    <path key={i} d={m.d} fill={remplissage(m)} className={m.classe}
      opacity={m.opacite} fillRule={m.regleDeRemplissage}
      clipPath={m.decoupe ? `url(#${m.decoupe}-${marque})` : undefined}
      stroke={m.trait ?? "none"} strokeWidth={m.epaisseur ?? 0}
      strokeLinejoin="round" strokeLinecap="round" />
  ), [remplissage, marque]);

  /**
   * Ce qui borne le regard : sa région s'il en demande une, la silhouette sinon.
   *
   * ⚠️ **La silhouette borne *toujours*, et l'exception d'avant était un bug.** Ce détourage
   * n'était posé que sur les skins lumineux, au motif que « les yeux d'un visage sont déjà
   * dans sa tête par construction ». C'est vrai d'une sphère et faux de tout le reste : les
   * yeux sont découpés à l'horizon de la **sphère** — le plan `z = 0` —, alors que la
   * silhouette d'un cube ou d'une goutte est déterminée par des points qui ne sont pas sur
   * ce plan. Dès que la tête tourne, un œil proche du bord se projette donc **hors du
   * volume**. Vu sur le carré arrondi à 78° de lacet, pendant le tour complet : l'œil sortait
   * franchement de la tête, sur le côté.
   *
   * ⚠️ **Le détourage plutôt que la géométrie exacte.** La correction propre serait de
   * découper à la silhouette *du solide* au lieu de l'horizon de la sphère — mais cela veut
   * dire résoudre le contour apparent de chaque famille de volume, à chaque orientation, à
   * chaque image. Le détourage SVG obtient le même résultat visible pour le prix d'un
   * groupe, et il est juste par construction : rien de ce qui est peint sur la tête ne peut
   * en sortir.
   */
  const detourageDesYeux = yeuxDuSkin?.decoupe
    ? `url(#${yeuxDuSkin.decoupe}-${marque})`
    : `url(#tete-${marque})`;

  const oeil = useCallback((fermeture: number, cote: -1 | 1) => {
    // ⚠️ La taille globale multiplie **aussi** l'écart : ne redimensionner que les
    // capsules resserrerait le regard à mesure qu'il grandit.
    const largeur = OEIL_REFERENCE.largeur * TAILLE_REFERENCE * vie.largeur;
    const ouverte = OEIL_REFERENCE.hauteur * TAILLE_REFERENCE * vie.hauteur;
    const fente = Math.max(1.5, largeur * 0.12);

    let ecart = OEIL_REFERENCE.ecart * TAILLE_REFERENCE * vie.ecart;
    let elevation = OEIL_REFERENCE.elevation * TAILLE_REFERENCE;
    let large = largeur;
    let haut = ouverte + (fente - ouverte) * fermeture;

    /**
     * ⚠️ **L'inclinaison s'efface à mesure que l'œil se ferme, sinon il se ferme *de travers*.**
     * La fermeture réduit la hauteur de l'œil, c'est-à-dire son **propre** axe — et cet axe est
     * penché dès qu'une expression l'incline. Sur un visage en colère, incliné de 31°, l'œil
     * clos restait un trait oblique de 21 × 14 unités au lieu de s'aplatir : mesuré, contre
     * 24 × 3 pour un œil droit. À l'écran, cela se lit comme un œil qui se ferme sur les côtés.
     *
     * Une paupière tombe à l'horizontale, quelle que soit l'humeur. Ramener l'inclinaison à
     * zéro au fur et à mesure suffit : l'œil ouvert garde son accent, l'œil clos redevient un
     * trait droit, et le trajet entre les deux se lit comme une paupière qui descend.
     */
    let incl = OEIL_REFERENCE.inclinaison + vie.inclinaison;
    incl *= 1 - fermeture;
    let courbe = vie.courbure;
    let plie = vie.pliure;

    /**
     * Le glyphe d'invite de commande : `>` à gauche, `_` à droite.
     *
     * ⚠️ **Les deux yeux cessent d'être symétriques, et c'est le seul endroit du visage où
     * cela arrive.** Ailleurs ils ne diffèrent que par leur fermeture. Ici l'un devient un
     * chevron et l'autre une barre, donc tout se décide par `cote` — et rien de cela ne
     * descend dans `cheminOeil`, qui reçoit déjà ses réglages **par appel**.
     *
     * ⚠️ **Le chevron est l'œil tel quel, seulement plié.** Ni aminci, ni rallongé : ses
     * deux dimensions sont celles du regard ordinaire, simplement échangées, puisque le pli
     * agit le long de l'axe `x` du contour et que l'œil est plus haut que large. On le
     * couche donc à angle droit — `large` reçoit la hauteur de l'œil, `haut` sa largeur —
     * et la pliure casse son milieu vers la droite. Aucune cambrure : deux versions
     * précédentes arquaient, l'une donnait une parenthèse, l'autre un trait aminci qui ne
     * ressemblait plus à un œil.
     *
     * ⚠️ **La barre de droite est le même œil écrasé et élargi**, pas une forme neuve : sa
     * hauteur tombe au tiers de sa largeur, sa largeur grandit de moitié. C'est ce qui la
     * fait lire comme un curseur plutôt que comme un œil fermé.
     *
     * ⚠️ **Elle est posée plus bas que le chevron**, comme le curseur d'un terminal repose
     * sur la ligne de base alors que le `>` l'occupe en entier. Sans ce décalage on lit deux
     * yeux dépareillés ; avec lui, on lit une invite.
     */
    const inv = vie.invite ?? 0;
    if (inv > 0) {
      /**
       * ⚠️ **Les deux yeux ne suivent pas la même règle, et c'est délibéré.**
       *
       * Le **chevron** garde ses dimensions — `large` reste la largeur de l'œil — et ne
       * doit sa forme qu'à la pliure de son grand axe (voir `contourPlie`). Lui échanger
       * longueur et épaisseur le faisait enfler en pavé à mi-chemin, les deux grandeurs
       * passant ensemble par leur moyenne.
       *
       * La **barre**, elle, échange bel et bien les siennes : elle s'aplatit et s'élargit.
       * Elle a d'abord été obtenue par un quart de tour, ce qui gardait ses proportions
       * mais la faisait passer par une diagonale — l'œil basculait au lieu de s'écraser.
       * En restant dans l'axe, le geste se lit comme une paupière qui s'étale, et la forme
       * d'arrivée est exactement la même. L'enflure du chevron ne la menace pas : ses deux
       * dimensions se croisent près de leur produit, si bien que l'aire ne bouge presque
       * pas en chemin.
       */
      const versGauche = cote < 0;
      /* ⚠️ Les deux signes sont réduits d'autant — voir `TAILLE_INVITE` : à leur taille
         d'œil, ils pesaient plus lourd que le regard qu'ils remplacent. */
      const cible = versGauche
        ? { large: largeur * TAILLE_INVITE, haut: ouverte * 0.88 * TAILLE_INVITE,
            incl: 0, courbe: 0, plie: -0.95,
            elev: elevation, ecart: ecart * ECART_INVITE.chevron }
        : { large: ouverte * 0.62 * TAILLE_INVITE, haut: largeur * TAILLE_INVITE,
            incl: 0, courbe: 0, plie: 0,
            elev: elevation - ouverte * 0.28,
            ecart: ecart * ECART_INVITE.barre };
      const vers = (a: number, b: number) => a + (b - a) * inv;
      large = vers(large, cible.large);
      haut = vers(haut, cible.haut);
      incl = vers(incl, cible.incl);
      courbe = vers(courbe, cible.courbe);
      plie = vers(plie, cible.plie);
      elevation = vers(elevation, cible.elev);
      ecart = vers(ecart, cible.ecart);
    }

    /**
     * ⚠️ **Une seule loi pour les huit formes : celle du volume lui-même.** Il y a eu un
     * chemin à part pour les volumes à faces franches — l'œil y était posé à plat sur la
     * face, puis rétréci quand il approchait du bord pour ne pas en sortir. Le rétrécissement
     * était un **facteur**, pas de la géométrie : à l'écran, l'œil devenait minuscule en
     * approchant d'un angle, ce qui se lit comme un effacement arbitraire. Retiré. `cheminOeil`
     * résout chaque point sur le volume : la déformation y vient de la forme, jamais d'un
     * coefficient, et rien ne peut sortir de la silhouette puisque tout y est posé dessus.
     */
    const reglagesOeil = {
      ecart, elevation, largeur: large, hauteur: haut,
      inclinaison: rad(incl),
      courbure: courbe,
      pliure: plie,
      arrondi: OEIL_REFERENCE.forme === "capsule" ? 1 : OEIL_REFERENCE.arrondi,
      /**
       * ⚠️ **L'œil est peint sur le **solide**, pas sur la sphère — et c'est le mode que
       * `avatarSolide` existait pour offrir.** Dans le mode ordinaire, le gonflement vers le
       * volume s'applique *après* la rotation : la face plate d'un cube reçoit un œil taillé
       * pour une sphère, qui se tord en tournant — mesuré à 21,4 % de variation sur un même
       * point de la surface, contre 0 % sur la sphère. Ici le gonflement passe *avant* : l'œil
       * est posé une fois sur la surface et tourne avec elle, rigide, comme un décalque.
       *
       * ⚠️ **Et la visibilité s'y décide par la **normale**, non par le signe de `z`.** C'est
       * ce qui règle le limbe : sur un cube, l'horizon de la sphère n'est pas le bord du
       * volume, et l'œil s'y étirait en croissant avant de disparaître. Une normale qui bascule
       * dit exactement quand la face cesse de nous regarder.
       */
    };
    /**
     * ⚠️ **Le dernier argument, `silhouetteFixe`, n'est pas une option de confort.** La
     * silhouette dessinée ici ne tourne jamais ; un décalque qui la suivrait entièrement
     * finirait par en sortir — la face avant d'un cube basculée de 70° déborde du carré fixe
     * de 28 %, et le détourage tranchait le surplus, ce qui se lisait « l'œil passe
     * derrière ». Avec le drapeau, le regard ne suit la rotation que jusqu'où la face le
     * porte : l'œil garde sa taille et son raccourci, et s'arrête au bord au lieu d'y être
     * coupé.
     */
    /**
     * ⚠️ **Une seule loi pour les huit formes : l'œil marche sur la surface.** Il y en a eu
     * trois — la résolution radiale de la sphère, un décalque plat qu'il fallait *rétrécir*
     * sur les faces franches, un profil de révolution pour le triangle. Deux d'entre elles
     * tenaient par des facteurs, et cela se voyait : l'œil devenait minuscule en approchant
     * d'un angle. Ici il n'y a plus de coefficient nulle part. Voir `avatarSurface` — mesuré,
     * l'œil est droit sur une face plate (0,02 unité de courbure contre 1,06) et ne sort
     * d'aucune silhouette, parce qu'il est posé sur le volume.
     */
    return cheminOeilSurface(reglagesOeil, orientation, cote, RAYON_TETE, ECHANTILLONS, solide);
  }, [vie, orientation, solide]);

  const cheminGauche = oeil(vie.fermetureGauche, -1);
  const cheminDroit = oeil(vie.fermetureDroite, 1);

  /**
   * Les éclats de l'émerveillement, peints **dans** l'œil.
   *
   * ⚠️ **Ils passent par la même projection que l'œil**, `cheminDansOeil` : même ancre,
   * même inclinaison, même résolution sur le volume. Posés à plat par-dessus, ils
   * glisseraient hors de la pupille dès que la tête tourne ou que la silhouette cesse
   * d'être ronde — le défaut ne se verrait qu'en bout de course, là où on ne le cherche pas.
   *
   * ⚠️ **Rien n'est calculé quand l'état est éteint.** Une astroïde de soixante-douze
   * points et un cercle de trente-six, projetés deux fois par image sur un solide, pour un
   * état qui ne se joue que quelques secondes : le garder branché en permanence ferait
   * payer l'émerveillement à tous les avatars de la page, tout le temps.
   */
  const eclats = useMemo(() => {
    const m = vie.emerveille ?? 0;
    if (m <= 0.01) return null;
    const large = OEIL_REFERENCE.largeur * TAILLE_REFERENCE * vie.largeur;
    const haut = OEIL_REFERENCE.hauteur * TAILLE_REFERENCE * vie.hauteur;
    const reglages = {
      ecart: OEIL_REFERENCE.ecart * TAILLE_REFERENCE * vie.ecart,
      elevation: OEIL_REFERENCE.elevation * TAILLE_REFERENCE,
      inclinaison: rad(OEIL_REFERENCE.inclinaison + vie.inclinaison),
    };
    /**
     * ⚠️ **Les reflets se mesurent sur la **petite** dimension de l'œil, jamais sur sa
     * largeur.** L'émerveillement écarquille : l'œil passe de haut et étroit à large et
     * court. Un éclat calibré sur la largeur suivait cet élargissement et finissait par
     * dévorer l'œil — il n'en restait que deux croissants sombres, qui se lisaient comme
     * des sourcils. Rapporté au plus petit côté, il garde sa marge quelle que soit la
     * forme que la mimique donne à l'œil.
     *
     * L'éclat en haut à gauche, la bulle en bas à droite : c'est leur décalage qui donne
     * le volume, deux reflets alignés se lisant comme un motif imprimé.
     */
    const petit = Math.min(large, haut);
    /* ⚠️ `+y` monte dans le repère de l'œil, à l'inverse du SVG. Pris pour un repère
       d'écran, l'éclat tombait en bas et la bulle montait — soit l'inverse exact. */
    /**
     * ⚠️ **L'éclat est droit, pointes aux quatre axes — et c'est ce qui dégage la bulle.**
     * Tourné de trente-six degrés, il envoyait une de ses pointes **exactement** vers elle :
     * les deux se touchaient, et les éloigner l'un de l'autre n'aurait fait que repousser
     * le contact plus loin dans l'œil. Droit, ses creux tombent sur les diagonales, et la
     * bulle se loge dans celui du bas à droite — la géométrie fait la place au lieu qu'on
     * l'obtienne à la marge près.
     */
    const eclat = decaler(contourEclat(petit * 0.168 * m, 72, 0),
      -large * 0.095, haut * 0.10);
    const bulle = decaler(contourBulle(petit * 0.05 * m, 36), large * 0.165, -haut * 0.14);
    /**
     * ⚠️ **Les deux yeux portent le **même** motif, pas son miroir.** `cheminDansOeil`
     * multiplie `x` par `cote` — c'est ce qui met les deux capsules de part et d'autre du
     * visage —, si bien qu'un décalage posé tel quel se retrouve inversé à gauche : éclat
     * à droite d'un œil et à gauche de l'autre, ce qui se lit comme un strabisme. On
     * pré-inverse donc le contour pour l'œil gauche, et le miroir de la projection le
     * remet à l'endroit. Le concept de départ montre bien deux yeux identiques.
     */
    const pour = (cote: -1 | 1) => {
      const droit = (c: { x: number; y: number }[]) =>
        (cote === -1 ? c.map(q => ({ x: -q.x, y: q.y })) : c);
      return [
        cheminDansOeil(droit(eclat), reglages, orientation, cote, RAYON_TETE, solide),
        cheminDansOeil(droit(bulle), reglages, orientation, cote, RAYON_TETE, solide),
      ].join(" ");
    };
    return { gauche: pour(-1), droit: pour(1) };
  }, [vie.emerveille, vie.largeur, vie.hauteur, vie.ecart, vie.inclinaison, orientation, solide]);

  return (
    <svg
      ref={svgRef}
      viewBox="-100 -100 200 200"
      width={taille}
      height={taille}
      role="img"
      aria-label={titre ?? "Novac"}
      style={{ display: "block", flexShrink: 0, overflow: "visible", ...style }}
    >
      {/* L'échelle est une transformation du rendu, pas de la géométrie : la sphère
          reste une sphère, et c'est son image qu'on comprime le temps d'un rebond. */}
      <g transform={`scale(${vie.echelleX.toFixed(4)} ${vie.echelleY.toFixed(4)})`}>
        <path d={contourTete} fill={teteRendue} className="nv-teinte" />
        {/* ⚠️ Déclaré hors du bloc des aplats : le regard s'y détoure désormais **toujours**,
            y compris sur un avatar sans habillage. Laissé sous la condition, il n'existait
            pas là où le défaut se voyait le plus. */}
        <defs>
          <clipPath id={`tete-${marque}`}><path d={contourTete} /></clipPath>
        </defs>
        {aplats.length > 0 && (
          <defs>
            {degrades.map(g => (
              <radialGradient key={g.id} id={`${g.id}-${marque}`}
                gradientUnits="userSpaceOnUse" cx={g.cx} cy={g.cy} r={g.r}>
                {g.arrets.map((a, i) => (
                  <stop key={i} offset={a.a} stopColor={a.couleur}
                    stopOpacity={a.opacite ?? 1} />
                ))}
              </radialGradient>
            ))}
            {decoupes.map(c => (
              <clipPath key={c.id} id={`${c.id}-${marque}`}><path d={c.d} /></clipPath>
            ))}
          </defs>
        )}
        {derriere.length > 0 && (
          <g clipPath={`url(#tete-${marque})`}>{derriere.map(peindre)}</g>
        )}
        {/**
          * ⚠️ **Le halo est *peint*, il n'est plus un filtre — et c'est la correction du
          * défaut le plus tenace de la session.** Un `feGaussianBlur` sur un élément qui
          * bouge à chaque image laissait une traînée derrière le regard : le navigateur
          * recalcule la zone à repeindre d'après la région du filtre et n'efface pas tout
          * ce qu'il devrait. Fixer cette région dans le repère de la tête n'a pas suffi.
          * Un filtre posé sur un contenu animé soixante fois par seconde est fragile par
          * nature ; on ne le règle pas, on s'en passe.
          *
          * ⚠️ **Trois traits de plus en plus larges autour du même tracé.** Un contour épais
          * et translucide suit exactement la forme de la capsule, ce qu'un flou fait aussi —
          * mais sans mémoire d'une image à l'autre. Empilés, ils composent une chute en
          * trois marches au lieu d'un dégradé continu : le même compromis que l'estompe du
          * reflet, pour la même raison, et il tient mieux à quarante pixels qu'un flou de
          * deux unités.
          *
          * ⚠️ **Les yeux qui rayonnent sont détourés par la silhouette, les autres non.**
          * Un halo non contenu déborderait du carré et en trahirait le contour — c'est
          * précisément ce qu'on s'est interdit de toucher. Le détourage n'est posé que
          * lorsqu'il y a une lueur : sans elle, il ne changerait rien et ajouterait un
          * groupe à chaque avatar de la page.
          */}
        {yeux && <g clipPath={detourageDesYeux} className={yeuxDuSkin?.classe}>
          {yeuxDuSkin?.lueur && HALO.map(([largeur, opacite], i) => (
            <g key={i} fill="none" stroke={yeuxDuSkin.lueur!.couleur}
              strokeWidth={yeuxDuSkin.lueur!.rayon * largeur} strokeLinejoin="round"
              opacity={opacite}>
              <path d={cheminGauche} />
              <path d={cheminDroit} />
            </g>
          ))}
          <path d={cheminGauche} fill={couleurYeuxFinale} className="nv-teinte" />
          <path d={cheminDroit} fill={couleurYeuxFinale} className="nv-teinte" />
          {/**
            * Les reflets sont peints dans la couleur de la tête : ce sont des trous dans
            * l'œil, pas des taches posées dessus — c'est ce qui les fait lire comme du
            * brillant plutôt que comme un motif.
            *
            * ⚠️ **Détourés par l'œil, et pas seulement dimensionnés pour y tenir.** Le
            * contour est reprojeté sur le volume : ce qui tient dans la capsule à plat
            * peut en sortir une fois posé sur la tête, d'autant plus que ses angles sont
            * arrondis. Mesurer au plus juste aurait marché sur la sphère et débordé sur le
            * triangle. Le détourage rend la question sans objet.
            */}
          {eclats && (
            <>
              <defs>
                <clipPath id={`oeil-g-${marque}`}><path d={cheminGauche} /></clipPath>
                <clipPath id={`oeil-d-${marque}`}><path d={cheminDroit} /></clipPath>
              </defs>
              <g clipPath={`url(#oeil-g-${marque})`}>
                <path d={eclats.gauche} fill={teteRendue} className="nv-teinte" />
              </g>
              <g clipPath={`url(#oeil-d-${marque})`}>
                <path d={eclats.droit} fill={teteRendue} className="nv-teinte" />
              </g>
            </>
          )}
        </g>}
        {devant.length > 0 && (
          <g clipPath={`url(#tete-${marque})`}>{devant.map(peindre)}</g>
        )}
      </g>
    </svg>
  );
}

/** Deux états assez proches pour qu'un nouveau rendu ne montre rien de plus. */
function identiques(a: EtatVie, b: EtatVie): boolean {
  const cles: (keyof EtatVie)[] = [
    "fermetureGauche", "fermetureDroite", "lacet", "tangage", "roulis",
    "largeur", "hauteur", "ecart", "courbure", "inclinaison",
    "echelleX", "echelleY", "suivi",
  ];
  for (const cle of cles) if (Math.abs(a[cle] - b[cle]) > 1e-4) return false;
  return true;
}
