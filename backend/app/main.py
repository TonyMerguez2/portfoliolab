"""
PortfolioLab API — FastAPI application entry point.
"""
from __future__ import annotations

import logging
import re
import threading
import time

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import os
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.services import memoire_courte
from app.services.rankings import start_preload
from app.services.chaleur import PERIODES, carte

#: Le répit laissé au serveur avant de préchauffer, en secondes.
_DELAI_PRECHAUFFAGE = 30
from app.api.routes.backtest import router as backtest_router
from app.api.routes.portfolios import router as portfolios_router
from app.api.routes.auth import router as auth_router
from app.api.routes.ticker import router as ticker_router
from app.api.routes.chaleur import router as chaleur_router
from app.api.routes.capitalisations import router as capitalisations_router
from app.api.routes.transactions import router as transactions_router
from app.api.routes.objectifs import router as objectifs_router
from app.api.routes.comptes import constantes as comptes_constantes, router as comptes_router
from app.api.routes.attente import router as attente_router
from app.models.user import User
from app.models.attente import ListeAttente  # noqa: F401  (crée la table au démarrage)
# Import pour que SQLAlchemy enregistre le modèle Transaction avant create_all
from app.core.database import Transaction  # noqa: F401

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Portfolio backtesting engine — computes performance, risk, "
        "and diversification metrics from historical market data."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — le serveur de développement Next, sur cette machine ou sur le réseau
# local.
#
# La liste nommée ne couvre que « localhost », ce qui suffit tant qu'on ouvre le
# site là où il tourne. Depuis un autre appareil, l'origine devient l'adresse IP
# de la machine hôte, et le navigateur refuse la réponse.
#
# L'expression ci-dessous n'ouvre que les trois plages réservées aux réseaux
# privés — celles qu'aucun routeur ne route vers l'extérieur. Une origine
# publique reste refusée, et l'exposition ne dépasse donc pas le réseau auquel
# la machine est déjà connectée.
_ORIGINES_RESEAU_LOCAL = (
    r"^http://("
    r"192\.168\.\d{1,3}\.\d{1,3}"
    r"|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
    r"|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}"
    r"):\d+$"
)

# ── Oubli de la mémoire courte à chaque écriture ────────────────────────────
#
# ⚠️ **Un seul endroit, et non un appel dans chaque route qui écrit.** Il y en a dix-sept —
# transactions, comptes, mouvements, objectifs, pondérations, image — et le jour où l'on en
# ajoute une dix-huitième, personne ne se souviendra d'y penser. Or en oublier une seule veut
# dire qu'un utilisateur saisit une transaction, ne la voit pas apparaître pendant trois
# minutes, et la ressaisit. Une donnée en double vaut bien pire qu'un calcul refait.
#
# Ici, toute requête qui n'est pas une lecture efface ce qui concerne son portefeuille — ou
# tout, si l'adresse n'en désigne aucun. Vider une mémoire de quelques centaines d'entrées ne
# coûte rien ; se tromper, si.
#
# ⚠️ **Après la réponse, et seulement si elle a réussi.** Oublier avant l'appel laisserait la
# mémoire se remplir à nouveau pendant l'écriture, avec l'état d'avant.
_PORTEFEUILLE_DANS_ADRESSE = re.compile(r"/api/v1/portfolios/([^/]+)")


@app.middleware("http")
async def oublier_apres_ecriture(requete, appeler_suite):
    reponse = await appeler_suite(requete)
    if requete.method != "GET" and reponse.status_code < 400:
        trouve = _PORTEFEUILLE_DANS_ADRESSE.search(requete.url.path)
        if trouve:
            memoire_courte.oublier(trouve.group(1))
        else:
            memoire_courte.tout_oublier()
    return reponse


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origines,
    allow_origin_regex=_ORIGINES_RESEAU_LOCAL,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(backtest_router)
app.include_router(portfolios_router)
app.include_router(auth_router)
app.include_router(ticker_router)
app.include_router(chaleur_router)
app.include_router(capitalisations_router)
app.include_router(transactions_router)
app.include_router(objectifs_router)
app.include_router(comptes_router)
app.include_router(comptes_constantes)
app.include_router(attente_router)
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.on_event("startup")
async def on_startup() -> None:
    start_preload()
    _prechauffer_chaleur()


def _prechauffer_chaleur() -> None:
    """Remplit le cache de la carte de chaleur avant le premier visiteur.

    ⚠️ **Onze secondes, mesurées, pour cinq cent trois titres à froid.** C'est le
    prix d'un appel groupé chez le fournisseur, et il est payé par celui qui
    ouvre la page le premier — les suivants lisent le cache en une fraction de
    milliseconde. Le déplacer au démarrage, dans un fil détaché, le rend
    invisible : le serveur répond pendant ce temps, et la page est chaude quand
    on l'ouvre.

    ⚠️ **Les six périodes, et non la seule « 1j ».** Je n'avais préchauffé que
    celle-ci, en jugeant que changer de période était un choix délibéré du
    visiteur, qui accepterait l'attente. C'est faux à l'usage : onze secondes sur
    un bouton qu'on vient de cliquer se lisent comme une panne, pas comme un
    calcul. Les six tiennent en une minute et quelques au démarrage, dans un fil
    qui ne bloque rien.

    ⚠️ **L'une après l'autre, et non en parallèle.** Six téléchargements
    simultanés de cinq cents titres, c'est exactement ce que le fournisseur
    étrangle. En série, le serveur répond pendant ce temps et la charge reste
    celle d'un visiteur.

    ⚠️ **Une seule période au démarrage, et non les six — corrigé sur mesure en production.**
    « Les six tiennent en une minute et quelques » était vrai sur une machine de travail. Sur
    un serveur, où le fournisseur répond bien plus lentement à une adresse de centre de
    données, chaque période coûte **quarante secondes** : mesuré, 255 s pour les six. Pendant
    ces quatre minutes, le serveur ne « répond pas pendant ce temps » du tout — il se bat avec
    son propre préchauffage pour le même réseau, et une page de portefeuille qui se calcule en
    0,4 s hors charge mettait de vingt à quatre-vingt-dix secondes. C'est ce qui a fait
    diagnostiquer une lenteur du portefeuille alors que la lenteur venait d'ici.

    ⚠️ **Ce que ça coûte, et c'est assumé** : ouvrir la carte de chaleur sur une période autre
    que « 1j » dans les minutes qui suivent un redémarrage attendra une quarantaine de
    secondes — l'inconvénient que le préchauffage des six avait justement été écrit pour
    éviter. Mais il ne touche qu'une page et qu'un bouton, quand l'autre défaut touchait toutes
    les pages et tous les visiteurs. Les cinq autres périodes se calculent à la demande et
    restent en cache ensuite.

    ⚠️ **Et pas tout de suite** : `_DELAI` laisse au serveur le temps de répondre aux premiers
    visiteurs, qui arrivent précisément après un déploiement.
    """
    # ⚠️ **Éteint par défaut, et il faut savoir pourquoi avant de le rallumer.** Réduire le
    # préchauffage de six périodes à une n'a pas suffi : mesuré au navigateur pendant la
    # quarantaine de secondes que dure une seule, **toutes** les requêtes du site répondaient
    # en 21 secondes — y compris `/portfolios`, qui n'est qu'une lecture SQLite et se rend en
    # 0,01 s hors charge. Ce n'est donc pas le réseau qui sature, c'est le processeur : deux
    # cœurs, et l'assemblage pandas de cinq cents titres tient le GIL. Le serveur cesse
    # simplement de servir.
    #
    # La carte se calcule donc à la demande et reste en cache ensuite. Le premier visiteur de
    # cette page-là paie quarante secondes ; personne d'autre ne paie rien. C'est le contraire
    # exact du réglage précédent, où tout le monde payait pour cette page.
    #
    # Pour le rallumer sur une machine plus large : NOVAC_PRECHAUFFER_CHALEUR=1.
    if os.environ.get("NOVAC_PRECHAUFFER_CHALEUR") != "1":
        logger.info("Préchauffage de la carte de chaleur : désactivé (voir main.py)")
        return

    # ⚠️ `PERIODES` est un dictionnaire, pas une liste : `PERIODES[0]` lève un `KeyError`
    # dans un fil détaché, où il ne fait tomber personne et ne se voit que dans les tests.
    defaut = next(iter(PERIODES))

    def tache() -> None:
        time.sleep(_DELAI_PRECHAUFFAGE)
        try:
            carte(defaut)
        except Exception:
            logger.exception("Préchauffage de la carte de chaleur : échec (%s)", defaut)

    threading.Thread(target=tache, daemon=True, name="prechauffage-chaleur").start()


@app.get("/health", tags=["System"])
async def health() -> dict:
    return {"status": "ok", "version": settings.app_version}
