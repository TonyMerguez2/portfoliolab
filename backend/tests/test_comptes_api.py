"""
Les comptes déclarés d'un portefeuille, côté API.

Ces routes remplacent une **déduction** par une **donnée** : jusqu'ici chaque ligne était
rangée dans « PEA », « CTO » ou « Crypto » d'après sa place de cotation, ce qui ne pouvait
ni décrire un compte courant ni distinguer deux PEA. Ce qu'on éprouve ici, c'est
précisément ce qu'une inférence ne garantissait pas : qu'un compte appartienne à un
portefeuille et à un seul, que son genre soit reconnu, et qu'en le supprimant on ne
supprime pas l'histoire des opérations qu'il portait.

Exécution : cd backend && ./venv/bin/python -m pytest tests/test_comptes_api.py -v
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

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


def creer_portefeuille(client, nom="Test"):
    r = client.post("/api/v1/portfolios", json={
        "name": nom,
        "assets": [{"ticker": "AAPL", "weight": 100}],
        "color": "#5B8DEF",
    })
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def relire(client, pid):
    """
    Le portefeuille tel que l'écran le reçoit.

    ⚠️ **Par la liste, parce qu'aucune route ne rend un portefeuille seul.** Écrit
    d'abord en `GET /portfolios/{id}`, ce test passait sur la réponse d'une route qui
    n'existe pas — donc sur un corps d'erreur, dans lequel n'importe quelle clé manque.
    C'est la liste que le client interroge, et c'est donc elle qui doit porter le champ.
    """
    lot = client.get("/api/v1/portfolios").json()
    return next(p for p in lot if p["id"] == pid)


#: La date d'un apport, quand le test ne s'intéresse pas à laquelle.
#:
#: ⚠️ **Un apport sans date est refusé, et c'est voulu.** Il ne se placerait nulle part sur
#: la courbe — le défaut même que la refonte du journal répare. Les tests qui déclarent de
#: l'argent doivent donc dire quand, comme l'écran l'exige.
QUAND = "2026-01-05T00:00:00"


def compte_valide(**ecrase):
    return {"nom": "PEA Boursorama", "genre": "pea", "couleur": "#22C55E", **ecrase}


def avec_apport(montant, quand=QUAND, **ecrase):
    """Un compte valide qui porte de l'argent, daté."""
    return compte_valide(apport_initial=montant, apport_le=quand, **ecrase)


# ── Le parcours ordinaire ─────────────────────────────────────────────────────

def test_creation_lecture_modification(client):
    pid = creer_portefeuille(client)

    r = client.post(f"/api/v1/portfolios/{pid}/comptes", json=avec_apport(1200.0))
    assert r.status_code == 200, r.text
    c = r.json()
    assert c["nom"] == "PEA Boursorama"
    assert c["genre"] == "pea"
    assert c["libelle_genre"] == "PEA"
    assert c["porte_des_titres"] is True
    assert c["solde"] == 1200.0

    liste = client.get(f"/api/v1/portfolios/{pid}/comptes").json()
    assert [x["id"] for x in liste] == [c["id"]]

    r = client.put(f"/api/v1/portfolios/{pid}/comptes/{c['id']}",
                   json=compte_valide(nom="  PEA Fortuneo  ", couleur="#F43F5E"))
    assert r.status_code == 200, r.text
    # Le nom est nettoyé à l'enregistrement, pas seulement à l'affichage.
    assert r.json()["nom"] == "PEA Fortuneo"
    assert r.json()["couleur"] == "#F43F5E"


def test_un_compte_sans_titres_se_declare_aussi(client):
    """
    ⚠️ **C'est le cas que l'inférence ne pouvait pas atteindre.** Un livret ne détient
    aucune ligne, donc aucune place de cotation ne le révèle : il n'existait tout
    simplement pas dans l'écran des comptes. Sa valeur est la somme de ses apports, et le
    drapeau `porte_des_titres` est ce qui empêche de l'additionner comme un portefeuille.
    """
    pid = creer_portefeuille(client)
    r = client.post(f"/api/v1/portfolios/{pid}/comptes",
                    json={"nom": "Livret A", "genre": "epargne", "couleur": "#F59E0B",
                          "apport_initial": 8400.0, "apport_le": QUAND})
    assert r.status_code == 200, r.text
    assert r.json()["porte_des_titres"] is False
    # ⚠️ Le solde rendu est calculé depuis le journal, il n'est plus stocké nulle part.
    assert r.json()["solde"] == 8400.0


def test_la_date_de_saisie_est_rendue_et_suit_les_corrections(client):
    """
    ⚠️ **La date de déclaration du compte, à ne pas confondre avec celle de son argent.**
    Chaque apport porte désormais la sienne, ce qui répond à « depuis quand » bien mieux
    que ce champ ne le faisait. Reste ce qu'il dit vraiment : quand la fiche du compte a
    été touchée pour la dernière fois — son nom, sa couleur, son rang.
    """
    from datetime import datetime

    pid = creer_portefeuille(client)
    c = client.post(f"/api/v1/portfolios/{pid}/comptes",
                    json={"nom": "Livret A", "genre": "epargne", "couleur": "#F59E0B",
                          "apport_initial": 8400.0, "apport_le": QUAND}).json()
    assert c["mis_a_jour_le"], "aucune date de saisie rendue"
    pose = datetime.fromisoformat(c["mis_a_jour_le"])

    corrige = client.put(f"/api/v1/portfolios/{pid}/comptes/{c['id']}",
                         json={"nom": "Livret bleu", "genre": "epargne",
                               "couleur": "#F59E0B"}).json()
    assert datetime.fromisoformat(corrige["mis_a_jour_le"]) >= pose
    # ⚠️ **L'argent n'a pas bougé, et c'est la garde de la refonte.** Modifier la fiche
    # d'un compte ne touche plus à son journal : la somme reste celle qu'on a apportée.
    assert corrige["solde"] == 8400.0


def test_le_rang_range_en_queue(client):
    """On déclare un compte de plus ; on ne réordonne pas ceux qu'on avait rangés."""
    pid = creer_portefeuille(client)
    for nom in ["Premier", "Deuxième", "Troisième"]:
        client.post(f"/api/v1/portfolios/{pid}/comptes", json=compte_valide(nom=nom))
    liste = client.get(f"/api/v1/portfolios/{pid}/comptes").json()
    assert [c["nom"] for c in liste] == ["Premier", "Deuxième", "Troisième"]
    assert [c["rang"] for c in liste] == [0, 1, 2]


def test_les_genres_sont_publies(client):
    """
    Le formulaire ne réécrit pas la liste : recopiée, elle aurait divergé au premier
    genre ajouté, et l'écran aurait proposé un choix que le serveur refuse.
    """
    genres = client.get("/api/v1/genres-de-compte").json()
    cles = {g["cle"] for g in genres}
    assert cles == {"courant", "epargne", "pea", "cto", "av", "per", "pee", "crypto"}
    # ⚠️ Seuls le compte courant et l'épargne valent leur solde ; tout le reste détient des
    # lignes. L'assurance-vie et le PER sont du second groupe par approximation — un contrat
    # porte aussi un fonds en euros, que ce booléen ne sait pas dire. Voir `GENRES_COMPTE`.
    assert {g["cle"] for g in genres if not g["titres"]} == {"courant", "epargne"}


# ── Ce que la saisie doit refuser ─────────────────────────────────────────────

@pytest.mark.parametrize("charge, motif", [
    ({"nom": "", "genre": "pea", "couleur": "#22C55E"}, "nom vide"),
    ({"nom": "   ", "genre": "pea", "couleur": "#22C55E"}, "nom fait d'espaces"),
    ({"nom": "x" * 61, "genre": "pea", "couleur": "#22C55E"}, "nom trop long"),
    # ⚠️ **Plus « assurance-vie » : elle existe désormais, sous la clé `av`.** Le cas se
    # lisait comme une enveloppe manquante alors qu'il ne teste que le refus d'une clé
    # inconnue — le jour de son ajout, il serait passé au vert en testant autre chose.
    ({"nom": "A", "genre": "matelas", "couleur": "#22C55E"}, "genre inconnu"),
    ({"nom": "A", "genre": "pea", "couleur": "vert"}, "couleur non hexadécimale"),
    ({"nom": "A", "genre": "pea", "couleur": "#22C5"}, "couleur trop courte"),
    ({"nom": "A", "genre": "pea", "couleur": "#22C55E",
      "apport_initial": -1, "apport_le": QUAND}, "apport négatif"),
    # ⚠️ **Un apport sans date se perdrait sur la courbe**, et c'est très exactement le
    # défaut que la refonte répare : un montant qu'on ne sait pas placer ne se dessine
    # nulle part, et le compte vaut alors zéro partout tout en affichant sa somme.
    ({"nom": "A", "genre": "pea", "couleur": "#22C55E",
      "apport_initial": 500.0}, "apport sans date"),
])
def test_saisies_refusees(client, charge, motif):
    """
    ⚠️ **Le nom fait d'espaces est le cas qui a fait inverser l'ordre du contrôle.**
    Mesuré avant nettoyage, « soixante espaces » passe la longueur et donne un compte
    sans nom visible — présent dans la base, invisible à l'écran.
    """
    pid = creer_portefeuille(client)
    r = client.post(f"/api/v1/portfolios/{pid}/comptes", json=charge)
    assert r.status_code == 400, f"{motif} accepté : {r.text}"


# ── L'appartenance ────────────────────────────────────────────────────────────

def test_un_compte_ne_se_lit_pas_depuis_un_autre_portefeuille(client):
    """
    ⚠️ **Le filtre porte sur les deux identifiants, et voici pourquoi.** Chercher par le
    seul identifiant de compte laisserait modifier celui d'un autre portefeuille — d'un
    autre épargnant, le jour où il y en a plusieurs — pourvu qu'on en devine l'UUID.
    """
    a = creer_portefeuille(client, "A")
    b = creer_portefeuille(client, "B")
    cid = client.post(f"/api/v1/portfolios/{a}/comptes", json=compte_valide()).json()["id"]

    assert client.get(f"/api/v1/portfolios/{b}/comptes").json() == []
    assert client.put(f"/api/v1/portfolios/{b}/comptes/{cid}",
                      json=compte_valide(nom="Détourné")).status_code == 404
    assert client.delete(f"/api/v1/portfolios/{b}/comptes/{cid}").status_code == 404
    # Et le compte d'origine n'a pas bougé.
    assert client.get(f"/api/v1/portfolios/{a}/comptes").json()[0]["nom"] == "PEA Boursorama"


def test_portefeuille_inconnu(client):
    r = client.post("/api/v1/portfolios/inexistant/comptes", json=compte_valide())
    assert r.status_code == 404


def test_une_operation_ne_se_range_pas_dans_le_compte_d_un_autre(client):
    """
    ⚠️ **Refuser plutôt qu'ignorer.** Écrire `None` en silence rangerait la ligne
    ailleurs que là où l'appelant l'a demandé. Et laisser passer l'identifiant la ferait
    disparaître des deux rangements à la fois : de son compte, qui n'est pas dans ce
    portefeuille, et du classement par déduction, qui ne regarde que les lignes détachées.
    """
    a = creer_portefeuille(client, "A")
    b = creer_portefeuille(client, "B")
    cid = client.post(f"/api/v1/portfolios/{a}/comptes", json=compte_valide()).json()["id"]

    ecriture = {"ticker": "AAPL", "asset_type": "EQUITY", "side": "BUY",
                "quantity": 1, "unit_price": 100.0, "fees": 0.0,
                "executed_at": "2024-01-10T00:00:00"}

    assert client.post(f"/api/v1/portfolios/{b}/transactions",
                       json={**ecriture, "compte_id": cid}).status_code == 400
    assert client.post(f"/api/v1/portfolios/{a}/transactions",
                       json={**ecriture, "compte_id": "inexistant"}).status_code == 400
    # Sans compte, la saisie passe comme avant : c'est le parcours de qui n'a rien déclaré.
    r = client.post(f"/api/v1/portfolios/{a}/transactions", json=ecriture)
    assert r.status_code in (200, 201), r.text
    assert r.json()["compte_id"] is None


# ── La suppression ────────────────────────────────────────────────────────────

def test_supprimer_un_compte_detache_ses_operations_sans_les_perdre(client):
    """
    ⚠️ **C'est l'invariant qui justifie une boucle explicite dans la route.** `compte_id`
    n'est pas une clé étrangère — SQLite ne sait pas en ajouter une par `ALTER TABLE`, et
    c'est par là que passent les bases déjà créées. Sans ce détachement, les lignes
    garderaient l'identifiant d'un compte disparu : elles ne s'afficheraient plus nulle
    part, ni dans un compte, ni dans le rangement par déduction qui ne regarde que les
    lignes détachées.

    ⚠️ **Et une opération ne se supprime pas avec son compte.** Elle a eu lieu : la
    valorisation du portefeuille en dépend.
    """
    pid = creer_portefeuille(client)
    cid = client.post(f"/api/v1/portfolios/{pid}/comptes", json=compte_valide()).json()["id"]

    r = client.post(f"/api/v1/portfolios/{pid}/transactions", json={
        "ticker": "AAPL", "asset_type": "EQUITY", "side": "BUY",
        "quantity": 3, "unit_price": 100.0, "fees": 0.0,
        "executed_at": "2024-01-10T00:00:00", "compte_id": cid,
    })
    assert r.status_code in (200, 201), r.text

    avant = client.get(f"/api/v1/portfolios/{pid}/transactions").json()
    assert len(avant) == 1
    # ⚠️ **Sans cette ligne, le test passait sans rien prouver.** La saisie ignorait
    # `compte_id` : l'opération n'était donc jamais rattachée, et le détachement
    # « réussissait » sur une ligne qui n'avait jamais rien à détacher.
    assert avant[0]["compte_id"] == cid, "l'opération n'a pas été rattachée au compte"

    r = client.delete(f"/api/v1/portfolios/{pid}/comptes/{cid}")
    assert r.status_code == 200, r.text

    apres = client.get(f"/api/v1/portfolios/{pid}/transactions").json()
    assert len(apres) == 1, "l'opération a disparu avec son compte"
    assert apres[0].get("compte_id") in (None, ""), "l'opération pointe un compte disparu"
    assert client.get(f"/api/v1/portfolios/{pid}/comptes").json() == []


# ── La couleur des dossiers déduits ───────────────────────────────────────────

def test_couleurs_des_dossiers_deduits(client):
    """
    Un dossier déduit n'a pas de ligne en base, et retient quand même sa couleur.

    ⚠️ **C'est le portefeuille qui la porte, pas la table `comptes`.** PEA,
    compte-titres et crypto apparaissent à l'écran parce que des lignes s'y rangent
    d'après leur place de cotation. Leur créer un compte pour retenir une teinte en
    ferait des comptes *déclarés*, donc des dossiers en plus de ceux qu'on devine —
    deux PEA côte à côte, dont l'un vide.
    """
    pid = creer_portefeuille(client)

    assert relire(client, pid).get("couleurs_comptes") is None

    r = client.put(f"/api/v1/portfolios/{pid}",
                   json={"couleurs_comptes": {"pea": "#22C55E", "crypto": "#F43F5E"}})
    assert r.status_code == 200, r.text
    assert r.json()["couleurs_comptes"] == {"pea": "#22C55E", "crypto": "#F43F5E"}

    assert relire(client, pid)["couleurs_comptes"]["pea"] == "#22C55E"

    # Retirer une teinte la rend au dossier : on renvoie la carte entière, pas un delta.
    r = client.put(f"/api/v1/portfolios/{pid}", json={"couleurs_comptes": {"pea": "#22C55E"}})
    assert r.status_code == 200, r.text
    assert r.json()["couleurs_comptes"] == {"pea": "#22C55E"}


def test_couleurs_refusees(client):
    """
    ⚠️ **Sans bornes, ce champ devient un fourre-tout.** Il accepte du JSON libre :
    n'importe quelle clé, n'importe quelle chaîne, et un jour une valeur recopiée telle
    quelle dans un attribut de style. Les clés sont donc celles que le serveur publie,
    et les valeurs des couleurs.
    """
    pid = creer_portefeuille(client)

    r = client.put(f"/api/v1/portfolios/{pid}", json={"couleurs_comptes": {"livret_a": "#22C55E"}})
    assert r.status_code == 422, "un genre inconnu doit être refusé"

    r = client.put(f"/api/v1/portfolios/{pid}", json={"couleurs_comptes": {"pea": "vert"}})
    assert r.status_code == 422, "une couleur qui n'en est pas une doit être refusée"

    r = client.put(f"/api/v1/portfolios/{pid}",
                   json={"couleurs_comptes": {"pea": "javascript:alert(1)"}})
    assert r.status_code == 422

    assert relire(client, pid).get("couleurs_comptes") in (None, {})


# ── Le rattachement d'opérations déjà saisies ─────────────────────────────────

def operation(client, pid, ticker="AAPL", compte=None, quantite=3.0):
    """Une écriture, rattachée ou non, dont on rend l'identifiant."""
    corps = {
        "ticker": ticker, "asset_type": "EQUITY", "side": "BUY",
        "quantity": quantite, "unit_price": 100.0, "fees": 0.0,
        "executed_at": "2024-01-10T00:00:00",
    }
    if compte:
        corps["compte_id"] = compte
    r = client.post(f"/api/v1/portfolios/{pid}/transactions", json=corps)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def comptes_des_operations(client, pid):
    """`{id: compte_id}` tel que l'écran le lit."""
    lot = client.get(f"/api/v1/portfolios/{pid}/transactions").json()
    lignes = lot if isinstance(lot, list) else lot.get("transactions", [])
    return {t["id"]: t.get("compte_id") for t in lignes}


def test_rattacher_des_operations_deja_saisies(client):
    """
    ⚠️ **C'est ce qui permet de déclarer un dossier deviné.** Un compte déclaré ne pouvait
    contenir que des opérations créées après lui : l'histoire déjà saisie restait rangée
    par déduction, sans moyen de la reprendre. Déclarer son PEA donnait donc un dossier
    vide à côté du dossier deviné toujours plein.
    """
    pid = creer_portefeuille(client)
    cid = client.post(f"/api/v1/portfolios/{pid}/comptes", json=compte_valide()).json()["id"]
    a, b = operation(client, pid), operation(client, pid, ticker="MC.PA")

    r = client.post(f"/api/v1/portfolios/{pid}/comptes/{cid}/operations",
                    json={"operations": [a, b]})
    assert r.status_code == 200, r.text
    assert r.json() == {"rattachees": 2, "deplacees": 0}
    assert comptes_des_operations(client, pid) == {a: cid, b: cid}


def test_le_rattachement_est_idempotent(client):
    """
    Rejouer l'appel ne doit ni échouer ni annoncer un déplacement.

    ⚠️ **Et c'est là que `Query.update()` piège.** Il rend le nombre de lignes *appariées*,
    pas modifiées : compter les déplacements après l'écriture aurait annoncé « déplacée »
    une opération qui n'avait pas bougé d'un pouce.
    """
    pid = creer_portefeuille(client)
    cid = client.post(f"/api/v1/portfolios/{pid}/comptes", json=compte_valide()).json()["id"]
    a = operation(client, pid)

    premier = client.post(f"/api/v1/portfolios/{pid}/comptes/{cid}/operations",
                          json={"operations": [a]}).json()
    second = client.post(f"/api/v1/portfolios/{pid}/comptes/{cid}/operations",
                         json={"operations": [a]}).json()
    assert premier == second == {"rattachees": 1, "deplacees": 0}
    assert comptes_des_operations(client, pid) == {a: cid}


def test_rien_n_est_ecrit_si_une_operation_est_etrangere(client):
    """
    ⚠️ **Le test qui vaut le plus cher.** Un rattachement partiel laisserait « trois sur
    cinq » sans aucun moyen de nommer les deux autres : l'appelant ne saurait pas quoi
    reprendre, et l'écran afficherait un dossier à moitié rempli sans rien signaler. On
    vérifie donc que l'opération **valide** du lot est restée détachée.
    """
    pid = creer_portefeuille(client)
    autre = creer_portefeuille(client, nom="Ailleurs")
    cid = client.post(f"/api/v1/portfolios/{pid}/comptes", json=compte_valide()).json()["id"]
    mienne = operation(client, pid)
    etrangere = operation(client, autre)

    r = client.post(f"/api/v1/portfolios/{pid}/comptes/{cid}/operations",
                    json={"operations": [mienne, etrangere]})
    assert r.status_code == 400, r.text
    assert comptes_des_operations(client, pid) == {mienne: None}, "le lot a été écrit à moitié"
    assert comptes_des_operations(client, autre) == {etrangere: None}


def test_un_compte_sans_titres_refuse_les_operations(client):
    """
    Un livret n'a pas d'opérations : son solde **est** sa valeur. Y ranger un achat le
    ferait compter deux fois — une fois dans le solde saisi, une fois dans la valorisation.
    """
    pid = creer_portefeuille(client)
    livret = client.post(f"/api/v1/portfolios/{pid}/comptes",
                         json=avec_apport(5000.0, nom="Livret A",
                                          genre="epargne")).json()["id"]
    a = operation(client, pid)

    r = client.post(f"/api/v1/portfolios/{pid}/comptes/{livret}/operations",
                    json={"operations": [a]})
    assert r.status_code == 400, r.text
    assert comptes_des_operations(client, pid) == {a: None}


def test_le_rattachement_deplace_et_le_dit(client):
    """
    Une opération qui change de compte quitte le précédent. C'est le seul effet qui puisse
    surprendre l'appelant, donc le seul qui doive être annoncé.
    """
    pid = creer_portefeuille(client)
    a_cpt = client.post(f"/api/v1/portfolios/{pid}/comptes",
                        json=compte_valide(nom="PEA A")).json()["id"]
    b_cpt = client.post(f"/api/v1/portfolios/{pid}/comptes",
                        json=compte_valide(nom="PEA B")).json()["id"]
    op = operation(client, pid, compte=a_cpt)

    r = client.post(f"/api/v1/portfolios/{pid}/comptes/{b_cpt}/operations",
                    json={"operations": [op]})
    assert r.json() == {"rattachees": 1, "deplacees": 1}
    assert comptes_des_operations(client, pid) == {op: b_cpt}


def test_une_liste_vide_ne_fait_rien_et_ne_rale_pas(client):
    """Le résultat naturel d'un dossier sans ligne. L'écran n'a pas à le traiter à part."""
    pid = creer_portefeuille(client)
    cid = client.post(f"/api/v1/portfolios/{pid}/comptes", json=compte_valide()).json()["id"]
    r = client.post(f"/api/v1/portfolios/{pid}/comptes/{cid}/operations", json={"operations": []})
    assert r.status_code == 200, r.text
    assert r.json() == {"rattachees": 0, "deplacees": 0}


def test_le_rattachement_ne_change_ni_les_positions_ni_le_total(client):
    """
    ⚠️ **La garde contre le double comptage, et elle est bien moins chère ici qu'à l'écran.**
    Rattacher ne fait que *ranger* : la valorisation du portefeuille ne regarde pas les
    dossiers. Si ce test venait à casser, c'est que le rattachement aurait commencé à
    modifier les opérations elles-mêmes.
    """
    pid = creer_portefeuille(client)
    cid = client.post(f"/api/v1/portfolios/{pid}/comptes", json=compte_valide()).json()["id"]
    a, b = operation(client, pid), operation(client, pid, ticker="MC.PA")

    avant = client.get(f"/api/v1/portfolios/{pid}/positions").json()
    client.post(f"/api/v1/portfolios/{pid}/comptes/{cid}/operations",
                json={"operations": [a, b]})
    apres = client.get(f"/api/v1/portfolios/{pid}/positions").json()

    assert avant["total_value"] == apres["total_value"]
    assert avant["total_invested"] == apres["total_invested"]
    assert ([(p["ticker"], p["quantity"], p["avg_cost"]) for p in avant["positions"]]
            == [(p["ticker"], p["quantity"], p["avg_cost"]) for p in apres["positions"]])


def test_rattacher_ne_vieillit_pas_le_solde(client):
    """
    ⚠️ **Un `db.refresh()` inoffensif suffirait à casser ça.** `Compte.mis_a_jour_le` porte
    un `onupdate` et nourrit la mention « Solde déclaré… » : toucher le compte en rattachant
    ferait dire « aujourd'hui » à un montant tapé en janvier. On écrit dans `transactions`,
    on lit dans `comptes`.
    """
    pid = creer_portefeuille(client)
    cid = client.post(f"/api/v1/portfolios/{pid}/comptes",
                      json=avec_apport(1200.0)).json()["id"]
    lu = lambda: next(c for c in client.get(f"/api/v1/portfolios/{pid}/comptes").json()
                      if c["id"] == cid)["mis_a_jour_le"]
    avant = lu()
    client.post(f"/api/v1/portfolios/{pid}/comptes/{cid}/operations",
                json={"operations": [operation(client, pid)]})
    assert lu() == avant


def test_une_operation_ne_se_cree_pas_dans_un_compte_sans_titres(client):
    """
    Le même refus, à l'autre bout : à la création comme au rattachement.

    ⚠️ **Deux chemins mènent à `compte_id`, et un seul contrôle les couvre.** Écrite deux
    fois, la condition n'aurait fini par exister que d'un côté — et un achat serait entré
    dans un livret par celui qui l'a perdue.
    """
    pid = creer_portefeuille(client)
    livret = client.post(f"/api/v1/portfolios/{pid}/comptes",
                         json=avec_apport(5000.0, nom="Livret A",
                                          genre="epargne")).json()["id"]
    r = client.post(f"/api/v1/portfolios/{pid}/transactions", json={
        "ticker": "AAPL", "asset_type": "EQUITY", "side": "BUY",
        "quantity": 3, "unit_price": 100.0, "fees": 0.0,
        "executed_at": "2024-01-10T00:00:00", "compte_id": livret,
    })
    assert r.status_code == 400, r.text
    assert client.get(f"/api/v1/portfolios/{pid}/transactions").json() == []


def test_une_operation_se_cree_toujours_sans_compte(client):
    """
    ⚠️ **Le compte ne peut pas être obligatoire côté serveur, et ce test le grave.** La
    création d'un portefeuille poste ses opérations juste après l'avoir créé, alors qu'il
    n'a encore aucun compte déclaré. L'exiger ici rendrait tout nouveau portefeuille
    impossible à remplir. C'est l'écran de saisie qui l'impose, là où un compte existe.
    """
    pid = creer_portefeuille(client)
    a = operation(client, pid)
    assert comptes_des_operations(client, pid) == {a: None}
