/**
 * Les réglages de référence du visage, ceux du banc d'essai.
 *
 * ⚠️ **Une seule source, deux consommateurs, et c'est tout l'objet de ce fichier.**
 * Les mêmes nombres vivaient en double : dans l'état initial de la page d'essai d'un
 * côté, en constantes du composant de l'autre. Ils ont divergé exactement comme deux
 * copies divergent toujours — un arrondi ajusté ici, une largeur d'œil élargie là — au
 * point que la même forme ne rendait plus pareil aux deux endroits. Signalé à l'usage :
 * « ce n'est plus le même rayon que la page avatar ».
 *
 * Le banc d'essai part donc d'ici, et l'avatar de l'application lit ici. Les deux ne
 * peuvent plus se séparer : ce qu'on règle à vue sur le banc devient la référence, et
 * l'écart, s'il en faut un, se déclare en clair plutôt que de s'installer en silence.
 */

/** Les réglages d'un œil, en unités de surface sur une tête de rayon 100. */
export const OEIL_REFERENCE = {
  largeur: 19,
  hauteur: 66,
  /** Distance géodésique à l'axe du visage. */
  ecart: 18,
  /** Hauteur de l'ancre sur la sphère, vers le haut si positive. */
  elevation: 0,
  /** Inclinaison propre, en degrés, en miroir d'un œil à l'autre. */
  inclinaison: 0,
  forme: "capsule" as "capsule" | "carre",
  /** Arrondi des quatre coins, quand la forme est carrée. */
  arrondi: 0.42,
};

/** L'échelle de tout le regard — elle multiplie aussi l'écart. */
export const TAILLE_REFERENCE = 1.23;

/**
 * L'arrondi de la silhouette, du plus rond au plus marqué.
 *
 * ⚠️ **Le même pour toutes les familles.** Chacune l'interprète à sa façon — exposant
 * pour le cube et le coussin, profondeur de pincement pour les étoiles — mais le
 * curseur, lui, ne dit qu'une chose : « du plus doux au plus franc ». Un réglage par
 * famille, c'était déjà la porte ouverte à ce que deux formes ne se ressemblent plus
 * d'une page à l'autre.
 */
export const ARRONDI_REFERENCE = 0.5;

/** La vie du regard, telle que le banc d'essai la propose. */
export const VIE_REFERENCE = {
  /** Amplitude du suivi du curseur, en degrés. */
  amplitude: 13,
  derive: 3,
  clignement: true,
  cadenceClignement: 4.5,
};
