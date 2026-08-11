import { describe, expect, it } from "vitest";

import {
  alerteRepartition, avertissementValeur, echeanceEnClair, ecartAuRythme,
  euros, libelleCible, montantCible,
} from "./objectifs";

describe("libelleCible", () => {
  it("nomme les quatre sortes distinctement", () => {
    expect(libelleCible({ genre: "capital", age_cible: null })).toBe("Objectif final");
    expect(libelleCible({ genre: "capital_age", age_cible: 60 })).toBe("Objectif à 60 ans");
    expect(libelleCible({ genre: "achat", age_cible: null })).toBe("Objectif");
    expect(libelleCible({ genre: "revenu_mensuel", age_cible: null })).toBe("Revenus passifs");
  });

  it("retombe sur un intitulé neutre si l'âge manque", () => {
    // Le serveur refuse un objectif « à tel âge » sans âge, mais un enregistrement
    // ancien pourrait en porter : mieux vaut « Objectif » que « Objectif à null ans ».
    expect(libelleCible({ genre: "capital_age", age_cible: null })).toBe("Objectif");
  });
});

describe("montantCible", () => {
  it("marque l'unité mensuelle d'un objectif de revenu", () => {
    // ⚠️ Le test qui compte. Sans « / mois », 5 000 € se lit comme un patrimoine et
    // l'objectif paraît atteint sur un portefeuille de cinq mille euros, alors qu'il
    // en réclame un million et demi.
    expect(montantCible({ genre: "revenu_mensuel", cible: 5000 })).toContain("/ mois");
    expect(montantCible({ genre: "capital", cible: 5000 })).not.toContain("mois");
  });

  it("groupe les milliers à la française", () => {
    // Espace insécable étroit selon la plate-forme : on vérifie les chiffres, pas
    // l'espace, sinon le test casse au premier changement d'ICU.
    expect(montantCible({ genre: "capital", cible: 1_250_000 }).replace(/\s/g, ""))
      .toBe("1250000€");
  });

  it("arrondit à l'euro", () => {
    expect(euros(1234.56)).toMatch(/^1\s?235\s?€$/);
  });
});

describe("echeanceEnClair", () => {
  it("parle en années au-delà d'un an", () => {
    expect(echeanceEnClair(216)).toBe("dans 18 ans");
    expect(echeanceEnClair(12)).toBe("dans 1 an");
  });

  it("parle en mois en dessous d'un an", () => {
    // ⚠️ « dans 0 an » ne veut rien dire ; « dans 4 mois » est actionnable.
    expect(echeanceEnClair(4)).toBe("dans 4 mois");
  });

  it("ne dit rien sans échéance", () => {
    expect(echeanceEnClair(null)).toBeNull();
    expect(echeanceEnClair(0)).toBeNull();
  });
});

describe("ecartAuRythme", () => {
  it("dit l'avance quand le rythme suffit largement", () => {
    const r = ecartAuRythme({ mois_restants: 240, mois_pour_atteindre: 180 });
    expect(r).toEqual({ texte: "5 ans d’avance", tenable: true });
  });

  it("dit le retard quand il ne suffit pas", () => {
    // Le cas réel mesuré sur le PEA : 220 mois d'échéance, 399 nécessaires.
    const r = ecartAuRythme({ mois_restants: 220, mois_pour_atteindre: 399 });
    expect(r?.tenable).toBe(false);
    expect(r?.texte).toBe("15 ans de retard");
  });

  it("ne crie pas victoire pour quelques mois d'avance", () => {
    const r = ecartAuRythme({ mois_restants: 100, mois_pour_atteindre: 97 });
    expect(r).toEqual({ texte: "dans les temps", tenable: true });
  });

  it("traduit l'impossibilité sans dire « jamais »", () => {
    // ⚠️ Le serveur rend `null` quand aucune durée ne convient — sans versement et à
    // taux nul. Dire la cause est plus utile qu'un verdict.
    const r = ecartAuRythme({ mois_restants: 120, mois_pour_atteindre: null });
    expect(r).toEqual({ texte: "hors de portée au rythme actuel", tenable: false });
  });

  it("se taît sans échéance", () => {
    expect(ecartAuRythme({ mois_restants: null, mois_pour_atteindre: 200 })).toBeNull();
  });

  it("ne formule jamais de conseil", () => {
    // ⚠️ Le garde contre la dérive de la maquette, qui disait « augmentez votre
    // investissement mensuel à 1 000 € ». Ce module constate, il ne prescrit pas.
    // ⚠️ Pas de `as` ici : mon premier jet écrivait « mois_pour_antteindre » et le
    // cast avalait la coquille, donc le premier cas n'éprouvait pas ce qu'il annonçait.
    // Un type explicite fait échouer la compilation au lieu de laisser passer.
    const cas: { mois_restants: number | null; mois_pour_atteindre: number | null }[] = [
      { mois_restants: 240, mois_pour_atteindre: 180 },
      { mois_restants: 12, mois_pour_atteindre: 400 },
      { mois_restants: 120, mois_pour_atteindre: null },
    ];
    const interdits = /augment|réduis|devriez|conseil|il faut|placez|investissez/i;
    for (const c of cas) {
      const t = ecartAuRythme(c)?.texte ?? "";
      expect(t).not.toMatch(interdits);
    }
  });
});

describe("alerteRepartition", () => {
  it("prévient quand le même euro sert deux fois", () => {
    expect(alerteRepartition(160)).toContain("160 %");
  });

  it("se taît à cent pour cent", () => {
    expect(alerteRepartition(100)).toBeNull();
    expect(alerteRepartition(null)).toBeNull();
  });

  it("tolère un arrondi", () => {
    // Trois objectifs à 33,34 % font 100,02 : ce n'est pas une erreur de saisie.
    expect(alerteRepartition(100.02)).toBeNull();
  });
});

describe("avertissementValeur", () => {
  it("distingue l'absence de cours d'un patrimoine nul", () => {
    // ⚠️ Le défaut réellement rencontré : le fournisseur limitant le débit, la somme
    // sortait à 0 € et l'écran affichait « 0 % de votre objectif ».
    expect(avertissementValeur("indisponible")).toMatch(/indisponible/i);
  });

  it("avoue la valeur enregistrée quand il n'y a pas de transaction", () => {
    // Mesuré : cette colonne vaut 4 959,91 € sur un PEA qui en vaut 5 304,86.
    expect(avertissementValeur("poids")).toMatch(/enregistrée/i);
  });

  it("compte les lignes valorisées quand il en manque", () => {
    expect(avertissementValeur("transactions", 2, 3)).toMatch(/2 lignes sur 3/);
  });

  it("ne dit rien quand tout est valorisé", () => {
    expect(avertissementValeur("transactions", 3, 3)).toBeNull();
  });
});
