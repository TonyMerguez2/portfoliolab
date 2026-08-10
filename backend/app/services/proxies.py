"""
Quel ETF physique interroger pour connaître la composition d'un indice.

⚠️ **Cette table est partagée, et c'est pour cela qu'elle vit ici.** Elle servait
au calcul de concentration du score ; elle sert désormais aussi aux événements des
sociétés sous-jacentes d'un fonds. En garder deux copies aurait fait diverger la
correction la plus délicate qu'elle porte — l'ordre des motifs Asie-Pacifique, dont
l'inversion avait rapproché un indice de mille deux cents lignes d'un proxy qui en
compte une centaine.

Elle a été déplacée sans être modifiée : mêmes motifs, même ordre, mêmes candidats.

Pourquoi des proxys du tout : un fonds synthétique ne publie pas l'indice qu'il
réplique, mais un panier de collatéral — mesuré sur ETZ.PA, ses propres lignes
donnaient trente-six sociétés équivalentes contre cent quatre-vingt-quinze pour le
Stoxx Europe 600 qu'il suit. L'indice, lu chez un ETF physique qui le réplique, dit
la vérité de l'exposition ; le panier du fonds ne dit que sa mécanique interne.
"""

from __future__ import annotations

# ⚠️ La table ne contient que des indices **larges et identifiés sans ambiguïté**,
# et l'omission est délibérée. Associer un indice étroit à un proxy large serait
# l'erreur grave : un fonds de trente valeurs passerait pour un fonds de cinq cents.
# Le Euro Stoxx 50, le CAC 40 et les indices sectoriels n'y figurent donc pas — et
# ces fonds-là sont généralement physiques, donc lisibles directement.
#
# L'ordre compte : les motifs les plus précis passent devant.
PROXY_COMPOSITION: list[tuple[str, tuple[str, ...]]] = [
    ("nasdaq 100",      ("QQQ",)),
    ("nasdaq",          ("QQQ",)),
    ("s&p 500",         ("CSPX.AS", "VOO", "SPY")),
    ("s&p500",          ("CSPX.AS", "VOO", "SPY")),
    ("msci usa",        ("CSPX.AS", "VOO")),
    ("msci world",      ("IWDA.AS", "URTH")),
    ("pea monde",       ("IWDA.AS", "URTH")),
    ("stoxx europe 600", ("EXSA.DE", "IEUR")),
    ("stoxx europe",    ("EXSA.DE", "IEUR")),
    ("msci europe",     ("IMEU.AS", "IEV")),
    ("emerging asia",   ("EIMI.AS", "IEMG")),
    ("msci emerging",   ("EIMI.AS", "IEMG")),
    ("emerging markets", ("EIMI.AS", "IEMG")),
    # ⚠️ « AC » — All Countries — passe **devant** les motifs Pacifique, et cet ordre
    # corrige une erreur réelle. Le MSCI AC Asia Pacific ex Japan est majoritairement
    # émergent, avec quelque 1 200 lignes ; le MSCI Pacific ex Japan est développé et
    # n'en compte qu'une centaine. Les rapprocher donnait 36 sociétés équivalentes
    # pour un fonds qui en porte des centaines.
    ("ac asia pacific",  ("AAXJ", "EIMI.AS")),
    ("all country asia", ("AAXJ", "EIMI.AS")),
    ("msci pacific",     ("CPXJ.AS", "IPAC")),
    # ⚠️ « asie pacifique » seul n'a **pas** de proxy, volontairement. Le libellé
    # couvre aussi bien un indice développé qu'un indice tous pays, et deviner
    # reviendrait à choisir entre cent et mille deux cents sociétés à la place de la
    # donnée. Une ligne sans proxy reste non mesurée, ce qui est le bon aveu.
]


def normaliser(nom: str) -> str:
    """Le nom d'un fonds, débarrassé de ce qui gêne la comparaison."""
    return nom.lower().replace("é", "e").replace("è", "e")


def proxys_pour(nom: str | None) -> tuple[str, ...]:
    """
    Les ETF physiques à interroger pour cet intitulé de fonds, par ordre de
    préférence. Vide si l'indice n'est pas reconnu — ce qui est un aveu, pas un
    échec : mieux vaut une ligne non mesurée qu'une composition devinée.
    """
    if not nom:
        return ()
    n = normaliser(nom)
    for motif, tickers in PROXY_COMPOSITION:
        if motif in n:
            return tickers
    return ()
