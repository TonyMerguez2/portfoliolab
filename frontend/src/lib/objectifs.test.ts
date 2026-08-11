import { describe, expect, it } from "vitest";

import {
  agregat, alerteRepartition, avertissementValeur, echeanceEnClair, ecartAuRythme,
  euros, libelleCible, moisEnClair, montantCible, observations, pourcent,
  pourcentageLisible, surVersements, type Objectif,
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

describe("agregat", () => {
  const o = (kw: Partial<Objectif>): Objectif => ({
    id: "x", nom: "x", genre: "capital", cible: 0, echeance_annee: null,
    age_cible: null, part_affectee: null, versement_mensuel: null, taux_attendu: null,
    inflation: null, taux_retrait: null, couleur: null, capital_requis: null,
    montant_actuel: null, avancement: null, atteint: null, mois_restants: null,
    valeur_projetee: null, projetee_en_euros_constants: null,
    mois_pour_atteindre: null,
    verse_deja: null, verse_mesure: null, verse_retenu: null, sur_versements: false,
    ...kw,
  });

  it("additionne les cibles et les montants constitués", () => {
    const a = agregat([
      o({ capital_requis: 1_000_000, montant_actuel: 400_000 }),
      o({ capital_requis: 500_000, montant_actuel: 100_000 }),
    ]);
    expect(a.total).toBe(1_500_000);
    expect(a.actuel).toBe(500_000);
    expect(a.reste).toBe(1_000_000);
    expect(a.part).toBeCloseTo(33.33, 1);
    expect(a.comptes).toBe(2);
  });

  it("écarte et compte les objectifs sans montant connu", () => {
    // ⚠️ Un objectif dont la valorisation a échoué ne vaut pas zéro : l'inclure tirerait
    // l'avancement global vers le bas et ferait passer une ignorance pour un retard.
    const a = agregat([
      o({ capital_requis: 100_000, montant_actuel: 50_000 }),
      o({ capital_requis: 100_000, montant_actuel: null }),
    ]);
    expect(a.total).toBe(100_000);
    expect(a.part).toBe(50);
    expect(a.ecartes).toBe(1);
  });

  it("ne divise pas par zéro sur une liste vide", () => {
    expect(agregat([])).toMatchObject({ total: 0, part: 0, comptes: 0 });
  });

  it("borne l'avancement à cent", () => {
    const a = agregat([o({ capital_requis: 1_000, montant_actuel: 5_000 })]);
    expect(a.part).toBe(100);
    expect(a.reste).toBe(0);
  });
});

describe("observations", () => {
  const base: Objectif = {
    id: "x", nom: "Retraite", genre: "capital", cible: 1_000_000,
    echeance_annee: 2044, age_cible: null, part_affectee: 100,
    versement_mensuel: 800, taux_attendu: 7.2, inflation: 2, taux_retrait: null,
    couleur: null, capital_requis: 1_000_000, montant_actuel: 100_000,
    avancement: 10, atteint: false, mois_restants: 220,
    valeur_projetee: 900_000, projetee_en_euros_constants: 600_000,
    mois_pour_atteindre: 240,
    verse_deja: null, verse_mesure: null, verse_retenu: null, sur_versements: false,
  };

  it("dit ce qui manque et l'écart à la cible", () => {
    const obs = observations(base, 100_000);
    expect(obs.some(t => /Il manque/.test(t))).toBe(true);
    expect(obs.some(t => /sous la cible/.test(t))).toBe(true);
  });

  it("ramène la projection en euros d'aujourd'hui", () => {
    expect(observations(base, 100_000).some(t => /d’aujourd’hui/.test(t))).toBe(true);
  });

  it("ne formule jamais de conseil", () => {
    /**
     * ⚠️ Le garde contre la dérive de la maquette, qui proposait « augmenter votre
     * investissement mensuel à 1 000 € » et « réduire l'exposition aux actions à 70 % ».
     */
    const interdits = /augment|réduis|devriez|il faut|conseill|recommand|placez|activez/i;
    const jeux: Objectif[] = [
      base,
      { ...base, montant_actuel: 2_000_000, avancement: 100, atteint: true },
      { ...base, mois_pour_atteindre: null, valeur_projetee: null },
      { ...base, versement_mensuel: null, taux_attendu: null, inflation: null,
        valeur_projetee: null, projetee_en_euros_constants: null },
    ];
    for (const o of jeux) {
      for (const t of observations(o, 100_000)) expect(t).not.toMatch(interdits);
    }
  });

  it("omet un constat plutôt que de l'appuyer sur une hypothèse absente", () => {
    const sansRien: Objectif = {
      ...base, versement_mensuel: null, taux_attendu: null, inflation: null,
      valeur_projetee: null, projetee_en_euros_constants: null,
      mois_pour_atteindre: null,
    };
    const obs = observations(sansRien, null);
    expect(obs.every(t => !/inflation|rythme|médiane/.test(t))).toBe(true);
  });

  it("ne dit rien d'un objectif vide", () => {
    const vide: Objectif = { ...base, capital_requis: null, montant_actuel: null,
      valeur_projetee: null, projetee_en_euros_constants: null,
      mois_pour_atteindre: null, mois_restants: null };
    expect(observations(vide, null)).toEqual([]);
  });
});

describe("pourcentageLisible", () => {
  it("distingue « presque rien » de « rien »", () => {
    // ⚠️ Constaté à l'écran : 4 545 € contre 3 050 000 € font 0,11 %, arrondis à « 0 % »
    // — indiscernable d'un objectif auquel on n'a rien affecté.
    expect(pourcentageLisible(0.11)).toBe("< 1 %");
    expect(pourcentageLisible(0)).toBe("0 %");
  });

  it("ne proclame pas cent pour cent avant la fin", () => {
    expect(pourcentageLisible(99.7)).toBe("> 99 %");
    expect(pourcentageLisible(100)).toBe("100 %");
  });

  it("arrondit normalement entre les deux", () => {
    expect(pourcentageLisible(33.4)).toBe("33 %");
    expect(pourcentageLisible(50)).toBe("50 %");
  });
});

describe("cohérence de la médiane citée", () => {
  const base: Objectif = {
    id: "x", nom: "Retraite", genre: "capital", cible: 1_250_000,
    echeance_annee: 2044, age_cible: null, part_affectee: 50,
    versement_mensuel: 800, taux_attendu: 7.2, inflation: 2, taux_retrait: null,
    couleur: null, capital_requis: 1_250_000, montant_actuel: 2_273,
    avancement: 0.18, atteint: false, mois_restants: 220,
    valeur_projetee: 362_986, projetee_en_euros_constants: 245_000,
    mois_pour_atteindre: 397,
    verse_deja: null, verse_mesure: null, verse_retenu: null, sur_versements: false,
  };

  it("cite la médiane des tirages quand elle est fournie", () => {
    /**
     * ⚠️ Le défaut vu à l'écran : la projection affichait 373 261 € et le constat
     * 362 986 €, deux calculs de la même grandeur côte à côte. Les tests garantissaient
     * qu'ils se rejoignent à 5 % près ; ils ne garantissaient pas qu'on n'affiche pas
     * les deux.
     */
    // ⚠️ On normalise l'espace **de la sortie**, pas du littéral : `Intl.NumberFormat`
    // groupe les milliers avec une espace fine insécable (U+202F), et non l'espace du
    // clavier. C'est exactement le piège déjà noté plus haut dans ce fichier, et j'y
    // suis retombé.
    const avec = observations(base, 4_545, 373_261).join(" ").replace(/\s/g, " ");
    expect(avec).toContain("373 261 €");
    expect(avec).not.toContain("362 986");
  });

  it("retombe sur la valeur du serveur sans médiane fournie", () => {
    const sans = observations(base, 4_545).join(" ").replace(/\s/g, " ");
    expect(sans).toContain("362 986");
  });

  it("recalcule le pouvoir d'achat sur la médiane citée", () => {
    // Sinon la phrase citerait un montant absent partout ailleurs à l'écran.
    const t = (observations(base, 4_545, 373_261).find(x => /inflation/.test(x)) ?? "")
      .replace(/\s/g, " ");
    expect(t).toContain("373 261 €");
    expect(t).not.toContain("245 000");
  });
});

describe("pourcent", () => {
  it("emploie la virgule décimale", () => {
    // ⚠️ L'écran affichait « 17.9 % », « 7.47 %/an », « 18.08 % par an » — un point
    // décimal au milieu d'une interface en français, alors que les montants étaient
    // déjà formatés correctement.
    expect(pourcent(17.9)).toBe("17,9");
    expect(pourcent(7.47)).toBe("7,47");
  });

  it("n'ajoute pas de décimale inutile", () => {
    expect(pourcent(7)).toBe("7");
    expect(pourcent(100, 1)).toBe("100");
  });

  it("arrondit au nombre de décimales demandé", () => {
    expect(pourcent(18.0839, 2)).toBe("18,08");
    expect(pourcent(18.0839, 1)).toBe("18,1");
  });
});

describe("pourcent, face à une donnée absente", () => {
  it("rend un tiret plutôt que de lever", () => {
    /**
     * ⚠️ Ce test vient d'un écran blanc. Le formulaire tenait une réponse d'API
     * antérieure à l'ajout d'un champ ; `pourcent(undefined)` a levé sur
     * `toLocaleString` et fait tomber toute la page derrière une erreur globale. C'est
     * ce qui arrive à chaque déploiement, quand un client garde en mémoire une réponse de
     * la version précédente.
     */
    expect(pourcent(undefined)).toBe("—");
    expect(pourcent(null)).toBe("—");
    expect(pourcent(NaN)).toBe("—");
    expect(pourcent(Infinity)).toBe("—");
  });

  it("continue de formater un nombre valide", () => {
    expect(pourcent(2.9, 1)).toBe("2,9");
  });
});


// ── Le plafond de versements ─────────────────────────────────────────────────
//
// ⚠️ **Ce que cette série protège.** Le plafond d'un PEA porte sur le cumul des versements ;
// les plus-values ne le consomment pas. Toute la difficulté est là : les quatre autres
// objectifs se mesurent sur la valeur du portefeuille, à juste titre, et réutiliser leur
// calcul ici annoncerait le plafond atteint alors qu'il reste de la capacité.

describe("plafond de versements", () => {
  const plafond = (kw: Partial<Objectif> = {}): Objectif => ({
    id: "p", nom: "Plafond PEA", genre: "plafond_versements", cible: 150_000,
    echeance_annee: null, age_cible: null, part_affectee: null,
    versement_mensuel: 800, taux_attendu: null, inflation: null, taux_retrait: null,
    couleur: null, capital_requis: 150_000, montant_actuel: 5_000, avancement: 3.33,
    atteint: false, mois_restants: null, valeur_projetee: null,
    projetee_en_euros_constants: null, mois_pour_atteindre: 182,
    verse_deja: null, verse_mesure: 5_000, verse_retenu: 5_000, sur_versements: true,
    ...kw,
  });

  it("se reconnaît par le genre", () => {
    expect(surVersements("plafond_versements")).toBe(true);
    expect(surVersements("capital")).toBe(false);
  });

  it("s'intitule en versements, pas en capital", () => {
    expect(libelleCible({ genre: "plafond_versements", age_cible: null }))
      .toBe("Plafond de versements");
  });

  it("dit ce qu'il reste à verser et quand le plafond tombe", () => {
    const c = observations(plafond());
    // ⚠️ Le montant attendu est **construit par le formateur**, jamais recopié à la main :
    // `Intl` sépare les milliers par une espace fine insécable (U+202F) et non par celle du
    // clavier. Une comparaison littérale échoue alors sur deux chaînes visuellement
    // identiques — piège dans lequel je suis retombé en écrivant ce test, après l'avoir
    // documenté plus haut dans ce même fichier.
    expect(c.some(t => t.includes(`reste ${euros(145_000)} à verser`))).toBe(true);
    // 182 mois = 15 ans et 2 mois.
    expect(c.some(t => /15 ans et 2 mois/.test(t))).toBe(true);
    expect(c.some(t => /800 € par mois/.test(t))).toBe(true);
  });

  it("rappelle que les plus-values ne consomment pas le plafond", () => {
    // ⚠️ Le constat le plus important de l'écran : sans lui, un épargnant dont le PEA vaut
    // plus que ses versements peut croire qu'il approche de la limite.
    expect(observations(plafond()).some(t => /plus-values ne consomment pas/.test(t)))
      .toBe(true);
  });

  it("ne parle jamais de rendement, de médiane ni de pouvoir d'achat", () => {
    // ⚠️ Ces trois notions sont justes pour un objectif de capital et fausses ici : elles
    // laisseraient croire que les marchés rapprochent du plafond.
    const texte = observations(plafond({ inflation: 2, taux_attendu: 7 })).join(" ");
    expect(texte).not.toMatch(/médiane|rendement|pouvoir d’achat|d’aujourd’hui/i);
  });

  it("annonce le plafond atteint plutôt qu'un reste négatif", () => {
    const c = observations(plafond({ verse_retenu: 160_000, montant_actuel: 160_000,
      atteint: true, mois_pour_atteindre: 0 }));
    expect(c.some(t => /plafond est atteint/.test(t))).toBe(true);
    expect(c.join(" ")).not.toMatch(/-\s?10 000/);
  });

  it("dit la cause quand aucune date n'est calculable", () => {
    // ⚠️ « Sans versement mensuel renseigné » plutôt que « jamais » : l'absence de réponse
    // n'est pas une réponse négative.
    const c = observations(plafond({ versement_mensuel: null, mois_pour_atteindre: null }));
    expect(c.some(t => /aucune date ne peut être calculée/.test(t))).toBe(true);
  });

  it("signale un écart entre le relevé saisi et les transactions", () => {
    // ⚠️ Un relevé très supérieur au net des transactions veut dire qu'il manque des
    // écritures — et l'avancement de tous les autres objectifs est alors faux aussi.
    const c = observations(plafond({ verse_deja: 40_000, verse_mesure: 3_000,
      verse_retenu: 40_000 }));
    expect(c.some(t => /manque probablement des transactions/.test(t))).toBe(true);
  });

  it("ne signale pas d'écart quand les deux chiffres concordent", () => {
    const c = observations(plafond({ verse_deja: 5_000, verse_mesure: 5_010,
      verse_retenu: 5_000 }));
    expect(c.some(t => /manque probablement/.test(t))).toBe(false);
  });

  it("est exclu de l'agrégat, pour ne pas compter deux fois le même argent", () => {
    // ⚠️ Le cœur du problème : les versements *sont* dans le patrimoine. Additionner
    // « 5 000 € versés » et « 5 300 € de portefeuille affecté » compterait deux fois le même
    // argent et gonflerait l'avancement global d'un portefeuille qui n'aurait rien gagné.
    const capital: Objectif = { ...plafond(), genre: "capital", sur_versements: false,
      cible: 1_000_000, capital_requis: 1_000_000, montant_actuel: 5_300 };
    const a = agregat([capital, plafond()]);
    expect(a.comptes).toBe(1);
    // ⚠️ `horsUnite` et non `ecartes` : le montant du plafond est parfaitement connu, il
    // n'est simplement pas commensurable. Vu à l'écran, la confusion affichait « montant
    // indisponible » et faisait passer un choix de calcul pour une panne.
    expect(a.horsUnite).toBe(1);
    expect(a.ecartes).toBe(0);
    expect(a.total).toBe(1_000_000);
    expect(a.actuel).toBe(5_300);
  });
});

describe("moisEnClair", () => {
  it("donne le mois et l'année, pas seulement l'année", () => {
    // ⚠️ La date d'un plafond est une division : elle est exacte au mois près, et
    // n'afficher que l'année jetterait onze mois de précision que le calcul possède.
    expect(moisEnClair(2, new Date(2026, 0, 15))).toBe("mars 2026");
  });

  it("franchit correctement l'année", () => {
    expect(moisEnClair(14, new Date(2026, 0, 15))).toBe("mars 2027");
  });

  it("rend le mois courant pour zéro", () => {
    expect(moisEnClair(0, new Date(2026, 7, 11))).toBe("août 2026");
  });
});
