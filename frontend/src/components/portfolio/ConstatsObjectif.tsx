"use client";
import Cadre from "@/components/ui/Cadre";
import { observations, type Objectif } from "@/lib/objectifs";
import { FONT } from "@/lib/typography";

/**
 * Des constats chiffrés sur l'objectif projeté.
 *
 * ⚠️ **Ce panneau occupe l'emplacement des « Recommandations IA » de la maquette**, qui
 * proposait « augmenter votre investissement mensuel à 1 000 € », « réduire l'exposition
 * aux actions à 70 % », « activer le réinvestissement automatique ». C'est du conseil en
 * investissement personnalisé, que ce logiciel ne produit pas. Ce qui suit est
 * arithmétique : des soustractions, des divisions et des comparaisons de dates, dont
 * chacune se recompte à la main. L'épargnant en tire ses conclusions ; le logiciel ne les
 * tire pas pour lui.
 *
 * ⚠️ **Le titre nomme la fonction du panneau, pas une parole du logiciel.** « Aide à la
 * décision » est vrai : les huit lignes servent à trancher — combien il manque, à quelle date
 * on arrive, ce que changerait un autre rythme. « Recommandations » serait faux, parce
 * qu'aucune ligne ne dit quoi faire, et incohérent avec la mention du bas. « Insight IA »
 * serait faux autrement : rien ici n'est produit par un modèle.
 *
 * L'habillage — dégradé continu, titre blanc, pictogramme d'étincelle — vient d'une référence
 * fournie. Le pictogramme signale un encart à lire, pas une intelligence qui aurait parlé.
 *
 * Séparé de la progression globale parce que la maquette en fait deux cartes distinctes,
 * et parce que les deux ne parlent pas de la même chose : l'une agrège tous les
 * objectifs, l'autre détaille celui qu'on projette.
 */

/**
 * Le dégradé du panneau, et pourquoi il est plus sombre que sa référence.
 *
 * ⚠️ **Les couleurs ont été choisies par calcul de contraste, non à l'œil.** La référence est
 * un dégradé pastel — bleu clair, lavande, rose, pêche — qui porte trois mots de titre. Aux
 * mêmes teintes, du texte blanc donne un contraste de **1,56 à 2,11 pour 1**, quand la norme
 * en réclame 4,5 pour du petit texte. Acceptable pour une bannière de trois mots, intenable
 * pour cinq lignes de chiffres que l'épargnant doit pouvoir recompter.
 *
 * Le balayage de teintes est donc conservé — bleu, violet, magenta, rose, chaud — et
 * assombri jusqu'à ce que le pire arrêt tienne la norme. Mesuré : **5,63 pour 1** au plus
 * juste pour le corps du texte, 6,48 pour le titre.
 */
const DEGRADE = "linear-gradient(101deg, "
  + "#233A93 0%, #4A2C9E 27%, #7A2472 55%, #94304C 80%, #8F4419 100%)";

/** L'étincelle du titre : un encart à lire, pas une intelligence qui aurait parlé. */
const ETINCELLE = "M16.999 21.744c-1.24-.066-2.862-.835-4.963-2.289l-.039-.026-.036.026c-2.101 "
  + "1.455-3.723 2.224-4.964 2.29l-.174.005c-2.688 0-3.03-2.566-1.681-7.041l.053-.173-.098-.073c"
  + "-5.926-4.508-4.938-7.628 2.5-7.84l.197-.005.113-.317c1.158-3.236 2.374-4.942 3.94-5.046L12 "
  + "1.25c1.638 0 2.894 1.71 4.093 5.051l.111.317.2.005c7.437.212 8.426 3.332 2.498 7.84l-.1.072"
  + ".054.173c1.321 4.386 1.018 6.937-1.523 7.037l-.159.003z";

export default function ConstatsObjectif({
  objectif, valeurPortefeuille, medianeProjection, tousLesObjectifs,
}: {
  objectif: Objectif | null;
  valeurPortefeuille: number | null;
  /**
   * Les autres objectifs du portefeuille.
   *
   * ⚠️ Nécessaires à la seule interprétation qui ne tient pas dans un objectif : un plafond
   * de versements qui saturerait avant que les objectifs qu'il finance n'aboutissent. Ce
   * fait naît de la rencontre de deux cartes, donc aucune ne peut le porter seule.
   */
  tousLesObjectifs?: Objectif[];
  /**
   * La médiane que le panneau de projection affiche.
   *
   * ⚠️ Transmise pour que les deux panneaux citent le **même** nombre. Sans elle, les
   * constats retombent sur la capitalisation déterministe du serveur, et l'écran montre
   * 373 261 € d'un côté et 362 986 € de l'autre pour la même grandeur.
   */
  medianeProjection?: number | null;
}) {
  const constats = objectif
    ? observations(objectif, valeurPortefeuille, medianeProjection, tousLesObjectifs) : [];

  return (
    // ⚠️ **Le cadre commun de la page, et non une surface à part.** Le dégradé remplace le
    // seul fond de la carte intérieure : l'anneau extérieur, son voile sombre, le liseré gris
    // et les deux rayons concentriques restent ceux des panneaux voisins. C'est `Cadre` qui
    // trie les clés de style — `background` et `padding` habillent le contenu, `flexShrink`
    // place le panneau — donc rien n'est à recopier ici.
    //
    // ⚠️ Typographie resserrée plutôt que contenu caché. La carte laissait 141 pixels
    // pour 207 de constats, donc deux des cinq derrière un défilement interne — ce qui
    // est le défaut qu'on cherche à supprimer, en plus petit.
    <Cadre style={{
      flexShrink: 0,
      display: "flex", flexDirection: "column", gap: 7, minHeight: 0,
      background: DEGRADE,
      padding: "13px 15px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"
          aria-hidden="true" style={{ color: "rgba(255,255,255,0.92)", flexShrink: 0,
            display: "block" }}>
          <path d={ETINCELLE} />
        </svg>
        <span style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 700,
          color: "rgba(255,255,255,0.96)", letterSpacing: "-0.01em" }}>
          Aide à la décision
        </span>
        {objectif && (
          <span style={{ fontFamily: FONT, fontSize: 9.5,
            color: "rgba(255,255,255,0.66)" }}>
            {objectif.nom}
          </span>
        )}
      </div>

      {constats.length === 0 ? (
        <p style={{ margin: 0, fontFamily: FONT, fontSize: 10.5, lineHeight: 1.55,
          color: "rgba(255,255,255,0.80)" }}>
          {objectif
            ? "Rien à constater sans échéance ni hypothèse de rendement : ce panneau ne "
              + "calcule que ce que vos paramètres permettent."
            : "Choisissez un objectif pour voir ce que vos chiffres impliquent."}
        </p>
      ) : (
        <>
          {constats.map(t => (
            <div key={t} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
              <span style={{ width: 3, height: 3, borderRadius: "50%", flexShrink: 0,
                background: "rgba(255,255,255,0.55)", marginTop: 5 }} />
              {/* 0,88 d'alpha et non 0,78 : c'est le seuil sous lequel l'arrêt chaud du
                  dégradé, le plus clair des cinq, tombe sous les 4,5 pour 1 exigés. */}
              <span style={{ fontFamily: FONT, fontSize: 9.5, lineHeight: 1.5,
                color: "rgba(255,255,255,0.88)" }}>{t}</span>
            </div>
          ))}
          {/* ⚠️ **Une invitation plutôt qu'une dénégation.** La formule précédente — « ce sont
              des calculs, pas des recommandations » — disait le vrai mais en creux, et sous un
              titre parlant de décision elle sonnait comme un dégagement de responsabilité. La
              même chose se dit par l'endroit : chaque ligne se recompte, et la décision reste
              à l'épargnant. C'est aussi ce qui rend la carte cohérente avec son titre. */}
          <span style={{ marginTop: 1, fontFamily: FONT, fontSize: 8.5, lineHeight: 1.45,
            color: "rgba(255,255,255,0.80)" }}>
            Chaque ligne est un calcul que vous pouvez refaire. Le choix reste le vôtre.
          </span>
        </>
      )}
    </Cadre>
  );
}
