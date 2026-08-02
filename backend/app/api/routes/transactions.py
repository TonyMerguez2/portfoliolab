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

import logging
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

_HISTO_JOURS = {
    "7d": 7, "1mo": 31, "3mo": 92, "6mo": 183,
    "1y": 366, "3y": 1096, "max": None,
}


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
    jours = _HISTO_JOURS.get(period)
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

# Détails par ticker : secteurs internes, devise, classes d'actifs, volume.
# Un appel yfinance par titre coûte plusieurs secondes et le fournisseur limite
# le débit ; le cache évite de les refaire à chaque ouverture de l'onglet.
_CACHE_DETAILS: dict[str, tuple[float, dict]] = {}
_TTL_DETAILS = 6 * 3600


def _details_titre(ticker: str) -> dict:
    """Ce que yfinance sait d'un titre, mis en cache six heures."""
    import time

    import yfinance as yf

    frais = _CACHE_DETAILS.get(ticker)
    if frais and time.time() - frais[0] < _TTL_DETAILS:
        return frais[1]

    d: dict = {}
    try:
        tk = yf.Ticker(ticker)
        info = tk.info or {}
        d["devise"] = info.get("currency")
        d["secteur"] = info.get("sector")
        d["volume"] = info.get("averageVolume")
        d["nom"] = info.get("shortName") or info.get("longName")
        if info.get("quoteType") == "ETF":
            try:
                fd = tk.funds_data
                d["secteurs"] = dict(fd.sector_weightings or {})
                d["classes"] = dict(fd.asset_classes or {})
            except Exception:
                pass
        elif info.get("sector"):
            # Une action est cent pour cent action : la classe est connue sans
            # transparence.
            d["classes"] = {"stockPosition": 1.0}
    except Exception as exc:                                  # pragma: no cover
        logger.warning("détails indisponibles pour %s : %s", ticker, exc)

    _CACHE_DETAILS[ticker] = (time.time(), d)
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
        bande, exposition_secteurs, exposition_simple, facteurs_de_risque,
        observations, score_global,
    )

    _get_portfolio_or_404(portfolio_id, db, user)

    txs = (
        db.query(Transaction)
        .filter(Transaction.portfolio_id == portfolio_id)
        .all()
    )
    if not txs:
        return {"score": None, "bande": None, "facteurs": {}, "expositions": {},
                "observations": [], "source": "aucune"}

    from app.utils.positions import compute_positions

    pos = compute_positions(txs)
    tickers = sorted(pos.keys())
    if not tickers:
        return {"score": None, "bande": None, "facteurs": {}, "expositions": {},
                "observations": [], "source": "aucune"}

    prix = await fetch_current_prices(tickers)
    valeurs = {t: pos[t]["quantity"] * prix[t] for t in tickers if prix.get(t)}
    total = sum(valeurs.values())
    poids = {t: v / total * 100 for t, v in valeurs.items()} if total > 0 else {}

    # ── Historique, pour les facteurs de marché ──────────────────────────────
    rendements = marche = None
    try:
        brut = yf.download(
            tickers + [_BENCHMARK], period="1y",
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
            if _BENCHMARK in brut:
                marche = brut[_BENCHMARK].pct_change().dropna()
    except Exception as exc:                                  # pragma: no cover
        logger.warning("historique d'analyse indisponible : %s", exc)

    details = {t: _details_titre(t) for t in tickers}

    # ── Liquidité : séances nécessaires pour sortir des positions ────────────
    jours = None
    parts = []
    for t in tickers:
        vol = (details.get(t) or {}).get("volume")
        p = prix.get(t)
        if vol and p and vol > 0:
            parts.append(pos[t]["quantity"] / vol)
    if parts:
        jours = max(parts)

    facteurs = facteurs_de_risque(poids, rendements, marche, jours)
    sc = score_global(facteurs)

    expositions = {
        "secteurs": exposition_secteurs(details, poids),
        "devises":  exposition_simple(details, poids, "devise"),
        "classes":  exposition_simple(details, poids, "classes"),
    }

    return {
        "score": sc,
        "bande": bande(sc),
        "facteurs": facteurs,
        "expositions": expositions,
        "observations": observations(poids, facteurs, expositions),
        "poids": [{"ticker": t, "part": round(w, 2)} for t, w in
                  sorted(poids.items(), key=lambda kv: kv[1], reverse=True)],
        "source": "transactions",
    }
