"""
Les objectifs d'épargne : ce que le calcul refuse, et ce qu'il n'invente pas.

Aucun accès au réseau ni à la base : tout ce qui est éprouvé ici est de l'arithmétique
sur des valeurs passées en argument.
"""

from datetime import date

import pytest

from app.services import objectifs as ob


class TestCapitalRequis:
    def test_un_capital_est_sa_propre_cible(self):
        assert ob.capital_requis("capital", 1_250_000) == 1_250_000

    def test_un_revenu_mensuel_se_convertit_par_le_taux_de_retrait(self):
        """
        ⚠️ Le cas qui justifie la fonction. 5 000 € par mois n'est pas un montant : à
        4 % l'an, il réclame 1 500 000 € de capital. Comparer 5 000 à un portefeuille
        de 183 000 aurait affiché un objectif largement dépassé alors qu'il manque plus
        d'un million.
        """
        assert ob.capital_requis("revenu_mensuel", 5_000) == 1_500_000

    def test_le_taux_de_retrait_est_modifiable(self):
        # À 3 %, le même revenu réclame un tiers de plus.
        assert ob.capital_requis("revenu_mensuel", 5_000, taux_retrait=3.0) == 2_000_000

    def test_un_taux_de_retrait_nul_ne_rend_pas_l_infini(self):
        assert ob.capital_requis("revenu_mensuel", 5_000, taux_retrait=0) is None

    def test_une_cible_nulle_n_est_pas_un_objectif(self):
        assert ob.capital_requis("capital", 0) is None


class TestProgression:
    def test_l_avancement_vient_de_la_valeur_reelle(self):
        p = ob.progression("capital", 1_000_000, valeur_portefeuille=250_000)
        assert p is not None
        assert p.actuel == 250_000 and p.requis == 1_000_000
        assert p.part == pytest.approx(25.0)
        assert p.atteint is False

    def test_la_part_affectee_repartit_le_portefeuille(self):
        """
        ⚠️ Sans elle, deux objectifs sur un même portefeuille compteraient chacun la
        totalité — le même euro servant deux fois. C'est l'épargnant qui répartit ; le
        logiciel ne devine pas qu'un tiers du PEA est pour la retraite.
        """
        p = ob.progression("capital", 100_000, 200_000, part_affectee=30)
        assert p is not None and p.actuel == pytest.approx(60_000)

    def test_la_somme_des_parts_n_est_pas_normalisee(self):
        # Deux objectifs à 80 % chacun comptent 160 % du portefeuille. C'est une erreur
        # de saisie que l'écran doit montrer, pas que le calcul doit corriger en douce.
        a = ob.progression("capital", 100_000, 100_000, part_affectee=80)
        b = ob.progression("capital", 100_000, 100_000, part_affectee=80)
        assert a is not None and b is not None
        assert a.actuel + b.actuel == pytest.approx(160_000)

    def test_l_avancement_est_borne_a_cent(self):
        p = ob.progression("capital", 10_000, 50_000)
        assert p is not None and p.part == 100.0 and p.atteint is True

    def test_un_revenu_mensuel_se_juge_sur_le_capital_requis(self):
        # 183 420 € pour 5 000 €/mois : 12,2 % du chemin, pas un objectif dépassé.
        p = ob.progression("revenu_mensuel", 5_000, 183_420)
        assert p is not None
        assert p.requis == 1_500_000
        assert p.part == pytest.approx(12.228, abs=1e-3)


class TestEcheance:
    def test_l_echeance_court_jusqu_a_la_fin_de_l_annee(self):
        """
        ⚠️ « Atteindre 300 000 € en 2031 » laisse jusqu'à décembre 2031. Compter jusqu'au
        1er janvier retirait onze mois à chaque objectif et durcissait toutes les
        projections d'autant.
        """
        # Septembre à décembre 2026, puis 2027 à 2031 : quatre mois et cinq années.
        # ⚠️ J'avais d'abord écrit « quatre années » ici, et c'est le test qui a échoué,
        # pas la fonction. Le compte d'années entre deux millésimes se trompe d'un cran
        # dès qu'on le fait de tête.
        assert ob.echeance_en_mois(2031, date(2026, 8, 11)) == 5 * 12 + 4 == 64

    def test_l_annee_en_cours_garde_ses_mois_restants(self):
        assert ob.echeance_en_mois(2026, date(2026, 8, 11)) == 4

    def test_une_echeance_passee_ne_rend_rien(self):
        assert ob.echeance_en_mois(2024, date(2026, 8, 11)) is None

    def test_sans_echeance_aucun_horizon(self):
        assert ob.echeance_en_mois(None) is None

    def test_un_age_se_date_avec_l_annee_de_naissance(self):
        assert ob.annee_de_l_age(60, 1990) == 2050

    def test_sans_annee_de_naissance_un_age_reste_sans_date(self):
        """
        ⚠️ « Retraite à 60 ans » n'est datable que si l'on sait quand la personne est
        née. Deviner aurait daté une retraite au hasard.
        """
        assert ob.annee_de_l_age(60, None) is None


class TestValeurProjetee:
    def test_sans_versement_c_est_la_capitalisation_seule(self):
        # 10 000 € à 7 % pendant 12 mois.
        assert ob.valeur_projetee(10_000, 0, 7.0, 12) == pytest.approx(10_700, abs=1)

    def test_le_taux_mensuel_est_la_racine_douzieme_et_non_le_douzieme(self):
        """
        ⚠️ Diviser le taux annuel par douze surestime le résultat, d'autant plus que
        l'horizon est long. Sur vingt ans à 7 %, l'écart dépasse deux pour cent du
        capital final — assez pour faire croire un objectif atteint.
        """
        mois = 240
        juste = ob.valeur_projetee(100_000, 0, 7.0, mois)
        naif = 100_000 * (1 + 0.07 / 12) ** mois
        assert naif > juste
        assert (naif - juste) / juste > 0.02

    def test_les_versements_s_ajoutent_en_fin_de_mois(self):
        # Un mois, taux nul : le capital plus un versement, ni plus ni moins.
        assert ob.valeur_projetee(1_000, 200, 0.0, 1) == pytest.approx(1_200)

    def test_un_horizon_nul_rend_le_depart(self):
        assert ob.valeur_projetee(5_000, 500, 7.0, 0) == 5_000


class TestMoisPourAtteindre:
    def test_un_objectif_deja_atteint_ne_demande_aucun_mois(self):
        assert ob.mois_pour_atteindre(200_000, 500, 7.0, 100_000) == 0

    def test_le_nombre_de_mois_est_le_premier_qui_suffit(self):
        m = ob.mois_pour_atteindre(0, 1_000, 0.0, 10_000)
        assert m == 10

    def test_un_objectif_hors_de_portee_ne_rend_pas_le_plafond(self):
        """
        ⚠️ Sans versement et à taux nul, aucune durée ne convient. Rendre le plafond
        aurait fait lire « quatre-vingts ans » comme une estimation, alors que c'est un
        aveu d'impossibilité.
        """
        assert ob.mois_pour_atteindre(1_000, 0, 0.0, 1_000_000) is None

    def test_les_interets_seuls_peuvent_suffire(self):
        # Sans versement mais à 7 %, 100 000 € atteignent 200 000 € en une dizaine
        # d'années : la fonction doit le trouver sans versement.
        m = ob.mois_pour_atteindre(100_000, 0, 7.0, 200_000)
        assert m is not None and 100 <= m <= 130


class TestEurosConstants:
    def test_l_inflation_ramene_au_pouvoir_d_achat_d_aujourd_hui(self):
        """
        ⚠️ Un million dans trente ans à 2 % d'inflation en vaut environ 552 000
        d'aujourd'hui. N'afficher que le montant nominal flatte la projection.
        """
        assert ob.euros_constants(1_000_000, 2.0, 360) == pytest.approx(552_071, abs=500)

    def test_sans_inflation_le_montant_ne_bouge_pas(self):
        assert ob.euros_constants(1_000, 0.0, 120) == 1_000


class TestGenres:
    def test_les_sortes_couvertes(self):
        assert set(ob.GENRES) == {"capital", "capital_age", "achat", "revenu_mensuel",
                                  "plafond_versements"}

    def test_seul_le_plafond_se_mesure_sur_les_versements(self):
        """
        ⚠️ La frontière que ce test garde. Les quatre premiers genres se mesurent sur la
        valeur du portefeuille ; le cinquième sur ce qui y a été versé. Un genre qui
        basculerait du mauvais côté de cette liste afficherait un plafond de PEA atteint
        alors qu'il reste de la capacité de versement — voir `test_plafond_versements.py`.
        """
        assert ob.se_mesure_sur_les_versements("plafond_versements") is True
        for genre in ("capital", "capital_age", "achat", "revenu_mensuel"):
            assert ob.se_mesure_sur_les_versements(genre) is False

    def test_seul_le_revenu_mensuel_passe_par_un_taux_de_retrait(self):
        # Les trois autres sont des montants : leur capital requis est leur cible.
        for genre in ("capital", "capital_age", "achat"):
            assert ob.capital_requis(genre, 300_000, taux_retrait=3.0) == 300_000


class TestValidationDesRoutes:
    """
    Les refus à l'écriture. ⚠️ À l'écriture et non à la lecture : un taux hors bornes
    entré une fois fausserait toutes les projections suivantes sans que rien ne le
    signale — le défaut déjà rencontré sur les frais courants.
    """

    def valider(self, **kw):
        from app.api.routes.objectifs import ObjectifEntree, _valider
        base = {"nom": "Retraite", "genre": "capital", "cible": 100_000.0}
        _valider(ObjectifEntree(**{**base, **kw}))

    def refuse(self, **kw):
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as e:
            self.valider(**kw)
        return e.value.detail

    def test_un_objectif_bien_forme_passe(self):
        self.valider(echeance_annee=date.today().year + 5, taux_attendu=7.2)

    def test_un_genre_inconnu_est_refuse(self):
        assert "genre" in self.refuse(genre="peu_importe")

    def test_un_objectif_sans_nom_est_refuse(self):
        assert "nom" in self.refuse(nom="   ")

    def test_une_cible_nulle_ou_negative_est_refusee(self):
        assert self.refuse(cible=0) and self.refuse(cible=-5)

    def test_un_rendement_attendu_absurde_est_refuse(self):
        # ⚠️ 120 % l'an est soit une faute de frappe, soit une promesse que ce logiciel
        # ne relaiera pas dans une projection.
        assert "taux_attendu" in self.refuse(taux_attendu=120)

    def test_un_rendement_negatif_reste_permis(self):
        # Anticiper une baisse est un choix défendable ; ce n'est pas au logiciel de
        # décider que l'épargnant a tort d'être prudent.
        self.valider(taux_attendu=-3.0)

    def test_une_part_hors_de_zero_cent_est_refusee(self):
        assert "part_affectee" in self.refuse(part_affectee=140)

    def test_une_echeance_passee_est_refusee(self):
        assert "echeance_annee" in self.refuse(echeance_annee=date.today().year - 1)

    def test_un_objectif_en_age_exige_l_age(self):
        """
        ⚠️ Sans âge, « Retraite à 60 ans » n'a aucune échéance calculable et la carte
        resterait muette. Le refus tombe à la saisie, là où l'épargnant peut corriger.
        """
        assert "age_cible" in self.refuse(genre="capital_age")
        self.valider(genre="capital_age", age_cible=60)


class TestSourceDeLaValeur:
    def test_la_colonne_total_value_n_est_pas_la_valeur_courante(self):
        """
        ⚠️ Le constat qui a dicté la conception de ces routes. Sur un vrai PEA, la
        colonne vaut 4 959,91 € — exactement le montant investi — alors que le
        portefeuille en vaut 5 304,86 aux cours du jour. S'en servir aurait retiré toute
        la plus-value de l'avancement de chaque objectif.

        Ce test ne relit pas la base : il fixe la règle, à savoir que la fonction rend
        aussi **d'où** vient le nombre, pour que l'écran puisse prévenir.
        """
        import inspect

        from app.api.routes.objectifs import valeur_courante
        src = inspect.getsource(valeur_courante)
        assert "compute_positions" in src, "la valeur doit venir des quantités réelles"
        assert '"poids"' in src and '"transactions"' in src, \
            "la provenance de la valeur doit être rendue à l'appelant"

    def test_aucun_cours_obtenu_ne_vaut_pas_zero(self):
        """
        ⚠️ Le garde vient d'un vrai incident, trouvé en interrogeant les vraies données.
        Le premier jet sautait les lignes sans prix et sommait le reste : le fournisseur
        limitant le débit, la somme est sortie à 0,00 € avec la mention « transactions »,
        donc « 0 % de votre objectif » sur un PEA de cinq mille euros. Zéro est une
        valeur ; ici c'est la pire de toutes.
        """
        import inspect

        from app.api.routes.objectifs import valeur_courante
        src = inspect.getsource(valeur_courante)
        assert "valorisees == 0" in src, "l'absence totale de cours doit être distinguée"
        assert '"indisponible"' in src, "et rendue comme telle à l'appelant"

    def test_une_valorisation_partielle_se_compte(self):
        # Un total amputé d'une ligne reste faux : l'écran doit pouvoir le dire.
        import inspect

        from app.api.routes.objectifs import valeur_courante
        src = inspect.getsource(valeur_courante)
        assert "lignes_valorisees" in src and "lignes_totales" in src


class TestVersementRequis:
    """
    Le versement qu'il faudrait pour tenir l'échéance — l'inverse de `valeur_projetee`.

    ⚠️ **C'est le chiffre que le panneau d'aide n'avait pas.** Il répondait « à votre rythme,
    voilà quand vous y serez », jamais « pour y être à la date voulue, voilà le rythme ». La
    seconde question est celle qu'on se pose devant une échéance.
    """

    def test_est_l_inverse_exact_de_la_projection(self):
        """
        ⚠️ Le test qui compte : le versement rendu, réinjecté dans `valeur_projetee`, doit
        retomber sur le requis. Une formule fermée fausse d'un facteur `(1+r)` passerait
        inaperçue sans cette boucle — l'écart ne se voit pas sur un seul chiffre.

        ⚠️ **La tolérance est calculée, pas choisie.** Mon premier essai exigeait un euro près
        et échouait : le versement est arrondi au centime, et ce demi-centime d'arrondi se
        capitalise. Sur 264 mois à 7,2 %, il vaut 2,85 € à l'arrivée. Desserrer la marge « au
        pif » jusqu'à ce que le test passe aurait masqué le jour où la formule serait vraiment
        fausse ; on borne donc par l'arrondi lui-même, majoré d'un euro de marge numérique.
        """
        for taux in (0.0, 2.0, 7.2, 12.0):
            for mois in (12, 120, 264):
                for depart in (0.0, 5_000.0, 200_000.0):
                    v = ob.versement_requis(depart, taux, mois, 1_000_000.0)
                    assert v is not None
                    atteint = ob.valeur_projetee(depart, v, taux, mois)
                    # ⚠️ **L'identité ne vaut que si un versement est nécessaire.** Seconde
                    # prémisse fausse de ce test : à 12 % sur vingt-deux ans, 200 000 € de
                    # départ deviennent 2 420 062 € tout seuls. `versement_requis` rend alors
                    # zéro, à juste titre, et la projection **dépasse** le requis au lieu de
                    # l'égaler. Exiger l'égalité partout revenait à exiger que le capital de
                    # départ tombe pile sur la cible.
                    if v == 0.0:
                        assert atteint >= 1_000_000.0, (
                            f"aucun versement requis, mais {atteint} < le requis")
                        continue
                    r = (1 + taux / 100) ** (1 / 12) - 1
                    facteur = mois if abs(r) < 1e-12 else ((1 + r) ** mois - 1) / r
                    marge = 0.005 * facteur + 1.0
                    assert abs(atteint - 1_000_000.0) <= marge, (
                        f"taux={taux} mois={mois} depart={depart} v={v} → {atteint} "
                        f"(marge {marge:.2f})")

    def test_zero_quand_le_capital_suffit_seul(self):
        # 900 000 € à 7,2 % pendant 20 ans dépassent le million sans aucun versement.
        assert ob.versement_requis(900_000, 7.2, 240, 1_000_000) == 0.0

    def test_division_simple_a_taux_nul(self):
        # ⚠️ La formule générale divise par r : le cas r = 0 doit être traité à part, sinon
        # elle lève au lieu de rendre la division évidente.
        assert ob.versement_requis(0.0, 0.0, 100, 100_000) == 1_000.0
        assert ob.versement_requis(50_000.0, 0.0, 100, 100_000) == 500.0

    def test_rend_none_sans_horizon(self):
        assert ob.versement_requis(0.0, 7.0, 0, 100_000) is None
        assert ob.versement_requis(0.0, 7.0, -5, 100_000) is None
