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
 * Ce dont le glyphe d'invite est réduit par rapport aux yeux qu'il remplace.
 *
 * ⚠️ **Partagé par les deux rendus, parce qu'ils dessinent ce glyphe chacun de leur côté.**
 * `AvatarNovac` et le banc `/avatar` ont chacun leur copie du tracé : une valeur écrite deux
 * fois y dériverait au premier réglage. Ici elle est écrite une seule.
 *
 * ⚠️ **Le chevron et la barre le reçoivent tous les deux, sur leurs deux dimensions.** Ne
 * réduire qu'une grandeur déformerait le signe au lieu de le rapetisser — le chevron
 * s'affinerait, la barre s'allongerait. Leur écartement, lui, ne bouge pas : c'est ce qui
 * garde au glyphe sa composition, un `>` puis un `_` à leur place.
 */
export const TAILLE_INVITE = 0.88;

/**
 * Où le chevron et la barre du glyphe d'invite se posent, en multiples de l'écart des yeux.
 *
 * ⚠️ **Les deux chiffres tiennent ensemble une seule intention : le signe se lit comme un
 * mot, pas comme deux yeux.** La pointe du chevron doit finir exactement là où la barre
 * commence — c'est la jointure qui fait lire `>_` d'un seul tenant. Relevé : à 1,73 et 1,42,
 * les deux signes étaient séparés de 17 unités de vide, et le glyphe se lisait comme deux
 * yeux dépareillés. À **1,44 et 0,90**, la pointe finit à −2 et la barre part de −2 : ils se
 * touchent, au dixième d'unité près.
 *
 * ⚠️ **Le second chiffre ne se règle pas sans le premier.** Rapprocher un seul des deux
 * signes referme bien la jointure, mais déporte le glyphe entier d'un côté du visage. Ce
 * couple-là ferme la jointure *et* laisse le signe centré — 0,3 unité de décentrage sur
 * quatre-vingts de large. Toute retouche doit refaire les deux.
 */
export const ECART_INVITE = { chevron: 1.44, barre: 0.9 };

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
 * La lueur des yeux, peinte en contours empilés : largeur en multiples du rayon réglé, et
 * opacité de chacun.
 *
 * ⚠️ **Ce n'est pas le nombre de traits qui se voit, c'est la *marche* entre deux.** Il y en
 * a eu trois, puis cinq : à chaque fois on lisait des anneaux concentriques autour de la
 * capsule plutôt qu'un halo, d'autant plus nets que l'avatar est affiché grand. Mesuré sur
 * la visière de l'astronaute — fond `#09131B`, lueur `#4FA3E3` — la version à cinq paliers
 * franchissait **3,2 à 3,9 de clarté perçue** d'un anneau au suivant, quand l'œil en
 * distingue environ 1 sur un fond sombre. Ajouter deux ou trois traits n'y pouvait rien :
 * il fallait diviser la marche par trois.
 *
 * ⚠️ **Douze paliers pour un pic à 22 %, et les deux nombres sont liés.** La marche vaut le
 * pic divisé par le nombre de paliers : on ne peut pas garder une lueur forte *et* peu de
 * traits. Ce couple donne un écart maximal de **1,42**, soit le seuil, pour douze tracés par
 * œil. Monter le pic à 30 % demanderait seize paliers pour le même résultat — plus de
 * tracés pour une lueur que rien n'exige plus vive.
 *
 * ⚠️ **Largeurs en progression géométrique, pas régulière.** Un flou gaussien décroît vite
 * près de la source et lentement au loin ; les contours se resserrent donc en approchant de
 * la capsule, là où la pente est raide et où une marche se verrait la première.
 *
 * ⚠️ **Calculées plutôt qu'écrites.** Une table de douze couples posée à la main aurait
 * caché sa règle, et personne n'aurait su lequel des douze corriger. Ici les trois nombres
 * qui décident — la largeur maximale, la minimale, le pic — sont les seuls qu'on relise.
 */
const HALO_LARGE = 5.6;
const HALO_ETROIT = 0.8;
const HALO_PALIERS = 12;
const HALO_PIC = 0.22;

export const HALO: readonly (readonly [number, number])[] = Array.from(
  { length: HALO_PALIERS },
  (_, i) => [
    HALO_LARGE * Math.pow(HALO_ETROIT / HALO_LARGE, i / (HALO_PALIERS - 1)),
    /* L'opacité unitaire qui, composée `HALO_PALIERS` fois, atteint exactement le pic. */
    1 - Math.pow(1 - HALO_PIC, 1 / HALO_PALIERS),
  ] as const,
);
