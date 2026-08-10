import { describe, expect, it } from "vitest";

import { cleEcheance, limiterMacro, macroEcartees, MACRO_DANS_TOUS } from "./echeances";

describe("cleEcheance", () => {
  /**
   * La collision réellement mesurée sur un PEA le 26 août 2026 : le relevé officiel
   * annonce les revenus des ménages, le flux du fournisseur annonce la croissance du
   * trimestre. Même nature, même zone, même date, aucun fonds.
   */
  const PCE = {
    nature: "economique", date: "2026-08-26", ticker: "USA", via: null,
    libelle: "Revenus et dépenses des ménages · PCE (juillet)",
  };
  const PIB = {
    nature: "economique", date: "2026-08-26", ticker: "USA", via: null,
    libelle: "Croissance · PIB (T2)",
  };

  it("distingue deux publications de la même zone le même jour", () => {
    expect(cleEcheance(PCE)).not.toBe(cleEcheance(PIB));
  });

  it("aurait confondu ces deux-là sans le libellé", () => {
    // ⚠️ Le test qui dit ce qui était cassé. L'ancienne clé, reconstituée à la main.
    const ancienne = (e: typeof PCE) =>
      `${e.nature}:${e.ticker ?? ""}:${e.date}:${e.via ?? ""}`;
    expect(ancienne(PCE)).toBe(ancienne(PIB));
  });

  it("distingue un même titre vu par deux fonds différents", () => {
    const a = { nature: "resultats", date: "2026-10-29", ticker: "ASML.AS", via: "ETZ.PA" };
    const b = { nature: "resultats", date: "2026-10-29", ticker: "ASML.AS", via: "CW8.PA" };
    expect(cleEcheance(a)).not.toBe(cleEcheance(b));
  });

  it("reste stable d'un rendu au suivant pour la même échéance", () => {
    // Une clé qui changerait à chaque rendu — un index, un compteur — referait le
    // nœud à chaque fois et détruirait l'état de la ligne.
    expect(cleEcheance(PCE)).toBe(cleEcheance({ ...PCE }));
  });

  it("supporte les champs absents sans confondre deux dates", () => {
    expect(cleEcheance({ date: "2026-08-26" }))
      .not.toBe(cleEcheance({ date: "2026-08-27" }));
  });
});

const e = (nature: string, date: string) => ({ nature, date });

/** Le cas réel qui a motivé le fichier : onze macro avant le premier résultat. */
const REEL = [
  e("economique", "2026-08-11"), e("economique", "2026-08-11"),
  e("economique", "2026-08-12"), e("economique", "2026-08-12"),
  e("economique", "2026-08-13"), e("economique", "2026-08-14"),
  e("economique", "2026-08-14"), e("economique", "2026-08-14"),
  e("economique", "2026-08-18"), e("economique", "2026-08-19"),
  e("economique", "2026-08-19"),
  e("resultats", "2026-08-20"),          // 9988.HK
  e("economique", "2026-08-26"),
  e("resultats", "2026-08-26"),          // NVDA
];

describe("limiterMacro", () => {
  it("laisse passer tout ce qui n'est pas macro", () => {
    const l = [e("resultats", "2026-08-20"), e("dividende", "2026-08-21")];
    expect(limiterMacro(l)).toEqual(l);
  });

  it("garde les deux macro les plus proches et écarte les suivantes", () => {
    const r = limiterMacro(REEL);
    expect(r.filter(x => x.nature === "economique")).toHaveLength(MACRO_DANS_TOUS);
    expect(r.filter(x => x.nature === "economique").map(x => x.date))
      .toEqual(["2026-08-11", "2026-08-11"]);
  });

  it("rend visibles les résultats du portefeuille, ce qui est tout le but", () => {
    // ⚠️ Le test qui dit pourquoi ce fichier existe. Sans limitation, les six
    // premières lignes de la liste sont six échéances macro et le portefeuille
    // n'apparaît pas.
    expect(REEL.slice(0, 6).some(x => x.nature === "resultats")).toBe(false);
    expect(limiterMacro(REEL).slice(0, 6).some(x => x.nature === "resultats"))
      .toBe(true);
  });

  it("conserve l'ordre reçu", () => {
    const r = limiterMacro(REEL);
    expect(r.map(x => x.date)).toEqual([...r.map(x => x.date)].sort());
  });

  it("ne retire rien quand la macro est déjà rare", () => {
    const l = [e("economique", "2026-08-12"), e("resultats", "2026-08-20")];
    expect(limiterMacro(l)).toEqual(l);
  });

  it("accepte de tout retirer si on le demande", () => {
    expect(limiterMacro(REEL, 0).every(x => x.nature !== "economique")).toBe(true);
  });

  it("ne change rien à une liste vide", () => {
    expect(limiterMacro([])).toEqual([]);
  });
});

describe("macroEcartees", () => {
  it("compte ce qui manque, pour pouvoir le dire", () => {
    // Douze macro dans la liste réelle, deux montrées : dix écartées.
    expect(macroEcartees(REEL)).toBe(10);
  });

  it("ne compte rien quand rien n'est écarté", () => {
    expect(macroEcartees([e("economique", "2026-08-12")])).toBe(0);
    expect(macroEcartees([])).toBe(0);
  });

  it("ne descend jamais sous zéro", () => {
    expect(macroEcartees([e("resultats", "2026-08-20")], 5)).toBe(0);
  });
});
