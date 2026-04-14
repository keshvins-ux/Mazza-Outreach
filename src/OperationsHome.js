import React, { useState, useEffect } from "react";

const fmtRM = n => `RM ${Number(n||0).toLocaleString("en-MY",{minimumFractionDigits:0,maximumFractionDigits:0})}`;
const fmtDate = d => d ? new Date(d).toLocaleDateString("en-MY",{day:"2-digit",month:"short"}) : "—";

export default function OperationsHome({ currentUser, onNavigate }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/operations?type=production").then(r=>r.json()),
      fetch("/api/operations?type=gap").then(r=>r.json()),
      fetch("/api/operations?type=purchase").then(r=>r.json()),
      fetch("/api/prospects?type=so").then(r=>r.json()),
      fetch("/api/prospects?type=po_intake_list").then(r=>r.json()),
    ]).then(([prod, gap, purchase, soData, intake]) => {
      setData({ prod, gap, purchase, soData, intake });
      setLoading(false);
    }).catch(()=>setLoading(false));
  }, []);

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"60vh"}}>
      <div style={{textAlign:"center",color:"#94A3B8"}}>
        <div style={{fontSize:32,marginBottom:12}}>⚙️</div>
        <div style={{fontSize:14}}>Loading operations...</div>
      </div>
    </div>
  );

  const products   = data?.prod?.products || [];
  const fgGap      = data?.gap?.fgGap || [];
  const rmItems    = data?.purchase?.items || [];
  const allSOs     = data?.soData?.so || [];
  const invoices   = data?.soData?.invoice || [];
  const dos        = data?.soData?.dos || [];
  const intake     = data?.intake?.list || [];

  // Today's production priorities (top 5 by urgency)
  const topJobs = products
    .filter(p=>p.scheduled!==false)
    .sort((a,b)=>{
      const da = (a.orders||[]).map(o=>o.deliveryDate).filter(Boolean).sort()[0];
      const db = (b.orders||[]).map(o=>o.deliveryDate).filter(Boolean).sort()[0];
      if (da&&db) return new Date(da)-new Date(db);
      if (da) return -1; if (db) return 1; return 0;
    }).slice(0,5);

  // Critical stock shortages
  const critical = rmItems.filter(i=>i.status==="critical").slice(0,5);
  const toBuy    = rmItems.filter(i=>i.status!=="sufficient").length;

  // SOs missing INV or DO
  const invoiceSORef = new Set(invoices.map(iv=>iv.soRef||iv.id).filter(Boolean));
  const doSORef      = new Set(dos.map(d=>d.soRef).filter(Boolean));
  const occSoNos     = new Set(intake.map(e=>e.docno).filter(Boolean));
  const missingDocs  = allSOs.filter(so=>{
    const st = (so.status||"").toUpperCase();
    return !st.startsWith("DONE") && !st.startsWith("CANCEL") &&
      (!invoiceSORef.has(so.id) || !doSORef.has(so.id));
  });
  const missingBoth = missingDocs.filter(so=>!invoiceSORef.has(so.id)&&!doSORef.has(so.id));
  const missingInv  = missingDocs.filter(so=>!invoiceSORef.has(so.id));
  const missingDO   = missingDocs.filter(so=>!doSORef.has(so.id));

  // Can't fulfil from stock
  const cantFulfil = fgGap.filter(f=>!f.canFulfil).length;

  const NavCard = ({icon, title, subtitle, badge, badgeColor, onClick, urgent}) => (
    <div onClick={onClick} style={{background:"#fff",borderRadius:16,padding:"20px 22px",border:`2px solid ${urgent?"#FECACA":"#E2E8F0"}`,cursor:"pointer",transition:"all 0.15s",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
        <div style={{fontSize:28}}>{icon}</div>
        {badge!=null && <div style={{background:badgeColor||"#EFF6FF",color:badgeColor?"#fff":"#1d4ed8",borderRadius:99,padding:"2px 10px",fontSize:12,fontWeight:800}}>{badge}</div>}
      </div>
      <div style={{fontWeight:800,fontSize:14,color:"#0F172A",marginBottom:4}}>{title}</div>
      <div style={{fontSize:12,color:"#64748B"}}>{subtitle}</div>
    </div>
  );

  return (
    <div style={{background:"#F8FAFC",minHeight:"100vh",padding:"24px 28px",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>

      {/* Header */}
      <div style={{marginBottom:24}}>
        <div style={{fontSize:22,fontWeight:800,color:"#0F172A"}}>Operations</div>
        <div style={{fontSize:13,color:"#94A3B8",marginTop:2}}>
          Good {new Date().getHours()<12?"morning":new Date().getHours()<18?"afternoon":"evening"}, {currentUser?.name} · {new Date().toLocaleDateString("en-MY",{weekday:"long",day:"numeric",month:"long"})}
        </div>
      </div>

      {/* Alert banner — critical issues */}
      {(critical.length>0||missingBoth.length>0||cantFulfil>0) && (
        <div style={{background:"#FEF2F2",borderRadius:14,padding:"14px 18px",border:"2px solid #FECACA",marginBottom:20,display:"flex",gap:20,flexWrap:"wrap",alignItems:"center"}}>
          <div style={{fontSize:16}}>🚨</div>
          <div style={{flex:1,fontSize:13,color:"#dc2626",fontWeight:600}}>
            Action needed today:
            {critical.length>0 && <span style={{marginLeft:12}}>· {critical.length} critical stock shortages</span>}
            {missingBoth.length>0 && <span style={{marginLeft:12}}>· {missingBoth.length} SOs missing Invoice & DO</span>}
            {cantFulfil>0 && <span style={{marginLeft:12}}>· {cantFulfil} products cannot be fulfilled from stock</span>}
          </div>
        </div>
      )}

      {/* KPI strip */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:24}}>
        {[
          {label:"Active SOs",       value:allSOs.length,      color:"#1E3A5F", icon:"📦"},
          {label:"Missing Docs",     value:missingDocs.length, color:missingDocs.length>0?"#dc2626":"#16a34a", icon:"📄"},
          {label:"Can't Fulfil",     value:cantFulfil,         color:cantFulfil>0?"#dc2626":"#16a34a", icon:"❌"},
          {label:"Buy Today",        value:toBuy,              color:toBuy>0?"#d97706":"#16a34a", icon:"🛒"},
          {label:"Jobs in Queue",    value:products.length,    color:"#7c3aed", icon:"🏭"},
        ].map(c=>(
          <div key={c.label} style={{background:"#fff",borderRadius:14,padding:"14px 16px",border:"1px solid #E2E8F0",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontSize:11,color:"#94A3B8",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>{c.label}</div>
              <div style={{fontSize:16}}>{c.icon}</div>
            </div>
            <div style={{fontSize:24,fontWeight:800,color:c.color}}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,marginBottom:16}}>

        {/* Today's production priorities */}
        <div style={{background:"#fff",borderRadius:16,padding:"20px 22px",border:"1px solid #E2E8F0",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div>
              <div style={{fontSize:14,fontWeight:800,color:"#0F172A"}}>🏭 Production Priorities</div>
              <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>Sorted by delivery date</div>
            </div>
            <button onClick={()=>onNavigate&&onNavigate("production","schedule")} style={{fontSize:11,color:"#1d4ed8",background:"none",border:"none",cursor:"pointer",fontWeight:700}}>See all →</button>
          </div>
          {topJobs.length===0 ? <div style={{color:"#94A3B8",fontSize:12,textAlign:"center",padding:16}}>No active jobs</div> :
            topJobs.map((p,i)=>{
              const delivery = (p.orders||[]).map(o=>o.deliveryDate).filter(Boolean).sort()[0];
              const daysLeft = delivery?Math.floor((new Date(delivery)-new Date())/(864e5)):null;
              const customers = [...new Set((p.orders||[]).map(o=>o.customer||o.customerName).filter(Boolean))];
              return (
                <div key={p.itemCode} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"8px 0",borderBottom:i<topJobs.length-1?"1px solid #F1F5F9":"none"}}>
                  <div style={{width:22,height:22,borderRadius:"50%",background:daysLeft!==null&&daysLeft<0?"#EF4444":daysLeft!==null&&daysLeft<=3?"#F59E0B":"#1E3A5F",color:"#fff",fontSize:10,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>{i+1}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:12,color:"#0F172A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.description}</div>
                    <div style={{fontSize:11,color:"#64748B",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{customers[0]||"—"}</div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    {daysLeft!==null ? (
                      <span style={{fontSize:10,fontWeight:700,color:daysLeft<0?"#dc2626":daysLeft<=3?"#d97706":"#16a34a"}}>
                        {daysLeft<0?`${Math.abs(daysLeft)}d late`:daysLeft===0?"Today":`${daysLeft}d`}
                      </span>
                    ) : <span style={{fontSize:10,color:"#94A3B8"}}>No date</span>}
                  </div>
                </div>
              );
            })
          }
        </div>

        {/* Document actions needed */}
        <div style={{background:"#fff",borderRadius:16,padding:"20px 22px",border:"1px solid #E2E8F0",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div>
              <div style={{fontSize:14,fontWeight:800,color:"#0F172A"}}>📄 Document Actions</div>
              <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>SOs needing Invoice or DO</div>
            </div>
            <button onClick={()=>onNavigate&&onNavigate("po","tracker")} style={{fontSize:11,color:"#1d4ed8",background:"none",border:"none",cursor:"pointer",fontWeight:700}}>See all →</button>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            {[
              {label:"Missing Both",    count:missingBoth.length, color:"#dc2626", bg:"#FEF2F2"},
              {label:"Missing Invoice", count:missingInv.length,  color:"#d97706", bg:"#FFFBEB"},
              {label:"Missing DO",      count:missingDO.length,   color:"#7c3aed", bg:"#F5F3FF"},
            ].map(s=>(
              <div key={s.label} style={{flex:1,background:s.bg,borderRadius:10,padding:"8px 10px",textAlign:"center"}}>
                <div style={{fontSize:20,fontWeight:800,color:s.color}}>{s.count}</div>
                <div style={{fontSize:10,color:s.color,fontWeight:600,marginTop:2}}>{s.label}</div>
              </div>
            ))}
          </div>
          {missingBoth.slice(0,4).map((so,i)=>(
            <div key={so.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:i<Math.min(missingBoth.length,4)-1?"1px solid #F1F5F9":"none"}}>
              <div>
                <div style={{fontWeight:700,fontSize:12,color:"#1E3A5F"}}>{so.id}</div>
                <div style={{fontSize:11,color:"#64748B",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:140}}>{so.customer}</div>
              </div>
              <span style={{fontSize:10,background:"#FEF2F2",color:"#dc2626",padding:"2px 8px",borderRadius:99,fontWeight:700}}>No INV + DO</span>
            </div>
          ))}
          {missingBoth.length===0 && <div style={{color:"#16a34a",fontSize:12,textAlign:"center",padding:12,fontWeight:700}}>✅ All SOs have Invoice & DO</div>}
        </div>

        {/* Critical stock */}
        <div style={{background:"#fff",borderRadius:16,padding:"20px 22px",border:`1px solid ${critical.length>0?"#FECACA":"#E2E8F0"}`,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div>
              <div style={{fontSize:14,fontWeight:800,color:"#0F172A"}}>🛒 Purchase Today</div>
              <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>{toBuy} raw materials to order</div>
            </div>
            <button onClick={()=>onNavigate&&onNavigate("production","purchase")} style={{fontSize:11,color:"#1d4ed8",background:"none",border:"none",cursor:"pointer",fontWeight:700}}>See all →</button>
          </div>
          {critical.length===0 && toBuy===0 ? (
            <div style={{color:"#16a34a",fontSize:12,textAlign:"center",padding:12,fontWeight:700}}>✅ Stock levels sufficient</div>
          ) : (
            critical.slice(0,5).map((item,i)=>(
              <div key={item.code} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:i<critical.length-1?"1px solid #F1F5F9":"none"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:12,color:"#0F172A"}}><code style={{background:"#FEF2F2",padding:"1px 5px",borderRadius:4,color:"#dc2626"}}>{item.code}</code></div>
                  <div style={{fontSize:11,color:"#64748B",marginTop:2}}>Need: {item.netBuy?.toFixed(1)} {item.uom} · Stock: {item.onHand?.toFixed(1)}</div>
                </div>
                <span style={{fontSize:10,background:"#FEF2F2",color:"#dc2626",padding:"2px 8px",borderRadius:99,fontWeight:700}}>🚨 Critical</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick navigation */}
      <div style={{marginTop:8}}>
        <div style={{fontSize:12,color:"#94A3B8",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>Quick Navigate</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10}}>
          {[
            {icon:"🖥️", label:"Floor Display",      sub:"Production floor",        tab:"production",  sub2:"floor"},
            {icon:"📦", label:"Gap Analysis",        sub:"Stock vs demand",         tab:"production",  sub2:"gap"},
            {icon:"🛒", label:"Purchase List",       sub:"What to buy",             tab:"production",  sub2:"purchase"},
            {icon:"📥", label:"Log GRN",             sub:"Record goods received",   tab:"procurement"},
            {icon:"📋", label:"Document Tracker",    sub:"Missing INV & DO",        tab:"po",   sub2:"tracker"},
            {icon:"⚙️", label:"Capacity Planner",    sub:"Machine utilisation",     tab:"production",  sub2:"capacity"},
          ].map(n=>(
            <button key={n.label} onClick={()=>onNavigate&&onNavigate(n.tab,n.sub2)}
              style={{background:"#fff",borderRadius:12,padding:"14px 16px",border:"1px solid #E2E8F0",cursor:"pointer",textAlign:"left",display:"flex",gap:10,alignItems:"center"}}>
              <div style={{fontSize:22}}>{n.icon}</div>
              <div>
                <div style={{fontWeight:700,fontSize:12,color:"#0F172A"}}>{n.label}</div>
                <div style={{fontSize:11,color:"#94A3B8"}}>{n.sub}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
