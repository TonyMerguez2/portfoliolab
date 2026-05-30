# 📈 PortfolioLab — Backtesting Engine

> A professional-grade portfolio backtesting web application built with Next.js, FastAPI, and quantitative finance libraries.

[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-green.svg)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-14+-black.svg)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 🎯 Project Overview

PortfolioLab is a full-stack application for backtesting multi-asset portfolios. It fetches historical market data via Yahoo Finance and computes a comprehensive suite of performance, risk, and diversification metrics — with intelligent commentary and interactive visualizations.

Built as a portfolio project targeting **quantitative finance** and **financial engineering** roles.

---

## ✨ Features

### Core
- **Multi-asset portfolio** — stocks, ETFs, indices, crypto (AAPL, CW8.PA, BTC-USD…)
- **Flexible allocation** — manual weights with automatic 100% validation
- **Time horizons** — 1Y, 3Y, 5Y, 10Y, or max available
- **Benchmark comparison** — S&P 500, MSCI World, Nasdaq 100, CAC 40

### Metrics
| Category | Metrics |
|---|---|
| Performance | Total return, CAGR |
| Risk | Annualized volatility, Max Drawdown, VaR (historical & parametric) |
| Risk-adjusted | Sharpe ratio, Sortino ratio |
| Diversification | Correlation matrix, individual asset contribution |

### Visualizations
- Portfolio growth curve (€10,000 initial investment)
- Allocation pie chart
- Correlation heatmap
- Monthly returns histogram
- Historical drawdown chart
- Efficient frontier (Markowitz)
- Monte Carlo simulations

### Intelligence
Automated narrative commentary on performance, risk levels, diversification quality, and Sharpe interpretation.

---

## 🏗️ Architecture

```
portfoliolab/
├── backend/          # Python FastAPI — financial computations
│   └── app/
│       ├── api/      # REST endpoints
│       ├── core/     # Config, security
│       ├── models/   # Pydantic schemas
│       ├── services/ # Business logic (yfinance, calculations)
│       └── utils/    # Financial formulas
├── frontend/         # Next.js 14 + TypeScript
│   └── src/
│       ├── app/      # App Router pages
│       ├── components/
│       │   ├── charts/   # Recharts visualizations
│       │   ├── forms/    # Portfolio builder form
│       │   └── ui/       # Reusable UI components
│       ├── hooks/    # Custom React hooks
│       ├── lib/      # API client, utilities
│       └── types/    # TypeScript interfaces
└── docs/             # Architecture & formulas documentation
```

---

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- Git

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API docs available at: `http://localhost:8000/docs`

### Frontend
```bash
cd frontend
npm install
npm run dev
```

App available at: `http://localhost:3000`

---

## 📡 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/backtest` | Run a full backtest |
| `GET` | `/api/v1/validate-ticker/{ticker}` | Validate a ticker symbol |
| `GET` | `/api/v1/benchmarks` | List available benchmarks |
| `POST` | `/api/v1/efficient-frontier` | Compute Markowitz frontier |
| `POST` | `/api/v1/monte-carlo` | Run Monte Carlo simulations |

Full Swagger documentation: `/docs` | ReDoc: `/redoc`

---

## 📐 Financial Formulas

See [`docs/FORMULAS.md`](docs/FORMULAS.md) for detailed derivations of:
- CAGR calculation
- Sharpe & Sortino ratios
- Maximum Drawdown
- Historical & Parametric VaR
- Markowitz Efficient Frontier
- Monte Carlo projection methodology

---

## 🛠️ Tech Stack

**Backend**
- [FastAPI](https://fastapi.tiangolo.com/) — async REST API
- [yfinance](https://github.com/ranaroussi/yfinance) — Yahoo Finance data
- [Pandas](https://pandas.pydata.org/) — data manipulation
- [NumPy](https://numpy.org/) — numerical computations
- [SciPy](https://scipy.org/) — optimization (efficient frontier)

**Frontend**
- [Next.js 14](https://nextjs.org/) — React framework with App Router
- [TypeScript](https://typescriptlang.org/) — type safety
- [Tailwind CSS](https://tailwindcss.com/) — utility-first styling
- [Recharts](https://recharts.org/) — composable charts
- [shadcn/ui](https://ui.shadcn.com/) — accessible UI components
- [React Query](https://tanstack.com/query) — server state management

---

## 📊 Screenshots

> *(Add screenshots of the dashboard once running)*

---

## 🗺️ Roadmap

- [x] MVP: portfolio backtest with core metrics
- [x] Benchmark comparison
- [x] Interactive visualizations
- [ ] PDF report export
- [ ] Portfolio optimization (max Sharpe)
- [ ] Monte Carlo projections
- [ ] User accounts & saved portfolios
- [ ] Real-time data with WebSockets

---

## 👤 Author

**[Your Name]** — Economics & Management student, specializing in quantitative finance.

- GitHub: [@yourusername](https://github.com/yourusername)
- LinkedIn: [linkedin.com/in/yourprofile](https://linkedin.com/in/yourprofile)

---

## 📄 License

MIT — free to use, fork, and adapt for your own projects.
