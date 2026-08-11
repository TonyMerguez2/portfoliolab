"""
Les objectifs d'épargne d'un portefeuille : lecture, création, modification, suppression.

⚠️ **La valeur du portefeuille ne vient pas de `total_value`.** Cette colonne s'est
révélée trompeuse : sur un vrai PEA elle vaut 4 959,91 €, c'est-à-dire exactement le
montant *investi*, alors que le portefeuille en vaut 5 304,86 aux cours du jour. S'en
servir aurait retiré la totalité de la plus-value de l'avancement de chaque objectif.
On valorise donc comme la route des positions : quantités issues des transactions,
multipliées par les cours actuels.

⚠️ **La provenance de cette valeur est rendue au client.** Un portefeuille sans
transaction n'a pas de quantités : il ne reste que la colonne, dont on vient de voir ce
qu'elle vaut. Le champ `source` dit alors « poids » au lieu de « transactions », et
l'écran peut prévenir plutôt que d'afficher un avancement d'apparence exacte.

⚠️ **Aucun conseil n'est rendu par ces routes.** Elles donnent où l'on en est et ce
qu'il faudrait ; jamais quoi faire. « À 800 € par mois, la cible tombe en 2044 » est une
division ; « augmentez à 1 000 € » serait une recommandation d'investissement.
"""

from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import require_auth
from app.core.database import Objectif, Portfolio, Transaction, get_db
from app.models.user import User
from app.services.objectifs import (
    GENRES, PLAFONDS_CONNUS, annee_de_l_age, avancement_verse, capital_requis,
    echeance_en_mois, euros_constants, mois_pour_atteindre, mois_pour_verser,
    progression, se_mesure_sur_les_versements, valeur_projetee, verse_projete,
)
from app.services.parametres_objectif import (
    ANNEES_MINIMALES_REFERENCE, INFLATION_CIBLE_BCE, INFLATION_RELEVEE_LE,
    INFLATION_ZONE_EURO, INFLATION_ZONE_EURO_COEUR, REFERENCES_LONGUES,
    REFERENCE_PROPOSEE, annualiser, versement_observe,
)
from app.services.projection import projeter
from app.services.volatilite import JOURS_MINIMAUX, volatilite_mesuree
from app.utils.positions import compute_positions, fetch_current_prices

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/portfolios", tags=["Objectifs"])


class ObjectifEntree(BaseModel):
    nom: str
    genre: str
    cible: float
    echeance_annee: int | None = None
    age_cible: int | None = None
    part_affectee: float | None = None
    versement_mensuel: float | None = None
    #: Le cumul des versements déjà effectués, pour un objectif de plafond. `None` veut
    #: dire « reprends la mesure des transactions », et non « zéro ».
    verse_deja: float | None = None
    taux_attendu: float | None = None
    inflation: float | None = None
    taux_retrait: float | None = None
    couleur: str | None = None


#: Les bornes de saisie, et pourquoi elles existent.
#:
#: ⚠️ Validées à l'écriture et non à la lecture. Un taux hors bornes entré une fois
#: fausserait toutes les projections suivantes sans que rien ne le signale — le même
#: défaut que les frais courants, déjà bornés à l'écriture pour la même raison.
BORNES = {
    # Un rendement attendu négatif est un choix défendable ; au-delà de 30 % l'an, c'est
    # une erreur de saisie ou une promesse que ce logiciel ne relaiera pas.
    "taux_attendu": (-20.0, 30.0),
    "inflation": (0.0, 20.0),
    # Un taux de retrait de zéro voudrait dire ne jamais toucher au capital : accepté,
    # mais la conversion en capital devient impossible, ce que le service gère.
    "taux_retrait": (0.0, 20.0),
    "part_affectee": (0.0, 100.0),
    # Un cumul de versements négatif n'existe pas ; cent millions borne la faute de frappe
    # sans brider personne.
    "verse_deja": (0.0, 100_000_000.0),
}


def _valider(e: ObjectifEntree) -> None:
    if e.genre not in GENRES:
        raise HTTPException(422, f"genre doit valoir l'un de {', '.join(GENRES)}")
    if not (e.nom or "").strip():
        raise HTTPException(422, "un objectif sans nom ne se retrouve pas dans une liste")
    if e.cible <= 0:
        raise HTTPException(422, "la cible doit être strictement positive")
    for champ, (bas, haut) in BORNES.items():
        v = getattr(e, champ)
        if v is not None and not bas <= v <= haut:
            raise HTTPException(422, f"{champ} : {v} est hors de {bas} à {haut}")
    if e.echeance_annee is not None:
        an = date.today().year
        if not an <= e.echeance_annee <= an + 100:
            raise HTTPException(422, f"echeance_annee doit tomber entre {an} et {an + 100}")
    if e.age_cible is not None and not 0 < e.age_cible <= 120:
        raise HTTPException(422, "age_cible doit tomber entre 1 et 120")
    # ⚠️ Un objectif exprimé en âge sans âge est un objectif sans échéance : on refuse à
    # l'écriture plutôt que de laisser une carte muette sur l'écran.
    if e.genre == "capital_age" and e.age_cible is None:
        raise HTTPException(422, "un objectif « à tel âge » exige age_cible")


def _portefeuille(portfolio_id: str, user: User, db: Session) -> Portfolio:
    """Le portefeuille demandé, s'il appartient au compte. 404 sinon, jamais 403."""
    p = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not p or (p.user_id is not None and p.user_id != user.id):
        raise HTTPException(404, "Portefeuille introuvable")
    return p


@dataclass(frozen=True)
class Valorisation:
    """Ce que vaut un portefeuille, et à quel point on peut s'y fier."""

    #: `None` quand aucun cours n'a pu être obtenu. **Jamais zéro dans ce cas.**
    valeur: float | None
    #: « transactions », « poids », ou « indisponible ».
    source: str
    lignes_valorisees: int = 0
    lignes_totales: int = 0


async def valeur_courante(p: Portfolio, db: Session) -> Valorisation:
    """
    La valeur du portefeuille et la façon dont on l'a obtenue.

    ⚠️ Rend la provenance, pas seulement le nombre. « 4 959,91 € d'après la colonne » et
    « 5 304,86 € aux cours du jour » ne se valent pas, et seul l'appelant qui sait lequel
    il tient peut le dire à l'écran.

    ⚠️ **Aucun cours obtenu ne vaut pas zéro, et ce garde vient d'un vrai incident.**
    Le premier jet additionnait les lignes en sautant celles sans prix : le fournisseur
    limitant le débit ce jour-là, la somme est sortie à 0,00 € avec la mention
    « transactions » — donc « 0 % de votre objectif » sur un PEA de cinq mille euros. Un
    portefeuille dont on ignore la valeur doit se dire inconnu ; zéro est une valeur, et
    c'est la pire de toutes ici.

    Une valorisation **partielle** est rendue mais comptée : `lignes_valorisees` sur
    `lignes_totales`. Un total amputé d'une ligne reste faux, et l'écran doit pouvoir le
    dire au lieu de l'afficher comme un patrimoine.
    """
    txs = db.query(Transaction).filter(Transaction.portfolio_id == p.id).all()
    if not txs:
        return Valorisation(p.total_value, "poids")
    positions = compute_positions(txs)
    cours = await fetch_current_prices(list(positions.keys()))
    total, valorisees = 0.0, 0
    for ticker, pos in positions.items():
        prix = cours.get(ticker)
        if prix:
            total += pos["quantity"] * prix
            valorisees += 1
    if valorisees == 0:
        return Valorisation(None, "indisponible", 0, len(positions))
    return Valorisation(total, "transactions", valorisees, len(positions))


def _annee_naissance(user: User) -> int | None:
    """
    L'année de naissance du compte, si elle est connue.

    ⚠️ Elle ne l'est jamais aujourd'hui : le modèle `User` ne la porte pas. Les
    objectifs exprimés en âge restent donc sans date, et l'écran doit le dire au lieu
    d'inventer une année de départ à la retraite. Cette fonction existe pour que le
    jour où le champ apparaît, il n'y ait qu'un endroit à changer.
    """
    return getattr(user, "annee_naissance", None)


def _verse_mesure(p: Portfolio, db: Session) -> float | None:
    """
    Le cumul net que les transactions permettent de mesurer, ou `None` s'il n'y en a pas.

    ⚠️ **C'est un minorant des versements réels, et l'écran doit le dire.** L'application
    enregistre des achats et des ventes de **titres**, jamais les mouvements d'espèces du
    compte : l'argent viré puis laissé en liquidités n'apparaît pas, et une vente non
    réinvestie fait baisser ce net alors qu'elle ne rend aucune capacité de versement sur un
    PEA. Sous-estimer un plafond fait croire à une marge qui n'existe pas — c'est le sens
    dangereux de l'erreur, d'où le champ saisissable qui permet de reprendre son relevé.

    ⚠️ Un arbitrage — vendre A pour acheter B — se compense de lui-même dans ce net, ce qui
    est le comportement juste : il ne consomme aucune capacité de versement.
    """
    txs = db.query(Transaction).filter(Transaction.portfolio_id == p.id).all()
    v = versement_observe(txs)
    return None if v is None else v.net


def _verse_retenu(o: Objectif, verse_mesure: float | None) -> float:
    """
    Le cumul de versements retenu : celui saisi, sinon celui mesuré.

    ⚠️ **`verse_deja is None` veut dire « reprends la mesure », pas « zéro ».** Un objectif
    créé sans toucher au champ doit partir des transactions ; confondre les deux afficherait
    « 0 € versés » sur un PEA qui en a reçu cinq mille, et repousserait la date du plafond
    de plusieurs années.
    """
    if o.verse_deja is not None:
        return max(0.0, float(o.verse_deja))
    return max(0.0, verse_mesure or 0.0)


def _en_dict(o: Objectif, valeur: float | None, user: User,
             verse_mesure: float | None = None) -> dict:
    """
    Un objectif, augmenté de ce que le serveur sait en déduire.

    ⚠️ **Deux familles de calcul, et les mélanger serait la faute.** Un objectif de capital
    se mesure sur ce que **vaut** le portefeuille ; un plafond de versements sur ce qu'on y
    a **versé**. Le second ne dépend d'aucune hypothèse de marché : c'est une division, sans
    rendement, sans volatilité et sans inflation.
    """
    an_echeance = o.echeance_annee
    if o.genre == "capital_age":
        an_echeance = annee_de_l_age(o.age_cible, _annee_naissance(user)) or o.echeance_annee

    mois = echeance_en_mois(an_echeance)
    requis = capital_requis(o.genre, o.cible, o.taux_retrait)
    sur_versements = se_mesure_sur_les_versements(o.genre)
    verse = _verse_retenu(o, verse_mesure) if sur_versements else 0.0

    if sur_versements:
        # ⚠️ La valeur du portefeuille n'entre pas ici. Les gains ne consomment pas la
        # capacité de versement d'un PEA : un PEA valant 150 000 € pour 90 000 € versés
        # garde 60 000 € de marge, et le mesurer sur la valeur l'annoncerait plein.
        prog = avancement_verse(o.cible, verse)
    else:
        prog = progression(o.genre, o.cible, valeur or 0.0,
                           o.part_affectee, o.taux_retrait) if valeur is not None else None

    # ── Ce que les hypothèses permettent de calculer, et rien de plus ─────────
    #
    # ⚠️ Sans taux attendu, aucune projection. Le champ reste nul plutôt que de
    # recevoir un rendement choisi par le logiciel : une projection est une hypothèse
    # de l'épargnant, et la lui souffler la ferait passer pour une prévision.
    projete = atteinte_mois = None
    if sur_versements:
        # ⚠️ Aucune hypothèse n'est requise, donc rien n'est tu : le cumul et la date du
        # plafond se calculent dès qu'un rythme de versement est connu.
        if mois:
            projete = verse_projete(verse, o.versement_mensuel, mois)
        atteinte_mois = mois_pour_verser(o.cible, verse, o.versement_mensuel)
    else:
        if prog is not None and o.taux_attendu is not None and mois:
            projete = valeur_projetee(prog.actuel, o.versement_mensuel or 0.0,
                                      o.taux_attendu, mois)
        if prog is not None and o.taux_attendu is not None and requis:
            atteinte_mois = mois_pour_atteindre(prog.actuel, o.versement_mensuel or 0.0,
                                               o.taux_attendu, requis)

    return {
        "id": o.id, "nom": o.nom, "genre": o.genre, "cible": o.cible,
        "echeance_annee": an_echeance, "age_cible": o.age_cible,
        "part_affectee": o.part_affectee, "versement_mensuel": o.versement_mensuel,
        "taux_attendu": o.taux_attendu, "inflation": o.inflation,
        "taux_retrait": o.taux_retrait, "couleur": o.couleur,
        "capital_requis": requis,
        "montant_actuel": prog.actuel if prog else None,
        "avancement": round(prog.part, 2) if prog else None,
        "atteint": prog.atteint if prog else None,
        "mois_restants": mois,
        "valeur_projetee": projete,
        # En euros d'aujourd'hui, quand l'épargnant a donné une inflation : un million
        # dans trente ans n'a pas le pouvoir d'achat d'un million aujourd'hui.
        #
        # ⚠️ **Jamais pour un plafond de versements.** Cent cinquante mille euros est un
        # seuil légal, exprimé en euros courants et non indexé : afficher à côté « soit
        # 96 000 € d'aujourd'hui » laisserait croire que le plafond se déprécie, ou pire,
        # qu'il reste de la marge quand la loi dit qu'il n'y en a plus.
        "projetee_en_euros_constants": (
            euros_constants(projete, o.inflation, mois)
            if projete is not None and o.inflation is not None and mois
            and not sur_versements else None),
        # ⚠️ Un constat, pas un conseil : le nombre de mois qu'il faudrait au rythme
        # actuel. L'écran peut le comparer à l'échéance ; il ne dit pas quoi changer.
        "mois_pour_atteindre": atteinte_mois,
        # ── Ce qui n'existe que pour un objectif de versements ─────────────────
        #
        # ⚠️ Rendu pour que l'écran n'ait pas à recopier la liste des genres concernés :
        # une seconde liste finirait par différer de celle du service.
        "sur_versements": sur_versements,
        # Le chiffre saisi, s'il l'a été : l'écran doit pouvoir dire « d'après votre
        # relevé » plutôt que « d'après vos transactions ».
        "verse_deja": o.verse_deja,
        # ⚠️ Ce que les transactions mesurent, **toujours rendu même quand l'épargnant a
        # saisi son propre chiffre**. C'est ce qui permet à l'écran de signaler un écart :
        # un relevé à 40 000 € contre 12 000 € de transactions saisies veut dire qu'il
        # manque des transactions, et l'avancement du reste de l'application est alors faux.
        "verse_mesure": (round(verse_mesure, 2) if verse_mesure is not None else None),
        "verse_retenu": round(verse, 2) if sur_versements else None,
    }


@router.get("/{portfolio_id}/objectifs")
async def lister(portfolio_id: str, db: Session = Depends(get_db),
                 user: User = Depends(require_auth)):
    p = _portefeuille(portfolio_id, user, db)
    v = await valeur_courante(p, db)
    objectifs = (db.query(Objectif)
                 .filter(Objectif.portfolio_id == portfolio_id)
                 .order_by(Objectif.cree_le).all())
    parts = [o.part_affectee if o.part_affectee is not None else 100.0 for o in objectifs]
    verse = _verse_mesure(p, db)
    return {
        "objectifs": [_en_dict(o, v.valeur, user, verse) for o in objectifs],
        "valeur_portefeuille": v.valeur,
        "source_valeur": v.source,
        # ⚠️ Rendus pour que l'écran puisse avouer une valorisation partielle : un total
        # amputé d'une ligne reste faux, même s'il ressemble à un patrimoine.
        "lignes_valorisees": v.lignes_valorisees,
        "lignes_totales": v.lignes_totales,
        # ⚠️ Rendu tel quel, sans normalisation. Au-delà de cent, le même euro est
        # compté pour deux objectifs : c'est une erreur de saisie que l'écran doit
        # montrer, pas que le serveur doit corriger en silence.
        "somme_des_parts": round(sum(parts), 2),
        "annee_naissance_connue": _annee_naissance(user) is not None,
    }


@router.post("/{portfolio_id}/objectifs")
async def creer(portfolio_id: str, data: ObjectifEntree,
                db: Session = Depends(get_db), user: User = Depends(require_auth)):
    p = _portefeuille(portfolio_id, user, db)
    _valider(data)
    o = Objectif(id=str(uuid.uuid4()), portfolio_id=p.id, **data.model_dump())
    db.add(o)
    db.commit()
    db.refresh(o)
    return _en_dict(o, (await valeur_courante(p, db)).valeur, user, _verse_mesure(p, db))


@router.put("/{portfolio_id}/objectifs/{objectif_id}")
async def modifier(portfolio_id: str, objectif_id: str, data: ObjectifEntree,
                   db: Session = Depends(get_db), user: User = Depends(require_auth)):
    p = _portefeuille(portfolio_id, user, db)
    o = (db.query(Objectif)
         .filter(Objectif.id == objectif_id, Objectif.portfolio_id == p.id).first())
    if not o:
        raise HTTPException(404, "Objectif introuvable")
    _valider(data)
    for champ, valeur in data.model_dump().items():
        setattr(o, champ, valeur)
    db.commit()
    db.refresh(o)
    return _en_dict(o, (await valeur_courante(p, db)).valeur, user, _verse_mesure(p, db))


@router.delete("/{portfolio_id}/objectifs/{objectif_id}")
def supprimer(portfolio_id: str, objectif_id: str,
              db: Session = Depends(get_db), user: User = Depends(require_auth)):
    p = _portefeuille(portfolio_id, user, db)
    o = (db.query(Objectif)
         .filter(Objectif.id == objectif_id, Objectif.portfolio_id == p.id).first())
    if not o:
        raise HTTPException(404, "Objectif introuvable")
    db.delete(o)
    db.commit()
    return {"supprime": objectif_id}


#: Un point par an sur la courbe : au-delà, la ligne ne se voit plus.
PAS_PROJECTION = 12


@router.get("/{portfolio_id}/objectifs/{objectif_id}/projection")
async def projection(portfolio_id: str, objectif_id: str,
                     db: Session = Depends(get_db), user: User = Depends(require_auth)):
    """
    Les enveloppes de quantiles d'un objectif, avec l'origine de chaque entrée.

    ⚠️ **Deux entrées de nature opposée.** Le rendement attendu est une hypothèse de
    l'épargnant ; la volatilité est mesurée sur la courbe du portefeuille. La réponse
    rend `volatilite_source` pour que l'écran ne les présente pas du même ton.

    ⚠️ **Sans volatilité mesurable, ni intervalle ni probabilité.** La courbe médiane
    reste calculable — c'est de la capitalisation — mais toute dispersion serait inventée.
    Trois causes distinctes sont rendues telles quelles : « mesuree »,
    « echantillon_court » et « indisponible » ne se corrigent pas de la même façon.

    ⚠️ **Ce ne sont pas trois scénarios.** Les courbes sont les 5ᵉ, 50ᵉ et 95ᵉ centiles
    des tirages à chaque mois. Aucune n'est une trajectoire qu'un portefeuille suivrait.
    """
    p = _portefeuille(portfolio_id, user, db)
    o = (db.query(Objectif)
         .filter(Objectif.id == objectif_id, Objectif.portfolio_id == p.id).first())
    if not o:
        raise HTTPException(404, "Objectif introuvable")

    v = await valeur_courante(p, db)
    detail = _en_dict(o, v.valeur, user, _verse_mesure(p, db))
    mois = detail["mois_restants"]
    requis = detail["capital_requis"]
    depart = detail["montant_actuel"]

    # ── Un plafond de versements ne se tire pas au hasard ─────────────────────
    #
    # ⚠️ **Aucun Monte Carlo ici, et ce n'est pas une simplification.** La somme des
    # versements ne dépend d'aucun marché : « quand aurai-je versé 150 000 € ? » a une
    # réponse exacte. Lui coller une enveloppe de centiles inventerait une incertitude que
    # rien ne porte, et la seule vraie — tiendrai-je ce rythme ? — n'est pas un aléa de
    # marché mais une décision de l'épargnant. Elle se montre en faisant varier le
    # versement, pas en tirant des dés.
    if detail["sur_versements"]:
        if not o.versement_mensuel or o.versement_mensuel <= 0:
            return {"possible": False, "raison": "sans_versement", "objectif": detail}
        # ⚠️ **L'horizon est la date du plafond, et non une échéance à saisir.** C'est la
        # question même de cet objectif : « quand aurai-je versé 150 000 € ? » La réponse est
        # calculée, donc exiger en plus une année cible pour dessiner la courbe reviendrait à
        # demander à l'épargnant de deviner ce qu'il vient chercher. Une échéance saisie reste
        # respectée quand elle existe — elle sert alors à comparer un délai voulu au délai
        # réel, ce que la carte affiche déjà.
        horizon = mois or detail["mois_pour_atteindre"]
        if not horizon:
            return {"possible": False, "raison": "sans_echeance", "objectif": detail}
        verse = detail["verse_retenu"] or 0.0
        pas = list(range(0, horizon + 1, PAS_PROJECTION))
        if pas[-1] != horizon:
            pas.append(horizon)
        cumul = [verse_projete(verse, o.versement_mensuel, m) for m in pas]
        return {
            "possible": True,
            "objectif": detail,
            "mois": pas,
            # Une seule courbe, sous la clé de la médiane : l'écran sait déjà n'en dessiner
            # qu'une quand la dispersion est absente, et lui inventer deux bornes égales
            # aurait dessiné une bande d'épaisseur nulle qu'il aurait fallu expliquer.
            "enveloppes": {"50": [round(c, 2) for c in cumul]},
            "mediane": round(cumul[-1], 2),
            "intervalle": None,
            "niveau_intervalle": None,
            # ⚠️ Ni probabilité ni taux implicite : la trajectoire est certaine si le
            # rythme tient, et « 100 % des tirages » sur un unique tirage ne veut rien dire.
            "probabilite": None,
            "taux_implicites": {},
            "requis": requis,
            "volatilite": None,
            # ⚠️ Une quatrième valeur, distincte de « indisponible ». La volatilité n'est pas
            # manquante ici : elle est **hors sujet**. Réutiliser « indisponible » aurait
            # affiché « volatilité non mesurable » sur un portefeuille dont elle est
            # parfaitement mesurable, et fait passer un choix de calcul pour une panne.
            "volatilite_source": "sans_objet",
            "seances_mesurees": 0,
            "seances_minimales": JOURS_MINIMAUX,
            "valeur_portefeuille": v.valeur,
            "source_valeur": v.source,
        }

    # ⚠️ Trois refus explicites, plutôt qu'une courbe vide sans explication.
    if depart is None:
        return {"possible": False, "raison": "valeur_inconnue", "objectif": detail}
    if not mois:
        return {"possible": False, "raison": "sans_echeance", "objectif": detail}
    if o.taux_attendu is None:
        return {"possible": False, "raison": "sans_rendement_attendu", "objectif": detail}

    txs = db.query(Transaction).filter(Transaction.portfolio_id == p.id).all()
    vol, source_vol, seances = volatilite_mesuree(txs)

    proj = projeter(
        depart=depart, versement_mensuel=o.versement_mensuel or 0.0,
        taux_annuel=o.taux_attendu, volatilite_annuelle=vol, mois=mois,
        requis=requis,
        # ⚠️ La graine dérive de l'identifiant : deux affichages du même objectif donnent
        # la même probabilité. Sans cela, 71 % puis 73 %, et plus rien de crédible.
        cle=o.id, pas=PAS_PROJECTION,
    )

    return {
        "possible": True,
        "objectif": detail,
        "mois": proj.mois,
        "enveloppes": {str(c): proj.enveloppes[c] for c in proj.enveloppes},
        "mediane": proj.mediane,
        # ⚠️ 90 % et non 95 : c'est ce que les centiles 5 et 95 délimitent. La maquette
        # annonçait « intervalle de confiance (95 %) » au-dessus de bornes qui n'en
        # couvrent que quatre-vingt-dix.
        "intervalle": proj.intervalle,
        "niveau_intervalle": 90,
        "probabilite": proj.probabilite,
        "taux_implicites": {str(c): t for c, t in proj.taux_implicites.items()},
        "requis": requis,
        "volatilite": vol,
        "volatilite_source": source_vol,
        "seances_mesurees": seances,
        "seances_minimales": JOURS_MINIMAUX,
        "valeur_portefeuille": v.valeur,
        "source_valeur": v.source,
    }


#: Les fenêtres de rendement passé qu'on montre, en années.
FENETRES_RENDEMENT = (3, 5, 10)

_TTL_REFERENCES = 30 * 24 * 3600


def backtest_allocation(poids: dict[str, float]) -> dict | None:
    """
    Ce qu'aurait fait cette répartition sur la plus longue fenêtre disponible.

    ⚠️ **Chaque ligne est remplacée par un fonds plus ancien suivant le même marché.** Sans
    cela, l'histoire commune des ETF d'un PEA commence en 2014 et ne contient aucune crise :
    13 % par an, ce qui n'est pas une attente. Avec les substituts, la fenêtre remonte à
    2001 — 2008, 2020 et 2022 comprises — et le même portefeuille rend 9,50 % par an, au
    prix d'un recul de 57,5 %.

    ⚠️ **C'est une simulation, pas l'histoire de l'épargnant** : il ne détenait pas cette
    allocation en 2008. Les substitutions employées sont rendues, pour que l'écran les
    nomme.
    """
    from app.services.backtest_allocation import (
        ANNEES_MINIMALES, SEANCES_PAR_AN, SUBSTITUTS, annualiser_suite,
        pire_recul, serie_rebalancee,
    )
    # Le cache du service des événements : un seul fichier, une seule mécanique.
    from app.services.evenements import _charger, _ecrire, _TTL_ECHEC, _VERSION
    if not poids:
        return None

    cache = _charger()
    cle = "backtest:" + ",".join(f"{t}={round(w, 3)}" for t, w in sorted(poids.items()))
    e = cache.get(cle)
    if e and e.get("echeance", 0) > time.time() and e.get("version") == _VERSION:
        return e.get("resultat")

    resultat = None
    try:
        import numpy as np
        import yfinance as yf

        subs = {t: SUBSTITUTS.get(t, t) for t in poids}
        tickers = sorted(set(subs.values()))
        brut = yf.download(tickers, start="1990-01-01", progress=False,
                           auto_adjust=True, threads=True)["Close"]
        if brut is not None and len(brut):
            if len(tickers) == 1:
                brut = brut.to_frame(tickers[0])
            vides = [c for c in brut.columns if brut[c].dropna().empty]
            brut = brut.drop(columns=vides).dropna()
            # Les poids sont regroupés par substitut : deux ETF du même marché fusionnent.
            cible: dict[str, float] = {}
            for t, w in poids.items():
                sub = subs[t]
                if sub in brut.columns:
                    cible[sub] = cible.get(sub, 0.0) + w
            couverture = round(sum(cible.values()) * 100, 1)
            annees = ((brut.index[-1] - brut.index[0]).days / 365.25) if len(brut) else 0.0
            if cible and annees >= ANNEES_MINIMALES:
                releves = [{c: float(v) for c, v in ligne.items()}
                           for _, ligne in brut.iterrows()]
                mois = [d.year * 12 + d.month for d in brut.index]
                suite = serie_rebalancee(releves, cible, mois)
                tcam = annualiser_suite(suite, annees)
                if tcam is not None:
                    quot = np.diff(np.log(np.asarray(suite)))
                    resultat = {
                        "rendement": tcam,
                        "volatilite": round(float(np.std(quot, ddof=1)
                                                  * np.sqrt(SEANCES_PAR_AN) * 100), 2),
                        "pire_recul": pire_recul(suite),
                        "annees": round(annees, 1),
                        "debut": str(brut.index[0].date()),
                        "fin": str(brut.index[-1].date()),
                        "substitutions": {t: s for t, s in subs.items() if s != t},
                        "couverture": couverture,
                        "rebalancement": "mensuel",
                    }
    except Exception as exc:                                    # pragma: no cover
        logger.warning("backtest d'allocation indisponible (%s)", type(exc).__name__)

    cache[cle] = {"version": _VERSION, "resultat": resultat,
                  "echeance": time.time() + (_TTL_REFERENCES if resultat else _TTL_ECHEC)}
    _ecrire()
    return resultat


def references_longues() -> list[dict]:
    """
    Le rendement à long terme de quelques grandes classes d'actifs, mis en cache un mois.

    ⚠️ Un mois de cache : ces chiffres bougent de quelques centièmes par mois, et les
    relire à chaque ouverture du formulaire coûterait cinq téléchargements pour rien.
    """
    # ⚠️ On réutilise le cache disque du service des événements plutôt que d'en ouvrir un
    # second : il gère déjà l'écriture atomique, le rechargement sur date de modification
    # et la péremption par version. Deux caches auraient divergé.
    from app.services.evenements import _charger, _ecrire, _TTL_ECHEC, _VERSION
    cache = _charger()
    e = cache.get("references_longues")
    if e and e.get("echeance", 0) > time.time() and e.get("version") == _VERSION:
        return e.get("lignes") or []

    lignes: list[dict] = []
    try:
        import yfinance as yf
        for ticker, libelle in REFERENCES_LONGUES:
            h = yf.download(ticker, start="1990-01-01", progress=False,
                            auto_adjust=True)["Close"].dropna()
            if h is None or len(h) < 300:
                continue
            annees = (h.index[-1] - h.index[0]).days / 365.25
            if annees < ANNEES_MINIMALES_REFERENCE:
                continue
            debut = float(h.iloc[0].iloc[0] if hasattr(h.iloc[0], "iloc") else h.iloc[0])
            fin = float(h.iloc[-1].iloc[0] if hasattr(h.iloc[-1], "iloc") else h.iloc[-1])
            if debut <= 0:
                continue
            tcam = ((fin / debut) ** (1 / annees) - 1) * 100
            lignes.append({
                "ticker": ticker, "libelle": libelle,
                "rendement": round(tcam, 2), "annees": round(annees, 1),
                "depuis": str(h.index[0].date()),
                "proposee": ticker == REFERENCE_PROPOSEE,
            })
    except Exception as exc:                                    # pragma: no cover
        logger.warning("références longues indisponibles (%s)", type(exc).__name__)

    cache["references_longues"] = {
        "version": _VERSION, "lignes": lignes,
        "echeance": time.time() + (_TTL_REFERENCES if lignes else _TTL_ECHEC),
    }
    _ecrire()
    return lignes


@router.get("/{portfolio_id}/objectifs/parametres")
async def parametres_suggeres(portfolio_id: str, db: Session = Depends(get_db),
                              user: User = Depends(require_auth)):
    """
    Ce que le portefeuille permet de proposer pour préparer un objectif.

    ⚠️ **Trois paramètres, trois statuts, et les confondre serait la faute.**

    - `versement` est une **mesure** des transactions : on le propose, et on dit s'il est
      trompeur — un apport unique divisé par six mois ressemble à une habitude qui
      n'existe pas.
    - `rendements_passes` est **montré, jamais pré-rempli**. Mesuré sur un vrai
      portefeuille : 17,90 % par an sur trois ans, 14,71 % sur dix. Exact, et décrivant
      une décennie exceptionnelle. Le glisser dans le champ rendrait chaque projection
      délirante, et l'épargnant y croirait *parce que le chiffre vient de ses données*.
    - `inflation` propose la cible publiée de la BCE, en le disant.
    """
    p = _portefeuille(portfolio_id, user, db)
    txs = db.query(Transaction).filter(Transaction.portfolio_id == p.id).all()
    v = versement_observe(txs)
    poids = {a["ticker"]: float(a.get("weight") or 0) / 100
             for a in (p.assets or []) if a.get("ticker")}

    # ── Le passé de l'allocation, à titre de repère ───────────────────────────
    rendements: list[dict] = []
    periode = None
    if poids:
        try:
            import numpy as np
            import yfinance as yf
            brut = yf.download(list(poids), start="2005-01-01", progress=False,
                               auto_adjust=True, threads=True)["Close"]
            if brut is not None and len(brut):
                if len(poids) == 1:
                    brut = brut.to_frame(list(poids)[0])
                # ⚠️ **Les lignes sans historique sont écartées, et l'allocation
                # renormalisée sur celles qui restent.** Sans cela, l'intersection des
                # colonnes se vide dès qu'un seul titre n'a pas de cours : mesuré sur un
                # vrai PEA, PAEJ.PA ne renvoie rien et les trois autres lignes — 90 % de
                # l'allocation — devenaient inexploitables. Un chiffre sur 90 % de
                # l'allocation, présenté comme tel, vaut mieux que pas de chiffre.
                vides = [c for c in brut.columns if brut[c].dropna().empty]
                sans_historique = sorted(vides)
                brut = brut.drop(columns=vides).dropna()
                retenus = [c for c in brut.columns]
                somme = sum(poids[c] for c in retenus) or 1.0
                couverture = round(somme * 100, 1)
                if len(brut) > 260 and retenus:
                    periode = {"debut": str(brut.index[0].date()),
                               "fin": str(brut.index[-1].date()),
                               "seances": int(len(brut)),
                               "couverture": couverture,
                               "sans_historique": sans_historique}
                    quotidiens = np.log(brut / brut.shift(1)).dropna()
                    # Les poids sont ramenés à cent sur les lignes mesurables : sinon un
                    # portefeuille couvert à 90 % afficherait un rendement rabaissé de
                    # dix pour cent sans que rien ne l'explique.
                    part = np.array([poids[c] / somme for c in retenus])
                    porte = (quotidiens * part).sum(axis=1).tolist()
                    for ans in FENETRES_RENDEMENT:
                        fenetre = porte[-min(len(porte), ans * 252):]
                        taux = annualiser(fenetre)
                        if taux is None:
                            continue
                        vol = float(np.std(fenetre, ddof=1) * np.sqrt(252) * 100)
                        rendements.append({"annees": ans, "rendement": taux,
                                           "volatilite": round(vol, 2)})
        except Exception as e:                                  # pragma: no cover
            logger.warning("rendements passés indisponibles (%s)", type(e).__name__)

    return {
        "versement": None if v is None else {
            "par_mois": v.par_mois, "net": v.net, "mois": v.mois,
            "operations": v.operations, "concentration": v.concentration,
            "trompeur": v.trompeur,
        },
        # ⚠️ Rendu sous une clé qui dit ce que c'est. Un champ nommé
        # « rendement_suggere » aurait invité l'interface à le pré-remplir.
        "rendements_passes": rendements,
        # ⚠️ Les références, elles, **peuvent** être proposées : elles portent sur des
        # fenêtres longues — dix-huit à trente-trois ans, contenant 2000, 2008 et 2020 — et
        # sur des classes d'actifs, non sur les dix ans d'un portefeuille particulier.
        # C'est la différence entre un ordre de grandeur et une extrapolation.
        "references_longues": references_longues(),
        # ⚠️ **Le chiffre proposé en premier.** C'est l'allocation de l'épargnant, backtestée
        # bien avant qu'il n'ouvre son portefeuille — la seule façon d'obtenir une attente
        # qui lui ressemble sans extrapoler une décennie exceptionnelle.
        "backtest": backtest_allocation(poids),
        "periode_mesuree": periode,
        # ⚠️ Deux valeurs, et n'en rendre qu'une serait trompeur. La cible est proposée
        # parce qu'une banque centrale y ramène l'inflation sur un horizon long ; le
        # relevé est affiché parce qu'il en diffère aujourd'hui de près d'un point, ce qui
        # change de dix-neuf pour cent le pouvoir d'achat projeté sur vingt-quatre ans.
        # ── Ce qu'il faut pour un objectif de plafond de versements ────────────
        #
        # ⚠️ **Le cumul mesuré est rendu comme un minorant, et son nom le dit.** Une clé
        # « versements_cumules » aurait invité l'interface à l'afficher comme un fait ;
        # l'application ne voit que des achats et des ventes de titres, jamais les virements
        # sur le compte. Sous-estimer un plafond fait croire à une marge qui n'existe pas.
        "plafonds": [{"libelle": nom, "montant": montant}
                     for nom, montant in PLAFONDS_CONNUS],
        "verse_minorant": None if v is None else v.net,
        "inflation": {
            "valeur": INFLATION_CIBLE_BCE,
            "source": "cible de la Banque centrale européenne",
            "observee": INFLATION_ZONE_EURO,
            "observee_coeur": INFLATION_ZONE_EURO_COEUR,
            "observee_mois": INFLATION_RELEVEE_LE,
            "observee_source": "estimation rapide d’Eurostat",
        },
    }
