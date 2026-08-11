"""
Les devises d'affichage du site, et le taux qui convertit.

⚠️ **Ce module existe à cause d'une réserve que j'avais affichée sans la lever.** Les
rendements de référence et le backtest d'allocation sont calculés sur des fonds cotés en
dollars : un épargnant en euros n'a pas touché ces rendements-là, l'écart venant du change.
Je l'écrivais en petit sous le chiffre. Une devise choisie par l'utilisateur permet de le
corriger au lieu de s'en excuser.

⚠️ **Un taux de change est daté.** Convertir un montant, c'est le convertir *à une date* ;
convertir une **série** pour en tirer un rendement, c'est appliquer le taux de chaque jour,
et non le taux du jour à toute l'histoire. La seconde erreur est facile et invisible : elle
donne un rendement juste en apparence, faux de plusieurs points par an. Voir
`convertir_serie`.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Devise:
    """Une devise d'affichage."""

    code: str
    symbole: str
    nom: str
    #: La paire yfinance qui donne le prix d'**un dollar** dans cette devise.
    #:
    #: ⚠️ Le sens compte. « EURUSD=X » cote le dollar par euro ; ce dont on a besoin ici
    #: est l'inverse — combien d'euros vaut un dollar — donc « USDEUR=X ». Se tromper de
    #: sens inverse le rendement du change, ce qui ne se voit pas sur un seul chiffre.
    paire_depuis_usd: str | None
    #: Le nombre de décimales usuel. Le yen ne s'écrit pas avec des centimes.
    decimales: int = 2


#: Les devises proposées, la première étant celle par défaut.
#:
#: ⚠️ Le dollar par défaut, parce que c'est la devise dans laquelle les séries de cours du
#: fournisseur sont majoritairement libellées : c'est le seul choix qui n'applique aucune
#: conversion, donc celui qui n'introduit aucune approximation par défaut.
DEVISES: tuple[Devise, ...] = (
    Devise("USD", "$", "Dollar américain", None),
    Devise("EUR", "€", "Euro", "USDEUR=X"),
    Devise("GBP", "£", "Livre sterling", "USDGBP=X"),
    Devise("CHF", "CHF", "Franc suisse", "USDCHF=X"),
    Devise("JPY", "¥", "Yen japonais", "USDJPY=X", decimales=0),
    Devise("CAD", "C$", "Dollar canadien", "USDCAD=X"),
    Devise("AUD", "A$", "Dollar australien", "USDAUD=X"),
)

DEVISE_PAR_DEFAUT = DEVISES[0].code

_PAR_CODE = {d.code: d for d in DEVISES}


def devise(code: str | None) -> Devise:
    """
    La devise demandée, ou celle par défaut.

    ⚠️ Retombe sur le dollar plutôt que de lever : un code inconnu en base — une devise
    retirée de la liste, par exemple — ne doit pas empêcher un compte de se connecter.
    """
    return _PAR_CODE.get((code or "").upper(), _PAR_CODE[DEVISE_PAR_DEFAUT])


def est_connue(code: str | None) -> bool:
    """Vrai si ce code figure dans la liste — sert à refuser une écriture."""
    return (code or "").upper() in _PAR_CODE


def convertir_serie(
    valeurs: list[float], taux: list[float | None],
) -> list[float] | None:
    """
    Une série de prix en dollars, convertie **jour par jour**.

    `taux[i]` est le prix d'un dollar dans la devise cible à la séance `i`.

    ⚠️ **C'est ici que se joue la seule erreur qui compte.** Appliquer le taux du jour à
    toute l'histoire — multiplier chaque prix par le même nombre — laisse le rendement
    inchangé : la conversion s'annule dans le rapport final sur initial. On croit avoir
    converti, et on a seulement changé l'étiquette. Le rendement du change, qui peut peser
    plusieurs points par an sur vingt-cinq ans, disparaît alors purement et simplement.
    Appliquer le taux **de chaque séance** est la seule façon d'obtenir le rendement qu'un
    épargnant de cette devise a réellement connu.

    Rend `None` si les longueurs diffèrent : mieux vaut refuser que d'aligner deux séries
    au hasard.
    """
    if len(valeurs) != len(taux) or not valeurs:
        return None
    sortie: list[float] = []
    dernier: float | None = None
    for v, t in zip(valeurs, taux):
        # Un taux manquant reprend le dernier connu : les jours fériés de change ne sont
        # pas les mêmes que ceux des bourses, et un trou ne doit pas trouer la série.
        if t is not None and t > 0:
            dernier = t
        if dernier is None:
            return None
        sortie.append(v * dernier)
    return sortie
