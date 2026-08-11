"""
Les objectifs d'épargne : ce qu'ils valent aujourd'hui, et ce qu'ils exigent.

⚠️ **Ce module remplace trois objectifs inventés.** L'onglet affichait « Retraite
2035 », « Achat immobilier » et « Indépendance financière » codés en dur, avec des
cibles choisies au hasard et un montant courant calculé en multipliant la valeur du
portefeuille par 0,42 et 0,28 — des coefficients qui ne désignaient rien. Aucun de ces
objectifs n'appartenait à personne : rien n'était enregistré.

⚠️ **Aucun conseil n'est produit ici.** Ce fichier calcule où l'on en est et ce qu'il
faudrait pour arriver ; il ne dit jamais quoi faire. La différence est nette : « à
800 € par mois la cible est atteinte en 2044, deux ans après l'échéance » est une
division, « augmentez à 1 000 € » est une recommandation d'investissement.

⚠️ **Les hypothèses ne sont pas des mesures, et le disent.** Un taux de rendement
attendu et une inflation sont des choix de l'épargnant, pas des observations. Ils sont
donc portés par l'objectif, sans valeur par défaut qui les ferait passer pour acquis :
sans eux, la projection ne rend rien plutôt qu'un chiffre d'apparence sûre.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal

#: Les sortes d'objectifs. Elles ne partagent pas le même calcul, et c'est la raison de
#: ce type. Un capital se compare à un montant ; un revenu mensuel se compare à un
#: capital qu'il faut d'abord déduire d'un taux de retrait. Les traiter ensemble aurait
#: comparé des euros à des euros par mois.
#:
#: ⚠️ **`plafond_versements` est à part, et c'est tout son intérêt.** Les quatre premiers
#: se mesurent sur ce que **vaut** le portefeuille ; celui-là sur ce qu'on y a **versé**.
#: La différence n'est pas un détail de présentation : le plafond d'un PEA — 150 000 € —
#: porte sur le cumul des versements et **les gains ne le consomment pas**. Un PEA qui
#: vaut 150 000 € après avoir reçu 90 000 € de versements a encore 60 000 € de capacité.
#: Mesurer cet objectif sur la valeur du portefeuille l'annoncerait atteint avec deux
#: tiers du chemin restant.
Genre = Literal[
    "capital", "capital_age", "achat", "revenu_mensuel", "plafond_versements",
]

GENRES: tuple[Genre, ...] = (
    "capital", "capital_age", "achat", "revenu_mensuel", "plafond_versements",
)

#: Les objectifs dont l'avancement se mesure sur les versements et non sur le patrimoine.
#:
#: ⚠️ Un ensemble et non un test d'égalité, pour que l'ajout d'un genre du même type — un
#: plafond d'assurance-vie, un plafond annuel — n'oblige pas à retrouver toutes les
#: comparaisons dispersées dans le code.
GENRES_SUR_VERSEMENTS: frozenset[str] = frozenset({"plafond_versements"})


def se_mesure_sur_les_versements(genre: str) -> bool:
    """Vrai quand l'avancement compte les versements, non la valeur du portefeuille."""
    return genre in GENRES_SUR_VERSEMENTS


#: Le plafond de versements d'un PEA, en euros.
#:
#: ⚠️ **Un plafond de versements cumulés, pas un plafond de valeur.** Les plus-values et
#: les dividendes réinvestis ne l'entament pas : un PEA peut valoir bien davantage sans que
#: la capacité de versement soit épuisée. C'est exactement la raison d'être de ce genre
#: d'objectif.
#:
#: ⚠️ **Proposé, jamais imposé.** Ce logiciel ne sait pas quelle enveloppe est ce
#: portefeuille — l'application n'enregistre pas le type de compte — et il n'est pas un
#: conseiller fiscal. Le montant reste saisissable, et l'écran nomme ce qu'il propose.
PLAFOND_PEA = 150_000.0

#: Le plafond du PEA-Jeunes, réservé aux majeurs rattachés au foyer fiscal de leurs parents.
PLAFOND_PEA_JEUNES = 20_000.0

#: Les plafonds proposés d'un clic, avec ce qu'ils désignent.
PLAFONDS_CONNUS: tuple[tuple[str, float], ...] = (
    ("PEA", PLAFOND_PEA),
    ("PEA-Jeunes", PLAFOND_PEA_JEUNES),
)

#: Le taux de retrait qui convertit un capital en revenu mensuel, en pourcentage par an.
#:
#: ⚠️ **Une convention, pas une mesure.** Quatre pour cent vient de l'étude Trinity de
#: 1998, menée sur le marché américain du vingtième siècle avec un portefeuille moitié
#: actions moitié obligations et un horizon de trente ans. Ce n'est ni une loi ni une
#: garantie, et les travaux postérieurs la discutent. Elle est ici pré-remplie et
#: modifiable, jamais imposée en silence : c'est l'épargnant qui décide du taux auquel
#: il accepte de vivre de son capital.
TAUX_RETRAIT_USUEL = 4.0

#: Sous ce nombre de mois, une projection n'a plus de sens à afficher.
HORIZON_MINIMAL_MOIS = 1


@dataclass(frozen=True)
class Progression:
    """Où en est un objectif, en euros et en pourcentage."""

    #: Le montant déjà constitué pour cet objectif, en euros.
    actuel: float
    #: Le capital à atteindre, en euros — y compris pour un objectif de revenu.
    requis: float
    #: L'avancement, borné à cent : au-delà, l'objectif est atteint.
    part: float
    #: Vrai quand le requis est déjà couvert.
    atteint: bool


def capital_requis(
    genre: Genre, cible: float, taux_retrait: float | None = None,
) -> float | None:
    """
    Le capital qu'exige un objectif, quelle que soit la façon dont il est exprimé.

    ⚠️ Un objectif de **revenu** ne se compare pas directement à un patrimoine : cinq
    mille euros par mois n'est pas un montant, c'est un flux. Le convertir demande un
    taux de retrait — le capital qui, ponctionné à ce taux annuel, rend ce revenu.
    Cinq mille euros par mois à quatre pour cent l'an réclament un million cinq cent
    mille euros. Comparer 5 000 à un portefeuille de 183 000 aurait affiché un objectif
    largement dépassé alors qu'il manque plus d'un million.

    Rend `None` quand la conversion est impossible faute de taux : un objectif sans
    capital connu vaut mieux qu'un capital faux.
    """
    if cible <= 0:
        return None
    if genre != "revenu_mensuel":
        return float(cible)
    taux = TAUX_RETRAIT_USUEL if taux_retrait is None else taux_retrait
    if taux <= 0:
        return None
    return cible * 12.0 / (taux / 100.0)


def progression(
    genre: Genre, cible: float, valeur_portefeuille: float,
    part_affectee: float | None = None, taux_retrait: float | None = None,
) -> Progression | None:
    """
    L'avancement d'un objectif, depuis la valeur **réelle** du portefeuille.

    ⚠️ `part_affectee` est la fraction du portefeuille que l'épargnant destine à cet
    objectif, en pourcentage. Cent par défaut, ce qui est le cas juste d'un objectif
    unique : « mon portefeuille contre ma cible ». Avec plusieurs objectifs, c'est
    l'épargnant qui répartit — le logiciel ne devine pas qu'un tiers du PEA est pour la
    retraite et deux tiers pour l'appartement.

    ⚠️ La somme des parts n'est **pas** normalisée ici. Si elle dépasse cent, l'écran
    doit le dire : compter deux fois le même euro pour deux objectifs est une erreur de
    l'épargnant, et la corriger en douce la lui cacherait.
    """
    requis = capital_requis(genre, cible, taux_retrait)
    if requis is None:
        return None
    part = 100.0 if part_affectee is None else part_affectee
    actuel = max(0.0, valeur_portefeuille) * part / 100.0
    avancement = min(100.0, actuel / requis * 100.0) if requis > 0 else 0.0
    return Progression(actuel=actuel, requis=requis, part=avancement,
                       atteint=actuel >= requis)


def echeance_en_mois(
    echeance_annee: int | None, aujourdhui: date | None = None,
) -> int | None:
    """
    Les mois qui restent jusqu'à la fin de l'année d'échéance.

    ⚠️ La **fin** de l'année et non son début : « atteindre 300 000 € en 2031 » laisse
    jusqu'à décembre 2031. Compter jusqu'au 1er janvier aurait retiré onze mois à chaque
    objectif, et d'autant durci toutes les projections.
    """
    if not echeance_annee:
        return None
    ref = aujourdhui or date.today()
    mois = (echeance_annee - ref.year) * 12 + (12 - ref.month)
    return mois if mois >= HORIZON_MINIMAL_MOIS else None


def annee_de_l_age(age_cible: int | None, annee_naissance: int | None) -> int | None:
    """
    L'année civile où l'épargnant atteindra l'âge visé.

    ⚠️ « Retraite à 60 ans » n'est datable que si l'on sait quand la personne est née.
    Sans année de naissance, cette sorte d'objectif reste **sans échéance** au lieu d'en
    recevoir une supposée : deviner un âge de départ aurait daté une retraite au hasard.
    """
    if not age_cible or not annee_naissance:
        return None
    return annee_naissance + age_cible


def valeur_projetee(
    depart: float, versement_mensuel: float, taux_annuel: float, mois: int,
) -> float:
    """
    La valeur d'un capital augmenté de versements réguliers, à intérêts composés.

    Capitalisation **mensuelle** au taux équivalent, et versement en fin de mois. Le
    taux mensuel est la racine douzième de l'annuel, non l'annuel divisé par douze :
    diviser surestime le résultat, d'autant plus que l'horizon est long — sur vingt ans
    à sept pour cent, l'écart dépasse deux pour cent du capital final.
    """
    if mois <= 0:
        return max(0.0, depart)
    r = (1.0 + taux_annuel / 100.0) ** (1.0 / 12.0) - 1.0
    valeur = max(0.0, depart)
    for _ in range(mois):
        valeur = valeur * (1.0 + r) + max(0.0, versement_mensuel)
    return valeur


def mois_pour_atteindre(
    depart: float, versement_mensuel: float, taux_annuel: float, requis: float,
    plafond_mois: int = 12 * 80,
) -> int | None:
    """
    Combien de mois il faut pour atteindre un capital, ou `None` si jamais.

    ⚠️ `None` est une réponse **fréquente et utile** : sans versement et à taux nul, ou
    avec un objectif hors de portée, aucune durée ne convient. Rendre le plafond aurait
    fait lire « quatre-vingts ans » comme une estimation, alors que c'est un abandon.
    """
    if requis <= 0:
        return 0
    if depart >= requis:
        return 0
    r = (1.0 + taux_annuel / 100.0) ** (1.0 / 12.0) - 1.0
    valeur, versement = max(0.0, depart), max(0.0, versement_mensuel)
    if versement <= 0 and r <= 0:
        return None
    for m in range(1, plafond_mois + 1):
        valeur = valeur * (1.0 + r) + versement
        if valeur >= requis:
            return m
    return None


def avancement_verse(cible: float, verse: float) -> Progression | None:
    """
    L'avancement d'un objectif de **versements**, qui ignore la performance.

    ⚠️ **Aucune valeur de portefeuille n'entre ici, et c'est la raison de cette fonction.**
    `progression` part du patrimoine, ce qui est juste pour un objectif de capital et faux
    pour un plafond de versements : les gains ne consomment pas la capacité de versement
    d'un PEA. Sur un portefeuille valant 5 304 € pour 4 959 € versés, l'écart est de sept
    pour cent ; sur un PEA de vingt ans, la plus-value peut dépasser les versements et
    l'avancement afficherait le double du vrai.

    ⚠️ **`part_affectee` n'a pas de sens ici et n'est pas acceptée.** Répartir un
    patrimoine entre plusieurs objectifs se comprend ; répartir un versement déjà effectué
    entre deux plafonds ne veut rien dire — l'euro versé sur le PEA l'a été en entier.
    """
    if cible <= 0:
        return None
    verse = max(0.0, verse)
    return Progression(
        actuel=verse, requis=float(cible),
        part=min(100.0, verse / cible * 100.0),
        atteint=verse >= cible,
    )


def mois_pour_verser(
    cible: float, verse: float, versement_mensuel: float | None,
) -> int | None:
    """
    Combien de mois de versements il reste avant d'atteindre le plafond.

    ⚠️ **Une division, sans rendement ni capitalisation.** C'est tout l'objet de ce genre
    d'objectif : la question « quand aurai-je versé 150 000 € ? » ne dépend d'aucune
    hypothèse de marché. Y glisser un taux de rendement — même nul — laisserait croire que
    la performance rapproche du plafond, alors qu'elle ne l'entame pas.

    ⚠️ Arrondi **au mois supérieur** : à 800 € par mois, il reste 100 € à verser au
    quatre-vingt-dix-neuvième mois, donc il en faut cent. Arrondir à l'inférieur
    annoncerait le plafond atteint un mois avant qu'il ne le soit.
    """
    reste = float(cible) - max(0.0, verse)
    if reste <= 0:
        return 0
    if not versement_mensuel or versement_mensuel <= 0:
        # ⚠️ `None` et non un plafond de mois : sans versement, aucune durée ne convient.
        # « 960 mois » se lirait comme une estimation là où c'est un abandon.
        return None
    from math import ceil
    return int(ceil(reste / versement_mensuel))


def verse_projete(verse: float, versement_mensuel: float | None, mois: int) -> float:
    """
    Le cumul des versements après `mois` mois, au rythme donné.

    ⚠️ Une addition, non une capitalisation : un versement de 800 € reste 800 € versés,
    quelle que soit la performance qu'il produit ensuite. C'est la grandeur que le plafond
    d'un PEA mesure.
    """
    if mois <= 0:
        return max(0.0, verse)
    return max(0.0, verse) + max(0.0, versement_mensuel or 0.0) * mois


def versement_requis(
    depart: float, taux_annuel: float, mois: int, requis: float,
) -> float | None:
    """
    Le versement mensuel qu'il faudrait pour tenir l'échéance.

    ⚠️ **C'est l'inverse de `valeur_projetee`, et c'est le chiffre que l'écran n'avait pas.**
    Tout le panneau répondait « à votre rythme, voilà quand vous y serez » ; personne ne
    répondait « pour y être à la date voulue, voilà le rythme ». La seconde question est celle
    qu'on se pose devant une échéance, et sa réponse ne se lit nulle part ailleurs.

    ⚠️ **Un constat, pas une consigne.** « Tenir 2044 demanderait 2 340 € par mois » énonce ce
    que l'arithmétique exige ; « versez 2 340 € » serait une recommandation d'investissement.
    L'écran garde la première forme.

    Forme fermée, versement en fin de mois pour rester cohérent avec `valeur_projetee` :

        requis = depart·(1+r)ⁿ + v·((1+r)ⁿ − 1)/r

    Rend `0` quand le capital de départ suffit à lui seul — aucun versement n'est nécessaire —
    et `None` si l'horizon est nul.
    """
    if mois <= 0 or requis <= 0:
        return None
    r = (1.0 + taux_annuel / 100.0) ** (1.0 / 12.0) - 1.0
    depart = max(0.0, depart)
    if abs(r) < 1e-12:
        # Taux nul : la formule générale divise par zéro, la réponse est une division simple.
        return max(0.0, round((requis - depart) / mois, 2))
    facteur = (1.0 + r) ** mois
    manque = requis - depart * facteur
    if manque <= 0:
        return 0.0
    return round(manque * r / (facteur - 1.0), 2)


def euros_constants(montant: float, inflation: float, mois: int) -> float:
    """
    Un montant futur ramené au pouvoir d'achat d'aujourd'hui.

    ⚠️ Utile parce qu'un objectif lointain se juge mal en euros courants : un million
    dans trente ans à deux pour cent d'inflation en vaut cinq cent cinquante mille
    d'aujourd'hui. Afficher le seul montant nominal flatte la projection.
    """
    if mois <= 0 or inflation <= 0:
        return montant
    return montant / ((1.0 + inflation / 100.0) ** (mois / 12.0))


# ── Ce qui alimente l'aide à la décision ─────────────────────────────────────
#
# ⚠️ **Tout est déterministe et vit ici, avec le reste des mathématiques.** L'interprétation
# — quelle phrase, quelle priorité, quel ordre — est une affaire de présentation et se fait
# côté écran. La frontière est celle qui vaut depuis le début de ce module : le calcul se
# recompte, la phrase se relit.


@dataclass(frozen=True)
class PartDuGain:
    """De quoi est faite la valeur projetée : ce qu'on a mis, et ce que ça a rapporté."""

    #: Le capital de départ plus la somme des versements, sans aucun rendement.
    apport: float
    #: La valeur projetée moins l'apport.
    gain: float
    #: La part du gain dans la valeur finale, en pourcentage.
    part_gain: float


def part_du_gain(
    depart: float, versement_mensuel: float | None, taux_annuel: float, mois: int,
) -> PartDuGain | None:
    """
    Ce que la capitalisation apporte, face à ce que l'épargnant verse.

    ⚠️ **La distinction décide de la nature de l'objectif.** Un objectif dont 69 % de la
    valeur finale vient du rendement composé et 31 % des versements ne se pilote pas comme
    son inverse : le premier dépend d'une hypothèse de marché, le second d'une discipline
    d'épargne. C'est le même montant final et deux situations sans rapport.

    ⚠️ L'apport comprend le capital de départ, qui n'est pas un versement futur mais n'est
    pas non plus un gain. Le ranger avec les versements est le choix le moins trompeur : la
    question posée est « quelle part de l'arrivée n'est pas due aux marchés ».
    """
    if mois <= 0:
        return None
    finale = valeur_projetee(depart, versement_mensuel or 0.0, taux_annuel, mois)
    apport = max(0.0, depart) + max(0.0, versement_mensuel or 0.0) * mois
    gain = finale - apport
    if finale <= 0:
        return None
    return PartDuGain(apport=round(apport, 2), gain=round(gain, 2),
                      part_gain=round(max(0.0, gain) / finale * 100, 1))


#: Les secousses éprouvées, et pourquoi celles-là.
#:
#: ⚠️ Des chocs **nommés et fixes**, non un tirage : « une baisse de vingt pour cent » se
#: compare à ce qu'on a vécu, là où un centile de simulation ne se compare à rien. Vingt pour
#: cent est l'ordre de grandeur d'une correction ordinaire ; deux points de rendement en moins
#: est l'écart entre une décennie faste et une décennie banale ; douze mois sans verser est ce
#: qu'un changement de situation provoque.
CHOCS: tuple[tuple[str, str], ...] = (
    ("rendement_moins_2", "Rendement inférieur de 2 points"),
    ("rendement_plus_2", "Rendement supérieur de 2 points"),
    ("baisse_10", "Baisse immédiate de 10 %"),
    ("baisse_20", "Baisse immédiate de 20 %"),
    ("pause_12_mois", "Douze mois sans versement"),
    ("inflation_plus_1", "Inflation supérieure de 1 point"),
)

#: Combien de mois durerait l'interruption de versement éprouvée.
PAUSE_MOIS = 12


def scenarios_stress(
    depart: float, versement_mensuel: float | None, taux_annuel: float, requis: float,
    reference_mois: int | None, inflation: float | None = None,
    mois_restants: int | None = None,
) -> list[dict]:
    """
    Ce que chaque secousse ferait à la date d'atteinte, ou au pouvoir d'achat.

    ⚠️ **`ecart_mois` se compte contre la référence, pas dans l'absolu.** « L'objectif serait
    atteint en 2047 » ne dit rien sans « au lieu de 2042 » : c'est l'écart qui informe, et
    c'est lui que l'écran affiche.

    ⚠️ **La secousse d'inflation ne déplace aucune date**, et la ranger avec les autres serait
    une faute de raisonnement : elle ne change pas le moment où le capital est atteint, elle
    change ce que ce capital achètera. Elle rend donc `pouvoir_achat_perdu` et non
    `ecart_mois`.

    ⚠️ Un scénario dont la cible devient hors de portée rend `mois: None` — une réponse, pas
    un trou. Rendre le plafond de quatre-vingts ans se lirait comme une estimation.
    """
    versement = max(0.0, versement_mensuel or 0.0)
    sorties: list[dict] = []
    for cle, libelle in CHOCS:
        mois: int | None = None
        ecart: int | None = None
        perte_pouvoir_achat: float | None = None

        if cle == "inflation_plus_1":
            # Le seul choc qui ne touche pas la date : il touche ce que la somme vaudra.
            if inflation is None or not mois_restants:
                continue
            finale = valeur_projetee(depart, versement, taux_annuel, mois_restants)
            avant = euros_constants(finale, inflation, mois_restants)
            apres = euros_constants(finale, inflation + 1.0, mois_restants)
            if avant <= 0:
                continue
            perte_pouvoir_achat = round((avant - apres) / avant * 100, 1)
        elif cle == "pause_12_mois":
            # Douze mois sans verser, puis reprise au même rythme.
            apres_pause = valeur_projetee(depart, 0.0, taux_annuel, PAUSE_MOIS)
            suite = mois_pour_atteindre(apres_pause, versement, taux_annuel, requis)
            mois = None if suite is None else suite + PAUSE_MOIS
        else:
            depart_choque = depart
            taux_choque = taux_annuel
            if cle == "rendement_moins_2":
                taux_choque = taux_annuel - 2.0
            elif cle == "rendement_plus_2":
                taux_choque = taux_annuel + 2.0
            elif cle == "baisse_10":
                depart_choque = depart * 0.90
            elif cle == "baisse_20":
                depart_choque = depart * 0.80
            mois = mois_pour_atteindre(depart_choque, versement, taux_choque, requis)

        if mois is not None and reference_mois is not None:
            ecart = mois - reference_mois
        sorties.append({
            "cle": cle, "libelle": libelle, "mois": mois, "ecart_mois": ecart,
            "pouvoir_achat_perdu": perte_pouvoir_achat,
        })
    return sorties
