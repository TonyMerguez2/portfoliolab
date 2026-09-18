"""
Les alertes macroéconomiques : fenêtre, clé, et ce qui survit à une suppression.

⚠️ **Le calendrier est remplacé, jamais interrogé.** Il lit un flux en ligne : le laisser
faire rendrait ces tests dépendants du réseau, du jour où on les lance, et des zones que
le fournisseur couvre ce matin-là. Ce qu'on vérifie ici est la couche d'alerte — fenêtre,
empreinte, état — pas le calendrier, qui a ses propres garanties.
"""

from datetime import date, datetime

import pytest

from app.core.database import Base, engine, get_db
from app.models.alerte import EtatAlerte
from app.services import alertes as service


@pytest.fixture
def db():
    Base.metadata.create_all(engine)
    session = next(get_db())
    session.query(EtatAlerte).filter(EtatAlerte.user_id.like("essai-%")).delete(
        synchronize_session=False)
    session.commit()
    yield session
    session.query(EtatAlerte).filter(EtatAlerte.user_id.like("essai-%")).delete(
        synchronize_session=False)
    session.commit()
    session.close()


def ev(jours, libelle="Décision de taux", pays="eu", jour="2026-09-20"):
    return {"nature": "economique", "date": jour, "libelle": libelle,
            "pays": pays, "jours": jours, "source": "relevé"}


def test_la_cle_distingue_deux_echeances_du_meme_jour():
    """Deux publications tombent le même jour plus souvent qu'on ne croit."""
    a = ev(1, "Inflation (IPC)", "us")
    b = ev(1, "Décision de taux", "eu")
    assert service.cle_alerte(a) != service.cle_alerte(b)


def test_la_cle_ne_bouge_pas_d_un_appel_a_l_autre():
    """Sans cela, une alerte écartée reviendrait sous un nouveau nom — tous les jours."""
    assert service.cle_alerte(ev(1)) == service.cle_alerte(ev(1))


def test_la_fenetre_ecarte_le_lointain_et_le_passe(db, monkeypatch):
    monkeypatch.setattr(service, "evenements_macro_du_flux",
                        lambda t, r: [ev(-1, "Passée"), ev(0, "Aujourd’hui"),
                                      ev(7, "Dans une semaine"), ev(8, "Trop loin")])
    vues = service.alertes(db, "essai-1", ["AAPL"], date(2026, 9, 18))
    libelles = [a["libelle"] for a in vues]
    assert libelles == ["Aujourd’hui", "Dans une semaine"]


def test_une_alerte_est_neuve_puis_ne_l_est_plus(db, monkeypatch):
    monkeypatch.setattr(service, "evenements_macro_du_flux", lambda t, r: [ev(1)])
    premiere = service.alertes(db, "essai-2", ["AAPL"], date(2026, 9, 18))
    assert premiere[0]["nouvelle"] is True

    service.marquer_vues(db, "essai-2", [premiere[0]["cle"]])
    seconde = service.alertes(db, "essai-2", ["AAPL"], date(2026, 9, 18))
    assert seconde[0]["nouvelle"] is False, "le toast se répéterait à chaque visite"


def test_une_alerte_ecartee_ne_revient_pas(db, monkeypatch):
    """La garantie qui compte : le calendrier la rend encore, l'écran ne doit plus."""
    monkeypatch.setattr(service, "evenements_macro_du_flux", lambda t, r: [ev(1)])
    cle = service.alertes(db, "essai-3", ["AAPL"], date(2026, 9, 18))[0]["cle"]
    service.supprimer(db, "essai-3", cle)
    assert service.alertes(db, "essai-3", ["AAPL"], date(2026, 9, 18)) == []


def test_une_suppression_ne_decide_rien_pour_un_autre_compte(db, monkeypatch):
    monkeypatch.setattr(service, "evenements_macro_du_flux", lambda t, r: [ev(1)])
    cle = service.alertes(db, "essai-4", ["AAPL"], date(2026, 9, 18))[0]["cle"]
    service.supprimer(db, "essai-4", cle)
    assert len(service.alertes(db, "essai-5", ["AAPL"], date(2026, 9, 18))) == 1


def test_marquer_deux_fois_ne_reecrit_pas_l_heure(db, monkeypatch):
    """Idempotence : un réessai après une réponse perdue ne doit rien écraser."""
    monkeypatch.setattr(service, "evenements_macro_du_flux", lambda t, r: [ev(1)])
    cle = service.alertes(db, "essai-6", ["AAPL"], date(2026, 9, 18))[0]["cle"]
    assert service.marquer_vues(db, "essai-6", [cle]) == 1
    avant = db.query(EtatAlerte).filter(EtatAlerte.user_id == "essai-6").first().vue_le
    assert service.marquer_vues(db, "essai-6", [cle]) == 0
    apres = db.query(EtatAlerte).filter(EtatAlerte.user_id == "essai-6").first().vue_le
    assert avant == apres


def test_l_ordre_met_la_plus_proche_en_tete(db, monkeypatch):
    monkeypatch.setattr(service, "evenements_macro_du_flux",
                        lambda t, r: [ev(5, "Dans cinq"), ev(0, "Ce matin"), ev(2, "Mercredi")])
    vues = service.alertes(db, "essai-7", ["AAPL"], date(2026, 9, 18))
    assert [a["jours"] for a in vues] == [0, 2, 5]


def test_sans_ticker_aucune_alerte(db):
    """Le calendrier déduit ses zones des tickers : sans ligne, il n'a rien à dire."""
    assert service.alertes(db, "essai-8", [], date(2026, 9, 18)) == []
