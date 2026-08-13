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
  capitalMovements: [],
  projection: {
    name: "Projeto principal",
    initialBalance: 60,
    target: 1000,
    dailyPercent: 5,
    sessionsPerDay: 1,
    asset: "XAUUSD",
    activeProfile: "Moderado",
    mode: "compound",
    milestones: "double",
    status: "active",
    startedAt: "",
    completedAt: ""
  }
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
    projection:"Projeção & objetivos",journal:"Diário operacional",performance:"Performance",capital:"Capital",
    assets:"Ativos",settings:"Configurações"
  }[currentView];
  ({
    dashboard:renderDashboard,session:renderSession,operations:renderOperations,calculator:renderCalculator,
    projection:renderProjection,journal:renderJournal,performance:renderPerformance,capital:renderCapital,
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

function projectionSession(p, profile, balance){
  const a=state.assets[p.asset]||asset();
  const lot=calcLot(balance,profile);
  const target=Math.max(0,balance*(Number(p.dailyPercent)||0)/100);
  const comm=commission(lot,a);
  const points=lot>0 ? Math.ceil(moneyToPoints(target+comm,lot,a)) : 0;
  const gross=pointsToMoney(points,lot,a);
  return {lot,target,commission:comm,points,gross,net:gross-comm};
}
function milestoneTargets(initial,target,mode){
  const out=[]; let cur=initial;
  while(cur<target && out.length<100){
    const next=mode==='double' ? Math.min(target,cur*2) : Math.min(target,cur+Math.max((target-initial)/5,1));
    if(next<=cur) break; out.push({from:cur,to:next}); cur=next;
  }
  return out;
}
function projectionForProfile(p,profile){
  const initial=Number(p.initialBalance)||0,target=Number(p.target)||0;
  let balance=initial,sessions=0,rows=[],milestones=[];
  if(initial<=0 || target<=initial) return {profile,final:balance,sessions,rows,milestones,firstLot:0,firstPoints:0};
  for(const stage of milestoneTargets(initial,target,p.milestones)){
    const beforeStage=balance; let count=0;
    while(balance<stage.to && sessions<5000){
      const x=projectionSession(p,profile,balance);
      if(x.net<=0) break;
      const before=balance; balance=Math.min(stage.to,balance+x.net);
      sessions++; count++;
      rows.push({session:sessions,before,lot:x.lot,points:x.points,gross:x.gross,commission:x.commission,net:balance-before,after:balance});
    }
    milestones.push({from:beforeStage,to:stage.to,sessions:count,after:balance});
    if(balance<stage.to) break;
  }
  return {profile,final:balance,sessions,rows,milestones,firstLot:rows[0]?.lot||0,firstPoints:rows[0]?.points||0};
}
function renderProjection(){
  const p=state.projection || (state.projection={name:'Projeto principal',initialBalance:60,target:1000,dailyPercent:5,sessionsPerDay:1,asset:state.settings.defaultAsset,activeProfile:'Moderado',mode:'compound',milestones:'double',status:'active',startedAt:todayStr(),completedAt:''});
  const real=Number(state.settings.currentBalance)||0, target=Number(p.target)||0, initial=Number(p.initialBalance)||0;
  const progress=target>initial?Math.max(0,Math.min(100,(real-initial)/(target-initial)*100)):0;
  const current=milestoneTargets(initial,target,p.milestones).find(m=>real<m.to);
  const results=Object.keys(state.profiles).map(profile=>projectionForProfile(p,profile));
  const active=results.find(r=>r.profile===p.activeProfile)||results[0];
  const currentTarget=current?current.to:target;
  const stageProgress=current?Math.max(0,Math.min(100,(real-current.from)/(current.to-current.from)*100)):100;
  document.getElementById('view-projection').innerHTML=`
    <div class="callout"><strong>Projeção & Objetivos — plano vivo do capital.</strong><span class="note">A projeção parte do saldo inicial, percentual de busca diária, sessões, perfil de lote e custos cadastrados. As operações reais atualizam o saldo e o acompanhamento do projeto.</span></div>
    <div class="grid grid-4 section-space">
      ${cardMetric('Saldo real',money(real),`Projeto iniciado em ${money(initial)}`)}
      ${cardMetric('Objetivo principal',money(target),`Faltam ${money(Math.max(0,target-real))}`,real>=target?'positive':'')}
      ${cardMetric('Progresso real',pct(progress),`${money(Math.max(0,real-initial))} acima do início`,progress>=100?'positive':'')}
      ${cardMetric('Busca diária',pct(p.dailyPercent),`${p.sessionsPerDay} sessão(ões)/dia`)}
    </div>
    <div class="card section-space"><div class="card-header"><div><h2>${esc(p.name)}</h2><p>${esc(p.asset)} · ${esc(p.activeProfile)} · ${p.status==='active'?'Projeto ativo':'Projeto finalizado'}</p></div><span class="pill ${p.status==='active'?'green':'amber'}">${p.status==='active'?'ATIVO':'FINALIZADO'}</span></div><div class="progress"><span style="width:${progress}%"></span></div><div class="inline section-space" style="justify-content:space-between"><span class="note">${money(real)} / ${money(target)}</span><strong>${pct(progress)}</strong></div></div>
    <div class="grid grid-2 section-space">
      <div class="card"><div class="card-header"><div><h2>Configuração do projeto</h2><p>Os parâmetros da projeção.</p></div></div>
        <form id="projection-form" class="form-grid">
          <div class="field full"><label>Nome do projeto</label><input name="name" value="${esc(p.name)}"></div>
          <div class="field"><label>Saldo inicial (US$)</label><input name="initial" type="number" step="0.01" value="${p.initialBalance}"></div>
          <div class="field"><label>Objetivo principal (US$)</label><input name="target" type="number" step="0.01" value="${p.target}"></div>
          <div class="field"><label>Busca diária (%)</label><input name="dailyPercent" type="number" step="0.1" value="${p.dailyPercent}"></div>
          <div class="field"><label>Sessões operacionais/dia</label><input name="sessionsPerDay" type="number" min="1" step="1" value="${p.sessionsPerDay}"></div>
          <div class="field"><label>Ativo</label><select name="asset">${Object.values(state.assets).map(a=>`<option ${a.symbol===p.asset?'selected':''}>${a.symbol}</option>`).join('')}</select></div>
          <div class="field"><label>Perfil principal</label><select name="profile">${Object.keys(state.profiles).map(x=>`<option ${x===p.activeProfile?'selected':''}>${x}</option>`).join('')}</select></div>
          <div class="field"><label>Modelo</label><select name="mode"><option value="compound" ${p.mode==='compound'?'selected':''}>Composto</option><option value="linear" ${p.mode==='linear'?'selected':''}>Linear</option></select></div>
          <div class="field"><label>Marcos de capital</label><select name="milestones"><option value="double" ${p.milestones==='double'?'selected':''}>Duplicação da banca</option><option value="fixed" ${p.milestones==='fixed'?'selected':''}>5 marcos até a meta</option></select></div>
          <div class="actions full"><button class="btn primary">Atualizar projeção</button><button type="button" class="btn secondary" id="sync-projection-balance">Usar saldo real como início</button></div>
        </form>
      </div>
      <div class="card"><div class="card-header"><div><h2>Nível operacional atual</h2><p>O próximo marco é acompanhado pelo saldo real.</p></div></div>
        ${real>=target ? `<div class="result-box"><span class="kicker" style="color:#a8ceff">OBJETIVO ALCANÇADO</span><div class="big-number">${money(target)}</div><p class="muted">O Projeto 01 pode ser finalizado ou transformado em um novo ciclo de capital.</p><div class="actions"><button class="btn secondary" id="finish-projection">Finalizar projeto</button><button class="btn primary" id="new-cycle">Criar novo ciclo</button></div></div>` : current ? `<div class="result-box"><span class="kicker" style="color:#a8ceff">PRÓXIMO MARCO</span><div class="big-number">${money(currentTarget)}</div><p class="muted">${money(current.from)} → ${money(current.to)}</p><div class="progress"><span style="width:${stageProgress}%"></span></div><div class="inline section-space" style="justify-content:space-between"><span class="muted">${money(real)}</span><strong>${pct(stageProgress)}</strong></div><p class="muted">Faltam ${money(Math.max(0,current.to-real))} para concluir o nível.</p></div>` : '<div class="empty">Defina um objetivo maior que o saldo inicial.</div>'}
      </div>
    </div>
    <div class="card section-space"><div class="card-header"><div><h2>Projeção por nível operacional</h2><p>Todos os perfis partem do mesmo capital e caminham até ${money(target)}.</p></div><span class="pill amber">100% de acerto hipotético</span></div>
      <div class="table-wrap"><table><thead><tr><th>Nível</th><th>Saldo inicial</th><th>Objetivo</th><th>Busca/dia</th><th>Lote inicial</th><th>Pontos/sessão</th><th>Sessões projetadas</th><th>Saldo final</th></tr></thead><tbody>${results.map(r=>`<tr><td><strong>${esc(r.profile)}</strong></td><td>${money(initial)}</td><td>${money(target)}</td><td>${pct(p.dailyPercent)}</td><td>${num(r.firstLot,2)}</td><td>${num(r.firstPoints,0)}</td><td>${r.sessions>=5000?'—':r.sessions}</td><td class="${r.final>=target?'positive':'warning'}">${money(r.final)}</td></tr>`).join('')}</tbody></table></div>
      <p class="note section-space">A projeção não é promessa de retorno. É um modelo matemático que pressupõe 100% de acerto e utiliza os parâmetros cadastrados.</p>
    </div>
    <div class="grid grid-2 section-space">
      <div class="card"><div class="card-header"><div><h2>Trajetória — ${esc(active.profile)}</h2><p>Marcos de capital e sessões projetadas.</p></div></div>${active.milestones.length?`<div class="table-wrap"><table><thead><tr><th>Nível</th><th>De</th><th>Até</th><th>Sessões</th></tr></thead><tbody>${active.milestones.map((m,i)=>`<tr><td>${i+1}</td><td>${money(m.from)}</td><td>${money(m.to)}</td><td>${m.sessions}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Sem níveis calculáveis.</div>'}</div>
      <div class="card"><div class="card-header"><div><h2>Real × Projetado</h2><p>O plano original permanece registrado.</p></div></div>${renderRealProjection(p,real,active)}</div>
    </div>
    <div class="card section-space"><div class="card-header"><div><h2>Ciclo de capital</h2><p>Ao atingir a meta, o projeto pode continuar com saque, reinvestimento ou nova meta.</p></div></div>
      <div class="grid grid-3"><div><span class="kicker">Projeto</span><div class="big-number" style="font-size:22px">${esc(p.name)}</div></div><div><span class="kicker">Saldo inicial</span><div class="big-number" style="font-size:22px">${money(p.initialBalance)}</div></div><div><span class="kicker">Meta</span><div class="big-number" style="font-size:22px">${money(p.target)}</div></div></div>
      <div class="actions"><button class="btn secondary" id="new-cycle">Criar novo ciclo</button>${p.status==='active'?'<button class="btn danger" id="finish-projection">Finalizar projeto</button>':''}</div>
    </div>`;
  document.getElementById('projection-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);state.projection={...p,name:f.get('name')||'Projeto principal',initialBalance:Number(f.get('initial'))||0,target:Number(f.get('target'))||0,dailyPercent:Number(f.get('dailyPercent'))||0,sessionsPerDay:Math.max(1,Number(f.get('sessionsPerDay'))||1),asset:f.get('asset'),activeProfile:f.get('profile'),mode:f.get('mode'),milestones:f.get('milestones')};save();toast('Projeção atualizada.');render();};
  const sync=document.getElementById('sync-projection-balance'); if(sync) sync.onclick=()=>{state.projection.initialBalance=Number(state.settings.currentBalance)||0;save();toast('Saldo real usado como início do projeto.');render();};
}
function renderRealProjection(p,real,r){
  if(!r.rows.length) return '<div class="empty">Configure o projeto para gerar uma trajetória.</div>';
  const idx=Math.min(state.operations.length,r.rows.length)-1; const projected=idx>=0?r.rows[idx].after:Number(p.initialBalance)||0; const diff=real-projected;
  return `<div class="stat-strip"><div><span class="kicker">Real</span><div class="v">${money(real)}</div></div><div><span class="kicker">Projetado</span><div class="v">${money(projected)}</div></div><div><span class="kicker">Diferença</span><div class="v ${diff>=0?'positive':'negative'}">${diff>=0?'+':''}${money(diff)}</div></div><div><span class="kicker">Operações reais</span><div class="v">${state.operations.length}</div></div></div><div class="callout section-space"><strong>${diff>=0?'Acima da trajetória projetada':'Abaixo da trajetória projetada'}</strong><span class="note">A comparação é apenas de acompanhamento; não altera a meta original.</span></div>`;
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
  if(e.target.id==="finish-projection"){
    if(confirm("Finalizar este projeto e registrar a data de conclusão?")){state.projection.status="completed";state.projection.completedAt=todayStr();save();toast("Projeto finalizado.");render();}
  }
  if(e.target.id==="new-cycle"){
    const current=Number(state.settings.currentBalance)||0;
    const name=prompt("Nome do novo ciclo:",`${state.projection.name} — novo ciclo`);
    if(!name)return;
    const next=Number(prompt("Novo objetivo financeiro (US$):",String(Math.max(current*2,Number(state.projection.target)||1000))))||0;
    if(next<=current){toast("A nova meta precisa ser maior que o saldo atual.");return;}
    state.projection={...state.projection,name,initialBalance:current,target:next,status:"active",startedAt:todayStr(),completedAt:""};save();toast("Novo ciclo criado.");render();
  }
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
