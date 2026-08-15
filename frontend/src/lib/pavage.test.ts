import { describe, expect, it } from "vitest";

import {
  blocsDuPortefeuille, classeEnClair, regrouperLesMiettes, totalDesBlocs,
  type DossierPave,
} from "./pavage";

/**
 * Le découpage du portefeuille en blocs.
 *
 * ⚠️ **L'invariant qui porte tout : le tout vaut la même chose dans les trois modes.** Un
 * bloc de la mauvaise taille reste un rectangle plausible — rien à l'écran ne le dénonce.
 * Si un mode oubliait les liquidités, deux parts de 39 % ne désigneraient pas la même somme
 * selon l'onglet choisi, et personne ne s'en apercevrait.
 */

const nuancer = (c: string, e: number) => `${c}@${e.toFixed(2)}`;
const couleurActif = (t: string) => `marque(${t})`;

const dossiers: DossierPave[] = [
  {
    cle: "declare:pea", nom: "PEA", couleur: "#5B6CF0", especes: 200,
    lignes: [
      { ticker: "ESE.PA", value: 1770, classe: "ETF" },
      { ticker: "ETZ.PA", value: 867, classe: "ETF" },
    ],
  },
  {
    cle: "deduit:CTO", nom: "CTO", couleur: "#9B5BD6", especes: null,
    lignes: [{ ticker: "AAPL", value: 1220, classe: "Actions" }],
  },
  {
    cle: "declare:livret", nom: "Livret A", couleur: "#22C55E", especes: 5000,
    lignes: [],
  },
];

const pave = (mode: "compte" | "actif" | "classe", d = dossiers) =>
  blocsDuPortefeuille(d, mode, nuancer, couleurActif);

describe("le tout, dans les trois modes", () => {
  it("vaut toujours la valeur du portefeuille", () => {
    const attendu = 1770 + 867 + 1220 + 200 + 5000;
    for (const mode of ["compte", "actif", "classe"] as const) {
      expect(totalDesBlocs(pave(mode)), `le mode ${mode} ne boucle pas`).toBe(attendu);
    }
  });

  it("donne la même part à une ligne quel que soit le mode", () => {
    /**
     * ⚠️ **C'est la conséquence lisible de l'invariant précédent.** Si les modes ne
     * partageaient pas le même dénominateur, ESE.PA vaudrait 20 % ici et 34 % là — deux
     * chiffres justes dans leur repère et incomparables entre eux.
     */
    const part = (mode: "compte" | "actif") => {
      const blocs = pave(mode);
      const ese = blocs.find(b => b.ticker === "ESE.PA")!;
      return ese.valeur / totalDesBlocs(blocs);
    };
    expect(part("compte")).toBeCloseTo(part("actif"), 10);
  });
});

describe("le mode compte", () => {
  it("détaille chaque dossier par ses lignes, et nomme le groupe", () => {
    const blocs = pave("compte");
    expect(blocs.filter(b => b.groupe === "PEA").map(b => b.nom))
      .toEqual(["ESE.PA", "ETZ.PA", "Espèces"]);
  });

  it("échelonne les nuances sur le rang, non sur la valeur", () => {
    /**
     * ⚠️ **Réparties selon le poids, deux lignes voisines auraient des teintes presque
     * identiques** et la frontière disparaîtrait. Sur le rang, l'écart est constant : la
     * première et la dernière sont aux extrêmes, quelle que soit la composition.
     */
    const pea = pave("compte").filter(b => b.groupe === "PEA");
    expect(pea[0].couleur).toBe("#5B6CF0@0.16");
    expect(pea[1].couleur).toBe("#5B6CF0@-0.16");
  });

  it("ne nuance pas un dossier d'une seule ligne", () => {
    // Seule, une ligne n'a personne dont se distinguer : la teinte du dossier suffit.
    const seul: DossierPave[] = [{ ...dossiers[1], especes: null }];
    expect(pave("compte", seul)[0].couleur).toBe("#9B5BD6@0.00");
  });

  it("donne aux espèces un bloc à part, assombri", () => {
    /**
     * Fondues dans le compte, un livret de 5 000 € et un PEA de 5 000 € auraient la même
     * apparence — alors que l'un est investi et l'autre non, c'est-à-dire précisément ce que
     * l'image doit montrer.
     */
    const livret = pave("compte").filter(b => b.groupe === "Livret A");
    expect(livret).toHaveLength(1);
    expect(livret[0]).toMatchObject({ nom: "Espèces", valeur: 5000, couleur: "#22C55E@-0.24" });
  });
});

describe("le mode actif", () => {
  it("donne à chaque ligne la couleur de sa carte", () => {
    const ese = pave("actif").find(b => b.ticker === "ESE.PA")!;
    expect(ese.couleur).toBe("marque(ESE.PA)");
  });

  it("réunit un même titre détenu dans deux comptes", () => {
    /**
     * ⚠️ Deux blocs « AAPL » côte à côte se liraient comme deux lignes différentes, et la
     * légende en citerait deux.
     */
    const deuxFois: DossierPave[] = [
      { cle: "a", nom: "A", couleur: "#111111", especes: null,
        lignes: [{ ticker: "AAPL", value: 600 }] },
      { cle: "b", nom: "B", couleur: "#222222", especes: null,
        lignes: [{ ticker: "AAPL", value: 400 }] },
    ];
    const blocs = pave("actif", deuxFois);
    expect(blocs).toHaveLength(1);
    expect(blocs[0].valeur).toBe(1000);
  });

  it("garde un bloc pour les espèces, qui n'ont pas de ticker", () => {
    // Sans lui, le tout cesserait de valoir le portefeuille dès qu'un livret est déclaré.
    const especes = pave("actif").find(b => b.nom === "Espèces")!;
    expect(especes.valeur).toBe(5200);
  });
});

describe("le mode classe", () => {
  it("regroupe par classe et compte les espèces comme telles", () => {
    const parNom = Object.fromEntries(pave("classe").map(b => [b.nom, b.valeur]));
    expect(parNom).toEqual({ ETF: 2637, Actions: 1220, "Espèces": 5200 });
  });

  it("range sous « Autres » une ligne sans classe connue", () => {
    const sansClasse: DossierPave[] = [
      { cle: "a", nom: "A", couleur: "#111111", especes: null,
        lignes: [{ ticker: "???", value: 100 }] },
    ];
    expect(pave("classe", sansClasse)[0].nom).toBe("Autres");
  });
});

describe("le silence", () => {
  it("ne rend aucun bloc pour un portefeuille vide", () => {
    expect(pave("compte", [])).toEqual([]);
    expect(pave("actif", [])).toEqual([]);
    expect(pave("classe", [])).toEqual([]);
  });

  it("écarte les blocs de valeur nulle plutôt que de paver du vide", () => {
    /** Un rectangle de surface zéro n'est pas dessiné, mais il porterait une clé et une
        entrée de légende — une ligne à 0 € qui n'apprend rien. */
    const vide: DossierPave[] = [
      { cle: "a", nom: "A", couleur: "#111111", especes: 0,
        lignes: [{ ticker: "NUL", value: 0 }, { ticker: "VRAI", value: 50 }] },
    ];
    expect(pave("compte", vide).map(b => b.nom)).toEqual(["VRAI"]);
  });

  it("traite une valeur manquante comme zéro", () => {
    const flou: DossierPave[] = [
      { cle: "a", nom: "A", couleur: "#111111", especes: null,
        lignes: [{ ticker: "SANS", value: null }, { ticker: "AVEC", value: 10 }] },
    ];
    expect(totalDesBlocs(pave("compte", flou))).toBe(10);
  });
});

describe("les miettes", () => {
  it("réunit sous « Autres » ce qui deviendrait illisible", () => {
    /**
     * ⚠️ **La réponse à l'objection qui avait fait retirer la treemap de cet écran.** Une
     * part de 1 % sur un panneau de trois centimètres devient un trait sans étiquette :
     * mieux vaut la nommer avec ses semblables que la dessiner illisible.
     */
    const blocs = [
      { cle: "a", nom: "A", valeur: 900, couleur: "#111" },
      { cle: "b", nom: "B", valeur: 60, couleur: "#222" },
      { cle: "c", nom: "C", valeur: 25, couleur: "#333" },
      { cle: "d", nom: "D", valeur: 15, couleur: "#444" },
    ];
    const apres = regrouperLesMiettes(blocs);
    expect(apres.map(b => b.nom)).toEqual(["A", "B", "2 autres"]);
    expect(apres.find(b => b.cle === "autres")!.valeur).toBe(40);
  });

  it("ne change rien à la somme", () => {
    // Regrouper ne doit jamais faire perdre un euro : le tout vaut toujours le portefeuille.
    const blocs = [
      { cle: "a", nom: "A", valeur: 900, couleur: "#111" },
      { cle: "b", nom: "B", valeur: 25, couleur: "#222" },
      { cle: "c", nom: "C", valeur: 15, couleur: "#333" },
    ];
    expect(totalDesBlocs(regrouperLesMiettes(blocs))).toBe(totalDesBlocs(blocs));
  });

  it("laisse tranquille un bloc seul sous le seuil", () => {
    /** « 1 autres » serait un rectangle de même taille sous un nom moins précis. */
    const blocs = [
      { cle: "a", nom: "A", valeur: 990, couleur: "#111" },
      { cle: "b", nom: "B", valeur: 10, couleur: "#222" },
    ];
    expect(regrouperLesMiettes(blocs).map(b => b.nom)).toEqual(["A", "B"]);
  });

  it("ne touche pas à un portefeuille vide", () => {
    expect(regrouperLesMiettes([])).toEqual([]);
  });
});

describe("la classe d'une ligne", () => {
  it("suit le type du fournisseur plutôt que la déduction sur le ticker", () => {
    /**
     * ⚠️ **Le défaut que le pavage a mis au jour.** `assetClass` reconnaît les fonds à une
     * liste de tickers écrite en dur, sans aucun ETF européen : un portefeuille de trois
     * trackers de Paris annonçait « Actions 100 % ». Le camembert l'affichait déjà ainsi.
     */
    expect(classeEnClair("ETF", "Actions")).toBe("ETF");
    expect(classeEnClair("CRYPTOCURRENCY", "Actions")).toBe("Crypto");
    expect(classeEnClair("EQUITY", "ETF")).toBe("Actions");
  });

  it("retombe sur la déduction quand le type manque", () => {
    // Un portefeuille valorisé en poids n'a pas d'opérations, donc pas de type : sans ce
    // repli il perdrait le mode « classe » entier.
    expect(classeEnClair(null, "ETF")).toBe("ETF");
    expect(classeEnClair(undefined, "Crypto")).toBe("Crypto");
    expect(classeEnClair("", "Actions")).toBe("Actions");
  });
});
