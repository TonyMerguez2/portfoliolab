"""
Les mouvements de trésorerie : versements et retraits datés.

⚠️ **Le test qui compte ici est celui qui sépare verser de corriger.** Les deux gestes
changent le même chiffre, et rien dans la base ne les distingue une fois écrits : seul
le chemin emprunté fait la différence. Une confusion entre les deux ne se verrait pas à
la lecture d'un solde — elle se verrait des mois plus tard, sur une courbe qui affiche
des apports que personne n'a faits.
"""

import os
import tempfile

import pytest
from types import SimpleNamespace
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session


@pytest.fixture(name="client")
def client_fixture():
    """Application montée sur une base jetable, avec un compte de test."""
    fichier = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    fichier.close()
    engine = create_engine(f"sqlite:///{fichier.name}",
                           connect_args={"check_same_thread": False})

    from app.main import app
    from app.core.database import get_db, Base
    from app.core.auth import require_auth

    Base.metadata.create_all(engine)

    def get_db_test():
        with Session(engine) as session:
            yield session

    compte = SimpleNamespace(id="user-test", email="test@novac.local", username="Test",
                             avatar_url=None, devise=None)

    app.dependency_overrides[get_db] = get_db_test
    app.dependency_overrides[require_auth] = lambda: compte

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()
    engine.dispose()
    os.unlink(fichier.name)


def creer_portefeuille(client, nom="Mouvements"):
    r = client.post("/api/v1/portfolios", json={
        "name": nom, "assets": [{"ticker": "AAPL", "weight": 100}], "color": "#5B8DEF",
    })
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def livret(client, pid, solde=5000.0, depuis="2026-01-10T00:00:00"):
    r = client.post(f"/api/v1/portfolios/{pid}/comptes", json={
        "nom": "Livret A", "genre": "epargne", "couleur": "#6366F1",
        "solde": solde, "solde_depuis": depuis,
    })
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def mouvements(client, pid, cid):
    r = client.get(f"/api/v1/portfolios/{pid}/comptes/{cid}/mouvements")
    assert r.status_code == 200, r.text
    return r.json()


# ── La distinction qui fonde tout ─────────────────────────────────────────────

def test_verser_monte_le_solde_et_laisse_une_trace(client):
    """Un versement déclaré : le solde suit, et le journal le retient."""
    pid = creer_portefeuille(client)
    cid = livret(client, pid)

    r = client.post(f"/api/v1/portfolios/{pid}/comptes/{cid}/mouvements",
                    json={"date": "2026-03-20T00:00:00", "montant": 500.0,
                          "note": "Prime"})
    assert r.status_code == 201, r.text
    assert r.json()["compte"]["solde"] == pytest.approx(5500.0)

    j = mouvements(client, pid, cid)
    assert len(j) == 1
    assert j[0]["montant"] == pytest.approx(500.0)
    assert j[0]["note"] == "Prime"


def test_corriger_le_solde_ne_cree_aucun_mouvement(client):
    """
    ⚠️ **Le test qui grave la décision prise avec l'épargnant.** Passer un livret de
    5 000 à 5 500 € par l'écran de correction veut dire « je m'étais trompé », pas
    « j'ai versé 500 € ». Le journal doit rester vide — sans quoi la courbe afficherait
    un apport que personne n'a fait, et la faute de frappe deviendrait un événement.
    """
    pid = creer_portefeuille(client)
    cid = livret(client, pid)

    r = client.put(f"/api/v1/portfolios/{pid}/comptes/{cid}", json={
        "nom": "Livret A", "genre": "epargne", "couleur": "#6366F1",
        "solde": 5500.0, "solde_depuis": "2026-01-10T00:00:00",
    })
    assert r.status_code == 200, r.text
    assert r.json()["solde"] == pytest.approx(5500.0)
    assert mouvements(client, pid, cid) == [], (
        "corriger un solde n'est pas verser : aucune trace au journal")


def test_un_retrait_est_un_montant_negatif(client):
    pid = creer_portefeuille(client)
    cid = livret(client, pid)

    r = client.post(f"/api/v1/portfolios/{pid}/comptes/{cid}/mouvements",
                    json={"date": "2026-03-20T00:00:00", "montant": -300.0})
    assert r.status_code == 201, r.text
    assert r.json()["compte"]["solde"] == pytest.approx(4700.0)


def test_supprimer_un_mouvement_defait_son_effet(client):
    """
    ⚠️ Sans défaire l'effet, supprimer une erreur de saisie en créerait une autre : le
    compte resterait plus riche qu'il ne l'est, sans plus rien pour expliquer l'écart.
    """
    pid = creer_portefeuille(client)
    cid = livret(client, pid)

    m = client.post(f"/api/v1/portfolios/{pid}/comptes/{cid}/mouvements",
                    json={"date": "2026-03-20T00:00:00", "montant": 500.0}).json()
    assert m["compte"]["solde"] == pytest.approx(5500.0)

    r = client.delete(
        f"/api/v1/portfolios/{pid}/comptes/{cid}/mouvements/{m['mouvement']['id']}")
    assert r.status_code == 200, r.text
    assert r.json()["compte"]["solde"] == pytest.approx(5000.0)
    assert mouvements(client, pid, cid) == []


# ── Les refus ─────────────────────────────────────────────────────────────────

def test_un_compte_sans_solde_refuse_les_mouvements(client):
    """
    ⚠️ Un mouvement se retranche du solde actuel pour remonter le temps. Sans solde, il
    n'y a rien dont le retrancher — et le compte porterait un journal sans jamais rien
    valoir.
    """
    pid = creer_portefeuille(client)
    r = client.post(f"/api/v1/portfolios/{pid}/comptes",
                    json={"nom": "PEA", "genre": "pea", "couleur": "#6366F1"})
    cid = r.json()["id"]

    r = client.post(f"/api/v1/portfolios/{pid}/comptes/{cid}/mouvements",
                    json={"date": "2026-03-20T00:00:00", "montant": 500.0})
    assert r.status_code == 400
    assert "solde" in r.json()["detail"].lower()


def test_un_mouvement_nul_est_refuse(client):
    """Il n'ajouterait rien et poserait sur la courbe une pastille sans effet."""
    pid = creer_portefeuille(client)
    cid = livret(client, pid)
    r = client.post(f"/api/v1/portfolios/{pid}/comptes/{cid}/mouvements",
                    json={"date": "2026-03-20T00:00:00", "montant": 0})
    assert r.status_code == 400


def test_le_compte_d_un_autre_portefeuille_est_introuvable(client):
    """La même fermeture que partout ailleurs : deviner un UUID ne suffit pas."""
    a = creer_portefeuille(client, "A")
    b = creer_portefeuille(client, "B")
    cid = livret(client, a)

    r = client.post(f"/api/v1/portfolios/{b}/comptes/{cid}/mouvements",
                    json={"date": "2026-03-20T00:00:00", "montant": 500.0})
    assert r.status_code == 404


def test_supprimer_le_compte_emporte_ses_mouvements(client):
    """
    ⚠️ Le journal n'a pas de sens sans son compte. Contrairement aux opérations, qui sont
    des faits qu'on détache, un mouvement de trésorerie ne décrit que ce compte-là.
    """
    from app.core.database import MouvementTresorerie

    pid = creer_portefeuille(client)
    cid = livret(client, pid)
    client.post(f"/api/v1/portfolios/{pid}/comptes/{cid}/mouvements",
                json={"date": "2026-03-20T00:00:00", "montant": 500.0})

    assert client.delete(f"/api/v1/portfolios/{pid}/comptes/{cid}").status_code == 200

    from app.main import app
    from app.core.database import get_db
    db = next(app.dependency_overrides[get_db]())
    restants = db.query(MouvementTresorerie).filter(
        MouvementTresorerie.compte_id == cid).count()
    assert restants == 0, "les mouvements d'un compte supprimé ne survivent pas"
