"""
La configuration du NOVAC Portfolio Score : pondérations, bandes, version.

⚠️ **Tout seuil qui décide d'une note vit ici ou dans `profils.py`, jamais dans un
calcul.** C'est la condition pour que la méthodologie soit recalibrable sans relire
le moteur, et pour que l'écran « Comprendre le score » affiche des chiffres qui sont
réellement ceux du calcul et non une copie qui vieillit.

⚠️ Les pondérations de cette V1 sont **cohérentes et défendables, pas établies**.
Elles reposent sur un raisonnement explicite, pas sur une calibration statistique :
il faudrait pour cela des portefeuilles de référence notés par des professionnels.
Elles sont donc faites pour bouger, et `VERSION_METHODOLOGIE` existe pour que les
scores déjà rendus disent lesquelles ils ont utilisées.
"""

from __future__ import annotations

# ⚠️ À incrémenter dès qu'une pondération, un seuil ou une métrique change.
#
# Sans elle, deux scores calculés à six mois d'écart seraient incomparables sans
# qu'on puisse le savoir. C'est le minimum pour qu'un historique de notes ait un
# sens — et pour qu'on puisse expliquer une baisse par un changement de méthode
# plutôt que de laisser croire à une dégradation du portefeuille.
VERSION_METHODOLOGIE = "NOVAC_SCORE_V1"


# ── Pondération des cinq piliers ──────────────────────────────────────────────
#
# Le raisonnement, pilier par pilier :
#
# **Risque 30 %** — c'est ce qui fait perdre de l'argent, et le seul groupe dont
# l'échelle dépend d'une intention déclarée. Il pèse le plus parce qu'un portefeuille
# dont le risque ne correspond pas à son propriétaire se vend au premier creux, ce
# qui annule tout le reste.
#
# **Diversification 25 %** — la seule protection gratuite qui existe. Elle ne coûte
# rien en rendement attendu et supprime le risque non rémunéré.
#
# **Construction 20 %** — l'équilibre des pondérations et le coût structurel. Moins
# décisif que les deux précédents, mais entièrement sous le contrôle de l'épargnant.
#
# **Qualité 15 %** — la solidité de ce qui est détenu. Poids modéré assumé : les
# données de qualité sont les plus lacunaires, et un pilier souvent partiel ne doit
# pas dominer la note.
#
# **Adéquation au profil 10 %** — le plus petit poids, et volontairement : il
# recoupe en partie le pilier Risque. Lui donner davantage compterait deux fois
# l'écart au profil. Il mesure le **type** de risque là où Risque mesure son niveau.
POIDS_PILIERS = {
    "risque":          30.0,
    "diversification": 25.0,
    "construction":    20.0,
    "qualite":         15.0,
    "adequation":      10.0,
}


# ── Bandes qualitatives ───────────────────────────────────────────────────────
#
# ⚠️ Pas six tranches égales, et c'est mesuré. Avec des seuils réguliers de vingt
# points, quatre portefeuilles types sur huit tombaient dans la bande haute — du
# portefeuille de marché jusqu'à un PEA sans aucune exposition aux émergents — et la
# bande basse restait vide.
#
# Les bandes se resserrent donc en haut : dix points chacune au-dessus de soixante,
# vingt puis quarante en dessous. Atteindre « Excellent » demande de n'avoir aucun
# manque nommable, et le portefeuille de marché y parvient — une bande haute
# inatteignable serait pire qu'une bande trop facile, elle n'apprendrait rien.
#
# ⚠️ « Exceptionnel » est écarté du vocabulaire : le mot suggérerait une
# recommandation ou une garantie, ce qu'un score de construction n'est pas.
BANDES = [
    (90, "Excellent"),
    (80, "Très bon"),
    (70, "Bon"),
    (60, "Correct"),
    (40, "À améliorer"),
    (0,  "Fragile"),
]


def bande(score: int | float | None) -> str | None:
    """Le libellé qualitatif d'un score."""
    if score is None:
        return None
    for seuil, nom in BANDES:
        if score >= seuil:
            return nom
    return BANDES[-1][1]


# ── Couverture minimale ───────────────────────────────────────────────────────
#
# Part du portefeuille sur laquelle une mesure doit reposer pour être notée.
#
# ⚠️ Ce garde-fou vient d'un dégât réel. Une ventilation sectorielle se normalisait
# à cent sur les seules lignes transparentes : elle sommait donc toujours à cent, et
# une diversification calculée sur 30 % du portefeuille s'affichait comme celle du
# portefeuille entier. Sous ce seuil, la métrique passe en `indisponible` — et
# l'indice de confiance en porte la trace.
COUVERTURE_MIN = 0.60


# ── Métriques volontairement absentes ─────────────────────────────────────────
#
# ⚠️ Cette liste est **affichée** dans l'écran de méthodologie, et c'est le but.
#
# Devant un professionnel, dire ce qu'on ne mesure pas et pourquoi est plus crédible
# qu'exhiber une métrique dont on sait qu'elle se trompe. Chaque entrée porte le
# chiffre qui a motivé le retrait, mesuré sur des portefeuilles réels ou construits.
ECARTEES = [
    {
        "cle": "devise",
        "libelle": "Exposition devises",
        "motif": "La source ne donne que la devise de **cotation**, pas celle des "
                 "sous-jacents. Deux fonds suivant le même S&P 500 obtenaient 100 "
                 "(coté à Paris, « 0 % hors euro ») et 0 (coté à New York). Cent "
                 "points d'écart pour une différence sans contenu économique.",
    },
    {
        "cle": "beta",
        "libelle": "Bêta contre indice de référence",
        "motif": "Calculé sur des rendements quotidiens, il est biaisé vers zéro pour "
                 "toute ligne cotée hors des heures de New York : 0,54 pour un fonds "
                 "parisien contre 0,99 pour un fonds américain suivant le **même** "
                 "indice. Il certifiait conforme à une cible de 65 % d'actions un "
                 "portefeuille investi à cent pour cent.",
    },
    {
        "cle": "liquidite",
        "libelle": "Liquidité des positions",
        "motif": "Constante pour un particulier : il faudrait détenir un dixième du "
                 "volume d'une séance pour perdre le premier point. Elle n'ajoutait "
                 "qu'une constante à la moyenne.",
    },
    {
        "cle": "correlation_moyenne",
        "libelle": "Corrélation moyenne entre lignes",
        "motif": "0,85 entre lignes d'actions est une propriété de la classe "
                 "d'actifs, pas un défaut de construction — la noter coûtait dix-sept "
                 "points à un portefeuille bien bâti. La corrélation **maximale**, "
                 "elle, désigne deux lignes précises et se corrige : c'est la "
                 "redondance, qui est notée.",
    },
    {
        "cle": "var_cvar",
        "libelle": "VaR et CVaR",
        "motif": "Sur un an de rendements quotidiens, ce sont des fonctions quasi "
                 "déterministes de la volatilité. Les ajouter donnerait deux voix "
                 "supplémentaires à une mesure déjà présente, sans information "
                 "nouvelle.",
    },
    {
        "cle": "sharpe",
        "libelle": "Ratio de Sharpe",
        "motif": "Estimé sur un an, il vaut 0,53 ± 1,00 pour un Sharpe vrai de 0,50 : "
                 "la note serait 50 ± 43 pour le même portefeuille. Une note doit "
                 "être reproductible.",
    },
]
