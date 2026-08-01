import { describe, it, expect } from "vitest";
import { donutArcs, gaugeArc, type Slice } from "./donut";

const geom = { cx: 50, cy: 50, r: 48, thickness: 15 };
const s = (key: string, value: number): Slice => ({ key, value, color: "#fff" });

describe("donutArcs", () => {
  it("rend un secteur par part", () => {
    expect(donutArcs([s("a", 30), s("b", 70)], geom)).toHaveLength(2);
  });

  it("les parts totalisent le tour complet", () => {
    const arcs = donutArcs([s("a", 30), s("b", 20), s("c", 50)], geom);
    expect(arcs.reduce((t, a) => t + a.share, 0)).toBeCloseTo(1, 9);
    expect(arcs[arcs.length - 1].to).toBeCloseTo(Math.PI * 2, 9);
  });

  it("normalise des poids qui ne font pas 100", () => {
    // Les pondérations saisies à la main totalisent rarement 100 pile.
    const arcs = donutArcs([s("a", 1), s("b", 1), s("c", 2)], geom);
    expect(arcs[0].share).toBeCloseTo(0.25, 9);
    expect(arcs[2].share).toBeCloseTo(0.5, 9);
  });

  it("les secteurs ne se chevauchent pas", () => {
    // L'écart entre parts est retiré au secteur, pas ajouté entre eux : ajouté,
    // la somme des angles dépassait le tour et la dernière part recouvrait la
    // première.
    const arcs = donutArcs([s("a", 33), s("b", 33), s("c", 34)], geom);
    for (let i = 1; i < arcs.length; i++) {
      expect(arcs[i].from).toBeCloseTo(arcs[i - 1].to, 9);
    }
  });

  it("une part unique produit un anneau fermé", () => {
    // Un arc de 360° a ses deux extrémités confondues : tracé d'un seul A, il
    // se réduit à un point et l'anneau disparaît.
    const arcs = donutArcs([s("seul", 100)], geom);
    expect(arcs).toHaveLength(1);
    expect(arcs[0].share).toBeCloseTo(1, 9);
    expect(arcs[0].path.match(/A/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("ignore les parts nulles", () => {
    const arcs = donutArcs([s("a", 50), s("vide", 0), s("b", 50)], geom);
    expect(arcs.map(a => a.key)).toEqual(["a", "b"]);
  });

  it("ignore les parts négatives", () => {
    const arcs = donutArcs([s("a", 50), s("negatif", -10)], geom);
    expect(arcs).toHaveLength(1);
    expect(arcs[0].share).toBeCloseTo(1, 9);
  });

  it("ne rend rien sans total", () => {
    expect(donutArcs([], geom)).toEqual([]);
    expect(donutArcs([s("a", 0)], geom)).toEqual([]);
  });

  it("pose le drapeau grand-arc au-delà d'un demi-tour", () => {
    // Sans lui, une part majoritaire se dessinait par le petit côté : l'anneau
    // apparaissait en négatif.
    const [gros] = donutArcs([s("gros", 80), s("petit", 20)], geom);
    expect(gros.path).toMatch(/A48,48 0 1 1/);
    const [, petit] = donutArcs([s("gros", 80), s("petit", 20)], geom);
    expect(petit.path).toMatch(/A48,48 0 0 1/);
  });

  it("ne produit aucune coordonnée NaN", () => {
    const arcs = donutArcs([s("a", 1), s("b", 2), s("c", 3)], geom);
    arcs.forEach(a => expect(a.path).not.toMatch(/NaN/));
  });

  it("supporte une épaisseur supérieure au rayon", () => {
    const arcs = donutArcs([s("a", 60), s("b", 40)], { ...geom, thickness: 80 });
    arcs.forEach(a => expect(a.path).not.toMatch(/NaN|-\d+\.\d+,-/));
  });
});

describe("gaugeArc", () => {
  const g = { cx: 34, cy: 32, r: 26 };

  it("le fond couvre le demi-cercle entier", () => {
    const { fond } = gaugeArc(50, g);
    // De la gauche (cx - r) à la droite (cx + r).
    expect(fond).toMatch(/^M8\.00,32\.00/);
    expect(fond).toMatch(/60\.00,32\.00$/);
  });

  it("la portion atteinte croît avec la valeur", () => {
    const x = (v: number) => parseFloat(gaugeArc(v, g).valeur.split(" ").pop()!.split(",")[0]);
    expect(x(25)).toBeLessThan(x(50));
    expect(x(50)).toBeLessThan(x(75));
  });

  it("à 100 la portion égale le fond", () => {
    const { fond, valeur } = gaugeArc(100, g);
    expect(valeur).toBe(fond);
  });

  it("à 0 aucun arc n'est tracé", () => {
    // Un arc de longueur nulle laissait un point parasite au départ du cadran.
    const { valeur } = gaugeArc(0, g);
    expect(valeur).not.toMatch(/A/);
  });

  it("borne les valeurs hors échelle", () => {
    expect(gaugeArc(140, g).valeur).toBe(gaugeArc(100, g).valeur);
    expect(gaugeArc(-20, g).valeur).toBe(gaugeArc(0, g).valeur);
  });

  it("ne produit pas de NaN sur une valeur invalide", () => {
    expect(gaugeArc(NaN, g).valeur).not.toMatch(/NaN/);
    expect(gaugeArc(Infinity, g).fond).not.toMatch(/NaN/);
  });

  it("pose le drapeau grand-arc au-delà de la moitié", () => {
    // Sans lui, une jauge à plus de 50 % se dessinait par le petit côté.
    expect(gaugeArc(80, g).valeur).toMatch(/A26,26 0 1 1/);
    expect(gaugeArc(30, g).valeur).toMatch(/A26,26 0 0 1/);
  });
});
