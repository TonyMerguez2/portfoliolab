# 📐 Financial Formulas & Methodology

This document details every financial formula used in PortfolioLab, with step-by-step derivations.

---

## 1. Data Preparation

### Daily Returns
From adjusted closing prices $P_t$:

$$r_t = \frac{P_t - P_{t-1}}{P_{t-1}} = \frac{P_t}{P_{t-1}} - 1$$

**Log returns** (used internally for stability):

$$r_t^{log} = \ln\left(\frac{P_t}{P_{t-1}}\right)$$

### Portfolio Returns
Given weights $w_i$ and asset returns $r_{i,t}$:

$$r_{p,t} = \sum_{i=1}^{N} w_i \cdot r_{i,t}$$

**Implementation note**: weights are rebalanced daily (constant-mix strategy).

---

## 2. Performance Metrics

### Total Return

$$R_{total} = \frac{V_T - V_0}{V_0} = \prod_{t=1}^{T}(1 + r_t) - 1$$

Computed as the cumulative product of `(1 + daily_returns)`.

### CAGR — Compound Annual Growth Rate

$$\text{CAGR} = \left(\frac{V_T}{V_0}\right)^{\frac{1}{n}} - 1$$

Where $n$ is the number of years:

$$n = \frac{T_{days}}{252}$$

252 = standard number of trading days per year.

**Example**: €10,000 → €14,693 over 3 years:
$$\text{CAGR} = \left(\frac{14{,}693}{10{,}000}\right)^{1/3} - 1 = 13.7\%$$

---

## 3. Risk Metrics

### Annualized Volatility

$$\sigma_{annual} = \sigma_{daily} \times \sqrt{252}$$

Where:
$$\sigma_{daily} = \sqrt{\frac{1}{T-1} \sum_{t=1}^{T}(r_t - \bar{r})^2}$$

This is the standard deviation of daily returns, scaled to annual frequency by the square root of time.

### Maximum Drawdown (MDD)

The MDD measures the largest peak-to-trough decline over the entire period.

**Step 1** — Compute cumulative wealth:
$$W_t = \prod_{s=1}^{t}(1 + r_s)$$

**Step 2** — Running maximum (high-water mark):
$$M_t = \max_{s \leq t} W_s$$

**Step 3** — Drawdown at each point:
$$DD_t = \frac{W_t - M_t}{M_t}$$

**Step 4** — Maximum Drawdown:
$$\text{MDD} = \min_t DD_t$$

MDD is always ≤ 0; expressed as a percentage (e.g. −32%).

### Calmar Ratio

$$\text{Calmar} = \frac{\text{CAGR}}{|\text{MDD}|}$$

Measures return per unit of drawdown risk.

---

## 4. Risk-Adjusted Returns

### Sharpe Ratio

$$S = \frac{R_p - R_f}{\sigma_p}$$

Where:
- $R_p$ = annualized portfolio return
- $R_f$ = risk-free rate (configurable, default 3.5% — Eurozone OAT 10Y)
- $\sigma_p$ = annualized volatility

**Interpretation**:
| Sharpe | Quality |
|--------|---------|
| < 0 | Negative excess return |
| 0 – 0.5 | Suboptimal |
| 0.5 – 1.0 | Acceptable |
| 1.0 – 2.0 | Good |
| > 2.0 | Excellent |

**Implementation** — computed from daily excess returns:
$$S = \frac{\overline{r_p - r_f^{daily}}}{\sigma_{daily}} \times \sqrt{252}$$

Where $r_f^{daily} = \frac{R_f}{252}$.

### Sortino Ratio

Like Sharpe but uses **downside deviation** instead of total volatility — only penalizes negative excess returns.

$$\text{Sortino} = \frac{R_p - R_f}{\sigma_{down}}$$

$$\sigma_{down} = \sqrt{\frac{252}{T} \sum_{t: r_t < R_f/252} (r_t - R_f/252)^2}$$

More appropriate for asymmetric return distributions (e.g., crypto).

---

## 5. Value at Risk (VaR)

### Historical VaR

Sort all observed daily returns in ascending order. The VaR at confidence level $\alpha$ is the $(\alpha)$-th percentile:

$$\text{VaR}_\alpha^{hist} = \text{Percentile}(r, 1 - \alpha)$$

For $\alpha = 95\%$: take the 5th percentile of daily returns.

**Monthly VaR** (scaled): $\text{VaR}_{monthly} = \text{VaR}_{daily} \times \sqrt{21}$

### Parametric VaR (Gaussian)

Assumes returns are normally distributed:

$$\text{VaR}_\alpha^{param} = -(\mu + z_\alpha \cdot \sigma)$$

Where $z_\alpha$ is the standard normal quantile (z = −1.645 for 95% CI).

**Limitation**: underestimates tail risk for fat-tailed distributions (crypto, small-caps).

---

## 6. Diversification — Correlation Matrix

For $N$ assets, the pairwise Pearson correlation:

$$\rho_{i,j} = \frac{\text{Cov}(r_i, r_j)}{\sigma_i \cdot \sigma_j}$$

Where:
$$\text{Cov}(r_i, r_j) = \frac{1}{T-1}\sum_{t=1}^{T}(r_{i,t} - \bar{r}_i)(r_{j,t} - \bar{r}_j)$$

**Interpretation**:
- $\rho = 1$: perfectly correlated (no diversification)
- $\rho = 0$: uncorrelated (maximum diversification benefit)
- $\rho = -1$: perfectly anticorrelated (natural hedge)

**Portfolio variance** with correlation:
$$\sigma_p^2 = \mathbf{w}^T \Sigma \mathbf{w} = \sum_i \sum_j w_i w_j \sigma_i \sigma_j \rho_{i,j}$$

---

## 7. Asset Contribution to Performance

Marginal contribution of asset $i$ to portfolio return:

$$\text{Contribution}_i = w_i \times R_i$$

Where $R_i$ is the total return of asset $i$ over the period.

Contribution to risk (marginal risk contribution):

$$\text{MRC}_i = \frac{w_i \cdot (\Sigma \mathbf{w})_i}{\sigma_p}$$

---

## 8. Efficient Frontier (Markowitz, 1952)

### Problem Formulation

**Objective**: minimize portfolio variance for a given expected return $\mu^*$:

$$\min_{\mathbf{w}} \quad \mathbf{w}^T \Sigma \mathbf{w}$$
$$\text{subject to:} \quad \mathbf{w}^T \boldsymbol{\mu} = \mu^* \quad \text{and} \quad \sum_i w_i = 1 \quad \text{and} \quad w_i \geq 0$$

### Maximum Sharpe Portfolio

$$\max_{\mathbf{w}} \quad \frac{\mathbf{w}^T \boldsymbol{\mu} - R_f}{\sqrt{\mathbf{w}^T \Sigma \mathbf{w}}}$$

**Solved via**: `scipy.optimize.minimize` with SLSQP (Sequential Least Squares Programming).

### Minimum Variance Portfolio

$$\min_{\mathbf{w}} \quad \mathbf{w}^T \Sigma \mathbf{w} \quad \text{s.t.} \quad \sum_i w_i = 1, \; w_i \geq 0$$

### Frontier Generation

1. Compute annualized expected returns $\boldsymbol{\mu}$ and covariance matrix $\Sigma$ from historical data
2. Solve the optimization for $n = 200$ target returns between $\mu_{min}$ and $\mu_{max}$
3. Plot $(\sigma^*, \mu^*)$ pairs to draw the frontier

---

## 9. Monte Carlo Simulations

Uses **Geometric Brownian Motion (GBM)**:

$$S_{t+1} = S_t \cdot \exp\left[\left(\mu - \frac{\sigma^2}{2}\right)\Delta t + \sigma \sqrt{\Delta t} \cdot Z_t\right]$$

Where $Z_t \sim \mathcal{N}(0,1)$ i.i.d.

**Parameters estimated from historical data**:
- $\mu$ = mean daily log return × 252 (annualized drift)
- $\sigma$ = std of daily log returns × √252 (annualized volatility)

**Procedure**:
1. Simulate $n_{sim} = 1000$ paths of $T_{days}$ trading days
2. Each path is an independent GBM trajectory
3. Report P5, P25, P50, P75, P95 percentile bands

**Limitation**: assumes log-normal returns, no regime changes, no autocorrelation.

---

## 10. Benchmark Comparison

| Benchmark | Ticker (yfinance) | Description |
|-----------|-------------------|-------------|
| S&P 500 | `^GSPC` | US large-cap equities |
| MSCI World | `URTH` | Global developed markets ETF |
| Nasdaq 100 | `^NDX` | US tech-heavy |
| CAC 40 | `^FCHI` | French large-cap equities |

Metrics computed identically for portfolio and benchmark, then compared:
- **Excess Return** = CAGR_portfolio − CAGR_benchmark
- **Tracking Error** = σ(r_portfolio − r_benchmark) × √252
- **Information Ratio** = Excess Return / Tracking Error

---

## References

- Markowitz, H. (1952). *Portfolio Selection*. Journal of Finance.
- Sharpe, W. F. (1966). *Mutual Fund Performance*. Journal of Business.
- Black, F. & Scholes, M. (1973). *The Pricing of Options and Corporate Liabilities*. JPE.
- Jorion, P. (2006). *Value at Risk: The New Benchmark for Managing Financial Risk*.
