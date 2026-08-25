const KRAKEN_API = "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1";
const FORECAST_HORIZON = 15;
const REFRESH_SECONDS = 60;
const STORAGE_KEY = "btc-predicter-live-forecasts-v1";
const state = { minutes: 180, candles: [], refreshAt: Date.now() + REFRESH_SECONDS * 1000 };

const $ = id => document.getElementById(id);
const money = (value, digits = 0) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits }).format(value);
const pct = value => `${value >= 0 ? "+" : ""}${value.toFixed(3)}%`;
const mean = values => values.reduce((sum, n) => sum + n, 0) / Math.max(values.length, 1);
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));

function toast(message) { const el = $("toast"); el.textContent = message; el.classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 2800); }
function standardDeviation(values) { const avg = mean(values); return Math.sqrt(mean(values.map(n => (n - avg) ** 2))); }
function returns(candles) { return candles.slice(1).map((c, i) => c.close / candles[i].close - 1); }
function linearSlope(values) { const n = values.length, xMean = (n - 1) / 2, yMean = mean(values); let top = 0, bottom = 0; values.forEach((y, x) => { top += (x - xMean) * (y - yMean); bottom += (x - xMean) ** 2; }); return bottom ? top / bottom : 0; }
function rsi(values, period = 14) { const slice = values.slice(-(period + 1)); let gains = 0, losses = 0; for (let i = 1; i < slice.length; i++) { const d = slice[i] - slice[i - 1]; d >= 0 ? gains += d : losses -= d; } return losses === 0 ? 100 : 100 - 100 / (1 + gains / losses); }

async function fetchCandles() {
  const response = await fetch(KRAKEN_API, { cache: "no-store" });
  if (!response.ok) throw new Error(`Kraken returned ${response.status}`);
  const data = await response.json();
  if (data.error?.length) throw new Error(data.error.join(", "));
  const key = Object.keys(data.result).find(k => k !== "last");
  return data.result[key].map(row => ({ time: row[0] * 1000, open: +row[1], high: +row[2], low: +row[3], close: +row[4], volume: +row[6] }));
}

function seededDemoData() { const now = Math.floor(Date.now() / 60000) * 60000; let close = 116400; return Array.from({ length: 720 }, (_, i) => { const open = close; close *= 1 + Math.sin(i * .31) * .00018 + Math.sin(i * .071) * .00011 + .000006; const wiggle = close * .0002; return { time: now - (719 - i) * 60000, open, high: Math.max(open, close) + wiggle, low: Math.min(open, close) - wiggle, close, volume: 2 + Math.abs(Math.sin(i)) * 4 }; }); }

function analyze(candles) {
  const sample = candles.slice(-180), closes = sample.map(c => c.close), current = closes.at(-1);
  const short = mean(closes.slice(-9)), medium = mean(closes.slice(-30));
  const slope = linearSlope(closes.slice(-30)) / current;
  const momentum15 = current / closes.at(-16) - 1;
  const maSpread = short / medium - 1;
  const rsiValue = rsi(closes);
  const oneMinVol = standardDeviation(returns(sample).slice(-60));
  const horizonVol = oneMinVol * Math.sqrt(FORECAST_HORIZON);
  const rawReturn = slope * FORECAST_HORIZON * .45 + momentum15 * .28 + maSpread * .55 + (50 - rsiValue) / 100 * horizonVol * .12;
  const projectedReturn = clamp(rawReturn, -horizonVol * 1.8, horizonVol * 1.8);
  const agreement = Math.sign(slope) + Math.sign(momentum15) + Math.sign(maSpread);
  const signalToNoise = horizonVol ? Math.abs(projectedReturn) / horizonVol : 0;
  const probability = Math.round(clamp(50 + Math.sign(projectedReturn) * (8 + signalToNoise * 20 + Math.abs(agreement) * 2), 27, 73));
  const confidence = Math.round(clamp(42 + signalToNoise * 25 + Math.abs(agreement) * 4, 38, 79));
  const target = current * (1 + projectedReturn), band = current * Math.max(horizonVol * 1.05, .00045);
  return { current, momentum: momentum15 * 100, volatility: horizonVol * 100, trendStrength: clamp(Math.abs(slope) / Math.max(oneMinVol, .000001) * 32, 0, 100), rsi: rsiValue, probability, confidence, target, low: target - band, high: target + band, direction: projectedReturn >= 0 ? "up" : "down" };
}

function backtest(candles) {
  const results = [];
  for (let i = 180; i < candles.length - FORECAST_HORIZON; i += 5) {
    const model = analyze(candles.slice(0, i + 1)), actual = candles[i + FORECAST_HORIZON].close, start = candles[i].close;
    results.push({ directionHit: Math.sign(model.target - start) === Math.sign(actual - start), rangeHit: actual >= model.low && actual <= model.high, error: Math.abs(model.target - actual) / actual * 100 });
  }
  return results;
}

function getLiveForecasts() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } }
function updateLiveForecasts(model) {
  const now = Date.now(), bucket = Math.floor(now / 300000) * 300000;
  let records = getLiveForecasts().map(record => {
    if (!record.actual && now >= record.maturesAt) return { ...record, actual: model.current, directionHit: Math.sign(record.target - record.start) === Math.sign(model.current - record.start), rangeHit: model.current >= record.low && model.current <= record.high };
    return record;
  });
  if (!records.some(r => r.createdAt === bucket)) records.push({ createdAt: bucket, maturesAt: bucket + FORECAST_HORIZON * 60000, start: model.current, target: model.target, low: model.low, high: model.high, direction: model.direction });
  records = records.slice(-200); localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); return records;
}

function render(model, historical, liveRecords) {
  const candles = state.candles.slice(-state.minutes), first = candles[0].close, chartChange = (model.current / first - 1) * 100;
  $("currentPrice").textContent = money(model.current); const change = $("priceChange"); change.textContent = `${pct(chartChange)} · ${state.minutes / 60}H`; change.className = `price-change ${chartChange > 0 ? "positive" : chartChange < 0 ? "negative" : "neutral"}`;
  $("lastUpdated").textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}`;
  $("upProbability").textContent = `${model.probability}%`; $("probabilityRing").style.background = `conic-gradient(var(--orange) 0 ${model.probability}%, #202631 ${model.probability}%)`;
  const bullish = model.probability >= 54, bearish = model.probability <= 46;
  $("forecastDirection").textContent = bullish ? "Bullish 15m bias" : bearish ? "Bearish 15m bias" : "Neutral / mixed";
  $("forecastSummary").textContent = bullish ? "Minute-level momentum and trend favor a higher price fifteen minutes from now." : bearish ? "Short-term momentum and trend favor a lower price fifteen minutes from now." : "Signals conflict, so the model sees no useful short-term directional edge.";
  $("confidenceTag").textContent = `${model.confidence}% CONFIDENCE`; $("targetPrice").textContent = money(model.target); $("expectedRange").textContent = `${money(model.low)} – ${money(model.high)}`;
  $("momentumMetric").textContent = pct(model.momentum); $("momentumLabel").textContent = Math.abs(model.momentum) < .05 ? "Flat" : model.momentum > 0 ? "Positive" : "Negative";
  $("volatilityMetric").textContent = `${model.volatility.toFixed(3)}%`; $("volatilityLabel").textContent = model.volatility > .8 ? "Elevated" : model.volatility > .35 ? "Moderate" : "Contained";
  $("strengthMetric").textContent = `${model.trendStrength.toFixed(0)}/100`; $("strengthLabel").textContent = model.trendStrength > 60 ? "Strong" : model.trendStrength > 30 ? "Developing" : "Weak";
  $("signalMetric").textContent = bullish ? "BUY BIAS" : bearish ? "SELL BIAS" : "NEUTRAL"; $("signalLabel").textContent = `${model.probability}% upside probability`;
  $("sampleSize").textContent = `${historical.length} historical forecasts`; $("directionAccuracy").textContent = historical.length ? `${Math.round(mean(historical.map(r => r.directionHit ? 1 : 0)) * 100)}%` : "—"; $("rangeAccuracy").textContent = historical.length ? `${Math.round(mean(historical.map(r => r.rangeHit ? 1 : 0)) * 100)}%` : "—"; $("meanError").textContent = historical.length ? `${mean(historical.map(r => r.error)).toFixed(3)}%` : "—"; $("liveTracked").textContent = liveRecords.filter(r => r.actual).length;
  $("chartTitle").textContent = `${state.minutes / 60}-hour market structure`; drawChart(candles);
}

function drawChart(candles) {
  const points = candles.map(c => ({ time: c.time, price: c.close })), canvas = $("priceChart"), wrap = canvas.parentElement, dpr = window.devicePixelRatio || 1, width = wrap.clientWidth, height = wrap.clientHeight; canvas.width = width * dpr; canvas.height = height * dpr; const ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr);
  const pad = { t: 18, r: 8, b: 14, l: 8 }, prices = points.map(p => p.price), min = Math.min(...prices), max = Math.max(...prices), spread = max - min || 1, xy = (p, i) => ({ x: pad.l + i / (points.length - 1) * (width - pad.l - pad.r), y: pad.t + (max - p.price) / spread * (height - pad.t - pad.b) });
  ctx.strokeStyle = "#1d232d"; ctx.lineWidth = 1; for (let i = 0; i < 4; i++) { const y = pad.t + i * (height - pad.t - pad.b) / 3; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  const grad = ctx.createLinearGradient(0, 0, 0, height); grad.addColorStop(0, "rgba(247,147,26,.24)"); grad.addColorStop(1, "rgba(247,147,26,0)"); ctx.beginPath(); points.forEach((p, i) => { const q = xy(p, i); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }); ctx.lineTo(width - pad.r, height); ctx.lineTo(pad.l, height); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath(); points.forEach((p, i) => { const q = xy(p, i); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }); ctx.strokeStyle = "#f7931a"; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();
  canvas.onmousemove = event => { const rect = canvas.getBoundingClientRect(), i = clamp(Math.round((event.clientX - rect.left) / rect.width * (points.length - 1)), 0, points.length - 1), q = xy(points[i], i), tip = $("chartTooltip"); tip.hidden = false; tip.style.left = `${q.x}px`; tip.style.top = `${q.y}px`; tip.textContent = `${money(points[i].price)} · ${new Date(points[i].time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`; }; canvas.onmouseleave = () => $("chartTooltip").hidden = true;
  $("chartStart").textContent = new Date(points[0].time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); $("chartEnd").textContent = new Date(points.at(-1).time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

async function load({ silent = false } = {}) {
  if (!silent) $("refreshButton").classList.add("loading");
  try { state.candles = await fetchCandles(); } catch (error) { console.warn(error); state.candles = seededDemoData(); toast("Live API unavailable — showing demo data"); }
  finally { $("refreshButton").classList.remove("loading"); }
  const model = analyze(state.candles), historical = backtest(state.candles), liveRecords = updateLiveForecasts(model); state.refreshAt = Date.now() + REFRESH_SECONDS * 1000; render(model, historical, liveRecords);
}

document.querySelectorAll("[data-minutes]").forEach(button => button.addEventListener("click", () => { document.querySelectorAll("[data-minutes]").forEach(b => b.classList.remove("active")); button.classList.add("active"); state.minutes = +button.dataset.minutes; render(analyze(state.candles), backtest(state.candles), getLiveForecasts()); }));
$("refreshButton").addEventListener("click", () => load()); window.addEventListener("resize", () => state.candles.length && drawChart(state.candles.slice(-state.minutes)));
setInterval(() => { const seconds = Math.max(0, Math.ceil((state.refreshAt - Date.now()) / 1000)); $("countdown").textContent = `00:${String(seconds).padStart(2, "0")}`; if (seconds === 0) load({ silent: true }); }, 1000);
load();
