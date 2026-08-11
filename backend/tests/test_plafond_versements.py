"""
L'objectif de plafond de versements : « quand aurai-je versé 150 000 € sur mon PEA ? »

⚠️ **Ce que ces tests protègent avant tout.** Le plafond d'un PEA porte sur le cumul des
**versements** ; les plus-values ne le consomment pas. Le mesurer sur la valeur du
portefeuille — ce que font les quatre autres genres d'objectifs, à juste titre — annoncerait
le plafond atteint alors qu'il reste de la capacité. L'écart croît avec la performance : il
est de sept pour cent sur un PEA d'un an, il peut dépasser cent pour cent sur vingt ans.

Exécution : cd backend && ./venv/bin/python -m pytest tests/test_plafond_versements.py -v
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.objectifs import (
    PLAFOND_PEA, avancement_verse, capital_requis, mois_pour_verser, progression,
    se_mesure_sur_les_versements, verse_projete,
)


# ── Le genre est reconnu, et reconnu comme distinct ──────────────────────────

def test_le_genre_se_mesure_sur_les_versements():
    assert se_mesure_sur_les_versements("plafond_versements") is True
    for autre in ("capital", "capital_age", "achat", "revenu_mensuel"):
        assert se_mesure_sur_les_versements(autre) is False


def test_le_plafond_du_pea_est_bien_cent_cinquante_mille():
    """Le montant proposé. Il reste saisissable — voir la note du service."""
    assert PLAFOND_PEA == 150_000.0


# ── Le cœur : la performance ne rapproche pas du plafond ─────────────────────

def test_la_plus_value_ne_consomme_pas_le_plafond():
    """
    Le test qui justifie tout ce genre d'objectif.

    Un PEA qui a reçu 90 000 € de versements et qui vaut 150 000 € grâce aux marchés n'est
    **pas** au plafond : il reste 60 000 € de capacité. Mesuré sur la valeur, l'avancement
    dirait 100 % ; mesuré sur les versements, il dit 60 %.
    """
    verse, valeur = 90_000.0, 150_000.0

    sur_versements = avancement_verse(PLAFOND_PEA, verse)
    assert sur_versements is not None
    assert sur_versements.part == 60.0
    assert sur_versements.atteint is False

    # Ce que l'ancien calcul aurait dit, et qui serait faux pour un plafond.
    sur_valeur = progression("capital", PLAFOND_PEA, valeur)
    assert sur_valeur is not None
    assert sur_valeur.part == 100.0
    assert sur_valeur.atteint is True


def test_l_avancement_ne_depasse_jamais_cent():
    """Un PEA au-delà du plafond affiche cent, pas cent vingt."""
    p = avancement_verse(150_000.0, 180_000.0)
    assert p is not None
    assert p.part == 100.0
    assert p.atteint is True
    # ⚠️ `actuel` garde la vraie valeur : c'est la **jauge** qu'on borne, pas la mesure.
    # Écraser le montant ferait disparaître le dépassement de l'écran.
    assert p.actuel == 180_000.0


def test_une_cible_nulle_ne_rend_rien():
    assert avancement_verse(0.0, 5_000.0) is None
    assert avancement_verse(-1.0, 5_000.0) is None


# ── La date du plafond : une division, arrondie au mois supérieur ────────────

def test_la_date_du_plafond_est_une_division():
    """
    150 000 € à atteindre, 5 000 € versés, 800 €/mois : il reste 145 000 €, soit 181,25
    mois — donc 182.

    ⚠️ Aucun rendement n'intervient : c'est tout l'intérêt. Un calcul capitalisé aurait
    répondu « 137 mois » à 7 % l'an, ce qui est la bonne réponse à une autre question.
    """
    assert mois_pour_verser(150_000.0, 5_000.0, 800.0) == 182


def test_l_arrondi_va_vers_le_haut():
    """
    Il reste 100 € et l'on verse 800 € par mois : il faut un mois de plus, pas zéro.

    ⚠️ Arrondir à l'inférieur annoncerait le plafond atteint un mois avant qu'il ne le soit.
    """
    assert mois_pour_verser(1_000.0, 900.0, 800.0) == 1
    # Exactement divisible : pas de mois surnuméraire.
    assert mois_pour_verser(1_000.0, 200.0, 800.0) == 1
    assert mois_pour_verser(1_600.0, 0.0, 800.0) == 2


def test_deja_au_plafond_rend_zero():
    assert mois_pour_verser(150_000.0, 150_000.0, 800.0) == 0
    assert mois_pour_verser(150_000.0, 200_000.0, 800.0) == 0


def test_sans_versement_aucune_duree_ne_convient():
    """
    ⚠️ `None` et non un très grand nombre. « 960 mois » se lirait comme une estimation là
    où l'honnête réponse est « jamais à ce rythme ».
    """
    assert mois_pour_verser(150_000.0, 5_000.0, None) is None
    assert mois_pour_verser(150_000.0, 5_000.0, 0.0) is None
    assert mois_pour_verser(150_000.0, 5_000.0, -100.0) is None


# ── Le cumul projeté : une addition, jamais une capitalisation ───────────────

def test_le_cumul_projete_est_une_addition():
    """
    ⚠️ 800 € versés restent 800 € versés, quelle que soit la performance qu'ils produisent.
    Capitaliser ici gonflerait le cumul et ferait franchir le plafond bien trop tôt.
    """
    assert verse_projete(5_000.0, 800.0, 12) == 5_000.0 + 9_600.0
    assert verse_projete(5_000.0, 800.0, 0) == 5_000.0
    assert verse_projete(5_000.0, None, 24) == 5_000.0


def test_le_cumul_projete_croit_lineairement():
    """Deux fois plus de mois, deux fois plus de versements ajoutés."""
    a = verse_projete(0.0, 500.0, 60) - 0.0
    b = verse_projete(0.0, 500.0, 120) - 0.0
    assert abs(b - 2 * a) < 1e-9


# ── La cible reste la cible : aucune conversion par un taux de retrait ───────

def test_le_requis_est_le_plafond_lui_meme():
    """
    ⚠️ Contrairement à un objectif de revenu, aucun taux de retrait n'intervient : le
    plafond est déjà un montant. Le convertir l'aurait multiplié par trois cents.
    """
    assert capital_requis("plafond_versements", 150_000.0) == 150_000.0
    assert capital_requis("plafond_versements", 150_000.0, taux_retrait=4.0) == 150_000.0
