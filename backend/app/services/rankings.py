"""
Global equity rankings by market cap — computed dynamically.

Every call to /quote/{ticker} feeds market_cap into this module via update_mcap().
At startup a background thread pre-loads major global stocks so the rank is
meaningful from the first request.

Rank = position in the sorted-desc list of all known market caps.
"""
from __future__ import annotations

import logging
import threading
from typing import Optional

logger = logging.getLogger(__name__)

# Comprehensive list pre-loaded at startup (US, Europe, Asia, EM)
_PRELOAD = [
    # US mega / large cap
    "NVDA","AAPL","MSFT","AMZN","GOOGL","GOOG","META","TSLA","AVGO","WMT",
    "JPM","V","MA","XOM","COST","HD","LLY","BAC","PG","MRK","ABBV","GE",
    "KO","NFLX","RTX","ADBE","AMD","CRM","MCD","QCOM","NOW","GS","MS",
    "SPGI","BLK","DE","CAT","BA","LMT","DIS","NKE","UNH","PLTR","UBER",
    "TXN","HON","SBUX","PYPL","COIN","ARM","SMCI","ABNB","TSM",
    # Europe
    "ASML","MC.PA","NESN.SW","NOVN.SW","SAP","OR.PA","RO.SW","TTE.PA",
    "SU.PA","AIR.PA","SIE.DE","ALV.DE","BNP.PA","ACA.PA","DG.PA",
    "BMW.DE","VOW3.DE","BAYN.DE","BAS.DE","ADS.DE","GLE.PA","SAN.PA",
    "HO.PA","CS.PA","DTE.DE","AI.PA","KER.PA","STLA",
    "HSBA.L","SHEL.L","BP.L","GSK.L","RIO.L","AZN.L","ULVR.L",
    # Asia / EM
    "7203.T","6758.T","9984.T","005930.KS","BABA","TCEHY",
]

_mcap: dict[str, float] = {}  # ticker (upper) → market cap in native currency
_lock = threading.Lock()
_preload_done = False


def update_mcap(ticker: str, market_cap: float) -> None:
    """Feed a freshly-fetched market cap into the ranking dict."""
    if market_cap and market_cap > 0:
        with _lock:
            _mcap[ticker.upper()] = market_cap


def get_market_cap(ticker: str) -> Optional[float]:
    """Return the latest cached market cap for a ticker, when available."""
    with _lock:
        return _mcap.get(ticker.upper())


def get_rank(ticker: str) -> Optional[int]:
    """
    Return the rank of *ticker* among all stocks in the cache (market cap desc).
    Returns None while preload is running or if ticker is unknown.
    """
    if not _preload_done:
        return None  # wait for preload — avoids wrong rank (#1 when only 1 stock known)
    key = ticker.upper()
    with _lock:
        cap = _mcap.get(key)
        if cap is None:
            return None
        rank = 1
        for v in _mcap.values():
            if v > cap:
                rank += 1
        return rank


def _fetch_one(sym: str) -> None:
    import yfinance as yf
    try:
        cap = getattr(yf.Ticker(sym).fast_info, "market_cap", None)
        if cap and cap > 0:
            update_mcap(sym, cap)
    except Exception:
        pass


def _preload() -> None:
    from concurrent.futures import ThreadPoolExecutor, as_completed
    global _preload_done
    with ThreadPoolExecutor(max_workers=10) as ex:
        futures = {ex.submit(_fetch_one, sym): sym for sym in _PRELOAD}
        for f in as_completed(futures):
            pass  # errors handled inside _fetch_one
    _preload_done = True
    logger.info("Rankings pre-load done: %d/%d tickers", len(_mcap), len(_PRELOAD))


def start_preload() -> None:
    """Launch background pre-load once (called at app startup)."""
    threading.Thread(target=_preload, daemon=True, name="rankings-preload").start()
