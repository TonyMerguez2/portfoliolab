import { describe, expect, it } from "vitest";

import { ancresParJour, jourAncre } from "./reperes";

/** Une série journalière, telle que la rendent les fenêtres longues. */
const journalier = [
  { date: "2026-08-05", value: 100 },
  { date: "2026-08-06", value: 110 },
  { date: "2026-08-07", value: 120 },
];

/** Une série intraday, telle que la rendent les fenêtres 24 h et 1 M. */
const intraday = [
  { date: "2026-08-07T09:00:00+02:00", value: 100 },
  { date: "2026-08-07T12:00:00+02:00", value: 105 },
  { date: "2026-08-07T17:29:00+02:00", value: 120 },
];

const val = (p: { value: number }) => p.value;

describe("ancresParJour", () => {
  it("retient minuit sur une série journalière", () => {
    const a = ancresParJour(journalier, val);
    expect(a.get("2026-08-06")).toEqual({
      temps: Date.UTC(2026, 7, 6) / 1000, valeur: 110,
    });
  });

  it("retient l'horodatage réel de la barre sur une série intraday", () => {
    // Le défaut observé : la pastille était cherchée à minuit UTC, que la série
    // intraday ne contient pas. `timeToCoordinate` rendait null et la pastille
    // disparaissait — plus aucun repère d'achat sur la fenêtre d'un mois.
    const a = ancresParJour(intraday, val);
    const ancre = a.get("2026-08-07");
    expect(ancre?.temps).toBe(Date.parse("2026-08-07T17:29:00+02:00") / 1000);
    expect(ancre?.temps).not.toBe(Date.UTC(2026, 7, 7) / 1000);
  });

  it("garde le dernier point de la journée, celui dont la valeur est affichée", () => {
    expect(ancresParJour(intraday, val).get("2026-08-07")?.valeur).toBe(120);
  });

  it("applique l'ordonnée fournie plutôt que la valeur brute", () => {
    // La courbe est mise à l'échelle du total affiché : la pastille doit suivre
    // la même, sinon elle glisse par rapport au point qu'elle annote.
    const a = ancresParJour(journalier, p => p.value * 2);
    expect(a.get("2026-08-07")?.valeur).toBe(240);
  });

  it("ignore une date illisible plutôt que de placer un repère à NaN", () => {
    const a = ancresParJour([{ date: "pas une date", value: 1 }, ...journalier], val);
    expect(a.size).toBe(3);
  });
});

describe("jourAncre", () => {
  const jours = journalier.map(p => p.date);

  it("tombe sur le jour même quand il est coté", () => {
    expect(jourAncre("2026-08-06", jours)).toBe("2026-08-06");
  });

  it("franchit un week-end vers le jour coté suivant", () => {
    // Une écriture passée un samedi n'a pas de point à elle.
    expect(jourAncre("2026-08-04", ["2026-08-05", "2026-08-06"])).toBe("2026-08-05");
  });

  it("écarte une écriture antérieure à la fenêtre au lieu de la rapprocher", () => {
    // Le défaut observé : la page transmet toutes les transactions, sans filtre
    // de période. Sur la fenêtre de trois mois d'un PEA ouvert en février, les
    // écritures de février s'empilaient sur le premier jour affiché.
    expect(jourAncre("2026-02-10", jours)).toBeNull();
  });

  it("écarte une écriture postérieure à la fenêtre", () => {
    expect(jourAncre("2026-09-01", jours)).toBeNull();
  });

  it("ne place rien sur une série vide", () => {
    expect(jourAncre("2026-08-06", [])).toBeNull();
  });

  it("accepte le premier jour de la fenêtre, qui est dedans", () => {
    expect(jourAncre("2026-08-05", jours)).toBe("2026-08-05");
  });

  it("franchit le plus long pont, du vendredi saint au mardi", () => {
    // Pâques 2026 : vendredi saint le 3 avril, lundi de Pâques le 6. Une
    // écriture du vendredi 3 se reporte au mardi 7, soit quatre jours.
    expect(jourAncre("2026-04-03", ["2026-04-07", "2026-04-08"])).toBe("2026-04-07");
  });

  it("refuse un report plus long que le plus long pont", () => {
    expect(jourAncre("2026-04-02", ["2026-04-07"])).toBeNull();
  });

  it("écarte une écriture tombée dans une longue suspension de cotation", () => {
    // Le seuil vaut aussi au milieu de la série : une écriture passée pendant
    // trois semaines sans cours ne doit pas se poser à la reprise.
    expect(jourAncre("2026-08-10", ["2026-08-05", "2026-09-01"])).toBeNull();
  });
});
