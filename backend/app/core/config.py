from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    fmp_api_key: str = ""
    app_name: str = "PortfolioLab API"
    app_version: str = "1.0.0"
    debug: bool = False

    # CORS — allow Next.js dev server
    allowed_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ]

    #: Les origines publiques du site en ligne, séparées par des virgules.
    #:
    #: Par exemple : ORIGINES_PUBLIQUES=https://novac.xyz,https://www.novac.xyz
    #:
    #: ⚠️ **Vide par défaut, et souvent inutile.** En production le frontal relaie l'API —
    #: voir les `rewrites` de next.config.js —, si bien que le navigateur n'appelle jamais
    #: que l'origine qu'il a chargée : le CORS ne se pose pas. Ce réglage existe pour le jour
    #: où l'API serait servie sur son propre sous-domaine, et pour qu'on n'ait pas alors à
    #: modifier du code pour publier.
    origines_publiques: str = ""

    # Finance defaults
    risk_free_rate: float = 0.035       # 3.5% — Eurozone OAT 10Y
    trading_days_per_year: int = 252
    initial_investment: float = 10_000.0

    # yfinance
    yfinance_timeout: int = 30

    class Config:
        env_file = ".env"


    @property
    def origines(self) -> list[str]:
        """Les origines autorisées : celles du développement, plus celles du site en ligne."""
        publiques = [o.strip() for o in self.origines_publiques.split(",") if o.strip()]
        return [*self.allowed_origins, *publiques]


@lru_cache
def get_settings() -> Settings:
    return Settings()
