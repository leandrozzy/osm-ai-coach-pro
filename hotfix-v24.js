'use strict';

/* OSM AI Coach Pro — Main Fix v2.4.0
   Camada de correção segura carregada depois do app.js atual.
   Não apaga localStorage nem altera o formato principal do backup.
*/
(function(){
  const PATCH_VERSION='2.4.3-safe-calendar';

  function hEsc(v){
    return String(v ?? 'NI').replace(/[&<>"']/g,m=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    }[m]));
  }
  function norm(v){
    return String(v||'').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/\s+/g,' ');
  }
  function has(v){ return !(v===null||v===undefined||v===''||v==='NI'); }
  function fmt(v){
    if(!v)return 'Horário NI';
    const d=new Date(v);
    if(Number.isNaN(d.getTime()))return 'Horário NI';
    return d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  }
  function resultOutcome(gf,ga){ return gf>ga?'V':gf===ga?'E':'D'; }
  function resultLabel(o){ return o==='V'?'Vitória':o==='E'?'Empate':'Derrota'; }
  function validOpponent(name){
    const n=norm(name);
    return !!n && !['ni','tbd','a definir','aguardando','?','-'].includes(n);
  }

  function slotLabel(s){
    const type=s?.competitionType==='Batalha'?'BATALHA':(s?.competitionType||'SEM TIPO');
    return `Slot ${s?.slotNumber||'?'} · ${s?.teamName||'Sem time'} · ${type}`;
  }

  function clearOpponentScoutingForNextMatch(s,nextName){
    const oldName=norm(s?.opponent?.teamName);
    const newName=norm(nextName);
    if(!newName || oldName===newName) return;

    s.opponent={
      teamName:nextName,
      human:null,manager:null,overall:null,goalkeeper:null,defence:null,midfield:null,attack:null,
      squadValue:null,playerCount:null,stadium:null,loginBonus:null,secretTraining:null,trainingCamp:null,
      formation:null,style:null,marking:null,offside:null,tackling:null
    };
    s.match=s.match||{};
    s.match.refereeName=null;
    s.match.refereeColor=null;
    s.tactic=null;

    if(s.fieldMeta){
      [
        'opponent.teamName','opponent.human','opponent.manager','opponent.overall',
        'opponent.goalkeeper','opponent.defence','opponent.midfield','opponent.attack',
        'opponent.loginBonus','opponent.stadium','opponent.trainingCamp','opponent.secretTraining',
        'opponent.formation','opponent.style','opponent.marking','opponent.offside',
        'match.refereeColor'
      ].forEach(k=>{
        if(s.fieldMeta[k]) s.fieldMeta[k]={source:'unknown',confidence:0,updatedAt:new Date().toISOString()};
      });
      if(s.fieldMeta['opponent.teamName']){
        s.fieldMeta['opponent.teamName']={source:'calendar',confidence:.98,updatedAt:new Date().toISOString()};
      }
    }
  }

  function parseCalendarDate(x){
    if(x?.dateTime){
      const t=new Date(x.dateTime).getTime();
      if(Number.isFinite(t))return t;
    }
    const raw=String(x?.dateText||'').trim();
    // dd-mm-yy / dd/mm/yy / dd-mm-yyyy
    const m=raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
    if(m){
      let y=Number(m[3]);
      if(y<100)y+=2000;
      const d=new Date(y,Number(m[2])-1,Number(m[1]),12,0,0,0);
      const t=d.getTime();
      if(Number.isFinite(t))return t;
    }
    return null;
  }

  function isPlaceholderOpponent(name){
    const n=norm(name);
    return !n || ['ni','tbd','a definir','aguardando','?','-','asd'].includes(n);
  }

  function nextScheduleEventAfter(s,playedIndex){
    const rows=Array.isArray(s?.schedule)?s.schedule:[];
    if(!rows.length)return null;

    // A ordem original do calendário é preservada. Não reordena todos os jogos ao abrir o app.
    // Primeiro tenta continuar a partir da partida que acabou.
    if(Number.isInteger(playedIndex) && playedIndex>=0){
      for(let i=playedIndex+1;i<rows.length;i++){
        const x=rows[i];
        if(!x || x.played || x.skipped || x.placeholder)continue;
        return {row:x,index:i};
      }
    }

    // Se não houver índice confiável, usa a primeira partida futura NÃO jogada,
    // mas esta função só é chamada em ações explícitas (resultado/leitura), nunca no startup.
    for(let i=0;i<rows.length;i++){
      const x=rows[i];
      if(!x || x.played || x.skipped || x.placeholder)continue;
      return {row:x,index:i};
    }
    return null;
  }

  function pickNextMatch(s){
    const ev=nextScheduleEventAfter(s,-1);
    return ev?.row||null;
  }

  function promoteNextMatch(s,playedIndex=-1){
    const ev=nextScheduleEventAfter(s,playedIndex);
    const next=ev?.row||null;
    if(!next)return null;

    s.match=s.match||{};
    s.match.nextMatchAt=next.dateTime||s.match.nextMatchAt||null;
    s.match.venue=next.venue||s.match.venue||null;
    if(Number.isFinite(Number(next.round)))s.round=Number(next.round);

    // Copa/partida condicional ainda sem adversário:
    // NÃO inventa nome e NÃO usa lixo de OCR. Mantém um estado explícito "a definir".
    if(next.conditional && isPlaceholderOpponent(next.opponent)){
      s.pendingFixture={
        scheduleIndex:ev.index,
        competitionType:next.competitionType||'cup',
        round:next.round??null,
        dateTime:next.dateTime||null,
        dateText:next.dateText||null,
        venue:next.venue||null,
        opponent:null,
        status:'awaiting_opponent'
      };
      clearOpponentScoutingForNextMatch(s,null);
      s.opponent.teamName=null;
      s.tactic=null;
      return {...next,opponent:null,pendingOpponent:true};
    }

    // Partida real com adversário definido.
    if(validOpponent(next.opponent) && !isPlaceholderOpponent(next.opponent)){
      s.pendingFixture=null;
      clearOpponentScoutingForNextMatch(s,next.opponent);
      s.opponent.teamName=next.opponent;
      return next;
    }

    // Se a linha não é confiável, não altera o adversário.
    return null;
  }

  function findCurrentCalendarMatch(s){
    const rows=Array.isArray(s?.schedule)?s.schedule:[];
    const currentOpp=norm(s?.opponent?.teamName);
    const currentRound=Number(s?.round);

    // 1) Fonte principal: adversário que já estava salvo no slot ANTES da leitura do resultado.
    if(currentOpp){
      const byOpponent=rows.findIndex(x=>!x.played && !x.skipped && !x.placeholder && norm(x.opponent)===currentOpp);
      if(byOpponent>=0)return byOpponent;
    }

    // 2) Segunda fonte: rodada atual do slot.
    if(Number.isFinite(currentRound)){
      const byRound=rows.findIndex(x=>!x.played && !x.skipped && !x.placeholder && Number(x.round)===currentRound);
      if(byRound>=0)return byRound;
    }

    // 3) Só aceita fallback se houver EXATAMENTE uma partida válida não jogada.
    const pending=rows
      .map((x,i)=>({x,i}))
      .filter(({x})=>!x.played && !x.skipped && !x.placeholder && validOpponent(x.opponent) && !isPlaceholderOpponent(x.opponent));
    return pending.length===1?pending[0].i:-1;
  }

  function markCalendarResult(s,gf,ga,score){
    const rows=Array.isArray(s?.schedule)?s.schedule:[];
    if(!rows.length)return null;

    const idx=findCurrentCalendarMatch(s);
    if(idx<0)return null;

    const out=resultOutcome(gf,ga);
    rows[idx]={
      ...rows[idx],
      result:score||`${gf}-${ga}`,
      outcome:out,
      played:true,
      conditional:false,
      placeholder:false
    };
    s.schedule=rows;
    return rows[idx];
  }

  function buildLearning(s,entry){
    const rows=Array.isArray(s.results)?s.results:[];
    const form=entry?.tactic?.formation||entry?.context?.myFormation||'NI';
    const sameForm=rows.filter(r=>(r?.tactic?.formation||r?.context?.myFormation||'NI')===form);
    const fw=sameForm.filter(r=>Number(r.gf)>Number(r.ga)).length;
    const fd=sameForm.filter(r=>Number(r.gf)===Number(r.ga)).length;
    const fl=sameForm.filter(r=>Number(r.gf)<Number(r.ga)).length;

    const oppForm=entry?.context?.oppFormation||'NI';
    const sameOpp=rows.filter(r=>(r?.context?.oppFormation||'NI')===oppForm);
    const ow=sameOpp.filter(r=>Number(r.gf)>Number(r.ga)).length;
    const od=sameOpp.filter(r=>Number(r.gf)===Number(r.ga)).length;
    const ol=sameOpp.filter(r=>Number(r.gf)<Number(r.ga)).length;

    const outcome=resultOutcome(entry.gf,entry.ga);
    const notes=[];
    if(outcome==='V') notes.push('A configuração usada entrou no histórico como resultado positivo; será priorizada apenas quando o contexto futuro for semelhante.');
    if(outcome==='E') notes.push('A configuração usada ficou registrada como empate; não será tratada automaticamente como solução ideal.');
    if(outcome==='D') notes.push('A configuração usada entrou como resultado negativo; a IA deverá reduzir o peso dessa combinação em contexto semelhante.');
    if(form!=='NI') notes.push(`${form}: ${sameForm.length} jogo(s) registrado(s) neste slot — ${fw}V/${fd}E/${fl}D.`);
    if(oppForm!=='NI') notes.push(`Contra ${oppForm}: ${sameOpp.length} registro(s) — ${ow}V/${od}E/${ol}D.`);
    if(entry?.context?.referee) notes.push(`Árbitro registrado: ${entry.context.referee}; este dado ficará associado ao resultado para comparações futuras.`);

    const lesson={
      at:new Date().toISOString(),
      outcome,
      score:entry.score,
      opponent:entry.opponent,
      formation:form,
      opponentFormation:oppForm,
      notes,
      sampleSize:rows.length
    };
    s.lastLearning=lesson;
    s.learningLog=Array.isArray(s.learningLog)?s.learningLog:[];
    s.learningLog.unshift(lesson);
    s.learningLog=s.learningLog.slice(0,30);
    return lesson;
  }

  function finishResultForSlot(s,r){
    const gf=Number(r?.gf),ga=Number(r?.ga);
    if(!Number.isFinite(gf)||!Number.isFinite(ga))throw new Error('Não consegui identificar o placar final.');

    const currentCalendarIndex=findCurrentCalendarMatch(s);
    const currentCalendarMatch=currentCalendarIndex>=0 ? s.schedule[currentCalendarIndex] : null;

    // O vídeo do resultado jamais troca o adversário pelo texto reconhecido.
    const opponent=currentCalendarMatch?.opponent || s.opponent?.teamName || null;
    const score=r?.score||`${gf}-${ga}`;

    const entry={
      createdAt:new Date().toISOString(),
      opponent,
      gf,ga,score,
      tactic:s.tactic?JSON.parse(JSON.stringify(s.tactic)):null,
      stats:r?.stats||{},
      events:r?.events||[],
      context:{
        myOverall:s.myTeam?.overall,
        oppOverall:s.opponent?.overall,
        oppFormation:r?.oppFormation||s.opponent?.formation||null,
        myFormation:r?.myFormation||s.tactic?.formation||null,
        oppStyle:s.opponent?.style||null,
        venue:currentCalendarMatch?.venue||s.match?.venue||null,
        referee:s.match?.refereeColor||null,
        strengthBucket:typeof strengthBucket==='function'?strengthBucket(s):null
      }
    };

    s.results=Array.isArray(s.results)?s.results:[];
    s.results.push(entry);

    const marked=markCalendarResult(s,gf,ga,score);
    const lesson=buildLearning(s,entry);
    s.tactic=null;

    let next=null;
    if(marked){
      const playedIndex=s.schedule.indexOf(marked);
      next=promoteNextMatch(s,playedIndex);
    }else{
      // Se não conseguiu casar com o calendário, NÃO troca o slot.
      s.lastCalendarSyncWarning='Resultado salvo, mas a partida atual não foi localizada com segurança no calendário. O adversário foi mantido.';
    }

    s.lastAnalysisAt=new Date().toISOString();
    return {entry,lesson,next,marked};
  }

  function renderPostMatchLearning(s,lesson,next){
    const el=document.getElementById('analysisContent');
    if(!el||!lesson)return;
    const notes=(lesson.notes||[]).map(n=>`<div class="learning-note">${hEsc(n)}</div>`).join('');
    el.innerHTML=`
      <div class="post-result-card">
        <div class="post-result-top">
          <div>
            <span class="eyebrow">RESULTADO REGISTRADO · SLOT ${hEsc(s.slotNumber)}</span>
            <h3>${hEsc(resultLabel(lesson.outcome))} · ${hEsc(lesson.score)}</h3>
            <p>${hEsc(s.teamName||'Meu time')} × ${hEsc(lesson.opponent||'Adversário')}</p>
          </div>
          <span class="result-badge ${lesson.outcome==='V'?'win':lesson.outcome==='E'?'draw':'loss'}">${hEsc(lesson.outcome)}</span>
        </div>
        <div class="learned-box">
          <b>O que entrou no aprendizado agora</b>
          ${notes}
        </div>
        <div class="next-after-result">
          <b>Próximo jogo do slot</b>
          <span>${next?`${hEsc(next.opponent)} · ${hEsc(next.venue||'Local NI')} · ${hEsc(next.dateTime?fmt(next.dateTime):(next.dateText||'Data NI'))}`:'Ainda não há próximo adversário definido no calendário.'}</span>
        </div>
        <div class="actions">
          <button class="btn" onclick="showView('learning')">Ver aprendizado</button>
          <button class="btn ghost" onclick="showView('info')">Ver calendário atualizado</button>
          <button class="btn ghost" onclick="showView('dashboard')">Voltar para Hoje</button>
        </div>
      </div>`;
  }

  // ===== RESULTADO AUTOMÁTICO =====
  v21ApplyResult=function(r){
    const s=selectedSlot();
    const done=finishResultForSlot(s,r);
    setTimeout(()=>renderPostMatchLearning(s,done.lesson,done.next),0);
    if(!done.marked){
      setTimeout(()=>job('Resultado salvo, mas o calendário não confirmou qual partida encerrar. O adversário foi mantido para evitar erro.','error'),0);
    }
  };

  // ===== RESULTADO MANUAL =====
  window.saveResult=function(n){
    const s=state.slots[n-1];
    const gf=Number(document.getElementById('rGF')?.value);
    const ga=Number(document.getElementById('rGA')?.value);
    if(!Number.isFinite(gf)||!Number.isFinite(ga)){toast('Informe o placar');return}
    const r={
      opponent:document.getElementById('rOpp')?.value?.trim()||s.opponent?.teamName,
      gf,ga,
      score:`${gf}-${ga}`
    };
    const done=finishResultForSlot(s,r);
    saveState();
    closeModal();
    renderPostMatchLearning(s,done.lesson,done.next);
    toast(`Resultado salvo no Slot ${n}; calendário e aprendizado atualizados`);
  };

  // ===== CALENDÁRIO =====
  const _oldNormalizeCalendar = typeof normalizeCalendarOutcomeRow==='function' ? normalizeCalendarOutcomeRow : x=>x;
  v21ApplyCalendar=function(data){
    const s=selectedSlot();
    const rows=Array.isArray(data?.matches)?data.matches:[];
    s.schedule=rows.map(x=>({...normalizeCalendarOutcomeRow(x),skipped:false}));

    for(const r of (s.results||[])){
      const rn=norm(r.opponent);
      if(!rn)continue;
      const idx=s.schedule.findIndex(x=>norm(x.opponent)===rn && !x.played);
      if(idx>=0){
        const gf=Number(r.gf),ga=Number(r.ga);
        if(Number.isFinite(gf)&&Number.isFinite(ga)){
          s.schedule[idx]={
            ...s.schedule[idx],
            played:true,
            result:r.score||`${gf}-${ga}`,
            outcome:resultOutcome(gf,ga),
            conditional:false,
            placeholder:false
          };
        }
      }
    }

    // NÃO sobrescreve slot que já tem adversário válido.
    if(!validOpponent(s.opponent?.teamName) || isPlaceholderOpponent(s.opponent?.teamName)){
      const first=nextScheduleEventAfter(s,-1);
      if(first?.row && validOpponent(first.row.opponent) && !isPlaceholderOpponent(first.row.opponent)){
        s.opponent.teamName=first.row.opponent;
        s.match=s.match||{};
        s.match.nextMatchAt=first.row.dateTime||s.match.nextMatchAt;
        s.match.venue=first.row.venue||s.match.venue;
      }
    }
    s.lastAnalysisAt=new Date().toISOString();
  };
        }
      }
    }
    promoteNextMatch(s);
    s.lastAnalysisAt=new Date().toISOString();
  };

  // ===== LEITURA DO ELENCO: cobertura cronológica =====
  v21ExtractVideoFrames=async function(file,maxFrames=20){
    const url=URL.createObjectURL(file),v=document.createElement('video');
    v.src=url;v.muted=true;v.playsInline=true;v.preload='metadata';
    await new Promise((res,rej)=>{
      v.onloadedmetadata=res;
      v.onerror=()=>rej(new Error(`Não consegui abrir ${file.name}`));
      try{v.load()}catch{}
    });
    const dur=Math.max(.2,v.duration||1),times=[];
    const wanted=analysisMode==='market'?Math.max(maxFrames,32):maxFrames;
    for(let i=0;i<wanted;i++)times.push(Math.min(dur-.08,Math.max(.08,(dur*(i+.5))/wanted)));
    const frames=[];let prev=null;
    for(const t of times){
      await v21SeekVideo(v,t);
      const f=v21CaptureVideoFrame(v,t,file.name);
      const d=prev?v21PixelDiff(prev,f.thumb):100;
      prev=f.thumb;f.score=d;
      // No elenco, NÃO descarta quadro só porque a tela é visualmente parecida:
      // é justamente durante a rolagem que linhas de jogadores diferentes passam pela mesma área.
      if(analysisMode==='market'||d>=3||frames.length<3)frames.push(f);
    }
    URL.revokeObjectURL(url);
    return analysisMode==='market'
      ? frames.sort((a,b)=>(a.time||0)-(b.time||0))
      : v21ChooseDiverseFrames(frames,maxFrames);
  };

  function marketEvidence(frames,n=18){
    const sorted=[...(frames||[])].sort((a,b)=>(a.time||0)-(b.time||0));
    if(sorted.length<=n)return sorted;
    const out=[];
    for(let i=0;i<n;i++){
      const idx=Math.round(i*(sorted.length-1)/Math.max(1,n-1));
      const f=sorted[idx];
      if(f&&!out.includes(f))out.push(f);
    }
    return out;
  }

  const _oldPrompt=v21Prompt;
  v21Prompt=function(ocr,mode){
    let p=_oldPrompt(ocr,mode);
    if(mode==='market'){
      const expected=Number(selectedSlot()?.myTeam?.playerCount);
      p+=`\n\nVALIDAÇÃO FINAL OBRIGATÓRIA:\n`;
      if(Number.isFinite(expected)&&expected>0){
        p+=`O jogo informa ${expected} jogadores no meu elenco. Reexamine TODOS os quadros antes de devolver menos de ${expected}. Não invente jogador para completar a contagem; se um nome estiver ilegível, ainda assim não omita outro jogador legível visível em quadro intermediário.\n`;
      }
      p+=`Dê atenção especial aos quadros intermediários da rolagem, principalmente na transição ATA -> MEI -> DEF -> GOL.`;
    }
    return p;
  };

  // Reimplementa apenas o fluxo market para usar mais quadros;
  // demais modos continuam com o motor atual.
  const _oldV21Analyze=v21Analyze;
  v21Analyze=async function(files){
    if(analysisMode!=='market') return _oldV21Analyze(files);

    const n=Number(document.getElementById('analysisSlot')?.value)||state.selectedSlot;
    state.selectedSlot=n;
    const video=files.find(f=>String(f.type||'').startsWith('video/'));
    const images=files.filter(f=>String(f.type||'').startsWith('image/'));
    let frames=[];

    setProgress(5,'Capturando toda a rolagem do elenco…');

    if(video){
      frames=await v21ExtractVideoFrames(video,32);
    }else if(images.length){
      for(const f of images)frames.push(await v21ImageToFrame(f));
    }else{
      throw new Error('Selecione um vídeo ou imagens do OSM.');
    }

    v21RenderEvidence(frames);
    setProgress(18,`OCR em ${frames.length} quadro(s) do elenco…`);
    const ocr=await v21RunLocalOcr(frames);
    const evidence=marketEvidence(frames,18);

    setProgress(58,`Consolidando jogadores em ${evidence.length} quadros cronológicos…`);
    const result=await v21AnalyzePackage(ocr,evidence,'market');
    v21ApplyRoster(result);
    saveState();
    renderMarket();

    const s=selectedSlot();
    const rc=(s.roster||[]).length;
    const ex=Number(s.myTeam?.playerCount);
    const warn=Number.isFinite(ex)&&ex>0&&rc<ex;

    const ac=document.getElementById('analysisContent');
    if(ac){
      ac.innerHTML=`<div class="card" style="margin-top:12px">
        <h3>${warn?'Leitura incompleta':'Elenco atualizado'}</h3>
        <p class="muted small">${warn?`Foram reconhecidos ${rc} de ${ex} jogadores. O app não considerará a leitura completa.`:`${rc} jogador(es) reconhecido(s).`}</p>
      </div>`;
    }
    setProgress(100,warn?'Elenco precisa de revisão':'Elenco atualizado');
    setAnalysisRun(s,'market',warn?'warning':'success',
      warn?`Foram reconhecidos ${rc} de ${ex} jogadores.`:`${rc} jogadores reconhecidos.`,
      {rosterCount:rc,expected:Number.isFinite(ex)?ex:null}
    );
    job(warn?'Leitura do elenco incompleta; revise antes de usar o plano.':'Elenco atualizado.','done');
  };
  window.v21Analyze=v21Analyze;


  // ===== FORÇA: NI não pode virar zero =====
  strengthDiff=function(s){
    const av=s?.myTeam?.overall,bv=s?.opponent?.overall;
    if(!has(av)||!has(bv))return null;
    const a=Number(av),b=Number(bv);
    return Number.isFinite(a)&&Number.isFinite(b)?a-b:null;
  };
  strengthBucket=function(s){
    const d=strengthDiff(s);
    if(d===null)return 'NI';
    if(d>=20)return 'muito_mais_forte';
    if(d>=8)return 'mais_forte';
    if(d>-8)return 'equilibrado';
    if(d>-20)return 'mais_fraco';
    return 'muito_mais_fraco';
  };

  function repairSlotFromCalendar(s){
    if(!s || s.status!=='active' || !Array.isArray(s.schedule) || !s.schedule.length)return;
    const next=pickNextMatch(s);
    if(!next)return;

    const current=norm(s?.opponent?.teamName);
    const nextNorm=norm(next.opponent);

    // Corrige estado antigo contaminado por linha condicional/IA (ex.: "ASD").
    if(current!==nextNorm || s.match?.nextMatchAt!==next.dateTime || s.match?.venue!==next.venue){
      clearOpponentScoutingForNextMatch(s,next.opponent);
      s.opponent.teamName=next.opponent;
      s.match=s.match||{};
      s.match.venue=next.venue||null;
      s.match.nextMatchAt=next.dateTime||null;
      if(Number.isFinite(Number(next.round)))s.round=Number(next.round);
    }
  }

  function repairAllSlotsFromCalendar(){
    for(const s of (state?.slots||[]))repairSlotFromCalendar(s);
    try{localStorage.setItem(STATE_KEY,JSON.stringify(state));}catch{}
  }

  // ===== HOJE: sempre obedece ao slot selecionado =====
  nextAction=function(){
    const s=selectedSlot();
    if(!s||s.status!=='active'){
      return {
        priority:`SLOT ${state.selectedSlot} · LIVRE`,
        title:'Configure este slot',
        detail:'A tela Hoje agora mostra somente o contexto do slot selecionado.',
        buttons:`<button class="btn" onclick="competitionModal(${state.selectedSlot})">Criar competição</button><button class="btn ghost" onclick="showView('analyze')">Analisar mídia</button>`
      };
    }
    const miss=missingRequired(s);
    if(miss.length){
      return {
        priority:`SLOT ${s.slotNumber} · ${s.competitionType||'COMPETIÇÃO'}`,
        title:`${s.teamName||'Meu time'} × ${s.opponent?.teamName||'Adversário NI'}`,
        detail:`${miss.length} campo(s) importante(s) ainda não confirmado(s). Próximo jogo: ${s.match?.nextMatchAt?fmt(s.match.nextMatchAt):'horário NI'}.`,
        buttons:`<button class="btn" onclick="showView('pregame')">Abrir pré-jogo</button><button class="btn ghost" onclick="showView('analyze')">Atualizar análise</button>`
      };
    }
    if(!s.tactic){
      return {
        priority:`SLOT ${s.slotNumber} · PRÓXIMO JOGO`,
        title:`${s.teamName||'Meu time'} × ${s.opponent?.teamName||'Adversário NI'}`,
        detail:`${s.match?.venue||'Local NI'} · ${s.match?.nextMatchAt?fmt(s.match.nextMatchAt):'Horário NI'} · dados prontos para gerar tática.`,
        buttons:`<button class="btn" onclick="generateTactic(${s.slotNumber})">Gerar tática</button><button class="btn ghost" onclick="showView('info')">Ver calendário</button>`
      };
    }
    return {
      priority:`SLOT ${s.slotNumber} · PLANO PRONTO`,
      title:`${s.teamName||'Meu time'} × ${s.opponent?.teamName||'Adversário NI'}`,
      detail:`${s.match?.venue||'Local NI'} · ${s.match?.nextMatchAt?fmt(s.match.nextMatchAt):'Horário NI'} · ${s.tactic.formation||'Formação NI'} / ${s.tactic.gamePlan||'Plano NI'}.`,
      buttons:`<button class="btn" onclick="showView('pregame')">Ver plano</button><button class="btn ghost" onclick="generateTactic(${s.slotNumber})">Recalcular</button>`
    };
  };

  renderSlotSwitcher=function(){
    const el=document.getElementById('slotSwitcher');
    if(!el)return;
    el.innerHTML=state.slots.map(s=>{
      const active=s.slotNumber===state.selectedSlot;
      const shortTeam=s.teamName||'Livre';
      const status=s.status==='active'
        ? (s.competitionType==='Batalha'?'Batalha':(s.competitionType||'Ativo'))
        : 'Livre';
      return `<button class="slot-chip slot-chip-v24 ${active?'active':''}" onclick="selectSlot(${s.slotNumber})">
        <span class="slot-chip-number">S${s.slotNumber}</span>
        <span class="slot-chip-text"><b>${hEsc(shortTeam)}</b><small>${hEsc(status)}</small></span>
      </button>`;
    }).join('');

    let banner=document.getElementById('activeSlotBanner');
    if(!banner){
      banner=document.createElement('div');
      banner.id='activeSlotBanner';
      el.insertAdjacentElement('afterend',banner);
    }
    const s=selectedSlot();
    banner.className='active-slot-banner';
    banner.innerHTML=`
      <div class="active-slot-id">SLOT ${hEsc(s?.slotNumber||state.selectedSlot)}</div>
      <div class="active-slot-main">
        <b>${hEsc(s?.teamName||'Slot livre')}</b>
        <span>${hEsc(s?.competitionName||'Sem competição')} · ${hEsc(s?.competitionType||'Não configurado')}</span>
      </div>
      <div class="active-slot-next">${s?.status==='active'?`Próximo: <b>${hEsc(s?.opponent?.teamName||'NI')}</b>`:'Configure este slot'}</div>`;
  };

  // ===== APRENDIZADO CLARO POR SLOT =====
  renderLearning=function(){
    const s=selectedSlot();
    const rows=Array.isArray(s?.results)?s.results:[];
    const w=rows.filter(r=>Number(r.gf)>Number(r.ga)).length;
    const d=rows.filter(r=>Number(r.gf)===Number(r.ga)).length;
    const l=rows.filter(r=>Number(r.gf)<Number(r.ga)).length;

    const byForm={};
    for(const r of rows){
      const f=r?.tactic?.formation||r?.context?.myFormation||'NI';
      byForm[f]??={j:0,w:0,d:0,l:0};
      byForm[f].j++;
      if(Number(r.gf)>Number(r.ga))byForm[f].w++;
      else if(Number(r.gf)===Number(r.ga))byForm[f].d++;
      else byForm[f].l++;
    }

    const last=s?.lastLearning||s?.learningLog?.[0]||null;
    const lastHtml=last?`
      <div class="learning-current">
        <span class="eyebrow">ÚLTIMO APRENDIZADO · SLOT ${hEsc(s.slotNumber)}</span>
        <h3>${hEsc(resultLabel(last.outcome))} ${hEsc(last.score)} contra ${hEsc(last.opponent)}</h3>
        ${(last.notes||[]).map(x=>`<div class="learning-note">${hEsc(x)}</div>`).join('')}
      </div>`:
      `<div class="card"><p class="muted">Este slot ainda não tem resultado suficiente para gerar aprendizado.</p></div>`;

    const table=Object.keys(byForm).length?`
      <div class="card learning-table-card">
        <h3>Desempenho real por formação neste slot</h3>
        <table class="simple-table">
          <tr><th>Formação</th><th>J</th><th>V</th><th>E</th><th>D</th></tr>
          ${Object.entries(byForm).sort((a,b)=>b[1].j-a[1].j).map(([f,x])=>`
            <tr><td>${hEsc(f)}</td><td>${x.j}</td><td>${x.w}</td><td>${x.d}</td><td>${x.l}</td></tr>`).join('')}
        </table>
        <p class="small muted">A IA usa estes registros como evidência histórica; poucos jogos não são tratados como prova de que uma tática é sempre melhor.</p>
      </div>`:'';

    const target=document.getElementById('learningContent');
    if(target)target.innerHTML=`
      <div class="slot-page-title"><b>${hEsc(slotLabel(s))}</b><span>Aprendizado separado por slot</span></div>
      <div class="card"><div class="kpis">
        <div class="kpi"><span>Jogos</span><b>${rows.length}</b></div>
        <div class="kpi"><span>Vitórias</span><b>${w}</b></div>
        <div class="kpi"><span>Empates</span><b>${d}</b></div>
        <div class="kpi"><span>Derrotas</span><b>${l}</b></div>
      </div></div>
      ${lastHtml}${table}`;
  };

  // ===== HISTÓRICO COM CONTEXTO DO SLOT =====
  const _oldRenderHistory=renderHistory;
  renderHistory=function(){
    _oldRenderHistory();
    const s=selectedSlot();
    const target=document.getElementById('historyContent');
    if(!target)return;
    target.insertAdjacentHTML('afterbegin',`
      <div class="slot-page-title">
        <b>${hEsc(slotLabel(s))}</b>
        <span>${(s?.results||[]).length} resultado(s) somente deste slot</span>
      </div>`);
  };


  // ===== CALENDÁRIO: edição manual e sincronização explícita =====
  window.editCalendarMatchV24=function(index){
    const s=selectedSlot();
    const x=s.schedule?.[index];
    if(!x){toast('Partida não encontrada');return}
    openModal(`<h2>Editar partida · Slot ${s.slotNumber}</h2>
      <div class="field-edit">
        <label>Adversário
          <input id="calOppV24" value="${hEsc(x.opponent||'')}" placeholder="A definir">
        </label>
        <label>Local
          <select id="calVenueV24">
            <option value="">NI</option><option>Casa</option><option>Fora</option>
          </select>
        </label>
        <label class="check">
          <input id="calConditionalV24" type="checkbox" ${x.conditional?'checked':''}>
          <span>Partida condicional / aguardando definição</span>
        </label>
        <div class="actions">
          <button class="btn" onclick="saveCalendarMatchV24(${index})">Salvar partida</button>
          <button class="btn ghost" onclick="saveCalendarMatchV24(${index},true)">Salvar e usar como próximo jogo</button>
        </div>
      </div>`);
    const sel=document.getElementById('calVenueV24');
    if(sel)sel.value=x.venue||'';
  };

  window.saveCalendarMatchV24=function(index,useAsNext=false){
    const s=selectedSlot();
    const x=s.schedule?.[index];
    if(!x)return;
    const opp=document.getElementById('calOppV24')?.value?.trim()||null;
    const venue=document.getElementById('calVenueV24')?.value||null;
    const conditional=!!document.getElementById('calConditionalV24')?.checked;

    x.opponent=opp;
    x.venue=venue;
    x.conditional=conditional;
    x.placeholder=!opp;
    if(opp && !isPlaceholderOpponent(opp))x.placeholder=false;

    if(useAsNext){
      if(!opp || isPlaceholderOpponent(opp)){
        toast('Informe um adversário válido antes de usar como próximo jogo');
        return;
      }
      clearOpponentScoutingForNextMatch(s,opp);
      s.opponent.teamName=opp;
      s.match=s.match||{};
      s.match.venue=venue;
      s.match.nextMatchAt=x.dateTime||s.match.nextMatchAt||null;
      if(Number.isFinite(Number(x.round)))s.round=Number(x.round);
      s.pendingFixture=null;
      s.tactic=null;
    }

    localStorage.setItem(STATE_KEY,JSON.stringify(state));
    closeModal();
    renderAll();
    toast(useAsNext?'Próximo jogo atualizado manualmente':'Partida do calendário atualizada');
  };

  // ===== INFORMAÇÕES COM DESTAQUE DO PRÓXIMO JOGO =====
  const _oldRenderInfo=renderInfo;
  renderInfo=function(){
    _oldRenderInfo();
    const s=selectedSlot();
    const target=document.getElementById('infoContent');
    if(!target)return;
    const next=pickNextMatch(s);
    target.insertAdjacentHTML('afterbegin',`
      <div class="slot-page-title">
        <b>${hEsc(slotLabel(s))}</b>
        <span>${next?`Próximo calendário: ${hEsc(next.opponent)}${next.dateTime?' · '+hEsc(fmt(next.dateTime)):''}`:'Sem próximo jogo definido'}</span>
      </div>`);
  };

  // ===== PRÉ-JOGO COM CONTEXTO DO SLOT =====
  const _oldRenderPregame=renderPregame;
  renderPregame=function(){
    _oldRenderPregame();
    const s=selectedSlot();
    const target=document.getElementById('pregameContent');
    if(!target)return;
    target.insertAdjacentHTML('afterbegin',`
      <div class="slot-page-title slot-page-title-strong">
        <b>SLOT ${hEsc(s.slotNumber)} · ${hEsc(s.teamName||'Sem time')}</b>
        <span>${hEsc(s.competitionName||'Sem competição')} · adversário atual: ${hEsc(s.opponent?.teamName||'NI')}</span>
      </div>`);
  };


  const _calendarTableHtmlV24=calendarTableHtml;
  calendarTableHtml=function(rows){
    const s=selectedSlot();
    return `<div class="calendar-wrap"><table class="simple-table calendar-table">
      <thead><tr><th>Rod.</th><th>Tipo</th><th>Local</th><th>Adversário</th><th>Data/hora</th><th>Status</th><th></th></tr></thead>
      <tbody>${(rows||[]).map((x,i)=>`<tr>
        <td>${hEsc(x.round)}</td>
        <td>${x.competitionType==='cup'?'🏆 Taça':'Liga'}</td>
        <td>${hEsc(x.venue)}</td>
        <td>${hEsc(isPlaceholderOpponent(x.opponent)?'A definir':x.opponent)}</td>
        <td>${hEsc(x.dateTime?fmt(x.dateTime):`${x.dateText||'NI'} ${x.timeText||''}`)}</td>
        <td>${x.played
          ? `<span class="result-badge ${String(x.outcome||'').toUpperCase()==='V'?'win':String(x.outcome||'').toUpperCase()==='E'?'draw':'loss'}">${hEsc(calendarOutcomeLabel(x))}</span>${x.result?` · ${hEsc(x.result)}`:''}`
          : x.skipped?'Ignorado':x.conditional?'Condicional':'Futuro'
        }</td>
        <td><button class="btn ghost tiny" onclick="editCalendarMatchV24(${i})">Editar</button></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  };

  // Re-render após carregar a camada.
  try{
    localStorage.setItem('osm_ai_coach_patch_version',PATCH_VERSION);
    renderAll();
    renderAnalysisStatus();
  }catch(e){
    console.error('Falha ao iniciar patch v2.4.0',e);
  }
})();
