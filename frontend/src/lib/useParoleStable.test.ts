import { describe, expect, it } from "vitest";

import { ETATS } from "./avatarEtats";
import { DELAI_SOUTENU, delaiParole } from "./useParoleStable";

/**
 * Quand le personnage a le droit de parler — et quand il doit attendre.
 *
 * ⚠️ **Ce fichier existe parce qu'un seul seuil ne pouvait pas marcher.** Mesuré dans le
 * bandeau : la relecture des cours met l'avatar au travail 400 ms toutes les quinze
 * secondes, un changement d'onglet 530. Trente millisecondes séparent le pouls de l'action —
 * aucune durée ne passe entre les deux. La règle ne pouvait donc pas être « attendre tant de
 * temps » ; elle est devenue « attendre, sauf si c'est une réaction ».
 */

describe("le délai avant de parler", () => {
  it("laisse passer les réactions ponctuelles sans attendre", () => {
    /**
     * Elles ne durent que 900 à 1400 ms : les retarder reviendrait à les avaler. Et elles ne
     * sont pas un pouls — quelque chose vient d'arriver, cela mérite d'être dit tout de suite.
     */
    const ponctuels = ETATS.filter(e => e.nature === "ponctuel");
    expect(ponctuels.length).toBeGreaterThan(0);
    for (const e of ponctuels) {
      expect(delaiParole(e.cle), `« ${e.cle} » est retardé`).toBe(0);
    }
  });

  it("fait patienter les états soutenus", () => {
    const soutenus = ETATS.filter(e => e.nature !== "ponctuel");
    for (const e of soutenus) {
      expect(delaiParole(e.cle), `« ${e.cle} » parle trop vite`).toBe(DELAI_SOUTENU);
    }
  });

  it("place le seuil au-dessus des deux durées mesurées", () => {
    /**
     * ⚠️ **C'est l'invariant qui compte, et il est chiffré.** 400 ms pour le pouls des cours,
     * 530 pour un changement d'onglet : le seuil doit passer au-dessus des deux, sans quoi le
     * bandeau se remettrait à clignoter. Ce qu'on y perd est assumé — « Je regarde » ne
     * paraît plus que lorsqu'on attend vraiment, ce qui est le seul moment où il sert.
     */
    const POULS_DES_COURS = 400;
    const CHARGEMENT_ONGLET = 530;
    expect(DELAI_SOUTENU).toBeGreaterThan(POULS_DES_COURS);
    expect(DELAI_SOUTENU).toBeGreaterThan(CHARGEMENT_ONGLET);
  });

  it("ne retarde jamais un état inconnu plus qu'un état connu", () => {
    // `etatParCle` retombe sur le neutre, qui est soutenu : le repli est le cas prudent.
    expect(delaiParole("inconnu")).toBe(DELAI_SOUTENU);
  });
});
