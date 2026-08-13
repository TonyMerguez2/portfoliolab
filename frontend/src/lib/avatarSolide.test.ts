import { describe, expect, it } from "vitest";

import {
  Silhouette, cheminOeilSolide, contourTeteSolide, normaleSolide, regardDansLeSolide,
  surLeSolide,
} from "./avatarSolide";
import { type Point2, type Vec3, tournerTete } from "./avatarSpherique";
import { SPHERE, type Solide, solideDepuis } from "./avatarVolume";

/**
 * Le solide qui tourne tient-il ses promesses ?
 *
 * ⚠️ **Ce mode ne se vérifie pas comme l'autre.** Sur la silhouette fixe, l'invariant
 * était « rien ne sort du disque » — une inégalité contre une forme connue d'avance. Ici
 * la silhouette change à chaque orientation : ce qu'on vérifie, c'est qu'elle *est* le
 * bord du solide, que la visibilité suit la normale, et surtout que ce qui est peint
 * dessus ne se déforme plus en tournant. C'est cette dernière propriété qui justifie
 * l'existence du mode ; sans test, on ne saurait pas si elle est tenue.
 */

const deg = (d: number) => (d * Math.PI) / 180;
const norme = (v: Vec3) => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
const CUBES: Solide[] = [
  solideDepuis("cube", 0.7), solideDepuis("cube", 0.42), solideDepuis("cube", 0.25),
];
const CUBE8 = solideDepuis("cube", 0.25);
const OEIL = { ecart: 27, elevation: 0, largeur: 32, hauteur: 66, inclinaison: 0 };

function pointsDuChemin(d: string): Point2[] {
  const n = d.match(/-?\d+(\.\d+)?/g) ?? [];
  const p: Point2[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) p.push({ x: Number(n[i]), y: Number(n[i + 1]) });
  return p;
}
const aire = (q: Point2[]) => {
  let a = 0;
  for (let i = 0; i < q.length; i++) {
    const p = q[i], r = q[(i + 1) % q.length];
    a += p.x * r.y - r.x * p.y;
  }
  return Math.abs(a) / 2;
};

describe("surLeSolide", () => {
  it("pose le point sur la superellipsoïde sans changer sa direction", () => {
    for (const n of CUBES) {
      for (const p of [
        { x: 0.6, y: 0.3, z: Math.sqrt(1 - 0.45) },
        { x: -0.9, y: 0.2, z: Math.sqrt(1 - 0.85) },
        { x: 0, y: 0, z: 1 },
      ]) {
        const q = surLeSolide(p, n);
        const e = n.famille === "cube" ? n.exposant : 2;
        const somme = Math.pow(Math.abs(q.x), e) + Math.pow(Math.abs(q.y), e) + Math.pow(Math.abs(q.z), e);
        expect(somme).toBeCloseTo(1, 9);
        expect(q.x * p.y - q.y * p.x).toBeCloseTo(0, 9);
      }
    }
  });
});

describe("normaleSolide", () => {
  it("rend la position elle-même sur la sphère", () => {
    // Sur une sphère, la normale *est* la position : c'est pourquoi le module principal
    // n'a jamais eu à distinguer les deux, et pourquoi il faut le faire ici.
    const p = { x: 0.5, y: -0.5, z: Math.SQRT1_2 };
    expect(normaleSolide(p, SPHERE)).toEqual(p);
  });

  it("pointe droit devant au milieu d'une face", () => {
    for (const n of [solideDepuis("cube", 0.5), solideDepuis("cube", 0.25)]) {
      const N = normaleSolide({ x: 0, y: 0, z: 1 }, n);
      expect(N.z).toBeCloseTo(1, 9);
      expect(Math.hypot(N.x, N.y)).toBeCloseTo(0, 9);
    }
  });

  it("s'aplatit sur la face à mesure que le solide devient cubique", () => {
    // Le fait qui donne son intérêt au mode : à mi-face, la normale d'une sphère est
    // déjà penchée de 30°, celle d'un cube presque pas.
    const p = { x: 0.5, y: 0, z: Math.sqrt(0.75) };
    expect(normaleSolide(p, SPHERE).z).toBeCloseTo(Math.sqrt(0.75), 9);
    expect(normaleSolide(p, CUBE8).z).toBeGreaterThan(0.99);
    expect(norme(normaleSolide(p, CUBE8))).toBeCloseTo(1, 9);
  });
});

describe("regardDansLeSolide", () => {
  it("annule exactement la rotation de la tête", () => {
    /**
     * ⚠️ L'erreur qui rendrait tout faux sans rien casser de visible : une silhouette
     * calculée avec une direction de regard légèrement fausse reste une courbe close et
     * plausible, mais ne borde plus le solide. On vérifie donc l'aller-retour.
     */
    for (const [l, t, r] of [[0, 0, 0], [35, -20, 12], [140, 70, -95], [-180, 180, 180]]) {
      const o = { lacet: deg(l), tangage: deg(t), roulis: deg(r) };
      const v = regardDansLeSolide(o);
      const retour = tournerTete(v, o.lacet, o.tangage, o.roulis);
      expect(retour.x).toBeCloseTo(0, 9);
      expect(retour.y).toBeCloseTo(0, 9);
      expect(retour.z).toBeCloseTo(1, 9);
    }
  });
});

describe("Silhouette", () => {
  it("pose ses points sur le solide, normale perpendiculaire au regard", () => {
    for (const arrondi of [0.42, 0.2]) {
      const n = solideDepuis("cube", arrondi);
      const v = regardDansLeSolide({ lacet: deg(30), tangage: deg(-15) });
      const s = new Silhouette(v, n);
      for (let i = 0; i < 24; i++) {
        const q = s.point((i / 24) * Math.PI * 2);
        const e = n.famille === "cube" ? n.exposant : 2;
        const somme = Math.pow(Math.abs(q.x), e) + Math.pow(Math.abs(q.y), e) + Math.pow(Math.abs(q.z), e);
        expect(somme).toBeCloseTo(1, 5);
        const N = normaleSolide(q, n);
        // ⚠️ Trois décimales, et c'est la précision de la table : le bord est échantillonné
        // sur quatre-vingt-seize méridiens puis interpolé. Exiger davantage reviendrait à
        // tester l'interpolation, pas la géométrie — et à faire échouer le test le jour où
        // l'on échantillonnerait moins finement pour aller plus vite.
        expect(N.x * v.x + N.y * v.y + N.z * v.z).toBeCloseTo(0, 3);
      }
    }
  });

  it("retrouve l'angle d'un de ses propres points", () => {
    const n = solideDepuis("cube", 0.42);
    const s = new Silhouette(regardDansLeSolide({ lacet: deg(-40), tangage: deg(25) }), n);
    for (const t of [0, 1.1, 2.7, -2.2]) {
      const q = s.point(t);
      const retrouve = s.angle(q);
      const ecart = Math.abs(((retrouve - t + Math.PI) % (2 * Math.PI)) - Math.PI);
      expect(ecart).toBeLessThan(1e-6);
    }
  });

  it("redevient le cercle du bord sur la sphère", () => {
    const s = new Silhouette({ x: 0, y: 0, z: 1 }, SPHERE);
    for (const q of s.contour(40)) {
      expect(norme(q)).toBeCloseTo(1, 9);
      expect(q.z).toBeCloseTo(0, 9);
    }
  });
});

describe("cheminOeilSolide", () => {
  it("garde l'œil rigide : seule la perspective le raccourcit", () => {
    /**
     * ⚠️ **La propriété qui justifie tout ce module.** Dans le mode à silhouette fixe,
     * le gonflement s'applique après la rotation : un même point de la surface reçoit un
     * étirement qui varie de 21 % selon l'orientation, et l'œil se déforme en tournant —
     * mesuré, il *grandissait* de 27 % à dix degrés avant compensation. Ici l'œil est
     * peint sur le solide une fois pour toutes : son aire ne peut que décroître à
     * mesure qu'il se détourne, exactement comme sur une sphère.
     */
    for (const arrondi of [1, 0.42, 0.2]) {
      const n = solideDepuis("cube", arrondi);
      let precedent = Infinity;
      for (const lacet of [0, 10, 20, 30, 40]) {
        const o = { lacet: deg(lacet), tangage: 0 };
        const a = aire(pointsDuChemin(cheminOeilSolide(OEIL, o, 1, 100, 220, n)));
        expect(a).toBeLessThanOrEqual(precedent + 1e-6);
        precedent = a;
      }
    }
  });

  it("garde les deux yeux égaux de face, quelle que soit la forme", () => {
    for (const arrondi of [1, 0.42, 0.2]) {
      const n = solideDepuis("cube", arrondi);
      const o = { lacet: 0, tangage: 0 };
      const g = aire(pointsDuChemin(cheminOeilSolide(OEIL, o, -1, 100, 220, n)));
      const d = aire(pointsDuChemin(cheminOeilSolide(OEIL, o, 1, 100, 220, n)));
      expect(d).toBeCloseTo(g, 0);
    }
  });

  it("ne laisse jamais l'œil déborder de la silhouette", () => {
    for (const arrondi of [0.42, 0.2]) {
      const n = solideDepuis("cube", arrondi);
      for (const lacet of [-120, -35, 0, 55, 160]) {
        for (const tangage of [-40, 0, 30]) {
          const o = { lacet: deg(lacet), tangage: deg(tangage) };
          const tete = pointsDuChemin(contourTeteSolide(o, n, 100, 360));
          const dedans = (p: Point2) => {
            // Le contour est convexe : un point est dedans s'il l'est de chaque côté.
            let signe = 0;
            for (let i = 0; i < tete.length; i++) {
              const a = tete[i], b = tete[(i + 1) % tete.length];
              const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
              if (Math.abs(c) < 1e-6) continue;
              if (signe === 0) signe = Math.sign(c);
              else if (Math.sign(c) !== signe) return false;
            }
            return true;
          };
          for (const p of pointsDuChemin(cheminOeilSolide(OEIL, o, -1, 100, 160, n))) {
            expect(dedans({ x: p.x * 0.999, y: p.y * 0.999 })).toBe(true);
          }
        }
      }
    }
  });
});

describe("contourTeteSolide", () => {
  it("respire en tournant, là où la silhouette fixe ne bougeait pas", () => {
    // Le prix du mode, et il vaut d'être mesuré : la marque n'est plus constante.
    const n = solideDepuis("cube", 0.42);
    const aires = [0, 20, 45].map(lacet =>
      aire(pointsDuChemin(contourTeteSolide({ lacet: deg(lacet), tangage: 0 }, n, 100, 360))));
    expect(aires[1]).toBeGreaterThan(aires[0]);
    expect(aires[2]).toBeGreaterThan(aires[1]);
    expect(aires[2] / aires[0]).toBeLessThan(1.3);
  });

  it("redevient le disque exact sur la sphère", () => {
    for (const lacet of [0, 40, 130]) {
      for (const p of pointsDuChemin(contourTeteSolide({ lacet: deg(lacet), tangage: deg(20) }, SPHERE, 100, 120))) {
        // À un centième près : c'est la précision d'écriture du `d`, pas celle du calcul.
        expect(Math.hypot(p.x, p.y)).toBeCloseTo(100, 1);
      }
    }
  });
});

describe("la silhouette cherchée contre la silhouette calculée", () => {
  it("tombe au même endroit que la formule close de la superellipsoïde", () => {
    /**
     * ⚠️ **Le témoin qui autorise une méthode unique.** La superellipsoïde admet une
     * silhouette en forme close : dans l'espace dual `uᵢ = sgn(qᵢ)|qᵢ|ⁿ⁻¹`, la surface
     * devient la boule de la norme ℓⁿ′ et la condition de bord un simple plan `u·v = 0`.
     * L'étoile n'a pas cet équivalent, et écrire deux chemins — l'un exact, l'autre
     * approché — les aurait fait diverger au premier ajustement. On garde donc la
     * recherche par dichotomie pour toutes les formes, et l'on vérifie ici qu'elle rend
     * bien ce que la formule dit, là où la formule existe.
     */
    for (const arrondi of [0.6, 0.42, 0.25]) {
      const solide = solideDepuis("cube", arrondi);
      const n = solide.famille === "cube" ? solide.exposant : 2;
      const dual = n / (n - 1);
      const v = regardDansLeSolide({ lacet: deg(37), tangage: deg(-21), roulis: deg(14) });
      const s = new Silhouette(v, solide);
      for (let i = 0; i < 32; i++) {
        const t = (i / 32) * Math.PI * 2;
        const q = s.point(t);
        // La formule : u doit être dans le plan perpendiculaire au regard, et de norme
        // duale égale à 1.
        const u = {
          x: Math.sign(q.x) * Math.pow(Math.abs(q.x), n - 1),
          y: Math.sign(q.y) * Math.pow(Math.abs(q.y), n - 1),
          z: Math.sign(q.z) * Math.pow(Math.abs(q.z), n - 1),
        };
        const normeDuale = Math.pow(
          Math.pow(Math.abs(u.x), dual) + Math.pow(Math.abs(u.y), dual) + Math.pow(Math.abs(u.z), dual),
          1 / dual);
        expect((u.x * v.x + u.y * v.y + u.z * v.z) / normeDuale).toBeCloseTo(0, 3);
      }
    }
  });

  it("borde l'étoile aussi, là où aucune formule ne l'attend", () => {
    for (const arrondi of [0.7, 0.4]) {
      const solide = solideDepuis("etoile", arrondi);
      const v = regardDansLeSolide({ lacet: deg(-52), tangage: deg(18) });
      const s = new Silhouette(v, solide);
      for (let i = 0; i < 40; i++) {
        const q = s.point((i / 40) * Math.PI * 2);
        const N = normaleSolide(q, solide);
        // Le bord, c'est là où la normale ne regarde ni vers nous ni vers l'arrière.
        // Deux décimales sur l'étoile : son bord se courbe plus vite que celui du cube,
        // donc l'interpolation entre deux méridiens y laisse un peu plus d'écart.
        expect(N.x * v.x + N.y * v.y + N.z * v.z).toBeCloseTo(0, 2);
      }
    }
  });

  it("garde l'étoile rigide en tournant, comme le cube", () => {
    const solide = solideDepuis("etoile", 0.4);
    let precedent = Infinity;
    for (const lacet of [0, 10, 20, 30, 40]) {
      const a = aire(pointsDuChemin(
        cheminOeilSolide(OEIL, { lacet: deg(lacet), tangage: 0 }, 1, 100, 220, solide)));
      expect(a).toBeLessThanOrEqual(precedent + 1e-6);
      precedent = a;
    }
  });
});
