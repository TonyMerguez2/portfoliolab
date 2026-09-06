"""
La clé qui signe les sessions ne doit jamais être celle du dépôt, en ligne.

⚠️ **Le test le plus important du projet en matière de sécurité.** La clé écrite dans le
code est publique par nature : qui la lit peut signer `{"sub": "<id de la victime>"}` et
devenir n'importe quel compte. Rien, dans le comportement du site, ne trahirait l'oubli de
la variable — il fonctionnerait parfaitement, seulement ouvert. Le seul garde-fou qui tienne
est celui qui empêche le démarrage, et il ne vaut que s'il est vérifié.

Exécution : cd backend && ./venv/bin/python -m pytest tests/test_secret_production.py -v
"""
import os
import subprocess
import sys

RACINE = os.path.join(os.path.dirname(__file__), "..")


def _importer(environnement: dict) -> subprocess.CompletedProcess:
    """
    Importe `app.core.auth` dans un interpréteur neuf.

    ⚠️ Un sous-processus, et non un `importlib.reload` : la garde s'exécute à l'import du
    module, et le module est déjà chargé par les autres tests de la session. Le rechargement
    aurait mesuré un état sale.
    """
    env = {**os.environ, **environnement}
    env.pop("NOVAC_JWT_SECRET", None)
    env.update(environnement)
    return subprocess.run(
        [sys.executable, "-c", "import app.core.auth"],
        cwd=RACINE, env=env, capture_output=True, text=True,
    )


def test_en_production_sans_cle_le_serveur_refuse_de_demarrer():
    r = _importer({"NOVAC_ENV": "production"})
    assert r.returncode != 0
    assert "NOVAC_JWT_SECRET" in r.stderr


def test_en_production_avec_une_cle_le_serveur_demarre():
    r = _importer({"NOVAC_ENV": "production", "NOVAC_JWT_SECRET": "une-cle-aleatoire"})
    assert r.returncode == 0, r.stderr


def test_hors_production_la_cle_de_travail_suffit():
    """Le développement local ne doit pas réclamer de variable pour tourner."""
    r = _importer({})
    assert r.returncode == 0, r.stderr


def test_la_cle_de_l_environnement_est_bien_celle_qui_signe():
    r = subprocess.run(
        [sys.executable, "-c",
         "from app.core.auth import SECRET_KEY; print(SECRET_KEY)"],
        cwd=RACINE, env={**os.environ, "NOVAC_JWT_SECRET": "cle-de-test-123"},
        capture_output=True, text=True,
    )
    assert r.returncode == 0, r.stderr
    assert r.stdout.strip() == "cle-de-test-123"
