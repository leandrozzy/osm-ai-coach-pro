'use strict';

/*
  OSM AI Coach Pro — CLEAN FIX 2.5.0
  Esta camada substitui apenas os fluxos problemáticos da main:
  - calendário / próximo adversário
  - resultado -> calendário
  - edição manual de partida
  - aprendizado visível
  - leitura do elenco
  - clareza de slot
  Não carrega os hotfixes 2.4.x anteriores.
*/
(function(){
  const CLEAN_VERSION='2.5.3';

  function e(v){
    return String(v ?? 'NI').replace(/[&<>"']/g,m=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    }[m]));
  }
  function n(v){
    return String(v||'').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/\s+/g,' ');
  }
  function filled(v){
    return !(v===null||v===undefined||v===''||v==='NI');
  }
  function cloneSafe(v){
    try{return JSON.parse(JSON.stringify(v))}catch{return v}
  }
  function outcome(gf,ga){ return gf>ga?'V':gf===ga?'E':'D'; }
  function outcomeText(o){ return o==='V'?'Vitória':o==='E'?'Empate':'Derrota'; }

  function parseEventTime(x){
    if(x?.dateTime){
      const t=new Date(x.dateTime).getTime();
      if(Number.isFinite(t))return t;
    }
    const raw=String(x?.dateText||'').trim();
    let m=raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?$/);
    if(!m)return null;
    let year=Number(m[3]); if(year<100)year+=2000;
    const hour=Number(m[4]||12),minute=Number(m[5]||0);
    const d=new Date(year,Number(m[2])-1,Number(m[1]),hour,minute,0,0);
    const t=d.getTime();
    return Number.isFinite(t)?t:null;
  }

  function realOpponent(v){
    const x=n(v);
    return !!x && !['ni','tbd','a definir','aguardando','?','-'].includes(x);
  }

  // "Condicional" significa que o confronto ainda não está confirmado.
  // Mesmo que OCR tenha devolvido algum texto estranho, ele não pode virar adversário automaticamente.
  function isPendingConditional(x){
    return !!x?.conditional && !x?.played;
  }

  function calendarRows(s){
    return Array.isArray(s?.schedule)?s.schedule:[];
  }

  function currentCalendarIndex(s){
    const rows=calendarRows(s);
    const opp=n(s?.opponent?.teamName);
    const round=Number(s?.round);

    if(opp){
      const matches=rows
        .map((x,i)=>({x,i}))
        .filter(({x})=>!x.played && !x.skipped && n(x.opponent)===opp);
      if(matches.length===1)return matches[0].i;
      if(matches.length>1 && Number.isFinite(round)){
        const exact=matches.find(({x})=>Number(x.round)===round);
        if(exact)return exact.i;
      }
    }

    if(Number.isFinite(round)){
      const byRound=rows
        .map((x,i)=>({x,i}))
        .filter(({x})=>!x.played && !x.skipped && Number(x.round)===round);
      if(byRound.length===1)return byRound[0].i;
    }
    return -1;
  }

  function futureEventsAfter(s,playedRow){
    const rows=calendarRows(s);
    const playedTime=parseEventTime(playedRow);
    const playedIndex=rows.indexOf(playedRow);

    return rows
      .map((x,i)=>({x,i,t:parseEventTime(x)}))
      .filter(({x,i,t})=>{
        if(!x || x.played || x.skipped)return false;
        if(playedTime!==null && t!==null)return t>playedTime;
        return i>playedIndex;
      })
      .sort((a,b)=>{
        if(a.t!==null && b.t!==null && a.t!==b.t)return a.t-b.t;
        if(a.t!==null && b.t===null)return -1;
        if(a.t===null && b.t!==null)return 1;
        return a.i-b.i;
      });
  }

  function clearRivalDetails(s){
    const keepName=s?.opponent?.teamName??null;
    s.opponent={
      teamName:keepName,
      human:null,manager:null,overall:null,goalkeeper:null,defence:null,midfield:null,attack:null,
      squadValue:null,playerCount:null,stadium:null,loginBonus:null,secretTraining:null,trainingCamp:null,
      formation:null,style:null,marking:null,offside:null,tackling:null
    };
    s.match=s.match||{};
    s.match.refereeName=null;
    s.match.refereeColor=null;
    s.tactic=null;
  }

  function setNextFromRow(s,row,index,{manual=false}={}){
    if(!row)return false;

    s.match=s.match||{};
    s.match.nextMatchAt=row.dateTime||null;
    s.match.venue=row.venue||null;
    if(Number.isFinite(Number(row.round)))s.round=Number(row.round);

    if(isPendingConditional(row) && !manual){
      // A próxima competição existe, mas o adversário ainda não.
      s.pendingFixture={
        scheduleIndex:index,
        round:row.round??null,
        competitionType:row.competitionType||'cup',
        dateTime:row.dateTime||null,
        dateText:row.dateText||null,
        venue:row.venue||null,
        status:'awaiting_opponent'
      };
      s.opponent=s.opponent||{};
      s.opponent.teamName=null;
      clearRivalDetails(s);
      return true;
    }

    if(!realOpponent(row.opponent))return false;

    s.pendingFixture=null;
    s.opponent=s.opponent||{};
    s.opponent.teamName=row.opponent;
    clearRivalDetails(s);
    s.opponent.teamName=row.opponent;
    return true;
  }

  function markPlayedFromResult(s,gf,ga,score){
    const idx=currentCalendarIndex(s);
    if(idx<0)return {row:null,index:-1};

    const row=s.schedule[idx];
    row.played=true;
    row.result=score||`${gf}-${ga}`;
    row.outcome=outcome(gf,ga);
    row.conditional=false;
    row.placeholder=false;
    return {row,index:idx};
  }

  function advanceAfterResult(s,playedRow){
    const list=futureEventsAfter(s,playedRow);
    if(!list.length)return null;

    // A PRIMEIRA ocorrência cronológica é a próxima obrigação.
    // Se for Copa condicional sem rival, para nela; não pula para a liga.
    const next=list[0];
    setNextFromRow(s,next.x,next.i,{manual:false});
    return next.x;
  }

  function learnFromResult(s,entry){
    const rows=Array.isArray(s.results)?s.results:[];
    const form=entry?.tactic?.formation||entry?.context?.myFormation||'NI';
    const same=rows.filter(r=>(r?.tactic?.formation||r?.context?.myFormation||'NI')===form);
    const w=same.filter(r=>Number(r.gf)>Number(r.ga)).length;
    const d=same.filter(r=>Number(r.gf)===Number(r.ga)).length;
    const l=same.filter(r=>Number(r.gf)<Number(r.ga)).length;

    const lesson={
      at:new Date().toISOString(),
      opponent:entry.opponent||null,
      score:entry.score,
      outcome:outcome(entry.gf,entry.ga),
      formation:form,
      notes:[
        form!=='NI'?`${form}: ${same.length} jogo(s) neste slot — ${w}V/${d}E/${l}D.`:'Formação usada não identificada.',
        entry.gf>entry.ga
          ? 'Resultado positivo registrado; será usado somente quando o contexto futuro for semelhante.'
          : entry.gf===entry.ga
            ? 'Empate registrado; a configuração não será tratada como solução ideal.'
            : 'Resultado negativo registrado; esta combinação perde peso em contexto semelhante.'
      ]
    };
    s.lastLearning=lesson;
    s.learningLog=Array.isArray(s.learningLog)?s.learningLog:[];
    s.learningLog.unshift(lesson);
    s.learningLog=s.learningLog.slice(0,30);
    return lesson;
  }

  function finishResult(s,r){
    const gf=Number(r?.gf),ga=Number(r?.ga);
    if(!Number.isFinite(gf)||!Number.isFinite(ga))throw new Error('Não consegui identificar o placar final.');

    const currentIdx=currentCalendarIndex(s);
    const currentRow=currentIdx>=0?s.schedule[currentIdx]:null;

    // Nunca usa nome extraído do vídeo para trocar o slot.
    const opponent=currentRow?.opponent || s.opponent?.teamName || null;
    const score=r?.score||`${gf}-${ga}`;

    const entry={
      createdAt:new Date().toISOString(),
      opponent,
      gf,ga,score,
      tactic:s.tactic?cloneSafe(s.tactic):null,
      stats:r?.stats||{},
      events:r?.events||[],
      context:{
        myOverall:s.myTeam?.overall,
        oppOverall:s.opponent?.overall,
        oppFormation:r?.oppFormation||s.opponent?.formation||null,
        myFormation:r?.myFormation||s.tactic?.formation||null,
        oppStyle:s.opponent?.style||null,
        venue:currentRow?.venue||s.match?.venue||null,
        referee:s.match?.refereeColor||null,
        strengthBucket:typeof strengthBucket==='function'?strengthBucket(s):null
      }
    };

    s.results=Array.isArray(s.results)?s.results:[];
    s.results.push(entry);

    const marked=markPlayedFromResult(s,gf,ga,score);
    const lesson=learnFromResult(s,entry);
    s.tactic=null;

    let next=null;
    if(marked.row){
      next=advanceAfterResult(s,marked.row);
    }else{
      s.lastCalendarSyncWarning='Resultado salvo, mas o calendário não confirmou qual partida terminou. O adversário não foi alterado.';
    }

    s.lastAnalysisAt=new Date().toISOString();
    return {entry,lesson,next,marked};
  }

  function postResultHtml(s,done){
    const lesson=done.lesson;
    const pending=done.next && isPendingConditional(done.next);
    const nextText=pending
      ? 'Próxima partida: Copa/Taça aguardando definição do adversário.'
      : done.next
        ? `Próxima partida: ${e(done.next.opponent)}${done.next.dateTime?' · '+e(fmtDate(done.next.dateTime)):''}`
        : 'Próxima partida ainda não definida no calendário.';

    return `<div class="card" style="margin-top:12px">
      <span class="eyebrow">RESULTADO · SLOT ${e(s.slotNumber)}</span>
      <h3 style="margin:6px 0">${e(outcomeText(lesson.outcome))} · ${e(lesson.score)}</h3>
      <p class="small muted">${e(s.teamName)} × ${e(lesson.opponent)}</p>
      <div class="reason-box">
        <b>O que a IA registrou no aprendizado</b>
        ${(lesson.notes||[]).map(x=>`<p class="small">${e(x)}</p>`).join('')}
      </div>
      <div class="next-match-note"><b>${nextText}</b></div>
      <div class="actions">
        <button class="btn" onclick="showView('info')">Ver calendário</button>
        <button class="btn ghost" onclick="showView('learning')">Ver aprendizado</button>
      </div>
    </div>`;
  }

  // ------------------------------------------------------------
  // FORÇA: NI nunca equivale a zero
  // ------------------------------------------------------------
  strengthDiff=function(s){
    if(!filled(s?.myTeam?.overall)||!filled(s?.opponent?.overall))return null;
    const a=Number(s.myTeam.overall),b=Number(s.opponent.overall);
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

  // ------------------------------------------------------------
  // RESULTADO automático e manual
  // ------------------------------------------------------------
  v21ApplyResult=function(r){
    const s=selectedSlot();
    const done=finishResult(s,r);
    s._lastResultUi=done;
  };

  window.saveResult=function(slotNo){
    const s=state.slots[slotNo-1];
    const gf=Number(document.getElementById('rGF')?.value);
    const ga=Number(document.getElementById('rGA')?.value);
    if(!Number.isFinite(gf)||!Number.isFinite(ga)){toast('Informe o placar');return}
    const done=finishResult(s,{gf,ga,score:`${gf}-${ga}`});
    saveState();
    closeModal();
    showView('learning');
    toast(`Resultado salvo no Slot ${slotNo}`);
  };

  // ------------------------------------------------------------
  // CALENDÁRIO: leitura não destrói slot correto
  // ------------------------------------------------------------
  const baseCalendarNormalizer=typeof normalizeCalendarOutcomeRow==='function'
    ? normalizeCalendarOutcomeRow
    : x=>({...x});

  v21ApplyCalendar=function(data){
    const s=selectedSlot();
    const incoming=Array.isArray(data?.matches)?data.matches:[];
    s.schedule=incoming.map(x=>({...baseCalendarNormalizer(x),skipped:false}));

    // Reaplica resultados históricos já conhecidos no calendário novo.
    for(const r of (s.results||[])){
      const ropp=n(r.opponent);
      if(!ropp)continue;
      const candidates=s.schedule
        .map((x,i)=>({x,i}))
        .filter(({x})=>n(x.opponent)===ropp);
      const target=candidates.find(({x})=>!x.played) || candidates.at(-1);
      if(target && Number.isFinite(Number(r.gf)) && Number.isFinite(Number(r.ga))){
        target.x.played=true;
        target.x.result=r.score||`${r.gf}-${r.ga}`;
        target.x.outcome=outcome(Number(r.gf),Number(r.ga));
        target.x.conditional=false;
        target.x.placeholder=false;
      }
    }

    // Só atualiza adversário automaticamente em duas situações seguras:
    // 1) existe pendingFixture aguardando rival e a mesma partida agora veio definida;
    // 2) o slot não possui adversário atual.
    if(s.pendingFixture){
      const p=s.pendingFixture;
      const same=s.schedule.find((x,i)=>
        (p.scheduleIndex===i) ||
        (p.dateTime && x.dateTime && p.dateTime===x.dateTime) ||
        (p.round!==null && p.round!==undefined && Number(x.round)===Number(p.round) && x.competitionType===p.competitionType)
      );
      if(same && !isPendingConditional(same) && realOpponent(same.opponent)){
        const idx=s.schedule.indexOf(same);
        setNextFromRow(s,same,idx,{manual:false});
      }
    }else if(!realOpponent(s.opponent?.teamName)){
      // Não adivinha: só preenche se houver uma primeira partida FUTURA claramente definida.
      const future=s.schedule
        .map((x,i)=>({x,i,t:parseEventTime(x)}))
        .filter(({x})=>!x.played&&!x.skipped&&!isPendingConditional(x)&&realOpponent(x.opponent))
        .sort((a,b)=>(a.t??Number.MAX_SAFE_INTEGER)-(b.t??Number.MAX_SAFE_INTEGER));
      if(future[0])setNextFromRow(s,future[0].x,future[0].i,{manual:false});
    }

    s.lastAnalysisAt=new Date().toISOString();
  };

  // Prompt do calendário: conditional=true SOMENTE se adversário ainda não estiver definido.
  const oldPrompt=typeof v21Prompt==='function'?v21Prompt:null;
  if(oldPrompt){
    v21Prompt=function(ocr,mode){
      let p=oldPrompt(ocr,mode);
      if(mode==='calendar'){
        p+=`
REGRA CRÍTICA DE CALENDÁRIO:
- conditional=true SOMENTE quando a partida/copa ainda não tem adversário confirmado.
- Se um adversário real estiver claramente visível, conditional=false.
- Não invente nomes para cards vazios. Se não houver adversário, opponent=null.
- Preserve a ordem/data real mostrada no calendário.`;
      }
      if(mode==='result'){
        p+=`
REGRA CRÍTICA DE RESULTADO:
- O nome do adversário é apenas informativo.
- Se não estiver perfeitamente legível, use null.
- Nunca invente nome de time.`;
      }
      return p;
    };
  }

  // ------------------------------------------------------------
  // EDITAR CALENDÁRIO — botão real em cada linha
  // ------------------------------------------------------------
  window.editCalendarMatch=function(index){
    const s=selectedSlot();
    const x=s.schedule?.[index];
    if(!x){toast('Partida não encontrada');return}

    const dt=x.dateTime
      ? new Date(new Date(x.dateTime).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16)
      : '';

    openModal(`<h2>Editar partida · Slot ${s.slotNumber}</h2>
      <div class="field-edit">
        <label>Adversário
          <input id="ecOpp" value="${e(x.opponent||'')}" placeholder="A definir">
        </label>
        <label>Local
          <select id="ecVenue">
            <option value="">NI</option>
            <option>Casa</option>
            <option>Fora</option>
          </select>
        </label>
        <label>Data/hora
          <input id="ecDate" type="datetime-local" value="${e(dt)}">
        </label>
        <label class="check">
          <input id="ecConditional" type="checkbox" ${x.conditional?'checked':''}>
          <span>Aguardando definição / condicional</span>
        </label>
        <div class="actions">
          <button class="btn" onclick="saveCalendarMatch(${index},false)">Salvar linha</button>
          <button class="btn ghost" onclick="saveCalendarMatch(${index},true)">Usar como próximo jogo</button>
        </div>
      </div>`);
    const sel=document.getElementById('ecVenue');
    if(sel)sel.value=x.venue||'';
  };

  window.saveCalendarMatch=function(index,useAsNext){
    const s=selectedSlot();
    const x=s.schedule?.[index];
    if(!x)return;

    const opp=document.getElementById('ecOpp')?.value?.trim()||null;
    const venue=document.getElementById('ecVenue')?.value||null;
    const dt=document.getElementById('ecDate')?.value||'';
    const conditional=!!document.getElementById('ecConditional')?.checked;

    x.opponent=opp;
    x.venue=venue;
    x.dateTime=dt?new Date(dt).toISOString():x.dateTime||null;
    x.conditional=conditional;
    x.placeholder=!opp;

    if(useAsNext){
      if(!realOpponent(opp)){
        toast('Informe um adversário válido para usar como próximo jogo');
        return;
      }
      x.conditional=false;
      x.placeholder=false;
      setNextFromRow(s,x,index,{manual:true});
    }

    localStorage.setItem(STATE_KEY,JSON.stringify(state));
    closeModal();
    renderAll();
    toast(useAsNext?'Próximo jogo atualizado':'Linha do calendário salva');
  };

  calendarTableHtml=function(rows){
    return `<div class="calendar-wrap">
      <table class="simple-table calendar-table clean-calendar">
        <thead>
          <tr><th>Rod.</th><th>Local</th><th>Adversário</th><th>Data/hora</th><th>Status</th><th>Ação</th></tr>
        </thead>
        <tbody>${(rows||[]).map((x,i)=>`
          <tr>
            <td>${e(x.round)}</td>
            <td>${e(x.venue)}</td>
            <td>${e(realOpponent(x.opponent)?x.opponent:'A definir')}</td>
            <td>${e(x.dateTime?fmtDate(x.dateTime):`${x.dateText||'NI'} ${x.timeText||''}`)}</td>
            <td>${x.played
              ? `<span class="result-badge ${String(x.outcome||'').toUpperCase()==='V'?'win':String(x.outcome||'').toUpperCase()==='E'?'draw':'loss'}">${e(calendarOutcomeLabel(x))}</span>${x.result?` · ${e(x.result)}`:''}`
              : x.skipped?'Ignorado':x.conditional?'Condicional':'Futuro'
            }</td>
            <td><button class="btn ghost tiny calendar-edit-btn" onclick="editCalendarMatch(${i})">Editar</button></td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
  };

  // ------------------------------------------------------------
  // ELENCO — não perde linhas durante rolagem
  // ------------------------------------------------------------
  const originalExtract=v21ExtractVideoFrames;
  v21ExtractVideoFrames=async function(file,maxFrames=20){
    if(analysisMode!=='market')return originalExtract(file,maxFrames);

    const url=URL.createObjectURL(file),v=document.createElement('video');
    v.src=url;v.muted=true;v.playsInline=true;v.preload='metadata';
    await new Promise((res,rej)=>{
      v.onloadedmetadata=res;
      v.onerror=()=>rej(new Error(`Não consegui abrir ${file.name}`));
      try{v.load()}catch{}
    });

    const dur=Math.max(.2,v.duration||1);
    const total=32;
    const frames=[];
    for(let i=0;i<total;i++){
      const t=Math.min(dur-.08,Math.max(.08,dur*(i+.5)/total));
      await v21SeekVideo(v,t);
      const f=v21CaptureVideoFrame(v,t,file.name);
      f.score=100;
      frames.push(f);
    }
    URL.revokeObjectURL(url);
    return frames;
  };

  function marketEvidence(frames,n=18){
    const sorted=[...(frames||[])].sort((a,b)=>(a.time||0)-(b.time||0));
    if(sorted.length<=n)return sorted;
    const out=[];
    for(let i=0;i<n;i++){
      const idx=Math.round(i*(sorted.length-1)/Math.max(1,n-1));
      if(sorted[idx]&&!out.includes(sorted[idx]))out.push(sorted[idx]);
    }
    return out;
  }

  const originalAnalyze=v21Analyze;
  v21Analyze=async function(files){
    if(analysisMode!=='market')return originalAnalyze(files);

    const slotNo=Number(document.getElementById('analysisSlot')?.value)||state.selectedSlot;
    state.selectedSlot=slotNo;
    const video=files.find(f=>String(f.type||'').startsWith('video/'));
    const images=files.filter(f=>String(f.type||'').startsWith('image/'));
    let frames=[];

    setProgress(5,'Capturando toda a rolagem do elenco…');
    if(video)frames=await v21ExtractVideoFrames(video,32);
    else if(images.length){
      for(const f of images)frames.push(await v21ImageToFrame(f));
    }else throw new Error('Selecione um vídeo ou imagens do OSM.');

    v21RenderEvidence(frames);
    setProgress(18,`OCR em ${frames.length} quadro(s)…`);
    const ocr=await v21RunLocalOcr(frames);
    const evidence=marketEvidence(frames,18);

    setProgress(58,'Consolidando jogadores…');
    const result=await v21AnalyzePackage(ocr,evidence,'market');
    v21ApplyRoster(result);
    saveState();
    renderMarket();

    const s=selectedSlot();
    const count=(s.roster||[]).length;
    const expected=Number(s.myTeam?.playerCount);
    const warning=Number.isFinite(expected)&&expected>0&&count<expected;

    if(document.getElementById('analysisContent')){
      document.getElementById('analysisContent').innerHTML=
        `<div class="card" style="margin-top:12px"><h3>${warning?'Leitura incompleta':'Elenco atualizado'}</h3>
        <p class="small muted">${warning?`${count} de ${expected} jogadores reconhecidos.`:`${count} jogadores reconhecidos.`}</p></div>`;
    }

    setAnalysisRun(s,'market',warning?'warning':'success',
      warning?`${count} de ${expected} jogadores reconhecidos.`:`${count} jogadores reconhecidos.`,
      {rosterCount:count,expected:Number.isFinite(expected)?expected:null});
    setProgress(100,warning?'Revisar elenco':'Elenco atualizado');
    job(warning?'Elenco incompleto; revise antes de usar o plano.':'Elenco atualizado.','done');
  };
  window.v21Analyze=v21Analyze;

  // ------------------------------------------------------------
  // SLOTS / HOJE — simples, sem faixa extra
  // ------------------------------------------------------------
  renderSlotSwitcher=function(){
    const el=document.getElementById('slotSwitcher');
    if(!el)return;
    el.innerHTML=state.slots.map(s=>`
      <button class="slot-chip clean-slot-chip ${s.slotNumber===state.selectedSlot?'active':''}" onclick="selectSlot(${s.slotNumber})">
        <b>S${s.slotNumber}</b><span>${e(s.teamName||'Livre')}</span>
      </button>`).join('');
  };

  nextAction=function(){
    const s=selectedSlot();
    if(!s||s.status!=='active'){
      return {
        priority:`SLOT ${state.selectedSlot}`,
        title:'Slot livre',
        detail:'Configure este slot ou envie uma análise.',
        buttons:`<button class="btn" onclick="competitionModal(${state.selectedSlot})">Criar competição</button>`
      };
    }

    const pending=s.pendingFixture?.status==='awaiting_opponent';
    if(pending){
      return {
        priority:`SLOT ${s.slotNumber} · PRÓXIMA PARTIDA`,
        title:`${s.teamName||'Meu time'} · adversário a definir`,
        detail:'Há uma partida condicional/Copa antes do próximo jogo confirmado. Releia o calendário quando o adversário aparecer ou edite manualmente.',
        buttons:`<button class="btn" onclick="showView('info')">Abrir calendário</button><button class="btn ghost" onclick="showView('analyze');setAnalysisMode('calendar')">Reler calendário</button>`
      };
    }

    const miss=missingRequired(s);
    return {
      priority:`SLOT ${s.slotNumber} · ${s.competitionType||'COMPETIÇÃO'}`,
      title:`${s.teamName||'Meu time'} × ${s.opponent?.teamName||'Adversário NI'}`,
      detail:`${s.match?.venue||'Local NI'} · ${s.match?.nextMatchAt?fmtDate(s.match.nextMatchAt):'Horário NI'}${miss.length?` · ${miss.length} campo(s) pendente(s)`:''}`,
      buttons:`<button class="btn" onclick="showView('pregame')">${s.tactic?'Ver plano':'Preparar'}</button><button class="btn ghost" onclick="showView('analyze')">Analisar</button>`
    };
  };

  renderDashboard=function(){
    const s=selectedSlot(),action=nextAction();
    const hero=document.getElementById('heroAction');
    const grid=document.getElementById('slotsGrid');
    if(hero)hero.innerHTML=`<div class="priority">${e(action.priority)}</div><h2>${e(action.title)}</h2><p class="muted">${e(action.detail)}</p><div class="actions">${action.buttons}</div>`;
    if(grid){
      grid.innerHTML=s?slotCard(s):'';
      grid.classList.add('single-slot-grid');
    }
    renderRadar();
  };

  // ------------------------------------------------------------
  // APRENDIZADO por slot
  // ------------------------------------------------------------
  renderLearning=function(){
    const s=selectedSlot();
    const rows=Array.isArray(s?.results)?s.results:[];
    const w=rows.filter(r=>Number(r.gf)>Number(r.ga)).length;
    const d=rows.filter(r=>Number(r.gf)===Number(r.ga)).length;
    const l=rows.filter(r=>Number(r.gf)<Number(r.ga)).length;

    const last=s?.lastLearning||null;
    const byForm={};
    for(const r of rows){
      const f=r?.tactic?.formation||r?.context?.myFormation||'NI';
      byForm[f]??={j:0,w:0,d:0,l:0};
      byForm[f].j++;
      if(Number(r.gf)>Number(r.ga))byForm[f].w++;
      else if(Number(r.gf)===Number(r.ga))byForm[f].d++;
      else byForm[f].l++;
    }

    const target=document.getElementById('learningContent');
    if(!target)return;
    target.innerHTML=`
      <div class="card">
        <div class="section-head compact-head"><div><span class="eyebrow">SLOT ${e(s.slotNumber)}</span><h3>${e(s.teamName||'Sem time')}</h3></div></div>
        <div class="kpis">
          <div class="kpi"><span>Jogos</span><b>${rows.length}</b></div>
          <div class="kpi"><span>Vitórias</span><b>${w}</b></div>
          <div class="kpi"><span>Empates</span><b>${d}</b></div>
          <div class="kpi"><span>Derrotas</span><b>${l}</b></div>
        </div>
      </div>
      ${last?`<div class="card" style="margin-top:12px">
        <span class="eyebrow">ÚLTIMO APRENDIZADO</span>
        <h3>${e(outcomeText(last.outcome))} · ${e(last.score)}</h3>
        ${(last.notes||[]).map(x=>`<p class="small">${e(x)}</p>`).join('')}
      </div>`:''}
      ${Object.keys(byForm).length?`<div class="card" style="margin-top:12px">
        <h3>Histórico por formação</h3>
        <table class="simple-table">
          <tr><th>Formação</th><th>J</th><th>V</th><th>E</th><th>D</th></tr>
          ${Object.entries(byForm).map(([f,x])=>`<tr><td>${e(f)}</td><td>${x.j}</td><td>${x.w}</td><td>${x.d}</td><td>${x.l}</td></tr>`).join('')}
        </table>
      </div>`:''}`;
  };

  // Depois de uma análise automática de resultado, mostra o aprendizado na própria análise.
  const originalSaveState=saveState;
  // Não substitui saveState; apenas o fluxo de análise usará _lastResultUi abaixo.

  // Corrige a conclusão do modo resultado para exibir o card.
  const originalRunPending=runPendingAnalysis;
  // O original continua; o conteúdo será reconstruído depois pelo Mutation/timeout abaixo.
  document.addEventListener('click',function(ev){
    const btn=ev.target.closest?.('#analyzeNowBtn');
    if(!btn || analysisMode!=='result')return;
    setTimeout(()=>{
      const s=selectedSlot();
      if(!s?._lastResultUi)return;
      const ac=document.getElementById('analysisContent');
      if(ac)ac.innerHTML=postResultHtml(s,s._lastResultUi);
      s._lastResultUi=null;
      try{localStorage.setItem(STATE_KEY,JSON.stringify(state))}catch{}
    },1800);
  });



  // ------------------------------------------------------------
  // 2.5.1 — RESULTADO MANUAL SEM DEPENDER DE TÁTICA ATIVA
  // ------------------------------------------------------------
  window.resultModal=function(slotNo){
    const s=state.slots[slotNo-1];
    if(!s || s.status!=='active'){toast('Configure o slot primeiro');return}
    openModal(`<h2>Registrar resultado · Slot ${slotNo}</h2>
      <div class="field-edit">
        <label>Adversário
          <input id="rOpp" value="${e(s.opponent?.teamName||'')}" readonly>
        </label>
        <div class="kpis">
          <label>Meus gols<input id="rGF" type="number" min="0"></label>
          <label>Gols rival<input id="rGA" type="number" min="0"></label>
        </div>
        <label>Observação<textarea id="rNote"></textarea></label>
        <button class="btn" onclick="saveResult(${slotNo})">Salvar resultado</button>
      </div>`);
  };

  window.saveResult=function(slotNo){
    const s=state.slots[slotNo-1];
    const gf=Number(document.getElementById('rGF')?.value);
    const ga=Number(document.getElementById('rGA')?.value);
    if(!Number.isFinite(gf)||!Number.isFinite(ga)){toast('Informe o placar');return}
    const note=document.getElementById('rNote')?.value?.trim()||null;
    const done=finishResult(s,{gf,ga,score:`${gf}-${ga}`});
    if(done.entry)done.entry.note=note;
    saveState();
    closeModal();
    renderLearning();
    toast(`Resultado ${gf}-${ga} registrado no Slot ${slotNo}`);
  };

  // ------------------------------------------------------------
  // 2.5.1 — CORES DO CALENDÁRIO ROBUSTAS
  // ------------------------------------------------------------
  function calendarOutcomeCode(x){
    const raw=n(x?.outcome);
    if(['v','vitoria','vitória','win','victory'].includes(raw))return 'V';
    if(['e','empate','draw'].includes(raw))return 'E';
    if(['d','derrota','loss','defeat'].includes(raw))return 'D';

    const result=String(x?.result||'').trim();
    const m=result.match(/(\d+)\s*[-x:]\s*(\d+)/i);
    if(m){
      const a=Number(m[1]),b=Number(m[2]);
      if(a>b)return 'V';
      if(a===b)return 'E';
      return 'D';
    }
    return null;
  }
  function calendarOutcomeClass(x){
    const c=calendarOutcomeCode(x);
    return c==='V'?'win':c==='E'?'draw':c==='D'?'loss':'';
  }
  function calendarOutcomeTextSafe(x){
    const c=calendarOutcomeCode(x);
    return c==='V'?'Vitória':c==='E'?'Empate':c==='D'?'Derrota':(x?.played?'Jogado':'Futuro');
  }

  // Substitui a tabela novamente, desta vez normalizando outcome antes da cor.
  calendarTableHtml=function(rows){
    return `<div class="calendar-wrap">
      <table class="simple-table calendar-table clean-calendar">
        <thead>
          <tr><th>Rod.</th><th>Local</th><th>Adversário</th><th>Data/hora</th><th>Status</th><th>Ação</th></tr>
        </thead>
        <tbody>${(rows||[]).map((x,i)=>`
          <tr>
            <td>${e(x.round)}</td>
            <td>${e(x.venue)}</td>
            <td>${e(realOpponent(x.opponent)?x.opponent:'A definir')}</td>
            <td>${e(x.dateTime?fmtDate(x.dateTime):`${x.dateText||'NI'} ${x.timeText||''}`)}</td>
            <td>${x.played
              ? `<span class="result-badge ${calendarOutcomeClass(x)}">${e(calendarOutcomeTextSafe(x))}</span>${x.result?` · ${e(x.result)}`:''}`
              : x.skipped?'Ignorado':x.conditional?'Condicional':'Futuro'
            }</td>
            <td><button class="btn ghost tiny calendar-edit-btn" onclick="editCalendarMatch(${i})">Editar</button></td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
  };

  // ------------------------------------------------------------
  // 2.5.1 — HOJE: botão Registrar resultado sempre disponível
  // ------------------------------------------------------------
  const _cleanNextAction251=nextAction;
  nextAction=function(){
    const s=selectedSlot();
    const a=_cleanNextAction251();
    if(!s || s.status!=='active')return a;
    a.buttons += `<button class="btn ghost result-now-btn" onclick="resultModal(${s.slotNumber})">Registrar resultado</button>`;
    return a;
  };

  // ------------------------------------------------------------
  // 2.5.1 — RADAR: urgência depende do tempo até o jogo
  // ------------------------------------------------------------
  function hoursUntilMatch(s){
    const raw=s?.match?.nextMatchAt;
    if(!raw)return null;
    const t=new Date(raw).getTime()-Date.now();
    return Number.isFinite(t)?t/3600000:null;
  }

  renderRadar=function(){
    const s=selectedSlot();
    const el=document.getElementById('radarPanel');
    if(!el)return;
    if(!s || s.status!=='active'){
      el.innerHTML='';
      return;
    }

    const rows=[];
    const hrs=hoursUntilMatch(s);
    const miss=missingRequired(s);

    // Mais de 48h: não chama de urgente.
    if(miss.length){
      if(hrs!==null && hrs<=18){
        rows.push([`Completar preparação do Slot ${s.slotNumber}`,`${miss.length} campo(s) essencial(is) · jogo em ${Math.max(0,Math.round(hrs))}h`,'danger','Urgente']);
      }else if(hrs!==null && hrs<=48){
        rows.push([`Preparar Slot ${s.slotNumber}`,`${miss.length} campo(s) pendente(s) · ainda há ${Math.max(1,Math.round(hrs))}h`,'warn','Atenção']);
      }else{
        rows.push([`Preparação futura do Slot ${s.slotNumber}`,`${miss.length} campo(s) ainda podem ser completados antes do jogo${hrs!==null?` · faltam cerca de ${Math.round(hrs/24)} dia(s)`:''}`,'','Planejar']);
      }
    }else if(!s.tactic && hrs!==null && hrs<=48){
      rows.push([`Gerar tática do Slot ${s.slotNumber}`,'Dados essenciais disponíveis.','warn','Atenção']);
    }

    if(s.analysisRuns?.market?.status==='warning'){
      rows.push(['Revisar elenco',s.analysisRuns.market.message,'warn','Atenção']);
    }

    el.innerHTML=`<div class="section-head"><div><span class="eyebrow">RADAR DO SLOT ${s.slotNumber}</span><h2>Próximas ações</h2></div></div>
      <div class="card radar-list">${rows.length
        ? rows.map(r=>`<div class="radar-item"><div><b>${e(r[0])}</b><span>${e(r[1])}</span></div><span class="status ${r[2]}">${e(r[3])}</span></div>`).join('')
        : '<p class="muted">Nada urgente neste slot agora.</p>'
      }</div>`;
  };

  // ------------------------------------------------------------
  // 2.5.1 — DIRETOR: registrar compra e venda
  // ------------------------------------------------------------
  const _cleanRenderMarket251=renderMarket;
  renderMarket=function(){
    _cleanRenderMarket251();
    const s=selectedSlot();
    if(!s || s.status!=='active')return;
    const target=document.getElementById('marketContent');
    if(!target)return;

    const tx=Array.isArray(s.marketTransactions)?s.marketTransactions:[];
    target.insertAdjacentHTML('afterbegin',`
      <div class="card market-moves-card">
        <div class="section-head compact-head">
          <div><span class="eyebrow">MOVIMENTAÇÕES · SLOT ${e(s.slotNumber)}</span><h3>Atualizar elenco manualmente</h3></div>
        </div>
        <p class="small muted">Registre uma compra ou venda assim que acontecer. O Diretor recalcula o plano usando o elenco atualizado.</p>
        <div class="actions">
          <button class="btn" onclick="addBoughtPlayerModal()">+ Jogador comprado</button>
          <button class="btn ghost" onclick="sellPlayerModal()">− Jogador vendido</button>
        </div>
        ${tx.length?`<div class="market-transactions">${tx.slice(0,6).map(t=>`
          <div><b>${t.type==='buy'?'Compra':'Venda'} · ${e(t.name)}</b><span>${e(t.position||'')} ${filled(t.rating)?`· força ${e(t.rating)}`:''}</span></div>`).join('')}</div>`:''}
      </div>`);
  };

  window.addBoughtPlayerModal=function(){
    const s=selectedSlot();
    openModal(`<h2>Jogador comprado · Slot ${s.slotNumber}</h2>
      <div class="field-edit">
        <label>Nome<input id="buyName" placeholder="Nome do jogador"></label>
        <label>Posição
          <select id="buyPos">
            <option value="ATA">ATA</option>
            <option value="MEI">MEI</option>
            <option value="DEF">DEF</option>
            <option value="GOL">GOL</option>
          </select>
        </label>
        <div class="kpis">
          <label>Força<input id="buyRating" type="number" min="1" max="200"></label>
          <label>Idade<input id="buyAge" type="number" min="15" max="50"></label>
        </div>
        <label>Valor/preço (opcional)<input id="buyValue" placeholder="Ex.: 12.5M"></label>
        <button class="btn" onclick="saveBoughtPlayer()">Adicionar ao elenco e recalcular</button>
      </div>`);
  };

  window.saveBoughtPlayer=function(){
    const s=selectedSlot();
    const name=document.getElementById('buyName')?.value?.trim();
    const position=document.getElementById('buyPos')?.value;
    const rating=Number(document.getElementById('buyRating')?.value);
    const age=Number(document.getElementById('buyAge')?.value);
    const value=document.getElementById('buyValue')?.value?.trim()||null;
    if(!name){toast('Informe o nome do jogador');return}
    if(!Number.isFinite(rating)){toast('Informe a força do jogador');return}

    s.roster=Array.isArray(s.roster)?s.roster:[];
    s.roster.push({
      name,position,rating,
      age:Number.isFinite(age)?age:null,
      value,
      training:false,forSale:false,
      manualTransaction:true
    });
    s.myTeam=s.myTeam||{};
    s.myTeam.playerCount=s.roster.length;
    s.marketTransactions=Array.isArray(s.marketTransactions)?s.marketTransactions:[];
    s.marketTransactions.unshift({type:'buy',name,position,rating,at:new Date().toISOString()});
    buildMarketPlan(s);
    localStorage.setItem(STATE_KEY,JSON.stringify(state));
    closeModal();renderMarket();renderDashboard();
    toast(`${name} adicionado ao elenco`);
  };

  window.sellPlayerModal=function(){
    const s=selectedSlot();
    const roster=Array.isArray(s.roster)?s.roster:[];
    if(!roster.length){toast('Nenhum jogador no elenco');return}
    openModal(`<h2>Jogador vendido · Slot ${s.slotNumber}</h2>
      <div class="field-edit">
        <label>Jogador
          <select id="sellPlayerIndex">
            ${roster.map((p,i)=>`<option value="${i}">${e(playerNameValue(p)||'Sem nome')} · ${e(normalizePos(playerPosValue(p))||playerPosValue(p)||'NI')} · ${e(playerRatingValue(p))}</option>`).join('')}
          </select>
        </label>
        <button class="btn danger" onclick="saveSoldPlayer()">Remover do elenco e recalcular</button>
      </div>`);
  };

  window.saveSoldPlayer=function(){
    const s=selectedSlot();
    const idx=Number(document.getElementById('sellPlayerIndex')?.value);
    if(!Number.isInteger(idx)||idx<0||idx>=s.roster.length){toast('Selecione um jogador');return}
    const [p]=s.roster.splice(idx,1);
    const name=playerNameValue(p)||'Jogador';
    const position=normalizePos(playerPosValue(p))||playerPosValue(p)||null;
    const rating=playerRatingValue(p);
    s.myTeam=s.myTeam||{};
    s.myTeam.playerCount=s.roster.length;
    s.marketTransactions=Array.isArray(s.marketTransactions)?s.marketTransactions:[];
    s.marketTransactions.unshift({type:'sell',name,position,rating,at:new Date().toISOString()});
    buildMarketPlan(s);
    localStorage.setItem(STATE_KEY,JSON.stringify(state));
    closeModal();renderMarket();renderDashboard();
    toast(`${name} removido do elenco`);
  };

  // ------------------------------------------------------------
  // 2.5.1 — CALENDÁRIO: mais imagens e datas somente quando legíveis
  // ------------------------------------------------------------
  const _cleanPrompt251=v21Prompt;
  v21Prompt=function(ocr,mode){
    let p=_cleanPrompt251(ocr,mode);
    if(mode==='calendar'){
      p+=`
VALIDAÇÃO FORTE DE DATAS:
- A imagem é a fonte principal para DIA/MÊS; OCR é somente apoio.
- Leia cada data visualmente, dígito por dígito.
- Não suponha sequência de dias.
- Não transforme 28 em 27, 26 em 25 etc. por padrão de sequência.
- Se o primeiro dígito da data estiver ambíguo, use dateText=null/dateTime=null em vez de adivinhar.
- Preserve exatamente a primeira data real visível no vídeo.
- Revise especialmente a PRIMEIRA partida futura antes de responder.`;
    }
    return p;
  };

  const _cleanAnalyze251=v21Analyze;
  v21Analyze=async function(files){
    if(analysisMode!=='calendar')return _cleanAnalyze251(files);

    const slotNo=Number(document.getElementById('analysisSlot')?.value)||state.selectedSlot;
    state.selectedSlot=slotNo;
    const video=files.find(f=>String(f.type||'').startsWith('video/'));
    const images=files.filter(f=>String(f.type||'').startsWith('image/'));
    let frames=[];

    setProgress(5,'Capturando calendário com mais quadros…');
    if(video){
      // Mais cobertura para datas pequenas no calendário.
      frames=await v21ExtractVideoFrames(video,28);
    }else if(images.length){
      for(const f of images)frames.push(await v21ImageToFrame(f));
    }else throw new Error('Selecione um vídeo ou imagens do calendário.');

    v21RenderEvidence(frames);
    setProgress(18,'Lendo datas e adversários…');
    const ocr=await v21RunLocalOcr(frames);

    // 10 evidências distribuídas cronologicamente, não só as mais diferentes.
    const sorted=[...frames].sort((a,b)=>(a.time||0)-(b.time||0));
    const evidence=[];
    const wanted=Math.min(10,sorted.length);
    for(let i=0;i<wanted;i++){
      const idx=Math.round(i*(sorted.length-1)/Math.max(1,wanted-1));
      if(sorted[idx]&&!evidence.includes(sorted[idx]))evidence.push(sorted[idx]);
    }

    setProgress(58,'Validando calendário…');
    const result=await v21AnalyzePackage(ocr,evidence,'calendar');
    v21ApplyCalendar(result);
    saveState();
    renderInfo();

    const cr=(selectedSlot().schedule||[]).length;
    document.getElementById('analysisContent').innerHTML=
      `<div class="card" style="margin-top:12px"><h3>Calendário atualizado</h3><p class="small muted">${cr} partida(s) reconhecida(s). Confira a primeira data futura; se alguma data ficar NI, use Editar em vez de aceitar uma data inventada.</p></div>`;
    setAnalysisRun(selectedSlot(),'calendar',cr?'success':'warning',`${cr} partida(s) reconhecida(s).`,{count:cr});
    setProgress(100,'Calendário atualizado');
    job('Calendário atualizado.','done');
  };
  window.v21Analyze=v21Analyze;



  // ------------------------------------------------------------
  // 2.5.2 — RESULTADO CENTRALIZADO EM HOJE
  // ------------------------------------------------------------
  let pendingResultVideoFile=null;

  window.resultModal=function(slotNo){
    const s=state.slots[slotNo-1];
    if(!s || s.status!=='active'){toast('Configure o slot primeiro');return}

    pendingResultVideoFile=null;

    openModal(`<h2>Registrar resultado · Slot ${slotNo}</h2>
      <p class="small muted">${e(s.teamName||'Meu time')} × ${e(s.opponent?.teamName||'Adversário NI')}</p>

      <div class="result-register-tabs">
        <div class="result-register-block">
          <span class="eyebrow">OPÇÃO 1 · AUTOMÁTICA</span>
          <h3>Enviar vídeo do resultado</h3>
          <p class="small muted">Mostre o placar final e, se possível, estatísticas e formações. O app lê o vídeo e já registra o resultado no slot.</p>
          <input id="resultVideoInput" type="file" accept="video/*,image/*" hidden>
          <div class="actions">
            <button class="btn" onclick="chooseResultVideo(${slotNo})">Escolher vídeo/imagem</button>
            <button id="analyzeResultVideoBtn" class="btn ghost" onclick="analyzeResultVideo(${slotNo})" disabled>Analisar e registrar</button>
          </div>
          <div id="resultVideoInfo" class="small muted">Nenhuma mídia selecionada.</div>
          <div id="resultVideoProgress" class="small muted"></div>
        </div>

        <div class="result-register-divider"><span>ou</span></div>

        <div class="result-register-block">
          <span class="eyebrow">OPÇÃO 2 · MANUAL</span>
          <h3>Informar placar</h3>
          <div class="kpis">
            <label>Meus gols<input id="rGF" type="number" min="0"></label>
            <label>Gols rival<input id="rGA" type="number" min="0"></label>
          </div>
          <label>Observação<textarea id="rNote"></textarea></label>
          <button class="btn ghost" onclick="saveResult(${slotNo})">Salvar resultado manualmente</button>
        </div>
      </div>`);
  };

  window.chooseResultVideo=function(slotNo){
    const input=document.getElementById('resultVideoInput');
    if(!input)return;
    input.value='';
    input.onchange=()=>{
      const f=input.files?.[0]||null;
      pendingResultVideoFile=f;
      const info=document.getElementById('resultVideoInfo');
      const btn=document.getElementById('analyzeResultVideoBtn');
      if(f){
        if(info)info.textContent=`${f.name} · ${(f.size/1024/1024).toFixed(1)} MB`;
        if(btn)btn.disabled=false;
      }else{
        if(info)info.textContent='Nenhuma mídia selecionada.';
        if(btn)btn.disabled=true;
      }
    };
    try{
      if(typeof input.showPicker==='function')input.showPicker();
      else input.click();
    }catch{
      input.click();
    }
  };

  window.analyzeResultVideo=async function(slotNo){
    const s=state.slots[slotNo-1];
    const file=pendingResultVideoFile;
    if(!file){toast('Escolha um vídeo ou imagem do resultado');return}
    if(!localStorage.getItem(API_KEY_STORAGE)){apiModal('Configure a API Gemini antes de analisar o resultado.');return}

    const btn=document.getElementById('analyzeResultVideoBtn');
    const prog=document.getElementById('resultVideoProgress');
    if(btn){btn.disabled=true;btn.textContent='Analisando…'}
    if(prog)prog.textContent='Capturando o resultado…';

    try{
      let frames=[];
      if(String(file.type||'').startsWith('video/')){
        frames=await v21ExtractVideoFrames(file,18);
      }else if(String(file.type||'').startsWith('image/')){
        frames=[await v21ImageToFrame(file)];
      }else{
        throw new Error('Formato de mídia não suportado.');
      }

      if(prog)prog.textContent='Lendo placar e estatísticas…';
      const ocr=await v21RunLocalOcr(frames);

      // Resultado precisa de cobertura do início ao fim, sem depender apenas dos quadros "mais diferentes".
      const sorted=[...frames].sort((a,b)=>(a.time||0)-(b.time||0));
      const evidence=[];
      const wanted=Math.min(8,sorted.length);
      for(let i=0;i<wanted;i++){
        const idx=Math.round(i*(sorted.length-1)/Math.max(1,wanted-1));
        if(sorted[idx]&&!evidence.includes(sorted[idx]))evidence.push(sorted[idx]);
      }

      if(prog)prog.textContent='Interpretando resultado…';
      const data=await v21AnalyzePackage(ocr,evidence,'result');

      const gf=Number(data?.gf),ga=Number(data?.ga);
      if(!Number.isFinite(gf)||!Number.isFinite(ga)){
        throw new Error('Não consegui confirmar o placar no vídeo. Tente outro vídeo ou informe manualmente.');
      }

      const done=finishResult(s,{
        ...data,
        gf,ga,
        score:data?.score||`${gf}-${ga}`
      });

      localStorage.setItem(STATE_KEY,JSON.stringify(state));
      closeModal();
      renderAll();
      showView('learning');
      toast(`Resultado ${gf}-${ga} registrado no Slot ${slotNo}`);
    }catch(err){
      if(prog)prog.textContent=`Falha: ${err?.message||String(err)}`;
      toast(err?.message||'Falha ao analisar resultado');
      if(btn){btn.disabled=false;btn.textContent='Analisar e registrar'}
    }
  };

  // ------------------------------------------------------------
  // 2.5.2 — TÁTICA OFENSIVA PADRÃO PARA VANTAGEM MUITO GRANDE
  // ------------------------------------------------------------
  function offensiveDefaultTactic(){
    return {
      formation:'4-3-3 A',
      gamePlan:'Jogar pelas alas',
      pressure:78,
      mentality:82,
      tempo:84,
      marking:'À zona',
      offside:'Sim',
      tackling:'Normal',
      attackInstruction:'Atacar apenas',
      midfieldInstruction:'Pressionar na frente',
      defenceInstruction:'Apoiar o meio-campo',
      reason:'Tática ofensiva padrão para cenário em que o seu time é muito superior em força.',
      confidenceScore:.72,
      generatedAt:new Date().toISOString(),
      engine:'Padrão ofensivo 2.5.2'
    };
  }

  function shouldShowOffensiveDefault(s){
    const d=strengthDiff(s);
    return d!==null && d>=13;
  }

  window.toggleOffensiveDefault=function(slotNo){
    const box=document.getElementById(`offensiveDefaultBox-${slotNo}`);
    if(!box)return;
    box.classList.toggle('hidden');
  };

  window.applyOffensiveDefault=function(slotNo){
    const s=state.slots[slotNo-1];
    if(!s || !shouldShowOffensiveDefault(s)){
      toast('A tática ofensiva padrão só fica disponível quando a vantagem de força é de pelo menos 13.');
      return;
    }
    s.tactic=offensiveDefaultTactic();
    localStorage.setItem(STATE_KEY,JSON.stringify(state));
    renderAll();
    showView('pregame');
    toast('Tática ofensiva padrão aplicada');
  };

  function offensiveDefaultHtml(s){
    if(!s || !shouldShowOffensiveDefault(s))return '';
    const t=offensiveDefaultTactic();
    return `<div class="offensive-default-wrap">
      <button class="btn offensive-default-toggle" onclick="toggleOffensiveDefault(${s.slotNumber})">
        ⚡ Tática ofensiva padrão
      </button>
      <div id="offensiveDefaultBox-${s.slotNumber}" class="card offensive-default-box hidden">
        <div class="section-head compact-head">
          <div>
            <span class="eyebrow">VANTAGEM DE FORÇA ${e('+'+strengthDiff(s))}</span>
            <h3>Opção ofensiva padrão</h3>
          </div>
        </div>
        <table class="tactic-table">
          <tr><td>Formação</td><td>${e(t.formation)}</td></tr>
          <tr><td>Estilo de jogo</td><td>${e(t.gamePlan)}</td></tr>
          <tr><td>Pressão</td><td>${t.pressure}</td></tr>
          <tr><td>Estilo / Mentalidade</td><td>${t.mentality}</td></tr>
          <tr><td>Temporização / Ritmo</td><td>${t.tempo}</td></tr>
          <tr><td>Marcação</td><td>${e(t.marking)}</td></tr>
          <tr><td>Impedimento</td><td>${e(t.offside)}</td></tr>
          <tr><td>Desarme</td><td>${e(t.tackling)}</td></tr>
          <tr><td>Ataque</td><td>${e(t.attackInstruction)}</td></tr>
          <tr><td>Meio</td><td>${e(t.midfieldInstruction)}</td></tr>
          <tr><td>Defesa</td><td>${e(t.defenceInstruction)}</td></tr>
        </table>
        <p class="small muted">Use somente como atalho quando a vantagem de força for ≥ 13. A tática gerada pela análise continua sendo a principal recomendação.</p>
        <button class="btn" onclick="applyOffensiveDefault(${s.slotNumber})">Aplicar esta tática</button>
      </div>
    </div>`;
  }

  // Injeta o botão no Pré-jogo, imediatamente após a renderização normal.
  const _renderPregame252=renderPregame;
  renderPregame=function(){
    _renderPregame252();
    const s=selectedSlot();
    const target=document.getElementById('pregameContent');
    if(!target || !s || s.status!=='active')return;
    const html=offensiveDefaultHtml(s);
    if(html)target.insertAdjacentHTML('beforeend',html);
  };

  // Injeta também na tela Analisar depois de concluir a leitura da partida.
  const _runPending252=runPendingAnalysis;
  runPendingAnalysis=async function(){
    await _runPending252();
    if(analysisMode!=='tactic')return;
    const s=selectedSlot();
    const target=document.getElementById('analysisContent');
    if(!target || !s)return;
    const html=offensiveDefaultHtml(s);
    if(html && !document.getElementById(`offensiveDefaultBox-${s.slotNumber}`)){
      target.insertAdjacentHTML('beforeend',html);
    }
  };
  window.runPendingAnalysis=runPendingAnalysis;

  // ------------------------------------------------------------
  // INICIALIZAÇÃO — NÃO altera adversário/rodada/calendário
  // ------------------------------------------------------------
  try{
    // Remove qualquer faixa visual criada por hotfix antigo, caso tenha ficado no DOM.
    document.getElementById('activeSlotBanner')?.remove();
    localStorage.setItem('osm_ai_coach_clean_fix',CLEAN_VERSION);
    renderAll();
    renderAnalysisStatus();
  }catch(err){
    console.error('Clean fix 2.5.0',err);
  }
})();
