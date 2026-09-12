"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FONT, NUM } from "@/lib/typography";
import { JETONS, RAYONS } from "@/lib/palette";
import { API_URL } from "@/lib/api";
import { recuperer } from "@/lib/requete";

/**
 * Le bandeau d'actifs qui défile : symbole, cours, variation du jour.
 *
 * ⚠️ **La boucle est en CSS, pas en `requestAnimationFrame`, et les deux défauts de la
 * version précédente disent pourquoi.**
 *
 * 1. Elle avançait de `0,5` pixel **par image**, et non par unité de temps : le bandeau
 *    défilait donc deux fois plus vite sur un écran à 120 Hz que sur un 60 Hz, et ralentissait
 *    dès que l'onglet se chargeait. Une animation CSS est calée sur le temps, jamais sur la
 *    cadence de rafraîchissement.
 * 2. Le `Math.round` de la position quantifiait le déplacement : à un demi-pixel par image,
 *    la piste ne bougeait qu'une image sur deux, ce qui se voit comme un tremblement.
 *
 * ⚠️ **Et la couture sautait, pour une raison qui ne se devine pas.** L'ancien code
 * remettait la piste à zéro après `scrollWidth / 2`, en tenant la liste dupliquée dans un
 * `flex` à `gap: 80px`. Or la moitié de la largeur d'une piste de `2N` éléments séparés par
 * `2N-1` écarts ne vaut **pas** la largeur d'une copie : il manque un écart, soit un saut de
 * quarante pixels à chaque tour. Ici chaque élément porte son propre écart en
 * `padding-right` : les deux moitiés sont exactement égales, donc `translateX(-50%)` retombe
 * au pixel sur une image identique. Il n'y a plus de couture à cacher.
 *
 * ⚠️ **La durée est mesurée une fois, la vitesse est donc constante quelle que soit la
 * liste.** Et si la mesure est fausse, le seul dégât est une vitesse un peu différente —
 * jamais un saut. C'était l'inverse avant : la mesure, prise après un `setTimeout` de 200 ms,
 * décidait de la couture.
 */

type Actif = { ticker: string; symbole: string; cours: number; variation: number };

/** Le côté de la vignette, en pixels. */
const COTE_LOGO = 15;

/**
 * L'écart entre deux actifs. Porté par chaque élément — voir l'avertissement ci-dessus.
 *
 * ⚠️ **Descendu de 56 à 40 quand la pastille de survol est arrivée.** Celle-ci ajoute son
 * propre rembourrage de 10 de chaque côté : garder 56 aurait éloigné les actifs de vingt
 * pixels de plus sans qu'on l'ait demandé.
 */
const ECART = 40;

/**
 * La hauteur du bandeau, liseré compris.
 *
 * ⚠️ **Imposée au conteneur, et non déduite de son contenu.** Elle valait d'abord la somme
 * des rembourrages — 9 + 14 + 9 + 1 = 33 — et le bandeau en mesurait 36,25 : la hauteur de
 * ligne d'un corps de 11,5 px ne fait pas 14. La mention légale de la page d'accès, posée à
 * 33 du bas, passait donc 3 pixels sous le liseré. Une constante qui *décrit* une hauteur
 * finit toujours par la décrire mal ; celle-ci la **décide**, et le contenu se centre dedans.
 *
 * ⚠️ Exportée parce qu'une page qui monte le bandeau en position fixée doit lui réserver sa
 * place — voir `paddingBottom` de la page d'accès.
 */
export const HAUTEUR_BANDEAU = 36;

/** Pixels par seconde. Assez lent pour qu'on puisse lire un symbole au passage. */
const VITESSE = 42;

/**
 * ⚠️ **Trente secondes, la cadence du serveur.** L'instantané est recalculé au même rythme :
 * demander plus souvent ne rendrait que la même réponse — voir `services/bandeau.py`.
 */
const CADENCE_MS = 30_000;

const STYLE = `
  @keyframes nv-bandeau-defile {
    from { transform: translateX(0); }
    to   { transform: translateX(-50%); }
  }
  .nv-bandeau-piste {
    display: flex;
    width: max-content;
    animation: nv-bandeau-defile var(--nv-duree, 40s) linear infinite;
  }
  /* ⚠️ Suspendu au survol : un cours qu'on veut lire ne doit pas fuir sous le curseur. */
  .nv-bandeau:hover .nv-bandeau-piste { animation-play-state: paused; }
  /* ⚠️ Un bandeau qui défile est exactement ce que ce réglage demande d'arrêter. La liste
     reste lisible, simplement immobile. */
  @media (prefers-reduced-motion: reduce) {
    .nv-bandeau-piste { animation: none; }
  }
  /* ⚠️ **Le survol doit se voir sur l'actif visé, pas sur tout le bandeau.** La piste
     s'arrête déjà sous le curseur ; sans cette marque, rien ne dit *lequel* des dix on
     s'apprête à ouvrir. Le symbole et le cours montent d'un cran, la variation garde sa
     couleur — c'est elle qui porte le sens. */
  .nv-bandeau-actif:hover .nv-bandeau-symbole,
  .nv-bandeau-actif:hover .nv-bandeau-cours { color: var(--nv-sur-fond); }
  /* ⚠️ **La pastille est le seul repère de surface qui reste.** Le bandeau n'a plus ni fond
     ni liseré : sans elle, survoler un actif ne changeait que la teinte de deux mots, ce qui
     se remarque à peine sur dix lignes qui défilent. Elle ne s'allume qu'au survol, donc elle
     ne rend pas le bandeau plus lourd au repos. */
  .nv-bandeau-fond {
    background: transparent;
    transition: background 140ms ease;
  }
  .nv-bandeau-actif:hover .nv-bandeau-fond { background: var(--nv-bord-fort); }
  /* Le focus clavier montre la même pastille, plus son anneau : sans elle, l'anneau
     entourerait du vide au-dessus et en dessous du texte. */
  .nv-bandeau-actif:focus-visible { outline: none; }
  .nv-bandeau-actif:focus-visible .nv-bandeau-fond {
    background: var(--nv-bord-fort);
    box-shadow: 0 0 0 1px var(--nv-texte-attenue);
  }
`;

/**
 * Les logos, teintés de l'encre du symbole.
 *
 * ⚠️ **Ce sont les PNG détourés de `public/logos/`, posés en masque et non en image.** Le
 * masque ne retient que l'alpha du fichier : le dessin devient une silhouette de la couleur
 * qu'on lui donne, ici celle du symbole. C'est le même procédé que le logo Novac de
 * l'enseigne. Mesuré sur les dix symboles du bandeau avant de le retenir : opacité de 26 %
 * (Tesla) à 91 % (Microsoft, dont la marque *est* quatre carrés pleins), et les dix rendent
 * une silhouette lisible. Un logo posé sur une plaque opaque, lui, rendrait un rectangle —
 * c'est le cas à vérifier avant d'ajouter un symbole.
 *
 * ⚠️ **Chaque fichier est sondé, et la vignette n'existe que s'il a répondu.** Un
 * `mask-image` qui pointe vers une adresse absente ne se plaint pas : il peint du vide, et
 * laisse un trou de quinze pixels devant le symbole. Le sondage — un `decode()` par ticker,
 * sur des images que le navigateur garde ensuite en cache — transforme ce trou silencieux en
 * simple absence de vignette.
 */
async function sonderLesLogos(actifs: Actif[]): Promise<Set<string>> {
  const trouves = await Promise.all(actifs.map(async a => {
    try {
      const img = new Image();
      img.src = `/logos/${a.ticker}.png`;
      await img.decode();
      return a.ticker;
    } catch {
      return null;
    }
  }));
  return new Set(trouves.filter((t): t is string => t !== null));
}

export default function BandeauActifs({ cliquable = false }: { cliquable?: boolean }) {
  const [actifs, setActifs] = useState<Actif[]>([]);
  const [logos, setLogos] = useState<Set<string> | null>(null);
  const piste = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivant = true;
    const charger = async () => {
      try {
        const r = await recuperer(`${API_URL}/api/v1/bandeau`);
        if (!r.ok) throw new Error(`${r.status}`);
        const d = (await r.json()) as { actifs?: Actif[] };
        if (vivant && Array.isArray(d.actifs)) setActifs(d.actifs);
      } catch (e) {
        /* ⚠️ **L'échec se dit, même s'il ne s'affiche pas.** Le bandeau disparaît quand la
           liste est vide, et c'est le bon comportement — un bandeau à moitié peint vaut
           moins que pas de bandeau. Mais une panne muette est précisément ce qui a laissé
           trois composants appeler une adresse morte pendant des semaines. */
        console.warn("Bandeau d'actifs indisponible :", e);
      }
    };
    charger();
    const iv = setInterval(charger, CADENCE_MS);
    return () => { vivant = false; clearInterval(iv); };
  }, []);

  /**
   * ⚠️ **Le bandeau attend le sondage des logos avant de se peindre.** Les afficher dès les
   * cours, puis glisser les vignettes ensuite, décalait toutes les largeurs une fois la piste
   * déjà mesurée : la vitesse devenait fausse et le texte sursautait. Cent millisecondes de
   * plus sur un élément décoratif valent mieux que ça.
   */
  useEffect(() => {
    if (actifs.length === 0) return;
    let vivant = true;
    sonderLesLogos(actifs).then(s => { if (vivant) setLogos(s); });
    return () => { vivant = false; };
  }, [actifs]);

  /**
   * ⚠️ **Mesurée sur la piste entière, puis divisée.** Prendre la largeur d'une copie
   * demanderait de la mesurer à part ; `scrollWidth / 2` est exact ici, justement parce que
   * les deux moitiés sont égales par construction.
   */
  useEffect(() => {
    const el = piste.current;
    if (!el || actifs.length === 0 || logos === null) return;
    const poser = () => {
      const moitie = el.scrollWidth / 2;
      if (moitie > 0) el.style.setProperty("--nv-duree", `${moitie / VITESSE}s`);
    };
    poser();
    /* La police peut arriver après le premier rendu et changer les largeurs. */
    if (document.fonts?.ready) document.fonts.ready.then(poser).catch(() => {});
  }, [actifs, logos]);

  if (actifs.length === 0 || logos === null) return null;

  return (
    <div className="nv-bandeau"
      style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 4,
        overflow: "hidden",
        fontFamily: FONT,
        /* ⚠️ **Ni fond ni liseré : le dégradé de la page suffit.** Le bandeau portait une
           surface opaque à 72 % et un flou d'arrière-plan — donc une barre posée *sur* la
           page, avec sa propre teinte et son propre bord. Retiré à la demande : le bas du
           `--nv-fond-degrade` est déjà le plus sombre de la page, les cours s'y lisent sans
           qu'on ait besoin de les isoler. Ce qui reste du bandeau est son contenu. */
        height: HAUTEUR_BANDEAU,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        /* ⚠️ Les deux bords s'éteignent : un actif qui apparaît net au ras du cadre se lit
           comme un défaut de peinture. Le site éteint déjà sa trame de points aux bords,
           c'est le même geste.

           ⚠️ **`min(72px, 10%)` et non 72 px fixes.** Sur un téléphone de 375 px, deux fondus
           de 72 mangeaient 38 % de la largeur : il ne restait qu'un actif et demi lisible au
           centre. Le fondu suit donc la largeur, et se borne à 72 px sur grand écran, où un
           fondu proportionnel serait devenu une bande grise. */
        maskImage: "linear-gradient(to right, transparent 0, #000 min(72px, 10%), #000 calc(100% - min(72px, 10%)), transparent 100%)",
        WebkitMaskImage: "linear-gradient(to right, transparent 0, #000 min(72px, 10%), #000 calc(100% - min(72px, 10%)), transparent 100%)",
      }}>
      <style>{STYLE}</style>
      <div ref={piste} className="nv-bandeau-piste"
        /* Décoratif tant qu'on ne peut rien en faire ; dès qu'il porte des liens, c'est la
           copie en double qui est masquée, pas la piste entière — voir plus bas. */
        aria-hidden={cliquable ? undefined : "true"}>
        {[0, 1].map(copie => actifs.map(a => {
          const contenu = (
            <span className="nv-bandeau-fond"
              style={{ display: "inline-flex", alignItems: "center", gap: 8,
                       padding: "5px 10px", borderRadius: RAYONS.plein }}>
              {logos.has(a.ticker) && (
                <span aria-hidden="true"
                  style={{
                    width: COTE_LOGO, height: COTE_LOGO, flexShrink: 0, display: "block",
                    /* La même encre que le symbole : la vignette est un mot de plus, pas une
                       image posée à côté. */
                    background: JETONS.surFondFaible,
                    maskImage: `url(/logos/${a.ticker}.png)`,
                    WebkitMaskImage: `url(/logos/${a.ticker}.png)`,
                    maskSize: "contain", WebkitMaskSize: "contain",
                    maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat",
                    maskPosition: "center", WebkitMaskPosition: "center",
                  }} />
              )}
              <span className="nv-bandeau-symbole"
                style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
                         color: JETONS.surFondFaible }}>
                {a.symbole}
              </span>
              <span className="nv-bandeau-cours"
                style={{ ...NUM, fontSize: 11.5, color: JETONS.surFondAttenue }}>
                {a.cours.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span style={{ ...NUM, fontSize: 11.5, fontWeight: 500,
                             color: a.variation >= 0 ? JETONS.positif : JETONS.negatif }}>
                {a.variation >= 0 ? "+" : ""}{a.variation.toFixed(2)} %
              </span>
            </span>
          );

          const cle = `${copie}-${a.ticker}`;
          /* ⚠️ L'écart reste **dehors** et la pastille dedans : posés sur le même élément,
             les 40 px auraient été peints avec le fond du survol, et la pastille aurait
             débordé de quarante pixels à droite de l'actif qu'elle désigne. */
          const forme: React.CSSProperties = {
            display: "inline-flex", alignItems: "center",
            paddingRight: ECART, whiteSpace: "nowrap", textDecoration: "none",
          };

          if (!cliquable) return <span key={cle} style={forme}>{contenu}</span>;

          /**
           * ⚠️ **La copie en double ne doit exister que pour l'œil.** Elle n'est là que pour
           * que la boucle n'ait pas de couture : la laisser dans l'ordre de tabulation
           * donnerait vingt arrêts au clavier pour dix actifs, et un lecteur d'écran
           * annoncerait chaque cours deux fois.
           */
          const double = copie === 1;
          return (
            <Link key={cle} href={`/chart?ticker=${encodeURIComponent(a.ticker)}`}
              className="nv-bandeau-actif" style={forme}
              aria-hidden={double ? "true" : undefined} tabIndex={double ? -1 : undefined}
              aria-label={`${a.symbole}, ${a.cours} euros, ${a.variation >= 0 ? "en hausse" : "en baisse"} de ${Math.abs(a.variation).toFixed(2)} pour cent — voir le graphique`}>
              {contenu}
            </Link>
          );
        }))}
      </div>
    </div>
  );
}
