const KEY = "nexora_v1";

const defaultState = {
  version: 1,
  settings: {
    initialBalance: 400,
    currentBalance: 96.47,
    dailyStopPoints: 500,
    dailyTargetPoints: 500,
    defaultAsset: "XAUUSD",
    defaultProfile: "Moderado 1",
    roundDownLots: true,
    lotMinimum: 0.01,
    lotRules: {
      "Conservador": [],
      "Moderado": [],
      "Moderado 1": [],
      "Agressivo": []
    }
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
  activeSessionId: null,
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

function buildDefaultLotRules(){
  const profiles=["Conservador","Moderado","Moderado 1","Agressivo"];
  const rows={};
  profiles.forEach(profile=>{
    rows[profile]=[];
    for(let balance=100,i=0; balance<=5000; balance+=25,i++){
      let lot=0.01;
      if(profile==="Conservador") lot=0.01+i*0.01;
      if(profile==="Moderado") lot=0.03+i*0.01;
      if(profile==="Moderado 1") lot=0.05+i*0.01;
      if(profile==="Agressivo") lot=0.12 + Math.floor(i/2)*0.05 + (i%2)*0.03;
      rows[profile].push({balance,lot:Number(lot.toFixed(2))});
    }
  });
  return rows;
}
function normalizeLotRules(){
  const defaults=buildDefaultLotRules();
  state.settings.lotMinimum=Number(state.settings.lotMinimum)||0.01;
  if(!state.settings.lotRules) state.settings.lotRules={};
  Object.keys(defaults).forEach(profile=>{
    if(!Array.isArray(state.settings.lotRules[profile]) || !state.settings.lotRules[profile].length){
      state.settings.lotRules[profile]=defaults[profile];
    }
  });
}
normalizeLotRules();

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
  const b=Number(balance)||0;
  const a=asset();
  normalizeLotRules();

  const rules=state.settings.lotRules[profile]||[];
  if(b<100) return 0; // abaixo do primeiro nível: sem sugestão automática

  let selected=null;
  for(const row of rules){
    if(Number(row.balance)<=b) selected=row;
    else break;
  }

  if(!selected) return 0;
  const minimum=Math.max(Number(state.settings.lotMinimum)||0.01, Number(a.minLot)||0.01);
  const step=Number(a.lotStep)||0.01;
  const lot=Math.floor((Number(selected.lot)||0)/step+1e-12)*step;
  return Number(Math.max(minimum,Math.min(a.maxLot||100,lot)).toFixed(4));
}
function lotSuggestion(balance,profile){
  const b=Number(balance)||0;
  if(b<100) return {lot:0,warning:"Capital abaixo do primeiro nível de gerenciamento (US$100)."};
  return {lot:calcLot(b,profile),warning:""};
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

function rebuildCurrentBalance(){
  // Não sobrescreve o saldo atual de uma instalação já existente quando
  // ainda não há movimentações/operações cadastradas.
  if(!state.operations.length && !state.capitalMovements.length) return;
  if(state.settings.operationalBaseBalance===undefined){
    state.settings.operationalBaseBalance=Number(state.settings.currentBalance)||0;
  }
  const base=Number(state.settings.operationalBaseBalance)||0;
  const movements=state.capitalMovements.reduce((sum,x)=>{
    const v=Number(x.amount)||0;
    return sum+(x.type==="deposit"?v:-v);
  },0);
  const ops=state.operations.reduce((sum,o)=>sum+(Number(o.net)||0),0);
  state.settings.currentBalance=Number((base+movements+ops).toFixed(2));
}
function sessionOperations(sessionId){ return state.operations.filter(o=>o.sessionId===sessionId); }
function sessionSummary(sessionId){
  const ops=sessionOperations(sessionId);
  const net=ops.reduce((s,o)=>s+(Number(o.net)||0),0);
  const gross=ops.reduce((s,o)=>s+(Number(o.gross)||0),0);
  const points=ops.reduce((s,o)=>s+(Number(o.points)||0),0);
  const commission=ops.reduce((s,o)=>s+(Number(o.commission)||0),0);
  const wins=ops.filter(o=>(Number(o.net)||0)>0).length;
  const losses=ops.filter(o=>(Number(o.net)||0)<0).length;
  const exposure=ops.reduce((s,o)=>{
    const aa=state.assets[o.asset]||asset();
    const notional=Number(o.entry)>0 ? Math.abs(Number(o.entry))*Math.abs(Number(o.lot)||0)*(aa.contractSize||0) : Math.abs(Number(o.lot)||0)*(aa.contractSize||0);
    return s+notional;
  },0);
  return {ops,net,gross,points,commission,wins,losses,count:ops.length,exposure};
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
  const profile=state.settings.defaultProfile, lot=calcLot(bal,profile), a=asset();
  const initial=Number(state.settings.initialBalance)||0, capDiff=bal-initial;
  const rows=[]; const base=Math.max(50,Math.floor(bal/50)*50);
  for(let i=-2;i<=8;i++){ const b=Math.max(100,base+i*25); rows.push({b,lot:calcLot(b,profile)}); }
  document.getElementById("view-dashboard").innerHTML=`
    <div class="grid grid-4">
      ${cardMetric("Saldo atual",money(bal),`Inicial ${money(initial)}`)}
      ${cardMetric("Resultado hoje",money(s.net),`${num(s.points,0)} pontos`,s.net>=0?"positive":"negative")}
      ${cardMetric("Performance",pct(initial?capDiff/initial*100:0),"sobre o capital inicial",capDiff>=0?"positive":"negative")}
      ${cardMetric("Win rate",pct(o.winRate),`${o.wins} wins / ${o.losses} losses`)}
    </div>
    <div class="grid grid-2 section-space">
      <div class="card">
        <div class="card-header"><div><h2>Gerenciamento atual</h2><p>${esc(a.name)} · ${esc(profile)}</p></div><span class="pill">${num(lot,2)} lote</span></div>
        <div class="stat-strip">
          <div><span class="kicker">Saldo</span><div class="v">${money(bal)}</div></div>
          <div><span class="kicker">Lote de entrada</span><div class="v">${num(lot,2)}</div></div>
          <div><span class="kicker">100 pts</span><div class="v">${money(pointsToMoney(100,lot,a))}</div></div>
          <div><span class="kicker">Stop diário</span><div class="v">${num(state.settings.dailyStopPoints,0)} pts</div></div>
        </div>
        <div class="callout section-space"><strong>Gerenciamento por perfil</strong><span class="note">O lote sugerido vem da tabela editável do perfil selecionado em Configurações.</span></div>
      </div>
      <div class="card">
        <div class="card-header"><div><h2>Escala de lote</h2><p>${esc(profile)} · tabela de gerenciamento</p></div><span class="pill green">${esc(profile)}</span></div>
        <div class="table-wrap"><table><thead><tr><th>Saldo</th><th>Lote</th></tr></thead><tbody>
          ${rows.map(r=>`<tr ${Math.abs(r.b-bal)<25?'style="background:var(--panel)"':''}><td>${money(r.b)}</td><td><strong>${num(r.lot,2)}</strong></td></tr>`).join("")}
        </tbody></table></div>
      </div>
    </div>
    <div class="grid grid-3 section-space">
      <div class="card"><div class="card-header"><div><h2>Sessão atual</h2><p>Operações agrupadas.</p></div></div>
        ${state.activeSessionId?`<div class="big-number">${sessionSummary(state.activeSessionId).count}</div><div class="note">operações na sessão aberta</div>`:`<div class="empty">Nenhuma sessão aberta.</div>`}
      </div>
      <div class="card"><div class="card-header"><div><h2>Hoje</h2><p>Resultado operacional.</p></div></div>
        <div class="big-number ${s.net>=0?'positive':'negative'}">${money(s.net)}</div><div class="note">${s.count} operações · ${s.wins} wins · ${s.losses} losses</div>
      </div>
      <div class="card"><div class="card-header"><div><h2>Capital</h2><p>Saldo operacional.</p></div></div>
        <div class="big-number">${money(bal)}</div><div class="note">Depósitos: ${money(state.capitalMovements.filter(x=>x.type==="deposit").reduce((s,x)=>s+Number(x.amount),0))}<br>Saques: ${money(state.capitalMovements.filter(x=>x.type==="withdraw").reduce((s,x)=>s+Number(x.amount),0))}</div>
      </div>
    </div>
    <div class="card section-space"><div class="card-header"><div><h2>Evolução operacional</h2><p>Resultado líquido acumulado.</p></div><span class="pill">${o.count} operações</span></div>${renderMiniChart()}</div>`;
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
  const active=state.activeSessionId?state.sessions.find(x=>x.id===state.activeSessionId):null;
  const t=active?sessionSummary(active.id):null;
  document.getElementById("view-session").innerHTML=`
    <div class="grid grid-2">
      <div class="card"><div class="card-header"><div><h2>Abertura da sessão</h2><p>Abra a sessão primeiro; depois todas as operações ficam vinculadas a ela.</p></div>${active?`<span class="pill amber">ABERTA</span>`:""}</div>
        <form id="session-form" class="form-grid">
          <div class="field"><label>Data</label><input type="date" name="date" value="${todayStr()}" required></div><div class="field"><label>Sessão</label><select name="sessionId">${state.sessions.filter(s=>s.status==="open").map(s=>`<option value="${s.id}" ${s.id===state.activeSessionId?"selected":""}>${s.date} · ${esc(s.strategy||"Sessão")}</option>`).join("")}</select></div>
          <div class="field"><label>Horário de início</label><input type="time" name="startTime" value="${new Date().toTimeString().slice(0,5)}" required></div>
          <div class="field"><label>Ativo</label><select name="asset">${Object.values(state.assets).map(x=>`<option ${x.symbol===state.settings.defaultAsset?"selected":""}>${x.symbol}</option>`).join("")}</select></div>
          <div class="field"><label>Perfil</label><select name="profile">${Object.keys(state.profiles).map(x=>`<option ${x===state.settings.defaultProfile?"selected":""}>${x}</option>`).join("")}</select></div>
          <div class="field"><label>Estratégia / setup</label><input name="strategy"></div>
          <div class="field"><label>Objetivo (pontos)</label><input type="number" name="targetPoints" value="${state.settings.dailyTargetPoints}"></div>
          <div class="field"><label>Stop operacional</label><input type="number" name="stopPoints" value="${state.settings.dailyStopPoints}"></div>
          <div class="field full"><label>Contexto inicial</label><textarea name="context"></textarea></div>
          <div class="actions full"><button class="btn primary" ${active?"disabled":""}>${active?"Sessão já aberta":"Abrir sessão"}</button></div>
        </form>
      </div>
      <div class="card"><div class="card-header"><div><h2>${active?"Sessão em andamento":"Referência"}</h2><p>${active?"Resumo atualizado pelas operações vinculadas.":"Baseada no saldo atual."}</p></div></div>
        ${active?`
          <div class="stat-strip">
            <div><span class="kicker">Operações</span><div class="v">${t.count}</div></div>
            <div><span class="kicker">Exposição</span><div class="v">${money(t.exposure)}</div></div>
            <div><span class="kicker">Pontos</span><div class="v">${num(t.points,0)}</div></div>
            <div><span class="kicker">Resultado</span><div class="v ${t.net>=0?'positive':'negative'}">${money(t.net)}</div></div>
          </div>
          <div class="actions section-space"><button class="btn primary" data-view-target="operations">Registrar operação</button><button class="btn danger" data-close-session="${active.id}">Encerrar sessão</button></div>
          ${renderSessionOperations(active.id)}
        `:`
          <div class="stat-strip"><div><span class="kicker">Saldo</span><div class="v">${money(bal)}</div></div><div><span class="kicker">Lote</span><div class="v">${num(calcLot(bal,state.settings.defaultProfile),2)}</div></div><div><span class="kicker">500 pts</span><div class="v">${money(pointsToMoney(500,calcLot(bal,state.settings.defaultProfile),a))}</div></div><div><span class="kicker">Comissão</span><div class="v">${money(commission(calcLot(bal,state.settings.defaultProfile),a))}</div></div></div>
          <div class="callout section-space"><strong>Fluxo</strong><span class="note">Abra → registre operações → encerre. Ao encerrar, o resumo entra automaticamente na Projeção & Objetivos.</span></div>
        `}
      </div>
    </div>
    <div class="card section-space"><div class="card-header"><div><h2>Histórico de sessões</h2><p>Todos os registros permanecem editáveis.</p></div></div>${renderSessionsTable()}</div>`;
  const form=document.getElementById("session-form");
  if(form) form.onsubmit=e=>{
    e.preventDefault(); if(state.activeSessionId){toast("Já existe uma sessão aberta.");return;}
    const f=new FormData(e.target);
    const item={id:uid(),date:f.get("date"),startTime:f.get("startTime"),endTime:"",asset:f.get("asset"),profile:f.get("profile"),strategy:f.get("strategy"),targetPoints:Number(f.get("targetPoints")),stopPoints:Number(f.get("stopPoints")),context:f.get("context"),journal:"",status:"open",balanceBefore:Number(state.settings.currentBalance)||0,createdAt:new Date().toISOString()};
    state.sessions.unshift(item); state.activeSessionId=item.id; save(); toast("Sessão aberta."); render();
  };
}
function renderSessionOperations(id){
  const ops=sessionOperations(id);
  if(!ops.length)return `<div class="empty section-space">Nenhuma operação registrada ainda.</div>`;
  return `<div class="table-wrap section-space"><table><thead><tr><th>Hora</th><th>Ativo</th><th>Dir.</th><th>Lote</th><th>Pontos</th><th>Líquido</th><th>Ação</th></tr></thead><tbody>${ops.map(o=>`<tr><td>${o.time||"-"}</td><td>${esc(o.asset)}</td><td>${o.direction===1?"BUY":"SELL"}</td><td>${num(o.lot,2)}</td><td>${num(o.points,0)}</td><td class="${o.net>=0?'positive':'negative'}">${money(o.net)}</td><td><button class="btn secondary" data-edit-op="${o.id}">Editar</button></td></tr>`).join("")}</tbody></table></div>`;
}

function renderProjection(){
  const p=ensureProjectionState(), real=Number(state.settings.currentBalance)||0, target=Number(p.target)||0;
  const stage=currentProjectionStage(p,real), stageTarget=stage?stage.to:target;
  const active=projectionSession(p,p.activeProfile,real);
  const remaining=projectSessionsToTarget(p,p.activeProfile,real,stageTarget);
  const closed=state.sessions.filter(s=>s.status==="closed").slice().reverse();
  document.getElementById("view-projection").innerHTML=`
    <div class="callout"><strong>Projeção & Objetivos</strong><span class="note">O percentual permanece fixo. O valor em US$ muda conforme o novo saldo: saldo × ${num(p.dailyPercent,1)}%.</span></div>
    <div class="grid grid-4 section-space">
      ${cardMetric("Meta principal",money(target),"objetivo final")}
      ${cardMetric("Saldo atual",money(real),stage?`próxima meta ${money(stageTarget)}`:"meta concluída",real>=target?"positive":"")}
      ${cardMetric("Busca diária",money(active.dailyTarget),`${num(p.dailyPercent,1)}% do saldo atual`)}
      ${cardMetric("Sessões restantes",remaining===null?"—":remaining,`até ${money(stageTarget)}`)}
    </div>
    <div class="card section-space">
      <div class="card-header"><div><h2>Planilha da etapa atual</h2><p>${money(real)} → ${money(stageTarget)} · ${esc(p.activeProfile)}</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>Sessão</th><th>Saldo atual</th><th>Busca</th><th>Meta US$</th><th>Saldo projetado</th><th>Status</th></tr></thead><tbody>${renderProjectionRows(p,real,stageTarget,closed)}</tbody></table></div>
      <p class="note section-space">Exemplo: US$100 → +30% = US$30 → US$130. A próxima linha recalcula 30% sobre US$130 = US$39.</p>
    </div>
    <div class="card section-space">
      <div class="card-header"><div><h2>Sessões encerradas</h2><p>Cada sessão encerrada alimenta automaticamente esta tabela.</p></div><span class="pill green">${closed.length}</span></div>
      ${closed.length?`<div class="table-wrap"><table><thead><tr><th>Sessão</th><th>Data</th><th>Operações</th><th>Exposição</th><th>Pontos</th><th>Lucro/Perda</th><th>Saldo após</th><th>Ação</th></tr></thead><tbody>${closed.map((s,i)=>{const t=sessionSummary(s.id);return `<tr><td>${closed.length-i}</td><td>${s.date}</td><td>${t.count}</td><td>${money(t.exposure)}</td><td>${num(t.points,0)}</td><td class="${t.net>=0?'positive':'negative'}">${money(t.net)}</td><td>${money(s.balanceAfter??(s.balanceBefore+t.net))}</td><td><button class="btn secondary" data-edit-session="${s.id}">Editar</button></td></tr>`}).join("")}</tbody></table></div>`:`<div class="empty">Nenhuma sessão encerrada.</div>`}
    </div>
    <div class="card section-space"><div class="card-header"><div><h2>Configuração</h2><p>Objetivo e percentual permanecem editáveis.</p></div></div>
      <form id="projection-form" class="form-grid three">
        <div class="field full"><label>Nome do projeto</label><input name="name" value="${esc(p.name)}"></div>
        <div class="field"><label>Saldo inicial</label><input name="initial" type="number" step="0.01" value="${p.initialBalance}"></div>
        <div class="field"><label>Meta principal</label><input name="target" type="number" step="0.01" value="${p.target}"></div>
        <div class="field"><label>Busca diária (%)</label><input name="dailyPercent" type="number" step="0.1" value="${p.dailyPercent}"></div>
        <div class="field"><label>Perfil</label><select name="profile">${Object.keys(state.profiles).map(x=>`<option ${x===p.activeProfile?'selected':''}>${x}</option>`).join("")}</select></div>
        <div class="field"><label>Ativo</label><select name="asset">${Object.values(state.assets).map(a=>`<option ${a.symbol===p.asset?'selected':''}>${a.symbol}</option>`).join("")}</select></div>
        <div class="actions full"><button class="btn primary">Salvar</button></div>
      </form>
    </div>`;
  document.getElementById("projection-form").onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);state.projection={...p,name:f.get("name")||"Projeto principal",initialBalance:Number(f.get("initial"))||0,target:Number(f.get("target"))||0,dailyPercent:Number(f.get("dailyPercent"))||30,activeProfile:f.get("profile"),asset:f.get("asset")};save();toast("Projeção atualizada.");render();};
}
function renderProjectionRows(p,real,target,closed){
  if(real>=target)return `<tr><td>—</td><td>${money(real)}</td><td>—</td><td>—</td><td>${money(real)}</td><td><span class="pill green">META CONCLUÍDA</span></td></tr>`;
  let bal=real, html="";
  for(let i=1;i<=Math.min(100,Math.max(20,closed.length+10));i++){
    const x=projectionSession(p,p.activeProfile,bal); if(x.net<=0)break;
    const done=closed[i-1], after=Math.min(target,bal+x.net);
    html+=`<tr><td>${i}</td><td>${money(bal)}</td><td>${num(p.dailyPercent,1)}%</td><td>${money(x.dailyTarget)}</td><td>${money(after)}</td><td><span class="pill ${done?'green':i===closed.length+1?'amber':''}">${done?'CONCLUÍDO':i===closed.length+1?'PRÓXIMA':'PROJETADO'}</span></td></tr>`;
    bal=after; if(bal>=target)break;
  }
  return html;
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
  const tab=state.settings.activeSettingsTab||"geral";
  normalizeLotRules();

  const tabs=[
    ["geral","Gerenciamento"],
    ["lotes","Perfis de lote"],
    ["capital","Depósitos e saques"],
    ["ativos","Ativos"]
  ];

  document.getElementById("view-settings").innerHTML=`
    <div class="card">
      <div class="card-header">
        <div><h2>Configurações</h2><p>Todos os parâmetros administrativos e de gerenciamento da Nexora ficam centralizados aqui.</p></div>
      </div>
      <div class="tabs">
        ${tabs.map(([id,label])=>`<button class="tab-btn ${tab===id?"active":""}" data-settings-tab="${id}">${label}</button>`).join("")}
      </div>
    </div>
    <div class="section-space">${renderSettingsTab(tab)}</div>`;

  document.querySelectorAll("[data-settings-tab]").forEach(btn=>btn.onclick=()=>{
    state.settings.activeSettingsTab=btn.dataset.settingsTab;
    save();render();
  });

  bindSettingsTab(tab);
}

function renderSettingsTab(tab){
  if(tab==="geral"){
    const suggestion=lotSuggestion(state.settings.currentBalance,state.settings.defaultProfile);
    return `
      <div class="grid grid-2">
        <div class="card">
          <div class="card-header"><div><h2>Gerenciamento de capital</h2><p>Valores sempre em dólar.</p></div></div>
          <form id="settings-general-form" class="form-grid">
            <div class="field"><label>Capital inicial (US$)</label><input name="initial" type="number" step="0.01" value="${state.settings.initialBalance}"></div>
            <div class="field"><label>Saldo atual (US$)</label><input name="current" type="number" step="0.01" value="${state.settings.currentBalance}"></div>
            <div class="field"><label>Busca mínima diária (%)</label><input name="minSearch" type="number" min="0" step="0.1" value="${state.settings.minDailySearchPercent??20}"></div>
            <div class="field"><label>Stop operacional diário (Pontos Nexora)</label><input name="stop" type="number" value="${state.settings.dailyStopPoints}"></div>
            <div class="field"><label>Meta operacional em pontos</label><input name="target" type="number" value="${state.settings.dailyTargetPoints}"></div>
            <div class="field"><label>Lote mínimo permitido</label><input name="lotMinimum" type="number" min="0.01" step="0.01" value="${state.settings.lotMinimum}"></div>
            <div class="field"><label>Perfil padrão</label><select name="profile">${Object.keys(state.settings.lotRules).map(x=>`<option ${x===state.settings.defaultProfile?"selected":""}>${esc(x)}</option>`).join("")}</select></div>
            <div class="field"><label>Ativo padrão</label><select name="asset">${Object.keys(state.assets).map(x=>`<option ${x===state.settings.defaultAsset?"selected":""}>${esc(x)}</option>`).join("")}</select></div>
            <div class="actions full"><button class="btn primary">Salvar gerenciamento</button></div>
          </form>
        </div>
        <div class="card">
          <div class="card-header"><div><h2>Sugestão atual</h2><p>O lote é consultado na tabela do perfil selecionado.</p></div><span class="pill">${esc(state.settings.defaultProfile)}</span></div>
          ${suggestion.warning?`<div class="callout"><strong>${esc(suggestion.warning)}</strong><span class="note">A Nexora não inventa um lote abaixo do primeiro nível.</span></div>`:`
            <div class="stat-strip">
              <div><span class="kicker">Saldo</span><div class="v">${money(state.settings.currentBalance)}</div></div>
              <div><span class="kicker">Busca mínima</span><div class="v">${num(state.settings.minDailySearchPercent??20,1)}%</div></div>
              <div><span class="kicker">Meta mínima US$</span><div class="v">${money(state.settings.currentBalance*(state.settings.minDailySearchPercent??20)/100)}</div></div>
              <div><span class="kicker">Lote sugerido</span><div class="v">${num(suggestion.lot,2)}</div></div>
            </div>`}
        </div>
      </div>`;
  }

  if(tab==="lotes"){
    const profile=state.settings.activeLotProfile||"Moderado 1";
    const rules=state.settings.lotRules[profile]||[];
    return `
      <div class="card">
        <div class="card-header">
          <div><h2>Tabela de gerenciamento por lote</h2><p>Cada perfil possui sua própria tabela. O valor usado é o maior nível que o saldo atual já alcançou.</p></div>
          <select id="lot-profile-select">${Object.keys(state.settings.lotRules).map(x=>`<option ${x===profile?"selected":""}>${esc(x)}</option>`).join("")}</select>
        </div>
        <div class="callout"><strong>Regra abaixo de US$100</strong><span class="note">Abaixo do primeiro nível, a Nexora mostra "capital abaixo do primeiro nível" e não sugere lote automaticamente.</span></div>
        <div class="table-wrap section-space"><table><thead><tr><th>Capital (US$)</th><th>Lote sugerido</th><th>Ação</th></tr></thead><tbody>
          ${rules.slice(0,80).map((r,i)=>`<tr><td><input class="inline-edit lot-balance" data-i="${i}" type="number" step="25" value="${r.balance}"></td><td><input class="inline-edit lot-value" data-i="${i}" type="number" min="0.01" step="0.01" value="${r.lot.toFixed(2)}"></td><td><button class="btn secondary" data-save-lot-row="${i}">Salvar</button></td></tr>`).join("")}
        </tbody></table></div>
        <div class="actions"><button class="btn primary" id="save-lot-table">Salvar tabela ${esc(profile)}</button></div>
      </div>`;
  }

  if(tab==="capital"){
    const deps=state.capitalMovements.filter(x=>x.type==="deposit").reduce((s,x)=>s+Number(x.amount),0);
    const wds=state.capitalMovements.filter(x=>x.type==="withdraw").reduce((s,x)=>s+Number(x.amount),0);
    return `
      <div class="grid grid-3">${cardMetric("Saldo atual",money(state.settings.currentBalance),"saldo operacional")}${cardMetric("Depósitos",money(deps),"total")}${cardMetric("Saques",money(wds),"total")}</div>
      <div class="grid grid-2 section-space">
        <div class="card"><div class="card-header"><div><h2>Nova movimentação</h2><p>Depósitos e saques não são resultados de operação.</p></div></div>
          <form id="settings-capital-form" class="form-grid">
            <div class="field"><label>Tipo</label><select name="type"><option value="deposit">Depósito</option><option value="withdraw">Saque</option></select></div>
            <div class="field"><label>Valor (US$)</label><input name="amount" type="number" step="0.01" required></div>
            <div class="field"><label>Data</label><input name="date" type="date" value="${todayStr()}"></div>
            <div class="field"><label>Observação</label><input name="note"></div>
            <div class="actions full"><button class="btn primary">Registrar movimentação</button></div>
          </form>
        </div>
        <div class="card"><div class="card-header"><div><h2>Histórico</h2><p>Movimentações editáveis em etapa posterior.</p></div></div>
          ${state.capitalMovements.length?`<div class="table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Valor</th><th>Observação</th></tr></thead><tbody>${state.capitalMovements.map(x=>`<tr><td>${x.date}</td><td>${x.type==="deposit"?"Depósito":"Saque"}</td><td class="${x.type==="deposit"?"positive":"negative"}">${x.type==="deposit"?"+":"-"}${money(x.amount)}</td><td>${esc(x.note||"")}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">Nenhuma movimentação.</div>`}
        </div>
      </div>`;
  }

  return `
    <div class="card">
      <div class="card-header"><div><h2>Cadastro de ativos</h2><p>Todos os ativos ficam dentro de Configurações.</p></div><button class="btn primary" id="new-asset-settings">+ Novo ativo</button></div>
      <div class="table-wrap"><table><thead><tr><th>Ativo</th><th>Contrato</th><th>Pontos / 1,00 preço</th><th>Min lote</th><th>Step</th><th>Comissão/lote</th></tr></thead><tbody>${Object.values(state.assets).map(a=>`<tr><td><strong>${esc(a.symbol)}</strong><br><span class="note">${esc(a.name)}</span></td><td>${num(a.contractSize,0)}</td><td>${num(a.nexoraPointsPerPriceUnit,0)}</td><td>${num(a.minLot,2)}</td><td>${num(a.lotStep,2)}</td><td>${money(a.commissionPerLotRoundTurn)}</td></tr>`).join("")}</tbody></table></div>
    </div>`;
}

function bindSettingsTab(tab){
  if(tab==="geral"){
    const f=document.getElementById("settings-general-form");
    if(f) f.onsubmit=e=>{
      e.preventDefault();const d=new FormData(f);
      state.settings.initialBalance=Number(d.get("initial"))||0;
      state.settings.currentBalance=Number(d.get("current"))||0;
      state.settings.minDailySearchPercent=Math.max(0,Number(d.get("minSearch"))||20);
      state.settings.dailyStopPoints=Number(d.get("stop"))||500;
      state.settings.dailyTargetPoints=Number(d.get("target"))||500;
      state.settings.lotMinimum=Math.max(0.01,Number(d.get("lotMinimum"))||0.01);
      state.settings.defaultProfile=d.get("profile");
      state.settings.defaultAsset=d.get("asset");
      save();toast("Gerenciamento atualizado.");render();
    };
  }
  if(tab==="lotes"){
    const sel=document.getElementById("lot-profile-select");
    if(sel) sel.onchange=()=>{state.settings.activeLotProfile=sel.value;save();render();};
    document.querySelectorAll("[data-save-lot-row]").forEach(btn=>btn.onclick=()=>{
      const i=Number(btn.dataset.saveLotRow), profile=state.settings.activeLotProfile||"Moderado 1";
      const bal=document.querySelector(`.lot-balance[data-i="${i}"]`), lot=document.querySelector(`.lot-value[data-i="${i}"]`);
      if(!bal||!lot)return;
      state.settings.lotRules[profile][i]={balance:Math.max(100,Number(bal.value)||100),lot:Math.max(0.01,Number(lot.value)||0.01)};
      state.settings.lotRules[profile].sort((a,b)=>a.balance-b.balance);
      save();toast("Linha do perfil atualizada.");render();
    });
    const saveAll=document.getElementById("save-lot-table");
    if(saveAll) saveAll.onclick=()=>{save();toast("Tabela de lotes salva.");render();};
  }
  if(tab==="capital"){
    const f=document.getElementById("settings-capital-form");
    if(f) f.onsubmit=e=>{
      e.preventDefault();const d=new FormData(f),type=d.get("type"),amount=Math.abs(Number(d.get("amount"))||0);if(!amount)return;
      state.capitalMovements.unshift({id:uid(),type,amount,date:d.get("date"),note:d.get("note")});
      state.settings.currentBalance=Number((state.settings.currentBalance+(type==="deposit"?amount:-amount)).toFixed(2));
      save();toast("Movimentação registrada.");render();
    };
  }
  if(tab==="ativos"){
    const b=document.getElementById("new-asset-settings");
    if(b)b.onclick=()=>{
      const symbol=prompt("Símbolo do ativo (ex.: NAS100):");if(!symbol)return;
      const name=prompt("Nome:")||symbol;
      const contractSize=Number(prompt("Tamanho do contrato:","1"))||1;
      const pointsPerPrice=Number(prompt("Pontos Nexora por 1,00 de preço:","100"))||100;
      const commissionRT=Number(prompt("Comissão por lote round turn (US$):","0"))||0;
      state.assets[symbol.toUpperCase()]={symbol:symbol.toUpperCase(),name,priceUnit:1/pointsPerPrice,nexoraPointsPerPriceUnit:pointsPerPrice,contractSize,minLot:0.01,lotStep:0.01,commissionPerLotRoundTurn:commissionRT,avgSpread:0};
      save();toast("Ativo adicionado.");render();
    };
  }
}

document.addEventListener("click",e=>{
  const close=e.target.closest("[data-close-session]");
  if(close){
    const sess=state.sessions.find(x=>x.id===close.dataset.closeSession); if(!sess)return;
    if(sess.status==="open"){
      const t=sessionSummary(sess.id);
      sess.status="closed"; sess.endTime=new Date().toTimeString().slice(0,5); sess.balanceAfter=Number(state.settings.currentBalance)||0;
      sess.summary={count:t.count,exposure:t.exposure,points:t.points,net:t.net,gross:t.gross,commission:t.commission,wins:t.wins,losses:t.losses};
      sess.projection={balanceBefore:sess.balanceBefore,plannedPercent:Number(state.projection?.dailyPercent)||30,plannedMoney:projectionSession(ensureProjectionState(),sess.profile,sess.balanceBefore).dailyTarget,plannedLot:projectionSession(ensureProjectionState(),sess.profile,sess.balanceBefore).lot,plannedPoints:projectionSession(ensureProjectionState(),sess.profile,sess.balanceBefore).points,realNet:t.net,balanceAfter:sess.balanceAfter};
      if(state.activeSessionId===sess.id)state.activeSessionId=null;
      save();toast("Sessão encerrada e enviada para a Projeção.");render();
    }
  }
  const editS=e.target.closest("[data-edit-session]");
  if(editS){
    const sess=state.sessions.find(x=>x.id===editS.dataset.editSession); if(!sess)return;
    const strategy=prompt("Estratégia / setup:",sess.strategy||""); if(strategy===null)return;
    const context=prompt("Contexto:",sess.context||""); if(context===null)return;
    const journal=prompt("Diário / aprendizado:",sess.journal||""); if(journal===null)return;
    const target=prompt("Objetivo em pontos:",String(sess.targetPoints||0)); if(target===null)return;
    sess.strategy=strategy;sess.context=context;sess.journal=journal;sess.targetPoints=Number(target)||0;
    save();toast("Sessão editada.");render();
  }
  const editO=e.target.closest("[data-edit-op]");
  if(editO){
    const o=state.operations.find(x=>x.id===editO.dataset.editOp); if(!o)return;
    const net=prompt("Resultado líquido MT5 (US$):",String(o.net)); if(net===null)return;
    const points=prompt("Pontos Nexora:",String(o.points)); if(points===null)return;
    const lot=prompt("Lote:",String(o.lot)); if(lot===null)return;
    const note=prompt("Observação:",o.note||""); if(note===null)return;
    o.net=Number(net)||0;o.points=Number(points)||0;o.lot=Number(lot)||0;o.note=note;
    const aa=state.assets[o.asset]||asset();o.gross=pointsToMoney(o.points,o.lot,aa);o.executionCost=o.gross-o.net;
    rebuildCurrentBalance();
    state.sessions.forEach(ss=>{const t=sessionSummary(ss.id);if(ss.status==="closed"){ss.summary={count:t.count,exposure:t.exposure,points:t.points,net:t.net,gross:t.gross,commission:t.commission,wins:t.wins,losses:t.losses};ss.balanceAfter=Number((ss.balanceBefore+t.net).toFixed(2));}});
    save();toast("Operação editada e saldo recalculado.");render();
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

state.activeSessionId=state.activeSessionId||null;
state.sessions=Array.isArray(state.sessions)?state.sessions:[];
state.operations=Array.isArray(state.operations)?state.operations:[];
if(!state.projection)state.projection={name:'Projeto principal',initialBalance:60,target:1000,dailyPercent:30,activeProfile:'Moderado',asset:'XAUUSD'};
if(!state.projection.dailyPercent)state.projection.dailyPercent=30;
if(state.settings.minDailySearchPercent===undefined)state.settings.minDailySearchPercent=20;
if(state.settings.lotMinimum===undefined)state.settings.lotMinimum=0.01;
normalizeLotRules();
rebuildCurrentBalance();save();
nav(); render();function renderSessionsTable(){
  if(!state.sessions.length)return `<div class="empty">Nenhuma sessão registrada.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Horário</th><th>Ativo</th><th>Perfil</th><th>Ops</th><th>Exposição</th><th>Resultado</th><th>Status</th><th>Ação</th></tr></thead><tbody>${state.sessions.slice(0,50).map(s=>{const t=sessionSummary(s.id);return `<tr><td>${s.date}</td><td>${s.startTime}${s.endTime?` → ${s.endTime}`:""}</td><td>${esc(s.asset)}</td><td>${esc(s.profile)}</td><td>${t.count}</td><td>${money(t.exposure)}</td><td class="${t.net>=0?'positive':'negative'}">${money(t.net)}</td><td><span class="pill ${s.status==="open"?"amber":"green"}">${s.status==="open"?"Aberta":"Fechada"}</span></td><td><button class="btn secondary" data-edit-session="${s.id}">Editar</button>${s.status==="open"?` <button class="btn danger" data-close-session="${s.id}">Encerrar</button>`:""}</td></tr>`}).join("")}</tbody></table></div>`;
}
function renderOperations(){
  const a=asset();
  const openSessions=state.sessions.filter(s=>s.status==="open");
  document.getElementById("view-operations").innerHTML=`
    <div class="grid grid-2">
      <div class="card">
        <div class="card-header"><div><h2>Lançamento detalhado</h2><p>Entrada + saída + resultado líquido do MT5.</p></div></div>
        <form id="op-detailed" class="form-grid">
          <div class="field"><label>Sessão</label><select name="sessionId" required>${openSessions.map(s=>`<option value="${s.id}" ${s.id===state.activeSessionId?'selected':''}>${s.date} · ${esc(s.strategy||'Sessão')}</option>`).join('')}</select></div>
          <div class="field"><label>Data</label><input type="date" name="date" value="${todayStr()}" required></div>
          <div class="field"><label>Horário</label><input type="time" name="time" value="${new Date().toTimeString().slice(0,5)}" required></div>
          <div class="field"><label>Ativo</label><select name="asset">${Object.values(state.assets).map(x=>`<option ${x.symbol===state.settings.defaultAsset?'selected':''}>${x.symbol}</option>`).join('')}</select></div>
          <div class="field"><label>Direção</label><select name="direction"><option value="1">BUY</option><option value="-1">SELL</option></select></div>
          <div class="field"><label>Lote</label><input type="number" step="0.01" name="lot" value="${num(calcLot(state.settings.currentBalance,state.settings.defaultProfile),2)}" required></div>
          <div class="field"><label>Entrada</label><input type="number" step="0.01" name="entry" required></div>
          <div class="field"><label>Saída</label><input type="number" step="0.01" name="exit" required></div>
          <div class="field"><label>Resultado líquido MT5 (US$)</label><input type="number" step="0.01" name="net" required></div>
          <div class="field"><label>Comissão MT5 (US$)</label><input type="number" step="0.01" name="commission" value="${commission(calcLot(state.settings.currentBalance,state.settings.defaultProfile),a).toFixed(2)}"></div>
          <div class="field"><label>Estratégia</label><input name="strategy"></div>
          <div class="field full"><label>Observação</label><textarea name="note"></textarea></div>
          <div class="actions full"><button class="btn primary" ${openSessions.length?'':'disabled'}>Registrar operação</button></div>
        </form>
      </div>
      <div class="card">
        <div class="card-header"><div><h2>Lançamento rápido</h2><p>Quando você já tem os dados finais do MT5.</p></div></div>
        <form id="op-quick" class="form-grid">
          <div class="field"><label>Sessão</label><select name="sessionId" required>${openSessions.map(s=>`<option value="${s.id}" ${s.id===state.activeSessionId?'selected':''}>${s.date} · ${esc(s.strategy||'Sessão')}</option>`).join('')}</select></div>
          <div class="field"><label>Data</label><input type="date" name="date" value="${todayStr()}" required></div>
          <div class="field"><label>Horário</label><input type="time" name="time" value="${new Date().toTimeString().slice(0,5)}" required></div>
          <div class="field"><label>Ativo</label><select name="asset">${Object.values(state.assets).map(x=>`<option ${x.symbol===state.settings.defaultAsset?'selected':''}>${x.symbol}</option>`).join('')}</select></div>
          <div class="field"><label>Direção</label><select name="direction"><option value="1">BUY</option><option value="-1">SELL</option></select></div>
          <div class="field"><label>Lote</label><input type="number" step="0.01" name="lot" value="${num(calcLot(state.settings.currentBalance,state.settings.defaultProfile),2)}"></div>
          <div class="field"><label>Pontos Nexora</label><input type="number" step="1" name="points" required></div>
          <div class="field"><label>Resultado líquido MT5 (US$)</label><input type="number" step="0.01" name="net" required></div>
          <div class="field"><label>Comissão (US$)</label><input type="number" step="0.01" name="commission"></div>
          <div class="field full"><label>Observação</label><textarea name="note"></textarea></div>
          <div class="actions full"><button class="btn primary" ${openSessions.length?'':'disabled'}>Registrar lançamento rápido</button></div>
        </form>
      </div>
    </div>
    <div class="card section-space"><div class="card-header"><div><h2>Histórico</h2><p>Cada operação pertence a uma sessão e pode ser editada.</p></div></div>${renderOpsTable()}</div>`;

  const detailed=document.getElementById("op-detailed");
  if(detailed) detailed.onsubmit=e=>{
    e.preventDefault(); const f=new FormData(e.target), aa=state.assets[f.get('asset')];
    const points=pointsFromPrices(f.get('entry'),f.get('exit'),Number(f.get('direction')),aa);
    const lot=Number(f.get('lot')), net=Number(f.get('net')), comm=Number(f.get('commission'))||0, gross=pointsToMoney(points,lot,aa);
    addOperation({date:f.get('date'),time:f.get('time'),sessionId:f.get('sessionId'),asset:f.get('asset'),direction:Number(f.get('direction')),lot,points,gross,net,commission:comm,executionCost:gross-net,entry:Number(f.get('entry')),exit:Number(f.get('exit')),strategy:f.get('strategy'),note:f.get('note'),mode:'detailed'});
  };
  const quick=document.getElementById("op-quick");
  if(quick) quick.onsubmit=e=>{
    e.preventDefault(); const f=new FormData(e.target), lot=Number(f.get('lot')), aa=state.assets[f.get('asset')], points=Number(f.get('points')), net=Number(f.get('net')), comm=Number(f.get('commission'))||0, gross=pointsToMoney(points,lot,aa);
    addOperation({date:f.get('date'),time:f.get('time'),sessionId:f.get('sessionId'),asset:f.get('asset'),direction:Number(f.get('direction')),lot,points,gross,net,commission:comm,executionCost:gross-net,entry:null,exit:null,strategy:'',note:f.get('note'),mode:'quick'});
  };
}
function addOperation(o){
  if(!o.sessionId){toast('Abra uma sessão antes de registrar a operação.');return;}
  if(!state.activeSessionId) state.activeSessionId=o.sessionId;
  state.operations.unshift({id:uid(),timestamp:new Date().toISOString(),...o});
  rebuildCurrentBalance(); save(); toast('Operação registrada na sessão e saldo atualizado.'); render();
}
function renderOpsTable(){
  if(!state.operations.length)return `<div class="empty">Nenhuma operação registrada.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Sessão</th><th>Ativo</th><th>Dir.</th><th>Lote</th><th>Pontos</th><th>Líquido MT5</th><th>Ação</th></tr></thead><tbody>${state.operations.slice(0,100).map(o=>{const s=state.sessions.find(x=>x.id===o.sessionId);return `<tr><td>${o.date} ${o.time||""}</td><td>${s?s.date:"—"}</td><td>${esc(o.asset)}</td><td>${o.direction===1?"BUY":"SELL"}</td><td>${num(o.lot,2)}</td><td>${num(o.points,0)}</td><td class="${o.net>=0?'positive':'negative'}">${money(o.net)}</td><td><button class="btn secondary" data-edit-op="${o.id}">Editar</button></td></tr>`}).join("")}</tbody></table></div><p class="note">As operações são vinculadas à sessão e podem ser editadas depois.</p>`;
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


