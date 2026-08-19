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
    operationalManagements: {
      "Scalping": {
        searchPercent: 20, minPoints: 50, maxPoints: 500, takePoints: 150, stopPoints: 500,
        maxOperations: 10, riskReward: 1, maxDailyLossPercent: 20, enabled: true,
        lotModel:"per_capital", capitalStep:10, lotStep:0.01, maxEntries:3, entrySpacingPoints:50
      },
      "Reversão": {
        searchPercent: 20, minPoints: 100, maxPoints: 1000, takePoints: 300, stopPoints: 500,
        maxOperations: 5, riskReward: 1, maxDailyLossPercent: 20, enabled: true,
        lotModel:"financial_profile", capitalStep:100, lotStep:0.01, maxEntries:2, entrySpacingPoints:100
      },
      "Continuação de tendência": {
        searchPercent: 20, minPoints: 200, maxPoints: 2000, takePoints: 600, stopPoints: 500,
        maxOperations: 5, riskReward: 1.5, maxDailyLossPercent: 20, enabled: true,
        lotModel:"financial_profile", capitalStep:100, lotStep:0.01, maxEntries:2, entrySpacingPoints:150
      }
    },
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
  journalEntries: [],
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

function ensureOperationalManagements(){
  const defaults=defaultState.settings.operationalManagements;
  if(!state.settings.operationalManagements || typeof state.settings.operationalManagements!=="object")
    state.settings.operationalManagements=structuredClone(defaults);
  Object.keys(defaults).forEach(name=>{
    if(!state.settings.operationalManagements[name])
      state.settings.operationalManagements[name]=structuredClone(defaults[name]);
    state.settings.operationalManagements[name]={
      ...defaults[name],...state.settings.operationalManagements[name]
    };
  });
  if(!state.settings.defaultOperationalManagement)
    state.settings.defaultOperationalManagement="Scalping";
}
ensureOperationalManagements();

function managementLotPlan(balance,managementName,profile){
  const cfg=(state.settings.operationalManagements||{})[managementName]||{};
  let baseLot=0;
  if(cfg.lotModel==="per_capital"){
    const step=Math.max(0.01,Number(cfg.capitalStep)||100);
    const lotStep=Math.max(0.01,Number(cfg.lotStep)||0.01);
    baseLot=Math.floor((Number(balance)||0)/step+1e-9)*lotStep;
  }else{
    baseLot=lotSuggestion(balance,profile).lot;
  }
  baseLot=Number(baseLot.toFixed(2));
  const maxEntries=Math.max(1,Math.floor(Number(cfg.maxEntries)||1));
  const maxTotalLot=Number((baseLot*maxEntries).toFixed(2));
  return {baseLot,maxEntries,maxTotalLot,entrySpacingPoints:Math.max(0,Number(cfg.entrySpacingPoints)||0)};
}
function tradePlan(balance,managementName,profile,assetSymbol,percent){
  const cfg=(state.settings.operationalManagements||{})[managementName]||{};
  const a=state.assets[assetSymbol]||asset();
  const plan=managementLotPlan(balance,managementName,profile);
  const netTarget=(Number(balance)||0)*(Number(percent)||0)/100;
  const fees=commission(plan.maxTotalLot,a);
  const grossTarget=netTarget+fees;
  const points=plan.maxTotalLot>0?moneyToPoints(grossTarget,plan.maxTotalLot,a):0;
  const stopMoney=plan.maxTotalLot>0?pointsToMoney(Number(cfg.stopPoints)||0,plan.maxTotalLot,a):0;
  return {...plan,netTarget,fees,grossTarget,points,stopMoney,
    takePoints:Number(cfg.takePoints)||0,stopPoints:Number(cfg.stopPoints)||0,
    riskReward:Number(cfg.riskReward)||1};
}
function buildDefaultLotRules(){
  const profiles=["Conservador","Moderado","Moderado 1","Agressivo"];
  const rows={};
  profiles.forEach(profile=>{
    rows[profile]=[];
    const balances=[10,25,50,75];
    for(let balance=100;balance<=5000;balance+=25) balances.push(balance);
    balances.forEach(balance=>{
      // Keep the established profile progression; below US$100 the first profile lot is used.
      const i=Math.max(0,Math.floor((balance-100)/25));
      let lot=0.01;
      if(profile==="Conservador") lot=0.01+i*0.01;
      if(profile==="Moderado") lot=0.03+i*0.01;
      if(profile==="Moderado 1") lot=0.05+i*0.01;
      if(profile==="Agressivo") lot=0.12 + Math.floor(i/2)*0.05 + (i%2)*0.03;
      rows[profile].push({balance,lot:Number(lot.toFixed(2))});
    });
  });
  return rows;
}
function normalizeLotRules(){
  const defaults=buildDefaultLotRules();
  state.settings.lotMinimum=Number(state.settings.lotMinimum)||0.01;
  if(!state.settings.lotRules) state.settings.lotRules={};
  Object.keys(defaults).forEach(profile=>{
    const existing=Array.isArray(state.settings.lotRules[profile])?state.settings.lotRules[profile]:[];
    const byBalance=new Map(existing.map(r=>[Number(r.balance),r]));
    state.settings.lotRules[profile]=defaults[profile].map(r=>byBalance.has(r.balance)?byBalance.get(r):r);
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
function dailyOperationalPlan(balance=calculatedAccountBalance(), profile=state.settings.defaultProfile, assetSymbol=state.settings.defaultAsset, percent=state.settings.minDailySearchPercent??20){
  const a=state.assets[assetSymbol]||asset();
  const netTarget=Math.max(0,Number(balance)||0)*Math.max(0,Number(percent)||0)/100;
  const lot=lotSuggestion(balance,profile).lot;
  const fees=commission(lot,a);
  const grossRequired=netTarget+fees;
  const points=lot>0?moneyToPoints(grossRequired,lot,a):0;
  return {balance,percent:Number(percent)||0,netTarget,lot,fees,grossRequired,points};
}

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
  let eq=projectInitialBalance();
  let peak=eq, maxDD=0;
  [...ops].sort((a,b)=>(a.timestamp||"").localeCompare(b.timestamp||"")).forEach(o=>{
    eq += Number(o.net)||0; peak=Math.max(peak,eq); maxDD=Math.max(maxDD, peak ? (peak-eq)/peak*100:0);
    peakSeries.push(eq);
  });
  return {net,points,wins,losses,count:ops.length,winRate:(wins+losses)?wins/(wins+losses)*100:0,maxDD};
}

function projectInitialBalance(){
  const p=state.projection||{};
  const v=Number(p.initialBalance);
  if(Number.isFinite(v)) return v;
  return Number(state.settings.initialBalance)||0;
}
function capitalMovementDelta(){
  return (state.capitalMovements||[]).reduce((sum,x)=>{
    const v=Math.abs(Number(x.amount)||0);
    return sum+(x.type==="deposit"?v:-v);
  },0);
}
function calculatedAccountBalance(){
  return Number((projectInitialBalance()+capitalMovementDelta()+
    (state.operations||[]).reduce((sum,o)=>sum+(Number(o.net)||0),0)).toFixed(2));
}
function balanceBeforeSession(sessionId){
  const sessions=[...state.sessions].filter(s=>s.status==="closed"||s.id===sessionId)
    .sort((a,b)=>(a.createdAt||"").localeCompare(b.createdAt||""));
  let bal=projectInitialBalance();
  const movements=[...(state.capitalMovements||[])].sort((a,b)=>String(a.date||"").localeCompare(String(b.date||"")));
  let mi=0;
  for(const s of sessions){
    while(mi<movements.length && String(movements[mi].date||"")<=String(s.date||"")){
      const m=movements[mi++];
      bal+=(m.type==="deposit"?1:-1)*Math.abs(Number(m.amount)||0);
    }
    if(s.id===sessionId) return Number(bal.toFixed(2));
    bal+=Number(sessionSummary(s.id).net)||0;
  }
  return Number(bal.toFixed(2));
}
function rebuildCurrentBalance(){
  state.settings.currentBalance=calculatedAccountBalance();
  state.settings.operationalBaseBalance=projectInitialBalance();
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
    dashboard:"Dashboard",session:"Sessão operacional",operations:"Operações",calculator:"Calculadora",
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
  rebuildCurrentBalance();
  const s=sessionTotals(), o=overall(), bal=Number(state.settings.currentBalance)||0;
  const profile=state.settings.defaultProfile, sug=lotSuggestion(bal,profile);
  const dashboardMgmt=state.settings.defaultOperationalManagement||"Scalping";
  const dashboardPlan=tradePlan(bal,dashboardMgmt,profile,state.settings.defaultAsset,state.settings.minDailySearchPercent??20);
  const initial=projectInitialBalance();
  const generalPct=initial?(bal-initial)/initial*100:0;
  const closed=[...state.sessions].filter(x=>x.status==="closed").sort((a,b)=>(a.createdAt||"").localeCompare(b.createdAt||""));
  const days=operationalDays();
  document.getElementById("view-dashboard").innerHTML=`
    <div class="grid grid-4">
      ${cardMetric("Saldo atual",money(bal),`Inicial do projeto ${money(initial)}`)}
      ${cardMetric("Resultado hoje",money(s.net),`${num(s.points,0)} pontos`,s.net>=0?"positive":"negative")}
      ${cardMetric("Resultado acumulado",money(bal-initial),`Lucros e perdas desde o início`,(bal-initial)>=0?"positive":"negative")}
      ${cardMetric("Performance geral",pct(generalPct),"saldo atual × capital inicial",generalPct>=0?"positive":"negative")}
      ${cardMetric("Win rate",pct(o.winRate),`${o.wins} wins / ${o.losses} losses`)}
    </div>
    <div class="card section-space"><div class="card-header"><div><h2>Plano operacional do dia</h2><p>${esc(dashboardMgmt)} · ${esc(state.settings.defaultAsset)}</p></div></div><div class="stat-strip">
      <div><span class="kicker">Lote base</span><div class="v">${num(dashboardPlan.baseLot,2)}</div></div>
      <div><span class="kicker">Máx. entradas</span><div class="v">${dashboardPlan.maxEntries}</div></div>
      <div><span class="kicker">Exposição máxima</span><div class="v">${num(dashboardPlan.maxTotalLot,2)}</div></div>
      <div><span class="kicker">Espaçamento</span><div class="v">${num(dashboardPlan.entrySpacingPoints,0)} pts</div></div>
      <div><span class="kicker">Meta líquida</span><div class="v">${money(dashboardPlan.netTarget)}</div></div>
    </div></div>
    <div class="grid grid-2 section-space">
      <div class="card">
        <div class="card-header"><div><h2>Gerenciamento atual</h2><p>${esc(profile)} · ${esc(state.settings.defaultAsset)}</p></div></div>
        ${sug.warning?`<div class="callout"><strong>${esc(sug.warning)}</strong></div>`:`<div class="stat-strip">
          <div><span class="kicker">Saldo atual</span><div class="v">${money(bal)}</div></div>
          <div><span class="kicker">Meta do dia</span><div class="v">${num(state.settings.minDailySearchPercent??20,1)}%</div></div>
          <div><span class="kicker">Busca líquida</span><div class="v">${money(plan.netTarget)}</div></div>
          <div><span class="kicker">Lote sugerido</span><div class="v">${num(plan.lot,2)}</div></div>
          <div><span class="kicker">Pontos a buscar</span><div class="v">${num(plan.points,0)} pts</div></div>
        </div>
        <div class="callout section-space"><strong>Meta operacional líquida: ${money(plan.netTarget)}</strong><span class="note">Para atingir esse valor líquido, o plano considera ${money(plan.fees)} de comissão e exige aproximadamente ${num(plan.points,0)} pontos brutos no lote sugerido.</span></div>`}
      </div>
      <div class="card">
        <div class="card-header"><div><h2>Evolução operacional</h2><p>Resultado percentual por sessão e resultado geral.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Sessão</th><th>Data</th><th>Resultado</th><th>% da sessão</th></tr></thead><tbody>
        ${closed.length?closed.slice(-12).map((ss,i)=>{const t=sessionSummary(ss.id), n=operationalSessionNumber(ss.date,ss.id);return `<tr><td>${n}</td><td>${ss.date}</td><td class="${t.net>=0?'positive':'negative'}">${money(t.net)}</td><td class="${sessionPercent(ss)>=0?'positive':'negative'}">${pct(sessionPercent(ss))}</td></tr>`}).join(""):`<tr><td colspan="4"><div class="empty">Nenhuma sessão encerrada.</div></td></tr>`}
        </tbody></table></div>
        <div class="callout section-space"><strong>Saldo do projeto: ${money(initial)} + ${money(bal-initial)} = ${money(bal)}</strong><span class="note">O saldo atual é recalculado pelo saldo inicial do projeto, somando todos os resultados líquidos das operações e os depósitos/saques registrados.</span></div>
      </div>
    </div>
    <div class="card section-space">
      <div class="card-header"><div><h2>Performance</h2><p>Resumo integrado ao Dashboard.</p></div></div>
      <div class="stat-strip">
        <div><span class="kicker">Resultado acumulado</span><div class="v ${o.net>=0?'positive':'negative'}">${money(o.net)}</div></div>
        <div><span class="kicker">Drawdown máximo</span><div class="v ${o.maxDD>0?'negative':'positive'}">${pct(o.maxDD)}</div></div>
        <div><span class="kicker">Wins</span><div class="v">${o.wins}</div></div>
        <div><span class="kicker">Losses</span><div class="v">${o.losses}</div></div>
      </div>
    </div>
    <div class="card section-space">
      <div class="card-header"><div><h2>Gráfico por dia operacional</h2><p>Cada barra representa o resultado percentual consolidado daquele dia.</p></div></div>
      ${renderOperationalDayChart(days)}
    </div>`;
}
function renderOperationalDayChart(days){
  if(!days.length)return `<div class="empty">Nenhum dia operacional encerrado.</div>`;
  const max=Math.max(...days.map(d=>Math.abs(d.pct)),1);
  return `<div class="chart">${days.slice(-20).map(d=>`<div class="bar ${d.pct<0?'neg':''}" title="${d.date}: ${pct(d.pct)}" style="height:${Math.max(8,Math.abs(d.pct)/max*180)}px"><span>${d.date.slice(5)}</span></div>`).join("")}</div>`;
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
  const bal=Number(state.settings.currentBalance)||0;
  const active=state.activeSessionId?state.sessions.find(x=>x.id===state.activeSessionId):null;
  const t=active?sessionSummary(active.id):null;
  const defaultAsset=Object.keys(state.assets).length===1?Object.keys(state.assets)[0]:state.settings.defaultAsset;
  const profile=state.settings.defaultProfile;
  const opMgmt=active?.operationalManagement||state.settings.defaultOperationalManagement||"Scalping";
  const mgCfg=(state.settings.operationalManagements||{})[opMgmt]||{};
  const sessionPlan=tradePlan(active?Number(active.balanceBefore)||bal:bal,opMgmt,active?.profile||profile,active?.asset||defaultAsset,active?.searchPercent??mgCfg.searchPercent??state.settings.minDailySearchPercent??20);
  document.getElementById("view-session").innerHTML=`
    <div class="grid grid-2">
      <div class="card">
        <div class="card-header"><div><h2>${active?"Sessão operacional em andamento":"Abertura de sessão"}</h2><p>${active?"A sessão permanece em andamento até ser encerrada.":"Os dados abaixo serão armazenados somente quando a sessão for iniciada."}</p></div>${active?`<span class="pill amber">ABERTA · SESSÃO ${operationalSessionNumber(active.date,active.id)}</span>`:""}</div>
        <form id="session-form" class="form-grid">
          <div class="field"><label>Data</label><input type="date" name="date" value="${active?active.date:todayStr()}" ${active?"disabled":""} required></div>
          <div class="field"><label>Hora de início</label><input type="time" name="startTime" value="${active?active.startTime:new Date().toTimeString().slice(0,5)}" ${active?"disabled":""} required></div>
          <div class="field"><label>Ativo</label><select name="asset" ${active?"disabled":""}>${Object.values(state.assets).map(x=>`<option ${x.symbol===(active?.asset||defaultAsset)?"selected":""}>${esc(x.symbol)}</option>`).join("")}</select></div>
          <div class="field"><label>Gerenciamento operacional</label><select name="operationalManagement" ${active?"disabled":""}>${Object.keys(state.settings.operationalManagements||{}).map(x=>`<option ${x===(active?.operationalManagement||state.settings.defaultOperationalManagement||"Scalping")?"selected":""}>${esc(x)}</option>`).join("")}</select></div>
          <div class="field"><label>Perfil financeiro / lote</label><select name="profile" ${active?"disabled":""}>${Object.keys(state.settings.lotRules).map(x=>`<option ${x===(active?.profile||profile)?"selected":""}>${esc(x)}</option>`).join("")}</select></div>
          <div class="field"><label>% de busca do dia</label><input type="number" name="searchPercent" min="0" step="0.1" value="${active?active.searchPercent:(mgCfg.searchPercent??state.settings.minDailySearchPercent??20)}" ${active?"disabled":""}></div>
          <div class="field"><label>Busca do dia (US$)</label><input type="text" value="${money(bal*((active?.searchPercent??(state.settings.minDailySearchPercent??20))/100))}" readonly></div>
          <div class="field"><label>Lote base sugerido</label><input type="text" value="${num(sessionPlan.baseLot,2)}" readonly></div>
          <div class="field"><label>Máx. entradas</label><input type="text" value="${sessionPlan.maxEntries}" readonly></div>
          <div class="field"><label>Exposição máxima</label><input type="text" value="${num(sessionPlan.maxTotalLot,2)} lote" readonly></div>
          <div class="field"><label>Pontos de objetivo Take</label><input type="number" name="targetPoints" value="${active?.targetPoints??mgCfg.takePoints??state.settings.dailyTargetPoints}" ${active?"disabled":""}></div>
          <div class="field"><label>Pontos de Stop</label><input type="number" name="stopPoints" value="${active?.stopPoints??mgCfg.stopPoints??state.settings.dailyStopPoints}" ${active?"disabled":""}></div>
          <div class="field full"><label>Estratégia / Setup / Contexto inicial <span class="note">(opcional)</span></label><textarea name="context" ${active?"disabled":""}>${esc(active?.context||"")}</textarea></div>
          <div class="actions full">${active?`<button type="button" class="btn danger" data-close-session="${active.id}">Encerrar sessão</button>`:`<button class="btn primary">Iniciar sessão</button>`}</div>
        </form>
      </div>
      <div class="card">
        <div class="card-header"><div><h2>${active?"Resumo da sessão atual":"Sessões do projeto"}</h2><p>${active?"As operações entram automaticamente nesta sessão.":"Selecione uma sessão encerrada para consultar seu resultado."}</p></div></div>
        ${active?`
          <div class="stat-strip">
            <div><span class="kicker">Sessão</span><div class="v">${operationalSessionNumber(active.date,active.id)}</div></div>
            <div><span class="kicker">Gerenciamento</span><div class="v">${esc(active.operationalManagement||"Scalping")}</div></div>
            <div><span class="kicker">Operações</span><div class="v">${t.count}</div></div>
            <div><span class="kicker">Pontos</span><div class="v">${num(t.points,0)}</div></div>
            <div><span class="kicker">Resultado</span><div class="v ${t.net>=0?'positive':'negative'}">${money(t.net)}</div></div>
          </div>
          <div class="callout section-space"><strong>Plano de entradas</strong><span class="note">Meta líquida ${money(sessionPlan.netTarget)} · Lote base ${num(sessionPlan.baseLot,2)} · até ${sessionPlan.maxEntries} entradas · exposição máxima ${num(sessionPlan.maxTotalLot,2)} lote · espaçamento ${num(sessionPlan.entrySpacingPoints,0)} pts · Take ${num(active.targetPoints,0)} pts · Stop ${num(active.stopPoints,0)} pts.</span></div>
          <div class="callout section-space"><strong>Registrar operação</strong><span class="note">A operação é registrada na página Operações enquanto esta sessão estiver aberta.</span></div>
        `:`<div class="empty">Nenhuma sessão em andamento.</div>`}
      </div>
    </div>
    <div class="card section-space">
      <div class="card-header"><div><h2>Histórico de sessões</h2><p>Somente sessões encerradas entram definitivamente no histórico.</p></div></div>
      ${renderSessionsTable()}
    </div>
    <div id="session-detail-panel"></div>`;

  const form=document.getElementById("session-form");
  if(form) form.onsubmit=e=>{
    e.preventDefault();
    if(state.activeSessionId){toast("Já existe uma sessão aberta.");return;}
    const f=new FormData(form), date=f.get("date");
    const item={id:uid(),date,startTime:f.get("startTime"),endTime:"",asset:f.get("asset"),operationalManagement:f.get("operationalManagement")||"Scalping",profile:f.get("profile"),searchPercent:Number(f.get("searchPercent"))||20,targetPoints:Number(f.get("targetPoints"))||0,stopPoints:Number(f.get("stopPoints"))||0,context:f.get("context")||"",journal:"",status:"open",balanceBefore:calculatedAccountBalance(),createdAt:new Date().toISOString(),sessionNumber:state.sessions.filter(s=>s.date===date).length+1};
    state.sessions.push(item); state.activeSessionId=item.id; save(); toast(`Sessão ${item.sessionNumber} iniciada.`); render();
  };
}
function renderSessionDetail(id){
  const s=state.sessions.find(x=>x.id===id); if(!s)return "";
  const t=sessionSummary(id);
  return `<div class="card section-space"><div class="card-header"><div><h2>Sessão ${operationalSessionNumber(s.date,s.id)} · ${s.date}</h2><p>${s.startTime}${s.endTime?` → ${s.endTime}`:""} · ${esc(s.asset)}</p></div><span class="pill green">ENCERRADA</span></div>
    <div class="stat-strip"><div><span class="kicker">Operações</span><div class="v">${t.count}</div></div><div><span class="kicker">Pontos</span><div class="v">${num(t.points,0)}</div></div><div><span class="kicker">Resultado</span><div class="v ${t.net>=0?'positive':'negative'}">${money(t.net)}</div></div><div><span class="kicker">% da sessão</span><div class="v">${pct(sessionPercent(s))}</div></div></div>
    <div class="actions section-space"><button class="btn secondary" data-edit-session="${s.id}">Editar sessão</button></div>
    ${renderSessionOperations(id)}
  </div>`;
}
function renderSessionOperations(id){
  const ops=sessionOperations(id);
  if(!ops.length)return `<div class="empty section-space">Nenhuma operação registrada ainda.</div>`;
  return `<div class="table-wrap section-space"><table><thead><tr><th>Hora</th><th>Ativo</th><th>Dir.</th><th>Lote</th><th>Pontos</th><th>Líquido</th><th>Ação</th></tr></thead><tbody>${ops.map(o=>`<tr><td>${o.time||"-"}</td><td>${esc(o.asset)}</td><td>${o.direction===1?"BUY":"SELL"}</td><td>${num(o.lot,2)}</td><td>${num(o.points,0)}</td><td class="${o.net>=0?'positive':'negative'}">${money(o.net)}</td><td><button class="btn secondary" data-edit-op="${o.id}">Editar</button></td></tr>`).join("")}</tbody></table></div>`;
}


function ensureProjectionState(){
  if(!state.projection) state.projection={
    name:"Projeto principal",initialBalance:60,target:1000,dailyPercent:30,
    projectionPercent:30,activeProfile:state.settings.defaultProfile,asset:state.settings.defaultAsset,
    secondaryCount:5,secondaryTargets:[],stageIndex:0,stageDeadlines:[]
  };
  const p=state.projection;
  if(p.secondaryCount===undefined)p.secondaryCount=5;
  if(!p.projectionPercent)p.projectionPercent=p.dailyPercent||30;
  if(!Array.isArray(p.secondaryTargets))p.secondaryTargets=[];
  p.secondaryTargets=milestoneTargets(p.initialBalance,p.target,p.secondaryCount).map(x=>x.to);
  if(!Array.isArray(p.stageDeadlines))p.stageDeadlines=[];
  if(p.stageIndex===undefined)p.stageIndex=0;
  if(!p.projectionRowOverrides||typeof p.projectionRowOverrides!=="object")p.projectionRowOverrides={};
  return p;
}
function projectionSession(p,profile,balance){
  const percent=Number(p.projectionPercent||p.dailyPercent)||30;
  const dailyTarget=Number(balance||0)*percent/100;
  const lot=calcLot(balance,profile||p.activeProfile);
  const a=state.assets[p.asset]||asset();
  const fees=commission(lot,a);
  const grossRequired=dailyTarget+fees;
  const points=lot>0 ? moneyToPoints(grossRequired,lot,a) : 0;
  return {dailyTarget,net:dailyTarget,lot,fees,grossRequired,points};
}
function milestoneTargets(initial,target,count=5,customTargets=[]){
  initial=Number(initial)||0; target=Number(target)||0;
  count=Math.max(1,Math.floor(Number(count)||5));
  if(target<=initial)return [];
  // Secondary goals are generated automatically by proportional capital growth.
  // The geometric progression keeps the percentage jump between levels balanced,
  // rather than producing increasingly difficult equal-dollar jumps.
  const out=[]; let from=initial;
  const ratio=Math.pow(target/initial,1/count);
  for(let i=0;i<count;i++){
    let to=(i===count-1)?target:initial*Math.pow(ratio,i+1);
    to=Number(to.toFixed(2));
    if(to<=from)to=Number((from+(target-from)/(count-i)).toFixed(2));
    if(to>target)to=target;
    out.push({from,to});
    from=to;
  }
  return out;
}
function currentProjectionStage(p,real){
  const stages=milestoneTargets(p.initialBalance,p.target,p.secondaryCount,p.secondaryTargets);
  if(!stages.length)return null;
  let idx=Math.max(0,Math.min(Number(p.stageIndex)||0,stages.length-1));
  while(idx<stages.length-1 && real>=stages[idx].to)idx++;
  if(real>=stages[stages.length-1].to)return null;
  return {...stages[idx],index:idx};
}
function projectionStages(p){
  return milestoneTargets(p.initialBalance,p.target,p.secondaryCount,p.secondaryTargets);
}
function operationalSessionNumber(date,id){
  const same=state.sessions.filter(s=>s.date===date).sort((a,b)=>(a.createdAt||"").localeCompare(b.createdAt||""));
  const idx=same.findIndex(s=>s.id===id);
  return idx>=0?idx+1:same.length+1;
}
function sessionPercent(s){
  const base=Number(s.balanceBefore)||0;
  const t=sessionSummary(s.id);
  return base?t.net/base*100:0;
}
function operationalDays(){
  const days={};
  state.sessions.filter(s=>s.status==="closed").forEach(s=>{
    const t=sessionSummary(s.id);
    if(!days[s.date])days[s.date]={date:s.date,net:0,base:Number(s.balanceBefore)||0,sessions:0};
    days[s.date].net+=t.net; days[s.date].sessions++;
  });
  return Object.values(days).sort((a,b)=>a.date.localeCompare(b.date)).map(d=>({...d,pct:d.base?d.net/d.base*100:0}));
}
function projectSessionRows(p,real,target){
  const closed=state.sessions.filter(s=>s.status==="closed")
    .sort((a,b)=>(a.createdAt||"").localeCompare(b.createdAt||""));
  const rows=[];
  let runningBalance=projectInitialBalance();
  let i=0;
  const maxRows=Math.min(500,Math.max(closed.length+10,20));

  while(runningBalance<target && i<maxRows){
    const actual=closed[i]||null;
    // Every real session starts from the cumulative balance produced by:
    // project initial + capital movements + every previous win/loss.
    const before=actual?balanceBeforeSession(actual.id):runningBalance;
    const plannedPercent=Number(p.projectionPercent||p.dailyPercent)||30;
    const searchMoney=before*plannedPercent/100;
    const lot=calcLot(before,p.activeProfile);
    const a=state.assets[actual?.asset||p.asset]||asset();
    const fees=commission(lot,a);
    const grossRequired=searchMoney+fees;
    const points=lot>0?moneyToPoints(grossRequired,lot,a):0;
    const stopPoints=Number(actual?.stopPoints??state.settings.dailyStopPoints)||0;
    const stopMoney=lot>0?pointsToMoney(stopPoints,lot,a):0;
    const winBalance=Math.min(target,before+searchMoney);
    const lossBalance=Math.max(0,before-stopMoney);
    const actualNet=actual?sessionSummary(actual.id).net:null;
    const actualAfter=actual?Number((before+actualNet).toFixed(2)):null;
    const realPct=actual&&before?actualNet/before*100:null;

    let status=actual?"CONCLUÍDA":(i===closed.length?"PRÓXIMA":"PROJETADA");
    if(p.projectionRowOverrides[String(i)]==="ADVANCED")status="AVANÇADA";

    rows.push({
      n:i+1,before,percent:plannedPercent,realPct,goal:searchMoney,real:actualNet,
      lot,points,fees,grossRequired,winBalance,lossBalance,actualAfter,status,sessionId:actual?.id||null
    });

    runningBalance=actual?actualAfter:winBalance;
    if(runningBalance>=target)break;
    i++;
  }
  return rows;
}

function renderProjection(){
  rebuildCurrentBalance();
  const p=ensureProjectionState();
  const real=Number(state.settings.currentBalance)||0;
  const initial=Number(p.initialBalance)||0,target=Number(p.target)||0;
  const stages=projectionStages(p);
  const stage=currentProjectionStage(p,real);
  const stageTarget=stage?stage.to:target;
  const remaining=projectSessionsToTarget(p,p.activeProfile,real,stageTarget);
  const rows=projectSessionRows(p,real,target);
  const projectionPct=Number(p.projectionPercent||p.dailyPercent)||30;
  const nextStageIndex=stage?stage.index+1:null;

  document.getElementById("view-projection").innerHTML=`
    <div class="grid grid-4">
      ${cardMetric("Meta principal",money(target),"objetivo final")}
      ${cardMetric("Saldo inicial",money(initial),"início do projeto")}
      ${cardMetric("Saldo atual",money(real),real>=target?"META CONCLUÍDA":stage?`etapa ${stage.index+1} · até ${money(stageTarget)}`:"")}
      ${cardMetric("Busca projetada",num(projectionPct,1)+"%",`US$ ${money(real*projectionPct/100)}`)}
    </div>

    <div class="card section-space">
      <div class="card-header"><div><h2>Parâmetros da projeção</h2><p>A projeção operacional é recalculada depois que você define a busca diária e o perfil de lote.</p></div></div>
      <form id="projection-controls" class="form-grid four">
        <div class="field"><label>Busca diária para projeção (%)</label><input name="projectionPercent" type="number" min="0.1" step="0.1" value="${projectionPct}" required></div>
        <div class="field"><label>Perfil / lote operacional</label><select name="profile">${Object.keys(state.settings.lotRules).map(x=>`<option ${x===p.activeProfile?'selected':''}>${esc(x)}</option>`).join("")}</select></div>
        <div class="field"><label>Ativo da projeção</label><select name="asset">${Object.values(state.assets).map(a=>`<option ${a.symbol===p.asset?'selected':''}>${esc(a.symbol)}</option>`).join("")}</select></div>
        <div class="field"><label>Metas secundárias automáticas</label><input type="text" value="${p.secondaryCount} níveis proporcionais" readonly></div>
        <div class="actions full"><button class="btn primary">Atualizar projeção</button></div>
      </form>
    </div>

    <div class="card section-space">
      <div class="card-header"><div><h2>Metas secundárias automáticas</h2><p>Os níveis são calculados proporcionalmente entre o saldo inicial e a meta principal. Não é necessário informar valores manualmente.</p></div><span class="pill green">${stages.length} etapas</span></div>
      ${stages.length?`<div class="table-wrap"><table><thead><tr><th>Etapa</th><th>De</th><th>Objetivo US$</th><th>Crescimento</th><th>Busca %</th><th>Lote ref.</th><th>Pontos ref.</th><th>Sessões estimadas</th><th>Status</th></tr></thead><tbody>
      ${stages.map((m,i)=>{
        const x=projectionSession(p,p.activeProfile,m.from);
        const estimated=projectSessionsToTarget(p,p.activeProfile,m.from,m.to);
        const deadline=p.stageDeadlines[i]??(estimated===null?0:estimated);
        const done=real>=m.to;
        const current=stage&&stage.index===i;
        const manualAdvanced=i<(Number(p.stageIndex)||0);
        const status=done?"CONCLUÍDA":manualAdvanced?"AVANÇADA":current?"ATUAL":"PRÓXIMA";
        return `<tr>
          <td>${i+1}</td><td>${money(m.from)}</td><td><strong>${money(m.to)}</strong></td>
          <td>${num(m.from?((m.to-m.from)/m.from*100):0,1)}%</td><td>${num(projectionPct,1)}%</td><td>${num(x.lot,2)}</td><td>${num(x.points,0)}</td>
          <td>${estimated===null?"—":estimated}</td>
          <td><span class="pill ${status==="CONCLUÍDA"||status==="AVANÇADA"?"green":current?"amber":""}">${status}</span></td>
          <td>${current&&i<stages.length-1?`<button class="btn primary" data-advance-stage="${i}">Avançar etapa</button>`:"—"}</td>
        </tr>`;
      }).join("")}</tbody></table></div>`:`<div class="empty">Defina uma meta principal maior que o saldo inicial.</div>`}
    </div>

    <div class="card section-space">
      <div class="card-header"><div><h2>Projeção operacional até a meta principal</h2><p>O trajeto é recalculado a cada sessão real. A busca em US$ é líquida; os pontos necessários incluem a comissão configurada do ativo.</p></div></div>
      <div class="table-wrap"><table><thead><tr>
        <th>Sessão</th><th>Saldo inicial do dia</th><th>% Busca</th><th>% Real</th><th>$ Busca</th><th>$ Real</th>
        <th>Saldo se Win</th><th>Saldo se Loss</th><th>Saldo real</th><th>Status</th>
      </tr></thead><tbody>
      ${rows.map(r=>{
        const actual=r.real!==null;
        const isWin=actual&&r.real>0, isLoss=actual&&r.real<0;
        const winCell=actual?(isWin?money(r.actualAfter):"—"):money(r.winBalance);
        const lossCell=actual?(isLoss?money(r.actualAfter):"—"):money(r.lossBalance);
        return `<tr>
        <td>${r.n}</td>
        <td>${money(r.before)}</td>
        <td>${num(r.percent,1)}%</td>
        <td class="${r.realPct===null?'':r.realPct>=0?'positive':'negative'}">${r.realPct===null?'—':pct(r.realPct)}</td>
        <td>${money(r.goal)}</td>
        <td class="${r.real===null?'':r.real>=0?'positive':'negative'}">${r.real===null?'—':money(r.real)}</td>
        <td>${winCell}</td>
        <td>${lossCell}</td>
        <td class="${r.actualAfter===null?'':r.actualAfter>=r.before?'positive':'negative'}">${r.actualAfter===null?'—':money(r.actualAfter)}</td>
        <td><span class="pill ${r.status==="CONCLUÍDA"||r.status==="AVANÇADA"?"green":r.status==="PRÓXIMA"?"amber":""}">${r.status}</span>
        ${r.status!=="CONCLUÍDA"&&r.status!=="AVANÇADA"?`<button class="btn secondary" data-advance-projection-row="${r.n-1}">Avançar</button>`:""}</td>
      </tr>`;
      }).join("")}
      </tbody></table></div>
    </div>

    <div class="callout section-space"><strong>Etapa atual</strong><span class="note">${stage?`Etapa ${stage.index+1}: ${money(stage.from)} → ${money(stage.to)} · aproximadamente ${remaining===null?"—":remaining+" sessões"} restantes.`:"A meta principal foi alcançada ou não há etapa ativa."}</span></div>

    <div class="callout section-space"><strong>Edição administrativa</strong><span class="note">Meta principal, saldo inicial e demais parâmetros estruturais continuam em Configurações → Projeto.</span></div>`;

  const form=document.getElementById("projection-controls");
  if(form)form.onsubmit=e=>{
    e.preventDefault();const d=new FormData(form);
    const count=5;
    p.projectionPercent=Math.max(0.1,Number(d.get("projectionPercent"))||30);
    p.dailyPercent=p.projectionPercent;
    p.activeProfile=d.get("profile");p.asset=d.get("asset");p.secondaryCount=count;
    if(p.stageIndex>=count)p.stageIndex=count-1;
    // Always regenerate the secondary goals from the current project parameters.
    p.secondaryTargets=milestoneTargets(p.initialBalance,p.target,count).map(x=>x.to);
    save();toast("Projeção recalculada.");render();
  };
}
function renderProjectionRows(p,real,target,closed){
  return projectSessionRows(p,real,target).map(r=>`<tr><td>${r.n}</td><td>${money(r.before)}</td><td>${num(r.percent,1)}%</td><td>${money(r.goal)}</td><td>${money(r.projectedAfter)}</td><td>${r.status}</td></tr>`).join("");
}
function projectSessionsToTarget(p,profile,start,target){
  if(target<=start)return 0;
  let bal=Number(start)||0,count=0;
  while(bal<target&&count<5000){
    const x=projectionSession(p,profile,bal);
    if(x.net<=0)return null;
    bal+=x.net;count++;
  }
  return count>=5000?null:count;
}
function plannedSessionsToStageForProfile(p,profile,start,target){ const x=projectSessionsToTarget(p,profile,start,target); return x===null?'—':x; }
function renderProjectionMilestones(p,real){
  const stages=milestoneTargets(Number(p.initialBalance)||0,Number(p.target)||0,p.milestones);
  if(!stages.length) return '<div class="empty">Defina uma meta maior que o saldo inicial.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Nível</th><th>De</th><th>Até</th><th>Saldo atual</th><th>Status</th></tr></thead><tbody>${stages.map((m,i)=>{const done=real>=m.to, current=real>=m.from&&!done; return `<tr><td>${i+1}</td><td>${money(m.from)}</td><td>${money(m.to)}</td><td>${money(Math.min(real,m.to))}</td><td><span class="pill ${done?'green':current?'amber':''}">${done?'CONCLUÍDO':current?'ATUAL':'PRÓXIMO'}</span></td></tr>`}).join('')}</tbody></table></div>`;
}

function renderJournal(){
  const notes=Array.isArray(state.journalEntries)?state.journalEntries:[];
  const sessions=state.sessions.filter(s=>s.status==="closed");
  document.getElementById("view-journal").innerHTML=`
    <div class="grid grid-2">
      <div class="card"><div class="card-header"><div><h2>Diário operacional</h2><p>Registro livre e opcional de situações ocorridas em qualquer dia.</p></div></div>
        <form id="journal-free-form" class="form-grid">
          <div class="field"><label>Data</label><input type="date" name="date" value="${todayStr()}"></div>
          <div class="field full"><label>Registro livre</label><textarea name="text" placeholder="Ex.: contexto do mercado, decisão tomada, oportunidade perdida, erro, aprendizado..."></textarea></div>
          <div class="actions full"><button class="btn primary">Salvar registro</button></div>
        </form>
      </div>
      <div class="card"><div class="card-header"><div><h2>Registros do diário</h2><p>Independentes das sessões.</p></div></div>
        ${notes.length?notes.map(n=>`<article class="card flat" style="border:1px solid var(--line);margin-bottom:10px"><div class="card-header"><strong>${n.date}</strong><button class="btn secondary" data-edit-note="${n.id}">Editar</button></div><p class="note">${esc(n.text)}</p></article>`).join(""):`<div class="empty">Nenhum registro.</div>`}
      </div>
    </div>
    <div class="card section-space"><div class="card-header"><div><h2>Resumo das sessões encerradas</h2><p>Consulta rápida do resultado operacional.</p></div></div>${sessions.length?renderSessionsTable():`<div class="empty">Nenhuma sessão encerrada.</div>`}</div>`;
  const f=document.getElementById("journal-free-form");
  if(f)f.onsubmit=e=>{e.preventDefault();const d=new FormData(f),txt=(d.get("text")||"").trim();if(!txt)return;state.journalEntries=notes;state.journalEntries.unshift({id:uid(),date:d.get("date"),text:txt});save();toast("Registro salvo.");render();};
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
    ["geral","⚙️","Geral","Gerenciamento e parâmetros"],
    ["gerenciamentos","🎯","Gerenciamentos","Scalping, reversão e tendência"],
    ["projeto","📌","Projeto","Meta principal e etapas"],
    ["lotes","📊","Perfis de lote","Escalas de gerenciamento"],
    ["capital","💵","Capital","Depósitos e saques"],
    ["ativos","📈","Ativos","Instrumentos operacionais"]
  ];

  document.getElementById("view-settings").innerHTML=`
    <div class="card">
      <div class="card-header">
        <div><h2>Configurações</h2><p>Todos os parâmetros administrativos e de gerenciamento da Nexora ficam centralizados aqui.</p></div>
      </div>
      <div class="tabs">
        ${tabs.map(([id,icon,label,desc])=>`<button class="tab-btn ${tab===id?"active":""}" data-settings-tab="${id}"><span class="tab-icon">${icon}</span><span class="tab-copy"><strong>${label}</strong><small>${desc}</small></span></button>`).join("")}
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

  if(tab==="gerenciamentos"){
    const mg=state.settings.operationalManagements||{};
    return `
      <div class="card">
        <div class="card-header">
          <div><h2>Gerenciamentos operacionais</h2><p>Escolha o tipo de condução da sessão. Estes parâmetros são independentes do perfil financeiro de lote.</p></div>
          <span class="pill blue">3 modalidades</span>
        </div>
        <div class="grid grid-3">
          ${Object.entries(mg).map(([name,c])=>`
            <div class="card nested-card">
              <div class="card-header"><div><h3>${esc(name)}</h3><p>${name==="Scalping"?"Movimentos curtos e objetivos rápidos.":name==="Reversão"?"Operações baseadas em possível mudança de direção.":"Aproveitamento de continuidade do movimento direcional."}</p></div></div>
              <form class="management-form" data-management="${esc(name)}">
                <div class="field"><label>Busca diária (%)</label><input name="searchPercent" type="number" min="0.1" step="0.1" value="${c.searchPercent}"></div>
                <div class="field"><label>Pontos mínimos</label><input name="minPoints" type="number" min="0" value="${c.minPoints}"></div>
                <div class="field"><label>Pontos máximos</label><input name="maxPoints" type="number" min="0" value="${c.maxPoints}"></div>
                <div class="field"><label>Take padrão (pts)</label><input name="takePoints" type="number" min="0" value="${c.takePoints}"></div>
                <div class="field"><label>Stop padrão (pts)</label><input name="stopPoints" type="number" min="0" value="${c.stopPoints}"></div>
                <div class="field"><label>Máx. operações</label><input name="maxOperations" type="number" min="1" value="${c.maxOperations}"></div>
                <div class="field"><label>Máx. entradas por operação</label><input name="maxEntries" type="number" min="1" value="${c.maxEntries||1}"></div>
                <div class="field"><label>Espaçamento entre entradas (pts)</label><input name="entrySpacingPoints" type="number" min="0" value="${c.entrySpacingPoints||0}"></div>
                <div class="field"><label>Modelo de lote</label><select name="lotModel"><option value="financial_profile" ${(c.lotModel||"financial_profile")==="financial_profile"?"selected":""}>Perfil financeiro</option><option value="per_capital" ${c.lotModel==="per_capital"?"selected":""}>Lote por capital</option></select></div>
                <div class="field"><label>Capital por lote-base (US$)</label><input name="capitalStep" type="number" min="1" step="1" value="${c.capitalStep||100}"></div>
                <div class="field"><label>Incremento de lote-base</label><input name="lotStep" type="number" min="0.01" step="0.01" value="${c.lotStep||0.01}"></div>
                <div class="field"><label>Risco / Retorno</label><input name="riskReward" type="number" min="0.1" step="0.1" value="${c.riskReward}"></div>
                <div class="field"><label>Perda máxima diária (%)</label><input name="maxDailyLossPercent" type="number" min="0" step="0.1" value="${c.maxDailyLossPercent}"></div>
                <div class="field"><label>Ativo permitido</label><select name="asset">${Object.keys(state.assets).map(a=>`<option>${esc(a)}</option>`).join("")}</select></div>
                <div class="callout full"><strong>Plano de entradas</strong><span class="note">O Nexora trata entradas múltiplas como uma única ideia operacional, acumulando exposição e respeitando o limite configurado.</span></div>
                <div class="actions full"><button class="btn primary">Salvar ${esc(name)}</button></div>
              </form>
            </div>`).join("")}
        </div>
      </div>`;
  }

  if(tab==="gerenciamentos"){
    document.querySelectorAll(".management-form").forEach(form=>{
      form.onsubmit=e=>{
        e.preventDefault();
        const name=form.dataset.management, d=new FormData(form);
        state.settings.operationalManagements[name]={
          ...state.settings.operationalManagements[name],
          searchPercent:Math.max(0.1,Number(d.get("searchPercent"))||20),
          minPoints:Math.max(0,Number(d.get("minPoints"))||0),
          maxPoints:Math.max(0,Number(d.get("maxPoints"))||0),
          takePoints:Math.max(0,Number(d.get("takePoints"))||0),
          stopPoints:Math.max(0,Number(d.get("stopPoints"))||0),
          maxOperations:Math.max(1,Number(d.get("maxOperations"))||1),
          riskReward:Math.max(0.1,Number(d.get("riskReward"))||1),
          maxDailyLossPercent:Math.max(0,Number(d.get("maxDailyLossPercent"))||0),
          maxEntries:Math.max(1,Math.floor(Number(d.get("maxEntries"))||1)),
          entrySpacingPoints:Math.max(0,Number(d.get("entrySpacingPoints"))||0),
          lotModel:d.get("lotModel")||"financial_profile",
          capitalStep:Math.max(1,Number(d.get("capitalStep"))||100),
          lotStep:Math.max(0.01,Number(d.get("lotStep"))||0.01)
        };
        save();toast(`${name} atualizado.`);render();
      };
    });
  }

  if(tab==="projeto"){
    const p=ensureProjectionState();
    return `
      <div class="grid grid-2">
        <div class="card">
          <div class="card-header"><div><h2>Projeto atual</h2><p>Todos os dados de metas usados pela Projeção & Objetivos.</p></div><span class="pill green">${esc(p.status||"active")}</span></div>
          <form id="settings-project-form" class="form-grid">
            <div class="field full"><label>Nome do projeto</label><input name="name" value="${esc(p.name)}"></div>
            <div class="field"><label>Saldo inicial do projeto (US$)</label><input name="initial" type="number" step="0.01" value="${p.initialBalance}"></div>
            <div class="field"><label>Meta principal (US$)</label><input name="target" type="number" step="0.01" value="${p.target}"></div>
            <div class="field"><label>Busca padrão da projeção (%)</label><input name="dailyPercent" type="number" min="0.1" step="0.1" value="${p.projectionPercent||p.dailyPercent}"></div>
            <div class="field"><label>Metas secundárias</label><input name="secondaryCount" type="number" min="1" max="50" value="${p.secondaryCount}"></div>
            <div class="field"><label>Perfil do projeto</label><select name="profile">${Object.keys(state.settings.lotRules).map(x=>`<option ${x===p.activeProfile?'selected':''}>${esc(x)}</option>`).join("")}</select></div>
            <div class="field"><label>Ativo principal</label><select name="asset">${Object.values(state.assets).map(a=>`<option ${a.symbol===p.asset?'selected':''}>${esc(a.symbol)}</option>`).join("")}</select></div>
            <div class="actions full"><button class="btn primary" type="submit">Salvar projeto</button></div>
          </form>
        </div>
        <div class="card">
          <div class="card-header"><div><h2>Ciclo do projeto</h2><p>Controle administrativo do projeto atual.</p></div></div>
          <div class="stat-strip">
            <div><span class="kicker">Inicial</span><div class="v">${money(p.initialBalance)}</div></div>
            <div><span class="kicker">Meta principal</span><div class="v">${money(p.target)}</div></div>
            <div><span class="kicker">Saldo atual</span><div class="v">${money(state.settings.currentBalance)}</div></div>
            <div><span class="kicker">Sessões encerradas</span><div class="v">${state.sessions.filter(s=>s.status==="closed").length}</div></div>
          </div>
          <div class="callout section-space"><strong>Novo projeto</strong><span class="note">Cria um novo ciclo de acompanhamento. O projeto anterior deve ser exportado antes, se quiser manter um backup externo.</span></div>
          <div class="actions"><button class="btn primary" id="new-project-project">Criar novo projeto</button><button class="btn danger" id="delete-project-project">Excluir projeto atual</button></div>
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
        <div class="callout"><strong>Escala desde US$10</strong><span class="note">A tabela agora começa em US$10 e o lote sugerido passa a acompanhar também saldos pequenos.</span></div>
        <div class="table-wrap section-space"><table><thead><tr><th>Capital (US$)</th><th>Lote sugerido</th><th>Ação</th></tr></thead><tbody>
          ${rules.map((r,i)=>`<tr><td><input class="inline-edit lot-balance" data-i="${i}" type="number" step="25" value="${r.balance}"></td><td><input class="inline-edit lot-value" data-i="${i}" type="number" min="0.01" step="0.01" value="${r.lot.toFixed(2)}"></td><td><button class="btn secondary" data-save-lot-row="${i}">Salvar</button></td></tr>`).join("")}
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
    const np=document.getElementById("new-project");
    if(np)np.onclick=()=>{
      if(!confirm("Criar um novo projeto? O projeto atual será substituído por uma nova estrutura sem apagar o backup/exportação existente."))return;
      const initial=Number(prompt("Saldo inicial do novo projeto (US$):","60"))||60;
      const target=Number(prompt("Meta principal do novo projeto (US$):","1000"))||1000;
      state.projection={name:"Novo projeto",initialBalance:initial,target,dailyPercent:Number(state.settings.minDailySearchPercent??20),secondaryCount:5,activeProfile:state.settings.defaultProfile,asset:state.settings.defaultAsset,mode:"compound",status:"active",startedAt:todayStr(),completedAt:""};
      state.sessions=[];state.operations=[];state.journalEntries=[];state.activeSessionId=null;state.capitalMovements=[];
      state.settings.currentBalance=initial;state.settings.operationalBaseBalance=initial;
      save();toast("Novo projeto criado.");render();
    };
    const dp=document.getElementById("delete-project");
    if(dp)dp.onclick=()=>{
      if(!confirm("Excluir definitivamente o projeto atual e seus registros locais?"))return;
      state=structuredClone(defaultState);normalizeLotRules();save();toast("Projeto excluído.");render();
    };
  }
  if(tab==="projeto"){
    const f=document.getElementById("settings-project-form");
    if(f)f.onsubmit=e=>{
      e.preventDefault();
      const d=new FormData(f), p=ensureProjectionState();
      const count=Math.max(1,Math.min(50,Number(d.get("secondaryCount"))||5));
      const target=Math.max(0,Number(d.get("target"))||0);
      const initial=Math.max(0,Number(d.get("initial"))||0);
      state.projection={
        ...p,
        name:(d.get("name")||"Projeto principal").trim(),
        initialBalance:initial,
        target,
        dailyPercent:Math.max(0.1,Number(d.get("dailyPercent"))||30),
        projectionPercent:Math.max(0.1,Number(d.get("dailyPercent"))||30),
        secondaryCount:count,
        activeProfile:d.get("profile"),
        asset:d.get("asset"),
        secondaryTargets:milestoneTargets(initial,target,count,p.secondaryTargets).map(x=>x.to),
        stageDeadlines:Array.from({length:count},(_,i)=>p.stageDeadlines?.[i]||0),
        stageIndex:Math.min(Number(p.stageIndex)||0,count-1),
        projectionRowOverrides:p.projectionRowOverrides||{}
      };
      // The project opening balance is also the account balance when creating/resetting its project base.
      if(!state.operations.length && !state.capitalMovements.length)state.settings.currentBalance=initial;
      state.settings.operationalBaseBalance=initial;
      rebuildCurrentBalance();
      save();toast("Projeto salvo com sucesso.");render();
    };

    const np=document.getElementById("new-project-project");
    if(np)np.onclick=()=>{
      const initial=Number(prompt("Saldo inicial do novo projeto (US$):","60"));
      if(!Number.isFinite(initial)||initial<0)return;
      const target=Number(prompt("Meta principal do novo projeto (US$):","1000"));
      if(!Number.isFinite(target)||target<=initial){toast("A meta principal deve ser maior que o saldo inicial.");return;}
      const profile=state.settings.defaultProfile||"Moderado 1";
      const assetKey=state.settings.defaultAsset||Object.keys(state.assets)[0];
      state.projection={
        name:"Novo projeto",initialBalance:initial,target,
        dailyPercent:Number(state.settings.minDailySearchPercent??20)||20,
        projectionPercent:Number(state.settings.minDailySearchPercent??20)||20,
        secondaryCount:5,secondaryTargets:[],stageDeadlines:[],stageIndex:0,
        activeProfile:profile,asset:assetKey,mode:"compound",status:"active",
        startedAt:todayStr(),completedAt:"",projectionRowOverrides:{}
      };
      state.sessions=[];state.operations=[];state.journalEntries=[];state.activeSessionId=null;state.capitalMovements=[];
      state.settings.currentBalance=initial;state.settings.operationalBaseBalance=initial;
      save();toast("Novo projeto criado.");render();
    };

    const dp=document.getElementById("delete-project-project");
    if(dp)dp.onclick=()=>{
      if(!confirm("Excluir o projeto atual e TODOS os registros operacionais deste projeto? Esta ação é local e não pode ser desfeita sem backup."))return;
      state.projection={
        name:"Projeto principal",initialBalance:0,target:0,dailyPercent:20,projectionPercent:20,
        secondaryCount:5,secondaryTargets:[],stageDeadlines:[],stageIndex:0,
        activeProfile:state.settings.defaultProfile||"Moderado 1",
        asset:state.settings.defaultAsset||Object.keys(state.assets)[0],
        mode:"compound",status:"active",projectionRowOverrides:{}
      };
      state.sessions=[];state.operations=[];state.journalEntries=[];state.activeSessionId=null;state.capitalMovements=[];
      state.settings.currentBalance=0;state.settings.operationalBaseBalance=0;
      save();toast("Projeto atual excluído.");render();
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
  const detail=e.target.closest("[data-session-detail]");
  if(detail){
    const panel=document.getElementById("session-detail-panel");
    if(panel)panel.innerHTML=renderSessionDetail(detail.dataset.sessionDetail);
    return;
  }

  const close=e.target.closest("[data-close-session]");
  if(close){
    const sess=state.sessions.find(x=>x.id===close.dataset.closeSession); if(!sess)return;
    if(sess.status==="open"){
      const t=sessionSummary(sess.id);
      sess.status="closed"; sess.endTime=new Date().toTimeString().slice(0,5);
      rebuildCurrentBalance();
      sess.balanceAfter=Number(state.settings.currentBalance)||0;
      sess.summary={count:t.count,exposure:t.exposure,points:t.points,net:t.net,gross:t.gross,commission:t.commission,wins:t.wins,losses:t.losses};
      const px=projectionSession(ensureProjectionState(),sess.profile,sess.balanceBefore);
      sess.projection={balanceBefore:sess.balanceBefore,plannedPercent:sess.searchPercent,plannedMoney:px.dailyTarget,plannedLot:px.lot,plannedPoints:px.points,realNet:t.net,balanceAfter:sess.balanceAfter};
      if(state.activeSessionId===sess.id)state.activeSessionId=null;
      save();toast("Sessão encerrada e enviada ao histórico.");render();
    }
    return;
  }

  const editS=e.target.closest("[data-edit-session]");
  if(editS){
    const sess=state.sessions.find(x=>x.id===editS.dataset.editSession); if(!sess)return;
    const options=["Data","Hora de início","Ativo","Perfil de gerenciamento","% de busca do dia","Pontos de objetivo Take","Pontos de Stop","Estratégia/Setup/Contexto"];
    const choice=prompt("O que deseja editar?\n\n"+options.map((x,i)=>`${i+1}. ${x}`).join("\n"),"1");
    const i=Number(choice)-1;if(i<0||i>=options.length)return;
    const fields=["date","startTime","asset","profile","searchPercent","targetPoints","stopPoints","context"];
    const field=fields[i];
    const labels=["Data","Hora de início","Ativo","Perfil de gerenciamento","% de busca do dia","Pontos de objetivo Take","Pontos de Stop","Estratégia / Setup / Contexto"];
    const value=prompt(labels[i]+":",String(sess[field]??"")); if(value===null)return;
    if(field==="searchPercent"||field==="targetPoints"||field==="stopPoints")sess[field]=Number(value)||0;else sess[field]=value;
    save();toast("Sessão atualizada.");render();
    return;
  }

  const editO=e.target.closest("[data-edit-op]");
  if(editO){
    const o=state.operations.find(x=>x.id===editO.dataset.editOp); if(!o)return;
    const choices=["Data","Horário","Ativo","Direção","Quantidade de lotes","Pontos (+ / −)","Resultado líquido","Comissão","Observação"];
    const choice=prompt("O que deseja editar?\n\n"+choices.map((x,i)=>`${i+1}. ${x}`).join("\n"),"1");
    const i=Number(choice)-1;if(i<0||i>=choices.length)return;
    const fields=["date","time","asset","direction","lot","points","net","commission","note"];
    const field=fields[i];
    const value=prompt(choices[i]+":",String(o[field]??""));if(value===null)return;
    if(["direction","lot","points","net","commission"].includes(field)){
      if((field==="lot"||field==="points") && String(value).trim()==="") o[field]=null;
      else o[field]=Number(value)||0;
    }else o[field]=value;
    const aa=state.assets[o.asset]||asset();
    o.gross=pointsToMoney(Number(o.points)||0,Number(o.lot)||0,aa);o.executionCost=o.gross-(Number(o.net)||0);
    rebuildCurrentBalance();
    state.sessions.forEach(ss=>{const t=sessionSummary(ss.id);if(ss.status==="closed"){ss.summary={count:t.count,exposure:t.exposure,points:t.points,net:t.net,gross:t.gross,commission:t.commission,wins:t.wins,losses:t.losses};ss.balanceAfter=Number((ss.balanceBefore+t.net).toFixed(2));}});
    save();toast("Operação atualizada.");render();
    return;
  }

  const advanceRow=e.target.closest("[data-advance-projection-row]");
  if(advanceRow){
    const p=ensureProjectionState(),idx=Number(advanceRow.dataset.advanceProjectionRow);
    if(!p.projectionRowOverrides||typeof p.projectionRowOverrides!=="object")p.projectionRowOverrides={};
    p.projectionRowOverrides[String(idx)]="ADVANCED";
    save();toast(`Sessão projetada ${idx+1} avançada manualmente.`);render();
    return;
  }

  const editStage=e.target.closest("[data-edit-stage]");
  if(editStage){
    const p=ensureProjectionState(), idx=Number(editStage.dataset.editStage);
    const stages=projectionStages(p), m=stages[idx];
    if(!m)return;
    const target=prompt(`Meta da etapa ${idx+1} (US$):`,String(m.to.toFixed(2)));
    if(target===null)return;
    const val=Number(target);
    if(!(val>m.from && val<=Number(p.target))){
      toast("O objetivo deve ser maior que a etapa anterior e não ultrapassar a meta principal.");return;
    }
    if(!Array.isArray(p.secondaryTargets))p.secondaryTargets=[];
    p.secondaryTargets[idx]=val;
    // Rebuild following targets so the chain remains mathematically ordered.
    const rebuilt=milestoneTargets(p.initialBalance,p.target,p.secondaryCount,p.secondaryTargets);
    p.secondaryTargets=rebuilt.map(x=>x.to);
    const current=projectSessionsToTarget(p,p.activeProfile,m.from,val);
    const deadline=prompt(`Período previsto para a etapa ${idx+1} (sessões):`,String(p.stageDeadlines[idx]??(current===null?0:current)));
    if(deadline!==null)p.stageDeadlines[idx]=Math.max(1,Math.floor(Number(deadline)||1));
    save();toast("Meta secundária atualizada.");render();
    return;
  }

  const advance=e.target.closest("[data-advance-stage]");
  if(advance){
    const p=ensureProjectionState(),idx=Number(advance.dataset.advanceStage);
    const stages=projectionStages(p);
    if(idx<0||idx>=stages.length-1)return;
    p.stageIndex=Math.min(stages.length-1,idx+1);
    save();toast(`Etapa ${p.stageIndex+1} definida como atual manualmente.`);render();
    return;
  }

  const editNote=e.target.closest("[data-edit-note]");
  if(editNote){
    const n=(state.journalEntries||[]).find(x=>x.id===editNote.dataset.editNote);if(!n)return;
    const txt=prompt("Editar registro:",n.text);if(txt===null)return;n.text=txt;save();toast("Diário atualizado.");render();
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
state.journalEntries=Array.isArray(state.journalEntries)?state.journalEntries:[];
if(!state.projection)state.projection={name:'Projeto principal',initialBalance:60,target:1000,dailyPercent:30,activeProfile:'Moderado',asset:'XAUUSD'};
if(!state.projection.dailyPercent)state.projection.dailyPercent=30;
if(!state.projection.projectionPercent)state.projection.projectionPercent=state.projection.dailyPercent;
if(!Array.isArray(state.projection.secondaryTargets))state.projection.secondaryTargets=[];
if(!Array.isArray(state.projection.stageDeadlines))state.projection.stageDeadlines=[];
if(state.projection.stageIndex===undefined)state.projection.stageIndex=0;
if(state.settings.minDailySearchPercent===undefined)state.settings.minDailySearchPercent=20;
if(state.settings.lotMinimum===undefined)state.settings.lotMinimum=0.01;
normalizeLotRules();
rebuildCurrentBalance();save();
nav(); render();function renderSessionsTable(){
  if(!state.sessions.length)return `<div class="empty">Nenhuma sessão registrada.</div>`;
  const ordered=[...state.sessions].sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
  return `<div class="table-wrap"><table><thead><tr><th>Sessão</th><th>Data</th><th>Horário</th><th>Ativo</th><th>Ops</th><th>Resultado</th><th>%</th><th>Status</th><th>Ação</th></tr></thead><tbody>${ordered.slice(0,100).map(s=>{const t=sessionSummary(s.id),n=operationalSessionNumber(s.date,s.id);return `<tr><td>${n}</td><td>${s.date}</td><td>${s.startTime}${s.endTime?` → ${s.endTime}`:""}</td><td>${esc(s.asset)}</td><td>${t.count}</td><td class="${t.net>=0?'positive':'negative'}">${money(t.net)}</td><td class="${sessionPercent(s)>=0?'positive':'negative'}">${pct(sessionPercent(s))}</td><td><span class="pill ${s.status==="open"?"amber":"green"}">${s.status==="open"?"Aberta":"Encerrada"}</span></td><td>${s.status==="closed"?`<button class="btn secondary" data-session-detail="${s.id}">Selecionar</button> <button class="btn secondary" data-edit-session="${s.id}">Editar</button>`:`<button class="btn danger" data-close-session="${s.id}">Encerrar</button>`}</td></tr>`}).join("")}</tbody></table></div>`;
}

function renderOperations(){
  const open=state.activeSessionId?state.sessions.find(s=>s.id===state.activeSessionId&&s.status==="open"):null;
  const disabled=!open;
  const last=state.operations[0];
  const openMgmt=open?.operationalManagement||state.settings.defaultOperationalManagement||"Scalping";
  const openPlan=open?tradePlan(Number(open.balanceBefore)||calculatedAccountBalance(),openMgmt,open.profile||state.settings.defaultProfile,open.asset||state.settings.defaultAsset,open.searchPercent):null;
  const suggestedLot=openPlan?.baseLot??lotSuggestion(state.settings.currentBalance,state.settings.defaultProfile).lot;
  const suggestedCommission=commission(suggestedLot,state.assets[open?.asset||state.settings.defaultAsset]||asset()).toFixed(2);

  document.getElementById("view-operations").innerHTML=`
    <div class="callout ${disabled?'':'green'}">
      <strong>${disabled?"Nenhuma sessão operacional aberta.":"Sessão ativa: "+operationalSessionNumber(open.date,open.id)+" · "+open.date}</strong>
      <span class="note">${disabled?"Abra uma sessão operacional antes de registrar uma operação.":"Registre a operação de forma simples. Os dados ficarão vinculados automaticamente à sessão."}</span>
    </div>

    <div class="card section-space">
      <div class="card-header">
        <div><h2>Registrar operação</h2><p>Preencha somente o essencial. Lote e pontos são opcionais.</p></div>
        ${open?`<span class="pill blue">${esc(openMgmt)}</span>`:""}
      </div>
      <form id="op-form" class="form-grid">
        <div class="field"><label>Data</label><input type="date" name="date" value="${open?.date||todayStr()}" ${disabled?"disabled":""} required></div>
        <div class="field"><label>Hora</label><input type="time" name="time" value="${new Date().toTimeString().slice(0,5)}" ${disabled?"disabled":""} required></div>
        <div class="field"><label>Ativo</label><select name="asset" ${disabled?"disabled":""} required>${Object.values(state.assets).map(x=>`<option ${x.symbol===(open?.asset||state.settings.defaultAsset)?"selected":""}>${x.symbol}</option>`).join("")}</select></div>
        <div class="field"><label>Direção</label><select name="direction" ${disabled?"disabled":""} required><option value="1">BUY</option><option value="-1">SELL</option></select></div>
        <div class="field"><label>Resultado líquido (US$)</label><input type="number" step="0.01" name="net" ${disabled?"disabled":""} required placeholder="Ex.: 4.25"></div>
        <div class="field"><label>Comissão (US$)</label><input type="number" step="0.01" name="commission" value="${suggestedCommission}" ${disabled?"disabled":""} required></div>
        <div class="field"><label>Quantidade de lotes <span class="note">(opcional)</span></label><input type="number" min="0.01" step="0.01" name="lot" value="${openPlan?num(suggestedLot,2):""}" ${disabled?"disabled":""} placeholder="Ex.: 0.01"></div>
        <div class="field"><label>Pontos + / − <span class="note">(opcional)</span></label><input type="number" step="1" name="points" ${disabled?"disabled":""} placeholder="Ex.: +200 ou -100"></div>
        <div class="field full"><label>Observação <span class="note">(opcional)</span></label><textarea name="note" ${disabled?"disabled":""} placeholder="Informe o preço de entrada e saída, contexto da operação ou qualquer comentário relevante."></textarea></div>
        <div class="actions full"><button class="btn primary" ${disabled?"disabled":""}>Registrar operação</button></div>
      </form>
    </div>

    ${openPlan?`<div class="card section-space">
      <div class="card-header"><div><h2>Plano da sessão</h2><p>Referência para esta sessão; não é obrigatório preencher todos os campos da operação.</p></div></div>
      <div class="stat-strip">
        <div><span class="kicker">Lote base</span><div class="v">${num(openPlan.baseLot,2)}</div></div>
        <div><span class="kicker">Máx. entradas</span><div class="v">${openPlan.maxEntries}</div></div>
        <div><span class="kicker">Exposição máxima</span><div class="v">${num(openPlan.maxTotalLot,2)}</div></div>
        <div><span class="kicker">Meta líquida</span><div class="v">${money(openPlan.netTarget)}</div></div>
      </div>
    </div>`:""}

    <div class="card section-space">
      <div class="card-header"><div><h2>Última operação registrada</h2><p>Acesse a sessão operacional para visualizar e editar todos os dados.</p></div></div>
      ${last?renderLastOperation(last):`<div class="empty">Nenhuma operação registrada.</div>`}
    </div>`;

  const form=document.getElementById("op-form");
  if(form) form.onsubmit=e=>{
    e.preventDefault();
    if(!open){toast("Abra uma sessão operacional antes de registrar a operação.");return;}
    const f=new FormData(e.target);
    const aa=state.assets[f.get("asset")]||asset();
    const lotRaw=String(f.get("lot")||"").trim();
    const pointsRaw=String(f.get("points")||"").trim();
    const lot=lotRaw===""?null:Number(lotRaw);
    const points=pointsRaw===""?null:Number(pointsRaw);
    const net=Number(f.get("net"))||0;
    const comm=Number(f.get("commission"))||0;
    if(lot!==null && (!Number.isFinite(lot)||lot<=0)){toast("Quantidade de lotes inválida.");return;}
    if(points!==null && !Number.isFinite(points)){toast("Quantidade de pontos inválida.");return;}

    const entryNumber=state.operations.filter(o=>o.sessionId===open.id).length+1;
    const used=state.operations.filter(o=>o.sessionId===open.id).reduce((sum,o)=>sum+(Number(o.lot)||0),0);
    const effectiveLot=lot??0;
    if(openPlan && effectiveLot>0){
      if(entryNumber>openPlan.maxEntries){toast(`Limite de ${openPlan.maxEntries} entradas atingido para ${openMgmt}.`);return;}
      if(used+effectiveLot>openPlan.maxTotalLot+1e-9){toast(`Exposição máxima da operação: ${num(openPlan.maxTotalLot,2)} lote.`);return;}
    }

    const gross=points!==null && effectiveLot>0?pointsToMoney(points,effectiveLot,aa):null;
    addOperation({
      date:f.get("date"),time:f.get("time"),sessionId:open.id,asset:f.get("asset"),
      direction:Number(f.get("direction")),lot,points,gross,net,commission:comm,
      executionCost:gross===null?null:gross-net,entry:null,exit:null,
      strategy:open.context||"",note:f.get("note")||"",mode:"simple",entryNumber
    });
  };
}
function renderLastOperation(o){
  const s=state.sessions.find(x=>x.id===o.sessionId), bal=Number(o.balanceBeforeOperation)||0;
  const pctAdd=bal?Number(o.net)/bal*100:0;
  return `<div class="table-wrap"><table><thead><tr>
    <th>Data</th><th>Hora</th><th>Sessão</th><th>Ativo</th><th>Direção</th><th>Lote</th><th>Pontos</th><th>Líquido</th><th>Comissão</th><th>% saldo</th>
  </tr></thead><tbody><tr>
    <td>${o.date||"—"}</td><td>${o.time||"—"}</td><td>${s?operationalSessionNumber(s.date,s.id):"—"}</td>
    <td>${esc(o.asset||"—")}</td><td>${o.direction===1?"BUY":"SELL"}</td>
    <td>${o.lot==null?"—":num(o.lot,2)}</td><td>${o.points==null?"—":num(o.points,0)}</td>
    <td class="${o.net>=0?'positive':'negative'}">${money(o.net)}</td><td>${money(o.commission||0)}</td>
    <td class="${pctAdd>=0?'positive':'negative'}">${pct(pctAdd)}</td>
  </tr></tbody></table></div>
  ${o.note?`<div class="callout section-space"><strong>Observação</strong><span class="note">${esc(o.note)}</span></div>`:""}
  <div class="actions section-space"><button class="btn secondary" data-edit-op="${o.id}">Editar operação</button></div>`;
}
function addOperation(o){
  if(!o.sessionId){toast('Abra uma sessão antes de registrar a operação.');return;}
  if(!state.activeSessionId) state.activeSessionId=o.sessionId;
  o.balanceBeforeOperation=Number(state.settings.currentBalance)||0;
  state.operations.unshift({id:uid(),timestamp:new Date().toISOString(),...o});
  rebuildCurrentBalance(); save(); toast('Operação registrada na sessão e saldo atualizado.'); render();
}
function renderOpsTable(){
  if(!state.operations.length)return `<div class="empty">Nenhuma operação registrada.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Sessão</th><th>Ativo</th><th>Dir.</th><th>Lote</th><th>Pontos</th><th>Líquido</th><th>Comissão</th><th>Ação</th></tr></thead><tbody>${state.operations.slice(0,100).map(o=>{const s=state.sessions.find(x=>x.id===o.sessionId);return `<tr><td>${o.date} ${o.time||""}</td><td>${s?operationalSessionNumber(s.date,s.id):"—"}</td><td>${esc(o.asset)}</td><td>${o.direction===1?"BUY":"SELL"}</td><td>${o.lot==null?"—":num(o.lot,2)}</td><td>${o.points==null?"—":num(o.points,0)}</td><td class="${o.net>=0?'positive':'negative'}">${money(o.net)}</td><td>${money(o.commission||0)}</td><td><button class="btn secondary" data-edit-op="${o.id}">Editar</button></td></tr>`}).join("")}</tbody></table></div><p class="note">Todos os campos da operação podem ser editados posteriormente em Sessão Operacional.</p>`;
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


