import { describe, it, expect } from "vitest";
import { styleClignotement, DUREE_CLIGNOTEMENT } from "./clignotement";

describe("styleClignotement", () => {
  it("ne pose aucune animation au repos", () => {
    const s = styleClignotement(null, "#FFF");
    expect(s.animation).toBeUndefined();
    expect(s.color).toBe("#FFF");
  });

  it("nomme l'animation selon le sens", () => {
    expect(styleClignotement("hausse", "#FFF").animation).toContain("nv-clignote-hausse");
    expect(styleClignotement("baisse", "#FFF").animation).toContain("nv-clignote-baisse");
  });

  it("cale la durée CSS sur celle du minuteur", () => {
    // Les deux se règlent séparément : une animation plus longue que le
    // minuteur se ferait couper net, plus courte laisserait le nombre revenu
    // à sa couleur bien avant que l'état ne se vide.
    expect(styleClignotement("hausse", "#FFF").animation).toContain(`${DUREE_CLIGNOTEMENT}ms`);
  });

  it("transporte la couleur de repos jusqu'à l'animation", () => {
    // C'est elle qui décide de la couleur d'arrivée. Sans elle, un cours de
    // carte d'actif — blanc cassé — finirait à l'encre du thème.
    const s = styleClignotement("hausse", "rgba(255,255,255,0.94)") as Record<string, string>;
    expect(s["--nv-repos"]).toBe("rgba(255,255,255,0.94)");
    expect(s.color).toBe("rgba(255,255,255,0.94)");
  });
});
