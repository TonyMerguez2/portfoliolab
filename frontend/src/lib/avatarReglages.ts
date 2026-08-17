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

/**
 * La lueur des yeux, en trois contours : leur largeur en multiples du rayon réglé, et leur
 * opacité.
 *
 * ⚠️ **Cinq paliers, et non trois.** À trois, la marche se voyait : sur le heaume, dont le
 * rayon de lueur est le plus large, on lisait trois anneaux concentriques autour de la
 * braise au lieu d'un halo. Le nombre de paliers nécessaires dépend du rayon — plus la
 * lueur est ample, plus l'écart entre deux contours est visible — et cinq couvre le plus
 * exigeant des trois skins. Composées, les opacités donnent 0,07 au bord extérieur et 0,45
 * contre la capsule, une chute proche de celle d'un flou gaussien.
 *
 * ⚠️ **Exportée parce que le banc d'essai a sa propre copie du rendu.** C'est la sixième
 * fois que les deux doivent bouger ensemble ; autant ne pas y ajouter une table de valeurs
 * en double, qui divergerait au premier réglage. La dette de fond reste entière — voir la
 * tâche d'extraction posée à ce sujet.
 */
export const HALO: readonly (readonly [number, number])[] =
  [[6, 0.07], [4.4, 0.08], [3.1, 0.1], [2, 0.12], [1, 0.15]];
