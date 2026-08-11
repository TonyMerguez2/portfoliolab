import { describe, expect, it } from "vitest";

import {
  MAXIMUM_AFFICHE, aideALaDecision, confiance, confianceEnClair, hypotheses,
  type Contexte,
} from "./aideDecision";
import { euros, type Objectif } from "./objectifs";

/**
 * Le moteur d'aide à la décision.
 *
 * ⚠️ **Ce qui est éprouvé ici est le *choix*, pas le calcul.** Les grandeurs arrivent du
 * serveur, où elles sont testées ; ce module décide lesquelles méritent une phrase, avec quelle
 * priorité et dans quel ordre. Les tests portent donc sur les seuils, le classement, et le
 * refus de parler quand une entrée manque.
 */

/** Un objectif de capital daté, complet — le cas de référence. */
const objectif = (kw: Partial<Objectif> = {}): Objectif => ({
  id: "o1", nom: "Retraite", genre: "capital", cible: 1_000_000,
  echeance_annee: 2044, age_cible: null, part_affectee: 100,
  versement_mensuel: 800, taux_attendu: 7, inflation: 2, taux_retrait: null,
  couleur: null, capital_requis: 1_000_000, montant_actuel: 180_000,
  avancement: 18, atteint: false, mois_restants: 220,
  valeur_projetee: 900_000, projetee_en_euros_constants: 600_000,
  mois_pour_atteindre: 214,
  verse_deja: null, verse_mesure: null, verse_retenu: null, sur_versements: false,
  sensibilites: [], versement_requis: 900, rendement_requis: 7.4,
  part_du_gain: { apport: 356_000, gain: 544_000, part_gain: 60.4 },
  stress: [], ...kw,
});

const contexte = (kw: Partial<Contexte> = {}): Contexte => ({
  valeurPortefeuille: 180_000, sommeDesParts: 100, autres: [],
  volatilite: 12, volatiliteSource: "mesuree", seancesMesurees: 900, ...kw,
});

// ── Le classement, qui est le cœur du module ─────────────────────────────────

describe("classement et sélection", () => {
  it("n’affiche jamais plus de trois insights", () => {
    // ⚠️ Toutes les familles sont évaluées avant de couper : le nombre est une contrainte de
    // lecture, pas une limite du moteur.
    const riche = objectif({
      part_affectee: 20,
      stress: [{ cle: "rendement_moins_2", libelle: "Rendement inférieur de 2 points",
        mois: 300, ecart_mois: 86, pouvoir_achat_perdu: null }],
      sensibilites: [{ quoi: "versement_marginal", versement: 900, taux: 7,
        mois: 190, ecart_mois: -24 }],
    });
    const tous = aideALaDecision(riche, contexte({ sommeDesParts: 200, volatilite: 31 }));
    // ⚠️ Comparé à la constante et non à un littéral : le jour où le nombre change, c'est la
    // constante qu'on modifie, et ce test doit suivre sans devenir faux.
    expect(tous.length).toBe(MAXIMUM_AFFICHE);
  });

  it("met l’incohérence critique avant un jalon positif", () => {
    // ⚠️ Le piège du premier générateur qui gagne : l'ordre d'évaluation n'est pas l'ordre
    // d'affichage. Un chevauchement critique doit passer devant tout le reste.
    const tous = aideALaDecision(objectif(), contexte({ sommeDesParts: 200 }));
    expect(tous[0].famille).toBe("chevauchement");
    expect(tous[0].priorite).toBe("critique");
  });

  it("place le risque avant le calendrier à priorité égale", () => {
    const tous = aideALaDecision(
      objectif({ mois_restants: 24, mois_pour_atteindre: 30 }),
      contexte({ volatilite: 31 }));
    // Horizon de deux ans et volatilité de 31 % : critique, et devant le retard.
    expect(tous[0].famille).toBe("risque");
    expect(tous[0].priorite).toBe("critique");
  });

  it("ne cite jamais deux fois la même famille", () => {
    // Deux générateurs alimentent « rendement_requis » : le rendement nécessaire et la
    // dépendance à la capitalisation. Un seul doit passer.
    const tous = aideALaDecision(
      objectif({ rendement_requis: 18, part_du_gain: { apport: 1, gain: 9, part_gain: 90 } }),
      contexte());
    const familles = tous.map(i => i.famille);
    expect(new Set(familles).size).toBe(familles.length);
  });

  it("ne rend rien sans objectif", () => {
    expect(aideALaDecision(null)).toEqual([]);
  });
});

// ── Les douze situations à couvrir ───────────────────────────────────────────

describe("situations", () => {
  it("capital cible sans date : pas de calendrier, mais un jalon", () => {
    // ⚠️ Sans échéance, la moitié des familles se taisent — et c'est le comportement voulu :
    // un insight bâti sur une date que personne n'a fixée serait une invention.
    const tous = aideALaDecision(
      objectif({ echeance_annee: null, mois_restants: null, versement_requis: null,
        rendement_requis: null, part_du_gain: null }),
      contexte());
    expect(tous.some(i => i.famille === "calendrier")).toBe(false);
    expect(tous.some(i => i.famille === "jalon")).toBe(true);
  });

  it("capital cible avec date : avance signalée comme positive", () => {
    const tous = aideALaDecision(
      objectif({ mois_restants: 240, mois_pour_atteindre: 214 }), contexte());
    const cal = tous.find(i => i.famille === "calendrier");
    expect(cal?.priorite).toBe("positive");
    expect(cal?.titre).toContain("en avance");
    expect(cal?.metrique?.valeur).toBe("2 ans 2 mois");
  });

  it("capital à un âge : traité comme un capital daté", () => {
    const tous = aideALaDecision(
      objectif({ genre: "capital_age", age_cible: 50, echeance_annee: 2051,
        mois_restants: 300, mois_pour_atteindre: 260 }), contexte());
    expect(tous.some(i => i.famille === "calendrier")).toBe(true);
  });

  it("achat proche : l’horizon court passe en critique", () => {
    const tous = aideALaDecision(
      objectif({ genre: "achat", cible: 300_000, capital_requis: 300_000,
        mois_restants: 28, mois_pour_atteindre: 30 }),
      contexte({ volatilite: 31 }));
    const r = tous.find(i => i.famille === "risque");
    expect(r?.priorite).toBe("critique");
    expect(r?.titre).toContain("horizon est court");
    expect(r?.description).toContain("2 ans 4 mois");
  });

  it("revenu mensuel : le taux de retrait figure dans les hypothèses", () => {
    // ⚠️ Exigence explicite : le taux de retrait est une hypothèse, pas une constante. Il
    // doit se lire, sinon 4 % passe pour une loi.
    const o = objectif({ genre: "revenu_mensuel", cible: 2_000, taux_retrait: 4,
      capital_requis: 600_000 });
    expect(hypotheses(o).some(h => h.includes("taux de retrait"))).toBe(true);
    expect(hypotheses(o).some(h => h.includes("4"))).toBe(true);
  });

  it("plafond PEA : plus-value hors plafond et comparaison des horizons", () => {
    const plafond = objectif({
      id: "p", nom: "PEA", genre: "plafond_versements", sur_versements: true,
      cible: 150_000, capital_requis: 150_000, montant_actuel: 4_000,
      verse_retenu: 4_000, avancement: 2.7, echeance_annee: null, mois_restants: null,
      mois_pour_atteindre: 182, part_affectee: null, taux_attendu: null,
      inflation: null, versement_requis: null, rendement_requis: null,
      part_du_gain: null,
    });
    const autre = objectif({ id: "o2", nom: "Retraite", mois_restants: 300 });
    const tous = aideALaDecision(plafond, contexte({ valeurPortefeuille: 4_600,
      autres: [autre] }));
    expect(tous.some(i => i.titre.includes("plus-values n’entament pas"))).toBe(true);
    expect(tous.some(i => i.famille === "calendrier"
      && i.description.includes("capacité de versement"))).toBe(true);
  });

  it("objectif très en avance : positif, et le retard n’est pas évoqué", () => {
    const tous = aideALaDecision(
      objectif({ mois_restants: 300, mois_pour_atteindre: 100 }), contexte());
    const cal = tous.find(i => i.famille === "calendrier");
    expect(cal?.priorite).toBe("positive");
    expect(cal?.titre).toContain("en avance");
    // 300 − 100 = 200 mois = 16 ans 8 mois.
    expect(cal?.metrique?.valeur).toBe("16 ans 8 mois");
    expect(tous.every(i => !i.titre.includes("retard"))).toBe(true);
  });

  it("objectif très en retard : critique au-delà de la moitié de l’horizon", () => {
    const tous = aideALaDecision(
      objectif({ mois_restants: 120, mois_pour_atteindre: 400 }), contexte());
    const cal = tous.find(i => i.famille === "calendrier");
    expect(cal?.priorite).toBe("critique");
    expect(cal?.titre).toContain("ne serait pas tenue");
  });

  it("chevauchement au-delà de cent pour cent : critique et objectifs liés", () => {
    const autre = objectif({ id: "o2", nom: "Achat immobilier" });
    const tous = aideALaDecision(objectif(),
      contexte({ sommeDesParts: 200, autres: [autre] }));
    const ch = tous.find(i => i.famille === "chevauchement");
    expect(ch?.priorite).toBe("critique");
    expect(ch?.objectifsLies).toContain("o2");
    expect(ch?.description).toContain("le même euro");
  });

  it("rendement irréaliste : critique, et le chiffre est cité", () => {
    const tous = aideALaDecision(objectif({ rendement_requis: 18.5 }), contexte());
    const r = tous.find(i => i.famille === "rendement_requis");
    expect(r?.priorite).toBe("critique");
    expect(r?.description).toContain("18,5 %");
    expect(r?.titre).toContain("hors de portée");
  });

  it("horizon très court et forte volatilité : critique", () => {
    const tous = aideALaDecision(
      objectif({ mois_restants: 18, mois_pour_atteindre: 20 }),
      contexte({ volatilite: 34 }));
    expect(tous[0].famille).toBe("risque");
    expect(tous[0].priorite).toBe("critique");
  });

  it("données insuffisantes : peu d’insights, et une confiance basse", () => {
    // ⚠️ Le cas qui doit rester silencieux plutôt que bavard. Sans rendement, sans échéance
    // et sans volatilité mesurable, il ne reste qu'où l'on en est.
    const nu = objectif({
      taux_attendu: null, inflation: null, echeance_annee: null, mois_restants: null,
      mois_pour_atteindre: null, versement_requis: null, rendement_requis: null,
      part_du_gain: null, valeur_projetee: null, projetee_en_euros_constants: null,
    });
    const tous = aideALaDecision(nu, contexte({ volatiliteSource: "indisponible",
      volatilite: null }));
    expect(tous.length).toBeLessThanOrEqual(2);
    for (const i of tous) expect(i.confiance).toBeLessThan(0.7);
  });
});

// ── L'inflation ──────────────────────────────────────────────────────────────

describe("inflation", () => {
  it("porte sur la cible, pas sur la projection", () => {
    // ⚠️ La projection en euros constants est déjà affichée sous la médiane du panneau
    // voisin. Ce qui n'est dit nulle part, c'est ce que vaudra l'objectif lui-même — le
    // nombre que l'épargnant a choisi comme suffisant.
    const tous = aideALaDecision(
      objectif({ inflation: 2, mois_restants: 360, cible: 1_000_000,
        capital_requis: 1_000_000 }), contexte());
    const inf = tous.find(i => i.famille === "inflation");
    expect(inf).toBeDefined();
    expect(inf!.titre).toContain(euros(1_000_000));
    // 1 M€ à 2 % sur trente ans : environ 552 000 € d'aujourd'hui.
    expect(inf!.metrique?.valeur).toBe(euros(1_000_000 / 1.02 ** 30));
  });

  it("se taît sous dix ans d’horizon", () => {
    const tous = aideALaDecision(
      objectif({ inflation: 2, mois_restants: 60 }), contexte());
    expect(tous.some(i => i.famille === "inflation")).toBe(false);
  });
});

// ── Confiance ────────────────────────────────────────────────────────────────

describe("confiance", () => {
  it("est haute quand tout est renseigné et mesuré", () => {
    const { valeur, motifs } = confiance(objectif(), contexte(), { volatilite: true });
    expect(valeur).toBe(1);
    expect(motifs.some(m => m.includes("mesurée"))).toBe(true);
    expect(confianceEnClair(valeur)).toBe("Confiance élevée");
  });

  it("baisse et se justifie quand des entrées manquent", () => {
    const { valeur, motifs } = confiance(
      objectif({ taux_attendu: null, mois_restants: null }),
      contexte({ volatiliteSource: "echantillon_court", valeurPortefeuille: null }),
      { volatilite: true });
    expect(valeur).toBeLessThan(0.5);
    expect(motifs).toContain("aucun rendement attendu");
    expect(motifs).toContain("objectif sans échéance");
    expect(confianceEnClair(valeur)).toBe("Estimation indicative");
  });

  it("ne descend jamais à zéro", () => {
    // ⚠️ Un plancher, parce que « confiance 0 » se lirait comme « faux » alors que
    // l'arithmétique reste juste : ce sont les entrées qui sont incomplètes.
    const { valeur } = confiance(
      objectif({ taux_attendu: null, mois_restants: null }),
      contexte({ volatiliteSource: "indisponible", valeurPortefeuille: null }),
      { volatilite: true });
    expect(valeur).toBeGreaterThan(0);
  });
});

// ── La règle qui ne doit jamais céder ────────────────────────────────────────

describe("aucune recommandation", () => {
  it("n’emploie ni impératif ni verbe d’action à la deuxième personne", () => {
    /**
     * ⚠️ Le garde contre la dérive de la maquette, qui proposait « augmenter votre
     * investissement mensuel à 1 000 € » et « réduire l'exposition aux actions à 70 % ».
     * Le test couvre titres, descriptions et métriques de toutes les familles, sur des jeux
     * de données choisis pour les déclencher toutes.
     */
    const interdits =
      /augmentez|réduisez|devriez|il faut |il faudrait que|conseill|recommand|placez|activez|vendez|achetez|versez /i;
    const jeux: [Objectif, Contexte][] = [
      [objectif(), contexte()],
      [objectif({ rendement_requis: 22 }), contexte({ sommeDesParts: 240, volatilite: 38 })],
      [objectif({ mois_restants: 12, mois_pour_atteindre: 500 }), contexte({ volatilite: 40 })],
      [objectif({ mois_pour_atteindre: null }), contexte()],
      [objectif({ versement_mensuel: null, versement_requis: 1_200 }), contexte()],
      [objectif({ part_affectee: 20 }), contexte()],
      [objectif({ atteint: true, avancement: 100, montant_actuel: 1_000_000 }), contexte()],
      [objectif({ sur_versements: true, genre: "plafond_versements", verse_retenu: 4_000 }),
        contexte({ valeurPortefeuille: 6_000 })],
      [objectif({ stress: [{ cle: "baisse_20", libelle: "Baisse immédiate de 20 %",
        mois: 300, ecart_mois: 86, pouvoir_achat_perdu: null }] }), contexte()],
      [objectif({ sensibilites: [{ quoi: "versement_marginal", versement: 900, taux: 7,
        mois: 190, ecart_mois: -24 }] }), contexte()],
    ];
    let vus = 0;
    for (const [o, c] of jeux) {
      for (const i of aideALaDecision(o, c)) {
        vus += 1;
        expect(i.titre, i.titre).not.toMatch(interdits);
        expect(i.description, i.description).not.toMatch(interdits);
        expect(i.metrique?.valeur ?? "", i.metrique?.valeur).not.toMatch(interdits);
      }
    }
    // Le test ne vaut que s'il a vraiment lu des insights.
    expect(vus).toBeGreaterThan(15);
  });

  it("chaque insight porte ses hypothèses et un motif de confiance", () => {
    // ⚠️ Un chiffre sans ses entrées n'est pas vérifiable : « atteint en 2043 » ne veut rien
    // dire sans « à 800 €/mois et 7 %/an ».
    for (const i of aideALaDecision(objectif(), contexte())) {
      expect(i.hypotheses.length).toBeGreaterThan(0);
      expect(i.motifs.length).toBeGreaterThan(0);
      expect(i.confiance).toBeGreaterThan(0);
    }
  });
});

// ── Deux défauts vus dans la sortie réelle ───────────────────────────────────

describe("écriture", () => {
  it("accorde le verbe du pas marginal au pluriel", () => {
    // ⚠️ Vu à l'écran : « 100 € de plus par mois rapprocherait la cible ». Le sujet est
    // « cent euros », pas « un pas ». Une faute d'accord accroche l'œil autant qu'une faute
    // de calcul, et jette le doute sur le reste de la carte.
    const tous = aideALaDecision(
      objectif({ sensibilites: [{ quoi: "versement_marginal", versement: 900, taux: 7,
        mois: 190, ecart_mois: -24 }] }), contexte());
    const m = tous.find(i => i.famille === "pas_marginal");
    expect(m, "l’insight du pas marginal doit être présent").toBeDefined();
    expect(m!.titre).toContain("rapprocheraient");
    expect(m!.titre).not.toContain("rapprocherait la");
  });

  it("écrit « < 1 % » plutôt que « 0 % » sur un objectif à peine entamé", () => {
    // ⚠️ Vu à l'écran sur « Liberté financière » : 905 € sur 1 500 000 € font 0,06 %, écrits
    // « 0 % » par un arrondi — indiscernable d'un objectif auquel on n'a rien affecté, alors
    // qu'un versement a bien commencé. C'est le défaut que `pourcentageLisible` existe pour
    // empêcher, et il était réapparu ici.
    const tous = aideALaDecision(
      objectif({ avancement: 0.06, montant_actuel: 905, capital_requis: 1_500_000,
        echeance_annee: null, mois_restants: null, versement_requis: null,
        rendement_requis: null, part_du_gain: null }), contexte());
    const j = tous.find(i => i.famille === "jalon");
    expect(j?.titre).toContain("< 1 %");
    expect(j?.metrique?.valeur).toBe("< 1 %");
  });
});


describe("le rythme requis, longtemps mort-né", () => {
  it("est produit quand une échéance et un versement requis existent", () => {
    /**
     * ⚠️ **Ce générateur existait sans être appelé.** Il manquait à la liste des familles
     * évaluées : le « rythme requis » — l'une des interprétations les plus utiles, et une
     * demande explicite — n'était jamais produit. Ni `tsc` ni `eslint` ne le signalent, une
     * fonction non exportée n'étant référencée que par cette liste. Ce test est le filet.
     */
    const tous = aideALaDecision(
      objectif({ versement_requis: 2_800, versement_mensuel: 800,
        // On neutralise les familles mieux classées, pour que celle-ci soit visible.
        part_du_gain: null, rendement_requis: null, mois_pour_atteindre: 214,
        mois_restants: 220 }),
      contexte());
    const v = tous.find(i => i.famille === "versement");
    expect(v, "le rythme requis doit être produit").toBeDefined();
    expect(v!.titre).toContain("rythme requis");
    expect(v!.description).toContain(euros(2_800));
    expect(v!.metrique?.valeur).toBe(`${euros(2_800)} / mois`);
    // 2 800 / 800 = 3,5 fois le rythme actuel.
    expect(v!.description).toContain("3,5 fois");
  });

  it("salue un rythme qui dépasse le minimum requis", () => {
    const tous = aideALaDecision(
      objectif({ versement_requis: 600, versement_mensuel: 800,
        part_du_gain: null, rendement_requis: null }),
      contexte());
    const v = tous.find(i => i.famille === "versement");
    expect(v?.priorite).toBe("positive");
    expect(v?.titre).toContain("dépasse le minimum requis");
  });
});

// ── L'objectif sans échéance, cas réel qui ne rendait que deux aides ─────────

describe("objectif sans échéance", () => {
  /**
   * ⚠️ **Un seul champ vide faisait taire six familles sur neuf.** Sur un objectif de capital
   * sans année cible — 500 000 €, 300 €/mois, 9,5 %/an, 2,9 % d'inflation — la carte ne
   * proposait que deux aides. Or trois des six familles muettes n'avaient nul besoin d'une
   * *échéance* : elles ont besoin d'un *horizon*, et la date d'arrivée au rythme actuel en est
   * un parfaitement valable. Le serveur les alimente désormais dans ce cas.
   */
  const sansDate = (kw: Partial<Objectif> = {}): Objectif => objectif({
    cible: 500_000, capital_requis: 500_000, montant_actuel: 5_000, avancement: 1,
    versement_mensuel: 300, taux_attendu: 9.5, inflation: 2.9,
    echeance_annee: null, mois_restants: null, mois_pour_atteindre: 396,
    versement_requis: null, rendement_requis: null,
    part_du_gain: { apport: 123_800, gain: 376_200, part_gain: 75.2 },
    stress: [{ cle: "rendement_moins_2", libelle: "Un rendement inférieur de 2 points",
      mois: 468, ecart_mois: 72, pouvoir_achat_perdu: null }],
    sensibilites: [{ quoi: "versement_marginal", versement: 400, taux: 9.5,
      mois: 360, ecart_mois: -36 }],
    ...kw,
  });

  it("remplit les quatre places sans échéance", () => {
    const tous = aideALaDecision(sansDate(), contexte());
    expect(tous).toHaveLength(MAXIMUM_AFFICHE);
  });

  it("ne redit pas la durée que la carte affiche déjà", () => {
    // ⚠️ La carte de l'objectif porte « reste 33 ans » : un insight qui répéterait cette durée
    // serait une reformulation, pas une interprétation. La famille « calendrier » se taît donc
    // faute d'échéance à comparer.
    const tous = aideALaDecision(sansDate(), contexte());
    expect(tous.some(i => i.famille === "calendrier")).toBe(false);
  });

  it("mesure l’inflation sur l’horizon projeté", () => {
    const inf = aideALaDecision(sansDate(), contexte())
      .find(i => i.famille === "inflation");
    expect(inf).toBeDefined();
    // 500 000 € à 2,9 % sur 396 mois — l'horizon d'arrivée, faute d'échéance.
    expect(inf!.metrique?.valeur).toBe(euros(500_000 / 1.029 ** (396 / 12)));
    expect(inf!.description).toContain("33 ans");
  });

  it("mesure la dépendance au rendement sur le même horizon", () => {
    const d = aideALaDecision(sansDate(), contexte())
      .find(i => i.famille === "rendement_requis");
    expect(d).toBeDefined();
    expect(d!.titre).toContain("dépend surtout de la capitalisation");
    expect(d!.metrique?.valeur).toBe("75 %");
  });

  it("se taît toujours sur ce qui exige une date choisie", () => {
    // ⚠️ « Quel rendement pour y être en 2044 » n'a pas de sens sans 2044, et le calculer sur
    // l'horizon projeté rendrait mécaniquement le rendement déjà retenu — une tautologie.
    const tous = aideALaDecision(sansDate(), contexte());
    expect(tous.some(i => i.famille === "versement")).toBe(false);
    expect(tous.some(i => i.titre.includes("rendement hors de portée"))).toBe(false);
  });
});
