from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "PortfolioLab API"
    app_version: str = "1.0.0"
    debug: bool = False

    # CORS — allow Next.js dev server
    allowed_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    # Finance defaults
    risk_free_rate: float = 0.035       # 3.5% — Eurozone OAT 10Y
    trading_days_per_year: int = 252
    initial_investment: float = 10_000.0

    # yfinance
    yfinance_timeout: int = 30

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
