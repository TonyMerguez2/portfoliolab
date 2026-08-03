import { describe, it, expect } from "vitest";
import {
  hexVersRvb, rvbVersHex, rvbVersTsl, tslVersRvb, pourFondSombre, poidsGroupe,
  CLARTE_MIN, CLARTE_MAX, SATURATION_MIN,
} from "./couleur";

describe("conversions", () => {
  it("hex et rvb font l'aller-retour", () => {
    expect(rvbVersHex(hexVersRvb("#5B8DEF"))).toBe("#5b8def");
  });

  it("tolère l'absence de dièse et la casse", () => {
    expect(hexVersRvb("5b8def")).toEqual([91, 141, 239]);
    expect(hexVersRvb("#5B8DEF")).toEqual([91, 141, 239]);
  });

  it("retombe sur le bleu par défaut si la chaîne est illisible", () => {
    expect(hexVersRvb("pas une couleur")).toEqual([91, 141, 239]);
  });

  it("tsl et rvb font l'aller-retour", () => {
    for (const hex of ["#5b8def", "#e31937", "#76b900", "#70c7ba", "#404040"]) {
      const rvb = hexVersRvb(hex);
      const retour = tslVersRvb(rvbVersTsl(rvb)).map(Math.round);
      expect(retour).toEqual(rvb);
    }
  });

  it("le blanc et le noir n'ont pas de teinte", () => {
    expect(rvbVersTsl([255, 255, 255])[1]).toBe(0);
    expect(rvbVersTsl([0, 0, 0])[1]).toBe(0);
  });
});

describe("pourFondSombre", () => {
  const tsl = (hex: string) => rvbVersTsl(hexVersRvb(hex));

  it("éclaircit une couleur trop sombre", () => {
    // Le brun du pelage de WIF : lisible sur blanc, invisible sur noir.
    const avant = tsl("#4a3220");
    const apres = tsl(pourFondSombre("#4a3220"));
    expect(avant[2]).toBeLessThan(CLARTE_MIN);
    expect(apres[2]).toBeGreaterThanOrEqual(CLARTE_MIN - 1e-6);
  });

  it("assombrit une couleur trop claire", () => {
    const apres = tsl(pourFondSombre("#fff3d0"));
    expect(apres[2]).toBeLessThanOrEqual(CLARTE_MAX + 1e-6);
  });

  it("ne touche pas à la teinte", () => {
    // Mesuré en degrés : l'aller-retour par des entiers 8 bits en déplace une
    // fraction, et un demi-degré ne se voit pas. Exprimer la tolérance en tours
    // la rendait illisible.
    const degres = (t: number) => t * 360;
    for (const hex of ["#4a3220", "#70c7ba", "#e31937", "#fff3d0"]) {
      const ecart = Math.abs(degres(tsl(pourFondSombre(hex))[0]) - degres(tsl(hex)[0]));
      expect(ecart).toBeLessThan(1);
    }
  });

  it("relève une couleur délavée mais colorée", () => {
    // #6b7f9a est un bleu éteint — saturation 0,18, au-dessus du seuil de gris.
    const apres = tsl(pourFondSombre("#6b7f9a"));
    expect(apres[1]).toBeGreaterThanOrEqual(SATURATION_MIN - 1e-6);
  });

  it("un quasi-gris reste sous le seuil et n'est pas coloré", () => {
    // #8a8f96 n'a que 5 % de saturation : le saturer inventerait un bleu.
    expect(tsl("#8a8f96")[1]).toBeLessThan(0.08);
    expect(tsl(pourFondSombre("#8a8f96"))[1]).toBeLessThan(0.08);
  });

  it("laisse un gris gris", () => {
    /**
     * Saturer un gris lui donnerait une teinte tirée du bruit de l'image :
     * deux logos gris deviendraient l'un rouge, l'autre vert, sans raison.
     */
    const apres = tsl(pourFondSombre("#7a7a7a"));
    expect(apres[1]).toBeLessThan(0.08);
  });

  it("laisse intacte une couleur déjà dans les bornes", () => {
    const dedans = "#5b8def";
    const [h, s, l] = tsl(dedans);
    expect(l).toBeGreaterThan(CLARTE_MIN);
    expect(l).toBeLessThan(CLARTE_MAX);
    const apres = tsl(pourFondSombre(dedans));
    expect(apres[0]).toBeCloseTo(h, 5);
    expect(apres[1]).toBeCloseTo(s, 2);
  });

  it("rend toute couleur lisible sur fond sombre", () => {
    for (const hex of ["#000000", "#0a0a0a", "#4a3220", "#1b2a1b", "#ffffff"]) {
      expect(rvbVersTsl(hexVersRvb(pourFondSombre(hex)))[2]).toBeGreaterThanOrEqual(CLARTE_MIN - 1e-6);
    }
  });
});

describe("poidsGroupe", () => {
  it("une plage vive l'emporte sur une plage terne un peu plus grande", () => {
    // Le pelage brun couvre plus de pixels que la casquette rose, mais c'est
    // la casquette que l'œil retient.
    const pelage    = poidsGroupe(400, 0.20);
    const casquette = poidsGroupe(300, 0.85);
    expect(casquette).toBeGreaterThan(pelage);
  });

  it("à saturation égale, le nombre départage", () => {
    expect(poidsGroupe(500, 0.5)).toBeGreaterThan(poidsGroupe(300, 0.5));
  });

  it("une plage bien plus grande l'emporte malgré une saturation moindre", () => {
    // La pondération corrige un biais, elle ne doit pas l'inverser.
    expect(poidsGroupe(5000, 0.20)).toBeGreaterThan(poidsGroupe(300, 0.95));
  });
});
