import React, { useState, useEffect } from "react";

const fmtRM = n => `RM ${Number(n||0).toLocaleString("en-MY",{minimumFractionDigits:0,maximumFractionDigits:0})}`;

// ─── DEFAULT DATA seeded from the uploaded document ──────────────────────────
const DEFAULT_DATA = {
  quarter: "Q2 2026",
  target: 1000000,
  updatedBy: "",
  updatedAt: "",
  summary: "Q2 focus: Volume growth + faster conversion + General Trade (GT) & Modern Trade (MT) expansion.",

  // Performance history
  performance: [
    { period:"Q4 2025",  spices:410000,  oil:38000,   total:448000  },
    { period:"Jan 2026", spices:242884,  oil:157957,  total:400841  },
    { period:"Feb 2026", spices:265447,  oil:117195,  total:382642  },
    { period:"Mar 2026", spices:429720,  oil:91680,   total:521400  },
  ],

  // Pipeline tiers
  pipeline: [
    // Top Tier
    { tier:"Top",    account:"Thong Guan",        value:112000, status:"Advanced",   sku:"MCP 6.25MT + FCP 2MT + Salted Egg TBD", probability:90 },
    { tier:"Top",    account:"Suntraco",           value:80000,  status:"Advanced",   sku:"MCP 3MT + CP 2.5MT",                    probability:85 },
    { tier:"Top",    account:"Moi Food",           value:30000,  status:"Near Close", sku:"Multiple SKUs",                         probability:80 },
    { tier:"Top",    account:"Brahims",            value:15000,  status:"Near Close", sku:"TBD",                                   probability:75 },
    { tier:"Top",    account:"Golden Fresh",       value:15000,  status:"Near Close", sku:"TBD",                                   probability:75 },
    { tier:"Top",    account:"Kampung Kravers",    value:15000,  status:"Near Close", sku:"TBD",                                   probability:75 },
    // Mid Tier
    { tier:"Mid",    account:"Mydin",              value:100000, status:"Listing",    sku:"Retail packs — packaging alignment",    probability:60 },
    { tier:"Mid",    account:"Hero",               value:62500,  status:"Discussion", sku:"Raw materials bulk supply",             probability:60 },
    { tier:"Mid",    account:"Sri Ternak",         value:30000,  status:"Discussion", sku:"TBD",                                   probability:55 },
    { tier:"Mid",    account:"NSK",                value:30000,  status:"Discussion", sku:"TBD",                                   probability:55 },
    { tier:"Mid",    account:"Pop Meals",          value:20000,  status:"Discussion", sku:"TBD",                                   probability:50 },
    { tier:"Mid",    account:"Sajian Ambang",      value:15000,  status:"Discussion", sku:"TBD",                                   probability:50 },
    { tier:"Mid",    account:"KK Mart",            value:15000,  status:"Discussion", sku:"TBD",                                   probability:50 },
    { tier:"Mid",    account:"Gongga",             value:10000,  status:"Discussion", sku:"TBD",                                   probability:45 },
    // Low Tier
    { tier:"Low",    account:"Mamee",              value:0,      status:"Early",      sku:"Blocked — FSSC required",               probability:20 },
    { tier:"Low",    account:"Kewpie",             value:0,      status:"Early",      sku:"Visiting Apr",                          probability:25 },
    { tier:"Low",    account:"Tyson",              value:0,      status:"Early",      sku:"Visiting Apr",                          probability:20 },
    { tier:"Low",    account:"Mydin",              value:0,      status:"Early",      sku:"Listing in progress",                   probability:40 },
    { tier:"Low",    account:"ACME",               value:0,      status:"Quote",      sku:"Meeting 01 Apr 2:30PM",                 probability:35 },
    { tier:"Low",    account:"First Food Dist.",   value:0,      status:"Quote",      sku:"Quote stage",                          probability:30 },
  ],

  // SKU performance
  skus: [
    { name:"Meat Curry Powder",  category:"Core",    status:"growing",    q1vol:"",       note:"Primary revenue driver — scale immediately" },
    { name:"Chilli Powder",      category:"Core",    status:"growing",    q1vol:"10,240kg", note:"Strong repeat across FM accounts" },
    { name:"Fish Curry Powder",  category:"Core",    status:"growing",    q1vol:"",       note:"Channel-dependent — push GT/MT" },
    { name:"Dried Chillies",     category:"Core",    status:"growing",    q1vol:"2,385kg", note:"Consistent demand" },
    { name:"Chilli Flakes",      category:"Growth",  status:"push",       q1vol:"668/355", note:"Underpenetrated — not demand-limited" },
    { name:"Custom Blends",      category:"Growth",  status:"push",       q1vol:"",       note:"TG & Suntraco pipeline" },
    { name:"Retail Packs",       category:"Growth",  status:"push",       q1vol:"",       note:"Mydin — packaging alignment needed" },
    { name:"Turmeric Powder",    category:"Under",   status:"action",     q1vol:"",       note:"Push into existing FM accounts" },
    { name:"Black Pepper",       category:"Under",   status:"action",     q1vol:"",       note:"Needs active push into FM" },
  ],

  // Weekly actions
  actions: [
    { person:"Jasmine", task:"Visit Kewpie",              deadline:"10 Apr", status:"pending",  note:"" },
    { person:"Jasmine", task:"Visit An Nuur",             deadline:"10 Apr", status:"pending",  note:"" },
    { person:"Jasmine", task:"Visit Kyros",               deadline:"10 Apr", status:"pending",  note:"" },
    { person:"Jasmine", task:"Visit Gongga",              deadline:"10 Apr", status:"pending",  note:"" },
    { person:"Jasmine", task:"Visit Mas Awana",           deadline:"10 Apr", status:"pending",  note:"" },
    { person:"Jasmine", task:"Visit Moi Food",            deadline:"10 Apr", status:"pending",  note:"" },
    { person:"Jasmine", task:"ACME Meeting",              deadline:"01 Apr", status:"done",     note:"2:30PM Rawang Factory" },
    { person:"Narin",   task:"Calls to pending wholesalers", deadline:"10 Apr", status:"pending", note:"List from Natasha" },
    { person:"Narin",   task:"Set FM appointments for Jasmine low tier", deadline:"10 Apr", status:"pending", note:"" },
    { person:"Varinder",task:"Kwang Yeow Heng meeting",  deadline:"31 Mar", status:"done",     note:"2PM" },
    { person:"Varinder",task:"Chop Eng Hong — Jenjarom",  deadline:"01 Apr", status:"done",     note:"Before lunch" },
  ],

  // Risks
  risks: [
    { risk:"R&D delays",                    impact:"High",   owner:"Keshvin", status:"open",     note:"TG pending — expedite R&D turnaround" },
    { risk:"Packaging delays (1kg MT)",     impact:"High",   owner:"Keshvin", status:"open",     note:"Required for Modern Trade — finalise ASAP" },
    { risk:"FSSC certification",            impact:"High",   owner:"Keshvin", status:"open",     note:"Blocking Mamee/Nestle — expedite timeline" },
    { risk:"New product catalogue & card",  impact:"Medium", owner:"Jasmine", status:"open",     note:"Deadline 02 Apr 2026" },
  ],

  // Production alignment
  production: [
    { sku:"Meat Curry Powder",  currentMT:"3-4",  targetMT:"8-10", account:"Thong Guan",     note:"Immediate readiness required" },
    { sku:"Fish Curry Powder",  currentMT:"—",    targetMT:"+2",   account:"Thong Guan",     note:"Pending confirmation" },
    { sku:"Meat Curry Powder",  currentMT:"—",    targetMT:"2-3",  account:"Suntraco",       note:"R&D → production transition" },
    { sku:"Chilli Powder",      currentMT:"—",    targetMT:"2-3",  account:"Suntraco",       note:"Consistent batch quality needed" },
  ],
};

const STATUS_COLORS = {
  "Advanced":   {bg:"#EFF6FF",color:"#1d4ed8"},
  "Near Close": {bg:"#F0FDF4",color:"#16a34a"},
  "Listing":    {bg:"#FFF7ED",color:"#ea580c"},
  "Discussion": {bg:"#FFFBEB",color:"#d97706"},
  "Quote":      {bg:"#F5F3FF",color:"#7c3aed"},
  "Early":      {bg:"#F8FAFC",color:"#64748B"},
  "done":       {bg:"#F0FDF4",color:"#16a34a"},
  "pending":    {bg:"#FFFBEB",color:"#d97706"},
  "overdue":    {bg:"#FEF2F2",color:"#dc2626"},
};

export default function SalesExecutive({ currentUser }) {
  const [data,    setData]    = useState(null);
  const [view,    setView]    = useState("overview");
  const [editing, setEditing] = useState(null); // which item is being edited
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  // Load from Redis via activity endpoint or use defaults
  useEffect(() => {
    fetch("/api/activity?type=sales_executive")
      .then(r=>r.json())
      .then(d => setData(d.data || DEFAULT_DATA))
      .catch(()=>setData(DEFAULT_DATA));
  }, []);

  async function save(newData) {
    setSaving(true);
    try {
      await fetch("/api/activity", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          type:"sales_executive",
          data:{ ...newData, updatedBy:currentUser?.name, updatedAt:new Date().toISOString() }
        }),
      });
      setData(newData);
      setSaved(true);
      setTimeout(()=>setSaved(false), 2000);
    } catch(e) { console.error(e); }
    setSaving(false);
  }

  function updatePipeline(idx, field, value) {
    const newData = { ...data, pipeline: data.pipeline.map((p,i)=>i===idx?{...p,[field]:value}:p) };
    setData(newData);
  }

  function updateAction(idx, field, value) {
    const newData = { ...data, actions: data.actions.map((a,i)=>i===idx?{...a,[field]:value}:a) };
    setData(newData);
  }

  function updateRisk(idx, field, value) {
    const newData = { ...data, risks: data.risks.map((r,i)=>i===idx?{...r,[field]:value}:r) };
    setData(newData);
  }

  function addPipelineItem() {
    const newItem = { tier:"Top", account:"", value:0, status:"Early", sku:"", probability:50 };
    setData({...data, pipeline:[...data.pipeline, newItem]});
  }

  function addAction() {
    const newItem = { person:"", task:"", deadline:"", status:"pending", note:"" };
    setData({...data, actions:[...data.actions, newItem]});
  }

  if (!data) return <div style={{padding:48,textAlign:"center",color:"#94A3B8"}}>Loading sales executive summary...</div>;

  // Calculations
  const topPipeline  = data.pipeline.filter(p=>p.tier==="Top").reduce((s,p)=>s+(p.value||0),0);
  const midPipeline  = data.pipeline.filter(p=>p.tier==="Mid").reduce((s,p)=>s+(p.value||0),0);
  const totalPipeline= topPipeline + midPipeline;
  const weightedPipeline = data.pipeline.reduce((s,p)=>s+(p.value||0)*((p.probability||0)/100),0);
  const pendingActions = data.actions.filter(a=>a.status==="pending").length;
  const overdueActions = data.actions.filter(a=>{
    if (a.status!=="pending") return false;
    if (!a.deadline) return false;
    return new Date(a.deadline) < new Date();
  }).length;

  const lastPerf = data.performance[data.performance.length-1];
  const prevPerf = data.performance[data.performance.length-2];
  const growth = prevPerf ? ((lastPerf.total - prevPerf.total)/prevPerf.total*100) : 0;

  const tabBtn = (v,label) => (
    <button onClick={()=>setView(v)} style={{padding:"7px 16px",borderRadius:99,border:"none",cursor:"pointer",
      fontSize:12,fontWeight:700,background:view===v?"#1E3A5F":"#F1F5F9",color:view===v?"#fff":"#64748B",whiteSpace:"nowrap"}}>
      {label}
    </button>
  );

  return (
    <div style={{padding:"24px 28px",maxWidth:1280,margin:"0 auto",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:20,fontWeight:800,color:"#0F172A",marginBottom:4}}>📋 Sales Executive Summary — {data.quarter}</div>
          <div style={{fontSize:12,color:"#94A3B8"}}>
            {data.updatedBy ? `Last updated by ${data.updatedBy} · ${data.updatedAt ? new Date(data.updatedAt).toLocaleString("en-MY",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}) : ""}` : "Live sales tracker — editable by sales team"}
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          {saved && <span style={{fontSize:12,color:"#16a34a",fontWeight:700}}>✅ Saved</span>}
          <button onClick={()=>save(data)} disabled={saving}
            style={{padding:"8px 18px",borderRadius:10,border:"none",background:saving?"#CBD5E1":"#16a34a",color:"#fff",fontSize:12,fontWeight:700,cursor:saving?"not-allowed":"pointer"}}>
            {saving?"Saving...":"💾 Save Updates"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap"}}>
        {tabBtn("overview",   "📊 Overview")}
        {tabBtn("pipeline",   "🎯 Pipeline")}
        {tabBtn("actions",    `✅ Actions ${pendingActions>0?`(${pendingActions})`:""}`)}
        {tabBtn("skus",       "📦 SKUs")}
        {tabBtn("risks",      `⚠️ Risks ${data.risks.filter(r=>r.status==="open").length>0?`(${data.risks.filter(r=>r.status==="open").length})`:""}`)}
        {tabBtn("production", "🏭 Production Alignment")}
      </div>

      {/* ── OVERVIEW ── */}
      {view==="overview" && (
        <div>
          {/* KPI strip */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,marginBottom:20}}>
            {[
              {label:`${data.quarter} Target`,  value:fmtRM(data.target),       color:"#1E3A5F",bg:"#EFF6FF",icon:"🎯"},
              {label:"Total Pipeline",           value:fmtRM(totalPipeline),     color:"#d97706", bg:"#FFFBEB",icon:"📊"},
              {label:"Weighted Pipeline",        value:fmtRM(weightedPipeline),  color:"#7c3aed", bg:"#F5F3FF",icon:"⚖️"},
              {label:"Top Tier",                 value:fmtRM(topPipeline),       color:"#16a34a", bg:"#F0FDF4",icon:"🏆"},
              {label:"Mid Tier",                 value:fmtRM(midPipeline),       color:"#0891b2", bg:"#E0F2FE",icon:"📈"},
              {label:"Actions Pending",          value:pendingActions,           color:overdueActions>0?"#dc2626":"#d97706",bg:overdueActions>0?"#FEF2F2":"#FFFBEB",icon:overdueActions>0?"🚨":"⏳"},
            ].map(c=>(
              <div key={c.label} style={{background:c.bg,borderRadius:14,padding:"14px 16px",border:`1px solid ${c.color}22`,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                  <div style={{fontSize:10,color:c.color,textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:700}}>{c.label}</div>
                  <div style={{fontSize:18}}>{c.icon}</div>
                </div>
                <div style={{fontSize:20,fontWeight:800,color:c.color}}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Performance history */}
          <div style={{background:"#fff",borderRadius:16,padding:"20px 24px",border:"1px solid #E2E8F0",marginBottom:16,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
            <div style={{fontSize:14,fontWeight:800,color:"#0F172A",marginBottom:4}}>Revenue Performance History</div>
            <div style={{fontSize:12,color:"#94A3B8",marginBottom:16}}>Spices + Oil breakdown</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr style={{background:"#F8FAFC"}}>
                  {["Period","Spices","Oil","Total","vs Prev"].map(h=>(
                    <th key={h} style={{padding:"9px 14px",textAlign:h==="Period"?"left":"right",fontSize:10,color:"#94A3B8",fontWeight:700,textTransform:"uppercase"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {data.performance.map((p,i)=>{
                    const prev = i>0?data.performance[i-1]:null;
                    const chg = prev ? ((p.total-prev.total)/prev.total*100) : null;
                    return (
                      <tr key={p.period} style={{borderTop:"1px solid #F1F5F9",background:i%2===0?"#FAFAFA":"#fff"}}>
                        <td style={{padding:"10px 14px",fontWeight:700,color:"#1E3A5F"}}>{p.period}</td>
                        <td style={{padding:"10px 14px",textAlign:"right",fontWeight:600}}>{fmtRM(p.spices)}</td>
                        <td style={{padding:"10px 14px",textAlign:"right",color:"#64748B"}}>{fmtRM(p.oil)}</td>
                        <td style={{padding:"10px 14px",textAlign:"right",fontWeight:800}}>{fmtRM(p.total)}</td>
                        <td style={{padding:"10px 14px",textAlign:"right",fontWeight:700,color:chg===null?"#94A3B8":chg>=0?"#16a34a":"#dc2626"}}>
                          {chg===null?"—":`${chg>=0?"↑":"↓"} ${Math.abs(chg).toFixed(1)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary editable */}
          <div style={{background:"#1E3A5F",borderRadius:16,padding:"20px 24px",color:"#fff"}}>
            <div style={{fontSize:13,fontWeight:700,color:"#93C5FD",marginBottom:8}}>Executive Summary Note</div>
            <textarea value={data.summary} onChange={e=>setData({...data,summary:e.target.value})}
              rows={3} style={{width:"100%",background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:8,color:"#fff",fontSize:13,padding:"10px 12px",resize:"vertical",outline:"none",boxSizing:"border-box",fontFamily:"'Plus Jakarta Sans',sans-serif"}}/>
          </div>
        </div>
      )}

      {/* ── PIPELINE ── */}
      {view==="pipeline" && (
        <div>
          {["Top","Mid","Low"].map(tier=>{
            const items = data.pipeline.filter(p=>p.tier===tier);
            const tierTotal = items.reduce((s,p)=>s+(p.value||0),0);
            const tierColor = tier==="Top"?"#16a34a":tier==="Mid"?"#d97706":"#94A3B8";
            const tierBg    = tier==="Top"?"#F0FDF4":tier==="Mid"?"#FFFBEB":"#F8FAFC";
            return (
              <div key={tier} style={{background:"#fff",borderRadius:16,border:"1px solid #E2E8F0",overflow:"hidden",marginBottom:14,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                <div style={{padding:"14px 18px",background:tierBg,borderBottom:"1px solid #E2E8F0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <span style={{fontWeight:800,fontSize:14,color:tierColor}}>{tier} Tier</span>
                    <span style={{fontSize:12,color:"#64748B",marginLeft:8}}>{items.length} accounts</span>
                  </div>
                  <div style={{fontWeight:800,fontSize:16,color:tierColor}}>{tierTotal>0?fmtRM(tierTotal):"Early Stage"}</div>
                </div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr style={{background:"#F8FAFC"}}>
                    {["Account","Value (RM)","SKU / Product","Status","Probability","Notes"].map(h=>(
                      <th key={h} style={{padding:"8px 12px",textAlign:"left",fontSize:10,color:"#94A3B8",fontWeight:700,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {items.map((item,i)=>{
                      const globalIdx = data.pipeline.indexOf(item);
                      const sc = STATUS_COLORS[item.status]||{bg:"#F8FAFC",color:"#64748B"};
                      return (
                        <tr key={i} style={{borderTop:"1px solid #F1F5F9",background:i%2===0?"#FAFAFA":"#fff"}}>
                          <td style={{padding:"9px 12px",fontWeight:700,color:"#1E3A5F"}}>
                            <input value={item.account} onChange={e=>updatePipeline(globalIdx,"account",e.target.value)}
                              style={{background:"transparent",border:"none",fontWeight:700,color:"#1E3A5F",fontSize:12,width:"100%",outline:"none",fontFamily:"inherit"}}/>
                          </td>
                          <td style={{padding:"9px 12px"}}>
                            <input type="number" value={item.value} onChange={e=>updatePipeline(globalIdx,"value",parseFloat(e.target.value)||0)}
                              style={{background:"transparent",border:"none",fontWeight:600,color:"#0F172A",fontSize:12,width:90,outline:"none",fontFamily:"inherit",textAlign:"right"}}/>
                          </td>
                          <td style={{padding:"9px 12px",color:"#64748B",maxWidth:180}}>
                            <input value={item.sku} onChange={e=>updatePipeline(globalIdx,"sku",e.target.value)}
                              style={{background:"transparent",border:"none",color:"#64748B",fontSize:11,width:"100%",outline:"none",fontFamily:"inherit"}}/>
                          </td>
                          <td style={{padding:"9px 12px"}}>
                            <select value={item.status} onChange={e=>updatePipeline(globalIdx,"status",e.target.value)}
                              style={{background:sc.bg,color:sc.color,border:"none",borderRadius:99,padding:"2px 8px",fontSize:11,fontWeight:700,cursor:"pointer",outline:"none"}}>
                              {["Advanced","Near Close","Listing","Discussion","Quote","Early"].map(s=>(
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </td>
                          <td style={{padding:"9px 12px"}}>
                            <div style={{display:"flex",alignItems:"center",gap:6}}>
                              <input type="number" value={item.probability} onChange={e=>updatePipeline(globalIdx,"probability",parseInt(e.target.value)||0)}
                                min="0" max="100" style={{width:36,background:"transparent",border:"none",fontWeight:700,color:"#1E3A5F",fontSize:12,outline:"none",fontFamily:"inherit",textAlign:"center"}}/>
                              <span style={{fontSize:11,color:"#94A3B8"}}>%</span>
                              <div style={{width:40,height:4,background:"#F1F5F9",borderRadius:99,overflow:"hidden"}}>
                                <div style={{height:"100%",width:`${item.probability}%`,background:item.probability>=75?"#16a34a":item.probability>=50?"#d97706":"#dc2626",borderRadius:99}}/>
                              </div>
                            </div>
                          </td>
                          <td style={{padding:"9px 12px",fontSize:11,color:"#64748B",maxWidth:200}}>
                            <input value={item.note||""} onChange={e=>updatePipeline(globalIdx,"note",e.target.value)}
                              placeholder="Add note..."
                              style={{background:"transparent",border:"none",color:"#64748B",fontSize:11,width:"100%",outline:"none",fontFamily:"inherit"}}/>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
          <button onClick={addPipelineItem} style={{padding:"10px 20px",borderRadius:10,border:"1px dashed #CBD5E1",background:"#F8FAFC",color:"#64748B",fontSize:12,fontWeight:600,cursor:"pointer"}}>
            + Add Account
          </button>
          <button onClick={()=>save(data)} style={{marginLeft:12,padding:"10px 20px",borderRadius:10,border:"none",background:"#1E3A5F",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>
            💾 Save Pipeline
          </button>
        </div>
      )}

      {/* ── ACTIONS ── */}
      {view==="actions" && (
        <div>
          <div style={{background:"#fff",borderRadius:16,border:"1px solid #E2E8F0",overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
            <div style={{padding:"14px 18px",borderBottom:"1px solid #F1F5F9",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:14,fontWeight:800,color:"#0F172A"}}>Weekly Action Tracker</div>
                <div style={{fontSize:12,color:"#94A3B8",marginTop:2}}>{pendingActions} pending · {overdueActions} overdue · Click to update status</div>
              </div>
              <button onClick={addAction} style={{padding:"7px 14px",borderRadius:8,border:"1px dashed #CBD5E1",background:"#F8FAFC",color:"#64748B",fontSize:11,fontWeight:600,cursor:"pointer"}}>+ Add Action</button>
            </div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{background:"#F8FAFC"}}>
                {["Person","Task","Deadline","Status","Notes"].map(h=>(
                  <th key={h} style={{padding:"9px 14px",textAlign:"left",fontSize:10,color:"#94A3B8",fontWeight:700,textTransform:"uppercase"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {data.actions.map((action,i)=>{
                  const isOverdue = action.status==="pending" && action.deadline && new Date(action.deadline) < new Date();
                  const sc = isOverdue ? STATUS_COLORS.overdue : STATUS_COLORS[action.status]||{bg:"#F8FAFC",color:"#64748B"};
                  return (
                    <tr key={i} style={{borderTop:"1px solid #F1F5F9",background:isOverdue?"#FEF2F2":i%2===0?"#FAFAFA":"#fff"}}>
                      <td style={{padding:"9px 14px"}}>
                        <select value={action.person} onChange={e=>updateAction(i,"person",e.target.value)}
                          style={{background:"transparent",border:"none",fontWeight:700,color:"#1E3A5F",fontSize:12,cursor:"pointer",outline:"none",fontFamily:"inherit"}}>
                          {["Jasmine","Narin","Varinder","Mhae","Navin","Keshvin","Vitya"].map(p=><option key={p} value={p}>{p}</option>)}
                        </select>
                      </td>
                      <td style={{padding:"9px 14px",fontWeight:600}}>
                        <input value={action.task} onChange={e=>updateAction(i,"task",e.target.value)}
                          style={{background:"transparent",border:"none",fontWeight:600,color:"#0F172A",fontSize:12,width:"100%",outline:"none",fontFamily:"inherit"}}/>
                      </td>
                      <td style={{padding:"9px 14px",whiteSpace:"nowrap"}}>
                        <input type="text" value={action.deadline} onChange={e=>updateAction(i,"deadline",e.target.value)}
                          placeholder="e.g. 10 Apr"
                          style={{background:"transparent",border:"none",color:isOverdue?"#dc2626":"#64748B",fontSize:12,width:80,outline:"none",fontFamily:"inherit"}}/>
                      </td>
                      <td style={{padding:"9px 14px"}}>
                        <select value={action.status} onChange={e=>updateAction(i,"status",e.target.value)}
                          style={{background:sc.bg,color:sc.color,border:"none",borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:700,cursor:"pointer",outline:"none"}}>
                          <option value="pending">⏳ Pending</option>
                          <option value="done">✅ Done</option>
                          <option value="overdue">🚨 Overdue</option>
                        </select>
                      </td>
                      <td style={{padding:"9px 14px"}}>
                        <input value={action.note} onChange={e=>updateAction(i,"note",e.target.value)}
                          placeholder="Add note..."
                          style={{background:"transparent",border:"none",color:"#64748B",fontSize:11,width:"100%",outline:"none",fontFamily:"inherit"}}/>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{marginTop:12,display:"flex",justifyContent:"flex-end"}}>
            <button onClick={()=>save(data)} style={{padding:"10px 24px",borderRadius:10,border:"none",background:"#1E3A5F",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              💾 Save Actions
            </button>
          </div>
        </div>
      )}

      {/* ── SKUs ── */}
      {view==="skus" && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:14}}>
          {[["Core","🏆","#16a34a","#F0FDF4"],["Growth","📈","#d97706","#FFFBEB"],["Under","⚠️","#dc2626","#FEF2F2"]].map(([cat,icon,color,bg])=>{
            const items = data.skus.filter(s=>s.category===cat);
            return (
              <div key={cat} style={{background:"#fff",borderRadius:16,border:`2px solid ${color}33`,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                <div style={{padding:"14px 18px",background:bg,borderBottom:`1px solid ${color}22`}}>
                  <div style={{fontWeight:800,fontSize:14,color}}>{icon} {cat==="Core"?"Core SKUs":cat==="Growth"?"Growth SKUs":"Underperforming"}</div>
                  <div style={{fontSize:11,color:"#64748B",marginTop:2}}>
                    {cat==="Core"?"Primary revenue drivers — protect and scale":cat==="Growth"?"Push aggressively — high potential":"Needs active push — not demand-limited"}
                  </div>
                </div>
                {items.map((sku,i)=>(
                  <div key={sku.name} style={{padding:"12px 18px",borderBottom:"1px solid #F1F5F9",background:i%2===0?"#FAFAFA":"#fff"}}>
                    <div style={{fontWeight:700,fontSize:13,color:"#0F172A",marginBottom:2}}>{sku.name}</div>
                    {sku.q1vol && <div style={{fontSize:11,color:"#64748B",marginBottom:2}}>Q1 Volume: <strong>{sku.q1vol}</strong></div>}
                    <div style={{fontSize:11,color:"#94A3B8"}}>{sku.note}</div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* ── RISKS ── */}
      {view==="risks" && (
        <div>
          <div style={{background:"#fff",borderRadius:16,border:"1px solid #E2E8F0",overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
            <div style={{padding:"14px 18px",borderBottom:"1px solid #F1F5F9"}}>
              <div style={{fontSize:14,fontWeight:800,color:"#0F172A"}}>Risk Register</div>
              <div style={{fontSize:12,color:"#94A3B8",marginTop:2}}>Key risks to hitting Q2 target — update status as items are resolved</div>
            </div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{background:"#F8FAFC"}}>
                {["Risk","Impact","Owner","Status","Notes"].map(h=>(
                  <th key={h} style={{padding:"9px 14px",textAlign:"left",fontSize:10,color:"#94A3B8",fontWeight:700,textTransform:"uppercase"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {data.risks.map((risk,i)=>(
                  <tr key={i} style={{borderTop:"1px solid #F1F5F9",background:risk.status==="open"&&risk.impact==="High"?"#FEF2F2":i%2===0?"#FAFAFA":"#fff"}}>
                    <td style={{padding:"10px 14px",fontWeight:700,color:"#0F172A",maxWidth:200}}>
                      <input value={risk.risk} onChange={e=>updateRisk(i,"risk",e.target.value)}
                        style={{background:"transparent",border:"none",fontWeight:700,color:"#0F172A",fontSize:12,width:"100%",outline:"none",fontFamily:"inherit"}}/>
                    </td>
                    <td style={{padding:"10px 14px"}}>
                      <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:99,
                        background:risk.impact==="High"?"#FEF2F2":"#FFFBEB",color:risk.impact==="High"?"#dc2626":"#d97706"}}>
                        {risk.impact}
                      </span>
                    </td>
                    <td style={{padding:"10px 14px",fontWeight:600,color:"#1E3A5F"}}>{risk.owner}</td>
                    <td style={{padding:"10px 14px"}}>
                      <select value={risk.status} onChange={e=>updateRisk(i,"status",e.target.value)}
                        style={{background:risk.status==="open"?"#FEF2F2":"#F0FDF4",color:risk.status==="open"?"#dc2626":"#16a34a",border:"none",borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:700,cursor:"pointer",outline:"none"}}>
                        <option value="open">🔴 Open</option>
                        <option value="resolved">✅ Resolved</option>
                        <option value="monitoring">🟡 Monitoring</option>
                      </select>
                    </td>
                    <td style={{padding:"10px 14px",color:"#64748B",fontSize:11}}>
                      <input value={risk.note} onChange={e=>updateRisk(i,"note",e.target.value)}
                        placeholder="Add update..."
                        style={{background:"transparent",border:"none",color:"#64748B",fontSize:11,width:"100%",outline:"none",fontFamily:"inherit"}}/>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{marginTop:12,display:"flex",justifyContent:"flex-end"}}>
            <button onClick={()=>save(data)} style={{padding:"10px 24px",borderRadius:10,border:"none",background:"#1E3A5F",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              💾 Save Risks
            </button>
          </div>
        </div>
      )}

      {/* ── PRODUCTION ALIGNMENT ── */}
      {view==="production" && (
        <div>
          <div style={{background:"#1E3A5F",borderRadius:14,padding:"16px 20px",marginBottom:16,color:"#fff"}}>
            <div style={{fontSize:14,fontWeight:800,marginBottom:4}}>🏭 Production Alignment — For Varinder & Yuges</div>
            <div style={{fontSize:12,color:"#93C5FD"}}>Volume requirements based on confirmed and scaling sales pipeline · Total potential: 12–16 MT/month (core SKUs)</div>
          </div>
          <div style={{background:"#fff",borderRadius:16,border:"1px solid #E2E8F0",overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{background:"#F8FAFC"}}>
                {["SKU","Account","Current MT/mo","Target MT/mo","Status / Notes"].map(h=>(
                  <th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:10,color:"#94A3B8",fontWeight:700,textTransform:"uppercase"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {data.production.map((p,i)=>(
                  <tr key={i} style={{borderTop:"1px solid #F1F5F9",background:i%2===0?"#FAFAFA":"#fff"}}>
                    <td style={{padding:"10px 14px",fontWeight:700,color:"#1E3A5F"}}>{p.sku}</td>
                    <td style={{padding:"10px 14px",fontWeight:600,color:"#0F172A"}}>{p.account}</td>
                    <td style={{padding:"10px 14px",textAlign:"center",color:"#64748B"}}>{p.currentMT}</td>
                    <td style={{padding:"10px 14px",textAlign:"center"}}>
                      <span style={{fontWeight:800,color:"#16a34a"}}>{p.targetMT}</span>
                    </td>
                    <td style={{padding:"10px 14px",fontSize:11,color:"#d97706",fontWeight:600}}>{p.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{marginTop:14,background:"#FFFBEB",borderRadius:12,padding:"14px 18px",border:"1px solid #FCD34D",fontSize:12,color:"#92400E"}}>
            ⚡ <strong>Priority production SKUs for Q2:</strong> 1. Meat Curry Powder · 2. Chilli Powder · 3. Fish Curry Powder · 4. Chilli Flakes — align capacity planning accordingly.
          </div>
        </div>
      )}
    </div>
  );
}
