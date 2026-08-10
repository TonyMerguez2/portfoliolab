"""
Les événements à venir d'un portefeuille : résultats, dividendes, macro.

⚠️ **Ce que la source sait, et ce qu'elle ignore.** Relevé sur de vrais titres
avant d'écrire une ligne :

- une **action** — AAPL, MSFT, TSLA — donne sa prochaine date de résultats, ses
  estimations d'EPS, ses vingt-cinq derniers trimestres avec le pourcentage de
  surprise, sa date de détachement et sa date de versement ;
- un **ETF** — ESE.PA, ETZ.PA, PAEJ.PA, CW8.PA — ne donne **rien** : calendrier
  vide, zéro versement recensé. Ce n'est pas une panne, c'est l'absence de
  publication de ce type pour ces instruments chez le fournisseur ;
- une **crypto** ne donne rien non plus, et c'est normal : il n'y a ni résultats
  trimestriels ni dividende.

Un portefeuille intégralement composé d'ETF ou de crypto rend donc une liste
vide. C'est une réponse juste, et l'appelant reçoit `sans_donnees` pour pouvoir
le dire plutôt que d'afficher un cadre muet.

⚠️ **Rien n'est inventé ici.** L'onglet qui précédait affichait « Résultats
trimestriels » pour chaque ligne du portefeuille, avec un « J+3, J+6, J+9 »
calculé depuis l'indice de la liste — des dates qui ne venaient de nulle part.
Une date absente vaut mieux qu'une date fausse.
"""

from __future__ import annotations

import json
import logging
import math
import os
import re
import time
from dataclasses import asdict, dataclass
from datetime import date, datetime
from typing import Any, Literal
from zoneinfo import ZoneInfo

import yfinance as yf

from app.services.proxies import proxys_pour

logger = logging.getLogger(__name__)

Nature = Literal["resultats", "dividende", "economique"]


@dataclass
class Evenement:
    """Un événement daté, tel que l'interface le consomme."""
    nature: Nature
    date: str
    libelle: str
    ticker: str | None = None
    """Position dans la journée, quand la source la donne."""
    moment: str | None = None
    """Jours d'ici là. Négatif pour un événement passé, absent des listes « à venir »."""
    jours: int | None = None
    montant: float | None = None
    devise: str | None = None
    """Rendement du versement, en pourcentage du cours."""
    rendement: float | None = None
    eps_estime: float | None = None
    """
    Le fonds par lequel cette échéance concerne le portefeuille.

    Renseigné pour les événements vus **par transparence** : un ETF ne publie pas
    de résultats, mais les sociétés qu'il détient en publient, et c'est bien le
    portefeuille qu'elles remuent.
    """
    via: str | None = None
    """Part du portefeuille exposée à cette échéance, en pourcentage."""
    exposition: float | None = None
    """
    Le nom de la société, quand le ticker seul ne dit rien.

    ⚠️ Indispensable par transparence : les lignes d'un fonds asiatique sortent en
    « 0700.HK » et « 000660.KS », qui ne désignent rien pour un lecteur — alors que
    « Tencent » et « SK Hynix » se reconnaissent. La composition rend ce nom, il
    serait dommage de le jeter.
    """
    nom_societe: str | None = None

    #: Le code du drapeau à afficher, pour les seules échéances macroéconomiques.
    #:
    #: ⚠️ Un code de deux lettres — « us », « eu » — et non une URL ni un emoji.
    #: L'interface a déjà ses fichiers dans `public/drapeaux`, ceux des places
    #: boursières des cartes d'actifs : laisser le serveur choisir l'image aurait
    #: dédoublé l'iconographie, et un emoji n'aurait pas le même dessin sur deux
    #: systèmes.
    pays: str | None = None

    #: D'où vient cette échéance : « relevé » ou « flux ».
    #:
    #: ⚠️ Affichée, et pas seulement enregistrée. Les deux origines n'ont pas la même
    #: garantie : le relevé vient d'une page officielle, porte son heure et va jusqu'à
    #: fin 2027 ; le flux tient quatre semaines, sans décision de banque centrale et
    #: avec des dates parfois indicatives. Mélanger les deux sans le dire aurait donné
    #: à l'un le crédit de l'autre.
    source: str | None = None


# ── Calendrier macroéconomique ───────────────────────────────────────────────
#
# Relevé le 10 août 2026 aux sources officielles :
#   FOMC  https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
#   PCE   https://www.bea.gov/news/schedule
#   IPC   https://www.bls.gov/schedule/news_release/cpi.htm
#
# Format : (date ISO, libellé, zone, heure « HH:MM » ou None).
#
# ⚠️ **L'heure est celle de la zone qui publie**, et le fuseau correspondant est dans
# `ZONES`. Elle valait « New York » tant que le calendrier était américain ; l'écrire
# encore aujourd'hui décalerait de six heures la première publication européenne à
# laquelle on donnerait une heure.
#
# ⚠️ **L'heure n'est jamais déjà convertie dans le fuseau du lecteur.**
# L'écart avec l'Europe n'est pas constant : les deux continents ne changent pas
# d'heure le même week-end — les États-Unis début novembre, l'Europe fin octobre —
# donc il vaut cinq heures pendant une semaine et six le reste de l'année.
# Convertir ici aurait figé un décalage faux pour les publications de fin
# octobre, dont il y a une par an dans chaque série.
#
# ⚠️ **Trois séries, trois horizons, et ce n'est pas une négligence.**
#
# Le FOMC est annoncé jusqu'à fin 2027, et sa page précise que « chaque date
# reste indicative jusqu'à confirmation par la réunion qui la précède ». Aucune
# heure n'y est donnée : le communiqué tombe traditionnellement à 14 h à New York,
# mais la source ne l'écrit pas, donc ce champ reste vide plutôt que d'affirmer.
#
# Le PCE est publié par le BEA jusqu'aux chiffres de novembre 2026.
#
# L'IPC s'arrête à septembre 2026, et **le BLS lui-même ne sait pas encore la
# suite** : les interruptions budgétaires de 2025 et 2026 ont décalé ses
# publications, il a renoncé à certaines données d'octobre 2025, et il annonce que
# « les dates révisées seront publiées au fur et à mesure ». Les calendriers
# financiers tiers qui affichent la suite le font par extrapolation du rythme
# habituel — deuxième semaine du mois — et le disent. Extrapoler ici aurait produit
# des dates d'apparence officielle et sans fondement, sur la seule série que
# l'actualité a justement dérangée.
CALENDRIER_MACRO: list[tuple[str, str, str, str | None]] = [
    # Indice des prix à la consommation — BLS, 8 h 30 à New York.
    ("2026-08-12", "Indice des prix à la consommation (juillet)", "USA", "08:30"),
    ("2026-09-11", "Indice des prix à la consommation (août)", "USA", "08:30"),

    # Revenus et dépenses des ménages, qui portent l'indice PCE — BEA, 8 h 30.
    ("2026-08-26", "Revenus et dépenses des ménages · PCE (juillet)", "USA", "08:30"),
    ("2026-09-30", "Revenus et dépenses des ménages · PCE (août)", "USA", "08:30"),
    ("2026-10-29", "Revenus et dépenses des ménages · PCE (septembre)", "USA", "08:30"),
    ("2026-11-25", "Revenus et dépenses des ménages · PCE (octobre)", "USA", "08:30"),
    ("2026-12-23", "Revenus et dépenses des ménages · PCE (novembre)", "USA", "08:30"),

    # Réunions du FOMC : la date retenue est le **second** jour, celui de la
    # décision. Annoncer le premier ferait attendre l'annonce la veille.
    ("2026-09-16", "Décision de la Fed · FOMC", "USA", None),
    ("2026-10-28", "Décision de la Fed · FOMC", "USA", None),
    ("2026-12-09", "Décision de la Fed · FOMC", "USA", None),
    ("2027-01-27", "Décision de la Fed · FOMC", "USA", None),
    ("2027-03-17", "Décision de la Fed · FOMC", "USA", None),
    ("2027-04-28", "Décision de la Fed · FOMC", "USA", None),
    ("2027-06-09", "Décision de la Fed · FOMC", "USA", None),
    ("2027-07-28", "Décision de la Fed · FOMC", "USA", None),
    ("2027-09-15", "Décision de la Fed · FOMC", "USA", None),
    ("2027-10-27", "Décision de la Fed · FOMC", "USA", None),
    ("2027-12-08", "Décision de la Fed · FOMC", "USA", None),

    # ── Zone euro ────────────────────────────────────────────────────────────
    #
    # Relevé le 10 août 2026 :
    #   BCE       https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html
    #   Inflation https://www.ecb.europa.eu/press/calendars/statscal/ges/html/sthicp.en.html
    #
    # ⚠️ **Aucune heure, et pour la même raison que le FOMC.** La page de la BCE
    # écrit « followed by press conference » sans horaire, et le calendrier de
    # publication d'Eurostat est rendu en JavaScript — sa page ne contient aucune
    # date en clair. Les sources tierces annoncent 14 h 15 pour la décision et 11 h
    # pour l'inflation ; c'est probablement juste, ce n'est pas relevé, donc ce
    # champ reste vide.
    #
    # ⚠️ **La date retenue est le second jour**, celui de la décision, comme pour le
    # FOMC. Le Conseil des gouverneurs siège mercredi et jeudi et décide le jeudi ;
    # le FOMC siège mardi et mercredi et décide le mercredi. C'est ce qui explique
    # que le 28 octobre 2026 soit à la fois une décision de la Fed et le premier
    # jour de la BCE : les deux institutions se réunissent la même semaine, pas le
    # même jour. J'ai d'abord pris cette coïncidence pour une erreur de relevé.
    #
    # ⚠️ **J'ai d'abord manqué la réunion des 3-4 février 2027, et j'ai eu tort de
    # conclure qu'elle n'existait pas.** J'avais noté ici que « la page n'annonce aucune
    # réunion avant mars 2027 », en m'appuyant sur une transcription qui l'avait omise
    # en silence — sept réunions au lieu de huit, ce qui m'avait d'ailleurs paru
    # suspect. La lecture mécanique de la même page, dans
    # `calendriers_officiels.lire_bce`, l'a retrouvée : jour 1 le mercredi 3, jour 2 le
    # jeudi 4. Le raisonnement — ne pas ajouter une date par symétrie — était bon ; la
    # prémisse était fausse. D'où ce module qui lit la page lui-même.
    ("2026-09-10", "Décision de la BCE · Conseil des gouverneurs", "Zone euro", None),
    ("2026-10-29", "Décision de la BCE · Conseil des gouverneurs", "Zone euro", None),
    ("2026-12-17", "Décision de la BCE · Conseil des gouverneurs", "Zone euro", None),
    ("2027-02-04", "Décision de la BCE · Conseil des gouverneurs", "Zone euro", None),
    ("2027-03-18", "Décision de la BCE · Conseil des gouverneurs", "Zone euro", None),
    ("2027-04-29", "Décision de la BCE · Conseil des gouverneurs", "Zone euro", None),
    ("2027-06-10", "Décision de la BCE · Conseil des gouverneurs", "Zone euro", None),
    ("2027-07-22", "Décision de la BCE · Conseil des gouverneurs", "Zone euro", None),
    ("2027-09-09", "Décision de la BCE · Conseil des gouverneurs", "Zone euro", None),
    ("2027-10-28", "Décision de la BCE · Conseil des gouverneurs", "Zone euro", None),
    ("2027-12-16", "Décision de la BCE · Conseil des gouverneurs", "Zone euro", None),

    # Estimation rapide de l'inflation — Eurostat, fin du mois de référence.
    #
    # Les dates viennent du calendrier statistique de la BCE, qui publie sa propre
    # version désaisonnalisée le même jour. Corroborées par les publications passées
    # d'Eurostat, dont l'adresse encode la date : « 2-31072026-ap » pour juillet,
    # « 2-01072026-ap » pour juin, « 2-02062026-ap » pour mai — trois dates qui
    # tombent exactement sur celles annoncées.
    ("2026-09-01", "Inflation · estimation rapide (IPCH, août)", "Zone euro", None),
    ("2026-10-02", "Inflation · estimation rapide (IPCH, septembre)", "Zone euro", None),
    ("2026-11-04", "Inflation · estimation rapide (IPCH, octobre)", "Zone euro", None),
    ("2026-12-01", "Inflation · estimation rapide (IPCH, novembre)", "Zone euro", None),
    ("2027-01-06", "Inflation · estimation rapide (IPCH, décembre)", "Zone euro", None),
]

#: Le drapeau et le fuseau de chaque zone du calendrier.
#:
#: ⚠️ Le fuseau est là bien qu'aucune entrée européenne ne porte encore d'heure. Ce
#: n'est pas de la généralité gratuite : sans lui, la première heure ajoutée à une
#: ligne « Zone euro » serait lue dans le fuseau de New York et annoncée six heures
#: trop tard, sans qu'aucune erreur ne se déclare. Le piège est fermé maintenant
#: qu'il existe une zone pour le tendre.
#:
#: ⚠️ « Zone euro » et non « Europe » : l'ETF STOXX Europe 600 détenu ici contient
#: Novartis, Roche et Nestlé (Suisse), HSBC, AstraZeneca et Shell (Royaume-Uni) —
#: que ni la BCE ni l'IPCH ne concernent. Étiqueter ces dates « Europe » aurait
#: promis une couverture qu'elles n'ont pas.
@dataclass(frozen=True)
class Zone:
    """Une zone géographique du calendrier macroéconomique."""

    #: Le code ISO à deux lettres du drapeau.
    #:
    #: ⚠️ Renseigné pour **toutes** les zones depuis que l'interface tire ses drapeaux
    #: d'un jeu de 261 pays au lieu des quinze fichiers du dossier `public/drapeaux`.
    #: Trois zones s'affichaient sans drapeau faute de fichier — Taïwan et la Corée,
    #: c'est-à-dire les deux premières expositions asiatiques d'un vrai PEA. Le champ
    #: reste une chaîne libre et l'interface garde son repli : un code absent du jeu ne
    #: dessine rien du tout, donc mieux vaut une pastille qu'un trou.
    drapeau: str
    #: Le fuseau dans lequel les heures de cette zone sont exprimées.
    fuseau: str
    #: Le code de région du flux Yahoo, quand il en a un pour cette zone.
    region: str


ZONES: dict[str, Zone] = {
    # Les zones du relevé à la main.
    "USA": Zone("us", "America/New_York", "US"),
    "Zone euro": Zone("eu", "Europe/Brussels", "EU"),
    # Celles que seul le flux alimente. Le fuseau sert à lire l'heure qu'il donne.
    "Taïwan": Zone("tw", "Asia/Taipei", "TW"),
    "Corée du Sud": Zone("kr", "Asia/Seoul", "KR"),
    "Chine": Zone("cn", "Asia/Shanghai", "CN"),
    "Hong Kong": Zone("hk", "Asia/Hong_Kong", "HK"),
    "Singapour": Zone("sg", "Asia/Singapore", "SG"),
    "Japon": Zone("jp", "Asia/Tokyo", "JP"),
    "Inde": Zone("in", "Asia/Kolkata", "IN"),
    "Royaume-Uni": Zone("gb", "Europe/London", "GB"),
    "Suisse": Zone("ch", "Europe/Zurich", "CH"),
    "France": Zone("fr", "Europe/Paris", "FR"),
    "Allemagne": Zone("de", "Europe/Berlin", "DE"),
    "Espagne": Zone("es", "Europe/Madrid", "ES"),
    "Italie": Zone("it", "Europe/Rome", "IT"),
    "Pays-Bas": Zone("nl", "Europe/Amsterdam", "NL"),
    "Canada": Zone("ca", "America/Toronto", "CA"),
    "Australie": Zone("au", "Australia/Sydney", "AU"),
    # ⚠️ Sans ces zones, une région déduite d'un ticker n'aurait aucun nom et le flux
    # l'aurait écartée en silence : le portefeuille aurait paru ne rien devoir à un
    # pays dont il détient le plus gros titre. Un test le vérifie désormais.
    #
    # ⚠️ Leurs drapeaux existent tous — un test côté interface lit ces codes dans ce
    # fichier même et vérifie que le jeu de drapeaux les connaît. Sans ce test, une
    # coquille ici ne dessinerait simplement rien à l'écran.
    "Belgique": Zone("be", "Europe/Brussels", "BE"),
    "Finlande": Zone("fi", "Europe/Helsinki", "FI"),
    "Portugal": Zone("pt", "Europe/Lisbon", "PT"),
    "Autriche": Zone("at", "Europe/Vienna", "AT"),
    "Irlande": Zone("ie", "Europe/Dublin", "IE"),
    "Danemark": Zone("dk", "Europe/Copenhagen", "DK"),
    "Suède": Zone("se", "Europe/Stockholm", "SE"),
    "Norvège": Zone("no", "Europe/Oslo", "NO"),
}

#: De la région du flux vers le nom de zone, pour ne pas afficher « TW » brut.
ZONE_PAR_REGION: dict[str, str] = {z.region: nom for nom, z in ZONES.items()}


# ── Flux macroéconomique automatique ─────────────────────────────────────────
#
# `yfinance` expose un calendrier macro mondial. Mesuré sur 1 035 lignes réelles
# avant d'écrire une ligne de code, du 10 août au 7 septembre 2026 :
#
# - **Il confirme le relevé à la main** là où les deux se recoupent : IPC américain
#   le 12 août, PCE le 26 août, aux dates exactes du BLS et du BEA.
# - **Son horizon est d'environ quatre semaines.** Demandé jusqu'au 20 septembre, il
#   s'arrête au 7. Il ne peut donc pas remplacer le relevé, qui va jusqu'à fin 2027.
# - **Il ne contient aucune décision de banque centrale utile** : trois décisions de
#   taux dans 1 035 lignes, pour l'Égypte, la Norvège et la Roumanie. Ni la Fed ni la
#   BCE. Les deux dates qui remuent le plus les marchés n'y sont pas.
# - **71 % des libellés portent un astérisque**, et le même événement est annoncé
#   jusqu'à huit jours de suite — « SA CPI MM* » pour la même période de référence.
#   Ces dates ne sont pas connues ; en retenir une aurait inventé une précision.
# - **63 régions**, dominées par l'Ouganda, Bahreïn et Oman. Sans filtre, la liste
#   d'un PEA parlerait du solde budgétaire omanais.
# - Il donne bien des heures, en UTC. Je l'avais d'abord cru dépourvu d'heures : mon
#   premier échantillon était à 00:00 par hasard.
#
# D'où le partage : le relevé tient les rendez-vous structurels et lointains, le flux
# apporte la largeur sur quatre semaines — Taïwan, la Corée, la Chine, que personne ne
# maintiendrait à la main. Chaque échéance dit d'où elle vient.

#: Les familles d'indicateurs retenues, et leur nom en français.
#:
#: ⚠️ Une **liste blanche**, pas une liste noire. Le flux compte des centaines de
#: types d'événements ; en exclure les mauvais aurait laissé passer tout ce que je
#: n'ai pas vu passer. Ici, ce qui n'est pas reconnu n'est pas affiché.
#:
#: Les motifs reconnaissent l'anglais du flux **et** le français du relevé : la même
#: fonction classe les deux, ce qui permet au relevé de primer sur le flux pour un
#: même indicateur le même jour.
FAMILLES_MACRO: list[tuple[str, str]] = [
    (r"\bPCE\b", "Inflation · PCE"),
    (r"\bCPI\b|\bHICP\b|prix à la consommation|estimation rapide", "Inflation · IPC"),
    (r"Rate Decision|Fed Funds|Refi Rate|Deposit Rate|Policy Rate|Bank Rate"
     r"|Décision de la|FOMC", "Décision de taux"),
    (r"Non-?Farm|Payrolls|Unemployment Rate|Jobless Claims", "Emploi"),
    (r"\bGDP\b|\bPIB\b", "Croissance · PIB"),
    (r"\bPMI\b|\bISM\b", "Activité · PMI"),
    (r"Retail Sales", "Consommation · ventes de détail"),
]

#: Du suffixe de cotation vers la région du flux.
#:
#: ⚠️ Un ticker **sans** suffixe n'est américain que s'il est alphabétique. Les lignes
#: d'un fonds asiatique sortent en « 005935 » et « 00939 » — Samsung préférentielle et
#: China Construction Bank — qui n'ont pas de suffixe et ne sont pas américaines.
#: Sans ce garde, la Corée et la Chine auraient été comptées comme les États-Unis.
#: ⚠️ Les places nordiques et les petites places de la zone euro y figurent parce que
#: leur absence était un **oubli silencieux**, trouvé en vérifiant : Novo Nordisk
#: (Copenhague), AB InBev (Bruxelles), Atlas Copco (Stockholm), Nokia (Helsinki),
#: Equinor (Oslo) ne renvoyaient aucune région. Ce sont des poids lourds d'un STOXX
#: Europe 600 ; les détenir aurait fait perdre leur macro sans qu'aucune erreur ne
#: le signale — le fonds aurait simplement paru ne concerner aucun pays.
SUFFIXE_REGION: dict[str, str] = {
    # Asie-Pacifique
    "TW": "TW", "KS": "KR", "KQ": "KR", "HK": "HK", "SS": "CN", "SZ": "CN",
    "T": "JP", "SI": "SG", "NS": "IN", "BO": "IN", "AX": "AU",
    # Zone euro
    "PA": "FR", "AS": "NL", "DE": "DE", "F": "DE", "MC": "ES", "MI": "IT",
    "BR": "BE", "HE": "FI", "LS": "PT", "VI": "AT", "IR": "IE",
    # Europe hors zone euro
    "L": "GB", "SW": "CH", "CO": "DK", "ST": "SE", "OL": "NO",
    # Amérique du Nord
    "TO": "CA", "V": "CA",
}

#: Les régions dont les publications de la zone euro concernent aussi le lecteur.
#:
#: ⚠️ La Suisse, le Royaume-Uni, le Danemark, la Suède et la Norvège n'y sont pas : ni
#: la BCE ni l'IPCH ne les concernent, et les y mettre aurait annoncé à un détenteur
#: de Nestlé une décision qui ne touche pas son titre.
ZONE_EURO: frozenset[str] = frozenset(
    {"FR", "DE", "ES", "IT", "NL", "BE", "FI", "PT", "AT", "IE"})

#: Combien de jours du flux on retient. Au-delà, il n'a plus rien à dire.
HORIZON_FLUX = 35

_TTL_FLUX = 6 * 3600


_TTL_OFFICIEL = 24 * 3600
_TTL_OFFICIEL_ECHEC = 3600


def decisions_officielles() -> dict[str, list[str]]:
    """
    Les dates de décision lues aux pages de la Fed et de la BCE, mises en cache.

    ⚠️ Un jour de cache, contre six heures pour le reste. Ces calendriers sont annoncés
    des années d'avance et ne bougent qu'exceptionnellement ; les relire toutes les six
    heures aurait sollicité deux sites publics des centaines de fois par mois pour une
    donnée qui change une fois par an.

    ⚠️ Un dictionnaire **vide** est une réponse valide : les pages sont injoignables ou
    n'ont pas passé la validation, et le relevé écrit prend le relais. C'est pourquoi
    ce relevé reste dans le fichier au lieu d'être remplacé.
    """
    cache = _charger()
    e = cache.get("decisions_officielles")
    if e and e.get("echeance", 0) > time.time() and e.get("version") == _VERSION:
        return e.get("zones") or {}

    from app.services.calendriers_officiels import decisions_en_ligne
    zones = decisions_en_ligne()
    cache["decisions_officielles"] = {
        "version": _VERSION, "zones": zones,
        "echeance": time.time() + (_TTL_OFFICIEL if zones else _TTL_OFFICIEL_ECHEC),
    }
    _ecrire()
    return zones


def calendrier_macro() -> list[tuple[str, str, str, str | None]]:
    """
    Le calendrier macro effectif : le relevé écrit, ses décisions rafraîchies en ligne.

    ⚠️ **Seules les décisions de banque centrale sont remplacées.** Ce sont les deux
    seules séries dont une page officielle donne la liste complète et lisible. Les
    publications d'indices — IPC, PCE, IPCH — n'ont pas d'équivalent gratuit et sans
    compte : elles restent au relevé.

    ⚠️ Le remplacement est **par zone**, pas global — et ce n'est pas une précaution
    théorique : c'est l'état de marche normal. La page de la Fed refuse notre client
    (403, voir `calendriers_officiels`), celle de la BCE nous sert. La zone euro se
    rafraîchit donc, les États-Unis gardent leur relevé écrit, et l'écran ne perd rien.
    Un remplacement global aurait fait perdre les deux séries pour un site sur deux.
    """
    en_ligne = decisions_officielles()
    if not en_ligne:
        return list(CALENDRIER_MACRO)

    garde: list[tuple[str, str, str, str | None]] = []
    for iso, libelle, zone, heure in CALENDRIER_MACRO:
        # Une décision d'une zone rafraîchie est jetée : la page vient de la donner.
        if zone in en_ligne and famille_macro(libelle) == "Décision de taux":
            continue
        garde.append((iso, libelle, zone, heure))

    from app.services.calendriers_officiels import SERIES
    libelles = {zone: libelle for zone, libelle, _, _ in SERIES}
    for zone, dates in en_ligne.items():
        for iso in dates:
            # ⚠️ Aucune heure, comme au relevé : ni la Fed ni la BCE n'en publient sur
            # ces pages. La lire en ligne ne rend pas disponible ce qui n'y est pas.
            garde.append((iso, libelles.get(zone, "Décision de politique monétaire"),
                          zone, None))
    garde.sort()
    return garde


def famille_macro(libelle: str) -> str | None:
    """La famille d'un indicateur, ou `None` s'il n'est pas dans la liste blanche."""
    for motif, nom in FAMILLES_MACRO:
        if re.search(motif, libelle, re.IGNORECASE):
            return nom
    return None


def region_du_ticker(ticker: str) -> str | None:
    """La région du flux correspondant à la place de cotation d'un ticker."""
    t = ticker.upper()
    # ⚠️ Une paire de cryptomonnaie n'a pas de pays. Le critère est la **devise de
    # cotation** et non le tiret : « BRK-B » en porte un et se traite bien à New York,
    # alors que « BTC-USD » ne se traite nulle part en particulier. Un test sur le
    # tiret seul aurait rendu apatride la moitié des actions à plusieurs catégories.
    if re.fullmatch(r"[A-Z0-9]+-(USD|EUR|GBP|JPY|CHF|USDT)", t):
        return None
    if "." in t:
        return SUFFIXE_REGION.get(t.rsplit(".", 1)[1])
    # ⚠️ Alphabétique seulement : « 005935 » n'est pas une valeur américaine.
    return "US" if t.replace("-", "").isalpha() else None


def regions_du_portefeuille(tickers: list[str]) -> set[str]:
    """
    Les régions dont la macroéconomie concerne réellement ces lignes.

    ⚠️ Déduites des tickers et non choisies : c'est ce qui fait que la macro
    taïwanaise apparaît dans un PEA d'ETF. Elle y a sa place parce que le fonds
    asiatique détient TSMC pour dix-sept pour cent — la même transparence qui
    justifie d'y annoncer les résultats de TSMC.
    """
    regions: set[str] = set()
    for tk in tickers:
        r = region_du_ticker(tk)
        if not r:
            continue
        regions.add(r)
        # Une valeur de la zone euro rend les publications de la zone pertinentes.
        if r in ZONE_EURO:
            regions.add("EU")
    return regions


#: Les mois et trimestres du flux, vers le français.
_PERIODES = {
    "jan": "janvier", "feb": "février", "mar": "mars", "apr": "avril",
    "may": "mai", "jun": "juin", "jul": "juillet", "aug": "août",
    "sep": "septembre", "oct": "octobre", "nov": "novembre", "dec": "décembre",
}


def periode_fr(pour: str | None) -> str | None:
    """
    « Aug » devient « août », « Q2 » devient « T2 », « Aug 8 » devient « 8 août ».

    ⚠️ Le jour compte, et c'est mon propre test qui l'a montré. En ne gardant que les
    trois premières lettres, « Aug 8 » et « Aug 15 » devenaient tous deux « août » :
    les inscriptions hebdomadaires au chômage passaient alors pour une même
    publication annoncée deux jours différents, donc pour une date inconnue, donc
    étaient écartées. La période de référence sert précisément à distinguer une série
    récurrente d'une date incertaine ; la tronquer détruisait cette distinction.
    """
    if not pour:
        return None
    p = str(pour).strip()
    if m := re.fullmatch(r"Q([1-4])", p, re.IGNORECASE):
        return f"T{m.group(1)}"
    if m := re.fullmatch(r"([A-Za-z]{3,})\.?\s+(\d{1,2})", p):
        if mois := _PERIODES.get(m.group(1)[:3].lower()):
            return f"{int(m.group(2))} {mois}"
        return p
    return _PERIODES.get(p[:3].lower(), p)


def jour_local(jour_utc: str, heure: str | None, fuseau: str) -> str:
    """
    Le jour de la publication **chez elle**, et non en temps universel.

    ⚠️ Mesuré sur le flux réel : l'emploi coréen est daté du 11 août à 23 h UTC, ce
    qui est le **12 à 8 h** à Séoul. Recopier la date UTC l'aurait annoncé la veille,
    et l'aurait fait manquer à qui filtre le calendrier sur le bon jour. L'erreur ne
    se voit que pour les zones à l'est, et seulement pour les publications du matin :
    c'est exactement le genre de décalage qui passe inaperçu en relecture.
    """
    if not heure:
        return jour_utc
    try:
        return datetime.fromisoformat(heure).astimezone(ZoneInfo(fuseau)).date().isoformat()
    except (ValueError, TypeError):                            # pragma: no cover
        return jour_utc


def retenir_du_flux(
    lignes: list[dict], regions: set[str], deja: set[tuple[str, str, str]],
    ref: date, horizon: int = HORIZON_FLUX,
) -> list[Evenement]:
    """
    Ce qu'on garde du flux : le tri, écrit à part pour être éprouvé sans réseau.

    `lignes` porte des dictionnaires `{region, evenement, jour, pour, heure}`.
    `deja` porte les triplets `(zone, date, famille)` déjà tenus par le relevé, qui
    prime : il a l'heure officielle et un libellé sourcé.

    Quatre filtres, tous motivés par une mesure du flux réel :

    1. la région doit concerner le portefeuille ;
    2. l'indicateur doit être dans la liste blanche ;
    3. une famille annoncée **plusieurs jours** pour la même période de référence est
       écartée : le flux ne connaît pas sa date, et huit jours d'affilée pour le même
       chiffre ne font pas huit événements ;
    4. le relevé prime sur le flux, sinon l'IPC américain du 12 août apparaîtrait
       deux fois — une fois avec son heure officielle, une fois sans.
    """
    fin = ref.toordinal() + horizon
    # Étape 1 : normaliser en (zone, jour, famille) et compter les jours par famille.
    retenues: dict[tuple[str, str, str], dict] = {}
    jours_par_famille: dict[tuple[str, str, str | None], set[str]] = {}

    for l in lignes:
        region = str(l.get("region") or "")
        zone = ZONE_PAR_REGION.get(region)
        brut = str(l.get("jour") or "")
        if not zone or region not in regions or not brut:
            continue
        # ⚠️ Le jour dans le fuseau de la zone, avant tout le reste : le
        # dédoublonnage, l'horizon et la comparaison au relevé doivent tous porter
        # sur la même date, celle que le lecteur verra.
        jour = jour_local(brut, l.get("heure"), ZONES[zone].fuseau)
        try:
            d = date.fromisoformat(jour)
        except ValueError:
            continue
        if not (ref.toordinal() <= d.toordinal() <= fin):
            continue
        fam = famille_macro(str(l.get("evenement") or ""))
        if not fam:
            continue
        periode = periode_fr(l.get("pour"))
        jours_par_famille.setdefault((zone, fam, periode), set()).add(jour)
        cle = (zone, jour, fam)
        if cle in deja:
            continue
        # La première ligne de la famille fixe l'heure ; les suivantes ne font que
        # confirmer le jour. Le flux en donne jusqu'à huit pour un même chiffre.
        retenues.setdefault(cle, {"periode": periode, "heure": l.get("heure")})

    # Étape 2 : écarter les familles dont la date n'est pas connue.
    evs: list[Evenement] = []
    for (zone, jour, fam), info in retenues.items():
        if len(jours_par_famille[(zone, fam, info["periode"])]) > 1:
            continue
        z = ZONES[zone]
        libelle = f"{fam} ({info['periode']})" if info["periode"] else fam
        evs.append(Evenement(
            nature="economique", date=jour, libelle=libelle, ticker=zone,
            moment=info["heure"], jours=date.fromisoformat(jour).toordinal() - ref.toordinal(),
            pays=z.drapeau or None, source="flux",
        ))
    evs.sort(key=lambda e: (e.date, e.ticker or ""))
    return evs


def familles_relevees(ref: date) -> set[tuple[str, str, str]]:
    """Les triplets `(zone, date, famille)` que le relevé à la main tient déjà."""
    deja: set[tuple[str, str, str]] = set()
    for iso, libelle, zone, _ in calendrier_macro():
        if iso < ref.isoformat():
            continue
        if fam := famille_macro(libelle):
            deja.add((zone, iso, fam))
    return deja


def _flux_macro(debut: str, fin: str) -> list[dict]:
    """
    Le calendrier macro du fournisseur, normalisé et mis en cache.

    ⚠️ Le fournisseur plafonne à cent lignes par requête et sert les dates de la plus
    lointaine à la plus proche. Il faut donc paginer, et une page vide est la seule
    fin de liste fiable — mesuré : 1 035 lignes pour quatre semaines, toutes régions.
    """
    cache = _charger()
    cle = f"flux_macro:{debut}:{fin}"
    e = cache.get(cle)
    if e and e.get("echeance", 0) > time.time() and e.get("version") == _VERSION:
        return e.get("lignes") or []

    res: dict = {"version": _VERSION, "abouti": False, "lignes": []}
    try:
        cal = yf.Calendars(start=debut, end=fin)
        brut: list[dict] = []
        for page in range(30):                      # 3 000 lignes : large de trois fois
            df = cal.get_economic_events_calendar(limit=100, offset=page * 100)
            if df is None or not len(df):
                break
            for evenement, r in df.iterrows():
                instant = r.get("Event Time")
                if _vide(instant):
                    # Sans date, la ligne ne peut rien dire : `NaT` arrive.
                    continue
                # ⚠️ 00:00 UTC vaut « heure inconnue » et non « minuit ». Aucun
                # institut ne publie à vingt heures à New York ; c'est le zéro du
                # fournisseur. Le rendre tel quel aurait annoncé des publications
                # nocturnes — et la veille au soir pour les lecteurs à l'ouest.
                nuit = instant.hour == 0 and instant.minute == 0
                brut.append({
                    "region": str(r.get("Region") or "").strip(),
                    "evenement": str(evenement).strip(),
                    "jour": instant.date().isoformat(),
                    "pour": None if _vide(r.get("For")) else str(r.get("For")).strip(),
                    "heure": None if nuit else instant.isoformat(),
                })
        res["lignes"] = brut
        res["abouti"] = True
    except Exception as exc:                                   # pragma: no cover
        logger.warning("flux macro indisponible (%s : %s)", type(exc).__name__, exc)

    res["echeance"] = time.time() + (_TTL_FLUX if res["abouti"] else _TTL_ECHEC)
    cache[cle] = res
    _ecrire()
    return res["lignes"]


def evenements_macro_du_flux(
    tickers: list[str], aujourdhui: date | None = None,
) -> list[dict]:
    """Les échéances macro du flux qui concernent ces lignes, prêtes pour l'interface."""
    ref = aujourdhui or date.today()
    regions = regions_du_portefeuille(tickers)
    if not regions:
        return []
    fin = date.fromordinal(ref.toordinal() + HORIZON_FLUX)
    lignes = _flux_macro(ref.isoformat(), fin.isoformat())
    evs = retenir_du_flux(lignes, regions, familles_relevees(ref), ref)
    return [asdict(e) for e in evs]

#: Jusqu'où le calendrier est **complet**, toutes séries confondues.
#:
#: ⚠️ La borne est celle de la série la plus courte, et non la plus longue. Le FOMC
#: va jusqu'à fin 2027 : retenir cette date laisserait croire qu'un mois de 2027
#: sans point n'a aucune échéance, alors qu'il en a probablement deux dont l'IPC.
#: L'aveu d'incomplétude vaut mieux qu'un calendrier qui paraît exhaustif.
PEREMPTION_MACRO: str | None = "2026-09-11"

#: Le fuseau des heures ci-dessus.
FUSEAU_PUBLICATION = "America/New_York"


# ── Cache disque ─────────────────────────────────────────────────────────────
#
# ⚠️ Sur disque, et non en mémoire. Le rechargement automatique d'uvicorn vide
# tout état de processus à chaque sauvegarde de fichier : un cache en mémoire
# disparaissait alors dix fois par heure de travail, et chaque disparition
# relançait une rafale d'appels au fournisseur — qui limite le débit. Le défaut a
# déjà été vécu sur le cache des fiches de titres.
_FICHIER = "cache_evenements.json"
#: ⚠️ Bougée de 1 à 2 quand la fiche a gagné `nom` et `genre`.
#:
#: L'oublier n'aurait rien cassé bruyamment : les fiches déjà en cache seraient
#: restées valides, sans nom de fonds, donc sans indice reconnu, donc sans
#: composition — et la transparence n'aurait simplement rien rendu pour les titres
#: déjà consultés. Un silence, pas une erreur : le pire des deux.
_VERSION = 2
_TTL = 6 * 3600
_TTL_ECHEC = 900
_memoire: dict[str, dict] = {}
_mtime: float | None = None


def _charger() -> dict[str, dict]:
    """Le cache, relu du disque si un autre processus l'a réécrit."""
    global _memoire, _mtime
    try:
        m = os.path.getmtime(_FICHIER)
    except OSError:
        return _memoire
    if _mtime == m:
        return _memoire
    try:
        with open(_FICHIER, encoding="utf-8") as f:
            brut = json.load(f)
        # Une version ancienne est **périmée**, pas jetée : ses dates restent
        # utiles le temps d'un nouvel appel, et les jeter provoquerait la rafale
        # que ce cache existe pour éviter.
        _memoire = {
            k: (v if v.get("version") == _VERSION else {**v, "echeance": 0})
            for k, v in brut.items()
        }
        _mtime = m
    except (OSError, ValueError) as e:
        logger.warning("cache événements illisible (%s)", e)
    return _memoire


def _ecrire() -> None:
    """Écriture atomique : un lecteur ne doit jamais voir un fichier à moitié écrit."""
    global _mtime
    tmp = f"{_FICHIER}.{os.getpid()}.tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(_memoire, f)
        os.replace(tmp, _FICHIER)
        _mtime = os.path.getmtime(_FICHIER)
    except OSError as e:
        logger.warning("cache événements non écrit (%s)", e)
        try:
            os.remove(tmp)
        except OSError:
            pass


def _vide(v: Any) -> bool:
    """Vrai pour ce que pandas rend quand il n'a rien : None, NaN, NaT, chaîne vide."""
    if v is None:
        return True
    # ⚠️ `v != v` reconnaît NaN **et** NaT sans importer pandas : ces deux valeurs sont
    # les seules à ne pas être égales à elles-mêmes. Un `isinstance(v, float)` aurait
    # manqué NaT, qui n'est pas un flottant et qui est ce que rend une date absente.
    if v != v:
        return True
    return isinstance(v, str) and not v.strip()


def _nombre(v: Any) -> float | None:
    """Un flottant utilisable, ou rien. `NaN` compte pour rien."""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) or math.isinf(f) else f


def _jour(v: Any) -> str | None:
    """Une date ISO à partir de ce que le fournisseur rend : date, datetime, liste."""
    if isinstance(v, (list, tuple)):
        # `Earnings Date` arrive parfois en fourchette de deux dates : la première
        # est l'échéance annoncée, la seconde la borne haute de l'estimation.
        return _jour(v[0]) if v else None
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, str) and len(v) >= 10:
        return v[:10]
    return None


def instant_publication(
    iso: str, heure: str | None, fuseau: str = FUSEAU_PUBLICATION,
) -> str | None:
    """
    Une heure locale de publication, rendue comme un instant daté et non un texte.

    ⚠️ Un instant, pour que le client l'affiche dans **son** fuseau. Envoyer
    « 08:30 » brut aurait fait lire l'heure de New York comme une heure locale, et
    annoncé une publication du matin à un lecteur européen pour qui elle tombe
    l'après-midi.

    ⚠️ Le fuseau est devenu un **paramètre** le jour où le calendrier a cessé d'être
    uniquement américain. Une estimation d'inflation de la zone euro tombe à 11 h à
    Bruxelles : la passer par le fuseau de New York l'aurait annoncée à 17 h à un
    lecteur parisien — l'erreur exactement inverse de celle que cette fonction
    existe pour empêcher.
    """
    if not heure:
        return None
    naif = datetime.fromisoformat(f"{iso}T{heure}:00")
    # `zoneinfo` applique la règle d'heure d'été propre à la date : c'est ce qui
    # rend juste la semaine où l'Amérique a changé d'heure et l'Europe pas encore.
    return naif.replace(tzinfo=ZoneInfo(fuseau)).isoformat()


def trimestre(iso: str) -> str:
    """Le libellé « T3 2026 » d'une date de publication.

    ⚠️ Le trimestre **publié** est celui qui précède : une société qui annonce fin
    octobre rend compte de juillet à septembre. Nommer le trimestre courant aurait
    fait annoncer des résultats non encore vécus.
    """
    d = date.fromisoformat(iso)
    t = (d.month - 1) // 3          # 0..3, trimestre en cours
    return f"T{t if t else 4} {d.year if t else d.year - 1}"


def _fiche(ticker: str) -> dict:
    """Ce que le fournisseur dit d'un titre, mis en cache."""
    cache = _charger()
    e = cache.get(ticker)
    if e and e.get("echeance", 0) > time.time() and e.get("version") == _VERSION:
        return e

    fiche: dict = {"version": _VERSION, "abouti": False}
    try:
        t = yf.Ticker(ticker)
        cal = t.calendar or {}
        if isinstance(cal, dict) and cal:
            fiche["resultats"] = _jour(cal.get("Earnings Date"))
            fiche["eps_estime"] = _nombre(cal.get("Earnings Average"))
            fiche["detachement"] = _jour(cal.get("Ex-Dividend Date"))
            fiche["versement"] = _jour(cal.get("Dividend Date"))
        info = t.info or {}
        # Le nom complet, pour reconnaître l'indice d'un fonds — voir
        # `proxys_pour`. Le nom abrégé est tronqué vers trente et un caractères et
        # perd justement le nom de l'indice.
        fiche["nom"] = info.get("longName") or info.get("shortName")
        fiche["genre"] = info.get("quoteType")
        fiche["dividende"] = _nombre(info.get("lastDividendValue")) \
            or _nombre(info.get("dividendRate"))
        fiche["cours"] = _nombre(info.get("regularMarketPrice")) \
            or _nombre(info.get("previousClose"))
        fiche["devise"] = info.get("currency")
        fiche["abouti"] = True
    except Exception as e:                                     # pragma: no cover
        # ⚠️ L'échec est **distingué** de l'absence, et gardé moins longtemps. Les
        # confondre ferait retenir « ce titre n'a pas d'événements » pendant six
        # heures pour une simple limitation de débit.
        logger.info("événements indisponibles pour %s (%s)", ticker, type(e).__name__)

    fiche["echeance"] = time.time() + (_TTL if fiche["abouti"] else _TTL_ECHEC)
    cache[ticker] = fiche
    _ecrire()
    return fiche


# ── Réaction du cours à une publication ──────────────────────────────────────

#: Au-delà de quoi un mouvement compte comme « significatif ».
#:
#: Deux pour cent : c'est le seuil de la maquette, et il se défend — la volatilité
#: journalière d'une grande capitalisation tourne autour de 1,5 %, donc 2 % est un
#: jour qui se remarque sans être exceptionnel. Nommé ici parce qu'il est rendu
#: avec le résultat : une probabilité sans son seuil ne veut rien dire.
SEUIL_MOUVEMENT = 2.0

#: Nombre de publications passées retenues pour les statistiques.
#:
#: Douze trimestres, soit trois ans. Assez pour une moyenne qui ne dépende pas
#: d'un seul trimestre, assez peu pour que la société décrite soit encore celle
#: d'aujourd'hui — une réaction de 2019 ne dit plus grand-chose du titre actuel.
ECHANTILLON = 12


def moment_de_publication(heure_ny: int) -> str:
    """
    Où tombe la publication dans la journée de bourse américaine.

    ⚠️ Cela décide de la séance qui porte la réaction, et non seulement d'un
    libellé. Relevé sur TSLA : l'horodatage est en heure de New York et vaut
    16 h 00 — l'heure de clôture — voire 20 h 00. Une publication d'après-clôture
    n'est digérée par le marché que le **lendemain** ; attribuer la variation au
    jour même aurait mesuré une séance qui ignorait encore l'information.
    """
    if heure_ny >= 16:
        return "apres_cloture"
    if heure_ny < 10:            # l'ouverture est à 9 h 30
        return "avant_ouverture"
    return "en_seance"


def _reactions(ticker: str) -> dict:
    """Les publications passées d'un titre et la réaction du cours à chacune."""
    cache = _charger()
    cle = f"reactions:{ticker}"
    e = cache.get(cle)
    if e and e.get("echeance", 0) > time.time() and e.get("version") == _VERSION:
        return e

    res: dict = {"version": _VERSION, "abouti": False, "lignes": []}
    try:
        t = yf.Ticker(ticker)
        ed = t.get_earnings_dates(limit=ECHANTILLON * 2)
        if ed is None or not len(ed):
            raise ValueError("aucune publication recensée")

        # Les clôtures couvrant la période, en une seule requête.
        depart = min(ed.index).date()
        serie = yf.download(ticker, start=depart, progress=False,
                            auto_adjust=True)["Close"]
        if hasattr(serie, "columns"):
            serie = serie[ticker] if ticker in serie.columns else serie.iloc[:, 0]
        cours = [(i.date(), float(v)) for i, v in serie.dropna().items()]

        lignes = []
        for horo, r in ed.iterrows():
            jour = horo.date()
            moment = moment_de_publication(horo.hour)
            # La séance qui porte la réaction.
            #
            # Après la clôture, le marché ne digère l'information que le
            # lendemain : la première séance **strictement postérieure**. Avant
            # l'ouverture ou en séance, l'information circule le jour même :
            # la première séance à cette date ou après.
            idx = next(
                (k for k, (d, _) in enumerate(cours)
                 if (d > jour if moment == "apres_cloture" else d >= jour)),
                None)
            variation = None
            if idx is not None and idx > 0:
                # La clôture qui précède cette séance est le dernier cours d'avant
                # l'information : c'est de là que se mesure la réaction.
                avant, apres = cours[idx - 1][1], cours[idx][1]
                if avant:
                    variation = (apres / avant - 1) * 100
            lignes.append({
                "date": jour.isoformat(),
                "moment": moment,
                "surprise": _nombre(r.get("Surprise(%)")),
                "eps_publie": _nombre(r.get("Reported EPS")),
                "eps_estime": _nombre(r.get("EPS Estimate")),
                "variation": variation,
            })
        res["lignes"] = lignes
        res["abouti"] = True
    except Exception as e:                                     # pragma: no cover
        logger.info("réactions indisponibles pour %s (%s)", ticker, type(e).__name__)

    res["echeance"] = time.time() + (_TTL if res["abouti"] else _TTL_ECHEC)
    cache[cle] = res
    _ecrire()
    return res


def statistiques(lignes: list[dict]) -> dict | None:
    """
    Ce que les réactions passées disent d'une publication à venir.

    ⚠️ La moyenne porte sur la **valeur absolue** des variations, et c'est le
    point : une hausse de 6 % et une baisse de 6 % ne s'annulent pas, elles disent
    toutes deux que ce titre bouge de six pour cent le lendemain. Une moyenne
    signée aurait rendu zéro pour le titre le plus agité.
    """
    v = [abs(x["variation"]) for x in lignes if x.get("variation") is not None]
    v = v[:ECHANTILLON]
    if len(v) < 4:
        # ⚠️ Sous quatre trimestres, aucune statistique n'est rendue plutôt qu'une
        # moyenne sur deux points. Un « impact moyen » calculé sur un échantillon
        # d'un ou deux trimestres se lirait avec la même autorité qu'un autre.
        return None
    return {
        "impact_moyen": sum(v) / len(v),
        "probabilite": sum(1 for x in v if x > SEUIL_MOUVEMENT) / len(v) * 100,
        "seuil": SEUIL_MOUVEMENT,
        "echantillon": len(v),
    }


def qualifier(surprise: float | None) -> str:
    """Le verdict d'une publication, tel que la maquette le nomme."""
    if surprise is None:
        return "Non publié"
    if surprise > 1:
        return "Supérieur aux attentes"
    if surprise < -1:
        return "Inférieur aux attentes"
    # ⚠️ Une bande morte d'un point de pourcentage. Sans elle, une surprise de
    # +0,04 % — c'est-à-dire un consensus atteint — s'annoncerait « supérieur aux
    # attentes », ce qui est vrai arithmétiquement et faux dans les faits.
    return "Conforme aux attentes"


def analyse_du_portefeuille(
    poids: dict[str, float], aujourdhui: date | None = None,
) -> dict:
    """
    L'historique des publications et l'impact attendu, ligne par ligne.

    `poids` est la part de chaque titre dans le portefeuille, en pourcentage :
    c'est elle qui convertit la réaction d'un titre en effet sur l'ensemble.

    ⚠️ L'impact sur le portefeuille est le produit du poids par la variation. Il
    suppose que les autres lignes n'ont pas bougé ce jour-là, ce qui est faux — mais
    c'est bien la contribution de *cette* publication qu'on cherche à isoler, et
    non la performance du jour.
    """
    ref = aujourdhui or date.today()
    passes: list[dict] = []
    impacts: dict[str, dict] = {}
    sans: list[str] = []

    for tk, part in poids.items():
        r = _reactions(tk)
        if not r.get("abouti"):
            sans.append(tk)
            continue

        publiees = [x for x in r["lignes"] if x["date"] < ref.isoformat()]
        st = statistiques(publiees)
        if st:
            impacts[tk] = {"exposition": part, **st}

        for pub in publiees[:ECHANTILLON]:
            passes.append({
                "date": pub["date"], "ticker": tk, "moment": pub["moment"],
                "libelle": f"Résultats {trimestre(pub['date'])}",
                "surprise": pub["surprise"],
                "resultat": qualifier(pub["surprise"]),
                "variation": pub["variation"],
                "impact_portefeuille": (pub["variation"] * part / 100
                                        if pub["variation"] is not None else None),
            })

    passes.sort(key=lambda e: (e["date"], e["ticker"]), reverse=True)
    return {"passes": passes, "impacts": impacts, "sans_donnees": sans}


# ── Transparence : les échéances des sociétés détenues par un fonds ──────────

#: Nombre de lignes retenues dans un fonds.
#:
#: ⚠️ Dix, parce que c'est ce que la source publie — pas un choix de confort. Le
#: fournisseur ne rend que les dix premières positions d'un ETF. La vue est donc
#: **partielle par construction** : un fonds S&P 500 en compte cinq cents, et ces
#: dix en pèsent environ un tiers. L'interface doit le dire, sans quoi l'absence
#: d'une société se lirait comme l'absence de sa publication.
LIGNES_PAR_FONDS = 10

#: Les colonnes du tableau de composition, nommées et non positionnelles.
#:
#: ⚠️ Relevé sur SPY : `['Name', 'Holding Percent']`, index `Symbol`. Lire par
#: position donnait le nom là où on attendait la part.
COLONNE_PART = "Holding Percent"
COLONNE_NOM = "Name"


def _lignes_du_fonds(ticker: str) -> dict:
    """
    Les principales sociétés derrière un fonds, et leur part dans ce fonds.

    ⚠️ Lues chez un **ETF physique qui suit le même indice**, et non chez le fonds
    lui-même. Un fonds synthétique publie un panier de collatéral, pas l'indice :
    mesuré sur ETZ.PA, ses propres lignes donnaient trente-six sociétés
    équivalentes contre cent quatre-vingt-quinze pour le Stoxx Europe 600 qu'il
    réplique. Le panier décrit sa mécanique interne, l'indice décrit l'exposition.
    """
    cache = _charger()
    cle = f"lignes:{ticker}"
    e = cache.get(cle)
    if e and e.get("echeance", 0) > time.time() and e.get("version") == _VERSION:
        return e

    res: dict = {"version": _VERSION, "abouti": False, "lignes": [], "proxy": None}
    nom = _fiche(ticker).get("nom")
    for proxy in proxys_pour(nom):
        try:
            th = yf.Ticker(proxy).funds_data.top_holdings
            if th is None or not len(th):
                continue
            # ⚠️ La part est lue **par le nom de sa colonne**, jamais par sa
            # position. Le tableau rendu porte `['Name', 'Holding Percent']` : lire
            # la première colonne donnait le nom de la société, et `float('NVIDIA
            # Corp')` levait une `ValueError` — que le garde-fou ci-dessous avalait
            # en « ce proxy ne publie rien ». Un défaut de lecture s'y déguisait
            # ainsi en absence de donnée, sur les trois candidats à la suite, pour
            # les trois fonds d'un vrai PEA. C'est exactement le piège que ce
            # fichier dénonce ailleurs, et je l'avais tendu ici.
            if COLONNE_PART not in th.columns:
                logger.warning(
                    "composition de %s illisible : colonnes %s, « %s » attendue",
                    proxy, list(th.columns), COLONNE_PART)
                continue
            lignes = []
            for sym, part in th[COLONNE_PART].head(LIGNES_PAR_FONDS).items():
                p = _nombre(part)
                if p is None:
                    continue
                nom_societe = th.at[sym, COLONNE_NOM] if COLONNE_NOM in th.columns else None
                lignes.append({
                    "ticker": str(sym),
                    "nom": str(nom_societe) if nom_societe else None,
                    # La source rend une fraction : 0,0754 pour 7,54 %.
                    "part": round(p * 100, 3),
                })
            if not lignes:
                continue
            res["lignes"] = lignes
            res["proxy"] = proxy
            res["abouti"] = True
            break
        except Exception as ex:                                # pragma: no cover
            # ⚠️ Le candidat suivant est essayé. Un proxy qui refuse n'est pas une
            # absence de composition : c'est ce fournisseur-là qui n'a pas répondu.
            # Le niveau est `warning` et non `info` : c'est ce silence trop discret
            # qui a laissé un défaut de lecture passer pour une absence de donnée.
            logger.warning("proxy %s muet pour %s (%s: %s)",
                           proxy, ticker, type(ex).__name__, str(ex)[:120])

    res["echeance"] = time.time() + (_TTL if res["abouti"] else _TTL_ECHEC)
    cache[cle] = res
    _ecrire()
    return res


def evenements_par_transparence(
    fonds: dict[str, float], aujourdhui: date | None = None,
) -> dict:
    """
    Les publications des sociétés détenues par les fonds du portefeuille.

    `fonds` associe le ticker d'un fonds à son poids dans le portefeuille, en
    pourcentage. L'exposition rendue est le produit des deux poids : une société
    qui pèse sept pour cent d'un fonds qui pèse soixante-dix expose le portefeuille
    à quatre virgule neuf pour cent.

    ⚠️ C'est la seule échéance qu'un ETF puisse avoir. Il ne publie pas de résultats
    — ce n'est pas une société — et un ETF capitalisant ne détache jamais de
    dividende : vérifié sur les trois lignes d'un vrai PEA, dont les noms officiels
    portent « EUR C » et « Acc ». Sans transparence, ces portefeuilles n'ont
    strictement aucun événement propre.
    """
    ref = aujourdhui or date.today()
    evs: list[Evenement] = []
    opaques: list[str] = []
    #: Les lignes traversées, pour que l'appelant sache quels pays le portefeuille
    #: touche réellement. C'est ce qui fait entrer la macro taïwanaise dans un PEA
    #: d'ETF : elle y a sa place parce qu'un fonds détient TSMC, exactement la même
    #: raison qui fait y annoncer les résultats de TSMC.
    vus: list[str] = []

    for tk, poids in fonds.items():
        comp = _lignes_du_fonds(tk)
        if not comp.get("abouti"):
            opaques.append(tk)
            continue
        vus.extend(l["ticker"] for l in comp["lignes"])
        for ligne in comp["lignes"]:
            f = _fiche(ligne["ticker"])
            jr = f.get("resultats")
            if not jr or jr < ref.isoformat():
                continue
            evs.append(Evenement(
                nature="resultats", date=jr, ticker=ligne["ticker"],
                libelle=f"Résultats {trimestre(jr)}",
                jours=(date.fromisoformat(jr) - ref).days,
                eps_estime=f.get("eps_estime"),
                via=tk,
                exposition=round(poids * ligne["part"] / 100, 3),
                nom_societe=ligne.get("nom"),
            ))

    # La plus forte exposition d'abord à date égale : c'est celle qui compte.
    evs.sort(key=lambda e: (e.date, -(e.exposition or 0)))
    return {
        "evenements": [asdict(e) for e in evs],
        "fonds_opaques": opaques,
        "lignes_par_fonds": LIGNES_PAR_FONDS,
        "tickers_vus": vus,
    }


def exposition_du_titre(
    ticker: str, poids_directs: dict[str, float], compositions: dict[str, dict],
) -> float:
    """
    La part du portefeuille exposée à un titre, détention directe et fonds cumulés.

    ⚠️ Les deux s'**additionnent**, et c'est le cas réel : un portefeuille peut
    détenir Tesla en direct *et* par son ETF S&P 500. Ne compter que la ligne
    directe sous-estimerait l'exposition, ne compter que la transparence
    l'oublierait tout à fait.

    `compositions` associe chaque fonds à son poids et à ses lignes, telles que
    `_lignes_du_fonds` les rend.
    """
    total = poids_directs.get(ticker, 0.0)
    for comp in compositions.values():
        for ligne in comp.get("lignes") or []:
            if ligne["ticker"] == ticker:
                total += comp["poids"] * ligne["part"] / 100
    return round(total, 3)


def impact_du_titre(
    ticker: str, poids_directs: dict[str, float], fonds: dict[str, float],
) -> dict | None:
    """
    Les statistiques de réaction d'un titre, avec son exposition dans ce portefeuille.

    ⚠️ Calculé **à la demande**, pour le seul titre demandé. Les faire tous d'avance
    aurait coûté, sur un portefeuille de trois ETF, une trentaine d'interrogations —
    dates de publication et historique de cours pour chacune des dix premières
    lignes de chaque fonds — dont l'utilisateur n'aurait regardé qu'une.

    Rend `None` quand l'échantillon est trop mince : voir `statistiques`.
    """
    compositions = {
        tk: {"poids": poids, **_lignes_du_fonds(tk)}
        for tk, poids in fonds.items()
    }
    exposition = exposition_du_titre(ticker, poids_directs, compositions)
    if exposition <= 0:
        return None

    r = _reactions(ticker)
    if not r.get("abouti"):
        return None
    ref = date.today().isoformat()
    st = statistiques([x for x in r["lignes"] if x["date"] < ref])
    if not st:
        return None
    return {"ticker": ticker, "exposition": exposition, **st}


def evenements_du_portefeuille(
    tickers: list[str], aujourdhui: date | None = None,
) -> dict:
    """
    Les événements à venir des titres donnés, du plus proche au plus lointain.

    Rend aussi `sans_donnees` : les titres pour lesquels la source ne publie rien.
    C'est ce qui permet à l'interface de dire « ces lignes ne publient pas de
    résultats » au lieu d'afficher un cadre vide sans explication.
    """
    ref = aujourdhui or date.today()
    evs: list[Evenement] = []
    sans: list[str] = []

    for tk in tickers:
        f = _fiche(tk)
        trouve = False

        jr = f.get("resultats")
        if jr and jr >= ref.isoformat():
            evs.append(Evenement(
                nature="resultats", date=jr, ticker=tk,
                libelle=f"Résultats {trimestre(jr)}",
                jours=(date.fromisoformat(jr) - ref).days,
                eps_estime=f.get("eps_estime"),
            ))
            trouve = True

        jd = f.get("detachement")
        if jd and jd >= ref.isoformat():
            montant = f.get("dividende")
            cours = f.get("cours")
            evs.append(Evenement(
                nature="dividende", date=jd, ticker=tk,
                libelle="Détachement du dividende",
                jours=(date.fromisoformat(jd) - ref).days,
                montant=montant, devise=f.get("devise"),
                # Le rendement du seul versement, non le rendement annuel : c'est
                # ce que ce détachement retire du cours, et non ce que le titre
                # rapporte sur un an.
                rendement=(montant / cours * 100) if montant and cours else None,
            ))
            trouve = True

        if not trouve:
            sans.append(tk)

    for iso, libelle, zone, heure in calendrier_macro():
        if iso >= ref.isoformat():
            z = ZONES.get(zone)
            evs.append(Evenement(
                nature="economique", date=iso, libelle=libelle, ticker=zone,
                moment=instant_publication(iso, heure,
                                           z.fuseau if z else FUSEAU_PUBLICATION),
                jours=(date.fromisoformat(iso) - ref).days,
                pays=(z.drapeau or None) if z else None,
                source="relevé",
            ))

    evs.sort(key=lambda e: (e.date, e.ticker or ""))
    return {
        "evenements": [asdict(e) for e in evs],
        "sans_donnees": sans,
        "peremption_macro": PEREMPTION_MACRO,
    }
