"""
Réglages communs à tous les tests.

Exécution : cd backend && ./venv/bin/python -m pytest
"""
import atexit
import os
import shutil
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# ── La base des tests n'est jamais celle du site ─────────────────────────────────
#
# ⚠️ Ce garde-fou vient d'un dégât réel, pas d'un principe. Le 18 septembre 2026, sur le
# serveur, `pytest tests/test_alertes.py` a créé la table `alerte_macro_etat` dans
# `/srv/novac/portfoliolab/backend/portfoliolab.db` — la base réelle du site, avec ses
# 6 comptes, 7 portefeuilles et 83 transactions — puis y a écrit ses lignes d'essai.
# Elles ont été nettoyées par la fixture, mais c'était la chance d'un test bien écrit :
# n'importe quel test à venir peut écrire dans cette base sans le savoir, et ce qu'il y
# casse ne casse aucun test.
#
# ⚠️ **Posé au chargement de ce fichier, avant que pytest ne collecte le premier test.**
# `app/core/database.py` lit `NOVAC_BASE` à l'import pour construire son moteur ; une
# fixture, même `autouse`, arriverait après — le premier `import app.models...` d'un
# module de test a déjà créé les tables sur la base désignée. C'est aussi pourquoi cela
# ne peut pas passer par `monkeypatch`.
#
# ⚠️ **Une base neuve par exécution**, et non un fichier de test fixe : deux séries de
# tests ne se lèguent rien, et le fichier ne survit pas pour être relu par mégarde. Les
# tests qui montent l'application se donnent déjà chacun leur base jetable ; celle-ci
# recueille ce qui passe encore par le moteur partagé.
#
# ⚠️ **Sans condition, même si `NOVAC_BASE` est déjà posée.** La respecter aurait rendu
# possible un `NOVAC_BASE=…/portfoliolab.db pytest` qui remet le dégât d'aplomb, ce que
# personne n'écrit exprès mais qu'un shell garde volontiers d'une commande à l'autre.
_DOSSIER_BASE_DES_TESTS = tempfile.mkdtemp(prefix="novac-tests-")
os.environ["NOVAC_BASE"] = os.path.join(_DOSSIER_BASE_DES_TESTS, "portfoliolab.db")
atexit.register(shutil.rmtree, _DOSSIER_BASE_DES_TESTS, True)


@pytest.fixture(autouse=True)
def cache_details_isole(tmp_path, monkeypatch):
    """
    Aucun test n'écrit dans le cache de fiches du projet.

    ⚠️ Ce garde-fou vient d'un dégât réel, pas d'un principe. Le cache des fiches
    de titres — secteurs, classes d'actifs, volumes — a été posé sur disque pour
    survivre aux redémarrages du serveur. Aussitôt, un test qui préexistait,
    `test_un_succes_est_garde_longtemps`, a appelé `_details_titre("X")` avec un
    yfinance simulé : l'écriture a suivi, et le fichier du projet — qui contenait
    la ventilation sectorielle des trois lignes d'un vrai PEA — s'est retrouvé
    réduit à une entrée de test de 162 octets.

    Conséquence visible à l'écran : la diversification est repassée à « — » et la
    note s'est calculée sur quatre facteurs au lieu de cinq. Un test qui casse
    l'application qu'il vérifie est le pire des cas, parce qu'il passe en le
    faisant.

    `autouse` plutôt qu'à la demande : le prochain test à toucher le cache ne
    saurait pas qu'il doit s'isoler, et le dégât est silencieux.
    """
    import app.api.routes.transactions as routes

    monkeypatch.setattr(routes, "_FICHIER_CACHE", tmp_path / "cache_details.json")
    monkeypatch.setattr(routes, "_CACHE_MTIME", None)
    yield
