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

#: Les quatre sortes d'objectifs, telles que la maquette les distingue.
#:
#: ⚠️ Elles ne partagent pas le même calcul, et c'est la raison de ce type. Un capital
#: se compare à un montant ; un revenu mensuel se compare à un capital qu'il faut
#: d'abord déduire d'un taux de retrait. Les traiter ensemble aurait comparé des euros
#: à des euros par mois.
Genre = Literal["capital", "capital_age", "achat", "revenu_mensuel"]

GENRES: tuple[Genre, ...] = ("capital", "capital_age", "achat", "revenu_mensuel")

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
