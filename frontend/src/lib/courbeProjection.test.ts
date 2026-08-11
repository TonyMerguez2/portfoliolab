import { describe, expect, it } from "vitest";

import {
  anneeDuMois, bande, bornes, chemin, echelles, graduations, montantCourt,
} from "./courbeProjection";

const CADRE = { largeur: 500, hauteur: 200,
  marge: { haut: 10, bas: 20, gauche: 40, droite: 10 } };

describe("bornes", () => {
  it("part de zéro pour ne pas exagérer une pente", () => {
    // ⚠️ Une échelle qui commence à 200 000 € fait passer une hausse de 5 % pour un
    // doublement. Sur une projection de patrimoine, c'est trompeur.
    expect(bornes([200_000, 210_000])).toEqual({ bas: 0, haut: 210_000 });
  });

  it("ne rend jamais un intervalle nul", () => {
    // Sinon la division par l'étendue produit des NaN, donc un tracé absent et muet.
    const b = bornes([0, 0, 0]);
    expect(b.haut).toBeGreaterThan(b.bas);
  });

  it("survit à une série vide ou non finie", () => {
    expect(bornes([])).toEqual({ bas: 0, haut: 1 });
    expect(bornes([NaN, Infinity]).haut).toBeGreaterThan(bornes([NaN]).bas);
  });
});

describe("graduations", () => {
  it("choisit des pas humains", () => {
    // ⚠️ Un axe gradué tous les 137 429 € ne se lit pas.
    const g = graduations(0, 400_000);
    const pas = g[1] - g[0];
    expect([1, 2, 2.5, 5, 10].some(m => Math.abs(pas / (m * 10 ** Math.floor(Math.log10(pas))) - 1) < 1e-9))
      .toBe(true);
  });

  it("reste dans les bornes et s'en approche à un pas près", () => {
    // ⚠️ Le dernier repère n'atteint pas le maximum, et c'est voulu : pour 0 à 373 102,
    // les repères ronds s'arrêtent à 300 000. J'avais d'abord exigé qu'ils dépassent
    // 300 000, ce qui demandait au code de choisir un pas non rond ou de sortir de
    // l'échelle. Ce qui compte est qu'aucun repère ne sorte, et qu'il n'en manque pas
    // plus d'un.
    const g = graduations(0, 373_102);
    expect(g[0]).toBeGreaterThanOrEqual(0);
    expect(g[g.length - 1]).toBeLessThanOrEqual(373_102);
    const pas = g[1] - g[0];
    expect(373_102 - g[g.length - 1]).toBeLessThan(pas);
  });

  it("ne boucle pas sur une étendue nulle", () => {
    expect(graduations(5, 5)).toEqual([5]);
  });
});

describe("echelles", () => {
  const { x, y } = echelles([0, 120, 240], 0, 400_000, CADRE);

  it("place le premier et le dernier mois sur les bords utiles", () => {
    expect(x(0)).toBeCloseTo(40);
    expect(x(240)).toBeCloseTo(490);
  });

  it("inverse l'axe des valeurs, comme SVG l'exige", () => {
    // ⚠️ Zéro est en haut en SVG. L'oublier dessine une projection qui descend quand le
    // patrimoine monte.
    expect(y(400_000)).toBeLessThan(y(0));
    expect(y(0)).toBeCloseTo(180);
    expect(y(400_000)).toBeCloseTo(10);
  });

  it("supporte un seul point sans diviser par zéro", () => {
    const e = echelles([12], 0, 100, CADRE);
    expect(Number.isFinite(e.x(12))).toBe(true);
  });
});

describe("chemin", () => {
  const { x, y } = echelles([0, 12, 24], 0, 100, CADRE);

  it("commence par un déplacement puis enchaîne des lignes", () => {
    const d = chemin([0, 12, 24], [10, 20, 30], x, y);
    expect(d.startsWith("M")).toBe(true);
    expect((d.match(/L/g) ?? []).length).toBe(2);
  });

  it("coupe le tracé sur une valeur manquante au lieu de la mettre à zéro", () => {
    // ⚠️ Une courbe qui plonge à zéro se lit comme une perte totale ; un trou se lit
    // comme une donnée manquante, ce qui est le cas.
    const d = chemin([0, 12, 24], [10, NaN, 30], x, y);
    expect((d.match(/M/g) ?? []).length).toBe(2);
    expect(d).not.toContain(`${y(0).toFixed(2)}`);
  });

  it("rend une chaîne vide sans point utilisable", () => {
    expect(chemin([0, 12], [NaN, NaN], x, y)).toBe("");
  });
});

describe("bande", () => {
  const { x, y } = echelles([0, 12], 0, 100, CADRE);

  it("se referme sur elle-même", () => {
    const d = bande([0, 12], [10, 20], [30, 40], x, y);
    expect(d.endsWith("Z")).toBe(true);
  });

  it("ne rend rien sans borne haute", () => {
    expect(bande([0, 12], [10, 20], [NaN, NaN], x, y)).toBe("");
  });
});

describe("anneeDuMois", () => {
  it("compte les mois depuis aujourd'hui", () => {
    const ref = new Date(2026, 7, 1); // août 2026
    expect(anneeDuMois(0, ref)).toBe(2026);
    expect(anneeDuMois(5, ref)).toBe(2027);   // janvier 2027
    expect(anneeDuMois(220, ref)).toBe(2044);
  });
});

describe("montantCourt", () => {
  it("abrège les grands nombres pour un axe", () => {
    expect(montantCourt(1_500_000)).toMatch(/1,5\s?M€/);
    expect(montantCourt(500_000)).toBe("500 k€");
    expect(montantCourt(850)).toBe("850 €");
  });
});

describe("sur les chiffres réellement mesurés", () => {
  /**
   * ⚠️ Les valeurs viennent d'une projection réelle du portefeuille « Aperçu » : départ
   * 3 467 €, 800 €/mois à 7,2 %, volatilité mesurée 11,91 %, horizon 220 mois. Elles
   * servent de repère parce que la géométrie ne se vérifie pas à l'œil : une échelle
   * fausse produit une courbe plausible, et c'est le pire des cas.
   */
  const mois = Array.from({ length: 19 }, (_, i) => i * 12).concat(220);
  const croissance = (fin: number) =>
    mois.map(m => 3467 + (fin - 3467) * (m / 220) ** 1.6);
  const p5 = croissance(215_604);
  const p50 = croissance(373_102);
  const p95 = croissance(667_266);
  const requis = 100_000;

  const CADRE_REEL = { largeur: 620, hauteur: 240,
    marge: { haut: 14, bas: 26, gauche: 52, droite: 12 } };

  it("l'échelle englobe la cible et l'enveloppe haute", () => {
    const { bas, haut } = bornes([...p5, ...p50, ...p95, requis]);
    expect(bas).toBe(0);
    expect(haut).toBeGreaterThanOrEqual(667_266);
  });

  it("aucun point ne sort du cadre", () => {
    const { bas, haut } = bornes([...p5, ...p50, ...p95, requis]);
    const { x, y } = echelles(mois, bas, haut, CADRE_REEL);
    for (const serie of [p5, p50, p95]) {
      for (let i = 0; i < mois.length; i++) {
        expect(x(mois[i])).toBeGreaterThanOrEqual(CADRE_REEL.marge.gauche - 0.01);
        expect(x(mois[i])).toBeLessThanOrEqual(
          CADRE_REEL.largeur - CADRE_REEL.marge.droite + 0.01);
        expect(y(serie[i])).toBeGreaterThanOrEqual(CADRE_REEL.marge.haut - 0.01);
        expect(y(serie[i])).toBeLessThanOrEqual(
          CADRE_REEL.hauteur - CADRE_REEL.marge.bas + 0.01);
      }
    }
  });

  it("le chemin ne contient ni NaN ni Infinity", () => {
    const { bas, haut } = bornes([...p5, ...p50, ...p95, requis]);
    const { x, y } = echelles(mois, bas, haut, CADRE_REEL);
    // ⚠️ Un « NaN » dans un attribut `d` fait disparaître le tracé **en silence** : pas
    // d'erreur en console, juste une courbe absente.
    for (const d of [chemin(mois, p50, x, y), bande(mois, p5, p95, x, y)]) {
      expect(d).not.toMatch(/NaN|Infinity/);
      expect(d.length).toBeGreaterThan(50);
    }
  });

  it("la bande enveloppe bien la médiane", () => {
    for (let i = 0; i < mois.length; i++) {
      expect(p5[i]).toBeLessThanOrEqual(p50[i]);
      expect(p50[i]).toBeLessThanOrEqual(p95[i]);
    }
  });

  it("les graduations restent lisibles sur cette étendue", () => {
    const { bas, haut } = bornes([...p5, ...p50, ...p95, requis]);
    const g = graduations(bas, haut);
    expect(g.length).toBeGreaterThanOrEqual(3);
    expect(g.length).toBeLessThanOrEqual(8);
    expect(g.every(v => montantCourt(v).length <= 8)).toBe(true);
  });
});
