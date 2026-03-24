import React, { useState, useEffect } from "react";

const fmtRM = n => `RM ${Number(n||0).toLocaleString("en-MY",{minimumFractionDigits:0,maximumFractionDigits:0})}`;
const fmtRMFull = n => `RM ${Number(n||0).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const fmtDate = d => d ? new Date(d).toLocaleDateString("en-MY",{day:"2-digit",month:"short"}) : "—";

export default function SalesDashboard({ currentUser }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [period,  setPeriod]  = useState("mtd"); // mtd | 3m | 6m | all

  useEffect(() => {
    Promise.all([
      fetch("/api/prospects?type=so").then(r=>r.json()),
      fetch("/api/prospects?type=master").then(r=>r.json()),
    ]).then(([soData, master]) => {
      setData({ ...soData, ...master });
      setLoading(false);
    }).catch(()=>setLoading(false));
  }, []);

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"60vh"}}>
      <div style={{textAlign:"center",color:"#94A3B8"}}>
        <div style={{fontSize:32,marginBottom:12}}>📊</div>
        <div style={{fontSize:14}}>Loading sales data...</div>
      </div>
    </div>
  );

  const invoices  = data?.invoice || [];
  const soList    = data?.so || [];
  const rvData    = data?.rv || [];

  // Period filter
  const now = new Date();
  const cutoffs = { mtd: new Date(now.getFullYear(),now.getMonth(),1), "3m": new Date(now-90*864e5), "6m": new Date(now-180*864e5), all: new Date(0) };
  const cutoff = cutoffs[period];
  const filteredIV = invoices.filter(iv => new Date(iv.date) >= cutoff);

  // KPIs
  const totalInvoiced    = filteredIV.reduce((s,iv)=>s+(iv.amount||0),0);
  const totalCollected   = filteredIV.reduce((s,iv)=>s+((iv.amount||0)-(iv.outstanding||0)),0);
  const totalOutstanding = filteredIV.reduce((s,iv)=>s+(iv.outstanding||0),0);
  const totalOverdue     = filteredIV.filter(iv=>iv.status==="Overdue").reduce((s,iv)=>s+(iv.outstanding||0),0);
  const openSOs          = soList.length;
  const openSOValue      = soList.reduce((s,so)=>s+(so.amount||0),0);

  // Monthly trend — last 6 months
  const months = [];
  for (let i=5;i>=0;i--) {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const label = d.toLocaleDateString("en-MY",{month:"short",year:"2-digit"});
    const end   = new Date(d.getFullYear(), d.getMonth()+1, 0);
    const val   = invoices.filter(iv=>new Date(iv.date)>=d&&new Date(iv.date)<=end).reduce((s,iv)=>s+(iv.amount||0),0);
    const col   = invoices.filter(iv=>new Date(iv.date)>=d&&new Date(iv.date)<=end).reduce((s,iv)=>s+((iv.amount||0)-(iv.outstanding||0)),0);
    months.push({ label, invoiced:val, collected:col });
  }
  const maxVal = Math.max(...months.map(m=>m.invoiced), 1);

  // Top customers by invoiced amount
  const custMap = {};
  filteredIV.forEach(iv => {
    const c = iv.customer||"Unknown";
    if (!custMap[c]) custMap[c] = { name:c, invoiced:0, collected:0, outstanding:0, count:0 };
    custMap[c].invoiced    += iv.amount||0;
    custMap[c].collected   += (iv.amount||0)-(iv.outstanding||0);
    custMap[c].outstanding += iv.outstanding||0;
    custMap[c].count++;
  });
  const topCustomers = Object.values(custMap).sort((a,b)=>b.invoiced-a.invoiced).slice(0,8);
  const maxCust = Math.max(...topCustomers.map(c=>c.invoiced),1);

  // Recent open SOs
  const recentSOs = soList.slice(0,8);

  // Status counts
  const paidCount    = filteredIV.filter(iv=>iv.status==="Paid").length;
  const overdueCount = filteredIV.filter(iv=>iv.status==="Overdue").length;
  const invoicedCount= filteredIV.filter(iv=>iv.status==="Invoiced").length;

  return (
    <div style={{background:"#F8FAFC",minHeight:"100vh",padding:"24px 28px",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24,flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:22,fontWeight:800,color:"#0F172A"}}>Sales Overview</div>
          <div style={{fontSize:13,color:"#94A3B8",marginTop:2}}>Welcome back, {currentUser?.name} · {new Date().toLocaleDateString("en-MY",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
        </div>
        <div style={{display:"flex",gap:4,background:"#fff",borderRadius:12,padding:4,border:"1px solid #E2E8F0"}}>
          {[["mtd","This Month"],["3m","3 Months"],["6m","6 Months"],["all","All Time"]].map(([v,l])=>(
            <button key={v} onClick={()=>setPeriod(v)} style={{padding:"7px 16px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:period===v?"#1E3A5F":"transparent",color:period===v?"#fff":"#64748B"}}>{l}</button>
          ))}
        </div>
      </div>

      {/* KPI Row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,marginBottom:24}}>
        {[
          {label:"Invoiced",    value:fmtRM(totalInvoiced),    sub:`${filteredIV.length} invoices`,        color:"#1d4ed8", bg:"#fff", icon:"📋"},
          {label:"Collected",   value:fmtRM(totalCollected),   sub:`${paidCount} paid`,                   color:"#16a34a", bg:"#fff", icon:"✅"},
          {label:"Outstanding", value:fmtRM(totalOutstanding), sub:`${invoicedCount} pending`,            color:"#d97706", bg:"#fff", icon:"⏳"},
          {label:"Overdue",     value:fmtRM(totalOverdue),     sub:`${overdueCount} invoices`,            color:"#dc2626", bg:"#fff", icon:"🚨"},
          {label:"Open SOs",    value:openSOs,                  sub:fmtRM(openSOValue)+" pipeline",       color:"#7c3aed", bg:"#fff", icon:"📦"},
        ].map(c=>(
          <div key={c.label} style={{background:c.bg,borderRadius:16,padding:"18px 20px",border:"1px solid #E2E8F0",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div style={{fontSize:11,color:"#94A3B8",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>{c.label}</div>
              <div style={{fontSize:20}}>{c.icon}</div>
            </div>
            <div style={{fontSize:22,fontWeight:800,color:c.color,marginBottom:4}}>{c.value}</div>
            <div style={{fontSize:11,color:"#94A3B8"}}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{display:"grid",gridTemplateColumns:"1.4fr 1fr",gap:16,marginBottom:20}}>

        {/* Monthly trend */}
        <div style={{background:"#fff",borderRadius:16,padding:"20px 24px",border:"1px solid #E2E8F0",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <div>
              <div style={{fontSize:15,fontWeight:800,color:"#0F172A"}}>Monthly Revenue Trend</div>
              <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>Invoiced vs Collected — last 6 months</div>
            </div>
            <div style={{display:"flex",gap:12,fontSize:11}}>
              <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:10,borderRadius:2,background:"#1d4ed8"}}/><span style={{color:"#64748B"}}>Invoiced</span></div>
              <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:10,borderRadius:2,background:"#16a34a"}}/><span style={{color:"#64748B"}}>Collected</span></div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"flex-end",gap:8,height:160}}>
            {months.map((m,i)=>(
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                <div style={{width:"100%",display:"flex",gap:3,alignItems:"flex-end",height:130}}>
                  <div style={{flex:1,background:"#1d4ed811",borderRadius:"4px 4px 0 0",height:`${(m.invoiced/maxVal)*100}%`,position:"relative",minHeight:4}}>
                    <div style={{position:"absolute",bottom:0,left:0,right:0,background:"#1d4ed8",borderRadius:"4px 4px 0 0",height:`${(m.invoiced/maxVal)*100}%`,minHeight:4}}/>
                  </div>
                  <div style={{flex:1,background:"#16a34a",borderRadius:"4px 4px 0 0",height:`${(m.collected/maxVal)*100}%`,minHeight:m.collected>0?4:0}}/>
                </div>
                <div style={{fontSize:10,color:"#94A3B8",fontWeight:600}}>{m.label}</div>
                <div style={{fontSize:10,color:"#1d4ed8",fontWeight:700}}>{m.invoiced>0?fmtRM(m.invoiced/1000)+"k":""}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Payment status donut-style */}
        <div style={{background:"#fff",borderRadius:16,padding:"20px 24px",border:"1px solid #E2E8F0",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
          <div style={{fontSize:15,fontWeight:800,color:"#0F172A",marginBottom:4}}>Collection Status</div>
          <div style={{fontSize:11,color:"#94A3B8",marginBottom:20}}>{filteredIV.length} invoices this period</div>
          {[
            {label:"Paid",     count:paidCount,     amount:totalCollected,   color:"#16a34a", bg:"#F0FDF4"},
            {label:"Invoiced", count:invoicedCount, amount:totalOutstanding, color:"#d97706", bg:"#FFFBEB"},
            {label:"Overdue",  count:overdueCount,  amount:totalOverdue,     color:"#dc2626", bg:"#FEF2F2"},
          ].map(s=>{
            const pct = filteredIV.length ? Math.round((s.count/filteredIV.length)*100) : 0;
            return (
              <div key={s.label} style={{marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:s.color}}/>
                    <span style={{fontSize:12,fontWeight:600,color:"#0F172A"}}>{s.label}</span>
                    <span style={{fontSize:11,color:"#94A3B8"}}>{s.count} invoices</span>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <span style={{fontSize:12,fontWeight:700,color:s.color}}>{fmtRM(s.amount)}</span>
                    <span style={{fontSize:11,color:"#94A3B8",marginLeft:6}}>{pct}%</span>
                  </div>
                </div>
                <div style={{height:6,background:"#F1F5F9",borderRadius:99,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${pct}%`,background:s.color,borderRadius:99}}/>
                </div>
              </div>
            );
          })}
          <div style={{marginTop:20,padding:"12px 16px",background:"#F8FAFC",borderRadius:10,border:"1px solid #E2E8F0"}}>
            <div style={{fontSize:11,color:"#94A3B8",marginBottom:2}}>Collection Rate</div>
            <div style={{fontSize:22,fontWeight:800,color:totalInvoiced>0&&(totalCollected/totalInvoiced)>=0.8?"#16a34a":"#d97706"}}>
              {totalInvoiced>0?Math.round((totalCollected/totalInvoiced)*100):0}%
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>

        {/* Top customers */}
        <div style={{background:"#fff",borderRadius:16,padding:"20px 24px",border:"1px solid #E2E8F0",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
          <div style={{fontSize:15,fontWeight:800,color:"#0F172A",marginBottom:4}}>Top Customers</div>
          <div style={{fontSize:11,color:"#94A3B8",marginBottom:16}}>By invoiced amount · {period==="mtd"?"This month":period==="3m"?"Last 3 months":period==="6m"?"Last 6 months":"All time"}</div>
          {topCustomers.length===0 ? <div style={{color:"#94A3B8",fontSize:13,padding:16,textAlign:"center"}}>No data</div> :
            topCustomers.map((c,i)=>(
              <div key={c.name} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                <div style={{width:20,height:20,borderRadius:"50%",background:"#1E3A5F",color:"#fff",fontSize:10,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{i+1}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</div>
                  <div style={{height:5,background:"#F1F5F9",borderRadius:99,marginTop:3,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${(c.invoiced/maxCust)*100}%`,background:`hsl(${220-(i*20)},70%,50%)`,borderRadius:99}}/>
                  </div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#1d4ed8"}}>{fmtRM(c.invoiced)}</div>
                  <div style={{fontSize:10,color:c.outstanding>0?"#dc2626":"#16a34a"}}>{c.outstanding>0?fmtRM(c.outstanding)+" due":"Paid"}</div>
                </div>
              </div>
            ))
          }
        </div>

        {/* Open SOs */}
        <div style={{background:"#fff",borderRadius:16,padding:"20px 24px",border:"1px solid #E2E8F0",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
          <div style={{fontSize:15,fontWeight:800,color:"#0F172A",marginBottom:4}}>Active Sales Orders</div>
          <div style={{fontSize:11,color:"#94A3B8",marginBottom:16}}>{openSOs} open SOs · {fmtRMFull(openSOValue)} pipeline</div>
          <div style={{overflowY:"auto",maxHeight:280}}>
            {recentSOs.length===0 ? <div style={{color:"#94A3B8",fontSize:13,padding:16,textAlign:"center"}}>No open SOs</div> :
              recentSOs.map((so,i)=>(
                <div key={so.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 0",borderBottom:i<recentSOs.length-1?"1px solid #F1F5F9":"none"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:12,color:"#1E3A5F"}}>{so.id}</div>
                    <div style={{fontSize:11,color:"#64748B",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{so.customer}</div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0,marginLeft:12}}>
                    <div style={{fontSize:12,fontWeight:700}}>{fmtRM(so.amount)}</div>
                    <div style={{fontSize:10}}>
                      <span style={{padding:"1px 7px",borderRadius:99,fontSize:10,fontWeight:700,
                        background:so.status?.toUpperCase().startsWith("DONE")?"#F0FDF4":so.status?.toUpperCase().includes("PARTIAL")?"#FFFBEB":"#EFF6FF",
                        color:so.status?.toUpperCase().startsWith("DONE")?"#16a34a":so.status?.toUpperCase().includes("PARTIAL")?"#d97706":"#1d4ed8"}}>
                        {so.status||"Active"}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  );
}
