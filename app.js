'use strict';

const V2_VERSION = '2.0.7';
const STATE_KEY = 'osm_ai_coach_pro_v2_state';
const SETTINGS_KEY = 'osm_ai_coach_pro_v2_settings';
const API_KEY_STORAGE = 'osm_ai_coach_pro_gemini_key';
const OLD_KEYS = ['osm_ai_coach_pro_state_v52_clean','osm_ai_coach_pro_state_v51','osm_ai_coach_pro_state'];
const POS_TARGET = {ATA:4, MEI:6, DEF:6, GOL:2};
const FORMATIONS = ['4-3-3 A','4-3-3 B','4-5-1','4-2-3-1','4-4-2 A','4-4-2 B','3-2-5','3-2-3-2','3-3-4 A','3-3-4 B','3-4-3 A','3-4-3 B','3-3-2-2','3-5-2','4-2-4 A','4-2-4 B','5-2-3 A','5-2-3 B','5-3-2','5-3-1-1','5-4-1 A','5-4-1 B','6-3-1 A','6-3-1 B'];
const GAME_PLANS = ['Jogar pelas alas','Jogo de passes','Bola longa','Contra-ataque','Remate à vista'];
const FIELD_DEFS = [
  ['teamName','Meu time'],['opponent.teamName','Adversário'],['match.venue','Local'],
  ['match.refereeColor','Árbitro'],['myTeam.overall','Minha força'],['opponent.overall','Força rival'],
  ['myTeam.goalkeeper','Meu GOL'],['myTeam.defence','Minha DEF'],['myTeam.midfield','Meu MEI'],['myTeam.attack','Meu ATA'],
  ['opponent.goalkeeper','Rival GOL'],['opponent.defence','Rival DEF'],['opponent.midfield','Rival MEI'],['opponent.attack','Rival ATA'],
  ['opponent.human','Rival humano'],['opponent.manager','Manager rival'],['opponent.loginBonus','Bônus rival'],
  ['opponent.stadium','Estádio rival'],['opponent.trainingCamp','Campo treinamento rival'],['opponent.secretTraining','Treino secreto rival'],
  ['opponent.formation','Formação rival'],['opponent.style','Plano rival'],['opponent.marking','Marcação rival'],['opponent.offside','Impedimento rival']
];
const REQUIRED_TACTIC = ['teamName','opponent.teamName','match.venue','match.refereeColor','myTeam.overall','opponent.overall','opponent.formation','opponent.style','opponent.marking','opponent.offside'];

const $ = id => document.getElementById(id);
const nowIso = () => new Date().toISOString();
const clone = x => JSON.parse(JSON.stringify(x));
const safeParse = (s,f=null) => { try { return JSON.parse(s) } catch { return f } };
const esc = v => String(v ?? 'NI').replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m]));
const hasValue = v => !(v===null || v===undefined || v==='' || v==='NI');
const boolLabel = v => v===true?'Sim':v===false?'Não':'NI';
const fmtMoney = v => {
  if(!hasValue(v)) return 'NI';
  const n=Number(v); if(!Number.isFinite(n)) return String(v);
  return Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1}).format(n);
};
const fmtDate = v => {
  if(!v) return 'Horário NI';
  const d=new Date(v); if(Number.isNaN(d.getTime())) return 'Horário NI';
  return d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
};

function defaultMeta(){
  const m={}; FIELD_DEFS.forEach(([p])=>m[p]={source:'unknown',confidence:0,updatedAt:null}); return m;
}
function defaultSlot(n){
  return {
    slotNumber:n,status:'empty',teamName:null,competitionName:null,competitionType:null,round:null,totalRounds:null,
    myTeam:{overall:null,goalkeeper:null,defence:null,midfield:null,attack:null,squadValue:null,playerCount:null,stadium:null,loginBonus:null,secretTraining:null,trainingCamp:null,leaguePosition:null},
    opponent:{teamName:null,human:null,manager:null,overall:null,goalkeeper:null,defence:null,midfield:null,attack:null,squadValue:null,playerCount:null,stadium:null,loginBonus:null,secretTraining:null,trainingCamp:null,formation:null,style:null,marking:null,offside:null,tackling:null},
    match:{venue:null,refereeName:null,refereeColor:null,nextMatchAt:null},
    roster:[],market:[],schedule:[],results:[],notes:[],fieldMeta:defaultMeta(),analysisQuality:0,tactic:null,tacticCandidates:[],marketPlan:null,lastAnalysisAt:null
  };
}
function defaultState(){
  return {version:V2_VERSION,selectedSlot:1,slots:[1,2,3,4].map(defaultSlot),archives:[],eventIntel:null,decisionLog:[]};
}
function defaultSettings(){ return {userNick:'leandrozzy',model:'gemini-3.8-flash',notifyMinutes:20,notifyEnabled:true,localOcr:true}; }

function deepMerge(a,b){
  if(!b || typeof b!=='object') return a;
  for(const [k,v] of Object.entries(b)){
    if(v && typeof v==='object' && !Array.isArray(v) && a[k] && typeof a[k]==='object' && !Array.isArray(a[k])) a[k]=deepMerge({...a[k]},v);
    else a[k]=v;
  }
  return a;
}
function loadState(){
  const raw=safeParse(localStorage.getItem(STATE_KEY),null);
  if(!raw || !Array.isArray(raw.slots)) return defaultState();
  const d=defaultState();
  d.selectedSlot=[1,2,3,4].includes(Number(raw.selectedSlot))?Number(raw.selectedSlot):1;
  d.archives=Array.isArray(raw.archives)?raw.archives:[];
  d.eventIntel=raw.eventIntel||null; d.decisionLog=Array.isArray(raw.decisionLog)?raw.decisionLog:[];
  d.slots=[1,2,3,4].map(n=>normalizeSlot(deepMerge(defaultSlot(n),raw.slots.find(x=>Number(x.slotNumber)===n)||{})));
  return d;
}
function normalizeSlot(s){
  s.fieldMeta=(s.fieldMeta && typeof s.fieldMeta==='object' && !Array.isArray(s.fieldMeta))?s.fieldMeta:defaultMeta();
  for(const [p] of FIELD_DEFS) if(!s.fieldMeta[p]) s.fieldMeta[p]={source:'unknown',confidence:0,updatedAt:null};
  s.myTeam=(s.myTeam && typeof s.myTeam==='object' && !Array.isArray(s.myTeam))?s.myTeam:{};
  s.opponent=(s.opponent && typeof s.opponent==='object' && !Array.isArray(s.opponent))?s.opponent:{};
  s.match=(s.match && typeof s.match==='object' && !Array.isArray(s.match))?s.match:{};
  s.roster=Array.isArray(s.roster)?s.roster:[];
  s.market=Array.isArray(s.market)?s.market:[];
  s.schedule=Array.isArray(s.schedule)?s.schedule:[];
  s.results=Array.isArray(s.results)?s.results:[];
  s.notes=Array.isArray(s.notes)?s.notes:[];
  s.tacticCandidates=Array.isArray(s.tacticCandidates)?s.tacticCandidates:[];
  if(!s.marketPlan || typeof s.marketPlan!=='object' || !Array.isArray(s.marketPlan.actions)) s.marketPlan=null;
  if(s.tactic && typeof s.tactic!=='object') s.tactic=null;
  return s;
}
let state=loadState();
let settings={...defaultSettings(),...safeParse(localStorage.getItem(SETTINGS_KEY),{})};
if(!String(settings.model||'').startsWith('gemini-3.')){settings.model='gemini-3.8-flash';localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}
let analysisMode='tactic';
let pendingMediaFiles=[];
let analysisBusy=false;

function saveState(){ state.version=V2_VERSION; localStorage.setItem(STATE_KEY,JSON.stringify(state)); renderAll(); }
function saveSettings(){ localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings)); }
function selectedSlot(){ return state.slots[state.selectedSlot-1]; }
function getPath(obj,path){ return path.split('.').reduce((a,k)=>a?.[k],obj); }
function setPath(obj,path,value){ const p=path.split('.'); let cur=obj; for(let i=0;i<p.length-1;i++){ cur[p[i]]??={};cur=cur[p[i]];} cur[p.at(-1)]=value; }
function setField(slot,path,value,source='manual',confidence=1){
  setPath(slot,path,value); slot.fieldMeta[path]={source,confidence:Number(confidence)||0,updatedAt:nowIso()};
}
function sourceLabel(s){ return ({detected:'Detectado',manual:'Informado',inferred:'Inferido',unknown:'Desconhecido'})[s]||'Desconhecido'; }
function sourceClass(s){ return 'source-'+(s||'unknown'); }

function toast(msg){
  const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),3000);
}
function job(text,type=''){
  const el=$('jobBanner');el.textContent=text;el.className='job-banner '+type;el.classList.remove('hidden');
  if(type==='done') setTimeout(()=>el.classList.add('hidden'),3500);
}
function openModal(html){ $('modalBody').innerHTML=html;$('modal').classList.add('open');$('modal').setAttribute('aria-hidden','false'); }
function closeModal(){ $('modal').classList.remove('open');$('modal').setAttribute('aria-hidden','true'); }
function showView(name){
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  $('view-'+name)?.classList.add('active');
  if(name==='pregame') renderPregame();
  if(name==='market') renderMarket();
  if(name==='learning') renderLearning();
  if(name==='history') renderHistory();
}

function countdown(iso){
  if(!iso) return 'Horário NI'; const t=new Date(iso).getTime()-Date.now(); if(!Number.isFinite(t)) return 'Horário NI';
  if(t<=0) return 'Jogo próximo/agora'; const m=Math.floor(t/60000),h=Math.floor(m/60),d=Math.floor(h/24);
  if(d) return `${d}d ${h%24}h`; return `${h}h ${m%60}min`;
}
function strengthDiff(s){ const a=Number(s.myTeam.overall),b=Number(s.opponent.overall); return Number.isFinite(a)&&Number.isFinite(b)?a-b:null; }
function strengthBucket(s){
  const d=strengthDiff(s); if(d===null)return 'NI'; if(d>=20)return 'muito_mais_forte';if(d>=8)return 'mais_forte';if(d>-8)return 'equilibrado';if(d>-20)return 'mais_fraco';return 'muito_mais_fraco';
}
function calcQuality(s){
  const paths=FIELD_DEFS.map(x=>x[0]); let score=0,weight=0;
  for(const p of paths){
    const important=REQUIRED_TACTIC.includes(p)?2:1; weight+=important;
    const v=getPath(s,p),m=s.fieldMeta[p]||{};
    if(hasValue(v) || typeof v==='boolean') score += important * Math.max(.35,Number(m.confidence)||0);
  }
  s.analysisQuality=Math.round(score/weight*100); return s.analysisQuality;
}
function missingRequired(s){ return REQUIRED_TACTIC.filter(p=>{const v=getPath(s,p);return !(hasValue(v)||typeof v==='boolean')}); }

function renderSlotSwitcher(){
  $('slotSwitcher').innerHTML=state.slots.map(s=>`<button class="slot-chip ${s.slotNumber===state.selectedSlot?'active':''}" onclick="selectSlot(${s.slotNumber})">Slot ${s.slotNumber}${s.competitionType==='Batalha'?' · Batalha':''}</button>`).join('');
}
window.selectSlot=function(n){
  state.selectedSlot=n;localStorage.setItem(STATE_KEY,JSON.stringify(state));if($('analysisSlot'))$('analysisSlot').value=String(n);renderAll();
  if($('view-pregame').classList.contains('active'))renderPregame();
  toast(`Slot ${n} selecionado`);
};

function renderDashboard(){
  const s=selectedSlot(), action=nextAction();
  $('heroAction').innerHTML=`<div class="priority">${action.priority}</div><h2>${esc(action.title)}</h2><p class="muted">${esc(action.detail)}</p><div class="actions">${action.buttons}</div>`;
  $('slotsGrid').innerHTML=state.slots.map(slotCard).join('');
  renderRadar();
}
function nextAction(){
  const active=state.slots.filter(s=>s.status==='active');
  if(!active.length) return {priority:'COMECE POR AQUI',title:'Configure ou analise um slot',detail:'Envie vídeo/imagens da partida ou crie uma competição manualmente.',buttons:`<button class="btn" onclick="showView('analyze')">Analisar</button>`};
  const urgent=[...active].sort((a,b)=>(new Date(a.match.nextMatchAt||'2999').getTime())-(new Date(b.match.nextMatchAt||'2999').getTime()))[0];
  const miss=missingRequired(urgent);
  if(miss.length) return {priority:`AÇÃO · SLOT ${urgent.slotNumber}`,title:`Completar leitura contra ${urgent.opponent.teamName||'o adversário'}`,detail:`${miss.length} campo(s) importantes ainda não confirmado(s).`,buttons:`<button class="btn" onclick="state.selectedSlot=${urgent.slotNumber};renderAll();showView('pregame')">Corrigir dados</button><button class="btn ghost" onclick="state.selectedSlot=${urgent.slotNumber};renderAll();showView('analyze')">Analisar mídia</button>`};
  if(!urgent.tactic) return {priority:`AÇÃO · SLOT ${urgent.slotNumber}`,title:'Gerar tática final',detail:'Os dados essenciais estão disponíveis para simulação interna.',buttons:`<button class="btn" onclick="generateTactic(${urgent.slotNumber})">Gerar tática</button>`};
  return {priority:`PRÓXIMO JOGO · SLOT ${urgent.slotNumber}`,title:`${urgent.teamName||'Meu time'} × ${urgent.opponent.teamName||'Adversário'}`,detail:`${fmtDate(urgent.match.nextMatchAt)} · ${countdown(urgent.match.nextMatchAt)}`,buttons:`<button class="btn" onclick="state.selectedSlot=${urgent.slotNumber};renderAll();showView('pregame')">Ver plano</button><button class="btn ghost" onclick="generateTactic(${urgent.slotNumber})">Recalcular</button>`};
}
function slotCard(s){
  calcQuality(s); const active=s.status==='active',d=strengthDiff(s),missing=missingRequired(s);
  return `<article class="slot-card ${s.slotNumber===state.selectedSlot?'selected':''}">
    <div class="slot-head"><div><div class="slot-num">SLOT ${s.slotNumber}${s.competitionType==='Batalha'?' · BATALHA':''}</div><div class="slot-team">${esc(s.teamName||'Slot disponível')}</div><div class="slot-comp">${esc(s.competitionName||'Sem competição')}</div></div>
    <span class="status ${!active?'':missing.length?'warn':'ok'}">${!active?'Livre':missing.length?'Dados parciais':s.tactic?'Pronto':'Dados prontos'}</span></div>
    ${active?`<div class="matchline"><b>${esc(s.opponent.teamName||'Adversário NI')}</b><div class="small muted">${esc(s.match.venue||'Local NI')} · ${s.match.nextMatchAt?countdown(s.match.nextMatchAt):'Horário NI'}</div></div>
    <div class="kpis"><div class="kpi"><span>Minha força</span><b>${esc(s.myTeam.overall)}</b></div><div class="kpi"><span>Rival</span><b>${esc(s.opponent.overall)}</b></div><div class="kpi"><span>Diferença</span><b>${d===null?'NI':(d>0?'+':'')+d}</b></div><div class="kpi"><span>Leitura</span><b>${s.analysisQuality}%</b></div></div>
    <div class="actions"><button class="btn" onclick="selectSlot(${s.slotNumber});showView('pregame')">${s.tactic?'Ver plano':'Preparar'}</button><button class="btn ghost" onclick="selectSlot(${s.slotNumber});showView('analyze')">Analisar</button><button class="btn ghost" onclick="competitionModal(${s.slotNumber})">Competição</button></div>`
    :`<div class="actions"><button class="btn" onclick="competitionModal(${s.slotNumber})">Criar competição</button><button class="btn ghost" onclick="selectSlot(${s.slotNumber});showView('analyze')">Analisar mídia</button></div>`}
  </article>`;
}
function renderRadar(){
  const rows=[];
  for(const s of state.slots.filter(x=>x.status==='active')){
    const miss=missingRequired(s);
    if(miss.length) rows.push([`Slot ${s.slotNumber}: completar leitura`,`${miss.length} campo(s) essencial(is)`,'danger']);
    else if(!s.tactic) rows.push([`Slot ${s.slotNumber}: gerar tática`,'Dados essenciais prontos','warn']);
    if(s.tactic && shouldRefresh(s)) rows.push([`Slot ${s.slotNumber}: revalidar adversário`,'Jogo próximo; confirme se ele mudou','warn']);
    if(s.marketPlan?.actions?.length) rows.push([`Slot ${s.slotNumber}: mercado`,s.marketPlan.actions[0],'']);
  }
  $('radarPanel').innerHTML=`<div class="section-head"><div><span class="eyebrow">RADAR</span><h2>Próximas ações</h2></div></div><div class="card radar-list">${rows.length?rows.map(r=>`<div class="radar-item"><div><b>${esc(r[0])}</b><span>${esc(r[1])}</span></div><span class="status ${r[2]}">${r[2]==='danger'?'Urgente':r[2]==='warn'?'Atenção':'Ação'}</span></div>`).join(''):'<p class="muted">Nada urgente agora.</p>'}</div>`;
}
function shouldRefresh(s){
  const t=s.match.nextMatchAt?new Date(s.match.nextMatchAt).getTime()-Date.now():Infinity;
  return t<45*60000 && t>0 && s.lastAnalysisAt && Date.now()-new Date(s.lastAnalysisAt).getTime()>20*60000;
}

window.competitionModal=function(n){
  const s=state.slots[n-1];
  openModal(`<h2>Competição · Slot ${n}</h2><div class="field-edit">
    <label>Meu time<input id="cTeam" value="${esc(s.teamName||'')}"></label>
    <label>Competição<input id="cComp" value="${esc(s.competitionName||'')}"></label>
    <label>Tipo<select id="cType"><option>Liga normal</option><option>Batalha</option><option>Copa</option><option>Torneio</option></select></label>
    <div class="kpis"><label>Rodada<input id="cRound" type="number" value="${esc(s.round||1)}"></label><label>Total<input id="cTotal" type="number" value="${esc(s.totalRounds||34)}"></label></div>
    <label>Próximo jogo<input id="cDate" type="datetime-local" value="${s.match.nextMatchAt?new Date(new Date(s.match.nextMatchAt).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):''}"></label>
    <div class="actions"><button class="btn" onclick="saveCompetition(${n})">Salvar</button>${s.status==='active'?`<button class="btn danger" onclick="finishCompetition(${n})">Finalizar competição</button>`:''}</div>
  </div>`);
  $('cType').value=s.competitionType||'Liga normal';
};
window.saveCompetition=function(n){
  const s=state.slots[n-1];s.status='active';s.teamName=$('cTeam').value.trim()||s.teamName;s.competitionName=$('cComp').value.trim()||s.competitionName;s.competitionType=$('cType').value;s.round=Number($('cRound').value)||1;s.totalRounds=Number($('cTotal').value)||null;
  const d=$('cDate').value;s.match.nextMatchAt=d?new Date(d).toISOString():s.match.nextMatchAt;if(s.teamName)setField(s,'teamName',s.teamName,'manual',1);
  saveState();closeModal();toast('Competição salva');
};
window.finishCompetition=function(n){
  const s=state.slots[n-1];state.archives.unshift({...clone(s),finishedAt:nowIso()});state.slots[n-1]=defaultSlot(n);saveState();closeModal();toast('Competição arquivada e slot liberado');
};

function renderPregame(){
  const s=selectedSlot();if(!s || s.status!=='active'){ $('pregameContent').innerHTML=`<div class="card"><p class="muted">Configure o Slot ${state.selectedSlot} ou analise uma mídia.</p></div>`;return; }
  calcQuality(s);const missing=missingRequired(s);const d=strengthDiff(s);
  $('pregameContent').innerHTML=`<div class="pregame-grid">
    <div class="card">
      <div class="versus"><div class="team-side"><small>MEU TIME</small><strong>${esc(s.teamName)}</strong><div class="strength-big">${esc(s.myTeam.overall)}</div></div><div class="vs">VS</div><div class="team-side"><small>RIVAL</small><strong>${esc(s.opponent.teamName)}</strong><div class="strength-big">${esc(s.opponent.overall)}</div></div></div>
      <div class="context-grid">
        ${ctx('Local',s.match.venue)}${ctx('Árbitro',s.match.refereeColor||s.match.refereeName)}${ctx('Humano',boolLabel(s.opponent.human))}${ctx('Bônus rival',hasValue(s.opponent.loginBonus)?s.opponent.loginBonus+'%':'NI')}
        ${ctx('Estádio rival',s.opponent.stadium)}${ctx('Campo treino',boolLabel(s.opponent.trainingCamp))}${ctx('Treino secreto',boolLabel(s.opponent.secretTraining))}${ctx('Diferença força',d===null?'NI':(d>0?'+':'')+d)}
        ${ctx('Formação rival',s.opponent.formation)}${ctx('Plano rival',s.opponent.style)}${ctx('Marcação',s.opponent.marking)}${ctx('Impedimento',boolLabel(s.opponent.offside))}
      </div>
      <div class="actions"><button class="btn ghost" onclick="editAllFields(${s.slotNumber})">Corrigir dados</button><button class="btn ghost" onclick="showView('analyze')">Nova leitura</button></div>
    </div>
    <div class="audit-card">
      <div class="audit-top"><div><span class="eyebrow">QUALIDADE DA LEITURA</span><h3>${missing.length?'Revisão necessária':'Dados suficientes'}</h3></div><div class="quality"><div class="quality-score">${s.analysisQuality}%</div></div></div>
      <p class="small muted">${missing.length?`${missing.length} campo(s) essencial(is) sem confirmação.`:'Os campos essenciais estão presentes. NI continua NI quando desconhecido.'}</p>
      <div class="actions">${missing.length?`<button class="btn" onclick="editAllFields(${s.slotNumber},true)">Resolver campos ausentes</button>`:''}</div>
    </div>
  </div>
  ${fieldAuditHtml(s)}
  ${tacticHtml(s)}`;
}
function ctx(k,v){return `<div class="context-item"><span>${esc(k)}</span><b>${esc(v)}</b></div>`}
function fieldAuditHtml(s){
  return `<div class="audit-card"><div class="audit-top"><div><span class="eyebrow">AUDITORIA</span><h3>Origem campo por campo</h3></div></div><div class="field-grid">${FIELD_DEFS.map(([p,l])=>{
    const v=getPath(s,p),m=s.fieldMeta[p]||{source:'unknown',confidence:0};
    return `<div class="field-row"><div><div class="label">${esc(l)}</div><div class="value">${esc(typeof v==='boolean'?boolLabel(v):v)}</div><div class="meta ${sourceClass(m.source)}">${sourceLabel(m.source)} · ${Math.round((m.confidence||0)*100)}%</div></div><button class="btn ghost tiny" onclick="editField(${s.slotNumber},'${p}')">Editar</button></div>`;
  }).join('')}</div></div>`;
}
function tacticHtml(s){
  if(!s.tactic) return `<div class="card" style="margin-top:12px"><div class="tactic-head"><div><span class="eyebrow">RECOMENDAÇÃO</span><h3>Tática ainda não gerada</h3></div></div><p class="muted small">A V2 gera vários candidatos internamente, elimina incoerências e mostra apenas o final.</p><div class="actions"><button class="btn" onclick="generateTactic(${s.slotNumber})">Gerar tática</button></div></div>`;
  const t=s.tactic, conf=Math.round((t.confidenceScore||.72)*100);
  const rows=[['Formação',t.formation],['Estilo de jogo',t.gamePlan],['Pressão',t.pressure],['Estilo / Mentalidade',t.mentality],['Temporização / Ritmo',t.tempo],['Marcação',t.marking],['Impedimento',t.offside],['Desarme',t.tackling],['Avançadas – Ataque',t.attackInstruction],['Avançadas – Meio',t.midfieldInstruction],['Avançadas – Defesa',t.defenceInstruction]];
  return `<div class="card" style="margin-top:12px"><div class="tactic-head"><div><span class="eyebrow">TÁTICA FINAL</span><h3>${esc(t.formation)} · ${esc(t.gamePlan)}</h3></div><span class="status ok">Recomendação</span></div>
  <table class="tactic-table">${rows.map(([a,b])=>`<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</table>
  <div class="confidence-bar"><div class="small muted">Confiança da recomendação: ${conf}%</div><div class="confidence-track"><span style="width:${conf}%"></span></div></div>
  <div class="reason-box">${esc(t.reason||'Tática validada pelo motor V2.')}</div>
  <div class="actions"><button class="btn" onclick="generateTactic(${s.slotNumber})">Recalcular</button><button class="btn ghost" onclick="copyTactic(${s.slotNumber})">Copiar configuração</button><button class="btn ghost" onclick="whyTactic(${s.slotNumber})">Por que esta tática?</button><button class="btn ghost" onclick="resultModal(${s.slotNumber})">Registrar resultado</button></div></div>`;
}

window.editField=function(n,path){
  const s=state.slots[n-1],def=FIELD_DEFS.find(x=>x[0]===path),label=def?.[1]||path,v=getPath(s,path);
  let control=`<input id="fieldValue" value="${esc(v??'')}">`;
  if(path==='opponent.human'||path==='opponent.trainingCamp'||path==='opponent.secretTraining'||path==='opponent.offside'){
    control=`<select id="fieldValue"><option value="NI">NI</option><option value="true">Sim</option><option value="false">Não</option></select>`;
  }
  if(path==='match.venue') control=`<select id="fieldValue"><option>NI</option><option>Casa</option><option>Fora</option></select>`;
  if(path==='match.refereeColor') control=`<select id="fieldValue"><option>NI</option><option>Verde</option><option>Amarelo</option><option>Laranja</option><option>Vermelho</option></select>`;
  if(path==='opponent.formation') control=`<select id="fieldValue"><option>NI</option>${FORMATIONS.map(x=>`<option>${x}</option>`).join('')}</select>`;
  if(path==='opponent.style') control=`<select id="fieldValue"><option>NI</option>${GAME_PLANS.map(x=>`<option>${x}</option>`).join('')}</select>`;
  openModal(`<h2>Editar · ${esc(label)}</h2><div class="field-edit"><label>Valor${control}</label><p class="small muted">Ao salvar manualmente, a origem fica marcada como “Informado”. NI permanece desconhecido.</p><button class="btn" onclick="saveEditedField(${n},'${path}')">Salvar</button></div>`);
  const el=$('fieldValue');
  if(el?.tagName==='SELECT'){
    const vv=typeof v==='boolean'?String(v):(hasValue(v)?String(v):'NI'); [...el.options].some(o=>{if(o.value===vv||o.text===vv){el.value=o.value;return true}});
  }
};
window.saveEditedField=function(n,path){
  const s=state.slots[n-1];let v=$('fieldValue').value;
  if(v==='NI'||v==='') v=null;
  else if(['opponent.human','opponent.trainingCamp','opponent.secretTraining','opponent.offside'].includes(path)) v=v==='true';
  else if(['myTeam.overall','opponent.overall','myTeam.goalkeeper','myTeam.defence','myTeam.midfield','myTeam.attack','opponent.goalkeeper','opponent.defence','opponent.midfield','opponent.attack','opponent.stadium','opponent.loginBonus'].includes(path)){const n=Number(v);v=Number.isFinite(n)?n:v}
  setField(s,path,v,'manual',1);calcQuality(s);s.tactic=null;saveState();closeModal();renderPregame();toast('Campo corrigido');
};
window.editAllFields=function(n,missingOnly=false){
  const s=state.slots[n-1],rows=FIELD_DEFS.filter(([p])=>!missingOnly || !(hasValue(getPath(s,p))||typeof getPath(s,p)==='boolean'));
  openModal(`<h2>${missingOnly?'Completar campos ausentes':'Corrigir dados'} · Slot ${n}</h2><div class="field-edit">${rows.map(([p,l],i)=>`<label>${esc(l)}<input id="bulk_${i}" data-path="${p}" value="${esc(getPath(s,p)??'')}"></label>`).join('')}<p class="small muted">Use NI ou deixe vazio quando realmente não souber.</p><button class="btn" onclick="saveBulkFields(${n})">Salvar alterações</button></div>`);
};
window.saveBulkFields=function(n){
  const s=state.slots[n-1];document.querySelectorAll('[id^="bulk_"]').forEach(el=>{let v=el.value.trim(),p=el.dataset.path;if(!v||v.toUpperCase()==='NI')v=null;setField(s,p,v,'manual',1)});
  calcQuality(s);s.tactic=null;saveState();closeModal();renderPregame();toast('Dados atualizados');
};

function normalizeAiBoolean(v){ if(v===true||v===false)return v;if(typeof v==='string'){const x=v.toLowerCase();if(['sim','yes','true'].includes(x))return true;if(['não','nao','no','false'].includes(x))return false}return null; }
function applyAnalysis(n,data){
  const s=state.slots[n-1];s.status='active';
  const nick=(settings.userNick||'leandrozzy').toLowerCase();
  const meManager=String(data.myManager||'').toLowerCase(),oppManager=String(data.opponentManager||'').toLowerCase();
  if(data.sideA && data.sideB){
    const aMgr=String(data.sideA.manager||'').toLowerCase(),bMgr=String(data.sideB.manager||'').toLowerCase();
    const mySide=aMgr.includes(nick)?data.sideA:bMgr.includes(nick)?data.sideB:null;
    const opSide=mySide===data.sideA?data.sideB:mySide===data.sideB?data.sideA:null;
    if(mySide){
      data.teamName=mySide.teamName??data.teamName;data.myOverall=mySide.overall??data.myOverall;data.mySquadValue=mySide.squadValue??data.mySquadValue;
      if(opSide){data.opponentName=opSide.teamName??data.opponentName;data.oppOverall=opSide.overall??data.oppOverall;data.oppSquadValue=opSide.squadValue??data.oppSquadValue;data.opponentManager=opSide.manager??data.opponentManager;}
    }
  }
  const map={
    teamName:'teamName',opponentName:'opponent.teamName',venue:'match.venue',referee:'match.refereeColor',
    myOverall:'myTeam.overall',oppOverall:'opponent.overall',myGoalkeeper:'myTeam.goalkeeper',myDefence:'myTeam.defence',myMidfield:'myTeam.midfield',myAttack:'myTeam.attack',
    oppGoalkeeper:'opponent.goalkeeper',oppDefence:'opponent.defence',oppMidfield:'opponent.midfield',oppAttack:'opponent.attack',
    opponentManager:'opponent.manager',opponentLoginBonus:'opponent.loginBonus',opponentStadium:'opponent.stadium',
    opponentFormation:'opponent.formation',opponentStyle:'opponent.style',opponentMarking:'opponent.marking',
    mySquadValue:'myTeam.squadValue',oppSquadValue:'opponent.squadValue'
  };
  for(const [k,p] of Object.entries(map)){
    const item=data[k];
    if(item===undefined)continue;
    const value=(item && typeof item==='object' && 'value' in item)?item.value:item;
    const conf=(item && typeof item==='object' && 'confidence' in item)?Number(item.confidence):.7;
    if(value===null||value===undefined||value===''||String(value).toUpperCase()==='NI'){ if(!hasValue(getPath(s,p))) setField(s,p,null,'unknown',0); continue; }
    setField(s,p,value,'detected',Math.max(0,Math.min(1,conf||.7)));
  }
  const bmap={opponentHuman:'opponent.human',opponentTrainingCamp:'opponent.trainingCamp',opponentSecretTraining:'opponent.secretTraining',opponentOffside:'opponent.offside'};
  for(const [k,p] of Object.entries(bmap)){ if(k in data){const raw=data[k],vv=raw&&typeof raw==='object'?raw.value:raw,conf=raw&&typeof raw==='object'?raw.confidence:.7,b=normalizeAiBoolean(vv);setField(s,p,b,b===null?'unknown':'detected',b===null?0:Number(conf)||.7)}}
  if(data.competitionName)s.competitionName=data.competitionName;if(data.round)s.round=data.round;if(data.totalRounds)s.totalRounds=data.totalRounds;if(data.competitionType)s.competitionType=data.competitionType;
  s.lastAnalysisAt=nowIso();calcQuality(s);s.tactic=null;state.selectedSlot=n;saveState();
}
async function fileToInline(file){
  return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]);r.onerror=rej;r.readAsDataURL(file)});
}
async function videoFrames(file,maxFrames=7){
  return new Promise((resolve,reject)=>{
    const video=document.createElement('video');
    const url=URL.createObjectURL(file);
    video.src=url;video.muted=true;video.playsInline=true;video.preload='metadata';
    const cleanup=()=>{try{video.pause()}catch{}URL.revokeObjectURL(url)};
    const fail=(msg)=>{cleanup();reject(new Error(msg))};
    const timer=setTimeout(()=>fail('O Android demorou demais para abrir o vídeo. Tente novamente ou envie imagens da partida.'),20000);
    video.onloadedmetadata=async()=>{
      clearTimeout(timer);
      try{
        const duration=Math.min(Number(video.duration)||0,120);
        if(!duration)throw new Error('Duração do vídeo não identificada');
        const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{alpha:false});
        const vw=video.videoWidth||1280,vh=video.videoHeight||720;
        canvas.width=720;canvas.height=Math.max(360,Math.round(720*vh/vw));
        const frames=[];
        const total=Math.max(4,Math.min(maxFrames,8));
        for(let i=0;i<total;i++){
          setProgress(12+Math.round((i/total)*36),`Extraindo quadro ${i+1}/${total}…`);
          const t=Math.max(.05,Math.min(duration-.1,duration*(i+.35)/total));
          await seekWithTimeout(video,t,5000);
          ctx.drawImage(video,0,0,canvas.width,canvas.height);
          frames.push(canvas.toDataURL('image/jpeg',.72).split(',')[1]);
        }
        cleanup();resolve(frames);
      }catch(e){cleanup();reject(e)}
    };
    video.onerror=()=>fail('Não consegui decodificar o vídeo neste navegador.');
    try{video.load()}catch{}
  });
}
function seekWithTimeout(video,t,timeoutMs=5000){
  return new Promise((resolve,reject)=>{
    let done=false;
    const finish=(ok)=>{
      if(done)return;done=true;
      clearTimeout(timer);
      video.removeEventListener('seeked',onSeeked);
      video.removeEventListener('error',onError);
      ok?resolve():reject(new Error('Falha ao buscar um trecho do vídeo'));
    };
    const onSeeked=()=>finish(true),onError=()=>finish(false);
    const timer=setTimeout(()=>finish(true),timeoutMs);
    video.addEventListener('seeked',onSeeked,{once:true});
    video.addEventListener('error',onError,{once:true});
    try{video.currentTime=t}catch{finish(false)}
  });
}

async function geminiJson(parts,temperature=.1,maxOutputTokens=5000){
  const key=localStorage.getItem(API_KEY_STORAGE);
  if(!key) throw new Error('API Gemini não configurada.');

  const candidates=await availableModels(key);
  const ordered=[settings.model,...candidates].filter((x,i,a)=>x&&a.indexOf(x)===i);
  let last='';

  for(const model of ordered){
    for(let tryNo=0; tryNo<2; tryNo++){
      if($('analysisDiagnostics')){
        $('analysisDiagnostics').textContent=`Gemini: ${model} · tentativa ${tryNo+1}/2`;
      }
      job(`Consultando ${model}…`);

      const body={
        contents:[{role:'user',parts}],
        generationConfig:{
          temperature,
          maxOutputTokens,
          responseMimeType:'application/json'
        }
      };

      let res;
      try{
        res=await geminiFetch(model,key,body);
      }catch(e){
        last=e.message;
        await new Promise(r=>setTimeout(r,800));
        continue;
      }

      if(res.ok){
        const data=await res.json();
        const text=(data.candidates?.[0]?.content?.parts||[])
          .map(p=>p.text||'')
          .join('')
          .trim();

        if(!text) throw new Error('A IA não retornou conteúdo utilizável.');

        settings.model=model;
        saveSettings();
        hydrateSettings();

        if($('analysisDiagnostics')){
          $('analysisDiagnostics').textContent=`Análise concluída com ${model}.`;
        }
        return parseJsonText(text);
      }

      const status=res.status;
      const txt=await res.text();
      last=`Gemini ${status}: ${txt.slice(0,260)}`;

      // Igual à versão antiga: só repete indisponibilidade temporária.
      if(![429,500,502,503,504].includes(status)) break;
      await new Promise(r=>setTimeout(r,1600*(tryNo+1)));
    }
  }

  throw new Error(last||'Gemini temporariamente indisponível.');
}

async function availableModels(key){
  try{
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
    if(!r.ok) return fallbackModelList();

    const d=await r.json();
    const names=(d.models||[])
      .filter(m=>(m.supportedGenerationMethods||[]).includes('generateContent'))
      .map(m=>(m.name||'').replace('models/',''))
      .filter(Boolean);

    const preferred=[
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash'
    ];

    const ordered=[
      ...preferred.filter(x=>names.includes(x)),
      ...names.filter(x=>/flash/i.test(x) && !preferred.includes(x)),
      ...names.filter(x=>!preferred.includes(x) && !/flash/i.test(x))
    ];

    return ordered.length ? ordered : fallbackModelList();
  }catch{
    return fallbackModelList();
  }
}

function fallbackModelList(){
  return [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash'
  ];
}

function geminiFetch(model,key,body){
  // Mesmo formato da V1 que já funcionava: chave no header x-goog-api-key.
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-goog-api-key':key
      },
      body:JSON.stringify(body)
    }
  );
}

function parseJsonText(text){
  let s=String(text||'').trim()
    .replace(/^```(?:json)?/i,'')
    .replace(/```$/,'')
    .trim();

  try{
    return JSON.parse(s);
  }catch{
    const a=s.indexOf('{'),b=s.lastIndexOf('}');
    if(a>=0 && b>a) return JSON.parse(s.slice(a,b+1));
    throw new Error('Resposta da IA não veio em JSON válido.');
  }
}


async function localOcrFromBase64(b64){
  if(!settings.localOcr || typeof Tesseract==='undefined') return '';
  try{
    const src='data:image/jpeg;base64,'+b64;
    const result=await Tesseract.recognize(src,'eng',{logger:m=>{
      if(m?.status==='recognizing text' && Number.isFinite(m.progress)){
        setProgress(42+Math.round(m.progress*8),'OCR local… '+Math.round(m.progress*100)+'%');
      }
    }});
    return String(result?.data?.text||'').trim();
  }catch(e){
    console.warn('OCR local falhou',e);
    return '';
  }
}
async function buildLocalOcrContext(imageBase64List){
  if(!settings.localOcr || typeof Tesseract==='undefined' || !imageBase64List.length) return '';
  // OCR em poucos quadros estratégicos para não deixar o Android pesado.
  const picks=[];
  if(imageBase64List[0])picks.push(imageBase64List[0]);
  if(imageBase64List[Math.floor(imageBase64List.length/2)])picks.push(imageBase64List[Math.floor(imageBase64List.length/2)]);
  if(imageBase64List.at(-1))picks.push(imageBase64List.at(-1));
  const unique=[...new Set(picks)];
  const texts=[];
  for(let i=0;i<unique.length;i++){
    setProgress(38+Math.round((i/unique.length)*12),`OCR local ${i+1}/${unique.length}…`);
    const t=await localOcrFromBase64(unique[i]);
    if(t)texts.push(t);
  }
  return texts.join('\n--- QUADRO OCR ---\n').slice(0,12000);
}

function analysisPrompt(){
  return `Você analisa telas do OSM 26 Android. O usuário da conta é "${settings.userNick||'leandrozzy'}". REGRA CRÍTICA: quando esse nick aparecer abaixo de um time, esse lado é SEMPRE "meu time"; nunca inverta forças. Não invente dados. Se não estiver visível, use null. Ausência visual de Campo de treinamento ou Treino secreto só pode virar false se a tela específica em que esse indicador apareceria estiver claramente presente; caso contrário null. Para árbitro, use Verde/Amarelo/Laranja/Vermelho somente quando visível. Retorne JSON estrito. Cada campo principal deve ser {"value":..., "confidence":0..1}. Também pode retornar sideA/sideB para a tela de comparação. Estrutura:
{"teamName":{"value":null,"confidence":0},"opponentName":{"value":null,"confidence":0},"venue":{"value":null,"confidence":0},"referee":{"value":null,"confidence":0},"myOverall":{"value":null,"confidence":0},"oppOverall":{"value":null,"confidence":0},"myGoalkeeper":{"value":null,"confidence":0},"myDefence":{"value":null,"confidence":0},"myMidfield":{"value":null,"confidence":0},"myAttack":{"value":null,"confidence":0},"oppGoalkeeper":{"value":null,"confidence":0},"oppDefence":{"value":null,"confidence":0},"oppMidfield":{"value":null,"confidence":0},"oppAttack":{"value":null,"confidence":0},"mySquadValue":{"value":null,"confidence":0},"oppSquadValue":{"value":null,"confidence":0},"opponentManager":{"value":null,"confidence":0},"opponentHuman":{"value":null,"confidence":0},"opponentLoginBonus":{"value":null,"confidence":0},"opponentStadium":{"value":null,"confidence":0},"opponentTrainingCamp":{"value":null,"confidence":0},"opponentSecretTraining":{"value":null,"confidence":0},"opponentFormation":{"value":null,"confidence":0},"opponentStyle":{"value":null,"confidence":0},"opponentMarking":{"value":null,"confidence":0},"opponentOffside":{"value":null,"confidence":0},"competitionName":null,"competitionType":null,"round":null,"totalRounds":null,"sideA":null,"sideB":null}.`;
}
async function analyzeFiles(files){
  const n=Number($('analysisSlot').value)||state.selectedSlot;state.selectedSlot=n;job('Preparando mídia…');$('progressWrap').classList.remove('hidden');setProgress(10,'Preparando mídia…');
  try{
    const imagePayloads=[];let images=0;
    for(const f of files){
      if(f.type.startsWith('image/')){
        const b64=await fileToInline(f);imagePayloads.push({b64,mimeType:f.type||'image/jpeg'});images++;
      }else if(f.type.startsWith('video/')){
        const frames=await videoFrames(f,8);
        for(const b64 of frames){imagePayloads.push({b64,mimeType:'image/jpeg'});images++}
      }
    }
    const ocrText=await buildLocalOcrContext(imagePayloads.map(x=>x.b64));
    const parts=[{text:analysisPrompt()+(ocrText?`\n\nTEXTO OCR LOCAL (use apenas como apoio; confirme visualmente nas imagens):\n${ocrText}`:'')}];
    for(const img of imagePayloads)parts.push({inlineData:{mimeType:img.mimeType,data:img.b64}});
    setProgress(58,`Enviando ${images} quadro(s) + OCR local para Gemini 3.8…`);
    const data=await geminiJson(parts,.05,6000);setProgress(85,'Validando campos e lado do usuário…');applyAnalysis(n,data);
    setProgress(100,'Leitura concluída');job('Leitura concluída. Revise os campos marcados como NI.','done');renderCoverage(state.slots[n-1]);renderAnalysisSummary(state.slots[n-1]);
    if($('autoTactic').checked && !missingRequired(state.slots[n-1]).length) await generateTactic(n);
  }catch(e){job(e.message,'error');toast(e.message)} finally{setTimeout(()=>$('progressWrap').classList.add('hidden'),1200)}
}
function setProgress(p,t){$('progressBar').style.width=p+'%';$('progressText').textContent=t}
function renderCoverage(s){
  calcQuality(s);const missing=FIELD_DEFS.filter(([p])=>!(hasValue(getPath(s,p))||typeof getPath(s,p)==='boolean'));
  $('coverageContent').innerHTML=`<div class="audit-card"><div class="audit-top"><div><span class="eyebrow">LEITURA</span><h3>Qualidade ${s.analysisQuality}%</h3></div><div class="quality-score">${s.analysisQuality}%</div></div><p class="small muted">${missing.length?`${missing.length} campo(s) continuam NI. Corrija manualmente apenas o que você souber.`:'Todos os campos principais possuem algum valor.'}</p><div class="actions"><button class="btn ghost" onclick="editAllFields(${s.slotNumber},true)">Preencher ausentes</button><button class="btn" onclick="showView('pregame')">Abrir pré-jogo</button></div></div>`;
}
function renderAnalysisSummary(s){
  $('analysisContent').innerHTML=`<div class="card" style="margin-top:12px"><h3>Slot ${s.slotNumber} atualizado</h3><div class="kpis"><div class="kpi"><span>Meu time</span><b>${esc(s.teamName)}</b></div><div class="kpi"><span>Rival</span><b>${esc(s.opponent.teamName)}</b></div><div class="kpi"><span>Força</span><b>${esc(s.myTeam.overall)} × ${esc(s.opponent.overall)}</b></div><div class="kpi"><span>Árbitro</span><b>${esc(s.match.refereeColor)}</b></div></div></div>`;
}

function localCandidateTemplates(s){
  const d=strengthDiff(s),venue=s.match.venue,form=s.opponent.formation||'',style=s.opponent.style||'',ref=String(s.match.refereeColor||'').toLowerCase();
  const tackling=ref.includes('vermelho')?'Cuidadoso':ref.includes('laranja')?'Cuidadoso':ref.includes('verde')?'Agressivo':'Normal';
  const c=[];
  if(d!==null && d<=-12){
    c.push({formation:'5-3-2',gamePlan:'Contra-ataque',pressure:32,mentality:28,tempo:72,marking:'À zona',offside:'Não',tackling,attackInstruction:'Atacar apenas',midfieldInstruction:'Proteger a defesa',defenceInstruction:'Defender atrás'});
    c.push({formation:'4-5-1',gamePlan:'Remate à vista',pressure:38,mentality:34,tempo:64,marking:'À zona',offside:'Não',tackling,attackInstruction:'Apoiar o meio-campo',midfieldInstruction:'Proteger a defesa',defenceInstruction:'Defender atrás'});
    c.push({formation:'5-4-1 A',gamePlan:'Contra-ataque',pressure:27,mentality:25,tempo:76,marking:'À zona',offside:'Não',tackling,attackInstruction:'Atacar apenas',midfieldInstruction:'Proteger a defesa',defenceInstruction:'Defender atrás'});
  }else if(d!==null && d>=18){
    c.push({formation:'4-3-3 B',gamePlan:'Jogar pelas alas',pressure:75,mentality:76,tempo:78,marking:'À zona',offside:'Não',tackling,attackInstruction:'Atacar apenas',midfieldInstruction:'Pressionar na frente',defenceInstruction:'Apoiar o meio-campo'});
    c.push({formation:'4-3-3 A',gamePlan:'Jogo de passes',pressure:70,mentality:74,tempo:72,marking:'À zona',offside:'Não',tackling,attackInstruction:'Atacar apenas',midfieldInstruction:'Pressionar na frente',defenceInstruction:'Apoiar o meio-campo'});
  }else{
    c.push({formation:'4-2-3-1',gamePlan:'Jogo de passes',pressure:55,mentality:52,tempo:65,marking:'À zona',offside:'Não',tackling,attackInstruction:'Atacar apenas',midfieldInstruction:'Manter posição',defenceInstruction:'Defender atrás'});
    c.push({formation:'4-4-2 B',gamePlan:'Jogar pelas alas',pressure:58,mentality:55,tempo:68,marking:'À zona',offside:'Não',tackling,attackInstruction:'Atacar apenas',midfieldInstruction:'Manter posição',defenceInstruction:'Apoiar o meio-campo'});
    c.push({formation:'4-5-1',gamePlan:'Remate à vista',pressure:46,mentality:45,tempo:62,marking:'À zona',offside:'Não',tackling,attackInstruction:'Apoiar o meio-campo',midfieldInstruction:'Manter posição',defenceInstruction:'Defender atrás'});
  }
  return c;
}
function candidateScore(c,s){
  let score=50;const d=strengthDiff(s),ref=String(s.match.refereeColor||'').toLowerCase(),opp=s.opponent.formation||'';
  if(d!==null&&d<-8&&['5-3-2','5-4-1 A','4-5-1'].includes(c.formation))score+=13;
  if(d!==null&&d>12&&c.formation.startsWith('4-3-3'))score+=12;
  if(s.match.venue==='Casa')score+=3;
  if(ref.includes('vermelho')&&c.tackling==='Cuidadoso')score+=14;
  if(ref.includes('vermelho')&&['Normal','Agressivo'].includes(c.tackling))score-=25;
  if(opp.startsWith('3-')&&c.gamePlan==='Jogar pelas alas')score+=5;
  if(s.opponent.style==='Contra-ataque'&&c.pressure>75)score-=6;
  const hist=similarHistory(s,c);score+=hist.adjustment;return score;
}
function similarHistory(s,c){
  const all=state.slots.flatMap(x=>x.results||[]).filter(r=>r.tactic?.formation===c.formation);
  let points=0;for(const r of all){if(r.gf>r.ga)points+=3;else if(r.gf===r.ga)points+=1}
  if(all.length<2)return {adjustment:0,count:all.length};
  const ppg=points/all.length;return {adjustment:(ppg-1.3)*5,count:all.length};
}
function validateCandidate(c,s){
  const issues=[],ref=String(s.match.refereeColor||'').toLowerCase();
  if(ref.includes('vermelho')&&c.tackling!=='Cuidadoso')issues.push('Desarme incompatível com árbitro vermelho');
  if(c.pressure<0||c.pressure>100||c.mentality<0||c.mentality>100||c.tempo<0||c.tempo>100)issues.push('Slider fora do intervalo');
  if(!FORMATIONS.includes(c.formation))issues.push('Formação inválida');
  return issues;
}
async function generateTactic(n){
  const s=state.slots[n-1];state.selectedSlot=n;calcQuality(s);const missing=missingRequired(s);
  if(missing.length){toast(`Faltam ${missing.length} campos essenciais`);showView('pregame');return}
  job('Simulando candidatos táticos…');try{
    const local=localCandidateTemplates(s).map(c=>({...c,score:candidateScore(c,s)})).filter(c=>!validateCandidate(c,s).length);
    const prompt=`Você é um analista de OSM 26. Gere até 6 candidatos de tática usando APENAS os dados fornecidos. Não invente valores ausentes. O objetivo é maximizar a chance de vitória, mas sem prometer probabilidade. Regras: árbitro Vermelho ou Laranja => prefira desarme Cuidadoso; não use informação NI como se fosse Não; varie formação quando adequado; considere casa/fora, força relativa, rival humano, CT/TS quando conhecidos, formação/plano/marcação/impedimento rival e histórico. Retorne {"candidates":[{"formation":"","gamePlan":"","pressure":0,"mentality":0,"tempo":0,"marking":"À zona","offside":"Não","tackling":"Cuidadoso|Normal|Agressivo","attackInstruction":"","midfieldInstruction":"","defenceInstruction":"","reason":""}]}. Dados=${JSON.stringify({myTeam:s.myTeam,opponent:s.opponent,match:s.match,competitionType:s.competitionType,history:buildLearningSummary(s),localCandidates:local})}`;
    let ai={candidates:[]};try{ai=await geminiJson([{text:prompt}],.12,5000)}catch(e){console.warn('Gemini tactic fallback',e)}
    const candidates=[...local,...(Array.isArray(ai.candidates)?ai.candidates:[])].map(c=>({...c,score:candidateScore(c,s)})).filter(c=>!validateCandidate(c,s).length);
    const unique=[];const seen=new Set();for(const c of candidates){const k=[c.formation,c.gamePlan,c.pressure,c.mentality,c.tempo,c.tackling].join('|');if(!seen.has(k)){seen.add(k);unique.push(c)}}
    unique.sort((a,b)=>b.score-a.score);const best=unique[0];if(!best)throw new Error('Nenhuma tática válida foi gerada');
    const confidence=Math.max(.58,Math.min(.93,.64+(s.analysisQuality/100)*.22+(Math.min(8,unique.length)*.008)));
    s.tactic={...best,confidenceScore:confidence,generatedAt:nowIso(),engine:'V2 multi-candidato',reason:best.reason||buildTacticReason(s,best)};
    s.tacticCandidates=unique.slice(0,8);state.decisionLog.unshift({at:nowIso(),slot:n,type:'tactic',context:{strengthBucket:strengthBucket(s),oppFormation:s.opponent.formation,oppStyle:s.opponent.style,venue:s.match.venue,referee:s.match.refereeColor},selected:clone(s.tactic),candidateCount:unique.length});
    saveState();job(`Tática pronta: ${best.formation} · ${best.gamePlan}`,'done');renderPregame();showView('pregame');
  }catch(e){job(e.message,'error');toast(e.message)}
}
function buildTacticReason(s,t){
  const d=strengthDiff(s),bits=[];if(d!==null)bits.push(d<0?`Seu time está ${Math.abs(d)} ponto(s) abaixo na força`:`Seu time está ${d} ponto(s) acima na força`);
  if(s.match.venue)bits.push(`jogo ${s.match.venue.toLowerCase()}`);if(s.opponent.formation)bits.push(`rival em ${s.opponent.formation}`);if(s.opponent.style)bits.push(`plano rival ${s.opponent.style}`);
  if(s.match.refereeColor)bits.push(`árbitro ${s.match.refereeColor}`);return bits.join('; ')+'.';
}
function buildLearningSummary(s){
  const rows=state.slots.flatMap(x=>x.results||[]);const same=rows.filter(r=>r.context?.oppFormation===s.opponent.formation&&r.context?.strengthBucket===strengthBucket(s));
  return {total:rows.length,similar:same.slice(-12).map(r=>({score:r.score,formation:r.tactic?.formation,plan:r.tactic?.gamePlan}))};
}
window.copyTactic=async function(n){
  const t=state.slots[n-1].tactic;if(!t)return;const text=`${t.formation}\n${t.gamePlan}\nPressão ${t.pressure}\nEstilo ${t.mentality}\nRitmo ${t.tempo}\n${t.marking}\nImpedimento ${t.offside}\nDesarme ${t.tackling}\nATA ${t.attackInstruction}\nMEI ${t.midfieldInstruction}\nDEF ${t.defenceInstruction}`;
  try{await navigator.clipboard.writeText(text);toast('Tática copiada')}catch{openModal(`<h2>Configuração</h2><pre>${esc(text)}</pre>`)}
};
window.whyTactic=function(n){const t=state.slots[n-1].tactic;if(!t)return;openModal(`<h2>Por que esta tática?</h2><div class="reason-box">${esc(t.reason)}</div><p class="small muted">Foram avaliados ${state.slots[n-1].tacticCandidates.length} candidato(s) válidos. A V2 rejeita combinações incoerentes antes de mostrar a recomendação.</p>`)};

function renderMarket(){
  const s=selectedSlot();if(!s||s.status!=='active'){$('marketContent').innerHTML='<div class="card"><p class="muted">Configure o slot primeiro.</p></div>';return}
  const counts=countPositions(s.roster),health={};
  for(const [p,target] of Object.entries(POS_TARGET)){const n=counts[p]||0;health[p]={n,target,status:n===target?'good':n<target?'bad':'warn'}}
  // sempre recalcula para refletir a normalização atual das posições
  const plan=buildMarketPlan(s);
  $('marketContent').innerHTML=`<div class="market-columns"><div class="card"><h3>Saúde do elenco</h3><div class="position-health">${Object.entries(health).map(([p,h])=>`<div class="health ${h.status}"><span>${p}</span><b>${h.n}/${h.target}</b></div>`).join('')}</div><p class="small muted">Regra configurada: 4 ATA · 6 MEI · 6 DEF · 2 GOL. Máximo de 4 jogadores simultaneamente à venda.</p></div>
  <div class="card"><h3>Plano ativo</h3>${plan.actions.length?`<div class="radar-list">${plan.actions.map(a=>`<div class="radar-item"><b>${esc(a)}</b></div>`).join('')}</div>`:'<p class="muted">Envie vídeo do elenco/mercado para gerar recomendações específicas.</p>'}<div class="actions"><button class="btn" onclick="showView('analyze');setAnalysisMode('market')">Ler mercado</button></div></div></div>
  <div class="card" style="margin-top:12px"><h3>Elenco reconhecido</h3>${s.roster.length?rosterTable(s.roster):'<p class="muted">Nenhum jogador reconhecido ainda.</p>'}</div>
  <div class="card" style="margin-top:12px"><h3>Mercado atual</h3>${s.market.length?rosterTable(s.market):'<p class="muted">Nenhuma opção de mercado reconhecida ainda.</p>'}</div>`;
}
function playerPosValue(p){
  if(!p||typeof p!=='object')return '';
  return p.position ?? p.pos ?? p.role ?? p.positionName ?? p.position_name ?? p.type ?? p.category ?? p.line ?? '';
}
function playerNameValue(p){
  if(!p||typeof p!=='object')return '';
  return p.name ?? p.playerName ?? p.player_name ?? p.nome ?? '';
}
function playerRatingValue(p){
  if(!p||typeof p!=='object')return null;
  return p.rating ?? p.overall ?? p.power ?? p.strength ?? p.forca ?? p.força ?? null;
}
function playerAgeValue(p){
  if(!p||typeof p!=='object')return null;
  return p.age ?? p.idade ?? null;
}
function playerMoneyValue(p){
  if(!p||typeof p!=='object')return null;
  return p.price ?? p.value ?? p.marketValue ?? p.market_value ?? p.valor ?? null;
}
function countPositions(rows){
  const c={ATA:0,MEI:0,DEF:0,GOL:0};
  for(const p of (Array.isArray(rows)?rows:[])){
    const x=normalizePos(playerPosValue(p));
    if(c[x]!==undefined)c[x]++;
  }
  return c
}
function normalizePos(p){
  const s=String(p||'').trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^A-Z0-9]/g,'');
  if(!s)return '';

  // Goleiros
  if(['G','GK','GR','GOL','POR'].includes(s) || s.includes('GOLE') || s.includes('KEEPER')) return 'GOL';

  // Defensores — abreviações comuns do OSM/PT
  if(['D','DF','DEF','DC','ZAG','CB','DE','DD','LE','LD','LB','RB','DCE','DCD'].includes(s)
     || s.includes('DEFENSOR') || s.includes('ZAGUEIRO') || s.includes('LATERAL') || s.includes('BACK')) return 'DEF';

  // Meio-campistas
  if(['M','MF','MID','MC','ME','MD','MDC','MCD','MCE','MOC','MO','VOL','CM','CDM','CAM','LM','RM'].includes(s)
     || s.includes('MEIA') || s.includes('MEIO') || s.includes('MIDFIELD') || s.includes('MEDIO') || s.includes('VOLANTE')) return 'MEI';

  // Atacantes / extremos
  if(['A','ATT','FW','FWD','ST','ATA','CA','AC','PE','PD','EE','ED','EI','PL','CF','LW','RW'].includes(s)
     || s.includes('ATAC') || s.includes('FORWARD') || s.includes('STRIKER') || s.includes('PONTA') || s.includes('EXTREMO')) return 'ATA';

  return s
}
function buildMarketPlan(s){
  const roster=Array.isArray(s.roster)?s.roster:[];
  const counts=countPositions(roster),actions=[];
  for(const [p,target] of Object.entries(POS_TARGET)){
    if((counts[p]||0)<target)actions.push(`Prioridade: contratar ${target-(counts[p]||0)} ${p}`);
    else if((counts[p]||0)>target)actions.push(`Há ${(counts[p]||0)-target} ${p} acima da meta; avaliar venda`);
  }
  const selling=roster.filter(p=>p?.forSale===true).length;
  if(selling>4)actions.unshift(`Reduzir lista de vendas: ${selling} jogadores marcados; limite desejado é 4`);
  const classified=Object.values(counts).reduce((a,b)=>a+b,0);
  const unknownPositions=[...new Set(roster.map(p=>String(playerPosValue(p)||'').trim()).filter(pos=>pos && !['ATA','MEI','DEF','GOL'].includes(normalizePos(pos))))];
  const unclassified=Math.max(0,roster.length-classified);
  if(unclassified)actions.unshift(`${unclassified} jogador(es) sem posição reconhecida${unknownPositions.length?`: ${unknownPositions.join(', ')}`:''}`);
  if(!actions.length)actions.push('Distribuição por posição está no alvo; priorize upgrade de força sem quebrar a estrutura');
  s.marketPlan={generatedAt:nowIso(),actions,counts,unclassified};return s.marketPlan;
}
function rosterTable(rows){return `<div style="overflow:auto"><table class="simple-table"><thead><tr><th>Jogador</th><th>Pos.</th><th>Força</th><th>Idade</th><th>Valor/Preço</th><th>Status</th></tr></thead><tbody>${(Array.isArray(rows)?rows:[]).map(p=>`<tr><td>${esc(playerNameValue(p)||'NI')}</td><td>${esc(playerPosValue(p)||'NI')}</td><td>${esc(playerRatingValue(p))}</td><td>${esc(playerAgeValue(p))}</td><td>${esc(playerMoneyValue(p))}</td><td>${p.training===true?'Treino':p.forSale===true?'Venda':'—'}</td></tr>`).join('')}</tbody></table></div>`}

async function analyzeMarketFiles(files){
  const n=Number($('analysisSlot').value)||state.selectedSlot;job('Lendo elenco e mercado…');setProgress(15,'Extraindo mídia…');$('progressWrap').classList.remove('hidden');
  try{
    const parts=[{text:`Analise imagens de OSM 26. Extraia elenco e lista de transferências. Camisa laranja significa TREINAMENTO, nunca venda. Venda é indicada por setas/ícone de transferência. Não invente. Retorne {"roster":[{"name":null,"position":null,"rating":null,"age":null,"value":null,"training":false,"forSale":false}],"market":[{"name":null,"position":null,"rating":null,"age":null,"price":null}]} JSON estrito.`}];
    for(const f of files){if(f.type.startsWith('image/'))parts.push({inlineData:{mimeType:f.type,data:await fileToInline(f)}});else if(f.type.startsWith('video/'))for(const b64 of await videoFrames(f,8))parts.push({inlineData:{mimeType:'image/jpeg',data:b64}})}
    setProgress(65,'Analisando elenco…');const data=await geminiJson(parts,.05,6000);const s=state.slots[n-1];if(Array.isArray(data.roster)&&data.roster.length)s.roster=data.roster;if(Array.isArray(data.market)&&data.market.length)s.market=data.market;s.status='active';s.marketPlan=buildMarketPlan(s);saveState();setProgress(100,'Mercado atualizado');job('Elenco e mercado atualizados.','done');renderMarket();
  }catch(e){job(e.message,'error');toast(e.message)}finally{setTimeout(()=>$('progressWrap').classList.add('hidden'),1000)}
}

function renderLearning(){
  const rows=state.slots.flatMap(s=>(Array.isArray(s.results)?s.results:[]).map(r=>({...r,slotNumber:s.slotNumber})));
  const w=rows.filter(r=>r.gf>r.ga).length,d=rows.filter(r=>r.gf===r.ga).length,l=rows.filter(r=>r.gf<r.ga).length;
  const byForm={};for(const r of rows){const f=r.tactic?.formation||'NI';byForm[f]??={j:0,w:0,d:0,l:0};byForm[f].j++;if(r.gf>r.ga)byForm[f].w++;else if(r.gf===r.ga)byForm[f].d++;else byForm[f].l++}
  $('learningContent').innerHTML=`<div class="card"><div class="kpis"><div class="kpi"><span>Jogos</span><b>${rows.length}</b></div><div class="kpi"><span>Vitórias</span><b>${w}</b></div><div class="kpi"><span>Empates</span><b>${d}</b></div><div class="kpi"><span>Derrotas</span><b>${l}</b></div></div></div>
  <div class="card" style="margin-top:12px"><h3>Por formação usada</h3>${Object.keys(byForm).length?`<table class="simple-table"><tr><th>Formação</th><th>J</th><th>V</th><th>E</th><th>D</th></tr>${Object.entries(byForm).sort((a,b)=>b[1].j-a[1].j).map(([f,x])=>`<tr><td>${esc(f)}</td><td>${x.j}</td><td>${x.w}</td><td>${x.d}</td><td>${x.l}</td></tr>`).join('')}</table>`:'<p class="muted">Ainda não há resultados suficientes.</p>'}</div>
  <div class="card" style="margin-top:12px"><h3>Decisões recentes da IA</h3>${state.decisionLog.slice(0,12).map(x=>`<div class="radar-item"><div><b>Slot ${x.slot} · ${esc(x.selected?.formation)}</b><span>${esc(x.context?.strengthBucket)} · rival ${esc(x.context?.oppFormation)} · ${esc(x.context?.venue)}</span></div><span>${x.candidateCount||0} candidatos</span></div>`).join('')||'<p class="muted">Sem decisões registradas.</p>'}</div>`;
}
function renderHistory(){
  const s=selectedSlot(),rows=s?.results||[];let w=0,d=0,l=0,gf=0,ga=0;for(const r of rows){gf+=Number(r.gf)||0;ga+=Number(r.ga)||0;if(r.gf>r.ga)w++;else if(r.gf===r.ga)d++;else l++}
  $('historyContent').innerHTML=`<div class="card"><div class="kpis"><div class="kpi"><span>J</span><b>${rows.length}</b></div><div class="kpi"><span>V/E/D</span><b>${w}/${d}/${l}</b></div><div class="kpi"><span>Gols</span><b>${gf}-${ga}</b></div><div class="kpi"><span>Slot</span><b>${state.selectedSlot}</b></div></div></div>${rows.slice().reverse().map(r=>`<div class="card" style="margin-top:10px"><div class="market-head"><div><b>${esc(s.teamName)} × ${esc(r.opponent)}</b><div class="small muted">${fmtDate(r.createdAt)} · ${esc(r.context?.venue)}</div></div><span class="status">${esc(r.score)}</span></div><p class="small">Tática: <b>${esc(r.tactic?.formation)} · ${esc(r.tactic?.gamePlan)}</b></p><p class="small muted">Rival: ${esc(r.context?.oppFormation)} · força ${esc(r.context?.myOverall)} × ${esc(r.context?.oppOverall)}</p></div>`).join('')||'<div class="card" style="margin-top:10px"><p class="muted">Nenhum resultado registrado.</p></div>'}`;
}
window.resultModal=function(n){
  const s=state.slots[n-1];if(!s.tactic){toast('Gere uma tática antes de registrar o resultado');return}
  openModal(`<h2>Resultado · Slot ${n}</h2><div class="field-edit"><label>Adversário<input id="rOpp" value="${esc(s.opponent.teamName||'')}"></label><div class="kpis"><label>Meus gols<input id="rGF" type="number" min="0"></label><label>Gols rival<input id="rGA" type="number" min="0"></label></div><label>Observação<textarea id="rNote"></textarea></label><button class="btn" onclick="saveResult(${n})">Salvar resultado</button></div>`);
};
window.saveResult=function(n){
  const s=state.slots[n-1],gf=Number($('rGF').value),ga=Number($('rGA').value);if(!Number.isFinite(gf)||!Number.isFinite(ga)){toast('Informe o placar');return}
  const e={createdAt:nowIso(),opponent:$('rOpp').value.trim()||s.opponent.teamName,gf,ga,score:`${gf}-${ga}`,note:$('rNote').value.trim()||null,tactic:clone(s.tactic),context:{myOverall:s.myTeam.overall,oppOverall:s.opponent.overall,oppFormation:s.opponent.formation,oppStyle:s.opponent.style,venue:s.match.venue,referee:s.match.refereeColor,strengthBucket:strengthBucket(s)}};
  s.results.push(e);s.tactic=null;if(Number.isFinite(Number(s.round)))s.round=Number(s.round)+1;saveState();closeModal();toast('Resultado salvo; aprendizado atualizado');
};

function setAnalysisMode(mode){
  analysisMode=mode;document.querySelectorAll('.mode-card').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  const cfg={
    tactic:['Enviar vídeo ou imagens da partida','Mostre tela inicial, árbitro, forças e Data Analyst. A IA marca qualquer campo que não conseguir ler.'],
    market:['Enviar vídeo do elenco/mercado','Mostre elenco, treinamento e lista de transferências. Camisa laranja = treino; setas = venda.'],
    result:['Enviar vídeo do resultado','A V2 pode extrair o placar; por enquanto, o registro manual continua disponível no Pré-jogo.'],
    calendar:['Enviar vídeo do calendário','Use para capturar próximos jogos e horários; campos não lidos continuarão NI.']
  }[mode];
  $('uploadTitle').textContent=cfg[0];$('uploadHelp').textContent=cfg[1];
}
window.setAnalysisMode=setAnalysisMode;

async function handleFiles(files){
  if(!files.length)return;
  pendingMediaFiles=[...files];
  renderPreview(pendingMediaFiles);
  const totalMb=pendingMediaFiles.reduce((a,f)=>a+(f.size||0),0)/1024/1024;
  $('selectedMediaInfo').textContent=`${pendingMediaFiles.length} arquivo(s) selecionado(s) · ${totalMb.toFixed(1)} MB`;
  $('analyzeNowBtn').disabled=false;
  $('analyzeNowBtn').textContent='🔎 Analisar mídia agora';
  // inicia automaticamente, mas o botão continua disponível como fallback no Android
  if(!analysisBusy){
    setTimeout(()=>runPendingAnalysis(),250);
  }
}
async function runPendingAnalysis(){
  if(analysisBusy)return;
  if(!pendingMediaFiles.length){toast('Escolha uma mídia primeiro');return}
  if(!localStorage.getItem(API_KEY_STORAGE)){apiModal('Configure a API Gemini antes de analisar.');return}
  analysisBusy=true;
  if($('analysisDiagnostics'))$('analysisDiagnostics').textContent='Análise iniciada: extração de quadros → OCR local → Gemini 3.8.';
  $('analyzeNowBtn').disabled=true;
  $('analyzeNowBtn').textContent='Analisando…';
  try{
    if(analysisMode==='market')await analyzeMarketFiles(pendingMediaFiles);
    else if(analysisMode==='tactic')await analyzeFiles(pendingMediaFiles);
    else toast('Este modo será ampliado; use o registro manual por enquanto.');
  }finally{
    analysisBusy=false;
    $('analyzeNowBtn').disabled=false;
    $('analyzeNowBtn').textContent='🔎 Analisar mídia novamente';
  }
}
window.runPendingAnalysis=runPendingAnalysis;
function renderPreview(files){
  $('mediaPreview').innerHTML=files.slice(0,8).map((f,i)=>{const u=URL.createObjectURL(f);return f.type.startsWith('image/')?`<img src="${u}" alt="Imagem ${i+1}">`:`<video src="${u}" muted controls></video>`}).join('');
}

function apiModal(msg=''){
  openModal(`<h2>API Gemini</h2>${msg?`<p class="small" style="color:#ffd36b">${esc(msg)}</p>`:''}<div class="field-edit"><label>Chave da API<input id="apiKeyInput" type="password" value="${esc(localStorage.getItem(API_KEY_STORAGE)||'')}" placeholder="AIza…"></label><p class="small muted">A chave fica armazenada apenas neste navegador, como na versão anterior.</p><button class="btn" onclick="saveApiKey()">Salvar chave</button></div>`);
}
window.saveApiKey=function(){const v=$('apiKeyInput').value.trim();if(v)localStorage.setItem(API_KEY_STORAGE,v);else localStorage.removeItem(API_KEY_STORAGE);closeModal();hydrateSettings();toast(v?'API salva':'API removida')};

function hydrateSettings(){
  $('userNick').value=settings.userNick||'leandrozzy';$('modelSelect').value=settings.model||'gemini-3.8-flash';$('notifyMinutes').value=settings.notifyMinutes||20;$('notifyEnabled').checked=!!settings.notifyEnabled;$('apiBtn').textContent=localStorage.getItem(API_KEY_STORAGE)?'API configurada':'API Gemini';
}
function saveSettingsUi(){settings.userNick=$('userNick').value.trim()||'leandrozzy';settings.model=$('modelSelect').value;settings.notifyMinutes=Math.max(1,Math.min(180,Number($('notifyMinutes').value)||20));settings.notifyEnabled=$('notifyEnabled').checked;saveSettings();toast('Configurações salvas')}
async function requestNotifications(){if(!('Notification'in window)){toast('Notificações não suportadas');return}const p=await Notification.requestPermission();toast(p==='granted'?'Notificações permitidas':'Permissão não concedida')}
function checkNotifications(){
  if(!settings.notifyEnabled||Notification.permission!=='granted')return;
  for(const s of state.slots){if(s.status!=='active'||!s.match.nextMatchAt)continue;const d=new Date(s.match.nextMatchAt).getTime()-Date.now(),target=(settings.notifyMinutes||20)*60000;if(d>0&&d<=target&&!sessionStorage.getItem('notif_'+s.slotNumber+'_'+s.match.nextMatchAt)){new Notification(`OSM · Slot ${s.slotNumber}`,{body:`${s.teamName||'Seu time'} × ${s.opponent.teamName||'adversário'} em ${countdown(s.match.nextMatchAt)}`});sessionStorage.setItem('notif_'+s.slotNumber+'_'+s.match.nextMatchAt,'1')}}
}
function migrateV1(){
  const oldKey=OLD_KEYS.find(k=>localStorage.getItem(k));
  if(oldKey){
    const raw=safeParse(localStorage.getItem(oldKey),null);
    if(raw?.slots){
      importV1State(raw);
      toast('Dados da V1 importados deste navegador');
      return;
    }
  }
  const input=$('v1ImportInput');
  if(input){input.value='';input.click()}
}
function importV1State(raw){
  const src = raw?.state?.slots ? raw.state : (raw?.slots ? raw : (raw?.data?.slots ? raw.data : null));
  if(!src?.slots || !Array.isArray(src.slots)) throw new Error('Backup da V1 não reconhecido');
  state.slots=[1,2,3,4].map(n=>{
    const old=src.slots.find(x=>Number(x?.slotNumber)===n)||{};
    const safeOld={
      ...old,
      slotNumber:n,
      myTeam:(old.myTeam&&typeof old.myTeam==='object')?old.myTeam:{},
      opponent:(old.opponent&&typeof old.opponent==='object')?old.opponent:{},
      match:(old.match&&typeof old.match==='object')?old.match:{},
      roster:Array.isArray(old.roster)?old.roster:[],
      market:Array.isArray(old.market)?old.market:[],
      schedule:Array.isArray(old.schedule)?old.schedule:[],
      results:Array.isArray(old.results)?old.results:[],
      notes:Array.isArray(old.notes)?old.notes:[],
      tacticCandidates:[],
      marketPlan:null
    };
    const s=normalizeSlot(deepMerge(defaultSlot(n),safeOld));
    for(const [p] of FIELD_DEFS){
      const v=getPath(s,p);
      if(hasValue(v)||typeof v==='boolean') s.fieldMeta[p]={source:'manual',confidence:.85,updatedAt:nowIso()};
    }
    calcQuality(s);
    s.marketPlan=buildMarketPlan(s);
    return s;
  });
  state.archives=Array.isArray(src.archives)?src.archives:[];
  if(src.eventIntel && typeof src.eventIntel==='object') state.eventIntel=src.eventIntel;
  state.selectedSlot=1;
  state.decisionLog=Array.isArray(state.decisionLog)?state.decisionLog:[];
  localStorage.setItem(STATE_KEY,JSON.stringify(state));
  renderAll();
}
async function importV1BackupFile(file){
  if(!file) return;
  const obj=JSON.parse(await file.text());
  importV1State(obj);
  toast('Backup da V1 convertido e importado com sucesso');
}
function exportBackup(){
  const blob=new Blob([JSON.stringify({state,settings,exportedAt:nowIso()},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`osm-coach-v2-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)
}
async function importBackup(file){
  const obj=JSON.parse(await file.text());if(!obj?.state?.slots)throw new Error('Backup inválido');state=obj.state;settings={...defaultSettings(),...(obj.settings||{})};saveSettings();saveState();hydrateSettings();toast('Backup importado')
}

function renderAll(){renderSlotSwitcher();renderDashboard();renderPregame();renderMarket();renderLearning();renderHistory();hydrateSettings()}
function bind(){
  document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
  document.querySelectorAll('.mode-card').forEach(b=>b.addEventListener('click',()=>setAnalysisMode(b.dataset.mode)));
  $('apiBtn').onclick=()=>apiModal();$('modalClose').onclick=closeModal;$('modal').addEventListener('click',e=>{if(e.target===$('modal'))closeModal()});
  $('chooseMediaBtn').onclick=()=>$('mediaInput').click();$('mediaInput').onchange=()=>handleFiles([...$('mediaInput').files]);$('analyzeNowBtn').onclick=runPendingAnalysis;$('analysisSlot').onchange=()=>{state.selectedSlot=Number($('analysisSlot').value)||1;localStorage.setItem(STATE_KEY,JSON.stringify(state));renderSlotSwitcher()};
  ['dragenter','dragover'].forEach(ev=>$('uploadZone').addEventListener(ev,e=>{e.preventDefault();$('uploadZone').classList.add('drag')}));
  ['dragleave','drop'].forEach(ev=>$('uploadZone').addEventListener(ev,e=>{e.preventDefault();$('uploadZone').classList.remove('drag')}));
  $('uploadZone').addEventListener('drop',e=>handleFiles([...e.dataTransfer.files]));
  $('refreshBtn').onclick=()=>{renderAll();checkNotifications();toast('Atualizado')};$('saveSettingsBtn').onclick=saveSettingsUi;$('notifyBtn').onclick=requestNotifications;$('migrateBtn').onclick=migrateV1;$('v1ImportInput').onchange=async()=>{try{await importV1BackupFile($('v1ImportInput').files[0])}catch(e){toast(e.message)}};$('exportBtn').onclick=exportBackup;$('importInput').onchange=async()=>{try{await importBackup($('importInput').files[0])}catch(e){toast(e.message)}};
  $('marketAnalyzeBtn').onclick=()=>{const s=selectedSlot();s.marketPlan=buildMarketPlan(s);saveState();renderMarket();toast('Plano recalculado')};
}
document.addEventListener('DOMContentLoaded',()=>{bind();renderAll();setAnalysisMode('tactic');setInterval(checkNotifications,30000);checkNotifications()});
