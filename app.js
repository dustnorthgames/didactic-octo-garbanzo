(function(){
  const D=window.USHER_REFERENDUM_DATA;
  const KEY="usherReferendumV4";
  const CACHE_KEY="usherReferendumConstituencies650";
  const CACHE_TIME="usherReferendumConstituencies650At";
  const CHANNEL="usher-referendum-v4-live";
  const bc=("BroadcastChannel" in window)?new BroadcastChannel(CHANNEL):null;

  let audioCtx=null;
  let soundEnabled=false;
  let lastSoundNonce=null;
  let countdownTimer=null;

  const $=(s,e=document)=>e.querySelector(s);
  const $$=(s,e=document)=>[...e.querySelectorAll(s)];
  const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const comma=n=>Number(n||0).toLocaleString();
  const pct=n=>Number(n||0).toFixed(1)+"%";

  function seed(str){
    let h=2166136261;
    for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}
    return ((h>>>0)%100000)/100000;
  }

  function defaultState(){
    return {
      year:2026,
      theme:"auto",
      inTarget:48,
      turnoutTarget:71,
      currentScene:"opening",
      constituencies:[],
      results:{},
      declared:[],
      history:[],
      lastDeclared:null,
      ticker:"Usher decides whether to remain in the UK or become independent.",
      headline:"Referendum night develops across Usher",
      declarationOrder:"alphabetical",
      countdownValue:null,
      soundEvent:null,
      revision:1
    };
  }

  function getState(){
    try{
      const raw=JSON.parse(localStorage.getItem(KEY));
      return raw?{...defaultState(),...raw}:defaultState();
    }catch(e){return defaultState();}
  }

  function saveState(state,sting=null){
    state.revision=(state.revision||0)+1;
    if(sting) state.soundEvent={name:sting,nonce:Date.now()+Math.random()};
    localStorage.setItem(KEY,JSON.stringify(state));
    if(bc) bc.postMessage({type:"state",revision:state.revision});
    window.dispatchEvent(new CustomEvent("usher-referendum-state"));
  }

  async function fetchJSON(url){
    const r=await fetch(url,{headers:{"Accept":"application/json"}});
    if(!r.ok) throw new Error("HTTP "+r.status);
    return r.json();
  }

  async function loadAllConstituencies(force=false){
    const now=Date.now();

    if(!force){
      try{
        const cached=JSON.parse(localStorage.getItem(CACHE_KEY));
        const at=Number(localStorage.getItem(CACHE_TIME)||0);
        if(Array.isArray(cached)&&cached.length===650&&now-at<7*86400000) return cached;
      }catch(e){}
    }

    const base=D.api.constituencySearch;
    const take=D.api.pageSize;
    const first=await fetchJSON(`${base}?skip=0&take=${take}`);
    const total=first.totalResults||650;
    let rows=(first.items||[]).map(x=>x.value).filter(x=>x&&x.name);

    const jobs=[];
    for(let skip=take;skip<total;skip+=take){
      jobs.push(fetchJSON(`${base}?skip=${skip}&take=${take}`));
    }

    const pages=await Promise.all(jobs);
    pages.forEach(page=>{
      rows.push(...(page.items||[]).map(x=>x.value).filter(x=>x&&x.name));
    });

    rows=rows
      .sort((a,b)=>a.name.localeCompare(b.name))
      .slice(0,650)
      .map((x,i)=>({id:x.id??i+1,name:x.name,index:i}));

    if(rows.length!==650) throw new Error(`Expected 650 areas but received ${rows.length}`);

    localStorage.setItem(CACHE_KEY,JSON.stringify(rows));
    localStorage.setItem(CACHE_TIME,String(now));
    return rows;
  }

  function generateReferendum(state){
    state.results={};

    state.constituencies.forEach((area,i)=>{
      const local=(seed(`${state.year}|${area.name}|local`)-.5)*28;
      const regionish=(seed(`${area.name.split(" ")[0]}|regional`)-.5)*8;
      const inPct=clamp(Number(state.inTarget)+local+regionish,18,82);
      const turnout=clamp(Number(state.turnoutTarget)+(seed(`turnout|${area.name}|${state.year}`)-.5)*20,36,91);

      const electorate=Math.round(49000+seed(`electorate|${area.name}`)*33000);
      const votes=Math.round(electorate*turnout/100);
      const inVotes=Math.round(votes*inPct/100);
      const outVotes=votes-inVotes;

      state.results[area.id]={
        inVotes,
        outVotes,
        votes,
        electorate,
        inPct:inVotes/votes*100,
        outPct:outVotes/votes*100,
        turnout,
        winner:inVotes>=outVotes?"IN":"OUT",
        margin:Math.abs(inVotes-outVotes)
      };
    });

    state.declared=[];
    state.history=[];
    state.lastDeclared=null;
    state.currentScene="opening";
    state.countdownValue=null;
    return state;
  }

  function declaredTotals(state,full=false){
    const areas=state.constituencies.filter(a=>full||state.declared.includes(a.id));
    let inVotes=0,outVotes=0,electorate=0,votes=0,inAreas=0,outAreas=0;

    areas.forEach(a=>{
      const r=state.results[a.id];
      if(!r)return;
      inVotes+=r.inVotes;outVotes+=r.outVotes;electorate+=r.electorate;votes+=r.votes;
      if((full||state.declared.includes(a.id))&&r.winner==="IN")inAreas++;
      if((full||state.declared.includes(a.id))&&r.winner==="OUT")outAreas++;
    });

    const totalVotes=inVotes+outVotes;
    return {
      inVotes,outVotes,electorate,votes,
      inPct:totalVotes?inVotes/totalVotes*100:Number(state.inTarget),
      outPct:totalVotes?outVotes/totalVotes*100:100-Number(state.inTarget),
      turnout:electorate?votes/electorate*100:Number(state.turnoutTarget),
      inAreas,outAreas,
      count:areas.length
    };
  }

  function projectedTotals(state){
    return declaredTotals(state,true);
  }

  function themeKey(state){
    return state.theme==="auto"?D.themeForYear(Number(state.year)):state.theme;
  }

  function applyTheme(state){
    const stage=$("#presentation");
    if(!stage)return;
    const key=themeKey(state),t=D.themes[key];
    stage.className=`presentation-stage ${t.className}`;
    $("#eraChip").textContent=t.label.toUpperCase();
    $("#yearChip").textContent=state.year;
  }

  function buildHexMap(state){
    return state.constituencies.map(area=>{
      const declared=state.declared.includes(area.id);
      const r=state.results[area.id];
      let bg="#dfe5ed";
      if(declared&&r) bg=r.winner==="IN"?D.side.IN.colour:D.side.OUT.colour;
      const label=declared&&r?`${area.name}: ${r.winner} ${pct(r.winner==="IN"?r.inPct:r.outPct)}`:`${area.name}: undeclared`;
      return `<button class="hex-seat ${declared?"declared":"undeclared"}" data-seat="${area.id}" style="background:${bg}" title="${esc(label)}" aria-label="${esc(label)}"></button>`;
    }).join("");
  }

  function projectionHTML(state,final=false){
    const full=projectedTotals(state);
    const winner=full.inPct>=full.outPct?"IN":"OUT";
    const side=D.side[winner];
    const winnerPct=winner==="IN"?full.inPct:full.outPct;

    return `<div class="slide projection-stage slam-in">
      <div class="projection-card">
        <div class="projection-header">USHER PROJECTION</div>
        <div class="projection-body" style="--winner-colour:${side.colour};--winner-text:${side.text}">
          <div class="projection-small">UH VOTES</div>
          <div class="projection-big">${winner}</div>
          <div class="projection-detail">${final?"FINAL RESULT":"PROJECTED RESULT"} · ${pct(winnerPct)}</div>
          <div class="projection-split">
            <span>IN ${pct(full.inPct)}</span>
            <span>OUT ${pct(full.outPct)}</span>
          </div>
        </div>
      </div>
    </div>`;
  }

  function openingHTML(state){
    return `<div class="slide fade-in"><div class="hero">
      <div class="slide-kicker">${state.year} · Usher Independence Referendum</div>
      <div class="slide-title">Referendum Night</div>
      <div class="slide-subtitle">650 constituency declaration areas decide whether Usher remains in the United Kingdom or becomes independent.</div>
      <div class="result-split">
        <div class="result-side in"><span>IN</span><strong>REMAIN</strong><small>Remain in the United Kingdom</small></div>
        <div class="result-side out"><span>OUT</span><strong>LEAVE</strong><small>Usher becomes independent</small></div>
      </div>
    </div></div>`;
  }

  function countdownHTML(state){
    return `<div class="slide slam-in"><div class="countdown-wrap">
      <div class="countdown-kicker">USHER PROJECTION IN</div>
      <div class="countdown-number">${state.countdownValue??10}</div>
      <div class="countdown-footer">POLLS CLOSED · STAND BY</div>
    </div></div>`;
  }

  function nationalHTML(state,full=false){
    const t=declaredTotals(state,full);
    return `<div class="slide rise-in"><div class="hero">
      <div class="slide-kicker">${full?"Final national result":"National result so far"}</div>
      <div class="slide-title">${full?"Usher Has Decided":"The National Picture"}</div>
      <div class="result-split">
        <div class="result-side in">
          <span>IN</span><strong class="odometer" data-final="${t.inPct.toFixed(1)}">${pct(t.inPct)}</strong>
          <small>${comma(t.inVotes)} votes · ${t.inAreas} constituency wins</small>
        </div>
        <div class="result-side out">
          <span>OUT</span><strong class="odometer" data-final="${t.outPct.toFixed(1)}">${pct(t.outPct)}</strong>
          <small>${comma(t.outVotes)} votes · ${t.outAreas} constituency wins</small>
        </div>
      </div>
      <div class="stat-grid">
        <div class="stat-tile"><span>Declared</span><strong>${full?650:state.declared.length}</strong></div>
        <div class="stat-tile"><span>Remaining</span><strong>${full?0:650-state.declared.length}</strong></div>
        <div class="stat-tile"><span>Turnout</span><strong>${pct(t.turnout)}</strong></div>
        <div class="stat-tile"><span>Leader</span><strong>${t.inPct>=t.outPct?"IN":"OUT"}</strong></div>
      </div>
    </div></div>`;
  }

  function mapHTML(state){
    const t=declaredTotals(state,false);
    return `<div class="slide fade-in">
      <div class="parliament-layout">
        <div>
          <div class="slide-kicker">650 constituency declarations</div>
          <div class="slide-title">Referendum Map</div>
          <div class="slide-subtitle">Yellow = IN · Blue = OUT · Grey = undeclared.</div>
          <div class="stat-grid" style="grid-template-columns:1fr 1fr">
            <div class="stat-tile"><span>IN areas</span><strong>${t.inAreas}</strong></div>
            <div class="stat-tile"><span>OUT areas</span><strong>${t.outAreas}</strong></div>
          </div>
        </div>
        <div>
          <div class="hex-map presentation-map">${buildHexMap(state)}</div>
          <div class="map-caption">${state.declared.length} of 650 declared</div>
        </div>
      </div>
    </div>`;
  }

  function declarationHTML(state){
    const area=state.constituencies.find(x=>x.id===state.lastDeclared);
    if(!area)return nationalHTML(state,false);
    const r=state.results[area.id];
    const side=D.side[r.winner];

    return `<div class="slide rise-in">
      <div class="declaration-result">
        <div>
          <div class="slide-kicker">Constituency declaration</div>
          <div class="declaration-name">${esc(area.name)}</div>
          <div class="slide-subtitle" style="margin-top:14px">
            ${pct(r.turnout)} turnout · margin ${comma(r.margin)}
          </div>
          <div class="result-split" style="margin-top:22px">
            <div class="result-side in"><span>IN</span><strong>${pct(r.inPct)}</strong><small>${comma(r.inVotes)} votes</small></div>
            <div class="result-side out"><span>OUT</span><strong>${pct(r.outPct)}</strong><small>${comma(r.outVotes)} votes</small></div>
          </div>
          <div class="recent-strip">
            ${state.history.slice(0,5).map(h=>`<span class="recent-pill">${esc(h.name)} · <b>${h.winner}</b></span>`).join("")}
          </div>
        </div>

        <div class="declaration-winner" style="--winner-colour:${side.colour};--winner-text:${side.text}">
          <small>CONSTITUENCY VOTES</small>
          <b>${r.winner}</b>
          <strong>${pct(r.winner==="IN"?r.inPct:r.outPct)}</strong>
        </div>
      </div>
    </div>`;
  }

  function turnoutHTML(state){
    const t=declaredTotals(state,false);
    return `<div class="slide rise-in"><div class="hero">
      <div class="slide-kicker">Referendum turnout</div>
      <div class="slide-title">${pct(t.turnout)}</div>
      <div class="slide-subtitle">Current turnout across ${state.declared.length} declared constituency areas.</div>
      <div class="stat-grid">
        <div class="stat-tile"><span>Votes counted</span><strong>${comma(t.votes)}</strong></div>
        <div class="stat-tile"><span>IN votes</span><strong>${comma(t.inVotes)}</strong></div>
        <div class="stat-tile"><span>OUT votes</span><strong>${comma(t.outVotes)}</strong></div>
        <div class="stat-tile"><span>Declared</span><strong>${state.declared.length}</strong></div>
      </div>
    </div></div>`;
  }

  function analysisHTML(state){
    const t=declaredTotals(state,false);
    const leader=t.inPct>=t.outPct?"IN":"OUT";
    const lead=Math.abs(t.inPct-t.outPct);
    return `<div class="slide fade-in"><div class="hero">
      <div class="slide-kicker">Referendum analysis</div>
      <div class="slide-title">State of the Count</div>
      <div class="slide-subtitle">${leader} currently leads among counted votes by ${lead.toFixed(1)} percentage points.</div>
      <div class="stat-grid">
        <div class="stat-tile"><span>IN</span><strong>${pct(t.inPct)}</strong></div>
        <div class="stat-tile"><span>OUT</span><strong>${pct(t.outPct)}</strong></div>
        <div class="stat-tile"><span>Declared</span><strong>${state.declared.length}</strong></div>
        <div class="stat-tile"><span>Remaining</span><strong>${650-state.declared.length}</strong></div>
      </div>
    </div></div>`;
  }

  function breakingHTML(state){
    return `<div class="slide rise-in"><div class="hero">
      <div class="breaking-chip">Breaking News</div>
      <div class="breaking-title">${esc(state.headline)}</div>
      <div class="slide-subtitle">${esc(state.ticker)}</div>
    </div></div>`;
  }

  function renderPresentation(){
    const state=getState();
    if(!$("#slideMount"))return;

    applyTheme(state);

    const current=declaredTotals(state,false);
    $("#tickerText").textContent=state.ticker;
    $("#declaredFooter").textContent=`${state.declared.length} / 650 declared`;
    $("#nationalFooter").textContent=`IN ${pct(current.inPct)} · OUT ${pct(current.outPct)}`;
    $("#leaderFooter").textContent=state.declared.length?`Leader: ${current.inPct>=current.outPct?"IN":"OUT"}`:"Leader: —";

    let html;
    switch(state.currentScene){
      case "countdown": html=countdownHTML(state);break;
      case "projection": html=projectionHTML(state,false);break;
      case "winner": html=projectionHTML(state,true);break;
      case "map": html=mapHTML(state);break;
      case "national": html=nationalHTML(state,false);break;
      case "final": html=nationalHTML(state,true);break;
      case "declaration": html=declarationHTML(state);break;
      case "turnout": html=turnoutHTML(state);break;
      case "analysis": html=analysisHTML(state);break;
      case "breaking": html=breakingHTML(state);break;
      default: html=openingHTML(state);
    }

    $("#slideMount").innerHTML=html;
  }

  function ensureAudio(){
    if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    if(audioCtx.state==="suspended") audioCtx.resume();
    soundEnabled=true;
  }

  function tone(freq,start,dur,vol=.05,type="sine"){
    if(!soundEnabled)return;
    const o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.type=type;
    o.frequency.setValueAtTime(freq,audioCtx.currentTime+start);
    g.gain.setValueAtTime(.0001,audioCtx.currentTime+start);
    g.gain.linearRampToValueAtTime(vol,audioCtx.currentTime+start+.018);
    g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+start+dur);
    o.connect(g);g.connect(audioCtx.destination);
    o.start(audioCtx.currentTime+start);
    o.stop(audioCtx.currentTime+start+dur+.03);
  }

  function playSting(name){
    if(!soundEnabled)return;
    const seq={
      intro:[[196,0,.18],[247,.12,.2],[294,.26,.28],[392,.44,.48]],
      projection:[[220,0,.15],[330,.11,.2],[440,.24,.26],[660,.43,.45]],
      declaration:[[330,0,.12],[494,.1,.17],[659,.21,.26]],
      breaking:[[130,0,.16],[130,.2,.16],[196,.4,.26],[262,.58,.34]],
      winner:[[196,0,.2],[247,.12,.2],[330,.25,.25],[392,.39,.25],[494,.55,.52]],
      countdown:[[880,0,.11]]
    }[name]||[[440,0,.14]];

    seq.forEach(([f,s,d],i)=>tone(f,s,d,i===seq.length-1?.07:.045,i%2?"triangle":"sine"));
  }

  function maybePlaySound(state){
    const e=state.soundEvent;
    if(e&&e.nonce!==lastSoundNonce){
      lastSoundNonce=e.nonce;
      playSting(e.name);
    }
  }

  function declareArea(state,id){
    if(state.declared.includes(id))return state;
    const area=state.constituencies.find(x=>x.id===id);
    const r=state.results[id];
    if(!area||!r)return state;

    state.declared.push(id);
    state.lastDeclared=id;
    state.history.unshift({
      id,
      name:area.name,
      winner:r.winner,
      inPct:r.inPct,
      outPct:r.outPct,
      order:state.declared.length
    });
    state.history=state.history.slice(0,100);
    state.currentScene="declaration";
    return state;
  }

  function orderedOpenAreas(state){
    let rows=state.constituencies.filter(a=>!state.declared.includes(a.id));

    if(state.declarationOrder==="random"){
      rows.sort((a,b)=>seed(`order|${a.name}|${state.revision}`)-seed(`order|${b.name}|${state.revision}`));
    }else if(state.declarationOrder==="closest"){
      rows.sort((a,b)=>(state.results[a.id]?.margin||999999)-(state.results[b.id]?.margin||999999));
    }else if(state.declarationOrder==="landslide"){
      rows.sort((a,b)=>(state.results[b.id]?.margin||0)-(state.results[a.id]?.margin||0));
    }else{
      rows.sort((a,b)=>a.name.localeCompare(b.name));
    }

    return rows;
  }

  function startCountdown(){
    if(countdownTimer)clearInterval(countdownTimer);

    let state=getState();
    state.currentScene="countdown";
    state.countdownValue=10;
    saveState(state,"intro");

    let n=10;
    countdownTimer=setInterval(()=>{
      n--;
      const s=getState();
      s.countdownValue=n;
      s.currentScene=n>0?"countdown":"projection";
      saveState(s,n>0?"countdown":"projection");

      if(n<=0){
        clearInterval(countdownTimer);
        countdownTimer=null;
      }
    },1000);
  }

  function renderTargetLabels(){
    const i=Number($("#inTarget").value);
    const o=100-i;
    $("#inTargetOutput").textContent=pct(i);
    $("#outTargetOutput").textContent=pct(o);
    $("#outRangeFill").style.width=`${o}%`;
    $("#turnoutTargetOutput").textContent=pct($("#turnoutTarget").value);
  }

  function renderLiveControl(){
    const state=getState();
    const t=declaredTotals(state,false);

    $("#declarationCount").textContent=`${state.declared.length} / ${state.constituencies.length||650}`;
    $("#liveInPct").textContent=pct(t.inPct);
    $("#liveOutPct").textContent=pct(t.outPct);
    $("#liveInAreas").textContent=`${t.inAreas} areas`;
    $("#liveOutAreas").textContent=`${t.outAreas} areas`;
    $("#liveDeclared").textContent=state.declared.length;
    $("#liveInBar").style.width=`${t.inPct}%`;
    $("#liveOutBar").style.width=`${t.outPct}%`;
  }

  function renderHistory(){
    const state=getState();
    const box=$("#historyList");
    if(!box)return;

    box.innerHTML=state.history.length?state.history.map(h=>{
      const colour=h.winner==="IN"?D.side.IN.colour:D.side.OUT.colour;
      const text=h.winner==="IN"?"#111":"#082f70";
      return `<div class="history-entry">
        <span>${h.order}. ${esc(h.name)}</span>
        <b style="color:${text}">${h.winner}</b>
      </div>`;
    }).join(""):`<div class="muted">No declarations yet.</div>`;
  }

  function renderDeclarationList(){
    const state=getState();
    const box=$("#declarationList");
    if(!box)return;

    const q=($("#seatSearch")?.value||"").trim().toLowerCase();
    const filter=$("#seatFilter")?.value||"all";

    let rows=state.constituencies.filter(a=>!q||a.name.toLowerCase().includes(q));
    rows=rows.filter(a=>{
      const declared=state.declared.includes(a.id);
      const r=state.results[a.id];

      if(filter==="undeclared")return !declared;
      if(filter==="declared")return declared;
      if(filter==="in")return declared&&r?.winner==="IN";
      if(filter==="out")return declared&&r?.winner==="OUT";
      return true;
    });

    box.innerHTML=rows.map(area=>{
      const declared=state.declared.includes(area.id);
      const r=state.results[area.id];
      const klass=declared?(r?.winner==="IN"?"declared-in":"declared-out"):"";
      const winner=declared?r?.winner:"—";

      return `<button class="declaration-item ${klass}" data-seat="${area.id}">
        <span>${esc(area.name)}</span><b>${winner}</b>
      </button>`;
    }).join("");

    $$(".declaration-item",box).forEach(btn=>{
      btn.onclick=()=>{
        let s=getState();
        s=declareArea(s,Number(btn.dataset.seat));
        saveState(s,"declaration");
        renderControl();
      };
    });
  }

  function renderControlMap(){
    const state=getState();
    const box=$("#controlHexMap");
    if(!box)return;

    box.innerHTML=buildHexMap(state);
    const tip=$("#mapTooltip");

    $$(".hex-seat",box).forEach(hex=>{
      hex.addEventListener("mousemove",e=>{
        const id=Number(hex.dataset.seat);
        const area=state.constituencies.find(x=>x.id===id);
        const r=state.results[id];
        const declared=state.declared.includes(id);

        tip.innerHTML=declared&&r
          ? `<b>${esc(area?.name)}</b><br>${r.winner} · IN ${pct(r.inPct)} / OUT ${pct(r.outPct)}`
          : `<b>${esc(area?.name)}</b><br>Undeclared`;

        tip.style.left=(e.clientX+14)+"px";
        tip.style.top=(e.clientY+14)+"px";
        tip.classList.remove("hidden");
      });

      hex.addEventListener("mouseleave",()=>tip.classList.add("hidden"));

      hex.addEventListener("click",()=>{
        let s=getState();
        s=declareArea(s,Number(hex.dataset.seat));
        saveState(s,"declaration");
        renderControl();
      });
    });
  }

  function renderControl(){
    renderLiveControl();
    renderHistory();
    renderDeclarationList();
    renderControlMap();
  }

  function syncInputs(state){
    $("#yearSelect").value=state.year;
    $("#themeSelect").value=state.theme;
    $("#declarationOrder").value=state.declarationOrder;
    $("#inTarget").value=state.inTarget;
    $("#turnoutTarget").value=state.turnoutTarget;
    $("#tickerInput").value=state.ticker;
    $("#headlineInput").value=state.headline;
    renderTargetLabels();
  }

  async function initControlRoom(){
    let state=getState();

    D.years.forEach(y=>$("#yearSelect").insertAdjacentHTML("beforeend",`<option value="${y}">${y}</option>`));
    syncInputs(state);

    try{
      const rows=await loadAllConstituencies();
      state=getState();
      state.constituencies=rows;

      if(Object.keys(state.results||{}).length!==650){
        state=generateReferendum(state);
      }

      saveState(state);
      $("#dataStatus").textContent="650 constituency declaration areas loaded from the UK Parliament constituency service.";
    }catch(err){
      $("#dataStatus").textContent=`Could not load constituency data: ${err.message}`;
      $("#dataStatus").style.color="#b42318";
    }

    renderControl();

    $("#inTarget").oninput=renderTargetLabels;
    $("#turnoutTarget").oninput=renderTargetLabels;

    $("#yearSelect").onchange=()=>{
      const s=getState();s.year=Number($("#yearSelect").value);saveState(s);
    };
    $("#themeSelect").onchange=()=>{
      const s=getState();s.theme=$("#themeSelect").value;saveState(s);
    };
    $("#declarationOrder").onchange=()=>{
      const s=getState();s.declarationOrder=$("#declarationOrder").value;saveState(s);
    };

    $("#generateBtn").onclick=()=>{
      let s=getState();
      s.year=Number($("#yearSelect").value);
      s.theme=$("#themeSelect").value;
      s.declarationOrder=$("#declarationOrder").value;
      s.inTarget=Number($("#inTarget").value);
      s.turnoutTarget=Number($("#turnoutTarget").value);
      s.ticker=$("#tickerInput").value.trim()||s.ticker;
      s.headline=$("#headlineInput").value.trim()||s.headline;
      s=generateReferendum(s);
      saveState(s,"intro");
      renderControl();
    };

    $("#newReferendumBtn").onclick=()=>{
      if(!confirm("Reset the referendum and generate a new result?"))return;
      let s=getState();
      s=generateReferendum(s);
      saveState(s,"intro");
      renderControl();
    };

    $("#countdownBtn").onclick=startCountdown;

    $("#projectionBtn").onclick=()=>{
      const s=getState();s.currentScene="projection";saveState(s,"projection");
    };
    $("#mapBtn").onclick=()=>{
      const s=getState();s.currentScene="map";saveState(s);
    };
    $("#nationalBtn").onclick=()=>{
      const s=getState();s.currentScene="national";saveState(s);
    };
    $("#winnerBtn").onclick=()=>{
      const s=getState();s.currentScene="winner";saveState(s,"winner");
    };
    $("#breakingBtn").onclick=()=>{
      const s=getState();
      s.headline=$("#headlineInput").value.trim()||s.headline;
      s.ticker=$("#tickerInput").value.trim()||s.ticker;
      s.currentScene="breaking";
      saveState(s,"breaking");
    };
    $("#analysisBtn").onclick=()=>{
      const s=getState();s.currentScene="analysis";saveState(s);
    };
    $("#turnoutBtn").onclick=()=>{
      const s=getState();s.currentScene="turnout";saveState(s);
    };

    $$(".sting").forEach(btn=>{
      btn.onclick=()=>{
        const s=getState();
        saveState(s,btn.dataset.sting);
      };
    });

    $("#nextDeclarationBtn").onclick=()=>{
      let s=getState();
      const area=orderedOpenAreas(s)[0];
      if(!area)return;
      s=declareArea(s,area.id);
      saveState(s,"declaration");
      renderControl();
    };

    $("#randomDeclarationBtn").onclick=()=>{
      let s=getState();
      const open=s.constituencies.filter(a=>!s.declared.includes(a.id));
      if(!open.length)return;
      const area=open[Math.floor(Math.random()*open.length)];
      s=declareArea(s,area.id);
      saveState(s,"declaration");
      renderControl();
    };

    function batchDeclare(n){
      let s=getState();

      for(let i=0;i<n;i++){
        const area=orderedOpenAreas(s)[0];
        if(!area)break;
        s=declareArea(s,area.id);
      }

      s.currentScene="national";
      saveState(s,"declaration");
      renderControl();
    }

    $("#declareFiveBtn").onclick=()=>batchDeclare(5);
    $("#declareTwentyBtn").onclick=()=>batchDeclare(20);

    $("#declareAllBtn").onclick=()=>{
      let s=getState();

      orderedOpenAreas(s).forEach(area=>{
        s=declareArea(s,area.id);
      });

      s.currentScene="winner";
      saveState(s,"winner");
      renderControl();
    };

    $("#seatSearch").oninput=renderDeclarationList;
    $("#seatFilter").onchange=renderDeclarationList;

    $("#tickerInput").onchange=()=>{
      const s=getState();s.ticker=$("#tickerInput").value.trim()||s.ticker;saveState(s);
    };
    $("#headlineInput").onchange=()=>{
      const s=getState();s.headline=$("#headlineInput").value.trim()||s.headline;saveState(s);
    };

    window.addEventListener("storage",()=>renderControl());
    if(bc)bc.onmessage=()=>renderControl();
  }

  async function initPresentation(){
    let state=getState();

    if(!state.constituencies?.length){
      try{
        const rows=await loadAllConstituencies();
        state.constituencies=rows;
        state=generateReferendum(state);
        saveState(state);
      }catch(e){}
    }

    renderPresentation();

    $("#soundUnlock").onclick=()=>{
      ensureAudio();
      $("#soundUnlock").textContent="🔊 Sound enabled";
      playSting("intro");
    };

    const refresh=()=>{
      const s=getState();
      maybePlaySound(s);
      renderPresentation();
    };

    window.addEventListener("storage",refresh);
    window.addEventListener("usher-referendum-state",refresh);
    if(bc)bc.onmessage=refresh;
  }

  window.UsherReferendum={
    initControlRoom,
    initPresentation
  };
})();