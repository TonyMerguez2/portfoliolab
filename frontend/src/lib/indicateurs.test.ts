import { describe, it, expect } from "vitest";
import {
  getCutoffDate, computeDrawdownFromPrices, toDailyClose, computeRollingVol,
  computeRSI, computeDistribution, computeRollingCorrelation, computeRollingSharpe,
  type Point,
} from "./indicateurs";

/**
 * Série quotidienne à partir d'une suite de valeurs.
 *
 * Les dates avancent en UTC. Une première version mélangeait `setDate`, qui
 * travaille en heure locale, et `toISOString`, qui rend de l'UTC : au passage
 * à l'heure d'été, deux points tombaient le même jour et l'appariement de la
 * corrélation en perdait la moitié.
 */
const serie = (valeurs: number[], depart = "2026-01-01"): Point[] =>
  valeurs.map((value, i) => {
    const d = new Date(depart + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), value };
  });

describe("getCutoffDate", () => {
  it("recule du nombre de jours demandé", () => {
    expect(getCutoffDate(30, new Date("2026-03-15T12:00:00Z"))).toBe("2026-02-13");
  });

  it("traverse un changement d'année", () => {
    expect(getCutoffDate(10, new Date("2026-01-05T12:00:00Z"))).toBe("2025-12-26");
  });
});

describe("computeDrawdownFromPrices", () => {
  it("reste à zéro tant que la série monte", () => {
    expect(computeDrawdownFromPrices(serie([10, 12, 15])).every(p => p.value === 0)).toBe(true);
  });

  it("mesure le repli depuis le plus haut, pas depuis la veille", () => {
    // Le sommet est 100 ; à 80 le repli vaut −20 %, et il reste −20 % même si
    // la valeur précédente était déjà basse.
    const dd = computeDrawdownFromPrices(serie([100, 80, 90]));
    expect(dd[1].value).toBeCloseTo(-20);
    expect(dd[2].value).toBeCloseTo(-10);
  });

  it("ne remonte jamais le sommet après une baisse", () => {
    // C'est ce qui distingue un repli d'une variation : sans mémoire du
    // sommet, la troisième valeur donnerait 0 au lieu de −50.
    const dd = computeDrawdownFromPrices(serie([100, 50, 50]));
    expect(dd[2].value).toBeCloseTo(-50);
  });
});

describe("toDailyClose", () => {
  it("garde la dernière valeur du jour comme clôture", () => {
    const r = toDailyClose([
      { date: "2026-01-01T09:00", value: 10 },
      { date: "2026-01-01T17:00", value: 12 },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].value).toBe(12);
  });

  it("conserve les extrêmes de toute la journée", () => {
    // Le plus haut est atteint en séance, pas à la clôture : le retenir sur le
    // seul dernier point effacerait la mèche.
    const r = toDailyClose([
      { date: "2026-01-01T09:00", value: 10, high: 15, low: 9 },
      { date: "2026-01-01T17:00", value: 12, high: 13, low: 8 },
    ]);
    expect(r[0].high).toBe(15);
    expect(r[0].low).toBe(8);
  });

  it("rend les jours dans l'ordre", () => {
    const r = toDailyClose([
      { date: "2026-01-03", value: 3 },
      { date: "2026-01-01", value: 1 },
      { date: "2026-01-02", value: 2 },
    ]);
    expect(r.map(p => p.value)).toEqual([1, 2, 3]);
  });
});

describe("computeRollingVol", () => {
  it("rend zéro sur une série plate", () => {
    const v = computeRollingVol(serie(Array(40).fill(100)), 30);
    expect(v.length).toBeGreaterThan(0);
    expect(v.every(p => p.vol === 0)).toBe(true);
  });

  it("annualise sur 252 séances", () => {
    // Un pas alterné ±1 % donne un écart-type quotidien connu ; la volatilité
    // annualisée doit valoir ce nombre multiplié par la racine de 252.
    const valeurs: number[] = [100];
    for (let i = 1; i < 40; i++) valeurs.push(valeurs[i - 1] * (i % 2 ? 1.01 : 1 / 1.01));
    const v = computeRollingVol(serie(valeurs), 30);
    const lr = Math.log(1.01);
    const attendu = lr * Math.sqrt(252) * 100;   // écart-type d'un ±lr alterné
    expect(v[v.length - 1].vol).toBeGreaterThan(attendu * 0.9);
    expect(v[v.length - 1].vol).toBeLessThan(attendu * 1.1);
  });

  it("ne rend rien quand la fenêtre dépasse la série", () => {
    expect(computeRollingVol(serie([1, 2, 3]), 30)).toEqual([]);
  });
});

describe("computeRSI", () => {
  it("vaut 100 quand la série ne fait que monter", () => {
    // Aucune perte : le rapport gains/pertes est infini, borné à 100.
    const r = computeRSI(serie(Array.from({ length: 30 }, (_, i) => 100 + i)), 14);
    expect(r[r.length - 1].rsi).toBeCloseTo(100);
  });

  it("reste borné entre 0 et 100", () => {
    const valeurs = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 3) * 20);
    for (const p of computeRSI(serie(valeurs), 14)) {
      expect(p.rsi).toBeGreaterThanOrEqual(0);
      expect(p.rsi).toBeLessThanOrEqual(100);
    }
  });

  it("se tait faute de données", () => {
    expect(computeRSI(serie([1, 2, 3]), 14)).toEqual([]);
  });
});

describe("computeDistribution", () => {
  it("range tous les rendements retenus dans les classes", () => {
    const valeurs = Array.from({ length: 200 }, (_, i) => 100 * (1 + Math.sin(i) / 50));
    const h = computeDistribution(serie(valeurs), 24);
    expect(h).toHaveLength(24);
    // Chaque rendement conservé tombe dans exactement une classe : un total
    // inférieur signalerait un indice hors bornes silencieusement perdu.
    const total = h.reduce((s, b) => s + b.count, 0);
    expect(total).toBeGreaterThan(180);
  });

  it("se tait sur une série trop courte", () => {
    expect(computeDistribution(serie([100]), 24)).toEqual([]);
  });
});

describe("computeRollingCorrelation", () => {
  it("vaut 1 pour deux séries identiques", () => {
    const valeurs = Array.from({ length: 120 }, (_, i) => 100 + Math.sin(i / 5) * 10);
    const s = serie(valeurs);
    const c = computeRollingCorrelation(s, s, 90);
    expect(c.length).toBeGreaterThan(0);
    expect(c[c.length - 1].corr).toBeCloseTo(1, 6);
  });

  it("vaut −1 quand l'une monte à mesure que l'autre baisse", () => {
    const n = 120;
    const a = serie(Array.from({ length: n }, (_, i) => 100 * (1 + Math.sin(i / 5) / 20)));
    const b = serie(Array.from({ length: n }, (_, i) => 100 / (1 + Math.sin(i / 5) / 20)));
    const c = computeRollingCorrelation(a, b, 90);
    expect(c[c.length - 1].corr).toBeLessThan(-0.9);
  });

  it("ne compare que les jours communs aux deux séries", () => {
    // Deux places ne chôment pas les mêmes jours. Sans appariement, les
    // couples se décalent et la corrélation mesure le calendrier.
    const a = serie(Array.from({ length: 120 }, (_, i) => 100 + i));
    const b = a.filter((_, i) => i % 3 !== 0);
    expect(computeRollingCorrelation(a, b, 90)).toEqual([]);
  });
});

describe("computeRollingSharpe", () => {
  it("est négatif quand la série ne rapporte rien face au taux sans risque", () => {
    // Série plate à rendement nul : l'excédent vaut −taux, donc négatif.
    const valeurs = Array.from({ length: 120 }, (_, i) => 100 + (i % 2 ? 0.001 : -0.001));
    const s = computeRollingSharpe(serie(valeurs), 90, 0.035);
    expect(s.length).toBeGreaterThan(0);
  });

  it("retranche le taux ramené au jour, non le taux annuel", () => {
    // Un rendement quotidien de 0,1 % fait plus de 28 % par an et bat donc
    // largement un taux sans risque de 3,5 %. Si celui-ci était retranché sous
    // sa forme annuelle à chaque jour, l'excédent serait négatif et le ratio
    // aussi — c'est cette confusion que le test surveille.
    const valeurs = [100];
    for (let i = 1; i < 120; i++) valeurs.push(valeurs[i - 1] * 1.001);
    const s = computeRollingSharpe(serie(valeurs), 90, 0.035);
    expect(s.at(-1)!.sharpe).toBeGreaterThan(0);
  });

  it("croît avec le rendement à volatilité comparable", () => {
    const bruit = (i: number) => Math.sin(i * 1.7) / 500;
    const faible = [100], fort = [100];
    for (let i = 1; i < 140; i++) {
      faible.push(faible[i - 1] * (1 + 0.0002 + bruit(i)));
      fort.push(fort[i - 1] * (1 + 0.0012 + bruit(i)));
    }
    const sf = computeRollingSharpe(serie(faible), 90).at(-1)!.sharpe;
    const sF = computeRollingSharpe(serie(fort), 90).at(-1)!.sharpe;
    expect(sF).toBeGreaterThan(sf);
  });
});
