import { describe, it, expect } from "vitest";
import { TOLERANCES } from "./analyse";
import {
  BANDES, bandeDuScore, LIBELLE_PROFIL, pilierLePlusFaible, type Pilier,
} from "./portfolio-score/types";

/**
 * ⚠️ Ce fichier testait l'ancien score plat : `couvertureFacteurs`,
 * `facteurLePlusFaible`, `ORDRE`, `LIBELLE_FACTEUR`. Ces exports ont disparu avec le
 * passage aux cinq piliers, et leurs tests **passaient encore** en vérifiant du code
 * que plus rien n'appelait. Un test vert sur du code mort est pire qu'absent : il
 * donne l'illusion d'une couverture.
 */

const pilier = (cle: string, score: number | null, poidsEffectif = 20): Pilier => ({
  cle, libelle: cle, score, poids: 20, poids_effectif: poidsEffectif,
  explication: "x", metriques: [],
});

describe("BANDES", () => {
  it("porte les mêmes seuils et les mêmes mots que le serveur", () => {
    // ⚠️ Le libellé affiché vient du serveur ; ces seuils ne servent qu'à l'encre.
    // Une divergence colorerait un « Bon » du vert d'un « Excellent » sans changer le
    // mot, et rien ne le signalerait. Recopiés de `config.BANDES` — à modifier des
    // deux côtés ensemble.
    expect(BANDES).toEqual([
      { min: 90, nom: "Excellent" },
      { min: 80, nom: "Très bon" },
      { min: 70, nom: "Bon" },
      { min: 60, nom: "Correct" },
      { min: 40, nom: "À améliorer" },
      { min: 0,  nom: "Fragile" },
    ]);
  });

  it("écarte « Exceptionnel » et le vocabulaire de l'ancien score", () => {
    // « Exceptionnel » suggérerait une recommandation ou une garantie. « Excellent »
    // et « À risque » venaient du score local à quatre critères, remplacé.
    const mots = BANDES.map(b => b.nom);
    expect(mots).not.toContain("Exceptionnel");
    expect(mots).not.toContain("À risque");
  });

  it("nomme chaque score, bornes comprises", () => {
    expect(bandeDuScore(100)).toBe("Excellent");
    expect(bandeDuScore(90)).toBe("Excellent");
    expect(bandeDuScore(89)).toBe("Très bon");
    expect(bandeDuScore(0)).toBe("Fragile");
  });
});

describe("pilierLePlusFaible", () => {
  it("désigne le pilier qui coûte le plus de points", () => {
    const p = pilierLePlusFaible([
      pilier("risque", 90), pilier("qualite", 40), pilier("construction", 70),
    ]);
    expect(p?.cle).toBe("qualite");
  });

  it("écarte les piliers hors du calcul", () => {
    // ⚠️ Un pilier non mesuré ne coûte aucun point : il est écarté de la moyenne, donc
    // il ne peut pas être la cause d'une note basse. Le nommer enverrait corriger ce
    // qui n'y est pour rien.
    const p = pilierLePlusFaible([
      pilier("risque", null, 0), pilier("qualite", 60),
    ]);
    expect(p?.cle).toBe("qualite");
  });

  it("rend null quand rien n'est mesuré", () => {
    expect(pilierLePlusFaible([pilier("risque", null, 0)])).toBeNull();
    expect(pilierLePlusFaible(undefined)).toBeNull();
  });

  it("accepte un score de zéro comme candidat", () => {
    expect(pilierLePlusFaible([pilier("a", 0), pilier("b", 50)])?.score).toBe(0);
  });
});

describe("LIBELLE_PROFIL", () => {
  it("nomme les trois profils du moteur", () => {
    for (const t of TOLERANCES) {
      expect(LIBELLE_PROFIL[t.valeur], t.valeur).toBeTruthy();
    }
  });
});

describe("TOLERANCES", () => {
  it("propose trois niveaux, chacun expliqué par un comportement", () => {
    // ⚠️ La tolérance ne se mesure pas à ce qu'on souhaite mais à ce qu'on fait dans
    // la baisse : les intitulés décrivent une réaction, pas une envie. « Dynamique »
    // ne veut rien dire à qui n'a jamais vu son épargne baisser de moitié.
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
