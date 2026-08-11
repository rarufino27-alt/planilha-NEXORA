const KEY = "nexora_v1";

const defaultState = {
  version: 1,
  settings: {
    initialBalance: 400,
    currentBalance: 96.47,
    dailyStopPoints: 500,
    dailyTargetPoints: 500,
    defaultAsset: "XAUUSD",
    defaultProfile: "Moderado",
    roundDownLots: true
  },
  assets: {
    XAUUSD: {
      symbol: "XAUUSD",
      name: "Gold / Ouro",
      priceUnit: 0.01,
      nexoraPointsPerPriceUnit: 100,
      contractSize: 100,
      minLot: 0.01,
      lotStep: 0.01,
      commissionPerLotRoundTurn: 7,
      avgSpread: 0.07
    }
  },
  profiles: {
    "Conservador": 0.01,
    "Moderado": 0.05,
    "Moderado 1": 0.10,
    "Agressivo": 0.50
  },
  sessions: [],
  operations: [],
  capitalMovements: []
};

let state = loadState();
let currentView = "dashboard";

const money = (n) => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2}).format(Number(n)||0);
const num = (n,d=2) => (Number(n)||0).toLocaleString("pt-BR",{minimumFractionDigits:d,maximumFractionDigits:d});
const pct = (n) => `${num(n,2)}%`;
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

function loadState(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    return deepMerge(structuredClone(defaultState), parsed);
  }catch(e){ return structuredClone(defaultState); }
}
function deepMerge(base, incoming){
  for(const k of Object.keys(incoming||{})){
    if(incoming[k] && typeof incoming[k]==="object" && !Array.isArray(incoming[k]) && base[k] && typeof base[k]==="object") deepMerge(base[k], incoming[k]);
    else base[k]=incoming[k];
  }
  return base;
}
function save(){ localStorage.setItem(KEY, JSON.stringify(state)); }
function toast(msg){
  const el=document.getElementById("toast"); el.textContent=msg; el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"),2400);
}
function asset(){ return state.assets[state.settings.defaultAsset] || state.assets.XAUUSD; }

function calcLot(balance, profile){
  const per100 = state.profiles[profile] ?? 0.05;
  const raw = (Number(balance)||0)/100 * per100;
  const a=asset(), step=a.lotStep||0.01;
  const floored = Math.floor((raw + 1e-12)/step)*step;
  return Math.max(0, Math.min(a.maxLot || 100, Number(floored.toFixed(4))));
}
function pointsToMoney(points, lot, a=asset()){
  // XAUUSD rule: 100 Nexora points = 1.00 price movement.
  // Contract value = contractSize * price movement * lot.
  const priceMove = (Number(points)||0) / (a.nexoraPointsPerPriceUnit || 100);
  return priceMove * (a.contractSize || 0) * (Number(lot)||0);
}
function moneyToPoints(value, lot, a=asset()){
  const denom=(a.contractSize||0)*(Number(lot)||0);
  if(!denom) return 0;
  return (Number(value)||0)/denom*(a.nexoraPointsPerPriceUnit||100);
}
function pointsFromPrices(entry, exit, direction=1, a=asset()){
  return ((Number(exit)-Number(entry)) * (direction===-1 ? -1 : 1)) * (a.nexoraPointsPerPriceUnit||100);
}
function commission(lot,a=asset()){ return (Number(lot)||0)*(a.commissionPerLotRoundTurn||0); }

function todayStr(){ return new Date().toISOString().slice(0,10); }
function sessionTotals(date=todayStr()){
  const ops=state.operations.filter(o=>o.date===date);
  return {
    points:ops.reduce((s,o)=>s+(Number(o.points)||0),0),
    net:ops.reduce((s,o)=>s+(Number(o.net)||0),0),
    gross:ops.reduce((s,o)=>s+(Number(o.gross)||0),0),
    commission:ops.reduce((s,o)=>s+(Number(o.commission)||0),0),
    count:ops.length,
    wins:ops.filter(o=>(Number(o.net)||0)>0).length,
    losses:ops.filter(o=>(Number(o.net)||0)<0).length
  };
}
function overall(){
  const ops=state.operations;
  const net=ops.reduce((s,o)=>s+(Number(o.net)||0),0);
  const points=ops.reduce((s,o)=>s+(Number(o.points)||0),0);
  const wins=ops.filter(o=>(Number(o.net)||0)>0).length;
  const losses=ops.filter(o=>(Number(o.net)||0)<0).length;
  const peakSeries=[];
  let eq=state.settings.initialBalance;
  let peak=eq, maxDD=0;
  [...ops].sort((a,b)=>(a.timestamp||"").localeCompare(b.timestamp||"")).forEach(o=>{
    eq += Number(o.net)||0; peak=Math.max(peak,eq); maxDD=Math.max(maxDD, peak ? (peak-eq)/peak*100:0);
    peakSeries.push(eq);
  });
  return {net,points,wins,losses,count:ops.length,winRate:(wins+losses)?wins/(wins+losses)*100:0,maxDD};
}

function render(){
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  const target=document.getElementById(`view-${currentView}`); if(target) target.classList.add("active");
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===currentView));
  document.getElementById("page-title").textContent={
    dashboard:"Dashboard",session:"Nova sessão",operations:"Operações",calculator:"Calculadora",
    simulator:"Simulador",journal:"Diário operacional",performance:"Performance",capital:"Capital",
    assets:"Ativos",settings:"Configurações"
  }[currentView];
  ({
    dashboard:renderDashboard,session:renderSession,operations:renderOperations,calculator:renderCalculator,
    simulator:renderSimulator,journal:renderJournal,performance:renderPerformance,capital:renderCapital,
    assets:renderAssets,settings:renderSettings
  }[currentView])();
}

function nav(){
  document.querySelectorAll("[data-view]").forEach(el=>el.onclick=()=>{
    currentView=el.dataset.view; render();
  });
  document.querySelectorAll("[data-view-target]").forEach(el=>el.onclick=()=>{currentView=el.dataset.viewTarget;render()});
}
function cardMetric(label,value,sub="",cls=""){
  return `<div class="card metric"><div class="label">${label}</div><div class="value ${cls}">${value}</div><div class="sub">${sub}</div></div>`;
}

function renderDashboard(){
  const s=sessionTotals(), o=overall(), bal=Number(state.settings.currentBalance)||0;
  const lot=calcLot(bal,state.settings.defaultProfile);
  const a=asset(), value100=pointsToMoney(100,lot,a);
  const initial=Number(state.settings.initialBalance)||0;
  const capDiff=bal-initial;
  const simProgress=initial?bal/initial*100:0;
  document.getElementById("view-dashboard").innerHTML=`
    <div class="grid grid-4">
      ${cardMetric("Saldo atual",money(bal),`Inicial ${money(initial)}`)}
      ${cardMetric("Resultado hoje",money(s.net),`${num(s.points,0)} pontos`,s.net>=0?"positive":"negative")}
      ${cardMetric("Performance",pct(initial?capDiff/initial*100:0),"sobre o capital inicial",capDiff>=0?"positive":"negative")}
      ${cardMetric("Win rate",pct(o.winRate),`${o.wins} wins / ${o.losses} losses`)}
    </div>
    <div class="grid grid-3 section-space">
      <div class="card">
        <div class="card-header"><div><h2>Gerenciamento atual</h2><p>${esc(a.name)}</p></div><span class="pill">${esc(state.settings.defaultProfile)}</span></div>
        <div class="stat-strip">
          <div><span class="kicker">Lote</span><div class="v">${num(lot,2)}</div></div>
          <div><span class="kicker">SL</span><div class="v">${num(state.settings.dailyStopPoints,0)} pts</div></div>
          <div><span class="kicker">100 pts</span><div class="v">${money(value100)}</div></div>
          <div><span class="kicker">Meta</span><div class="v">${num(state.settings.dailyTargetPoints,0)} pts</div></div>
        </div>
        <div class="callout section-space"><strong>Regra de lote</strong><span class="note">${esc(state.settings.defaultProfile)} = ${num(state.profiles[state.settings.defaultProfile],2)} lote por US$100. O resultado é arredondado para baixo conforme o step do ativo.</span></div>
      </div>
      <div class="card">
        <div class="card-header"><div><h2>Hoje</h2><p>Resumo operacional da sessão</p></div><span class="pill ${s.points>=0?'green':'red'}">${num(s.points,0)} pts</span></div>
        <div class="big-number ${s.net>=0?'positive':'negative'}">${money(s.net)}</div>
        <div class="note">${s.count} operações · ${s.wins} wins · ${s.losses} losses · custos ${money(s.commission)}</div>
        <div class="section-space"><div class="inline" style="justify-content:space-between"><span class="note">Limite diário</span><strong>${num(state.settings.dailyStopPoints,0)} pts</strong></div><div class="progress"><span style="width:${Math.min(100,Math.abs(Math.min(0,s.points))/Math.max(1,state.settings.dailyStopPoints)*100)}%"></span></div></div>
      </div>
      <div class="card">
        <div class="card-header"><div><h2>Capital</h2><p>Movimentações separadas da performance</p></div></div>
        <div class="big-number">${money(bal)}</div>
        <div class="note">Depósitos: ${money(state.capitalMovements.filter(x=>x.type==="deposit").reduce((s,x)=>s+Number(x.amount),0))}<br>Saques: ${money(state.capitalMovements.filter(x=>x.type==="withdraw").reduce((s,x)=>s+Number(x.amount),0))}</div>
      </div>
    </div>
    <div class="card section-space">
      <div class="card-header"><div><h2>Evolução operacional</h2><p>Resultado líquido acumulado por operação</p></div><span class="pill">${o.count} operações</span></div>
      ${renderMiniChart()}
    </div>
  `;
}

function renderMiniChart(){
  const ops=[...state.operations].sort((a,b)=>(a.timestamp||"").localeCompare(b.timestamp||""));
  if(!ops.length) return `<div class="empty">Nenhuma operação registrada ainda.</div>`;
  let eq=state.settings.initialBalance;
  const vals=ops.slice(-24).map(o=>{eq+=Number(o.net)||0;return eq});
  const min=Math.min(...vals,0), max=Math.max(...vals,1), range=max-min||1;
  return `<div class="chart">${vals.map((v,i)=>`<div class="bar ${v<state.settings.initialBalance?'neg':''}" style="height:${Math.max(8,(v-min)/range*180)}px"><span>${i+1}</span></div>`).join("")}</div>`;
}

function renderSession(){
  const a=asset(), bal=Number(state.settings.currentBalance)||0;
  document.getElementById("view-session").innerHTML=`
    <div class="grid grid-2">
      <div class="card">
        <div class="card-header"><div><h2>Abertura da sessão</h2><p>Crie uma sessão operacional independente da data.</p></div></div>
        <form id="session-form" class="form-grid">
          <div class="field"><label>Data</label><input type="date" name="date" value="${todayStr()}" required></div>
          <div class="field"><label>Horário de início</label><input type="time" name="startTime" value="${new Date().toTimeString().slice(0,5)}" required></div>
          <div class="field"><label>Ativo</label><select name="asset">${Object.values(state.assets).map(x=>`<option ${x.symbol===state.settings.defaultAsset?"selected":""}>${x.symbol}</option>`).join("")}</select></div>
          <div class="field"><label>Perfil</label><select name="profile">${Object.keys(state.profiles).map(x=>`<option ${x===state.settings.defaultProfile?"selected":""}>${x}</option>`).join("")}</select></div>
          <div class="field"><label>Estratégia / setup</label><input name="strategy" placeholder="Ex.: rompimento, reversão, tendência"></div>
          <div class="field"><label>Objetivo da sessão (pontos)</label><input type="number" name="targetPoints" value="${state.settings.dailyTargetPoints}"></div>
          <div class="field"><label>Stop operacional (pontos)</label><input type="number" name="stopPoints" value="${state.settings.dailyStopPoints}"></div>
          <div class="field full"><label>Contexto inicial</label><textarea name="context" placeholder="Leitura do mercado antes da primeira entrada..."></textarea></div>
          <div class="actions full"><button class="btn primary">Abrir sessão</button></div>
        </form>
      </div>
      <div class="card">
        <div class="card-header"><div><h2>Referência instantânea</h2><p>Baseada no saldo atual.</p></div></div>
        <div class="stat-strip">
          <div><span class="kicker">Saldo</span><div class="v">${money(bal)}</div></div>
          <div><span class="kicker">Lote</span><div class="v">${num(calcLot(bal,state.settings.defaultProfile),2)}</div></div>
          <div><span class="kicker">500 pts</span><div class="v">${money(pointsToMoney(500,calcLot(bal,state.settings.defaultProfile),a))}</div></div>
          <div><span class="kicker">Comissão</span><div class="v">${money(commission(calcLot(bal,state.settings.defaultProfile),a))}</div></div>
        </div>
        <div class="callout section-space"><strong>Regra</strong><span class="note">A sessão pode conter várias operações. O stop de 500 pontos é tratado como limite operacional; o alvo pode variar de acordo com a leitura do mercado.</span></div>
      </div>
    </div>
    <div class="card section-space">
      <div class="card-header"><div><h2>Sessões recentes</h2><p>Histórico de abertura e fechamento.</p></div></div>
      ${renderSessionsTable()}
    </div>`;
  document.getElementById("session-form").onsubmit=e=>{
    e.preventDefault(); const f=new FormData(e.target);
    const item={id:uid(),date:f.get("date"),startTime:f.get("startTime"),endTime:"",asset:f.get("asset"),profile:f.get("profile"),strategy:f.get("strategy"),targetPoints:Number(f.get("targetPoints")),stopPoints:Number(f.get("stopPoints")),context:f.get("context"),journal:"",status:"open",createdAt:new Date().toISOString()};
    state.sessions.unshift(item); save(); toast("Sessão aberta."); render();
  };
}
function renderSessionsTable(){
  if(!state.sessions.length) return `<div class="empty">Nenhuma sessão registrada.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Horário</th><th>Ativo</th><th>Perfil</th><th>Setup</th><th>Status</th><th>Ação</th></tr></thead><tbody>${state.sessions.slice(0,30).map(s=>`<tr><td>${s.date}</td><td>${s.startTime}${s.endTime?` → ${s.endTime}`:""}</td><td>${esc(s.asset)}</td><td>${esc(s.profile)}</td><td>${esc(s.strategy||"-")}</td><td><span class="pill ${s.status==="open"?"amber":"green"}">${s.status==="open"?"Aberta":"Fechada"}</span></td><td><button class="btn secondary" data-close-session="${s.id}">${s.status==="open"?"Fechar":"Ver"}</button></td></tr>`).join("")}</tbody></table></div>`;
}

function renderOperations(){
  const a=asset();
  document.getElementById("view-operations").innerHTML=`
    <div class="grid grid-2">
      <div class="card">
        <div class="card-header"><div><h2>Lançamento detalhado</h2><p>Entrada + saída + MT5. A Nexora calcula os pontos.</p></div></div>
        <form id="op-detailed" class="form-grid">
          <div class="field"><label>Data</label><input type="date" name="date" value="${todayStr()}" required></div>
          <div class="field"><label>Horário</label><input type="time" name="time" value="${new Date().toTimeString().slice(0,5)}" required></div>
          <div class="field"><label>Ativo</label><select name="asset">${Object.values(state.assets).map(x=>`<option ${x.symbol===state.settings.defaultAsset?"selected":""}>${x.symbol}</option>`).join("")}</select></div>
          <div class="field"><label>Direção</label><select name="direction"><option value="1">BUY</option><option value="-1">SELL</option></select></div>
          <div class="field"><label>Lote</label><input type="number" step="0.01" name="lot" value="${num(calcLot(state.settings.currentBalance,state.settings.defaultProfile),2)}" required></div>
          <div class="field"><label>Entrada</label><input type="number" step="0.01" name="entry" required></div>
          <div class="field"><label>Saída</label><input type="number" step="0.01" name="exit" required></div>
          <div class="field"><label>Resultado líquido MT5 (US$)</label><input type="number" step="0.01" name="net" required></div>
          <div class="field"><label>Comissão MT5 (US$)</label><input type="number" step="0.01" name="commission" value="${commission(calcLot(state.settings.currentBalance,state.settings.defaultProfile),a).toFixed(2)}"></div>
          <div class="field"><label>Estratégia</label><input name="strategy"></div>
          <div class="field full"><label>Observação</label><textarea name="note"></textarea></div>
          <div class="actions full"><button class="btn primary">Registrar operação</button></div>
        </form>
      </div>
      <div class="card">
        <div class="card-header"><div><h2>Lançamento rápido</h2><p>Quando você já tem o resultado final do MT5.</p></div></div>
        <form id="op-quick" class="form-grid">
          <div class="field"><label>Data</label><input type="date" name="date" value="${todayStr()}" required></div>
          <div class="field"><label>Horário</label><input type="time" name="time" value="${new Date().toTimeString().slice(0,5)}" required></div>
          <div class="field"><label>Ativo</label><select name="asset">${Object.values(state.assets).map(x=>`<option ${x.symbol===state.settings.defaultAsset?"selected":""}>${x.symbol}</option>`).join("")}</select></div>
          <div class="field"><label>Direção</label><select name="direction"><option value="1">BUY</option><option value="-1">SELL</option></select></div>
          <div class="field"><label>Lote</label><input type="number" step="0.01" name="lot" value="${num(calcLot(state.settings.currentBalance,state.settings.defaultProfile),2)}"></div>
          <div class="field"><label>Pontos Nexora</label><input type="number" step="1" name="points" required></div>
          <div class="field"><label>Resultado líquido MT5 (US$)</label><input type="number" step="0.01" name="net" required></div>
          <div class="field"><label>Comissão (US$)</label><input type="number" step="0.01" name="commission"></div>
          <div class="field full"><label>Observação</label><textarea name="note"></textarea></div>
          <div class="actions full"><button class="btn primary">Registrar lançamento rápido</button></div>
        </form>
      </div>
    </div>
    <div class="card section-space"><div class="card-header"><div><h2>Histórico</h2><p>Resultado líquido é o valor informado pelo MT5.</p></div></div>${renderOpsTable()}</div>`;
  document.getElementById("op-detailed").onsubmit=e=>{
    e.preventDefault(); const f=new FormData(e.target), aa=state.assets[f.get("asset")];
    const points=pointsFromPrices(f.get("entry"),f.get("exit"),Number(f.get("direction")),aa);
    const lot=Number(f.get("lot")), net=Number(f.get("net")), comm=Number(f.get("commission"))||0;
    const gross=pointsToMoney(points,lot,aa);
    addOperation({date:f.get("date"),time:f.get("time"),asset:f.get("asset"),direction:Number(f.get("direction")),lot,points,gross,net,commission:comm,executionCost:gross-net,entry:Number(f.get("entry")),exit:Number(f.get("exit")),strategy:f.get("strategy"),note:f.get("note"),mode:"detailed"});
  };
  document.getElementById("op-quick").onsubmit=e=>{
    e.preventDefault(); const f=new FormData(e.target), lot=Number(f.get("lot")), aa=state.assets[f.get("asset")], points=Number(f.get("points")), net=Number(f.get("net")), comm=Number(f.get("commission"))||0;
    const gross=pointsToMoney(points,lot,aa);
    addOperation({date:f.get("date"),time:f.get("time"),asset:f.get("asset"),direction:Number(f.get("direction")),lot,points,gross,net,commission:comm,executionCost:gross-net,entry:null,exit:null,strategy:"",note:f.get("note"),mode:"quick"});
  };
}
function addOperation(o){
  state.operations.unshift({id:uid(),timestamp:new Date().toISOString(),...o});
  state.settings.currentBalance=Number((state.settings.currentBalance+o.net).toFixed(2));
  save(); toast("Operação registrada e saldo atualizado."); render();
}
function renderOpsTable(){
  if(!state.operations.length) return `<div class="empty">Nenhuma operação registrada.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Ativo</th><th>Dir.</th><th>Lote</th><th>Pontos</th><th>Bruto</th><th>Comissão</th><th>Execução*</th><th>Líquido MT5</th><th>Modo</th></tr></thead><tbody>${state.operations.slice(0,100).map(o=>`<tr><td>${o.date} ${o.time||""}</td><td>${esc(o.asset)}</td><td>${o.direction===1?"BUY":"SELL"}</td><td>${num(o.lot,2)}</td><td class="${o.points>=0?'positive':'negative'}">${num(o.points,0)}</td><td>${money(o.gross)}</td><td>${money(o.commission)}</td><td>${money(o.executionCost)}</td><td class="${o.net>=0?'positive':'negative'}">${money(o.net)}</td><td>${o.mode}</td></tr>`).join("")}</tbody></table></div><p class="note">* Custo de execução implícito = resultado bruto calculado − resultado líquido informado pelo MT5. Não é apresentado como spread puro porque a diferença pode conter spread, comissão, swap e outros ajustes.</p>`;
}

function renderCalculator(){
  document.getElementById("view-calculator").innerHTML=`
    <div class="card">
      <div class="card-header"><div><h2>Calculadora Nexora</h2><p>Converta pontos e dinheiro conforme o ativo e o lote.</p></div></div>
      <div class="form-grid three">
        <div class="field"><label>Ativo</label><select id="calc-asset">${Object.values(state.assets).map(a=>`<option>${a.symbol}</option>`).join("")}</select></div>
        <div class="field"><label>Lote</label><input id="calc-lot" type="number" step="0.01" value="${num(calcLot(state.settings.currentBalance,state.settings.defaultProfile),2)}"></div>
        <div class="field"><label>Pontos</label><input id="calc-points" type="number" step="1" value="500"></div>
      </div>
      <div class="grid grid-2 section-space">
        <div class="result-box"><span class="kicker" style="color:#a8ceff">PONTOS → US$</span><div id="calc-money" class="big-number">$0.00</div><p class="muted">Resultado bruto teórico.</p></div>
        <div class="card flat" style="background:#f8fbff"><div class="kicker">US$ → PONTOS</div><div class="field section-space"><label>Objetivo financeiro</label><input id="calc-target-money" type="number" step="0.01" value="100"></div><div id="calc-target-points" class="big-number">0 pts</div></div>
      </div>
      <div class="grid grid-3 section-space">
        <div class="card flat"><div class="kicker">Comissão estimada</div><div id="calc-commission" class="big-number" style="font-size:24px">$0.00</div></div>
        <div class="card flat"><div class="kicker">500 pts</div><div id="calc-500" class="big-number" style="font-size:24px">$0.00</div></div>
        <div class="card flat"><div class="kicker">2.000 pts</div><div id="calc-2000" class="big-number" style="font-size:24px">$0.00</div></div>
      </div>
    </div>`;
  const update=()=>{
    const a=state.assets[document.getElementById("calc-asset").value], lot=Number(document.getElementById("calc-lot").value)||0, points=Number(document.getElementById("calc-points").value)||0, target=Number(document.getElementById("calc-target-money").value)||0;
    document.getElementById("calc-money").textContent=money(pointsToMoney(points,lot,a));
    document.getElementById("calc-target-points").textContent=`${num(moneyToPoints(target,lot,a),0)} pts`;
    document.getElementById("calc-commission").textContent=money(commission(lot,a));
    document.getElementById("calc-500").textContent=money(pointsToMoney(500,lot,a));
    document.getElementById("calc-2000").textContent=money(pointsToMoney(2000,lot,a));
  };
  ["calc-asset","calc-lot","calc-points","calc-target-money"].forEach(id=>document.getElementById(id).oninput=update); update();
}

function renderSimulator(){
  document.getElementById("view-simulator").innerHTML=`
    <div class="card">
      <div class="card-header"><div><h2>Simulador de crescimento composto</h2><p>Modelo hipotético com 100% de acerto. Não é previsão de retorno.</p></div><span class="pill amber">SIMULAÇÃO</span></div>
      <div class="form-grid three">
        <div class="field"><label>Capital inicial</label><input id="sim-capital" type="number" step="0.01" value="${state.settings.currentBalance}"></div>
        <div class="field"><label>Objetivo financeiro</label><input id="sim-target" type="number" step="0.01" value="1000"></div>
        <div class="field"><label>Pontos por sessão</label><input id="sim-points" type="number" step="1" value="500"></div>
      </div>
      <div class="form-grid three section-space">
        <div class="field"><label>Ativo</label><select id="sim-asset">${Object.values(state.assets).map(a=>`<option>${a.symbol}</option>`).join("")}</select></div>
        <div class="field"><label>Stop por sessão</label><input id="sim-stop" type="number" value="500"></div>
        <div class="field"><label>Modo</label><select id="sim-mode"><option value="compound">Composto</option><option value="linear">Linear</option></select></div>
      </div>
      <div class="actions"><button class="btn primary" id="run-sim">Calcular projeção</button></div>
    </div>
    <div id="sim-results" class="section-space"></div>`;
  document.getElementById("run-sim").onclick=runSimulation;
  runSimulation();
}
function simulate(profile,capital,target,points,assetKey,mode){
  const a=state.assets[assetKey]; let bal=capital, sessions=0, rows=[];
  const max=5000;
  while(bal<target && sessions<max){
    sessions++;
    const lot=mode==="compound"?calcLot(bal,profile):calcLot(capital,profile);
    if(lot<=0) break;
    const gross=pointsToMoney(points,lot,a), net=gross-commission(lot,a);
    const before=bal; bal+=net;
    rows.push({session:sessions,before,lot,points,gross,commission:commission(lot,a),net,after:bal});
    if(net<=0) break;
  }
  return {profile,sessions,final:bal,rows};
}
function runSimulation(){
  const capital=Number(document.getElementById("sim-capital").value)||0,target=Number(document.getElementById("sim-target").value)||0,points=Number(document.getElementById("sim-points").value)||0,key=document.getElementById("sim-asset").value,mode=document.getElementById("sim-mode").value;
  const results=Object.keys(state.profiles).map(p=>simulate(p,capital,target,points,key,mode));
  document.getElementById("sim-results").innerHTML=`
    <div class="grid grid-4">${results.map(r=>cardMetric(r.profile,r.sessions<5000?`${r.sessions} sessões`:"Não atingiu",`Capital final ${money(r.final)}`,r.final>=target?"positive":"warning")).join("")}</div>
    <div class="card section-space"><div class="card-header"><div><h2>Comparativo</h2><p>Recalcula o lote conforme o saldo, arredondando para baixo.</p></div></div><div class="table-wrap"><table><thead><tr><th>Perfil</th><th>Sessões</th><th>Capital inicial</th><th>Capital final</th><th>Último lote</th><th>Último resultado</th></tr></thead><tbody>${results.map(r=>{const last=r.rows.at(-1);return `<tr><td>${r.profile}</td><td>${r.sessions<5000?r.sessions:"—"}</td><td>${money(capital)}</td><td>${money(r.final)}</td><td>${last?num(last.lot,2):"—"}</td><td>${last?money(last.net):"—"}</td></tr>`}).join("")}</tbody></table></div></div>
    ${results.map(r=>`<div class="card section-space"><div class="card-header"><div><h2>${esc(r.profile)}</h2><p>Primeiras e últimas etapas da simulação.</p></div><span class="pill">${r.rows.length} etapas</span></div>${r.rows.length?`<div class="table-wrap"><table><thead><tr><th>Sessão</th><th>Saldo antes</th><th>Lote</th><th>Pontos</th><th>Bruto</th><th>Comissão</th><th>Líquido</th><th>Saldo depois</th></tr></thead><tbody>${r.rows.slice(0,10).map(x=>`<tr><td>${x.session}</td><td>${money(x.before)}</td><td>${num(x.lot,2)}</td><td>${num(x.points,0)}</td><td>${money(x.gross)}</td><td>${money(x.commission)}</td><td class="positive">${money(x.net)}</td><td>${money(x.after)}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">Capital insuficiente para gerar lote operacional dentro das regras atuais.</div>`}</div>`).join("")}`;
}

function renderJournal(){
  const sessions=state.sessions;
  document.getElementById("view-journal").innerHTML=`
    <div class="card"><div class="card-header"><div><h2>Diário operacional</h2><p>Contexto → estratégia → execução → gestão → resultado → aprendizado.</p></div></div>
      ${sessions.length?sessions.map(s=>`<article class="card flat" style="border:1px solid var(--line);margin-bottom:10px"><div class="card-header"><div><h3>${s.date} · ${esc(s.asset)} · ${esc(s.strategy||"Sem setup")}</h3><p>${s.startTime}${s.endTime?` → ${s.endTime}`:""} · ${esc(s.profile)}</p></div><span class="pill ${s.status==="open"?"amber":"green"}">${s.status}</span></div><div class="grid grid-2"><div><div class="kicker">Contexto</div><p class="note">${esc(s.context||"Não preenchido")}</p></div><div><div class="kicker">Aprendizado</div><p class="note">${esc(s.journal||"Não preenchido")}</p></div></div><div class="actions"><button class="btn secondary" data-edit-journal="${s.id}">Editar diário</button></div></article>`).join(""):`<div class="empty">Abra uma sessão para começar o diário operacional.</div>`}
    </div>`;
  document.querySelectorAll("[data-edit-journal]").forEach(b=>b.onclick=()=>{
    const s=state.sessions.find(x=>x.id===b.dataset.editJournal); if(!s)return;
    const context=prompt("Contexto da sessão:",s.context||""); if(context===null)return;
    const journal=prompt("Aprendizado / revisão da sessão:",s.journal||""); if(journal===null)return;
    s.context=context;s.journal=journal;save();toast("Diário atualizado.");render();
  });
}

function renderPerformance(){
  const o=overall(), s=sessionTotals();
  const initial=Number(state.settings.initialBalance)||0;
  const current=Number(state.settings.currentBalance)||0;
  const realReturn=initial?(current-initial)/initial*100:0;
  document.getElementById("view-performance").innerHTML=`
    <div class="grid grid-4">
      ${cardMetric("Resultado acumulado",money(o.net),`${num(o.points,0)} pontos`,o.net>=0?"positive":"negative")}
      ${cardMetric("Win rate",pct(o.winRate),`${o.wins} wins / ${o.losses} losses`)}
      ${cardMetric("Drawdown máximo",pct(o.maxDD),"estimado pela sequência registrada",o.maxDD>0?"negative":"positive")}
      ${cardMetric("Retorno sobre capital",pct(realReturn),"saldo atual vs. saldo inicial",realReturn>=0?"positive":"negative")}
    </div>
    <div class="grid grid-2 section-space">
      <div class="card"><div class="card-header"><div><h2>Real × movimentação de capital</h2><p>Saques e depósitos não são tratados como lucro/prejuízo.</p></div></div>
        <div class="stat-strip">
          <div><span class="kicker">Inicial</span><div class="v">${money(initial)}</div></div>
          <div><span class="kicker">Atual</span><div class="v">${money(current)}</div></div>
          <div><span class="kicker">Resultado operações</span><div class="v">${money(o.net)}</div></div>
          <div><span class="kicker">Hoje</span><div class="v">${money(s.net)}</div></div>
        </div>
      </div>
      <div class="card"><div class="card-header"><div><h2>Controle operacional</h2><p>Limites configurados.</p></div></div>
        <div class="inline" style="justify-content:space-between"><span>Stop diário</span><strong>${num(state.settings.dailyStopPoints,0)} pts</strong></div>
        <div class="inline section-space" style="justify-content:space-between"><span>Meta diária</span><strong>${num(state.settings.dailyTargetPoints,0)} pts</strong></div>
        <div class="inline section-space" style="justify-content:space-between"><span>Resultado hoje</span><strong class="${s.points>=0?'positive':'negative'}">${num(s.points,0)} pts</strong></div>
      </div>
    </div>`;
}

function renderCapital(){
  const deps=state.capitalMovements.filter(x=>x.type==="deposit").reduce((s,x)=>s+Number(x.amount),0);
  const wds=state.capitalMovements.filter(x=>x.type==="withdraw").reduce((s,x)=>s+Number(x.amount),0);
  document.getElementById("view-capital").innerHTML=`
    <div class="grid grid-3">
      ${cardMetric("Saldo atual",money(state.settings.currentBalance),"atualizado pelos lançamentos")}
      ${cardMetric("Depósitos",money(deps),"movimentação de capital")}
      ${cardMetric("Saques",money(wds),"movimentação de capital")}
    </div>
    <div class="grid grid-2 section-space">
      <div class="card"><div class="card-header"><div><h2>Registrar capital</h2><p>Não altera a performance das operações.</p></div></div>
        <form id="capital-form" class="form-grid">
          <div class="field"><label>Tipo</label><select name="type"><option value="deposit">Depósito</option><option value="withdraw">Saque</option></select></div>
          <div class="field"><label>Valor (US$)</label><input name="amount" type="number" step="0.01" required></div>
          <div class="field"><label>Data</label><input name="date" type="date" value="${todayStr()}"></div>
          <div class="field"><label>Descrição</label><input name="note" placeholder="Ex.: saque"></div>
          <div class="actions full"><button class="btn primary">Registrar</button></div>
        </form>
      </div>
      <div class="card"><div class="card-header"><div><h2>Histórico</h2><p>Depósitos e saques.</p></div></div>${state.capitalMovements.length?`<div class="table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Valor</th><th>Descrição</th></tr></thead><tbody>${state.capitalMovements.map(x=>`<tr><td>${x.date}</td><td>${x.type==="deposit"?"Depósito":"Saque"}</td><td class="${x.type==="deposit"?"positive":"negative"}">${x.type==="deposit"?"+":"-"}${money(x.amount)}</td><td>${esc(x.note||"")}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">Nenhuma movimentação.</div>`}</div>
    </div>`;
  document.getElementById("capital-form").onsubmit=e=>{
    e.preventDefault();const f=new FormData(e.target),type=f.get("type"),amount=Math.abs(Number(f.get("amount"))||0);
    if(!amount)return;
    state.capitalMovements.unshift({id:uid(),type,amount,date:f.get("date"),note:f.get("note")});
    state.settings.currentBalance=Number((state.settings.currentBalance+(type==="deposit"?amount:-amount)).toFixed(2));
    save();toast("Movimentação registrada.");render();
  };
}

function renderAssets(){
  document.getElementById("view-assets").innerHTML=`
    <div class="card"><div class="card-header"><div><h2>Cadastro de ativos</h2><p>O motor é orientado por ativo para permitir XAUUSD agora e outros mercados depois.</p></div><button class="btn primary" id="new-asset">+ Novo ativo</button></div>
    <div class="table-wrap"><table><thead><tr><th>Ativo</th><th>Contrato</th><th>1 ponto Nexora</th><th>Pts / 1,00 preço</th><th>Min lote</th><th>Step</th><th>Comissão/lote</th></tr></thead><tbody>${Object.values(state.assets).map(a=>`<tr><td><strong>${esc(a.symbol)}</strong><br><span class="note">${esc(a.name)}</span></td><td>${num(a.contractSize,0)}</td><td>${num(a.priceUnit,2)}</td><td>${num(a.nexoraPointsPerPriceUnit,0)}</td><td>${num(a.minLot,2)}</td><td>${num(a.lotStep,2)}</td><td>${money(a.commissionPerLotRoundTurn)}</td></tr>`).join("")}</tbody></table></div>
    <p class="note section-space">Os parâmetros de cada ativo devem ser conferidos na especificação da corretora antes de serem usados para operação real.</p>
    </div>`;
  document.getElementById("new-asset").onclick=()=>{
    const symbol=prompt("Símbolo do ativo (ex.: NAS100):"); if(!symbol)return;
    const name=prompt("Nome:")||symbol;
    const contractSize=Number(prompt("Tamanho do contrato:", "1"))||1;
    const pointsPerPrice=Number(prompt("Quantos pontos Nexora correspondem a 1,00 de preço?", "100"))||100;
    const commissionRT=Number(prompt("Comissão por lote round turn em US$:", "0"))||0;
    state.assets[symbol.toUpperCase()]={symbol:symbol.toUpperCase(),name,priceUnit:1/pointsPerPrice,nexoraPointsPerPriceUnit:pointsPerPrice,contractSize,minLot:0.01,lotStep:0.01,commissionPerLotRoundTurn:commissionRT,avgSpread:0};
    save();toast("Ativo adicionado.");render();
  };
}

function renderSettings(){
  document.getElementById("view-settings").innerHTML=`
    <div class="grid grid-2">
      <div class="card"><div class="card-header"><div><h2>Conta e operação</h2><p>Parâmetros principais da Planilha Nexora.</p></div></div>
        <form id="settings-form" class="form-grid">
          <div class="field"><label>Capital inicial (US$)</label><input name="initial" type="number" step="0.01" value="${state.settings.initialBalance}"></div>
          <div class="field"><label>Saldo atual (US$)</label><input name="current" type="number" step="0.01" value="${state.settings.currentBalance}"></div>
          <div class="field"><label>Stop operacional diário (pts)</label><input name="stop" type="number" value="${state.settings.dailyStopPoints}"></div>
          <div class="field"><label>Meta diária (pts)</label><input name="target" type="number" value="${state.settings.dailyTargetPoints}"></div>
          <div class="field"><label>Ativo padrão</label><select name="asset">${Object.keys(state.assets).map(x=>`<option ${x===state.settings.defaultAsset?"selected":""}>${x}</option>`).join("")}</select></div>
          <div class="field"><label>Perfil padrão</label><select name="profile">${Object.keys(state.profiles).map(x=>`<option ${x===state.settings.defaultProfile?"selected":""}>${x}</option>`).join("")}</select></div>
          <div class="actions full"><button class="btn primary">Salvar configurações</button><button type="button" class="btn danger" id="reset-data">Restaurar dados de fábrica</button></div>
        </form>
      </div>
      <div class="card"><div class="card-header"><div><h2>Perfis de lote</h2><p>Regra definida: lote por cada US$100, sempre arredondando para baixo.</p></div></div>
        ${Object.entries(state.profiles).map(([k,v])=>`<div class="inline section-space" style="justify-content:space-between"><span>${esc(k)}</span><strong>${num(v,2)} lote / US$100</strong></div>`).join("")}
        <div class="callout section-space"><strong>Arquitetura preparada para Supabase</strong><span class="note">A V1 funciona localmente sem dependências externas. O projeto inclui um schema SQL para migrar usuários, contas, ativos, sessões, operações e movimentações para Supabase sem alterar o motor de cálculos.</span></div>
      </div>
    </div>`;
  document.getElementById("settings-form").onsubmit=e=>{
    e.preventDefault();const f=new FormData(e.target);
    state.settings.initialBalance=Number(f.get("initial"))||0;
    state.settings.currentBalance=Number(f.get("current"))||0;
    state.settings.dailyStopPoints=Number(f.get("stop"))||500;
    state.settings.dailyTargetPoints=Number(f.get("target"))||500;
    state.settings.defaultAsset=f.get("asset"); state.settings.defaultProfile=f.get("profile");
    save();toast("Configurações salvas.");render();
  };
  document.getElementById("reset-data").onclick=()=>{
    if(confirm("Restaurar todos os dados da V1? Isso apaga operações, sessões e movimentações locais.")){state=structuredClone(defaultState);save();toast("Dados restaurados.");render();}
  };
}

document.addEventListener("click",e=>{
  const b=e.target.closest("[data-close-session]");
  if(b){
    const s=state.sessions.find(x=>x.id===b.dataset.closeSession); if(!s)return;
    if(s.status==="open"){s.status="closed";s.endTime=new Date().toTimeString().slice(0,5);save();toast("Sessão fechada.");render();}
  }
});

document.getElementById("export-btn").onclick=()=>{
  const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`nexora-backup-${todayStr()}.json`;a.click();URL.revokeObjectURL(a.href);
};
document.getElementById("import-file").onchange=e=>{
  const file=e.target.files[0]; if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{state=deepMerge(structuredClone(defaultState),JSON.parse(reader.result));save();toast("Backup importado.");render();}
    catch(err){toast("Arquivo de backup inválido.");}
  };reader.readAsText(file);
};

nav(); render();
