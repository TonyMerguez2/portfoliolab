"""
Le pilier Qualité : la solidité de ce qui est détenu, **par type d'actif**.

⚠️ Appliquer les mêmes critères à une action, un ETF et une cryptomonnaie serait la
faute la plus grossière de ce pilier. Un ETF n'a pas de bénéfice, une crypto n'a pas
de capitalisation comptable, une action n'a pas de frais courants. Chaque type est
donc jugé sur ce qui le concerne, et **seulement** sur les données réellement
disponibles.

⚠️ Pour les cryptomonnaies en particulier : aucun « score de qualité » n'est inventé.
Le fournisseur de cours ne donne ni profondeur de marché, ni capitalisation fiable, ni
mesure de décentralisation. Une note fabriquée sur ce vide aurait l'apparence d'une
analyse. Elles ne sont donc notées que sur leur **ancienneté de cotation**, seule
donnée solide — un actif qui traverse plusieurs cycles n'est pas un actif de six mois.

C'est le pilier le plus lacunaire du moteur, et son poids de quinze pour cent en tient
compte : une note souvent partielle ne doit pas dominer l'ensemble.
"""

from __future__ import annotations

from ..normalisation import note_decroissante
from ..types import Metrique

# Ancienneté de cotation, en séances, au-delà de laquelle un actif est jugé éprouvé.
# Deux ans et demi : assez pour avoir traversé au moins une correction marquée.
ANCIENNETE_SOLIDE = 600
ANCIENNETE_FAIBLE = 60

# Étendue interne d'un fonds, en actifs effectifs : repères d'une échelle qui devait
# être recalibrée.
#
# ⚠️ La première version visait 200 actifs, et un tracker S&P 500 y obtenait 26 — ce
# qui est absurde pour l'un des indices les plus larges du monde. Les repères mesurés
# sur les compositions réellement publiées :
#
#     fonds « total market »   ~200 actifs effectifs
#     MSCI World               ~121
#     Stoxx Europe 600         ~195
#     S&P 500                   ~60
#     Nasdaq-100                ~41
#     fonds sectoriel           ~19
#
# À 80 pour cible et 15 pour plancher, le S&P 500 obtient 69, un MSCI World 100, un
# Nasdaq-100 40 et un fonds sectoriel 6. C'est l'étalement qui correspond à ce que ces
# fonds sont réellement.
ETENDUE_SOLIDE = 80.0
ETENDUE_FAIBLE = 15.0


def _note_fonds(details: dict, ter_effectif: float | None) -> tuple[float | None, str]:
    """
    La qualité d'un fonds : ses frais et l'étendue réelle de sa composition.

    Deux critères seulement, et ce sont les deux qui décident vraiment. Les frais
    parce qu'ils sont certains et récurrents ; la diversification interne parce qu'un
    fonds de trente lignes et un fonds de mille cinq cents ne rendent pas le même
    service, à indice comparable.

    Écartés faute de données : la taille de l'encours, l'écart de suivi et
    l'ancienneté du fonds ne sont pas exposés de façon fiable par la source. Les
    inventer aurait été plus grave que de les omettre.
    """
    notes: list[float] = []
    lectures: list[str] = []

    # ⚠️ Le TER **effectif**, saisie de l'épargnant comprise. La première version ne
    # lisait que la fiche du fournisseur : sur un vrai PEA, deux fonds sur trois n'y ont
    # aucun TER — la source annonce même un zéro faux — et leur qualité se jugeait donc
    # sur la seule étendue interne, à 26 sur 100 pour un tracker S&P 500.
    ter = ter_effectif if ter_effectif else details.get("frais")
    if ter and ter > 0:
        notes.append(note_decroissante(float(ter), 0.10, 1.00))
        lectures.append(f"{ter:.2f} % de frais")

    hhi = details.get("hhi")
    if hhi and hhi > 0:
        actifs = 1.0 / float(hhi)
        notes.append(note_decroissante(actifs, ETENDUE_SOLIDE, ETENDUE_FAIBLE))
        lectures.append(f"{actifs:.0f} actifs internes")

    if not notes:
        return None, "données du fonds indisponibles"
    return sum(notes) / len(notes), ", ".join(lectures)


def _note_action(details: dict) -> tuple[float | None, str]:
    """
    La qualité d'une action.

    ⚠️ Réduite à ce que la source donne réellement : le secteur et le pays suffisent à
    savoir qu'une ligne est identifiée, pas à juger sa solidité. La capitalisation, la
    rentabilité et la santé du bilan ne sont pas disponibles de façon fiable ici.

    Plutôt qu'un score inventé, cette métrique reste donc **indisponible** pour les
    actions, ce qui abaisse la confiance sans fausser la note. C'est le manque le plus
    net du moteur, et le premier chantier d'une V2.
    """
    return None, "fondamentaux indisponibles"


def _note_crypto(details: dict) -> tuple[float | None, str]:
    """
    La qualité d'une cryptomonnaie : son ancienneté de cotation, et rien d'autre.

    Aucune capitalisation, aucune profondeur de marché, aucune mesure de
    concentration de détention n'est disponible. Un actif qui a traversé plusieurs
    cycles est en revanche objectivement différent d'un actif de six mois, et cette
    donnée-là existe.
    """
    seances = details.get("seances")
    if not seances:
        return None, "ancienneté inconnue"
    note = note_decroissante(float(seances), ANCIENNETE_SOLIDE, ANCIENNETE_FAIBLE)
    return note, f"{int(seances)} séances d'historique"


def qualite_actifs(poids: dict[str, float], details: dict[str, dict],
                   nature: dict[str, str],
                   frais_par_ligne: dict[str, float] | None = None) -> Metrique:
    """
    La qualité moyenne des actifs détenus, pondérée par leur poids.

    Chaque ligne est jugée selon son type ; les lignes non jugeables sortent de la
    moyenne et abaissent la couverture. Une action sans fondamentaux ne vaut pas zéro
    — elle vaut « pas mesurée », et la confiance le dit.
    """
    total = sum(w for w in poids.values() if w > 0)
    cumul = couvert = 0.0
    detail: list[str] = []

    for ticker, w in poids.items():
        if w <= 0:
            continue
        d = details.get(ticker) or {}
        genre = nature.get(ticker)
        if genre == "fonds":
            note, _ = _note_fonds(d, (frais_par_ligne or {}).get(ticker))
        elif genre == "crypto":
            note, _ = _note_crypto(d)
        elif genre == "actif":
            note, _ = _note_action(d)
        else:
            note = None
        if note is not None:
            cumul += w * note
            couvert += w
            detail.append(f"{ticker} {note:.0f}")

    couverture = (couvert / total) if total > 0 else 0.0
    valeur = (cumul / couvert) if (couvert > 0 and couverture >= 0.60) else None

    return Metrique(
        cle="qualite_actifs",
        libelle="Qualité des actifs",
        score=valeur,
        statut=("indisponible" if valeur is None
                else "disponible" if couverture >= 0.999 else "partiel"),
        poids=100.0,
        valeur=round(valeur, 1) if valeur is not None else None,
        lecture=(" · ".join(detail[:4]) if valeur is not None
                 else "qualité non jugeable sur les données disponibles"),
        couverture=couverture,
        explication=(
            "Chaque ligne est jugée selon son type : frais et étendue interne pour un "
            "fonds, ancienneté de cotation pour une cryptomonnaie. Les actions ne sont "
            "pas notées — la source ne donne pas de fondamentaux fiables, et un score "
            "inventé aurait l'apparence d'une analyse."
        ),
    )
