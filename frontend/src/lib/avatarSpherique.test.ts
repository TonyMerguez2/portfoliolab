import { describe, expect, it } from "vitest";

import {
  RAYON_TETE, type Point2, type Vec3,
  ancrageOeil, cheminOeil, contourArrondi, contourCapsule, contourSilhouette,
  couperHemisphere, etirementSilhouette,
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

describe("etirementSilhouette", () => {
  it("ne touche à rien quand la silhouette est le disque", () => {
    // ⚠️ L'invariant qui protège tout l'existant : tant que personne ne demande de
    // carré, la déformation doit être rigoureusement l'identité — pas « presque ».
    for (let a = 0; a < 40; a++) {
      const t = (a / 40) * Math.PI * 2;
      expect(etirementSilhouette(Math.cos(t), Math.sin(t), 1)).toBe(1);
    }
  });

  it("mène le cercle sur un carré exact quand l'arrondi est nul", () => {
    // Un carré de demi-côté 1 : le point poussé a toujours une coordonnée à ±1,
    // et l'autre en deçà.
    for (let a = 0; a < 200; a++) {
      const t = (a / 200) * Math.PI * 2;
      const c = Math.cos(t), s = Math.sin(t);
      const k = etirementSilhouette(c, s, 0);
      expect(Math.max(Math.abs(c * k), Math.abs(s * k))).toBeCloseTo(1, 12);
      expect(Math.min(Math.abs(c * k), Math.abs(s * k))).toBeLessThanOrEqual(1 + 1e-12);
    }
  });

  it("place les quatre coins arrondis là où ils doivent être", () => {
    /**
     * Sur la diagonale, le bord d'un carré arrondi de demi-côté 1 et de rayon `r`
     * passe à `(1 − r)·√2 + r` du centre : le centre du quart de cercle, plus son
     * rayon. C'est la mesure qui distingue un vrai congé d'un simple mélange entre
     * le cercle et le carré, lequel tomberait ailleurs.
     */
    for (const r of [0.2, 0.45, 0.8]) {
      const d = Math.SQRT1_2;
      const attendu = (1 - r) * Math.SQRT2 + r;
      expect(etirementSilhouette(d, d, r)).toBeCloseTo(attendu, 12);
      expect(etirementSilhouette(-d, d, r)).toBeCloseTo(attendu, 12);
      expect(etirementSilhouette(-d, -d, r)).toBeCloseTo(attendu, 12);
      expect(etirementSilhouette(d, -d, r)).toBeCloseTo(attendu, 12);
    }
  });

  it("garde les milieux des côtés au rayon d'origine", () => {
    // Le carré arrondi est inscrit : il touche le cercle aux quatre milieux, et ne
    // dépasse que vers les coins. Sans quoi la tête grossirait en changeant de forme.
    for (const r of [0, 0.3, 0.7, 1]) {
      expect(etirementSilhouette(1, 0, r)).toBeCloseTo(1, 12);
      expect(etirementSilhouette(0, 1, r)).toBeCloseTo(1, 12);
      expect(etirementSilhouette(-1, 0, r)).toBeCloseTo(1, 12);
      expect(etirementSilhouette(0, -1, r)).toBeCloseTo(1, 12);
    }
  });

  it("laisse le centre du visage intact et ne déforme qu'en s'éloignant", () => {
    /**
     * ⚠️ **Le défaut que ce test attrape, et qui s'est vu à l'écran.** Un facteur qui
     * ne dépend que de l'angle s'applique aussi violemment au centre qu'au bord — et
     * près du centre, une petite forme couvre la plus large plage d'angles qui soit.
     * Les yeux en devenaient des blobs ondulés. L'étirement doit donc être nul au
     * centre, entier au bord, et croissant entre les deux.
     */
    const dir = [Math.SQRT1_2, Math.SQRT1_2];
    let precedent = 0;
    for (const rho of [0, 0.1, 0.3, 0.5, 0.8, 1]) {
      const k = etirementSilhouette(dir[0] * rho, dir[1] * rho, 0.35);
      // Ce que le point parcourt réellement : le rayon poussé.
      const pousse = rho * k;
      expect(pousse).toBeGreaterThanOrEqual(precedent - 1e-12);
      precedent = pousse;
      if (rho === 0) expect(k).toBe(1);
    }
    // Au centre, un petit voisinage reste quasiment lui-même.
    for (const t of [0, 0.7, 1.6, 3.9]) {
      const k = etirementSilhouette(0.05 * Math.cos(t), 0.05 * Math.sin(t), 0.35);
      expect(k).toBeLessThan(1.02);
    }
  });

  it("ne replie jamais le disque sur lui-même", () => {
    /**
     * ⚠️ La propriété qui rend la déformation utilisable : le facteur ne dépend que de
     * la direction, donc l'ordre des points le long d'un rayon est conservé et deux
     * rayons voisins ne se croisent pas. Un facteur qui dépendrait aussi du rayon
     * pourrait retourner la forme — et un contour retourné se peint à l'envers.
     */
    for (const r of [0, 0.35, 0.9]) {
      for (let a = 0; a < 90; a++) {
        const t = (a / 90) * Math.PI * 2;
        const k = etirementSilhouette(Math.cos(t), Math.sin(t), r);
        expect(k).toBeGreaterThanOrEqual(1 - 1e-12);
        expect(k).toBeLessThanOrEqual(Math.SQRT2 + 1e-12);
      }
    }
  });
});

describe("contourSilhouette", () => {
  it("reste un cercle du bon rayon quand l'arrondi est maximal", () => {
    for (const p of contourSilhouette(1, 100, 128)) {
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(100, 9);
    }
  });

  it("tient dans le carré de la tête, et le touche", () => {
    const pts = contourSilhouette(0.35, 100, 360);
    let max = 0;
    for (const p of pts) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(100.0001);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(100.0001);
      max = Math.max(max, Math.abs(p.x), Math.abs(p.y));
    }
    expect(max).toBeCloseTo(100, 6);
  });
});

describe("projeter avec silhouette", () => {
  it("pousse le contour d'un œil jusqu'au bord du carré, jamais au-delà", () => {
    /**
     * ⚠️ Le seul invariant qui compte à l'écran : rien ne sort de la tête. Il valait
     * pour le disque ; il doit valoir pour la nouvelle silhouette, avec la même
     * exigence — sans quoi un œil rasant le bord déborderait dans le vide.
     */
    for (const arrondi of [0, 0.3, 0.6, 1]) {
      for (const lacet of [-140, -60, 0, 75, 175]) {
        for (const tangage of [-50, 0, 35]) {
          const d = cheminOeil(
            { ecart: 30, elevation: 4, largeur: 30, hauteur: 70, inclinaison: 0.2 },
            { lacet: deg(lacet), tangage: deg(tangage) }, -1, 100, 160, arrondi);
          for (const p of pointsDuChemin(d)) {
            const k = etirementSilhouette(p.x, p.y, arrondi);
            expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(100 * k + 0.05);
          }
        }
      }
    }
  });
});
