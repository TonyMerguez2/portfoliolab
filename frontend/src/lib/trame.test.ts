import { describe, expect, it } from "vitest";
import {
  REGLAGES_NOVAC, REGLAGES_REFERENCE, affaiblissementDeLAnneau, attraction,
  bandeDeLAnneau, pasDeRessort, poserLaTrame, tauxDAmortissement,
} from "./trame";

describe("la pose de la trame", () => {
  it("laisse les mêmes marges des deux côtés", () => {
    const { x, colonnes } = poserLaTrame(200, 100, 16);
    const gauche = x[0];
    const droite = 200 - x[colonnes - 1];
    expect(gauche).toBeCloseTo(droite, 5);
  });

  it("garde le pas demandé entre deux voisins", () => {
    const { x, y, colonnes } = poserLaTrame(200, 100, 16);
    expect(x[1] - x[0]).toBeCloseTo(16, 5);
    expect(y[colonnes] - y[0]).toBeCloseTo(16, 5);
  });

  it("cale son origine sur la grille physique de l'écran", () => {
    // 1015 de large : le centrage tombe sur 7,5 px à densité 1, soit 15 demi-pixels.
    const { x } = poserLaTrame(1015, 700, 14, 2);
    expect(x[0] * 2).toBeCloseTo(Math.round(x[0] * 2), 10);
    // Et le pas reste exact : 14 px font 28 pixels physiques, un nombre entier.
    expect(x[1] - x[0]).toBeCloseTo(14, 10);
  });

  it("ne rend aucun point dans une surface plus petite que le pas", () => {
    expect(poserLaTrame(10, 10, 16).nombre).toBe(0);
  });

  it("coûte le carré de la finesse : le pas de Novac fait un tiers de points de plus", () => {
    const novac = poserLaTrame(1440, 900, REGLAGES_NOVAC.pas).nombre;
    const reference = poserLaTrame(1440, 900, REGLAGES_REFERENCE.pas).nombre;
    expect(novac / reference).toBeCloseTo((16 / 14) ** 2, 1);
  });
});

describe("le champ du curseur", () => {
  it("vaut tout au centre et rien au bord", () => {
    expect(attraction(0, 88)).toBe(1);
    expect(attraction(88, 88)).toBe(0);
    expect(attraction(200, 88)).toBe(0);
  });

  it("retombe au carré, donc plus vite qu'une droite", () => {
    expect(attraction(44, 88)).toBeCloseTo(0.25, 5);
  });
});

describe("l'onde du clic", () => {
  it("ne touche que ce que son front traverse", () => {
    // Un point à 300 px, tandis que l'onde en est à 100 : elle ne l'a pas atteint.
    expect(bandeDeLAnneau(300, 100, 22)).toBeLessThan(0.001);
    expect(bandeDeLAnneau(300, 300, 22)).toBe(1);
    // Et une fois passée, elle le laisse.
    expect(bandeDeLAnneau(300, 500, 22)).toBeLessThan(0.001);
  });

  it("s'éteint en arrivant au bout de sa portée", () => {
    expect(affaiblissementDeLAnneau(0, 1000)).toBe(1);
    expect(affaiblissementDeLAnneau(500, 1000)).toBeCloseTo(0.5, 5);
    expect(affaiblissementDeLAnneau(1200, 1000)).toBe(0);
  });
});

describe("le ressort", () => {
  const { raideur, amortissement } = REGLAGES_REFERENCE;

  it("est sous-amorti : le point dépasse sa place avant de s'y poser", () => {
    let valeur = 0;
    let vitesse = 0;
    let depassement = 0;
    for (let i = 0; i < 200; i++) {
      [valeur, vitesse] = pasDeRessort(valeur, vitesse, 1, 1 / 60, raideur, amortissement);
      depassement = Math.max(depassement, valeur - 1);
    }
    expect(depassement).toBeGreaterThan(0.01);
  });

  it("finit tout de même par se poser sur sa cible", () => {
    let valeur = 0;
    let vitesse = 0;
    for (let i = 0; i < 200; i++) {
      [valeur, vitesse] = pasDeRessort(valeur, vitesse, 1, 1 / 60, raideur, amortissement);
    }
    expect(valeur).toBeCloseTo(1, 3);
    expect(Math.abs(vitesse)).toBeLessThan(0.01);
  });

  it("annonce le taux que la référence dit avoir choisi — « environ 0,7 »", () => {
    expect(tauxDAmortissement(raideur, amortissement)).toBeCloseTo(0.69, 2);
  });
});
