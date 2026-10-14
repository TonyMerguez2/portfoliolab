"""
La base des tests n'est jamais celle du site.

⚠️ **Le test le plus important du projet en matière de données.** Un test qui abîme
l'application qu'il vérifie est le pire des cas, parce qu'il passe en le faisant : rien
dans la sortie de pytest ne trahit une table créée, une ligne écrite ou une reprise de
données jouée sur la base réelle. C'est arrivé le 18 septembre 2026 sur le serveur — voir
`tests/conftest.py` et `app/core/database._chemin_base`. Le seul garde-fou qui tienne est
celui qui vérifie où pointe le moteur, avant qu'un test n'y écrive.

Exécution : cd backend && ./venv/bin/python -m pytest tests/test_base_jetable.py -v
"""
import os
from pathlib import Path

from app.core import database

RACINE = Path(__file__).resolve().parents[1]
BASE_DU_SITE = (RACINE / "portfoliolab.db").resolve()


def test_le_moteur_ne_pointe_pas_sur_la_base_du_site():
    """La garantie qui compte, et la seule qui se mesure de l'intérieur d'un test."""
    assert Path(database.DB_PATH).resolve() != BASE_DU_SITE
    assert Path(database.engine.url.database).resolve() != BASE_DU_SITE


def test_le_moteur_est_celui_que_conftest_a_pose():
    """
    Sans quoi la surcharge pourrait être lue d'un côté et ignorée de l'autre.

    Le moteur est construit à l'import, une fois : ce test dit que ce qui a servi à le
    bâtir est bien la variable, et non un chemin recalculé plus tard.
    """
    assert database.DB_PATH == os.environ["NOVAC_BASE"]
    assert database.engine.url.database == os.environ["NOVAC_BASE"]


def test_sans_la_variable_le_defaut_reste_la_base_a_cote_de_backend(monkeypatch):
    """
    Le serveur ne pose aucune variable : le repli doit rester ce qu'il a toujours été.

    ⚠️ On éprouve la fonction, pas un import. Réimporter le module sans `NOVAC_BASE`
    rebâtirait le moteur sur la base du site et y créerait les tables — le dégât même que
    ce fichier surveille.
    """
    monkeypatch.delenv("NOVAC_BASE", raising=False)
    assert Path(database._chemin_base()).resolve() == BASE_DU_SITE
