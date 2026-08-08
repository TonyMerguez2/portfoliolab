import { describe, it, expect } from "vitest";
import {
  BANDES, bandeDuScore, couvertureFacteurs, EXPLICATION_FACTEUR, facteurLePlusFaible,
  FACTEURS_DU_PROFIL, LIBELLE_FACTEUR, ORDRE, TOLERANCES, type Facteur,
} from "./analyse";

const f = (score: number | null, compte = true): Facteur =>
  ({ valeur: score, libelle: "x", score, compte });

describe("couvertureFacteurs", () => {
  it("compte les facteurs mesurés parmi les notants", () => {
    const out = couvertureFacteurs({ concentration: f(40), volatilite: f(null), redondance: f(70) });
    expect(out).toEqual({ mesures: 2, total: 3 });
  });

  it("exclut du total un facteur indicatif", () => {
    // ⚠️ « 3 sur 3 » laisserait croire que la perte maximale pèse dans la note.
    const out = couvertureFacteurs({
      concentration: f(40), redondance: f(70), perte_max: f(100, false),
    });
    expect(out).toEqual({ mesures: 2, total: 2 });
  });

  it("rend zéro mesure sans facteurs", () => {
    expect(couvertureFacteurs(undefined)).toEqual({ mesures: 0, total: 0 });
    expect(couvertureFacteurs({})).toEqual({ mesures: 0, total: 0 });
  });

  it("ignore une clé inconnue plutôt que de la compter", () => {
    // Un facteur ajouté côté serveur sans être déclaré ici ne doit pas gonfler
    // la couverture : l'écran ne saurait pas l'afficher.
    expect(couvertureFacteurs({ inconnu: f(90) }).mesures).toBe(0);
  });
});

describe("facteurLePlusFaible", () => {
  it("désigne le facteur qui coûte le plus de points", () => {
    const out = facteurLePlusFaible({ concentration: f(12), volatilite: f(80), redondance: f(45) });
    expect(out).toEqual({ cle: "concentration", libelle: "Concentration", score: 12 });
  });

  it("écarte les facteurs non mesurés", () => {
    // ⚠️ Un facteur nul ne coûte rien : il est exclu de la moyenne, donc il ne
    // peut pas être la cause d'une note basse.
    const out = facteurLePlusFaible({ perte_max: f(null), volatilite: f(55) });
    expect(out?.cle).toBe("volatilite");
  });

  it("rend null quand rien n'est mesuré", () => {
    expect(facteurLePlusFaible({ perte_max: f(null) })).toBeNull();
    expect(facteurLePlusFaible(undefined)).toBeNull();
  });

  it("départage deux facteurs à égalité par l'ordre d'affichage", () => {
    // Déterministe plutôt qu'au hasard : le bandeau doit dire deux fois la même
    // chose pour un même portefeuille.
    const out = facteurLePlusFaible({ concentration: f(30), volatilite: f(30) });
    expect(out?.cle).toBe("concentration");
    expect(ORDRE.indexOf("concentration")).toBeLessThan(ORDRE.indexOf("volatilite"));
  });

  it("accepte un score de zéro comme candidat", () => {
    expect(facteurLePlusFaible({ concentration: f(0), volatilite: f(50) })?.score).toBe(0);
  });
});

describe("facteurs indicatifs", () => {
  it("n'accuse pas un facteur qui ne coûte rien", () => {
    // La perte maximale peut être la plus mal notée sans peser dans la moyenne :
    // la nommer comme cause enverrait corriger ce qui n'y est pour rien.
    const out = facteurLePlusFaible({ perte_max: f(5, false), volatilite: f(60) });
    expect(out?.cle).toBe("volatilite");
  });

  it("traite un facteur sans la clé comme notant", () => {
    const sansCle = { valeur: 20, libelle: "x", score: 20 } as Facteur;
    expect(facteurLePlusFaible({ concentration: sansCle, volatilite: f(80) })?.cle)
      .toBe("concentration");
  });
});

describe("FACTEURS_DU_PROFIL", () => {
  it("désigne le seul facteur qui attend un profil", () => {
    // ⚠️ Ils étaient trois. Le bêta a été supprimé — biaisé vers zéro pour toute
    // ligne cotée hors de New York, il certifiait conforme à une cible de 65 %
    // d'actions un portefeuille investi à cent pour cent. La perte maximale ne note
    // plus : son score corrélait à 0,88 avec celui de la volatilité.
    expect(FACTEURS_DU_PROFIL).toEqual(["volatilite"]);
    // Chacun doit avoir un libellé, sinon l'invite citerait une clé technique.
    for (const k of FACTEURS_DU_PROFIL) expect(LIBELLE_FACTEUR[k]).toBeTruthy();
  });

  it("est cohérent avec l'ordre d'affichage", () => {
    for (const k of FACTEURS_DU_PROFIL) expect(ORDRE).toContain(k);
  });
});

describe("les facteurs retirés à l'audit", () => {
  it("ne reparaissent ni dans l'ordre ni dans les libellés", () => {
    // Sept facteurs ont été supprimés, chacun pour une raison mesurée. Les nommer
    // ici fait échouer un retour involontaire au lieu de le laisser repeupler
    // l'écran en silence.
    for (const k of ["devise", "sensibilite_marche", "liquidite", "efficacite",
                     "correlation", "classes_actifs"]) {
      expect(ORDRE, k).not.toContain(k);
      expect(LIBELLE_FACTEUR[k], k).toBeUndefined();
    }
  });

  it("laisse un ordre dont chaque entrée est nommée et expliquée", () => {
    // Une clé sans libellé s'afficherait telle quelle — « perte_max » — et une clé
    // sans explication laisserait l'infobulle vide.
    for (const k of ORDRE) {
      expect(LIBELLE_FACTEUR[k], k).toBeTruthy();
      expect(EXPLICATION_FACTEUR[k], k).toBeTruthy();
    }
  });
});

describe("TOLERANCES", () => {
  it("propose trois niveaux, chacun expliqué par un comportement", () => {
    // ⚠️ La tolérance ne se mesure pas à ce qu'on souhaite mais à ce qu'on fait
    // dans la baisse : les intitulés décrivent donc une réaction, pas une envie.
    expect(TOLERANCES).toHaveLength(3);
    for (const t of TOLERANCES) {
      expect(t.libelle).toBeTruthy();
      expect(t.detail.length).toBeGreaterThan(20);
    }
  });

  it("n'a pas de doublon de valeur", () => {
    expect(new Set(TOLERANCES.map(t => t.valeur)).size).toBe(3);
  });
});

describe("BANDES", () => {
  it("porte les mêmes seuils et les mêmes mots que le serveur", () => {
    // ⚠️ Le libellé affiché vient du serveur ; ces seuils ne servent qu'à l'encre.
    // Une divergence colorerait un « Bon » du vert de « Très bon » sans changer le
    // mot, et rien ne le signalerait. Les valeurs sont donc recopiées de
    // `BANDES` dans `analyse.py` — à modifier des deux côtés ensemble.
    expect(BANDES).toEqual([
      { min: 88, nom: "Très bon" },
      { min: 70, nom: "Bon" },
      { min: 50, nom: "Moyen" },
      { min: 30, nom: "Faible" },
      { min: 0,  nom: "Très faible" },
    ]);
  });

  it("n'emploie plus le vocabulaire de l'ancien score local", () => {
    // « Excellent » et « À risque » venaient du score à quatre critères remplacé.
    // Ils vivaient encore dans `scoreLabel`, affiché sur l'anneau du bandeau : deux
    // vocabulaires pour une même note.
    const mots = BANDES.map(b => b.nom);
    expect(mots).not.toContain("Excellent");
    expect(mots).not.toContain("À risque");
  });

  it("nomme chaque score, bornes comprises", () => {
    expect(bandeDuScore(100)).toBe("Très bon");
    expect(bandeDuScore(88)).toBe("Très bon");
    expect(bandeDuScore(87)).toBe("Bon");
    expect(bandeDuScore(0)).toBe("Très faible");
  });
});
