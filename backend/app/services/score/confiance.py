"""
L'indice de confiance : la qualité des **données**, pas celle du portefeuille.

⚠️ Les deux chiffres ne mesurent pas la même chose et doivent se lire côte à côte.
« 76 sur 100, confiance 58 % » dit « ce portefeuille semble correct, mais je connais
mal ce qu'il contient » — ce qui est une information tout autre que « 76, confiance
94 % ». Sans cet indice, une note calculée sur trois métriques a exactement la même
apparence qu'une note calculée sur dix.
"""

from __future__ import annotations

from .types import Pilier


def confiance(piliers: list[Pilier], historique_jours: int | None = None) -> int:
    """
    La confiance, de 0 à 100.

    Elle combine trois choses, et la première est la plus importante :

    **La couverture pondérée par la taille des positions.** Chaque métrique porte sa
    `couverture` — la part du portefeuille sur laquelle elle repose. Des secteurs
    inconnus sur une ligne à 2 % ne coûtent presque rien ; sur une ligne à 55 %, ils
    coûtent cher. Cette pondération est automatique puisque la couverture *est* une
    part de portefeuille : elle n'a pas besoin d'être recalculée ici.

    **Le poids des métriques manquantes.** Une métrique indisponible compte pour une
    couverture nulle, pondérée par son importance dans la méthodologie : perdre les
    frais des fonds ne coûte pas autant que perdre le risque.

    **La longueur de l'historique.** Une volatilité sur soixante séances est
    calculable mais fragile ; sur un an elle est solide. En dessous de deux cents
    séances la confiance est réduite à proportion, sans jamais annuler le reste.

    ⚠️ Volontairement une moyenne pondérée simple, sans forme fonctionnelle savante.
    Un indice de confiance qui demanderait lui-même une méthodologie manquerait son
    but.
    """
    numerateur = 0.0
    denominateur = 0.0

    for pilier in piliers:
        for m in pilier.metriques:
            # Le poids d'une métrique dans l'ensemble : son poids dans son pilier,
            # multiplié par le poids du pilier.
            poids = pilier.poids * m.poids
            if poids <= 0:
                continue
            couverture = 0.0 if m.score is None else max(0.0, min(1.0, m.couverture))
            numerateur += poids * couverture
            denominateur += poids

    if denominateur <= 0:
        return 0

    part = numerateur / denominateur

    # L'historique ne s'applique qu'à la baisse, et jamais en dessous de la moitié :
    # un portefeuille jeune n'est pas un portefeuille inconnu — ses poids, ses
    # secteurs et ses frais restent parfaitement mesurés.
    if historique_jours is not None and historique_jours < 200:
        maturite = max(0.0, min(1.0, historique_jours / 200.0))
        part *= 0.5 + 0.5 * maturite

    return int(round(max(0.0, min(1.0, part)) * 100))


def manquantes(piliers: list[Pilier]) -> list[str]:
    """
    Les métriques qu'on n'a pas pu calculer, nommées en clair.

    ⚠️ Rendues pour être **affichées**. Une confiance de 58 % sans dire ce qui manque
    laisse le lecteur devant un reproche sans objet : il ne peut ni le vérifier, ni y
    remédier quand c'est possible — et pour les frais des fonds, ça l'est.
    """
    sortie: list[str] = []
    for pilier in piliers:
        for m in pilier.metriques:
            if m.score is None:
                sortie.append(f"{pilier.libelle} — {m.libelle}")
    return sortie
