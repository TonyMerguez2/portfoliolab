"""
Ce qu'on déduit du portefeuille, et ce qu'on refuse d'en déduire.

Aucun réseau : des transactions fabriquées et de l'arithmétique.
"""

from datetime import date, datetime
from types import SimpleNamespace

import pytest

from app.services import parametres_objectif as po


def tx(jour: str, montant: float, side: str = "BUY"):
    """Une transaction dont le produit quantité × prix vaut `montant`."""
    return SimpleNamespace(executed_at=datetime.fromisoformat(jour + "T10:00:00"),
                           side=side, quantity=1.0, unit_price=montant, fees=0.0)


class TestVersementObserve:
    def test_le_rythme_est_le_net_divise_par_les_mois(self):
        t = [tx("2026-02-10", 1000), tx("2026-04-10", 1000), tx("2026-06-10", 1000)]
        v = po.versement_observe(t, date(2026, 8, 11))
        assert v is not None
        assert v.net == 3000 and v.mois == 6
        assert v.par_mois == 500

    def test_une_vente_se_retranche(self):
        """
        ⚠️ Un arbitrage n'est pas un versement. Ne compter que les achats surestimerait
        l'effort d'épargne de quiconque a vendu pour racheter autre chose.
        """
        t = [tx("2026-02-10", 5000), tx("2026-05-10", 2000, side="SELL")]
        v = po.versement_observe(t, date(2026, 8, 11))
        assert v is not None and v.net == 3000

    def test_la_casse_de_side_n_est_pas_piegeuse(self):
        """
        ⚠️ Ce test vient d'une mesure fausse. La colonne vaut « BUY » en majuscules ; ma
        sonde comparait avec « buy » et rendait zéro euro de versement, sans rien
        signaler. Un zéro silencieux de plus.
        """
        for casse in ("BUY", "buy", "Buy"):
            v = po.versement_observe([tx("2026-02-10", 1200, side=casse)], date(2026, 8, 11))
            assert v is not None and v.net == 1200, casse

    def test_un_apport_unique_est_signale_comme_trompeur(self):
        """
        ⚠️ Le cas décisif. Un versement unique au départ, divisé par six mois, ressemble à
        une habitude qui n'existe pas — et la projection promettrait alors des apports que
        personne n'a l'intention de faire.
        """
        v = po.versement_observe([tx("2026-02-10", 6000)], date(2026, 8, 11))
        assert v is not None
        assert v.concentration == 100.0
        assert v.trompeur is True

    def test_des_apports_reguliers_ne_sont_pas_signales(self):
        t = [tx(f"2026-0{m}-10", 800) for m in range(2, 8)]
        v = po.versement_observe(t, date(2026, 8, 11))
        assert v is not None and v.trompeur is False

    def test_un_net_negatif_ne_rend_aucun_rythme(self):
        # Plus de ventes que d'achats : il n'y a pas de versement à proposer.
        t = [tx("2026-02-10", 1000), tx("2026-03-10", 3000, side="SELL")]
        v = po.versement_observe(t, date(2026, 8, 11))
        assert v is not None and v.par_mois is None and v.trompeur is True

    def test_sans_transaction_rien_n_est_propose(self):
        assert po.versement_observe([]) is None


class TestAnnualiser:
    def test_sous_une_annee_aucun_chiffre(self):
        """
        ⚠️ Annualiser six mois multiplie par deux un hasard de six mois. Un portefeuille
        en hausse de quatorze pour cent depuis février afficherait « trente pour cent par
        an », ce qu'aucune donnée ne soutient.
        """
        assert po.annualiser([0.001] * 120) is None

    def test_une_annee_pleine_donne_un_taux(self):
        # 252 séances à +0,0002 par jour ≈ +5,2 % l'an.
        r = po.annualiser([0.0002] * 252)
        assert r is not None and 5.0 < r < 5.4

    def test_le_taux_ne_depend_pas_de_la_longueur_au_dela_d_un_an(self):
        court = po.annualiser([0.0002] * 252)
        long = po.annualiser([0.0002] * 1260)
        assert court == pytest.approx(long, abs=0.01)


class TestInflation:
    def test_la_reference_est_la_cible_de_la_bce(self):
        # ⚠️ Une cible de politique monétaire publiée, pas une prévision de ce logiciel.
        assert po.INFLATION_CIBLE_BCE == 2.0
