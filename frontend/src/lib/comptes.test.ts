import { describe, expect, it } from "vitest";

import { fraicheurDuSolde } from "./comptes";

/**
 * Depuis quand un solde saisi à la main est ce qu'on en dit.
 *
 * ⚠️ **Ce n'est pas une coquetterie de formulation, c'est une mise en garde.** Sur un
 * compte de trésorerie, le montant saisi *est* la valeur du compte : il entre dans les
 * totaux comme s'il était relevé, alors qu'il a été tapé un jour donné et n'a bougé depuis
 * que si quelqu'un y a repensé. « Aujourd'hui » rassure à raison, « il y a 8 mois »
 * prévient à raison — et l'absence de mention laisserait croire au premier dans tous les cas.
 */

/** Une date à tant de jours dans le passé, en ISO. */
const ilYA = (jours: number) =>
  new Date(Date.now() - jours * 86_400_000).toISOString();

describe("la fraîcheur d'un solde", () => {
  it("ne dit rien quand la date manque ou n'en est pas une", () => {
    /**
     * ⚠️ **Rendre `null` plutôt qu'un texte de repli.** Un « date inconnue » affiché sous
     * un montant se lirait comme une alerte sur ce montant-là, alors qu'il ne dit que
     * l'absence d'un champ — un compte créé avant que la colonne n'existe, par exemple.
     */
    expect(fraicheurDuSolde(null)).toBeNull();
    expect(fraicheurDuSolde("")).toBeNull();
    expect(fraicheurDuSolde("pas une date")).toBeNull();
  });

  it("compte en jours, jamais en dessous", () => {
    /**
     * « Il y a 3 heures » sur un livret n'apprend rien : ce qu'on veut savoir, c'est si le
     * chiffre a vieilli, et cela se compte en jours. Une date future — horloge du poste
     * décalée — retombe sur « aujourd'hui » plutôt que sur un nombre négatif.
     */
    expect(fraicheurDuSolde(new Date().toISOString())).toBe("aujourd’hui");
    expect(fraicheurDuSolde(ilYA(0.4))).toBe("aujourd’hui");
    expect(fraicheurDuSolde(ilYA(-3))).toBe("aujourd’hui");
  });

  it("change d'unité à mesure que le solde vieillit", () => {
    expect(fraicheurDuSolde(ilYA(1))).toBe("hier");
    expect(fraicheurDuSolde(ilYA(9))).toBe("il y a 9 jours");
    expect(fraicheurDuSolde(ilYA(29))).toBe("il y a 29 jours");
    expect(fraicheurDuSolde(ilYA(60))).toBe("il y a 2 mois");
    expect(fraicheurDuSolde(ilYA(240))).toBe("il y a 8 mois");
    expect(fraicheurDuSolde(ilYA(400))).toBe("il y a un an");
    expect(fraicheurDuSolde(ilYA(1100))).toBe("il y a 3 ans");
  });

  it("ne laisse aucun trou entre deux unités", () => {
    /**
     * ⚠️ **L'invariant qui compte, et il ne se voit pas à la lecture.** Les seuils sont
     * écrits en jours, en mois arrondis puis en années tronquées : trois arithmétiques
     * différentes, entre lesquelles une valeur pourrait tomber sans réponse. On parcourt
     * donc trois ans jour par jour et l'on exige un texte partout.
     */
    for (let j = 0; j <= 1_100; j++) {
      const dit = fraicheurDuSolde(ilYA(j));
      expect(dit, `aucun texte à ${j} jours`).toBeTruthy();
      expect(dit, `texte vide à ${j} jours`).not.toBe("");
    }
  });

  it("ne recule jamais quand le temps avance", () => {
    /**
     * ⚠️ **Le passage des jours aux mois est un arrondi, et un arrondi peut reculer.** À
     * 44 jours, `round(44/30)` donne 1 mois ; le libellé doit malgré tout rester ordonné —
     * un solde plus vieux ne peut pas s'annoncer plus frais. On mesure donc l'ancienneté
     * annoncée, pas seulement le texte.
     */
    const rang = (dit: string): number => {
      if (dit === "aujourd’hui") return 0;
      if (dit === "hier") return 1;
      const jours = dit.match(/il y a (\d+) jours/);
      if (jours) return Number(jours[1]);
      const mois = dit.match(/il y a (\d+) mois/);
      if (mois) return Number(mois[1]) * 30;
      if (dit === "il y a un an") return 365;
      return Number(dit.match(/il y a (\d+) ans/)![1]) * 365;
    };

    let precedent = -1;
    for (let j = 0; j <= 1_100; j++) {
      const actuel = rang(fraicheurDuSolde(ilYA(j))!);
      expect(actuel, `l'ancienneté recule à ${j} jours`).toBeGreaterThanOrEqual(precedent);
      precedent = actuel;
    }
  });
});
