"""
Les mouvements de trésorerie : versements et retraits datés.

⚠️ **Le test qui compte ici est celui qui sépare verser de corriger.** Les deux gestes
changent le même chiffre, et rien dans la base ne les distingue une fois écrits : seul
le chemin emprunté fait la différence. Une confusion entre les deux ne se verrait pas à
la lecture d'un solde — elle se verrait des mois plus tard, sur une courbe qui affiche
des apports que personne n'a faits.

⚠️ **La distinction survit à la refonte, mais elle a changé d'adresse.** Corriger passait
par le formulaire du compte, qui réécrivait un champ `solde` posé à côté du journal ;
c'est cette couture qui a fini par se déchirer. Le compte n'ayant plus de solde propre,
corriger se dit maintenant sur l'apport lui-même — `PUT .../mouvements/{id}` — et verser
reste l'ajout d'une ligne. Deux verbes, un seul endroit où l'argent est écrit.
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


def livret(client, pid, montant=5000.0, quand="2026-01-10T00:00:00"):
    r = client.post(f"/api/v1/portfolios/{pid}/comptes", json={
        "nom": "Livret A", "genre": "epargne", "couleur": "#6366F1",
        "apport_initial": montant, "apport_le": quand,
    })
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def compte_nu(client, pid, nom="PEA", genre="pea"):
    """Un compte déclaré sans le moindre euro : son journal est vide."""
    r = client.post(f"/api/v1/portfolios/{pid}/comptes",
                    json={"nom": nom, "genre": genre, "couleur": "#6366F1"})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def mouvements(client, pid, cid):
    r = client.get(f"/api/v1/portfolios/{pid}/comptes/{cid}/mouvements")
    assert r.status_code == 200, r.text
    return r.json()


def saisis(client, pid, cid):
    """
    Le journal **sans l'apport initial**.

    ⚠️ **Déclarer un compte écrit un apport daté, et rien d'autre.** Les tests qui
    vérifient ce qu'un geste ajoute au journal doivent donc écarter ce qui s'y trouvait
    déjà, faute de quoi ils mesurent la création du compte en croyant mesurer le geste.
    """
    return [m for m in mouvements(client, pid, cid) if m["note"] != "Apport initial"]


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

    j = saisis(client, pid, cid)
    assert len(j) == 1
    assert j[0]["montant"] == pytest.approx(500.0)
    assert j[0]["note"] == "Prime"


def test_corriger_un_apport_ne_cree_aucun_second_apport(client):
    """
    ⚠️ **Le test qui grave la décision prise avec l'épargnant, déplacé là où elle se prend
    désormais.** Passer un livret de 5 000 à 5 500 € veut dire « je m'étais trompé », pas
    « j'ai versé 500 € ». La correction s'écrit maintenant sur l'apport lui-même, comme on
    rectifie un achat de titres mal saisi ; ce qu'elle ne doit toujours pas faire, c'est
    ajouter une ligne — sans quoi la courbe afficherait un versement que personne n'a fait.
    """
    pid = creer_portefeuille(client)
    cid = livret(client, pid)
    ouverture = mouvements(client, pid, cid)[0]

    r = client.put(
        f"/api/v1/portfolios/{pid}/comptes/{cid}/mouvements/{ouverture['id']}",
        json={"date": "2026-01-10T00:00:00", "montant": 5500.0,
              "note": "Apport initial"})
    assert r.status_code == 200, r.text
    assert r.json()["compte"]["solde"] == pytest.approx(5500.0)
    assert len(mouvements(client, pid, cid)) == 1, (
        "corriger un apport n'est pas verser : le journal garde une seule ligne")


def test_modifier_la_fiche_du_compte_ne_touche_pas_a_son_argent(client):
    """
    ⚠️ **La couture qu'on vient de supprimer, gardée fermée.** Le formulaire du compte
    réécrivait un champ `solde` posé à côté du journal, et les deux ont fini par diverger
    sur cinq comptes sur six. Renommer un livret ne doit plus rien pouvoir faire à ce
    qu'il contient.
    """
    pid = creer_portefeuille(client)
    cid = livret(client, pid)

    r = client.put(f"/api/v1/portfolios/{pid}/comptes/{cid}", json={
        "nom": "Livret bleu", "genre": "epargne", "couleur": "#6366F1",
        "apport_initial": 99999.0, "apport_le": "2026-01-10T00:00:00",
    })
    assert r.status_code == 200, r.text
    assert r.json()["solde"] == pytest.approx(5000.0), (
        "un apport passé au formulaire de modification ne doit pas réécrire le journal")
    assert len(mouvements(client, pid, cid)) == 1


def test_l_apport_initial_entre_au_journal(client):
    """
    ⚠️ **Déclarer un compte avec de l'argent est un apport, pas un réglage.** Le geste
    range une somme datée dans le patrimoine, exactement comme un versement fait plus tard.
    Rangé à part, il laissait la plus grosse marche de la courbe — celle de la déclaration
    — sans repère, quand les versements suivants en avaient un. Signalé à l'usage.
    """
    pid = creer_portefeuille(client)
    cid = livret(client, pid, montant=5000.0, quand="2026-02-10T00:00:00")

    j = mouvements(client, pid, cid)
    assert len(j) == 1, "l'apport initial doit figurer au journal"
    assert j[0]["montant"] == pytest.approx(5000.0)
    assert j[0]["date"].startswith("2026-02-10")
    assert j[0]["note"] == "Apport initial"


def test_le_solde_rendu_est_la_somme_du_journal(client):
    """
    ⚠️ **C'est la refonte en une assertion.** Le compte n'a plus de solde propre : ce que
    l'API rend est calculé, et doit suivre le journal à l'euro près quel que soit le
    nombre d'écritures.
    """
    pid = creer_portefeuille(client)
    cid = livret(client, pid, montant=5000.0, quand="2026-02-10T00:00:00")
    for montant in (500.0, -200.0, 1000.0):
        client.post(f"/api/v1/portfolios/{pid}/comptes/{cid}/mouvements",
                    json={"date": "2026-03-20T00:00:00", "montant": montant})

    c = next(x for x in client.get(f"/api/v1/portfolios/{pid}/comptes").json()
             if x["id"] == cid)
    assert c["solde"] == pytest.approx(6300.0)


def test_la_date_du_dernier_apport_est_rendue(client):
    """
    ⚠️ **L'âge de l'argent, et non celui de la fiche.** La carte d'un livret annonçait
    « Solde déclaré il y a 8 mois » d'après `mis_a_jour_le` : renommer le compte
    rajeunissait donc son solde sans qu'un euro ait bougé. Le journal répond exactement.
    """
    pid = creer_portefeuille(client)
    cid = livret(client, pid, montant=5000.0, quand="2026-02-10T00:00:00")
    client.post(f"/api/v1/portfolios/{pid}/comptes/{cid}/mouvements",
                json={"date": "2026-06-01T00:00:00", "montant": 500.0})

    lu = lambda: next(x for x in client.get(f"/api/v1/portfolios/{pid}/comptes").json()
                      if x["id"] == cid)
    assert lu()["dernier_apport_le"].startswith("2026-06-01")

    # Renommer ne doit pas déplacer la date d'un centime d'argent.
    client.put(f"/api/v1/portfolios/{pid}/comptes/{cid}", json={
        "nom": "Livret renommé", "genre": "epargne", "couleur": "#6366F1"})
    assert lu()["dernier_apport_le"].startswith("2026-06-01")


def test_un_compte_declare_sans_argent_a_un_journal_vide(client):
    """
    ⚠️ **Un journal vide n'est pas un solde de zéro.** Un PEA dont on ne connaît que les
    lignes ne déclare aucune espèce, ce qui n'est pas la même chose que d'en déclarer zéro
    — et c'est ce qui empêche l'écran de lui dessiner une poche de liquidités plate.
    """
    pid = creer_portefeuille(client)
    cid = compte_nu(client, pid)
    assert mouvements(client, pid, cid) == []

    c = next(x for x in client.get(f"/api/v1/portfolios/{pid}/comptes").json()
             if x["id"] == cid)
    assert c["solde"] is None


def test_un_retrait_est_un_montant_negatif(client):
    pid = creer_portefeuille(client)
    cid = livret(client, pid)

    r = client.post(f"/api/v1/portfolios/{pid}/comptes/{cid}/mouvements",
                    json={"date": "2026-03-20T00:00:00", "montant": -300.0})
    assert r.status_code == 201, r.text
    assert r.json()["compte"]["solde"] == pytest.approx(4700.0)


def test_supprimer_un_mouvement_defait_son_effet(client):
    """
    ⚠️ Le solde étant la somme du journal, retirer la ligne suffit — il n'y a plus de
    second chiffre à défaire à côté, donc plus d'oubli possible. C'est ce que la refonte
    achète ici : l'invariant tient par construction au lieu de tenir par vigilance.
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
    assert saisis(client, pid, cid) == []


# ── Les refus ─────────────────────────────────────────────────────────────────

def test_un_compte_sans_argent_accepte_un_premier_apport(client):
    """
    ⚠️ **Le refus d'hier est devenu l'usage normal, et c'est un gain de la refonte.** Un
    mouvement se retranchait d'un solde qui devait donc exister d'abord : déclarer un
    compte nu puis y verser était impossible, alors que c'est l'ordre naturel des choses.
    Le cumul n'a besoin de rien — le premier apport déclare les espèces.
    """
    pid = creer_portefeuille(client)
    cid = compte_nu(client, pid)

    r = client.post(f"/api/v1/portfolios/{pid}/comptes/{cid}/mouvements",
                    json={"date": "2026-03-20T00:00:00", "montant": 500.0})
    assert r.status_code == 201, r.text
    assert r.json()["compte"]["solde"] == pytest.approx(500.0)


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
