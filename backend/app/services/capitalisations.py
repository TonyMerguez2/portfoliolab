"""
Les capitalisations boursières, par lot et mises en cache.

⚠️ **Le cache existait déjà : c'est celui de `rankings`, et on s'y branche plutôt que d'en
ouvrir un second.** Il est alimenté par chaque appel à `/quote/{ticker}` et par le préchargement
du démarrage ; c'est lui qui produit le « #13 » affiché sur la fiche d'actif. Deux caches pour la
même grandeur, c'est deux occasions de diverger — la leçon a déjà été payée côté navigateur, où
trois surfaces tenaient chacune leur copie de la couleur d'un logo.

⚠️ **`fast_info` d'abord, `info` en secours** — le premier lit un point d'entrée léger, le second
télécharge une fiche de plusieurs dizaines de champs. Le détail, et pourquoi les deux sont
nécessaires, est dans `_lire_une`.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor

from app.services.rankings import get_market_cap, update_mcap

logger = logging.getLogger(__name__)

#: Le nombre de tickers acceptés par appel. Au-delà, la requête est tronquée.
#:
#: ⚠️ **Une borne, parce que le paramètre vient du navigateur.** Sans elle, une adresse forgée
#: avec mille tickers ouvrirait mille connexions sortantes depuis notre serveur.
MAX_TICKERS = 200

#: Les fils employés pour combler les absents du cache.
#:
#: ⚠️ **Douze, comme le script du S&P 500, et pour la même raison.** Chaque appel est une attente
#: réseau, pas un calcul : le parallélisme paie jusqu'à ce que Yahoo commence à refuser. Douze a
#: été mesuré comme le point où le gain s'aplatit sans déclencher de limitation.
FILS = 12


#: La devise de cotation de chaque titre, et le taux de change vers le dollar.
#:
#: ⚠️ **Sans conversion, le classement est faux tout en paraissant juste — vu à l'écran.** Trié
#: sur les valeurs brutes, Toyota et HSBC passaient **devant Nvidia** : 38 400 milliards de yens
#: et 26 300 milliards de pence font de plus grands nombres que 5 250 milliards de dollars. Un
#: tri par taille qui range Toyota au-dessus de Nvidia n'est pas une limite, c'est une panne.
_devises: dict[str, str] = {}
_taux: dict[str, float] = {"USD": 1.0}


def _taux_vers_usd(devise: str) -> float | None:
    """
    Le taux de change d'une devise vers le dollar, mis en cache.

    ⚠️ **Les sous-unités sont à notre charge : `GBp` n'est pas `GBP`.** Londres cote en **pence**,
    Johannesburg en cents, Tel-Aviv en agorot. Yahoo rend pourtant le **même** taux pour
    `GBpUSD=X` que pour `GBPUSD=X` — mesuré, 1,3516 dans les deux cas. Se fier à lui multiplierait
    HSBC par cent. La convention est stable : un code dont la dernière lettre est **minuscule**
    désigne la centième partie de la devise majuscule.
    """
    if devise in _taux:
        return _taux[devise]
    majeure, diviseur = (devise.upper(), 100.0) if devise[-1:].islower() else (devise, 1.0)
    if majeure in _taux:
        _taux[devise] = _taux[majeure] / diviseur
        return _taux[devise]
    import yfinance as yf
    try:
        brut = getattr(yf.Ticker(f"{majeure}USD=X").fast_info, "last_price", None)
    except Exception:
        brut = None
    if not brut or brut <= 0:
        return None
    _taux[majeure] = float(brut)
    _taux[devise] = float(brut) / diviseur
    return _taux[devise]


def _capitalisations_sp500() -> dict[str, float]:
    """
    Les capitalisations déjà calculées par la carte de chaleur, en dollars.

    ⚠️ **On lit son cache sans jamais le remplir.** `carte()` déclenche un téléchargement de
    cinq cents titres quand il est froid ; l'appeler ici ferait payer dix secondes à une liste de
    suggestions. Chaud — ce qui est le cas dès le démarrage, un fil le préchauffe — la lecture est
    immédiate ; froid, on rend simplement un dictionnaire vide et l'appelant interroge Yahoo.
    """
    try:
        from app.services.chaleur import _cache
        connu = _cache.get("1j")
        if not connu:
            return {}
        titres = connu[1].get("titres") or []
        return {t["ticker"].upper(): float(t["capitalisation"])
                for t in titres if t.get("capitalisation")}
    except Exception:
        return {}


def _lire_une(symbole: str) -> None:
    """
    Interroge Yahoo pour un seul titre et alimente le cache partagé.

    ⚠️ **Trois grandeurs selon la famille, parce que Yahoo n'en expose pas une seule.** Mesuré :
    `fast_info.market_cap` rend la capitalisation des **actions** et rien d'autre ; les
    **cryptomonnaies** n'ont leur `marketCap` que dans `info` — 1 548 Md$ pour `BTC-USD` — et les
    **fonds** n'ont pas de capitalisation du tout mais un encours, `totalAssets`, 795 Md$ pour
    `SPY`. Un **indice** n'a ni l'un ni l'autre, et c'est correct : il ne vaut rien en soi.

    ⚠️ **`fast_info` d'abord, `info` seulement en secours.** Le premier lit un point d'entrée
    léger, le second télécharge une fiche de plusieurs dizaines de champs. Les actions — le gros
    du catalogue — sont servies par le chemin rapide ; le lourd n'est payé que par les cryptos et
    les fonds, et une seule fois grâce au cache.

    ⚠️ **Mêler capitalisation et encours dans un même classement est un arbitrage, pas une
    équivalence.** Les deux répondent à « quelle taille ? », qui est la question posée par un tri.
    Ils ne répondent pas à la même question comptable.
    """
    import yfinance as yf
    titre = yf.Ticker(symbole)

    cap = devise = None
    # ⚠️ **Deux `try` séparés, et ce n'est pas du zèle.** Un seul bloc autour des deux chemins
    # faisait sauter le second dès que le premier **levait** au lieu de rendre `None` — ce qui
    # arrive dès que Yahoo nous limite : `fast_info` lève alors `YFRateLimitError`. Le recours
    # à `info` n'était donc jamais atteint pour les cryptos ni les fonds, et l'absence de
    # capitalisation se lisait comme « cet actif n'en a pas » au lieu de « on n'a pas su lire ».
    try:
        rapide = titre.fast_info
        cap = getattr(rapide, "market_cap", None)
        devise = getattr(rapide, "currency", None)
    except Exception:
        cap = devise = None
    if not cap:
        try:
            fiche = titre.info
            cap = fiche.get("marketCap") or fiche.get("totalAssets")
            devise = devise or fiche.get("currency")
        except Exception:
            pass

    # ⚠️ Silencieux **par ticker**, jamais pour le lot : un symbole inconnu ne doit pas priver
    # les autres de leur réponse. L'absence se lit dans le résultat, qui ne le contiendra pas.
    if cap and cap > 0:
        update_mcap(symbole, cap)
        # ⚠️ La devise est retenue **à part** du montant : le cache de `rankings` est partagé avec
        # le rang affiché sur la fiche d'actif, qui range des valeurs natives. Y glisser des
        # dollars changerait sa signification pour tout le monde.
        if devise:
            _devises[symbole.upper()] = devise


def capitalisations(tickers: list[str]) -> dict[str, float]:
    """
    Les capitalisations connues pour ces tickers, en devise de cotation.

    ⚠️ **Les absents sont cherchés, puis rangés — l'appel suivant est gratuit.** Le premier
    affichage d'une catégorie paie donc le réseau, les suivants non.

    ⚠️ **Un ticker sans réponse est simplement absent du résultat, et ce n'est pas un échec.**
    Un fonds n'a pas de capitalisation boursière au sens strict, un indice non plus. L'appelant
    doit pouvoir les distinguer d'un zéro, qui les classerait au dernier rang comme s'ils
    valaient zéro.

    ⚠️ **Les montants sont rendus en **dollars**, convertis depuis la devise de cotation.** Sans
    cela le classement est faux tout en paraissant juste : trié sur les valeurs natives, Toyota
    passait devant Nvidia parce que 38 400 milliards de yens font un plus grand nombre que 5 250
    milliards de dollars. Les taux sont pris chez Yahoo et mis en cache par devise, donc payés
    une fois pour toute la place.
    """
    propres = [t.strip().upper() for t in tickers if t and t.strip()][:MAX_TICKERS]
    if not propres:
        return {}

    # ⚠️ **Un ticker dont on ignore la **devise** est aussi un manquant, même si son montant est
    # connu.** Le cache de `rankings` est alimenté par un préchargement qui range la
    # capitalisation sans la devise : `9984.T`, `SHEL.L`, `RIO.L` y figuraient donc en yens et en
    # pence, et mon repli « à défaut, du dollar » les laissait au sommet du classement. Vu à
    # l'écran après avoir cru le défaut corrigé. Supposer une devise, c'est refaire la faute
    # qu'on vient de réparer.
    # ⚠️ **La carte de chaleur est consultée d'abord, parce qu'elle a déjà la réponse.** Elle
    # tient en cache les 503 composants du S&P 500 avec leur capitalisation **en dollars**,
    # préchauffée au démarrage. C'est la famille la plus demandée par la palette, et la lire ici
    # coûte zéro appel réseau. Ne pas s'en servir revenait à redemander à Yahoo ce qu'on venait
    # de lui demander, et à s'exposer à sa limitation de débit pour rien.
    depuis_carte = _capitalisations_sp500()
    resultat: dict[str, float] = {t: depuis_carte[t] for t in propres if t in depuis_carte}

    reste = [t for t in propres if t not in resultat]
    manquants = [t for t in reste if get_market_cap(t) is None or t not in _devises]
    if manquants:
        with ThreadPoolExecutor(max_workers=FILS) as pool:
            list(pool.map(_lire_une, manquants))
        logger.info("Capitalisations : %d demandées, %d par la carte, %d cherchées",
                    len(propres), len(resultat), len(manquants))

    for t in reste:
        cap = get_market_cap(t)
        if cap is None:
            continue
        devise = _devises.get(t)
        # ⚠️ Devise inconnue, montant écarté : on ne peut pas comparer ce qu'on ne sait pas
        # exprimer dans la même unité. Le tri le rangera en fin de liste, ce qui est vrai.
        taux = _taux_vers_usd(devise) if devise else None
        # ⚠️ Une devise dont on ne sait pas le taux est **écartée**, pas convertie à un. La
        # laisser passer en natif reproduirait exactement le défaut qu'on vient de corriger.
        if taux is None:
            continue
        resultat[t] = cap * taux
    return resultat
