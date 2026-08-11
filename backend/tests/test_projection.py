"""
La projection d'un objectif : ce que le modèle rend, et ce qu'il refuse de rendre.

Aucun réseau, aucune base : de l'arithmétique et des tirages pseudo-aléatoires dont la
graine est fixée.
"""

import pytest

from app.services import objectifs as ob
from app.services import projection as pr


class TestSansVolatilite:
    """
    ⚠️ Le cas qui compte le plus. Sans volatilité **mesurée**, il n'y a pas de
    dispersion à montrer : ni intervalle ni probabilité. En inventer une donnerait une
    fausse précision, et c'est justement le genre de chiffre sur lequel on décide.
    """

    def test_aucun_intervalle_et_aucune_probabilite(self):
        p = pr.projeter(10_000, 500, 7.0, None, 120, requis=100_000)
        assert p.intervalle is None
        assert p.probabilite is None

    def test_les_trois_enveloppes_sont_la_meme_courbe(self):
        p = pr.projeter(10_000, 500, 7.0, None, 60, requis=None)
        assert p.enveloppes[5] == p.enveloppes[50] == p.enveloppes[95]

    def test_cette_courbe_est_celle_du_calcul_deterministe(self):
        # Le lien avec `objectifs.valeur_projetee` : deux chemins, un seul résultat.
        p = pr.projeter(10_000, 500, 7.0, None, 60, requis=None)
        attendu = ob.valeur_projetee(10_000, 500, 7.0, 60)
        assert p.enveloppes[50][-1] == pytest.approx(attendu, rel=1e-9)


class TestVolatiliteNulle:
    """
    ⚠️ Volatilité **mesurée à zéro** et volatilité **inconnue** ne sont pas le même cas.
    Un livret a une dispersion nulle : c'est une information, et l'intervalle existe,
    réduit à un point. `None` est une ignorance.
    """

    def test_l_intervalle_existe_et_est_un_point(self):
        p = pr.projeter(10_000, 500, 7.0, 0.0, 60, requis=None, cle="x")
        bas, haut = p.intervalle
        assert haut - bas == pytest.approx(0, abs=1e-6)

    def test_la_probabilite_est_franche(self):
        atteint = pr.projeter(10_000, 500, 7.0, 0.0, 60, requis=1_000, cle="x")
        rate = pr.projeter(10_000, 500, 7.0, 0.0, 60, requis=10_000_000, cle="x")
        assert atteint.probabilite == 100.0
        assert rate.probabilite == 0.0

    def test_elle_rejoint_le_calcul_deterministe(self):
        p = pr.projeter(10_000, 500, 7.0, 0.0, 60, requis=None, cle="x")
        attendu = ob.valeur_projetee(10_000, 500, 7.0, 60)
        assert p.mediane == pytest.approx(attendu, rel=1e-6)


class TestAvecVolatilite:
    def test_les_enveloppes_sont_ordonnees(self):
        p = pr.projeter(50_000, 800, 7.0, 15.0, 180, requis=500_000, cle="obj-1")
        for i in range(len(p.mois)):
            assert p.enveloppes[5][i] <= p.enveloppes[50][i] <= p.enveloppes[95][i]

    def test_le_premier_point_est_la_valeur_de_depart(self):
        p = pr.projeter(50_000, 800, 7.0, 15.0, 60, requis=None, cle="obj-1")
        for c in pr.CENTILES:
            assert p.enveloppes[c][0] == pytest.approx(50_000)

    def test_plus_de_volatilite_elargit_l_intervalle(self):
        calme = pr.projeter(50_000, 800, 7.0, 8.0, 180, requis=None, cle="k")
        agite = pr.projeter(50_000, 800, 7.0, 25.0, 180, requis=None, cle="k")
        largeur = lambda p: p.intervalle[1] - p.intervalle[0]  # noqa: E731
        assert largeur(agite) > largeur(calme) * 2

    def test_la_mediane_ne_depend_pas_de_la_volatilite(self):
        """
        ⚠️ **Ce test a corrigé une convention, pas un bug de frappe.** Mon premier jet
        traitait le taux saisi comme une moyenne arithmétique des rendements mensuels :
        la médiane tombait alors de 378 000 € à 297 000 € quand la volatilité passait de
        8 % à 25 %, à rendement attendu identique. Le phénomène est réel — le drain de
        variance — mais il contredisait `objectifs.valeur_projetee`, qui compose le taux
        tel quel. Quelqu'un qui écrit « 7,2 % attendu » veut dire que son argent croît de
        7,2 % par an. C'est donc la trajectoire médiane qui porte le taux.
        """
        calme = pr.projeter(50_000, 800, 7.0, 8.0, 180, requis=None, cle="k")
        agite = pr.projeter(50_000, 800, 7.0, 25.0, 180, requis=None, cle="k")
        assert agite.mediane == pytest.approx(calme.mediane, rel=0.06)

    def test_la_mediane_rejoint_le_calcul_deterministe(self):
        # L'invariant qui lie les deux chemins : avec ou sans dispersion, la médiane
        # croît au taux annoncé. C'est ce que la convention retenue garantit.
        p = pr.projeter(50_000, 800, 7.0, 18.0, 180, requis=None, cle="k")
        attendu = ob.valeur_projetee(50_000, 800, 7.0, 180)
        assert p.mediane == pytest.approx(attendu, rel=0.05)

    def test_aucune_valeur_negative_meme_tres_agitee(self):
        """
        ⚠️ Le tirage porte sur le **logarithme** du rendement. Un tirage gaussien sur le
        rendement simple aurait permis −140 % en un mois, donc un patrimoine négatif :
        impossible sans levier, et cela déformait toute la queue basse.
        """
        p = pr.projeter(10_000, 0, 7.0, 60.0, 240, requis=None, cle="k")
        assert min(p.enveloppes[5]) >= 0

    def test_verser_davantage_augmente_la_probabilite(self):
        peu = pr.projeter(10_000, 200, 7.0, 15.0, 120, requis=100_000, cle="k")
        beaucoup = pr.projeter(10_000, 800, 7.0, 15.0, 120, requis=100_000, cle="k")
        assert beaucoup.probabilite > peu.probabilite

    def test_un_objectif_deja_atteint_est_presque_certain(self):
        p = pr.projeter(200_000, 0, 7.0, 15.0, 120, requis=50_000, cle="k")
        assert p.probabilite is not None and p.probabilite > 95


class TestReproductibilite:
    def test_deux_appels_identiques_rendent_le_meme_chiffre(self):
        """
        ⚠️ Sans graine fixe, deux affichages du même objectif donneraient deux
        probabilités — 71 % puis 73 % — et l'épargnant aurait raison de ne croire ni
        l'une ni l'autre.
        """
        a = pr.projeter(50_000, 800, 7.0, 15.0, 120, requis=200_000, cle="objectif-42")
        b = pr.projeter(50_000, 800, 7.0, 15.0, 120, requis=200_000, cle="objectif-42")
        assert a.probabilite == b.probabilite
        assert a.enveloppes[95] == b.enveloppes[95]

    def test_deux_objectifs_differents_ne_partagent_pas_les_tirages(self):
        a = pr.projeter(50_000, 800, 7.0, 15.0, 120, requis=200_000, cle="objectif-1")
        b = pr.projeter(50_000, 800, 7.0, 15.0, 120, requis=200_000, cle="objectif-2")
        assert a.enveloppes[95] != b.enveloppes[95]


class TestTauxImplicite:
    def test_il_retrouve_le_taux_qui_a_servi(self):
        # Un aller-retour : on compose à 7 %, on redemande le taux, on retrouve 7 %.
        arrivee = ob.valeur_projetee(10_000, 300, 7.0, 120)
        assert pr.taux_implicite(10_000, 300, arrivee, 120) == pytest.approx(7.0, abs=0.02)

    def test_un_resultat_hors_des_bornes_ne_rend_pas_la_borne(self):
        """
        ⚠️ Une arrivée absurde doit rendre `None`. Rendre 100 % ferait lire la borne de
        la dichotomie comme un rendement calculé.
        """
        assert pr.taux_implicite(1_000, 0, 10 ** 12, 12) is None

    def test_sans_horizon_aucun_taux(self):
        assert pr.taux_implicite(10_000, 300, 20_000, 0) is None


class TestJalons:
    def test_le_pas_reduit_le_nombre_de_points_sans_perdre_l_horizon(self):
        # ⚠️ Une courbe de 240 points sur 300 pixels ne se voit pas ; l'horizon, si.
        p = pr.projeter(10_000, 500, 7.0, 15.0, 240, requis=None, cle="k", pas=12)
        assert p.mois[0] == 0 and p.mois[-1] == 240
        assert len(p.mois) == 21

    def test_un_horizon_non_multiple_du_pas_garde_sa_derniere_annee(self):
        p = pr.projeter(10_000, 500, 7.0, 15.0, 250, requis=None, cle="k", pas=12)
        assert p.mois[-1] == 250


class TestVolatiliteMesuree:
    """
    ⚠️ **Cette classe existe à cause d'un chiffre absurde livré par un vrai portefeuille.**
    Mon premier jet dérivait la courbe de *valeur* du portefeuille pour en tirer l'écart
    type. Cette courbe contient les versements : sur un portefeuille jeune, un apport de
    800 € sur 3 500 € ressemble à une hausse de 23 %. Trois ETF larges sortaient à
    **140,69 %** de volatilité annualisée, et l'intervalle de projection montait à 4,85
    milliards d'euros. Après correction, le même portefeuille mesure **11,91 %** sur
    129 séances.

    Les tests portent sur la règle, pas sur le réseau : ils vérifient d'où le calcul lit
    ses rendements, ce qu'aucune valeur de retour n'aurait révélé.
    """

    def test_les_rendements_viennent_du_champ_flux_neutralise(self):
        import inspect

        from app.services.volatilite import volatilite_mesuree
        src = inspect.getsource(volatilite_mesuree)
        assert 'p["ret"]' in src, \
            "la volatilité doit lire le rendement flux neutralisé, pas la valeur"
        assert "np.diff(np.log" not in src, \
            "dériver la courbe de valeur recompte les versements comme performance"

    def test_aucun_filtre_de_valeurs_extremes(self):
        # ⚠️ J'en avais posé un pour compenser le défaut ci-dessus : il écartait de vraies
        # séances de marché et sous-estimait la dispersion. Le bon remède était de lire la
        # bonne colonne, pas de rogner les queues.
        import inspect

        from app.services.volatilite import volatilite_mesuree
        assert "percentile" not in inspect.getsource(volatilite_mesuree)

    def test_un_echantillon_court_ne_rend_pas_de_chiffre(self):
        from app.services.volatilite import JOURS_MINIMAUX, volatilite_mesuree
        assert JOURS_MINIMAUX >= 60
        vol, source, n = volatilite_mesuree([])
        assert vol is None and source == "indisponible" and n == 0

    def test_les_trois_causes_sont_distinctes(self):
        # « je n'ai pas pu » et « je n'ai pas assez » ne se corrigent pas pareil.
        import inspect

        from app.services.volatilite import volatilite_mesuree
        src = inspect.getsource(volatilite_mesuree)
        for cause in ('"mesuree"', '"echantillon_court"', '"indisponible"'):
            assert cause in src, cause
