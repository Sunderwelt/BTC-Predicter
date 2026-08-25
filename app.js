const API = "https://api.coingecko.com/api/v3";
const state = { days: 7, points: [], currency: "usd" };

const $ = (id) => document.getElementById(id);
const money = (value, digits = 0) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits }).format(value);
const pct = (value) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
const mean = (values) => values.reduce((sum, n) => sum + n, 0) / values.length;
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));

function toast(message) { const el = $("toast"); el.textContent = message; el.classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 2800); }

async function fetchMarket(days) {
  const response = await fetch(`${API}/coins/bitcoin/market_chart?vs_currency=usd&days=${days}&interval=${days <= 1 ? "hourly" : "daily"}`);
  if (!response.ok) throw new Error(`Market API returned ${response.status}`);
  const data = await response.json();
  if (!data.prices?.length) throw new Error("No price history returned");
  return data.prices.map(([time, price]) => ({ time, price }));
}

function seededDemoData(days) {
  const count = days === 1 ? 48 : Math.max(30, days * 4); let price = 116400; const now = Date.now();
  return Array.from({ length: count }, (_, i) => { price *= 1 + Math.sin(i * .67) * .0017 + Math.sin(i * .11) * .001 + .00008; return { time: now - (count - i - 1) * days * 86400000 / count, price }; });
}

function returns(points) { return points.slice(1).map((p, i) => (p.price - points[i].price) / points[i].price); }

function analyze(points) {
  const prices = points.map(p => p.price); const current = prices.at(-1); const start = prices[0];
  const shortN = Math.min(7, prices.length); const longN = Math.min(21, prices.length);
  const shortAvg = mean(prices.slice(-shortN)); const longAvg = mean(prices.slice(-longN));
  const momentum = (current / prices[Math.max(0, prices.length - Math.min(8, prices.length))] - 1) * 100;
  const rets = returns(points); const avgRet = mean(rets); const variance = mean(rets.map(r => (r - avgRet) ** 2));
  const volatility = Math.sqrt(variance) * Math.sqrt(Math.min(24, points.length)) * 100;
  const trendSpread = ((shortAvg / longAvg) - 1) * 100;
  const score = clamp(trendSpread * 18 + momentum * 1.7, -22, 22);
  const probability = Math.round(clamp(50 + score, 25, 75));
  const confidence = Math.round(clamp(50 + Math.abs(score) * 1.5 - volatility * 2, 36, 82));
  const projectedReturn = clamp((probability - 50) / 100 * (volatility + 1.1), -.035, .035);
  const target = current * (1 + projectedReturn); const rangeWidth = current * Math.max(.008, volatility / 100 * .72);
  return { current, start, change:(current/start-1)*100, momentum, volatility, trendSpread, probability, confidence, target, low:target-rangeWidth, high:target+rangeWidth };
}

function renderSummary(model) {
  $("currentPrice").textContent = money(model.current, 0);
  const change = $("priceChange"); change.textContent = `${pct(model.change)} · ${state.days === 1 ? "24H" : state.days + "D"}`; change.className = `price-change ${model.change > 0 ? "positive" : model.change < 0 ? "negative" : "neutral"}`;
  $("lastUpdated").textContent = `Updated ${new Date().toLocaleTimeString([], { hour:"numeric", minute:"2-digit" })}`;
  $("upProbability").textContent = `${model.probability}%`; $("probabilityRing").style.background = `conic-gradient(var(--orange) 0 ${model.probability}%, #202631 ${model.probability}%)`;
  const bullish = model.probability >= 54, bearish = model.probability <= 46;
  $("forecastDirection").textContent = bullish ? "Bullish bias" : bearish ? "Bearish bias" : "Neutral / mixed";
  $("forecastSummary").textContent = bullish ? "Momentum and trend structure favor upside, with volatility defining the risk band." : bearish ? "Momentum is weakening and trend structure favors downside over the next session." : "Trend and momentum disagree. The model sees no meaningful directional edge.";
  $("confidenceTag").textContent = `${model.confidence}% CONFIDENCE`; $("targetPrice").textContent = money(model.target); $("expectedRange").textContent = `${money(model.low)} – ${money(model.high)}`;
  $("momentumMetric").textContent = pct(model.momentum); $("momentumLabel").textContent = Math.abs(model.momentum)<1?"Flat":model.momentum>0?"Positive":"Negative";
  $("volatilityMetric").textContent = `${model.volatility.toFixed(2)}%`; $("volatilityLabel").textContent = model.volatility>4?"Elevated":model.volatility>2?"Moderate":"Contained";
  const strength = clamp(Math.abs(model.trendSpread)*25,0,100); $("strengthMetric").textContent = `${strength.toFixed(0)}/100`; $("strengthLabel").textContent = strength>60?"Strong":strength>30?"Developing":"Weak";
  $("signalMetric").textContent = bullish?"BUY BIAS":bearish?"SELL BIAS":"NEUTRAL"; $("signalLabel").textContent = `${model.probability}% upside probability`;
}

function drawChart(points) {
  const canvas=$("priceChart"), wrap=canvas.parentElement, dpr=window.devicePixelRatio||1, width=wrap.clientWidth, height=wrap.clientHeight; canvas.width=width*dpr; canvas.height=height*dpr; const ctx=canvas.getContext("2d"); ctx.scale(dpr,dpr);
  const pad={t:18,r:8,b:14,l:8}, prices=points.map(p=>p.price), min=Math.min(...prices), max=Math.max(...prices), spread=max-min||1;
  const xy=(p,i)=>({x:pad.l+i/(points.length-1)*(width-pad.l-pad.r),y:pad.t+(max-p.price)/spread*(height-pad.t-pad.b)});
  ctx.strokeStyle="#1d232d"; ctx.lineWidth=1; for(let i=0;i<4;i++){const y=pad.t+i*(height-pad.t-pad.b)/3;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke()}
  const grad=ctx.createLinearGradient(0,0,0,height);grad.addColorStop(0,"rgba(247,147,26,.24)");grad.addColorStop(1,"rgba(247,147,26,0)");ctx.beginPath();points.forEach((p,i)=>{const q=xy(p,i);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)});ctx.lineTo(width-pad.r,height);ctx.lineTo(pad.l,height);ctx.closePath();ctx.fillStyle=grad;ctx.fill();
  ctx.beginPath();points.forEach((p,i)=>{const q=xy(p,i);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)});ctx.strokeStyle="#f7931a";ctx.lineWidth=2;ctx.lineJoin="round";ctx.stroke();
  canvas.onmousemove=(event)=>{const rect=canvas.getBoundingClientRect(),i=clamp(Math.round((event.clientX-rect.left)/rect.width*(points.length-1)),0,points.length-1),q=xy(points[i],i),tip=$("chartTooltip");tip.hidden=false;tip.style.left=`${q.x}px`;tip.style.top=`${q.y}px`;tip.textContent=`${money(points[i].price)} · ${new Date(points[i].time).toLocaleDateString([], {month:"short",day:"numeric"})}`}; canvas.onmouseleave=()=>$("chartTooltip").hidden=true;
  $("chartStart").textContent=new Date(points[0].time).toLocaleDateString([], {month:"short",day:"numeric"}); $("chartEnd").textContent=new Date(points.at(-1).time).toLocaleDateString([], {month:"short",day:"numeric"});
}

async function load(days=state.days) { state.days=days; $("refreshButton").classList.add("loading"); try { state.points=await fetchMarket(days); } catch(error) { console.warn(error); state.points=seededDemoData(days); toast("Live API unavailable — showing demo data"); } finally { $("refreshButton").classList.remove("loading"); }
  const model=analyze(state.points); renderSummary(model); drawChart(state.points); $("chartTitle").textContent=`${days===1?"24-hour":days+"-day"} market structure`;
}

document.querySelectorAll("[data-days]").forEach(button=>button.addEventListener("click",()=>{document.querySelectorAll("[data-days]").forEach(b=>b.classList.remove("active"));button.classList.add("active");load(Number(button.dataset.days))}));
$("refreshButton").addEventListener("click",()=>load()); window.addEventListener("resize",()=>state.points.length&&drawChart(state.points)); load();
