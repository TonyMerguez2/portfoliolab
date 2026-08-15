import { describe, expect, it } from "vitest";

import {
  blocsDuPortefeuille, classeEnClair, poidsLisibles, regrouperLesMiettes, totalDesBlocs,
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
  blocsDuPortefeuille(d, mode, couleurActif);

describe("le tout, dans les trois modes", () => {
  it("vaut toujours la valeur du portefeuille", () => {
    const attendu = 1770 + 867 + 1220 + 200 + 5000;
    for (const mode of ["compte", "actif", "classe"] as const) {
      expect(totalDesBlocs(pave(mode)), `le mode ${mode} ne boucle pas`).toBe(attendu);
    }
  });

  it("fait retrouver un compte en additionnant ses lignes dans l'autre mode", () => {
    /**
     * ⚠️ **C'est la conséquence lisible de l'invariant précédent.** Les modes ne montrent
     * pas les mêmes objets — un dossier ici, des titres là — mais ils taillent la même
     * surface : le bloc « PEA » doit valoir exactement ses lignes plus ses espèces, telles
     * que le mode actif les compte. Sans dénominateur commun, une même somme vaudrait 20 %
     * ici et 34 % là, deux chiffres justes dans leur repère et incomparables entre eux.
     */
    const parCompte = pave("compte").find(b => b.nom === "PEA")!;
    const parActif = pave("actif");
    const lignesDuPea = ["ESE.PA", "ETZ.PA"]
      .map(t => parActif.find(b => b.ticker === t)!.valeur)
      .reduce((a, b) => a + b, 0);
    expect(parCompte.valeur).toBe(lignesDuPea + 200);
  });
});

describe("le mode compte", () => {
  it("rend un bloc par dossier, et rien de plus fin", () => {
    /**
     * ⚠️ **Le premier essai découpait chaque compte par ses lignes, en nuances de sa
     * teinte.** L'image mêlait alors deux niveaux : « Espèces 47 % » y voisinait avec
     * « ESE.PA 35 % », deux grandeurs de nature différente dans la même vue. Un mode répond
     * à une question, et celle-ci est « comment mon argent se répartit entre mes comptes ».
     */
    expect(pave("compte").map(b => [b.nom, b.valeur]))
      .toEqual([["PEA", 2837], ["CTO", 1220], ["Livret A", 5000]]);
  });

  it("compte les espèces dans la valeur du compte qui les porte", () => {
    // C'est ce qu'un livret *est* : sa valeur est son solde. Lui donner un bloc à part
    // reviendrait à le couper en deux moitiés dont l'une serait vide.
    const pea = pave("compte").find(b => b.nom === "PEA")!;
    expect(pea.valeur, "les 200 € d'espèces manquent").toBe(1770 + 867 + 200);
  });

  it("donne au bloc la couleur du dossier, sans nuance", () => {
    expect(pave("compte").map(b => b.couleur))
      .toEqual(["#5B6CF0", "#9B5BD6", "#22C55E"]);
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
    /** Un rectangle de surface zéro n'est pas dessiné, mais il porterait une clé et un
        libellé au survol — une ligne à 0 € qui n'apprend rien. */
    const vide: DossierPave[] = [
      { cle: "a", nom: "A", couleur: "#111111", especes: 0,
        lignes: [{ ticker: "NUL", value: 0 }, { ticker: "VRAI", value: 50 }] },
      { cle: "b", nom: "Vide", couleur: "#222222", especes: null, lignes: [] },
    ];
    expect(pave("actif", vide).map(b => b.nom)).toEqual(["VRAI"]);
    expect(pave("compte", vide).map(b => b.nom), "un dossier sans rien reste dessiné")
      .toEqual(["A"]);
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

describe("les poids de mise en page", () => {
  const bloc = (nom: string, valeur: number) => ({ cle: nom, nom, valeur, couleur: "#111" });

  it("relève le plus petit jusqu'au plancher, sans toucher à sa valeur", () => {
    /**
     * ⚠️ **Le seul endroit où l'image ment un peu.** Un bloc à 2 % voisin d'un bloc à 50 %
     * devient un filet de vingt pixels sur cinquante : aucune découpe ne le rend compact en
     * gardant les aires exactes. On relève donc son aire — et lui seul est faussé.
     */
    const blocs = [bloc("gros", 5000), bloc("moyen", 4800), bloc("filet", 200)];
    const poids = poidsLisibles(blocs);
    expect(poids.find(p => p.bloc.nom === "filet")!.poids).toBeGreaterThan(0.05);
    expect(poids.find(p => p.bloc.nom === "filet")!.bloc.valeur, "la valeur a bougé").toBe(200);
  });

  it("fait toujours une surface entière", () => {
    // Sans renormalisation, relever un bloc ferait déborder le pavage de son cadre.
    const blocs = [bloc("a", 5000), bloc("b", 4800), bloc("c", 200), bloc("d", 60)];
    expect(poidsLisibles(blocs).reduce((s, p) => s + p.poids, 0)).toBeCloseTo(1, 10);
  });

  it("ne touche à rien quand tous les blocs dépassent le plancher", () => {
    /** La distorsion n'existe que là où elle sert : c'est le cas ordinaire. */
    const blocs = [bloc("a", 500), bloc("b", 300), bloc("c", 200)];
    const poids = poidsLisibles(blocs);
    expect(poids.map(p => +p.poids.toFixed(6))).toEqual([0.5, 0.3, 0.2]);
  });

  it("borne le plancher à ce que la surface permet", () => {
    /**
     * ⚠️ **À vingt blocs, un plancher de 5,5 % en exigerait 110 %.** Sans borne, la
     * renormalisation les ramènerait tous à la même taille — un damier régulier qui ne
     * dirait plus rien des poids.
     */
    const blocs = Array.from({ length: 20 }, (_, i) => bloc(`t${i}`, i === 0 ? 8000 : 100));
    const poids = poidsLisibles(blocs);
    const plusGros = poids.find(p => p.bloc.nom === "t0")!.poids;
    expect(plusGros, "le plus gros a été nivelé").toBeGreaterThan(0.25);
  });

  it("ne divise pas par zéro sur un portefeuille vide", () => {
    expect(poidsLisibles([])).toEqual([]);
    expect(poidsLisibles([bloc("a", 0)])[0].poids).toBe(0);
  });
});
