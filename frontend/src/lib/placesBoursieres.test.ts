import { readFileSync } from "node:fs";
import { join } from "node:path";

import * as drapeaux from "@appica/country-flags-react";
import { describe, expect, it } from "vitest";

import {
  PLACES, PLACES_HORS_RELEVE, PLACES_RELEVEES, libellePlace, paysDeLaPlace,
} from "./placesBoursieres";

/**
 * La table des places dit-elle vrai ?
 *
 * ⚠️ **Deux façons de se tromper, deux directions de vérification.** Une place peut
 * porter un pays que le jeu de drapeaux ne connaît pas — le drapeau ne se dessine
 * pas. Ou bien une *clé* peut ne correspondre à aucun code réel — l'entrée n'est
 * jamais atteinte, et le drapeau ne se dessine pas non plus. Les deux fautes rendent
 * exactement le même écran : un vide. Aucun test qui ne regarde que la table ne les
 * distingue, d'où la confrontation au relevé.
 *
 * ⚠️ **Le relevé est lu, pas recopié.** Comme `drapeauxZones.test.ts` lit les codes de
 * zone dans le fichier Python plutôt que d'en tenir une seconde liste, ce test lit la
 * sortie de `backend/scripts/releve_places.py` — soixante et onze titres interrogés
 * chez le fournisseur. Recopier les codes ici aurait recréé la duplication qu'on
 * vient de supprimer, et rendu le test capable de confirmer sa propre erreur.
 *
 * ⚠️ **Ce qu'il aurait attrapé.** Les anciennes tables donnaient `SWX` à la Suisse.
 * Le fournisseur dit `EBS`, et `EBS` manquait — les trois actions suisses du
 * catalogue s'affichaient donc sans drapeau ni nom de place, sous une table qui
 * avait pourtant l'air de couvrir la Suisse.
 */

const RELEVE = join(__dirname, "../../../backend/scripts/releve_places.json");

/** Les codes que le fournisseur a réellement rendus, par titre interrogé. */
function codesReleves(): { titre: string; code: string }[] {
  const brut: Record<string, { place: string | null; pays: string | null }> =
    JSON.parse(readFileSync(RELEVE, "utf8"));
  return Object.keys(brut)
    .filter(titre => brut[titre].place != null)
    .map(titre => ({ titre, code: brut[titre].place as string }));
}

describe("places boursières", () => {
  const releve = codesReleves();

  it("trouve bien le relevé du fournisseur", () => {
    // ⚠️ Sans ce garde, un relevé vidé ou déplacé ferait passer tout le reste en ne
    // comparant plus rien — la pire manière de réussir.
    expect(releve.length).toBeGreaterThanOrEqual(60);
    expect(releve.map(r => r.code)).toContain("TAI");
    expect(releve.map(r => r.code)).toContain("KSC");
  });

  it("connaît toutes les places que le fournisseur a rendues", () => {
    const inconnues = releve.filter(r => !(r.code in PLACES));
    expect(inconnues.map(r => `${r.titre} (${r.code})`)).toEqual([]);
  });

  it("n'invente aucun code : chaque entrée relevée a été constatée", () => {
    // La direction inverse, celle qui attrape la coquille de clé. `TIA` au lieu de
    // `TAI` serait une entrée morte, invisible à tout test qui ne lit que la table.
    const constates = releve.map(r => r.code);
    const jamaisVues = Object.keys(PLACES_RELEVEES).filter(c => constates.indexOf(c) < 0);
    expect(jamaisVues).toEqual([]);
  });

  it("n'emploie que des pays que le jeu de drapeaux connaît", () => {
    const codes = Object.keys(PLACES);
    const inconnus = codes.filter(
      c => !(`${PLACES[c].pays.toUpperCase()}Rounded` in drapeaux));
    expect(inconnus.map(c => `${c} (${PLACES[c].pays})`)).toEqual([]);
  });

  it("donne un libellé à chaque place, jamais le code brut", () => {
    const muettes = Object.keys(PLACES).filter(
      c => !PLACES[c].libelle || PLACES[c].libelle === c);
    expect(muettes).toEqual([]);
  });

  it("couvre les places qui n'avaient aucun drapeau auparavant", () => {
    // Taïwan et la Corée d'abord : les deux premières expositions asiatiques d'un
    // vrai PEA. Puis Singapour et les quatre places nordiques, absentes elles aussi
    // des dix-sept fichiers de `public/drapeaux`.
    const attendus: Record<string, string> = {
      TAI: "tw", TWO: "tw", KSC: "kr", KOE: "kr", SES: "sg",
      STO: "se", CPH: "dk", OSL: "no", HEL: "fi",
    };
    const obtenus: Record<string, string | null> = {};
    for (const code of Object.keys(attendus)) obtenus[code] = paysDeLaPlace(code);
    expect(obtenus).toEqual(attendus);
  });

  it("couvre la Suisse par le code que le fournisseur emploie vraiment", () => {
    // La panne qui a motivé le relevé : `SWX` était dans la table, `EBS` non, et
    // c'est `EBS` que rendent NESN.SW, NOVN.SW, UBSG.SW et ZURN.SW.
    expect(paysDeLaPlace("EBS")).toBe("ch");
    expect(libellePlace("EBS")).toBe("SIX Swiss");
  });

  it("répond aux deux orthographes de NYSE Arca", () => {
    // `PCX` chez le fournisseur, `NYSEArca` dans le catalogue en dur : les deux
    // atteignent l'écran, les deux doivent rendre le même drapeau.
    expect(paysDeLaPlace("PCX")).toBe("us");
    expect(paysDeLaPlace("NYSEArca")).toBe("us");
  });

  it("ne garde hors relevé que des codes assumés", () => {
    // Le tri est une décision, pas un accident : si un de ces codes se met à sortir
    // du relevé, il doit remonter dans `PLACES_RELEVEES` plutôt que rester ici.
    expect(Object.keys(PLACES_HORS_RELEVE).sort())
      .toEqual(["NMQ", "NYSEArca", "SWX", "TSX", "TYO"]);
    const constates = releve.map(r => r.code);
    const finalementVues = Object.keys(PLACES_HORS_RELEVE)
      .filter(c => constates.indexOf(c) >= 0);
    expect(finalementVues).toEqual([]);
  });
});

describe("paysDeLaPlace", () => {
  it("rend null plutôt que de laisser passer un code inconnu", () => {
    // ⚠️ Le comportement sur lequel repose tout le repli. Mesuré sur le composant :
    // un code inconnu ne lève pas, il ne dessine rien ; un code `null` lève sur
    // `toUpperCase`. Les deux doivent donc être arrêtés avant le rendu.
    expect(paysDeLaPlace("XXX")).toBeNull();
    expect(paysDeLaPlace(null)).toBeNull();
    expect(paysDeLaPlace(undefined)).toBeNull();
    expect(paysDeLaPlace("")).toBeNull();
  });

  it("rend un code à deux lettres, la seule forme que le jeu de drapeaux accepte", () => {
    const pays = Object.keys(PLACES).map(c => paysDeLaPlace(c));
    expect(pays.filter(p => p == null || p.length !== 2)).toEqual([]);
  });
});

describe("libellePlace", () => {
  it("rend null sur une place inconnue, pour que l'appelant montre le code brut", () => {
    // « PAR » vaut mieux que rien : il dit au moins où le titre cote.
    expect(libellePlace("XXX")).toBeNull();
    expect(libellePlace(null)).toBeNull();
    expect(libellePlace(undefined)).toBeNull();
  });

  it("garde les libellés que les deux anciennes tables affichaient", () => {
    // La fusion ne doit rien changer à l'écran pour les places déjà couvertes.
    expect(libellePlace("NMS")).toBe("Nasdaq GS");
    expect(libellePlace("PAR")).toBe("Euronext Paris");
    expect(libellePlace("GER")).toBe("Xetra");
    expect(libellePlace("LSE")).toBe("London SE");
    expect(libellePlace("HKG")).toBe("Hong Kong");
    expect(libellePlace("JPX")).toBe("Tokyo");
    expect(libellePlace("ASX")).toBe("Sydney");
  });
});
