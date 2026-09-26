import { describe, it, expect } from "vitest";
import { cotes, emboitement } from "./emboitement";

describe("cotes", () => {
  it("déplie les quatre formes de l'abrégé CSS", () => {
    expect(cotes("6px")).toEqual({ haut: 6, droite: 6, bas: 6, gauche: 6 });
    expect(cotes("13px 15px")).toEqual({ haut: 13, droite: 15, bas: 13, gauche: 15 });
    expect(cotes("8px 12px 6px")).toEqual({ haut: 8, droite: 12, bas: 6, gauche: 12 });
    expect(cotes("1px 2px 3px 4px")).toEqual({ haut: 1, droite: 2, bas: 3, gauche: 4 });
  });

  it("accepte un nombre, comme React l'écrit", () => {
    expect(cotes(6)).toEqual({ haut: 6, droite: 6, bas: 6, gauche: 6 });
  });

  it("rend null sur ce qu'elle ne sait pas lire, plutôt qu'un faux zéro", () => {
    expect(cotes(undefined)).toBeNull();
    expect(cotes("1em")).toBeNull();
    expect(cotes("calc(100% - 4px)")).toBeNull();
    expect(cotes("1px 2px 3px 4px 5px")).toBeNull();
  });
});

describe("emboitement", () => {
  it("pose la pastille à six pixels du bord, filet compris", () => {
    // 13 × 15 plus un filet : 14 en haut, 16 sur les côtés, donc −8 et −10.
    expect(emboitement("13px 15px")).toEqual({
      "--nv-emboite-haut": "-8px",
      "--nv-emboite-droite": "-10px",
      "--nv-emboite-gauche": "-10px",
    });
  });

  it("suit un rembourrage à trois valeurs", () => {
    // Le graphique du tableau de bord : 8 en haut, 12 sur les côtés.
    expect(emboitement("8px 12px 6px")).toEqual({
      "--nv-emboite-haut": "-3px",
      "--nv-emboite-droite": "-7px",
      "--nv-emboite-gauche": "-7px",
    });
  });

  it("ne publie rien quand le rembourrage est illisible", () => {
    expect(emboitement(undefined)).toEqual({});
    expect(emboitement("2rem")).toEqual({});
  });
});
