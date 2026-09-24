'use strict';

const APP_VERSION='4.3.0-cloud-hybrid-ocr';
const STATE_KEY='osm_ai_coach_pro_state_v4';
const SETTINGS_KEY='osm_ai_coach_pro_settings_v4';
const API_KEY_STORAGE='osm_ai_coach_pro_gemini_key';
const FORMATIONS=['4-3-3 A','4-3-3 B','4-5-1','4-2-3-1','4-4-2 A','4-4-2 B','3-2-5','3-2-3-2','3-3-4 A','3-3-4 B','3-4-3 A','3-4-3 B','3-3-2-2','3-5-2','4-2-4 A','4-2-4 B','5-2-3 A','5-2-3 B','5-3-2','5-3-1-1','5-4-1 A','5-4-1 B','6-3-1 A','6-3-1 B'];
const GAME_PLANS=['Jogar pelas alas','Jogo de passes','Contra-ataque','Chutar de longe','Bola longa'];
const COVERAGE_LABELS={dashboard:'Tela inicial',analyst:'Data Analyst',analystDetails:'Detalhes do analista',squad:'Elenco',market:'Mercado',calendar:'Calendário/horário',training:'Treinamento',result:'Resultado/estatísticas'};
const els={};

function defaultSlot(n){return {slotNumber:n,status:'empty',teamName:null,competitionName:null,competitionType:null,round:null,totalRounds:null,createdAt:null,updatedAt:null,myTeam:{overall:null,goalkeeper:null,defence:null,midfield:null,attack:null,squadValue:null,playerCount:null,stadium:null,loginBonus:null,secretTraining:null,trainingCamp:null},opponent:{teamName:null,human:null,manager:null,overall:null,goalkeeper:null,defence:null,midfield:null,attack:null,squadValue:null,playerCount:null,stadium:null,loginBonus:null,secretTraining:null,trainingCamp:null,formation:null,style:null,marking:null,offside:null,tackling:null},match:{venue:null,refereeName:null,refereeColor:null,nextMatchAt:null,countdownText:null},roster:[],market:[],coverage:{},missing:[],tactic:null,marketPlan:null,results:[],notes:[]};}
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
function fmtDateTime(v){if(!v)return 'Horário NI';const d=new Date(v);return Number.isNaN(d.getTime())?'Horário NI':d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
function nowIso(){return new Date().toISOString()}
function toast(msg){els.toast.textContent=msg;els.toast.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>els.toast.classList.remove('show'),3200)}
function openModal(html){els.modalBody.innerHTML=html;els.modal.classList.add('open');els.modal.setAttribute('aria-hidden','false')}
function closeModal(){els.modal.classList.remove('open');els.modal.setAttribute('aria-hidden','true')}

let state=loadState();
let settings=loadSettings();
let notificationSeen=new Set();
let analysisMode='tactic';

function bindEls(){['apiButton','nextAction','slotsGrid','refreshCountdowns','chooseMedia','mediaInput','uploadZone','uploadTitle','uploadHelp','slotTarget','autoTactic','autoTacticRow','analysisGuide','analysisProgress','progressBar','progressText','mediaPreview','coveragePanel','analysisResult','marketContent','historyContent','updateEvents','modelSelect','notifyMinutes','userNick','notifyEnabled','requestNotification','saveSettings','exportData','importData','modal','modalBody','modalClose','toast'].forEach(id=>els[id]=document.getElementById(id));}

function init(){bindEls();bindNav();bindActions();bindAnalysisModes();hydrateSettings();renderAnalysisMode();renderAll();if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});setInterval(()=>{renderToday();checkNotifications()},30000);checkNotifications()}
function bindNav(){document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)))}
function bindAnalysisModes(){document.querySelectorAll('[data-analysis-mode]').forEach(b=>b.addEventListener('click',()=>{analysisMode=b.dataset.analysisMode;document.querySelectorAll('[data-analysis-mode]').forEach(x=>x.classList.toggle('active',x===b));clearAnalysisUi();renderAnalysisMode()}))}
function clearAnalysisUi(){if(els.analysisResult)els.analysisResult.innerHTML='';if(els.coveragePanel){els.coveragePanel.innerHTML='';els.coveragePanel.classList.add('hidden')}if(els.mediaPreview)els.mediaPreview.innerHTML='';if(els.mediaInput)els.mediaInput.value='';if(els.analysisProgress)els.analysisProgress.classList.add('hidden')}
function renderAnalysisMode(){if(!els.analysisGuide)return;const tactic=analysisMode==='tactic';els.uploadTitle.textContent=tactic?'Enviar vídeo da partida':'Enviar vídeo do mercado';els.uploadHelp.textContent=tactic?'Grave somente as telas necessárias para analisar a partida. O vídeo é enviado diretamente à IA com um único prompt.':'Grave elenco, treinamento e lista de transferências. Não precisa mostrar Data Analyst nem táticas.';els.autoTacticRow.classList.toggle('hidden',!tactic);els.analysisGuide.innerHTML=tactic?`<h3>Vídeo para gerar a tática</h3><p class="muted small">Mostre apenas estas telas, nesta ordem. Pare 1–2 segundos em cada uma.</p><div class="guide-grid"><div><b>1. Tela da partida</b><span>meu time, rival, força, local, árbitro, CT/treino secreto e bônus quando aparecer</span></div><div><b>2. Data Analyst</b><span>abra o relatório do adversário</span></div><div><b>3. Detalhes do Analyst</b><span>formação, estilo/plano, marcação e impedimento</span></div><div><b>4. Força por setor</b><span>GOL/DEF/MEI/ATA de ambos, se disponível</span></div><div><b>5. Horário</b><span>cronômetro ou horário da próxima partida</span></div></div><div class="actions" style="margin-top:12px"><button class="btn secondary" onclick="manualTacticModal(Number(document.getElementById('slotTarget').value)||1)">Digitar tática usada manualmente</button></div>`:`<h3>Vídeo para Mercado / Evolução</h3><p class="muted small">Este vídeo é separado do vídeo da tática.</p><div class="guide-grid"><div><b>1. Elenco completo</b><span>nome, posição, força/rating, valor e quantidade de jogadores</span></div><div><b>2. Treinamento</b><span>quem está treinando; camisa laranja = treino, não venda</span></div><div><b>3. Lista de transferências</b><span>jogadores disponíveis, posição, rating, idade e preço</span></div><div><b>4. Jogadores à venda</b><span>venda é indicada pelas setas de transferência</span></div></div>`}

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

function configureSlot(n){const s=state.slots[n-1];openModal(`<h2>${s.status==='active'?'Editar':'Criar'} competição · Slot ${n}</h2><div class="form-card"><label>Meu time<input id="cfgTeam" value="${esc(s.teamName||'')}"></label><label>Competição<input id="cfgComp" value="${esc(s.competitionName||'')}"></label><label>Tipo<select id="cfgType"><option${s.competitionType==='Liga normal'?' selected':''}>Liga normal</option><option${s.competitionType==='Batalha'?' selected':''}>Batalha</option><option${s.competitionType==='Copa'?' selected':''}>Copa</option><option${s.competitionType==='Torneio'?' selected':''}>Torneio</option></select></label><div class="data-grid"><label>Rodada<input id="cfgRound" type="number" min="1" value="${esc(s.round||1)}"></label><label>Total<input id="cfgTotal" type="number" min="1" value="${esc(s.totalRounds||34)}"></label></div><button class="btn" onclick="saveSlotConfig(${n})">Salvar alterações</button></div>`)}
function saveSlotConfig(n){const s=state.slots[n-1];s.status='active';s.teamName=document.getElementById('cfgTeam').value.trim()||s.teamName;s.competitionName=document.getElementById('cfgComp').value.trim()||s.competitionName;s.competitionType=document.getElementById('cfgType').value;s.round=Number(document.getElementById('cfgRound').value)||1;s.totalRounds=Number(document.getElementById('cfgTotal').value)||null;s.createdAt=s.createdAt||nowIso();s.updatedAt=nowIso();saveState();closeModal();toast('Competição salva')}
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
     const frames=await extractVideoFramesFast(video,analysisMode==='tactic'?8:10);
     renderFramePreview(frames.slice(0,6));
     setProgress(20,'Lendo texto localmente com OCR…');
     const ocr=await runLocalOcr(frames);
     setProgress(55,'Montando os campos para a IA…');
     const evidence=selectVisualEvidence(frames,analysisMode==='tactic'?2:1);
     result=await analyzeOcrPackage(ocr,evidence);
   }else if(images.length){
     setProgress(10,'Preparando imagens…');
     const frames=[];
     for(const f of images)frames.push(await imageFileToFrame(f));
     renderFramePreview(frames.slice(0,6));
     setProgress(28,'Lendo texto localmente com OCR…');
     const ocr=await runLocalOcr(frames.slice(0,8));
     result=await analyzeOcrPackage(ocr,selectVisualEvidence(frames,2));
   }else throw new Error('Selecione um vídeo ou imagens do OSM.');

   setProgress(78,'Atualizando o slot…');
   applyVisionResult(result);
   if(analysisMode==='tactic')applyRecommendedTactics(result);
   renderAnalysisResult(result);
   state.lastAnalysisAt=nowIso();
   saveState();
   setProgress(100,'Concluído');
   toast(analysisMode==='tactic'?'Partida analisada e tática gerada':'Mercado atualizado');
 }catch(e){
   console.error(e);
   els.analysisResult.innerHTML=`<div class="result-card"><h3 class="danger-text">Não foi possível concluir</h3><p>${esc(e.message||e)}</p><p class="muted small">O app usa OCR local primeiro. Se o OCR falhar, tente um vídeo mais curto e pare 1–2 segundos em cada tela.</p></div>`;
   setProgress(100,'Falha na análise');
 }finally{setTimeout(()=>els.analysisProgress.classList.add('hidden'),1500)}
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
 for(const f of evidence)parts.push({text:`Imagem de apoio ~${Math.round(f.time||0)}s. Use apenas para conferir elementos visuais que o OCR não captura bem.`},{inlineData:{mimeType:f.mimeType,data:f.base64}});
 return geminiJson(parts,{temperature:.03,maxOutputTokens:8500});
}

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
function captureVideoFrame(v,t,name){const maxW=1280,scale=Math.min(1,maxW/(v.videoWidth||maxW));const w=Math.max(320,Math.round((v.videoWidth||1280)*scale)),h=Math.max(180,Math.round((v.videoHeight||720)*scale));const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.drawImage(v,0,0,w,h);const dataUrl=c.toDataURL('image/jpeg',.74);const tc=document.createElement('canvas');tc.width=64;tc.height=36;tc.getContext('2d').drawImage(v,0,0,64,36);const data=tc.getContext('2d').getImageData(0,0,64,36).data;const thumb=new Uint8Array(64*36);for(let i=0,j=0;i<data.length;i+=4,j++)thumb[j]=Math.round((data[i]+data[i+1]+data[i+2])/3);return {dataUrl,base64:dataUrl.split(',')[1],mimeType:'image/jpeg',time:t,name,thumb,score:0}}
function canvasFrameFromImage(img,t,name){const maxW=1280,scale=Math.min(1,maxW/img.naturalWidth);const w=Math.round(img.naturalWidth*scale),h=Math.round(img.naturalHeight*scale);const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);const dataUrl=c.toDataURL('image/jpeg',.8);return {dataUrl,base64:dataUrl.split(',')[1],mimeType:'image/jpeg',time:t,name,score:100}}
function pixelDiff(a,b){if(!a||!b||a.length!==b.length)return 100;let s=0;for(let i=0;i<a.length;i++)s+=Math.abs(a[i]-b[i]);return s/a.length}
function dedupeFrames(frames,max){if(frames.length<=max)return frames.sort((a,b)=>(a.time||0)-(b.time||0));const keep=[];const byScore=[...frames].sort((a,b)=>(b.score||0)-(a.score||0));for(const f of byScore){if(keep.length>=max)break;if(!keep.some(k=>k.name===f.name&&Math.abs((k.time||0)-(f.time||0))<1.2))keep.push(f)}return keep.sort((a,b)=>a.name.localeCompare(b.name)||(a.time||0)-(b.time||0))}
function renderFramePreview(frames){els.mediaPreview.innerHTML=frames.slice(0,12).map(f=>`<img src="${f.dataUrl}" title="${esc(f.name)} ${Math.round(f.time||0)}s">`).join('')}


function hybridPrompt(ocr){
 const target=els.slotTarget.value;
 const slotHint=target==='auto'?'detectar pelo conteúdo':`usar Slot ${target}`;
 const baseKnown=target!=='auto'&&state.slots[Number(target)-1]?state.slots[Number(target)-1]:null;
 if(analysisMode==='tactic')return `Você é um especialista em OSM 26. O navegador já executou OCR LOCAL no vídeo. Portanto, não precisa reler o vídeo inteiro. Use o TEXTO OCR abaixo como fonte principal e as poucas imagens anexadas apenas para confirmar itens visuais.

DESTINO: ${slotHint}.
DADOS JÁ SALVOS NO SLOT (podem estar desatualizados; preserve apenas o que não for contradito pelo OCR): ${JSON.stringify(baseKnown?{
teamName:baseKnown.teamName,competitionName:baseKnown.competitionName,competitionType:baseKnown.competitionType,round:baseKnown.round,totalRounds:baseKnown.totalRounds
}:null)}

TEXTO OCR DO VÍDEO:
${ocr.joined}

TAREFA:
1. Estruture os dados da partida sem inventar nada.
2. Identifique meu time/rival, força geral, GOL/DEF/MEI/ATA quando visível, casa/fora, árbitro, humano/CPU, bônus, CT/treino secreto, estádio e horário.
3. Do Data Analyst rival, extraia formação, estilo/plano, marcação e impedimento.
4. Gere UMA tática final completa visando maximizar a chance de vitória.
5. Se um dado não está claro no OCR nem nas imagens, use null.
6. Não confunda a minha tática atual com a tática do rival.
7. sliders pressure, mentality e tempo: inteiros 0–100.
8. Considere também o histórico aprendido do slot, fornecido abaixo:
${JSON.stringify(baseKnown?buildLearningSummary(baseKnown):null)}

RETORNE APENAS JSON:
{"captures":[{"slotNumber":1,"confidence":0.0,"screensSeen":[],"teamName":null,"competitionName":null,"competitionType":null,"round":null,"totalRounds":null,"myTeam":{"overall":null,"goalkeeper":null,"defence":null,"midfield":null,"attack":null,"squadValue":null,"playerCount":null,"stadium":null,"loginBonus":null,"secretTraining":null,"trainingCamp":null},"opponent":{"teamName":null,"human":null,"manager":null,"overall":null,"goalkeeper":null,"defence":null,"midfield":null,"attack":null,"squadValue":null,"playerCount":null,"stadium":null,"loginBonus":null,"secretTraining":null,"trainingCamp":null,"formation":null,"style":null,"marking":null,"offside":null,"tackling":null},"match":{"venue":null,"refereeName":null,"refereeColor":null,"exactDateTimeText":null,"countdownText":null},"roster":[],"market":[],"result":{},"missing":[],"recommendedTactic":{"formation":"","gamePlan":"","pressure":0,"mentality":0,"tempo":0,"marking":"À zona","offside":"Não","tackling":"Normal","attackInstruction":"","midfieldInstruction":"","defenceInstruction":"","confidence":"média","reason":""}}]}`;

 return `Você é um especialista em mercado/evolução de elenco no OSM 26. O navegador já rodou OCR LOCAL no vídeo. Use o texto OCR como fonte principal e as poucas imagens apenas para confirmar ícones.

DESTINO: ${slotHint}
TEXTO OCR:
${ocr.joined}

REGRAS:
- Não gere tática de partida.
- Extraia elenco, posição, rating, valor, idade, treinamento e jogadores à venda.
- Camisa/ícone laranja = EM TREINAMENTO, não venda.
- Venda = setas/ícone de transferência.
- Extraia lista de transferências com nome, posição, rating, idade e preço.
- Se não estiver claro, use null.

RETORNE APENAS JSON:
{"captures":[{"slotNumber":1,"confidence":0.0,"screensSeen":["squad","training","market"],"teamName":null,"competitionName":null,"competitionType":null,"round":null,"totalRounds":null,"myTeam":{},"opponent":{},"match":{},"roster":[{"name":"","position":null,"rating":null,"value":null,"age":null,"training":false,"forSale":false}],"market":[{"name":"","position":null,"rating":null,"attack":null,"defence":null,"value":null,"price":null,"age":null,"club":null}],"result":{},"missing":[]}]}`;
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
function saveResult(n){const gf=Number(document.getElementById('resGF').value),ga=Number(document.getElementById('resGA').value);if(!Number.isFinite(gf)||!Number.isFinite(ga)){toast('Informe o placar');return}const s=state.slots[n-1];s.results=s.results||[];s.results.push({createdAt:nowIso(),opponent:s.opponent.teamName,gf,ga,score:`${gf}-${ga}`,note:document.getElementById('resNote').value.trim()||null,tactic:s.tactic?structuredClone(s.tactic):null,context:{myOverall:s.myTeam.overall,oppOverall:s.opponent.overall,oppFormation:s.opponent.formation,oppStyle:s.opponent.style,oppMarking:s.opponent.marking,oppOffside:s.opponent.offside,opponentHuman:s.opponent.human,venue:s.match.venue,referee:s.match.refereeColor||s.match.refereeName,trainingCamp:s.opponent.trainingCamp,secretTraining:s.opponent.secretTraining,strengthBucket:strengthBucket(s)}});s.tactic=null;if(Number.isFinite(Number(s.round)))s.round=Number(s.round)+1;s.updatedAt=nowIso();saveState();closeModal();toast('Resultado salvo. O histórico foi incorporado ao aprendizado do Slot '+n+'.')}

function scheduleModal(n){const s=state.slots[n-1];let local='';if(s.match.nextMatchAt){const d=new Date(s.match.nextMatchAt);const off=d.getTimezoneOffset()*60000;local=new Date(d.getTime()-off).toISOString().slice(0,16)}openModal(`<h2>Horário · Slot ${n}</h2><div class="form-card"><label>Próxima partida<input id="scheduleAt" type="datetime-local" value="${esc(local)}"></label><button class="btn" onclick="saveSchedule(${n})">Salvar horário</button>${s.match.nextMatchAt?`<button class="btn secondary" onclick="downloadIcs(${n})">Adicionar ao calendário (alerta ${settings.notifyMinutes} min antes)</button>`:''}</div>`)}
function saveSchedule(n){const v=document.getElementById('scheduleAt').value;if(!v)return;state.slots[n-1].match.nextMatchAt=new Date(v).toISOString();state.slots[n-1].updatedAt=nowIso();saveState();closeModal();toast('Horário salvo')}
function downloadIcs(n){const s=state.slots[n-1];if(!s.match.nextMatchAt){toast('Defina o horário primeiro');return}const start=new Date(s.match.nextMatchAt),end=new Date(start.getTime()+90*60000);const dt=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');const uid=`osm-slot${n}-${start.getTime()}@osm-ai-coach-pro`;const text=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//OSM AI Coach Pro//PT-BR','BEGIN:VEVENT',`UID:${uid}`,`DTSTAMP:${dt(new Date())}`,`DTSTART:${dt(start)}`,`DTEND:${dt(end)}`,`SUMMARY:OSM Slot ${n}: ${icsEscape(s.teamName||'Meu time')} x ${icsEscape(s.opponent.teamName||'Adversário')}`,`DESCRIPTION:${icsEscape(`OSM AI Coach Pro - ${s.competitionName||''}`)}`,'BEGIN:VALARM','ACTION:DISPLAY',`TRIGGER:-PT${settings.notifyMinutes}M`,`DESCRIPTION:Preparar tática OSM - Slot ${n}`,'END:VALARM','END:VEVENT','END:VCALENDAR'].join('\r\n');downloadBlob(text,`OSM-Slot-${n}.ics`,'text/calendar')}
function icsEscape(s){return String(s).replace(/([,;\\])/g,'\\$1').replace(/\n/g,'\\n')}

function buildLocalMarketPlan(s){const r=s.roster||[],m=s.market||[];const groups={attackers:[],midfielders:[],defenders:[],goalkeepers:[]};for(const p of r){const pos=String(p.position||'').toUpperCase();if(pos==='GK')groups.goalkeepers.push(p);else if(['CB','LB','RB','LWB','RWB','DEF'].includes(pos))groups.defenders.push(p);else if(['CM','CDM','CAM','LM','RM','MID'].includes(pos))groups.midfielders.push(p);else groups.attackers.push(p)}const targets={attackers:4,midfielders:6,defenders:6,goalkeepers:2};const sell=[];for(const [g,arr] of Object.entries(groups)){const excess=Math.max(0,arr.length-targets[g]);const candidates=arr.filter(p=>!p.training).sort((a,b)=>(Number(a.rating)||0)-(Number(b.rating)||0));sell.push(...candidates.slice(0,excess).map(p=>({...p,group:g,reason:'Excesso na posição e rating inferior dentro do setor'})))}const weak=[];for(const [g,arr] of Object.entries(groups)){if(arr.length<targets[g])weak.push({group:g,need:targets[g]-arr.length})}const maxSell=sell.slice(0,4);const avg=r.length?Math.round(r.reduce((a,p)=>a+(Number(p.rating)||0),0)/Math.max(1,r.filter(p=>Number(p.rating)).length)):null;const bestMarket=[...m].filter(p=>Number(p.rating)).sort((a,b)=>(Number(b.rating)||0)-(Number(a.rating)||0)).slice(0,5);return {composition:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,v.length])),targets,sell:maxSell,needs:weak,currentAverage:avg,bestMarket,generatedAt:nowIso()}}
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

Object.assign(window,{showView,configureSlot,saveSlotConfig,finishCompetition,confirmFinish,slotDetailModal,generateTacticForSlot,tacticModal,manualTacticModal,saveManualTactic,resultModal,saveResult,scheduleModal,saveSchedule,downloadIcs,aiMarketPlan,marketPlanModal,saveApiKey,clearApiKey,closeModal});
document.addEventListener('DOMContentLoaded',init);
