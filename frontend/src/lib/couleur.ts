/**
 * Mise au net des couleurs de marque.
 *
 * La teinte d'un actif est extraite de son logo, et un logo n'est pas fait pour
 * servir de couleur de tracé : le pelage brun du chien de WIF donne un brun
 * sombre, illisible sur fond noir. La teinte est conservée — c'est elle qui
 * identifie l'actif — mais la clarté et la saturation sont ramenées dans une
 * plage utilisable.
 */

export type RVB = [number, number, number];

export function hexVersRvb(hex: string): RVB {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  return m
    ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
    : [91, 141, 239];
}

export function rvbVersHex([r, g, b]: RVB): string {
  const d = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${d(r)}${d(g)}${d(b)}`;
}

/** Teinte (0–1), saturation (0–1), clarté (0–1). */
export function rvbVersTsl([r, g, b]: RVB): [number, number, number] {
  const R = r / 255, V = g / 255, B = b / 255;
  const max = Math.max(R, V, B), min = Math.min(R, V, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === R)      h = ((V - B) / d + (V < B ? 6 : 0)) / 6;
  else if (max === V) h = ((B - R) / d + 2) / 6;
  else                h = ((R - V) / d + 4) / 6;
  return [h, s, l];
}

export function tslVersRvb([h, s, l]: [number, number, number]): RVB {
  if (s === 0) { const v = l * 255; return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const canal = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [canal(h + 1 / 3) * 255, canal(h) * 255, canal(h - 1 / 3) * 255];
}

/** Bornes retenues pour un tracé sur fond très sombre. */
export const CLARTE_MIN = 0.52;
export const CLARTE_MAX = 0.72;
export const SATURATION_MIN = 0.45;
export const SATURATION_MAX = 0.92;

/**
 * Ramène une couleur dans la plage lisible sur fond sombre, sans toucher à sa
 * teinte.
 *
 * La teinte identifie l'actif et doit être respectée ; la clarté et la
 * saturation ne servent qu'à la rendre visible. Un brun reste un brun, mais
 * cesse de se confondre avec le fond.
 *
 * Un gris — saturation quasi nulle — est laissé gris : lui inventer une
 * saturation lui donnerait une teinte arbitraire tirée du bruit de l'image.
 */
export function pourFondSombre(hex: string): string {
  const [h, s, l] = rvbVersTsl(hexVersRvb(hex));
  if (s < 0.08) {
    // Une nuance de gris : on se contente de l'éclaircir.
    const clarte = Math.max(CLARTE_MIN, Math.min(CLARTE_MAX, l));
    return rvbVersHex(tslVersRvb([h, s, clarte]));
  }
  return rvbVersHex(tslVersRvb([
    h,
    Math.max(SATURATION_MIN, Math.min(SATURATION_MAX, s)),
    Math.max(CLARTE_MIN, Math.min(CLARTE_MAX, l)),
  ]));
}

/**
 * Le pendant clair : ramène une couleur dans la plage lisible sur fond blanc.
 *
 * Même principe et même respect de la teinte, mais les bornes de clarté
 * descendent au lieu de monter. Elles ne sont pas le miroir des précédentes :
 * l'œil tolère moins bien une couleur claire sur blanc qu'une couleur sombre
 * sur noir, et il faut descendre plus bas qu'on ne montait haut pour atteindre
 * la même lisibilité.
 */
const CLARTE_MIN_CLAIR = 0.28;
const CLARTE_MAX_CLAIR = 0.44;

export function pourFondClair(hex: string): string {
  const [h, s, l] = rvbVersTsl(hexVersRvb(hex));
  const clarte = Math.max(CLARTE_MIN_CLAIR, Math.min(CLARTE_MAX_CLAIR, l));
  if (s < 0.08) return rvbVersHex(tslVersRvb([h, s, clarte]));
  return rvbVersHex(tslVersRvb([
    h,
    Math.max(SATURATION_MIN, Math.min(SATURATION_MAX, s)),
    clarte,
  ]));
}

/** Normalise selon le thème actif. */
export function pourFond(hex: string, clair: boolean): string {
  return clair ? pourFondClair(hex) : pourFondSombre(hex);
}

/**
 * Décale la clarté d'une couleur, en points de TSL, et rend l'hexadécimal.
 *
 * Sert à tirer d'une teinte de marque les deux bouts d'un dégradé — arête
 * éclairée, pied assombri — sans avoir à écrire trois couleurs par actif.
 *
 * La clarté est bornée, pas la saturation : à l'approche du blanc ou du noir,
 * TSL perd sa teinte de toute façon, et vouloir la garder à saturation
 * constante rendrait des pastels ou des couleurs fluorescentes selon le sens du
 * décalage. Aux amplitudes utilisées ici — un dixième au plus — la question ne
 * se pose pas.
 */
export function decalerClarte(hex: string, delta: number): string {
  const [h, s, l] = rvbVersTsl(hexVersRvb(hex));
  return rvbVersHex(tslVersRvb([h, s, Math.max(0, Math.min(1, l + delta))]));
}

/**
 * La luminance relative, au sens WCAG.
 *
 * Ce n'est pas la clarté du modèle TSL utilisé plus haut : celle-ci pondère
 * les canaux selon la sensibilité de l'œil — le vert compte pour sept fois le
 * bleu — et c'est elle, pas l'autre, qui décide si un texte se lit.
 */
export function luminance(hex: string): number {
  const lineaire = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexVersRvb(hex).map(lineaire);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * La clarté **perçue**, au sens de CIE L* — de 0 pour le noir à 100 pour le blanc.
 *
 * ⚠️ **À ne pas confondre avec le contraste, et la confusion m'a coûté un aller-retour.**
 * Le rapport de contraste répond à « ce texte est-il lisible » ; il est très sensible près
 * du noir et très plat ailleurs. Pour un liseré, la question n'est pas la lisibilité mais
 * la **différence vue** : sur un fond quasi noir, un rapport de 1,135 vaut six points de
 * clarté, alors que le même rapport sur un bleu moyen n'en vaut plus que quatre. Un liseré
 * calé sur le rapport disparaît donc dès que la carte s'éclaircit — constaté à l'écran.
 * `L*` est construite pour être perceptuellement uniforme : un même écart s'y voit pareil
 * partout, ce qui est exactement la propriété qu'on attend d'un bord.
 */
export function clartePercue(hex: string): number {
  const y = luminance(hex);
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
}

/**
 * L'**écart perçu** entre deux couleurs — la distance CIE76 dans l'espace L*a*b*.
 *
 * ⚠️ **Le rapport de contraste ne pouvait pas répondre à cette question-là, et il a donné une
 * réponse fausse avec aplomb.** Il ne mesure que la **luminance** : deux couleurs de clarté
 * voisine mais de teintes opposées y valent 1:1, alors que l'œil les sépare sans effort. Appliqué
 * aux logos de la carte de chaleur, il réclamait une pastille pour **72 des 99** — dont l'œil vert
 * de `NVDA` sur sa tuile mauve, parfaitement lisible, à 2,12 seulement. En `ΔE` le même couple
 * mesure **100**, et le classement redevient celui qu'on voit.
 *
 * ⚠️ **Le contraste reste le bon outil pour du texte** : c'est pour lui qu'il est construit, et
 * la lisibilité d'un glyphe fin dépend bien plus de la clarté que de la teinte. Les deux mesures
 * coexistent parce qu'elles répondent à deux questions, pas parce qu'on hésite.
 *
 * ⚠️ **CIE76 et non CIEDE2000.** La formule récente corrige des écarts que l'on ne mesure pas ici :
 * on trie des logos en deux tas, pas des nuanciers. Vingt lignes de plus pour un rang inchangé.
 */
export function ecartPercu(a: string, b: string): number {
  const versLab = (hex: string): [number, number, number] => {
    const lineaire = (v: number) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const [r, v, bl] = hexVersRvb(hex).map(lineaire);
    /* Blanc de référence D65, celui de sRGB. */
    const X = (0.4124 * r + 0.3576 * v + 0.1805 * bl) / 0.95047;
    const Y = 0.2126 * r + 0.7152 * v + 0.0722 * bl;
    const Z = (0.0193 * r + 0.1192 * v + 0.9505 * bl) / 1.08883;
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const [l1, a1, b1] = versLab(a);
  const [l2, a2, b2] = versLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** Deux couleurs mélangées dans l'espace sRGB, `t` allant de l'une à l'autre. */
export function melanger(a: string, b: string, t: number): string {
  const [ra, ga, ba] = hexVersRvb(a);
  const [rb, gb, bb] = hexVersRvb(b);
  const u = Math.max(0, Math.min(1, t));
  return rvbVersHex([ra + (rb - ra) * u, ga + (gb - ga) * u, ba + (bb - ba) * u]);
}

/** Le rapport de contraste entre deux couleurs, de 1 à 21. */
export function contraste(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/**
 * La variation, en points de pourcentage, au-delà de laquelle la couleur ne se renforce plus.
 *
 * ⚠️ **Une échelle fixe, et non l'étendue des données du jour.** Une échelle qui s'ajuste au
 * plus fort mouvement affiché repeint toute la carte quand un seul actif bouge : la même
 * hausse de 1 % y paraît pâle un jour et soutenue le lendemain, et deux visites ne se
 * comparent plus. Trois points est la convention des cartes de chaleur boursières, et c'est à
 * peu près l'écart-type d'une séance sur une grande valeur.
 */
export const SEUIL_CHALEUR = 3;

/**
 * Le seuil de saturation, par période d'observation.
 *
 * ⚠️ **Un seuil unique aurait rendu toutes les longues périodes illisibles.** Sur une séance,
 * ±3 % couvre l'essentiel des mouvements ; sur un an, la quasi-totalité des titres dépasse
 * ±3 % et la carte devient **deux blocs unis**, l'un vert l'autre rouge, sans aucune nuance —
 * la couleur cesse alors de porter une quantité pour ne dire qu'un signe. Les seuils
 * ci-dessous suivent grossièrement la racine du temps, comme la volatilité : quatre fois la
 * durée, deux fois l'amplitude.
 *
 * ⚠️ **Ils sont écrits et non calculés, parce qu'ils sont un choix de lecture.** Une échelle
 * déduite de l'écart-type réel du jour serait « juste » mais mobile — et une carte dont
 * l'échelle bouge n'est plus comparable à elle-même d'une visite à l'autre.
 */
export const SEUILS_PAR_PERIODE: Record<string, number> = {
  "1j": 3,
  "1s": 6,
  "1m": 12,
  "3m": 20,
  "aaj": 35,
  "1a": 50,
};

/**
 * La couleur d'une tuile de carte de chaleur, selon la variation qu'elle porte.
 *
 * Gris neutre à zéro, vert de plus en plus soutenu à la hausse, rouge à la baisse, saturé au
 * seuil. Les teintes sont celles de `--nv-positif` et `--nv-negatif` : la carte ne parle pas
 * une autre langue que le reste de l'application.
 *
 * ⚠️ **La teinte est fixe de chaque côté, seules la saturation et la clarté portent
 * l'intensité.** Interpoler entre un neutre ardoise et un vert ferait passer les petites
 * hausses par le turquoise — une troisième couleur, que l'œil lit comme une troisième
 * catégorie. En partant d'une saturation nulle, le neutre est un gris pur et aucune teinte
 * intermédiaire n'apparaît : il n'y a que du vert plus ou moins présent.
 *
 * ⚠️ **Toutes les valeurs de la rampe portent du blanc, et c'est une contrainte de
 * construction, pas un hasard.** La clarté plafonne à 0,30 côté hausse et 0,33 côté baisse
 * (le rouge a besoin d'un peu plus pour rester rouge). Mesuré sur toute la rampe : **5,24:1 au
 * pire**, contre le blanc, soit au-dessus des 4,5 du texte courant. C'est ce qui permet à
 * l'encre de rester la même d'une tuile à l'autre — une carte dont le texte bascule du blanc
 * au noir selon la case se lit comme deux cartes.
 *
 * ⚠️ **Le vert et le rouge de la performance restent lisibles dessus.** Mesuré : `#4ade80` sur
 * sa propre tuile la plus saturée tient 3,01:1, `#f87171` sur la sienne 3,34:1 — le seuil du
 * texte large, ce que sont ces chiffres. `pourContrasteSur` les laisse donc presque toujours
 * intacts, au lieu de les déplacer à chaque tuile.
 *
 * ⚠️ **Les teintes se déduisent des deux couleurs, elles ne se recopient pas.** Écrire le degré
 * à la main, c'est le voir s'écarter du jour où `--nv-positif` change de vert. Et surtout : la
 * teinte de ce fichier est un **rapport entre zéro et un**, pas un angle en degrés. J'y ai posé
 * `141.5` en croyant écrire des degrés — `canal()` ne replie l'argument que d'un tour, si bien
 * que toutes les hausses sortaient **grises**. La baisse, elle, marchait : sa teinte vaut zéro,
 * qui est la même dans les deux unités. Un demi-tableau juste est ce qui rend l'erreur difficile
 * à voir ; relevé en mesurant les fonds rendus, pas à l'œil.
 */
/** La couleur des trois pôles d'une carte de chaleur. */
export type PaletteChaleur = { hausse: string; baisse: string; neutre: string };

/**
 * La palette de secours — les valeurs des jetons, recopiées.
 *
 * ⚠️ **Ce module ne lit pas les jetons lui-même, et c'est une leçon payée.** J'y avais mis un
 * `paletteChaleur()` qui appelait `resoudreJeton`, donc `getComputedStyle`, donc `theme.ts`,
 * donc React. Ce fichier est une bibliothèque de couleurs **pure** : quatre fichiers de test —
 * ceux de l'avatar et le sien — l'importent sans DOM, et se sont mis à échouer d'un coup sur
 * « Cannot find package '@/lib/theme' ». Résoudre un jeton est une affaire de navigateur, donc
 * de l'appelant ; ici on ne fait que des mathématiques sur des couleurs.
 *
 * ⚠️ **Les valeurs doivent suivre `globals.css`.** Elles ne servent qu'au rendu serveur et aux
 * appelants qui ne résolvent rien ; si la palette y change, les recopier ici.
 */
export const PALETTE_SECOURS: PaletteChaleur = {
  hausse: "#00D492",   // --nv-positif
  baisse: "#FF6467",   // --nv-negatif
  neutre: "#3d4757",   // --nv-bord-fort éclairci d'un quart vers --nv-texte-secondaire
};

/**
 * ⚠️ **Les cases sont des nuances de la couleur, et non une rampe inventée.** Elles l'étaient :
 * je construisais une teinte, une saturation et une clarté à la main, avec des plafonds
 * différents pour le vert et le rouge. C'était juste au sens du contraste et faux au sens de la
 * palette — la tuile la plus verte n'était **aucune** des couleurs de l'application. Elle est
 * maintenant exactement `--nv-positif`, et les cases intermédiaires sont ce même vert posé de
 * plus en plus densément sur le neutre. C'est la grammaire des crans `voile` et `doux`, qui
 * sont déjà cette couleur à 10 % et 20 % — étendue en continu.
 *
 * ⚠️ **L'encre bascule, et il le faut.** Le vert de la palette est clair : à pleine intensité,
 * du blanc dessus ne tient que 1,94:1, une encre sombre 9,66. `encreSur` choisit donc la bonne
 * à chaque case, et le pire de toute la rampe est **4,9:1**. J'avais écrit ici qu'une encre qui
 * bascule « se lit comme deux cartes » et j'avais bridé les couleurs pour l'éviter : c'était
 * brider la palette pour sauver une règle que je m'étais donnée.
 */
export function couleurPerformance(
  variation: number | null | undefined,
  seuil = SEUIL_CHALEUR,
  palette: PaletteChaleur = PALETTE_SECOURS,
): string {
  if (variation == null || !Number.isFinite(variation)) return palette.neutre;
  const t = Math.max(-1, Math.min(1, variation / seuil));
  return melanger(palette.neutre, t >= 0 ? palette.hausse : palette.baisse, Math.abs(t));
}

/** Encre presque noire plutôt que noire : le noir pur pique sur une couleur vive. */
const ENCRE_SOMBRE = "#0B1220";

/**
 * La même teinte, poussée en clarté jusqu'à contraster avec un fond **donné**.
 *
 * ⚠️ **Ce n'est pas `pourFond`, et c'est la distinction qui compte.** `pourFondSombre` et
 * `pourFondClair` ramènent une couleur dans une plage fixe, réglée pour du noir ou du blanc :
 * elles ne regardent jamais le fond réel. Cela suffit tant que les fonds sont les deux thèmes
 * de l'application ; cela ne suffit plus quand le fond est une couleur quelconque — la plaque
 * d'un logo, par exemple. Mesuré sur la page des marchés : le vert de performance posé sur la
 * tuile NVDA, elle-même verte, tient **1,37:1** ; passé par `pourFondClair` il tombe à 1,03,
 * c'est-à-dire qu'il disparaît. La plage « lisible sur blanc » n'a rien à dire d'un fond vert.
 *
 * ⚠️ **La teinte et la saturation sont tenues, seule la clarté cède.** Un vert qui vire au
 * bleu pour se détacher ne serait plus un code de hausse. C'est le même parti que
 * `assombrirPourBlanc`, dont ceci généralise le principe à un fond quelconque et dans les deux
 * sens : selon le fond, il faut parfois éclaircir.
 *
 * ⚠️ **Les deux sens sont essayés, et le plus proche gagne.** Sur un fond de clarté médiane,
 * assombrir et éclaircir marchent tous les deux ; prendre le premier trouvé ferait basculer
 * deux tuiles voisines dans des directions opposées pour un écart de fond d'un centième. On
 * retient donc le moindre déplacement, ce qui est stable et garde la couleur la plus proche de
 * celle d'origine.
 *
 * ⚠️ **Par dichotomie, comme `assombrirPourBlanc` et pour sa raison.** Un balayage au
 * centième dépasse la cible d'un écart qui se voit — c'est mesuré là-bas. Vingt itérations
 * placent le point au millionième près.
 *
 * La cible vaut 3 par défaut : le seuil AA du texte large, ce que sont les chiffres auxquels
 * ceci sert. Pour du texte courant, demander 4,5.
 */
export function pourContrasteSur(couleur: string, fond: string, cible = 3): string {
  if (contraste(couleur, fond) >= cible) return couleur;
  const [h, s, l] = rvbVersTsl(hexVersRvb(couleur));
  const a = (clarte: number) => rvbVersHex(tslVersRvb([h, s, clarte]));

  const vers = (extreme: number): { ecart: number; hex: string } | null => {
    if (contraste(a(extreme), fond) < cible) return null;
    let proche = l, loin = extreme;
    for (let i = 0; i < 20; i++) {
      const milieu = (proche + loin) / 2;
      if (contraste(a(milieu), fond) >= cible) loin = milieu; else proche = milieu;
    }
    return { ecart: Math.abs(loin - l), hex: a(loin) };
  };

  const candidats = [vers(0), vers(1)].filter(Boolean) as { ecart: number; hex: string }[];
  /* Aucun des deux bouts n'atteint la cible : le fond est de clarté si médiane qu'aucune
     variante de cette teinte ne s'en détache. On rend alors l'encre, qui abandonne la teinte
     mais reste lisible — mieux vaut un chiffre gris qu'un chiffre invisible. */
  if (!candidats.length) return encreSur(fond);
  return candidats.sort((x, y) => x.ecart - y.ecart)[0].hex;
}

/**
 * L'encre à poser sur un fond coloré.
 *
 * Le choix se fait au calcul et non à l'œil : entre un jaune et un bleu marine
 * de même « intensité » apparente, l'un demande du noir et l'autre du blanc, et
 * l'intuition se trompe régulièrement au milieu de la plage. On retient
 * simplement celle des deux encres qui contraste le plus.
 *
 * Le pire cas vaut **4,33:1**, mesuré en balayant tout le cube sRGB — il tombe
 * sur les verts moyens, autour de #4B8746. C'est une propriété des couleurs de
 * luminance médiane, pas un défaut réparable : aucune encre unie ne fait mieux
 * sur ces fonds-là, et seul un changement du fond y remédierait. Cette borne
 * suffit au texte large — le seuil AA y est de 3:1 — mais pas au texte courant,
 * qui demande 4,5. À réserver donc aux capitales d'avatar, aux pastilles et aux
 * étiquettes de bonne taille.
 */
export function encreSur(fond: string): string {
  return contraste(fond, "#FFFFFF") >= contraste(fond, ENCRE_SOMBRE)
    ? "#FFFFFF"
    : ENCRE_SOMBRE;
}

/**
 * La même couleur, assombrie juste assez pour porter du texte blanc.
 *
 * ⚠️ **Assombrir le fond plutôt que retourner l'encre, et c'est le contraire de
 * `encreSur`.** Celle-ci choisit la meilleure des deux encres pour un fond donné, et sa
 * propre note en pose la limite : 4,33:1 au pire, ce qui suffit aux capitales d'avatar
 * et aux pastilles, pas à un libellé de onze pixels — le seuil y est de 4,5. Sur un fond
 * qu'on ne maîtrise pas, aucune encre unie ne s'en sort. Mais ici on maîtrise le fond :
 * c'est lui qui cède, et le blanc reste blanc.
 *
 * ⚠️ **Le blanc est tenu, il n'est pas négocié.** Un bouton dont l'encre bascule au noir
 * selon la couleur d'avatar choisie serait deux boutons différents : l'œil apprend une
 * forme, pas une règle de contraste. La teinte et la saturation sont donc conservées, et
 * seule la clarté descend — la couleur reste reconnaissable, elle devient seulement plus
 * profonde.
 *
 * ⚠️ **Par dichotomie, et j'avais d'abord écrit le contraire.** Un balayage par pas de un
 * centième était plus simple, et je l'avais justifié en écrivant que chercher le point
 * exact ne rapporterait « qu'un gain invisible à l'œil ». C'est faux, et c'est l'œil qui
 * l'a démenti : sur l'indigo d'un avatar, `#6366F1` manque la cible de 0,033 seulement,
 * mais le premier pas d'un centième l'emmène à 4,71 — soit **ΔE 3,59** du point de
 * départ, un écart que l'on voit côte à côte, et qui s'est vu. La dichotomie s'arrête à
 * 4,515 et ne s'éloigne que de **ΔE 0,72**, sous le seuil de perception.
 *
 * Le pas grossier ne coûtait donc pas de la précision, il coûtait de la fidélité : la
 * couleur rendue n'était plus celle qu'on avait choisie. Vingt-quatre tours bornent la
 * recherche bien en dessous de ce que l'arrondi sur huit bits sait représenter.
 *
 * ⚠️ **Une couleur déjà lisible est rendue telle quelle**, sans repasser par la
 * conversion : c'est ce qui garantit qu'un choix déjà bon n'est pas déplacé d'un poil.
 *
 * ⚠️ **La teinte est reprise de l'original à chaque essai, et non du pas précédent.**
 * Enchaîner les `decalerClarte` repassait par le hexadécimal à chaque tour, et l'arrondi
 * sur huit bits s'y accumulait : mesuré, 1,67° de dérive sur un jaune vif au bout d'une
 * quinzaine de pas.
 */
export function assombrirPourBlanc(hex: string, cible = 4.5): string {
  if (contraste(hex, "#FFFFFF") >= cible) return hex;

  const [h, s, l] = rvbVersTsl(hexVersRvb(hex));
  const auContraste = (clarte: number) =>
    contraste(rvbVersHex(tslVersRvb([h, s, clarte])), "#FFFFFF") >= cible;

  // `bas` est toujours une clarté qui convient — le noir convient toujours —, `haut` une
  // qui ne convient pas. On resserre jusqu'à tenir la plus claire des acceptables.
  let bas = 0;
  let haut = l;
  for (let i = 0; i < 24; i++) {
    const milieu = (bas + haut) / 2;
    if (auContraste(milieu)) bas = milieu; else haut = milieu;
  }
  return rvbVersHex(tslVersRvb([h, s, bas]));
}

/**
 * Poids d'un groupe de pixels dans le choix de la couleur dominante.
 *
 * Compter les pixels seuls fait gagner les grandes plages ternes : le pelage
 * d'un logo animalier l'emporte sur le bleu vif de sa casquette, alors que
 * c'est le second que l'œil retient. La saturation pèse donc dans la balance.
 */
export function poidsGroupe(nombre: number, saturation: number): number {
  return nombre * (0.35 + saturation);
}
