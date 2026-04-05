import React, { useState, useEffect } from "react";

const fmtRM = n => `RM ${Number(n||0).toLocaleString("en-MY",{minimumFractionDigits:0,maximumFractionDigits:0})}`;
const fmtRMFull = n => `RM ${Number(n||0).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const fmtPct = n => `${Number(n||0).toFixed(1)}%`;

const TARGET = 1000000; // RM 1M June target

export default function SalesGrowth({ currentUser }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [view,    setView]    = useState("tracker"); // tracker | crosssell | health | products

  useEffect(() => {
    Promise.all([
      fetch("/api/prospects?type=so").then(r=>r.json()),
    ]).then(([soData]) => {
      setData(soData);
      setLoading(false);
    }).catch(()=>setLoading(false));
  }, []);

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"60vh"}}>
      <div style={{textAlign:"center",color:"#94A3B8"}}>
        <div style={{fontSize:32,marginBottom:12}}>📊</div>
        <div>Loading sales intelligence...</div>
      </div>
    </div>
  );

  const invoices = data?.invoice || [];
  const soList   = data?.so || [];

  // Date helpers
  const now      = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd   = new Date(now.getFullYear(), now.getMonth()+1, 0);
  const daysInMonth= monthEnd.getDate();
  const dayOfMonth = now.getDate();
  const daysLeft   = daysInMonth - dayOfMonth;

  // This month invoiced
  const thisMonthIV = invoices.filter(iv => new Date(iv.date) >= monthStart);
  const invoicedMTD = thisMonthIV.reduce((s,iv)=>s+(iv.amount||0),0);
  const collectedMTD= thisMonthIV.reduce((s,iv)=>s+((iv.amount||0)-(iv.outstanding||0)),0);

  // Pipeline (active SOs)
  const pipeline = soList.reduce((s,so)=>s+(so.amount||0),0);

  // Last 3 months avg for run rate
  const last3 = invoices.filter(iv => new Date(iv.date) >= new Date(now.getFullYear(), now.getMonth()-3, 1));
  const last3Total = last3.reduce((s,iv)=>s+(iv.amount||0),0);
  const avgMonthly = last3Total / 3;

  // Daily run rate
  const currentDailyRate = dayOfMonth > 0 ? invoicedMTD / dayOfMonth : 0;
  const neededDailyRate  = daysLeft > 0 ? (TARGET - invoicedMTD - pipeline) / daysLeft : 0;

  // Gap
  const gapToTarget = Math.max(0, TARGET - invoicedMTD - pipeline);
  const onTrack     = invoicedMTD + pipeline >= TARGET * 0.5;
  const pipelinePct = Math.min(((invoicedMTD + pipeline) / TARGET) * 100, 100);

  // Customer analysis
  const custMap = {};
  invoices.forEach(iv => {
    const c = iv.customer || "Unknown";
    if (!custMap[c]) custMap[c] = { name:c, invoices:[], products:new Set(), totalAmt:0, lastOrder:null, orderDates:[] };
    custMap[c].totalAmt += iv.amount||0;
    custMap[c].invoices.push(iv);
    if (iv.date) custMap[c].orderDates.push(new Date(iv.date));
    if (!custMap[c].lastOrder || new Date(iv.date) > custMap[c].lastOrder) custMap[c].lastOrder = new Date(iv.date);
  });

  // Product analysis from SOs
  const prodMap = {};
  invoices.forEach(iv => {
    const c = iv.customer || "Unknown";
    // Use description as proxy for product category
    const desc = iv.description || "";
    if (desc && desc !== "Sales Invoice") {
      if (!prodMap[desc]) prodMap[desc] = { name:desc, customers:new Set(), revenue:0, count:0 };
      prodMap[desc].customers.add(c);
      prodMap[desc].revenue += iv.amount||0;
      prodMap[desc].count++;
    }
  });

  const customers = Object.values(custMap).sort((a,b)=>b.totalAmt-a.totalAmt);
  const topCustomers = customers.slice(0,10);

  // Customer health
  function customerHealth(cust) {
    if (!cust.orderDates.length) return { status:"unknown", daysSince:null };
    const sorted = cust.orderDates.sort((a,b)=>b-a);
    const daysSince = Math.floor((now - sorted[0]) / (1000*60*60*24));
    // Avg gap between orders
    let avgGap = 30;
    if (sorted.length >= 2) {
      const gaps = [];
      for (let i=0;i<sorted.length-1;i++) gaps.push((sorted[i]-sorted[i+1])/(1000*60*60*24));
      avgGap = gaps.reduce((s,g)=>s+g,0)/gaps.length;
    }
    const ratio = daysSince / Math.max(avgGap,7);
    if (ratio > 2.5) return { status:"critical", daysSince, avgGap: Math.round(avgGap) };
    if (ratio > 1.5) return { status:"warning",  daysSince, avgGap: Math.round(avgGap) };
    return { status:"healthy", daysSince, avgGap: Math.round(avgGap) };
  }

  // All products bought per customer (from invoice descriptions + SO items)
  // Use invoice descriptions as a proxy
  const allProductKeys = ["Meat Curry","Fish Curry","Coriander","Turmeric","Cumin","Fennel",
    "Chilli Powder","Chilli Flakes","Black Pepper","White Pepper","Kurma","Garam Masala",
    "Sambar","Five Spices","Rasam","Rava Thosai","Topokki"];

  function getCustomerProducts(cust) {
    const bought = new Set();
    cust.invoices.forEach(iv => {
      const desc = (iv.description||"").toLowerCase();
      allProductKeys.forEach(p => { if (desc.includes(p.toLowerCase())) bought.add(p); });
    });
    return bought;
  }

  const tabBtn = (v,label) => (
    <button onClick={()=>setView(v)} style={{padding:"8px 18px",borderRadius:99,border:"none",cursor:"pointer",
      fontSize:12,fontWeight:700,background:view===v?"#1E3A5F":"#F1F5F9",color:view===v?"#fff":"#64748B",whiteSpace:"nowrap"}}>
      {label}
    </button>
  );

  return (
    <div style={{padding:"24px 28px",maxWidth:1280,margin:"0 auto",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:20,fontWeight:800,color:"#0F172A",marginBottom:4}}>🎯 Sales Intelligence</div>
          <div style={{fontSize:13,color:"#94A3B8"}}>Revenue tracker · Cross-sell opportunities · Customer health · Product performance</div>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {tabBtn("tracker",  "🎯 Revenue Tracker")}
          {tabBtn("crosssell","🔁 Cross-Sell Gaps")}
          {tabBtn("health",   "❤️ Customer Health")}
          {tabBtn("products", "📦 Product Performance")}
        </div>
      </div>

      {/* ── REVENUE TRACKER ── */}
      {view==="tracker" && (
        <div>
          {/* Target progress */}
          <div style={{background:"#1E3A5F",borderRadius:20,padding:"28px 32px",marginBottom:20,color:"#fff"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
              <div>
                <div style={{fontSize:13,color:"#93C5FD",fontWeight:600,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.08em"}}>June 2026 Target</div>
                <div style={{fontSize:40,fontWeight:800}}>{fmtRM(TARGET)}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:13,color:"#93C5FD",marginBottom:4}}>{dayOfMonth} days done · {daysLeft} days left</div>
                <div style={{fontSize:28,fontWeight:800,color:onTrack?"#4ADE80":"#FCA5A5"}}>
                  {fmtPct(pipelinePct)} of target
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{height:16,background:"rgba(255,255,255,0.1)",borderRadius:99,overflow:"hidden",marginBottom:16,position:"relative"}}>
              <div style={{position:"absolute",height:"100%",width:`${Math.min((invoicedMTD/TARGET)*100,100)}%`,background:"#4ADE80",borderRadius:99,transition:"width 0.5s"}}/>
              <div style={{position:"absolute",height:"100%",left:`${Math.min((invoicedMTD/TARGET)*100,100)}%`,width:`${Math.min((pipeline/TARGET)*100,100-(invoicedMTD/TARGET)*100)}%`,background:"#FCD34D",opacity:0.8,borderRadius:99}}/>
              {/* Target marker */}
              <div style={{position:"absolute",right:0,top:-4,bottom:-4,width:3,background:"#fff",borderRadius:99}}/>
            </div>

            <div style={{display:"flex",gap:20,fontSize:12,flexWrap:"wrap"}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:10,height:10,borderRadius:2,background:"#4ADE80"}}/><span style={{color:"#D1D5DB"}}>Invoiced: <strong style={{color:"#fff"}}>{fmtRM(invoicedMTD)}</strong></span></div>
              <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:10,height:10,borderRadius:2,background:"#FCD34D"}}/><span style={{color:"#D1D5DB"}}>Pipeline (SOs): <strong style={{color:"#fff"}}>{fmtRM(pipeline)}</strong></span></div>
              <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:10,height:10,borderRadius:2,background:"rgba(255,255,255,0.2)"}}/><span style={{color:"#D1D5DB"}}>Gap remaining: <strong style={{color:gapToTarget>0?"#FCA5A5":"#4ADE80"}}>{gapToTarget>0?fmtRM(gapToTarget):"✅ On track!"}</strong></span></div>
            </div>
          </div>

          {/* KPI row */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginBottom:20}}>
            {[
              {label:"Invoiced MTD",       value:fmtRM(invoicedMTD),         color:"#1d4ed8",bg:"#EFF6FF",icon:"📋"},
              {label:"Collected MTD",      value:fmtRM(collectedMTD),        color:"#16a34a",bg:"#F0FDF4",icon:"✅"},
              {label:"Active Pipeline",    value:fmtRM(pipeline),            color:"#d97706",bg:"#FFFBEB",icon:"⏳"},
              {label:"Current Daily Rate", value:fmtRM(currentDailyRate)+"/day", color:"#7c3aed",bg:"#F5F3FF",icon:"📈"},
              {label:"Needed Daily Rate",  value:fmtRM(Math.max(0,neededDailyRate))+"/day", color:neededDailyRate>currentDailyRate?"#dc2626":"#16a34a",bg:neededDailyRate>currentDailyRate?"#FEF2F2":"#F0FDF4",icon:"🎯"},
              {label:"3-Month Avg",        value:fmtRM(avgMonthly)+"/mo",    color:"#0891b2",bg:"#E0F2FE",icon:"📊"},
            ].map(c=>(
              <div key={c.label} style={{background:c.bg,borderRadius:14,padding:"16px 18px",border:`1px solid ${c.color}22`,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                  <div style={{fontSize:10,color:c.color,textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:700}}>{c.label}</div>
                  <div style={{fontSize:18}}>{c.icon}</div>
                </div>
                <div style={{fontSize:18,fontWeight:800,color:c.color}}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Pipeline momentum */}
          <div style={{background:"#fff",borderRadius:16,padding:"20px 24px",border:"1px solid #E2E8F0",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
            <div style={{fontSize:15,fontWeight:800,color:"#0F172A",marginBottom:4}}>Pipeline Momentum</div>
            <div style={{fontSize:12,color:"#94A3B8",marginBottom:16}}>How the path to RM 1M looks right now</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10}}>
              {[
                {label:"Invoiced this month",  value:fmtRM(invoicedMTD),   color:"#16a34a",note:"Confirmed revenue"},
                {label:"Active SOs (pipeline)",value:fmtRM(pipeline),      color:"#d97706",note:"Expected to invoice"},
                {label:"Total visible",        value:fmtRM(invoicedMTD+pipeline), color:"#1d4ed8",note:"Invoiced + pipeline"},
                {label:"Still needed",         value:gapToTarget>0?fmtRM(gapToTarget):"✅ Hit!",color:gapToTarget>0?"#dc2626":"#16a34a",note:"New business required"},
              ].map(c=>(
                <div key={c.label} style={{background:"#F8FAFC",borderRadius:12,padding:"14px 16px",border:`2px solid ${c.color}33`}}>
                  <div style={{fontSize:10,color:"#94A3B8",fontWeight:600,textTransform:"uppercase",marginBottom:6}}>{c.label}</div>
                  <div style={{fontSize:20,fontWeight:800,color:c.color,marginBottom:4}}>{c.value}</div>
                  <div style={{fontSize:11,color:"#94A3B8"}}>{c.note}</div>
                </div>
              ))}
            </div>
            {gapToTarget > 0 && (
              <div style={{marginTop:16,background:"#FEF2F2",borderRadius:10,padding:"12px 16px",border:"1px solid #FECACA",fontSize:12,color:"#dc2626"}}>
                🎯 To close the RM {fmtRM(gapToTarget)} gap in {daysLeft} days, you need <strong>{fmtRM(neededDailyRate)}/day</strong> in new invoicing. Current pace is {fmtRM(currentDailyRate)}/day — <strong>{currentDailyRate >= neededDailyRate ? "on track ✅" : `${fmtRM(neededDailyRate-currentDailyRate)}/day short`}</strong>.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CROSS-SELL GAP ANALYSIS ── */}
      {view==="crosssell" && (
        <div>
          <div style={{background:"#fff",borderRadius:16,border:"1px solid #E2E8F0",overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
            <div style={{padding:"16px 20px",borderBottom:"1px solid #F1F5F9",background:"linear-gradient(135deg,#1E3A5F,#2D5A8E)"}}>
              <div style={{fontSize:15,fontWeight:800,color:"#fff",marginBottom:4}}>🔁 Cross-Sell Opportunity Map</div>
              <div style={{fontSize:12,color:"#93C5FD"}}>Products your top customers buy vs what they don't — warm conversations, not cold calls</div>
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead>
                  <tr style={{background:"#F8FAFC"}}>
                    <th style={{padding:"10px 14px",textAlign:"left",fontWeight:700,color:"#64748B",fontSize:10,textTransform:"uppercase",whiteSpace:"nowrap",minWidth:180,position:"sticky",left:0,background:"#F8FAFC",zIndex:1}}>Customer</th>
                    <th style={{padding:"10px 8px",textAlign:"center",fontWeight:700,color:"#64748B",fontSize:10,textTransform:"uppercase"}}>Revenue</th>
                    {allProductKeys.map(p=>(
                      <th key={p} style={{padding:"10px 6px",textAlign:"center",fontWeight:600,color:"#64748B",fontSize:9,whiteSpace:"nowrap",maxWidth:60,overflow:"hidden",textOverflow:"ellipsis"}} title={p}>
                        {p.length>8?p.slice(0,8)+"…":p}
                      </th>
                    ))}
                    <th style={{padding:"10px 8px",textAlign:"center",fontWeight:700,color:"#dc2626",fontSize:10,textTransform:"uppercase",whiteSpace:"nowrap"}}>Gaps</th>
                  </tr>
                </thead>
                <tbody>
                  {topCustomers.map((cust,i)=>{
                    const bought = getCustomerProducts(cust);
                    const gaps = allProductKeys.filter(p=>!bought.has(p));
                    return (
                      <tr key={cust.name} style={{borderTop:"1px solid #F1F5F9",background:i%2===0?"#FAFAFA":"#fff"}}>
                        <td style={{padding:"10px 14px",fontWeight:700,color:"#1E3A5F",position:"sticky",left:0,background:i%2===0?"#FAFAFA":"#fff",zIndex:1,whiteSpace:"nowrap",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis"}} title={cust.name}>
                          {cust.name}
                        </td>
                        <td style={{padding:"10px 8px",textAlign:"center",fontWeight:600,color:"#0F172A",whiteSpace:"nowrap"}}>
                          {fmtRM(cust.totalAmt)}
                        </td>
                        {allProductKeys.map(p=>(
                          <td key={p} style={{padding:"8px 6px",textAlign:"center"}}>
                            {bought.has(p)
                              ? <span style={{fontSize:14}}>✅</span>
                              : <span style={{fontSize:14,opacity:0.3}}>—</span>
                            }
                          </td>
                        ))}
                        <td style={{padding:"10px 8px",textAlign:"center"}}>
                          <span style={{background:"#FEF2F2",color:"#dc2626",padding:"2px 8px",borderRadius:99,fontWeight:800,fontSize:11}}>
                            {gaps.length} gaps
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{padding:"12px 20px",borderTop:"1px solid #F1F5F9",fontSize:11,color:"#94A3B8",background:"#F8FAFC"}}>
              ✅ = Currently buying · — = Not buying (opportunity) · Based on invoice history · Top 10 customers by revenue shown
            </div>
          </div>

          {/* Top opportunities */}
          <div style={{marginTop:16,background:"#fff",borderRadius:16,padding:"20px 24px",border:"1px solid #E2E8F0",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
            <div style={{fontSize:15,fontWeight:800,color:"#0F172A",marginBottom:4}}>🏆 Top Cross-Sell Opportunities This Week</div>
            <div style={{fontSize:12,color:"#94A3B8",marginBottom:16}}>Customers with most gaps — highest potential for immediate revenue</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:12}}>
              {topCustomers
                .map(cust=>({ ...cust, gaps:allProductKeys.filter(p=>!getCustomerProducts(cust).has(p)) }))
                .sort((a,b)=>b.gaps.length-a.gaps.length)
                .slice(0,6)
                .map((cust,i)=>(
                  <div key={cust.name} style={{background:"#F8FAFC",borderRadius:12,padding:"14px 16px",border:"1px solid #E2E8F0"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                      <div style={{fontWeight:700,fontSize:13,color:"#1E3A5F",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:160}} title={cust.name}>{cust.name}</div>
                      <span style={{background:"#FEF2F2",color:"#dc2626",padding:"2px 8px",borderRadius:99,fontWeight:800,fontSize:11,flexShrink:0}}>{cust.gaps.length} gaps</span>
                    </div>
                    <div style={{fontSize:11,color:"#64748B",marginBottom:8}}>Current spend: <strong>{fmtRM(cust.totalAmt)}</strong></div>
                    <div style={{fontSize:11,color:"#94A3B8",marginBottom:6}}>Not buying:</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                      {cust.gaps.slice(0,5).map(g=>(
                        <span key={g} style={{background:"#FFF7ED",color:"#d97706",padding:"2px 8px",borderRadius:99,fontSize:10,fontWeight:600}}>{g}</span>
                      ))}
                      {cust.gaps.length>5 && <span style={{color:"#94A3B8",fontSize:10}}>+{cust.gaps.length-5} more</span>}
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {/* ── CUSTOMER HEALTH ── */}
      {view==="health" && (
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:16}}>
            {[
              {label:"Healthy",  value:customers.filter(c=>customerHealth(c).status==="healthy").length,  color:"#16a34a",bg:"#F0FDF4",icon:"🟢"},
              {label:"At Risk",  value:customers.filter(c=>customerHealth(c).status==="warning").length,  color:"#d97706",bg:"#FFFBEB",icon:"🟡"},
              {label:"Critical", value:customers.filter(c=>customerHealth(c).status==="critical").length, color:"#dc2626",bg:"#FEF2F2",icon:"🔴"},
            ].map(c=>(
              <div key={c.label} style={{background:c.bg,borderRadius:14,padding:"16px 18px",border:`1px solid ${c.color}33`}}>
                <div style={{fontSize:24,marginBottom:4}}>{c.icon}</div>
                <div style={{fontSize:24,fontWeight:800,color:c.color}}>{c.value}</div>
                <div style={{fontSize:11,color:c.color,fontWeight:600}}>{c.label}</div>
              </div>
            ))}
          </div>

          <div style={{background:"#fff",borderRadius:16,border:"1px solid #E2E8F0",overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
            <div style={{padding:"14px 20px",borderBottom:"1px solid #F1F5F9"}}>
              <div style={{fontSize:15,fontWeight:800,color:"#0F172A"}}>Customer Health Monitor</div>
              <div style={{fontSize:12,color:"#94A3B8",marginTop:2}}>Based on order frequency vs historical pattern · Act before you lose them</div>
            </div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{background:"#F8FAFC"}}>
                {["Status","Customer","Total Revenue","Last Order","Days Since","Avg Frequency","Action"].map(h=>(
                  <th key={h} style={{padding:"9px 14px",textAlign:"left",fontSize:10,color:"#94A3B8",fontWeight:700,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {customers
                  .map(c=>({ ...c, health:customerHealth(c) }))
                  .sort((a,b)=>{
                    const order = {critical:0,warning:1,healthy:2,unknown:3};
                    return (order[a.health.status]||3)-(order[b.health.status]||3);
                  })
                  .slice(0,20)
                  .map((cust,i)=>{
                    const h = cust.health;
                    const color = h.status==="critical"?"#dc2626":h.status==="warning"?"#d97706":"#16a34a";
                    const bg    = h.status==="critical"?"#FEF2F2":h.status==="warning"?"#FFFBEB":i%2===0?"#FAFAFA":"#fff";
                    return (
                      <tr key={cust.name} style={{borderTop:"1px solid #F1F5F9",background:bg}}>
                        <td style={{padding:"10px 14px"}}>
                          <span style={{fontSize:16}}>{h.status==="critical"?"🔴":h.status==="warning"?"🟡":"🟢"}</span>
                        </td>
                        <td style={{padding:"10px 14px",fontWeight:700,color:"#1E3A5F",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cust.name}</td>
                        <td style={{padding:"10px 14px",fontWeight:600}}>{fmtRM(cust.totalAmt)}</td>
                        <td style={{padding:"10px 14px",color:"#64748B",whiteSpace:"nowrap"}}>{cust.lastOrder?cust.lastOrder.toLocaleDateString("en-MY",{day:"2-digit",month:"short",year:"numeric"}):"—"}</td>
                        <td style={{padding:"10px 14px",fontWeight:700,color}}>
                          {h.daysSince!==null?`${h.daysSince}d ago`:"—"}
                        </td>
                        <td style={{padding:"10px 14px",color:"#64748B"}}>
                          {h.avgGap?`every ${h.avgGap}d`:"—"}
                        </td>
                        <td style={{padding:"10px 14px"}}>
                          {h.status==="critical" && <span style={{fontSize:11,background:"#FEF2F2",color:"#dc2626",padding:"3px 10px",borderRadius:99,fontWeight:700}}>📞 Call now</span>}
                          {h.status==="warning"  && <span style={{fontSize:11,background:"#FFFBEB",color:"#d97706",padding:"3px 10px",borderRadius:99,fontWeight:700}}>💬 Follow up</span>}
                          {h.status==="healthy"  && <span style={{fontSize:11,background:"#F0FDF4",color:"#16a34a",padding:"3px 10px",borderRadius:99,fontWeight:700}}>✅ Active</span>}
                        </td>
                      </tr>
                    );
                  })
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── PRODUCT PERFORMANCE ── */}
      {view==="products" && (
        <div>
          <div style={{background:"#fff",borderRadius:16,padding:"20px 24px",border:"1px solid #E2E8F0",boxShadow:"0 1px 4px rgba(0,0,0,0.04)",marginBottom:16}}>
            <div style={{fontSize:15,fontWeight:800,color:"#0F172A",marginBottom:4}}>📦 Product Revenue Performance</div>
            <div style={{fontSize:12,color:"#94A3B8",marginBottom:20}}>Revenue by product category from invoice history · Sorted by total revenue</div>

            {/* Monthly trend by product */}
            {(() => {
              const months = [];
              for (let i=2;i>=0;i--) {
                const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
                const end = new Date(d.getFullYear(), d.getMonth()+1, 0);
                const label = d.toLocaleDateString("en-MY",{month:"short",year:"2-digit"});
                const monthIV = invoices.filter(iv=>new Date(iv.date)>=d&&new Date(iv.date)<=end);
                const total = monthIV.reduce((s,iv)=>s+(iv.amount||0),0);
                const prev = i<2 ? months[months.length-1]?.total||0 : null;
                const change = prev ? ((total-prev)/Math.max(prev,1))*100 : null;
                months.push({ label, total, change, count:monthIV.length });
              }
              return (
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:24}}>
                  {months.map((m,i)=>(
                    <div key={m.label} style={{background:"#F8FAFC",borderRadius:12,padding:"16px",border:"1px solid #E2E8F0",textAlign:"center"}}>
                      <div style={{fontSize:11,color:"#94A3B8",fontWeight:600,marginBottom:6}}>{m.label}</div>
                      <div style={{fontSize:22,fontWeight:800,color:"#1E3A5F"}}>{fmtRM(m.total)}</div>
                      <div style={{fontSize:11,color:"#64748B",marginTop:4}}>{m.count} invoices</div>
                      {m.change!==null && (
                        <div style={{fontSize:12,fontWeight:700,color:m.change>=0?"#16a34a":"#dc2626",marginTop:4}}>
                          {m.change>=0?"↑":"↓"} {Math.abs(m.change).toFixed(1)}% vs prev month
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Top customers by revenue with month-on-month */}
            <div style={{fontSize:13,fontWeight:700,color:"#0F172A",marginBottom:12}}>Top Customers by Revenue</div>
            {topCustomers.slice(0,8).map((cust,i)=>{
              const maxAmt = topCustomers[0].totalAmt;
              const pct = Math.round((cust.totalAmt/maxAmt)*100);
              const health = customerHealth(cust);
              return (
                <div key={cust.name} style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
                  <div style={{width:20,height:20,borderRadius:"50%",background:"#1E3A5F",color:"#fff",fontSize:10,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{i+1}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontWeight:600,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:200}}>{cust.name}</span>
                      <span style={{fontWeight:700,fontSize:12,flexShrink:0,marginLeft:8}}>{fmtRM(cust.totalAmt)}</span>
                    </div>
                    <div style={{height:6,background:"#F1F5F9",borderRadius:99,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${pct}%`,background:`hsl(${220-(i*20)},70%,50%)`,borderRadius:99}}/>
                    </div>
                  </div>
                  <div style={{fontSize:16,flexShrink:0}}>
                    {health.status==="critical"?"🔴":health.status==="warning"?"🟡":"🟢"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
