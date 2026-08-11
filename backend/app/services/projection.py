"""
La projection d'un objectif : trois enveloppes, un intervalle, une probabilité.

⚠️ **Ce sont des quantiles, pas des scénarios.** La maquette dessine trois courbes
nommées « optimiste », « neutre », « pessimiste », ce qui laisse croire à trois avenirs
possibles dont un se réalisera. Ce qui est calculé ici est autre chose : à chaque mois,
la valeur en dessous de laquelle tombent 5 %, 50 % et 95 % des tirages. Aucune de ces
courbes n'est une trajectoire — un portefeuille réel ne suit pas le cinquième centile
pendant vingt ans. L'écran doit les nommer pour ce qu'elles sont.

⚠️ **Deux entrées de nature opposée, et il faut le savoir.** Le rendement attendu est
une **hypothèse de l'épargnant** ; la volatilité est une **mesure** de son portefeuille.
La seconde ne se devine pas : sans elle, cette fonction ne rend ni intervalle ni
probabilité. Une probabilité calculée sur une volatilité choisie au doigt mouillé serait
une fausse précision, et c'est précisément le genre de chiffre sur lequel on prend une
décision qu'on n'aurait pas prise.

⚠️ **Le modèle est explicite et il est faux.** On tire des rendements mensuels
indépendants et log-normaux. Les marchés réels ont des queues plus épaisses, de
l'autocorrélation et des régimes ; ce modèle sous-estime donc les scénarios extrêmes.
Il est retenu parce qu'il est simple, reproductible et vérifiable — pas parce qu'il est
juste. Toute lecture doit s'arrêter à « voilà ce que ce modèle dit », jamais « voilà ce
qui arrivera ».

⚠️ **Aucun conseil n'est produit.** On dit où mène le rythme actuel, jamais quoi faire.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field

import numpy as np

#: Combien de tirages. Deux mille suffisent pour stabiliser des centiles à 5 et 95 %
#: — l'erreur d'échantillonnage sur un quantile extrême décroît en racine de N — et
#: restent instantanés. Dix mille n'ajouteraient que du temps de calcul.
TIRAGES = 2000

#: Les centiles retenus, et ce qu'ils portent à l'écran.
CENTILES = (5, 50, 95)

#: Douze mois par an, et √12 pour passer d'une volatilité annuelle à mensuelle.
MOIS_PAR_AN = 12


@dataclass(frozen=True)
class Projection:
    """Ce qu'un modèle de tirages dit d'un objectif."""

    #: Les mois échantillonnés, depuis 0.
    mois: list[int] = field(default_factory=list)
    #: Les enveloppes de quantiles, par centile : `{5: [...], 50: [...], 95: [...]}`.
    enveloppes: dict[int, list[float]] = field(default_factory=dict)
    #: La valeur médiane à l'horizon.
    mediane: float | None = None
    #: L'intervalle à 90 % — du 5ᵉ au 95ᵉ centile — à l'horizon.
    #:
    #: ⚠️ À **90 %** et non 95, parce que c'est ce que les centiles 5 et 95 délimitent.
    #: La maquette annonçait « intervalle de confiance (95 %) » au-dessus de deux
    #: bornes qui n'en couvrent que quatre-vingt-dix : l'étiquette promettait plus que
    #: le calcul.
    intervalle: tuple[float, float] | None = None
    #: La part des tirages qui atteignent le capital requis, en pourcentage.
    probabilite: float | None = None
    #: Le rendement annualisé qu'implique chaque enveloppe, pour situer les courbes.
    taux_implicites: dict[int, float] = field(default_factory=dict)


def _graine(cle: str) -> int:
    """
    Une graine stable, dérivée d'une chaîne.

    ⚠️ Déterministe exprès. Sans graine fixe, deux affichages du même objectif
    donneraient deux probabilités différentes — 71 % puis 73 % — et l'épargnant aurait
    raison de ne plus croire aucune des deux.
    """
    return int.from_bytes(hashlib.sha256(cle.encode()).digest()[:4], "big")


def projeter(
    depart: float, versement_mensuel: float, taux_annuel: float,
    volatilite_annuelle: float | None, mois: int, requis: float | None,
    cle: str = "", tirages: int = TIRAGES, pas: int = 1,
) -> Projection:
    """
    Les enveloppes de quantiles d'un objectif, mois par mois.

    `volatilite_annuelle` en pourcentage, mesurée sur le portefeuille. `requis` est le
    capital à atteindre, qui donne la probabilité.

    ⚠️ **Sans volatilité, une seule courbe.** Le résultat porte alors la trajectoire
    déterministe dans les trois enveloppes, aucun intervalle et aucune probabilité :
    il n'y a pas de dispersion à montrer, et prétendre le contraire demanderait
    d'inventer la mesure manquante.

    ⚠️ **Volatilité nulle et volatilité inconnue ne sont pas le même cas.** Une
    volatilité mesurée à zéro — un livret — donne bien un intervalle, réduit à un point,
    et une probabilité de 0 ou 100. C'est une information ; `None` est une ignorance.
    """
    mois = max(0, int(mois))
    jalons = list(range(0, mois + 1, max(1, pas)))
    if jalons and jalons[-1] != mois:
        jalons.append(mois)

    r_mensuel = (1.0 + taux_annuel / 100.0) ** (1.0 / MOIS_PAR_AN) - 1.0
    versement = max(0.0, versement_mensuel)
    depart = max(0.0, depart)

    if volatilite_annuelle is None:
        # Une seule trajectoire, répétée : l'écran n'a alors qu'une courbe à tracer.
        suite, valeur = [], depart
        for m in range(mois + 1):
            if m:
                valeur = valeur * (1.0 + r_mensuel) + versement
            suite.append(valeur)
        courbe = [suite[m] for m in jalons]
        return Projection(
            mois=jalons, enveloppes={c: courbe for c in CENTILES},
            mediane=courbe[-1] if courbe else None,
            taux_implicites={},
        )

    sigma_m = max(0.0, volatilite_annuelle / 100.0) / np.sqrt(MOIS_PAR_AN)
    generateur = np.random.default_rng(_graine(cle))
    valeurs = np.full(tirages, depart, dtype=float)
    par_jalon: dict[int, np.ndarray] = {0: valeurs.copy()}

    # ⚠️ **Le taux saisi est le taux de la trajectoire médiane, et ce choix a une
    # histoire.** J'avais d'abord posé `mu_log = log1p(r) − σ²/2`, ce qui fait du taux
    # une moyenne *arithmétique* des rendements mensuels. C'est une convention
    # défendable, et un test l'a fait tomber pour une bonne raison : la médiane
    # s'effondrait quand la volatilité montait — 378 000 € à 8 % de volatilité contre
    # 297 000 € à 25 %, à rendement attendu identique. Le phénomène est réel (le drain
    # de variance) mais il rendait la projection incohérente avec le reste de
    # l'application, où `objectifs.valeur_projetee` compose le taux saisi tel quel.
    #
    # Quelqu'un qui écrit « rendement attendu 7,2 % » veut dire « mon argent croît de
    # 7,2 % par an », pas « la moyenne de mes rendements mensuels vaut 7,2 % ». Avec
    # `mu_log = log1p(r)`, la médiane croît exactement au taux annoncé et rejoint le
    # calcul déterministe ; la moyenne, elle, passe légèrement au-dessus. Un test fixe
    # désormais cette égalité.
    mu_log = np.log1p(r_mensuel)
    for m in range(1, mois + 1):
        # ⚠️ Le tirage porte sur le **logarithme** du rendement, ce qui interdit à une
        # valeur de devenir négative. Un tirage gaussien sur le rendement simple aurait
        # permis −140 % en un mois, donc un patrimoine négatif — impossible sans levier,
        # et cela déformait toute la queue basse.
        chocs = generateur.normal(mu_log, sigma_m, tirages)
        valeurs = valeurs * np.exp(chocs) + versement
        if m in jalons:
            par_jalon[m] = valeurs.copy()

    enveloppes = {
        c: [float(np.percentile(par_jalon[m], c)) for m in jalons] for c in CENTILES
    }
    finales = par_jalon[mois]
    mediane = float(np.median(finales))
    intervalle = (float(np.percentile(finales, 5)), float(np.percentile(finales, 95)))
    probabilite = (float((finales >= requis).mean() * 100.0)
                   if requis and requis > 0 else None)

    # Le rendement annualisé qu'il faudrait pour aboutir à chaque enveloppe, versements
    # compris. Sert à nommer les courbes comme la maquette le fait, sans prétendre que
    # ce taux se réalisera.
    taux = {}
    if mois >= MOIS_PAR_AN:
        for c in CENTILES:
            taux[c] = taux_implicite(depart, versement, enveloppes[c][-1], mois)

    return Projection(mois=jalons, enveloppes=enveloppes, mediane=mediane,
                      intervalle=intervalle, probabilite=probabilite,
                      taux_implicites=taux)


def taux_implicite(
    depart: float, versement_mensuel: float, arrivee: float, mois: int,
    tolerance: float = 1e-4,
) -> float | None:
    """
    Le rendement annuel qui mène de `depart` à `arrivee` avec ces versements.

    ⚠️ Résolu par dichotomie et non par une formule : avec des versements réguliers, le
    taux n'a pas d'expression fermée. La borne haute est volontairement large — cent
    pour cent l'an — pour ne pas rendre la borne elle-même comme s'il s'agissait d'un
    résultat.
    """
    if mois <= 0 or arrivee <= 0:
        return None
    total_verse = depart + versement_mensuel * mois
    if arrivee <= 0 or total_verse <= 0:
        return None

    def final(taux: float) -> float:
        r = (1.0 + taux / 100.0) ** (1.0 / MOIS_PAR_AN) - 1.0
        v = depart
        for _ in range(mois):
            v = v * (1.0 + r) + versement_mensuel
        return v

    bas, haut = -99.0, 100.0
    if final(haut) < arrivee or final(bas) > arrivee:
        return None
    for _ in range(80):
        milieu = (bas + haut) / 2
        if final(milieu) < arrivee:
            bas = milieu
        else:
            haut = milieu
        if haut - bas < tolerance:
            break
    return round((bas + haut) / 2, 2)
