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

/** Le rapport de contraste entre deux couleurs, de 1 à 21. */
export function contraste(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Encre presque noire plutôt que noire : le noir pur pique sur une couleur vive. */
const ENCRE_SOMBRE = "#0B1220";

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
