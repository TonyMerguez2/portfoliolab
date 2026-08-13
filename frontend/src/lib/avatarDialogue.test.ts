import { describe, expect, it } from "vitest";

import { ETATS } from "./avatarEtats";
import {
  BASE_COMPACTE, BASE_PAROLE, PLACE_COMPACTE, PLACE_PAROLE, PART_CARACTERE, type Parole,
  PSEUDO_PAR_DEFAUT, etatsQuiParlent, messagePour, parolePour, tailleMorceau, texteDe,
} from "./avatarDialogue";

/**
 * Ce que le personnage dit — et qu'il le dise vraiment, dans la place qu'il a.
 *
 * ⚠️ **Ce fichier naît d'une phrase qui n'a jamais atteint l'écran.** Quatre états — le
 * succès, l'erreur, la surprise, le réveil — avaient leur réplique écrite, et aucune ne
 * s'est jamais affichée : le banc alimentait la parole avec l'état **de fond**, tandis que
 * ces quatre-là sont *ponctuels* et ne s'y inscrivent jamais. Mesuré au chronomètre, le mot
 * passait directement au salut. Rien ne signalait la panne : le texte était bien là, le
 * rendu bien branché, et la faute tenait à laquelle des deux variables on lisait.
 *
 * Un test ne peut pas garder ce branchement-là — il est dans la page. Il peut garder ce qui
 * l'a rendu invisible, et ce que la mise en scène promet : qu'aucune réplique ne soit écrite
 * pour un état qui n'existe pas, qu'aucune ne dépasse la place mesurée, et que le dodo monte
 * bien vers le ciel.
 */

/** Le nom de service, de longueur ordinaire : c'est celui du banc. */
const NOM = "Sacha";

/** Les paroles de tous les états, plus le repli. */
const toutes = (nom: string = NOM): { cle: string; parole: Parole }[] => [
  ...ETATS.map(e => ({ cle: e.cle, parole: parolePour(e.cle, nom) })),
  { cle: "(repli)", parole: parolePour("inconnu", nom) },
];

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
    for (const cle of etatsQuiParlent()) {
      expect(cles, `« ${cle} » n'est l'état de personne`).toContain(cle);
    }
  });

  it("ne laissent pas de trou quand le pseudonyme manque", () => {
    /**
     * Sans garde, « Bonjour {nom} ! » rend « Bonjour  ! » — double espace et point
     * d'exclamation orphelin. Le cas se produit au premier compte sans pseudonyme, donc en
     * production et pas ici.
     */
    for (const vide of [undefined, null, "", "   "]) {
      expect(messagePour("content", vide)).toBe("Bonjour !");
      expect(messagePour("inconnu", vide)).toBe("Bonjour !");
    }
    expect(messagePour("content", "  Sacha  ")).toBe("Bonjour Sacha !");
    for (const { cle, parole } of toutes()) {
      expect(texteDe(parole), `« ${cle} »`).not.toMatch(/\s{2}|\{nom\}/);
    }
  });

  it("retombent sur le salut pour un état sans réplique", () => {
    const muets = ETATS.filter(e => !etatsQuiParlent().includes(e.cle));
    expect(muets.length).toBeGreaterThan(0);
    for (const e of muets) expect(messagePour(e.cle, NOM)).toBe("Bonjour Sacha !");
    expect(messagePour("inconnu", NOM)).toBe("Bonjour Sacha !");
  });

  it("ne commentent jamais les chiffres de l'épargnant", () => {
    /**
     * ⚠️ **La frontière est ce qui autorise ce module à exister.** Le personnage parle de
     * lui — il dort, il cherche, il a fini. Dès qu'une réplique nomme un montant, une
     * performance ou un risque, elle devient un avis, et un avis engage. Le garde est
     * grossier par nécessité : on ne peut pas éprouver une intention, seulement refuser le
     * vocabulaire par lequel elle passerait.
     */
    const interdits = /%|€|\d|portefeuille|risqu|rendement|perte|gain|vendre|acheter/i;
    for (const { cle, parole } of toutes()) {
      expect(texteDe(parole), `« ${cle} » parle d'argent`).not.toMatch(interdits);
    }
  });
});

describe("la mise en scène", () => {
  it("tient dans la place mesurée, sur deux lignes au plus", () => {
    /**
     * ⚠️ **La limite est mesurée, pas choisie.** La tête occupe les deux tiers du repère,
     * soit 83 % de la largeur rendue ; la parole commence à 86 % et dispose du flanc plus la
     * gouttière du panneau, cent trente-deux pixels. Un troisième morceau demanderait une
     * troisième ligne, et l'ensemble cesserait d'être une parole pour devenir un paragraphe.
     */
    for (const { cle, parole } of toutes()) {
      const sauts = parole.morceaux.filter(m => m.saut).length;
      expect(sauts, `« ${cle} » demande ${sauts + 1} lignes`).toBeLessThanOrEqual(1);
      for (const m of parole.morceaux) {
        /**
         * ⚠️ **On éprouve que le garde-fou **ne sert pas**, et c'est plus fort que de
         * vérifier la largeur.** `tailleMorceau` rapetisse ce qui ne tient pas : une réplique
         * trop longue s'afficherait donc quand même, en plus petit, et le contrôle de largeur
         * passerait. Exiger que la taille rendue soit *exactement* la taille voulue revient à
         * dire qu'aucune réplique écrite ici n'a besoin d'être secourue. Le pseudonyme, lui,
         * est hors de notre main : c'est pour lui seul que le garde-fou existe.
         */
        expect(
          tailleMorceau(m),
          `« ${m.texte} » (${cle}) doit rapetisser pour tenir`,
        ).toBeCloseTo(BASE_PAROLE * m.echelle, 6);
      }
    }
  });

  it("tient sur une ligne dans la largeur où il est rendu", () => {
    /**
     * ⚠️ **Le défaut que ce contrôle attrape s'est vu sur un cas parfaitement ordinaire.** La
     * règle autorisait d'abord deux lignes par morceau, et le calcul se faisait sur la largeur
     * du banc. Dans le bandeau, plus étroit, « Bonjour ! » s'affichait donc « Bonjou / r ! ».
     * On éprouve maintenant les deux registres dans *leur* largeur, et l'on exige une ligne.
     */
    for (const [base, place] of [[BASE_PAROLE, PLACE_PAROLE], [BASE_COMPACTE, PLACE_COMPACTE]]) {
      for (const nom of ["", "Sacha"]) {
        for (const { cle, parole } of toutes(nom)) {
          for (const m of parole.morceaux) {
            const large = m.texte.length * PART_CARACTERE * tailleMorceau(m, base, place);
            expect(large, `« ${m.texte} » (${cle}) déborde de sa ligne en base ${base}`)
              .toBeLessThanOrEqual(place + 1e-6);
          }
        }
      }
    }
  });

  it("rapetisse un pseudonyme démesuré au lieu de le hacher", () => {
    /**
     * Vu à l'essai : « Alexandre-Maximilien » posé de force à sa taille voulue s'empilait sur
     * quatre lignes coupées au milieu des syllabes. Il est ramené à la taille qui le ferait
     * tenir sur une ligne — et s'arrête au seuil de lisibilité, quitte à s'enrouler.
     */
    const long = parolePour("content", "Alexandre-Maximilien");
    const nom = long.morceaux[long.morceaux.length - 1];
    expect(tailleMorceau(nom)).toBeLessThan(BASE_PAROLE * nom.echelle);

    const demesure = parolePour("content", "Barthélemy-Alexandre de la Fontaine-Duverger");
    expect(tailleMorceau(demesure.morceaux[1]), "illisible à force de rapetisser")
      .toBeGreaterThanOrEqual(16);
  });

  it("garde une taille de lecture, quelle que soit la taille du personnage", () => {
    /**
     * ⚠️ **C'est la contrainte du bandeau, et elle ne se voit pas depuis le banc.** L'avatar
     * y mesure environ 390 pixels ; dans l'en-tête du portefeuille, il en mesure **63**. Une
     * typographie exprimée en fraction de la tête donnerait là-bas trois pixels et demi.
     * Signalé à l'usage : « il faut pas que le texte soit trop petit ».
     *
     * Ce test tient la règle par son seul point vérifiable ici : les tailles ne se déduisent
     * que de la place mesurée, jamais d'une dimension du personnage, et aucun mot ne descend
     * sous la taille du texte courant. Le contenant peut faire enrouler la parole ; il ne
     * peut pas la rapetisser.
     */
    for (const { cle, parole } of toutes()) {
      // Un « z » de dodo n'est pas un mot : il se voit, il ne se lit pas.
      if (parole.genre === "envol") continue;
      for (const m of parole.morceaux) {
        expect(tailleMorceau(m), `« ${m.texte} » (${cle}) est sous la taille de lecture`)
          .toBeGreaterThanOrEqual(16);
      }
    }
    // Y compris quand le pseudonyme force la réduction.
    for (const nom of ["Alexandre-Maximilien", "Barthélemy-Alexandre de la Fontaine"]) {
      for (const m of parolePour("content", nom).morceaux) {
        expect(tailleMorceau(m), `« ${m.texte} » est sous la taille de lecture`)
          .toBeGreaterThanOrEqual(16);
      }
    }
  });

  it("hiérarchise : une amorce ne peut pas peser plus que son appui", () => {
    /**
     * ⚠️ **C'est la maquette qui fixe le sens.** La formule s'efface derrière le nom : plus
     * petite *et* en sourdine. Un morceau retenu qui serait le plus grand de sa parole
     * inverserait la lecture — on lirait « Bonjour » et l'on chercherait ensuite à qui.
     */
    for (const { cle, parole } of toutes()) {
      const franc = Math.max(...parole.morceaux.filter(m => !m.sourd).map(m => m.echelle));
      for (const m of parole.morceaux.filter(m => m.sourd)) {
        expect(m.echelle, `« ${m.texte} » (${cle}) écrase son appui`).toBeLessThanOrEqual(franc);
      }
    }
  });

  it("ne fait s'envoler que ce qui s'envole", () => {
    /**
     * Une hauteur ou un pivot sur un morceau posé se lirait comme un défaut de mise en page :
     * rien, autour, n'expliquerait pourquoi ce mot-là est de travers.
     */
    for (const { cle, parole } of toutes()) {
      if (parole.genre === "envol") continue;
      for (const m of parole.morceaux) {
        expect(m.monte ?? 0, `« ${m.texte} » (${cle}) flotte sans raison`).toBe(0);
        expect(m.pivot ?? 0, `« ${m.texte} » (${cle}) penche sans raison`).toBe(0);
      }
    }
  });

  it("fait monter le dodo vers le ciel, du plus petit au plus grand", () => {
    /**
     * ⚠️ **C'est le dessin même du sommeil, et il est directionnel.** Le souffle part
     * minuscule et s'éloigne en enflant. Chaque `z` doit donc être **strictement** plus grand
     * et **strictement** plus haut que le précédent : à égalité, on retombe sur trois lettres
     * alignées, c'est-à-dire sur le mot « zzZ » et non sur un ronflement.
     *
     * ⚠️ **Et jamais deux pivots identiques.** Un balancement régulier se lit comme une
     * décoration ; des angles inégaux se lisent comme des bouffées.
     */
    const dodo = parolePour("somnolent", NOM);
    expect(dodo.genre).toBe("envol");
    expect(dodo.morceaux.length).toBeGreaterThanOrEqual(3);

    for (let i = 1; i < dodo.morceaux.length; i++) {
      const av = dodo.morceaux[i - 1], ap = dodo.morceaux[i];
      expect(ap.echelle, `le ${i + 1}ᵉ « z » n'enfle pas`).toBeGreaterThan(av.echelle);
      expect(ap.monte ?? 0, `le ${i + 1}ᵉ « z » ne monte pas`).toBeGreaterThan(av.monte ?? 0);
    }
    const pivots = dodo.morceaux.map(m => m.pivot ?? 0);
    expect(new Set(pivots).size, "deux « z » penchent pareil").toBe(pivots.length);

    // Un souffle se recompose sans espaces : c'est ce qui le distingue d'un bégaiement.
    expect(texteDe(dodo)).toBe("zzZ");
    expect(texteDe(dodo)).not.toMatch(/\s/);
  });

  it("nomme un pseudonyme par défaut qui se lit dans une phrase", () => {
    expect(PSEUDO_PAR_DEFAUT.trim()).toBe(PSEUDO_PAR_DEFAUT);
    expect(PSEUDO_PAR_DEFAUT.length).toBeGreaterThan(0);
  });
});
