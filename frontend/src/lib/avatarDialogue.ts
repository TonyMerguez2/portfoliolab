/**
 * Ce que l'avatar dit, selon ce qu'il est en train de faire.
 *
 * ⚠️ **Le message se déduit de l'état, il ne s'écrit pas à côté.** L'avatar porte déjà une
 * quinzaine d'états — somnolent, préoccupé, succès — dont chacun décrit une situation. Une
 * seconde liste de phrases, réglée séparément, aurait divergé au premier état ajouté : on
 * se serait retrouvé avec une tête qui dort et un « bonjour » à côté. Ici, ajouter un état
 * sans lui donner de phrase le fait simplement retomber sur le salut, ce qui est le bon
 * échec.
 *
 * ⚠️ **Ce ne sont pas des paroles du logiciel.** La distinction tient dans ce que les
 * phrases disent : l'avatar commente **son propre état** — il dort, il cherche, il a fini
 * — et jamais les chiffres de l'épargnant. « Bonjour » et « zzZ » n'engagent personne ;
 * « votre portefeuille est risqué » serait un avis, et le personnage n'a pas à en donner.
 */

/** Le nom montré par défaut, quand l'appelant n'en fournit aucun. */
export const PSEUDO_PAR_DEFAUT = "vous";

/**
 * Les phrases attachées aux états qui en méritent une.
 *
 * ⚠️ **Courtes, parce que la place l'est.** La parole s'écrit à côté de la tête, et la
 * tête occupe déjà les cinq sixièmes de la scène : il reste un septième de la largeur,
 * quatre-vingts pixels. Mesuré, une phrase de trois mots y tient sur deux lignes ; une
 * quatrième la ferait déborder, et ce n'est plus une parole mais un paragraphe. Trois
 * mots au plus, et le nom compte pour un.
 */
const PHRASES: Record<string, string> = {
  somnolent: "zzZ",
  reveil: "Hm ?",
  curieux: "Tiens…",
  focus: "Je regarde",
  observation: "Je regarde",
  reflexion: "Voyons voir",
  content: "Bonjour {nom} !",
  "tres-content": "Bonjour {nom} !",
  surpris: "Oh !",
  sceptique: "Hmm…",
  preoccupe: "Hmm…",
  erreur: "Aïe.",
  succes: "C'est fait !",
};

/**
 * La phrase d'un état, le nom inséré.
 *
 * ⚠️ **Le nom vide ne laisse pas un trou.** Sans garde, « Bonjour  ! » s'affiche avec sa
 * double espace et son point d'exclamation orphelin — le genre de détail qu'on ne voit
 * qu'en production, sur le premier compte sans pseudonyme. On retombe alors sur un salut
 * sans nom, qui se tient tout seul.
 */
/**
 * Les répliques, telles quelles — pour que le test puisse les éprouver une à une.
 *
 * ⚠️ **Exposé en lecture, et par une fonction plutôt que par la table.** Exporter `PHRASES`
 * directement laisserait un appelant y écrire ; on rend une copie. Le test en a besoin
 * parce que l'invariant qui compte — aucune réplique écrite pour un état qui n'existe pas —
 * ne s'observe qu'en confrontant les deux listes, et qu'une réplique orpheline ne se
 * manifeste par rien à l'exécution : elle ne s'affiche simplement jamais.
 */
export function phrasesConnues(): Record<string, string> {
  return { ...PHRASES };
}

export function messagePour(etat: string, nom?: string | null): string {
  const propre = (nom ?? "").trim();
  const phrase = PHRASES[etat] ?? "Bonjour {nom} !";
  if (!phrase.includes("{nom}")) return phrase;
  return propre ? phrase.replace("{nom}", propre) : "Bonjour !";
}
