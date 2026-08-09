import { describe, expect, it } from "vitest";

import { bornerDecalage, echelleMinimale, sourceVisible } from "./cadrage";

/** Une photo de téléphone en paysage, et le cadre de la vignette à l'écran. */
const paysage = { largeur: 4000, hauteur: 3000 };
const portrait = { largeur: 3000, hauteur: 4000 };
const carree = { largeur: 1000, hauteur: 1000 };
const CADRE = 240;

describe("echelleMinimale", () => {
  it("couvre le cadre plutôt que d'y faire tenir l'image", () => {
    // ⚠️ Le côté le plus court commande. Prendre l'autre laisserait deux bandes
    // vides, qui finiraient dans le fichier envoyé.
    expect(echelleMinimale(paysage, CADRE)).toBeCloseTo(240 / 3000, 10);
    expect(echelleMinimale(portrait, CADRE)).toBeCloseTo(240 / 3000, 10);
  });

  it("vaut le rapport exact sur une image carrée", () => {
    expect(echelleMinimale(carree, CADRE)).toBeCloseTo(240 / 1000, 10);
  });

  it("ne divise pas par zéro sur une image sans dimension", () => {
    expect(echelleMinimale({ largeur: 0, hauteur: 0 }, CADRE)).toBe(1);
  });
});

describe("bornerDecalage", () => {
  it("laisse glisser dans la marge disponible", () => {
    const e = echelleMinimale(paysage, CADRE);
    // Marge horizontale : (4000 × 0,08 − 240) / 2 = 40 px.
    expect(bornerDecalage(20, 0, paysage, e, CADRE).dx).toBe(20);
    expect(bornerDecalage(999, 0, paysage, e, CADRE).dx).toBeCloseTo(40, 6);
    expect(bornerDecalage(-999, 0, paysage, e, CADRE).dx).toBeCloseTo(-40, 6);
  });

  it("fige l'axe sans marge, au lieu de découvrir du vide", () => {
    // À l'échelle minimale d'un paysage, la hauteur épouse exactement le cadre.
    const e = echelleMinimale(paysage, CADRE);
    expect(bornerDecalage(0, 50, paysage, e, CADRE).dy).toBe(0);
    expect(bornerDecalage(0, -50, paysage, e, CADRE).dy).toBe(0);
  });

  it("ouvre les deux axes dès qu'on agrandit", () => {
    const e = echelleMinimale(carree, CADRE) * 2;
    const b = bornerDecalage(1000, 1000, carree, e, CADRE);
    expect(b.dx).toBeCloseTo(120, 6);
    expect(b.dy).toBeCloseTo(120, 6);
  });
});

describe("sourceVisible", () => {
  it("prélève un carré au centre quand rien n'est déplacé", () => {
    const e = echelleMinimale(paysage, CADRE);
    const s = sourceVisible(0, 0, paysage, e, CADRE);
    expect(s.cote).toBeCloseTo(3000, 6);
    expect(s.sx).toBeCloseTo(500, 6);   // (4000 − 3000) / 2
    expect(s.sy).toBeCloseTo(0, 6);
  });

  it("part de l'image native et non de l'affichage", () => {
    // ⚠️ Le cadre mesure 240 px à l'écran, la photo 3 000 : le carré prélevé doit
    // faire 3 000 px de côté, pas 240. Sinon la vignette exportée serait à la
    // résolution de l'écran, floue au premier agrandissement.
    const e = echelleMinimale(portrait, CADRE);
    expect(sourceVisible(0, 0, portrait, e, CADRE).cote).toBeCloseTo(3000, 6);
  });

  it("suit le déplacement, converti en pixels de l'image", () => {
    const e = echelleMinimale(paysage, CADRE);   // 0,08
    // Pousser l'image de 40 px à l'écran révèle 40 / 0,08 = 500 px à gauche.
    expect(sourceVisible(40, 0, paysage, e, CADRE).sx).toBeCloseTo(0, 6);
    expect(sourceVisible(-40, 0, paysage, e, CADRE).sx).toBeCloseTo(1000, 6);
  });

  it("rétrécit le prélèvement quand on agrandit", () => {
    const e = echelleMinimale(carree, CADRE) * 2;
    expect(sourceVisible(0, 0, carree, e, CADRE).cote).toBeCloseTo(500, 6);
  });

  it("reste dans l'image même si l'appelant n'a pas borné le déplacement", () => {
    // `drawImage` remplirait de transparence un rectangle à cheval sur le vide.
    const e = echelleMinimale(carree, CADRE);
    for (const d of [10_000, -10_000]) {
      const s = sourceVisible(d, d, carree, e, CADRE);
      expect(s.sx).toBeGreaterThanOrEqual(0);
      expect(s.sy).toBeGreaterThanOrEqual(0);
      expect(s.sx + s.cote).toBeLessThanOrEqual(carree.largeur + 1e-9);
      expect(s.sy + s.cote).toBeLessThanOrEqual(carree.hauteur + 1e-9);
    }
  });

  it("ne prélève jamais plus que l'image, même à l'échelle minimale", () => {
    for (const img of [paysage, portrait, carree]) {
      const s = sourceVisible(0, 0, img, echelleMinimale(img, CADRE), CADRE);
      expect(s.cote).toBeLessThanOrEqual(Math.min(img.largeur, img.hauteur) + 1e-9);
    }
  });
});
