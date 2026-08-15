"""
Le solde d'un compte au fil du temps.

⚠️ **On remonte le temps depuis aujourd'hui, on ne l'additionne pas depuis le début.**
`Compte.solde` est la vérité du présent : c'est le chiffre que l'épargnant relit sur son
relevé et celui qui s'affiche partout. Le solde d'hier s'en déduit en retirant ce qui a
bougé depuis. L'autre sens — partir de zéro et empiler les mouvements — aurait exigé un
journal complet depuis l'ouverture du compte, que personne ne possède : le solde d'un
livret ouvert il y a douze ans ne se reconstitue pas.

⚠️ **Avant `solde_depuis`, le compte vaut zéro et non « on ne sait pas ».** Zéro est ici
la bonne réponse pour la courbe : le patrimoine tracé est celui qu'on peut justifier, et
un livret déclaré comme datant de mars n'était pas là en février. La nuance compte parce
que l'alternative — étendre le solde à toute la courbe — ferait apparaître de l'argent
avant qu'il n'existe, ce qui est précisément ce que cette date sert à empêcher.

⚠️ **Sans `solde_depuis`, le solde vaut depuis toujours, et c'est une supposition.** Les
comptes déclarés avant l'existence de cette colonne n'ont pas pu répondre. Les faire
apparaître au jour de leur déclaration aurait dessiné une marche verticale qui se lit
comme une performance ; les supposer présents depuis l'origine ne déforme, au pire, que le
début de la courbe. C'est le seul endroit du calcul qui repose sur une hypothèse, et il
est appelé à se vider à mesure que les comptes se déclarent avec leur date.
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


def solde_par_jour(
    solde_actuel: float | None,
    solde_depuis,
    mouvements: Iterable[Mapping],
    calendrier: Sequence[date],
) -> dict[date, float]:
    """
    Le solde du compte à chacun des jours du calendrier.

    `mouvements` porte des dictionnaires `{"date": …, "montant": …}`, le montant étant
    signé — positif pour un versement, négatif pour un retrait.

    ⚠️ **Un mouvement compte à partir de son jour, pas le lendemain.** Verser 500 € le
    12 mars veut dire que le solde du 12 mars les contient : c'est la lecture qu'aurait
    l'épargnant de son relevé. La borne est donc stricte du côté des mouvements
    *postérieurs* qu'on retranche.
    """
    if solde_actuel is None:
        return {}

    debut = _jour(solde_depuis) if solde_depuis is not None else None
    mvts = sorted(((_jour(m["date"]), float(m["montant"])) for m in mouvements),
                  key=lambda t: t[0])

    out: dict[date, float] = {}
    for j in calendrier:
        if debut is not None and j < debut:
            out[j] = 0.0
            continue
        # Ce qui a bougé *après* ce jour-là est retranché du solde d'aujourd'hui.
        posterieurs = sum(montant for quand, montant in mvts if quand > j)
        out[j] = solde_actuel - posterieurs
    return out


def liquidites_par_jour(
    comptes: Iterable[Mapping],
    calendrier: Sequence[date],
) -> dict[date, float]:
    """
    La somme des soldes de tous les comptes, jour par jour.

    `comptes` porte des dictionnaires `{"solde": …, "solde_depuis": …, "mouvements": [...]}`.

    ⚠️ **Tous les comptes, y compris ceux qui portent des titres.** Un PEA a une poche
    d'espèces à côté de ses lignes ; l'exclure ferait manquer au patrimoine une somme que
    le bandeau, lui, compte déjà — et les deux chiffres se contrediraient à l'écran.
    """
    total = {j: 0.0 for j in calendrier}
    for c in comptes:
        par_jour = solde_par_jour(
            c.get("solde"), c.get("solde_depuis"), c.get("mouvements") or [], calendrier)
        for j, v in par_jour.items():
            total[j] += v
    return total
