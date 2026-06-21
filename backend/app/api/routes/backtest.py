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


@router.post("/backtest", response_model=BacktestResponse, tags=["Backtest"])
async def backtest(req: BacktestRequest) -> BacktestResponse:
    """
    Run a full portfolio backtest.

    - Fetches historical price data for all assets and the chosen benchmark
    - Computes performance, risk, and diversification metrics
    - Returns time series, correlation matrix, and automated commentary
    """
    try:
        return run_backtest(req)
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
        url = f"https://query1.finance.yahoo.com/v1/finance/search?q={q}&lang=en-US&region=US&quotesCount=20&newsCount=0&listsCount=0"
        headers = {"User-Agent": "Mozilla/5.0"}
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url, headers=headers)
            data = resp.json()
        quotes = data.get("quotes", [])
        results = []
        for q in quotes:
            qtype = q.get("quoteType", "")
            if qtype not in ("EQUITY", "ETF", "CRYPTOCURRENCY", "MUTUALFUND"):
                continue
            exchange = q.get("exchange", "")
            ALLOWED = {"NMS","NYQ","NGM","PCX","PAR","GER","FRA","LSE","AMS","EBS","TOR","ASX","STO","MIL","BRU"}
            if qtype in ("ETF","EQUITY") and exchange not in ALLOWED:
                continue
            score = 0
            if exchange in ("NMS", "NYQ", "NGM", "PCX"): score = 3
            elif exchange in ("PAR", "GER", "FRA", "LSE", "AMS", "EBS"): score = 2
            elif exchange in ("TOR", "ASX", "STO", "MIL", "BRU"): score = 1
            results.append({
                "ticker": q.get("symbol", ""),
                "name": q.get("longname") or q.get("shortname", ""),
                "type": qtype,
                "exchange": exchange,
                "score": score,
                "logo": q.get("logoUrl", "") or f"https://financialmodelingprep.com/image-stock/{q.get('symbol','')}.png",
            })
        results.sort(key=lambda x: x["score"], reverse=True)
        for r in results: r.pop("score", None)
        return {"results": results[:8]}
    except Exception as e:
        logger.error(f"Search error: {e}")
        return {"results": []}


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

@router.get("/prices", tags=["Prices"])
async def get_prices(tickers: str = "") -> list:
    """Get current prices for multiple tickers via batch download."""
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

        def batch_download():
            arg = ticker_list[0] if len(ticker_list) == 1 else ticker_list
            return yf.download(arg, period="2d", progress=False, auto_adjust=True)

        loop = asyncio.get_running_loop()
        with ThreadPoolExecutor(max_workers=1) as pool:
            hist = await loop.run_in_executor(pool, batch_download)

        if hist.empty:
            return []

        close = hist["Close"]
        results = []

        for ticker in ticker_list:
            try:
                if len(ticker_list) == 1:
                    series = close if isinstance(close, pd.Series) else close.iloc[:, 0]
                else:
                    if ticker not in close.columns:
                        continue
                    series = close[ticker]
                series = series.dropna()
                if len(series) == 0:
                    continue
                price = float(series.iloc[-1])
                prev = float(series.iloc[-2]) if len(series) >= 2 else price
                if price <= 0:
                    continue
                change = ((price - prev) / prev * 100) if prev else 0
                results.append({"symbol": ticker, "price": round(price, 4), "change": round(change, 2)})
            except Exception:
                continue

        return results
    except Exception as e:
        logger.error(f"Prices error: {e}")
        return []

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
    binance_symbol = _yahoo_to_binance_symbol(ticker)
    if binance_symbol:
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

        allowed_intervals = {"1m","2m","5m","15m","30m","60m","1h","1d"}
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
