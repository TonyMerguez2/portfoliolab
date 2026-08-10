"""
Les lecteurs de pages officielles : ce qu'ils comprennent, et ce qu'ils refusent.

Aucun accès au réseau. Les extraits ci-dessous sont copiés du balisage réel des deux
pages, réduits aux cas qui comptent — dont ceux qui casseraient une lecture naïve.
"""

from datetime import date

from app.services import calendriers_officiels as co

# ── Extraits réels ───────────────────────────────────────────────────────────

#: La page de la Fed, avec ses quatre pièges dans quatre lignes.
FED = """
<h4><a>2026 FOMC Meetings</a></h4>
<div class="row fomc-meeting">
  <div class="fomc-meeting__month col-md-2"><strong>January</strong></div>
  <div class="fomc-meeting__date col-md-10">27-28</div></div>
<div class="row fomc-meeting">
  <div class="fomc-meeting__month col-md-2"><strong>September</strong></div>
  <div class="fomc-meeting__date col-md-10">15-16*</div></div>
<div class="row fomc-meeting">
  <div class="fomc-meeting__month col-md-2"><strong>Dec/Jan</strong></div>
  <div class="fomc-meeting__date col-md-10">30-1</div></div>
<h4><a>2025 FOMC Meetings</a></h4>
<div class="row fomc-meeting">
  <div class="fomc-meeting__month col-md-2"><strong>August</strong></div>
  <div class="fomc-meeting__date col-md-10">22 (notation vote)</div></div>
<div class="row fomc-meeting">
  <div class="fomc-meeting__month col-md-2"><strong>Apr/May</strong></div>
  <div class="fomc-meeting__date col-md-10">29-1</div></div>
"""

#: La page de la BCE, avec les trois familles qui cohabitent dans la même liste.
BCE = """
<div class="definition-list -zebra"><dl>
<dt> 09/09/2026 </dt><dd> Governing Council of the ECB: monetary policy meeting
  hosted by the Deutsche Bundesbank in Berlin, Germany (Day 1)<br></dd>
<dt> 10/09/2026 </dt><dd> Governing Council of the ECB: monetary policy meeting
  hosted by the Deutsche Bundesbank in Berlin, Germany (Day 2), followed by press
  conference<br></dd>
<dt> 30/09/2026 </dt><dd> Governing Council of the ECB: non-monetary policy meeting
  (virtual)<br></dd>
<dt> 26/11/2026 </dt><dd> General Council meeting of the ECB in Frankfurt<br></dd>
<dt> 16/12/2026 </dt><dd> Governing Council of the ECB: monetary policy meeting in
  Frankfurt (Day 1)<br></dd>
<dt> 17/12/2026 </dt><dd> Governing Council of the ECB: monetary policy meeting in
  Frankfurt (Day 2), followed by press conference<br></dd>
</dl></div>
"""


class TestLectureFed:
    def test_retient_le_second_jour_de_la_reunion(self):
        # « 27-28 » : la décision tombe le 28. Retenir le 27 l'annoncerait la veille.
        assert "2026-01-28" in co.lire_fomc(FED)

    def test_l_asterisque_n_est_pas_un_jour(self):
        # « 15-16* » marque les projections économiques, pas une date.
        assert "2026-09-16" in co.lire_fomc(FED)

    def test_une_reunion_a_cheval_sur_deux_mois_prend_le_second(self):
        """
        ⚠️ « Apr/May » avec « 29-1 » : la décision est le 1er **mai**. Prendre le
        premier mois l'aurait placée le 1er avril, un mois trop tôt — et avant la
        réunion elle-même.
        """
        assert "2025-05-01" in co.lire_fomc(FED)

    def test_une_reunion_a_cheval_sur_deux_annees_change_d_annee(self):
        # « Dec/Jan » avec « 30-1 » sous le titre 2026 : le 1er janvier 2027.
        assert "2027-01-01" in co.lire_fomc(FED)

    def test_un_vote_par_correspondance_n_est_pas_une_reunion(self):
        assert not [d for d in co.lire_fomc(FED) if d.startswith("2025-08")]

    def test_l_annee_vient_du_titre_qui_precede(self):
        """
        ⚠️ La page présente 2026, puis 2025 à 2021, puis 2027 : l'ordre du document
        n'est pas chronologique. Supposer une suite d'années aurait daté toute la
        seconde moitié de la page de travers.
        """
        d = co.lire_fomc(FED)
        assert "2026-01-28" in d and "2025-05-01" in d

    def test_une_page_meconnaissable_ne_rend_rien(self):
        assert co.lire_fomc("<html><body>rien de tel</body></html>") == []


class TestLectureBce:
    def test_ne_retient_que_le_jour_de_la_decision(self):
        assert co.lire_bce(BCE) == ["2026-09-10", "2026-12-17"]

    def test_ecarte_les_reunions_non_monetaires(self):
        """
        ⚠️ « non-monetary policy meeting » **contient** « monetary policy meeting ».
        Un filtre par sous-chaîne sans exclusion aurait retenu cinq fausses décisions
        sur la page réelle.
        """
        assert "2026-09-30" not in co.lire_bce(BCE)

    def test_ecarte_le_conseil_general(self):
        assert "2026-11-26" not in co.lire_bce(BCE)

    def test_ecarte_le_premier_jour_de_reunion(self):
        assert "2026-09-09" not in co.lire_bce(BCE)

    def test_une_page_meconnaissable_ne_rend_rien(self):
        assert co.lire_bce("<html><body>rien de tel</body></html>") == []


class TestValidation:
    """
    ⚠️ Tout ou rien. Une lecture qui rend neuf dates justes et une fausse est plus
    dangereuse qu'une lecture qui échoue : la fausse s'affiche avec la même autorité
    que les autres, et rien ne la distingue.
    """

    def annees(self, debut, n_par_an, jour=2):
        """n dates par an, toutes au jour de semaine voulu, sur trois années."""
        dates = []
        for an in range(debut, debut + 3):
            d = date(an, 1, 1)
            while d.weekday() != jour:
                d = date(an, 1, d.day + 1)
            for k in range(n_par_an):
                dates.append((d.toordinal() + 28 * k))
        return sorted(date.fromordinal(o).isoformat() for o in dates)

    def test_une_liste_vide_est_refusee(self):
        assert co.valider([], "USA") is None

    def test_une_date_repetee_fait_rejeter_l_ensemble(self):
        d = self.annees(2030, 8)
        assert co.valider(d + [d[0]], "USA") is None

    def test_l_ordre_du_document_n_est_pas_exige(self):
        """
        ⚠️ Ce test défend un défaut que j'ai commis. J'avais écrit un contrôle
        « dates croissantes », alors que j'avais documenté dix lignes plus haut que la
        page de la Fed présente ses années dans le désordre. Il rejetait donc les
        56 dates réelles.
        """
        d = self.annees(2030, 8)
        assert co.valider(list(reversed(d)), "USA") == d

    def test_un_jour_de_week_end_fait_rejeter(self):
        # Un samedi trahit un balisage mal découpé : aucune banque centrale ne décide
        # le week-end.
        d = self.annees(2030, 8)
        assert co.valider(d + ["2030-06-01"], "USA") is None

    def test_un_jeudi_est_accepte(self):
        """
        ⚠️ Le 7 novembre 2024 était un **jeudi** : la Fed avait décalé sa réunion pour
        l'élection présidentielle du 5. Exiger le mercredi aurait rejeté une date
        parfaitement réelle, et justement l'année où le calendrier sort de l'ordinaire.
        """
        assert co.valider(self.annees(2030, 8, jour=3), "Zone euro") is not None

    def test_une_annee_trop_pauvre_fait_rejeter(self):
        """
        Le contrôle le plus solide : huit décisions par an, mesuré sur sept années
        consécutives des deux institutions. Trois dans une année complète signifie
        qu'on n'a lu qu'une partie de la page.
        """
        d = self.annees(2030, 8)
        maigre = [x for x in d if not x.startswith("2031")] + ["2031-01-02", "2031-02-06"]
        assert co.valider(sorted(maigre), "USA") is None

    def test_les_annees_de_bord_peuvent_etre_partielles(self):
        """
        ⚠️ La première et la dernière année publiées sont normalement incomplètes — la
        page ne montre pas le passé de l'année en cours, et la suivante n'est annoncée
        qu'en partie. Les compter aurait fait échouer la validation chaque janvier.
        """
        d = ["2030-11-06", "2030-12-04"] + self.annees(2031, 8)[:8] + ["2032-01-07"]
        assert co.valider(sorted(d), "USA") is not None
