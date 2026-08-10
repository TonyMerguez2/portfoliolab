"""
Les calendriers de banques centrales, lus directement à leur page officielle.

⚠️ **Pourquoi lire la page et non une interface de programmation.** Vérifié le
11 août 2026 : ni la Fed ni la BCE ne publient d'iCal ni de JSON pour ces
calendriers. Les douze occurrences de « ical » dans la page de la BCE sont des
morceaux de « criti**cal** » et « statist**ical** ». FRED, qui les agrège, exige une
clé d'interface — donc un compte à créer, ce que je ne fais pas à la place de
quelqu'un. Restent deux pages au balisage stable :

- la Fed range chaque réunion dans `fomc-meeting__month` et `fomc-meeting__date` ;
- la BCE emploie une liste de définitions, `<dt>date</dt><dd>libellé</dd>`.

⚠️ **Le risque d'un lecteur de page n'est pas de casser, c'est de se tromper sans le
dire.** Un balisage modifié fait échouer la lecture, ce qui est visible et sans
danger : on retombe sur le relevé écrit. Une lecture *partiellement* juste est le vrai
péril — une date sur dix mal comprise, affichée avec la même autorité que les autres.
D'où les validateurs plus bas, et le principe : en cas de doute sur l'ensemble, on
rejette l'ensemble.

⚠️ **La Fed refuse ce client, et on ne le contourne pas.** Mesuré le 11 août 2026 : la
page du FOMC rend 403 à `requests`, et 200 à `curl` avec **le même** agent — le corps du
403 est une page d'erreur sans le calendrier. Ce n'est donc pas notre nom qui est
refusé mais l'empreinte du client, c'est-à-dire une détection de robot. Se déguiser en
navigateur la contournerait ; on s'en abstient. Conséquence assumée : la BCE se
rafraîchit en ligne, le FOMC garde son relevé écrit — qui est vérifié, et que
`lire_fomc` reproduit au jour près sur les onze dates à venir. La tentative reste
quotidienne : si la Fed change de politique, la lecture reprendra d'elle-même.

⚠️ **Ce module a corrigé mon propre relevé.** Écrit à la main depuis une transcription
de la même page, ce relevé avait perdu la réunion des 3-4 février 2027 : l'outil de
résumé qui m'avait transcrit la page l'avait omise en silence. J'avais alors noté dans
le code que « la source n'annonce aucune réunion avant mars 2027 » — la source
l'annonçait, mon intermédiaire l'avait effacée. Une lecture mécanique de la page ne
fait pas ce genre d'oubli, et c'est son principal mérite face à moi.
"""

from __future__ import annotations

import logging
import re
from collections import Counter
from datetime import date

logger = logging.getLogger(__name__)

URL_FOMC = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
URL_BCE = "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html"

#: Un agent nommé plutôt qu'anonyme : plusieurs sites publics refusent les requêtes
#: sans agent, et se présenter coûte moins qu'un contournement.
AGENT = "Novac/1.0 (calendrier macroéconomique ; lecture des pages publiques)"

_MOIS = {m[:3]: i for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June", "July", "August",
     "September", "October", "November", "December"], 1)}

#: Les jours de semaine plausibles pour une décision, du mardi au jeudi.
#:
#: ⚠️ **Pas « mercredi » pour la Fed, et c'est une correction.** J'avais posé cet
#: invariant en test, et la lecture des 56 réunions publiées l'a démenti : le
#: 7 novembre 2024 est un **jeudi**. La Fed avait décalé sa réunion à cause de
#: l'élection présidentielle du 5 novembre. Le prochain cas tombera en 2028.
#: Un validateur strict aurait rejeté une date parfaitement réelle, et l'aurait fait
#: précisément l'année où le calendrier sort de l'ordinaire.
JOURS_PLAUSIBLES = frozenset({1, 2, 3})

#: Combien de décisions par année civile complète. Mesuré : exactement huit pour
#: chacune des années 2021 à 2027, à la Fed comme à la BCE. C'est le contrôle le plus
#: solide contre une lecture partielle — bien plus que le jour de la semaine.
DECISIONS_PAR_AN = (6, 10)


def lire_fomc(html: str) -> list[str]:
    """
    Les dates de décision du FOMC, lues dans la page de la Fed.

    ⚠️ **Le second jour de la réunion**, celui de l'annonce. « 27-28 » rend le 28.
    Retenir le premier ferait attendre la décision la veille.

    Trois formes relevées dans la page réelle, et chacune casserait une lecture naïve :

    - « 17-18* » : l'astérisque marque les projections économiques, pas une date ;
    - « 22 (notation vote) » : un vote par correspondance, pas une réunion — écarté ;
    - « Apr/May » avec « 30-1 » : la réunion chevauche deux mois, et le second jour est
      dans le second. Une lecture qui prendrait toujours le premier mois placerait
      cette décision le 1er avril, un mois trop tôt.

    ⚠️ **Les années ne sont pas dans l'ordre du document** : la page présente 2026,
    puis 2025 à 2021, puis 2027. On suit donc le titre d'année qui *précède* chaque
    réunion, au lieu de supposer une chronologie.
    """
    plat = re.sub(r"\s+", " ", html)
    annee: int | None = None
    dates: list[str] = []

    for jeton in re.finditer(
        r">(?P<an>\d{4}) FOMC Meetings<"
        r"|fomc-meeting__month[^>]*>\s*<strong>(?P<mois>[^<]*)</strong>"
        r".*?fomc-meeting__date[^>]*>(?P<jours>[^<]*)<", plat
    ):
        if jeton.group("an"):
            annee = int(jeton.group("an"))
            continue
        if annee is None:
            continue
        jours = jeton.group("jours").replace("*", "").strip()
        if "(" in jours or "-" not in jours:
            continue
        try:
            debut, fin = (int(x) for x in jours.split("-", 1))
        except ValueError:
            continue
        parties = [p.strip() for p in jeton.group("mois").split("/")]
        # Réunion à cheval sur deux mois quand le second jour est le plus petit.
        chevauche = fin < debut
        mois = _MOIS.get((parties[-1] if chevauche else parties[0])[:3])
        if not mois:
            continue
        # Et à cheval sur deux **années** quand ce second mois est janvier.
        an = annee + 1 if chevauche and mois == 1 else annee
        try:
            dates.append(date(an, mois, fin).isoformat())
        except ValueError:                                     # pragma: no cover
            continue
    return dates


def lire_bce(html: str) -> list[str]:
    """
    Les dates de décision du Conseil des gouverneurs, lues dans la page de la BCE.

    ⚠️ Trois familles cohabitent dans la même liste, et deux ne décident rien : les
    réunions **non** monétaires et les Conseils généraux. Filtrer sur « monetary
    policy » sans exclure « non-monetary » aurait retenu les deux, la seconde
    contenant la première comme sous-chaîne — cinq fausses décisions sur la page
    réelle.

    ⚠️ On ne garde que le jour 2 : la réunion siège mercredi et jeudi, la décision et
    la conférence de presse tombent le jeudi.
    """
    plat = re.sub(r"\s+", " ", html)
    dates: list[str] = []
    for j, m, a, brut in re.findall(
        r"<dt>\s*(\d{2})/(\d{2})/(\d{4})\s*</dt>\s*<dd>(.*?)</dd>", plat
    ):
        texte = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", brut)).strip().lower()
        if "non-monetary" in texte or "general council" in texte:
            continue
        if "monetary policy meeting" not in texte or "(day 2)" not in texte:
            continue
        try:
            dates.append(date(int(a), int(m), int(j)).isoformat())
        except ValueError:                                     # pragma: no cover
            continue
    return dates


def valider(dates: list[str], nom: str) -> list[str] | None:
    """
    Les dates retenues, ou `None` si l'ensemble n'est pas digne de confiance.

    ⚠️ **Tout ou rien, volontairement.** Un lecteur de page qui rend neuf dates justes
    et une fausse est plus dangereux qu'un lecteur qui échoue : la fausse s'affiche
    avec la même autorité que les autres. Quand un contrôle d'ensemble tombe, on rejette
    tout et on retombe sur le relevé écrit, qui est vérifié.

    Trois contrôles, dans l'ordre de leur force :

    1. **le compte par année civile complète** — huit décisions, mesuré sur sept années
       consécutives des deux institutions. C'est ce qui attrape une lecture partielle ;
    2. **l'unicité des dates** — deux fois la même trahit un balisage mal découpé. Pas
       leur ordre : la page de la Fed présente ses années dans le désordre ;
    3. **le jour de la semaine**, du mardi au jeudi. Le plus faible des trois : le
       7 novembre 2024 était un jeudi, la Fed ayant décalé sa réunion pour l'élection.
       Il sert de dernier filet, pas de règle.
    """
    if not dates:
        logger.warning("calendrier %s : aucune date lue, la page a dû changer", nom)
        return None

    # ⚠️ On **trie** au lieu d'exiger un ordre, et c'est mon propre défaut qui l'impose.
    # J'avais écrit dans ce fichier que la page de la Fed présente 2026, puis 2025 à
    # 2021, puis 2027 — et posé dix lignes plus bas un contrôle « dates croissantes »
    # qui rejetait pour cette raison même les 56 dates réelles. L'ordre du document
    # n'est pas une garantie de qualité ; l'unicité en est une.
    if len(set(dates)) != len(dates):
        doubles = sorted({d for d in dates if dates.count(d) > 1})
        logger.warning("calendrier %s : date(s) répétée(s) %s, rejeté", nom, doubles)
        return None
    dates = sorted(dates)

    hors = [d for d in dates if date.fromisoformat(d).weekday() not in JOURS_PLAUSIBLES]
    if hors:
        logger.warning("calendrier %s : %d date(s) hors du milieu de semaine (%s), "
                       "rejeté", nom, len(hors), ", ".join(hors[:3]))
        return None

    # ⚠️ Seules les années **complètes** sont comptées. L'année en cours n'a plus que
    # ses réunions à venir si la page ne montre pas le passé, et la dernière année
    # publiée peut être partielle : les compter aurait fait échouer la validation
    # chaque mois de janvier.
    annees = Counter(d[:4] for d in dates)
    bornes = (min(annees), max(annees))
    for an, n in sorted(annees.items()):
        if an in bornes:
            continue
        if not DECISIONS_PAR_AN[0] <= n <= DECISIONS_PAR_AN[1]:
            logger.warning("calendrier %s : %s décisions en %s, hors de %s — rejeté",
                           nom, n, an, DECISIONS_PAR_AN)
            return None
    return dates


def telecharger(url: str, delai: float = 12.0) -> str | None:
    """La page, ou rien. Toute erreur vaut absence : l'appelant a un repli."""
    try:
        import requests
        r = requests.get(url, headers={"User-Agent": AGENT}, timeout=delai)
        r.raise_for_status()
        return r.text
    except Exception as e:                                     # pragma: no cover
        logger.warning("page %s illisible (%s : %s)", url, type(e).__name__, e)
        return None


#: Les deux séries lues en ligne : la zone, le libellé, l'adresse et le lecteur.
SERIES = (
    ("USA", "Décision de la Fed · FOMC", URL_FOMC, lire_fomc),
    ("Zone euro", "Décision de la BCE · Conseil des gouverneurs", URL_BCE, lire_bce),
)


def decisions_en_ligne() -> dict[str, list[str]]:
    """
    Les dates de décision de chaque zone, lues et validées. Une zone absente du
    résultat n'a pas pu être lue, et son relevé écrit doit servir de repli.
    """
    sorties: dict[str, list[str]] = {}
    for zone, _libelle, url, lecteur in SERIES:
        html = telecharger(url)
        if not html:
            continue
        if retenues := valider(lecteur(html), zone):
            sorties[zone] = retenues
    return sorties
