from fastapi import APIRouter
import yfinance as yf

router = APIRouter()

SYMBOLS = ["AAPL", "NVDA", "MSFT", "TSLA", "SPY", "AMZN", "GOOGL", "META", "BTC-USD", "ETH-USD"]

@router.get("/ticker")
async def get_ticker():
    result = []
    for symbol in SYMBOLS:
        try:
            t = yf.Ticker(symbol)
            info = t.fast_info
            price = info.last_price
            prev = info.previous_close
            change = ((price - prev) / prev * 100) if prev else 0
            result.append({
                "symbol": symbol.replace("-USD", ""),
                "price": round(price, 2),
                "change": round(change, 2)
            })
        except:
            pass
    return result
