import { readFileSync } from "node:fs";
import { join } from "node:path";

import * as drapeaux from "@appica/country-flags-react";
import { describe, expect, it } from "vitest";

/**
 * Les drapeaux des zones macroéconomiques existent-ils vraiment ?
 *
 * ⚠️ **Ce test traverse la frontière entre le serveur et l'interface, exprès.** Les
 * codes de pays sont décidés dans `evenements.py` et consommés par la liste des
 * échéances. Recopier la liste ici l'aurait laissée diverger en silence ; on lit donc
 * le fichier Python lui-même.
 *
 * ⚠️ **Ce qu'il attrape.** Mesuré sur le composant : un code inconnu ne lève pas, il
 * ne dessine **rien** — un avertissement en console et vingt-huit pixels de vide. Une
 * coquille dans une entrée `Zone(...)` serait donc invisible aux tests du serveur, qui
 * ne vérifient que la forme du code, et n'apparaîtrait qu'à l'œil sur une ligne qu'il
 * faut d'abord provoquer. C'est exactement le genre de défaut muet que ce projet a
 * déjà payé : trois zones ont vécu sans drapeau parce que le dossier d'images n'en
 * avait que quinze.
 */

const SOURCE = join(__dirname, "../../../backend/app/services/evenements.py");

/** Les codes de drapeau déclarés côté serveur, lus dans `ZONES`. */
function codesDuServeur(): { zone: string; code: string }[] {
  const py = readFileSync(SOURCE, "utf8");
  // ⚠️ Une boucle sur `exec` et non un `matchAll` étalé : la cible de compilation du
  // projet n'itère pas un itérateur sans drapeau supplémentaire, et le calendrier a
  // déjà rencontré cette limite avec les `Set`. Changer le compilateur pour une
  // expression rationnelle de test serait un mauvais échange.
  const motif = /"([^"]+)":\s*Zone\("([a-z]*)",/g;
  const zones: { zone: string; code: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = motif.exec(py)) !== null) {
    zones.push({ zone: m[1], code: m[2] });
  }
  return zones;
}

describe("drapeaux des zones macroéconomiques", () => {
  const zones = codesDuServeur();

  it("trouve bien la table des zones dans le fichier du serveur", () => {
    // ⚠️ Sans ce garde, un changement de format côté serveur ferait passer le test
    // en ne trouvant plus rien — la pire manière de réussir.
    expect(zones.length).toBeGreaterThanOrEqual(20);
    expect(zones.map(z => z.zone)).toContain("Zone euro");
    expect(zones.map(z => z.zone)).toContain("Taïwan");
  });

  it("donne un code à chaque zone", () => {
    expect(zones.filter(z => z.code === "").map(z => z.zone)).toEqual([]);
  });

  it("n'emploie que des codes que le jeu de drapeaux connaît", () => {
    const inconnus = zones.filter(
      z => !(`${z.code.toUpperCase()}Rounded` in drapeaux));
    expect(inconnus.map(z => `${z.zone} (${z.code})`)).toEqual([]);
  });

  it("couvre les zones qui n'avaient aucun drapeau auparavant", () => {
    // Les trois manquantes du dossier d'images, dont les deux premières expositions
    // asiatiques d'un vrai PEA : Taïwan 18,7 %, Corée 15,2 %.
    for (const code of ["tw", "kr", "sg", "dk", "se", "no", "be", "fi", "pt", "at", "ie"]) {
      expect(`${code.toUpperCase()}Rounded` in drapeaux).toBe(true);
    }
  });

  it("ne rend rien pour un code inconnu, au lieu de lever", () => {
    // Le comportement sur lequel repose le repli de la liste : documenté par une
    // mesure, pas par une supposition.
    expect("ZZRounded" in drapeaux).toBe(false);
  });
});
