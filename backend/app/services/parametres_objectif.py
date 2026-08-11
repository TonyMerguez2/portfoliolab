"""
Ce qu'on peut déduire du portefeuille pour préparer un objectif — et ce qu'on refuse.

⚠️ **Les trois paramètres d'une projection ne sont pas de même nature, et les traiter
pareil serait la faute.**

- Le **versement mensuel** est une **mesure** : les transactions disent combien
  l'épargnant a versé et sur combien de mois. On le calcule et on le propose.
- Le **rendement attendu** est une **hypothèse**. On peut mesurer le passé de
  l'allocation, et on le montre ; on ne le pré-remplit pas. Mesuré sur un vrai
  portefeuille de trois ETF larges et d'une action : 17,90 % par an sur trois ans,
  14,71 % sur dix. Ces chiffres sont exacts et décrivent une décennie exceptionnelle.
  Les glisser dans le champ rendrait chaque projection délirante — et l'épargnant y
  croirait *parce que le chiffre vient de ses données*. C'est précisément le mécanisme
  qu'on veut empêcher.
- L'**inflation** n'est pas mesurable ici, mais une **référence publiée** existe : la
  cible de la Banque centrale européenne, deux pour cent. Proposée en le disant.

Autrement dit : on automatise ce qui s'observe, on documente ce qui s'assume.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date

#: La cible d'inflation de la BCE, en pourcentage par an.
#:
#: ⚠️ Une cible de politique monétaire, pas une prévision ni une mesure. La BCE
#: l'annonce publiquement — « 2 % à moyen terme » — ce qui en fait une référence
#: vérifiable, à la différence d'un chiffre choisi par ce logiciel.
INFLATION_CIBLE_BCE = 2.0

#: Au-delà de cette part des versements concentrée sur un seul mois, parler d'un rythme
#: mensuel n'a plus de sens.
#:
#: ⚠️ Le cas qu'il faut attraper : un apport unique au départ, puis rien. Divisé par six
#: mois, il ressemble à une habitude de versement qui n'existe pas, et la projection
#: promet alors des apports que personne n'a l'intention de faire.
SEUIL_CONCENTRATION = 60.0


@dataclass(frozen=True)
class VersementObserve:
    """Ce que les transactions disent des apports."""

    #: Le rythme moyen, en euros par mois. `None` si aucun apport net.
    par_mois: float | None
    #: Le net versé sur la période, achats moins ventes.
    net: float
    mois: int
    operations: int
    #: La part du net apportée pendant le mois le plus chargé, en pourcentage.
    concentration: float
    #: Vrai quand ce rythme ne décrit pas une habitude — voir `SEUIL_CONCENTRATION`.
    trompeur: bool


def versement_observe(
    transactions: list, aujourdhui: date | None = None,
) -> VersementObserve | None:
    """
    Le rythme d'apport réellement constaté.

    ⚠️ Le **net** : achats moins ventes. Ne compter que les achats surestimerait l'effort
    d'épargne de quiconque a vendu pour racheter autre chose — un arbitrage n'est pas un
    versement.

    ⚠️ La comparaison de `side` est insensible à la casse, et ce détail a déjà coûté une
    mesure fausse : la colonne vaut « BUY » en majuscules, une comparaison avec « buy »
    rendait zéro euro de versement sans rien signaler.
    """
    if not transactions:
        return None

    def jour(t) -> date:
        v = t.executed_at
        return v.date() if hasattr(v, "date") else v

    par_mois: dict[str, float] = defaultdict(float)
    net = 0.0
    for t in transactions:
        montant = (t.quantity or 0) * (t.unit_price or 0) + (t.fees or 0)
        signe = 1.0 if (t.side or "").upper() == "BUY" else -1.0
        net += montant * signe
        d = jour(t)
        par_mois[f"{d.year}-{d.month:02d}"] += montant * signe

    ref = aujourdhui or date.today()
    debut = min(jour(t) for t in transactions)
    mois = max(1, (ref.year - debut.year) * 12 + ref.month - debut.month)

    if net <= 0:
        return VersementObserve(None, net, mois, len(transactions), 0.0, True)

    plus_charge = max((v for v in par_mois.values()), default=0.0)
    concentration = plus_charge / net * 100.0 if net > 0 else 0.0
    return VersementObserve(
        par_mois=round(net / mois, 2), net=round(net, 2), mois=mois,
        operations=len(transactions), concentration=round(concentration, 1),
        trompeur=concentration > SEUIL_CONCENTRATION,
    )


@dataclass(frozen=True)
class RendementPasse:
    """Le rendement annualisé d'une allocation sur une fenêtre passée."""

    annees: int
    rendement: float
    volatilite: float


def annualiser(rendements_log: list[float], seances_par_an: int = 252) -> float | None:
    """
    Le rendement annuel équivalent d'une suite de rendements logarithmiques quotidiens.

    ⚠️ Rend `None` sous une année de données. Annualiser six mois multiplie par deux un
    hasard de six mois : un portefeuille en hausse de quatorze pour cent depuis février
    afficherait « trente pour cent par an », ce qu'aucune donnée ne soutient.
    """
    n = len(rendements_log)
    if n < seances_par_an:
        return None
    total = sum(rendements_log)
    return round((pow(2.718281828459045, total * seances_par_an / n) - 1) * 100, 2)
