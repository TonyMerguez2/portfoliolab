"""
API routes — v1.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    BacktestRequest,
    BacktestResponse,
    EfficientFrontierRequest,
    EfficientFrontierResponse,
    MonteCarloRequest,
    MonteCarloResponse,
    TickerValidation,
)
from app.services.backtest_service import (
    run_backtest,
    run_efficient_frontier,
    run_monte_carlo,
)
from app.services.data_service import validate_ticker, BENCHMARK_NAMES

router = APIRouter(prefix="/api/v1")
logger = logging.getLogger(__name__)


def _sanitize(obj):
    """Replace NaN/Inf floats with None so JSON serialization never fails."""
    import math
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj


@router.post("/backtest", tags=["Backtest"])
async def backtest(req: BacktestRequest):
    """
    Run a full portfolio backtest.

    - Fetches historical price data for all assets and the chosen benchmark
    - Computes performance, risk, and diversification metrics
    - Returns time series, correlation matrix, and automated commentary
    """
    from fastapi.responses import JSONResponse
    try:
        result = run_backtest(req)
        return JSONResponse(content=_sanitize(result.dict()))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Backtest error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal computation error")


@router.get(
    "/validate-ticker/{ticker}",
    response_model=TickerValidation,
    tags=["Utilities"],
)
async def check_ticker(ticker: str) -> TickerValidation:
    """Validate a ticker symbol against Yahoo Finance."""
    result = validate_ticker(ticker)
    return TickerValidation(**result)


@router.get("/benchmarks", tags=["Utilities"])
async def get_benchmarks() -> list[dict]:
    """List available benchmark indices."""
    return [
        {"ticker": ticker, "name": name}
        for ticker, name in BENCHMARK_NAMES.items()
    ]


@router.post(
    "/efficient-frontier",
    response_model=EfficientFrontierResponse,
    tags=["Advanced"],
)
async def efficient_frontier(req: EfficientFrontierRequest) -> EfficientFrontierResponse:
    """
    Compute the Markowitz efficient frontier for a set of assets.

    Returns the frontier curve, max-Sharpe portfolio, and minimum-variance portfolio.
    """
    try:
        return run_efficient_frontier(req)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Frontier error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Optimization failed")


@router.post(
    "/monte-carlo",
    response_model=MonteCarloResponse,
    tags=["Advanced"],
)
async def monte_carlo(req: MonteCarloRequest) -> MonteCarloResponse:
    """
    Run Monte Carlo simulations (Geometric Brownian Motion) on the portfolio.

    Returns percentile bands (P5–P95) over the projection horizon.
    """
    try:
        return run_monte_carlo(req)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Monte Carlo error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Simulation failed")


@router.post("/monte-carlo-advanced", tags=["Advanced"])
async def monte_carlo_advanced(
    req: MonteCarloRequest,
    target: float | None = None,
) -> dict:
    """
    Advanced Monte Carlo with goal tracking, robustness score, and distribution analysis.
    """
    try:
        from app.services.backtest_service import run_monte_carlo_advanced
        return run_monte_carlo_advanced(req, target_value=target)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Advanced Monte Carlo error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Simulation failed")


@router.get("/search", tags=["Search"])
async def search_assets(q: str = "") -> dict:
    """Search assets via Yahoo Finance."""
    if not q or len(q) < 1:
        return {"results": []}
    try:
        import httpx
        url = f"https://query1.finance.yahoo.com/v1/finance/search?q={q}&lang=fr-FR&quotesCount=20&newsCount=0&listsCount=0"
        headers = {"User-Agent": "Mozilla/5.0"}
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url, headers=headers)
            data = resp.json()
        quotes = data.get("quotes", [])
        results = []
        # La boucle nommait sa variable `q`, comme la requête : après le
        # premier tour, `q` désignait un résultat et non plus ce qui était
        # cherché.
        for item in quotes:
            qtype = item.get("quoteType", "")
            if qtype not in ("EQUITY", "ETF", "CRYPTOCURRENCY", "MUTUALFUND"):
                continue
            exchange = item.get("exchange", "")
            ALLOWED = {"NMS","NYQ","NGM","PCX","PAR","GER","FRA","LSE","AMS","EBS","TOR","ASX","STO","MIL","BRU"}
            if qtype in ("ETF","EQUITY") and exchange not in ALLOWED:
                continue
            score = 0
            if exchange in ("NMS", "NYQ", "NGM", "PCX"): score = 3
            elif exchange in ("PAR", "GER", "FRA", "LSE", "AMS", "EBS"): score = 2
            elif exchange in ("TOR", "ASX", "STO", "MIL", "BRU"): score = 1
            results.append({
                "ticker": item.get("symbol", ""),
                "name": item.get("longname") or item.get("shortname", ""),
                "type": qtype,
                "exchange": exchange,
                "score": score,
                "logo": item.get("logoUrl", "") or f"https://financialmodelingprep.com/image-stock/{item.get('symbol','')}.png",
            })
        results.sort(key=lambda x: x["score"], reverse=True)
        for r in results: r.pop("score", None)
        return {"results": _avec_pea(q, results)}
    except Exception as e:
        logger.error(f"Search error: {e}")
        # Le catalogue local reste utile quand Yahoo est injoignable.
        return {"results": _avec_pea(q, [])}


def _avec_pea(requete: str, resultats: list[dict]) -> list[dict]:
    """
    Place en tête les ETF PEA correspondants, sans doublon.

    Yahoo n'indexe pas l'indice suivi par ces fonds — il ne figure qu'entre
    parenthèses dans leur nom commercial —, si bien qu'une recherche par indice
    ne les trouvait pas du tout.
    """
    from app.data.pea_etfs import chercher

    locaux = chercher(requete)
    if not locaux:
        return resultats[:8]

    connus = {e["ticker"] for e in locaux}
    return (locaux + [r for r in resultats if r["ticker"] not in connus])[:8]


@router.get("/sector/{ticker}", tags=["Search"])
async def get_sector(ticker: str) -> dict:
    """Get sector, industry and country for a ticker via FMP."""
    import os, httpx
    api_key = os.environ.get("FMP_API_KEY", "")
    if not api_key:
        return {"sector": None, "industry": None, "country": None}
    try:
        url = f"https://financialmodelingprep.com/stable/profile?symbol={ticker}&apikey={api_key}"
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url)
            data = resp.json()
        if data and len(data) > 0:
            p = data[0]
            return {
                "ticker": ticker,
                "sector": p.get("sector"),
                "industry": p.get("industry"),
                "country": p.get("country"),
                "name": p.get("companyName"),
            }
        return {"sector": None, "industry": None, "country": None}
    except Exception as e:
        logger.error(f"Sector error: {e}")
        return {"sector": None, "industry": None, "country": None}


@router.get("/compare", tags=["Utilities"])
async def compare_ticker(ticker: str, period: str = "Max", start: str = None) -> dict:
    """Fetch growth curve for a ticker, normalized to 10000."""
    import yfinance as yf
    from datetime import datetime, timedelta
    periods = {"1M": 30, "3M": 90, "6M": 180, "1A": 365, "3A": 1095, "Max": 0}
    days = periods.get(period, 0)
    if start:
        pass  # use provided start
    else:
        start = None if days == 0 else (datetime.today() - timedelta(days=days)).strftime("%Y-%m-%d")
    try:
        hist = yf.download(ticker, start=start, period=None if start else "max", progress=False, auto_adjust=True)
        if hist.empty:
            return {"ticker": ticker, "data": []}
        close = hist["Close"].dropna()
        if hasattr(close.columns, '__len__'):
            close = close.iloc[:, 0]
        first = float(close.iloc[0])
        data = [{"date": str(d.date()), "value": round(float(v) / first * 10000, 2)} for d, v in close.items()]
        return {"ticker": ticker, "data": data}
    except Exception as e:
        return {"ticker": ticker, "data": [], "error": str(e)}

@router.get("/trending", tags=["Search"])
async def get_trending() -> dict:
    """Get trending assets from Yahoo Finance."""
    try:
        import httpx
        # Top actifs par catégorie
        tickers = [
            {"ticker":"AAPL","type":"EQUITY","name":"Apple Inc."},
            {"ticker":"MSFT","type":"EQUITY","name":"Microsoft Corp."},
            {"ticker":"NVDA","type":"EQUITY","name":"NVIDIA Corp."},
            {"ticker":"TSLA","type":"EQUITY","name":"Tesla Inc."},
            {"ticker":"AMZN","type":"EQUITY","name":"Amazon.com Inc."},
            {"ticker":"META","type":"EQUITY","name":"Meta Platforms"},
            {"ticker":"GOOGL","type":"EQUITY","name":"Alphabet Inc."},
            {"ticker":"JPM","type":"EQUITY","name":"JPMorgan Chase"},
            {"ticker":"V","type":"EQUITY","name":"Visa Inc."},
            {"ticker":"MA","type":"EQUITY","name":"Mastercard Inc."},
            {"ticker":"JNJ","type":"EQUITY","name":"Johnson & Johnson"},
            {"ticker":"WMT","type":"EQUITY","name":"Walmart Inc."},
            {"ticker":"BAC","type":"EQUITY","name":"Bank of America"},
            {"ticker":"XOM","type":"EQUITY","name":"ExxonMobil Corp."},
            {"ticker":"UNH","type":"EQUITY","name":"UnitedHealth Group"},
            {"ticker":"PG","type":"EQUITY","name":"Procter & Gamble"},
            {"ticker":"HD","type":"EQUITY","name":"Home Depot Inc."},
            {"ticker":"ABBV","type":"EQUITY","name":"AbbVie Inc."},
            {"ticker":"MRK","type":"EQUITY","name":"Merck & Co."},
            {"ticker":"AVGO","type":"EQUITY","name":"Broadcom Inc."},
            {"ticker":"COST","type":"EQUITY","name":"Costco Wholesale"},
            {"ticker":"KO","type":"EQUITY","name":"Coca-Cola Co."},
            {"ticker":"LLY","type":"EQUITY","name":"Eli Lilly & Co."},
            {"ticker":"MCD","type":"EQUITY","name":"McDonald's Corp."},
            {"ticker":"INTC","type":"EQUITY","name":"Intel Corp."},
            {"ticker":"AMD","type":"EQUITY","name":"Advanced Micro Devices"},
            {"ticker":"CRM","type":"EQUITY","name":"Salesforce Inc."},
            {"ticker":"ADBE","type":"EQUITY","name":"Adobe Inc."},
            {"ticker":"NFLX","type":"EQUITY","name":"Netflix Inc."},
            {"ticker":"PYPL","type":"EQUITY","name":"PayPal Holdings"},
            {"ticker":"MC.PA","type":"EQUITY","name":"LVMH"},
            {"ticker":"TTE.PA","type":"EQUITY","name":"TotalEnergies"},
            {"ticker":"ASML","type":"EQUITY","name":"ASML Holding"},
            {"ticker":"SAP","type":"EQUITY","name":"SAP SE"},
            {"ticker":"OR.PA","type":"EQUITY","name":"L'Oréal"},
            {"ticker":"SAN.PA","type":"EQUITY","name":"Sanofi"},
            {"ticker":"AIR.PA","type":"EQUITY","name":"Airbus SE"},
            {"ticker":"SPY","type":"ETF","name":"SPDR S&P 500 ETF"},
            {"ticker":"QQQ","type":"ETF","name":"Invesco QQQ Trust"},
            {"ticker":"VTI","type":"ETF","name":"Vanguard Total Market"},
            {"ticker":"VEA","type":"ETF","name":"Vanguard Dev. Markets"},
            {"ticker":"EEM","type":"ETF","name":"iShares MSCI EM"},
            {"ticker":"GLD","type":"ETF","name":"SPDR Gold Shares"},
            {"ticker":"IWM","type":"ETF","name":"iShares Russell 2000"},
            {"ticker":"ARKK","type":"ETF","name":"ARK Innovation ETF"},
            {"ticker":"CW8.PA","type":"ETF","name":"Amundi MSCI World"},
            {"ticker":"BTC-USD","type":"CRYPTOCURRENCY","name":"Bitcoin"},
            {"ticker":"ETH-USD","type":"CRYPTOCURRENCY","name":"Ethereum"},
            {"ticker":"SOL-USD","type":"CRYPTOCURRENCY","name":"Solana"},
            {"ticker":"BNB-USD","type":"CRYPTOCURRENCY","name":"BNB"},
            {"ticker":"XRP-USD","type":"CRYPTOCURRENCY","name":"XRP"},
            {"ticker":"DOGE-USD","type":"CRYPTOCURRENCY","name":"Dogecoin"},
            {"ticker":"ADA-USD","type":"CRYPTOCURRENCY","name":"Cardano"},
            {"ticker":"^GSPC","type":"INDEX","name":"S&P 500"},
            {"ticker":"^NDX","type":"INDEX","name":"Nasdaq 100"},
            {"ticker":"^DJI","type":"INDEX","name":"Dow Jones"},
            {"ticker":"^FCHI","type":"INDEX","name":"CAC 40"},
            {"ticker":"^GDAXI","type":"INDEX","name":"DAX 40"},
            {"ticker":"^FTSE","type":"INDEX","name":"FTSE 100"},
            {"ticker":"^N225","type":"INDEX","name":"Nikkei 225"},
        ]
        return {"results": tickers}
    except Exception as e:
        return {"results": {}}

# Fenêtres téléchargées : volontairement plus larges que la période demandée,
# pour que week-ends et jours fériés n'entament pas l'historique utile.
_YF_WINDOW = {"1d": "5d", "7d": "12d", "1mo": "35d", "3mo": "95d",
              "6mo": "8mo", "1y": "14mo", "3y": "40mo", "max": "max"}
# `max` n'y figure pas : il n'a pas de borne à couper, on garde tout.
_PERIOD_DAYS = {"7d": 7, "1mo": 30, "3mo": 91, "6mo": 183, "1y": 365, "3y": 1095}


def _trim_to_period(obj, period: str):
    """Ramène une fenêtre téléchargée à la période réellement demandée.

    Sans cette coupe, la marge de sécurité de `_YF_WINDOW` était comptée comme
    de la période : la variation « 7 jours » en couvrait douze, et « 1 an »
    quatorze mois. L'écart n'avait rien d'anecdotique — NVDA affichait +41,74 %
    sur un an là où la vraie variation valait +11,61 %, et MSFT sortait un
    mois à -4,47 % quand il était à +5,46 %. Le signe lui-même était faux.

    Le point de référence est la dernière cotation *antérieure ou égale* à la
    borne, et non la première postérieure : « il y a un mois » désigne le
    dernier cours connu à cette date, pas celui de la séance qui a suivi.
    """
    from datetime import datetime, timedelta
    import pandas as pd

    days = _PERIOD_DAYS.get(period)
    if days is None or len(obj) == 0:
        return obj
    idx = obj.index
    cutoff = pd.Timestamp(datetime.today().date() - timedelta(days=days))
    tz = getattr(idx, "tz", None)
    if tz is not None:
        cutoff = cutoff.tz_localize(tz)
    before = idx[idx <= cutoff]
    start = before[-1] if len(before) else idx[0]
    return obj[idx >= start]


def _session_with_base(frame, sessions):
    """Dernière séance, précédée de la clôture de la séance d'avant.

    Cette ligne supplémentaire est la référence de la journée. Sans elle, la
    courbe partait de l'ouverture : mesurée depuis 9h30 quand la variation
    affichée partout ailleurs part de la veille. Les deux se contredisaient à
    l'écran — +0,40 % dans la bande de tête, -0,18 % sur la courbe, signes
    opposés le même jour.
    """
    import numpy as np
    import pandas as pd

    if len(frame) == 0:
        return frame
    # `sessions` doit être un tableau pour que la comparaison soit terme à
    # terme : sur une liste Python, `sessions == derniere` renvoie le scalaire
    # False, et l'indexation lève au lieu de filtrer.
    sessions = np.asarray(sessions)
    derniere = max(sessions)
    seance = frame[sessions == derniere]
    if len(seance) == 0:
        return seance
    avant = frame[sessions < derniere]
    return pd.concat([avant.iloc[[-1]], seance]) if len(avant) else seance


def _intraday_session(close, sessions, ticker: str, n_tickers: int) -> list[float]:
    """Barres intraday de la dernière séance ouverte, pour un ticker.

    On isole la dernière séance plutôt que de prendre les N dernières barres :
    une fenêtre de deux jours enjambe une clôture, et la courbe montrerait
    alors un saut de nuit que la variation du jour ne contient pas.
    """
    import pandas as pd

    if close is None or sessions is None:
        return []
    try:
        if n_tickers == 1:
            s = close if isinstance(close, pd.Series) else close.iloc[:, 0]
        else:
            if ticker not in close.columns:
                return []
            s = close[ticker]
        by_session = pd.Series(s.values, index=sessions).dropna()
        if by_session.empty:
            return []
        last = max(by_session.index)
        return [float(v) for v in by_session[by_session.index == last].values]
    except Exception:
        return []


def _downsample(values: list[float], max_points: int = 40) -> list[float]:
    """Réduit une série à un nombre de points tenant dans une sparkline.

    Le dernier point est réimposé après l'échantillonnage : c'est le prix
    courant, celui que le reste de la carte affiche en chiffres. Un pas
    régulier le manquerait presque toujours, et la courbe finirait alors
    ailleurs que le montant écrit juste à côté.
    """
    n = len(values)
    if n <= max_points:
        return values
    step = n / max_points
    out = [values[int(i * step)] for i in range(max_points)]
    out[-1] = values[-1]
    return out


@router.get("/prices", tags=["Prices"])
async def get_prices(tickers: str = "", period: str = "1d") -> list:
    """Prix courant, variation sur la période, et série pour la sparkline.

    La série accompagne la variation : elle part du même point de référence
    (clôture précédente en 1d, début de fenêtre sinon) et finit sur le même
    prix. Courbe et pourcentage racontent donc la même chose.

    Sur 1d, la fenêtre journalière ne contient qu'un point depuis la clôture
    précédente — il n'y a pas de courbe à en tirer. On télécharge alors le
    pas de 15 minutes en plus, uniquement pour la série : la variation
    continue d'être calculée sur les clôtures journalières, à l'identique.
    Les dériver de l'intraday donnerait des chiffres légèrement différents
    (0,02 à 0,03 point mesuré), et cet écart se verrait d'une page à l'autre.
    """
    if not tickers:
        return []
    try:
        import yfinance as yf
        import pandas as pd
        from concurrent.futures import ThreadPoolExecutor
        import asyncio

        ticker_list = [t.strip() for t in tickers.split(",") if t.strip()][:50]
        if not ticker_list:
            return []

        yf_period = _YF_WINDOW.get(period, "5d")

        def batch_download():
            arg = ticker_list[0] if len(ticker_list) == 1 else ticker_list
            return yf.download(arg, period=yf_period, progress=False, auto_adjust=True)

        def batch_intraday():
            arg = ticker_list[0] if len(ticker_list) == 1 else ticker_list
            return yf.download(arg, period="2d", interval="15m", progress=False, auto_adjust=True)

        loop = asyncio.get_running_loop()
        with ThreadPoolExecutor(max_workers=1) as pool:
            hist = await loop.run_in_executor(pool, batch_download)
            intra = await loop.run_in_executor(pool, batch_intraday) if period == "1d" else None

        if hist.empty:
            return []

        close = hist["Close"]
        # Séances repérées dans le fuseau de la place, pas en UTC : une séance
        # américaine se termine à 20h UTC et déborderait sur le lendemain.
        intra_close, intra_sessions = None, None
        if intra is not None and not intra.empty:
            intra_close = intra["Close"]
            idx = intra_close.index
            intra_sessions = (idx.tz_convert("America/New_York") if idx.tz is not None else idx).date

        results = []

        for ticker in ticker_list:
            try:
                if len(ticker_list) == 1:
                    series = close if isinstance(close, pd.Series) else close.iloc[:, 0]
                else:
                    if ticker not in close.columns:
                        continue
                    series = close[ticker]
                series = _trim_to_period(series.dropna(), period)
                if len(series) == 0:
                    continue
                price = float(series.iloc[-1])
                # Pour 1d : comparer avant-dernière clôture ; pour les autres : première valeur de la fenêtre
                prev = float(series.iloc[-2]) if period == "1d" else float(series.iloc[0])
                if price <= 0:
                    continue
                change = ((price - prev) / prev * 100) if prev else 0

                # Les deux extrémités sont clouées sur `prev` et `price`, c'est-à-dire
                # sur les nombres mêmes dont la variation est tirée. Le tracé intraday
                # vient d'un pas de 15 minutes et la variation de clôtures journalières :
                # laissés libres, ils divergeaient de 0,02 à 0,03 point, et la courbe
                # ne finissait donc pas sur le montant écrit à côté d'elle. L'intérieur
                # reste la vraie trajectoire.
                if period == "1d":
                    series_vals = _intraday_session(intra_close, intra_sessions, ticker, len(ticker_list))
                else:
                    series_vals = [float(v) for v in series.values]
                if series_vals:
                    series_vals = [prev] + series_vals
                    series_vals[-1] = price

                results.append({
                    "symbol": ticker,
                    "price": round(price, 4),
                    "change": round(change, 2),
                    "series": [round(v, 4) for v in _downsample(series_vals)],
                })
            except Exception:
                continue

        return results
    except Exception as e:
        logger.error(f"Prices error: {e}")
        return []

@router.get("/price-at", tags=["Prices"])
async def price_at(tickers: str = "", date: str = "") -> dict:
    """Cours de clôture à une date donnée, pour plusieurs tickers.

    Nécessaire à la saisie d'un portefeuille existant : jusqu'ici la page de
    construction enregistrait les achats **au prix du jour** même lorsqu'on
    déclarait les avoir faits deux ans plus tôt. Le prix de revient était donc
    faux, et la plus-value avec lui.

    Renvoie la dernière clôture *antérieure ou égale* à la date demandée : un
    achat un samedi se règle au cours du vendredi, et une date antérieure à
    l'introduction en bourse ne renvoie rien plutôt qu'un prix inventé.
    """
    if not tickers or not date:
        return {}
    try:
        import yfinance as yf
        import pandas as pd
        from concurrent.futures import ThreadPoolExecutor
        from datetime import datetime, timedelta
        import asyncio

        ticker_list = [t.strip() for t in tickers.split(",") if t.strip()][:50]
        if not ticker_list:
            return {}
        cible = datetime.fromisoformat(date).date()
        # Fenêtre large en amont : week-ends, fériés et suspensions de cotation.
        debut = (cible - timedelta(days=12)).isoformat()
        fin = (cible + timedelta(days=1)).isoformat()

        def download():
            arg = ticker_list[0] if len(ticker_list) == 1 else ticker_list
            return yf.download(arg, start=debut, end=fin, progress=False, auto_adjust=True)

        loop = asyncio.get_running_loop()
        with ThreadPoolExecutor(max_workers=1) as pool:
            hist = await loop.run_in_executor(pool, download)
        if hist.empty:
            return {}

        close = hist["Close"]
        if isinstance(close, pd.Series):
            close = close.to_frame(name=ticker_list[0])

        out: dict = {}
        for t in ticker_list:
            if t not in close.columns:
                continue
            serie = close[t].dropna()
            if len(serie):
                out[t] = round(float(serie.iloc[-1]), 4)
        return out
    except Exception as e:
        logger.error(f"Price-at error: {e}")
        return {}


@router.get("/portfolio-history", tags=["Prices"])
async def portfolio_history(tickers: str = "", weights: str = "", period: str = "1mo") -> dict:
    """Valeur d'un portefeuille au fil du temps, en base 1 au début de la fenêtre.

    Endpoint distinct de /backtest à dessein : celui-ci refuse les fenêtres de
    moins de trente séances, et il a raison — il annualise une volatilité et un
    Sharpe, qui ne veulent rien dire sur vingt points. Mais une courbe, si. D'où
    ce calcul séparé, qui ne produit qu'une trajectoire et aucune statistique.

    Achat-conservation aux pondérations courantes : value(t) = Σ wᵢ·Pᵢ(t)/Pᵢ(0).
    Les dates sont intersectées, non complétées — un actif qui cote le week-end
    et une action qui ne cote pas se rejoignent sur les seules séances communes,
    plutôt que d'inventer un prix figé pour le samedi.
    """
    if not tickers or not weights:
        return {"points": [], "change": None}
    try:
        import yfinance as yf
        import pandas as pd
        from concurrent.futures import ThreadPoolExecutor
        import asyncio

        ticker_list = [t.strip() for t in tickers.split(",") if t.strip()][:50]
        try:
            weight_list = [float(w) for w in weights.split(",")]
        except ValueError:
            return {"points": [], "change": None}
        if not ticker_list or len(weight_list) != len(ticker_list):
            return {"points": [], "change": None}

        total_w = sum(weight_list)
        if total_w <= 0:
            return {"points": [], "change": None}

        interval = "15m" if period == "1d" else "1d"
        yf_period = "2d" if period == "1d" else _YF_WINDOW.get(period, "35d")

        def download():
            arg = ticker_list[0] if len(ticker_list) == 1 else ticker_list
            return yf.download(arg, period=yf_period, interval=interval,
                               progress=False, auto_adjust=True)

        def download_daily():
            arg = ticker_list[0] if len(ticker_list) == 1 else ticker_list
            return yf.download(arg, period="5d", progress=False, auto_adjust=True)

        loop = asyncio.get_running_loop()
        with ThreadPoolExecutor(max_workers=1) as pool:
            hist = await loop.run_in_executor(pool, download)
            # Sur 1d seulement : les mêmes clôtures journalières que /prices,
            # pour clore la courbe sur le prix de l'instant (cf. plus bas).
            daily = await loop.run_in_executor(pool, download_daily) if period == "1d" else None

        if hist.empty:
            return {"points": [], "change": None}

        close = hist["Close"]
        if isinstance(close, pd.Series):
            close = close.to_frame(name=ticker_list[0])

        cols = [t for t in ticker_list if t in close.columns]
        if not cols:
            return {"points": [], "change": None}
        frame = _trim_to_period(close[cols].dropna(), period)
        if len(frame) < 2:
            return {"points": [], "change": None}

        if period == "1d":
            idx = frame.index
            sessions = (idx.tz_convert("America/New_York") if idx.tz is not None else idx).date
            frame = _session_with_base(frame, sessions)
            if len(frame) < 2:
                return {"points": [], "change": None}

        # Les poids sont renormalisés sur les seuls actifs récupérés : sinon la
        # courbe d'un portefeuille dont un ticker a échoué démarrerait sous 1.
        w = {t: weight_list[ticker_list.index(t)] for t in cols}
        w_sum = sum(w.values())
        if w_sum <= 0:
            return {"points": [], "change": None}

        normed = frame / frame.iloc[0]
        value = sum(normed[t] * (w[t] / w_sum) for t in cols)

        points = [
            {"date": d.isoformat(), "value": round(float(v), 6)}
            for d, v in value.items()
        ]

        # Le pas de 15 minutes ne livre que des barres *achevées* : en début de
        # séance la courbe accusait jusqu'à un quart d'heure de retard sur le
        # prix courant. Assez pour contredire la bande de tête — mesuré à
        # +0,40 % d'un côté et -0,18 % de l'autre, signes opposés le même jour.
        # On ajoute donc un point final au prix de l'instant, tiré des mêmes
        # clôtures journalières que /prices : la trajectoire reste celle de
        # l'intraday, mais elle finit sur le chiffre écrit à côté d'elle.
        if period == "1d" and daily is not None and not daily.empty:
            dclose = daily["Close"]
            if isinstance(dclose, pd.Series):
                dclose = dclose.to_frame(name=ticker_list[0])
            courant = 0.0
            couvert = 0.0
            for t in cols:
                if t not in dclose.columns:
                    continue
                serie = dclose[t].dropna()
                if len(serie) < 2:
                    continue
                prix, veille = float(serie.iloc[-1]), float(serie.iloc[-2])
                if veille <= 0:
                    continue
                courant += (prix / veille) * (w[t] / w_sum)
                couvert += w[t] / w_sum
            if couvert > 0:
                # Renormalisé sur les seuls actifs couverts, sinon un ticker
                # sans clôture journalière tirerait la valeur finale vers zéro.
                points.append({"date": frame.index[-1].isoformat(),
                               "value": round(courant / couvert, 6)})

        change = round((points[-1]["value"] - 1) * 100, 2)
        return {"points": points, "change": change}
    except Exception as e:
        logger.error(f"Portfolio history error: {e}")
        return {"points": [], "change": None}


_FNG_CACHE: dict = {"at": 0.0, "data": None}


@router.get("/fear-greed", tags=["Market"])
async def fear_greed() -> dict:
    """Indice Fear & Greed d'alternative.me.

    C'est un indice de sentiment **crypto**, pas actions — celui de CNN, qui
    porte sur les marchés américains, n'a pas d'API publique. Le champ `scope`
    le dit explicitement pour que l'interface le nomme correctement : présenté
    comme un baromètre général au-dessus d'un portefeuille d'actions, il
    induirait en erreur.

    Mis en cache : l'indice n'est recalculé qu'une fois par jour, le
    redemander à chaque affichage de page ne ferait qu'ajouter de la latence
    et solliciter un service gratuit pour rien.
    """
    import time

    if _FNG_CACHE["data"] is not None and time.time() - _FNG_CACHE["at"] < 1800:
        return _FNG_CACHE["data"]
    try:
        import httpx
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get("https://api.alternative.me/fng/?limit=1")
        entry = (resp.json().get("data") or [{}])[0]
        valeur = int(entry.get("value"))
        out = {
            "value": valeur,
            "label": entry.get("value_classification"),
            "scope": "crypto",
        }
        _FNG_CACHE.update({"at": time.time(), "data": out})
        return out
    except Exception as e:
        logger.error(f"Fear & Greed error: {e}")
        # Ni valeur par défaut ni zéro : l'interface doit pouvoir taire le
        # panneau plutôt que d'afficher un chiffre inventé.
        return {"value": None, "label": None, "scope": "crypto"}


def _yahoo_to_binance_symbol(ticker: str) -> str | None:
    """Convertit un ticker Yahoo (BTC-USD) en symbole Binance (BTCUSDT). None si non applicable."""
    if "." in ticker or "-" not in ticker:
        return None
    parts = ticker.split("-")
    if len(parts) != 2:
        return None
    base, quote = parts[0].upper(), parts[1].upper()
    quote_map = {"USD": "USDT", "USDT": "USDT", "EUR": "EUR", "BTC": "BTC", "ETH": "ETH", "BNB": "BNB"}
    binance_quote = quote_map.get(quote)
    if not binance_quote:
        return None
    return base + binance_quote


async def _fetch_binance(symbol: str, interval: str, period: str, start: str | None, end: str | None) -> list:
    """Fetch OHLCV depuis Binance avec pagination automatique. Retourne [] si symbole inconnu."""
    import httpx
    from datetime import datetime, timezone

    interval_map = {
        "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
        "60m": "1h", "1h": "1h", "1d": "1d",
    }
    bi = interval_map.get(interval)
    if not bi:
        return []

    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

    if start:
        start_ms = int(datetime.fromisoformat(start.replace("Z", "+00:00")).timestamp() * 1000)
        end_ms   = int(datetime.fromisoformat(end.replace("Z", "+00:00")).timestamp() * 1000) if end else now_ms
    else:
        period_days: dict[str, int] = {
            "1d": 1, "2d": 2, "5d": 5, "7d": 7, "14d": 14,
            "1mo": 30, "2mo": 60, "3mo": 90, "60d": 60,
            "6mo": 183, "1y": 365, "2y": 730, "5y": 1825,
        }
        if period == "max":
            days = 730 if interval in ("1h", "60m") else 365 * 10
        else:
            days = period_days.get(period, 7)
        start_ms = now_ms - days * 86_400_000
        end_ms   = now_ms

    results = []
    cur = start_ms
    async with httpx.AsyncClient(timeout=15.0) as client:
        while cur < end_ms:
            resp = await client.get(
                "https://api.binance.com/api/v3/klines",
                params={"symbol": symbol, "interval": bi, "startTime": cur, "endTime": end_ms, "limit": 1000},
            )
            if resp.status_code != 200:
                return []  # symbole inconnu → fallback Yahoo
            data = resp.json()
            if not isinstance(data, list) or not data:
                break
            for k in data:
                results.append({
                    "date":  datetime.fromtimestamp(k[0] / 1000, tz=timezone.utc).isoformat(),
                    "value": round(float(k[4]), 6),
                    "open":  round(float(k[1]), 6),
                    "high":  round(float(k[2]), 6),
                    "low":   round(float(k[3]), 6),
                    "close": round(float(k[4]), 6),
                })
            cur = data[-1][6] + 1  # close time du dernier candle + 1ms
            if len(data) < 1000:
                break

    return results


@router.get("/intraday", tags=["Prices"])
async def get_intraday(
    ticker: str,
    period: str = "5d",
    interval: str = "1h",
    start: str | None = None,
    end: str | None = None,
) -> list:
    """Get intraday OHLCV data. Binance pour les cryptos listées, Yahoo Finance en fallback."""
    if not ticker:
        return []

    # Binance en priorité pour les cryptos (données complètes, pas de trous sur 1m)
    # Sauf pour max+daily/weekly : Binance ne remonte qu'à 2017, Yahoo a l'historique complet
    _is_max_daily = period == "max" and interval in ("1d", "1wk")
    binance_symbol = _yahoo_to_binance_symbol(ticker)
    if binance_symbol and not _is_max_daily:
        try:
            data = await _fetch_binance(binance_symbol, interval, period, start, end)
            if data:
                return data
        except Exception as e:
            logger.warning(f"Binance fallback to Yahoo for {ticker}: {e}")

    # Yahoo Finance (actions, ETFs, cryptos de niche non listées sur Binance)
    try:
        import yfinance as yf
        import asyncio
        from concurrent.futures import ThreadPoolExecutor

        allowed_intervals = {"1m","2m","5m","15m","30m","60m","1h","1d","1wk"}
        allowed_periods = {"1d","2d","5d","7d","14d","60d","1mo","2mo","3mo","6mo","1y","2y","5y","max"}
        if interval not in allowed_intervals:
            return []
        if not start and period not in allowed_periods:
            return []

        def fetch():
            t = yf.Ticker(ticker)
            if start:
                return t.history(start=start, end=end or None, interval=interval, auto_adjust=True)
            return t.history(period=period, interval=interval, auto_adjust=True)

        loop = asyncio.get_running_loop()
        with ThreadPoolExecutor(max_workers=1) as pool:
            hist = await loop.run_in_executor(pool, fetch)

        if hist.empty:
            return []

        result = []
        for ts, row in hist.iterrows():
            close = float(row["Close"])
            if close > 0:
                result.append({
                    "date":  ts.isoformat(),
                    "value": round(close, 6),
                    "open":  round(float(row["Open"]),  6),
                    "high":  round(float(row["High"]),  6),
                    "low":   round(float(row["Low"]),   6),
                    "close": round(close, 6),
                })
        return result
    except Exception as e:
        logger.error(f"Intraday error: {e}")
        return []


@router.get("/quote/{ticker}", tags=["Market"])
async def get_quote(ticker: str) -> dict:
    """Market quote — fast_info + info.sector/country via yfinance."""
    import yfinance as yf
    import asyncio, math
    from concurrent.futures import ThreadPoolExecutor
    from app.services.rankings import get_rank, update_mcap

    def fetch():
        t = yf.Ticker(ticker)
        fi = t.fast_info
        info = {}
        try:
            info = t.info or {}
        except Exception:
            pass
        return fi, info

    try:
        loop = asyncio.get_running_loop()
        with ThreadPoolExecutor(max_workers=1) as pool:
            fi, info = await loop.run_in_executor(pool, fetch)

        def safe(v):
            try:
                f = float(v)
                return None if (math.isnan(f) or math.isinf(f)) else round(f, 6)
            except Exception:
                return None

        market_cap = safe(getattr(fi, "market_cap", None))
        if market_cap:
            update_mcap(ticker, market_cap)

        return {
            "open":        safe(getattr(fi, "open",                        None)),
            "day_high":    safe(getattr(fi, "day_high",                   None)),
            "day_low":     safe(getattr(fi, "day_low",                    None)),
            "prev_close":  safe(getattr(fi, "previous_close",             None)),
            "year_high":   safe(getattr(fi, "year_high",                  None)),
            "year_low":    safe(getattr(fi, "year_low",                   None)),
            "volume":      safe(getattr(fi, "last_volume",                None)),
            "avg_volume":  safe(getattr(fi, "three_month_average_volume", None)),
            "market_cap":  market_cap,
            "currency":    getattr(fi, "currency", None) or info.get("currency"),
            "sector":      info.get("sector"),
            "country":     info.get("country"),
            "industry":    info.get("industry"),
            "global_rank": get_rank(ticker),
        }
    except Exception as e:
        logger.error(f"Quote error {ticker}: {e}")
        return {"error": str(e)}


@router.get("/news/{ticker}", tags=["Market"])
async def get_news(ticker: str, lang: str = "en") -> list:
    """Recent news for a ticker via yfinance. Optionally translated via MyMemory."""
    import yfinance as yf
    import asyncio, urllib.parse, urllib.request, json, re
    from concurrent.futures import ThreadPoolExecutor

    def fetch():
        try:
            t = yf.Ticker(ticker)
            news = t.news or []
            company_kw = ""
            try:
                info = t.info or {}
                short = info.get("shortName", "") or info.get("longName", "")
                if short:
                    stops = {"inc","corp","ltd","plc","sa","ag","nv","co","llc","holdings",
                             "group","int","intl","the","of","and","class","a","b"}
                    parts = re.sub(r"[,\.\-\(\)]", " ", short).split()
                    company_kw = next((w for w in parts if w.lower() not in stops and len(w) > 2), "")
            except Exception:
                pass
            return news, company_kw
        except Exception:
            return [], ""

    async def translate(text: str, target: str) -> str:
        if not text or target == "en":
            return text
        try:
            q = urllib.parse.quote(text[:500])
            url = f"https://api.mymemory.translated.net/get?q={q}&langpair=en|{target}&de=sachadup02@icloud.com"
            loop = asyncio.get_running_loop()
            def _get():
                with urllib.request.urlopen(url, timeout=4) as r:
                    return json.loads(r.read())
            data = await loop.run_in_executor(None, _get)
            translated = data.get("responseData", {}).get("translatedText", "")
            if translated and not translated.upper().startswith("PLEASE SELECT"):
                return translated
        except Exception:
            pass
        return text

    try:
        loop = asyncio.get_running_loop()
        with ThreadPoolExecutor(max_workers=1) as pool:
            raw, company_kw = await loop.run_in_executor(pool, fetch)

        # Keywords to match against titles (ticker base + company name)
        ticker_base = ticker.upper().split(".")[0].split("-")[0]  # AAPL, BTC, CW8
        keywords = [kw.lower() for kw in {ticker_base, company_kw} if kw]

        def is_relevant(title: str) -> bool:
            if not keywords:
                return True
            t = title.lower()
            for kw in keywords:
                idx = t.find(kw)
                if idx == -1:
                    continue
                # Must appear in the first half of the title OR be preceded by a word boundary
                # (not buried after a list of other tickers)
                if idx <= len(t) * 0.55:
                    return True
                # Accept if it follows a sentence-starting word ("pourquoi l'action apple"...)
                before = t[:idx].rstrip()
                if before.endswith(("'", "'", "l'", "d'", "de ", "du ", "le ", "la ", "les ", "l’", "d’")):
                    return True
            return False

        all_items = []
        for item in raw[:20]:
            content = item.get("content", item) if isinstance(item.get("content"), dict) else item
            title     = content.get("title", "")
            provider  = content.get("provider", {}) or {}
            publisher = provider.get("displayName", "") or content.get("publisher", "") or item.get("publisher", "")
            url_obj   = content.get("canonicalUrl", {}) or {}
            link      = url_obj.get("url", "") or item.get("link", "")
            pub_at    = content.get("pubDate", "") or item.get("providerPublishTime", 0)
            thumb     = None
            for src in [content.get("thumbnail"), item.get("thumbnail")]:
                if src and src.get("resolutions"):
                    thumb = src["resolutions"][0].get("url")
                    break
            if title:
                all_items.append({"title": title, "publisher": publisher, "link": link,
                                   "published_at": pub_at, "thumbnail": thumb, "_rel": is_relevant(title)})

        # Never pad a partially relevant feed with unrelated market stories.
        # Fall back only when Yahoo supplies no identifiable match at all.
        relevant = [i for i in all_items if i["_rel"]]
        result   = (relevant if relevant else all_items)[:6]
        for item in result:
            del item["_rel"]

        if lang != "en" and result:
            titles = await asyncio.gather(*[translate(item["title"], lang) for item in result])
            for item, t in zip(result, titles):
                item["title"] = t

        return result
    except Exception as e:
        logger.error(f"News error {ticker}: {e}")
        return []


_UNIVERSE: dict[str, dict] = {
    "NVDA":   {"sector":"Technology","country":"US","type":"EQUITY","mcap":"mega"},
    "AMD":    {"sector":"Technology","country":"US","type":"EQUITY","mcap":"large"},
    "INTC":   {"sector":"Technology","country":"US","type":"EQUITY","mcap":"large"},
    "QCOM":   {"sector":"Technology","country":"US","type":"EQUITY","mcap":"large"},
    "TXN":    {"sector":"Technology","country":"US","type":"EQUITY","mcap":"large"},
    "AVGO":   {"sector":"Technology","country":"US","type":"EQUITY","mcap":"mega"},
    "ARM":    {"sector":"Technology","country":"GB","type":"EQUITY","mcap":"large"},
    "SMCI":   {"sector":"Technology","country":"US","type":"EQUITY","mcap":"mid"},
    "ASML":   {"sector":"Technology","country":"NL","type":"EQUITY","mcap":"large"},
    "MSFT":   {"sector":"Technology","country":"US","type":"EQUITY","mcap":"mega"},
    "ADBE":   {"sector":"Technology","country":"US","type":"EQUITY","mcap":"large"},
    "CRM":    {"sector":"Technology","country":"US","type":"EQUITY","mcap":"large"},
    "NOW":    {"sector":"Technology","country":"US","type":"EQUITY","mcap":"large"},
    "PLTR":   {"sector":"Technology","country":"US","type":"EQUITY","mcap":"large"},
    "SAP":    {"sector":"Technology","country":"DE","type":"EQUITY","mcap":"large"},
    "GOOGL":  {"sector":"Communication Services","country":"US","type":"EQUITY","mcap":"mega"},
    "GOOG":   {"sector":"Communication Services","country":"US","type":"EQUITY","mcap":"mega"},
    "META":   {"sector":"Communication Services","country":"US","type":"EQUITY","mcap":"mega"},
    "NFLX":   {"sector":"Communication Services","country":"US","type":"EQUITY","mcap":"large"},
    "UBER":   {"sector":"Technology","country":"US","type":"EQUITY","mcap":"large"},
    "COIN":   {"sector":"Technology","country":"US","type":"EQUITY","mcap":"mid"},
    "AAPL":   {"sector":"Technology","country":"US","type":"EQUITY","mcap":"mega"},
    "AMZN":   {"sector":"Consumer Discretionary","country":"US","type":"EQUITY","mcap":"mega"},
    "TSLA":   {"sector":"Consumer Discretionary","country":"US","type":"EQUITY","mcap":"mega"},
    "ABNB":   {"sector":"Consumer Discretionary","country":"US","type":"EQUITY","mcap":"mid"},
    "MCD":    {"sector":"Consumer Discretionary","country":"US","type":"EQUITY","mcap":"large"},
    "SBUX":   {"sector":"Consumer Discretionary","country":"US","type":"EQUITY","mcap":"large"},
    "NKE":    {"sector":"Consumer Discretionary","country":"US","type":"EQUITY","mcap":"large"},
    "HD":     {"sector":"Consumer Discretionary","country":"US","type":"EQUITY","mcap":"large"},
    "DIS":    {"sector":"Communication Services","country":"US","type":"EQUITY","mcap":"large"},
    "MC.PA":  {"sector":"Consumer Discretionary","country":"FR","type":"EQUITY","mcap":"mega"},
    "KER.PA": {"sector":"Consumer Discretionary","country":"FR","type":"EQUITY","mcap":"large"},
    "STLA":   {"sector":"Consumer Discretionary","country":"NL","type":"EQUITY","mcap":"large"},
    "JPM":    {"sector":"Financials","country":"US","type":"EQUITY","mcap":"mega"},
    "BAC":    {"sector":"Financials","country":"US","type":"EQUITY","mcap":"large"},
    "GS":     {"sector":"Financials","country":"US","type":"EQUITY","mcap":"large"},
    "MS":     {"sector":"Financials","country":"US","type":"EQUITY","mcap":"large"},
    "BLK":    {"sector":"Financials","country":"US","type":"EQUITY","mcap":"large"},
    "SPGI":   {"sector":"Financials","country":"US","type":"EQUITY","mcap":"large"},
    "V":      {"sector":"Financials","country":"US","type":"EQUITY","mcap":"mega"},
    "MA":     {"sector":"Financials","country":"US","type":"EQUITY","mcap":"mega"},
    "PYPL":   {"sector":"Financials","country":"US","type":"EQUITY","mcap":"large"},
    "BNP.PA": {"sector":"Financials","country":"FR","type":"EQUITY","mcap":"large"},
    "ACA.PA": {"sector":"Financials","country":"FR","type":"EQUITY","mcap":"large"},
    "GLE.PA": {"sector":"Financials","country":"FR","type":"EQUITY","mcap":"mid"},
    "CS.PA":  {"sector":"Financials","country":"FR","type":"EQUITY","mcap":"large"},
    "ALV.DE": {"sector":"Financials","country":"DE","type":"EQUITY","mcap":"large"},
    "JNJ":    {"sector":"Healthcare","country":"US","type":"EQUITY","mcap":"large"},
    "UNH":    {"sector":"Healthcare","country":"US","type":"EQUITY","mcap":"mega"},
    "ABBV":   {"sector":"Healthcare","country":"US","type":"EQUITY","mcap":"large"},
    "MRK":    {"sector":"Healthcare","country":"US","type":"EQUITY","mcap":"large"},
    "LLY":    {"sector":"Healthcare","country":"US","type":"EQUITY","mcap":"mega"},
    "SAN.PA": {"sector":"Healthcare","country":"FR","type":"EQUITY","mcap":"large"},
    "PG":     {"sector":"Consumer Staples","country":"US","type":"EQUITY","mcap":"large"},
    "KO":     {"sector":"Consumer Staples","country":"US","type":"EQUITY","mcap":"large"},
    "WMT":    {"sector":"Consumer Staples","country":"US","type":"EQUITY","mcap":"mega"},
    "COST":   {"sector":"Consumer Staples","country":"US","type":"EQUITY","mcap":"large"},
    "OR.PA":  {"sector":"Consumer Staples","country":"FR","type":"EQUITY","mcap":"large"},
    "XOM":    {"sector":"Energy","country":"US","type":"EQUITY","mcap":"mega"},
    "CVX":    {"sector":"Energy","country":"US","type":"EQUITY","mcap":"large"},
    "TTE.PA": {"sector":"Energy","country":"FR","type":"EQUITY","mcap":"large"},
    "HON":    {"sector":"Industrials","country":"US","type":"EQUITY","mcap":"large"},
    "UPS":    {"sector":"Industrials","country":"US","type":"EQUITY","mcap":"large"},
    "CAT":    {"sector":"Industrials","country":"US","type":"EQUITY","mcap":"large"},
    "RTX":    {"sector":"Industrials","country":"US","type":"EQUITY","mcap":"large"},
    "BA":     {"sector":"Industrials","country":"US","type":"EQUITY","mcap":"large"},
    "LMT":    {"sector":"Industrials","country":"US","type":"EQUITY","mcap":"large"},
    "GE":     {"sector":"Industrials","country":"US","type":"EQUITY","mcap":"large"},
    "DE":     {"sector":"Industrials","country":"US","type":"EQUITY","mcap":"large"},
    "SIE.DE": {"sector":"Industrials","country":"DE","type":"EQUITY","mcap":"large"},
    "AIR.PA": {"sector":"Industrials","country":"FR","type":"EQUITY","mcap":"large"},
    "HO.PA":  {"sector":"Industrials","country":"FR","type":"EQUITY","mcap":"mid"},
    "DG.PA":  {"sector":"Industrials","country":"FR","type":"EQUITY","mcap":"mid"},
    "SU.PA":  {"sector":"Industrials","country":"FR","type":"EQUITY","mcap":"large"},
    "AI.PA":  {"sector":"Industrials","country":"FR","type":"EQUITY","mcap":"large"},
    "BTC-USD":{"sector":"Cryptocurrency","country":"GLOBAL","type":"CRYPTOCURRENCY","mcap":"mega"},
    "ETH-USD":{"sector":"Cryptocurrency","country":"GLOBAL","type":"CRYPTOCURRENCY","mcap":"large"},
    "SOL-USD":{"sector":"Cryptocurrency","country":"GLOBAL","type":"CRYPTOCURRENCY","mcap":"large"},
    "BNB-USD":{"sector":"Cryptocurrency","country":"GLOBAL","type":"CRYPTOCURRENCY","mcap":"large"},
    "ADA-USD":{"sector":"Cryptocurrency","country":"GLOBAL","type":"CRYPTOCURRENCY","mcap":"mid"},
    "DOGE-USD":{"sector":"Cryptocurrency","country":"GLOBAL","type":"CRYPTOCURRENCY","mcap":"mid"},
    "XRP-USD":{"sector":"Cryptocurrency","country":"GLOBAL","type":"CRYPTOCURRENCY","mcap":"large"},
    "SPY":    {"sector":"ETF","country":"US","type":"ETF","mcap":"mega"},
    "QQQ":    {"sector":"ETF","country":"US","type":"ETF","mcap":"mega"},
    "CW8.PA": {"sector":"ETF","country":"FR","type":"ETF","mcap":"large"},
    "GLD":    {"sector":"ETF","country":"US","type":"ETF","mcap":"large"},
    "AGG":    {"sector":"ETF","country":"US","type":"ETF","mcap":"large"},
    "VTI":    {"sector":"ETF","country":"US","type":"ETF","mcap":"mega"},
    "IWM":    {"sector":"ETF","country":"US","type":"ETF","mcap":"large"},
    "EFA":    {"sector":"ETF","country":"US","type":"ETF","mcap":"large"},
    "EEM":    {"sector":"ETF","country":"US","type":"ETF","mcap":"large"},
}


_SIMILAR_META_CACHE: dict[str, tuple[float, dict]] = {}
_SECTOR_ALIASES = {
    "consumer cyclical": "Consumer Discretionary",
    "consumer defensive": "Consumer Staples",
    "financial services": "Financials",
    "health care": "Healthcare",
}
_COUNTRY_ALIASES = {
    "united states": "US", "usa": "US", "united kingdom": "GB",
    "france": "FR", "germany": "DE", "netherlands": "NL",
    "switzerland": "CH", "canada": "CA", "japan": "JP",
    "australia": "AU", "hong kong": "HK",
}
_MCAP_ORDER = {"micro": 0, "small": 1, "mid": 2, "large": 3, "mega": 4}


def _normalise_similar_sector(value: str | None) -> str | None:
    if not value:
        return None
    return _SECTOR_ALIASES.get(value.strip().lower(), value.strip())


def _normalise_similar_country(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = value.strip()
    return _COUNTRY_ALIASES.get(cleaned.lower(), cleaned.upper() if len(cleaned) <= 3 else cleaned)


def _market_cap_tier(value: float | int | None) -> str | None:
    if not value or value <= 0:
        return None
    if value >= 200e9:
        return "mega"
    if value >= 50e9:
        return "large"
    if value >= 10e9:
        return "mid"
    if value >= 2e9:
        return "small"
    return "micro"


@router.get("/similar/{ticker}", tags=["Market"])
async def get_similar(ticker: str, by: str = "sector") -> list:
    """Return relevant peers by sector, geography or closest market cap."""
    import yfinance as yf
    import asyncio, math, time
    from concurrent.futures import ThreadPoolExecutor
    from app.services.rankings import get_market_cap, update_mcap

    ticker_up = ticker.upper()
    if by not in {"sector", "geography", "marketcap"}:
        raise HTTPException(status_code=400, detail="Filtre de similarité invalide")

    fallback_meta = dict(_UNIVERSE.get(ticker_up, {}))

    def fetch_target_meta() -> dict:
        """Refresh the source asset metadata, while retaining curated fallbacks."""
        cached = _SIMILAR_META_CACHE.get(ticker_up)
        if cached and time.time() - cached[0] < 3600:
            return dict(cached[1])
        meta = dict(fallback_meta)
        cached_market_cap = get_market_cap(ticker_up)
        if meta and cached_market_cap:
            meta.update({
                "market_cap": cached_market_cap,
                "mcap": _market_cap_tier(cached_market_cap) or meta.get("mcap"),
            })
            meta["sector"] = _normalise_similar_sector(meta.get("sector"))
            meta["country"] = _normalise_similar_country(meta.get("country"))
            _SIMILAR_META_CACHE[ticker_up] = (time.time(), dict(meta))
            return meta
        try:
            asset = yf.Ticker(ticker_up)
            info = asset.info or {}
            market_cap = None
            try:
                market_cap = float(asset.fast_info.market_cap or 0) or None
            except Exception:
                market_cap = float(info.get("marketCap") or 0) or None
            meta.update({
                "sector": _normalise_similar_sector(info.get("sector")) or meta.get("sector"),
                "country": _normalise_similar_country(info.get("country")) or meta.get("country"),
                "type": info.get("quoteType") or meta.get("type") or "EQUITY",
                "market_cap": market_cap,
                "mcap": _market_cap_tier(market_cap) or meta.get("mcap"),
            })
        except Exception:
            pass
        if meta:
            meta["sector"] = _normalise_similar_sector(meta.get("sector"))
            meta["country"] = _normalise_similar_country(meta.get("country"))
            _SIMILAR_META_CACHE[ticker_up] = (time.time(), dict(meta))
        return meta

    loop = asyncio.get_running_loop()
    with ThreadPoolExecutor(max_workers=1) as pool:
        meta = await loop.run_in_executor(pool, fetch_target_meta)

    if not meta:
        return []

    source_sector = _normalise_similar_sector(meta.get("sector"))
    source_country = _normalise_similar_country(meta.get("country"))
    source_type = meta.get("type") or "EQUITY"
    source_tier = meta.get("mcap")

    def candidate_matches(candidate: dict) -> bool:
        if candidate.get("type") != source_type:
            return False
        if by == "sector":
            return _normalise_similar_sector(candidate.get("sector")) == source_sector
        if by == "geography":
            return _normalise_similar_country(candidate.get("country")) == source_country
        return True

    def tier_distance(candidate: dict) -> int:
        if source_tier not in _MCAP_ORDER or candidate.get("mcap") not in _MCAP_ORDER:
            return 9
        return abs(_MCAP_ORDER[source_tier] - _MCAP_ORDER[candidate["mcap"]])

    def relevance(candidate: dict) -> tuple:
        same_sector = _normalise_similar_sector(candidate.get("sector")) == source_sector
        same_country = _normalise_similar_country(candidate.get("country")) == source_country
        # The selected dimension is mandatory; the others order peers by
        # business relevance rather than dictionary insertion order.
        if by == "sector":
            return (tier_distance(candidate), not same_country)
        if by == "geography":
            return (not same_sector, tier_distance(candidate))
        return (tier_distance(candidate), not same_sector, not same_country)

    candidate_pool = [
        (symbol, candidate)
        for symbol, candidate in _UNIVERSE.items()
        if symbol != ticker_up and candidate_matches(candidate)
    ]
    candidate_pool.sort(key=lambda item: relevance(item[1]))

    # Market-cap matching uses live numeric values and logarithmic distance,
    # avoiding very large companies being grouped with much smaller ones merely
    # because both were in the old broad "large" bucket.
    live_market_caps: dict[str, float] = {}
    if by == "marketcap" and candidate_pool:
        shortlist = [symbol for symbol, _ in candidate_pool[:28]]

        def fetch_market_cap(symbol: str) -> tuple[str, float | None]:
            cached_value = get_market_cap(symbol)
            if cached_value:
                return symbol, cached_value
            try:
                asset = yf.Ticker(symbol)
                value = float(asset.fast_info.market_cap or 0)
                if value > 0:
                    update_mcap(symbol, value)
                return symbol, value if value > 0 else None
            except Exception:
                return symbol, None

        with ThreadPoolExecutor(max_workers=6) as pool:
            for symbol, value in pool.map(fetch_market_cap, shortlist):
                if value:
                    live_market_caps[symbol] = value

        source_market_cap = meta.get("market_cap")
        if source_market_cap:
            candidate_pool = [item for item in candidate_pool if item[0] in shortlist]
            candidate_pool.sort(key=lambda item: (
                abs(math.log(live_market_caps[item[0]] / source_market_cap))
                if item[0] in live_market_caps else 99,
                relevance(item[1]),
            ))

    candidates = [symbol for symbol, _ in candidate_pool[:10]]

    if not candidates:
        return []

    try:
        loop = asyncio.get_running_loop()
        def fetch_prices():
            return yf.download(candidates, period="2d", progress=False, auto_adjust=True)
        with ThreadPoolExecutor(max_workers=1) as pool:
            hist = await loop.run_in_executor(pool, fetch_prices)

        result = []
        for t in candidates:
            try:
                closes = hist["Close"][t].dropna() if len(candidates) > 1 else hist["Close"].dropna()
                if len(closes) == 0:
                    continue
                price  = float(closes.iloc[-1])
                change = ((price - float(closes.iloc[-2])) / float(closes.iloc[-2]) * 100) if len(closes) >= 2 else 0.0
                if math.isnan(price):
                    continue
                result.append({"ticker": t, "sector": _UNIVERSE[t].get("sector"),
                                "country": _UNIVERSE[t].get("country"), "type": _UNIVERSE[t].get("type"),
                                "mcap": _UNIVERSE[t].get("mcap"),
                                "market_cap": live_market_caps.get(t),
                                "price": round(price, 4), "change": round(change, 2)})
            except Exception:
                continue
        return result
    except Exception as e:
        logger.error(f"Similar error {ticker}: {e}")
        return []
