import { describe, it, expect } from "vitest";
import { trierActifs } from "./triActifs";

const A = (ticker: string) => ({ ticker });

describe("trierActifs : classer par capitalisation sans inventer de données", () => {
  const caps = { AAPL: 4.7e12, MSFT: 3.7e12, MC_PA: 2.2e11 };

  it("en pertinence, l'ordre reçu est rendu tel quel", () => {
    const liste = [A("MSFT"), A("AAPL")];
    expect(trierActifs(liste, "pertinence", caps).map(a => a.ticker)).toEqual(["MSFT", "AAPL"]);
  });

  it("en capitalisation, du plus gros au plus petit", () => {
    const liste = [A("MSFT"), A("MC_PA"), A("AAPL")];
    expect(trierActifs(liste, "capitalisation", caps).map(a => a.ticker))
      .toEqual(["AAPL", "MSFT", "MC_PA"]);
  });

  /**
   * ⚠️ **L'invariant qui empêche de mentir : un indice n'a pas de capitalisation nulle, il n'en
   * a pas du tout.** Le mettre à zéro le rangerait au même niveau que les plus petites valeurs
   * connues, en le mêlant à des mesures réelles.
   */
  it("un actif sans capitalisation passe à la fin, jamais au rang d'un zéro", () => {
    const liste = [A("^GSPC"), A("MC_PA"), A("AAPL")];
    expect(trierActifs(liste, "capitalisation", caps).map(a => a.ticker))
      .toEqual(["AAPL", "MC_PA", "^GSPC"]);
  });

  it("quand aucun n'a de capitalisation, l'ordre reçu est conservé", () => {
    const liste = [A("^GSPC"), A("^NDX"), A("^DJI")];
    expect(trierActifs(liste, "capitalisation", caps).map(a => a.ticker))
      .toEqual(["^GSPC", "^NDX", "^DJI"]);
  });

  /** ⚠️ Sans stabilité, deux inconnus permuteraient d'un rendu à l'autre : la liste tremblerait. */
  it("à égalité, l'ordre reçu tranche — le tri est stable", () => {
    const exaequo = { X: 100, Y: 100 };
    expect(trierActifs([A("Y"), A("X")], "capitalisation", exaequo).map(a => a.ticker))
      .toEqual(["Y", "X"]);
  });

  it("la liste reçue n'est jamais modifiée sur place", () => {
    const liste = [A("MSFT"), A("AAPL")];
    const copie = [...liste];
    trierActifs(liste, "capitalisation", caps);
    expect(liste).toEqual(copie);
  });

  it("une capitalisation manquante dans la table n'empêche pas les autres de se classer", () => {
    const liste = [A("INCONNU"), A("AAPL"), A("MSFT")];
    expect(trierActifs(liste, "capitalisation", caps).map(a => a.ticker))
      .toEqual(["AAPL", "MSFT", "INCONNU"]);
  });
});
