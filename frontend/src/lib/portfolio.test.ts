import { describe, it, expect } from "vitest";
import { arrange, assetClass, relativeDay, valoriser, gainPeriode,
  type GridAsset, type Position } from "./portfolio";

const a = (ticker: string, o: Partial<GridAsset> = {}): GridAsset => ({
  ticker, weight: 10, price: 100, change: 1, value: 1000, perfEur: 10, ...o,
});

describe("assetClass", () => {
  it("reconnaît une crypto à son suffixe", () => {
    expect(assetClass("BTC-USD")).toBe("Crypto");
    expect(assetClass("ETH-EUR")).toBe("Crypto");
  });

  it("reconnaît les ETF connus", () => {
    expect(assetClass("SPY")).toBe("ETF");
    expect(assetClass("CW8.PA")).toBe("ETF");
  });

  it("classe le reste en actions", () => {
    expect(assetClass("AAPL")).toBe("Actions");
    expect(assetClass("MC.PA")).toBe("Actions");
  });
});

describe("arrange", () => {
  it("« Tous » ne retire rien", () => {
    const list = [a("AAPL"), a("BTC-USD"), a("SPY")];
    expect(arrange(list, "Tous", "poids")).toHaveLength(3);
  });

  it("filtre par classe", () => {
    const list = [a("AAPL"), a("BTC-USD"), a("SPY")];
    expect(arrange(list, "Crypto", "poids").map(x => x.ticker)).toEqual(["BTC-USD"]);
  });

  it("trie par poids décroissant", () => {
    const list = [a("A", { weight: 5 }), a("B", { weight: 30 }), a("C", { weight: 12 })];
    expect(arrange(list, "Tous", "poids").map(x => x.ticker)).toEqual(["B", "C", "A"]);
  });

  it("trie par performance décroissante", () => {
    const list = [a("A", { change: -2 }), a("B", { change: 7 }), a("C", { change: 1 })];
    expect(arrange(list, "Tous", "perf").map(x => x.ticker)).toEqual(["B", "C", "A"]);
  });

  it("relègue en fin de liste un actif sans cours", () => {
    // Traiter un cours inconnu comme zéro l'aurait glissé entre les hausses et
    // les baisses, à la place d'un actif réellement stable.
    const list = [a("A", { change: -2 }), a("INCONNU", { change: null }), a("C", { change: 3 })];
    expect(arrange(list, "Tous", "perf").map(x => x.ticker)).toEqual(["C", "A", "INCONNU"]);
  });

  it("trie par valeur détenue", () => {
    const list = [a("A", { value: 100 }), a("B", { value: 900 })];
    expect(arrange(list, "Tous", "valeur")[0].ticker).toBe("B");
  });

  it("trie par nom", () => {
    const list = [a("MSFT"), a("AAPL"), a("NVDA")];
    expect(arrange(list, "Tous", "alpha").map(x => x.ticker)).toEqual(["AAPL", "MSFT", "NVDA"]);
  });

  it("ne modifie pas le tableau reçu", () => {
    // `sort` trie sur place : sans copie, l'ordre du state parent changeait à
    // chaque rendu, et React ne voyait pas de raison de rafraîchir.
    const list = [a("A", { weight: 5 }), a("B", { weight: 30 })];
    arrange(list, "Tous", "poids");
    expect(list.map(x => x.ticker)).toEqual(["A", "B"]);
  });

  it("accepte une liste vide", () => {
    expect(arrange([], "Tous", "poids")).toEqual([]);
  });
});

describe("relativeDay", () => {
  const now = new Date(2026, 6, 28, 15, 0, 0);

  it("nomme le jour même", () => {
    expect(relativeDay(new Date(2026, 6, 28, 9, 0).toISOString(), now)).toBe("Aujourd'hui");
  });

  it("nomme la veille", () => {
    expect(relativeDay(new Date(2026, 6, 27, 23, 0).toISOString(), now)).toBe("Hier");
  });

  it("compare des jours, pas des durées", () => {
    // Une transaction d'hier 23 h et un « maintenant » à 15 h sont séparés de
    // 16 heures : compter en heures l'aurait rangée dans « Aujourd'hui ».
    expect(relativeDay(new Date(2026, 6, 27, 23, 59).toISOString(), now)).toBe("Hier");
    expect(relativeDay(new Date(2026, 6, 28, 0, 1).toISOString(), now)).toBe("Aujourd'hui");
  });

  it("compte les jours dans la semaine", () => {
    expect(relativeDay(new Date(2026, 6, 25).toISOString(), now)).toBe("Il y a 3 jours");
  });

  it("passe à la date au-delà d'une semaine", () => {
    expect(relativeDay(new Date(2026, 6, 1).toISOString(), now)).toMatch(/juil/);
  });

  it("ne plante pas sur une date illisible", () => {
    expect(relativeDay("pas-une-date", now)).toBe("—");
  });
});


// ── Valorisation sur transactions ─────────────────────────────────────────────

const pos = (o: Partial<Position> = {}): Position => ({
  ticker: "AAPL", quantity: 10, avg_cost: 150, invested: 1500,
  current_price: 200, current_value: 2000, pnl_eur: 500, pnl_pct: 33.33,
  weight: 100, ...o,
});

describe("gainPeriode", () => {
  it("retranche la valeur de début de période", () => {
    // 1 100 € après +10 % : la ligne valait 1 000 €, le gain est de 100 €.
    expect(gainPeriode(1100, 10)).toBeCloseTo(100, 6);
  });

  it("ne confond pas gain et valeur sur une forte hausse", () => {
    // Le calcul fautif (valeur × variation) donnerait 5 000 × 400 = 2 000 000 €
    // sur un portefeuille de cinq mille euros.
    expect(gainPeriode(5000, 400)).toBeCloseTo(4000, 6);
  });

  it("rend null quand la variation manque ou dépasse -100 %", () => {
    expect(gainPeriode(1000, null)).toBeNull();
    expect(gainPeriode(null, 10)).toBeNull();
    expect(gainPeriode(1000, -100)).toBeNull();
  });
});

describe("valoriser", () => {
  it("valorise en quantité × cours, pas en poids × valeur totale", () => {
    const [l] = valoriser([pos()], { AAPL: { price: 200, change: 5 } });
    expect(l.value).toBe(2000);
    expect(l.price).toBe(200);
    expect(l.weight).toBe(100);
  });

  it("garde un actif détenu hors allocation cible", () => {
    // TSLA n'est dans aucun poids du portefeuille, mais il est détenu.
    const lignes = valoriser([pos(), pos({ ticker: "TSLA", weight: 40 })], {});
    expect(lignes.map(l => l.ticker)).toEqual(["AAPL", "TSLA"]);
  });

  it("omet un actif soldé, puisqu'il n'est plus une position", () => {
    // Le contrat porte sur ce que le backend renvoie : une ligne vendue en
    // totalité disparaît de /positions, donc de l'affichage.
    expect(valoriser([], {})).toEqual([]);
  });

  it("survit à un cours manquant", () => {
    const [l] = valoriser([pos({ current_price: null, current_value: null })], {});
    expect(l.price).toBeNull();
    expect(l.value).toBeNull();
    expect(l.perfEur).toBeNull();
  });

  it("prend la variation du flux de cours, pas celle des positions", () => {
    // /positions donne un P&L depuis l'achat ; la page affiche une variation
    // sur la période choisie. Les deux ne se confondent pas.
    const [l] = valoriser([pos()], { AAPL: { price: 200, change: -8 } });
    expect(l.change).toBe(-8);
    expect(l.perfEur!).toBeLessThan(0);
  });

  it("retombe sur le cours du flux si la position n'en porte pas", () => {
    const [l] = valoriser([pos({ current_price: null })], { AAPL: { price: 211, change: 1 } });
    expect(l.price).toBe(211);
  });
});
