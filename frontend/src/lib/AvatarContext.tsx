"use client";
import {
  type ReactNode, createContext, useCallback, useContext, useEffect, useMemo,
  useRef, useState,
} from "react";

import { GESTES_LIBRES, etatParCle, lireMarqueAvatar } from "@/lib/avatarEtats";

/**
 * Ce qui décide de l'humeur de l'avatar du bandeau.
 *
 * ⚠️ **Le répertoire dit *à quoi ressemble* chaque état ; ce module dit *quand*.** La
 * séparation est celle qui rend l'avatar réutilisable : la géométrie ne connaît pas
 * l'application, et l'application ne connaît pas la géométrie. Entre les deux, une clé
 * de caractère.
 *
 * ⚠️ **Trois déclencheurs ne demandent aucun câblage**, et c'est ce qui fait que
 * l'avatar réagit partout au lieu de réagir sur les deux pages où l'on aurait pensé à
 * l'appeler :
 *
 * 1. **Le survol**, par l'attribut `data-avatar` posé sur n'importe quel élément. Un
 *    écouteur unique sur le document suffit — aucun composant n'a à s'abonner.
 * 2. **Le chargement**, en comptant les requêtes en vol. L'avatar se concentre pendant
 *    que l'application calcule, sur toutes les pages à la fois.
 * 3. **L'inactivité**, qui l'endort puis le réveille.
 *
 * ⚠️ **Les états ponctuels passent par un jeton, pas par la clé seule.** Deux erreurs
 * de suite portent la même clé : sans compteur, la seconde ne déclencherait rien, parce
 * que rien n'aurait changé. C'est le défaut classique des animations pilotées par un
 * état React.
 */

type Expression = { cle: string; jeton: number };

type AvatarContexte = {
  /** L'état à jouer, avec son jeton de relance. */
  expression: Expression;
  /** Demande un état — soutenu ou ponctuel, le répertoire décide. */
  exprimer: (cle: string) => void;
  /**
   * Ce que dit la valeur précisément pointée — un point de courbe, une cellule.
   *
   * ⚠️ **Un canal à part, et non `exprimer`.** Les deux écrivaient le même état que le
   * survol par attribut : un relevé de courbe qui retombe à « neutre » effaçait alors
   * la mimique de la carte qu'on survolait. Deux sources sur une même variable finissent
   * toujours par se contredire, et ici la contradiction passait inaperçue parce qu'elle
   * n'apparaît qu'au moment où les deux parlent ensemble.
   */
  pointer: (cle: string | null) => void;
  /** Déclare un travail en cours ; rend la fonction qui le termine. */
  travaille: () => () => void;
};

const RIEN: AvatarContexte = {
  expression: { cle: "neutre", jeton: 0 },
  exprimer: () => {},
  pointer: () => {},
  travaille: () => () => {},
};

const Contexte = createContext<AvatarContexte>(RIEN);

export function useAvatar() {
  return useContext(Contexte);
}

/** Au-delà de ce silence, l'avatar s'endort. */
const AVANT_SOMMEIL = 75000;
/**
 * Au-delà de ce silence, l'avatar est laissé à lui-même — le **vagabondage**.
 *
 * ⚠️ **Une phase entre l'activité et le sommeil, là où il n'y avait qu'un seuil.** On
 * passait de « attentif » à « endormi » d'un coup, au bout de quarante-cinq secondes. Or
 * l'avatar a des gestes à lui — coups d'œil, étirements, l'invite de commande — qui ne
 * disent rien de l'application et qu'on ne veut donc pas voir pendant qu'on s'en sert.
 * L'inactivité est exactement le moment où ils ont leur place : personne n'attend de
 * réponse, et un visage qui ne fait plus rien du tout se lit comme une image figée.
 *
 * Vingt-cinq secondes : assez pour qu'on ait vraiment lâché l'écran, assez peu pour que la
 * phase existe avant que le sommeil ne l'écrase.
 */
const AVANT_LIBRE = 25000;
/**
 * L'espacement de l'invite de commande pendant le vagabondage.
 *
 * ⚠️ **Ni rare, ni répétitive — et c'est un équilibre étroit.** C'est un clin d'œil : vue
 * trop souvent, elle devient du papier peint et cesse d'être drôle ; vue une fois par
 * heure, personne ne la remarque jamais. Entre dix-huit et trente secondes, on en voit
 * deux ou trois par pause sans jamais avoir l'impression qu'elle se répète.
 */
const INVITE_MIN = 18000;
const INVITE_ETALEMENT = 12000;
/**
 * Garde-fou du compteur de requêtes.
 *
 * ⚠️ Sans lui, une requête qui ne se termine jamais — un serveur muet, un onglet mis en
 * veille au mauvais moment — laisserait l'avatar concentré pour toujours. Le symptôme
 * serait un visage figé sans que rien n'explique pourquoi.
 */
const CHARGEMENT_MAX = 20000;
/**
 * Ce que dure la curiosité après le dernier cran de défilement.
 *
 * ⚠️ Un délai, et non un état qu'on éteint au premier événement manquant : le
 * défilement d'inertie d'un pavé tactile envoie des salves espacées de plus de cent
 * millisecondes, et le visage se serait allumé et éteint à chaque creux. Six cents
 * millisecondes couvrent les trous d'une même impulsion sans laisser traîner la
 * curiosité une fois la page arrêtée.
 */
const FIN_DEFILEMENT = 600;
/**
 * Le nombre de demandes identiques d'affilée au bout duquel le visage se lasse.
 *
 * ⚠️ **Trois, et non deux : « la énième fois » suppose qu'on a déjà laissé passer.** Se
 * lasser au deuxième appel punirait une simple correction — on enregistre une valeur, on
 * s'aperçoit qu'on s'est trompé, on recommence. C'est au troisième que la répétition cesse
 * d'être un accident.
 */
const AVANT_LASSITUDE = 3;
/**
 * Au-delà de ce silence, le compte des répétitions repart de zéro.
 *
 * ⚠️ **Sans fenêtre, le compteur ne fait qu'additionner** : trois enregistrements réussis
 * étalés sur une matinée auraient fini par donner un visage blasé sans que rien ne se soit
 * répété. Ce qui lasse, c'est l'insistance — donc la même demande *rapprochée*. Vingt
 * secondes couvrent largement le va-et-vient d'un champ qu'on corrige, et rien de plus.
 */
const LASSITUDE = 20000;
/**
 * L'état de fond pendant qu'un ponctuel venu du survol se joue, et après lui.
 *
 * ⚠️ **« Curieux » et non « neutre » : le curseur est toujours posé sur quelque chose.** La
 * mimique jouée, on ne revient pas à « il ne se passe rien » — on revient à « je regarde ce
 * que tu regardes ». Voir `ranger`.
 */
const FOND_SOUS_PONCTUEL = "curieux";

export function AvatarProvider({ children }: { children: ReactNode }) {
  const [ponctuel, setPonctuel] = useState<Expression | null>(null);
  const [survole, setSurvole] = useState<string | null>(null);
  const [pointe, setPointe] = useState<string | null>(null);
  const [travaux, setTravaux] = useState(0);
  const [defile, setDefile] = useState(false);
  const [endormi, setEndormi] = useState(false);
  const jeton = useRef(0);
  /**
   * Ce qu'on vient de lui demander, et combien de fois de suite.
   *
   * ⚠️ **Le compte porte sur `exprimer`, et sur lui seul.** C'est le canal par lequel
   * l'application *demande* quelque chose au visage — enregistrer, réussir, échouer. Le
   * survol et la valeur pointée, eux, ne demandent rien : ils décrivent ce que
   * l'utilisateur regarde, et repasser deux fois sur la même carte n'est pas de
   * l'insistance. Les compter aurait rendu le visage blasé du simple fait qu'on promène
   * la souris.
   */
  const repetition = useRef({ cle: "", n: 0, quand: 0 });
  const exprimer = useCallback((cle: string) => {
    const etat = etatParCle(cle);
    jeton.current += 1;

    /**
     * ⚠️ **La lassitude passe *devant* l'état demandé, elle ne s'y ajoute pas.** C'est tout
     * le propos : à la troisième fois, le visage ne rejoue pas la joie de l'enregistrement
     * réussi, il arrête de faire semblant. Le jouer d'abord puis se lasser ensuite aurait
     * demandé un enchaînement, et surtout n'aurait rien exprimé — on aurait vu la même
     * mimique qu'aux deux premières fois.
     *
     * ⚠️ **« Blasé » est soutenu**, donc il tient jusqu'à ce qu'autre chose parle : un
     * survol, une valeur pointée, une autre demande. Il n'a pas besoin d'être annulé.
     */
    const maintenant = Date.now();
    const suite = repetition.current.cle === etat.cle
      && maintenant - repetition.current.quand < LASSITUDE;
    const n = suite ? repetition.current.n + 1 : 1;
    repetition.current = { cle: etat.cle, n, quand: maintenant };
    if (n >= AVANT_LASSITUDE) { setSurvole("blase"); return; }

    if (etat.nature === "ponctuel") setPonctuel({ cle: etat.cle, jeton: jeton.current });
    else setSurvole(etat.cle === "neutre" ? null : etat.cle);
  }, []);

  /**
   * Range une clé dans le bon logement : un ponctuel se **joue**, un soutenu s'**installe**.
   *
   * ⚠️ **C'est la distinction que le répertoire pose en tête, et que les canaux de survol
   * piétinaient.** Le survol et le pointage décrivent ce que l'utilisateur regarde : ils
   * écrivent donc naturellement dans un logement *soutenu*, qui dure tant que le curseur
   * reste. Or plusieurs des clés qu'ils produisent — « très content », « émerveillé » — sont
   * des **ponctuels** : des mimiques qui se jouent une fois et rendent la main. Écrites dans
   * le logement soutenu, elles n'avaient jamais l'occasion d'en sortir : la clé ne changeant
   * plus, `avatarVie` n'était jamais rappelé, et le visage restait figé dans sa mimique tant
   * que la souris ne bougeait pas. Signalé à l'usage — « l'animation ne se stoppe pas tant
   * que le curseur est sur la perf la plus élevée, sauf si endormissement ». L'endormissement
   * débloquait parce qu'il était la seule chose au monde à changer encore la clé.
   *
   * ⚠️ **Le logement soutenu retombe sur `FOND_SOUS_PONCTUEL` et non sur `null`.** On est
   * toujours en train de survoler quelque chose : rendre la main au neutre ferait retomber le
   * visage à l'état « il ne se passe rien » alors que le curseur est posé sur une valeur.
   * L'attention sans jugement est ce qui décrit le mieux ce moment-là.
   */
  const ranger = useCallback((cle: string, poser: (c: string | null) => void) => {
    const etat = etatParCle(cle);
    if (etat.nature !== "ponctuel") {
      poser(etat.cle === "neutre" ? null : etat.cle);
      return;
    }
    jeton.current += 1;
    setPonctuel({ cle: etat.cle, jeton: jeton.current });
    poser(FOND_SOUS_PONCTUEL);
  }, []);

  /**
   * ⚠️ **La valeur pointée attend que le curseur se pose.** Sans ce délai, promener la
   * souris le long d'une courbe faisait défiler les mimiques : chaque pixel parcouru
   * déplace la valeur, donc franchit des seuils, et la tête repartait en transition
   * avant d'avoir fini la précédente. Signalé à l'usage — « il change plein
   * d'expressions, ce n'est pas fluide ».
   *
   * Deux cent vingt millisecondes : assez pour absorber un balayage, assez peu pour que
   * l'arrêt sur un point paraisse immédiat. Le retour au repos, lui, n'attend pas —
   * quitter la courbe doit rendre la main tout de suite.
   */
  const attentePointe = useRef<number | null>(null);
  /**
   * La dernière clé effectivement annoncée par le pointage.
   *
   * ⚠️ **Nécessaire depuis qu'un ponctuel peut sortir d'ici** : le logement soutenu retombe
   * sur `FOND_SOUS_PONCTUEL`, donc comparer à `pointe` ne dirait plus ce qu'on a annoncé la
   * dernière fois. Sans ce souvenir, le moindre frémissement de la souris à l'intérieur du
   * sommet rejouerait l'émerveillement en boucle.
   */
  const dernierPointe = useRef<string | null>(null);
  const pointer = useCallback((cle: string | null) => {
    if (attentePointe.current !== null) window.clearTimeout(attentePointe.current);
    if (cle === null) {
      attentePointe.current = null;
      dernierPointe.current = null;
      setPointe(null);
      return;
    }
    attentePointe.current = window.setTimeout(() => {
      attentePointe.current = null;
      /* Déjà annoncée : on ne la rejoue pas tant que le curseur n'a pas changé d'avis. */
      if (dernierPointe.current === cle) return;
      dernierPointe.current = cle;
      ranger(cle, setPointe);
    }, 220);
  }, [ranger]);

  const travaille = useCallback(() => {
    setTravaux(n => n + 1);
    let fini = false;
    const finir = () => {
      if (fini) return;
      fini = true;
      setTravaux(n => Math.max(0, n - 1));
    };
    const secours = setTimeout(finir, CHARGEMENT_MAX);
    return () => { clearTimeout(secours); finir(); };
  }, []);

  // ── Le survol, par attribut ─────────────────────────────────────────────────
  /**
   * ⚠️ **Un seul écouteur sur le document, et non un par élément.** Poser des
   * `onMouseEnter` un peu partout aurait demandé de toucher chaque composant, et
   * l'avatar n'aurait réagi que là où on y aurait pensé. Ici, un attribut suffit :
   * `data-avatar="curieux"`, et l'élément devient expressif.
   */
  /**
   * Ce qu'on survole, et la dernière variation qu'on lui a vue.
   *
   * ⚠️ **Une seule case de mémoire, parce qu'on ne regarde qu'une chose à la fois.** La
   * colère demande de comparer deux instants — « une perte qui s'aggrave sous les yeux ».
   * Confier ce souvenir à chaque carte aurait voulu dire un état par ligne de tableau, et
   * un hook impossible à appeler dans le `map` qui les produit. Or seule la carte survolée
   * est « sous les yeux » : son historique tient donc ici, et il s'efface dès qu'on la
   * quitte.
   */
  const porteurSurvole = useRef<HTMLElement | null>(null);
  const variationVue = useRef<number | null>(null);

  useEffect(() => {
    /**
     * La clé que porte l'élément — et, s'il publie un chiffre, ce que ce chiffre est en
     * train de faire. Avance la mémoire de variation au passage.
     *
     * ⚠️ La décision elle-même vit dans `lireMarqueAvatar`, où elle s'éprouve : ici ne
     * restent que la lecture des attributs et la tenue du souvenir.
     */
    const lire = (porteur: HTMLElement | null): string | null => {
      const lu = lireMarqueAvatar(
        porteur?.dataset?.avatar ?? null,
        porteur?.dataset?.variation,
        variationVue.current,
      );
      variationVue.current = lu.variation;
      return lu.cle;
    };
    /* ⚠️ La lecture reste hors de l'actualiseur : React peut le rejouer — il le fait en
       mode strict — et la mémoire de variation avancerait deux fois pour un seul relevé. */
    const installer = (cle: string | null) =>
      setSurvole(precedent => (precedent === cle ? precedent : cle));
    /**
     * ⚠️ **Le survol range comme le pointage : une carte à +12 % joue « très content » une
     * fois, elle ne l'affiche pas en boucle.** C'est le même défaut que sur la courbe — une
     * mimique ponctuelle écrite dans un logement soutenu ne se termine jamais. La garde du
     * porteur, quelques lignes plus bas, suffit à ne pas la rejouer : tant qu'on ne quitte
     * pas l'élément, `poser` n'est pas rappelé.
     */
    const poser = (cle: string | null) =>
      cle === null ? installer(null) : ranger(cle, installer);

    /**
     * ⚠️ **L'élément survolé est *observé*, et pas seulement lu à l'entrée.** C'était la
     * limite connue de ce canal, notée sur la page du portefeuille : `data-avatar` n'était
     * relu qu'au moment où le curseur entrait. Or « sous les yeux » désigne exactement le
     * cas contraire — la souris ne bouge pas, et c'est la valeur qui change dessous, au
     * rythme du rafraîchissement des cours. Sans observateur, une perte pouvait se creuser
     * de dix points sans que le visage n'en sache rien.
     *
     * Un seul observateur, branché sur le seul élément survolé : il se débranche dès qu'on
     * en change, et ne coûte rien tant qu'on ne survole rien.
     */
    const observateur = typeof MutationObserver === "function"
      ? new MutationObserver(() => poser(lire(porteurSurvole.current)))
      : null;

    const survol = (e: PointerEvent) => {
      const cible = e.target as Element | null;
      const porteur = (cible?.closest?.("[data-avatar]") ?? null) as HTMLElement | null;
      /**
       * ⚠️ **Le même élément qu'à l'événement précédent ne se relit pas**, et ce n'est pas
       * qu'une économie. `pointerover` se déclenche à chaque enfant traversé : promener la
       * souris à l'intérieur d'une carte en envoie des dizaines, et chacun aurait remis la
       * mémoire de variation à zéro. La colère serait alors devenue impossible sur tout
       * élément qu'on ne survole pas parfaitement immobile.
       */
      if (porteur === porteurSurvole.current) return;
      observateur?.disconnect();
      porteurSurvole.current = porteur;
      variationVue.current = null;
      if (porteur) {
        observateur?.observe(porteur, {
          attributes: true, attributeFilter: ["data-avatar", "data-variation"],
        });
      }
      poser(lire(porteur));
    };
    document.addEventListener("pointerover", survol, { passive: true });
    return () => {
      observateur?.disconnect();
      document.removeEventListener("pointerover", survol);
    };
  }, [ranger]);

  // ── Le défilement ───────────────────────────────────────────────────────────
  /**
   * ⚠️ **Écouté à la capture, sur le document.** Un `scroll` ne remonte pas : posé sur
   * `window`, l'écouteur n'entend que le défilement de la page entière, et rate celui
   * des panneaux internes — la liste des comptes, le rail des actifs, le menu. C'est
   * précisément là qu'on défile le plus.
   *
   * ⚠️ **Passif, et sans lire la position.** Le seul fait qu'il se passe quelque chose
   * suffit à rendre le visage curieux ; savoir *de combien* on a défilé regarde le
   * regard, pas l'expression, et cela se joue dans le composant de l'avatar.
   */
  useEffect(() => {
    let minuteur = 0;
    const defiler = () => {
      // React ignore l'écriture quand la valeur ne change pas : une salve de deux cents
      // événements ne provoque donc qu'un seul rendu.
      setDefile(true);
      window.clearTimeout(minuteur);
      minuteur = window.setTimeout(() => setDefile(false), FIN_DEFILEMENT);
    };
    document.addEventListener("scroll", defiler, { passive: true, capture: true });
    return () => {
      window.clearTimeout(minuteur);
      document.removeEventListener("scroll", defiler, true);
    };
  }, []);

  // ── Le chargement, en comptant les requêtes ─────────────────────────────────
  /**
   * ⚠️ **`fetch` est enveloppé, et c'est le compromis à connaître.** L'alternative était
   * d'appeler `travaille()` à chaque endroit qui charge : une trentaine de points à
   * modifier, dont on en aurait oublié la moitié, et l'avatar n'aurait été concentré
   * que sur les pages traitées. Ici il l'est partout, sans une ligne dans les pages.
   *
   * Le compteur ne regarde que les routes de l'application : les images, les polices et
   * les appels de tiers ne sont pas du calcul, et les faire compter aurait rendu
   * l'avatar concentré en permanence — donc jamais.
   */
  useEffect(() => {
    if (typeof window.fetch !== "function") return;
    const origine = window.fetch;
    window.fetch = ((...args: Parameters<typeof fetch>) => {
      const url = String(typeof args[0] === "string" ? args[0] : (args[0] as Request)?.url ?? "");
      if (!url.includes("/api/")) return origine(...args);
      setTravaux(n => n + 1);
      let fini = false;
      const finir = () => { if (!fini) { fini = true; setTravaux(n => Math.max(0, n - 1)); } };
      const secours = setTimeout(finir, CHARGEMENT_MAX);
      return origine(...args).then(
        r => { clearTimeout(secours); finir(); return r; },
        // Un échec **réseau** est une action impossible ; un code 404 n'en est pas un,
        // il arrive en fonctionnement normal et ne doit pas faire sursauter le visage.
        e => {
          clearTimeout(secours); finir();
          jeton.current += 1;
          setPonctuel({ cle: "erreur", jeton: jeton.current });
          throw e;
        },
      );
    }) as typeof fetch;
    return () => { window.fetch = origine; };
  }, []);

  // ── L'endormissement ────────────────────────────────────────────────────────
  useEffect(() => {
    let minuteur = 0;
    let minuteurLibre = 0;
    let minuteurInvite = 0;

    /**
     * L'invite de commande, pendant le vagabondage seulement.
     *
     * ⚠️ **Elle se replanifie elle-même au lieu d'un intervalle, et il le faut.** Un
     * `setInterval` aurait continué de battre pendant le sommeil : l'invite est un
     * ponctuel, donc elle serait passée **devant** le somnolent dans l'arbitrage et aurait
     * réveillé le visage toutes les vingt secondes sans que personne n'ait rien fait. Ici
     * la chaîne s'arrête d'elle-même dès que le sommeil la coupe.
     */
    const invite = () => {
      jeton.current += 1;
      /**
       * ⚠️ **Le répertoire est nommé ailleurs, il ne se décide pas ici.** `GESTES_LIBRES`
       * dit quels gestes le visage se permet quand on l'a laissé seul — l'invite de commande
       * et le tour complet à ce jour. Les tirer au sort double l'intervalle entre deux
       * apparitions du *même* geste sans rien changer à la cadence d'ensemble : le visage
       * s'occupe, sans qu'aucun ne devienne une rengaine. En ajouter un se fait là-bas.
       */
      const geste = GESTES_LIBRES[Math.floor(Math.random() * GESTES_LIBRES.length)];
      setPonctuel({ cle: geste, jeton: jeton.current });
      minuteurInvite = window.setTimeout(invite, INVITE_MIN + Math.random() * INVITE_ETALEMENT);
    };

    const reveiller = () => {
      window.clearTimeout(minuteur);
      window.clearTimeout(minuteurLibre);
      window.clearTimeout(minuteurInvite);
      setEndormi(dormait => {
        if (dormait) {
          jeton.current += 1;
          setPonctuel({ cle: "reveil", jeton: jeton.current });
        }
        return false;
      });
      minuteurLibre = window.setTimeout(invite, AVANT_LIBRE);
      minuteur = window.setTimeout(() => {
        /* Le sommeil clôt le vagabondage : plus d'invite tant qu'on n'a pas bougé. */
        window.clearTimeout(minuteurInvite);
        setEndormi(true);
      }, AVANT_SOMMEIL);
    };
    for (const type of ["pointermove", "keydown", "pointerdown", "wheel"]) {
      window.addEventListener(type, reveiller, { passive: true });
    }
    reveiller();
    return () => {
      window.clearTimeout(minuteur);
      window.clearTimeout(minuteurLibre);
      window.clearTimeout(minuteurInvite);
      for (const type of ["pointermove", "keydown", "pointerdown", "wheel"]) {
        window.removeEventListener(type, reveiller);
      }
    };
  }, []);

  /**
   * L'arbitrage.
   *
   * ⚠️ **Un ordre de priorité explicite, sinon le dernier événement gagne.** Plusieurs
   * sources veulent parler en même temps : la souris survole une carte pendant que la
   * page charge, et une erreur tombe par-dessus. Sans règle écrite, l'affichage
   * dépendrait de l'ordre d'arrivée — donc du hasard. Le ponctuel passe devant parce
   * qu'il est bref et qu'il annonce un fait ; le survol devant le chargement parce
   * qu'il traduit une intention de l'utilisateur, plus fraîche que l'état de la machine.
   */
  const expression = useMemo<Expression>(() => {
    if (ponctuel) return ponctuel;
    /**
     * ⚠️ **Le sommeil passe devant tout le reste, sauf un ponctuel — et il était dernier.**
     * Rangé en bas, il ne gagnait presque jamais : le portefeuille rafraîchit ses cours en
     * permanence, donc `travaux` repassait au-dessus de zéro toutes les quelques secondes et
     * le dormeur rouvrait les yeux pour « se concentrer », avant de les refermer. Mesuré sur
     * la page, paupières censément closes : 47 unités d'amplitude horizontale et 61 de
     * hauteur d'œil, là où le banc — qui n'a pas de requêtes — restait à zéro. Un survol
     * laissé en plan faisait la même chose, indéfiniment.
     *
     * Le raisonnement : ces trois sources disent ce que fait *l'utilisateur* ou *la
     * machine*. Or s'endormir signifie précisément que l'utilisateur ne fait plus rien
     * depuis longtemps — et le moindre geste réel rallume `endormi` par les écouteurs
     * ci-dessus, bien avant d'arriver ici. Ce qui subsiste sous lui n'est donc que du
     * décor : une souris posée, un chargement de fond. Rien qui doive réveiller un visage.
     *
     * Le ponctuel reste au-dessus, sans quoi le « réveil » lui-même ne se jouerait pas.
     */
    if (endormi) return { cle: "somnolent", jeton: 0 };
    // La valeur pointée passe devant le survol : elle est plus précise que la zone qui
    // la contient, et c'est elle que l'utilisateur est en train de lire.
    if (pointe) return { cle: pointe, jeton: 0 };
    /**
     * ⚠️ **Le défilement passe devant le survol, et c'est délibéré.** Une zone survolée
     * est un décor immobile : on peut la survoler par hasard, simplement parce que le
     * curseur s'est arrêté là. Défiler est un geste. Rangé en dessous, il n'aurait
     * quasiment jamais rien montré — on défile presque toujours avec le curseur posé
     * quelque part, donc sur une zone qui parle déjà.
     */
    if (defile) return { cle: "curieux", jeton: 0 };
    if (survole) return { cle: survole, jeton: 0 };
    /* ⚠️ Le chargement ne s'exprime plus : « focus » a été retiré du répertoire. Le
       compteur reste — il sert encore à `travaille()` — mais il ne pilote plus de mimique.
       Rien ne remplace : un calcul en cours n'est pas une émotion, et les états qui restent
       disent tous quelque chose de la valeur, pas de la machine. */
    return { cle: "neutre", jeton: 0 };
  /* `travaux` a quitté cette liste avec l'état « focus » : le compteur existe toujours —
     `travaille()` s'en sert — mais il ne décide plus d'aucune mimique. */
  }, [ponctuel, pointe, defile, survole, endormi]);

  /**
   * Un ponctuel se retire de lui-même une fois joué.
   *
   * Sa durée est celle du répertoire, plus une marge : sans elle, l'état de fond
   * reprendrait la main pendant que la mimique s'achève encore.
   */
  useEffect(() => {
    if (!ponctuel) return;
    const duree = (etatParCle(ponctuel.cle).duree ?? 1000) + 250;
    const t = window.setTimeout(() => setPonctuel(null), duree);
    return () => window.clearTimeout(t);
  }, [ponctuel]);

  const valeur = useMemo(
    () => ({ expression, exprimer, pointer, travaille }),
    [expression, exprimer, pointer, travaille]);

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}
