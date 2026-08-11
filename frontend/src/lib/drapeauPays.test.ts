import { readFileSync } from "node:fs";
import { join } from "node:path";

import * as drapeaux from "@appica/country-flags-react";
import { describe, expect, it } from "vitest";

import { CODES_PAYS, codePaysDrapeau } from "./drapeauPays";

/**
 * Tous les pays ont-ils vraiment un drapeau ?
 *
 * ⚠️ **Ce test traverse deux frontières, exprès.** Celle du serveur — les noms de
 * pays sont décidés dans `analyse.py` et consommés par la ventilation géographique —
 * et celle du paquet de drapeaux. Recopier l'une ou l'autre liste ici les aurait
 * laissées diverger en silence, ce qui est précisément la panne qu'on répare : la
 * table d'avant tenait sept libellés français en dur pendant que le serveur envoyait
 * des noms anglais, si bien qu'aucune action n'avait de drapeau — pas même les
 * États-Unis, qui arrivent en « United States ».
 *
 * ⚠️ **Ce qu'il attrape.** Un pays que le résolveur nomme mais que le paquet ne sait
 * pas dessiner rendrait un vide silencieux, sans erreur : le composant avertit en
 * console et ne dessine rien. C'est le genre de défaut qu'on ne voit qu'à l'œil, sur
 * un portefeuille qu'il faut d'abord avoir sous la main.
 */

const ANALYSE = join(__dirname, "../../../backend/app/services/analyse.py");
const RELEVE = join(__dirname, "../../../backend/scripts/releve_places.json");

/** Les noms de pays déclarés côté serveur, lus dans `PAYS_VERS_REGION`. */
function paysDuServeur(): string[] {
  const py = readFileSync(ANALYSE, "utf8");
  const bloc = py.slice(py.indexOf("PAYS_VERS_REGION = {"));
  const fin = bloc.indexOf("\n}");
  // ⚠️ Une boucle sur `exec` et non un `matchAll` étalé : la cible de compilation du
  // projet n'itère pas un itérateur sans drapeau supplémentaire.
  const motif = /"([^"]+)":\s*"(?:Amérique|Europe|Asie|Marchés)[^"]*"/g;
  const noms: string[] = [];
  let m: RegExpExecArray | null;
  const zone = bloc.slice(0, fin);
  while ((m = motif.exec(zone)) !== null) noms.push(m[1]);
  return noms;
}

/** Les noms de pays que le fournisseur a réellement rendus, titre par titre. */
function paysReleves(): { titre: string; nom: string }[] {
  const brut: Record<string, { place: string | null; pays: string | null }> =
    JSON.parse(readFileSync(RELEVE, "utf8"));
  return Object.keys(brut)
    .filter(titre => brut[titre].pays != null)
    .map(titre => ({ titre, nom: brut[titre].pays as string }));
}

describe("drapeaux de pays", () => {
  const duServeur = paysDuServeur();
  const duReleve = paysReleves();

  it("trouve bien la table des pays dans le fichier du serveur", () => {
    // ⚠️ Sans ce garde, un changement de format côté serveur ferait passer le test
    // en ne trouvant plus rien — la pire manière de réussir.
    expect(duServeur.length).toBeGreaterThanOrEqual(40);
    expect(duServeur).toContain("United States");
    expect(duServeur).toContain("Hong Kong");
    expect(duServeur).toContain("South Korea");
  });

  it("donne un drapeau à chaque pays que le serveur sait classer", () => {
    const sansDrapeau = duServeur.filter(n => codePaysDrapeau(n) === null);
    expect(sansDrapeau).toEqual([]);
  });

  it("donne un drapeau à chaque pays que le fournisseur a rendu", () => {
    // L'autre source, relevée sur soixante et onze titres réels : le serveur classe
    // ce qu'il connaît, le fournisseur envoie ce qui existe.
    expect(duReleve.length).toBeGreaterThanOrEqual(50);
    const sansDrapeau = duReleve.filter(p => codePaysDrapeau(p.nom) === null);
    expect(sansDrapeau.map(p => `${p.titre} (${p.nom})`)).toEqual([]);
  });

  it("n'annonce que des codes que le paquet sait dessiner", () => {
    // La liste recopiée dans le module ne peut pas dériver de ce que le paquet
    // exporte vraiment sans que ce test tombe.
    const inconnus = CODES_PAYS.filter(c => !(`${c.toUpperCase()}Rounded` in drapeaux));
    expect(inconnus).toEqual([]);
  });

  it("connaît exactement les 245 pays du paquet", () => {
    const duPaquet = Object.keys(drapeaux)
      .filter(k => k.length === 9 && k.slice(-7) === "Rounded")
      .map(k => k.slice(0, 2).toLowerCase())
      .sort();
    expect(CODES_PAYS.slice().sort()).toEqual(duPaquet);
    expect(duPaquet.length).toBe(245);
  });
});

describe("codePaysDrapeau", () => {
  it("accepte le nom anglais, celui que rend la route de cotation", () => {
    // Mesuré sur `/api/v1/quote/NESN.SW` : `country` vaut « Switzerland ».
    expect(codePaysDrapeau("Switzerland")).toBe("ch");
    expect(codePaysDrapeau("United States")).toBe("us");
    expect(codePaysDrapeau("Taiwan")).toBe("tw");
    expect(codePaysDrapeau("South Korea")).toBe("kr");
  });

  it("accepte le code à deux lettres, celui que rend la liste des titres voisins", () => {
    // Mesuré sur `/api/v1/similar/AAPL` : `country` vaut « US », « NL ».
    expect(codePaysDrapeau("US")).toBe("us");
    expect(codePaysDrapeau("NL")).toBe("nl");
    expect(codePaysDrapeau("GB")).toBe("gb");
  });

  it("accepte le nom français, celui que rend la zone d'un fonds", () => {
    expect(codePaysDrapeau("Japon")).toBe("jp");
    expect(codePaysDrapeau("États-Unis")).toBe("us");
    expect(codePaysDrapeau("Chine")).toBe("cn");
    expect(codePaysDrapeau("Inde")).toBe("in");
    expect(codePaysDrapeau("Royaume-Uni")).toBe("gb");
    expect(codePaysDrapeau("Corée du Sud")).toBe("kr");
    expect(codePaysDrapeau("Suisse")).toBe("ch");
  });

  it("rattrape les deux noms sur lesquels la plateforme et le fournisseur divergent", () => {
    // La plateforme dit « Hong Kong SAR China » et « Türkiye » ; le serveur, lui,
    // écrit « Hong Kong » et « Turkey ». Sans alias, deux pays sans drapeau.
    expect(codePaysDrapeau("Hong Kong")).toBe("hk");
    expect(codePaysDrapeau("Turkey")).toBe("tr");
    // Et le nom de la plateforme continue de répondre, lui aussi.
    expect(codePaysDrapeau("Türkiye")).toBe("tr");
  });

  it("garde le pavillon européen des deux seuls agrégats qui en avaient un", () => {
    // Comportement d'avant ce module, conservé : le retirer aurait été une régression.
    expect(codePaysDrapeau("Europe")).toBe("eu");
    expect(codePaysDrapeau("Zone euro")).toBe("eu");
  });

  it("ne donne aucun drapeau aux agrégats de pays", () => {
    // ⚠️ Une décision, pas un hasard : prêter à « Marchés émergents » le pavillon du
    // pays dominant ferait lire une exposition qui n'est pas celle des chiffres.
    // Ces libellés sortent tous de `ZONES` et d'`agreger_exposition`, dans analyse.py.
    for (const agregat of [
      "Marchés émergents", "Monde développé", "Asie-Pacifique",
      "Asie-Pacifique développée", "Asie-Pacifique tous pays", "Asie émergente",
      "Amérique latine", "Amérique du Nord", "Autres", "Non déterminé",
    ]) {
      expect({ [agregat]: codePaysDrapeau(agregat) }).toEqual({ [agregat]: null });
    }
  });

  it("ne lève pas et ne devine pas sur une entrée vide ou inconnue", () => {
    expect(codePaysDrapeau(null)).toBeNull();
    expect(codePaysDrapeau(undefined)).toBeNull();
    expect(codePaysDrapeau("")).toBeNull();
    expect(codePaysDrapeau("   ")).toBeNull();
    expect(codePaysDrapeau("Atlantide")).toBeNull();
    expect(codePaysDrapeau("ZZ")).toBeNull();
  });

  it("ignore la casse, les accents et les espaces en trop", () => {
    // Les libellés arrivent de trois sources qui ne les écrivent pas pareil.
    expect(codePaysDrapeau("  taiwan ")).toBe("tw");
    expect(codePaysDrapeau("TAÏWAN")).toBe("tw");
    expect(codePaysDrapeau("etats-unis")).toBe("us");
    expect(codePaysDrapeau("hong  kong")).toBe("hk");
  });
});
