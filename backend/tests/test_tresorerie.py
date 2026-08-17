"""
Le solde d'un compte au fil du temps.

⚠️ **Ce module se teste seul parce qu'il ne se voit pas.** Une courbe de patrimoine
plausible reste plausible quand elle est fausse de 500 € : il n'y a rien à l'écran pour
la contredire, contrairement à un cours de bourse qu'on peut vérifier ailleurs. Les
règles sont donc vérifiées ici, sur des dates écrites à la main.

⚠️ **Ces tests ont été réécrits avec le sens de lecture.** Ils partaient tous d'un solde
actuel dont on retranchait les mouvements postérieurs ; ils partent maintenant des seuls
apports, cumulés vers l'avant. Les cas gardés sont les mêmes — c'est le modèle qui a
changé, pas ce qu'on attend de lui.
"""

from datetime import date, datetime

from app.services.tresorerie import liquidites_par_jour, solde_actuel, solde_par_jour


CAL = [date(2026, 3, i) for i in (1, 10, 12, 20, 31)]


def test_un_apport_unique_vaut_a_partir_de_sa_date():
    """Le cas ordinaire : un livret déclaré, jamais alimenté depuis."""
    s = solde_par_jour([{"date": datetime(2026, 3, 1), "montant": 5000.0}], CAL)
    assert set(s.values()) == {5000.0}


def test_avant_le_premier_apport_le_compte_vaut_zero():
    """
    ⚠️ La règle que portait `solde_depuis`, désormais tenue par la somme elle-même : un
    livret ouvert le 12 mars n'était pas là le 1er. Zéro, et non le montant étendu vers
    l'arrière.
    """
    s = solde_par_jour([{"date": datetime(2026, 3, 12), "montant": 5000.0}], CAL)
    assert s[date(2026, 3, 1)] == 0.0
    assert s[date(2026, 3, 10)] == 0.0
    assert s[date(2026, 3, 12)] == 5000.0
    assert s[date(2026, 3, 31)] == 5000.0


def test_les_apports_s_additionnent_a_partir_de_leur_date():
    """
    Un apport d'ouverture de 4 500 €, puis un versement de 500 € le 20 mars : avant cette
    date le compte valait 4 500 €, après il en vaut 5 000.
    """
    s = solde_par_jour([{"date": datetime(2026, 3, 1), "montant": 4500.0},
                        {"date": datetime(2026, 3, 20), "montant": 500.0}], CAL)
    assert s[date(2026, 3, 10)] == 4500.0
    assert s[date(2026, 3, 12)] == 4500.0
    # ⚠️ Le jour même du versement, la somme y est déjà : c'est la lecture du relevé.
    assert s[date(2026, 3, 20)] == 5000.0
    assert s[date(2026, 3, 31)] == 5000.0


def test_un_retrait_est_un_montant_negatif():
    """5 000 € déposés, 500 € repris le 20 mars : il en reste 4 500."""
    s = solde_par_jour([{"date": datetime(2026, 3, 1), "montant": 5000.0},
                        {"date": datetime(2026, 3, 20), "montant": -500.0}], CAL)
    assert s[date(2026, 3, 10)] == 5000.0
    assert s[date(2026, 3, 20)] == 4500.0
    assert s[date(2026, 3, 31)] == 4500.0


def test_plusieurs_mouvements_se_cumulent_dans_le_bon_ordre():
    s = solde_par_jour([{"date": datetime(2026, 3, 1), "montant": 4300.0},
                        {"date": datetime(2026, 3, 12), "montant": 1000.0},
                        {"date": datetime(2026, 3, 20), "montant": -300.0}], CAL)
    assert s[date(2026, 3, 1)] == 4300.0     # ni les 1 000 ni le retrait
    assert s[date(2026, 3, 12)] == 5300.0    # versement compté, retrait pas encore
    assert s[date(2026, 3, 31)] == 5000.0


def test_les_apports_desordonnes_sont_remis_dans_l_ordre():
    """
    ⚠️ Le journal arrive trié par date décroissante depuis l'API, et rien n'oblige un
    appelant à le trier. Le cumul dépend de l'ordre : le vérifier ici évite d'en faire une
    précondition tacite que le premier appelant distrait enfreindra.
    """
    s = solde_par_jour([{"date": datetime(2026, 3, 20), "montant": -300.0},
                        {"date": datetime(2026, 3, 1), "montant": 4300.0},
                        {"date": datetime(2026, 3, 12), "montant": 1000.0}], CAL)
    assert s[date(2026, 3, 1)] == 4300.0
    assert s[date(2026, 3, 31)] == 5000.0


def test_un_journal_vide_ne_produit_aucun_jour():
    """
    ⚠️ `None` n'est pas zéro. Un compte dont on n'a saisi aucun apport ne déclare pas
    zéro euro de liquidités, il n'en déclare aucune — et rendre des zéros l'aurait fait
    entrer dans la somme comme un compte vide, ce qui est une information qu'on n'a pas.
    """
    assert solde_par_jour([], CAL) == {}


def test_des_apports_qui_s_annulent_valent_zero_et_non_rien():
    """
    ⚠️ Le pendant du test précédent, et la raison pour laquelle il ne suffit pas. Un
    compte vidé de tout son argent vaut zéro euro, et c'est un fait ; ne rien rendre le
    confondrait avec un compte dont on ignore les espèces.
    """
    s = solde_par_jour([{"date": datetime(2026, 3, 1), "montant": 500.0},
                        {"date": datetime(2026, 3, 12), "montant": -500.0}], CAL)
    assert s[date(2026, 3, 31)] == 0.0
    assert s != {}


def test_le_solde_actuel_est_la_somme_du_journal():
    assert solde_actuel([{"date": datetime(2026, 3, 1), "montant": 4500.0},
                         {"date": datetime(2026, 3, 20), "montant": 500.0}]) == 5000.0
    # ⚠️ Journal vide : aucune espèce déclarée, ce qui n'est pas un solde de zéro.
    assert solde_actuel([]) is None


def test_les_comptes_s_additionnent_jour_par_jour():
    """
    Le total attendu par la courbe : un livret présent depuis le début, un compte courant
    ouvert en cours de route, et un compte sans espèces qui n'ajoute rien.
    """
    total = liquidites_par_jour([
        {"mouvements": [{"date": datetime(2026, 3, 1), "montant": 5000.0}]},
        {"mouvements": [{"date": datetime(2026, 3, 12), "montant": 800.0}]},
        {"mouvements": []},
    ], CAL)
    assert total[date(2026, 3, 1)] == 5000.0
    assert total[date(2026, 3, 10)] == 5000.0
    assert total[date(2026, 3, 12)] == 5800.0
    assert total[date(2026, 3, 31)] == 5800.0


def test_le_calendrier_commande_les_jours_rendus():
    """Aucun jour inventé : la courbe n'a de points que là où elle en a déjà."""
    s = solde_par_jour([{"date": datetime(2026, 1, 1), "montant": 100.0}],
                       [date(2026, 3, 10)])
    assert list(s) == [date(2026, 3, 10)]


def test_un_apport_posterieur_au_calendrier_ne_paraît_pas_encore():
    """
    ⚠️ **Là où l'ancien modèle se mordait la queue.** Un apport daté après le dernier jour
    tracé était à la fois le solde du compte et un mouvement « postérieur » qu'on
    retranchait de ce solde : le livret valait zéro partout. Ici il ne compte simplement
    pas encore, ce qui est la seule lecture juste — et le calendrier, lui, va désormais
    jusqu'à aujourd'hui pour que le cas ne se présente plus depuis l'écran.
    """
    s = solde_par_jour([{"date": datetime(2026, 3, 10), "montant": 1000.0},
                        {"date": datetime(2026, 4, 15), "montant": 5000.0}], CAL)
    assert s[date(2026, 3, 31)] == 1000.0
