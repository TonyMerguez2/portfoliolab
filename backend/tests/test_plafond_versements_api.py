"""
L'objectif de plafond de versements, vu de l'API.

Les calculs sont éprouvés dans `test_plafond_versements.py`. Ce qui est couvert ici est le
**branchement** : que la route lise le cumul versé au lieu de la valeur du portefeuille,
qu'un champ laissé vide reprenne la mesure au lieu de valoir zéro, et que la projection soit
une droite et non un tirage.

Exécution : cd backend && ./venv/bin/python -m pytest tests/test_plafond_versements_api.py -v
"""
import os
import sys
import tempfile
from datetime import datetime
from types import SimpleNamespace

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

#: Le cours servi à la place du fournisseur. Choisi **très au-dessus** du prix d'achat pour
#: que la valeur du portefeuille et le cumul versé soient franchement différents : c'est
#: précisément la confusion que ces tests doivent attraper.
COURS_SERVI = 500.0


@pytest.fixture(name="client")
def client_fixture(monkeypatch):
    fichier = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    fichier.close()
    engine = create_engine(f"sqlite:///{fichier.name}",
                           connect_args={"check_same_thread": False})

    from app.main import app
    from app.core.auth import require_auth
    from app.core.database import Base, get_db

    Base.metadata.create_all(engine)

    def get_db_test():
        with Session(engine) as session:
            yield session

    compte = SimpleNamespace(id="user-test", email="t@novac.local", username="Test",
                             avatar_url=None, devise=None)
    app.dependency_overrides[get_db] = get_db_test
    app.dependency_overrides[require_auth] = lambda: compte

    async def cours(tickers):
        return {t: COURS_SERVI for t in tickers}

    monkeypatch.setattr("app.api.routes.objectifs.fetch_current_prices", cours)

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()
    engine.dispose()
    os.unlink(fichier.name)


def _portefeuille(client) -> str:
    r = client.post("/api/v1/portfolios", json={
        "name": "PEA", "assets": [{"ticker": "ESE.PA", "weight": 100}],
        "color": "#5B8DEF",
    })
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _versements(client, pid: str, mois: list[tuple[int, int]], montant: float) -> None:
    """Un achat de `montant` euros par mois listé, pour simuler des versements."""
    for annee, mois_no in mois:
        r = client.post(f"/api/v1/portfolios/{pid}/transactions", json={
            "ticker": "ESE.PA", "side": "BUY", "quantity": montant / 100.0,
            "unit_price": 100.0, "fees": 0.0,
            "executed_at": datetime(annee, mois_no, 5).isoformat(),
            "asset_type": "ETF",
        })
        assert r.status_code in (200, 201), r.text


def _creer(client, pid: str, **champs):
    corps = {"nom": "Plafond PEA", "genre": "plafond_versements",
             "cible": 150_000.0, "versement_mensuel": 800.0}
    corps.update(champs)
    r = client.post(f"/api/v1/portfolios/{pid}/objectifs", json=corps)
    assert r.status_code in (200, 201), r.text
    return r.json()


def test_le_genre_est_accepte(client):
    pid = _portefeuille(client)
    o = _creer(client, pid)
    assert o["genre"] == "plafond_versements"
    assert o["sur_versements"] is True
    assert o["capital_requis"] == 150_000.0


def test_l_avancement_ignore_la_valeur_du_portefeuille(client):
    """
    Le test central, en conditions réelles.

    Trois versements de 1 000 € donnent 3 000 € versés. Les mêmes titres valant cinq fois
    leur prix d'achat, le portefeuille pèse 15 000 €. L'avancement doit dire 2 % — la part
    de 3 000 € dans 150 000 € — et non 10 %.
    """
    pid = _portefeuille(client)
    _versements(client, pid, [(2025, 1), (2025, 2), (2025, 3)], 1_000.0)
    o = _creer(client, pid)

    assert o["verse_mesure"] == 3_000.0
    assert o["verse_retenu"] == 3_000.0
    assert o["montant_actuel"] == 3_000.0
    assert o["avancement"] == 2.0

    # La valeur du portefeuille reste rendue par la route de liste : elle n'est simplement
    # pas ce qui sert ici. On vérifie qu'elle diffère bien, sinon le test ne prouve rien.
    liste = client.get(f"/api/v1/portfolios/{pid}/objectifs").json()
    assert liste["valeur_portefeuille"] == pytest.approx(15_000.0)
    assert liste["objectifs"][0]["avancement"] == 2.0


def test_un_champ_vide_reprend_la_mesure_et_ne_vaut_pas_zero(client):
    """
    ⚠️ Le piège que `_verse_retenu` désamorce. `verse_deja: None` doit signifier « reprends
    les transactions » ; le confondre avec zéro afficherait « 0 € versés » sur un PEA qui en
    a reçu trois mille, et repousserait la date du plafond de plusieurs années.
    """
    pid = _portefeuille(client)
    _versements(client, pid, [(2025, 1), (2025, 2), (2025, 3)], 1_000.0)
    o = _creer(client, pid, verse_deja=None)
    assert o["verse_deja"] is None
    assert o["verse_retenu"] == 3_000.0
    # 147 000 € restants à 800 €/mois = 183,75 → 184 mois.
    assert o["mois_pour_atteindre"] == 184


def test_le_chiffre_saisi_prime_sur_la_mesure(client):
    """
    Le relevé de la banque bat le net des transactions, qui n'en est qu'un minorant.

    ⚠️ La mesure reste rendue à côté : un relevé à 40 000 € contre 3 000 € de transactions
    saisies signale qu'il manque des transactions — et donc que l'avancement du reste de
    l'application est faux.
    """
    pid = _portefeuille(client)
    _versements(client, pid, [(2025, 1), (2025, 2), (2025, 3)], 1_000.0)
    o = _creer(client, pid, verse_deja=40_000.0)
    assert o["verse_retenu"] == 40_000.0
    assert o["verse_mesure"] == 3_000.0, "la mesure doit rester visible pour l'écart"
    assert o["avancement"] == pytest.approx(26.67, abs=0.01)


def test_un_cumul_negatif_est_refuse(client):
    pid = _portefeuille(client)
    r = client.post(f"/api/v1/portfolios/{pid}/objectifs", json={
        "nom": "x", "genre": "plafond_versements", "cible": 150_000.0,
        "verse_deja": -5.0,
    })
    assert r.status_code == 422
    assert "verse_deja" in r.json()["detail"]


def test_aucune_lecture_en_euros_constants(client):
    """
    ⚠️ Cent cinquante mille euros est un seuil **légal**, en euros courants et non indexé.
    Afficher « soit 96 000 € d'aujourd'hui » à côté laisserait croire que le plafond se
    déprécie — ou qu'il reste de la marge quand la loi dit le contraire.
    """
    pid = _portefeuille(client)
    o = _creer(client, pid, echeance_annee=2040, inflation=2.0)
    assert o["valeur_projetee"] is not None
    assert o["projetee_en_euros_constants"] is None


# ── La projection : une droite, pas un tirage ────────────────────────────────

def test_la_projection_est_deterministe(client):
    pid = _portefeuille(client)
    _versements(client, pid, [(2025, 1)], 1_000.0)
    o = _creer(client, pid, echeance_annee=2030)

    r = client.get(f"/api/v1/portfolios/{pid}/objectifs/{o['id']}/projection")
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["possible"] is True

    # ⚠️ Une seule courbe, et aucune dispersion : rien dans une somme de versements ne
    # justifie une enveloppe de centiles.
    assert list(p["enveloppes"]) == ["50"]
    assert p["intervalle"] is None
    assert p["probabilite"] is None
    assert p["taux_implicites"] == {}

    # ⚠️ « sans_objet » et non « indisponible » : la volatilité de ce portefeuille est
    # parfaitement mesurable, elle n'a simplement rien à faire dans ce calcul. Confondre
    # les deux ferait passer un choix de calcul pour une panne.
    assert p["volatilite"] is None
    assert p["volatilite_source"] == "sans_objet"

    # La courbe monte d'un pas constant : c'est une droite.
    courbe, mois = p["enveloppes"]["50"], p["mois"]
    assert courbe[0] == 1_000.0
    pentes = [(courbe[i + 1] - courbe[i]) / (mois[i + 1] - mois[i])
              for i in range(len(mois) - 1)]
    assert all(abs(s - 800.0) < 1e-6 for s in pentes), pentes


def test_sans_echeance_la_courbe_va_jusqu_au_plafond(client):
    """
    ⚠️ **L'horizon est la date du plafond, pas une échéance à saisir.** Constaté à l'écran :
    le panneau répondait « cet objectif n'a pas d'échéance, ajoutez une année cible » alors
    que la date du plafond était déjà calculée et affichée dans les constats juste à côté.
    Demander à l'épargnant de deviner l'année qu'il vient chercher n'a pas de sens.
    """
    pid = _portefeuille(client)
    _versements(client, pid, [(2025, 1)], 1_000.0)
    o = _creer(client, pid, echeance_annee=None)
    assert o["mois_restants"] is None, "aucune échéance saisie"
    assert o["mois_pour_atteindre"] == 187  # (150 000 - 1 000) / 800, arrondi au-dessus

    p = client.get(f"/api/v1/portfolios/{pid}/objectifs/{o['id']}/projection").json()
    assert p["possible"] is True
    assert p["mois"][-1] == 187
    # Le dernier point atteint bien le plafond, sans le dépasser d'un mois entier.
    assert p["enveloppes"]["50"][-1] >= 150_000.0
    assert p["enveloppes"]["50"][-1] < 150_000.0 + 800.0


def test_sans_versement_la_projection_le_dit(client):
    """Un refus nommé, plutôt qu'une courbe plate sans explication."""
    pid = _portefeuille(client)
    o = _creer(client, pid, echeance_annee=2030, versement_mensuel=None)
    p = client.get(f"/api/v1/portfolios/{pid}/objectifs/{o['id']}/projection").json()
    assert p["possible"] is False
    assert p["raison"] == "sans_versement"


def test_sans_rendement_attendu_la_projection_marche_quand_meme(client):
    """
    ⚠️ Ce qui distingue ce genre des autres : aucune hypothèse de marché n'est requise.
    Les quatre autres refusent sans `taux_attendu`, à juste titre ; celui-ci n'en a pas
    besoin, et le lui demander serait absurde.
    """
    pid = _portefeuille(client)
    o = _creer(client, pid, echeance_annee=2030, taux_attendu=None)
    p = client.get(f"/api/v1/portfolios/{pid}/objectifs/{o['id']}/projection").json()
    assert p["possible"] is True


def test_les_plafonds_connus_sont_proposes(client):
    pid = _portefeuille(client)
    _versements(client, pid, [(2025, 1)], 1_000.0)
    r = client.get(f"/api/v1/portfolios/{pid}/objectifs/parametres")
    assert r.status_code == 200, r.text
    corps = r.json()
    montants = {p["libelle"]: p["montant"] for p in corps["plafonds"]}
    assert montants["PEA"] == 150_000.0
    # ⚠️ Le nom de la clé compte : « minorant » et non « versements_cumules ». L'application
    # ne voit pas les virements, seulement les achats de titres.
    assert corps["verse_minorant"] == 1_000.0


# ── Les sensibilités : ce que changerait une autre décision ──────────────────

def test_un_plafond_ne_recoit_que_la_variante_marginale(client):
    """
    ⚠️ **Une seule sensibilité pour un plafond, et c'est un choix de non-duplication.** Le
    panneau « Selon le rythme de versement » montre déjà la moitié, le rythme et le double ;
    les répéter ici donnerait deux endroits pour la même chose, qui finiraient par se
    contredire — le défaut de la médiane affichée deux fois, déjà corrigé une fois dans ce
    projet. Le pas de cent euros, lui, ne figure nulle part ailleurs.
    """
    pid = _portefeuille(client)
    _versements(client, pid, [(2025, 1)], 1_000.0)
    o = _creer(client, pid, echeance_annee=2040)
    s = o["sensibilites"]
    assert len(s) == 1, s
    assert s[0]["quoi"] == "versement_marginal"
    assert s[0]["versement"] == 900.0, "800 € versés + 100 €"
    # Verser cent euros de plus rapproche le plafond : l'écart est négatif.
    assert s[0]["ecart_mois"] < 0


def test_un_capital_recoit_ses_sensibilites(client):
    """
    Un objectif de capital reçoit trois variantes : moitié du versement, double, et un point
    de rendement en moins.

    ⚠️ **Ce sont des sensibilités, pas des conseils.** La route rend le résultat du même
    calcul à une autre entrée ; c'est l'épargnant qui compare. Rien dans la réponse ne
    désigne une valeur comme préférable.
    """
    pid = _portefeuille(client)
    _versements(client, pid, [(2025, 1)], 1_000.0)
    r = client.post(f"/api/v1/portfolios/{pid}/objectifs", json={
        "nom": "Retraite", "genre": "capital", "cible": 500_000.0,
        "versement_mensuel": 800.0, "taux_attendu": 7.0, "echeance_annee": 2050,
    })
    assert r.status_code in (200, 201), r.text
    o = r.json()
    s = o["sensibilites"]
    assert len(s) == 4, s

    marginal, moitie, double, rendement = s
    # ⚠️ La variante marginale d'abord : c'est la seule qui corresponde à une décision qu'on
    # prend réellement, et l'interface la met en tête du panneau.
    assert marginal["quoi"] == "versement_marginal" and marginal["versement"] == 900.0
    assert marginal["ecart_mois"] < 0, "cent euros de plus doivent rapprocher la cible"
    assert moitie["quoi"] == "versement" and moitie["versement"] == 400.0
    assert double["quoi"] == "versement" and double["versement"] == 1_600.0
    assert rendement["quoi"] == "rendement" and rendement["taux"] == 6.0

    # ⚠️ Le sens des écarts, qui est tout ce que la phrase affirmera : moins on verse, plus
    # c'est long. Un signe inversé retournerait le constat sans qu'aucun test ne bronche.
    assert moitie["ecart_mois"] > 0, "verser moins doit repousser la cible"
    assert double["ecart_mois"] < 0, "verser plus doit la rapprocher"
    assert rendement["ecart_mois"] > 0, "un rendement plus faible doit la repousser"

    # Et les durées elles-mêmes restent cohérentes avec la date de référence.
    base = o["mois_pour_atteindre"]
    assert moitie["mois"] == base + moitie["ecart_mois"]
    assert double["mois"] == base + double["ecart_mois"]


def test_sans_rendement_attendu_aucune_sensibilite(client):
    """
    ⚠️ Aucune variante sans hypothèse de rendement : les calculer supposerait un taux que
    l'épargnant n'a pas choisi, et la phrase citerait un écart bâti sur rien.
    """
    pid = _portefeuille(client)
    r = client.post(f"/api/v1/portfolios/{pid}/objectifs", json={
        "nom": "Retraite", "genre": "capital", "cible": 500_000.0,
        "versement_mensuel": 800.0, "echeance_annee": 2050,
    })
    assert r.json()["sensibilites"] == []


def test_une_variante_hors_de_portee_est_rendue_telle_quelle(client):
    """
    ⚠️ `mois: None` plutôt qu'un très grand nombre : à la moitié du rythme, certaines cibles
    ne sont plus atteignables du tout, et l'interface doit pouvoir le dire au lieu d'annoncer
    « dans 80 ans » comme une estimation.

    Le cas est construit pour être juste au-delà : 715 000 € restants à 800 € par mois sans
    rendement font 894 mois, sous le plafond de quatre-vingts ans du calcul ; à 400 € ils en
    font 1 788, au-delà.
    """
    pid = _portefeuille(client)
    _versements(client, pid, [(2025, 1)], 1_000.0)
    r = client.post(f"/api/v1/portfolios/{pid}/objectifs", json={
        "nom": "Lointain", "genre": "capital", "cible": 720_000.0,
        "versement_mensuel": 800.0, "taux_attendu": 0.0, "echeance_annee": 2050,
    })
    o = r.json()
    assert o["mois_pour_atteindre"] is not None, "la référence doit rester atteignable"
    s = o["sensibilites"]
    moitie = next(v for v in s if v["versement"] == 400.0)
    assert moitie["mois"] is None
    assert moitie["ecart_mois"] is None, "pas d'écart sans durée"


def test_une_reference_hors_de_portee_ne_produit_aucune_variante(client):
    """
    ⚠️ Le garde qui manquait à mon premier essai de test, et que ce premier essai a révélé :
    quand la cible n'est **pas** atteignable au rythme actuel, aucune variante n'est calculée.
    Un écart se mesure à une référence ; sans référence, « douze ans de plus que jamais » n'a
    pas de sens. L'interface dit alors « hors de portée au rythme actuel », ce qu'elle sait
    déjà faire.
    """
    pid = _portefeuille(client)
    r = client.post(f"/api/v1/portfolios/{pid}/objectifs", json={
        "nom": "Immense", "genre": "capital", "cible": 900_000_000.0,
        "versement_mensuel": 100.0, "taux_attendu": 0.0, "echeance_annee": 2050,
    })
    o = r.json()
    assert o["mois_pour_atteindre"] is None
    assert o["sensibilites"] == []


def test_un_plafond_ne_compte_pas_dans_la_somme_des_parts(client):
    """
    ⚠️ **Une alerte fausse en tête de chaque carte, sur des données justes.**

    Un plafond de versements n'a pas de part affectée : répartir un versement déjà effectué
    entre deux enveloppes ne veut rien dire, et le formulaire masque le champ. Sa part valant
    `None`, le repli à cent pour cent la comptait comme un objectif de plein patrimoine. Sur un
    portefeuille dont les parts font exactement 50 + 30 + 20 = 100, la somme sortait à 200 et
    l'écran annonçait un chevauchement inexistant.

    ⚠️ L'incohérence était déjà décelable : `agregat`, côté écran, écarte ces mêmes objectifs du
    total « déjà constitué ». Deux endroits, deux règles, dont une fausse.
    """
    pid = _portefeuille(client)
    for nom, part in (("Retraite", 50.0), ("Appartement", 30.0), ("Rente", 20.0)):
        r = client.post(f"/api/v1/portfolios/{pid}/objectifs", json={
            "nom": nom, "genre": "capital", "cible": 100_000.0, "part_affectee": part})
        assert r.status_code in (200, 201), r.text
    _creer(client, pid)  # le plafond, sans part

    somme = client.get(f"/api/v1/portfolios/{pid}/objectifs").json()["somme_des_parts"]
    assert somme == 100.0, f"les parts font 50 + 30 + 20, la somme dit {somme}"


def test_la_somme_signale_toujours_un_vrai_chevauchement(client):
    """Le garde en sens inverse : la correction ne doit pas éteindre l'alerte utile."""
    pid = _portefeuille(client)
    for nom in ("Retraite", "Appartement"):
        client.post(f"/api/v1/portfolios/{pid}/objectifs", json={
            "nom": nom, "genre": "capital", "cible": 100_000.0, "part_affectee": 100.0})
    _creer(client, pid)
    somme = client.get(f"/api/v1/portfolios/{pid}/objectifs").json()["somme_des_parts"]
    assert somme == 200.0, "deux objectifs à 100 % se chevauchent bel et bien"
