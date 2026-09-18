"""
Les alertes macroéconomiques d'un portefeuille.

⚠️ **Rien n'est inventé : l'alerte est une échéance du calendrier, pas un signal.** Le
calendrier macro de `evenements.py` sait déjà quelles zones concernent un portefeuille —
déduites de ses tickers — et à quelle date chaque publication tombe. Une alerte n'est que
cette échéance, vue à travers l'état du compte : annoncée ou non, écartée ou non.

⚠️ **Trois jours, resserré à la demande depuis sept.** Le raisonnement d'origine tenait :
au-delà d'une semaine, une décision annoncée n'est plus une alerte mais une ligne
d'agenda, et l'onglet « Événements » la montre déjà. Trois jours va plus loin dans le même
sens — ne rester que ce qui est imminent. Conséquence à connaître : la macro se tait la
plupart du temps, et ce sont les alertes de performance qui font le quotidien.

⚠️ **La fenêtre part d'aujourd'hui inclus** : une publication du jour même reste la plus
utile de toutes.
"""

from __future__ import annotations

import hashlib
import logging
import threading
import time
from datetime import date, datetime
from typing import Any

import yfinance as yf
from sqlalchemy.orm import Session

from app.models.alerte import EtatAlerte
from app.services.evenements import evenements_macro_du_flux

logger = logging.getLogger(__name__)

#: L'horizon d'une alerte macro, en jours, aujourd'hui compris.
FENETRE_JOURS = 3


#: Combien de temps une série de variations resservie.
#:
#: ⚠️ **Dix minutes, et non la cadence du bandeau.** Le bandeau sert dix symboles fixes à
#: tout le monde ; ici chaque portefeuille a ses lignes, donc autant de séries que de
#: compositions. Rafraîchir toutes les trente secondes aurait multiplié les appels amont par
#: le nombre de comptes, pour un chiffre qui ne bouge pas de façon utile à cette échelle.
DUREE_VARIATIONS = 600.0

_variations_cache: dict[str, tuple[float, dict[str, float]]] = {}
_verrou_variations = threading.Lock()


def variations_du_jour(tickers: list[str]) -> dict[str, float]:
    """
    La variation du jour de chaque ligne, en pourcentage.

    ⚠️ **Un seul téléchargement groupé, comme pour le bandeau.** Une requête par ligne
    aurait fait dix allers-retours pour un portefeuille de dix titres, à chaque visite.

    ⚠️ **Une ligne muette est absente, pas à zéro.** Un ticker sans deux clôtures — trop
    récent, suspendu, mal orthographié — ne rend rien. L'inscrire à 0 % l'aurait fait
    concourir au titre de meilleure ligne, et un jour de baisse générale il l'aurait gagné.
    """
    if not tickers:
        return {}
    cle = "|".join(sorted(set(tickers)))
    with _verrou_variations:
        connu = _variations_cache.get(cle)
        if connu and time.time() - connu[0] < DUREE_VARIATIONS:
            return connu[1]

    try:
        # ⚠️ **Cinq jours et non deux, et ce n'est pas de la marge de confort.** Mesuré sur
        # un vrai portefeuille : à `period="2d"`, AAPL rend deux clôtures et les ETF
        # parisiens **une seule** — la fenêtre est calendaire, et la séance européenne n'y
        # tombe qu'une fois. Une ligne à une clôture n'a pas de variation, donc elle
        # disparaissait des alertes sans rien signaler : un portefeuille d'ETF européens
        # n'en recevait aucune. Cinq jours traversent un week-end et un férié.
        cours = yf.download(sorted(set(tickers)), period="5d", interval="1d",
                            progress=False, auto_adjust=False, group_by="ticker",
                            threads=True)
    except Exception:
        logger.warning("Variations : téléchargement impossible")
        return {}

    trouvees: dict[str, float] = {}
    for tk in sorted(set(tickers)):
        try:
            serie = cours[tk]["Close"].dropna()
            if len(serie) < 2:
                continue
            veille = float(serie.iloc[-2])
            if not veille:
                continue
            trouvees[tk] = (float(serie.iloc[-1]) - veille) / veille * 100
        except (KeyError, IndexError, ValueError, TypeError):
            continue

    if trouvees:
        with _verrou_variations:
            _variations_cache[cle] = (time.time(), trouvees)
    return trouvees


def alertes_performance(
    tickers: list[str], aujourdhui: date,
) -> list[dict[str, Any]]:
    """
    La meilleure et la pire ligne du jour.

    ⚠️ **Deux alertes par jour au plus, et c'est ce qui les rend lisibles.** La clé porte la
    date et le sens — « hausse », « baisse » — donc une seule annonce par jour et par sens,
    quelle que soit la fréquence des visites. Sans la date, l'alerte aurait été annoncée une
    fois pour toutes ; sans le sens, la meilleure et la pire se seraient confondues.

    ⚠️ **Il faut au moins deux lignes.** Sur un portefeuille d'un seul titre, la meilleure et
    la pire sont le même, et l'annoncer deux fois sous deux libellés opposés n'apprend rien.
    """
    if len(set(tickers)) < 2:
        return []
    var = variations_du_jour(tickers)
    if len(var) < 2:
        return []

    meilleure = max(var, key=lambda t: var[t])
    pire = min(var, key=lambda t: var[t])
    if meilleure == pire:
        return []

    jour = aujourdhui.isoformat()
    sortie: list[dict[str, Any]] = []
    for ticker, sens, titre in (
        (meilleure, "hausse", "meilleure ligne du jour"),
        (pire, "baisse", "pire ligne du jour"),
    ):
        v = var[ticker]
        sortie.append({
            "nature": "performance",
            "date": jour,
            "libelle": f"{ticker} · {titre}",
            # ⚠️ Le signe est écrit, y compris pour une hausse : « 2,4 % » sous le titre
            # « pire ligne » se lirait comme un gain sur un jour où tout monte.
            "detail": f"{v:+.2f} % aujourd’hui".replace(".", ","),
            "variation": round(v, 2),
            "ticker": ticker,
            "jours": 0,
            "pays": None,
            "source": "cours du jour",
            "sens": sens,
        })
    return sortie


def cle_alerte(evenement: dict[str, Any]) -> str:
    """
    L'empreinte d'une échéance : date, libellé, zone.

    ⚠️ **Les trois champs, et pas seulement la date.** Deux publications tombent le même
    jour plus souvent qu'on ne croit — l'inflation américaine et une décision de la BCE
    ont partagé le 11 septembre. Une clé sur la date seule les aurait confondues : écarter
    l'une aurait écarté l'autre.

    ⚠️ Une empreinte et non les trois champs concaténés : la clé voyage dans une adresse,
    et un libellé porte des espaces, des accents et des virgules.
    """
    brut = "|".join([
        str(evenement.get("date") or ""),
        str(evenement.get("libelle") or ""),
        str(evenement.get("pays") or ""),
        # ⚠️ Vide pour une échéance macro, « hausse » ou « baisse » pour une performance :
        # sans lui, deux lignes de sens opposés au même libellé se confondraient.
        str(evenement.get("sens") or ""),
    ])
    return hashlib.sha1(brut.encode("utf-8")).hexdigest()[:16]


def _etats(db: Session, user_id: str, cles: list[str]) -> dict[str, EtatAlerte]:
    if not cles:
        return {}
    lignes = (db.query(EtatAlerte)
              .filter(EtatAlerte.user_id == user_id, EtatAlerte.cle.in_(cles))
              .all())
    return {l.cle: l for l in lignes}


def alertes(
    db: Session, user_id: str, tickers: list[str], aujourdhui: date | None = None,
) -> list[dict[str, Any]]:
    """
    Les alertes vivantes d'un portefeuille, les écartées en moins.

    Chaque alerte porte `nouvelle` : vraie tant qu'elle n'a pas été annoncée. C'est ce
    drapeau que l'interface consomme pour ne lever le toast qu'une fois.
    """
    ref = aujourdhui or date.today()
    evs = evenements_macro_du_flux(tickers, ref)

    retenues: list[dict[str, Any]] = []
    for e in evs:
        jours = e.get("jours")
        # ⚠️ `jours` peut manquer ; sans lui on ne sait pas si l'échéance est dans la
        # fenêtre, et une alerte dont on ignore la date n'a rien à annoncer.
        if not isinstance(jours, int) or jours < 0 or jours > FENETRE_JOURS:
            continue
        retenues.append(e)

    # ⚠️ **Les performances rejoignent la liste, elles n'ont pas de fenêtre.** Une échéance
    # macro se situe dans l'avenir et s'annonce avant ; une variation du jour est déjà
    # arrivée. Lui appliquer la même borne aurait été un contresens — `jours` y vaut zéro
    # par construction, ce qui la ferait passer, mais pour la mauvaise raison.
    retenues += alertes_performance(tickers, ref)

    cles = [cle_alerte(e) for e in retenues]
    connus = _etats(db, user_id, cles)

    vivantes: list[dict[str, Any]] = []
    for e, cle in zip(retenues, cles):
        etat = connus.get(cle)
        if etat is not None and etat.supprimee_le is not None:
            continue
        vivantes.append({
            **e,
            "cle": cle,
            "nouvelle": etat is None or etat.vue_le is None,
        })

    # ⚠️ **Ce qui est arrivé avant ce qui va arriver, puis la plus proche.** Une variation
    # du jour est un fait ; une échéance est une attente. Les mélanger par `jours` seul
    # aurait posé le PIB de demain au-dessus de la ligne qui a perdu six pour cent ce matin.
    vivantes.sort(key=lambda a: (
        0 if a.get("nature") == "performance" else 1,
        a.get("jours") if isinstance(a.get("jours"), int) else 99,
        a.get("libelle") or "",
    ))
    return vivantes


def _ligne(db: Session, user_id: str, cle: str) -> EtatAlerte:
    """La ligne d'état du couple compte/alerte, créée si elle manque."""
    ligne = (db.query(EtatAlerte)
             .filter(EtatAlerte.user_id == user_id, EtatAlerte.cle == cle)
             .first())
    if ligne is None:
        ligne = EtatAlerte(id=f"{user_id}:{cle}", user_id=user_id, cle=cle)
        db.add(ligne)
    return ligne


def marquer_vues(db: Session, user_id: str, cles: list[str]) -> int:
    """
    Note que ces alertes ont été annoncées. Rend le nombre de lignes touchées.

    ⚠️ **Idempotent, et il le faut.** L'interface annonce puis marque ; si la réponse se
    perd et qu'elle réessaie, la seconde passe ne doit pas écraser l'heure de la première
    ni créer un doublon.
    """
    touchees = 0
    for cle in cles:
        ligne = _ligne(db, user_id, cle)
        if ligne.vue_le is None:
            ligne.vue_le = datetime.utcnow()
            touchees += 1
    db.commit()
    return touchees


def supprimer(db: Session, user_id: str, cle: str) -> None:
    """
    Écarte l'alerte pour ce compte, définitivement.

    ⚠️ **On date la suppression, on n'efface pas la ligne.** Effacer l'aurait fait
    revenir : à l'appel suivant, le calendrier rend la même échéance, aucune ligne ne dit
    qu'elle a été écartée, et l'alerte reparaît comme neuve.
    """
    ligne = _ligne(db, user_id, cle)
    if ligne.supprimee_le is None:
        ligne.supprimee_le = datetime.utcnow()
    db.commit()
