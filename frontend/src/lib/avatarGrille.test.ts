import { describe, expect, it } from "vitest";

import { PAS_GRILLE, grillePourSolide, grilleSpherique } from "./avatarGrille";
import { melangerSolides, solideDepuis } from "./avatarVolume";
import {
  type Vec3, cercleDeLatitude, couperParProfondeur, traitSurLaTete,
} from "./avatarSpherique";

/**
 * Le maillage dit-il la vérité sur la sphère ?
 *
 * ⚠️ **Une grille fausse est pire que pas de grille.** Elle sert de témoin : c'est sur
 * elle qu'on lira si une rotation part du bon côté. Un parallèle qui ne serait pas
 * plan, ou un tronçon caché classé devant, ferait mentir le témoin — et l'on
 * corrigerait alors la géométrie d'après un repère faux.
 */

const deg = (d: number) => (d * Math.PI) / 180;
const norme = (v: Vec3) => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

describe("cercleDeLatitude", () => {
  it("pose tous ses points sur la sphère, à la hauteur demandée", () => {
    for (const lat of [-75, -30, 0, 15, 60]) {
      const c = cercleDeLatitude(deg(lat), 64);
      for (const p of c) {
        expect(norme(p)).toBeCloseTo(1, 12);
        expect(p.y).toBeCloseTo(Math.sin(deg(lat)), 12);
      }
    }
  });

  it("a le rayon d'un parallèle, et non celui d'un grand cercle", () => {
    // La confusion à écarter : un cercle de latitude 60° a pour rayon cos 60° = 0,5.
    // Rendu de rayon 1, il sortirait de la sphère — ou plutôt il n'y serait plus.
    const c = cercleDeLatitude(deg(60), 64);
    for (const p of c) {
      expect(Math.sqrt(p.x * p.x + p.z * p.z)).toBeCloseTo(0.5, 12);
    }
  });
});

describe("couperParProfondeur", () => {
  it("ne coupe pas ce qui tient d'un seul côté", () => {
    /**
     * ⚠️ L'invariant qui distingue cette coupe de celle des surfaces : une courbe
     * fermée entièrement visible doit rendre **un** tronçon. Un parcours démarré
     * n'importe où la couperait en deux au point de départ — deux traits au lieu d'un,
     * invisible à l'écran mais faux dès qu'on compte.
     */
    const devantSeul = cercleDeLatitude(0, 32).map(p => ({ ...p, z: Math.abs(p.z) + 0.1 }));
    const r = couperParProfondeur(devantSeul);
    expect(r.devant.length).toBe(1);
    expect(r.derriere.length).toBe(0);
  });

  it("range chaque point du bon côté", () => {
    const c = cercleDeLatitude(deg(20), 64);
    const r = couperParProfondeur(c);
    for (const m of r.devant) for (const p of m) expect(p.z).toBeGreaterThanOrEqual(-1e-9);
    for (const m of r.derriere) for (const p of m) expect(p.z).toBeLessThanOrEqual(1e-9);
  });

  it("partage les points de traversée, sans trou ni recouvrement", () => {
    // Un équateur vu de face : deux moitiés, qui doivent se toucher exactement sur la
    // silhouette. Sans le point partagé, le trait s'interromprait d'un demi-échantillon
    // à chaque bord — un pointillé que personne n'a demandé.
    const r = couperParProfondeur(cercleDeLatitude(0, 64));
    expect(r.devant.length).toBe(1);
    expect(r.derriere.length).toBe(1);
    const finDevant = r.devant[0][r.devant[0].length - 1];
    const debutDerriere = r.derriere[0][0];
    expect(finDevant.x).toBeCloseTo(debutDerriere.x, 12);
    expect(finDevant.y).toBeCloseTo(debutDerriere.y, 12);
    expect(Math.abs(finDevant.z)).toBeLessThan(1e-12);
  });

  it("renormalise les traversées sur la sphère", () => {
    // Interpolées bêtement, elles tomberaient à l'intérieur du volume : le trait
    // décollerait de la silhouette au lieu d'y passer.
    const r = couperParProfondeur(cercleDeLatitude(deg(35), 24));
    for (const m of [...r.devant, ...r.derriere]) {
      for (const p of m) expect(norme(p)).toBeCloseTo(1, 9);
    }
  });
});

describe("grilleSpherique", () => {
  it("compte autant de parallèles que de latitudes, pôles exclus", () => {
    const g = grilleSpherique(30);
    // 30°, 60° au nord et au sud : quatre, plus l'équateur à part.
    expect(g.paralleles.length).toBe(4);
    expect(g.equateur.length).toBeGreaterThan(3);
  });

  it("trace un grand cercle pour deux méridiens opposés", () => {
    // Au pas de 30°, douze méridiens — donc six cercles, pas douze.
    expect(grilleSpherique(30).meridiens.length).toBe(6);
    expect(grilleSpherique(15).meridiens.length).toBe(12);
  });

  it("fait passer chaque méridien par les deux pôles", () => {
    for (const m of grilleSpherique(PAS_GRILLE).meridiens) {
      const nord = m.filter(p => Math.abs(p.y - 1) < 1e-9);
      const sud = m.filter(p => Math.abs(p.y + 1) < 1e-9);
      expect(nord.length).toBeGreaterThan(0);
      expect(sud.length).toBeGreaterThan(0);
    }
  });

  it("garde toute la grille sur la sphère", () => {
    const g = grilleSpherique(PAS_GRILLE);
    const toutes = [g.equateur, ...g.paralleles, ...g.meridiens];
    for (const c of toutes) for (const p of c) expect(norme(p)).toBeCloseTo(1, 12);
    for (const a of g.axes) expect(norme(a.pointe)).toBeCloseTo(1, 12);
  });
});

describe("traitSurLaTete", () => {
  it("laisse une moitié devant et une moitié derrière, de face", () => {
    const t = traitSurLaTete(cercleDeLatitude(0, 64), { lacet: 0, tangage: 0 }, 100);
    expect(t.devant.length).toBeGreaterThan(0);
    expect(t.derriere.length).toBeGreaterThan(0);
  });

  it("n'écrit jamais de fermeture : un trait n'est pas un contour", () => {
    /**
     * ⚠️ C'est la faute que la coupe des surfaces ferait commettre : refermer un
     * tronçon le long de la silhouette peindrait une lune pleine à la place d'une
     * ligne. Un `Z` dans le `d` suffirait à la trahir.
     */
    for (const angle of [0, 25, 70, 140]) {
      const t = traitSurLaTete(cercleDeLatitude(deg(20), 48), { lacet: deg(angle), tangage: deg(12) }, 100);
      expect(t.devant).not.toContain("Z");
      expect(t.derriere).not.toContain("Z");
    }
  });

  it("ne sort jamais du disque de la tête", () => {
    /**
     * ⚠️ Grille grossière et balayage court : l'invariant se joue sur la coupe et la
     * projection, pas sur le nombre d'échantillons. Au pas fin et sur soixante-quinze
     * orientations, le même test mettait plus de cinq secondes — un test qu'on finit
     * par désactiver n'en est plus un.
     */
    const g = grilleSpherique(45, 48);
    const rayon = 100;
    for (const lacet of [-180, -95, 0, 47, 180]) {
      for (const tangage of [-40, 0, 88]) {
        for (const roulis of [0, -155]) {
          const o = { lacet: deg(lacet), tangage: deg(tangage), roulis: deg(roulis) };
          for (const c of [g.equateur, ...g.paralleles, ...g.meridiens]) {
            const t = traitSurLaTete(c, o, rayon);
            const nombres = `${t.devant} ${t.derriere}`.match(/-?\d+(\.\d+)?/g) ?? [];
            for (let i = 0; i + 1 < nombres.length; i += 2) {
              const x = Number(nombres[i]), y = Number(nombres[i + 1]);
              expect(Math.sqrt(x * x + y * y)).toBeLessThanOrEqual(rayon + 0.02);
            }
          }
        }
      }
    }
  });

  /**
   * ⚠️ **La grille se garde, sinon chaque morphose coûte une grille par image.** La table du
   * méridien parcourt tous les azimuts : 9,8 ms l'appel. Comme un mélange est un solide neuf à
   * chaque image, rien ne peut le mettre en cache par identité — mais ses deux extrémités sont
   * stables, et la table d'un rayon interpolé est l'interpolation des deux tables. Relevé
   * après correction : 0,28 ms par image au lieu de 9,8.
   */
  it("garde ses tables et interpole celles d'un mélange", () => {
    const nuage = solideDepuis("nuage", 0.5);
    const etoile = solideDepuis("etoile6", 0.5);
    /* Les deux bouts d'un mélange doivent redonner exactement les grilles d'origine. */
    const seul = grillePourSolide(nuage);
    const bout = grillePourSolide(melangerSolides(nuage, etoile, 0));
    expect(bout.paralleles.length).toBe(seul.paralleles.length);
    for (let i = 0; i < seul.paralleles.length; i++) {
      expect(bout.paralleles[i][0].y).toBeCloseTo(seul.paralleles[i][0].y, 6);
    }
    /* Et le milieu doit tomber entre les deux, jamais au-delà. */
    const milieu = grillePourSolide(melangerSolides(nuage, etoile, 0.5));
    const autre = grillePourSolide(etoile);
    for (let i = 0; i < milieu.paralleles.length; i++) {
      const [a, b] = [seul.paralleles[i][0].y, autre.paralleles[i][0].y];
      expect(milieu.paralleles[i][0].y).toBeGreaterThanOrEqual(Math.min(a, b) - 1e-6);
      expect(milieu.paralleles[i][0].y).toBeLessThanOrEqual(Math.max(a, b) + 1e-6);
    }
  });
});
