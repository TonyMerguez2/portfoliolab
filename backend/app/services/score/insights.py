"""
Les insights : des constats **déterministes**, calculés et non rédigés.

⚠️ Aucun texte d'ici ne sort d'un modèle de langage, et c'est une contrainte
d'architecture, pas une préférence. La logique financière critique ne doit pas
dépendre d'une génération : un modèle peut produire une phrase plausible et fausse,
et personne ne s'en apercevrait. Une règle sur une mesure, elle, se relit et se
conteste.

Un modèle pourra plus tard reformuler ces constats en prose plus naturelle. Il
travaillera alors sur des chiffres déjà établis, jamais sur les données brutes.

⚠️ Chaque constat cite la mesure qui le fonde. Sans elle, « votre portefeuille est
concentré » est une opinion ; « BTC pèse 52,6 %, une baisse de 10 % coûterait 5,3 % de
la valeur totale » est vérifiable.
"""

from __future__ import annotations

from .profils import Reglages
from .types import Insight, Pilier

# Seuils d'apparition des constats. Aucun n'entre dans le score : ils décident
# seulement de ce qui vaut la peine d'être dit.
LIGNE_DOMINANTE = 30.0
TROIS_PREMIERES = 65.0
CORRELATION_FORTE = 0.90
ECART_MARCHE_NOTABLE = 25.0


def produire(entrees, piliers: list[Pilier],
             reglages: Reglages | None) -> tuple[list[Insight], list[Insight]]:
    """
    Les points forts et les points d'attention.

    L'ordre est celui de l'importance décroissante, et les deux listes sont bornées :
    au-delà de trois ou quatre constats, plus rien n'est lu. Un écran qui dit tout ne
    dit rien.
    """
    forts: list[Insight] = []
    attention: list[Insight] = []

    par_cle = {p.cle: p for p in piliers}
    metriques = {m.cle: m for p in piliers for m in p.metriques}

    poids = {t: w for t, w in (entrees.poids or {}).items() if w > 0}
    total = sum(poids.values())

    # ── La ligne dominante, et ce qu'elle coûterait ───────────────────────────
    if total > 0:
        tries = sorted(poids.items(), key=lambda kv: kv[1], reverse=True)
        premier, part = tries[0][0], tries[0][1] / total * 100
        if part >= LIGNE_DOMINANTE:
            attention.append(Insight(
                ton="attention",
                titre=f"{premier} représente {part:.1f} % du portefeuille",
                # Le chiffrage rend le constat actionnable : « concentré » ne dit pas
                # combien ça coûte, « 5,3 % » se compare à ce qu'on peut supporter.
                detail=f"Une baisse de 10 % de cette seule ligne entraînerait une baisse "
                       f"d'environ {part / 10:.1f} % du portefeuille, toutes choses "
                       f"égales par ailleurs.",
            ))
        if len(tries) >= 3:
            trois = sum(w for _, w in tries[:3]) / total * 100
            if trois >= TROIS_PREMIERES:
                attention.append(Insight(
                    ton="attention",
                    titre=f"Vos trois principales positions représentent {trois:.0f} %",
                    detail="La performance du portefeuille dépend surtout d'elles.",
                ))

    # ── La volatilité, située par rapport au profil ───────────────────────────
    vol = metriques.get("volatilite")
    if vol and vol.valeur is not None and reglages is not None and entrees.cible:
        visee = entrees.cible["volatilite"]
        if vol.valeur > visee * 1.3:
            attention.append(Insight(
                ton="attention",
                titre=f"Volatilité annualisée de {vol.valeur:.1f} %",
                detail=f"Élevée pour un profil {reglages.libelle.lower()}, dont "
                       f"l'horizon et la tolérance impliquent environ {visee:.0f} %.",
            ))
        elif abs(vol.valeur - visee) <= visee * 0.25:
            forts.append(Insight(
                ton="fort",
                titre=f"Volatilité conforme à votre profil ({vol.valeur:.1f} %)",
                detail=f"Proche des {visee:.0f} % qu'impliquent votre horizon et votre "
                       f"tolérance : le portefeuille tient ce qui a été déclaré.",
            ))

    # ── La redondance, quand elle parle ───────────────────────────────────────
    red = metriques.get("redondance")
    if red and red.valeur is not None and red.valeur >= CORRELATION_FORTE:
        attention.append(Insight(
            ton="attention",
            titre=f"Deux lignes évoluent presque à l'identique (corrélation {red.valeur:.2f})",
            detail="À ce niveau elles font le même pari : l'une des deux n'apporte ni "
                   "rendement attendu supplémentaire, ni amortissement.",
        ))

    # ── La géographie ─────────────────────────────────────────────────────────
    geo = metriques.get("geographie")
    if geo and geo.valeur is not None:
        if geo.valeur >= ECART_MARCHE_NOTABLE:
            attention.append(Insight(
                ton="attention",
                titre=f"{geo.valeur:.0f} points d'écart à la répartition mondiale",
                detail="Il faudrait déplacer cette part du portefeuille pour rejoindre "
                       "le marché coté, qui est la répartition la plus diversifiée.",
            ))
        elif geo.valeur < 12:
            forts.append(Insight(
                ton="fort",
                titre="Répartition géographique proche du marché mondial",
                detail=f"{geo.valeur:.0f} points d'écart seulement : l'exposition "
                       f"régionale ne constitue pas un pari.",
            ))

    # ── Les frais, quand ils sont connus ──────────────────────────────────────
    frais = metriques.get("frais_fonds")
    if frais and frais.valeur is not None:
        if frais.valeur <= 0.25:
            forts.append(Insight(
                ton="fort",
                titre=f"Frais courants contenus ({frais.valeur:.2f} % par an)",
                detail="C'est le seul coût certain d'un portefeuille de fonds, et le "
                       "facteur le plus prédictif de son résultat relatif à long terme.",
            ))
        elif frais.valeur >= 0.75:
            attention.append(Insight(
                ton="attention",
                titre=f"Frais courants élevés ({frais.valeur:.2f} % par an)",
                detail=f"Prélevés chaque année sur l'encours, ils coûtent environ "
                       f"{frais.valeur * 10:.1f} % de la valeur sur dix ans, hors effet "
                       f"de composition.",
            ))

    # ── La diversification en transparence, quand elle est bonne ───────────────
    conc = metriques.get("concentration")
    if conc and conc.valeur is not None and conc.valeur >= 100:
        forts.append(Insight(
            ton="fort",
            titre=f"Le portefeuille équivaut à {conc.valeur:.0f} actifs équipondérés",
            detail="La défaillance d'une société ne peut donc pas peser de façon "
                   "sensible sur l'ensemble.",
        ))

    # ── Le rappel de méthode, quand un pilier se tait ─────────────────────────
    if par_cle.get("risque") and par_cle["risque"].score is None:
        attention.append(Insight(
            ton="info",
            titre="Le risque n'est pas noté",
            detail="Déclarez votre horizon et votre tolérance : un niveau de risque ne "
                   "se juge que face à une intention, et le noter dans l'absolu "
                   "reviendrait à décider de votre projet à votre place.",
        ))

    return forts[:4], attention[:4]
