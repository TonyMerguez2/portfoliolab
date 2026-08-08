"""
Transactions & Positions — NOVAC backend.

Routes :
  POST   /api/v1/portfolios/{portfolio_id}/transactions
  GET    /api/v1/portfolios/{portfolio_id}/transactions
  DELETE /api/v1/portfolios/{portfolio_id}/transactions/{transaction_id}
  GET    /api/v1/portfolios/{portfolio_id}/positions

Auth : toutes les routes exigent un JWT valide via require_auth.
Ownership : les portefeuilles n'ont pas de user_id pour l'instant ; on vérifie
            seulement l'existence du portefeuille (l'ajout de user_id est non-destructif
            et peut être fait ultérieurement).
"""
from __future__ import annotations

import json
import logging
import os
import pathlib
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.core.database import get_db, Portfolio, Transaction
from app.core.auth import require_auth
from app.models.user import User
from app.utils.positions import (
    compute_positions,
    check_sell_feasible,
    check_delete_feasible,
    fetch_current_prices,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/portfolios", tags=["Transactions"])

VALID_SIDES      = {"BUY", "SELL"}
VALID_ASSET_TYPES = {"EQUITY", "ETF", "CRYPTOCURRENCY", "INDEX"}


# ── Schemas Pydantic ──────────────────────────────────────────────────────────

class TransactionCreate(BaseModel):
    ticker:      str
    asset_type:  str
    side:        str
    quantity:    float
    unit_price:  float
    fees:        float = 0.0
    executed_at: datetime
    note:        str | None = None

    @field_validator("side")
    @classmethod
    def validate_side(cls, v: str) -> str:
        v = v.upper()
        if v not in VALID_SIDES:
            raise ValueError(f"side doit être BUY ou SELL, reçu : {v!r}")
        return v

    @field_validator("asset_type")
    @classmethod
    def validate_asset_type(cls, v: str) -> str:
        v = v.upper()
        if v not in VALID_ASSET_TYPES:
            raise ValueError(f"asset_type invalide : {v!r}")
        return v

    @field_validator("quantity")
    @classmethod
    def validate_quantity(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("quantity doit être > 0")
        return v

    @field_validator("unit_price")
    @classmethod
    def validate_price(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("unit_price doit être > 0")
        return v

    @field_validator("fees")
    @classmethod
    def validate_fees(cls, v: float) -> float:
        if v < 0:
            raise ValueError("fees ne peut pas être négatif")
        return v


def _tx_to_dict(tx: Transaction) -> dict:
    return {
        "id":           tx.id,
        "portfolio_id": tx.portfolio_id,
        "ticker":       tx.ticker,
        "asset_type":   tx.asset_type,
        "side":         tx.side,
        "quantity":     tx.quantity,
        "unit_price":   tx.unit_price,
        "fees":         tx.fees,
        "total":        round(tx.quantity * tx.unit_price + (tx.fees or 0), 4),
        "executed_at":  tx.executed_at.isoformat(),
        "note":         tx.note,
        "created_at":   tx.created_at.isoformat(),
    }


def _get_portfolio_or_404(portfolio_id: str, db: Session, user=None) -> Portfolio:
    """
    Le portefeuille demandé, s'il appartient au compte.

    Celui d'autrui renvoie 404 plutôt que 403 : répondre « interdit »
    confirmerait son existence. `user_id` nul vise les portefeuilles d'avant
    les comptes, adoptés au premier chargement de la liste.
    """
    p = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Portefeuille introuvable")
    if user is not None and p.user_id is not None and p.user_id != getattr(user, "id", None):
        raise HTTPException(status_code=404, detail="Portefeuille introuvable")
    return p


# ── POST — créer une transaction ──────────────────────────────────────────────

@router.post("/{portfolio_id}/transactions", status_code=201)
def create_transaction(
    portfolio_id: str,
    data: TransactionCreate,
    db:   Session = Depends(get_db),
    user: User    = Depends(require_auth),
):
    _get_portfolio_or_404(portfolio_id, db, user)

    all_txs = (
        db.query(Transaction)
        .filter(Transaction.portfolio_id == portfolio_id)
        .all()
    )

    if data.side == "SELL":
        ok, msg = check_sell_feasible(all_txs, data.ticker, data.quantity, data.executed_at)
        if not ok:
            raise HTTPException(status_code=400, detail=msg)

    tx = Transaction(
        portfolio_id = portfolio_id,
        ticker       = data.ticker.upper(),
        asset_type   = data.asset_type,
        side         = data.side,
        quantity     = data.quantity,
        unit_price   = data.unit_price,
        fees         = data.fees,
        executed_at  = data.executed_at,
        note         = (data.note or "").strip() or None,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return _tx_to_dict(tx)


# ── GET — lister les transactions ─────────────────────────────────────────────

@router.get("/{portfolio_id}/transactions")
def list_transactions(
    portfolio_id: str,
    ticker:    Optional[str] = Query(None),
    side:      Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to:   Optional[datetime] = Query(None),
    db:        Session = Depends(get_db),
    user:      User    = Depends(require_auth),
):
    _get_portfolio_or_404(portfolio_id, db, user)

    q = db.query(Transaction).filter(Transaction.portfolio_id == portfolio_id)

    if ticker:
        q = q.filter(Transaction.ticker == ticker.upper())
    if side:
        s = side.upper()
        if s not in VALID_SIDES:
            raise HTTPException(status_code=400, detail=f"side invalide : {side!r}")
        q = q.filter(Transaction.side == s)
    if date_from:
        q = q.filter(Transaction.executed_at >= date_from)
    if date_to:
        q = q.filter(Transaction.executed_at <= date_to)

    txs = q.order_by(Transaction.executed_at.desc()).all()
    return [_tx_to_dict(t) for t in txs]


# ── DELETE — supprimer une transaction ────────────────────────────────────────

@router.delete("/{portfolio_id}/transactions/{transaction_id}")
def delete_transaction(
    portfolio_id:   str,
    transaction_id: int,
    db:             Session = Depends(get_db),
    user:           User    = Depends(require_auth),
):
    _get_portfolio_or_404(portfolio_id, db, user)

    tx = (
        db.query(Transaction)
        .filter(
            Transaction.id == transaction_id,
            Transaction.portfolio_id == portfolio_id,
        )
        .first()
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction introuvable")

    all_txs = (
        db.query(Transaction)
        .filter(Transaction.portfolio_id == portfolio_id)
        .all()
    )

    ok, msg = check_delete_feasible(all_txs, transaction_id)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)

    db.delete(tx)
    db.commit()
    return {"ok": True, "deleted_id": transaction_id}


# ── GET — positions calculées ─────────────────────────────────────────────────

@router.get("/{portfolio_id}/positions")
async def get_positions(
    portfolio_id: str,
    db:           Session = Depends(get_db),
    user:         User    = Depends(require_auth),
):
    """
    Retourne les positions calculées depuis les transactions, enrichies des prix actuels.

    Si le portefeuille n'a aucune transaction, retourne les positions en poids %
    sans P&L (compatibilité avec les portefeuilles legacy).
    """
    portfolio = _get_portfolio_or_404(portfolio_id, db, user)

    all_txs = (
        db.query(Transaction)
        .filter(Transaction.portfolio_id == portfolio_id)
        .all()
    )

    # ── Cas legacy : aucune transaction ──────────────────────────────────────
    if not all_txs:
        assets = portfolio.assets or []
        total  = portfolio.total_value
        items  = []
        for a in assets:
            val = (a["weight"] / 100 * total) if total else None
            items.append({
                "ticker":         a["ticker"],
                "quantity":       None,
                "avg_cost":       None,
                "invested":       None,
                "current_price":  None,
                "current_value":  val,
                "pnl_eur":        None,
                "pnl_pct":        None,
                "weight":         a["weight"],
                "source":         "weights",
            })
        return {
            "source":          "weights",
            "positions":       items,
            "total_value":     total,
            "total_invested":  None,
            "total_pnl_eur":   None,
            "total_pnl_pct":   None,
        }

    # ── Calcul positions depuis transactions ──────────────────────────────────
    pos_map = compute_positions(all_txs)
    tickers = list(pos_map.keys())

    prices = await fetch_current_prices(tickers)

    positions  = []
    total_val  = 0.0
    total_inv  = 0.0

    for ticker, pos in pos_map.items():
        price       = prices.get(ticker)
        qty         = pos["quantity"]
        avg_cost    = pos["avg_cost"]
        invested    = pos["invested"]
        cur_val     = round(qty * price, 4) if price else None
        pnl_eur     = round(cur_val - invested, 4) if cur_val is not None else None
        pnl_pct     = round((pnl_eur / invested) * 100, 2) if (pnl_eur is not None and invested > 0) else None

        if cur_val is not None:
            total_val += cur_val
        total_inv += invested

        positions.append({
            "ticker":        ticker,
            "quantity":      round(qty, 8),
            "avg_cost":      round(avg_cost, 4),
            "invested":      round(invested, 4),
            "current_price": round(price, 4) if price else None,
            "current_value": cur_val,
            "pnl_eur":       pnl_eur,
            "pnl_pct":       pnl_pct,
            "weight":        None,  # calculé après
            "source":        "transactions",
        })

    # Calcul des poids et total P&L
    for p in positions:
        p["weight"] = (
            round(p["current_value"] / total_val * 100, 2)
            if (p["current_value"] is not None and total_val > 0)
            else None
        )

    total_pnl_eur = round(total_val - total_inv, 4) if total_val else None
    total_pnl_pct = (
        round(total_pnl_eur / total_inv * 100, 2)
        if (total_pnl_eur is not None and total_inv > 0)
        else None
    )

    # Tri par valeur courante décroissante
    positions.sort(key=lambda p: p["current_value"] or 0, reverse=True)

    return {
        "source":         "transactions",
        "positions":      positions,
        "total_value":    round(total_val, 4),
        "total_invested": round(total_inv, 4),
        "total_pnl_eur":  total_pnl_eur,
        "total_pnl_pct":  total_pnl_pct,
    }


# ── GET — trajectoire réelle du portefeuille ──────────────────────────────────

# Fenêtres de téléchargement, généreuses : la courbe est ensuite coupée à la
# première transaction, qui commande le vrai début.
# Repère de comparaison : le S&P 500, via son ETF le plus liquide.
_BENCHMARK = "SPY"

# Fourchette réelle des frais courants annuels, en pourcentage. Voir `_pct_frais`.
_FRAIS_MIN, _FRAIS_MAX = 0.03, 3.0

# `None` vaut « depuis la première transaction ».
#
# La clé « 1d » manquait, alors que les deux appelants l'envoient : le bandeau
# du tableau de bord et le graphique de performance traduisent tous deux « 24h »
# ainsi. Comme la lecture se faisait par `.get`, la clé absente rendait `None`
# — c'est-à-dire précisément le sentinelle de « tout l'historique ». Choisir
# 24h affichait donc le gain depuis l'origine, sous une étiquette qui disait
# autre chose, et sans rien signaler.
_HISTO_JOURS = {
    "1d": 1, "7d": 7, "1mo": 31, "3mo": 92, "6mo": 183,
    "1y": 366, "3y": 1096, "max": None,
}


def _pas_intraday(jours: int) -> str | None:
    """
    Le pas de barre pour une fenêtre de tant de jours, ou None pour les clôtures.

    ⚠️ **Indexé sur la durée réelle de la fenêtre, pas sur le nom de la
    période.** Une table par nom — « 1y » → horaire, « max » → clôtures — se
    trompe dès que le portefeuille est jeune : celui sur lequel ceci a été réglé
    n'a que six mois d'existence, si bien que ses fenêtres « 1 A », « 3 A » et
    « Max » couvrent toutes six mois. Elles méritent le pas horaire, et la table
    par nom le leur refusait pour une raison qui n'existait pas.

    Les seuils de Yahoo — une minute sur sept jours, quinze minutes sur soixante,
    une heure sur deux ans — permettraient d'aller bien plus loin. Ce n'est pas
    eux qui bornent ici, c'est le graphique.

    ⚠️ **Au-delà d'un mois, l'intraday nuit.** Essayé sur toute l'étendue, puis
    retiré, pour deux raisons mesurées sur la fenêtre « Max » de ce portefeuille :

    **L'axe devient indéchiffrable.** Avec des horodatages intraday,
    lightweight-charts n'étiquette plus que le jour du mois. Sur six mois de
    données, l'axe affichait « 17, 21, 23, 27, 29, 30 » sans jamais nommer le
    mois — deux captures au même réglage devenaient impossibles à situer. Le
    tracé journalier, lui, fait afficher les mois.

    **Le zoom change la nature de la courbe.** 1 133 points horaires au lieu de
    125 clôtures : en zoomant on découvre l'agitation intra-journalière, et comme
    l'axe vertical se recale sur ce qui est visible, la courbe paraît toute autre.
    Cette série va de 29 € — la première part achetée — à 3 453 €, avec un saut
    de 1 057 € au versement du 9 juin ; deux ordres de grandeur que l'échelle
    automatique ne peut pas tenir sans se recaler brutalement.

    Rien de tout cela ne se voyait sur les fenêtres courtes : à un mois, l'écart
    de valeur reste étroit et le jour du mois suffit à situer un point.
    """
    if jours <= 2:
        return "1m"
    if jours <= 31:
        return "15m"
    return None


def _points_intraday(tickers: list[str], txs: list, period: str, depart) -> list[dict]:
    """
    Les vingt-quatre dernières heures en barres d'une minute.

    Cette route ne connaissait que des clôtures journalières, si bien que sa
    fenêtre d'un jour n'avait que deux points à rendre — la veille et le jour.
    Mesuré sur un portefeuille réel à 15 h 08 : 2 points, donc un segment de
    droite.

    ⚠️ **La fenêtre est glissante, en heures d'horloge, et non « la séance
    courante ».** C'est la correction d'une première version qui bornait au
    dernier cours de la veille : à 15 h 35, la séance parisienne du jour ne
    comptait que 25 minutes de données livrées, donc 3 points, alors que la page
    graphique affichait la même journée bien remplie. Elle ne fait rien d'autre
    que compter en heures : sur 24 heures glissantes, l'essentiel de ce qu'on
    voit est la séance de la veille, et c'est très bien — c'est ce qu'il s'est
    passé.

    ⚠️ **Une minute, pas quinze.** Relevé au même instant sur ESE.PA : 21 barres
    livrées aujourd'hui en 1 min, 6 en 5 min, 2 en 15 min, 1 en 60 min. Le pas
    grossier ne perd pas seulement en finesse, il perd la fin de la journée —
    une barre de quinze minutes n'existe qu'une fois révolue.

    ⚠️ **Le `dropna()` est appliqué à une Series, pas à un tableau.** Sur un
    tableau il supprime toute ligne où un seul titre manque — c'est l'intersection,
    et c'est le défaut qui vide la courbe de `/portfolio-history`. Sur une Series
    il ne retire que les trous du titre concerné, et l'union se reconstruit
    ensuite : voir `courbe_intraday`.

    Rend une liste vide à la moindre difficulté. L'appelant garde alors ses deux
    points journaliers, qui sont pauvres mais justes.
    """
    from datetime import datetime as _dt, timedelta as _td, timezone as _tz

    import pandas as pd
    import yfinance as yf

    from app.services.portfolio_history import courbe_intraday

    jours = (_dt.now(_tz.utc).date() - depart).days
    pas = _pas_intraday(max(1, jours))
    if pas is None:
        return []

    # Un jour de marge avant la fenêtre : c'est lui qui donne à chaque titre un
    # cours de référence avant le premier point rendu. Sans lui, un titre qui
    # n'imprime qu'en cours de matinée ferait sauter les premiers instants.
    debut = depart - _td(days=1)

    try:
        brut = yf.download(tickers, start=debut, interval=pas,
                           progress=False, auto_adjust=True)["Close"]
    except Exception as exc:                                  # pragma: no cover
        logger.warning("history intraday: téléchargement refusé (%s)", exc)
        return []

    if brut is None or len(brut) == 0:
        return []
    if isinstance(brut, pd.Series):
        brut = brut.to_frame(tickers[0])

    cours: dict[str, dict] = {}
    for tk in tickers:
        if tk not in brut:
            continue
        serie = brut[tk].dropna()
        if len(serie):
            cours[tk] = {i.to_pydatetime(): float(v) for i, v in serie.items()}
    if not cours:
        return []

    instants = sorted({i for m in cours.values() for i in m})

    # « 24 h » se compte en heures d'horloge, les autres fenêtres en jours.
    #
    # C'est la correction d'une version qui bornait au dernier cours de la veille,
    # donc à la séance courante : à 15 h 35, la séance parisienne du jour ne
    # comptait que 25 minutes de données livrées — 3 points, quand la page
    # graphique montrait la même journée bien remplie. Sur 24 heures glissantes,
    # l'essentiel de ce qu'on voit est la séance de la veille, et c'est très bien :
    # c'est ce qu'il s'est passé.
    depuis = (_dt.now(_tz.utc) - _td(hours=24)) if period == "1d" else _dt(
        depart.year, depart.month, depart.day, tzinfo=_tz.utc)

    ops = [
        {"ticker": t.ticker, "side": t.side, "quantity": t.quantity,
         "unit_price": t.unit_price, "fees": t.fees or 0.0, "executed_at": t.executed_at}
        for t in txs
    ]
    pts = courbe_intraday(ops, cours, instants, depuis=depuis)
    if not pts:
        return []

    # ⚠️ Contrôle de couverture, et il ne se déduit pas de la documentation.
    #
    # Yahoo annonce le pas horaire sur deux ans ; mesuré sur ces titres, il ne
    # remonte qu'à six mois. La fenêtre d'un an rendait donc 1 131 points —
    # exactement le compte de la fenêtre de six mois — et une courbe qui couvrait
    # la moitié de la période en se présentant comme un an.
    #
    # Compter les points ne suffit pas à s'en apercevoir : 1 131 est bien plus
    # que les ~250 clôtures, donc le garde-fou du nombre laissait passer. C'est
    # la date du premier point qu'il faut regarder. Trois jours de tolérance pour
    # les fins de semaine et les jours fériés.
    premier = _dt.fromisoformat(pts[0]["date"])
    if premier.tzinfo is not None:
        premier = premier.astimezone(_tz.utc)
    else:
        premier = premier.replace(tzinfo=_tz.utc)
    if premier > depuis + _td(days=3):
        logger.info("history intraday: couverture trop courte pour %s (%s > %s)",
                    period, premier.date(), (depuis + _td(days=3)).date())
        return []
    return pts


@router.get("/{portfolio_id}/history")
async def get_history(
    portfolio_id: str,
    period:       str     = Query("max"),
    db:           Session = Depends(get_db),
    user:         User    = Depends(require_auth),
):
    """
    Valeur du portefeuille au fil du temps, d'après ses transactions.

    À distinguer de `/portfolio-history`, qui simule un achat-conservation aux
    pondérations courantes : celui-ci suit les quantités réellement détenues et
    part de la première opération. Un PEA ouvert en février affichait sinon la
    performance des fonds depuis leur création — « +371 % sur tout l'historique »
    sur six mois de détention.
    """
    from datetime import date, timedelta

    import yfinance as yf

    from app.services.portfolio_history import (courbe_portefeuille, twr_sur_fenetre,
                                                dietz_sur_fenetre, simuler_benchmark)

    _get_portfolio_or_404(portfolio_id, db, user)

    txs = (
        db.query(Transaction)
        .filter(Transaction.portfolio_id == portfolio_id)
        .order_by(Transaction.executed_at.asc())
        .all()
    )
    if not txs:
        return {"points": [], "start": None, "twr_pct": None, "pnl_eur": None, "source": "aucune"}

    debut_reel = min(t.executed_at for t in txs).date()
    # Refuser une période inconnue plutôt que la traiter comme « max ». C'est
    # ce repli silencieux qui a laissé « 1d » se comporter en « max » sans que
    # rien ne le dise ; une faute de frappe dans un appel doit se voir.
    if period not in _HISTO_JOURS:
        raise HTTPException(
            status_code=400,
            detail=f"Période inconnue : « {period} ». Attendu : "
                   + ", ".join(_HISTO_JOURS),
        )
    jours = _HISTO_JOURS[period]
    depart = debut_reel if jours is None else max(debut_reel, date.today() - timedelta(days=jours))

    tickers = sorted({t.ticker for t in txs})
    # Le repère est téléchargé avec le reste, sur la même fenêtre : le mesurer
    # séparément revenait à comparer six mois de détention aux trente ans du
    # S&P 500, soit « vs S&P 500 −2 500 % ».
    a_charger = tickers + [_BENCHMARK]
    try:
        brut = yf.download(
            a_charger, start=debut_reel - timedelta(days=7),
            progress=False, auto_adjust=True, threads=True,
        )["Close"]
    except Exception as exc:                                  # pragma: no cover
        logger.error("history download failed: %s", exc)
        return {"points": [], "start": debut_reel.isoformat(), "twr_pct": None, "pnl_eur": None}

    if brut is None or len(brut) == 0:                        # pragma: no cover
        return {"points": [], "start": debut_reel.isoformat(), "twr_pct": None, "pnl_eur": None}

    # yfinance rend une Series pour un ticker unique, un DataFrame au-delà.
    if len(a_charger) == 1:
        brut = brut.to_frame(a_charger[0])

    cours: dict[str, dict] = {}
    for tk in tickers:
        if tk not in brut:
            continue
        serie = brut[tk].dropna()
        cours[tk] = {idx.date(): float(v) for idx, v in serie.items()}

    calendrier = sorted({j for m in cours.values() for j in m})
    resultat = courbe_portefeuille(
        [
            {
                "ticker":      t.ticker,
                "side":        t.side,
                "quantity":    t.quantity,
                "unit_price":  t.unit_price,
                "fees":        t.fees or 0.0,
                "executed_at": t.executed_at,
            }
            for t in txs
        ],
        cours,
        calendrier,
    )

    # « 24h » se compte d'une séance à l'autre, pas d'un jour calendaire à
    # l'autre.
    #
    # Retrancher un jour à la date du jour tombe un dimanche sur un lundi, un
    # jour férié la veille d'un pont, ou simplement un jour sans cotation pour
    # les places concernées. La fenêtre ne retenait alors qu'un seul point, et
    # une mesure de variation qui n'a qu'une borne ne mesure rien : le gain
    # sortait à zéro et la comparaison au repère disparaissait de l'écran.
    #
    # L'avant-dernier point de la courbe est la veille au sens boursier, qui
    # est le seul sens utile ici.
    if period == "1d" and len(resultat["points"]) >= 2:
        depart = date.fromisoformat(resultat["points"][-2]["date"])

    # Le TWR suit la fenêtre demandée ; le P&L reste celui de la détention
    # entière, un « gain sur trois mois » n'ayant pas de sens en euros quand des
    # versements ont eu lieu entre-temps.
    resultat["twr_pct"] = twr_sur_fenetre(resultat["points"], depart.isoformat())
    # Ce que l'argent de l'épargnant a rapporté sur la fenêtre — la question
    # qu'on se pose devant son relevé, distincte du comportement des fonds.
    gain = dietz_sur_fenetre(resultat["points"], depart.isoformat())
    resultat["gain_eur"] = gain["gain_eur"]
    resultat["gain_pct"] = gain["gain_pct"]
    resultat["taux_pct"] = gain["taux_pct"]
    # Les points complets (flux compris) servent encore à la simulation du
    # repère ; ceux renvoyés au client en sont allégés.
    points_complets = resultat["points"]
    dernier_jour = points_complets[-1]["date"] if points_complets else depart.isoformat()
    resultat["points"] = [
        {k: v for k, v in p.items() if k not in ("ret", "flow")}
        for p in points_complets if p["date"] >= depart.isoformat()
    ]
    # Un titre détenu sans cours rend la courbe fausse, pas incomplète : sa
    # valeur manque à chaque point. Mieux vaut refuser que montrer une perte
    # qui n'existe pas — un téléchargement partiel affichait 1 568 € sur un
    # portefeuille de 5 134 €.
    if resultat.get("sans_cours"):
        logger.warning("history: cours indisponibles pour %s", resultat["sans_cours"])
        return {
            "points": [], "start": resultat.get("start"),
            "twr_pct": None, "pnl_eur": None, "gain_eur": None, "gain_pct": None,
            "source": "incomplet", "sans_cours": resultat["sans_cours"],
        }

    resultat["source"] = "transactions"

    # La courbe passe en barres intraday là où `_PAS_INTRADAY` en prévoit une.
    #
    # Les chiffres, eux, restent journaliers : TWR, Dietz et repère sont calculés
    # au-dessus sur les clôtures, et c'est délibéré. Un rendement qui changerait
    # de valeur selon la finesse du tracé serait plus déroutant qu'utile — la
    # bande de tête annonce une performance de période, pas de barre.
    #
    # Le remplacement n'a lieu que s'il apporte quelque chose : au moins trois
    # points, et plus que ce que les clôtures donnaient déjà. Sinon la courbe
    # journalière est plus pauvre mais aussi juste, et c'est elle qu'on garde.
    intra = _points_intraday(tickers, txs, period, depart)
    if len(intra) >= 3 and len(intra) > len(resultat["points"]):
        resultat["points"] = intra

    # Le repère, rejoué avec les mêmes versements aux mêmes dates.
    #
    # Opposer deux pourcentages laisse ouvert ce que l'épargnant aurait
    # réellement eu : « mes fonds +9 %, l'indice +8 % » ne dit pas combien
    # d'euros séparent les deux. Rejouer les flux répond en euros, sur le même
    # calendrier et avec le même étalement.
    resultat["benchmark"] = _BENCHMARK
    resultat["benchmark_pct"] = None
    resultat["benchmark_sim"] = {"value": None, "gain_eur": None, "gain_pct": None}
    if _BENCHMARK in brut:
        serie = brut[_BENCHMARK].dropna()
        cours_repere = {i.date(): float(v) for i, v in serie.items()}
        resultat["benchmark_sim"] = simuler_benchmark(points_complets, cours_repere, depart.isoformat())

        bornes = [
            v for d, v in sorted(cours_repere.items())
            if depart.isoformat() <= d.isoformat() <= dernier_jour
        ]
        if len(bornes) >= 2 and bornes[0] > 0:
            resultat["benchmark_pct"] = round((bornes[-1] / bornes[0] - 1.0) * 100, 4)

    return resultat


# ── GET — analyse du portefeuille ─────────────────────────────────────────────

# Détails par ticker : secteurs internes, devise, classes d'actifs, TER.
# Un appel yfinance par titre coûte plusieurs secondes et le fournisseur limite
# le débit ; le cache évite de les refaire à chaque ouverture de l'onglet.
_CACHE_DETAILS: dict[str, tuple[float, dict]] = {}

# ⚠️ Trente jours, et non six heures.
#
# Six heures signifiait rechercher chaque fiche **quatre fois par jour**, et c'est
# précisément ce qui déclenchait la limitation de débit du fournisseur — laquelle
# faisait disparaître la diversification du score. Le remède était la cause.
#
# Or rien ici ne bouge à l'échelle de la journée : la devise de cotation et le nom
# ne changent jamais, le secteur d'une action pratiquement jamais, le TER au plus
# une fois l'an, et la ventilation sectorielle d'un fonds est publiée mensuellement
# ou trimestriellement. Une fiche de la veille est aussi juste qu'une fiche de
# l'instant.
#
# Le seul champ qui variait vraiment d'un jour à l'autre était le volume moyen, qui
# servait à la liquidité — facteur supprimé à l'audit parce qu'il valait cent pour
# toute position de particulier. Il ne reste donc plus rien qui justifie un cache
# court, et le volume n'est même plus lu.
#
# Conséquence voulue : après **une** lecture réussie, la transparence des fonds est
# acquise pour un mois, elle survit aux redémarrages par le fichier sur disque, et
# une panne du fournisseur ne peut plus effacer un facteur du score.
_TTL_DETAILS = 30 * 24 * 3600

# ⚠️ Un ratage ne se garde pas six heures.
#
# Le cache retenait indistinctement les succès et les échecs. Un seul appel limité
# par le fournisseur — ce qui arrive plusieurs fois par jour — et la transparence
# restait indisponible jusqu'au soir : la diversification affichait « non mesuré »
# pour le reste de la journée, sans que rien ne distingue ce cas d'un portefeuille
# réellement inanalysable. Quatre-vingt-dix secondes suffisent à ne pas marteler
# l'API tout en se rétablissant au rechargement suivant.
_TTL_DETAILS_ECHEC = 90

# ⚠️ Le cache vit aussi sur **disque**, et pas seulement en mémoire du serveur.
#
# Observé pendant l'audit : `uvicorn --reload` redémarre le processus à chaque
# fichier enregistré, ce qui vidait le cache. Toute la transparence des fonds était
# donc reperdue à chaque modification de code, et la diversification retombait à
# « Transparence indisponible » jusqu'à ce que le fournisseur réponde de nouveau —
# ce qu'il refuse justement de faire quand on vient de l'interroger en boucle. Les
# deux effets se combinaient pour effacer un facteur du score sans qu'aucun bug
# n'existe.
#
# Un secteur ou une classe d'actifs ne changent pas d'un jour à l'autre : c'est
# exactement la donnée qui gagne à survivre au processus. Le fichier reste un
# cache — perdu, il se reconstruit — donc aucune lecture n'en dépend pour être
# correcte, seulement pour être rapide.
_FICHIER_CACHE = pathlib.Path(__file__).resolve().parents[3] / ".cache_details.json"

# Version du **format** d'une fiche. À incrémenter dès qu'on ajoute ou renomme un
# champ lu par l'analyse.
#
# ⚠️ Sans elle, un cache de trente jours rend une évolution invisible pendant un
# mois. Observé : le champ `hhi` — la concentration interne d'un fonds, ajoutée pour
# la concentration en transparence — n'apparaissait pas, parce que les fiches
# enregistrées la veille ne le portaient pas et restaient valides. Le facteur
# affichait « composition non publiée » pour des fonds qui la publient
# parfaitement, et rien ne distinguait ce cas d'une vraie absence.
#
# C'est la contrepartie exacte du gain de la longue durée de vie : plus le cache
# tient, plus il faut un moyen de le déclarer périmé autrement que par le temps.
_VERSION_FICHE = 5


def _charger_cache_details() -> None:
    """
    Relit le cache de disque dès que le fichier a changé de date.

    ⚠️ Relire à chaque changement, et non **une seule fois** au démarrage.

    La première version chargeait une fois par processus. Observé aussitôt : le
    serveur avait déjà servi une analyse — donc déjà chargé un fichier inexistant —
    quand le cache a été écrit par un autre processus. Il ne l'a jamais relu, la
    diversification est restée « — » et la note s'est calculée sur quatre facteurs
    au lieu de cinq, affichant 75 au lieu de 73.

    Le même défaut existerait en production : plusieurs workers, chacun avec sa
    mémoire, chacun n'ayant lu le fichier qu'à son démarrage. Celui qui démarre
    avant que le voisin ne l'écrive ne le verrait jamais. Comparer la date de
    modification coûte un `stat` par appel et supprime le problème pour tous.

    Tolérant par construction : un fichier absent, tronqué ou écrit par une version
    antérieure du code ne doit pas empêcher l'analyse de répondre. On repart alors
    d'un cache vide, ce qui est le comportement d'avant.
    """
    global _CACHE_MTIME
    try:
        mtime = _FICHIER_CACHE.stat().st_mtime
    except OSError:
        # Pas de fichier : rien à charger, et rien à signaler — c'est le cas normal
        # au premier démarrage.
        return
    if _CACHE_MTIME is not None and mtime <= _CACHE_MTIME:
        return
    _CACHE_MTIME = mtime
    try:
        brut = json.loads(_FICHIER_CACHE.read_text(encoding="utf-8"))
        if not isinstance(brut, dict):
            return
        # ⚠️ Un fichier d'une version antérieure est **périmé, pas jeté**.
        #
        # La première version l'ignorait entièrement. C'était une faute, et elle a
        # coûté cher : en passant la version de 2 à 3 pour ajouter un seul champ, j'ai
        # fait disparaître des ventilations sectorielles et géographiques encore
        # parfaitement valides — et le fournisseur limitant le débit à ce moment-là,
        # trois facteurs du score sont restés sans note. Jeter une donnée juste pour
        # en obtenir une de plus est un mauvais échange.
        #
        # Les fiches sont donc chargées avec une échéance dépassée : `_details_titre`
        # tentera une lecture fraîche, et si elle échoue il gardera l'ancienne, qui
        # porte déjà tout sauf le champ nouveau. C'est le mécanisme de repli qui
        # existait, il suffisait de ne pas le court-circuiter.
        perime = brut.get("version") != _VERSION_FICHE
        fiches = brut.get("fiches") if "fiches" in brut else brut
        for ticker, entree in (fiches or {}).items():
            if not isinstance(entree, (list, tuple)) or len(entree) != 2:
                continue
            echeance, d = entree
            if perime:
                echeance = 0.0
            if isinstance(ticker, str) and isinstance(d, dict):
                # ⚠️ La mémoire ne perd pas au profit du disque : une fiche lue à
                # l'instant par ce processus vaut mieux qu'une version enregistrée
                # par un autre, éventuellement plus ancienne.
                ancienne = _CACHE_DETAILS.get(ticker)
                if ancienne is None or ancienne[0] <= float(echeance):
                    _CACHE_DETAILS[ticker] = (float(echeance), d)
    except Exception as exc:
        logger.warning("cache de détails illisible, on repart à vide : %s", exc)


def _ecrire_cache_details() -> None:
    """
    Écrit le cache sur disque, par un fichier temporaire puis un remplacement.

    ⚠️ L'écriture directe laisserait un JSON tronqué si le processus s'arrête au
    milieu — et `--reload` l'arrête souvent. `os.replace` est atomique : le fichier
    est soit l'ancien, soit le nouveau, jamais un mélange des deux.
    """
    try:
        tmp = _FICHIER_CACHE.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(
            {"version": _VERSION_FICHE,
             "fiches": {t: [e, d] for t, (e, d) in _CACHE_DETAILS.items()}},
            ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, _FICHIER_CACHE)
        # On note la date qu'on vient d'écrire, pour ne pas se relire soi-même au
        # prochain appel — la mémoire est déjà à jour.
        global _CACHE_MTIME
        _CACHE_MTIME = _FICHIER_CACHE.stat().st_mtime
    except Exception as exc:                                  # pragma: no cover
        # Un cache qu'on n'arrive pas à écrire reste un cache : on continue.
        logger.warning("cache de détails non écrit : %s", exc)


# Date de modification du fichier lors de la dernière lecture. `None` tant qu'on
# n'a rien lu, ce qui force une première tentative.
_CACHE_MTIME: float | None = None


def _frais_connus(details: dict[str, dict], declares) -> dict[str, float]:
    """
    Les frais courants par ligne : ceux du fournisseur, ceux saisis par-dessus.

    ⚠️ La saisie de l'épargnant **prime** sur le fournisseur, et ce n'est pas de la
    complaisance. Le TER dépend de la part détenue — capitalisante ou distribuante,
    couverte ou non, institutionnelle ou grand public — et le fournisseur en donne
    une seule pour un ticker. Le document d'information clé que l'épargnant a sous
    les yeux décrit exactement sa part.

    Sans cette saisie, le facteur reste muet pour la plupart des portefeuilles
    européens : mesuré sur un vrai PEA, un seul des trois fonds annonçait son TER,
    soit 10 % du portefeuille — sous le seuil de couverture de soixante pour cent.
    """
    connus = {t: d["frais"] for t, d in details.items()
              if (d or {}).get("frais") is not None}
    for ticker, valeur in (declares or {}).items():
        try:
            connus[str(ticker).upper()] = float(valeur)
        except (TypeError, ValueError):
            # Une valeur illisible en base — écrite par une version antérieure — est
            # ignorée plutôt que propagée dans la moyenne.
            continue
    return connus


def _courtage_paye(txs) -> float | None:
    """
    Les commissions payées, en pourcentage des montants achetés.

    Rapportées aux achats et non à la valeur actuelle : une commission se paie au
    passage de l'ordre, sur le montant de l'ordre. La rapporter à un encours qui a
    depuis monté flatterait le chiffre.

    Rend `None` si rien n'a été acheté — il n'y a alors pas de base — mais rend
    bien zéro si des achats existent sans frais : « aucun frais » est une
    information, pas une absence de mesure.
    """
    brut = frais = 0.0
    for t in txs:
        if (t.side or "").upper() != "BUY":
            continue
        brut += (t.quantity or 0.0) * (t.unit_price or 0.0)
        frais += t.fees or 0.0
    if brut <= 0:
        return None
    return frais / brut * 100.0


def _pct_frais(brut) -> float | None:
    """
    Les frais courants en **pourcentage par an**, ou `None` si le chiffre n'est
    pas crédible.

    ⚠️ Yahoo n'annonce pas son unité, et se tromper d'un facteur cent sur des
    frais fausserait tout le score. Les positions d'actifs du même endpoint sont
    des fractions, donc on lit d'abord une fraction : 0,0007 devient 0,07 %.

    Le garde-fou est la vraie fourchette du marché — de 0,03 % pour un tracker
    large à 3 % pour un fonds actif. Une valeur qui n'y entre par aucune des deux
    lectures est refusée : le facteur vaut alors « non mesuré », ce que la moyenne
    ignore, plutôt que d'afficher un chiffre faux.

    L'ordre des lectures compte dans la zone commune : 0,02 vaut 2 % en fraction
    et 0,02 % en pourcentage. Un TER de 0,02 % n'existe pas — les moins chers sont
    à 0,03 % — alors qu'un fonds à 2 % est banal. La fraction gagne donc.

    ⚠️ Un **zéro est refusé**, et ce n'est pas un détail de bord. Le fournisseur
    annonce un TER de `0.0` pour certains fonds — relevé sur ESE.PA et ETZ.PA, dont
    les frais réels tournent autour de 0,12 % et 0,20 %. Ce n'est pas une donnée
    absente mais une donnée **fausse**, et sans ce refus les frais se seraient
    affichés à 0,00 % par an avec une note de cent : la note la plus flatteuse
    possible, sur un chiffre inventé. Le facteur préfère se taire.
    """
    if brut is None:
        return None
    try:
        v = float(brut)
    except (TypeError, ValueError):
        return None
    if v <= 0:
        return None
    for lecture in (v * 100.0, v):
        if _FRAIS_MIN <= lecture <= _FRAIS_MAX:
            return lecture
    return None


# Composition de repli, par indice suivi.
#
# ⚠️ Un ETF **synthétique** ne publie aucune composition : il détient un contrat
# d'échange, pas des actions. Or son exposition économique est celle de l'indice, et
# un ETF **physique** sur le même indice, lui, publie la sienne. La lire là revient
# donc à lire la bonne chose — ce n'est pas un pis-aller mais la mesure de
# l'exposition réelle.
#
# Mesuré : `top_holdings` est vide pour ESE.PA et CW8.PA — BNP et Amundi, éligibles
# au PEA, donc synthétiques — et renseigné pour IWDA.AS, VT, QQQ et XLK.
#
# ⚠️ Plusieurs candidats par indice, essayés dans l'ordre, et **c'est l'exécution qui
# tranche** : le premier qui publie gagne, aucun ne publie et la ligne reste non
# mesurée. Rien ici n'affirme qu'un fonds donné publie sa composition — une telle
# affirmation vieillirait mal, et je n'ai pas pu la vérifier pour tous.
#
# ⚠️ La table ne contient que des indices **larges et identifiés sans ambiguïté**, et
# l'omission est délibérée. Associer un indice étroit à un proxy large serait
# l'erreur grave : un fonds de trente valeurs obtiendrait la note d'un fonds de cinq
# cents. Le Euro Stoxx 50, le CAC 40 et les indices sectoriels n'y figurent donc pas
# — et ces fonds-là sont généralement physiques, donc lisibles directement.
#
# À l'inverse, une imprécision entre deux indices larges est sans conséquence sur la
# note : la cible est de vingt sociétés, et qu'un indice régional en pèse 80 ou 120 le
# score vaut cent dans les deux cas.
#
# L'ordre compte : les motifs les plus précis passent devant, comme pour `ZONES`.
PROXY_COMPOSITION: list[tuple[str, tuple[str, ...]]] = [
    ("nasdaq 100",      ("QQQ",)),
    ("nasdaq",          ("QQQ",)),
    ("s&p 500",         ("CSPX.AS", "VOO", "SPY")),
    ("s&p500",          ("CSPX.AS", "VOO", "SPY")),
    ("msci usa",        ("CSPX.AS", "VOO")),
    ("msci world",      ("IWDA.AS", "URTH")),
    ("pea monde",       ("IWDA.AS", "URTH")),
    ("stoxx europe 600", ("EXSA.DE", "IEUR")),
    ("stoxx europe",    ("EXSA.DE", "IEUR")),
    ("msci europe",     ("IMEU.AS", "IEV")),
    ("emerging asia",   ("EIMI.AS", "IEMG")),
    ("msci emerging",   ("EIMI.AS", "IEMG")),
    ("emerging markets", ("EIMI.AS", "IEMG")),
    ("asie pacifique",  ("CPXJ.AS", "IPAC")),
    ("asia pacific",    ("CPXJ.AS", "IPAC")),
    ("msci pacific",    ("CPXJ.AS", "IPAC")),
]

# Préfixe réservé aux entrées de proxy dans le cache des fiches.
#
# ⚠️ Sans lui, la composition d'un indice serait rangée sous le ticker du fonds qui
# la publie — et un utilisateur détenant réellement ce fonds recevrait une fiche
# amputée de ses secteurs et de son nom. Un préfixe impossible dans un ticker évite
# la collision.
_CLE_PROXY = "@proxy:"


def _hhi_de_l_indice(nom: str | None) -> float | None:
    """
    La concentration interne de l'indice suivi, lue chez un ETF physique.

    Sert aux fonds qui ne publient pas de composition. Rend `None` si l'indice n'est
    pas reconnu ou si aucun candidat ne publie : la ligne reste alors non mesurée,
    plutôt que de recevoir une valeur devinée.
    """
    import time

    import yfinance as yf

    if not nom:
        return None
    n = nom.lower().replace("é", "e").replace("è", "e")
    candidats: tuple[str, ...] = ()
    for motif, tickers in PROXY_COMPOSITION:
        if motif in n:
            candidats = tickers
            break
    if not candidats:
        return None

    for proxy in candidats:
        cle = _CLE_PROXY + proxy
        entree = _CACHE_DETAILS.get(cle)
        if entree and time.time() < entree[0]:
            valeur = entree[1].get("hhi")
            if valeur:
                return float(valeur)
            continue
        try:
            hhi, abouti = _hhi_du_fonds(yf.Ticker(proxy).funds_data)
        except Exception:                                     # pragma: no cover
            hhi, abouti = None, False
        # Une lecture qui n'a pas abouti ne se garde pas longtemps : le prochain
        # appel réessaiera plutôt que de figer l'indice comme illisible.
        _CACHE_DETAILS[cle] = (
            time.time() + (_TTL_DETAILS if abouti else _TTL_DETAILS_ECHEC),
            {"hhi": hhi},
        )
        if hhi:
            _ecrire_cache_details()
            return hhi
    return None


def _hhi_du_fonds(fd) -> tuple[float | None, bool]:
    """
    La concentration interne d'un fonds, d'après sa composition publiée.

    L'indice de Herfindahl de ses lignes : son inverse se lit comme un nombre de
    sociétés équipondérées. Il alimente la concentration en transparence, dont la
    formule est Σ Wᵢ² · HHIᵢ — voir `analyse.py`.

    ⚠️ Calculé sur les **dix premières lignes** seulement, seule composition que le
    fournisseur publie. C'est donc un **minorant** du HHI, donc un majorant du
    nombre de sociétés : la mesure est optimiste, jamais pessimiste, et il faut le
    savoir en la lisant.

    L'erreur est petite dans les deux régimes, ce qui rend l'approximation
    acceptable. Pour un fonds large la queue est faite de milliers de poids
    minuscules dont les carrés sont négligeables — sur VT, les dix premières lignes
    pèsent 20,5 % et la queue ajoute moins d'un dix-millième au HHI. Pour un fonds
    concentré ce sont au contraire les dix premières qui dominent — sur XLK elles
    pèsent 61 %, et la queue n'ajoute qu'environ cinq pour cent du HHI. Estimer
    cette queue demanderait de connaître le nombre de lignes restantes, que le
    fournisseur ne donne pas : ce serait inventer la donnée plutôt que la borner.

    ⚠️ Rend un couple `(hhi, abouti)`, et la distinction est nécessaire.

    `(None, True)` signifie « rien n'est publié » — le cas d'un fonds
    **synthétique**, qui ne détient pas d'actions mais un contrat d'échange. C'est un
    constat définitif, pas un manque de la source.

    `(None, False)` signifie « la lecture n'a pas abouti », par exemple sous
    limitation de débit du fournisseur. Sans cette distinction, les deux cas se
    confondaient en un simple `None` : la lecture des secteurs pouvant réussir quand
    celle de la composition échoue, la fiche était jugée utile et gardée **trente
    jours** avec une composition absente. Un ETF physique se retrouvait donc annoncé
    « composition non publiée » pendant un mois.

    C'est exactement le défaut qui a d'abord vicié mon propre banc d'essai : une
    erreur avalée devenait indistinguable d'un résultat négatif réel, et le test a
    rapporté qu'aucun ETF ne publiait sa composition alors que quatre venaient de le
    faire.
    """
    try:
        th = fd.top_holdings
    except Exception:
        return None, False
    try:
        if th is None or not len(th):
            return None, True
        colonnes = [c for c in th.columns if "ercent" in str(c)]
        if not colonnes:
            return None, True
        poids = [float(x) for x in th[colonnes[0]] if x is not None and float(x) > 0]
        if not poids:
            return None, True
        # Les poids arrivent en fraction. Un total supérieur à un signalerait des
        # pourcentages, auquel cas on ramène — se tromper d'un facteur cent
        # multiplierait le HHI par dix mille.
        if sum(poids) > 1.5:
            poids = [w / 100.0 for w in poids]
        if sum(poids) > 1.01:
            return None, True
        hhi = sum(w * w for w in poids)
        return (hhi, True) if hhi > 0 else (None, True)
    except Exception:                                         # pragma: no cover
        # Une composition présente mais illisible : c'est un format inattendu, pas un
        # ratage réseau. Inutile de réessayer dans la minute.
        return None, True


def _details_titre(ticker: str) -> dict:
    """Ce que yfinance sait d'un titre, mis en cache six heures, disque compris."""
    import time

    import yfinance as yf

    _charger_cache_details()

    # Le cache range une échéance, plus un horodatage : succès et échecs n'ont pas
    # la même durée de vie.
    entree = _CACHE_DETAILS.get(ticker)
    if entree and time.time() < entree[0]:
        return entree[1]

    d: dict = {}
    # Vrai par défaut : une action n'a pas de composition à consulter, donc rien ne
    # reste à réessayer de ce côté.
    composition_lue = True
    try:
        tk = yf.Ticker(ticker)
        info = tk.info or {}
        d["devise"] = info.get("currency")
        d["secteur"] = info.get("sector")
        # `region` vaut « US » pour un ETF Stoxx Europe : c'est la place de
        # cotation. Seul le pays d'une action est exploitable ; la zone d'un
        # fonds se déduit de son mandat, plus loin.
        d["pays"] = info.get("country")
        # ⚠️ Le volume moyen n'est plus relevé : il ne servait qu'à la liquidité,
        # facteur supprimé à l'audit — il valait cent pour toute position de
        # particulier. C'était aussi le seul champ de cette fiche à varier d'un jour
        # à l'autre, donc le seul argument pour un cache court.
        # ⚠️ Deux champs, pas un : le fournisseur ne les remplit pas tous les deux.
        # Relevé sur PAEJ.PA, `netExpenseRatio` vaut 0,6 quand
        # `annualReportExpenseRatio` est absent. Ne lire que le second laissait des
        # fonds sans frais alors que la donnée était là, une clé plus loin.
        d["frais"] = (_pct_frais(info.get("annualReportExpenseRatio"))
                      or _pct_frais(info.get("netExpenseRatio")))
        d["nom"] = info.get("shortName") or info.get("longName")
        if info.get("quoteType") == "ETF":
            try:
                fd = tk.funds_data
                d["secteurs"] = dict(fd.sector_weightings or {})
                d["hhi"], composition_lue = _hhi_du_fonds(fd)
                # ⚠️ L'indice **passe devant** la composition du fonds, et cette
                # priorité a été inversée après mesure.
                #
                # Un ETF synthétique qui publie quelque chose publie son panier de
                # **collatéral** — ce qu'il détient réellement — et non l'indice
                # auquel l'épargnant est exposé. Or c'est l'exposition qui porte le
                # risque société.
                #
                # Constaté sur ETZ.PA, « BNP Paribas Easy Stoxx Europe 600 » : sa
                # composition publiée donnait 36 sociétés équivalentes, quand un ETF
                # physique sur le même indice en donne 195. Le facteur mesurait un
                # panier de garantie et l'annonçait comme la diversification du
                # portefeuille.
                #
                # Pour un fonds **physique**, les deux coïncident par construction —
                # ses lignes *sont* l'indice — donc rien n'est perdu à préférer
                # l'indice. Cela donne en plus une propriété utile : deux ETF suivant
                # le même indice reçoivent la même mesure, ce qui est juste puisqu'ils
                # portent la même exposition.
                #
                # La composition propre ne sert donc que d'ultime recours, quand
                # l'indice n'est pas reconnu — cas d'un fonds sectoriel ou thématique,
                # presque toujours physique, donc lisible sans risque de collatéral.
                indice = _hhi_de_l_indice(d.get("nom"))
                if indice:
                    d["hhi"] = indice
                    # L'interface doit pouvoir dire que le chiffre vient de l'indice :
                    # prétendre avoir lu le fonds serait faux.
                    d["hhi_indice"] = True
                d["classes"] = dict(fd.asset_classes or {})
                # Le TER d'un fonds vit ici plutôt que dans `info`, sous une
                # étiquette en clair et non sous une clé.
                if d.get("frais") is None:
                    ops = fd.fund_operations
                    if ops is not None and "Annual Report Expense Ratio" in ops.index:
                        d["frais"] = _pct_frais(ops.loc["Annual Report Expense Ratio"].iloc[0])
            except Exception:
                pass
        elif info.get("sector"):
            # Une action est cent pour cent action : la classe est connue sans
            # transparence.
            d["classes"] = {"stockPosition": 1.0}
    except Exception as exc:                                  # pragma: no cover
        logger.warning("détails indisponibles pour %s : %s", ticker, exc)

    # ⚠️ On ne remplace pas une donnée connue par un échec.
    #
    # Une lecture ratée rendait `{}`, qui écrasait les secteurs et le nom obtenus à
    # l'appel précédent. Observé sur un vrai portefeuille : la ligne à 70 % perdait
    # sa zone, la ventilation annonçait « Europe 67 % » au lieu de « États-Unis
    # 70 % », et la diversification tombait à zéro. Une donnée un peu vieille vaut
    # infiniment mieux qu'une donnée absente — d'autant qu'un secteur ou une zone
    # ne changent pas d'un jour à l'autre.
    # ⚠️ Pour un fonds, la fiche n'est « utile » — donc gardée trente jours — que si
    # la composition a pu être **consultée**, qu'elle soit vide ou non. Sinon on la
    # garde quatre-vingt-dix secondes et on réessaie : une lecture ratée sous
    # limitation de débit ne doit pas figer un ETF physique en « composition non
    # publiée » pour un mois.
    utile = bool(d.get("secteurs") or d.get("secteur") or d.get("nom")) and composition_lue
    if not utile and entree and entree[1]:
        # On garde l'ancienne, et on réessaiera bientôt.
        _CACHE_DETAILS[ticker] = (time.time() + _TTL_DETAILS_ECHEC, entree[1])
        return entree[1]

    _CACHE_DETAILS[ticker] = (
        time.time() + (_TTL_DETAILS if utile else _TTL_DETAILS_ECHEC), d)
    # ⚠️ On n'écrit sur disque que ce qui a **servi**. Persister un échec ferait
    # survivre au redémarrage précisément ce qu'on cherche à ne pas garder : un
    # `{}` obtenu pendant une limitation de débit, qui masquerait ensuite la donnée
    # réelle pendant toute la durée de vie du fichier.
    if utile:
        _ecrire_cache_details()
    return d


@router.get("/{portfolio_id}/analysis")
async def get_analysis(
    portfolio_id: str,
    db:           Session = Depends(get_db),
    user:         User    = Depends(require_auth),
):
    """
    Facteurs de risque, exposition et observations.

    Rien n'y est estimé : un indicateur qui manque de données vaut `null` et le
    dit. Un score inventé se lirait comme une mesure.
    """
    from datetime import timedelta

    import pandas as pd
    import yfinance as yf

    from app.services.analyse import (
        bande, exposition_secteurs, exposition_simple, exposition_zones,
        facteurs_de_risque, observations, profil_cible, projection, score_global,
        ventilation_secteurs, ventilation_zones,
    )

    portefeuille = _get_portfolio_or_404(portfolio_id, db, user)

    txs = (
        db.query(Transaction)
        .filter(Transaction.portfolio_id == portfolio_id)
        .all()
    )

    from app.utils.positions import compute_positions

    pos = compute_positions(txs) if txs else {}
    tickers = sorted(pos.keys())

    # ── Repli sur les poids déclarés, sans écritures ─────────────────────────
    #
    # Un portefeuille défini par ses poids n'a pas de positions à valoriser,
    # mais il a une composition — et la composition suffit à presque tous les
    # facteurs : concentration, corrélation, volatilité, bêta et diversification
    # en transparence n'ont jamais eu besoin des quantités.
    #
    # Refuser d'analyser ces portefeuilles était plus qu'un manque : le bandeau
    # du tableau de bord tire désormais sa note d'ici, donc les priver de
    # réponse aurait fait disparaître leur score. Seule la liquidité reste hors
    # de portée, faute de savoir combien de titres sont détenus — et elle vaut
    # alors `None`, ce que `score_global` ignore au lieu de compter zéro.
    if not tickers:
        declares = portefeuille.assets or []
        poids_declares = {
            str(a["ticker"]): float(a.get("weight") or 0.0)
            for a in declares
            if isinstance(a, dict) and a.get("ticker")
        }
        poids_declares = {t: w for t, w in poids_declares.items() if w > 0}
        if not poids_declares:
            return {"score": None, "bande": None, "facteurs": {}, "expositions": {},
                    "observations": [], "source": "aucune"}
        tickers = sorted(poids_declares)
        somme = sum(poids_declares.values())
        poids = {t: w / somme * 100 for t, w in poids_declares.items()}
        prix = {}
        # La projection à un an part d'un montant : à défaut de positions
        # valorisées, c'est la valeur totale saisie à la main qui le donne — ce
        # champ n'existe que pour ça. Sans elle, `total` vaut zéro et la
        # projection est simplement omise, comme pour tout facteur non mesurable.
        total = float(portefeuille.total_value or 0.0)
        source = "poids"
    else:
        prix = await fetch_current_prices(tickers)

        # ⚠️ Une ligne sans cours **arrête** l'analyse, elle ne s'omet pas.
        #
        # Les poids se déduisent de `quantité × cours` : sans cours, la ligne
        # sortait de `poids`, et les autres étaient renormalisées à cent. Observé
        # sur un vrai PEA au cours d'un ratage de l'API : la ligne à 70 % avait
        # disparu, la ventilation géographique annonçait « Europe 67 % » au lieu de
        # « États-Unis 70 % », et le score s'affichait avec la même assurance qu'un
        # score complet. Tous les facteurs étaient touchés, pas seulement la
        # transparence.
        #
        # C'est le principe déjà tenu par la route d'historique, qui refuse de
        # tracer plutôt que d'omettre un titre dont le cours manque. Une note
        # partielle présentée comme entière est pire qu'une absence de note.
        sans_cours = sorted(t for t in tickers if not prix.get(t))
        if sans_cours:
            return {
                "score": None, "bande": None, "facteurs": {}, "expositions": {},
                "observations": [], "poids": [],
                "projection": {"median": None, "p10": None, "p90": None, "trajectoire": []},
                "source": "incomplet", "sans_cours": sans_cours,
                "profil": profil_cible(portefeuille.horizon_annees, portefeuille.tolerance),
            }

        valeurs = {t: pos[t]["quantity"] * prix[t] for t in tickers}
        total = sum(valeurs.values())
        poids = {t: v / total * 100 for t, v in valeurs.items()} if total > 0 else {}
        source = "transactions"

    # ── Historique, pour les facteurs de marché ──────────────────────────────
    #
    # ⚠️ L'indice de référence n'est plus téléchargé ici. Il ne servait qu'au bêta,
    # supprimé : mesuré sur des rendements quotidiens, il était biaisé vers zéro
    # pour toute ligne cotée hors des heures de New York — 0,54 contre 0,99 pour
    # deux fonds suivant le même indice. Voir la note dans `analyse.py`.
    rendements = None
    try:
        brut = yf.download(
            tickers, period="1y",
            progress=False, auto_adjust=True, threads=True,
        )["Close"]
        if len(tickers) == 0:
            brut = None
        if brut is not None and len(brut):
            if isinstance(brut, pd.Series):
                brut = brut.to_frame(tickers[0])
            cols = [t for t in tickers if t in brut]
            if cols:
                rendements = brut[cols].pct_change().dropna(how="all")
    except Exception as exc:                                  # pragma: no cover
        logger.warning("historique d'analyse indisponible : %s", exc)

    details = {t: _details_titre(t) for t in tickers}

    # ⚠️ La liquidité n'est plus calculée. Elle valait cent pour toute position de
    # particulier — il faudrait détenir un dixième du volume d'une séance pour
    # perdre le premier point — donc elle affichait « moins d'une séance » à tout le
    # monde. Voir la note dans `analyse.py`.

    # Les quatre ventilations alimentent les graphiques d'exposition ; seuls les
    # secteurs alimentent encore un facteur.
    #
    # ⚠️ « devises » a été retirée. Elle lisait la devise de **cotation**, donc
    # annonçait « EUR 100 % » pour un portefeuille de trackers S&P 500 cotés à
    # Paris, exposé en réalité au dollar. C'était faux, pas approximatif.
    expositions = {
        "secteurs": exposition_secteurs(details, poids),
        "zones":    exposition_zones(details, poids),
        "classes":  exposition_simple(details, poids, "classes"),
    }

    # La diversification se mesure sur ce qui est réellement détenu : les deux
    # ventilations lui sont donc passées — secteurs pour la répartition d'activité,
    # zones pour l'écart au marché mondial.
    #
    # ⚠️ Les ventilations **complètes**, pas celles des graphiques. Celles-ci
    # plafonnent à six entrées plus un « Autres » qui compte pour une seule : onze
    # secteurs équipondérés y devenaient 3,9 équivalents, plafonnant la note à 41
    # pour la meilleure diversification possible. Voir `exposition_secteurs`.
    # ⚠️ La concentration **interne** de chaque ligne, pour la concentration en
    # transparence : 1 pour une action détenue en direct, l'indice de Herfindahl de
    # la composition publiée pour un fonds. Voir la formule dans `analyse.py`.
    #
    # Une ligne absente n'est pas supposée : un fonds synthétique ne publie aucune
    # composition — il détient un contrat d'échange, pas des actions — et la deviner
    # reviendrait à inventer le contenu du portefeuille.
    hhi_lignes, hhi_par_indice = {}, set()
    for t, d in details.items():
        d = d or {}
        if d.get("secteurs"):
            if d.get("hhi"):
                hhi_lignes[t] = float(d["hhi"])
                if d.get("hhi_indice"):
                    hhi_par_indice.add(t)
        elif d.get("secteur"):
            # Une action est une seule société : sa concentration interne vaut un.
            hhi_lignes[t] = 1.0

    facteurs = facteurs_de_risque(
        poids, rendements,
        secteurs=ventilation_secteurs(details, poids),
        zones=ventilation_zones(details, poids),
        hhi_lignes=hhi_lignes, hhi_par_indice=hhi_par_indice,
        frais_par_ligne=_frais_connus(details, portefeuille.frais_lignes),
        cible=profil_cible(portefeuille.horizon_annees, portefeuille.tolerance),
        courtage=_courtage_paye(txs),
    )
    sc = score_global(facteurs)

    # ── Projection à un an, sur le portefeuille tel qu'il est ────────────────
    proj = {"median": None, "p10": None, "p90": None, "trajectoire": []}
    if rendements is not None and total > 0 and len(rendements) >= 60:
        import numpy as np

        w = np.array([poids.get(c, 0.0) for c in rendements.columns], dtype=float)
        if w.sum() > 0:
            w = w / w.sum()
            serie = (rendements * w).sum(axis=1)
            proj = projection(total, float(serie.mean()), float(serie.std()))

    return {
        "score": sc,
        "bande": bande(sc),
        "facteurs": facteurs,
        "expositions": expositions,
        "observations": observations(poids, facteurs, expositions),
        "projection": proj,
        "poids": [{"ticker": t, "part": round(w, 2)} for t, w in
                  sorted(poids.items(), key=lambda kv: kv[1], reverse=True)],
        "source": source,
        "sans_cours": [],
        # Le profil tel qu'il a été déclaré, ou `null`. L'interface s'en sert pour
        # proposer de le renseigner quand il manque — sans lui, trois facteurs
        # restent muets et l'utilisateur n'aurait aucun moyen de le savoir.
        "profil": profil_cible(portefeuille.horizon_annees, portefeuille.tolerance),
    }
