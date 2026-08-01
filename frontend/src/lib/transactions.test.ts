import { describe, it, expect } from "vitest";
import { repartir, sansCours, capitalEngage, arrondirCours, type Pondere } from "./transactions";

const A = (ticker: string, weight: number, type = "EQUITY"): Pondere =>
  ({ ticker, name: ticker, weight, type });

describe("repartir", () => {
  it("répartit au prorata des poids", () => {
    const lignes = repartir([A("AAPL", 60), A("MSFT", 40)], { AAPL: 100, MSFT: 200 }, 1000, "2024-03-15");
    expect(lignes).toHaveLength(2);
    expect(lignes[0].quantity).toBeCloseTo(6, 6);   // 600 € / 100
    expect(lignes[1].quantity).toBeCloseTo(2, 6);   // 400 € / 200
  });

  it("date chaque écriture à la date demandée", () => {
    const [l] = repartir([A("AAPL", 100)], { AAPL: 100 }, 1000, "2024-03-15");
    expect(l.executed_at).toBe("2024-03-15T00:00:00");
  });

  it("le capital engagé retombe sur le montant réparti", () => {
    const assets = [A("AAPL", 30), A("MSFT", 45), A("NVDA", 25)];
    const cours  = { AAPL: 170.9057, MSFT: 409.2387, NVDA: 87.6853 };
    const lignes = repartir(assets, cours, 10000, "2024-03-15");
    // À l'arrondi près : quantités à 1e-6, cours à 1e-2.
    expect(capitalEngage(lignes)).toBeCloseTo(10000, 0);
  });

  it("écarte les actifs sans cours plutôt que de produire une quantité infinie", () => {
    const assets = [A("AAPL", 50), A("XXXX", 50)];
    const lignes = repartir(assets, { AAPL: 100 }, 1000, "2024-03-15");
    expect(lignes.map(l => l.ticker)).toEqual(["AAPL"]);
    expect(lignes.every(l => Number.isFinite(l.quantity))).toBe(true);
    expect(sansCours(assets, { AAPL: 100 })).toEqual(["XXXX"]);
  });

  it("traite un cours nul comme un cours manquant", () => {
    expect(repartir([A("AAPL", 100)], { AAPL: 0 }, 1000, "2024-03-15")).toEqual([]);
    expect(sansCours([A("AAPL", 100)], { AAPL: 0 })).toEqual(["AAPL"]);
  });

  it("ne produit rien pour un montant nul ou négatif", () => {
    expect(repartir([A("AAPL", 100)], { AAPL: 100 }, 0, "2024-03-15")).toEqual([]);
    expect(repartir([A("AAPL", 100)], { AAPL: 100 }, -500, "2024-03-15")).toEqual([]);
  });

  it("met le ticker en majuscules et retient le type", () => {
    const [l] = repartir([{ ticker: "btc-usd", name: "Bitcoin", weight: 100, type: "CRYPTOCURRENCY" }],
      { "btc-usd": 60000 }, 1000, "2024-03-15");
    expect(l.ticker).toBe("BTC-USD");
    expect(l.asset_type).toBe("CRYPTOCURRENCY");
  });
});

describe("arrondirCours", () => {
  it("garde deux décimales au-dessus de l'euro", () => {
    expect(arrondirCours(170.90574)).toBe(170.91);
  });

  it("garde six décimales en dessous — sinon une part de shiba vaut 0", () => {
    expect(arrondirCours(0.00002481)).toBe(0.000025);
  });
});

describe("capitalEngage", () => {
  const ligne = (side: "BUY" | "SELL", qty: number, prix: number, fees = 0) =>
    ({ ticker: "AAPL", asset_type: "EQUITY", name: "Apple", side, quantity: qty,
       unit_price: prix, fees, executed_at: "2024-03-15T00:00:00" });

  it("ajoute les frais au capital engagé", () => {
    expect(capitalEngage([ligne("BUY", 10, 100, 5)])).toBe(1005);
  });

  it("déduit les ventes", () => {
    expect(capitalEngage([ligne("BUY", 10, 100), ligne("SELL", 4, 150)])).toBe(400);
  });

  it("vaut zéro sans écriture", () => {
    expect(capitalEngage([])).toBe(0);
  });
});
