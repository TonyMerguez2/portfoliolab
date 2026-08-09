import { describe, expect, it } from "vitest";

import { cleSource, serieAJeter, type SourceSerie } from "./sourceSerie";

const pea: SourceSerie = {
  periode: "max",
  portfolioId: "a411e18f-e71b-45e4-9aa1-ce6489362adc",
  tickers: ["ESE.PA", "ETZ.PA", "AAXJ"],
  surTransactions: true,
};

describe("cleSource", () => {
  it("distingue deux périodes du même portefeuille", () => {
    expect(cleSource(pea)).not.toBe(cleSource({ ...pea, periode: "1d" }));
  });

  it("distingue deux portefeuilles sur la même période", () => {
    const crypto = { ...pea, portfolioId: "3e06c1f5-0713-4a24-b6ca-b20e66490eee" };
    expect(cleSource(pea)).not.toBe(cleSource(crypto));
  });

  it("ignore l'ordre des tickers en mode suivi, l'identifiant tranchant seul", () => {
    expect(cleSource(pea)).toBe(cleSource({ ...pea, tickers: ["AAXJ"] }));
  });

  it("retombe sur les tickers hors suivi par transactions", () => {
    const libre = { periode: "max", tickers: ["AAPL", "MSFT"] };
    expect(cleSource(libre)).toBe("max|AAPL,MSFT");
    expect(cleSource(libre)).not.toBe(cleSource({ ...libre, tickers: ["AAPL"] }));
  });

  it("retombe sur les tickers si l'identifiant manque, même en mode suivi", () => {
    const sansId = { periode: "max", tickers: ["AAPL"], surTransactions: true };
    expect(cleSource(sansId)).toBe("max|AAPL");
  });
});

describe("serieAJeter", () => {
  it("jette la série quand on change de portefeuille sans changer de période", () => {
    // Le défaut observé : le composant n'étant pas remonté, la courbe de crypto
    // restait à l'écran, et son axe de 118 000 à 124 000 € devant 5 304 €.
    const crypto = { ...pea, portfolioId: "3e06c1f5-0713-4a24-b6ca-b20e66490eee" };
    expect(serieAJeter(crypto, pea)).toBe(true);
  });

  it("jette la série quand on change de période", () => {
    expect(serieAJeter(pea, { ...pea, periode: "1y" })).toBe(true);
  });

  it("garde la série quand seuls les cours ont bougé", () => {
    // Les poids ne font pas partie de la clé : sans cela le graphique
    // blanchirait toutes les dix secondes.
    expect(serieAJeter(pea, { ...pea })).toBe(false);
  });
});
