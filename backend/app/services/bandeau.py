"""
Le bandeau d'actifs : dix symboles, leur cours et leur variation du jour.

⚠️ **Un instantané partagé, et non un calcul par visiteur.** Le bandeau est destiné à la
page d'accès, la seule page publique du site — donc la seule que quelqu'un sans code
d'accès puisse appeler en boucle. L'ancienne route faisait dix appels yfinance séquentiels
à chaque requête : dix visiteurs valaient cent appels amont, et une boucle sur l'adresse
suffisait à épuiser le quota pour tout le monde. Le calcul est fait une fois toutes les
trente secondes, et servi à tous.

⚠️ **Un seul téléchargement pour les dix, et non dix.** `yf.download` accepte une liste et
rend un tableau à deux niveaux ; `fast_info` se paie un aller-retour par symbole. Même
donnée, dix fois moins d'appels — c'est ce qui rend la route tenable sur une page publique.

⚠️ **Deux séances, pas une.** La variation affichée est celle du jour, il faut donc la
clôture de la veille en plus du dernier cours. La dernière ligne d'une bougie quotidienne
suit le cours courant pendant la séance : on obtient la variation intraséance sans appel
supplémentaire.

⚠️ **Rien ici ne doit venir d'un portefeuille.** Ce sont des cours de marché, publics par
nature, et c'est ce qui autorise la route à être lue sans code d'accès — voir `OUVERTS`
dans `frontend/src/middleware.ts`. Y ajouter une donnée de compte ouvrirait un trou dans
la porte de l'alpha.
"""

import logging
import threading
import time
from typing import Any

import yfinance as yf

logger = logging.getLogger(__name__)

#: Les symboles du bandeau. Tous américains ou crypto, donc en temps réel.
#:
#: ⚠️ **Ajouter un titre d'Euronext obligerait à le dire.** Paris est différé de quinze
#: minutes ; un bandeau qui mêle les deux sans le mentionner affiche du retard sous une
#: apparence de direct. Voir la mention de la page d'accès.
#:
#: ⚠️ **Chaque symbole ajouté ici doit avoir son logo dans `frontend/public/logos/`**, sous
#: son nom complet — `BTC-USD.png` et non `BTC.png`. Sans le fichier, le bandeau n'affiche
#: pas de vignette pour cette ligne : il le vérifie au chargement et n'en réserve pas la
#: place, donc rien ne casse, mais rien ne s'affiche non plus.
SYMBOLES: list[str] = [
    "AAPL", "NVDA", "MSFT", "TSLA", "SPY",
    "AMZN", "GOOGL", "META", "BTC-USD", "ETH-USD",
]

#: ⚠️ **Trente secondes, et non les dix du reste du site.** La cadence de `@/lib/cadence`
#: est calée sur le cache de Yahoo pour un tableau de bord qu'on regarde ; un bandeau qui
#: défile n'est pas lu au cours près. Trente secondes suffisent et divisent par trois la
#: charge amont d'une page publique.
DUREE_CACHE = 30.0

#: ⚠️ **Après un échec, on attend cinq minutes avant de redemander.** Le cas qui l'impose
#: est le quota : réessayer toutes les trente secondes sur un `YFRateLimitError` prolonge la
#: limite au lieu de la laisser retomber. Pendant ce temps l'instantané précédent continue
#: d'être servi, ce qui est exactement le comportement voulu.
REPOS_APRES_ECHEC = 300.0

_cache: tuple[float, dict[str, Any]] | None = None
_verrou = threading.Lock()
_en_cours = False
_echec_le = 0.0


def _calculer() -> dict[str, Any]:
    cours = yf.download(
        SYMBOLES,
        period="2d",
        interval="1d",
        progress=False,
        auto_adjust=False,
        group_by="ticker",
        threads=True,
    )

    actifs: list[dict[str, Any]] = []
    for symbole in SYMBOLES:
        try:
            serie = cours[symbole]["Close"].dropna()
            if len(serie) < 2:
                continue
            dernier = float(serie.iloc[-1])
            veille = float(serie.iloc[-2])
            if not veille:
                continue
            actifs.append({
                # ⚠️ **Les deux formes voyagent, et il faut les deux.** « BTC-USD » est le nom
                # du flux, « BTC » celui de l'actif : le bandeau affiche le second. Mais le
                # logo, lui, est rangé sous le premier — `frontend/public/logos/BTC-USD.png` —
                # et ne rendre que la forme courte laissait la vignette introuvable.
                "ticker": symbole,
                "symbole": symbole.replace("-USD", ""),
                "cours": round(dernier, 2),
                "variation": round((dernier - veille) / veille * 100, 2),
            })
        except (KeyError, IndexError, ValueError, TypeError):
            # Un symbole muet ne doit pas emporter les neuf autres.
            logger.warning("Bandeau : %s sans données exploitables", symbole)

    # ⚠️ **Une liste vide est un échec, et doit le dire.** Yahoo répond parfois
    # `YFRateLimitError` : `yf.download` ne lève rien, il rend un tableau vide, et la boucle
    # ci-dessus sort alors zéro actif. Rendre ce vide comme un résultat normal le faisait
    # **ranger dans le cache**, écrasant un instantané parfaitement valide — le bandeau
    # disparaissait de la page d'accès jusqu'au prochain rafraîchissement réussi. Constaté en
    # développement, à la première limite atteinte. Mieux vaut un cours d'il y a dix minutes
    # que pas de bandeau du tout.
    if not actifs:
        raise RuntimeError("aucun actif exploitable — quota amont ou panne de la source")

    return {"horodatage": int(time.time()), "actifs": actifs}


def _ranger(resultat: dict[str, Any]) -> None:
    global _cache
    with _verrou:
        _cache = (time.time(), resultat)


def _rafraichir_en_fond() -> None:
    """
    ⚠️ **Le rafraîchissement ne bloque pas la réponse, et ne se lance qu'une fois.** Sans
    le drapeau, trente visiteurs arrivant sur un cache périmé lanceraient trente
    téléchargements simultanés — exactement la rafale qu'on cherche à éviter.
    """
    global _en_cours
    with _verrou:
        if _en_cours or time.time() - _echec_le < REPOS_APRES_ECHEC:
            return
        _en_cours = True

    def tache() -> None:
        global _en_cours, _echec_le
        try:
            _ranger(_calculer())
            with _verrou:
                _echec_le = 0.0
        except Exception as e:
            # ⚠️ Pas de `exception()` ici : un quota amont est une situation prévue, et sa
            # trace complète à chaque tentative noierait le journal.
            logger.warning("Bandeau : rafraîchissement échoué (%s) — instantané conservé", e)
            with _verrou:
                _echec_le = time.time()
        finally:
            with _verrou:
                _en_cours = False

    threading.Thread(target=tache, daemon=True, name="bandeau").start()


def instantane() -> dict[str, Any]:
    """L'instantané du bandeau. Ne bloque que si rien n'a encore été calculé."""
    with _verrou:
        connu = _cache

    if connu:
        if time.time() - connu[0] >= DUREE_CACHE:
            _rafraichir_en_fond()
        return connu[1]

    # Premier appel de la vie du processus : il faut bien attendre une fois.
    try:
        resultat = _calculer()
    except Exception:
        logger.exception("Bandeau : premier calcul échoué")
        return {"horodatage": int(time.time()), "actifs": []}
    _ranger(resultat)
    return resultat
