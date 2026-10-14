"use client";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  EVEIL_DU_LOGO, REGLAGES_NOVAC, REPOS, type ReglagesTrame, affaiblissementDeLAnneau,
  attraction, bandeDeLAnneau, pasDeRessort, poserLaTrame,
} from "@/lib/trame";

/**
 * Le dessin du logo, au bord fondu, qui sert de masque à la silhouette.
 *
 * ⚠️ **C'est le fichier flou, et c'est voulu** : un contour net tranche les points qu'il
 * croise, et l'on voit des moitiés de point le long du bord. Voir l'en-tête du SVG.
 */
const MASQUE_DU_LOGO = "/logo-hivesync-doux.svg";

/**
 * La trame de points, dessinée au canvas : chaque point est une masse sur ressort.
 *
 * ⚠️ **Ce n'est pas un réglage de `.nv-points`, c'est son remplacement.** Le fond était un
 * `radial-gradient` répété : le compositeur le peignait une fois et n'y revenait plus, et son
 * seul mouvement était un masque qui suivait le curseur — la trame, elle, ne bougeait pas
 * d'un pixel. Déplacer un point indépendamment de ses voisins demande de les dessiner un par
 * un, donc une toile et une boucle.
 *
 * ⚠️ **Le curseur est écouté sur la fenêtre, pas sur la toile.** La référence est une carte
 * de 480 px qui reçoit ses propres événements ; un fond de page vit sous tout le contenu en
 * `pointer-events: none`, et n'en reçoit aucun. C'était déjà le choix de `PointsFond`, pour
 * la même raison : sans cela la trame s'éteindrait dès que le curseur passe sur une carte.
 *
 * ⚠️ **La boucle s'endort dès que tout est à sa cible** — cible, et non place d'origine : un
 * curseur immobile tient des milliers de points écartés et ne doit rien coûter. Toute entrée
 * la réveille, et l'`IntersectionObserver` l'arrête quand la trame sort de l'écran.
 *
 * D'après `ui-lab/src/lab/components/dot-grid.tsx`. Les forces sont les siennes, au chiffre
 * près — voir `lib/trame.ts` ; ce qui change ici est l'ancrage à Novac : la maille, les
 * jetons de couleur des deux thèmes, l'écoute sur la fenêtre, et la silhouette du logo.
 */
export default function TrameAnimee({
  reglages = REGLAGES_NOVAC, surMesure, silhouette = false, className, style,
}: {
  reglages?: ReglagesTrame;
  /** Le banc d'essai s'en sert pour afficher ce que la trame coûte. */
  surMesure?: (m: { points: number; eveilles: number; ips: number; endormie: boolean }) => void;
  /**
   * Cette trame peut-elle porter la silhouette du logo ?
   *
   * ⚠️ **La silhouette n'est pas une couche : c'est un éveil.** Elle a d'abord été une
   * seconde toile, masquée par le logo, qui redessinait les mêmes points en plus gros et à
   * une encre propre. Deux défauts, et le second est rédhibitoire : des points plus gros sans
   * raison visible se lisent comme un artifice, et surtout le curseur qui passait dessus
   * **repeignait son encre vive par-dessus celle du logo** — le point fonçait, donc le logo
   * se trahissait au survol, ce que cette couche était précisément censée éviter.
   *
   * ⚠️ **Un point du logo est donc un point que le curseur a réveillé, en permanence.** Même
   * rayon, même encre, une seule passe : son éveil vaut `EVEIL_DU_LOGO`, c'est-à-dire le
   * maximum que `attraction` puisse rendre. La souris qui passe dessus demande un éveil de 1
   * là où il vaut déjà 1 : elle n'a rien à lui ajouter, ni en taille ni en encre.
   *
   * ⚠️ **Le masque est pesé ici plutôt qu'appliqué par le CSS**, et il le fallait : tant
   * qu'une couche masquée se superposait au fond, les deux dessins s'additionnaient. La toile
   * échantillonne donc le logo une fois par disposition et en tire le poids de chaque point.
   * La géométrie, elle, reste dans `globals.css` — voir `--nv-logo-*`, que le navigateur
   * résout (`min(115vh, 1300px)`) avant qu'on les lise.
   */
  silhouette?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const cadreRef = useRef<HTMLDivElement>(null);
  const toileRef = useRef<HTMLCanvasElement>(null);
  /** Le dessin du masque, chargé une fois et gardé d'une disposition à l'autre. */
  const logoRef = useRef<HTMLImageElement | null>(null);
  /**
   * La sonde qui fait résoudre `--nv-logo-cote` par le navigateur.
   *
   * ⚠️ **Une propriété personnalisée ne se calcule pas.** `getComputedStyle` rend le texte
   * qu'on y a écrit — littéralement « min(115vh, 1300px) » — parce qu'une variable CSS n'a pas
   * de type tant que rien ne la consomme. Posée sur la `width` d'un élément, en revanche,
   * l'expression est résolue par la mise en page et se relit en pixels. D'où ce div de hauteur
   * nulle : il ne dessine rien, il calcule. L'expression, elle, reste dans `globals.css`.
   */
  const sondeRef = useRef<HTMLDivElement>(null);
  const [sobre, setSobre] = useState(false);

  // Le réglage système, relu quand il change : une préférence d'accessibilité qui ne
  // s'applique qu'au chargement se lit comme un réglage qui ne marche pas.
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setSobre(media.matches);
    const suivre = () => setSobre(media.matches);
    media.addEventListener("change", suivre);
    return () => media.removeEventListener("change", suivre);
  }, []);

  // `surMesure` change à chaque rendu du banc ; passer par une référence évite de
  // reconstruire toute la trame — et donc de rendre ses points chez eux — à chaque mesure.
  const mesureRef = useRef(surMesure);
  mesureRef.current = surMesure;

  /**
   * Les réglages sont lus à chaque image, et non capturés au montage.
   *
   * ⚠️ **Sans cela, le banc d'essai ne servirait à rien.** Une tirette émet des dizaines de
   * valeurs pendant qu'on la traîne ; si chacune remontait l'effet, la trame serait reposée
   * et tous les points rappelés chez eux à chaque pixel parcouru. On ne jugerait plus un
   * ressort, on regarderait une trame qui sursaute. Seul le pas rebâtit vraiment quelque
   * chose — il change le nombre de points — et lui seul est resté en dépendance.
   */
  const reglagesRef = useRef(reglages);
  reglagesRef.current = reglages;

  /** Réveiller la boucle depuis l'extérieur — voir l'effet qui suit. */
  const reveilRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const cadre = cadreRef.current;
    const toile = toileRef.current;
    const ctx = toile?.getContext("2d");
    if (!cadre || !toile || !ctx) return;

    let largeur = 0;
    let hauteur = 0;
    let nombre = 0;
    // Des tableaux typés à plat : la boucle par image n'alloue rien.
    let baseX = new Float32Array(0);
    let baseY = new Float32Array(0);
    let ecartX = new Float32Array(0);
    let ecartY = new Float32Array(0);
    let vitesseX = new Float32Array(0);
    let vitesseY = new Float32Array(0);
    let eveil = new Float32Array(0);
    let vitesseEveil = new Float32Array(0);
    /** L'éveil que le logo impose à chaque point, de 0 à `EVEIL_DU_LOGO`. */
    let poidsLogo = new Float32Array(0);

    let curseur: { x: number; y: number } | null = null;
    let anneaux: { x: number; y: number; ne: number }[] = [];
    let image = 0;
    let precedente = 0;
    let visible = true;
    let terne = "";
    let vive = "";

    /**
     * La lueur du curseur est-elle permise ?
     *
     * ⚠️ **C'est le CSS qui répond, et non un point de rupture recopié ici.** `.nv-points`
     * éteint sa lueur en `(hover: none)` et sous 700 px — y compris pour une vraie souris
     * dans une fenêtre étroite, où elle se lit comme un défaut. Le jeton `--nv-lueur` porte
     * cette décision jusqu'ici, et reste écrit une seule fois.
     */
    let lueur = true;
    /** Même mécanisme pour la silhouette : `--nv-logo`, posé par la page et par l'écran. */
    let logoDemande = false;
    let coteLogo = 0;
    let versLaDroite = 0;
    let versLeBas = 0;

    // Les jetons plutôt qu'une couleur écrite : ce sont ceux de `.nv-points`, et ils portent
    // déjà leur opacité — 0,12 pour la trame, 0,64 (0,58 en clair) pour la lueur.
    const lireLesCouleurs = () => {
      const style = getComputedStyle(document.documentElement);
      terne = style.getPropertyValue("--nv-point").trim() || "rgba(106,114,130,0.12)";
      vive = style.getPropertyValue("--nv-point-vif").trim() || "rgba(106,114,130,0.64)";
    };

    /** Ce que la feuille de style décide : la lueur, la silhouette, et la place du logo. */
    const lireLesReglesCss = () => {
      const s = getComputedStyle(cadre);
      const nombreCss = (nom: string) => parseFloat(s.getPropertyValue(nom)) || 0;
      lueur = (s.getPropertyValue("--nv-lueur").trim() || "1") !== "0";
      logoDemande = silhouette && (s.getPropertyValue("--nv-logo").trim() || "0") !== "0";
      // Le côté passe par la sonde, seule à savoir résoudre `min(115vh, 1300px)`.
      const sonde = sondeRef.current;
      coteLogo = sonde ? parseFloat(getComputedStyle(sonde).width) || 0 : 0;
      versLaDroite = nombreCss("--nv-logo-droite");
      versLeBas = nombreCss("--nv-logo-bas");
    };

    /**
     * Le poids du logo sur chaque point : une fois par disposition, pas une fois par image.
     *
     * ⚠️ **La traduction du `mask-position` est la seule chose délicate ici.** En CSS, un
     * décalage en pourcentage se rapporte à *la boîte moins l'image* : `right -16%` place le
     * bord droit du dessin à −16 % de (largeur − côté) du bord droit, d'où un coin gauche en
     * `(largeur − côté) × (1 − p)`. Les deux facteurs viennent de `globals.css` et ne sont
     * pas recopiés ici ; seule la formule l'est.
     *
     * ⚠️ **Les deux masques s'intersectent**, comme le faisait `mask-composite: intersect` :
     * le dessin du logo, puis la retombée radiale qui éteint ses bords — `destination-in`.
     */
    const peserLeLogo = () => {
      poidsLogo = new Float32Array(nombre);
      const dessin = logoRef.current;
      if (!logoDemande || !dessin?.complete || !dessin.naturalWidth || coteLogo <= 0) return;

      const cote = coteLogo;
      const x0 = (largeur - cote) * (1 - versLaDroite);
      const y0 = (hauteur - cote) * (1 - versLeBas);
      const brouillon = document.createElement("canvas");
      brouillon.width = Math.max(1, Math.round(largeur));
      brouillon.height = Math.max(1, Math.round(hauteur));
      const bctx = brouillon.getContext("2d", { willReadFrequently: true });
      if (!bctx) return;

      bctx.drawImage(dessin, x0, y0, cote, cote);
      bctx.globalCompositeOperation = "destination-in";
      const retombee = bctx.createRadialGradient(
        x0 + cote / 2, y0 + cote / 2, 0, x0 + cote / 2, y0 + cote / 2, cote / 2);
      // Les arrêts de `.nv-silhouette`, dans l'ordre : pleine, puis trois paliers.
      retombee.addColorStop(0, "rgba(0,0,0,1)");
      retombee.addColorStop(0.08, "rgba(0,0,0,1)");
      retombee.addColorStop(0.46, "rgba(0,0,0,0.62)");
      retombee.addColorStop(0.72, "rgba(0,0,0,0.22)");
      retombee.addColorStop(0.96, "rgba(0,0,0,0)");
      bctx.fillStyle = retombee;
      bctx.fillRect(0, 0, brouillon.width, brouillon.height);

      const pixels = bctx.getImageData(0, 0, brouillon.width, brouillon.height).data;
      for (let i = 0; i < nombre; i++) {
        const cx = Math.round(baseX[i]);
        const cy = Math.round(baseY[i]);
        if (cx < 0 || cy < 0 || cx >= brouillon.width || cy >= brouillon.height) continue;
        poidsLogo[i] = (pixels[(cy * brouillon.width + cx) * 4 + 3] / 255) * EVEIL_DU_LOGO;
      }
    };

    const disposer = () => {
      const densite = window.devicePixelRatio || 1;
      /**
       * ⚠️ **La toile est dimensionnée au pixel physique près, et sa taille CSS en découle.**
       * `clientWidth` est un entier arrondi ; la boîte, elle, peut mesurer 1018,5 px. La toile
       * recevait alors 2036 pixels de large pour 1018,5 d'affichage, soit un facteur de 1,999
       * au lieu de 2 : le navigateur **rééchantillonne la toile entière**, et tout devient
       * légèrement flou. On part donc de la mesure réelle, on arrondit le tampon au pixel
       * physique, et on rend à la toile la taille CSS qui lui correspond exactement.
       */
      const boite = cadre.getBoundingClientRect();
      const tamponL = Math.max(1, Math.round(boite.width * densite));
      const tamponH = Math.max(1, Math.round(boite.height * densite));
      largeur = tamponL / densite;
      hauteur = tamponH / densite;
      toile.width = tamponL;
      toile.height = tamponH;
      toile.style.width = `${largeur}px`;
      toile.style.height = `${hauteur}px`;
      ctx.setTransform(densite, 0, 0, densite, 0, 0);
      lireLesReglesCss();

      const trame = poserLaTrame(largeur, hauteur, reglagesRef.current.pas, densite);
      nombre = trame.nombre;
      baseX = trame.x;
      baseY = trame.y;
      ecartX = new Float32Array(nombre);
      ecartY = new Float32Array(nombre);
      vitesseX = new Float32Array(nombre);
      vitesseY = new Float32Array(nombre);
      eveil = new Float32Array(nombre);
      vitesseEveil = new Float32Array(nombre);
      peserLeLogo();
    };

    let eveilles = 0;
    const dessiner = () => {
      const { point, grossissement } = reglagesRef.current;
      ctx.clearRect(0, 0, largeur, hauteur);
      eveilles = 0;

      // La trame au repos est une matière de fond ; c'est la seconde passe qui porte le
      // contraste, sur les quelques points éveillés — ceux du curseur et ceux du logo.
      ctx.fillStyle = terne;
      ctx.beginPath();
      for (let i = 0; i < nombre; i++) {
        const e = Math.max(eveil[i], poidsLogo[i]);
        if (e >= 0.02) eveilles++;
        const x = baseX[i] + ecartX[i];
        const y = baseY[i] + ecartY[i];
        const r = point * (1 + (sobre ? 0 : grossissement) * e);
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fill();

      // ⚠️ **Une seule passe vive, et c'est ce qui rend le logo indiscernable du survol.**
      // Le poids du logo entre ici par le même chemin que l'éveil du curseur, et par un
      // maximum, non par une somme : un point déjà pleinement éveillé ne peut pas l'être
      // davantage, donc la souris qui passe sur la silhouette ne change rien — ni son rayon,
      // ni son encre. Deux passes superposées, elles, additionnaient leurs encres.
      ctx.fillStyle = vive;
      for (let i = 0; i < nombre; i++) {
        const e = Math.max(eveil[i], poidsLogo[i]);
        if (e < 0.02) continue;
        const x = baseX[i] + ecartX[i];
        const y = baseY[i] + ecartY[i];
        const r = point * (1 + (sobre ? 0 : grossissement) * e);
        ctx.globalAlpha = Math.min(1, e);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    let images = 0;
    const avancer = (maintenant: number) => {
      const { champ, poussee, raideur, amortissement,
              vitesseAnneau, largeurAnneau, pousseeAnneau } = reglagesRef.current;
      // Borné : une image sautée ou un onglet en arrière-plan ferait exploser le ressort.
      const dt = Math.min((maintenant - precedente) / 1000, 1 / 30);
      precedente = maintenant;
      images++;
      const t = maintenant / 1000;
      const portee = Math.hypot(largeur, hauteur);
      anneaux = anneaux.filter((a) => (t - a.ne) * vitesseAnneau < portee + largeurAnneau);

      let bouge = anneaux.length > 0;
      for (let i = 0; i < nombre; i++) {
        let cibleX = 0;
        let cibleY = 0;
        let cibleEveil = 0;

        if (curseur && lueur) {
          const dx = baseX[i] - curseur.x;
          const dy = baseY[i] - curseur.y;
          const d = Math.hypot(dx, dy);
          const f = attraction(d, champ);
          if (f > 0) {
            cibleEveil = f;
            if (!sobre && d > 0.001) {
              cibleX = (dx / d) * poussee * f;
              cibleY = (dy / d) * poussee * f;
            }
          }
        }

        if (!sobre) {
          for (const anneau of anneaux) {
            const dx = baseX[i] - anneau.x;
            const dy = baseY[i] - anneau.y;
            const d = Math.hypot(dx, dy);
            const rayon = (t - anneau.ne) * vitesseAnneau;
            const f = bandeDeLAnneau(d, rayon, largeurAnneau)
              * affaiblissementDeLAnneau(rayon, portee);
            if (f < 0.01 || d < 0.001) continue;
            cibleX += (dx / d) * pousseeAnneau * f;
            cibleY += (dy / d) * pousseeAnneau * f;
            cibleEveil = Math.max(cibleEveil, f);
          }
        }

        [ecartX[i], vitesseX[i]] =
          pasDeRessort(ecartX[i], vitesseX[i], cibleX, dt, raideur, amortissement);
        [ecartY[i], vitesseY[i]] =
          pasDeRessort(ecartY[i], vitesseY[i], cibleY, dt, raideur, amortissement);
        const [e, ve] =
          pasDeRessort(eveil[i], vitesseEveil[i], cibleEveil, dt, raideur, amortissement);
        eveil[i] = Math.max(0, e);
        vitesseEveil[i] = ve;

        // Posé veut dire « à sa cible », et non « chez lui » : un curseur immobile ne coûte rien.
        if (
          Math.abs(cibleX - ecartX[i]) > REPOS || Math.abs(cibleY - ecartY[i]) > REPOS
          || Math.abs(cibleEveil - eveil[i]) > REPOS || Math.abs(vitesseX[i]) > REPOS
          || Math.abs(vitesseY[i]) > REPOS || Math.abs(vitesseEveil[i]) > REPOS
        ) {
          bouge = true;
        }
      }
      dessiner();
      image = bouge && visible ? requestAnimationFrame(avancer) : 0;
    };

    const reveiller = () => {
      if (image || !visible) return;
      precedente = performance.now();
      image = requestAnimationFrame(avancer);
    };
    reveilRef.current = reveiller;

    const dansLaToile = (e: PointerEvent) => {
      const boite = toile.getBoundingClientRect();
      return { x: e.clientX - boite.left, y: e.clientY - boite.top };
    };

    // Un doigt n'a pas de position de survol : la lueur resterait allumée là où l'on a
    // touché, comme un projecteur oublié. Même règle que l'ancien `PointsFond`.
    const bouger = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      curseur = dansLaToile(e);
      reveiller();
    };
    const sortir = () => {
      curseur = null;
      reveiller();
    };
    const appuyer = (e: PointerEvent) => {
      if (sobre || !lueur || e.pointerType === "touch" || e.button !== 0) return;
      // Trois ondes à la fois est déjà beaucoup ; les plus anciennes cèdent la place.
      anneaux = [...anneaux.slice(-2), { ...dansLaToile(e), ne: performance.now() / 1000 }];
      reveiller();
    };

    lireLesCouleurs();
    disposer();
    dessiner();

    // Le dessin du logo n'est chargé que si cette trame peut le porter, et une seule fois
    // pour toute la vie de l'effet : c'est une image, le navigateur la garde.
    if (silhouette && !logoRef.current) {
      const dessin = new Image();
      dessin.src = MASQUE_DU_LOGO;
      dessin.onload = () => {
        peserLeLogo();
        if (!image) dessiner();
      };
      logoRef.current = dessin;
    } else if (logoRef.current?.complete) {
      peserLeLogo();
      dessiner();
    }

    const taille = new ResizeObserver(() => {
      disposer();
      dessiner();
    });
    taille.observe(cadre);

    const repeindre = () =>
      requestAnimationFrame(() => {
        lireLesCouleurs();
        const logoAvant = logoDemande;
        lireLesReglesCss();
        // La silhouette vient d'ouvrir ou de fermer : ses poids sont à refaire.
        if (logoDemande !== logoAvant) peserLeLogo();
        if (!image) dessiner();
      });
    // Le thème est posé sur `<html>` avant l'hydratation et change en cours de visite ;
    // `data-silhouette` s'y pose et s'y retire au fil des pages — voir `SilhouetteNovac`.
    const theme = new MutationObserver(repeindre);
    theme.observe(document.documentElement,
      { attributes: true, attributeFilter: ["data-theme", "data-silhouette"] });
    const systeme = window.matchMedia("(prefers-color-scheme: dark)");
    systeme.addEventListener("change", repeindre);

    /**
     * ⚠️ **Changer d'écran ne change pas la taille de la fenêtre, mais change ses pixels.**
     * Passer d'un écran Retina à un moniteur externe fait tomber la densité de 2 à 1 sans
     * qu'aucun redimensionnement ne se produise : le `ResizeObserver` reste muet et la toile
     * garde un tampon deux fois trop grand, que le navigateur réduit — donc une trame floue
     * jusqu'au prochain redimensionnement. Cette requête média se déclenche à la bascule.
     */
    const densiteMedia = window.matchMedia(
      `(resolution: ${window.devicePixelRatio || 1}dppx)`);
    const changerDeDensite = () => {
      disposer();
      dessiner();
    };
    densiteMedia.addEventListener("change", changerDeDensite);

    const vue = new IntersectionObserver(([entree]) => {
      visible = entree.isIntersecting;
      if (visible) reveiller();
      else if (image) {
        cancelAnimationFrame(image);
        image = 0;
      }
    });
    vue.observe(cadre);

    window.addEventListener("pointermove", bouger, { passive: true });
    window.addEventListener("pointerdown", appuyer, { passive: true });
    document.addEventListener("pointerleave", sortir);

    // La mesure du banc, à part de la boucle : elle doit pouvoir dire « endormie », ce
    // qu'une boucle arrêtée ne peut évidemment pas annoncer elle-même.
    const mesure = window.setInterval(() => {
      mesureRef.current?.({
        points: nombre, eveilles, ips: images * 2, endormie: image === 0 });
      images = 0;
    }, 500);

    return () => {
      cancelAnimationFrame(image);
      window.clearInterval(mesure);
      taille.disconnect();
      theme.disconnect();
      vue.disconnect();
      systeme.removeEventListener("change", repeindre);
      densiteMedia.removeEventListener("change", changerDeDensite);
      window.removeEventListener("pointermove", bouger);
      window.removeEventListener("pointerdown", appuyer);
      document.removeEventListener("pointerleave", sortir);
      reveilRef.current = null;
    };
    // `reglages.pas` et lui seul : voir `reglagesRef`.
  }, [reglages.pas, sobre, silhouette]);

  // Un réglage changé pendant que la boucle dort ne se verrait qu'au prochain mouvement de
  // souris — une tirette qui ne fait rien tant qu'on ne bouge pas se lit comme cassée.
  useEffect(() => { reveilRef.current?.(); }, [reglages]);

  return (
    <div ref={cadreRef} className={className} style={style} aria-hidden="true">
      <canvas ref={toileRef} style={{ position: "absolute", inset: 0 }} />
      {silhouette && <div ref={sondeRef} className="nv-logo-sonde" />}
    </div>
  );
}
