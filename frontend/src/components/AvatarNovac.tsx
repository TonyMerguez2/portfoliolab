"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  RAYON_TETE, type Orientation, cheminOeil,
} from "@/lib/avatarSpherique";
import { type EtatVie, VIE_AU_REPOS, creerVie } from "@/lib/avatarVie";
import { COULEUR_PAR_DEFAUT, couleurDesYeux } from "@/lib/avatarCouleur";

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

/** Les yeux, en unités de surface sur une tête de rayon 100. */
const LARGEUR = 32;
const HAUTEUR = 66;
const ECART = 27;
/**
 * ⚠️ Deux fois moins d'échantillons que sur la page d'essai. À trente-huit pixels, un
 * contour de deux cent vingt points en dépose six par pixel : on paie un calcul que
 * l'écran ne peut pas montrer.
 */
const ECHANTILLONS = 96;

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
  derive: 7,
  clignement: true,
  cadenceClignement: 3.6,
  spontane: true,
  cadenceSpontane: 4.5,
};

const rad = (d: number) => (d * Math.PI) / 180;
const borner = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export default function AvatarNovac({
  taille = 38,
  etat = "neutre",
  impulsion = 0,
  couleur,
  couleurYeux,
  suivi = true,
  amplitude = 17,
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
  /** Le regard suit-il le curseur dans la fenêtre ? */
  suivi?: boolean;
  /** Débattement du suivi, en degrés. */
  amplitude?: number;
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

  const [vie, setVie] = useState<EtatVie>(VIE_AU_REPOS);
  const [pose, setPose] = useState({ lacet: 0, tangage: 0 });
  const vieRef = useRef(creerVie());
  const cible = useRef({ lacet: 0, tangage: 0 });
  const suiviRef = useRef(1);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [anime, setAnime] = useState(true);

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
    if (!anime) return;
    let image = 0;
    let precedent = performance.now();
    const boucle = (t: number) => {
      const dt = Math.min(64, t - precedent);
      precedent = t;
      // Amorti au temps écoulé et non par image : sinon le mouvement est deux fois plus
      // lent sur un écran à 120 Hz que sur un écran à 60.
      const part = 1 - Math.exp(-dt / 110);
      setPose(p => ({
        lacet: p.lacet + (cible.current.lacet - p.lacet) * part,
        tangage: p.tangage + (cible.current.tangage - p.tangage) * part,
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
  }, [anime]);

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

  const orientation: Orientation = useMemo(() => ({
    lacet: rad(pose.lacet + vie.lacet),
    tangage: rad(pose.tangage + vie.tangage),
    roulis: rad(vie.roulis),
  }), [pose, vie]);

  const oeil = useCallback((fermeture: number, cote: -1 | 1) => cheminOeil({
    ecart: ECART * vie.ecart,
    elevation: 0,
    largeur: LARGEUR * vie.largeur,
    hauteur: (() => {
      const ouverte = HAUTEUR * vie.hauteur;
      const fente = Math.max(1.5, LARGEUR * vie.largeur * 0.12);
      return ouverte + (fente - ouverte) * fermeture;
    })(),
    inclinaison: rad(vie.inclinaison),
    courbure: vie.courbure,
  }, orientation, cote, RAYON_TETE, ECHANTILLONS), [vie, orientation]);

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
        <circle cx={0} cy={0} r={RAYON_TETE} fill={teteRendue} />
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
