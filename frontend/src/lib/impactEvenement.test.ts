import { describe, expect, it } from "vitest";

import { amplitudeAttendue, libelleAmplitude, porteUnImpact } from "./impactEvenement";

const st = (exposition: number, impact_moyen: number) => ({
  exposition, impact_moyen, probabilite: 50, seuil: 2, echantillon: 12,
});

describe("amplitudeAttendue", () => {
  it("pondère l'amplitude du titre par son poids", () => {
    // Mesuré sur les vraies actions de « gg » : TSLA bouge de ±9,00 % et pèse
    // 50 % — soit ±4,50 % sur le portefeuille.
    expect(amplitudeAttendue(st(50, 9))).toBeCloseTo(4.5, 10);
    expect(amplitudeAttendue(st(14, 2.48))).toBeCloseTo(0.3472, 4);
  });

  it("rend zéro pour une ligne qui ne pèse rien", () => {
    expect(amplitudeAttendue(st(0, 9))).toBe(0);
  });

  it("reste positif : c'est une amplitude, pas une direction", () => {
    // ⚠️ La statistique porte sur la valeur absolue des réactions passées : elle
    // dit de combien le titre bouge, pas dans quel sens. Mesuré sur TSLA, la
    // société a battu le consensus de +17,1 % et le titre a baissé de 3,56 %.
    expect(amplitudeAttendue(st(50, 9))).toBeGreaterThan(0);
    expect(libelleAmplitude(st(50, 9))).toBe("±4.50 %");
  });

  it("une exposition totale rend l'amplitude du titre inchangée", () => {
    expect(amplitudeAttendue(st(100, 3.2))).toBeCloseTo(3.2, 10);
  });
});

describe("porteUnImpact", () => {
  it("les résultats en portent un", () => {
    expect(porteUnImpact("resultats")).toBe(true);
  });

  it("un détachement de dividende n'en porte pas", () => {
    // ⚠️ Le cours perd le montant du dividende, mais la valeur n'est pas perdue :
    // elle passe du cours aux liquidités. Annoncer « −0,19 % attendu » ferait lire
    // une perte là où il n'y a qu'un transfert.
    expect(porteUnImpact("dividende")).toBe(false);
  });

  it("une publication économique n'en porte pas non plus", () => {
    // Son effet passe par le marché entier et non par une ligne : l'exposition
    // d'un titre ne le mesure pas.
    expect(porteUnImpact("economique")).toBe(false);
  });

  it("une nature inconnue n'en porte pas", () => {
    expect(porteUnImpact("autre")).toBe(false);
  });
});
