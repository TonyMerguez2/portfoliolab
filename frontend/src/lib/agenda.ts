/**
 * Un événement au format iCalendar, pour l'ajouter à son agenda.
 *
 * Pur et sans DOM, donc testable : le format a des règles précises — échappement
 * des séparateurs, pliage des lignes longues — et chacune casse silencieusement.
 * Un fichier mal formé n'échoue pas : l'agenda l'ouvre et n'affiche rien, ou pire,
 * tronque le libellé sans le dire.
 */

/** Ce qu'il faut savoir d'un événement pour l'inscrire. */
export interface EvenementAgenda {
  /** Date ISO « AAAA-MM-JJ ». L'événement occupe la journée entière. */
  date: string;
  titre: string;
  description?: string;
  /** Identifiant stable, pour qu'un second ajout remplace le premier. */
  cle: string;
}

/**
 * Échappe un texte pour un champ iCalendar.
 *
 * ⚠️ Les quatre caractères comptent, et l'ordre aussi : la barre oblique inverse
 * doit être doublée **avant** qu'on en introduise d'autres, sinon on échappe ses
 * propres échappements. Une virgule non échappée fait lire la suite du libellé
 * comme une seconde valeur, et l'agenda affiche un titre tronqué sans se plaindre.
 */
export function echapper(texte: string): string {
  return texte
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Plie une ligne à soixante-quinze octets, comme la norme l'exige.
 *
 * ⚠️ **En octets, pas en caractères.** Un « é » en occupe deux, un emoji quatre :
 * compter les caractères laisserait passer des lignes trop longues dès qu'un
 * libellé porte des accents — c'est-à-dire toujours ici. Les agendas tolérants les
 * acceptent, les autres tronquent.
 *
 * La continuation commence par une espace, et le découpage ne doit jamais tomber
 * au milieu d'un caractère multioctet.
 */
export function plier(ligne: string): string {
  const octets = new TextEncoder().encode(ligne);
  if (octets.length <= 75) return ligne;

  const morceaux: string[] = [];
  let courant = "";
  let taille = 0;
  // La première ligne tient 75 octets, les suivantes 74 — l'espace de
  // continuation en consomme un.
  for (const car of ligne) {
    const n = new TextEncoder().encode(car).length;
    const plafond = morceaux.length === 0 ? 75 : 74;
    if (taille + n > plafond) {
      morceaux.push(courant);
      courant = car;
      taille = n;
    } else {
      courant += car;
      taille += n;
    }
  }
  if (courant) morceaux.push(courant);
  return morceaux.map((m, i) => (i === 0 ? m : ` ${m}`)).join("\r\n");
}

/** « AAAA-MM-JJ » vers « AAAAMMJJ ». */
function compact(iso: string): string {
  return iso.replace(/-/g, "");
}

/** Le lendemain, pour la borne de fin — exclusive dans la norme. */
function lendemain(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return compact(d.toISOString().slice(0, 10));
}

/**
 * Le contenu d'un fichier `.ics` pour un événement d'une journée.
 *
 * ⚠️ Les fins de ligne sont des CRLF, sans exception. La norme les impose, et un
 * fichier en LF seul est refusé sans message par certains agendas — dont celui
 * d'Apple, qui est précisément celui d'un utilisateur de macOS.
 */
export function fichierAgenda(e: EvenementAgenda, maintenant?: Date): string {
  const horodatage = (maintenant ?? new Date())
    .toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const lignes = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Novac//Evenements//FR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${e.cle}@novac`,
    `DTSTAMP:${horodatage}`,
    // Une journée entière : la date sans heure, et une fin au lendemain.
    `DTSTART;VALUE=DATE:${compact(e.date)}`,
    `DTEND;VALUE=DATE:${lendemain(e.date)}`,
    plier(`SUMMARY:${echapper(e.titre)}`),
    ...(e.description ? [plier(`DESCRIPTION:${echapper(e.description)}`)] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lignes.join("\r\n") + "\r\n";
}

/** Un nom de fichier lisible et sans caractère qui fâche un système de fichiers. */
export function nomFichier(e: EvenementAgenda): string {
  const propre = e.titre
    // `NFD` sépare la lettre de son accent, la plage U+0300–U+036F retire les
    // accents ainsi détachés. Écrite en échappements : les mêmes caractères en
    // clair dans le source sont invisibles à la relecture.
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${e.date}-${propre || "evenement"}.ics`;
}
