import { ETATS, type Etat, type Pose, POSE_NEUTRE, etatParCle, poseDeLEtat } from "./avatarEtats";

/**
 * Ce qui fait qu'un visage a l'air vivant.
 *
 * ⚠️ **Rien ici ne dessine, et c'est la raison d'être du module.** Une animation est
 * d'abord une affaire de *temps* : des durées, des enchaînements, des retours au repos.
 * Mêlée au rendu, cette logique ne se vérifie qu'à l'œil, sur des instants qu'il faut
 * réussir à saisir. Isolée, elle se contrôle image par image et sur des minutes
 * simulées, sans rien afficher.
 *
 * ⚠️ **Trois couches qui se superposent, et qui ne se ressemblent pas.**
 *
 * 1. L'**état** — ce que le visage exprime, décidé par l'application. Il *dure*.
 * 2. La **dérive**, continue, jamais interrompue : c'est elle qui empêche l'immobilité
 *    parfaite, laquelle se lit comme une image et non comme un visage.
 * 3. Le **clignement**, qui se superpose à tout le reste parce qu'on cligne dans
 *    n'importe quel état — seule sa fréquence change.
 *
 * Les mêler en un seul mécanisme aurait donné soit une agitation permanente, soit un
 * pantin qui se fige entre deux mimiques.
 *
 * ⚠️ **La dérive est une somme de sinus, pas un bruit aléatoire.** Trois périodes sans
 * rapport simple ne se répètent pas à l'échelle d'une visite, et le résultat reste
 * dérivable — donc lisse — sans le moindre filtre à entretenir. Un bruit tiré à chaque
 * image aurait fallu être lissé, et le lissage aurait eu sa propre inertie à régler.
 */

/** L'état instantané du visage, à composer avec les réglages de l'utilisateur. */
export type EtatVie = {
  /** Fermeture de chaque œil : 0 grand ouvert, 1 fermé. */
  fermetureGauche: number;
  fermetureDroite: number;
  /** Décalages d'orientation, en degrés. */
  lacet: number;
  tangage: number;
  roulis: number;
  /** Multiplicateurs de la forme des yeux. */
  largeur: number;
  hauteur: number;
  ecart: number;
  /** Cambrure de l'œil, pour les mimiques arquées. */
  courbure: number;
  /** Inclinaison ajoutée aux capsules, en degrés. */
  inclinaison: number;
  /** Échelle de la tête — squash, rebond, recul. */
  echelleX: number;
  echelleY: number;
  /** Ce qu'il reste du suivi du curseur dans cet état. */
  suivi: number;
};

export type ReglagesVie = {
  /** Amplitude de la dérive au repos, en degrés. Zéro fige la tête. */
  derive: number;
  /** Les clignements automatiques. */
  clignement: boolean;
  /** Intervalle moyen entre deux clignements, en secondes. */
  cadenceClignement: number;
};

export const VIE_AU_REPOS: EtatVie = {
  fermetureGauche: 0, fermetureDroite: 0,
  lacet: 0, tangage: 0, roulis: 0,
  largeur: 1, hauteur: 1, ecart: 1, courbure: 0, inclinaison: 0,
  echelleX: 1, echelleY: 1, suivi: 1,
};

/**
 * Les durées d'un clignement, en millisecondes.
 *
 * ⚠️ **La fermeture est plus rapide que l'ouverture**, et c'est ce qui fait qu'on y
 * croit : une paupière tombe d'un coup et se relève en freinant. Des durées égales
 * donnent un battement mécanique, du genre métronome, qu'on remarque immédiatement sans
 * savoir dire pourquoi.
 */
const FERMER = 85;
const OUVRIR = 135;
/** L'attente avant le second battement, quand le clignement est double. */
const REBOND = 190;
/** Constante de temps par défaut pour entrer dans un état. */
const AMORTI = 210;

const CLES_POSE: (keyof Pose)[] = [
  "largeur", "hauteur", "ecart", "courbure", "inclinaison",
  "lacet", "tangage", "roulis", "fermeture", "asymetrie",
  "echelleX", "echelleY", "derive", "suivi",
];

export type Vie = {
  /** Rend l'état du visage à l'instant `t`, en millisecondes. */
  avancer: (t: number, reglages: ReglagesVie) => EtatVie;
  /**
   * Demande un état. Un `soutenu` remplace l'état de fond ; un `ponctuel` se joue puis
   * rend la main à ce fond.
   */
  demander: (cle: string, t: number) => void;
  /** L'état de fond en cours — celui qui dure. */
  fond: () => string;
  /** L'état effectivement joué à cet instant, ponctuel compris. */
  courant: () => string;
};

export function creerVie(alea: () => number = Math.random): Vie {
  let etatFond: Etat = ETATS[0];
  let ponctuel: Etat | null = null;
  let debutEtat = 0;
  /** La pose réellement rendue : elle rejoint la pose visée en amortissant. */
  let pose: Pose = { ...POSE_NEUTRE };
  let precedent = -1;

  let prochainClin = -1;
  let debutClin: number | null = null;
  let doubleClin = false;

  const actif = () => ponctuel ?? etatFond;

  return {
    fond: () => etatFond.cle,
    courant: () => actif().cle,

    demander: (cle, t) => {
      const etat = etatParCle(cle);
      debutEtat = t;
      if (etat.nature === "ponctuel") ponctuel = etat;
      else { etatFond = etat; ponctuel = null; }
    },

    avancer: (t, reglages) => {
      if (precedent < 0) precedent = t;
      const dt = Math.min(64, t - precedent);
      precedent = t;

      // ── L'état, et son éventuelle expiration ──────────────────────────────
      if (ponctuel && t - debutEtat >= (ponctuel.duree ?? 1000)) {
        ponctuel = null;
        debutEtat = t;
      }
      const etat = actif();
      const ecoule = t - debutEtat;

      /**
       * ⚠️ **On rejoint la pose visée, on n'y saute pas.** L'amorti est calculé sur le
       * temps écoulé et non par image : un `v += (cible - v) * 0.1` par image rend le
       * mouvement deux fois plus lent sur un écran à 120 Hz que sur un écran à 60, un
       * défaut qu'on ne voit jamais sur sa propre machine.
       */
      const visee = poseDeLEtat(etat);
      const part = 1 - Math.exp(-dt / (etat.amorti ?? AMORTI));
      const suivante = { ...pose };
      for (const cle of CLES_POSE) {
        suivante[cle] = pose[cle] + (visee[cle] - pose[cle]) * part;
      }
      pose = suivante;

      // Le mouvement propre à l'état vient **après** l'amorti : il s'ajoute à la pose
      // au lieu d'être poursuivi par elle, sans quoi le « non » de l'erreur serait
      // rattrapé et lissé jusqu'à disparaître.
      const rendu: Pose = { ...pose };
      if (etat.anime) {
        const ajout = etat.anime(ecoule);
        for (const cle of CLES_POSE) {
          const v = ajout[cle];
          if (v === undefined) continue;
          // Les échelles se multiplient, les angles s'ajoutent : mélanger les deux
          // ferait doubler la taille de la tête au lieu de la faire rebondir.
          if (cle === "echelleX" || cle === "echelleY") rendu[cle] *= v;
          else rendu[cle] += v;
        }
      }

      // ── La dérive, toujours là ────────────────────────────────────────────
      if (reglages.derive > 0 && rendu.derive > 0) {
        const d = reglages.derive * rendu.derive;
        rendu.lacet += d * (0.62 * Math.sin(t / 2900) + 0.38 * Math.sin(t / 1730 + 1.1));
        rendu.tangage += d * 0.55 * (0.6 * Math.sin(t / 3310 + 2.2) + 0.4 * Math.sin(t / 2090 + 0.4));
        rendu.roulis += d * 0.42 * Math.sin(t / 4270 + 1.7);
        rendu.hauteur *= 1 + 0.025 * Math.sin(t / 3700 + 0.9);
      }

      // ── Le clignement, superposé à l'état ─────────────────────────────────
      const cadence = reglages.cadenceClignement * 1000 * (etat.clignement ?? 1);
      const attendre = () => t + cadence * (0.6 + alea() * 0.85);
      if (prochainClin < 0) prochainClin = attendre();
      let clin = 0;
      if (!reglages.clignement) {
        debutClin = null;
        prochainClin = attendre();
      } else if (debutClin === null) {
        if (t >= prochainClin) debutClin = t;
      } else {
        const e = t - debutClin;
        const f = e < FERMER ? e / FERMER
          : e < FERMER + OUVRIR ? 1 - (e - FERMER) / OUVRIR : null;
        if (f === null) {
          debutClin = null;
          // Un clignement sur quatre est double : fréquent chez l'humain, et c'est ce
          // qui empêche la cadence de se laisser deviner.
          if (doubleClin) { doubleClin = false; prochainClin = t + REBOND; }
          else {
            doubleClin = alea() < 0.25;
            prochainClin = doubleClin ? t + REBOND : attendre();
          }
        } else clin = f;
      }

      /**
       * ⚠️ **Le clignement et la fermeture de fond se combinent par le maximum**, pas
       * par une somme. Un dormeur aux paupières à mi-course qui cligne doit fermer
       * l'œil, pas le fermer une fois et demie — une somme aurait dépassé un et rendu
       * une hauteur négative.
       */
      const fermeture = (biais: number) =>
        Math.min(1, Math.max(clin, Math.min(1, rendu.fermeture + biais)));

      return {
        fermetureGauche: fermeture(0),
        fermetureDroite: fermeture(rendu.asymetrie),
        lacet: rendu.lacet,
        tangage: rendu.tangage,
        roulis: rendu.roulis,
        largeur: rendu.largeur,
        hauteur: rendu.hauteur,
        ecart: rendu.ecart,
        courbure: rendu.courbure,
        inclinaison: rendu.inclinaison,
        echelleX: rendu.echelleX,
        echelleY: rendu.echelleY,
        suivi: rendu.suivi,
      };
    },
  };
}
