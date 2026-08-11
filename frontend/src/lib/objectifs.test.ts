import { describe, expect, it } from "vitest";

import {
  agregat, alerteRepartition, avertissementValeur, dureeEnClair, echeanceEnClair, ecartAuRythme,
  phraseMarginale, phraseSensibilite, phraseVersements,
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
    sensibilites: [], versement_requis: null,
    rendement_requis: null, part_du_gain: null, stress: [],
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
    sensibilites: [], versement_requis: null,
    rendement_requis: null, part_du_gain: null, stress: [],
  };

  const riche: Objectif = { ...base, versement_requis: 2_782, sensibilites: [
    { quoi: "versement_marginal", versement: 900, taux: 7.2, mois: 219, ecart_mois: -21 },
    { quoi: "versement", versement: 400, taux: 7.2, mois: 349, ecart_mois: 109 },
    { quoi: "versement", versement: 1_600, taux: 7.2, mois: 139, ecart_mois: -101 },
    { quoi: "rendement", versement: 800, taux: 6.2, mois: 277, ecart_mois: 37 },
  ] };

  it("met en tête ce que valent cent euros de plus", () => {
    // ⚠️ **Le taux de change entre des euros et des années.** C'est la ligne la plus
    // actionnable du panneau : personne ne double ses versements d'un trait de plume, tout le
    // monde peut mettre cent euros de plus. D'où sa première place.
    const obs = observations(riche, 100_000);
    expect(obs[0]).toContain(`${euros(100)} de plus par mois`);
    expect(obs[0]).toContain(`${euros(900)} au lieu de ${euros(800)}`);
    expect(obs[0]).toContain("rapprocheraient la cible de 1 an 9 mois");
  });

  it("dit ensuite le rythme qu'exigerait l'échéance", () => {
    const obs = observations(riche, 100_000);
    expect(obs[1]).toContain("Tenir 2044 demanderait");
    expect(obs[1]).toContain(euros(2_782));
    expect(obs[1]).toContain("3,5 fois votre rythme actuel");
  });

  it("ne redit pas ce que la carte affiche déjà", () => {
    // ⚠️ **La critique qui a fait réécrire ce panneau.** « Il manque 1 247 738 € » quand la
    // carte porte « 2 282 € / 1 250 000 € », « atteinte en 2059 (15 ans de retard) » quand
    // elle porte « reste 33 ans » et l'étiquette du retard, « soit X d'aujourd'hui » quand
    // le panneau de projection le met sous sa médiane. Trois reformulations sur cinq lignes.
    const joint = observations(riche, 100_000).join(" ");
    expect(joint).not.toMatch(/Il manque/);
    expect(joint).not.toMatch(/serait atteinte en/);
    expect(joint).not.toMatch(/d’aujourd’hui/);
  });

  it("classe le rythme et le rendement au lieu de les juxtaposer", () => {
    const t = observations(riche, 100_000).find(x => /pèse plus/.test(x));
    expect(t).toBeDefined();
    // 101 mois contre 37 : le rythme commande. Et c'est la variante **à la hausse** qui est
    // citée — celle qui répond à « et si je mettais plus ? ».
    expect(t).toContain("Le rythme pèse plus que le rendement");
    expect(t).toContain("doubler vos versements déplace la cible de 8 ans 5 mois");
    expect(t).toContain("un point de rendement de 3 ans 1 mois");
  });

  it("tient en quatre lignes au plus pour un objectif de capital", () => {
    // ⚠️ Le nombre n'est pas une contrainte de place : au-delà, plus rien n'est lu, et une
    // ligne de trop dévalue les autres. Quatre questions distinctes — ce que valent cent
    // euros, ce qu'exigerait l'échéance, ce qu'il manquerait à cette date, quel levier
    // commande — et pas une de plus.
    expect(observations(riche, 100_000)).toHaveLength(4);
  });

  it("ne cite pas deux fois la variante marginale", () => {
    // ⚠️ Elle a sa propre phrase en tête ; la reprendre dans le classement des leviers la
    // ferait apparaître deux fois sous deux formes.
    const lignes = observations(riche, 100_000);
    expect(lignes.filter(t => t.includes(euros(900))).length).toBe(1);
  });

  it("chaque ligne porte un chiffre", () => {
    for (const t of observations(riche, 100_000)) expect(t).toMatch(/\d/);
  });

  it("se replie sur le montant manquant quand rien d'autre n'est calculable", () => {
    // ⚠️ Sans échéance ni rendement, aucune interprétation n'existe — et un panneau vide
    // n'aide personne. Le repli est le plus faible des constats, et n'apparaît qu'alors.
    const nu: Objectif = { ...base, echeance_annee: null, mois_restants: null,
      taux_attendu: null, versement_requis: null, valeur_projetee: null,
      sensibilites: [] };
    const obs = observations(nu, 100_000);
    expect(obs).toHaveLength(1);
    expect(obs[0]).toContain("Il manque");
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
    sensibilites: [], versement_requis: null,
    rendement_requis: null, part_du_gain: null, stress: [],
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
    // ⚠️ **Le panneau ne cite plus la médiane mais l'écart qui en dérive** — « reste X sous
    // la cible ». La garantie reste la même et se teste de la même façon : cet écart doit
    // être calculé sur la médiane *affichée* par la projection, sinon les deux panneaux
    // décrivent la même trajectoire avec deux chiffres différents.
    const avec = observations(base, 4_545, 373_261).join(" ").replace(/\s/g, " ");
    expect(avec).toContain(euros(1_250_000 - 373_261).replace(/\s/g, " "));
    expect(avec).not.toContain(euros(1_250_000 - 362_986).replace(/\s/g, " "));
  });

  it("retombe sur la valeur du serveur sans médiane fournie", () => {
    const sans = observations(base, 4_545).join(" ").replace(/\s/g, " ");
    expect(sans).toContain(euros(1_250_000 - 362_986).replace(/\s/g, " "));
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
    sensibilites: [], versement_requis: null,
    rendement_requis: null, part_du_gain: null, stress: [],
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

  it("dit ce que le plafond implique pour les autres objectifs", () => {
    // ⚠️ **La seule interprétation d'un plafond qui n'existe nulle part ailleurs**, parce
    // qu'elle naît de la rencontre de deux objectifs : une enveloppe qui sature avant que
    // ceux qu'elle finance n'aboutissent. Aucune carte ne peut la montrer seule.
    const retraite: Objectif = { ...plafond(), id: "r", nom: "Retraite", genre: "capital",
      sur_versements: false, mois_pour_atteindre: 397, echeance_annee: null,
      mois_restants: null };
    const c = observations(plafond(), null, null, [retraite]);
    const t = c.find(x => /plafond serait atteint/.test(x));
    expect(t).toBeDefined();
    // 397 − 182 = 215 mois = 17 ans 11 mois.
    expect(t).toContain("17 ans 11 mois avant");
    expect(t).toContain("« Retraite »");
  });

  it("préfère une échéance choisie à un horizon projeté", () => {
    // ⚠️ **L'écart de solidité entre les deux est grand.** Vu à l'écran, la phrase se
    // comparait à un objectif dont les 48 ans ne sont pas une date mais le résultat d'une
    // division par le versement mensuel — un chiffre qui bouge si l'épargnant change d'avis.
    // Une année saisie est un engagement.
    const mou: Objectif = { ...plafond(), id: "m", nom: "Lointain", genre: "capital",
      sur_versements: false, mois_pour_atteindre: 580, echeance_annee: null,
      mois_restants: null };
    const ferme: Objectif = { ...plafond(), id: "f", nom: "Appartement", genre: "achat",
      sur_versements: false, mois_pour_atteindre: 300, echeance_annee: 2032,
      mois_restants: 76 };
    const t = observations(plafond(), null, null, [mou, ferme])
      .find(x => /plafond serait atteint/.test(x));
    expect(t).toContain("« Appartement » (2032)");
    expect(t).not.toContain("Lointain");
    // 182 − 76 = 106 mois = 8 ans 10 mois, et le plafond tombe *après* l'échéance.
    expect(t).toContain("8 ans 10 mois après l’échéance");
  });

  it("chiffre la plus-value qui n'entame pas le plafond", () => {
    // ⚠️ **La version chiffrée de l'explication retirée.** « Les plus-values ne consomment
    // pas ce plafond » ne dépendait d'aucune donnée et se répétait à l'identique ; la même
    // idée portant trois chiffres du portefeuille grandit avec lui, et se vérifie.
    const t = observations(plafond(), 6_200)
      .find(x => /n’entament pas le plafond/.test(x));
    expect(t).toBeDefined();
    expect(t).toContain(euros(5_000));      // versés
    expect(t).toContain(euros(6_200));      // valeur
    expect(t).toContain(euros(1_200));      // plus-value
  });

  it("se taît sur une plus-value insignifiante", () => {
    // ⚠️ Le seuil porte sur la **part** : cinquante euros sur cinq mille versés est du bruit
    // de marché, pas un fait sur lequel raisonner.
    const c = observations(plafond(), 5_050);
    expect(c.some(x => /plus-value/.test(x))).toBe(false);
  });

  it("se replie sur le reste à verser quand il n'y a rien à croiser", () => {
    // ⚠️ Le repli, et lui seul, redit une soustraction que la carte laisse faire. Il
    // n'apparaît que faute de mieux : un panneau vide n'aide personne.
    const c = observations(plafond());
    expect(c).toHaveLength(1);
    // ⚠️ Le montant attendu est **construit par le formateur**, jamais recopié à la main :
    // `Intl` sépare les milliers par une espace fine insécable (U+202F) et non par celle du
    // clavier. Piège dans lequel je suis retombé quatre fois dans ce fichier.
    expect(c[0]).toContain(`reste ${euros(145_000)} à verser`);
  });

  it("ne contient aucune ligne d'explication sans chiffre", () => {
    // ⚠️ « Les plus-values ne consomment pas ce plafond » a été retirée : c'était une
    // explication, non un constat — elle ne dépendait d'aucune donnée et se répétait à
    // l'identique à chaque affichage. Ce test garde la règle : chaque ligne du panneau doit
    // porter un chiffre, sinon elle est du décor. L'explication vit dans le formulaire, là
    // où l'on choisit cette sorte d'objectif.
    for (const t of observations(plafond())) {
      expect(t, `« ${t} » ne porte aucun chiffre`).toMatch(/\d/);
    }
  });

  it("ne parle jamais de rendement, de médiane ni de pouvoir d'achat", () => {
    // ⚠️ Ces trois notions sont justes pour un objectif de capital et fausses ici : elles
    // laisseraient croire que les marchés rapprochent du plafond.
    const texte = observations(plafond({ inflation: 2, taux_attendu: 7 })).join(" ");
    expect(texte).not.toMatch(/médiane|rendement|pouvoir d’achat|d’aujourd’hui/i);
  });

  it("ne dit rien plutôt qu'un reste négatif quand le plafond est dépassé", () => {
    // ⚠️ Le repli ne s'applique qu'en dessous du plafond : au-delà, « il reste −10 000 € à
    // verser » serait absurde. Le panneau se taît, et la carte porte déjà « 100 % ».
    const c = observations(plafond({ verse_retenu: 160_000, montant_actuel: 160_000,
      atteint: true, mois_pour_atteindre: 0 }));
    expect(c.join(" ")).not.toMatch(/-\s?10 000/);
    expect(c.join(" ")).not.toMatch(/reste/);
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


describe("dureeEnClair", () => {
  it("donne les années et les mois", () => {
    // ⚠️ Contrairement à `echeanceEnClair`, qui arrondit à l'année. Celle-ci exprime le
    // résultat d'un calcul — le temps restant au rythme actuel — et arrondir « 18 ans
    // 6 mois » à « 19 ans » y jetterait la moitié de la précision disponible.
    expect(dureeEnClair(222)).toBe("18 ans 6 mois");
    expect(dureeEnClair(182)).toBe("15 ans 2 mois");
  });

  it("omet les mois quand ils tombent juste", () => {
    expect(dureeEnClair(24)).toBe("2 ans");
    expect(dureeEnClair(12)).toBe("1 an");
  });

  it("reste en mois sous un an", () => {
    expect(dureeEnClair(8)).toBe("8 mois");
    expect(dureeEnClair(11)).toBe("11 mois");
  });

  it("dit « atteint » plutôt que « 0 mois »", () => {
    expect(dureeEnClair(0)).toBe("atteint");
    expect(dureeEnClair(-3)).toBe("atteint");
  });

  it("rend null quand la durée est inconnue", () => {
    // ⚠️ `null` et non « jamais » : le serveur rend `null` quand aucune durée ne convient —
    // sans versement, par exemple. La carte doit alors dire ce qui manque, pas trancher.
    expect(dureeEnClair(null)).toBeNull();
    expect(dureeEnClair(undefined)).toBeNull();
    expect(dureeEnClair(Number.NaN)).toBeNull();
  });

  it("accorde le pluriel des années", () => {
    expect(dureeEnClair(13)).toBe("1 an 1 mois");
    expect(dureeEnClair(25)).toBe("2 ans 1 mois");
  });
});


// ── Les sensibilités ─────────────────────────────────────────────────────────
//
// ⚠️ **La frontière que cette série garde.** « À 400 € par mois, la cible reculerait de
// douze ans » est la même fonction évaluée à une autre entrée : rien n'y est prescrit, et
// l'épargnant compare deux chiffres pour trancher lui-même. « Versez 800 € » serait une
// recommandation d'investissement. Le conditionnel porte toute la différence, et il est
// facile de le perdre en reformulant une phrase.

describe("phraseSensibilite", () => {
  const versement = (kw = {}) => ({
    quoi: "versement" as const, versement: 400, taux: 7.2, mois: 397, ecart_mois: 144, ...kw,
  });

  it("dit ce que reculerait un rythme plus faible", () => {
    const t = phraseSensibilite(versement(), 800);
    expect(t).toContain("par mois");
    expect(t).toContain("reculerait de 12 ans");
    expect(t).toContain("(la moitié de votre rythme)");
  });

  it("dit ce qu'avancerait un rythme plus fort", () => {
    const t = phraseSensibilite(versement({ versement: 1_600, ecart_mois: -96 }), 800);
    expect(t).toContain("avancerait de 8 ans");
    expect(t).toContain("(le double)");
  });

  it("nomme le rendement diminué avec sa valeur", () => {
    const t = phraseSensibilite(
      { quoi: "rendement", versement: 800, taux: 6.2, mois: 433, ecart_mois: 36 }, 800);
    expect(t).toContain("un point de rendement en moins");
    expect(t).toContain("6,2 %");
    expect(t).toContain("reculerait de 3 ans");
  });

  it("dit « plus atteignable » plutôt que de taire l'impossible", () => {
    const t = phraseSensibilite(versement({ mois: null, ecart_mois: null }), 800);
    expect(t).toContain("ne serait plus atteignable");
  });

  it("se taît quand l'écart est nul", () => {
    // ⚠️ « La cible reculerait de zéro mois » n'apprend rien et occupe une ligne d'un
    // panneau qui en compte cinq.
    expect(phraseSensibilite(versement({ ecart_mois: 0 }), 800)).toBeNull();
    expect(phraseSensibilite(versement({ ecart_mois: null }), 800)).toBeNull();
  });

  it("reste au conditionnel et ne prescrit jamais", () => {
    // ⚠️ Le garde de la frontière. Une reformulation qui passerait à l'impératif —
    // « augmentez », « versez plutôt » — transformerait un calcul en conseil.
    const interdits = /augment|réduis|devriez|il faut|conseill|recommand|placez|activez|versez/i;
    const jeux = [
      versement(),
      versement({ versement: 1_600, ecart_mois: -96 }),
      versement({ mois: null, ecart_mois: null }),
      { quoi: "rendement" as const, versement: 800, taux: 6.2, mois: 433, ecart_mois: 36 },
      { quoi: "rendement" as const, versement: 800, taux: 6.2, mois: null, ecart_mois: null },
    ];
    for (const s of jeux) {
      const t = phraseSensibilite(s, 800);
      if (t) {
        expect(t).not.toMatch(interdits);
        expect(t).toMatch(/rait\b/);  // reculerait, avancerait, serait
      }
    }
  });

  it("ne cite un repère que si le rythme actuel est connu", () => {
    const t = phraseSensibilite(versement(), null);
    expect(t).not.toContain("moitié");
    expect(t).toContain("reculerait de 12 ans");
  });
});


describe("virgule décimale des constats", () => {
  it("n'écrit jamais un point décimal, sur aucune ligne", () => {
    // ⚠️ **Un filet posé sur tout le panneau, et non sur une ligne.** Il remplace un test qui
    // ne visait que « La cible représente 276.3 fois… », ligne depuis retirée — et il a
    // aussitôt attrapé un second cas vivant : « À 2.9 % d'inflation », où le taux était
    // interpolé tel quel. C'est exactement l'objectif de l'utilisateur qui portait 2,9.
    const o: Objectif = {
      id: "x", nom: "R", genre: "capital", cible: 1_250_000, echeance_annee: 2044,
      age_cible: null, part_affectee: 100, versement_mensuel: 800, taux_attendu: 7.2,
      inflation: null, taux_retrait: null, couleur: null, capital_requis: 1_250_000,
      montant_actuel: 4_524, avancement: 0.36, atteint: false, mois_restants: 220,
      valeur_projetee: null, projetee_en_euros_constants: null, mois_pour_atteindre: 397,
      verse_deja: null, verse_mesure: null, verse_retenu: null, sur_versements: false,
      sensibilites: [], versement_requis: null,
    rendement_requis: null, part_du_gain: null, stress: [],
    };
    const riche: Objectif = { ...o, inflation: 2.9, taux_attendu: 7.2,
      valeur_projetee: 373_234, projetee_en_euros_constants: 259_604,
      // 2 782 / 800 = 3,4775 → « 3,5 fois », la décimale que le filet doit surveiller.
      versement_requis: 2_782,
      sensibilites: [
        { quoi: "versement", versement: 400, taux: 7.2, mois: 506, ecart_mois: 109 },
        { quoi: "versement", versement: 1_600, taux: 7.2, mois: 296, ecart_mois: -101 },
        { quoi: "rendement", versement: 800, taux: 6.2, mois: 434, ecart_mois: 37 },
      ] };
    const lignes = observations(riche, 4_524, 373_234);
    // ⚠️ Deux ou trois, désormais : le panneau est borné et n'aligne plus huit lignes. Ce
    // que ce test garde n'est pas leur nombre mais leur écriture.
    expect(lignes.length).toBeGreaterThan(1);
    for (const t of lignes) {
      expect(t, `« ${t} » porte un point décimal`).not.toMatch(/\d\.\d/);
    }
    // ⚠️ **La ligne d'inflation a disparu du panneau** — le panneau de projection porte
    // « soit X € d'aujourd'hui » sous sa médiane, et la redire ici était une des trois
    // reformulations reprochées. Le correctif de son point décimal est donc devenu sans
    // objet : c'est le rapport au rythme actuel qui porte désormais une décimale, et c'est
    // sur lui que le filet doit mordre.
    expect(lignes.some(t => t.includes("3,5 fois"))).toBe(true);
  });
});

describe("phraseVersements", () => {
  const s = (versement: number, ecart: number) =>
    ({ quoi: "versement" as const, versement, taux: 7.2, mois: 400, ecart_mois: ecart });

  it("réunit les deux variantes en une comparaison", () => {
    // ⚠️ Deux phrases de forme identique obligeaient le lecteur à faire le rapprochement
    // lui-même. Réunies, l'encadrement est donné.
    const t = phraseVersements([s(400, 109), s(1_600, -101)], 800);
    // ⚠️ **Les montants sont construits par le formateur, jamais recopiés.** `Intl` sépare
    // les milliers par une espace fine insécable (U+202F), et « à 1 600 € » tapé au clavier
    // ne correspond pas à « à 1 600 € » produit par `euros`. C'est la **quatrième** fois que
    // ce piège se referme sur moi dans ce fichier, malgré deux commentaires l'annonçant :
    // écrire un montant à la main dans une attente est le réflexe à ne plus avoir.
    expect(t).toContain(`À ${euros(400)} par mois`);
    expect(t).toContain("elle reculerait de 9 ans 1 mois");
    expect(t).toContain(`à ${euros(1_600)}`);
    expect(t).toContain("elle avancerait de 8 ans 5 mois");
    // Une seule phrase, donc un seul point final.
    expect((t!.match(/\./g) || []).length).toBe(1);
  });

  it("retombe sur la phrase unitaire s'il n'y en a qu'une", () => {
    const t = phraseVersements([s(400, 109)], 800);
    expect(t).toContain("(la moitié de votre rythme)");
  });

  it("écarte les variantes sans écart et rend null s'il n'en reste aucune", () => {
    expect(phraseVersements([s(400, 0), s(1_600, 0)], 800)).toBeNull();
    expect(phraseVersements([], 800)).toBeNull();
  });

  it("dit l'inatteignable au milieu d'une comparaison", () => {
    const t = phraseVersements(
      [{ ...s(400, 0), mois: null, ecart_mois: null }, s(1_600, -101)], 800);
    expect(t).toContain("ne serait plus atteignable");
    expect(t).toContain("avancerait");
  });
});


describe("phraseMarginale", () => {
  const base = (kw: Partial<Objectif> = {}): Objectif => ({
    id: "x", nom: "R", genre: "capital", cible: 1_000_000, echeance_annee: 2044,
    age_cible: null, part_affectee: 100, versement_mensuel: 800, taux_attendu: 7.2,
    inflation: null, taux_retrait: null, couleur: null, capital_requis: 1_000_000,
    montant_actuel: 100_000, avancement: 10, atteint: false, mois_restants: 220,
    valeur_projetee: null, projetee_en_euros_constants: null, mois_pour_atteindre: 240,
    verse_deja: null, verse_mesure: null, verse_retenu: null, sur_versements: false,
    versement_requis: null, rendement_requis: null, part_du_gain: null, stress: [],
    sensibilites: [
      { quoi: "versement_marginal", versement: 900, taux: 7.2, mois: 219, ecart_mois: -21 },
    ],
    ...kw,
  });

  it("donne le pas, le nouveau rythme et l'effet en années", () => {
    const t = phraseMarginale(base());
    expect(t).toContain(`${euros(100)} de plus par mois`);
    expect(t).toContain(`${euros(900)} au lieu de ${euros(800)}`);
    expect(t).toContain("rapprocheraient la cible de 1 an 9 mois");
  });

  it("dit « le plafond » pour un objectif de versements", () => {
    const t = phraseMarginale(base({ sur_versements: true, genre: "plafond_versements" }));
    expect(t).toContain("rapprocheraient le plafond de");
  });

  it("n'emploie aucun verbe à la deuxième personne", () => {
    // ⚠️ **La formule évite le verbe d'action plutôt que de le mettre au conditionnel.** On
    // ne peut pas glisser vers l'impératif un texte qui n'a pas de sujet à qui l'adresser :
    // « cent euros de plus par mois » n'a pas d'impératif possible, « augmentez » en est un.
    const interdits = /augment|réduis|devriez|il faut|conseill|recommand|placez|activez|versez/i;
    for (const o of [base(), base({ sur_versements: true }),
      base({ sensibilites: [{ quoi: "versement_marginal", versement: 900, taux: 7.2,
        mois: null, ecart_mois: null }] })]) {
      const t = phraseMarginale(o);
      if (t) expect(t).not.toMatch(interdits);
    }
  });

  it("dit qu'un pas insuffisant ne suffit pas, plutôt que de se taire", () => {
    const t = phraseMarginale(base({ sensibilites: [
      { quoi: "versement_marginal", versement: 900, taux: 7.2, mois: null, ecart_mois: null },
    ] }));
    expect(t).toContain("ne suffiraient pas");
  });

  it("se taît quand l'effet est nul ou la variante absente", () => {
    expect(phraseMarginale(base({ sensibilites: [] }))).toBeNull();
    expect(phraseMarginale(base({ sensibilites: [
      { quoi: "versement_marginal", versement: 900, taux: 7.2, mois: 240, ecart_mois: 0 },
    ] }))).toBeNull();
  });
});
