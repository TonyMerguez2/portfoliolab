"""
Les événements d'un portefeuille : ce qui est calculé, et ce qui est refusé.

Le fournisseur n'est jamais appelé ici : `_fiche` est remplacée par une fiche
écrite à la main, ce qui laisse éprouver le tri, les libellés et l'absence de
données sans dépendre du réseau ni d'un titre qui publierait un jour autre chose.
"""

from datetime import date

import pytest

from app.services import evenements as ev


@pytest.fixture(autouse=True)
def sans_reseau(monkeypatch):
    """Aucun appel au fournisseur, et aucune écriture de cache pendant les tests.

    ⚠️ Le second point compte : un test a déjà réduit le vrai cache des fiches de
    titres à 162 octets sur un PEA réel, en passant par la fonction qui l'écrit.
    """
    monkeypatch.setattr(ev, "_ecrire", lambda: None)
    monkeypatch.setattr(ev, "_charger", dict)


def fiche(**kw):
    """Une fiche de fournisseur, telle que `_fiche` la rend."""
    base = {"version": ev._VERSION, "abouti": True, "echeance": 9e18}
    return {**base, **kw}


def brancher(monkeypatch, par_ticker: dict):
    monkeypatch.setattr(ev, "_fiche", lambda tk: par_ticker.get(tk, fiche()))


REF = date(2026, 8, 10)


class TestTrimestre:
    def test_annonce_le_trimestre_ecoule_et_non_le_courant(self):
        # ⚠️ Une société qui publie fin octobre rend compte de juillet à
        # septembre. Nommer le trimestre courant aurait annoncé des résultats
        # que personne n'a encore vécus.
        assert ev.trimestre("2026-10-29") == "T3 2026"
        assert ev.trimestre("2026-07-30") == "T2 2026"
        assert ev.trimestre("2026-04-30") == "T1 2026"

    def test_janvier_renvoie_au_quatrieme_trimestre_de_l_annee_precedente(self):
        assert ev.trimestre("2026-01-28") == "T4 2025"


class TestResultats:
    def test_une_action_annonce_sa_prochaine_publication(self, monkeypatch):
        brancher(monkeypatch, {"TSLA": fiche(resultats="2026-10-21", eps_estime=0.62)})
        r = ev.evenements_du_portefeuille(["TSLA"], REF)
        assert len(r["evenements"]) == 1
        e = r["evenements"][0]
        assert e["nature"] == "resultats"
        assert e["libelle"] == "Résultats T3 2026"
        assert e["jours"] == 72
        assert e["eps_estime"] == 0.62
        assert r["sans_donnees"] == []

    def test_une_publication_passee_n_est_pas_annoncee(self, monkeypatch):
        brancher(monkeypatch, {"TSLA": fiche(resultats="2026-07-21")})
        r = ev.evenements_du_portefeuille(["TSLA"], REF)
        assert r["evenements"] == []
        # Le titre n'a pas de date **à venir** : il est signalé comme muet, ce qui
        # est vrai du point de vue de la liste.
        assert r["sans_donnees"] == ["TSLA"]

    def test_la_publication_du_jour_compte_encore(self, monkeypatch):
        brancher(monkeypatch, {"V": fiche(resultats=REF.isoformat())})
        r = ev.evenements_du_portefeuille(["V"], REF)
        assert r["evenements"][0]["jours"] == 0


class TestDividendes:
    def test_le_rendement_est_celui_du_versement_et_non_de_l_annee(self, monkeypatch):
        brancher(monkeypatch, {"AAPL": fiche(
            detachement="2026-08-14", dividende=0.27, cours=210.0, devise="USD")})
        e = ev.evenements_du_portefeuille(["AAPL"], REF)["evenements"][0]
        assert e["nature"] == "dividende"
        assert e["montant"] == 0.27
        assert e["devise"] == "USD"
        # 0,27 / 210 = 0,1286 % — ce que ce détachement retire du cours.
        assert e["rendement"] == pytest.approx(0.1286, abs=1e-4)

    def test_sans_cours_le_rendement_est_absent_plutot_que_faux(self, monkeypatch):
        brancher(monkeypatch, {"AAPL": fiche(detachement="2026-08-14", dividende=0.27)})
        e = ev.evenements_du_portefeuille(["AAPL"], REF)["evenements"][0]
        assert e["rendement"] is None
        assert e["montant"] == 0.27


class TestAbsenceDeDonnees:
    def test_un_portefeuille_d_etf_rend_une_liste_vide_et_le_dit(self, monkeypatch):
        # Mesuré sur les vraies lignes d'un PEA : le fournisseur ne publie ni
        # résultats ni dividende pour ces ETF. Une liste vide est juste ; le
        # silence, non.
        brancher(monkeypatch, {t: fiche() for t in ("ESE.PA", "ETZ.PA", "PAEJ.PA")})
        r = ev.evenements_du_portefeuille(["ESE.PA", "ETZ.PA", "PAEJ.PA"], REF)
        assert r["evenements"] == []
        assert r["sans_donnees"] == ["ESE.PA", "ETZ.PA", "PAEJ.PA"]

    def test_un_echec_du_fournisseur_ne_fabrique_aucune_date(self, monkeypatch):
        brancher(monkeypatch, {"TSLA": fiche(abouti=False)})
        r = ev.evenements_du_portefeuille(["TSLA"], REF)
        assert r["evenements"] == []


class TestTri:
    def test_du_plus_proche_au_plus_lointain(self, monkeypatch):
        brancher(monkeypatch, {
            "V":    fiche(resultats="2026-10-28"),
            "TSLA": fiche(resultats="2026-10-21"),
            "AAPL": fiche(detachement="2026-08-14", dividende=0.27, cours=210.0),
        })
        r = ev.evenements_du_portefeuille(["V", "TSLA", "AAPL"], REF)
        assert [e["date"] for e in r["evenements"]] == \
            ["2026-08-14", "2026-10-21", "2026-10-28"]

    def test_deux_evenements_le_meme_jour_sont_ordonnes_par_ticker(self, monkeypatch):
        brancher(monkeypatch, {
            "V":    fiche(resultats="2026-10-21"),
            "TSLA": fiche(resultats="2026-10-21"),
        })
        r = ev.evenements_du_portefeuille(["V", "TSLA"], REF)
        assert [e["ticker"] for e in r["evenements"]] == ["TSLA", "V"]


class TestCalendrierMacro:
    def test_vide_par_defaut_plutot_que_peuple_de_dates_inventees(self):
        """
        ⚠️ Ce test défend une décision, pas un calcul.

        Les dates du FOMC, de l'IPC et du PCE sont publiées un an à l'avance et
        parfaitement inscriptibles. Elles ne sont pas écrites ici parce que je ne
        les connais pas de mémoire avec certitude : un calendrier économique ne
        sert qu'à préparer une échéance, et une échéance fausse est pire
        qu'absente. À remplir depuis les sources officielles citées dans le
        module.
        """
        assert ev.CALENDRIER_MACRO == []
        assert ev.PEREMPTION_MACRO is None

    def test_une_entree_macro_est_annoncee_sans_ticker(self, monkeypatch):
        monkeypatch.setattr(ev, "CALENDRIER_MACRO",
                            [("2026-08-28", "Indice PCE", "USA", "14:30")])
        r = ev.evenements_du_portefeuille([], REF)
        e = r["evenements"][0]
        assert e["nature"] == "economique"
        assert e["libelle"] == "Indice PCE"
        assert e["moment"] == "14:30"
        assert e["jours"] == 18

    def test_une_entree_macro_passee_est_ecartee(self, monkeypatch):
        monkeypatch.setattr(ev, "CALENDRIER_MACRO",
                            [("2026-07-31", "Réunion FOMC", "USA", None)])
        assert ev.evenements_du_portefeuille([], REF)["evenements"] == []


class TestNettoyage:
    @pytest.mark.parametrize("brut", [float("nan"), float("inf"), None, "", "abc"])
    def test_une_valeur_illisible_vaut_absence(self, brut):
        assert ev._nombre(brut) is None

    def test_une_fourchette_de_dates_retient_la_premiere(self):
        # `Earnings Date` arrive parfois en fourchette : la première est
        # l'échéance annoncée.
        assert ev._jour([date(2026, 10, 29), date(2026, 11, 2)]) == "2026-10-29"

    def test_une_liste_vide_ne_donne_pas_de_date(self):
        assert ev._jour([]) is None
