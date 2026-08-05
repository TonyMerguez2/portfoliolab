import { describe, it, expect } from "vitest";
import { initiale } from "./initiale";

describe("initiale", () => {
  it("prend la première lettre, en capitale", () => {
    expect(initiale("Sacha Dupuis PEA")).toBe("S");
    expect(initiale("livret A")).toBe("L");
  });

  it("saute ce qui ne porte pas d'identité", () => {
    // Sans cela, la vignette afficherait un tiret ou une parenthèse — ce que
    // personne n'écrit volontairement sur un avatar.
    expect(initiale("— PEA")).toBe("P");
    expect(initiale("(ancien) Livret")).toBe("A");
    expect(initiale("   Croissance")).toBe("C");
    expect(initiale("#tech")).toBe("T");
  });

  it("garde les accents et leur casse", () => {
    expect(initiale("épargne")).toBe("É");
    expect(initiale("Ökonomie")).toBe("Ö");
  });

  it("accepte un chiffre", () => {
    expect(initiale("2024 — long terme")).toBe("2");
  });

  it("gère les écritures sans casse", () => {
    // Le jeu écarté est décrit en négatif précisément pour ces cas : un test
    // « est-ce une lettre ? » fondé sur la casse les rejetterait tous.
    expect(initiale("投资组合")).toBe("投");
    expect(initiale("محفظة")).toBe("م");
    expect(initiale("Пенсия")).toBe("П");
  });

  it("ne coupe pas une paire de substitution", () => {
    // Rendre une demi-paire afficherait le losange de remplacement du
    // navigateur, ce qui ressemble à un bug et n'en serait pas loin.
    const r = initiale("🚀 Croissance");
    expect(r).toBe("🚀");
    expect(r.length).toBe(2);
  });

  it("se replie quand il n'y a rien à prendre", () => {
    expect(initiale("")).toBe("◆");
    expect(initiale("   ")).toBe("◆");
    expect(initiale("--- ...")).toBe("◆");
    expect(initiale(undefined as unknown as string)).toBe("◆");
  });
});
