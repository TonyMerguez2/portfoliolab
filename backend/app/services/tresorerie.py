"""
Le solde d'un compte au fil du temps.

⚠️ **Un compte n'a pas de solde : il a des apports datés, et son solde en est la somme.**
C'est la refonte de ce module, et elle vient d'une phrase de l'épargnant : « il n'y a pas
de depuis quand, juste la date. Quand est-ce qu'on veut mettre l'apport du capital, à
quelle date ? Et c'est tout. Comme pour l'achat d'actions, comme pour tout. » Un apport de
trésorerie est donc le même objet qu'un achat de titres — une écriture datée — et le solde
s'en déduit comme la position se déduit des opérations.

⚠️ **On cumule vers l'avant, on ne soustrait plus à rebours.** La version précédente
partait de `Compte.solde`, « vérité du présent », et retranchait les mouvements
postérieurs pour remonter le temps. Ce sens de lecture exigeait deux représentations du
même fait — un montant dans la table des comptes, un journal à côté — et toute la couture
entre les deux a fini par se déchirer : un apport d'ouverture daté d'aujourd'hui était à
la fois le solde *et* un mouvement postérieur au dernier jour tracé, donc retranché de
lui-même. Mesuré sur un livret réel de 5 000 € : zéro sur tous les jours de la courbe.

⚠️ **Avant le premier apport, le compte vaut zéro — et cela ne se garde plus.** C'était
la raison d'être de `solde_depuis`, et d'une garde explicite qui ramenait à zéro tout ce
qui précédait cette date. La somme cumulée le fait d'elle-même : une somme vide vaut
zéro. La règle n'a pas changé, c'est le code qui a cessé d'avoir à la dire.

⚠️ **Journal vide et solde nul sont deux faits différents.** Un compte sans le moindre
apport ne déclare aucune espèce : il ne rend rien, et l'appelant sait qu'il n'a pas à
tracer de poche de liquidités. Un compte dont les apports s'annulent vaut zéro euro, ce
qui est une information. Les confondre ferait apparaître une ligne plate à zéro sous
chaque PEA qui n'a pas d'espèces.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Iterable, Mapping, Sequence


def _jour(v) -> date:
    """La date seule, qu'on reçoive un `datetime`, une `date` ou une chaîne ISO."""
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    return datetime.fromisoformat(str(v).replace("Z", "+00:00")).date()


def solde_actuel(mouvements: Iterable[Mapping]) -> float | None:
    """
    Ce que vaut le compte aujourd'hui : la somme de ses apports.

    Rend `None` sur un journal vide — « aucune espèce déclarée », et non « zéro euro ».
    Voir l'en-tête du module.
    """
    montants = [float(m["montant"]) for m in mouvements]
    return sum(montants) if montants else None


def solde_par_jour(
    mouvements: Iterable[Mapping],
    calendrier: Sequence[date],
) -> dict[date, float]:
    """
    Le solde du compte à chacun des jours du calendrier.

    `mouvements` porte des dictionnaires `{"date": …, "montant": …}`, le montant étant
    signé — positif pour un versement, négatif pour un retrait.

    ⚠️ **Un apport compte à partir de son jour, pas le lendemain.** Verser 500 € le
    12 mars veut dire que le solde du 12 mars les contient : c'est la lecture qu'aurait
    l'épargnant de son relevé. La borne est donc inclusive.
    """
    mvts = sorted(((_jour(m["date"]), float(m["montant"])) for m in mouvements),
                  key=lambda t: t[0])
    if not mvts:
        return {}

    out: dict[date, float] = {}
    cumul = 0.0
    i = 0
    # Le calendrier est croissant : un seul passage suffit, le curseur `i` avançant sur
    # les apports déjà absorbés. Resommer le journal à chaque jour donnait le même
    # résultat au prix d'un produit du nombre de jours par le nombre d'apports.
    for j in calendrier:
        while i < len(mvts) and mvts[i][0] <= j:
            cumul += mvts[i][1]
            i += 1
        out[j] = cumul
    return out


def liquidites_par_jour(
    comptes: Iterable[Mapping],
    calendrier: Sequence[date],
) -> dict[date, float]:
    """
    La somme des soldes de tous les comptes, jour par jour.

    `comptes` porte des dictionnaires `{"mouvements": [...]}`.

    ⚠️ **Tous les comptes, y compris ceux qui portent des titres.** Un PEA a une poche
    d'espèces à côté de ses lignes ; l'exclure ferait manquer au patrimoine une somme que
    le bandeau, lui, compte déjà — et les deux chiffres se contrediraient à l'écran.
    """
    total = {j: 0.0 for j in calendrier}
    for c in comptes:
        for j, v in solde_par_jour(c.get("mouvements") or [], calendrier).items():
            total[j] += v
    return total
