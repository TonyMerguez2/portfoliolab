"""
Les trois profils, et ce que chacun change dans le calcul.

⚠️ Un profil n'est **pas un multiplicateur global**. Multiplier la note finale par
0,9 pour un prudent aurait produit trois classements identiques à trois échelles
près — donc aucune information. Un profil déplace :

— des **seuils** : la part maximale acceptable sur une ligne, le nombre d'actifs
  visé, la part de cryptomonnaies tolérée ;
— des **pénalités** : la largeur de la bande sur laquelle un dépassement de risque
  fait tomber la note, et l'indulgence accordée à qui reste en dessous de sa cible ;
— des **pondérations** : ce qui compte le plus n'est pas le même selon l'intention.

Le même portefeuille obtient donc une note différente, et par des chemins
différents, ce qui est le but : « 100 % crypto » doit être mauvais pour un prudent
parce que le risque dépasse son seuil, et rester médiocre pour un dynamique parce que
la diversification est faible — pas seulement moins pénalisé.

⚠️ Les cibles de volatilité et de perte ne vivent pas ici : elles viennent de
`analyse.profil_cible`, qui les dérive de la part d'actions et de l'**horizon**. Un
creux de trois ans ne compte pas quand on investit sur vingt, et cette dimension est
absente d'un simple profil. Les dupliquer aurait donné deux calibrations du même
arbitrage.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.services.analyse import PLAFOND_ACTIONS, profil_cible  # noqa: F401

from .config import POIDS_PILIERS


@dataclass(frozen=True)
class Reglages:
    """Les paramètres d'un profil. Tous configurables, aucun dispersé dans un calcul."""

    cle: str
    libelle: str
    description: str

    # ── Seuils ────────────────────────────────────────────────────────────────
    #
    # Part maximale d'une seule ligne avant pénalité, en pourcentage. Un prudent qui
    # met un tiers de son épargne sur une valeur prend un risque qu'il a déclaré ne
    # pas supporter ; pour un dynamique, c'est une position assumée.
    position_max: float
    # Nombre d'actifs équivalents visé, en transparence des fonds. Le seuil de la
    # littérature sur la diversification naïve tourne autour de vingt titres ; un
    # prudent doit viser plus haut, un dynamique peut accepter moins.
    actifs_cibles: float
    # Part de cryptomonnaies au-delà de laquelle la note tombe à zéro.
    crypto_max: float

    # ── Pénalités ─────────────────────────────────────────────────────────────
    #
    # Largeur de la bande, en fraction de la cible, sur laquelle un dépassement de
    # volatilité fait tomber la note de cent à zéro. Plus elle est étroite, plus le
    # profil est sévère : un prudent qui double sa cible doit s'effondrer, un
    # dynamique a plus de marge avant que sa note ne s'annule.
    largeur_penalite_vol: float
    # Indulgence pour qui reste **en dessous** de sa cible de risque, entre 0 et 1.
    # Rester en deçà ne coûte qu'un manque à gagner, dépasser expose à vendre dans la
    # baisse : les deux sont des écarts au projet, pas de même gravité. Un prudent
    # est presque totalement excusé d'être trop prudent.
    indulgence_sous_cible: float

    # ── Pondérations ──────────────────────────────────────────────────────────
    #
    # Écarts additifs aux poids de `POIDS_PILIERS`, en points. La somme est
    # renormalisée à cent, donc seuls les écarts relatifs comptent.
    ecarts_poids: dict[str, float]

    def poids_piliers(self) -> dict[str, float]:
        """Les poids des piliers pour ce profil, renormalisés à cent."""
        brut = {k: POIDS_PILIERS[k] + self.ecarts_poids.get(k, 0.0) for k in POIDS_PILIERS}
        brut = {k: max(0.0, v) for k, v in brut.items()}
        total = sum(brut.values())
        if total <= 0:                                        # pragma: no cover
            return dict(POIDS_PILIERS)
        return {k: v / total * 100.0 for k, v in brut.items()}


PROFILS: dict[str, Reglages] = {
    "prudent": Reglages(
        cle="prudent",
        libelle="Prudent",
        description="Je vends si mon portefeuille perd beaucoup. 35 % d'actions au plus.",
        position_max=15.0,
        actifs_cibles=25.0,
        crypto_max=5.0,
        # Étroite : à une fois et demie la cible, la note est nulle. Quelqu'un qui a
        # déclaré vendre dans la baisse ne doit pas voir « correct » sur un
        # portefeuille qui va le faire vendre.
        largeur_penalite_vol=0.50,
        indulgence_sous_cible=0.25,
        # Le risque et son adéquation dominent : c'est la seule chose qui décide si ce
        # portefeuille sera tenu ou vendu au premier creux.
        ecarts_poids={"risque": +8.0, "adequation": +5.0,
                      "qualite": -5.0, "construction": -4.0, "diversification": -4.0},
    ),
    "equilibre": Reglages(
        cle="equilibre",
        libelle="Équilibré",
        description="J'accepte des creux marqués sans y toucher. 65 % d'actions au plus.",
        position_max=25.0,
        actifs_cibles=20.0,
        crypto_max=10.0,
        largeur_penalite_vol=0.75,
        indulgence_sous_cible=0.50,
        # Aucun écart : ce profil porte les pondérations de référence.
        ecarts_poids={},
    ),
    "dynamique": Reglages(
        cle="dynamique",
        libelle="Dynamique",
        description="Une baisse de moitié ne me ferait pas vendre. Jusqu'à 100 % d'actions.",
        position_max=40.0,
        actifs_cibles=15.0,
        crypto_max=25.0,
        # Large : il faut plus que doubler la cible pour annuler la note. Le risque
        # est assumé, donc son dépassement se juge plus lentement.
        largeur_penalite_vol=1.20,
        indulgence_sous_cible=0.70,
        # ⚠️ Le risque **pèse moins**, la diversification et la qualité davantage.
        #
        # C'est le cœur du choix : quand le risque est accepté, ce qui distingue un
        # portefeuille bien bâti d'un pari, c'est ce qu'il détient et comment c'est
        # réparti. Sans ce déplacement, « 100 % crypto » aurait pu approcher cent
        # pour un dynamique — alors qu'il reste un portefeuille d'un seul actif.
        ecarts_poids={"risque": -8.0, "adequation": -3.0,
                      "diversification": +6.0, "qualite": +5.0},
    ),
}


def reglages(profil: str | None) -> Reglages | None:
    """Les réglages d'un profil, ou `None` s'il n'est pas déclaré."""
    if not profil:
        return None
    return PROFILS.get(str(profil).lower())
