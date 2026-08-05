import { describe, it, expect } from "vitest";
import { symboleBinance } from "./coursCrypto";

describe("symboleBinance", () => {
  it("traduit une paire en dollar", () => {
    expect(symboleBinance("BTC-USD")).toBe("btcusdt");
    expect(symboleBinance("ETH-USDT")).toBe("ethusdt");
  });

  it("suit la paire en dollar même pour une ligne en euro", () => {
    // Binance ne cote pas toutes les paires en euro. Suivre l'équivalent
    // dollar donne un cours en direct ; la conversion est un sujet distinct,
    // qui vaut pour tout le site et pas pour ce seul flux.
    expect(symboleBinance("BTC-EUR")).toBe("btcusdt");
  });

  it("ignore ce qui n'est pas une paire", () => {
    // Ces tickers passent par le sondage. Les envoyer à Binance ouvrirait un
    // flux qui ne répondrait jamais, et le prix sondé n'arriverait plus.
    for (const t of ["ESE.PA", "AAPL", "CW8.PA", "", "BTC"]) {
      expect(symboleBinance(t)).toBeNull();
    }
  });

  it("accepte la casse minuscule", () => {
    expect(symboleBinance("btc-usd")).toBe("btcusdt");
  });
});
