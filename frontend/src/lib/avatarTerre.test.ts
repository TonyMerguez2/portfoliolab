import { describe, expect, it } from "vitest";

import { CONTINENTS, HAUT_FOND, RAYON_GRAIN, grainsDuGlobe, skinParCle } from "./avatarSkins";
import { type Vec3, contourTache, dansLaTache, tournerTete } from "./avatarSpherique";

/**
 * La Terre est-elle une planète, ou seulement un décor de face ?
 *
 * ⚠️ **C'est la question que ce fichier existe pour poser.** Un skin n'est pas une image
 * plaquée : chaque continent est une découpe **posée sur la sphère**, qui tourne avec la
 * tête et disparaît derrière la silhouette. Un décor dessiné pour la seule face visible
 * s'en tirerait très bien sur une capture d'écran, et se trahirait au premier quart de
 * tour — moitié de globe couverte de terres, moitié d'océan vide. Aucune image fixe ne
 * dit cela ; une mesure sur trente-six orientations, si.
 */

const deg = (d: number) => (d * Math.PI) / 180;

/** Un semis régulier de la sphère, par l'angle d'or — le même partout dans ce fichier. */
function semis(nombre: number): Vec3[] {
  const points: Vec3[] = [];
  const or = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < nombre; i++) {
    const y = 1 - (2 * (i + 0.5)) / nombre;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    points.push({ x: Math.cos(or * i) * r, y, z: Math.sin(or * i) * r });
  }
  return points;
}

const surTerre = (p: Vec3, marge = 0) =>
  CONTINENTS.some(c => dansLaTache(p, c, marge));

describe("le globe fait le tour", () => {
  it("montre des terres et de l'océan sous toutes les orientations", () => {
    /**
     * ⚠️ **La propriété qui distingue un globe d'un décor de face.** On échantillonne la
     * sphère, on la tourne, on ne garde que l'hémisphère visible, et l'on compte la part
     * de terre. Elle doit rester dans une fourchette franche partout : une orientation
     * entièrement bleue se lirait comme une bille, une entièrement verte comme une balle
     * de tennis. Mesuré sur trente-six orientations, la part de terre va de 27 à 52 %.
     */
    for (const lacet of [0, 40, 80, 120, 160, 200, 240, 280, 320]) {
      for (const tangage of [-60, -20, 20, 60]) {
        let visibles = 0, terres = 0;
        for (const p of semis(2000)) {
          const q = tournerTete(p, deg(lacet), deg(tangage));
          if (q.z < 0) continue;
          visibles++;
          if (surTerre(p)) terres++;
        }
        const part = terres / visibles;
        expect(part).toBeGreaterThan(0.2);
        expect(part).toBeLessThan(0.6);
      }
    }
  });

  it("garde chaque continent d'un seul tenant", () => {
    /**
     * ⚠️ Le rayon d'une tache est modulé par des harmoniques, et une amplitude trop forte
     * le rendrait **négatif** : le contour se retournerait et se croiserait lui-même,
     * donnant un continent en nœud papillon. La construction le borne ; ce test garde la
     * borne utile en vérifiant qu'aucun bord ne repasse du mauvais côté du centre.
     */
    for (const c of CONTINENTS) {
      for (const p of contourTache(c)) {
        const d = Math.acos(Math.min(1, Math.max(-1,
          p.x * c.centre.x + p.y * c.centre.y + p.z * c.centre.z)));
        expect(d).toBeGreaterThan(0);
        expect(d).toBeLessThan(Math.PI * 0.95);
      }
    }
  });
});

describe("la côte", () => {
  it("entoure chaque terre sans jamais la laisser déborder", () => {
    /**
     * ⚠️ **Le haut-fond est une seconde tache, pas un filet.** SVG centre un trait sur le
     * contour qu'il suit : la moitié de son épaisseur mangerait la terre, et le vert se
     * retrouverait rongé partout où la côte se découpe. En peignant la tache élargie
     * *sous* la verte, le liseré tombe entièrement dans l'eau — ce qu'il est. On vérifie
     * donc que la terre est strictement contenue dans son haut-fond, en tout point.
     */
    for (const c of CONTINENTS) {
      for (const p of contourTache(c)) {
        expect(dansLaTache(p, c, HAUT_FOND)).toBe(true);
      }
    }
  });
});

describe("la moucheture", () => {
  it("ne pose jamais un grain à cheval sur une côte", () => {
    /**
     * ⚠️ **Un grain à cheval se lit comme une île, et brouille la seule ligne qui porte
     * la lecture.** Chaque grain est donc soit franchement à terre, soit franchement au
     * large, jamais dans le haut-fond ni sur son bord. On l'éprouve avec la marge d'un
     * rayon de grain, celle-là même qui a servi à les trier.
     */
    const { terre, mer } = grainsDuGlobe();
    expect(terre.length).toBeGreaterThan(20);
    expect(mer.length).toBeGreaterThan(20);

    const centreDe = (grain: Vec3[]): Vec3 => {
      const s = grain.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y, z: a.z + p.z }),
        { x: 0, y: 0, z: 0 });
      const l = Math.hypot(s.x, s.y, s.z) || 1;
      return { x: s.x / l, y: s.y / l, z: s.z / l };
    };
    for (const g of terre) expect(surTerre(centreDe(g), -RAYON_GRAIN)).toBe(true);
    for (const g of mer) expect(surTerre(centreDe(g), HAUT_FOND + RAYON_GRAIN)).toBe(false);
  });
});

describe("le skin", () => {
  it("se déclare réservé à la sphère", () => {
    /**
     * ⚠️ Les coutures d'un ballon restent lisibles sur n'importe quel volume ; une carte
     * du monde, non — les continents s'étirent avec la forme et le globe cesse d'en être
     * un. Le drapeau est ce qui permet au picker de le retirer plutôt que de laisser
     * produire une image fausse, et il est facile à perdre en refactorisant.
     */
    expect(skinParCle("terre").rond).toBe(true);
    for (const cle of ["uni", "basket", "volley", "tennis"]) {
      expect(skinParCle(cle).rond).toBeFalsy();
    }
  });

  it("peint la mer sous les côtes, et les côtes sous les terres", () => {
    /**
     * L'ordre des aplats **est** le dessin : peintes après les terres, les côtes les
     * recouvriraient et il ne resterait que des anneaux ; peints avant la mer, les grains
     * du large disparaîtraient. Cet ordre-là ne se voit dans aucune propriété du rendu, il
     * ne tient qu'à la position dans le tableau — donc il se garde ici.
     */
    const s = skinParCle("terre");
    const couleurs = s.motifs(s.palette).map(m => m.couleur);
    expect(couleurs).toEqual(["#6E9CC4", "#6FD3E4", s.palette.accent, "#63A83A"]);
  });
});
