"""
Les événements d'un portefeuille : ce qui est calculé, et ce qui est refusé.

Le fournisseur n'est jamais appelé ici : `_fiche` est remplacée par une fiche
écrite à la main, ce qui laisse éprouver le tri, les libellés et l'absence de
données sans dépendre du réseau ni d'un titre qui publierait un jour autre chose.
"""

from datetime import date

import pytest

from app.services import evenements as ev

#: Le calendrier réel, capturé à l'import — donc avant que la fixture ne le vide.
#:
#: ⚠️ Les tests des titres le neutralisent, sinon chacun verrait les dix-sept
#: échéances macro par-dessus ses propres entrées, et la suite entière casserait à
#: chaque mise à jour du calendrier. Les tests d'intégrité, eux, ont besoin du vrai :
#: ils lisent cet instantané.
VRAI_CALENDRIER = list(ev.CALENDRIER_MACRO)


@pytest.fixture(autouse=True)
def sans_reseau(monkeypatch):
    """Aucun appel au fournisseur, et aucune écriture de cache pendant les tests.

    ⚠️ Le second point compte : un test a déjà réduit le vrai cache des fiches de
    titres à 162 octets sur un PEA réel, en passant par la fonction qui l'écrit.
    """
    monkeypatch.setattr(ev, "_ecrire", lambda: None)
    monkeypatch.setattr(ev, "_charger", dict)
    # Le calendrier macro est vidé par défaut : un test sur les résultats d'un
    # titre ne doit pas dépendre des dates de la Fed.
    monkeypatch.setattr(ev, "CALENDRIER_MACRO", [])


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
    """
    Le calendrier est relevé aux sources officielles, et ces tests en défendent
    l'intégrité — pas son contenu, qui vieillira, mais sa forme et sa cohérence.
    """

    def test_chaque_entree_est_bien_formee(self):
        for iso, libelle, zone, heure in VRAI_CALENDRIER:
            assert date.fromisoformat(iso)
            assert libelle and zone
            if heure is not None:
                h, m = heure.split(":")
                assert 0 <= int(h) < 24 and 0 <= int(m) < 60

    def test_les_dates_sont_uniques_par_libelle(self):
        # Deux entrées identiques feraient deux points le même jour dans le
        # calendrier, et deux lignes dans la liste.
        paires = [(iso, lib) for iso, lib, _, _ in VRAI_CALENDRIER]
        assert len(paires) == len(set(paires))

    def test_la_peremption_est_celle_de_la_serie_la_plus_courte(self):
        """
        ⚠️ Ce test défend une décision, pas un calcul.

        Le FOMC est annoncé jusqu'à fin 2027, l'IPC seulement jusqu'à
        septembre 2026 — le BLS ayant décalé ses publications après les
        interruptions budgétaires et n'ayant pas encore annoncé la suite. Retenir
        la borne la plus lointaine laisserait croire qu'un mois de 2027 sans point
        n'a aucune échéance, alors qu'il en a probablement.
        """
        assert ev.PEREMPTION_MACRO is not None
        ipc = [iso for iso, lib, _, _ in VRAI_CALENDRIER if "prix à la" in lib]
        assert ev.PEREMPTION_MACRO == max(ipc)
        assert ev.PEREMPTION_MACRO < max(iso for iso, *_ in VRAI_CALENDRIER)

    def test_le_fomc_n_annonce_pas_d_heure(self):
        # La page de la Fed donne les dates et non les heures. Le communiqué tombe
        # traditionnellement à 14 h à New York, mais la source ne l'écrit pas.
        for iso, libelle, _, heure in VRAI_CALENDRIER:
            if "FOMC" in libelle:
                assert heure is None, iso

    def test_l_heure_devient_un_instant_date_et_non_un_texte(self):
        # ⚠️ Envoyer « 08:30 » brut ferait lire l'heure de New York comme une heure
        # locale : une publication du matin annoncée l'après-midi à un Européen.
        assert ev.instant_publication("2026-08-26", "08:30") == "2026-08-26T08:30:00-04:00"

    def test_le_decalage_suit_la_regle_d_heure_d_ete_de_la_date(self):
        # Fin octobre, l'Amérique est encore à l'heure d'été et l'Europe non : un
        # décalage figé aurait été faux pour cette publication-là.
        assert ev.instant_publication("2026-10-29", "08:30").endswith("-04:00")
        assert ev.instant_publication("2026-11-25", "08:30").endswith("-05:00")

    def test_sans_heure_aucun_instant(self):
        assert ev.instant_publication("2026-09-16", None) is None

    def test_une_entree_macro_est_annoncee_sans_ticker(self, monkeypatch):
        monkeypatch.setattr(ev, "CALENDRIER_MACRO",
                            [("2026-08-28", "Indice PCE", "USA", "14:30")])
        r = ev.evenements_du_portefeuille([], REF)
        e = r["evenements"][0]
        assert e["nature"] == "economique"
        assert e["libelle"] == "Indice PCE"
        # `moment` est un instant daté et non un texte : le client l'affiche dans
        # son propre fuseau, au lieu de lire une heure de New York comme locale.
        assert e["moment"] == "2026-08-28T14:30:00-04:00"
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


class TestMomentDePublication:
    """La séance qui porte la réaction dépend de l'heure, pas du seul jour."""

    def test_seize_heures_est_apres_la_cloture(self):
        # Relevé sur TSLA : l'horodatage vaut 16 h 00 heure de New York, soit
        # l'heure de clôture. Le marché ne digère l'information que le lendemain.
        assert ev.moment_de_publication(16) == "apres_cloture"
        assert ev.moment_de_publication(20) == "apres_cloture"

    def test_avant_dix_heures_est_avant_l_ouverture(self):
        # L'ouverture est à 9 h 30 : une publication à 7 h ou 8 h précède la séance.
        assert ev.moment_de_publication(7) == "avant_ouverture"
        assert ev.moment_de_publication(9) == "avant_ouverture"

    def test_le_milieu_de_journee_est_en_seance(self):
        assert ev.moment_de_publication(12) == "en_seance"


class TestQualifier:
    def test_une_surprise_franche_est_nommee(self):
        assert ev.qualifier(6.7) == "Supérieur aux attentes"
        assert ev.qualifier(-38.35) == "Inférieur aux attentes"

    def test_une_bande_morte_protege_du_faux_verdict(self):
        # ⚠️ Sans elle, une surprise de +0,04 % — un consensus atteint —
        # s'annoncerait « supérieur aux attentes » : vrai arithmétiquement, faux
        # dans les faits.
        assert ev.qualifier(0.04) == "Conforme aux attentes"
        assert ev.qualifier(-0.5) == "Conforme aux attentes"

    def test_une_publication_a_venir_n_a_pas_de_verdict(self):
        assert ev.qualifier(None) == "Non publié"


class TestStatistiques:
    def lignes(self, variations):
        return [{"variation": v} for v in variations]

    def test_la_moyenne_porte_sur_la_valeur_absolue(self):
        # ⚠️ Une hausse de 6 % et une baisse de 6 % ne s'annulent pas : elles
        # disent toutes deux que ce titre bouge de six pour cent. Une moyenne
        # signée aurait rendu zéro pour le titre le plus agité.
        st = ev.statistiques(self.lignes([6, -6, 6, -6]))
        assert st["impact_moyen"] == pytest.approx(6.0)

    def test_la_probabilite_compte_les_depassements_du_seuil(self):
        st = ev.statistiques(self.lignes([0.5, 1.0, 3.0, 5.0]))
        assert st["seuil"] == ev.SEUIL_MOUVEMENT
        assert st["probabilite"] == pytest.approx(50.0)

    def test_sous_quatre_trimestres_aucune_statistique(self):
        # Une moyenne sur deux points se lirait avec la même autorité qu'une
        # moyenne sur douze. Mieux vaut ne rien annoncer.
        assert ev.statistiques(self.lignes([4.0, 2.0, 3.0])) is None

    def test_les_variations_absentes_ne_comptent_pas_dans_l_echantillon(self):
        st = ev.statistiques(self.lignes([4.0, None, 2.0, None, 3.0, 1.0]))
        assert st["echantillon"] == 4


class TestAnalyseDuPortefeuille:
    def brancher(self, monkeypatch, par_ticker):
        monkeypatch.setattr(ev, "_reactions", lambda tk: par_ticker[tk])

    def reactions(self, lignes):
        return {"version": ev._VERSION, "abouti": True, "echeance": 9e18, "lignes": lignes}

    def test_l_impact_sur_le_portefeuille_est_pondere(self, monkeypatch):
        # Un titre qui pèse 25 % et qui bouge de 8 % déplace le portefeuille de 2 %.
        self.brancher(monkeypatch, {"TSLA": self.reactions([
            {"date": "2026-07-22", "moment": "apres_cloture", "surprise": -38.35,
             "eps_publie": 0.4, "eps_estime": 0.65, "variation": 8.0},
        ])})
        r = ev.analyse_du_portefeuille({"TSLA": 25.0}, REF)
        e = r["passes"][0]
        assert e["impact_portefeuille"] == pytest.approx(2.0)
        assert e["resultat"] == "Inférieur aux attentes"
        assert e["libelle"] == "Résultats T2 2026"

    def test_l_historique_va_du_plus_recent_au_plus_ancien(self, monkeypatch):
        self.brancher(monkeypatch, {"V": self.reactions([
            {"date": "2026-01-28", "moment": "apres_cloture", "surprise": 2.0,
             "eps_publie": 1.0, "eps_estime": 1.0, "variation": 1.0},
            {"date": "2026-04-22", "moment": "apres_cloture", "surprise": 2.0,
             "eps_publie": 1.0, "eps_estime": 1.0, "variation": 1.0},
        ])})
        r = ev.analyse_du_portefeuille({"V": 10.0}, REF)
        assert [e["date"] for e in r["passes"]] == ["2026-04-22", "2026-01-28"]

    def test_une_publication_a_venir_reste_hors_de_l_historique(self, monkeypatch):
        self.brancher(monkeypatch, {"TSLA": self.reactions([
            {"date": "2026-10-21", "moment": "apres_cloture", "surprise": None,
             "eps_publie": None, "eps_estime": 0.45, "variation": None},
        ])})
        r = ev.analyse_du_portefeuille({"TSLA": 50.0}, REF)
        assert r["passes"] == []
        assert r["impacts"] == {}

    def test_l_exposition_accompagne_les_statistiques(self, monkeypatch):
        self.brancher(monkeypatch, {"TSLA": self.reactions([
            {"date": f"2025-0{i}-15", "moment": "apres_cloture", "surprise": 1.0,
             "eps_publie": 1.0, "eps_estime": 1.0, "variation": 4.0}
            for i in range(1, 6)
        ])})
        r = ev.analyse_du_portefeuille({"TSLA": 14.0}, REF)
        assert r["impacts"]["TSLA"]["exposition"] == 14.0
        assert r["impacts"]["TSLA"]["impact_moyen"] == pytest.approx(4.0)

    def test_un_titre_muet_est_nomme_sans_rien_inventer(self, monkeypatch):
        monkeypatch.setattr(ev, "_reactions", lambda tk: {
            "version": ev._VERSION, "abouti": False, "echeance": 9e18, "lignes": []})
        r = ev.analyse_du_portefeuille({"ESE.PA": 70.0}, REF)
        assert r["passes"] == [] and r["impacts"] == {}
        assert r["sans_donnees"] == ["ESE.PA"]
