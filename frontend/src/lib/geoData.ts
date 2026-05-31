// Pays d'origine des actions (pas la place de cotation)
export const STOCK_COUNTRY: Record<string, string> = {
  // 🇺🇸 États-Unis
  "AAPL": "🇺🇸 États-Unis", "MSFT": "🇺🇸 États-Unis", "NVDA": "🇺🇸 États-Unis",
  "GOOGL": "🇺🇸 États-Unis", "GOOG": "🇺🇸 États-Unis", "AMZN": "🇺🇸 États-Unis",
  "META": "🇺🇸 États-Unis", "TSLA": "🇺🇸 États-Unis", "BRK-B": "🇺🇸 États-Unis",
  "JPM": "🇺🇸 États-Unis", "V": "🇺🇸 États-Unis", "JNJ": "🇺🇸 États-Unis",
  "WMT": "🇺🇸 États-Unis", "XOM": "🇺🇸 États-Unis", "UNH": "🇺🇸 États-Unis",
  "MA": "🇺🇸 États-Unis", "PG": "🇺🇸 États-Unis", "HD": "🇺🇸 États-Unis",
  "CVX": "🇺🇸 États-Unis", "MRK": "🇺🇸 États-Unis", "ABBV": "🇺🇸 États-Unis",
  "KO": "🇺🇸 États-Unis", "PEP": "🇺🇸 États-Unis", "COST": "🇺🇸 États-Unis",
  "AVGO": "🇺🇸 États-Unis", "MCD": "🇺🇸 États-Unis", "AMD": "🇺🇸 États-Unis",
  "INTC": "🇺🇸 États-Unis", "NFLX": "🇺🇸 États-Unis", "DIS": "🇺🇸 États-Unis",
  "ADBE": "🇺🇸 États-Unis", "CRM": "🇺🇸 États-Unis", "PYPL": "🇺🇸 États-Unis",
  "ORCL": "🇺🇸 États-Unis", "IBM": "🇺🇸 États-Unis", "GE": "🇺🇸 États-Unis",
  "BAC": "🇺🇸 États-Unis", "WFC": "🇺🇸 États-Unis", "GS": "🇺🇸 États-Unis",
  "MS": "🇺🇸 États-Unis", "C": "🇺🇸 États-Unis", "UBER": "🇺🇸 États-Unis",
  "ABNB": "🇺🇸 États-Unis", "COIN": "🇺🇸 États-Unis", "PLTR": "🇺🇸 États-Unis",
  "SHOP": "🇨🇦 Canada",

  // 🇫🇷 France
  "MC.PA": "🇫🇷 France", "OR.PA": "🇫🇷 France", "TTE.PA": "🇫🇷 France",
  "TTE": "🇫🇷 France", "TOT": "🇫🇷 France",
  "SAN.PA": "🇫🇷 France", "AI.PA": "🇫🇷 France", "BNP.PA": "🇫🇷 France",
  "ACA.PA": "🇫🇷 France", "GLE.PA": "🇫🇷 France", "CAP.PA": "🇫🇷 France",
  "DSY.PA": "🇫🇷 France", "KER.PA": "🇫🇷 France", "RMS.PA": "🇫🇷 France",
  "SGO.PA": "🇫🇷 France", "VIE.PA": "🇫🇷 France", "EN.PA": "🇫🇷 France",
  "CS.PA": "🇫🇷 France", "SAF.PA": "🇫🇷 France", "AIR.PA": "🇫🇷 France",

  // 🇩🇪 Allemagne
  "SAP": "🇩🇪 Allemagne", "SAP.DE": "🇩🇪 Allemagne",
  "VOW3.DE": "🇩🇪 Allemagne", "BMW.DE": "🇩🇪 Allemagne",
  "SIE.DE": "🇩🇪 Allemagne", "BAYN.DE": "🇩🇪 Allemagne",
  "ALV.DE": "🇩🇪 Allemagne", "DTE.DE": "🇩🇪 Allemagne",
  "MBG.DE": "🇩🇪 Allemagne", "ADS.DE": "🇩🇪 Allemagne",
  "DHER.DE": "🇩🇪 Allemagne", "HEI.DE": "🇩🇪 Allemagne",

  // 🇳🇱 Pays-Bas
  "ASML": "🇳🇱 Pays-Bas", "ASML.AS": "🇳🇱 Pays-Bas",
  "PHIA.AS": "🇳🇱 Pays-Bas", "HEIA.AS": "🇳🇱 Pays-Bas",
  "INGA.AS": "🇳🇱 Pays-Bas", "NN.AS": "🇳🇱 Pays-Bas",

  // 🇨🇭 Suisse
  "NESN.SW": "🇨🇭 Suisse", "ROG.SW": "🇨🇭 Suisse",
  "NOVN.SW": "🇨🇭 Suisse", "UHR.SW": "🇨🇭 Suisse",
  "ZURN.SW": "🇨🇭 Suisse", "UBSG.SW": "🇨🇭 Suisse",

  // 🇬🇧 Royaume-Uni
  "SHEL.L": "🇬🇧 Royaume-Uni", "AZN.L": "🇬🇧 Royaume-Uni",
  "HSBA.L": "🇬🇧 Royaume-Uni", "BP.L": "🇬🇧 Royaume-Uni",
  "GSK.L": "🇬🇧 Royaume-Uni", "ULVR.L": "🇬🇧 Royaume-Uni",
  "AZN": "🇬🇧 Royaume-Uni", "BP": "🇬🇧 Royaume-Uni",

  // 🇯🇵 Japon
  "7203.T": "🇯🇵 Japon", "6758.T": "🇯🇵 Japon",
  "9984.T": "🇯🇵 Japon", "7974.T": "🇯🇵 Japon",
  "6861.T": "🇯🇵 Japon", "8306.T": "🇯🇵 Japon",

  // 🇰🇷 Corée du Sud
  "005930.KS": "🇰🇷 Corée du Sud", "000660.KS": "🇰🇷 Corée du Sud",

  // 🇨🇳 Chine
  "BABA": "🇨🇳 Chine", "9988.HK": "🇨🇳 Chine",
  "TCEHY": "🇨🇳 Chine", "JD": "🇨🇳 Chine",
  "BIDU": "🇨🇳 Chine", "NIO": "🇨🇳 Chine",

  // 🇩🇰 Danemark
  "NOVO-B.CO": "🇩🇰 Danemark", "NVO": "🇩🇰 Danemark",

  // 🇸🇪 Suède
  "VOLV-B.ST": "🇸🇪 Suède", "ERIC-B.ST": "🇸🇪 Suède",

  // 🇨🇦 Canada
  "RY.TO": "🇨🇦 Canada", "TD.TO": "🇨🇦 Canada", "CNR.TO": "🇨🇦 Canada",

  // 🇦🇺 Australie
  "BHP.AX": "🇦🇺 Australie", "CBA.AX": "🇦🇺 Australie",
};

// Composition géographique des ETF majeurs
export const ETF_GEO: Record<string, Record<string, number>> = {
  // MSCI World
  "CW8.PA":   { "🇺🇸 États-Unis": 71, "🇯🇵 Japon": 6, "🇬🇧 Royaume-Uni": 4, "🇫🇷 France": 3, "🇨🇦 Canada": 3, "🇩🇪 Allemagne": 2, "🇨🇭 Suisse": 2, "🌍 Autres": 9 },
  "EWLD.PA":  { "🇺🇸 États-Unis": 71, "🇯🇵 Japon": 6, "🇬🇧 Royaume-Uni": 4, "🇫🇷 France": 3, "🇨🇦 Canada": 3, "🇩🇪 Allemagne": 2, "🇨🇭 Suisse": 2, "🌍 Autres": 9 },
  "WPEA.PA":  { "🇺🇸 États-Unis": 71, "🇯🇵 Japon": 6, "🇬🇧 Royaume-Uni": 4, "🇫🇷 France": 3, "🇨🇦 Canada": 3, "🇩🇪 Allemagne": 2, "🇨🇭 Suisse": 2, "🌍 Autres": 9 },
  "IWDA.AS":  { "🇺🇸 États-Unis": 71, "🇯🇵 Japon": 6, "🇬🇧 Royaume-Uni": 4, "🇫🇷 France": 3, "🇨🇦 Canada": 3, "🇩🇪 Allemagne": 2, "🇨🇭 Suisse": 2, "🌍 Autres": 9 },
  "VWCE.DE":  { "🇺🇸 États-Unis": 62, "🇯🇵 Japon": 5, "🇬🇧 Royaume-Uni": 4, "🇨🇳 Chine": 4, "🇫🇷 France": 3, "🇨🇦 Canada": 3, "🌍 Autres": 19 },
  "URTH":     { "🇺🇸 États-Unis": 71, "🇯🇵 Japon": 6, "🇬🇧 Royaume-Uni": 4, "🇫🇷 France": 3, "🇨🇦 Canada": 3, "🇩🇪 Allemagne": 2, "🌍 Autres": 11 },

  // S&P 500 / US
  "SPY":      { "🇺🇸 États-Unis": 100 },
  "QQQ":      { "🇺🇸 États-Unis": 100 },
  "IVV":      { "🇺🇸 États-Unis": 100 },
  "VOO":      { "🇺🇸 États-Unis": 100 },
  "VTI":      { "🇺🇸 États-Unis": 100 },

  // Marchés émergents
  "ESEA.PA":  { "🇨🇳 Chine": 27, "🇮🇳 Inde": 18, "🇧🇷 Brésil": 6, "🇸🇦 Arabie Saoudite": 5, "🇹🇼 Taïwan": 15, "🇰🇷 Corée du Sud": 12, "🌍 Autres": 17 },
  "PAEEM.PA": { "🇨🇳 Chine": 27, "🇮🇳 Inde": 18, "🇧🇷 Brésil": 6, "🇸🇦 Arabie Saoudite": 5, "🇹🇼 Taïwan": 15, "🇰🇷 Corée du Sud": 12, "🌍 Autres": 17 },
  "EEM":      { "🇨🇳 Chine": 27, "🇮🇳 Inde": 18, "🇧🇷 Brésil": 6, "🇹🇼 Taïwan": 15, "🇰🇷 Corée du Sud": 12, "🌍 Autres": 22 },
  "VWO":      { "🇨🇳 Chine": 27, "🇮🇳 Inde": 18, "🇧🇷 Brésil": 6, "🇹🇼 Taïwan": 15, "🇰🇷 Corée du Sud": 12, "🌍 Autres": 22 },

  // Asie ex-Japon
  "AAXJ":     { "🇨🇳 Chine": 30, "🇮🇳 Inde": 19, "🇹🇼 Taïwan": 17, "🇰🇷 Corée du Sud": 13, "🇭🇰 Hong Kong": 6, "🌍 Autres": 15 },
  "AEJ.PA":   { "🇨🇳 Chine": 28, "🇮🇳 Inde": 19, "🇹🇼 Taïwan": 16, "🇰🇷 Corée du Sud": 13, "🇦🇺 Australie": 8, "🌍 Autres": 16 },

  // STOXX Europe 600
  "MEUD.PA":  { "🇬🇧 Royaume-Uni": 22, "🇨🇭 Suisse": 14, "🇫🇷 France": 13, "🇩🇪 Allemagne": 13, "🇸🇪 Suède": 6, "🇳🇱 Pays-Bas": 6, "🇩🇰 Danemark": 5, "🌍 Autres Europe": 21 },
  "EXSA.DE":  { "🇬🇧 Royaume-Uni": 22, "🇨🇭 Suisse": 14, "🇫🇷 France": 13, "🇩🇪 Allemagne": 13, "🇸🇪 Suède": 6, "🇳🇱 Pays-Bas": 6, "🇩🇰 Danemark": 5, "🌍 Autres Europe": 21 },

  // Obligations
  "TLT":      { "🇺🇸 États-Unis": 100 },
  "AGG":      { "🇺🇸 États-Unis": 100 },

  // Or
  "GLD":      { "🥇 Or (mondial)": 100 },
  "IAU":      { "🥇 Or (mondial)": 100 },
};

// Crypto = décentralisé
export const CRYPTO_TICKERS = new Set([
  "BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "ADA-USD",
  "XRP-USD", "DOT-USD", "AVAX-USD", "MATIC-USD", "LINK-USD",
  "DOGE-USD", "LTC-USD", "UNI-USD", "ATOM-USD",
]);
