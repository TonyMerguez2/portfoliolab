import { describe, it, expect } from "vitest";
import { couleurActif, brandHex } from "./tileStyle";
import { retenirTeinte } from "./couleursLogos";

/**
 * ⚠️ **Ces quatre assertions verrouillent une divergence vécue.** La carte d'actif du tableau de
 * bord et celle de la page graphique répondaient différemment à « quelle est la couleur de cet
 * actif ? » : la première par `brandHex`, la seconde par une règle écrite sur place qui
 * consultait en plus la teinte du logo et suivait le thème. Le même actif changeait donc de
 * couleur d'une page à l'autre. Deux règles pour une question se remettent à diverger dès qu'on
 * touche à l'une ; un test est ce qui l'empêche.
 */
describe("couleurActif : une seule règle pour toutes les surfaces", () => {
  it("un actif de la table rend la même couleur que l'ancienne règle du tableau de bord", () => {
    expect(couleurActif("AAPL")).toBe(brandHex("AAPL"));
  });
  it("un actif hors table prenait un hachage, il prend maintenant la teinte du logo", () => {
    const avant = couleurActif("ZZTOP");
    retenirTeinte("ZZTOP", "#00D492");
    const apres = couleurActif("ZZTOP");
    expect(avant).not.toBe(apres);
    expect(apres).not.toBe(brandHex("ZZTOP"));
  });
  it("la table prime sur la teinte extraite", () => {
    retenirTeinte("AAPL", "#FF0000");
    expect(couleurActif("AAPL")).toBe(brandHex("AAPL"));
  });
  it("le thème clair change le résultat, ce que brandHex ne faisait pas", () => {
    expect(couleurActif("AAPL", { clair: true })).not.toBe(couleurActif("AAPL", { clair: false }));
  });
});
