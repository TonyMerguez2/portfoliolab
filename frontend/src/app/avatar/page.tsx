"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  RAYON_TETE, type Orientation, type ReglagesOeil, cheminOeil, cheminSvg,
  cheminsSurLaTete, contourSilhouette, projeter, tournerTete, traitSurLaTete,
} from "@/lib/avatarSpherique";
import { type FamilleSolide, melangerSolides, solideDepuis } from "@/lib/avatarVolume";
import {
  ARRONDI_REFERENCE, OEIL_REFERENCE, TAILLE_REFERENCE, VIE_REFERENCE,
} from "@/lib/avatarReglages";
import { grilleSpherique } from "@/lib/avatarGrille";
import {
  cheminOeilSolide, cheminsSurLeSolide, contourTeteSolide, normaleSolide,
  regardDansLeSolide, surLeSolide, traitSurLeSolide,
} from "@/lib/avatarSolide";
import {
  ACCESSOIRES, CASQUETTE_REFERENCE, type FamilleAccessoire, cheminsCasquette, contraste,
} from "@/lib/avatarAccessoires";
import { PRESETS, SKINS, type Palette, skinParCle } from "@/lib/avatarSkins";
import { type EtatVie, VIE_AU_REPOS, creerVie } from "@/lib/avatarVie";
import { useMorphose } from "@/lib/useMorphose";
import { ETATS } from "@/lib/avatarEtats";
import { messagePour } from "@/lib/avatarDialogue";
import { pourFondSombre } from "@/lib/couleur";

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

/**
 * Le maillage de la sphère, calculé une fois pour la vie du module.
 *
 * ⚠️ Hors du composant, et pas dans un `useMemo` : il ne dépend d'aucun état. Placé
 * dedans, il serait refait à chaque montage pour rendre exactement la même chose.
 */
const GRILLE = grilleSpherique();

/**
 * Les couleurs des trois axes, dans la convention universelle X rouge, Y vert, Z bleu.
 *
 * ⚠️ Ne pas la réinventer : quiconque a déjà ouvert un logiciel 3D lit ces trois
 * couleurs sans légende, et les intervertir coûterait plus cher que tout ce qu'un choix
 * plus joli pourrait rapporter.
 */
const COULEUR_AXE = { x: "#F87171", y: "#4ADE80", z: "#60A5FA" } as const;

/** Les volumes proposés, dans l'ordre du plus simple au plus surprenant. */
const FORMES: [FamilleSolide, string][] = [
  ["sphere", "Sphère"],
  ["cube", "Carré arrondi"],
  ["etoile", "Étoile"],
  ["etoile6", "Étoile 6 lobes"],
  ["coussin", "Coussin"],
  ["hexagone", "Hexagone"],
  ["triangle", "Triangle"],
  ["goutte", "Goutte"],
];

/** Le pictogramme d'un volume, dans la couleur du bouton. */
function VignetteVolume({ famille }: { famille: FamilleSolide }) {
  const c = { width: 16, height: 16, viewBox: "0 0 16 16", "aria-hidden": true } as const;
  const f = { fill: "currentColor" };
  switch (famille) {
    case "cube":
      return <svg {...c}><rect x={1} y={1} width={14} height={14} rx={4} {...f} /></svg>;
    case "etoile":
      return <svg {...c}><path d="M8 1.4c1 2.7 2.4 4.1 5.1 5.1-2.7 1-4.1 2.4-5.1 5.1-1-2.7-2.4-4.1-5.1-5.1 2.7-1 4.1-2.4 5.1-5.1z" transform="translate(0 1.2)" {...f} /></svg>;
    case "etoile6":
      return (
        <svg {...c}>
          <path d="M8 1.8c.7 2.5 1.6 3.4 4.1 4.1-2.5.7-3.4 1.6-4.1 4.1-.7-2.5-1.6-3.4-4.1-4.1 2.5-.7 3.4-1.6 4.1-4.1z" transform="translate(0 2)" {...f} />
          <path d="M8 1.8c.7 2.5 1.6 3.4 4.1 4.1-2.5.7-3.4 1.6-4.1 4.1-.7-2.5-1.6-3.4-4.1-4.1 2.5-.7 3.4-1.6 4.1-4.1z" transform="rotate(30 8 8) translate(0 2)" {...f} />
        </svg>
      );
    case "coussin":
      // Une capsule couchée : bouts ronds, côtés droits.
      return <svg {...c}><rect x={0.8} y={3.6} width={14.4} height={8.8} rx={4.4} {...f} /></svg>;
    case "hexagone":
      return <svg {...c}><path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6z" {...f} /></svg>;
    case "triangle":
      return <svg {...c}><path d="M8 2 14.4 13.2H1.6z" {...f} stroke="currentColor" strokeWidth={2.6} strokeLinejoin="round" /></svg>;
    case "goutte":
      return <svg {...c}><path d="M8 1.4c2.7 3.6 5.3 5.4 5.3 8.3a5.3 5.3 0 1 1-10.6 0c0-2.9 2.6-4.7 5.3-8.3z" {...f} /></svg>;
    default:
      return <svg {...c}><circle cx={8} cy={8} r={7} {...f} /></svg>;
  }
}

/** Le pictogramme d'un accessoire, dans la couleur du bouton. */
function VignetteAccessoire({ famille }: { famille: FamilleAccessoire }) {
  const c = { width: 16, height: 16, viewBox: "0 0 16 16", "aria-hidden": true } as const;
  if (famille === "casquette") {
    return (
      <svg {...c}>
        <path d="M2.6 9.4a5.4 5.4 0 0 1 10.8 0z" fill="currentColor" />
        <path d="M13.4 8.6c1.6 0 2.6.5 2.6 1.4h-3.6z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg {...c}>
      <circle cx={8} cy={8} r={6} fill="none" stroke="currentColor" strokeWidth={1.6} />
      <path d="M4 12 12 4" stroke="currentColor" strokeWidth={1.6} />
    </svg>
  );
}

/** L'orientation nulle — celle où les habillages sont figés. */
const AU_REPOS: Orientation = { lacet: 0, tangage: 0, roulis: 0 };

/**
 * La pastille de notification, en unités de surface sur une tête de rayon 100.
 *
 * ⚠️ **L'écart n'est pas une bordure, c'est un vide.** Un liseré de la couleur du fond
 * ferait illusion tant que le fond ne change pas ; ici la silhouette est vraiment creusée,
 * et l'écart est la largeur de ce creux. Il vaut un tiers du rayon de la pastille : moins,
 * et le trou se lit comme un défaut d'anticrénelage ; plus, et la tête paraît grignotée.
 */
const RAYON_PASTILLE = 17;
const ECART_PASTILLE = 6;

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

/**
 * Ce qui appartient en propre à **un** œil.
 *
 * ⚠️ **Un jeu par œil, et non un jeu commun plus des écarts.** La tentation était de
 * garder les réglages partagés et d'y ajouter une différence par œil : c'est le même
 * nombre de curseurs, mais la valeur affichée ne serait plus celle de l'œil qu'on
 * regarde, et régler le gauche déplacerait le droit d'un même geste. Deux jeux
 * complets, un lien qui les recopie quand on veut la symétrie.
 *
 * `taille` reste dehors : c'est l'échelle de tout le regard, pas d'un œil.
 */
type Oeil = {
  largeur: number;
  hauteur: number;
  /** Distance géodésique à l'axe du visage : chaque œil a la sienne. */
  ecart: number;
  /** Hauteur de l'ancre sur la sphère, vers le haut si positive. */
  elevation: number;
  /**
   * Inclinaison propre, en degrés, **en miroir** d'un œil à l'autre — la même valeur
   * des deux côtés produit une expression symétrique. C'est ce qui permet aux boutons
   * d'expression de ne porter qu'un nombre.
   */
  inclinaison: number;
  /**
   * La forme du contour.
   *
   * ⚠️ **Deux champs et non un seul.** L'arrondi suffirait à décrire les deux formes —
   * la capsule est l'arrondi maximal — mais alors revenir à « Capsule » écraserait la
   * valeur réglée pour le carré, et l'on ne la retrouverait plus en revenant. Le choix
   * de forme et le réglage du carré vivent donc séparément.
   */
  forme: "capsule" | "carre";
  /** Arrondi des quatre coins du carré, de 0 (angles vifs) à 1 (capsule). */
  arrondi: number;
};

const OEIL_PAR_DEFAUT: Oeil = { ...OEIL_REFERENCE };


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
  const [roulis, setRoulis] = useState(0);
  const [grille, setGrille] = useState(true);
  /**
   * L'arrondi de la silhouette : 1 pour la sphère, moins pour le carré à coins ronds.
   *
   * ⚠️ Un seul nombre, et non une liste de formes. Le disque et le carré sont les deux
   * bouts d'un même réglage, ce qui rend toutes les valeurs intermédiaires disponibles
   * — et surtout animables, le jour où la tête devra passer de l'une à l'autre.
   */
  const [silhouette, setSilhouette] = useState(ARRONDI_REFERENCE);
  const [formeTete, setFormeTete] = useState<FamilleSolide>("sphere");
  /** Le solide tourne-t-il pour de bon, ou seule son image est-elle étirée ? */
  const [vraie3D, setVraie3D] = useState(false);
  /** L'exposant de la superellipsoïde : 2 pour la sphère, davantage vers le cube. */
  /**
   * ⚠️ **La morphose passe par le rayon, pas par l'image.** Fondre deux dessins l'un dans
   * l'autre donnerait un fantôme — deux formes superposées, jamais une forme
   * intermédiaire. Ici les familles disent toutes la même chose, un rayon par direction,
   * si bien que leur moyenne en est un aussi : le triangle devient rond en passant par
   * des triangles de plus en plus émoussés. Le curseur d'arrondi s'applique aux deux
   * bouts, de sorte qu'on peut le pousser pendant la transition sans la casser.
   */
  const morphose = useMorphose(formeTete);
  const solideDe = useCallback(
    (f: FamilleSolide) => solideDepuis(f, f === "sphere" ? 1 : silhouette), [silhouette]);
  const solideTete = useMemo(
    () => (morphose
      ? melangerSolides(solideDe(morphose.de), solideDe(formeTete), morphose.part)
      : solideDe(formeTete)),
    [formeTete, morphose, solideDe]);
  const [vie, setVie] = useState<EtatVie>(VIE_AU_REPOS);
  const [expression, setExpression] = useState<CleExpression>("neutre");
  const [taille, setTaille] = useState(TAILLE_REFERENCE);
  const [yeux, setYeux] = useState<{ gauche: Oeil; droit: Oeil }>(
    { gauche: OEIL_PAR_DEFAUT, droit: OEIL_PAR_DEFAUT });
  /** Tant que le lien tient, un curseur touche les deux yeux à la fois. */
  const [lies, setLies] = useState(true);
  const [oeilRegle, setOeilRegle] = useState<"gauche" | "droit">("gauche");
  const [suivi, setSuivi] = useState(true);
  const [amplitude, setAmplitude] = useState(VIE_REFERENCE.amplitude);
  const [clignement, setClignement] = useState(VIE_REFERENCE.clignement);
  const [cadence, setCadence] = useState(VIE_REFERENCE.cadenceClignement);
  const [etat, setEtat] = useState("neutre");
  /**
   * L'état **réellement joué**, ponctuel compris — c'est lui qui parle.
   *
   * ⚠️ **Il ne peut pas être `etat`, et c'est la raison d'être de ce second réglage.**
   * `etat` sert à montrer quel bouton est retenu dans la colonne des états, et un ponctuel
   * ne doit justement *pas* s'y montrer retenu : il se joue puis rend la main. Il ne reçoit
   * donc que le fond. En rebranchant la parole dessus, « Succès » et « Erreur » n'ont
   * jamais rien dit — mesuré, le mot passait directement au salut : leurs phrases étaient
   * du code mort, alors que ce sont les deux moments où le personnage a le plus à dire.
   */
  const [parole, setParole] = useState("neutre");
  const [derive, setDerive] = useState(VIE_REFERENCE.derive);
  const [notification, setNotification] = useState(false);
  const [dialogue, setDialogue] = useState(false);
  const [pseudo, setPseudo] = useState("Sacha");
  const [accessoire, setAccessoire] = useState<FamilleAccessoire>("aucun");
  const [casquette, setCasquette] = useState(CASQUETTE_REFERENCE);
  /**
   * ⚠️ **Sa teinte à lui, hors de la palette.** L'accessoire a d'abord repris la couleur
   * d'accent : sur le skin uni, où l'accent ne sert à rien d'autre, la casquette sortait
   * du même violet que le crâne et ne se lisait plus. La palette décrit ce qui est
   * *peint sur la surface* — tête, motifs, yeux ; un objet posé par-dessus n'en fait pas
   * partie, et lui imposer d'y entrer aurait obligé les quatre skins à déclarer une
   * couleur de chapeau qu'ils n'ont pas.
   */
  const [couleurCoiffe, setCouleurCoiffe] = useState("#1E2340");
  const [skin, setSkin] = useState("uni");
  /**
   * ⚠️ **Les skins réservés à la sphère disparaissent des choix, ils ne s'y grisent pas.**
   * Une carte du monde transportée sur un triangle n'est pas un globe un peu déformé :
   * c'est une image fausse, que rien dans l'interface ne rattraperait. Et comme la forme
   * peut changer *après* le choix du skin, la sélection doit aussi savoir se retirer.
   */
  const skinsOfferts = useMemo(
    () => SKINS.filter(x => !x.rond || formeTete === "sphere"),
    [formeTete]);
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
    roulis: rad(roulis + vie.roulis),
  }), [lacet, tangage, roulis, vie]);

  /**
   * Le maillage projeté : parallèles, méridiens et axes, séparés avant/arrière.
   *
   * ⚠️ **L'arrière se dessine, il ne se jette pas.** C'est lui qui donne le volume :
   * sur une sphère opaque vue en orthographique, la seule chose qui distingue un
   * quart de tour d'un trois-quarts de tour, c'est la façon dont les lignes cachées
   * se resserrent. Tracé en pâle par-dessus la sphère, comme un globe filaire.
   */
  const maillage = useMemo(() => {
    if (!grille) return null;
    const devant: string[] = [], derriere: string[] = [];
    const trait = (courbe: { x: number; y: number; z: number }[]) => (vraie3D
      ? traitSurLeSolide(courbe, orientation, RAYON_TETE, solideTete)
      : traitSurLaTete(courbe, orientation, RAYON_TETE, true, solideTete));
    const ajouter = (courbe: { x: number; y: number; z: number }[]) => {
      const t = trait(courbe);
      if (t.devant) devant.push(t.devant);
      if (t.derriere) derriere.push(t.derriere);
    };
    for (let i = 1; i < GRILLE.meridiens.length; i++) ajouter(GRILLE.meridiens[i]);
    for (const p of GRILLE.paralleles) ajouter(p);
    return {
      devant: devant.join(" "),
      derriere: derriere.join(" "),
      // L'équateur et le méridien du visage portent le repère : accentués, ils disent
      // d'un coup d'œil où passent l'horizon de la tête et son plan de symétrie.
      equateur: trait(GRILLE.equateur),
      median: trait(GRILLE.meridiens[0]),
      axes: GRILLE.axes.map(a => {
        // En vraie 3D, l'axe s'arrête sur la surface du solide et sa visibilité se lit
        // sur la normale, comme tout le reste.
        const surface = vraie3D ? surLeSolide(a.pointe, solideTete) : a.pointe;
        const p = tournerTete(surface, orientation.lacet, orientation.tangage, orientation.roulis ?? 0);
        const n = vraie3D
          ? tournerTete(normaleSolide(a.pointe, solideTete),
            orientation.lacet, orientation.tangage, orientation.roulis ?? 0)
          : p;
        return {
          cle: a.cle, signe: a.signe, devant: n.z >= 0,
          bout: projeter(p, RAYON_TETE, vraie3D ? undefined : solideTete),
        };
      }),
    };
  }, [grille, orientation, solideTete, vraie3D]);

  /**
   * Le contour de la tête.
   *
   * ⚠️ En mode ordinaire il ne dépend que de la forme — la silhouette ne bouge pas. En
   * vraie 3D il dépend aussi de l'orientation, puisque c'est justement ce qui change :
   * le solide tourne, sa silhouette respire.
   */
  const contourTete = useMemo(
    () => (vraie3D
      ? contourTeteSolide(orientation, solideTete, RAYON_TETE)
      : cheminSvg(contourSilhouette(solideTete, RAYON_TETE))),
    [vraie3D, orientation, solideTete]);

  /**
   * La casquette, déduite de la silhouette réellement tracée.
   *
   * ⚠️ **Recalculée sur la forme, jamais sur l'orientation.** Un accessoire est posé, pas
   * peint : il ne suit pas la tête. Le mettre dans les dépendances de l'orientation
   * l'aurait refait soixante fois par seconde pour rien — et le contour qu'il mesure
   * compte sept cent vingt points.
   */
  const coiffe = useMemo(
    () => (accessoire === "casquette"
      ? cheminsCasquette(solideTete, RAYON_TETE, casquette)
      : null),
    [accessoire, casquette, solideTete]);

  /**
   * ⚠️ **Les habillages ne tournent plus avec la tête, et c'est délibéré.** Une découpe
   * peinte sur la sphère tourne juste ; la même sur un triangle ou une capsule s'y
   * étire, parce que ces volumes ne se comportent pas comme une sphère sous la rotation.
   * Les autres formes recevront elles aussi des habillages et devront y rester fixes :
   * faire tourner celui de la sphère seul aurait donné deux règles pour une même famille
   * de réglages. On les calcule donc **au repos**, une fois, et le regard seul s'anime.
   * Ce qu'on perd en réalisme sur une forme, on le gagne en unité sur les huit — et en
   * calcul, puisque plus rien ici ne dépend de l'image.
   */
  /**
   * Où poser la pastille de notification, sur n'importe laquelle des huit formes.
   *
   * ⚠️ **Sur la silhouette mesurée, et non dans le coin du cadre.** Le carré de la tête
   * est le même pour tous les volumes, mais aucun ne le remplit : posée à 45° du cadre, la
   * pastille flotterait à trente unités du triangle et mordrait la capsule de plein fouet.
   * On cherche donc le point du contour le plus avancé vers le haut-droit — le maximum de
   * `x − y`, l'écran comptant les `y` vers le bas — et la pastille s'y assied. Elle est
   * alors toujours **à cheval** sur le bord, quelle que soit la forme.
   */
  const pastille = useMemo(() => {
    const contour = contourSilhouette(solideTete, RAYON_TETE, 720);
    let choisi = contour[0];
    for (const p of contour) if (p.x - p.y > choisi.x - choisi.y) choisi = p;
    return choisi;
  }, [solideTete]);

  const cheminsMotifs = useMemo(
    () => motifs.map(m => ({
      d: vraie3D
        ? cheminsSurLeSolide(m.morceaux, AU_REPOS, RAYON_TETE, solideTete)
        : cheminsSurLaTete(m.morceaux, AU_REPOS, RAYON_TETE, solideTete),
      couleur: m.couleur,
      trait: m.trait,
      epaisseur: m.epaisseur,
    })),
    [motifs, solideTete, vraie3D]);

  /** Les aplats plats du skin, détourés par la silhouette et jamais recalculés. */
  const aplats = useMemo(() => {
    const s = skinParCle(skin);
    return s.plats ? s.plats(palette) : [];
  }, [skin, palette]);

  /** Choisir un skin **propose** sa palette ; elle reste modifiable ensuite. */
  const choisirSkin = useCallback((cle: string) => {
    setSkin(cle);
    setPalette(skinParCle(cle).palette);
  }, []);

  /** Changer de forme retire le skin s'il ne valait que pour la sphère. */
  const choisirForme = useCallback((cle: FamilleSolide) => {
    setFormeTete(cle);
    setSkin(courant => {
      if (cle === "sphere" || !skinParCle(courant).rond) return courant;
      setPalette(skinParCle("uni").palette);
      return "uni";
    });
  }, []);

  const inclinaison = EXPRESSIONS.filter(e => e.cle === expression)[0].inclinaison;

  /** L'œil dont les curseurs montrent les valeurs — le gauche tant que le lien tient. */
  const oeilCourant = lies ? yeux.gauche : yeux[oeilRegle];

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
  const reglagesOeil = useCallback((oeil: Oeil, fermeture: number): ReglagesOeil => {
    const largeurRendue = oeil.largeur * taille * vie.largeur;
    const ouverte = oeil.hauteur * taille * vie.hauteur;
    const fente = Math.max(1.5, largeurRendue * 0.12);
    return {
      ecart: oeil.ecart * taille * vie.ecart,
      elevation: oeil.elevation * taille,
      largeur: largeurRendue,
      hauteur: ouverte + (fente - ouverte) * fermeture,
      /**
       * ⚠️ **L'expression s'*ajoute* au réglage de l'œil, elle ne le remplace pas.**
       * Sans quoi choisir « fâché » effacerait un regard asymétrique qu'on vient de
       * composer, et les deux réglages se battraient — le symptôme classique des
       * valeurs qui prétendent commander la même chose.
       */
      inclinaison: rad(oeil.inclinaison + inclinaison + vie.inclinaison),
      courbure: vie.courbure,
      arrondi: oeil.forme === "capsule" ? 1 : oeil.arrondi,
    };
  }, [taille, inclinaison, vie]);

  const oeilGauche = useMemo(
    () => (vraie3D ? cheminOeilSolide : cheminOeil)(
      reglagesOeil(yeux.gauche, vie.fermetureGauche), orientation, -1,
      RAYON_TETE, 220, solideTete),
    [reglagesOeil, yeux.gauche, vie.fermetureGauche, orientation, solideTete, vraie3D]);
  const oeilDroit = useMemo(
    () => (vraie3D ? cheminOeilSolide : cheminOeil)(
      reglagesOeil(yeux.droit, vie.fermetureDroite), orientation, 1,
      RAYON_TETE, 220, solideTete),
    [reglagesOeil, yeux.droit, vie.fermetureDroite, orientation, solideTete, vraie3D]);

  /**
   * Écrit un réglage sur l'œil courant, ou sur les deux si le lien tient.
   *
   * ⚠️ **Le lien recopie, il ne synchronise pas.** Rompre le lien laisse donc les deux
   * yeux exactement là où ils étaient, et le rétablir ne les ramène pas de force :
   * c'est le prochain réglage qui les réunit. Un lien qui égaliserait à l'instant où on
   * le rétablit ferait perdre un travail sans prévenir.
   */
  const reglerOeil = useCallback((champ: keyof Oeil, valeur: number | Oeil["forme"]) => {
    setYeux(y => (lies
      ? { gauche: { ...y.gauche, [champ]: valeur }, droit: { ...y.droit, [champ]: valeur } }
      : { ...y, [oeilRegle]: { ...y[oeilRegle], [champ]: valeur } }));
  }, [lies, oeilRegle]);

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
      /**
       * ⚠️ **Comparé avant d'être posé, comme la pose au-dessus.** `courant()` rend une
       * chaîne à chaque image ; la reposer telle quelle relancerait un rendu soixante fois
       * par seconde. Elle ne change qu'aux transitions, donc l'égalité suffit.
       */
      setParole(v => { const c = vieRef.current.courant(); return v === c ? v : c; });
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
      const l = borner(prise.lacet + (e.clientX - prise.x) * 0.35, -180, 180);
      const t = borner(prise.tangage + (e.clientY - prise.y) * 0.35, -180, 180);
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
    /**
     * ⚠️ **L'écart est borné, pas la pose.** Les bornes valaient ±55° et ±42° en
     * absolu : dès que la tête pouvait faire un tour complet, elles ramenaient de
     * force une pose de dos vers le trois-quarts, et le curseur reculait tout seul
     * sous la souris. Ce qu'il faut brider, c'est ce que la souris *ajoute*.
     */
    cible.current = {
      lacet: repos.current.lacet + dx * force,
      // Moins d'amplitude en vertical : une tête bascule moins haut qu'elle ne pivote.
      tangage: repos.current.tangage + dy * force * 0.62,
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
          {/**
            * ⚠️ **La parole est du HTML posé à côté du dessin, et non un tracé dans le SVG.**
            * C'est du **texte** : il doit enrouler tout seul quand la place manque — et elle
            * manque, il ne reste qu'un septième de la scène à droite du crâne —, hériter de
            * la police de l'application et rester sélectionnable. Un `<text>` SVG ne fait
            * aucune des trois : il ne connaît pas le retour à la ligne, et il faudrait
            * mesurer soi-même où couper « Bonjour Sacha ! ».
            *
            * ⚠️ **Elle s'ancre sur le bord du crâne, pas sur celui du cadre.** La tête
            * occupe le tiers central du repère — deux cents unités sur trois cents — donc
            * son flanc droit tombe à cinq sixièmes de la largeur rendue, quelle que soit la
            * taille à l'écran. C'est ce rapport qu'on écrit, et non une distance en pixels
            * qui se serait décrochée au premier redimensionnement.
            */}
          <div style={{ position: "relative", width: "min(94%, 678px)", flexShrink: 0 }}>
          <svg
            ref={svgRef}
            className="av-tete"
            /**
             * ⚠️ **Le cadre est plus large que la tête, et la tête n'a pas rétréci.**
             * Un accessoire dépasse de la silhouette — la visière d'une casquette
             * s'avance de cinquante-cinq unités là où le cadre n'en laissait que quinze,
             * et elle arrivait tranchée net. On élargit donc le repère de 230 à 300
             * unités, **et** la largeur à l'écran dans le même rapport : 200 unités de
             * tête occupent exactement le même nombre de pixels qu'avant. Le cadre ne
             * fait que gagner de la marge autour.
             */
            viewBox="-150 -150 300 300"
            onPointerDown={commencer}
            onPointerUp={relacher}
            onPointerCancel={relacher}
            role="img"
            aria-label={`Visage orienté de ${lacet.toFixed(0)} degrés horizontalement, `
              + `${tangage.toFixed(0)} degrés verticalement et ${roulis.toFixed(0)} degrés `
              + "d’inclinaison"}
            style={{ width: "100%", height: "auto", display: "block" }}
          >
            {/* ⚠️ **Le squash est une échelle du rendu, pas une déformation de la
                sphère.** L'écrasement d'un rebond touche l'objet entier, motifs et yeux
                compris : le passer dans la géométrie aurait obligé chaque contour à en
                tenir compte, et la sphère ne serait plus une sphère — la coupe de
                l'hémisphère et la silhouette n'auraient plus de sens. Ici la géométrie
                reste sphérique et c'est l'image qu'on comprime. */}
            {/**
              * ⚠️ **Le masque creuse la tête, il ne pose pas un anneau par-dessus.** Un
              * cercle de la couleur du fond autour de la pastille aurait le même air —
              * jusqu'à ce que la page change de fond, ou qu'un skin passe dessous. En
              * découpant vraiment la silhouette, le trou laisse voir ce qu'il y a derrière,
              * quoi que ce soit. C'est aussi ce qui met la notification en avant : elle ne
              * se pose pas sur la tête, elle y mord.
              *
              * ⚠️ **Le masque porte sur tout le groupe, pas sur le seul contour.** Appliqué
              * à la tête seule, un œil ou une couture de skin traverserait le trou.
              */}
            <mask id="av-encoche">
              <rect x={-150} y={-150} width={300} height={300} fill="#fff" />
              {notification && (
                <circle cx={pastille.x} cy={pastille.y} r={RAYON_PASTILLE + ECART_PASTILLE}
                  fill="#000" />
              )}
            </mask>
            <g mask="url(#av-encoche)"
              transform={`scale(${vie.echelleX.toFixed(4)} ${vie.echelleY.toFixed(4)})`}>
              <path d={contourTete} fill={palette.tete} />
              {/* Les découpes du skin, prises sur la surface au repos. Dessinées avant
                  les yeux, pour que le regard passe devant la couture qu'il croise. */}
              {cheminsMotifs.map((m, i) => (
                <path key={i} d={m.d} fill={m.couleur}
                  stroke={m.trait ?? "none"} strokeWidth={m.epaisseur ?? 0}
                  strokeLinejoin="round" />
              ))}
              {/**
                * Les aplats plats, **détourés par la silhouette**.
                *
                * ⚠️ C'est le détourage qui fait la carte : les terres sont dessinées plus
                * larges que la tête et tranchées par son bord. Sans lui, elles
                * flotteraient à l'intérieur du disque et se liraient comme des taches
                * posées dessus, jamais comme un globe.
                */}
              {aplats.length > 0 && (
                <>
                  <defs>
                    <clipPath id="av-tete">
                      <path d={contourTete} />
                    </clipPath>
                  </defs>
                  <g clipPath="url(#av-tete)">
                    {aplats.map((m, i) => (
                      <path key={i} d={m.d} fill={m.couleur}
                        stroke={m.trait ?? "none"} strokeWidth={m.epaisseur ?? 0}
                        strokeLinejoin="round" strokeLinecap="round" />
                    ))}
                  </g>
                </>
              )}
              {/**
                * Le maillage, entre les motifs et les yeux.
                *
                * ⚠️ **Par-dessus la sphère, y compris pour sa face cachée.** Un fil de
                * fer se dessine normalement *à travers* le volume ; ici la sphère est
                * un aplat opaque, et les lignes de derrière seraient purement et
                * simplement effacées. On les peint donc au-dessus, en très pâle : la
                * lecture reste celle d'un globe transparent, sans avoir à rendre la
                * tête translucide.
                *
                * ⚠️ `vectorEffect` fixe l'épaisseur du trait **à l'écran**, alors que
                * tout le SVG est mis à l'échelle par la largeur du panneau. Sans lui,
                * la grille s'épaissit avec la fenêtre et finit par manger la sphère.
                */}
              {maillage && (
                <g fill="none" strokeLinecap="round" strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke" pointerEvents="none">
                  <path d={maillage.derriere} stroke="rgba(255,255,255,0.13)" strokeWidth={1} />
                  <path d={maillage.equateur.derriere} stroke="rgba(255,255,255,0.22)" strokeWidth={1.4} />
                  <path d={maillage.median.derriere} stroke="rgba(255,255,255,0.22)" strokeWidth={1.4} />
                  <path d={maillage.devant} stroke="rgba(255,255,255,0.34)" strokeWidth={1} />
                  <path d={maillage.equateur.devant} stroke="rgba(255,255,255,0.62)" strokeWidth={1.6} />
                  <path d={maillage.median.devant} stroke="rgba(255,255,255,0.62)" strokeWidth={1.6} />
                  {/* Les axes de la tête. Celui qui pointe vers l'avant est l'axe du
                      regard : c'est lui qu'on suit pour savoir où le visage est tourné. */}
                  {maillage.axes.map((a, i) => (
                    <line key={i} x1={0} y1={0} x2={a.bout.x} y2={a.bout.y}
                      stroke={COULEUR_AXE[a.cle]} strokeWidth={a.devant ? 1.8 : 1.2}
                      strokeDasharray={a.devant ? undefined : "3 4"}
                      opacity={a.devant ? 0.9 : 0.34} />
                  ))}
                  {/**
                    * ⚠️ **Un axe pointé vers l'observateur se projette en un point, et
                    * il faut le dire autrement.** En orthographique, l'axe du regard
                    * de face n'a aucune longueur à l'écran : la ligne disparaît et
                    * l'étiquette vient se poser au milieu du visage. On reprend donc
                    * la notation des schémas — un cercle pointé quand l'axe sort vers
                    * nous, un cercle barré quand il s'enfonce — et l'étiquette se
                    * décale d'une distance fixe plutôt que de suivre une longueur nulle.
                    */}
                  {maillage.axes.filter(a => a.signe === 1).map((a, i) => {
                    const longueur = Math.hypot(a.bout.x, a.bout.y);
                    const deFace = longueur < 20;
                    const couleur = COULEUR_AXE[a.cle];
                    const opacite = a.devant ? 0.95 : 0.42;
                    const x = deFace ? a.bout.x + 15 : a.bout.x * 1.12;
                    const y = deFace ? a.bout.y + 15 : a.bout.y * 1.12;
                    return (
                      <g key={i} opacity={opacite}>
                        {deFace && (<>
                          <circle cx={a.bout.x} cy={a.bout.y} r={5.5}
                            stroke={couleur} strokeWidth={1.6} fill="none" />
                          {a.devant ? (
                            <circle cx={a.bout.x} cy={a.bout.y} r={1.8} fill={couleur} stroke="none" />
                          ) : (
                            <path d={`M ${a.bout.x - 3.6} ${a.bout.y - 3.6} L ${a.bout.x + 3.6} ${a.bout.y + 3.6}`
                              + ` M ${a.bout.x + 3.6} ${a.bout.y - 3.6} L ${a.bout.x - 3.6} ${a.bout.y + 3.6}`}
                              stroke={couleur} strokeWidth={1.5} />
                          )}
                        </>)}
                        <text x={x} y={y} fill={couleur} stroke="none"
                          fontSize={11} fontWeight={700} textAnchor="middle" dominantBaseline="middle">
                          {a.cle.toUpperCase()}
                        </text>
                      </g>
                    );
                  })}
                </g>
              )}
              <path d={oeilGauche} fill={palette.yeux} />
              <path d={oeilDroit} fill={palette.yeux} />
              {/**
                * L'accessoire en dernier, et dans le même groupe que le reste.
                *
                * ⚠️ **Dans le groupe, donc écrasé avec la tête au rebond.** Une casquette
                * posée hors du squash resterait rigide pendant que le crâne s'aplatit :
                * elle décollerait au plus fort du rebond, exactement là où l'œil la
                * regarde. ⚠️ **En dernier, donc elle couvre.** C'est ce qui la fait
                * *poser* sur la tête plutôt que la border : la calotte cache le sommet du
                * crâne, comme un vrai tissu.
                */}
              {coiffe && (
                <g>
                  <path d={coiffe.visiere} fill={contraste(couleurCoiffe)} />
                  <path d={coiffe.calotte} fill={couleurCoiffe} />
                  <circle cx={coiffe.bouton.x} cy={coiffe.bouton.y} r={5}
                    fill={contraste(couleurCoiffe)} />
                </g>
              )}
            </g>
            {/* La pastille est peinte **hors** du groupe masqué : elle occupe le trou
                qu'elle y a creusé, et le squash du rebond ne la déforme pas — un point de
                notification qui s'ovalise se lit comme un défaut. */}
            {notification && (
              <circle cx={pastille.x} cy={pastille.y} r={RAYON_PASTILLE}
                fill="#FF6467" />
            )}
          </svg>

          {/**
            * La parole du personnage : du texte, et rien autour.
            *
            * ⚠️ **Une bulle blanche à liseré, c'est de l'interface — pas une voix.** La
            * première version en portait une, avec sa pointe et son ombre : elle se lisait
            * comme une infobulle du logiciel posée à côté du dessin, alors qu'on veut ce
            * que le personnage dit. Signalé à l'usage. Le mot seul, en gras et **dans la
            * couleur de la tête**, appartient au personnage au lieu de le commenter — c'est
            * la convention de la bande dessinée pour un « zzZ », qui n'a jamais eu besoin
            * d'un cadre pour se comprendre.
            *
            * ⚠️ **La couleur passe par le garde-fou du fond sombre.** Prise telle quelle,
            * une tête très foncée — l'encre, l'ardoise — donnerait un mot illisible sur le
            * panneau noir du banc. `pourFondSombre` ramène la teinte dans la plage lisible
            * sans la changer : c'est la même fonction qui sert aux courbes et aux logos
            * d'actifs, donc le mot reste exactement de la couleur qu'on reconnaît.
            *
            * ⚠️ **La clé porte le message, ce qui rejoue l'apparition.** Une animation CSS
            * ne repart pas parce qu'on repose la même classe ; remonter l'élément la relance.
            * Le mot monte et se révèle à chaque changement d'état — c'est ce qui fait
            * qu'un « zzZ » *arrive* au moment où la tête s'endort, au lieu d'être là depuis
            * toujours.
            */}
          {dialogue && (
            <span
              key={messagePour(parole, pseudo)}
              className="av-parole"
              style={{
                /**
                 * ⚠️ **Le mot commence après la silhouette, jamais dessus.** Il est de la
                 * couleur de la tête : la moindre lettre qui mord le volume y **disparaît**
                 * — vu sur le « zzZ », dont le premier `z` s'était fondu dans le disque.
                 * Tous les volumes tiennent dans le rayon 100 du cadre, soit 83,3 % de la
                 * largeur ; on part donc à 86 %, et c'est vrai des huit formes. Mesuré
                 * après coup : à 84 %, le volume mordait encore de trois pixels d'encre —
                 * le contour peint dépasse un peu le rayon nominal.
                 *
                 * ⚠️ **Ce qui reste est étroit, et le mot s'y plie au lieu d'en sortir.** Un
                 * septième de la scène, quatre-vingts pixels : « Bonjour Sacha ! » y passe sur
                 * deux lignes, « zzZ » sur une. La taille se déduit de cette largeur et non
                 * l'inverse — mesuré au canevas, le plus large des mots employés est
                 * « Bonjour » à 78 pixels une fois posé en 20 gras. Exprimée en pour cent, la limite
                 * suit la scène quand la fenêtre rétrécit — posée en pixels, elle allait
                 * mordre la colonne des réglages.
                 *
                 * ⚠️ **Placé à mi-hauteur, il passe sous la pastille.** Celle-ci se pose au
                 * point le plus haut à droite du contour — le coin, sur un cube, donc très
                 * haut et très à droite. Le coin supérieur, plus large, lui est disputé ;
                 * le flanc ne l'est jamais.
                 */
                position: "absolute", left: "86%", top: "40%",
                maxWidth: "14%",
                fontSize: 20, fontWeight: 800, lineHeight: 1.1,
                letterSpacing: "-0.01em", color: pourFondSombre(palette.tete),
                pointerEvents: "none",
              }}
            >
              {messagePour(parole, pseudo)}
            </span>
          )}
          </div>

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
            titre="Notification et dialogue"
            note="La pastille creuse vraiment la silhouette au lieu de se poser dessus : le trou laisse voir le fond, quel qu’il soit. La parole, elle, est écrite dans la couleur du personnage plutôt qu'enfermée dans une bulle — et elle dit ce que l’avatar fait, jamais ce que vos chiffres valent."
          >
            <Bascule libelle="Pastille de notification" actif={notification}
              onChange={setNotification} />
            <div style={{ marginTop: 12 }}>
              <Bascule libelle="Parole du personnage" actif={dialogue} onChange={setDialogue} />
            </div>

            {dialogue && (
              <div style={{ marginTop: 16 }}>
                <label style={{ display: "block" }}>
                  <span style={{
                    display: "block", marginBottom: 7,
                    color: "#3A3A45", fontSize: 12.5, fontWeight: 600,
                  }}>
                    Pseudonyme
                  </span>
                  <input
                    type="text"
                    value={pseudo}
                    onChange={e => setPseudo(e.target.value)}
                    placeholder="Sans nom"
                    style={{
                      width: "100%", boxSizing: "border-box", padding: "8px 11px",
                      borderRadius: 9, border: `1px solid ${BORD}`, background: "#FFFFFF",
                      color: "#33333D", fontSize: 13, fontFamily: "inherit", outline: "none",
                    }} />
                </label>
                {/* ⚠️ Le champ vide ne laisse pas « Bonjour  ! » avec sa double espace et
                    son point orphelin : la phrase retombe sur un salut sans nom. */}
                <p style={{ margin: "10px 0 0", color: DOUX, fontSize: 12, lineHeight: 1.5 }}>
                  La phrase suit l’état choisi plus haut : « zzZ » quand il somnole,
                  « Aïe. » sur une erreur, un salut le reste du temps. Un état sans phrase
                  retombe sur le salut, ce qui évite qu’une tête qui dort vous dise bonjour.
                </p>
              </div>
            )}
          </Carte>

          <Carte
            titre="Accessoires"
            note="Un accessoire est posé sur la tête, pas peint dessus : il ne tourne donc pas avec elle. Sa forme se déduit du contour mesuré, si bien que la même casquette coiffe les huit volumes sans qu'aucun soit dessiné à part."
          >
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(2, 1fr)" }}>
              {ACCESSOIRES.map(([cle, libelle]) => (
                <button key={cle} type="button" onClick={() => setAccessoire(cle)}
                  aria-pressed={accessoire === cle}
                  style={{
                    padding: "9px 8px", borderRadius: 9, cursor: "pointer",
                    fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                    display: "flex", alignItems: "center", gap: 8,
                    border: `1px solid ${accessoire === cle ? ACCENT : BORD}`,
                    background: accessoire === cle ? ACCENT : "#FFFFFF",
                    color: accessoire === cle ? "#FFFFFF" : "#33333D",
                  }}>
                  <span style={{
                    width: 16, height: 16, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <VignetteAccessoire famille={cle} />
                  </span>
                  {libelle}
                </button>
              ))}
            </div>

            {accessoire === "casquette" && (
              <div style={{ marginTop: 18 }}>
                <Curseur libelle="Assise sur le crâne"
                  valeur={casquette.assise} affichage={`${(casquette.assise * 100).toFixed(0)} %`}
                  min={0.04} max={0.4} pas={0.01}
                  onChange={v => setCasquette(c => ({ ...c, assise: v }))} />
                <Curseur libelle="Épaisseur du tissu"
                  valeur={casquette.epaisseur} affichage={`${(casquette.epaisseur * 100).toFixed(1)} u`}
                  min={0.01} max={0.12} pas={0.005}
                  onChange={v => setCasquette(c => ({ ...c, epaisseur: v }))} />
                <Curseur libelle="Inclinaison"
                  valeur={casquette.inclinaison} affichage={`${casquette.inclinaison.toFixed(0)}°`}
                  min={0} max={32} pas={1}
                  onChange={v => setCasquette(c => ({ ...c, inclinaison: v }))} />
                <Curseur libelle="Hauteur de calotte"
                  valeur={casquette.galbe} affichage={`${(casquette.galbe * 100).toFixed(0)} %`}
                  min={0} max={2.4} pas={0.05}
                  onChange={v => setCasquette(c => ({ ...c, galbe: v }))} />
                <Curseur libelle="Étendue de la visière"
                  valeur={casquette.visiere} affichage={`${(casquette.visiere * 100).toFixed(0)} %`}
                  min={0.2} max={0.95} pas={0.02}
                  onChange={v => setCasquette(c => ({ ...c, visiere: v }))} />
                <Curseur libelle="Épaisseur de la visière"
                  valeur={casquette.epaisseurVisiere}
                  affichage={`${(casquette.epaisseurVisiere * 100).toFixed(0)} u`}
                  min={0.1} max={0.5} pas={0.01}
                  onChange={v => setCasquette(c => ({ ...c, epaisseurVisiere: v }))} />
                <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                  <Teinte libelle="Casquette" valeur={couleurCoiffe} onChange={setCouleurCoiffe} />
                  <div style={{ flex: 1 }} />
                </div>
                <div style={{ marginTop: 14 }}>
                  <Bascule libelle="Visière vers la gauche"
                    actif={casquette.cote === -1}
                    onChange={v => setCasquette(c => ({ ...c, cote: v ? -1 : 1 }))} />
                </div>
                <p style={{ margin: "12px 0 0", color: DOUX, fontSize: 12, lineHeight: 1.5 }}>
                  L’assise se compte en part de la hauteur de la forme, sans quoi une même
                  valeur enfoncerait la casquette jusqu’aux yeux du coussin en effleurant
                  le sommet du triangle. La visière n’est pas dessinée à part : c’est la
                  ligne du bandeau, décalée vers le bas puis prolongée par sa tangente.
                  La visière et le bouton se déduisent de la teinte choisie : c’est la
                  même, montée en clair sans être blanchie, pour qu’elle garde la couleur
                  de la casquette. Deux réglages pourraient se contredire, un seul non.
                </p>
              </div>
            )}
          </Carte>

          <Carte
            titre="Habillage"
            note="Les habillages sont immobiles : seul le regard s’anime. Les autres formes en recevront aussi, et elles ne tournent pas comme une sphère — un décor qui suivrait la tête ici et pas ailleurs aurait donné deux règles pour un même réglage."
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {skinsOfferts.map(s => (
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
            note="Les trois entrées de la projection sphérique, sur un tour complet chacune. Elles peuvent plus tard venir d’un geste, du regard ou d’un moteur IA."
          >
            {/**
              * ⚠️ **Bornées à ±180°, et non repliées.** Un repli ferait sauter la valeur
              * de 179 à −179 ; l'amorti du suivi, qui interpole vers la cible, prendrait
              * alors le tour long — 358° de rotation pour un degré demandé. Bornées, les
              * trois plages couvrent déjà toutes les orientations atteignables.
              */}
            <Curseur libelle="Lacet — autour de Y" valeur={lacet} affichage={`${lacet.toFixed(0)}°`}
              min={-180} max={180} pas={1}
              onChange={v => { poser(v, repos.current.tangage); setLacet(v); }} />
            <Curseur libelle="Tangage — autour de X" valeur={tangage} affichage={`${tangage.toFixed(0)}°`}
              min={-180} max={180} pas={1}
              onChange={v => { poser(repos.current.lacet, v); setTangage(v); }} />
            {/* Le roulis ne passe pas par le repos : il n'entre ni dans le glisser ni
                dans le suivi de la souris, qui n'ont que deux degrés de liberté. */}
            <Curseur libelle="Roulis — autour de Z" valeur={roulis} affichage={`${roulis.toFixed(0)}°`}
              min={-180} max={180} pas={1} onChange={setRoulis} />
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button type="button"
                onClick={() => { poser(0, 0); setLacet(0); setTangage(0); setRoulis(0); }}
                style={{
                  flex: 1, padding: "9px 8px", borderRadius: 9, cursor: "pointer",
                  fontSize: 12.5, fontWeight: 600, fontFamily: "inherit",
                  border: `1px solid ${BORD}`, background: "#FFFFFF", color: "#33333D",
                }}>
                Remettre de face
              </button>
            </div>
          </Carte>

          <Carte
            titre="Forme du personnage"
            note="Deux volumes — le cube aux arêtes arrondies, l’étoile adoucie —, et pour chacun deux façons de tourner : l’image, ou le solide."
          >
            {/* ⚠️ Une grille qui se replie plutôt qu'une rangée : à sept volumes, une seule
                ligne les réduirait à des libellés illisibles. */}
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(2, 1fr)" }}>
              {FORMES.map(([cle, libelle]) => (
                <button key={cle} type="button" onClick={() => choisirForme(cle)}
                  aria-pressed={formeTete === cle}
                  style={{
                    padding: "9px 8px", borderRadius: 9, cursor: "pointer",
                    fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                    display: "flex", alignItems: "center", gap: 8,
                    border: `1px solid ${formeTete === cle ? ACCENT : BORD}`,
                    background: formeTete === cle ? ACCENT : "#FFFFFF",
                    color: formeTete === cle ? "#FFFFFF" : "#33333D",
                  }}>
                  <span style={{
                    width: 16, height: 16, flexShrink: 0, borderRadius: 3,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <VignetteVolume famille={cle} />
                  </span>
                  {libelle}
                </button>
              ))}
            </div>

            {/* ⚠️ Un interrupteur et non un quatrième bouton : « ce qui tourne » est une
                question **orthogonale** à la forme, et la ranger dans la même rangée
                aurait laissé croire à trois formes là où il y en a deux, chacune vue de
                deux manières. Sur la sphère la question ne se pose pas — les deux modes
                y sont rigoureusement identiques —, l'interrupteur y est donc éteint. */}
            <div style={{ marginTop: 16, opacity: formeTete === "sphere" ? 0.45 : 1 }}>
              <Bascule libelle="Faire tourner le volume (vraie 3D)"
                actif={vraie3D && formeTete !== "sphere"}
                onChange={v => { if (formeTete !== "sphere") setVraie3D(v); }} />
              <p style={{ margin: "8px 0 0", color: DOUX, fontSize: 12, lineHeight: 1.5 }}>
                Seul le cube y perd quelque chose : il pousse hors de la sphère, donc sa
                silhouette respire en tournant. Les autres volumes sont creusés en gardant
                un grand cercle intact — leur contour atteint toujours le même cercle sans
                jamais le dépasser, et tourner ne leur coûte rien.
              </p>
            </div>

            {formeTete !== "sphere" && (
              <div style={{ marginTop: 16 }}>
                <Curseur libelle="Arrondi de la silhouette" valeur={silhouette}
                  affichage={`${Math.round(silhouette * 100)} %`}
                  min={0} max={1} pas={0.01} onChange={setSilhouette} />
                <p style={{ margin: "2px 0 0", color: DOUX, fontSize: 12, lineHeight: 1.5 }}>
                  {vraie3D ? (<>
                    <b>Le solide tourne pour de bon.</b> Ce qui est peint dessus devient
                    rigide — la grille et les yeux ne se déforment plus, seule la
                    perspective les raccourcit. En échange la silhouette respire :
                    mesuré, environ +20 % d’aire à 45° de lacet. C’est le compromis, et
                    il n’y a pas de troisième voie : la sphère est la seule forme où la
                    silhouette et la surface tiennent en place toutes les deux.
                  </>) : (<>
                    À 100 %, c’est la sphère. La forme reste inscrite dans le même carré :
                    elle touche le cercle aux quatre milieux et ne pousse que vers les
                    coins, si bien que la tête ne change pas de taille en changeant de
                    forme. En revanche ce qui est peint dessus se tord en tournant —
                    mesuré, 21,4 % d’écart de gonflement sur un même point.
                  </>)}
                </p>
              </div>
            )}
          </Carte>

          <Carte
            titre="Géométrie de la sphère"
            note="Le maillage montre la surface sur laquelle tout est peint : parallèles, méridiens, et les trois axes de la tête. Les lignes pâles passent derrière."
          >
            <Bascule libelle="Afficher la grille" actif={grille} onChange={setGrille} />
            <p style={{ margin: "14px 0 0", color: DOUX, fontSize: 12, lineHeight: 1.55 }}>
              L’axe <b style={{ color: COULEUR_AXE.z }}>Z</b> est celui du regard,
              {" "}<b style={{ color: COULEUR_AXE.y }}>Y</b> l’axe des pôles,
              {" "}<b style={{ color: COULEUR_AXE.x }}>X</b> celui des oreilles. En
              pointillé quand ils pointent vers l’arrière.
            </p>
          </Carte>

          <Carte
            titre="Forme des yeux"
            note="Chaque œil a son propre jeu de réglages. Le lien les recopie l’un sur l’autre tant qu’on veut un regard symétrique ; rompu, chaque œil se règle seul. Gauche et droit s’entendent à l’écran, pas du point de vue du personnage."
          >
            <Bascule libelle="Régler les deux yeux ensemble" actif={lies} onChange={setLies} />

            {/* ⚠️ Le sélecteur n'apparaît que le lien rompu : affiché en permanence, il
                laisserait croire qu'on règle un seul œil alors qu'on les touche tous
                les deux. */}
            {!lies && (
              <div style={{ display: "flex", gap: 10, margin: "16px 0 4px" }}>
                {([["gauche", "Œil gauche"], ["droit", "Œil droit"]] as const).map(([cle, libelle]) => (
                  <button key={cle} type="button" onClick={() => setOeilRegle(cle)}
                    aria-pressed={oeilRegle === cle}
                    style={{
                      flex: 1, padding: "10px 8px", borderRadius: 9, cursor: "pointer",
                      fontSize: 12.5, fontWeight: 600, fontFamily: "inherit",
                      border: `1px solid ${oeilRegle === cle ? ACCENT : BORD}`,
                      background: oeilRegle === cle ? ACCENT : "#FFFFFF",
                      color: oeilRegle === cle ? "#FFFFFF" : "#33333D",
                    }}>
                    {libelle}
                  </button>
                ))}
              </div>
            )}

            {/**
              * Le choix de forme, avant les dimensions : c'est lui qui décide de ce
              * que « largeur » et « hauteur » dessinent.
              */}
            <div style={{ display: "flex", gap: 10, margin: "16px 0 0" }}>
              {([["capsule", "Capsule"], ["carre", "Carré arrondi"]] as const).map(([cle, libelle]) => (
                <button key={cle} type="button" onClick={() => reglerOeil("forme", cle)}
                  aria-pressed={oeilCourant.forme === cle}
                  style={{
                    flex: 1, padding: "10px 8px", borderRadius: 9, cursor: "pointer",
                    fontSize: 12.5, fontWeight: 600, fontFamily: "inherit",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    border: `1px solid ${oeilCourant.forme === cle ? ACCENT : BORD}`,
                    background: oeilCourant.forme === cle ? ACCENT : "#FFFFFF",
                    color: oeilCourant.forme === cle ? "#FFFFFF" : "#33333D",
                  }}>
                  {/* La vignette dessine la forme au lieu de la nommer : « capsule » et
                      « carré arrondi » ne se distinguent qu'une fois vus. */}
                  <svg width="14" height="18" viewBox="0 0 14 18" aria-hidden="true">
                    <rect x={1} y={1} width={12} height={16}
                      rx={cle === "capsule" ? 6 : 3.4} ry={cle === "capsule" ? 6 : 3.4}
                      fill="currentColor" />
                  </svg>
                  {libelle}
                </button>
              ))}
            </div>

            {oeilCourant.forme === "carre" && (
              <div style={{ marginTop: 14 }}>
                <Curseur libelle="Arrondi des coins"
                  valeur={oeilCourant.arrondi}
                  affichage={`${Math.round(oeilCourant.arrondi * 100)} %`}
                  min={0} max={1} pas={0.01} onChange={v => reglerOeil("arrondi", v)} />
                <p style={{ margin: "2px 0 0", color: DOUX, fontSize: 12, lineHeight: 1.5 }}>
                  En part du rayon maximal, pris sur la plus petite dimension : la forme
                  garde donc le même galbe quand l’œil se ferme. À 100 %, c’est la capsule.
                </p>
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <Curseur libelle="Largeur" valeur={oeilCourant.largeur}
                affichage={`${oeilCourant.largeur.toFixed(0)} u`}
                min={8} max={44} pas={1} onChange={v => reglerOeil("largeur", v)} />
              <Curseur libelle="Hauteur" valeur={oeilCourant.hauteur}
                affichage={`${oeilCourant.hauteur.toFixed(0)} u`}
                min={16} max={96} pas={1} onChange={v => reglerOeil("hauteur", v)} />
              <Curseur libelle="Écart à l’axe du visage" valeur={oeilCourant.ecart}
                affichage={`${oeilCourant.ecart.toFixed(0)} u`}
                min={4} max={40} pas={1} onChange={v => reglerOeil("ecart", v)} />
              <Curseur libelle="Élévation" valeur={oeilCourant.elevation}
                affichage={`${oeilCourant.elevation > 0 ? "+" : ""}${oeilCourant.elevation.toFixed(0)} u`}
                min={-24} max={24} pas={1} onChange={v => reglerOeil("elevation", v)} />
              <Curseur libelle="Inclinaison propre" valeur={oeilCourant.inclinaison}
                affichage={`${oeilCourant.inclinaison > 0 ? "+" : ""}${oeilCourant.inclinaison.toFixed(0)}°`}
                min={-40} max={40} pas={1} onChange={v => reglerOeil("inclinaison", v)} />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button type="button"
                onClick={() => setYeux(y => (oeilRegle === "gauche"
                  ? { gauche: y.gauche, droit: { ...y.gauche } }
                  : { gauche: { ...y.droit }, droit: y.droit }))}
                disabled={lies}
                style={{
                  flex: 1, padding: "9px 8px", borderRadius: 9,
                  cursor: lies ? "not-allowed" : "pointer", opacity: lies ? 0.45 : 1,
                  fontSize: 12.5, fontWeight: 600, fontFamily: "inherit",
                  border: `1px solid ${BORD}`, background: "#FFFFFF", color: "#33333D",
                }}>
                Copier sur l’autre œil
              </button>
              <button type="button"
                onClick={() => setYeux({ gauche: OEIL_PAR_DEFAUT, droit: OEIL_PAR_DEFAUT })}
                style={{
                  flex: 1, padding: "9px 8px", borderRadius: 9, cursor: "pointer",
                  fontSize: 12.5, fontWeight: 600, fontFamily: "inherit",
                  border: `1px solid ${BORD}`, background: "#FFFFFF", color: "#33333D",
                }}>
                Réinitialiser
              </button>
            </div>

            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${BORD}` }}>
              {/* La taille reste commune : c'est l'échelle de tout le regard, et elle
                  multiplie aussi l'écart — ne redimensionner que les capsules aurait
                  resserré le regard à mesure qu'il grandit. */}
              <Curseur libelle="Taille globale" valeur={taille} affichage={`${taille.toFixed(2)}×`}
                min={0.6} max={1.6} pas={0.01} onChange={setTaille} />
            </div>
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
