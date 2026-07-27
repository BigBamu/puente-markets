const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const DEMO_MARKETS = [
  {id:"demo-1",question:"Will Arsenal win?",eventTitle:"Arsenal vs Chelsea",category:"moneyline",yesPrice:.52,noPrice:.48,yesTokenId:"",volume:284000,volume24h:46000,liquidity:52000,startTime:new Date(Date.now()+4*3600e3).toISOString(),url:"https://polymarket.com",image:"",isFootball:true},
  {id:"demo-2",question:"Over 2.5 goals?",eventTitle:"Barcelona vs Sevilla",category:"totals",yesPrice:.61,noPrice:.39,yesTokenId:"",volume:192000,volume24h:28000,liquidity:41000,startTime:new Date(Date.now()+6*3600e3).toISOString(),url:"https://polymarket.com",image:"",isFootball:true},
  {id:"demo-3",question:"Will both teams score?",eventTitle:"Inter vs Napoli",category:"props",yesPrice:.47,noPrice:.53,yesTokenId:"",volume:78000,volume24h:9400,liquidity:18500,startTime:new Date(Date.now()+8*3600e3).toISOString(),url:"https://polymarket.com",image:"",isFootball:true}
];

const defaultState = {
  cash: 10, startBalance: 10, realized: 0, positions: [], history: [],
  settings: { maxPosition: 5, profitAlert: 20, autopilot: false },
  lastPrices: {}, lastAutopilotAt: null
};
let state = loadState();
let markets = [];
let signals = [];
let dataSource = "loading";
let selectedMarket = null;

function loadState(){
  try { return {...structuredClone(defaultState), ...JSON.parse(localStorage.getItem("puente-markets-state") || "{}")}; }
  catch { return structuredClone(defaultState); }
}
function saveState(){ localStorage.setItem("puente-markets-state", JSON.stringify(state)); }
function money(n){ return `$${Number(n||0).toFixed(2)}`; }
function pct(n){ return `${n>=0?"+":""}${Number(n||0).toFixed(1)}%`; }
function clamp(n,min,max){ return Math.max(min,Math.min(max,n)); }
function formatCompact(n){ return new Intl.NumberFormat("sv-SE",{notation:"compact",maximumFractionDigits:1}).format(Number(n||0)); }
function safeText(value){ const d=document.createElement("div"); d.textContent=String(value??""); return d.innerHTML; }
function parseArray(value){
  if(Array.isArray(value)) return value;
  if(typeof value!=="string") return [];
  try{const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed:[];}catch{return value.split(",").map(v=>v.trim()).filter(Boolean);}
}
function numeric(value){const n=Number(value);return Number.isFinite(n)?n:0;}

function normalizeRawEvents(events){
  const out=[];
  for(const event of Array.isArray(events)?events:[]){
    for(const market of Array.isArray(event.markets)?event.markets:[]){
      const text=[event.title,event.category,event.subcategory,market.question,market.marketType,market.sportsMarketType,...(event.series||[]).flatMap(s=>[s.title,s.slug])].filter(Boolean).join(" ").toLowerCase();
      const excluded=["nba","basketball","nfl","mlb","baseball","nhl","hockey","tennis","cricket","ufc","mma","boxing"].some(w=>text.includes(w));
      const included=["soccer","football","premier league","la liga","serie a","bundesliga","ligue 1","champions league","europa league","mls","copa","libertadores","world cup","uefa","fifa","eredivisie","allsvenskan"].some(w=>text.includes(w));
      const matchup=/\b(vs\.?|v\.|versus)\b/.test(String(event.title||"").toLowerCase());
      if(excluded || (!included && !(market.gameStartTime && matchup))) continue;
      const outcomes=parseArray(market.outcomes); const prices=parseArray(market.outcomePrices).map(numeric); const tokens=parseArray(market.clobTokenIds);
      const yi=Math.max(0,outcomes.findIndex(o=>String(o).toLowerCase()==="yes")); const ni=Math.max(0,outcomes.findIndex(o=>String(o).toLowerCase()==="no"));
      out.push({
        id:String(market.id||market.conditionId||market.slug),question:market.question||market.groupItemTitle||event.title,
        eventTitle:event.title||market.question,category:market.sportsMarketType||market.marketType||market.formatType||"Övrigt",
        yesPrice:prices[yi]??prices[0]??.5,noPrice:prices[ni]??prices[1]??.5,yesTokenId:tokens[yi]||tokens[0]||"",
        volume:numeric(market.volumeNum??market.volume),volume24h:numeric(market.volume24hr),liquidity:numeric(market.liquidityNum??market.liquidity),
        startTime:market.gameStartTime||event.gameStartTime||market.startDate||event.startDate||"",image:market.icon||market.image||event.icon||event.image||"",
        url:event.slug?`https://polymarket.com/event/${event.slug}`:"https://polymarket.com",isFootball:true
      });
    }
  }
  return out.sort((a,b)=>(b.liquidity+b.volume24h)-(a.liquidity+a.volume24h));
}

async function loadMarkets(showLoading=true){
  if(showLoading){ $("#marketsList").innerHTML='<div class="skeleton"></div><div class="skeleton"></div>'; }
  try{
    let response=await fetch("/api/markets?limit=300",{cache:"no-store"});
    let data=await response.json();
    if(!response.ok || !Array.isArray(data.markets) || !data.markets.length){
      response=await fetch("/api/raw-events",{cache:"no-store"});
      const raw=await response.json();
      data={markets:normalizeRawEvents(raw),fetchedAt:new Date().toISOString()};
    }
    if(!data.markets.length) throw new Error("Inga fotbollsmarknader hittades");
    markets=data.markets; dataSource="live"; updatePricesFromMarkets();
    $("#sourceLabel").textContent="Live Polymarket-data"; $("#liveDot").classList.add("live");
    $("#updatedAt").textContent=new Date(data.fetchedAt||Date.now()).toLocaleTimeString("sv-SE",{hour:"2-digit",minute:"2-digit"});
  }catch(error){
    markets=DEMO_MARKETS; dataSource="demo"; updatePricesFromMarkets();
    $("#sourceLabel").textContent="Demoläge — live-data kunde inte nås"; $("#liveDot").classList.remove("live");
    $("#updatedAt").textContent="";
  }
  signals=buildSignals(markets); renderAll();
  if(state.settings.autopilot) maybeAutopilot();
}

function updatePricesFromMarkets(){
  for(const market of markets){
    const previous=state.lastPrices[market.id];
    if(Number.isFinite(previous)) market.change=((market.yesPrice-previous)/Math.max(previous,.01))*100;
    else market.change=0;
    state.lastPrices[market.id]=market.yesPrice;
  }
  for(const position of state.positions){
    const market=markets.find(m=>m.id===position.marketId);
    if(market) position.currentPrice=market.yesPrice;
  }
  saveState();
}

function buildSignals(items){
  return items.map(m=>{
    const liquidityScore=clamp(Math.log10(Math.max(m.liquidity,1))*14,0,55);
    const volumeScore=clamp(Math.log10(Math.max(m.volume24h||m.volume,1))*8,0,32);
    const balancedScore=clamp(13-Math.abs(.5-m.yesPrice)*22,0,13);
    const movement=Math.abs(m.change||0);
    const score=Math.round(clamp(liquidityScore+volumeScore+balancedScore-movement*.4,0,99));
    const existing=state.positions.find(p=>p.marketId===m.id);
    if(existing){
      const pnlPct=((m.yesPrice-existing.buyPrice)/existing.buyPrice)*100;
      if(pnlPct>=state.settings.profitAlert) return {type:"sell",score:Math.min(99,Math.round(70+pnlPct/3)),market:m,title:"Överväg simulerad försäljning",reason:`Positionen är ${pct(pnlPct)} sedan köpet. Skydda vinsten eller låt testet fortsätta.`};
      if(pnlPct<=-20) return {type:"review",score:82,market:m,title:"Positionen har försvagats",reason:`Marknadspriset är ${pct(pnlPct)} sedan köpet. Kontrollera om ursprungstesen fortfarande gäller.`};
    }
    const edgeLabel=score>=82?"Stark bevakning":score>=70?"Intressant bevakning":"Följ marknaden";
    return {type:"watch",score,market:m,title:edgeLabel,reason:`Likviditet ${formatCompact(m.liquidity)}, 24h-volym ${formatCompact(m.volume24h||m.volume)} och YES-pris ${(m.yesPrice*100).toFixed(0)}¢.`};
  }).sort((a,b)=>b.score-a.score);
}

function portfolioValue(){ return state.cash+state.positions.reduce((sum,p)=>sum+p.shares*(p.currentPrice??p.buyPrice),0); }
function renderSummary(){
  const value=portfolioValue(); const change=value-state.startBalance; const changePct=(change/state.startBalance)*100;
  $("#portfolioValue").textContent=money(value); $("#portfolioChange").textContent=`${change>=0?"+":""}${money(change).replace("$-","-$")} · ${pct(changePct)}`;
  $("#portfolioChange").className=change>=0?"positive":"negative"; $("#cashValue").textContent=money(state.cash);
  $("#openCount").textContent=state.positions.length; $("#marketCount").textContent=markets.length; $("#realizedValue").textContent=money(state.realized);
}

function marketCard(m){
  const icon=m.image?`<img class="market-icon" src="${safeText(m.image)}" alt="" onerror="this.outerHTML='<div class=&quot;market-icon&quot;>PM</div>'">`:'<div class="market-icon">PM</div>';
  const start=m.startTime?new Date(m.startTime).toLocaleString("sv-SE",{weekday:"short",hour:"2-digit",minute:"2-digit"}):"Tid saknas";
  return `<article class="market-card" data-market-id="${safeText(m.id)}"><div class="market-top">${icon}<div class="market-main"><h4>${safeText(m.question)}</h4><div class="market-meta"><span>${safeText(m.eventTitle)}</span><span>•</span><span>${safeText(start)}</span><span>•</span><span>${safeText(m.category)}</span></div></div></div><div class="price-row"><div class="price-pill"><span>YES</span><strong>${Math.round(m.yesPrice*100)}¢</strong></div><div class="price-pill"><span>NO</span><strong>${Math.round(m.noPrice*100)}¢</strong></div></div></article>`;
}
function signalCard(s){return `<article class="signal-card ${s.type==='sell'?'sell':''}" data-market-id="${safeText(s.market.id)}"><div class="signal-head"><h4>${safeText(s.title)} · ${safeText(s.market.question)}</h4><span class="score">${s.score}/100</span></div><p>${safeText(s.reason)}</p><div class="tag-row"><span class="tag">${safeText(s.type)}</span><span class="tag">YES ${Math.round(s.market.yesPrice*100)}¢</span><span class="tag">${formatCompact(s.market.liquidity)} likviditet</span></div></article>`;}
function renderMarkets(){
  const q=$("#marketSearch").value.trim().toLowerCase(); const filter=$("#marketFilter").value;
  const filtered=markets.filter(m=>`${m.question} ${m.eventTitle}`.toLowerCase().includes(q)).filter(m=>{
    if(filter==="all")return true; const c=String(m.category).toLowerCase();
    if(filter==="moneyline")return c.includes("money")||c.includes("winner")||c.includes("match");
    if(filter==="totals")return c.includes("total")||/over|under/i.test(m.question);
    return !(c.includes("money")||c.includes("total"));
  });
  $("#marketsList").innerHTML=filtered.length?filtered.map(marketCard).join(""):'<div class="empty">Inga marknader matchar filtret.</div>';
}
function renderSignals(){
  $("#dashboardSignals").innerHTML=signals.slice(0,3).map(signalCard).join("")||'<div class="empty">Inga signaler ännu.</div>';
  $("#signalsList").innerHTML=signals.slice(0,30).map(signalCard).join("")||'<div class="empty">Inga signaler ännu.</div>';
}
function renderPortfolio(){
  $("#positionsList").innerHTML=state.positions.length?state.positions.map(p=>{
    const current=p.currentPrice??p.buyPrice; const value=p.shares*current; const pnl=value-p.cost; const pnlPct=pnl/p.cost*100;
    return `<article class="position-card"><div class="row"><div><h4>${safeText(p.question)}</h4><p>Köpt ${Math.round(p.buyPrice*100)}¢ · ${p.shares.toFixed(2)} shares</p></div><div class="pnl ${pnl>=0?'positive':'negative'}">${money(value)}<br>${pct(pnlPct)}</div></div><div class="position-actions"><button class="secondary-btn" data-open-market="${safeText(p.marketId)}">Visa</button><button class="primary-btn" data-sell="${safeText(p.id)}">Sälj simulerat</button></div></article>`;
  }).join(""):'<div class="empty">Inga öppna virtuella positioner.</div>';
  $("#historyList").innerHTML=state.history.length?state.history.slice().reverse().slice(0,30).map(h=>`<article class="history-card"><span>${safeText(h.action)} · ${safeText(h.question)}</span><strong class="${h.pnl>=0?'positive':'negative'}">${h.pnl===undefined?money(h.amount):money(h.pnl)}</strong></article>`).join(""):'<div class="empty">Historiken är tom.</div>';
}
function renderSettings(){ $("#maxPosition").value=state.settings.maxPosition; $("#maxPositionLabel").textContent=`${state.settings.maxPosition}%`; $("#profitAlert").value=state.settings.profitAlert; $("#profitAlertLabel").textContent=`${state.settings.profitAlert}%`; $("#autopilot").checked=state.settings.autopilot; }
function renderAll(){renderSummary();renderMarkets();renderSignals();renderPortfolio();renderSettings();}

async function getBook(market){
  if(!market.yesTokenId) return {bestBid:market.yesPrice,bestAsk:market.yesPrice,spread:null,demo:true};
  try{
    const response=await fetch(`/api/orderbook?token_id=${encodeURIComponent(market.yesTokenId)}`,{cache:"no-store"});
    const data=await response.json(); if(!response.ok) throw new Error(data.error||"Orderboksfel");
    const bids=Array.isArray(data.bids)?data.bids:[]; const asks=Array.isArray(data.asks)?data.asks:[];
    const bestBid=data.bestBid??(bids.length?Number(bids[0].price):market.yesPrice); const bestAsk=data.bestAsk??(asks.length?Number(asks[0].price):market.yesPrice);
    return {...data,bestBid,bestAsk,spread:data.spread??(bestAsk-bestBid)};
  }catch{return {bestBid:market.yesPrice,bestAsk:market.yesPrice,spread:null,fallback:true};}
}

async function openMarket(marketId){
  selectedMarket=markets.find(m=>m.id===marketId); if(!selectedMarket)return;
  $("#modal").classList.remove("hidden"); $("#modalContent").innerHTML='<div class="skeleton"></div>';
  const book=await getBook(selectedMarket); selectedMarket.book=book;
  const max=Math.max(.05,portfolioValue()*state.settings.maxPosition/100); const amounts=[Math.min(.25,max),Math.min(.5,max),max].filter((v,i,a)=>v>=.05&&a.indexOf(v)===i);
  $("#modalContent").innerHTML=`<span class="eyebrow">${safeText(selectedMarket.eventTitle)}</span><h2>${safeText(selectedMarket.question)}</h2><div class="modal-grid"><div class="modal-stat"><span>Bästa köp</span><strong>${Math.round(book.bestAsk*100)}¢</strong></div><div class="modal-stat"><span>Bästa sälj</span><strong>${Math.round(book.bestBid*100)}¢</strong></div><div class="modal-stat"><span>Spread</span><strong>${book.spread==null?'–':(book.spread*100).toFixed(1)+'¢'}</strong></div><div class="modal-stat"><span>Likviditet</span><strong>${formatCompact(selectedMarket.liquidity)}</strong></div></div><div class="notice">Detta är ett simulerat köp. Ingen riktig Polymarket-order skickas.</div><div class="buy-grid">${amounts.map(a=>`<button class="primary-btn" data-buy="${a}">Köp ${money(a)}</button>`).join("")}</div><a class="secondary-btn full" style="display:block;text-align:center;text-decoration:none" href="${safeText(selectedMarket.url)}" target="_blank" rel="noopener">Öppna på Polymarket</a>`;
}
function buySimulated(amount){
  if(!selectedMarket)return; const price=selectedMarket.book?.bestAsk||selectedMarket.yesPrice; const max=portfolioValue()*state.settings.maxPosition/100; amount=Math.min(Number(amount),max,state.cash);
  if(amount<.05){toast("För lite tillgängligt saldo.");return;}
  const position={id:crypto.randomUUID(),marketId:selectedMarket.id,question:selectedMarket.question,buyPrice:price,currentPrice:price,shares:amount/price,cost:amount,boughtAt:new Date().toISOString()};
  state.cash-=amount; state.positions.push(position); state.history.push({action:"KÖP",question:position.question,amount,boughtAt:position.boughtAt}); saveState(); renderAll(); closeModal(); toast(`Simulerat köp: ${money(amount)}`);
}
function sellSimulated(positionId){
  const index=state.positions.findIndex(p=>p.id===positionId); if(index<0)return; const p=state.positions[index]; const market=markets.find(m=>m.id===p.marketId); const price=market?.book?.bestBid||market?.yesPrice||p.currentPrice||p.buyPrice; const proceeds=p.shares*price; const pnl=proceeds-p.cost;
  state.cash+=proceeds; state.realized+=pnl; state.positions.splice(index,1); state.history.push({action:"SÄLJ",question:p.question,amount:proceeds,pnl,soldAt:new Date().toISOString()}); saveState(); signals=buildSignals(markets); renderAll(); toast(`Såld simulerat: ${money(proceeds)} (${pnl>=0?'+':''}${money(pnl)})`);
}
function maybeAutopilot(force=false){
  const now=Date.now(); if(!force && state.lastAutopilotAt && now-new Date(state.lastAutopilotAt).getTime()<30*60*1000)return;
  const candidate=signals.find(s=>s.type==="watch"&&s.score>=78&&!state.positions.some(p=>p.marketId===s.market.id));
  if(!candidate){if(force)toast("Ingen tillräckligt stark testsignal just nu.");return;}
  selectedMarket=candidate.market; selectedMarket.book={bestAsk:selectedMarket.yesPrice,bestBid:selectedMarket.yesPrice};
  const amount=Math.min(portfolioValue()*state.settings.maxPosition/100,state.cash); if(amount<.05)return;
  state.lastAutopilotAt=new Date().toISOString(); buySimulated(amount); notify("Puente Markets — virtuellt köp",`${candidate.market.question} · ${money(amount)} simulerat`);
}
function notify(title,body){ if("Notification" in window&&Notification.permission==="granted")new Notification(title,{body,icon:"/icons/icon-192.png"}); }
function toast(message){const t=$("#toast");t.textContent=message;t.classList.remove("hidden");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.add("hidden"),2600);}
function closeModal(){ $("#modal").classList.add("hidden"); selectedMarket=null; }
function navigate(id){ $$(".view").forEach(v=>v.classList.toggle("active",v.id===id)); $$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.nav===id)); scrollTo({top:0,behavior:"smooth"}); }

addEventListener("click",(e)=>{
  const nav=e.target.closest("[data-nav]"); if(nav){navigate(nav.dataset.nav);return;}
  const market=e.target.closest("[data-market-id]"); if(market){openMarket(market.dataset.marketId);return;}
  const buy=e.target.closest("[data-buy]"); if(buy){buySimulated(Number(buy.dataset.buy));return;}
  const sell=e.target.closest("[data-sell]"); if(sell){sellSimulated(sell.dataset.sell);return;}
  const open=e.target.closest("[data-open-market]"); if(open){openMarket(open.dataset.openMarket);return;}
});
$("#modalClose").addEventListener("click",closeModal); $("#modal").addEventListener("click",e=>{if(e.target.id==="modal")closeModal();});
$("#refreshBtn").addEventListener("click",()=>loadMarkets(true)); $("#marketSearch").addEventListener("input",renderMarkets); $("#marketFilter").addEventListener("change",renderMarkets);
$("#notifyBtn").addEventListener("click",async()=>{if(!("Notification" in window))return toast("Din webbläsare stödjer inte notiser.");const p=await Notification.requestPermission();toast(p==="granted"?"Notiser aktiverade.":"Notiser tilläts inte.");});
$("#maxPosition").addEventListener("input",e=>{$("#maxPositionLabel").textContent=`${e.target.value}%`;}); $("#maxPosition").addEventListener("change",e=>{state.settings.maxPosition=Number(e.target.value);saveState();});
$("#profitAlert").addEventListener("input",e=>{$("#profitAlertLabel").textContent=`${e.target.value}%`;}); $("#profitAlert").addEventListener("change",e=>{state.settings.profitAlert=Number(e.target.value);saveState();signals=buildSignals(markets);renderSignals();});
$("#autopilot").addEventListener("change",e=>{state.settings.autopilot=e.target.checked;saveState();}); $("#runAutopilotBtn").addEventListener("click",()=>maybeAutopilot(true));
$("#resetBtn").addEventListener("click",()=>{if(confirm("Nollställ hela den virtuella portföljen och historiken?")){state=structuredClone(defaultState);saveState();signals=buildSignals(markets);renderAll();toast("Portföljen är nollställd.");}});

if("serviceWorker" in navigator)addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
renderAll(); loadMarkets(); setInterval(()=>loadMarkets(false),60_000);
