# BTC Predicter

A polished, transparent Bitcoin market dashboard with a short-term, signal-based forecast.

## Features

- Live BTC/USD history from CoinGecko
- Interactive 24-hour, 7-day, 30-day, and 90-day charts
- Momentum, realized volatility, and trend-strength indicators
- Transparent 24-hour probability, target, and expected-range model
- Responsive dark interface with no runtime dependencies
- Graceful demo-data fallback when the public API is unavailable

## Run locally

No build step is required. Serve the directory with any static server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Forecast model

The estimate combines short/medium moving-average spread, recent momentum, and realized volatility. Probability is deliberately capped between 25% and 75%; this app does not pretend financial markets are predictable with certainty.

## Disclaimer

This project is educational and experimental. It is not financial advice.
