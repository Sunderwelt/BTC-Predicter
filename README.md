# BTC Predicter

A polished Bitcoin market dashboard with a rolling, testable 15-minute forecast.

## Features

- Live one-minute BTC/USD candles from Kraken
- Live Kraken trade-price stream through WebSocket, painted once per second
- Interactive 1-hour, 3-hour, 6-hour, and 12-hour charts
- 15-minute momentum, realized volatility, RSI, and trend indicators
- Rolling 15-minute probability, target, and expected-range model
- Walk-forward historical validation with direction and range accuracy
- Browser-persisted live forecasts checked after 15 minutes
- Automatic 60-second refresh
- Forecast cycles synchronized to `:00`, `:15`, `:30`, and `:45`
- All displayed times locked to U.S. Eastern Time (`America/New_York`)
- Responsive dark interface with no runtime dependencies
- Graceful demo-data fallback when the public API is unavailable

## Run locally

No build step is required. Serve the directory with any static server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Forecast model

The estimate combines one-minute regression slope, moving-average spread, 15-minute momentum, RSI, and realized volatility. Probability is deliberately capped; this app does not pretend financial markets are predictable with certainty. Historical accuracy uses walk-forward evaluation so every test is scored against candles the model had not yet seen.

## Disclaimer

This project is educational and experimental. It is not financial advice.
