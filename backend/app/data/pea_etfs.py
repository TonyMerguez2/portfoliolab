"""
Catalogue local des ETF éligibles au PEA.

La recherche de Yahoo Finance ne retrouve pas ces fonds par leur indice. Ils
sont indexés sous leur nom commercial français — « Amundi PEA Asie Pacifique »
—, l'indice suivi ne figurant qu'entre parenthèses, où la recherche ne va pas :
« MSCI AC Asia Pacific Ex Japan » ne renvoie rien, alors que c'est sous ce nom
que l'épargnant les connaît et les compare.

Ils sont donc tenus ici et cherchés en parallèle. La liste est courte et stable
— une gamme fermée, quelques produits par an —, ce qui la rend maintenable à la
main ; les cours viennent de yfinance comme pour tout le reste.
"""

from __future__ import annotations

import unicodedata

# (ticker, nom complet). Le nom porte le libellé français *et* l'indice, ce qui
# rend les deux cherchables sans table d'alias séparée.
PEA_ETFS: list[tuple[str, str]] = [
    ("PE500.PA",  "Amundi PEA S&P 500 Screened UCITS ETF Acc"),
    ("PSP5.PA",   "Amundi PEA S&P 500 UCITS ETF Acc"),
    ("PSPH.PA",   "Amundi PEA S&P 500 UCITS ETF EUR Hedged Acc"),
    ("P500H.PA",  "Amundi PEA S&P 500 Screened UCITS ETF EUR Hedged Acc"),
    ("DCAM.PA",   "Amundi PEA Monde (MSCI World) UCITS ETF Acc"),
    ("PUST.PA",   "Amundi PEA Nasdaq-100 UCITS ETF Acc"),
    ("PNAS.PA",   "Amundi PEA Nasdaq-100 UCITS ETF S-Acc"),
    ("PAEJ.PA",   "Amundi PEA Asie Pacifique (MSCI AC Asia Pacific Ex Japan) UCITS ETF Acc"),
    ("PAASI.PA",  "Amundi PEA Asie Émergente (MSCI Emerging Asia) Screened UCITS ETF Acc"),
    ("PAEEM.PA",  "Amundi PEA Émergent (MSCI Emerging Markets) ESG Transition UCITS ETF Acc"),
    ("PASI.PA",   "Amundi PEA Chine (MSCI China) Screened UCITS ETF Acc"),
    ("PINR.PA",   "Amundi PEA Inde (MSCI India) UCITS ETF Acc"),
    ("PALAT.PA",  "Amundi PEA Amérique Latine (MSCI Emerging Latin America) Selection UCITS ETF Acc"),
    ("PTPXE.PA",  "Amundi PEA Japon (TOPIX) UCITS ETF EUR Acc"),
    ("PTPXH.PA",  "Amundi PEA Japon (TOPIX) UCITS ETF EUR Hedged Acc"),
    ("PDJE.PA",   "Amundi PEA S&P US Industrials Screened UCITS ETF Acc"),
    ("PMEH.PA",   "Amundi PEA Immobilier Europe (FTSE EPRA/NAREIT) UCITS ETF Acc"),
    ("AWAT.PA",   "Amundi PEA Eau (MSCI Water) UCITS ETF Acc"),
]


def _normaliser(s: str) -> str:
    """Minuscules sans accents ni ponctuation — « Émergent » doit répondre à « emergent »."""
    sans_accent = "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )
    return "".join(c if c.isalnum() else " " for c in sans_accent.lower())


# Index calculé une fois : la recherche est appelée à chaque frappe.
_INDEX: list[tuple[str, str, str]] = [
    (ticker, nom, _normaliser(f"{ticker} {nom}")) for ticker, nom in PEA_ETFS
]


def chercher(requete: str, limite: int = 8) -> list[dict]:
    """
    Les fonds dont le nom contient tous les mots de la requête.

    Tous les mots, et non l'un d'eux : « PEA Japon » ne doit pas renvoyer les
    dix-huit fonds de la gamme au motif qu'ils portent tous « PEA ».
    """
    mots = _normaliser(requete).split()
    if not mots:
        return []

    trouves = []
    for ticker, nom, indexe in _INDEX:
        if not all(m in indexe for m in mots):
            continue
        # Un mot retrouvé entier vaut mieux qu'un mot retrouvé au milieu d'un
        # autre : « emergent » désigne « PEA Émergent » plus sûrement que
        # « PEA Asie Émergente », où il n'apparaît qu'en fragment.
        tokens = set(indexe.split())
        score = sum(2 if m in tokens else 1 for m in mots)
        trouves.append((score, {
            "ticker":   ticker,
            "name":     nom,
            "type":     "ETF",
            "exchange": "PAR",
            "logo":     "",
        }))

    trouves.sort(key=lambda t: t[0], reverse=True)
    return [e for _, e in trouves[:limite]]
