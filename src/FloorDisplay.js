import React, { useState, useEffect, useRef } from "react";

const T = {
  en: {
    title:"Production Floor", startShift:"Start Shift", endShift:"End Shift",
    enterName:"Enter your name", shift1:"Shift 1 (6AM–6PM)", shift2:"Shift 2 (6PM–6AM)",
    nowProducing:"NOW PRODUCING", upNext:"UP NEXT", completedToday:"COMPLETED TODAY",
    noJobs:"No jobs in today's schedule", markDone:"✅ Mark Done",
    reportIssue:"⚠️ Report Issue", startCleaning:"🧹 Cleaning",
    doneCleaning:"✅ Cleaning Done", elapsed:"Elapsed", remaining:"Remaining",
    estimated:"Estimated", onTrack:"On Track", runningSlow:"Running Slow",
    overtime:"Over Time", cleaning:"CLEANING", issueTitle:"Select Issue",
    submit:"Submit", cancel:"Cancel", kpi:"KPI", confirmDone:"Confirm job complete?",
    yes:"Yes, Done", no:"Continue", shiftEnd:"Shift Summary",
    jobsDone:"Jobs Done", avgKPI:"Avg KPI", totalTime:"Total Time",
  },
  bn: {
    title:"উৎপাদন ফ্লোর", startShift:"শিফট শুরু করুন", endShift:"শিফট শেষ করুন",
    enterName:"আপনার নাম লিখুন", shift1:"শিফট ১ (সকাল ৬টা–সন্ধ্যা ৬টা)", shift2:"শিফট ২ (সন্ধ্যা ৬টা–সকাল ৬টা)",
    nowProducing:"এখন উৎপাদন করুন", upNext:"পরবর্তী কাজ", completedToday:"সম্পন্ন কাজ",
    noJobs:"আজকের সময়সূচিতে কোনো কাজ নেই", markDone:"✅ সম্পন্ন করুন",
    reportIssue:"⚠️ সমস্যা জানান", startCleaning:"🧹 পরিষ্কার",
    doneCleaning:"✅ পরিষ্কার শেষ", elapsed:"অতিবাহিত", remaining:"বাকি",
    estimated:"আনুমানিক", onTrack:"সঠিক সময়ে", runningSlow:"দেরি হচ্ছে",
    overtime:"সময় পার", cleaning:"পরিষ্কার চলছে", issueTitle:"সমস্যার ধরন",
    submit:"জমা দিন", cancel:"বাতিল", kpi:"কেপিআই", confirmDone:"কাজ সম্পন্ন?",
    yes:"হ্যাঁ", no:"না", shiftEnd:"শিফট সারসংক্ষেপ",
    jobsDone:"সম্পন্ন কাজ", avgKPI:"গড় কেপিআই", totalTime:"মোট সময়",
  },
};

const ISSUES = [
  {en:"Machine Breakdown",   bn:"মেশিন নষ্ট"},
  {en:"Raw Material Issue",  bn:"কাঁচামালের সমস্যা"},
  {en:"Quality Reject",      bn:"মান সম্মত নয়"},
  {en:"Power Failure",       bn:"বিদ্যুৎ বিভ্রাট"},
  {en:"Shortage of Staff",   bn:"কর্মী স্বল্পতা"},
  {en:"Safety Concern",      bn:"নিরাপত্তা সমস্যা"},
];

// Machine colour map
const MC = {"WFJ-20":"#1d4ed8","WFC-500":"#7c3aed","LG-60B":"#0891b2","ROASTED":"#b45309","GS420":"#16a34a","AFM30-T":"#dc2626"};

function fmtSecs(s) {
  const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sc=s%60;
  if(h>0) return `${h}:${String(m).padStart(2,"0")}:${String(sc).padStart(2,"0")}`;
  return `${String(m).padStart(2,"0")}:${String(sc).padStart(2,"0")}`;
}
function fmtHrs(h) {
  if(!h) return "—";
  const hr=Math.floor(h), mn=Math.round((h-hr)*60);
  return hr>0?`${hr}h ${mn}m`:`${mn}m`;
}

export default function FloorDisplay() {
  const [lang,    setLang]    = useState("en");
  const [stage,   setStage]   = useState("login");
  const [name,    setName]    = useState("");
  const [shift,   setShift]   = useState("shift1");
  const [jobs,    setJobs]    = useState([]);
  const [jobIdx,  setJobIdx]  = useState(0);
  const [mode,    setMode]    = useState("idle");
  const [elapsed, setElapsed] = useState(0);
  const [cleanEl, setCleanEl] = useState(0);
  const [done,    setDone]    = useState([]);
  const [issue,   setIssue]   = useState(null);
  const [shiftStart, setShiftStart] = useState(null);
  const timerRef = useRef(null);
  const cleanRef = useRef(null);
  const t = k => T[lang][k]||T.en[k];

  // Load ALL production jobs sorted by delivery date — no machine filter
  useEffect(()=>{
    if(stage==="floor"){
      fetch("/api/operations?type=production")
        .then(r=>r.json())
        .then(d=>{
          const sorted = (d.products||[])
            .filter(p=>p.scheduled!==false&&p.totalQty>0)
            .sort((a,b)=>{
              const da=(a.orders||[]).map(o=>o.deliveryDate).filter(Boolean).sort()[0];
              const db=(b.orders||[]).map(o=>o.deliveryDate).filter(Boolean).sort()[0];
              if(da&&db) return new Date(da)-new Date(db);
              if(da) return -1; if(db) return 1; return 0;
            });
          setJobs(sorted);
        });
    }
  },[stage]);

  useEffect(()=>{
    if(mode==="running") timerRef.current=setInterval(()=>setElapsed(e=>e+1),1000);
    else clearInterval(timerRef.current);
    return()=>clearInterval(timerRef.current);
  },[mode]);

  useEffect(()=>{
    if(mode==="cleaning") cleanRef.current=setInterval(()=>setCleanEl(e=>e+1),1000);
    else clearInterval(cleanRef.current);
    return()=>clearInterval(cleanRef.current);
  },[mode]);

  function startShift(){
    if(!name.trim()) return;
    setShiftStart(new Date()); setStage("floor"); setMode("idle");
    setElapsed(0); setDone([]); setJobIdx(0);
  }
  function startJob(){ setMode("running"); setElapsed(0); }
  function markDone(){
    const job=jobs[jobIdx];
    const actualHrs=elapsed/3600;
    const estHrs=job?.totalHrs||1;
    const kpiPct=Math.min(Math.round((estHrs/Math.max(actualHrs,0.01))*100),999);
    setDone(d=>[...d,{...job,actualHrs,estHrs,kpiPct,completedAt:new Date()}]);
    setMode("idle"); setElapsed(0); setJobIdx(i=>i+1);
  }
  function submitIssue(){
    if(!issue) return;
    fetch("/api/activity",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({type:"production_issue",operator:name,shift,issue,job:jobs[jobIdx]?.description,ts:new Date().toISOString()})
    }).catch(()=>{});
    setMode("idle"); setIssue(null);
  }
  function endShift(){
    const totalSecs=Math.floor((new Date()-shiftStart)/1000);
    fetch("/api/activity",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({type:"shift_end",operator:name,shift,jobsDone:done.length,totalMins:Math.round(totalSecs/60),avgKPI:done.length?Math.round(done.reduce((s,c)=>s+c.kpiPct,0)/done.length):0,ts:new Date().toISOString()})
    }).catch(()=>{});
    setStage("login"); setMode("idle"); setName(""); setDone([]); setJobIdx(0); setElapsed(0);
  }

  const job     = jobs[jobIdx];
  const nextJobs= jobs.slice(jobIdx+1, jobIdx+3);
  const estSecs = (job?.totalHrs||0)*3600;
  const remain  = Math.max(0,estSecs-elapsed);
  const kpiStatus = elapsed===0?"idle":elapsed<=estSecs?"on_track":elapsed<=estSecs*1.2?"runningSlow":"overtime";
  const kpiColor  = kpiStatus==="on_track"?"#16a34a":kpiStatus==="runningSlow"?"#d97706":"#dc2626";
  const customers = [...new Set((job?.orders||[]).map(o=>o.customer||o.customerName).filter(Boolean))];
  const delivery  = (job?.orders||[]).map(o=>o.deliveryDate).filter(Boolean).sort()[0];
  const daysLeft  = delivery?Math.floor((new Date(delivery)-new Date())/864e5):null;
  const mColor    = MC[job?.machine]||"#1E3A5F";

  // -- LOGIN -----------------------------------------------------------------
  if(stage==="login") return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"80vh",padding:24,background:"#F8FAFC"}}>
      <div style={{width:"100%",maxWidth:440}}>
        <div style={{display:"flex",justifyContent:"flex-end",gap:6,marginBottom:16}}>
          {[["en","EN"],["bn","বাংলা"]].map(([v,l])=>(
            <button key={v} onClick={()=>setLang(v)} style={{padding:"6px 16px",borderRadius:99,border:"none",cursor:"pointer",fontSize:13,fontWeight:700,background:lang===v?"#7c3aed":"#E2E8F0",color:lang===v?"#fff":"#64748B"}}>{l}</button>
          ))}
        </div>
        <div style={{background:"#fff",borderRadius:24,padding:"40px 36px",border:"1px solid #E2E8F0",boxShadow:"0 8px 32px rgba(15,36,66,0.10)"}}>
          <div style={{textAlign:"center",marginBottom:28}}>
            <div style={{fontSize:44,marginBottom:8}}>🏭</div>
            <div style={{fontSize:22,fontWeight:800,color:"#0F172A"}}>{t("title")}</div>
            <div style={{fontSize:13,color:"#94A3B8",marginTop:4}}>Seri Rasa Sdn Bhd</div>
          </div>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,color:"#64748B",fontWeight:700,marginBottom:6,textTransform:"uppercase"}}>{t("enterName")} / {T.bn.enterName}</div>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder={lang==="bn"?"আপনার নাম...":"Your name..."}
              onKeyDown={e=>e.key==="Enter"&&name.trim()&&startShift()}
              style={{width:"100%",padding:"13px 14px",borderRadius:10,border:"1px solid #CBD5E1",fontSize:15,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div style={{marginBottom:24}}>
            <div style={{fontSize:11,color:"#64748B",fontWeight:700,marginBottom:8,textTransform:"uppercase"}}>Shift</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[["shift1",t("shift1"),T.bn.shift1],["shift2",t("shift2"),T.bn.shift2]].map(([v,en,bn])=>(
                <button key={v} onClick={()=>setShift(v)} style={{padding:"12px 8px",borderRadius:10,border:`2px solid ${shift===v?"#1E3A5F":"#E2E8F0"}`,background:shift===v?"#1E3A5F":"#fff",color:shift===v?"#fff":"#0F172A",cursor:"pointer",fontSize:11,fontWeight:600,lineHeight:1.4}}>
                  {en}<br/><span style={{fontSize:10,opacity:0.7}}>{bn}</span>
                </button>
              ))}
            </div>
          </div>
          <button onClick={startShift} disabled={!name.trim()}
            style={{width:"100%",padding:"16px",background:name.trim()?"#1E3A5F":"#CBD5E1",border:"none",borderRadius:14,color:"#fff",fontSize:16,fontWeight:800,cursor:name.trim()?"pointer":"not-allowed"}}>
            {t("startShift")} / {T.bn.startShift} →
          </button>
        </div>
      </div>
    </div>
  );

  // -- MODALS ----------------------------------------------------------------
  const Modal = ({children}) => (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999,padding:20}}>
      <div style={{background:"#1E293B",borderRadius:20,padding:"36px 40px",maxWidth:440,width:"100%",border:"1px solid #334155"}}>
        {children}
      </div>
    </div>
  );

  // -- FLOOR -----------------------------------------------------------------
  return (
    <div style={{background:"#0F172A",minHeight:"80vh",padding:"16px 20px",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>

      {/* Modals */}
      {mode==="confirm_done" && (
        <Modal>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:44,marginBottom:12}}>✅</div>
            <div style={{fontSize:18,fontWeight:800,color:"#fff",marginBottom:6}}>{t("confirmDone")}</div>
            <div style={{fontSize:13,color:"#64748B",marginBottom:24}}>{job?.description}</div>
            <div style={{display:"flex",gap:12}}>
              <button onClick={markDone} style={{flex:1,padding:"14px",background:"#16a34a",border:"none",borderRadius:12,color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer"}}>{t("yes")} / {T.bn.yes}</button>
              <button onClick={()=>setMode("running")} style={{flex:1,padding:"14px",background:"#334155",border:"none",borderRadius:12,color:"#fff",fontSize:14,cursor:"pointer"}}>{t("no")} / {T.bn.no}</button>
            </div>
          </div>
        </Modal>
      )}

      {mode==="issue" && (
        <Modal>
          <div style={{fontSize:18,fontWeight:800,color:"#fff",marginBottom:16}}>⚠️ {t("issueTitle")} / {T.bn.issueTitle}</div>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
            {ISSUES.map(cat=>(
              <button key={cat.en} onClick={()=>setIssue(cat.en)}
                style={{padding:"12px 16px",borderRadius:10,border:`2px solid ${issue===cat.en?"#dc2626":"#334155"}`,background:issue===cat.en?"#dc262220":"#0F172A",cursor:"pointer",textAlign:"left"}}>
                <div style={{fontWeight:700,color:"#fff",fontSize:13}}>{cat.en}</div>
                <div style={{color:"#94A3B8",fontSize:12,marginTop:2}}>{cat.bn}</div>
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={submitIssue} disabled={!issue} style={{flex:1,padding:"13px",background:issue?"#dc2626":"#334155",border:"none",borderRadius:10,color:"#fff",fontSize:14,fontWeight:800,cursor:issue?"pointer":"not-allowed"}}>{t("submit")} / {T.bn.submit}</button>
            <button onClick={()=>setMode("idle")} style={{flex:1,padding:"13px",background:"#334155",border:"none",borderRadius:10,color:"#fff",fontSize:14,cursor:"pointer"}}>{t("cancel")} / {T.bn.cancel}</button>
          </div>
        </Modal>
      )}

      {mode==="confirm_end" && (
        <Modal>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:40,marginBottom:12}}>🏁</div>
            <div style={{fontSize:18,fontWeight:800,color:"#fff",marginBottom:16}}>{t("shiftEnd")} / {T.bn.shiftEnd}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:24}}>
              {[
                {l:t("jobsDone"),  v:done.length+" jobs"},
                {l:t("totalTime"), v:shiftStart?fmtHrs((new Date()-shiftStart)/3600000):"—"},
                {l:t("avgKPI"),    v:done.length?Math.round(done.reduce((s,c)=>s+c.kpiPct,0)/done.length)+"%":"—"},
              ].map(c=>(
                <div key={c.l} style={{background:"#0F172A",borderRadius:10,padding:"12px"}}>
                  <div style={{fontSize:10,color:"#64748B",textTransform:"uppercase",marginBottom:4}}>{c.l}</div>
                  <div style={{fontSize:20,fontWeight:800,color:"#fff"}}>{c.v}</div>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={endShift} style={{flex:1,padding:"13px",background:"#dc2626",border:"none",borderRadius:10,color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer"}}>{t("endShift")} / {T.bn.endShift}</button>
              <button onClick={()=>setMode("idle")} style={{flex:1,padding:"13px",background:"#334155",border:"none",borderRadius:10,color:"#fff",fontSize:14,cursor:"pointer"}}>{t("cancel")}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{color:"#fff",fontWeight:800,fontSize:16}}>{name} · {shift==="shift1"?t("shift1"):t("shift2")}</div>
          <div style={{color:"#475569",fontSize:12}}>{new Date().toLocaleDateString("en-MY",{weekday:"long",day:"numeric",month:"long"})}</div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {[["en","EN"],["bn","বাংলা"]].map(([v,l])=>(
            <button key={v} onClick={()=>setLang(v)} style={{padding:"5px 12px",borderRadius:99,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:lang===v?"#7c3aed":"#1E293B",color:lang===v?"#fff":"#64748B"}}>{l}</button>
          ))}
          <button onClick={()=>setMode("confirm_end")} style={{padding:"7px 14px",borderRadius:8,border:"1px solid #334155",background:"transparent",color:"#94A3B8",fontSize:12,cursor:"pointer"}}>{t("endShift")}</button>
        </div>
      </div>

      {/* Cleaning banner */}
      {mode==="cleaning" && (
        <div style={{background:"#1E293B",borderRadius:16,padding:"20px 24px",textAlign:"center",marginBottom:16,border:"2px solid #d97706"}}>
          <div style={{fontSize:32,marginBottom:8}}>🧹</div>
          <div style={{fontSize:20,fontWeight:800,color:"#d97706"}}>{t("cleaning")} / {T.bn.cleaning}</div>
          <div style={{fontSize:48,fontWeight:800,color:"#fff",fontFamily:"monospace",margin:"8px 0"}}>{fmtSecs(cleanEl)}</div>
          <div style={{color:"#64748B",marginBottom:16}}>Target: 30–45 min</div>
          <button onClick={()=>setMode("idle")} style={{padding:"13px 36px",background:"#16a34a",border:"none",borderRadius:12,color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer"}}>
            {t("doneCleaning")} / {T.bn.doneCleaning}
          </button>
        </div>
      )}

      {mode!=="cleaning" && (
        <>
          {/* NOW PRODUCING */}
          {!job ? (
            <div style={{background:"#1E293B",borderRadius:20,padding:"48px",textAlign:"center",border:"1px solid #334155"}}>
              <div style={{fontSize:44,marginBottom:12}}>🎉</div>
              <div style={{fontSize:20,fontWeight:800,color:"#fff"}}>{t("noJobs")}</div>
              <div style={{color:"#64748B",marginTop:8,fontSize:13}}>All {done.length} jobs completed!</div>
            </div>
          ) : (
            <div style={{background:"#1E293B",borderRadius:20,padding:"24px",marginBottom:14,border:`2px solid ${mColor}`}}>
              <div style={{fontSize:11,color:mColor,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.15em",marginBottom:12}}>
                {t("nowProducing")} / {T.bn.nowProducing}
              </div>

              {/* Product + machine */}
              <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:12,alignItems:"start",marginBottom:16}}>
                <div>
                  <div style={{fontSize:26,fontWeight:800,color:"#fff",lineHeight:1.2,marginBottom:6}}>{job.description}</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                    <span style={{background:mColor+"33",color:mColor,padding:"3px 10px",borderRadius:8,fontSize:12,fontWeight:800}}>{job.machine||"WFJ-20"}</span>
                    {job.passes===2 && <span style={{background:"#FEF3C7",color:"#92400E",padding:"3px 10px",borderRadius:8,fontSize:11,fontWeight:700}}>2-Pass</span>}
                    {customers.slice(0,2).map(c=><span key={c} style={{background:"#0F172A",color:"#94A3B8",padding:"3px 8px",borderRadius:6,fontSize:11}}>{c}</span>)}
                    {daysLeft!==null && <span style={{padding:"3px 10px",borderRadius:8,fontSize:11,fontWeight:700,background:daysLeft<0?"#FEF2F2":daysLeft<=3?"#FFFBEB":"#F0FDF4",color:daysLeft<0?"#dc2626":daysLeft<=3?"#d97706":"#16a34a"}}>{daysLeft<0?`${Math.abs(daysLeft)}d overdue`:daysLeft===0?"Today":`${daysLeft}d`}</span>}
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:11,color:"#64748B",marginBottom:2}}>{t("estimated")} / {T.bn.estimated}</div>
                  <div style={{fontSize:24,fontWeight:800,color:"#94A3B8"}}>{fmtHrs(job.totalHrs)}</div>
                  <div style={{fontSize:12,color:"#475569"}}>{(job.totalQty||0).toLocaleString()} units</div>
                </div>
              </div>

              {/* Components */}
              {(job.componentJobs||[]).length>0 && (
                <div style={{marginBottom:16}}>
                  <div style={{fontSize:10,color:"#475569",fontWeight:700,textTransform:"uppercase",marginBottom:8}}>Components / উপাদান</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {job.componentJobs.map((c,i)=>(
                      <div key={i} style={{background:"#0F172A",borderRadius:8,padding:"7px 12px",border:"1px solid #334155"}}>
                        <div style={{fontWeight:700,color:"#fff",fontSize:12}}>{c.code}</div>
                        <div style={{color:"#64748B",fontSize:11}}>{c.totalKgToGrind?.toFixed(0)}kg · {c.passes}× · {fmtHrs(c.grindHrs)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timer — only when running */}
              {mode==="running" && (
                <div style={{background:"#0F172A",borderRadius:14,padding:"16px 20px",marginBottom:16}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,textAlign:"center",marginBottom:12}}>
                    <div>
                      <div style={{fontSize:10,color:"#64748B",textTransform:"uppercase",marginBottom:4}}>{t("elapsed")} / {T.bn.elapsed}</div>
                      <div style={{fontSize:36,fontWeight:800,color:"#fff",fontFamily:"monospace",fontVariantNumeric:"tabular-nums"}}>{fmtSecs(elapsed)}</div>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:"#64748B",textTransform:"uppercase",marginBottom:4}}>{t("remaining")} / {T.bn.remaining}</div>
                      <div style={{fontSize:36,fontWeight:800,color:kpiColor,fontFamily:"monospace",fontVariantNumeric:"tabular-nums"}}>{fmtSecs(remain)}</div>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:"#64748B",textTransform:"uppercase",marginBottom:4}}>{t("kpi")}</div>
                      <div style={{fontSize:28,fontWeight:800,color:kpiColor}}>
                        {elapsed>0?Math.min(Math.round((estSecs/Math.max(elapsed,1))*100),999)+"%":"—"}
                      </div>
                    </div>
                  </div>
                  <div style={{height:8,background:"#1E293B",borderRadius:99,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${Math.min(estSecs>0?(elapsed/estSecs)*100:0,100)}%`,background:kpiColor,borderRadius:99,transition:"width 1s"}}/>
                  </div>
                  <div style={{textAlign:"center",marginTop:6,fontSize:11,fontWeight:700,color:kpiColor}}>
                    {kpiStatus==="on_track"?`${t("onTrack")} / ${T.bn.onTrack}`:kpiStatus==="runningSlow"?`${t("runningSlow")} / ${T.bn.runningSlow}`:`${t("overtime")} / ${T.bn.overtime}`}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                {mode==="idle" && (
                  <button onClick={startJob} style={{flex:2,minWidth:160,padding:"16px",background:mColor,border:"none",borderRadius:12,color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer"}}>
                    ▶ Start / শুরু করুন
                  </button>
                )}
                {mode==="running" && (
                  <button onClick={()=>setMode("confirm_done")} style={{flex:2,minWidth:160,padding:"16px",background:"#16a34a",border:"none",borderRadius:12,color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer"}}>
                    {t("markDone")} / {T.bn.markDone}
                  </button>
                )}
                <button onClick={()=>setMode("cleaning")} style={{flex:1,padding:"16px",background:"#1E293B",border:"2px solid #d97706",borderRadius:12,color:"#d97706",fontSize:14,fontWeight:700,cursor:"pointer"}}>
                  {t("startCleaning")}
                </button>
                <button onClick={()=>setMode("issue")} style={{flex:1,padding:"16px",background:"#1E293B",border:"2px solid #dc2626",borderRadius:12,color:"#dc2626",fontSize:14,fontWeight:700,cursor:"pointer"}}>
                  {t("reportIssue")}
                </button>
              </div>
            </div>
          )}

          {/* UP NEXT */}
          {nextJobs.length>0 && (
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,color:"#475569",fontWeight:800,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8}}>{t("upNext")} / {T.bn.upNext}</div>
              <div style={{display:"flex",gap:10}}>
                {nextJobs.map((j,i)=>{
                  const mc = MC[j.machine]||"#475569";
                  return (
                    <div key={i} style={{flex:1,background:"#1E293B",borderRadius:12,padding:"14px 16px",border:`1px solid ${mc}44`}}>
                      <div style={{fontWeight:700,color:"#fff",fontSize:13,marginBottom:4}}>{j.description}</div>
                      <div style={{fontSize:11,color:"#64748B"}}>{(j.totalQty||0).toLocaleString()} units · {fmtHrs(j.totalHrs)}</div>
                      <span style={{fontSize:10,color:mc,fontWeight:700}}>{j.machine||"WFJ-20"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* COMPLETED */}
          {done.length>0 && (
            <div>
              <div style={{fontSize:10,color:"#475569",fontWeight:800,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8}}>{t("completedToday")} / {T.bn.completedToday} ({done.length})</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {done.map((c,i)=>(
                  <div key={i} style={{background:"#1E293B",borderRadius:10,padding:"10px 14px",border:"1px solid #16a34a44",minWidth:180}}>
                    <div style={{fontWeight:700,color:"#16a34a",fontSize:12,marginBottom:2}}>✅ {c.description}</div>
                    <div style={{fontSize:11,color:"#64748B"}}>{fmtHrs(c.actualHrs)} · KPI <span style={{fontWeight:700,color:c.kpiPct>=100?"#16a34a":c.kpiPct>=80?"#d97706":"#dc2626"}}>{c.kpiPct}%</span></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
