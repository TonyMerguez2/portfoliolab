"""
Data fetching service — Yahoo Finance via yfinance.
Handles downloading, cleaning, and aligning multi-asset price series.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import yfinance as yf

from app.core.config import get_settings
from app.models.schemas import Period

logger = logging.getLogger(__name__)
settings = get_settings()

BENCHMARK_NAMES = {
    "^GSPC": "S&P 500",
    "URTH": "MSCI World ETF",
    "^NDX": "Nasdaq 100",
    "^FCHI": "CAC 40",
}

PERIOD_TO_YEARS: dict[Period, float | None] = {
    Period.ONE_YEAR: 1,
    Period.THREE_YEARS: 3,
    Period.FIVE_YEARS: 5,
    Period.TEN_YEARS: 10,
    Period.MAX: None,
}


def _period_to_start_date(period: Period) -> str | None:
    """Convert a Period enum to a start date string (YYYY-MM-DD), or None for max."""
    years = PERIOD_TO_YEARS[period]
    if years is None:
        return None
    start = datetime.today() - timedelta(days=int(years * 365.25))
    return start.strftime("%Y-%m-%d")


def fetch_prices(
    tickers: list[str],
    period: Period,
) -> tuple[pd.DataFrame, list[str], list[str]]:
    """
    Download adjusted close prices for a list of tickers.

    Returns
    -------
    prices : pd.DataFrame
        DataFrame with dates as index, tickers as columns.
        Only tickers successfully fetched are included.
    successful : list[str]
        Tickers that were fetched successfully.
    failed : list[str]
        Tickers that failed (not found, no data, etc.).
    """
    start_date = _period_to_start_date(period)
    end_date = datetime.today().strftime("%Y-%m-%d")

    successful: list[str] = []
    failed: list[str] = []
    frames: dict[str, pd.Series] = {}

    for ticker in tickers:
        try:
            data = yf.download(
                ticker,
                start=start_date,
                end=end_date,
                progress=False,
                auto_adjust=True,
                timeout=settings.yfinance_timeout,
            )
            if data.empty or len(data) < 30:
                logger.warning(f"Insufficient data for {ticker}")
                failed.append(ticker)
                continue

            # Extract Close (already adjusted when auto_adjust=True)
            close = data["Close"]
            if isinstance(close, pd.DataFrame):
                close = close.iloc[:, 0]
            close.name = ticker
            frames[ticker] = close
            successful.append(ticker)

        except Exception as e:
            logger.error(f"Failed to fetch {ticker}: {e}")
            failed.append(ticker)

    if not frames:
        raise ValueError(f"Could not fetch any data. Failed tickers: {failed}")

    prices = pd.DataFrame(frames)

    # Align dates — keep only common trading days
    prices = prices.dropna(how="all")

    # Forward fill up to 3 days (weekends, local holidays)
    prices = prices.ffill(limit=3)

    # Drop remaining NaN rows (beginning of series for newer assets)
    prices = prices.dropna()

    prices.index = pd.to_datetime(prices.index)
    prices = prices.sort_index()

    return prices, successful, failed


def compute_returns(prices: pd.DataFrame) -> pd.DataFrame:
    """Compute daily simple returns from price series."""
    return prices.pct_change().dropna()


def validate_ticker(ticker: str) -> dict:
    """Quick validation of a ticker via yfinance info."""
    try:
        info = yf.Ticker(ticker.upper()).fast_info
        return {
            "ticker": ticker.upper(),
            "valid": True,
            "name": getattr(info, "exchange", None),
            "currency": getattr(info, "currency", None),
        }
    except Exception as e:
        return {
            "ticker": ticker.upper(),
            "valid": False,
            "error": str(e),
        }
