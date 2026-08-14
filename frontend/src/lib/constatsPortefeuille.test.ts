import { describe, expect, it } from "vitest";

import { constatsDuPortefeuille, type LigneConstat } from "./constatsPortefeuille";

/**
 * Les constats chiffrés du portefeuille.
 *
 * ⚠️ **Ce qui s'éprouve ici, c'est qu'aucune phrase ne se produise à faux.** Un constat
 * arithmétique faux est indétectable à l'écran : « ESE.PA porte 68 % de votre gain » a
 * exactement la même allure qu'il soit juste ou non, et personne ne refait la division. Les
 * cas où le module **se tait** comptent donc autant que ceux où il parle.
 */

const l = (ticker: string, value: number | null, pnlEur?: number | null): LigneConstat =>
  ({ ticker, value, pnlEur });

/**
 * ⚠️ **Le séparateur de milliers français n'est pas une espace ordinaire.**
 * `Intl.NumberFormat("fr-FR")` pose une espace **fine insécable** — U+202F —, invisible à
 * la lecture et différente au caractère près. Écrit à la main dans un attendu, il fait
 * échouer un test sur une phrase pourtant juste ; recopié depuis la sortie, il rend le test
 * illisible. On compare donc à espaces normalisées.
 */
const memeTexte = (t: string) => t.replace(/[\s\u202f\u00a0]+/g, " ");
const contient = (dits: string[], attendu: string) =>
  dits.map(memeTexte).includes(memeTexte(attendu));

describe("d'où vient le gain", () => {
  it("nomme la ligne qui porte le plus du résultat, et sa part", () => {
    const dits = constatsDuPortefeuille({
      lignes: [l("ESE.PA", 1770, 400), l("ETZ.PA", 867, 150), l("AAPL", 500, 50)],
      gainTotal: 600,
    });
    expect(memeTexte(dits[0])).toBe("ESE.PA porte 67 % de votre gain de 600 €.");
  });

  it("dit « perte » quand le portefeuille en fait une", () => {
    const dits = constatsDuPortefeuille({
      lignes: [l("AAPL", 500, -300), l("ESE.PA", 1000, -100)],
      gainTotal: -400,
    });
    expect(memeTexte(dits[0])).toBe("AAPL porte 75 % de votre perte de 400 €.");
  });

  it("se tait quand aucune ligne ne va dans le sens du total", () => {
    /**
     * ⚠️ **Le cas qui produirait une phrase illisible.** Sur un portefeuille en perte, la
     * ligne qui *gagne* le plus porte une fraction négative du total : « −40 % de votre
     * perte » ne se lit pas, et l'inverser mentirait sur le sens.
     */
    const dits = constatsDuPortefeuille({
      lignes: [l("AAPL", 500, 200), l("ESE.PA", 1000, 100)],
      gainTotal: -50,
    });
    expect(dits.some(d => /porte/.test(d))).toBe(false);
  });

  it("se tait sur un gain négligeable, plutôt que d'annoncer 100 % de rien", () => {
    const dits = constatsDuPortefeuille({
      lignes: [l("AAPL", 500, 0.4)], gainTotal: 0.5,
    });
    expect(dits.some(d => /porte/.test(d))).toBe(false);
  });

  it("borne la part à cent pour cent", () => {
    // Une ligne peut dépasser le gain total quand une autre perd : 400 gagnés d'un côté,
    // 100 perdus de l'autre, total 300. « 133 % de votre gain » serait juste et illisible.
    const dits = constatsDuPortefeuille({
      lignes: [l("ESE.PA", 1000, 400), l("AAPL", 500, -100)],
      gainTotal: 300,
    });
    expect(memeTexte(dits[0])).toBe("ESE.PA porte 100 % de votre gain de 300 €.");
  });
});

describe("le coût des frais", () => {
  it("le donne en euros par an, pas en pourcentage", () => {
    // 10 000 € à 0,20 % et 5 000 € à 0,30 % : 20 + 15 = 35 € par an.
    const dits = constatsDuPortefeuille({
      lignes: [l("ESE.PA", 10000), l("ETZ.PA", 5000)],
      fraisParLigne: { "ESE.PA": 0.2, "ETZ.PA": 0.3 },
    });
    expect(contient(dits, "Les frais de vos fonds coûtent 35 € par an, au niveau actuel."))
      .toBe(true);
  });

  it("annonce sur combien de lignes le calcul porte quand il n'est pas complet", () => {
    /**
     * ⚠️ **Sans cette mention, un chiffre partiel se lit comme le total.** Deux fonds sur
     * cinq renseignés donnent une somme vraie pour deux lignes et fausse pour le
     * portefeuille — et rien à l'écran ne le dirait.
     */
    const dits = constatsDuPortefeuille({
      lignes: [l("ESE.PA", 10000), l("ETZ.PA", 5000), l("AAPL", 3000)],
      fraisParLigne: { "ESE.PA": 0.2 },
    });
    expect(contient(dits,
      "Les frais de vos fonds coûtent 20 € par an sur 1 de vos 3 lignes, au niveau actuel."))
      .toBe(true);
  });

  it("se tait quand aucun frais n'est saisi", () => {
    const dits = constatsDuPortefeuille({ lignes: [l("ESE.PA", 10000)] });
    expect(dits.some(d => /frais/.test(d))).toBe(false);
  });

  it("se tait sous un euro par an", () => {
    // 200 € à 0,20 % font quarante centimes. « 0 € par an » se lirait comme la gratuité.
    const dits = constatsDuPortefeuille({
      lignes: [l("ESE.PA", 200)], fraisParLigne: { "ESE.PA": 0.2 },
    });
    expect(dits.some(d => /frais/.test(d))).toBe(false);
  });
});

describe("ce qui n'est pas investi", () => {
  it("donne la somme et sa part du portefeuille entier", () => {
    // 5 400 sur 5 400 + 10 600 = 16 000, soit 34 %.
    const dits = constatsDuPortefeuille({
      lignes: [l("ESE.PA", 10600)], liquidites: 5400,
    });
    expect(contient(dits, "5 400 € ne sont pas investis, soit 34 % du portefeuille."))
      .toBe(true);
  });

  it("se tait sans liquidités déclarées", () => {
    const dits = constatsDuPortefeuille({ lignes: [l("ESE.PA", 10600)] });
    expect(dits.some(d => /investis/.test(d))).toBe(false);
  });
});

describe("le poids des premières lignes", () => {
  it("somme les trois premières, ce que le camembert ne fait pas", () => {
    const dits = constatsDuPortefeuille({
      lignes: [l("A", 400), l("B", 300), l("C", 200), l("D", 100)],
    });
    expect(contient(dits, "Vos trois premières lignes font 90 % de vos titres.")).toBe(true);
  });

  it("se tait en dessous de quatre lignes", () => {
    /** À trois, « vos trois premières font 100 % » est vrai et ne vaut rien. */
    const dits = constatsDuPortefeuille({
      lignes: [l("A", 400), l("B", 300), l("C", 200)],
    });
    expect(dits.some(d => /trois premières/.test(d))).toBe(false);
  });
});

describe("le silence", () => {
  it("ne rend rien sur un portefeuille vide", () => {
    expect(constatsDuPortefeuille({ lignes: [] })).toEqual([]);
  });

  it("traite une valeur manquante comme zéro plutôt que de rendre « NaN € »", () => {
    const dits = constatsDuPortefeuille({
      lignes: [l("A", null), l("B", 300), l("C", 200), l("D", 100)],
    });
    expect(dits.join(" ")).not.toContain("NaN");
  });

  it("met en tête ce qu'aucun autre endroit de l'écran ne dit", () => {
    /**
     * L'ordre compte : le panneau n'en montre qu'un à la fois. Le gain et les frais passent
     * avant la concentration, que le camembert d'à côté effleure déjà.
     */
    const dits = constatsDuPortefeuille({
      lignes: [l("A", 400, 100), l("B", 300), l("C", 200), l("D", 100)],
      liquidites: 500,
      fraisParLigne: { A: 1 },
      gainTotal: 100,
    });
    expect(dits.map(d => d.split(" ")[0])).toEqual(["A", "Les", "500", "Vos"]);
  });
});
