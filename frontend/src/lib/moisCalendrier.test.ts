import { describe, expect, it } from "vitest";

import { decalerMois, grilleDuMois } from "./moisCalendrier";

describe("grilleDuMois", () => {
  it("rend toujours six semaines", () => {
    // ⚠️ Un mois en occupe quatre à six. Rendre le compte juste ferait changer la
    // hauteur du panneau à chaque flèche.
    for (let m = 0; m < 12; m++) expect(grilleDuMois(2026, m)).toHaveLength(42);
    expect(grilleDuMois(2026, 1)).toHaveLength(42);   // février, 28 jours
    expect(grilleDuMois(2028, 1)).toHaveLength(42);   // février bissextile
  });

  it("commence le lundi, y compris pour un mois ouvrant un dimanche", () => {
    // ⚠️ `getDay()` rend 0 pour dimanche : l'utiliser tel quel décalerait toute la
    // grille. Le 1er novembre 2026 est un dimanche.
    const g = grilleDuMois(2026, 10);
    expect(new Date(g[0].iso + "T12:00:00").getDay()).toBe(1);   // lundi
    // Le dimanche 1er novembre doit tomber dans la première semaine, en 7e case.
    expect(g[6].iso).toBe("2026-11-01");
    expect(g[6].duMois).toBe(true);
  });

  it("emprunte au mois précédent et au suivant, en les marquant", () => {
    // Mai 2026 commence un vendredi : la grille ouvre sur le 27 avril.
    const g = grilleDuMois(2026, 4);
    expect(g[0].iso).toBe("2026-04-27");
    expect(g[0].duMois).toBe(false);
    expect(g.find(c => c.iso === "2026-05-01")?.duMois).toBe(true);
    expect(g[41].duMois).toBe(false);
  });

  it("contient chaque jour du mois, une fois", () => {
    const g = grilleDuMois(2026, 1).filter(c => c.duMois);
    expect(g).toHaveLength(28);
    expect(new Set(g.map(c => c.iso)).size).toBe(28);
  });

  it("franchit un changement d'heure sans perdre ni doubler un jour", () => {
    // ⚠️ Le passage à l'heure d'été a lieu fin mars en Europe. Un calcul par
    // ajout de 24 heures y perdrait ou doublerait une journée ; l'ajout se fait
    // donc en jours de calendrier.
    const g = grilleDuMois(2026, 2).filter(c => c.duMois);
    expect(g).toHaveLength(31);
    expect(g.map(c => c.jour)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
  });

  it("aligne les jours consécutivement, sans trou", () => {
    const g = grilleDuMois(2026, 7);
    for (let i = 1; i < g.length; i++) {
      const veille = new Date(g[i - 1].iso + "T12:00:00");
      const jour = new Date(g[i].iso + "T12:00:00");
      expect(Math.round((+jour - +veille) / 86400000)).toBe(1);
    }
  });
});

describe("decalerMois", () => {
  it("recule de janvier vers décembre de l'année précédente", () => {
    expect(decalerMois(2026, 0, -1)).toEqual([2025, 11]);
  });

  it("avance de décembre vers janvier de l'année suivante", () => {
    expect(decalerMois(2026, 11, 1)).toEqual([2027, 0]);
  });

  it("ne bouge pas sans pas", () => {
    expect(decalerMois(2026, 5, 0)).toEqual([2026, 5]);
  });

  it("supporte un grand écart dans les deux sens", () => {
    expect(decalerMois(2026, 0, -14)).toEqual([2024, 10]);
    expect(decalerMois(2026, 0, 25)).toEqual([2028, 1]);
  });
});
