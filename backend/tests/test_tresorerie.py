"""
Le solde d'un compte au fil du temps.

⚠️ **Ce module se teste seul parce qu'il ne se voit pas.** Une courbe de patrimoine
plausible reste plausible quand elle est fausse de 500 € : il n'y a rien à l'écran pour
la contredire, contrairement à un cours de bourse qu'on peut vérifier ailleurs. Les
règles sont donc vérifiées ici, sur des dates écrites à la main.
"""

from datetime import date, datetime

from app.services.tresorerie import liquidites_par_jour, solde_par_jour


CAL = [date(2026, 3, i) for i in (1, 10, 12, 20, 31)]


def test_sans_mouvement_le_solde_vaut_partout_le_solde_actuel():
    """Le cas ordinaire : un livret déclaré, jamais alimenté depuis."""
    s = solde_par_jour(5000.0, datetime(2026, 3, 1), [], CAL)
    assert set(s.values()) == {5000.0}


def test_avant_la_date_du_solde_le_compte_vaut_zero():
    """
    ⚠️ La règle qui justifie la colonne `solde_depuis` : un livret ouvert le 12 mars
    n'était pas là le 1er. Zéro, et non le solde étendu vers l'arrière.
    """
    s = solde_par_jour(5000.0, datetime(2026, 3, 12), [], CAL)
    assert s[date(2026, 3, 1)] == 0.0
    assert s[date(2026, 3, 10)] == 0.0
    assert s[date(2026, 3, 12)] == 5000.0
    assert s[date(2026, 3, 31)] == 5000.0


def test_on_remonte_le_temps_en_retirant_les_versements():
    """
    Solde actuel 5 000 €, dont un versement de 500 € le 20 mars : avant cette date, le
    compte valait 4 500 €.
    """
    s = solde_par_jour(5000.0, datetime(2026, 3, 1),
                       [{"date": datetime(2026, 3, 20), "montant": 500.0}], CAL)
    assert s[date(2026, 3, 10)] == 4500.0
    assert s[date(2026, 3, 12)] == 4500.0
    # ⚠️ Le jour même du versement, la somme y est déjà : c'est la lecture du relevé.
    assert s[date(2026, 3, 20)] == 5000.0
    assert s[date(2026, 3, 31)] == 5000.0


def test_un_retrait_est_un_montant_negatif():
    """Solde actuel 4 500 € après un retrait de 500 € : avant, il y en avait 5 000."""
    s = solde_par_jour(4500.0, datetime(2026, 3, 1),
                       [{"date": datetime(2026, 3, 20), "montant": -500.0}], CAL)
    assert s[date(2026, 3, 10)] == 5000.0
    assert s[date(2026, 3, 20)] == 4500.0


def test_plusieurs_mouvements_se_cumulent_dans_le_bon_ordre():
    s = solde_par_jour(
        5000.0, datetime(2026, 3, 1),
        [{"date": datetime(2026, 3, 12), "montant": 1000.0},
         {"date": datetime(2026, 3, 20), "montant": -300.0}],
        CAL)
    assert s[date(2026, 3, 1)] == 4300.0    # ni les 1 000 ni le retrait
    assert s[date(2026, 3, 12)] == 5300.0   # versement compté, retrait pas encore
    assert s[date(2026, 3, 31)] == 5000.0


def test_sans_date_de_solde_le_montant_vaut_depuis_toujours():
    """
    ⚠️ Le repli des comptes déclarés avant la colonne. Documenté comme une supposition,
    vérifié ici pour qu'il reste celui-là et pas un autre : étendre vers l'arrière plutôt
    que faire apparaître une marche au jour de la déclaration.
    """
    s = solde_par_jour(5000.0, None, [], CAL)
    assert s[date(2026, 3, 1)] == 5000.0


def test_un_solde_absent_ne_produit_aucun_jour():
    """
    ⚠️ `None` n'est pas zéro. Un compte dont on n'a pas saisi les liquidités n'en déclare
    pas zéro, il n'en déclare aucune — et rendre des zéros l'aurait fait entrer dans la
    somme comme un compte vide, ce qui est une information qu'on n'a pas.
    """
    assert solde_par_jour(None, datetime(2026, 3, 1), [], CAL) == {}


def test_les_comptes_s_additionnent_jour_par_jour():
    """
    Le total attendu par la courbe : un livret présent depuis le début et un compte
    courant ouvert en cours de route.
    """
    total = liquidites_par_jour([
        {"solde": 5000.0, "solde_depuis": datetime(2026, 3, 1), "mouvements": []},
        {"solde": 800.0,  "solde_depuis": datetime(2026, 3, 12), "mouvements": []},
        {"solde": None,   "solde_depuis": None, "mouvements": []},
    ], CAL)
    assert total[date(2026, 3, 1)] == 5000.0
    assert total[date(2026, 3, 10)] == 5000.0
    assert total[date(2026, 3, 12)] == 5800.0
    assert total[date(2026, 3, 31)] == 5800.0


def test_le_calendrier_commande_les_jours_rendus():
    """Aucun jour inventé : la courbe n'a de points que là où elle en a déjà."""
    s = solde_par_jour(100.0, datetime(2026, 1, 1), [], [date(2026, 3, 10)])
    assert list(s) == [date(2026, 3, 10)]


def test_un_solde_declare_apres_la_derniere_seance_parait_quand_meme():
    """
    ⚠️ **Le défaut le plus déroutant qu'ait connu ce calcul.** Le champ « Depuis quand »
    propose aujourd'hui par défaut, et la courbe s'arrête à la dernière séance close. Un
    livret déclaré aujourd'hui tombait donc après tous les points : il valait zéro partout,
    et n'apparaissait ni dans la courbe, ni dans les repères, ni dans le gain. L'épargnant
    saisissait cinq mille euros et ne voyait « rien du tout ».

    C'est le solde qui a raison : l'argent est là aujourd'hui, et le retard du calendrier
    boursier n'est pas un fait sur le patrimoine.
    """
    s = solde_par_jour(5000.0, datetime(2026, 4, 2), [], CAL)
    assert s[date(2026, 3, 31)] == 5000.0, "le dernier jour tracé doit porter le solde"
    assert s[date(2026, 3, 1)] == 0.0, "les jours antérieurs restent à zéro"
