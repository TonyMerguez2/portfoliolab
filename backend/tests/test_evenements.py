"""
Les événements d'un portefeuille : ce qui est calculé, et ce qui est refusé.

Le fournisseur n'est jamais appelé ici : `_fiche` est remplacée par une fiche
écrite à la main, ce qui laisse éprouver le tri, les libellés et l'absence de
données sans dépendre du réseau ni d'un titre qui publierait un jour autre chose.
"""

from datetime import date
from zoneinfo import ZoneInfo

import pytest

from app.services import evenements as ev

#: Le calendrier réel, capturé à l'import — donc avant que la fixture ne le vide.
#:
#: ⚠️ Les tests des titres le neutralisent, sinon chacun verrait les trente-trois
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
    # ⚠️ Et aucune lecture des pages de la Fed ou de la BCE : un dictionnaire vide
    # signifie « pages injoignables », donc le repli sur le relevé écrit. Sans ceci,
    # la suite de tests appellerait deux sites publics à chaque exécution.
    monkeypatch.setattr(ev, "decisions_officielles", dict)


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

    def test_chaque_zone_a_un_drapeau_et_un_fuseau(self):
        """
        ⚠️ Sans ce test, une zone mal orthographiée dans une entrée du calendrier
        passerait en silence : `ZONES.get` rendrait le fuseau de New York par
        défaut, et l'interface afficherait la ligne sans drapeau. Deux dégâts muets.
        """
        for _, _, zone, _ in VRAI_CALENDRIER:
            assert zone in ev.ZONES, zone
        for nom, z in ev.ZONES.items():
            # ⚠️ Un drapeau vide n'est **plus** permis. Il l'était tant que l'interface
            # tirait ses images des quinze fichiers de `public/drapeaux` — Taïwan, la
            # Corée et Singapour n'en avaient pas. Le jeu de 261 pays les a tous, donc
            # une zone sans code est désormais un oubli, pas une limite.
            #
            # ⚠️ Ce test ne vérifie que la **forme**. Qu'un code existe dans le jeu de
            # drapeaux est vérifié côté interface, par un test qui lit ce fichier même :
            # un code bien formé mais inconnu ne dessine rien du tout à l'écran.
            assert len(z.drapeau) == 2 and z.drapeau.islower(), nom
            assert ZoneInfo(z.fuseau), nom
            assert len(z.region) == 2, nom
        # Une région ne doit pas désigner deux zones, sinon le flux en perdrait une.
        assert len(ev.ZONE_PAR_REGION) == len(ev.ZONES)

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
        # ⚠️ Filtré sur la zone **et** sur le libellé. Sans la zone, le jour où une
        # série européenne s'appellerait « indice des prix à la consommation
        # harmonisé » elle entrerait dans ce calcul et le test cesserait de parler
        # de l'IPC américain sans que personne ne s'en aperçoive.
        ipc = [iso for iso, lib, zone, _ in VRAI_CALENDRIER
               if zone == "USA" and "prix à la" in lib]
        assert ev.PEREMPTION_MACRO == max(ipc)
        assert ev.PEREMPTION_MACRO < max(iso for iso, *_ in VRAI_CALENDRIER)

    def test_le_fomc_n_annonce_pas_d_heure(self):
        # La page de la Fed donne les dates et non les heures. Le communiqué tombe
        # traditionnellement à 14 h à New York, mais la source ne l'écrit pas.
        for iso, libelle, _, heure in VRAI_CALENDRIER:
            if "FOMC" in libelle:
                assert heure is None, iso

    def test_la_bce_n_annonce_pas_d_heure_non_plus(self):
        """
        La page du Conseil des gouverneurs écrit « followed by press conference »
        sans horaire, et le calendrier d'Eurostat est rendu en JavaScript. Les
        sources tierces donnent 14 h 15 et 11 h ; c'est vraisemblable et ce n'est
        pas relevé.
        """
        for iso, libelle, zone, heure in VRAI_CALENDRIER:
            if zone == "Zone euro":
                assert heure is None, (iso, libelle)

    def test_une_decision_de_la_bce_tombe_un_jeudi(self):
        """
        ⚠️ Ce test a un passé. J'ai d'abord cru le relevé faux parce que quatre
        dates de la BCE coïncidaient avec des dates du FOMC déjà présentes. La
        raison est structurelle : le FOMC siège mardi-mercredi et décide le
        mercredi, le Conseil des gouverneurs siège mercredi-jeudi et décide le
        jeudi. Le même mercredi porte donc une décision de la Fed et le premier jour
        de la BCE. Retenir le premier jour aurait annoncé la décision la veille.
        """
        for iso, libelle, zone, _ in VRAI_CALENDRIER:
            if zone == "Zone euro" and "BCE" in libelle:
                assert date.fromisoformat(iso).weekday() == 3, iso

    def test_une_decision_de_la_fed_tombe_un_mercredi(self):
        for iso, libelle, _, _ in VRAI_CALENDRIER:
            if "FOMC" in libelle:
                assert date.fromisoformat(iso).weekday() == 2, iso

    def test_l_heure_devient_un_instant_date_et_non_un_texte(self):
        # ⚠️ Envoyer « 08:30 » brut ferait lire l'heure de New York comme une heure
        # locale : une publication du matin annoncée l'après-midi à un Européen.
        assert ev.instant_publication("2026-08-26", "08:30") == "2026-08-26T08:30:00-04:00"

    def test_le_decalage_suit_la_regle_d_heure_d_ete_de_la_date(self):
        # Fin octobre, l'Amérique est encore à l'heure d'été et l'Europe non : un
        # décalage figé aurait été faux pour cette publication-là.
        assert ev.instant_publication("2026-10-29", "08:30").endswith("-04:00")
        assert ev.instant_publication("2026-11-25", "08:30").endswith("-05:00")

    def test_le_fuseau_europeen_a_sa_propre_regle_d_heure_d_ete(self):
        """
        ⚠️ Le décalage européen n'est pas constant lui non plus, et il ne bascule pas
        le même week-end que l'américain. Ce test existe pour qu'une heure ajoutée à
        une ligne « Zone euro » ne soit pas lue dans le fuseau de New York — six
        heures d'écart, et aucune erreur pour le signaler.
        """
        eu = ev.ZONES["Zone euro"].fuseau
        assert ev.instant_publication("2026-09-01", "11:00", eu).endswith("+02:00")
        assert ev.instant_publication("2026-12-01", "11:00", eu).endswith("+01:00")
        # La même date, dans les deux fuseaux : c'est tout l'intérêt du paramètre.
        assert ev.instant_publication("2026-12-01", "11:00").endswith("-05:00")

    def test_une_echeance_macro_porte_le_drapeau_de_sa_zone(self, monkeypatch):
        monkeypatch.setattr(ev, "CALENDRIER_MACRO",
                            [("2026-08-28", "Décision", "Zone euro", None)])
        e = ev.evenements_du_portefeuille([], REF)["evenements"][0]
        assert e["pays"] == "eu"

    def test_une_zone_inconnue_ne_porte_pas_de_drapeau(self, monkeypatch):
        # ⚠️ Pas de drapeau plutôt qu'un drapeau faux : l'interface retombe sur sa
        # pastille de couleur, qui ne prétend rien.
        monkeypatch.setattr(ev, "CALENDRIER_MACRO",
                            [("2026-08-28", "Inconnu", "Mars", None)])
        assert ev.evenements_du_portefeuille([], REF)["evenements"][0]["pays"] is None

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


class TestTransparence:
    """
    Les échéances des sociétés détenues par un fonds.

    ⚠️ C'est la **seule** échéance qu'un ETF puisse avoir : il ne publie pas de
    résultats, et un ETF capitalisant ne détache jamais de dividende — vérifié sur
    les trois lignes d'un vrai PEA, dont les noms officiels portent « EUR C » et
    « Acc ». Sans transparence, ces portefeuilles n'ont aucun événement propre.
    """

    def brancher(self, monkeypatch, compositions, fiches):
        monkeypatch.setattr(ev, "_lignes_du_fonds", lambda tk: compositions[tk])
        monkeypatch.setattr(ev, "_fiche", lambda tk: fiches.get(tk, fiche()))

    def compo(self, *lignes, proxy="PROXY"):
        return {"version": ev._VERSION, "abouti": True, "echeance": 9e18,
                "proxy": proxy,
                "lignes": [{"ticker": t, "part": p} for t, p in lignes]}

    def test_l_exposition_est_le_produit_des_deux_poids(self, monkeypatch):
        # Une société qui pèse 7 % d'un fonds qui pèse 70 % expose le portefeuille
        # à 4,9 %. C'est le chiffre qui compte, pas le poids dans le fonds.
        self.brancher(monkeypatch,
                      {"ESE.PA": self.compo(("AAPL", 7.0))},
                      {"AAPL": fiche(resultats="2026-10-29", eps_estime=1.6)})
        r = ev.evenements_par_transparence({"ESE.PA": 70.0}, REF)
        e = r["evenements"][0]
        assert e["ticker"] == "AAPL"
        assert e["via"] == "ESE.PA"
        assert e["exposition"] == pytest.approx(4.9)
        assert e["libelle"] == "Résultats T3 2026"
        assert e["jours"] == 80

    def test_une_publication_passee_est_ecartee(self, monkeypatch):
        self.brancher(monkeypatch,
                      {"ESE.PA": self.compo(("AAPL", 7.0))},
                      {"AAPL": fiche(resultats="2026-07-30")})
        assert ev.evenements_par_transparence({"ESE.PA": 70.0}, REF)["evenements"] == []

    def test_un_fonds_sans_composition_est_nomme_sans_rien_inventer(self, monkeypatch):
        # ⚠️ Ce cas arrive vraiment : le fournisseur limite le débit, et tous les
        # proxys refusent. L'aveu vaut mieux qu'une composition devinée.
        monkeypatch.setattr(ev, "_lignes_du_fonds", lambda tk: {
            "version": ev._VERSION, "abouti": False, "echeance": 9e18,
            "lignes": [], "proxy": None})
        r = ev.evenements_par_transparence({"ESE.PA": 70.0}, REF)
        assert r["evenements"] == []
        assert r["fonds_opaques"] == ["ESE.PA"]

    def test_une_ligne_sans_date_ne_produit_rien(self, monkeypatch):
        self.brancher(monkeypatch,
                      {"ESE.PA": self.compo(("AAPL", 7.0), ("BRK-B", 1.7))},
                      {"AAPL": fiche(resultats="2026-10-29"), "BRK-B": fiche()})
        r = ev.evenements_par_transparence({"ESE.PA": 70.0}, REF)
        assert [e["ticker"] for e in r["evenements"]] == ["AAPL"]

    def test_a_date_egale_la_plus_forte_exposition_passe_devant(self, monkeypatch):
        self.brancher(monkeypatch,
                      {"ESE.PA": self.compo(("AAPL", 7.0), ("MSFT", 6.0))},
                      {"AAPL": fiche(resultats="2026-10-29"),
                       "MSFT": fiche(resultats="2026-10-29")})
        r = ev.evenements_par_transparence({"ESE.PA": 70.0}, REF)
        assert [e["ticker"] for e in r["evenements"]] == ["AAPL", "MSFT"]

    def test_deux_fonds_exposent_chacun_le_leur(self, monkeypatch):
        self.brancher(monkeypatch, {
            "ESE.PA": self.compo(("AAPL", 7.0)),
            "PAEJ.PA": self.compo(("TSM", 10.0)),
        }, {
            "AAPL": fiche(resultats="2026-10-29"),
            "TSM": fiche(resultats="2026-10-15"),
        })
        r = ev.evenements_par_transparence({"ESE.PA": 70.0, "PAEJ.PA": 10.0}, REF)
        # Le taïwanais publie plus tôt mais pèse moins : l'ordre est chronologique.
        assert [(e["ticker"], e["exposition"]) for e in r["evenements"]] == \
            [("TSM", 1.0), ("AAPL", 4.9)]

    def test_le_nombre_de_lignes_retenues_est_annonce(self, monkeypatch):
        # ⚠️ La vue est partielle par construction : le fournisseur ne rend que les
        # dix premières positions, et un fonds S&P 500 en compte cinq cents.
        # L'interface doit pouvoir le dire.
        monkeypatch.setattr(ev, "_lignes_du_fonds", lambda tk: self.compo())
        r = ev.evenements_par_transparence({"ESE.PA": 70.0}, REF)
        assert r["lignes_par_fonds"] == ev.LIGNES_PAR_FONDS == 10


class TestExpositionDuTitre:
    """L'exposition cumule la détention directe et celle vue par les fonds."""

    def compositions(self, **fonds):
        return {tk: {"poids": poids,
                     "lignes": [{"ticker": t, "part": p} for t, p in lignes]}
                for tk, (poids, lignes) in fonds.items()}

    def test_une_ligne_detenue_en_direct(self):
        assert ev.exposition_du_titre("TSLA", {"TSLA": 50.0}, {}) == 50.0

    def test_une_ligne_vue_par_un_fonds(self):
        c = self.compositions(**{"ESE.PA": (70.0, [("NVDA", 7.55)])})
        assert ev.exposition_du_titre("NVDA", {"ESE.PA": 70.0}, c) == pytest.approx(5.285)

    def test_les_deux_s_additionnent(self):
        # ⚠️ Le cas réel : détenir Tesla en direct **et** par son ETF S&P 500. Ne
        # compter que l'une des deux sous-estime l'exposition.
        c = self.compositions(**{"ESE.PA": (70.0, [("TSLA", 1.83)])})
        assert ev.exposition_du_titre("TSLA", {"TSLA": 10.0, "ESE.PA": 70.0}, c) \
            == pytest.approx(11.281)

    def test_plusieurs_fonds_portant_le_meme_titre(self):
        c = self.compositions(**{
            "ESE.PA": (70.0, [("NVDA", 7.0)]),
            "CW8.PA": (20.0, [("NVDA", 5.0)]),
        })
        assert ev.exposition_du_titre("NVDA", {}, c) == pytest.approx(5.9)

    def test_un_titre_absent_n_expose_pas(self):
        c = self.compositions(**{"ESE.PA": (70.0, [("NVDA", 7.0)])})
        assert ev.exposition_du_titre("AAPL", {}, c) == 0.0

    def test_un_fonds_sans_composition_n_ajoute_rien(self):
        assert ev.exposition_du_titre("NVDA", {}, {"ESE.PA": {"poids": 70.0}}) == 0.0


class TestImpactDuTitre:
    def brancher(self, monkeypatch, lignes, compo=None):
        monkeypatch.setattr(ev, "_reactions", lambda tk: {
            "version": ev._VERSION, "abouti": True, "echeance": 9e18, "lignes": lignes})
        monkeypatch.setattr(ev, "_lignes_du_fonds", lambda tk: compo or {
            "version": ev._VERSION, "abouti": True, "echeance": 9e18,
            "lignes": [], "proxy": "P"})

    def passees(self, n, variation=4.0):
        return [{"date": f"2025-{m:02d}-15", "moment": "apres_cloture", "surprise": 1.0,
                 "eps_publie": 1.0, "eps_estime": 1.0, "variation": variation}
                for m in range(1, n + 1)]

    def test_l_exposition_accompagne_la_statistique(self, monkeypatch):
        self.brancher(monkeypatch, self.passees(6))
        r = ev.impact_du_titre("TSLA", {"TSLA": 50.0}, {})
        assert r["ticker"] == "TSLA"
        assert r["exposition"] == 50.0
        assert r["impact_moyen"] == pytest.approx(4.0)

    def test_un_titre_qui_n_expose_pas_ne_rend_rien(self, monkeypatch):
        self.brancher(monkeypatch, self.passees(6))
        assert ev.impact_du_titre("AAPL", {"TSLA": 50.0}, {}) is None

    def test_un_echantillon_trop_mince_ne_rend_rien(self, monkeypatch):
        # Cohérent avec `statistiques` : sous quatre trimestres, aucune moyenne.
        self.brancher(monkeypatch, self.passees(3))
        assert ev.impact_du_titre("TSLA", {"TSLA": 50.0}, {}) is None

    def test_un_titre_vu_par_transparence_est_couvert(self, monkeypatch):
        # ⚠️ C'est le cas d'un PEA d'ETF : le titre n'est pas une ligne du
        # portefeuille, mais il l'expose bel et bien.
        self.brancher(monkeypatch, self.passees(6), compo={
            "version": ev._VERSION, "abouti": True, "echeance": 9e18, "proxy": "SPY",
            "lignes": [{"ticker": "NVDA", "part": 7.55}]})
        r = ev.impact_du_titre("NVDA", {"ESE.PA": 70.0}, {"ESE.PA": 70.0})
        assert r["exposition"] == pytest.approx(5.285)


class TestFluxMacro:
    """
    Le flux macro automatique : ce qu'on en garde, et ce qu'on refuse.

    ⚠️ Aucun appel au fournisseur ici. Le tri est écrit comme une fonction pure
    précisément pour être éprouvé sur des lignes fabriquées — dont les cas tordus
    relevés sur le flux réel : le même chiffre annoncé huit jours de suite, huit
    libellés pour une même publication, et une date UTC qui n'est pas la date locale.
    """

    def ligne(self, region, evenement, jour, pour=None, heure=None):
        return {"region": region, "evenement": evenement, "jour": jour,
                "pour": pour, "heure": heure}

    def test_une_region_hors_du_portefeuille_est_ecartee(self):
        # Le flux compte 63 régions, dominées par l'Ouganda, Bahreïn et Oman. Sans
        # filtre, la liste d'un PEA parlerait du solde budgétaire omanais.
        l = [self.ligne("UG", "CPI YY*", "2026-08-20", "Aug")]
        assert ev.retenir_du_flux(l, {"US"}, set(), REF) == []

    def test_un_indicateur_hors_liste_blanche_est_ecarte(self):
        l = [self.ligne("US", "M2 Money Supply*", "2026-08-20", "Jul")]
        assert ev.retenir_du_flux(l, {"US"}, set(), REF) == []

    def test_une_famille_annoncee_plusieurs_jours_est_ecartee(self):
        """
        ⚠️ Le cas le plus important. 71 % des libellés du flux portent un astérisque,
        et le même chiffre est annoncé jusqu'à huit jours de suite — « SA CPI MM* »
        pour la même période de référence. Le flux ne connaît pas la date ; en retenir
        une aurait inventé une précision, et les retenir toutes aurait mis huit fois
        la même publication au calendrier.
        """
        l = [self.ligne("TW", "CPI YY*", f"2026-08-2{j}", "Aug") for j in range(3)]
        assert ev.retenir_du_flux(l, {"TW"}, set(), REF) == []

    def test_deux_periodes_differentes_ne_sont_pas_une_date_incertaine(self):
        # ⚠️ Le discriminant est la période de référence, pas le nombre de jours. Une
        # série hebdomadaire paraît sur plusieurs jours en toute légitimité : l'écarter
        # aurait supprimé les inscriptions au chômage, publiées chaque jeudi.
        l = [self.ligne("US", "Jobless Claims", "2026-08-13", "Aug 8"),
             self.ligne("US", "Jobless Claims", "2026-08-20", "Aug 15")]
        assert len(ev.retenir_du_flux(l, {"US"}, set(), REF)) == 2

    def test_huit_libelles_pour_une_publication_ne_font_qu_une_ligne(self):
        # Relevé sur le flux réel : le PCE du 26 août arrive en huit libellés, « Core
        # PCE Price Index MM », « PCE Price Index YY », « Dallas Fed PCE »…
        l = [self.ligne("US", n, "2026-08-26", "Jul") for n in
             ("Core PCE Price Index MM *", "PCE Price Index YY *", "Dallas Fed PCE*")]
        r = ev.retenir_du_flux(l, {"US"}, set(), REF)
        assert len(r) == 1
        assert r[0].libelle == "Inflation · PCE (juillet)"

    def test_le_releve_prime_sur_le_flux(self, monkeypatch):
        """
        ⚠️ Sans ceci, l'IPC américain du 12 août paraîtrait deux fois : une fois par
        le relevé, avec son heure officielle de 8 h 30 et son libellé sourcé, une fois
        par le flux sans heure. Deux lignes pour une publication, dont une moins bonne.
        """
        # ⚠️ Le vrai calendrier est remis en place : la fixture le vide par défaut, et
        # sans lui `familles_relevees` ne tiendrait rien — le test aurait passé pour
        # une raison qui n'est pas la bonne.
        monkeypatch.setattr(ev, "CALENDRIER_MACRO", VRAI_CALENDRIER)
        l = [self.ligne("US", "CPI YY, NSA", "2026-08-12", "Jul")]
        deja = ev.familles_relevees(REF)
        assert ("USA", "2026-08-12", "Inflation · IPC") in deja
        assert ev.retenir_du_flux(l, {"US"}, deja, REF) == []
        # Sans le relevé, la même ligne serait retenue : c'est bien lui qui l'écarte.
        assert len(ev.retenir_du_flux(l, {"US"}, set(), REF)) == 1

    def test_au_dela_de_l_horizon_rien_n_est_retenu(self):
        l = [self.ligne("US", "Retail Sales", "2026-11-01", "Oct")]
        assert ev.retenir_du_flux(l, {"US"}, set(), REF) == []

    def test_le_jour_est_celui_de_la_zone_et_non_l_utc(self):
        """
        ⚠️ Relevé sur le flux réel : l'emploi coréen est daté du 11 août à 23 h UTC,
        ce qui est le 12 à 8 h à Séoul. Recopier la date UTC l'annonçait la veille, et
        le faisait manquer à qui filtre le calendrier sur le bon jour.
        """
        l = [self.ligne("KR", "Unemployment Rate", "2026-08-11", "Jul",
                        "2026-08-11T23:00:00+00:00")]
        r = ev.retenir_du_flux(l, {"KR"}, set(), REF)
        assert [e.date for e in r] == ["2026-08-12"]

    def test_taiwan_porte_desormais_son_drapeau(self):
        """
        ⚠️ Ce test disait l'inverse jusqu'ici, et c'était juste : le dossier d'images du
        projet n'avait que quinze pays, sans Taïwan ni la Corée — les deux premières
        expositions asiatiques d'un vrai PEA s'affichaient donc sans drapeau. Le jeu de
        261 pays les a tous. Le repli existe toujours pour un code inconnu, mais il
        n'est plus la situation normale de trois zones sur vingt-six.
        """
        l = [self.ligne("TW", "GDP QQ", "2026-08-14", "Q2")]
        assert ev.retenir_du_flux(l, {"TW"}, set(), REF)[0].pays == "tw"

    def test_le_flux_se_signe(self):
        l = [self.ligne("US", "Retail Sales", "2026-08-14", "Jul")]
        assert ev.retenir_du_flux(l, {"US"}, set(), REF)[0].source == "flux"

    def test_le_releve_se_signe_aussi(self, monkeypatch):
        monkeypatch.setattr(ev, "CALENDRIER_MACRO",
                            [("2026-08-28", "Décision", "USA", None)])
        assert ev.evenements_du_portefeuille([], REF)["evenements"][0]["source"] == "relevé"


class TestRegionsDuPortefeuille:
    def test_le_suffixe_de_cotation_donne_le_pays(self):
        assert ev.region_du_ticker("2330.TW") == "TW"
        assert ev.region_du_ticker("005930.KS") == "KR"
        assert ev.region_du_ticker("0700.HK") == "HK"
        assert ev.region_du_ticker("NOVN.SW") == "CH"
        assert ev.region_du_ticker("AAPL") == "US"

    def test_un_ticker_numerique_sans_suffixe_n_est_pas_americain(self):
        """
        ⚠️ « 005935 » est Samsung préférentielle et « 00939 » China Construction Bank,
        toutes deux sorties des compositions de fonds sans suffixe. Les compter comme
        américaines aurait fait entrer la macro des États-Unis par la Corée.
        """
        assert ev.region_du_ticker("005935") is None
        assert ev.region_du_ticker("00939") is None

    def test_une_paire_de_cryptomonnaie_n_a_pas_de_pays(self):
        # ⚠️ Le critère est la devise de cotation et non le tiret : « BRK-B » en porte
        # un et se traite bien à New York.
        assert ev.region_du_ticker("BTC-USD") is None
        assert ev.region_du_ticker("ETH-EUR") is None
        assert ev.region_du_ticker("BRK-B") == "US"

    def test_une_valeur_de_la_zone_euro_rend_la_zone_pertinente(self):
        # Détenir Schneider rend les publications de la zone euro pertinentes, en plus
        # des françaises.
        assert ev.regions_du_portefeuille(["SU.PA"]) == {"FR", "EU"}
        # Une valeur suisse ou britannique, non : ni la BCE ni l'IPCH ne la concernent.
        assert ev.regions_du_portefeuille(["NOVN.SW"]) == {"CH"}

    def test_toute_region_deduite_a_une_zone_nommee(self):
        """
        ⚠️ Le garde contre un oubli **silencieux**. Une région déduite d'un ticker mais
        absente de `ZONES` n'a pas de nom, donc `ZONE_PAR_REGION` ne la trouve pas,
        donc le flux l'écarte sans un mot : le portefeuille paraît ne rien devoir à un
        pays dont il détient le plus gros titre. C'est ce qui s'est passé pour le
        Danemark et la Belgique — Novo Nordisk et AB InBev — avant ce test.
        """
        for suffixe, region in ev.SUFFIXE_REGION.items():
            assert region in ev.ZONE_PAR_REGION, f".{suffixe} -> {region}"
        for region in ev.ZONE_EURO:
            assert region in ev.ZONE_PAR_REGION, region
        assert "EU" in ev.ZONE_PAR_REGION

    def test_les_places_europeennes_lourdes_sont_couvertes(self):
        # Des valeurs qui pèsent dans un STOXX Europe 600 et n'avaient aucune région.
        assert ev.region_du_ticker("NOVO-B.CO") == "DK"      # Novo Nordisk
        assert ev.region_du_ticker("ABI.BR") == "BE"         # AB InBev
        assert ev.region_du_ticker("ATCO-A.ST") == "SE"      # Atlas Copco
        assert ev.region_du_ticker("NOKIA.HE") == "FI"
        assert ev.region_du_ticker("EQNR.OL") == "NO"        # Equinor
        # Un titre à catégories multiples garde bien sa place : le tiret ne trompe pas.
        assert ev.regions_du_portefeuille(["NOVO-B.CO"]) == {"DK"}
        # La Belgique est dans la zone euro, le Danemark non.
        assert ev.regions_du_portefeuille(["ABI.BR"]) == {"BE", "EU"}

    def test_la_periode_de_reference_est_traduite(self):
        assert ev.periode_fr("Aug") == "août"
        assert ev.periode_fr("Q2") == "T2"
        assert ev.periode_fr(None) is None

    def test_le_jour_de_la_periode_est_conserve(self):
        """
        ⚠️ Le défaut que le test des séries hebdomadaires a révélé. « Aug 8 » et
        « Aug 15 » rendaient tous deux « août », donc la même période de référence,
        donc une date jugée incertaine, donc deux publications écartées.
        """
        assert ev.periode_fr("Aug 8") == "8 août"
        assert ev.periode_fr("Aug 15") == "15 août"
        assert ev.periode_fr("Aug 8") != ev.periode_fr("Aug 15")
