'use strict';

const APP_VERSION='5.7.0-roster-market-history';
const STATE_KEY='osm_ai_coach_pro_state_v52_clean';
const SETTINGS_KEY='osm_ai_coach_pro_settings_v4';
const API_KEY_STORAGE='osm_ai_coach_pro_gemini_key';
const FORMATIONS=['4-3-3 A','4-3-3 B','4-5-1','4-2-3-1','4-4-2 A','4-4-2 B','3-2-5','3-2-3-2','3-3-4 A','3-3-4 B','3-4-3 A','3-4-3 B','3-3-2-2','3-5-2','4-2-4 A','4-2-4 B','5-2-3 A','5-2-3 B','5-3-2','5-3-1-1','5-4-1 A','5-4-1 B','6-3-1 A','6-3-1 B'];
const GAME_PLANS=['Jogar pelas alas','Jogo de passes','Contra-ataque','Chutar de longe','Bola longa'];
const COVERAGE_LABELS={dashboard:'Tela inicial',analyst:'Data Analyst',analystDetails:'Detalhes do analista',squad:'Elenco',market:'Mercado',calendar:'Calendário/horário',training:'Treinamento',result:'Resultado/estatísticas'};
const els={};

function defaultSlot(n){return {slotNumber:n,status:'empty',teamName:null,competitionName:null,competitionType:null,round:null,totalRounds:null,createdAt:null,updatedAt:null,myTeam:{overall:null,goalkeeper:null,defence:null,midfield:null,attack:null,squadValue:null,playerCount:null,stadium:null,loginBonus:null,secretTraining:null,trainingCamp:null,leaguePosition:null},opponent:{teamName:null,human:null,manager:null,overall:null,goalkeeper:null,defence:null,midfield:null,attack:null,squadValue:null,playerCount:null,stadium:null,loginBonus:null,secretTraining:null,trainingCamp:null,formation:null,style:null,marking:null,offside:null,tackling:null},match:{venue:null,refereeName:null,refereeColor:null,nextMatchAt:null,countdownText:null},defaultMatchTime:null,schedule:[],roster:[],market:[],coverage:{},missing:[],tactic:null,marketPlan:null,results:[],positionHistory:[],lastRosterSnapshotAt:null,lastMarketSnapshotAt:null,notes:[]};}
function defaultState(){return {version:APP_VERSION,slots:[1,2,3,4].map(defaultSlot),archives:[],eventIntel:null,lastAnalysisAt:null};}
function defaultSettings(){return {model:'gemini-3.8-flash',notifyMinutes:20,userNick:'leandrozzy',notifyEnabled:true,localOcr:true};}
function safeParse(s,fallback){try{return JSON.parse(s)}catch{return fallback}}
function loadState(){const raw=safeParse(localStorage.getItem(STATE_KEY),null);if(!raw||!Array.isArray(raw.slots))return defaultState();const d=defaultState();d.archives=Array.isArray(raw.archives)?raw.archives:[];d.eventIntel=raw.eventIntel||null;d.lastAnalysisAt=raw.lastAnalysisAt||null;d.slots=[1,2,3,4].map(n=>deepMerge(defaultSlot(n),raw.slots.find(x=>Number(x.slotNumber)===n)||{}));return d}
function loadSettings(){return {...defaultSettings(),...safeParse(localStorage.getItem(SETTINGS_KEY),{})}}
function saveState(){state.version=APP_VERSION;localStorage.setItem(STATE_KEY,JSON.stringify(state));renderAll()}
function saveSettingsObj(){localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings))}
function deepMerge(target,source){if(!source||typeof source!=='object')return target;for(const [k,v] of Object.entries(source)){if(v&&typeof v==='object'&&!Array.isArray(v)&&target[k]&&typeof target[k]==='object'&&!Array.isArray(target[k]))target[k]=deepMerge({...target[k]},v);else target[k]=v}return target}
function esc(v){return String(v??'NI').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function fmtMoney(v){if(v===null||v===undefined||v==='')return 'NI';const n=Number(v);if(!Number.isFinite(n))return esc(v);return Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1}).format(n)}
function formatMoney(v){return fmtMoney(v)}
function fmtDateTime(v){if(!v)return 'Horário NI';const d=new Date(v);return Number.isNaN(d.getTime())?'Horário NI':d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
function nowIso(){return new Date().toISOString()}
function toast(msg){els.toast.textContent=msg;els.toast.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>els.toast.classList.remove('show'),3200)}
function openModal(html){els.modalBody.innerHTML=html;els.modal.classList.add('open');els.modal.setAttribute('aria-hidden','false')}
function closeModal(){els.modal.classList.remove('open');els.modal.setAttribute('aria-hidden','true')}

let state=loadState();
let settings=loadSettings();
let notificationSeen=new Set();
let analysisMode='tactic';

function bindEls(){['apiButton','nextAction','activeTacticPanel','slotSwitcher','slotsGrid','refreshCountdowns','chooseMedia','mediaInput','uploadZone','uploadTitle','uploadHelp','slotTarget','autoTactic','autoTacticRow','analysisGuide','analysisProgress','progressBar','progressText','mediaPreview','coveragePanel','analysisResult','marketContent','historyContent','infoContent','updateEvents','modelSelect','notifyMinutes','userNick','notifyEnabled','requestNotification','saveSettings','exportData','importData','modal','modalBody','modalClose','toast'].forEach(id=>els[id]=document.getElementById(id));}

function init(){bindEls();bindNav();bindActions();bindAnalysisModes();hydrateSettings();renderSlotSwitcher();renderAnalysisMode();renderAll();setInterval(()=>{renderToday();checkNotifications()},30000);checkNotifications()}
function bindNav(){document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)))}
function bindAnalysisModes(){document.querySelectorAll('[data-analysis-mode]').forEach(b=>b.addEventListener('click',()=>{analysisMode=b.dataset.analysisMode;document.querySelectorAll('[data-analysis-mode]').forEach(x=>x.classList.toggle('active',x===b));clearAnalysisUi();renderAnalysisMode()}))}
function clearAnalysisUi(){if(els.analysisResult)els.analysisResult.innerHTML='';if(els.coveragePanel){els.coveragePanel.innerHTML='';els.coveragePanel.classList.add('hidden')}if(els.mediaPreview)els.mediaPreview.innerHTML='';if(els.mediaInput)els.mediaInput.value='';if(els.analysisProgress)els.analysisProgress.classList.add('hidden')}
function renderAnalysisMode(){if(!els.analysisGuide)return;const tactic=analysisMode==='tactic';els.uploadTitle.textContent=tactic?'Enviar vídeo da partida':'Enviar vídeo do mercado';els.uploadHelp.textContent=tactic?'Grave as 6 telas nesta ordem: partida, meu elenco, elenco rival, analista resumo, analista marcação/impedimento e analista formação.':'Grave elenco, treinamento e lista de transferências. Não precisa mostrar Data Analyst nem táticas.';els.autoTacticRow.classList.toggle('hidden',!tactic);els.analysisGuide.innerHTML=tactic?`<h3>Vídeo para gerar a tática</h3><p class="muted small">Mostre apenas estas telas, nesta ordem. Pare 1–2 segundos em cada uma.</p><div class="guide-grid"><div><b>1. Tela da partida</b><span>meu time, rival, força, local, árbitro, CT/treino secreto e bônus quando aparecer</span></div><div><b>2. Data Analyst</b><span>abra o relatório do adversário</span></div><div><b>3. Detalhes do Analyst</b><span>formação, estilo/plano, marcação e impedimento</span></div><div><b>4. Força por setor</b><span>GOL/DEF/MEI/ATA de ambos, se disponível</span></div><div><b>5. Horário</b><span>cronômetro ou horário da próxima partida</span></div></div><div class="actions" style="margin-top:12px"><button class="btn secondary" onclick="manualTacticModal(Number(document.getElementById('slotTarget').value)||1)">Digitar tática usada manualmente</button></div>`:`<h3>Vídeo para Mercado / Evolução</h3><p class="muted small">Este vídeo é separado do vídeo da tática.</p><div class="guide-grid"><div><b>1. Elenco completo</b><span>nome, posição, força/rating, valor e quantidade de jogadores</span></div><div><b>2. Treinamento</b><span>quem está treinando; camisa laranja = treino, não venda</span></div><div><b>3. Lista de transferências</b><span>jogadores disponíveis, posição, rating, idade e preço</span></div><div><b>4. Jogadores à venda</b><span>venda é indicada pelas setas de transferência</span></div></div>`}

function showView(name){document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.view===name));document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));document.getElementById('view-'+name).classList.add('active');if(name==='market')renderMarket();if(name==='history')renderHistory()}
function bindActions(){
 els.apiButton.addEventListener('click',apiModal);els.modalClose.addEventListener('click',closeModal);els.modal.addEventListener('click',e=>{if(e.target===els.modal)closeModal()});els.refreshCountdowns.addEventListener('click',()=>{renderToday();checkNotifications();toast('Horários atualizados')});
 els.chooseMedia.addEventListener('click',()=>els.mediaInput.click());els.mediaInput.addEventListener('change',()=>handleFiles([...els.mediaInput.files]));
 ['dragenter','dragover'].forEach(ev=>els.uploadZone.addEventListener(ev,e=>{e.preventDefault();els.uploadZone.classList.add('drag')}));['dragleave','drop'].forEach(ev=>els.uploadZone.addEventListener(ev,e=>{e.preventDefault();els.uploadZone.classList.remove('drag')}));els.uploadZone.addEventListener('drop',e=>handleFiles([...e.dataTransfer.files]));
 els.saveSettings.addEventListener('click',saveSettingsFromUi);els.requestNotification.addEventListener('click',requestNotifications);els.exportData.addEventListener('click',exportBackup);els.importData.addEventListener('change',importBackup);els.updateEvents.addEventListener('click',updateEventIntel);
}
function hydrateSettings(){els.modelSelect.value=settings.model;els.notifyMinutes.value=settings.notifyMinutes;els.userNick.value=settings.userNick;els.notifyEnabled.checked=!!settings.notifyEnabled;els.apiButton.textContent=localStorage.getItem(API_KEY_STORAGE)?'API configurada':'API Gemini'}
function saveSettingsFromUi(){settings.model=els.modelSelect.value;settings.notifyMinutes=Math.max(1,Math.min(180,Number(els.notifyMinutes.value)||20));settings.userNick=els.userNick.value.trim()||'leandrozzy';settings.notifyEnabled=els.notifyEnabled.checked;saveSettingsObj();toast('Configurações salvas')}

function renderAll(){renderToday();renderMarket();renderHistory();hydrateSettings()}
function renderToday(){
 const action=chooseNextAction();
 els.nextAction.innerHTML=action?`<div class="priority">PRÓXIMA AÇÃO · SLOT ${action.slot.slotNumber}</div><h2>${esc(action.title)}</h2><p class="muted">${esc(action.detail)}</p><div class="hero-actions">${action.button||''}</div>`:`<div class="priority">SEU DIA NO OSM</div><h2>Nenhuma partida configurada</h2><p class="muted">Envie um vídeo na aba Analisar ou configure um slot.</p><div class="hero-actions"><button class="btn" onclick="showView('analyze')">Analisar vídeo</button></div>`;
 els.slotsGrid.innerHTML=state.slots.map(slotCardHtml).join('');
}
function chooseNextAction(){
 const active=state.slots.filter(s=>s.status==='active');
 for(const s of active){if(s.results?.length&&s.results[s.results.length-1]?.pending)return {slot:s,title:`Registrar resultado de ${s.opponent.teamName||'partida'}`,detail:'O resultado alimenta o histórico antes da próxima recomendação.',button:`<button class="btn" onclick="resultModal(${s.slotNumber})">Registrar resultado</button>`}}
 const sorted=active.map(s=>({s,t:s.match.nextMatchAt?new Date(s.match.nextMatchAt).getTime():Infinity})).sort((a,b)=>a.t-b.t);
 for(const {s,t} of sorted){if(!s.tactic)return {slot:s,title:`Gerar tática contra ${s.opponent.teamName||'o adversário'}`,detail:s.competitionName||'Dados do slot prontos para análise.',button:`<button class="btn" onclick="generateTacticForSlot(${s.slotNumber})">Gerar tática</button>`};if(Number.isFinite(t))return {slot:s,title:`Preparar ${s.teamName||'time'} x ${s.opponent.teamName||'adversário'}`,detail:`${fmtDateTime(s.match.nextMatchAt)} · ${countdown(s.match.nextMatchAt)}`,button:`<button class="btn" onclick="tacticModal(${s.slotNumber})">Ver tática</button><button class="btn secondary" onclick="downloadIcs(${s.slotNumber})">Calendário</button>`}}
 return null
}
function slotCardHtml(s){
 const active=s.status==='active';const missing=s.missing||[];const ready=active&&missing.length===0;const opp=s.opponent||{};const me=s.myTeam||{};return `<article class="slot-card"><div class="slot-top"><div><div class="slot-num">SLOT ${s.slotNumber}${s.competitionType==='Batalha'?' · BATALHA':''}</div><div class="slot-team">${esc(s.teamName||'Slot disponível')}</div><div class="slot-comp">${esc(s.competitionName||'Sem competição')}</div></div><span class="status-pill ${ready?'ready':active?'missing':''}">${active?(ready?'Dados prontos':'Dados parciais'):'Livre'}</span></div>${active?`<div class="matchline"><b>${esc(opp.teamName||'Adversário NI')}</b><div class="small muted">${esc(s.match.venue||'Local NI')} · R${esc(s.round)}${s.totalRounds?'/'+esc(s.totalRounds):''} · ${s.match.nextMatchAt?countdown(s.match.nextMatchAt):'Horário NI'}</div></div><div class="kpis"><div class="kpi"><span>Força</span><b>${esc(me.overall)}</b></div><div class="kpi"><span>Rival</span><b>${esc(opp.overall)}</b></div><div class="kpi"><span>Elenco</span><b>${fmtMoney(me.squadValue)}</b></div><div class="kpi"><span>Rival</span><b>${fmtMoney(opp.squadValue)}</b></div></div>${missing.length?`<p class="small warn-text">Falta: ${missing.map(esc).join(', ')}</p>`:''}<div class="actions"><button class="btn secondary" onclick="slotDetailModal(${s.slotNumber})">Dados</button><button class="btn secondary" onclick="configureSlot(${s.slotNumber})">Editar competição</button><button class="btn ${s.tactic?'secondary':''}" onclick="${s.tactic?'tacticModal':'generateTacticForSlot'}(${s.slotNumber})">${s.tactic?'Tática':'Gerar tática'}</button><button class="btn secondary" onclick="manualTacticModal(${s.slotNumber})">Tática manual</button><button class="btn secondary" onclick="resultModal(${s.slotNumber})">Resultado</button><button class="btn secondary" onclick="scheduleModal(${s.slotNumber})">Horário</button><button class="btn danger" onclick="finishCompetition(${s.slotNumber})">Finalizar</button></div>`:`<p class="muted small" style="margin:14px 0">Envie um vídeo ou configure uma competição para este slot.</p><div class="actions"><button class="btn" onclick="configureSlot(${s.slotNumber})">Criar competição</button><button class="btn secondary" onclick="showView('analyze');document.getElementById('slotTarget').value='${s.slotNumber}'">Analisar vídeo</button></div>`}</article>`
}
function countdown(iso){const t=new Date(iso).getTime()-Date.now();if(!Number.isFinite(t))return 'Horário NI';if(t<=0)return 'Horário do jogo chegou';const m=Math.floor(t/60000),d=Math.floor(m/1440),h=Math.floor((m%1440)/60),mi=m%60;return [d?`${d}d`:null,h?`${h}h`:null,`${mi}min`].filter(Boolean).join(' ')}

function configureSlot(n){const s=state.slots[n-1];openModal(`<h2>${s.status==='active'?'Editar':'Criar'} competição · Slot ${n}</h2><div class="form-card"><label>Meu time<input id="cfgTeam" value="${esc(s.teamName||'')}"></label><label>Competição<input id="cfgComp" value="${esc(s.competitionName||'')}"></label><label>Tipo<select id="cfgType"><option${s.competitionType==='Liga normal'?' selected':''}>Liga normal</option><option${s.competitionType==='Batalha'?' selected':''}>Batalha</option><option${s.competitionType==='Copa'?' selected':''}>Copa</option><option${s.competitionType==='Torneio'?' selected':''}>Torneio</option></select></label><div class="data-grid"><label>Rodada<input id="cfgRound" type="number" min="1" value="${esc(s.round||1)}"></label><label>Total<input id="cfgTotal" type="number" min="1" value="${esc(s.totalRounds||34)}"></label></div><label>Horário padrão dos jogos<input id="cfgDailyTime" type="time" value="${esc(s.defaultMatchTime||'')}"></label><p class="muted small">Se a liga costuma jogar diariamente no mesmo horário, use este horário como fallback. Um vídeo do Calendário pode substituir pelas datas/horários reais.</p><div class="actions"><button class="btn" onclick="saveSlotConfig(${n})">Salvar alterações</button><button class="btn secondary" onclick="openCalendarForSlot(${n})">Ler calendário por vídeo</button></div></div>`)}
function saveSlotConfig(n){const s=state.slots[n-1];s.status='active';s.teamName=document.getElementById('cfgTeam').value.trim()||s.teamName;s.competitionName=document.getElementById('cfgComp').value.trim()||s.competitionName;s.competitionType=document.getElementById('cfgType').value;s.round=Number(document.getElementById('cfgRound').value)||1;s.totalRounds=Number(document.getElementById('cfgTotal').value)||null;s.defaultMatchTime=document.getElementById('cfgDailyTime').value||null;s.createdAt=s.createdAt||nowIso();s.updatedAt=nowIso();ensureNextMatchFromScheduleOrDefault(s);saveState();closeModal();toast('Competição salva')}
function openCalendarForSlot(n){closeModal();setSelectedSlot(n);analysisMode='calendar';document.querySelectorAll('[data-analysis-mode]').forEach(x=>x.classList.toggle('active',x.dataset.analysisMode==='calendar'));clearAnalysisUi();renderAnalysisMode();showView('analyze');if(els.slotTarget)els.slotTarget.value=String(n)}
function ensureNextMatchFromScheduleOrDefault(s){const now=Date.now();const future=(s.schedule||[]).filter(x=>!x.played&&x.dateTime&&new Date(x.dateTime).getTime()>now).sort((a,b)=>new Date(a.dateTime)-new Date(b.dateTime));if(future.length){s.match.nextMatchAt=future[0].dateTime;return}if(!s.defaultMatchTime)return;const [hh,mm]=s.defaultMatchTime.split(':').map(Number);if(!Number.isFinite(hh)||!Number.isFinite(mm))return;let d=new Date();d.setHours(hh,mm,0,0);if(d.getTime()<=now)d.setDate(d.getDate()+1);s.match.nextMatchAt=d.toISOString()}
function finishCompetition(n){const s=state.slots[n-1];if(s.status!=='active')return;openModal(`<h2>Finalizar competição?</h2><p><b>${esc(s.teamName)}</b> · ${esc(s.competitionName)}</p><p class="muted">A competição será arquivada com resultados, táticas e histórico. O Slot ${n} ficará livre.</p><div class="actions"><button class="btn danger" onclick="confirmFinish(${n})">Finalizar competição</button><button class="btn secondary" onclick="closeModal()">Cancelar</button></div>`)}
function confirmFinish(n){const s=state.slots[n-1];state.archives.unshift({...structuredClone(s),finishedAt:nowIso()});state.slots[n-1]=defaultSlot(n);saveState();closeModal();toast(`Slot ${n} liberado; competição arquivada`)}

function slotDetailModal(n){const s=state.slots[n-1];const rows=[['Competição',s.competitionName],['Tipo',s.competitionType],['Rodada',`${s.round??'NI'}/${s.totalRounds??'NI'}`],['Adversário',s.opponent.teamName],['Humano',s.opponent.human===true?'Sim':s.opponent.human===false?'Não':'NI'],['Manager rival',s.opponent.manager],['Local',s.match.venue],['Árbitro',s.match.refereeColor||s.match.refereeName],['Minha força',s.myTeam.overall],['Rival',s.opponent.overall],['Meu G/D/M/A',`${s.myTeam.goalkeeper??'NI'}/${s.myTeam.defence??'NI'}/${s.myTeam.midfield??'NI'}/${s.myTeam.attack??'NI'}`],['Rival G/D/M/A',`${s.opponent.goalkeeper??'NI'}/${s.opponent.defence??'NI'}/${s.opponent.midfield??'NI'}/${s.opponent.attack??'NI'}`],['Formação rival',s.opponent.formation],['Plano rival',s.opponent.style],['Marcação rival',s.opponent.marking],['Impedimento rival',boolText(s.opponent.offside)],['CT rival',boolText(s.opponent.trainingCamp)],['Treino secreto rival',boolText(s.opponent.secretTraining)],['Bônus rival',s.opponent.loginBonus===null?'NI':`${s.opponent.loginBonus}%`]];openModal(`<h2>Dados · Slot ${n}</h2><table class="tactic-table">${rows.map(([a,b])=>`<tr><td>${esc(a)}</td><td><b>${esc(b)}</b></td></tr>`).join('')}</table>${s.missing?.length?`<p class="warn-text"><b>Falta:</b> ${s.missing.map(esc).join(', ')}</p>`:''}`)}
function boolText(v){return v===true?'Sim':v===false?'Não':'NI'}


async function handleFiles(files){
 if(!files.length)return;
 if(!localStorage.getItem(API_KEY_STORAGE)){apiModal('Antes de analisar, salve sua chave Gemini.');return}
 clearAnalysisUi();
 els.analysisProgress.classList.remove('hidden');
 try{
   const video=files.find(f=>f.type.startsWith('video/'));
   const images=files.filter(f=>f.type.startsWith('image/'));
   let result;
   if(video){
     renderVideoPreview(video);
     setProgress(6,'Selecionando quadros importantes localmente…');
     const frames=await extractVideoFramesFast(video,analysisMode==='tactic'?18:20);
     setProgress(18,'Lendo texto localmente com OCR…');
     const ocr=await runLocalOcr(frames);
     if(analysisMode==='tactic'){
       const selected=selectRequiredTacticFrames(frames,ocr);
       renderRequiredTacticPreview(selected);
       const requiredFrames=assertAllRequiredTacticScreens(selected);
       setProgress(58,'Enviando as 6 telas obrigatórias para a IA…');
       result=await analyzeOcrPackage(ocr,requiredFrames);
     }else if(analysisMode==='calendar'){
       const evidence=selectVisualEvidence(frames,5);renderFramePreview(evidence);setProgress(58,'Lendo calendário, casa/fora e taça…');result=await analyzeCalendarOcr(ocr,evidence);applyCalendarResult(result);
     }else if(analysisMode==='result'){
       const evidence=selectVisualEvidence(frames,6);renderFramePreview(evidence);setProgress(58,'Lendo placar, estatísticas e cartões…');result=await analyzeResultOcr(ocr,evidence);applyResultVideo(result);
     }else{
       const evidence=selectVisualEvidence(frames,3);renderFramePreview(evidence);setProgress(58,'Montando mercado/evolução para a IA…');result=await analyzeOcrPackage(ocr,evidence);
     }
   }else if(images.length){
     setProgress(10,'Preparando imagens…');
     const frames=[];
     for(const f of images)frames.push(await imageFileToFrame(f));
     setProgress(22,'Lendo texto localmente com OCR…');
     const ocr=await runLocalOcr(frames);
     if(analysisMode==='tactic'){
       const selected=selectRequiredTacticFrames(frames,ocr);
       renderRequiredTacticPreview(selected);
       const requiredFrames=assertAllRequiredTacticScreens(selected);
       result=await analyzeOcrPackage(ocr,requiredFrames);
     }else if(analysisMode==='calendar'){
       const evidence=selectVisualEvidence(frames,5);renderFramePreview(evidence);result=await analyzeCalendarOcr(ocr,evidence);applyCalendarResult(result);
     }else if(analysisMode==='result'){
       const evidence=selectVisualEvidence(frames,6);renderFramePreview(evidence);result=await analyzeResultOcr(ocr,evidence);applyResultVideo(result);
     }else{
       const evidence=selectVisualEvidence(frames,3);renderFramePreview(evidence);result=await analyzeOcrPackage(ocr,evidence);
     }
   }else throw new Error('Selecione um vídeo ou imagens do OSM.');

   setProgress(78,'Atualizando o slot…');
   if(!['calendar','result'].includes(analysisMode)){applyVisionResult(result);if(analysisMode==='market'){const ss=state.slots[selectedSlot-1];ss.lastRosterSnapshotAt=nowIso();recalculateSquadValue(ss);ss.market=[];}}
   if(analysisMode==='tactic')applyRecommendedTactics(result);
   if(analysisMode==='calendar')renderCalendarResult(result);else if(analysisMode==='result')renderResultVideo(result);else renderAnalysisResult(result);
   state.lastAnalysisAt=nowIso();
   saveState();
   setProgress(100,'Concluído');
   toast(analysisMode==='tactic'?'Partida analisada e tática gerada':analysisMode==='calendar'?'Calendário atualizado':analysisMode==='result'?'Resultado registrado e aprendizado atualizado':'Elenco atualizado');
 }catch(e){
   console.error(e);
   const rigidHint=e?.requiredMissing?.length?`<p class="warn-text small"><b>Telas ausentes:</b> ${esc(e.requiredMissing.join(', '))}</p><p class="muted small">Sem as 6 telas obrigatórias, a análise da tática é bloqueada.</p>`:`<p class="muted small">No modo Tática, o app agora exige exatamente 6 telas obrigatórias. Se alguma faltar, ele bloqueará a análise.</p>`;
   els.analysisResult.innerHTML=`<div class="result-card"><h3 class="danger-text">Não foi possível concluir</h3><p>${esc(e.message||e)}</p>${rigidHint}</div>`;
   setProgress(100,'Falha na análise');
 }finally{setTimeout(()=>els.analysisProgress.classList.add('hidden'),1500)}
}

function requiredTacticTypes(){
 return [
  {key:'match_overview',label:'1. Tela da partida'},
  {key:'my_squad',label:'2. Meu elenco / força por setor'},
  {key:'opponent_squad',label:'3. Elenco do adversário / força por setor'},
  {key:'analyst_summary',label:'4. Analista — resumo'},
  {key:'analyst_marking',label:'5. Analista — marcação e impedimento'},
  {key:'analyst_formation',label:'6. Analista — formação'}
 ];
}
function normText(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
function buildFrameClassification(text,frame,slot){
 const t=normText(text),myName=normText(slot?.teamName),oppName=normText(slot?.opponent?.teamName),nick=normText(settings.userNick||''),l=frame?.layout||{};
 const score={match_overview:0,my_squad:0,opponent_squad:0,analyst_summary:0,analyst_marking:0,analyst_formation:0};
 if(t.includes('vs'))score.match_overview+=5;if(t.includes('arbitro'))score.match_overview+=6;if(t.includes('jornada'))score.match_overview+=4;if((l.dark||0)>.38)score.match_overview+=2;
 const squadBase=(l.bottomWhite||0)>.32?5:0;if(squadBase){score.my_squad+=squadBase;score.opponent_squad+=squadBase}if(t.includes('posicao')||t.includes('objetivo')||t.includes('jogador')||t.includes('idade')||t.includes('valor')){score.my_squad+=2;score.opponent_squad+=2}
 if(nick&&t.includes(nick)){score.my_squad+=12;score.opponent_squad-=8}if(myName&&t.includes(myName)){score.my_squad+=8;score.opponent_squad-=5}if(oppName&&t.includes(oppName)){score.opponent_squad+=10;score.my_squad-=4}
 const analystLayout=(l.leftWhite||0)>.34?5:0;if(analystLayout){score.analyst_summary+=5;score.analyst_marking+=2;score.analyst_formation+=2}
 if(t.includes('pelo que pude ver')||t.includes('tenho a certeza')||t.includes('nivel do estadio'))score.analyst_summary+=10;
 if(t.includes('marcacao')||t.includes('fora-de-jogo')||t.includes('fora de jogo')||t.includes('homem-a-homem')||t.includes('a zona'))score.analyst_marking+=10;if((l.rightBlue||0)>.1)score.analyst_marking+=3;
 if(t.includes('formacao:')||t.includes('formação:')||t.includes('suplentes')||t.includes('tatica'))score.analyst_formation+=10;if((l.rightGreen||0)>.12)score.analyst_formation+=4;
 return score;
}
function selectRequiredTacticFrames(frames,ocr){
 const slot=state.slots[selectedSlot-1]||{};const enriched=(ocr.frames||[]).map(o=>{const frame=frames[(o.frame||1)-1];return {...o,frame,scores:buildFrameClassification(o.text,frame,slot)}}).filter(x=>x.frame);
 const result=[];const pick=(key,min=4,exclude=[])=>{const b=[...enriched].filter(x=>!exclude.includes(x.frame)).sort((a,b)=>(b.scores[key]||0)-(a.scores[key]||0))[0];return b&&(b.scores[key]||0)>=min?b:null};
 const match=pick('match_overview',5),mine=pick('my_squad',5),opp=pick('opponent_squad',5,mine?[mine.frame]:[]),mark=pick('analyst_marking',6),form=pick('analyst_formation',6);
 // O relatório textual pode estar na mesma captura de marcação ou formação; não exigimos um sexto quadro único.
 let summary=pick('analyst_summary',6);if(!summary){const candidates=[mark,form].filter(Boolean).sort((a,b)=>(b.scores.analyst_summary||0)-(a.scores.analyst_summary||0));if(candidates[0]&&(candidates[0].scores.analyst_summary||0)>=5)summary=candidates[0]}
 const map={match_overview:match,my_squad:mine,opponent_squad:opp,analyst_summary:summary,analyst_marking:mark,analyst_formation:form};
 for(const need of requiredTacticTypes()){const b=map[need.key];result.push(b?{type:need.key,label:need.label,frame:b.frame,text:b.text,score:b.scores[need.key]}:{type:need.key,label:need.label,frame:null,text:null,score:0})}
 ocr.required=result.reduce((a,x)=>{a[x.type]=x.text||null;return a},{});ocr.missingRequired=result.filter(x=>!x.frame).map(x=>x.label);return result;
}
function assertAllRequiredTacticScreens(items){
 const missing=items.filter(x=>!x.frame).map(x=>x.label);
 if(!missing.length)return items.filter(x=>x.frame).map(x=>x.frame);
 const msg=`Faltaram ${missing.length} das 6 telas obrigatórias: ${missing.join(', ')}. Sem essas telas o app não gera tática. Grave novamente parando 1–2 segundos em cada tela obrigatória.`;
 const err=new Error(msg);
 err.requiredMissing=missing;
 throw err;
}
function renderRequiredTacticPreview(items){
 const any=items.some(x=>x.frame);
 els.mediaPreview.innerHTML=`<div class="required-grid">${
   items.map(item=>`<div class="required-card ${item.frame?'ok':'missing'}">${
     item.frame?`<img src="${item.frame.dataUrl}" alt="${esc(item.label)}" />`:`<div class="required-missing">Faltou</div>`
   }<div class="required-caption"><b>${esc(item.label)}</b><span>${item.frame?'detectada':'não detectada'}</span></div></div>`).join('')
 }</div>`;
 const missingCount=items.filter(x=>!x.frame).length;
 if(any&&missingCount){els.mediaPreview.innerHTML+=`<div class="result-card rigid-note"><p class="warn-text"><b>Faltam ${missingCount} das 6 telas obrigatórias.</b></p><p class="muted small">A análise será bloqueada até todas serem detectadas.</p></div>`;}
 if(!any) els.mediaPreview.innerHTML='<div class="result-card"><h3>Nenhuma das 6 telas obrigatórias foi detectada</h3><p class="muted">Sem elas, o app não gera tática.</p></div>';
}

async function extractVideoFramesFast(file,maxFrames=8){
 const url=URL.createObjectURL(file),v=document.createElement('video');
 v.src=url;v.muted=true;v.playsInline=true;v.preload='metadata';
 await new Promise((res,rej)=>{v.onloadedmetadata=res;v.onerror=()=>rej(new Error(`Não consegui abrir ${file.name}`))});
 const dur=Math.max(.2,v.duration||1),times=[];
 for(let i=0;i<maxFrames;i++)times.push(Math.min(dur-.08,Math.max(.08,(dur*(i+.5))/maxFrames)));
 const frames=[];
 let prev=null;
 for(const t of times){
   await seekVideo(v,t);
   const f=captureVideoFrame(v,t,file.name),d=prev?pixelDiff(prev,f.thumb):100;
   prev=f.thumb;f.score=d;
   if(d>=3||frames.length<3)frames.push(f);
 }
 URL.revokeObjectURL(url);
 return dedupeFrames(frames,maxFrames);
}

async function runLocalOcr(frames){
 if(!window.Tesseract)throw new Error('OCR local não carregou. Recarregue a página e tente novamente.');
 const results=[];
 let worker=null;
 try{
   worker=await Tesseract.createWorker('por+eng',1,{
     logger:m=>{
       if(m.status==='recognizing text'&&m.progress) setProgress(20+Math.round(m.progress*28),`OCR local ${Math.round(m.progress*100)}%…`);
     }
   });
 }catch{
   worker=await Tesseract.createWorker('eng',1,{logger:m=>{if(m.status==='recognizing text'&&m.progress)setProgress(20+Math.round(m.progress*28),`OCR local ${Math.round(m.progress*100)}%…`)}})
 }
 try{
   for(let i=0;i<frames.length;i++){
     setProgress(22+Math.round((i/Math.max(1,frames.length))*26),`OCR quadro ${i+1}/${frames.length}…`);
     const prepared=preprocessForOcr(frames[i].dataUrl);
     const {data}=await worker.recognize(prepared);
     const text=cleanOcrText(data?.text||'');
     if(text.length>5)results.push({frame:i+1,time:Math.round(frames[i].time||0),text});
   }
 }finally{if(worker)await worker.terminate()}
 return {mode:analysisMode,frames:results,joined:results.map(x=>`[Quadro ${x.frame} ~${x.time}s]\n${x.text}`).join('\n\n')};
}

function preprocessForOcr(dataUrl){
 const img=document.createElement('img');img.src=dataUrl;
 // Tesseract accepts the data URL directly. Keeping original preserves small colored UI text better than hard thresholding.
 return dataUrl;
}
function cleanOcrText(t){return String(t||'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim()}
function selectVisualEvidence(frames,n=2){
 if(!frames.length)return [];
 const ranked=[...frames].sort((a,b)=>(b.score||0)-(a.score||0));
 const out=[];
 for(const f of ranked){if(out.length>=n)break;if(!out.some(x=>Math.abs((x.time||0)-(f.time||0))<1.2))out.push(f)}
 return out;
}
async function analyzeOcrPackage(ocr,evidence){
 const parts=[{text:hybridPrompt(ocr)}];
 for(let i=0;i<evidence.length;i++){
   const f=evidence[i];
   parts.push({text:`Imagem de apoio ${i+1}`},{inlineData:{mimeType:f.mimeType,data:f.base64}});
 }
 return geminiJson(parts,{temperature:.03,maxOutputTokens:8500});
}

async function analyzeCalendarOcr(ocr,evidence){
 const slot=state.slots[selectedSlot-1];
 const parts=[{text:`Você é um extrator de CALENDÁRIO do OSM 26. Analise o OCR e as poucas imagens do calendário do Slot ${selectedSlot}.
Horário padrão cadastrado: ${slot.defaultMatchTime||'não informado'}.
REGRAS VISUAIS OBRIGATÓRIAS:
- ícone de CASINHA à esquerda da partida = venue="Casa";
- sem casinha = venue="Fora";
- ícone de TAÇA/TROFÉU = competitionType="cup"; pode ser Casa ou Fora pela mesma regra da casinha;
- símbolo V = vitória já ocorrida, D = derrota já ocorrida, E = empate já ocorrido; qualquer V/D/E torna played=true;
- placar numérico visível também torna played=true;
- partidas sem V/D/E e sem placar são futuras;
- se uma partida futura de taça depender de classificação, conditional=true;
- extraia rodada, adversário, data e horário visíveis;
- se faltar horário, use o horário padrão e marque timeSource="default";
- não invente.
Retorne SOMENTE JSON: {"matches":[{"round":null,"opponent":null,"competitionType":"league|cup|null","venue":"Casa|Fora|null","dateText":null,"timeText":null,"dateTime":null,"timeSource":"screen|default|null","result":null,"outcome":"V|D|E|null","played":false,"conditional":false}]}
OCR:
${ocr.joined}`}];
 for(const f of evidence)parts.push({inlineData:{mimeType:f.mimeType,data:f.base64}});
 return geminiJson(parts,{temperature:.01,maxOutputTokens:5200});
}
function normalizeCalendarMatch(x){const outcome=['V','D','E'].includes(String(x.outcome||'').toUpperCase())?String(x.outcome).toUpperCase():null;return {round:x.round??null,opponent:x.opponent??null,competitionType:x.competitionType||null,venue:x.venue||null,dateText:x.dateText||null,timeText:x.timeText||null,dateTime:x.dateTime||null,timeSource:x.timeSource||null,result:x.result||outcome||null,outcome,played:!!x.played||!!outcome,conditional:!!x.conditional,skipped:false}}
function cupLossFromResult(r){if(!r)return false;if(typeof r==='object'&&String(r.outcome||'').toUpperCase()==='D')return true;const s=typeof r==='object'?r.result:r;if(String(s||'').toUpperCase()==='D')return true;const m=String(s||'').match(/(\d+)\s*[-x:]\s*(\d+)/i);return !!m&&Number(m[1])<Number(m[2])}
function pruneConditionalCupMatches(s){let eliminated=false;for(const x of s.schedule||[]){if(x.competitionType!=='cup')continue;if(x.played&&cupLossFromResult(x)){eliminated=true;continue}if(eliminated&&!x.played){x.skipped=true;x.conditional=true}}}
function applyCalendarResult(result){const s=state.slots[selectedSlot-1];s.schedule=(result.matches||[]).map(normalizeCalendarMatch);for(const x of s.schedule){if(x.played)continue;if(x.dateTime&&Number.isNaN(new Date(x.dateTime).getTime()))x.dateTime=null;if(!x.dateTime&&x.dateText){const d=parseCalendarDateTime(x.dateText,x.timeText||s.defaultMatchTime);if(d)x.dateTime=d.toISOString()}}pruneConditionalCupMatches(s);s.updatedAt=nowIso();ensureNextMatchFromScheduleOrDefault(s);saveState()}
function parseCalendarDateTime(dateText,timeText){if(!dateText)return null;const raw=`${dateText} ${timeText||''}`.trim();let d=new Date(raw);if(!Number.isNaN(d.getTime()))return d;const m=String(dateText).match(/(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?/);if(!m)return null;let y=m[3]?Number(m[3]):new Date().getFullYear();if(y<100)y+=2000;const tm=String(timeText||'').match(/(\d{1,2}):(\d{2})/);d=new Date(y,Number(m[2])-1,Number(m[1]),tm?Number(tm[1]):12,tm?Number(tm[2]):0);return Number.isNaN(d.getTime())?null:d}
function ensureNextMatchFromScheduleOrDefault(s){const now=Date.now();const next=(s.schedule||[]).filter(x=>!x.played&&!x.skipped&&x.dateTime&&new Date(x.dateTime).getTime()>now).sort((a,b)=>new Date(a.dateTime)-new Date(b.dateTime))[0];if(next){s.match.nextMatchAt=next.dateTime;s.match.venue=next.venue||s.match.venue;s.opponent.teamName=next.opponent||s.opponent.teamName;return}if(s.defaultMatchTime){const [h,m]=s.defaultMatchTime.split(':').map(Number);let d=new Date();d.setHours(h,m,0,0);if(d.getTime()<=now)d.setDate(d.getDate()+1);s.match.nextMatchAt=d.toISOString()}}
function renderCalendarResult(result){const s=state.slots[selectedSlot-1],rows=s.schedule||[];els.coveragePanel.classList.add('hidden');els.analysisResult.innerHTML=`<div class=\"result-card\"><h3>Calendário · Slot ${selectedSlot}</h3>${rows.length?`<table class=\"simple-table\"><tr><th>Rod.</th><th>Tipo</th><th>Local</th><th>Adversário</th><th>Data/hora</th><th>Status</th></tr>${rows.map(x=>`<tr><td>${esc(x.round)}</td><td>${x.competitionType==='cup'?'🏆 Taça':'Liga'}</td><td>${esc(x.venue)}</td><td>${esc(x.opponent)}</td><td>${esc(x.dateTime?fmtDateTime(x.dateTime):(x.dateText||'NI')+' '+(x.timeText||''))}</td><td>${x.played?'Jogado '+esc(x.result||''):x.skipped?'Ignorado (eliminado)':x.conditional?'Condicional':'Futuro'}</td></tr>`).join('')}</table>`:'<p class=\"warn-text\">Nenhuma partida foi identificada.</p>'}<p class=\"muted small\">Horário padrão: ${esc(s.defaultMatchTime||'NI')} · Próximo alerta: ${esc(s.match.nextMatchAt?fmtDateTime(s.match.nextMatchAt):'NI')}</p></div>`}

async function analyzeResultOcr(ocr,evidence){const s=state.slots[selectedSlot-1];const parts=[{text:`Você é um extrator de RESULTADO do OSM 26. Use OCR e imagens. Contexto pré-jogo: ${JSON.stringify({team:s.teamName,opponent:s.opponent?.teamName,tactic:s.tactic,myOverall:s.myTeam?.overall,oppOverall:s.opponent?.overall,venue:s.match?.venue})}. Extraia placar final, formação final dos dois times, remates/chutes, posse, cantos, faltas, cartões amarelos e vermelhos de CADA TIME (ícone + número, inclusive zero), gols, cartões e substituições quando legíveis. Não invente. Retorne JSON: {\"teamName\":null,\"opponent\":null,\"gf\":null,\"ga\":null,\"score\":null,\"myFormation\":null,\"oppFormation\":null,\"stats\":{\"myShots\":null,\"oppShots\":null,\"myPossession\":null,\"oppPossession\":null,\"myCorners\":null,\"oppCorners\":null,\"myFouls\":null,\"oppFouls\":null,\"myYellowCards\":null,\"oppYellowCards\":null,\"myRedCards\":null,\"oppRedCards\":null},\"events\":[],\"confidence\":0.0}. OCR:\n${ocr.joined}`}];for(const f of evidence)parts.push({inlineData:{mimeType:f.mimeType,data:f.base64}});return geminiJson(parts,{temperature:.01,maxOutputTokens:7000})}
function applyResultVideo(r){const s=state.slots[selectedSlot-1],gf=Number(r.gf),ga=Number(r.ga);if(!Number.isFinite(gf)||!Number.isFinite(ga))throw new Error('Não consegui identificar o placar final no vídeo.');const entry={createdAt:nowIso(),opponent:r.opponent||s.opponent.teamName,gf,ga,score:r.score||`${gf}-${ga}`,note:'Resultado extraído por vídeo',tactic:s.tactic?structuredClone(s.tactic):null,stats:r.stats||{},events:r.events||[],context:{myOverall:s.myTeam.overall,oppOverall:s.opponent.overall,oppFormation:r.oppFormation||s.opponent.formation,myFormation:r.myFormation||s.tactic?.formation||null,oppStyle:s.opponent.style,oppMarking:s.opponent.marking,oppOffside:s.opponent.offside,opponentHuman:s.opponent.human,venue:s.match.venue,referee:s.match.refereeColor||s.match.refereeName,trainingCamp:s.opponent.trainingCamp,secretTraining:s.opponent.secretTraining,strengthBucket:strengthBucket(s),yellowCards:r.stats?.myYellowCards??null,redCards:r.stats?.myRedCards??null,oppYellowCards:r.stats?.oppYellowCards??null,oppRedCards:r.stats?.oppRedCards??null}};s.results=s.results||[];s.results.push(entry);const pending=(s.schedule||[]).filter(x=>!x.played&&!x.skipped).sort((a,b)=>new Date(a.dateTime||'9999')-new Date(b.dateTime||'9999'))[0];if(pending){pending.played=true;pending.result=entry.score;if(pending.competitionType==='cup'&&gf<ga)pruneConditionalCupMatches(s)}s.tactic=null;s.tacticNeedsRefresh=true;if(Number.isFinite(Number(s.round)))s.round=Number(s.round)+1;s.updatedAt=nowIso();ensureNextMatchFromScheduleOrDefault(s);saveState()}
function renderResultVideo(r){const st=r.stats||{};els.coveragePanel.classList.add('hidden');els.analysisResult.innerHTML=`<div class=\"result-card\"><h3>Resultado registrado · Slot ${selectedSlot}</h3><div class=\"data-grid\"><div class=\"data-cell\"><span>Placar</span><b>${esc(r.score||`${r.gf}-${r.ga}`)}</b></div><div class=\"data-cell\"><span>Formações</span><b>${esc(r.myFormation)} × ${esc(r.oppFormation)}</b></div><div class=\"data-cell\"><span>Posse</span><b>${esc(st.myPossession)} × ${esc(st.oppPossession)}</b></div><div class=\"data-cell\"><span>Remates</span><b>${esc(st.myShots)} × ${esc(st.oppShots)}</b></div><div class=\"data-cell\"><span>Faltas</span><b>${esc(st.myFouls)} × ${esc(st.oppFouls)}</b></div><div class=\"data-cell\"><span>🟨</span><b>${esc(st.myYellowCards)} × ${esc(st.oppYellowCards)}</b></div><div class=\"data-cell\"><span>🟥</span><b>${esc(st.myRedCards)} × ${esc(st.oppRedCards)}</b></div></div><p class=\"good-text small\">Salvo no histórico e no aprendizado.</p></div>`}

function renderVideoPreview(file){
  const url=URL.createObjectURL(file);
  els.mediaPreview.innerHTML=`<div class="video-selected"><video controls playsinline preload="metadata" src="${url}"></video><div><b>${esc(file.name)}</b><span>${(file.size/1024/1024).toFixed(1)} MB · vídeo enviado diretamente para a IA</span></div></div>`;
}

async function analyzeImagesDirect(frames){
 const parts=[{text:visionPrompt()}];
 for(const f of frames)parts.push({inlineData:{mimeType:f.mimeType,data:f.base64}});
 return geminiJson(parts,{temperature:.03,maxOutputTokens:9000});
}

async function analyzeVideoDirect(file){
 const key=localStorage.getItem(API_KEY_STORAGE);
 setProgress(18,'Enviando o vídeo ao Gemini…');
 const uploaded=await uploadGeminiFile(file,key);
 setProgress(42,'Gemini processando o vídeo…');
 const ready=await waitGeminiFile(uploaded,key);
 setProgress(58,'Lendo o vídeo com um único prompt…');
 const parts=[
   {text:visionPrompt()},
   {fileData:{mimeType:ready.mimeType||file.type||'video/mp4',fileUri:ready.uri},mediaProcessing:'AGENTIC'}
 ];
 return geminiJson(parts,{temperature:.03,maxOutputTokens:10000});
}

async function uploadGeminiFile(file,key){
 const start=await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(key)}`,{
   method:'POST',
   headers:{
     'X-Goog-Upload-Protocol':'resumable',
     'X-Goog-Upload-Command':'start',
     'X-Goog-Upload-Header-Content-Length':String(file.size),
     'X-Goog-Upload-Header-Content-Type':file.type||'video/mp4',
     'Content-Type':'application/json'
   },
   body:JSON.stringify({file:{display_name:file.name}})
 });
 if(!start.ok)throw new Error(`Falha ao iniciar upload do vídeo (${start.status}).`);
 const uploadUrl=start.headers.get('x-goog-upload-url');
 if(!uploadUrl)throw new Error('Gemini não retornou URL de upload. Atualize a página e tente novamente.');
 const up=await fetch(uploadUrl,{
   method:'POST',
   headers:{
     'X-Goog-Upload-Offset':'0',
     'X-Goog-Upload-Command':'upload, finalize',
     'Content-Type':file.type||'video/mp4'
   },
   body:file
 });
 if(!up.ok)throw new Error(`Falha ao enviar vídeo ao Gemini (${up.status}).`);
 const data=await up.json();
 return data.file||data;
}

async function waitGeminiFile(file,key){
 let current=file;
 for(let i=0;i<30;i++){
   const stateName=String(current.state?.name||current.state||'').toUpperCase();
   if(stateName==='ACTIVE'||(!stateName&&current.uri))return current;
   if(stateName==='FAILED')throw new Error('Gemini não conseguiu processar este vídeo.');
   await new Promise(r=>setTimeout(r,2000));
   const name=current.name||'';
   const url=`https://generativelanguage.googleapis.com/v1beta/${name}?key=${encodeURIComponent(key)}`;
   const r=await fetch(url);
   if(!r.ok)throw new Error(`Falha ao consultar processamento do vídeo (${r.status}).`);
   current=await r.json();
 }
 throw new Error('O processamento do vídeo demorou demais. Tente novamente.');
}

function applyRecommendedTactics(result){
 for(const c of result.captures||[]){
   const n=resolveCaptureSlot(c);
   if(!n||!c.recommendedTactic)continue;
   const s=state.slots[n-1];
   s.tactic=sanitizeTactic(c.recommendedTactic,s);
   s.tactic.engine='Gemini vídeo';
   s.tactic.generatedAt=nowIso();
 }
}

function setProgress(p,text){els.progressBar.style.width=`${Math.max(0,Math.min(100,p))}%`;els.progressText.textContent=text}
async function imageFileToFrame(file){const data=await fileToDataUrl(file);const img=await loadImage(data);return canvasFrameFromImage(img,0,file.name)}
function fileToDataUrl(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)})}
function loadImage(src){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src})}
async function extractVideoFrames(file){const url=URL.createObjectURL(file);const v=document.createElement('video');v.src=url;v.muted=true;v.playsInline=true;v.preload='metadata';await new Promise((res,rej)=>{v.onloadedmetadata=res;v.onerror=()=>rej(new Error(`Não consegui abrir ${file.name}`))});const dur=Math.max(.1,v.duration||1);const maxCandidates=54;const step=Math.max(.7,dur/maxCandidates);const out=[];let prev=null;let i=0;for(let t=.08;t<dur;t+=step){await seekVideo(v,Math.min(t,dur-.05));const frame=captureVideoFrame(v,t,file.name);const thumb=frame.thumb;const diff=prev?pixelDiff(prev,thumb):100;prev=thumb;if(diff>=6||i%5===0||t+step>=dur){frame.score=diff;out.push(frame)}i++;if(i>maxCandidates+4)break}URL.revokeObjectURL(url);return out}
function seekVideo(v,t){return new Promise(res=>{let done=false;const finish=()=>{if(done)return;done=true;v.removeEventListener('seeked',finish);res()};v.addEventListener('seeked',finish,{once:true});v.currentTime=t;setTimeout(finish,900)})}
function captureVideoFrame(v,t,name){
 const maxW=1280,scale=Math.min(1,maxW/(v.videoWidth||maxW));const w=Math.max(320,Math.round((v.videoWidth||1280)*scale)),h=Math.max(180,Math.round((v.videoHeight||720)*scale));
 const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.drawImage(v,0,0,w,h);const dataUrl=c.toDataURL('image/jpeg',.82);
 const tw=96,th=54,tc=document.createElement('canvas');tc.width=tw;tc.height=th;const tx=tc.getContext('2d');tx.drawImage(v,0,0,tw,th);const data=tx.getImageData(0,0,tw,th).data;
 const thumb=new Uint8Array(tw*th),hist=new Uint16Array(16);let bright=0,sat=0,leftWhite=0,leftN=0,bottomWhite=0,bottomN=0,rightBlue=0,rightGreen=0,rightN=0,dark=0;
 for(let py=0;py<th;py++)for(let px=0;px<tw;px++){const j=py*tw+px,i=j*4,r=data[i],g=data[i+1],b=data[i+2],gray=Math.round((r+g+b)/3);thumb[j]=gray;hist[Math.min(15,Math.floor(gray/16))]++;bright+=gray;const mx=Math.max(r,g,b),mn=Math.min(r,g,b);sat+=mx-mn;if(gray<75)dark++;if(px<tw*.42){leftN++;if(r>190&&g>190&&b>190)leftWhite++}if(py>th*.48){bottomN++;if(r>185&&g>185&&b>185)bottomWhite++}if(px>tw*.42){rightN++;if(b>115&&b>r*1.18&&b>g*.92)rightBlue++;if(g>95&&g>r*1.18&&g>b*.82)rightGreen++;}}
 const count=tw*th;return {dataUrl,base64:dataUrl.split(',')[1],mimeType:'image/jpeg',time:t,name,thumb,hist,brightness:bright/count,saturation:sat/count,score:0,layout:{leftWhite:leftN?leftWhite/leftN:0,bottomWhite:bottomN?bottomWhite/bottomN:0,rightBlue:rightN?rightBlue/rightN:0,rightGreen:rightN?rightGreen/rightN:0,dark:dark/count}};
}
function canvasFrameFromImage(img,t,name){const maxW=1280,scale=Math.min(1,maxW/img.naturalWidth);const w=Math.round(img.naturalWidth*scale),h=Math.round(img.naturalHeight*scale);const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);const dataUrl=c.toDataURL('image/jpeg',.8);return {dataUrl,base64:dataUrl.split(',')[1],mimeType:'image/jpeg',time:t,name,score:100}}
function pixelDiff(a,b){if(!a||!b||a.length!==b.length)return 100;let s=0;for(let i=0;i<a.length;i++)s+=Math.abs(a[i]-b[i]);return s/a.length}
function histDiff(a,b){if(!a||!b)return 100;let s=0,tot=0;for(let i=0;i<a.length;i++){s+=Math.abs(a[i]-b[i]);tot+=Math.max(a[i],b[i])}return tot?100*s/tot:0}
function frameDistance(a,b){
 if(!a||!b)return 100;
 const p=pixelDiff(a.thumb,b.thumb);
 const h=histDiff(a.hist,b.hist);
 const br=Math.abs((a.brightness||0)-(b.brightness||0));
 const st=Math.abs((a.saturation||0)-(b.saturation||0));
 return p*.58+h*.22+br*.12+st*.08;
}
function scenePriority(f){
 let p=f.score||0;
 // Telas de relatório/lista do OSM tendem a ter brilho maior e saturação menor que o estádio.
 if((f.brightness||0)>135)p+=12;
 if((f.saturation||0)<45)p+=8;
 return p;
}
function chooseDiverseFrames(frames,max){
 if(frames.length<=max)return [...frames].sort((a,b)=>(a.time||0)-(b.time||0));
 const sorted=[...frames].sort((a,b)=>(a.time||0)-(b.time||0));
 const picked=[];
 // 1) cobertura temporal obrigatória: um representante por faixa
 const bins=Math.min(max,12),dur=(sorted.at(-1)?.time||1)-(sorted[0]?.time||0)||1;
 for(let b=0;b<bins;b++){
   const lo=(sorted[0]?.time||0)+dur*b/bins,hi=(sorted[0]?.time||0)+dur*(b+1)/bins;
   const group=sorted.filter(f=>(f.time||0)>=lo&&(f.time||0)<=hi);
   if(!group.length)continue;
   const best=[...group].sort((a,b)=>scenePriority(b)-scenePriority(a))[0];
   if(best&&!picked.includes(best))picked.push(best);
 }
 // 2) diversidade visual máxima (farthest point)
 while(picked.length<max){
   let best=null,bestScore=-1;
   for(const f of sorted){
     if(picked.includes(f))continue;
     const minD=picked.length?Math.min(...picked.map(p=>frameDistance(f,p))):100;
     const score=minD+scenePriority(f)*.18;
     if(score>bestScore){best=f;bestScore=score}
   }
   if(!best)break;
   if(picked.length>=4 && Math.min(...picked.map(p=>frameDistance(best,p)))<7)break;
   picked.push(best);
 }
 return picked.sort((a,b)=>(a.time||0)-(b.time||0)).slice(0,max);
}
function dedupeFrames(frames,max){return chooseDiverseFrames(frames,max)}
function renderFramePreview(frames){els.mediaPreview.innerHTML=frames.slice(0,12).map(f=>`<img src="${f.dataUrl}" title="${esc(f.name)} ${Math.round(f.time||0)}s">`).join('')}


function hybridPrompt(ocr){
 const target=els.slotTarget.value;
 const slotHint=target==='auto'?'detectar pelo conteúdo':`usar Slot ${target}`;
 const baseKnown=target!=='auto'&&state.slots[Number(target)-1]?state.slots[Number(target)-1]:null;
 if(analysisMode==='tactic')return `Você é um especialista em OSM 26. O navegador já executou OCR LOCAL e separou exatamente as 6 telas obrigatórias para decidir a tática.

DESTINO: ${slotHint}

AS 6 TELAS OBRIGATÓRIAS:
1) Tela da partida
2) Meu elenco / força por setor
3) Elenco do adversário / força por setor
4) Analista — relatório
5) Analista — plano, marcação e impedimento
6) Analista — formação

SEPARAÇÃO FEITA PELO APP:
${JSON.stringify(ocr.required||{},null,2)}

TELAS AUSENTES:
${JSON.stringify(ocr.missingRequired||[])}

OCR COMPLETO DE APOIO:
${ocr.joined}

DADOS JÁ SALVOS DO SLOT (use apenas como apoio quando não contradizer o OCR):
${JSON.stringify(baseKnown?{
 teamName:baseKnown.teamName,competitionName:baseKnown.competitionName,competitionType:baseKnown.competitionType,
 round:baseKnown.round,totalRounds:baseKnown.totalRounds,myTeam:baseKnown.myTeam,opponent:baseKnown.opponent,match:baseKnown.match
}:null)}

TAREFA:
- Use prioritariamente as 6 telas separadas acima.
- Não invente nada.
- DETECÇÃO HUMANO/CPU: na primeira tela, o meu nick é sempre leandrozzy. Se houver outro nome de usuário visível abaixo do adversário, opponent.human=true e opponent.manager=esse nome. Se não houver nome de usuário sob o adversário, opponent.human=false.
- Se uma tela obrigatória não foi detectada, liste isso em "missing".
- Extraia: meu time, adversário, competição, rodada, casa/fora, árbitro, força geral dos dois times, GOL/DEF/MEI/ATA dos dois times quando visível, estádio, humano/CPU, bônus, CT/treino secreto.
- Do Data Analyst rival, extraia obrigatoriamente: formação, estilo/plano, marcação e impedimento.
- Gere UMA tática final completa: formation, gamePlan, pressure, mentality, tempo, marking, offside, tackling, attackInstruction, midfieldInstruction, defenceInstruction.
- Não confunda a minha tática com a do rival.
- Use números inteiros 0–100 nos sliders.

RETORNE APENAS JSON:
{"captures":[{"slotNumber":1,"confidence":0.0,"screensSeen":["match_overview","my_squad","opponent_squad","analyst_report","analyst_plan","analyst_formation"],"teamName":null,"competitionName":null,"competitionType":null,"round":null,"totalRounds":null,"myTeam":{"overall":null,"goalkeeper":null,"defence":null,"midfield":null,"attack":null,"squadValue":null,"playerCount":null,"stadium":null,"loginBonus":null,"secretTraining":null,"trainingCamp":null,"leaguePosition":null},"opponent":{"teamName":null,"human":null,"manager":null,"overall":null,"goalkeeper":null,"defence":null,"midfield":null,"attack":null,"squadValue":null,"playerCount":null,"stadium":null,"loginBonus":null,"secretTraining":null,"trainingCamp":null,"formation":null,"style":null,"marking":null,"offside":null,"tackling":null},"match":{"venue":null,"refereeName":null,"refereeColor":null,"exactDateTimeText":null,"countdownText":null},"roster":[],"market":[],"result":{},"missing":[],"recommendedTactic":{"formation":"","gamePlan":"","pressure":0,"mentality":0,"tempo":0,"marking":"À zona","offside":"Não","tackling":"Normal","attackInstruction":"","midfieldInstruction":"","defenceInstruction":"","confidence":"média","reason":""}}]}`;
 return `Você é um especialista em evolução de elenco no OSM 26. O navegador já rodou OCR LOCAL em um vídeo SOMENTE DO ELENCO do usuário. NÃO procure lista de transferências e NÃO invente jogador.

DESTINO: ${slotHint}
TEXTO OCR:
${ocr.joined}

REGRAS:
- Extraia apenas jogadores que pertencem ao MEU elenco mostrado no vídeo.
- Para cada jogador, leia nome, posição, rating/força, valor, idade e se está em treinamento.
- POSIÇÃO: leia EXATAMENTE a coluna "Pos". Códigos válidos do OSM: GR, DD, DC, DE, MDC, MC, MCO, MD, ME, PL, ED, EE. NÃO deduza a posição pelos números Ata/Def/Med.
- RATING/FORÇA: use o atributo principal coerente com a posição mostrado na mesma linha (GR para goleiro; Def para DD/DC/DE; Med para MDC/MC/MCO/MD/ME; Ata para PL/ED/EE).
- Camisa/ícone laranja = EM TREINAMENTO.
- Não marque jogador como vendido ou à venda apenas por cor de camisa.
- Se o mesmo jogador aparecer mais de uma vez na rolagem, consolide em uma única entrada.
- Calcule playerCount e squadValue somente a partir dos dados visíveis quando possível.
- NÃO retorne jogadores do mercado de transferências.
- Se não estiver claro, use null.

RETORNE APENAS JSON:
{"captures":[{"slotNumber":1,"confidence":0.0,"screensSeen":["squad","training"],"teamName":null,"competitionName":null,"competitionType":null,"round":null,"totalRounds":null,"myTeam":{"overall":null,"goalkeeper":null,"defence":null,"midfield":null,"attack":null,"squadValue":null,"playerCount":null},"opponent":{},"match":{},"roster":[{"name":"","position":null,"rating":null,"value":null,"age":null,"training":false,"forSale":false}],"market":[],"result":{},"missing":[]}]}`;
}

function visionPrompt(){
 const target=els.slotTarget.value;
 const tacticMode=analysisMode==='tactic';
 if(tacticMode)return `Você é um especialista em OSM 26 analisando UM VÍDEO real do jogo. Leia a sequência inteira e retorne em UMA ÚNICA RESPOSTA os fatos da partida e UMA tática final completa para eu digitar manualmente no OSM.

OBJETIVO: maximizar a chance de vitória sem inventar dados.

O QUE EXTRAIR DO VÍDEO:
- slot quando visível (ou use o destino fixo ${target});
- meu time, rival, competição, rodada;
- casa/fora;
- força geral dos dois times;
- GOL/DEF/MEI/ATA dos dois times quando aparecer;
- valor do elenco e número de jogadores quando aparecer;
- estádio;
- árbitro/cor;
- humano ou CPU: humano=true somente quando houver nick/manager visível abaixo do time;
- bônus de login;
- campo de treinamento e treino secreto;
- Data Analyst completo do rival: formação, estilo/plano, marcação e impedimento;
- horário/contagem da próxima partida.

REGRAS:
1. Se não estiver claramente visível, use null. Nunca estime um dado ausente.
2. Não confunda a MINHA tela de tática com a tática do rival.
3. Se treino secreto impedir conhecer a tática rival, mantenha os campos táticos rivais null.
4. Gere UMA tática, sem alternativas.
5. Formação deve ser uma formação real do OSM.
6. Estilo de jogo deve ser um destes: Jogar pelas alas, Jogo de passes, Contra-ataque, Chutar de longe, Bola longa.
7. sliders pressure, mentality e tempo devem ser inteiros de 0 a 100.
8. Retorne também marcação, impedimento, desarme e táticas por setor.
9. Árbitro vermelho/rigoroso: evite desarme excessivo.
10. Considere humano/CPU, casa/fora, força relativa, setores, CT, treino secreto e Data Analyst.
11. Não prometa vitória.

RETORNE APENAS JSON VÁLIDO:
{"captures":[{
 "slotNumber":1,"confidence":0.0,"screensSeen":[],
 "teamName":null,"competitionName":null,"competitionType":null,"round":null,"totalRounds":null,
 "myTeam":{"overall":null,"goalkeeper":null,"defence":null,"midfield":null,"attack":null,"squadValue":null,"playerCount":null,"stadium":null,"loginBonus":null,"secretTraining":null,"trainingCamp":null},
 "opponent":{"teamName":null,"human":null,"manager":null,"overall":null,"goalkeeper":null,"defence":null,"midfield":null,"attack":null,"squadValue":null,"playerCount":null,"stadium":null,"loginBonus":null,"secretTraining":null,"trainingCamp":null,"formation":null,"style":null,"marking":null,"offside":null,"tackling":null},
 "match":{"venue":null,"refereeName":null,"refereeColor":null,"exactDateTimeText":null,"countdownText":null},
 "roster":[],"market":[],"result":{},"missing":[],
 "recommendedTactic":{"formation":"","gamePlan":"","pressure":0,"mentality":0,"tempo":0,"marking":"À zona","offside":"Não","tackling":"Normal","attackInstruction":"","midfieldInstruction":"","defenceInstruction":"","confidence":"média","reason":""}
}]}`;
 return `Você é um especialista em mercado e evolução de elenco no OSM 26 analisando UM VÍDEO real do jogo. NÃO gere tática de partida. Leia o vídeo inteiro e extraia somente elenco, treinamento e transferências para o slot ${target}.

REGRAS:
1. Não invente jogador, rating, idade, valor ou preço.
2. Camisa/ícone laranja = jogador EM TREINAMENTO, não à venda.
3. Venda = setas/ícone de transferência.
4. Preserve nomes como aparecem.
5. Extraia o maior número possível de jogadores ao longo da rolagem do vídeo.
6. Se um campo não estiver visível, use null.

RETORNE APENAS JSON VÁLIDO:
{"captures":[{
 "slotNumber":1,"confidence":0.0,"screensSeen":["squad","training","market"],
 "teamName":null,"competitionName":null,"competitionType":null,"round":null,"totalRounds":null,
 "myTeam":{},"opponent":{},"match":{},
 "roster":[{"name":"","position":null,"rating":null,"value":null,"age":null,"training":false,"forSale":false}],
 "market":[{"name":"","position":null,"rating":null,"attack":null,"defence":null,"value":null,"price":null,"age":null,"club":null}],
 "result":{},"missing":[]
}]}`;
}
async function analyzeFrames(frames){if(!frames.length)throw new Error('Nenhum quadro utilizável encontrado.');const parts=[{text:visionPrompt()}];for(const f of frames)parts.push({inlineData:{mimeType:f.mimeType,data:f.base64}});return geminiJson(parts,{temperature:.03,maxOutputTokens:9000})}
async function geminiJson(parts,opts={}){
 const key=localStorage.getItem(API_KEY_STORAGE);
 if(!key)throw new Error('API Gemini não configurada.');
 const candidates=await availableModels(key);
 let ordered=[settings.model,...candidates].filter((x,i,a)=>x&&a.indexOf(x)===i);
 let last='';
 for(const model of ordered){
   for(let tryNo=0;tryNo<2;tryNo++){
     const body={contents:[{role:'user',parts}],generationConfig:{temperature:opts.temperature??.12,maxOutputTokens:opts.maxOutputTokens||9000,responseMimeType:'application/json'}};
     let res;
     try{res=await geminiFetch(model,key,body)}catch(e){last=e.message;continue}
     if(res.ok){
       const data=await res.json();
       const text=(data.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('').trim();
       if(!text)throw new Error('A IA não retornou conteúdo utilizável.');
       settings.model=model;saveSettingsObj();hydrateSettings();
       return parseJsonText(text);
     }
     const status=res.status,txt=await res.text();last=`Gemini ${status}: ${txt.slice(0,260)}`;
     if(![429,500,503].includes(status))break;
     await new Promise(r=>setTimeout(r,1600*(tryNo+1)));
   }
 }
 throw new Error(last||'Gemini temporariamente indisponível.');
}
async function availableModels(key){
 try{
   const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
   if(!r.ok)return ['gemini-3.8-flash','gemini-3.7-flash','gemini-3.6-flash','gemini-3.5-flash-lite','gemini-3.5-flash'];
   const d=await r.json();
   const names=(d.models||[]).filter(m=>(m.supportedGenerationMethods||[]).includes('generateContent')).map(m=>(m.name||'').replace('models/',''));
   const pref=['gemini-3.8-flash','gemini-3.7-flash','gemini-3.6-flash','gemini-3.5-flash-lite','gemini-3.5-flash'];
   return [...pref.filter(x=>names.includes(x)),...names.filter(x=>/flash/i.test(x)&&!pref.includes(x))];
 }catch{return ['gemini-3.8-flash','gemini-3.7-flash','gemini-3.6-flash','gemini-3.5-flash-lite','gemini-3.5-flash']}
}
function geminiFetch(model,key,body){return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(body)})}
function parseJsonText(text){let s=text.trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();try{return JSON.parse(s)}catch{const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a>=0&&b>a)return JSON.parse(s.slice(a,b+1));throw new Error('Resposta da IA não veio em JSON válido.') }}
async function pickAvailableModel(key){try{return (await availableModels(key))[0]||null}catch{return null}}

function resolveTouchedSlots(result){const out=[];for(const c of result.captures||[]){const n=resolveCaptureSlot(c);if(n&&!out.includes(n))out.push(n)}return out}
function resolveCaptureSlot(c){const target=els.slotTarget?.value;if(target&&target!=='auto')return Number(target);if([1,2,3,4].includes(Number(c.slotNumber)))return Number(c.slotNumber);if(c.teamName){const found=state.slots.find(s=>s.teamName&&normalize(s.teamName)===normalize(c.teamName));if(found)return found.slotNumber;const empty=state.slots.find(s=>s.status==='empty');if(empty)return empty.slotNumber}return null}
function normalize(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function applyVisionResult(result){for(const c of result.captures||[]){const n=resolveCaptureSlot(c);if(!n)continue;const s=state.slots[n-1];s.status='active';s.createdAt=s.createdAt||nowIso();s.updatedAt=nowIso();for(const k of ['teamName','competitionName','competitionType','round','totalRounds'])if(c[k]!==null&&c[k]!==undefined&&c[k]!=='')s[k]=c[k];s.myTeam=mergeNonNull(s.myTeam,c.myTeam||{});s.opponent=mergeNonNull(s.opponent,c.opponent||{});s.match=mergeNonNull(s.match,c.match||{});if(c.match?.countdownText)s.match.nextMatchAt=parseCountdownToIso(c.match.countdownText)||s.match.nextMatchAt;if(c.match?.exactDateTimeText){const d=parseLooseDateTime(c.match.exactDateTimeText);if(d)s.match.nextMatchAt=d.toISOString()}if(Array.isArray(c.roster)&&c.roster.length)s.roster=mergePlayers(s.roster,c.roster);if(Array.isArray(c.market)&&c.market.length)s.market=c.market;s.coverage={...s.coverage,...Object.fromEntries((c.screensSeen||[]).map(x=>[x,true]))};s.missing=buildMissing(s,c.missing||[]);if(c.result?.score)recordExtractedResult(s,c.result);s.marketPlan=buildLocalMarketPlan(s);}
}
function mergeNonNull(old,nw){const out={...(old||{})};for(const [k,v] of Object.entries(nw||{}))if(v!==null&&v!==undefined&&v!=='')out[k]=v;return out}
function mergePlayers(old,nw){const map=new Map((old||[]).map(p=>[normalize(p.name),p]));for(const p of nw){const k=normalize(p.name);if(!k)continue;map.set(k,mergeNonNull(map.get(k)||{},p))}return [...map.values()]}
function buildMissing(s,extra){const m=[];if(!s.teamName)m.push('meu time');if(!s.opponent.teamName)m.push('adversário');if(s.myTeam.overall==null)m.push('minha força');if(s.opponent.overall==null)m.push('força rival');if(!s.opponent.secretTraining&&!s.coverage.dashboard&&s.opponent.secretTraining==null)m.push('tela inicial');if(!s.opponent.formation)m.push('formação rival / Data Analyst');if(!s.opponent.style)m.push('plano rival');if(!s.opponent.marking)m.push('marcação rival');if(s.opponent.offside==null)m.push('impedimento rival');if(!s.match.refereeColor&&!s.match.refereeName)m.push('árbitro');if(!s.roster.length)m.push('elenco');if(!s.market.length)m.push('mercado');if(!s.match.nextMatchAt)m.push('horário');for(const x of extra)if(x&&!m.includes(x))m.push(x);return [...new Set(m)]}
function parseCountdownToIso(text){if(!text)return null;const s=String(text).toLowerCase();let ms=0;const d=s.match(/(\d+)\s*d/),h=s.match(/(\d+)\s*h/),m=s.match(/(\d+)\s*m/);if(d)ms+=Number(d[1])*86400000;if(h)ms+=Number(h[1])*3600000;if(m)ms+=Number(m[1])*60000;return ms?new Date(Date.now()+ms).toISOString():null}
function parseLooseDateTime(text){if(!text)return null;const d=new Date(text);return Number.isNaN(d.getTime())?null:d}
function recordExtractedResult(s,r){if((s.results||[]).some(x=>x.score===r.score&&x.opponent===r.opponent))return;s.results=s.results||[];s.results.push({createdAt:nowIso(),score:r.score,gf:r.gf,ga:r.ga,opponent:r.opponent||s.opponent.teamName,stats:r.stats||{},tactic:s.tactic?structuredClone(s.tactic):null})}
function renderAnalysisResult(result){const caps=result.captures||[];const cov={};for(const c of caps)for(const x of c.screensSeen||[])cov[x]=true;els.coveragePanel.classList.remove('hidden');els.coveragePanel.innerHTML=`<b>Cobertura detectada</b><div class="coverage-grid">${Object.entries(COVERAGE_LABELS).map(([k,l])=>`<div class="coverage-item ${cov[k]?'ok':'no'}">${cov[k]?'✓':'○'} ${esc(l)}</div>`).join('')}</div>`;els.analysisResult.innerHTML=caps.map(c=>{const n=resolveCaptureSlot(c);return `<div class="result-card"><h3>${n?`Slot ${n} · `:''}${esc(c.teamName||'Time não identificado')}</h3><div class="data-grid"><div class="data-cell"><span>Adversário</span><b>${esc(c.opponent?.teamName)}</b></div><div class="data-cell"><span>Força</span><b>${esc(c.myTeam?.overall)} × ${esc(c.opponent?.overall)}</b></div><div class="data-cell"><span>Formação rival</span><b>${esc(c.opponent?.formation)}</b></div><div class="data-cell"><span>Mercado</span><b>${(c.market||[]).length} jogadores</b></div></div>${c.recommendedTactic?`<p class="small good-text"><b>Tática gerada no mesmo processamento:</b> ${esc(c.recommendedTactic.formation)} · ${esc(c.recommendedTactic.gamePlan)} · P ${esc(c.recommendedTactic.pressure)} / E ${esc(c.recommendedTactic.mentality)} / R ${esc(c.recommendedTactic.tempo)}</p>`:''}${c.missing?.length?`<p class="small warn-text">Ainda faltou mostrar: ${c.missing.map(esc).join(', ')}</p>`:'<p class="small good-text">Leitura principal completa.</p>'}</div>`}).join('')||'<div class="result-card">Nenhum slot foi identificado.</div>'}


function strengthBucket(s){
 const a=Number(s.myTeam?.overall),b=Number(s.opponent?.overall);
 if(!Number.isFinite(a)||!Number.isFinite(b))return 'unknown';
 const d=a-b;
 if(d>=20)return 'much_stronger';
 if(d>=7)return 'stronger';
 if(d>-7)return 'balanced';
 if(d>-15)return 'weaker';
 return 'much_weaker';
}
function tacticSignature(t){
 if(!t)return null;
 return [t.formation,t.gamePlan,t.pressure,t.mentality,t.tempo,t.marking,t.offside,t.tackling,t.attackInstruction,t.midfieldInstruction,t.defenceInstruction].join('|');
}
function buildLearningSummary(s){
 const results=(s.results||[]).filter(r=>Number.isFinite(r.gf)&&Number.isFinite(r.ga));
 const rows=results.slice(-20).map(r=>({
   outcome:r.gf>r.ga?'W':r.gf<r.ga?'L':'D',
   gf:r.gf,ga:r.ga,
   opponent:r.opponent,
   opponentFormation:r.context?.oppFormation||null,
   venue:r.context?.venue||null,
   strengthDiff:(Number(r.context?.myOverall)-Number(r.context?.oppOverall)),
   tactic:r.tactic||null,
   tacticSignature:tacticSignature(r.tactic)
 }));
 const bySig={};
 for(const r of rows){
   if(!r.tacticSignature)continue;
   bySig[r.tacticSignature]=bySig[r.tacticSignature]||{games:0,wins:0,draws:0,losses:0,gf:0,ga:0,tactic:r.tactic};
   const x=bySig[r.tacticSignature];x.games++;x.gf+=r.gf;x.ga+=r.ga;
   if(r.outcome==='W')x.wins++;else if(r.outcome==='D')x.draws++;else x.losses++;
 }
 const patterns=Object.values(bySig).sort((a,b)=>b.games-a.games).slice(0,5).map(x=>({
   games:x.games,wins:x.wins,draws:x.draws,losses:x.losses,gf:x.gf,ga:x.ga,tactic:x.tactic
 }));
 return {games:rows.length,currentStrengthBucket:strengthBucket(s),recent:rows.slice(-8),patterns};
}
function tacticContext(s){const recent=(s.results||[]).slice(-8).map(r=>({opponent:r.opponent,score:r.score,result:resultLabel(r),tactic:r.tactic}));return {slotNumber:s.slotNumber,competitionType:s.competitionType,teamName:s.teamName,round:s.round,totalRounds:s.totalRounds,myTeam:s.myTeam,opponent:s.opponent,match:s.match,recentResults:recent,learningSummary:buildLearningSummary(s),allowedFormations:FORMATIONS,allowedGamePlans:GAME_PLANS}}
function resultLabel(r){if(Number.isFinite(r.gf)&&Number.isFinite(r.ga))return r.gf>r.ga?'Vitória':r.gf<r.ga?'Derrota':'Empate';return null}
async function generateTacticForSlot(n,silent=false){const s=state.slots[n-1];if(s.status!=='active')return;if(!localStorage.getItem(API_KEY_STORAGE)){apiModal('Salve sua chave Gemini para gerar táticas.');return}if(!silent)toast(`Gerando tática do Slot ${n}…`);try{const prompt=`Você é um analista especialista em OSM. Gere UMA tática completa, sem alternativas, visando maximizar a chance de vitória. Não existe garantia de vitória. Use somente os dados fornecidos e o histórico. Nunca invente dados ausentes.\n\nREGRAS:\n- Considere força relativa, setores, casa/fora, estádio quando relevante, humano x computador, CT, treino secreto, árbitro, Data Analyst e histórico recente.\n- Contra humano, dê mais peso ao risco de mudança tardia de tática; contra computador, use abordagem mais estável.\n- Se o adversário fez treino secreto e dados táticos não existem, não invente a formação rival.\n- Árbitro vermelho/rigoroso => evitar desarme excessivo. Árbitro permissivo pode aceitar mais agressividade.\n- Se a vantagem de força for superior a 20 pontos, prefira uma abordagem dominante 4-3-3 coerente, a menos que os dados mostrem motivo forte para não usar.\n- Formação deve estar em allowedFormations. Plano deve estar em allowedGamePlans.\n- Pressão, Estilo/Mentalidade e Temporização/Ritmo são inteiros 0-100.\n- Saída avançada deve usar termos curtos do jogo em português.\n- Retorne somente JSON válido.\n\nDADOS:\n${JSON.stringify(tacticContext(s))}\n\nFORMATO:\n{"formation":"4-3-3 A","gamePlan":"Jogar pelas alas","pressure":70,"mentality":70,"tempo":70,"marking":"À zona","offside":"Não","tackling":"Normal","attackInstruction":"Atacar apenas","midfieldInstruction":"Manter posição","defenceInstruction":"Defender atrás","confidence":"média","reason":"resumo curto baseado somente nos dados"}`;const t=await geminiJson([{text:prompt}],{temperature:.12,maxOutputTokens:2200});s.tactic=sanitizeTactic(t,s);s.updatedAt=nowIso();saveState();if(!silent)tacticModal(n);return s.tactic}catch(e){console.error(e);s.tactic=fallbackTactic(s);saveState();if(!silent){toast('Gemini falhou; foi usada a regra local de segurança');tacticModal(n)}return s.tactic}}
function sanitizeTactic(t,s){const out={formation:FORMATIONS.includes(t.formation)?t.formation:null,gamePlan:GAME_PLANS.includes(t.gamePlan)?t.gamePlan:null,pressure:clampInt(t.pressure),mentality:clampInt(t.mentality),tempo:clampInt(t.tempo),marking:['À zona','Marcação à zona','Individual','Marcação individual'].includes(t.marking)?t.marking:'À zona',offside:/sim/i.test(String(t.offside))?'Sim':'Não',tackling:t.tackling||refereeTackling(s.match.refereeColor||s.match.refereeName),attackInstruction:t.attackInstruction||'Atacar apenas',midfieldInstruction:t.midfieldInstruction||'Manter posição',defenceInstruction:t.defenceInstruction||'Defender atrás',confidence:t.confidence||'média',reason:t.reason||'Gerada a partir dos dados disponíveis.',generatedAt:nowIso(),engine:'Gemini'};if(!out.formation||!out.gamePlan)return {...fallbackTactic(s),reason:out.reason,generatedAt:out.generatedAt,engine:'Híbrido'};return out}
function clampInt(v){const n=Math.round(Number(v));return Number.isFinite(n)?Math.max(0,Math.min(100,n)):null}
function refereeTackling(r){const s=normalize(r);if(/red|vermel|strict|rigor/.test(s))return 'Cuidadoso';if(/green|verde|lenient|permiss/.test(s))return 'Agressivo';return 'Normal'}
function fallbackTactic(s){const a=Number(s.myTeam.overall),b=Number(s.opponent.overall),diff=Number.isFinite(a)&&Number.isFinite(b)?a-b:null;let formation='4-3-3 B',gamePlan='Jogo de passes',pressure=60,mentality=58,tempo=67,mid='Manter posição';if(diff!==null&&diff>20){formation='4-3-3 A';gamePlan='Jogar pelas alas';pressure=72;mentality=72;tempo=70}else if(diff!==null&&diff>=7){formation='4-3-3 B';gamePlan='Jogar pelas alas';pressure=66;mentality=66;tempo=68}else if(diff!==null&&diff<=-15){formation='5-3-2';gamePlan='Contra-ataque';pressure=36;mentality=28;tempo=66;mid='Apoiar a defesa'}else if(diff!==null&&diff<0){formation='4-5-1';gamePlan='Chutar de longe';pressure=43;mentality=36;tempo=63;mid='Apoiar a defesa'}return {formation,gamePlan,pressure,mentality,tempo,marking:'À zona',offside:'Não',tackling:refereeTackling(s.match.refereeColor||s.match.refereeName),attackInstruction:'Atacar apenas',midfieldInstruction:mid,defenceInstruction:'Defender atrás',confidence:diff===null?'baixa':'média',reason:'Fallback local conservador baseado na força relativa e no árbitro; dados ausentes não foram estimados.',generatedAt:nowIso(),engine:'Local'}}
function tacticModal(n){const s=state.slots[n-1];const t=s.tactic;if(!t){generateTacticForSlot(n);return}const rows=[['Formação',t.formation],['Estilo de jogo',t.gamePlan],['Pressão',t.pressure],['Estilo/Mentalidade',t.mentality],['Temporização/Ritmo',t.tempo],['Marcação',t.marking],['Impedimento',t.offside],['Desarme',t.tackling],['Avançadas – Ataque',t.attackInstruction],['Avançadas – Meio',t.midfieldInstruction],['Avançadas – Defesa',t.defenceInstruction]];openModal(`<h2>Tática · Slot ${n}</h2><p class="muted small">${esc(s.teamName)} × ${esc(s.opponent.teamName)} · ${esc(t.engine||'IA')}</p><table class="tactic-table">${rows.map(([k,v])=>`<tr><td>${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join('')}</table><p class="small muted">${esc(t.reason||'')}</p><div class="actions"><button class="btn" onclick="generateTacticForSlot(${n})">Recalcular com dados atuais</button></div>`)}


function manualTacticModal(n){const s=state.slots[n-1]||defaultSlot(n),t=s.tactic||{};openModal(`<h2>Tática usada · Slot ${n}</h2><p class="muted small">Digite exatamente o que está configurado no OSM. Isso será salvo para o histórico/aprendizado.</p><div class="form-card"><label>Formação<select id="mtFormation">${FORMATIONS.map(x=>`<option${x===t.formation?' selected':''}>${x}</option>`).join('')}</select></label><label>Estilo de jogo<select id="mtPlan">${GAME_PLANS.map(x=>`<option${x===t.gamePlan?' selected':''}>${x}</option>`).join('')}</select></label><div class="data-grid"><label>Pressão (0–100)<input id="mtPressure" type="number" min="0" max="100" value="${esc(t.pressure??'')}"></label><label>Estilo / Mentalidade (0–100)<input id="mtMentality" type="number" min="0" max="100" value="${esc(t.mentality??'')}"></label><label>Temporização / Ritmo (0–100)<input id="mtTempo" type="number" min="0" max="100" value="${esc(t.tempo??'')}"></label></div><label>Marcação<select id="mtMarking"><option>À zona</option><option>Individual</option></select></label><label>Fazer fora de jogo<select id="mtOffside"><option>Não</option><option>Sim</option></select></label><label>Desarme<select id="mtTackling"><option>Cuidadoso</option><option>Normal</option><option>Agressivo</option><option>Extremo</option></select></label><label>Avançados<input id="mtAttack" value="${esc(t.attackInstruction||'Atacar apenas')}"></label><label>Meio-campo<input id="mtMid" value="${esc(t.midfieldInstruction||'Manter posição')}"></label><label>Defesa<input id="mtDef" value="${esc(t.defenceInstruction||'Defender atrás')}"></label><button class="btn" onclick="saveManualTactic(${n})">Salvar tática usada</button></div>`);setTimeout(()=>{for(const [id,val] of [['mtMarking',t.marking],['mtOffside',t.offside],['mtTackling',t.tackling]]){const e=document.getElementById(id);if(e&&val)e.value=val}},0)}
function saveManualTactic(n){const s=state.slots[n-1];s.tactic={formation:document.getElementById('mtFormation').value,gamePlan:document.getElementById('mtPlan').value,pressure:clampInt(document.getElementById('mtPressure').value),mentality:clampInt(document.getElementById('mtMentality').value),tempo:clampInt(document.getElementById('mtTempo').value),marking:document.getElementById('mtMarking').value,offside:document.getElementById('mtOffside').value,tackling:document.getElementById('mtTackling').value,attackInstruction:document.getElementById('mtAttack').value.trim(),midfieldInstruction:document.getElementById('mtMid').value.trim(),defenceInstruction:document.getElementById('mtDef').value.trim(),confidence:'manual',reason:'Tática digitada manualmente a partir do OSM.',generatedAt:nowIso(),engine:'Manual'};s.updatedAt=nowIso();saveState();closeModal();toast('Tática usada salva')}

function resultModal(n){const s=state.slots[n-1];openModal(`<h2>Resultado · Slot ${n}</h2><p class="muted">${esc(s.teamName)} × ${esc(s.opponent.teamName)}</p><div class="form-card"><div class="data-grid"><label>Meus gols<input id="resGF" type="number" min="0"></label><label>Gols rival<input id="resGA" type="number" min="0"></label></div><label>Observação opcional<input id="resNote" placeholder="Ex.: rival mudou para 4-5-1"></label><button class="btn" onclick="saveResult(${n})">Salvar resultado</button></div>`)}
function saveResult(n){const gf=Number(document.getElementById('resGF').value),ga=Number(document.getElementById('resGA').value);if(!Number.isFinite(gf)||!Number.isFinite(ga)){toast('Informe o placar');return}const s=state.slots[n-1];s.results=s.results||[];s.results.push({createdAt:nowIso(),opponent:s.opponent.teamName,gf,ga,score:`${gf}-${ga}`,note:document.getElementById('resNote').value.trim()||null,tactic:s.tactic?structuredClone(s.tactic):null,context:{myOverall:s.myTeam.overall,oppOverall:s.opponent.overall,oppFormation:s.opponent.formation,oppStyle:s.opponent.style,oppMarking:s.opponent.marking,oppOffside:s.opponent.offside,opponentHuman:s.opponent.human,venue:s.match.venue,referee:s.match.refereeColor||s.match.refereeName,trainingCamp:s.opponent.trainingCamp,secretTraining:s.opponent.secretTraining,strengthBucket:strengthBucket(s)}});s.tactic=null;if(Number.isFinite(Number(s.round)))s.round=Number(s.round)+1;s.updatedAt=nowIso();if(s.schedule?.length){const next=s.schedule.find(x=>!x.played&&x.dateTime&&new Date(x.dateTime).getTime()>Date.now());if(next)s.match.nextMatchAt=next.dateTime;else ensureNextMatchFromScheduleOrDefault(s)}else if(s.defaultMatchTime){const d=new Date(s.match.nextMatchAt||Date.now());d.setDate(d.getDate()+1);const [hh,mm]=s.defaultMatchTime.split(':').map(Number);d.setHours(hh,mm,0,0);s.match.nextMatchAt=d.toISOString()}saveState();closeModal();toast('Resultado salvo. O histórico foi incorporado ao aprendizado do Slot '+n+'.')}

function scheduleModal(n){const s=state.slots[n-1];let local='';if(s.match.nextMatchAt){const d=new Date(s.match.nextMatchAt);const off=d.getTimezoneOffset()*60000;local=new Date(d.getTime()-off).toISOString().slice(0,16)}openModal(`<h2>Horário · Slot ${n}</h2><div class="form-card"><label>Próxima partida<input id="scheduleAt" type="datetime-local" value="${esc(local)}"></label><button class="btn" onclick="saveSchedule(${n})">Salvar horário</button>${s.match.nextMatchAt?`<button class="btn secondary" onclick="downloadIcs(${n})">Adicionar ao calendário (alerta ${settings.notifyMinutes} min antes)</button>`:''}</div>`)}
function saveSchedule(n){const v=document.getElementById('scheduleAt').value;if(!v)return;state.slots[n-1].match.nextMatchAt=new Date(v).toISOString();state.slots[n-1].updatedAt=nowIso();saveState();closeModal();toast('Horário salvo')}
function downloadIcs(n){const s=state.slots[n-1];if(!s.match.nextMatchAt){toast('Defina o horário primeiro');return}const start=new Date(s.match.nextMatchAt),end=new Date(start.getTime()+90*60000);const dt=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');const uid=`osm-slot${n}-${start.getTime()}@osm-ai-coach-pro`;const text=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//OSM AI Coach Pro//PT-BR','BEGIN:VEVENT',`UID:${uid}`,`DTSTAMP:${dt(new Date())}`,`DTSTART:${dt(start)}`,`DTEND:${dt(end)}`,`SUMMARY:OSM Slot ${n}: ${icsEscape(s.teamName||'Meu time')} x ${icsEscape(s.opponent.teamName||'Adversário')}`,`DESCRIPTION:${icsEscape(`OSM AI Coach Pro - ${s.competitionName||''}`)}`,'BEGIN:VALARM','ACTION:DISPLAY',`TRIGGER:-PT${settings.notifyMinutes}M`,`DESCRIPTION:Preparar tática OSM - Slot ${n}`,'END:VALARM','END:VEVENT','END:VCALENDAR'].join('\r\n');downloadBlob(text,`OSM-Slot-${n}.ics`,'text/calendar')}
function icsEscape(s){return String(s).replace(/([,;\\])/g,'\\$1').replace(/\n/g,'\\n')}

function buildLocalMarketPlan(s){const r=s.roster||[],groups={attackers:[],midfielders:[],defenders:[],goalkeepers:[]};for(const p of r){const pos=String(p.position||'').toUpperCase().trim();if(['GR','GK'].includes(pos))groups.goalkeepers.push(p);else if(['DD','DC','DE','CB','LB','RB','LWB','RWB','DEF'].includes(pos))groups.defenders.push(p);else if(['MDC','MC','MCO','MD','ME','CM','CDM','CAM','LM','RM','MID'].includes(pos))groups.midfielders.push(p);else if(['PL','ED','EE','ST','CF','LW','RW','ATA'].includes(pos))groups.attackers.push(p);else groups.midfielders.push(p)}const targets={attackers:4,midfielders:6,defenders:6,goalkeepers:2};const sell=[];for(const [g,arr] of Object.entries(groups)){const excess=Math.max(0,arr.length-targets[g]);const candidates=arr.filter(p=>!p.training).sort((a,b)=>(Number(a.rating)||0)-(Number(b.rating)||0));sell.push(...candidates.slice(0,excess).map(p=>({...p,group:g,reason:'Excesso na posição e rating inferior dentro do setor'})))}const weak=[];for(const [g,arr] of Object.entries(groups)){if(arr.length<targets[g])weak.push({group:g,need:targets[g]-arr.length})}const avg=r.length?Math.round(r.reduce((a,p)=>a+(Number(p.rating)||0),0)/Math.max(1,r.filter(p=>Number(p.rating)).length)):null;return {composition:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,v.length])),targets,sell:sell.slice(0,4),needs:weak,currentAverage:avg,bestMarket:[],generatedAt:nowIso()}}
function renderMarket(){const active=state.slots.filter(s=>s.status==='active');els.marketContent.innerHTML=(state.eventIntel?eventIntelHtml(state.eventIntel):'')+(active.length?active.map(marketSlotHtml).join(''):`<div class="card"><p class="muted">Nenhum slot ativo.</p></div>`)}
function marketSlotHtml(s){s.marketPlan=s.marketPlan||buildLocalMarketPlan(s);const p=s.marketPlan;const sell=p.sell||[];const best=p.bestMarket||[];return `<div class="card market-slot"><div class="market-head"><div><div class="slot-num">SLOT ${s.slotNumber}</div><h3 style="margin:4px 0">${esc(s.teamName)}</h3></div><div class="status-pill">${(s.market||[]).length} no mercado</div></div><div class="kpis"><div class="kpi"><span>ATA</span><b>${p.composition.attackers}/4</b></div><div class="kpi"><span>MEI</span><b>${p.composition.midfielders}/6</b></div><div class="kpi"><span>DEF</span><b>${p.composition.defenders}/6</b></div><div class="kpi"><span>GOL</span><b>${p.composition.goalkeepers}/2</b></div></div><h4>Ações imediatas</h4><div class="plan-list">${sell.length?sell.map((x,i)=>`<div class="plan-step"><span class="n">${i+1}</span><div><b>Vender ${esc(x.name)}</b><div class="small muted">${esc(x.position)} · ${esc(x.rating)} · ${esc(x.reason)}</div></div></div>`).join(''):`<div class="plan-step"><span class="n">✓</span><div><b>Nenhuma venda automática indicada</b><div class="small muted">Jogadores em treinamento são protegidos; máximo de 4 vendas por vez.</div></div></div>`}${p.needs?.map((x,i)=>`<div class="plan-step"><span class="n">+</span><div><b>Comprar ${x.need} para ${esc(groupLabel(x.group))}</b><div class="small muted">Priorize rating claramente acima do titular mais fraco e boa relação preço/valor.</div></div></div>`).join('')||''}</div>${best.length?`<h4>Melhores opções lidas no mercado</h4><table class="simple-table"><tr><th>Jogador</th><th>POS</th><th>OVR</th><th>Preço</th></tr>${best.map(x=>`<tr><td>${esc(x.name)}</td><td>${esc(x.position)}</td><td>${esc(x.rating)}</td><td>${fmtMoney(x.price||x.value)}</td></tr>`).join('')}</table>`:`<p class="small warn-text">Grave a lista de transferências para receber compras concretas.</p>`}<div class="actions"><button class="btn" onclick="aiMarketPlan(${s.slotNumber})">Plano IA completo</button></div></div>`}
function groupLabel(g){return {attackers:'ataque',midfielders:'meio-campo',defenders:'defesa',goalkeepers:'goleiro'}[g]||g}
async function aiMarketPlan(n){const s=state.slots[n-1];if(!localStorage.getItem(API_KEY_STORAGE)){apiModal();return}toast(`Analisando mercado do Slot ${n}…`);try{const prompt=`Atue como analista de evolução de elenco no OSM. Use SOMENTE os dados fornecidos. Objetivo: fortalecer o time rápido, sem inventar jogadores ou preços. Regras do usuário: manter 4 atacantes, 6 meias, 6 defensores e 2 goleiros; máximo de 4 jogadores à venda por vez; jogador training=true NÃO pode ser indicado para venda. Se a lista de transferências não tiver opção boa, descreva o PERFIL de compra em vez de inventar nome. Considere eventos atuais se eventIntel existir. Retorne JSON: {"currentStrength":null,"targetStrength":null,"estimatedRounds":null,"actions":[{"priority":1,"action":"","reason":""}],"sell":[{"name":"","reason":""}],"buyNow":[{"name":"","reason":""}],"buyProfiles":[{"position":"","minimumRating":null,"idealAge":null,"reason":""}],"trainingPriorities":[{"name":"","reason":""}],"notes":""}. Não prometa evolução exata quando dados forem insuficientes; estimatedRounds pode ser null.\nDADOS: ${JSON.stringify({slot:s,eventIntel:state.eventIntel})}`;const plan=await geminiJson([{text:prompt}],{temperature:.12,maxOutputTokens:4500});s.marketPlanAI={...plan,generatedAt:nowIso()};saveState();marketPlanModal(n)}catch(e){toast(e.message)}}
function marketPlanModal(n){const p=state.slots[n-1].marketPlanAI;if(!p)return;openModal(`<h2>Plano de evolução · Slot ${n}</h2><div class="data-grid"><div class="data-cell"><span>Força atual</span><b>${esc(p.currentStrength)}</b></div><div class="data-cell"><span>Meta estimada</span><b>${esc(p.targetStrength)}</b></div><div class="data-cell"><span>Rodadas estimadas</span><b>${esc(p.estimatedRounds)}</b></div></div><div class="plan-list">${(p.actions||[]).map((a,i)=>`<div class="plan-step"><span class="n">${esc(a.priority||i+1)}</span><div><b>${esc(a.action)}</b><div class="small muted">${esc(a.reason)}</div></div></div>`).join('')}</div>${p.notes?`<p class="small muted">${esc(p.notes)}</p>`:''}`)}
async function updateEventIntel(){if(!localStorage.getItem(API_KEY_STORAGE)){apiModal();return}toast('Pesquisando eventos atuais do OSM…');try{const key=localStorage.getItem(API_KEY_STORAGE),model=settings.model||'gemini-3.8-flash';const body={contents:[{parts:[{text:'Pesquise na web informações atuais e verificáveis sobre eventos ATIVOS agora no Online Soccer Manager (OSM), especialmente eventos que alteram treino, transferências, venda, amistosos, estádio ou evolução de jogadores. Não invente evento. Se não houver confirmação recente, diga que não foi possível confirmar. Retorne JSON válido: {"checkedAt":"ISO","events":[{"name":"","status":"active|uncertain","effect":"","strategy":"","sourceSummary":""}],"summary":""}'}]}],tools:[{google_search:{}}],generationConfig:{temperature:.1,responseMimeType:'application/json',maxOutputTokens:4000}};const res=await geminiFetch(model,key,body);if(!res.ok)throw new Error(`Gemini ${res.status}`);const d=await res.json();const txt=(d.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('');state.eventIntel=parseJsonText(txt);state.eventIntel.checkedAt=state.eventIntel.checkedAt||nowIso();saveState();toast('Eventos atualizados')}catch(e){toast(`Não foi possível verificar eventos: ${e.message}`)}}
function eventIntelHtml(i){return `<div class="card" style="margin-bottom:12px"><div class="section-head" style="margin:0 0 8px"><div><span class="eyebrow">EVENTOS OSM</span><h3 style="margin:3px 0">Inteligência atual</h3></div><span class="small muted">${i.checkedAt?fmtDateTime(i.checkedAt):''}</span></div>${(i.events||[]).length?(i.events||[]).map(e=>`<div class="plan-step"><span class="n">⚡</span><div><b>${esc(e.name)}</b> <span class="small ${e.status==='active'?'good-text':'warn-text'}">${esc(e.status)}</span><div class="small muted">${esc(e.effect)}</div><div class="small">Estratégia: ${esc(e.strategy)}</div></div></div>`).join(''):`<p class="muted">${esc(i.summary||'Nenhum evento confirmado.')}</p>`}</div>`}

function renderHistory(){const activeRows=state.slots.flatMap(s=>(s.results||[]).map(r=>({...r,slotNumber:s.slotNumber,teamName:s.teamName,competitionName:s.competitionName}))).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));els.historyContent.innerHTML=`<div class="card"><h3>Partidas registradas</h3>${activeRows.length?`<table class="simple-table"><tr><th>Slot</th><th>Jogo</th><th>Placar</th><th>Resultado</th></tr>${activeRows.map(r=>`<tr><td>${r.slotNumber}</td><td>${esc(r.teamName)} × ${esc(r.opponent)}</td><td>${esc(r.score)}</td><td>${esc(resultLabel(r))}</td></tr>`).join('')}</table>`:`<p class="muted">Nenhum resultado registrado.</p>`}</div><div class="section-head"><div><span class="eyebrow">ARQUIVO</span><h2>Competições finalizadas</h2></div></div>${state.archives.length?state.archives.map(a=>`<div class="card archive-card"><div class="slot-num">SLOT ${a.slotNumber} · ${esc(a.competitionType)}</div><h3 style="margin:4px 0">${esc(a.teamName)} · ${esc(a.competitionName)}</h3><p class="small muted">${(a.results||[]).length} resultados · finalizada em ${fmtDateTime(a.finishedAt)}</p></div>`).join(''):`<div class="card"><p class="muted">Nenhuma competição finalizada.</p></div>`}`}

function apiModal(message=''){const has=!!localStorage.getItem(API_KEY_STORAGE);openModal(`<h2>API Gemini</h2>${message?`<p class="warn-text">${esc(message)}</p>`:''}<p class="muted small">A chave fica somente neste navegador. Se você limpar os dados do site, precisará informá-la novamente.</p><div class="form-card"><label>Chave API<input id="apiKeyInput" type="password" autocomplete="off" placeholder="AIza…" value="${has?'••••••••••••':''}"></label><div class="actions"><button class="btn" onclick="saveApiKey()">Salvar e testar</button>${has?'<button class="btn danger" onclick="clearApiKey()">Apagar chave</button>':''}</div><div id="apiTestStatus" class="small muted"></div></div>`)}
async function saveApiKey(){const input=document.getElementById('apiKeyInput');const v=input.value.trim();if(!v||v.startsWith('••')){toast('Digite a chave para testar');return}const st=document.getElementById('apiTestStatus');st.textContent='Testando…';try{const model=await pickAvailableModel(v);if(!model)throw new Error('Nenhum modelo generateContent disponível para esta chave.');localStorage.setItem(API_KEY_STORAGE,v);if(model!==settings.model){settings.model=model;saveSettingsObj()}st.innerHTML=`<span class="good-text">Conectado. Modelo: ${esc(settings.model)}</span>`;hydrateSettings();setTimeout(closeModal,700)}catch(e){st.innerHTML=`<span class="danger-text">${esc(e.message)}</span>`}}
function clearApiKey(){localStorage.removeItem(API_KEY_STORAGE);hydrateSettings();closeModal();toast('Chave removida')}

async function requestNotifications(){if(!('Notification'in window)){toast('Este navegador não oferece notificações web');return}const p=await Notification.requestPermission();toast(p==='granted'?'Notificações permitidas':'Permissão não concedida')}
function checkNotifications(){if(!settings.notifyEnabled||!('Notification'in window)||Notification.permission!=='granted')return;for(const s of state.slots){if(s.status!=='active'||!s.match.nextMatchAt)continue;const t=new Date(s.match.nextMatchAt).getTime()-Date.now(),target=settings.notifyMinutes*60000;if(t<=target&&t>target-90000){const key=`${s.slotNumber}-${s.match.nextMatchAt}`;if(notificationSeen.has(key))continue;notificationSeen.add(key);new Notification(`OSM · Slot ${s.slotNumber} em ${settings.notifyMinutes} min`,{body:`${s.teamName||'Seu time'} x ${s.opponent.teamName||'adversário'} · confira a tática.`,icon:'icon.svg'})}}}

function exportBackup(){const payload={app:'OSM AI Coach Pro',version:APP_VERSION,exportedAt:nowIso(),state,settings:{...settings}};downloadBlob(JSON.stringify(payload,null,2),`osm-ai-coach-pro-backup-${new Date().toISOString().slice(0,10)}.json`,'application/json')}
function downloadBlob(text,name,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function importBackup(e){const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);if(!d.state?.slots)throw new Error('Arquivo inválido');state=d.state;settings={...settings,...(d.settings||{})};saveSettingsObj();saveState();toast('Backup importado')}catch(err){toast(err.message)}};r.readAsText(f)}


// ===== v4.4: slots persistentes, tática sempre visível, OCR reforçado e revalidação pré-jogo =====
let selectedSlot=Number(localStorage.getItem('osm_ai_coach_selected_slot_v52')||1);
if(![1,2,3,4].includes(selectedSlot))selectedSlot=1;

function renderSlotSwitcher(){
 if(!els.slotSwitcher)return;
 els.slotSwitcher.innerHTML=[1,2,3,4].map(n=>{
   const s=state.slots[n-1],active=n===selectedSlot;
   return `<button class="slot-chip ${active?'active':''}" onclick="setSelectedSlot(${n})">
     <span>S${n}</span><small>${esc(s.teamName||'Livre')}</small>
   </button>`;
 }).join('');
 if(els.slotTarget)els.slotTarget.value=String(selectedSlot);
}
function setSelectedSlot(n){
 n=Number(n);if(![1,2,3,4].includes(n))return;
 selectedSlot=n;localStorage.setItem('osm_ai_coach_selected_slot_v52',String(n));
 renderSlotSwitcher();
 if(els.slotTarget)els.slotTarget.value=String(n);
 renderToday();renderMarket();renderHistory();renderAnalysisMode();
 toast(`Slot ${n} selecionado`);
}
function showView(name){
 document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.view===name));
 document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
 document.getElementById('view-'+name).classList.add('active');
 renderSlotSwitcher();
 if(name==='market')renderMarket();
 if(name==='history')renderHistory();
 if(name==='analyze'&&els.slotTarget)els.slotTarget.value=String(selectedSlot);
}
function renderAll(){renderSlotSwitcher();renderToday();renderMarket();renderHistory();hydrateSettings()}

function tacticRows(t){
 return [
  ['Formação',t?.formation],['Estilo de jogo',t?.gamePlan],['Pressão',t?.pressure],
  ['Estilo / Mentalidade',t?.mentality],['Temporização / Ritmo',t?.tempo],
  ['Marcação',t?.marking],['Fazer fora de jogo',t?.offside],['Desarme',t?.tackling],
  ['Avançados',t?.attackInstruction],['Meio-campo',t?.midfieldInstruction],['Defesa',t?.defenceInstruction]
 ];
}
function tacticAgeText(s){
 if(!s?.tacticFreshAt)return 'Ainda não revalidada para este jogo';
 const d=Date.now()-new Date(s.tacticFreshAt).getTime();
 if(!Number.isFinite(d)||d<0)return 'Atualizada agora';
 const m=Math.floor(d/60000);
 return m<1?'Atualizada agora':`Atualizada há ${m} min`;
}
function shouldRefreshNearMatch(s){
 if(!s?.match?.nextMatchAt)return !!s?.tacticNeedsRefresh;
 const diff=new Date(s.match.nextMatchAt).getTime()-Date.now();
 return !!s.tacticNeedsRefresh || (diff>0&&diff<=settings.notifyMinutes*60000);
}
function persistentTacticHtml(s){
 if(!s||s.status!=='active')return '';
 const near=shouldRefreshNearMatch(s);
 if(!s.tactic)return `<div class="card tactic-persistent"><div class="tactic-head"><div><span class="eyebrow">TÁTICA · SLOT ${s.slotNumber}</span><h3>Sem tática para este jogo</h3></div></div><p class="muted">Faça a leitura do adversário antes da partida.</p><div class="actions"><button class="btn" onclick="prepareReanalysis(${s.slotNumber})">Analisar adversário agora</button></div></div>`;
 return `<div class="card tactic-persistent ${near?'needs-refresh':''}">
   <div class="tactic-head"><div><span class="eyebrow">TÁTICA ATUAL · SLOT ${s.slotNumber}</span><h3>${esc(s.teamName)} × ${esc(s.opponent.teamName)}</h3><p class="small ${near?'warn-text':'muted'}">${near?'⚠ Revalide a tática próximo do jogo':'✓ Tática disponível'} · ${esc(tacticAgeText(s))}</p></div><span class="status-pill ${near?'missing':'ready'}">${near?'Atualizar':'Pronta'}</span></div>
   <table class="tactic-table persistent-table">${tacticRows(s.tactic).map(([k,v])=>`<tr><td>${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join('')}</table>
   <div class="actions">
    <button class="btn" onclick="prepareReanalysis(${s.slotNumber})">${near?'Reanalisar adversário agora':'Atualizar tática'}</button>
    <button class="btn secondary" onclick="manualTacticModal(${s.slotNumber})">Editar tática</button>
    <button class="btn secondary" onclick="tacticModal(${s.slotNumber})">Abrir em tela cheia</button>
   </div>
 </div>`;
}
function renderToday(){
 const action=chooseNextAction();
 els.nextAction.innerHTML=action?`<div class="priority">PRÓXIMA AÇÃO · SLOT ${action.slot.slotNumber}</div><h2>${esc(action.title)}</h2><p class="muted">${esc(action.detail)}</p><div class="hero-actions">${action.button||''}</div>`:`<div class="priority">SEU DIA NO OSM</div><h2>Nenhuma partida configurada</h2><p class="muted">Selecione um slot e configure a competição.</p>`;
 const sel=state.slots[selectedSlot-1];
 if(els.activeTacticPanel)els.activeTacticPanel.innerHTML=persistentTacticHtml(sel);
 els.slotsGrid.innerHTML=state.slots.map(slotCardHtml).join('');
}
function chooseNextAction(){
 const s=state.slots[selectedSlot-1];
 if(s?.status==='active'){
   if(s.match?.nextMatchAt){
     const ms=new Date(s.match.nextMatchAt).getTime()-Date.now();
     if(ms>0&&ms<=settings.notifyMinutes*60000)return {slot:s,title:`Revalidar tática contra ${s.opponent.teamName||'o adversário'}`,detail:`Faltam ${countdown(s.match.nextMatchAt)}. Grave novamente a tela da partida e o Data Analyst para pegar mudanças de última hora.`,button:`<button class="btn" onclick="prepareReanalysis(${s.slotNumber})">Atualizar tática agora</button>`};
   }
   if(!s.tactic)return {slot:s,title:`Gerar tática contra ${s.opponent.teamName||'o adversário'}`,detail:'Faça a leitura atual do adversário.',button:`<button class="btn" onclick="prepareReanalysis(${s.slotNumber})">Analisar agora</button>`};
   if(s.tacticNeedsRefresh)return {slot:s,title:'Tática precisa ser revalidada',detail:'O adversário pode ter mudado a configuração.',button:`<button class="btn" onclick="prepareReanalysis(${s.slotNumber})">Reanalisar</button>`};
 }
 return null;
}
function prepareReanalysis(n){
 setSelectedSlot(n);analysisMode='tactic';
 document.querySelectorAll('[data-analysis-mode]').forEach(x=>x.classList.toggle('active',x.dataset.analysisMode==='tactic'));
 clearAnalysisUi();renderAnalysisMode();showView('analyze');
 if(els.slotTarget)els.slotTarget.value=String(n);
 setTimeout(()=>els.chooseMedia?.focus(),50);
}
function slotCardHtml(s){
 const active=s.status==='active',selected=s.slotNumber===selectedSlot,missing=s.missing||[],ready=active&&missing.length===0,opp=s.opponent||{},me=s.myTeam||{};
 return `<article class="slot-card ${selected?'selected-slot':''}" onclick="if(event.target.tagName!=='BUTTON')setSelectedSlot(${s.slotNumber})"><div class="slot-top"><div><div class="slot-num">SLOT ${s.slotNumber}${s.competitionType==='Batalha'?' · BATALHA':''}</div><div class="slot-team">${esc(s.teamName||'Slot disponível')}</div><div class="slot-comp">${esc(s.competitionName||'Sem competição')}</div></div><span class="status-pill ${ready?'ready':active?'missing':''}">${active?(s.tactic?'Tática pronta':ready?'Dados prontos':'Dados parciais'):'Livre'}</span></div>${active?`<div class="matchline"><b>${esc(opp.teamName||'Adversário NI')}</b><div class="small muted">${esc(s.match.venue||'Local NI')} · R${esc(s.round)}${s.totalRounds?'/'+esc(s.totalRounds):''} · ${s.match.nextMatchAt?countdown(s.match.nextMatchAt):'Horário NI'}</div></div><div class="kpis"><div class="kpi"><span>Força</span><b>${esc(me.overall)}</b></div><div class="kpi"><span>Rival</span><b>${esc(opp.overall)}</b></div><div class="kpi"><span>Formação rival</span><b>${esc(opp.formation)}</b></div><div class="kpi"><span>Tática</span><b>${s.tactic?'Pronta':'—'}</b></div></div><div class="actions"><button class="btn secondary" onclick="event.stopPropagation();setSelectedSlot(${s.slotNumber});slotDetailModal(${s.slotNumber})">Dados</button><button class="btn secondary" onclick="event.stopPropagation();setSelectedSlot(${s.slotNumber});configureSlot(${s.slotNumber})">Editar competição</button><button class="btn" onclick="event.stopPropagation();prepareReanalysis(${s.slotNumber})">${s.tactic?'Atualizar tática':'Gerar tática'}</button><button class="btn secondary" onclick="event.stopPropagation();setSelectedSlot(${s.slotNumber});resultModal(${s.slotNumber})">Resultado</button></div>`:`<p class="muted small" style="margin:14px 0">Slot livre.</p><div class="actions"><button class="btn" onclick="event.stopPropagation();setSelectedSlot(${s.slotNumber});configureSlot(${s.slotNumber})">Criar competição</button></div>`}</article>`;
}

function buildMissing(s,extra){
 const m=[];
 if(analysisMode==='tactic'){
   if(!s.teamName)m.push('meu time');
   if(!s.opponent.teamName)m.push('adversário');
   if(s.myTeam.overall==null)m.push('minha força');
   if(s.opponent.overall==null)m.push('força rival');
   if(!s.opponent.formation)m.push('formação rival');
   if(!s.opponent.style)m.push('plano rival');
   if(!s.opponent.marking)m.push('marcação rival');
   if(s.opponent.offside==null)m.push('impedimento rival');
   if(!s.match.refereeColor&&!s.match.refereeName)m.push('árbitro');
 }else{
   if(!s.roster?.length)m.push('elenco');
   if(!s.market?.length)m.push('lista de transferências');
 }
 for(const x of extra||[])if(x&&!m.includes(x))m.push(x);
 return [...new Set(m)];
}
function applyVisionResult(result){
 for(const c of result.captures||[]){
   const n=resolveCaptureSlot(c);if(!n)continue;
   const s=state.slots[n-1];s.status='active';s.createdAt=s.createdAt||nowIso();s.updatedAt=nowIso();
   for(const k of ['teamName','competitionName','competitionType','round','totalRounds'])if(c[k]!==null&&c[k]!==undefined&&c[k]!=='')s[k]=c[k];
   s.myTeam=mergeNonNull(s.myTeam,c.myTeam||{});s.opponent=mergeNonNull(s.opponent,c.opponent||{});s.match=mergeNonNull(s.match,c.match||{});
   if(c.match?.countdownText)s.match.nextMatchAt=parseCountdownToIso(c.match.countdownText)||s.match.nextMatchAt;
   if(c.match?.exactDateTimeText){const d=parseLooseDateTime(c.match.exactDateTimeText);if(d)s.match.nextMatchAt=d.toISOString()}
   if(Array.isArray(c.roster)&&c.roster.length)s.roster=mergePlayers(s.roster,c.roster);
   if(Array.isArray(c.market)&&c.market.length)s.market=mergePlayers(s.market,c.market);
   s.coverage={...s.coverage,...Object.fromEntries((c.screensSeen||[]).map(x=>[x,true]))};
   s.missing=buildMissing(s,c.missing||[]);
   if(c.result?.score)recordExtractedResult(s,c.result);
   s.marketPlan=buildLocalMarketPlan(s);
 }
}
function sanitizeTactic(t,s){
 const f=fallbackTactic(s),src=t||{};
 return {
  formation:FORMATIONS.includes(src.formation)?src.formation:f.formation,
  gamePlan:GAME_PLANS.includes(src.gamePlan)?src.gamePlan:f.gamePlan,
  pressure:clampInt(src.pressure)??f.pressure,
  mentality:clampInt(src.mentality)??f.mentality,
  tempo:clampInt(src.tempo)??f.tempo,
  marking:['À zona','Marcação à zona','Individual','Marcação individual'].includes(src.marking)?src.marking:f.marking,
  offside:/sim/i.test(String(src.offside))?'Sim':(/não|nao/i.test(String(src.offside))?'Não':f.offside),
  tackling:src.tackling||f.tackling,
  attackInstruction:src.attackInstruction||f.attackInstruction,
  midfieldInstruction:src.midfieldInstruction||f.midfieldInstruction,
  defenceInstruction:src.defenceInstruction||f.defenceInstruction,
  confidence:src.confidence||'média',reason:src.reason||f.reason,generatedAt:nowIso(),engine:'Gemini'
 };
}
function applyRecommendedTactics(result){
 for(const c of result.captures||[]){
   const n=resolveCaptureSlot(c);if(!n||!c.recommendedTactic)continue;
   const s=state.slots[n-1];
   s.tactic=sanitizeTactic(c.recommendedTactic,s);
   s.tactic.engine='Gemini OCR';
   s.tacticFreshAt=nowIso();s.tacticNeedsRefresh=false;
   s.lastOpponentTacticSnapshot={formation:s.opponent.formation,style:s.opponent.style,marking:s.opponent.marking,offside:s.opponent.offside,at:nowIso()};
 }
}
function saveManualTactic(n){
 const s=state.slots[n-1];
 s.tactic={formation:document.getElementById('mtFormation').value,gamePlan:document.getElementById('mtPlan').value,pressure:clampInt(document.getElementById('mtPressure').value),mentality:clampInt(document.getElementById('mtMentality').value),tempo:clampInt(document.getElementById('mtTempo').value),marking:document.getElementById('mtMarking').value,offside:document.getElementById('mtOffside').value,tackling:document.getElementById('mtTackling').value,attackInstruction:document.getElementById('mtAttack').value.trim(),midfieldInstruction:document.getElementById('mtMid').value.trim(),defenceInstruction:document.getElementById('mtDef').value.trim(),confidence:'manual',reason:'Tática editada manualmente.',generatedAt:nowIso(),engine:'Manual'};
 s.tacticFreshAt=nowIso();s.tacticNeedsRefresh=false;s.updatedAt=nowIso();saveState();closeModal();toast('Tática atualizada');
}

async function extractVideoFramesFast(file,maxFrames=18){
 const url=URL.createObjectURL(file),v=document.createElement('video');v.src=url;v.muted=true;v.playsInline=true;v.preload='metadata';await new Promise((res,rej)=>{v.onloadedmetadata=res;v.onerror=()=>rej(new Error(`Não consegui abrir ${file.name}`))});
 const dur=Math.max(.2,v.duration||1),step=dur<=25?.28:dur<=60?.4:.55,candidates=[];let prev=null;
 for(let t=.06;t<dur;t+=step){await seekVideo(v,Math.min(t,dur-.04));const f=captureVideoFrame(v,t,file.name);f.score=prev?frameDistance(f,prev):100;candidates.push(f);prev=f;if(candidates.length>180)break}URL.revokeObjectURL(url);
 if(analysisMode==='market'||analysisMode==='calendar')return chooseDiverseFrames(candidates,Math.min(22,maxFrames));
 const analyst=candidates.filter(f=>(f.layout?.leftWhite||0)>.34 && ((f.layout?.rightBlue||0)>.08||(f.layout?.rightGreen||0)>.08));
 const squad=candidates.filter(f=>(f.layout?.bottomWhite||0)>.36 && (f.layout?.leftWhite||0)<.3);
 const match=candidates.filter(f=>(f.layout?.dark||0)>.38 && (f.layout?.bottomWhite||0)<.25);
 const chosen=[];const add=(arr,n)=>{for(const f of chooseDiverseFrames(arr,n)){if(!chosen.includes(f))chosen.push(f)}};
 add(analyst,7);add(squad,5);add(match,3);add(candidates,4);
 return chooseDiverseFrames(chosen,Math.min(18,maxFrames));
}
async function prepareOcrImage(dataUrl){
 const img=await loadImage(dataUrl);
 const scale=1.45,w=Math.round(img.width*scale),h=Math.round(img.height*scale);
 const c=document.createElement('canvas');c.width=w;c.height=h*2;
 const x=c.getContext('2d');
 x.drawImage(img,0,0,w,h);
 x.filter='grayscale(1) contrast(1.75) brightness(1.08)';
 x.drawImage(img,0,h,w,h);x.filter='none';
 return c.toDataURL('image/jpeg',.9);
}
async function runLocalOcr(frames){
 if(!window.Tesseract)throw new Error('OCR local não carregou. Recarregue a página.');
 const results=[];let worker;
 try{worker=await Tesseract.createWorker('por+eng',1,{logger:m=>{if(m.status==='recognizing text'&&m.progress)setProgress(22+Math.round(m.progress*30),`OCR local ${Math.round(m.progress*100)}%…`)}})}
 catch{worker=await Tesseract.createWorker('eng',1)}
 try{
  try{await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'})}catch{}
  for(let i=0;i<frames.length;i++){
    setProgress(22+Math.round((i/Math.max(1,frames.length))*30),`OCR reforçado ${i+1}/${frames.length}…`);
    const prepared=await prepareOcrImage(frames[i].dataUrl);
    const {data}=await worker.recognize(prepared);
    const text=cleanOcrText(data?.text||'');
    if(text.length>4)results.push({frame:i+1,time:Math.round(frames[i].time||0),confidence:data?.confidence??null,text});
  }
 }finally{if(worker)await worker.terminate()}
 return {mode:analysisMode,frames:results,joined:results.map(x=>`[Quadro ${x.frame} ~${x.time}s conf=${Math.round(x.confidence||0)}]\n${x.text}`).join('\n\n')};
}
function selectVisualEvidence(frames,n=4){
 if(!frames.length)return [];
 const picks=[];
 const reportLike=[...frames].sort((a,b)=>scenePriority(b)-scenePriority(a));
 for(const f of reportLike){if(picks.length>=Math.min(2,n))break;if(!picks.some(x=>frameDistance(x,f)<7))picks.push(f)}
 const chronological=[frames[0],frames[Math.floor(frames.length/2)],frames[frames.length-1]].filter(Boolean);
 for(const f of chronological){if(picks.length>=n)break;if(!picks.some(x=>frameDistance(x,f)<7))picks.push(f)}
 const diverse=chooseDiverseFrames(frames,n*2);
 for(const f of diverse){if(picks.length>=n)break;if(!picks.some(x=>frameDistance(x,f)<7))picks.push(f)}
 return picks.slice(0,n);
}

function renderMarket(){
 const s=state.slots[selectedSlot-1];
 els.marketContent.innerHTML=(state.eventIntel?eventIntelHtml(state.eventIntel):'')+(s?.status==='active'?marketSlotHtml(s):`<div class="card"><h3>Slot ${selectedSlot}</h3><p class="muted">Nenhuma competição ativa neste slot.</p></div>`);
}
function renderHistory(){
 const s=state.slots[selectedSlot-1],rows=(s?.results||[]).map(r=>({...r,slotNumber:selectedSlot,teamName:s.teamName,competitionName:s.competitionName})).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
 const archives=state.archives.filter(a=>Number(a.slotNumber)===selectedSlot);
 els.historyContent.innerHTML=`<div class="card"><div class="slot-num">SLOT ${selectedSlot}</div><h3>Partidas registradas</h3><p class="muted small">Cada resultado guarda contexto + tática usada e entra nas próximas recomendações.</p>${rows.length?`<table class="simple-table"><tr><th>Jogo</th><th>Placar</th><th>Resultado</th></tr>${rows.map(r=>`<tr><td>${esc(r.teamName)} × ${esc(r.opponent)}</td><td>${esc(r.score)}</td><td>${esc(resultLabel(r))}</td></tr>`).join('')}</table>`:`<p class="muted">Nenhum resultado neste slot.</p>`}</div><div class="section-head"><div><span class="eyebrow">ARQUIVO · SLOT ${selectedSlot}</span><h2>Competições finalizadas</h2></div></div>${archives.length?archives.map(a=>`<div class="card archive-card"><div class="slot-num">SLOT ${a.slotNumber} · ${esc(a.competitionType)}</div><h3 style="margin:4px 0">${esc(a.teamName)} · ${esc(a.competitionName)}</h3><p class="small muted">${(a.results||[]).length} resultados · finalizada em ${fmtDateTime(a.finishedAt)}</p></div>`).join(''):`<div class="card"><p class="muted">Nenhuma competição finalizada neste slot.</p></div>`}`;
}
function checkNotifications(){
 if(!settings.notifyEnabled)return;
 let changed=false;
 for(const s of state.slots){
  if(s.status!=='active'||!s.match.nextMatchAt)continue;
  const t=new Date(s.match.nextMatchAt).getTime()-Date.now(),target=settings.notifyMinutes*60000;
  if(t<=target&&t>0&&!s.tacticNeedsRefresh){s.tacticNeedsRefresh=true;changed=true}
  if(t<=target&&t>target-90000){
    const key=`${s.slotNumber}-${s.match.nextMatchAt}`;if(notificationSeen.has(key))continue;notificationSeen.add(key);
    if('Notification'in window&&Notification.permission==='granted')new Notification(`OSM · Slot ${s.slotNumber}: atualizar tática agora`,{body:`Faltam ${settings.notifyMinutes} min para ${s.teamName||'seu time'} x ${s.opponent.teamName||'adversário'}. Abra o Pro e reanalise o Data Analyst.`,icon:'icon.svg'});
  }
 }
 if(changed){localStorage.setItem(STATE_KEY,JSON.stringify(state));renderToday()}
}


function renderAnalysisMode(){if(!els.analysisGuide)return;const tactic=analysisMode==='tactic',market=analysisMode==='market',calendar=analysisMode==='calendar',result=analysisMode==='result';els.uploadTitle.textContent=tactic?'Enviar vídeo da partida':market?'Enviar vídeo do mercado':calendar?'Enviar vídeo do calendário':'Enviar vídeo do resultado';els.uploadHelp.textContent=tactic?'O app exige as 6 categorias obrigatórias.':market?'Grave elenco, treinamento e transferências.':calendar?'Placar=jogado; 🏠=liga em casa; sem casa=liga fora; 🏆=taça.':'Grave todo o resultado: placar, estatísticas, cartões, formações e eventos.';els.autoTacticRow.classList.toggle('hidden',!tactic);if(tactic)els.analysisGuide.innerHTML=`<h3>Obrigatório para gerar tática</h3><p class=\"warn-text small\"><b>Sem todas as 6 categorias, não gera.</b></p>`;else if(market)els.analysisGuide.innerHTML=`<h3>Mercado / Evolução</h3><p>Elenco, treinamento e lista de transferências.</p>`;else if(calendar)els.analysisGuide.innerHTML=`<h3>Calendário</h3><div class=\"guide-grid\"><div><b>Placar</b><span>já jogado</span></div><div><b>🏠 Casa</b><span>liga em casa</span></div><div><b>Sem casa</b><span>liga fora</span></div><div><b>🏆 Taça</b><span>condicional; elimina datas futuras se perder</span></div><div><b>Horário</b><span>manual/padrão quando não estiver visível</span></div></div>`;else els.analysisGuide.innerHTML=`<h3>Resultado para aprendizado</h3><div class=\"guide-grid\"><div><b>Placar</b></div><div><b>Posse/remates/cantos/faltas</b></div><div><b>🟨 / 🟥</b><span>quantidade por time</span></div><div><b>Formações</b></div><div><b>Eventos</b><span>gols, cartões, substituições</span></div></div>`;}

// ===== v5.0: estado por slot, 4-3-3 forte, resultados vinculados, mercado estratégico e informações =====
const MARKET_RESEARCH={
 updatedAt:'2026-09-23',
 official:['Venda e compra de jogadores','Treino','Amistosos','Gestão ativa do elenco'],
 community:{
  liquidity:'Para giro, priorizar jogadores jovens, mais baratos e geralmente abaixo de 100 OVR; 100+ e muito caros tendem a vender mais devagar.',
  pricing:[{max:80,label:'OVR ≤80',range:'2,4–2,5× valor base'},{max:90,label:'OVR 81–90',range:'2,1–2,4×'},{max:99,label:'OVR 91–99',range:'1,9–2,3×'},{max:999,label:'OVR 100+',range:'1,7–2,1×'}],
  principle:'O objetivo é lucro por slot de transferência por dia, não o maior preço possível em uma única venda.'
 }
};
const SEP_2026_EVENTS=[
 {start:'2026-09-02',end:'2026-09-02',name:'Superfast Trainer',effect:'Treinos normais 2h; Universal 1h',strategy:'Aumente a frequência de treino.'},
 {start:'2026-09-03',end:'2026-09-03',name:'All Out Event',effect:'Mais progressão; Scout 2h; até 6 vendas; estádio 2h; treino mais rápido',strategy:'Use todos os slots, treine e aproveite Scout/estádio.'},
 {start:'2026-09-05',end:'2026-09-06',name:'Training Talents',effect:'Maior progressão para jogadores até 24 anos',strategy:'Priorize jovens que pretende manter.'},
 {start:'2026-09-09',end:'2026-09-09',name:'Extraordinary Scout',effect:'Scout 2h e jogadores mais baratos',strategy:'Use Scout para necessidades específicas.'},
 {start:'2026-09-12',end:'2026-09-13',name:'Golden Oldies X Legends',effect:'Mais progressão para veteranos; Legends na lista',strategy:'Treine veteranos úteis; avalie Legends sem sacrificar liquidez.'},
 {start:'2026-09-16',end:'2026-09-16',name:'Top Facilities',effect:'Estádio 4h; treinos 4h/3h',strategy:'Acelere infraestrutura e mantenha treino ativo.'},
 {start:'2026-09-19',end:'2026-09-20',name:'Intense Friendlies',effect:'Progressão extra em amistosos',strategy:'Faça amistosos se o custo compensar.'},
 {start:'2026-09-23',end:'2026-09-23',name:'Bargain Scout',effect:'Jogadores do Scout mais baratos; Scout 2h',strategy:'Ótimo dia para buscar perfil específico barato.'},
 {start:'2026-09-26',end:'2026-09-26',name:'All Out Event',effect:'Mais progressão; Scout 2h; até 6 vendas; estádio 2h; treino mais rápido',strategy:'Prepare caixa antes; use os slots extras e rode o elenco.'},
 {start:'2026-09-26',end:'2026-09-27',name:'Legends',effect:'Legends na Lista de Transferências',strategy:'Só compre se melhorar o time sem travar capital de giro.'},
 {start:'2026-09-30',end:'2026-09-30',name:'Extreme Training',effect:'Progressão extrema em treino e amistosos; treino 3h/2h',strategy:'Concentre treino nos jogadores que ficarão no elenco.'}
];
function localEventIntel(){
 const now=new Date(),day=now.toISOString().slice(0,10);
 const events=SEP_2026_EVENTS.map(e=>({...e,status:day>=e.start&&day<=e.end?'active':day<e.start?'upcoming':'past'})).filter(e=>e.status!=='past');
 return {checkedAt:nowIso(),source:'Agenda Setembro/2026 incorporada',events:events.map(e=>({name:e.name,status:e.status,effect:e.effect,strategy:e.strategy,sourceSummary:`${e.start}${e.end!==e.start?' a '+e.end:''}`})),summary:events.some(e=>e.status==='active')?'Há evento ativo hoje.':'Nenhum evento incorporado está ativo hoje; veja os próximos.'};
}
async function updateEventIntel(){
 state.eventIntel=localEventIntel();saveState();toast('Agenda de eventos atualizada (fallback local).');
 const key=localStorage.getItem(API_KEY_STORAGE);if(!key)return;
 try{
  const model=settings.model||'gemini-3.8-flash';
  const body={contents:[{parts:[{text:'Pesquise na web a agenda oficial/comunitária ATUAL do Online Soccer Manager (OSM) para eventos ativos e próximos. Retorne apenas JSON: {"checkedAt":"ISO","events":[{"name":"","status":"active|upcoming|uncertain","effect":"","strategy":"","sourceSummary":""}],"summary":""}. Não invente evento.'}]}],tools:[{google_search:{}}],generationConfig:{temperature:.05,responseMimeType:'application/json',maxOutputTokens:3000}};
  const res=await geminiFetch(model,key,body);if(!res.ok)return;
  const d=await res.json(),txt=(d.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('');
  const live=parseJsonText(txt);if(Array.isArray(live.events)&&live.events.length){state.eventIntel=live;saveState();toast('Eventos atualizados pela IA + web.')} 
 }catch(e){console.warn('Eventos: mantendo fallback local',e)}
}
function marketStrategyForSlot(s){
 const roster=s.roster||[];const p=buildLocalMarketPlan(s);const o=Number(s.myTeam?.overall);const target=Number.isFinite(o)?o+10:null;
 const counts=p.composition||{};const event=(state.eventIntel||localEventIntel()).events?.find(e=>e.status==='active');
 return {counts,target,event,hasRoster:roster.length>0,rosterCount:roster.length,lastRoster:s.lastRosterSnapshotAt||null};
}
function renderMarket(){
 const s=state.slots[selectedSlot-1];if(!s||s.status!=='active'){els.marketContent.innerHTML=`<div class="card"><h3>Slot ${selectedSlot}</h3><p class="muted">Nenhuma competição ativa.</p></div>`;return}
 const x=marketStrategyForSlot(s),c=x.counts||{};const event=x.event;
 els.marketContent.innerHTML=`${eventIntelHtml(state.eventIntel||localEventIntel())}
 <div class="card market-strategy"><div class="market-head"><div><div class="slot-num">SLOT ${selectedSlot}</div><h3>${esc(s.teamName)}</h3></div><span class="status-pill">Estratégia contínua</span></div>
 <p class="muted">O vídeo do Mercado serve para atualizar o <b>snapshot do elenco</b>. Como a Lista de Transferências muda o tempo todo, o plano abaixo trabalha principalmente por perfil e liquidez — não por nomes que podem sumir minutos depois.</p>
 <div class="kpis"><div class="kpi"><span>ATA</span><b>${esc(c.attackers??0)}/4</b></div><div class="kpi"><span>MEI</span><b>${esc(c.midfielders??0)}/6</b></div><div class="kpi"><span>DEF</span><b>${esc(c.defenders??0)}/6</b></div><div class="kpi"><span>GOL</span><b>${esc(c.goalkeepers??0)}/2</b></div></div>
 <div class="strategy-grid">
  <div class="plan-step"><span class="n">1</span><div><b>Giro de caixa primeiro</b><div class="small muted">Mantenha todos os slots de venda ocupados. Para trading, prefira jogadores mais baratos/jovens e evite travar dinheiro em 100+ para revenda.</div></div></div>
  <div class="plan-step"><span class="n">2</span><div><b>Preço por liquidez</b><div class="small muted">≤80: ~2,4–2,5× · 81–90: ~2,1–2,4× · 91–99: ~1,9–2,3× · 100+: ~1,7–2,1×. São faixas comunitárias, não garantia.</div></div></div>
  <div class="plan-step"><span class="n">3</span><div><b>Melhore um setor por vez</b><div class="small muted">Compre para substituir o elo mais fraco; depois recicle o jogador antigo. Evite aumentar o elenco sem necessidade.</div></div></div>
  <div class="plan-step"><span class="n">4</span><div><b>Composição alvo</b><div class="small muted">4 ATA · 6 MEI · 6 DEF · 2 GOL. Jogador em treinamento nunca entra como venda automática.</div></div></div>
  <div class="plan-step"><span class="n">5</span><div><b>Treino e amistosos</b><div class="small muted">Treine quem vai permanecer; em eventos de progressão, aumente a frequência. Amistosos ganham valor quando há bônus de progressão.</div></div></div>
  <div class="plan-step"><span class="n">6</span><div><b>Meta dinâmica</b><div class="small muted">Força atual ${esc(s.myTeam?.overall)}${x.target?` → próxima meta aproximada ${x.target}`:''}. Reavalie a meta após compras e vendas, não por prazo fixo inventado.</div></div></div>
 </div>
 ${event?`<div class="event-now"><b>⚡ Evento atual: ${esc(event.name)}</b><div class="small">${esc(event.effect)} · ${esc(event.strategy)}</div></div>`:''}
 <div class="actions"><button class="btn" onclick="openMarketSnapshot(${selectedSlot})">Atualizar snapshot do elenco</button><button class="btn secondary" onclick="aiStrategyReview(${selectedSlot})">Revisar estratégia com IA</button></div>
 <p class="small muted">Snapshot: ${x.hasRoster?`${x.rosterCount} jogadores lidos${x.lastRoster?' · '+fmtDateTime(x.lastRoster):''}`:'ainda não há elenco completo lido'}.</p>
 </div>`;
}
function openMarketSnapshot(n){setSelectedSlot(n);analysisMode='market';document.querySelectorAll('[data-analysis-mode]').forEach(x=>x.classList.toggle('active',x.dataset.analysisMode==='market'));clearAnalysisUi();renderAnalysisMode();showView('analyze')}
async function aiStrategyReview(n){
 const s=state.slots[n-1];if(!localStorage.getItem(API_KEY_STORAGE)){apiModal();return}
 toast('Revisando estratégia do Slot '+n+'…');
 const safeRoster=(s.roster||[]).map(p=>({position:p.position,rating:p.rating,value:p.value,age:p.age,training:!!p.training}));
 const prompt=`Você é estrategista de evolução no OSM. NÃO invente jogadores e NÃO indique venda por nome. Monte um plano por PERFIL/SETOR para crescer força e caixa rápido. Regras: composição 4 ATA/6 MEI/6 DEF/2 GOL; máximo 4 vendas normais por vez (ou 6 apenas quando evento confirmar); jogador em treino não é venda; para trading prefira liquidez e evite 100+ caros; priorize lucro por slot/dia, não preço máximo. Retorne JSON {"priorities":[{"priority":1,"action":"","why":""}],"buyProfiles":[{"sector":"","minRating":null,"maxValue":null,"agePreference":"","why":""}],"training":"","eventAdjustment":"","warnings":[]}. Dados: ${JSON.stringify({overall:s.myTeam.overall,roster:safeRoster,event:state.eventIntel})}`;
 try{const p=await geminiJson([{text:prompt}],{temperature:.08,maxOutputTokens:3000});s.marketStrategyAI={...p,generatedAt:nowIso()};saveState();strategyModal(n)}catch(e){toast(e.message)}
}
function strategyModal(n){const p=state.slots[n-1].marketStrategyAI;if(!p)return;openModal(`<h2>Estratégia de evolução · Slot ${n}</h2><div class="plan-list">${(p.priorities||[]).map((a,i)=>`<div class="plan-step"><span class="n">${esc(a.priority||i+1)}</span><div><b>${esc(a.action)}</b><div class="small muted">${esc(a.why)}</div></div></div>`).join('')}</div>${(p.buyProfiles||[]).length?`<h3>Perfis de compra</h3>${p.buyProfiles.map(x=>`<div class="plan-step"><span class="n">+</span><div><b>${esc(x.sector)}</b><div class="small muted">OVR mín. ${esc(x.minRating)} · idade ${esc(x.agePreference)} · ${esc(x.why)}</div></div></div>`).join('')}`:''}<p class="small"><b>Treino:</b> ${esc(p.training)}</p><p class="small"><b>Evento:</b> ${esc(p.eventAdjustment)}</p></div>`)}

function attachTacticToUpcomingSchedule(s){
 const future=(s.schedule||[]).filter(x=>!x.played&&!x.skipped).sort((a,b)=>new Date(a.dateTime||'9999')-new Date(b.dateTime||'9999'))[0];
 if(future&&s.tactic){future.tacticSnapshot=structuredClone(s.tactic);future.opponentSnapshot=structuredClone(s.opponent);future.myOverall=s.myTeam.overall;future.oppOverall=s.opponent.overall}
 s.pendingTacticSnapshot=s.tactic?structuredClone(s.tactic):null;
}
function applyRecommendedTactics(result){
 for(const c of result.captures||[]){const n=resolveCaptureSlot(c);if(!n||!c.recommendedTactic)continue;const s=state.slots[n-1];s.tactic=sanitizeTactic(c.recommendedTactic,s);s.tactic.engine='Gemini OCR';s.tacticFreshAt=nowIso();s.tacticNeedsRefresh=false;s.lastOpponentTacticSnapshot={formation:s.opponent.formation,style:s.opponent.style,marking:s.opponent.marking,offside:s.opponent.offside,at:nowIso()};attachTacticToUpcomingSchedule(s)}
}
function saveManualTactic(n){const s=state.slots[n-1];s.tactic={formation:document.getElementById('mtFormation').value,gamePlan:document.getElementById('mtPlan').value,pressure:clampInt(document.getElementById('mtPressure').value),mentality:clampInt(document.getElementById('mtMentality').value),tempo:clampInt(document.getElementById('mtTempo').value),marking:document.getElementById('mtMarking').value,offside:document.getElementById('mtOffside').value,tackling:document.getElementById('mtTackling').value,attackInstruction:document.getElementById('mtAttack').value.trim(),midfieldInstruction:document.getElementById('mtMid').value.trim(),defenceInstruction:document.getElementById('mtDef').value.trim(),confidence:'manual',reason:'Tática editada manualmente.',generatedAt:nowIso(),engine:'Manual'};s.tacticFreshAt=nowIso();s.tacticNeedsRefresh=false;s.updatedAt=nowIso();attachTacticToUpcomingSchedule(s);saveState();closeModal();toast('Tática atualizada')}

function strong433Modal(n){
 const s=state.slots[n-1],o=s.opponent||{},m=s.match||{};
 const sel=(id,vals,current)=>`<select id="${id}">${vals.map(v=>`<option value="${esc(v)}"${String(v)===String(current)?' selected':''}>${esc(v)}</option>`).join('')}</select>`;
 const formations=['NI',...FORMATIONS],plans=['NI',...GAME_PLANS],refs=['NI','Verde','Amarelo','Laranja','Vermelho'],marks=['NI','Marcação à zona','Homem-a-homem'],offs=['NI','Não','Sim'],humans=['NI','Não','Sim'];
 openModal(`<h2>🔥 4-3-3 Forte · Slot ${n}</h2><p class="muted small">Disponível quando sua força é pelo menos 15 pontos maior. Selecione o contexto atual do rival.</p><div class="form-card"><div class="data-grid"><label>Minha força<input id="s43my" type="number" value="${esc(s.myTeam.overall??'')}"></label><label>Força rival<input id="s43opp" type="number" value="${esc(o.overall??'')}"></label></div><label>Local${sel('s43venue',['Casa','Fora'],m.venue||'Casa')}</label><label>Árbitro${sel('s43ref',refs,m.refereeColor||'NI')}</label><label>Formação rival${sel('s43form',formations,o.formation||'NI')}</label><label>Plano rival${sel('s43style',plans,o.style||'NI')}</label><label>Marcação rival${sel('s43mark',marks,o.marking||'NI')}</label><label>Impedimento rival${sel('s43off',offs,o.offside===true?'Sim':o.offside===false?'Não':'NI')}</label><label>Rival humano?${sel('s43human',humans,o.human===true?'Sim':o.human===false?'Não':'NI')}</label><button class="btn" onclick="generateStrong433(${n})">Gerar 4-3-3 forte</button></div>`)
}
async function generateStrong433(n){
 const s=state.slots[n-1],my=Number(document.getElementById('s43my').value),opp=Number(document.getElementById('s43opp').value);if(!Number.isFinite(my)||!Number.isFinite(opp)){toast('Informe as duas forças');return}if(my-opp<15){toast('4-3-3 Forte exige vantagem mínima de 15 pontos');return}if(!localStorage.getItem(API_KEY_STORAGE)){apiModal();return}
 const basic={myOverall:my,oppOverall:opp,venue:document.getElementById('s43venue').value,referee:document.getElementById('s43ref').value==='NI'?null:document.getElementById('s43ref').value,oppFormation:document.getElementById('s43form').value==='NI'?null:document.getElementById('s43form').value,oppStyle:document.getElementById('s43style').value==='NI'?null:document.getElementById('s43style').value,oppMarking:document.getElementById('s43mark').value==='NI'?null:document.getElementById('s43mark').value,oppOffside:document.getElementById('s43off').value,oppHuman:document.getElementById('s43human').value,history:buildLearningSummary(s)};
 const prompt=`Especialista OSM. Meu time é >=15 pontos mais forte. Gere UMA tática dominante obrigatoriamente em 4-3-3 A ou 4-3-3 B, sem inventar dados. Use contexto, árbitro, casa/fora, rival e histórico. Retorne JSON {"formation":"4-3-3 A","gamePlan":"Jogar pelas alas","pressure":0,"mentality":0,"tempo":0,"marking":"À zona","offside":"Não","tackling":"Normal","attackInstruction":"Atacar apenas","midfieldInstruction":"Pressionar na frente","defenceInstruction":"Apoiar o meio-campo","confidence":"alta","reason":""}. Dados: ${JSON.stringify(basic)}`;
 try{const t=await geminiJson([{text:prompt}],{temperature:.08,maxOutputTokens:1800});s.myTeam.overall=my;s.opponent.overall=opp;s.match.venue=basic.venue;s.match.refereeColor=basic.referee||s.match.refereeColor;s.opponent.formation=basic.oppFormation||s.opponent.formation;s.opponent.style=basic.oppStyle||s.opponent.style;s.opponent.marking=basic.oppMarking||s.opponent.marking;s.tactic=sanitizeTactic(t,s);s.tactic.engine='4-3-3 Forte IA';s.tacticFreshAt=nowIso();s.tacticNeedsRefresh=false;attachTacticToUpcomingSchedule(s);saveState();closeModal();tacticModal(n)}catch(e){toast(e.message)}
}

function resultCandidateSchedule(s){
 const rows=(s.schedule||[]).filter(x=>!x.result&&!x.skipped&&x.tacticSnapshot);if(!rows.length)return null;
 rows.sort((a,b)=>Math.abs(new Date(a.dateTime||0)-Date.now())-Math.abs(new Date(b.dateTime||0)-Date.now()));return rows[0];
}
function resultModal(n,calendarIndex=null){
 const s=state.slots[n-1],cal=calendarIndex!==null?s.schedule?.[calendarIndex]:resultCandidateSchedule(s);const tactic=cal?.tacticSnapshot||s.tactic;
 if(!tactic){toast('Primeiro gere a tática desse jogo. O resultado só pode ser associado depois da tática.');return}
 const opp=cal?.opponent||s.opponent.teamName;openModal(`<h2>Resultado · Slot ${n}</h2><p class="muted">${esc(s.teamName)} × ${esc(opp)}</p><div class="form-card"><div class="data-grid"><label>Meus gols<input id="resGF" type="number" min="0"></label><label>Gols rival<input id="resGA" type="number" min="0"></label><label>🟨 meus<input id="resMY" type="number" min="0"></label><label>🟥 meus<input id="resMR" type="number" min="0"></label><label>🟨 rival<input id="resOY" type="number" min="0"></label><label>🟥 rival<input id="resOR" type="number" min="0"></label></div><label>Observação<input id="resNote" placeholder="Ex.: rival mudou a formação"></label><button class="btn" onclick="saveResultV5(${n},${calendarIndex===null?'null':calendarIndex})">Salvar resultado</button></div>`)}
function saveResultV5(n,calendarIndex=null){
 const s=state.slots[n-1],gf=Number(document.getElementById('resGF').value),ga=Number(document.getElementById('resGA').value);if(!Number.isFinite(gf)||!Number.isFinite(ga)){toast('Informe o placar');return}
 const cal=calendarIndex!==null?s.schedule?.[calendarIndex]:resultCandidateSchedule(s),tactic=cal?.tacticSnapshot||s.tactic;if(!tactic){toast('Não há tática registrada para este jogo');return}
 const num=id=>{const v=Number(document.getElementById(id)?.value);return Number.isFinite(v)?v:null};const opp=cal?.opponent||s.opponent.teamName;
 const entry={createdAt:nowIso(),opponent:opp,gf,ga,score:`${gf}-${ga}`,note:document.getElementById('resNote').value.trim()||null,tactic:structuredClone(tactic),stats:{myYellowCards:num('resMY'),myRedCards:num('resMR'),oppYellowCards:num('resOY'),oppRedCards:num('resOR')},context:{myOverall:cal?.myOverall??s.myTeam.overall,oppOverall:cal?.oppOverall??s.opponent.overall,oppFormation:cal?.opponentSnapshot?.formation??s.opponent.formation,oppStyle:cal?.opponentSnapshot?.style??s.opponent.style,oppMarking:cal?.opponentSnapshot?.marking??s.opponent.marking,oppOffside:cal?.opponentSnapshot?.offside??s.opponent.offside,opponentHuman:cal?.opponentSnapshot?.human??s.opponent.human,venue:cal?.venue??s.match.venue,referee:s.match.refereeColor||s.match.refereeName,strengthBucket:strengthBucket(s)}};
 s.results=s.results||[];s.results.push(entry);if(cal){cal.played=true;cal.result=entry.score;cal.resultEntryAt=entry.createdAt;if(cal.competitionType==='cup'&&gf<ga)pruneConditionalCupMatches(s)}s.tactic=null;s.tacticNeedsRefresh=true;if(Number.isFinite(Number(s.round)))s.round=Number(s.round)+1;s.updatedAt=nowIso();ensureNextMatchFromScheduleOrDefault(s);saveState();closeModal();toast('Resultado salvo e calendário atualizado')
}
function calendarTableHtml(s){const rows=s.schedule||[];return rows.length?`<div class="calendar-list">${rows.map((x,i)=>`<div class="calendar-row ${x.skipped?'skipped':''}"><div><b>${x.competitionType==='cup'?'🏆':'⚽'} ${esc(x.opponent||'Adversário')}</b><div class="small muted">${esc(x.venue||'NI')} · ${esc(x.dateTime?fmtDateTime(x.dateTime):(x.dateText||'')+' '+(x.timeText||''))}</div></div><div class="calendar-status">${x.result?`<b>${esc(x.result)}</b>`:x.skipped?'Ignorado':(x.dateTime&&new Date(x.dateTime).getTime()<Date.now())?(x.tacticSnapshot?`<button class="btn tiny" onclick="resultModal(${s.slotNumber},${i})">Inserir resultado</button>`:'Sem tática'):'Futuro'}</div></div>`).join('')}</div>`:'<p class="muted">Calendário ainda não lido.</p>'}

function positionChartHtml(s){const h=s.positionHistory||[];if(!h.length)return '<p class="muted">Sem histórico de posição. Informe a posição atual em Editar competição para começar o gráfico.</p>';const max=Math.max(...h.map(x=>Number(x.position)||1),20);return `<div class="position-chart">${h.slice(-20).map(x=>{const p=Number(x.position)||max,hgt=Math.max(10,100-(p-1)*(85/Math.max(1,max-1)));return `<div class="pos-col"><div class="pos-bar" style="height:${hgt}%"><span>${p}º</span></div><small>R${esc(x.round??'')}</small></div>`}).join('')}</div>`}
function recordPosition(s,pos){pos=Number(pos);if(!Number.isFinite(pos)||pos<1)return;s.myTeam.leaguePosition=pos;s.positionHistory=s.positionHistory||[];const last=s.positionHistory.at(-1);if(!last||last.position!==pos||last.round!==s.round)s.positionHistory.push({at:nowIso(),round:s.round,position:pos})}
function configureSlot(n){const s=state.slots[n-1];openModal(`<h2>${s.status==='active'?'Editar':'Criar'} competição · Slot ${n}</h2><div class="form-card"><label>Meu time<input id="cfgTeam" value="${esc(s.teamName||'')}"></label><label>Competição<input id="cfgComp" value="${esc(s.competitionName||'')}"></label><label>Tipo<select id="cfgType"><option${s.competitionType==='Liga normal'?' selected':''}>Liga normal</option><option${s.competitionType==='Batalha'?' selected':''}>Batalha</option><option${s.competitionType==='Copa'?' selected':''}>Copa</option><option${s.competitionType==='Torneio'?' selected':''}>Torneio</option></select></label><div class="data-grid"><label>Rodada<input id="cfgRound" type="number" min="1" value="${esc(s.round||1)}"></label><label>Total<input id="cfgTotal" type="number" min="1" value="${esc(s.totalRounds||34)}"></label><label>Posição atual<input id="cfgPosition" type="number" min="1" value="${esc(s.myTeam?.leaguePosition||'')}"></label><label>Horário padrão<input id="cfgDailyTime" type="time" value="${esc(s.defaultMatchTime||'')}"></label></div><div class="actions"><button class="btn" onclick="saveSlotConfigV5(${n})">Salvar alterações</button><button class="btn secondary" onclick="openCalendarForSlot(${n})">Ler calendário</button></div></div>`)}
function saveSlotConfigV5(n){const s=state.slots[n-1];s.status='active';s.teamName=document.getElementById('cfgTeam').value.trim()||s.teamName;s.competitionName=document.getElementById('cfgComp').value.trim()||s.competitionName;s.competitionType=document.getElementById('cfgType').value;s.round=Number(document.getElementById('cfgRound').value)||1;s.totalRounds=Number(document.getElementById('cfgTotal').value)||null;s.defaultMatchTime=document.getElementById('cfgDailyTime').value||null;recordPosition(s,document.getElementById('cfgPosition').value);s.createdAt=s.createdAt||nowIso();s.updatedAt=nowIso();ensureNextMatchFromScheduleOrDefault(s);saveState();closeModal();toast('Competição atualizada')}

function renderHistory(){
 const s=state.slots[selectedSlot-1],rows=s?.results||[];if(!s){els.historyContent.innerHTML='';return}
 const w=rows.filter(r=>r.gf>r.ga).length,d=rows.filter(r=>r.gf===r.ga).length,l=rows.filter(r=>r.gf<r.ga).length,gf=rows.reduce((a,r)=>a+(Number(r.gf)||0),0),ga=rows.reduce((a,r)=>a+(Number(r.ga)||0),0),yc=rows.reduce((a,r)=>a+(Number(r.stats?.myYellowCards)||0),0),rc=rows.reduce((a,r)=>a+(Number(r.stats?.myRedCards)||0),0);
 els.historyContent.innerHTML=`<div class="card"><div class="slot-num">SLOT ${selectedSlot}</div><h3>Resumo do aprendizado</h3><div class="kpis"><div class="kpi"><span>J</span><b>${rows.length}</b></div><div class="kpi"><span>V/E/D</span><b>${w}/${d}/${l}</b></div><div class="kpi"><span>Gols</span><b>${gf}-${ga}</b></div><div class="kpi"><span>🟨/🟥</span><b>${yc}/${rc}</b></div></div></div>${rows.length?rows.slice().reverse().map(r=>`<div class="card history-game"><div class="market-head"><div><b>${esc(s.teamName)} × ${esc(r.opponent)}</b><div class="small muted">${fmtDateTime(r.createdAt)} · ${esc(r.context?.venue)}</div></div><span class="status-pill">${esc(r.score)}</span></div><div class="small"><b>Tática:</b> ${esc(r.tactic?.formation)} · ${esc(r.tactic?.gamePlan)} · P${esc(r.tactic?.pressure)} E${esc(r.tactic?.mentality)} R${esc(r.tactic?.tempo)}</div><div class="small muted">Rival: ${esc(r.context?.oppFormation)} · cartões ${esc(r.stats?.myYellowCards)}🟨 ${esc(r.stats?.myRedCards)}🟥</div></div>`).join(''):'<div class="card"><p class="muted">Nenhum resultado registrado.</p></div>'}`;
}
function renderInfo(){
 const s=state.slots[selectedSlot-1];if(!els.infoContent)return;if(!s||s.status!=='active'){els.infoContent.innerHTML=`<div class="card"><p class="muted">Slot ${selectedSlot} livre.</p></div>`;return}
 els.infoContent.innerHTML=`<div class="card"><div class="market-head"><div><div class="slot-num">SLOT ${selectedSlot}</div><h3>${esc(s.teamName)} · ${esc(s.competitionName)}</h3></div><button class="btn secondary" onclick="configureSlot(${selectedSlot})">Editar</button></div><div class="kpis"><div class="kpi"><span>Posição</span><b>${esc(s.myTeam?.leaguePosition)}</b></div><div class="kpi"><span>Rodada</span><b>${esc(s.round)}/${esc(s.totalRounds)}</b></div><div class="kpi"><span>Força</span><b>${esc(s.myTeam?.overall)}</b></div><div class="kpi"><span>Próximo</span><b>${esc(s.match?.nextMatchAt?fmtDateTime(s.match.nextMatchAt):'NI')}</b></div></div></div><div class="card"><h3>Evolução da posição</h3>${positionChartHtml(s)}</div><div class="card"><div class="market-head"><h3>Calendário</h3><button class="btn secondary" onclick="openCalendarForSlot(${selectedSlot})">Atualizar calendário</button></div>${calendarTableHtml(s)}</div>`;
}
function showView(name){document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.view===name));document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));document.getElementById('view-'+name).classList.add('active');renderSlotSwitcher();if(name==='market')renderMarket();if(name==='history')renderHistory();if(name==='info')renderInfo();if(name==='analyze'){clearAnalysisUi();if(els.slotTarget)els.slotTarget.value=String(selectedSlot);renderAnalysisSlotState()}}
function renderAnalysisSlotState(){const s=state.slots[selectedSlot-1];if(!els.analysisResult||!s||s.status!=='active')return;els.analysisResult.innerHTML=`<div class="result-card"><h3>Slot ${selectedSlot} · ${esc(s.teamName)}</h3><div class="data-grid"><div class="data-cell"><span>Adversário</span><b>${esc(s.opponent?.teamName)}</b></div><div class="data-cell"><span>Força</span><b>${esc(s.myTeam?.overall)} × ${esc(s.opponent?.overall)}</b></div><div class="data-cell"><span>Formação rival</span><b>${esc(s.opponent?.formation)}</b></div><div class="data-cell"><span>Tática</span><b>${s.tactic?esc(s.tactic.formation):'Ainda não gerada'}</b></div></div><p class="small muted">As imagens de outro slot não são reaproveitadas aqui.</p></div>`}
function setSelectedSlot(n){n=Number(n);if(![1,2,3,4].includes(n))return;selectedSlot=n;localStorage.setItem('osm_ai_coach_selected_slot_v52',String(n));renderSlotSwitcher();if(els.slotTarget)els.slotTarget.value=String(n);renderToday();renderMarket();renderHistory();renderInfo();renderAnalysisMode();if(document.getElementById('view-analyze')?.classList.contains('active')){clearAnalysisUi();renderAnalysisSlotState()}toast(`Slot ${n} selecionado`)}
function renderAll(){renderSlotSwitcher();renderToday();renderMarket();renderHistory();renderInfo();hydrateSettings()}
function persistentTacticHtml(s){if(!s||s.status!=='active')return '';const near=shouldRefreshNearMatch(s);if(!s.tactic)return `<div class="card tactic-persistent"><div class="tactic-head"><div><span class="eyebrow">TÁTICA · SLOT ${s.slotNumber}</span><h3>Sem tática para este jogo</h3></div></div><div class="actions"><button class="btn" onclick="prepareReanalysis(${s.slotNumber})">Analisar adversário</button><button class="btn secondary" onclick="strong433Modal(${s.slotNumber})">🔥 4-3-3 Forte</button></div></div>`;return `<div class="card tactic-persistent ${near?'needs-refresh':''}"><div class="tactic-head"><div><span class="eyebrow">TÁTICA ATUAL · SLOT ${s.slotNumber}</span><h3>${esc(s.teamName)} × ${esc(s.opponent.teamName)}</h3><p class="small ${near?'warn-text':'muted'}">${near?'⚠ Revalide perto do jogo':'✓ Tática disponível'} · ${esc(tacticAgeText(s))}</p></div><span class="status-pill ${near?'missing':'ready'}">${near?'Atualizar':'Pronta'}</span></div><table class="tactic-table persistent-table">${tacticRows(s.tactic).map(([k,v])=>`<tr><td>${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join('')}</table><div class="actions"><button class="btn" onclick="prepareReanalysis(${s.slotNumber})">Atualizar tática</button><button class="btn secondary" onclick="strong433Modal(${s.slotNumber})">🔥 4-3-3 Forte</button><button class="btn secondary" onclick="manualTacticModal(${s.slotNumber})">Editar</button>${s.tactic?`<button class="btn secondary" onclick="resultModal(${s.slotNumber})">Registrar resultado</button>`:''}</div></div>`}
function slotCardHtml(s){const active=s.status==='active',selected=s.slotNumber===selectedSlot,opp=s.opponent||{},me=s.myTeam||{};return `<article class="slot-card ${selected?'selected-slot':''}" onclick="if(event.target.tagName!=='BUTTON')setSelectedSlot(${s.slotNumber})"><div class="slot-top"><div><div class="slot-num">SLOT ${s.slotNumber}${s.competitionType==='Batalha'?' · BATALHA':''}</div><div class="slot-team">${esc(s.teamName||'Slot disponível')}</div><div class="slot-comp">${esc(s.competitionName||'Sem competição')}</div></div><span class="status-pill ${active&&s.tactic?'ready':active?'missing':''}">${active?(s.tactic?'Tática pronta':'Preparar'):'Livre'}</span></div>${active?`<div class="matchline"><b>${esc(opp.teamName||'Adversário NI')}</b><div class="small muted">${esc(s.match.venue||'Local NI')} · R${esc(s.round)} · ${s.match.nextMatchAt?countdown(s.match.nextMatchAt):'Horário NI'}</div></div><div class="kpis"><div class="kpi"><span>Força</span><b>${esc(me.overall)}</b></div><div class="kpi"><span>Rival</span><b>${esc(opp.overall)}</b></div><div class="kpi"><span>Posição</span><b>${esc(me.leaguePosition)}</b></div><div class="kpi"><span>Tática</span><b>${s.tactic?'Pronta':'—'}</b></div></div><div class="actions"><button class="btn" onclick="event.stopPropagation();prepareReanalysis(${s.slotNumber})">${s.tactic?'Atualizar':'Gerar'} tática</button><button class="btn secondary" onclick="event.stopPropagation();strong433Modal(${s.slotNumber})">🔥 4-3-3</button><button class="btn secondary" onclick="event.stopPropagation();setSelectedSlot(${s.slotNumber});configureSlot(${s.slotNumber})">Competição</button>${s.tactic?`<button class="btn secondary" onclick="event.stopPropagation();resultModal(${s.slotNumber})">Resultado</button>`:''}</div>`:`<div class="actions"><button class="btn" onclick="event.stopPropagation();setSelectedSlot(${s.slotNumber});configureSlot(${s.slotNumber})">Criar competição</button></div>`}</article>`}


// ===== v5.1: calendário claro, eventos ao abrir, resultado+posição e evolução pelo elenco =====
function parseOsmValue(v){
 if(v===null||v===undefined||v==='')return null;if(typeof v==='number')return Number.isFinite(v)?v:null;
 let s=String(v).trim().toUpperCase().replace(/\s/g,'').replace('€','').replace('R$','');
 let mult=1;if(s.endsWith('B')){mult=1e9;s=s.slice(0,-1)}else if(s.endsWith('M')){mult=1e6;s=s.slice(0,-1)}else if(s.endsWith('K')){mult=1e3;s=s.slice(0,-1)}
 s=s.replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.');const n=Number(s);return Number.isFinite(n)?n*mult:null
}
function recalculateSquadValue(s){
 const values=(s.roster||[]).map(p=>parseOsmValue(p.value)).filter(Number.isFinite);if(values.length)s.myTeam.squadValue=Math.round(values.reduce((a,b)=>a+b,0));
 s.myTeam.playerCount=(s.roster||[]).length||s.myTeam.playerCount;return s.myTeam.squadValue
}
function activeEventCards(){
 const intel=state.eventIntel||localEventIntel();const ev=(intel.events||[]).filter(e=>e.status==='active');const next=(intel.events||[]).filter(e=>e.status==='upcoming').slice(0,2);
 return {intel,ev,next}
}
function renderTodayEvents(){
 const el=document.getElementById('todayEvents');if(!el)return;const {intel,ev,next}=activeEventCards();
 el.innerHTML=`<div class="card today-events"><div class="market-head"><div><span class="eyebrow">EVENTOS OSM</span><h3>${ev.length?'Ativo agora':'Próximos eventos'}</h3></div><button class="btn tiny secondary" onclick="updateEventIntel(false)">Atualizar</button></div>${ev.length?ev.map(e=>`<div class="event-now"><b>⚡ ${esc(e.name)}</b><div class="small">${esc(e.effect)}</div><div class="small muted">Estratégia: ${esc(e.strategy)}</div></div>`).join(''):next.length?next.map(e=>`<div class="plan-step"><span class="n">📅</span><div><b>${esc(e.name)}</b><div class="small muted">${esc(e.sourceSummary||'Próximo evento')} · ${esc(e.effect)}</div></div></div>`).join(''):`<p class="muted">Nenhum evento confirmado.</p>`}<p class="tiny muted">Atualizado: ${intel.checkedAt?fmtDateTime(intel.checkedAt):'agora'}</p></div>`;
}
async function updateEventIntel(silent=false){
 state.eventIntel=localEventIntel();localStorage.setItem(STATE_KEY,JSON.stringify(state));renderTodayEvents();renderMarket();if(!silent)toast('Agenda de eventos carregada.');
 const key=localStorage.getItem(API_KEY_STORAGE);if(!key)return;
 try{
  const model=settings.model||'gemini-3.8-flash';const body={contents:[{parts:[{text:'Pesquise na web a agenda ATUAL do Online Soccer Manager (OSM): eventos ativos hoje e próximos eventos. Use fontes recentes. Retorne somente JSON {"checkedAt":"ISO","events":[{"name":"","status":"active|upcoming|uncertain","effect":"","strategy":"","sourceSummary":""}],"summary":""}. Não invente.'}]}],tools:[{google_search:{}}],generationConfig:{temperature:.04,responseMimeType:'application/json',maxOutputTokens:3000}};
  const res=await geminiFetch(model,key,body);if(!res.ok)return;const d=await res.json(),txt=(d.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('');const live=parseJsonText(txt);if(Array.isArray(live.events)&&live.events.length){state.eventIntel=live;localStorage.setItem(STATE_KEY,JSON.stringify(state));renderTodayEvents();renderMarket();if(!silent)toast('Eventos atualizados pela web.')}}catch(e){console.warn('Mantendo agenda local',e)}
}
function refreshEventsOnStartup(){
 if(!state.eventIntel)state.eventIntel=localEventIntel();renderTodayEvents();const age=state.eventIntel?.checkedAt?Date.now()-new Date(state.eventIntel.checkedAt).getTime():Infinity;if(localStorage.getItem(API_KEY_STORAGE)&&age>6*3600000)setTimeout(()=>updateEventIntel(true),400)
}
function init(){bindEls();bindNav();bindActions();bindAnalysisModes();hydrateSettings();renderSlotSwitcher();renderAnalysisMode();renderAll();refreshEventsOnStartup();setInterval(()=>{renderToday();checkNotifications()},30000);checkNotifications()}

function currentUnplayedSchedule(s){return (s.schedule||[]).filter(x=>!x.result&&!x.played&&!x.skipped&&x.dateTime).sort((a,b)=>new Date(a.dateTime)-new Date(b.dateTime))[0]||null}
function overdueSchedule(s){return (s.schedule||[]).filter(x=>!x.result&&!x.played&&!x.skipped&&x.dateTime&&new Date(x.dateTime).getTime()<Date.now()).sort((a,b)=>new Date(b.dateTime)-new Date(a.dateTime))[0]||null}
function scheduleIndexOf(s,row){return row?(s.schedule||[]).indexOf(row):-1}
function calendarTableHtml(s){
 const rows=s.schedule||[];if(!rows.length)return '<p class="muted">Calendário ainda não lido.</p>';
 return `<div class="calendar-list">${rows.map((x,i)=>{const overdue=!x.result&&!x.skipped&&x.dateTime&&new Date(x.dateTime).getTime()<Date.now();const dt=x.dateTime?fmtDateTime(x.dateTime):[x.dateText,x.timeText||s.defaultMatchTime].filter(Boolean).join(' · ');return `<div class="calendar-row ${x.skipped?'skipped':''} ${overdue?'overdue':''}"><div><b>${x.competitionType==='cup'?'🏆':'⚽'} ${esc(x.opponent||'Adversário')}</b><div class="small muted">${esc(x.venue||'NI')}${x.round?' · R'+esc(x.round):''}</div></div><div class="calendar-status">${x.result?`<b class="calendar-score">${esc(x.result)}</b>`:x.skipped?'<span>Ignorado</span>':overdue?`<button class="btn tiny danger" onclick="resultModal(${s.slotNumber},${i})">Registrar resultado</button><div class="tiny danger-text">${esc(dt)}</div>`:`<b>${esc(dt||'Data/horário NI')}</b>`}</div></div>`}).join('')}</div>`
}
function positionChartHtml(s){const h=s.positionHistory||[];if(!h.length)return '<p class="muted">A posição será atualizada facilmente ao registrar cada resultado.</p>';const max=Math.max(...h.map(x=>Number(x.position)||1),20);return `<div class="position-chart">${h.slice(-20).map(x=>{const p=Number(x.position)||max,hgt=Math.max(10,100-(p-1)*(85/Math.max(1,max-1)));return `<div class="pos-col"><div class="pos-bar" style="height:${hgt}%"><span>${p}º</span></div><small>R${esc(x.round??'')}</small></div>`}).join('')}</div>`}
function recordPositionAtRound(s,pos,round){pos=Number(pos);if(!Number.isFinite(pos)||pos<1)return;s.myTeam.leaguePosition=pos;s.positionHistory=s.positionHistory||[];const last=s.positionHistory.at(-1);if(!last||Number(last.position)!==pos||Number(last.round)!==Number(round))s.positionHistory.push({at:nowIso(),round:round??s.round,position:pos})}
function resultModal(n,calendarIndex=null){
 const s=state.slots[n-1],cal=calendarIndex!==null?s.schedule?.[calendarIndex]:resultCandidateSchedule(s)||overdueSchedule(s),tactic=cal?.tacticSnapshot||s.tactic;if(!tactic){toast('Primeiro gere a tática desse jogo. O resultado só pode ser registrado depois da tática.');return}
 const opp=cal?.opponent||s.opponent.teamName;openModal(`<h2>Resultado · Slot ${n}</h2><p class="muted">${esc(s.teamName)} × ${esc(opp)}</p><div class="form-card"><div class="data-grid"><label>Meus gols<input id="resGF" type="number" min="0"></label><label>Gols rival<input id="resGA" type="number" min="0"></label><label>Posição após o jogo<input id="resPosition" type="number" min="1" value="${esc(s.myTeam?.leaguePosition||'')}"></label><label>🟨 meus<input id="resMY" type="number" min="0"></label><label>🟥 meus<input id="resMR" type="number" min="0"></label><label>🟨 rival<input id="resOY" type="number" min="0"></label><label>🟥 rival<input id="resOR" type="number" min="0"></label></div><label>Observação<input id="resNote" placeholder="Ex.: rival mudou a formação"></label><button class="btn" onclick="saveResultV5(${n},${calendarIndex===null?'null':calendarIndex})">Salvar resultado</button></div>`)
}
function saveResultV5(n,calendarIndex=null){
 const s=state.slots[n-1],gf=Number(document.getElementById('resGF').value),ga=Number(document.getElementById('resGA').value);if(!Number.isFinite(gf)||!Number.isFinite(ga)){toast('Informe o placar');return}
 const cal=calendarIndex!==null?s.schedule?.[calendarIndex]:resultCandidateSchedule(s)||overdueSchedule(s),tactic=cal?.tacticSnapshot||s.tactic;if(!tactic){toast('Não há tática registrada para este jogo');return}
 const num=id=>{const v=Number(document.getElementById(id)?.value);return Number.isFinite(v)?v:null},opp=cal?.opponent||s.opponent.teamName,roundPlayed=cal?.round??s.round;
 const entry={createdAt:nowIso(),opponent:opp,gf,ga,score:`${gf}-${ga}`,note:document.getElementById('resNote').value.trim()||null,tactic:structuredClone(tactic),stats:{myYellowCards:num('resMY'),myRedCards:num('resMR'),oppYellowCards:num('resOY'),oppRedCards:num('resOR')},context:{myOverall:cal?.myOverall??s.myTeam.overall,oppOverall:cal?.oppOverall??s.opponent.overall,oppFormation:cal?.opponentSnapshot?.formation??s.opponent.formation,oppStyle:cal?.opponentSnapshot?.style??s.opponent.style,oppMarking:cal?.opponentSnapshot?.marking??s.opponent.marking,oppOffside:cal?.opponentSnapshot?.offside??s.opponent.offside,opponentHuman:cal?.opponentSnapshot?.human??s.opponent.human,venue:cal?.venue??s.match.venue,referee:s.match.refereeColor||s.match.refereeName,strengthBucket:strengthBucket(s)}};
 s.results=s.results||[];s.results.push(entry);recordPositionAtRound(s,document.getElementById('resPosition')?.value,roundPlayed);if(cal){cal.played=true;cal.result=entry.score;cal.resultEntryAt=entry.createdAt;if(cal.competitionType==='cup'&&gf<ga)pruneConditionalCupMatches(s)}s.tactic=null;s.tacticNeedsRefresh=true;if(Number.isFinite(Number(s.round)))s.round=Math.max(Number(s.round)+1,Number(roundPlayed)+1);s.updatedAt=nowIso();ensureNextMatchFromScheduleOrDefault(s);saveState();closeModal();toast('Resultado, posição e calendário atualizados')
}
function applyResultVideo(r){
 const s=state.slots[selectedSlot-1],cal=resultCandidateSchedule(s)||overdueSchedule(s),tactic=cal?.tacticSnapshot||s.tactic;if(!tactic)throw new Error('Primeiro gere a tática desse jogo. O resultado só pode ser registrado depois da tática.');const gf=Number(r.gf),ga=Number(r.ga);if(!Number.isFinite(gf)||!Number.isFinite(ga))throw new Error('Não consegui identificar o placar final no vídeo.');
 const entry={createdAt:nowIso(),opponent:r.opponent||cal?.opponent||s.opponent.teamName,gf,ga,score:r.score||`${gf}-${ga}`,note:'Resultado extraído por vídeo',tactic:structuredClone(tactic),stats:r.stats||{},events:r.events||[],context:{myOverall:cal?.myOverall??s.myTeam.overall,oppOverall:cal?.oppOverall??s.opponent.overall,oppFormation:r.oppFormation||cal?.opponentSnapshot?.formation||s.opponent.formation,myFormation:r.myFormation||tactic?.formation||null,oppStyle:cal?.opponentSnapshot?.style||s.opponent.style,oppMarking:cal?.opponentSnapshot?.marking||s.opponent.marking,oppOffside:cal?.opponentSnapshot?.offside??s.opponent.offside,opponentHuman:cal?.opponentSnapshot?.human??s.opponent.human,venue:cal?.venue||s.match.venue,referee:s.match.refereeColor||s.match.refereeName,strengthBucket:strengthBucket(s)}};s.results=s.results||[];s.results.push(entry);if(cal){cal.played=true;cal.result=entry.score;if(cal.competitionType==='cup'&&gf<ga)pruneConditionalCupMatches(s)}s.pendingVideoResultPosition={round:cal?.round??s.round,score:entry.score};s.tactic=null;s.tacticNeedsRefresh=true;if(Number.isFinite(Number(s.round)))s.round=Number(s.round)+1;s.updatedAt=nowIso();ensureNextMatchFromScheduleOrDefault(s);saveState()
}
function saveVideoResultPosition(){const s=state.slots[selectedSlot-1],p=document.getElementById('videoResultPosition')?.value;if(p){recordPositionAtRound(s,p,s.pendingVideoResultPosition?.round);s.pendingVideoResultPosition=null;saveState();toast('Posição atualizada')}}
function renderResultVideo(r){const st=r.stats||{},s=state.slots[selectedSlot-1];els.coveragePanel.classList.add('hidden');els.analysisResult.innerHTML=`<div class="result-card"><h3>Resultado registrado · Slot ${selectedSlot}</h3><div class="data-grid"><div class="data-cell"><span>Placar</span><b>${esc(r.score||`${r.gf}-${r.ga}`)}</b></div><div class="data-cell"><span>Formações</span><b>${esc(r.myFormation)} × ${esc(r.oppFormation)}</b></div><div class="data-cell"><span>Posse</span><b>${esc(st.myPossession)} × ${esc(st.oppPossession)}</b></div><div class="data-cell"><span>Remates</span><b>${esc(st.myShots)} × ${esc(st.oppShots)}</b></div><div class="data-cell"><span>🟨</span><b>${esc(st.myYellowCards)} × ${esc(st.oppYellowCards)}</b></div><div class="data-cell"><span>🟥</span><b>${esc(st.myRedCards)} × ${esc(st.oppRedCards)}</b></div></div><div class="quick-position"><label>Posição após o jogo<input id="videoResultPosition" type="number" min="1" value="${esc(s.myTeam?.leaguePosition||'')}"></label><button class="btn secondary" onclick="saveVideoResultPosition()">Salvar posição</button></div><p class="good-text small">Resultado salvo no histórico e calendário.</p></div>`}

function renderAnalysisMode(){
 if(!els.analysisGuide)return;const tactic=analysisMode==='tactic',squad=analysisMode==='market',calendar=analysisMode==='calendar',result=analysisMode==='result';
 els.uploadTitle.textContent=tactic?'Enviar vídeo da partida':squad?'Enviar vídeo do meu elenco':calendar?'Enviar vídeo do calendário':'Enviar vídeo do resultado';
 els.uploadHelp.textContent=tactic?'O app exige as 6 categorias obrigatórias.':squad?'Grave SOMENTE seu elenco completo, rolando todos os jogadores. Não grave o mercado.':calendar?'Placar=jogado; 🏠=liga em casa; sem casa=liga fora; 🏆=taça.':'Grave o resultado completo: placar, estatísticas, cartões e eventos.';
 els.autoTacticRow.classList.toggle('hidden',!tactic);
 if(tactic)els.analysisGuide.innerHTML=`<h3>Obrigatório para gerar tática</h3><p class="warn-text small"><b>Sem todas as 6 categorias, não gera.</b></p>`;
 else if(squad)els.analysisGuide.innerHTML=`<h3>Vídeo do elenco</h3><div class="guide-grid"><div><b>Role o elenco inteiro</b><span>nome, posição, força, idade e valor</span></div><div><b>Treinamento</b><span>deixe visível quem está treinando</span></div></div><p class="muted small">Depois, registre compras e vendas manualmente. O plano da IA sempre usa apenas jogadores que realmente estão no seu elenco.</p>`;
 else if(calendar)els.analysisGuide.innerHTML=`<h3>Calendário</h3><div class="guide-grid"><div><b>Placar</b><span>já jogado</span></div><div><b>🏠 Casa</b><span>liga em casa</span></div><div><b>Sem casa</b><span>liga fora</span></div><div><b>🏆 Taça</b><span>condicional</span></div></div>`;
 else els.analysisGuide.innerHTML=`<h3>Resultado para aprendizado</h3><div class="guide-grid"><div><b>Placar</b></div><div><b>Posse/remates/cantos/faltas</b></div><div><b>🟨 / 🟥</b></div><div><b>Formações e eventos</b></div></div>`
}
function rosterCounts(s){const g={ATA:0,MEI:0,DEF:0,GOL:0};for(const p of s.roster||[]){const q=String(p.position||'').toUpperCase();if(/GK|GR|GOL/.test(q))g.GOL++;else if(/DC|DD|DE|CB|LB|RB|DEF/.test(q))g.DEF++;else if(/MC|MCD|MCO|MD|ME|MID/.test(q))g.MEI++;else g.ATA++}return g}
function trainingSuggestions(s){const roster=(s.roster||[]).filter(p=>p.name);return [...roster].sort((a,b)=>{const aa=Number(a.age)||99,ba=Number(b.age)||99,ar=Number(a.rating)||0,br=Number(b.rating)||0;return (aa-ba)*2+(ar-br)}).slice(0,4)}
function playerTableHtml(s){const roster=s.roster||[];if(!roster.length)return '<p class="warn-text">Envie um vídeo completo do elenco para montar a lista.</p>';return `<div class="roster-scroll"><table class="simple-table"><tr><th>Jogador</th><th>POS</th><th>OVR</th><th>Idade</th><th>Valor</th><th>Treino</th></tr>${roster.slice().sort((a,b)=>(Number(b.rating)||0)-(Number(a.rating)||0)).map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.position)}</td><td>${esc(p.rating)}</td><td>${esc(p.age)}</td><td>${fmtMoney(parseOsmValue(p.value)??p.value)}</td><td>${p.training?'🟠 Sim':'—'}</td></tr>`).join('')}</table></div>`}
function renderMarket(){
 const s=state.slots[selectedSlot-1];if(!s||s.status!=='active'){els.marketContent.innerHTML=`<div class="card"><p class="muted">Slot ${selectedSlot} livre.</p></div>`;return}recalculateSquadValue(s);const c=rosterCounts(s),train=trainingSuggestions(s),event=(state.eventIntel||localEventIntel()).events?.find(e=>e.status==='active');
 els.marketContent.innerHTML=`${eventIntelHtml(state.eventIntel||localEventIntel())}<div class="card"><div class="market-head"><div><div class="slot-num">SLOT ${selectedSlot}</div><h3>Elenco · ${esc(s.teamName)}</h3></div><span class="status-pill">${esc(s.myTeam.playerCount||0)} jogadores</span></div><div class="kpis"><div class="kpi"><span>Valor elenco</span><b>${fmtMoney(s.myTeam.squadValue)}</b></div><div class="kpi"><span>ATA</span><b>${c.ATA}/4</b></div><div class="kpi"><span>MEI</span><b>${c.MEI}/6</b></div><div class="kpi"><span>DEF</span><b>${c.DEF}/6</b></div><div class="kpi"><span>GOL</span><b>${c.GOL}/2</b></div></div><div class="actions"><button class="btn" onclick="openMarketSnapshot(${selectedSlot})">Atualizar vídeo do elenco</button><button class="btn secondary" onclick="rosterTransactionModal(${selectedSlot},'buy')">+ Compra</button><button class="btn secondary" onclick="rosterTransactionModal(${selectedSlot},'sell')">− Venda</button><button class="btn secondary" onclick="aiStrategyReview(${selectedSlot})">Plano IA</button></div></div><div class="card"><h3>Jogadores do elenco</h3>${playerTableHtml(s)}</div><div class="card"><h3>Treino recomendado agora</h3>${train.length?train.map((p,i)=>`<div class="plan-step"><span class="n">${i+1}</span><div><b>${esc(p.name)}</b><div class="small muted">${esc(p.position)} · OVR ${esc(p.rating)} · ${esc(p.age)} anos${p.training?' · já treinando':''}</div></div></div>`).join(''):'<p class="muted">Atualize o elenco para receber prioridades.</p>'}${event?`<div class="event-now"><b>⚡ ${esc(event.name)}</b><div class="small">${esc(event.strategy)}</div></div>`:''}</div><div class="card"><h3>Estratégia contínua</h3><div class="plan-list"><div class="plan-step"><span class="n">1</span><div><b>Suba o XI antes da profundidade</b><div class="small muted">Use o caixa para trocar o titular mais fraco por upgrade claro; depois recicle o antigo.</div></div></div><div class="plan-step"><span class="n">2</span><div><b>Mantenha capital girando</b><div class="small muted">Venda excedentes e ativos líquidos; não prenda caixa em reservas caras.</div></div></div><div class="plan-step"><span class="n">3</span><div><b>Treine quem ficará</b><div class="small muted">Priorize jovens titulares, elo fraco do XI e jovens líquidos que possam valorizar.</div></div></div></div></div>`
}
function rosterTransactionModal(n,type){const s=state.slots[n-1];if(type==='sell'){openModal(`<h2>Registrar venda · Slot ${n}</h2><div class="form-card"><label>Jogador<select id="txPlayer">${(s.roster||[]).map((p,i)=>`<option value="${i}">${esc(p.name)} · ${esc(p.position)} · ${esc(p.rating)}</option>`).join('')}</select></label><label>Valor da venda<input id="txPrice" inputmode="decimal" placeholder="Ex.: 8,5M"></label><button class="btn" onclick="saveRosterTransaction(${n},'sell')">Confirmar venda</button></div>`)}else{openModal(`<h2>Registrar compra · Slot ${n}</h2><div class="form-card"><label>Nome<input id="txName"></label><div class="data-grid"><label>Posição<input id="txPos" placeholder="PL, MC, DC, GR..."></label><label>OVR<input id="txRating" type="number"></label><label>Idade<input id="txAge" type="number"></label><label>Valor do jogador<input id="txValue" placeholder="Ex.: 6,3M"></label></div><label>Preço pago<input id="txPrice" placeholder="Ex.: 9M"></label><button class="btn" onclick="saveRosterTransaction(${n},'buy')">Confirmar compra</button></div>`)}}
function saveRosterTransaction(n,type){const s=state.slots[n-1];s.rosterTransactions=s.rosterTransactions||[];if(type==='sell'){const i=Number(document.getElementById('txPlayer').value),p=s.roster?.[i];if(!p){toast('Escolha um jogador');return}s.rosterTransactions.push({at:nowIso(),type:'sell',player:structuredClone(p),price:document.getElementById('txPrice').value||null});s.roster.splice(i,1)}else{const name=document.getElementById('txName').value.trim();if(!name){toast('Informe o nome');return}const p={name,position:document.getElementById('txPos').value.trim()||null,rating:clampInt(document.getElementById('txRating').value),age:Number(document.getElementById('txAge').value)||null,value:document.getElementById('txValue').value.trim()||null,training:false,forSale:false};s.roster.push(p);s.rosterTransactions.push({at:nowIso(),type:'buy',player:structuredClone(p),price:document.getElementById('txPrice').value||null})}recalculateSquadValue(s);s.updatedAt=nowIso();saveState();closeModal();toast(type==='sell'?'Venda registrada':'Compra registrada');setTimeout(()=>aiStrategyReview(n,true),150)}
async function aiStrategyReview(n,silent=false){const s=state.slots[n-1];if(!localStorage.getItem(API_KEY_STORAGE)){if(!silent)apiModal();return}const roster=(s.roster||[]).map(p=>({name:p.name,position:p.position,rating:p.rating,value:p.value,age:p.age,training:!!p.training}));if(!roster.length){toast('Primeiro envie o vídeo do seu elenco');return}if(!silent)toast('Atualizando plano do elenco…');const prompt=`Você é especialista em evolução de elenco no OSM. Use APENAS os jogadores presentes em roster. Pode recomendar vender ou treinar jogadores POR NOME somente se o nome existir exatamente em roster. Para compras, indique PERFIS (posição, OVR mínimo, idade/preço), nunca invente jogador disponível no mercado. Objetivo: aumentar força do XI e valor do elenco rápido, mantendo 4 ATA/6 MEI/6 DEF/2 GOL e até 4 vendas simultâneas (6 apenas em evento confirmado). Priorize jovens titulares/elos fracos para treino e considere evento atual. Retorne JSON {"summary":"","actions":[{"priority":1,"type":"sell|train|buy_profile|keep","player":null,"action":"","why":""}],"training":[{"player":"","why":""}],"buyProfiles":[{"position":"","minimumRating":null,"age":"","budgetRule":"","why":""}]}. Dados: ${JSON.stringify({overall:s.myTeam.overall,squadValue:s.myTeam.squadValue,roster,transactions:(s.rosterTransactions||[]).slice(-10),event:state.eventIntel})}`;try{const p=await geminiJson([{text:prompt}],{temperature:.08,maxOutputTokens:4200});s.marketStrategyAI={...p,generatedAt:nowIso()};saveState();if(!silent)strategyModal(n)}catch(e){if(!silent)toast(e.message)}}
function strategyModal(n){const p=state.slots[n-1].marketStrategyAI;if(!p)return;openModal(`<h2>Plano IA · Slot ${n}</h2><p class="muted">${esc(p.summary)}</p><div class="plan-list">${(p.actions||[]).map((a,i)=>`<div class="plan-step"><span class="n">${esc(a.priority||i+1)}</span><div><b>${esc(a.player?`${a.player}: ${a.action}`:a.action)}</b><div class="small muted">${esc(a.why)}</div></div></div>`).join('')}</div>${(p.training||[]).length?`<h3>Treinar</h3>${p.training.map(x=>`<div class="plan-step"><span class="n">🏋</span><div><b>${esc(x.player)}</b><div class="small muted">${esc(x.why)}</div></div></div>`).join('')}`:''}${(p.buyProfiles||[]).length?`<h3>Perfis para comprar</h3>${p.buyProfiles.map(x=>`<div class="plan-step"><span class="n">+</span><div><b>${esc(x.position)} · OVR ${esc(x.minimumRating)}+</b><div class="small muted">${esc(x.age)} · ${esc(x.budgetRule)} · ${esc(x.why)}</div></div></div>`).join('')}`:''}`)}
function openMarketSnapshot(n){setSelectedSlot(n);analysisMode='market';document.querySelectorAll('[data-analysis-mode]').forEach(x=>x.classList.toggle('active',x.dataset.analysisMode==='market'));clearAnalysisUi();renderAnalysisMode();showView('analyze')}

function persistentTacticHtml(s){if(!s||s.status!=='active')return '';const late=overdueSchedule(s);if(late){const i=scheduleIndexOf(s,late);return `<div class="card tactic-persistent overdue"><div class="tactic-head"><div><span class="eyebrow">JOGO ENCERRADO / HORÁRIO ULTRAPASSADO</span><h3>${esc(s.teamName)} × ${esc(late.opponent||s.opponent.teamName)}</h3><p class="danger-text small">${esc(fmtDateTime(late.dateTime))} · registre o resultado para avançar o calendário.</p></div></div><div class="actions"><button class="btn danger" onclick="resultModal(${s.slotNumber},${i})">Registrar resultado</button></div></div>`}const near=shouldRefreshNearMatch(s);if(!s.tactic)return `<div class="card tactic-persistent"><div class="tactic-head"><div><span class="eyebrow">TÁTICA · SLOT ${s.slotNumber}</span><h3>Sem tática para este jogo</h3></div></div><div class="actions"><button class="btn" onclick="prepareReanalysis(${s.slotNumber})">Analisar adversário</button><button class="btn secondary" onclick="strong433Modal(${s.slotNumber})">🔥 4-3-3 Forte</button></div></div>`;return `<div class="card tactic-persistent ${near?'needs-refresh':''}"><div class="tactic-head"><div><span class="eyebrow">TÁTICA ATUAL · SLOT ${s.slotNumber}</span><h3>${esc(s.teamName)} × ${esc(s.opponent.teamName)}</h3><p class="small ${near?'warn-text':'muted'}">${near?'⚠ Revalide perto do jogo':'✓ Tática disponível'} · ${esc(tacticAgeText(s))}</p></div></div><table class="tactic-table persistent-table">${tacticRows(s.tactic).map(([k,v])=>`<tr><td>${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join('')}</table><div class="actions"><button class="btn" onclick="prepareReanalysis(${s.slotNumber})">Atualizar tática</button><button class="btn secondary" onclick="strong433Modal(${s.slotNumber})">🔥 4-3-3 Forte</button><button class="btn secondary" onclick="manualTacticModal(${s.slotNumber})">Editar</button></div></div>`}
function chooseNextAction(){const s=state.slots[selectedSlot-1];if(s?.status==='active'){const late=overdueSchedule(s);if(late){const i=scheduleIndexOf(s,late);return {slot:s,title:`Registrar resultado contra ${late.opponent||s.opponent.teamName||'adversário'}`,detail:`A partida estava marcada para ${fmtDateTime(late.dateTime)}. A tática deixa de ser a prioridade depois do horário.`,button:`<button class="btn danger" onclick="resultModal(${s.slotNumber},${i})">Registrar resultado</button>`}}if(s.match?.nextMatchAt){const ms=new Date(s.match.nextMatchAt).getTime()-Date.now();if(ms>0&&ms<=settings.notifyMinutes*60000)return {slot:s,title:`Revalidar tática contra ${s.opponent.teamName||'o adversário'}`,detail:`Faltam ${countdown(s.match.nextMatchAt)}. Atualize o Data Analyst.`,button:`<button class="btn" onclick="prepareReanalysis(${s.slotNumber})">Atualizar tática agora</button>`}}if(!s.tactic)return {slot:s,title:`Gerar tática contra ${s.opponent.teamName||'o adversário'}`,detail:'Faça a leitura atual do adversário.',button:`<button class="btn" onclick="prepareReanalysis(${s.slotNumber})">Analisar agora</button>`}}return null}
function renderToday(){const action=chooseNextAction();els.nextAction.innerHTML=action?`<div class="priority">PRÓXIMA AÇÃO · SLOT ${action.slot.slotNumber}</div><h2>${esc(action.title)}</h2><p class="muted">${esc(action.detail)}</p><div class="hero-actions">${action.button||''}</div>`:`<div class="priority">SEU DIA NO OSM</div><h2>Sem ação urgente</h2><p class="muted">Selecione um slot para conferir a próxima partida.</p>`;renderTodayEvents();const sel=state.slots[selectedSlot-1];if(els.activeTacticPanel)els.activeTacticPanel.innerHTML=persistentTacticHtml(sel);els.slotsGrid.innerHTML=state.slots.map(slotCardHtml).join('')}


// ===== v5.2: fluxo limpo por slot, onboarding e resultado realmente concluído =====
function setupChecklist(s){
 const cal=(s.schedule||[]).length>0, roster=(s.roster||[]).length>0;
 const next=currentUnplayedSchedule(s);
 const tacticReady=!!(s.tactic||next?.tacticSnapshot);
 return [
  {key:'competition',done:s.status==='active'&&!!s.teamName&&!!s.competitionName,label:'1. Competição configurada',action:()=>configureSlot(s.slotNumber)},
  {key:'calendar',done:cal||!!s.defaultMatchTime,label:'2. Calendário / horário carregado',action:()=>openCalendarForSlot(s.slotNumber)},
  {key:'roster',done:roster,label:'3. Elenco completo carregado',action:()=>openMarketSnapshot(s.slotNumber)},
  {key:'tactic',done:tacticReady,label:'4. Adversário + Data Analyst + tática',action:()=>prepareReanalysis(s.slotNumber)}
 ];
}
function onboardingHtml(s){
 if(!s||s.status!=='active')return `<div class="card onboarding-card"><span class="eyebrow">COMEÇAR / RECOMEÇAR SLOT ${selectedSlot}</span><h3>Passo a passo inicial</h3><p class="muted small">Serve tanto para liga na rodada 0 quanto para liga já em andamento.</p><div class="onboarding-steps"><div><b>1. Criar competição</b><span>Time, nome da liga, rodada atual/total e horário padrão.</span></div><div><b>2. Vídeo do calendário completo</b><span>Role todos os jogos. Placar = já aconteceu; casa = mandante; sem casa = visitante; taça = condicional.</span></div><div><b>3. Vídeo do seu elenco completo</b><span>Role todos os jogadores para força, valor, posição, idade e treino.</span></div><div><b>4. Vídeo do próximo adversário</b><span>As 6 telas obrigatórias: partida, seu elenco, elenco rival e 3 telas do Data Analyst.</span></div><div><b>5. Depois do jogo</b><span>Envie vídeo do resultado ou registre manualmente; informe também sua nova posição.</span></div></div><div class="actions"><button class="btn" onclick="configureSlot(${selectedSlot})">Começar pelo passo 1</button></div></div>`;
 const rows=setupChecklist(s);return `<div class="card onboarding-card"><div class="market-head"><div><span class="eyebrow">CHECKLIST · SLOT ${s.slotNumber}</span><h3>O que já foi feito e o que falta</h3></div></div><div class="setup-list">${rows.map((x,i)=>`<button class="setup-row ${x.done?'done':'todo'}" onclick="runSetupStep(${s.slotNumber},'${x.key}')"><span>${x.done?'✓':'→'}</span><div><b>${esc(x.label)}</b><small>${x.done?'Concluído':'Pendente — toque para fazer'}</small></div></button>`).join('')}</div></div>`;
}
function runSetupStep(n,key){setSelectedSlot(n);if(key==='competition')configureSlot(n);else if(key==='calendar')openCalendarForSlot(n);else if(key==='roster')openMarketSnapshot(n);else prepareReanalysis(n)}
function nextPendingSetup(s){return setupChecklist(s).find(x=>!x.done)||null}

function inferOpponentHuman(s,c){
 const own=normText(settings.userNick||'leandrozzy');
 const manager=String(c?.opponent?.manager||s.opponent?.manager||'').trim();
 if(manager){s.opponent.manager=manager;s.opponent.human=normText(manager)!==own;return}
 if(c?.opponent?.human===true||c?.opponent?.human===false){s.opponent.human=c.opponent.human;return}
 // Regra do usuário: sem nick visível sob o adversário na primeira tela = computador.
 if((c?.screensSeen||[]).some(x=>['dashboard','match_overview'].includes(x)))s.opponent.human=false;
}
function applyVisionResult(result){
 for(const c of result.captures||[]){
  const n=resolveCaptureSlot(c);if(!n)continue;const s=state.slots[n-1];s.status='active';s.createdAt=s.createdAt||nowIso();s.updatedAt=nowIso();
  for(const k of ['teamName','competitionName','competitionType','round','totalRounds'])if(c[k]!==null&&c[k]!==undefined&&c[k]!=='')s[k]=c[k];
  s.myTeam=mergeNonNull(s.myTeam,c.myTeam||{});s.opponent=mergeNonNull(s.opponent,c.opponent||{});s.match=mergeNonNull(s.match,c.match||{});inferOpponentHuman(s,c);
  if(c.match?.countdownText)s.match.nextMatchAt=parseCountdownToIso(c.match.countdownText)||s.match.nextMatchAt;
  if(c.match?.exactDateTimeText){const d=parseLooseDateTime(c.match.exactDateTimeText);if(d)s.match.nextMatchAt=d.toISOString()}
  if(Array.isArray(c.roster)&&c.roster.length)s.roster=mergePlayers(s.roster,c.roster);
  s.coverage={...s.coverage,...Object.fromEntries((c.screensSeen||[]).map(x=>[x,true]))};s.missing=buildMissing(s,c.missing||[]);s.marketPlan=buildLocalMarketPlan(s);
 }
}

function humanTacticDirective(s){return s.opponent?.human===true?`ADVERSÁRIO HUMANO CONFIRMADO (${s.opponent.manager||'nick detectado'}). Faça uma análise mais robusta: considere mudanças tardias, possíveis contra-táticas para a formação/plano detectados, histórico específico contra humanos e risco de o rival alterar a configuração. Escolha UMA tática final com boa robustez a pequenas mudanças; não ofereça alternativas. Se a leitura tiver mais de ${settings.notifyMinutes} min antes do jogo, marque mentalmente que deve ser revalidada perto do horário.`:`Adversário computador/CPU: priorize estabilidade e exploração direta do padrão detectado.`}
async function generateTacticForSlot(n,silent=false){
 const s=state.slots[n-1];if(s.status!=='active')return;if(!localStorage.getItem(API_KEY_STORAGE)){apiModal('Salve sua chave Gemini para gerar táticas.');return}
 if(!silent)toast(`Gerando tática do Slot ${n}…`);
 try{const prompt=`Você é um analista especialista em OSM 26. Gere UMA tática completa, sem alternativas, visando maximizar a chance de vitória. Use somente os dados fornecidos e o histórico; nunca invente ausentes.\n\n${humanTacticDirective(s)}\n\nConsidere força relativa e por setores, casa/fora, estádio, CT, treino secreto, árbitro, Data Analyst e histórico. Se houver treino secreto sem dados táticos, não invente. Árbitro rigoroso exige desarme mais seguro. Formação deve estar em allowedFormations; plano em allowedGamePlans; sliders inteiros 0-100.\n\nDADOS:\n${JSON.stringify(tacticContext(s))}\n\nRETORNE JSON: {"formation":"4-3-3 A","gamePlan":"Jogar pelas alas","pressure":70,"mentality":70,"tempo":70,"marking":"À zona","offside":"Não","tackling":"Normal","attackInstruction":"Atacar apenas","midfieldInstruction":"Manter posição","defenceInstruction":"Defender atrás","confidence":"média","reason":"resumo curto"}`;const t=await geminiJson([{text:prompt}],{temperature:.08,maxOutputTokens:2400});s.tactic=sanitizeTactic(t,s);s.tacticFreshAt=nowIso();s.tacticNeedsRefresh=false;attachTacticToUpcomingSchedule(s);s.updatedAt=nowIso();saveState();if(!silent)tacticModal(n);return s.tactic}catch(e){console.error(e);s.tactic=fallbackTactic(s);s.tacticFreshAt=nowIso();attachTacticToUpcomingSchedule(s);saveState();if(!silent)tacticModal(n);return s.tactic}
}

function latestPendingResultRow(s){
 const rows=(s.schedule||[]).map((x,i)=>({...x,_i:i})).filter(x=>!x.result&&!x.played&&!x.skipped&&x.dateTime&&new Date(x.dateTime).getTime()<=Date.now());
 rows.sort((a,b)=>new Date(b.dateTime)-new Date(a.dateTime));return rows[0]||null;
}
function nextFutureRow(s){const rows=(s.schedule||[]).filter(x=>!x.result&&!x.played&&!x.skipped&&x.dateTime&&new Date(x.dateTime).getTime()>Date.now()).sort((a,b)=>new Date(a.dateTime)-new Date(b.dateTime));return rows[0]||null}
function syncAfterResult(s){
 const next=nextFutureRow(s);if(next){s.match.nextMatchAt=next.dateTime;s.match.venue=next.venue||null;s.opponent.teamName=next.opponent||null;s.opponent.formation=null;s.opponent.style=null;s.opponent.marking=null;s.opponent.offside=null;s.opponent.manager=null;s.opponent.human=null;s.tactic=null;s.tacticNeedsRefresh=true;return}
 s.match.nextMatchAt=null;s.opponent.teamName=null;s.tactic=null;s.tacticNeedsRefresh=true;ensureNextMatchFromScheduleOrDefault(s)
}
function resolveCalendarResultRow(s,calendarIndex=null){if(calendarIndex!==null&&s.schedule?.[calendarIndex])return {...s.schedule[calendarIndex],_i:calendarIndex};const late=latestPendingResultRow(s);if(late)return late;const withTactic=(s.schedule||[]).map((x,i)=>({...x,_i:i})).filter(x=>!x.result&&!x.played&&!x.skipped&&x.tacticSnapshot).sort((a,b)=>Math.abs(new Date(a.dateTime||0)-Date.now())-Math.abs(new Date(b.dateTime||0)-Date.now()));return withTactic[0]||null}
function resultModal(n,calendarIndex=null){
 const s=state.slots[n-1],cal=resolveCalendarResultRow(s,calendarIndex),tactic=cal?.tacticSnapshot||s.tactic;if(!tactic){toast('Primeiro gere a tática desse jogo.');return}
 const opp=cal?.opponent||s.opponent.teamName;openModal(`<h2>Resultado · Slot ${n}</h2><p class="muted">${esc(s.teamName)} × ${esc(opp)}</p><div class="form-card"><div class="data-grid"><label>Meus gols<input id="resGF" type="number" min="0"></label><label>Gols rival<input id="resGA" type="number" min="0"></label><label>Posição após o jogo<input id="resPosition" type="number" min="1" value="${esc(s.myTeam?.leaguePosition||'')}"></label><label>🟨 meus<input id="resMY" type="number" min="0"></label><label>🟥 meus<input id="resMR" type="number" min="0"></label><label>🟨 rival<input id="resOY" type="number" min="0"></label><label>🟥 rival<input id="resOR" type="number" min="0"></label></div><label>Observação<input id="resNote" placeholder="Ex.: rival mudou a formação"></label><button class="btn" onclick="saveResultV52(${n},${cal?cal._i:'null'})">Salvar resultado</button></div>`)
}
function saveResultV52(n,calendarIndex=null){
 const s=state.slots[n-1],gf=Number(document.getElementById('resGF').value),ga=Number(document.getElementById('resGA').value);if(!Number.isFinite(gf)||!Number.isFinite(ga)){toast('Informe o placar');return}
 const cal=resolveCalendarResultRow(s,calendarIndex),tactic=cal?.tacticSnapshot||s.tactic;if(!tactic){toast('Não há tática registrada para este jogo');return}
 const num=id=>{const v=Number(document.getElementById(id)?.value);return Number.isFinite(v)?v:null};const opp=cal?.opponent||s.opponent.teamName,roundPlayed=cal?.round??s.round;
 const entry={createdAt:nowIso(),scheduleIndex:cal?cal._i:null,opponent:opp,gf,ga,score:`${gf}-${ga}`,note:document.getElementById('resNote').value.trim()||null,tactic:structuredClone(tactic),stats:{myYellowCards:num('resMY'),myRedCards:num('resMR'),oppYellowCards:num('resOY'),oppRedCards:num('resOR')},context:{myOverall:cal?.myOverall??s.myTeam.overall,oppOverall:cal?.oppOverall??s.opponent.overall,oppFormation:cal?.opponentSnapshot?.formation??s.opponent.formation,oppStyle:cal?.opponentSnapshot?.style??s.opponent.style,oppMarking:cal?.opponentSnapshot?.marking??s.opponent.marking,oppOffside:cal?.opponentSnapshot?.offside??s.opponent.offside,opponentHuman:cal?.opponentSnapshot?.human??s.opponent.human,opponentManager:cal?.opponentSnapshot?.manager??s.opponent.manager,venue:cal?.venue??s.match.venue,referee:s.match.refereeColor||s.match.refereeName,strengthBucket:strengthBucket(s)}};
 s.results=s.results||[];s.results.push(entry);recordPositionAtRound(s,document.getElementById('resPosition')?.value,roundPlayed);
 if(cal&&s.schedule?.[cal._i]){const row=s.schedule[cal._i];row.played=true;row.result=entry.score;row.resultEntryAt=entry.createdAt;row.tacticSnapshot=row.tacticSnapshot||structuredClone(tactic);if(row.competitionType==='cup'&&gf<ga)pruneConditionalCupMatches(s)}
 if(Number.isFinite(Number(roundPlayed)))s.round=Math.max(Number(s.round)||0,Number(roundPlayed)+1);s.updatedAt=nowIso();syncAfterResult(s);saveState();closeModal();toast('Resultado concluído. O app avançou para o próximo jogo.')
}
function overdueSchedule(s){return latestPendingResultRow(s)}
function currentUnplayedSchedule(s){return latestPendingResultRow(s)||nextFutureRow(s)}

function chooseNextAction(){
 const s=state.slots[selectedSlot-1];if(!s||s.status!=='active')return null;
 const setup=nextPendingSetup(s);if(setup)return {slot:s,title:'Completar configuração do slot',detail:setup.label,button:`<button class="btn" onclick="runSetupStep(${s.slotNumber},'${setup.key}')">Fazer agora</button>`};
 const late=latestPendingResultRow(s);if(late){const tactic=late.tacticSnapshot||s.tactic;if(tactic)return {slot:s,title:`Registrar resultado contra ${late.opponent||'adversário'}`,detail:`Jogo de ${fmtDateTime(late.dateTime)} já passou.`,button:`<button class="btn danger" onclick="resultModal(${s.slotNumber},${late._i})">Registrar resultado</button>`}}
 const next=nextFutureRow(s);if(next){const ms=new Date(next.dateTime).getTime()-Date.now();if(ms<=settings.notifyMinutes*60000&&ms>0)return {slot:s,title:`Revalidar tática${s.opponent.human===true?' contra humano':''}`,detail:`Faltam ${countdown(next.dateTime)}. ${s.opponent.human===true?'Adversário humano: reabra a primeira tela e o Data Analyst para captar mudança tardia.':'Atualize o Data Analyst.'}`,button:`<button class="btn" onclick="prepareReanalysis(${s.slotNumber})">Atualizar agora</button>`};if(!next.tacticSnapshot&&!s.tactic)return {slot:s,title:`Gerar tática para ${next.opponent||'o próximo jogo'}`,detail:`${fmtDateTime(next.dateTime)} · ${next.venue||'Local NI'}`,button:`<button class="btn" onclick="prepareReanalysis(${s.slotNumber})">Analisar adversário</button>`}}
 return null
}
function renderToday(){
 const s=state.slots[selectedSlot-1],action=chooseNextAction();els.nextAction.innerHTML=action?`<div class="priority">PRÓXIMA AÇÃO · SLOT ${action.slot.slotNumber}</div><h2>${esc(action.title)}</h2><p class="muted">${esc(action.detail)}</p><div class="hero-actions">${action.button||''}</div>`:`<div class="priority">SEU DIA NO OSM</div><h2>${s?.status==='active'?'Tudo em dia neste slot':'Configure o slot para começar'}</h2><p class="muted">${s?.status==='active'?'O app só mostrará ações que realmente ainda precisam ser feitas.':'Use o passo a passo abaixo.'}</p>`;renderTodayEvents();if(els.activeTacticPanel)els.activeTacticPanel.innerHTML=onboardingHtml(s)+(s?.status==='active'?persistentTacticHtml(s):'');els.slotsGrid.innerHTML=state.slots.map(slotCardHtml).join('')
}


// ===== v5.3: OCR rápido por modo + continuidade =====
let ocrJobBusy=false,wakeLockHandle=null;
async function acquireOcrWakeLock(){try{if('wakeLock'in navigator&&!wakeLockHandle)wakeLockHandle=await navigator.wakeLock.request('screen')}catch(e){console.warn('Wake Lock indisponível',e)}}
async function releaseOcrWakeLock(){try{await wakeLockHandle?.release()}catch{}wakeLockHandle=null}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&ocrJobBusy)acquireOcrWakeLock()});
function frameLimitForMode(mode){return mode==='tactic'?12:mode==='calendar'?6:mode==='result'?6:7}
function evidenceLimitForMode(mode){return mode==='tactic'?6:mode==='calendar'?4:mode==='result'?5:3}
async function runLocalOcr(frames){if(!window.Tesseract)throw new Error('OCR local não carregou. Recarregue a página e tente novamente.');const results=[];let worker=null;try{worker=await Tesseract.createWorker('por+eng',1,{logger:m=>{if(m.status==='recognizing text'&&m.progress)setProgress(20+Math.round(m.progress*28),`OCR local ${Math.round(m.progress*100)}%…`)}})}catch{worker=await Tesseract.createWorker('eng',1)}try{for(let i=0;i<frames.length;i++){setProgress(22+Math.round((i/Math.max(1,frames.length))*28),`OCR ${i+1}/${frames.length}…`);const {data}=await worker.recognize(frames[i].dataUrl);const text=cleanOcrText(data?.text||'');if(text.length>4)results.push({frame:i+1,time:Math.round(frames[i].time||0),text,confidence:data?.confidence??null})}}finally{if(worker)await worker.terminate()}return {mode:analysisMode,frames:results,joined:results.map(x=>`[Quadro ${x.frame} ~${x.time}s]\n${x.text}`).join('\n\n')}}
async function handleFiles(files){if(!files.length)return;if(!localStorage.getItem(API_KEY_STORAGE)){apiModal('Antes de analisar, salve sua chave Gemini.');return}if(ocrJobBusy){toast('Já existe uma leitura em andamento. Aguarde terminar.');return}const jobMode=analysisMode,jobSlot=selectedSlot;ocrJobBusy=true;await acquireOcrWakeLock();clearAnalysisUi();els.analysisProgress.classList.remove('hidden');try{const video=files.find(f=>f.type.startsWith('video/')),images=files.filter(f=>f.type.startsWith('image/'));let frames=[];if(video){renderVideoPreview(video);setProgress(6,'Selecionando poucos quadros úteis…');frames=await extractVideoFramesFast(video,frameLimitForMode(jobMode))}else if(images.length){for(const f of images.slice(0,frameLimitForMode(jobMode)))frames.push(await imageFileToFrame(f))}else throw new Error('Selecione um vídeo ou imagens do OSM.');setProgress(18,`OCR local em ${frames.length} quadros…`);const ocr=await runLocalOcr(frames);let result;if(jobMode==='tactic'){const selected=selectRequiredTacticFrames(frames,ocr);renderRequiredTacticPreview(selected);const requiredFrames=assertAllRequiredTacticScreens(selected);setProgress(58,'Enviando as telas obrigatórias para a IA…');result=await analyzeOcrPackage(ocr,requiredFrames);applyVisionResult(result);applyRecommendedTactics(result);renderAnalysisResult(result)}else if(jobMode==='calendar'){const evidence=selectVisualEvidence(frames,evidenceLimitForMode(jobMode));renderFramePreview(evidence);setProgress(58,'Lendo casa/fora, taça e V/D/E…');result=await analyzeCalendarOcr(ocr,evidence);applyCalendarResult(result);renderCalendarResult(result)}else if(jobMode==='result'){const evidence=selectVisualEvidence(frames,evidenceLimitForMode(jobMode));renderFramePreview(evidence);setProgress(58,'Lendo resultado e cartões…');result=await analyzeResultOcr(ocr,evidence);applyResultVideo(result);renderResultVideo(result)}else{const evidence=selectVisualEvidence(frames,evidenceLimitForMode(jobMode));renderFramePreview(evidence);setProgress(58,'Lendo elenco e posições…');result=await analyzeOcrPackage(ocr,evidence);applyVisionResult(result);const ss=state.slots[jobSlot-1];ss.lastRosterSnapshotAt=nowIso();recalculateSquadValue(ss);ss.market=[];renderAnalysisResult(result)}state.lastAnalysisAt=nowIso();saveState();setProgress(100,'Concluído');toast(jobMode==='calendar'?'Calendário atualizado':jobMode==='result'?'Resultado registrado':jobMode==='market'?'Elenco atualizado':'Tática gerada')}catch(e){console.error(e);els.analysisResult.innerHTML=`<div class="result-card"><h3 class="danger-text">Não foi possível concluir</h3><p>${esc(e.message||e)}</p></div>`;setProgress(100,'Falha na análise')}finally{ocrJobBusy=false;await releaseOcrWakeLock();setTimeout(()=>els.analysisProgress.classList.add('hidden'),1200)}}

// ===== v5.4: estabilidade de processamento, calendário ancorado e UI persistente =====
const analysisUiCacheV54={};
let activeAnalysisJobV54=null;
let analysisTargetOverrideV54=null;

function analysisCacheKeyV54(slot=selectedSlot,mode=analysisMode){return `${slot}:${mode}`}
function cacheAnalysisUiV54(slot=selectedSlot,mode=analysisMode){
 const key=analysisCacheKeyV54(slot,mode);
 analysisUiCacheV54[key]={
  preview:els.mediaPreview?.innerHTML||'',
  coverage:els.coveragePanel?.innerHTML||'',
  coverageHidden:els.coveragePanel?.classList.contains('hidden')!==false,
  result:els.analysisResult?.innerHTML||'',
  progress:els.progressBar?.style.width||'0%',
  progressText:els.progressText?.textContent||'',
  progressHidden:els.analysisProgress?.classList.contains('hidden')!==false
 };
}
function restoreAnalysisUiV54(slot=selectedSlot,mode=analysisMode){
 const c=analysisUiCacheV54[analysisCacheKeyV54(slot,mode)];
 if(c){
  if(els.mediaPreview)els.mediaPreview.innerHTML=c.preview;
  if(els.coveragePanel){els.coveragePanel.innerHTML=c.coverage;els.coveragePanel.classList.toggle('hidden',c.coverageHidden)}
  if(els.analysisResult)els.analysisResult.innerHTML=c.result;
  if(els.progressBar)els.progressBar.style.width=c.progress;
  if(els.progressText)els.progressText.textContent=c.progressText;
  if(els.analysisProgress)els.analysisProgress.classList.toggle('hidden',c.progressHidden);
  return;
 }
 if(els.mediaPreview)els.mediaPreview.innerHTML='';
 if(els.coveragePanel){els.coveragePanel.innerHTML='';els.coveragePanel.classList.add('hidden')}
 if(els.analysisProgress)els.analysisProgress.classList.add('hidden');
 renderAnalysisSlotStateV54();
}
function renderAnalysisSlotStateV54(){
 const s=state.slots[selectedSlot-1];
 if(!els.analysisResult)return;
 if(!s||s.status!=='active'){els.analysisResult.innerHTML='';return}
 const err=s.lastAnalysisError?.[analysisMode];
 els.analysisResult.innerHTML=`<div class="result-card"><h3>Slot ${selectedSlot} · ${esc(s.teamName)}</h3>
 <div class="data-grid">
  <div class="data-cell"><span>Modo</span><b>${esc(analysisMode)}</b></div>
  <div class="data-cell"><span>Adversário</span><b>${esc(s.opponent?.teamName)}</b></div>
  <div class="data-cell"><span>Força</span><b>${esc(s.myTeam?.overall)} × ${esc(s.opponent?.overall)}</b></div>
  <div class="data-cell"><span>Última leitura</span><b>${esc(s.lastAnalysisByMode?.[analysisMode]?fmtDateTime(s.lastAnalysisByMode[analysisMode]):'Ainda não')}</b></div>
 </div>${err?`<p class="danger-text small"><b>Último erro:</b> ${esc(err)}</p>`:''}</div>`;
}
function renderGlobalJobV54(){
 const b=document.getElementById('globalJobBanner');if(!b)return;
 const j=activeAnalysisJobV54;
 if(!j){b.classList.add('hidden');b.innerHTML='';return}
 b.classList.remove('hidden');
 const cls=j.status==='error'?'error':j.status==='done'?'done':'busy';
 b.className=`global-job ${cls}`;
 b.innerHTML=`<div><b>Slot ${j.slot} · ${esc(j.modeLabel)}</b><span>${esc(j.text||'Processando…')}</span></div><strong>${j.progress||0}%</strong>`;
}
function setProgress(p,text){
 const pct=Math.max(0,Math.min(100,Math.round(Number(p)||0)));
 if(activeAnalysisJobV54){activeAnalysisJobV54.progress=pct;activeAnalysisJobV54.text=text;renderGlobalJobV54()}
 if(els.progressBar)els.progressBar.style.width=`${pct}%`;
 if(els.progressText)els.progressText.textContent=text;
 if(activeAnalysisJobV54 && selectedSlot===activeAnalysisJobV54.slot && analysisMode===activeAnalysisJobV54.mode)cacheAnalysisUiV54();
}
function bindAnalysisModes(){
 document.querySelectorAll('[data-analysis-mode]').forEach(b=>b.addEventListener('click',()=>{
  cacheAnalysisUiV54();
  analysisMode=b.dataset.analysisMode;
  document.querySelectorAll('[data-analysis-mode]').forEach(x=>x.classList.toggle('active',x===b));
  renderAnalysisMode();
  restoreAnalysisUiV54();
 }))
}
function showView(name){
 document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.view===name));
 document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
 document.getElementById('view-'+name)?.classList.add('active');
 renderSlotSwitcher();
 if(name==='market')renderMarket();
 if(name==='history')renderHistory();
 if(name==='info')renderInfo();
 if(name==='analyze'){if(els.slotTarget)els.slotTarget.value=String(selectedSlot);renderAnalysisMode();restoreAnalysisUiV54()}
}
function setSelectedSlot(n){
 n=Number(n);if(![1,2,3,4].includes(n))return;
 cacheAnalysisUiV54();
 selectedSlot=n;localStorage.setItem('osm_ai_coach_selected_slot_v52',String(n));
 renderSlotSwitcher();if(els.slotTarget)els.slotTarget.value=String(n);
 renderToday();renderMarket();renderHistory();renderInfo();renderAnalysisMode();
 if(document.getElementById('view-analyze')?.classList.contains('active'))restoreAnalysisUiV54();
 toast(`Slot ${n} selecionado`);
}
function resolveCaptureSlot(c){
 if(analysisTargetOverrideV54)return Number(analysisTargetOverrideV54);
 const target=els.slotTarget?.value;if(target&&target!=='auto')return Number(target);
 if([1,2,3,4].includes(Number(c.slotNumber)))return Number(c.slotNumber);
 if(c.teamName){const found=state.slots.find(s=>s.teamName&&normalize(s.teamName)===normalize(c.teamName));if(found)return found.slotNumber}
 return selectedSlot;
}

async function extractUniformFramesV54(file,count=6){
 const url=URL.createObjectURL(file),v=document.createElement('video');v.src=url;v.muted=true;v.playsInline=true;v.preload='metadata';
 await new Promise((res,rej)=>{v.onloadedmetadata=res;v.onerror=()=>rej(new Error(`Não consegui abrir ${file.name}`))});
 const dur=Math.max(.2,v.duration||1),out=[];
 for(let i=0;i<count;i++){
  const t=Math.min(dur-.05,Math.max(.05,dur*(i+.5)/count));
  await seekVideo(v,t);out.push(captureVideoFrame(v,t,file.name));
 }
 URL.revokeObjectURL(url);return out;
}
async function analyzeCalendarFramesV54(frames,slotNumber){
 const s=state.slots[slotNumber-1];
 const parts=[{text:`Você está lendo o CALENDÁRIO do OSM 26 em sequência temporal. Há várias capturas do mesmo vídeo, cobrindo do começo ao fim.
NÃO EXTRAIA NEM INVENTE DATAS. O vídeo serve somente para identificar a ORDEM das partidas.

REGRAS VISUAIS:
- símbolo de casa/casinha à esquerda da partida => venue="Casa";
- sem casinha => venue="Fora";
- símbolo de taça/troféu => competitionType="cup";
- sem taça => competitionType="league";
- V => vitória já ocorrida; D => derrota já ocorrida; E => empate já ocorrido;
- placar numérico, por exemplo 2-2 ou 3-0, => partida já ocorrida;
- partida sem V/D/E e sem placar => played=false;
- preserve TODAS as partidas visíveis ao longo das imagens, sem duplicar a mesma rodada;
- retorne em ordem de calendário/rodada;
- extraia o placar numérico quando legível; caso só haja V/D/E, use outcome e deixe result=null;
- não invente adversário ou rodada.

RETORNE APENAS JSON:
{"matches":[{"sequence":1,"round":null,"opponent":null,"competitionType":"league|cup","venue":"Casa|Fora","result":null,"outcome":"V|D|E|null","played":false,"conditional":false}]}

Contexto do slot: ${JSON.stringify({team:s.teamName,round:s.round,competition:s.competitionName})}`}];
 for(const f of frames)parts.push({inlineData:{mimeType:f.mimeType,data:f.base64}});
 return geminiJson(parts,{temperature:.01,maxOutputTokens:8000});
}
function normalizeCalendarMatchV54(x){
 const outcome=['V','D','E'].includes(String(x.outcome||'').toUpperCase())?String(x.outcome).toUpperCase():null;
 return {sequence:Number(x.sequence)||null,round:x.round??null,opponent:x.opponent??null,competitionType:x.competitionType==='cup'?'cup':'league',
 venue:x.venue==='Casa'?'Casa':'Fora',result:x.result||null,outcome,played:!!x.played||!!outcome||!!x.result,conditional:!!x.conditional,skipped:false,
 dateTime:null,calendarAnchored:false};
}
function calendarRowKeyV54(x){return `${x.round??''}|${normalize(x.opponent||'')}|${x.competitionType||''}`}
function applyCalendarResultV54(result,slotNumber){
 const s=state.slots[slotNumber-1],old=new Map((s.schedule||[]).map(x=>[calendarRowKeyV54(x),x]));
 const incoming=(result.matches||[]).map(normalizeCalendarMatchV54);
 s.schedule=incoming.map((x,i)=>{
  const prev=old.get(calendarRowKeyV54(x))||{};
  return {...prev,...x,
   result:prev.result&&String(prev.result).match(/\d/) ? prev.result : (x.result||prev.result||null),
   played:!!(prev.played||x.played),
   tacticSnapshot:prev.tacticSnapshot||null,opponentSnapshot:prev.opponentSnapshot||null,
   resultEntryAt:prev.resultEntryAt||null
  };
 });
 pruneConditionalCupMatches(s);
 s.calendarReadAt=nowIso();s.updatedAt=nowIso();
 if(s.calendarAnchorAt)applyCalendarAnchorV54(slotNumber,s.calendarAnchorAt,false);
 saveState();
}
function localDateTimeValueV54(iso){
 if(!iso)return '';
 const d=new Date(iso);if(Number.isNaN(d.getTime()))return '';
 const z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,16);
}
function applyCalendarAnchorV54(n,value,notify=true){
 const s=state.slots[n-1];if(!value)return;
 const anchor=new Date(value);if(Number.isNaN(anchor.getTime())){toast('Data/hora inválida');return}
 const rows=s.schedule||[];const anchorIndex=rows.findIndex(x=>!x.played&&!x.skipped);
 if(anchorIndex<0){toast('Não encontrei próximo jogo pendente no calendário');return}
 s.calendarAnchorAt=anchor.toISOString();s.calendarAnchorIndex=anchorIndex;
 rows.forEach((x,i)=>{const d=new Date(anchor);d.setDate(d.getDate()+(i-anchorIndex));x.dateTime=d.toISOString();x.calendarAnchored=true});
 ensureNextMatchFromScheduleV54(s);s.updatedAt=nowIso();saveState();
 if(notify)toast('Data/hora do próximo jogo aplicada ao calendário');
 renderCalendarResultV54({matches:rows},n);
}
function ensureNextMatchFromScheduleV54(s){
 const now=Date.now();const next=(s.schedule||[]).filter(x=>!x.played&&!x.skipped&&x.dateTime&&new Date(x.dateTime).getTime()>now).sort((a,b)=>new Date(a.dateTime)-new Date(b.dateTime))[0];
 if(next){s.match.nextMatchAt=next.dateTime;s.match.venue=next.venue||null;s.opponent.teamName=next.opponent||null;return}
 s.match.nextMatchAt=null;
}
function latestPendingResultRow(s){
 if(!s?.calendarAnchorAt)return null;
 const rows=(s.schedule||[]).map((x,i)=>({...x,_i:i})).filter(x=>!x.result&&!x.played&&!x.skipped&&x.calendarAnchored&&x.dateTime&&new Date(x.dateTime).getTime()<=Date.now());
 rows.sort((a,b)=>new Date(b.dateTime)-new Date(a.dateTime));return rows[0]||null;
}
function nextFutureRow(s){
 if(!s?.calendarAnchorAt)return null;
 return (s.schedule||[]).filter(x=>!x.result&&!x.played&&!x.skipped&&x.calendarAnchored&&x.dateTime&&new Date(x.dateTime).getTime()>Date.now()).sort((a,b)=>new Date(a.dateTime)-new Date(b.dateTime))[0]||null;
}
function calendarStatusV54(x,s,i){
 if(x.result)return `<span class="calendar-score">${esc(x.result)}</span>`;
 if(x.played)return `<span class="done-label">${esc(x.outcome||'Jogado')}</span>`;
 if(x.skipped)return `<span class="muted">Ignorado</span>`;
 if(!s.calendarAnchorAt||!x.dateTime)return `<span class="muted">Aguardando data/hora</span>`;
 if(new Date(x.dateTime).getTime()<=Date.now()){
  return x.tacticSnapshot?`<button class="btn tiny danger" onclick="resultModal(${s.slotNumber},${i})">Registrar resultado</button>`:`<span class="warn-text">Horário passou · sem tática registrada</span>`;
 }
 return `<span class="future-label">Agendado</span>`;
}
function calendarTableHtml(s){
 const rows=s.schedule||[];
 if(!rows.length)return '<p class="muted">Calendário ainda não lido.</p>';
 return `<div class="calendar-list">${rows.map((x,i)=>`<div class="calendar-row ${(!x.played&&!x.result&&x.calendarAnchored&&x.dateTime&&new Date(x.dateTime).getTime()<=Date.now())?'overdue':''} ${x.skipped?'skipped':''}">
  <div class="calendar-main"><b>${x.competitionType==='cup'?'🏆':'⚽'} ${esc(x.opponent||'Adversário')}</b><span>${esc(x.venue||'NI')} · ${x.round!=null?'Rodada '+esc(x.round):'Rodada NI'}</span></div>
  <div class="calendar-when"><b>${x.dateTime?esc(fmtDateTime(x.dateTime)):'Data/hora pendente'}</b></div>
  <div class="calendar-status">${calendarStatusV54(x,s,i)}</div>
 </div>`).join('')}</div>`;
}
function renderCalendarResultV54(result,slotNumber=selectedSlot){
 const s=state.slots[slotNumber-1],rows=s.schedule||[];
 if(slotNumber!==selectedSlot||analysisMode!=='calendar')return;
 if(els.coveragePanel)els.coveragePanel.classList.add('hidden');
 const nextPending=rows.find(x=>!x.played&&!x.skipped);
 const prefill=localDateTimeValueV54(s.calendarAnchorAt||s.match.nextMatchAt);
 els.analysisResult.innerHTML=`<div class="result-card"><h3>Calendário · Slot ${slotNumber}</h3>
 <p class="muted small">O vídeo define ordem, adversário, casa/fora, taça e resultados. A data é ancorada manualmente no próximo jogo para não inventar datas.</p>
 ${nextPending?`<div class="calendar-anchor"><label>Data/hora do próximo jogo (${esc(nextPending.opponent||'adversário')})<input id="calendarAnchorInput" type="datetime-local" value="${esc(prefill)}"></label><button class="btn" onclick="applyCalendarAnchorV54(${slotNumber},document.getElementById('calendarAnchorInput').value)">Aplicar ao calendário</button></div>`:''}
 ${calendarTableHtml(s)}</div>`;
 cacheAnalysisUiV54(slotNumber,'calendar');
}
function renderInfo(){
 const s=state.slots[selectedSlot-1];if(!els.infoContent)return;
 if(!s||s.status!=='active'){els.infoContent.innerHTML=`<div class="card"><p class="muted">Slot ${selectedSlot} livre.</p></div>`;return}
 els.infoContent.innerHTML=`<div class="card"><div class="market-head"><div><div class="slot-num">SLOT ${selectedSlot}</div><h3>${esc(s.teamName)} · ${esc(s.competitionName)}</h3></div><button class="btn secondary" onclick="configureSlot(${selectedSlot})">Editar</button></div>
 <div class="kpis"><div class="kpi"><span>Posição</span><b>${esc(s.myTeam?.leaguePosition)}</b></div><div class="kpi"><span>Rodada</span><b>${esc(s.round)}/${esc(s.totalRounds)}</b></div><div class="kpi"><span>Força</span><b>${esc(s.myTeam?.overall)}</b></div><div class="kpi"><span>Próximo</span><b>${esc(s.match?.nextMatchAt?fmtDateTime(s.match.nextMatchAt):'Definir data/hora')}</b></div></div></div>
 <div class="card"><h3>Evolução da posição</h3>${positionChartHtml(s)}</div>
 <div class="card"><div class="market-head"><h3>Calendário</h3><button class="btn secondary" onclick="openCalendarForSlot(${selectedSlot})">Atualizar calendário</button></div>${calendarTableHtml(s)}</div>`;
}

async function applyResultVideoV54(r,slotNumber){
 const s=state.slots[slotNumber-1],gf=Number(r.gf),ga=Number(r.ga);if(!Number.isFinite(gf)||!Number.isFinite(ga))throw new Error('Não consegui identificar o placar final no vídeo.');
 const cal=resolveCalendarResultRow(s,null),tactic=cal?.tacticSnapshot||s.tactic;if(!tactic)throw new Error('Primeiro gere a tática desse jogo. O resultado só pode ser registrado depois da tática.');
 const entry={createdAt:nowIso(),scheduleIndex:cal?cal._i:null,opponent:r.opponent||cal?.opponent||s.opponent.teamName,gf,ga,score:r.score||`${gf}-${ga}`,note:'Resultado extraído por vídeo',tactic:structuredClone(tactic),stats:r.stats||{},events:r.events||[],context:{myOverall:s.myTeam.overall,oppOverall:s.opponent.overall,oppFormation:r.oppFormation||s.opponent.formation,myFormation:r.myFormation||tactic.formation,oppStyle:s.opponent.style,oppMarking:s.opponent.marking,oppOffside:s.opponent.offside,opponentHuman:s.opponent.human,venue:cal?.venue||s.match.venue,referee:s.match.refereeColor||s.match.refereeName}};
 s.results=s.results||[];s.results.push(entry);
 if(cal&&s.schedule?.[cal._i]){const row=s.schedule[cal._i];row.played=true;row.result=entry.score;row.resultEntryAt=entry.createdAt;row.tacticSnapshot=row.tacticSnapshot||structuredClone(tactic);if(row.competitionType==='cup'&&gf<ga)pruneConditionalCupMatches(s)}
 s.tactic=null;s.tacticNeedsRefresh=true;s.updatedAt=nowIso();ensureNextMatchFromScheduleV54(s);saveState();
}

async function handleFiles(files){
 runtimeCheckV56();
 if(!files.length)return;
 if(!localStorage.getItem(API_KEY_STORAGE)){apiModal('Antes de analisar, salve sua chave Gemini.');return}
 if(activeAnalysisJobV54?.status==='busy'){toast(`Já existe uma leitura em andamento no Slot ${activeAnalysisJobV54.slot}`);return}
 const jobMode=analysisMode,jobSlot=selectedSlot,labels={tactic:'Tática',market:'Elenco',calendar:'Calendário',result:'Resultado'};
 activeAnalysisJobV54={slot:jobSlot,mode:jobMode,modeLabel:labels[jobMode]||jobMode,status:'busy',progress:1,text:'Iniciando…',startedAt:nowIso()};
 analysisTargetOverrideV54=jobSlot;renderGlobalJobV54();await acquireOcrWakeLock();
 // limpa somente a área do trabalho NOVO; trocar de aba não limpa.
 if(els.mediaPreview)els.mediaPreview.innerHTML='';if(els.coveragePanel){els.coveragePanel.innerHTML='';els.coveragePanel.classList.add('hidden')}if(els.analysisResult)els.analysisResult.innerHTML='';
 if(els.analysisProgress)els.analysisProgress.classList.remove('hidden');
 try{
  const video=files.find(f=>f.type.startsWith('video/')),images=files.filter(f=>f.type.startsWith('image/'));let frames=[],result;
  if(jobMode==='calendar'){
   if(video)frames=await extractUniformFramesV54(video,6);else{for(const f of images.slice(0,6))frames.push(await imageFileToFrame(f))}
   if(!frames.length)throw new Error('Não encontrei imagens no vídeo do calendário.');
   if(jobSlot===selectedSlot&&analysisMode===jobMode)renderFramePreview(frames);
   setProgress(35,'Lendo calendário completo…');result=await analyzeCalendarFramesV54(frames,jobSlot);applyCalendarResultV54(result,jobSlot);
   if(jobSlot===selectedSlot&&analysisMode===jobMode)renderCalendarResultV54(result,jobSlot);
  }else{
   if(video){setProgress(6,'Selecionando quadros úteis…');frames=await extractVideoFramesFast(video,frameLimitForMode(jobMode))}
   else{for(const f of images.slice(0,frameLimitForMode(jobMode)))frames.push(await imageFileToFrame(f))}
   if(!frames.length)throw new Error('Não encontrei quadros utilizáveis no vídeo.');
   if(jobSlot===selectedSlot&&analysisMode===jobMode)renderFramePreview(frames.slice(0,8));
   setProgress(18,`OCR local em ${frames.length} quadros…`);const ocr=await runLocalOcr(frames);
   if(jobMode==='tactic'){
    const selected=await selectRequiredTacticFramesRobustV56(frames,ocr,jobSlot);
    if(jobSlot===selectedSlot&&analysisMode===jobMode)renderRequiredTacticPreview(selected);
    const requiredFrames=assertAllRequiredTacticScreens(selected);setProgress(60,'Gerando tática…');
    result=await analyzeOcrPackage(ocr,requiredFrames);applyVisionResult(result);applyRecommendedTactics(result);
    if(jobSlot===selectedSlot&&analysisMode===jobMode)renderAnalysisResult(result);
   }else if(jobMode==='result'){
    const evidence=selectVisualEvidence(frames,evidenceLimitForMode(jobMode));setProgress(58,'Lendo resultado e cartões…');
    result=await analyzeResultOcr(ocr,evidence);await applyResultVideoV54(result,jobSlot);
    if(jobSlot===selectedSlot&&analysisMode===jobMode)renderResultVideo(result);
   }else{
    const evidence=selectVisualEvidence(frames,evidenceLimitForMode(jobMode));setProgress(58,'Lendo elenco e posições…');
    result=await analyzeOcrPackage(ocr,evidence);applyVisionResult(result);const ss=state.slots[jobSlot-1];ss.roster=(ss.roster||[]).map(p=>({...p,sector:normalizeRosterSectorV55(p),training:p.training===true}));finalizeRosterSnapshotV57(ss);ss.lastRosterSnapshotAt=nowIso();ss.market=[];
    if(jobSlot===selectedSlot&&analysisMode===jobMode)renderAnalysisResult(result);
   }
  }
  const ss=state.slots[jobSlot-1];ss.lastAnalysisByMode=ss.lastAnalysisByMode||{};ss.lastAnalysisByMode[jobMode]=nowIso();ss.lastAnalysisError=ss.lastAnalysisError||{};delete ss.lastAnalysisError[jobMode];
  state.lastAnalysisAt=nowIso();saveState();setProgress(100,'Concluído');
  activeAnalysisJobV54.status='done';activeAnalysisJobV54.text='Concluído';renderGlobalJobV54();cacheAnalysisUiV54(jobSlot,jobMode);
  setTimeout(()=>{if(activeAnalysisJobV54?.status==='done'){activeAnalysisJobV54=null;renderGlobalJobV54()}},5000);
 }catch(e){
  console.error(e);const ss=state.slots[jobSlot-1];ss.lastAnalysisError=ss.lastAnalysisError||{};ss.lastAnalysisError[jobMode]=String(e.message||e);saveState();
  activeAnalysisJobV54.status='error';activeAnalysisJobV54.text=String(e.message||e);activeAnalysisJobV54.progress=100;renderGlobalJobV54();
  if(jobSlot===selectedSlot&&analysisMode===jobMode)els.analysisResult.innerHTML=`<div class="result-card"><h3 class="danger-text">Falha na análise</h3><p>${esc(e.message||e)}</p><p class="muted small">O erro ficou salvo neste slot. Você pode trocar de aba e voltar sem perdê-lo.</p></div>`;
  cacheAnalysisUiV54(jobSlot,jobMode);
 }finally{
  analysisTargetOverrideV54=null;await releaseOcrWakeLock();
  if(jobSlot===selectedSlot&&analysisMode===jobMode)setTimeout(()=>els.analysisProgress?.classList.add('hidden'),1200);
 }
}


// ===== v5.5: seis telas únicas de tática + elenco por seção + V/E/D =====
function requiredTacticTypes(){
 return [
  {key:'match_overview',label:'1. Tela da partida'},
  {key:'my_squad',label:'2. Meu elenco / força por setor'},
  {key:'opponent_squad',label:'3. Elenco do adversário / força por setor'},
  {key:'analyst_report',label:'4. Analista — relatório'},
  {key:'analyst_plan',label:'5. Analista — plano, marcação e impedimento'},
  {key:'analyst_formation',label:'6. Analista — formação'}
 ];
}
function buildFrameClassification(text,frame,slot){
 const t=normText(text),myName=normText(slot?.teamName),oppName=normText(slot?.opponent?.teamName),nick=normText(settings.userNick||''),l=frame?.layout||{};
 const score={match_overview:0,my_squad:0,opponent_squad:0,analyst_report:0,analyst_plan:0,analyst_formation:0};
 if(t.includes('vs'))score.match_overview+=6;if(t.includes('arbitro'))score.match_overview+=8;if(t.includes('jornada'))score.match_overview+=4;if((l.dark||0)>.38)score.match_overview+=2;
 const squadBase=(l.bottomWhite||0)>.30?5:0;if(squadBase){score.my_squad+=squadBase;score.opponent_squad+=squadBase}
 if(t.includes('posicao')||t.includes('objetivo')||t.includes('jogador')||t.includes('idade')||t.includes('valor')){score.my_squad+=2;score.opponent_squad+=2}
 if(nick&&t.includes(nick)){score.my_squad+=14;score.opponent_squad-=10}if(myName&&t.includes(myName)){score.my_squad+=9;score.opponent_squad-=6}if(oppName&&t.includes(oppName)){score.opponent_squad+=12;score.my_squad-=5}
 const analystLayout=(l.leftWhite||0)>.30;if(analystLayout){score.analyst_report+=4;score.analyst_plan+=3;score.analyst_formation+=2}
 if(t.includes('pelo que pude ver')||t.includes('tenho a certeza')||t.includes('nivel do estadio')||t.includes('estagio'))score.analyst_report+=12;
 const planWords=['remate a vista','jogar pelas alas','jogo de passes','contra-ataque','contra ataque','bola longa','marcacao','fora-de-jogo','fora de jogo','homem-a-homem','homem a homem','a zona'];
 for(const w of planWords)if(t.includes(w))score.analyst_plan+=4;
 if((l.rightBlue||0)>.10)score.analyst_plan+=5;
 if(t.includes('formacao:')||t.includes('formação:')||t.includes('suplentes')||t.includes('tatica')||t.includes('tática'))score.analyst_formation+=10;
 if((l.rightGreen||0)>.16)score.analyst_formation+=6;
 return score;
}
function selectRequiredTacticFrames(frames,ocr){
 const slot=state.slots[selectedSlot-1]||{};
 const enriched=(ocr.frames||[]).map(o=>{const frame=frames[(o.frame||1)-1];return {...o,frame,scores:buildFrameClassification(o.text,frame,slot)}}).filter(x=>x.frame);
 const result=[],used=[];
 for(const need of requiredTacticTypes()){
  const min=need.key==='analyst_plan'||need.key==='analyst_formation'?6:5;
  const candidates=[...enriched].filter(x=>!used.includes(x.frame)).sort((a,b)=>(b.scores[need.key]||0)-(a.scores[need.key]||0));
  const best=candidates[0];
  if(best&&(best.scores[need.key]||0)>=min){used.push(best.frame);result.push({type:need.key,label:need.label,frame:best.frame,text:best.text,score:best.scores[need.key]})}
  else result.push({type:need.key,label:need.label,frame:null,text:null,score:0});
 }
 ocr.required=result.reduce((a,x)=>{a[x.type]=x.text||null;return a},{});ocr.missingRequired=result.filter(x=>!x.frame).map(x=>x.label);return result;
}
function assertAllRequiredTacticScreens(items){
 const missing=items.filter(x=>!x.frame).map(x=>x.label);if(!missing.length)return items.map(x=>x.frame);
 const err=new Error(`Faltaram ${missing.length} das 6 telas obrigatórias: ${missing.join(', ')}. Sem essas telas o app não gera tática.`);err.requiredMissing=missing;throw err;
}

// Mais evidência visual no elenco, mas sem aumentar OCR local acima de 7 quadros.
function frameLimitForMode(mode){return mode==='tactic'?12:mode==='calendar'?6:mode==='result'?6:7}
function evidenceLimitForMode(mode){return mode==='tactic'?6:mode==='calendar'?4:mode==='result'?5:mode==='market'?6:3}

const analyzeOcrPackageBaseV55=analyzeOcrPackage;
analyzeOcrPackage=async function(ocr,evidence){
 if(analysisMode!=='market')return analyzeOcrPackageBaseV55(ocr,evidence);
 const target=analysisTargetOverrideV54||selectedSlot;
 const parts=[{text:`Você está lendo APENAS O MEU ELENCO no OSM 26. O vídeo percorre uma tabela dividida por cabeçalhos de seção. Use OCR + imagens juntas.

REGRAS DE POSIÇÃO — PRIORIDADE MÁXIMA:
1. Identifique o cabeçalho da seção acima das linhas e mantenha esse contexto até o próximo cabeçalho:
   - Avançados => sector=ATA; Pos válidas PL, ED, EE.
   - Médios => sector=MEI; Pos válidas MDC, MC, MCO, MD, ME.
   - Defesas => sector=DEF; Pos válidas DD, DC, DE.
   - Guarda-redes / Guarda redes => sector=GOL; Pos=GR.
2. Leia a coluna Pos para o subtipo exato. NÃO deduza setor por Ata/Def/Med.
3. Rating principal: ATA para avançados; MED para médios; DEF para defesas; GR para guarda-redes.

TREINAMENTO — REGRA VISUAL RÍGIDA:
- training=true SOMENTE quando a CAMISA/ÍCONE DO JOGADOR no extremo ESQUERDO da própria linha estiver LARANJA. Podem existir de 0 a 5 jogadores treinando; NÃO assuma que são 4.
- O pequeno cartão/retângulo amarelo do lado DIREITO da linha NÃO é treino.
- Barras verdes/laranjas de condição/moral NÃO são treino.
- Não marque Conor nem qualquer outro jogador como treinando sem camisa laranja à esquerda.

OUTRAS REGRAS:
- Consolide jogadores repetidos ao rolar a tela.
- Extraia nome, section/sector, position, rating, age, value e training. NÃO repita o mesmo jogador quando ele aparecer em quadros diferentes. Se a tela mostrar a quantidade total de jogadores, myTeam.playerCount deve receber exatamente esse total.
- squadValue = soma dos valores visíveis consolidados quando todos forem legíveis; playerCount = quantidade consolidada.
- Não invente jogadores nem mercado.

Retorne APENAS JSON:
{"captures":[{"slotNumber":${target},"confidence":0.0,"screensSeen":["squad","training"],"teamName":null,"myTeam":{"overall":null,"goalkeeper":null,"defence":null,"midfield":null,"attack":null,"squadValue":null,"playerCount":null},"opponent":{},"match":{},"roster":[{"name":"","sector":"ATA|MEI|DEF|GOL","position":null,"rating":null,"value":null,"age":null,"training":false,"forSale":false}],"market":[],"missing":[]}]}\n\nOCR COMPLETO:\n${ocr.joined}`}];
 for(const f of evidence)parts.push({inlineData:{mimeType:f.mimeType,data:f.base64}});
 return geminiJson(parts,{temperature:.01,maxOutputTokens:10000});
}

function normalizeRosterSectorV55(p){
 const pos=String(p.position||'').toUpperCase().trim(),sec=String(p.sector||'').toUpperCase();
 if(['PL','ED','EE'].includes(pos)||sec==='ATA')return 'ATA';
 if(['MDC','MC','MCO','MD','ME'].includes(pos)||sec==='MEI')return 'MEI';
 if(['DD','DC','DE'].includes(pos)||sec==='DEF')return 'DEF';
 if(pos==='GR'||sec==='GOL')return 'GOL';return 'NI';
}
function rosterAnalysisHtmlV55(s){
 const r=(s.roster||[]).map(p=>({...p,sector:normalizeRosterSectorV55(p)}));
 const groups=[['ATA','Avançados'],['MEI','Médios'],['DEF','Defesas'],['GOL','Guarda-redes']];
 return `<div class="result-card"><h3>Elenco · Slot ${s.slotNumber}</h3><div class="kpis"><div class="kpi"><span>Jogadores</span><b>${r.length}</b></div><div class="kpi"><span>Valor elenco</span><b>${formatMoney(s.myTeam?.squadValue)}</b></div><div class="kpi"><span>Em treino</span><b>${r.filter(x=>x.training).length}</b></div></div>${groups.map(([k,label])=>{const xs=r.filter(x=>x.sector===k);return `<div class="roster-group"><h4>${label} (${xs.length})</h4>${xs.length?`<div class="roster-list">${xs.map(x=>`<div class="roster-row"><b>${esc(x.name)}</b><span>${esc(x.position||'NI')} · ${esc(x.rating)} · ${esc(formatMoney(x.value))}</span>${x.training?'<em>🏋 Camisa laranja · treinando</em>':''}</div>`).join('')}</div>`:'<p class="muted small">Nenhum identificado</p>'}</div>`}).join('')}</div>`;
}
const renderAnalysisResultBaseV55=renderAnalysisResult;
renderAnalysisResult=function(result){
 if(analysisMode==='market'){
  const s=state.slots[selectedSlot-1];if(els.coveragePanel)els.coveragePanel.classList.add('hidden');els.analysisResult.innerHTML=rosterAnalysisHtmlV55(s);return;
 }
 return renderAnalysisResultBaseV55(result);
}

function calendarOutcomeV55(x){
 if(['V','E','D'].includes(String(x.outcome||'').toUpperCase()))return String(x.outcome).toUpperCase();
 const m=String(x.result||'').match(/(\d+)\s*[-x×]\s*(\d+)/i);if(!m)return null;const a=Number(m[1]),b=Number(m[2]);return a>b?'V':a<b?'D':'E';
}
function calendarStatusV54(x,s,i){
 const out=calendarOutcomeV55(x);
 if(x.result)return `<span class="calendar-result ${out==='V'?'win':out==='D'?'loss':'draw'}"><b>${esc(out||'')}</b> · ${esc(x.result)}</span>`;
 if(x.played)return `<span class="calendar-result ${out==='V'?'win':out==='D'?'loss':'draw'}"><b>${esc(out||'J')}</b></span>`;
 if(x.skipped)return `<span class="muted">Ignorado</span>`;
 if(!s.calendarAnchorAt||!x.dateTime)return `<span class="muted">Aguardando data/hora</span>`;
 if(new Date(x.dateTime).getTime()<=Date.now())return x.tacticSnapshot?`<button class="btn tiny danger" onclick="resultModal(${s.slotNumber},${i})">Registrar resultado</button>`:`<span class="warn-text">Horário passou · sem tática registrada</span>`;
 return `<span class="future-label">Agendado</span>`;
}


// ===== v5.6: validação global + seleção visual IA das 6 telas =====
function runtimeCheckV56(){
 const required=['fmtMoney','formatMoney','geminiJson','runLocalOcr','extractVideoFramesFast','analyzeOcrPackage','applyVisionResult','saveState'];
 const missing=required.filter(n=>typeof globalThis[n]!=='function');
 if(missing.length)throw new Error(`Falha interna do app: ${missing.join(', ')}. Atualize a página.`);
 return true;
}
function showGlobalErrorV56(message){
 try{
  const b=document.getElementById('globalJobBanner');
  if(b){b.className='global-job error';b.innerHTML=`<div><b>Erro interno</b><span>${esc(message)}</span></div><strong>!</strong>`;}
 }catch{}
}
window.addEventListener('error',e=>showGlobalErrorV56(e.message||'Erro JavaScript'));
window.addEventListener('unhandledrejection',e=>showGlobalErrorV56(e.reason?.message||String(e.reason||'Erro assíncrono')));

async function classifyTacticFramesV56(frames,ocr,slotNumber){
 const s=state.slots[slotNumber-1]||{};
 const parts=[{text:`Você é um classificador VISUAL de telas do OSM 26. Receberá quadros numerados do mesmo vídeo e OCR de apoio. Escolha EXATAMENTE UM quadro diferente para cada categoria obrigatória abaixo. Não use o mesmo quadro em duas categorias.

CATEGORIAS:
match_overview = tela principal da partida, com dois times/escudos, força, VS e árbitro.
my_squad = tela do MEU elenco, tabela branca e força por setor. Meu time é ${s.teamName||'NI'} e meu nick é ${settings.userNick||'leandrozzy'}.
opponent_squad = tela do elenco do ADVERSÁRIO, tabela branca e força por setor. Adversário atual: ${s.opponent?.teamName||'NI'}.
analyst_report = Data Analyst com folha/papel à esquerda contendo texto do relatório, estágio/nível do estádio etc.
analyst_plan = Data Analyst com desenho tático/setas vermelhas OU texto do plano de jogo, mais marcação e fora-de-jogo.
analyst_formation = Data Analyst mostrando claramente a FORMAÇÃO no campo verde, normalmente com jogadores/nomes/suplentes.

IMPORTANTE:
- Olhe o layout e os elementos gráficos; NÃO dependa só do OCR.
- analyst_plan e analyst_formation são telas diferentes.
- match_overview não é tela de elenco.
- Se uma categoria realmente não existir, use null. Se estiver presente mesmo com texto ruim, escolha o quadro.
- Retorne apenas JSON com índices 1-based: {"match_overview":1,"my_squad":2,"opponent_squad":3,"analyst_report":4,"analyst_plan":5,"analyst_formation":6,"confidence":0.0}.

OCR de apoio por quadro:\n${ocr.joined}`}];
 frames.forEach((f,i)=>parts.push({text:`QUADRO ${i+1}`},{inlineData:{mimeType:f.mimeType,data:f.base64}}));
 return geminiJson(parts,{temperature:.01,maxOutputTokens:1200});
}
function tacticSelectionFromMapV56(map,frames,ocr){
 const labels={match_overview:'1. Tela da partida',my_squad:'2. Meu elenco / força por setor',opponent_squad:'3. Elenco do adversário / força por setor',analyst_report:'4. Analista — relatório',analyst_plan:'5. Analista — plano, marcação e impedimento',analyst_formation:'6. Analista — formação'};
 const used=new Set(),items=[];
 for(const key of Object.keys(labels)){
  const idx=Number(map?.[key]);
  if(Number.isInteger(idx)&&idx>=1&&idx<=frames.length&&!used.has(idx)){
   used.add(idx);const o=(ocr.frames||[]).find(x=>Number(x.frame)===idx);
   items.push({type:key,label:labels[key],frame:frames[idx-1],text:o?.text||'',score:100});
  }else items.push({type:key,label:labels[key],frame:null,text:null,score:0});
 }
 ocr.required=items.reduce((a,x)=>{a[x.type]=x.text||null;return a},{});
 ocr.missingRequired=items.filter(x=>!x.frame).map(x=>x.label);
 return items;
}
async function selectRequiredTacticFramesRobustV56(frames,ocr,slotNumber){
 try{
  setProgress(47,'Identificando visualmente as 6 telas…');
  const map=await classifyTacticFramesV56(frames,ocr,slotNumber);
  const ai=tacticSelectionFromMapV56(map,frames,ocr);
  if(ai.filter(x=>x.frame).length>=5)return ai;
 }catch(e){console.warn('Classificação visual falhou; usando classificador local',e)}
 return selectRequiredTacticFrames(frames,ocr);
}


// ===== v5.7: elenco deduplicado, treino 0-5, plano persistente e histórico completo =====
function rosterNameKeyV57(name){return normalize(String(name||'').replace(/[^A-Za-zÀ-ÿ0-9 ]/g,' ').replace(/\s+/g,' ').trim())}
function editDistanceV57(a,b){a=rosterNameKeyV57(a);b=rosterNameKeyV57(b);const m=a.length,n=b.length;if(!m)return n;if(!n)return m;const d=Array.from({length:m+1},()=>Array(n+1).fill(0));for(let i=0;i<=m;i++)d[i][0]=i;for(let j=0;j<=n;j++)d[0][j]=j;for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[m][n]}
function sameRosterPlayerV57(a,b){
 const ak=rosterNameKeyV57(a?.name),bk=rosterNameKeyV57(b?.name);if(!ak||!bk)return false;if(ak===bk)return true;
 const max=Math.max(ak.length,bk.length),dist=editDistanceV57(ak,bk),similar=max>=6&&dist<=1;
 const samePos=a?.position&&b?.position&&String(a.position).toUpperCase()===String(b.position).toUpperCase();
 const ar=Number(a?.rating),br=Number(b?.rating),closeRating=Number.isFinite(ar)&&Number.isFinite(br)&&Math.abs(ar-br)<=1;
 return similar&&(samePos||closeRating);
}
function playerCompletenessV57(p){let n=0;for(const k of ['name','sector','position','rating','age','value'])if(p?.[k]!==null&&p?.[k]!==undefined&&p?.[k]!=='')n++;if(p?.training===true)n+=.5;return n}
function mergeRosterPlayerV57(a,b){const best=playerCompletenessV57(b)>=playerCompletenessV57(a)?{...a,...b}:{...b,...a};
 for(const k of ['name','sector','position','rating','age','value'])if((best[k]===null||best[k]===undefined||best[k]==='')&&(a?.[k]??b?.[k])!==undefined)best[k]=a?.[k]??b?.[k];
 best.training=!!(a?.training||b?.training);best.forSale=!!(a?.forSale||b?.forSale);return best}
function dedupeRosterV57(list,expectedCount=null){
 const out=[];for(const raw of list||[]){if(!raw?.name)continue;const p={...raw,sector:normalizeRosterSectorV55(raw)};const i=out.findIndex(x=>sameRosterPlayerV57(x,p));if(i>=0)out[i]=mergeRosterPlayerV57(out[i],p);else out.push(p)}
 // O OSM permite no máximo 5 jogadores simultaneamente em treino. Não assuma 4.
 const training=out.filter(x=>x.training===true);if(training.length>5){training.slice(5).forEach(x=>x.training=false)}
 const count=Number(expectedCount);if(Number.isFinite(count)&&count>0&&out.length>count){
   out.sort((a,b)=>playerCompletenessV57(b)-playerCompletenessV57(a));out.length=count;
 }
 return out;
}
function mergePlayers(old,nw){return dedupeRosterV57([...(old||[]),...(nw||[])],null)}
function finalizeRosterSnapshotV57(s){
 const expected=Number(s.myTeam?.playerCount);s.roster=dedupeRosterV57(s.roster,Number.isFinite(expected)&&expected>0?expected:null);
 s.myTeam.playerCount=s.roster.length;
 recalculateSquadValue(s);
 return s.roster;
}
function trainingSuggestions(s){const roster=(s.roster||[]).filter(p=>p.name);return [...roster].sort((a,b)=>{const aa=Number(a.age)||99,ba=Number(b.age)||99,ar=Number(a.rating)||0,br=Number(b.rating)||0;return (aa-ba)*2+(ar-br)}).slice(0,5)}
function persistentStrategyHtmlV57(s){const p=s.marketStrategyAI;if(!p)return `<div class="card"><div class="market-head"><div><h3>Plano IA do elenco</h3><p class="muted small">Ainda não gerado.</p></div><button class="btn" onclick="aiStrategyReview(${s.slotNumber})">Gerar plano</button></div></div>`;
 return `<div class="card market-ai-plan"><div class="market-head"><div><span class="eyebrow">PLANO IA SALVO</span><h3>Estratégia atual do Slot ${s.slotNumber}</h3><p class="tiny muted">Gerado em ${fmtDateTime(p.generatedAt)}</p></div><button class="btn secondary" onclick="aiStrategyReview(${s.slotNumber})">Gerar novo plano</button></div><p>${esc(p.summary)}</p><div class="plan-list">${(p.actions||[]).map((a,i)=>`<div class="plan-step"><span class="n">${esc(a.priority||i+1)}</span><div><b>${esc(a.player?`${a.player}: ${a.action}`:a.action)}</b><div class="small muted">${esc(a.why)}</div></div></div>`).join('')}</div>${(p.training||[]).length?`<h4>Treinamento</h4>${p.training.map(x=>`<div class="plan-step"><span class="n">🏋</span><div><b>${esc(x.player)}</b><div class="small muted">${esc(x.why)}</div></div></div>`).join('')}`:''}${(p.buyProfiles||[]).length?`<h4>Perfis para comprar</h4>${p.buyProfiles.map(x=>`<div class="plan-step"><span class="n">+</span><div><b>${esc(x.position)} · OVR ${esc(x.minimumRating)}+</b><div class="small muted">${esc(x.age)} · ${esc(x.budgetRule)} · ${esc(x.why)}</div></div></div>`).join('')}`:''}</div>`}
function renderMarket(){
 const s=state.slots[selectedSlot-1];if(!s||s.status!=='active'){els.marketContent.innerHTML=`<div class="card"><p class="muted">Slot ${selectedSlot} livre.</p></div>`;return}finalizeRosterSnapshotV57(s);const c=rosterCounts(s),train=trainingSuggestions(s),event=(state.eventIntel||localEventIntel()).events?.find(e=>e.status==='active');
 els.marketContent.innerHTML=`${eventIntelHtml(state.eventIntel||localEventIntel())}${persistentStrategyHtmlV57(s)}<div class="card"><div class="market-head"><div><div class="slot-num">SLOT ${selectedSlot}</div><h3>Elenco · ${esc(s.teamName)}</h3></div><span class="status-pill">${esc(s.myTeam.playerCount||0)} jogadores</span></div><div class="kpis"><div class="kpi"><span>Valor elenco</span><b>${fmtMoney(s.myTeam.squadValue)}</b></div><div class="kpi"><span>ATA</span><b>${c.ATA}/4</b></div><div class="kpi"><span>MEI</span><b>${c.MEI}/6</b></div><div class="kpi"><span>DEF</span><b>${c.DEF}/6</b></div><div class="kpi"><span>GOL</span><b>${c.GOL}/2</b></div><div class="kpi"><span>Em treino</span><b>${(s.roster||[]).filter(x=>x.training).length}/5</b></div></div><div class="actions"><button class="btn" onclick="openMarketSnapshot(${selectedSlot})">Atualizar vídeo do elenco</button><button class="btn secondary" onclick="rosterTransactionModal(${selectedSlot},'buy')">+ Compra</button><button class="btn secondary" onclick="rosterTransactionModal(${selectedSlot},'sell')">− Venda</button></div></div><div class="card"><h3>Jogadores do elenco</h3>${playerTableHtml(s)}</div><div class="card"><h3>Treino recomendado agora</h3>${train.length?train.map((p,i)=>`<div class="plan-step"><span class="n">${i+1}</span><div><b>${esc(p.name)}</b><div class="small muted">${esc(p.position)} · OVR ${esc(p.rating)} · ${esc(p.age)} anos${p.training?' · já treinando':''}</div></div></div>`).join(''):'<p class="muted">Atualize o elenco para receber prioridades.</p>'}${event?`<div class="event-now"><b>⚡ ${esc(event.name)}</b><div class="small">${esc(event.strategy)}</div></div>`:''}</div>`;
}
async function aiStrategyReview(n,silent=false){const s=state.slots[n-1];if(!localStorage.getItem(API_KEY_STORAGE)){if(!silent)apiModal();return}finalizeRosterSnapshotV57(s);const roster=(s.roster||[]).map(p=>({name:p.name,sector:p.sector,position:p.position,rating:p.rating,value:p.value,age:p.age,training:!!p.training}));if(!roster.length){toast('Primeiro envie o vídeo do seu elenco');return}if(!silent)toast('Atualizando plano do elenco…');const prompt=`Você é especialista em evolução rápida de elenco no OSM. Use APENAS os jogadores presentes em roster. Pode recomendar vender ou treinar jogador POR NOME somente se esse nome existir exatamente em roster. Há de 0 a 5 jogadores treinando simultaneamente; training=true significa que a CAMISA LARANJA à esquerda foi detectada. Para compras, recomende PERFIS, nunca invente nomes disponíveis no mercado. Objetivo: aumentar força do XI e valor do elenco rápido, mantendo 4 ATA/6 MEI/6 DEF/2 GOL e até 4 vendas simultâneas. Retorne JSON {"summary":"","actions":[{"priority":1,"type":"sell|train|buy_profile|keep","player":null,"action":"","why":""}],"training":[{"player":"","why":""}],"buyProfiles":[{"position":"","minimumRating":null,"age":"","budgetRule":"","why":""}]}. Dados: ${JSON.stringify({overall:s.myTeam.overall,squadValue:s.myTeam.squadValue,playerCount:s.myTeam.playerCount,roster,transactions:(s.rosterTransactions||[]).slice(-12),event:state.eventIntel})}`;try{const p=await geminiJson([{text:prompt}],{temperature:.06,maxOutputTokens:4200});s.marketStrategyAI={...p,generatedAt:nowIso()};s.marketStrategyHistory=s.marketStrategyHistory||[];s.marketStrategyHistory.push(structuredClone(s.marketStrategyAI));if(s.marketStrategyHistory.length>20)s.marketStrategyHistory=s.marketStrategyHistory.slice(-20);saveState();renderMarket();if(!silent)toast('Novo plano salvo na aba Mercado')}catch(e){if(!silent)toast(e.message)}}
function historySectionV57(title,body){return `<div class="card history-section"><h3>${esc(title)}</h3>${body}</div>`}
function renderHistory(){
 const s=state.slots[selectedSlot-1];if(!s){els.historyContent.innerHTML='';return}const games=s.results||[],tx=s.rosterTransactions||[],pos=s.positionHistory||[],archives=state.archives.filter(a=>Number(a.slotNumber)===selectedSlot),plans=s.marketStrategyHistory||[];const w=games.filter(r=>r.gf>r.ga).length,d=games.filter(r=>r.gf===r.ga).length,l=games.filter(r=>r.gf<r.ga).length;
 const gamesHtml=games.length?games.slice().reverse().map(r=>`<div class="history-line"><div><b>${esc(s.teamName)} × ${esc(r.opponent)}</b><span>${fmtDateTime(r.createdAt)} · ${esc(r.context?.venue)} · ${esc(r.tactic?.formation)} ${esc(r.tactic?.gamePlan)}</span></div><strong>${esc(r.score)}</strong></div>`).join(''):'<p class="muted">Nenhum jogo registrado.</p>';
 const txHtml=tx.length?tx.slice().reverse().map(x=>`<div class="history-line"><div><b>${x.type==='buy'?'🟢 Compra':'🔴 Venda'} · ${esc(x.player?.name)}</b><span>${fmtDateTime(x.at)} · ${esc(x.player?.position)} · OVR ${esc(x.player?.rating)}</span></div><strong>${esc(x.price||'')}</strong></div>`).join(''):'<p class="muted">Nenhuma compra/venda registrada.</p>';
 const posHtml=pos.length?`<div class="position-chart">${pos.slice(-20).map(x=>{const p=Number(x.position)||20,h=Math.max(10,100-(p-1)*(85/19));return `<div class="pos-col"><div class="pos-bar" style="height:${h}%"><span>${p}º</span></div><small>R${esc(x.round??'')}</small></div>`}).join('')}</div>`:'<p class="muted">Sem evolução de posição registrada.</p>';
 const planHtml=plans.length?plans.slice(-5).reverse().map(p=>`<div class="history-line"><div><b>Plano IA</b><span>${fmtDateTime(p.generatedAt)} · ${esc(p.summary)}</span></div></div>`).join(''):'<p class="muted">Nenhum plano anterior.</p>';
 const archiveHtml=archives.length?archives.map(a=>`<div class="history-line"><div><b>${esc(a.competitionName)}</b><span>${esc(a.teamName)} · ${(a.results||[]).length} jogos · finalizada ${fmtDateTime(a.finishedAt)}</span></div></div>`).join(''):'<p class="muted">Nenhuma competição finalizada neste slot.</p>';
 els.historyContent.innerHTML=`<div class="card"><div class="slot-num">SLOT ${selectedSlot}</div><h3>Histórico completo</h3><div class="kpis"><div class="kpi"><span>Jogos</span><b>${games.length}</b></div><div class="kpi"><span>V/E/D</span><b>${w}/${d}/${l}</b></div><div class="kpi"><span>Transferências</span><b>${tx.length}</b></div><div class="kpi"><span>Planos IA</span><b>${plans.length}</b></div></div></div>${historySectionV57('Partidas e táticas usadas',gamesHtml)}${historySectionV57('Compras e vendas',txHtml)}${historySectionV57('Evolução da posição',posHtml)}${historySectionV57('Planos de mercado anteriores',planHtml)}${historySectionV57('Competições finalizadas',archiveHtml)}`;
}

Object.assign(window,{applyCalendarAnchorV54,showView,setSelectedSlot,prepareReanalysis,configureSlot,saveSlotConfigV5,openCalendarForSlot,finishCompetition,confirmFinish,slotDetailModal,generateTacticForSlot,tacticModal,manualTacticModal,saveManualTactic,strong433Modal,generateStrong433,resultModal,saveResultV52,runSetupStep,scheduleModal,saveSchedule,downloadIcs,openMarketSnapshot,aiStrategyReview,strategyModal,renderInfo,updateEventIntel,rosterTransactionModal,saveRosterTransaction,saveVideoResultPosition,saveApiKey,clearApiKey,closeModal});
document.addEventListener('DOMContentLoaded',init);
