/**
 * L'ancrage du liseré : l'angle du dégradé, **mesuré sur le bouton** plutôt que déclaré.
 *
 * ⚠️ **Parce qu'un angle écrit à la main est un angle qui dérive.** `globals.css` démontre
 * que l'axe doit valoir `180° − atan(h / w)` — c'est ce qui ramène les deux coins opposés
 * de part et d'autre de 50 %, là où le dégradé s'éteint. La valeur était donc recalculée
 * puis recopiée à chaque emplacement : 171° par défaut, 170° pour « Ajouter un compte »,
 * et un commentaire pour expliquer l'écart d'un degré. Une règle géométrique tenue à la
 * main sur quatre boutons, alors que le navigateur connaît la largeur exacte.
 *
 * ⚠️ **Ce que coûte l'erreur.** L'axe n'est pas une préférence : à 135° sur une pilule de
 * 141 × 22, les coins retombent à 86,7 % et 13,3 %, en pleine partie éclairée — le liseré
 * fait alors le tour complet au lieu de s'interrompre, et l'effet disparaît. Un libellé
 * rallongé d'un mot suffit à décaler l'angle juste vers l'angle faux.
 *
 * ⚠️ **Une fonction, et non un hook, pour qu'elle serve dans une boucle.** Les deux sens
 * d'une opération — acheter, vendre — sont rendus par un `map` ; un hook n'y serait pas
 * appelable. React 19 accepte qu'une ref de rappel renvoie sa fonction de nettoyage, ce
 * qui permet d'y tenir un `ResizeObserver` sans état ni effet.
 */
export function ancrerLisere(el: HTMLElement | null) {
  if (!el) return;
  const poser = () => {
    const { width: w, height: h } = el.getBoundingClientRect();
    // Un bouton pas encore disposé n'a pas d'angle : on ne pose rien plutôt qu'un NaN,
    // et l'observateur repassera dès qu'il aura une taille.
    if (w <= 0 || h <= 0) return;
    const deg = 180 - (Math.atan(h / w) * 180) / Math.PI;
    el.style.setProperty("--nv-lisere-angle", `${deg.toFixed(1)}deg`);
  };
  poser();
  const ro = new ResizeObserver(poser);
  ro.observe(el);
  return () => ro.disconnect();
}
