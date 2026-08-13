import { describe, expect, it } from "vitest";

import { ETATS } from "./avatarEtats";
import { PSEUDO_PAR_DEFAUT, messagePour, phrasesConnues } from "./avatarDialogue";

/**
 * Ce que le personnage dit — et surtout, qu'il le dise vraiment.
 *
 * ⚠️ **Ce fichier naît d'une phrase qui n'a jamais atteint l'écran.** Quatre états — le
 * succès, l'erreur, la surprise, le réveil — avaient leur réplique écrite, et aucune ne
 * s'est jamais affichée : le banc alimentait la parole avec l'état **de fond**, tandis que
 * ces quatre-là sont *ponctuels* et ne s'y inscrivent jamais. Mesuré au chronomètre, le mot
 * passait directement au salut. Rien ne signalait la panne : le texte était bien là, le
 * rendu bien branché, et la faute tenait à laquelle des deux variables on lisait.
 *
 * Un test ne peut pas garder ce branchement-là — il est dans la page. Il peut garder ce qui
 * l'a rendu invisible : qu'aucune réplique ne soit écrite pour un état qui n'existe pas, et
 * qu'aucune ne dépasse la place réellement disponible à côté de la tête.
 */

describe("les répliques", () => {
  it("s'adressent toutes à un état qui existe", () => {
    /**
     * ⚠️ **Le sens de la vérification compte.** L'inverse — exiger une réplique par état —
     * serait faux : un état sans phrase retombe sur le salut, et c'est le bon échec, celui
     * qui laisse ajouter une expression sans devoir lui inventer un texte. Ce qui n'a aucun
     * sens, c'est la réplique orpheline : personne ne la déclenchera jamais, et rien à
     * l'exécution ne viendra le dire.
     */
    const cles = new Set(ETATS.map(e => e.cle));
    for (const cle of Object.keys(phrasesConnues())) {
      expect(cles, `« ${cle} » n'est l'état de personne`).toContain(cle);
    }
  });

  it("tiennent dans la place laissée par la tête", () => {
    /**
     * ⚠️ **La limite est mesurée, pas choisie.** La tête occupe les deux tiers du repère,
     * soit 83 % de la largeur rendue ; la parole commence à 86 % et il lui reste un
     * septième de la scène — environ quatre-vingts pixels. Posé en 20 gras, le plus large
     * mot employé, « Bonjour », y tient à 78 pixels. Trois mots s'y replient sur deux
     * lignes ; un quatrième en demanderait une troisième, et l'ensemble cesserait d'être
     * une parole pour devenir un paragraphe.
     *
     * Le nom compte pour un mot : c'est celui qu'on ne maîtrise pas.
     */
    for (const [cle, phrase] of Object.entries(phrasesConnues())) {
      const mots = phrase.split(/\s+/).filter(Boolean).length;
      expect(mots, `« ${phrase} » (${cle}) est trop long pour la place`).toBeLessThanOrEqual(3);
    }
  });

  it("ne laissent pas de trou quand le pseudonyme manque", () => {
    /**
     * Sans garde, « Bonjour {nom} ! » rend « Bonjour  ! » — double espace et point
     * d'exclamation orphelin. Le cas se produit au premier compte sans pseudonyme, donc en
     * production et pas ici.
     */
    for (const vide of [undefined, null, "", "   "]) {
      const dit = messagePour("content", vide);
      expect(dit).toBe("Bonjour !");
      expect(dit).not.toMatch(/\s{2}|\{nom\}/);
    }
    expect(messagePour("content", "  Sacha  ")).toBe("Bonjour Sacha !");
  });

  it("retombent sur le salut pour un état sans réplique", () => {
    const muets = ETATS.filter(e => !(e.cle in phrasesConnues()));
    expect(muets.length).toBeGreaterThan(0);
    for (const e of muets) expect(messagePour(e.cle, "Sacha")).toBe("Bonjour Sacha !");
    // Y compris pour une clé qui n'est celle d'aucun état.
    expect(messagePour("inconnu", "Sacha")).toBe("Bonjour Sacha !");
  });

  it("ne commentent jamais les chiffres de l'épargnant", () => {
    /**
     * ⚠️ **La frontière est ce qui autorise ce module à exister.** Le personnage parle de
     * lui — il dort, il cherche, il a fini. Dès qu'une réplique nomme un montant, une
     * performance ou un risque, elle devient un avis, et un avis engage. Le garde est
     * grossier par nécessité : on ne peut pas éprouver une intention, seulement refuser le
     * vocabulaire par lequel elle passerait.
     */
    const interdits = /%|€|\d|portefeuille|risqu|rendement|perte|gain|vendre|acheter|投/i;
    for (const [cle, phrase] of Object.entries(phrasesConnues())) {
      expect(phrase, `« ${phrase} » (${cle}) parle d'argent`).not.toMatch(interdits);
    }
  });

  it("nomme un pseudonyme par défaut qui se lit dans une phrase", () => {
    expect(PSEUDO_PAR_DEFAUT.trim()).toBe(PSEUDO_PAR_DEFAUT);
    expect(PSEUDO_PAR_DEFAUT.length).toBeGreaterThan(0);
  });
});
