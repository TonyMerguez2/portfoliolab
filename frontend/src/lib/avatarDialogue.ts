/**
 * Ce que l'avatar dit, selon ce qu'il est en train de faire.
 *
 * ⚠️ **Le message se déduit de l'état, il ne s'écrit pas à côté.** L'avatar porte déjà une
 * quinzaine d'états — somnolent, préoccupé, succès — dont chacun décrit une situation. Une
 * seconde liste de phrases, réglée séparément, aurait divergé au premier état ajouté : on
 * se serait retrouvé avec une tête qui dort et une bulle qui salue. Ici, ajouter un état
 * sans lui donner de phrase le fait simplement retomber sur le salut, ce qui est le bon
 * échec.
 *
 * ⚠️ **Ce ne sont pas des paroles du logiciel.** La distinction tient dans ce que les
 * phrases disent : l'avatar commente **son propre état** — il dort, il cherche, il a fini
 * — et jamais les chiffres de l'épargnant. « Bonjour » et « zzZ » n'engagent personne ;
 * « votre portefeuille est risqué » serait un avis, et n'a rien à faire dans une bulle.
 */

/** Le nom montré par défaut, quand l'appelant n'en fournit aucun. */
export const PSEUDO_PAR_DEFAUT = "vous";

/**
 * Les phrases attachées aux états qui en méritent une.
 *
 * ⚠️ **Courtes, parce que la bulle est petite et ne doit pas le devenir moins.** Une
 * phrase qui enroule sur trois lignes cesse d'être une bulle et devient un panneau ; à ce
 * moment-là, autant écrire le texte dans la page. Trois mots au plus, et le nom compte
 * pour un.
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
export function messagePour(etat: string, nom?: string | null): string {
  const propre = (nom ?? "").trim();
  const phrase = PHRASES[etat] ?? "Bonjour {nom} !";
  if (!phrase.includes("{nom}")) return phrase;
  return propre ? phrase.replace("{nom}", propre) : "Bonjour !";
}
