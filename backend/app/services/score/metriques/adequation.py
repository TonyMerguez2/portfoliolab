"""
Le pilier Adéquation : le **type** de risque, non son niveau.

⚠️ La distinction avec le pilier Risque décide de la valeur de ce pilier, et le
cahier des charges a raison d'insister : recopier le risque sous un autre nom
aurait compté deux fois la même chose.

Risque demande « de combien ce portefeuille bouge-t-il, face à ce qui a été
déclaré ? » — une question d'amplitude, mesurée sur les cours.

Adéquation demande « le risque pris est-il **de la nature** acceptée ? » — une
question de composition, mesurée sur ce qui est détenu. Un portefeuille peut avoir
la bonne volatilité pour un prudent tout en étant à trente pour cent en
cryptomonnaies, ou en actions alors que le profil plafonne à trente-cinq pour cent.
Les deux piliers répondent alors différemment, et c'est le signe qu'ils mesurent
bien deux choses.
"""

from __future__ import annotations

from ..normalisation import note_decroissante
from ..profils import Reglages
from ..types import Metrique


def exposition_crypto(poids: dict[str, float], nature: dict[str, str],
                      reglages: Reglages | None) -> Metrique:
    """
    La part en cryptomonnaies, face au plafond du profil.

    ⚠️ C'est la métrique où les trois profils divergent le plus franchement : cinq
    pour cent pour un prudent, dix pour un équilibré, vingt-cinq pour un dynamique.
    Un portefeuille à trente pour cent de crypto est un défaut d'adéquation pour les
    deux premiers et une position assumée pour le troisième.

    Zéro crypto vaut cent : ne pas en détenir n'est pas un manque. C'est une classe
    d'actifs facultative, contrairement aux actions dont l'absence signale un
    portefeuille en deçà de son horizon.
    """
    total = sum(w for w in poids.values() if w > 0)
    # ⚠️ Sans profil déclaré, ce pilier entier ne note pas. Un plafond de crypto n'a
    # de sens que face à une tolérance annoncée : appliquer celui de l'équilibré par
    # défaut reviendrait à décider du profil à la place de l'épargnant, ce que tout le
    # reste du moteur se refuse à faire.
    if total <= 0 or reglages is None:
        return Metrique(
            cle="exposition_crypto", libelle="Exposition aux cryptomonnaies",
            score=None, statut="indisponible", poids=50.0,
            lecture=("aucune position" if total <= 0 else "profil non déclaré"),
            couverture=0.0,
            explication="La part de votre portefeuille en cryptomonnaies, face au plafond de votre profil.",
        )

    connus = sum(poids.get(t, 0.0) for t in nature)
    couverture = connus / total
    part = sum(poids.get(t, 0.0) for t, g in nature.items() if g == "crypto") / total * 100.0

    note = None
    if couverture >= 0.60:
        # Cent tant qu'on est sous le plafond ; zéro à deux fois et demie le plafond.
        # La pente est douce à dessein : la crypto est volatile mais son excès est déjà
        # puni par le pilier Risque, et il ne faut pas compter deux fois.
        depassement = max(0.0, part - reglages.crypto_max)
        note = note_decroissante(depassement, 0.0, reglages.crypto_max * 1.5)

    return Metrique(
        cle="exposition_crypto",
        libelle="Exposition aux cryptomonnaies",
        score=note,
        statut="disponible" if note is not None and couverture >= 0.999
        else "partiel" if note is not None else "indisponible",
        poids=50.0,
        valeur=round(part, 1),
        lecture=(f"{part:.0f} % en crypto, plafond {reglages.crypto_max:.0f} %"
                 if note is not None else "nature des lignes indéterminée"),
        couverture=couverture,
        explication=(
            f"La part de votre portefeuille en cryptomonnaies. Un profil "
            f"{reglages.libelle.lower()} en tolère {reglages.crypto_max:.0f} %. "
            f"Ne pas en détenir vaut cent : c'est une classe facultative."
        ),
    )


def part_actifs_risques(classes: list[dict] | None, poids: dict[str, float],
                        nature: dict[str, str], cible: dict | None,
                        reglages: Reglages | None) -> Metrique:
    """
    La part en **actifs risqués**, face à celle que le profil implique.

    ⚠️ « Actifs risqués » et non « actions », et la nuance a corrigé un résultat
    inversé. La métrique comptait la part en actions et traitait donc tout le reste
    comme du défensif : un portefeuille cent pour cent en cryptomonnaies passait pour
    **trop prudent** aux yeux d'un profil dynamique, dont la cible est cent pour cent
    d'actions. L'adéquation valait alors 26 pour un prudent contre 0 pour un
    dynamique — l'inverse exact de ce qui est attendu.

    Or la crypto n'est pas un placement défensif : c'est l'actif le plus volatil du
    portefeuille. Elle compte donc dans la poche risquée, aux côtés des actions, et
    l'écart se mesure sur l'ensemble.

    La cible vient de `profil_cible`, qui la dérive de la tolérance **et** de
    l'horizon — vingt pour cent dès la première année, puis cinq points par an, dans
    la limite du plafond du profil.

    C'est le complément exact de la volatilité : celle-ci constate l'amplitude
    obtenue, celle-là vérifie que la **composition** correspond. Un portefeuille peut
    avoir la volatilité visée par accident d'une année calme tout en étant
    structurellement plus risqué que déclaré — précisément l'erreur que le bêta
    commettait avant d'être retiré, attrapée ici sans son biais de mesure.

    ⚠️ L'écart est compté dans les **deux sens**, contrairement à la volatilité. Être
    trop peu exposé face à son horizon n'est pas prudent : c'est un manque à gagner
    que le temps ne rattrape pas. L'indulgence du profil s'applique, simplement moins
    fort qu'ailleurs.
    """
    if cible is None or reglages is None:
        return Metrique(
            cle="part_risquee", libelle="Part en actifs risqués",
            score=None, statut="indisponible", poids=50.0,
            lecture="profil non déclaré", couverture=0.0,
            explication=("La part de votre portefeuille en actifs risqués — actions et "
                         "cryptomonnaies — face à celle que votre horizon implique."),
        )

    total_poids = sum(w for w in poids.values() if w > 0)
    part_crypto = (sum(poids.get(t, 0.0) for t, g in nature.items() if g == "crypto")
                   / total_poids * 100.0) if total_poids > 0 else 0.0

    total_classes = sum(x["part"] for x in (classes or []))
    part_actions = 0.0
    if total_classes > 0:
        part_actions = (sum(x["part"] for x in classes if x.get("libelle") == "Actions")
                        / total_classes * 100.0)

    # La ventilation par classes range la crypto sous « Autres » : on la reprend depuis
    # la nature des lignes, seule source qui la nomme.
    part = min(100.0, part_actions + part_crypto)
    couverture = 1.0 if (total_classes > 0 or part_crypto > 0) else 0.0
    if couverture <= 0:
        return Metrique(
            cle="part_risquee", libelle="Part en actifs risqués",
            score=None, statut="indisponible", poids=50.0,
            lecture="composition par classes indisponible", couverture=0.0,
            explication=("La part de votre portefeuille en actifs risqués — actions et "
                         "cryptomonnaies — face à celle que votre horizon implique."),
        )

    visee = cible["part_actions"]
    ecart = abs(part - visee)
    if part < visee:
        ecart *= reglages.indulgence_sous_cible + 0.3
    note = note_decroissante(ecart, 0.0, 40.0)

    return Metrique(
        cle="part_risquee",
        libelle="Part en actifs risqués",
        score=note,
        statut="disponible",
        poids=50.0,
        valeur=round(part, 1),
        lecture=f"{part:.0f} % d'actifs risqués, pour {visee:.0f} % visés",
        couverture=couverture,
        explication=(
            f"Actions et cryptomonnaies réunies, face aux {visee:.0f} % que votre "
            f"horizon et votre tolérance impliquent. Le complément de la volatilité : "
            f"celle-ci constate l'amplitude obtenue, celle-là vérifie que la "
            f"composition correspond — une année calme peut donner la bonne "
            f"volatilité à un portefeuille structurellement plus risqué."
        ),
    )
