import React, { useState, useEffect } from "react";

const fmtDate = d => d ? new Date(d).toLocaleDateString("en-MY",{day:"2-digit",month:"short",year:"numeric"}) : "—";
const fmtRM   = n => `RM ${Number(n||0).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

// ─── Inline Create INV / DO Panel ─────────────────────────────────────────────
function CreateDocPanel({ entry, onDone, onClose }) {
  const [deliveryDate, setDeliveryDate] = useState(entry.deliveryDate || new Date().toISOString().slice(0,10));
  const [note,         setNote]         = useState("");
  const [creating,     setCreating]     = useState(false);
  const [result,       setResult]       = useState(null);
  const [error,        setError]        = useState("");
  const [mode,         setMode]         = useState("both"); // both | invoice | do

  // Determine what's needed
  const needsInv = !entry.invoiceNo;
  const needsDO  = !entry.doNo;
  const defaultMode = needsInv && needsDO ? "both" : needsInv ? "invoice" : "do";

  useEffect(() => { setMode(defaultMode); }, []);

  // We need items to create INV/DO — fetch from OCC intake log or use a minimal payload
  async function createDocs() {
    setCreating(true); setError("");
    try {
      // Build minimal items from what we know about this SO
      // If OCC-logged, we have item detail; if SQL-only, we create a generic line
      const items = entry.items?.length ? entry.items : [{
        itemcode: "MISC",
        description: entry.description || "Sales Order Items",
        qty: 1,
        unitprice: entry.amount || 0,
        amount: entry.amount || 0,
        uom: "UNIT",
      }];

      const payload = {
        soDocno:      entry.soNo,
        customerCode: entry.customerCode || entry.soNo, // fallback
        deliveryDate,
        items,
        note,
      };

      const created = {};

      if (mode === "both" || mode === "invoice") {
        if (!entry.invoiceNo) {
          const r = await fetch("/api/create-doc?type=invoice", {
            method: "POST", headers: {"Content-Type":"application/json"},
            body: JSON.stringify(payload),
          });
          const d = await r.json();
          if (d.error && !d.duplicate && !d.alreadyExisted) throw new Error("Invoice: " + d.error);
          created.invoiceNo = d.docno || d.details?.invoiceNo;
          created.invoiceDuplicate = d.duplicate;
          created.invoiceAlreadyExisted = d.alreadyExisted;
          created.invoiceMessage = d.message;
        }
      }

      if (mode === "both" || mode === "do") {
        if (!entry.doNo) {
          const r = await fetch("/api/create-doc?type=do", {
            method: "POST", headers: {"Content-Type":"application/json"},
            body: JSON.stringify(payload),
          });
          const d = await r.json();
          if (d.error && !d.duplicate && !d.alreadyExisted) throw new Error("DO: " + d.error);
          created.doNo = d.docno || d.details?.doNo;
          created.doDuplicate = d.duplicate;
          created.doAlreadyExisted = d.alreadyExisted;
          created.doMessage = d.message;
        }
      }

      setResult(created);
      setTimeout(() => onDone && onDone(created), 2000);
    } catch(e) {
      setError(e.message);
    }
    setCreating(false);
  }

  if (result) return (
    <div style={{background:"#F0FDF4", borderRadius:12, padding:"16px 20px", border:"1px solid #BBF7D0"}}>
      <div style={{fontWeight:800, color:"#16a34a", fontSize:14, marginBottom:8}}>✅ Documents Processed</div>
      {result.invoiceNo && (
        <div style={{fontSize:12, color:"#64748B", marginBottom:4}}>
          Invoice: <strong style={{color:"#1d4ed8"}}>{result.invoiceNo}</strong>
          {result.invoiceAlreadyExisted && <span style={{marginLeft:8, fontSize:11, color:"#d97706", fontWeight:600}}>· Already existed in SQL — now linked to OCC</span>}
          {result.invoiceDuplicate && <span style={{marginLeft:8, fontSize:11, color:"#d97706", fontWeight:600}}>· Was already created via OCC</span>}
        </div>
      )}
      {result.doNo && (
        <div style={{fontSize:12, color:"#64748B"}}>
          DO: <strong style={{color:"#7c3aed"}}>{result.doNo}</strong>
          {result.doAlreadyExisted && <span style={{marginLeft:8, fontSize:11, color:"#d97706", fontWeight:600}}>· Already existed in SQL — now linked to OCC</span>}
          {result.doDuplicate && <span style={{marginLeft:8, fontSize:11, color:"#d97706", fontWeight:600}}>· Was already created via OCC</span>}
        </div>
      )}
    </div>
  );

  return (
    <div style={{background:"#F8FAFC", borderRadius:12, padding:"16px 20px", border:"2px solid #1d4ed8"}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14}}>
        <div style={{fontWeight:800, color:"#1E3A5F", fontSize:14}}>
          Create Documents for {entry.soNo}
        </div>
        <button onClick={onClose} style={{background:"none", border:"none", cursor:"pointer", color:"#94A3B8", fontSize:18, lineHeight:1}}>✕</button>
      </div>

      {/* What needs to be created */}
      <div style={{display:"flex", gap:8, marginBottom:14}}>
        {needsInv && needsDO && (
          <div style={{display:"flex", gap:6}}>
            {[["both","Invoice + DO"],["invoice","Invoice only"],["do","DO only"]].map(([v,l])=>(
              <button key={v} onClick={()=>setMode(v)} style={{padding:"5px 12px", borderRadius:99, border:"none", cursor:"pointer", fontSize:11, fontWeight:700, background:mode===v?"#1E3A5F":"#E2E8F0", color:mode===v?"#fff":"#64748B"}}>{l}</button>
            ))}
          </div>
        )}
        {needsInv && !needsDO && <span style={{fontSize:12, color:"#d97706", fontWeight:600}}>⚠️ Missing Invoice only</span>}
        {!needsInv && needsDO  && <span style={{fontSize:12, color:"#7c3aed", fontWeight:600}}>⚠️ Missing DO only</span>}
      </div>

      {/* Customer info */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14}}>
        <div style={{background:"#fff", borderRadius:8, padding:"10px 12px", border:"1px solid #E2E8F0"}}>
          <div style={{fontSize:10, color:"#94A3B8", textTransform:"uppercase", marginBottom:3}}>Customer</div>
          <div style={{fontSize:13, fontWeight:700, color:"#0F172A"}}>{entry.customer}</div>
          {entry.amount>0 && <div style={{fontSize:11, color:"#64748B"}}>{fmtRM(entry.amount)}</div>}
        </div>
        <div>
          <div style={{fontSize:10, color:"#64748B", fontWeight:600, marginBottom:5}}>DELIVERY DATE</div>
          <input type="date" value={deliveryDate} onChange={e=>setDeliveryDate(e.target.value)}
            style={{width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid #E2E8F0", fontSize:13, outline:"none", boxSizing:"border-box"}} />
        </div>
      </div>

      {/* Customer code warning for SQL-only SOs */}
      {entry.source === "sql" && !entry.customerCode && (
        <div style={{background:"#FFFBEB", borderRadius:8, padding:"8px 12px", border:"1px solid #FCD34D", fontSize:11, color:"#92400E", marginBottom:12}}>
          ⚠️ This SO was not logged via OCC — customer code may need verification. Invoice/DO will use SO reference to match.
        </div>
      )}

      <div style={{marginBottom:12}}>
        <div style={{fontSize:10, color:"#64748B", fontWeight:600, marginBottom:5}}>NOTES (optional)</div>
        <input value={note} onChange={e=>setNote(e.target.value)} placeholder="e.g. Urgent delivery, partial shipment..."
          style={{width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid #E2E8F0", fontSize:13, outline:"none", boxSizing:"border-box"}} />
      </div>

      {error && (
        <div style={{background:"#FEF2F2", borderRadius:8, padding:"8px 12px", border:"1px solid #FECACA", fontSize:12, color:"#dc2626", marginBottom:12}}>
          {error}
        </div>
      )}

      <div style={{display:"flex", gap:8}}>
        <button onClick={createDocs} disabled={creating}
          style={{flex:1, padding:"11px", background:creating?"#CBD5E1":"#1E3A5F", border:"none", borderRadius:10, color:"#fff", fontSize:13, fontWeight:800, cursor:creating?"not-allowed":"pointer"}}>
          {creating ? "Creating..." : `Create ${mode==="both"?"Invoice + DO":mode==="invoice"?"Invoice":"DO"} →`}
        </button>
        <button onClick={onClose}
          style={{padding:"11px 16px", background:"#F1F5F9", border:"none", borderRadius:10, color:"#64748B", fontSize:13, cursor:"pointer"}}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── MAIN DOCUMENT TRACKER ────────────────────────────────────────────────────
export default function DocumentTracker() {
  const [occ,      setOcc]      = useState([]);
  const [allSOs,   setAllSOs]   = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [dos,      setDos]      = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [filter,   setFilter]   = useState("all");
  const [source,   setSource]   = useState("all");
  const [expanded, setExpanded] = useState(null); // SO number being actioned

  function load() {
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

  useEffect(()=>{ load(); }, []);

  // Cross-reference maps
  const invoiceSORef = new Set(invoices.map(iv => iv.soRef||iv.id).filter(Boolean));
  const doSORef      = new Set(dos.map(d => d.soRef).filter(Boolean));
  const invoiceMap   = {};
  invoices.forEach(iv => { if(iv.soRef) invoiceMap[iv.soRef] = iv.id; });
  const doMap = {};
  dos.forEach(d => { if(d.soRef) doMap[d.soRef] = d.id; });

  // OCC-logged entries
  const occEntries = occ.map(e => ({
    soNo:         e.docno || "—",
    customer:     e.customerName || "—",
    customerCode: e.customerCode || null,
    poRef:        e.poNumber || "—",
    amount:       e.totalAmount || 0,
    date:         e.submittedAt,
    invoiceNo:    e.invoiceNo || invoiceMap[e.docno] || null,
    doNo:         e.doNo || doMap[e.docno] || null,
    deliveryDate: e.deliveryDate || null,
    submittedBy:  e.submittedBy || "—",
    items:        e.items || [],
    source:       "occ",
  }));

  // SQL-only SOs
  const occSoNos = new Set(occ.map(e=>e.docno).filter(Boolean));
  const sqlOnlyEntries = allSOs
    .filter(so => !occSoNos.has(so.id) && so.status !== "Cancelled" && !so.status?.toUpperCase().startsWith("DONE"))
    .map(so => ({
      soNo:         so.id,
      customer:     so.customer || "—",
      customerCode: so.code || null,
      poRef:        "—",
      amount:       so.amount || 0,
      date:         so.date,
      invoiceNo:    invoiceMap[so.id] || null,
      doNo:         doMap[so.id] || null,
      deliveryDate: so.delivery || null,
      submittedBy:  "SQL Account",
      items:        [],
      source:       "sql",
      status:       so.status,
    }));

  const allEntries = [...occEntries, ...sqlOnlyEntries];

  // Apply filters
  const filtered = allEntries.filter(e => {
    const ms = !search ||
      e.soNo.toLowerCase().includes(search.toLowerCase()) ||
      e.customer.toLowerCase().includes(search.toLowerCase()) ||
      (e.invoiceNo||"").toLowerCase().includes(search.toLowerCase()) ||
      (e.doNo||"").toLowerCase().includes(search.toLowerCase());
    const src = source==="all" || e.source===source;
    const hasInv = !!e.invoiceNo;
    const hasDO  = !!e.doNo;
    if (filter==="pending_inv")  return ms && src && !hasInv;
    if (filter==="pending_do")   return ms && src && !hasDO;
    if (filter==="pending_both") return ms && src && !hasInv && !hasDO;
    if (filter==="complete")     return ms && src && hasInv && hasDO;
    return ms && src;
  });

  const stats = {
    total:       allEntries.length,
    occLogged:   occEntries.length,
    sqlOnly:     sqlOnlyEntries.length,
    pendingBoth: allEntries.filter(e=>!e.invoiceNo&&!e.doNo).length,
    pendingInv:  allEntries.filter(e=>!e.invoiceNo).length,
    pendingDO:   allEntries.filter(e=>!e.doNo).length,
    complete:    allEntries.filter(e=>e.invoiceNo&&e.doNo).length,
    outstanding: allEntries.filter(e=>!e.invoiceNo||!e.doNo).reduce((s,e)=>s+(e.amount||0),0),
  };

  if (loading) return (
    <div style={{padding:48, textAlign:"center", color:"#94A3B8", fontSize:14}}>Loading document tracker...</div>
  );

  return (
    <div style={{padding:"24px 28px", maxWidth:1280, margin:"0 auto"}}>

      {/* Header */}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12}}>
        <div>
          <div style={{fontSize:20, fontWeight:800, color:"#0F172A", marginBottom:4}}>Document Tracker</div>
          <div style={{fontSize:13, color:"#94A3B8"}}>All open SOs · Click any row missing Invoice or DO to create them instantly</div>
        </div>
        <button onClick={load} style={{padding:"8px 16px", borderRadius:8, border:"1px solid #E2E8F0", background:"#F8FAFC", color:"#1E3A5F", fontSize:12, fontWeight:700, cursor:"pointer"}}>
          🔄 Refresh
        </button>
      </div>

      {/* KPI strip — clickable filters */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:12, marginBottom:20}}>
        {[
          {label:"Total Open SOs",   value:stats.total,       color:"#1E3A5F", key:"all"},
          {label:"Missing Both",      value:stats.pendingBoth, color:"#dc2626", key:"pending_both"},
          {label:"Missing Invoice",   value:stats.pendingInv,  color:"#d97706", key:"pending_inv"},
          {label:"Missing DO",        value:stats.pendingDO,   color:"#7c3aed", key:"pending_do"},
          {label:"Complete",          value:stats.complete,    color:"#16a34a", key:"complete"},
          {label:"Outstanding Value", value:fmtRM(stats.outstanding), color:"#dc2626", key:null},
        ].map(c=>(
          <div key={c.key||c.label} onClick={()=>c.key&&setFilter(filter===c.key?"all":c.key)}
            style={{background:filter===c.key?c.color:"#fff", borderRadius:14, padding:"14px 16px",
              border:`2px solid ${filter===c.key?c.color:c.color+"33"}`,
              cursor:c.key?"pointer":"default", transition:"all 0.15s",
              boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
            <div style={{fontSize:10, color:filter===c.key?"rgba(255,255,255,0.8)":c.color, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6}}>{c.label}</div>
            <div style={{fontSize:filter===c.key?22:20, fontWeight:800, color:filter===c.key?"#fff":c.color}}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{background:"#fff", borderRadius:16, border:"1px solid #EEF2F7", overflow:"hidden"}}>
        <div style={{padding:"14px 18px", borderBottom:"1px solid #F1F5F9", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10}}>
          <div>
            <div style={{fontSize:13, fontWeight:800, color:"#0F172A"}}>
              {filter==="all"?"All SOs":filter==="pending_both"?"❌ Missing Invoice & DO":filter==="pending_inv"?"⚠️ Missing Invoice":filter==="pending_do"?"⚠️ Missing DO":"✅ Complete"}
              <span style={{fontWeight:400, color:"#94A3B8", fontSize:12, marginLeft:8}}>— {filtered.length} records</span>
            </div>
            <div style={{fontSize:11, color:"#94A3B8", marginTop:2}}>
              {stats.occLogged} via OCC · {stats.sqlOnly} from SQL · Click a row to create missing documents
            </div>
          </div>
          <div style={{display:"flex", gap:8, flexWrap:"wrap", alignItems:"center"}}>
            <div style={{display:"flex", gap:3, background:"#F1F5F9", borderRadius:99, padding:3}}>
              {[["all","All"],["occ","OCC"],["sql","SQL only"]].map(([v,l])=>(
                <button key={v} onClick={()=>setSource(v)} style={{padding:"4px 12px", borderRadius:99, border:"none", cursor:"pointer", fontSize:11, fontWeight:700, background:source===v?"#1E3A5F":"transparent", color:source===v?"#fff":"#64748B"}}>{l}</button>
              ))}
            </div>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search SO, customer..."
              style={{padding:"6px 12px", borderRadius:8, border:"1px solid #E2E8F0", fontSize:12, outline:"none", width:200}} />
          </div>
        </div>

        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%", borderCollapse:"collapse", fontSize:12}}>
            <thead>
              <tr style={{background:"#F8FAFC"}}>
                {["Source","SO Number","Customer","Amount","Date","Invoice","Delivery Order","Delivery Date","Action"].map(h=>(
                  <th key={h} style={{padding:"9px 12px", textAlign:"left", fontSize:10, color:"#94A3B8", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length===0 && (
                <tr><td colSpan={9} style={{padding:"48px", textAlign:"center", color:"#94A3B8"}}>No records found</td></tr>
              )}
              {filtered.map((e,i) => {
                const hasInv    = !!e.invoiceNo;
                const hasDO     = !!e.doNo;
                const isComplete= hasInv && hasDO;
                const isExp     = expanded === e.soNo;
                const rowBg     = isExp ? "#EFF6FF" : isComplete ? "#F0FDF4" : (!hasInv&&!hasDO) ? "#FEF2F2" : (!hasInv||!hasDO) ? "#FFFBEB" : "#fff";
                const canCreate = !isComplete;

                return (
                  <React.Fragment key={e.soNo+i}>
                    <tr style={{borderTop:"1px solid #F1F5F9", background:rowBg, cursor:canCreate?"pointer":"default"}}
                      onClick={()=>canCreate && setExpanded(isExp ? null : e.soNo)}>
                      <td style={{padding:"10px 12px"}}>
                        {e.source==="occ"
                          ? <span style={{fontSize:10, background:"#DBEAFE", color:"#1d4ed8", padding:"2px 7px", borderRadius:99, fontWeight:700}}>OCC</span>
                          : <span style={{fontSize:10, background:"#F1F5F9", color:"#64748B", padding:"2px 7px", borderRadius:99, fontWeight:700}}>SQL</span>
                        }
                      </td>
                      <td style={{padding:"10px 12px", fontWeight:800, color:"#1E3A5F"}}>{e.soNo}</td>
                      <td style={{padding:"10px 12px", fontWeight:500, maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{e.customer}</td>
                      <td style={{padding:"10px 12px", fontWeight:600}}>{e.amount ? fmtRM(e.amount) : "—"}</td>
                      <td style={{padding:"10px 12px", color:"#64748B", whiteSpace:"nowrap"}}>{fmtDate(e.date)}</td>
                      <td style={{padding:"10px 12px"}}>
                        {hasInv
                          ? <span style={{fontWeight:700, color:"#1d4ed8", fontSize:12}}>{e.invoiceNo}</span>
                          : <span style={{fontSize:10, background:"#FEF3C7", color:"#92400E", padding:"3px 8px", borderRadius:99, fontWeight:700}}>⏳ Missing</span>
                        }
                      </td>
                      <td style={{padding:"10px 12px"}}>
                        {hasDO
                          ? <span style={{fontWeight:700, color:"#7c3aed", fontSize:12}}>{e.doNo}</span>
                          : <span style={{fontSize:10, background:"#EDE9FE", color:"#6d28d9", padding:"3px 8px", borderRadius:99, fontWeight:700}}>⏳ Missing</span>
                        }
                      </td>
                      <td style={{padding:"10px 12px", color:"#64748B", whiteSpace:"nowrap"}}>{e.deliveryDate||"—"}</td>
                      <td style={{padding:"10px 12px"}}>
                        {canCreate ? (
                          <button onClick={e2=>{e2.stopPropagation(); setExpanded(isExp?null:e.soNo);}}
                            style={{padding:"5px 12px", borderRadius:8, border:"none", cursor:"pointer", fontSize:11, fontWeight:700,
                              background:isExp?"#1E3A5F":"#EFF6FF", color:isExp?"#fff":"#1d4ed8"}}>
                            {isExp ? "▲ Close" : (!hasInv&&!hasDO) ? "➕ Create Both" : !hasInv ? "➕ Create Invoice" : "➕ Create DO"}
                          </button>
                        ) : (
                          <span style={{fontSize:10, background:"#F0FDF4", color:"#16a34a", padding:"2px 8px", borderRadius:99, fontWeight:700}}>✅ Complete</span>
                        )}
                      </td>
                    </tr>

                    {/* Expanded create panel */}
                    {isExp && (
                      <tr>
                        <td colSpan={9} style={{padding:"0 16px 16px 52px", background:"#EFF6FF", borderBottom:"2px solid #BFDBFE"}}>
                          <CreateDocPanel
                            entry={e}
                            onClose={()=>setExpanded(null)}
                            onDone={()=>{ setExpanded(null); setTimeout(load, 1500); }}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SQL-only notice */}
      {stats.sqlOnly > 0 && (
        <div style={{marginTop:12, background:"#FFFBEB", borderRadius:12, padding:"12px 16px", border:"1px solid #FCD34D", fontSize:12, color:"#92400E"}}>
          ⚠️ <strong>{stats.sqlOnly} SOs from SQL Account not logged via OCC</strong> — you can still create Invoice and DO for these directly from this screen.
        </div>
      )}
    </div>
  );
}
