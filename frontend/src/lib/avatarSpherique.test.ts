import { SPHERE, solideDepuis, normaleSolide, rayonSolide, surLeSolide } from "./avatarVolume";
import { describe, expect, it } from "vitest";

import {
  RAYON_TETE, type Point2, type Vec3,
  ancrageOeil, cheminOeil, contourArrondi, contourCapsule, contourSilhouette,
  couperHemisphere,
  projeter, surLaSphere, tournerTete,
} from "./avatarSpherique";

/**
 * La géométrie du regard tient-elle ses promesses ?
 *
 * ⚠️ **Ces tests portent sur des invariants, pas sur des coordonnées.** Figer le `d`
 * d'une pose de référence n'aurait rien prouvé : il change au moindre réglage
 * d'échantillonnage, et il ne dit pas *pourquoi* une pose est juste. Ce qu'on vérifie
 * ici, ce sont les quatre propriétés dont dépend l'illusion — la forme reste sur la
 * sphère, elle garde sa taille de surface, elle ne sort jamais de la tête, et elle est
 * symétrique de face. Chacune correspond à une manière précise de se tromper.
 */

const deg = (d: number) => (d * Math.PI) / 180;
const norme = (v: Vec3) => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
const scalaire = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;

/** Relit un `d` pour retrouver les points, faute de quoi rien n'est vérifiable. */
function pointsDuChemin(d: string): Point2[] {
  const nombres = d.match(/-?\d+(\.\d+)?/g) ?? [];
  const points: Point2[] = [];
  for (let i = 0; i + 1 < nombres.length; i += 2) {
    points.push({ x: Number(nombres[i]), y: Number(nombres[i + 1]) });
  }
  return points;
}

const REGLAGES = {
  ecart: 22, elevation: 0, largeur: 23, hauteur: 81, inclinaison: 0,
};

describe("contourCapsule", () => {
  it("mesure exactement la largeur et la hauteur demandées", () => {
    const pts = contourCapsule(20, 70, 400);
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const p of pts) {
      xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x);
      yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y);
    }
    expect(xMax - xMin).toBeCloseTo(20, 1);
    expect(yMax - yMin).toBeCloseTo(70, 1);
  });

  it("échantillonne aussi les côtés droits, sans quoi ils ne se courberaient pas", () => {
    // ⚠️ Le défaut que ce test attrape : une capsule décrite par ses seuls arcs et
    // deux segments rendrait, une fois sur la sphère, un œil aux bouts incurvés mais
    // aux longs côtés restés droits. Il faut donc des points *entre* les extrémités.
    const pts = contourCapsule(20, 70, 200);
    const surLeCote = pts.filter(p => Math.abs(Math.abs(p.x) - 10) < 0.01
      && Math.abs(p.y) < 24);
    expect(surLeCote.length).toBeGreaterThan(20);
  });

  it("s'aplatit en fente quand la hauteur passe sous la largeur", () => {
    // ⚠️ **La propriété dont dépend le clignement.** Un rayon pris sur la seule
    // demi-largeur ferait dégénérer la forme en disque dès que la hauteur descend
    // sous la largeur : l'œil qui se ferme deviendrait une bille et refuserait
    // d'aller plus bas. Ici il s'aplatit vraiment, jusqu'à la fente.
    const mesure = (l: number, h: number) => {
      const pts = contourCapsule(l, h, 400);
      let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
      for (const p of pts) {
        xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x);
        yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y);
      }
      return { l: xMax - xMin, h: yMax - yMin };
    };
    expect(mesure(40, 12).h).toBeCloseTo(12, 1);
    expect(mesure(40, 12).l).toBeCloseTo(40, 1);
    // Et la fermeture est continue : la hauteur suit le réglage jusqu'en bas.
    for (const h of [30, 20, 10, 4, 1]) expect(mesure(24, h).h).toBeCloseTo(h, 1);
  });

  it("reste un cercle quand les deux dimensions se valent", () => {
    const pts = contourCapsule(30, 30, 240);
    for (const p of pts) {
      expect(Math.sqrt(p.x * p.x + p.y * p.y)).toBeCloseTo(15, 1);
    }
  });
});

/** L'encombrement d'un contour, la mesure dont dépendent la plupart des invariants. */
function boite(pts: Point2[]) {
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const p of pts) {
    xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x);
    yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y);
  }
  return { l: xMax - xMin, h: yMax - yMin };
}

describe("contourArrondi", () => {
  it("rend exactement la capsule quand l'arrondi est maximal", () => {
    // ⚠️ L'invariant qui autorise la capsule à déléguer : si les deux tracés
    // divergeaient d'un cheveu, tous les avatars existants changeraient de forme
    // sans que personne n'ait rien demandé.
    const a = contourCapsule(24, 70, 160);
    const b = contourArrondi(24, 70, 1, 160);
    expect(b.length).toBe(a.length);
    for (let i = 0; i < a.length; i++) {
      expect(b[i].x).toBeCloseTo(a[i].x, 12);
      expect(b[i].y).toBeCloseTo(a[i].y, 12);
    }
  });

  it("garde la largeur et la hauteur demandées, quel que soit l'arrondi", () => {
    for (const arrondi of [0, 0.25, 0.5, 0.85, 1]) {
      const b = boite(contourArrondi(48, 44, arrondi, 480));
      expect(b.l).toBeCloseTo(48, 1);
      expect(b.h).toBeCloseTo(44, 1);
    }
  });

  it("porte quatre coins ronds du rayon demandé", () => {
    /**
     * La vérification tient en une propriété : sur un rectangle arrondi, les points
     * du quart supérieur droit sont soit sur un des deux côtés, soit à la distance
     * `r` du centre du coin. Un tracé qui n'arrondirait que deux coins — la faute
     * qu'on ferait en partant de la capsule — y échouerait sur deux quadrants.
     */
    const demiL = 30, demiH = 22, arrondi = 0.5;
    const r = Math.min(demiL, demiH) * arrondi;
    const pts = contourArrondi(2 * demiL, 2 * demiH, arrondi, 600);
    for (const q of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
      const cx = q[0] * (demiL - r), cy = q[1] * (demiH - r);
      // ⚠️ Le seuil se compare **dans le repère du quadrant**, pas au centre signé :
      // écrit `q[0] * p.x > cx`, il retenait au quadrant gauche tout le côté droit.
      const surLArc = pts.filter(p => q[0] * p.x > demiL - r && q[1] * p.y > demiH - r);
      expect(surLArc.length).toBeGreaterThan(10);
      for (const p of surLArc) {
        expect(Math.hypot(p.x - cx, p.y - cy)).toBeCloseTo(r, 6);
      }
    }
  });

  it("donne un rectangle à angles vifs quand l'arrondi est nul", () => {
    const pts = contourArrondi(40, 26, 0, 400);
    for (const p of pts) {
      // Tout point est sur un des quatre bords : l'une des deux coordonnées est
      // exactement au bord, l'autre à l'intérieur.
      const auBordX = Math.abs(Math.abs(p.x) - 20) < 1e-9;
      const auBordY = Math.abs(Math.abs(p.y) - 13) < 1e-9;
      expect(auBordX || auBordY).toBe(true);
      expect(Number.isNaN(p.x) || Number.isNaN(p.y)).toBe(false);
    }
    // Les quatre angles vifs sont approchés d'aussi près que l'échantillonnage le
    // permet — un pas vaut ici 0,33 unité, donc jamais plus d'un demi-pas.
    for (const q of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
      const distances = pts.map(p => Math.hypot(p.x - q[0] * 20, p.y - q[1] * 13));
      expect(Math.min(...distances)).toBeLessThan(0.25);
    }
  });

  it("se ferme en fente sans jamais rogner l'arrondi", () => {
    /**
     * ⚠️ **La raison pour laquelle l'arrondi est une fraction et non une longueur.**
     * Un rayon en unités absolues devrait être rogné dès que la demi-hauteur passe
     * dessous — donc à chaque clignement —, et la forme changerait de proportions en
     * plein mouvement. Pris sur la plus petite dimension, il ne peut jamais dépasser :
     * une fois l'œil plus plat que large, la part des coins dans sa hauteur vaut
     * exactement `arrondi`, de la mi-fermeture à la fente.
     *
     * ⚠️ La mesure **encadre** au lieu d'approcher. La partie droite se lit sur des
     * points échantillonnés, dont le dernier tombe jusqu'à un pas avant la fin réelle
     * du segment : une comparaison à une tolérance choisie à la main aurait été trop
     * lâche sur l'œil ouvert et trop stricte sur la fente. L'encadrement, lui, vaut à
     * toutes les hauteurs — et un rayon rogné en sortirait de très loin.
     */
    const arrondi = 0.4;
    for (const h of [24, 18, 9, 3, 1]) {
      const pts = contourArrondi(24, h, arrondi, 600);
      const b = boite(pts);
      let pas = 0;
      for (let i = 0; i < pts.length; i++) {
        const q = pts[(i + 1) % pts.length];
        pas = Math.max(pas, Math.hypot(q.x - pts[i].x, q.y - pts[i].y));
      }
      // Le côté strictement vertical : ce qui reste de la hauteur, les coins ôtés.
      const droit = pts.filter(p => Math.abs(p.x - b.l / 2) < 1e-9);
      const mesure = Math.max(...droit.map(p => p.y)) - Math.min(...droit.map(p => p.y));
      const attendu = h * (1 - arrondi);
      expect(attendu).toBeGreaterThanOrEqual(mesure - 1e-9);
      expect(attendu).toBeLessThanOrEqual(mesure + 2 * pas + 1e-9);
    }
  });
});

describe("ancrageOeil", () => {
  it("plante l'œil sur la sphère unité", () => {
    for (const [lo, la] of [[0, 0], [0.3, 0.2], [-0.5, 0.4], [1.2, -0.6]]) {
      expect(norme(ancrageOeil(lo, la).centre)).toBeCloseTo(1, 10);
    }
  });

  it("donne un repère orthonormé et tangent à la surface", () => {
    // ⚠️ C'est la propriété qui fait que l'inclinaison tourne *dans le plan de la
    // peau*. Un repère pris sur les axes de l'écran ferait sortir la capsule de la
    // surface dès que la tête tourne — exactement là où l'illusion doit tenir.
    for (const [lo, la] of [[0.4, 0.25], [-0.9, -0.3], [1.1, 0.7]]) {
      const a = ancrageOeil(lo, la);
      expect(norme(a.versDroite)).toBeCloseTo(1, 10);
      expect(norme(a.versHaut)).toBeCloseTo(1, 10);
      expect(scalaire(a.versDroite, a.versHaut)).toBeCloseTo(0, 10);
      expect(scalaire(a.versDroite, a.centre)).toBeCloseTo(0, 10);
      expect(scalaire(a.versHaut, a.centre)).toBeCloseTo(0, 10);
    }
  });
});

describe("surLaSphere", () => {
  const ancrage = ancrageOeil(0.35, 0.15);

  it("garde le point sur la sphère, quelle que soit la distance", () => {
    for (const [u, v] of [[0, 0], [12, -40], [-33, 33], [70, 5]]) {
      expect(norme(surLaSphere(ancrage, u, v, RAYON_TETE))).toBeCloseTo(1, 10);
    }
  });

  it("conserve la distance de surface — c'est ce qui distingue la carte exponentielle", () => {
    // ⚠️ Le vrai sujet de ce module. Une projection depuis le plan tangent, plus
    // simple à écrire, étire les bords : un œil long paraîtrait grossir en
    // s'éloignant de son ancre. Ici, 33 u restent 33 u *le long de la surface*, et la
    // forme garde sa taille de dessin — seule sa projection à l'écran se comprime.
    for (const [u, v] of [[12, -40], [-33, 33], [0, 55], [70, 5]]) {
      const attendue = Math.sqrt(u * u + v * v) / RAYON_TETE;
      const p = surLaSphere(ancrage, u, v, RAYON_TETE);
      // L'angle entre l'ancre et le point transporté est la distance géodésique.
      const obtenue = Math.acos(Math.min(1, scalaire(ancrage.centre, p)));
      expect(obtenue).toBeCloseTo(attendue, 10);
    }
  });
});

describe("tournerTete", () => {
  it("conserve les longueurs : la tête tourne, elle ne se déforme pas", () => {
    const p = { x: 0.3, y: -0.5, z: Math.sqrt(1 - 0.09 - 0.25) };
    for (const [l, t] of [[0.4, 0], [0, -0.3], [0.8, 0.5]]) {
      expect(norme(tournerTete(p, l, t))).toBeCloseTo(1, 10);
    }
  });

  it("emmène le point qui fait face vers le bord, sur un quart de tour", () => {
    const q = tournerTete({ x: 0, y: 0, z: 1 }, Math.PI / 2, 0);
    expect(q.x).toBeCloseTo(1, 10);
    expect(q.z).toBeCloseTo(0, 10);
  });

  it("ne commute pas — l'ordre lacet puis tangage est une décision", () => {
    const p = { x: 0, y: 0, z: 1 };
    const lacetPuisTangage = tournerTete(p, 0.7, 0.5);
    // Le même couple appliqué dans l'autre sens donne un autre point : si ces deux
    // valeurs coïncidaient, l'ordre choisi n'aurait aucune importance et le
    // commentaire du module serait faux.
    const inverse = tournerTete({ x: p.x, y: p.y * Math.cos(0.5) - p.z * Math.sin(0.5),
      z: p.y * Math.sin(0.5) + p.z * Math.cos(0.5) }, 0.7, 0);
    expect(Math.abs(lacetPuisTangage.x - inverse.x)
      + Math.abs(lacetPuisTangage.y - inverse.y)).toBeGreaterThan(0.01);
  });
});

describe("couperHemisphere", () => {
  it("laisse intact un contour entièrement de face", () => {
    const contour = [
      { x: 0.1, y: 0.1, z: 0.98 }, { x: -0.1, y: 0.1, z: 0.98 },
      { x: -0.1, y: -0.1, z: 0.98 }, { x: 0.1, y: -0.1, z: 0.98 },
    ];
    // Un seul morceau, rendu tel quel : rien à couper, rien à refermer.
    expect(couperHemisphere(contour)).toEqual([contour]);
  });

  it("ne rend rien d'un contour entièrement derrière", () => {
    // ⚠️ Sans cette coupe, la projection orthographique replierait la partie cachée
    // sur la partie visible : l'œil reviendrait à l'envers par-dessus lui-même.
    const contour = [
      { x: 0.1, y: 0.1, z: -0.98 }, { x: -0.1, y: 0.1, z: -0.98 },
      { x: 0, y: -0.1, z: -0.98 },
    ];
    expect(couperHemisphere(contour)).toEqual([]);
  });

  const straddle = [
    { x: 0.6, y: 0, z: 0.8 }, { x: 0.6, y: 0.5, z: -0.62 },
    { x: -0.6, y: 0.5, z: -0.62 }, { x: -0.6, y: 0, z: 0.8 },
  ];

  /** Les sommets posés sur la silhouette, tous morceaux confondus. */
  const surLeBord = (contour: Vec3[]) => {
    const sortie: Vec3[] = [];
    for (const piece of couperHemisphere(contour)) {
      for (const p of piece) if (Math.abs(p.z) < 1e-9) sortie.push(p);
    }
    return sortie;
  };

  it("pose les points de traversée sur le bord exact du disque", () => {
    // Interpolés sans renormaliser, ils tomberaient *dans* le volume, donc en retrait
    // du bord — et l'œil semblerait décoller de la silhouette au lieu d'y être coupé.
    const bord = surLeBord(straddle);
    expect(bord.length).toBeGreaterThanOrEqual(2);
    for (const p of bord) expect(norme(p)).toBeCloseTo(1, 10);
  });

  it("referme en suivant l'arc du bord, pas en coupant droit", () => {
    // ⚠️ Le défaut que ce test fige, vu à l'écran avant d'être corrigé : sur une
    // capsule agrandie rasant la silhouette, une corde droite ouvrait un coin de fond
    // entre l'œil et le bord de la tête. Tous les points ajoutés doivent rester sur le
    // grand cercle — donc unitaires *et* de cote nulle.
    const bord = surLeBord(straddle);
    expect(bord.length).toBeGreaterThan(10);
    for (const p of bord) {
      expect(norme(p)).toBeCloseTo(1, 10);
      expect(p.z).toBeCloseTo(0, 12);
    }
    // Et le milieu de l'arc doit s'écarter de la corde qui joint ses extrémités :
    // c'est précisément ce qui manquait.
    const a = bord[0];
    const b = bord[bord.length - 1];
    const milieu = bord[Math.floor(bord.length / 2)];
    const surLaCorde = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: 0 };
    const ecart = Math.sqrt((milieu.x - surLaCorde.x) ** 2 + (milieu.y - surLaCorde.y) ** 2);
    expect(ecart).toBeGreaterThan(0.05);
  });

  it("rend des morceaux séparés quand la matière perce devant en deux endroits", () => {
    /**
     * ⚠️ **Le défaut qui a coûté le plus cher, et la raison du changement de forme du
     * résultat.** Un ruban presque tangent à la silhouette y pointe par ses deux bouts.
     * En reliant la sortie d'un bout à l'entrée de l'*autre* — ce que fait le découpage
     * classique contre une droite — le contour fait tout le tour de la tête : mesuré,
     * un arc de 357° et 99,9 % du disque peint. Deux régions disjointes doivent donc
     * ressortir comme deux contours.
     */
    // Un ruban étroit qui affleure : deux sommets devant, séparés par un creux derrière.
    const affleurant = [
      { x: 0.99, y: 0.10, z: 0.09 }, { x: 0.999, y: 0.00, z: -0.04 },
      { x: 0.99, y: -0.10, z: 0.09 }, { x: 0.985, y: -0.12, z: -0.12 },
      { x: 0.98, y: 0.00, z: -0.20 }, { x: 0.985, y: 0.12, z: -0.12 },
    ].map(p => {
      const n = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
      return { x: p.x / n, y: p.y / n, z: p.z / n };
    });
    const pieces = couperHemisphere(affleurant);
    expect(pieces.length).toBe(2);
    // Et aucun morceau ne doit faire le tour : les arcs restent courts.
    for (const piece of pieces) {
      const angles = piece.filter(p => Math.abs(p.z) < 1e-9)
        .map(p => Math.atan2(p.y, p.x));
      const etendue = Math.max(...angles) - Math.min(...angles);
      expect(etendue).toBeLessThan(1);
    }
  });
});

describe("cheminOeil", () => {
  const face = { lacet: 0, tangage: 0 };

  it("écrit un contour fermé", () => {
    const d = cheminOeil(REGLAGES, face, -1);
    expect(d.startsWith("M ")).toBe(true);
    expect(d.endsWith(" Z")).toBe(true);
    expect(d).not.toContain("NaN");
  });

  it("rend les deux yeux exactement symétriques quand la tête est de face", () => {
    // ⚠️ Le test le plus révélateur de la chaîne entière. Une erreur de signe dans le
    // repère tangent, dans le miroir de l'inclinaison ou dans la projection casse
    // cette symétrie, alors qu'aucune ne se voit sur un œil pris isolément.
    const gauche = pointsDuChemin(cheminOeil(
      { ...REGLAGES, inclinaison: deg(14) }, face, -1));
    const droite = pointsDuChemin(cheminOeil(
      { ...REGLAGES, inclinaison: deg(14) }, face, 1));
    expect(gauche.length).toBe(droite.length);
    for (let i = 0; i < gauche.length; i++) {
      expect(gauche[i].x).toBeCloseTo(-droite[i].x, 1);
      expect(gauche[i].y).toBeCloseTo(droite[i].y, 1);
    }
  });

  it("ne laisse jamais un point sortir de la tête, sur toute la plage de rotation", () => {
    // ⚠️ L'invariant qui remplace un œil humain sur des centaines de poses. Un œil qui
    // déborde de la silhouette est *la* faute visible de ce genre de montage, et elle
    // n'apparaît qu'aux angles extrêmes — ceux qu'on ne pense pas à essayer.
    const fautes: string[] = [];
    for (let lacet = -80; lacet <= 80; lacet += 8) {
      for (let tangage = -60; tangage <= 60; tangage += 8) {
        const orientation = { lacet: deg(lacet), tangage: deg(tangage) };
        for (const cote of [-1, 1] as const) {
          const pts = pointsDuChemin(cheminOeil(
            { ...REGLAGES, inclinaison: deg(12) }, orientation, cote));
          for (const p of pts) {
            const r = Math.sqrt(p.x * p.x + p.y * p.y);
            if (r > RAYON_TETE + 0.01) fautes.push(`${lacet}°/${tangage}° → ${r.toFixed(2)}`);
          }
        }
      }
    }
    expect(fautes.slice(0, 5)).toEqual([]);
  });

  it("déplace le regard quand la tête tourne, au lieu de le laisser figé", () => {
    // La promesse de départ : l'orientation est une donnée continue, pas une pose
    // choisie dans une liste. Si le contour ne bougeait pas, tout le module serait
    // une décoration coûteuse par-dessus une image fixe.
    const centre = (d: string) => {
      const pts = pointsDuChemin(d);
      let sx = 0;
      for (const p of pts) sx += p.x;
      return sx / pts.length;
    };
    const deFace = centre(cheminOeil(REGLAGES, face, -1));
    const tournee = centre(cheminOeil(REGLAGES, { lacet: deg(25), tangage: 0 }, -1));
    expect(Math.abs(tournee - deFace)).toBeGreaterThan(10);
  });

  it("comprime la largeur vue quand l'œil s'approche du bord", () => {
    // ⚠️ L'effet recherché, et la raison de tout ce calcul : le raccourci de
    // perspective. Une simple translation des deux capsules — la solution paresseuse —
    // garderait leur largeur constante et trahirait le carton-pâte.
    //
    // ⚠️ **Mesuré à la taille, pas sur la boîte englobante.** Première version de ce
    // test, et première erreur : une capsule haute s'incurve autour de la sphère, et
    // ses bouts partent alors de part et d'autre. Sa boîte englobante *enfle* de cette
    // courbure et masque le rétrécissement — 14 % seulement là où la forme se comprime
    // en réalité de 24 %. La largeur au milieu du contour dit ce que l'œil voit.
    const largeurALaTaille = (lacetDeg: number) => {
      const pts = pointsDuChemin(cheminOeil(
        REGLAGES, { lacet: deg(lacetDeg), tangage: 0 }, 1));
      let cy = 0;
      for (const p of pts) cy += p.y;
      cy /= pts.length;
      let min = Infinity, max = -Infinity;
      for (const p of pts) {
        if (Math.abs(p.y - cy) > 6) continue;
        min = Math.min(min, p.x); max = Math.max(max, p.x);
      }
      return max - min;
    };
    // L'œil de droite est planté à `ecart / rayon` radians de l'axe : c'est *là* qu'il
    // fait face à l'observateur, et donc là qu'il est le plus large — pas à lacet nul.
    const frontal = -(REGLAGES.ecart / RAYON_TETE) * (180 / Math.PI);
    expect(largeurALaTaille(frontal)).toBeGreaterThan(largeurALaTaille(0));
    expect(largeurALaTaille(frontal - 45)).toBeLessThan(largeurALaTaille(frontal) * 0.8);
  });
});

describe("projeter", () => {
  it("retourne l'axe vertical, la surface comptant vers le haut et le SVG vers le bas", () => {
    expect(projeter({ x: 0, y: 1, z: 0 }, 100)).toEqual({ x: 0, y: -100 });
  });
});

describe("surLeSolide", () => {
  it("ne touche à rien quand l'exposant est celui de la sphère", () => {
    // ⚠️ L'invariant qui protège tout l'existant : tant que personne ne demande de
    // cube, la transformation doit être rigoureusement l'identité — pas « presque ».
    for (let a = 0; a < 40; a++) {
      const t = (a / 40) * Math.PI * 2;
      const p = { x: Math.cos(t) * 0.6, y: Math.sin(t) * 0.6, z: 0.8 };
      expect(surLeSolide(p, SPHERE)).toEqual(p);
    }
  });

  it("pose chaque point sur la superellipsoïde, à la direction près", () => {
    /**
     * La définition même du solide : |x|ⁿ + |y|ⁿ + |z|ⁿ = 1. Et la transformation est
     * **radiale**, donc la direction ne bouge pas — c'est ce qui garantit qu'elle ne
     * change pas le signe de `z`, donc qu'elle laisse la coupe de l'hémisphère valide.
     */
    for (const n of [3, 4, 8]) {
      for (const p of [
        { x: 0.6, y: 0.3, z: Math.sqrt(1 - 0.36 - 0.09) },
        { x: -0.2, y: 0.9, z: Math.sqrt(1 - 0.04 - 0.81) },
        { x: Math.SQRT1_2, y: Math.SQRT1_2, z: 0 },
        { x: 0, y: 0, z: 1 },
      ]) {
        const q = surLeSolide(p, { famille: "cube", exposant: n });
        const norme = Math.pow(Math.abs(q.x), n) + Math.pow(Math.abs(q.y), n)
          + Math.pow(Math.abs(q.z), n);
        expect(norme).toBeCloseTo(1, 9);
        // Même direction : le produit vectoriel est nul, et `z` garde son signe.
        expect(q.x * p.y - q.y * p.x).toBeCloseTo(0, 9);
        expect(Math.sign(q.z) || 0).toBe(Math.sign(p.z) || 0);
      }
    }
  });

  it("reste inscrite dans le carré de la tête, et le touche", () => {
    // Le bord vaut 1 sur les axes : la tête ne grossit pas en devenant cube. Il
    // pousse vers les coins, mais chaque coordonnée y reste sous 1.
    for (const n of [3, 4, 8, 16]) {
      for (const [x, y] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const q = surLeSolide({ x, y, z: 0 }, { famille: "cube", exposant: n });
        expect(Math.hypot(q.x, q.y)).toBeCloseTo(1, 12);
      }
      for (let a = 0; a < 180; a++) {
        const t = (a / 180) * Math.PI * 2;
        const q = surLeSolide({ x: Math.cos(t), y: Math.sin(t), z: 0 }, { famille: "cube", exposant: n });
        expect(Math.abs(q.x)).toBeLessThanOrEqual(1 + 1e-9);
        expect(Math.abs(q.y)).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it("aplatit la face avant à mesure que l'exposant monte", () => {
    /**
     * ⚠️ **Ce que la grille montrait, et que l'ancienne déformation ne faisait pas.**
     * Un cube arrondi a une face plate : à égale distance de l'axe du regard, la cote
     * doit rester proche de 1 pour un grand exposant, alors qu'elle chute en √(1−r²)
     * sur la sphère. C'est cette platitude qui empêche les yeux d'onduler.
     */
    const cote = (n: number) => {
      const r = 0.35;
      const p = { x: r, y: 0, z: Math.sqrt(1 - r * r) };
      return surLeSolide(p, { famille: "cube", exposant: n }).z;
    };
    expect(cote(2)).toBeCloseTo(Math.sqrt(1 - 0.1225), 9);
    expect(cote(4)).toBeGreaterThan(cote(2));
    expect(cote(8)).toBeGreaterThan(cote(4));
    expect(cote(16)).toBeGreaterThan(0.99);
  });
});

describe("solideDepuis", () => {
  it("rend la sphère à un arrondi plein, et un cube franc au bout de la course", () => {
    expect(solideDepuis("cube", 1)).toEqual({ famille: "sphere" });
    expect(solideDepuis("cube", 0.5)).toEqual({ famille: "cube", exposant: 4 });
    expect(solideDepuis("cube", 0.25)).toEqual({ famille: "cube", exposant: 8 });
    expect(solideDepuis("cube", 0)).toEqual({ famille: "cube", exposant: 24 });
  });

  it("creuse l'étoile d'autant que l'arrondi baisse, et la rend ronde à fond", () => {
    expect(solideDepuis("etoile", 1)).toEqual({ famille: "sphere" });
    const doux = solideDepuis("etoile", 0.7), franc = solideDepuis("etoile", 0.2);
    expect(doux.famille).toBe("etoile");
    expect(franc.famille).toBe("etoile");
    if (doux.famille === "etoile" && franc.famille === "etoile") {
      expect(franc.creux).toBeGreaterThan(doux.creux);
    }
  });

  it("garde toutes les formes dans le carré de la tête, quel que soit le réglage", () => {
    /**
     * ⚠️ L'invariant qui protège la mise en page : changer de forme ne doit pas changer
     * la place occupée. Il ne porte pas sur le **rayon** — le cube pousse vers les coins
     * et dépasse le disque, l'étoile creuse et reste en deçà — mais sur l'**encombrement** :
     * les deux valent exactement 1 sur les axes de l'écran, et n'en sortent jamais.
     * C'est l'erreur que ce test a attrapée : écrit sur le rayon, il déclarait faux le
     * cube, qui atteint 1,37 dans la direction d'un coin.
     */
    for (const famille of ["cube", "etoile"] as const) {
      for (const arrondi of [0, 0.2, 0.5, 0.8]) {
        const s = solideDepuis(famille, arrondi);
        for (const axe of [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }]) {
          expect(rayonSolide(axe, s)).toBeCloseTo(1, 9);
        }
        for (let i = 0; i < 120; i++) {
          const t = (i / 120) * Math.PI * 2;
          const q = surLeSolide({ x: Math.cos(t), y: Math.sin(t), z: 0 }, s);
          expect(Math.abs(q.x)).toBeLessThanOrEqual(1 + 1e-9);
          expect(Math.abs(q.y)).toBeLessThanOrEqual(1 + 1e-9);
        }
      }
    }
  });

  it("laisse l'axe du regard parfaitement lisse, sans pointe ni creux", () => {
    /**
     * ⚠️ **La propriété qui rend l'étoile compatible avec un regard qui tourne.** La
     * première version pinçait autour des six axes : les yeux traversaient alors un creux,
     * et la concavité y rapproche le bord visible au point de les couper dès dix degrés de
     * lacet. Ici le chemin qui va du centre du visage jusqu'à un lobe latéral reste
     * exactement sphérique — c'est celui que les yeux parcourent.
     */
    for (const arrondi of [0, 0.3, 0.6]) {
      const s = solideDepuis("etoile", arrondi);
      expect(rayonSolide({ x: 0, y: 0, z: 1 }, s)).toBeCloseTo(1, 9);
      for (let i = 0; i <= 20; i++) {
        const t = (i / 20) * (Math.PI / 2);
        // Le méridien du regard vers le lobe de droite, puis vers celui du haut.
        expect(rayonSolide({ x: Math.sin(t), y: 0, z: Math.cos(t) }, s)).toBeCloseTo(1, 9);
        expect(rayonSolide({ x: 0, y: Math.sin(t), z: Math.cos(t) }, s)).toBeCloseTo(1, 9);
      }
    }
  });

  it("creuse l'étoile entre ses branches, sans jamais la rendre pointue", () => {
    // Quatre lobes dans le plan de l'écran : le rayon est maximal sur les axes et
    // minimal à quarante-cinq degrés — et il y passe en douceur, sans point anguleux.
    const s = solideDepuis("etoile", 0.35);
    const r = (t: number) => rayonSolide({ x: Math.cos(t), y: Math.sin(t), z: 0 }, s);
    expect(r(0)).toBeCloseTo(1, 9);
    expect(r(Math.PI / 2)).toBeCloseTo(1, 9);
    // Un pincement franc — près d'un quart au bout de la course — que la forme peut se
    // permettre depuis qu'il ne porte plus sur l'axe du regard.
    expect(r(Math.PI / 4)).toBeLessThan(0.8);
    expect(r(Math.PI / 4)).toBeGreaterThan(0.7);
    // La dérivée s'annule aux extrêmes : pas de pointe, contrairement à une
    // superellipse d'exposant inférieur à un, qui ferait des cusps sur les axes.
    const h = 1e-4;
    expect(Math.abs(r(h) - r(-h)) / (2 * h)).toBeLessThan(1e-3);
    expect(Math.abs(r(Math.PI / 4 + h) - r(Math.PI / 4 - h)) / (2 * h)).toBeLessThan(1e-3);
  });
});

describe("projeter sur la superellipsoïde", () => {
  it("garde le contour d'un œil dans la silhouette, jamais au-delà", () => {
    /**
     * ⚠️ Le seul invariant qui compte à l'écran : rien ne sort de la tête. Il valait
     * pour le disque ; il doit valoir pour la nouvelle silhouette, avec la même
     * exigence — sans quoi un œil rasant le bord déborderait dans le vide.
     *
     * Le bord se calcule ici **indépendamment** du code testé : pour une direction
     * donnée, le rayon de la superellipse est celui qui ramène |x|ⁿ + |y|ⁿ à 1.
     */
    const bord = (x: number, y: number, n: number) => {
      const d = Math.hypot(x, y);
      if (d === 0) return 1;
      const ux = Math.abs(x) / d, uy = Math.abs(y) / d;
      return 1 / Math.pow(Math.pow(ux, n) + Math.pow(uy, n), 1 / n);
    };
    for (const arrondi of [0, 0.3, 0.6, 1]) {
      const n = solideDepuis("cube", arrondi);
      for (const lacet of [-140, -60, 0, 75, 175]) {
        for (const tangage of [-50, 0, 35]) {
          const d = cheminOeil(
            { ecart: 30, elevation: 4, largeur: 30, hauteur: 70, inclinaison: 0.2 },
            { lacet: deg(lacet), tangage: deg(tangage) }, -1, 100, 160, n);
          for (const p of pointsDuChemin(d)) {
            const e = n.famille === "cube" ? n.exposant : 2;
            expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(100 * bord(p.x, p.y, e) + 0.05);
          }
        }
      }
    }
  });
});

describe("cheminOeil sur le cube arrondi", () => {
  /** L'aire d'un contour, par la formule du lacet : la mesure de « plus grand ». */
  const aire = (pts: Point2[]) => {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      a += p.x * q.y - q.x * p.y;
    }
    return Math.abs(a) / 2;
  };
  const OEIL = { ecart: 29, elevation: 0, largeur: 30, hauteur: 105, inclinaison: 0 };

  it("rapetisse l'œil qui s'éloigne, au lieu de l'agrandir", () => {
    /**
     * ⚠️ **Le défaut que ce test attrape, et qu'on a vu à l'écran.** Le passage au cube
     * pousse les points d'autant plus qu'ils approchent d'une arête : un œil qui
     * s'écarte de l'axe du regard s'y trouvait **agrandi** au lieu d'être raccourci par
     * la perspective — mesuré, +27 % à dix degrés de lacet là où la sphère rendait
     * −10 %. Le visage montrait alors deux yeux de tailles franchement différentes.
     *
     * La correction se prend sur l'ancre **tournée** : mesurée sur l'ancre au repos,
     * elle ne corrigeait que la taille de face et laissait l'asymétrie intacte.
     */
    const rapport = (arrondi: number, lacet: number) => {
      const n = solideDepuis("cube", arrondi);
      const o = { lacet: deg(lacet), tangage: 0 };
      const proche = aire(pointsDuChemin(cheminOeil(OEIL, o, -1, 100, 220, n)));
      const loin = aire(pointsDuChemin(cheminOeil(OEIL, o, 1, 100, 220, n)));
      return loin / proche;
    };
    for (const arrondi of [1, 0.42, 0.28]) {
      // Aux petits angles, il ne doit en tout cas plus **grandir** franchement. Il reste
      // ce que la variation du gonflement laisse *à l'intérieur* de l'œil : mesuré, au
      // plus 3 % sur la forme de l'application, 8 % sur la plus cubique proposée.
      for (const lacet of [5, 10, 15, 20]) expect(rapport(arrondi, lacet)).toBeLessThan(1.1);
      // Et passé vingt degrés, il rapetisse pour de bon — c'est la perspective qui parle.
      for (const lacet of [30, 40]) expect(rapport(arrondi, lacet)).toBeLessThan(0.72);
    }
  });

  it("garde les deux yeux identiques de face", () => {
    for (const arrondi of [1, 0.42, 0.2]) {
      const n = solideDepuis("cube", arrondi);
      const o = { lacet: 0, tangage: 0 };
      const g = aire(pointsDuChemin(cheminOeil(OEIL, o, -1, 100, 220, n)));
      const d = aire(pointsDuChemin(cheminOeil(OEIL, o, 1, 100, 220, n)));
      expect(d).toBeCloseTo(g, 0);
    }
  });

  it("ne change rien sur la sphère", () => {
    // La compensation vaut 1 à l'exposant 2 : le rendu d'origine doit être intact.
    const o = { lacet: deg(23), tangage: deg(-11) };
    expect(cheminOeil(OEIL, o, -1, 100, 220, SPHERE)).toBe(cheminOeil(OEIL, o, -1, 100, 220));
  });
});

describe("les volumes qui ne changent jamais de taille", () => {
  /**
   * ⚠️ **La règle que ces tests protègent, et qui vaut d'être écrite en clair.**
   *
   * Un grand cercle se projette toujours en une ellipse de demi-grand axe R, quelle que
   * soit la direction de vue. Un solide **inscrit** dans la sphère de rayon R qui laisse
   * au moins un grand cercle **intact** a donc un contour qui atteint toujours R sans
   * jamais le dépasser : sa taille ne bouge pas d'un pixel quand il tourne, même si sa
   * forme, elle, change franchement.
   *
   * C'est ce qui sépare nos volumes en deux : ceux qu'on **creuse** vers l'intérieur —
   * étoiles, galet, coussin, fossettes — gardent leur encombrement, et ceux qui
   * **poussent** vers l'extérieur — le cube, jusqu'à 1,37 dans la direction d'une arête
   * — le font respirer. Mesuré : 0,0 % contre 12,5 %.
   */
  const cercleCirconscrit = (s: ReturnType<typeof solideDepuis>, lacet: number, tangage: number) => {
    let max = 0;
    for (let i = 0; i < 120; i++) {
      for (let j = 0; j < 60; j++) {
        const th = (i / 120) * Math.PI * 2, ph = (j / 59) * Math.PI;
        const u = { x: Math.sin(ph) * Math.cos(th), y: Math.cos(ph), z: Math.sin(ph) * Math.sin(th) };
        const k = rayonSolide(u, s);
        const q = tournerTete({ x: u.x * k, y: u.y * k, z: u.z * k }, lacet, tangage, 0);
        max = Math.max(max, Math.hypot(q.x, q.y));
      }
    }
    return max;
  };

  it("garde le même cercle circonscrit sous toutes les rotations", () => {
    for (const famille of ["etoile", "etoile6"] as const) {
      for (const arrondi of [0.2, 0.5]) {
        const s = solideDepuis(famille, arrondi);
        let min = Infinity, max = -Infinity;
        for (const l of [0, 25, 50, 75, 90]) {
          for (const t of [0, 30, 60]) {
            const r = cercleCirconscrit(s, deg(l), deg(t));
            min = Math.min(min, r); max = Math.max(max, r);
          }
        }
        // À un demi-pour-cent près : c'est la finesse de l'échantillonnage de la surface,
        // pas une variation réelle.
        expect(max / min - 1).toBeLessThan(0.005);
        expect(max).toBeCloseTo(1, 2);
      }
    }
  });

  it("laisse au contraire respirer ce qui pousse dehors : le cube et le coussin", () => {
    /**
     * ⚠️ **Le coussin a changé de camp, et c'est délibéré.** Tant qu'il était un
     * pincement des pôles, il restait inscrit dans la sphère et gardait sa taille en
     * tournant. Mais ce pincement **affaissait le milieu du bord** au-delà d'un
     * cinquième de creux, ce qui se lit comme un côté mou. Redéfini en cube écrasé, il
     * a des bords vraiment plats — et pousse hors de la sphère comme le cube, donc il
     * respirerait si on le faisait tourner. Aucune des deux formes ne tourne dans
     * l'application : c'est ce qui rend l'échange acceptable.
     */
    for (const famille of ["cube", "coussin"] as const) {
      const s = solideDepuis(famille, 0.42);
      let min = Infinity, max = -Infinity;
      for (const l of [0, 25, 45]) {
        for (const t of [0, 30]) {
          const r = cercleCirconscrit(s, deg(l), deg(t));
          min = Math.min(min, r); max = Math.max(max, r);
        }
      }
      expect(max / min - 1).toBeGreaterThan(0.05);
    }
  });

  it("garde le bord supérieur du coussin franchement plat", () => {
    /**
     * ⚠️ **Le défaut que ce test attrape, et qu'on a vu à l'écran.** Le pincement en
     * `1 − creux · y⁴` n'aplatit le bord que jusqu'à un cinquième de creux ; au-delà il
     * l'**affaisse** — le point le plus haut n'est plus au sommet mais à soixante-neuf
     * degrés, et le milieu du bord pend de 1,3 % de la demi-hauteur. Sur un « coussin »,
     * cela se lit immédiatement comme un côté qui n'est pas droit.
     */
    for (const arrondi of [0.5, 0.3]) {
      const pts = contourSilhouette(solideDepuis("coussin", arrondi), 100, 720);
      const plusHaut = Math.min(...pts.map(p => p.y));
      const auSommet = pts.reduce((m, p) => (Math.abs(p.x) < 0.6 && p.y < m ? p.y : m), 0);
      expect(auSommet - plusHaut).toBeLessThan(0.01);
      const l = Math.max(...pts.map(p => p.x)) - Math.min(...pts.map(p => p.x));
      const h = Math.max(...pts.map(p => p.y)) - Math.min(...pts.map(p => p.y));
      expect(l / h).toBeCloseTo(1 / 0.75, 2);
    }
  });
});

describe("normaleSolide", () => {
  it("tombe sur le gradient exact là où on sait l'écrire", () => {
    /**
     * ⚠️ **Le témoin qui autorise une normale par différences finies.** Sept familles,
     * ce sont sept gradients à écrire à la main, donc sept occasions de se tromper d'un
     * signe — et une normale fausse ne casse rien de visible, elle décale seulement le
     * bord. On calcule donc la normale une fois pour toutes à partir du rayon, et l'on
     * vérifie ici qu'elle coïncide avec les deux gradients qu'on sait poser exactement.
     */
    const exacteCube = (p: Vec3, n: number) => {
      const s = (v: number, e: number) => (v === 0 ? 0 : Math.sign(v) * Math.pow(Math.abs(v), e));
      const g = { x: s(p.x, n - 1), y: s(p.y, n - 1), z: s(p.z, n - 1) };
      const l = Math.hypot(g.x, g.y, g.z);
      return { x: g.x / l, y: g.y / l, z: g.z / l };
    };
    const exacteEtoile = (p: Vec3, c: number) => {
      const k = rayonSolide(p, { famille: "etoile", creux: c });
      const q = { x: p.x * k, y: p.y * k, z: p.z * k };
      const r = Math.hypot(q.x, q.y, q.z);
      const a = 5 * r * r * r - 4 * r * r;
      const g = {
        x: a * q.x + 4 * c * q.x * q.y * q.y,
        y: a * q.y + 4 * c * q.x * q.x * q.y,
        z: a * q.z,
      };
      const l = Math.hypot(g.x, g.y, g.z);
      return { x: g.x / l, y: g.y / l, z: g.z / l };
    };
    const points: Vec3[] = [];
    for (let i = 0; i < 40; i++) {
      const th = (i / 40) * Math.PI * 2, ph = 0.4 + (i % 7) * 0.3;
      points.push({ x: Math.sin(ph) * Math.cos(th), y: Math.cos(ph), z: Math.sin(ph) * Math.sin(th) });
    }
    for (const p of points) {
      for (const n of [3, 4.8, 8]) {
        const a = exacteCube(p, n), b = normaleSolide(p, { famille: "cube", exposant: n });
        expect(a.x * b.x + a.y * b.y + a.z * b.z).toBeGreaterThan(0.9999);
      }
      for (const c of [0.2, 0.5, 0.72]) {
        const a = exacteEtoile(p, c), b = normaleSolide(p, { famille: "etoile", creux: c });
        expect(a.x * b.x + a.y * b.y + a.z * b.z).toBeGreaterThan(0.9999);
      }
    }
  });

  it("rend l'axe du regard normal à lui-même sur toutes les formes creusées", () => {
    // Une face avant lisse : la normale y est radiale, sans quoi le bord serait faux —
    // et c'est là que se trouvent les yeux.
    for (const famille of ["etoile", "etoile6", "coussin"] as const) {
      const n = normaleSolide({ x: 0, y: 0, z: 1 }, solideDepuis(famille, 0.4));
      expect(n.z).toBeCloseTo(1, 6);
    }
  });
});
