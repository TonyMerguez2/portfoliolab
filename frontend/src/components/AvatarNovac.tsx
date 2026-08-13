"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  RAYON_TETE, type Orientation, cheminOeil, cheminSvg, contourSilhouette,
} from "@/lib/avatarSpherique";
import { type FamilleSolide, melangerSolides, solideDepuis } from "@/lib/avatarVolume";
import {
  ARRONDI_REFERENCE, OEIL_REFERENCE, TAILLE_REFERENCE, VIE_REFERENCE,
} from "@/lib/avatarReglages";
import { type EtatVie, VIE_AU_REPOS, creerVie } from "@/lib/avatarVie";
import { COULEUR_PAR_DEFAUT, couleurDesYeux } from "@/lib/avatarCouleur";
import { skinParCle } from "@/lib/avatarSkins";
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


/** Le volume que porte chaque forme proposée. */
const FAMILLE: Record<FormeAvatar, FamilleSolide> = {
  sphere: "sphere",
  carre: "cube",
  etoile: "etoile",
  etoile6: "etoile6",
  coussin: "coussin",
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
  return cheminSvg(contourSilhouette(solideDepuis(FAMILLE[forme], ARRONDI_REFERENCE),
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
    const arrivee = solideDepuis(FAMILLE[forme], ARRONDI_REFERENCE);
    if (!transition) return arrivee;
    return melangerSolides(
      solideDepuis(FAMILLE[transition.de], ARRONDI_REFERENCE), arrivee, transition.part);
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
    const dy = (e.clientY - (boite.top + boite.height / 2)) / (window.innerHeight * 0.6);
    const force = amplitude * suiviRef.current;
    cible.current = {
      lacet: borner(dx * force, -38, 38),
      // Moins d'amplitude en vertical : une tête bascule moins haut qu'elle ne pivote.
      tangage: borner(dy * force * 0.6, -26, 26),
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
  const contourTete = useMemo(
    () => cheminSvg(contourSilhouette(solide, RAYON_TETE, 180)), [solide]);

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

  const oeil = useCallback((fermeture: number, cote: -1 | 1) => {
    // ⚠️ La taille globale multiplie **aussi** l'écart : ne redimensionner que les
    // capsules resserrerait le regard à mesure qu'il grandit.
    const largeur = OEIL_REFERENCE.largeur * TAILLE_REFERENCE * vie.largeur;
    const ouverte = OEIL_REFERENCE.hauteur * TAILLE_REFERENCE * vie.hauteur;
    const fente = Math.max(1.5, largeur * 0.12);
    return cheminOeil({
      ecart: OEIL_REFERENCE.ecart * TAILLE_REFERENCE * vie.ecart,
      elevation: OEIL_REFERENCE.elevation * TAILLE_REFERENCE,
      largeur,
      hauteur: ouverte + (fente - ouverte) * fermeture,
      inclinaison: rad(OEIL_REFERENCE.inclinaison + vie.inclinaison),
      courbure: vie.courbure,
      arrondi: OEIL_REFERENCE.forme === "capsule" ? 1 : OEIL_REFERENCE.arrondi,
    }, orientation, cote, RAYON_TETE, ECHANTILLONS, solide);
  }, [vie, orientation, solide]);

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
        <path d={contourTete} fill={teteRendue} />
        {aplats.length > 0 && (
          <>
            <defs>
              <clipPath id={`tete-${marque}`}><path d={contourTete} /></clipPath>
            </defs>
            <g clipPath={`url(#tete-${marque})`}>
              {aplats.map((m, i) => (
                <path key={i} d={m.d} fill={m.couleur}
                  stroke={m.trait ?? "none"} strokeWidth={m.epaisseur ?? 0}
                  strokeLinejoin="round" strokeLinecap="round" />
              ))}
            </g>
          </>
        )}
        <path d={oeil(vie.fermetureGauche, -1)} fill={yeuxRendus} />
        <path d={oeil(vie.fermetureDroite, 1)} fill={yeuxRendus} />
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
