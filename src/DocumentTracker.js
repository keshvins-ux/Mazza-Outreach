import React, { useState, useEffect } from "react";

const fmtDate = d => d ? new Date(d).toLocaleDateString("en-MY",{day:"2-digit",month:"short",year:"numeric"}) : "—";
const fmtRM   = n => `RM ${Number(n||0).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

export default function DocumentTracker() {
  const [occ,      setOcc]      = useState([]);   // POs logged via OCC
  const [allSOs,   setAllSOs]   = useState([]);   // All SOs from SQL
  const [invoices, setInvoices] = useState([]);   // All invoices from SQL
  const [dos,      setDos]      = useState([]);   // All DOs from SQL
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [filter,   setFilter]   = useState("all");
  const [source,   setSource]   = useState("all"); // all | occ | sql

  useEffect(() => {
    Promise.all([
      fetch("/api/prospects?type=po_intake_list").then(r=>r.json()),
      fetch("/api/prospects?type=so").then(r=>r.json()),
    ]).then(([occ, sqlData]) => {
      setOcc(occ.list || []);
      setAllSOs(sqlData.so || []);
      setInvoices(sqlData.invoice || []);
      setDos(sqlData.dos || []);
      setLoading(false);
    }).catch(()=>setLoading(false));
  }, []);

  function refresh() {
    setLoading(true);
    Promise.all([
      fetch("/api/prospects?type=po_intake_list").then(r=>r.json()),
      fetch("/api/prospects?type=so").then(r=>r.json()),
    ]).then(([occ, sqlData]) => {
      setOcc(occ.list || []);
      setAllSOs(sqlData.so || []);
      setInvoices(sqlData.invoice || []);
      setDos(sqlData.dos || []);
      setLoading(false);
    }).catch(()=>setLoading(false));
  }

  // Build a lookup: SO number → has invoice, has DO
  const invoiceSORef = new Set(invoices.map(iv => iv.soRef || iv.id).filter(Boolean));
  const doSORef      = new Set(dos.map(d => d.soRef).filter(Boolean));

  // Map of SO number → invoice doc number
  const invoiceMap = {};
  invoices.forEach(iv => { if (iv.soRef) invoiceMap[iv.soRef] = iv.id; });
  const doMap = {};
  dos.forEach(d => { if (d.soRef) doMap[d.soRef] = d.id; });

  // OCC-logged entries (have full detail)
  const occEntries = occ.map(e => ({
    soNo:         e.docno || "—",
    customer:     e.customerName || "—",
    poRef:        e.poNumber || "—",
    amount:       e.totalAmount || 0,
    date:         e.submittedAt,
    invoiceNo:    e.invoiceNo || invoiceMap[e.docno] || null,
    doNo:         e.doNo || doMap[e.docno] || null,
    invoicedAt:   e.invoicedAt || null,
    doCreatedAt:  e.doCreatedAt || null,
    deliveryDate: e.deliveryDate || null,
    submittedBy:  e.submittedBy || "—",
    source:       "occ",
  }));

  // SQL-only SOs — in SQL but NOT logged via OCC
  const occSoNos = new Set(occ.map(e => e.docno).filter(Boolean));
  const sqlOnlyEntries = allSOs
    .filter(so => !occSoNos.has(so.id) && so.status !== "Cancelled" && !so.status?.toUpperCase().startsWith("DONE"))
    .map(so => ({
      soNo:         so.id,
      customer:     so.customer || "—",
      poRef:        "—",
      amount:       so.amount || 0,
      date:         so.date,
      invoiceNo:    invoiceMap[so.id] || null,
      doNo:         doMap[so.id] || null,
      invoicedAt:   null,
      doCreatedAt:  null,
      deliveryDate: so.delivery || null,
      submittedBy:  "SQL Account",
      source:       "sql",
      status:       so.status,
    }));

  // Combine
  const allEntries = [...occEntries, ...sqlOnlyEntries];

  // Filter
  const filtered = allEntries.filter(e => {
    const ms = !search ||
      e.soNo.toLowerCase().includes(search.toLowerCase()) ||
      e.customer.toLowerCase().includes(search.toLowerCase()) ||
      (e.invoiceNo||"").toLowerCase().includes(search.toLowerCase()) ||
      (e.doNo||"").toLowerCase().includes(search.toLowerCase());
    const src = source === "all" || e.source === source;
    const hasInv = !!e.invoiceNo;
    const hasDO  = !!e.doNo;
    if (filter==="pending_inv") return ms && src && !hasInv;
    if (filter==="pending_do")  return ms && src && !hasDO;
    if (filter==="pending_both")return ms && src && !hasInv && !hasDO;
    if (filter==="complete")    return ms && src && hasInv && hasDO;
    return ms && src;
  });

  const stats = {
    total:        allEntries.length,
    occLogged:    occEntries.length,
    sqlOnly:      sqlOnlyEntries.length,
    pendingInv:   allEntries.filter(e=>!e.invoiceNo).length,
    pendingDO:    allEntries.filter(e=>!e.doNo).length,
    pendingBoth:  allEntries.filter(e=>!e.invoiceNo&&!e.doNo).length,
    complete:     allEntries.filter(e=>e.invoiceNo&&e.doNo).length,
    outstandingAmt: allEntries.filter(e=>!e.invoiceNo||!e.doNo).reduce((s,e)=>s+(e.amount||0),0),
  };

  if (loading) return (
    <div style={{padding:48, textAlign:"center", color:"#94A3B8", fontSize:14}}>Loading document tracker...</div>
  );

  return (
    <div style={{padding:"24px 28px", maxWidth:1280, margin:"0 auto"}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12}}>
        <div>
          <div style={{fontSize:20, fontWeight:800, color:"#0F172A", marginBottom:4}}>Document Tracker</div>
          <div style={{fontSize:13, color:"#94A3B8"}}>
            All open SOs from SQL Account · Cross-referenced against Invoices and DOs
          </div>
        </div>
        <button onClick={refresh} style={{padding:"8px 16px", borderRadius:8, border:"1px solid #E2E8F0", background:"#F8FAFC", color:"#1E3A5F", fontSize:12, fontWeight:700, cursor:"pointer"}}>
          🔄 Refresh
        </button>
      </div>

      {/* KPI strip */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:12, marginBottom:20}}>
        {[
          {label:"Total Open SOs",    value:stats.total,        color:"#1E3A5F", bg:"#EFF6FF", key:"all"},
          {label:"Missing Both",       value:stats.pendingBoth,  color:"#dc2626", bg:"#FEF2F2", key:"pending_both"},
          {label:"Missing Invoice",    value:stats.pendingInv,   color:"#d97706", bg:"#FFFBEB", key:"pending_inv"},
          {label:"Missing DO",         value:stats.pendingDO,    color:"#7c3aed", bg:"#F5F3FF", key:"pending_do"},
          {label:"Fully Complete",     value:stats.complete,     color:"#16a34a", bg:"#F0FDF4", key:"complete"},
          {label:"Outstanding Value",  value:fmtRM(stats.outstandingAmt), color:"#dc2626", bg:"#FEF2F2", key:null},
        ].map(c=>(
          <div key={c.key||c.label}
            onClick={()=>c.key&&setFilter(filter===c.key?"all":c.key)}
            style={{background:filter===c.key?c.color:c.bg, borderRadius:14, padding:"14px 16px",
              border:`2px solid ${filter===c.key?c.color:c.color+"33"}`, cursor:c.key?"pointer":"default", transition:"all 0.15s"}}>
            <div style={{fontSize:10, color:filter===c.key?"rgba(255,255,255,0.8)":c.color, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6}}>{c.label}</div>
            <div style={{fontSize:filter===c.key?22:20, fontWeight:800, color:filter===c.key?"#fff":c.color}}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Source + filter bar */}
      <div style={{background:"#fff", borderRadius:16, border:"1px solid #EEF2F7", overflow:"hidden"}}>
        <div style={{padding:"14px 18px", borderBottom:"1px solid #F1F5F9", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10}}>
          <div>
            <div style={{fontSize:13, fontWeight:800, color:"#0F172A"}}>
              {filter==="all"?"All SOs":filter==="pending_both"?"❌ Missing Invoice & DO":filter==="pending_inv"?"⚠️ Missing Invoice":filter==="pending_do"?"⚠️ Missing DO":"✅ Fully Complete"}
              <span style={{fontWeight:400, color:"#94A3B8", fontSize:12, marginLeft:8}}>— {filtered.length} records</span>
            </div>
            <div style={{fontSize:11, color:"#94A3B8", marginTop:2}}>
              {stats.occLogged} logged via OCC · {stats.sqlOnly} from SQL Account (not in OCC)
            </div>
          </div>
          <div style={{display:"flex", gap:8, alignItems:"center", flexWrap:"wrap"}}>
            {/* Source filter */}
            <div style={{display:"flex", gap:4, background:"#F1F5F9", borderRadius:99, padding:3}}>
              {[["all","All"],["occ","OCC only"],["sql","SQL only"]].map(([v,l])=>(
                <button key={v} onClick={()=>setSource(v)} style={{padding:"4px 12px", borderRadius:99, border:"none", cursor:"pointer", fontSize:11, fontWeight:700, background:source===v?"#1E3A5F":"transparent", color:source===v?"#fff":"#64748B"}}>{l}</button>
              ))}
            </div>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search SO, customer, invoice, DO..."
              style={{padding:"6px 12px", borderRadius:8, border:"1px solid #E2E8F0", fontSize:12, outline:"none", width:240}} />
          </div>
        </div>

        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%", borderCollapse:"collapse", fontSize:12}}>
            <thead>
              <tr style={{background:"#F8FAFC"}}>
                {["Source","Customer","PO Ref","SO Number","Date","Amount","Invoice","DO","Delivery","By"].map(h=>(
                  <th key={h} style={{padding:"9px 12px", textAlign:"left", fontSize:10, color:"#94A3B8", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length===0 && (
                <tr><td colSpan={10} style={{padding:"48px", textAlign:"center", color:"#94A3B8"}}>No records found</td></tr>
              )}
              {filtered.map((e,i) => {
                const hasInv = !!e.invoiceNo;
                const hasDO  = !!e.doNo;
                const isComplete = hasInv && hasDO;
                const isSQLOnly  = e.source === "sql";
                return (
                  <tr key={i} style={{borderTop:"1px solid #F1F5F9",
                    background: isComplete?"#F0FDF4" : (!hasInv&&!hasDO)?"#FEF2F2" : (!hasInv||!hasDO)?"#FFFBEB" : "#fff"}}>
                    <td style={{padding:"10px 12px"}}>
                      {isSQLOnly
                        ? <span style={{fontSize:10, background:"#F1F5F9", color:"#64748B", padding:"2px 7px", borderRadius:99, fontWeight:700}}>SQL</span>
                        : <span style={{fontSize:10, background:"#DBEAFE", color:"#1d4ed8", padding:"2px 7px", borderRadius:99, fontWeight:700}}>OCC</span>
                      }
                    </td>
                    <td style={{padding:"10px 12px", fontWeight:600, maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{e.customer}</td>
                    <td style={{padding:"10px 12px", color:"#64748B"}}>{e.poRef}</td>
                    <td style={{padding:"10px 12px", fontWeight:700, color:"#1E3A5F"}}>{e.soNo}</td>
                    <td style={{padding:"10px 12px", color:"#64748B", whiteSpace:"nowrap"}}>{fmtDate(e.date)}</td>
                    <td style={{padding:"10px 12px", fontWeight:600, color:"#0F172A"}}>{e.amount?fmtRM(e.amount):"—"}</td>
                    <td style={{padding:"10px 12px"}}>
                      {hasInv
                        ? <span style={{fontWeight:700, color:"#1d4ed8"}}>{e.invoiceNo}</span>
                        : <span style={{fontSize:10, background:"#FEF3C7", color:"#92400E", padding:"3px 8px", borderRadius:99, fontWeight:700}}>⏳ Missing</span>
                      }
                    </td>
                    <td style={{padding:"10px 12px"}}>
                      {hasDO
                        ? <span style={{fontWeight:700, color:"#7c3aed"}}>{e.doNo}</span>
                        : <span style={{fontSize:10, background:"#EDE9FE", color:"#6d28d9", padding:"3px 8px", borderRadius:99, fontWeight:700}}>⏳ Missing</span>
                      }
                    </td>
                    <td style={{padding:"10px 12px", color:"#64748B", whiteSpace:"nowrap"}}>{e.deliveryDate||"—"}</td>
                    <td style={{padding:"10px 12px", color:"#64748B", fontSize:11}}>{e.submittedBy}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SQL-only notice */}
      {stats.sqlOnly > 0 && (
        <div style={{marginTop:12, background:"#FFFBEB", borderRadius:12, padding:"12px 16px", border:"1px solid #FCD34D", fontSize:12, color:"#92400E"}}>
          <strong>⚠️ {stats.sqlOnly} SOs found in SQL Account that were not logged via OCC</strong> — these may be missing Invoice or DO.
          Filter by "SQL only" to see them and take action.
        </div>
      )}

      <div style={{marginTop:8, fontSize:11, color:"#94A3B8"}}>
        SO data from SQL Account sync · Invoice and DO cross-referenced by SO number · Updated every 30 mins
      </div>
    </div>
  );
}
