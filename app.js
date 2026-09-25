'use strict';

const V2_VERSION = '2.2.0';
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
function defaultSettings(){ return {userNick:'leandrozzy',model:'gemini-3.5-flash',notifyMinutes:20,notifyEnabled:true,localOcr:true}; }

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
if(!settings.model || settings.model==='gemini-2.5-flash'){settings.model='gemini-3.5-flash';localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}
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
  if(name==='info') renderInfo();
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
  // "Qualidade da leitura" na V2 significa COBERTURA dos dados.
  // Campo preenchido manualmente vale tanto quanto detectado: se todos os
  // campos monitorados estão confirmados, a cobertura deve chegar a 100%.
  const paths=FIELD_DEFS.map(x=>x[0]);
  let filled=0;
  for(const p of paths){
    const v=getPath(s,p);
    if(hasValue(v) || typeof v==='boolean') filled++;
  }
  s.analysisQuality=paths.length ? Math.round((filled/paths.length)*100) : 0;

  // Confiança média da detecção fica separada e não reduz a cobertura.
  const detected=paths
    .map(p=>s.fieldMeta?.[p])
    .filter(m=>m && m.source==='detected' && Number.isFinite(Number(m.confidence)));
  s.detectionConfidence=detected.length
    ? Math.round(detected.reduce((a,m)=>a+Number(m.confidence||0),0)/detected.length*100)
    : null;

  return s.analysisQuality;
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
    if(s.marketPlan?.actions?.length) rows.push([`Slot ${s.slotNumber}: evolução do elenco`,s.marketPlan.actions[0],'']);
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
      <p class="small muted">${missing.length?`${missing.length} campo(s) essencial(is) sem confirmação.`:`Cobertura dos dados: ${s.analysisQuality}%. ${s.detectionConfidence!==null?`Confiança média da leitura automática: ${s.detectionConfidence}%. `:''}Campos corrigidos manualmente contam como confirmados.`}</p>
      <div class="actions">${missing.length?`<button class="btn" onclick="editAllFields(${s.slotNumber},true)">Resolver campos ausentes</button>`:''}</div>
    </div>
  </div>
  ${fieldAuditHtml(s)}
  ${tacticHtml(s)}`;
}
function ctx(k,v){return `<div class="context-item"><span>${esc(k)}</span><b>${esc(v)}</b></div>`}
function fieldAuditHtml(s){
  const attention=FIELD_DEFS.filter(([p])=>{
    const v=getPath(s,p),m=s.fieldMeta[p]||{source:'unknown',confidence:0};
    return !(hasValue(v)||typeof v==='boolean') || m.source==='unknown' || Number(m.confidence||0)<.6;
  });

  const compactRow=([p,l])=>{
    const v=getPath(s,p),m=s.fieldMeta[p]||{source:'unknown',confidence:0};
    return `<div class="field-row compact-field">
      <div>
        <div class="label">${esc(l)}</div>
        <div class="value">${esc(typeof v==='boolean'?boolLabel(v):v)}</div>
        <div class="meta ${sourceClass(m.source)}">${sourceLabel(m.source)} · ${Math.round((m.confidence||0)*100)}%</div>
      </div>
      <button class="btn ghost tiny" onclick="editField(${s.slotNumber},'${p}')">Editar</button>
    </div>`;
  };

  return `<div class="audit-card compact-audit">
    <div class="audit-top">
      <div>
        <span class="eyebrow">REVISÃO DOS DADOS</span>
        <h3>${attention.length?`${attention.length} campo(s) precisam de atenção`:'Leitura conferida'}</h3>
      </div>
      <button class="btn ghost tiny" onclick="editAllFields(${s.slotNumber})">Editar todos</button>
    </div>
    <p class="small muted"><b>NI = Não identificado.</b> Significa que o app não encontrou esse dado e não vai inventá-lo.</p>
    ${attention.length?`<div class="field-grid attention-grid">${attention.map(compactRow).join('')}</div>`:'<p class="small muted">Nenhum campo problemático no momento.</p>'}
    <details class="all-fields-details">
      <summary>Ver todos os campos (${FIELD_DEFS.length})</summary>
      <div class="field-grid all-fields-grid">${FIELD_DEFS.map(compactRow).join('')}</div>
    </details>
  </div>`;
}

function tacticConfidenceBreakdown(s,t){
  const coverage=calcQuality(s);
  const candidates=Math.max(1,(s.tacticCandidates||[]).length);
  const hist=similarHistory(s,t);
  const unknownCritical=missingRequired(s).length;
  const factors=[];

  factors.push({
    label:'Cobertura dos dados',
    value:`${coverage}%`,
    good:coverage>=90,
    detail:coverage===100?'Todos os campos monitorados estão confirmados.':`${100-coverage}% dos campos monitorados ainda não foram confirmados.`
  });

  factors.push({
    label:'Candidatos válidos',
    value:String(candidates),
    good:candidates>=3,
    detail:`O motor comparou ${candidates} combinação(ões) tática(s) válida(s) antes de escolher esta.`
  });

  factors.push({
    label:'Histórico semelhante',
    value:hist.count?`${hist.count} jogo(s)`:'Sem amostra',
    good:hist.count>=2,
    detail:hist.count>=2?'Há resultados anteriores com contexto/formação semelhante ajudando a decisão.':'O histórico ainda é pequeno; a confiança depende mais dos dados atuais.'
  });

  if(unknownCritical){
    factors.push({label:'Campos essenciais ausentes',value:String(unknownCritical),good:false,detail:'Campos essenciais ausentes reduzem a segurança da recomendação.'});
  }

  return factors;
}
function tacticWhyHtml(s,t){
  const d=strengthDiff(s);
  const bucket=strengthBucket(s);
  const conf=Math.round((t.confidenceScore||.72)*100);
  const factors=tacticConfidenceBreakdown(s,t);

  const formationWhy = d!==null && d<=-12
    ? `A formação ${t.formation} foi escolhida para proteger melhor a equipe porque sua força está ${Math.abs(d)} ponto(s) abaixo da rival.`
    : d!==null && d>=18
      ? `A formação ${t.formation} aproveita sua vantagem de ${d} ponto(s) de força sem abandonar equilíbrio defensivo.`
      : `A formação ${t.formation} foi escolhida para um confronto ${bucket==='equilibrado'?'equilibrado':'de diferença moderada de força'}, buscando equilíbrio entre criação e proteção.`;

  const planWhy = s.opponent.formation || s.opponent.style
    ? `O plano ${t.gamePlan} considera o rival em ${s.opponent.formation||'formação NI'} e ${s.opponent.style||'plano NI'}.`
    : `O plano ${t.gamePlan} foi escolhido com base na força relativa e no local da partida.`;

  const slidersWhy = `Pressão ${t.pressure}, mentalidade ${t.mentality} e ritmo ${t.tempo} trabalham juntos: a pressão define onde recuperar a bola, a mentalidade regula o risco e o ritmo controla a velocidade das ações.`;

  const ref=String(s.match.refereeColor||'').toLowerCase();
  const refWhy = ref
    ? `Com árbitro ${s.match.refereeColor}, o desarme ${t.tackling} reduz o risco disciplinar sem abrir mão da disputa.`
    : `Como o árbitro não foi confirmado, o desarme ${t.tackling} é uma escolha conservadora.`;

  const advancedWhy = `Por setor: ataque "${t.attackInstruction}", meio "${t.midfieldInstruction}" e defesa "${t.defenceInstruction}" foram combinados para sustentar o desenho da formação e o plano de jogo.`;

  return `<div class="why-grid">
    <div class="reason-box"><b>Por que esta formação?</b><br>${esc(formationWhy)}</div>
    <div class="reason-box"><b>Por que este estilo?</b><br>${esc(planWhy)}</div>
    <div class="reason-box"><b>Por que estes sliders?</b><br>${esc(slidersWhy)}</div>
    <div class="reason-box"><b>Árbitro e desarme</b><br>${esc(refWhy)}</div>
    <div class="reason-box"><b>Táticas por setor</b><br>${esc(advancedWhy)}</div>
  </div>
  <div class="confidence-explain">
    <h3>Por que a confiança ficou em ${conf}%?</h3>
    ${factors.map(f=>`<div class="confidence-factor ${f.good?'good':'warn'}"><div><b>${esc(f.label)}</b><span>${esc(f.detail)}</span></div><strong>${esc(f.value)}</strong></div>`).join('')}
    <p class="small muted">Confiança não é probabilidade de vitória. É o quanto os dados disponíveis e o histórico sustentam esta recomendação.</p>
  </div>`;
}

function tacticHtml(s){
  if(!s.tactic) return `<div class="card" style="margin-top:12px"><div class="tactic-head"><div><span class="eyebrow">RECOMENDAÇÃO</span><h3>Tática ainda não gerada</h3></div></div><p class="muted small">A V2 gera vários candidatos internamente, elimina incoerências e mostra apenas o final.</p><div class="actions"><button class="btn" onclick="generateTactic(${s.slotNumber})">Gerar tática</button></div></div>`;
  const t=s.tactic, conf=Math.round((t.confidenceScore||.72)*100);
  const rows=[['Formação',t.formation],['Estilo de jogo',t.gamePlan],['Pressão',t.pressure],['Estilo / Mentalidade',t.mentality],['Temporização / Ritmo',t.tempo],['Marcação',t.marking],['Impedimento',t.offside],['Desarme',t.tackling],['Avançadas – Ataque',t.attackInstruction],['Avançadas – Meio',t.midfieldInstruction],['Avançadas – Defesa',t.defenceInstruction]];
  return `<div class="card" style="margin-top:12px"><div class="tactic-head"><div><span class="eyebrow">TÁTICA FINAL</span><h3>${esc(t.formation)} · ${esc(t.gamePlan)}</h3></div><span class="status ok">Recomendação</span></div>
  <table class="tactic-table">${rows.map(([a,b])=>`<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</table>
  <div class="confidence-bar"><div class="small muted">Confiança da recomendação: ${conf}%</div><div class="confidence-track"><span style="width:${conf}%"></span></div></div>
  <div class="reason-box"><b>Resumo da decisão</b><br>${esc(t.reason||'Tática validada pelo motor V2.')}</div>
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

  // Mesmo comportamento da versão antiga:
  // consulta a lista real da chave e percorre TODOS os modelos disponíveis.
  const candidates=await availableModels(key);
  const ordered=['gemini-3.5-flash',settings.model,...candidates].filter((x,i,a)=>x&&a.indexOf(x)===i);

  let last='';

  for(const model of ordered){
    for(let tryNo=0;tryNo<2;tryNo++){
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
        last=e?.message||String(e);
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

      // Igual à main antiga: 429/500/503 recebem segunda tentativa.
      // Se continuar falhando, passa ao PRÓXIMO modelo disponível.
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

    const pref=[
      'gemini-3.5-flash',
      'gemini-flash-latest',
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.6-flash'
    ];

    return [
      ...pref.filter(x=>names.includes(x)),
      ...names.filter(x=>/flash/i.test(x)&&!pref.includes(x)),
      ...names.filter(x=>!pref.includes(x)&&!/flash/i.test(x))
    ];
  }catch{
    return fallbackModelList();
  }
}

function fallbackModelList(){
  return [
    'gemini-3.5-flash',
    'gemini-flash-latest',
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash'
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
  }catch(e){throw e} finally{setTimeout(()=>$('progressWrap').classList.add('hidden'),1200)}
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
window.whyTactic=function(n){
  const s=state.slots[n-1],t=s?.tactic;
  if(!t)return;
  openModal(`<h2>Por que esta tática?</h2>${tacticWhyHtml(s,t)}`);
};

function renderMarket(){
  const s=selectedSlot();
  if(!s||s.status!=='active'){
    $('marketContent').innerHTML='<div class="card"><p class="muted">Configure o slot primeiro.</p></div>';
    return;
  }

  const counts=countPositions(s.roster),health={};
  for(const [p,target] of Object.entries(POS_TARGET)){
    const n=counts[p]||0;
    health[p]={n,target,status:n===target?'good':n<target?'bad':'warn'};
  }

  const plan=buildMarketPlan(s);
  const projection=plan.targetOverall!==null
    ? `<div class="projection-card"><span>Força/base atual</span><b>${esc(plan.baselineOverall)}</b><span>Meta sugerida</span><b>${esc(plan.targetOverall)}</b><span>Horizonte estimado</span><b>${esc(plan.projectedRounds)} rodada(s)</b></div>`
    : `<p class="muted small">A projeção aparecerá quando houver força geral ou elenco suficiente.</p>`;

  const upgrades=(plan.upgrades||[]).map(u=>`
    <div class="upgrade-card">
      <div><b>${esc(u.position)}</b><span>Mais fraco atual: ${esc(u.weakest)} (${esc(u.weakestRating)})</span></div>
      <strong>Buscar ${esc(u.targetRating)}+</strong>
      <p>${esc(u.profile)}</p>
    </div>`).join('');

  const sells=(plan.sellCandidates||[]).length
    ? `<div class="simple-list">${plan.sellCandidates.map(p=>`<div><b>${esc(p.name)}</b><span>${esc(p.position)} · força ${esc(p.rating)}</span></div>`).join('')}</div>`
    : `<p class="muted small">Nenhuma venda obrigatória pela estrutura atual. Venda deve priorizar upgrade, não apenas reduzir elenco.</p>`;

  $('marketContent').innerHTML=`
  <div class="market-columns">
    <div class="card">
      <h3>Saúde do elenco</h3>
      <div class="position-health">${Object.entries(health).map(([p,h])=>`<div class="health ${h.status}"><span>${p}</span><b>${h.n}/${h.target}</b></div>`).join('')}</div>
      <p class="small muted">Meta: 4 ATA · 6 MEI · 6 DEF · 2 GOL. Máximo de 4 jogadores simultaneamente à venda.</p>
    </div>

    <div class="card">
      <h3>Plano ativo</h3>
      ${plan.actions.length?`<div class="radar-list">${plan.actions.map(a=>`<div class="radar-item"><b>${esc(a)}</b></div>`).join('')}</div>`:'<p class="muted">Sem ações pendentes.</p>'}
      <div class="actions"><button class="btn" onclick="showView('analyze');setAnalysisMode('market')">Ler elenco</button></div>
    </div>
  </div>

  <div class="card" style="margin-top:12px">
    <div class="section-head compact-head"><div><span class="eyebrow">EVOLUÇÃO</span><h3>Plano de crescimento do time</h3></div></div>
    ${projection}
    <h4>Perfis de compra recomendados</h4>
    <div class="upgrade-grid">${upgrades||'<p class="muted">Envie o vídeo completo do elenco para gerar os perfis.</p>'}</div>
    <h4>Possíveis vendas</h4>
    ${sells}
    <p class="small muted">Não é necessário enviar a lista de transferências. O Diretor indica o perfil que você deve procurar quando a lista do OSM atualizar.</p>
  </div>

  <div class="card" style="margin-top:12px"><h3>Elenco reconhecido</h3>${s.roster.length?rosterTable(s.roster):'<p class="muted">Nenhum jogador reconhecido ainda.</p>'}</div>`;
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
  if(['M','MF','MID','MC','ME','MD','MDC','MCD','MCE','MCO','MOC','MO','VOL','CM','CDM','CAM','LM','RM'].includes(s)
     || s.includes('MEIA') || s.includes('MEIO') || s.includes('MIDFIELD') || s.includes('MEDIO') || s.includes('VOLANTE')) return 'MEI';

  // Atacantes / extremos
  if(['A','ATT','FW','FWD','ST','ATA','CA','AC','PE','PD','EE','ED','EI','PL','CF','LW','RW'].includes(s)
     || s.includes('ATAC') || s.includes('FORWARD') || s.includes('STRIKER') || s.includes('PONTA') || s.includes('EXTREMO')) return 'ATA';

  return s
}
function buildMarketPlan(s){
  const roster=Array.isArray(s.roster)?s.roster:[];
  const counts=countPositions(roster);
  const actions=[];
  const upgrades=[];
  const sellCandidates=[];

  const byPos={ATA:[],MEI:[],DEF:[],GOL:[]};
  for(const p of roster){
    const pos=normalizePos(playerPosValue(p));
    const rating=Number(playerRatingValue(p));
    if(byPos[pos] && Number.isFinite(rating)) byPos[pos].push({...p,_rating:rating,_pos:pos});
  }
  for(const arr of Object.values(byPos)) arr.sort((a,b)=>b._rating-a._rating);

  for(const [p,target] of Object.entries(POS_TARGET)){
    const n=counts[p]||0;
    if(n<target) actions.push(`Completar estrutura: falta(m) ${target-n} ${p}.`);
    else if(n>target) actions.push(`${p}: há ${n-target} jogador(es) acima da meta; avaliar venda do(s) mais fraco(s).`);

    const arr=byPos[p]||[];
    if(arr.length){
      const weakest=arr[arr.length-1];
      const strongest=arr[0];
      const desired=Math.max((weakest._rating||0)+8, Math.round((strongest._rating||0)*.9));
      upgrades.push({
        position:p,
        weakest:playerNameValue(weakest)||'NI',
        weakestRating:weakest._rating,
        targetRating:desired,
        profile:`${p} com força ${desired}+; priorizar idade menor e boa relação preço/força`
      });
    }
  }

  const selling=roster.filter(p=>p?.forSale===true).length;
  if(selling>4) actions.unshift(`Há ${selling} jogadores marcados para venda; mantenha no máximo 4 simultaneamente.`);

  // Suggested sell candidates: lowest-rated non-training players, respecting minimum structure.
  for(const [p,target] of Object.entries(POS_TARGET)){
    const arr=(byPos[p]||[]).filter(x=>x.training!==true);
    const excess=Math.max(0,arr.length-target);
    for(let i=0;i<excess;i++){
      const cand=arr[arr.length-1-i];
      if(cand) sellCandidates.push({name:playerNameValue(cand),position:p,rating:cand._rating});
    }
  }

  const allRatings=roster.map(playerRatingValue).map(Number).filter(Number.isFinite);
  const currentAvg=allRatings.length?Math.round(allRatings.reduce((a,b)=>a+b,0)/allRatings.length):null;
  const overall=Number(s.myTeam?.overall);
  const baseline=Number.isFinite(overall)?overall:currentAvg;
  const targetOverall=Number.isFinite(baseline)?Math.max(baseline+8,Math.round(baseline*1.1)):null;
  const projectedRounds=targetOverall&&baseline?Math.max(2,Math.ceil((targetOverall-baseline)/2)):null;

  if(!actions.length) actions.push('Estrutura por posição está completa. O foco passa a ser substituir os jogadores mais fracos por upgrades de força.');

  const unknownPositions=[...new Set(roster.map(p=>String(playerPosValue(p)||'').trim()).filter(pos=>pos && !['ATA','MEI','DEF','GOL'].includes(normalizePos(pos))))];
  const classified=Object.values(counts).reduce((a,b)=>a+b,0);
  const unclassified=Math.max(0,roster.length-classified);
  if(unclassified) actions.unshift(`${unclassified} jogador(es) sem posição reconhecida${unknownPositions.length?`: ${unknownPositions.join(', ')}`:''}.`);

  s.marketPlan={
    generatedAt:nowIso(),
    actions,
    counts,
    unclassified,
    upgrades,
    sellCandidates:sellCandidates.slice(0,4),
    currentAvg,
    baselineOverall:Number.isFinite(baseline)?baseline:null,
    targetOverall,
    projectedRounds
  };
  return s.marketPlan;
}
function rosterTable(rows){return `<div style="overflow:auto"><table class="simple-table"><thead><tr><th>Jogador</th><th>Pos.</th><th>Força</th><th>Idade</th><th>Valor/Preço</th><th>Status</th></tr></thead><tbody>${(Array.isArray(rows)?rows:[]).map(p=>`<tr><td>${esc(playerNameValue(p)||'NI')}</td><td>${esc(playerPosValue(p)||'NI')}</td><td>${esc(playerRatingValue(p))}</td><td>${esc(playerAgeValue(p))}</td><td>${esc(playerMoneyValue(p))}</td><td>${p.training===true?'Treino':p.forSale===true?'Venda':'—'}</td></tr>`).join('')}</tbody></table></div>`}


function countOsmPositionsFromOcr(text){
  const t=String(text||'').toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,' ');
  const tokens=(t.match(/\b(?:GR|GK|DD|DC|DE|MDC|MC|MCO|MD|ME|PL|ED|EE)\b/g)||[]);
  const counts={ATA:0,MEI:0,DEF:0,GOL:0};
  for(const pos of tokens){
    if(['PL','ED','EE'].includes(pos)) counts.ATA++;
    else if(['MDC','MC','MCO','MD','ME'].includes(pos)) counts.MEI++;
    else if(['DD','DC','DE'].includes(pos)) counts.DEF++;
    else if(['GR','GK'].includes(pos)) counts.GOL++;
  }
  return counts;
}
function marketValidation(roster,ocrText){
  const ai=countPositions(Array.isArray(roster)?roster:[]);
  const ocr=countOsmPositionsFromOcr(ocrText);
  const diffs=[];
  for(const p of ['ATA','MEI','DEF','GOL']){
    // OCR only constrains when it saw at least one code for that line.
    if(ocr[p]>0 && ai[p]!==ocr[p]) diffs.push(`${p}: IA ${ai[p]} × OCR ${ocr[p]}`);
  }
  const totalAi=Object.values(ai).reduce((a,b)=>a+b,0);
  const totalOcr=Object.values(ocr).reduce((a,b)=>a+b,0);
  if(totalOcr>=8 && totalAi<totalOcr) diffs.push(`Total: IA ${totalAi} × OCR ${totalOcr}`);
  return {ok:diffs.length===0,ai,ocr,diffs,totalAi,totalOcr};
}

async function analyzeMarketFiles(files){
  const n=Number($('analysisSlot').value)||state.selectedSlot;
  state.selectedSlot=n;
  job('Lendo elenco com OCR local…');
  setProgress(10,'Preparando mídia…');
  $('progressWrap').classList.remove('hidden');

  try{
    const imagePayloads=[];

    for(const f of files){
      if(f.type.startsWith('image/')){
        const b64=await fileToInline(f);
        imagePayloads.push({b64,mimeType:f.type||'image/jpeg'});
      }else if(f.type.startsWith('video/')){
        const frames=await videoFrames(f,8);
        for(const b64 of frames) imagePayloads.push({b64,mimeType:'image/jpeg'});
      }
    }

    setProgress(30,'Executando OCR local no elenco…');
    const ocrText=await buildLocalOcrContext(imagePayloads.map(x=>x.b64));

    const prompt=`Você analisa SOMENTE o MEU ELENCO no OSM 26.
Use as imagens e o OCR local como evidência. NÃO invente jogadores.

REGRAS IMPORTANTES:
- Leia a coluna "Pos" exatamente.
- Códigos válidos:
  GR = goleiro
  DD/DC/DE = defensores
  MDC/MC/MCO/MD/ME = meias
  PL/ED/EE = atacantes
- PL, ED e EE contam como ATA.
- Camisa/ícone laranja = EM TREINAMENTO, não venda.
- Só marque forSale=true quando houver o indicador de venda/setas.
- Extraia TODOS os jogadores visíveis no vídeo, consolidando duplicados.
- Se o vídeo percorre o elenco inteiro, não pare antes do fim.
- Se algo não estiver legível, use null.
- Retorne também observedPositionCounts com a contagem que você efetivamente viu.

OCR LOCAL:
${ocrText}

RETORNE JSON:
{
 "roster":[
   {"name":null,"position":null,"rating":null,"age":null,"value":null,"training":false,"forSale":false}
 ],
 "observedPositionCounts":{"ATA":0,"MEI":0,"DEF":0,"GOL":0}
}`;

    const parts=[{text:prompt}];
    for(const img of imagePayloads){
      parts.push({inlineData:{mimeType:img.mimeType,data:img.b64}});
    }

    setProgress(58,'Interpretando elenco com Gemini…');
    const data=await geminiJson(parts,.03,6500);

    const roster=Array.isArray(data.roster)?data.roster:[];
    const validation=marketValidation(roster,ocrText);

    // If Gemini itself reported counts, cross-check those too.
    const observed=data.observedPositionCounts||{};
    const aiCounts=countPositions(roster);
    const modelDiffs=[];
    for(const p of ['ATA','MEI','DEF','GOL']){
      const x=Number(observed[p]);
      if(Number.isFinite(x) && x>0 && aiCounts[p]!==x){
        modelDiffs.push(`${p}: lista ${aiCounts[p]} × contagem do modelo ${x}`);
      }
    }

    const allDiffs=[...validation.diffs,...modelDiffs];

    if(allDiffs.length){
      const msg=`Leitura incompleta do elenco. ${allDiffs.join(' · ')}`;
      if($('analysisDiagnostics')) $('analysisDiagnostics').textContent=msg;
      setProgress(100,'Leitura incompleta — revisar');
      job(msg,'error');
      // Keep the detected roster for inspection, but do NOT mark as a successful completed analysis.
      const s=state.slots[n-1];
      s.roster=roster;
      s.marketPlan=buildMarketPlan(s);
      saveState();
      renderMarket();
      return;
    }

    const s=state.slots[n-1];
    if(roster.length) s.roster=roster;
    s.status='active';
    s.marketPlan=buildMarketPlan(s);
    s.lastAnalysisAt=nowIso();

    saveState();
    setProgress(100,'Elenco validado e atualizado');
    if($('analysisDiagnostics')){
      $('analysisDiagnostics').textContent=`Elenco validado: ATA ${validation.ai.ATA} · MEI ${validation.ai.MEI} · DEF ${validation.ai.DEF} · GOL ${validation.ai.GOL}.`;
    }
    job('Elenco validado e atualizado.','done');
    renderMarket();

  }catch(e){
    throw e;
  }finally{
    setTimeout(()=>$('progressWrap').classList.add('hidden'),1000);
  }
}


function renderInfo(){
  const s=selectedSlot();
  if(!s){
    $('infoContent').innerHTML='<div class="card"><p class="muted">Nenhum slot selecionado.</p></div>';
    return;
  }

  const cal=Array.isArray(s.schedule)?s.schedule:[];
  const next=cal.filter(x=>!x.played&&!x.skipped).slice().sort((a,b)=>new Date(a.dateTime||'9999')-new Date(b.dateTime||'9999'))[0];

  $('infoContent').innerHTML=`
    <div class="info-grid">
      <div class="card">
        <span class="eyebrow">COMPETIÇÃO</span>
        <h3>${esc(s.competitionName||'Competição NI')}</h3>
        <div class="context-grid">
          ${ctx('Meu time',s.teamName)}
          ${ctx('Tipo',s.competitionType)}
          ${ctx('Rodada',s.round!==null&&s.round!==undefined?`${s.round}${s.totalRounds?`/${s.totalRounds}`:''}`:'NI')}
          ${ctx('Estádio',s.myTeam?.stadium)}
          ${ctx('Bônus login',hasValue(s.myTeam?.loginBonus)?`${s.myTeam.loginBonus}%`:'NI')}
          ${ctx('Próximo jogo',s.match?.nextMatchAt?fmtDate(s.match.nextMatchAt):'NI')}
        </div>
      </div>

      <div class="card">
        <span class="eyebrow">PRÓXIMO ADVERSÁRIO</span>
        <h3>${esc(s.opponent?.teamName||'NI')}</h3>
        <div class="context-grid">
          ${ctx('Local',s.match?.venue)}
          ${ctx('Árbitro',s.match?.refereeColor||s.match?.refereeName)}
          ${ctx('Força',s.opponent?.overall)}
          ${ctx('Humano',boolLabel(s.opponent?.human))}
          ${ctx('Estádio rival',s.opponent?.stadium)}
          ${ctx('Bônus rival',hasValue(s.opponent?.loginBonus)?`${s.opponent.loginBonus}%`:'NI')}
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:12px">
      <div class="section-head compact-head">
        <div><span class="eyebrow">CALENDÁRIO</span><h3>Partidas reconhecidas</h3></div>
        <button class="btn ghost tiny" onclick="showView('analyze');setAnalysisMode('calendar')">Ler calendário</button>
      </div>
      ${cal.length?calendarTableHtml(cal):'<p class="muted">Nenhum calendário analisado ainda.</p>'}
      ${next?`<div class="next-match-note"><b>Próxima partida:</b> ${esc(next.opponent||'NI')} · ${esc(next.venue||'NI')} · ${esc(next.dateTime?fmtDate(next.dateTime):(next.dateText||'Data NI'))}</div>`:''}
    </div>

    <div class="card" style="margin-top:12px">
      <span class="eyebrow">STATUS DO SLOT</span>
      <h3>Dados e histórico</h3>
      <div class="kpis">
        <div class="kpi"><span>Cobertura</span><b>${calcQuality(s)}%</b></div>
        <div class="kpi"><span>Resultados</span><b>${(s.results||[]).length}</b></div>
        <div class="kpi"><span>Jogadores</span><b>${(s.roster||[]).length||'NI'}</b></div>
        <div class="kpi"><span>Última leitura</span><b>${s.lastAnalysisAt?fmtDate(s.lastAnalysisAt):'NI'}</b></div>
      </div>
    </div>`;
}
function calendarTableHtml(rows){
  return `<div class="calendar-wrap"><table class="simple-table calendar-table">
    <thead><tr><th>Rod.</th><th>Tipo</th><th>Local</th><th>Adversário</th><th>Data/hora</th><th>Status</th></tr></thead>
    <tbody>${rows.map(x=>`<tr>
      <td>${esc(x.round)}</td>
      <td>${x.competitionType==='cup'?'🏆 Taça':'Liga'}</td>
      <td>${esc(x.venue)}</td>
      <td>${esc(x.opponent)}</td>
      <td>${esc(x.dateTime?fmtDate(x.dateTime):`${x.dateText||'NI'} ${x.timeText||''}`)}</td>
      <td>${x.played?`Jogado ${esc(x.result||x.outcome||'')}`:x.skipped?'Ignorado':x.conditional?'Condicional':'Futuro'}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}
window.infoEditModal=function(){
  const s=selectedSlot();
  const localDate=s.match?.nextMatchAt
    ? new Date(new Date(s.match.nextMatchAt).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16)
    : '';
  openModal(`<h2>Editar informações · Slot ${s.slotNumber}</h2>
    <div class="field-edit">
      <label>Meu time<input id="iTeam" value="${esc(s.teamName||'')}"></label>
      <label>Competição<input id="iComp" value="${esc(s.competitionName||'')}"></label>
      <label>Tipo
        <select id="iType"><option>Liga normal</option><option>Batalha</option><option>Copa</option><option>Torneio</option></select>
      </label>
      <div class="kpis">
        <label>Rodada<input id="iRound" type="number" value="${esc(s.round??'')}"></label>
        <label>Total de rodadas<input id="iTotal" type="number" value="${esc(s.totalRounds??'')}"></label>
      </div>
      <div class="kpis">
        <label>Estádio<input id="iStadium" type="number" min="0" value="${esc(s.myTeam?.stadium??'')}"></label>
        <label>Bônus login (%)<input id="iBonus" type="number" min="0" max="20" value="${esc(s.myTeam?.loginBonus??'')}"></label>
      </div>
      <label>Próximo jogo<input id="iNext" type="datetime-local" value="${localDate}"></label>
      <button class="btn" onclick="saveInfoEdit()">Salvar informações</button>
    </div>`);
  $('iType').value=s.competitionType||'Liga normal';
};
window.saveInfoEdit=function(){
  const s=selectedSlot();
  s.status='active';
  s.teamName=$('iTeam').value.trim()||null;
  s.competitionName=$('iComp').value.trim()||null;
  s.competitionType=$('iType').value||null;
  s.round=$('iRound').value?Number($('iRound').value):null;
  s.totalRounds=$('iTotal').value?Number($('iTotal').value):null;
  s.myTeam.stadium=$('iStadium').value?Number($('iStadium').value):null;
  s.myTeam.loginBonus=$('iBonus').value?Number($('iBonus').value):null;
  s.match.nextMatchAt=$('iNext').value?new Date($('iNext').value).toISOString():null;
  setField(s,'teamName',s.teamName,'manual',1);
  saveState();
  closeModal();
  renderInfo();
  toast('Informações atualizadas');
};

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


/* =========================================================
   V2.1 ENGINE — base de leitura da MAIN + recursos da V2
   ========================================================= */

function v21NormText(s){
  return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
function v21FileToDataUrl(file){
  return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)});
}
function v21LoadImage(src){
  return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src});
}
function v21SeekVideo(v,t){
  return new Promise(res=>{
    let done=false;
    const finish=()=>{if(done)return;done=true;v.removeEventListener('seeked',finish);res()};
    v.addEventListener('seeked',finish,{once:true});
    v.currentTime=t;
    setTimeout(finish,900);
  });
}
function v21CaptureVideoFrame(v,t,name){
  const maxW=1280,scale=Math.min(1,maxW/(v.videoWidth||maxW));
  const w=Math.max(320,Math.round((v.videoWidth||1280)*scale));
  const h=Math.max(180,Math.round((v.videoHeight||720)*scale));
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const x=c.getContext('2d');x.drawImage(v,0,0,w,h);
  const dataUrl=c.toDataURL('image/jpeg',.82);

  const tw=96,th=54,tc=document.createElement('canvas');tc.width=tw;tc.height=th;
  const tx=tc.getContext('2d');tx.drawImage(v,0,0,tw,th);
  const data=tx.getImageData(0,0,tw,th).data;
  const thumb=new Uint8Array(tw*th),hist=new Uint16Array(16);

  let bright=0,sat=0,leftWhite=0,leftN=0,bottomWhite=0,bottomN=0,rightBlue=0,rightGreen=0,rightN=0,dark=0;
  for(let py=0;py<th;py++)for(let px=0;px<tw;px++){
    const j=py*tw+px,i=j*4,r=data[i],g=data[i+1],b=data[i+2],gray=Math.round((r+g+b)/3);
    thumb[j]=gray;hist[Math.min(15,Math.floor(gray/16))]++;bright+=gray;
    const mx=Math.max(r,g,b),mn=Math.min(r,g,b);sat+=mx-mn;if(gray<75)dark++;
    if(px<tw*.42){leftN++;if(r>190&&g>190&&b>190)leftWhite++}
    if(py>th*.48){bottomN++;if(r>185&&g>185&&b>185)bottomWhite++}
    if(px>tw*.42){rightN++;if(b>115&&b>r*1.18&&b>g*.92)rightBlue++;if(g>95&&g>r*1.18&&g>b*.82)rightGreen++}
  }
  const count=tw*th;
  return {
    dataUrl,base64:dataUrl.split(',')[1],mimeType:'image/jpeg',time:t,name,thumb,hist,
    brightness:bright/count,saturation:sat/count,score:0,
    layout:{
      leftWhite:leftN?leftWhite/leftN:0,
      bottomWhite:bottomN?bottomWhite/bottomN:0,
      rightBlue:rightN?rightBlue/rightN:0,
      rightGreen:rightN?rightGreen/rightN:0,
      dark:dark/count
    }
  };
}
function v21CanvasFrameFromImage(img,t,name){
  const maxW=1280,scale=Math.min(1,maxW/img.naturalWidth);
  const w=Math.round(img.naturalWidth*scale),h=Math.round(img.naturalHeight*scale);
  const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);
  const dataUrl=c.toDataURL('image/jpeg',.82);
  return {dataUrl,base64:dataUrl.split(',')[1],mimeType:'image/jpeg',time:t,name,score:100,brightness:160,saturation:30,layout:{}};
}
function v21PixelDiff(a,b){
  if(!a||!b||a.length!==b.length)return 100;
  let s=0;for(let i=0;i<a.length;i++)s+=Math.abs(a[i]-b[i]);return s/a.length;
}
function v21HistDiff(a,b){
  if(!a||!b)return 100;
  let s=0,tot=0;for(let i=0;i<a.length;i++){s+=Math.abs(a[i]-b[i]);tot+=Math.max(a[i],b[i])}
  return tot?100*s/tot:0;
}
function v21FrameDistance(a,b){
  if(!a||!b)return 100;
  const p=v21PixelDiff(a.thumb,b.thumb),h=v21HistDiff(a.hist,b.hist);
  const br=Math.abs((a.brightness||0)-(b.brightness||0)),st=Math.abs((a.saturation||0)-(b.saturation||0));
  return p*.58+h*.22+br*.12+st*.08;
}
function v21ScenePriority(f){
  let p=f.score||0;
  if((f.brightness||0)>135)p+=12;
  if((f.saturation||0)<45)p+=8;
  return p;
}
function v21ChooseDiverseFrames(frames,max){
  if(frames.length<=max)return [...frames].sort((a,b)=>(a.time||0)-(b.time||0));
  const sorted=[...frames].sort((a,b)=>(a.time||0)-(b.time||0)),picked=[];
  const bins=Math.min(max,12),dur=(sorted.at(-1)?.time||1)-(sorted[0]?.time||0)||1;
  for(let b=0;b<bins;b++){
    const lo=(sorted[0]?.time||0)+dur*b/bins,hi=(sorted[0]?.time||0)+dur*(b+1)/bins;
    const group=sorted.filter(f=>(f.time||0)>=lo&&(f.time||0)<=hi);
    if(!group.length)continue;
    const best=[...group].sort((a,b)=>v21ScenePriority(b)-v21ScenePriority(a))[0];
    if(best&&!picked.includes(best))picked.push(best);
  }
  while(picked.length<max){
    let best=null,bestScore=-1;
    for(const f of sorted){
      if(picked.includes(f))continue;
      const minD=picked.length?Math.min(...picked.map(p=>v21FrameDistance(f,p))):100;
      const score=minD+v21ScenePriority(f)*.18;
      if(score>bestScore){best=f;bestScore=score}
    }
    if(!best)break;
    if(picked.length>=4&&Math.min(...picked.map(p=>v21FrameDistance(best,p)))<7)break;
    picked.push(best);
  }
  return picked.sort((a,b)=>(a.time||0)-(b.time||0)).slice(0,max);
}
async function v21ExtractVideoFrames(file,maxFrames=20){
  const url=URL.createObjectURL(file),v=document.createElement('video');
  v.src=url;v.muted=true;v.playsInline=true;v.preload='metadata';
  await new Promise((res,rej)=>{v.onloadedmetadata=res;v.onerror=()=>rej(new Error(`Não consegui abrir ${file.name}`))});
  const dur=Math.max(.2,v.duration||1),times=[];
  for(let i=0;i<maxFrames;i++)times.push(Math.min(dur-.08,Math.max(.08,(dur*(i+.5))/maxFrames)));
  const frames=[];let prev=null;
  for(const t of times){
    await v21SeekVideo(v,t);
    const f=v21CaptureVideoFrame(v,t,file.name),d=prev?v21PixelDiff(prev,f.thumb):100;
    prev=f.thumb;f.score=d;
    if(d>=3||frames.length<3)frames.push(f);
  }
  URL.revokeObjectURL(url);
  return v21ChooseDiverseFrames(frames,maxFrames);
}
async function v21ImageToFrame(file){
  const data=await v21FileToDataUrl(file),img=await v21LoadImage(data);
  return v21CanvasFrameFromImage(img,0,file.name);
}
async function v21RunLocalOcr(frames){
  if(!window.Tesseract)throw new Error('OCR local não carregou. Recarregue a página e tente novamente.');
  const results=[];let worker=null;
  try{
    worker=await Tesseract.createWorker('por+eng',1,{logger:m=>{
      if(m.status==='recognizing text'&&m.progress)setProgress(20+Math.round(m.progress*28),`OCR local ${Math.round(m.progress*100)}%…`);
    }});
  }catch{
    worker=await Tesseract.createWorker('eng',1,{logger:m=>{
      if(m.status==='recognizing text'&&m.progress)setProgress(20+Math.round(m.progress*28),`OCR local ${Math.round(m.progress*100)}%…`);
    }});
  }
  try{
    for(let i=0;i<frames.length;i++){
      setProgress(22+Math.round((i/Math.max(1,frames.length))*26),`OCR quadro ${i+1}/${frames.length}…`);
      const {data}=await worker.recognize(frames[i].dataUrl);
      const text=String(data?.text||'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
      if(text.length>5)results.push({frame:i+1,time:Math.round(frames[i].time||0),text});
    }
  }finally{if(worker)await worker.terminate()}
  return {mode:analysisMode,frames:results,joined:results.map(x=>`[Quadro ${x.frame} ~${x.time}s]\n${x.text}`).join('\n\n')};
}
function v21SelectVisualEvidence(frames,n=3){
  if(!frames.length)return [];
  const ranked=[...frames].sort((a,b)=>(b.score||0)-(a.score||0)),out=[];
  for(const f of ranked){
    if(out.length>=n)break;
    if(!out.some(x=>Math.abs((x.time||0)-(f.time||0))<1.2))out.push(f);
  }
  return out;
}
function v21BuildFrameClassification(text,frame,slot){
  const t=v21NormText(text),myName=v21NormText(slot?.teamName),oppName=v21NormText(slot?.opponent?.teamName),nick=v21NormText(settings.userNick||''),l=frame?.layout||{};
  const score={match_overview:0,my_squad:0,opponent_squad:0,analyst_summary:0,analyst_marking:0,analyst_formation:0};
  if(t.includes('vs'))score.match_overview+=5;
  if(t.includes('arbitro'))score.match_overview+=6;
  if(t.includes('jornada'))score.match_overview+=4;
  if((l.dark||0)>.38)score.match_overview+=2;
  const squadBase=(l.bottomWhite||0)>.32?5:0;
  if(squadBase){score.my_squad+=squadBase;score.opponent_squad+=squadBase}
  if(t.includes('posicao')||t.includes('objetivo')||t.includes('jogador')||t.includes('idade')||t.includes('valor')){score.my_squad+=2;score.opponent_squad+=2}
  if(nick&&t.includes(nick)){score.my_squad+=12;score.opponent_squad-=8}
  if(myName&&t.includes(myName)){score.my_squad+=8;score.opponent_squad-=5}
  if(oppName&&t.includes(oppName)){score.opponent_squad+=10;score.my_squad-=4}
  const analystLayout=(l.leftWhite||0)>.34?5:0;
  if(analystLayout){score.analyst_summary+=5;score.analyst_marking+=2;score.analyst_formation+=2}
  if(t.includes('pelo que pude ver')||t.includes('tenho a certeza')||t.includes('nivel do estadio'))score.analyst_summary+=10;
  if(t.includes('marcacao')||t.includes('fora-de-jogo')||t.includes('fora de jogo')||t.includes('homem-a-homem')||t.includes('a zona'))score.analyst_marking+=10;
  if((l.rightBlue||0)>.1)score.analyst_marking+=3;
  if(t.includes('formacao:')||t.includes('formação:')||t.includes('suplentes')||t.includes('tatica'))score.analyst_formation+=10;
  if((l.rightGreen||0)>.12)score.analyst_formation+=4;
  return score;
}
function v21SelectRequiredTacticFrames(frames,ocr){
  const slot=selectedSlot();
  const enriched=(ocr.frames||[]).map(o=>{
    const frame=frames[(o.frame||1)-1];
    return {...o,frame,scores:v21BuildFrameClassification(o.text,frame,slot)};
  }).filter(x=>x.frame);

  const pick=(key,min=4,exclude=[])=>{
    const b=[...enriched]
      .filter(x=>!exclude.includes(x.frame))
      .sort((a,b)=>(b.scores[key]||0)-(a.scores[key]||0))[0];
    return b&&(b.scores[key]||0)>=min?b:null;
  };

  const match=pick('match_overview',4);
  const mine=pick('my_squad',4);
  const opp=pick('opponent_squad',4,mine?[mine.frame]:[]);

  // Analista: thresholds mais tolerantes porque o OCR pode não ler os rótulos,
  // mas o layout visual ainda mostra claramente as telas.
  let summary=pick('analyst_summary',3);
  let mark=pick('analyst_marking',3);
  let form=pick('analyst_formation',3);

  // Fallback visual: pega quadros com layout típico do Data Analyst
  // quando a classificação textual falha.
  const used=new Set([match?.frame,mine?.frame,opp?.frame,summary?.frame,mark?.frame,form?.frame].filter(Boolean));
  const analystCandidates=[...enriched]
    .filter(x=>!used.has(x.frame))
    .map(x=>{
      const l=x.frame?.layout||{};
      const visual=(l.leftWhite||0)*12+(l.rightBlue||0)*9+(l.rightGreen||0)*9;
      const textScore=Math.max(x.scores.analyst_summary||0,x.scores.analyst_marking||0,x.scores.analyst_formation||0);
      return {...x,_analystScore:visual+textScore};
    })
    .sort((a,b)=>b._analystScore-a._analystScore);

  const takeFallback=()=>{
    const x=analystCandidates.shift();
    if(x){used.add(x.frame);return x}
    return null;
  };

  if(!summary) summary=takeFallback();
  if(!mark) mark=takeFallback();
  if(!form) form=takeFallback();

  const defs=[
    ['match_overview','Tela da partida',match],
    ['my_squad','Meu elenco',mine],
    ['opponent_squad','Elenco rival',opp],
    ['analyst_summary','Analista resumo',summary],
    ['analyst_marking','Analista marcação',mark],
    ['analyst_formation','Analista formação',form]
  ];

  const result=defs.map(([key,label,b])=>b
    ?{type:key,label,frame:b.frame,text:b.text,score:b.scores?.[key]??b._analystScore??0}
    :{type:key,label,frame:null,text:null,score:0}
  );

  ocr.required=result.reduce((a,x)=>{a[x.type]=x.text||null;return a},{});
  ocr.missingRequired=result.filter(x=>!x.frame).map(x=>x.label);
  return result;
}
function v21Prompt(ocr,mode){
  const s=selectedSlot();
  const base=`Você é um extrator especialista no OSM 26 Android.
Meu usuário é "${settings.userNick||'leandrozzy'}". Quando esse nick aparecer, aquele lado é SEMPRE meu time.
Nunca inverta minha força com a força rival. Nunca invente valor ausente. Use null quando não souber.
OCR LOCAL:
${ocr.joined}

DADOS SALVOS DO SLOT (só apoio, não contradiga o vídeo):
${JSON.stringify({teamName:s.teamName,myTeam:s.myTeam,opponent:s.opponent,match:s.match,competitionType:s.competitionType,round:s.round})}
`;

  if(mode==='tactic')return base+`
O app separou as telas obrigatórias. Algumas podem ter classificação local incerta; confirme visualmente nas imagens enviadas antes de concluir que faltam:
${JSON.stringify(ocr.required||{},null,2)}
Ausentes:
${JSON.stringify(ocr.missingRequired||[])}

Extraia meu time, rival, casa/fora, árbitro, força geral, GOL/DEF/MEI/ATA, estádio, humano/CPU, bônus,
campo de treinamento, treino secreto, formação rival, plano rival, marcação rival e impedimento.
Humano=true somente se houver nick/manager visível abaixo do adversário.
Se treino secreto impedir análise rival, mantenha os campos secretos null.

Gere também UMA tática final completa.
Árbitro vermelho/laranja: desarme Cuidadoso.
Retorne somente:
{"capture":{"teamName":null,"competitionName":null,"competitionType":null,"round":null,"totalRounds":null,
"myTeam":{"overall":null,"goalkeeper":null,"defence":null,"midfield":null,"attack":null,"squadValue":null,"playerCount":null,"stadium":null,"loginBonus":null,"secretTraining":null,"trainingCamp":null},
"opponent":{"teamName":null,"human":null,"manager":null,"overall":null,"goalkeeper":null,"defence":null,"midfield":null,"attack":null,"squadValue":null,"playerCount":null,"stadium":null,"loginBonus":null,"secretTraining":null,"trainingCamp":null,"formation":null,"style":null,"marking":null,"offside":null},
"match":{"venue":null,"refereeName":null,"refereeColor":null,"exactDateTimeText":null,"countdownText":null},
"recommendedTactic":{"formation":"","gamePlan":"","pressure":0,"mentality":0,"tempo":0,"marking":"À zona","offside":"Não","tackling":"Normal","attackInstruction":"","midfieldInstruction":"","defenceInstruction":"","reason":""}}}`;

  if(mode==='market')return base+`
Analise SOMENTE MEU ELENCO mostrado no vídeo.
Extraia TODOS os jogadores visíveis ao longo da rolagem.
Leia EXATAMENTE a coluna Pos. Códigos do OSM:
GR = goleiro; DD/DC/DE = defensores; MDC/MC/MCO/MD/ME = meias; PL/ED/EE = atacantes.
Camisa laranja = em treinamento, NÃO venda.
Venda somente quando houver setas/indicador real de transferência.
Não invente jogador.
Retorne somente:
{"roster":[{"name":"","position":null,"rating":null,"value":null,"age":null,"training":false,"forSale":false}],
"myTeam":{"squadValue":null,"playerCount":null}}`;

  if(mode==='calendar')return base+`
Analise SOMENTE o calendário.
Casinha à esquerda = Casa; sem casinha = Fora.
Taça/troféu = Copa/Taça.
V/D/E ou placar = partida já jogada.
Extraia futuras e já jogadas.
Retorne somente:
{"matches":[{"round":null,"opponent":null,"competitionType":"league|cup|null","venue":"Casa|Fora|null","dateText":null,"timeText":null,"dateTime":null,"result":null,"outcome":"V|D|E|null","played":false,"conditional":false}]}`;

  return base+`
Analise SOMENTE o resultado final.
Extraia placar, formação final dos dois times, remates, posse, cantos, faltas, amarelos e vermelhos de cada time.
Não invente.
Retorne somente:
{"teamName":null,"opponent":null,"gf":null,"ga":null,"score":null,"myFormation":null,"oppFormation":null,
"stats":{"myShots":null,"oppShots":null,"myPossession":null,"oppPossession":null,"myCorners":null,"oppCorners":null,"myFouls":null,"oppFouls":null,"myYellowCards":null,"oppYellowCards":null,"myRedCards":null,"oppRedCards":null},
"events":[]}`;
}
async function v21AnalyzePackage(ocr,evidence,mode){
  const parts=[{text:v21Prompt(ocr,mode)}];
  for(const f of evidence)parts.push({inlineData:{mimeType:f.mimeType,data:f.base64}});
  return geminiJson(parts,.03,mode==='tactic'?8500:7000);
}
function v21MergeNonNull(old,nw){
  const out={...(old||{})};
  for(const [k,v] of Object.entries(nw||{}))if(v!==null&&v!==undefined&&v!=='')out[k]=v;
  return out;
}
function v21ApplyCapture(c){
  const s=selectedSlot(),confidence=.88;
  s.status='active';
  for(const k of ['teamName','competitionName','competitionType','round','totalRounds'])if(c?.[k]!==null&&c?.[k]!==undefined&&c?.[k]!=='')s[k]=c[k];
  s.myTeam=v21MergeNonNull(s.myTeam,c?.myTeam||{});
  s.opponent=v21MergeNonNull(s.opponent,c?.opponent||{});
  s.match=v21MergeNonNull(s.match,c?.match||{});

  const map=[
    ['teamName','teamName'],['opponent.teamName','opponent.teamName'],['match.venue','match.venue'],['match.refereeColor','match.refereeColor'],
    ['myTeam.overall','myTeam.overall'],['opponent.overall','opponent.overall'],
    ['myTeam.goalkeeper','myTeam.goalkeeper'],['myTeam.defence','myTeam.defence'],['myTeam.midfield','myTeam.midfield'],['myTeam.attack','myTeam.attack'],
    ['opponent.goalkeeper','opponent.goalkeeper'],['opponent.defence','opponent.defence'],['opponent.midfield','opponent.midfield'],['opponent.attack','opponent.attack'],
    ['opponent.human','opponent.human'],['opponent.manager','opponent.manager'],['opponent.loginBonus','opponent.loginBonus'],['opponent.stadium','opponent.stadium'],
    ['opponent.trainingCamp','opponent.trainingCamp'],['opponent.secretTraining','opponent.secretTraining'],
    ['opponent.formation','opponent.formation'],['opponent.style','opponent.style'],['opponent.marking','opponent.marking'],['opponent.offside','opponent.offside']
  ];
  for(const [path] of map){
    const v=getPath(s,path);
    if(hasValue(v)||typeof v==='boolean')s.fieldMeta[path]={source:'detected',confidence,updatedAt:nowIso()};
  }
  s.lastAnalysisAt=nowIso();
  calcQuality(s);

  if(c?.recommendedTactic){
    const t=c.recommendedTactic;
    s.tactic={
      formation:t.formation||null,gamePlan:t.gamePlan==='Chutar de longe'?'Remate à vista':t.gamePlan,
      pressure:Number(t.pressure),mentality:Number(t.mentality),tempo:Number(t.tempo),
      marking:t.marking||'À zona',offside:t.offside||'Não',
      tackling:t.tackling||'Normal',
      attackInstruction:t.attackInstruction||'Atacar apenas',
      midfieldInstruction:t.midfieldInstruction||'Manter posição',
      defenceInstruction:t.defenceInstruction||'Defender atrás',
      reason:t.reason||'Gerada a partir da leitura da partida.',
      confidenceScore:Math.max(.62,Math.min(.93,(s.analysisQuality||70)/100)),
      generatedAt:nowIso(),engine:'V1 Engine + V2'
    };
  }
}
function v21ApplyRoster(data){
  const s=selectedSlot(),roster=Array.isArray(data?.roster)?data.roster:[];
  if(roster.length)s.roster=roster;
  if(data?.myTeam)s.myTeam=v21MergeNonNull(s.myTeam,data.myTeam);
  s.status='active';s.lastAnalysisAt=nowIso();s.marketPlan=buildMarketPlan(s);
}
function v21ApplyCalendar(data){
  const s=selectedSlot(),rows=Array.isArray(data?.matches)?data.matches:[];
  s.schedule=rows.map(x=>({...x,skipped:false}));
  const future=s.schedule.filter(x=>!x.played&&x.dateTime).sort((a,b)=>new Date(a.dateTime)-new Date(b.dateTime))[0];
  if(future){
    s.match.nextMatchAt=future.dateTime||s.match.nextMatchAt;
    s.match.venue=future.venue||s.match.venue;
    s.opponent.teamName=future.opponent||s.opponent.teamName;
  }
  s.lastAnalysisAt=nowIso();
}
function v21ApplyResult(r){
  const s=selectedSlot(),gf=Number(r?.gf),ga=Number(r?.ga);
  if(!Number.isFinite(gf)||!Number.isFinite(ga))throw new Error('Não consegui identificar o placar final.');
  s.results.push({
    createdAt:nowIso(),opponent:r.opponent||s.opponent.teamName,gf,ga,score:r.score||`${gf}-${ga}`,
    tactic:s.tactic?clone(s.tactic):null,stats:r.stats||{},events:r.events||[],
    context:{myOverall:s.myTeam.overall,oppOverall:s.opponent.overall,oppFormation:r.oppFormation||s.opponent.formation,myFormation:r.myFormation||s.tactic?.formation||null,oppStyle:s.opponent.style,venue:s.match.venue,referee:s.match.refereeColor,strengthBucket:strengthBucket(s)}
  });
  s.tactic=null;
  if(Number.isFinite(Number(s.round)))s.round=Number(s.round)+1;
}
function v21RenderEvidence(frames){
  $('mediaPreview').innerHTML=frames.slice(0,12).map(f=>`<img src="${f.dataUrl}" alt="Quadro ${Math.round(f.time||0)}s">`).join('');
}
async function v21Analyze(files){
  const n=Number($('analysisSlot').value)||state.selectedSlot;
  state.selectedSlot=n;
  const video=files.find(f=>f.type.startsWith('video/'));
  const images=files.filter(f=>f.type.startsWith('image/'));
  let frames=[];

  setProgress(5,'Selecionando quadros importantes…');

  if(video){
    frames=await v21ExtractVideoFrames(video,analysisMode==='tactic'?18:20);
  }else if(images.length){
    for(const f of images)frames.push(await v21ImageToFrame(f));
  }else{
    throw new Error('Selecione um vídeo ou imagens do OSM.');
  }

  v21RenderEvidence(frames);
  setProgress(18,'Lendo texto localmente com OCR…');
  const ocr=await v21RunLocalOcr(frames);

  let evidence,result;

  if(analysisMode==='tactic'){
    const selected=v21SelectRequiredTacticFrames(frames,ocr);
    const missing=selected.filter(x=>!x.frame).map(x=>x.label);

    // Só bloqueia se faltar uma das 3 bases realmente essenciais.
    const criticalMissing=selected
      .filter(x=>['match_overview','my_squad','opponent_squad'].includes(x.type) && !x.frame)
      .map(x=>x.label);

    if(criticalMissing.length){
      throw new Error(`Faltaram telas essenciais: ${criticalMissing.join(', ')}. Grave novamente mostrando a partida e os dois elencos.`);
    }

    evidence=selected.filter(x=>x.frame).map(x=>x.frame);

    // Se algum quadro do Analista ainda não foi classificado, complementa com
    // os quadros visualmente mais diferentes do vídeo, como fazia a base antiga.
    if(missing.length){
      const extras=v21SelectVisualEvidence(frames,6)
        .filter(f=>!evidence.includes(f));
      for(const f of extras){
        if(evidence.length>=8)break;
        evidence.push(f);
      }
      if($('analysisDiagnostics')){
        $('analysisDiagnostics').textContent=`Algumas telas tiveram classificação incerta (${missing.join(', ')}), mas a análise continuará usando os quadros visuais do vídeo.`;
      }
    }

    setProgress(58,'Analisando partida com o motor da V1…');
    result=await v21AnalyzePackage(ocr,evidence,'tactic');
    v21ApplyCapture(result.capture||result.captures?.[0]||result);
    saveState();
    renderCoverage(selectedSlot());
    renderAnalysisSummary(selectedSlot());
    renderPregame();
    if($('autoTactic').checked && !selectedSlot().tactic)await generateTactic(n);
    setProgress(100,'Partida analisada');
    job('Partida analisada com o motor da V1 e recursos da V2.','done');
    return;
  }

  if(analysisMode==='market'){
    evidence=v21SelectVisualEvidence(frames,3);
    setProgress(58,'Lendo elenco com o motor da V1…');
    result=await v21AnalyzePackage(ocr,evidence,'market');
    v21ApplyRoster(result);
    saveState();
    renderMarket();
    $('analysisContent').innerHTML=`<div class="card" style="margin-top:12px"><h3>Elenco atualizado</h3><p class="muted small">${selectedSlot().roster.length} jogador(es) reconhecido(s).</p></div>`;
    setProgress(100,'Elenco atualizado');
    job('Elenco atualizado.','done');
    return;
  }

  if(analysisMode==='calendar'){
    evidence=v21SelectVisualEvidence(frames,5);
    setProgress(58,'Lendo calendário com o motor da V1…');
    result=await v21AnalyzePackage(ocr,evidence,'calendar');
    v21ApplyCalendar(result);
    saveState();
    $('analysisContent').innerHTML=`<div class="card" style="margin-top:12px"><h3>Calendário atualizado</h3><p class="muted small">${selectedSlot().schedule.length} partida(s) reconhecida(s).</p><div class="actions"><button class="btn" onclick="showView('info')">Ver calendário e informações</button></div></div>`;
    renderInfo();
    setProgress(100,'Calendário atualizado');
    job('Calendário atualizado.','done');
    return;
  }

  evidence=v21SelectVisualEvidence(frames,6);
  setProgress(58,'Lendo resultado com o motor da V1…');
  result=await v21AnalyzePackage(ocr,evidence,'result');
  v21ApplyResult(result);
  saveState();
  renderHistory();
  $('analysisContent').innerHTML=`<div class="card" style="margin-top:12px"><h3>Resultado registrado</h3><p class="muted small">${esc(result.score||`${result.gf}-${result.ga}`)} salvo no histórico e aprendizado.</p></div>`;
  setProgress(100,'Resultado registrado');
  job('Resultado registrado e aprendizado atualizado.','done');
}

function setAnalysisMode(mode){
  analysisMode=mode;
  pendingMediaFiles=[];
  analysisBusy=false;
  if($('mediaInput')) $('mediaInput').value='';
  if($('mediaPreview')) $('mediaPreview').innerHTML='';
  if($('progressWrap')) $('progressWrap').classList.add('hidden');
  if($('progressBar')) $('progressBar').style.width='0%';
  if($('progressText')) $('progressText').textContent='Preparando…';
  if($('selectedMediaInfo')) $('selectedMediaInfo').textContent='Nenhuma mídia selecionada.';
  if($('analyzeNowBtn')){
    $('analyzeNowBtn').disabled=true;
    $('analyzeNowBtn').textContent='🔎 Analisar mídia agora';
  }
  if($('analysisDiagnostics')) $('analysisDiagnostics').textContent='';
  if($('coverageContent')) $('coverageContent').innerHTML='';
  if($('analysisContent')) $('analysisContent').innerHTML='';
  document.querySelectorAll('.mode-card').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  const cfg={
    tactic:['Enviar vídeo ou imagens da partida','Mostre tela inicial, árbitro, forças e Data Analyst. A IA marca qualquer campo que não conseguir ler.'],
    market:['Enviar vídeo do elenco','Mostre o elenco completo e os jogadores em treinamento. Não é necessário mostrar a lista de transferências.'],
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
  $('progressWrap').classList.remove('hidden');
  if($('analysisDiagnostics'))$('analysisDiagnostics').textContent='Usando motor de análise da V1 + recursos da V2.';
  $('analyzeNowBtn').disabled=true;
  $('analyzeNowBtn').textContent='Analisando…';

  try{
    await v21Analyze(pendingMediaFiles);
    if($('analysisDiagnostics'))$('analysisDiagnostics').textContent='Análise concluída.';
  }catch(e){
    const msg=e?.message||String(e);
    if($('analysisDiagnostics'))$('analysisDiagnostics').textContent=`Falha: ${msg}`;
    setProgress(100,'Falha na análise');
    job(msg,'error');
    toast(msg);
  }finally{
    analysisBusy=false;
    $('analyzeNowBtn').disabled=false;
    $('analyzeNowBtn').textContent='🔎 Analisar mídia novamente';
    setTimeout(()=>$('progressWrap').classList.add('hidden'),1400);
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
  $('userNick').value=settings.userNick||'leandrozzy';$('modelSelect').value=settings.model||'gemini-3.5-flash';$('notifyMinutes').value=settings.notifyMinutes||20;$('notifyEnabled').checked=!!settings.notifyEnabled;$('apiBtn').textContent=localStorage.getItem(API_KEY_STORAGE)?'API configurada':'API Gemini';
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

function renderAll(){renderSlotSwitcher();renderDashboard();renderPregame();renderInfo();renderMarket();renderLearning();renderHistory();hydrateSettings()}
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
  if($('infoEditBtn'))$('infoEditBtn').onclick=infoEditModal;
}
document.addEventListener('DOMContentLoaded',()=>{bind();renderAll();setAnalysisMode('tactic');setInterval(checkNotifications,30000);checkNotifications()});
