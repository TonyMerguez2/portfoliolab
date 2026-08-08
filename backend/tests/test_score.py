"""
Le moteur NOVAC Portfolio Score.

Exécution : cd backend && ./venv/bin/python -m pytest tests/test_score.py -v

⚠️ Les portefeuilles d'essai sont construits, pas tirés au hasard, et le **facteur
commun est de variance unitaire**. Un premier jeu d'essai bâtissait la corrélation sur
une série de rendements — d'écart-type 0,011 — ce qui rendait les lignes quasi
indépendantes : la volatilité d'un portefeuille de dix actions à 18 % tombait à 5,8 %
au lieu des 14 % voulus, et j'ai failli lire le moteur comme fautif alors qu'il notait
juste. Un jeu d'essai qui se trompe accuse le code.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
import pandas as pd
import pytest

from app.services.analyse import profil_cible
from app.services.score.calculer import Entrees, calculer, en_dict
from app.services.score.config import BANDES, POIDS_PILIERS, VERSION_METHODOLOGIE, bande
from app.services.score.confiance import confiance
from app.services.score.normalisation import renormaliser
from app.services.score.profils import PROFILS
from app.services.score.types import Metrique, Pilier

N = 250


def facteur(graine: int, n: int = N) -> np.ndarray:
    """Un facteur commun d'écart-type **un**, pour que la corrélation soit celle qu'on veut."""
    x = np.random.default_rng(graine).normal(0, 1, n)
    return (x - x.mean()) / x.std()


def serie(vol_annuelle: float, graine: int, commun: np.ndarray | None = None,
          rho: float = 0.0) -> np.ndarray:
    """
    Une série de rendements d'écart-type annualisé exact, corrélée à `commun` à `rho`.

    La décomposition `rho·F + √(1−rho²)·ε` donne exactement la corrélation demandée
    quand `F` et `ε` sont d'écart-type un — d'où l'insistance sur `facteur`.
    """
    bruit = facteur(graine)
    x = bruit if commun is None else rho * commun + np.sqrt(1 - rho ** 2) * bruit
    x = (x - x.mean()) / x.std()
    return 0.0004 + (vol_annuelle / 100 / np.sqrt(252)) * x


SECTEURS_MONDE = [
    {"libelle": s, "part": p} for s, p in
    [("Technologie", 26), ("Finance", 16), ("Industrie", 12), ("Santé", 11),
     ("Consommation discrétionnaire", 11), ("Communication", 9),
     ("Consommation de base", 6), ("Énergie", 4), ("Services aux collectivités", 2.5),
     ("Immobilier", 2), ("Matériaux", 1.5)]
]


def pf_fonds(poids, vol, rho=0.85, ter=0.20, actifs_internes=150, graine=1) -> Entrees:
    """Un portefeuille de fonds larges, correctement diversifié."""
    commun = facteur(graine)
    return Entrees(
        poids=dict(poids),
        rendements=pd.DataFrame({k: serie(vol, graine + 10 + i, commun, rho)
                                 for i, k in enumerate(poids)}),
        details={k: {"frais": ter, "hhi": 1 / actifs_internes} for k in poids},
        nature={k: "fonds" for k in poids},
        ventilation_secteurs=SECTEURS_MONDE,
        ventilation_zones=[{"libelle": "Monde développé", "part": 89},
                           {"libelle": "Marchés émergents", "part": 11}],
        classes=[{"libelle": "Actions", "part": 100}],
        hhi_lignes={k: 1 / actifs_internes for k in poids},
        hhi_par_indice=set(),
        frais_par_ligne={k: ter for k in poids},
        part_fonds=sum(poids.values()),
        courtage=0.08,
        historique_jours=N,
    )


def pf_crypto(poids, vol, rho=0.80, graine=5) -> Entrees:
    """Un portefeuille de cryptomonnaies : ni secteur, ni zone, aucun frais de fonds."""
    commun = facteur(graine)
    return Entrees(
        poids=dict(poids),
        rendements=pd.DataFrame({k: serie(vol, graine + 10 + i, commun, rho)
                                 for i, k in enumerate(poids)}),
        details={k: {"seances": 700} for k in poids},
        nature={k: "crypto" for k in poids},
        ventilation_secteurs=None,
        ventilation_zones=None,
        classes=[{"libelle": "Autres", "part": 100}],
        hhi_lignes={k: 1.0 for k in poids},
        part_fonds=0.0,
        courtage=0.30,
        historique_jours=N,
    )


def pf_actions(poids, vol=22.0, rho=0.60, graine=9) -> Entrees:
    """Un portefeuille d'actions détenues en direct."""
    commun = facteur(graine)
    return Entrees(
        poids=dict(poids),
        rendements=pd.DataFrame({k: serie(vol, graine + 10 + i, commun, rho)
                                 for i, k in enumerate(poids)}),
        details={k: {} for k in poids},
        nature={k: "actif" for k in poids},
        ventilation_secteurs=[{"libelle": f"S{i % 10}", "part": w}
                              for i, (k, w) in enumerate(poids.items())],
        ventilation_zones=[{"libelle": "United States", "part": 100}],
        classes=[{"libelle": "Actions", "part": 100}],
        hhi_lignes={k: 1.0 for k in poids},
        part_fonds=0.0,
        courtage=0.35,
        historique_jours=N,
    )


def note(entrees: Entrees, profil: str, horizon: int = 20) -> int:
    """La note d'un portefeuille sous un profil donné."""
    entrees.profil = profil
    entrees.cible = profil_cible(horizon, profil)
    return calculer(entrees).score


# ── La renormalisation, cœur du moteur ───────────────────────────────────────

class TestRenormalisation:
    """
    ⚠️ **Une donnée absente ne vaut pas zéro ; son poids se répartit sur les autres.**

    C'est la règle qui distingue ce moteur d'un score naïf, et elle vient d'un dégât
    réel : un facteur non mesuré compté zéro faisait chuter la note d'un portefeuille
    dont on savait seulement moins de choses.
    """

    def test_l_exemple_du_cahier_des_charges(self):
        """Trois métriques à 40, 30 et 30 %, celle du milieu absente."""
        a = Metrique("a", "A", 80.0, "disponible", 40.0)
        b = Metrique("b", "B", None, "indisponible", 30.0)
        c = Metrique("c", "C", 60.0, "disponible", 30.0)
        renormaliser([a, b, c])
        assert a.poids_effectif == pytest.approx(57.14, abs=0.01)
        assert c.poids_effectif == pytest.approx(42.86, abs=0.01)
        assert b.poids_effectif == 0.0

    def test_une_absence_ne_tire_pas_la_note_vers_le_bas(self):
        """
        Le test qui garde l'essentiel : deux métriques à 80, l'une absente, la note
        reste 80. Comptée zéro, elle aurait donné 40.
        """
        avec = [Metrique("a", "A", 80.0, "disponible", 50.0),
                Metrique("b", "B", 80.0, "disponible", 50.0)]
        sans = [Metrique("a", "A", 80.0, "disponible", 50.0),
                Metrique("b", "B", None, "indisponible", 50.0)]
        assert renormaliser(avec) == pytest.approx(80.0)
        assert renormaliser(sans) == pytest.approx(80.0)

    def test_un_groupe_entierement_absent_ne_vaut_pas_zero(self):
        assert renormaliser([Metrique("a", "A", None, "indisponible", 50.0)]) is None
        assert renormaliser([]) is None


# ── Les huit scénarios demandés ───────────────────────────────────────────────

class TestScenarios:
    """Les cas du §20, dont la réponse attendue est connue d'avance."""

    def test_1_monde_diversifie_est_bien_note(self):
        e = pf_fonds({"CW8": 89.0, "EM": 11.0}, vol=12.0)
        assert note(e, "equilibre") >= 75

    def test_2_cent_pour_cent_btc_monte_avec_le_profil(self):
        """
        ⚠️ Le scénario qui valide toute la mécanique des profils.

        Monotone croissant — un dynamique tolère ce qu'un prudent ne tolère pas — mais
        **même le dynamique reste loin de cent** : la diversification est extrêmement
        faible, et aucun profil ne rend un actif unique bien diversifié. Un profil
        déplace des seuils, il n'absout pas.
        """
        e = pf_crypto({"BTC": 100.0}, vol=55.0)
        p, q, d = note(e, "prudent"), note(e, "equilibre"), note(e, "dynamique")
        assert p < q < d, f"attendu croissant, obtenu {p} / {q} / {d}"
        assert d < 60, "un actif unique ne peut pas être bien noté, même en dynamique"

    def test_3_deux_cryptos_restent_faibles(self):
        e = pf_crypto({"BTC": 50.0, "SOL": 50.0}, vol=65.0)
        p, q, d = note(e, "prudent"), note(e, "equilibre"), note(e, "dynamique")
        assert p < q < d
        assert d < 70, "deux actifs très corrélés ne font pas une diversification"

    def test_4_un_etf_monde_est_bien_note_pour_qui_peut_le_porter(self):
        """
        Un ETF MSCI World seul : excellent pour un dynamique, médiocre pour un prudent
        — non parce qu'il est mal construit, mais parce que cent pour cent d'actions ne
        correspond pas à ce qu'un prudent a déclaré supporter.
        """
        e = pf_fonds({"CW8": 100.0}, vol=13.0)
        assert note(e, "dynamique") >= 80
        assert note(e, "prudent") < note(e, "dynamique")

    def test_5_dix_actions_diversifiees(self):
        e = pf_actions({f"A{i}": 10.0 for i in range(10)})
        assert note(e, "equilibre") >= 60

    def test_6_quatre_vingts_pour_cent_sur_une_action(self):
        """Le plafond de position mord, et il mord plus fort pour un prudent."""
        e = pf_actions({"A0": 80.0, **{f"A{i}": 5.0 for i in range(1, 5)}})
        assert note(e, "prudent") < note(e, "dynamique")
        assert note(e, "equilibre") < 65

    def test_7_metadonnees_a_moitie_absentes(self):
        """
        ⚠️ La moitié des métadonnées manquantes doit faire baisser la **confiance**,
        pas la note. C'est toute la différence entre les deux chiffres.
        """
        complet = pf_fonds({"A": 50.0, "B": 50.0}, vol=12.0)
        troue = pf_fonds({"A": 50.0, "B": 50.0}, vol=12.0)
        troue.ventilation_secteurs = None
        troue.ventilation_zones = None
        troue.details = {k: {} for k in troue.poids}
        troue.frais_par_ligne = {}

        r_complet = calculer(_avec_profil(complet, "equilibre"))
        r_troue = calculer(_avec_profil(troue, "equilibre"))

        assert r_troue.confiance < r_complet.confiance - 15
        # La note ne s'effondre pas : elle porte sur ce qui reste mesurable.
        assert r_troue.score is not None and r_troue.score > 40
        assert r_troue.donnees_manquantes, "les manques doivent être nommés"

    def test_8_le_meme_portefeuille_sous_trois_profils(self):
        """
        Un portefeuille spéculatif : la note doit monter avec la tolérance déclarée, et
        les **chemins** doivent différer — pas seulement l'échelle.
        """
        e = pf_crypto({"BTC": 60.0, "ETH": 25.0, "SOL": 15.0}, vol=60.0)
        notes = {}
        adequations = {}
        for prof in ("prudent", "equilibre", "dynamique"):
            r = calculer(_avec_profil(e, prof))
            notes[prof] = r.score
            adequations[prof] = [p.score for p in r.piliers if p.cle == "adequation"][0]
        assert notes["prudent"] < notes["equilibre"] < notes["dynamique"]
        # ⚠️ Ce n'est pas un multiplicateur global : le pilier Adéquation change aussi,
        # parce que le plafond de crypto n'est pas le même. Un simple facteur d'échelle
        # aurait laissé les cinq piliers identiques.
        assert adequations["prudent"] < adequations["dynamique"]


def _avec_profil(entrees: Entrees, profil: str, horizon: int = 20) -> Entrees:
    entrees.profil = profil
    entrees.cible = profil_cible(horizon, profil)
    return entrees


# ── Les profils ne sont pas trois multiplicateurs ─────────────────────────────

class TestProfils:
    def test_les_poids_des_piliers_changent(self):
        """
        ⚠️ Le cahier des charges l'exige, et c'est le cœur du dispositif : trois
        multiplicateurs globaux auraient produit trois classements identiques à trois
        échelles près, donc aucune information.
        """
        prudent = PROFILS["prudent"].poids_piliers()
        dynamique = PROFILS["dynamique"].poids_piliers()
        assert prudent["risque"] > POIDS_PILIERS["risque"]
        assert dynamique["risque"] < POIDS_PILIERS["risque"]
        # Ce qui compte pour un dynamique, c'est ce qu'il détient : le risque est assumé.
        assert dynamique["diversification"] > prudent["diversification"]
        for p in PROFILS.values():
            assert sum(p.poids_piliers().values()) == pytest.approx(100.0)

    def test_les_seuils_changent(self):
        assert PROFILS["prudent"].position_max < PROFILS["dynamique"].position_max
        assert PROFILS["prudent"].crypto_max < PROFILS["dynamique"].crypto_max
        # Un prudent doit viser **plus** d'actifs, non moins.
        assert PROFILS["prudent"].actifs_cibles > PROFILS["dynamique"].actifs_cibles

    def test_les_penalites_changent(self):
        """Un prudent qui dépasse sa cible doit chuter plus vite qu'un dynamique."""
        assert (PROFILS["prudent"].largeur_penalite_vol
                < PROFILS["dynamique"].largeur_penalite_vol)


# ── Sans profil déclaré ───────────────────────────────────────────────────────

class TestSansProfil:
    def test_les_piliers_structurels_notent_quand_meme(self):
        """
        Diversification et Construction se jugent sans connaître l'intention : un
        portefeuille à quatre-vingt-dix pour cent sur une ligne est mal construit pour
        n'importe qui.
        """
        r = calculer(pf_fonds({"CW8": 89.0, "EM": 11.0}, vol=12.0))
        par_cle = {p.cle: p for p in r.piliers}
        assert par_cle["diversification"].score is not None
        assert par_cle["construction"].score is not None

    def test_le_risque_et_l_adequation_se_taisent(self):
        """
        ⚠️ Juger une volatilité dans l'absolu revient à décréter le projet de
        l'épargnant. L'échelle absolue de l'ancien score plafonnait un portefeuille
        cent pour cent actions à soixante-douze, pour un choix légitime.
        """
        r = calculer(pf_fonds({"CW8": 100.0}, vol=13.0))
        par_cle = {p.cle: p for p in r.piliers}
        assert par_cle["risque"].score is None
        assert par_cle["adequation"].score is None
        assert r.score is not None, "la note se calcule sur les piliers restants"
        assert any("risque" in i.titre.lower() for i in r.points_attention)


# ── L'indice de confiance ─────────────────────────────────────────────────────

class TestConfiance:
    def test_les_grosses_positions_pesent_plus(self):
        """
        ⚠️ L'exigence du §10, et la meilleure idée du cahier des charges. Des données
        manquantes sur une ligne à 2 % ne coûtent presque rien ; sur une ligne à 55 %
        elles coûtent cher. La pondération est automatique puisque la couverture *est*
        une part de portefeuille.
        """
        def avec_couverture(c):
            m = Metrique("a", "A", 70.0, "partiel", 100.0, couverture=c)
            return confiance([Pilier("p", "P", 70.0, 100.0, [m])])

        assert avec_couverture(0.98) > avec_couverture(0.45)
        assert avec_couverture(1.0) == 100

    def test_un_historique_court_reduit_la_confiance_sans_l_annuler(self):
        m = Metrique("a", "A", 70.0, "disponible", 100.0, couverture=1.0)
        pil = [Pilier("p", "P", 70.0, 100.0, [m])]
        assert confiance(pil, historique_jours=250) == 100
        court = confiance(pil, historique_jours=40)
        assert 50 <= court < 100, "un portefeuille jeune n'est pas un portefeuille inconnu"

    def test_la_confiance_baisse_avec_les_donnees_la_note_non(self):
        """
        ⚠️ Deux chiffres, deux significations, et c'est tout l'intérêt de l'indice.

        Gradient mesuré sur un même portefeuille en retirant les données une à une :

            tout connu                   score 85   confiance 100 %
            sans secteurs                score 86   confiance  93 %
            sans secteurs ni zones       score 86   confiance  88 %
            + sans TER                   score 83   confiance  64 %
            + sans composition interne   score 83   confiance  56 %
            + sans nature de ligne       score 78   confiance  51 %
            + historique court           score 78   confiance  30 %

        La note reste dans une fourchette de sept points quand la confiance perd
        soixante-dix. C'est exactement la séparation voulue : la qualité du
        portefeuille ne dépend pas de ce que nous savons de lui.

        ⚠️ Mon attente initiale était fausse. J'attendais moins de 80 % avec les seules
        ventilations absentes ; le moteur donne 88, et il a raison — deux métriques sur
        onze manquent, dans un pilier qui pèse un quart. C'est l'exemple du cahier des
        charges à 58 % qui correspond au niveau « sans TER ni composition ».
        """
        def confiance_de(**retire):
            e = pf_fonds({"A": 60.0, "B": 40.0}, vol=12.0)
            for cle, valeur in retire.items():
                setattr(e, cle, valeur)
            r = calculer(_avec_profil(e, "equilibre"))
            return r.score, r.confiance

        note_complet, conf_complet = confiance_de()
        note_ventil, conf_ventil = confiance_de(ventilation_secteurs=None,
                                                ventilation_zones=None)
        note_creux, conf_creux = confiance_de(
            ventilation_secteurs=None, ventilation_zones=None,
            frais_par_ligne={}, details={}, hhi_lignes={})

        assert conf_complet == 100
        assert conf_ventil < conf_complet
        assert conf_creux < 70, "un portefeuille très lacunaire doit le dire"
        # La note, elle, bouge à peine : elle porte sur ce qui reste mesurable.
        assert abs(note_creux - note_complet) <= 10

    def test_un_historique_court_est_le_facteur_le_plus_penalisant(self):
        """
        Une volatilité sur quarante séances est calculable mais fragile. Le moteur la
        note quand même — elle est vraie — et abaisse la confiance à proportion.
        """
        e = pf_fonds({"A": 100.0}, vol=12.0)
        e.historique_jours = 40
        r = calculer(_avec_profil(e, "equilibre"))
        assert r.score is not None
        assert r.confiance <= 60


# ── Bandes, arrondis, version ─────────────────────────────────────────────────

class TestPresentation:
    def test_les_bandes_suivent_la_nomenclature(self):
        assert bande(95) == "Excellent"
        assert bande(85) == "Très bon"
        assert bande(75) == "Bon"
        assert bande(65) == "Correct"
        assert bande(45) == "À améliorer"
        assert bande(20) == "Fragile"
        assert bande(None) is None

    def test_le_mot_exceptionnel_est_ecarte(self):
        """Il suggérerait une recommandation ou une garantie, ce qu'un score n'est pas."""
        assert all(nom != "Exceptionnel" for _, nom in BANDES)

    def test_aucune_decimale_n_est_rendue(self):
        """
        ⚠️ « Diversification 73,48273 » afficherait une précision que le calcul n'a
        pas : les repères sont des ordres de grandeur défendables, pas des constantes.
        """
        d = en_dict(calculer(_avec_profil(pf_fonds({"CW8": 100.0}, vol=13.0), "equilibre")))
        assert isinstance(d["score"], int)
        for p in d["piliers"]:
            assert p["score"] is None or isinstance(p["score"], int)
            for m in p["metriques"]:
                assert m["score"] is None or isinstance(m["score"], int)

    def test_la_version_de_methodologie_est_rendue(self):
        """
        Sans elle, deux scores calculés à six mois d'écart seraient incomparables sans
        qu'on puisse le savoir.
        """
        d = en_dict(calculer(pf_fonds({"CW8": 100.0}, vol=13.0)))
        assert d["version_methodologie"] == VERSION_METHODOLOGIE
        assert d["calcule_le"]

    def test_chaque_metrique_porte_son_explication(self):
        """Ne jamais afficher un nombre sans explication : la règle du §12."""
        d = en_dict(calculer(_avec_profil(pf_fonds({"CW8": 100.0}, vol=13.0), "equilibre")))
        for p in d["piliers"]:
            assert p["explication"]
            for m in p["metriques"]:
                assert m["explication"], f"{m['cle']} sans explication"
                assert m["lecture"], f"{m['cle']} sans lecture"


# ── Ce que le score ne doit pas récompenser ──────────────────────────────────

class TestPhilosophie:
    def test_la_performance_recente_n_ameliore_pas_la_note(self):
        """
        ⚠️ Le principe du §1, et il se vérifie. Le score répond à « ce portefeuille
        est-il bien construit », non à « a-t-il performé ». Deux portefeuilles
        identiques en composition et en volatilité, l'un en forte hausse et l'autre en
        baisse, doivent obtenir la même note.
        """
        commun = facteur(3)
        hausse = pf_fonds({"CW8": 100.0}, vol=13.0)
        baisse = pf_fonds({"CW8": 100.0}, vol=13.0)
        # Même dispersion, dérives opposées : +0,25 % et −0,10 % par séance.
        base = serie(13.0, 77, commun, 0.9)
        hausse.rendements = pd.DataFrame({"CW8": base + 0.0025})
        baisse.rendements = pd.DataFrame({"CW8": base - 0.0010})

        a = calculer(_avec_profil(hausse, "equilibre")).score
        b = calculer(_avec_profil(baisse, "equilibre")).score
        assert a == b, f"la performance a déplacé la note : {a} contre {b}"
