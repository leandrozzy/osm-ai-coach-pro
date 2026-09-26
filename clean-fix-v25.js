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
  const CLEAN_VERSION='2.5.0';

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
