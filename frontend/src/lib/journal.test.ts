import { describe, it, expect } from "vitest";
import {
  typesParOperation, resultats, resume, repartitionTypes, montant, parDate,
  type Tx,
} from "./journal";

let seq = 0;
const tx = (
  ticker: string, side: "BUY" | "SELL", quantity: number, unit_price: number,
  executed_at: string, fees = 0,
): Tx => ({
  id: ++seq, ticker, asset_type: "ETF", side, quantity, unit_price, fees,
  executed_at: `${executed_at}T00:00:00`,
});

describe("parDate", () => {
  it("classe du plus ancien au plus récent sans modifier l'entrée", () => {
    const a = tx("A", "BUY", 1, 10, "2026-03-01");
    const b = tx("A", "BUY", 1, 10, "2026-01-01");
    const entree = [a, b];
    expect(parDate(entree).map(t => t.id)).toEqual([b.id, a.id]);
    expect(entree.map(t => t.id)).toEqual([a.id, b.id]);
  });
});

describe("typesParOperation", () => {
  it("le premier achat ouvre, les suivants renforcent", () => {
    const t1 = tx("A", "BUY", 1, 10, "2026-01-01");
    const t2 = tx("A", "BUY", 1, 10, "2026-02-01");
    const types = typesParOperation([t1, t2]);
    expect(types[t1.id]).toBe("achat");
    expect(types[t2.id]).toBe("renforcement");
  });

  it("chaque titre a sa propre histoire", () => {
    const a = tx("A", "BUY", 1, 10, "2026-01-01");
    const b = tx("B", "BUY", 1, 10, "2026-02-01");
    const types = typesParOperation([a, b]);
    expect(types[b.id]).toBe("achat");
  });

  it("une vente totale referme la ligne : l'achat suivant en rouvre une", () => {
    const t1 = tx("A", "BUY", 10, 10, "2026-01-01");
    const t2 = tx("A", "SELL", 10, 12, "2026-02-01");
    const t3 = tx("A", "BUY", 5, 11, "2026-03-01");
    const types = typesParOperation([t1, t2, t3]);
    expect(types[t2.id]).toBe("vente");
    expect(types[t3.id]).toBe("achat");
  });

  it("une vente partielle laisse la ligne ouverte", () => {
    const t1 = tx("A", "BUY", 10, 10, "2026-01-01");
    const t2 = tx("A", "SELL", 4, 12, "2026-02-01");
    const t3 = tx("A", "BUY", 5, 11, "2026-03-01");
    expect(typesParOperation([t1, t2, t3])[t3.id]).toBe("renforcement");
  });

  it("se fie aux dates, pas à l'ordre de saisie", () => {
    const tard = tx("A", "BUY", 1, 10, "2026-06-01");
    const tot  = tx("A", "BUY", 1, 10, "2026-01-01");
    const types = typesParOperation([tard, tot]);
    expect(types[tot.id]).toBe("achat");
    expect(types[tard.id]).toBe("renforcement");
  });
});

describe("montant", () => {
  it("inclut les frais", () => {
    expect(montant(tx("A", "BUY", 10, 10, "2026-01-01", 2.5))).toBe(102.5);
  });
});

describe("resultats", () => {
  it("gain latent d'un achat, au cours du jour", () => {
    const t = tx("A", "BUY", 10, 10, "2026-01-01");
    const [r] = resultats([t], { A: 12 });
    expect(r.gain).toBeCloseTo(20, 6);
    expect(r.gainPct).toBeCloseTo(20, 6);
    expect(r.realise).toBe(false);
  });

  it("les frais grèvent le gain latent", () => {
    const t = tx("A", "BUY", 10, 10, "2026-01-01", 5);
    const [r] = resultats([t], { A: 11 });
    expect(r.gain).toBeCloseTo(110 - 105, 6);
  });

  it("cours inconnu : pas de gain inventé", () => {
    const [r] = resultats([tx("A", "BUY", 10, 10, "2026-01-01")], {});
    expect(r.gain).toBeNull();
    expect(r.gainPct).toBeNull();
  });

  it("une vente se mesure au prix de revient du moment", () => {
    // Achat 10 à 10 €, renfort 10 à 20 € → PRU 15 €. Vente à 18 € : perte.
    const a = tx("A", "BUY", 10, 10, "2026-01-01");
    const b = tx("A", "BUY", 10, 20, "2026-02-01");
    const v = tx("A", "SELL", 10, 18, "2026-03-01");
    const res = resultats([a, b, v], { A: 30 });
    const vente = res.find(r => r.tx.id === v.id)!;
    expect(vente.realise).toBe(true);
    expect(vente.gain).toBeCloseTo(10 * (18 - 15), 6);
  });

  it("le prix de revient d'une vente est celui d'alors, pas d'aujourd'hui", () => {
    // Un renfort *après* la vente ne doit pas changer le résultat de la vente.
    const a = tx("A", "BUY", 10, 10, "2026-01-01");
    const v = tx("A", "SELL", 5, 12, "2026-02-01");
    const c = tx("A", "BUY", 100, 50, "2026-03-01");
    const res = resultats([a, v, c], { A: 50 });
    expect(res.find(r => r.tx.id === v.id)!.gain).toBeCloseTo(5 * (12 - 10), 6);
  });
});

describe("resume", () => {
  const jour = (n: number) => new Date(2026, 0, n).toISOString().slice(0, 10);

  it("compte les opérations", () => {
    const txs = [tx("A", "BUY", 1, 10, jour(1)), tx("A", "BUY", 1, 10, jour(2))];
    expect(resume(txs, { A: 10 }).operations).toBe(2);
  });

  it("le capital investi retire ce qui a été revendu", () => {
    // 100 € placés, 60 € ressortis : 40 € restent engagés.
    const txs = [tx("A", "BUY", 10, 10, jour(1)), tx("A", "SELL", 6, 10, jour(2))];
    expect(resume(txs, { A: 10 }).capitalInvesti).toBeCloseTo(40, 6);
  });

  it("désigne la meilleure et la pire opération", () => {
    const bonne = tx("A", "BUY", 10, 10, jour(1));
    const mauvaise = tx("B", "BUY", 10, 10, jour(1));
    const r = resume([bonne, mauvaise], { A: 20, B: 5 });
    expect(r.meilleure!.tx.id).toBe(bonne.id);
    expect(r.pire!.tx.id).toBe(mauvaise.id);
  });

  it("pas de pire opération quand il n'y en a qu'une", () => {
    // La désigner à la fois meilleure et pire n'apprendrait rien.
    const r = resume([tx("A", "BUY", 10, 10, jour(1))], { A: 20 });
    expect(r.meilleure).not.toBeNull();
    expect(r.pire).toBeNull();
  });

  it("la durée de détention est pondérée par les montants", () => {
    // 1 000 € depuis 10 jours et 10 € depuis 200 jours : la moyenne doit
    // pencher vers 10, non se poser à 105.
    const now = new Date(2026, 6, 1);
    const gros  = tx("A", "BUY", 100, 10, new Date(2026, 5, 21).toISOString().slice(0, 10));
    const petit = tx("B", "BUY", 1, 10, new Date(2025, 11, 13).toISOString().slice(0, 10));
    const d = resume([gros, petit], { A: 10, B: 10 }, now).dureeMoyenneJours!;
    expect(d).toBeLessThan(20);
  });

  it("journal vide", () => {
    const r = resume([], {});
    expect(r.operations).toBe(0);
    expect(r.meilleure).toBeNull();
    expect(r.dureeMoyenneJours).toBeNull();
  });
});

describe("repartitionTypes", () => {
  it("les parts somment à 100", () => {
    const txs = [
      tx("A", "BUY", 1, 10, "2026-01-01"),
      tx("A", "BUY", 1, 10, "2026-02-01"),
      tx("A", "SELL", 1, 10, "2026-03-01"),
      tx("B", "BUY", 1, 10, "2026-04-01"),
    ];
    const r = repartitionTypes(txs);
    expect(r.reduce((s, x) => s + x.part, 0)).toBeCloseTo(100, 6);
    expect(r.find(x => x.type === "achat")!.nombre).toBe(2);
    expect(r.find(x => x.type === "renforcement")!.nombre).toBe(1);
  });

  it("n'affiche pas les types absents", () => {
    const r = repartitionTypes([tx("A", "BUY", 1, 10, "2026-01-01")]);
    expect(r.map(x => x.type)).toEqual(["achat"]);
  });

  it("journal vide", () => {
    expect(repartitionTypes([])).toEqual([]);
  });
});
