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
    # ⚠️ **La page n'annonce aucune réunion de politique monétaire avant mars 2027.**
    # Le relevé mot pour mot de la section 2027 commence par une réunion *non*
    # monétaire le 24 février. Les années précédentes en comptaient huit, celle-ci
    # sept : je transcris ce que la source publie et n'ajoute pas la réunion
    # manquante par symétrie.
    ("2026-09-10", "Décision de la BCE · Conseil des gouverneurs", "Zone euro", None),
    ("2026-10-29", "Décision de la BCE · Conseil des gouverneurs", "Zone euro", None),
    ("2026-12-17", "Décision de la BCE · Conseil des gouverneurs", "Zone euro", None),
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
ZONES: dict[str, tuple[str, str]] = {
    "USA": ("us", "America/New_York"),
    "Zone euro": ("eu", "Europe/Brussels"),
}

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

    for tk, poids in fonds.items():
        comp = _lignes_du_fonds(tk)
        if not comp.get("abouti"):
            opaques.append(tk)
            continue
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

    for iso, libelle, zone, heure in CALENDRIER_MACRO:
        if iso >= ref.isoformat():
            drapeau, fuseau = ZONES.get(zone, (None, FUSEAU_PUBLICATION))
            evs.append(Evenement(
                nature="economique", date=iso, libelle=libelle, ticker=zone,
                moment=instant_publication(iso, heure, fuseau),
                jours=(date.fromisoformat(iso) - ref).days,
                pays=drapeau,
            ))

    evs.sort(key=lambda e: (e.date, e.ticker or ""))
    return {
        "evenements": [asdict(e) for e in evs],
        "sans_donnees": sans,
        "peremption_macro": PEREMPTION_MACRO,
    }
