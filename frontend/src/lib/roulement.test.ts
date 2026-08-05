import { describe, it, expect } from "vitest";
import { crans } from "./roulement";

describe("crans", () => {
  it("avance du nombre de crans qui sépare deux chiffres", () => {
    expect(crans(3, 4)).toBe(1);
    expect(crans(2, 7)).toBe(5);
  });

  it("passe de 9 à 0 en avançant d'un cran", () => {
    // Le cas qui justifie la fonction : reculer de neuf crans pour afficher un
    // nombre plus grand se lirait comme une baisse.
    expect(crans(9, 0)).toBe(1);
    expect(crans(8, 1)).toBe(3);
  });

  it("ne recule jamais", () => {
    for (let a = 0; a < 10; a++) {
      for (let b = 0; b < 10; b++) expect(crans(a, b)).toBeGreaterThanOrEqual(0);
    }
  });

  it("reste dans la bande, qui compte deux séries", () => {
    // Position de départ au plus 9, avance au plus 9 : jamais au-delà de 18,
    // donc toujours dans les vingt chiffres de la bande.
    for (let a = 0; a < 10; a++) {
      for (let b = 0; b < 10; b++) expect(a + crans(a, b)).toBeLessThan(20);
    }
  });
});
