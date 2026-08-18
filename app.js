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
    dailyPercent: 30,
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
  const dailyTarget=Math.max(0,balance*(Number(p.dailyPercent)||0)/100);
  const comm=commission(lot,a);
  const points=lot>0 ? Math.ceil(moneyToPoints(dailyTarget+comm,lot,a)) : 0;
  const gross=pointsToMoney(points,lot,a);
  return {lot,dailyTarget,commission:comm,points,gross,net:gross-comm};
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
      rows.push({session:sessions,before,lot:x.lot,points:x.points,gross:x.gross,commission:x.commission,net:balance-before,after:balance,stageFrom:stage.from,stageTo:stage.to});
    }
    milestones.push({from:beforeStage,to:stage.to,sessions:count,after:balance});
    if(balance<stage.to) break;
  }
  return {profile,final:balance,sessions,rows,milestones,firstLot:rows[0]?.lot||0,firstPoints:rows[0]?.points||0};
}
function ensureProjectionState(){
  if(!state.projection) state.projection={name:'Projeto principal',initialBalance:Number(state.settings.currentBalance)||60,target:1000,dailyPercent:30,sessionsPerDay:1,asset:state.settings.defaultAsset,activeProfile:'Moderado',mode:'compound',milestones:'double',status:'active',startedAt:todayStr(),completedAt:'',manualSessions:[]};
  if(!Array.isArray(state.projection.manualSessions)) state.projection.manualSessions=[];
  return state.projection;
}
function currentProjectionStage(p, real){
  return milestoneTargets(Number(p.initialBalance)||0,Number(p.target)||0,p.milestones).find(m=>real<m.to);
}
function renderProjection(){
  const p=ensureProjectionState();
  const real=Number(state.settings.currentBalance)||0, target=Number(p.target)||0, initial=Number(p.initialBalance)||0;
  const progress=target>initial?Math.max(0,Math.min(100,(real-initial)/(target-initial)*100)):0;
  const stage=currentProjectionStage(p,real);
  const stageTarget=stage?stage.to:target;
  const stageFrom=stage?stage.from:initial;
  const stageProgress=stageTarget>stageFrom?Math.max(0,Math.min(100,(real-stageFrom)/(stageTarget-stageFrom)*100)):100;
  const profiles=Object.keys(state.profiles);
  const profileRows=profiles.map(profile=>({profile,...projectionSession(p,profile,real)}));
  const active=projectionSession(p,p.activeProfile,real);
  const manual=p.manualSessions;
  const manualNet=manual.reduce((sum,x)=>sum+(Number(x.net)||0),0);
  const manualSessions=manual.length;
  const plannedSessionsToStage=projectSessionsToTarget(p,p.activeProfile,real,stageTarget);
  const plannedSessionsToGoal=projectSessionsToTarget(p,p.activeProfile,real,target);

  document.getElementById('view-projection').innerHTML=`
    <div class="callout"><strong>Projeção & Objetivos — acompanhamento por etapa.</strong><span class="note">A Nexora mantém a busca em 30% e recalcula o valor em US$ sobre o saldo atual, define o lote de entrada e converte a meta financeira em Pontos Nexora. Você registra manualmente o resultado de cada sessão; a projeção permanece separada do realizado.</span></div>

    <div class="grid grid-4 section-space">
      ${cardMetric('Meta principal',money(target),`Projeto iniciado em ${money(initial)}`)}
      ${cardMetric('Saldo atual',money(real),stage?`Próxima meta ${money(stageTarget)}`:'Meta concluída',real>=target?'positive':'')}
      ${cardMetric('Busca do dia',money(real*(Number(p.dailyPercent)||0)/100),`${num(p.dailyPercent,1)}% do saldo atual`)}
      ${cardMetric('Meta diária',pct(p.dailyPercent),`${p.sessionsPerDay} sessão(ões)/dia`)}
    </div>

    <div class="grid grid-2 section-space">
      <div class="card">
        <div class="card-header"><div><h2>Etapa atual</h2><p>O percentual permanece em 30%, mas o valor da busca acompanha o novo saldo alcançado.</p></div><span class="pill ${stage?'':'green'}">${stage?'EM ANDAMENTO':'CONCLUÍDA'}</span></div>
        <div class="stat-strip">
          <div><span class="kicker">Saldo atual</span><div class="v">${money(real)}</div></div>
          <div><span class="kicker">Meta da etapa</span><div class="v">${money(stageTarget)}</div></div>
          <div><span class="kicker">Busca</span><div class="v">${money(active.dailyTarget)}</div></div>
          <div><span class="kicker">Falta</span><div class="v">${money(Math.max(0,stageTarget-real))}</div></div>
        </div>
        <div class="section-space"><div class="inline" style="justify-content:space-between"><span class="note">Progresso da etapa</span><strong>${pct(stageProgress)}</strong></div><div class="progress"><span style="width:${stageProgress}%"></span></div></div>
      </div>
      <div class="card">
        <div class="card-header"><div><h2>Plano de execução</h2><p>Perfil principal: ${esc(p.activeProfile)}</p></div><span class="pill">${esc(p.asset)}</span></div>
        <div class="result-box">
          <span class="kicker" style="color:#a8ceff">ENTRADA PROJETADA</span>
          <div class="big-number">${num(active.lot,2)} lote</div>
          <p class="muted">Buscar ${num(active.points,0)} Pontos Nexora para uma meta de ${money(active.dailyTarget)}. Comissão estimada: ${money(active.commission)}.</p>
        </div>
        <div class="inline section-space" style="justify-content:space-between"><span>Saldo após a sessão projetada</span><strong>${money(real+active.net)}</strong></div>
      </div>
    </div>

    <div class="card section-space">
      <div class="card-header"><div><h2>Projeção dos níveis</h2><p>Para cada perfil: lote atual, busca financeira, pontos necessários e sessões até a meta.</p></div><span class="pill amber">100% acerto hipotético</span></div>
      <div class="table-wrap"><table><thead><tr><th>Nível</th><th>Saldo atual</th><th>Busca diária</th><th>Lote de entrada</th><th>Pontos necessários</th><th>Resultado líquido/sessão</th><th>Sessões até etapa</th><th>Sessões até objetivo</th></tr></thead><tbody>
        ${profileRows.map(r=>`<tr><td><strong>${esc(r.profile)}</strong></td><td>${money(real)}</td><td>${money(r.dailyTarget)} (${num(p.dailyPercent,1)}%)</td><td>${num(r.lot,2)}</td><td>${num(r.points,0)}</td><td>${money(r.net)}</td><td>${plannedSessionsToStageForProfile(p,r.profile,real,stageTarget)}</td><td>${plannedSessionsToStageForProfile(p,r.profile,real,target)}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="note section-space">Os pontos necessários são calculados para atingir a meta financeira diária já considerando a comissão estimada. O resultado real pode ser diferente.</p>
    </div>

    <div class="grid grid-2 section-space">
      <div class="card">
        <div class="card-header"><div><h2>Marcos do projeto</h2><p>Caminho do saldo atual até ${money(target)}.</p></div></div>
        ${renderProjectionMilestones(p,real)}
      </div>
      <div class="card">
        <div class="card-header"><div><h2>Realizado manualmente</h2><p>Você informa sessões e resultado ganho/perda.</p></div></div>
        <div class="stat-strip">
          <div><span class="kicker">Sessões</span><div class="v">${manualSessions}</div></div>
          <div><span class="kicker">Resultado</span><div class="v ${manualNet>=0?'positive':'negative'}">${money(manualNet)}</div></div>
          <div><span class="kicker">Projetado/sessão</span><div class="v">${money(active.net)}</div></div>
          <div><span class="kicker">Saldo informado</span><div class="v">${money(real)}</div></div>
        </div>
        <p class="note section-space">O registro manual desta área é um acompanhamento da projeção. O saldo da conta continua sendo controlado pelo módulo de operações/capital até a integração com o Supabase.</p>
      </div>
    </div>

    <div class="card section-space">
      <div class="card-header"><div><h2>Registrar sessão projetada</h2><p>Informe apenas o que aconteceu. A Nexora já informa o que deveria ser buscado.</p></div></div>
      <form id="projection-session-form" class="form-grid three">
        <div class="field"><label>Data</label><input name="date" type="date" value="${todayStr()}" required></div>
        <div class="field"><label>Perfil usado</label><select name="profile">${profiles.map(x=>`<option ${x===p.activeProfile?'selected':''}>${x}</option>`).join('')}</select></div>
        <div class="field"><label>Saldo antes da sessão</label><input name="balanceBefore" type="number" step="0.01" value="${real}" required></div>
        <div class="field"><label>Busca projetada (US$)</label><input name="plannedMoney" type="number" step="0.01" value="${active.dailyTarget.toFixed(2)}" readonly></div>
        <div class="field"><label>Lote projetado</label><input name="plannedLot" type="number" step="0.01" value="${active.lot.toFixed(2)}" readonly></div>
        <div class="field"><label>Pontos projetados</label><input name="plannedPoints" type="number" value="${active.points}" readonly></div>
        <div class="field"><label>Resultado real da sessão (US$)</label><input name="net" type="number" step="0.01" placeholder="Ex.: 30 ou -15" required></div>
        <div class="field"><label>Sessões realizadas no dia</label><input name="sessionsCount" type="number" min="1" step="1" value="1" required></div>
        <div class="field"><label>Pontos reais (opcional)</label><input name="actualPoints" type="number" step="1" placeholder="Ex.: 620"></div>
        <div class="field full"><label>Observação</label><textarea name="note" placeholder="Como foi a sessão? Seguiu a projeção? Houve perda, ganho parcial, encerramento antecipado?" ></textarea></div>
        <div class="actions full"><button class="btn primary">Registrar sessão realizada</button></div>
      </form>
    </div>

    <div class="card section-space">
      <div class="card-header"><div><h2>Histórico das sessões da projeção</h2><p>Registro do realizado versus o planejado.</p></div></div>
      ${manual.length?`<div class="table-wrap"><table><thead><tr><th>Data</th><th>Perfil</th><th>Saldo antes</th><th>Busca planejada</th><th>Lote</th><th>Pontos planejados</th><th>Resultado real</th><th>Saldo depois</th><th>Diferença</th><th>Sessões</th></tr></thead><tbody>${manual.slice().reverse().map(x=>`<tr><td>${x.date}</td><td>${esc(x.profile)}</td><td>${money(x.balanceBefore)}</td><td>${money(x.plannedMoney)}</td><td>${num(x.plannedLot,2)}</td><td>${num(x.plannedPoints,0)}</td><td class="${Number(x.net)>=0?'positive':'negative'}">${money(x.net)}</td><td>${money(x.balanceAfter ?? (Number(x.balanceBefore)+Number(x.net)))}</td><td class="${Number(x.net)-Number(x.plannedMoney)>=0?'positive':'negative'}">${money(Number(x.net)-Number(x.plannedMoney))}</td><td>${x.sessionsCount}</td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">Nenhuma sessão manual registrada nesta projeção.</div>`}
    </div>

    <div class="card section-space"><div class="card-header"><div><h2>Configuração do projeto</h2><p>Defina o objetivo e a busca diária.</p></div></div>
      <form id="projection-form" class="form-grid three">
        <div class="field full"><label>Nome do projeto</label><input name="name" value="${esc(p.name)}"></div>
        <div class="field"><label>Saldo inicial do projeto (US$)</label><input name="initial" type="number" step="0.01" value="${p.initialBalance}"></div>
        <div class="field"><label>Meta principal (US$)</label><input name="target" type="number" step="0.01" value="${p.target}"></div>
        <div class="field"><label>Meta diária (%)</label><input name="dailyPercent" type="number" step="0.1" value="${p.dailyPercent}"></div>
        <div class="field"><label>Sessões planejadas por dia</label><input name="sessionsPerDay" type="number" min="1" step="1" value="${p.sessionsPerDay}"></div>
        <div class="field"><label>Ativo</label><select name="asset">${Object.values(state.assets).map(a=>`<option ${a.symbol===p.asset?'selected':''}>${a.symbol}</option>`).join('')}</select></div>
        <div class="field"><label>Perfil principal</label><select name="profile">${profiles.map(x=>`<option ${x===p.activeProfile?'selected':''}>${x}</option>`).join('')}</select></div>
        <div class="field"><label>Modelo</label><select name="mode"><option value="compound" ${p.mode==='compound'?'selected':''}>Composto</option><option value="linear" ${p.mode==='linear'?'selected':''}>Linear</option></select></div>
        <div class="field"><label>Marcos</label><select name="milestones"><option value="double" ${p.milestones==='double'?'selected':''}>Duplicação da banca</option><option value="fixed" ${p.milestones==='fixed'?'selected':''}>5 marcos até a meta</option></select></div>
        <div class="actions full"><button class="btn primary">Salvar configuração da projeção</button><button type="button" class="btn secondary" id="sync-projection-balance">Usar saldo atual como saldo inicial</button></div>
      </form>
    </div>
  `;

  document.getElementById('projection-form').onsubmit=e=>{
    e.preventDefault(); const f=new FormData(e.target);
    state.projection={...p,name:f.get('name')||'Projeto principal',initialBalance:Number(f.get('initial'))||0,target:Number(f.get('target'))||0,dailyPercent:Number(f.get('dailyPercent'))||0,sessionsPerDay:Math.max(1,Number(f.get('sessionsPerDay'))||1),asset:f.get('asset'),activeProfile:f.get('profile'),mode:f.get('mode'),milestones:f.get('milestones')};
    save(); toast('Projeção atualizada.'); render();
  };
  document.getElementById('sync-projection-balance').onclick=()=>{ state.projection.initialBalance=Number(state.settings.currentBalance)||0; save(); toast('Saldo atual definido como saldo inicial do projeto.'); render(); };
  document.getElementById('projection-session-form').onsubmit=e=>{
    e.preventDefault(); const f=new FormData(e.target); const profile=f.get('profile');
    const before=Number(f.get('balanceBefore'))||0; const plan=projectionSession(p,profile,before); const net=Number(f.get('net'))||0;
    const sessionsCount=Math.max(1,Number(f.get('sessionsCount'))||1);
    const balanceAfter=Number((before+net).toFixed(2));

    p.manualSessions.push({
      id:uid(),
      date:f.get('date'),
      profile,
      balanceBefore:before,
      plannedMoney:plan.dailyTarget,
      plannedLot:plan.lot,
      plannedPoints:plan.points,
      plannedNet:plan.net,
      net,
      balanceAfter,
      sessionsCount,
      actualPoints:Number(f.get('actualPoints'))||0,
      note:f.get('note')||'',
      createdAt:new Date().toISOString()
    });

    // O resultado real informado passa a ser o novo saldo de referência
    // para a próxima busca percentual, lote e pontos.
    state.settings.currentBalance=balanceAfter;

    save(); toast(`Sessão registrada. Novo saldo: ${money(balanceAfter)}. Próxima busca será recalculada.`); render();
  };
}
function projectSessionsToTarget(p,profile,start,target){
  if(target<=start) return 0;
  let bal=start, count=0;
  while(bal<target && count<5000){ const x=projectionSession(p,profile,bal); if(x.net<=0) return null; bal+=x.net; count++; }
  return count>=5000?null:count;
}
function plannedSessionsToStageForProfile(p,profile,start,target){ const x=projectSessionsToTarget(p,profile,start,target); return x===null?'—':x; }
function renderProjectionMilestones(p,real){
  const stages=milestoneTargets(Number(p.initialBalance)||0,Number(p.target)||0,p.milestones);
  if(!stages.length) return '<div class="empty">Defina uma meta maior que o saldo inicial.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Nível</th><th>De</th><th>Até</th><th>Saldo atual</th><th>Status</th></tr></thead><tbody>${stages.map((m,i)=>{const done=real>=m.to, current=real>=m.from&&!done; return `<tr><td>${i+1}</td><td>${money(m.from)}</td><td>${money(m.to)}</td><td>${money(Math.min(real,m.to))}</td><td><span class="pill ${done?'green':current?'amber':''}">${done?'CONCLUÍDO':current?'ATUAL':'PRÓXIMO'}</span></td></tr>`}).join('')}</tbody></table></div>`;
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
