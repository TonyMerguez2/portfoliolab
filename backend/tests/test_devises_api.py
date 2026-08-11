"""
La devise d'affichage vue de l'API : liste, écriture, refus.

Ce qui est couvert ici et pas dans `test_devises.py` — lequel teste la partie pure —
c'est le **chemin d'écriture**, seul endroit où une valeur illégale peut entrer en base.

⚠️ Le compte de test est créé sur une base **jetable**, par le code de l'application, avec
une chaîne factice en guise de mot de passe, et le jeton vient de la fabrique de jetons du
projet. Rien de tout cela ne touche un compte réel ni une donnée réelle : c'est la seule
façon d'atteindre une route qui décode elle-même son jeton.

Exécution : cd backend && ./venv/bin/python -m pytest tests/test_devises_api.py -v
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session


@pytest.fixture(name="client")
def client_fixture(monkeypatch):
    fichier = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    fichier.close()
    engine = create_engine(f"sqlite:///{fichier.name}",
                           connect_args={"check_same_thread": False})

    from app.main import app
    from app.core.database import Base, get_db

    Base.metadata.create_all(engine)

    def get_db_test():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_db] = get_db_test

    # ⚠️ Aucun appel réseau dans un test : `taux_courants` interroge le fournisseur, ce qui
    # rendrait ce test lent, intermittent, et dépendant du week-end.
    monkeypatch.setattr("app.services.change.taux_courants", lambda: {})

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()
    engine.dispose()
    os.unlink(fichier.name)


def _compte(client) -> tuple[str, str]:
    """Un compte jetable et son jeton, par les routes de l'application."""
    r = client.post("/api/v1/auth/register",
                    json={"email": "devise@novac.local", "password": "x" * 12})
    assert r.status_code in (200, 201), r.text
    return r.json()["token"], r.json()["user"]["id"]


def test_la_liste_vient_du_serveur(client):
    """L'interface ne doit pas recopier les devises : symboles et décimales sont ici."""
    r = client.get("/api/v1/auth/devises")
    assert r.status_code == 200
    corps = r.json()
    codes = [d["code"] for d in corps["devises"]]
    assert corps["defaut"] == "USD"
    assert codes[0] == "USD", "le défaut doit être en tête"
    assert {"EUR", "JPY"} <= set(codes)
    par_code = {d["code"]: d for d in corps["devises"]}
    # Le yen n'a pas de centimes : c'est le genre de détail qu'une copie côté client perd.
    assert par_code["JPY"]["decimales"] == 0
    assert par_code["EUR"]["decimales"] == 2
    # Le dollar est le seul qui n'implique aucune conversion — d'où son statut de défaut.
    assert par_code["USD"]["conversion"] is False
    assert par_code["EUR"]["conversion"] is True


def test_un_taux_manquant_ne_devient_pas_zero(client):
    """
    Fournisseur muet : la devise reste proposée, sans taux.

    ⚠️ L'inverse serait grave. Un taux absent remplacé par 0 convertirait tous les montants
    en zéro ; remplacé par 1, il les laisserait en dollars sous un symbole d'euro. Absent
    est la seule valeur honnête.
    """
    corps = client.get("/api/v1/auth/devises").json()
    for d in corps["devises"]:
        assert d["taux"] is None
        assert d["taux_clair"] is None


def test_enregistrer_une_devise_connue(client):
    jeton, _ = _compte(client)
    entetes = {"Authorization": f"Bearer {jeton}"}

    # Par défaut, rien n'est choisi : `devise()` retombe alors sur le dollar.
    assert client.get("/api/v1/auth/me", headers=entetes).json()["devise"] is None

    r = client.put("/api/v1/auth/profile", json={"devise": "EUR"}, headers=entetes)
    assert r.status_code == 200, r.text
    assert r.json()["devise"] == "EUR"

    # ⚠️ Relue par /me, et non seulement rendue par l'écriture : c'est /me que consulte
    # l'interface au chargement, et une préférence qui ne s'y trouve pas serait perdue à
    # chaque visite tout en paraissant enregistrée.
    assert client.get("/api/v1/auth/me", headers=entetes).json()["devise"] == "EUR"


def test_la_casse_est_normalisee(client):
    """« eur » entre comme « EUR » : sinon la comparaison au catalogue échoue plus tard."""
    jeton, _ = _compte(client)
    entetes = {"Authorization": f"Bearer {jeton}"}
    r = client.put("/api/v1/auth/profile", json={"devise": "eur"}, headers=entetes)
    assert r.status_code == 200, r.text
    assert r.json()["devise"] == "EUR"


def test_une_devise_inconnue_est_refusee(client):
    """
    Refus à l'écriture, et non retombée silencieuse à l'affichage.

    ⚠️ `devise()` retombe sur le dollar pour ne jamais lever, ce qui est le bon choix en
    lecture — mais fait de toute valeur illégale en base un affichage muet en dollars. La
    validation doit donc mordre ici, au seul point d'entrée.
    """
    jeton, _ = _compte(client)
    entetes = {"Authorization": f"Bearer {jeton}"}
    r = client.put("/api/v1/auth/profile", json={"devise": "XYZ"}, headers=entetes)
    assert r.status_code == 422, r.text
    assert "EUR" in r.json()["detail"], "le refus doit nommer les valeurs acceptées"
    # Et rien n'a été écrit.
    assert client.get("/api/v1/auth/me", headers=entetes).json()["devise"] is None


def test_le_pseudo_seul_ne_touche_pas_la_devise(client):
    """Un champ absent du corps reste inchangé — pas remis à zéro."""
    jeton, _ = _compte(client)
    entetes = {"Authorization": f"Bearer {jeton}"}
    client.put("/api/v1/auth/profile", json={"devise": "JPY"}, headers=entetes)
    r = client.put("/api/v1/auth/profile", json={"username": "Claude"}, headers=entetes)
    assert r.status_code == 200, r.text
    assert r.json()["username"] == "Claude"
    assert r.json()["devise"] == "JPY"


def test_sans_jeton_pas_d_ecriture(client):
    r = client.put("/api/v1/auth/profile", json={"devise": "EUR"})
    assert r.status_code == 401
